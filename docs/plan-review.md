# CloAgent PLAN.md — CEO Plan Review

**Date:** 2026-03-17
**Branch:** main
**Mode:** SCOPE EXPANSION (Harden then Expand)
**Reviewer:** Claude Opus 4.6

---

## System Audit Findings

- **Backend (Go):** Well-structured. RLS, transaction safety, consistent patterns. But generic error messages (`"database error"`), no structured logging, no request tracing.
- **Frontend (React):** Functional but fragile. 10 of 12 dashboard pages have NO error handling. Only the chat page checks `isError`. All pages have loading skeletons.
- **AI Service (Python):** Tools well-organized (24 total), agent loop is clean with safety limits. But workflow engine has dynamic SQL risk, embeddings service has no error recovery for OpenAI failures.
- **Testing:** Minimal — ~296 lines Go validation tests, ~174 lines Python tool schema tests. Zero integration tests. Zero e2e tests.
- **Ops:** No structured logging, Redis configured but unused, no background job processing, no rate limiting.
- **Security:** CORS wildcard `*`, missing agent_id validation on confirm endpoint, no input length limits on search.

---

## Step 0: Nuclear Scope Challenge

### Premise
PLAN.md was written as a greenfield roadmap. Phases 0–2C are complete. Phase 3 items (notifications, CSV import, LangGraph, proactive AI) are nice-to-haves built on a fragile foundation. The plan needs a Phase -1: **Harden**.

### Dream State Mapping
```
CURRENT STATE                    THIS PLAN (expanded)            12-MONTH IDEAL
─────────────────────────────    ──────────────────────────      ─────────────────────
Full CRM with AI tools,          Phase -1: Harden foundation     AI-native CRM. Agent
workflows, pipeline, chat.       Phase 3: Smart notifications    says "Brief me" and AI
Fragile: no error handling,      Phase 4: AI-native features     runs their day. Real
no tests, SQL injection,         (briefings, predictive          integrations (email,
no logging. Features done,       pipeline, real integrations)    phone, Zillow). Predictive
robustness missing.                                              pipeline. Multi-agent teams.
```

### Mode: EXPANSION with "Harden then Expand"

---

## Section 1: Architecture Review

### System Architecture (Current)
```
                    ┌──────────────────────────────────────────────────┐
                    │                   FRONTEND                       │
                    │        Next.js 14 / App Router / :3000           │
                    │                                                  │
                    │  ┌─────────┐ ┌──────────┐ ┌──────────────────┐  │
                    │  │Dashboard│ │ Pipeline │ │  AI Chat Bubble  │  │
                    │  │Contacts │ │ Kanban   │ │  + Full Page     │  │
                    │  │Tasks    │ │ Deals    │ │  SSE Streaming   │  │
                    │  │Analytics│ │          │ │  Confirmations   │  │
                    │  │Settings │ │          │ │                  │  │
                    │  │Comms    │ │          │ │                  │  │
                    │  │Workflows│ │          │ │                  │  │
                    │  └────┬────┘ └────┬─────┘ └────────┬─────────┘  │
                    │       │           │                 │            │
                    └───────┼───────────┼─────────────────┼────────────┘
                            │           │                 │
                    ┌───────▼───────────▼─────────────────▼────────────┐
                    │              GO BACKEND (:8080)                   │
                    │                                                   │
                    │  Middleware: RequestID → RealIP → Logger          │
                    │  → Recoverer → Compress → CORS → ClerkAuth       │
                    │  → UserSync                                       │
                    │                                                   │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
                    │  │ Handlers │  │   RLS    │  │  AI Proxy    │   │
                    │  │ 14 files │  │BeginWith │  │ Go → Python  │   │
                    │  │          │  │  RLS()   │  │ SSE Passthru │   │
                    │  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
                    │       │             │                │           │
                    └───────┼─────────────┼────────────────┼───────────┘
                            │             │                │
                            ▼             │                ▼
                    ┌───────────────┐     │    ┌────────────────────────┐
                    │  PostgreSQL   │◄────┘    │   AI SERVICE (:8000)   │
                    │  15 + pgvector│          │   FastAPI / Python     │
                    │               │◄─────────│                        │
                    │  12 tables    │          │  ┌─────────┐ ┌──────┐ │
                    │  9 migrations │          │  │ Agent   │ │Tools │ │
                    │  RLS policies │          │  │ Loop    │ │ 24   │ │
                    │  pgvector idx │          │  │ Claude  │ │      │ │
                    │               │          │  └─────────┘ └──────┘ │
                    └───────────────┘          │  ┌─────────┐ ┌──────┐ │
                                              │  │Workflow │ │Embed │ │
                                              │  │ Engine  │ │dings │ │
                                              │  └─────────┘ └──────┘ │
                                              └────────────────────────┘
```

