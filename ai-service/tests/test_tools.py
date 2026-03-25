"""
Tests for AI tool definitions, read/write/auto-execute classification,
tool schema consistency, and workflow trigger mapping.
"""
import pytest

from app.tools import TOOL_DEFINITIONS, READ_TOOLS, AUTO_EXECUTE_TOOLS, WRITE_TOOLS
from app.tools.workflows import TOOL_TO_TRIGGER


class TestToolDefinitions:
    """Validate the shape and consistency of tool definitions."""

    def test_all_tools_have_required_fields(self):
        for tool in TOOL_DEFINITIONS:
            assert "name" in tool, f"Tool missing 'name': {tool}"
            assert "description" in tool, f"Tool {tool.get('name')} missing 'description'"
            assert "input_schema" in tool, f"Tool {tool['name']} missing 'input_schema'"

    def test_all_tools_have_valid_schema(self):
        for tool in TOOL_DEFINITIONS:
            schema = tool["input_schema"]
            assert schema.get("type") == "object", (
                f"Tool {tool['name']} schema type should be 'object', got {schema.get('type')}"
            )
            assert "properties" in schema, f"Tool {tool['name']} schema missing 'properties'"
            assert "required" in schema, f"Tool {tool['name']} schema missing 'required'"

    def test_required_fields_exist_in_properties(self):
        for tool in TOOL_DEFINITIONS:
            schema = tool["input_schema"]
            properties = schema.get("properties", {})
            required = schema.get("required", [])
            for field in required:
                assert field in properties, (
                    f"Tool {tool['name']}: required field '{field}' not in properties"
                )

    def test_tool_names_are_unique(self):
        names = [t["name"] for t in TOOL_DEFINITIONS]
        assert len(names) == len(set(names)), (
            f"Duplicate tool names: {[n for n in names if names.count(n) > 1]}"
        )

    def test_every_tool_classified(self):
        all_names = {t["name"] for t in TOOL_DEFINITIONS}
        classified = READ_TOOLS | AUTO_EXECUTE_TOOLS | WRITE_TOOLS
        unclassified = all_names - classified
        assert not unclassified, f"Unclassified tools: {unclassified}"

    def test_no_tool_in_multiple_tiers(self):
        assert not (READ_TOOLS & WRITE_TOOLS), f"Both read and write: {READ_TOOLS & WRITE_TOOLS}"
        assert not (READ_TOOLS & AUTO_EXECUTE_TOOLS), f"Both read and auto-execute: {READ_TOOLS & AUTO_EXECUTE_TOOLS}"
        assert not (AUTO_EXECUTE_TOOLS & WRITE_TOOLS), f"Both auto-execute and write: {AUTO_EXECUTE_TOOLS & WRITE_TOOLS}"

    def test_read_tools_count(self):
        assert len(READ_TOOLS) >= 14, f"Expected >= 14 read tools, got {len(READ_TOOLS)}"

    def test_write_tools_count(self):
        assert len(WRITE_TOOLS) >= 9, f"Expected >= 9 write tools, got {len(WRITE_TOOLS)}"

    def test_expected_read_tools_exist(self):
        expected = {
            "get_dashboard_summary", "search_contacts", "get_contact_details",
            "get_contact_activities", "list_deals", "get_deal", "get_deal_stages",
            "get_buyer_profile", "get_all_activities", "get_analytics",
            "get_overdue_tasks", "semantic_search", "search_properties",
            "get_property", "match_buyer_to_properties",
        }
        missing = expected - READ_TOOLS
        assert not missing, f"Missing read tools: {missing}"

    def test_expected_write_tools_exist(self):
        expected = {
            "create_contact", "update_contact", "delete_contact",
            "log_activity", "create_deal", "update_deal", "delete_deal",
            "create_buyer_profile", "update_buyer_profile",
            "create_task", "create_property", "update_property", "delete_property",
        }
        missing = expected - WRITE_TOOLS
        assert not missing, f"Missing write tools: {missing}"

    def test_auto_execute_tools_exist(self):
        expected = {"complete_task", "reschedule_task"}
        missing = expected - AUTO_EXECUTE_TOOLS
        assert not missing, f"Missing auto-execute tools: {missing}"

    def test_auto_execute_not_in_read_or_write(self):
        for tool in AUTO_EXECUTE_TOOLS:
            assert tool not in READ_TOOLS, f"Auto-execute tool {tool} in READ_TOOLS"
            assert tool not in WRITE_TOOLS, f"Auto-execute tool {tool} in WRITE_TOOLS"

    def test_tool_descriptions_not_empty(self):
        for tool in TOOL_DEFINITIONS:
            assert tool["description"].strip(), f"Tool {tool['name']} has empty description"

    def test_create_contact_schema(self):
        tool = next(t for t in TOOL_DEFINITIONS if t["name"] == "create_contact")
        schema = tool["input_schema"]
        assert "first_name" in schema["properties"]
        assert "last_name" in schema["properties"]
        assert "first_name" in schema["required"]
        assert "last_name" in schema["required"]

    def test_create_task_schema(self):
        tool = next(t for t in TOOL_DEFINITIONS if t["name"] == "create_task")
        schema = tool["input_schema"]
        assert "body" in schema["properties"]
        assert "due_date" in schema["properties"]
        assert "body" in schema["required"]
        assert "due_date" in schema["required"]

    def test_search_contacts_is_flexible(self):
        tool = next(t for t in TOOL_DEFINITIONS if t["name"] == "search_contacts")
        schema = tool["input_schema"]
        assert schema.get("required", []) == [], "search_contacts should have no required fields"

    def test_create_property_schema(self):
        tool = next(t for t in TOOL_DEFINITIONS if t["name"] == "create_property")
        schema = tool["input_schema"]
        assert "address" in schema["properties"]
        assert "address" in schema["required"]


class TestToolTriggerMapping:
    def test_trigger_mapping_exists(self):
        assert "create_contact" in TOOL_TO_TRIGGER
        assert TOOL_TO_TRIGGER["create_contact"] == "contact_created"

    def test_trigger_mapping_values(self):
        valid_triggers = {
            "contact_created", "deal_stage_changed",
            "activity_logged", "email_sent", "manual",
        }
        for tool, trigger in TOOL_TO_TRIGGER.items():
            assert trigger in valid_triggers, (
                f"Tool {tool} maps to unknown trigger type: {trigger}"
            )
