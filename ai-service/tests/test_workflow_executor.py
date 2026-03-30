"""
Tests for the workflow executor (workflow_executor.py).

Validates happy path execution, Claude timeout retry, empty response handling,
monthly limit enforcement, and conversation creation with type='workflow_run'.
"""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import sys


def _mock_imports():
    mock_db = MagicMock()
    mock_db.get_conn = MagicMock()
    mock_db.run_query = AsyncMock(side_effect=lambda fn: fn())
    sys.modules.setdefault("app.database", mock_db)

    mock_config = MagicMock()
    mock_config.ANTHROPIC_API_KEY = "test-key"
    mock_config.ANTHROPIC_MODEL = "claude-haiku-4-5-20241001"
    sys.modules.setdefault("app.config", mock_config)


_mock_imports()


async def _collect_events(gen):
    """Collect all yielded events from an async generator."""
    events = []
    async for event in gen:
        events.append(event)
    return events


class TestWorkflowExecutorHappyPath:
    """Happy path: workflow runs to completion."""

    def test_workflow_completes_successfully(self):
        from app.services.workflow_executor import execute_workflow

        async def _run():
            with (
                patch("app.services.workflow_executor._check_monthly_limit", return_value=5),
                patch("app.services.workflow_executor._create_workflow_conversation", return_value="conv-1"),
                patch("app.services.workflow_executor._create_workflow_run", return_value="run-1"),
                patch("app.services.workflow_executor._update_run_status") as mock_update,
                patch("app.services.workflow_executor.run_query", new_callable=AsyncMock) as mock_rq,
                patch("app.services.workflow_executor.run_agent") as mock_agent,
            ):
                mock_rq.side_effect = lambda fn: fn()

                async def fake_agent(**kwargs):
                    yield 'data: {"type": "text", "content": "Done"}\n\n'

                mock_agent.side_effect = fake_agent

                events = await _collect_events(
                    execute_workflow(
                        workflow_id="wf-1",
                        agent_id="agent-1",
                        instruction="Check new leads",
                        approval_mode="auto",
                        workflow_name="Lead Check",
                    )
                )

                assert any("workflow_run_started" in str(e) for e in events)
                mock_update.assert_called_with("run-1", "completed")

        asyncio.run(_run())


class TestWorkflowExecutorTimeout:
    """Claude timeout: retry 1x then fail."""

    def test_timeout_triggers_retry(self):
        from app.services.workflow_executor import execute_workflow

        call_count = 0

        async def fake_agent_timeout(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise TimeoutError("Connection timed out")
            yield 'data: {"type": "text", "content": "Retried OK"}\n\n'

        async def _run():
            with (
                patch("app.services.workflow_executor._check_monthly_limit", return_value=5),
                patch("app.services.workflow_executor._create_workflow_conversation", return_value="conv-1"),
                patch("app.services.workflow_executor._create_workflow_run", return_value="run-1"),
                patch("app.services.workflow_executor._update_run_status") as mock_update,
                patch("app.services.workflow_executor.run_query", new_callable=AsyncMock) as mock_rq,
                patch("app.services.workflow_executor.run_agent", side_effect=fake_agent_timeout),
            ):
                mock_rq.side_effect = lambda fn: fn()

                events = await _collect_events(
                    execute_workflow(
                        workflow_id="wf-1",
                        agent_id="agent-1",
                        instruction="Check leads",
                        workflow_name="Retry Test",
                    )
                )

                assert call_count == 2
                mock_update.assert_called_with("run-1", "completed")

        asyncio.run(_run())


class TestWorkflowExecutorEmptyResponse:
    """Claude empty response: the agent yields nothing."""

    def test_empty_agent_response_completes(self):
        from app.services.workflow_executor import execute_workflow

        async def fake_empty_agent(**kwargs):
            return
            yield  # make this an async generator

        async def _run():
            with (
                patch("app.services.workflow_executor._check_monthly_limit", return_value=0),
                patch("app.services.workflow_executor._create_workflow_conversation", return_value="conv-1"),
                patch("app.services.workflow_executor._create_workflow_run", return_value="run-1"),
                patch("app.services.workflow_executor._update_run_status") as mock_update,
                patch("app.services.workflow_executor.run_query", new_callable=AsyncMock) as mock_rq,
                patch("app.services.workflow_executor.run_agent", side_effect=fake_empty_agent),
            ):
                mock_rq.side_effect = lambda fn: fn()

                events = await _collect_events(
                    execute_workflow(
                        workflow_id="wf-1",
                        agent_id="agent-1",
                        instruction="Do something",
                        workflow_name="Empty Test",
                    )
                )

                mock_update.assert_called_with("run-1", "completed")

        asyncio.run(_run())


class TestWorkflowExecutorMonthlyLimit:
    """Monthly limit: 101st run blocked."""

    def test_monthly_limit_blocks_execution(self):
        from app.services.workflow_executor import execute_workflow, MONTHLY_RUN_LIMIT

        assert MONTHLY_RUN_LIMIT == 100

        async def _run():
            with (
                patch("app.services.workflow_executor._check_monthly_limit", return_value=100),
                patch("app.services.workflow_executor.run_query", new_callable=AsyncMock) as mock_rq,
            ):
                mock_rq.side_effect = lambda fn: fn()

                events = await _collect_events(
                    execute_workflow(
                        workflow_id="wf-1",
                        agent_id="agent-1",
                        instruction="Check leads",
                        workflow_name="Limit Test",
                    )
                )

                assert any("Monthly workflow run limit" in str(e) for e in events)
                assert any("[DONE]" in str(e) for e in events)

        asyncio.run(_run())

    def test_dry_run_bypasses_monthly_limit(self):
        """Dry runs should not be blocked by the monthly limit."""
        from app.services.workflow_executor import execute_workflow

        async def fake_agent(**kwargs):
            yield 'data: {"type": "text", "content": "Preview"}\n\n'

        async def _run():
            with (
                patch("app.services.workflow_executor._check_monthly_limit", return_value=100),
                patch("app.services.workflow_executor._create_workflow_conversation", return_value="conv-1"),
                patch("app.services.workflow_executor._create_workflow_run", return_value="run-1"),
                patch("app.services.workflow_executor._update_run_status"),
                patch("app.services.workflow_executor.run_query", new_callable=AsyncMock) as mock_rq,
                patch("app.services.workflow_executor.run_agent", side_effect=fake_agent),
            ):
                mock_rq.side_effect = lambda fn: fn()

                events = await _collect_events(
                    execute_workflow(
                        workflow_id="wf-1",
                        agent_id="agent-1",
                        instruction="Check leads",
                        is_dry_run=True,
                        workflow_name="Dry Run Limit Test",
                    )
                )

                assert not any("Monthly workflow run limit" in str(e) for e in events)

        asyncio.run(_run())


class TestWorkflowConversationType:
    """Conversation created with type='workflow_run'."""

    def test_conversation_created_with_workflow_type(self):
        from app.services.workflow_executor import _create_workflow_conversation

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor

        with patch("app.services.workflow_executor.get_conn", return_value=mock_conn):
            result = _create_workflow_conversation("agent-1", "Test Workflow")

        assert isinstance(result, str)
        assert len(result) == 36  # UUID format

        call_args = mock_cursor.execute.call_args
        sql = call_args[0][0]
        assert "'workflow_run'" in sql

        params = call_args[0][1]
        assert "Workflow: Test Workflow" in params
