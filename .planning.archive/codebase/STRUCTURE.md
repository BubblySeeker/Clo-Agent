# CloAgent — Directory Structure & File Organization

## Monorepo Layout

```
Clo-Agent/
├── .claude/                          # Claude Code project config
├── .planning/                        # Planning/design documents (this repo)
│   └── codebase/                     # Architecture & structure docs
├── .gstack/                          # gstack browsing tool config
├── backend/                          # Go API server
├── ai-service/                       # Python FastAPI AI service
├── frontend/                         # Next.js 14 frontend
├── docker-compose.yml                # Multi-service orchestration
├── CLAUDE.md                         # Project reference (instructions)
├── README.md                         # Project overview
├── API.md                            # API endpoint documentation
├── PLAN.md                           # Development plan
├── design-reference/                 # UI reference (images, old designs)
├── design-system/                    # Design system assets
├── docs/                             # Miscellaneous documentation
└── images/                           # Screenshots, diagrams
```

## Backend Directory Structure

```
backend/
├── cmd/
│   └── api/
│       └── main.go                   # Entry point, router setup, middleware stack
├── internal/
│   ├── config/
│   │   └── config.go                 # Env var loading (DATABASE_URL, CLERK_SECRET_KEY, etc)
│   ├── database/
│   │   ├── postgres.go               # pgxpool connection + health check
│   │   └── rls.go                    # BeginWithRLS transaction wrapper
│   ├── handlers/                     # 15 handler files, 20+ endpoints
│   │   ├── contacts.go               # CRUD: ListContacts, CreateContact, GetContact, etc
│   │   ├── deals.go                  # CRUD: ListDeals, CreateDeal, UpdateDeal, DeleteDeal
│   │   ├── deal_stages.go            # GET /api/deal-stages (7 seeded stages)
│   │   ├── activities.go             # CRUD: ListActivities, CreateActivity, UpdateActivity
│   │   ├── buyer_profiles.go         # CRUD: GetBuyerProfile, CreateBuyerProfile, UpdateBuyerProfile
│   │   ├── dashboard.go              # GetDashboardSummary, GetDashboardLayout, SaveDashboardLayout
│   │   ├── analytics.go              # GetPipelineAnalytics, GetActivityAnalytics, GetContactAnalytics
│   │   ├── ai_profile.go             # GetAIProfile, RegenerateAIProfile (calls Python service)
│   │   ├── conversations.go          # ListConversations, CreateConversation, GetConversation, DeleteConversation
│   │   ├── messages.go               # GetMessages, SendMessage (proxy + SSE stream)
│   │   ├── confirm.go                # ConfirmToolAction (proxy to Python)
│   │   ├── health.go                 # GET /health
│   │   └── helpers.go                # respondJSON, respondError utilities
│   └── middleware/
│       ├── auth.go                   # ClerkAuth: JWT verification + UserIDFromContext
│       ├── user_sync.go              # UserSync: auto-create/sync user on first request
│       └── cors.go                   # CORSHandler: CORS headers
├── migrations/
│   ├── 001_init.sql                  # Schema: 10 tables, RLS policies, indexes, seed stages
│   ├── 002_updates.sql               # Add dashboard_layout JSONB, contact_id nullable
│   ├── 003_tool_calls.sql            # Add messages.tool_calls JSONB
│   ├── 004_conversation_title.sql    # Add conversations.title TEXT
│   └── 005_task_fields.sql           # Add due_date DATE, priority TEXT, completed_at TIMESTAMPTZ
├── scripts/
│   └── seed.go                       # Database seeding script (unused in current flow)
├── Dockerfile                        # Multistage Go build
├── go.mod                            # Dependencies: chi v5, pgx v5, clerk-sdk-go
└── go.sum
```

### Handler File Organization

Each handler file follows the **factory pattern**:

```go
// contacts.go
type Contact struct {
    ID string `json:"id"`
    // fields...
}

func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Handler implementation
    }
}

func CreateContact(pool *pgxpool.Pool) http.HandlerFunc { /* ... */ }
func GetContact(pool *pgxpool.Pool) http.HandlerFunc { /* ... */ }
// etc
```

**Naming Convention:**
- Handlers: PascalCase verbs (ListContacts, CreateDeal, UpdateActivity)
- Structs: PascalCase domain types (Contact, Deal, Activity, BuyerProfile)
- SQL queries: UPPERCASE keywords, snake_case table/column names

## Frontend Directory Structure

