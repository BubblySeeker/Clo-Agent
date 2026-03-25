# CloAgent — Architecture Document

## System Overview

CloAgent is a **distributed monorepo** implementing a three-tier AI-powered CRM for real estate agents. The system uses containerized microservices with a shared PostgreSQL + pgvector database, emphasizing row-level security (RLS) for multi-tenant data isolation.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 14)                        │
│                    TanStack Query + Zustand Store                    │
│                         Port :3000 (Docker)                          │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS / Bearer Token (Clerk JWT)
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Backend API (Go / Chi v5)                         │
│            Request → Middleware → Handler → RLS Transaction         │
│                         Port :8080 (Docker)                          │
│                                                                       │
│  ┌───────────────────────┐  ┌──────────────────────────────────┐   │
│  │   Auth Middleware     │  │   User Sync Middleware           │   │
│  │ • ClerkAuth (JWT)     │  │ • Auto-create user on first req  │   │
│  │ • UserID → Context    │  │ • Sync Clerk profile             │   │
│  └───────────────────────┘  └──────────────────────────────────┘   │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │         Handler Layer (14 handler files, 20+ endpoints)        │ │
│  │  • /api/contacts, /api/deals, /api/activities, /api/tasks      │ │
│  │  • /api/buyer-profiles, /api/ai-profile                        │ │
│  │  • /api/ai/conversations, /api/ai/confirm (proxies to Python)  │ │
│  │  • /api/analytics, /api/dashboard                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Database Layer (pgx v5 pool)                      │ │
│  │  • Transactions with RLS context set via app.current_agent_id  │ │
│  │  • BeginWithRLS helper wraps transaction setup                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────┬────────────────────────────────────┘
         │ AI requests (proxy)     │ RLS-protected DB queries
         │                         │
         ↓                         ↓
┌──────────────────────┐   ┌──────────────────────────────────┐
│  AI Service          │   │ PostgreSQL 15 + pgvector          │
│ (FastAPI / Python)   │   │  • 10 tables (agents, contacts,  │
│   Port :8000         │   │    deals, activities, etc)        │
│                      │   │  • Row-Level Security policies    │
│  • Agent Loop        │   │  • pgvector embeddings (unused)   │
│  • Claude API calls  │   │  • Migrations (001–005)           │
│  • 23 Tools (11 read │   │                                   │
│    + 12 write)       │   │ ┌──────────────────────────────┐ │
│  • SSE Streaming     │   │ │   Redis (configured unused)  │ │
│  • Confirmation      │   │ └──────────────────────────────┘ │
│    state machine     │   │                                   │
└──────────────────────┘   └──────────────────────────────────┘
```

## Layer Architecture

### 1. Frontend Layer (Next.js 14, TypeScript)

**Entry Point:** `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/app/layout.tsx`

```typescript
ClerkProvider → Providers (TanStack Query) → Route Tree
```

**Responsibilities:**
- User authentication via Clerk (sign-in, sign-up, SSO callbacks)
- Marketing pages (home, about, features, pricing, team, mission)
- Protected dashboard routes with layout
- Real-time data synchronization via TanStack Query
- AI chat bubble (floating) + full-page chat
- Form handling with react-hook-form + Zod (forms only, no validation wrappers)

**Key Components:**
- `src/app/dashboard/` — Protected routes (contacts, pipeline, tasks, analytics, chat, etc.)
- `src/components/shared/` — AIChatBubble (floating), providers
- `src/lib/api/` — 8 API client modules + base client with Bearer token auth
- `src/store/ui-store.ts` — Zustand store (sidebar state, chat bubble visibility)
- `src/components/ui/` — shadcn components (card, button, dialog, etc.)

**Data Flow:**
1. Component requests token via `getToken()` from Clerk
2. Calls API module (e.g., `listContacts(token)`)
3. API client appends Bearer token and calls backend `/api/...`
4. Response hydrates TanStack Query cache
5. SSE streaming for AI messages uses custom event listener

**Authentication:**
- Middleware routes: redirects unauthenticated users to sign-in
- Protected routes require valid Clerk session
- All API requests include `Authorization: Bearer {token}`

### 2. Backend Layer (Go, Chi v5 router)

**Entry Point:** `/Users/matthewfaust/CloAgent/Clo-Agent/backend/cmd/api/main.go`

**Middleware Stack (in order):**
```
RequestID → RealIP → Logger → Recoverer → Compress(5) → CORS
    ↓
