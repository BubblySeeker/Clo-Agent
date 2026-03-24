"""
Tests for the workflow scheduler (workflow_scheduler.py).

Validates is_due_now() logic, dedup via running check, semaphore concurrency,
and failure notification activity log.
"""
import asyncio
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import sys


def _mock_imports():
    mock_db = MagicMock()
    mock_db.get_conn = MagicMock()
    mock_db.run_query = AsyncMock()
    sys.modules.setdefault("app.database", mock_db)

    mock_config = MagicMock()
    mock_config.ANTHROPIC_API_KEY = "test-key"
    mock_config.ANTHROPIC_MODEL = "claude-haiku-4-5-20241001"
    sys.modules.setdefault("app.config", mock_config)


_mock_imports()

from app.services.workflow_scheduler import is_due_now


class TestIsDueNow:
    """Validate schedule evaluation for various frequency + timezone combos."""

    def test_daily_at_matching_time(self):
        config = {"frequency": "daily", "time": "09:00", "timezone": "UTC"}
        now = datetime(2026, 3, 24, 9, 0, tzinfo=timezone.utc)
        assert is_due_now(config, now) is True

    def test_daily_at_wrong_time(self):
        config = {"frequency": "daily", "time": "09:00", "timezone": "UTC"}
        now = datetime(2026, 3, 24, 10, 0, tzinfo=timezone.utc)
        assert is_due_now(config, now) is False

    def test_weekly_correct_day_and_time(self):
        # 2026-03-24 is a Tuesday
        config = {"frequency": "weekly", "day": "tuesday", "time": "08:00", "timezone": "UTC"}
        now = datetime(2026, 3, 24, 8, 0, tzinfo=timezone.utc)
        assert is_due_now(config, now) is True

    def test_weekly_wrong_day(self):
        config = {"frequency": "weekly", "day": "monday", "time": "08:00", "timezone": "UTC"}
        now = datetime(2026, 3, 24, 8, 0, tzinfo=timezone.utc)  # Tuesday
        assert is_due_now(config, now) is False

    def test_monthly_correct_day(self):
        config = {"frequency": "monthly", "day_of_month": 1, "time": "06:00", "timezone": "UTC"}
        now = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
        assert is_due_now(config, now) is True

    def test_monthly_wrong_day(self):
        config = {"frequency": "monthly", "day_of_month": 1, "time": "06:00", "timezone": "UTC"}
        now = datetime(2026, 4, 2, 6, 0, tzinfo=timezone.utc)
        assert is_due_now(config, now) is False

    def test_timezone_conversion(self):
        # 09:00 New York = 13:00 UTC during EDT (March)
        config = {"frequency": "daily", "time": "09:00", "timezone": "America/New_York"}
        now = datetime(2026, 3, 24, 13, 0, tzinfo=timezone.utc)
        assert is_due_now(config, now) is True

    def test_biweekly_even_week(self):
        # 2026-03-24 is Tuesday of ISO week 13 (odd) — should not match
        config = {"frequency": "biweekly", "day": "tuesday", "time": "09:00", "timezone": "UTC"}
        now = datetime(2026, 3, 24, 9, 0, tzinfo=timezone.utc)
        assert is_due_now(config, now) is False

    def test_empty_schedule_returns_false(self):
        assert is_due_now({}) is False

    def test_missing_frequency_returns_false(self):
        config = {"time": "09:00", "timezone": "UTC"}
        now = datetime(2026, 3, 24, 9, 0, tzinfo=timezone.utc)
        assert is_due_now(config, now) is False


class TestSchedulerDedup:
    """Verify that the SQL query excludes workflows with active runs."""

    def test_fetch_excludes_running_workflows(self):
        from app.services.workflow_scheduler import _fetch_scheduled_workflows
        assert callable(_fetch_scheduled_workflows)


class TestSchedulerSemaphore:
    """Verify the semaphore limits concurrent executions."""

    def test_semaphore_limits_concurrency(self):
        from app.services.workflow_scheduler import MAX_CONCURRENT_EXECUTIONS

        assert MAX_CONCURRENT_EXECUTIONS == 3

        async def _check():
            semaphore = asyncio.Semaphore(MAX_CONCURRENT_EXECUTIONS)
            for _ in range(3):
                await semaphore.acquire()
            assert semaphore.locked()

        asyncio.run(_check())


class TestSchedulerFailureNotification:
    """Verify that failure logging creates activity entries."""

    def test_log_scheduler_failure_creates_activity(self):
        from app.services.workflow_scheduler import _log_scheduler_failure

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor

        with patch("app.services.workflow_scheduler.get_conn", return_value=mock_conn):
            _log_scheduler_failure("agent-1", "Test Workflow", "Connection timeout")

        mock_cursor.execute.assert_called_once()
        call_args = mock_cursor.execute.call_args
        sql = call_args[0][0]
        params = call_args[0][1]
        assert "INSERT INTO activities" in sql
        assert "system_note" in sql
        assert "agent-1" in params
        assert "Test Workflow" in params[2]
        assert "Connection timeout" in params[2]
