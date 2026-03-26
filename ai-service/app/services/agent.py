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
    execute_read_tool, queue_write_tool, execute_write_tool_immediate,
    check_gmail_status, check_outlook_status, get_recent_emails_for_contact,
)

logger = logging.getLogger(__name__)

MODEL = ANTHROPIC_MODEL
MAX_TOOL_ROUNDS = 5  # safety limit for chat

ALWAYS_CONFIRM_TOOLS = {"delete_contact", "delete_deal", "delete_property"}


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


def _load_contacts_for_workflow(agent_id: str) -> list[dict]:
    """Load agent's contacts (name + email) for workflow creation context."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT first_name, last_name, email FROM contacts WHERE agent_id = %s AND email IS NOT NULL ORDER BY first_name LIMIT 50",
            (agent_id,),
        )
        return [dict(r) for r in cur.fetchall()]


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

        # Recent emails with this contact
        emails = get_recent_emails_for_contact(contact_id, agent_id, limit=5)
        if emails:
            lines.append("Recent Emails:")
            for e in emails:
                direction = "Sent" if e.get("is_outbound") else "Received"
                date_str = e["email_date"].strftime("%b %d") if e.get("email_date") else "?"
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
# System prompt composable blocks
# ---------------------------------------------------------------------------

def _base_block(agent_name: str) -> str:
    """Agent identity, date context, and capabilities."""
    today = date.today()
    tomorrow = today + timedelta(days=1)
    day_name = today.strftime("%A")
    return (
        f"You are CloAgent AI, a smart CRM assistant for real estate agent {agent_name}. "
        f"Today is {day_name}, {today.isoformat()}. Tomorrow is {tomorrow.isoformat()}. "
        "You have full access to their CRM data and can do everything they can do: "
        "search and view contacts, manage buyer profiles, create/edit/delete deals, "
        "log activities, move deals through pipeline stages, view analytics, "
        "and search/send emails via Gmail."
    )


def _contact_resolution_block() -> str:
    """Contact search and resolution rules."""
    return (
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
        "</contact_resolution>"
    )


def _guidelines_block() -> str:
    """Action-oriented behavior, date resolution, task defaults."""
    return (
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
        "- Be concise. Skip preamble. Lead with action."
    )


def _document_citation_block() -> str:
    """Document search accuracy and citation rules."""
    return (
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
        "or conversation context for document facts. Always search again to get the exact wording."
    )


def _formatting_block() -> str:
    """Markdown formatting rules for responses."""
    return (
        "RESPONSE FORMATTING:\n"
        "- Use markdown tables (| col | col |) when presenting comparisons or lists of items with shared fields.\n"
        "- Use ## and ### headers to separate distinct topics. Never use # (too large for chat).\n"
        "- Use **Label:** format for key-value pairs (e.g. **Budget:** $500,000).\n"
        "- Format currency with $ and commas. Always include % for percentages.\n"
        "- Use bullet lists (-) for 3+ items. Use numbered lists only for ordered sequences.\n"
        "- ALWAYS use `-` for bullet points, NEVER em-dashes (\u2013) or other dash characters.\n"
        "- For nested bullet lists, use 2-space indentation. NEVER indent with 4+ spaces "
        "(markdown treats 4-space indented text as code blocks, which breaks formatting).\n"
        "- When reporting multiple KPIs, put each on its own line with bold labels.\n"
        "- For hierarchical structures (ownership chains, entity structures, org charts), "
        "use nested markdown bullet lists with **bold entity names**. Include ALL entities \u2014 "
        "sponsors, funds, GPs, LPs, SPEs, properties, managers, lenders. "
        "NEVER use ASCII art or box-drawing characters for diagrams."
    )


def _briefing_block() -> str:
    """Morning briefing instructions."""
    return (
        "MORNING BRIEFING:\n"
        "When the user sends a message like 'brief me', 'morning briefing', 'daily briefing', "
        "'start my day', 'what do I have today', 'catch me up', or any similar request for a "
        "day-start summary, respond with a structured morning briefing. To generate it, chain "
        "these tool calls in order:\n"
        "  1. get_dashboard_summary \u2014 overall pipeline health and metrics\n"
        "  2. get_overdue_tasks \u2014 tasks that are past due and not completed\n"
        "  3. get_all_activities with limit=10 \u2014 what happened recently\n"
        "  4. list_deals \u2014 scan for stale deals (same stage 14+ days) and deals at risk\n"
        "Format the briefing with these sections:\n"
        "  ## Good morning! Here's your briefing for {today}\n"
        "  ### Overview \u2014 key metrics from get_dashboard_summary (active deals, pipeline value, "
        "contacts, activity this week)\n"
        "  ### Action Items \u2014 overdue tasks (from get_overdue_tasks) listed with their due date "
        "and priority; deals that appear stale (no stage change in 14+ days based on updated_at) "
        "flagged with the contact name and current stage\n"
        "  ### Recent Activity \u2014 summary of the last 10 activities (calls, emails, notes, showings) "
        "from get_all_activities, grouped or highlighted by significance\n"
        "  ### Today's Focus \u2014 2-3 specific, actionable recommendations based on what you found "
        "(e.g. 'Follow up with Jane Smith \u2014 no contact in 9 days', 'Move the Doe deal out of "
        "Offer stage \u2014 it has been 18 days')\n"
        "Be concise but complete. Each section should be scannable in under 10 seconds. "
        "If a section has nothing to report (e.g. no overdue tasks), say so briefly and move on."
    )


def _gmail_block(gmail_status: dict) -> str:
    """Gmail connection status and email tool instructions."""
    if gmail_status.get("connected"):
        synced = gmail_status.get("last_synced_at")
        sync_info = f", last synced {synced.strftime('%b %d %H:%M')}" if synced else ""
        return (
            f"Gmail: Connected ({gmail_status.get('gmail_address', 'unknown')}{sync_info}). "
            "You can search emails, read threads, draft emails, and send emails. "
            "IMPORTANT EMAIL RULES:\n"
            "- When asked about emails from contacts, ALWAYS use search_emails with contacts_only=true. "
            "This filters to only emails linked to CRM contacts and skips spam/marketing.\n"
            "- When asked about specific topics or senders, use the query parameter.\n"
            "- Never assume \u2014 always call the tool first."
        )
    else:
        return "Gmail: Not connected. If the user asks about emails, tell them to connect Gmail in Settings first."




def _outlook_block(outlook_status: dict) -> str:
    """Outlook connection status block."""
    if outlook_status.get("connected"):
        synced = outlook_status.get("last_synced_at")
        sync_info = f", last synced {synced.strftime('%b %d %H:%M')}" if synced else ""
        return (
            f"Outlook: Connected ({outlook_status.get('outlook_email', 'unknown')}{sync_info}). "
            "Outlook emails are included in search results alongside Gmail emails."
        )
    return ""

def _workflow_creation_block() -> str:
    """Prompt for AI-assisted workflow creation."""
    return (
        "## Workflow Creation Mode\n\n"
        "The user is in the visual workflow builder. Follow this 2-step process:\n\n"
        "### Step 1: Understand & Plan\n"
        "Briefly describe what you'll build (2-3 sentences). Don't ask questions — "
        "infer reasonable defaults.\n\n"
        "### Step 2: Create It\n"
        "Call `save_workflow` with structured `steps` array. Each step is a separate node.\n\n"
        "### Trigger Types:\n"
        "- `manual` — run on demand\n"
        "- `scheduled` — time-based (needs schedule_config)\n"
        "- `contact_created` — new contact added\n"
        "- `deal_stage_changed` — deal moves stages. trigger_config: {\"stage\": \"Stage Name\"}\n"
        "- `activity_logged` — activity recorded\n"
        "- `email_sent` — email received. trigger_config: {\"from_contact\": \"Name\"}\n\n"
        "### Step Types (for the `steps` array):\n"
        "- `ai_decision` — config: {\"instruction\": \"what to analyze/decide\"}\n"
        "- `send_email` — config: {\"to\": \"email@real.com\", \"subject\": \"...\", \"body\": \"...\"}\n"
        "- `create_task` — config: {\"title\": \"...\", \"due_date\": \"...\"}\n"
        "- `log_activity` — config: {\"type\": \"note|call|meeting\", \"note\": \"...\"}\n"
        "- `update_deal` — config: {\"stage\": \"New Stage\"}\n"
        "- `create_contact` — config: {\"first_name\": \"\", \"last_name\": \"\", \"email\": \"\"}\n"
        "- `send_sms` — config: {\"to\": \"phone\", \"message\": \"...\"}\n"
        "- `update_contact` — config: {\"field\": \"value\"}\n"
        "- `notify_agent` — config: {\"message\": \"...\"}\n"
        "- `add_tag` — config: {\"tag\": \"tag-name\"}\n"
        "- `delay` — config: {\"minutes\": 60}\n"
        "- `condition` — config: {\"field\": \"...\", \"operator\": \">\", \"value\": \"...\"}\n\n"
        "### CRITICAL Rules:\n"
        "- ALWAYS provide the `steps` array with individual step objects. NEVER put everything into instruction.\n"
        "- `instruction` should be a 1-2 sentence human-readable summary only.\n"
        "- Each step must be a SINGLE atomic action — don't combine multiple actions into one step.\n"
        "- When user mentions a contact name, look it up in the Contacts list below and use their REAL email. NEVER make up emails like example.com.\n"
        "- If the workflow involves analysis/reasoning before acting, use an `ai_decision` step FIRST, then the action steps.\n"
        "- Default approval_mode to 'review'.\n"
        "- To edit, use `update_workflow` with workflow_id.\n\n"
        "### Example — 'When Matt emails me about a property over 500k, summarize and email Sarah':\n"
        "```json\n"
        "{\n"
        "  \"name\": \"Forward Matt's 500k+ property emails to Sarah\",\n"
        "  \"instruction\": \"When Matt emails about properties over 500k, summarize and forward to Sarah\",\n"
        "  \"trigger_type\": \"email_sent\",\n"
        "  \"trigger_config\": {\"from_contact\": \"Matt\"},\n"
        "  \"steps\": [\n"
        "    {\"type\": \"ai_decision\", \"config\": {\"instruction\": \"Check if the email mentions a property over $500k. If yes, summarize the property details including address, price, and key features.\"}},\n"
        "    {\"type\": \"send_email\", \"config\": {\"to\": \"sarah@realemail.com\", \"subject\": \"Property Alert from Matt - $500k+\", \"body\": \"Summary of Matt's email with property details\"}}\n"
        "  ],\n"
        "  \"approval_mode\": \"review\"\n"
        "}\n"
        "```\n"
    )


def _workflow_execution_block() -> str:
    """Prompt for AI-native workflow execution."""
    return (
        "## Workflow Execution Mode\n\n"
        "You are executing an automated workflow for this real estate agent. "
        "The user message contains the workflow instruction — follow it precisely.\n\n"
        "**Rules:**\n"
        "- Execute the instruction step by step using your available tools\n"
        "- Be thorough: search for contacts/deals before acting on them\n"
        "- If a contact or deal is referenced, resolve it first using search tools\n"
        "- Report what you accomplished at the end with a brief summary\n"
        "- If you cannot complete a step, explain why and continue with remaining steps\n"
        "- Do NOT ask clarifying questions — interpret the instruction as best you can\n"
        "- If trigger context is provided, use it to scope your actions (e.g. act on the triggered contact)\n"
    )


def _workflow_awareness_block(workflows: list) -> str:
    """Lists agent's workflows in system prompt so AI can reference them."""
    if not workflows:
        return ""

    lines = ["## Your Workflows\n", "You have the following active workflows:\n"]
    for wf in workflows[:20]:  # cap at 20 to keep prompt manageable
        trigger = wf.get("trigger_type", "manual")
        name = wf.get("name", "Unnamed")
        wf_id = wf.get("id", "")
        enabled = "enabled" if wf.get("enabled") else "disabled"
        schedule = ""
        if trigger == "scheduled" and wf.get("schedule_config"):
            sc = wf["schedule_config"]
            schedule = f" ({sc.get('frequency', '')} at {sc.get('time', '')})"
        lines.append(f"- **{name}** (id: {wf_id}) — trigger: {trigger}{schedule}, {enabled}")

    lines.append(
        "\nYou can reference these workflows when the user asks about them. "
        "Use `update_workflow` to modify them."
    )
    return "\n".join(lines)


