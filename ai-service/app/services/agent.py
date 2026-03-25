"""
Core agentic loop for CloAgent AI assistant.

Flow:
1. Load conversation history from DB
2. Build system prompt (general or contact-scoped)
3. Call Claude with tool-calling in a loop until no more tool use
4. Stream the final text response word by word via SSE
5. Save assistant message to DB
"""
import asyncio
import json
import re
from datetime import date, timedelta
from typing import AsyncGenerator

import anthropic
import psycopg2.extras

from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
from app.database import get_conn, run_query
from app.tools import TOOL_DEFINITIONS, READ_TOOLS, WRITE_TOOLS, execute_read_tool, queue_write_tool

MODEL = ANTHROPIC_MODEL
MAX_TOOL_ROUNDS = 5  # safety limit


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _load_history(conversation_id: str, agent_id: str) -> tuple[list, dict | None, dict | None]:
    """Returns (messages, agent_row, conversation_row)."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Last 20 messages
        cur.execute(
            """SELECT m.role, m.content FROM messages m
               JOIN conversations cv ON cv.id = m.conversation_id
               WHERE cv.agent_id = %s AND m.conversation_id = %s
               ORDER BY m.created_at ASC LIMIT 20""",
            (agent_id, conversation_id),
        )
        messages = [{"role": r["role"], "content": r["content"]} for r in cur.fetchall()]

        # Agent info
        cur.execute("SELECT id, name, email FROM users WHERE id = %s", (agent_id,))
        agent = cur.fetchone()

        # Conversation (may be contact-scoped)
        cur.execute(
            "SELECT id, contact_id FROM conversations WHERE id = %s AND agent_id = %s",
            (conversation_id, agent_id),
        )
        conversation = cur.fetchone()

        return messages, dict(agent) if agent else None, dict(conversation) if conversation else None


def _load_contact_context(contact_id: str, agent_id: str) -> str:
    """Build a contact context string for the system prompt."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT first_name, last_name, email, phone, source FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        c = cur.fetchone()
        if not c:
            return ""

        cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        bp = cur.fetchone()

        cur.execute(
            "SELECT type, body, created_at FROM activities WHERE contact_id = %s AND agent_id = %s ORDER BY created_at DESC LIMIT 5",
            (contact_id, agent_id),
        )
        activities = cur.fetchall()

        lines = [
            f"\n\n## Current Contact Context",
            f"Name: {c['first_name']} {c['last_name']}",
            f"Email: {c['email'] or 'N/A'} | Phone: {c['phone'] or 'N/A'} | Source: {c['source'] or 'N/A'}",
        ]
        if bp:
            lines.append(
                f"Buyer Profile: Budget ${bp['budget_min']:,.0f}–${bp['budget_max']:,.0f}, "
                f"{bp['bedrooms']}BR/{bp['bathrooms']}BA, "
                f"Areas: {', '.join(bp['locations'] or [])}, "
                f"Pre-approved: {bp['pre_approved']}, Timeline: {bp['timeline']}"
            )
        if activities:
            lines.append("Recent Activities:")
            for a in activities:
                lines.append(f"  - [{a['type']}] {a['body']} ({a['created_at'].strftime('%b %d')})")

        # Recent SMS messages
        cur.execute(
            "SELECT body, direction, sent_at FROM sms_messages WHERE contact_id = %s AND agent_id = %s ORDER BY sent_at DESC LIMIT 5",
            (contact_id, agent_id),
        )
        sms_messages = cur.fetchall()
        if sms_messages:
            lines.append("Recent SMS:")
            for s in sms_messages:
                direction = "Sent" if s["direction"] == "outbound" else "Received"
                lines.append(f"  - [{direction}] {s['body'][:80]} ({s['sent_at'].strftime('%b %d')})")

        # Recent call transcript summaries
        cur.execute(
            """SELECT ct.ai_summary, ct.created_at, cl.direction, cl.duration
               FROM call_transcripts ct
               JOIN call_logs cl ON cl.id = ct.call_id
               WHERE cl.contact_id = %s AND cl.agent_id = %s AND ct.ai_summary IS NOT NULL
               ORDER BY ct.created_at DESC LIMIT 3""",
            (contact_id, agent_id),
        )
        call_summaries = cur.fetchall()
        if call_summaries:
            lines.append("Recent Call Summaries:")
            for cs in call_summaries:
                direction = "Outbound" if cs["direction"] == "outbound" else "Inbound"
                dur = cs["duration"] or 0
                lines.append(f"  - [{direction}, {dur}s, {cs['created_at'].strftime('%b %d')}] {cs['ai_summary'][:200]}")

        return "\n".join(lines)


def _save_assistant_message(conversation_id: str, agent_id: str, content: str, tool_calls: list) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        tc_json = json.dumps(tool_calls) if tool_calls else None
        cur.execute(
            """INSERT INTO messages (conversation_id, role, content, tool_calls)
               VALUES (%s, 'assistant', %s, %s)""",
            (conversation_id, content, tc_json),
        )


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

