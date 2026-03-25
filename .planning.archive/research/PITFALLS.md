# CLAUDE.md Tool Routing Pitfalls — Research Document

## Context

CloAgent needs CLAUDE.md routing rules for five specialized tools:

| Tool | Domain | Scope |
|------|--------|-------|
| `frontend-design` | Dashboard/app UI | `/dashboard/**` pages and components |
| `ui-ux-pro-max` | Landing/marketing pages | `/(marketing)/**`, `page.tsx` (home) |
| Stitch | Component design + styling | Any frontend file needing styling or new components |
| Gemini (nano banana 2) | AI image generation | Any image asset anywhere |
| 21st.dev | Pre-built 3D component library | Landing/marketing pages only |

CloAgent's frontend has a clean split: dashboard pages live under `src/app/dashboard/`, marketing pages live under `src/app/(marketing)/` and `src/app/page.tsx`. This split is the foundation for routing but also the source of most pitfalls.

---

## Pitfall 1: Overlapping Jurisdiction (Tools Fighting Over the Same Task)

### The Problem

Multiple tools have legitimate claims to the same work. The most dangerous overlaps in CloAgent:

- **`frontend-design` vs Stitch**: Both touch dashboard component styling. If the instruction says "use `frontend-design` for dashboard UI" and "use Stitch for any styling work," a task like "restyle the pipeline Kanban cards" matches both rules.
- **`ui-ux-pro-max` vs 21st.dev vs Stitch**: A marketing page redesign could trigger all three. "Redesign the pricing page with new 3D hero and updated card styling" hits `ui-ux-pro-max` (marketing page), 21st.dev (3D element), and Stitch (card styling).
- **`frontend-design` vs `ui-ux-pro-max`**: Shared components like `MarketingNav` or auth pages (`sign-in`, `sign-up`) sit at the boundary between app and marketing.

### Warning Signs

- The CLAUDE.md rules use words like "any," "all," or "whenever" without path-based constraints.
- Two rules would both match a given file path (e.g., `src/components/shared/` is neither clearly dashboard nor marketing).
- Rules describe capabilities ("styling," "design") instead of domains ("files under `dashboard/`").

### Prevention

1. **Use file paths as the primary discriminator, not task descriptions.** Path-based rules are unambiguous. Capability-based rules overlap.
2. **Establish a clear precedence chain.** Example: "For marketing pages, `ui-ux-pro-max` is the primary orchestrator. It may delegate to 21st.dev for 3D elements and Stitch for component creation, but `ui-ux-pro-max` decides."
3. **Define a single owner per directory.** Map directories to exactly one primary tool:
   - `src/app/dashboard/**` and `src/components/dashboard/**` → `frontend-design`
   - `src/app/(marketing)/**`, `src/app/page.tsx`, `src/components/marketing/**` → `ui-ux-pro-max`
   - `src/components/shared/**` → explicit decision required (suggest: `frontend-design` as default, `ui-ux-pro-max` only when called from marketing context)
4. **Make Stitch a subordinate, not a peer.** Stitch should be called by the primary tool, not compete with it. Write the rule as: "When `frontend-design` or `ui-ux-pro-max` needs a new component or significant restyling, use Stitch for the implementation."

---

## Pitfall 2: Over-Routing (Too Many Rules, Too Specific)

### The Problem

Writing a routing rule for every possible scenario creates a brittle system. Every new page, component, or task type needs a new rule or the system misroutes. Over-routing also bloats CLAUDE.md, degrading its usefulness as a reference document.

### CloAgent-Specific Risks

- Writing separate rules for contacts page, pipeline page, deals page, analytics page, etc., when they all follow the same pattern (dashboard pages → `frontend-design`).
- Creating rules for every image type (marketing hero images, contact avatars, placeholder images, icons) instead of one Gemini rule.
- Specifying exact file names that will change as the project evolves.

### Warning Signs

- More than 10-15 routing rules total.
- Rules reference specific file names rather than path patterns or directory structures.
- Adding a new dashboard page requires updating CLAUDE.md routing.
- Rules contain nested conditionals ("if X and Y but not Z, use tool A unless B").

### Prevention

1. **Use directory-level rules, not file-level rules.** "Files under `src/app/dashboard/`" covers all current and future dashboard pages.
2. **Group by domain, not by feature.** One rule for all dashboard work, one for all marketing work, one for all images.
3. **Cap the routing table at 5-7 rules** — one per tool, with scope clearly defined.
4. **Use a default/fallback rule.** "For any frontend work not matching the rules above, use `frontend-design`."