def build_system_prompt(
    mode: str,
    agent_name: str,
    contact_context: str = "",
    gmail_status: dict | None = None,
    outlook_status: dict | None = None,
    workflows: list | None = None,
) -> str:
    """Compose system prompt from blocks based on mode.

    Modes:
    - "chat": Full prompt with all blocks (default for AI chat)
    - "workflow_creation": Base + workflow creation instructions
    - "workflow_execution": Base + workflow execution instructions
    """
    blocks = [_base_block(agent_name)]

    if mode == "chat":
        blocks += [
            _contact_resolution_block(),
            _guidelines_block(),
            _document_citation_block(),
            _formatting_block(),
            _briefing_block(),
        ]
        if workflows:
            block = _workflow_awareness_block(workflows)
            if block:
                blocks.append(block)
    elif mode == "workflow_creation":
        block = _workflow_creation_block()
        if block:
            blocks.append(block)
    elif mode == "workflow_execution":
        block = _workflow_execution_block()
        if block:
            blocks.append(block)

    if gmail_status:
        blocks.append(_gmail_block(gmail_status))

    if outlook_status:
        block = _outlook_block(outlook_status)
        if block:
            blocks.append(block)

    if contact_context:
        blocks.append(contact_context.lstrip("\n"))

    return "\n\n".join(blocks)


