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
| Contact Detail (overview, activities, deals, buyer profile, AI profile tabs) | **DONE** | All 5 tabs working |
| Deals CRUD | **DONE** | Full create/edit/delete with stage management |
| Pipeline Kanban | **DONE** | Native HTML drag-drop (not @dnd-kit) |
| Activities (log, list per contact, global feed) | **DONE** | All types: call/email/note/showing/task |
| Dashboard (metrics, charts, activity feed) | **DONE** | Widgets render with real data; customization mode with layout save/load via API |
| AI Chat Bubble (floating, global) | **DONE** | SSE streaming, tool call indicators, confirmation cards, contact-scoped |
| AI Chat Full Page (`/dashboard/chat`) | **DONE** | Conversation list, delete, rename, streaming |
| AI Tools (34 total: 18 read, 16 write) | **DONE** | All execute against real DB; Gmail tools proxy send via Go |
| AI Profile Generation | **DONE** | Backend endpoint + frontend tab on contact detail |
| Analytics | **DONE** | KPI cards, pipeline/activities/contacts charts, stage detail table |
| Tasks Page | **DONE** | Full-stack with DB columns (due_date, priority, completed_at), API endpoints, and AI tools |
| Workflows Page | **DONE** | Full CRUD + toggle + runs, workflow engine with trigger hooks, template pre-fills |
| Settings Page | **DONE** | Commission + notifications persist to API, pipeline stages from API (read-only), integrations "Coming Soon" |
| Notifications | **DONE** | Real recent activities from API (replaces former hardcoded array) |
| Marketing Pages | **DONE** | Home, about, features, pricing, team, mission |
| Buyer Profile Backend | **DONE** | GET/POST/PATCH endpoints exist, AI tools exist |
| Buyer Profile Frontend | **DONE** | Tab on contact detail page with create/edit forms |
| AI Profile Frontend | **DONE** | Tab on contact detail page with summary + regenerate |
| Semantic Search / Embeddings | **DONE** | OpenAI text-embedding-3-small, auto-embeds contacts/activities, semantic_search AI tool |
| Communication Page | **DONE** | Unified call/email inbox grouped by contact, log call/email modal |
| +New Quick Action | **DONE** | Dropdown in top bar: New Contact, New Deal, Log Activity, New Task |
| Client Portal | **DONE** | Magic-link auth, portal dashboard/deals/properties/timeline, agent portal settings, share modal on contact detail |
| Gmail AI Tools (Phase 3) | **DONE** | search_emails, get_email_thread, draft_email (read), send_email (write/proxy), email context + Gmail status in system prompt, email_sent workflow trigger |

## Database Schema

10 tables in `backend/migrations/001_init.sql`. 5 migrations total:

| Migration | What it does |
|-----------|-------------|
| `001_init.sql` | All 10 tables, RLS policies, indexes, triggers, seed deal stages |
| `002_updates.sql` | `users.dashboard_layout JSONB`, `conversations.contact_id` nullable |
| `003_tool_calls.sql` | `messages.tool_calls JSONB` |
| `004_conversation_title.sql` | `conversations.title TEXT` |
| `005_task_fields.sql` | `activities.due_date DATE`, `activities.priority TEXT`, `activities.completed_at TIMESTAMPTZ` |
| `006_pending_actions.sql` | `pending_actions` table for persisting AI write tool confirmations |
| `007_agent_settings.sql` | `users.settings JSONB` for commission, notification preferences |
| `008_embeddings_unique.sql` | Unique index on `embeddings(source_type, source_id)` for upsert |
| `009_workflows.sql` | `workflows` and `workflow_runs` tables with RLS for automation engine |
| `015_client_portal.sql` | `portal_tokens` and `portal_settings` tables for client portal magic-link auth |

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
| `embeddings` | pgvector semantic search | source_type, source_id, agent_id, content, embedding(1536) |
| `pending_actions` | AI write tool confirmations (10min TTL) | agent_id, tool, input (JSONB), expires_at |
| `workflows` | Automation definitions | agent_id, name, trigger_type, trigger_config (JSONB), steps (JSONB), enabled |
| `workflow_runs` | Execution history | workflow_id, agent_id, status, current_step, step_results (JSONB) |
| `portal_tokens` | Client portal magic links | contact_id, agent_id, token (unique hex), expires_at (30 days), last_used_at |
| `portal_settings` | Portal display settings per agent | agent_id (unique), show_deal_value, show_activities, show_properties, welcome_message, agent_phone, agent_email |

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

