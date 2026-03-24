# Domain Pitfalls: AI Contact Resolution in a CRM Assistant

**Domain:** AI agent entity resolution — finding and acting on CRM contacts via natural language
**Researched:** 2026-03-24
**Confidence:** HIGH (verified against Anthropic official docs + production evidence from current codebase)

---

## Critical Pitfalls

Mistakes that cause broken behavior, incorrect data mutations, or rewrites.

---

### Pitfall 1: Haiku Skips Search Steps and Infers IDs Directly

**What goes wrong:** Claude Haiku 4.5 will attempt to infer or hallucinate a contact_id parameter when the system prompt says "be action-oriented" and "when intent is clear, use your tools immediately." The current system prompt in `agent.py` actively encourages immediate action, which trains the model to skip the search step and pass a fabricated UUID to write tools like `update_contact`, `log_activity`, or `create_deal`.

**Why it happens:** Haiku is documented by Anthropic as a model that "may infer missing parameters" rather than asking for them or calling prerequisite tools. The eagerness is a feature for simple tasks but a liability for multi-step pipelines. Haiku is specifically contrasted with Opus, which "seeks clarification when needed." The current system prompt's instruction to "use tools immediately" amplifies this tendency — Haiku interprets it as a license to skip resolution steps.

**Consequences:**
- Tool calls fail with a database error (contact not found by UUID) and the model silently generates an apology instead of resolving the contact
- Worse: if the fabricated UUID coincidentally matches a real contact belonging to another agent (extremely unlikely but possible), RLS would block it, but the error surface is ugly
- User loses trust in the assistant for basic name-referenced operations

**Prevention:**
- Add an explicit contact resolution rule to the system prompt as a numbered, mandatory protocol — not as a guideline. Example: "RULE: Before calling any tool that requires a contact_id, you MUST first call search_contacts to find the contact. Never guess or invent a contact_id."
- Frame the UUID constraint in the tool description for every write tool that accepts a contact_id: "The contact_id MUST come from a prior search_contacts call. Never fabricate this value."
- The "be action-oriented" guideline must be scoped: "action-oriented means execute immediately once you have the contact_id — not that you skip getting it."

**Detection:**
- Model response contains "I couldn't find..." immediately after a write tool call (no preceding search_contacts call in the tool_calls log)
- `messages.tool_calls` JSONB shows a write tool called without a preceding `search_contacts` in the same or previous round
- Users report "it said it logged an activity but nothing showed up"

**Phase:** Address in Phase 1 (system prompt + tool description changes)

---

### Pitfall 2: Full Name Not Split Before Search, Returning Zero Results

**What goes wrong:** The AI receives "email Rohan Batre" and calls `search_contacts` with `query: "Rohan Batre"`. The SQL searches `first_name ILIKE '%Rohan Batre%'` — which returns zero results because no contact has a first_name of "Rohan Batre". The full-name concatenation path (`first || ' ' || last`) does match, but only if the model passes the full name through the `query` parameter correctly AND the existing SQL includes that path.

**Why it happens:** The `search_contacts` tool description says "The query matches against first name, last name, email, and full name (first + last)" — but Haiku interprets a two-word input as either a full name or a partial match and does not reliably test both decompositions. The model does not know it should try `query: "Rohan"` as a fallback if the full-name search returns nothing.

**Consequences:** Empty search result → model reports "I couldn't find a contact named Rohan Batre" even though Rohan Batre is in the database.

**Prevention:**
- Instruct the model in the system prompt to try first-name-only search as a fallback: "If a full-name search returns no results, retry with just the first name."
- Add a concrete example to the system prompt showing this decomposition pattern.
- Update the `search_contacts` tool description to include: "Tip: If a full name search returns no results, search again with just the first name — the search matches first_name independently."
- Do NOT rely solely on prompt instructions for a critical path — the safest fix also validates the SQL handles `first || ' ' || last ILIKE` concatenation (verify `search_contacts` execution in `tools.py` at line 649).

