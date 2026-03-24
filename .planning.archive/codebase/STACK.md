# CloAgent Technology Stack

## Overview

CloAgent is a monorepo containing three separate services that communicate via HTTP APIs. All services are containerized with Docker and orchestrated via Docker Compose.

---

## Frontend

**Technology**: Next.js 14 with TypeScript
**Runtime**: Node.js (18+)
**Package Manager**: npm
**Port**: 3000

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

Configuration:
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

---

## Backend

**Technology**: Go 1.24
**Framework**: Chi v5 (HTTP router)
**Port**: 8080
**Build Output**: Static binary (no CGO)

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

1. `chi/middleware.RequestID` — Request tracing
2. `chi/middleware.RealIP` — Client IP extraction
3. `chi/middleware.Logger` — Structured JSON logging
4. `chi/middleware.Recoverer` — Panic recovery
5. `chi/middleware.Compress(5)` — Gzip compression
6. `middleware.CORSHandler()` — CORS (global)
7. `middleware.ClerkAuth()` — JWT validation (protected routes)
8. `middleware.UserSync()` — Auto-sync Clerk users (protected routes)

### HTTP Server Configuration

- Read timeout: 15s
- Write timeout: 30s
- Idle timeout: 60s

---

## AI Service

**Technology**: Python 3.11
**Framework**: FastAPI
**ASGI Server**: Uvicorn
**Port**: 8000

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

---

## Database

**Technology**: PostgreSQL 15 with pgvector extension
**Container Image**: `pgvector/pgvector:pg15`
**Port**: 5432
**Credentials**: Loaded from `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`)

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

All queries on agent-scoped tables run within a transaction with:
```sql
SET LOCAL app.current_agent_id = '<uuid>'
```

RLS policies automatically filter all rows to the authenticated agent.

---

## Cache & Message Queue

**Technology**: Redis 7 (Alpine)
**Container Image**: `redis:7-alpine`
**Port**: 6379
**Status**: Configured but **unused** (placeholder for future notifications/session cache)

---

## Container Orchestration

**Technology**: Docker Compose
**Network**: `cloagent` bridge
**Health Checks**: Configured for postgres and redis

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

---

## Environment Configuration

### Root `.env` File

```
POSTGRES_USER=cloagent
POSTGRES_PASSWORD=<password>
POSTGRES_DB=cloagent
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-... (optional)
AI_SERVICE_SECRET=<shared-secret>
```

### Backend `.env`

```
DATABASE_URL=postgres://user:pass@localhost:5432/cloagent
CLERK_SECRET_KEY=sk_test_...
REDIS_URL=redis://localhost:6379
PORT=8080
AI_SERVICE_URL=http://localhost:8000 (default) or http://ai-service:8000 (docker)
AI_SERVICE_SECRET=<shared-secret>
```

### Frontend `.env.local`

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### AI Service `.env`

```
DATABASE_URL=postgresql://user:pass@localhost:5432/cloagent
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-... (optional)
AI_SERVICE_SECRET=<shared-secret>
BACKEND_URL=http://localhost:8080 or http://backend:8080 (docker)
```

---

## Build & Development Scripts

### Frontend

```json
{
  "dev": "next dev",           // Start dev server (:3000)
  "build": "next build",       // Build for production
  "start": "next start",       // Start production server
  "lint": "next lint"          // Run ESLint
}
```

### Backend

```bash
go build -o server ./cmd/api     // Build binary
```

### AI Service

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Local Development (via Docker Compose)

```bash
docker-compose up          # Start all services
docker-compose down        # Stop all services
```

---

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

---

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
