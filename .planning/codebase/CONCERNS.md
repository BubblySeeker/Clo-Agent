# Codebase Concerns

**Analysis Date:** 2026-03-24

## Tech Debt

### Monolithic tool dispatcher in AI service

**Issue:** The `execute_read_tool()` and `execute_write_tool()` functions in `ai-service/app/tools.py` use long if/elif chains (15+ branches each) to route tool calls.

**Files:** `ai-service/app/tools.py` (lines 550-606)

**Impact:**
- Adding a new tool requires touching 3 places: TOOL_DEFINITIONS list, READ_TOOLS/WRITE_TOOLS sets, and the dispatcher chain
- High risk of forgetting to add a dispatcher branch (tool defined but unreachable)
- 1743-line file with mixed concerns (definitions, dispatch, implementations)

**Fix approach:** Refactor to dict-based dispatchers: `{"tool_name": (handler_fn, required_args)}`. Consolidate tool implementations into separate handler functions. Reduces touch points to 2 (definitions + dispatcher dict).

**Priority:** P3 (works, but grows harder to maintain with each tool)

---

### Oversized Python service files

**Issue:** Business logic concentrated in files that exceed best-practice sizes:

**Files:**
- `ai-service/app/tools.py` (1743 lines)
- `ai-service/app/services/document_processor.py` (978 lines)

**Impact:**
- Hard to navigate and understand at a glance
- Difficult to test in isolation (tools.py defines 30+ functions mixed with schemas)
- Higher cognitive load during debugging and modifications

**Fix approach:**
- Split `tools.py` into `tools/definitions.py`, `tools/dispatchers.py`, `tools/implementations.py`
- Extract document processor subsystems into separate modules (e.g., `pdf_extraction.py`, `chunking.py`)

**Priority:** P3 (readability, not functionality)

---

## Known Bugs

### Missing error state handling in frontend dashboard

**Issue:** Dashboard pages use TanStack Query but ignore the `error` state. If an API call fails, no error UI is shown to the user.

**Files:**
- `frontend/src/app/dashboard/page.tsx` (lines 864-866: `const { data, isLoading, isError, refetch } = useQuery()` — `isError` not used)
- Similar patterns in: `contacts/page.tsx`, `pipeline/page.tsx`, `tasks/page.tsx`, `analytics/page.tsx`, `chat/page.tsx`, `documents/page.tsx`, `communication/page.tsx`, `workflows/page.tsx`

**Symptoms:**
- User clicks button, API fails silently
- Dashboard shows nothing (no error message, no retry button)
- User must manually refresh page

**Trigger:** Network error or backend 5xx response during any dashboard query

**Workaround:** Manual page refresh (`Cmd+R`)

**Fix approach:**
1. Add error boundary around dashboard layout (catches React errors)
2. Check `error` state in each `useQuery` and render an error card with retry button
3. Catch errors in `apiRequest()` client function and provide context

**Priority:** P2 (affects user experience on every error)

---

### Unhandled API errors in confirmation flow

**Issue:** When user confirms a pending write action (`POST /api/ai/confirm`), if execution fails mid-operation (e.g., database constraint violation), the frontend shows no error and the action appears stuck.

**Files:**
- `frontend/src/lib/api/conversations.ts` (confirm endpoint call, no error handling shown in context)
- `ai-service/app/routes/chat.py` (lines 64-70: `execute_write_tool()` errors converted to 404 with no detail)

**Impact:**
- Users don't know if their write succeeded or failed
- Multiple confirmation attempts may be submitted
- Pending actions orphaned in database

**Fix approach:**
1. Return detailed error responses (not just 404) from `/api/ai/confirm`
2. Frontend catches confirm errors and shows a dismissible alert: "Action failed: {reason}. Retry?"
3. Add cleanup task to expire stale pending_actions (already in schema, auto-cleanup via TTL)

**Priority:** P2 (critical for write operations)

---

### Silent SQL errors in tool implementations

**Issue:** Tool implementation functions in `ai-service/app/tools.py` execute queries but don't distinguish between "not found" (0 rows) and "query error" (database failure).

**Files:** `ai-service/app/tools.py` (e.g., lines 687-703 `_get_contact_details`, 718-735 `_get_deal`)

**Pattern:**
```python
cur.execute(...)
row = cur.fetchone()
if not row:
    return {"error": "Contact not found"}
```

