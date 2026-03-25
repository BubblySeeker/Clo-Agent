"""
Tests for ai-service/app/services/agent.py

Tests the SSE formatting, constants, and the main agent loop dispatch logic
for read, write, and auto-execute tool tiers.
"""
import json
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from app.services.agent import sse, MAX_TOOL_ROUNDS


# ── Mock helpers ──────────────────────────────────────────────────────────


class MockTextBlock:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class MockToolBlock:
    def __init__(self, name, input_data, id="tool-1"):
        self.type = "tool_use"
        self.name = name
        self.input = input_data
        self.id = id


def _make_mock_response(content_blocks):
    resp = MagicMock()
    resp.content = content_blocks
    return resp


def _parse_sse_events(raw_lines: list[str]) -> list:
    events = []
    for line in raw_lines:
        if line.strip() == "data: [DONE]":
            events.append("[DONE]")
        elif line.startswith("data: "):
            payload = line[len("data: "):].strip()
            events.append(json.loads(payload))
    return events


async def _collect_events(async_gen) -> list:
    raw = []
    async for chunk in async_gen:
        raw.append(chunk)
    return _parse_sse_events(raw)


# ── Shared patch context for run_agent tests ──────────────────────────────

def _agent_patches(
    claude_responses,
    execute_tool_return=None,
    queue_write_return=None,
):
    """Return a stack of patches for run_agent tests."""
    from unittest.mock import patch
    from app.services.intelligence import EntityContext

    empty_ctx = EntityContext()

    mock_client = AsyncMock()
    if isinstance(claude_responses, list):
        mock_client.messages.create = AsyncMock(side_effect=claude_responses)
    else:
        mock_client.messages.create = AsyncMock(return_value=claude_responses)

    patches = {
        "load_history": patch(
            "app.services.agent._load_history",
            return_value=([], {"name": "Test Agent"}, {"id": "conv-1", "contact_id": None}),
        ),
        "save_msg": patch("app.services.agent._save_assistant_message"),
        "resolve": patch(
            "app.services.agent.resolve_entities",
            new_callable=AsyncMock,
            return_value=empty_ctx,
        ),
        "enrich": patch("app.services.agent.enrich_context", return_value=""),
        "run_query": patch(
            "app.services.agent.run_query",
            new_callable=AsyncMock,
            side_effect=lambda fn: fn(),
        ),
        "client": patch(
            "app.services.agent.anthropic.AsyncAnthropic",
            return_value=mock_client,
        ),
    }
    if execute_tool_return is not None:
        patches["execute"] = patch(
            "app.services.agent.execute_tool",
            new_callable=AsyncMock,
            return_value=execute_tool_return,
        )
    if queue_write_return is not None:
        patches["queue"] = patch(
            "app.services.agent.queue_write_tool",
            return_value=queue_write_return,
        )
    return patches, mock_client


# ── Test cases ────────────────────────────────────────────────────────────


class TestSseFormat:
    def test_sse_format(self):
        """sse() produces a valid SSE data line with JSON payload."""
        result = sse({"type": "text", "content": "hello"})
        assert result.startswith("data: ")
        assert result.endswith("\n\n")
        payload = json.loads(result[len("data: "):].strip())
        assert payload == {"type": "text", "content": "hello"}


class TestMaxRoundsConstant:
    def test_max_rounds_constant(self):
        assert MAX_TOOL_ROUNDS == 5


@pytest.mark.asyncio
async def test_run_agent_yields_text_sse():
    """When Claude returns only text (no tools), we get text SSE events + [DONE]."""
    from app.services.agent import run_agent

    response = _make_mock_response([MockTextBlock("Hello there")])
    patches, _ = _agent_patches(response)

    ctx_managers = {k: p.__enter__() if hasattr(p, '__enter__') else p for k, p in patches.items()}
    # Use contextmanager protocol
    with patches["load_history"], patches["save_msg"], patches["resolve"], \
         patches["enrich"], patches["run_query"], patches["client"]:
        events = await _collect_events(run_agent("conv-1", "agent-1", "Hi"))

    text_events = [e for e in events if isinstance(e, dict) and e.get("type") == "text"]
    assert len(text_events) > 0
    full_text = "".join(e["content"] for e in text_events)
    assert full_text == "Hello there"
    assert events[-1] == "[DONE]"


@pytest.mark.asyncio
async def test_run_agent_read_tool_dispatch():
    """Read tool triggers execute_tool, emits tool_call + tool_result, then text."""
    from app.services.agent import run_agent

    responses = [
        _make_mock_response([MockToolBlock("search_contacts", {"query": "John"})]),
        _make_mock_response([MockTextBlock("Found John.")]),
    ]
    patches, _ = _agent_patches(
        responses,
        execute_tool_return={"contacts": [{"name": "John"}]},
    )

    with patches["load_history"], patches["save_msg"], patches["resolve"], \
         patches["enrich"], patches["run_query"], patches["client"], patches["execute"]:
        events = await _collect_events(run_agent("conv-1", "agent-1", "Find John"))

    event_types = [e.get("type") if isinstance(e, dict) else e for e in events]
    assert "tool_call" in event_types
    assert "tool_result" in event_types
    assert "text" in event_types
    assert events[-1] == "[DONE]"


@pytest.mark.asyncio
async def test_run_agent_write_tool_queues_confirmation():
    """Write tool calls queue_write_tool, emits confirmation event, loop stops."""
    from app.services.agent import run_agent

    response = _make_mock_response([
        MockToolBlock("send_email", {"to": "john@test.com", "body": "Hi"})
    ])
    patches, mock_client = _agent_patches(
        response,
        queue_write_return={"pending_id": "abc-123", "tool": "send_email", "preview": {}},
    )

    with patches["load_history"], patches["save_msg"], patches["resolve"], \
         patches["enrich"], patches["run_query"], patches["client"], patches["queue"]:
        events = await _collect_events(run_agent("conv-1", "agent-1", "Email John"))

    event_types = [e.get("type") if isinstance(e, dict) else e for e in events]
    assert "confirmation" in event_types
    assert events[-1] == "[DONE]"

    confirmation_event = next(e for e in events if isinstance(e, dict) and e.get("type") == "confirmation")
    assert confirmation_event["pending_id"] == "abc-123"

    # Claude should only be called once — loop breaks after confirmation
    assert mock_client.messages.create.await_count == 1


@pytest.mark.asyncio
async def test_run_agent_auto_execute_dispatch():
    """Auto-execute tool emits auto_executed event then continues to final text."""
    from app.services.agent import run_agent

    responses = [
        _make_mock_response([MockToolBlock("complete_task", {"task_id": "t-1"})]),
        _make_mock_response([MockTextBlock("Task completed.")]),
    ]
    patches, _ = _agent_patches(
        responses,
        execute_tool_return={"status": "completed"},
    )

    with patches["load_history"], patches["save_msg"], patches["resolve"], \
         patches["enrich"], patches["run_query"], patches["client"], patches["execute"]:
        events = await _collect_events(run_agent("conv-1", "agent-1", "Complete the task"))

    event_types = [e.get("type") if isinstance(e, dict) else e for e in events]
    assert "tool_call" in event_types
    assert "auto_executed" in event_types
    assert "text" in event_types
    assert events[-1] == "[DONE]"

    auto_event = next(e for e in events if isinstance(e, dict) and e.get("type") == "auto_executed")
    assert auto_event["name"] == "complete_task"
    assert auto_event["success"] is True