### Architectural Concerns

**1. No error propagation layer (CRITICAL GAP)**
The frontend `apiRequest<T>` throws on non-ok responses, but no page catches those errors. There's no global error boundary, no toast system, no retry mechanism. A network blip crashes the UI silently.

**2. No observability (CRITICAL GAP)**
Zero structured logging in Go handlers. Errors are swallowed with generic messages. No request IDs propagated end-to-end. No metrics. In production, you'd be blind.

**3. Workflow engine is synchronous and fragile**
`workflow_engine.py` runs steps sequentially in the request thread. A `wait` step has no resume mechanism. The engine creates a `workflow_runs` record with status `waiting` but nothing ever polls for it.

**4. AI service is single-process**
psycopg2 (sync) with a thread pool. No connection pooling tuning. Under load, the thread pool could exhaust DB connections.

**5. Coupling: Frontend → Go → Python → DB**
The AI service talks directly to the DB for tools AND accepts proxied requests from Go. This dual data path means RLS is enforced differently (Go uses `BeginWithRLS`, Python sets agent_id manually in each query).

### Scaling Characteristics
- **10x load:** DB connection pools exhaust first. Go is fine (goroutines). Python AI service blocks on thread pool.
- **100x load:** Need connection pooling (PgBouncer), async Python (switch from psycopg2 to asyncpg), and separate read replicas.

### Rollback Posture
- Git revert for code changes (good — migrations are additive)
- DB migrations are forward-only (no down migrations). Rollback = write compensating migration.
- No feature flags exist. Rollback = full redeploy.

---

## Section 2: Error & Rescue Map

### Critical Error Paths

```
METHOD/CODEPATH              | WHAT CAN GO WRONG              | EXCEPTION/ERROR TYPE
-----------------------------|--------------------------------|--------------------
apiRequest (client.ts)       | Network timeout                | TypeError (fetch)
                             | 401 unauthorized               | Error("Unauthorized")
                             | 500 server error               | Error("Internal...")
                             | Response not JSON               | SyntaxError
-----------------------------|--------------------------------|--------------------
run_agent (agent.py)         | Anthropic API timeout          | anthropic.APITimeoutError
                             | Anthropic rate limit            | anthropic.RateLimitError
                             | Anthropic 500                  | anthropic.InternalServerError
                             | Tool execution fails           | Exception (caught)
                             | DB connection fails            | psycopg2.OperationalError
-----------------------------|--------------------------------|--------------------
generate_embedding           | OpenAI API timeout             | openai.APITimeoutError
(embeddings.py)              | OpenAI rate limit              | openai.RateLimitError
                             | No API key                     | RuntimeError
                             | Empty text input               | UNHANDLED ← GAP
-----------------------------|--------------------------------|--------------------
workflow_engine              | Step execution fails           | Exception (caught)
execute_step                 | DB connection fails            | psycopg2.OperationalError
                             | Missing contact_id/deal_id     | Returns "skipped"
                             | Invalid step type              | Returns "skipped"
-----------------------------|--------------------------------|--------------------
BeginWithRLS (rls.go)        | Pool exhausted                 | pgx error
                             | Set config fails               | pgx error (tx rolled back)
-----------------------------|--------------------------------|--------------------
ClerkAuth middleware          | Invalid/expired JWT            | 401 response
(auth.go)                    | Clerk API down                 | 500 (?)  ← GAP
-----------------------------|--------------------------------|--------------------
All Go handlers              | DB query error                 | respondError(500, "generic")
                             | Row scan error                 | respondError(500, "generic")
                             | JSON decode error              | respondError(400, "invalid...")

EXCEPTION/ERROR              | RESCUED? | RESCUE ACTION            | USER SEES
-----------------------------|----------|--------------------------|------------------
fetch TypeError              | N ← GAP  | —                        | White screen
Error("Unauthorized")        | N ← GAP  | —                        | White screen
Error("Internal...")         | N ← GAP  | —                        | White screen
anthropic.APITimeoutError    | N ← GAP  | —                        | SSE stream dies
anthropic.RateLimitError     | N ← GAP  | —                        | SSE stream dies
openai.APITimeoutError       | N ← GAP  | —                        | Embed silently fails
psycopg2.OperationalError    | Y        | Returns error in result  | "database error"
pgx pool exhausted           | Y        | Returns 500              | "database error"
Clerk API down               | N ← GAP  | —                        | 500 error
```

