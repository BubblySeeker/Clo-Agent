# Technology Stack: AI Contact Resolution

**Project:** AI Contact Intelligence (CloAgent milestone)
**Researched:** 2026-03-24
**Scope:** Prompt engineering and tool description techniques for reliable contact resolution in an existing Claude Haiku 4.5 CRM assistant

---

## What This Document Covers

This is not a general stack reference — the application stack is already chosen. This document covers the specific techniques for improving Claude Haiku 4.5's contact lookup behavior through system prompt engineering and tool description optimization. All recommendations apply to `ai-service/app/services/agent.py` and `ai-service/app/tools.py`.

---

## Recommended Approach

**Change the system prompt and the `search_contacts` tool description. Do not change the model, the backend, or add new tools.**

The search SQL already works. The problem is the model is not being instructed precisely enough to follow a search-before-act pipeline. This is a prompt engineering problem, not an infrastructure problem.

---

## Technique 1: Explicit Procedure Block in the System Prompt

**Confidence: HIGH** — Verified against Anthropic's official prompting best practices (2025).

### The Core Pattern

Claude 4.x models respond to explicit, numbered procedure blocks. The documentation states: "Provide instructions as sequential steps using numbered lists or bullet points when the order or completeness of steps matters." This is the most direct way to encode the search-before-act pipeline.

Add a dedicated `<contact_resolution>` XML block to the system prompt. XML tags signal to Claude that this is a structured section with distinct authority from surrounding prose.

```python
contact_resolution_block = (
    "<contact_resolution>\n"
    "When the user refers to any contact by name, partial name, or description, "
    "you MUST follow this exact procedure before taking any action:\n\n"
    "1. Extract the name or description from the user's message.\n"
    "   - Full name like 'Rohan Batre': use the full string as the search query.\n"
    "   - Partial name like 'Rohan' or 'email Rohan': use that part as the query.\n"
    "   - Recency reference like 'my last contact', 'most recent lead': call "
    "search_contacts with no query and limit=5, then pick the entry with the "
    "most recent created_at date.\n"
    "   - Relational description like 'the buyer I showed on Tuesday': call "
    "get_all_activities with type=showing and limit=5 to find the contact.\n\n"
    "2. Call search_contacts with the extracted query. Never guess a contact_id.\n\n"
    "3. Evaluate the results:\n"
    "   - Exactly one match: use that contact_id for all subsequent tool calls.\n"
    "   - Multiple matches: ask the user which one they mean before proceeding.\n"
    "   - Zero matches: tell the user no contact was found and offer to create one "
    "or search differently.\n\n"
    "This procedure applies even if you believe you already know the contact_id "
    "from earlier in the conversation. Always resolve freshly when the user "
    "explicitly names a contact.\n"
    "</contact_resolution>\n\n"
)
```

### Why This Works

The Anthropic docs are explicit: "Claude responds well to clear, explicit instructions. Being specific about your desired output can help enhance results." The XML tag wrapping prevents Claude from treating this as background context rather than a behavioral rule. The numbered steps make the required sequence unambiguous.

The instruction also explains *why*: "Never guess a contact_id." This matters because Anthropic's own documentation notes that explaining the reason behind an instruction ("Your response will be read aloud by a text-to-speech engine, so never use ellipses") produces better generalization than bare prohibitions.

### Why NOT to Use CRITICAL/ALL-CAPS

The official docs note that Claude Haiku 4.5 is responsive to system prompts without aggressive language. The advice for current models: "Use normal prompting like 'Use this tool when...' rather than 'CRITICAL: You MUST use this tool when...'." Overemphatic language triggers over-activation patterns. The procedure block above is firm but not alarmist.

---

## Technique 2: Enrich the `search_contacts` Tool Description

**Confidence: HIGH** — Verified against Anthropic tool-use implementation docs (2025).

### The Core Pattern

Anthropic's documentation states: "Providing extremely detailed descriptions is by far the most important factor in tool performance." The current `search_contacts` description is two sentences. It needs to be rewritten to explain:

- What it does
- When to use it (and that it should be used FIRST, before other tools)
- What each parameter does
- What the results contain

**Current description (insufficient):**
```python
"description": "Search for contacts by name, email, or filter by source. Returns matching contacts. The query matches against first name, last name, email, and full name (first + last). You can search with a full name like 'John Doe' or just a first/last name."
```

