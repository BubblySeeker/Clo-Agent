"""
AI-native workflow executor.

Spawns a focused agent session for each workflow run, interpreting
the workflow instruction using the existing 34-tool AI agent.

Flow:
1. Check per-agent monthly run limit (100/month)
2. Create conversation with type='workflow_run'
3. Create workflow_runs row with instruction_snapshot
4. Call run_agent() with workflow execution prompt
5. Track success/failure and update run status
"""
import json
import logging
import uuid
from datetime import datetime, timezone

import psycopg2.extras

from app.database import get_conn, run_query
from app.services.agent import run_agent, build_system_prompt

logger = logging.getLogger(__name__)

MONTHLY_RUN_LIMIT = 100


def _check_monthly_limit(agent_id: str) -> int:
    """Return the number of workflow runs this agent has used this month."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT COUNT(*) FROM workflow_runs wr
               JOIN workflows w ON w.id = wr.workflow_id
               WHERE w.agent_id = %s
               AND wr.started_at >= date_trunc('month', NOW())""",
            (agent_id,),
        )
        return cur.fetchone()[0]


def _create_workflow_conversation(agent_id: str, workflow_name: str) -> str:
    """Create a conversation row for this workflow run."""
    conv_id = str(uuid.uuid4())
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO conversations (id, agent_id, title, type)
               VALUES (%s, %s, %s, 'workflow_run')""",
            (conv_id, agent_id, f"Workflow: {workflow_name}"),
        )
    return conv_id


def _create_workflow_run(
    workflow_id: str,
    conversation_id: str,
    instruction: str,
    is_dry_run: bool,
) -> str:
    """Create a workflow_runs row and return its ID."""
    run_id = str(uuid.uuid4())
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO workflow_runs
               (id, workflow_id, conversation_id, status, instruction_snapshot, is_dry_run, started_at)
               VALUES (%s, %s, %s, 'running', %s, %s, NOW())""",
            (run_id, workflow_id, conversation_id, instruction, is_dry_run),
        )
    return run_id


def _update_run_status(run_id: str, status: str, error_details: dict | None = None):
    """Update workflow run status and optionally set error details."""
    with get_conn() as conn:
        cur = conn.cursor()
        if error_details:
            cur.execute(
                """UPDATE workflow_runs
                   SET status = %s, error_details = %s, completed_at = NOW()
                   WHERE id = %s""",
                (status, json.dumps(error_details), run_id),
            )
        else:
            cur.execute(
                """UPDATE workflow_runs
                   SET status = %s, completed_at = NOW()
                   WHERE id = %s""",
                (status, run_id),
            )


def _get_workflow(workflow_id: str, agent_id: str) -> dict | None:
    """Fetch a workflow by ID, scoped to the agent."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT id, name, instruction, approval_mode, agent_id
               FROM workflows
               WHERE id = %s AND agent_id = %s""",
            (workflow_id, agent_id),
        )
        row = cur.fetchone()
        return dict(row) if row else None


async def execute_workflow(
    workflow_id: str,
    agent_id: str,
    instruction: str,
    approval_mode: str = "review",
    trigger_data: dict | None = None,
    is_dry_run: bool = False,
    workflow_name: str | None = None,
):
    """
    Execute a workflow by spawning a focused agent session.

    Yields SSE-formatted strings (same format as run_agent).
    Caller wraps this in a StreamingResponse.
    """
    from app.services.agent import sse

    # 1. Check monthly run limit
    run_count = await run_query(lambda: _check_monthly_limit(agent_id))
    if run_count >= MONTHLY_RUN_LIMIT and not is_dry_run:
        yield sse({"type": "error", "message": "Monthly workflow run limit reached (100/month)"})
        yield "data: [DONE]\n\n"
        return

    name = workflow_name or "Workflow"

    # 2. Create conversation for this run
    conversation_id = await run_query(
        lambda: _create_workflow_conversation(agent_id, name)
    )

    # 3. Create workflow run record
    run_id = await run_query(
        lambda: _create_workflow_run(workflow_id, conversation_id, instruction, is_dry_run)
    )

    yield sse({"type": "workflow_run_started", "run_id": run_id, "workflow_id": workflow_id})

    # 4. Build the user message — the instruction IS the task
    context_parts = [instruction]
    if trigger_data:
        context_parts.append(f"\nTrigger context: {json.dumps(trigger_data, default=str)}")

    user_message = "\n".join(context_parts)

    # 5. Run the agent
    try:
        async for event in run_agent(
            conversation_id=conversation_id,
            agent_id=agent_id,
            user_message=user_message,
            approval_mode=approval_mode,
            is_dry_run=is_dry_run,
            max_tool_rounds=8,
            prompt_mode="workflow_execution",
        ):
            yield event

        # 6. Success — update run status
        await run_query(lambda: _update_run_status(run_id, "completed"))

    except Exception as e:
        logger.error(f"Workflow execution failed: {e}", exc_info=True)
        error_details = {"error": str(e), "type": type(e).__name__}

        # Retry once on timeout
        if "timeout" in str(e).lower() or "timed out" in str(e).lower():
            logger.info(f"Retrying workflow {workflow_id} after timeout")
            try:
                async for event in run_agent(
                    conversation_id=conversation_id,
                    agent_id=agent_id,
                    user_message=user_message,
                    approval_mode=approval_mode,
                    is_dry_run=is_dry_run,
                    max_tool_rounds=8,
                    prompt_mode="workflow_execution",
                ):
                    yield event

                await run_query(lambda: _update_run_status(run_id, "completed"))
                return
            except Exception as retry_err:
                error_details = {
                    "error": str(retry_err),
                    "type": type(retry_err).__name__,
                    "retried": True,
                }

        await run_query(lambda: _update_run_status(run_id, "failed", error_details))
        yield sse({"type": "error", "message": f"Workflow failed: {str(e)}"})
        yield "data: [DONE]\n\n"
