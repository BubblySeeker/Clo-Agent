# Research Summary: Tool Routing for CloAgent

Synthesized from STACK.md, FEATURES.md, ARCHITECTURE.md, and PITFALLS.md.

---

## Key Findings

1. **File paths are the most reliable routing signal.** CloAgent's Next.js App Router structure (`dashboard/` vs `(marketing)/`) creates an unambiguous domain boundary. Intent-based routing ("design," "styling") is ambiguous and causes tool overlap. All four documents converge on path-first routing.

2. **The five tools form a natural two-layer hierarchy, not a flat peer group.** `frontend-design` and `ui-ux-pro-max` are orchestrators (one per domain). Stitch, 21st.dev, and Gemini are specialists invoked by orchestrators. Treating them all as peers causes jurisdiction conflicts (PITFALLS Pitfall 1 and 7).

3. **Stitch is the highest-risk tool for misrouting.** It cross-cuts both domains (dashboard and marketing) and overlaps with both orchestrators on styling tasks. The resolution: Stitch handles new reusable components and pure styling work; orchestrators handle page-level layout and data-wired components.

4. **Multi-tool composition is common and must be explicitly allowed.** Real tasks like "redesign the landing page hero with a 3D globe and custom illustration" require Gemini + 21st.dev + ui-ux-pro-max in sequence. Without explicit composition rules, Claude stops after the first tool.

5. **The existing codebase constrains tool output.** All UI is hand-written Tailwind CSS. Only one shadcn component exists. Marketing pages already have a specific animation style (3D layer animations, softer fonts). Tools must generate code that fits these patterns, not introduce new frameworks.

6. **Backend, AI service, and logic-only frontend files must be explicitly excluded.** Without exclusion rules, design tools get triggered for API wiring, state management, or backend tasks that mention "design" in the prompt.

7. **Rules must be structural (directory-level), not enumerative (file-level).** Listing specific pages creates brittleness. "Files under `src/app/dashboard/`" covers all current and future dashboard pages without CLAUDE.md updates.

---

## Recommended Stack / Approach

### Tool Inventory

| Tool | Role | Domain |
|------|------|--------|
| `frontend-design` | **Orchestrator** | Dashboard/app UI (`dashboard/**`, `components/shared/**`, auth pages) |
| `ui-ux-pro-max` | **Orchestrator** | Landing/marketing pages (`(marketing)/**`, root `page.tsx`, `components/marketing/**`) |
| Stitch | **Specialist** | New reusable components, design system elements, pure styling changes (any domain) |
| Gemini (nano banana 2) | **Specialist** | Image asset generation (any context) |
| 21st.dev | **Specialist** | Pre-built 3D/interactive components (marketing pages ONLY) |

### Invocation Format

Use imperative-directive style in CLAUDE.md (ALWAYS/NEVER/MUST language). Include both a quick-reference routing table and expanded per-rule descriptions. The imperative style is slightly more effective than pure table format for LLM real-time decisions.

### Composition Sequence

When a task requires multiple tools: assets first (Gemini) -> 3D components (21st.dev) -> reusable components (Stitch) -> page assembly (orchestrator).

---

## Table Stakes Features

These are non-negotiable for correct routing:

1. **Path-based domain mapping** -- every frontend directory maps to exactly one primary tool
2. **Hard scope boundaries** -- 21st.dev blocked in dashboard; Gemini only for images; orchestrators confined to their domains
3. **Explicit backend/logic exclusion** -- design tools never invoked for `backend/`, `ai-service/`, `src/lib/api/`, `src/store/`, `src/middleware.ts`
4. **Boundary file assignments** -- auth pages -> `frontend-design`; `components/ui/` -> Stitch; `components/shared/` -> `frontend-design` (default)
5. **Component vs. page distinction** -- new reusable component -> Stitch; page layout with data wiring -> orchestrator
6. **Default fallback** -- unmatched frontend work defaults to `frontend-design` (app) or `ui-ux-pro-max` (marketing); ambiguous -> ask the user
7. **No-tool category** -- pure logic changes (hooks, API calls, state management) use no design tool

---

## Architecture Recommendation

