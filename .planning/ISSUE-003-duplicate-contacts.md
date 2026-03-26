# ISSUE-003: AI Creates Duplicate Contacts Instead of Finding Existing Ones

## Problem

When the AI creates a contact and then the user asks it to perform a follow-up action on that same contact (even in the same conversation), the AI creates a **new duplicate contact** instead of finding and updating the existing one.

## Reproduction

1. Open AI chat
2. Say: "Add a new contact named Sarah Mitchell, she's a buyer looking in the downtown area"
3. Confirm creation
4. Say: "Add her phone number, it's 555-867-5309"
5. AI resolves "her" correctly to Sarah Mitchell (pronoun resolution works!) but then **creates a new Sarah Mitchell** with the phone number instead of updating the existing one
6. Repeat for any follow-up action — each one creates another duplicate

In QA testing, this produced **5 duplicate Sarah Mitchells** from a single conversation session.

## Root Cause Investigation Needed

The issue is in the AI service's tool execution flow. Key files to examine:

- `ai-service/app/agent.py` — The agent loop that decides which tools to call
- `ai-service/app/tools.py` — All 34 tool definitions, specifically `create_contact` and `search_contacts`
- `ai-service/app/intelligence.py` — The intelligence pre-processor that resolves contact references before tool calls

### Hypothesis

The intelligence pre-processor correctly resolves "her" → "Sarah Mitchell" (pronoun resolution works). But when it comes time to execute, the AI calls `create_contact` instead of first calling `search_contacts` to check if the contact exists.

Possible causes:
1. **Pre-processor routes to wrong tool** — The intelligence layer may be injecting a "create contact" action when it should be injecting "search then update"
2. **Agent doesn't check for existing contacts before creating** — The `create_contact` tool may not have a dedup check
3. **Search returns empty for recently-created contacts** — There could be a caching/timing issue where `search_contacts` doesn't find contacts created in the same session
4. **System prompt doesn't instruct search-before-create** — The AI may not be told to look for existing contacts before creating

## Fix Approach

The fix should ensure that before any `create_contact` tool call executes, the system checks if a contact with the same name already exists. Options:

### Option A: Add dedup check to `create_contact` tool (simplest)
In `tools.py`, before creating a new contact, search for existing contacts with matching first_name + last_name. If found, return the existing contact instead of creating a duplicate.

### Option B: Fix the intelligence pre-processor
In `intelligence.py`, when the pre-processor detects a contact reference, always inject a search step first. Only route to create if the search returns no results.

### Option C: Add system prompt guidance
Add instructions to the AI's system prompt: "Before creating a new contact, always search for existing contacts with the same name. If a match exists, use the existing contact."

**Recommended: Option A + C combined** — defense in depth. The tool itself should prevent duplicates AND the AI should be instructed not to create duplicates.

## Constraints (from CLAUDE.md)

- **Model**: Claude Haiku 4.5 — must work within this model's capabilities
- **Tool rounds**: Max 5 per message — contact resolution may consume 1-2 rounds, leaving 3-4 for actual work
- **Backward compatible**: Changes must not break existing working AI interactions

## Other Issues Found in Same QA Session

- **ISSUE-004 (Medium)**: Multi-action requests only complete one action (e.g., "make a note AND set a reminder" only creates the reminder)
- **ISSUE-005 (Low)**: Delete operations are single-item, not batch

## QA Report

Full test results: `.gstack/qa-reports/qa-report-localhost-3000-ai-stress-2026-03-26.md`
