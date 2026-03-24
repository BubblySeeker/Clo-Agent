# Phase 1: Core Resolution Protocol - Research

**Researched:** 2026-03-24
**Domain:** LLM system prompt engineering, Claude Haiku 4.5 instruction following, tool use patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** When multiple contacts match, present a numbered list (max 3) with name, email, and source. Ask the user to pick.
- **D-02:** When exactly one contact matches a partial name, act immediately without confirming.
- **D-03:** When zero contacts match, tell the user no match was found and suggest checking the spelling.
- **D-04:** "My last contact" = most recently created contact. Use `created_at DESC` with `limit=1` and no query. No tool schema changes needed.
- **D-05:** Conversation memory is prompt-only. System prompt rule tells the AI to use contact_id from previous search results when the user refers to a contact discussed earlier. The 20-message history window is sufficient — no state tracking mechanism needed.

### Claude's Discretion

- Prompt placement and format (XML tags, where in prompt, how directive)
- Exact wording of system prompt rules and tool description changes

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RES-01 | AI always calls search_contacts before using a contact_id — never guesses/fabricates UUIDs | Existing "NEVER fabricate UUIDs" rule in prompt (line 177) is a precedent; new XML-tagged section will strengthen this specifically for contact_id |
| RES-02 | AI splits multi-word name references into searchable terms ("Rohan Batre" → query that matches first+last) | search_contacts ILIKE already matches "first_name \|\| ' ' \|\| last_name" — the fix is prompt instruction to pass full name as query string |
| RES-03 | AI resolves recency references via search_contacts with limit=1, no query | D-04 locked: no SQL changes; prompt rule covers this case |
| RES-04 | AI resolves partial name references by searching and selecting best match | D-02 locked: single match = act; prompt rule covers disambiguation logic |
| RES-05 | AI presents top-3 ranked candidates when multiple matches exist | D-01 locked: numbered list with name, email, source |
| RES-06 | AI handles zero results gracefully | D-03 locked: report no match, suggest checking spelling |
| CTX-02 | AI skips search_contacts in contact-scoped conversations and uses known UUID directly | Contact context already injected by `_load_contact_context()`; prompt rule must explicitly exempt this case |
| CTX-03 | AI uses contact_id from earlier in the conversation when user refers back | D-05 locked: prompt-only rule; 20-message history is sufficient |
| SAFE-01 | All existing AI interactions continue working without regression | New rules scoped to contact resolution; morning briefing, deals, tasks untouched |
| SAFE-02 | Contact resolution adds at most 1 extra tool round | Single search_contacts call before acting; stays within 5-round budget |
| SAFE-03 | System prompt changes use XML tags and are placed near the top | Locked by decision; XML tag placement verified as correct approach |
</phase_requirements>

---

## Summary

This phase is purely a prompt engineering task. The backend SQL (`search_contacts` ILIKE query) already handles full name, partial name, and recency lookups correctly — the problem is that Haiku 4.5 does not consistently call `search_contacts` before using a contact_id, and sometimes fabricates UUIDs. The fix is to add a structured `<contact_resolution>` section near the top of the system prompt in `agent.py` and sharpen the `search_contacts` tool description in `tools.py`.

The system prompt currently has an established precedent: the line "NEVER generate, guess, or fabricate UUIDs" (line 177) exists for document citations. The new contact resolution rules extend this pattern specifically for contact operations. The prompt already uses ALL-CAPS section headers with no XML tags — SAFE-03 locks in the decision to introduce XML tags for the new section, which aligns with Anthropic's own official guidance that XML tags trigger Claude's native pattern recognition for complex instruction following.

The key implementation risk (noted in STATE.md) is token budget pressure: adding ~400–600 tokens to a long prompt may push lower-priority rules (mid-document) out of Haiku's effective attention. Mitigation is XML wrapping and top-of-prompt placement — both of which are locked decisions.

**Primary recommendation:** Add one `<contact_resolution>` XML block immediately after the opening role/date statement, before "IMPORTANT GUIDELINES:", covering all 5 decision rules (D-01 through D-05). Sharpen the `search_contacts` tool description to call out recency resolution and partial-name handling explicitly.

---

## Standard Stack

No new libraries are introduced in this phase. All changes are to Python string literals in existing files.

### Files Being Modified

