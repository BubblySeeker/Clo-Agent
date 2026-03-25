# CloAgent Code Conventions

## Overview

This document captures the coding patterns, naming conventions, and architectural styles used across the CloAgent monorepo (Frontend, Backend, AI Service).

---

## Go Backend

### File Organization

- **Entry point**: `backend/cmd/api/main.go`
- **Packages**:
  - `internal/config/` — Environment variable loading
  - `internal/database/` — Database connection pool & transaction helpers
  - `internal/middleware/` — Auth, CORS, user sync
  - `internal/handlers/` — HTTP request handlers (one file per domain: contacts.go, deals.go, etc.)

### Handler Pattern (Factory)

All handlers follow a factory function pattern that returns `http.HandlerFunc`:

```go
func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Extract context, validate, execute query
    }
}
```

**Why**: Allows dependency injection (pool, logger) without global state.

### Database Transaction Pattern

Every handler that queries the database uses this pattern:

```go
tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
if err != nil {
    respondError(w, http.StatusInternalServerError, "database error")
    return
}
defer tx.Rollback(r.Context())

// ... queries ...

tx.Commit(r.Context())
```

- `BeginWithRLS()` starts a transaction and sets the RLS context (`app.current_agent_id`)
- All queries execute within the transaction with row-level security active
- Explicit defer + Rollback pattern (even though Commit happens in success path)

### Response Helpers

All responses use two helper functions from `handlers/helpers.go`:

```go
// Success responses
respondJSON(w, http.StatusOK, data)

// Error responses
respondError(w, http.StatusBadRequest, "message")
```

- No explicit error wrapping beyond the HTTP response
- Error messages are human-readable strings
- Status codes match HTTP semantics (201 Created, 204 No Content, 404 Not Found, etc.)

### URL Parameter Extraction

```go
id := chi.URLParam(r, "id")
```

Using Chi's `URLParam()` helper. Parameters are not validated at the handler level; invalid UUIDs are caught by the query result.

### Query Parameter Parsing

```go
search := r.URL.Query().Get("search")
page, _ := strconv.Atoi(r.URL.Query().Get("page"))
```

- `Get()` returns empty string if not present
- Silent type coercion with blank `_` for errors; validation applied to parsed values
- Pagination: page/limit defaults applied if missing or invalid

### Dynamic SQL Building

```go
var args []interface{}
whereExpr := "1=1"

if search != "" {
    args = append(args, "%"+search+"%")
    n := len(args)
    whereExpr += fmt.Sprintf(" AND (field ILIKE $%d)", n)
}

sql := fmt.Sprintf("SELECT ... WHERE %s ...", whereExpr)
rows, err := tx.Query(ctx, sql, args...)
```

- Manual SQL concatenation with parameterized placeholders (`$1`, `$2`, etc.)
- `args` slice holds parameter values in order
- Parameter count tracked by `len(args)` for correct `$N` numbering

### Struct Tags for JSON

```go
type Contact struct {
    ID        string    `json:"id"`
    FirstName string    `json:"first_name"`
    Email     *string   `json:"email"`
    CreatedAt time.Time `json:"created_at"`
}
```

- Explicit `json:""` tags for all exported fields
- snake_case keys (database convention matches JSON convention)
- Nullable fields use pointers (`*string`, `*float64`)

### Middleware Composition

Global middleware stack in `main.go`:

```go
r.Use(chimiddleware.RequestID)
r.Use(chimiddleware.RealIP)
r.Use(chimiddleware.Logger)
r.Use(chimiddleware.Recoverer)
r.Use(chimiddleware.Compress(5))
r.Use(middleware.CORSHandler())

r.Group(func(r chi.Router) {
    r.Use(middleware.ClerkAuth(clerkClient))
    r.Use(middleware.UserSync(pool, clerkClient))
    // protected routes here
})
```

- Global middleware applied before route definition
- Protected routes grouped with auth + user sync middleware
- No middleware per-handler; all protection is group-based

### Context Keys Pattern

Unexported type to prevent collisions:

```go
type contextKey string

const (
    UserIDKey contextKey = "userID"
    AgentUUIDKey contextKey = "agentUUID"
)

func UserIDFromContext(ctx context.Context) string {
    id, _ := ctx.Value(UserIDKey).(string)
    return id
}
```

- Private `contextKey` type prevents key collisions across packages
- Getter function returns empty string on missing key (no error)

