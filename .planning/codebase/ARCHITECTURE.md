# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Three-tier microservices with frontend → backend gateway → AI service proxy, all backed by PostgreSQL 15 with row-level security (RLS) for multi-tenant data isolation.

**Key Characteristics:**
- Frontend is single entry point; never communicates directly with AI service
- Backend proxies all AI requests to Python service using shared secret (`X-AI-Service-Secret` header)
- Row-level security policies enforce agent-scoped data access at database layer
- Agentic loop with tool-calling (max 5 rounds per message) returns confirmation requests before executing write tools
- Async background workers handle email syncing and workflow triggers

## Layers

**Frontend Layer (Next.js 14 App Router):**
- Purpose: UI rendering, form handling, data display, authentication via Clerk
- Location: `frontend/src/app/` (page routes), `frontend/src/components/` (UI components), `frontend/src/lib/api/` (API client modules)
- Contains: React pages, components, API client functions, Zustand store for UI state
- Depends on: Backend (`/api/*` endpoints), Clerk SDK for authentication
- Used by: User browsers

**Backend API Layer (Go + Chi v5):**
- Purpose: Request routing, authentication/authorization, data persistence, request validation, email/Gmail integration
- Location: `backend/cmd/api/main.go` (entry), `backend/internal/handlers/` (14+ handler files), `backend/internal/middleware/` (auth, user sync, CORS)
- Contains: HTTP handlers (factory functions), middleware stack, database transactions with RLS
- Depends on: PostgreSQL connection pool, Clerk SDK for token validation, AI service for agentic requests
- Used by: Frontend (HTTP requests), AI service (service-to-service with shared secret)

**AI Service Layer (FastAPI + Python):**
- Purpose: Claude API integration, agentic loop, tool execution, semantic search, document processing, email operations
- Location: `ai-service/app/main.py` (entry), `ai-service/app/routes/` (chat, profiles, search, workflows, documents, emails), `ai-service/app/services/` (agent loop, embeddings, document processing, workflow engine)
- Contains: FastAPI routers, Claude integration, tool definitions and execution, database queries
- Depends on: PostgreSQL (psycopg2), Anthropic API (Claude Haiku 4.5), OpenAI API (embeddings, disabled)
- Used by: Backend (via HTTP proxy), background workers (workflow triggers)

**Database Layer (PostgreSQL 15 + pgvector):**
- Purpose: Multi-tenant data storage with built-in security via RLS
- Location: `backend/migrations/` (9 migration files)
- Contains: 15 tables, RLS policies, indexes, triggers, pgvector extension
- Depends on: None (foundational)
- Used by: Backend (direct connection pool), AI service (psycopg2 pool)

## Data Flow Patterns

**Authentication Flow:**
```
Browser → Clerk sign-in → Clerk session token
Frontend page loads → useAuth().getToken() → Bearer {token}
Frontend API call → POST /api/contacts with Authorization: Bearer {token}
Backend middleware → Clerk SDK verifies signature → extracts subject (user ID)
Backend stores user ID in context → all queries filtered to agent via RLS
```

**Contact CRUD Flow:**
```
Frontend (contacts/page.tsx) → useQuery/useMutation → apiRequest() with Bearer token
→ Backend ListContacts/CreateContact handler
→ Extract agentID from context → BeginWithRLS(agentID)
→ RLS policy filters to agent_id = current agent → query/insert/update
→ Commit/Rollback → respondJSON to frontend
→ Frontend TanStack Query caches result → page re-renders
```

**AI Chat Flow (Streaming):**
```
Frontend AIChatBubble → POST /api/ai/conversations/{id}/messages {role, content}
→ Backend SendMessage handler proxies to AI service
→ AI service receives request → _load_history() + build_system_prompt()
→ Call Claude with tools in loop (max 5 rounds)
→ Read tools execute immediately (get_contacts, search, etc.)
→ Write tools queue pending_action in DB → return SSE confirmation event
→ Frontend receives confirmation → user clicks Confirm
→ POST /api/ai/conversations/{id}/confirm → executes write action
→ Workflow engine checks triggers → fire matching workflows async
→ Final text response streamed word-by-word via SSE to frontend
→ Save assistant message + tool_calls to messages table
```

