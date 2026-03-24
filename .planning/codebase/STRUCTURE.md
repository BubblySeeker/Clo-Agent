# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
clo-agent/
├── backend/                      # Go API server (port 8080)
│   ├── cmd/api/main.go          # Entry point, router setup, middleware stack
│   ├── internal/
│   │   ├── config/config.go     # Env var loading (DATABASE_URL, CLERK_SECRET_KEY, etc.)
│   │   ├── database/
│   │   │   ├── postgres.go      # Connection pool initialization
│   │   │   └── rls.go           # BeginWithRLS(ctx, pool, agentID) transaction helper
│   │   ├── handlers/            # 14 handler files (contacts, deals, activities, etc.)
│   │   │   ├── contacts.go
│   │   │   ├── deals.go
│   │   │   ├── activities.go
│   │   │   ├── conversations.go # AI chat proxying
│   │   │   ├── messages.go      # SSE streaming
│   │   │   ├── confirm.go       # Write tool confirmation
│   │   │   ├── portal.go        # Client portal (public)
│   │   │   ├── documents.go     # Document upload/storage
│   │   │   ├── gmail.go         # Gmail integration
│   │   │   ├── workflows.go     # Workflow CRUD
│   │   │   ├── lead_suggestions.go
│   │   │   └── [other domain handlers]
│   │   ├── middleware/          # Middleware functions
│   │   │   ├── auth.go          # Clerk JWT validation + service secret bypass
│   │   │   ├── user_sync.go     # Auto-sync user on first request
│   │   │   └── cors.go
│   │   └── background/          # Async workers
│   │       └── email.go         # 30-second email sync loop
│   ├── migrations/              # 9 SQL migration files
│   │   ├── 001_init.sql         # Schema v1 (10 tables, RLS policies, indexes)
│   │   ├── 002_updates.sql      # dashboard_layout JSONB
│   │   ├── 003_tool_calls.sql   # messages.tool_calls
│   │   ├── 004_conversation_title.sql
│   │   ├── 005_task_fields.sql  # due_date, priority, completed_at
│   │   ├── 006_pending_actions.sql
│   │   ├── 007_agent_settings.sql
│   │   ├── 008_embeddings_unique.sql
│   │   ├── 009_workflows.sql
│   │   ├── 010_contact_folders.sql
│   │   ├── 011_documents.sql
│   │   ├── 012_gmail.sql
│   │   └── [additional migrations]
│   ├── go.mod / go.sum          # Go dependencies
│   └── Dockerfile              # Multi-stage Go build
│
├── ai-service/                  # Python FastAPI server (port 8000)
│   ├── app/
│   │   ├── main.py             # FastAPI app, router registration, startup cleanup
│   │   ├── config.py           # Env var loading (ANTHROPIC_API_KEY, DATABASE_URL, etc.)
│   │   ├── database.py         # psycopg2 thread pool, async wrapper
│   │   ├── tools.py            # Tool definitions + execution (read/write tools, pending actions)
│   │   ├── routes/             # FastAPI routers
│   │   │   ├── health.py       # GET /health
│   │   │   ├── chat.py         # POST /ai/messages, /ai/confirm, GET /ai/conversations
│   │   │   ├── profiles.py     # POST /ai/profiles/generate
│   │   │   ├── search.py       # POST /ai/search (semantic)
│   │   │   ├── workflows.py    # Workflow trigger execution
│   │   │   ├── documents.py    # Document extraction, chunking
│   │   │   └── emails.py       # Email operations
│   │   ├── services/           # Business logic
│   │   │   ├── agent.py        # Agentic loop, Claude integration, SSE streaming
│   │   │   ├── embeddings.py   # OpenAI embedding generation (disabled)
│   │   │   ├── document_processor.py # PDF/document parsing
│   │   │   ├── document_search.py    # Chunking, semantic search
│   │   │   └── workflow_engine.py    # Trigger matching, step execution
│   │   ├── models/             # Pydantic data classes
│   │   └── __init__.py
│   ├── requirements.txt         # Python dependencies (anthropic, fastapi, psycopg2, etc.)
│   ├── Dockerfile             # Multi-stage Python build
│   └── tests/
│
├── frontend/                    # Next.js 14 React app (port 3000)
│   ├── src/
│   │   ├── app/               # Next.js App Router (file-based routing)
│   │   │   ├── layout.tsx     # Root layout (Clerk provider, fonts, Providers wrapper)
│   │   │   ├── page.tsx       # Marketing home (/)
│   │   │   ├── (marketing)/   # Marketing pages group
│   │   │   │   ├── about/page.tsx
│   │   │   │   ├── features/page.tsx
│   │   │   │   ├── pricing/page.tsx
│   │   │   │   ├── team/page.tsx
│   │   │   │   └── mission/page.tsx
│   │   │   ├── sign-in/[[...sign-in]]/page.tsx  # Clerk UI
│   │   │   ├── sign-up/[[...sign-up]]/page.tsx  # Clerk UI
│   │   │   ├── portal/[token]/           # Client portal (public, magic-link auth)
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── deals/page.tsx
│   │   │   │   ├── properties/page.tsx
│   │   │   │   └── timeline/page.tsx
│   │   │   ├── dashboard/                # Protected routes (Clerk auth required)
│   │   │   │   ├── layout.tsx           # Top bar nav, sidebar, notifications, chat bubble
│   │   │   │   ├── page.tsx             # Dashboard home (metrics, widgets, customizable layout)
│   │   │   │   ├── contacts/page.tsx    # Contact list + CRUD
│   │   │   │   ├── contacts/[id]/page.tsx  # Contact detail (5 tabs: overview, activities, deals, buyer, AI profile)
│   │   │   │   ├── pipeline/page.tsx    # Kanban board (deals by stage)
│   │   │   │   ├── chat/page.tsx        # Full-page AI chat
│   │   │   │   ├── activities/page.tsx  # Global activity feed
│   │   │   │   ├── analytics/page.tsx   # KPIs, charts (pipeline, activities, contacts)
│   │   │   │   ├── tasks/page.tsx       # Task management (full CRUD)
│   │   │   │   ├── settings/page.tsx    # Commission, notifications, integrations
│   │   │   │   ├── workflows/page.tsx   # Workflow CRUD + runs
│   │   │   │   ├── properties/page.tsx  # Property listings
│   │   │   │   ├── properties/[id]/page.tsx # Property detail
│   │   │   │   ├── documents/page.tsx   # Document management (upload, preview)
│   │   │   │   ├── communication/page.tsx  # Email/call inbox unified view
│   │   │   │   └── [other routes]
│   │   │   ├── api/generate-image/route.ts  # Server action for image generation
│   │   │   └── middleware.ts            # Clerk route protection
│   │   ├── components/
│   │   │   ├── shared/                  # Reusable UI components
│   │   │   │   ├── AIChatBubble.tsx    # Floating chat bubble with SSE streaming
│   │   │   │   ├── providers.tsx       # TanStack Query provider + QueryClientProvider
│   │   │   │   ├── chat-renderers/     # Tool call, confirmation renderers
│   │   │   │   └── [other shared]
│   │   │   ├── ui/                     # shadcn components (minimal)
│   │   │   │   ├── button.tsx          # Only one shadcn component in use
│   │   │   │   └── [other UI primitives]
│   │   │   └── marketing/              # Marketing page components
│   │   │       ├── MarketingNav.tsx
│   │   │       ├── Footer.tsx
│   │   │       └── sections/
│   │   ├── lib/
│   │   │   ├── api/                    # Domain-specific API client modules
│   │   │   │   ├── client.ts           # Base fetch wrapper with Bearer token auth
│   │   │   │   ├── contacts.ts         # listContacts, createContact, etc.
│   │   │   │   ├── deals.ts
│   │   │   │   ├── activities.ts
│   │   │   │   ├── buyer-profiles.ts
│   │   │   │   ├── conversations.ts    # AI chat API functions
│   │   │   │   ├── dashboard.ts
│   │   │   │   ├── settings.ts
│   │   │   │   ├── workflows.ts
│   │   │   │   ├── properties.ts
│   │   │   │   ├── documents.ts
│   │   │   │   ├── gmail.ts
│   │   │   │   ├── portal.ts
│   │   │   │   ├── contact-folders.ts
│   │   │   │   ├── lead-suggestions.ts
│   │   │   │   └── [other domain APIs]
│   │   │   ├── utils.ts                # Utility functions (formatters, etc.)
│   │   │   └── [other shared utilities]
│   │   ├── store/
│   │   │   └── ui-store.ts             # Zustand store (sidebar, chat bubble state, citation viewer)
│   │   ├── hooks/                      # Custom React hooks (if any)
│   │   └── fonts/                      # Google font loading
│   ├── public/                         # Static assets
│   │   └── images/
│   ├── package.json                    # npm dependencies + scripts
│   ├── tsconfig.json                   # TypeScript compiler config (strict, path aliases)
│   ├── next.config.mjs                 # Next.js config
│   ├── tailwind.config.ts              # Tailwind CSS customization
│   ├── postcss.config.mjs              # PostCSS plugins
│   ├── .prettierrc                     # Prettier config
│   └── Dockerfile                      # Node.js build → Next.js server
│
├── docker-compose.yml                  # Service orchestration (postgres, redis, backend, ai-service, frontend)
├── CLAUDE.md                           # Project reference + conventions
└── .planning/
    └── codebase/                       # Codebase mapping documents (this file + ARCHITECTURE.md)
