# Requirements: AI Contact Intelligence

**Defined:** 2026-03-24
**Core Value:** When a user references a contact by any natural description, the AI finds the right contact and acts on it — every time.

## v1 Requirements

### Contact Resolution Protocol

- [x] **RES-01**: AI always calls search_contacts before using a contact_id in any other tool — never guesses or fabricates UUIDs
- [x] **RES-02**: AI splits multi-word name references into searchable terms (e.g. "Rohan Batre" → search query that matches first_name="Rohan" AND last_name="Batre")
- [x] **RES-03**: AI resolves recency references ("my last contact", "most recent contact") by searching with limit=1 sorted by created_at DESC
- [x] **RES-04**: AI resolves partial name references ("email Rohan") by searching the partial name and selecting the best match
- [x] **RES-05**: AI presents ranked candidates when search returns multiple matches — shows top 3 with name, email, and source so user can pick
- [x] **RES-06**: AI handles zero results gracefully — tells user no match was found and suggests checking the name spelling

### Context Awareness

- [x] **CTX-01**: AI resolves pronoun references ("email him", "call her") using the current conversation's contact context or most recently discussed contact
- [x] **CTX-02**: AI skips search_contacts when conversation is already contact-scoped (contact_id pre-loaded) and uses the known UUID directly
- [x] **CTX-03**: AI uses contact context from earlier in the conversation (e.g. if user searched for "Rohan" 2 messages ago, "create a deal for him" resolves to Rohan)

### Safety & Compatibility

- [x] **SAFE-01**: All existing AI interactions (deals, tasks, activities, morning briefing) continue working without regression
- [x] **SAFE-02**: Contact resolution adds at most 1 extra tool round — stays within the 5-round budget for typical operations
- [x] **SAFE-03**: System prompt changes are structured with XML tags and placed near the top for reliable Haiku 4.5 instruction-following

## v2 Requirements

### Advanced Resolution

- **ADV-01**: Fuzzy/phonetic matching for misspelled names (e.g. "Rohan Batra" matches "Rohan Batre")
- **ADV-02**: Resolution across multiple entity types (contacts, deals, properties) from a single reference
- **ADV-03**: Learning from corrections ("not that John, the other one" → remember preference)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend search changes (fuzzy search, Levenshtein) | Current ILIKE is sufficient; fix is in the prompt layer |
| Model upgrade from Haiku 4.5 | Cost/speed constraints for real-time chat |
| Frontend UI changes | This is purely AI behavior — no chat UI modifications |
| New tools or API endpoints | Resolution works via existing search_contacts tool |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RES-01 | Phase 1 | Complete |
| RES-02 | Phase 1 | Complete |
| RES-03 | Phase 1 | Complete |
| RES-04 | Phase 1 | Complete |
| RES-05 | Phase 1 | Complete |
| RES-06 | Phase 1 | Complete |
| CTX-01 | Phase 2 | Complete |
| CTX-02 | Phase 1 | Complete |
| CTX-03 | Phase 1 | Complete |
| SAFE-01 | Phase 1 | Complete |
| SAFE-02 | Phase 1 | Complete |
| SAFE-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation*
