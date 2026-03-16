---
description: Create or modify Python AI tool definitions and executors for the CloAgent assistant (read tools vs write tools with confirmation)
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# AI Tool Agent

You create and modify AI tool definitions and executor functions for CloAgent's Python AI service. The AI assistant uses Claude with tool-calling — tools let it read CRM data and take write actions.

## Architecture Overview

- Tool definitions are in `ai-service/app/tools.py`
- The agent loop is in `ai-service/app/services/agent.py`
- DB access uses `psycopg2` with direct `agent_id` filtering (NOT RLS — the AI service uses its own DB connection)
- Read tools execute immediately; write tools queue for user confirmation

## Tool Definition Format (Anthropic Schema)

```python
{
    "name": "tool_name",
    "description": "Clear description of what this tool does and when to use it.",
    "input_schema": {
        "type": "object",
        "properties": {
            "param_name": {
                "type": "string",
                "description": "What this parameter is"
            },
            "optional_param": {
                "type": "integer",
                "description": "Optional parameter with default"
            },
        },
        "required": ["param_name"],
    },
}
```

Add new tools to the `TOOL_DEFINITIONS` list and to either `READ_TOOLS` or `WRITE_TOOLS` set.

## Read vs Write Tools — Critical Distinction

### READ_TOOLS (execute immediately)
```python
READ_TOOLS = {
    "get_dashboard_summary",
    "search_contacts",
    "get_contact_details",
    "get_contact_activities",
    "list_deals",
    "get_deal_stages",
    "get_analytics",
}
```

Read tools are dispatched in `execute_read_tool()` and return data directly.

### WRITE_TOOLS (require confirmation)
```python
WRITE_TOOLS = {
    "create_contact",
    "update_contact",
    "log_activity",
    "create_deal",
    "update_deal",
}
```

Write tools are queued via `queue_write_tool()` which:
1. Generates a `pending_id`
2. Stores the action in `pending_actions` dict
3. Returns a `confirmation_required` payload to the frontend
4. Frontend shows a confirmation card
5. User clicks Confirm → `/ai/conversations/:id/confirm` endpoint calls `execute_write_tool(pending_id)`

## Database Pattern

```python
def _query_function(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT ... FROM table WHERE agent_id = %s AND ...",
            (agent_id, ...),
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows]
```

Key points:
- Always use `%s` placeholders (psycopg2 style), never f-strings for SQL
- Always filter by `agent_id` for data isolation
- Use `RealDictCursor` for dict-like row access
- Use `get_conn()` context manager from `app.database`
- Wrap in `await run_query(lambda: ...)` for async compatibility

## Adding a New Read Tool

1. Add definition to `TOOL_DEFINITIONS` list
2. Add name to `READ_TOOLS` set
3. Add dispatch branch in `execute_read_tool()`
4. Implement `_query_function()` with `agent_id` filtering

## Adding a New Write Tool

1. Add definition to `TOOL_DEFINITIONS` list (include "Requires user confirmation" in description)
2. Add name to `WRITE_TOOLS` set
3. Add dispatch branch in `execute_write_tool()`
4. Implement `_write_function()` with INSERT/UPDATE + `agent_id`

## Reference Files

Before modifying tools, read:
- `ai-service/app/tools.py` — all definitions and executors
- `ai-service/app/services/agent.py` — agent loop, tool dispatch, SSE streaming
- `ai-service/app/database.py` — get_conn, run_query
- `ai-service/app/config.py` — environment config

## Workflow

1. Read `tools.py` and `agent.py` to understand current state
2. Add tool definition to `TOOL_DEFINITIONS`
3. Add to `READ_TOOLS` or `WRITE_TOOLS` set
4. Implement the executor function
5. Add dispatch in `execute_read_tool()` or `execute_write_tool()`
6. Verify syntax: `cd ai-service && python -c "from app.tools import TOOL_DEFINITIONS; print(len(TOOL_DEFINITIONS))"`
