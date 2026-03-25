"""
Core agentic loop for CloAgent AI assistant.

Flow:
1. Load conversation history from DB
2. Resolve entities from user message (intelligence pre-processor)
3. Build system prompt with resolved context
4. Call Claude with tool-calling in a loop until no more tool use
5. Stream the final text response word by word via SSE
6. Save assistant message to DB
"""
import asyncio
import json
import logging
import re
from typing import AsyncGenerator

import anthropic
import psycopg2.extras

from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
from app.database import get_conn, run_query
from app.services.intelligence import resolve_entities, enrich_context
from app.services.prompt_builder import build_system_prompt
from app.tools import (
    TOOL_DEFINITIONS, READ_TOOLS, AUTO_EXECUTE_TOOLS, WRITE_TOOLS,
    execute_tool, queue_write_tool,
)

logger = logging.getLogger(__name__)

MODEL = ANTHROPIC_MODEL
MAX_TOOL_ROUNDS = 5


def sse(event: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(event, default=str)}\n\n"


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _load_history(conversation_id: str, agent_id: str) -> tuple[list, dict | None, dict | None]:
    """Returns (messages, agent_row, conversation_row)."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """SELECT m.role, m.content FROM messages m
               JOIN conversations cv ON cv.id = m.conversation_id
               WHERE cv.agent_id = %s AND m.conversation_id = %s
               ORDER BY m.created_at ASC LIMIT 20""",
            (agent_id, conversation_id),
        )
        messages = [{"role": r["role"], "content": r["content"]} for r in cur.fetchall()]

        cur.execute("SELECT id, name, email FROM users WHERE id = %s", (agent_id,))
        agent = cur.fetchone()

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
            "\n\n## Current Contact Context",
            f"Name: {c['first_name']} {c['last_name']}",
            f"Email: {c['email'] or 'N/A'} | Phone: {c['phone'] or 'N/A'} | Source: {c['source'] or 'N/A'}",
        ]
        if bp:
            lines.append(
                f"Buyer Profile: Budget ${bp['budget_min']:,.0f}-${bp['budget_max']:,.0f}, "
                f"{bp['bedrooms']}BR/{bp['bathrooms']}BA, "
                f"Areas: {', '.join(bp['locations'] or [])}, "
                f"Pre-approved: {bp['pre_approved']}, Timeline: {bp['timeline']}"
            )
        if activities:
            lines.append("Recent Activities:")
            for a in activities:
                lines.append(f"  - [{a['type']}] {a['body']} ({a['created_at'].strftime('%b %d')})")

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
# Main agent loop
# ---------------------------------------------------------------------------

async def run_agent(
    conversation_id: str,
    agent_id: str,
    user_message: str,
) -> AsyncGenerator[str, None]:
    """Async generator yielding SSE-formatted strings."""
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    # Load history + agent/conversation metadata
    history, agent_row, conversation_row = await run_query(
        lambda: _load_history(conversation_id, agent_id)
    )

    agent_name = agent_row["name"] if agent_row else "Agent"

    # Contact-scoped conversation context
    contact_context = ""
    if conversation_row and conversation_row.get("contact_id"):
        contact_context = await run_query(
            lambda: _load_contact_context(conversation_row["contact_id"], agent_id)
        )

    # Intelligence pre-processor: resolve entities BEFORE the LLM call
    entity_ctx = await resolve_entities(user_message, agent_id)
    entity_context_str = ""
    if entity_ctx.contacts:
        entity_context_str = await run_query(
            lambda: enrich_context(entity_ctx, agent_id)
        )
        logger.info(
            "Resolved %d entities: %s",
            len(entity_ctx.contacts),
            [f"{e.first_name} {e.last_name}" for e in entity_ctx.contacts],
        )

    system = build_system_prompt(
        agent_name=agent_name,
        contact_context=contact_context,
        entity_context=entity_context_str,
    )
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
            # Final response — stream text
            final_text = text_blocks[0].text if text_blocks else ""
            tokens = re.split(r"(\s+)", final_text)
            for token in tokens:
                if token:
                    yield sse({"type": "text", "content": token})
                    await asyncio.sleep(0)
            break

        # Execute tool calls
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
            elif tool_name in AUTO_EXECUTE_TOOLS:
                result = await execute_tool(tool_name, tool_input, agent_id)
                yield sse({"type": "auto_executed", "name": tool_name, "result": result, "success": "error" not in result})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps(result, default=str),
                })
            elif tool_name in READ_TOOLS:
                result = await execute_tool(tool_name, tool_input, agent_id)
                yield sse({"type": "tool_result", "name": tool_name, "result": result})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps(result, default=str),
                })
            else:
                logger.warning("Unknown tool: %s", tool_name)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps({"error": f"Unknown tool: {tool_name}"}),
                })

            tool_calls_log.append({"tool": tool_name, "input": tool_input})

        # If any write tool was queued, stop the loop
        has_confirmation = any(
            isinstance(r.get("content"), str) and "pending_confirmation" in r["content"]
            for r in tool_results
        )
        if has_confirmation:
            note = "Please confirm or cancel the action above."
            final_text = note
            for token in re.split(r"(\s+)", note):
                if token:
                    yield sse({"type": "text", "content": token})
                    await asyncio.sleep(0)
            break

        # Feed tool results back to Claude
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    # Save assistant message to DB
    await run_query(lambda: _save_assistant_message(conversation_id, agent_id, final_text, tool_calls_log))

    yield "data: [DONE]\n\n"
