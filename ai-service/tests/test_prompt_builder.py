"""Tests for the system prompt builder."""
from datetime import date, timedelta

from app.services.prompt_builder import build_system_prompt


class TestBuildSystemPrompt:
    def test_date_context_included(self):
        """Today's date and day name appear in the prompt."""
        prompt = build_system_prompt(agent_name="Alice")
        today = date.today()
        assert today.strftime("%A") in prompt
        assert today.isoformat() in prompt
        tomorrow = today + timedelta(days=1)
        assert tomorrow.isoformat() in prompt

    def test_entity_injection(self):
        """entity_context appears when provided, absent when empty."""
        entity_block = "<resolved_entities>\nJohn Doe: uuid-123\n</resolved_entities>"

        prompt_with = build_system_prompt(agent_name="Alice", entity_context=entity_block)
        assert entity_block in prompt_with

        prompt_without = build_system_prompt(agent_name="Alice", entity_context="")
        assert "John Doe: uuid-123" not in prompt_without

    def test_gmail_connected(self):
        """Gmail connected shows address; disconnected shows 'Not connected'."""
        prompt = build_system_prompt(
            agent_name="Alice",
            gmail_status={"connected": True, "gmail_address": "test@gmail.com"},
        )
        assert "test@gmail.com" in prompt

        prompt_disconnected = build_system_prompt(
            agent_name="Alice",
            gmail_status={"connected": False},
        )
        assert "Not connected" in prompt_disconnected
        assert "test@gmail.com" not in prompt_disconnected

    def test_contact_scoped_context(self):
        """contact_context appears at the end of the prompt."""
        contact_block = "\n## Current Contact Context\nName: Jane Smith"

        prompt = build_system_prompt(agent_name="Alice", contact_context=contact_block)
        assert contact_block in prompt
        assert prompt.endswith(contact_block)

        prompt_without = build_system_prompt(agent_name="Alice")
        assert "Jane Smith" not in prompt_without
