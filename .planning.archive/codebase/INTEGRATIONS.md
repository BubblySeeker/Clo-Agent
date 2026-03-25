# CloAgent External Integrations

---

## Authentication & Identity

### Clerk
**Type**: SaaS authentication platform
**Purpose**: User sign-up, sign-in, session management, JWT token generation
**Status**: Production-ready

#### Configuration

| Layer | Config | File | Details |
|-------|--------|------|---------|
| **Frontend** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `frontend/.env.local` | Public key for client-side auth |
| **Frontend** | `CLERK_SECRET_KEY` | `frontend/.env.local` | Secret key for server-side operations (Next.js) |
| **Backend** | `CLERK_SECRET_KEY` | `backend/.env` | Secret key for JWT validation |

#### Implementation

**Frontend Integration**:
- `frontend/src/middleware.ts` — Clerk middleware wraps all routes
  - Protects dashboard routes (`/dashboard/*`) — redirects to sign-in if not authenticated
  - Allows public routes: `/`, `/sign-in`, `/sign-up`, `/sso-callback`, `/features`, `/pricing`, `/about`, `/team`, `/mission`
  - Redirects authenticated users away from auth routes back to dashboard
- Uses `@clerk/nextjs` v5.7.5 with built-in components (sign-in/up pages)
- `useAuth()` hook in page components to retrieve JWT via `getToken()` — passed as Bearer token in all API requests

**Backend Integration**:
- `backend/cmd/api/main.go:61` — Initialize Clerk client with `CLERK_SECRET_KEY`
- `backend/internal/middleware/auth.go` — Middleware validates Bearer tokens
  - Expects Authorization header: `Bearer <token>`
  - Calls `client.VerifyToken(sessionToken)` to validate JWT signature
  - Extracts `claims.Subject` (Clerk user ID) and stores in request context
  - Returns 401 on invalid/expired tokens
- `backend/internal/middleware/user_sync.go` — Auto-create/update user in database
  - Pulls user metadata from Clerk on first request
  - Creates row in `users` table if new user
  - Sets `users.clerk_id`, `email`, `name`

**Token Flow**:
1. Clerk issues session token to frontend
2. Frontend calls `getToken()` to get JWT
3. Frontend includes JWT in `Authorization: Bearer <token>` header
4. Backend validates JWT signature via Clerk SDK
5. Backend extracts user ID and syncs to database

#### API Reference

- Clerk Dashboard: https://dashboard.clerk.com
- SDK Docs: https://clerk.com/docs/references/sdk
- Verifying tokens: Backend validates tokens server-side (no frontend verification)

---

## AI & LLM

### Anthropic Claude API
**Type**: Large Language Model API
**Purpose**: Core AI agent for CloAgent — conversational interface, tool calling, contact context reasoning
**Status**: Production-ready
**Model**: Claude 3.5 Haiku (default: `claude-haiku-4-5-20251001`)

#### Configuration

| Layer | Config | File | Details |
|-------|--------|------|---------|
| **AI Service** | `ANTHROPIC_API_KEY` | `ai-service/.env` | API key for authentication |
| **AI Service** | `ANTHROPIC_MODEL` | `ai-service/app/config.py:7` | Model ID (default: Haiku 4.5) |

#### Implementation

**AI Service Integration**:
- `ai-service/app/services/agent.py` — Core agent loop
  - Loads conversation history from database (last 20 messages)
  - Builds system prompt with agent context + optional contact context (buyer profile, recent activities)
  - Calls Claude via Anthropic SDK with:
    - `model=MODEL` (Haiku 4.5)
    - `max_tokens=1024`
    - `tools=TOOL_DEFINITIONS` (23 tools defined)
  - Implements tool-calling loop (max 5 rounds) with `stop_reason == "tool_use"`
  - Streams final text response word-by-word via SSE to frontend
  - Saves assistant message to `messages` table with `tool_calls` JSONB

