"""
Activity tools: log and retrieve activities across contacts.
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

_ACTIVITY_TYPES = ["call", "email", "note", "showing", "task"]

DEFINITIONS = [
    {
        "name": "get_all_activities",
        "description": (
            "Get recent activities across ALL contacts. "
            "Useful for 'what happened today', 'this week's activity', or general activity feed. "
            "Optionally filter by type (call, email, note, showing, task)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": _ACTIVITY_TYPES,
                    "description": "Filter by activity type",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 25)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "update_activity",
        "description": (
            "Update an existing activity's description, due date (tasks only), or priority (tasks only). "
            "Use for correcting typos, updating notes, or changing task details."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "activity_id": {"type": "string", "description": "UUID of the activity to update"},
                "body": {"type": "string", "description": "New description/notes"},
                "due_date": {"type": "string", "description": "New due date in YYYY-MM-DD (tasks only)"},
                "priority": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": "New priority (tasks only)",
                },
            },
            "required": ["activity_id"],
        },
    },
    {
        "name": "delete_activity",
        "description": (
            "Permanently delete an activity (call log, note, showing, or task). "
            "Requires confirmation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "activity_id": {"type": "string", "description": "UUID of the activity to delete"},
            },
            "required": ["activity_id"],
        },
    },
    {
        "name": "log_activity",
        "description": (
            "Log a call, email, note, showing, or task for a contact. "
            "Requires a contact_id — use search_contacts first if needed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
                "type": {
                    "type": "string",
                    "enum": _ACTIVITY_TYPES,
                    "description": "Activity type",
                },
                "body": {"type": "string", "description": "Activity description or notes"},
            },
            "required": ["contact_id", "type", "body"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"get_all_activities"}
AUTO_EXECUTE = {"update_activity"}
WRITE = {"log_activity", "delete_activity"}

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _get_all_activities(agent_id: str, inp: dict):
    activity_type = inp.get("type")
    limit = inp.get("limit", 25)

    def go(cur):
        clauses = ["a.agent_id = %s"]
        params: list = [agent_id]

        if activity_type:
            clauses.append("a.type = %s")
            params.append(activity_type)

        params.append(limit)
        cur.execute(f"""
            SELECT a.id, a.type, a.body, a.created_at,
                   c.first_name || ' ' || c.last_name AS contact_name,
                   c.id AS contact_id
            FROM activities a
            JOIN contacts c ON c.id = a.contact_id
            WHERE {' AND '.join(clauses)}
            ORDER BY a.created_at DESC LIMIT %s
        """, params)
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


# ---------------------------------------------------------------------------
# Auto-execute handlers
# ---------------------------------------------------------------------------

def _update_activity(agent_id: str, inp: dict):
    activity_id = inp["activity_id"]

    def go(cur):
        sets = []
        params = []
        for field in ("body", "due_date", "priority"):
            if field in inp:
                sets.append(f"{field} = %s")
                params.append(inp[field])
        if not sets:
            return {"error": "No fields to update"}
        params.extend([activity_id, agent_id])
        cur.execute(f"""
            UPDATE activities SET {', '.join(sets)}
            WHERE id = %s AND agent_id = %s
            RETURNING id, type, body, due_date, priority
        """, params)
        row = cur.fetchone()
        if not row:
            return {"error": "Activity not found"}
        return dict(row)

    return _q(go)


# ---------------------------------------------------------------------------
# Write handlers
# ---------------------------------------------------------------------------

def _delete_activity(agent_id: str, inp: dict):
    activity_id = inp["activity_id"]

    def go(cur):
        cur.execute(
            "SELECT type, body FROM activities WHERE id = %s AND agent_id = %s",
            (activity_id, agent_id),
        )
        existing = cur.fetchone()
        if not existing:
            return {"error": "Activity not found"}
        cur.execute(
            "DELETE FROM activities WHERE id = %s AND agent_id = %s",
            (activity_id, agent_id),
        )
        return {"deleted": True, "type": existing["type"], "body": existing["body"]}

    return _q(go)


def _log_activity(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            INSERT INTO activities (agent_id, contact_id, type, body)
            VALUES (%s, %s, %s, %s)
            RETURNING id, type, body, created_at
        """, (agent_id, inp["contact_id"], inp["type"], inp["body"]))
        return dict(cur.fetchone())

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "get_all_activities": _get_all_activities,
}

_AUTO_DISPATCH = {
    "update_activity": _update_activity,
}

_WRITE_DISPATCH = {
    "delete_activity": _delete_activity,
    "log_activity": _log_activity,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown activity read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_auto(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute an auto-execute tool (no confirmation needed)."""
    handler = _AUTO_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown activity auto-execute tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool."""
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown activity write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