### Import Organization

```go
import (
    "context"
    "encoding/json"
    "fmt"
    // ... stdlib ...

    "github.com/clerkinc/clerk-sdk-go/clerk"
    "github.com/go-chi/chi/v5"
    // ... third-party ...

    "crm-api/internal/config"
    "crm-api/internal/database"
    // ... local ...
)
```

- Grouped: stdlib, third-party, local packages
- Alphabetical within each group
- No blank lines within groups; blank lines between groups

---

## TypeScript/Next.js Frontend

### File Organization

- **Routes**: `src/app/` (Next.js 14 App Router)
- **Components**: `src/components/` — Shared UI components, organized by category (shared/, marketing/, ui/)
- **API layer**: `src/lib/api/` — One file per domain (contacts.ts, deals.ts, conversations.ts, etc.)
- **State**: `src/store/ui-store.ts` — Zustand store
- **Utilities**: `src/lib/utils.ts`

### "use client" Directive

All interactive components and pages start with:

```tsx
"use client";
```

Placed at the very top before imports. Used for:
- Any page with hooks (useState, useQuery, etc.)
- Any component using browser APIs
- Exported from non-app components

### API Client Pattern

Single client in `lib/api/client.ts`:

```typescript
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

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}
```

- Generic `<T>` for response typing
- All API functions call `apiRequest()` with path, token, and options
- Bearer token passed via Authorization header (from Clerk `getToken()`)
- Error handling: non-2xx raises error immediately
- 204 No Content returns empty object

### API Module Pattern

Each domain has an API module exporting types and functions:

```typescript
export interface Contact {
  id: string;
  agent_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactsResponse {
  contacts: Contact[];
  total: number;
}

export interface ContactFilters {
  search?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export function listContacts(token: string, filters?: ContactFilters): Promise<ContactsResponse> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  const qs = params.toString();
  return apiRequest(`/contacts${qs ? "?" + qs : ""}`, token);
}

export function createContact(token: string, body: CreateContactBody): Promise<Contact> {
  return apiRequest("/contacts", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
```

- Interfaces exported (no namespace)
- Functions per HTTP operation (list, get, create, update, delete)
- URL query strings built with `URLSearchParams`
- Request bodies typed (e.g., `CreateContactBody`, `UpdateContactBody`)

### Data Fetching with TanStack Query

Inline in page/component:

```typescript
const { data } = useQuery({
  queryKey: ["contacts"],
  queryFn: async () => {
    const token = await getToken();
    return listContacts(token!, { search, source, page, limit });
  },
});
```

- No custom hook wrapper files
- `queryKey` is array (enables cache invalidation by key)
- `getToken()` from `@clerk/nextjs` called inside `queryFn`
- Non-null assertion (`!`) on token (assumes auth guard)

### State Management

**TanStack Query**: Server state (all API data)

**Zustand**: UI state (sidebar, chat bubble open/close)

```typescript
export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  chatOpen: false,
  setChatOpen: (open) => set({ chatOpen: open }),
}));
```

- Single store file (`ui-store.ts`)
- Type-safe getters and setters
- Minimal logic (state updates only, no side effects)

**react-hook-form**: Form state (inline in components)

```typescript
const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm<CreateContactBody>({
  resolver: zodResolver(createContactSchema),
});
```

- Zod for validation schemas (imported from elsewhere, not colocated)

### Component Structure

Page component example:

```typescript
export default function ContactsPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ["contacts", { search, page }],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, { search, page });
    },
  });

  return <div>...</div>;
}
```

- Hooks called at the top
- `useRouter()`, `useAuth()`, `useQueryClient()` from Next.js/Clerk
- Local state (useState) before queries
- JSX at the bottom

### Styling

All **Tailwind CSS**. No component library beyond one shadcn button (`button.tsx`).

- Classes inline in JSX
- Responsive utilities: `md:`, `lg:`, `xl:`
- No CSS files
- Colors: design tokens passed as classes (e.g., `bg-blue-500`)

### TypeScript Types

- Exported types from API modules (interfaces, not types)
- Inline for local state (if not shared)
- snake_case in API responses (database convention), camelCase in frontend logic where needed
- Nullable fields: `string | null`, not `?string`

### Import Organization

```typescript
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { listContacts, createContact, type ContactFilters } from "@/lib/api/contacts";
import { createBuyerProfile } from "@/lib/api/buyer-profiles";
import { Search, Plus, LayoutGrid } from "lucide-react";

import { useUIStore } from "@/store/ui-store";
```

