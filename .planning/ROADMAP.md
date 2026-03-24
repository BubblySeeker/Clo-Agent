# Roadmap: AI Contact Intelligence

## Overview

This milestone fixes CloAgent's AI assistant contact resolution. The AI currently skips the search step and fabricates contact UUIDs, causing silent failures. The fix is entirely in the prompt and tool description layer — two files, no new backend code, no migrations, no frontend changes. Phase 1 ships the complete core fix; Phase 2 validates behavior under real use and adds the one capability (pronoun resolution) that requires empirical evidence from Phase 1 to design safely.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Resolution Protocol** - Rewrite system prompt and tool descriptions so the AI reliably searches for contacts before acting on them
- [ ] **Phase 2: Context Awareness and Hardening** - Add pronoun resolution and validate edge cases observed after Phase 1 ships

## Phase Details

### Phase 1: Core Resolution Protocol
**Goal**: The AI reliably finds the right contact before acting — for any name format, partial name, or recency reference — and never guesses a UUID
**Depends on**: Nothing (first phase)
**Requirements**: RES-01, RES-02, RES-03, RES-04, RES-05, RES-06, CTX-02, CTX-03, SAFE-01, SAFE-02, SAFE-03
**Success Criteria** (what must be TRUE):
  1. Saying "email Rohan Batre" causes the AI to call search_contacts before attempting any email operation — never fabricating a UUID
  2. Saying "my last contact" resolves to the most recently created contact, not a hallucinated name
  3. Saying "email Rohan" when two Rohans exist causes the AI to list both and ask the user to pick one
  4. Saying "email Rohan" when no Rohan exists causes the AI to report no match found and suggest checking the spelling
  5. All existing AI operations (deals, tasks, activities, morning briefing) continue working without any regression
**Plans:** 1 plan

Plans:
- [ ] 01-01-PLAN.md — Add contact resolution protocol to system prompt and sharpen search_contacts tool description

### Phase 2: Context Awareness and Hardening
**Goal**: The AI resolves pronoun references ("follow up with him") using conversation context, and any edge cases exposed by Phase 1 real-world use are addressed
**Depends on**: Phase 1
**Requirements**: CTX-01
**Success Criteria** (what must be TRUE):
  1. Saying "create a task for him" after discussing a specific contact resolves to that contact without a new search
  2. Saying "call her" in a contact-scoped conversation resolves to the scoped contact without asking for clarification
  3. Phase 1 behavior remains stable under the additional prompt additions
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Resolution Protocol | 0/1 | Not started | - |
| 2. Context Awareness and Hardening | 0/? | Not started | - |
