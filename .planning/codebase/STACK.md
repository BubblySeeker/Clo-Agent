# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5.x - Frontend (Next.js), type safety in all client code
- Go 1.25.0 - Backend API server, chi router, pgx driver
- Python 3.11 - AI Service, FastAPI, Claude API integration, embeddings

**Secondary:**
- SQL - PostgreSQL migrations and queries (15 migrations total across schema changes)
- JavaScript - Node.js build tooling, build scripts

## Runtime

**Environment:**
- Node.js 20 (Alpine) - Frontend development and production
- Go 1.25.0 (Alpine) - Backend compilation and runtime
- Python 3.11-slim - AI service runtime
- PostgreSQL 15 - Primary data store with pgvector extension
- Redis 7-alpine - Configured but unused

**Package Manager:**
- npm - Frontend dependencies (package.json, package-lock.json)
- go mod - Backend dependencies (go.mod, go.sum)
- pip - AI service dependencies (requirements.txt)

## Frameworks

**Core:**
- Next.js 14.2.35 - Frontend framework, App Router, SSR, static generation
- Chi v5.2.5 - Go HTTP router and middleware
- FastAPI 0.135.1 - AI service REST API framework
- React 18.x - UI library (frontend)

**Testing:**
- No testing framework detected in monorepo (not applicable for current focus)

**Build/Dev:**
- Uvicorn 0.41.0 - Python ASGI server for AI service
- TypeScript compiler 5.x - Type checking
- ESLint 8.x - Frontend linting (Next.js config preset)
- Prettier 3.8.1 - Frontend code formatting with Tailwind plugin

## Key Dependencies

**Critical:**

Frontend:
- `@clerk/nextjs` 5.7.5 - User authentication, JWT token management, session handling
- `@tanstack/react-query` 5.90.21 - Server state management, caching, data sync
- `zustand` 5.0.11 - UI state management (sidebar, chat bubble visibility)
- `react-hook-form` 7.71.2 - Form state and validation
- `zod` 4.3.6 - Schema validation (installed but primarily used with react-hook-form)

Backend:
- `github.com/clerkinc/clerk-sdk-go` 1.49.1 - JWT validation, user sync
- `github.com/jackc/pgx/v5` 5.8.0 - PostgreSQL connection pool, high-performance driver
- `github.com/go-chi/chi/v5` 5.2.5 - HTTP routing, middleware composition

AI Service:
- `anthropic` 0.84.0 - Claude API client (Haiku 4.5 model for inference)
- `psycopg2-binary` 2.9.11 - PostgreSQL sync driver for AI service database access
- `pgvector` 0.4.2 - pgvector type support for embeddings
- `fastapi` 0.135.1 - Web framework for AI endpoints

**Infrastructure:**
- `openai` 2.26.0 - OpenAI embeddings (text-embedding-3-small for vector search)
- `requests` 2.32.5 - Sync HTTP client for backend→AI communication
- `httpx` 0.28.1 - Async HTTP client (FastAPI context)
- `pydantic` 2.12.5 - Data validation and serialization (FastAPI models)

**UI & Styling:**
- `tailwindcss` 3.4.1 - Utility-first CSS framework
- `lucide-react` 0.577.0 - Icon library (18 icons per UI pattern)
- `recharts` 3.8.0 - Charts and analytics visualizations
- `@radix-ui/react-*` 1.x - Unstyled, accessible primitives (15+ components: avatar, checkbox, dialog, dropdown, tabs, etc.)
- `framer-motion` 11.18.2 - Animation library
- `@react-spring/web` 10.0.3 - Physics-based animations
- `react-parallax-tilt` 1.7.320 - 3D tilt effect component
- `cobe` 0.6.5 - 3D globe visualization (marketing pages)

**Drag & Drop (installed, native HTML used):**
- `@dnd-kit/core` 6.3.1 - Installed but not used; native drag-drop in Kanban board
- `@dnd-kit/sortable` 10.0.0 - Installed but not used
- `@dnd-kit/utilities` 3.2.2 - Installed but not used

