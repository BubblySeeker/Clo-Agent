"""
Tests for AI tool definitions, read/write classification, and tool schema consistency.
These tests do not require a database connection — they validate the tool metadata
and classification logic that the agent loop relies on.
"""
import json
import pytest


def get_tool_definitions():
    """Import tool definitions lazily to avoid DB connection at import time."""
    # We need to mock the database module before importing tools
    import sys
    from unittest.mock import MagicMock

    # Mock database module so tools.py can be imported without a real DB
    mock_db = MagicMock()
    mock_db.get_conn = MagicMock()
    mock_db.run_query = MagicMock()
    sys.modules.setdefault("app.database", mock_db)

    from app.tools import TOOL_DEFINITIONS, READ_TOOLS, WRITE_TOOLS
    return TOOL_DEFINITIONS, READ_TOOLS, WRITE_TOOLS


class TestToolDefinitions:
    """Validate the shape and consistency of tool definitions."""

    def setup_method(self):
        self.definitions, self.read_tools, self.write_tools = get_tool_definitions()

    def test_all_tools_have_required_fields(self):
        for tool in self.definitions:
            assert "name" in tool, f"Tool missing 'name': {tool}"
            assert "description" in tool, f"Tool {tool.get('name')} missing 'description'"
            assert "input_schema" in tool, f"Tool {tool['name']} missing 'input_schema'"

    def test_all_tools_have_valid_schema(self):
        for tool in self.definitions:
            schema = tool["input_schema"]
            assert schema.get("type") == "object", (
                f"Tool {tool['name']} schema type should be 'object', got {schema.get('type')}"
            )
            assert "properties" in schema, f"Tool {tool['name']} schema missing 'properties'"
            assert "required" in schema, f"Tool {tool['name']} schema missing 'required'"

    def test_required_fields_exist_in_properties(self):
        for tool in self.definitions:
            schema = tool["input_schema"]
            properties = schema.get("properties", {})
            required = schema.get("required", [])
            for field in required:
                assert field in properties, (
                    f"Tool {tool['name']}: required field '{field}' not in properties"
                )

    def test_tool_names_are_unique(self):
        names = [t["name"] for t in self.definitions]
        assert len(names) == len(set(names)), (
            f"Duplicate tool names: {[n for n in names if names.count(n) > 1]}"
        )

    def test_every_tool_classified_as_read_or_write(self):
        all_names = {t["name"] for t in self.definitions}
        classified = self.read_tools | self.write_tools
        unclassified = all_names - classified
        assert not unclassified, (
            f"Tools not classified as read or write: {unclassified}"
        )

    def test_no_tool_is_both_read_and_write(self):
        overlap = self.read_tools & self.write_tools
        assert not overlap, f"Tools classified as both read and write: {overlap}"

    def test_read_tools_count(self):
        assert len(self.read_tools) >= 14, (
            f"Expected at least 14 read tools, got {len(self.read_tools)}"
        )

    def test_write_tools_count(self):
        assert len(self.write_tools) >= 15, (
            f"Expected at least 15 write tools, got {len(self.write_tools)}"
        )

    def test_expected_read_tools_exist(self):
        expected = {
            "get_dashboard_summary",
            "search_contacts",
            "get_contact_details",
            "get_contact_activities",
            "list_deals",
            "get_deal",
            "get_deal_stages",
            "get_buyer_profile",
            "get_all_activities",
            "get_analytics",
            "get_overdue_tasks",
            "semantic_search",
            "search_properties",
            "get_property",
            "match_buyer_to_properties",
        }
        missing = expected - self.read_tools
        assert not missing, f"Missing read tools: {missing}"

    def test_expected_write_tools_exist(self):
        expected = {
            "create_contact",
            "update_contact",
            "delete_contact",
            "log_activity",
            "create_deal",
            "update_deal",
            "delete_deal",
            "create_buyer_profile",
            "update_buyer_profile",
            "create_task",
            "complete_task",
            "reschedule_task",
            "create_property",
            "update_property",
            "delete_property",
        }
        missing = expected - self.write_tools
        assert not missing, f"Missing write tools: {missing}"

    def test_tool_descriptions_not_empty(self):
        for tool in self.definitions:
            assert tool["description"].strip(), (
                f"Tool {tool['name']} has empty description"
            )

    def test_create_contact_schema(self):
        tool = next(t for t in self.definitions if t["name"] == "create_contact")
        schema = tool["input_schema"]
        assert "first_name" in schema["properties"]
        assert "last_name" in schema["properties"]
        assert "first_name" in schema["required"]
        assert "last_name" in schema["required"]

    def test_create_task_schema(self):
        tool = next(t for t in self.definitions if t["name"] == "create_task")
        schema = tool["input_schema"]
        assert "body" in schema["properties"]
        assert "due_date" in schema["properties"]
        assert "body" in schema["required"]
        assert "due_date" in schema["required"]

    def test_search_contacts_is_flexible(self):
        tool = next(t for t in self.definitions if t["name"] == "search_contacts")
        schema = tool["input_schema"]
        # search_contacts should not require any fields
        assert schema.get("required", []) == [], (
            "search_contacts should have no required fields"
        )

    def test_create_property_schema(self):
        tool = next(t for t in self.definitions if t["name"] == "create_property")
        schema = tool["input_schema"]
        assert "address" in schema["properties"]
        assert "address" in schema["required"]