### CRITICAL GAPS (8 total)
1. **Frontend has no error boundary** — any thrown error = white screen
2. **Frontend ignores useQuery errors** — API failures are invisible
3. **No retry on Anthropic API failures** — agent loop doesn't retry on rate limit
4. **No retry on OpenAI embedding failures** — embeddings silently fail
5. **Empty text to embedding** — no guard against empty string
6. **Clerk API outage** — auth middleware behavior undefined
7. **No circuit breaker on AI service** — Go proxy will keep retrying a dead service
8. **Generic error messages** — frontend can't distinguish 404 from 500

---

## Section 3: Security & Threat Model

| # | Threat | Likelihood | Impact | Mitigated? |
|---|--------|-----------|--------|------------|
| 1 | **Confirm endpoint: agent A confirms agent B's action** | Med | HIGH | NO — pending_id is the only check, no agent_id match |
| 2 | **CORS wildcard allows any origin** | Low (no credentials) | Med | PARTIAL — AllowCredentials:false helps, but should be locked down |
| 3 | **No rate limiting** | Med | HIGH | NO — authenticated user can spam AI calls (expensive!) |
| 4 | **No input length limits on search** | Med | Med | NO — multi-MB query string accepted |
| 5 | **Settings accepts arbitrary JSON** | Med | Med | NO — can bloat DB, no schema validation |
| 6 | **Workflow engine dynamic SQL** | Low | HIGH | PARTIAL — keys are whitelisted in Python; Go version concatenates |
| 7 | **No audit logging** | — | Med | NO — can't trace who did what |
| 8 | **AI service shared secret is static** | Low | HIGH | PARTIAL — not rotatable without restart |
| 9 | **Prompt injection via tool inputs** | Med | Med | NO — user messages go straight to Claude with tool access |
| 10 | **No CSRF protection** | Low | Low | PARTIAL — Bearer tokens help, but no CSRF tokens |

### Priority Fixes
1. **P0:** Fix confirm endpoint to validate agent_id matches pending action
2. **P0:** Add rate limiting (at minimum on AI endpoints — they cost money per call)
3. **P1:** Lock CORS to specific origins via env var
4. **P1:** Add input length limits on all text endpoints
5. **P2:** Schema-validate settings JSON
6. **P2:** Add audit log for write operations

---

## Section 4: Data Flow & Interaction Edge Cases

### AI Chat Data Flow
```
USER INPUT ──▶ FRONTEND ──▶ GO PROXY ──▶ AI SERVICE ──▶ CLAUDE API
    │              │            │              │              │
    ▼              ▼            ▼              ▼              ▼
  [empty?]    [no token?]  [service down?] [DB fail?]    [timeout?]
  [XSS?]     [stale auth?] [timeout?]     [bad tool?]   [rate limit?]
  [too long?] [navigate    [500?]         [OOM?]        [refusal?]
              away?]                                     [bad JSON?]
```

### Interaction Edge Cases