```
frontend/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (Clerk + Providers)
│   │   ├── page.tsx                  # Marketing homepage
│   │   ├── middleware.ts             # Clerk routing middleware
│   │   ├── sign-in/
│   │   │   └── [[...sign-in]]/page.tsx      # Clerk sign-in page
│   │   ├── sign-up/
│   │   │   └── [[...sign-up]]/page.tsx      # Clerk sign-up page
│   │   ├── sso-callback/
│   │   │   └── page.tsx              # OAuth redirect handler
│   │   ├── (marketing)/              # Marketing layout group
│   │   │   ├── layout.tsx            # Marketing nav + footer
│   │   │   ├── about/page.tsx
│   │   │   ├── features/page.tsx
│   │   │   ├── pricing/page.tsx
│   │   │   ├── team/page.tsx
│   │   │   └── mission/page.tsx
│   │   ├── dashboard/                # Protected app layout
│   │   │   ├── layout.tsx            # Top bar nav, notifications, chat bubble
│   │   │   ├── page.tsx              # Dashboard home (6+ widgets)
│   │   │   ├── contacts/
│   │   │   │   ├── page.tsx          # Contact list (search, source filter, pagination)
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Contact detail (5 tabs: overview, activities, deals, buyer profile, AI profile)
│   │   │   ├── pipeline/
│   │   │   │   └── page.tsx          # Kanban board (native HTML drag-drop)
│   │   │   ├── chat/
│   │   │   │   └── page.tsx          # Full-page AI chat (conversation list, delete, rename)
│   │   │   ├── activities/
│   │   │   │   └── page.tsx          # Global activity feed
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx          # Charts: pipeline, activities, contacts
│   │   │   ├── tasks/
│   │   │   │   └── page.tsx          # Tasks list (due_date, priority, completed_at)
│   │   │   ├── settings/
│   │   │   │   └── page.tsx          # Pipeline stages (API), commission (localStorage), Coming Soon sections
│   │   │   └── workflows/
│   │   │       └── page.tsx          # Stub: honest "Coming Soon" with template previews
│   │   └── api/
│   │       └── generate-image/route.ts  # Unused (image generation stub)
│   ├── components/
│   │   ├── shared/
│   │   │   ├── AIChatBubble.tsx      # Floating chat bubble (global)
│   │   │   ├── providers.tsx         # TanStack Query + ClerkProvider wrapper
│   │   │   └── ...
│   │   ├── ui/                       # shadcn components (20+)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── table.tsx
│   │   │   ├── slider.tsx
│   │   │   └── ... (plus ~12 more)
│   │   └── marketing/                # Marketing page components
│   │       ├── LinkButton.tsx
│   │       ├── sections/
│   │       │   ├── HeroExplodedView.tsx
│   │       │   ├── PipelineDemoSection.tsx
│   │       │   ├── ContactIntelligenceSection.tsx
│   │       │   ├── LayerMockups.tsx
│   │       │   ├── LayerCard.tsx
│   │       │   ├── FinalCTASection.tsx
│   │       │   ├── SecurityTrustSection.tsx
│   │       │   ├── MiniMap.tsx
│   │       │   └── ...
│   │       └── ...
│   ├── lib/
│   │   ├── api/                      # 8 API client modules
│   │   │   ├── client.ts             # Base fetch wrapper (Bearer token auth)
│   │   │   ├── contacts.ts           # listContacts, createContact, updateContact, deleteContact
│   │   │   ├── deals.ts              # listDeals, createDeal, updateDeal, deleteDeal, listDealStages
│   │   │   ├── activities.ts         # listActivities, createActivity, listAllActivities, updateActivity
│   │   │   ├── buyer-profiles.ts     # getBuyerProfile, createBuyerProfile, updateBuyerProfile
│   │   │   ├── conversations.ts      # listConversations, createConversation, getConversation, deleteConversation, getMessages, sendMessage
│   │   │   ├── dashboard.ts          # getDashboardSummary, getDashboardLayout, saveDashboardLayout
│   │   │   ├── ai-profiles.ts        # getAIProfile, regenerateAIProfile
│   │   │   └── analytics.ts          # (implied, not listed but may exist)
│   │   ├── ai-chat-helpers.ts        # Tool labels, confirmation labels, formatPreview
│   │   ├── gemini.ts                 # Unused (image generation)
│   │   └── utils.ts                  # Utility functions
│   ├── store/
│   │   └── ui-store.ts               # Zustand: sidebar toggle, chat bubble visibility
│   ├── globals.css                   # Tailwind imports, custom CSS variables
│   └── middleware.ts                 # Clerk auth routing
├── public/
│   └── ...                           # Static assets
├── .next/                            # Next.js build output (generated)
├── node_modules/                     # Dependencies (node_modules, not tracked)
├── next.config.js                    # Next.js config (API rewrites, etc)
├── tailwind.config.ts                # Tailwind CSS configuration
├── tsconfig.json                     # TypeScript config
├── package.json                      # Dependencies: @clerk/nextjs, @tanstack/react-query, zustand, recharts, etc
├── package-lock.json
└── Dockerfile                        # Node build → Next.js server
```

### API Module Organization

