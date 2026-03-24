# CloAgent Codebase — Technical Debt & Concerns

Last assessed: 2026-03-17

## Executive Summary

CloAgent has solid foundational architecture but contains several critical issues that must be addressed before production:
- **Critical (block production)**: In-memory pending actions, silent errors in I/O operations, missing input validation
- **High (block feature parity)**: Hardcoded AI service secret, no error handling in critical paths, unused embeddings table
- **Medium (reduce risk)**: Cascading deletes without confirmation feedback, type-unsafe operations, missing validation

---

## Critical Issues

### 1. In-Memory Pending Actions — Data Loss on Restart

**Severity**: CRITICAL
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` (line 19)
**Issue**: Write tool confirmations stored in a Python dict, lost on service restart.

```python
# Line 19 — apt to lose data
pending_actions: dict[str, dict] = {}
```

**Impact**:
- Users confirm a tool (e.g., "Create Contact John Doe") → `pending_id` stored
- AI service crashes/restarts → `pending_id` disappears
- User's confirmation is orphaned; backend still waiting for execution
- No way to recover the action

**Affected Users**: Anyone using write tools (create/update/delete contacts, deals, profiles, tasks).

**Mitigation Required**:
1. **Persist** pending actions to PostgreSQL (`pending_actions` table with TTL)
2. **Cleanup**: Add job to expire old pending actions (>1 hour)
3. **Idempotency**: Ensure confirm endpoint handles double-confirms gracefully

---

### 2. Hardcoded AI Service Secret

**Severity**: CRITICAL
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/config.py` (line 10)
**Issue**: Default secret exposed in source code.

```python
AI_SERVICE_SECRET: str = os.getenv("AI_SERVICE_SECRET", "cloagent-internal-secret-change-me")
```

**Impact**:
- Anyone cloning the repo can bypass AI service auth with the default secret
- In production, if `AI_SERVICE_SECRET` env var is not set, the default applies
- Go backend and Python service both check `X-AI-Service-Secret` header, but the secret itself is public

**Mitigation Required**:
1. **Never** provide a default secret — raise error if env var missing
2. **Rotate** secret in all environments immediately
3. **Document**: Add warning in CLAUDE.md that this MUST be set in production

---

### 3. Silent I/O Errors in Critical Paths

**Severity**: CRITICAL
**Files**:
- `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/messages.go` (line 161)
- `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/ai_profile.go` (line 100)
- `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/confirm.go` (similar)

**Issue**: Errors silently ignored with `//nolint:errcheck` in response streaming.

```go
// Line 161 in messages.go — write errors silently dropped
w.Write(buf[:n]) //nolint:errcheck

// Line 100 in ai_profile.go — copy errors ignored
io.Copy(w, resp.Body) //nolint:errcheck
```

**Impact**:
- Frontend receives partial/corrupted SSE stream if write fails
- No indication that the response was incomplete
- User sees frozen chat bubble, unclear why
- Production debugging becomes very difficult

**Mitigation Required**:
1. Check errors on `w.Write()` — break stream and log on error
2. Check `io.Copy()` result — log and return error response
3. Add context to error logs (conversation ID, agent ID, operation)

---

### 4. Missing Input Validation in JSON Decode

**Severity**: CRITICAL
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/conversations.go` (line 72)
**Issue**: JSON decode error silently ignored.

```go
// Line 72 in conversations.go
json.NewDecoder(r.Body).Decode(&body)  // Error ignored!
```

**Impact**:
- Malformed request body silently accepted
- `body.ContactID` is `nil` when invalid JSON sent
- Conversation created without validation
- Difficult to debug client-side issues

**Mitigation Required**:
1. Check error from `Decode()`
2. Return 400 with error message if decode fails
3. Apply same pattern to all POST/PATCH handlers

---

## High-Severity Issues

### 5. Placeholder AI Profile Fallback Leaks to User

**Severity**: HIGH
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/ai_profile.go` (lines 76–94)
**Issue**: When AI service is down, a hardcoded error message is saved to DB as the AI profile.

```go
// Line 83 in ai_profile.go
placeholder := "AI profile generation requires the AI service. Please ensure it is running."
// ... saves this to DB as if it's a real profile
```

**Impact**:
- User regenerates AI profile, AI service is down
- Error message saved permanently to `ai_profiles.summary`
- Next time user views profile, they see error text instead of real summary
- No way to distinguish real profiles from error fallbacks

