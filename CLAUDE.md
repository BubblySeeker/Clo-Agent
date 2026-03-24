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
| Referral Network | **DONE** | Force-directed graph visualization, referral CRUD, stats panel, top referrers, search/filter |

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

### Referrals
```
GET    /api/referrals              — list all referral relationships (includes contact names)
POST   /api/referrals              — create referral link {referrer_id, referred_id, notes?}
DELETE /api/referrals/{id}         — remove referral link
GET    /api/referrals/network      — get full network graph data (nodes + edges for visualization)
GET    /api/referrals/stats        — top referrers, referral counts, conversion rates
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

**AI Contact Intelligence**

A focused improvement to CloAgent's AI assistant that makes it smarter about finding, resolving, and reasoning about contacts. Currently the AI fails on basic contact operations — it can't split "Rohan Batre" into first/last name for search, can't find "my last contact," and returns empty results for partial name lookups like "email Rohan." This milestone fixes the AI's contact resolution so it behaves like a competent human assistant.

**Core Value:** When a user references a contact by any natural description (name, partial name, recency, relationship), the AI finds the right contact and acts on it — every time.

### Constraints

- **Model**: Claude Haiku 4.5 — must work within this model's capabilities (can't rely on stronger reasoning)
- **Tool rounds**: Max 5 per message — contact resolution may consume 1-2 rounds, leaving 3-4 for actual work
- **Backward compatible**: Changes must not break existing working AI interactions (deals, tasks, activities)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.x - Frontend (Next.js), type safety in all client code
- Go 1.25.0 - Backend API server, chi router, pgx driver
- Python 3.11 - AI Service, FastAPI, Claude API integration, embeddings
- SQL - PostgreSQL migrations and queries (15 migrations total across schema changes)
- JavaScript - Node.js build tooling, build scripts
## Runtime
- Node.js 20 (Alpine) - Frontend development and production
- Go 1.25.0 (Alpine) - Backend compilation and runtime
- Python 3.11-slim - AI service runtime
- PostgreSQL 15 - Primary data store with pgvector extension
- Redis 7-alpine - Configured but unused
- npm - Frontend dependencies (package.json, package-lock.json)
- go mod - Backend dependencies (go.mod, go.sum)
- pip - AI service dependencies (requirements.txt)
## Frameworks
- Next.js 14.2.35 - Frontend framework, App Router, SSR, static generation
- Chi v5.2.5 - Go HTTP router and middleware
- FastAPI 0.135.1 - AI service REST API framework
- React 18.x - UI library (frontend)
- No testing framework detected in monorepo (not applicable for current focus)
- Uvicorn 0.41.0 - Python ASGI server for AI service
- TypeScript compiler 5.x - Type checking
- ESLint 8.x - Frontend linting (Next.js config preset)
- Prettier 3.8.1 - Frontend code formatting with Tailwind plugin
## Key Dependencies
- `@clerk/nextjs` 5.7.5 - User authentication, JWT token management, session handling
- `@tanstack/react-query` 5.90.21 - Server state management, caching, data sync
- `zustand` 5.0.11 - UI state management (sidebar, chat bubble visibility)
- `react-hook-form` 7.71.2 - Form state and validation
- `zod` 4.3.6 - Schema validation (installed but primarily used with react-hook-form)
- `github.com/clerkinc/clerk-sdk-go` 1.49.1 - JWT validation, user sync
- `github.com/jackc/pgx/v5` 5.8.0 - PostgreSQL connection pool, high-performance driver
- `github.com/go-chi/chi/v5` 5.2.5 - HTTP routing, middleware composition
- `anthropic` 0.84.0 - Claude API client (Haiku 4.5 model for inference)
- `psycopg2-binary` 2.9.11 - PostgreSQL sync driver for AI service database access
- `pgvector` 0.4.2 - pgvector type support for embeddings
- `fastapi` 0.135.1 - Web framework for AI endpoints
- `openai` 2.26.0 - OpenAI embeddings (text-embedding-3-small for vector search)
- `requests` 2.32.5 - Sync HTTP client for backend→AI communication
- `httpx` 0.28.1 - Async HTTP client (FastAPI context)
- `pydantic` 2.12.5 - Data validation and serialization (FastAPI models)
- `tailwindcss` 3.4.1 - Utility-first CSS framework
- `lucide-react` 0.577.0 - Icon library (18 icons per UI pattern)
- `recharts` 3.8.0 - Charts and analytics visualizations
- `@radix-ui/react-*` 1.x - Unstyled, accessible primitives (15+ components: avatar, checkbox, dialog, dropdown, tabs, etc.)
- `framer-motion` 11.18.2 - Animation library
- `@react-spring/web` 10.0.3 - Physics-based animations
- `react-parallax-tilt` 1.7.320 - 3D tilt effect component
- `cobe` 0.6.5 - 3D globe visualization (marketing pages)
- `@dnd-kit/core` 6.3.1 - Installed but not used; native drag-drop in Kanban board
- `@dnd-kit/sortable` 10.0.0 - Installed but not used
- `@dnd-kit/utilities` 3.2.2 - Installed but not used
- `react-markdown` 10.1.0 - Markdown rendering (AI chat messages)
- `remark-gfm` 4.0.1 - GitHub-flavored markdown parsing
- `date-fns` 4.1.0 - Date manipulation utilities
- `react-day-picker` 9.14.0 - Date picker component
- `class-variance-authority` 0.7.1 - Component variant patterns
- `clsx` 2.1.1 - Conditional classnames
- `tailwind-merge` 3.5.0 - Tailwind class name merging
- `uuid` (Go stdlib) - UUID generation
- `google.uuid` (via clerk-sdk-go) - UUID utilities
## Configuration
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key (build-time, client-side)
- `CLERK_SECRET_KEY` - Clerk secret (server-side, runtime)
- `NEXT_PUBLIC_API_URL` - Backend API endpoint (default: http://localhost:8080)
- `DATABASE_URL` - PostgreSQL connection string (required)
- `CLERK_SECRET_KEY` - Clerk secret for JWT validation (required)
- `AI_SERVICE_SECRET` - Shared secret for backend→AI communication (required)
- `REDIS_URL` - Redis connection (optional, configured but unused)
- `PORT` - Server port (default: 8080)
- `AI_SERVICE_URL` - AI service endpoint (default: http://localhost:8000)
- `GOOGLE_CLIENT_ID` - OAuth 2.0 client ID for Gmail integration
- `GOOGLE_CLIENT_SECRET` - OAuth 2.0 client secret for Gmail integration
- `GOOGLE_REDIRECT_URI` - OAuth callback URL (default: http://localhost:8080/api/auth/google/callback)
- `FRONTEND_URL` - Frontend origin for CORS (default: http://localhost:3000)
- `ENCRYPTION_KEY` - Key for encrypting sensitive data (OAuth tokens)
- `DATABASE_URL` - PostgreSQL connection string (required)
- `ANTHROPIC_API_KEY` - Claude API key (required)
- `OPENAI_API_KEY` - OpenAI embeddings key (optional for semantic search)
- `AI_SERVICE_SECRET` - Shared secret validation (required)
- `BACKEND_URL` - Backend API endpoint for proxied requests (default: http://localhost:8080)
- `ANTHROPIC_MODEL` - Model selection (default: claude-haiku-4-5-20251001)
- `frontend/tsconfig.json` - TypeScript compiler: strict mode, path aliases (`@/*` → `src/*`)
- `frontend/next.config.mjs` - Next.js output mode (standalone in production)
- `frontend/tailwind.config.ts` - Tailwind customization (colors, animations, spacing)
- `frontend/postcss.config.mjs` - PostCSS plugins (Tailwind, Autoprefixer)
- `frontend/.prettierrc` - Prettier: semi: true, singleQuote: false, Tailwind class sorting
- `backend/cmd/api/main.go` - Entry point, router initialization, middleware stack
- `ai-service/app/main.py` - FastAPI app, router registration
## Platform Requirements
- Node.js 20+ (for frontend build and local dev)
- Go 1.25.0+ (for backend compilation)
- Python 3.11+ (for AI service)
- Docker & Docker Compose (recommended for local database setup)
- PostgreSQL 15 (local dev or containerized)
- Redis 7 (containerized, optional)
- Docker & Docker Compose (containerized deployment)
- PostgreSQL 15 + pgvector extension
- Redis 7 (configured, not required)
- Environment variable provisioning (secrets manager integration)
- HTTPS/TLS termination (reverse proxy recommended)
- OAuth 2.0 provider access (Clerk, Google)
- Frontend → Backend: HTTP/HTTPS (port 8080)
- Backend → AI Service: HTTP (internal, port 8000)
- All services → PostgreSQL: TCP (port 5432)
- Clerk cloud: HTTPS API calls for JWT validation and user sync
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Go handlers: PascalCase (e.g., `contacts.go`, `deals.go`, `workflows.go`)
- TypeScript/React: PascalCase for components (e.g., `AIChatBubble.tsx`, `CommandPalette.tsx`), camelCase for utilities and API modules (e.g., `client.ts`, `contacts.ts`)
- Python files: snake_case (e.g., `agent.py`, `workflow_engine.py`, `tools.py`)
- Go: PascalCase (exported), camelCase (unexported). Handler factory functions return `http.HandlerFunc` (e.g., `ListContacts()`, `CreateDeal()`, `scanDeal()`)
- TypeScript: camelCase for functions and hooks (e.g., `listContacts()`, `createContact()`, `getColor()`, `initials()`)
- Python: snake_case for all functions (e.g., `find_matching_workflows()`, `execute_step()`, `load_history()`)
- Go: camelCase (e.g., `agentID`, `contactName`, `stageID`)
- TypeScript: camelCase (e.g., `firstName`, `folderSearch`, `selectedContacts`)
- Python: snake_case (e.g., `trigger_type`, `agent_id`, `conversation_id`)
- Go: PascalCase struct names with `json` tags for field mapping (e.g., `Contact struct { FirstName string json:"first_name" }`)
- TypeScript: PascalCase for interfaces and types (e.g., `interface Contact {}`, `type ViewMode = "table" | "grid"`)
- Python: PascalCase for Pydantic models (e.g., `class SendMessageRequest(BaseModel)`)
- Go: ALL_CAPS (e.g., `ErrCodeNotFound`, `UserIDKey`, `MAX_TOOL_ROUNDS`)
- TypeScript: ALL_CAPS for constants and const objects (e.g., `AVATAR_COLORS`, `SOURCES`, `DATE_OPTIONS`)
- Python: ALL_CAPS for module-level constants (e.g., `TOOL_DEFINITIONS`, `MODEL`, `MAX_TOOL_ROUNDS`)
## Code Style
- Go: Standard `gofmt` style, 4-space indentation via tabs
- TypeScript/React: Prettier with 2-space indentation, semi-colons enabled, double quotes, trailing commas (es5)
- Python: PEP 8 style (implied, no formatter enforced)
- Go: No explicit linter configured; standard Go formatting
- TypeScript: ESLint with Next.js config (`eslint-config-next` preset) + custom rule for unescaped entities
- Python: No explicit linter configured
- All frontend styling uses Tailwind utility classes inline in JSX
- No CSS files; all styling declarative in components
- `prettier-plugin-tailwindcss` auto-sorts class names
- Colors via design tokens (e.g., `bg-blue-500`, `text-gray-700`)
- Responsive utilities: `md:`, `lg:`, `xl:` prefixes
## Import Organization
- TypeScript: `@/*` maps to `src/*` (configured in `frontend/tsconfig.json`)
- Used everywhere in frontend code for cleaner imports
## Error Handling
- Handler factory functions return `http.HandlerFunc` that capture the pool via closure
- Error handling is silent with generic error messages: `respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)`
- No error wrapping beyond HTTP response; errors logged at the HTTP level
- Error responses are structured: `{"error": "message", "code": "ERR_DATABASE"}`
- Status codes match HTTP semantics (201 Created, 204 No Content, 404 Not Found, 400 Bad Request, 500 Internal Server Error)
- FastAPI `HTTPException` with `status_code` and `detail` parameters
- Unhandled exceptions return 500 via FastAPI middleware
- No explicit error logging in business logic; FastAPI middleware logs requests
## Logging
- Structured JSON logging via `log/slog` with `JSONHandler`
- Log level: `LevelInfo` by default
- Pattern: `slog.Info("event", "key", value)` or `slog.Error("event", "error", err)`
- Browser console logging only (no structured logging)
- Error logging in page components on mutation failure
- TanStack Query logs in development mode
- FastAPI middleware logs HTTP requests via Uvicorn stdout
- No explicit custom logging in business logic
- Module-level `logger` initialized with `logging.getLogger(__name__)` but not actively used in visible patterns
## Comments
- Comments explain **why**, not what the code does
- Docstrings on functions/methods describe purpose, inputs, and returns
- TODO/FIXME comments are sparse and specific
- Docstrings present on FastAPI endpoints (brief explanation of behavior)
- TypeScript: Minimal use; types are self-documenting via interfaces
- Exported functions have comment explanations (not strict in all handlers)
- Struct tags document JSON field mappings via `json:"field_name"`
- Module-level docstring at top of file
- Function docstrings explain flow (e.g., in `agent.py`: "Load conversation history → Build system prompt → Call Claude → Stream response")
## Function Design
- Go handlers tend to be 50–150 lines (query building + scanning + response)
- TypeScript page components are 200–400 lines (state setup, hooks, JSX)
- Python service functions are 30–80 lines (focused operations)
- Go: Handler factories take `*pgxpool.Pool` and return `http.HandlerFunc`
- TypeScript: Functions take typed arguments (filters object, token string, ids)
- Python: Functions take explicit parameters; requests modeled via Pydantic
- Go: Functions that may fail return `(T, error)` or write to `http.ResponseWriter` directly
- TypeScript: API functions return `Promise<T>` (errors thrown)
- Python: Async functions return results or raise `HTTPException`
- Go: `r.Context()` passed to all DB queries; RLS setup via `BeginWithRLS(ctx, pool, agentID)`
- TypeScript: Clerk context via `useAuth()` hook; no explicit context passing
- Python: Agent ID extracted from request and used as a parameter
## Module Design
- Go: Exported functions (PascalCase) are handlers or helpers; unexported (camelCase) are internal utilities
- TypeScript: Named exports for interfaces and functions (no default exports for utilities)
- Python: FastAPI routers are `APIRouter()` instances; tools defined in module-level lists
- TypeScript: No barrel files (`index.ts` pattern) used; direct imports preferred
- Go: Package-level organization (each domain gets a file: `contacts.go`, `deals.go`, etc.)
- Python: Routes organized in `app/routes/` with routers included in `main.py`
## Cross-Service Patterns
- Always `snake_case` (e.g., `first_name`, `agent_id`, `created_at`)
- Always `snake_case` (e.g., `"first_name": "John"`)
- PascalCase interfaces: `interface Contact {}`
- camelCase field access (mapped from API response)
- Frontend: Clerk `useAuth()` → `getToken()` → Bearer token in `Authorization` header
- Backend: Clerk JWT validation in middleware; user ID extracted to context
- Inter-service: `X-AI-Service-Secret` header for Go ↔ Python communication; `X-Agent-ID` for agent identification
## Transaction Pattern (Go)
## Data Type Nullable Patterns
- Pointers for nullable fields: `*string`, `*float64`, `*int` in structs
- JSON tags preserve field names: `json:"email"` (not `json:"email,omitempty"` — null is explicit)
- Union with null: `string | null` (not optional `?string`)
- Zod schemas use `.nullable()` for nullable fields
- Pydantic models use `Optional[Type]` or `Type | None`
- Database results handle NULL as None
## Testing Conventions
- **Go:** Tests live in same package with `_test.go` suffix; use `httptest` for handler testing
- **TypeScript:** Tests not extensively used; TanStack Query integration tests via component testing
- **Python:** Pytest-style tests; metadata-focused tests (tool definitions, schema validation) preferred
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Frontend is single entry point; never communicates directly with AI service
- Backend proxies all AI requests to Python service using shared secret (`X-AI-Service-Secret` header)
- Row-level security policies enforce agent-scoped data access at database layer
- Agentic loop with tool-calling (max 5 rounds per message) returns confirmation requests before executing write tools
- Async background workers handle email syncing and workflow triggers
## Layers
- Purpose: UI rendering, form handling, data display, authentication via Clerk
- Location: `frontend/src/app/` (page routes), `frontend/src/components/` (UI components), `frontend/src/lib/api/` (API client modules)
- Contains: React pages, components, API client functions, Zustand store for UI state
- Depends on: Backend (`/api/*` endpoints), Clerk SDK for authentication
- Used by: User browsers
- Purpose: Request routing, authentication/authorization, data persistence, request validation, email/Gmail integration
- Location: `backend/cmd/api/main.go` (entry), `backend/internal/handlers/` (14+ handler files), `backend/internal/middleware/` (auth, user sync, CORS)
- Contains: HTTP handlers (factory functions), middleware stack, database transactions with RLS
- Depends on: PostgreSQL connection pool, Clerk SDK for token validation, AI service for agentic requests
- Used by: Frontend (HTTP requests), AI service (service-to-service with shared secret)
- Purpose: Claude API integration, agentic loop, tool execution, semantic search, document processing, email operations
- Location: `ai-service/app/main.py` (entry), `ai-service/app/routes/` (chat, profiles, search, workflows, documents, emails), `ai-service/app/services/` (agent loop, embeddings, document processing, workflow engine)
- Contains: FastAPI routers, Claude integration, tool definitions and execution, database queries
- Depends on: PostgreSQL (psycopg2), Anthropic API (Claude Haiku 4.5), OpenAI API (embeddings, disabled)
- Used by: Backend (via HTTP proxy), background workers (workflow triggers)
- Purpose: Multi-tenant data storage with built-in security via RLS
- Location: `backend/migrations/` (9 migration files)
- Contains: 15 tables, RLS policies, indexes, triggers, pgvector extension
- Depends on: None (foundational)
- Used by: Backend (direct connection pool), AI service (psycopg2 pool)
## Data Flow Patterns
```
```
```
```
```
```
```
```
```
```
```
```
## Key Abstractions
- Purpose: Ensure all queries run scoped to authenticated agent, preventing cross-agent data leakage
- Examples: `backend/internal/database/rls.go` - `BeginWithRLS()` function
- Pattern: `tx, _ := BeginWithRLS(ctx, pool, agentID)` → execute queries → `tx.Commit(ctx)` or `defer tx.Rollback(ctx)`
- Called by: Every handler that touches agent-scoped data
- Purpose: Encapsulate HTTP handler as closure with dependency injection (connection pool)
- Examples: `backend/internal/handlers/contacts.go` - `ListContacts(pool)` returns `http.HandlerFunc`
- Pattern:
- Called by: Chi router in `main.go`
- Purpose: Type-safe, reusable API functions with Clerk token injection
- Examples: `frontend/src/lib/api/contacts.ts`, `frontend/src/lib/api/deals.ts`, etc.
- Pattern:
- Called by: Page components via `useQuery({ queryFn: () => listContacts(token!, filters) })`
- Purpose: Allow AI service to call backend handlers without Clerk JWT (e.g., send_email tool)
- Examples: `backend/internal/middleware/auth.go` - ClerkAuth checks `X-AI-Service-Secret` header
- Pattern: AI service passes `X-AI-Service-Secret: {SHARED_SECRET}` + `X-Agent-ID: {uuid}` → backend extracts agent ID from header instead of JWT
- Called by: AI service when executing write tools that need backend (send_email)
- Purpose: Stream Claude response word-by-word and emit tool confirmation events
- Examples: `ai-service/app/routes/chat.py` - `/ai/messages` endpoint
- Pattern: Generator yields `data: {json}\n\n` for each event (text, tool_call, confirmation, error)
- Called by: Frontend fetch with `response.body.getReader()` → parse newline-delimited JSON
- Purpose: Persist write tool confirmations (10-min TTL) so user can review before execution
- Examples: `ai-service/app/tools.py` - `queue_write_tool()` stores JSONB in `pending_actions` table
- Pattern: `pending_actions` row contains `{agent_id, tool, input, expires_at}` → on confirm, AI service re-executes tool → returns result
- Called by: Write tools, confirmation endpoint
- Purpose: Centralized UI state (sidebar collapse, chat bubble open/close, citation viewer state)
- Examples: `frontend/src/store/ui-store.ts`
- Pattern: Single store instance with typed getters/setters, no external dependencies
- Called by: Layout, AIChatBubble, pages that toggle UI elements
- Purpose: Define Claude tool schema and bind to execution function
- Examples: `ai-service/app/tools.py` - `TOOL_DEFINITIONS` list + `execute_read_tool()` / `queue_write_tool()`
- Pattern: Tool has `name`, `description`, `input_schema` (Anthropic format) → on Claude tool call, look up function and execute
- Called by: Agent loop in `services/agent.py`
## Entry Points
- Location: `frontend/src/app/layout.tsx`
- Triggers: Browser requests `/` or `/dashboard/*`
- Responsibilities: Wrap app in Clerk provider, set up Providers (TanStack Query), load fonts, render route
- Location: `backend/cmd/api/main.go` - `main()` function
- Triggers: Container starts
- Responsibilities: Load config, connect to database, initialize Clerk client, register middleware, register routes, start HTTP server with graceful shutdown
- Location: `ai-service/app/main.py` - FastAPI app instantiation
- Triggers: Container starts
- Responsibilities: Include routers (chat, profiles, search, workflows, documents, emails), startup cleanup of expired pending actions
- Location: `frontend/src/middleware.ts`
- Triggers: Every page request
- Responsibilities: Redirect unauthenticated users to `/sign-in`, allow public routes (marketing pages, portal), protect `/dashboard/*`
## Error Handling
```go
```
```typescript
```
```python
```
## Cross-Cutting Concerns
- Backend: `slog` JSON handler writes structured logs to stdout (timestamp, level, message, key-value fields)
- Frontend: `console.error()` for errors in try-catch blocks
- AI Service: Uvicorn access logs via stdout, no explicit custom logging
- Frontend: react-hook-form + Zod (forms only, no API response validation)
- Backend: Manual parsing + strconv.Atoi() with defaults; no schema validation
- AI Service: Pydantic models on request/response, no explicit input validation
- Frontend: Clerk sign-in/sign-up, session token stored in browser
- Backend: Clerk SDK verifies JWT signature, extracts subject, stores in context
- AI Service: Shared secret header validation for service-to-service calls
- Every query in agent-scoped tables wrapped in `BeginWithRLS(agentID)`
- PostgreSQL `app.current_agent_id` GUC variable set per transaction
- RLS policies filter `WHERE agent_id = current_setting('app.current_agent_id')`
- Prevents cross-agent data leakage at database layer, not application layer
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