| Interaction | Edge Case | Handled? | How? |
|---|---|---|---|
| AI chat send | Double-click send | NO | No debounce on send button |
| AI chat send | Navigate away mid-stream | PARTIAL | SSE connection drops, message saves |
| AI chat confirm | Confirm after TTL (10min) | YES | Returns "expired" from DB query |
| AI chat confirm | Confirm same action twice | YES | DELETE RETURNING prevents replay |
| Contact create | Duplicate name + email | NO | No uniqueness check |
| Deal drag-drop | Drop while offline | NO | Optimistic update with no rollback |
| Pipeline load | 500+ deals | NO | No virtualization, all rendered |
| Workflow trigger | Workflow triggers itself (loop) | NO | No recursion guard |
| CSV import | 10K rows | N/A | Not built yet |
| Settings save | Concurrent saves from 2 tabs | PARTIAL | Last write wins (COALESCE merge) |

### CRITICAL GAPS
1. **Workflow self-triggering loop** — a `contact_created` workflow that creates a contact would loop forever
2. **No debounce on AI chat send** — double-click sends duplicate messages
3. **No virtualization for large datasets** — pipeline with 500+ deals will freeze

---

## Section 5: Code Quality Review

### Well-Designed Patterns (Keep)
- `rls.go` — Perfect single-responsibility module (28 lines)
- `agent.py` — Clean agentic loop with clear phases
- `client.ts` — Minimal, correct API wrapper

### DRY Violations
1. **Contact context loading** — `_load_contact_context` in `agent.py` duplicates logic from `_get_contact_details` in `tools.py`. Same DB query, different formatting.
2. **Activity creation** — workflow engine creates activities with raw SQL, duplicating logic from `_log_activity` in `tools.py`.
3. **Error response pattern** — Every Go handler repeats the same `respondError(w, http.StatusInternalServerError, "...")` pattern. Could use middleware.

### Over-Engineering: None detected
### Under-Engineering: Significant
1. No input validation in AI tools beyond what Claude sends
2. No pagination on workflow runs or communication threads (fetches all)
3. Frontend pages are 300-600 line monoliths with no component extraction

---

## Section 6: Test Review

### Current Test Coverage
```
NEW UX FLOWS (12 dashboard pages):         TESTED: 0/12
NEW DATA FLOWS (24 AI tools):              TESTED: Schema only (12 tools checked)
NEW CODEPATHS (handlers):                  TESTED: Factory validation only
NEW BACKGROUND JOBS (workflows):           TESTED: 0
NEW INTEGRATIONS (Anthropic, OpenAI):      TESTED: 0
NEW ERROR/RESCUE PATHS:                    TESTED: 0
```

### What Tests Are Needed

| Category | Test | Type | Priority |
|---|---|---|---|
| Backend handlers | Contact CRUD happy path | Integration | P0 |
| Backend handlers | Deal stage change | Integration | P0 |
| Backend handlers | Auth middleware rejection | Unit | P0 |
| AI tools | Read tool execution against test DB | Integration | P1 |
| AI tools | Write tool + confirm flow | Integration | P1 |
| AI agent loop | Mocked Claude response with tools | Unit | P1 |
| Workflow engine | Step execution + failure handling | Unit | P1 |
| Workflow engine | Self-trigger recursion guard | Unit | P1 |
| Frontend | Error boundary catches thrown errors | Unit | P1 |
| Frontend | AI chat send + receive + confirm | E2E | P2 |
| Embeddings | Empty/nil input handling | Unit | P1 |
| Search | Length limits enforced | Unit | P1 |

### The 2am Friday Test
The test that would make me confident shipping at 2am: **A full integration test that creates a contact, creates a deal, logs an activity, sends an AI chat message, confirms a write tool, and verifies all data in the DB.** This doesn't exist.

### The Hostile QA Test
**Send 100 concurrent AI chat messages from the same user, each triggering write tools.** Does the pending_actions table get corrupted? Does the agent loop spin out?

---

## Section 7: Performance Review

### N+1 Queries
- `listAllActivities` with limit 100 (communication page) — no N+1 but fetches ALL then filters client-side. Should filter server-side.
- Contact list loads 200 contacts for the communication page contact map — should be limited.

### Missing Indexes
- `workflow_runs.status` — no index, but queried by status for "waiting" resume
- `activities.type` — no index, filtered in multiple queries

### Slow Paths (estimated p99)
1. **AI chat message** — Claude API call + up to 5 tool rounds: 5-30 seconds
2. **Semantic search** — OpenAI embedding + pgvector cosine: 1-3 seconds
3. **AI profile regeneration** — Full context load + Claude call: 5-15 seconds

