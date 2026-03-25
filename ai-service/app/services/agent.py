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
import logging
import re
from datetime import date, timedelta
from typing import AsyncGenerator

import anthropic
import psycopg2.extras

from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
from app.database import get_conn, run_query
from app.tools import (
    TOOL_DEFINITIONS, READ_TOOLS, WRITE_TOOLS,
    AUTO_EXECUTE_TOOLS, _dispatch_write_tool,
    execute_read_tool, queue_write_tool,
    check_gmail_status, get_recent_emails_for_contact,
)

logger = logging.getLogger(__name__)

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
            "SELECT first_name, last_name, email, phone, source, lead_score, lead_score_signals, previous_lead_score FROM contacts WHERE id = %s AND agent_id = %s",
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
        # Lead score
        lead_score = c.get('lead_score')
        if lead_score is not None and lead_score > 0:
            if lead_score >= 80:
                tier = "Hot"
            elif lead_score >= 50:
                tier = "Warm"
            elif lead_score >= 20:
                tier = "Cool"
            else:
                tier = "Cold"
            score_line = f"Lead Score: {lead_score}/100 ({tier})"
            prev = c.get('previous_lead_score')
            if prev is not None:
                diff = lead_score - prev
                if abs(diff) >= 5:
                    score_line += f" — {'↑' if diff > 0 else '↓'}{abs(diff)} from last"
            signals = c.get('lead_score_signals') or {}
            top = signals.get('top_signals', [])[:3]
            if top:
                score_line += f" | Signals: {', '.join(s if isinstance(s, str) else s.get('description', str(s)) for s in top)}"
            lines.append(score_line)

        if activities:
            lines.append("Recent Activities:")
            for a in activities:
                lines.append(f"  - [{a['type']}] {a['body']} ({a['created_at'].strftime('%b %d')})")

        # Recent emails with this contact
        emails = get_recent_emails_for_contact(contact_id, agent_id, limit=5)
        if emails:
            lines.append("Recent Emails:")
            for e in emails:
                direction = "Sent" if e.get("is_outbound") else "Received"
                date_str = e["gmail_date"].strftime("%b %d") if e.get("gmail_date") else "?"
                lines.append(f"  - [{direction}] {e.get('subject', '(no subject)')} ({date_str})")

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