**Mitigation Required**:
1. Return 503 (Service Unavailable) instead of saving placeholder
2. Let frontend retry when AI service recovers
3. If saving placeholder, mark with a `is_placeholder` flag
4. Add migration to clean up existing error placeholders

---

### 6. Unused Embeddings Table — Incomplete Feature

**Severity**: HIGH
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/backend/migrations/001_init.sql` (lines 124–133)
**Issue**: `embeddings` table and pgvector index created but never used. No embedding generation or search.

**Schema exists**:
```sql
CREATE TABLE embeddings (
    embedding    vector(1536),
    ...
);
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat ...;
```

**But no**:
- Embedding generation on contact/activity creation
- Semantic search endpoint
- Code to call OpenAI embeddings API

**Impact**:
- Unused infrastructure taking up resources and disk space
- Source of confusion: table exists but is abandoned
- Technical debt for future migrations
- If ever needed, entire feature must be built from scratch

**Mitigation Required**:
1. **Decision**: Will semantic search be used?
   - **YES**: Implement embedding generation (add to contact/activity create/update)
   - **NO**: Drop the table and migration, remove from schema
2. Document decision in CLAUDE.md

---

### 7. No Validation of Buyer Profile Fields

**Severity**: HIGH
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` (lines 816–840)
**Issue**: Buyer profile create/update accept any values, no type/range validation.

```python
# Line 830-838 — no validation
cur.execute(
    """INSERT INTO buyer_profiles (contact_id, budget_min, budget_max, ...)
       VALUES (%s, %s, %s, ...)""",
    (contact_id, inp.get("budget_min"), inp.get("budget_max"), ...)
)
```

**Impact**:
- User (or AI) submits `budget_max < budget_min` → accepted
- User submits negative budget or text → accepted (psycopg2 may cast unpredictably)
- User submits unrealistic values (e.g., budget = 9999999999) → accepted
- Data quality degrades over time

**Mitigation Required**:
1. Add Pydantic model for buyer profile fields
2. Validate: `budget_min < budget_max`, positive, <= reasonable max
3. Validate: `bedrooms, bathrooms` are positive integers
4. Validate: `timeline` is in allowed set
5. Same for all write tools

---

### 8. No Cascade Confirmation on Delete Contact

**Severity**: HIGH
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` (lines 771–798)
**Issue**: `delete_contact` is a write tool, so user gets confirmation. But confirmation shows only `contact_id`, not what will be deleted.

```python
# Line 634 in tools.py
return {
    "confirmation_required": True,
    "tool": tool_name,
    "preview": tool_input,  # Only shows {"contact_id": "..."}
    "pending_id": pending_id,
}
```

**Impact**:
- User sees: "Delete contact abc123-def456..." — no context
- User clicks Confirm without knowing:
  - Contact name
  - Number of deals that will cascade-delete
  - Number of activities/conversations that will be lost
- Data loss without warning

**Mitigation Required**:
1. Fetch contact details in `queue_write_tool`
2. Include contact name, deal count, activity count in `preview`
3. Make preview user-readable: `"Delete John Doe (5 deals, 12 activities)"`
4. Frontend renders rich confirmation card

---

### 9. No Error Handling for Failed Database Commits

**Severity**: HIGH
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/database.py` (lines 33–35)
**Issue**: Commit failures are silently swallowed.

```python
# Lines 33-36
except Exception:
    conn.rollback()
    raise  # Good
# But: exceptions during commit are lost
```

**Impact**:
- If `conn.commit()` fails (e.g., constraint violation), exception propagates
- But in context manager, the `except` block in `run_query` doesn't distinguish commit errors
- Caller may think action succeeded when it didn't

**Mitigation Required**:
1. Catch exceptions during `commit()` explicitly
2. Log with context (agent_id, operation)
3. Return error response to frontend, not 500

---

## Medium-Severity Issues

### 10. Type-Unsafe JSON Conversions in Go

**Severity**: MEDIUM
**Files**:
- `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/dashboard.go` (multiple)
- All handlers using `interface{}`

**Issue**: Dashboard layout and other JSONB fields cast to `interface{}` without validation.

```go
// dashboard.go — reading layout as raw interface{}
var layout interface{}
_ = json.Unmarshal(layoutBytes, &layout)
// No guarantee it's the expected structure
```

