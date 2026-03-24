# Feature Landscape: AI Contact Resolution

**Domain:** CRM AI assistant — contact entity resolution in a tool-calling agentic loop
**Researched:** 2026-03-24
**Milestone:** AI Contact Intelligence — improving contact resolution in CloAgent

---

## Context

This research covers features specific to how CRM AI assistants resolve contact references in natural language. The existing CloAgent AI already has 34 tools and a working system prompt. The problem is narrowly defined: the agent fails to reliably resolve contact identities before acting on them. Features below are scoped to that problem only.

---

## Table Stakes

Features users expect from any CRM AI assistant that handles contact references. Missing any of these causes visible failures and frustrates users immediately.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Full name splitting** | "Email Rohan Batre" is the most natural way to address a contact — expecting the user to know the AI needs a first name only is unreasonable | Low | Split on last whitespace; search by first name, confirm against last name in results |
| **Partial name search before acting** | Users say "call John" not "call John Smith UUID-abc123" — any competent assistant resolves first | Low | Always call `search_contacts` when a name is mentioned; never pass an assumed UUID |
| **Recency resolution ("my last contact")** | Users expect the AI to know their recent work without spelling it out | Low-Med | `search_contacts` with `limit=1` sorted by `created_at DESC`, or `get_all_activities` for `last_activity_at` |
| **Ambiguity clarification** | Multiple "John" contacts must produce a clarifying question, not a random pick | Low | Present match list (name, source, last activity) and ask user to confirm — max 3 candidates shown |
| **Never guess a UUID** | Passing a hallucinated UUID to `get_contact_details`, `log_activity`, etc. silently operates on the wrong record or 404s | Low | System prompt rule: "Never pass a contact_id you did not receive from a tool result in this conversation" |
| **Confirm single match before write** | Even a confident single match should be named back to the user before a write tool fires ("Logging call for Rohan Batre — confirming that's who you meant?") | Low | Read-ops can proceed silently; write-ops name the resolved contact in the confirmation card |
| **Graceful not-found handling** | When a name finds zero matches, tell the user instead of erroring or hallucinating | Low | Return "I searched for [name] but didn't find a match. Did you mean someone else, or would you like to create a new contact?" |

---

## Differentiators

Features beyond the baseline that would make CloAgent's AI noticeably better than a generic CRM chatbot.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Contextual pronoun resolution** | User says "follow up with her" after a conversation about Sarah — the AI tracks context and resolves "her" without re-searching | Medium | Carry resolved `contact_id` in conversation state for the last explicitly confirmed contact; use as implicit subject for follow-up turns |
| **Ranked candidate display** | When multiple contacts match "John", show them ranked by recency of activity (most active first) rather than alphabetically — the user usually means the one they've been working with lately | Medium | Sort `search_contacts` results by `last_activity_at DESC` before presenting options |
| **First-name-only smart routing** | "Email Rohan" where only one Rohan exists should proceed without a confirmation question — only ask if 2+ matches | Low | Single match = proceed with name confirmation in action card; multiple = ask |
| **Source-aware disambiguation** | "The Zillow lead named Mike" narrows the search — pass `source: "Zillow"` alongside the name query | Low | Extract source hints from user message and pass to `search_contacts` as `source` filter |
| **Relative-recency references** | "my newest contact", "the contact I added last week", "the lead from Tuesday" — map these to DB queries rather than asking the user | Medium | Extend the recency logic in system prompt with date math (already used for task dates) |
| **Few-shot examples in system prompt** | Showing the model 2-3 worked examples of the resolve-then-act pattern dramatically improves Haiku's consistency vs abstract rules alone | Low | Anthropic docs confirm 3-5 examples outperform rule-only prompts for Haiku-class models |

---

## Anti-Features

Things to deliberately not build, with rationale.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Fuzzy/phonetic search backend** | The PROJECT.md explicitly calls this out of scope; ILIKE is sufficient for the actual failure modes | Fix the AI prompt layer, not the SQL layer |
| **Persistent "last resolved contact" memory across sessions** | Cross-session state tracking adds scope and complexity; within-session pronoun resolution is enough for now | Resolve within a single conversation turn using context |
| **Confidence scores exposed to user** | "I'm 78% sure this is Rohan" adds noise without value — users want the AI to either act or ask, not hedge with percentages | Binary: confident single match acts, uncertain asks |
| **Contact deduplication / merge** | Detecting that "Bob Smith" and "Robert Smith" are the same person is a separate data quality problem | Out of scope for this milestone |
| **Entity resolution across other record types** | This milestone is contacts-only; resolving deal names, property addresses, etc. is a different problem | Future milestone |
| **Typeahead / autocomplete UI changes** | This is AI behavior work, not frontend work; the system prompt approach must work within existing UI | No UI changes required |
| **Retry loops with reformulated queries** | More than one search retry per contact reference burns tool rounds (max 5 total); simple first-name then fallback is enough | Single search with best query, then ask if empty |