**Dashboard Layout Customization Flow:**
```
Frontend dashboard → click customize → drag-drop widgets
→ Zustand store updates locally for immediate UX
→ PUT /api/dashboard/layout {widgets: {}}
→ Backend SaveDashboardLayout stores JSONB in users.dashboard_layout
→ GET /api/dashboard/layout retrieves → frontend re-renders
```

**Email Sync Flow:**
```
User initiates Gmail auth → POST /api/gmail/auth/init
→ Backend GmailAuthInit returns OAuth URL
→ User grants permission → GET /api/auth/google/callback
→ Backend saves credentials to gmail_credentials table
→ Background worker (background/email.go) polls every 30 seconds
→ NewEmailSync() queries Gmail API for unread messages
→ InsertEmails() stores in emails table with contact matching
→ ProcessNewEmails callback triggers "email_sent" workflows
→ AI context includes recent emails in system prompt for contact-scoped chats
```

**Workflow Trigger Flow:**
```
User creates contact/deal/task → write operation completes
→ Backend calls matching workflow engine (AI service)
→ Engine matches trigger_type (contact_created, deal_stage_changed, activity_logged, email_sent, manual)
→ Loads workflow steps from workflows table
→ Executes steps sequentially (create_task, log_activity, wait, update_deal, ai_message)
→ Async task launched in background → no blocking of user request
→ Step results stored in workflow_runs table
```

## Key Abstractions

**Transaction with RLS:**
- Purpose: Ensure all queries run scoped to authenticated agent, preventing cross-agent data leakage
- Examples: `backend/internal/database/rls.go` - `BeginWithRLS()` function
- Pattern: `tx, _ := BeginWithRLS(ctx, pool, agentID)` → execute queries → `tx.Commit(ctx)` or `defer tx.Rollback(ctx)`
- Called by: Every handler that touches agent-scoped data

**Handler Factory:**
- Purpose: Encapsulate HTTP handler as closure with dependency injection (connection pool)
- Examples: `backend/internal/handlers/contacts.go` - `ListContacts(pool)` returns `http.HandlerFunc`
- Pattern:
  ```go
  func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
      agentID := middleware.AgentUUIDFromContext(r.Context())
      // handler logic
    }
  }
  ```
- Called by: Chi router in `main.go`

**API Client Module:**
- Purpose: Type-safe, reusable API functions with Clerk token injection
- Examples: `frontend/src/lib/api/contacts.ts`, `frontend/src/lib/api/deals.ts`, etc.
- Pattern:
  ```typescript
  export async function listContacts(token: string, filters): Promise<ContactListResponse> {
    return apiRequest<ContactListResponse>('/contacts', token, { query params });
  }
  ```
- Called by: Page components via `useQuery({ queryFn: () => listContacts(token!, filters) })`

**Service-to-Service Auth Bypass:**
- Purpose: Allow AI service to call backend handlers without Clerk JWT (e.g., send_email tool)
- Examples: `backend/internal/middleware/auth.go` - ClerkAuth checks `X-AI-Service-Secret` header
- Pattern: AI service passes `X-AI-Service-Secret: {SHARED_SECRET}` + `X-Agent-ID: {uuid}` → backend extracts agent ID from header instead of JWT
- Called by: AI service when executing write tools that need backend (send_email)

**SSE Streaming Response:**
- Purpose: Stream Claude response word-by-word and emit tool confirmation events
- Examples: `ai-service/app/routes/chat.py` - `/ai/messages` endpoint
- Pattern: Generator yields `data: {json}\n\n` for each event (text, tool_call, confirmation, error)
- Called by: Frontend fetch with `response.body.getReader()` → parse newline-delimited JSON