**Impact:**
- Network timeout or database crash returns same response as "contact doesn't exist"
- Frontend can't distinguish between user error and system error
- No logging of query failures makes debugging production issues hard

**Fix approach:**
1. Wrap all DB queries in try/except, log failures with query name and error
2. Return structured errors: `{"error": "...", "error_type": "not_found" | "db_error"}`
3. Frontend logs error types for monitoring

**Priority:** P2 (affects debugging and error recovery)

---

## Security Considerations

### Missing API request validation in frontend

**Issue:** The `apiRequest()` client in `frontend/src/lib/api/client.ts` trusts all server responses. No runtime validation of response shape.

**Files:** `frontend/src/lib/api/client.ts` (lines 17-24)

**Risk:**
- Backend schema changes cause runtime crashes in frontend (undefined property access)
- Malformed responses cause silent failures in TanStack Query caching
- No early warning of API contract violations

**Current mitigation:** TypeScript types (compile-time only, not enforced at runtime)

**Recommendations:**
1. Add Zod schemas for all API responses
2. Parse responses through schema in `apiRequest()` before returning
3. Throw validation error if response shape doesn't match (caught by existing error handling)

**Priority:** P3 (low risk, but improves robustness)

---

### Shared secret for AI service auth

**Issue:** Backend-to-AI-service communication uses a shared secret in the `X-AI-Service-Secret` header.

**Files:**
- `backend/internal/config/config.go` (lines 46: `AIServiceSecret`)
- `backend/cmd/api/main.go` (config loading)
- `ai-service/app/config.py` (validation)

**Risk:**
- Secret stored as plaintext in environment files (`.env`)
- Single shared secret means any compromised service can impersonate the backend
- No way to rotate secret without downtime

**Current mitigation:** Environment variable separation (backend and AI service not exposed to internet)

**Recommendations:**
1. Use mutual TLS (mTLS) instead of shared secret
2. Implement secret rotation mechanism (staged rollout of old/new secrets)
3. Add rate limiting on AI service endpoints to detect abuse

**Priority:** P3 (internal service, but good hardening)

---

### Encryption key management

**Issue:** Document encryption key stored as environment variable (`ENCRYPTION_KEY`).

**Files:** `backend/internal/config/config.go` (line 51), `backend/cmd/api/main.go` (line 61)

**Risk:**
- Key exposed in logs if accidentally printed
- No key rotation mechanism
- Leaked key decrypts all historical documents

**Current mitigation:** Optional (only set if feature is used)

**Recommendations:**
1. Use AWS KMS or HashiCorp Vault for key management
2. Implement key rotation (versioning + re-encryption)
3. Audit logging on decrypt operations

**Priority:** P3 (only if document encryption is enabled)

---

## Performance Bottlenecks

### N+1 queries in contact list

**Issue:** Dashboard and contact list queries fetch contact rows but might trigger additional queries for buyer profiles or recent activities on each row.

**Files:**
- `ai-service/app/tools.py` (lines 649-684 `_search_contacts`)
- `backend/internal/handlers/contacts.go` (contact list handler)

**Cause:**
- Contact list query doesn't JOIN with buyer_profiles or activities
- If UI renders buyer profile preview, separate query fires per contact

**Current capacity:** Tested with ~100 contacts; behavior untested at 1000+

**Scaling path:**
1. Add JOIN to contact list query to fetch buyer profile + last activity in one pass
2. Cache deal stages (already done, 1-hour TTL)
3. Add database indexes on `(agent_id, created_at DESC)` and `(contact_id, created_at DESC)`

**Priority:** P3 (works fine at current scale, refactor when testing larger datasets)

---

### SSE streaming without timeout guards

**Issue:** AI chat streaming via Server-Sent Events has no client-side or server-side timeout. If Claude API hangs, stream hangs forever.

**Files:**
- `ai-service/app/services/agent.py` (Claude API call in `run_agent()`)
- `ai-service/app/routes/chat.py` (lines 49-61: streaming response, no timeout)

**Current behavior:**
- FastAPI default timeout: none (stream can hang forever)
- Frontend has no timeout (will wait indefinitely)

**Impact:**
- Browser tab stays open, consuming connection
- User can't tell if request is stuck or still processing

**Scaling path:**
1. Add `timeout=30` to Claude API call
2. Add frontend 60-second timeout with user-visible countdown
3. Return SSE error event if timeout occurs: `{"type": "error", "message": "Request timed out"}`

