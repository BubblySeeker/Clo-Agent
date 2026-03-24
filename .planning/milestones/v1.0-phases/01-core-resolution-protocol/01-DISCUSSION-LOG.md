# Phase 1: Core Resolution Protocol - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 01-core-resolution-protocol
**Areas discussed:** Ambiguity handling, Recency resolution, Conversation memory

---

## Ambiguity Handling

### Q1: Multiple match presentation format

| Option | Description | Selected |
|--------|-------------|----------|
| Numbered list | Show top 3 as numbered list with name, email, source. Concise, easy to pick from. | ✓ |
| Markdown table | Show matches in table with Name, Email, Source, Last Activity columns. More structured but heavier. | |
| You decide | Let Claude pick format based on context. | |

**User's choice:** Numbered list
**Notes:** None

### Q2: Single match behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Act immediately | If exactly one match, proceed with the action. Matches "be action-oriented" guideline. | ✓ |
| Confirm first | Always show match and ask confirmation before proceeding. Safer but slower. | |
| You decide | Let Claude decide based on match confidence. | |

**User's choice:** Act immediately
**Notes:** None

---

## Recency Resolution

### Q1: Definition of "my last contact"

| Option | Description | Selected |
|--------|-------------|----------|
| Most recently created | Use existing created_at DESC sort. No tool changes. Simplest. | ✓ |
| Most recent activity | Sort by last_activity_at. Requires adding sort parameter to tool. | |
| Both options available | Add sort parameter, let AI pick based on phrasing. | |

**User's choice:** Most recently created
**Notes:** None

---

## Conversation Memory

### Q1: Implementation approach

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt-only | System prompt rule to use contact_id from previous search results. 20-message history sufficient. | ✓ |
| Track resolved contacts | Store last resolved contact_id in variable or DB. More reliable but more complex. | |
| You decide | Let Claude choose based on 5-round budget. | |

**User's choice:** Prompt-only
**Notes:** None

---

## Claude's Discretion

- Prompt placement and format (XML tags vs plain text, position in prompt)
- Exact wording of system prompt rules and tool descriptions

## Deferred Ideas

None — discussion stayed within phase scope.
