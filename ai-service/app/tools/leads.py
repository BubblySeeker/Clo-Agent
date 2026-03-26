"""
Lead suggestion tools: list, accept, and dismiss AI-detected leads from emails.
"""
import psycopg2.extras

from app.database import get_conn, run_query

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _q(fn):
    """Open a connection + RealDictCursor, pass cursor to fn, return result."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return fn(cur)


# ---------------------------------------------------------------------------
# Tool definitions (Anthropic tool schema)
# ---------------------------------------------------------------------------

DEFINITIONS = [
    {
        "name": "list_lead_suggestions",
        "description": (
            "List pending lead suggestions detected from incoming emails. "
            "Shows suggested contact info, intent, and confidence score. "
            "Sorted by confidence (highest first)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "accept_lead_suggestion",
        "description": (
            "Accept a lead suggestion, creating a new contact and Lead deal from the suggested info. "
            "Use list_lead_suggestions first to get the suggestion_id."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "suggestion_id": {"type": "string", "description": "UUID of the lead suggestion"},
            },
            "required": ["suggestion_id"],
        },
    },
    {
        "name": "dismiss_lead_suggestion",
        "description": "Dismiss a lead suggestion so it no longer appears in the pending list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "suggestion_id": {"type": "string", "description": "UUID of the lead suggestion"},
            },
            "required": ["suggestion_id"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"list_lead_suggestions"}
AUTO_EXECUTE = {"dismiss_lead_suggestion"}
WRITE = {"accept_lead_suggestion"}

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _list_lead_suggestions(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            SELECT ls.id, ls.from_address, ls.suggested_first_name,
                   ls.suggested_last_name, ls.suggested_phone,
                   ls.suggested_intent, ls.confidence, ls.status,
                   ls.created_at, e.subject
            FROM lead_suggestions ls
            JOIN emails e ON e.id = ls.email_id
            WHERE ls.agent_id = %s AND ls.status = 'pending'
            ORDER BY ls.confidence DESC
        """, (agent_id,))
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


# ---------------------------------------------------------------------------
# Auto-execute handlers
# ---------------------------------------------------------------------------

def _dismiss_lead_suggestion(agent_id: str, inp: dict):
    suggestion_id = inp["suggestion_id"]

    def go(cur):
        cur.execute(
            """UPDATE lead_suggestions SET status = 'dismissed'
               WHERE id = %s AND agent_id = %s AND status = 'pending'""",
            (suggestion_id, agent_id),
        )
        if cur.rowcount == 0:
            return {"error": "Suggestion not found or already processed"}
        return {"dismissed": True, "suggestion_id": suggestion_id}

    return _q(go)


# ---------------------------------------------------------------------------
# Write handlers
# ---------------------------------------------------------------------------

def _accept_lead_suggestion(agent_id: str, inp: dict):
    suggestion_id = inp["suggestion_id"]

    def go(cur):
        # Fetch and verify ownership + pending status
        cur.execute(
            """SELECT id, suggested_first_name, suggested_last_name,
                      suggested_phone, from_address
               FROM lead_suggestions
               WHERE id = %s AND agent_id = %s AND status = 'pending'""",
            (suggestion_id, agent_id),
        )
        suggestion = cur.fetchone()
        if not suggestion:
            return {"error": "Suggestion not found or already processed"}

        first_name = suggestion["suggested_first_name"]
        last_name = suggestion["suggested_last_name"]
        phone = suggestion["suggested_phone"]
        email = suggestion["from_address"]

        # Dedup check: reject if a contact with same first+last name already exists
        cur.execute(
            """SELECT id, first_name, last_name, email, phone, source
               FROM contacts
               WHERE agent_id = %s
                 AND LOWER(first_name) = LOWER(%s)
                 AND LOWER(last_name) = LOWER(%s)
               LIMIT 1""",
            (agent_id, first_name, last_name),
        )
        existing = cur.fetchone()
        if existing:
            # Mark accepted even though contact exists
            cur.execute(
                "UPDATE lead_suggestions SET status = 'accepted' WHERE id = %s",
                (suggestion_id,),
            )
            result = dict(existing)
            result["already_exists"] = True
            result["suggestion_id"] = suggestion_id
            return result

        # Create the contact
        cur.execute("""
            INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source)
            VALUES (%s, %s, %s, %s, %s, 'Email')
            RETURNING id, first_name, last_name, email, phone, source, created_at
        """, (agent_id, first_name, last_name, email, phone))
        contact = dict(cur.fetchone())

        # Auto-create a Lead deal
        cur.execute("""
            INSERT INTO deals (contact_id, agent_id, stage_id, title)
            SELECT %s, %s, id, %s FROM deal_stages WHERE LOWER(name) = 'lead' LIMIT 1
            RETURNING id
        """, (contact["id"], agent_id, f"{first_name} {last_name}"))
        deal = cur.fetchone()
        if deal:
            contact["deal_id"] = deal["id"]
            contact["pipeline_stage"] = "Lead"

        # Mark suggestion as accepted
        cur.execute(
            "UPDATE lead_suggestions SET status = 'accepted' WHERE id = %s",
            (suggestion_id,),
        )

        contact["suggestion_id"] = suggestion_id
        return contact

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "list_lead_suggestions": _list_lead_suggestions,
}

_AUTO_DISPATCH = {
    "dismiss_lead_suggestion": _dismiss_lead_suggestion,
}

_WRITE_DISPATCH = {
    "accept_lead_suggestion": _accept_lead_suggestion,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown lead read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_auto(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute an auto-execute tool."""
    handler = _AUTO_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown lead auto-execute tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool."""
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown lead write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
