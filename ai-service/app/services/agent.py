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

        return "\n".join(lines)


def _count_agent_documents(agent_id: str) -> int:
    """Count how many ready documents the agent has uploaded."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM documents WHERE agent_id = %s AND status = 'ready'", (agent_id,))
        row = cur.fetchone()
        return row[0] if row else 0


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
        "- Be concise. Skip preamble. Lead with action.\n"
        "- When you use the search_documents tool and find relevant information, ALWAYS cite your sources "
        "using this exact format: [Doc: filename, Page X][[chunk:CHUNK_UUID::DOC_UUID]] where CHUNK_UUID is the chunk_id "
        "and DOC_UUID is the document_id from the search results. The [[chunk:...]] part is a hidden reference — "
        "include it immediately after the visible citation so the frontend can link to the source passage.\n"
        "- CRITICAL: The chunk_id and document_id in citations MUST be copied exactly from the search_documents "
        "tool results. NEVER generate, guess, or fabricate UUIDs. If you cannot find the exact chunk_id for a fact, "
        "omit the [[chunk:...]] part entirely and just use [Doc: filename, Page X] without the hidden reference. "
        "A citation with a wrong UUID is worse than no hidden reference at all.\n"
        "- If multiple documents answer the question, cite all relevant sources.\n"
        "- If the search returns no relevant results, say so honestly — never make up information from documents.\n"
        "- ACCURACY RULES for document searches:\n"
        "  1. Each search result includes a section_heading. Prefer facts from dedicated/primary sections "
        "(e.g. 'Building Description', 'Parking & Access') over incidental mentions in other sections "
        "(e.g. floor plan captions, site plan notes).\n"
        "  2. When multiple chunks give different numbers for the same fact, mention the discrepancy and "
        "cite both sources so the user can verify. Never silently pick one.\n"
        "  3. Distinguish between site/land measurements and building measurements — they are different things.\n"
        "  4. When summarizing an entire document, make multiple search queries to cover different aspects "
        "rather than relying on a single broad search.\n"
        "  5. Only state what is explicitly shown or written in the document. If you want to add context "
        "from general knowledge (e.g. typical building features, market norms), clearly label it as an "
        "inference: 'Based on typical commercial properties...' or 'While not shown in the document...'. "
        "Never present inferred details with the same confidence as documented facts.\n"
        "  6. NEVER do arithmetic on document numbers unless the document itself shows the result. "
        "For example, if a document says '12 Above Grade / 3 Below Grade', report exactly that — "
        "do NOT add them together and say '15 floors' or any other computed number. "
        "Quote the document's own phrasing for numerical facts.\n"
        "  7. When answering a specific factual question (e.g. 'how many floors?'), you MUST call "
        "search_documents to find the answer fresh — do NOT rely on previous tool call results "
        "or conversation context for document facts. Always search again to get the exact wording.\n\n"
        "RESPONSE FORMATTING:\n"
        "- Use markdown tables (| col | col |) when presenting comparisons or lists of items with shared fields.\n"
        "- Use ## and ### headers to separate distinct topics. Never use # (too large for chat).\n"
        "- Use **Label:** format for key-value pairs (e.g. **Budget:** $500,000).\n"
        "- Format currency with $ and commas. Always include % for percentages.\n"
        "- Use bullet lists (-) for 3+ items. Use numbered lists only for ordered sequences.\n"
        "- ALWAYS use `-` for bullet points, NEVER em-dashes (–) or other dash characters.\n"
        "- For nested bullet lists, use 2-space indentation. NEVER indent with 4+ spaces "
        "(markdown treats 4-space indented text as code blocks, which breaks formatting).\n"
        "- When reporting multiple KPIs, put each on its own line with bold labels.\n"
        "- For hierarchical structures (ownership chains, entity structures, org charts), "
        "use nested markdown bullet lists with **bold entity names**. Include ALL entities — "
        "sponsors, funds, GPs, LPs, SPEs, properties, managers, lenders. "
        "NEVER use ASCII art or box-drawing characters for diagrams.\n"
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

    # Add document awareness if agent has uploaded documents
    doc_count = await run_query(lambda: _count_agent_documents(agent_id))
    if doc_count > 0:
        system += (
            f"\n\nYou have access to {doc_count} uploaded document(s). "
            "Use the search_documents tool when the user asks questions that might be "
            "answered by their documents (contracts, listings, reports, spreadsheets, etc.). "
            "Use list_documents to see what's available."
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
