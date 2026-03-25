# Architecture Patterns: AI Contact Resolution Pipeline

**Domain:** AI agent contact resolution in an existing CRM
**Researched:** 2026-03-24
**Confidence:** HIGH — based on direct codebase inspection of the live system

---

## Current State (Baseline)

### What Exists

The system is a three-tier architecture: Next.js frontend → Go backend → Python AI service. The relevant components for contact resolution all live in the AI service:

| File | Role in Resolution |
|------|--------------------|
| `ai-service/app/services/agent.py` | System prompt construction + agentic loop (5 tool-round cap) |
| `ai-service/app/tools.py` | `search_contacts` tool definition (line 36–48) + `_search_contacts` implementation (line 649) |

### Current Failure Mode

The AI is asked "email Rohan" or "follow up with my last contact." The failure is a **missing resolve step**, not a missing capability:

1. `search_contacts` already handles ILIKE across `first_name`, `last_name`, `email`, and full-name concatenation
2. The SQL correctly returns contacts ordered by `created_at DESC` (recency built in)
3. The system prompt says "be action-oriented — use tools immediately" without explaining _which tool to use first_
4. Haiku 4.5 interprets "action-oriented" as: skip search, attempt to call `log_activity` or `send_email` directly with no contact_id, which fails silently

The problem is a **prompt gap**, not a schema or SQL gap.

---

## Recommended Architecture

### Component Boundaries

| Component | Location | Responsibility | Changes Needed |
|-----------|----------|---------------|----------------|
| **Contact Resolution Protocol** | `agent.py` system prompt | Tell the AI the exact search → resolve → act sequence | ADD — missing entirely |
| **`search_contacts` tool description** | `tools.py` TOOL_DEFINITIONS[1] | Advertise the full-name and recency query capabilities | IMPROVE — current description undersells what the tool can do |
| **`search_contacts` schema** | `tools.py` TOOL_DEFINITIONS[1] | Expose `sort_by` and `recency` query patterns | OPTIONALLY EXTEND |
| **Ambiguity response protocol** | `agent.py` system prompt | Tell the AI how to handle 0 results and multiple matches | ADD — missing entirely |
| **Agentic loop** | `agent.py` `run_agent()` | No change needed — 5-round limit is sufficient | NO CHANGE |
| **`_search_contacts` SQL** | `tools.py` line 649 | Already correct — ILIKE + `ORDER BY created_at DESC` | NO CHANGE |

### Data Flow: Contact Resolution Pipeline

```
User message: "email Rohan about the showing tomorrow"
        |
        v
[STEP 1: RESOLVE]  (tool round 1)
  AI calls search_contacts(query="Rohan")
  SQL: ILIKE match on first_name/last_name/email/full_name
  Returns: [{id, first_name, last_name, email, ...}, ...]
        |
        v — 0 results? → AI tells user "no contact found matching Rohan"
        v — 1 result?  → proceed to STEP 2
        v — N results? → AI lists names, asks user to clarify which one
        |
        v
[STEP 2: ACT]  (tool round 2)
  AI calls send_email / draft_email with contact_id from step 1
  OR calls log_activity, update_deal, etc. with resolved UUID
        |
        v
[STEP 3: CONFIRM]  (if write tool)
  Existing confirmation flow (pending_actions table + frontend card)
  No change needed
```

### Data Flow: Recency Reference ("my last contact")

```
User message: "follow up with my last contact"
        |
        v
[RESOLVE — recency query]  (tool round 1)
  AI calls search_contacts(query="", limit=1)
  SQL: ORDER BY c.created_at DESC LIMIT 1
  Returns: [{id, first_name, last_name, ...}]
        |
        v
[ACT]  (tool round 2)
  AI uses returned contact_id for the action
```

The key insight: `search_contacts` with an empty query and limit=1 already returns the most recently added contact. This is latent capability the AI doesn't know to use.

### Data Flow: Multi-Word Name ("Rohan Batre")

```
User message: "update Rohan Batre's deal"
        |
        v
[RESOLVE — full name]  (tool round 1)
  AI calls search_contacts(query="Rohan Batre")
  SQL: (c.first_name || ' ' || c.last_name) ILIKE '%Rohan Batre%'
  Returns: [{id: "uuid-xyz", first_name: "Rohan", last_name: "Batre", ...}]
        |
        v
[ACT]  (tool round 2)
  AI calls update_deal(deal_id=...) — needs list_deals(contact_id="uuid-xyz") first
  That's tool round 3 if deal_id not known — still within 5-round budget
```

---

## Where Changes Go

### Priority 1: System Prompt — `agent.py` `_build_system_prompt()`

This is the highest-leverage change. Add a dedicated **CONTACT RESOLUTION RULES** block to the base prompt, placed _before_ "IMPORTANT GUIDELINES" so it isn't overshadowed.