| File | Location | Change Type |
|------|----------|-------------|
| `agent.py` | `ai-service/app/services/agent.py` | System prompt addition (~400 tokens) |
| `tools.py` | `ai-service/app/tools.py` | Tool description string update (search_contacts, line 38) |

### Supporting Context

| Fact | Detail | Confidence |
|------|--------|------------|
| Max tool rounds | 5 (`MAX_TOOL_ROUNDS = 5` in agent.py line 29) | HIGH — read from source |
| Conversation history window | Last 20 messages (agent.py line 46) | HIGH — read from source |
| Contact-scoped detection | `conversation_row.get("contact_id")` (agent.py line 284) | HIGH — read from source |
| ILIKE full-name match | `(c.first_name \|\| ' ' \|\| c.last_name) ILIKE %s` (tools.py line 665) | HIGH — read from source |
| Default sort | `ORDER BY c.created_at DESC` (tools.py line 679) | HIGH — read from source |
| Existing UUID safety rule | Line 177: "NEVER generate, guess, or fabricate UUIDs" | HIGH — read from source |

---

## Architecture Patterns

### Current System Prompt Structure

```
[Role + date sentence]
[capability summary]

IMPORTANT GUIDELINES:
- [bullet rules, ~15 items]

RESPONSE FORMATTING:
- [bullet rules, ~10 items]

MORNING BRIEFING:
[multi-paragraph section]

[Gmail status block — appended conditionally]
[contact_context — appended if contact-scoped]
[document awareness — appended if docs exist]
```

No XML tags anywhere in the current prompt. All sections use ALL-CAPS headers followed by bullet lists.

### Recommended Addition: XML-Tagged Contact Resolution Block

**Placement:** Insert immediately after the opening role/date/capability sentence block, before the "IMPORTANT GUIDELINES:" section. This is the highest-attention position in the prompt — Haiku processes earlier content most reliably.

**Pattern:** Wrap in a single `<contact_resolution>` XML block. Anthropic's official documentation confirms XML tags are "native pattern recognition triggers" for Claude — they create hard logical boundaries during processing, unlike ALL-CAPS headers which are stylistic. The existing prompt already has a clear precedent for NEVER-style rules (UUID fabrication on line 177); the new block extends this to contact resolution.

**Why XML over ALL-CAPS section:** The existing ALL-CAPS sections are guidance sections. The new contact resolution rules are behavioral contracts — they must fire before any tool call involving a contact. XML tags signal to Haiku that this content requires strict compliance, not style guidance.

### Pattern: Contact Resolution XML Block

```python
# Source: agent.py _build_system_prompt() — insert before IMPORTANT GUIDELINES
contact_resolution_block = (
    "<contact_resolution>\n"
    "CONTACT RESOLUTION PROTOCOL — follow this before every contact operation:\n\n"
    "1. ALWAYS call search_contacts before using a contact_id in any tool. "
    "Never guess, invent, or reuse a UUID you are not certain is current.\n\n"
    "2. FULL NAME SEARCH: When the user mentions a person by name (e.g. 'Rohan Batre'), "
    "pass the full name as the query parameter. The search matches first name, last name, "
    "and full name — 'Rohan Batre' will match the contact with first_name='Rohan' and last_name='Batre'.\n\n"
    "3. PARTIAL NAME SEARCH: When the user mentions only a first or last name (e.g. 'email Rohan'), "
    "call search_contacts with that name as the query.\n"
    "   - If exactly 1 result: use it immediately. No confirmation needed.\n"
    "   - If 2+ results: list up to 3 candidates as a numbered list showing name, email, and source. "
    "Ask the user to pick by number before proceeding.\n"
    "   - If 0 results: tell the user no contact was found with that name and suggest checking the spelling.\n\n"
    "4. RECENCY REFERENCE: When the user says 'my last contact', 'most recent contact', or similar, "
    "call search_contacts with no query and limit=1. The results are sorted by creation date descending — "
    "the first result is the most recently added contact.\n\n"
    "5. CONTACT-SCOPED CONVERSATIONS: If this conversation already has a contact context loaded above "
    "(shown under '## Current Contact Context'), use that contact's UUID directly. "
    "Do not call search_contacts again for the same contact.\n\n"
    "6. CONVERSATION MEMORY: If the user already asked about a contact earlier in this conversation "
    "and you have their contact_id from a previous search_contacts result, use that UUID directly for "
    "follow-up actions. Example: user searched for 'Rohan' 2 messages ago — 'create a deal for him' "
    "should use Rohan's contact_id without searching again.\n"
    "</contact_resolution>\n\n"
)
```