### Connection Pool Pressure
- Go: pgxpool (default 4 connections per CPU, usually fine)
- Python: psycopg2 ThreadedConnectionPool — **size not configured, using defaults**. Under load, this will exhaust.

---

## Section 8: Observability & Debuggability

### Current State: BLIND
- No structured logging in Go handlers
- No request IDs propagated to AI service
- No metrics (response times, error rates, tool usage)
- No alerting
- No dashboards

### What's Needed (Day 1)
1. **Structured logging** — JSON logs with request_id, agent_id, endpoint, duration, status
2. **AI tool usage metrics** — which tools are called most, which fail most
3. **Error rate alerting** — if >5% of requests return 5xx
4. **Claude API spend tracking** — tokens used per agent per day
5. **Pending action expiry rate** — are users not confirming? Why?

### Debuggability Score: 2/10
If a bug is reported today, you have: Go's generic error message, Python's logger.error with no context, and nothing in the frontend. You'd need to reproduce the issue, add logging, deploy, and wait.

---

## Section 9: Deployment & Rollout Review

### Migration Safety
- All migrations are additive (CREATE TABLE, ALTER TABLE ADD). No destructive changes.
- No table locks expected.
- `009_workflows.sql` enables RLS — safe, but requires app restart to test.

### Rollback Plan
1. Git revert the commit
2. Redeploy
3. New tables remain (harmless)
4. No data rollback needed (new tables only)

### Deploy-Time Risk
- Old code + new code simultaneously: old code ignores new tables (safe)
- No feature flags = all-or-nothing deploy

### Post-Deploy Checklist
1. Verify all 12 dashboard pages load without error
2. Create a contact, log an activity, verify in DB
3. Send an AI chat message, verify SSE streaming works
4. Confirm a write tool action
5. Check workflow trigger fires on contact creation

---

## Section 10: Long-Term Trajectory

### Technical Debt Introduced
1. **Testing debt (SEVERE):** Near-zero test coverage makes every future change risky
2. **Observability debt:** Can't debug production issues
3. **Frontend architecture debt:** 300-600 line monolith pages will be painful to maintain
4. **AI service sync model:** psycopg2 thread pool will limit scaling

### Path Dependency
- Choosing psycopg2 (sync) over asyncpg makes the AI service harder to scale later
- No background job system means workflows with `wait` steps are dead code
- Frontend monolith pages make component reuse and testing harder

### Reversibility: 3/5
Most decisions are reversible (swap DB driver, extract components, add tests). The main irreversible decision is the RLS-based multi-tenancy pattern, which is good and should stay.

### Platform Potential (EXPANSION)
The AI tool system is the most valuable architecture. It could become a platform:
- Custom tools per agent (power users define their own)
- Tool marketplace (shared tools across agents)
- Tool analytics (which tools drive the most deal closures)

---

## Required Outputs

### "NOT in scope" section
| Item | Rationale |
|---|---|
| Mobile app | Different platform, different codebase — Phase 2 of expansion |
| Real email/phone integration (Twilio, SendGrid) | Requires third-party contracts, billing — defer to after hardening |
| Multi-agent team collaboration | Requires auth model changes, shared RLS — major architecture work |
| LangGraph multi-agent workflows | Dependency too heavy for current state — simplify first |

### "What already exists" section
| Sub-problem | Existing Code | Reuse? |
|---|---|---|
| Error display | `respondError` in Go, `throw` in client.ts | Yes — add error codes, add frontend handling |
| Logging | Chi's built-in logger middleware | Yes — enhance with structured JSON |
| Background jobs | Redis configured in docker-compose | Yes — wire up for workflow wait steps |
| Rate limiting | Chi middleware ecosystem | Yes — `go-chi/httprate` |
| Test infrastructure | Go test runner, pytest | Yes — add integration tests |

### "Dream state delta" section
This plan (hardened + expanded) gets us to: **a robust, tested, observable CRM with AI-native features** — roughly 60% of the 12-month ideal. The remaining 40% is: real integrations, mobile, multi-agent teams, and predictive pipeline.

