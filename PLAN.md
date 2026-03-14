# CloAgent — Implementation Plan

## Navigation Structure

Top bar navigation (no sidebar). All items are direct links — no dropdowns:

| Nav Item | Route | Status |
|----------|-------|--------|
| Dashboard | `/dashboard` | Active |
| Contacts | `/dashboard/contacts` | Active |
| Pipeline | `/dashboard/pipeline` | Active |
| Communication | `/dashboard/communication` | Coming Soon (grayed out) |
| AI Assistant | `/dashboard/ai` | Active |
| Analytics | `/dashboard/analytics` | Active |
| Settings | `/dashboard/settings` | Active |

Right side of nav: notification bell, "+ New" quick action button, agent avatar + name.

**Floating AI Chat Bubble:** Persistent on every page (bottom-right corner). This is the primary AI interface — an agentic assistant with tool-calling that can query data and take actions. See Phase 2 for details.

---

## Phase 0 — Foundation Fixes

| # | Task | Details |
|---|------|---------|
| 0.1 | **Fix axios base URL** | ~~Change `baseURL` in `frontend/src/lib/axios.ts` from hardcoded `localhost:4000` to `process.env.NEXT_PUBLIC_API_URL`~~ ✅ Done |
| 0.2 | **Add auth token interceptor to axios** | Axios request interceptor that calls `await getToken()` from Clerk and attaches `Authorization: Bearer <token>` to every request |
| 0.3 | **User sync middleware (Go)** | After Clerk JWT validation, look up `users` by `clerk_id`. If not found, create a row (pull email/name from Clerk claims). Store the internal UUID in context. This is how you get the UUID for `SET LOCAL app.current_agent_id`. |
| 0.4 | **RLS session helper (Go)** | A reusable function that takes a `pgxpool.Pool` + agent UUID, begins a transaction, runs `SET LOCAL app.current_agent_id = $1`, and returns the tx for the handler to use. Every handler will call this. |
| 0.5 | **Standard response/error helpers (Go)** | `respondJSON(w, status, data)`, `respondError(w, status, message)` — avoids repeating boilerplate in every handler. |
| 0.6 | **Request validation pattern (Go)** | Manual validation — no external library needed for this scope. |
| 0.7 | **Schema migration: dashboard layout + nullable contact_id** | `ALTER TABLE users ADD COLUMN dashboard_layout JSONB DEFAULT NULL` — stores widget layout per agent. `ALTER TABLE conversations ALTER COLUMN contact_id DROP NOT NULL` — allows general AI conversations not tied to a specific contact. |

---

## Phase 1A — Backend: Dashboard Summary + Contacts + Buyer Profiles

| # | Task | Details |
|---|------|---------|
| 1.0 | **GET /api/dashboard/summary** | Single endpoint returning all dashboard data: metrics (total_contacts, active_deals, pipeline_value, closed_this_month), pipeline breakdown by stage, recent_activities (last 15), stale_contacts (no activity in 7+ days, top 10), recent_tasks (last 10 activities where type=task). All scoped by RLS automatically. |
| 1.0b | **GET /api/dashboard/layout** | Returns the agent's saved dashboard widget layout (from `users.dashboard_layout`). NULL means use default layout. |
| 1.0c | **PUT /api/dashboard/layout** | Saves the agent's customized widget layout as JSON. Body: `{ "widgets": [{ "id": "metrics", "position": 0, "visible": true }, ...] }` |
| 1.1 | **Contact structs** | Request/response structs in `internal/models/contact.go` |
| 1.2 | **GET /api/contacts** | List with `?search=`, `?source=`, `?page=`, `?limit=` params. Search across first_name, last_name, email. Return total count for pagination. |
| 1.3 | **POST /api/contacts** | Validate required fields (first_name, last_name). Return 201 + created contact. |
| 1.4 | **GET /api/contacts/:id** | Return 404 if not found (RLS handles authorization). |
| 1.5 | **PATCH /api/contacts/:id** | Partial update — only set fields that are present in the request body. |
| 1.6 | **DELETE /api/contacts/:id** | Hard delete. Return 204. Cascades handle related records. |
| 1.7 | **Buyer profile structs** | Request/response structs in `internal/models/buyer_profile.go` |
| 1.8 | **GET /api/contacts/:id/buyer-profile** | Return 404 if no profile exists (not every contact is a buyer). |
| 1.9 | **POST /api/contacts/:id/buyer-profile** | Create. Return 409 if one already exists. |
| 1.10 | **PATCH /api/contacts/:id/buyer-profile** | Partial update. |

