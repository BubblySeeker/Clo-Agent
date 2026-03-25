"""
Server-side undo stack for auto-executed AI actions.

Each conversation maintains a stack of up to 10 undo entries.
When the AI auto-executes a write tool (update_contact, update_deal, etc.)
and the result includes previous values, the entry is pushed here.
Calling pop_undo + execute_undo reverts the last change.
"""
from app.tools import _dispatch_write_tool

# conversation_id -> list of undo entries (newest at end)
UNDO_STACKS: dict[str, list[dict]] = {}

_MAX_STACK_SIZE = 10

# Map entity type to (tool_name, id_key)
_ENTITY_TOOL_MAP = {
    "contact":       ("update_contact",       "contact_id"),
    "deal":          ("update_deal",           "deal_id"),
    "buyer_profile": ("update_buyer_profile",  "contact_id"),
    "property":      ("update_property",       "property_id"),
}


def push_undo(conversation_id: str, entry: dict) -> None:
    """Append an undo entry to the conversation's stack (capped at 10)."""
    stack = UNDO_STACKS.setdefault(conversation_id, [])
    stack.append(entry)
    if len(stack) > _MAX_STACK_SIZE:
        stack.pop(0)  # trim oldest


def pop_undo(conversation_id: str) -> dict | None:
    """Pop and return the most recent undo entry, or None if empty."""
    stack = UNDO_STACKS.get(conversation_id)
    if not stack:
        return None
    return stack.pop()


async def execute_undo(entry: dict, agent_id: str) -> dict:
    """Reconstruct and execute the reverse write tool call from an undo entry."""
    entity_type = entry.get("entity_type")
    entity_id = entry.get("entity_id")
    previous_values = entry.get("previous_values", {})

    mapping = _ENTITY_TOOL_MAP.get(entity_type)
    if mapping is None:
        return {"error": f"Unknown entity type for undo: {entity_type}"}

    tool_name, id_key = mapping
    tool_input = {id_key: entity_id, **previous_values}

    return await _dispatch_write_tool(tool_name, tool_input, agent_id)
