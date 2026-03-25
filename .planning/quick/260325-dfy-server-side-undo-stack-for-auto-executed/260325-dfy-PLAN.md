---
phase: quick
plan: 260325-dfy
type: execute
wave: 1
depends_on: []
files_modified:
  - ai-service/app/undo.py
  - ai-service/app/services/agent.py
  - ai-service/app/routes/chat.py
  - backend/cmd/api/main.go
  - backend/internal/handlers/confirm.go
  - frontend/src/lib/api/conversations.ts
  - frontend/src/hooks/useAIStream.ts
  - frontend/src/store/ui-store.ts
  - frontend/src/components/shared/AIChatBubble.tsx
  - frontend/src/app/dashboard/chat/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Auto-executed actions show green success cards (or red error cards) in chat"
    - "Success cards have an Undo button that reverts the change"
    - "Undo button calls the undo endpoint and shows visual feedback"
  artifacts:
    - path: "ai-service/app/undo.py"
      provides: "In-memory undo stack with push/pop/execute"
    - path: "ai-service/app/routes/chat.py"
      provides: "POST /ai/undo/{conversation_id} endpoint"
    - path: "backend/internal/handlers/confirm.go"
      provides: "UndoToolAction handler proxying to AI service"
  key_links:
    - from: "ai-service/app/services/agent.py"
      to: "ai-service/app/undo.py"
      via: "push_undo after successful auto-execute"
      pattern: "push_undo"
    - from: "frontend/src/components/shared/AIChatBubble.tsx"
      to: "/api/ai/conversations/{id}/undo"
      via: "undoAutoAction fetch call"
      pattern: "undoAutoAction"
---

<objective>
Server-side undo stack for auto-executed AI actions. When the AI auto-executes a write tool (update_contact, update_deal, etc.), the previous values are pushed onto an in-memory undo stack. The frontend shows auto-executed actions as green cards with an Undo button. Clicking Undo pops the stack and re-applies the previous values.

Purpose: Users need a safety net for auto-executed actions — if the AI updates the wrong field, they can instantly revert.
Output: Full undo flow: AI service undo module, endpoint, Go proxy, frontend SSE handling + undo UI cards in both AIChatBubble and chat page.
</objective>

<execution_context>
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/workflows/execute-plan.md
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@ai-service/app/services/agent.py (auto-execute logic at lines 375-385)
@ai-service/app/tools.py (_dispatch_write_tool at line 966, AUTO_EXECUTE_TOOLS at line 569)
@ai-service/app/routes/chat.py (confirm endpoint pattern)
@backend/internal/handlers/confirm.go (proxy pattern to follow)
@backend/cmd/api/main.go (route registration, confirm route at line 193)
@frontend/src/lib/api/conversations.ts (SSEEvent type, confirmToolAction pattern)
@frontend/src/hooks/useAIStream.ts (stream callback handlers)
@frontend/src/store/ui-store.ts (ChatMessage type with resolvedAction)
@frontend/src/components/shared/AIChatBubble.tsx (confirmation card UI at lines 301-327)
@frontend/src/app/dashboard/chat/page.tsx (full chat page, also needs auto-execute cards)

<interfaces>
<!-- Key types and contracts the executor needs -->

From ai-service/app/tools.py:
```python
AUTO_EXECUTE_TOOLS = {
    "update_contact", "log_activity", "complete_task", "reschedule_task",
    "update_buyer_profile", "update_deal", "update_property",
}

async def _dispatch_write_tool(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Dispatch a write tool to its handler. Returns the tool result dict."""
```

Update tool results include "previous" key (except log_activity, complete_task, reschedule_task):
```python
# _update_contact returns:
{"updated": True, "contact_id": "...", "previous": {...}, "new": {...}}
# _update_deal returns:
{"updated": True, "deal_id": "...", "previous": {...}, "new": {...}}
# _update_buyer_profile returns:
{"updated": True, "contact_id": "...", "previous": {...}, "new": {...}}
# _update_property returns:
{"updated": True, "property_id": "...", "address": "...", "previous": {...}, "new": {...}}
```

From ai-service/app/services/agent.py (auto-execute SSE event, line 380):
```python
yield sse({"type": "auto_executed", "name": tool_name, "result": result, "status": status})
```

