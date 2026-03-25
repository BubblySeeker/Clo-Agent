# AI Intelligence Upgrade — Operation Routing + Tiered Confirmations

## Context

CloAgent's AI assistant (Claude Haiku 4.5) makes fundamental mistakes that destroy user trust. The most visible: when a user creates a contact "Rohan Batra" and then says "add his email, phone, and mark him as cold call," the AI creates a SECOND duplicate contact instead of updating the existing one. Beyond wrong tool choice, the AI feels robotic — every write action requires a confirmation click, even trivial ones like updating an email address.

**CEO Plan:** `~/.gstack/projects/BubblySeeker-Clo-Agent/ceo-plans/2026-03-24-ai-intelligence-upgrade.md`
**Branch:** `MatthewFaust/ai-intel-ceo-review` | **Base:** `main` | **Mode:** SCOPE EXPANSION

---

## CEO Review — Complete

### Step 0 Decisions

**Approach:** B) Full Intelligent Upgrade (all 3 core components + 7 accepted expansions)
**Review Mode:** SCOPE EXPANSION (cathedral mode)

**Premise Challenge:** Right problem (trust-killer), most direct path, doing nothing blocks adoption.

### Expansion Decisions

| # | Proposal | Effort | Decision | Reasoning |
|---|----------|--------|----------|-----------|
| 1 | Narrated Actions | S | DROPPED | Complexity for low value; requires streaming intermediate text blocks |
| 2 | Auto-Execute Visual Card | S | ACCEPTED | Users see what changed, green/red cards |
| 3 | Conversational Undo → Server-Side Undo Stack | S→M | ACCEPTED (MODIFIED) | Outside voice caught AI-mediated fragility; switched to deterministic |
| 4 | Proactive Suggestions | S | ACCEPTED | ~5 line prompt addition |
| 5 | Confidence-Based Quick Confirm | M | DEFERRED | Wait for two-tier to prove itself |
| 6 | Operation Routing Decision Tree | S | ACCEPTED | A/B test vs prose rules |
| 7 | useAIStream Hook | S | ACCEPTED | Dedup SSE handling across two chat UIs |
| 8 | _dispatch_write_tool | S | ACCEPTED | Shared write executor, addresses TODOS.md P3 |
| 9 | Automated Prompt Regression Tests | S | ACCEPTED | Silent killer prevention |
| 10 | Structured Logging for Auto-Executes | S | ACCEPTED | Observability safety net |

---

## Accepted Scope (final)

### Component 1: Operation Routing Decision Tree (System Prompt)
Add `<operation_routing>` block to system prompt in `agent.py` as a structured flowchart:
```
USER MENTIONS CONTACT → Does contact exist?
  → YES → Use update_contact / log_activity / etc.
  → NO  → Is user explicitly creating someone new?
    → YES → create_contact
    → NO  → Tell user "no contact found"
```
**A/B test:** Implement both decision tree and prose rule formats. Run against 6 success criteria. Commit whichever scores better.

### Component 2: Tiered Confirmation System
Add `AUTO_EXECUTE_TOOLS` set in `tools.py`:

**Auto-execute (no confirmation):**
- `update_contact` — field changes only
- `log_activity` — additive
- `complete_task` — sets completed_at
- `reschedule_task` — changes due_date
- `update_buyer_profile` — field changes
- `update_deal` — stage/field changes
- `update_property` — field changes

**Confirm (keep current flow):**
- `create_contact`, `delete_contact`, `create_deal`, `delete_deal`
- `create_buyer_profile`, `send_email`, `create_task`
- `create_property`, `delete_property`

**Agent loop changes (`agent.py`):**
- Third branch: `WRITE_TOOLS ∩ AUTO_EXECUTE_TOOLS` → execute via `_dispatch_write_tool()` → yield SSE `auto_executed` → feed result back to Claude → continue loop
- Mixed round handling: if same response has auto-execute AND confirm tools, auto-execute runs first, then confirm queues and loop breaks
- Structured logging: `logger.info("Auto-executing %s for agent %s", tool_name, agent_id)`

### Component 3: Enhanced Tool Descriptions
Update TOOL_DEFINITIONS in `tools.py`:
- `create_contact`: "IMPORTANT: Only use this to create a brand-new contact..."
- `update_contact`: "Use this to add or change any field on an EXISTING contact..."
- `log_activity`: "Use this to record something that happened..."

### Server-Side Undo Stack
- New endpoint: `POST /ai/undo` (or handled via existing AI confirm path)
- Per-conversation undo stack (in-memory or Redis)
- Auto-execute records `{tool_name, previous_values, new_values, contact_id}` on the stack
- User clicks undo in UI → single HTTP call → reverse applied deterministically
- No AI involvement, no hallucination risk, works across context length
- `_update_*` functions still SELECT previous values before UPDATE (needed for undo stack)

### Auto-Execute Visual Card
- Frontend renders `auto_executed` SSE events as compact cards
- Green-tinted for success, red-tinted for errors
- Combined card when multiple auto-executes in same round
- Text labels for accessibility (not color-only)
- Shows tool label + what changed

### Proactive Suggestions
- Prompt addition: AI checks for missing critical fields (phone, email, source) after updates
- Offers to help: "Rohan doesn't have a phone number — want me to add it?"
- Pure system prompt change, no new tools

### Shared Infrastructure
- **`_dispatch_write_tool(tool_name, inp, agent_id)`** — single entry point for write tool execution, called from both auto-execute path and confirm path
- **`useAIStream` hook** — extract SSE event handling from `AIChatBubble.tsx` and `chat/page.tsx` into shared hook

