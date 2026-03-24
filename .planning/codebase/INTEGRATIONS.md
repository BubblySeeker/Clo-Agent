# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**Authentication & Identity:**
- Clerk - User authentication, JWT token management, user sync
  - SDK: `@clerk/nextjs` (frontend), `github.com/clerkinc/clerk-sdk-go` (backend)
  - Auth: `CLERK_SECRET_KEY` (env var, server-side validation)
  - Implementation: Frontend uses Clerk Sign-In/Sign-Up UI, backend validates JWT via `middleware/auth.go`
  - User auto-sync: First request triggers `UserSync` middleware to create/update `users` table

**Email & Communication:**
- Google Gmail API - Email sync, search, draft, send
  - OAuth 2.0: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
  - Scopes: `gmail.GmailReadonlyScope`, `gmail.GmailSendScope`, `gmail.GmailModifyScope`
  - Implementation: `backend/internal/handlers/gmail.go` manages OAuth flow and email operations
  - Endpoints: `POST /api/gmail/auth/init`, `GET /api/gmail/status`, `DELETE /api/gmail/disconnect`, `POST /api/gmail/sync`, `GET /api/gmail/emails`, `POST /api/gmail/send`
  - Tokens: Encrypted and persisted in database

**LLM & AI:**
- Anthropic Claude API - Agentic loop, tool execution
  - SDK: `anthropic==0.84.0` (Python)
  - Model: `claude-haiku-4-5-20251001` (configurable via `ANTHROPIC_MODEL`)
  - Auth: `ANTHROPIC_API_KEY` (env var)
  - Implementation: `ai-service/app/services/agent.py` runs agentic loop with max 5 tool rounds per message
  - Context: Last 20 messages in conversation, contact details, buyer profile, recent activities, Gmail status injected into system prompt

**Vector Search & Embeddings:**
- OpenAI text-embedding-3-small - Semantic search embeddings (1536 dimensions)
  - SDK: `openai==2.26.0` (Python)
  - Auth: `OPENAI_API_KEY` (env var, optional)
  - Storage: PostgreSQL pgvector extension (`embeddings` table)
  - Implementation: `ai-service/app/services/embeddings.py` generates embeddings on contact/activity creation
  - Search: `semantic_search` AI tool queries via pgvector cosine similarity

## Data Storage

**Databases:**
- PostgreSQL 15 (pgvector extension)
  - Connection: `DATABASE_URL` (env var, format: `postgres://user:pass@host:5432/db`)
  - Client: `github.com/jackc/pgx/v5` (backend, connection pool), `psycopg2-binary` (AI service sync driver), `pgvector` (vector operations)
  - Row-Level Security: All agent-scoped tables enforce RLS via `SET LOCAL app.current_agent_id`
  - Migrations: 15 SQL files in `backend/migrations/` (schema v1 through schema additions)
  - Tables: 10 core tables (users, contacts, deals, activities, conversations, messages, ai_profiles, embeddings, workflows, portal_tokens, etc.)

**File Storage:**
- Local filesystem only - No S3/Cloud storage configured
  - Documents stored as JSONB in database (file metadata)
  - File processing: PDF, DOCX, XLSX support via `PyPDF2`, `python-docx`, `openpyxl` (AI service)

