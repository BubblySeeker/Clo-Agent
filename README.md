# CloAgent

CloAgent is a subscription SaaS CRM built exclusively for real estate agents. It monitors every touchpoint — emails, texts, WhatsApp messages, and phone calls — and automatically extracts key details like budget, preferred neighborhoods, timeline, and pre-approval status, updating each client profile in real time. Unstructured conversations become structured client assets automatically.

Agents can also chat directly with CloAgent, asking questions like "who should I follow up with today?" or "what did Sarah say about her budget?", making their entire client database queryable in plain English.

> **Market**: 3M+ licensed US real estate agents. $149/mo per agent = ~$5.4B TAM.

## Monorepo Structure

```
/
├── frontend/      # Next.js 14 app (TypeScript, Tailwind, shadcn/ui)
├── ai-service/    # Python FastAPI service (LangChain, pgvector)
└── backend/       # Go REST API (Chi, pgx, Clerk JWT auth)
```

---

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3.10+
- Go 1.22+
- PostgreSQL 15+ with `pgvector` extension

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/BubblySeeker/Clo-Agent.git
cd Clo-Agent
```

---

### 2. Frontend (`/frontend`)

#### Install dependencies

```bash
cd frontend
npm install
```

#### Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

> The frontend does not ship a committed `.env.local.example` — create one manually or set the variables below directly.

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (from [Clerk dashboard](https://dashboard.clerk.com)) |
| `CLERK_SECRET_KEY` | Clerk secret key (from Clerk dashboard) |

#### Run the development server

```bash
npm run dev
# http://localhost:3000
```

---

### 3. AI Service (`/ai-service`)

#### Create and activate a virtual environment

**macOS / Linux:**
```bash
cd ai-service
python3 -m venv venv
source venv/bin/activate
```

**Windows:**
```bash
cd ai-service
python -m venv venv
venv\Scripts\activate
```

#### Install dependencies

```bash
pip install -r requirements.txt
```

#### Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env` with your values. See [`ai-service/.env.example`](./ai-service/.env.example) for the full list.

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key (from [console.anthropic.com](https://console.anthropic.com)) |
| `OPENAI_API_KEY` | OpenAI API key (from [platform.openai.com](https://platform.openai.com)) |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:password@localhost:5432/aicrm`) |

#### Run the development server

```bash
python main.py
# http://localhost:8000
# http://localhost:8000/health
```

---

### 4. Backend (`/backend`)

#### Prerequisites

- Go 1.22+ — install via `brew install go` or [go.dev/dl](https://go.dev/dl)
- PostgreSQL 15+ with `pgvector` extension

#### Install dependencies

```bash
cd backend
go mod download
```

#### Configure environment variables

Create a `.env` file in `/backend`:

```bash
cp .env.example .env   # or create manually
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgres://user:password@localhost:5432/crm`) |
| `CLERK_SECRET_KEY` | Clerk secret key (from [Clerk dashboard](https://dashboard.clerk.com)) |
| `REDIS_URL` | Redis connection string (e.g. `redis://localhost:6379`) |
| `PORT` | HTTP port (default: `8080`) |

#### Apply the database schema

```bash
psql $DATABASE_URL -f migrations/001_init.sql
```

> The migration enables `pgvector`, creates all tables, sets up row-level security policies, and seeds default deal stages.

#### Run the development server

```bash
go run ./cmd/api/main.go
# http://localhost:8080
```

#### Health check

```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

#### Build for production

```bash
go build -o bin/crm-api ./cmd/api
./bin/crm-api
```

#### Folder structure

```
backend/
├── cmd/api/main.go              # Entry point, router setup, graceful shutdown
├── internal/
│   ├── config/config.go         # Environment variable loading
│   ├── database/postgres.go     # pgxpool connection
│   ├── handlers/health.go       # GET /health
│   ├── middleware/
│   │   ├── auth.go              # Clerk JWT validation, sets agent ID in context
│   │   └── cors.go              # CORS configuration
│   └── models/                  # Shared struct definitions
└── migrations/
    └── 001_init.sql             # Full PostgreSQL schema + RLS policies
```

#### Authentication

All routes under `/api/*` require a valid Clerk session token:

```
Authorization: Bearer <clerk_session_token>
```

The middleware verifies the token with Clerk, extracts the user ID, and sets `app.current_agent_id` on the DB session so row-level security policies automatically scope all queries to the authenticated agent.

---

## Services Overview

| Service | Port | Stack |
|---|---|---|
| Frontend | 3000 | Next.js 14, Clerk, TanStack Query |
| AI Service | 8000 | FastAPI, LangChain, pgvector |
| Backend API | 8080 | Go, Chi, pgx, Clerk JWT |
