# Project Research Summary

**Project:** AI Contact Intelligence (CloAgent milestone)
**Domain:** AI agent entity resolution in an existing CRM assistant
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

CloAgent already has a fully functional AI assistant with 34 tools, working SQL, and a correct agentic loop. This milestone is not about building new infrastructure — it is about fixing a behavioral gap in Claude Haiku 4.5's contact resolution pipeline through targeted prompt engineering. The AI fails to reliably search for contacts before acting on them: it skips the `search_contacts` call and attempts to fabricate or infer contact UUIDs, causing silent failures on write operations. Every research file converges on the same conclusion: **the problem is a prompt gap, not a schema or backend gap**.

The recommended approach is a two-file edit (one system prompt file, one tool definitions file) applied in a specific order. The core fix is adding an explicit, structured `<contact_resolution>` protocol block near the top of the system prompt, rewriting the `search_contacts` tool description from passive documentation to imperative guidance, and updating `contact_id` parameter descriptions on all downstream write tools to explicitly name `search_contacts` as a prerequisite. All 6 table-stakes features (full name resolution, partial name search, recency references, ambiguity clarification, graceful not-found handling, no UUID guessing) are achievable through these prompt and tool description changes alone, with zero new backend code, migrations, or frontend changes.

The primary risk is prompt length: the current system prompt is 200+ lines, and adding resolution rules risks them being lost in the noise. Mitigating this requires placing the new rules near the top of the prompt and wrapping them in XML structural tags, both of which Anthropic's official documentation confirms improve Haiku's instruction-following at length. Secondary risk is the 5-round tool cap: contact resolution consumes 1-2 rounds per request, which is fine for simple operations but can exhaust the budget on multi-action requests. This should be validated after Phase 1 ships rather than preemptively raised.

---

## Key Findings

### Recommended Stack (Techniques)

No stack changes are required. The application stack (Go/Chi, FastAPI, Claude Haiku 4.5, pgvector) is already chosen and correct. The "stack" for this milestone is a set of prompt engineering techniques applied to two existing files.

**Core techniques, in implementation order:**

- **`search_contacts` tool description rewrite** — highest impact per token; makes the model aware of all query patterns (full name, partial name, recency via empty query + limit) and declares it the prerequisite for all contact operations. Referenced source: Anthropic tool-use implementation docs, 2025.
- **`contact_id` parameter description updates (all write tools)** — low effort, high signal; each downstream tool independently instructs the model to obtain the UUID from `search_contacts`, not guess it. Defense in depth.
- **`<contact_resolution>` block in system prompt** — the primary behavioral rule; numbered steps, XML-tagged, placed before "IMPORTANT GUIDELINES". Covers full name, partial name, recency pattern, zero results, single match, and multiple matches.
- **`<examples>` block in system prompt** — 3 worked examples covering the 3 failure modes (partial name, recency reference, ambiguous multi-match). Adds token cost but highest reliability for edge cases; add after verifying the procedure block alone is insufficient.
- **Sequential-step instruction for parallel tool control** — scoped system prompt instruction to prevent `search_contacts` and a write tool being called in the same step. Only needed if parallel tool calling is observed in practice; prefer this over the `betas=["disable_parallel_tool_use"]` API flag, which would break the morning briefing workflow.

**What NOT to build:** fuzzy/phonetic search backend, a `get_most_recent_contact` dedicated tool, a model upgrade to Sonnet, or any frontend changes. These are anti-patterns given the scope and confirmed root cause.

### Expected Features

All features for this milestone are achievable via prompt and tool description changes only.

**Must have (table stakes):**
- **Never guess a UUID** — system prompt rule; prevents silent wrong-record mutations
- **Partial name search before acting** — system prompt rule; fixes the most common failure mode ("email Rohan")
- **Full name splitting and pass-through** — system prompt instruction + example; fixes "Rohan Batre" search
- **Recency resolution ("my last contact")** — system prompt instruction; maps to `search_contacts(query="", limit=1)` using the existing `ORDER BY created_at DESC` SQL
- **Ambiguity clarification** — system prompt rule + example; when 2+ contacts match, list and ask; never pick arbitrarily
- **Graceful not-found handling** — system prompt instruction; offer to create or search differently rather than error

**Should have (differentiators):**
- **Retry with first-name fallback** — if full-name search returns empty, retry with first word only, then last word only (cap at 2 retries to protect tool round budget)
- **Source-aware disambiguation** — extract source hints ("the Zillow lead named Mike") and pass as `source` filter to `search_contacts`
- **Contact-scope boundary rule** — in contact-scoped conversations, explicitly tell the model that references to a different person by name require a fresh `search_contacts` call, not use of the pre-loaded contact UUID

**Defer to a follow-on phase:**
- Contextual pronoun resolution ("follow up with her") — adds scope and harder to test reliably with Haiku 4.5
- Ranked candidate display sorted by `last_activity_at` — minor backend change, good UX but not required for correctness
- UX integration of disambiguation into confirmation cards — UX polish, not blocking correctness

