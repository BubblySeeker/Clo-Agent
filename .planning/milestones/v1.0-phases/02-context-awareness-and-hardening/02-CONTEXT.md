# Phase 2: Context Awareness and Hardening - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add pronoun resolution to the AI's contact resolution protocol so that "email him", "call her", "follow up with them" resolves to the correct contact using conversation context. Changes are limited to the system prompt in `agent.py` — no new backend endpoints, no frontend changes, no migrations. The "hardening" aspect addresses any edge cases exposed by Phase 1 real-world use.

</domain>

<decisions>
## Implementation Decisions

### Pronoun Resolution Scope
- **D-01:** Handle all common third-person pronouns: him, her, them, they. Also covers variations like "email him", "call her", "follow up with them".
- **D-02:** Resolve pronouns to the most recent contact mentioned in the conversation. Look backward through the 20-message history window for the last contact_id that appeared in a search result or tool call.
- **D-03:** No possessives in scope — "his email", "her deal" are not explicitly handled (may work naturally but not a requirement).

### Ambiguous Pronoun Handling (multiple contacts in conversation)
- **D-04:** When multiple contacts were discussed in the conversation, attempt gender matching from first names to resolve pronouns. "Email him" after discussing Rohan and Sarah should resolve to Rohan (male name); "call her" should resolve to Sarah (female name).
- **D-05:** When gender matching is inconclusive (gender-neutral names like Alex, Jordan, or multiple contacts of the same inferred gender), fall back to asking for clarification. Present the recently discussed contacts and ask the user to pick — consistent with D-01 from Phase 1 (ambiguity → ask user).
- **D-06:** Gender inference is done by the AI model (Haiku 4.5) based on first names — no gender field stored in the database, no external lookup.

### Claude's Discretion
- Recency limit for pronoun resolution — whether to limit lookback to recent messages or use the full 20-message window. Researcher/planner should determine what works reliably with Haiku 4.5.
- Exact prompt wording and placement within the existing `<contact_resolution>` XML block.
- Whether to add this as a new numbered rule (e.g., rule 8) or extend rule 6 (conversation memory).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AI Service
- `ai-service/app/services/agent.py` — System prompt with existing `<contact_resolution>` block (rules 1-7), `_build_system_prompt()` at line 143, `_load_history()` for 20-message window, `_load_contact_context()` for contact-scoped conversations
- `ai-service/app/tools.py` — Tool definitions, `search_contacts` tool description (updated in Phase 1)

### Prior Phase Context
- `.planning/phases/01-core-resolution-protocol/01-CONTEXT.md` — Phase 1 decisions (D-01 through D-05) that this phase builds on
- `.planning/REQUIREMENTS.md` — CTX-01 is the primary requirement for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `<contact_resolution>` XML block already in system prompt (7 rules) — pronoun resolution extends this
- Rule 5 (contact-scoped conversations) already handles the simplest pronoun case: conversation has a loaded contact
- Rule 6 (conversation memory) already handles reusing contact_id from previous searches — pronoun resolution is the natural next step
- 20-message history window loaded by `_load_history()` — provides the context for pronoun antecedent lookup

### Established Patterns
- XML tags (`<contact_resolution>`) proven effective with Haiku 4.5 for behavioral rules
- Numbered rules within the XML block (1-7) — new pronoun rule fits this pattern
- Phase 1 placed contact resolution before IMPORTANT GUIDELINES for maximum Haiku attention

### Integration Points
- New rule(s) added to `<contact_resolution>` block in `_build_system_prompt()` — single file change
- No tool changes expected — pronoun resolution uses existing conversation context, not new tool calls

</code_context>

<specifics>
## Specific Ideas

- Gender matching from names is a "best effort" approach — the AI infers gender from common first names (Rohan → male, Sarah → female) but must gracefully fall back to asking when names are gender-neutral
- This should NOT consume an extra tool round — pronoun resolution happens in the AI's reasoning before it decides which tool to call

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-context-awareness-and-hardening*
*Context gathered: 2026-03-24*