Protected Routes Group
    ├─ ClerkAuth (verify JWT, extract user_id)
    └─ UserSync (auto-create user in DB if first request)
```

**Handler Categories:**

1. **Core CRUD** (`contacts.go`, `deals.go`, `activities.go`)
   - Standard REST endpoints with pagination, filtering, search
   - Each handler: extract agent_id from context → begin RLS transaction → query with RLS context set → respond

2. **Complex Domains** (`buyer_profiles.go`, `dashboard.go`, `analytics.go`)
   - Multi-table joins and aggregations
   - Dashboard layout persistence (JSONB column)
   - Pipeline, activity, and contact analytics

3. **AI Integration** (`conversations.go`, `messages.go`, `ai_profile.go`, `confirm.go`)
   - Proxy chat messages to Python AI service
   - Stream SSE responses back to frontend
   - Handle tool confirmation state
   - Regenerate AI profiles

**Response Pattern:**
```go
// All handlers follow this pattern
func Handler(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID)
        defer tx.Rollback(r.Context())
        // Query, marshal, respond
        respondJSON(w, http.StatusOK, data)
        tx.Commit(r.Context())
    }
}
```

**Key Abstractions:**

- **RLS Transaction (database/rls.go):** `BeginWithRLS(ctx, pool, agentID)`
  - Wraps `pool.Begin()`
  - Executes `SET LOCAL app.current_agent_id = '<uuid>'`
  - All queries within transaction are auto-filtered to agent

- **Context Extraction (middleware/auth.go):** `AgentUUIDFromContext(ctx)`
  - Clerk JWT verified → subject extracted → stored in context
  - Used by user sync middleware to fetch Clerk profile
  - Passed to RLS transaction

- **Response Helpers (handlers/helpers.go):**
  - `respondJSON(w, status, data)` — JSON marshal + write
  - `respondError(w, status, message)` — Error response

### 3. AI Service Layer (FastAPI / Python)

**Entry Point:** `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/main.py` → `app/main.py`

**Routes:**
- `GET /health` — Service health check
- `POST /api/messages` — Send message (stream SSE response)
- `POST /api/confirm` — Confirm pending write action
- `POST /api/profiles/generate` — Generate AI profile for contact

**Service Components:**

1. **Agent Loop** (`services/agent.py`)
   - Loads last 20 messages from conversation
   - Builds system prompt (contact-scoped if available)
   - Calls Claude (model: Haiku 4.5, max 5 tool rounds)
   - Streams response word-by-word via SSE
   - Saves assistant message + tool_calls JSONB to DB

2. **Tools** (`tools.py`)
   - **Read Tools (11):** Execute immediately, return results inline
     - `get_dashboard_summary`, `search_contacts`, `get_contact_details`, etc.
   - **Write Tools (12):** Queue confirmation, execute after user approves
     - `create_contact`, `update_contact`, `log_activity`, etc.
   - **Pending State:** In-memory dict (not shared, lost on restart)

3. **Database** (`database.py`)
   - psycopg2 ThreadedConnectionPool (1-10 connections)
   - Sync functions wrapped with `asyncio.to_thread` for async routes
   - Context manager: `with get_conn() as conn:`

**Data Flow (Chat Message):**
```
Frontend POST /ai/messages
    ↓
Go Backend proxies → Python AI Service
    ↓
Load conversation history from DB
    ↓
Build system prompt (agent + contact context if scoped)
    ↓
Claude API call with tool definitions
    ↓
[Loop: Execute read tools inline, queue write tools]
    ↓
Stream final response via SSE (word-by-word)
    ↓
Save message + tool_calls to DB
    ↓