Each API module (`src/lib/api/domain.ts`) follows this pattern:

```typescript
// contacts.ts
import { apiRequest } from './client';

export async function listContacts(token: string, params?: {...}): Promise<Contact[]> {
    return apiRequest<Contact[]>('/contacts', token, { /* options */ });
}

export async function createContact(token: string, data: {...}): Promise<Contact> {
    return apiRequest<Contact>('/contacts', token, {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

// Similar for update, delete, get
```

**API Client Module:**
```typescript
// client.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function apiRequest<T>(
    path: string,
    token: string,
    options?: RequestInit
): Promise<T> {
    const res = await fetch(`${BASE}/api${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options?.headers ?? {}),
        },
    });

    if (!res.ok) throw new Error(...);
    if (res.status === 204) return {} as T;
    return res.json();
}
```

**Naming Convention:**
- Modules: kebab-case (contacts.ts, buyer-profiles.ts, ai-profiles.ts)
- Functions: camelCase (listContacts, createContact, getBuyerProfile)
- Types: PascalCase (Contact, BuyerProfile, Activity)

## AI Service Directory Structure

```
ai-service/
├── app/
│   ├── __init__.py
│   ├── main.py                       # FastAPI app entry, route includes
│   ├── config.py                     # Config: DATABASE_URL, ANTHROPIC_API_KEY, etc
│   ├── database.py                   # psycopg2 ThreadedConnectionPool, get_conn, run_query
│   ├── tools.py                      # 23 tool definitions + execution (Read + Write)
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── health.py                 # GET /health
│   │   ├── chat.py                   # POST /api/messages (stream SSE), POST /api/confirm
│   │   └── profiles.py               # POST /api/profiles/generate
│   ├── services/
│   │   ├── __init__.py
│   │   └── agent.py                  # Agentic loop: load history, build prompt, Claude call, SSE stream
│   └── models/
│       └── __init__.py               # (empty, placeholder for future Pydantic models)
├── main.py                           # uvicorn entry point
├── requirements.txt                  # Dependencies: fastapi, psycopg2, anthropic
├── Dockerfile
└── .dockerignore
```

### Tools Organization (tools.py)

```python
# tools.py

TOOL_DEFINITIONS = [
    # 11 read tools + 12 write tools
    {
        "name": "get_dashboard_summary",
        "description": "...",
        "input_schema": {...}
    },
    # ... 22 more
]

READ_TOOLS = {"get_dashboard_summary", "search_contacts", ...}  # 11 tools
WRITE_TOOLS = {"create_contact", "update_contact", ...}  # 12 tools

def execute_read_tool(tool_name: str, agent_id: str, args: dict) -> dict:
    """Execute read tool immediately, return result."""
    # Dispatch to specific executor function

def queue_write_tool(tool_name: str, agent_id: str, args: dict) -> dict:
    """Queue write tool, return confirmation payload."""
    # Store in pending_actions, return preview
```

## Database Schema File Organization

```
backend/migrations/
├── 001_init.sql                      # Core schema (9.9 KB)
│   ├── CREATE TABLE users
│   ├── CREATE TABLE contacts
│   ├── CREATE TABLE buyer_profiles
│   ├── CREATE TABLE deal_stages (7 seed rows)
│   ├── CREATE TABLE deals
│   ├── CREATE TABLE activities
│   ├── CREATE TABLE conversations
│   ├── CREATE TABLE messages
│   ├── CREATE TABLE ai_profiles
│   ├── CREATE TABLE embeddings
│   ├── RLS policies (one per agent-scoped table)
│   ├── Indexes (contacts, deals, activities, etc)
│   └── Triggers (updated_at timestamp)
├── 002_updates.sql
│   ├── ALTER TABLE users ADD dashboard_layout JSONB
│   └── ALTER TABLE conversations ALTER contact_id DROP NOT NULL
├── 003_tool_calls.sql
│   └── ALTER TABLE messages ADD tool_calls JSONB
├── 004_conversation_title.sql
│   └── ALTER TABLE conversations ADD title TEXT
└── 005_task_fields.sql
    ├── ALTER TABLE activities ADD due_date DATE
    ├── ALTER TABLE activities ADD priority TEXT
    └── ALTER TABLE activities ADD completed_at TIMESTAMPTZ
```

## Middleware File Organization

```
backend/internal/middleware/

├── auth.go
│   ├── contextKey (unexported type for context keys)
│   ├── UserIDKey (context key constant)
│   ├── UserIDFromContext(ctx) → string
│   └── ClerkAuth(client) → http.Handler middleware
│
├── user_sync.go
│   ├── AgentUUIDFromContext(ctx) → string
│   ├── AgentIDKey (context key constant)
│   └── UserSync(pool, client) → http.Handler middleware
│
└── cors.go
    └── CORSHandler() → http.Handler middleware
