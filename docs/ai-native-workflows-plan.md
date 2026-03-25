# Plan: AI-Native Workflows — Eng Review Revision

## Context

CloAgent's workflow system is storage-complete but execution-incomplete: CRUD works, triggers fire, but `ai_message` steps don't call Claude and `wait` steps hang forever. Zero users = zero migration risk. This plan replaces the hardcoded workflow engine with an AI-native execution model where workflows are saved natural language instructions executed by the existing 34-tool AI agent.

**Core architectural bet:** Workflows = saved AI instructions. The `instruction` field IS the workflow. At runtime, a focused AI agent session interprets the instruction and executes it using all available tools.

**Determinism model:** Some actions are deterministic (move deal from "New Lead" to "Closed") — the AI always produces the same tool call. Others are non-deterministic by design (draft personalized email) — the AI generates unique content per context. This is expected behavior, not a bug.

**Source plan:** `/Users/matthewfaust/.claude/plans/expressive-hopping-nebula.md` (CEO-reviewed, scope-expanded). This file incorporates all eng review decisions.

## Scope (15 features, full plan accepted)

### Core
1. Natural language workflow creation via inline AI chat
2. AI-powered refinement (AI asks clarifying Qs, presents plan, confirms)
3. AI-native execution — each run spawns focused agent session (MAX_TOOL_ROUNDS = 8)
4. Workflow CRUD overhaul (kill old form-based step builder)

### From Original Plan
5. Scheduled triggers — structured JSON: `{frequency, day, time, timezone}`
6. Conversational editing — "make the email more casual" via AI chat scoped to workflow
7. Dry run / preview — see what a workflow would do without executing
8. Approval modes — "review" (default): write tools queue confirmation. "auto": immediate except deletes
9. Run notifications + activity feed — workflow actions tagged in contact timeline
10. Visual step timeline — compact vertical step visualization

### From CEO Review Expansions
11. Save as Workflow from any AI conversation
12. ~~Conversational error recovery~~ — **DEFERRED** (eng review Issue 6). Manual runs fail cleanly.
13. Workflow execution live status — compact status indicator showing what AI is doing
14. AI workflow-aware — workflow list in system prompt context
15. Workflow analytics — success rates, execution times

### NOT in scope
- Batch execution, cross-workflow triggers, marketplace/sharing
- External API integrations, conditional branching UI
- Workflow versioning / rollback, webhook triggers
- Proactive workflow suggestions
- Robust job scheduler (APScheduler) — in-process scheduler for v1
- Error recovery state machine (deferred — manual runs fail cleanly, user re-triggers)
- Full-page workflow dashboard overhaul (compact UI instead)

## Architecture Decisions (from Eng Review)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Real conversation per workflow run | Reuse `run_agent()`, add `type='workflow_run'` to conversations table. Browsable run history. Minimal code duplication. |
| 2 | Parameterize `run_agent()` with `approval_mode` | Auto mode: write tools execute inline (except deletes). One agent loop, ~15 lines changed in dispatch block. |
| 3 | Allow all read tools in dry run | Gmail reads don't mutate. Document quota cost. Write tools return preview objects. |
| 4 | Activity log entry for failed scheduled runs | Surfaces in dashboard, morning briefing, contact timeline. Zero new infrastructure. |
| 5 | `asyncio.Semaphore(3)` + dedup query | Bounds concurrent workflow tasks. Dedup query: LEFT JOIN active runs to skip if previous still running. |
| 6 | Error recovery DEFERRED | Manual runs fail cleanly with error details. User re-triggers. Removes hardest state machine. |
| 7 | Extract `dispatch_tool()` from `run_agent()` | Clean tool routing with mode params (approval_mode, is_dry_run). Prep refactor before workflow work. |
| 8 | Extract `useSSEStream` hook as isolated commit | Verify chat still works, then build workflow components on top. |
| 9 | Composable prompt block functions | Split `_build_system_prompt()` into `_contact_resolution_block()`, `_briefing_block()`, `_workflow_creation_block()`, etc. |
| 10 | Single admin query for scheduler (no RLS) | Scheduler is a system process. One query for all agents, filter in Python. |
| 11 | Per-agent monthly run limit (100/month) | Prevents runaway API costs. Simple COUNT query before execution. |
| 12 | Full test suite — Python + Go + Vitest | Tests for all 3 services. Vitest setup for frontend. |

## Database Changes

### Migration: `018_workflow_v2.sql`

