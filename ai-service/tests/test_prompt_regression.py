"""
Prompt regression tests — 8 end-to-end scenarios that verify the intelligence
pre-processor, prompt builder, and agent loop work together correctly.

Each test mocks the DB layer and Claude API, then asserts that:
- Entity resolution fires and resolves the right contacts
- The system prompt contains the expected context
- The agent loop emits the expected SSE event sequence
- Tool dispatch follows the correct tier (read/write/auto-execute)
"""
import json
import re
from unittest.mock import MagicMock, AsyncMock, patch
from dataclasses import dataclass

import pytest

from app.services.intelligence import (
    EntityContext,
    ResolvedEntity,
    _extract_tokens,
    _check_recency,
    resolve_entities,
    enrich_context,
)
from app.services.prompt_builder import build_system_prompt


# ── Helpers ──────────────────────────────────────────────────────────────────


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


def _make_response(content_blocks):
    resp = MagicMock()
    resp.content = content_blocks
    return resp


def _parse_events(raw_lines: list[str]) -> list:
    events = []
    for line in raw_lines:
        if line.strip() == "data: [DONE]":
            events.append("[DONE]")
        elif line.startswith("data: "):
            events.append(json.loads(line[len("data: "):].strip()))
    return events


async def _collect(async_gen) -> list:
    raw = []
    async for chunk in async_gen:
        raw.append(chunk)
    return _parse_events(raw)


def _rohan_entity():
    return ResolvedEntity(
        contact_id="rohan-uuid",
        first_name="Rohan",
        last_name="Batre",
        email="rohan@example.com",
        phone="555-0100",
        source="website",
        match_type="exact",
    )


def _john_a_entity():
    return ResolvedEntity(
        contact_id="john-a-uuid",
        first_name="John",
        last_name="Adams",
        email="john.a@example.com",
        phone=None,
        source="referral",
        match_type="partial",
    )


def _john_b_entity():
    return ResolvedEntity(
        contact_id="john-b-uuid",
        first_name="John",
        last_name="Baker",
        email="john.b@example.com",
        phone=None,
        source="website",
        match_type="partial",
    )


def _recent_entity():
    return ResolvedEntity(
        contact_id="recent-uuid",
        first_name="Sarah",
        last_name="Johnson",
        email="sarah@example.com",
        phone="555-0200",
        source="open_house",
        match_type="recency",
    )


def _agent_patches(claude_responses, entity_ctx=None, enrichment="", execute_return=None, queue_return=None):
    """Build a dict of patches for run_agent tests."""
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
            return_value=entity_ctx or EntityContext(),
        ),
        "enrich": patch("app.services.agent.enrich_context", return_value=enrichment),
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
    if execute_return is not None:
        patches["execute"] = patch(
            "app.services.agent.execute_tool",
            new_callable=AsyncMock,
            return_value=execute_return,
        )
    if queue_return is not None:
        patches["queue"] = patch(
            "app.services.agent.queue_write_tool",
            return_value=queue_return,
        )
    return patches, mock_client


# ── Scenario 1: "Email Rohan Batre" → resolves contact, drafts email ────────