```

## Directory Purposes

**Backend Handlers (`backend/internal/handlers/`):**
- Purpose: HTTP request handling, response serialization, database transaction coordination
- Contains: 14+ files, each focused on a domain (contacts.go, deals.go, etc.)
- Key files: `contacts.go` (CRUD for contacts), `messages.go` (SSE streaming for AI), `confirm.go` (write tool confirmation)

**Backend Middleware (`backend/internal/middleware/`):**
- Purpose: Cross-cutting concerns (auth, CORS, logging, user sync)
- Contains: `auth.go` (Clerk JWT validation + service secret bypass), `user_sync.go` (auto-create user on first request), `cors.go`
- Applied to: Global middleware stack or specific route groups

**AI Service Routes (`ai-service/app/routes/`):**
- Purpose: FastAPI endpoint definitions
- Contains: `chat.py` (message handling, SSE), `profiles.py` (AI profile generation), `search.py` (semantic search), etc.
- Pattern: Each route file is a FastAPI router, imported and included in `main.py`

**AI Service Services (`ai-service/app/services/`):**
- Purpose: Business logic and complex operations
- Contains: `agent.py` (Claude loop + tool execution), `workflow_engine.py` (trigger matching), `document_processor.py` (PDF parsing), etc.
- Called by: Routes, other services

**Frontend Pages (`frontend/src/app/dashboard/`):**
- Purpose: Next.js route-based page components
- Contains: One page per route; use `"use client"` if hooks are needed
- Pattern: Import API functions, call `useQuery()` / `useMutation()`, render with Tailwind CSS

**Frontend API Modules (`frontend/src/lib/api/`):**
- Purpose: Type-safe API client functions, one file per domain
- Contains: Typed requests/responses, function per HTTP operation (list, get, create, update, delete)
- Pattern: `export async function listContacts(token, filters): Promise<ContactListResponse>`

**Frontend Store (`frontend/src/store/`):**
- Purpose: Centralized UI state management
- Contains: Single Zustand store with getters/setters
- Pattern: Import in components → `const { chatOpen, setChatOpen } = useUIStore()`

## Key File Locations

**Entry Points:**

| Service | File | Responsibility |
|---------|------|-----------------|
| Backend | `backend/cmd/api/main.go` | Load config, connect database, start HTTP server on port 8080 |
| AI Service | `ai-service/app/main.py` | FastAPI app initialization, router registration, startup cleanup |
| Frontend | `frontend/src/app/layout.tsx` | Root layout, Clerk provider, TanStack Query provider, font loading |

**Configuration:**

| Service | File | Env Vars Loaded |
|---------|------|-----------------|
| Backend | `backend/internal/config/config.go` | `DATABASE_URL`, `CLERK_SECRET_KEY`, `PORT`, `AI_SERVICE_URL`, `AI_SERVICE_SECRET`, `FRONTEND_URL`, `ENCRYPTION_KEY` |
| AI Service | `ai-service/app/config.py` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, `AI_SERVICE_SECRET`, `BACKEND_URL` |
| Frontend | `frontend/.env.local.example` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_API_URL` |

