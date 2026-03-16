"""
Tool definitions and execution functions for the CloAgent AI assistant.

Read tools execute immediately.
Write tools return a confirmation_required payload; the /ai/confirm endpoint
executes them after the user approves via the frontend confirmation card.
"""
import json
import uuid
from typing import Any

import psycopg2.extras

from app.database import get_conn, run_query

# ---------------------------------------------------------------------------
# In-memory pending actions store (MVP — not shared across workers)
# ---------------------------------------------------------------------------
pending_actions: dict[str, dict] = {}

# ---------------------------------------------------------------------------
# Tool definitions (Anthropic tool schema format)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "name": "get_dashboard_summary",
        "description": "Get total contacts, active deals, total pipeline value, and recent activity counts for the agent.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "search_contacts",
        "description": "Search for contacts by name, email, or filter by source. Returns matching contacts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term to match against first_name, last_name, or email"},
                "source": {"type": "string", "description": "Filter by lead source (e.g. Zillow, Referral, Cold Call)"},
                "limit": {"type": "integer", "description": "Max number of results (default 10)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_contact_details",
        "description": "Get full profile for a single contact including buyer profile if available.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "get_contact_activities",
        "description": "Get activity history (calls, emails, notes, showings, tasks) for a contact.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "list_deals",
        "description": "List deals with optional stage or contact filters.",
        "input_schema": {
            "type": "object",
            "properties": {
                "stage_name": {"type": "string", "description": "Filter by stage name (e.g. Lead, Offer, Closed)"},
                "contact_id": {"type": "string", "description": "Filter by contact UUID"},
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_deal_stages",
        "description": "Get all 7 pipeline stages with their names, positions, and colors.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_analytics",
        "description": "Get pipeline analytics: deal counts and values by stage, activity volume, contact source breakdown.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "create_contact",
        "description": "Create a new contact. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "source": {"type": "string", "description": "Lead source (Zillow, Referral, Cold Call, Open House, WhatsApp)"},
            },
            "required": ["first_name", "last_name"],
        },
    },
    {
        "name": "update_contact",
        "description": "Update contact information. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "source": {"type": "string"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "log_activity",
        "description": "Log a call, email, note, showing, or task for a contact. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "type": {"type": "string", "enum": ["call", "email", "note", "showing", "task"]},
                "body": {"type": "string", "description": "Description of the activity"},
            },
            "required": ["contact_id", "type", "body"],
        },
    },
    {
        "name": "create_deal",
        "description": "Create a new deal in the pipeline. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "stage_name": {"type": "string", "description": "Pipeline stage name (e.g. Lead, Contacted, Offer)"},
                "title": {"type": "string"},
                "value": {"type": "number", "description": "Deal value in dollars"},
                "notes": {"type": "string"},
            },
            "required": ["contact_id", "title"],
        },
    },
    {
        "name": "update_deal",
        "description": "Update a deal (e.g. move to a different pipeline stage). Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string"},
                "stage_name": {"type": "string"},
                "title": {"type": "string"},
                "value": {"type": "number"},
                "notes": {"type": "string"},
            },
            "required": ["deal_id"],
        },
    },
    {
        "name": "get_overdue_tasks",
        "description": "Get all tasks past their due date and not yet completed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "create_task",
        "description": "Create a new task with due date and priority. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "body": {"type": "string", "description": "Task description"},
                "due_date": {"type": "string", "description": "YYYY-MM-DD"},
                "priority": {"type": "string", "enum": ["high", "medium", "low"]},
            },
            "required": ["body", "due_date"],
        },
    },
    {
        "name": "complete_task",
        "description": "Mark a task as completed. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task UUID"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "reschedule_task",
        "description": "Change a task's due date. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "new_due_date": {"type": "string", "description": "YYYY-MM-DD"},
            },
            "required": ["task_id", "new_due_date"],
        },
    },
]

READ_TOOLS = {
    "get_dashboard_summary",
    "search_contacts",
    "get_contact_details",
    "get_contact_activities",
    "list_deals",
    "get_deal_stages",
    "get_analytics",
    "get_overdue_tasks",
}

