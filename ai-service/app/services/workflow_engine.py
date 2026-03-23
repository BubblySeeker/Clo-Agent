"""
Workflow automation engine.

Matches trigger events to enabled workflows and executes their steps sequentially.
Step types: create_task, log_activity, wait, update_deal, ai_message.
"""
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

import psycopg2.extras

from app.database import get_conn

logger = logging.getLogger(__name__)


def find_matching_workflows(trigger_type: str, agent_id: str) -> list[dict]:
    """Find all enabled workflows that match a given trigger type."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT id, name, trigger_type, trigger_config, steps
               FROM workflows
               WHERE agent_id = %s AND trigger_type = %s AND enabled = true""",
            (agent_id, trigger_type),
        )
        return [dict(row) for row in cur.fetchall()]


def start_workflow_run(
    workflow_id: str, agent_id: str, trigger_data: dict | None = None
) -> str:
    """Create a new workflow run and return its ID."""
    run_id = str(uuid.uuid4())
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO workflow_runs (id, workflow_id, agent_id, trigger_data, status, current_step)
               VALUES (%s, %s, %s, %s, 'running', 0)""",
            (run_id, workflow_id, agent_id, json.dumps(trigger_data) if trigger_data else None),
        )
    return run_id


def execute_step(step: dict, agent_id: str, trigger_data: dict | None) -> dict:
    """Execute a single workflow step. Returns a result dict."""
    step_type = step.get("type")
    config = step.get("config", {})
    result: dict[str, Any] = {"type": step_type, "status": "completed"}

    try:
        if step_type == "create_task":
            body = config.get("body", "Workflow task")
            contact_id = config.get("contact_id") or (trigger_data or {}).get("contact_id")
            priority = config.get("priority", "medium")
            due_date = config.get("due_date")

            with get_conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """INSERT INTO activities (id, agent_id, contact_id, type, body, due_date, priority)
                       VALUES (%s, %s, %s, 'task', %s, %s, %s)""",
                    (str(uuid.uuid4()), agent_id, contact_id, body, due_date, priority),
                )
            result["detail"] = f"Created task: {body}"

        elif step_type == "log_activity":
            activity_type = config.get("activity_type", "note")
            body = config.get("body", "Workflow activity")
            contact_id = config.get("contact_id") or (trigger_data or {}).get("contact_id")

            with get_conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """INSERT INTO activities (id, agent_id, contact_id, type, body)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (str(uuid.uuid4()), agent_id, contact_id, activity_type, body),
                )
            result["detail"] = f"Logged {activity_type}: {body}"

        elif step_type == "wait":
            days = config.get("days", 1)
            result["status"] = "waiting"
            result["resume_at"] = (datetime.utcnow() + timedelta(days=days)).isoformat()
            result["detail"] = f"Waiting {days} day(s)"

        elif step_type == "update_deal":
            deal_id = config.get("deal_id") or (trigger_data or {}).get("deal_id")
            if deal_id:
                updates = {}
                if "stage_name" in config:
                    with get_conn() as conn:
                        cur = conn.cursor()
                        cur.execute("SELECT id FROM deal_stages WHERE name = %s", (config["stage_name"],))
                        row = cur.fetchone()
                        if row:
                            updates["stage_id"] = row[0]
                if "notes" in config:
                    updates["notes"] = config["notes"]
                if updates:
                    set_clause = ", ".join(f"{k} = %s" for k in updates)
                    with get_conn() as conn:
                        cur = conn.cursor()
                        cur.execute(
                            f"UPDATE deals SET {set_clause}, updated_at = NOW() WHERE id = %s AND agent_id = %s",
                            (*updates.values(), deal_id, agent_id),
                        )
                result["detail"] = f"Updated deal {deal_id}"
            else:
                result["status"] = "skipped"
                result["detail"] = "No deal_id available"

        elif step_type == "ai_message":
            # AI message steps log the prompt as a note for now
            prompt = config.get("prompt", "")
            contact_id = (trigger_data or {}).get("contact_id")
            with get_conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """INSERT INTO activities (id, agent_id, contact_id, type, body)
                       VALUES (%s, %s, %s, 'note', %s)""",
                    (str(uuid.uuid4()), agent_id, contact_id, f"[AI Workflow] {prompt}"),
                )
            result["detail"] = f"AI message: {prompt}"

        else:
            result["status"] = "skipped"
            result["detail"] = f"Unknown step type: {step_type}"

    except Exception as e:
        logger.error("Workflow step failed: %s", e)
        result["status"] = "failed"
        result["detail"] = str(e)

    return result


def run_workflow(workflow: dict, agent_id: str, trigger_data: dict | None = None) -> str:
    """Execute a complete workflow. Returns the run ID."""
    steps = workflow.get("steps", [])
    if isinstance(steps, str):
        steps = json.loads(steps)

    run_id = start_workflow_run(str(workflow["id"]), agent_id, trigger_data)
    step_results = []

    for i, step in enumerate(steps):
        result = execute_step(step, agent_id, trigger_data)
        step_results.append(result)

        # Update run progress
        with get_conn() as conn:
            cur = conn.cursor()
            if result["status"] == "waiting":
                # Mark as waiting — a background poller would resume later
                cur.execute(
                    """UPDATE workflow_runs
                       SET current_step = %s, step_results = %s, status = 'waiting'
                       WHERE id = %s""",
                    (i, json.dumps(step_results), run_id),
                )
                logger.info("Workflow run %s paused at step %d (wait)", run_id, i)
                return run_id
            elif result["status"] == "failed":
                cur.execute(
                    """UPDATE workflow_runs
                       SET current_step = %s, step_results = %s, status = 'failed', completed_at = NOW()
                       WHERE id = %s""",
                    (i, json.dumps(step_results), run_id),
                )
                logger.error("Workflow run %s failed at step %d", run_id, i)
                return run_id

    # All steps completed
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """UPDATE workflow_runs
               SET current_step = %s, step_results = %s, status = 'completed', completed_at = NOW()
               WHERE id = %s""",
            (len(steps) - 1, json.dumps(step_results), run_id),
        )

    logger.info("Workflow run %s completed (%d steps)", run_id, len(steps))
    return run_id


def trigger_workflows(
    trigger_type: str,
    agent_id: str,
    trigger_data: dict | None = None,
    triggered_by_workflow: bool = False,
) -> list[str]:
    """Find and execute all matching workflows for a trigger event. Returns list of run IDs.

    If ``triggered_by_workflow`` is True the call originated from inside a running
    workflow step.  We skip firing new workflows to prevent infinite recursion
    (e.g. a contact_created workflow that calls create_contact would loop forever).
    """
    if triggered_by_workflow:
        logger.debug(
            "Skipping workflow trigger '%s' — already executing inside a workflow (recursion guard).",
            trigger_type,
        )
        return []

    workflows = find_matching_workflows(trigger_type, agent_id)
    run_ids = []
    for wf in workflows:
        try:
            run_id = run_workflow(wf, agent_id, trigger_data)
            run_ids.append(run_id)
            logger.info("Triggered workflow '%s' (run %s)", wf["name"], run_id)
        except Exception as e:
            logger.error("Failed to trigger workflow '%s': %s", wf["name"], e)
    return run_ids