### Buyer Profiles
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
GET  /api/contacts/{id}/ai-profile           — get summary
POST /api/contacts/{id}/ai-profile/regenerate — regenerate
```

### Analytics
```
GET /api/analytics/pipeline         — stage counts, values, averages
GET /api/analytics/activities       — activity counts by type
GET /api/analytics/contacts         — source breakdown, new this month
```

### Search
```
POST /api/search                     — semantic vector search ({query, limit?})
```

### Workflows
```
GET    /api/workflows                — list all workflows
POST   /api/workflows                — create workflow
GET    /api/workflows/{id}           — get single workflow
PATCH  /api/workflows/{id}           — update workflow
DELETE /api/workflows/{id}           — delete workflow
POST   /api/workflows/{id}/toggle    — toggle enabled/disabled
GET    /api/workflows/{id}/runs      — list execution history
```

### Client Portal (Agent-Side, behind ClerkAuth)
```
POST   /api/portal/invite/{contact_id}     — generate magic link for a contact
GET    /api/portal/invites                  — list all active portal invites
DELETE /api/portal/invite/{token_id}        — revoke a portal link
GET    /api/portal/settings                 — get portal display settings
PATCH  /api/portal/settings                 — update portal settings
```

### Client Portal (Public, token-based auth)
```
GET    /api/portal/auth/{token}             — validate token, return contact + agent + settings
GET    /api/portal/view/{token}/dashboard   — client dashboard (deals, activities, welcome)
GET    /api/portal/view/{token}/deals       — deals with stage progress
GET    /api/portal/view/{token}/properties  — properties linked to deals
GET    /api/portal/view/{token}/timeline    — activity timeline
```

### Error & Pagination
- Errors: `{"error": "message"}` with status 400/401/403/404/500
- Pagination: `?page=1&limit=25`, response includes `"total"` count

## AI Agent Tools

34 tools total. Most execute directly against the database; `send_email` proxies through Go backend.

### Read Tools (18 — execute immediately)
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
| `semantic_search` | query, limit? | vector similarity search across contacts and activities |
| `search_properties` | query?, status?, property_type?, min_price?, max_price?, bedrooms?, limit? | property listings |
| `get_property` | property_id | full property + linked deals |
| `match_buyer_to_properties` | contact_id | buyer profile + ranked property matches |
| `search_emails` | query?, contact_id?, limit? | emails matching subject/sender/snippet |
| `get_email_thread` | thread_id, limit? | all emails in a Gmail thread |
| `draft_email` | to, context, subject?, contact_id? | AI-generated email draft {to, subject, body} |

### Write Tools (16 — require user confirmation)
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
| `create_property` | address | optional: city, state, zip, price, bedrooms, etc. |
| `update_property` | property_id | optional: any property field |
| `delete_property` | property_id | unlinks deals (sets property_id NULL) |
| `send_email` | to, subject, body | proxied via Go → Gmail API; optional: cc |

### Pending Actions
Write tools persist a pending action row in `pending_actions` table. When a write tool is called, it queues a confirmation and sends a `confirmation` SSE event to the frontend. User clicks Confirm → `POST /ai/confirm` → action executes.

Pending actions are persisted in PostgreSQL (`pending_actions` table) with a 10-minute TTL. Expired actions are cleaned up on service startup.

### Agent Loop
- Max 5 tool rounds per message (safety limit in `agent.py`)
- Last 20 messages loaded as conversation context
- Contact-scoped conversations pre-load contact details + buyer profile + recent activities + recent emails into system prompt
- Gmail connection status injected into system prompt (connected/disconnected + last sync time)

### Workflow Automation
Workflows are event-driven automations: trigger → steps → done. Supported triggers: `contact_created`, `deal_stage_changed`, `activity_logged`, `email_sent`, `manual`. Step types: `create_task`, `log_activity`, `wait` (delay), `update_deal`, `ai_message`. After write tool confirmation, matching workflows fire in the background via `asyncio.create_task`. The engine lives in `ai-service/app/services/workflow_engine.py`.

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
│   │   │       ├── settings/page.tsx             # PARTIAL — stages from API, commission localStorage, rest "Coming Soon"
│   │   │       └── workflows/page.tsx            # STUB — honest "Coming Soon" with template previews
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
│   │   │   ├── api/settings.ts                   # Settings API functions
│   │   │   ├── api/workflows.ts                  # Workflow CRUD API functions
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
│   │   ├── handlers/                             # 14 handler files (contacts, deals, workflows, etc.)
│   │   └── middleware/                            # auth.go, cors.go, user_sync.go
│   ├── migrations/                               # 001-009 SQL files
│   └── go.mod
│
├── ai-service/
│   ├── app/
│   │   ├── main.py                               # FastAPI app
│   │   ├── config.py                             # Env vars
│   │   ├── database.py                           # psycopg2 pool + async wrapper
│   │   ├── tools.py                              # 24 tools + pending_actions + workflow triggers
│   │   ├── routes/chat.py                        # POST /ai/messages, /ai/confirm
│   │   ├── routes/profiles.py                    # POST /ai/profiles/generate
│   │   ├── routes/search.py                      # POST /ai/search (semantic)
│   │   ├── routes/workflows.py                   # POST /ai/workflows/trigger
│   │   ├── routes/health.py                      # GET /health
│   │   ├── services/agent.py                     # Agentic loop, Claude integration
│   │   ├── services/embeddings.py                # OpenAI embedding generation + pgvector search
│   │   └── services/workflow_engine.py            # Trigger matching + step execution
│   └── requirements.txt
│
├── docker-compose.yml
└── CLAUDE.md
```

## Path Forward — Functional Priorities

Focus: **make implementations work** before any design polish.

### Phase A: Wire Up Existing Backend to Frontend
No new backend code needed — these endpoints already exist.

1. ~~**Buyer Profile tab**~~ — **DONE** (commit `48708b7`)
2. ~~**AI Profile tab**~~ — **DONE** (commit `48708b7`)
3. ~~**Dashboard widget customization**~~ — **DONE** (commit `0f9d9d5`)
4. ~~**Analytics page**~~ — **DONE** (commit `48708b7`, fixed double `/api` prefix bug)

### Phase B: Replace Stubs with Real Implementations
1. ~~**Tasks page**~~ — **DONE** (commit `f923cf8`)
2. ~~**Notifications**~~ — **DONE** (commit `48708b7`, real activities from API, no backend notification system yet)
3. **Settings page** — partially done: pipeline stages read from API, commission saves to localStorage. Still needs: backend persistence for commission, notification preferences

