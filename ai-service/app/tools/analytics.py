"""
Analytics tools: pipeline, activity, and contact metrics via backend proxy.
"""
import logging

import httpx

from app.config import BACKEND_URL, AI_SERVICE_SECRET

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

DEFINITIONS: list[dict] = [
    {
        "name": "get_analytics",
        "description": (
            "Get CRM analytics and metrics. "
            "Type 'pipeline' returns deal stage counts and values. "
            "Type 'activities' returns activity volume by type and time period. "
            "Type 'contacts' returns contact growth, source breakdown, and engagement metrics."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["pipeline", "activities", "contacts"],
                    "description": "Which analytics to retrieve",
                },
            },
            "required": ["type"],
        },
    },
]

READ: set[str] = {"get_analytics"}
AUTO_EXECUTE: set[str] = set()
WRITE: set[str] = set()

# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------

async def _get_analytics(agent_id: str, inp: dict) -> dict:
    analytics_type = inp["type"]
    url = f"{BACKEND_URL}/api/analytics/{analytics_type}"
    headers = {
        "X-AI-Service-Secret": AI_SERVICE_SECRET,
        "X-Agent-ID": agent_id,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)

        if resp.status_code == 200:
            return resp.json()

        try:
            detail = resp.json().get("error", resp.text)
        except Exception:
            detail = resp.text
        return {"error": f"Analytics request failed ({resp.status_code}): {detail}"}

    except httpx.ConnectError:
        return {"error": "Go backend not reachable."}
    except httpx.TimeoutException:
        return {"error": "Timed out — try again."}
    except Exception as exc:
        logger.error("get_analytics proxy failed: %s", exc)
        return {"error": f"Analytics request failed: {exc}"}

# ---------------------------------------------------------------------------
# Dispatchers
# ---------------------------------------------------------------------------

async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    if tool_name == "get_analytics":
        return await _get_analytics(agent_id, tool_input)
    raise ValueError(f"Unknown analytics tool: {tool_name}")
