# AI Intelligence Upgrade — Implementation Tasks

7 self-contained tasks, ordered by dependency. Each can be given to a separate Claude Code session.

Suggested order: **1 → 2 → 3 → (4, 5, 6, 7 in parallel)**

---

## Task 1: Extract `_dispatch_write_tool` and `useAIStream` hook (infrastructure)

In ai-service/app/tools.py, extract a shared _dispatch_write_tool(tool_name, inp, agent_id) function that maps tool_name to the correct internal handler (_update_contact, _log_activity, _create_contact, etc.). Both the existing execute_write_tool() function (called from /ai/confirm) and a future auto-execute path will call this shared function.

The current execute_write_tool() at line ~959 has an if/elif chain mapping tool names to handlers. Extract that dispatch logic into _dispatch_write_tool() and have execute_write_tool() call it.

Also: In the frontend, extract SSE event handling from both AIChatBubble.tsx and chat/page.tsx into a shared hook at frontend/src/hooks/useAIStream.ts. Both components handle the same SSE event types (text, tool_call, tool_result, confirmation) with duplicated logic. The hook should accept callbacks and return the stream state. Then refactor both components to use the hook. No new functionality — just deduplication.

Don't change any behavior. This is a pure refactor.

---

## Task 2: Add `AUTO_EXECUTE_TOOLS` set and agent loop third branch

In ai-service/app/tools.py, add a new set:

```python
AUTO_EXECUTE_TOOLS = {
    "update_contact", "log_activity", "complete_task", "reschedule_task",
    "update_buyer_profile", "update_deal", "update_property",
}
```

In ai-service/app/services/agent.py, modify the agent loop (around line 371) to add a third branch. Currently:
- WRITE_TOOLS → queue_write_tool → SSE confirmation → break
- READ_TOOLS → execute_read_tool → SSE tool_result → continue

Add: if tool_name is in both WRITE_TOOLS and AUTO_EXECUTE_TOOLS:
1. Import and call _dispatch_write_tool(tool_name, tool_input, agent_id) from tools.py
2. yield sse({"type": "auto_executed", "name": tool_name, "result": result, "status": "success"}) — if the result contains an "error" key, set status to "error"
3. Append tool_result to tool_results (so it feeds back to Claude)
4. Do NOT break the loop — continue (unlike confirmation which breaks)
5. Add logging: logger.info("Auto-executing %s for agent %s", tool_name, agent_id)

For mixed rounds (auto-execute + confirm tools in same response): process them sequentially. Auto-execute tools run normally. When a confirm tool is hit, queue it and break as usual.

Import AUTO_EXECUTE_TOOLS in agent.py alongside the existing imports from tools.py.

---

## Task 3: Add previous values to `_update_*` functions (for undo)

In ai-service/app/tools.py, modify these 4 functions to SELECT current values before updating, and return them in the result:

1. _update_contact (line ~1059): Before the UPDATE query, add a SELECT for the fields being updated. Return {"updated": true, "contact_id": id, "previous": {field: old_val}, "updated_fields": {field: new_val}}
2. _update_deal (line ~1114): Same pattern — SELECT current values for fields being updated, return previous + updated_fields.
3. _update_buyer_profile (line ~1216): Same pattern.
4. _update_property (line ~1519): Same pattern.

