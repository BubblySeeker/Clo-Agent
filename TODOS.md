# TODOS

## Infrastructure

### Batch score recompute for bulk operations

**What:** Add an async/batch path for recomputing lead scores when many contacts are modified at once (e.g., CSV import, bulk tag assignment).

**Why:** The current `computeLeadScore` runs inline within each handler's RLS transaction — 3 queries + 1 update per contact. This is fine for single-contact mutations but would fire N sequential recalculations during a bulk import of 500 contacts, blocking the request.

**Pros:** Prevents request timeouts during bulk operations. Enables future features like scheduled overnight score refresh.

**Cons:** Requires either a background worker or a "dirty flag + compute on read" pattern, both adding complexity.

**Context:** Lead scoring uses inline computation (decided in v1 for simplicity at pre-product scale). When bulk contact operations are built, add either: (a) a `score_stale BOOLEAN` flag on contacts, computed on next read, or (b) a background worker that processes a queue of contact IDs needing recompute. The `computeLeadScore` function is already isolated — the change is in how/when it's called, not in the scoring logic itself.

**Effort:** S (human team) → S (with CC+gstack)
**Priority:** P3
**Depends on:** Lead scoring system, bulk contact operations (neither exists yet)

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

### Confidence-based quick confirm (third confirmation tier)

**What:** Add a third confirmation tier between auto-execute and full confirmation — a streamlined one-tap inline confirm for medium-risk actions (e.g., `create_deal` for a contact the AI just found).

**Why:** The two-tier system (auto-execute vs full confirm) is a big improvement but leaves a UX gap: actions that are probably right but not safe enough to auto-execute still get the full confirmation card with preview + two buttons. A quick confirm ("Create deal for Rohan? [Yes]") reduces friction for these medium-risk actions.

**Context:** Requires a `QUICK_CONFIRM_TOOLS` set, a new SSE event type (`quick_confirm`), and a new compact UI component. The `useAIStream` hook extraction (shipping in the AI Intelligence Upgrade) makes adding a third event type straightforward. Defer until the two-tier system proves itself in production.

**Effort:** M (human) → S with CC+gstack
**Priority:** P2
**Depends on:** AI Intelligence Upgrade (tiered confirmation + useAIStream hook)

### Keyboard shortcuts across dashboard

**What:** Global keyboard shortcuts: N = new contact, P = pipeline, / = focus search, Esc = close modal, G+D = go to dashboard.

**Why:** Power users navigate faster with keyboards. Reduces friction for high-volume agents managing 100+ contacts.

**Context:** Add a global `keydown` listener in the dashboard layout. Use a simple map of key → action. Avoid conflicts with browser shortcuts and text input fields (disable shortcuts when focused on input/textarea). Show a "?" shortcut to display available shortcuts.

**Effort:** S
**Priority:** P3
**Depends on:** None


### Bulk action from lead score view

**What:** Add a "Select all Hot leads" / "Select all Cold leads" bulk action on the contacts page when sorted by score, enabling batch operations like "Send follow-up email to all warm leads" or "Archive all cold leads."

**Why:** Agents with 100+ contacts need to act on score tiers in bulk. Individually clicking through 15 warm leads to send follow-ups defeats the purpose of scoring them in the first place.

**Pros:** Transforms lead scoring from passive information into an active workflow tool. High leverage for agents with large contact books.

**Cons:** Requires backend batch endpoints (bulk update, bulk email) that don't exist yet. UI complexity for multi-select state management.

**Context:** The lead scoring system adds score tiers (Hot/Warm/Cool/Cold) to contacts. This TODO adds tier-based bulk selection on the contacts list page. Implementation: checkbox column + "Select all in tier" dropdown + bulk action bar (email, archive, assign tag). Needs new `POST /api/contacts/bulk-action` endpoint. Reference: Gmail's "Select all conversations that match this search" pattern.

**Effort:** M (human team) → S (with CC+gstack)
**Priority:** P2
**Depends on:** Lead scoring system (in progress)

## Completed

### React error boundaries for dashboard

ErrorBoundary component in `components/shared/ErrorBoundary.tsx` wraps dashboard layout. TanStack Query `isError` states handled across 8+ dashboard pages with user-facing error UI.

### Deal health scores (heuristic version)

Green/yellow/red health dots on pipeline Kanban deal cards. Heuristic based on days-in-stage (`stage_entered_at` column) and days-since-last-activity. Accurate stage tracking via `stage_entered_at` that only resets on actual stage changes.
