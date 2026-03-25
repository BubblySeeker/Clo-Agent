"""
Task tools: get overdue tasks, create, complete, and reschedule tasks.
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
        "name": "get_overdue_tasks",
        "description": (
            "Get all tasks that are past their due date and not yet completed. "
            "Returns task details including the associated contact name if any."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max results to return (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "create_task",
        "description": (
            "Create a new task with a due date and priority. "
            "Optionally associate it with a contact."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact to associate (optional)"},
                "body": {"type": "string", "description": "Task description"},
                "due_date": {"type": "string", "description": "Due date in YYYY-MM-DD format"},
                "priority": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": "Task priority (default medium)",
                },
            },
            "required": ["body", "due_date"],
        },
    },
    {
        "name": "complete_task",
        "description": "Mark a task as completed by setting its completed_at timestamp.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "UUID of the task to complete"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "reschedule_task",
        "description": "Change a task's due date to a new date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "UUID of the task to reschedule"},
                "new_due_date": {"type": "string", "description": "New due date in YYYY-MM-DD format"},
            },
            "required": ["task_id", "new_due_date"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"get_overdue_tasks"}
AUTO_EXECUTE = {"complete_task", "reschedule_task"}
WRITE = {"create_task"}

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _get_overdue_tasks(agent_id: str, inp: dict):
    limit = inp.get("limit", 20)

    def go(cur):
        cur.execute("""
            SELECT a.id, a.body, a.due_date, a.priority, a.created_at,
                   c.first_name || ' ' || c.last_name AS contact_name
            FROM activities a
            LEFT JOIN contacts c ON c.id = a.contact_id
            WHERE a.agent_id = %s AND a.type = 'task'
              AND a.due_date < CURRENT_DATE AND a.completed_at IS NULL
            ORDER BY a.due_date ASC
            LIMIT %s
        """, (agent_id, limit))
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


# ---------------------------------------------------------------------------
# Auto-execute handlers
# ---------------------------------------------------------------------------

def _complete_task(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            UPDATE activities SET completed_at = NOW()
            WHERE id = %s AND agent_id = %s AND type = 'task'
            RETURNING id, body, completed_at
        """, (inp["task_id"], agent_id))
        row = cur.fetchone()
        if not row:
            return {"error": "Task not found"}
        return dict(row)

    return _q(go)


def _reschedule_task(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            UPDATE activities SET due_date = %s
            WHERE id = %s AND agent_id = %s AND type = 'task'
            RETURNING id, body, due_date
        """, (inp["new_due_date"], inp["task_id"], agent_id))
        row = cur.fetchone()
        if not row:
            return {"error": "Task not found"}
        return dict(row)

    return _q(go)


# ---------------------------------------------------------------------------
# Write handlers
# ---------------------------------------------------------------------------

def _create_task(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            INSERT INTO activities (agent_id, contact_id, type, body, due_date, priority)
            VALUES (%s, %s, 'task', %s, %s, %s)
            RETURNING id, body, due_date, priority, created_at
        """, (agent_id, inp.get("contact_id"), inp["body"],
              inp["due_date"], inp.get("priority", "medium")))
        return dict(cur.fetchone())

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "get_overdue_tasks": _get_overdue_tasks,
}

_AUTO_DISPATCH = {
    "complete_task": _complete_task,
    "reschedule_task": _reschedule_task,
}

_WRITE_DISPATCH = {
    "create_task": _create_task,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown task read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_auto(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute an auto-execute tool (no confirmation needed)."""
    handler = _AUTO_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown task auto-execute tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool."""
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown task write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
