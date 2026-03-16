# Plan: Expand AI Chatbot to Full CRM Capability

## Context

The AI chatbot currently has 7 read tools and 5 write tools, but it can't do everything the user can do in the CRM UI. Missing: buyer profile management, deleting contacts/deals, follow-up queries, task queries, and single deal lookup. This plan adds 8 new tools (4 read + 4 write) to achieve full parity. No separate `update_deal_stage` tool — `update_deal` already handles stage moves via `stage_name`.

## Files to Modify

| File | Changes |
|------|---------|
| `ai-service/app/tools.py` | Add 8 tool definitions, update READ/WRITE sets, add executor dispatch + SQL implementations |
| `ai-service/app/services/agent.py` | Enhanced system prompt with full tool guidance (line 120) |
| `frontend/src/components/shared/AIChatBubble.tsx` | Add 8 entries to `toolLabel` map (line 173) |
| `frontend/src/app/dashboard/chat/page.tsx` | Add 8 entries to `toolLabel` map (line 37) |

**No Go backend changes** — proxy layer is generic.
**No migrations** — all tables exist.

## New Tools

### 4 New Read Tools (execute immediately)

| Tool | Purpose | SQL Pattern |
|------|---------|-------------|
| `get_buyer_profile` | Buyer preferences (budget, locations, must-haves) | JOIN buyer_profiles + contacts WHERE contact_id AND agent_id |
| `get_deal` | Single deal with contact name + stage info | JOIN deals/stages/contacts WHERE deal_id AND agent_id |
| `get_needs_follow_up` | Contacts with no activity in N days (default 7) | LEFT JOIN contacts/activities, GROUP BY, HAVING with `NOW() - %s * INTERVAL '1 day'` |
| `get_upcoming_tasks` | Task-type activities (agent's to-do list) | WHERE type='task' ORDER BY created_at DESC |

### 4 New Write Tools (require confirmation card)

| Tool | Purpose | SQL Pattern |
|------|---------|-------------|
| `delete_contact` | Delete contact + all cascading data | DELETE RETURNING id, first_name, last_name |
| `delete_deal` | Delete deal from pipeline | DELETE RETURNING id, title |
| `create_buyer_profile` | Create buyer preferences (handle UNIQUE violation → 409) | INSERT with array fields (psycopg2 handles lists natively) |
| `update_buyer_profile` | Update buyer preferences (partial) | Dynamic SET like `_update_contact` pattern, verify ownership via subquery |

## Implementation Steps

### Step 1: `tools.py` — Add 8 Tool Definitions to `TOOL_DEFINITIONS`

Append after the existing `update_deal` definition (line 163):

- `get_buyer_profile`: required `contact_id`
- `get_deal`: required `deal_id`
- `get_needs_follow_up`: optional `days` (int, default 7), optional `limit` (default 15)
- `get_upcoming_tasks`: optional `limit` (default 15)
- `delete_contact`: required `contact_id`, description warns about cascade
- `delete_deal`: required `deal_id`, description warns "cannot be undone"
- `create_buyer_profile`: required `contact_id`, optional fields including array types `{"type": "array", "items": {"type": "string"}}` for locations, must_haves, deal_breakers
- `update_buyer_profile`: required `contact_id`, same optional fields as create

### Step 2: `tools.py` — Update READ_TOOLS and WRITE_TOOLS Sets

```python
READ_TOOLS = {
    # existing 7...
    "get_buyer_profile", "get_deal", "get_needs_follow_up", "get_upcoming_tasks",
}

WRITE_TOOLS = {
    # existing 5...
    "delete_contact", "delete_deal", "create_buyer_profile", "update_buyer_profile",
}
```

### Step 3: `tools.py` — Read Executor Dispatch + Implementations

Add `elif` branches in `execute_read_tool()` (after line 203):

- `_get_buyer_profile(agent_id, contact_id)`: JOIN buyer_profiles + contacts for ownership check. Return error dict if not found.
- `_get_deal(agent_id, deal_id)`: JOIN deals/stages/contacts. Return error if not found.
- `_get_needs_follow_up(agent_id, days, limit)`: LEFT JOIN contacts/activities, GROUP BY contact, HAVING with `NOW() - %s * INTERVAL '1 day'` for safe parameterization (no string interpolation for interval). Include `days_since_activity` via EXTRACT.
- `_get_upcoming_tasks(agent_id, limit)`: JOIN activities/contacts WHERE type='task', include contact_name.

### Step 4: `tools.py` — Write Executor Dispatch + Implementations

Add `elif` branches in `execute_write_tool()` (after line 433):

- `_delete_contact(agent_id, inp)`: DELETE with RETURNING id, first_name, last_name. Cascades via FK constraints. Return `{"deleted": true, "name": "..."}` or `{"error": "Contact not found"}`.
- `_delete_deal(agent_id, inp)`: DELETE with RETURNING id, title. Same pattern.
- `_create_buyer_profile(agent_id, inp)`: Verify contact ownership first. INSERT all fields. Wrap in try/except for `psycopg2.errors.UniqueViolation` → return `{"error": "Buyer profile already exists. Use update_buyer_profile instead."}`.
- `_update_buyer_profile(agent_id, inp)`: Pop `contact_id`, dynamic SET clause from remaining keys. WHERE clause includes ownership subquery: `WHERE contact_id = %s AND contact_id IN (SELECT id FROM contacts WHERE agent_id = %s)`.

### Step 5: `agent.py` — Enhanced System Prompt

Replace `_build_system_prompt` (line 120-128) with expanded prompt:

```python
def _build_system_prompt(agent_name: str, contact_context: str = "") -> str:
    base = (
        f"You are CloAgent AI, a smart CRM assistant for real estate agent {agent_name}. "
        "You have full access to their CRM data and can perform any action they could do in the UI.\n\n"
        "## Capabilities\n"
        "- Search and view contacts, deals, activities, buyer profiles, and analytics\n"
        "- Create, update, and delete contacts and deals\n"
        "- Create and update buyer profiles with preferences, budget, locations, must-haves\n"
        "- Log activities (calls, emails, notes, showings, tasks)\n"
        "- Find contacts needing follow-up and view upcoming tasks\n\n"
        "## Rules\n"
        "- Use tools to get real data — never fabricate numbers or guess.\n"
        "- All write actions require user confirmation.\n"
        "- To move a deal between pipeline stages, use update_deal with stage_name.\n"
        "- Deleting a contact cascades — removes their deals, activities, buyer profile, and conversations. Warn the user.\n"
        "- Before creating a buyer profile, check if one exists (get_buyer_profile). If yes, use update_buyer_profile.\n"
        "- Use get_needs_follow_up for neglected contacts, not manual calculation.\n"
        "- Be concise and action-oriented. Summarize data clearly.\n"
    )
    return base + contact_context
```

### Step 6: Frontend — Tool Labels

Add to both `AIChatBubble.tsx` (line 173) and `chat/page.tsx` (line 37):

```typescript
get_buyer_profile: "Loading buyer profile",
get_deal: "Loading deal details",
get_needs_follow_up: "Checking follow-ups",
get_upcoming_tasks: "Loading tasks",
delete_contact: "Deleting contact",
delete_deal: "Deleting deal",
create_buyer_profile: "Creating buyer profile",
update_buyer_profile: "Updating buyer profile",
```

## Key Implementation Notes

1. **Interval parameterization**: Use `NOW() - %s * INTERVAL '1 day'` (not string interpolation) for `get_needs_follow_up` to keep it injection-safe.
2. **Array fields**: psycopg2 handles Python lists as PostgreSQL TEXT[] arrays natively — no adapters needed for locations, must_haves, deal_breakers.
3. **UNIQUE constraint**: `create_buyer_profile` must catch `psycopg2.errors.UniqueViolation` and return a helpful error.
4. **Cascade warning**: `delete_contact` description and system prompt both warn about cascading deletes.
5. **`inp.pop()` pattern**: Write executors mutate `inp` — this happens at execution time (after confirmation), so the preview card still shows the full input including IDs. Consistent with existing behavior.

## Final Tool Count

- **11 Read Tools** (7 existing + 4 new)
- **9 Write Tools** (5 existing + 4 new)
- **20 Total** — full parity with CRM UI

## Verification

1. Start AI service: `cd ai-service && python -m uvicorn app.main:app --reload`
2. "Who needs follow-up?" → triggers `get_needs_follow_up`, shows contacts with days since activity
3. "What are my tasks?" → triggers `get_upcoming_tasks`, lists task activities
4. "Show buyer profile for [name]" → triggers `search_contacts` then `get_buyer_profile`
5. "Delete [contact name]" → shows confirmation card warning about cascade
6. "Move [deal] to Closed" → triggers `update_deal` with `stage_name: "Closed"`
7. "Create buyer profile for [name] with budget 500k-800k in Austin" → confirmation card with all fields
8. "Update [name]'s must-haves to include pool and garage" → `update_buyer_profile` confirmation
9. Verify tool indicators show correct labels in both floating bubble and full chat page