**Impact**:
- Frontend sends corrupted layout object
- Backend stores it without validation
- Next request, frontend receives unexpected shape
- Potential for panic if code assumes specific structure

**Mitigation Required**:
1. Define struct for dashboard layout
2. Unmarshal into struct, catch errors
3. Validate structure before storing

---

### 11. No Pagination Limits on AI Service Queries

**Severity**: MEDIUM
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` (lines 414–449)
**Issue**: `search_contacts` and other read tools accept `limit` from AI without bounds.

```python
# Line 417 in tools.py
limit = inp.get("limit", 10)  # AI can request any number
# No check: if limit > 10000: limit = 10000
```

**Impact**:
- AI agent requests "get all contacts" with limit=999999
- Query becomes slow, memory spike
- Database connection pool exhausted
- Denial of service (accidental or malicious)

**Mitigation Required**:
1. Set max limit (e.g., 100)
2. Clamp: `limit = min(inp.get("limit", 10), 100)`
3. Document in tool schema

---

### 12. No Request ID Correlation for SSE Streams

**Severity**: MEDIUM
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/messages.go` (lines 65–170)
**Issue**: SSE streaming to frontend has no request/trace ID.

**Impact**:
- User reports "chat got stuck"
- Frontend logs don't have request ID to correlate
- Backend logs don't have same ID
- Debugging becomes manual, slow

**Mitigation Required**:
1. Add `X-Request-ID` header to SSE response
2. Frontend reads header, logs it
3. AI service receives request ID in proxy call, logs it
4. All three services log same request ID

---

### 13. Missing Timestamps on Most Read-Only Tools

**Severity**: MEDIUM
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` (entire file)
**Issue**: Tool results return raw data; no indication when data was last updated.

```python
# Line 405 in tools.py
return {
    "total_contacts": int(total_contacts),
    "active_deals": int(row["active"]),
    # No timestamp — when was this calculated?
}
```

**Impact**:
- AI agent reports "You have 5 active deals" without knowing if data is 5 minutes or 5 days old
- Frontend displays stale analytics without indication
- User makes decisions on outdated data

**Mitigation Required**:
1. Add `timestamp` to all read tool responses
2. Frontend displays "as of 2 minutes ago"
3. Alert user if data > 1 hour old

---

### 14. No Rate Limiting on Frontend API Client

**Severity**: MEDIUM
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/frontend/src/lib/api/client.ts`
**Issue**: Frontend can make unlimited concurrent requests; no backoff.

```typescript
// client.ts — naked fetch, no rate limit
const res = await fetch(`${BASE}/api${path}`, {...});
```

**Impact**:
- User opens dashboard, 10 pages auto-fetch → 30+ concurrent requests
- User clicks rapidly in contact list → unlimited queries
- Backend connection pool exhausted
- Other users' requests timeout

**Mitigation Required**:
1. Implement request queue (limit to 4 concurrent)
2. Add exponential backoff on 429/503
3. Use TanStack Query's built-in concurrency limits

---

### 15. Activities Table Missing Uniqueness Constraints

**Severity**: MEDIUM
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/backend/migrations/001_init.sql` (lines 87–96)
**Issue**: No constraint prevents duplicate activities for same contact+type+body.

```sql
-- Line 88 in migrations/001_init.sql — no uniqueness
CREATE TABLE activities (
    id UUID PRIMARY KEY,
    contact_id UUID,
    type TEXT,
    body TEXT,
    created_at TIMESTAMPTZ,
    -- No UNIQUE(contact_id, type, body, DATE(created_at))
);
```

**Impact**:
- AI agent logs "Called John Doe" three times (three separate records)
- User manually logs same activity twice → duplicate
- Analytics count activities as 6 instead of 3
- Data quality issues

**Mitigation Required**:
1. Add soft-duplicate detection (check before insert)
2. Or: add UNIQUE constraint with caveats (allow duplicates if > 1 hour apart)
3. Document in tool descriptions: "Duplicate activities are allowed"

---

### 16. Frontend Error Boundaries Missing in Key Pages

**Severity**: MEDIUM
**Files**: Frontend app pages (all dashboard routes)
**Issue**: No error boundary; any component error crashes entire page.

**Impact**:
- Contact detail page: one broken component → whole page blank
- User refreshes, same error
- Error swallowed, hard to debug

**Mitigation Required**:
1. Add React Error Boundary component
2. Wrap dashboard layout and key pages
3. Display user-friendly error message with error ID
4. Log to error tracking service

---

## Low-Severity Issues / Technical Debt

### 17. Inconsistent Error Messages

**Severity**: LOW
**Files**: Multiple handlers
**Issue**: Error messages are vague ("database error", "query error", "scan error").

```go
// handlers/messages.go — unhelpful errors
if err != nil {
    respondError(w, http.StatusInternalServerError, "query error")
}
```

**Impact**:
- Developer debugging: not clear what failed
- User sees generic message
- Error logs lack context

**Mitigation Required**:
1. Add context to error messages: "failed to fetch contact (contact_id={id})"
2. Log full error internally, user sees short message
3. Assign error IDs: "Error 37a2b9" → user can reference
4. Add structured logging (JSON with contact_id, agent_id, operation)

---

### 18. Dashboard Summary Query Inefficient

**Severity**: LOW
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` (lines 374–411)
**Issue**: Multiple separate queries; could be single query with aggregation.