**Core Logic:**

| Domain | Backend File | AI Service File | Frontend File |
|--------|--------------|-----------------|---------------|
| Contacts | `handlers/contacts.go` | `tools.py` (read/write) | `lib/api/contacts.ts` + `app/dashboard/contacts/page.tsx` |
| Deals | `handlers/deals.go` | `tools.py` | `lib/api/deals.ts` + `app/dashboard/pipeline/page.tsx` |
| Activities | `handlers/activities.go` | `tools.py` | `lib/api/activities.ts` + `app/dashboard/activities/page.tsx` |
| AI Chat | `handlers/messages.go` (proxy) | `routes/chat.py` + `services/agent.py` | `lib/api/conversations.ts` + `app/dashboard/chat/page.tsx` |
| Workflows | `handlers/workflows.go` | `services/workflow_engine.py` | `lib/api/workflows.ts` + `app/dashboard/workflows/page.tsx` |
| Documents | `handlers/documents.go` | `routes/documents.py` + `services/document_processor.py` | `lib/api/documents.ts` + `app/dashboard/documents/page.tsx` |
| Gmail | `handlers/gmail.go` | `routes/emails.py` | `lib/api/gmail.ts` + `app/dashboard/communication/page.tsx` |

**Testing:**

| Framework | Location | Files |
|-----------|----------|-------|
| Go | `backend/internal/` | `handlers_test.go`, `helpers_test.go`, `integration_test.go` |
| Python | `ai-service/tests/` | Not actively maintained |
| TypeScript | N/A (no tests committed) | — |

## Naming Conventions

**Files:**