**Caching:**
- Redis 7-alpine - Configured in docker-compose.yml but unused
  - Connection: `REDIS_URL` (env var, default: redis://localhost:6379)
  - Status: Not actively utilized in backend or AI service code

## Authentication & Identity

**Auth Provider:**
- Clerk (SaaS) - Managed authentication, JWT issuance
  - Implementation: `@clerk/nextjs` provides Sign-In/Sign-Up UI, session middleware
  - Token Flow: Frontend obtains token via `getToken()`, passes in `Authorization: Bearer {token}` header
  - JWT Validation: Backend `middleware/auth.go` validates signature and extracts subject (`sub` claim = `clerk_id`)
  - User Auto-Sync: On first request, `UserSync` middleware creates `users` table entry if missing
  - Clerk IDs: Mapped to PostgreSQL user UUIDs for RLS enforcement

**Authorization:**
- Row-Level Security (PostgreSQL) - Multi-tenancy isolation
  - Policy: `SET LOCAL app.current_agent_id = '<uuid>'` before every query
  - Scope: Agent-scoped tables (contacts, deals, activities, conversations, etc.)
  - Effect: Queries automatically filtered to authenticated agent; cross-agent data leakage prevented at DB layer

**OAuth 2.0:**
- Google OAuth 2.0 - Gmail API authorization
  - Client: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - Redirect: `GOOGLE_REDIRECT_URI` (env var, default: http://localhost:8080/api/auth/google/callback)
  - Scopes: Read, send, and modify Gmail messages
  - Token Storage: Encrypted in database for persistent access

## Monitoring & Observability

**Error Tracking:**
- Not detected - No error tracking service integrated

**Logs:**
- Structured logging (Go backend): `log/slog` with `JSONHandler`
  - Log level: `LevelInfo` (configurable)
  - Output: stdout/stderr (captured by container orchestration)
- Uvicorn logs (AI service): Access logs via `uvicorn` middleware (request method, path, status)
- Frontend: Browser console (development mode)

**Metrics:**
- Not detected - No metrics collection or monitoring dashboard

## CI/CD & Deployment

**Hosting:**
- Docker Compose (local development and production)
  - Services: postgres, redis, backend, ai-service, frontend (5 containers)
  - Networks: Isolated `cloagent` bridge network
  - Health Checks: postgres, redis via command execution

**CI Pipeline:**
- Not detected - No CI/CD configuration in repo (GitHub Actions, GitLab CI, etc.)

**Deployment:**
- Docker Compose deployment model
  - Backend: Multi-stage Dockerfile (Go 1.25 Alpine, runtime Alpine 3.19)
  - AI Service: Multi-stage Dockerfile (Python 3.11-slim)
  - Frontend: Multi-stage Dockerfile (Node 20 Alpine, Next.js standalone output)
  - Database: PostgreSQL 15 image with migrations auto-applied
  - Orchestration: Docker Compose handles startup order and health checks

## Environment Configuration

**Required env vars (must be set):**
- `CLERK_SECRET_KEY` - Clerk API secret for JWT validation
- `DATABASE_URL` - PostgreSQL connection string
- `ANTHROPIC_API_KEY` - Claude API key for AI service
- `AI_SERVICE_SECRET` - Shared secret for backend←→AI communication
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key (frontend build-time)

**Optional env vars (with sensible defaults):**
- `OPENAI_API_KEY` - OpenAI embeddings key (if not set, semantic search disabled)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Gmail OAuth (if not set, Gmail features disabled)
- `REDIS_URL` - Redis connection (default: redis://localhost:6379, unused)
- `PORT` - Backend port (default: 8080)
- `AI_SERVICE_URL` - AI service endpoint (default: http://localhost:8000)
- `FRONTEND_URL` - Frontend origin (default: http://localhost:3000)
- `ENCRYPTION_KEY` - Data encryption key (required if using encrypted fields)

**Secrets location:**
- Docker Compose: Environment variables passed via `.env` file (not in repo, git-ignored)
- Production: Environment variable provider (e.g., AWS Secrets Manager, Azure Key Vault, Kubernetes Secrets)

## Webhooks & Callbacks

**Incoming:**
- Google OAuth 2.0 callback: `GET /api/auth/google/callback` - Receives authorization code, exchanges for tokens
- Clerk webhooks: Not detected (user sync happens on-request, not webhook-driven)

**Outgoing:**
- Workflow triggers: `POST /api/workflows/{id}/trigger` via `workflow_engine.py`
  - Triggers: contact_created, deal_stage_changed, activity_logged, email_sent, manual
  - Execution: Background task via `asyncio.create_task` after write tool confirmation

**Proxied Requests:**
- Frontend → Backend → AI Service: Chat messages, profile generation, semantic search
  - Backend adds `X-AI-Service-Secret` header for authentication
  - Backend streams AI service SSE responses back to frontend with connection maintenance

## Third-Party Data Sources

**Properties & Listings:**
- MLS/Real Estate Data Integration: Stub implementation
  - Tools: `search_properties`, `get_property`, `match_buyer_to_properties` (available in AI agent)
  - Status: Backend endpoints exist but data source not configured

**Contact Sources:**
- Multiple lead sources supported (not external APIs):
  - Zillow, Referral, Cold Call, WhatsApp, Open House, Direct Call, Website, LinkedIn, Email, Other
  - Stored as enum in `contacts.source` column

## Data Privacy & Security

**Encryption:**
- Sensitive fields encrypted in database
  - Implementation: `backend/internal/handlers/encryption.go`
  - Key: `ENCRYPTION_KEY` environment variable
  - Fields encrypted: OAuth tokens (Gmail), other sensitive PII

**CORS:**
- Configured via `github.com/rs/cors` middleware
  - Origin: `FRONTEND_URL` environment variable (default: http://localhost:3000)
  - Methods: GET, POST, PUT, PATCH, DELETE
  - Credentials: Supported

**Rate Limiting:**
- Not detected - No rate limiting middleware or rules

---

*Integration audit: 2026-03-24*