---

## Phase 1B — Frontend: Dashboard + Contacts Pages

| # | Route | Details |
|---|-------|---------|
| 1.11 | **Top nav bar component** | Shared across all pages. CloAgent logo, nav links (Dashboard, Contacts, Pipeline, Communication as grayed out "Coming Soon", AI Assistant, Analytics, Settings), notification bell, "+ New" button, agent avatar. |
| 1.12 | **`/dashboard`** | Customizable dashboard home. Metric cards (contacts, active deals, pipeline value, closed this month). Pipeline overview bar chart. Recent activity feed. Needs follow-up table. Upcoming tasks list. "Customize" button toggles edit mode (wiggle, drag, delete, add widgets). |
| 1.13 | **Dashboard customization** | Edit mode: cards tilt with dashed borders, X to remove, drag handle to reorder, "+" slot to add widgets. Layout saved via `PUT /api/dashboard/layout`, loaded via `GET /api/dashboard/layout`. |
| 1.14 | **API hooks** | `useDashboardSummary()`, `useDashboardLayout()`, `useSaveDashboardLayout()`, `useContacts(filters)`, `useContact(id)`, `useCreateContact()`, `useUpdateContact()`, `useDeleteContact()`, `useBuyerProfile(contactId)`, `useCreateBuyerProfile()`, `useUpdateBuyerProfile()` |
| 1.15 | **Zod schemas** | `src/lib/schemas/contact.ts` — Zod schemas for contact form, buyer profile form. Shared between validation and TypeScript types. |
| 1.16 | **shadcn/ui components** | Install: `table`, `dialog`, `input`, `select`, `textarea`, `label`, `badge`, `card`, `toast`, `dropdown-menu`, `tabs`, `separator`, `skeleton`, `avatar` |
| 1.17 | **`/dashboard/contacts`** | Contact list page. Table with columns: name, email, phone, source, created date. Search bar. "Add Contact" button opens dialog. Pagination controls. Click row → navigates to detail page. |
| 1.18 | **`/dashboard/contacts/[id]`** | Contact detail page with tabs: **Overview** (contact info, edit button, delete button), **Buyer Profile** (create/edit form), **Activities** (timeline — built in Phase 1F), **AI Profile** (built in Phase 2C). |
| 1.19 | **Contact create/edit dialog** | react-hook-form + Zod resolver. Fields: first_name, last_name, email, phone, source (dropdown: zillow, referral, realtor.com, social media, open house, other). |
| 1.20 | **Buyer profile form** | Inline form on the buyer profile tab. Budget range, bedrooms, bathrooms, locations (multi-input), must-haves, deal-breakers, property type, pre-approval status, timeline, notes. |

---

## Phase 1C — Backend: Deal Stages + Deals

| # | Task | Details |
|---|------|---------|
| 1.21 | **Deal structs** | Include joined `contact_name` and `stage_name` in response (as API.md specifies). |
| 1.22 | **GET /api/deal-stages** | Returns the 7 seeded stages. No RLS since stages are shared. |
| 1.23 | **GET /api/deals** | List with `?stage_id=`, `?contact_id=` filters. JOIN contacts and deal_stages for names. |
| 1.24 | **POST /api/deals** | Validate: contact_id exists, stage_id exists. |
| 1.25 | **GET /api/deals/:id** | Single deal with joined names. |
| 1.26 | **PATCH /api/deals/:id** | Partial update. This is how drag-and-drop stage changes work (just send `{stage_id: "new-uuid"}`). |
| 1.27 | **DELETE /api/deals/:id** | Hard delete. 204. |

---

## Phase 1D — Frontend: Pipeline Kanban

