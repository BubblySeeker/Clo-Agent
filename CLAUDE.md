# CloAgent — MVP Blueprint

CloAgent is an AI-powered CRM for real estate agents. Monorepo with three services sharing a PostgreSQL 15 + pgvector database.

## Architecture

```
Frontend (Next.js 14, :3000) → Backend (Go/Chi, :8080) → PostgreSQL 15 + pgvector
                                       ↕
                               AI Service (FastAPI, :8000)
```

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Clerk auth, TanStack Query, Zustand, react-hook-form + Zod
- **Backend**: Go, Chi v5 router, pgx v5 connection pool, Clerk JWT middleware, RLS for data isolation
- **AI Service**: Python FastAPI, LangChain, Claude API (tool-calling), OpenAI embeddings, asyncpg
- **Database**: PostgreSQL 15 with pgvector extension, row-level security per agent
- **Auth**: Clerk — frontend uses `@clerk/nextjs` v5, backend validates JWT tokens via Clerk SDK
- **Infra**: Docker Compose (postgres, redis, backend, ai-service, frontend)

The Go backend is the single entry point for the frontend. AI requests are proxied from Go to the Python AI service. The frontend never talks to the AI service directly.

## Database Schema

10 tables defined in `backend/migrations/001_init.sql`:

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | Agent accounts (mapped to Clerk) | id (UUID), clerk_id, email, name |
| `contacts` | Leads/clients | id, agent_id (FK users), first_name, last_name, email, phone, source |
| `buyer_profiles` | Buyer preferences (1:1 with contact) | contact_id (FK contacts, UNIQUE), budget_min/max, bedrooms, bathrooms, locations[], must_haves[], deal_breakers[], property_type, pre_approved, timeline |
| `deal_stages` | Pipeline columns (7 seeded) | name, position, color — Lead, Contacted, Touring, Offer, Under Contract, Closed, Lost |
| `deals` | Pipeline cards | contact_id, agent_id, stage_id, title, value, notes |
| `activities` | Calls, emails, notes, showings, tasks | contact_id, deal_id (optional), agent_id, type (call/email/note/showing/task), body |
| `conversations` | AI chat threads | contact_id (nullable for general), agent_id |
| `messages` | Messages in conversations | conversation_id, role (user/assistant/system), content |
| `ai_profiles` | AI-generated contact summaries | contact_id (UNIQUE), summary |
| `embeddings` | pgvector semantic search | source_type, source_id, agent_id, content, embedding(1536) |

**RLS**: All agent-scoped tables have row-level security. Every query must first run `SET LOCAL app.current_agent_id = '<uuid>'` in a transaction. The `current_agent_id()` SQL function reads this setting. RLS policies automatically filter data to the authenticated agent.

**Triggers**: `updated_at` auto-set on contacts, buyer_profiles, deals, ai_profiles.

### Required Migrations (beyond 001_init.sql)

```sql
-- Migration 002: dashboard layout + general conversations
ALTER TABLE users ADD COLUMN dashboard_layout JSONB DEFAULT NULL;
ALTER TABLE conversations ALTER COLUMN contact_id DROP NOT NULL;

-- Migration 003: tool call audit trail
ALTER TABLE messages ADD COLUMN tool_calls JSONB DEFAULT NULL;
```

## Navigation

Top bar navigation (no sidebar). All direct links, no dropdowns:

| Nav Item | Route | MVP Status |
|----------|-------|------------|
| Dashboard | `/dashboard` | Build |
| Contacts | `/dashboard/contacts` | Build |
| Pipeline | `/dashboard/pipeline` | Build |
| Communication | `/dashboard/communication` | Grayed out "Coming Soon" |
| AI Assistant | `/dashboard/ai` | Build |
| Analytics | `/dashboard/analytics` | Build |
| Settings | `/dashboard/settings` | Build |

Right side: notification bell, "+ New" quick action button, agent avatar + name.

Floating AI chat bubble: bottom-right corner on every page.

## Pages to Build

### 1. `/` — Login (DONE)
Clerk sign-in with redirect to `/dashboard`.

