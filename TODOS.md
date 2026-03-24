# TODOS

## Infrastructure

### Structured error codes in Go backend

**What:** Replace generic "query error" / "database error" messages in all Go handlers with structured error codes (e.g., `ERR_NOT_FOUND`, `ERR_DB_TIMEOUT`, `ERR_VALIDATION`).

**Why:** Frontend can't distinguish between a missing record, a database timeout, and invalid input — all return the same generic message. This makes debugging production issues nearly impossible and prevents the frontend from showing appropriate error messages or retry logic.

**Context:** Every handler in `backend/internal/handlers/` uses `respondError(w, status, "generic message")`. The `respondError` helper already exists — it just needs a consistent error code field added to the JSON response alongside the message. ~12 handler files to update. Pattern: `{"error": "message", "code": "ERR_NOT_FOUND"}`.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Refactor tool dispatchers to dict-based routing

**What:** Convert the `execute_read_tool` and `execute_write_tool` if/elif chains in `ai-service/app/tools.py` to dict-based dispatchers (e.g., `READ_DISPATCHERS = {"search_contacts": _search_contacts, ...}`).

**Why:** The chains are 15+ branches each and growing with every new tool. Adding a tool requires touching three places: TOOL_DEFINITIONS, WRITE_TOOLS set, and the if/elif chain. A dict dispatcher reduces this to two places and eliminates the risk of forgetting a branch.

**Context:** Currently at ~18 read + ~16 write branches after Gmail Phase 3. The pattern is `if tool_name == "X": result = await run_query(lambda: _X(...))`. A dict maps tool_name → (handler_fn, required_args). The `send_email` tool is special (calls `_proxy_to_backend` instead of `run_query`) — the dispatcher needs to handle both sync-DB and async-HTTP tools.

**Effort:** S
**Priority:** P3
**Depends on:** Gmail Phase 3 (adds the last 4 tools before refactor)

### API response validation with Zod

**What:** Add Zod schemas to validate API responses at the frontend boundary for new endpoints (search, settings), and gradually extend to existing endpoints.

**Why:** TypeScript types are compile-time only. If the backend sends `null` instead of `[]` or omits a field, the frontend crashes at runtime. Zod validation at the API boundary catches shape mismatches before they reach components.

**Context:** Zod is installed (`package.json`) but only used in forms. Start with `src/lib/api/search.ts` and `src/lib/api/settings.ts` (new files). Pattern: `const SearchResultSchema = z.array(z.object({...}))` then `SearchResultSchema.parse(data)` in the API function. Don't retrofit all existing API modules at once — do it incrementally.

**Effort:** M
**Priority:** P3
**Depends on:** None

## Vision

### Cmd+K command palette

**What:** Build a Spotlight-style command palette (Cmd+K to open) that combines semantic search with quick actions in one UI.

**Why:** Instead of separate search, navigation, and create flows, agents get one unified interface. Type "add contact" → opens create modal. Type "Sarah Miller" → shows contact. Type "clients who want pools" → semantic search results.

**Context:** Builds on the semantic search endpoint being added in Phase C. The search UI needs to exist anyway — this is the upgraded version. Use a modal overlay with text input, debounced search, categorized results (Actions, Contacts, Deals), and keyboard navigation (arrow keys to select, Enter to open). Reference: Linear, Raycast, VS Code command palette.

**Effort:** M
**Priority:** P3
**Depends on:** Semantic search MVP (Phase C)

### "Catch Me Up" button on contacts

**What:** One-click AI summary of everything that happened with a contact in the last 30 days — activities, deal movements, notes — as a 3-sentence briefing.

**Why:** Instead of scrolling through an activity timeline, agents get an instant briefing. Like asking a colleague "what's the latest with Sarah?"

**Context:** Reuses the existing AI profile generation pattern (`POST /api/contacts/{id}/ai-profile/regenerate`). Could be a variation of the AI profile with a different prompt focused on recency. Add a "Catch Me Up" button on the contact detail Overview tab that calls a new endpoint or reuses the profile endpoint with a `?mode=recent` parameter.

**Effort:** S
**Priority:** P3
**Depends on:** None (reuses existing AI profile pattern)

### Smart follow-up suggestions on contacts (Basic version done)

**What:** Show an AI-generated suggestion at the top of each contact's activity timeline: "It's been 12 days since your last interaction. Suggested action: Follow-up call about the condo tour."

**Done:** Basic version implemented — frontend-computed follow-up banner with priority chain: no activities → stale (>7 days) → last was showing. Dismissible with 24h localStorage TTL.

**Future:** AI-powered version using Claude to analyze full contact context and generate personalized coaching suggestions.

**Effort:** S (basic done), M (AI version)
**Priority:** P3
**Depends on:** None (AI version depends on Claude integration)

### Keyboard shortcuts across dashboard

**What:** Global keyboard shortcuts: N = new contact, P = pipeline, / = focus search, Esc = close modal, G+D = go to dashboard.

**Why:** Power users navigate faster with keyboards. Reduces friction for high-volume agents managing 100+ contacts.

**Context:** Add a global `keydown` listener in the dashboard layout. Use a simple map of key → action. Avoid conflicts with browser shortcuts and text input fields (disable shortcuts when focused on input/textarea). Show a "?" shortcut to display available shortcuts.

**Effort:** S
**Priority:** P3
**Depends on:** None


## Completed

### React error boundaries for dashboard

ErrorBoundary component in `components/shared/ErrorBoundary.tsx` wraps dashboard layout. TanStack Query `isError` states handled across 8+ dashboard pages with user-facing error UI.

### Deal health scores (heuristic version)

Green/yellow/red health dots on pipeline Kanban deal cards. Heuristic based on days-in-stage (`stage_entered_at` column) and days-since-last-activity. Accurate stage tracking via `stage_entered_at` that only resets on actual stage changes.
