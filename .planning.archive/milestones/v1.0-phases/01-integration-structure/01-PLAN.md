# Phase 1: Integration & Structure

```yaml
wave: 1
depends_on: []
files_modified:
  - CLAUDE.md
autonomous: true
requirements:
  - INTG-01
  - INTG-02
```

## Goal

Create the new `## Design & Build Tool Routing` section in CLAUDE.md between `## gstack Skills` and `## Backend Patterns`, with five subsections as scaffolding for Phase 2 and Phase 3 content.

## must_haves

- A `## Design & Build Tool Routing` H2 section exists in CLAUDE.md
- Section is located after line 323 (end of gstack Skills) and before line 324 (start of Backend Patterns)
- Contains exactly five subsections: Tool Inventory, Routing Rules, Multi-Tool Tasks, Hard Constraints, Excluded Paths
- Total section length is under 80 lines
- Content uses broad defaults (concise), not an exhaustive routing table

## Tasks

<task id="T1" wave="1">
<title>Insert Design & Build Tool Routing section into CLAUDE.md</title>

<read_first>
- CLAUDE.md (lines 298-327, to see exact gstack Skills ending and Backend Patterns beginning)
- .planning/research/SUMMARY.md (section structure recommendation)
- .planning/research/ARCHITECTURE.md (section 4 proposed structure, section 6 formatting recommendations)
</read_first>

<action>
Insert a new section into CLAUDE.md between the end of `## gstack Skills` (after the gstack setup code block ending at line 322) and `## Backend Patterns` (currently line 324).

The exact content to insert (after line 322's closing triple-backtick, before the blank line preceding `## Backend Patterns`):

```
## Design & Build Tool Routing

<!-- Last reviewed: 2026-03-17 -->

When working on frontend UI, use the correct specialized tool based on file path and task type. Rules are evaluated top to bottom; first match wins.

### Tool Inventory

| Tool | Role | Domain |
|------|------|--------|
| `frontend-design` | Orchestrator | Dashboard/app UI: `dashboard/**`, `components/shared/**`, auth pages |
| `ui-ux-pro-max` | Orchestrator | Landing/marketing: `(marketing)/**`, root `page.tsx`, `components/marketing/**` |
| Stitch | Specialist | New reusable components, design system elements, pure styling (any domain) |
| Gemini (nano banana 2) | Specialist | Image asset generation (any context) |
| 21st.dev | Specialist | 3D/interactive components (marketing pages ONLY) |

### Routing Rules

1. **Image needed** → **Gemini** — then continue with the appropriate page tool to integrate
2. **3D/interactive element + marketing page** → **21st.dev** — ONLY in `(marketing)/**` or root `page.tsx`
3. **New reusable component (any domain)** → **Stitch** — output to `components/shared/` or `components/ui/`
4. **Styling-only change (any domain)** → **Stitch** — colors, spacing, typography, animations only; NOT data/logic work
5. **Marketing/landing page work** → **ui-ux-pro-max** — may delegate to Stitch for sub-components
6. **Dashboard/app UI work** → **frontend-design** — follow `.claude/agents/frontend-page.md` conventions; may delegate to Stitch
7. **Ambiguous** → ask the user

### Multi-Tool Tasks

When a task requires multiple tools, execute in this order:
1. Assets first (Gemini for images)
2. 3D components second (21st.dev)
3. Reusable components third (Stitch)
4. Page assembly last (ui-ux-pro-max or frontend-design)

### Hard Constraints

- **21st.dev is NEVER used in dashboard pages.** CRM workspace needs clean, fast UI.
- **All tool output MUST use Tailwind CSS** conforming to the Frontend Patterns section below.
- **Stitch components go in `components/shared/` or `components/ui/`**, never inline in page files.
- **Design tools are NOT invoked for backend, AI service, or pure logic changes.**

### Excluded Paths

These paths NEVER trigger a design tool — they are logic/backend only:
- `backend/`
- `ai-service/`
- `frontend/src/lib/api/`
- `frontend/src/store/`
- `frontend/src/middleware.ts`
```

Use the Edit tool to insert this block. The old_string should be the blank line between the gstack setup closing code block and `## Backend Patterns`. Replace it with the new section followed by a blank line before `## Backend Patterns`.
</action>

<acceptance_criteria>
- grep -c "## Design & Build Tool Routing" CLAUDE.md returns exactly 1
- grep -n "## Design & Build Tool Routing" CLAUDE.md shows a line number greater than the line for "## gstack Skills" and less than the line for "## Backend Patterns"
- grep -c "### Tool Inventory" CLAUDE.md returns exactly 1
- grep -c "### Routing Rules" CLAUDE.md returns exactly 1
- grep -c "### Multi-Tool Tasks" CLAUDE.md returns exactly 1
- grep -c "### Hard Constraints" CLAUDE.md returns exactly 1
- grep -c "### Excluded Paths" CLAUDE.md returns exactly 1
- The section from "## Design & Build Tool Routing" to the line before "## Backend Patterns" is under 80 lines: awk '/^## Design & Build Tool Routing/,/^## Backend Patterns/' CLAUDE.md | wc -l returns a number less than 80
- grep "NEVER used in dashboard" CLAUDE.md returns a match (21st.dev constraint present)
- grep "backend/" CLAUDE.md appears in the Excluded Paths subsection
- grep "ai-service/" CLAUDE.md appears in the Excluded Paths subsection
- grep "frontend/src/lib/api/" CLAUDE.md returns a match
- grep "frontend/src/store/" CLAUDE.md returns a match
- grep "frontend/src/middleware.ts" CLAUDE.md returns a match
</acceptance_criteria>
</task>

## Verification

After task T1 completes, run these checks:

```bash
# 1. Section exists exactly once
grep -c "## Design & Build Tool Routing" CLAUDE.md

# 2. All 5 subsections exist
for sub in "### Tool Inventory" "### Routing Rules" "### Multi-Tool Tasks" "### Hard Constraints" "### Excluded Paths"; do
  echo "$sub: $(grep -c "$sub" CLAUDE.md)"
done

# 3. Section is under 80 lines
awk '/^## Design & Build Tool Routing/,/^## Backend Patterns/' CLAUDE.md | wc -l

# 4. Correct placement (between gstack Skills and Backend Patterns)
grep -n "^## " CLAUDE.md | grep -A1 -B1 "Design & Build"

# 5. Hard constraints present
grep "NEVER used in dashboard" CLAUDE.md
grep "MUST use Tailwind CSS" CLAUDE.md

# 6. Excluded paths present
grep "ai-service/" CLAUDE.md
grep "frontend/src/lib/api/" CLAUDE.md
```

All checks must pass for Phase 1 to be marked complete.