| # | Route | Details |
|---|-------|---------|
| 1.28 | **API hooks** | `useDeals(filters)`, `useDealStages()`, `useCreateDeal()`, `useUpdateDeal()`, `useDeleteDeal()` |
| 1.29 | **Zod schemas** | Deal create/edit schemas. |
| 1.30 | **`/dashboard/pipeline`** | Kanban board. 7 columns (one per stage). Deal cards showing: title, contact name, value (formatted as currency), notes preview. Drag-and-drop between columns (use `@dnd-kit/core`). Deal count + total value per column header. "Add Deal" button opens dialog. Click card → opens detail modal or navigates to contact. |
| 1.31 | **Deal create/edit dialog** | Contact selector (searchable dropdown), stage selector, title, value, notes. |
| 1.32 | **Filter bar** | Filter deals by contact. |

---

## Phase 1E — Backend: Activities

| # | Task | Details |
|---|------|---------|
| 1.33 | **Activity structs** | Type enum: call, email, note, showing, task. |
| 1.34 | **GET /api/contacts/:id/activities** | List, ordered by created_at desc. Include `?type=` filter. Pagination. |
| 1.35 | **POST /api/contacts/:id/activities** | Validate type is one of the 5 allowed values. deal_id is optional. |

---

## Phase 1F — Frontend: Activity Feed + Contact Detail Completion

| # | Route | Details |
|---|-------|---------|
| 1.36 | **API hooks** | `useActivities(contactId, filters)`, `useCreateActivity()` |
| 1.37 | **Activity timeline component** | Vertical timeline. Each item shows: icon by type (phone for call, mail for email, etc.), body text, relative timestamp. |
| 1.38 | **Log activity form** | On the Activities tab of contact detail. Type selector, body textarea, optional deal link. |

---

## Phase 2A — Backend: AI Agent Service

The AI assistant is an **agentic system with tool-calling**, not a simple chatbot. It can query live data and take actions on behalf of the agent. All AI requests are proxied through the Go backend to the Python AI service.

