# Fix Haiku Prompt Compliance for Pronouns, Creates, and Proactive Suggestions

**Date:** 2026-03-25
**Status:** Draft
**Branch:** feat/ai-intelligence-upgrade

## Problem

The AI inference test suite revealed 3 failures where Haiku 4.5 ignores existing system prompt instructions:

1. **Pronoun resolution** — "follow up with him" after discussing James (male) and Sarah (female) should resolve to James via gender matching. Instead Haiku says "I need to know who 'him' refers to." The rule exists (prompt rule 8c) but Haiku doesn't follow it.

2. **Action-orientation on creates** — "Create a new contact named Test Person" should call `create_contact` (which has built-in confirmation via pending_actions). Instead Haiku describes what it *would* create and waits for text confirmation. The prompt says "be action-oriented" but Haiku is too cautious.

3. **Proactive suggestions** — After auto-executing `update_contact` on a contact, Haiku should mention missing fields (email, phone, source). The `PROACTIVE SUGGESTIONS` section exists but Haiku ignores it.

**Root cause:** The system prompt is ~320 lines. Haiku has limited attention and doesn't reliably follow instructions that are buried mid-prompt or phrased abstractly.

## Non-Problems (Confirmed OK)

- **Test 1.3** — "Zebediah not found" was a test keyword bug; AI behaved correctly.
- **Test 2.2** — AI asked before replacing an existing phone number. Better UX than silent overwrite.
- **Test 2.4** — Consequence of 2.2; acceptable.

## Design

Two changes: (A) restructure the system prompt, (B) inject conversation contacts summary.

### A. System Prompt Restructuring

**Principle:** Haiku follows instructions better when they are (1) near the top, (2) inside XML tags, (3) accompanied by concrete examples, and (4) short.

#### A1. Move critical behavioral rules to the top

Current structure:
```
1. Role intro + date (5 lines)
2. <contact_resolution> (30 lines — rules 1-8)
3. <operation_routing> (15 lines)
4. PROACTIVE SUGGESTIONS (4 lines)
5. IMPORTANT GUIDELINES (10 lines)
6. Document search rules (30 lines)
7. Response formatting (15 lines)
8. Morning briefing (25 lines)
9. Gmail section (conditional)
10. Contact context (conditional)
```

New structure:
```
1. Role intro + date (5 lines)
2. <CRITICAL_BEHAVIORS> — the 3 things Haiku must always do (NEW, ~25 lines)
3. <contact_resolution> — rules 1-7 (same), rules 8a-8d preserved here (NOT removed)
4. <operation_routing> — same, add example
5. PROACTIVE SUGGESTIONS — REMOVE (superseded by RULE 3 in CRITICAL_BEHAVIORS)
6. IMPORTANT GUIDELINES (same)
7. Document search accuracy rules (conditional — only when doc_count > 0)
8. Response formatting (same)
9. Morning briefing (same)
10. Gmail section (conditional)
11. Contact context (conditional)
12. <conversation_contacts> — injected from code (NEW)
```

Key changes vs current:
- Rules 8a-8d stay in `<contact_resolution>` as the detailed reference. `CRITICAL_BEHAVIORS` RULE 1 is the short, example-driven version that Haiku actually reads. They reinforce each other.
- The old `PROACTIVE SUGGESTIONS` section (4 lines) is removed since RULE 3 in `CRITICAL_BEHAVIORS` replaces it with a concrete example.
- Document accuracy rules (~30 lines, currently lines 249-278) move out of the `base` string and into a separate string that's only appended when `doc_count > 0`.

#### A2. New `<CRITICAL_BEHAVIORS>` section

This goes immediately after the role intro. Contains the 3 failing behaviors with concrete examples:

