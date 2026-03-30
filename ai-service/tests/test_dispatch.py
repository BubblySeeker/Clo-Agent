"""
Tests for the dispatch_tool() function in agent.py.

Validates that tool calls are correctly routed based on tool type,
approval mode, dry run, and ALWAYS_CONFIRM_TOOLS.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import sys


def _mock_imports():
    """Mock database/config modules before importing agent code."""
    mock_db = MagicMock()
    mock_db.get_conn = MagicMock()
    mock_db.run_query = AsyncMock()
    sys.modules.setdefault("app.database", mock_db)

    mock_config = MagicMock()
    mock_config.ANTHROPIC_API_KEY = "test-key"
    mock_config.ANTHROPIC_MODEL = "claude-haiku-4-5-20241001"
    sys.modules.setdefault("app.config", mock_config)


_mock_imports()


@pytest.fixture
def dispatch():
    """Return the dispatch_tool coroutine with dependencies mocked."""
    from app.services.agent import dispatch_tool
    return dispatch_tool


class TestDispatchTool:
    """Validate dispatch_tool routing logic."""

    def test_read_tool_calls_execute_read(self, dispatch):
        """Read tool → execute_read_tool() called."""
        with patch("app.services.agent.execute_read_tool", new_callable=AsyncMock) as mock_read:
            mock_read.return_value = {"contacts": []}
            result = asyncio.run(dispatch("search_contacts", {"query": "Rohan"}, "agent-1"))
            mock_read.assert_called_once_with("search_contacts", {"query": "Rohan"}, "agent-1")
            assert result == {"contacts": []}

    def test_write_tool_default_queues_confirmation(self, dispatch):
        """Write tool, approval_mode=None → queue_write_tool() called (default)."""
        with patch("app.services.agent.queue_write_tool") as mock_queue:
            mock_queue.return_value = {"confirmation_required": True, "pending_id": "p1"}
            result = asyncio.run(dispatch("create_contact", {"first_name": "John"}, "agent-1"))
            mock_queue.assert_called_once_with("create_contact", {"first_name": "John"}, "agent-1")
            assert result["confirmation_required"] is True

    def test_write_tool_auto_executes_immediately(self, dispatch):
        """Write tool, approval_mode='auto' → execute_write_tool_immediate() called."""
        with patch("app.services.agent.execute_write_tool_immediate", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = {"id": "c1", "first_name": "John"}
            result = asyncio.run(dispatch(
                "create_contact", {"first_name": "John"}, "agent-1", approval_mode="auto"
            ))
            mock_exec.assert_called_once_with("create_contact", {"first_name": "John"}, "agent-1")
            assert result["id"] == "c1"

    def test_write_tool_auto_still_confirms_delete(self, dispatch):
        """Write tool, approval_mode='auto', tool=delete_contact → still queues confirmation."""
        with patch("app.services.agent.queue_write_tool") as mock_queue:
            mock_queue.return_value = {"confirmation_required": True, "pending_id": "p2"}
            result = asyncio.run(dispatch(
                "delete_contact", {"contact_id": "c1"}, "agent-1", approval_mode="auto"
            ))
            mock_queue.assert_called_once()
            assert result["confirmation_required"] is True

    def test_write_tool_dry_run_returns_preview(self, dispatch):
        """Write tool, is_dry_run=True → returns preview object."""
        result = asyncio.run(dispatch(
            "create_contact", {"first_name": "John"}, "agent-1", is_dry_run=True
        ))
        assert result["preview"] is True
        assert result["tool"] == "create_contact"
        assert "would_do" in result

    def test_unknown_tool_returns_error(self, dispatch):
        """Unknown tool name → returns error dict, logs warning."""
        result = asyncio.run(dispatch("nonexistent_tool", {}, "agent-1"))
        assert "error" in result
        assert "Unknown tool" in result["error"]