```python
# Lines 374-411 — 4 separate queries for dashboard
cur.execute("SELECT COUNT(*) FROM contacts WHERE agent_id = %s")
cur.execute("SELECT COUNT(*) FROM deals...")
cur.execute("SELECT COUNT(*) FROM activities...")
cur.execute("SELECT COUNT(*) FROM deals...")
```

**Impact**:
- Slower than necessary (4 round-trips)
- Higher load on connection pool
- Poor perceived performance on slow networks

**Mitigation Required**:
1. Combine into single query with multiple aggregates
2. Cache result for 5 minutes
3. Benchmark improvement

---

### 19. Missing EXPLAIN for Slow Queries

**Severity**: LOW
**Issue**: No query performance analysis; unclear which queries are slow.

**Impact**:
- As data grows, queries may suddenly slow
- No metrics to catch regression
- Optimization becomes reactive, not proactive

**Mitigation Required**:
1. Add slow query log (PostgreSQL `log_min_duration_statement`)
2. Monitor query plans in dev
3. Add index on frequently-filtered columns (e.g., `contact.source`)

---

### 20. Incomplete Migration Versioning

**Severity**: LOW
**File**: Migrations folder
**Issue**: 5 migrations but no rollback scripts.

**Impact**:
- Development: easy to break migrations
- Staging: no way to revert in case of disaster
- Production: risky deployments

**Mitigation Required**:
1. Add `DOWN` scripts for each migration (or use Flyway/Goose)
2. Test down/up cycle before deployment
3. Document rollback procedure

---

## Security Concerns

### 21. Clerk JWT Not Validated on Renewal

**Severity**: MEDIUM
**File**: `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/middleware/auth.go`
**Issue**: JWT verified once per request, but Clerk tokens have expiry. No session refresh logic.

**Impact**:
- User's token expires mid-session
- Frontend doesn't refresh automatically
- Request fails with 401 (Unauthorized)
- User must log in again or refresh page

**Mitigation Required**:
1. Frontend: intercept 401, call `getToken()` again (Clerk SDK does this)
2. Backend: add `WWW-Authenticate: Bearer error="invalid_token"` on 401
3. Document session lifetime expectations

---

### 22. No CSRF Protection on Mutating Endpoints

**Severity**: MEDIUM
**Issue**: POST/PATCH/DELETE endpoints have no CSRF token or SameSite cookie.

**Impact**:
- Attacker: craft malicious HTML, trick user into visiting
- Form submits to `/api/contacts` from attacker's domain
- User's browser includes auth cookie
- Contact deleted without user knowledge

**Mitigation Required**:
1. Frontend: add CSRF token to POST/PATCH/DELETE requests (form hidden field)
2. Backend: validate CSRF token (separate from auth)
3. Set `SameSite=Strict` on auth cookie (Clerk SDK handles this)
4. Validate `Origin` header on mutating requests

---

### 23. No Rate Limiting on Backend

**Severity**: MEDIUM
**Issue**: Backend has no rate limiting; attacker can brute-force or spam.

**Impact**:
- Attacker: spam `/api/contacts` POST 1000 times
- Database fills with junk data
- Legitimate requests timeout

**Mitigation Required**:
1. Add rate limiting middleware (e.g., `github.com/noelyoo/rate-limit-chi`)
2. Limit by agent ID: 100 requests/minute per agent
3. Return 429 (Too Many Requests) with `Retry-After` header