- React/Next.js hooks
- Third-party (lucide-react, etc.)
- Relative to src with `@/` alias
- Type-only imports: `import type { Type }`
- Grouped logically; no strict alphabetical order

### Path Alias

`tsconfig.json` defines:

```json
{
  "paths": {
    "@/*": ["./src/*"]
  }
}
```

- Used everywhere: `@/lib/api`, `@/components`, `@/store`

---

## Python AI Service

### File Organization

- **Entry point**: `ai-service/app/main.py`
- **Routes**: `app/routes/` — FastAPI routers (chat.py, profiles.py, health.py)
- **Services**: `app/services/` — Business logic (agent.py)
- **Tools**: `app/tools.py` — Tool definitions and execution
- **Database**: `app/database.py` — Connection pool & helpers
- **Config**: `app/config.py` — Environment variables

### Main App Structure

```python
from fastapi import FastAPI
from app.routes.health import router as health_router
from app.routes.chat import router as chat_router
from app.routes.profiles import router as profiles_router

app = FastAPI(title="CloAgent AI Service")

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(profiles_router)
```

- Routers included at the top level
- Prefix applied per router (e.g., `/ai`)

### Request/Response Models

Using Pydantic BaseModel:

```python
class SendMessageRequest(BaseModel):
    conversation_id: str
    agent_id: str
    content: str

class ConfirmRequest(BaseModel):
    pending_id: str
    agent_id: str
```

- snake_case field names
- Required fields on top, optional below
- Inline docstrings on endpoints, not on model classes

### Auth Dependency

```python
def verify_secret(x_ai_service_secret: str = Header(...)):
    if x_ai_service_secret != AI_SERVICE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid service secret")

@router.post("/messages", dependencies=[Depends(verify_secret)])
async def send_message(req: SendMessageRequest):
    ...
```

- Custom dependency for secret verification
- Applied via `dependencies=[Depends(...)]` on route
- Explicit HTTP exception with status and detail

### Streaming Response Pattern

```python
async def stream():
    async for chunk in run_agent(req.conversation_id, req.agent_id, req.content):
        yield chunk

return StreamingResponse(
    stream(),
    media_type="text/event-stream",
    headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    },
)
```

- Async generator for streaming
- Explicit media type and cache headers
- Server-Sent Events (SSE) format

### Tool Definition Format

Anthropic tool schema format:

```python
TOOL_DEFINITIONS = [
    {
        "name": "get_dashboard_summary",
        "description": "Get total contacts, active deals, total pipeline value, and recent activity counts for the agent.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "search_contacts",
        "description": "Search for contacts by name, email, or filter by source. Returns matching contacts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term..."},
                "source": {"type": "string", "description": "Filter by lead source..."},
                "limit": {"type": "integer", "description": "Max number of results..."},
            },
            "required": [],
        },
    },
]
```

- Read tools (no required inputs) and write tools (query-able) defined in single TOOL_DEFINITIONS list
- Descriptions serve as inline documentation
- Properties describe each input parameter

### Database Connection Pattern

```python
@contextmanager
def get_conn():
    """Sync context manager that borrows a connection from the pool."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)

async def run_query(fn) -> Any:
    """Run a sync DB function in a thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(fn)
```

- Thread-safe psycopg2 pool (1-10 connections)
- Context manager for connection borrow/return
- Async wrapper via `asyncio.to_thread()` to avoid blocking
- Commit on success, rollback on exception

### Query Execution Pattern

```python
def _load_history(conversation_id: str, agent_id: str):
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT m.role, m.content FROM messages m
               JOIN conversations cv ON cv.id = m.conversation_id
               WHERE cv.agent_id = %s AND m.conversation_id = %s
               ORDER BY m.created_at ASC LIMIT 20""",
            (agent_id, conversation_id),
        )
        messages = [{"role": r["role"], "content": r["content"]} for r in cur.fetchall()]
        return messages
```

- `RealDictCursor` for dict-like row access
- Parameterized queries with `%s` placeholders
- `fetchall()` for list results, `fetchone()` for single
- List comprehensions to transform rows

### Pending Actions Store