# ---------------------------------------------------------------------------
# Tool dispatch
# ---------------------------------------------------------------------------

async def dispatch_tool(
    tool_name: str,
    tool_input: dict,
    agent_id: str,
    approval_mode: str | None = None,
    is_dry_run: bool = False,
):
    """Route a tool call based on tool type and execution mode.

    Returns the tool result dict. Caller inspects the result to determine type:
    - "pending_id" in result -> write tool queued for confirmation
    - "preview" in result -> dry run preview
    - "error" in result -> unknown tool or error
    - otherwise -> read tool result or auto-executed write result
    """
    if tool_name in READ_TOOLS:
        return await execute_read_tool(tool_name, tool_input, agent_id)
    elif tool_name in WRITE_TOOLS:
        if is_dry_run:
            return {"preview": True, "tool": tool_name, "would_do": f"Would execute {tool_name} with {tool_input}"}
        elif approval_mode == "auto" and tool_name not in ALWAYS_CONFIRM_TOOLS:
            return await execute_write_tool_immediate(tool_name, tool_input, agent_id)
        else:
            return queue_write_tool(tool_name, tool_input, agent_id)
    else:
        logger.warning(f"Unknown tool requested: {tool_name}")
        return {"error": f"Unknown tool: {tool_name}"}


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

