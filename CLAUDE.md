# CloAgent — Project Reference

CloAgent is an AI-powered CRM for real estate agents. Monorepo with three services sharing a PostgreSQL 15 + pgvector database.

## Architecture

```
Frontend (Next.js 14, :3000) → Backend (Go/Chi, :8080) → PostgreSQL 15 + pgvector
                                       ↕
                               AI Service (FastAPI, :8000)
```

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Clerk auth (`@clerk/nextjs` v5), TanStack Query, Zustand, react-hook-form + Zod, recharts, @dnd-kit, lucide-react
- **Backend**: Go 1.24, Chi v5 router, pgx v5 connection pool, Clerk JWT middleware, RLS for data isolation
- **AI Service**: Python 3.11, FastAPI, psycopg2 (sync + thread pool), Claude API via `anthropic` SDK (Haiku 4.5), SSE streaming
- **Database**: PostgreSQL 15 with pgvector extension, row-level security per agent
- **Auth**: Clerk — frontend uses `@clerk/nextjs` v5, backend validates JWT via Clerk SDK, user auto-sync on first request
- **Infra**: Docker Compose (postgres, redis, backend, ai-service, frontend)

The Go backend is the single entry point for the frontend. AI requests are proxied from Go → Python AI service. The frontend never talks to the AI service directly.

**Note:** `shadcn` CLI is installed but only one component exists (`button.tsx`). All API calls use native `fetch` via `src/lib/api/client.ts`.

## Current Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (Clerk sign-in/up, JWT, user sync) | **DONE** | Full flow working |
| Contacts CRUD (list, create, edit, delete) | **DONE** | Search, source filter, pagination |
| Contact Detail (overview, activities, deals tabs) | **DONE** | Missing: Buyer Profile tab, AI Profile tab |
| Deals CRUD | **DONE** | Full create/edit/delete with stage management |
| Pipeline Kanban | **DONE** | Native HTML drag-drop (not @dnd-kit) |
| Activities (log, list per contact, global feed) | **DONE** | All types: call/email/note/showing/task |
| Dashboard (metrics, charts, activity feed) | **DONE** | Widgets render with real data; customization mode with layout save/load via API |
| AI Chat Bubble (floating, global) | **DONE** | SSE streaming, tool call indicators, confirmation cards, contact-scoped |
| AI Chat Full Page (`/dashboard/chat`) | **DONE** | Conversation list, delete, rename, streaming |
| AI Tools (23 total: 11 read, 12 write) | **DONE** | All execute against real DB |
| AI Profile Generation | **DONE** | Backend endpoint works, no frontend UI tab |
| Analytics | **PARTIAL** | Bar charts for pipeline/activities/contacts; missing funnel, time-to-close |
| Tasks Page | **DONE** | Full-stack with DB columns (due_date, priority, completed_at), API endpoints, and AI tools |
| Workflows Page | **STUB** | Hardcoded mock data, no backend support |
| Settings Page | **STUB** | UI renders but nothing persists (commission, notifications, integrations all hardcoded) |
| Notifications | **STUB** | Hardcoded array in dashboard layout, no backend |
| Marketing Pages | **DONE** | Home, about, features, pricing, team, mission |
| Buyer Profile Backend | **DONE** | GET/POST/PATCH endpoints exist, AI tools exist |
| Buyer Profile Frontend | **MISSING** | No tab on contact detail page |
| AI Profile Frontend | **MISSING** | No tab on contact detail page |
| Semantic Search / Embeddings | **MISSING** | Table + index exist, no embedding generation or search endpoint |
| Communication Page | **MISSING** | Route doesn't exist |
| +New Quick Action | **MISSING** | Button not in top bar |

## Database Schema

10 tables in `backend/migrations/001_init.sql`. 5 migrations total:

| Migration | What it does |
|-----------|-------------|
| `001_init.sql` | All 10 tables, RLS policies, indexes, triggers, seed deal stages |
| `002_updates.sql` | `users.dashboard_layout JSONB`, `conversations.contact_id` nullable |
| `003_tool_calls.sql` | `messages.tool_calls JSONB` |
| `004_conversation_title.sql` | `conversations.title TEXT` |
| `005_task_fields.sql` | `activities.due_date DATE`, `activities.priority TEXT`, `activities.completed_at TIMESTAMPTZ` |

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | Agent accounts (Clerk-mapped) | id (UUID), clerk_id, email, name, dashboard_layout (JSONB) |
| `contacts` | Leads/clients | id, agent_id (FK), first_name, last_name, email, phone, source |
| `buyer_profiles` | Buyer preferences (1:1 with contact) | contact_id (UNIQUE), budget_min/max, bedrooms, bathrooms, locations[], must_haves[], deal_breakers[], property_type, pre_approved, timeline |
| `deal_stages` | Pipeline columns (7 seeded) | name, position, color — Lead, Contacted, Touring, Offer, Under Contract, Closed, Lost |
| `deals` | Pipeline cards | contact_id, agent_id, stage_id, title, value, notes |
| `activities` | Calls, emails, notes, showings, tasks | contact_id, deal_id (optional), agent_id, type, body, due_date (tasks), priority (tasks), completed_at (tasks) |
| `conversations` | AI chat threads | contact_id (nullable), agent_id, title |
| `messages` | Messages in conversations | conversation_id, role (user/assistant/system), content, tool_calls (JSONB) |
| `ai_profiles` | AI-generated contact summaries | contact_id (UNIQUE), summary |
| `embeddings` | pgvector semantic search (**unused**) | source_type, source_id, agent_id, content, embedding(1536) |

