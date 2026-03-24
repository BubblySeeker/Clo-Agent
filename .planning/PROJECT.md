# AI Contact Intelligence

## What This Is

A focused improvement to CloAgent's AI assistant that makes it smarter about finding, resolving, and reasoning about contacts. Currently the AI fails on basic contact operations — it can't split "Rohan Batre" into first/last name for search, can't find "my last contact," and returns empty results for partial name lookups like "email Rohan." This milestone fixes the AI's contact resolution so it behaves like a competent human assistant.

## Core Value

When a user references a contact by any natural description (name, partial name, recency, relationship), the AI finds the right contact and acts on it — every time.

## Requirements

### Validated

- ✓ Contact CRUD (list, create, edit, delete) — existing
- ✓ Contact search by name/email/source with ILIKE — existing
- ✓ Full-name concatenation search (first || ' ' || last) — existing
- ✓ AI tool calling with 34 tools — existing
- ✓ System prompt with action-oriented guidelines — existing
- ✓ Contact-scoped conversations with pre-loaded context — existing
- ✓ AI always searches for contacts before passing IDs to other tools — Validated in Phase 1: Core Resolution Protocol
- ✓ AI splits multi-word names into searchable terms — Validated in Phase 1: Core Resolution Protocol
- ✓ AI resolves "my last contact" via limit=1 sorted DESC — Validated in Phase 1: Core Resolution Protocol
- ✓ AI resolves partial names by searching and selecting best match — Validated in Phase 1: Core Resolution Protocol
- ✓ AI handles ambiguous matches (presents candidates, asks user to clarify) — Validated in Phase 1: Core Resolution Protocol
- ✓ AI resolves pronoun references ("him", "her", "them") using conversation context — Validated in Phase 2: Context Awareness and Hardening

### Active

(No active requirements — all milestone phases complete)

### Out of Scope

- Other AI tool improvements beyond contact resolution — separate milestone
- New contact search backend features (fuzzy search, phonetic matching) — current ILIKE is sufficient
- AI chat UI changes — this is purely AI behavior
- Performance optimization — not the issue here

## Context

The search_contacts tool already supports searching across first_name, last_name, email, and full name concatenation via ILIKE. The SQL is solid. The problem is the AI model (Claude Haiku 4.5) isn't being instructed well enough in the system prompt to:

1. **Always search before acting** — when a user mentions a contact by name, search first, get the UUID, then use it
2. **Parse natural language references** — "my last contact" means sort by recency; "Rohan" means search by first name
3. **Handle the search → resolve → act pipeline** — the AI jumps straight to action without the resolve step

Key files:
- `ai-service/app/services/agent.py` — system prompt construction, agent loop
- `ai-service/app/tools.py` — tool definitions and execution (search_contacts at line 649)

## Constraints

- **Model**: Claude Haiku 4.5 — must work within this model's capabilities (can't rely on stronger reasoning)
- **Tool rounds**: Max 5 per message — contact resolution may consume 1-2 rounds, leaving 3-4 for actual work
- **Backward compatible**: Changes must not break existing working AI interactions (deals, tasks, activities)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fix via system prompt + tool descriptions first | Cheapest, fastest approach; search SQL already works | ✓ Validated in Phases 1 & 2 |
| Keep Haiku 4.5 model | Cost/speed constraints for real-time chat | ✓ Confirmed |
| Pronoun resolution via prompt rules (not code) | Gender inference from first names keeps it simple; sub-rules handle edge cases | ✓ Validated in Phase 2 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after Phase 2 completion — Context Awareness and Hardening shipped (pronoun resolution)*
