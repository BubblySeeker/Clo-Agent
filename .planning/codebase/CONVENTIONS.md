# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

**Files:**
- Go handlers: PascalCase (e.g., `contacts.go`, `deals.go`, `workflows.go`)
- TypeScript/React: PascalCase for components (e.g., `AIChatBubble.tsx`, `CommandPalette.tsx`), camelCase for utilities and API modules (e.g., `client.ts`, `contacts.ts`)
- Python files: snake_case (e.g., `agent.py`, `workflow_engine.py`, `tools.py`)

**Functions:**
- Go: PascalCase (exported), camelCase (unexported). Handler factory functions return `http.HandlerFunc` (e.g., `ListContacts()`, `CreateDeal()`, `scanDeal()`)
- TypeScript: camelCase for functions and hooks (e.g., `listContacts()`, `createContact()`, `getColor()`, `initials()`)
- Python: snake_case for all functions (e.g., `find_matching_workflows()`, `execute_step()`, `load_history()`)

**Variables:**
- Go: camelCase (e.g., `agentID`, `contactName`, `stageID`)
- TypeScript: camelCase (e.g., `firstName`, `folderSearch`, `selectedContacts`)
- Python: snake_case (e.g., `trigger_type`, `agent_id`, `conversation_id`)

**Types/Interfaces/Structs:**
- Go: PascalCase struct names with `json` tags for field mapping (e.g., `Contact struct { FirstName string json:"first_name" }`)
- TypeScript: PascalCase for interfaces and types (e.g., `interface Contact {}`, `type ViewMode = "table" | "grid"`)
- Python: PascalCase for Pydantic models (e.g., `class SendMessageRequest(BaseModel)`)

**Constants:**
- Go: ALL_CAPS (e.g., `ErrCodeNotFound`, `UserIDKey`, `MAX_TOOL_ROUNDS`)
- TypeScript: ALL_CAPS for constants and const objects (e.g., `AVATAR_COLORS`, `SOURCES`, `DATE_OPTIONS`)
- Python: ALL_CAPS for module-level constants (e.g., `TOOL_DEFINITIONS`, `MODEL`, `MAX_TOOL_ROUNDS`)

## Code Style

**Formatting:**
- Go: Standard `gofmt` style, 4-space indentation via tabs
- TypeScript/React: Prettier with 2-space indentation, semi-colons enabled, double quotes, trailing commas (es5)
  - Config: `frontend/.prettierrc` — `semi: true`, `singleQuote: false`, `tabWidth: 2`, `trailingComma: "es5"`, `plugins: ["prettier-plugin-tailwindcss"]`
- Python: PEP 8 style (implied, no formatter enforced)

**Linting:**
- Go: No explicit linter configured; standard Go formatting
- TypeScript: ESLint with Next.js config (`eslint-config-next` preset) + custom rule for unescaped entities
- Python: No explicit linter configured

**Tailwind CSS:**
- All frontend styling uses Tailwind utility classes inline in JSX
- No CSS files; all styling declarative in components
- `prettier-plugin-tailwindcss` auto-sorts class names
- Colors via design tokens (e.g., `bg-blue-500`, `text-gray-700`)
- Responsive utilities: `md:`, `lg:`, `xl:` prefixes

## Import Organization

**Go:**
```go
// Grouped: stdlib, third-party, local packages
// Alphabetical within groups; blank lines between groups
import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
	"crm-api/internal/database"
)
```

**TypeScript:**
```typescript
// React/Next.js
// Third-party (lucide-react, etc.)
// Relative imports with @/ alias (preferred)
// Type-only imports with 'import type' where applicable
import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Plus, Folder } from "lucide-react";
import { listContacts } from "@/lib/api/contacts";
import type { Contact } from "@/lib/api/contacts";
```

**Python:**
```python
# Docstring at top
# stdlib (asyncio, json, logging, etc.)
# Third-party (fastapi, anthropic, psycopg2, etc.)
# Local (from app...)
# Alphabetical within each group
"""Module docstring."""
import asyncio
import json
import logging

from anthropic import Anthropic
from fastapi import APIRouter
from pydantic import BaseModel

from app.database import get_conn
from app.tools import execute_write_tool
```

**Path Aliases:**
- TypeScript: `@/*` maps to `src/*` (configured in `frontend/tsconfig.json`)
- Used everywhere in frontend code for cleaner imports

## Error Handling

**Go Pattern:**
- Handler factory functions return `http.HandlerFunc` that capture the pool via closure
- Error handling is silent with generic error messages: `respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)`
- No error wrapping beyond HTTP response; errors logged at the HTTP level
- Error responses are structured: `{"error": "message", "code": "ERR_DATABASE"}`
- Status codes match HTTP semantics (201 Created, 204 No Content, 404 Not Found, 400 Bad Request, 500 Internal Server Error)

**TypeScript Pattern:**
```typescript
// Errors from apiRequest() are thrown immediately on non-2xx response
// Caught and logged at page level (no try-catch in most components)
// Error toast notifications shown to users
const { data } = useQuery({
  queryKey: ['contacts'],
  queryFn: async () => {
    const token = await getToken();
    return listContacts(token!, { search, source });
  },
});
```