class TestWorkflowToolsInDefinitions:
    """Validate that workflow management tools exist in TOOL_DEFINITIONS and WRITE_TOOLS."""

    def setup_method(self):
        self.definitions, self.read_tools, self.write_tools = get_tool_definitions()
        self.tool_names = {t["name"] for t in self.definitions}

    def test_save_workflow_in_definitions(self):
        assert "save_workflow" in self.tool_names

    def test_save_workflow_in_write_tools(self):
        assert "save_workflow" in self.write_tools

    def test_update_workflow_in_definitions(self):
        assert "update_workflow" in self.tool_names

    def test_update_workflow_in_write_tools(self):
        assert "update_workflow" in self.write_tools

    def test_save_conversation_as_workflow_in_definitions(self):
        assert "save_conversation_as_workflow" in self.tool_names

    def test_save_conversation_as_workflow_in_write_tools(self):
        assert "save_conversation_as_workflow" in self.write_tools

    def test_save_workflow_schema_has_instruction(self):
        tool = next(t for t in self.definitions if t["name"] == "save_workflow")
        schema = tool["input_schema"]
        assert "instruction" in schema["properties"]

    def test_save_workflow_schema_has_name(self):
        tool = next(t for t in self.definitions if t["name"] == "save_workflow")
        schema = tool["input_schema"]
        assert "name" in schema["required"]

    def test_update_workflow_schema_has_workflow_id(self):
        tool = next(t for t in self.definitions if t["name"] == "update_workflow")
        schema = tool["input_schema"]
        assert "workflow_id" in schema["required"]

    def test_instruction_validation_rejects_long_text(self):
        """Instructions over 5000 chars should be rejected."""
        import sys
        from unittest.mock import MagicMock
        sys.modules.setdefault("app.database", MagicMock())
        from app.tools import _save_workflow

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        with __import__("unittest.mock", fromlist=["patch"]).patch(
            "app.tools.get_conn", return_value=mock_conn
        ):
            result = _save_workflow("agent-1", {
                "name": "Test",
                "instruction": "x" * 5001,
                "trigger_type": "manual",
            })
            assert "error" in result
            assert "5000" in result["error"]


class TestToolTriggerMapping:
    """Validate the workflow trigger mapping."""

    def test_trigger_mapping_exists(self):
        import sys
        from unittest.mock import MagicMock
        sys.modules.setdefault("app.database", MagicMock())
        from app.tools import _TOOL_TO_TRIGGER

        assert "create_contact" in _TOOL_TO_TRIGGER
        assert _TOOL_TO_TRIGGER["create_contact"] == "contact_created"

    def test_trigger_mapping_values(self):
        import sys
        from unittest.mock import MagicMock
        sys.modules.setdefault("app.database", MagicMock())
        from app.tools import _TOOL_TO_TRIGGER

        valid_triggers = {"contact_created", "deal_stage_changed", "activity_logged", "email_sent", "manual"}
        for tool, trigger in _TOOL_TO_TRIGGER.items():
            assert trigger in valid_triggers, (
                f"Tool {tool} maps to unknown trigger type: {trigger}"
            )