```sql
-- Evolve workflows table for AI-native execution
ALTER TABLE workflows ADD COLUMN instruction TEXT;
ALTER TABLE workflows ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'review';
ALTER TABLE workflows ADD COLUMN schedule_config JSONB;

-- Evolve workflow_runs for new features
ALTER TABLE workflow_runs ADD COLUMN is_dry_run BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE workflow_runs ADD COLUMN instruction_snapshot TEXT;
ALTER TABLE workflow_runs ADD COLUMN error_details JSONB;

-- Conversation type for filtering workflow runs from chat sidebar
ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT 'chat';

-- Index for scheduler admin query
CREATE INDEX idx_workflows_schedule ON workflows (enabled) WHERE schedule_config IS NOT NULL;
```

## Files to Modify

### Phase A: Prep Refactors (do first — stabilize before adding features)
1. **`ai-service/app/services/agent.py`** — Extract `dispatch_tool()` function from `run_agent()` tool dispatch block (lines 364-415). Parameterize with `approval_mode=None`, `is_dry_run=False`. Split `_build_system_prompt()` into composable block functions.
2. **`frontend/src/components/shared/AIChatBubble.tsx`** — Extract SSE parsing (lines 200-280) into `useSSEStream` hook in `frontend/src/hooks/useSSEStream.ts` (NEW). Verify chat works identically.
3. **`frontend/vitest.config.ts`** (NEW) — Set up Vitest for frontend testing.

### Phase B: Backend + AI Service
4. **`backend/migrations/018_workflow_v2.sql`** (NEW) — Migration above.
5. **`backend/internal/handlers/workflows.go`** — Add `instruction`, `approval_mode`, `schedule_config` fields to Workflow struct and CRUD handlers.
6. **`backend/internal/handlers/workflow_execution.go`** (NEW) — `RunWorkflow`, `DryRunWorkflow` handlers. Proxy to AI service.
7. **`backend/cmd/api/main.go`** — Register: `POST /workflows/{id}/run`, `POST /workflows/{id}/dry-run`.
8. **`ai-service/app/services/workflow_executor.py`** (NEW) — Spawn agent sessions. Create conversation with `type='workflow_run'`. Call `run_agent()` with workflow system prompt + approval_mode + is_dry_run. Handle errors (retry 1x on timeout, fail cleanly otherwise).
9. **`ai-service/app/services/workflow_scheduler.py`** (NEW) — Asyncio background task. Poll every 60s. `asyncio.Semaphore(3)`. Single admin query + Python-side schedule matching. Dedup via LEFT JOIN active runs. On failure: log activity entry.
10. **`ai-service/app/tools.py`** — Add `save_workflow`, `update_workflow`, `save_conversation_as_workflow` write tools. Extend TOOL_DEFINITIONS and WRITE_TOOLS set. Add unknown-tool guard in dispatch.
11. **`ai-service/app/routes/workflows.py`** — Add `POST /ai/workflows/execute`, `POST /ai/workflows/dry-run` endpoints.
12. **`ai-service/app/main.py`** — Start scheduler background task on startup. Health check endpoint.

### Phase C: Frontend (after backend is stable)
13. **`frontend/src/app/dashboard/workflows/page.tsx`** — Workflow list with create/run/dry-run controls. Compact status indicator (not full split-pane overhaul). Small inline section showing what AI is doing during execution (e.g., "Writing welcome email..." / "Moving deal to Touring stage...").
14. **`frontend/src/lib/api/workflows.ts`** — Add `runWorkflow()`, `dryRunWorkflow()` API functions.
15. **`frontend/src/components/shared/WorkflowChat.tsx`** (NEW) — Inline chat for workflow creation/editing. Uses `useSSEStream` hook.
16. **`frontend/src/components/shared/WorkflowStatus.tsx`** (NEW) — Compact execution status component. Shows current step, tool being called, progress. Replaces the originally-planned WorkflowTimeline + WorkflowLiveFeed + analytics panel with one focused component.
17. **`frontend/src/components/shared/AIChatBubble.tsx`** — Add "Save as Workflow" button.

### Phase D: Tests
18. **`ai-service/tests/test_dispatch.py`** (NEW) — dispatch_tool() routing: 6 cases (review, auto, auto+delete, dry_run+write, dry_run+read, chat mode).
19. **`ai-service/tests/test_scheduler.py`** (NEW) — Scheduler dedup, semaphore bounds, schedule matching, failure notification.
20. **`ai-service/tests/test_workflow_executor.py`** (NEW) — Execution happy path, timeout retry, empty response, refusal, MAX_ROUNDS exceeded.
21. **`ai-service/tests/test_tools.py`** — Extend for 3 new tools (save_workflow, update_workflow, save_conversation_as_workflow).
22. **`backend/internal/handlers/workflows_test.go`** — New field validation, run/dry-run proxy handlers.
23. **`frontend/src/hooks/__tests__/useSSEStream.test.ts`** (NEW) — Parse text chunks, tool_call events, [DONE], connection error.
24. **`frontend/src/components/shared/__tests__/WorkflowChat.test.tsx`** (NEW) — Creation flow, editing flow.
25. **`frontend/src/components/shared/__tests__/WorkflowStatus.test.tsx`** (NEW) — Status rendering, step progression.

