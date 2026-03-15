# CloAgent

CloAgent is an AI-powered CRM built exclusively for real estate agents. It tracks every client interaction, automatically builds structured buyer profiles from unstructured conversations, and lets agents query their entire pipeline in plain English — "who should I follow up with today?" or "what did Sarah say about her budget?"

> **Market**: 3M+ licensed US real estate agents. $149/mo per agent.

---

## Architecture

```
Frontend (Next.js 14, :3000)
        ↓ REST + SSE
Backend (Go/Chi, :8080)
        ↓ HTTP proxy
AI Service (FastAPI, :8000)
        ↓
PostgreSQL 15 + pgvector
```

| Service | Port | Stack |
|---|---|---|
| Frontend | 3000 | Next.js 14, TypeScript, Tailwind, shadcn/ui, Clerk |
| Backend | 8080 | Go, Chi v5, pgx v5, Clerk JWT, RLS |
| AI Service | 8000 | Python, FastAPI, Anthropic Claude, pgvector |
| Database | 5432 | PostgreSQL 15 + pgvector |
| Cache | 6379 | Redis |

The Go backend is the single entry point for the frontend. The frontend never talks to the AI service directly — all AI requests are proxied through Go.

---

## Monorepo Structure

```
/
├── frontend/          # Next.js 14 app
├── backend/           # Go REST API
├── ai-service/        # Python FastAPI AI agent
├── docker-compose.yml # Full stack orchestration
└── .env               # Root env vars (Docker Compose reads this)
```

---

## Quickstart (Docker)

The fastest way to run everything:

### 1. Clone

```bash
git clone https://github.com/BubblySeeker/Clo-Agent.git
cd Clo-Agent
```

### 2. Fill in `.env`

The root `.env` is already in the repo with placeholder values. Fill in real keys:

```env
POSTGRES_USER=cloagent
POSTGRES_PASSWORD=<choose a password>
POSTGRES_DB=cloagent

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...   # Clerk dashboard
CLERK_SECRET_KEY=sk_test_...                    # Clerk dashboard

ANTHROPIC_API_KEY=sk-ant-...                    # console.anthropic.com
OPENAI_API_KEY=sk-...                           # platform.openai.com (for embeddings)

AI_SERVICE_SECRET=<any random string>           # shared secret between Go ↔ Python
```

### 3. Boot

```bash
docker compose up --build
```

All 5 services start in the correct order. Migrations run automatically on backend startup.

### 4. Open

- Frontend: http://localhost:3000
- Backend health: http://localhost:8080/health
- AI service health: http://localhost:8000/health

### 5. Clerk redirect