Frontend receives SSE events, displays streaming text
```

**Tool Confirmation Flow:**
```
Write tool called → Queue in pending_actions dict → Send 'confirmation' SSE event
    ↓
Frontend displays confirmation card to user
    ↓
User clicks Confirm → POST /ai/confirm {action_id}
    ↓
Go backend proxies to Python
    ↓
Python retrieves action from pending_actions, executes against DB
    ↓
Return result to frontend
```

### 4. Database Layer (PostgreSQL 15 + pgvector)

**Schema:** 10 tables, 5 migrations

| Table | Purpose | Key Columns | RLS |
|-------|---------|-------------|-----|
| `users` | Agent accounts | id, clerk_id, name, email, dashboard_layout (JSONB) | Agent-scoped |
| `contacts` | Leads/clients | id, agent_id, first/last name, email, phone, source | Agent-scoped |
| `buyer_profiles` | Buyer preferences | contact_id (1:1), budget_min/max, bedrooms, bathrooms, locations[], timeline | Contact-scoped |
| `deals` | Pipeline cards | contact_id, agent_id, stage_id, title, value, notes | Agent-scoped |
| `deal_stages` | Pipeline columns | name, position, color (7 seeded: Lead → Lost) | Public (shared) |
| `activities` | Calls, emails, notes, showings, tasks | contact_id, agent_id, type, body, due_date, priority, completed_at | Agent-scoped |
| `conversations` | AI chat threads | contact_id (nullable), agent_id, title | Agent-scoped |
| `messages` | Chat messages | conversation_id, role, content, tool_calls (JSONB) | Conversation-scoped |
| `ai_profiles` | Contact summaries | contact_id (1:1), summary | Contact-scoped |
| `embeddings` | Vector search (unused) | source_type, source_id, agent_id, content, embedding(1536) | Agent-scoped |

**RLS Policies:**
```sql
-- Example: contacts table
CREATE POLICY "agents can only see own contacts"
  ON contacts FOR ALL USING (agent_id = current_setting('app.current_agent_id')::uuid);
```

- All agent-scoped tables have RLS enabled
- Every transaction sets `SET LOCAL app.current_agent_id = '<uuid>'`
- Queries automatically filtered to authenticated agent
- RLS prevents cross-agent data leakage

**Migrations:**
1. `001_init.sql` — Schema + RLS policies + indexes + seed deal stages
2. `002_updates.sql` — dashboard_layout JSONB, conversation.contact_id nullable
3. `003_tool_calls.sql` — messages.tool_calls JSONB
4. `004_conversation_title.sql` — conversations.title TEXT
5. `005_task_fields.sql` — activities.due_date DATE, priority TEXT, completed_at TIMESTAMPTZ

## Data Flow Patterns

### Authentication Flow

```
User visits /dashboard → Clerk middleware → sign-in redirect
    ↓
User logs in via Clerk UI → getToken() → JWT obtained
    ↓
Frontend API calls include: Authorization: Bearer {JWT}
    ↓
Go backend ClerkAuth verifies JWT with Clerk SDK
    ↓
Subject (Clerk user_id) stored in context
    ↓
UserSync middleware: lookup user in DB by clerk_id
    ↓
First visit? Auto-create user record with Clerk profile data
    ↓
Context enriched with agent_id (user.id from DB)
    ↓
All subsequent queries use agent_id for RLS context
```

### Contact CRUD Flow

```
Frontend: listContacts(token, {search, source, page, limit})
    ↓
Go: GET /api/contacts?search=...&source=...
    ↓
Handler: Extract agentID from context
    ↓
BeginWithRLS(ctx, pool, agentID) → SET app.current_agent_id
    ↓
SELECT * FROM contacts WHERE {search/source filters}
    ↓ (RLS policy auto-filters: WHERE agent_id = current_setting(...))
    ↓
Return paginated results + total count
    ↓
Frontend: TanStack Query caches data
```

### AI Chat Flow

```
User: "Create a task for John Doe due tomorrow"
    ↓
Frontend: POST /api/ai/conversations/{id}/messages {content: "..."}
    ↓