**Pending Action Queue:**
- Purpose: Persist write tool confirmations (10-min TTL) so user can review before execution
- Examples: `ai-service/app/tools.py` - `queue_write_tool()` stores JSONB in `pending_actions` table
- Pattern: `pending_actions` row contains `{agent_id, tool, input, expires_at}` → on confirm, AI service re-executes tool → returns result
- Called by: Write tools, confirmation endpoint

**Zustand Store:**
- Purpose: Centralized UI state (sidebar collapse, chat bubble open/close, citation viewer state)
- Examples: `frontend/src/store/ui-store.ts`
- Pattern: Single store instance with typed getters/setters, no external dependencies
- Called by: Layout, AIChatBubble, pages that toggle UI elements

**Tool Definition & Execution:**
- Purpose: Define Claude tool schema and bind to execution function
- Examples: `ai-service/app/tools.py` - `TOOL_DEFINITIONS` list + `execute_read_tool()` / `queue_write_tool()`
- Pattern: Tool has `name`, `description`, `input_schema` (Anthropic format) → on Claude tool call, look up function and execute
- Called by: Agent loop in `services/agent.py`

## Entry Points

**Frontend:**
- Location: `frontend/src/app/layout.tsx`
- Triggers: Browser requests `/` or `/dashboard/*`
- Responsibilities: Wrap app in Clerk provider, set up Providers (TanStack Query), load fonts, render route

**Backend:**
- Location: `backend/cmd/api/main.go` - `main()` function
- Triggers: Container starts
- Responsibilities: Load config, connect to database, initialize Clerk client, register middleware, register routes, start HTTP server with graceful shutdown

**AI Service:**
- Location: `ai-service/app/main.py` - FastAPI app instantiation
- Triggers: Container starts
- Responsibilities: Include routers (chat, profiles, search, workflows, documents, emails), startup cleanup of expired pending actions

**Clerk Middleware:**
- Location: `frontend/src/middleware.ts`
- Triggers: Every page request
- Responsibilities: Redirect unauthenticated users to `/sign-in`, allow public routes (marketing pages, portal), protect `/dashboard/*`

## Error Handling

**Strategy:** Minimal error wrapping; errors bubble up with generic "database error" or "invalid request" messages to frontend. Structured logging in backend via slog JSON handler.

**Patterns:**

Backend errors:
```go
// Silent failure — no error wrapping
if err != nil {
  respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
  return
}
```

Frontend errors:
```typescript
// apiRequest() throws on non-2xx
try {
  const data = await listContacts(token);
} catch (err) {
  console.error("Failed to fetch contacts:", err);
  setError(err.message);
}
```

AI Service errors:
```python
# FastAPI HTTPException with status and detail
raise HTTPException(status_code=404, detail="Contact not found")
```

## Cross-Cutting Concerns

**Logging:**
- Backend: `slog` JSON handler writes structured logs to stdout (timestamp, level, message, key-value fields)
- Frontend: `console.error()` for errors in try-catch blocks
- AI Service: Uvicorn access logs via stdout, no explicit custom logging

**Validation:**
- Frontend: react-hook-form + Zod (forms only, no API response validation)
- Backend: Manual parsing + strconv.Atoi() with defaults; no schema validation
- AI Service: Pydantic models on request/response, no explicit input validation

**Authentication:**
- Frontend: Clerk sign-in/sign-up, session token stored in browser
- Backend: Clerk SDK verifies JWT signature, extracts subject, stores in context
- AI Service: Shared secret header validation for service-to-service calls

**Row-Level Security:**
- Every query in agent-scoped tables wrapped in `BeginWithRLS(agentID)`
- PostgreSQL `app.current_agent_id` GUC variable set per transaction
- RLS policies filter `WHERE agent_id = current_setting('app.current_agent_id')`
- Prevents cross-agent data leakage at database layer, not application layer

---

*Architecture analysis: 2026-03-24*
