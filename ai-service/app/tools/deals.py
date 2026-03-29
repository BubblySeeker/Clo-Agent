"""
Deal pipeline tools: CRUD for deals, stage lookups, and analytics.
"""
import psycopg2.extras

from app.database import get_conn, run_query

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _q(fn):
    """Execute fn(cursor) inside a pooled connection with RealDictCursor."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return fn(cur)


_UPDATABLE_FIELDS = {"stage_id", "title", "value", "notes"}


def _dynamic_update(table: str, row_id: str, agent_id: str, fields: dict, cur) -> dict:
    """Build and execute a dynamic UPDATE from allowed fields."""
    allowed = {k: v for k, v in fields.items() if k in _UPDATABLE_FIELDS}
    if not allowed:
        return {"error": "No valid fields to update"}
    set_clause = ", ".join(f"{k} = %s" for k in allowed)
    vals = list(allowed.values()) + [row_id, agent_id]
    cur.execute(
        f"UPDATE {table} SET {set_clause}, updated_at = NOW() "
        f"WHERE id = %s AND agent_id = %s RETURNING id",
        vals,
    )
    row = cur.fetchone()
    if not row:
        return {"error": "Deal not found or access denied"}
    return {"updated": True, "deal_id": row_id}


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

DEFINITIONS: list[dict] = [
    {
        "name": "list_deals",
        "description": "List deals, optionally filtered by pipeline stage or contact.",
        "input_schema": {
            "type": "object",
            "properties": {
                "stage_name": {
                    "type": "string",
                    "description": "Filter by stage name (e.g. Lead, Offer, Closed)",
                },
                "contact_id": {
                    "type": "string",
                    "description": "Filter by contact UUID",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 20)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_deal",
        "description": "Get full details for a single deal including contact name and current stage.",
        "input_schema": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "UUID of the deal"},
            },
            "required": ["deal_id"],
        },
    },
    {
        "name": "get_deal_stages",
        "description": "Get the 7 pipeline stages with names, positions, and colors.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "create_deal",
        "description": "Create a new pipeline deal. Defaults to \"Lead\" stage. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
                "title": {"type": "string", "description": "Deal title"},
                "value": {"type": "number", "description": "Deal value in dollars"},
                "notes": {"type": "string", "description": "Optional notes"},
                "stage_name": {
                    "type": "string",
                    "description": "Pipeline stage name (default: Lead)",
                },
            },
            "required": ["contact_id", "title"],
        },
    },
    {
        "name": "update_deal",
        "description": "Update deal fields or move to a different stage. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "UUID of the deal"},
                "stage_name": {"type": "string", "description": "Move to this stage"},
                "title": {"type": "string", "description": "New title"},
                "value": {"type": "number", "description": "New deal value"},
                "notes": {"type": "string", "description": "Updated notes"},
            },
            "required": ["deal_id"],
        },
    },
    {
        "name": "delete_deal",
        "description": "Remove a deal from the pipeline. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "UUID of the deal to delete"},
            },
            "required": ["deal_id"],
        },
    },
]

READ = {"list_deals", "get_deal", "get_deal_stages"}
AUTO_EXECUTE: set[str] = set()
WRITE = {"create_deal", "update_deal", "delete_deal"}

# ---------------------------------------------------------------------------
# Read operations
# ---------------------------------------------------------------------------


def _list_deals(agent_id: str, inp: dict) -> list:
    stage_name = inp.get("stage_name")
    contact_id = inp.get("contact_id")
    limit = inp.get("limit", 20)

    def query(cur):
        clauses = ["d.agent_id = %s"]
        params: list = [agent_id]
        if stage_name:
            clauses.append("s.name = %s")
            params.append(stage_name)
        if contact_id:
            clauses.append("d.contact_id = %s")
            params.append(contact_id)
        params.append(limit)
        cur.execute(
            f"""
            SELECT d.id, d.title, d.value, d.notes, d.created_at,
                   s.name AS stage_name, s.color AS stage_color,
                   c.first_name || ' ' || c.last_name AS contact_name
            FROM deals d
            JOIN deal_stages s ON s.id = d.stage_id
            JOIN contacts c ON c.id = d.contact_id
            WHERE {' AND '.join(clauses)}
            ORDER BY d.created_at DESC
            LIMIT %s
            """,
            params,
        )
        return [dict(r) for r in cur.fetchall()]

    return _q(query)


def _get_deal(agent_id: str, deal_id: str) -> dict:
    def query(cur):
        cur.execute(
            """
            SELECT d.id, d.title, d.value, d.notes,
                   d.created_at, d.updated_at,
                   s.name AS stage_name, s.color AS stage_color,
                   c.id AS contact_id,
                   c.first_name || ' ' || c.last_name AS contact_name
            FROM deals d
            JOIN deal_stages s ON s.id = d.stage_id
            JOIN contacts c ON c.id = d.contact_id
            WHERE d.id = %s AND d.agent_id = %s
            """,
            (deal_id, agent_id),
        )
        row = cur.fetchone()
        return dict(row) if row else {"error": "Deal not found"}

    return _q(query)


def _get_deal_stages() -> list:
    def query(cur):
        cur.execute(
            "SELECT id, name, position, color FROM deal_stages ORDER BY position"
        )
        return [dict(r) for r in cur.fetchall()]

    return _q(query)


def _get_analytics(agent_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Pipeline summary: counts and total value per stage
        cur.execute(
            """
            SELECT s.name, s.color, s.position,
                   COUNT(d.id) AS deal_count,
                   COALESCE(SUM(d.value), 0) AS total_value
            FROM deal_stages s
            LEFT JOIN deals d ON d.stage_id = s.id AND d.agent_id = %s
            GROUP BY s.id, s.name, s.color, s.position
            ORDER BY s.position
            """,
            (agent_id,),
        )
        pipeline = [dict(r) for r in cur.fetchall()]

        # 30-day activity counts by type
        cur.execute(
            """
            SELECT type, COUNT(*) AS count
            FROM activities
            WHERE agent_id = %s AND created_at > NOW() - INTERVAL '30 days'
            GROUP BY type
            """,
            (agent_id,),
        )
        activity_30d = {r["type"]: int(r["count"]) for r in cur.fetchall()}

        # Contact source breakdown
        cur.execute(
            """
            SELECT COALESCE(source, 'Unknown') AS source, COUNT(*) AS count
            FROM contacts
            WHERE agent_id = %s
            GROUP BY source
            """,
            (agent_id,),
        )
        sources = {r["source"]: int(r["count"]) for r in cur.fetchall()}

    return {
        "pipeline_by_stage": pipeline,
        "activity_counts_30d": activity_30d,
        "contact_sources": sources,
    }


# ---------------------------------------------------------------------------
# Write operations
# ---------------------------------------------------------------------------


def _create_deal(agent_id: str, inp: dict) -> dict:
    stage_name = inp.get("stage_name", "Lead")

    def query(cur):
        cur.execute("SELECT id FROM deal_stages WHERE name = %s", (stage_name,))
        stage = cur.fetchone()
        if not stage:
            return {"error": f"Stage '{stage_name}' not found"}
        cur.execute(
            """
            INSERT INTO deals (agent_id, contact_id, stage_id, title, value, notes)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, title, value, created_at
            """,
            (
                agent_id,
                inp["contact_id"],
                stage["id"],
                inp["title"],
                inp.get("value"),
                inp.get("notes"),
            ),
        )
        return dict(cur.fetchone())

    return _q(query)


def _update_deal(agent_id: str, inp: dict) -> dict:
    inp = dict(inp)
    deal_id = inp.pop("deal_id")
    stage_name = inp.pop("stage_name", None)

    def query(cur):
        fields = dict(inp)
        if stage_name:
            cur.execute("SELECT id FROM deal_stages WHERE name = %s", (stage_name,))
            row = cur.fetchone()
            if not row:
                return {"error": f"Stage '{stage_name}' not found"}
            fields["stage_id"] = str(row["id"])
        return _dynamic_update("deals", deal_id, agent_id, fields, cur)

    return _q(query)


def _delete_deal(agent_id: str, deal_id: str) -> dict:
    def query(cur):
        cur.execute(
            "SELECT title FROM deals WHERE id = %s AND agent_id = %s",
            (deal_id, agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Deal not found"}
        cur.execute(
            "DELETE FROM deals WHERE id = %s AND agent_id = %s",
            (deal_id, agent_id),
        )
        return {"deleted": True, "deal": row["title"]}

    return _q(query)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "list_deals": lambda inp, aid: _list_deals(aid, inp),
    "get_deal": lambda inp, aid: _get_deal(aid, inp["deal_id"]),
    "get_deal_stages": lambda inp, aid: _get_deal_stages(),
}

_WRITE_DISPATCH = {
    "create_deal": lambda inp, aid: _create_deal(aid, inp),
    "update_deal": lambda inp, aid: _update_deal(aid, inp),
    "delete_deal": lambda inp, aid: _delete_deal(aid, inp["deal_id"]),
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool in this domain."""
    fn = _READ_DISPATCH.get(tool_name)
    if not fn:
        raise ValueError(f"Unknown deal read tool: {tool_name}")
    return await run_query(lambda: fn(tool_input, agent_id))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool in this domain."""
    fn = _WRITE_DISPATCH.get(tool_name)
    if not fn:
        raise ValueError(f"Unknown deal write tool: {tool_name}")
    return await run_query(lambda: fn(tool_input, agent_id))