### Pattern: Updated search_contacts Tool Description

The current description (tools.py line 38) is accurate but does not hint at recency or partial-name use cases. Update it to include explicit usage signals:

```python
# Current (tools.py line 37-38):
"description": "Search for contacts by name, email, or filter by source. ..."

# Recommended update:
"description": (
    "Search for contacts by name, email, or filter by source. "
    "Use this tool before any operation that needs a contact_id — never guess UUIDs. "
    "The query matches against first_name, last_name, email, and full name (first + last concatenated). "
    "Pass a full name like 'Rohan Batre' or just a partial name like 'Rohan'. "
    "For recency references ('my last contact'), call with no query and limit=1 — results are sorted newest first. "
    "Returns: id, first_name, last_name, email, source, created_at, last_activity_at."
)
```

### Anti-Patterns to Avoid

- **Placing the resolution block at the end of the prompt:** Haiku's attention weakens at mid-to-late document positions for instruction-following content. Top placement is essential (supported by Anthropic's own guidance: "put longform data at the top").
- **Using only bullet points without XML tags:** The existing ALL-CAPS sections use bullets and are guidance; they can be deprioritized. XML-tagged content triggers different processing — use XML for the behavioral contract.
- **Over-specifying with multiple XML blocks:** One `<contact_resolution>` block is cleaner than fragmenting into `<rule_1>`, `<rule_2>`, etc. Claude processes tagged sections as units.
- **Changing the tool schema:** D-04 locks this out of scope. The SQL already handles recency via `ORDER BY created_at DESC` — no schema change needed.
- **Adding confirmation flows for resolution:** D-02 locks single-match behavior as act-immediately. Do not introduce an extra confirmation step for unambiguous single matches.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-name splitting ("Rohan Batre" → first=Rohan last=Batre) | Custom parsing of the user's message | Pass the full name as the `query` parameter to search_contacts | The SQL already does `(first_name \|\| ' ' \|\| last_name) ILIKE %s` — full name works as-is |
| Recency resolution | New backend endpoint or SQL sort change | search_contacts with no query + limit=1 | Already sorted `ORDER BY created_at DESC` |
| Ambiguity tracking | Stateful session storage or new DB table | 20-message conversation history window | Claude can read contact_id from its own tool_result in the last 20 messages |
| UUID validation | Client-side UUID regex check | Prompt rule "never guess a UUID" | Behavioral fix is cheaper and sufficient for Haiku 4.5 |

**Key insight:** Every resolution behavior the requirements specify can be expressed as a prompt rule applied to an already-correct SQL query. The entire fix is vocabulary — teaching the model when and how to call the tool it already has.

---

## Common Pitfalls

### Pitfall 1: Haiku Skips the New Rules for Familiar Tasks
**What goes wrong:** Haiku has strong learned patterns for "email person X" → call send_email directly. The new contact_resolution block must override this learned behavior.
**Why it happens:** Fine-tuning on millions of tool-use examples creates strong priors. Rules added at the bottom of a long prompt often lose to priors.
**How to avoid:** Place `<contact_resolution>` near the top of the prompt, before any other behavioral guidelines. The Anthropic docs confirm "queries at the end can improve response quality" for long-context document tasks — but for behavioral instructions, early placement is better.
**Warning signs:** During testing, watch for the AI calling `log_activity` or `send_email` with a fabricated UUID in the first tool round (no search_contacts call preceding it).

### Pitfall 2: Contact-Scoped Conversations Double-Searching
**What goes wrong:** When a conversation has `contact_id` pre-loaded (the `_load_contact_context()` injection at agent.py line 285), the new resolution rules might cause the AI to call search_contacts anyway, wasting a tool round.
**Why it happens:** The resolution rules say "ALWAYS call search_contacts" without an exception for pre-loaded context.
**How to avoid:** Rule 5 in the contact_resolution block must explicitly state "If a contact context is already loaded above, use that UUID directly — do not search again." This matches CTX-02.
**Warning signs:** Two-round patterns in contact-scoped conversations where round 1 is search_contacts and round 2 is the actual action.

