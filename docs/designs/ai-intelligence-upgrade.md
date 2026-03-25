# AI Intelligence Upgrade — Operation Routing + Tiered Confirmations

## Context

CloAgent's AI assistant (Claude Haiku 4.5) makes fundamental mistakes that destroy user trust. The most visible: when a user creates a contact "Rohan Batra" and then says "add his email, phone, and mark him as cold call," the AI creates a SECOND duplicate contact instead of updating the existing one. Beyond wrong tool choice, the AI feels robotic — every write action requires a confirmation click, even trivial ones like updating an email address.

**Design doc:** `~/.gstack/projects/BubblySeeker-Clo-Agent/Matthew-dev-design-20260324-191029.md`
**Branch:** `dev` | **Base:** `main` | **Mode:** SCOPE EXPANSION

---

## CEO Review Progress

### System Audit Findings

- Branch `dev` with ~30 commits ahead of `main`. No PR exists yet.
- 1 stash entry (WIP on AI chat fix)
- v1.0 milestone (AI Contact Intelligence) completed — phases 01 (contact resolution protocol) and 02 (pronoun resolution) shipped
- Most active files: `main.go` (20 touches), `layout.tsx` (12), `tools.py` (12), `agent.py` (11)
- System prompt is ~290 lines with 8 contact resolution rules already in place
- TODOS.md has relevant item: "Refactor tool dispatchers to dict-based routing" (P3) — this plan adds `AUTO_EXECUTE_TOOLS` which makes the if/elif chains longer

### Step 0 Decisions

**Approach Selected:** B) Full Intelligent Upgrade (all 3 components from design doc)
- Operation routing protocol in system prompt
- Tiered confirmation system with auto-execute for low-risk writes
- Enhanced tool descriptions with usage examples

**Review Mode:** SCOPE EXPANSION (cathedral mode)

**Implementation Alternatives Evaluated:**
- A) Prompt-Only Fix — smallest diff but doesn't fix confirmation friction (5/10)
- B) Full Intelligent Upgrade — fixes all 3 problems (9/10) **CHOSEN**
- C) Agent Reasoning Layer — over-engineered, doubles API cost (8/10)

### Premise Challenge (0A)

- **Right problem?** Yes. Duplicate-contact bug is a trust-killer caught during pre-demo testing.
- **Most direct path?** Yes. Three components each address a distinct failure mode.
- **Do nothing?** Every demo fails. Blocks user adoption.

### Existing Code Leverage (0B)

- Contact resolution protocol (rules 1-8 in `agent.py`) — already solves FINDING contacts
- `WRITE_TOOLS` set (`tools.py:548`) — already classifies tools
- `queue_write_tool()` (`tools.py:930`) — existing confirmation path stays unchanged
- `execute_write_tool()` (`tools.py:959`) — reusable for auto-execute path
- SSE infrastructure — already handles multiple event types

### Dream State Mapping (0C)

```
CURRENT STATE                    THIS PLAN                     12-MONTH IDEAL
─────────────────────────────────────────────────────────────────────────────
AI picks wrong tool              Operation routing rules        AI reasons about intent
  (create vs update)               steer Haiku correctly          with stronger model

Every write needs click          7 tools auto-execute,          Context-aware risk:
                                   9 still confirm                auto-execute based on
                                                                   confidence + history

Tool descriptions are            Enhanced descriptions          Tool descriptions are
  ambiguous                        with examples                   auto-generated from
                                                                   usage patterns
```

### Expansion Opt-In Ceremony (0D) — Decisions Made

| # | Proposal | Effort | Decision | Reasoning |
|---|----------|--------|----------|-----------|
| 1 | Narrated Actions — AI explains what it's doing as it works | S | ACCEPTED | Makes auto-execute feel intentional, not silent |
| 2 | Auto-Execute Visual Card — green-tinted receipt card for auto-executed actions | S | ACCEPTED | Polished UX, users see exactly what changed |
| 3 | Conversational Undo — track previous values so "undo that" works | S | ACCEPTED | Safety net that makes auto-execute feel safe |
| 4-6 | (Not yet presented — review interrupted) | — | PENDING | — |

### Remaining Expansion Candidates (not yet presented)

- **Proactive suggestions** — AI notices missing fields and offers to help ("Rohan doesn't have a phone number, want me to ask?")
- **Confidence-based routing** — medium-confidence actions get "quick confirm" (one-tap inline) instead of full confirmation card
- **Operation routing decision tree** — instead of prose rules, structure as a flowchart the AI follows mechanically

---

## Accepted Scope (baseline + expansions)