---

## Pitfall 3: Under-Routing (Missing Rules for Real Scenarios)

### The Problem

Gaps in routing leave Claude to guess which tool to use. Guesses are inconsistent and often wrong.

### CloAgent-Specific Gaps Likely to Occur

- **Auth pages** (`sign-in`, `sign-up`): Not dashboard, not marketing. Which tool?
- **Layout files**: `dashboard/layout.tsx` contains the top bar nav, notifications dropdown, and chat bubble. Is that `frontend-design` or Stitch?
- **Shared utilities**: `src/lib/`, `src/store/` — these are logic, not design. No tool should be routed here, but without an explicit exclusion, a tool might be invoked unnecessarily.
- **New component creation**: If someone says "create a reusable data table component," Stitch and `frontend-design` both have claims. Without a rule, behavior is nondeterministic.
- **The `src/components/ui/` directory**: Currently only `button.tsx` (shadcn). Future shadcn additions should probably use Stitch, but this is never stated.

### Warning Signs

- Claude asks "which tool should I use?" during execution — the routing table failed.
- Different conversations handle the same task type with different tools.
- Backend or utility files trigger design tools unnecessarily.

### Prevention

1. **Explicitly exclude non-frontend paths.** "Tool routing rules apply only to files under `frontend/src/`. Backend (`backend/`), AI service (`ai-service/`), and config files are never routed to design tools."
2. **Address boundary files explicitly.** Auth pages, shared components, layout files — each needs a one-line rule.
3. **Add a "no tool needed" category.** Logic-only files (`src/lib/api/`, `src/store/`, `src/middleware.ts`) should explicitly be excluded from design tool routing.

---

## Pitfall 4: Stale Rules (Rules That Rot Over Time)

### The Problem

CLAUDE.md rules reference the project as it exists today. Projects evolve. Rules written for the current structure become misleading or wrong as the codebase changes.

### CloAgent-Specific Risks

- The `(marketing)` route group could be renamed or restructured.
- New top-level routes (e.g., `/onboarding`, `/settings` moved out of dashboard) won't match existing rules.
- Tools themselves evolve — Stitch might gain capabilities that overlap with `frontend-design`, or 21st.dev might add non-3D components.
- The "Coming Soon" pages (Workflows, parts of Settings) will eventually become real features. Rules written assuming they're stubs will be wrong.
- If `shadcn` adoption increases (currently only `button.tsx`), the rules about Stitch doing "new component creation" may conflict with just running `npx shadcn add`.

### Warning Signs

- Rules reference specific files that no longer exist.
- Rules describe tool capabilities that have changed.
- New features are built without any routing rule applying to them.
- A rule says "never" about something the project now does.

### Prevention

1. **Use structural patterns, not snapshots.** Write "files under `src/app/dashboard/`" not "contacts page, pipeline page, analytics page, tasks page, ..."
2. **Date the routing section.** Add `<!-- Last reviewed: YYYY-MM-DD -->` so staleness is visible.
3. **Review routing rules whenever a new route or major component is added.**
4. **Avoid "never" statements about tools** unless it is a true architectural constraint (e.g., "21st.dev 3D components are never used in the dashboard" is an architectural decision that should be stable).

---

## Pitfall 5: Conflicting Rules (Rules That Contradict Each Other)

### The Problem

Two rules that cannot both be true simultaneously. Unlike overlapping jurisdiction (Pitfall 1), conflicting rules give opposite instructions for the same scenario.

### CloAgent-Specific Examples

- Rule A: "Use Stitch for all new component creation." Rule B: "Use `frontend-design` for all dashboard UI work." Conflict: creating a new dashboard component.
- Rule A: "Use `ui-ux-pro-max` for all marketing page work." Rule B: "Use Stitch for any styling changes." Conflict: restyling a marketing page.
- Rule A: "Use 21st.dev for 3D elements on landing pages." Rule B: "Use `ui-ux-pro-max` as the sole tool for marketing pages." Conflict: adding a 3D element to a marketing page.

### Warning Signs

- Rules use absolute language ("all," "sole," "only," "always") for overlapping domains.
- The rules section, read literally, produces a logical contradiction.
- Claude flips between tools on similar tasks across different conversations.

### Prevention

1. **Use primary/delegate language, not exclusive language.** "Use `ui-ux-pro-max` for marketing pages. It may invoke 21st.dev for 3D elements and Stitch for new components."
2. **Read the rules as a system — test for contradictions.** For each rule, ask: "Is there another rule that would give a different answer for the same input?"
3. **Avoid "all" and "only" unless the tool truly has exclusive domain.** Gemini can safely be "the only tool for image generation" because no other tool generates images. Stitch cannot be "the only tool for styling" because `frontend-design` and `ui-ux-pro-max` inherently involve styling.