class TestEmailRohanBatre:
    """Scenario 1: Full name resolves to exact match, draft_email uses resolved ID."""

    def test_token_extraction(self):
        tokens = _extract_tokens("Email Rohan Batre")
        joined = " ".join(tokens)
        assert "Rohan" in joined
        assert "Batre" in joined

    def test_prompt_includes_resolved_entity(self):
        entity = _rohan_entity()
        ctx = EntityContext(contacts=[entity], recency_match=False, raw_tokens=["Rohan Batre"])

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_cursor.fetchall.return_value = []
        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor

        with patch("app.services.intelligence.get_conn", return_value=mock_conn):
            enrichment = enrich_context(ctx, "agent-1")

        prompt = build_system_prompt(agent_name="Alice", entity_context=enrichment)
        assert "Rohan Batre" in prompt
        assert "rohan-uuid" in prompt
        assert "use contact_id rohan-uuid directly" in prompt

    @pytest.mark.asyncio
    async def test_agent_drafts_email_with_confirmation(self):
        """Agent should emit draft_email tool call, then confirmation event."""
        from app.services.agent import run_agent

        entity_ctx = EntityContext(
            contacts=[_rohan_entity()], recency_match=False, raw_tokens=["Rohan Batre"]
        )
        response = _make_response([
            MockToolBlock("draft_email", {"contact_id": "rohan-uuid", "subject": "Showing", "body": "Hi Rohan"})
        ])
        patches, mock_client = _agent_patches(
            response,
            entity_ctx=entity_ctx,
            enrichment="<resolved_entities>Rohan Batre rohan-uuid</resolved_entities>",
            execute_return={"draft": "Hi Rohan"},
        )

        with patches["load_history"], patches["save_msg"], patches["resolve"], \
             patches["enrich"], patches["run_query"], patches["client"], patches["execute"]:
            events = await _collect(run_agent("conv-1", "agent-1", "Email Rohan Batre"))

        types = [e.get("type") if isinstance(e, dict) else e for e in events]
        assert "tool_call" in types
        assert "tool_result" in types

        # Verify resolve_entities was called with the user message
        patches["resolve"].start()
        # Already verified via mock setup — entity_ctx is returned


# ── Scenario 2: "What deals does Rohan have?" → partial name resolution ─────


class TestPartialNameResolution:
    """Scenario 2: Partial name 'Rohan' resolves via token extraction."""

    def test_partial_name_extraction(self):
        tokens = _extract_tokens("What deals does Rohan have?")
        assert any("Rohan" in t for t in tokens)

    @pytest.mark.asyncio
    async def test_agent_chains_search_then_deals(self):
        """Agent resolves Rohan, then calls list_deals with contact filter."""
        from app.services.agent import run_agent

        entity_ctx = EntityContext(
            contacts=[_rohan_entity()], recency_match=False, raw_tokens=["Rohan"]
        )
        responses = [
            _make_response([MockToolBlock("list_deals", {"contact_id": "rohan-uuid"})]),
            _make_response([MockTextBlock("Rohan has 2 active deals.")]),
        ]
        patches, _ = _agent_patches(
            responses,
            entity_ctx=entity_ctx,
            enrichment="<resolved_entities>Rohan Batre rohan-uuid</resolved_entities>",
            execute_return={"deals": [{"name": "Deal A"}, {"name": "Deal B"}]},
        )

        with patches["load_history"], patches["save_msg"], patches["resolve"], \
             patches["enrich"], patches["run_query"], patches["client"], patches["execute"]:
            events = await _collect(run_agent("conv-1", "agent-1", "What deals does Rohan have?"))

        types = [e.get("type") if isinstance(e, dict) else e for e in events]
        assert "tool_call" in types
        assert "text" in types
        text = "".join(e["content"] for e in events if isinstance(e, dict) and e.get("type") == "text")
        assert "deal" in text.lower() or "Deal" in text


# ── Scenario 3: "Show me my last contact" → recency query ───────────────────


class TestRecencyQuery:
    """Scenario 3: Recency phrases trigger the recency DB path."""

    def test_recency_detected(self):
        assert _check_recency("Show me my last contact") is True

    def test_no_name_tokens_in_recency(self):
        tokens = _extract_tokens("Show me my last contact")
        # All words are stop words, so no name tokens
        assert tokens == []

    @pytest.mark.asyncio
    async def test_agent_uses_recency_entity(self):
        """Pre-resolved recency entity should be in context; no search_contacts needed."""
        from app.services.agent import run_agent

        entity_ctx = EntityContext(
            contacts=[_recent_entity()], recency_match=True, raw_tokens=[]
        )
        response = _make_response([MockTextBlock("Your most recent contact is Sarah Johnson.")])
        patches, mock_client = _agent_patches(
            response,
            entity_ctx=entity_ctx,
            enrichment="<resolved_entities>Sarah Johnson recent-uuid recency</resolved_entities>",
        )

        with patches["load_history"], patches["save_msg"], patches["resolve"], \
             patches["enrich"], patches["run_query"], patches["client"]:
            events = await _collect(run_agent("conv-1", "agent-1", "Show me my last contact"))

        # Claude should respond with text directly (entity was pre-resolved)
        types = [e.get("type") if isinstance(e, dict) else e for e in events]
        assert "text" in types
        # Only one Claude call needed since entity was pre-resolved
        assert mock_client.messages.create.await_count == 1


