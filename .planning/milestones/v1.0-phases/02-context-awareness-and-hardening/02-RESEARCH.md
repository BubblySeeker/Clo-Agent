# Phase 02: Context Awareness and Hardening - Research

**Researched:** 2026-03-24
**Domain:** Prompt engineering — Claude Haiku 4.5 pronoun resolution, conversation context lookback
**Confidence:** HIGH (domain is system prompt modification; all constraints are known from codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Handle all common third-person pronouns: him, her, them, they. Also covers variations like "email him", "call her", "follow up with them".
- **D-02:** Resolve pronouns to the most recent contact mentioned in the conversation. Look backward through the 20-message history window for the last contact_id that appeared in a search result or tool call.
- **D-03:** No possessives in scope — "his email", "her deal" are not explicitly handled (may work naturally but not a requirement).
- **D-04:** When multiple contacts were discussed in the conversation, attempt gender matching from first names to resolve pronouns. "Email him" after discussing Rohan and Sarah should resolve to Rohan (male name); "call her" should resolve to Sarah (female name).
- **D-05:** When gender matching is inconclusive (gender-neutral names like Alex, Jordan, or multiple contacts of the same inferred gender), fall back to asking for clarification. Present the recently discussed contacts and ask the user to pick — consistent with D-01 from Phase 1 (ambiguity → ask user).
- **D-06:** Gender inference is done by the AI model (Haiku 4.5) based on first names — no gender field stored in the database, no external lookup.

### Claude's Discretion
- Recency limit for pronoun resolution — whether to limit lookback to recent messages or use the full 20-message window. Researcher/planner should determine what works reliably with Haiku 4.5.
- Exact prompt wording and placement within the existing `<contact_resolution>` XML block.
- Whether to add this as a new numbered rule (e.g., rule 8) or extend rule 6 (conversation memory).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-01 | AI resolves pronoun references ("email him", "call her") using the current conversation's contact context or most recently discussed contact | Implemented via a new numbered rule in the `<contact_resolution>` XML block; no tool changes, no backend changes |
</phase_requirements>

---

## Summary

Phase 2 is a single-file prompt engineering change to `ai-service/app/services/agent.py`. The system prompt already has a 7-rule `<contact_resolution>` XML block (added in Phase 1). This phase adds one new rule (or extends an existing one) that instructs Claude Haiku 4.5 to resolve third-person pronouns (him, her, them, they) by scanning backward through conversation history for the most recently discussed contact.

The gender-inference requirement (D-04, D-06) is the most nuanced aspect. Haiku 4.5 has solid world-knowledge of common first-name gender associations and can apply this inline during reasoning without an extra tool call. The key risk is inconclusive inference — the fallback to asking the user (D-05) must be stated explicitly in the rule to prevent the model from guessing.

The Phase 1 token addition (~610 tokens) pushed the prompt to approximately 300 lines. Adding ~60-80 more tokens for the pronoun rule is low-risk: Haiku 4.5 instruction-following for rules at the top of the XML block (before IMPORTANT GUIDELINES) is reliable at this scale. The rule should be placed contiguously with rule 6 (CONVERSATION MEMORY) since they share the same mechanism — conversation history lookback.

**Primary recommendation:** Add rule 8 (PRONOUN RESOLUTION) as a standalone numbered rule after rule 7 in the existing `<contact_resolution>` block. Do not extend rule 6 — keeping rules atomic makes each behavioral contract easier to test and reason about.

---

## Standard Stack

This phase has no external library dependencies. The entire change is a string literal modification inside `_build_system_prompt()` in `ai-service/app/services/agent.py`.

| Component | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| `ai-service/app/services/agent.py` | Current | System prompt construction | Only file to modify |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Model executing the instructions | Defined in `ai-service/app/config.py` via `ANTHROPIC_MODEL` env var |

**Installation:** No new packages required.

---

## Architecture Patterns

### Single-File Change Pattern (Established in Phase 1)

Phase 1 demonstrated the full pattern for this codebase:

- All behavioral rules live inside the `<contact_resolution>` XML block in `_build_system_prompt()`
- Rules are numbered and written as imperative directives
- XML tags (`<contact_resolution>`) trigger native pattern-following in Haiku 4.5
- The block is placed before `IMPORTANT GUIDELINES:` (line ~167 in current file) for maximum attention

### Existing `<contact_resolution>` block (current state)

```
Rule 1: ALWAYS call search_contacts before using a contact_id
Rule 2: FULL NAME SEARCH
Rule 3: PARTIAL NAME SEARCH (with 3 sub-cases: 1 result / 2+ results / 0 results)
Rule 4: RECENCY REFERENCE (limit=1 DESC)
Rule 5: CONTACT-SCOPED CONVERSATIONS (use pre-loaded context, skip search)
Rule 6: CONVERSATION MEMORY (reuse contact_id from prior search in same conversation)
Rule 7: SEQUENTIAL TOOL USE (never call contact-dependent tool same round as search)
```

Rule 8 (new) slots in after rule 7, before `</contact_resolution>`.

### Pattern 1: Pronoun Resolution Rule Structure

**What:** A numbered imperative rule that maps pronoun triggers to a resolution algorithm: check contact-scoped conversation first, then scan backward through message history for the most recent contact_id.

**When to use:** Any time user message contains "him", "her", "them", "they" in a contact-action context.

**Example rule text (recommended wording):**

```
8. PRONOUN RESOLUTION: When the user refers to a contact with a pronoun
   ("email him", "call her", "follow up with them", "update their record"),
   resolve the pronoun before calling any contact-dependent tool:
   a. CONTACT-SCOPED: If this conversation has a preloaded contact (see rule 5),
      that contact IS the antecedent — use their contact_id directly.
   b. SINGLE RECENT CONTACT: If only one contact was discussed in this
      conversation (appears in a search result or tool call above), use that
      contact_id directly.
   c. MULTIPLE CONTACTS — GENDER MATCH: If multiple contacts were discussed,
      infer gender from each contact's first name and match to the pronoun
      ("him"/"his" → male, "her"/"hers" → female). If exactly one contact
      matches the inferred gender, use that contact_id.
   d. AMBIGUOUS — ASK: If gender matching is inconclusive (gender-neutral name,
      multiple contacts of the same inferred gender, or no contacts in history),
      do NOT guess. List the recently discussed contacts by name and ask the user
      to confirm which one they mean.
   Pronoun resolution must not consume an extra tool round — resolve in
   reasoning before calling any tool.
```

### Anti-Patterns to Avoid

- **Extending rule 6 instead of adding rule 8:** Rule 6 covers reusing a known contact_id for follow-ups. Pronoun resolution is a separate, more complex operation. Merging them makes the rule harder to follow and test.
- **Asking for clarification when context is unambiguous:** If only one contact was ever mentioned in the conversation, the model must use that contact — no clarification question needed. Over-clarification breaks the "action-oriented" guideline.
- **Adding a tool call for pronoun resolution:** The resolution must happen in Haiku's reasoning pass, not via a tool. Adding a search_contacts call for pronoun resolution would burn a tool round unnecessarily.
- **Partial lookback window (arbitrary N messages):** Limiting to "last 5 messages" introduces brittleness. The full 20-message window is already loaded by `_load_history()` and visible in the conversation. The rule should reference "this conversation" broadly — Haiku will naturally weight recency.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gender inference | External API or DB field | Haiku 4.5 world knowledge | Haiku has reliable first-name gender associations for common names; adding a lookup adds latency and complexity with no benefit |
| Pronoun detection | Regex or NLP preprocessing | Haiku 4.5 natural language understanding | Haiku already interprets pronouns in context; a rule in the prompt is sufficient |
| Contact tracking across messages | In-memory state or DB column | Existing 20-message history + prompt rule | History is already loaded; the model can scan it |

---

## Common Pitfalls

### Pitfall 1: Gender Inference Overconfidence
**What goes wrong:** The model infers gender for a gender-neutral name (Alex, Jordan, Casey) and acts on it without asking.
**Why it happens:** Haiku may have training bias toward one gender for ambiguous names.
**How to avoid:** Rule 8d explicitly requires asking when inference is inconclusive. The fallback condition must list "gender-neutral name" as a trigger for the ask path.
**Warning signs:** If a user named "Alex Johnson" is incorrectly resolved via gender matching — validate during UAT with a gender-neutral name scenario.

### Pitfall 2: Pronoun Resolution Consuming a Tool Round
**What goes wrong:** The model calls `search_contacts` to "find the him from earlier" instead of reading conversation history.
**Why it happens:** Without explicit instruction, Haiku may default to search when uncertain.
**How to avoid:** Rule 8 must explicitly state "resolve in reasoning before calling any tool" and emphasize that the contact_id is already in the conversation above.
**Warning signs:** Tool call log shows `search_contacts` immediately after a pronoun reference without a name query.

### Pitfall 3: Pronoun Rule Weakening Earlier Rules
**What goes wrong:** Adding rule 8 causes Haiku to apply pronoun resolution even when a full name is provided ("email Rohan Batre" → model finds "him" from a previous message instead of the explicit name).
**Why it happens:** Prompt rules can interfere if not scoped properly. Pronoun resolution is only triggered by actual pronouns, not by names.
**How to avoid:** Rule 8 must explicitly trigger on pronouns only — the example list ("email him", "call her", "follow up with them") makes the scope clear. Start the rule with "When the user refers to a contact WITH A PRONOUN."
**Warning signs:** A regression test (explicit name lookup stops searching) after the change.

### Pitfall 4: Contact-Scoped Case Duplicating Rule 5
**What goes wrong:** The model is confused about when to apply rule 5 vs. rule 8a.
**Why it happens:** Both rules address "skip search when contact is known."
**How to avoid:** Rule 8a explicitly says "see rule 5" to establish continuity. The sub-cases are ordered so the simplest (contact-scoped conversation) resolves first.
**Warning signs:** Any behavior change in contact-scoped conversations that worked correctly in Phase 1.

### Pitfall 5: Token Budget Degrading Mid-Document Instructions
**What goes wrong:** Adding ~80 tokens to the system prompt causes Haiku to ignore rules that appear later in the prompt (MORNING BRIEFING, RESPONSE FORMATTING, document citation rules).
**Why it happens:** Transformer attention for instruction-following degrades for rules far from the beginning.
**How to avoid:** The `<contact_resolution>` block is positioned before IMPORTANT GUIDELINES — the new rule stays inside that block, not appended after. No net increase in the distance between early rules and the rules that follow.
**Warning signs:** Morning briefing behavior changes or document citation format breaks after the rule addition.

---

## Code Examples

### Current `_build_system_prompt()` insertion point

```python
# Source: ai-service/app/services/agent.py lines 155-167
"<contact_resolution>\n"
"CONTACT RESOLUTION PROTOCOL — follow this before every contact operation:\n\n"
"1. ALWAYS call search_contacts...\n\n"
# ... rules 2-6 ...
"7. SEQUENTIAL TOOL USE: Do not call any contact-dependent tool (create_deal, log_activity, "
"send_email, etc.) in the same tool-call round as search_contacts. Wait for search results "
"before using a contact_id. (implements SAFE-02)\n"
"</contact_resolution>\n\n"  # <-- INSERT rule 8 HERE, before the closing tag
```

Rule 8 replaces the closing `"</contact_resolution>\n\n"` line with:

```python
"8. PRONOUN RESOLUTION: When the user refers to a contact with a pronoun "
"(\"email him\", \"call her\", \"follow up with them\", \"update their record\"), "
"resolve the pronoun before calling any contact-dependent tool:\n"
"   a. CONTACT-SCOPED: If this conversation has a preloaded contact context "
"(shown under '## Current Contact Context', see rule 5), that contact IS the "
"antecedent — use their contact_id directly.\n"
"   b. SINGLE RECENT CONTACT: If only one contact appeared in search results "
"or tool calls earlier in this conversation, use that contact_id directly.\n"
"   c. MULTIPLE CONTACTS — GENDER MATCH: If multiple contacts were discussed, "
"infer gender from each contact's first name and match to the pronoun "
"('him' → male, 'her' → female, 'them'/'they' → any). If exactly one contact "
"matches the inferred gender, use that contact_id.\n"
"   d. AMBIGUOUS — ASK: If gender matching is inconclusive (gender-neutral name "
"like Alex or Jordan, multiple contacts of the same inferred gender, or no "
"contacts found in history), do NOT guess. List the recently discussed contacts "
"by name and ask the user to confirm which one they mean.\n"
"   Pronoun resolution happens in your reasoning — never call a tool solely to "
"resolve a pronoun that is already answered by the conversation above.\n"
"</contact_resolution>\n\n"
```

### Haiku 4.5 instruction-following guidance

XML-tagged structured rules work reliably with Haiku 4.5 for behavioral constraints. The sub-lettered format (a/b/c/d) within a numbered rule is well within Haiku's instruction-following capability. Evidence from Phase 1: the 7-rule block (with rule 3 having 3 sub-cases) passed all 8 static verifications.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| No pronoun handling | Pronoun resolution via conversation lookback | Users can say "email him" naturally after any contact discussion |
| Rule 6 covers reuse only | Rule 6 (reuse contact_id) + Rule 8 (pronoun resolution) | Clear separation: rule 6 = explicit references, rule 8 = pronoun references |

---

## Open Questions

1. **Recency window: full 20 messages vs. constrained lookback**
   - What we know: D-02 says "look backward through the 20-message history window." The full window is already loaded.
   - What's unclear: Whether Haiku reliably finds a contact_id mentioned 15+ messages ago vs. 5 messages ago.
   - Recommendation: Use "earlier in this conversation" without an explicit message count. Haiku naturally weights recency. If UAT reveals resolution failures for distant contacts, a "last 10 messages" qualifier can be added in a patch.

2. **"them"/"they" pronoun handling with a single contact**
   - What we know: "them"/"they" can refer to a single person (singular they, common in modern English). D-01 includes "them"/"they" in scope.
   - What's unclear: Should the rule treat singular "them" as any-gender (matching either he or she contacts)?
   - Recommendation: Rule 8c maps "them"/"they" to "any" — if only one contact was discussed, use them. If multiple contacts exist, singular "they" resolves via most-recent (D-02), not gender matching, since gender matching doesn't apply. This is the natural interpretation of D-01 and requires no additional user decisions.

3. **Hardening: Phase 1 edge cases discovered in production**
   - What we know: STATE.md lists no blockers or concerns from Phase 1 actual use. The 5 human verification items in 01-VERIFICATION.md are UAT tests, not confirmed bugs.
   - What's unclear: Whether any Phase 1 edge cases have been discovered since the phase completed (2026-03-24, same day).
   - Recommendation: Planner should include a task to review any UAT feedback since Phase 1 shipped before finalizing the plan. If no issues found, the "hardening" aspect of this phase is satisfied by Phase 1's existing quality.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — this phase is a string literal modification to a Python file with no new packages, CLI tools, or services required).

---

## Sources

### Primary (HIGH confidence)
- `ai-service/app/services/agent.py` — Direct inspection of `_build_system_prompt()`, `_load_history()`, `run_agent()`, `MAX_TOOL_ROUNDS`
- `.planning/phases/02-context-awareness-and-hardening/02-CONTEXT.md` — All locked decisions (D-01 through D-06)
- `.planning/phases/01-core-resolution-protocol/01-VERIFICATION.md` — Phase 1 verification confirms XML block structure, rule count, character positions
- `.planning/REQUIREMENTS.md` — CTX-01 definition and traceability table

### Secondary (MEDIUM confidence)
- `.planning/phases/01-core-resolution-protocol/01-CONTEXT.md` — Phase 1 established patterns for XML tags, rule numbering, and Haiku 4.5 instruction-following
- `.planning/STATE.md` — Decisions log: "XML tags trigger native pattern recognition in Claude Haiku 4.5", "early placement is critical for instruction following"

### Tertiary (LOW confidence)
- None — all findings are grounded in direct code inspection or locked decisions.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single Python file modification, no new dependencies
- Architecture: HIGH — established pattern from Phase 1, exact insertion point identified
- Pitfalls: HIGH — derived from Phase 1 lessons and known Haiku 4.5 behaviors documented in STATE.md
- Gender inference behavior: MEDIUM — Haiku 4.5 world-knowledge for name gender is well-established but specific edge cases (gender-neutral names, non-Western names) require UAT validation

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain; Haiku 4.5 model pinned in env var, no external API changes expected)