**Priority:** P3 (rare in practice, but improves reliability)

---

## Fragile Areas

### Contact deletion cascades

**Files:** `backend/internal/handlers/contacts.go` (delete handler), database migrations (`001_init.sql`)

**Why fragile:**
- Single contact delete cascades to activities, deals, buyer_profiles, ai_profiles, embeddings, messages in conversations
- No soft-delete; data permanently lost
- User confirms delete but can't see what will be deleted

**Safe modification:**
1. Before implementing, audit all foreign keys pointing to contacts
2. Add a confirmation modal showing what will be deleted: "Delete John Doe and X deals, Y activities, Z messages?"
3. Consider implementing soft-delete (add `deleted_at` column, update RLS policies)

**Test coverage:** No tests for cascade behavior; risk of data loss bugs

**Priority:** P2 (affects data integrity)

---

### Workflow execution engine

**Files:** `ai-service/app/services/workflow_engine.py` (248 lines)

**Why fragile:**
- Workflows trigger after write tool confirmation (async with `asyncio.create_task`)
- If trigger matching fails, workflow doesn't execute but no error is logged
- Workflow steps execute sequentially; if step fails, remaining steps skip with no retry
- No visibility into workflow execution state (no logs, no status updates to frontend)

**Safe modification:**
1. Add comprehensive logging to workflow engine: trigger match, step execution, failures
2. Implement workflow run history in database (update needed to `workflow_runs` schema)
3. Add retry logic for failed steps (configurable per step)

**Test coverage:** Unit tests exist but integration tests lacking

**Priority:** P2 (automation reliability critical for user trust)

---

### Document processing with external command execution

**Files:** `ai-service/app/services/document_processor.py` (lines 30-81)

**Why fragile:**
- Uses `subprocess.run()` to call LibreOffice headless for DOCX/XLSX→PDF conversion
- No timeout on LibreOffice execution (added timeout=60, but could hang if command stuck)
- If LibreOffice fails or is missing, silently returns None; document processing continues with no text extracted

**Safe modification:**
1. Add better error recovery: if LibreOffice unavailable, fall back to direct file parsing
2. Log all conversion failures to file for debugging
3. Test with malformed/corrupted input files (PDFs with embedded executables, etc.)

**Test coverage:** No tests for document processing

**Priority:** P3 (edge case, but impacts document feature reliability)

---

## Scaling Limits

### Database connection pool saturation

**Current:** PGX connection pool: 25 max, 5 min idle

**Limit:** With 10 concurrent users each making 2-3 requests, pool fills up (30 potential connections). After that, new requests queue and eventually timeout.

**Scaling path:**
1. Monitor connection pool utilization in production
2. If approaching limit, increase max to 50
3. Switch to connection pooler (PgBouncer in transaction mode) to reduce backend connections

**Priority:** P3 (test with concurrent user load)

---

### AI Service request queue

**Current:** FastAPI ASGI server (Uvicorn) with no explicit queue depth limit

**Limit:** With slow Claude API (30s per request), more than ~5 concurrent users will back up requests

**Scaling path:**
1. Add request queue monitoring
2. Implement max concurrent request limit (return 503 if exceeded)
3. Add user-visible queue position: "Your chat request is #3 in queue"

**Priority:** P3 (acceptable for 5-10 concurrent users; refactor at higher scale)

---

## Dependencies at Risk

### psycopg2 blocking in async context

**Risk:** AI service uses `psycopg2` (blocking, synchronous library) wrapped in `asyncio.to_thread()`.

**Files:** `ai-service/app/database.py` (async wrapper), `ai-service/app/tools.py` (all DB calls)

**Impact:**
- Each DB call consumes a thread from the thread pool (default 32 threads)
- High concurrency (100+ users) exhausts thread pool, blocking all requests
- Not true async; just threads

**Migration plan:**
1. Replace psycopg2 with `psycopg` (async version) or `asyncpg`
2. Update all tool functions to use async/await
3. Benchmark concurrent performance before/after

**Priority:** P3 (works now, but refactor if scaling beyond 20 concurrent users)

---

### OpenAI API key configured but unused

**Risk:** `frontend/src/lib/api/client.ts` and `ai-service/app/config.py` both reference `OPENAI_API_KEY` in environment.

**Files:**
- `ai-service/app/config.py` (line 8: loads but unused)
- `ai-service/requirements.txt` (OpenAI package installed)