**RLS**: All agent-scoped tables have row-level security. Every query runs `SET LOCAL app.current_agent_id = '<uuid>'` in a transaction. RLS policies auto-filter to the authenticated agent.

## API Endpoints

### Dashboard
```
GET  /api/dashboard/summary          — all dashboard data (metrics, pipeline, activities, follow-ups)
GET  /api/dashboard/layout           — agent's widget layout
PUT  /api/dashboard/layout           — save widget layout
```

### Contacts
```
GET    /api/contacts                 — list (?search, ?source, ?page, ?limit)
POST   /api/contacts                 — create (required: first_name, last_name)
GET    /api/contacts/{id}            — get single
PATCH  /api/contacts/{id}            — partial update
DELETE /api/contacts/{id}            — hard delete (cascades)
```

### Buyer Profiles (backend exists, frontend doesn't call)
```
GET   /api/contacts/{id}/buyer-profile   — get (404 if none)
POST  /api/contacts/{id}/buyer-profile   — create (409 if exists)
PATCH /api/contacts/{id}/buyer-profile   — partial update
```

### Activities
```
GET  /api/contacts/{id}/activities   — list for contact (?type, paginated)
POST /api/contacts/{id}/activities   — create (type: call|email|note|showing|task)
GET  /api/activities                 — list all activities across contacts
```

### Deals
```
GET    /api/deals                    — list (?stage_id, ?contact_id)
POST   /api/deals                    — create (required: contact_id, stage_id, title)
GET    /api/deals/{id}               — get (includes contact_name, stage_name via JOIN)
PATCH  /api/deals/{id}               — partial update
DELETE /api/deals/{id}               — hard delete
```

### Deal Stages
```
GET /api/deal-stages                 — list all 7 stages (cached 1 hour)
```

### AI Conversations (proxied Go → Python)
```
GET    /api/ai/conversations                  — list all
POST   /api/ai/conversations                  — create ({contact_id?: uuid})
GET    /api/ai/conversations/{id}             — get single
DELETE /api/ai/conversations/{id}             — delete + cascade messages
GET    /api/ai/conversations/{id}/messages    — message history
POST   /api/ai/conversations/{id}/messages    — send message (streams SSE response)
POST   /api/ai/conversations/{id}/confirm     — confirm pending write action
```

### AI Profiles (proxied Go → Python)
```
GET  /api/contacts/{id}/ai-profile           — get summary (frontend doesn't call)
POST /api/contacts/{id}/ai-profile/regenerate — regenerate (frontend doesn't call)
```

### Analytics
```
GET /api/analytics/pipeline         — stage counts, values, averages
GET /api/analytics/activities       — activity counts by type
GET /api/analytics/contacts         — source breakdown, new this month
```

### Error & Pagination
- Errors: `{"error": "message"}` with status 400/401/403/404/500
- Pagination: `?page=1&limit=25`, response includes `"total"` count

## AI Agent Tools

23 tools total. All execute directly against the database (not through Go backend).

### Read Tools (11 — execute immediately)
| Tool | Inputs | Returns |
|------|--------|---------|
| `get_dashboard_summary` | none | total_contacts, active_deals, pipeline_value, recent_activities_7d, closed_this_month |
| `search_contacts` | query?, source?, limit? | contact list with last_activity_at |
| `get_contact_details` | contact_id | full contact + buyer_profile if exists |
| `get_contact_activities` | contact_id, limit? | activity history DESC |
| `list_deals` | stage_name?, contact_id?, limit? | deals with stage/contact info |
| `get_deal` | deal_id | deal with stage/contact info |
| `get_deal_stages` | none | all 7 stages |
| `get_buyer_profile` | contact_id | buyer preferences or 404 |
| `get_all_activities` | type?, limit? | activities across all contacts |
| `get_analytics` | none | pipeline_by_stage, activity_counts, contact_sources |
| `get_overdue_tasks` | limit? | tasks past due date and not completed |