### Phase C: Missing Features
1. **Semantic search** — generate embeddings on contact/activity creation, wire up search endpoint
2. **Communication page** — email/call integration hub
3. **+New quick action** button in top bar

### Phase D: Robustness
1. ~~Persist `pending_actions` to DB instead of in-memory dict~~ — **DONE** (migration `006_pending_actions.sql`)
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

## Design & Build Tool Routing

<!-- Last reviewed: 2026-03-17 -->

When working on frontend UI, use the correct specialized tool based on file path and task type. Rules are evaluated top to bottom; first match wins.

### Tool Inventory

| Tool | Role | Domain |
|------|------|--------|
| `frontend-design` | Orchestrator | Dashboard/app UI: `dashboard/**`, `components/shared/**`, auth pages |
| `ui-ux-pro-max` | Orchestrator | Landing/marketing: `(marketing)/**`, root `page.tsx`, `components/marketing/**` |
| Stitch | Specialist | New reusable components, design system elements, pure styling (any domain) |
| Gemini (nano banana 2) | Specialist | Image asset generation (any context) |
| 21st.dev | Specialist | 3D/interactive components (marketing pages ONLY) |

### Routing Rules

1. **Image needed** → **Gemini** — then continue with the appropriate page tool to integrate
2. **3D/interactive element + marketing page** → **21st.dev** — ONLY in `(marketing)/**` or root `page.tsx`
3. **New reusable component (any domain)** → **Stitch** — output to `components/shared/` or `components/ui/`
4. **Styling-only change (any domain)** → **Stitch** — colors, spacing, typography, animations only; NOT data/logic work
5. **Marketing/landing page work** → **ui-ux-pro-max** — may delegate to Stitch for sub-components
6. **Dashboard/app UI work** → **frontend-design** — follow `.claude/agents/frontend-page.md` conventions; may delegate to Stitch
7. **Ambiguous** → ask the user

### Multi-Tool Tasks

When a task requires multiple tools, execute in this order:
1. Assets first (Gemini for images)
2. 3D components second (21st.dev)
3. Reusable components third (Stitch)
4. Page assembly last (ui-ux-pro-max or frontend-design)

### Hard Constraints

- **21st.dev is NEVER used in dashboard pages.** CRM workspace needs clean, fast UI.
- **All tool output MUST use Tailwind CSS** conforming to the Frontend Patterns section below.
- **Stitch components go in `components/shared/` or `components/ui/`**, never inline in page files.
- **Design tools are NOT invoked for backend, AI service, or pure logic changes.**

### Excluded Paths

These paths NEVER trigger a design tool — they are logic/backend only:
- `backend/`
- `ai-service/`
- `frontend/src/lib/api/`
- `frontend/src/store/`
- `frontend/src/middleware.ts`

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

<!-- GSD:project-start source:PROJECT.md -->
## Project

**CloAgent — Tool Routing Configuration**

A CLAUDE.md configuration update for CloAgent that maps specific development tasks to the correct AI tools and skills. This ensures Claude Code automatically uses the right skill/tool depending on what's being built — frontend components, landing pages, images, 3D elements, or design work.

**Core Value:** Claude Code should always use the most appropriate specialized tool for each task type, without the developer needing to manually invoke skills every time.

### Constraints