---

## Files to Modify

| File | Changes |
|------|---------|
| `ai-service/app/services/agent.py` | Operation routing decision tree in system prompt; third branch in agent loop for auto-execute; proactive suggestions prompt; structured logging |
| `ai-service/app/tools.py` | `AUTO_EXECUTE_TOOLS` set; enhanced tool descriptions; `_dispatch_write_tool` shared function; `_update_*` functions return previous values |
| `backend/cmd/api/main.go` | Verify SSE proxy passes `auto_executed` events (may need new undo endpoint) |
| `backend/internal/handlers/ai.go` | Undo endpoint handler if needed |
| `frontend/src/hooks/useAIStream.ts` | **NEW** — shared SSE event handling hook |
| `frontend/src/components/shared/AIChatBubble.tsx` | Use `useAIStream` hook; add auto-execute card component |
| `frontend/src/app/dashboard/chat/page.tsx` | Use `useAIStream` hook; add auto-execute card component |

---

## Success Criteria

1. "Create Rohan Batra, then add his email and phone" → ONE contact with all fields (not two)
2. "Log a call with my last contact" → correctly finds most recent contact and logs activity
3. Low-risk updates execute without confirmation click and show inline visual card
4. No regression: deal creation, task management, email sending, delete operations still show confirmation cards
5. Undo button after auto-execute reverses the change deterministically
6. AI suggests missing fields after updates ("Rohan doesn't have a phone — want me to add it?")

## Regression Test List
- Create a new contact → confirmation card shown → deal auto-created in Lead stage
- Delete a contact → confirmation card shown → cascading delete works
- Send email → confirmation card shown → email sent via Gmail proxy
- Create deal → confirmation card shown → appears in pipeline
- Morning briefing → chains 4 read tools correctly
- Contact-scoped chat → uses preloaded contact context

## Automated Prompt Regression Tests
Test script sends the 6 success criteria scenarios to the AI API and verifies:
- Correct tool calls (update vs create)
- Correct tool arguments
- No duplicate contacts created
- Auto-execute vs confirm routing correct

---

## NOT in scope
- Confidence-based quick confirm (third tier) — deferred to TODOS.md P2
- AI-generated tool descriptions from usage patterns — 12-month vision
- Dynamic risk assessment based on context — 12-month vision
- Chat UI component extraction beyond useAIStream hook — skip
- Metrics infrastructure in AI service — no metrics system exists

## What already exists
- Contact resolution protocol (rules 1-8 in system prompt) — solves FINDING contacts
- `WRITE_TOOLS` / `READ_TOOLS` sets — already classifies tools
- `queue_write_tool()` / `execute_write_tool()` — confirmation infrastructure
- SSE infrastructure — handles text, tool_call, tool_result, confirmation events
- Go backend SSE proxy — forwards events from AI service to frontend
- Resolved action cards in frontend — green/red cards for confirmed/failed actions

## Dream state delta
```
CURRENT STATE                    AFTER THIS PLAN                12-MONTH IDEAL
─────────────────────────────────────────────────────────────────────────────
AI picks wrong tool              Decision tree steers            AI reasons about intent
  (create vs update)               Haiku correctly                 with stronger model

Every write needs click          7 tools auto-execute,           Context-aware risk:
                                   9 still confirm                 auto-execute based on
                                                                    confidence + history

No undo capability               Deterministic undo stack        Undo with version history
                                   per conversation                and audit trail

No proactive behavior            Suggests missing fields         AI coaches agents on
                                   after updates                   best practices

Duplicated SSE handling          Shared useAIStream hook         Full chat component library
  in two UIs                                                       with storybook
```

---

## Error & Rescue Registry

| Method | Failure | Exception | Rescued? | Action | User Sees |
|--------|---------|-----------|----------|--------|-----------|
| Auto-execute branch | Tool not in dispatch | KeyError | Fix: _dispatch_write_tool handles all | N/A | N/A |
| _update_contact (SELECT) | Contact not found | Empty result | Y | Returns {} previous | AI says "not found" |
| _update_contact (UPDATE) | 0 rows matched | — | Y | Returns updated:false | Red error card |
| SSE auto_executed | Malformed JSON | JSON.parse | GAP → add try/catch in useAIStream | Console error |
| Undo stack | Nothing to undo | Empty stack | Y | Returns error | "Nothing to undo" message |
| Undo stack | Stale undo | — | Accepted risk | Overwrites | Silent (documented) |

## Failure Modes Registry

| Codepath | Failure Mode | Rescued? | Test? | User Sees? | Logged? |
|----------|-------------|----------|-------|------------|---------|
| Auto-execute routing | Wrong tool classification | Y (static set) | Y (regression) | Unexpected confirm/auto | N/A |
| Auto-execute DB error | Connection pool exhausted | Y (run_query) | N | 500 in stream | Y |
| Mixed round (auto+confirm) | Auto executes, confirm queues | Y (explicit) | Y | Auto card + confirm card | Y |
| Frontend JSON parse | Malformed SSE | GAP | N | UI stale | Console |
| Undo after other update | Stale previous values | Accepted | N | Silent overwrite | N |
| Decision tree prompt | Haiku ignores tree | Y (A/B test) | Y | Wrong tool choice | N |

**CRITICAL GAPS:** 1 (Frontend JSON parse in useAIStream — add try/catch)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | COMPLETE | 10 proposals, 8 accepted, 1 deferred, 1 dropped |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 14 findings, 3 acted on (Go proxy, undo mechanism, A/B test) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**UNRESOLVED:** 0
**VERDICT:** CEO CLEARED — eng review required before implementation.