From frontend/src/store/ui-store.ts:
```typescript
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolCalls?: string[];
  confirmationData?: { tool: string; preview: Record<string, unknown>; pending_id: string; };
  resolvedAction?: { tool: string; preview: Record<string, unknown>; status: "confirmed" | "cancelled" | "failed"; };
}
```

From frontend/src/lib/api/conversations.ts:
```typescript
export type SSEEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; status: "running" }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "confirmation"; tool: string; preview: Record<string, unknown>; pending_id: string };
```

From frontend/src/hooks/useAIStream.ts:
```typescript
export interface AIStreamCallbacks {
  onTextUpdate: (accumulated: string) => void;
  onToolCall: (toolName: string) => void;
  onToolResult: () => void;
  onConfirmation: (data: { tool: string; preview: Record<string, unknown>; pending_id: string; }) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}
```

From backend/internal/handlers/confirm.go:
```go
func ConfirmToolAction(cfg *config.Config) http.HandlerFunc {
    // Pattern: extract agentID, decode body, marshal payload, proxy to AI service, relay response
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create undo module, integrate into agent loop, add AI service endpoint</name>
  <files>ai-service/app/undo.py, ai-service/app/services/agent.py, ai-service/app/routes/chat.py</files>
  <action>
**1. Create `ai-service/app/undo.py`:**

```python
UNDO_STACKS: dict[str, list[dict]] = {}  # conversation_id -> list of undo entries
```

Each undo entry shape:
```python
{"tool_name": str, "previous_values": dict, "entity_id": str, "entity_type": str}
```

Functions:
- `push_undo(conversation_id: str, entry: dict)` — append to stack, cap at 10 entries per conversation (trim oldest if over). Create the list if conversation_id not in dict.
- `pop_undo(conversation_id: str) -> dict | None` — pop and return last entry, or None if empty/missing.
- `async execute_undo(entry: dict, agent_id: str) -> dict` — reconstruct the tool_input from the entry and call `_dispatch_write_tool`. Entity type mapping:
  - "contact" -> tool "update_contact", input = {"contact_id": entity_id, **previous_values}
  - "deal" -> tool "update_deal", input = {"deal_id": entity_id, **previous_values}
  - "buyer_profile" -> tool "update_buyer_profile", input = {"contact_id": entity_id, **previous_values}
  - "property" -> tool "update_property", input = {"property_id": entity_id, **previous_values}
  Import `_dispatch_write_tool` from `app.tools`.

**2. In `ai-service/app/services/agent.py`:** After the auto-execute block (line 380, after the `yield sse({"type": "auto_executed", ...})` line), add undo stack push logic:

```python
# After line 380, before tool_results.append:
if status == "success" and "previous" in result:
    from app.undo import push_undo
    # Map tool_name to entity_type and entity_id
    entity_map = {
        "update_contact": ("contact", result.get("contact_id")),
        "update_deal": ("deal", result.get("deal_id")),
        "update_buyer_profile": ("buyer_profile", result.get("contact_id")),
        "update_property": ("property", result.get("property_id")),
    }
    if tool_name in entity_map:
        etype, eid = entity_map[tool_name]
        push_undo(conversation_id, {
            "tool_name": tool_name,
            "previous_values": result["previous"],
            "entity_id": str(eid),
            "entity_type": etype,
        })