WRITE_TOOLS = {
    "create_contact",
    "update_contact",
    "log_activity",
    "create_deal",
    "update_deal",
    "create_task",
    "complete_task",
    "reschedule_task",
}

# ---------------------------------------------------------------------------
# Read tool executors
# ---------------------------------------------------------------------------

async def execute_read_tool(tool_name: str, tool_input: dict, agent_id: str) -> Any:
    if tool_name == "get_dashboard_summary":
        return await run_query(lambda: _get_dashboard_summary(agent_id))
    elif tool_name == "search_contacts":
        return await run_query(lambda: _search_contacts(agent_id, tool_input))
    elif tool_name == "get_contact_details":
        return await run_query(lambda: _get_contact_details(agent_id, tool_input["contact_id"]))
    elif tool_name == "get_contact_activities":
        return await run_query(lambda: _get_contact_activities(agent_id, tool_input["contact_id"], tool_input.get("limit", 20)))
    elif tool_name == "list_deals":
        return await run_query(lambda: _list_deals(agent_id, tool_input))
    elif tool_name == "get_deal_stages":
        return await run_query(lambda: _get_deal_stages())
    elif tool_name == "get_analytics":
        return await run_query(lambda: _get_analytics(agent_id))
    elif tool_name == "get_overdue_tasks":
        return await run_query(lambda: _get_overdue_tasks(agent_id, tool_input.get("limit", 20)))
    else:
        return {"error": f"Unknown tool: {tool_name}"}


def _get_dashboard_summary(agent_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT COUNT(*) AS total FROM contacts WHERE agent_id = %s", (agent_id,))
        total_contacts = cur.fetchone()["total"]

        cur.execute(
            """SELECT COUNT(*) AS active,
                      COALESCE(SUM(value), 0) AS pipeline_value
               FROM deals d
               JOIN deal_stages s ON s.id = d.stage_id
               WHERE d.agent_id = %s AND s.name NOT IN ('Closed', 'Lost')""",
            (agent_id,),
        )
        row = cur.fetchone()

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM activities WHERE agent_id = %s AND created_at > NOW() - INTERVAL '7 days'",
            (agent_id,),
        )
        recent_activities = cur.fetchone()["cnt"]

        cur.execute(
            """SELECT COUNT(*) AS cnt FROM deals d
               JOIN deal_stages s ON s.id = d.stage_id
               WHERE d.agent_id = %s AND s.name = 'Closed'
               AND d.updated_at > date_trunc('month', NOW())""",
            (agent_id,),
        )
        closed_this_month = cur.fetchone()["cnt"]

        return {
            "total_contacts": int(total_contacts),
            "active_deals": int(row["active"]),
            "pipeline_value": float(row["pipeline_value"]),
            "recent_activities_7d": int(recent_activities),
            "closed_this_month": int(closed_this_month),
        }