def _build_system_prompt(agent_name: str, contact_context: str = "") -> str:
    today = date.today()
    tomorrow = today + timedelta(days=1)
    day_name = today.strftime("%A")  # e.g. "Monday"

    base = (
        f"You are CloAgent AI, a smart CRM assistant for real estate agent {agent_name}. "
        f"Today is {day_name}, {today.isoformat()}. Tomorrow is {tomorrow.isoformat()}. "
        "You have full access to their CRM data and can do everything they can do: "
        "search and view contacts, manage buyer profiles, create/edit/delete deals, "
        "log activities, move deals through pipeline stages, and view analytics.\n\n"
        "IMPORTANT GUIDELINES:\n"
        "- Be action-oriented. When the user's intent is clear, use your tools immediately — "
        "do NOT ask clarifying questions you can answer yourself.\n"
        "- Resolve relative dates automatically: 'tomorrow' = tomorrow's date, 'next Monday' = "
        "the next upcoming Monday, 'in 3 days' = today + 3, 'end of week' = this Friday, etc. "
        "Never ask the user to provide a date you can compute.\n"
        "- When asked to create a task, pick reasonable defaults: priority 'medium' unless "
        "the user specifies urgency, due date 'tomorrow' if not specified.\n"
        "- Every new contact automatically gets a deal in the 'Lead' pipeline stage. "
        "If the user mentions a different stage (e.g. 'contacted', 'touring'), use update_deal "
        "to move their deal to that stage right after creating the contact.\n"
        "- Use your tools to answer questions with real data — never make up numbers.\n"
        "- For destructive actions (deleting contacts or deals), always confirm with the user first "
        "and warn them about what data will be lost.\n"
        "- Be concise. Skip preamble. Lead with action."
        "\n- When the agent has Twilio configured, you can search and send text messages, and initiate outbound phone calls. "
        "Use initiate_call to start a call, search_call_logs to find past calls, and get_call_history for a contact's call history. "
        "Use get_call_transcript to read what was discussed on a specific call, and search_call_transcripts to find calls where a topic was mentioned. "
        "Use send_sms for quick follow-ups and appointment confirmations."
    )
    return base + contact_context


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

async def run_agent(
    conversation_id: str,
    agent_id: str,
    user_message: str,
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-formatted strings.
    Caller wraps this in a StreamingResponse.
    """
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    # Load history and context from DB
    history, agent_row, conversation_row = await run_query(
        lambda: _load_history(conversation_id, agent_id)
    )

    agent_name = agent_row["name"] if agent_row else "Agent"
    contact_context = ""

    if conversation_row and conversation_row.get("contact_id"):
        contact_context = await run_query(
            lambda: _load_contact_context(conversation_row["contact_id"], agent_id)
        )

    system = _build_system_prompt(agent_name, contact_context)
    messages = history + [{"role": "user", "content": user_message}]

    tool_calls_log: list = []
    final_text = ""

    for _round in range(MAX_TOOL_ROUNDS + 1):
        response = await client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=system,
            messages=messages,
            tools=TOOL_DEFINITIONS,
        )

        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
        text_blocks = [b for b in response.content if b.type == "text"]

        if not tool_use_blocks:
            # Final response — stream text word by word
            final_text = text_blocks[0].text if text_blocks else ""
            tokens = re.split(r"(\s+)", final_text)
            for token in tokens:
                if token:
                    yield sse({"type": "text", "content": token})
                    await asyncio.sleep(0)  # yield to event loop for flush
            break

        # Execute tool use blocks
        tool_results = []
        for tb in tool_use_blocks:
            tool_name = tb.name
            tool_input = tb.input if isinstance(tb.input, dict) else {}

            yield sse({"type": "tool_call", "name": tool_name, "status": "running"})

            if tool_name in WRITE_TOOLS:
                confirmation = queue_write_tool(tool_name, tool_input, agent_id)
                yield sse({"type": "confirmation", **confirmation})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps({"status": "pending_confirmation", "pending_id": confirmation["pending_id"]}),
                })
            elif tool_name in READ_TOOLS:
                result = await execute_read_tool(tool_name, tool_input, agent_id)
                yield sse({"type": "tool_result", "name": tool_name, "result": result})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps(result, default=str),
                })
            else:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps({"error": f"Unknown tool: {tool_name}"}),
                })

            tool_calls_log.append({"tool": tool_name, "input": tool_input})

        # If any write tool was queued for confirmation, stop the loop.
        # Don't feed "pending_confirmation" back to Claude — it would try to
        # work around the pending state and create duplicates.
        has_confirmation = any(
            isinstance(r.get("content"), str) and "pending_confirmation" in r["content"]
            for r in tool_results
        )
        if has_confirmation:
            # Stream a brief note so the user sees something while confirming
            note = "Please confirm or cancel the action above."
            final_text = note
            for token in re.split(r"(\s+)", note):
                if token:
                    yield sse({"type": "text", "content": token})
                    await asyncio.sleep(0)
            break

        # Add assistant turn + tool results to message history
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    # Save assistant message to DB
    await run_query(lambda: _save_assistant_message(conversation_id, agent_id, final_text, tool_calls_log))

    yield "data: [DONE]\n\n"