**Content:**
- `react-markdown` 10.1.0 - Markdown rendering (AI chat messages)
- `remark-gfm` 4.0.1 - GitHub-flavored markdown parsing
- `date-fns` 4.1.0 - Date manipulation utilities
- `react-day-picker` 9.14.0 - Date picker component

**Utilities:**
- `class-variance-authority` 0.7.1 - Component variant patterns
- `clsx` 2.1.1 - Conditional classnames
- `tailwind-merge` 3.5.0 - Tailwind class name merging
- `uuid` (Go stdlib) - UUID generation
- `google.uuid` (via clerk-sdk-go) - UUID utilities

## Configuration

**Environment:**

Frontend:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key (build-time, client-side)
- `CLERK_SECRET_KEY` - Clerk secret (server-side, runtime)
- `NEXT_PUBLIC_API_URL` - Backend API endpoint (default: http://localhost:8080)

Backend:
- `DATABASE_URL` - PostgreSQL connection string (required)
- `CLERK_SECRET_KEY` - Clerk secret for JWT validation (required)
- `AI_SERVICE_SECRET` - Shared secret for backend→AI communication (required)
- `REDIS_URL` - Redis connection (optional, configured but unused)
- `PORT` - Server port (default: 8080)
- `AI_SERVICE_URL` - AI service endpoint (default: http://localhost:8000)
- `GOOGLE_CLIENT_ID` - OAuth 2.0 client ID for Gmail integration
- `GOOGLE_CLIENT_SECRET` - OAuth 2.0 client secret for Gmail integration
- `GOOGLE_REDIRECT_URI` - OAuth callback URL (default: http://localhost:8080/api/auth/google/callback)
- `FRONTEND_URL` - Frontend origin for CORS (default: http://localhost:3000)
- `ENCRYPTION_KEY` - Key for encrypting sensitive data (OAuth tokens)

AI Service:
- `DATABASE_URL` - PostgreSQL connection string (required)
- `ANTHROPIC_API_KEY` - Claude API key (required)
- `OPENAI_API_KEY` - OpenAI embeddings key (optional for semantic search)
- `AI_SERVICE_SECRET` - Shared secret validation (required)
- `BACKEND_URL` - Backend API endpoint for proxied requests (default: http://localhost:8080)
- `ANTHROPIC_MODEL` - Model selection (default: claude-haiku-4-5-20251001)

**Build:**
- `frontend/tsconfig.json` - TypeScript compiler: strict mode, path aliases (`@/*` → `src/*`)
- `frontend/next.config.mjs` - Next.js output mode (standalone in production)
- `frontend/tailwind.config.ts` - Tailwind customization (colors, animations, spacing)
- `frontend/postcss.config.mjs` - PostCSS plugins (Tailwind, Autoprefixer)
- `frontend/.prettierrc` - Prettier: semi: true, singleQuote: false, Tailwind class sorting
- `backend/cmd/api/main.go` - Entry point, router initialization, middleware stack
- `ai-service/app/main.py` - FastAPI app, router registration

## Platform Requirements

**Development:**
- Node.js 20+ (for frontend build and local dev)
- Go 1.25.0+ (for backend compilation)
- Python 3.11+ (for AI service)
- Docker & Docker Compose (recommended for local database setup)
- PostgreSQL 15 (local dev or containerized)
- Redis 7 (containerized, optional)

**Production:**
- Docker & Docker Compose (containerized deployment)
- PostgreSQL 15 + pgvector extension
- Redis 7 (configured, not required)
- Environment variable provisioning (secrets manager integration)
- HTTPS/TLS termination (reverse proxy recommended)
- OAuth 2.0 provider access (Clerk, Google)

**Network:**
- Frontend → Backend: HTTP/HTTPS (port 8080)
- Backend → AI Service: HTTP (internal, port 8000)
- All services → PostgreSQL: TCP (port 5432)
- Clerk cloud: HTTPS API calls for JWT validation and user sync

---

*Stack analysis: 2026-03-24*