---

## Feature Dependencies

```
Partial name search (table stakes)
  → Full name splitting (feeds query construction)
  → Recency resolution (alternative path when no name given)
  → First-name-only smart routing (builds on single-match detection)
  → Ranked candidate display (builds on multi-match detection)

Never guess UUID (table stakes)
  → Confirm single match before write (builds on resolved UUID being explicit)

Graceful not-found handling (table stakes)
  → All other features (final fallback when no resolution path succeeds)

Contextual pronoun resolution (differentiator)
  → Requires: Confirm single match before write (must have resolved a contact first)

Source-aware disambiguation (differentiator)
  → Requires: Partial name search (extends the search call, not a replacement)

Few-shot examples in system prompt (differentiator)
  → No dependencies — purely additive to any of the above
```

---

## MVP Recommendation

Prioritize in this order for maximum user-visible impact with minimum scope:

1. **Never guess a UUID** — system prompt rule addition; zero new code, prevents silent wrong-record actions
2. **Partial name search before acting** — system prompt rule; the most common failure mode (Rohan Batre case)
3. **Full name splitting** — system prompt instruction + example; fixes "Rohan Batre" → search("Rohan") pattern
4. **Graceful not-found handling** — system prompt instruction; turns cryptic tool errors into useful responses
5. **Recency resolution** — system prompt instruction; fixes "my last contact" pattern
6. **Ambiguity clarification** — system prompt instruction + example; fixes multi-match case

All six table stakes features are achievable via system prompt and tool description changes only — no new backend code needed.

**Defer to later:**
- Contextual pronoun resolution — adds scope, harder to test reliably with Haiku 4.5
- Ranked candidate display — needs `last_activity_at` sort in `search_contacts` tool, minor backend change
- Few-shot examples — high value but adds prompt length; add after core rules are confirmed working

---

## Implementation Notes

### System Prompt Pattern (HIGH confidence)

Anthropic's official Claude 4.5/Haiku prompting guide confirms:

- Use numbered sequential steps for ordered procedures — critical for "search then resolve then act"
- Add context/rationale to rules ("Never pass an assumed UUID because Haiku will silently use wrong records")
- 3-5 worked examples outperform abstract rules alone for consistency
- XML tags (`<contact_resolution_rules>`) help Haiku parse complex sections unambiguously
- Instructions that say "if X then Y, else Z" work better than general "try to resolve" vagueness

### Tool Description Pattern (HIGH confidence)

The `search_contacts` tool description already states it supports full-name search. Adding explicit "call this first whenever a contact name is mentioned" language to the description (not just the system prompt) reinforces the behavior at the point where the model chooses tools.

### Haiku 4.5 Constraint (MEDIUM confidence)

Haiku 4.5 is a speed-optimized model. Research and Anthropic docs indicate:
- It follows explicit sequential step instructions reliably
- It struggles more than Opus/Sonnet with multi-hop reasoning when instructions are vague
- Few-shot examples help significantly for Haiku-class models
- The fix-via-system-prompt approach is specifically suited to Haiku's instruction-following strengths

---

## Sources

- [Anthropic Claude 4.x Prompting Best Practices](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices) — HIGH confidence (official docs)
- [Disambiguation in Conversational QA — ACL Survey 2025](https://arxiv.org/html/2505.12543v1) — MEDIUM confidence (academic, confirms query rewriting + clarifying questions as standard disambiguation strategies)
- [Agentic AI Tool-Use Pattern](https://machinelearningmastery.com/7-must-know-agentic-ai-design-patterns/) — MEDIUM confidence (confirms ReAct / search-before-act as standard agentic pattern)
- Codebase inspection: `ai-service/app/services/agent.py`, `ai-service/app/tools.py` — HIGH confidence (direct inspection of current system prompt and tool definitions)
- PROJECT.md constraints — HIGH confidence (defines what is explicitly out of scope)
