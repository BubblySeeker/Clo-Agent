# TODOS

## Infrastructure

### Structured error codes in Go backend

**What:** Replace generic "query error" / "database error" messages in all Go handlers with structured error codes (e.g., `ERR_NOT_FOUND`, `ERR_DB_TIMEOUT`, `ERR_VALIDATION`).

**Why:** Frontend can't distinguish between a missing record, a database timeout, and invalid input — all return the same generic message. This makes debugging production issues nearly impossible and prevents the frontend from showing appropriate error messages or retry logic.

**Context:** Every handler in `backend/internal/handlers/` uses `respondError(w, status, "generic message")`. The `respondError` helper already exists — it just needs a consistent error code field added to the JSON response alongside the message. ~12 handler files to update. Pattern: `{"error": "message", "code": "ERR_NOT_FOUND"}`.

**Effort:** M
**Priority:** P2
**Depends on:** None

### React error boundaries for dashboard

**What:** Add an ErrorBoundary component that wraps dashboard pages and shows a fallback UI ("Something went wrong. Reload?") instead of a white screen when a component throws.

**Why:** If any dashboard component throws a JavaScript error (bad API data, undefined property access), the entire page goes blank with no recovery. User must manually refresh.

**Context:** No error boundary exists anywhere in `frontend/src/app/dashboard/`. Create a single `ErrorBoundary` class component in `components/shared/`, wrap it around the dashboard layout in `layout.tsx`. TanStack Query error states are also unchecked in most pages — the `error` return from `useQuery` is ignored.

**Effort:** S
**Priority:** P2
**Depends on:** None

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

### Smart follow-up suggestions on contacts

**What:** Show an AI-generated suggestion at the top of each contact's activity timeline: "It's been 12 days since your last interaction. Suggested action: Follow-up call about the condo tour."

**Why:** Agents shouldn't have to calculate when they last talked to someone. The system should proactively surface the next best action.

**Context:** Frontend-only computation from existing data: compare `last_activity_at` to now, read buyer profile for context, generate a suggestion string. No new backend needed for the basic version. For the AI-powered version, could use the existing chat tool `get_contact_activities` to inform a Claude call. Start with the simple computed version.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Keyboard shortcuts across dashboard

**What:** Global keyboard shortcuts: N = new contact, P = pipeline, / = focus search, Esc = close modal, G+D = go to dashboard.

**Why:** Power users navigate faster with keyboards. Reduces friction for high-volume agents managing 100+ contacts.

**Context:** Add a global `keydown` listener in the dashboard layout. Use a simple map of key → action. Avoid conflicts with browser shortcuts and text input fields (disable shortcuts when focused on input/textarea). Show a "?" shortcut to display available shortcuts.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Deal health scores / close probability

**What:** Show an AI-estimated close probability on each deal card in the pipeline — a "health score" based on buyer profile completeness, activity frequency, and time in current stage.

**Why:** Agents can visually prioritize which deals need attention. A deal that's been in "Touring" for 30 days with no recent activity is at risk.

**Context:** Could be a simple heuristic (no AI needed): score = f(days_in_stage, days_since_activity, buyer_profile_completeness). Display as a colored badge (green/yellow/red) on pipeline deal cards. For the AI version, use Claude to analyze the full context and estimate probability. Start with the heuristic version — it's faster, cheaper, and more predictable.

**Effort:** M
**Priority:** P3
**Depends on:** None

## Completed

(none yet)
