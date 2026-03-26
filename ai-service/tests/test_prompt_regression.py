"""
Prompt regression tests for the agent loop routing logic.

These tests verify that tool calls are routed correctly:
- AUTO_EXECUTE_TOOLS ∩ WRITE_TOOLS → auto-execute (no confirmation)
- WRITE_TOOLS - AUTO_EXECUTE_TOOLS → queue for confirmation
- READ_TOOLS → execute immediately

Each test mocks the Claude API response to return predictable tool_use blocks,
then collects SSE events emitted by the agent loop to verify routing.
No database or real API calls needed.
"""
import asyncio
import json
import sys
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Mock setup — must happen before importing agent/tools modules
# ---------------------------------------------------------------------------

def _setup_mocks():
    """Mock external dependencies so agent.py can be imported without a DB."""
    mock_db = MagicMock()
    mock_db.get_conn = MagicMock()
    mock_db.run_query = AsyncMock()
    sys.modules.setdefault("app.database", mock_db)


_setup_mocks()

from app.tools import AUTO_EXECUTE_TOOLS, READ_TOOLS, WRITE_TOOLS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@dataclass
class FakeToolUseBlock:
    type: str = "tool_use"
    id: str = "tool_01"
    name: str = ""
    input: dict = None

    def __post_init__(self):
        if self.input is None:
            self.input = {}


@dataclass
class FakeTextBlock:
    type: str = "text"
    text: str = ""


@dataclass
class FakeResponse:
    content: list = None

    def __post_init__(self):
        if self.content is None:
            self.content = []


def make_tool_response(tool_blocks: list[FakeToolUseBlock]) -> FakeResponse:
    """Create a fake Claude response with tool_use blocks."""
    return FakeResponse(content=tool_blocks)


def make_text_response(text: str = "Done.") -> FakeResponse:
    """Create a fake Claude response with only text (no tools)."""
    return FakeResponse(content=[FakeTextBlock(text=text)])


def parse_sse_events(raw_events: list[str]) -> list[dict]:
    """Parse SSE-formatted strings into dicts."""
    events = []
    for raw in raw_events:
        if raw.startswith("data: ") and raw.strip() != "data: [DONE]":
            data = raw[len("data: "):].strip()
            try:
                events.append(json.loads(data))
            except json.JSONDecodeError:
                pass
    return events


async def collect_events(agent_gen) -> list[dict]:
    """Collect all SSE events from the agent async generator."""
    raw = []
    async for event in agent_gen:
        raw.append(event)
    return parse_sse_events(raw)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAutoExecuteRouting:
    """Verify that AUTO_EXECUTE_TOOLS are auto-executed, not queued."""

    def test_update_contact_is_auto_execute(self):
        assert "update_contact" in AUTO_EXECUTE_TOOLS
        assert "update_contact" in WRITE_TOOLS

    def test_log_activity_is_auto_execute(self):
        assert "log_activity" in AUTO_EXECUTE_TOOLS
        assert "log_activity" in WRITE_TOOLS

    def test_complete_task_is_auto_execute(self):
        assert "complete_task" in AUTO_EXECUTE_TOOLS
        assert "complete_task" in WRITE_TOOLS

    def test_reschedule_task_is_auto_execute(self):
        assert "reschedule_task" in AUTO_EXECUTE_TOOLS
        assert "reschedule_task" in WRITE_TOOLS

    def test_update_buyer_profile_is_auto_execute(self):
        assert "update_buyer_profile" in AUTO_EXECUTE_TOOLS
        assert "update_buyer_profile" in WRITE_TOOLS

    def test_update_deal_is_auto_execute(self):
        assert "update_deal" in AUTO_EXECUTE_TOOLS
        assert "update_deal" in WRITE_TOOLS

    def test_update_property_is_auto_execute(self):
        assert "update_property" in AUTO_EXECUTE_TOOLS
        assert "update_property" in WRITE_TOOLS