- **File**: Must be CLAUDE.md additions (not a separate file)
- **Scope**: Tool routing rules only — no changes to application code
- **3D scope**: 21st.dev 3D components are landing page only, never in dashboard
- **Stitch scope**: Used for any frontend styling work and new component creation
- **Gemini scope**: Used whenever any image asset is needed anywhere in the project
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Overview
## Frontend
### Framework & Core Dependencies
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `next` | 14.2.35 | `frontend/package.json:44` | React framework & SSR |
| `react` | ^18 | `frontend/package.json:45` | UI library |
| `react-dom` | ^18 | `frontend/package.json:47` | React rendering engine |
| `typescript` | ^5 | `frontend/package.json:68` | Type safety |
### Authentication & Authorization
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `@clerk/nextjs` | ^5.7.5 | `frontend/package.json:13` | User auth, session management, JWT tokens |
- `frontend/src/middleware.ts` — Clerk middleware for route protection (public/auth/protected routes)
- `frontend/.env.local.example` — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Uses `useAuth()` hook to retrieve bearer tokens for API requests via `getToken()`
### State Management & Data Fetching
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `@tanstack/react-query` | ^5.90.21 | `frontend/package.json:36` | Server state, caching, sync |
| `zustand` | ^5.0.11 | `frontend/package.json:55` | UI state (sidebar, chat bubble) |
| `react-hook-form` | ^7.71.2 | `frontend/package.json:48` | Form state & validation |
| `@hookform/resolvers` | ^5.2.2 | `frontend/package.json:17` | Form validation bridge |
| `zod` | ^4.3.6 | `frontend/package.json:54` | Schema validation |
### UI & Styling
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `tailwindcss` | ^3.4.1 | `frontend/package.json:67` | Utility-first CSS framework |
| `postcss` | ^8 | `frontend/package.json:64` | CSS processing |
| `autoprefixer` | ^10.4.27 | `frontend/package.json:61` | CSS vendor prefixes |
| `lucide-react` | ^0.577.0 | `frontend/package.json:43` | Icon library |
| `recharts` | ^3.8.0 | `frontend/package.json:50` | Charts & graphs |
| `framer-motion` | ^11.18.2 | `frontend/package.json:42` | Animation library |
| `@react-spring/web` | ^10.0.3 | `frontend/package.json:35` | Physics-based animations |
| `react-parallax-tilt` | ^1.7.320 | `frontend/package.json:49` | 3D tilt effect |
| `cobe` | ^0.6.5 | `frontend/package.json:40` | 3D globe visualization |
| `tailwind-merge` | ^3.5.0 | `frontend/package.json:52` | Merge Tailwind class names |
| `class-variance-authority` | ^0.7.1 | `frontend/package.json:37` | Component variant patterns |
| `clsx` | ^2.1.1 | `frontend/package.json:38` | Conditional classnames |
| `date-fns` | ^4.1.0 | `frontend/package.json:41` | Date manipulation |
| `shadcn` | ^4.0.2 | `frontend/package.json:51` | Component CLI (minimal use) |
### UI Component Libraries
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `@radix-ui/react-*` | ~^1.x | `frontend/package.json:18-34` | Unstyled, accessible primitives (avatar, checkbox, dialog, dropdown, label, popover, progress, radio, scroll-area, select, separator, slider, slot, switch, tabs, toast, tooltip) |
| `@base-ui/react` | ^1.2.0 | `frontend/package.json:12` | Additional base UI primitives |
| `cmdk` | ^1.1.1 | `frontend/package.json:39` | Command palette |
| `react-day-picker` | ^9.14.0 | `frontend/package.json:46` | Date picker |
### Drag & Drop
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `@dnd-kit/core` | ^6.3.1 | `frontend/package.json:14` | Drag-drop engine (installed but not used; native HTML drag-drop in use) |
| `@dnd-kit/sortable` | ^10.0.0 | `frontend/package.json:15` | Sortable lists (installed but not used) |
| `@dnd-kit/utilities` | ^3.2.2 | `frontend/package.json:16` | DnD utilities (installed but not used) |
### Build & Development Tools
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `eslint` | ^8 | `frontend/package.json:62` | Linting |
| `eslint-config-next` | 14.2.35 | `frontend/package.json:63` | Next.js ESLint config |
| `prettier` | ^3.8.1 | `frontend/package.json:65` | Code formatting |
| `prettier-plugin-tailwindcss` | ^0.7.2 | `frontend/package.json:66` | Tailwind class sorting |
| `@types/node` | ^20 | `frontend/package.json:58` | Node.js type definitions |
| `@types/react` | ^18 | `frontend/package.json:59` | React type definitions |
| `@types/react-dom` | ^18 | `frontend/package.json:60` | React DOM type definitions |
### Configuration Files
| File | Purpose |
|------|---------|
| `frontend/tsconfig.json` | TypeScript compiler options, path aliases (`@/*` → `src/*`) |
| `frontend/next.config.mjs` | Next.js config; standalone output in production |
| `frontend/tailwind.config.ts` | Tailwind CSS customization (colors, animations, keyframes) |
| `frontend/postcss.config.mjs` | PostCSS plugins (Tailwind, Autoprefixer) |
| `frontend/.prettierrc` | Prettier config (semi: true, singleQuote: false, tailwindcss plugin) |
| `frontend/package.json` | Scripts: `dev`, `build`, `start`, `lint` |
## Backend
### Core Dependencies
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `go` | 1.24.0 | `backend/go.mod:3` | Language & runtime |
| `github.com/go-chi/chi/v5` | v5.2.5 | `backend/go.mod:7` | HTTP router & middleware |
| `github.com/jackc/pgx/v5` | v5.8.0 | `backend/go.mod:8` | PostgreSQL driver (connection pool) |
| `github.com/clerkinc/clerk-sdk-go` | v1.49.1 | `backend/go.mod:6` | Clerk JWT validation & user sync |
| `github.com/rs/cors` | v1.11.1 | `backend/go.mod:9` | CORS middleware |
### Indirect Dependencies (transitive)
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `github.com/go-jose/go-jose/v3` | v3.0.0 | `backend/go.mod:13` | JWT parsing (via Clerk SDK) |
| `github.com/jackc/pgpassfile` | v1.0.0 | `backend/go.mod:14` | PostgreSQL password file support |
| `github.com/jackc/pgservicefile` | v0.0.0-20240606120523-5a60cdf6a761 | `backend/go.mod:15` | PostgreSQL service file support |
| `github.com/jackc/puddle/v2` | v2.2.2 | `backend/go.mod:16` | Connection pool queue |
| `golang.org/x/crypto` | v0.1.0 | `backend/go.mod:17` | Cryptographic utilities |
| `golang.org/x/sync` | v0.17.0 | `backend/go.mod:18` | Synchronization primitives |
| `golang.org/x/text` | v0.29.0 | `backend/go.mod:19` | Text processing |
### Configuration & Startup
| File | Purpose |
|------|---------|
| `backend/internal/config/config.go` | Load env vars: `DATABASE_URL`, `CLERK_SECRET_KEY`, `REDIS_URL`, `PORT`, `AI_SERVICE_URL`, `AI_SERVICE_SECRET` |
| `backend/internal/database/postgres.go` | PGX connection pool setup (25 max, 5 min, 30min lifetime, 5min idle timeout, 1min health check) |
| `backend/internal/database/rls.go` | Row-level security transaction helper |
| `backend/internal/middleware/auth.go` | Clerk JWT bearer token validation |
| `backend/cmd/api/main.go` | Router setup, middleware stack, route registration |
### Middleware Stack
### HTTP Server Configuration
- Read timeout: 15s
- Write timeout: 30s
- Idle timeout: 60s
## AI Service
### Core Dependencies
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `python` | 3.11 | `ai-service/Dockerfile:2` | Language & runtime |
| `fastapi` | ==0.135.1 | `ai-service/requirements.txt:11` | Web framework & routing |
| `uvicorn` | ==0.41.0 | `ai-service/requirements.txt:42` | ASGI server |
### AI & LLM Integration
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `anthropic` | ==0.84.0 | `ai-service/requirements.txt:3` | Claude API client (Haiku 4.5) |
| `openai` | ==2.26.0 | `ai-service/requirements.txt:20` | OpenAI API client (configured but unused) |
### Database
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `psycopg2-binary` | ==2.9.11 | `ai-service/requirements.txt:25` | PostgreSQL driver (sync) |
| `pgvector` | ==0.4.2 | `ai-service/requirements.txt:24` | pgvector client for embeddings |
### HTTP & Async
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `httpx` | ==0.28.1 | `ai-service/requirements.txt:14` | Async HTTP client |
| `httpcore` | ==1.0.9 | `ai-service/requirements.txt:13` | HTTP transport layer |
| `h11` | ==0.16.0 | `ai-service/requirements.txt:12` | HTTP/1.1 state machine |
| `requests` | ==2.32.5 | `ai-service/requirements.txt:31` | Sync HTTP client (used for backend proxy) |
| `requests-toolbelt` | ==1.0.0 | `ai-service/requirements.txt:32` | Multipart form data |
### Data Validation & Serialization
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `pydantic` | ==2.12.5 | `ai-service/requirements.txt:26` | Data validation & parsing |
| `pydantic_core` | ==2.41.5 | `ai-service/requirements.txt:27` | Pydantic runtime |
| `annotated-types` | ==0.7.0 | `ai-service/requirements.txt:2` | Type annotations |
| `annotated-doc` | ==0.0.4 | `ai-service/requirements.txt:1` | Annotation documentation |
| `orjson` | ==3.11.7 | `ai-service/requirements.txt:21` | Fast JSON serialization |
| `ormsgpack` | ==1.12.2 | `ai-service/requirements.txt:22` | MessagePack serialization |
| `json` | (stdlib) | — | JSON handling |
### Utilities
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `python-dotenv` | ==1.2.2 | `ai-service/requirements.txt:28` | Load `.env` files |
| `click` | ==8.3.1 | `ai-service/requirements.txt:7` | CLI utilities |
| `tenacity` | ==9.1.4 | `ai-service/requirements.txt:35` | Retry logic |
| `tqdm` | ==4.67.3 | `ai-service/requirements.txt:37` | Progress bars |
| `docstring_parser` | ==0.17.0 | `ai-service/requirements.txt:10` | Parse docstrings |
### Type & Encoding
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `typing-extensions` | ==4.15.0 | `ai-service/requirements.txt:39` | Extended type hints |
| `typing-inspection` | ==0.4.2 | `ai-service/requirements.txt:38` | Type introspection |
| `regex` | ==2026.2.28 | `ai-service/requirements.txt:30` | Advanced regex |
| `tiktoken` | ==0.12.0 | `ai-service/requirements.txt:36` | Token counting (OpenAI) |
| `PyYAML` | ==6.0.3 | `ai-service/requirements.txt:29` | YAML parsing |
### Async & Concurrency
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `anyio` | ==4.12.1 | `ai-service/requirements.txt:4` | Async I/O abstraction |
| `sniffio` | ==1.3.1 | `ai-service/requirements.txt:33` | Async library detection |
### Packaging & Distribution
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `packaging` | ==26.0 | `ai-service/requirements.txt:23` | Package utilities |
| `setuptools` | (implicit) | — | Package distribution |
### Environment & System
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `certifi` | ==2026.2.25 | `ai-service/requirements.txt:5` | CA certificates |
| `charset-normalizer` | ==3.4.5 | `ai-service/requirements.txt:6` | Character encoding detection |
| `distro` | ==1.9.0 | `ai-service/requirements.txt:9` | Linux distribution detection |
| `idna` | ==3.11 | `ai-service/requirements.txt:15` | IDNA encoding (domain names) |
| `urllib3` | ==2.6.3 | `ai-service/requirements.txt:40` | HTTP client utilities |
| `jiter` | ==0.13.0 | `ai-service/requirements.txt:16` | Fast JSON iterator |
| `jsonpatch` | ==1.33 | `ai-service/requirements.txt:17` | JSON patch operations |
| `jsonpointer` | ==3.0.0 | `ai-service/requirements.txt:18` | JSON pointer RFC 6901 |
### Numerical & Data Processing
| Package | Version | File | Purpose |
|---------|---------|------|---------|
| `numpy` | ==2.4.3 | `ai-service/requirements.txt:19` | Numerical computing |
| `uuid_utils` | ==0.14.1 | `ai-service/requirements.txt:41` | UUID utilities |
| `zstandard` | ==0.25.0 | `ai-service/requirements.txt:44` | Zstandard compression |
| `xxhash` | ==3.6.0 | `ai-service/requirements.txt:43` | Fast hashing |
### Configuration
| File | Purpose |
|------|---------|
| `ai-service/app/config.py` | Load env vars: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default: Haiku 4.5), `OPENAI_API_KEY`, `DATABASE_URL`, `AI_SERVICE_SECRET`, `BACKEND_URL` |
| `ai-service/app/database.py` | psycopg2 thread pool (1-10 connections); async wrapper via `asyncio.to_thread` |
| `ai-service/app/main.py` | FastAPI app with routers: health, chat, profiles |
## Database
### Database Setup
| File | Migration | Purpose |
|------|-----------|---------|
| `backend/migrations/001_init.sql` | Schema v1 | 10 tables, RLS policies, indexes, triggers, seed deal stages (7 stages: Lead, Contacted, Touring, Offer, Under Contract, Closed, Lost) |
| `backend/migrations/002_updates.sql` | Schema v2 | Add `users.dashboard_layout JSONB`, `conversations.contact_id (nullable)` |
| `backend/migrations/003_tool_calls.sql` | Schema v3 | Add `messages.tool_calls JSONB` |
| `backend/migrations/004_conversation_title.sql` | Schema v4 | Add `conversations.title TEXT` |
| `backend/migrations/005_task_fields.sql` | Schema v5 | Add `activities.due_date DATE`, `activities.priority TEXT`, `activities.completed_at TIMESTAMPTZ` |
### Tables
| Table | Purpose | Key Features |
|-------|---------|-------------|
| `users` | Agent accounts (Clerk-mapped) | id (UUID), clerk_id, email, name, dashboard_layout (JSONB), RLS-protected |
| `contacts` | Leads/clients | id, agent_id (FK), first_name, last_name, email, phone, source, RLS-protected |
| `buyer_profiles` | Buyer preferences (1:1 contact) | contact_id (UNIQUE), budget_min/max, bedrooms, bathrooms, locations[], must_haves[], deal_breakers[], property_type, pre_approved, timeline |
| `deal_stages` | Pipeline columns (7 seeded) | name, position, color — deterministic names |
| `deals` | Pipeline cards | contact_id, agent_id, stage_id, title, value, notes, RLS-protected |
| `activities` | Calls, emails, notes, showings, tasks | contact_id, deal_id (optional), agent_id, type, body, due_date, priority, completed_at, RLS-protected |
| `conversations` | AI chat threads | contact_id (nullable), agent_id, title, RLS-protected |
| `messages` | Messages in conversations | conversation_id, role (user/assistant/system), content, tool_calls (JSONB) |
| `ai_profiles` | AI-generated summaries | contact_id (UNIQUE), summary |
| `embeddings` | pgvector semantic search | source_type, source_id, agent_id, content, embedding(1536), **unused** |
### Indexes & Constraints
- Primary keys on all tables
- Foreign key constraints with cascade deletes where appropriate
- Indexes on frequently-queried columns (agent_id, contact_id, deal_id, conversation_id)
- UNIQUE constraints on (contact_id) for buyer_profiles, ai_profiles
- RLS policies per agent for all agent-scoped tables
### Authentication within Database
## Cache & Message Queue
## Container Orchestration
### Container Services
| Service | Image/Build | Port | Dependencies | Health Check |
|---------|------------|------|--------------|--------------|
| `postgres` | `pgvector/pgvector:pg15` | 5432 | — | `pg_isready` |
| `redis` | `redis:7-alpine` | 6379 | — | `redis-cli ping` |
| `backend` | `./backend` (Go binary) | 8080 | postgres (healthy), redis (healthy) | — |
| `ai-service` | `./ai-service` (Python) | 8000 | postgres (healthy) | — |
| `frontend` | `./frontend` (Node.js) | 3000 | backend, ai-service | — |
### Build Strategy
- **Backend**: Multi-stage (build: Go 1.24 on Alpine; runtime: Alpine 3.19 with ca-certificates, tzdata)
- **AI Service**: Multi-stage (build: Python 3.11-slim; runtime: Python 3.11-slim with pre-installed packages)
- **Frontend**: Build-time args for Clerk keys; Next.js standalone output in production
## Environment Configuration
### Root `.env` File
### Backend `.env`
### Frontend `.env.local`
### AI Service `.env`
## Build & Development Scripts
### Frontend
### Backend
### AI Service
### Local Development (via Docker Compose)
## Monitoring & Logging
### Backend
- JSON structured logging via `log/slog` with `JSONHandler`
- Log level: `LevelInfo` by default
### AI Service
- Uvicorn access logs via stdout
- No explicit custom logging configured
### Frontend
- Browser console logging
- TanStack Query logs (development mode)
## Summary Table
| Layer | Technology | Version | Status |
|-------|-----------|---------|--------|
| **Frontend** | Next.js | 14.2.35 | Production-ready |
| **Backend** | Go + Chi | 1.24 + v5.2.5 | Production-ready |
| **AI** | FastAPI + Claude API | 0.135.1 + Anthropic 0.84.0 | Production-ready |
| **Database** | PostgreSQL + pgvector | 15 + 0.4.2 | Production-ready |
| **Cache** | Redis | 7-alpine | Configured, unused |
| **Auth** | Clerk | @clerk/nextjs v5.7.5 | Production-ready |
| **Deployment** | Docker + Docker Compose | Latest | Production-ready |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Overview
## Go Backend
### File Organization
- **Entry point**: `backend/cmd/api/main.go`
- **Packages**:
### Handler Pattern (Factory)
### Database Transaction Pattern
- `BeginWithRLS()` starts a transaction and sets the RLS context (`app.current_agent_id`)
- All queries execute within the transaction with row-level security active
- Explicit defer + Rollback pattern (even though Commit happens in success path)
### Response Helpers
- No explicit error wrapping beyond the HTTP response
- Error messages are human-readable strings
- Status codes match HTTP semantics (201 Created, 204 No Content, 404 Not Found, etc.)
### URL Parameter Extraction
### Query Parameter Parsing
- `Get()` returns empty string if not present
- Silent type coercion with blank `_` for errors; validation applied to parsed values
- Pagination: page/limit defaults applied if missing or invalid
### Dynamic SQL Building
- Manual SQL concatenation with parameterized placeholders (`$1`, `$2`, etc.)
- `args` slice holds parameter values in order
- Parameter count tracked by `len(args)` for correct `$N` numbering
### Struct Tags for JSON
- Explicit `json:""` tags for all exported fields
- snake_case keys (database convention matches JSON convention)
- Nullable fields use pointers (`*string`, `*float64`)
### Middleware Composition
- Global middleware applied before route definition
- Protected routes grouped with auth + user sync middleware
- No middleware per-handler; all protection is group-based
### Context Keys Pattern
- Private `contextKey` type prevents key collisions across packages
- Getter function returns empty string on missing key (no error)
### Import Organization
- Grouped: stdlib, third-party, local packages
- Alphabetical within each group
- No blank lines within groups; blank lines between groups
## TypeScript/Next.js Frontend
### File Organization
- **Routes**: `src/app/` (Next.js 14 App Router)
- **Components**: `src/components/` — Shared UI components, organized by category (shared/, marketing/, ui/)
- **API layer**: `src/lib/api/` — One file per domain (contacts.ts, deals.ts, conversations.ts, etc.)
- **State**: `src/store/ui-store.ts` — Zustand store
- **Utilities**: `src/lib/utils.ts`
### "use client" Directive
- Any page with hooks (useState, useQuery, etc.)
- Any component using browser APIs
- Exported from non-app components
### API Client Pattern
- Generic `<T>` for response typing
- All API functions call `apiRequest()` with path, token, and options
- Bearer token passed via Authorization header (from Clerk `getToken()`)
- Error handling: non-2xx raises error immediately
- 204 No Content returns empty object
### API Module Pattern
- Interfaces exported (no namespace)
- Functions per HTTP operation (list, get, create, update, delete)
- URL query strings built with `URLSearchParams`
- Request bodies typed (e.g., `CreateContactBody`, `UpdateContactBody`)
### Data Fetching with TanStack Query
- No custom hook wrapper files
- `queryKey` is array (enables cache invalidation by key)
- `getToken()` from `@clerk/nextjs` called inside `queryFn`
- Non-null assertion (`!`) on token (assumes auth guard)
### State Management
- Single store file (`ui-store.ts`)
- Type-safe getters and setters
- Minimal logic (state updates only, no side effects)
- Zod for validation schemas (imported from elsewhere, not colocated)
### Component Structure
- Hooks called at the top
- `useRouter()`, `useAuth()`, `useQueryClient()` from Next.js/Clerk
- Local state (useState) before queries
- JSX at the bottom
### Styling
- Classes inline in JSX
- Responsive utilities: `md:`, `lg:`, `xl:`
- No CSS files
- Colors: design tokens passed as classes (e.g., `bg-blue-500`)
### TypeScript Types
- Exported types from API modules (interfaces, not types)
- Inline for local state (if not shared)
- snake_case in API responses (database convention), camelCase in frontend logic where needed
- Nullable fields: `string | null`, not `?string`
### Import Organization
- React/Next.js hooks
- Third-party (lucide-react, etc.)
- Relative to src with `@/` alias
- Type-only imports: `import type { Type }`
- Grouped logically; no strict alphabetical order
### Path Alias
- Used everywhere: `@/lib/api`, `@/components`, `@/store`
## Python AI Service
### File Organization
- **Entry point**: `ai-service/app/main.py`
- **Routes**: `app/routes/` — FastAPI routers (chat.py, profiles.py, health.py)
- **Services**: `app/services/` — Business logic (agent.py)
- **Tools**: `app/tools.py` — Tool definitions and execution
- **Database**: `app/database.py` — Connection pool & helpers
- **Config**: `app/config.py` — Environment variables
### Main App Structure
- Routers included at the top level
- Prefix applied per router (e.g., `/ai`)
### Request/Response Models
- snake_case field names
- Required fields on top, optional below
- Inline docstrings on endpoints, not on model classes
### Auth Dependency
- Custom dependency for secret verification
- Applied via `dependencies=[Depends(...)]` on route
- Explicit HTTP exception with status and detail
### Streaming Response Pattern
- Async generator for streaming
- Explicit media type and cache headers
- Server-Sent Events (SSE) format
### Tool Definition Format
- Read tools (no required inputs) and write tools (query-able) defined in single TOOL_DEFINITIONS list
- Descriptions serve as inline documentation
- Properties describe each input parameter
### Database Connection Pattern
- Thread-safe psycopg2 pool (1-10 connections)
- Context manager for connection borrow/return
- Async wrapper via `asyncio.to_thread()` to avoid blocking
- Commit on success, rollback on exception
### Query Execution Pattern
- `RealDictCursor` for dict-like row access
- Parameterized queries with `%s` placeholders
- `fetchall()` for list results, `fetchone()` for single
- List comprehensions to transform rows
### Pending Actions Store
- In-memory dict with UUID keys
- Used to store pending confirmations
- **Not persistent** (lost on restart); single-process only
### System Prompt Building
- Conditionally include contact context (if conversation is contact-scoped)
- Multi-line string built from list of lines
- Agent name and contact details injected
### Claude API Integration
- `Anthropic()` client initialized once
- `tools` parameter passes Anthropic schema format
- `system` parameter for system prompt
- `messages` list includes conversation history
### Import Organization
- Docstring at top
- stdlib (asyncio, json, typing, etc.)
- Third-party (anthropic, psycopg2, fastapi, etc.)
- Local (from app...)
- Alphabetical within each group
### Error Handling
- FastAPI `HTTPException` for HTTP errors
- `status_code` and `detail` parameters
- Errors logged by FastAPI (no explicit logging in handlers)
## Cross-Service Patterns
### Naming Conventions
| Layer | Convention | Example |
|-------|-----------|---------|
| Database columns | snake_case | `first_name`, `created_at` |
| API JSON fields | snake_case | `"first_name": "John"` |
| Go variables | camelCase | `agentID`, `contactName` |
| Go functions | PascalCase | `ListContacts()`, `BeginWithRLS()` |
| Go constants | ALL_CAPS | `UserIDKey` |
| TypeScript variables | camelCase | `firstName`, `chatOpen` |
| TypeScript types | PascalCase | `Contact`, `ChatMessage` |
| Python variables | snake_case | `agent_id`, `conversation_id` |
| Python functions | snake_case | `load_history()`, `queue_write_tool()` |
| Python classes | PascalCase | `SendMessageRequest`, `SSEEvent` |
### Error Handling Philosophy
- **Go**: Silent failures with generic "database error" messages; no error wrapping
- **TypeScript**: Errors thrown from apiRequest; caught and logged at page level
- **Python**: FastAPI HTTPException with status codes; unhandled exceptions return 500
### Authentication & Authorization
- **Frontend**: Clerk session tokens via `getToken()`
- **Backend**: JWT validation via Clerk SDK; user sync on first request; RLS policies per agent
- **AI Service**: Shared secret (`X-AI-Service-Secret` header) for backend→AI communication
### Logging
- **Go**: `slog` (structured JSON logging), calls to `slog.Info()` / `slog.Error()`
- **TypeScript**: Console errors (no structured logging)
- **Python**: FastAPI middleware logs requests; no explicit logging in business logic
## Editor & Linting Configuration
### TypeScript
- **tsconfig.json**: `strict: true`, `noEmit: true`, `skipLibCheck: true`
- **ESLint**: `next/core-web-vitals` + `next/typescript` preset, custom rule for unescaped entities
### Go
- No explicit linter configuration in repo
- Standard Go formatting (go fmt)
- No golangci-lint config
### Python
- No explicit linter configuration
- Standard Python style (PEP 8 implied, not enforced)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```
```
## Layer Architecture
### 1. Frontend Layer (Next.js 14, TypeScript)
```typescript
```
- User authentication via Clerk (sign-in, sign-up, SSO callbacks)
- Marketing pages (home, about, features, pricing, team, mission)
- Protected dashboard routes with layout
- Real-time data synchronization via TanStack Query
- AI chat bubble (floating) + full-page chat
- Form handling with react-hook-form + Zod (forms only, no validation wrappers)
- `src/app/dashboard/` — Protected routes (contacts, pipeline, tasks, analytics, chat, etc.)
- `src/components/shared/` — AIChatBubble (floating), providers
- `src/lib/api/` — 8 API client modules + base client with Bearer token auth
- `src/store/ui-store.ts` — Zustand store (sidebar state, chat bubble visibility)
- `src/components/ui/` — shadcn components (card, button, dialog, etc.)
- Middleware routes: redirects unauthenticated users to sign-in
- Protected routes require valid Clerk session
- All API requests include `Authorization: Bearer {token}`
### 2. Backend Layer (Go, Chi v5 router)
```
```
```go
```
- **RLS Transaction (database/rls.go):** `BeginWithRLS(ctx, pool, agentID)`
- **Context Extraction (middleware/auth.go):** `AgentUUIDFromContext(ctx)`
- **Response Helpers (handlers/helpers.go):**
### 3. AI Service Layer (FastAPI / Python)
- `GET /health` — Service health check
- `POST /api/messages` — Send message (stream SSE response)
- `POST /api/confirm` — Confirm pending write action
- `POST /api/profiles/generate` — Generate AI profile for contact
```
```
```
```
### 4. Database Layer (PostgreSQL 15 + pgvector)
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
```sql
```
- All agent-scoped tables have RLS enabled
- Every transaction sets `SET LOCAL app.current_agent_id = '<uuid>'`
- Queries automatically filtered to authenticated agent
- RLS prevents cross-agent data leakage
## Data Flow Patterns
### Authentication Flow
```
```
### Contact CRUD Flow
```
```
### AI Chat Flow
```
```
### Dashboard Layout Customization Flow
```
```
## Middleware Chain Detailed
### Global Middleware (applied to all routes)
```go
```
### Protected Route Middleware (applied to `/api` group)
```go
```
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
```
### Backend
```go
```
### AI Service
```python
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
```yaml
```
- Backend: Dockerfile in `backend/` (Go binary, minimal image)
- AI Service: Dockerfile in `ai-service/` (Python + FastAPI)
- Frontend: Dockerfile in `frontend/` (Node build → Next.js server)
## Extending the Architecture
### Adding a New Endpoint
### Adding a New AI Tool
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