**Detection:**
- `search_contacts` is called with a two-word query, returns empty, and no follow-up search is attempted
- User says "it couldn't find [name] but they're in my contacts"

**Phase:** Address in Phase 1 (system prompt instruction + tool description). Validate SQL in Phase 1 verification.

---

### Pitfall 3: Ambiguous Matches Silently Select the Wrong Contact

**What goes wrong:** The user says "log a call with John." There are three contacts named John. The model picks the first result from `search_contacts` without asking for clarification, then logs the activity to the wrong contact. The user does not notice until later.

**Why it happens:** The current system prompt says "when intent is clear, use tools immediately" — Haiku interprets multiple-match scenarios as having clear intent (the user clearly wants a contact named John) and selects the first or highest-ranked result without prompting. There is no instruction in the system prompt about what to do when search returns multiple plausible matches.

**Consequences:** Activities, deals, or emails attributed to the wrong contact. This is a data integrity problem that is hard to detect and harder to reverse (requires manual cleanup).

**Prevention:**
- Add an explicit rule: "If search_contacts returns more than one match for a name, list the matches and ask the user to confirm which contact before proceeding."
- Define the threshold clearly: "If there is exactly one match, proceed. If there are zero matches, say so. If there are two or more plausible matches (same first name, same full name, or similar names), always ask."
- Include a few-shot example in the system prompt showing the clarification pattern: user says "John" → model finds 3 Johns → model asks "I found 3 contacts named John: [list]. Which one did you mean?"

**Detection:**
- Tool calls log shows `search_contacts` returned multiple results but was immediately followed by a write tool on the first result
- Users report activities or deals appearing on unexpected contacts

**Phase:** Address in Phase 1 (system prompt clarification rule + example)

---

### Pitfall 4: "Most Recent Contact" / Temporal References Not Resolved

**What goes wrong:** The user says "follow up with my last contact." The model does not know how to resolve "last contact" — it either asks a clarifying question (annoying) or calls `search_contacts` with query "last contact" (returns nothing useful). The `search_contacts` tool has no recency-sort capability exposed.

**Why it happens:** The system prompt handles temporal date references (tomorrow, next Monday) but does not handle temporal *entity* references (last contact, most recent lead, contact I added today). The `search_contacts` tool schema exposes `query`, `source`, and `limit` — no sort order or time filter.

**Consequences:** The AI fails on natural, common real estate agent phrasing. "My last contact" is exactly how an agent would refer to someone after a property showing.

**Prevention:**
- The cleanest fix is adding a `sort_by` or `recent: true` parameter to `search_contacts` so the model can call it with `sort_by: "created_at DESC", limit: 1` for "last contact" and `sort_by: "last_activity_at DESC"` for "most recently active."
- As a prompt-only fallback (lower reliability): instruct the model to call `search_contacts` with no query and limit 1 for "last/most recent contact." This works only if the search defaults to newest-first ordering — verify the SQL.
- Add temporal reference examples to the system prompt: "'my last contact' means the most recently created contact — call search_contacts with no query, sorted by created_at DESC, limit 1."
- Phrases to explicitly document: "last contact," "most recent lead," "new contact I just added," "first contact," "oldest contact."

**Detection:**
- User says "last contact" or "most recent" and model asks a clarifying question or calls search with the literal phrase as a query
- Response contains "I'm not sure which contact you mean" for temporal references

**Phase:** Phase 1 (prompt instruction) + Phase 2 (tool schema enhancement if prompt-only proves insufficient)

---

### Pitfall 5: System Prompt Action-Orientation Conflicts With Resolution Requirements

**What goes wrong:** The existing "be action-oriented" instruction is applied globally. Haiku interprets this as: skip any intermediate step that is not strictly required by the tool's `required` parameter. Since `contact_id` is required for write tools but `search_contacts` is not listed as a prerequisite anywhere, the model skips it.