---

## Missing Features / Incomplete Implementation

### 24. No Semantic Search Implementation

**Severity**: MEDIUM
**Status**: STUB
**Files**:
- Table exists: `/Users/matthewfaust/CloAgent/Clo-Agent/backend/migrations/001_init.sql` (lines 124–133)
- No endpoint, no embedding generation

**What's Missing**:
1. Embedding generation on contact/activity create (call OpenAI API)
2. Backend endpoint: `GET /api/search?q=<query>` (vector similarity)
3. Frontend integration in contact search/filter

**Mitigation Required**:
1. Decide: **Is semantic search needed for MVP?**
   - If **NO**: Drop embeddings table (migration), delete schema
   - If **YES**: Implement full feature (ETA: 2-3 days)

---

### 25. Communication Page Not Implemented

**Severity**: MEDIUM
**Status**: MISSING
**Note**: CLAUDE.md lists as "missing" — no route, no backend support

**What's Needed**:
1. Frontend route: `/dashboard/communication`
2. UI: unified inbox for calls, emails, SMS
3. Backend endpoints: call logs, email threads, SMS history (placeholder for now)
4. Integration with Twilio / Gmail / Outlook (future)

**Mitigation Required**: Decision on scope for MVP.

---

### 26. +New Quick Action Button Missing

**Severity**: LOW
**Status**: MISSING
**Note**: CLAUDE.md lists as "missing" from top bar

**What's Needed**:
1. Button in top bar (next to notifications)
2. Dropdown: "New Contact", "New Deal", "New Task", "New Activity"
3. Keyboard shortcut (Cmd+K or /new)

**Mitigation Required**: Low priority; UX improvement only.

---

## Architecture / Design Concerns

### 27. Database Credentials Potentially Exposed in Logs

**Severity**: MEDIUM
**Issue**: DATABASE_URL (with password) may appear in error messages or logs.

**Impact**:
- If error logged: password visible in log file
- Attacker gains DB credentials

**Mitigation Required**:
1. Never log full DATABASE_URL
2. Create sanitize function: `redact_url(url)`
3. Log only: "postgres://[REDACTED]@host:5432/db"
4. Use error wrapping to avoid revealing raw connection strings

---

### 28. No Caching Layer for Read-Heavy Queries

**Severity**: LOW
**Issue**: Dashboard summary, deal stages, analytics queried from DB every time.

**Impact**:
- Unnecessary DB load
- Slower response times as data grows
- No offline resilience

**Mitigation Required**:
1. Implement Redis caching (configured but unused)
2. Cache deal stages for 1 hour
3. Cache dashboard summary for 5 minutes
4. Invalidate on data change

---

## Testing & Observability Gaps

### 29. No Integration Tests for AI Tools

**Severity**: MEDIUM
**Issue**: 23 tools exist but no test coverage.

**Impact**:
- Tool refactor may break silently
- Edge cases (missing contact, invalid stage) untested
- Regressions discovered by users

**Mitigation Required**:
1. Add pytest tests for 5 critical tools (create_contact, update_deal, delete_contact, search_contacts, get_buyer_profile)
2. Test happy path, edge cases, error scenarios
3. Run in CI/CD

---

### 30. No Monitoring / Alerting

**Severity**: MEDIUM
**Issue**: No metrics, logs, or alerts for production.

**Impact**:
- Silent failures: service down but no one notices
- Performance degradation: slow queries, no visibility
- Audit trail missing: who did what and when

**Mitigation Required**:
1. Add structured logging (slog in Go, Python logging)
2. Send logs to centralized service (e.g., Datadog, LogRocket)
3. Set up alerts: 5xx errors, 95th percentile latency > 1s, database down
4. Dashboard: request counts, error rates, response times

---

## Summary Table