### Placement in CLAUDE.md

Add a new `## Design & Build Tool Routing` section between the existing `## gstack Skills` and `## Backend Patterns` sections. Keep it separate from gstack (which covers operational slash-commands, not contextual design tools).

### Section Structure

```
## Design & Build Tool Routing
  ### Tool Inventory (table)
  ### Routing Rules (numbered list, first-match-wins, 5-7 rules max)
  ### Multi-Tool Tasks (composition sequence)
  ### Hard Constraints (4-5 NEVER/ALWAYS rules)
  ### Excluded Paths (backend, logic-only files)
```

### Precedence Order (highest to lowest)

1. **Gemini** -- if the task requires generating an image
2. **21st.dev** -- if the task needs 3D AND target is marketing domain
3. **Stitch** -- if the task is creating a new reusable component or pure styling
4. **ui-ux-pro-max** -- if the target file is in the marketing domain
5. **frontend-design** -- if the target file is in the dashboard/app domain

### Key Structural Decisions

- Numbered rules evaluated top-to-bottom, first match wins (proven pattern from GSD `do.md`)
- Orchestrator/specialist hierarchy expressed via "may delegate to" language, not flat peer rules
- All tools must produce Tailwind CSS code conforming to the existing Frontend Patterns section
- Reference `.claude/agents/frontend-page.md` as the source of truth for dashboard UI conventions

---

## Critical Pitfalls to Avoid

| Pitfall | Risk | Mitigation |
|---------|------|------------|
| **Overlapping jurisdiction** (Stitch vs orchestrators) | Claude picks the wrong tool or oscillates between tools | Make Stitch a subordinate invoked by orchestrators; use "component vs. page" and "visual vs. functional" as tiebreakers |
| **Over-routing** (too many specific rules) | Brittle rules that break when pages are added | Cap at 5-7 rules; use directory patterns, not file names; adding a new dashboard page should never require a CLAUDE.md update |
| **Under-routing** (missing edge cases) | Auth pages, layout files, shared components routed randomly | Explicitly assign every frontend directory to a tool or to "no tool" |
| **Conflicting absolute language** | "Use Stitch for ALL styling" contradicts "Use frontend-design for ALL dashboard work" | Use primary/delegate language; avoid "all" and "only" unless truly exclusive (Gemini for images is exclusive; Stitch for styling is not) |
| **Stale rules** | Rules reference current file names that will change | Use structural patterns; date the section with `<!-- Last reviewed: YYYY-MM-DD -->` |
| **Intent-based routing** | "Design" and "styling" are ambiguous across tools | Route by file path first; use intent only as a secondary signal |
| **Missing orchestration layer** | All 5 tools treated as peers; every task becomes a routing decision | Two orchestrators (path-based) delegate to three specialists (task-based) |

---

## Open Questions

1. **Are Stitch, Gemini, and 21st.dev currently available as tools/plugins?** They are not listed in `.claude/settings.json` `enabledPlugins`. Their plugin IDs and invocation methods need to be verified before writing routing rules that reference them.

2. **What is the invocation mechanism for each tool?** `frontend-design` and `ui-ux-pro-max` are Claude Code plugins (skill invocation). Are Stitch, Gemini, and 21st.dev MCP tools, plugins, or something else? The routing syntax depends on the answer.

3. **Should Stitch be a subordinate or a peer?** All research recommends subordinate (invoked by orchestrators), but if Stitch has its own context/state that benefits from direct invocation, it might work better as a first-class routing target for component-only tasks.

4. **How should `components/shared/` be routed?** It contains `AIChatBubble.tsx` (which has design-heavy requirements) alongside `providers.tsx` (pure logic). Default to `frontend-design`? Or split by file purpose?

5. **Should the routing section reference specific brand colors/styles, or just point to Frontend Patterns?** Research says "point, don't duplicate" to avoid staleness, but tools may need inline context to produce on-brand output.

6. **Does the existing `.claude/agents/frontend-page.md` agent need updating to reference these tools?** It currently operates independently of the skill/plugin system. Integrating it with the routing rules is a separate change.

---

*Synthesized: 2026-03-17*
