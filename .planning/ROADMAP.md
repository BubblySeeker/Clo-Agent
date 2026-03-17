# Roadmap: CloAgent Tool Routing

**Created:** 2026-03-17
**Granularity:** Standard
**Total Phases:** 3
**Total Requirements:** 10

---

## Phase 1: Integration & Structure

**Goal:** Create the new "Design & Build Tool Routing" section in CLAUDE.md with the correct placement and formatting scaffolding.

**Requirements:**
- **INTG-01** — Rules added to CLAUDE.md as a new section
- **INTG-02** — Rules are concise with broad defaults and few exceptions

**Success Criteria:**
1. A new `## Design & Build Tool Routing` section exists in CLAUDE.md between `## gstack Skills` and `## Backend Patterns`
2. Section contains subsections: Tool Inventory, Routing Rules, Multi-Tool Tasks, Hard Constraints, Excluded Paths
3. Section is under 80 lines total (conciseness check)

---

## Phase 2: Tool Defaults & Routing Rules

**Goal:** Define the five tool-routing defaults that map task types to the correct tool, using path-based routing as the primary signal.

**Requirements:**
- **TOOL-01** — `frontend-design` for dashboard/app pages
- **TOOL-02** — `ui-ux-pro-max` for landing/marketing pages
- **TOOL-03** — Stitch for new reusable components and styling work
- **TOOL-04** — Gemini for all image asset needs
- **TOOL-05** — 21st.dev for 3D components on marketing pages

**Success Criteria:**
1. Each of the 5 tools appears in the Tool Inventory table with role, domain, and invocation context
2. Routing rules use directory-level patterns (e.g., `dashboard/**`) not file-level paths
3. A precedence order is defined (Gemini > 21st.dev > Stitch > ui-ux-pro-max > frontend-design)
4. Multi-tool composition sequence is documented (assets first -> 3D -> components -> page assembly)

---

## Phase 3: Hard Constraints & Exclusions

**Goal:** Add the guard rails that prevent misrouting — scope restrictions, backend exclusions, and output format requirements.

**Requirements:**
- **CNST-01** — 21st.dev NEVER used in dashboard pages
- **CNST-02** — Design tools not invoked for backend, AI service, or pure logic changes
- **CNST-03** — All tool output must use Tailwind CSS consistent with existing patterns

**Success Criteria:**
1. An explicit "Hard Constraints" subsection contains NEVER/ALWAYS rules for each constraint
2. An "Excluded Paths" subsection lists `backend/`, `ai-service/`, `src/lib/api/`, `src/store/`, `src/middleware.ts` as no-design-tool zones
3. Tailwind CSS conformance requirement references the existing Frontend Patterns section
4. A default fallback rule exists for ambiguous cases (ask the user)

---

## Phase Summary

| Phase | Name | Requirements | Count |
|-------|------|-------------|-------|
| 1 | Integration & Structure | INTG-01, INTG-02 | 2 |
| 2 | Tool Defaults & Routing Rules | TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05 | 5 |
| 3 | Hard Constraints & Exclusions | CNST-01, CNST-02, CNST-03 | 3 |
| **Total** | | | **10** |

---
*Roadmap created: 2026-03-17*