def _search_contacts(agent_id: str, inp: dict) -> list:
    query = inp.get("query", "")
    source = inp.get("source")
    limit = inp.get("limit", 10)

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        params: list = [agent_id]
        where_clauses = ["c.agent_id = %s"]

        if query:
            params.append(f"%{query}%")
            params.append(f"%{query}%")
            params.append(f"%{query}%")
            where_clauses.append(
                "(c.first_name ILIKE %s OR c.last_name ILIKE %s OR c.email ILIKE %s)"
            )
        if source:
            params.append(source)
            where_clauses.append("c.source = %s")

        params.append(limit)
        sql = f"""
            SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.source, c.created_at,
                   MAX(a.created_at) AS last_activity_at
            FROM contacts c
            LEFT JOIN activities a ON a.contact_id = c.id
            WHERE {' AND '.join(where_clauses)}
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT %s
        """
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def _get_contact_details(agent_id: str, contact_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        contact = cur.fetchone()
        if not contact:
            return {"error": "Contact not found"}

        cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        bp = cur.fetchone()

        result = dict(contact)
        result["buyer_profile"] = dict(bp) if bp else None
        return result


def _get_contact_activities(agent_id: str, contact_id: str, limit: int) -> list:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT id, type, body, created_at FROM activities
               WHERE contact_id = %s AND agent_id = %s
               ORDER BY created_at DESC LIMIT %s""",
            (contact_id, agent_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def _list_deals(agent_id: str, inp: dict) -> list:
    stage_name = inp.get("stage_name")
    contact_id = inp.get("contact_id")
    limit = inp.get("limit", 20)

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        params: list = [agent_id]
        where_clauses = ["d.agent_id = %s"]

        if stage_name:
            params.append(stage_name)
            where_clauses.append("s.name = %s")
        if contact_id:
            params.append(contact_id)
            where_clauses.append("d.contact_id = %s")

        params.append(limit)
        sql = f"""
            SELECT d.id, d.title, d.value, d.notes, d.created_at,
                   s.name AS stage_name, s.color AS stage_color,
                   c.first_name || ' ' || c.last_name AS contact_name
            FROM deals d
            JOIN deal_stages s ON s.id = d.stage_id
            JOIN contacts c ON c.id = d.contact_id
            WHERE {' AND '.join(where_clauses)}
            ORDER BY d.created_at DESC LIMIT %s
        """
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def _get_deal_stages() -> list:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, name, position, color FROM deal_stages ORDER BY position")
        return [dict(r) for r in cur.fetchall()]


def _get_analytics(agent_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Pipeline by stage
        cur.execute(
            """SELECT s.name, s.color, COUNT(d.id) AS count, COALESCE(SUM(d.value), 0) AS total_value
               FROM deal_stages s
               LEFT JOIN deals d ON d.stage_id = s.id AND d.agent_id = %s
               GROUP BY s.id ORDER BY s.position""",
            (agent_id,),
        )
        pipeline = [dict(r) for r in cur.fetchall()]

        # Activity counts by type (last 30 days)
        cur.execute(
            """SELECT type, COUNT(*) AS count FROM activities
               WHERE agent_id = %s AND created_at > NOW() - INTERVAL '30 days'
               GROUP BY type""",
            (agent_id,),
        )
        activity_counts = {r["type"]: int(r["count"]) for r in cur.fetchall()}

        # Contact sources
        cur.execute(
            "SELECT source, COUNT(*) AS count FROM contacts WHERE agent_id = %s GROUP BY source",
            (agent_id,),
        )
        sources = {r["source"] or "Unknown": int(r["count"]) for r in cur.fetchall()}

        return {
            "pipeline_by_stage": pipeline,
            "activity_counts_30d": activity_counts,
            "contact_sources": sources,
        }


# ---------------------------------------------------------------------------
# Write tool: queue for confirmation
# ---------------------------------------------------------------------------

def queue_write_tool(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    pending_id = str(uuid.uuid4())
    pending_actions[pending_id] = {
        "tool": tool_name,
        "input": tool_input,
        "agent_id": agent_id,
    }
    return {
        "confirmation_required": True,
        "tool": tool_name,
        "preview": tool_input,
        "pending_id": pending_id,
    }


# ---------------------------------------------------------------------------
# Write tool executor (called from /ai/confirm)
# ---------------------------------------------------------------------------

async def execute_write_tool(pending_id: str) -> dict:
    action = pending_actions.pop(pending_id, None)
    if not action:
        return {"error": "Pending action not found or already executed"}

    tool_name = action["tool"]
    inp = action["input"]
    agent_id = action["agent_id"]

    if tool_name == "create_contact":
        return await run_query(lambda: _create_contact(agent_id, inp))
    elif tool_name == "update_contact":
        return await run_query(lambda: _update_contact(agent_id, inp))
    elif tool_name == "log_activity":
        return await run_query(lambda: _log_activity(agent_id, inp))
    elif tool_name == "create_deal":
        return await run_query(lambda: _create_deal(agent_id, inp))
    elif tool_name == "update_deal":
        return await run_query(lambda: _update_deal(agent_id, inp))
    elif tool_name == "create_task":
        return await run_query(lambda: _create_task(agent_id, inp))
    elif tool_name == "complete_task":
        return await run_query(lambda: _complete_task(agent_id, inp))
    elif tool_name == "reschedule_task":
        return await run_query(lambda: _reschedule_task(agent_id, inp))
    else:
        return {"error": f"Unknown write tool: {tool_name}"}


def _create_contact(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING id, first_name, last_name, email, phone, source, created_at""",
            (agent_id, inp["first_name"], inp["last_name"],
             inp.get("email"), inp.get("phone"), inp.get("source")),
        )
        return dict(cur.fetchone())