| Layer | Pattern | Example |
|-------|---------|---------|
| Backend handlers | `{domain}.go` | `contacts.go`, `deals.go` |
| Backend packages | `{domain}/` | `database/`, `middleware/` |
| AI routes | `{domain}.py` | `chat.py`, `profiles.py` |
| AI services | `{domain}.py` | `agent.py`, `workflow_engine.py` |
| Frontend pages | `{route}/page.tsx` | `app/dashboard/contacts/page.tsx` |
| Frontend components | `{ComponentName}.tsx` (PascalCase) | `AIChatBubble.tsx` |
| Frontend API modules | `{domain}.ts` (camelCase) | `contacts.ts`, `conversations.ts` |
| Database tables | `{plural_snake_case}` | `contacts`, `conversations`, `buyer_profiles` |
| Database migrations | `{###}_{description}.sql` | `001_init.sql`, `005_task_fields.sql` |

**Directories:**

| Layer | Pattern | Example |
|-------|---------|---------|
| Backend | `internal/{domain}/` | `internal/handlers/`, `internal/middleware/` |
| AI Service | `app/{domain}/` | `app/routes/`, `app/services/` |
| Frontend | `src/{domain}/` | `src/app/`, `src/lib/`, `src/components/` |
| Frontend routes | `{feature}/` nested in `app/` | `app/dashboard/contacts/` |

## Where to Add New Code

**New Feature (e.g., "Lead Scoring"):**
- Backend endpoint: `backend/internal/handlers/lead_scoring.go` - define handler factory
- Router registration: `backend/cmd/api/main.go` - add route in appropriate group
- Frontend page: `frontend/src/app/dashboard/lead-scoring/page.tsx` - `"use client"`, use `useQuery()`
- Frontend API: `frontend/src/lib/api/lead-scoring.ts` - export typed functions
- Database schema: `backend/migrations/{###}_lead_scoring.sql` - new table or columns
- Tests: `backend/internal/handlers/lead_scoring_test.go` - unit/integration tests

**New AI Tool (e.g., "score_lead"):**
- Tool definition: `ai-service/app/tools.py` - add to `TOOL_DEFINITIONS` list + implement `execute_read_tool()` or `queue_write_tool()`
- Tool uses database: ensure RLS context is set in calling handler (already done for all handlers)
- Frontend consumption: `frontend/src/components/shared/chat-renderers/` - add render logic if special UI needed

**New Component/Module (e.g., "ContactCard"):**
- Location: `frontend/src/components/shared/ContactCard.tsx` (reusable) or `frontend/src/components/ui/ContactCard.tsx` (UI primitive)
- Import in pages: `import { ContactCard } from "@/components/shared/ContactCard"`
- Style: Tailwind CSS only, no CSS files
- Props: TypeScript interfaces, export types for consumers

**New Database Table (e.g., "lead_scores"):**
- Migration file: `backend/migrations/{###}_lead_scores.sql`
- Include: CREATE TABLE, RLS policies (if agent-scoped), indexes, triggers
- No data migrations in schema; handle in handlers or background jobs
- Foreign keys should CASCADE DELETE where appropriate for cleanup

**Utilities/Helpers:**
- Shared (used by multiple modules): `frontend/src/lib/utils.ts` or `backend/internal/utils/` or `ai-service/app/utils.py`
- Domain-specific: Keep in domain file (e.g., helper function in `contacts.go`) or separate `{domain}_utils.go`

## Special Directories

**Migrations (`backend/migrations/`):**
- Purpose: Version-controlled database schema changes
- Generated: No (manual SQL files)
- Committed: Yes (all migrations checked in)
- Applied on: Backend startup (Docker entrypoint or manual `psql` command)
- Convention: Numbered `{###}_{description}.sql`, applied in order

**Public Assets (`frontend/public/`):**
- Purpose: Static files served directly (images, favicons, etc.)
- Generated: No (committed source assets)
- Committed: Yes
- Served from: `/` at runtime (e.g., `/public/images/logo.png` → `/images/logo.png`)

**Node Modules (`frontend/node_modules/`):**
- Purpose: Dependency packages
- Generated: Yes (by `npm install`)
- Committed: No (in `.gitignore`)

**Build Output (`frontend/.next/`, `backend/dist/`):**
- Purpose: Compiled code
- Generated: Yes (by `npm run build` or Go compiler)
- Committed: No (in `.gitignore`)

**Next.js App Router Conventions (`frontend/src/app/`):**
- `layout.tsx` — Nested layouts (define layout structure and shared UI)
- `page.tsx` — Page component (only rendered for the route)
- `[[...slug]]/` — Catch-all segment (e.g., `sign-in/[[...sign-in]]/` for Clerk)
- `(group)/` — Route grouping without URL segment (e.g., `(marketing)/about/`)
- Dynamic routes: `[id]/page.tsx` — captures URL parameter (accessed via `useParams()`)

---

*Structure analysis: 2026-03-24*