```python
pending_actions: dict[str, dict] = {}

def queue_write_tool(tool_name: str, params: dict) -> str:
    pending_id = str(uuid.uuid4())
    pending_actions[pending_id] = {
        "tool": tool_name,
        "params": params,
    }
    return pending_id

async def execute_write_tool(pending_id: str) -> dict:
    if pending_id not in pending_actions:
        return {"error": "pending action not found"}

    action = pending_actions.pop(pending_id)
    # ... execute based on action["tool"] ...
```

- In-memory dict with UUID keys
- Used to store pending confirmations
- **Not persistent** (lost on restart); single-process only

### System Prompt Building

```python
def _build_system_prompt(agent_name: str, contact_context: str = "") -> str:
    lines = [
        f"You are a CRM assistant for real estate agent {agent_name}.",
        "Your job is to help manage contacts, deals, activities, and tasks.",
        "",
        "Available tools: [list]",
    ]
    if contact_context:
        lines.append(contact_context)
    return "\n".join(lines)
```

- Conditionally include contact context (if conversation is contact-scoped)
- Multi-line string built from list of lines
- Agent name and contact details injected

### Claude API Integration

```python
from anthropic import Anthropic

client = Anthropic(api_key=ANTHROPIC_API_KEY)

response = client.messages.create(
    model=MODEL,
    max_tokens=2048,
    system=system_prompt,
    tools=TOOL_DEFINITIONS,
    messages=messages,
)
```

- `Anthropic()` client initialized once
- `tools` parameter passes Anthropic schema format
- `system` parameter for system prompt
- `messages` list includes conversation history

### Import Organization

```python
"""
Module docstring explaining the file's purpose.
"""
import asyncio
import json
import uuid
from typing import AsyncGenerator, Any
from contextlib import contextmanager

import anthropic
import psycopg2
import psycopg2.extras

from app.config import ANTHROPIC_API_KEY
from app.database import get_conn, run_query
from app.tools import TOOL_DEFINITIONS, execute_read_tool
```

- Docstring at top
- stdlib (asyncio, json, typing, etc.)
- Third-party (anthropic, psycopg2, fastapi, etc.)
- Local (from app...)
- Alphabetical within each group

### Error Handling

```python
try:
    result = await execute_write_tool(pending_id)
except Exception as e:
    raise HTTPException(status_code=500, detail=f"Tool execution failed: {str(e)}")
```

- FastAPI `HTTPException` for HTTP errors
- `status_code` and `detail` parameters
- Errors logged by FastAPI (no explicit logging in handlers)

---

## Cross-Service Patterns

### Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Database columns | snake_case | `first_name`, `created_at` |
| API JSON fields | snake_case | `"first_name": "John"` |
| Go variables | camelCase | `agentID`, `contactName` |
| Go functions | PascalCase | `ListContacts()`, `BeginWithRLS()` |
| Go constants | ALL_CAPS | `UserIDKey` |
| TypeScript variables | camelCase | `firstName`, `chatOpen` |
| TypeScript types | PascalCase | `Contact`, `ChatMessage` |
| Python variables | snake_case | `agent_id`, `conversation_id` |
| Python functions | snake_case | `load_history()`, `queue_write_tool()` |
| Python classes | PascalCase | `SendMessageRequest`, `SSEEvent` |

### Error Handling Philosophy

- **Go**: Silent failures with generic "database error" messages; no error wrapping
- **TypeScript**: Errors thrown from apiRequest; caught and logged at page level
- **Python**: FastAPI HTTPException with status codes; unhandled exceptions return 500

### Authentication & Authorization

- **Frontend**: Clerk session tokens via `getToken()`
- **Backend**: JWT validation via Clerk SDK; user sync on first request; RLS policies per agent
- **AI Service**: Shared secret (`X-AI-Service-Secret` header) for backend→AI communication

### Logging

- **Go**: `slog` (structured JSON logging), calls to `slog.Info()` / `slog.Error()`
- **TypeScript**: Console errors (no structured logging)
- **Python**: FastAPI middleware logs requests; no explicit logging in business logic

---

## Editor & Linting Configuration

### TypeScript

- **tsconfig.json**: `strict: true`, `noEmit: true`, `skipLibCheck: true`
- **ESLint**: `next/core-web-vitals` + `next/typescript` preset, custom rule for unescaped entities

### Go

- No explicit linter configuration in repo
- Standard Go formatting (go fmt)
- No golangci-lint config

### Python

- No explicit linter configuration
- Standard Python style (PEP 8 implied, not enforced)