```
<CRITICAL_BEHAVIORS>
These 3 rules override all others. Follow them every time.

RULE 1 — PRONOUN RESOLUTION:
When the user says "him", "her", "them", or "they" referring to a contact,
check the <conversation_contacts> section at the end of this prompt.
Match the pronoun to a contact by gender (him=male, her=female, them=any).
If exactly one match, use that contact. If ambiguous, ask.

Example:
  User: "call James" → [search, log call for James Park]
  User: "call Sarah" → [search, log call for Sarah Chen]
  User: "follow up with him" → James Park is male, Sarah Chen is female.
  "him" = male → James Park. Use his contact_id. Do NOT ask "who do you mean?"

RULE 2 — USE TOOLS FOR CREATES:
When the user says "create a contact" or "add a new contact", call the
create_contact tool. Do NOT describe what you would create and ask "should I
proceed?" — the tool has a built-in confirmation step that handles this through
the UI. Your job is to call the tool; the confirmation system handles approval.

Example:
  User: "Create a new contact named Jane Doe"
  CORRECT: call create_contact(first_name="Jane", last_name="Doe")
           → system queues for confirmation → user sees confirm/cancel in UI
  WRONG: "I'll create Jane Doe with these details... shall I proceed?"
         (this bypasses the confirmation UI)

RULE 3 — PROACTIVE FIELD SUGGESTIONS:
After you auto-execute update_contact, update_buyer_profile, or update_deal,
check the tool result for the contact's current fields. If email, phone, or
source is null/empty, add ONE line at the end of your response:
"I notice [name] doesn't have a [field] yet — want me to add one?"

Example:
  [auto-executed update_contact for Sarah, source → Zillow]
  Response: "Done! Sarah's source is now Zillow. I notice she doesn't have a
  phone number yet — want me to add one?"
</CRITICAL_BEHAVIORS>
```

#### A3. Add example to `<operation_routing>`

Add a concrete example at the end of the operation routing section:

```
Examples:
  "Add phone 555-0000 to Marcus" → search_contacts("Marcus") → found → update_contact
  "Create a new contact named Jane" → create_contact(first_name="Jane", ...)
  "Update Zebediah's email" → search_contacts("Zebediah") → 0 results → "I couldn't find Zebediah"
```

#### A4. Conditionally inject document accuracy rules

The document accuracy rules (currently lines 249-278 in agent.py) are always present in the base prompt but only relevant when the agent has uploaded documents. Move them out of the `base` string into a separate `_DOC_ACCURACY_RULES` constant. Append it to the system prompt only when `doc_count > 0`, alongside the existing conditional doc-awareness line (lines 379-385).

This removes ~30 lines from the base prompt for agents without documents, freeing attention budget for the new `<CRITICAL_BEHAVIORS>` section.

The morning briefing instructions stay in the base prompt (core feature, always relevant).

### B. Conversation Contacts Injection

**Problem:** Pronoun resolution requires Haiku to scan its own conversation history, find contact names in tool results, infer gender from first names, and match to pronouns. This is multi-step reasoning that Haiku struggles with.

**Solution:** Extract contacts from the conversation history in Python and inject a `<conversation_contacts>` block at the end of the system prompt. This does the hard work for Haiku — it just reads a pre-digested list.

#### B1. Strategy: Parse history once at load time

The system prompt is built once before the agent loop (line 375). We parse contacts from the loaded message history at the same time and append the block. No per-round rebuild needed — Claude already sees tool results from the current turn in the `messages` array, and the `<conversation_contacts>` block covers prior turns loaded from DB.

This means:
- **Multi-turn conversations (loaded from DB):** Contacts from prior messages are extracted and injected. Pronoun resolution works even on the first message of a new session.
- **Current turn:** If the user references a contact for the first time in this message, the contact won't be in `<conversation_contacts>` yet. But rule 8b in `<contact_resolution>` ("single recent contact") still applies since the tool result is in the message array that Claude sees.

#### B2. New function: `_extract_conversation_contacts(messages: list) -> str`

1. Iterate through all messages in the loaded history
2. For each message, if `content` is a string, scan for JSON patterns containing `"contact_id"`, `"first_name"`, `"last_name"` using regex
3. Build a deduplicated ordered dict of `contact_id → (first_name, last_name)`, preserving insertion order (most recent wins on duplicates)
4. For each contact, infer gender via `_infer_gender(first_name)`
5. Return the formatted block, or empty string if no contacts found

```
<conversation_contacts>
Contacts discussed in this conversation (most recent first):
- Sarah Chen (ID: c000...0003) — likely female
- James Park (ID: c000...0004) — likely male
Use this list for pronoun resolution (RULE 1 above).
</conversation_contacts>
```

**Where it's called:** In `run_agent()`, after `_load_history()` returns, before `_build_system_prompt()`. The result is appended to the system prompt string after it's built.

#### B3. Gender heuristic

A minimal hardcoded dict (~40 common names per gender), not an external library:

```python
_MALE_NAMES = {
    "james", "john", "marcus", "michael", "david", "robert", "william",
    "richard", "joseph", "thomas", "charles", "christopher", "daniel",
    "matthew", "anthony", "mark", "donald", "steven", "paul", "andrew",
    "joshua", "kenneth", "kevin", "brian", "george", "timothy", "ronald",
    "edward", "jason", "jeffrey", "ryan", "jacob", "nicholas", "eric",
    "stephen", "jonathan", "larry", "justin", "scott", "brandon",
}

_FEMALE_NAMES = {
    "sarah", "emily", "olivia", "jessica", "jennifer", "amanda", "ashley",
    "stephanie", "nicole", "elizabeth", "megan", "rachel", "lauren",
    "samantha", "katherine", "emma", "rebecca", "laura", "michelle",
    "kimberly", "lisa", "angela", "heather", "melissa", "amy", "mary",
    "patricia", "linda", "barbara", "susan", "dorothy", "karen",
    "nancy", "betty", "margaret", "sandra", "donna", "carol", "ruth",
}

def _infer_gender(first_name: str) -> str:
    name = first_name.lower().strip()
    if name in _MALE_NAMES:
        return "male"
    if name in _FEMALE_NAMES:
        return "female"
    return "unknown"
```

For names not in the list, we return "unknown" and the prompt's existing rule 8d (ambiguous — ask) applies. The heuristic is a performance optimization, not a correctness requirement.

#### B4. Parsing contact data from history strings

Messages from `_load_history()` are `{"role": str, "content": str}` dicts. Tool results from prior turns are stored as the assistant's text response (not the structured tool result data). However, the content strings may contain contact names mentioned by the AI (e.g., "I found James Park...").

Strategy: Use regex to extract contact references from content strings:

```python
import re

# Match patterns like: "contact_id": "uuid" paired with "first_name": "X", "last_name": "Y"
_CONTACT_PATTERN = re.compile(
    r'"contact_id"\s*:\s*"([0-9a-f-]{36})".*?'
    r'"first_name"\s*:\s*"([^"]+)".*?'
    r'"last_name"\s*:\s*"([^"]+)"',
    re.DOTALL
)
```

This matches JSON tool result fragments that contain all three fields. It works on the raw content strings stored in the DB.

**Edge case:** If the content is plain text (no JSON), the regex simply matches nothing. No false positives because the pattern requires a valid UUID format for contact_id.

## Files Changed

| File | Change |
|------|--------|
| `ai-service/app/services/agent.py` | Restructure `_build_system_prompt()` (split base string, move doc rules to conditional, add CRITICAL_BEHAVIORS, add operation_routing examples, remove standalone PROACTIVE SUGGESTIONS). Add `_MALE_NAMES`, `_FEMALE_NAMES`, `_infer_gender()`, `_extract_conversation_contacts()`. In `run_agent()`, call `_extract_conversation_contacts(history)` and append result to system prompt. |

Single file change. All modifications are in `agent.py`.

## Testing

Re-run the 3 failing tests from the inference suite:
- **1.2**: "call James" → "call Sarah" → "follow up with him" → should resolve to James
- **2.3**: "Create a new contact named Test Person" → should call `create_contact` with confirmation event
- **5.1**: "Update Sarah's source to Zillow" → should mention missing fields

Also re-run all 25 tests to verify no regressions on the 18 that currently pass.

## Risks

- **Prompt length:** Adding `<CRITICAL_BEHAVIORS>` (~25 lines) while removing document rules (~30 lines when no docs) and `PROACTIVE SUGGESTIONS` (4 lines) is a net reduction for agents without documents. For agents with documents, it's roughly +25 -4 = +21 lines — acceptable.
- **Gender heuristic:** Could misclassify names from non-Western cultures. Mitigated by defaulting to "unknown" and falling back to the "ask" rule. The heuristic is a performance optimization, not a correctness requirement.
- **History parsing regex:** Could miss contacts if the content format changes. Low risk since tool results are JSON-formatted and the pattern is conservative.
- **Haiku still ignores rules:** Even with restructuring, Haiku may not comply 100%. The conversation contacts injection makes pronoun resolution mechanical rather than reasoning-dependent, which is the highest-value fix. The other two (creates, proactive) depend on prompt compliance and may need further iteration.

## Success Criteria

- All 3 target tests (1.2, 2.3, 5.1) pass on re-run (3/3 on at least 1 of 2 consecutive runs)
- All previously passing tests (18/25) continue to pass (0 regressions)
- System prompt stays under 350 lines total
- No new code dependencies added