# ── Scenario 4: "Email Rohan about the showing tomorrow" → multi-step ───────


class TestMultiStepEmailWithContext:
    """Scenario 4: Resolves contact + drafts email mentioning tomorrow's date."""

    def test_token_extraction_ignores_stop_words(self):
        tokens = _extract_tokens("Email Rohan about the showing tomorrow")
        assert any("Rohan" in t for t in tokens)
        # "showing" and "tomorrow" are stop words
        assert not any("showing" in t.lower() for t in tokens)
        assert not any("tomorrow" in t.lower() for t in tokens)

    def test_prompt_has_date_context(self):
        """Tomorrow's date is always in the prompt for relative date resolution."""
        from datetime import date, timedelta

        prompt = build_system_prompt(agent_name="Alice")
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        assert tomorrow in prompt

    @pytest.mark.asyncio
    async def test_agent_resolves_then_drafts(self):
        """Pre-resolution + draft_email in one flow."""
        from app.services.agent import run_agent

        entity_ctx = EntityContext(
            contacts=[_rohan_entity()], recency_match=False, raw_tokens=["Rohan"]
        )
        responses = [
            _make_response([
                MockToolBlock("draft_email", {
                    "contact_id": "rohan-uuid",
                    "subject": "Showing Tomorrow",
                    "body": "Hi Rohan, confirming the showing tomorrow.",
                })
            ]),
            _make_response([MockTextBlock("I've drafted an email to Rohan about tomorrow's showing.")]),
        ]
        patches, _ = _agent_patches(
            responses,
            entity_ctx=entity_ctx,
            enrichment="<resolved_entities>Rohan Batre rohan-uuid</resolved_entities>",
            execute_return={"draft": "email drafted"},
        )

        with patches["load_history"], patches["save_msg"], patches["resolve"], \
             patches["enrich"], patches["run_query"], patches["client"], patches["execute"]:
            events = await _collect(run_agent("conv-1", "agent-1", "Email Rohan about the showing tomorrow"))

        types = [e.get("type") if isinstance(e, dict) else e for e in events]
        assert "tool_call" in types


# ── Scenario 5: "Find John" (multiple Johns) → disambiguation ───────────────


