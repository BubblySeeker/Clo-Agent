# Phase 1: Core Resolution Protocol - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the AI always search for contacts before acting on them. The AI must handle full names, partial names, recency references ("my last contact"), and ambiguous matches (multiple contacts with the same name). Changes are limited to the system prompt in `agent.py` and tool descriptions in `tools.py` — no new backend endpoints, no frontend changes, no migrations.

</domain>

<decisions>
## Implementation Decisions

### Ambiguity Handling
- **D-01:** When multiple contacts match, present a numbered list (max 3) with name, email, and source. Ask the user to pick.
- **D-02:** When exactly one contact matches a partial name, act immediately without confirming. Matches the existing "be action-oriented" guideline.
- **D-03:** When zero contacts match, tell the user no match was found and suggest checking the spelling.

### Recency Resolution
- **D-04:** "My last contact" means the most recently **created** contact. Use existing `created_at DESC` sort with `limit=1` and no query. No tool schema changes needed.

### Conversation Memory
- **D-05:** Conversation memory is prompt-only. Add a system prompt rule telling the AI to use contact_id from its previous search results when the user refers to a contact discussed earlier. The 20-message history window provides sufficient context — no state tracking mechanism needed.

### Claude's Discretion
- Prompt placement and format (XML tags, where in prompt, how directive) — left to researcher/planner to determine what works best with Haiku 4.5
- Exact wording of system prompt rules and tool description changes

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AI Service
- `ai-service/app/services/agent.py` — System prompt construction (`_build_system_prompt` at line 143), agent loop, conversation history loading
- `ai-service/app/tools.py` — Tool definitions (`search_contacts` at line 37), execution functions (`_search_contacts` at line 649), READ_TOOLS/WRITE_TOOLS lists

### Requirements
- `.planning/REQUIREMENTS.md` — RES-01 through RES-06, CTX-02, CTX-03, SAFE-01 through SAFE-03

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `search_contacts` tool already handles ILIKE across first_name, last_name, email, and full name concatenation — SQL is solid
- Results already sorted by `created_at DESC` — recency resolution works with existing sort
- Results include `last_activity_at` via LEFT JOIN on activities — available if needed later
- Contact-scoped conversations already pre-load contact details, buyer profile, and recent activities via `_load_contact_context()`

### Established Patterns
- System prompt is a single large f-string (~100 lines) with section headers in ALL CAPS (e.g., "IMPORTANT GUIDELINES:", "RESPONSE FORMATTING:", "MORNING BRIEFING:")
- No XML tags currently used in the prompt
- Tool descriptions are plain text strings in `TOOL_DEFINITIONS` list
- Max 5 tool rounds enforced in agent loop (`MAX_TOOL_ROUNDS = 5`)

### Integration Points
- System prompt built in `_build_system_prompt()` — new contact resolution rules go here
- `search_contacts` tool description at `tools.py:37` — may need enhancement to guide AI usage
- Agent loop in `run_agent()` — no changes expected, but contact resolution will consume 1-2 of the 5 tool rounds

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-core-resolution-protocol*
*Context gathered: 2026-03-24*