def _build_system_prompt(agent_name: str, contact_context: str = "", gmail_status: dict | None = None) -> str:
    today = date.today()
    tomorrow = today + timedelta(days=1)
    day_name = today.strftime("%A")  # e.g. "Monday"

    base = (
        f"You are CloAgent AI, a smart CRM assistant for real estate agent {agent_name}. "
        f"Today is {day_name}, {today.isoformat()}. Tomorrow is {tomorrow.isoformat()}. "
        "You have full access to their CRM data and can do everything they can do: "
        "search and view contacts, manage buyer profiles, create/edit/delete deals, "
        "log activities, move deals through pipeline stages, view analytics, "
        "and search/send emails via Gmail.\n\n"
        "<contact_resolution>\n"
        "CONTACT RESOLUTION PROTOCOL — follow this before every contact operation:\n\n"
        "1. ALWAYS call search_contacts before using a contact_id in any tool. Never guess, invent, or reuse a UUID you are not certain is current.\n\n"
        "2. FULL NAME SEARCH: When the user mentions a person by name (e.g. 'Rohan Batre'), pass the full name as the query parameter. The search matches first name, last name, and full name — 'Rohan Batre' will match the contact with first_name='Rohan' and last_name='Batre'.\n\n"
        "3. PARTIAL NAME SEARCH: When the user mentions only a first or last name (e.g. 'email Rohan'), call search_contacts with that name as the query.\n"
        "   - If exactly 1 result: use it immediately. No confirmation needed. (per D-02)\n"
        "   - If 2+ results: list up to 3 candidates as a numbered list showing name, email, and source. Ask the user to pick by number before proceeding. (per D-01)\n"
        "   - If 0 results: tell the user no contact was found with that name and suggest checking the spelling. (per D-03)\n\n"
        "4. RECENCY REFERENCE: When the user says 'my last contact', 'most recent contact', or similar, call search_contacts with no query and limit=1. The results are sorted by creation date descending — the first result is the most recently added contact. (per D-04)\n\n"
        "5. CONTACT-SCOPED CONVERSATIONS: If this conversation already has a contact context loaded above (shown under '## Current Contact Context'), use that contact's UUID directly. Do not call search_contacts again for the same contact. (implements CTX-02)\n\n"
        "6. CONVERSATION MEMORY: If the user already asked about a contact earlier in this conversation and you have their contact_id from a previous search_contacts result, use that UUID directly for follow-up actions. Example: user searched for 'Rohan' 2 messages ago — 'create a deal for him' should use Rohan's contact_id without searching again. (per D-05, implements CTX-03)\n\n"
        "7. SEQUENTIAL TOOL USE: Do not call any contact-dependent tool (create_deal, log_activity, send_email, etc.) in the same tool-call round as search_contacts. Wait for search results before using a contact_id. (implements SAFE-02)\n"
        "\n"
        "8. PRONOUN RESOLUTION: When the user refers to a contact with a pronoun "
        "(\"email him\", \"call her\", \"follow up with them\", \"update their record\"), "
        "resolve the pronoun before calling any contact-dependent tool:\n"
        "   a. CONTACT-SCOPED: If this conversation has a preloaded contact context "
        "(shown under '## Current Contact Context', see rule 5), that contact IS the "
        "antecedent — use their contact_id directly.\n"
        "   b. SINGLE RECENT CONTACT: If only one contact appeared in search results "
        "or tool calls earlier in this conversation, use that contact_id directly.\n"
        "   c. MULTIPLE CONTACTS — GENDER MATCH: If multiple contacts were discussed, "
        "infer gender from each contact's first name and match to the pronoun "
        "('him' → male, 'her' → female, 'them'/'they' → any). If exactly one contact "
        "matches the inferred gender, use that contact_id.\n"
        "   d. AMBIGUOUS — ASK: If gender matching is inconclusive (gender-neutral name "
        "like Alex or Jordan, multiple contacts of the same inferred gender, or no "
        "contacts found in history), do NOT guess. List the recently discussed contacts "
        "by name and ask the user to confirm which one they mean.\n"
        "   Pronoun resolution happens in your reasoning — never call a tool solely to "
        "resolve a pronoun that is already answered by the conversation above.\n"
        "</contact_resolution>\n\n"
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
        "- When asked to draft an email, use the draft_email tool to generate it. "
        "The user can review and edit before sending.\n"
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
        "NEVER use ASCII art or box-drawing characters for diagrams.\n\n"
        "MORNING BRIEFING:\n"
        "When the user sends a message like 'brief me', 'morning briefing', 'daily briefing', "
        "'start my day', 'what do I have today', 'catch me up', or any similar request for a "
        "day-start summary, respond with a structured morning briefing. To generate it, chain "
        "these tool calls in order:\n"
        "  1. get_dashboard_summary — overall pipeline health and metrics\n"
        "  2. get_overdue_tasks — tasks that are past due and not completed\n"
        "  3. get_all_activities with limit=10 — what happened recently\n"
        "  4. list_deals — scan for stale deals (same stage 14+ days) and deals at risk\n"
        "  5. For each contact with a deal, call get_lead_score to get their lead score. "
        "Include lead scores in the briefing — flag Hot leads for immediate action and "
        "Cold leads that may need re-engagement or pipeline cleanup.\n"
        "Format the briefing with these sections:\n"
        "  ## Good morning! Here's your briefing for {today}\n"
        "  ### Overview — key metrics from get_dashboard_summary (active deals, pipeline value, "
        "contacts, activity this week)\n"
        "  ### Action Items — overdue tasks (from get_overdue_tasks) listed with their due date "
        "and priority; deals that appear stale (no stage change in 14+ days based on updated_at) "
        "flagged with the contact name and current stage\n"
        "  ### Recent Activity — summary of the last 10 activities (calls, emails, notes, showings) "
        "from get_all_activities, grouped or highlighted by significance\n"
        "  ### Lead Score Alerts — contacts with Hot scores (80+) that need immediate action, "
        "and contacts whose scores are falling (trending down from previous). Skip this section "
        "if no contacts have lead scores yet.\n"
        "  ### Today's Focus — 2-3 specific, actionable recommendations based on what you found "
        "(e.g. 'Follow up with Jane Smith — no contact in 9 days', 'Move the Doe deal out of "
        "Offer stage — it has been 18 days')\n"
        "Be concise but complete. Each section should be scannable in under 10 seconds. "
        "If a section has nothing to report (e.g. no overdue tasks), say so briefly and move on.\n"
    )

    # Gmail connection status
    if gmail_status:
        if gmail_status.get("connected"):
            synced = gmail_status.get("last_synced_at")
            sync_info = f", last synced {synced.strftime('%b %d %H:%M')}" if synced else ""
            base += f"\n\nGmail: Connected ({gmail_status.get('gmail_address', 'unknown')}{sync_info}). "
            base += (
                "You can search emails, read threads, draft emails, and send emails. "
                "IMPORTANT EMAIL RULES:\n"
                "- When asked about emails from contacts, ALWAYS use search_emails with contacts_only=true. "
                "This filters to only emails linked to CRM contacts and skips spam/marketing.\n"
                "- When asked about specific topics or senders, use the query parameter.\n"
                "- Never assume — always call the tool first."
            )
        else:
            base += "\n\nGmail: Not connected. If the user asks about emails, tell them to connect Gmail in Settings first."

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

    # Check Gmail connection status for email tool awareness
    gmail_status = await run_query(lambda: check_gmail_status(agent_id))

    system = _build_system_prompt(agent_name, contact_context, gmail_status)

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

            if tool_name in WRITE_TOOLS and tool_name in AUTO_EXECUTE_TOOLS:
                # Auto-execute safe write tools without confirmation
                logger.info("Auto-executing %s for agent %s", tool_name, agent_id)
                result = await _dispatch_write_tool(tool_name, tool_input, agent_id)
                status = "error" if "error" in result else "success"
                yield sse({"type": "auto_executed", "name": tool_name, "result": result, "status": status})
                # Push undo entry when the action succeeded and previous values are available
                if status == "success" and "previous" in result:
                    from app.undo import push_undo
                    _entity_map = {
                        "update_contact":       ("contact",       result.get("contact_id")),
                        "update_deal":           ("deal",          result.get("deal_id")),
                        "update_buyer_profile":  ("buyer_profile", result.get("contact_id")),
                        "update_property":       ("property",      result.get("property_id")),
                    }
                    if tool_name in _entity_map:
                        etype, eid = _entity_map[tool_name]
                        push_undo(conversation_id, {
                            "tool_name": tool_name,
                            "previous_values": result["previous"],
                            "entity_id": str(eid),
                            "entity_type": etype,
                        })
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps(result, default=str),
                })
            elif tool_name in WRITE_TOOLS:
                # Dangerous write tools — queue for user confirmation
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