| ID | Issue | Severity | Category | Effort | Blocker |
|----|-------|----------|----------|--------|---------|
| 1 | In-memory pending actions | CRITICAL | Data Loss | HIGH | YES |
| 2 | Hardcoded AI secret | CRITICAL | Security | MEDIUM | YES |
| 3 | Silent I/O errors | CRITICAL | Stability | MEDIUM | YES |
| 4 | Missing JSON validation | CRITICAL | Validation | LOW | YES |
| 5 | Placeholder profile fallback | HIGH | Data Quality | LOW | NO |
| 6 | Unused embeddings table | HIGH | Debt | MEDIUM | NO |
| 7 | Missing buyer profile validation | HIGH | Data Quality | MEDIUM | NO |
| 8 | No cascade delete warning | HIGH | UX | MEDIUM | NO |
| 9 | Silent commit failures | HIGH | Stability | MEDIUM | NO |
| 10 | Type-unsafe JSON | MEDIUM | Stability | LOW | NO |
| 11 | No query limits | MEDIUM | Stability | LOW | NO |
| 12 | No request ID correlation | MEDIUM | Observability | MEDIUM | NO |
| 13 | Missing data timestamps | MEDIUM | UX | LOW | NO |
| 14 | No frontend rate limiting | MEDIUM | Stability | MEDIUM | NO |
| 15 | No duplicate activity constraint | MEDIUM | Data Quality | LOW | NO |
| 16 | Missing error boundaries | MEDIUM | Stability | LOW | NO |
| 17 | Vague error messages | LOW | Debugging | LOW | NO |
| 18 | Inefficient dashboard query | LOW | Performance | LOW | NO |
| 19 | No slow query logs | LOW | Observability | MEDIUM | NO |
| 20 | Missing rollback scripts | LOW | DevOps | MEDIUM | NO |
| 21 | JWT renewal issue | MEDIUM | Session | MEDIUM | NO |
| 22 | No CSRF protection | MEDIUM | Security | MEDIUM | NO |
| 23 | No rate limiting | MEDIUM | Security | MEDIUM | NO |
| 24 | Semantic search incomplete | MEDIUM | Feature | HIGH | NO |
| 25 | Communication page missing | MEDIUM | Feature | HIGH | NO |
| 26 | +New action button missing | LOW | Feature | LOW | NO |
| 27 | DB credentials in logs | MEDIUM | Security | LOW | NO |
| 28 | No caching layer | LOW | Performance | MEDIUM | NO |
| 29 | No integration tests | MEDIUM | Testing | MEDIUM | NO |
| 30 | No monitoring/alerting | MEDIUM | Observability | MEDIUM | NO |

---

## Recommended Action Plan

### Phase 1: Critical (Ship-Blocking)
**Duration**: 2-3 days

1. ✓ Persist pending actions to DB (issue #1)
2. ✓ Fix hardcoded AI secret (issue #2)
3. ✓ Handle I/O errors in streaming (issue #3)
4. ✓ Add JSON decode validation (issue #4)

### Phase 2: High (Reduce Risk)
**Duration**: 1-2 days

5. ✓ Fix AI profile placeholder fallback (issue #5)
6. ✓ Decide on embeddings table (issue #6)
7. ✓ Add buyer profile validation (issue #7)
8. ✓ Improve delete confirmation UX (issue #8)

### Phase 3: Medium (Stability)
**Duration**: 3-5 days

9. ✓ Add error handling for commits (issue #9)
10. ✓ Type-safe JSON conversions (issue #10)
11. ✓ Query limits on tools (issue #11)
12. ✓ Request ID correlation (issue #12)
13. ✓ Data timestamps in responses (issue #13)
14. ✓ Frontend request rate limiting (issue #14)
15. ✓ Add duplicate activity safeguards (issue #15)
16. ✓ Error boundaries in React (issue #16)
17. ✓ Improve error messages (issue #17)

### Phase 4: Security
**Duration**: 2-3 days

21. ✓ JWT refresh handling (issue #21)
22. ✓ CSRF protection (issue #22)
23. ✓ Backend rate limiting (issue #23)
27. ✓ Sanitize DB credentials in logs (issue #27)

### Phase 5: Future (Post-MVP)
29. ✓ Integration tests
30. ✓ Monitoring & alerting
24. ✓ Semantic search
25. ✓ Communication page
28. ✓ Redis caching

---

## Files to Review First

1. `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/tools.py` (line 19, 624–677)
2. `/Users/matthewfaust/CloAgent/Clo-Agent/ai-service/app/config.py` (line 10)
3. `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/messages.go` (lines 65–170)
4. `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/conversations.go` (line 72)
5. `/Users/matthewfaust/CloAgent/Clo-Agent/backend/internal/handlers/ai_profile.go` (lines 54–102)

---

## References

- CLAUDE.md — Project overview and architecture
- Docker Compose config — Service definitions
- Database migrations — Schema history