async def run_agent(
    conversation_id: str,
    agent_id: str,
    user_message: str,
    approval_mode: str | None = None,
    is_dry_run: bool = False,
    max_tool_rounds: int | None = None,
    prompt_mode: str = "chat",
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-formatted strings.
    Caller wraps this in a StreamingResponse.
    """
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    rounds_limit = max_tool_rounds or MAX_TOOL_ROUNDS

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

    # Check email connection status for tool awareness
    gmail_status = await run_query(lambda: check_gmail_status(agent_id))
    outlook_status = await run_query(lambda: check_outlook_status(agent_id))

    system = build_system_prompt(prompt_mode, agent_name, contact_context, gmail_status, outlook_status)

    # For workflow creation, inject the agent's contacts so AI can resolve names to emails
    if prompt_mode == "workflow_creation":
        contacts_list = await run_query(lambda: _load_contacts_for_workflow(agent_id))
        if contacts_list:
            contacts_block = "\n\n## Your Contacts\nWhen the user references a contact by name, match to this list and use their REAL email. Never make up emails.\n"
            for c in contacts_list:
                name = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip()
                email = c.get("email", "")
                if name and email:
                    contacts_block += f"- {name}: {email}\n"
            system += contacts_block

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

    for _round in range(rounds_limit + 1):
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

        # Execute tool use blocks via dispatch_tool
        tool_results = []
        for tb in tool_use_blocks:
            tool_name = tb.name
            tool_input = tb.input if isinstance(tb.input, dict) else {}

            yield sse({"type": "tool_call", "name": tool_name, "status": "running"})

            result = await dispatch_tool(tool_name, tool_input, agent_id, approval_mode, is_dry_run)

            if "pending_id" in result:
                # Write tool queued for confirmation
                yield sse({"type": "confirmation", **result})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps({"status": "pending_confirmation", "pending_id": result["pending_id"]}),
                })
            elif "error" in result:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps(result, default=str),
                })
            else:
                # Read result, preview, or auto-executed write
                yield sse({"type": "tool_result", "name": tool_name, "result": result})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps(result, default=str),
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