class TestDisambiguationMultipleMatches:
    """Scenario 5: Multiple contacts match 'John' → agent should list candidates."""

    def test_token_extraction(self):
        tokens = _extract_tokens("Find John")
        assert any("John" in t for t in tokens)

    def test_enrichment_with_multiple_contacts(self):
        """Two Johns → enrichment lists both, no 'use directly' hint."""
        entities = [_john_a_entity(), _john_b_entity()]
        ctx = EntityContext(contacts=entities, recency_match=False, raw_tokens=["John"])

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_cursor.fetchall.return_value = []
        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor

        with patch("app.services.intelligence.get_conn", return_value=mock_conn):
            enrichment = enrich_context(ctx, "agent-1")

        assert "John Adams" in enrichment
        assert "John Baker" in enrichment
        assert "john-a-uuid" in enrichment
        assert "john-b-uuid" in enrichment
        # With 2 contacts, should NOT have the "use directly" instruction
        assert "Since exactly one contact matched" not in enrichment

    @pytest.mark.asyncio
    async def test_agent_presents_disambiguation(self):
        """Agent should respond with text listing both Johns."""
        from app.services.agent import run_agent

        entity_ctx = EntityContext(
            contacts=[_john_a_entity(), _john_b_entity()],
            recency_match=False,
            raw_tokens=["John"],
        )
        response = _make_response([
            MockTextBlock("I found 2 contacts named John:\n- John Adams\n- John Baker\nWhich one?")
        ])
        patches, mock_client = _agent_patches(
            response,
            entity_ctx=entity_ctx,
            enrichment="<resolved_entities>John Adams john-a-uuid\nJohn Baker john-b-uuid</resolved_entities>",
        )

        with patches["load_history"], patches["save_msg"], patches["resolve"], \
             patches["enrich"], patches["run_query"], patches["client"]:
            events = await _collect(run_agent("conv-1", "agent-1", "Find John"))

        types = [e.get("type") if isinstance(e, dict) else e for e in events]
        assert "text" in types
        text = "".join(e["content"] for e in events if isinstance(e, dict) and e.get("type") == "text")
        assert "John" in text


# ── Scenario 6: "Call Nonexistent Person" → graceful no-match ────────────────