### 2. `/dashboard` — Home
Customizable widget dashboard. Agent can rearrange, hide, and add widgets via edit mode (wiggle + drag, like iOS app rearranging).

**Widgets:**
- **Metric cards** (row of 4): Total Contacts, Active Deals, Pipeline Value, Closed This Month
- **Pipeline Overview**: Bar chart — deal count + total value per stage, colored by stage
- **Recent Activity**: Feed of last 15 activities across all contacts (icon, contact name, body preview, timestamp)
- **Needs Follow-Up**: Table of contacts with no activity in 7+ days (name, last activity type, days since)
- **Upcoming Tasks**: List of recent task-type activities (contact name, body, date)

**Customization mode:** "Customize" button → cards tilt with dashed borders, X to remove, drag handles, "+" empty slot to add widgets. Save via `PUT /api/dashboard/layout`.

**API:** `GET /api/dashboard/summary` (one call, all data), `GET/PUT /api/dashboard/layout`

### 3. `/dashboard/contacts` — Contact List
Table: name, email, phone, source, created date. Search bar (searches first_name, last_name, email). Source filter dropdown. Pagination. "Add Contact" button → create dialog. Click row → `/dashboard/contacts/[id]`.

**API:** `GET /api/contacts?search=&source=&page=&limit=`

### 4. `/dashboard/contacts/[id]` — Contact Detail
Tabbed layout:
- **Overview**: Contact info display, edit button (opens dialog), delete button (confirmation)
- **Buyer Profile**: Create if none exists, otherwise edit form. Fields: budget range, bedrooms, bathrooms, locations (multi-input), must-haves, deal-breakers, property type, pre-approval, timeline, notes
- **Activities**: Vertical timeline (icon per type, body, timestamp). Log activity form (type selector, body textarea, optional deal link)
- **AI Profile**: AI-generated summary card with regenerate button (Phase 2)

**API:** `GET/PATCH/DELETE /api/contacts/:id`, `GET/POST/PATCH /api/contacts/:id/buyer-profile`, `GET/POST /api/contacts/:id/activities`, `GET /api/contacts/:id/ai-profile`

### 5. `/dashboard/pipeline` — Kanban Board
7 columns (one per deal stage). Each column header: stage name, color dot, deal count, total value. Deal cards: title, contact name, value (currency), notes preview. Drag-and-drop between columns (`@dnd-kit/core`). "Add Deal" button → create dialog. Click card → deal detail modal or navigate to contact. Filter bar: filter by contact.

**API:** `GET /api/deal-stages`, `GET /api/deals?stage_id=&contact_id=`, `POST /api/deals`, `PATCH /api/deals/:id` (stage change = `{stage_id: "uuid"}`), `DELETE /api/deals/:id`

### 6. `/dashboard/ai` — AI Assistant (Full Page)
Left panel: conversation history list (general + contact-scoped, labeled by contact name or "General"). Right panel: full chat thread with streaming responses, tool call indicators, confirmation cards for write actions. Contact selector to start contact-scoped conversations. AI profile summary card shown when a contact is selected.

**API:** `GET/POST /api/ai/conversations`, `GET/POST /api/ai/conversations/:id/messages`, `POST /api/ai/conversations/:id/confirm`, `GET /api/contacts/:id/ai-profile`, `POST /api/contacts/:id/ai-profile/regenerate`

### 7. `/dashboard/analytics` — Charts & Metrics
Pipeline conversion funnel. Deals by stage (bar chart). Average deal value. Time-to-close. Activity volume over time. Contact source breakdown. Use recharts.

**API:** `GET /api/analytics/pipeline`, `GET /api/analytics/activities`, `GET /api/analytics/contacts`

### 8. `/dashboard/settings` — Agent Preferences
Agent profile (name, email, photo via Clerk). Notification preferences. AI preferences (tone, verbosity).

### 9. Floating AI Chat Bubble (Global Component)
Fixed bottom-right on every page. Click → ~400x500px popup chat window.

