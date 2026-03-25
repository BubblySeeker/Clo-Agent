# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Backend (Go):**
- Runner: Standard `testing` package (Go stdlib)
- Assertion Library: None; manual assertions with error checks
- Config: No explicit test config file
- Run Commands:
  ```bash
  go test ./...              # Run all tests
  go test -v ./...           # Verbose output
  go test -cover ./...       # Coverage report
  ```

**AI Service (Python):**
- Runner: pytest
- Assertion Library: pytest assertions (built-in `assert` statements)
- Config: No explicit `pytest.ini` or `setup.cfg`
- Run Commands:
  ```bash
  pytest ai-service/tests/           # Run all tests
  pytest ai-service/tests/ -v        # Verbose output
  pytest ai-service/tests/ --cov     # Coverage report
  ```

**Frontend (TypeScript/React):**
- Testing: Not extensively implemented
- TanStack Query provides caching/refetch testing via integration
- No Jest/Vitest config present

## Test File Organization

**Location:**
- **Go:** Co-located with source code (same directory)
  - `backend/internal/handlers/contacts.go` → test in same `handlers/` package
  - `backend/internal/handlers/handlers_test.go` — shared test utilities
- **Python:** Separate `tests/` directory
  - `ai-service/tests/test_tools.py` — metadata and tool definition validation
  - No integration tests with live database
- **TypeScript:** No test files currently committed

**Naming:**
- Go: `*_test.go` suffix
- Python: `test_*.py` prefix (pytest convention)

**Structure:**
```
backend/internal/handlers/
├── contacts.go
├── deals.go
├── handlers_test.go        # Shared test file
└── ... (other handlers)

ai-service/tests/
├── __init__.py
└── test_tools.py           # Tool definition validation
```

## Test Structure

**Go Pattern:**

```go
// backend/internal/handlers/handlers_test.go
func TestHandlerFactoriesReturnHandlers(t *testing.T) {
	// Subtests via map iteration
	factories := map[string]func() http.HandlerFunc{
		"ListContacts": func() http.HandlerFunc { return ListContacts(nil) },
		// ...
	}

	for name, factory := range factories {
		t.Run(name, func(t *testing.T) {
			handler := factory()
			if handler == nil {
				t.Errorf("%s returned nil handler", name)
			}
		})
	}
}

// Handler validation tests
func TestCreateContactValidation(t *testing.T) {
	handler := CreateContact(nil)

	tests := []struct {
		name       string
		body       interface{}
		wantStatus int
	}{
		{
			name:       "invalid JSON",
			body:       "not json",
			wantStatus: http.StatusBadRequest,
		},
		// ... more cases
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var bodyBytes []byte
			// ... marshal body

			req := httptest.NewRequest(http.MethodPost, "/api/contacts", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d", tt.wantStatus, w.Code)
			}
		})
	}
}
```

**Python Pattern:**

```python
# ai-service/tests/test_tools.py
import pytest

class TestToolDefinitions:
    """Validate the shape and consistency of tool definitions."""

    def setup_method(self):
        """Initialize test fixtures before each test."""
        self.definitions, self.read_tools, self.write_tools = get_tool_definitions()

    def test_all_tools_have_required_fields(self):
        for tool in self.definitions:
            assert "name" in tool, f"Tool missing 'name': {tool}"
            assert "description" in tool, f"Tool {tool.get('name')} missing 'description'"
            assert "input_schema" in tool, f"Tool {tool['name']} missing 'input_schema'"

    def test_tool_names_are_unique(self):
        names = [t["name"] for t in self.definitions]
        assert len(names) == len(set(names)), f"Duplicate tool names: {[n for n in names if names.count(n) > 1]}"

    def test_create_contact_schema(self):
        tool = next(t for t in self.definitions if t["name"] == "create_contact")
        schema = tool["input_schema"]
        assert "first_name" in schema["properties"]
        assert "first_name" in schema["required"]
```

## Mocking