---

### Error & Rescue Registry
See Section 2 above. **8 CRITICAL GAPS** identified.

### Failure Modes Registry
```
CODEPATH              | FAILURE MODE           | RESCUED? | TEST? | USER SEES?   | LOGGED?
----------------------|------------------------|----------|-------|--------------|--------
Frontend API call     | Network error          | N        | N     | White screen | N      ← CRITICAL
Frontend API call     | 401 expired token      | N        | N     | White screen | N      ← CRITICAL
AI chat send          | Anthropic rate limit   | N        | N     | Stream dies  | N      ← CRITICAL
AI chat send          | Anthropic timeout      | N        | N     | Stream dies  | N      ← CRITICAL
Embedding generation  | OpenAI rate limit      | N        | N     | Silent fail  | N      ← CRITICAL
Embedding generation  | Empty text             | N        | N     | Silent fail  | N      ← CRITICAL
Workflow step         | Step execution error   | Y        | N     | Not visible  | Y
Workflow trigger      | Self-referencing loop  | N        | N     | Infinite loop| Y      ← CRITICAL
Confirm endpoint      | Agent mismatch         | N        | N     | Wrong agent  | N      ← CRITICAL
Go handler            | DB error               | Y        | N     | "database err"| N
```
**8 CRITICAL GAPS** where RESCUED=N, TEST=N, USER SEES=Silent/Crash.

---

## TODOS.md Updates

### 1. Fix confirm endpoint agent_id validation

**What:** Validate that the agent confirming a pending action is the same agent who created it.

**Why:** Currently any authenticated agent can confirm any other agent's pending action if they have the pending_id. This is a privilege escalation vulnerability.

**Context:** In `ai-service/app/tools.py` `execute_write_tool()`, the DELETE query only checks `id` and `expires_at`, not `agent_id`. Fix: add `AND agent_id = %s` to the query. Also update `routes/chat.py` confirm endpoint to pass `agent_id` through.

**Effort:** S
**Priority:** P0
**Depends on:** None

### 2. Add rate limiting to AI endpoints

**What:** Add per-agent rate limiting on `/api/ai/conversations/{id}/messages` and `/api/search` endpoints.

**Why:** Each AI chat message costs money (Anthropic API call). Each search costs money (OpenAI embedding). Without rate limiting, a malicious or buggy client can run up a massive bill.

**Context:** Use `go-chi/httprate` middleware. Suggested limits: 30 AI messages/minute/agent, 60 searches/minute/agent. Apply to the AI proxy route group in `cmd/api/main.go`.

**Effort:** S
**Priority:** P0
**Depends on:** None

### 3. Add React error boundary to dashboard

**What:** Create an ErrorBoundary component that catches React errors and shows a recovery UI instead of a white screen.

**Why:** Any JavaScript error in any dashboard page currently kills the entire UI with no recovery. The user has to manually refresh.

**Context:** Create `components/shared/ErrorBoundary.tsx` (class component required for `componentDidCatch`). Wrap in `dashboard/layout.tsx`. Show "Something went wrong" with a "Reload" button. Also add `isError` handling to all useQuery calls — display an error message with a retry button.

**Effort:** M
**Priority:** P0
**Depends on:** None

### 4. Add structured error codes to Go backend

**What:** Replace generic error messages with structured error codes in all Go handler responses.

**Why:** Frontend can't distinguish 404 from 500 from timeout. Makes debugging impossible and prevents smart retry logic.

**Context:** Already in TODOS.md. Pattern: `{"error": "message", "code": "ERR_NOT_FOUND"}`. ~14 handler files to update. Start with contacts and deals handlers.

**Effort:** M
**Priority:** P1
**Depends on:** None

### 5. Add structured logging to Go backend

**What:** Replace Chi's default logger with structured JSON logging (zerolog or slog).

**Why:** Currently no way to search, filter, or alert on log data. Generic text logs are useless at scale.

**Context:** Go 1.24 has `log/slog` built-in. Add request_id, agent_id, endpoint, duration, status to every log line. Propagate request_id to AI service via header.

**Effort:** M
**Priority:** P1
**Depends on:** None