**Tool Integration**:
- `ai-service/app/tools.py` — 23 tool definitions + execution
  - 11 read tools (execute immediately via database queries)
  - 12 write tools (queue for user confirmation via in-memory dict)
  - Tools access database directly (psycopg2); no backend proxy needed
  - Tool schemas defined in Anthropic format (input_schema with type/properties/required)

**Conversation Scoping**:
- `ai-service/app/services/agent.py:64-100` — Contact-scoped conversations
  - When `conversations.contact_id` is set, pre-loads contact details + buyer profile + recent activities
  - Injects into system prompt as "Current Contact Context"
  - Claude uses this context to reason about contact-specific actions

**Streaming**:
- `ai-service/app/routes/chat.py` — SSE (Server-Sent Events) streaming
  - Returns `text/event-stream` content type
  - Streams events: `text_chunk`, `tool_use`, `confirmation`, `error`, `done`
  - Frontend parses events and streams to user in real-time

#### API Reference

- Docs: https://docs.anthropic.com
- Models: https://docs.anthropic.com/en/docs/about/models/overview
- Tool use: https://docs.anthropic.com/en/docs/build/tool-use

---

### OpenAI API
**Type**: Large Language Model API (alternative)
**Purpose**: Unused placeholder for future multi-model support
**Status**: Installed but not implemented

#### Configuration

| Layer | Config | File | Details |
|-------|--------|------|---------|
| **AI Service** | `OPENAI_API_KEY` | `ai-service/.env` | API key (optional) |

#### Current Usage

- Imported in `ai-service/requirements.txt` (v2.26.0) but **not called** anywhere in code
- No routes or tools use OpenAI
- Exists for future expansion (e.g., embeddings via OpenAI, fallback models)

---

## Database

### PostgreSQL 15 + pgvector Extension
**Type**: Relational database + vector extension
**Purpose**: Persistent storage for all application data
**Status**: Production-ready
**Docker Image**: `pgvector/pgvector:pg15`

#### Configuration

| Layer | Config | File | Details |
|-------|--------|------|---------|
| **Docker Compose** | Service definition | `docker-compose.yml:2-20` | pgvector/pgvector:pg15 image, port 5432 |
| **Backend** | `DATABASE_URL` | `backend/.env` | PostgreSQL connection string: `postgres://user:pass@host:5432/db` |
| **AI Service** | `DATABASE_URL` | `ai-service/.env` | PostgreSQL connection string (same as backend) |
| **Env Root** | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `.env` | Credentials for Docker container startup |

#### Implementation

**Backend**:
- `backend/internal/database/postgres.go` — pgx v5 connection pool
  - Max 25 connections, min 5, 30-minute lifetime, 5-minute idle timeout
  - Health check every 1 minute
  - Connects via `pgxpool.NewWithConfig(ctx, cfg)`
- All queries execute within RLS transactions via `database.BeginWithRLS(ctx, pool, agentID)`
  - Sets `SET LOCAL app.current_agent_id = '<uuid>'` before query
  - RLS policies automatically filter rows to authenticated agent

**AI Service**:
- `ai-service/app/database.py` — psycopg2 (sync) thread pool
  - 1-10 connections, thread-safe
  - Wrapped with `asyncio.to_thread` for use in async FastAPI routes
  - Context manager pattern: `with get_conn() as conn:`

**Migrations**:
- `backend/migrations/001_init.sql` — Creates 10 tables, RLS policies, indexes, triggers, seeds 7 deal stages
- `backend/migrations/002_updates.sql` — Adds JSONB columns (dashboard_layout, contact_id nullable)
- `backend/migrations/003_tool_calls.sql` — Adds tool_calls JSONB to messages
- `backend/migrations/004_conversation_title.sql` — Adds title to conversations
- `backend/migrations/005_task_fields.sql` — Adds task-specific columns (due_date, priority, completed_at)
- Auto-runs on container start via volume mount to `/docker-entrypoint-initdb.d`