def _update_contact(agent_id: str, inp: dict) -> dict:
    contact_id = inp.pop("contact_id")
    if not inp:
        return {"error": "No fields to update"}
    fields = ", ".join(f"{k} = %s" for k in inp)
    vals = list(inp.values()) + [contact_id, agent_id]
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            f"UPDATE contacts SET {fields} WHERE id = %s AND agent_id = %s RETURNING id",
            vals,
        )
        row = cur.fetchone()
        return {"updated": bool(row), "contact_id": contact_id}


def _log_activity(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO activities (agent_id, contact_id, type, body)
               VALUES (%s, %s, %s, %s)
               RETURNING id, type, body, created_at""",
            (agent_id, inp["contact_id"], inp["type"], inp["body"]),
        )
        return dict(cur.fetchone())


def _create_deal(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        stage_name = inp.get("stage_name", "Lead")
        cur.execute("SELECT id FROM deal_stages WHERE name = %s", (stage_name,))
        stage_row = cur.fetchone()
        if not stage_row:
            return {"error": f"Stage '{stage_name}' not found"}
        cur.execute(
            """INSERT INTO deals (agent_id, contact_id, stage_id, title, value, notes)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING id, title, value, created_at""",
            (agent_id, inp["contact_id"], stage_row["id"],
             inp["title"], inp.get("value"), inp.get("notes")),
        )
        return dict(cur.fetchone())


def _update_deal(agent_id: str, inp: dict) -> dict:
    deal_id = inp.pop("deal_id")
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if "stage_name" in inp:
            stage_name = inp.pop("stage_name")
            cur.execute("SELECT id FROM deal_stages WHERE name = %s", (stage_name,))
            row = cur.fetchone()
            if row:
                inp["stage_id"] = str(row["id"])
        if not inp:
            return {"error": "No fields to update"}
        fields = ", ".join(f"{k} = %s" for k in inp)
        vals = list(inp.values()) + [deal_id, agent_id]
        cur.execute(
            f"UPDATE deals SET {fields} WHERE id = %s AND agent_id = %s RETURNING id",
            vals,
        )
        row = cur.fetchone()
        return {"updated": bool(row), "deal_id": deal_id}


def _get_overdue_tasks(agent_id: str, limit: int) -> list:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT a.id, a.body, a.due_date, a.priority, a.created_at,
                      c.first_name || ' ' || c.last_name AS contact_name
               FROM activities a
               LEFT JOIN contacts c ON c.id = a.contact_id
               WHERE a.agent_id = %s AND a.type = 'task'
                 AND a.due_date < CURRENT_DATE AND a.completed_at IS NULL
               ORDER BY a.due_date ASC
               LIMIT %s""",
            (agent_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def _create_task(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO activities (agent_id, contact_id, type, body, due_date, priority)
               VALUES (%s, %s, 'task', %s, %s, %s)
               RETURNING id, body, due_date, priority, created_at""",
            (agent_id, inp.get("contact_id"), inp["body"],
             inp["due_date"], inp.get("priority", "medium")),
        )
        return dict(cur.fetchone())


def _complete_task(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """UPDATE activities SET completed_at = NOW()
               WHERE id = %s AND agent_id = %s AND type = 'task'
               RETURNING id, body, completed_at""",
            (inp["task_id"], agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Task not found"}
        return dict(row)


def _reschedule_task(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """UPDATE activities SET due_date = %s
               WHERE id = %s AND agent_id = %s AND type = 'task'
               RETURNING id, body, due_date""",
            (inp["new_due_date"], inp["task_id"], agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Task not found"}
        return dict(row)