**Features:**
- General conversation by default, contact-scoped when on a contact page (auto-detects from URL)
- Streaming AI responses via SSE (token-by-token rendering)
- Tool call indicators ("Looking up contacts...", "Checking your pipeline...")
- Confirmation cards for write actions (create contact, log activity, update deal) — shows data preview, "Confirm" / "Cancel" buttons
- Markdown rendering for AI responses
- Conversation persistence across page navigations
- "New conversation" button

**Context awareness:** On `/dashboard/contacts/[id]`, placeholder says "Ask about [Contact Name]" and starts a contact-scoped conversation.

## All API Endpoints

### Dashboard
```
GET  /api/dashboard/summary          — all dashboard data in one call
GET  /api/dashboard/layout           — agent's widget layout
PUT  /api/dashboard/layout           — save widget layout
```

### Contacts
```
GET    /api/contacts                 — list (?search, ?source, ?page, ?limit)
POST   /api/contacts                 — create (required: first_name, last_name)
GET    /api/contacts/:id             — get single
PATCH  /api/contacts/:id             — partial update
DELETE /api/contacts/:id             — hard delete (cascades)
```

### Buyer Profiles
```
GET   /api/contacts/:id/buyer-profile   — get (404 if none)
POST  /api/contacts/:id/buyer-profile   — create (409 if exists)
PATCH /api/contacts/:id/buyer-profile   — partial update
```

### Deal Stages
```
GET /api/deal-stages                 — list all 7 seeded stages
```

### Deals
```
GET    /api/deals                    — list (?stage_id, ?contact_id)
POST   /api/deals                    — create (required: contact_id, stage_id, title)
GET    /api/deals/:id                — get (includes contact_name, stage_name via JOIN)
PATCH  /api/deals/:id                — partial update (stage_id change = drag-drop)
DELETE /api/deals/:id                — hard delete
```

### Activities
```
GET  /api/contacts/:id/activities    — list (?type filter, paginated, desc by created_at)
POST /api/contacts/:id/activities    — create (type: call|email|note|showing|task, deal_id optional)
```

### AI Conversations (proxied Go → Python)
```
GET  /api/ai/conversations                  — list all (general + contact-scoped)
POST /api/ai/conversations                  — start new (body: {contact_id?: uuid})
GET  /api/ai/conversations/:id/messages     — message history (includes tool_calls)
POST /api/ai/conversations/:id/messages     — send message, get streaming SSE response
POST /api/ai/conversations/:id/confirm      — confirm a pending write action
```

### AI Profiles (proxied Go → Python)
```
GET  /api/contacts/:id/ai-profile           — get AI-generated summary
POST /api/contacts/:id/ai-profile/regenerate — regenerate from latest data
```

### Search (proxied Go → Python)
```
POST /api/search                    — semantic search (body: {query: string})
```

### Analytics
```
GET /api/analytics/pipeline         — stage counts, values, conversion rates
GET /api/analytics/activities       — activity counts by type/period
GET /api/analytics/contacts         — source breakdown, growth over time
```

### Error Shape
All errors: `{ "error": "human-readable message" }` with status 400/401/403/404/500.

### Pagination Shape
All list endpoints support `?page=1&limit=25`. Response includes `"total": <count>` for frontend pagination controls.

## AI Agent Architecture

The floating chat bubble and `/dashboard/ai` page connect to an **agentic AI assistant** powered by Claude with tool-calling. It can read data and take actions.

### Read Tools (execute immediately)
| Tool | Description | Internal call |
|------|-------------|---------------|
| `get_dashboard_summary` | Metrics, pipeline, recent activity | `GET /api/dashboard/summary` |
| `search_contacts` | Find contacts by name/email/source | `GET /api/contacts?search=` |
| `get_contact_details` | Full contact profile | `GET /api/contacts/:id` |
| `get_buyer_profile` | Buyer preferences | `GET /api/contacts/:id/buyer-profile` |
| `get_contact_activities` | Activity history | `GET /api/contacts/:id/activities` |
| `list_deals` | Deals with filters | `GET /api/deals` |
| `get_deal` | Single deal | `GET /api/deals/:id` |
| `get_deal_stages` | Pipeline stages | `GET /api/deal-stages` |
| `get_analytics` | Stats and metrics | `GET /api/analytics/*` |
| `semantic_search` | Natural language search across all data | `POST /api/search` |

