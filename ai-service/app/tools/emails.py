"""
Email tools: search, view threads, draft, send emails via Gmail integration.
"""
import json
import logging

import anthropic
import httpx
import psycopg2.extras

from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, BACKEND_URL, AI_SERVICE_SECRET
from app.database import get_conn, run_query

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DB helper
# ---------------------------------------------------------------------------

def _q(fn):
    """Run fn(cursor) inside a pooled connection with RealDictCursor."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return fn(cur)


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

DEFINITIONS: list[dict] = [
    {
        "name": "search_emails",
        "description": (
            "Search synced Gmail emails by subject, sender, or snippet. "
            "Use contacts_only=true to filter to CRM contacts only."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search term matched against subject, sender name, and snippet",
                },
                "contact_id": {
                    "type": "string",
                    "description": "Filter to emails linked to this contact UUID",
                },
                "contacts_only": {
                    "type": "boolean",
                    "description": "Only return emails linked to a CRM contact (excludes spam/marketing)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 10)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_email_thread",
        "description": (
            "Get all emails in a conversation thread chronologically. "
            "Use search_emails first to find the thread_id."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "thread_id": {
                    "type": "string",
                    "description": "Gmail thread ID",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max emails to return (default 20)",
                },
            },
            "required": ["thread_id"],
        },
    },
    {
        "name": "draft_email",
        "description": (
            "Generate an email draft for review. "
            "Does NOT send — returns subject and body for editing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {
                    "type": "string",
                    "description": "Recipient email address",
                },
                "subject": {
                    "type": "string",
                    "description": "Email subject line (optional — AI will generate if omitted)",
                },
                "context": {
                    "type": "string",
                    "description": "What the email should be about",
                },
                "contact_id": {
                    "type": "string",
                    "description": "Contact UUID for recipient context",
                },
            },
            "required": ["to", "context"],
        },
    },
    {
        "name": "send_email",
        "description": (
            "Send an email via connected Gmail. Requires confirmation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {
                    "type": "string",
                    "description": "Recipient email address",
                },
                "subject": {
                    "type": "string",
                    "description": "Email subject line",
                },
                "body": {
                    "type": "string",
                    "description": "Email body (plain text)",
                },
                "cc": {
                    "type": "string",
                    "description": "CC recipient email address",
                },
            },
            "required": ["to", "subject", "body"],
        },
    },
]

READ: set[str] = {"search_emails", "get_email_thread", "draft_email"}
AUTO_EXECUTE: set[str] = set()
WRITE: set[str] = {"send_email"}


# ---------------------------------------------------------------------------
# Exported helpers (used by agent.py, not tools)
# ---------------------------------------------------------------------------

async def check_gmail_status(agent_id: str) -> dict:
    """Check whether Gmail is connected for this agent."""
    def _run(cur):
        cur.execute(
            "SELECT gmail_address, last_synced_at FROM gmail_tokens WHERE agent_id = %s",
            (agent_id,),
        )
        row = cur.fetchone()
        if row:
            return {"connected": True, "gmail_address": row["gmail_address"], "last_synced_at": row["last_synced_at"]}
        return {"connected": False}

    return await run_query(lambda: _q(_run))


async def get_recent_emails_for_contact(contact_id: str, agent_id: str, limit: int = 5) -> list:
    """Recent emails for a contact — used for contact-scoped system prompt context."""
    def _run(cur):
        cur.execute(
            """SELECT subject, snippet, from_name, is_outbound, gmail_date
               FROM emails
               WHERE contact_id = %s AND agent_id = %s
               ORDER BY gmail_date DESC
               LIMIT %s""",
            (contact_id, agent_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]

    return await run_query(lambda: _q(_run))


# ---------------------------------------------------------------------------
# Internal executors
# ---------------------------------------------------------------------------

def _search_emails(agent_id: str, inp: dict) -> dict:
    query = inp.get("query", "")
    contact_id = inp.get("contact_id")
    contacts_only = inp.get("contacts_only", False)
    limit = inp.get("limit", 10)

    conditions = ["e.agent_id = %s"]
    params: list = [agent_id]

    if contacts_only:
        conditions.append("e.contact_id IS NOT NULL")

    if contact_id:
        conditions.append("e.contact_id = %s")
        params.append(contact_id)

    if query:
        conditions.append("(e.subject ILIKE %s OR e.from_name ILIKE %s OR e.snippet ILIKE %s)")
        like = f"%{query}%"
        params.extend([like, like, like])

    params.append(limit)

    sql = f"""
        SELECT e.id, e.thread_id, e.subject, e.snippet,
               e.from_name, e.from_address, e.to_addresses,
               e.is_read, e.is_outbound, e.labels, e.gmail_date,
               e.contact_id,
               CASE WHEN c.id IS NOT NULL
                    THEN c.first_name || ' ' || c.last_name
                    ELSE NULL END AS contact_name
        FROM emails e
        LEFT JOIN contacts c ON c.id = e.contact_id
        WHERE {' AND '.join(conditions)}
        ORDER BY e.gmail_date DESC
        LIMIT %s
    """

    def _run(cur):
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]

    return _q(_run)


def _get_email_thread(agent_id: str, thread_id: str, limit: int) -> dict:
    def _run(cur):
        cur.execute(
            """SELECT id, subject, snippet, from_name, from_address,
                      to_addresses, cc_addresses, body_text,
                      is_read, is_outbound, gmail_date
               FROM emails
               WHERE agent_id = %s AND thread_id = %s
               ORDER BY gmail_date ASC
               LIMIT %s""",
            (agent_id, thread_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]

    return _q(_run)


async def _draft_email(agent_id: str, inp: dict) -> dict:
    to = inp.get("to", "")
    subject = inp.get("subject", "")
    context = inp.get("context", "")
    contact_id = inp.get("contact_id")

    # Look up contact name if provided
    recipient_line = ""
    if contact_id:
        def _contact(cur):
            cur.execute(
                "SELECT first_name, last_name, email FROM contacts WHERE id = %s AND agent_id = %s",
                (contact_id, agent_id),
            )
            return cur.fetchone()

        contact = await run_query(lambda: _q(_contact))
        if contact:
            name = f"{contact['first_name']} {contact['last_name']}".strip()
            recipient_line = f"\nRecipient: {name} ({contact.get('email') or to})"

    # Look up agent name
    def _agent_name(cur):
        cur.execute("SELECT name FROM users WHERE id = %s", (agent_id,))
        row = cur.fetchone()
        return row["name"] if row else "Agent"

    try:
        agent_name = await run_query(lambda: _q(_agent_name))
    except Exception:
        agent_name = "Agent"

    # Generate draft via Claude
    prompt = (
        f"Write a professional, friendly email for a real estate agent named {agent_name}.\n"
        f"To: {to}{recipient_line}\n"
        f"Subject suggestion: {subject or '(generate an appropriate subject)'}\n"
        f"Context: {context}\n\n"
        "Return ONLY a JSON object with exactly these fields:\n"
        '{"subject": "...", "body": "..."}\n'
        "The body should be plain text, professional but warm. "
        "Include a sign-off with the agent's name. "
        "Do NOT include markdown, code fences, or explanation — just the JSON."
    )

    try:
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        draft = json.loads(text)
        return {
            "draft": True,
            "to": to,
            "subject": draft.get("subject", subject or ""),
            "body": draft.get("body", ""),
        }
    except json.JSONDecodeError:
        # Claude returned non-JSON — use the raw text as the body
        return {
            "draft": True,
            "to": to,
            "subject": subject or "",
            "body": text,
        }
    except Exception as exc:
        logger.error("draft_email failed: %s", exc)
        return {"error": f"Failed to generate draft: {exc}"}


async def _send_email(agent_id: str, inp: dict) -> dict:
    url = f"{BACKEND_URL}/api/gmail/send"
    headers = {
        "X-AI-Service-Secret": AI_SERVICE_SECRET,
        "X-Agent-ID": agent_id,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=inp, headers=headers)

        if resp.status_code in (200, 201):
            return resp.json()

        # Parse error body
        try:
            detail = resp.json().get("error", resp.text)
        except Exception:
            detail = resp.text

        error_map = {
            429: "Gmail rate limit — try again later.",
            401: "Auth failed — check AI_SERVICE_SECRET config.",
        }
        if resp.status_code in error_map:
            return {"error": error_map[resp.status_code]}
        return {"error": f"Gmail send failed ({resp.status_code}): {detail}"}

    except httpx.ConnectError:
        return {"error": "Go backend not reachable."}
    except httpx.TimeoutException:
        return {"error": "Timed out — try again."}
    except Exception as exc:
        logger.error("send_email proxy failed: %s", exc)
        return {"error": f"Send failed: {exc}"}


# ---------------------------------------------------------------------------
# Dispatchers
# ---------------------------------------------------------------------------

_READ_DISPATCH: dict = {
    "search_emails": lambda aid, inp: run_query(lambda: _search_emails(aid, inp)),
    "get_email_thread": lambda aid, inp: run_query(lambda: _get_email_thread(aid, inp["thread_id"], inp.get("limit", 20))),
    "draft_email": lambda aid, inp: _draft_email(aid, inp),
}

_WRITE_DISPATCH: dict = {
    "send_email": lambda aid, inp: _send_email(aid, inp),
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown email read tool: {tool_name}")
    return await handler(agent_id, tool_input)


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown email write tool: {tool_name}")
    return await handler(agent_id, tool_input)