### Pitfall 3: Multiple Matches Consume Extra Tool Rounds
**What goes wrong:** If the AI calls search_contacts (round 1), gets multiple results, asks user to pick (round 2 text response), then the user replies, that's a new message/round. The 5-round budget is per message, not conversation — this is fine.
**Why it happens:** Misunderstanding of the round budget scope.
**How to avoid:** Clarify in the prompt that listing candidates and asking the user is a valid terminal action for a message. No tool round is consumed by the text response listing candidates.
**Warning signs:** None — this is expected behavior. SAFE-02 says "at most 1 extra tool round" for resolution, which is accurate: search_contacts is round 1, then the action is round 2.

### Pitfall 4: Token Budget Pressure Degrades Other Rules
**What goes wrong:** Adding ~400-600 tokens to an already long system prompt causes Haiku to give less attention to rules that appear later (MORNING BRIEFING section, RESPONSE FORMATTING rules).
**Why it happens:** Haiku 4.5 is a smaller model; attention degrades in very long prompts.
**How to avoid:** The new block goes before "IMPORTANT GUIDELINES" not appended at the end. This maintains the attention position of existing rules. Total prompt length increase is manageable (~5-8% of current size).
**Warning signs:** After shipping, test the morning briefing flow and formatting rules — if bullet formatting regresses or morning briefing skips tools, the prompt may need pruning elsewhere.

### Pitfall 5: Parallel Tool Calls Bypass Resolution
**What goes wrong:** Haiku might call search_contacts AND send_email in the same tool round (parallel tool use), with the email using a fabricated UUID before search results arrive.
**Why it happens:** Claude's latest models are trained to parallelize tool calls aggressively. This is normally desirable but dangerous when tool B depends on tool A's output.
**How to avoid:** The contact_resolution block should include: "Do not call any contact-dependent tool in the same round as search_contacts. Wait for search results before using a contact_id." This matches the existing sequential pattern in the agent loop (tool results are fed back before the next round).
**Warning signs:** Tool call events where search_contacts and a write tool appear in the same SSE "tool_call" event batch.

---

## Code Examples

### Verified: search_contacts SQL (tools.py:649-684)

```python
# Source: ai-service/app/tools.py lines 649-684
def _search_contacts(agent_id: str, inp: dict) -> list:
    query = inp.get("query", "")
    source = inp.get("source")
    limit = inp.get("limit", 10)

    # ...
    if query:
        where_clauses.append(
            "(c.first_name ILIKE %s OR c.last_name ILIKE %s OR c.email ILIKE %s "
            "OR (c.first_name || ' ' || c.last_name) ILIKE %s)"
        )
    # ORDER BY c.created_at DESC — recency sort is built in
```

Passing `query="Rohan Batre"` matches the full-name concatenation. Passing `query=""` with `limit=1` returns the most recently created contact. Both cases work without any SQL changes.

### Verified: Contact-Scoped Detection (agent.py:284-287)

```python
# Source: ai-service/app/services/agent.py lines 284-287
if conversation_row and conversation_row.get("contact_id"):
    contact_context = await run_query(
        lambda: _load_contact_context(conversation_row["contact_id"], agent_id)
    )
```

The `_load_contact_context()` result is appended to the system prompt as `## Current Contact Context`. The new prompt rule for CTX-02 should reference this section header so Haiku knows what "already loaded" means.

### Verified: Existing UUID Safety Precedent (agent.py:177-179)

```python
# Source: ai-service/app/services/agent.py lines 177-179
"NEVER generate, guess, or fabricate UUIDs. If you cannot find the exact chunk_id for a fact, "
"omit the [[chunk:...]] part entirely and just use [Doc: filename, Page X] without the hidden reference. "
"A citation with a wrong UUID is worse than no hidden reference at all.\n"
```

This exact pattern — "NEVER generate, guess, or fabricate UUIDs" — already exists in the prompt and has demonstrated effectiveness for document citations. The new contact resolution rule extends this same pattern to contact_id values.

### Verified: System Prompt Construction Point (agent.py:143, 258)

```python
# Source: ai-service/app/services/agent.py line 143 and 258
def _build_system_prompt(agent_name: str, contact_context: str = "", gmail_status: dict | None = None) -> str:
    # ...
    base = (f"You are CloAgent AI ... {day_name}, {today.isoformat()} ...")
    # Insert contact_resolution_block HERE — between base and "IMPORTANT GUIDELINES"
    return base + contact_context
```

The insertion point is the `base` string construction. The contact_resolution block should be inserted as the first substantive section after the role/date/capability sentence.

