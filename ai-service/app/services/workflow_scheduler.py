"""
Background scheduler for scheduled workflows.

Polls every 60s for enabled workflows with schedule_config, executes due ones
via the AI-native workflow executor. Runs as an asyncio background task.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

import psycopg2.extras

from app.database import get_conn, run_query

logger = logging.getLogger(__name__)

# Safety limits
MAX_CONCURRENT_EXECUTIONS = 3
MAX_SCHEDULED_PER_AGENT = 20
MIN_INTERVAL_HOURS = 1
POLL_INTERVAL_SECONDS = 60

# Module-level state for health checks
_scheduler_running = False
_last_poll_at: datetime | None = None


# ---------------------------------------------------------------------------
# Schedule evaluation helpers
# ---------------------------------------------------------------------------

_WEEKDAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def _parse_time(time_str: str) -> tuple[int, int]:
    """Parse 'HH:MM' into (hour, minute)."""
    parts = time_str.split(":")
    return int(parts[0]), int(parts[1])


def is_due_now(schedule_config: dict, now: datetime | None = None) -> bool:
    """Check if a scheduled workflow is due to run.

    Schedule format:
        frequency: daily | weekly | biweekly | monthly
        day: monday (for weekly/biweekly)
        time: "08:00"
        timezone: "America/New_York"
    """
    if now is None:
        now = datetime.now(timezone.utc)

    freq = schedule_config.get("frequency")
    time_str = schedule_config.get("time", "09:00")
    tz_name = schedule_config.get("timezone", "UTC")

    # Convert now to the workflow's timezone
    try:
        from zoneinfo import ZoneInfo
        local_now = now.astimezone(ZoneInfo(tz_name))
    except Exception:
        local_now = now

    sched_hour, sched_minute = _parse_time(time_str)

    # Must be within the polling window (current minute matches)
    if local_now.hour != sched_hour or local_now.minute != sched_minute:
        return False

    if freq == "daily":
        return True

    day_name = schedule_config.get("day", "monday").lower()
    target_weekday = _WEEKDAY_MAP.get(day_name, 0)

    if freq == "weekly":
        return local_now.weekday() == target_weekday

    if freq == "biweekly":
        # Use ISO week number: even weeks
        return local_now.weekday() == target_weekday and local_now.isocalendar()[1] % 2 == 0

    if freq == "monthly":
        # Run on the 1st of each month
        day_of_month = schedule_config.get("day_of_month", 1)
        return local_now.day == day_of_month

    return False


# ---------------------------------------------------------------------------
# Database queries (sync, called via run_query)
# ---------------------------------------------------------------------------

def _fetch_scheduled_workflows() -> list[dict]:
    """Fetch all enabled workflows with schedule_config, excluding currently running ones.

    Uses a single admin query (no RLS) since the scheduler runs as a system process.
    """
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT w.id, w.agent_id, w.name, w.instruction, w.approval_mode,
                   w.schedule_config
            FROM workflows w
            LEFT JOIN workflow_runs wr
                ON wr.workflow_id = w.id AND wr.status = 'running'
            WHERE w.enabled = true
              AND w.schedule_config IS NOT NULL
              AND w.instruction IS NOT NULL
              AND wr.id IS NULL
        """)
        return [dict(row) for row in cur.fetchall()]


def _log_scheduler_failure(agent_id: str, workflow_name: str, error: str) -> None:
    """Create an activity log entry for a failed scheduled workflow."""
    import uuid
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO activities (id, agent_id, type, notes, created_at)
               VALUES (%s, %s, 'system_note', %s, NOW())""",
            (str(uuid.uuid4()), agent_id, f"Scheduled workflow '{workflow_name}' failed: {error}"),
        )


# ---------------------------------------------------------------------------
# Scheduler loop
# ---------------------------------------------------------------------------

async def _execute_scheduled_workflow(
    workflow: dict,
    semaphore: asyncio.Semaphore,
) -> None:
    """Execute a single scheduled workflow under the semaphore."""
    from app.services.workflow_executor import execute_workflow

    wf_id = workflow["id"]
    agent_id = workflow["agent_id"]
    name = workflow.get("name", "Scheduled Workflow")
    instruction = workflow["instruction"]
    approval_mode = workflow.get("approval_mode", "auto_approve")

    async with semaphore:
        logger.info("Executing scheduled workflow '%s' (id=%s) for agent %s", name, wf_id, agent_id)
        try:
            # Consume the SSE generator (we don't stream to anyone for scheduled runs)
            async for _event in execute_workflow(
                workflow_id=wf_id,
                agent_id=agent_id,
                instruction=instruction,
                approval_mode=approval_mode,
                trigger_data={"triggered_by": "schedule"},
                is_dry_run=False,
                workflow_name=name,
            ):
                pass  # drain the generator
            logger.info("Scheduled workflow '%s' completed successfully", name)
        except Exception as e:
            logger.error("Scheduled workflow '%s' failed: %s", name, e, exc_info=True)
            try:
                await run_query(lambda: _log_scheduler_failure(agent_id, name, str(e)))
            except Exception:
                logger.warning("Failed to log scheduler failure activity")


async def scheduler_loop() -> None:
    """Main scheduler loop — polls every 60s for due workflows."""
    global _scheduler_running, _last_poll_at

    _scheduler_running = True
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_EXECUTIONS)

    logger.info("Workflow scheduler started (poll=%ds, max_concurrent=%d)",
                POLL_INTERVAL_SECONDS, MAX_CONCURRENT_EXECUTIONS)

    while True:
        try:
            _last_poll_at = datetime.now(timezone.utc)

            # Fetch all candidates
            workflows = await run_query(_fetch_scheduled_workflows)

            # Filter to those due right now
            due_workflows = [w for w in workflows if is_due_now(w.get("schedule_config", {}))]

            if due_workflows:
                logger.info("Found %d due scheduled workflow(s)", len(due_workflows))

                # Group by agent to enforce per-agent limit
                agent_counts: dict[str, int] = {}
                tasks = []
                for wf in due_workflows:
                    aid = wf["agent_id"]
                    agent_counts[aid] = agent_counts.get(aid, 0) + 1
                    if agent_counts[aid] > MAX_SCHEDULED_PER_AGENT:
                        logger.warning("Agent %s exceeds max scheduled workflows, skipping", aid)
                        continue
                    tasks.append(
                        asyncio.create_task(_execute_scheduled_workflow(wf, semaphore))
                    )

                # Fire and forget — don't block the next poll
                if tasks:
                    asyncio.gather(*tasks, return_exceptions=True)

        except Exception as e:
            logger.error("Scheduler poll error: %s", e, exc_info=True)

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


def get_scheduler_status() -> dict:
    """Return current scheduler status for health checks."""
    return {
        "running": _scheduler_running,
        "last_poll_at": _last_poll_at.isoformat() if _last_poll_at else None,
        "config": {
            "poll_interval_seconds": POLL_INTERVAL_SECONDS,
            "max_concurrent": MAX_CONCURRENT_EXECUTIONS,
            "max_per_agent": MAX_SCHEDULED_PER_AGENT,
        },
    }