**Recommended description:**
```python
"description": (
    "Search for contacts by name, partial name, or email. This is the FIRST tool "
    "to call whenever the user mentions a contact by any name — full name, first "
    "name only, last name only, or nickname. You must call this tool to get the "
    "contact_id before calling any other tool that requires a contact_id. "
    "The query is matched case-insensitively against first_name, last_name, "
    "email, and the concatenated full name (first + last). A partial name like "
    "'Rohan' or 'Batre' will find 'Rohan Batre'. To find the most recently added "
    "contact, call this tool with no query and limit=5, then use the entry with "
    "the latest created_at. Returns: id (UUID to use in other tools), first_name, "
    "last_name, email, phone, source, created_at, last_activity_at."
),
```

### Why This Works

Tool descriptions are the primary signal Claude uses to decide which tool to call and when. The phrase "This is the FIRST tool to call whenever" directly encodes the sequential dependency. Describing what the return value contains (`id (UUID to use in other tools)`) teaches Claude that the result is an input to a downstream call, which reinforces the multi-step pattern.

The "no query + limit=5 for most recent contact" heuristic is a concrete instruction for the "my last contact" case. Without this, Claude cannot know that recency is sortable this way.

---

## Technique 3: Few-Shot Examples in the System Prompt

**Confidence: HIGH** — Verified against Anthropic's Claude 4.x prompting docs.

### The Core Pattern

"Examples are one of the most reliable ways to steer Claude's output format, tone, and structure." This applies equally to tool-calling sequences. Adding concrete before/after examples inside `<examples>` tags directly teaches the pattern.

```python
examples_block = (
    "<examples>\n"
    "<example>\n"
    "User: Email Rohan to follow up on the showing\n"
    "Correct behavior: Call search_contacts(query='Rohan'), get back Rohan Batre's UUID, "
    "then call draft_email(to=rohan_email, contact_id=uuid, context='follow up on showing').\n"
    "Wrong behavior: Calling draft_email without searching first.\n"
    "</example>\n\n"
    "<example>\n"
    "User: What's the status of my last contact?\n"
    "Correct behavior: Call search_contacts(limit=5) with no query, take the result "
    "with the most recent created_at, then call get_contact_details(contact_id=that_uuid).\n"
    "Wrong behavior: Responding without searching, or asking the user for a name.\n"
    "</example>\n\n"
    "<example>\n"
    "User: Log a call with John\n"
    "Correct behavior: Call search_contacts(query='John'). If one result, use that UUID. "
    "If multiple Johns, ask: 'I found 3 contacts named John — John Smith, John Doe, and "
    "John Williams. Which one did you call?'\n"
    "Wrong behavior: Picking the first result without clarifying multiple matches.\n"
    "</example>\n"
    "</examples>\n\n"
)
```

### Why This Works

The documentation recommends 3-5 examples that cover edge cases and vary enough that Claude does not pick up unintended patterns. The three examples above cover the three problem cases in the requirements: partial name, recency reference, and ambiguous multi-match. The "Wrong behavior" annotation tells Claude explicitly what the failure mode looks like, reducing the chance it defaults to that behavior.

---

## Technique 4: `contact_id` Parameter Descriptions on Downstream Tools

**Confidence: HIGH** — Verified against Anthropic tool-use docs.

### The Core Pattern

Every tool that requires a `contact_id` should say in its parameter description that the UUID must come from `search_contacts` or `get_contact_details`. This creates a semantic chain: the model can trace the required sequence just from reading the tool schemas.

**Current (insufficient):**
```python
"contact_id": {"type": "string", "description": "UUID of the contact"}
```

**Recommended for all downstream tools:**
```python
"contact_id": {
    "type": "string",
    "description": "UUID of the contact. Get this by calling search_contacts first — never guess or fabricate this value."
}
```

Apply this to: `get_contact_details`, `get_contact_activities`, `get_buyer_profile`, `create_buyer_profile`, `update_buyer_profile`, `log_activity`, `create_deal`, `list_deals`, `draft_email`, `send_email`, `create_task`, `update_contact`, `delete_contact`.

### Why This Works

Each tool description is independently readable context for Claude. When Claude is deciding whether to call `log_activity` with a guessed UUID versus searching first, the parameter description is the last-chance instruction. This creates defense-in-depth: the system prompt procedure block, the `search_contacts` tool description, and the downstream parameter descriptions all point to the same required behavior.