### Delete
26. **`ai-service/app/services/workflow_engine.py`** — Old hardcoded engine. Verify no imports reference it first.

## Reusable Existing Code

| What | Where | Reused how |
|------|-------|------------|
| Agent loop | `agent.py:run_agent()` line 297 | Pass workflow system prompt, approval_mode, is_dry_run |
| Read tool execution | `tools.py:execute_read_tool()` line 571 | As-is |
| Write tool confirmation | `tools.py:queue_write_tool()` line 930 | As-is for review mode; bypass for auto (except deletes) |
| SSE streaming | `AIChatBubble.tsx` → extracted `useSSEStream` hook | Shared between chat + WorkflowChat + WorkflowStatus |
| Workflow CRUD | `workflows.go` + `workflows.ts` | Add columns, not rebuild |
| Trigger firing | `tools.py:_schedule_workflow_trigger()` line 900 | Already fires on write tools |
| Recursion guard | `workflow_engine.py:triggered_by_workflow` | Migrate flag to new executor |
| Pending actions | `pending_actions` table + confirm endpoint | Reused for workflow write confirmations |
| RLS pattern | `database.BeginWithRLS()` | Same pattern for user-facing queries |

## Key Implementation Details

### dispatch_tool() (extracted from run_agent)
```python
async def dispatch_tool(tool_name, tool_input, agent_id, approval_mode=None, is_dry_run=False):
    if tool_name in READ_TOOLS:
        return await execute_read_tool(tool_name, tool_input, agent_id)
    elif tool_name in WRITE_TOOLS:
        if is_dry_run:
            return {"preview": True, "tool": tool_name, "would_do": summarize_action(tool_name, tool_input)}
        elif approval_mode == "auto" and tool_name not in ALWAYS_CONFIRM_TOOLS:
            return await execute_write_tool_immediate(tool_name, tool_input, agent_id)
        else:
            return queue_write_tool(tool_name, tool_input, agent_id)
    else:
        logger.warning(f"Unknown tool: {tool_name}")
        return {"error": f"Unknown tool: {tool_name}"}
```

`ALWAYS_CONFIRM_TOOLS = {"delete_contact", "delete_deal", "delete_property"}`

### Scheduler
```python
_semaphore = asyncio.Semaphore(3)

async def scheduler_loop():
    while True:
        try:
            # Single admin query — no RLS
            all_scheduled = query_all_enabled_scheduled_workflows()
            due = [wf for wf in all_scheduled if is_due_now(wf.schedule_config)]
            logger.info(f"Scheduler poll: {len(due)} due workflows")
            for wf in due:
                asyncio.create_task(_run_with_semaphore(wf))
        except Exception as e:
            logger.error(f"Scheduler error: {e}")
        await asyncio.sleep(60)

async def _run_with_semaphore(wf):
    async with _semaphore:
        await execute_workflow(wf)
```

### Prompt Blocks
```python
def build_system_prompt(mode, agent_name, contact_context="", gmail_status=None, workflows=None):
    blocks = [_base_block(agent_name)]
    if mode == "chat":
        blocks += [_contact_resolution_block(), _briefing_block(), _guidelines_block(),
                   _formatting_block(), _document_citation_block()]
        if workflows:
            blocks.append(_workflow_awareness_block(workflows))
    elif mode == "workflow_creation":
        blocks.append(_workflow_creation_block())
    elif mode == "workflow_execution":
        blocks.append(_workflow_execution_block())
    if gmail_status:
        blocks.append(_gmail_block(gmail_status))
    if contact_context:
        blocks.append(contact_context)
    return "\n\n".join(blocks)
```

### Compact Workflow Status UI
Small inline component showing execution progress:
```
┌─────────────────────────────────────┐
│ ▶ Running: "Welcome new leads"      │
│   ✓ Searched contacts               │
│   ✓ Found: Sarah Miller             │
│   ⟳ Drafting welcome email...       │
│   ○ Create follow-up task           │
└─────────────────────────────────────┘
```
Not a full dashboard — just a compact status card that appears when a workflow is running.

