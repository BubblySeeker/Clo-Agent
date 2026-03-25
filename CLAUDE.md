# CloAgent — Project Reference

CloAgent is an AI-powered CRM for real estate agents. Monorepo with three services sharing a PostgreSQL 15 + pgvector database.

## Architecture

```
Frontend (Next.js 14, :3000) → Backend (Go/Chi, :8080) → PostgreSQL 15 + pgvector
                                       ↕
                               AI Service (FastAPI, :8000)
```

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Clerk auth (`@clerk/nextjs` v5), TanStack Query, Zustand, react-hook-form + Zod, recharts, lucide-react
- **Backend**: Go 1.24, Chi v5 router, pgx v5 connection pool, Clerk JWT middleware, RLS for data isolation
- **AI Service**: Python 3.11, FastAPI, psycopg2 (sync + thread pool), Claude API via `anthropic` SDK (Haiku 4.5), SSE streaming
- **Database**: PostgreSQL 15 with pgvector extension, row-level security per agent
- **Auth**: Clerk — frontend uses `@clerk/nextjs` v5, backend validates JWT via Clerk SDK, user auto-sync on first request
- **Infra**: Docker Compose (postgres, redis, backend, ai-service, frontend)

The Go backend is the single entry point for the frontend. AI requests are proxied from Go → Python AI service. The frontend never talks to the AI service directly.

**Note:** `shadcn` CLI is installed but only one component exists (`button.tsx`). All API calls use native `fetch` via `src/lib/api/client.ts`.

## Key Patterns

### RLS (Row-Level Security)
All agent-scoped tables have RLS. Every query runs `SET LOCAL app.current_agent_id = '<uuid>'` in a transaction via `database.BeginWithRLS()`. RLS policies auto-filter to the authenticated agent.

### Backend Handler Factory
```go
func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID)
        defer tx.Rollback(r.Context())
        // query, marshal, respond
        tx.Commit(r.Context())
    }
}
```
Response helpers: `respondJSON(w, status, data)`, `respondError(w, status, "message")`

### Frontend Data Fetching
TanStack Query inline in page components. API client: `src/lib/api/client.ts` — `apiRequest<T>(path, token, options)`.
```tsx
const { data } = useQuery({ queryKey: ['contacts'], queryFn: async () => {
  const token = await getToken();
  return listContacts(token!, { search, source, page, limit });
}});
```

### AI Agent Loop
- Max 5 tool rounds per message (safety limit in `agent.py`)
- 34 tools total: 18 read (execute immediately), 16 write (require user confirmation via `pending_actions` table, 10-min TTL)
- Write tools queue confirmation → SSE `confirmation` event → user clicks Confirm → `POST /ai/confirm` → executes
- Contact-scoped conversations pre-load contact details + buyer profile + recent activities into system prompt

### Inter-Service Auth
- Frontend → Backend: Clerk JWT in `Authorization` header
- Backend → AI Service: `X-AI-Service-Secret` + `X-Agent-ID` headers
- AI Service → Backend (proxied ops like send_email): same shared secret

### State Management
- **Server state**: TanStack Query
- **UI state**: Zustand (`ui-store.ts` — sidebar, chat bubble)
- **Form state**: react-hook-form inline
- **Styling**: All Tailwind CSS, no component library

### Error & Pagination
- Errors: `{"error": "message"}` with status 400/401/403/404/500
- Pagination: `?page=1&limit=25`, response includes `"total"` count
- TypeScript path alias: `@/*` maps to `src/*`
- Go nullable fields use pointers (`*string`, `*float64`)
- TypeScript nullable: `string | null` (not optional `?string`)

## Discovering the Codebase

Instead of documenting everything here, read the source:
- **API endpoints**: `backend/cmd/api/main.go` (all routes registered), `backend/internal/handlers/` (14 handler files)
- **Database schema**: `backend/migrations/` (001-015 SQL files)
- **AI tools**: `ai-service/app/tools.py` (all 34 tool definitions + execution)
- **Frontend pages**: `frontend/src/app/dashboard/` (all dashboard routes)
- **Dependencies**: `frontend/package.json`, `backend/go.mod`, `ai-service/requirements.txt`

## gstack Skills

Use the `/browse` skill from gstack for all web browsing tasks. Never use `mcp__claude-in-chrome__*` tools directly.

Available gstack skills: `/plan-ceo-review`, `/plan-eng-review`, `/review`, `/ship`, `/browse`, `/qa`, `/qa-only`, `/setup-browser-cookies`, `/retro`, `/document-release`, `/gstack-upgrade`

### gstack Setup (for new contributors)
```bash
curl -fsSL https://bun.sh/install | bash
cd .claude/skills/gstack && ./setup
```

## Design & Build Tool Routing

When working on frontend UI, use the correct specialized tool based on file path and task type. First match wins.

| Tool | Domain |
|------|--------|
| `frontend-design` | Dashboard/app UI: `dashboard/**`, `components/shared/**`, auth pages |
| `ui-ux-pro-max` | Landing/marketing: `(marketing)/**`, root `page.tsx`, `components/marketing/**` |
| Stitch | New reusable components, design system elements, pure styling (any domain) → `components/shared/` or `components/ui/` |
| Gemini | Image asset generation (any context) |
| 21st.dev | 3D/interactive components (marketing pages ONLY — never dashboard) |

Routing: Image needed → Gemini first. 3D + marketing → 21st.dev. New component → Stitch. Styling-only → Stitch. Marketing page → ui-ux-pro-max. Dashboard → frontend-design.

Multi-tool order: Assets → 3D → Components → Page assembly.

**Excluded paths** (never trigger design tools): `backend/`, `ai-service/`, `frontend/src/lib/api/`, `frontend/src/store/`, `frontend/src/middleware.ts`

<!-- GSD:project-start source:PROJECT.md -->
## Project

**AI Contact Intelligence**

A focused improvement to CloAgent's AI assistant that makes it smarter about finding, resolving, and reasoning about contacts. Currently the AI fails on basic contact operations — it can't split "Rohan Batre" into first/last name for search, can't find "my last contact," and returns empty results for partial name lookups like "email Rohan." This milestone fixes the AI's contact resolution so it behaves like a competent human assistant.

**Core Value:** When a user references a contact by any natural description (name, partial name, recency, relationship), the AI finds the right contact and acts on it — every time.

### Constraints

- **Model**: Claude Haiku 4.5 — must work within this model's capabilities (can't rely on stronger reasoning)
- **Tool rounds**: Max 5 per message — contact resolution may consume 1-2 rounds, leaving 3-4 for actual work
- **Backward compatible**: Changes must not break existing working AI interactions (deals, tasks, activities)
<!-- GSD:project-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