---

## Pitfall 6: Wrong Abstraction Level (Routing by Intent vs. Routing by Location)

### The Problem

Routing by intent ("use X when the user wants beautiful design") is ambiguous. Routing by file location ("use X for files in this directory") is concrete. Most pitfalls stem from intent-based routing.

### CloAgent-Specific Risk

The five tools naturally suggest intent-based categories:
- "Design" → Stitch
- "3D" → 21st.dev
- "Images" → Gemini
- "App UI" → `frontend-design`
- "Marketing" → `ui-ux-pro-max`

But real tasks blend intents: "Redesign the dashboard with better visual hierarchy" is both "design" and "app UI."

### Prevention

1. **Route by file path first, intent second.** The directory structure is the primary router. Intent only disambiguates within a directory.
2. **For tools that are not path-bound (Gemini, Stitch), route by output type.** Gemini: "any task that requires generating an image file." Stitch: "invoked by the primary tool when creating a new React component file or performing major style overhaul."

---

## Pitfall 7: Missing the Orchestration Layer

### The Problem

Treating all five tools as peers at the same level when some should be orchestrators and others should be subordinates. Without hierarchy, every task becomes a routing decision instead of a delegation.

### Recommended Hierarchy for CloAgent

```
Layer 1 (Orchestrators — route by path):
  - frontend-design   → src/app/dashboard/**, src/components/dashboard/**
  - ui-ux-pro-max     → src/app/(marketing)/**, src/app/page.tsx, src/components/marketing/**

Layer 2 (Specialists — invoked by orchestrators):
  - Stitch            → new component files, major restyling (called by either orchestrator)
  - 21st.dev          → 3D components (called by ui-ux-pro-max only)
  - Gemini            → image generation (called by either orchestrator, or standalone)
```

### Warning Signs That Hierarchy is Missing

- Rules say "use Stitch for..." and "use `frontend-design` for..." at the same level for the same domain.
- No rule describes when one tool should call another.
- Every task requires the user to pick the right tool instead of the system routing automatically.

---

## Pitfall 8: Not Accounting for the Existing Codebase

### The Problem

CloAgent is a brownfield project. Rules that assume a greenfield approach will conflict with existing patterns.

### CloAgent-Specific Concerns

- **All UI is hand-built Tailwind.** There is no component library. Stitch rules must respect this — generating Material UI or Chakra components would be wrong.
- **Only one shadcn component exists (`button.tsx`).** Rules should not assume shadcn is the component system.
- **Marketing pages already exist with a specific style** (recent commits show "dramatic 3D layer animation," "softer fonts"). `ui-ux-pro-max` and 21st.dev must build on this, not replace it.
- **The `AIChatBubble.tsx` is in `shared/`** — it appears on dashboard pages but is not a dashboard component. Routing it to `frontend-design` might miss that it has marketing-page-like design requirements.

### Prevention

1. **Include a "current state" note in the routing section.** "All existing UI uses hand-written Tailwind CSS. Tools must generate Tailwind-based code, not component library code."
2. **Reference existing style patterns.** "Marketing pages use [specific animation/style approach]. New marketing work should match."
3. **Explicitly list shared components that need special handling.**

---

## Summary: Routing Rule Checklist

Before finalizing CLAUDE.md tool routing, verify:

- [ ] Every frontend directory maps to exactly one primary tool
- [ ] Non-frontend paths are explicitly excluded from design tool routing
- [ ] Stitch, 21st.dev, and Gemini are positioned as specialists called by orchestrators, not as peer-level routers
- [ ] No two rules contradict each other when applied to the same file or task
- [ ] Rules use path patterns, not file names or intent descriptions
- [ ] Auth pages, shared components, layout files, and utility files have explicit routing (or explicit exclusion)
- [ ] A default/fallback rule exists for unmatched cases
- [ ] The routing section is dated for staleness tracking
- [ ] Rules respect existing conventions (Tailwind-only, no component library, existing marketing style)
- [ ] 21st.dev is hard-scoped to marketing pages with no exception path to dashboard
- [ ] Total rule count is under 10
- [ ] Adding a new dashboard page does NOT require updating CLAUDE.md

---

*Research completed: 2026-03-17*
*Applies to: CloAgent tool routing configuration (PROJECT.md active requirements)*