## Safety Controls
- Approval mode default: review
- Scheduled max: 20 active per agent, minimum 1-hour interval
- Tool rounds: MAX_TOOL_ROUNDS = 8 for workflows (5 for chat)
- Delete operations: ALWAYS require confirmation regardless of approval_mode
- Instruction max length: 5000 characters
- Scheduler dedup: skip if previous run still active
- Instruction snapshot: frozen at run start
- Per-agent monthly run limit: 100/month default
- Unknown tool guard: skip + log if Claude returns non-existent tool name
- Semaphore(3): bounds concurrent scheduled executions

## Error Handling

| Error | Rescue | User sees |
|-------|--------|-----------|
| Claude API timeout | Retry 1x, then fail run | "Workflow timed out" |
| Claude API rate limit | Exponential backoff (SDK) | Nothing (transparent) |
| Claude empty response | Mark run "failed" | "AI returned no response" |
| Claude refusal | Mark run "failed", log | "AI could not complete: [refusal]" |
| Tool execution failure | Log, mark run "failed" | Error details in run results |
| MAX_TOOL_ROUNDS hit | Stop, report partial | "Workflow stopped: too many steps" |
| Scheduler duplicate | Dedup query, skip | Nothing (transparent) |
| Monthly limit exceeded | Block execution | "Monthly workflow limit reached" |
| Unknown tool from Claude | Skip tool, continue | Warning in run log |
| Scheduled run failure | Activity log entry | Shows in dashboard + briefing |

## Verification Plan

1. **Creation flow**: Workflows page → type "When I get a new lead, send welcome email and create follow-up task" → AI asks clarifying Qs → confirm → verify workflow saved with instruction field
2. **Manual execution**: Click "Run" → select contact → compact status shows progress → check workflow_runs + activities table
3. **Dry run**: Click "Dry Run" → verify preview results → verify ZERO rows inserted in contacts/activities/deals
4. **Scheduled trigger**: Create workflow with "every Monday at 8am" → verify scheduler picks it up → check execution results
5. **Approval modes**: Run with "review" → write tools queue cards. Run with "auto" → immediate execution. "auto" + delete → confirmation required
6. **Conversational editing**: Open workflow → "Edit with AI" → "make the email more casual" → verify instruction updated
7. **Scheduled failure**: Mock tool failure → verify activity log entry created → verify shows in morning briefing
8. **Save as Workflow**: Chat with AI → execute actions → "Save as Workflow" → verify created with summarized instruction
9. **AI awareness**: Open chat → "what workflows do I have?" → verify AI lists workflows
10. **Cost control**: Run 101 workflows in a month → verify 101st is blocked
11. **Delete old engine**: grep for workflow_engine imports → delete → verify all workflows function
12. **dispatch_tool routing**: Run tests for all 6 routing cases
13. **Scheduler dedup**: Start long-running workflow → wait for next poll → verify no duplicate run created
14. **Unknown tool guard**: Verify handler logs warning and skips gracefully

## Chunked Implementation Steps

Each step is self-contained. After completing a step, clear context and say "Continue with Step N" to start the next one. Each step includes everything needed to execute without prior context.

---

### Step 1 of 8: Database Migration + Go Backend
**Goal:** All Go/SQL changes — migration, CRUD updates, new proxy handlers, route registration.

**Files:**
- `backend/migrations/018_workflow_v2.sql` (NEW) — Create migration:
  ```sql
  ALTER TABLE workflows ADD COLUMN instruction TEXT;
  ALTER TABLE workflows ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'review';
  ALTER TABLE workflows ADD COLUMN schedule_config JSONB;
  ALTER TABLE workflow_runs ADD COLUMN is_dry_run BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE workflow_runs ADD COLUMN instruction_snapshot TEXT;
  ALTER TABLE workflow_runs ADD COLUMN error_details JSONB;
  ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT 'chat';
  CREATE INDEX idx_workflows_schedule ON workflows (enabled) WHERE schedule_config IS NOT NULL;
  ```
- `backend/internal/handlers/workflows.go` — Add `Instruction *string`, `ApprovalMode string`, `ScheduleConfig json.RawMessage` to Workflow struct. Add `IsDryRun bool`, `InstructionSnapshot *string`, `ErrorDetails json.RawMessage` to WorkflowRun struct. Update CreateWorkflow/UpdateWorkflow handlers to read/write new fields.
- `backend/internal/handlers/workflow_execution.go` (NEW) — Two handlers:
  - `RunWorkflow(pool)` — `POST /workflows/{id}/run`: Fetch workflow by ID (RLS), proxy to AI service `POST /ai/workflows/execute` with `{workflow_id, agent_id, instruction, approval_mode, trigger_data}`. Stream SSE response back to frontend.
  - `DryRunWorkflow(pool)` — `POST /workflows/{id}/dry-run`: Same but adds `is_dry_run: true` flag.
  - Inter-service auth: `X-AI-Service-Secret` + `X-Agent-ID` headers (same pattern as existing AI proxy in `backend/cmd/api/main.go`).