```

The `conversation_id` variable is already available in `run_agent`'s scope.

**3. In `ai-service/app/routes/chat.py`:** Add a new endpoint after the `/confirm` endpoint:

```python
@router.post("/undo/{conversation_id}", dependencies=[Depends(verify_secret)])
async def undo_action(conversation_id: str, req: UndoRequest):
    """Pop the last auto-executed action and revert it."""
    from app.undo import pop_undo, execute_undo
    entry = pop_undo(conversation_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Nothing to undo")
    result = await execute_undo(entry, req.agent_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"status": "undone", "tool_name": entry["tool_name"], "entity_type": entry["entity_type"], "result": result}
```

Add `UndoRequest` model next to the other request models:
```python
class UndoRequest(BaseModel):
    agent_id: str
```
  </action>
  <verify>
    <automated>cd /Users/matthewfaust/CloAgent/Clo-Agent && python -c "from app.undo import UNDO_STACKS, push_undo, pop_undo; push_undo('test', {'tool_name': 'update_contact', 'previous_values': {'first_name': 'Old'}, 'entity_id': '123', 'entity_type': 'contact'}); e = pop_undo('test'); assert e['tool_name'] == 'update_contact'; assert pop_undo('test') is None; print('OK')" PYTHONPATH=ai-service</automated>
  </verify>
  <done>undo.py exists with push/pop/execute functions. agent.py pushes undo entries after successful auto-execute with previous values. chat.py has POST /ai/undo/{conversation_id} endpoint.</done>
</task>

<task type="auto">
  <name>Task 2: Go backend undo proxy route + Frontend undo flow (SSE, API, UI)</name>
  <files>backend/cmd/api/main.go, backend/internal/handlers/confirm.go, frontend/src/lib/api/conversations.ts, frontend/src/hooks/useAIStream.ts, frontend/src/store/ui-store.ts, frontend/src/components/shared/AIChatBubble.tsx, frontend/src/app/dashboard/chat/page.tsx</files>
  <action>
**1. Go backend — Add UndoToolAction handler in `confirm.go`:**

Follow the exact same pattern as `ConfirmToolAction`. Create `UndoToolAction(cfg *config.Config) http.HandlerFunc`:
- Extract `agentID` from context via `middleware.AgentUUIDFromContext`
- Extract conversation `id` from URL via `chi.URLParam(r, "id")`
- No request body needed (the AI service knows the conversation_id from the URL)
- Marshal payload: `{"agent_id": agentID}`
- POST to `cfg.AIServiceURL + "/ai/undo/" + id`
- Set headers: Content-Type, X-AI-Service-Secret, X-Request-ID (same as confirm handler)
- Proxy the response status and body back

**2. Register route in `main.go`:**

Add right after the confirm route (line 193):
```go
r.Post("/api/ai/conversations/{id}/undo", handlers.UndoToolAction(cfg))
```

**3. Frontend API — `conversations.ts`:**

Add `auto_executed` to SSEEvent union type:
```typescript
| { type: "auto_executed"; name: string; result: Record<string, unknown>; status: "success" | "error" }
```

Add `undoAutoAction` function (follow `confirmToolAction` pattern):
```typescript
export function undoAutoAction(
  token: string,
  conversationId: string
): Promise<{ status: string; tool_name: string; entity_type: string; result: unknown }> {
  return apiRequest(`/ai/conversations/${conversationId}/undo`, token, {
    method: "POST",
  });
}
```

**4. Frontend hook — `useAIStream.ts`:**

Add `onAutoExecuted` callback to `AIStreamCallbacks`:
```typescript
onAutoExecuted: (data: { name: string; result: Record<string, unknown>; status: "success" | "error" }) => void;
```

In `startStream`, add handler for the new event type in the event callback (after the `confirmation` handler):
```typescript
} else if (event.type === "auto_executed") {
  callbacks.onAutoExecuted({
    name: event.name,
    result: event.result,
    status: event.status,
  });
}
```

**5. Frontend store — `ui-store.ts`:**

Add `autoExecutedActions` to `ChatMessage`:
```typescript
autoExecutedActions?: Array<{
  tool: string;
  result: Record<string, unknown>;
  status: "success" | "error" | "undone";
}>;
```

**6. Frontend UI — `AIChatBubble.tsx`:**

Import `undoAutoAction` from conversations.ts. Add `Undo2` to lucide-react imports.

In the `startStream` callbacks object (around line 105), add `onAutoExecuted`:
```typescript
onAutoExecuted: (data) => {
  const current = useUIStore.getState().chatMessages;
  const last = current[current.length - 1];
  const existing = last?.autoExecutedActions ?? [];
  useUIStore.getState().setChatMessages([
    ...current.slice(0, -1),
    { ...last, autoExecutedActions: [...existing, { tool: data.name, result: data.result, status: data.status }] },
  ]);
},
```

Add an undo handler function (near `handleConfirm`/`handleCancel`):
```typescript
const handleUndo = async (actionIndex: number) => {
  const token = await getToken();
  if (!token || !chatConversationId) return;
  try {
    await undoAutoAction(token, chatConversationId);
    // Mark the action as undone in UI
    const current = useUIStore.getState().chatMessages;
    const last = current[current.length - 1];
    if (last?.autoExecutedActions) {
      const updated = [...last.autoExecutedActions];
      updated[actionIndex] = { ...updated[actionIndex], status: "undone" };
      useUIStore.getState().setChatMessages([
        ...current.slice(0, -1),
        { ...last, autoExecutedActions: updated },
      ]);
    }
  } catch {
    // silently fail — undo is best-effort
  }
};
```

In the message rendering JSX (after the resolvedAction card block, before `</div>` closing the message), add auto-executed action cards:
```tsx
{msg.autoExecutedActions?.map((action, idx) => (
  <div key={idx} className={`rounded-xl p-3 w-full max-w-[90%] text-xs border ${
    action.status === "success"
      ? "bg-green-50 border-green-200"
      : action.status === "undone"
      ? "bg-gray-50 border-gray-200"
      : "bg-red-50 border-red-200"
  }`}>
    <div className="flex items-center justify-between gap-1.5 mb-1">
      <div className="flex items-center gap-1.5">
        {action.status === "success" ? (
          <Check size={12} className="text-green-600" />
        ) : action.status === "undone" ? (
          <Undo2 size={12} className="text-gray-500" />
        ) : (
          <XCircle size={12} className="text-red-500" />
        )}
        <span className={`font-semibold ${
          action.status === "success" ? "text-green-700" : action.status === "undone" ? "text-gray-700" : "text-red-700"
        }`}>
          {confirmLabel[action.tool] ?? action.tool}
          {action.status === "success" ? " — Auto-applied" : action.status === "undone" ? " — Undone" : " — Failed"}
        </span>
      </div>
      {action.status === "success" && (
        <button
          onClick={() => handleUndo(idx)}
          className="flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 text-xs"
        >
          <Undo2 size={10} /> Undo
        </button>
      )}
    </div>
    <p className="text-gray-600">
      {formatPreview(action.tool, action.result)}
    </p>
  </div>
))}
```

**7. Full chat page — `chat/page.tsx`:**

Apply the same changes to the chat page:
- Import `undoAutoAction` from conversations.ts and `Undo2` from lucide-react
- Add `onAutoExecuted` callback in the `startStream` call (same pattern as AIChatBubble)
- Add `handleUndo` function (same as AIChatBubble but using local state instead of useUIStore)
- Add auto-executed action card rendering in the message list JSX (same markup as AIChatBubble)

Note: The chat page uses local `messages` state + `setMessages` instead of `useUIStore`. Adapt the `onAutoExecuted` callback and `handleUndo` to use the local state pattern from the chat page (look at how `onConfirmation` is handled there for the pattern).
  </action>
  <verify>
    <automated>cd /Users/matthewfaust/CloAgent/Clo-Agent && go build ./backend/... && cd frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Go backend compiles with undo route registered. Frontend TypeScript compiles with no errors. Auto-executed actions render as green/red cards in both AIChatBubble and chat page. Success cards show Undo button that calls the undo endpoint and updates card to "Undone" state.</done>
</task>

</tasks>

<verification>
1. Go backend builds: `cd backend && go build ./cmd/api/`
2. Frontend compiles: `cd frontend && npx tsc --noEmit`
3. Python undo module imports: `PYTHONPATH=ai-service python -c "from app.undo import push_undo, pop_undo, execute_undo; print('OK')"`
4. Grep for integration points: `grep -n "push_undo" ai-service/app/services/agent.py` shows undo push after auto-execute
5. Grep for route: `grep -n "undo" backend/cmd/api/main.go` shows registered route
</verification>

<success_criteria>
- ai-service/app/undo.py exists with UNDO_STACKS dict, push_undo (capped at 10), pop_undo, execute_undo
- agent.py pushes undo entries after successful auto-execute that includes "previous" values
- POST /ai/undo/{conversation_id} endpoint exists in AI service
- Go backend proxies POST /api/ai/conversations/{id}/undo to AI service
- SSEEvent type includes "auto_executed" variant
- useAIStream handles onAutoExecuted callback
- ChatMessage type includes autoExecutedActions array
- Both AIChatBubble and chat page render auto-executed cards with Undo button
- Undo button calls endpoint and updates card status to "undone"
</success_criteria>

<output>
After completion, create `.planning/quick/260325-dfy-server-side-undo-stack-for-auto-executed/260325-dfy-SUMMARY.md`
</output>
