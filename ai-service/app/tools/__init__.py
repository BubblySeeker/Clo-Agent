"""
Tool registry: aggregates domain files into a unified interface.

Exports:
  TOOL_DEFINITIONS  — list of all tool schemas for Anthropic API
  READ_TOOLS        — set of tool names that execute immediately
  AUTO_EXECUTE_TOOLS — set of tool names that auto-execute + notify
  WRITE_TOOLS       — set of tool names that require confirmation
  execute_tool()    — dispatch read/auto-execute tool by name
  queue_write_tool() — queue a write tool for confirmation
  execute_write_tool() — execute a confirmed write tool
"""
import json
import logging
import uuid
from typing import Any

import psycopg2.extras

from app.database import get_conn, run_query
from app.tools.workflows import schedule_workflow_trigger, schedule_embed
from app.tools import contacts as _contacts
from app.tools import deals as _deals
from app.tools import emails as _emails
from app.tools import activities as _activities
from app.tools import tasks as _tasks
from app.tools import properties as _properties
from app.tools import documents as _documents
from app.tools import folders as _folders
from app.tools import leads as _leads
from app.tools import search as _search
from app.tools import automations as _automations
from app.tools import workflows as _workflows
from app.tools import portal as _portal
from app.tools import analytics as _analytics

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Aggregate from domain modules
# ---------------------------------------------------------------------------

_DOMAIN_MODULES = [
    _contacts, _deals, _emails,
    _activities, _tasks, _properties,
    _documents, _folders, _leads, _search, _automations, _workflows, _portal,
    _analytics,
]

TOOL_DEFINITIONS: list[dict] = []
READ_TOOLS: set[str] = set()
AUTO_EXECUTE_TOOLS: set[str] = set()
WRITE_TOOLS: set[str] = set()

for _mod in _DOMAIN_MODULES:
    TOOL_DEFINITIONS.extend(_mod.DEFINITIONS)
    READ_TOOLS |= _mod.READ
    AUTO_EXECUTE_TOOLS |= _mod.AUTO_EXECUTE
    WRITE_TOOLS |= _mod.WRITE

# Map tool name → domain module for dispatch
_TOOL_DISPATCH: dict[str, Any] = {}
for _mod in _DOMAIN_MODULES:
    for _defn in _mod.DEFINITIONS:
        _TOOL_DISPATCH[_defn["name"]] = _mod

# ---------------------------------------------------------------------------
# Executors
# ---------------------------------------------------------------------------

async def execute_tool(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read or auto-execute tool by name."""
    mod = _TOOL_DISPATCH.get(tool_name)
    if mod is None:
        return {"error": f"Unknown tool: {tool_name}"}

    # AUTO_EXECUTE tools use a separate dispatcher if available
    if tool_name in AUTO_EXECUTE_TOOLS and hasattr(mod, "execute_auto"):
        return await mod.execute_auto(tool_name, tool_input, agent_id)

    return await mod.execute(tool_name, tool_input, agent_id)


def queue_write_tool(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Queue a write tool for user confirmation via pending_actions table."""
    pending_id = str(uuid.uuid4())
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO pending_actions (id, agent_id, tool, input)
               VALUES (%s, %s, %s, %s)""",
            (pending_id, agent_id, tool_name, json.dumps(tool_input)),
        )
    return {
        "tool": tool_name,
        "preview": tool_input,
        "pending_id": pending_id,
    }


async def execute_write_tool(pending_id: str, agent_id: str) -> dict:
    """Execute a confirmed write tool from pending_actions."""
    def _fetch_and_delete():
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """DELETE FROM pending_actions
                   WHERE id = %s AND agent_id = %s AND expires_at >= NOW()
                   RETURNING tool, input, agent_id""",
                (pending_id, agent_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None

    action = await run_query(_fetch_and_delete)
    if not action:
        return {"error": "Pending action not found, expired, or already executed", "error_type": "expired"}

    tool_name = action["tool"]
    inp = action["input"] if isinstance(action["input"], dict) else json.loads(action["input"])
    aid = action["agent_id"]

    mod = _TOOL_DISPATCH.get(tool_name)
    if mod is None:
        return {"error": f"Unknown tool: {tool_name}"}

    if not hasattr(mod, "execute_write"):
        return {"error": f"Tool {tool_name} has no write executor"}

    result = await mod.execute_write(tool_name, inp, aid)

    # Fire workflow triggers + embedding hooks (non-blocking, fire-and-forget)
    if "error" not in result:
        schedule_workflow_trigger(tool_name, aid, inp, result)
        # Embed new/updated contacts and activities
        if tool_name in ("create_contact", "update_contact") and "id" in result:
            schedule_embed("contact", result["id"], aid)
        elif tool_name == "log_activity" and "id" in result:
            schedule_embed("activity", result["id"], aid)

    return result