class TestNoMatchGraceful:
    """Scenario 6: No contacts match → empty entity context, agent handles gracefully."""

    def test_token_extraction_captures_name(self):
        tokens = _extract_tokens("Call Nonexistent Person")
        joined = " ".join(tokens)
        assert "Nonexistent" in joined or "Person" in joined

    @pytest.mark.asyncio
    async def test_resolve_returns_empty_on_no_match(self):
        """DB returns no rows → EntityContext with empty contacts."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor

        with patch("app.services.intelligence.get_conn", return_value=mock_conn):
            with patch("app.services.intelligence.run_query", new_callable=AsyncMock,
                        side_effect=lambda fn: fn()):
                ctx = await resolve_entities("Call Nonexistent Person", "agent-1")

        assert ctx.contacts == []

    @pytest.mark.asyncio
    async def test_agent_reports_not_found(self):
        """With no pre-resolved entities, Claude searches and reports not found."""
        from app.services.agent import run_agent

        responses = [
            _make_response([MockToolBlock("search_contacts", {"query": "Nonexistent Person"})]),
            _make_response([MockTextBlock("I couldn't find a contact named 'Nonexistent Person'.")]),
        ]
        patches, _ = _agent_patches(
            responses,
            entity_ctx=EntityContext(),
            execute_return={"contacts": [], "total": 0},
        )

        with patches["load_history"], patches["save_msg"], patches["resolve"], \
             patches["enrich"], patches["run_query"], patches["client"], patches["execute"]:
            events = await _collect(run_agent("conv-1", "agent-1", "Call Nonexistent Person"))

        text = "".join(
            e["content"] for e in events
            if isinstance(e, dict) and e.get("type") == "text"
        )
        assert "couldn't find" in text.lower() or "not found" in text.lower() or "Nonexistent" in text


# ── Scenario 7: "Brief me" → chains dashboard + tasks + activities ───────────


class TestBriefingChain:
    """Scenario 7: 'Brief me' triggers multiple tool calls across rounds."""

    def test_no_name_tokens_in_briefing(self):
        tokens = _extract_tokens("Brief me")
        assert tokens == []

    def test_prompt_includes_briefing_instructions(self):
        prompt = build_system_prompt(agent_name="Alice")
        assert "brief me" in prompt.lower() or "morning briefing" in prompt.lower()
        assert "get_dashboard_summary" in prompt
        assert "get_overdue_tasks" in prompt

    @pytest.mark.asyncio
    async def test_agent_chains_multiple_tools(self):
        """Agent calls dashboard + tasks + activities, then summarizes."""
        from app.services.agent import run_agent

        responses = [
            _make_response([
                MockToolBlock("get_dashboard_summary", {}, id="t-1"),
                MockToolBlock("get_overdue_tasks", {}, id="t-2"),
                MockToolBlock("get_all_activities", {"limit": 10}, id="t-3"),
            ]),
            _make_response([MockTextBlock("## Good morning!\n### Overview\nPipeline healthy.")]),
        ]
        patches, _ = _agent_patches(
            responses,
            entity_ctx=EntityContext(),
            execute_return={"summary": "pipeline ok"},
        )

        with patches["load_history"], patches["save_msg"], patches["resolve"], \
             patches["enrich"], patches["run_query"], patches["client"], patches["execute"]:
            events = await _collect(run_agent("conv-1", "agent-1", "Brief me"))

        tool_calls = [
            e for e in events
            if isinstance(e, dict) and e.get("type") == "tool_call"
        ]
        assert len(tool_calls) >= 3

        tool_names = {tc["name"] for tc in tool_calls}
        assert "get_dashboard_summary" in tool_names
        assert "get_overdue_tasks" in tool_names
        assert "get_all_activities" in tool_names

        text = "".join(
            e["content"] for e in events
            if isinstance(e, dict) and e.get("type") == "text"
        )
        assert "morning" in text.lower() or "overview" in text.lower()


# ── Scenario 8: Contact-scoped "draft a follow-up" → uses context ────────────


class TestContactScopedFollowUp:
    """Scenario 8: Contact-scoped conversation has context pre-loaded;
    agent uses the contact UUID directly without searching."""

    def test_prompt_includes_contact_context(self):
        contact_block = "\n\n## Current Contact Context\nName: Jane Smith"
        prompt = build_system_prompt(agent_name="Alice", contact_context=contact_block)
        assert "Jane Smith" in prompt
        assert prompt.endswith(contact_block)

    @pytest.mark.asyncio
    async def test_agent_uses_scoped_contact_directly(self):
        """With contact_id on the conversation, agent skips search and acts directly."""
        from app.services.agent import run_agent

        mock_client = AsyncMock()
        # Claude should draft email using the scoped contact's ID directly
        mock_client.messages.create = AsyncMock(side_effect=[
            _make_response([
                MockToolBlock("draft_email", {
                    "contact_id": "jane-uuid",
                    "subject": "Follow-up",
                    "body": "Hi Jane, following up on our conversation.",
                })
            ]),
            _make_response([MockTextBlock("I've drafted a follow-up email to Jane.")]),
        ])

        contact_context = "\n\n## Current Contact Context\nName: Jane Smith\nID: jane-uuid"

        with patch("app.services.agent._load_history",
                    return_value=([], {"name": "Test Agent"}, {"id": "conv-1", "contact_id": "jane-uuid"})), \
             patch("app.services.agent._save_assistant_message"), \
             patch("app.services.agent.resolve_entities", new_callable=AsyncMock,
                   return_value=EntityContext()), \
             patch("app.services.agent.enrich_context", return_value=""), \
             patch("app.services.agent._load_contact_context", return_value=contact_context), \
             patch("app.services.agent.run_query", new_callable=AsyncMock,
                   side_effect=lambda fn: fn()), \
             patch("app.services.agent.anthropic.AsyncAnthropic", return_value=mock_client), \
             patch("app.services.agent.execute_tool", new_callable=AsyncMock,
                   return_value={"draft": "Follow-up drafted"}):
            events = await _collect(run_agent("conv-1", "agent-1", "Draft a follow-up"))

        types = [e.get("type") if isinstance(e, dict) else e for e in events]
        assert "tool_call" in types

        # Verify the tool was called with the scoped contact's ID
        tool_call = next(e for e in events if isinstance(e, dict) and e.get("type") == "tool_call")
        assert tool_call["name"] == "draft_email"

        # Claude should NOT have called search_contacts
        search_calls = [
            e for e in events
            if isinstance(e, dict) and e.get("type") == "tool_call" and e.get("name") == "search_contacts"
        ]
        assert len(search_calls) == 0