class TestConfirmationRouting:
    """Verify that dangerous write tools require confirmation (not auto-execute)."""

    def test_create_deal_requires_confirmation(self):
        assert "create_deal" in WRITE_TOOLS
        assert "create_deal" not in AUTO_EXECUTE_TOOLS

    def test_delete_contact_requires_confirmation(self):
        assert "delete_contact" in WRITE_TOOLS
        assert "delete_contact" not in AUTO_EXECUTE_TOOLS

    def test_create_contact_requires_confirmation(self):
        assert "create_contact" in WRITE_TOOLS
        assert "create_contact" not in AUTO_EXECUTE_TOOLS

    def test_delete_deal_requires_confirmation(self):
        assert "delete_deal" in WRITE_TOOLS
        assert "delete_deal" not in AUTO_EXECUTE_TOOLS

    def test_send_email_requires_confirmation(self):
        """send_email (if it exists as a write tool) should not auto-execute."""
        if "send_email" in WRITE_TOOLS:
            assert "send_email" not in AUTO_EXECUTE_TOOLS

    def test_delete_property_requires_confirmation(self):
        assert "delete_property" in WRITE_TOOLS
        assert "delete_property" not in AUTO_EXECUTE_TOOLS

    def test_create_property_requires_confirmation(self):
        assert "create_property" in WRITE_TOOLS
        assert "create_property" not in AUTO_EXECUTE_TOOLS


class TestReadToolRouting:
    """Verify read tools are not in WRITE_TOOLS or AUTO_EXECUTE_TOOLS."""

    def test_search_contacts_is_read(self):
        assert "search_contacts" in READ_TOOLS
        assert "search_contacts" not in WRITE_TOOLS
        assert "search_contacts" not in AUTO_EXECUTE_TOOLS

    def test_get_contact_details_is_read(self):
        assert "get_contact_details" in READ_TOOLS
        assert "get_contact_details" not in WRITE_TOOLS

    def test_get_dashboard_summary_is_read(self):
        assert "get_dashboard_summary" in READ_TOOLS
        assert "get_dashboard_summary" not in WRITE_TOOLS


class TestAutoExecuteSetConsistency:
    """Verify AUTO_EXECUTE_TOOLS is a strict subset of WRITE_TOOLS."""

    def test_auto_execute_subset_of_write(self):
        not_in_write = AUTO_EXECUTE_TOOLS - WRITE_TOOLS
        assert not not_in_write, (
            f"AUTO_EXECUTE_TOOLS contains tools not in WRITE_TOOLS: {not_in_write}"
        )

    def test_auto_execute_does_not_contain_creates(self):
        """No create_* tool should be auto-executed (they create new entities)."""
        creates = {t for t in AUTO_EXECUTE_TOOLS if t.startswith("create_")}
        assert not creates, f"create_* tools should not be auto-executed: {creates}"

    def test_auto_execute_does_not_contain_deletes(self):
        """No delete_* tool should be auto-executed (destructive)."""
        deletes = {t for t in AUTO_EXECUTE_TOOLS if t.startswith("delete_")}
        assert not deletes, f"delete_* tools should not be auto-executed: {deletes}"

    def test_auto_execute_does_not_contain_email(self):
        """Email-sending tools should not be auto-executed."""
        email_tools = {t for t in AUTO_EXECUTE_TOOLS if "email" in t.lower()}
        assert not email_tools, f"Email tools should not be auto-executed: {email_tools}"