**Tables**:
- `users` — Agent accounts, RLS-protected
- `contacts` — Leads/clients, RLS-protected
- `buyer_profiles` — Buyer preferences, 1:1 contact
- `deal_stages` — 7 seeded stages (Lead, Contacted, Touring, Offer, Under Contract, Closed, Lost)
- `deals` — Pipeline cards, RLS-protected
- `activities` — Call/email/note/showing/task logs, RLS-protected
- `conversations` — AI chat threads, RLS-protected
- `messages` — Chat messages + tool_calls JSONB
- `ai_profiles` — AI-generated summaries
- `embeddings` — pgvector for semantic search (**unused**)

#### Connection Pooling & RLS

- All agent-scoped tables have RLS policies defined
- Every transaction sets `app.current_agent_id` via `SET LOCAL`
- Policies use `auth.uid()` → `app.current_agent_id` to filter rows
- Prevents data leakage between agents even if auth middleware fails

---

## Cache & Session Storage

### Redis 7
**Type**: In-memory data structure store
**Purpose**: Placeholder for future notifications, session caching, real-time updates
**Status**: Configured but **unused**
**Docker Image**: `redis:7-alpine`

#### Configuration

| Layer | Config | File | Details |
|-------|--------|------|---------|
| **Docker Compose** | Service definition | `docker-compose.yml:22-35` | redis:7-alpine image, port 6379 |
| **Backend** | `REDIS_URL` | `backend/.env` | Connection string: `redis://host:6379` |
| **Backend Config** | Loaded but unused | `backend/internal/config/config.go:43` | `cfg.RedisURL` populated but never referenced |

#### Current Usage

- Imported into config but **never used** in backend code
- No routes, handlers, or services consume Redis
- Health check configured (responds to `redis-cli ping`)
- Reserved for future features:
  - Session persistence (currently handled by Clerk)
  - Real-time notification delivery
  - Activity feed caching
  - Temporary pending action storage (currently in-memory Python dict)

---

## Internal Service-to-Service Communication

### Backend ↔ AI Service

**Type**: HTTP/REST proxy
**Protocol**: HTTP/1.1, optional shared secret auth
**Purpose**: Frontend sends messages to backend; backend proxies to AI service

#### Configuration

| Layer | Config | File | Details |
|-------|--------|------|---------|
| **Backend** | `AI_SERVICE_URL` | `backend/.env` | Base URL: `http://localhost:8000` (dev) or `http://ai-service:8000` (docker) |
| **Backend** | `AI_SERVICE_SECRET` | `backend/.env` | Shared secret for request validation |
| **AI Service** | `AI_SERVICE_SECRET` | `ai-service/.env` | Same shared secret for validation |
| **AI Service** | `BACKEND_URL` | `ai-service/.env` | Backend URL for reverse calls: `http://localhost:8080` (dev) or `http://backend:8080` (docker) |

#### Implementation

**Request Flow**:
1. Frontend sends message → `POST /api/ai/conversations/{id}/messages` (backend)
2. Backend saves user message to database
3. Backend proxies request to `POST /ai/messages` (AI service)
   - Headers include `X-AI-Service-Secret: <secret>`
   - Frontend request context (conversation ID, agent ID, contact ID) passed as JSON body
4. AI service validates secret header
5. AI service streams SSE response back to backend
6. Backend streams SSE response back to frontend (flushing per event)

**Headers**:
- `X-AI-Service-Secret` — Shared secret for mutual authentication
- Standard HTTP headers (Content-Type, Authorization, etc.)

**Endpoints**:

Backend → AI Service:
```
POST  /ai/messages          — Send message, stream response
POST  /ai/profiles/generate — Generate AI profile for contact
POST  /ai/confirm           — Confirm pending write tool action
GET   /health               — Health check
```

AI Service → Backend (reverse calls):
- Currently unused; all tools access database directly
- Future: could be used for backend-side business logic validation

#### Data Isolation

- AI service runs separate from backend but shares database
- All queries respect RLS (agent_id filtering) regardless of service
- No cross-agent data exposure even if secrets compromised (database RLS prevents it)

---

## Monitoring & Observability

### Structured Logging
**Type**: Application logs
**Purpose**: Debugging, audit trail