### Component 1: Operation Routing Protocol (System Prompt)
Add `<operation_routing>` block (~30 lines) to system prompt in `agent.py`:
- Rule 1: NEVER CREATE A DUPLICATE — if contact exists, use update_contact
- Rule 2: "Add [field] to [contact]" = UPDATE, not CREATE
- Rule 3: Only use create_contact for explicitly new people
- Rule 4: Worked example (WRONG vs RIGHT)
- Rule 5: When in doubt, SEARCH FIRST

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
- When tool is in `WRITE_TOOLS AND AUTO_EXECUTE_TOOLS`: execute immediately inline
- Send SSE event: `{"type": "auto_executed", "name": tool_name, "result": result}`
- Feed result back to Claude (unlike confirmation which breaks the loop)
- Do NOT insert into `pending_actions` table

### Component 3: Enhanced Tool Descriptions
Update TOOL_DEFINITIONS in `tools.py`:
- `create_contact`: "IMPORTANT: Only use this to create a brand-new contact..."
- `update_contact`: "Use this to add or change any field on an EXISTING contact..."
- `log_activity`: "Use this to record something that happened..."

### Expansion 1: Narrated Actions
- AI streams a brief explanation before each auto-execute
- "Found Rohan Batra. Updating email..." → [auto-execute] → "Done — added rohan@example.com"
- Implementation: stream text SSE events around the auto-execute in the agent loop

### Expansion 2: Auto-Execute Visual Card
- Frontend renders `auto_executed` SSE events as compact green-tinted cards
- Shows tool label + what changed (e.g., "Updated Rohan's email → rohan@example.com")
- No buttons — just a receipt/confirmation that something happened
- Both `AIChatBubble.tsx` and `chat/page.tsx` need the new handler

### Expansion 3: Conversational Undo
- Auto-execute returns previous field values in the tool result
- `_update_contact()` returns `{"previous": {"email": null}, "updated": {"email": "rohan@example.com"}}`
- AI sees previous values → user says "undo that" → AI calls update_contact with old values
- No new endpoints or tables needed

---

## Files to Modify

| File | Changes |
|------|---------|
| `ai-service/app/services/agent.py` | Add `<operation_routing>` block to system prompt; modify agent loop for auto-execute path with narration |
| `ai-service/app/tools.py` | Add `AUTO_EXECUTE_TOOLS` set; enhance tool descriptions; modify `_update_contact`, `_update_deal`, `_update_buyer_profile`, `_update_property` to return previous values |
| `frontend/src/components/shared/AIChatBubble.tsx` | Add `auto_executed` SSE handler; render auto-execute visual card |
| `frontend/src/app/dashboard/chat/page.tsx` | Add `auto_executed` SSE handler; render auto-execute visual card |

---

## Success Criteria

1. "Create Rohan Batra, then add his email and phone" → ONE contact with all fields (not two)
2. "Log a call with my last contact" → correctly finds most recent contact and logs activity
3. Low-risk updates execute without confirmation click and show inline visual card
4. No regression: deal creation, task management, email sending, delete operations still show confirmation cards
5. "Undo that" after an auto-executed update reverses the change
6. AI narrates what it's doing during auto-execute ("Found Rohan. Updating email...")

## Regression Test List
- Create a new contact → confirmation card shown → deal auto-created in Lead stage
- Delete a contact → confirmation card shown → cascading delete works
- Send email → confirmation card shown → email sent via Gmail proxy
- Create deal → confirmation card shown → appears in pipeline
- Morning briefing → chains 4 read tools correctly
- Contact-scoped chat → uses preloaded contact context

---

## CEO Review — Remaining Sections (not yet completed)

The following review sections were interrupted and need to be completed:

- [ ] Remaining expansion candidates (3 more to present)
- [ ] Temporal Interrogation (0E)
- [ ] Section 1: Architecture Review
- [ ] Section 2: Error & Rescue Map
- [ ] Section 3: Security & Threat Model
- [ ] Section 4: Data Flow & Interaction Edge Cases
- [ ] Section 5: Code Quality Review
- [ ] Section 6: Test Review
- [ ] Section 7: Performance Review
- [ ] Section 8: Observability & Debuggability Review
- [ ] Section 9: Deployment & Rollout Review
- [ ] Section 10: Long-Term Trajectory Review
- [ ] Section 11: Design & UX Review
- [ ] Outside Voice
- [ ] TODOS.md updates
- [ ] CEO Plan persistence + spec review
- [ ] Completion Summary

To resume: run `/plan-ceo-review` again with this plan file.