class TestAgentLoopRouting:
    """
    Integration-style tests that run the agent loop with mocked Claude responses
    and verify the SSE events emitted match expected routing behavior.
    """

    @pytest.fixture(autouse=True)
    def setup_patches(self):
        """Patch dependencies for agent loop tests."""
        self.mock_history = (
            [],  # messages
            {"name": "Test Agent"},  # agent_row
            {},  # conversation_row (no contact scope)
        )

    def _make_agent_patches(self, claude_responses: list[FakeResponse]):
        """Create a context manager with all patches needed to run the agent loop."""
        from unittest.mock import AsyncMock as AM

        # Mock _load_history
        load_hist = MagicMock(return_value=self.mock_history)
        # Mock _count_agent_documents
        doc_count = MagicMock(return_value=0)
        # Mock check_gmail_status
        gmail = MagicMock(return_value=None)
        # Mock _save_assistant_message
        save_msg = MagicMock(return_value=None)

        # run_query just calls the lambda
        async def fake_run_query(fn):
            return fn()

        # Mock Claude client that returns our canned responses in order
        response_iter = iter(claude_responses)
        mock_client_instance = MagicMock()
        mock_client_instance.messages = MagicMock()
        mock_client_instance.messages.create = AM(side_effect=lambda **kw: next(response_iter))

        patches = {
            "run_query": patch("app.services.agent.run_query", side_effect=fake_run_query),
            "load_hist": patch("app.services.agent._load_history", load_hist),
            "doc_count": patch("app.services.agent._count_agent_documents", doc_count),
            "gmail": patch("app.services.agent.check_gmail_status", gmail),
            "save_msg": patch("app.services.agent._save_assistant_message", save_msg),
            "client": patch("app.services.agent.anthropic.AsyncAnthropic", return_value=mock_client_instance),
        }
        return patches

    def test_update_contact_emits_auto_executed(self):
        """Scenario c: 'Update Sarah's phone' → search_contacts then update_contact (auto-execute)."""
        from app.services.agent import run_agent

        responses = [
            make_tool_response([
                FakeToolUseBlock(id="t1", name="search_contacts", input={"query": "Sarah"}),
            ]),
            make_tool_response([
                FakeToolUseBlock(id="t2", name="update_contact", input={
                    "contact_id": "uuid-sarah", "phone": "555-1234",
                }),
            ]),
            make_text_response("Updated Sarah's phone to 555-1234."),
        ]

        patches = self._make_agent_patches(responses)

        with patches["run_query"], patches["load_hist"], patches["doc_count"], \
             patches["gmail"], patches["save_msg"], patches["client"], \
             patch("app.services.agent.execute_read_tool", new=AsyncMock(
                 return_value={"contacts": [{"id": "uuid-sarah", "first_name": "Sarah"}]}
             )), \
             patch("app.services.agent._dispatch_write_tool", new=AsyncMock(
                 return_value={"updated": True, "contact_id": "uuid-sarah"}
             )):
            events = asyncio.run(collect_events(
                run_agent("conv-1", "agent-1", "Update Sarah's phone to 555-1234")
            ))

        event_types = [e.get("type") for e in events]
        assert "tool_call" in event_types, "Should see tool_call events"
        assert "auto_executed" in event_types, "update_contact should be auto-executed"
        assert "confirmation" not in event_types, "update_contact should NOT require confirmation"

        auto_event = next(e for e in events if e.get("type") == "auto_executed")
        assert auto_event["name"] == "update_contact"
        assert auto_event["status"] == "success"

    def test_create_deal_emits_confirmation(self):
        """Scenario d: 'Create a deal for Rohan' → create_deal uses confirmation."""
        from app.services.agent import run_agent

        responses = [
            make_tool_response([
                FakeToolUseBlock(id="t1", name="create_deal", input={
                    "contact_id": "uuid-rohan", "title": "Rohan's Deal",
                }),
            ]),
            make_text_response("Please confirm the deal creation."),
        ]

        patches = self._make_agent_patches(responses)

        mock_confirmation = {
            "pending_id": "pend-1",
            "tool_name": "create_deal",
            "tool_input": {"contact_id": "uuid-rohan", "title": "Rohan's Deal"},
        }

        with patches["run_query"], patches["load_hist"], patches["doc_count"], \
             patches["gmail"], patches["save_msg"], patches["client"], \
             patch("app.services.agent.queue_write_tool", return_value=mock_confirmation):
            events = asyncio.run(collect_events(
                run_agent("conv-2", "agent-1", "Create a deal for Rohan")
            ))

        event_types = [e.get("type") for e in events]
        assert "confirmation" in event_types, "create_deal should require confirmation"
        assert "auto_executed" not in event_types, "create_deal should NOT be auto-executed"

    def test_delete_contact_emits_confirmation(self):
        """Scenario e: 'Delete the contact' → delete_contact uses confirmation."""
        from app.services.agent import run_agent

        responses = [
            make_tool_response([
                FakeToolUseBlock(id="t1", name="delete_contact", input={
                    "contact_id": "uuid-target",
                }),
            ]),
            make_text_response("Please confirm deletion."),
        ]

        patches = self._make_agent_patches(responses)

        mock_confirmation = {
            "pending_id": "pend-2",
            "tool_name": "delete_contact",
            "tool_input": {"contact_id": "uuid-target"},
        }

        with patches["run_query"], patches["load_hist"], patches["doc_count"], \
             patches["gmail"], patches["save_msg"], patches["client"], \
             patch("app.services.agent.queue_write_tool", return_value=mock_confirmation):
            events = asyncio.run(collect_events(
                run_agent("conv-3", "agent-1", "Delete the contact")
            ))

        event_types = [e.get("type") for e in events]
        assert "confirmation" in event_types, "delete_contact should require confirmation"
        assert "auto_executed" not in event_types, "delete_contact should NOT be auto-executed"

    def test_log_activity_is_auto_executed(self):
        """Scenario b: 'Log a call with my last contact' → search then log_activity (auto-execute)."""
        from app.services.agent import run_agent

        responses = [
            make_tool_response([
                FakeToolUseBlock(id="t1", name="search_contacts", input={"limit": 1}),
            ]),
            make_tool_response([
                FakeToolUseBlock(id="t2", name="log_activity", input={
                    "contact_id": "uuid-last", "type": "call", "body": "Logged a call",
                }),
            ]),
            make_text_response("Logged a call with your most recent contact."),
        ]

        patches = self._make_agent_patches(responses)

        with patches["run_query"], patches["load_hist"], patches["doc_count"], \
             patches["gmail"], patches["save_msg"], patches["client"], \
             patch("app.services.agent.execute_read_tool", new=AsyncMock(
                 return_value={"contacts": [{"id": "uuid-last", "first_name": "Jane"}]}
             )), \
             patch("app.services.agent._dispatch_write_tool", new=AsyncMock(
                 return_value={"logged": True, "activity_id": "act-1"}
             )):
            events = asyncio.run(collect_events(
                run_agent("conv-4", "agent-1", "Log a call with my last contact")
            ))

        event_types = [e.get("type") for e in events]
        assert "auto_executed" in event_types, "log_activity should be auto-executed"
        assert "confirmation" not in event_types, "log_activity should NOT require confirmation"

        auto_event = next(e for e in events if e.get("type") == "auto_executed")
        assert auto_event["name"] == "log_activity"

    def test_read_tool_returns_tool_result(self):
        """search_contacts (read tool) should emit tool_result, not confirmation or auto_executed."""
        from app.services.agent import run_agent

        responses = [
            make_tool_response([
                FakeToolUseBlock(id="t1", name="search_contacts", input={"query": "Rohan"}),
            ]),
            make_text_response("Found Rohan Batra."),
        ]

        patches = self._make_agent_patches(responses)

        with patches["run_query"], patches["load_hist"], patches["doc_count"], \
             patches["gmail"], patches["save_msg"], patches["client"], \
             patch("app.services.agent.execute_read_tool", new=AsyncMock(
                 return_value={"contacts": [{"id": "uuid-rohan", "first_name": "Rohan"}]}
             )):
            events = asyncio.run(collect_events(
                run_agent("conv-5", "agent-1", "Find Rohan")
            ))

        event_types = [e.get("type") for e in events]
        assert "tool_result" in event_types, "Read tools should emit tool_result"
        assert "confirmation" not in event_types
        assert "auto_executed" not in event_types
