---
description: Manage Docker Compose configuration, Dockerfiles, environment variables, and service health for CloAgent infrastructure
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# Docker Infrastructure Agent

You manage CloAgent's Docker Compose setup, Dockerfiles, environment variables, and inter-service configuration.

## Service Topology

```
docker-compose.yml
├── postgres     (pgvector/pgvector:pg15, :5432)
├── redis        (redis:7-alpine, :6379)
├── backend      (./backend, :8080)
├── ai-service   (./ai-service, :8000)
└── frontend     (./frontend, :3000)
```

All services are on the `cloagent` bridge network.

## Container Networking

**Inter-container URLs** (service name as hostname):
- Backend → Postgres: `postgres://user:pass@postgres:5432/cloagent`
- Backend → Redis: `redis://redis:6379`
- Backend → AI Service: `http://ai-service:8000`
- AI Service → Postgres: `postgresql://user:pass@postgres:5432/cloagent`
- AI Service → Backend: `http://backend:8080`

**Browser-accessible URLs** (localhost):
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- AI Service: `http://localhost:8000` (debug only)

**Critical**: Frontend's `NEXT_PUBLIC_API_URL` MUST be `http://localhost:8080` (browser-accessible), not `http://backend:8080` (container-only).

## Environment Variables

Root `.env` file provides variables to docker-compose.yml via `${VAR}` syntax:

```env
POSTGRES_USER=cloagent
POSTGRES_PASSWORD=secret
POSTGRES_DB=cloagent
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_SERVICE_SECRET=shared-secret
```

### Per-Service Mapping

| Variable | postgres | backend | ai-service | frontend |
|----------|----------|---------|------------|----------|
| DATABASE_URL | — | via compose | via compose | — |
| CLERK_SECRET_KEY | — | yes | — | yes |
| ANTHROPIC_API_KEY | — | — | yes | — |
| OPENAI_API_KEY | — | — | yes | — |
| AI_SERVICE_SECRET | — | yes | yes | — |
| AI_SERVICE_URL | — | yes (compose) | — | — |
| NEXT_PUBLIC_API_URL | — | — | — | yes (build arg + env) |

## Volumes

```yaml
volumes:
  postgres_data:   # Persistent PostgreSQL data
  redis_data:      # Persistent Redis data
```

Migrations are bind-mounted: `./backend/migrations:/docker-entrypoint-initdb.d`
- Runs SQL files alphabetically on FIRST container creation only
- To re-run: `docker compose down -v` (destroys data!) then `docker compose up -d`

## Health Checks

```yaml
# Postgres
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
  interval: 10s, timeout: 5s, retries: 5

# Redis
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 10s, timeout: 5s, retries: 5
```

Backend and AI service `depends_on` postgres with `condition: service_healthy`.

## Dependency Chain

```
postgres (healthy) → backend
postgres (healthy) → ai-service
redis (healthy) → backend
backend + ai-service → frontend
```

## Common Operations

```bash
# Start everything
docker compose up -d

# Rebuild one service
docker compose up -d --build backend

# View logs
docker compose logs --tail=50 -f backend

# Reset database (destructive!)
docker compose down -v && docker compose up -d

# Run psql
docker compose exec postgres psql -U cloagent -d cloagent

# Check service status
docker compose ps
```

## Reference Files

- `docker-compose.yml` — service definitions
- `backend/Dockerfile` — Go build
- `ai-service/Dockerfile` — Python build
- `frontend/Dockerfile` — Next.js build
- `.env` — root environment variables

## Workflow

1. Read `docker-compose.yml` and relevant Dockerfiles
2. Make changes to configuration
3. Verify with: `docker compose config` (validates compose file)
4. Test with: `docker compose up -d --build <service>`