#### Backend
- JSON structured logs via Go `log/slog` with `JSONHandler`
- Log level: `LevelInfo`
- Fields: `time`, `level`, `msg`, `addr` (for server start), `signal` (for shutdown), `error` (on failure)
- Logs to stdout (captured by Docker)

#### AI Service
- Uvicorn access logs to stdout
- No custom logging configured
- FastAPI logs available via `logging` module if configured

#### Frontend
- Browser console logs (React, TanStack Query)
- No server-side logging (Next.js default to stdout)

### No External Monitoring Configured
- No Datadog, New Relic, Sentry, or CloudWatch integration
- No error tracking service connected
- No performance monitoring service connected
- Future: Add Sentry for error tracking, DataDog for APM

---

## External APIs & Integrations (Unused/Placeholder)

### Email Delivery
**Status**: Not implemented
**Purpose**: Send transactional emails (activity notifications, digest emails)
**Placeholder**: Settings page mentions "Email Integrations" (Coming Soon)
**Potential Services**: SendGrid, Mailgun, AWS SES, Resend

### SMS Delivery
**Status**: Not implemented
**Purpose**: Send SMS notifications, activity alerts
**Potential Services**: Twilio, AWS SNS, MessageBird

### Real Estate Data Providers
**Status**: Not implemented
**Purpose**: Property listings, MLS integration, market data
**Potential Services**: Zillow API, Realtor.com API, MLS systems, CoreLogic

### CRM Integrations
**Status**: Not implemented
**Purpose**: Sync with other CRM platforms
**Potential Services**: HubSpot, Salesforce, Pipedrive APIs

### Calendar Sync
**Status**: Not implemented
**Purpose**: Sync activities with Google Calendar, Outlook
**Potential Services**: Google Calendar API, Microsoft Graph API

### Video Call Integrations
**Status**: Not implemented
**Purpose**: Virtual showings, agent meetings
**Potential Services**: Zoom API, Google Meet API, Twilio Video

---

## Semantic Search & Embeddings

### pgvector (PostgreSQL Extension)
**Type**: Vector database extension
**Purpose**: Semantic search on contact data, activity logs
**Status**: Installed in database, **not implemented**

#### Configuration

| Layer | Config | File | Details |
|-------|--------|------|---------|
| **Database** | Extension | `backend/migrations/001_init.sql` | Creates `embeddings` table with `embedding(1536)` column |
| **AI Service** | pgvector client | `ai-service/requirements.txt:24` | `pgvector==0.4.2` installed |

#### Current Usage

- `embeddings` table exists in schema but **never populated**
- No code generates embeddings on contact/activity creation
- No search endpoint implemented
- Future: Generate embeddings via Claude API or OpenAI on create/update, then query via `<-> ` (cosine similarity) operator

#### Future Implementation

1. On contact/activity create: Generate embedding via Anthropic or OpenAI embedding model
2. Store in `embeddings` table with `source_type`, `source_id`, `content`, `embedding`
3. Add `POST /api/search?q=<query>` endpoint that:
   - Generates embedding for query
   - Returns rows sorted by cosine similarity
4. Use in AI agent for semantic recall of historical contacts/activities

---

## Summary Table

| Integration | Type | Purpose | Status | Config |
|-------------|------|---------|--------|--------|
| **Clerk** | Auth | User authentication, JWT | ✅ Production | ENV vars (keys) |
| **Anthropic Claude** | LLM | AI agent, tool calling | ✅ Production | `ANTHROPIC_API_KEY` |
| **OpenAI** | LLM | Embeddings (future) | ⚠️ Unused | `OPENAI_API_KEY` |
| **PostgreSQL 15** | Database | Persistent storage | ✅ Production | `DATABASE_URL` |
| **pgvector** | Embeddings | Semantic search | 🔴 Stub | None (schema only) |
| **Redis** | Cache | Session/notification cache | 🔴 Unused | `REDIS_URL` |
| **Email** | Notifications | Transactional emails | 🔴 Not implemented | N/A |
| **SMS** | Notifications | Text alerts | 🔴 Not implemented | N/A |
| **Real Estate APIs** | Data | Property listings, MLS | 🔴 Not implemented | N/A |
| **CRM Integrations** | Sync | Connect to other CRMs | 🔴 Not implemented | N/A |
| **Calendar APIs** | Sync | Google, Outlook sync | 🔴 Not implemented | N/A |
| **Video APIs** | Comms | Zoom, Meet, Twilio Video | 🔴 Not implemented | N/A |