### Architecture Approach

This milestone has a deliberately minimal architecture surface. All changes are confined to the AI service layer. No new components, no new tools, no migrations. The existing `search_contacts` SQL (ILIKE on first name, last name, email, and `first || ' ' || last` concatenation with `ORDER BY created_at DESC`) is already correct and is the resolution engine — the only missing piece is reliable instruction delivery to the model.

**Components touched:**
1. `ai-service/app/services/agent.py` — Add `<contact_resolution>` protocol block and `<examples>` block in `_build_system_prompt()`; add contact-scope boundary rule to contact-scoped prompt section
2. `ai-service/app/tools.py` — Rewrite `search_contacts` tool description in `TOOL_DEFINITIONS`; update `contact_id` parameter descriptions on all write tools that accept one

**Data flow after fix:**
- Resolve (search_contacts, 1 round) → Branch on result count → Act with valid UUID (1 round) → Existing confirmation flow (unchanged)
- Contact-scoped conversations skip the search step when acting on the scoped contact, saving a round
- Tool round budget: resolution costs 1-2 rounds maximum; the 5-round cap remains sufficient for all common request patterns except complex multi-action requests (validate post-Phase 1)

### Critical Pitfalls

1. **Haiku skips search and infers UUIDs directly** — the current "be action-oriented" system prompt instruction is the root cause; fix by adding explicit search-first rule and scoping action-orientation to mean "act immediately once you have a valid UUID, not before." (Pitfall 1, Critical)

2. **Action-orientation instruction conflicts with resolution requirement** — these two goals (fewer questions vs. mandatory search step) require separate, non-competing prompting strategies. Use XML tags to make them structurally distinct; the resolution protocol is not a guideline, it is a mandatory step. (Pitfall 5, Critical)

3. **Ambiguous multi-match silently picks wrong contact** — no current instruction covers the multiple-match case; this causes data integrity problems (activities or deals attributed to wrong contact) that are hard to detect and reverse. Explicit clarification rule + example required. (Pitfall 3, Critical)

4. **New rules buried in 200+ line prompt are inconsistently followed** — prompt length degrades Haiku instruction-following for rules mid-document. Place resolution rules near the top; use `<contact_resolution_protocol>` XML tags. Inconsistent behavior (works sometimes) is the failure signature. (Pitfall 9, Moderate)

5. **Contact-scoped conversation pre-load creates false confidence** — model applies pre-loaded contact UUID to different-contact references in the same conversation. Add a scope boundary instruction distinguishing "the default contact for this conversation" from "a contact the user is currently asking about." (Pitfall 7, Moderate)

---

## Implications for Roadmap

Based on the unified research, the natural phase structure is a two-phase sequential approach. Phase 1 is the complete fix; Phase 2 is validation-driven enhancement.

### Phase 1: Core Resolution Protocol

**Rationale:** All 6 table-stakes features and the 3 critical pitfalls are addressable in one cohesive edit session. The changes are coupled (system prompt rules and tool descriptions must be consistent) and should ship together. No risk of partial state.

**Delivers:**
- Claude reliably calls `search_contacts` before any contact-dependent operation
- Full name ("Rohan Batre"), partial name ("Rohan"), and recency ("my last contact") all resolve correctly
- Multi-match ambiguity triggers a clarifying question instead of silent wrong-contact selection
- Zero results produces a helpful response instead of a silent tool error
- Contact-scoped conversations no longer bleed their pre-loaded UUID onto different-contact references

**Addresses:** All 6 table-stakes features from FEATURES.md; Pitfalls 1, 2, 3, 4, 5, 7, 8, 9, 10, 11 from PITFALLS.md

**Avoids:**
- Adding any new tools, endpoints, migrations, or frontend code
- Using aggressive ALL-CAPS or "CRITICAL" prefix language (Anthropic docs confirm this causes over-triggering in Haiku 4.5)
- Global parallel tool call disable (would break morning briefing workflow)

**Implementation order within phase:**
1. Rewrite `search_contacts` tool description (highest impact, zero regression risk)
2. Update `contact_id` parameter descriptions on all write tools
3. Add `<contact_resolution>` protocol block to `_build_system_prompt()` (before IMPORTANT GUIDELINES)
4. Add contact-scope boundary rule to the contact-scoped section of the prompt
5. Add `<examples>` block — test after step 3 first; only add examples if procedure block alone is insufficient

**Files changed:** `ai-service/app/services/agent.py`, `ai-service/app/tools.py`

### Phase 2: Validation and Edge Case Hardening

**Rationale:** Several potential enhancements are intentionally deferred until Phase 1 behavior is confirmed in practice. The 5-round tool budget, parallel tool behavior, and recency-sort schema need empirical validation before any structural changes.