### Write Tools (12 — require user confirmation)
| Tool | Required Inputs | Notes |
|------|----------------|-------|
| `create_contact` | first_name, last_name | optional: email, phone, source |
| `update_contact` | contact_id | optional: any contact field |
| `delete_contact` | contact_id | manual cascade delete |
| `log_activity` | contact_id, type, body | types: call/email/note/showing/task |
| `create_deal` | contact_id, title | defaults to "Lead" stage |
| `update_deal` | deal_id | optional: stage_name, title, value, notes |
| `delete_deal` | deal_id | |
| `create_buyer_profile` | contact_id | all profile fields optional |
| `update_buyer_profile` | contact_id | partial update |
| `create_task` | body, due_date | optional: contact_id, priority |
| `complete_task` | task_id | sets completed_at to NOW() |
| `reschedule_task` | task_id, new_due_date | updates due_date |

### Pending Actions
Write tools use an **in-memory dict** (`pending_actions` in `tools.py`). When a write tool is called, it queues a confirmation and sends a `confirmation` SSE event to the frontend. User clicks Confirm → `POST /ai/confirm` → action executes.

**Limitation:** Not persistent. Lost on service restart. Single-process only. No TTL/expiration.

### Agent Loop
- Max 5 tool rounds per message (safety limit in `agent.py`)
- Last 20 messages loaded as conversation context
- Contact-scoped conversations pre-load contact details + buyer profile + recent activities into system prompt

## Project Structure

```
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                          # Marketing home
│   │   │   ├── (marketing)/                      # about, features, pricing, team, mission
│   │   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   │   ├── sign-up/[[...sign-up]]/page.tsx
│   │   │   └── dashboard/
│   │   │       ├── layout.tsx                    # Top bar nav, notifications, chat bubble
│   │   │       ├── page.tsx                      # Dashboard home (widgets)
│   │   │       ├── contacts/page.tsx             # Contact list
│   │   │       ├── contacts/[id]/page.tsx        # Contact detail (tabs)
│   │   │       ├── pipeline/page.tsx             # Kanban board
│   │   │       ├── chat/page.tsx                 # Full-page AI chat
│   │   │       ├── activities/page.tsx           # Global activity feed
│   │   │       ├── analytics/page.tsx            # Charts
│   │   │       ├── tasks/page.tsx                # Tasks (full-stack)
│   │   │       ├── settings/page.tsx             # STUB — no persistence
│   │   │       └── workflows/page.tsx            # STUB — mock data
│   │   ├── components/
│   │   │   ├── shared/AIChatBubble.tsx           # Floating chat bubble
│   │   │   ├── shared/providers.tsx              # TanStack Query provider
│   │   │   ├── marketing/                        # MarketingNav, Footer, LinkButton
│   │   │   └── ui/button.tsx                     # Only shadcn component
│   │   ├── lib/
│   │   │   ├── api/client.ts                     # Base fetch with auth header
│   │   │   ├── api/contacts.ts                   # Contact API functions
│   │   │   ├── api/deals.ts                      # Deal + stage API functions
│   │   │   ├── api/activities.ts                 # Activity API functions
│   │   │   ├── api/conversations.ts              # AI chat + SSE streaming
│   │   │   ├── api/dashboard.ts                  # Dashboard summary + layout
│   │   │   ├── ai-chat-helpers.ts                # Shared tool labels, confirm labels, formatPreview
│   │   │   └── utils.ts
│   │   ├── store/ui-store.ts                     # Zustand (sidebar, chat state)
│   │   └── middleware.ts                         # Clerk auth routing
│   └── package.json
│
├── backend/
│   ├── cmd/api/main.go                           # Router setup, middleware stack
│   ├── internal/
│   │   ├── config/config.go                      # Env var loading
│   │   ├── database/postgres.go                  # Connection pool
│   │   ├── database/rls.go                       # BeginWithRLS helper
│   │   ├── handlers/                             # 12 handler files (contacts, deals, etc.)
│   │   └── middleware/                            # auth.go, cors.go, user_sync.go
│   ├── migrations/                               # 001-004 SQL files
│   └── go.mod
│
├── ai-service/
│   ├── app/
│   │   ├── main.py                               # FastAPI app
│   │   ├── config.py                             # Env vars
│   │   ├── database.py                           # psycopg2 pool + async wrapper
│   │   ├── tools.py                              # 19 tools + pending_actions
│   │   ├── routes/chat.py                        # POST /ai/messages, /ai/confirm
│   │   ├── routes/profiles.py                    # POST /ai/profiles/generate
│   │   ├── routes/health.py                      # GET /health
│   │   └── services/agent.py                     # Agentic loop, Claude integration
│   └── requirements.txt
│
├── docker-compose.yml
└── CLAUDE.md
```