**Impact:**
- Unused dependency bloats container image
- If accidentally wired up, billing surprise for OpenAI calls

**Fix approach:** Remove OpenAI package, config, and references (only Claude API is used)

**Priority:** P3 (cleanup)

---

## Missing Critical Features

### Validation schemas never enforced

**Issue:** Zod package installed in frontend, but schemas only used in forms. No API response validation anywhere.

**Files:**
- `frontend/package.json` (zod ^4.3.6 installed)
- `frontend/src/lib/api/` (no .parse() calls on responses)

**Blocks:**
- Confident API refactoring (can't ensure response shape)
- Early error detection (shape mismatches caught at component, not API layer)

**Priority:** P3 (nice-to-have, not blocking)

---

### Error codes not standardized

**Issue:** Backend handlers return generic "database error", "query error", "scan error" messages. Frontend has no way to distinguish between different error types.

**Files:** `backend/internal/handlers/` (all ~14 handler files using `respondError()`)

**Blocks:**
- Proper error recovery logic (can't retry specific errors)
- User-friendly error messages (all errors look the same to frontend)
- Monitoring/alerting (can't bucket errors by type)

**Planned fix:** TODOS.md #1 — add error codes to all responses

**Priority:** P2 (in backlog, planned for P2 phase)

---

## Test Coverage Gaps

### No integration tests for AI chat flow

**Issue:** AI service tests only validate tool definitions (schema consistency), not actual tool execution.

**Files:** `ai-service/tests/test_tools.py` (unit tests only, no integration)

**What's not tested:**
- End-to-end chat message → Claude → tool call → result flow
- Confirmation flow for write tools
- Workflow triggers on write tool execution
- Concurrent requests handling

**Risk:** Tool bugs only caught in production (user reports them)

**Priority:** P2 (test coverage for critical feature)

---

### No frontend error boundary integration tests

**Issue:** Error boundaries exist but not tested for actual error scenarios.

**Files:** `frontend/src/components/shared/ErrorBoundary.tsx` (exists, but no tests)

**What's not tested:**
- Component throws error → boundary catches → fallback UI renders
- Retry button works after error
- Multiple nested error boundaries

**Risk:** Error boundary breaks silently (component thrown, boundary doesn't catch due to timing issue)

**Priority:** P3 (lower risk, but important for reliability)

---

### Document processing untested

**Issue:** No tests for PDF extraction, chunking, or embedding generation.

**Files:**
- `ai-service/app/services/document_processor.py` (978 lines, zero tests)
- `ai-service/app/services/document_search.py` (345 lines, zero tests)

**What's not tested:**
- Handling of corrupted PDFs
- Chunking with/without overlap
- Embedding generation for long documents
- Edge cases (empty files, binary files, etc.)

**Risk:** Document feature fails in production on edge cases

**Priority:** P2 (document feature can't be trusted without tests)

---

### No load testing

**Issue:** No performance tests for concurrent users or large datasets.

**What's not tested:**
- Dashboard with 1000+ contacts
- 100 concurrent users on chat
- Workflow engine with 50+ active workflows
- Database query performance at scale

**Risk:** Scaling limits unknown; performance degrades unexpectedly in production

**Priority:** P3 (test at 10x current scale before increasing user load)

---

## Summary Table

| Area | Severity | Priority | Effort | Phase |
|------|----------|----------|--------|-------|
| Tool dispatcher monolith | Medium | P3 | Small | Refactor |
| Missing error UI in dashboard | High | P2 | Medium | Bug fix |
| Unhandled API errors in confirm | High | P2 | Medium | Bug fix |
| Silent SQL errors | High | P2 | Small | Bug fix |
| Contact deletion cascades | High | P2 | Medium | Hardening |
| Workflow execution fragility | High | P2 | Medium | Hardening |
| Error codes not standardized | Medium | P2 | Medium | Refactor |
| AI integration tests missing | Medium | P2 | Medium | Testing |
| Document processing untested | Medium | P2 | Medium | Testing |
| API response validation | Low | P3 | Small | Robustness |
| Encryption key mgmt | Low | P3 | Medium | Security |
| psycopg2 blocking | Low | P3 | Large | Future |
| Large Python files | Low | P3 | Small | Refactor |
| Load testing missing | Low | P3 | Medium | Testing |

---

*Concerns audit: 2026-03-24*