```

## Configuration Files

### Backend
- `.env` — DATABASE_URL, CLERK_SECRET_KEY, PORT, AI_SERVICE_URL, AI_SERVICE_SECRET
- `go.mod` — Module dependencies
- `Dockerfile` — Build Go binary

### Frontend
- `.env.local` — NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_API_URL
- `next.config.js` — Next.js config (rewrites, etc)
- `tailwind.config.ts` — Tailwind theme (colors, fonts, spacing)
- `tsconfig.json` — TypeScript strict mode
- `package.json` — Node dependencies

### AI Service
- `.env` — DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, AI_SERVICE_SECRET, BACKEND_URL
- `requirements.txt` — Python dependencies
- `Dockerfile` — Build Python image

### Docker Compose
- `docker-compose.yml` — 5 services (postgres, redis, backend, ai-service, frontend)

## Naming Conventions

### Go
- **Packages:** lowercase, no underscores (`handlers`, `middleware`, `database`)
- **Exported functions:** PascalCase (ListContacts, CreateDeal)
- **Unexported functions:** camelCase (loadHistory, buildPrompt)
- **Types:** PascalCase (Contact, Activity, BuyerProfile)
- **Constants:** UPPER_SNAKE_CASE or camelCase (UserIDKey)
- **Files:** snake_case (user_sync.go, deal_stages.go)

### TypeScript/JavaScript
- **Files:** kebab-case or camelCase (contacts.ts, AIChatBubble.tsx)
- **Exported functions:** camelCase (listContacts, createContact)
- **Components:** PascalCase (AIChatBubble, DashboardLayout)
- **Types/Interfaces:** PascalCase (Contact, Activity)
- **Constants:** UPPER_SNAKE_CASE (BASE, MAX_RESULTS)
- **Variables:** camelCase (myVar, agentID)

### Python
- **Files:** snake_case (agent.py, user_sync.py)
- **Functions:** snake_case (execute_read_tool, build_system_prompt)
- **Classes:** PascalCase (Contact, Activity)
- **Constants:** UPPER_SNAKE_CASE (TOOL_DEFINITIONS, MAX_TOOL_ROUNDS)
- **Variables:** snake_case (agent_id, tool_name)

### Database
- **Tables:** plural, snake_case (users, contacts, buyer_profiles)
- **Columns:** snake_case (first_name, agent_id, created_at)
- **Constraints:** snake_case with prefix (fk_contacts_agent_id, idx_contacts_agent_id)
- **Indexes:** idx_{table}_{columns} (idx_contacts_agent_id)

## Path Summary

| Component | Root Path |
|-----------|-----------|
| Go Backend | `/Users/matthewfaust/CloAgent/Clo-Agent/backend/` |
| Backend Entry Point | `/Users/matthewfaust/CloAgent/Clo-Agent/backend/cmd/api/main.go` |
| Handlers | `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/` |
| Middleware | `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/middleware/` |
| Database Config | `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/database/` |
| Migrations | `/Users/matthewfaust/CloAgent/Clo-Agent/backend/migrations/` |
| Python AI Service | `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/` |
| AI Service Entry | `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/main.py` |
| AI Routes | `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/routes/` |
| AI Tools | `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` |
| Agent Loop | `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/services/agent.py` |
| Next.js Frontend | `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/` |
| Frontend Entry | `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/app/layout.tsx` |
| Dashboard Routes | `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/app/dashboard/` |
| API Clients | `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/lib/api/` |
| UI Components | `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/components/ui/` |
| Shared Components | `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/components/shared/` |
| Zustand Store | `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/store/ui-store.ts` |
| Docker Compose | `/Users/matthewfaust/CloAgent/Clo-Agent/docker-compose.yml` |

## Key Files for Getting Started

1. **Understanding the System:**
   - `/Users/matthewfaust/CloAgent/Clo-Agent/CLAUDE.md` — Project reference
   - `/Users/matthewfaust/CloAgent/Clo-Agent/.planning/codebase/ARCHITECTURE.md` — This document

2. **Backend Entry Point:**
   - `/Users/matthewfaust/CloAgent/Clo-Agent/backend/cmd/api/main.go` — Router + middleware setup

3. **Key Backend Concepts:**
   - `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/database/rls.go` — RLS transaction pattern
   - `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/middleware/auth.go` — Auth flow
   - `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/contacts.go` — Handler pattern

4. **AI Service:**
   - `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/services/agent.py` — Agent loop
   - `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` — Tool definitions

5. **Frontend Entry Point:**
   - `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/app/layout.tsx` — Root layout
   - `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/lib/api/client.ts` — API client wrapper

6. **Database:**
   - `/Users/matthewfaust/CloAgent/Clo-Agent/backend/migrations/001_init.sql` — Core schema

---

**Last Updated:** 2026-03-17