## Path Forward — Functional Priorities

Focus: **make implementations work** before any design polish.

### Phase A: Wire Up Existing Backend to Frontend
No new backend code needed — these endpoints already exist.

1. **Buyer Profile tab** on contact detail page — `GET/POST/PATCH /api/contacts/{id}/buyer-profile`
2. **AI Profile tab** on contact detail page — `GET /api/contacts/{id}/ai-profile`, `POST .../regenerate`
3. ~~**Dashboard widget customization**~~ — **DONE** (commit `0f9d9d5`)
4. **Analytics page** — complete remaining charts (funnel, time-to-close) using existing endpoints

### Phase B: Replace Stubs with Real Implementations
1. ~~**Tasks page**~~ — **DONE** (commit `f923cf8`)
2. **Notifications** — build backend notification system, replace hardcoded data in layout
3. **Settings page** — wire save handlers for commission, pipeline stages, notification preferences

### Phase C: Missing Features
1. **Semantic search** — generate embeddings on contact/activity creation, wire up search endpoint
2. **Communication page** — email/call integration hub
3. **+New quick action** button in top bar

### Phase D: Robustness
1. Persist `pending_actions` to DB instead of in-memory dict
2. Add error handling where currently silently swallowed
3. Add Zod validation schemas (package installed but unused beyond forms)

### Phase E: Design & Polish (last)
1. UI consistency and component extraction
2. Responsive design improvements
3. Loading states, empty states, error states
4. Marketing pages substance

## gstack Skills

Use the `/browse` skill from gstack for all web browsing tasks. Never use `mcp__claude-in-chrome__*` tools directly.

Available gstack skills:
- `/plan-ceo-review` — CEO-level strategic plan review
- `/plan-eng-review` — Engineering plan review
- `/review` — Code review
- `/ship` — Ship/deploy workflow
- `/browse` — Web browsing (use this instead of mcp chrome tools)
- `/qa` — Quality assurance testing
- `/qa-only` — QA-only mode (no code changes)
- `/setup-browser-cookies` — Configure browser cookies for browsing
- `/retro` — Retrospective analysis
- `/document-release` — Document a release
- `/gstack-upgrade` — Upgrade gstack to latest version

### gstack Setup (for new contributors)
After cloning the repo, run:
```bash
# Install bun if not already installed
curl -fsSL https://bun.sh/install | bash
# Build the browse binary and install Playwright Chromium
cd .claude/skills/gstack && ./setup
```

## Backend Patterns

### Handler Factory
```go
func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID)
        defer tx.Rollback(r.Context())
        // query, marshal, respond
        tx.Commit(r.Context())
    }
}
```

### Response Helpers
```go
respondJSON(w, http.StatusOK, data)
respondError(w, http.StatusBadRequest, "message")
```

### Middleware Stack
1. RequestID → RealIP → Logger → Recoverer → Compress(5) → CORS (global)
2. ClerkAuth → UserSync (protected routes group)

### AI Proxy Pattern
Go saves user message → proxies to Python AI service with `X-AI-Service-Secret` → streams SSE response back to frontend with flushing.

## Frontend Patterns

### API Client
`src/lib/api/client.ts` — `apiRequest<T>(path, token, options)` wraps `fetch` with Bearer token auth. All API modules import this.

### Data Fetching
TanStack Query used inline in page components (no custom hook wrapper files). Pattern:
```tsx
const { data } = useQuery({ queryKey: ['contacts'], queryFn: async () => {
  const token = await getToken();
  return listContacts(token!, { search, source, page, limit });
}});
```

### State
- **Server state**: TanStack Query (all API data)
- **UI state**: Zustand store (`ui-store.ts` — sidebar, chat bubble open/close)
- **Form state**: react-hook-form inline

### Styling
All Tailwind CSS. No component library beyond one shadcn button. All UI built from scratch.

## Environment Variables

### Backend
```
DATABASE_URL=postgres://user:pass@localhost:5432/cloagent
CLERK_SECRET_KEY=sk_test_...
PORT=8080
AI_SERVICE_URL=http://localhost:8000  (default)
AI_SERVICE_SECRET=<shared-secret>
REDIS_URL=redis://localhost:6379      (configured but unused)
```

### Frontend
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### AI Service
```
DATABASE_URL=postgresql://user:pass@localhost:5432/cloagent
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_SERVICE_SECRET=<same-shared-secret>
BACKEND_URL=http://localhost:8080
```