---

## Technique 5: Disable Parallel Tool Calls for Dependent Operations

**Confidence: MEDIUM** — Pattern confirmed in official docs; not yet tested against this specific codebase.

### The Core Pattern

Claude Haiku 4.5 supports parallel tool calling. For the resolution pipeline, this is a liability: Claude might simultaneously call `search_contacts` and `log_activity` before the search returns. Anthropic's docs provide an explicit API flag:

```python
response = await client.messages.create(
    model=MODEL,
    max_tokens=4096,
    system=system,
    messages=messages,
    tools=TOOL_DEFINITIONS,
    betas=["disable_parallel_tool_use"],  # Forces sequential: one tool per round
)
```

Alternatively, add to the system prompt:

```python
"When a user's request requires looking up a contact before taking action, "
"complete the search first, then take the action in the next step. "
"Do not call a search tool and an action tool in the same step."
```

### Why to Use the System Prompt Approach Over the API Flag

The `betas` flag disables parallel tool calling globally, which would hurt the morning briefing workflow where 4 tools are intentionally called in parallel. The system prompt instruction scopes the restriction to contact-dependent actions only. Use the prompt approach unless the beta flag becomes stable and context-aware.

---

## What NOT to Do

| Anti-Pattern | Why | Instead |
|---|---|---|
| Add fuzzy/phonetic search to the DB | The requirements explicitly exclude this; ILIKE already works | Improve the AI instructions so it uses ILIKE correctly |
| Bump to Claude Sonnet for this fix | Cost/latency constraint; this is a prompt engineering problem, not a model capability problem | Fix the prompt first; model upgrade is a separate decision |
| Add a "pre-processing" step that splits names before sending to Claude | Creates a fragile NLP layer before the model that duplicates what the prompt can do | Teach Claude to split names via the procedure block |
| Use ALL-CAPS or CRITICAL prefix in prompt instructions | Official Anthropic docs say this causes overtriggering in 4.x models | Use clear, direct instructions without alarm language |
| Inject examples as prose narrative | Claude misses examples embedded in paragraphs | Wrap examples in `<examples>` and `<example>` XML tags |
| Write one long prose paragraph for the contact resolution rule | Prose is harder for Claude to parse as a procedural rule | Use a numbered list inside a named XML tag |
| Make `search_contacts` required=["query"] | This breaks the "find my most recent contact" use case that requires querying with no arguments | Keep all parameters optional; teach the recency heuristic in the description |

---

## Implementation Order

1. **Enrich `search_contacts` tool description** (Technique 2) — highest impact per token cost, zero risk of regressions.
2. **Add `contact_id` parameter descriptions** (Technique 4) — low effort, high signal.
3. **Add `<contact_resolution>` block** (Technique 1) — the primary behavioral instruction.
4. **Add `<examples>` block** (Technique 3) — adds token cost but highest reliability for edge cases.
5. **Add sequential-step instruction for parallel tool control** (Technique 5) — last, because Techniques 1-4 may be sufficient.

Test after step 3 before adding step 4. The procedure block often produces the correct behavior without examples. Adding examples when they are not needed increases token cost on every request.

---

## Token Budget Considerations

The current system prompt is already long (~300 lines). Each addition has a cost at every API call.

| Addition | Estimated Tokens | Risk if Omitted |
|---|---|---|
| `<contact_resolution>` procedure block | ~120 tokens | High — this is the core fix |
| Enriched `search_contacts` description | ~80 tokens | High — tool description is primary signal |
| `contact_id` parameter descriptions (all tools) | ~200 tokens | Medium — defense in depth |
| `<examples>` block (3 examples) | ~180 tokens | Medium — needed for edge cases |
| Sequential-step instruction | ~30 tokens | Low — only if parallel calling is observed |

Total worst-case addition: ~610 tokens per call. At Haiku 4.5 pricing, this is negligible. At 200 conversations/day averaging 10 messages each, the cost delta is under $0.50/day.

---

## Sources

- [Anthropic Claude 4.x Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices) — HIGH confidence, official current docs
- [Anthropic Tool Use Implementation Guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) — HIGH confidence, official current docs
- [Anthropic Agent Skill Authoring Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — HIGH confidence, official current docs
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — HIGH confidence, official Anthropic engineering blog
- [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) — HIGH confidence, official Anthropic engineering blog