**Legend**:
- ✅ Production-ready
- ⚠️ Installed but unused
- 🔴 Not implemented (feature stub)

---

## Authentication & Authorization Model

### Token-Based Flow (JWT)

```
User → Clerk (login) → Session Token → Frontend stores in secure cookie
↓
User Action (API call) → Frontend calls getToken() → JWT → Authorization: Bearer <JWT>
↓
Backend receives request → Validate JWT signature (Clerk SDK) → Extract user ID
↓
UserSync middleware → Auto-create/update in database → Set app.current_agent_id
↓
All queries → RLS policies filter rows by agent_id → Return only user's data
```

### Data Isolation Guarantees

1. **Frontend**: Only shows data for authenticated user (via Clerk session)
2. **Backend API**: Validates JWT, rejects missing/invalid tokens → 401
3. **Database**: RLS policies on all agent-scoped tables prevent cross-agent access
4. **AI Service**: Reads/writes only via database; RLS enforced automatically

**Cross-Service Attack Prevention**:
- Even if AI service compromised, RLS prevents data leakage
- Shared secret (`AI_SERVICE_SECRET`) validates backend-to-AI requests
- Frontend never calls AI service directly (avoids exposure of secrets)

---

## Configuration Loading Strategy

### Order of Precedence
1. **Environment variables** (highest)
2. **`.env` files** (if present)
3. **Defaults** (lowest)

### Files Read at Startup

| Service | Files | Order |
|---------|-------|-------|
| **Backend** | `.env`, env vars | Load `.env` first, env vars override |
| **AI Service** | `.env`, env vars | Load `.env` first via `python-dotenv` |
| **Frontend** | Build-time args, `.env.local`, `.env` | Next.js build-time injection |
| **Docker Compose** | `.env` at root | Passes to all containers |

### Safe Patterns

- No secrets checked into git (`.env` in `.gitignore`)
- `.env.example` files show required keys
- Build process fails if required keys missing
- Frontend only exposes `NEXT_PUBLIC_*` keys (others stripped at build)

---

## Webhook & Real-Time Capabilities

### Server-Sent Events (SSE)
**Type**: HTTP push streaming
**Purpose**: Stream AI responses to frontend in real-time

#### Implementation

- `ai-service/app/routes/chat.py` — POST `/ai/messages` returns `text/event-stream`
- Events streamed: `text_chunk` (word-by-word), `tool_use` (Claude calling a tool), `confirmation` (write tool pending), `error`, `done`
- Backend streams SSE directly to frontend without re-wrapping
- Browser `EventSource` API parses events in real-time

### WebSocket (Not Implemented)
- Not used; SSE sufficient for unidirectional (server → client) streaming
- Future: If bidirectional real-time needed (e.g., live collaboration), add WebSocket layer

### Polling (Not Implemented)
- No polling-based endpoints currently used
- TanStack Query handles refetch intervals, but no active polling in use

---

## Future Integration Points

Based on "Path Forward" in CLAUDE.md:

1. **Semantic Search** — Generate embeddings on contact/activity create, implement search endpoint
2. **Communication Page** — Email/SMS delivery integration
3. **Notifications** — Real notification system (currently stubbed)
4. **Real Estate APIs** — Zillow, MLS, CoreLogic integration
5. **Video Calls** — Zoom, Google Meet for virtual showings
6. **Calendar Sync** — Google Calendar, Outlook integration
7. **CRM Sync** — HubSpot, Salesforce, Pipedrive