**Why it happens:** The system prompt gives a general directive without scoping it. The model correctly follows "be action-oriented" — the mistake is that the prompt does not tell it *which* actions are always required before other actions. Anthropic explicitly notes that Haiku/Sonnet "may call tools more eagerly" and that if you want the model to "assess first," you need to prompt it explicitly.

**Consequences:** The action-orientation rule, intended to avoid unnecessary clarifying questions, ends up also suppressing mandatory resolution steps. These two goals (fewer questions, correct entity resolution) require different prompting strategies and will conflict unless explicitly separated.

**Prevention:**
- Separate the two concerns in the system prompt. Keep the action-orientation rule but add a carve-out: "Be action-oriented — once you have a valid contact_id, act immediately. But obtaining the contact_id via search is always the first step and is never optional."
- Use XML tags to make the resolution protocol structurally distinct from general guidelines: wrap contact resolution rules in `<contact_resolution_protocol>` tags so they visually and semantically stand apart from the "be action-oriented" section.
- Haiku responds well to numbered, imperative steps. Format the resolution steps as a numbered list (1. Search. 2. Confirm. 3. Act.) rather than a prose paragraph buried in guidelines.

**Detection:**
- Reading the system prompt — if "action-oriented" appears without explicit contact-search prerequisites, the conflict exists
- Test case: "log a call with Sarah" with only one Sarah in the DB. Does the model search first or guess?

**Phase:** Phase 1 (system prompt restructuring)

---

## Moderate Pitfalls

---

### Pitfall 6: Tool Round Budget Exhausted by Over-Search

**What goes wrong:** The contact resolution improvement adds 1-2 tool rounds per name-referenced request (search, possibly disambiguate). With `MAX_TOOL_ROUNDS = 5`, a complex request ("log a call with Sarah and move her deal to Touring") now requires: search → confirm → log_activity → update_deal → (possibly) get_deal_stages. That is 4-5 rounds minimum, leaving zero budget for edge cases. With disambiguation, it exceeds 5 rounds and the loop exits without completing all actions.

**Why it happens:** The 5-round limit is a safety cap, not a thoughtful budget. It was set before contact resolution consumed tool rounds.

**Consequences:** Multi-action requests that combine contact resolution + multiple writes silently truncate. The model stops mid-task, leaving the user with partial results.

**Prevention:**
- Audit common multi-action request patterns to understand actual round consumption after resolution is added.
- If resolution reliably consumes 1-2 rounds, consider raising `MAX_TOOL_ROUNDS` to 7 or 8 for the general case, or 10 for explicitly flagged complex requests.
- Write the system prompt to encourage batching: "When you have the contact_id, perform all required write operations in sequence without additional clarification."
- Do not raise the limit blindly — first verify the existing 5-round limit is never triggered in current production flows (check logs).

**Detection:**
- Response ends mid-task ("I've logged the call but didn't get to the deal update")
- Tool_calls log shows 5 rounds with a non-terminal tool call as the last entry

**Phase:** Phase 2 (validate after Phase 1 changes land, adjust limit if needed)

---

### Pitfall 7: Contact Context Pre-Load Creates False Confidence

**What goes wrong:** In contact-scoped conversations (when `conversation.contact_id` is set), `_load_contact_context` pre-loads the contact's name, email, and recent activities into the system prompt. This is valuable — but it can cause the model to skip `search_contacts` entirely and directly use the pre-loaded contact_id for any contact reference in that conversation, even when the user is asking about a *different* contact ("what's the deal status for Sarah?" asked inside a conversation scoped to Mike).

**Why it happens:** The system prompt includes `## Current Contact Context` with the scoped contact's details. Haiku pattern-matches "contact" references to whatever is in its context window. There is no instruction distinguishing "the contact this conversation is about" from "a contact the user is currently asking about."