### 6. Add workflow recursion guard

**What:** Prevent workflows from triggering themselves (infinite loop).

**Why:** A `contact_created` workflow that calls `create_contact` would loop forever, creating infinite contacts and burning resources.

**Context:** In `workflow_engine.py` `trigger_workflows()`, add a `triggered_by_workflow` flag to trigger_data. If present, skip triggering. Alternatively, maintain a set of in-flight workflow IDs and check before triggering.

**Effort:** S
**Priority:** P1
**Depends on:** None

### 7. Lock CORS to specific origins

**What:** Replace `AllowedOrigins: []string{"*"}` with env-var-driven origin list.

**Why:** Any website can currently make API requests to the backend. While credentials aren't leaked (AllowCredentials: false), this is still too permissive.

**Context:** In `middleware/cors.go`, read `ALLOWED_ORIGINS` env var (comma-separated), fall back to `*` in development. Production deploy must set this.

**Effort:** S
**Priority:** P1
**Depends on:** None

### 8. Add integration tests for core CRUD flows

**What:** Write integration tests that hit a real test database for contacts, deals, activities, and AI tools.

**Why:** Current tests only validate handler factories and tool schemas. No test verifies that data actually flows through the system correctly.

**Context:** For Go: use `pgxpool` with a test database, run migrations, test handler responses. For Python: use a test database with fixtures. Target: contact CRUD, deal CRUD, activity creation, AI tool read execution.

**Effort:** L
**Priority:** P1
**Depends on:** None

### 9. Add input length limits on all text endpoints

**What:** Enforce maximum length on query strings, request bodies, and text fields across all endpoints.

**Why:** Without limits, a client can send multi-MB payloads causing memory exhaustion or slow queries.

**Context:** Search endpoint accepts unlimited query length. Settings endpoint accepts unlimited JSON. Add: max 500 chars for search query, max 10KB for settings body, max 5000 chars for activity body, max 1000 chars for contact fields.

**Effort:** S
**Priority:** P1
**Depends on:** None

### 10. Morning briefing AI command

**What:** Add a "Brief me" command to AI chat that summarizes: overdue tasks, stale contacts (no activity 7+ days), deals at risk (same stage 14+ days), yesterday's activities.

**Why:** This is the #1 AI-native feature. Instead of clicking through dashboards, the agent starts their day with one message and gets an actionable summary.

**Context:** No new backend needed — uses existing tools: `get_overdue_tasks`, `get_dashboard_summary`, `search_contacts`. Add a special system prompt instruction that recognizes "brief me" / "morning briefing" and chains these tool calls. Requires updating `agent.py` system prompt.

**Effort:** S
**Priority:** P2
**Depends on:** Error handling (P0-P1 items)

### 11. Deal health scores (heuristic version)

**What:** Show a colored health indicator (green/yellow/red) on each deal card in the pipeline, based on: days in current stage, days since last activity, buyer profile completeness.

**Why:** Agents can instantly see which deals need attention without clicking into each one. Visual triage.

**Context:** Already in TODOS.md as vision item. Start with heuristic: green (active recently, <7 days in stage), yellow (7-14 days), red (>14 days or no activity in 14+ days). Compute in the deal list query (add `last_activity_at` and `stage_entered_at` to deals response). Frontend renders colored dot on pipeline cards.

**Effort:** M
**Priority:** P2
**Depends on:** None

### 12. Cmd+K command palette

**What:** Spotlight-style command palette for navigation + search + quick actions.

**Why:** Power users navigate faster. Combines 3 separate UIs (nav, search, create) into one.

**Context:** Already in TODOS.md. Modal overlay with text input, debounced semantic search, categorized results (Actions, Contacts, Deals). Keyboard navigation. Reference: Linear, Raycast.

**Effort:** M
**Priority:** P3
**Depends on:** Semantic search (already built)

---

## Delight Opportunities (EXPANSION mode)

### 1. "Brief me" morning command (see TODO #10 above)
### 2. Contact card hover preview
Hovering any contact name (in pipeline, activities, chat mentions) shows a mini card: name, phone, last activity, deal stage. 30 minutes of work. Users would love the instant context without navigating away.

