"""
Workflow & automation tools: list, create, update, delete, toggle, and view run history.
"""
import json

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
        "name": "list_workflows",
        "description": (
            "List all automation workflows with their enabled status and last run time. "
            "Shows workflow name, trigger type, whether it's enabled, and when it last ran."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_workflow_runs",
        "description": (
            "Get execution history for a specific workflow. Shows each run's status, "
            "trigger data, step results, and timestamps. Use list_workflows first to get the workflow_id."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string", "description": "UUID of the workflow"},
                "limit": {"type": "integer", "description": "Max runs to return (default 10)"},
            },
            "required": ["workflow_id"],
        },
    },
    {
        "name": "create_workflow",
        "description": (
            "Create a new automation workflow. Trigger types: contact_created, activity_logged, "
            "deal_stage_changed, email_sent. Steps define the actions to execute when triggered."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for the workflow"},
                "trigger_type": {
                    "type": "string",
                    "enum": ["contact_created", "activity_logged", "deal_stage_changed", "email_sent"],
                    "description": "Event that triggers this workflow",
                },
                "trigger_config": {
                    "type": "object",
                    "description": "Optional trigger configuration (e.g., filter conditions)",
                },
                "steps": {
                    "type": "array",
                    "description": "Array of step objects defining actions to execute",
                    "items": {"type": "object"},
                },
                "description": {"type": "string", "description": "Optional description of the workflow"},
            },
            "required": ["name", "trigger_type", "steps"],
        },
    },
    {
        "name": "update_workflow",
        "description": (
            "Update a workflow's name, description, trigger, or steps. "
            "Only provide the fields you want to change."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string", "description": "UUID of the workflow to update"},
                "name": {"type": "string", "description": "New name"},
                "description": {"type": "string", "description": "New description"},
                "trigger_type": {
                    "type": "string",
                    "enum": ["contact_created", "activity_logged", "deal_stage_changed", "email_sent"],
                    "description": "New trigger type",
                },
                "trigger_config": {"type": "object", "description": "New trigger configuration"},
                "steps": {
                    "type": "array",
                    "description": "New steps array",
                    "items": {"type": "object"},
                },
            },
            "required": ["workflow_id"],
        },
    },
    {
        "name": "delete_workflow",
        "description": "Delete a workflow and all its run history. This cannot be undone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string", "description": "UUID of the workflow to delete"},
            },
            "required": ["workflow_id"],
        },
    },
    {
        "name": "toggle_workflow",
        "description": "Enable or disable a workflow. Disabled workflows will not trigger on events.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string", "description": "UUID of the workflow"},
                "enabled": {"type": "boolean", "description": "True to enable, false to disable"},
            },
            "required": ["workflow_id", "enabled"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"list_workflows", "get_workflow_runs"}
AUTO_EXECUTE = {"toggle_workflow"}
WRITE = {"create_workflow", "update_workflow", "delete_workflow"}

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _list_workflows(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            SELECT w.id, w.name, w.description, w.trigger_type, w.trigger_config,
                   w.steps, w.enabled, w.created_at, w.updated_at,
                   (SELECT MAX(started_at) FROM workflow_runs wr
                    WHERE wr.workflow_id = w.id) AS last_run_at
            FROM workflows w
            WHERE w.agent_id = %s
            ORDER BY w.created_at DESC
        """, (agent_id,))
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


def _get_workflow_runs(agent_id: str, inp: dict):
    workflow_id = inp["workflow_id"]
    limit = inp.get("limit", 10)

    def go(cur):
        cur.execute("""
            SELECT id, workflow_id, trigger_data, status, current_step,
                   step_results, started_at, completed_at
            FROM workflow_runs
            WHERE workflow_id = %s AND agent_id = %s
            ORDER BY started_at DESC
            LIMIT %s
        """, (workflow_id, agent_id, limit))
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


# ---------------------------------------------------------------------------
# Auto-execute handlers
# ---------------------------------------------------------------------------

def _toggle_workflow(agent_id: str, inp: dict):
    workflow_id = inp["workflow_id"]
    enabled = inp["enabled"]

    def go(cur):
        cur.execute(
            """UPDATE workflows SET enabled = %s, updated_at = NOW()
               WHERE id = %s AND agent_id = %s
               RETURNING id, name, enabled""",
            (enabled, workflow_id, agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Workflow not found"}
        return dict(row)

    return _q(go)


# ---------------------------------------------------------------------------
# Write handlers
# ---------------------------------------------------------------------------

def _create_workflow(agent_id: str, inp: dict):
    name = inp["name"]
    trigger_type = inp["trigger_type"]
    steps = json.dumps(inp.get("steps", []))
    trigger_config = json.dumps(inp.get("trigger_config", {}))
    description = inp.get("description")

    def go(cur):
        cur.execute("""
            INSERT INTO workflows (agent_id, name, description, trigger_type, trigger_config, steps)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, name, description, trigger_type, trigger_config, steps, enabled, created_at
        """, (agent_id, name, description, trigger_type, trigger_config, steps))
        return dict(cur.fetchone())

    return _q(go)


def _update_workflow(agent_id: str, inp: dict):
    workflow_id = inp["workflow_id"]

    def go(cur):
        # Build dynamic SET clause
        set_parts = ["updated_at = NOW()"]
        params = []
        for field in ("name", "description", "trigger_type"):
            if field in inp:
                set_parts.append(f"{field} = %s")
                params.append(inp[field])
        for field in ("trigger_config", "steps"):
            if field in inp:
                set_parts.append(f"{field} = %s")
                params.append(json.dumps(inp[field]))

        params.extend([workflow_id, agent_id])
        cur.execute(f"""
            UPDATE workflows SET {', '.join(set_parts)}
            WHERE id = %s AND agent_id = %s
            RETURNING id, name, description, trigger_type, trigger_config, steps, enabled, created_at, updated_at
        """, params)
        row = cur.fetchone()
        if not row:
            return {"error": "Workflow not found"}
        return dict(row)

    return _q(go)


def _delete_workflow(agent_id: str, inp: dict):
    workflow_id = inp["workflow_id"]

    def go(cur):
        cur.execute(
            "DELETE FROM workflows WHERE id = %s AND agent_id = %s",
            (workflow_id, agent_id),
        )
        if cur.rowcount == 0:
            return {"error": "Workflow not found"}
        return {"deleted": True, "workflow_id": workflow_id}

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "list_workflows": _list_workflows,
    "get_workflow_runs": _get_workflow_runs,
}

_AUTO_DISPATCH = {
    "toggle_workflow": _toggle_workflow,
}

_WRITE_DISPATCH = {
    "create_workflow": _create_workflow,
    "update_workflow": _update_workflow,
    "delete_workflow": _delete_workflow,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown automation read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_auto(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute an auto-execute tool."""
    handler = _AUTO_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown automation auto-execute tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool."""
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown automation write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