**Consequences:** Actions performed on the wrong contact. Particularly dangerous for write tools (log_activity, update_deal) called with the scoped contact's ID when the user meant someone else.

**Prevention:**
- Add a rule in the contact-scoped system prompt: "This conversation is scoped to [Name]. If the user refers to a different person by name, use search_contacts to find them — do not assume they mean [Name]."
- The scoped context section should be labeled clearly as "the default contact for this conversation" not just "current contact."

**Detection:**
- User asks about a contact by name in a scoped conversation and the model responds with details about the scoped contact
- Write tools are called with the pre-loaded contact_id when the user mentioned a different name

**Phase:** Phase 1 (system prompt scope clarification)

---

### Pitfall 8: Empty Search Results Treated as Definitive "Not Found"

**What goes wrong:** `search_contacts` returns 0 results. The model reports "I couldn't find a contact named [X]" without attempting alternative searches. Common causes: typo in user input ("Rohaan" instead of "Rohan"), wrong name order (user said last name first), or nickname vs. legal name.

**Why it happens:** No retry strategy is specified. The model treats a single empty search as definitive. Haiku does not spontaneously try alternative phrasings without being instructed to.

**Consequences:** Contact exists in the DB but is unreachable via AI, causing user to doubt the system's data quality.

**Prevention:**
- Instruct the model to retry with variations before declaring not found: "If a name search returns no results, try: (1) the first word only, (2) the last word only, (3) ask the user if the spelling might differ."
- Document this in the system prompt as a two-step fallback, not an open-ended retry loop.
- Cap retries at 2 alternative searches to avoid burning tool rounds.

**Detection:**
- `search_contacts` called once with full name, returned 0 results, model immediately reports not found
- No follow-up search in the same tool round chain

**Phase:** Phase 1 (system prompt retry instruction)

---

### Pitfall 9: Existing System Prompt Is Too Long for Haiku to Consistently Follow All Rules

**What goes wrong:** The current system prompt in `agent.py` is approximately 200+ lines covering action-orientation, date handling, task defaults, deal creation, email tools, document search, citation formatting, morning briefings, and response formatting. Adding contact resolution rules to this prompt increases length and reduces the probability that Haiku reliably follows any specific rule — models degrade on instruction-following as prompt length increases, particularly for rules buried mid-document.

**Why it happens:** Feature accretion. Each feature adds instructions. Haiku is weaker on long-context instruction following than Sonnet/Opus. Rules at the end of a very long system prompt are statistically less reliably followed.

**Consequences:** The new contact resolution rules are added but inconsistently followed because they are lost in prompt noise.

**Prevention:**
- Place contact resolution rules near the top of the system prompt (highest attention position), not in the middle of IMPORTANT GUIDELINES.
- Use XML structural tags (`<contact_resolution_protocol>`) to group and highlight the rules — Anthropic's official docs confirm XML tagging reduces misinterpretation for complex prompts.
- Consider splitting the system prompt: a short, high-priority section for agentic rules (resolution, ID handling) and a longer reference section for formatting, document citations, etc.
- After adding resolution rules, test the full system prompt against a test suite of 10+ contact-reference scenarios.

**Detection:**
- Inconsistent behavior — sometimes searches first, sometimes doesn't — despite explicit instructions
- Resolution works in isolation (short system prompt) but fails in production (long system prompt)

**Phase:** Phase 1 (restructure + validate), Phase 2 (ongoing regression testing)

---

## Minor Pitfalls

---

### Pitfall 10: search_contacts Tool Description Undersells Its Capabilities

**What goes wrong:** The current `search_contacts` description says "You can search with a full name like 'John Doe' or just a first/last name." This is passive documentation. It does not instruct the model *when* to use which search strategy, which is the actual behavioral gap.

**Prevention:** Rewrite the description as imperative guidance: "Always call this tool before using any contact_id. Search with the full name first; if no results, retry with first name only, then last name only." Tool descriptions are injected into the API call's tool schema — Haiku reads them during every tool selection decision.