- `backend/cmd/api/main.go` — Register new routes: `r.Post("/api/workflows/{id}/run", handlers.RunWorkflow(pool))` and `r.Post("/api/workflows/{id}/dry-run", handlers.DryRunWorkflow(pool))`.

**Done when:** Migration applies cleanly. `POST /api/workflows` accepts instruction/approval_mode/schedule_config. New run/dry-run endpoints exist (they'll 502 until the AI service endpoints are built in Step 3).

**Commit message:** `feat(workflows): add v2 migration and Go handlers for AI-native execution`

---

### Step 2 of 8: Python Agent Refactors
**Goal:** Prep refactors to `agent.py` — extract `dispatch_tool()` and decompose system prompt into composable blocks. No new features yet, just restructuring.

**Files:**
- `ai-service/app/services/agent.py` — Two changes:

  **2a. Extract `dispatch_tool()`** from the tool dispatch block in `run_agent()` (currently lines ~364-415). Create a new async function:
  ```python
  ALWAYS_CONFIRM_TOOLS = {"delete_contact", "delete_deal", "delete_property"}

  async def dispatch_tool(tool_name, tool_input, agent_id, approval_mode=None, is_dry_run=False):
      if tool_name in READ_TOOLS:
          return await execute_read_tool(tool_name, tool_input, agent_id)
      elif tool_name in WRITE_TOOLS:
          if is_dry_run:
              return {"preview": True, "tool": tool_name, "would_do": f"Would execute {tool_name} with {tool_input}"}
          elif approval_mode == "auto" and tool_name not in ALWAYS_CONFIRM_TOOLS:
              return await execute_write_tool_immediate(tool_name, tool_input, agent_id)
          else:
              return queue_write_tool(tool_name, tool_input, agent_id)
      else:
          logger.warning(f"Unknown tool requested: {tool_name}")
          return {"error": f"Unknown tool: {tool_name}"}
  ```
  Update `run_agent()` to call `dispatch_tool()` instead of inline if/elif. Add `approval_mode=None`, `is_dry_run=False`, `max_tool_rounds=None` parameters to `run_agent()`. Default max_tool_rounds to `MAX_TOOL_ROUNDS` (5) if not provided.

  **2b. Decompose `_build_system_prompt()`** (currently lines ~143-290) into composable block functions:
  - `_base_block(agent_name)` — agent identity
  - `_contact_resolution_block()` — contact search rules
  - `_guidelines_block()` — action-oriented behavior, date resolution, etc.
  - `_document_citation_block()` — accuracy rules for document search
  - `_formatting_block()` — markdown formatting rules
  - `_briefing_block()` — morning briefing instructions
  - `_gmail_block(gmail_status)` — Gmail connection status
  - `_workflow_creation_block()` — (empty placeholder for Step 5)
  - `_workflow_execution_block()` — (empty placeholder for Step 3)
  - `_workflow_awareness_block(workflows)` — (empty placeholder for Step 5)

  Create `build_system_prompt(mode, agent_name, contact_context="", gmail_status=None, workflows=None)` that composes blocks based on mode ("chat", "workflow_creation", "workflow_execution"). The existing `_build_system_prompt()` becomes `build_system_prompt(mode="chat", ...)`.

**Done when:** Existing AI chat works identically (the refactor is behavior-preserving). `dispatch_tool()` exists as a standalone function. `build_system_prompt()` composes blocks. `run_agent()` accepts `approval_mode`, `is_dry_run`, `max_tool_rounds` params.

**Commit message:** `refactor(agent): extract dispatch_tool() and decompose system prompt into composable blocks`

---

### Step 3 of 8: Workflow Executor + AI Routes
**Goal:** Core execution engine — the heart of the plan. Creates a workflow run, spawns an agent session, handles errors.

**Files:**
- `ai-service/app/services/workflow_executor.py` (NEW) — Core execution:
  ```python
  async def execute_workflow(workflow_id, agent_id, instruction, approval_mode, trigger_data=None, is_dry_run=False):
  ```
  Flow:
  1. Check per-agent monthly run limit (COUNT workflow_runs WHERE agent_id AND started_at > first-of-month, limit 100)
  2. Create a `conversations` row with `type='workflow_run'` and title = workflow name
  3. Create a `workflow_runs` row with `instruction_snapshot=instruction`, `is_dry_run`, status='running'
  4. Build system prompt via `build_system_prompt(mode="workflow_execution", ...)` with workflow instruction + trigger_data as context
  5. Call `run_agent(conversation_id, agent_id, user_message=instruction, approval_mode=approval_mode, is_dry_run=is_dry_run, max_tool_rounds=8)` — this yields SSE events
  6. On success: update workflow_runs status='completed'
  7. On Claude API timeout: retry 1x, then mark 'failed' with error_details
  8. On Claude empty response / refusal: mark 'failed' with details
  9. On any exception: mark 'failed', log error

  Also add `_workflow_execution_block()` content to agent.py placeholder:
  ```
  You are executing an automated workflow for real estate agent {agent_name}.
  INSTRUCTION: {instruction}
  CONTEXT: {trigger_data}
  APPROVAL MODE: {approval_mode}
  Execute the instruction using your available tools. Be thorough.
  If approval_mode is "review", write tools will queue for confirmation.
  Report what you did at the end.
  ```

- `ai-service/app/routes/workflows.py` — Add two endpoints:
  - `POST /ai/workflows/execute` — accepts `{workflow_id, agent_id, instruction, approval_mode, trigger_data}`, calls `execute_workflow()`, streams SSE response
  - `POST /ai/workflows/dry-run` — same but passes `is_dry_run=True`
  - Both require `X-AI-Service-Secret` header (existing `verify_secret` dependency)

**Done when:** `POST /ai/workflows/execute` spawns an agent session that interprets the workflow instruction and calls tools. Workflow runs are tracked in DB. Monthly limit enforced. SSE events stream back.

**Commit message:** `feat(workflows): add AI-native workflow executor and execution routes`

---

### Step 4 of 8: Scheduler + New AI Tools
**Goal:** Background scheduler for scheduled workflows + 3 new AI tools for workflow creation/editing.

**Files:**
- `ai-service/app/services/workflow_scheduler.py` (NEW) — Asyncio background task:
  - `scheduler_loop()`: Poll every 60s. Single admin query (no RLS) for all enabled workflows with `schedule_config IS NOT NULL`. LEFT JOIN on `workflow_runs WHERE status='running'` to skip duplicates. Filter due workflows in Python using `is_due_now(schedule_config)`.
  - Schedule format: `{frequency: "daily"|"weekly"|"biweekly"|"monthly", day: "monday", time: "08:00", timezone: "America/New_York"}`
  - `asyncio.Semaphore(3)` bounds concurrent executions
  - On failure: create activity log entry (type='system_note') for the workflow's agent
  - Safety: max 20 scheduled workflows per agent, minimum 1-hour interval
  - Recursion guard: pass `triggered_by_workflow=True` to prevent cascade (migrate from `workflow_engine.py`)

- `ai-service/app/tools.py` — Add 3 new write tools to TOOL_DEFINITIONS and WRITE_TOOLS:
  - `save_workflow` — Creates workflow with: name, instruction, trigger_type, trigger_config, approval_mode, schedule_config. Validates instruction ≤ 5000 chars.
  - `update_workflow` — Updates workflow fields (instruction, name, trigger_type, etc.)
  - `save_conversation_as_workflow` — Extracts a reusable instruction from the current conversation context. The AI summarizes what it did into a generalizable instruction (not raw transcript). User confirms via standard write-tool confirmation.

- `ai-service/app/services/agent.py` — Fill in prompt block placeholders:
  - `_workflow_creation_block()`: Prompt telling AI to ask about trigger, steps, approval mode, then call `save_workflow` tool.
  - `_workflow_awareness_block(workflows)`: Lists agent's workflows in system prompt so AI can reference them.

- `ai-service/app/main.py` — Start scheduler on startup: `asyncio.create_task(scheduler_loop())` in the lifespan/startup hook. Add `GET /ai/health` endpoint that includes scheduler status.

- `ai-service/app/services/workflow_engine.py` — READ ONLY: Note all imports of the recursion guard flag so it can be migrated. Do NOT delete yet (Step 8).

**Done when:** Scheduler polls and executes due workflows. 3 new tools work in AI chat. AI can create workflows via conversation. `GET /ai/health` shows scheduler status.

**Commit message:** `feat(workflows): add scheduler, AI creation tools, and workflow-aware prompt`

---

### Step 5 of 8: Frontend Prep — SSE Hook + Vitest + API Functions
**Goal:** Extract the SSE streaming hook, set up test framework, add API functions. Prep work before building UI components.

**Files:**
- `frontend/src/hooks/useSSEStream.ts` (NEW) — Extract SSE parsing logic from `AIChatBubble.tsx` (currently around lines 200-280). The hook should handle: text chunk events, tool_call events, tool_result events, confirmation events, error events, [DONE] signal, connection errors. Return `{ messages, isStreaming, error, startStream, stopStream }`.

- `frontend/src/components/shared/AIChatBubble.tsx` — Replace inline SSE parsing with `useSSEStream` hook. **CRITICAL: Verify existing AI chat works identically after this refactor.** This is the single highest regression risk.

- `frontend/src/lib/api/workflows.ts` — Add API functions:
  - `runWorkflow(token, workflowId, triggerData?)` — `POST /api/workflows/{id}/run`, returns SSE stream
  - `dryRunWorkflow(token, workflowId, triggerData?)` — `POST /api/workflows/{id}/dry-run`, returns SSE stream
  - Update existing `createWorkflow()` / `updateWorkflow()` to include new fields (instruction, approval_mode, schedule_config)

- `frontend/vitest.config.ts` (NEW) — Set up Vitest with React Testing Library. Add to `package.json` scripts: `"test": "vitest"`, `"test:run": "vitest run"`. Install deps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.

**Done when:** `useSSEStream` hook works. AIChatBubble uses the hook and chat still works. API functions exist for run/dry-run. Vitest runs with `npm test`.

**Commit message:** `refactor(frontend): extract useSSEStream hook, add workflow API functions, setup Vitest`

---

### Step 6 of 8: Frontend Features — Workflows Page + Components
**Goal:** Build the UI — workflows page, creation chat, compact execution status, Save as Workflow button.

**Files:**
- `frontend/src/app/dashboard/workflows/page.tsx` — Overhaul (but compact, not full dashboard):
  - Workflow list with name, trigger type, status badge, last run time
  - "Create Workflow" button → opens inline WorkflowChat
  - Per-workflow: "Run", "Dry Run", "Edit with AI" buttons
  - When a run is active: show WorkflowStatus component inline
  - Basic stats: total runs, success rate (computed from workflow_runs)
  - Error handling: `isError` check on all useQuery hooks with retry UI

- `frontend/src/components/shared/WorkflowChat.tsx` (NEW) — Inline chat for workflow creation/editing:
  - Uses `useSSEStream` hook
  - For creation: user types instruction → AI asks clarifying Qs → AI calls `save_workflow` tool → confirmation → done
  - For editing: scoped to existing workflow → user says "make the email more casual" → AI calls `update_workflow`
  - Compact chat panel (not full-page), can be opened/closed

- `frontend/src/components/shared/WorkflowStatus.tsx` (NEW) — Compact execution status:
  ```
  ┌─────────────────────────────────────┐
  │ ▶ Running: "Welcome new leads"      │
  │   ✓ Searched contacts               │
  │   ✓ Found: Sarah Miller             │
  │   ⟳ Drafting welcome email...       │
  │   ○ Create follow-up task           │
  └─────────────────────────────────────┘
  ```
  - Listens to SSE tool_call/tool_result events via `useSSEStream`
  - Shows step-by-step progress: pending (○), running (⟳), done (✓), failed (✗)
  - Shows final result or error message when complete

- `frontend/src/components/shared/AIChatBubble.tsx` — Add "Save as Workflow" button:
  - Appears after AI has executed at least one write tool in a conversation
  - Clicking sends a message to AI asking it to call `save_conversation_as_workflow` tool
  - User confirms via standard confirmation card

**Done when:** Workflows page shows list with create/run/dry-run controls. WorkflowChat creates workflows via AI conversation. WorkflowStatus shows compact execution progress. Save as Workflow button works in AI chat.

**Commit message:** `feat(frontend): workflow page overhaul with creation chat, execution status, and save-as-workflow`

---

### Step 7 of 8: Full Test Suite
**Goal:** Tests across all 3 services covering the key code paths.

**Files:**
- `ai-service/tests/test_dispatch.py` (NEW) — 6 test cases for `dispatch_tool()`:
  1. Read tool → `execute_read_tool()` called
  2. Write tool, approval_mode=None → `queue_write_tool()` called (default behavior)
  3. Write tool, approval_mode='auto' → executes immediately
  4. Write tool, approval_mode='auto', tool=delete_contact → still queues confirmation
  5. Write tool, is_dry_run=True → returns preview object
  6. Unknown tool name → returns error, logs warning

- `ai-service/tests/test_scheduler.py` (NEW) — Scheduler logic:
  - `is_due_now()` with various schedule_config + timezone combos
  - Dedup: mock active run exists → workflow skipped
  - Semaphore: verify max 3 concurrent
  - Failure notification: verify activity log entry created

- `ai-service/tests/test_workflow_executor.py` (NEW) — Executor:
  - Happy path: workflow runs to completion
  - Claude timeout: retry 1x then fail
  - Claude empty response: mark failed
  - Monthly limit: 101st run blocked
  - Conversation created with type='workflow_run'

- `ai-service/tests/test_tools.py` — Extend:
  - `save_workflow` in TOOL_DEFINITIONS and WRITE_TOOLS
  - `update_workflow` in TOOL_DEFINITIONS and WRITE_TOOLS
  - `save_conversation_as_workflow` in TOOL_DEFINITIONS and WRITE_TOOLS
  - Instruction validation (>5000 chars rejected)

- `backend/internal/handlers/workflows_test.go` — Go tests:
  - CreateWorkflow with instruction/approval_mode/schedule_config
  - UpdateWorkflow with new fields
  - RunWorkflow handler exists and routes correctly
  - DryRunWorkflow handler exists

- `frontend/src/hooks/__tests__/useSSEStream.test.ts` (NEW) — Hook tests:
  - Parses text chunk events
  - Parses tool_call events
  - Handles [DONE] signal
  - Handles connection error

- `frontend/src/components/shared/__tests__/WorkflowChat.test.tsx` (NEW)
- `frontend/src/components/shared/__tests__/WorkflowStatus.test.tsx` (NEW)

**Done when:** `cd ai-service && python -m pytest tests/` passes. `cd backend && go test ./internal/handlers/...` passes. `cd frontend && npx vitest run` passes.

**Commit message:** `test(workflows): full test suite across Python, Go, and frontend`

---

### Step 8 of 8: Cleanup + Integration Verification
**Goal:** Delete old workflow engine, update TODOS.md, verify everything works end-to-end.

**Tasks:**
1. **Delete old engine:** `grep -r "workflow_engine" ai-service/` to find all imports. Update any references to use new executor. Then delete `ai-service/app/services/workflow_engine.py`. Update `ai-service/app/tools.py` trigger scheduling to use new executor's recursion guard.

2. **Update TODOS.md** — Add 3 new items:
   - Error recovery state machine (P2, deferred from this plan)
   - Robust job scheduler / APScheduler (P3, replaces in-process scheduler)
   - Prompt eval suite for workflow AI quality (P2)
   - Move "React error boundaries" and "Deal health scores" to Completed if already done by AI Coach Bundle

3. **Integration verification** (manual):
   - Create a workflow via AI chat
   - Run it manually, verify execution + status
   - Dry run, verify zero mutations
   - Test approval modes (review vs auto vs auto+delete)
   - Verify scheduler picks up a scheduled workflow
   - Save as Workflow from existing chat
   - Verify all existing AI chat features still work (regression check)

**Done when:** No references to `workflow_engine.py` remain. TODOS.md updated. All verification items pass.

**Commit message:** `chore(workflows): delete old engine, update TODOs, verify integration`

## Completion Summary

```
+====================================================================+
|            ENG REVIEW — COMPLETION SUMMARY                          |
+====================================================================+
| Step 0: Scope Challenge     | Full plan accepted (user chose B)     |
| Architecture Review         | 6 issues found, 6 decided             |
| Code Quality Review         | 3 issues found, 3 decided             |
| Test Review                 | Diagram produced, 48 gaps (0% covered)|
| Performance Review          | 2 issues found, 2 decided             |
| NOT in scope                | written (9 items)                      |
| What already exists         | written (9 reuse points)               |
| TODOS.md updates            | 3 items proposed, 3 accepted           |
| Failure modes               | 1 critical gap (unknown tool guard)    |
| Outside voice               | ran (Claude subagent), 9 findings      |
| Lake Score                  | 11/12 chose complete option             |
| Unresolved decisions        | 0                                      |
+====================================================================+
```

Key changes from source plan:
- Error recovery DEFERRED (Issue 6)
- Migration number 016→018 (conflict fix)
- Frontend simplified: compact status component replaces 5-feature overhaul
- dispatch_tool() extracted as prep refactor
- Prompt blocks decomposed
- Semaphore + dedup for scheduler concurrency
- Per-agent monthly run limit added
- Unknown tool guard added
- Full test suite across all 3 services
- Implementation phased: A (refactors) → B (backend) → C (frontend) → D (tests) → E (cleanup)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 6 proposals, 5 accepted, 1 deferred |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 10 findings (claude subagent) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR (PLAN) | 12 issues, 1 critical gap (fixed) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

- **OUTSIDE VOICE:** Claude subagent challenged non-determinism, Haiku capability, scheduler fragility, frontend scope. Non-determinism addressed (deterministic vs non-deterministic actions distinguished). Frontend scope reduced per user input. Others accepted as architectural bets.
- **UNRESOLVED:** 0 decisions across all reviews
- **VERDICT:** CEO + ENG CLEARED — eng review fresh, all decisions resolved
