# Phase 2: Context Awareness and Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 02-context-awareness-and-hardening
**Areas discussed:** Pronoun resolution scope, Ambiguous pronoun handling

---

## Pronoun Resolution Scope

### Q1: Which pronouns should the AI resolve?

| Option | Description | Selected |
|--------|-------------|----------|
| him/her/them/they (Recommended) | Cover all common third-person pronouns. Broadest coverage for natural speech. | ✓ |
| him/her only | Skip 'them/they' since those could be ambiguous (plural vs. singular). | |
| All pronouns + possessives | Also handle 'his email', 'her deal', 'their profile'. More comprehensive but more complex. | |

**User's choice:** him/her/them/they (Recommended)
**Notes:** None

### Q2: How should the AI determine which contact a pronoun refers to?

| Option | Description | Selected |
|--------|-------------|----------|
| Most recent contact mentioned (Recommended) | Look backward through conversation for the last contact_id that appeared in a search result or tool call. | ✓ |
| Most recent contact + gender matching | Use pronouns to find matching-gender contacts from history. Contacts don't store gender. | |
| Only contact-scoped context | Only resolve pronouns when conversation is contact-scoped. Always ask in general conversations. | |

**User's choice:** Most recent contact mentioned (Recommended)
**Notes:** None

### Q3: Should there be a recency limit on pronoun resolution?

| Option | Description | Selected |
|--------|-------------|----------|
| No limit — any contact in the 20-message window (Recommended) | The 20-message window is already a natural boundary. | |
| Last 5 messages only | Reduces risk of stale references but may frustrate users. | |
| You decide | Let Claude/researcher determine the right boundary. | ✓ |

**User's choice:** You decide
**Notes:** Deferred to Claude's discretion — researcher/planner will determine optimal recency boundary for Haiku 4.5.

---

## Ambiguous Pronoun Handling

### Q1: When multiple contacts were discussed and the user says a pronoun, what should happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Assume most recent contact (Recommended) | Always resolve to the last contact discussed, regardless of pronoun. | |
| Ask for clarification | Present recently discussed contacts and ask user to pick. | |
| Try gender matching, fall back to asking | Infer gender from first names. If ambiguous, ask. | ✓ |

**User's choice:** Try gender matching, fall back to asking
**Notes:** User chose the more nuanced approach over the simpler recommended option.

### Q2: When gender matching is unclear, what's the fallback?

| Option | Description | Selected |
|--------|-------------|----------|
| Ask for clarification (Recommended) | Present recently discussed contacts and ask who they mean. Consistent with D-01 from Phase 1. | ✓ |
| Default to most recent contact | If gender matching fails, use whoever was discussed last. | |

**User's choice:** Ask for clarification (Recommended)
**Notes:** None

---

## Claude's Discretion

- Recency limit for pronoun resolution (user deferred this decision)
- Exact prompt wording and placement within `<contact_resolution>` block
- Whether to add as new rule 8 or extend rule 6

## Deferred Ideas

None — discussion stayed within phase scope.