**Phase:** Phase 1

---

### Pitfall 11: No Feedback Loop on Resolution Failures

**What goes wrong:** When the model guesses a contact_id and the tool returns an error, the error message ("contact not found" from the DB) is fed back into the agent loop but the model may simply apologize rather than retry with a search. There is no instruction on what to do when a tool call fails due to a missing entity.

**Prevention:** Add a rule: "If any tool returns an error indicating a contact or entity was not found, immediately call search_contacts with the name or description the user provided and retry the operation with the correct ID."

**Phase:** Phase 1 (system prompt error recovery rule)

---

### Pitfall 12: Confirmation Cards for Write Tools Add Latency to Resolution Flow

**What goes wrong:** Write tools require user confirmation via the pending_actions / confirmation card flow. In a multi-step resolution scenario (search → found 3 matches → user picks → write tool → confirmation card), the UX has two interruption points: the disambiguation question and the write confirmation. This double-interrupt frustrates users.

**Why it happens:** The confirmation system was designed before resolution disambiguation was needed. The two systems are independent.

**Consequences:** User experience degradation for any name-ambiguous write operation. Not a data-correctness problem, but a UX regression that reduces adoption.

**Prevention:**
- Design the disambiguation flow to feel like part of the confirmation card, not a separate step
- Or: allow write tool confirmation cards to include contact selection if the resolution step was triggered in the same round
- At minimum, acknowledge in roadmap planning that disambiguation adds a conversational turn before the confirmation card

**Phase:** Phase 2 (UX polish), not blocking Phase 1 correctness work

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| System prompt changes | Action-orientation rule conflicts with search-first requirement (Pitfall 5) | Explicitly scope both rules; use XML tags |
| Tool description updates | Passive documentation that describes but does not instruct (Pitfall 10) | Rewrite as imperative directives |
| Name parsing instruction | Full-name search fails silently with no fallback (Pitfall 2) | Add explicit retry instruction with first-name-only fallback |
| Ambiguity handling | Model silently selects first match from multiple results (Pitfall 3) | Add explicit multi-match clarification rule with threshold |
| Temporal references | "My last contact" not resolvable with current tool schema (Pitfall 4) | Prompt fix first; schema enhancement if insufficient |
| Tool round budget | Resolution adds 1-2 rounds per request, may exhaust 5-round limit (Pitfall 6) | Audit before raising limit |
| Contact-scoped conversations | Pre-loaded context used for wrong-contact references (Pitfall 7) | Scope boundary instruction in system prompt |
| Prompt length growth | New rules buried in 200+ line prompt, inconsistently followed (Pitfall 9) | Structural XML tagging + top placement |

---

## Sources

- [Anthropic Prompting Best Practices (official, current)](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — HIGH confidence: Haiku infers missing parameters, Opus seeks clarification; tool descriptions as imperative directives; XML structuring; action-orientation tuning for eager models
- [Anthropic Tool Use Implementation Guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) — HIGH confidence: `disable_parallel_tool_use`, `tool_choice` for enforcing sequential pipelines, content block ordering, model-specific tool behavior
- [What We've Learned From A Year of Building with LLMs (Applied LLMs)](https://applied-llms.org/) — MEDIUM confidence: monolithic prompts vs. decomposed steps; LLMs return output even when they shouldn't; data-driven debugging of edge cases
- [CRMArena: LLM Agents in CRM Tasks (ACL 2025)](https://aclanthology.org/2025.naacl-long.194.pdf) — MEDIUM confidence: significant performance drops in multi-turn CRM settings; near-zero inherent confidentiality/entity awareness improvable with prompting
- Direct codebase analysis (`ai-service/app/services/agent.py`, `ai-service/app/tools.py`) — HIGH confidence: current system prompt structure, tool definitions, and MAX_TOOL_ROUNDS identified as sources of observed failure modes