| # | Task | Details |
|---|------|---------|
| 2.1 | **Go proxy endpoints** | Routes that proxy to AI service (`ai-service:8000`): `POST /api/ai/conversations` (start general or contact-scoped conversation), `GET /api/ai/conversations` (list agent's conversations), `GET /api/ai/conversations/:id/messages` (get message history), `POST /api/ai/conversations/:id/messages` (send message, get AI response). Frontend only talks to Go backend. |
| 2.2 | **Service-to-service auth** | AI service needs to call Go backend API endpoints internally to execute tools. Use a shared service secret (`AI_SERVICE_SECRET` env var) passed as a header. Go backend validates this and impersonates the requesting agent (agent_id passed in the proxied request). |
| 2.3 | **AI service DB connection** | Connect FastAPI to PostgreSQL using asyncpg. Set up same RLS pattern. |
| 2.4 | **Conversation management** | Create/list conversations. Conversations with `contact_id = NULL` are general conversations. Conversations with a `contact_id` are contact-scoped (used from the AI Assistant page). |
| 2.5 | **Claude tool definitions** | Define all tools Claude can call. These map to your existing API endpoints: |

### AI Agent Tools

**Read tools (available from day one):**

| Tool Name | What it does | Calls internally |
|-----------|-------------|-----------------|
| `get_dashboard_summary` | Returns metrics, pipeline overview, recent activity, stale contacts | `GET /api/dashboard/summary` |
| `search_contacts` | Find contacts by name, email, source, or keyword | `GET /api/contacts?search=` |
| `get_contact_details` | Full profile for a specific contact | `GET /api/contacts/:id` |
| `get_buyer_profile` | Buyer preferences for a contact | `GET /api/contacts/:id/buyer-profile` |
| `get_contact_activities` | Activity history for a contact | `GET /api/contacts/:id/activities` |
| `list_deals` | All deals, optionally filtered by stage or contact | `GET /api/deals` |
| `get_deal` | Single deal details | `GET /api/deals/:id` |
| `get_deal_stages` | All pipeline stages | `GET /api/deal-stages` |
| `get_analytics` | Pipeline stats, activity counts, conversion rates | `GET /api/analytics/*` |

**Write tools (require user confirmation in the UI):**

| Tool Name | What it does | Calls internally |
|-----------|-------------|-----------------|
| `create_contact` | Add a new contact | `POST /api/contacts` |
| `update_contact` | Update contact info | `PATCH /api/contacts/:id` |
| `log_activity` | Log a call, email, note, showing, or task | `POST /api/contacts/:id/activities` |
| `create_deal` | Create a new deal | `POST /api/deals` |
| `update_deal` | Update deal info or move to a new stage | `PATCH /api/deals/:id` |

| # | Task | Details |
|---|------|---------|
| 2.6 | **Tool execution engine** | When Claude returns a tool call, AI service executes it by hitting the Go backend internally (with service auth + agent_id). Returns tool result back to Claude for the next turn. Multiple tool calls per turn supported. |
| 2.7 | **Conversation context builder** | For contact-scoped conversations: auto-fetch contact + buyer profile + recent activities + deal status and include in system prompt. For general conversations: system prompt describes the agent's role and available tools without pre-loading specific contact data. |
| 2.8 | **Message storage** | Store user messages, assistant messages, and tool calls/results in the messages table. Add `tool_calls JSONB` column to messages table for audit trail. |
| 2.9 | **Streaming support** | Claude responses should stream to the frontend via SSE (Server-Sent Events) so the agent sees the response appearing in real-time, not waiting for the full response. |

---

## Phase 2B — Frontend: Floating AI Chat Bubble

The floating chat bubble is the **primary AI interface**, available on every page.

| # | Task | Details |
|---|-------|---------|
| 2.10 | **Chat bubble component** | Fixed-position button in bottom-right corner of every page. Chat icon (message-circle or bot icon). Click to expand into a chat popup window. Badge shows unread/pending indicator. |
| 2.11 | **Chat popup window** | ~400px wide, ~500px tall popup anchored to bottom-right. Header: "CloAgent AI" with minimize/close buttons. Message area: scrollable thread. User messages on right (blue), AI messages on left (gray). Input bar at bottom with send button. |
| 2.12 | **Confirmation cards** | When the AI wants to perform a write action (create contact, log activity, etc.), it renders a confirmation card in the chat instead of executing immediately. Card shows: action description, data preview, "Confirm" and "Cancel" buttons. Only executes on confirm. |
| 2.13 | **Tool call indicators** | While the AI is calling tools, show a subtle status line: "Looking up contacts..." or "Checking your pipeline..." — so the agent knows the AI is working, not frozen. |
| 2.14 | **Streaming message display** | AI responses render token-by-token as they stream in via SSE. Markdown rendering for formatted responses (tables, lists, bold). |
| 2.15 | **Context awareness** | If the agent is on `/dashboard/contacts/[id]`, the chat bubble auto-suggests: "Ask about [Contact Name]" as a placeholder. Clicking the bubble while on a contact page starts a contact-scoped conversation. Otherwise, starts a general conversation. |
| 2.16 | **Conversation persistence** | Chat history persists across page navigations and browser refreshes. Last active conversation auto-loads when bubble is opened. "New conversation" button to start fresh. |
| 2.17 | **API hooks** | `useAIConversations()`, `useAIMessages(conversationId)`, `useSendAIMessage()`, `useConfirmToolAction()` |

---

## Phase 2C — AI Assistant Page + AI Profiles

The `/dashboard/ai` page is the **full-screen version** for deep-dive conversations and AI profiles.

| # | Route | Details |
|---|-------|---------|
| 2.18 | **`/dashboard/ai`** | Full-page AI assistant. Left panel: conversation history list (general + contact-scoped, labeled). Right panel: full chat thread with streaming, confirmation cards, tool indicators — same as bubble but bigger. Contact selector to start a contact-scoped conversation. AI profile summary card displayed when a contact is selected. |
| 2.19 | **AI profile generation** | `POST /api/contacts/:id/ai-profile/regenerate` — fetches all activities, messages, notes for a contact. Prompts Claude to produce structured summary: emotional/practical stage, key preferences, deal-breakers, recommended next action, risk flags. Stores in ai_profiles table. |
| 2.20 | **AI profile card** | Shown on AI Assistant page when contact is selected, and on contact detail page (AI Profile tab). Summary, preferences, risk flags, recommended next action. "Regenerate" button. |
| 2.21 | **API hooks** | `useAIProfile(contactId)`, `useRegenerateAIProfile()` |

---

## Phase 2D — Embeddings + Semantic Search

| # | Task | Details |
|---|------|---------|
| 2.22 | **Embed on write** | After creating activities, messages, or notes — call OpenAI `text-embedding-3-small` and store in embeddings table. Run async so it doesn't slow the API response. |
| 2.23 | **Semantic search endpoint** | `POST /api/search` with a natural language query. Embed the query, run cosine similarity against embeddings table, return matching contacts/activities. |
| 2.24 | **AI tool: semantic_search** | Add as a tool the AI agent can call: "Find contacts who mentioned they want a pool", "Which clients are interested in downtown?". Returns relevant contacts/activities ranked by similarity. |
| 2.25 | **Frontend search** | Global search bar in the top nav that uses semantic search. Results grouped by type. |

---

## Phase 3 — Intelligence + Polish

| # | Task | Details |
|---|------|---------|
| 3.1 | **`/dashboard/analytics`** | Charts: pipeline conversion funnel, deals by stage, average deal value, time-to-close, activity volume over time, contact sources breakdown. Use recharts. |
| 3.2 | **Analytics API endpoints** | `GET /api/analytics/pipeline`, `GET /api/analytics/activities`, `GET /api/analytics/contacts`. Aggregate queries — no new tables needed. |
| 3.3 | **Smart notifications** | Backend: scheduled check for stale contacts (no activity in X days), stuck deals (same stage for X days). New `notifications` table (schema migration). Frontend: notification bell in header, notification list. |
| 3.4 | **`/dashboard/settings`** | Agent profile (name, email, photo via Clerk), notification preferences, AI preferences (tone, verbosity). |
| 3.5 | **Contact import** | CSV import for contacts. Upload → parse → preview → confirm flow. |
| 3.6 | **`/dashboard/communication`** | Communication hub — email, SMS, phone integration. Currently "Coming Soon" in nav. |
| 3.7 | **Multi-agent AI workflows** | Research agent (pulls property data), follow-up drafter (writes personalized emails), market analysis agent (comparable sales). These run as LangGraph workflows, triggered from the chat bubble or AI Assistant page. |
| 3.8 | **Proactive AI suggestions** | AI-initiated messages in the chat bubble: "You haven't followed up with John in 2 weeks", "3 new listings match Sarah's criteria". Triggered by activity patterns or new data. Requires background job checking for triggers. |

---

## All Pages / Routes

| Route | Phase | Description |
|-------|-------|-------------|
| `/` | Done | Login/signup via Clerk |
| `/dashboard` | 1B | Customizable overview: metrics, pipeline chart, activity feed, follow-ups, tasks. Drag-to-rearrange edit mode. |
| `/dashboard/contacts` | 1B | Contact list with search, filter, pagination |
| `/dashboard/contacts/[id]` | 1B/1F | Contact detail: Overview, Buyer Profile, Activities, AI Profile tabs |
| `/dashboard/pipeline` | 1D | Kanban board with drag-and-drop deals |
| `/dashboard/ai` | 2C | Full-page AI: conversation history, contact-scoped chat, AI profiles |
| `/dashboard/analytics` | 3 | Charts and metrics |
| `/dashboard/settings` | 3 | Agent preferences and profile |
| `/dashboard/communication` | 3+ | Coming Soon — email, SMS, phone integration |

**Global components (all pages):**
| Component | Phase | Description |
|-----------|-------|-------------|
| Top nav bar | 1B | Navigation, notifications, quick actions, agent avatar |
| Floating AI chat bubble | 2B | Bottom-right chat popup — agentic assistant with tool-calling, streaming, confirmation cards |

---

## All API Endpoints

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | All dashboard data in one call (metrics, pipeline, activities, stale contacts, tasks) |
| GET | `/api/dashboard/layout` | Agent's saved widget layout |
| PUT | `/api/dashboard/layout` | Save widget layout |

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | List with `?search=`, `?source=`, `?page=`, `?limit=` |
| POST | `/api/contacts` | Create contact |
| GET | `/api/contacts/:id` | Get single contact |
| PATCH | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact (hard delete, cascades) |

### Buyer Profiles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts/:id/buyer-profile` | Get buyer profile |
| POST | `/api/contacts/:id/buyer-profile` | Create buyer profile |
| PATCH | `/api/contacts/:id/buyer-profile` | Update buyer profile |

### Deal Stages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deal-stages` | List all 7 stages |

### Deals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deals` | List with `?stage_id=`, `?contact_id=` filters |
| POST | `/api/deals` | Create deal |
| GET | `/api/deals/:id` | Get single deal (with contact_name, stage_name) |
| PATCH | `/api/deals/:id` | Update deal (including stage changes for drag-drop) |
| DELETE | `/api/deals/:id` | Delete deal |

### Activities
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts/:id/activities` | List with `?type=` filter, paginated |
| POST | `/api/contacts/:id/activities` | Create activity (type: call, email, note, showing, task) |

### AI — Conversations (proxied to AI service)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ai/conversations` | List all conversations for the agent (general + contact-scoped) |
| POST | `/api/ai/conversations` | Start new conversation. Body: `{ "contact_id": "uuid" }` (optional — omit for general) |
| GET | `/api/ai/conversations/:id/messages` | Get messages in a conversation (includes tool call history) |
| POST | `/api/ai/conversations/:id/messages` | Send message, get streaming AI response via SSE |
| POST | `/api/ai/conversations/:id/confirm` | Confirm a pending write action from a tool call |

### AI — Profiles (proxied to AI service)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts/:id/ai-profile` | Get AI-generated profile |
| POST | `/api/contacts/:id/ai-profile/regenerate` | Regenerate AI profile |

### Search (proxied to AI service)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search` | Semantic search across contacts, activities, messages |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/pipeline` | Stage counts + values, conversion rates |
| GET | `/api/analytics/activities` | Activity counts by type/period |
| GET | `/api/analytics/contacts` | Source breakdown, growth over time |

---

## Schema Migrations Required

### Migration 002 (Phase 0)
```sql
-- Dashboard layout preferences
ALTER TABLE users ADD COLUMN dashboard_layout JSONB DEFAULT NULL;

-- Allow general AI conversations (not tied to a contact)
ALTER TABLE conversations ALTER COLUMN contact_id DROP NOT NULL;
```

### Migration 003 (Phase 2A)
```sql
-- Tool call audit trail on messages
ALTER TABLE messages ADD COLUMN tool_calls JSONB DEFAULT NULL;
```

### Migration 004 (Phase 3)
```sql
-- Notifications
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,  -- 'stale_contact', 'stuck_deal', 'ai_suggestion'
    title       TEXT NOT NULL,
    body        TEXT,
    reference_id UUID,          -- optional link to contact/deal
    reference_type TEXT,        -- 'contact', 'deal'
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_agent ON notifications(agent_id);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_agent_isolation ON notifications
    USING (agent_id = current_agent_id());
```

---

## Key Architectural Decisions

- **Top nav, no sidebar** — all navigation in a persistent top bar, direct links (no dropdowns), Communication grayed out as "Coming Soon"
- **Customizable dashboard** — agents can rearrange, hide, and add widgets. Layout stored as JSON on the users table (`dashboard_layout` column)
- **Floating AI chat bubble on every page** — agentic assistant with Claude tool-calling. Can query data (contacts, deals, pipeline, analytics) and take actions (create contacts, log activities, update deals) with user confirmation for writes
- **Two AI interfaces** — chat bubble for quick questions/actions from any page, `/dashboard/ai` page for deep-dive conversations and AI profiles. Both use the same backend conversation system
- **Service-to-service auth for AI tools** — AI service calls Go backend internally using a shared secret, impersonating the requesting agent for RLS
- **Streaming responses** — AI responses stream via SSE for real-time feel
- **Hard delete** for contacts/deals in Phase 1 (no soft delete — avoids schema change and query complexity)
- **Go proxies all AI requests** — frontend only talks to `:8080`, Go forwards to AI service on `:8000`
- **Manual input validation** in Go handlers (no external validation library)
- **Pagination**: `?page=1&limit=25` on all list endpoints, response includes `total` count
- **RLS handles authorization** — handlers just set the agent_id on the session, DB does the rest
