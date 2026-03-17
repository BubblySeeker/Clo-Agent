# CloAgent Testing Status

## Executive Summary

**No tests exist in the application code.** The codebase has no unit tests, integration tests, or end-to-end tests for the three services (Go backend, Next.js frontend, Python AI service). This is an MVP state without test coverage.

The repository does contain tests in `.claude/skills/gstack/`, but those are for the gstack build/testing tool itself, not for CloAgent.

---

## Backend (Go)

### Current State
- **No test files** — No `*_test.go` files in `backend/`
- **No test framework** — No testing imports (standard `testing` package not used)
- **No mocking** — No mock libraries (testify, mockgen, etc.)
- **No test data** — No fixtures or factories

### What Would Need Testing

If tests were to be added, the following areas are critical:

1. **Handler layer** (`internal/handlers/`)
   - All CRUD operations: ListContacts, CreateContact, UpdateContact, DeleteContact
   - Query parameter parsing and validation
   - Authorization checks (agentID from context)
   - Error responses (404, 400, 500)
   - Pagination logic

2. **Database layer** (`internal/database/`)
   - `BeginWithRLS()` transaction initialization
   - RLS context setting (`app.current_agent_id`)
   - Transaction rollback on error

3. **Middleware** (`internal/middleware/`)
   - Clerk JWT validation (ClerkAuth)
   - User sync on first request (UserSync)
   - CORS header handling
   - Context key injection

4. **Config** (`internal/config/`)
   - Environment variable loading
   - .env file parsing
   - Default values for optional vars

### Testing Approach (If Implemented)

**Framework**: Standard Go `testing` package

**Mocking**:
- pgx mock for database (e.g., `jackc/pgmock` or testify/mock)
- Clerk SDK mock (custom mock or interface wrapping)

**Pattern**:
```go
func TestListContacts(t *testing.T) {
    // Arrange: setup mock pool, RLS context
    pool := setupMockPool(t)

    // Act: call handler
    handler := handlers.ListContacts(pool)
    w := httptest.NewRecorder()
    req := httptest.NewRequest("GET", "/api/contacts?search=john", nil)
    req = req.WithContext(context.WithValue(context.Background(), middleware.AgentUUIDKey, "test-agent-id"))

    // Assert: check response
    handler.ServeHTTP(w, req)
    if w.Code != http.StatusOK {
        t.Errorf("expected 200, got %d", w.Code)
    }

    var resp map[string]interface{}
    json.NewDecoder(w.Body).Decode(&resp)
    if resp["contacts"] == nil {
        t.Error("expected contacts in response")
    }
}
```

**Setup**:
- Table-driven tests for multiple scenarios (search found, search not found, invalid pagination)
- Helper functions to create test fixtures (mock contacts, deals, etc.)
- `httptest.NewRecorder()` and `httptest.NewRequest()` for HTTP testing

---

## Frontend (Next.js/TypeScript)

### Current State
- **No test files** — No `.test.tsx`, `.spec.tsx`, or test directory
- **No test framework** — No Jest, Vitest, or similar in package.json devDependencies
- **No testing libraries** — No `@testing-library/react`, `@testing-library/next`

### What Would Need Testing

If tests were to be added:

1. **API layer** (`src/lib/api/`)
   - `apiRequest()` function
   - Query string building (URLSearchParams)
   - Error handling (non-2xx responses)
   - 204 No Content handling
   - All CRUD functions (listContacts, createContact, etc.)

2. **Pages** (`src/app/dashboard/`)
   - TanStack Query integration
   - User interactions (form submit, filter changes, pagination)
   - Navigation on create/delete
   - Loading and error states

3. **Components** (`src/components/`)
   - AIChatBubble: message display, send, SSE streaming, confirmation cards
   - Contact list: search, filters, pagination, grid/table view
   - Deal Kanban: drag-drop logic

4. **Zustand store** (`src/store/ui-store.ts`)
   - State mutations (toggleSidebar, setChatOpen, etc.)
   - Message append/update logic