**Python Pattern:**
- FastAPI `HTTPException` with `status_code` and `detail` parameters
- Unhandled exceptions return 500 via FastAPI middleware
- No explicit error logging in business logic; FastAPI middleware logs requests

## Logging

**Go:**
- Structured JSON logging via `log/slog` with `JSONHandler`
- Log level: `LevelInfo` by default
- Pattern: `slog.Info("event", "key", value)` or `slog.Error("event", "error", err)`

**TypeScript:**
- Browser console logging only (no structured logging)
- Error logging in page components on mutation failure
- TanStack Query logs in development mode

**Python:**
- FastAPI middleware logs HTTP requests via Uvicorn stdout
- No explicit custom logging in business logic
- Module-level `logger` initialized with `logging.getLogger(__name__)` but not actively used in visible patterns

## Comments

**When to Comment:**
- Comments explain **why**, not what the code does
- Docstrings on functions/methods describe purpose, inputs, and returns
- TODO/FIXME comments are sparse and specific

**JSDoc/TSDoc:**
- Docstrings present on FastAPI endpoints (brief explanation of behavior)
- TypeScript: Minimal use; types are self-documenting via interfaces

**Go Comments:**
- Exported functions have comment explanations (not strict in all handlers)
- Struct tags document JSON field mappings via `json:"field_name"`

**Python Docstrings:**
- Module-level docstring at top of file
- Function docstrings explain flow (e.g., in `agent.py`: "Load conversation history → Build system prompt → Call Claude → Stream response")

## Function Design

**Size:**
- Go handlers tend to be 50–150 lines (query building + scanning + response)
- TypeScript page components are 200–400 lines (state setup, hooks, JSX)
- Python service functions are 30–80 lines (focused operations)

**Parameters:**
- Go: Handler factories take `*pgxpool.Pool` and return `http.HandlerFunc`
- TypeScript: Functions take typed arguments (filters object, token string, ids)
- Python: Functions take explicit parameters; requests modeled via Pydantic

**Return Values:**
- Go: Functions that may fail return `(T, error)` or write to `http.ResponseWriter` directly
- TypeScript: API functions return `Promise<T>` (errors thrown)
- Python: Async functions return results or raise `HTTPException`

**Context Usage:**
- Go: `r.Context()` passed to all DB queries; RLS setup via `BeginWithRLS(ctx, pool, agentID)`
- TypeScript: Clerk context via `useAuth()` hook; no explicit context passing
- Python: Agent ID extracted from request and used as a parameter

## Module Design

**Exports:**
- Go: Exported functions (PascalCase) are handlers or helpers; unexported (camelCase) are internal utilities
- TypeScript: Named exports for interfaces and functions (no default exports for utilities)
- Python: FastAPI routers are `APIRouter()` instances; tools defined in module-level lists

**Barrel Files:**
- TypeScript: No barrel files (`index.ts` pattern) used; direct imports preferred
- Go: Package-level organization (each domain gets a file: `contacts.go`, `deals.go`, etc.)
- Python: Routes organized in `app/routes/` with routers included in `main.py`

## Cross-Service Patterns

**Database Column Naming:**
- Always `snake_case` (e.g., `first_name`, `agent_id`, `created_at`)

**API JSON Field Naming:**
- Always `snake_case` (e.g., `"first_name": "John"`)

**Frontend Type Naming:**
- PascalCase interfaces: `interface Contact {}`
- camelCase field access (mapped from API response)

**Authentication Pattern:**
- Frontend: Clerk `useAuth()` → `getToken()` → Bearer token in `Authorization` header
- Backend: Clerk JWT validation in middleware; user ID extracted to context
- Inter-service: `X-AI-Service-Secret` header for Go ↔ Python communication; `X-Agent-ID` for agent identification

## Transaction Pattern (Go)

```go
tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
if err != nil {
  respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
  return
}
defer tx.Rollback(r.Context())

// queries...

if err := tx.Commit(r.Context()); err != nil {
  respondErrorWithCode(w, http.StatusInternalServerError, "commit error", ErrCodeDatabase)
  return
}
```

## Data Type Nullable Patterns

**Go:**
- Pointers for nullable fields: `*string`, `*float64`, `*int` in structs
- JSON tags preserve field names: `json:"email"` (not `json:"email,omitempty"` — null is explicit)

**TypeScript:**
- Union with null: `string | null` (not optional `?string`)
- Zod schemas use `.nullable()` for nullable fields

**Python:**
- Pydantic models use `Optional[Type]` or `Type | None`
- Database results handle NULL as None

## Testing Conventions

- **Go:** Tests live in same package with `_test.go` suffix; use `httptest` for handler testing
- **TypeScript:** Tests not extensively used; TanStack Query integration tests via component testing
- **Python:** Pytest-style tests; metadata-focused tests (tool definitions, schema validation) preferred

---

*Convention analysis: 2026-03-24*