---

## State of the Art

| Old Approach | Current Approach | Impact on This Phase |
|--------------|------------------|---------------------|
| Bullet lists for all instructions | XML tags for behavioral contracts | Use XML for contact_resolution block; keep bullets for style guidelines |
| NEVER/ALWAYS in ALL-CAPS | XML + plain directive language | XML-tagged section; NEVER still valid inside tag |
| Prompt rules at end of prompt | Critical rules near top | Place contact_resolution before IMPORTANT GUIDELINES |

**Anthropic official guidance (HIGH confidence, source: platform.claude.com/docs):**
- "XML tags help Claude parse complex prompts unambiguously — wrapping each type of content in its own tag reduces misinterpretation"
- "Put longform data at the top" for best performance
- "Providing context or motivation behind your instructions helps Claude better understand your goals"
- For proactive tool use: wrap in XML tags — `<default_to_action>` pattern confirmed effective

---

## Open Questions

1. **Does Haiku 4.5 reliably follow XML-tagged sections when the rest of the prompt uses ALL-CAPS headers?**
   - What we know: Anthropic's training data uses XML boundaries; Haiku was trained on this. The existing Haiku 4.5 system prompt (as observed in the wild) uses XML tags natively.
   - What's unclear: Whether mixing XML tags in one section with ALL-CAPS in others causes any parsing confusion.
   - Recommendation: Test with a simple case first. If the AI still skips resolution, try wrapping IMPORTANT GUIDELINES in XML as well, or converting the entire prompt to XML sections. This is a validation step, not a blocking concern.

2. **Will parallel tool calling (Pitfall 5) actually manifest with Haiku 4.5?**
   - What we know: Anthropic docs say "Claude's latest models excel at parallel tool execution." Haiku 4.5 is in this family.
   - What's unclear: Whether Haiku (smaller model) actually does parallel tool calls in practice vs. Opus/Sonnet.
   - Recommendation: Include the sequential dependency rule in the prompt ("do not call contact-dependent tools in the same round as search_contacts") as a precaution. Easy to add, low cost if unnecessary.

3. **Will the morning briefing and document citation rules regress after adding ~500 tokens?**
   - What we know: STATE.md already flags this as a concern. The mitigation is top placement.
   - What's unclear: Actual token count and Haiku attention curve at this prompt length.
   - Recommendation: SAFE-01 requires regression testing of morning briefing after any prompt change. The planner should include explicit regression test steps.

---

## Environment Availability

Step 2.6: SKIPPED — this phase makes changes to Python string literals only. No external tools, services, CLIs, runtimes, databases, or package managers beyond the existing project stack are required.

---

## Sources

### Primary (HIGH confidence)
- `ai-service/app/services/agent.py` — Full file read; verified system prompt structure, contact-scoped detection logic, existing UUID rules, agent loop, token round limit
- `ai-service/app/tools.py` — Lines 1-170 and 620-715 read; verified search_contacts SQL, ILIKE full-name match, created_at DESC sort, tool description strings
- `platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices` — Official Anthropic prompt engineering guide (fetched 2026-03-24); verified XML tag guidance, placement recommendations, tool use patterns

### Secondary (MEDIUM confidence)
- `.planning/phases/01-core-resolution-protocol/01-CONTEXT.md` — Phase decisions D-01 through D-05, canonical references, code insights
- `.planning/REQUIREMENTS.md` — RES-01 through RES-06, CTX-02, CTX-03, SAFE-01 through SAFE-03 full text
- `.planning/STATE.md` — Accumulated context: token budget risk, parallel tool call concern flagged

### Tertiary (LOW confidence)
- WebSearch: Anthropic training data using XML as logical boundaries (multiple secondary blog sources; consistent with primary official docs, so effectively MEDIUM)

---

## Metadata

**Confidence breakdown:**
- Standard stack (no new libraries): HIGH — source files read directly
- Architecture (prompt insertion point, XML pattern): HIGH — official Anthropic docs + source code verified
- Pitfalls (parallel calls, token pressure, contact-scoped double-search): MEDIUM-HIGH — most flagged in STATE.md or derivable from source; parallel tool call behavior for Haiku 4.5 specifically is MEDIUM

**Research date:** 2026-03-24
**Valid until:** 2026-09-24 (Anthropic prompt guidance is stable; Haiku 4.5 behavior may shift with model updates)