### Testing Approach (If Implemented)

**Framework**: Jest or Vitest (Next.js default is Jest)

**Libraries**:
- `@testing-library/react` — Component rendering & user interaction
- `@testing-library/next` — Next.js helpers
- `@tanstack/react-query` test utilities
- `msw` (Mock Service Worker) — HTTP mocking

**Pattern**:
```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ContactsPage from "@/app/dashboard/contacts/page";

describe("ContactsPage", () => {
  it("renders contacts from API", async () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ContactsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });

  it("filters contacts by search", async () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ContactsPage />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "john" },
    });

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });
});
```

**Setup**:
- jest.config.js with Next.js preset
- Mock API calls with `msw` or jest.mock()
- Wrap components with QueryClientProvider for tests
- Use `userEvent` from testing-library for realistic interactions

**Skipped for Now**:
- Styling tests (Tailwind CSS)
- Marketing page tests (lower priority)
- E2E tests (would use Playwright or Cypress)

---

## AI Service (Python/FastAPI)

### Current State
- **No test files** — No `test_*.py` or `*_test.py` files in `ai-service/`
- **No test framework** — No pytest in requirements.txt
- **No mocking** — No unittest.mock, pytest-mock, or similar

### What Would Need Testing

If tests were to be added:

1. **Routes** (`app/routes/`)
   - POST /ai/messages — SSE streaming response
   - POST /ai/confirm — pending action execution
   - POST /profiles/generate — AI profile generation
   - GET /health — health check

2. **Agent loop** (`app/services/agent.py`)
   - System prompt building (general vs. contact-scoped)
   - Conversation history loading
   - Claude API calls and tool calling
   - Tool execution loop (max 5 rounds)
   - Message streaming via SSE

3. **Tools** (`app/tools.py`)
   - Read tools: all 11 tools return correct data from DB
   - Write tools: all 12 tools queue pending actions correctly
   - Tool parameter validation

4. **Database** (`app/database.py`)
   - Connection pool initialization
   - Context manager (get_conn) borrow/return
   - async wrapper (run_query) execution

### Testing Approach (If Implemented)

**Framework**: pytest

**Libraries**:
- `pytest-asyncio` — Async test support
- `pytest-mock` — Mocking fixtures
- `psycopg2.pool.SimpleConnectionPool` — Test database (in-memory or test container)
- `testcontainers` or `pytest-docker` — PostgreSQL test container

**Pattern**:
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_conn

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def test_agent_id():
    return "test-agent-id"

def test_send_message(client, test_agent_id, mocker):
    # Mock Claude API response
    mock_response = {
        "content": [
            {"type": "text", "text": "Hello!"}
        ]
    }
    mocker.patch("anthropic.Anthropic.messages.create", return_value=mock_response)

    # Mock database
    mocker.patch("app.tools.get_conn")

    # Act
    response = client.post(
        "/ai/messages",
        json={
            "conversation_id": "test-conv-id",
            "agent_id": test_agent_id,
            "content": "Hello",
        },
        headers={"X-AI-Service-Secret": "test-secret"},
    )

    # Assert
    assert response.status_code == 200
    # Check SSE event format

def test_execute_write_tool(mocker):
    # Mock database
    mocker.patch("app.tools.get_conn")

    # Queue and execute
    pending_id = queue_write_tool("create_contact", {
        "first_name": "John",
        "last_name": "Doe",
    })

    result = execute_write_tool(pending_id)

    assert result["contact_id"] is not None