**Delivers (conditionally, based on Phase 1 test results):**
- Tool round cap increased from 5 to 7-8 if multi-action requests with resolution are truncating
- `sort_by` parameter added to `search_contacts` if `limit=1` empty-query recency pattern proves unreliable for Haiku
- Source-aware disambiguation ("the Zillow lead named Mike") if source-filter extraction can be reliably taught via prompt
- Ranked candidate display sorted by `last_activity_at` (requires minor backend sort change)

**Addresses:** Pitfall 6 (tool round budget), Pitfall 4 edge cases, differentiator features from FEATURES.md

**Research flag:** Standard patterns — no additional research phase required. Phase 2 work is entirely driven by observations from Phase 1 testing. Test cases are well-defined in PITFALLS.md.

### Phase Ordering Rationale

- Phase 1 before Phase 2 because enhancements cannot be designed without knowing which failure modes survive the core fix
- All table-stakes features go in Phase 1 because they share the same two files and the same code review context
- Differentiators and schema changes go in Phase 2 because they require confirming Haiku's behavior under the new prompt before adding complexity
- Tool round budget increase is explicitly held for Phase 2 because raising it blindly before knowing actual consumption post-resolution is a risk (the 5-round limit exists for safety reasons)

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 1:** Prompt engineering approach is fully documented in Anthropic's official 2025 docs; all techniques are verified HIGH confidence. No external research needed during planning — the techniques are enumerated in STACK.md with exact code patterns.
- **Phase 2:** Decisions are data-driven from Phase 1 test results; schema changes if needed are well-understood SQL additions.

Phases that may need focused testing (not research):
- **Phase 1 verification:** Run the 10+ test case scenarios defined in PITFALLS.md before marking complete. Inconsistent behavior is the failure signature for prompt length issues; test all 3 failure modes (partial name, recency, multi-match) explicitly.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (techniques) | HIGH | All 5 prompt engineering techniques verified against official Anthropic docs (2025); exact code patterns provided in STACK.md |
| Features | HIGH | Derived from direct codebase inspection + Anthropic Haiku behavior docs; failure modes are empirically confirmed, not inferred |
| Architecture | HIGH | Based on direct inspection of `agent.py` and `tools.py`; file locations, function names, and change types are precise |
| Pitfalls | HIGH | 12 pitfalls identified; 5 critical/moderate backed by official Anthropic model behavior docs + direct codebase analysis |

**Overall confidence:** HIGH

### Gaps to Address

- **Parallel tool call behavior in practice:** STACK.md rates the `betas=["disable_parallel_tool_use"]` flag as MEDIUM confidence because it has not been tested against this specific codebase. The system prompt scoped instruction is the preferred approach; validate during Phase 1 testing that no parallel search+write calls occur.
- **`limit=1` recency pattern reliability for Haiku:** Confirmed the SQL orders by `created_at DESC`, and ARCHITECTURE.md confirms the pattern works architecturally. PITFALLS.md notes Haiku may not reliably use it without explicit instruction. This is a known uncertainty — the Phase 1 prompt instruction teaches it explicitly, but validate with a "my last contact" test case before Phase 2.
- **Token budget impact on Haiku behavior:** Adding ~610 tokens to an already 200+ line system prompt is a calculated risk. PITFALLS.md explicitly flags prompt length as a Haiku vulnerability. The XML structuring and top-of-prompt placement are the mitigations — no way to confirm effectiveness without testing.

---

## Sources

### Primary (HIGH confidence)

- [Anthropic Claude 4.x Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices) — numbered steps, XML tags, example formatting, action-orientation tuning
- [Anthropic Tool Use Implementation Guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) — tool description importance, `disable_parallel_tool_use`, `contact_id` parameter pattern
- [Anthropic Agent Skill Authoring Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — sequential pipeline enforcement, Haiku vs. Opus disambiguation behavior
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — context placement, structural tagging for long prompts
- [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) — multi-step tool call patterns
- Direct codebase inspection: `ai-service/app/services/agent.py`, `ai-service/app/tools.py` — current system prompt, tool definitions, MAX_TOOL_ROUNDS, `_search_contacts` SQL

### Secondary (MEDIUM confidence)

- [Disambiguation in Conversational QA — ACL Survey 2025](https://arxiv.org/html/2505.12543v1) — query rewriting + clarifying questions as standard disambiguation strategies
- [Agentic AI Tool-Use Pattern](https://machinelearningmastery.com/7-must-know-agentic-ai-design-patterns/) — ReAct / search-before-act as standard agentic pattern
- [What We've Learned From A Year of Building with LLMs (Applied LLMs)](https://applied-llms.org/) — monolithic prompt degradation; LLMs return output even when they shouldn't

### Tertiary (MEDIUM confidence, academic)

- [CRMArena: LLM Agents in CRM Tasks (ACL 2025)](https://aclanthology.org/2025.naacl-long.194.pdf) — significant performance drops in multi-turn CRM settings; entity awareness improvable with prompting

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
