# Phase 3: Hard Constraints & Exclusions

```yaml
wave: 1
depends_on: []
files_modified:
  - CLAUDE.md
autonomous: true
requirements:
  - CNST-01
  - CNST-02
  - CNST-03
```

## Goal

Verify that all hard constraints and exclusion rules are present in the CLAUDE.md section created during Phase 1.

## must_haves

- 21st.dev dashboard ban is explicit (CNST-01)
- Backend/AI service/logic exclusion rules present (CNST-02)
- Tailwind CSS conformance requirement references Frontend Patterns (CNST-03)
- Default fallback for ambiguous cases exists

## Tasks

<task id="T1" wave="1">
<title>Verify hard constraints and exclusions in CLAUDE.md</title>

<read_first>
- CLAUDE.md (Design & Build Tool Routing section)
</read_first>

<action>
Verify existing content. No edits needed — Phase 1 already included all constraints and exclusions.
</action>

<acceptance_criteria>
- grep "NEVER used in dashboard" CLAUDE.md returns a match (CNST-01)
- grep "NOT invoked for backend" CLAUDE.md returns a match (CNST-02)
- grep "backend/" CLAUDE.md returns a match in Excluded Paths
- grep "ai-service/" CLAUDE.md returns a match in Excluded Paths
- grep "frontend/src/lib/api/" CLAUDE.md returns a match
- grep "frontend/src/store/" CLAUDE.md returns a match
- grep "frontend/src/middleware.ts" CLAUDE.md returns a match
- grep "MUST use Tailwind CSS" CLAUDE.md returns a match (CNST-03)
- grep "Ambiguous.*ask the user" CLAUDE.md returns a match (fallback)
</acceptance_criteria>
</task>