Pattern for each:
- Before the UPDATE, run: SELECT {fields being updated} FROM table WHERE id = %s AND agent_id = %s
- Store the result as `previous`
- After UPDATE, return both previous and new values in the result dict
- If the SELECT returns no row (record doesn't exist), return {"error": "not found"}

Don't change the function signatures. The extra data in the return value is backward-compatible.

---

## Task 4: Server-side undo stack

Add a server-side undo capability for auto-executed actions. This replaces AI-mediated undo with deterministic reversal.

Backend (ai-service/app/tools.py or a new file ai-service/app/undo.py):
- In-memory dict: UNDO_STACKS = {} — conversation_id → list of undo entries
- Each entry: {"tool_name": str, "previous_values": dict, "entity_id": str, "entity_type": str}
- push_undo(conversation_id, entry) — append to stack, cap at 10 entries per conversation
- pop_undo(conversation_id) — pop and return last entry, or None
- execute_undo(entry, agent_id) — call _dispatch_write_tool with previous values

In agent.py: after each auto-execute, push the undo entry onto the stack.

Backend endpoint: Add a new route in the Go backend (backend/cmd/api/main.go and backend/internal/handlers/ai.go):
- POST /api/ai/conversations/{id}/undo — proxies to AI service
- AI service endpoint: POST /ai/undo/{conversation_id} — pops stack, executes undo, returns the result

Frontend: In the auto-execute visual card, add a small "Undo" button/link. On click, call the undo endpoint. On success, update the card to show "Undone". On error, show error state.

Keep it simple — in-memory dict is fine for a single-agent CRM. No Redis needed.

---

## Task 5: Auto-execute visual card (frontend)

Add frontend rendering for the "auto_executed" SSE event type in the chat UIs.

In the useAIStream hook (created in Task 1), add handling for event.type === "auto_executed":
- Accumulate auto_executed events from the same tool round into a batch
- Update message state with autoExecutedActions array

Create a new component (or inline in both chat UIs):
- AutoExecuteCard: renders a compact card showing what was auto-executed
- Green-tinted (bg-green-50 border-green-200) for status:"success"
- Red-tinted (bg-red-50 border-red-200) for status:"error"
- If multiple auto-executes in same round, combine into one card listing all changes
- Show tool label + what changed (e.g., "Updated email → rohan@example.com")
- Include text labels like "Updated" or "Failed" (not color-only, for accessibility)
- Small "Undo" link on success cards (calls the undo endpoint from Task 4)

Add "autoExecutedActions" to the ChatMessage type in frontend/src/store/ui-store.ts.

Reference the existing resolved action cards in AIChatBubble.tsx (line ~325) for styling patterns — similar compact card but without the confirm/cancel buttons.

---

## Task 6: Operation routing + enhanced tool descriptions + proactive suggestions (prompt changes)

Three prompt-level changes in ai-service/app/services/agent.py and ai-service/app/tools.py.

**1. OPERATION ROUTING DECISION TREE:** In agent.py's _build_system_prompt(), add an `<operation_routing>` block after the `</contact_resolution>` block. Format as a structured decision tree (not prose):

```
<operation_routing>
OPERATION ROUTING — follow this before every write operation:

STEP 1: Did the user explicitly say "create a new contact" or "add a new person"?
  → YES → use create_contact
  → NO → go to STEP 2

STEP 2: Does a contact already exist? (Check search results or contact context above)
  → YES → use update_contact to modify their fields
  → NO → go to STEP 3

STEP 3: Did search_contacts return 0 results for this person?
  → YES → Tell the user no contact was found. Ask if they want to create a new one.
  → NO (haven't searched yet) → call search_contacts FIRST, then return to STEP 2

NEVER create a duplicate. "Add email to Rohan" = update_contact, not create_contact.
</operation_routing>
```

**2. ENHANCED TOOL DESCRIPTIONS:** In tools.py TOOL_DEFINITIONS, update descriptions for:
- create_contact: Prepend "IMPORTANT: Only use this to create a brand-new contact that does NOT already exist. If you found the contact via search, use update_contact instead."
- update_contact: Prepend "Use this to add or change any field on an EXISTING contact. This includes adding email, phone, or any other field to a contact found via search."
- log_activity: Prepend "Use this to record something that already happened — a call, meeting, note, showing, or email interaction."

**3. PROACTIVE SUGGESTIONS:** Add to the system prompt after the operation routing block:
"After auto-executing an update on a contact, check if the contact is missing critical fields (email, phone, source). If so, briefly mention it: 'I notice [name] doesn't have a [field] yet — want me to add one?' Do not repeat suggestions for the same contact in the same conversation."

---

## Task 7: Automated prompt regression tests + Go proxy verification

Two small tasks:

**1. PROMPT REGRESSION TESTS:** Create a test script at ai-service/tests/test_prompt_regression.py. It should send these scenarios to the AI service and verify expected behavior:

Scenarios:
- a) "Create Rohan Batra" then "add his email rohan@test.com" → verify second message uses update_contact (not create_contact)
- b) "Log a call with my last contact" → verify search_contacts called with no query + limit=1, then log_activity called
- c) "Update Sarah's phone to 555-1234" → verify search_contacts then update_contact (auto-execute)
- d) "Create a deal for Rohan" → verify create_deal uses confirmation (not auto-execute)
- e) "Delete the contact" → verify delete_contact uses confirmation
- f) "Send email to Rohan" → verify send_email uses confirmation

For each: mock the Claude API response to return predictable tool_use blocks, and assert the agent loop routes correctly (auto-execute vs confirm). These are unit tests of the routing logic, not end-to-end AI tests.

**2. GO PROXY CHECK:** Verify that backend/internal/handlers/ai.go SSE proxy is a passthrough (forwards all SSE events regardless of type) rather than filtering by event type. If it filters, add "auto_executed" to the allowed types. Check the handler that proxies /api/ai/chat responses.