In the [Clerk dashboard](https://dashboard.clerk.com), add `http://localhost:3000/sso-callback` as an allowed redirect URL. Sign in will land you at `/dashboard`.

---

## Pages

| Route | Description |
|---|---|
| `/` | Marketing / landing page |
| `/sign-in` | Email + Google sign in |
| `/sign-up` | Account creation with email verification |
| `/dashboard` | Home — KPI cards, pipeline snapshot, activity feed, AI insights |
| `/dashboard/contacts` | Contact list with search and source filter |
| `/dashboard/contacts/[id]` | Contact detail — info, buyer profile, activity timeline |
| `/dashboard/pipeline` | Kanban board with drag-and-drop deal cards |
| `/dashboard/chat` | Full-page AI assistant with conversation history |
| `/dashboard/activities` | Global activity feed across all contacts |
| `/dashboard/tasks` | Task list filtered from activities |
| `/dashboard/analytics` | Pipeline funnel, activity charts, source breakdown |
| `/dashboard/settings` | Profile, notifications, pipeline stages, integrations |

A floating AI chat bubble is available on every page (bottom-right corner).

---

## API Endpoints

All protected routes require `Authorization: Bearer <clerk_token>`.

### Dashboard
```
GET  /api/dashboard/summary    — all dashboard data in one call
GET  /api/dashboard/layout     — agent's saved widget layout
PUT  /api/dashboard/layout     — save widget layout
```

### Contacts
```
GET    /api/contacts                        — list (?search, ?source, ?page, ?limit)
POST   /api/contacts                        — create
GET    /api/contacts/:id                    — get single
PATCH  /api/contacts/:id                    — partial update
DELETE /api/contacts/:id                    — delete (cascades)
GET    /api/contacts/:id/buyer-profile      — get buyer preferences
POST   /api/contacts/:id/buyer-profile      — create buyer profile
PATCH  /api/contacts/:id/buyer-profile      — update buyer profile
GET    /api/contacts/:id/activities         — activity timeline
POST   /api/contacts/:id/activities         — log activity
GET    /api/contacts/:id/ai-profile         — AI-generated summary
POST   /api/contacts/:id/ai-profile/regenerate — regenerate summary
```

### Deals & Pipeline
```
GET    /api/deal-stages         — all 7 pipeline stages
GET    /api/deals               — list (?stage_id, ?contact_id)
POST   /api/deals               — create
GET    /api/deals/:id           — get
PATCH  /api/deals/:id           — update (stage change = drag-drop)
DELETE /api/deals/:id           — delete
```

### Activities
```
GET  /api/activities            — global feed across all contacts
```

### AI (proxied Go → Python)
```
GET  /api/ai/conversations                    — list conversations
POST /api/ai/conversations                    — start new (?contact_id for scoped)
GET  /api/ai/conversations/:id/messages       — message history
POST /api/ai/conversations/:id/messages       — send message (SSE streaming)
POST /api/ai/conversations/:id/confirm        — confirm a pending write action
```

### Analytics
```
GET /api/analytics/pipeline    — stage counts, values, conversion
GET /api/analytics/activities  — activity volume by type
GET /api/analytics/contacts    — source breakdown, growth
```

---

## AI Agent

The AI assistant uses Claude with tool-calling. It can read your CRM data and take write actions (with user confirmation).

**Read tools** (execute immediately): `get_dashboard_summary`, `search_contacts`, `get_contact_details`, `get_contact_activities`, `list_deals`, `get_deal_stages`, `get_analytics`

**Write tools** (require confirmation card in UI): `create_contact`, `update_contact`, `log_activity`, `create_deal`, `update_deal`

Conversations are general by default. On a contact detail page, the chat bubble auto-scopes to that contact.

---

## Database

PostgreSQL 15 with pgvector. 10 tables:

| Table | Purpose |
|---|---|
| `users` | Agent accounts (synced from Clerk) |
| `contacts` | Leads and clients |
| `buyer_profiles` | Buyer preferences (1:1 with contact) |
| `deal_stages` | Pipeline columns (7 seeded) |
| `deals` | Pipeline cards |
| `activities` | Calls, emails, notes, showings, tasks |
| `conversations` | AI chat threads |
| `messages` | Messages with tool call audit trail |
| `ai_profiles` | AI-generated contact summaries |
| `embeddings` | pgvector semantic search (1536 dims) |

Row-level security is enabled on all agent-scoped tables. Every transaction runs `SET LOCAL app.current_agent_id = '<uuid>'` so RLS policies automatically scope all queries.

Migrations in `backend/migrations/` run automatically on startup:
- `001_init.sql` — full schema, RLS policies, deal stage seeds
- `002_updates.sql` — dashboard layout column, nullable contact in conversations
- `003_tool_calls.sql` — tool call audit column on messages

---

## Local Development (without Docker)

### Backend

```bash
cd backend
go mod download

# Requires DATABASE_URL and CLERK_SECRET_KEY in environment or backend/.env
go run ./cmd/api/main.go
# http://localhost:8080
```

Apply migrations manually:
```bash
psql $DATABASE_URL -f migrations/001_init.sql
psql $DATABASE_URL -f migrations/002_updates.sql
psql $DATABASE_URL -f migrations/003_tool_calls.sql
```

### AI Service

```bash
cd ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Requires ANTHROPIC_API_KEY, DATABASE_URL, AI_SERVICE_SECRET in environment or .env
python main.py
# http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install

# Requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_API_URL in .env.local
npm run dev
# http://localhost:3000
```

---

## Environment Variables

| Variable | Required by | Description |
|---|---|---|
| `POSTGRES_USER` | postgres, backend, ai-service | DB username |
| `POSTGRES_PASSWORD` | postgres, backend, ai-service | DB password |
| `POSTGRES_DB` | postgres, backend, ai-service | DB name |
| `CLERK_SECRET_KEY` | backend, frontend | Clerk secret key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | frontend | Clerk publishable key |
| `ANTHROPIC_API_KEY` | ai-service | Claude API key |
| `OPENAI_API_KEY` | ai-service | OpenAI key (embeddings) |
| `AI_SERVICE_SECRET` | backend, ai-service | Shared secret for service-to-service auth |
