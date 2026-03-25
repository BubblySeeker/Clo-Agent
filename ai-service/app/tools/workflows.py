"""
Workflow triggers and embedding hooks.

Called by __init__.py after write tools execute successfully.
These are fire-and-forget background tasks.
"""
import asyncio
import logging

from app.database import run_query

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module exports (no tool definitions — this is a helper module)
# ---------------------------------------------------------------------------

DEFINITIONS = []
READ = set()
AUTO_EXECUTE = set()
WRITE = set()

# ---------------------------------------------------------------------------
# Tool → workflow trigger mapping
# ---------------------------------------------------------------------------

TOOL_TO_TRIGGER = {
    "create_contact": "contact_created",
    "log_activity": "activity_logged",
    "update_deal": "deal_stage_changed",
    "send_email": "email_sent",
}


def schedule_workflow_trigger(
    tool_name: str, agent_id: str, inp: dict, result: dict
) -> None:
    """Fire matching workflows in a background task after a write tool executes."""
    trigger_type = TOOL_TO_TRIGGER.get(tool_name)
    if not trigger_type:
        return
    trigger_data = {
        **inp,
        **{k: v for k, v in result.items() if isinstance(v, (str, int, float, bool, type(None)))},
    }
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_trigger_workflows_async(trigger_type, agent_id, trigger_data))
    except RuntimeError:
        pass


async def _trigger_workflows_async(
    trigger_type: str, agent_id: str, trigger_data: dict
) -> None:
    try:
        from app.services.workflow_engine import trigger_workflows
        await run_query(lambda: trigger_workflows(trigger_type, agent_id, trigger_data))
    except Exception as e:
        logger.warning("Workflow trigger failed for %s: %s", trigger_type, e)


# ---------------------------------------------------------------------------
# Embedding hooks (fire-and-forget)
# ---------------------------------------------------------------------------

def schedule_embed(source_type: str, source_id: str, agent_id: str) -> None:
    """Schedule embedding generation in a background task (non-blocking)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_embed_async(source_type, source_id, agent_id))
    except RuntimeError:
        pass


async def _embed_async(source_type: str, source_id: str, agent_id: str) -> None:
    try:
        from app.services.embeddings import embed_contact, embed_activity
        if source_type == "contact":
            await run_query(lambda: embed_contact(source_id, agent_id))
        elif source_type == "activity":
            await run_query(lambda: embed_activity(source_id, agent_id))
    except Exception as e:
        logger.warning("Embedding generation failed for %s/%s: %s", source_type, source_id, e)


# ---------------------------------------------------------------------------
# No-op execute (this module has no executable tools)
# ---------------------------------------------------------------------------

async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    raise ValueError(f"workflows has no executable tools: {tool_name}")
