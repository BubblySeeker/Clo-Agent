"""
Search tools: semantic search and dashboard summary.
"""
import logging
import psycopg2.extras

from app.database import get_conn, run_query

log = logging.getLogger(__name__)

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
        "name": "semantic_search",
        "description": (
            "Search CRM data by meaning rather than exact text. "
            "Uses vector embeddings to find contacts, deals, and activities "
            "that match the intent of your query."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query"},
                "limit": {"type": "integer", "description": "Max results to return (default 10)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_dashboard_summary",
        "description": (
            "Get a high-level summary of the agent's CRM: total contacts, "
            "active deals, pipeline value, recent activities (7 days), "
            "and deals closed this month."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"semantic_search", "get_dashboard_summary"}
AUTO_EXECUTE: set[str] = set()
WRITE: set[str] = set()

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _semantic_search(agent_id: str, inp: dict):
    try:
        from app.services.embeddings import semantic_search
        return semantic_search(inp["query"], agent_id, inp.get("limit", 10))
    except Exception as e:
        log.warning("semantic_search failed: %s", e)
        return [{"error": str(e)}]


def _get_dashboard_summary(agent_id: str, inp: dict):
    def go(cur):
        cur.execute(
            "SELECT COUNT(*) AS total FROM contacts WHERE agent_id = %s",
            (agent_id,),
        )
        total_contacts = cur.fetchone()["total"]

        cur.execute("""
            SELECT COUNT(*) AS active, COALESCE(SUM(value), 0) AS pipeline_value
            FROM deals d JOIN deal_stages s ON s.id = d.stage_id
            WHERE d.agent_id = %s AND s.name NOT IN ('Closed', 'Lost')
        """, (agent_id,))
        row = cur.fetchone()

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM activities "
            "WHERE agent_id = %s AND created_at > NOW() - INTERVAL '7 days'",
            (agent_id,),
        )
        recent_activities = cur.fetchone()["cnt"]

        cur.execute("""
            SELECT COUNT(*) AS cnt FROM deals d JOIN deal_stages s ON s.id = d.stage_id
            WHERE d.agent_id = %s AND s.name = 'Closed'
              AND d.updated_at > date_trunc('month', NOW())
        """, (agent_id,))
        closed_this_month = cur.fetchone()["cnt"]

        return {
            "total_contacts": int(total_contacts),
            "active_deals": int(row["active"]),
            "pipeline_value": float(row["pipeline_value"]),
            "recent_activities_7d": int(recent_activities),
            "closed_this_month": int(closed_this_month),
        }

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "semantic_search": _semantic_search,
    "get_dashboard_summary": _get_dashboard_summary,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown search read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