The block must cover:
1. **Always search first** — any message referencing a person by name requires `search_contacts` before any other contact tool
2. **Full name pass-through** — pass "John Smith" as-is to query; the SQL handles full-name concatenation
3. **Recency pattern** — "my last contact / most recent contact / the contact I just added" → `search_contacts(query="", limit=1)`
4. **Zero results** — tell the user clearly; do NOT guess or invent a contact_id
5. **Single result** — use it without asking for confirmation (don't slow down the happy path)
6. **Multiple results** — list names + key info, ask user which one to use; do NOT pick arbitrarily

Placement within `_build_system_prompt()`:
```
base = (
    "You are CloAgent AI..."
    "CONTACT RESOLUTION RULES:\n"    <-- NEW BLOCK, inserted before IMPORTANT GUIDELINES
    "...\n\n"
    "IMPORTANT GUIDELINES:\n"
    "..."
)
```

### Priority 2: `search_contacts` Tool Description — `tools.py` TOOL_DEFINITIONS

The current description (line 38) mentions full-name search as a footnote. It does not mention:
- Empty query = returns all contacts ordered by recency
- "Most recent" pattern
- What to expect from multi-result returns

Rewrite to be explicit about these query patterns so Haiku understands its full capability. Tool descriptions are part of the model's context — they matter for small models.

### Priority 3: `search_contacts` Input Schema — `tools.py` TOOL_DEFINITIONS (optional)

Current schema has `query`, `source`, `limit`. No explicit recency or sort parameter.

Option A (simpler): Do nothing — instruct the AI in the system prompt to use `limit=1` for recency. Zero code change to schema.

Option B (clearer intent): Add a `sort_by` property with values `"recent"` or `"name"` and handle in `_search_contacts`. This makes the AI's intent explicit in structured form rather than relying on `limit=1` convention.

**Recommendation: Option A first.** If testing shows Haiku still gets recency wrong, graduate to Option B in a follow-on phase. Don't add complexity until the simpler path is proven insufficient.

---

## Implementation Order

### Phase 1 — System Prompt (touches 1 file, no schema change)

1. Add `CONTACT RESOLUTION RULES` block to `_build_system_prompt()` in `agent.py`
2. Rewrite `search_contacts` tool description in `TOOL_DEFINITIONS` in `tools.py`
3. Test: "email Rohan", "my last contact", "Rohan Batre", "John" (multiple matches)

This phase closes the majority of the gap. Haiku 4.5 follows explicit protocol instructions reliably when they are unambiguous.

### Phase 2 — Edge Case Hardening (if Phase 1 testing reveals gaps)

Only build if Phase 1 testing exposes a specific failure mode:

- **Partial-name ambiguity** — multiple contacts named "John": system prompt coverage in Phase 1 should handle this, but if not, a dedicated `resolve_contact` read tool (wrapping `search_contacts` with different output framing) could make the pattern more explicit
- **Recency misfires** — if `limit=1` pattern is unreliable, add `sort_by` to `search_contacts` schema
- **Context-scoped conversations** — contact-scoped conversations already pre-load contact context in `_load_contact_context()`; the AI in these conversations should not need to search at all. Phase 2 could add an explicit note to the resolution rules: "If you are in a contact-scoped conversation (contact context is shown in the system prompt), use that contact's UUID directly — do not call search_contacts."

---

## Tool Round Budget Analysis

With the 5-round cap, contact resolution is viable:

| Scenario | Rounds Used | Rounds Left for Action |
|----------|------------|----------------------|
| Clear single match (search → act) | 2 | 3 |
| Need deal ID (search → list_deals → act) | 3 | 2 |
| Ambiguous match (search → ask user → done) | 1 (awaits reply) | 5 fresh rounds next message |
| Contact-scoped conversation (no search needed) | 0 | 5 |

Contact resolution costs 1-2 rounds at most. The 5-round limit is not a constraint here.

---

## Patterns to Follow

### Pattern: Explicit Protocol in System Prompt

Small models (Haiku class) follow step-by-step protocols better than general principles. Instead of:

> "Be action-oriented and search for contacts before acting"

Use numbered steps:

> "CONTACT RESOLUTION RULES — follow these in order:
> 1. When a user references a person by name, call search_contacts FIRST
> 2. If 0 results: tell the user no match was found
> 3. If 1 result: use that contact_id — no need to confirm the match
> 4. If multiple results: list them and ask which one to use"

This leaves no ambiguity about what "action-oriented" means for contact operations.

### Pattern: Tool Description as Capability Advertisement

Tool descriptions inform the model what a tool can do. For search_contacts, explicitly listing the patterns ("empty query returns most recent", "full name searches work", "email address works") teaches Haiku that these query forms are valid without requiring additional tool calls.

### Anti-Pattern: New Tool for Solved Problem

Do not create a `get_most_recent_contact` tool. The capability already exists in `search_contacts(query="", limit=1)`. Adding a new tool adds schema tokens and gives the model another choice to reason about. Document the pattern in the description and system prompt instead.

### Anti-Pattern: Backend Changes for a Prompt Problem

The SQL in `_search_contacts` is correct. ILIKE on full-name concatenation handles multi-word names. `ORDER BY created_at DESC` handles recency. No backend or migration changes are needed for this milestone.

---

## Scalability Considerations

| Concern | Current | If Contact Count Grows |
|---------|---------|------------------------|
| ILIKE search performance | Fine for typical CRM (< 10K contacts) | Add index on `lower(first_name || ' ' || last_name)` if needed |
| Ambiguous match resolution | 1 round asking user | Same — user interaction is the right resolution |
| Tool round budget | 5 rounds sufficient | No change needed |

---

## Files That Change

| File | Change Type | What Changes |
|------|-------------|-------------|
| `ai-service/app/services/agent.py` | EDIT | Add `CONTACT RESOLUTION RULES` block in `_build_system_prompt()` |
| `ai-service/app/tools.py` | EDIT | Rewrite `search_contacts` description in `TOOL_DEFINITIONS` |

No other files change. No migrations. No new endpoints. No frontend changes.

---

## Sources

- Direct inspection of `ai-service/app/services/agent.py` (full file)
- Direct inspection of `ai-service/app/tools.py` lines 36–48, 649–684
- `.planning/PROJECT.md` — requirements and constraints
- `CLAUDE.md` — system architecture and constraint context