### 3. Pipeline value animation
When a deal is dragged between stages, the column header totals animate (count up/down). Subtle, satisfying, signals the system responded. 20 minutes with CSS transitions.

### 4. Activity streak indicator
Show a "🔥 5-day streak" badge on contacts with consecutive daily activities. Gamifies consistent follow-up. Simple frontend computation from existing data. 15 minutes.

### 5. Smart date parsing in AI chat
"Follow up with Sarah next Tuesday" → AI auto-resolves the date, creates the task. Already partially implemented (system prompt has date awareness). Just needs a test and a prompt tweak to ensure confidence.

---

## Diagrams

### 1. System Architecture — See Section 1 above
### 2. AI Chat Data Flow — See Section 4 above

### 3. Pending Action State Machine
```
                    ┌──────────┐
   queue_write_tool │          │
   ─────────────────▶  PENDING │
                    │          │
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │CONFIRMED│ │EXPIRED │ │CANCELLED│
         │(execute)│ │(10min) │ │(user)   │
         └────────┘ └────────┘ └────────┘
```

### 4. Error Flow (Current — Broken)
```
  API ERROR ──▶ fetch throws ──▶ useQuery catches ──▶ sets isError=true ──▶ NOBODY READS IT
                                                                                │
                                                                                ▼
                                                                         WHITE SCREEN
```

### 5. Error Flow (Target — Fixed)
```
  API ERROR ──▶ fetch throws ──▶ useQuery catches ──▶ isError=true ──▶ ERROR UI RENDERS
                                                           │              │
                                                           ▼              ▼
                                                    ErrorBoundary    "Retry" button
                                                    catches React    re-fetches
                                                    render errors
```

---

## Stale Diagram Audit
No ASCII diagrams exist in any application code files. CLAUDE.md has an architecture diagram that is accurate.

---

## Completion Summary

```
+====================================================================+
|            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
+====================================================================+
| Mode selected        | EXPANSION (Harden then Expand)              |
| System Audit         | Functional but fragile. 0 tests, 0 logging |
| Step 0               | Expand: harden foundation, then AI-native   |
| Section 1  (Arch)    | 5 issues: no observability, no error layer  |
| Section 2  (Errors)  | 10 error paths mapped, 8 CRITICAL GAPS      |
| Section 3  (Security)| 10 issues found, 3 High severity            |
| Section 4  (Data/UX) | 10 edge cases mapped, 6 unhandled           |
| Section 5  (Quality) | 3 DRY violations, significant under-eng     |
| Section 6  (Tests)   | Diagram produced, 12 test gaps              |
| Section 7  (Perf)    | 3 issues: no pagination, no pool config     |
| Section 8  (Observ)  | Score 2/10, everything missing              |
| Section 9  (Deploy)  | Migrations safe, no feature flags           |
| Section 10 (Future)  | Reversibility: 3/5, debt items: 4 categories|
+--------------------------------------------------------------------+
| NOT in scope         | written (4 items)                           |
| What already exists  | written (5 reusable items)                  |
| Dream state delta    | 60% of 12-month ideal after plan            |
| Error/rescue registry| 10 methods, 8 CRITICAL GAPS                 |
| Failure modes        | 10 total, 8 CRITICAL GAPS                   |
| TODOS.md updates     | 12 items proposed                           |
| Delight opportunities| 5 identified                                |
| Diagrams produced    | 5 (arch, data flow, state machine, error x2)|
| Stale diagrams found | 0                                           |
| Unresolved decisions | 0 (all auto-decided per user instruction)   |
+====================================================================+
```

### Recommended Execution Order

**Phase -1: Harden (do first)**
1. P0: Fix confirm endpoint agent_id validation
2. P0: Add rate limiting to AI endpoints
3. P0: Add React error boundary + useQuery error handling
4. P1: Structured error codes in Go
5. P1: Structured logging (slog)
6. P1: Workflow recursion guard
7. P1: Lock CORS origins
8. P1: Input length limits
9. P1: Integration tests for core CRUD

**Phase 3+: Expand (do after hardening)**
10. P2: Morning briefing AI command
11. P2: Deal health scores
12. P3: Cmd+K command palette
13. Delight items as time permits