**Go:**
- `httptest.NewRequest()` and `httptest.NewRecorder()` for HTTP request/response mocking
- Handler factories accept `*pgxpool.Pool` but tests pass `nil` (handlers don't execute queries without a real pool)
- No mocking library used; tests validate handler structure, not business logic

**Python:**
- `unittest.mock.MagicMock()` to mock database module before importing tools
- Tools module imports lazily to avoid DB connection at import time
- Prevents test setup from requiring a live PostgreSQL connection

**What to Mock:**
- HTTP requests/responses (Go: `httptest`)
- Database modules at import time (Python: unittest.mock)
- External service calls (handled via request mocking in integration tests)

**What NOT to Mock:**
- Handler factory functions (test that they return a valid handler, not their internal logic)
- Tool definitions (test schema validation directly)
- Core business logic (test with real data structures)

## Fixtures and Factories

**Test Data:**
- Go: Inline map-based test cases in struct slices
  ```go
  tests := []struct {
    name       string
    body       interface{}
    wantStatus int
  }{
    { name: "invalid JSON", body: "not json", wantStatus: 400 },
    // ...
  }
  ```

**Location:**
- Go: Tests in same package as source, no separate fixtures directory
- Python: Test fixtures defined in `setup_method()` of test classes
- No external fixture files (`.yaml`, `.json`) used

## Coverage

**Requirements:**
- No explicit coverage target enforced
- Coverage measurement available via:
  - Go: `go test -cover ./...`
  - Python: `pytest --cov ai-service/tests/`

**View Coverage:**
```bash
# Go
go test -cover ./internal/handlers/

# Python
pytest ai-service/tests/ --cov=app --cov-report=html
```

## Test Types

**Unit Tests (Go):**
- Scope: Handler factory instantiation, input validation
- Approach: Test handler returns valid `http.HandlerFunc`, request validation before DB access
- Example: `TestCreateContactValidation` validates JSON parsing and required fields

**Unit Tests (Python):**
- Scope: Tool metadata, schema validation, classification logic
- Approach: Load tool definitions, validate structure without database
- Example: `TestToolDefinitions` ensures all tools have required fields, unique names, consistent schema

**Integration Tests:**
- Not extensively implemented
- Would require database fixtures and transactional rollback
- Frontend uses TanStack Query for implicit integration testing via data fetching

**E2E Tests:**
- Not implemented
- Would require full Docker Compose stack and browser automation

## Common Patterns

**Async Testing (Python):**
- Async tests not currently used in visible test files
- Tool execution is synchronous or wrapped in `asyncio.run()` for testing

**Error Testing (Go):**
```go
func TestCreateContactValidation(t *testing.T) {
	handler := CreateContact(nil)

	tests := []struct {
		name       string
		body       interface{}
		wantStatus int
	}{
		{
			name:       "missing required fields",
			body:       map[string]string{"email": "test@example.com"},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/contacts", ...)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected %d, got %d", tt.wantStatus, w.Code)
			}
		})
	}
}
```

**Error Testing (Python):**
```python
def test_every_tool_classified_as_read_or_write(self):
	all_names = {t["name"] for t in self.definitions}
	classified = self.read_tools | self.write_tools
	unclassified = all_names - classified
	assert not unclassified, f"Tools not classified: {unclassified}"
```

## Handler Testing Pattern

All handler tests follow this structure (`backend/internal/handlers/handlers_test.go`):

1. **Factory instantiation:** Verify handler factories return non-nil `http.HandlerFunc`
   ```go
   handler := CreateContact(nil)
   if handler == nil {
       t.Errorf("CreateContact returned nil handler")
   }
   ```

2. **Request validation:** Test input validation (JSON parsing, required fields)
   ```go
   req := httptest.NewRequest(http.MethodPost, "/api/contacts", bodyReader)
   req.Header.Set("Content-Type", "application/json")
   w := httptest.NewRecorder()

   handler.ServeHTTP(w, req)

   if w.Code != tt.wantStatus {
       t.Errorf("expected %d, got %d; body: %s", tt.wantStatus, w.Code, w.Body.String())
   }
   ```

3. **No database execution:** Tests pass `nil` pool; actual DB tests not implemented
   - Tests validate handler structure and input validation, not business logic
   - Would require database fixtures for full integration testing

## Tool Definition Validation (Python)

The test suite in `ai-service/tests/test_tools.py` validates tool metadata without requiring a database:

```python
class TestToolDefinitions:
    def test_all_tools_have_required_fields(self):
        """Every tool must have name, description, input_schema."""

    def test_all_tools_have_valid_schema(self):
        """Schema must be object type with properties and required fields."""

    def test_required_fields_exist_in_properties(self):
        """Fields marked required must exist in properties dict."""

    def test_tool_names_are_unique(self):
        """No duplicate tool names allowed."""

    def test_every_tool_classified_as_read_or_write(self):
        """All tools must be in READ_TOOLS or WRITE_TOOLS set."""

    def test_no_tool_is_both_read_and_write(self):
        """No tool in both sets simultaneously."""

    def test_read_tools_count(self):
        """Minimum expected count of read tools."""

    def test_write_tools_count(self):
        """Minimum expected count of write tools."""

    def test_expected_read_tools_exist(self):
        """Specific read tools must be present (search_contacts, get_deal, etc.)."""

    def test_expected_write_tools_exist(self):
        """Specific write tools must be present (create_contact, update_deal, etc.)."""
```

These tests ensure the tool catalog is self-consistent and matches the agent's expectations.

## Test Coverage Gaps

**Backend:**
- No integration tests with live database
- No end-to-end handler tests (would require transaction rollback fixtures)
- Handler tests validate structure, not business logic execution
- No middleware chain testing (auth, user sync, logging)

**Frontend:**
- No unit tests or integration tests for React components
- TanStack Query provides implicit caching behavior verification
- No E2E tests (would require browser automation)

**AI Service:**
- No integration tests with Claude API
- Tool execution not tested (requires database)
- No agentic loop testing (max tool rounds, retry logic)
- Agent context building not tested

**Risk:** Bugs in business logic may not be caught until runtime or manual testing.

## Running Tests

```bash
# Backend
cd /Users/matthewfaust/CloAgent/Clo-Agent/backend
go test -v ./...

# AI Service
cd /Users/matthewfaust/CloAgent/Clo-Agent/ai-service
pytest tests/ -v

# Frontend
# No test runner configured
```

---

*Testing analysis: 2026-03-24*