```

**Setup**:
- `TestClient` from FastAPI for HTTP testing
- Fixtures for agent_id, conversation_id, contact_id
- Mock database with fixture providing a test connection
- Mock Anthropic API responses
- Table-driven tests for tool validation

**Database Testing**:
- Use testcontainers PostgreSQL or in-memory SQLite
- Seed with test data before each test
- Rollback after test (or use separate test DB)

---

## Test Infrastructure (If Implemented)

### Backend (Go)
```
backend/
├── cmd/
│   └── api/
│       └── main_test.go
├── internal/
│   ├── handlers/
│   │   ├── contacts_test.go
│   │   ├── deals_test.go
│   │   └── ...
│   ├── middleware/
│   │   ├── auth_test.go
│   │   └── user_sync_test.go
│   ├── database/
│   │   └── rls_test.go
│   └── config/
│       └── config_test.go
├── testdata/
│   └── fixtures.sql
└── go.mod
```

**Run tests**: `go test ./...`

### Frontend (Next.js)
```
frontend/
├── src/
│   └── lib/
│       ├── api/
│       │   ├── contacts.test.ts
│       │   └── ...
│       └── __tests__/
│           └── api.test.ts
├── jest.config.js
├── jest.setup.js
└── package.json
```

**Run tests**: `npm test`

### AI Service (Python)
```
ai-service/
├── app/
│   ├── routes/
│   │   ├── chat_test.py
│   │   └── ...
│   ├── services/
│   │   └── agent_test.py
│   ├── tools_test.py
│   └── database_test.py
├── tests/
│   ├── conftest.py
│   └── fixtures/
│       └── seed.sql
├── pytest.ini
├── requirements-dev.txt
└── setup.py
```

**Run tests**: `pytest` or `pytest -v` for verbose

---

## CI/CD Testing (If Implemented)

### GitHub Actions Workflow Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.24'
      - run: cd backend && go test -v -race ./...

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd frontend && npm ci && npm test

  ai-service:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: cd ai-service && pip install -r requirements-dev.txt && pytest -v
```

---

## Coverage Goals (If Implemented)

| Service | Target Coverage | Priority |
|---------|-----------------|----------|
| Backend handlers | 80% | High — all CRUD paths |
| Backend middleware | 90% | High — auth-critical |
| Backend database | 70% | Medium — RLS is complex |
| Frontend API layer | 85% | High — all fetch paths |
| Frontend pages | 60% | Medium — integration tests preferred |
| Frontend components | 70% | Medium — critical components only |
| AI Service routes | 85% | High — SSE streaming, auth |
| AI Service tools | 70% | Medium — read tools critical, write tools require DB |
| AI Service agent loop | 50% | Low — integration test preferred |

---

## Notes & Recommendations

### Why No Tests Currently?

1. **MVP stage** — Prioritized feature delivery over test coverage
2. **Rapid iteration** — Schema and API endpoints still evolving
3. **Manual testing** — Team likely testing via browser/Postman
4. **Single developer** — Matthew working on all three services

### Path Forward

1. **Phase 1** (High Priority): Add handler tests for backend
   - Simplest to implement (httptest, mock pool)
   - Highest ROI (all API integration paths)
   - Estimated: 40-60 test cases

2. **Phase 2** (Medium Priority): Add tests for critical frontend features
   - API layer tests (no component mocking needed)
   - Critical pages (contacts, deals, chat)
   - Estimated: 20-30 test cases

3. **Phase 3** (Lower Priority): Add AI service tests
   - Most complex due to Claude API, DB, streaming
   - Lower priority because AI is deterministic (Claude handles complexity)
   - Estimated: 30-50 test cases

4. **Phase 4** (Last): E2E tests
   - Playwright or Cypress
   - Full flow: sign-in → create contact → chat → confirm action
   - After all unit tests in place

### Current Risks (Without Tests)

- **Regression on refactor** — Changing SQL patterns or handler structure could silently break features
- **Edge cases** — Pagination, empty results, invalid inputs not covered
- **Auth bypass** — RLS context not set correctly could leak data between agents
- **Integration** — Backend ↔ AI Service secret validation not tested

### Recommendations for Immediate Fixes (No Test Code)

1. Add integration test for RLS isolation (different agents see different data)
2. Add manual test plan for critical flows (sign-in, create contact, chat, confirm action)
3. Document test cases manually in `.planning/` until tests are written