Go: Save user message to DB, proxy to Python AI service
    ↓
Python: Load conversation + contact context
    ↓
Claude: Analyze intent, call create_task tool (write tool)
    ↓
create_task → Queue in pending_actions dict
    ↓
Stream back: "I'll create a task for John Doe..."
    ↓
Send SSE event: {type: "confirmation", action_id: "...", preview: "..."}
    ↓
Frontend: Show confirmation card "Create task for John Doe? [Confirm]"
    ↓
User clicks Confirm
    ↓
Frontend: POST /api/ai/conversations/{id}/confirm {action_id: "..."}
    ↓
Go: Proxy to Python
    ↓
Python: Retrieve action from pending_actions, execute against DB
    ↓
Return result to frontend
```

### Dashboard Layout Customization Flow

```
Frontend: User drags widgets, saves layout
    ↓
Frontend: PUT /api/dashboard/layout {widgets: [...], order: [...]}
    ↓
Go: Handler extracts agentID, serializes layout to JSONB
    ↓
UPDATE users SET dashboard_layout = $1 WHERE id = $2
    ↓
Return updated layout
    ↓
On next visit: GET /api/dashboard/layout → returns saved layout
```

## Middleware Chain Detailed

### Global Middleware (applied to all routes)

```go
r.Use(chimiddleware.RequestID)        // Add X-Request-ID
r.Use(chimiddleware.RealIP)          // Extract real IP
r.Use(chimiddleware.Logger)          // JSON logging
r.Use(chimiddleware.Recoverer)       // Panic recovery
r.Use(chimiddleware.Compress(5))     // Gzip compression
r.Use(middleware.CORSHandler())      // CORS headers
```

### Protected Route Middleware (applied to `/api` group)

```go
r.Group(func(r chi.Router) {
    r.Use(middleware.ClerkAuth(clerkClient))      // 1. Verify JWT
    r.Use(middleware.UserSync(pool, clerkClient)) // 2. Auto-sync user
    // All routes within this group require valid auth
})
```

**ClerkAuth Middleware:**
1. Extract Bearer token from `Authorization` header
2. Verify token with Clerk SDK (signature, expiry, etc.)
3. Extract subject (Clerk user_id)
4. Store in context: `context.WithValue(r.Context(), UserIDKey, claims.Subject)`
5. Fail with 401 if token invalid

**UserSync Middleware:**
1. Retrieve Clerk user_id from context
2. Query DB: `SELECT id FROM users WHERE clerk_id = ?`
3. Not found? Call Clerk API to get full profile (name, email)
4. Insert: `INSERT INTO users (id, clerk_id, name, email) ...`
5. Update context with agent_id (users.id)

## Key Design Decisions

### 1. RLS for Multi-Tenancy
- **Why:** Each agent's data automatically isolated at DB layer
- **Trade-off:** Requires setting context before every query
- **Implementation:** Single transaction wrapper (`BeginWithRLS`) handles setup

### 2. Frontend as Single Entry Point
- **Why:** Simplifies CORS, auth, and request routing
- **Trade-off:** Go backend must proxy AI requests
- **Benefit:** Frontend never needs Anthropic API key or direct AI service access

### 3. In-Memory Pending Actions (AI Confirmation)
- **Current:** Dict in Python service memory (not shared across workers)
- **Limitation:** Lost on service restart, single-process only
- **Plan:** Move to DB persistence (Phase D)

### 4. TanStack Query for State Management
- **Why:** Automatic caching, invalidation, refetch on focus
- **No custom hook wrappers:** Inline `useQuery` in components
- **Stale time:** 60 seconds default

### 5. No Validation Schemas
- **Zod installed but unused** (beyond react-hook-form)
- **Backend:** No typed request validation, manual parsing
- **Plan:** Add Zod validation wrappers (Phase D)

### 6. Semantic Search Unused
- **Database:** embeddings table exists, pgvector installed
- **Missing:** Embedding generation on create/update, search endpoint
- **Plan:** Wire up (Phase C)

## Error Handling Patterns

### Frontend
```typescript
apiRequest<T>() throws Error on non-2xx status
    ↓