### Write Tools (require user confirmation via UI card)
| Tool | Description | Internal call |
|------|-------------|---------------|
| `create_contact` | Add a new contact | `POST /api/contacts` |
| `update_contact` | Modify contact info | `PATCH /api/contacts/:id` |
| `log_activity` | Log a call/email/note/showing/task | `POST /api/contacts/:id/activities` |
| `create_deal` | Create a deal | `POST /api/deals` |
| `update_deal` | Update deal or move stage | `PATCH /api/deals/:id` |

### Service-to-Service Auth
AI service calls Go backend internally using `AI_SERVICE_SECRET` header + agent_id for RLS impersonation. Frontend never talks to AI service directly.

### System Prompts
- **General conversation**: "You are CloAgent AI, an assistant for real estate agent [name]. You can look up contacts, check pipeline status, log activities, and help manage deals. Use your tools to answer questions with real data."
- **Contact-scoped**: Same + pre-loaded context (contact details, buyer profile, recent activities, deal status).

## Backend Patterns

### Handler Pattern (Go)
```go
func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        tx := database.BeginWithRLS(pool, agentID)  // SET LOCAL app.current_agent_id
        defer tx.Rollback()
        // query, marshal, respond
    }
}
```

### User Sync
Auth middleware validates Clerk JWT → extracts clerk_id → looks up `users` table → creates row if missing → stores internal UUID in context. This UUID is what gets set for RLS.

### Response Helpers
```go
respondJSON(w, http.StatusOK, data)
respondError(w, http.StatusBadRequest, "validation error message")
```

## Frontend Patterns

### API Client
`src/lib/axios.ts` — base URL from `NEXT_PUBLIC_API_URL` env var (default `:8080`). Needs auth interceptor to attach Clerk token.

### Hooks (TanStack Query)
One file per resource in `src/hooks/`:
- `useDashboardSummary()`, `useDashboardLayout()`, `useSaveDashboardLayout()`
- `useContacts(filters)`, `useContact(id)`, `useCreateContact()`, `useUpdateContact()`, `useDeleteContact()`
- `useBuyerProfile(contactId)`, `useCreateBuyerProfile()`, `useUpdateBuyerProfile()`
- `useDeals(filters)`, `useDealStages()`, `useCreateDeal()`, `useUpdateDeal()`, `useDeleteDeal()`
- `useActivities(contactId, filters)`, `useCreateActivity()`
- `useAIConversations()`, `useAIMessages(conversationId)`, `useSendAIMessage()`, `useConfirmToolAction()`
- `useAIProfile(contactId)`, `useRegenerateAIProfile()`

### Forms
react-hook-form + Zod resolver. Schemas in `src/lib/schemas/`. Shared between validation and TypeScript type inference.

### State
Zustand for UI state (sidebar, modals). TanStack Query for server state. No Redux.

### UI Components
shadcn/ui (configured in `components.json`). Needed: table, dialog, input, select, textarea, label, badge, card, toast, dropdown-menu, tabs, separator, skeleton, avatar.

## Environment Variables

### Root `.env` (Docker Compose)
```
POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
ANTHROPIC_API_KEY, OPENAI_API_KEY
```

### Backend
```
DATABASE_URL=postgres://user:pass@localhost:5432/cloagent
CLERK_SECRET_KEY=sk_test_...
REDIS_URL=redis://localhost:6379
PORT=8080
AI_SERVICE_SECRET=<shared-secret-for-service-auth>
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

## Build Order

1. **Phase 0**: Auth interceptor on axios, user sync middleware, RLS helper, response helpers, migration 002
2. **Phase 1**: Contacts CRUD → Contacts pages → Deals CRUD → Pipeline kanban → Activities CRUD → Activity feed → Dashboard home
3. **Phase 2**: AI service with tool-calling Claude → Floating chat bubble → AI Assistant page → AI profiles → Embeddings + semantic search
4. **Phase 3**: Analytics, notifications, settings, communication hub, multi-agent workflows, proactive suggestions

Full implementation details are in `PLAN.md`.