Caller catches and handles
    ↓
No global error boundary for API errors (relies on component-level try/catch)
```

### Backend
```go
// Standard handler pattern
if err != nil {
    respondError(w, http.StatusInternalServerError, "error message")
    return
}

// Global panic recovery middleware catches unhandled panics
```

### AI Service
```python
# Tool execution
try:
    result = execute_tool(...)
except Exception as e:
    return {"error": str(e), "status": "failed"}
    # Message still streamed with error note
```

## Security Model

### Authentication
- **Clerk:** Industry-standard, handles JWT signing + verification
- **Backend:** Validates signature, extracts subject
- **Frontend:** Uses Clerk's React SDK for sign-in/sign-up UI

### Authorization
- **Row-Level Security:** PostgreSQL policies enforce agent isolation
- **No role-based access control:** All authenticated agents have same capabilities
- **AI tools:** No ACL checks (all agents can call all tools)

### Data Isolation
- Every query runs in transaction with `SET LOCAL app.current_agent_id`
- Impossible to query another agent's data (RLS policies prevent it)
- Even if token is stolen, can only access that agent's data

### API Security
- CORS enabled (configurable)
- No API keys exposed in frontend (Clerk handles auth)
- AI service behind internal network (not exposed to frontend)

## Performance Considerations

### Database
- **Pool:** 25 max connections, 5 min, 30-minute lifetime, 5-minute idle timeout
- **Indexes:** Seeded on contacts (agent_id, source, created_at), deals, activities, conversations
- **Pagination:** Default 25 items, max 100 per page

### Frontend
- **TanStack Query:** 60-second stale time, automatic refetch on window focus
- **Code splitting:** Next.js App Router auto-splits at route boundaries
- **Font loading:** Google fonts (DM Sans, Sora, Cinzel, Josefin Sans)

### AI Service
- **psycopg2 pool:** 1-10 connections, thread-safe
- **Async wrapper:** `asyncio.to_thread` for sync DB calls
- **Model:** Anthropic Claude Haiku 4.5 (fast, low-cost)
- **Tool limit:** Max 5 rounds per message (safety limit)

## Deployment & Container Orchestration

**Docker Compose** (`docker-compose.yml`):
```yaml
Services:
  postgres:15     → :5432 (health check, auto-init migrations)
  redis:7         → :6379 (configured, unused)
  backend:Go      → :8080 (depends_on postgres healthy)
  ai-service:py   → :8000 (depends_on postgres healthy)
  frontend:Next   → :3000 (depends_on backend + ai-service)

Networks:
  cloagent (bridge) — all services communicate within network

Volumes:
  postgres_data, redis_data — persist across restarts
```

**Build Process:**
- Backend: Dockerfile in `backend/` (Go binary, minimal image)
- AI Service: Dockerfile in `ai-service/` (Python + FastAPI)
- Frontend: Dockerfile in `frontend/` (Node build → Next.js server)

## Extending the Architecture

### Adding a New Endpoint

**Backend:**
1. Create handler in `internal/handlers/domain.go`
2. Extract agentID from context
3. Begin RLS transaction
4. Query/write with context
5. Respond JSON
6. Register route in `cmd/api/main.go` router

**Frontend:**
1. Create API function in `src/lib/api/domain.ts`
2. Use `apiRequest` helper with token
3. Call from component with TanStack Query
4. Display/cache result

### Adding a New AI Tool

**AI Service:**
1. Add tool definition to `TOOL_DEFINITIONS` list (Anthropic schema)
2. Implement executor: `def execute_{tool_name}(args) → result`
3. Add to `READ_TOOLS` or `WRITE_TOOLS` list
4. If write: queue in pending_actions, return confirmation

**Backend:**
1. Add route: `POST /api/ai/confirm` (already exists, handles all tools)

**Frontend:**
1. Add label + icon mapping in `src/lib/ai-chat-helpers.ts`
2. Confirmation cards auto-render based on tool type

---

**Last Updated:** 2026-03-17
