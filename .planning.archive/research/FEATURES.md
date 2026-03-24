# Tool Routing Section — Feature Research

Research document for the CLAUDE.md tool routing configuration. Covers what routing rules and intelligence the section should include for five tools: `frontend-design`, `ui-ux-pro-max`, Stitch, Gemini (nano banana 2), and 21st.dev.

---

## 1. Table Stakes Features (Must-Have Routing Rules)

These are non-negotiable. Without them, Claude Code will use the wrong tool or no tool at all.

### 1a. Path-Based Routing

The single most important routing signal is file path. CloAgent has a clean boundary between dashboard app and marketing/landing pages:

| Path Pattern | Tool | Rationale |
|---|---|---|
| `frontend/src/app/dashboard/**` | `frontend-design` | All authenticated CRM pages |
| `frontend/src/app/(marketing)/**` | `ui-ux-pro-max` | Marketing route group |
| `frontend/src/app/page.tsx` (root) | `ui-ux-pro-max` | Landing/home page |
| `frontend/src/app/sign-in/**`, `sign-up/**` | `frontend-design` | Auth pages are app UI |
| `frontend/src/components/marketing/**` | `ui-ux-pro-max` | Marketing section components (HeroExplodedView, PipelineDemoSection, etc.) |
| `frontend/src/components/shared/**` | `frontend-design` | Shared app components (AIChatBubble, providers) |
| `frontend/src/components/ui/**` | Stitch | shadcn-style base components |

**Complexity: LOW** — Static path matching. No ambiguity. The Next.js App Router route groups make the boundary explicit.

### 1b. Task-Type Routing

When the path alone is insufficient (e.g., "make the dashboard look better"), the task description determines the tool:

| Task Type | Tool | Examples |
|---|---|---|
| New component creation | Stitch | "Create a status badge component", "Build a data table component" |
| Styling/theming changes | Stitch | "Update the color palette", "Change font sizes", "Fix spacing" |
| Dashboard page layout | `frontend-design` | "Redesign the contacts list", "Add a widget to dashboard" |
| Landing page design | `ui-ux-pro-max` | "Redesign the hero section", "Update pricing page" |
| Image asset needed | Gemini (nano banana 2) | "Generate a hero background", "Create placeholder avatars" |
| 3D elements on landing | 21st.dev | "Add a 3D globe to the hero", "Interactive 3D card effect" |

**Complexity: MEDIUM** — Requires understanding intent, not just file paths. Task descriptions can be ambiguous ("make it look better" for which surface?).

### 1c. Hard Scope Boundaries

These are walls, not guidelines. They prevent tools from being used where they do not belong.

| Rule | Enforcement |
|---|---|
| 21st.dev is **landing/marketing pages ONLY** | Never use for anything under `dashboard/`. No exceptions. |
| Gemini is for **image generation ONLY** | Never use for layout, components, or code. Only when an actual image file (.png, .jpg, .svg, .webp) is the output. |
| `frontend-design` is **never** used for marketing pages | Even if the task says "frontend", route to `ui-ux-pro-max` if the target is `(marketing)/` or root `page.tsx`. |
| `ui-ux-pro-max` is **never** used for dashboard pages | Even if the task mentions "design" or "UI", route to `frontend-design` if the target is `dashboard/`. |

**Complexity: LOW** — Binary rules. Easy to express, easy to enforce.

### 1d. Stitch as Universal Styling Layer

Stitch should be invoked for any task that involves:
- Creating a new reusable component (button variants, cards, badges, inputs, modals)
- Modifying `tailwind.config.ts` or `globals.css`
- Establishing or updating design tokens (colors, spacing, typography)
- Building any component that will live in `frontend/src/components/ui/`

This applies regardless of whether the component is used on dashboard or marketing pages.

**Complexity: LOW** — Stitch's scope is well-defined: anything in `components/ui/` or any styling/theming work.

---

## 2. Differentiators (Nice-to-Have Routing Intelligence)

These would make the routing smarter but are not strictly required for correctness.

### 2a. Compound Task Decomposition

When a single request touches multiple tools, the routing section should instruct Claude to decompose and sequence:

**Example:** "Redesign the pricing page with a 3D product showcase and custom illustrations"
1. Gemini — generate illustrations
2. 21st.dev — source 3D component
3. Stitch — build any new base components needed
4. `ui-ux-pro-max` — compose the page layout using the generated assets and components

**Recommended sequence rule:** Assets first (Gemini), then components (Stitch/21st.dev), then page composition (design skill).

**Complexity: HIGH** — Requires multi-step reasoning and correct ordering. Easy to describe in CLAUDE.md, hard to guarantee Claude follows it perfectly every time.

### 2b. Context-Aware Fallback

When the routing is ambiguous, define a fallback hierarchy:
1. If the file path is known, use path-based routing (1a).
2. If the path is unknown but the task type is clear, use task-type routing (1b).
3. If both are ambiguous, default to `frontend-design` for app work and `ui-ux-pro-max` for anything with "landing", "marketing", "homepage", or "public-facing" in the request.
4. When in doubt, ask the user.

**Complexity: MEDIUM** — Fallback chains are straightforward to write but require Claude to correctly assess ambiguity.

### 2c. Component Reuse Awareness

Before creating a new component with Stitch, check if the project already has one in `frontend/src/components/ui/`. The project currently has 20+ shadcn components. Routing should include a note: "Check existing `components/ui/` before invoking Stitch for a new component."

**Complexity: LOW** — Single instruction line. Relies on Claude's existing file-search behavior.

### 2d. 21st.dev Component Selection Guidance

Since 21st.dev is a pre-built library, the routing section could include guidance on what types of 3D components are appropriate for a real estate CRM landing page:
- Globe/map visualizations (property locations)
- 3D card flip/tilt effects (feature showcases)
- Animated layer/depth effects (the existing "Peel Back the Layers" narrative uses LayerCard, HeroExplodedView)
- Particle/mesh backgrounds

Inappropriate: game-like 3D, heavy WebGL scenes that hurt load times, 3D components that require user interaction to convey meaning.

**Complexity: LOW** — Guidance text only. No logic.

### 2e. Gemini Prompt Templating

Include recommended prompt patterns for Gemini image generation specific to CloAgent's brand:
- Real estate themed (properties, agents, CRM dashboards)
- Professional/modern aesthetic (not cartoonish)
- Consistent color palette (reference `tailwind.config.ts` theme colors)
- Preferred formats: WebP for photos, SVG for icons/illustrations, PNG for UI elements with transparency

**Complexity: LOW** — Static guidance text.

---

## 3. Anti-Features (Things to Deliberately NOT Configure)

### 3a. DO NOT route backend tasks to any design tool

None of these five tools should ever be invoked for:
- Go backend code (`backend/`)
- Python AI service code (`ai-service/`)
- Database migrations (`backend/migrations/`)
- Docker/infra configuration

The routing section should explicitly state this exclusion to prevent false matches when tasks mention "design" in a backend context (e.g., "design the API endpoint").

### 3b. DO NOT auto-invoke tools for pure logic changes

If the task is purely functional (add a TanStack Query hook, wire up an API call, fix a data fetching bug), no design tool should be invoked even if the change is in the frontend. Design tools are for visual/styling/component work, not business logic.

### 3c. DO NOT let 21st.dev modify existing marketing components

21st.dev should only be used to **add new** 3D elements. It should not be used to restyle or refactor existing marketing components (HeroExplodedView, LayerCard, etc.) that were hand-built. Those modifications belong to `ui-ux-pro-max`.

### 3d. DO NOT create a tool-per-page mapping

Avoid over-specifying which tool handles which specific page. The path-based rules (1a) and task-type rules (1b) are sufficient. A page-by-page mapping would be brittle and require constant updates as pages are added.

### 3e. DO NOT auto-generate images without explicit user request

Gemini should never be triggered automatically during page builds. Image generation should only happen when the user explicitly asks for an image, icon, illustration, or asset. This prevents unnecessary API calls and unwanted visual assets.

### 3f. DO NOT use design tools for data model or API changes

Even when a design task implies data changes (e.g., "add a profile photo upload to contacts"), the design tool handles only the frontend component. The backend schema/API work is a separate task that uses no design tool.

---

## 4. Complexity Notes Per Tool

### `frontend-design` skill
- **Integration complexity: LOW** — Covers the broadest surface (all dashboard pages). Clear boundary via `dashboard/` path prefix.
- **Risk:** Over-invocation. Any frontend task might trigger it even when Stitch or pure logic work is more appropriate.
- **Mitigation:** Explicit rule that Stitch handles component creation and styling; `frontend-design` handles page-level layout and composition.

### `ui-ux-pro-max` skill
- **Integration complexity: LOW** — Clear boundary via `(marketing)/` route group and root `page.tsx`.
- **Risk:** Confusion with `frontend-design` when both "design" and "UI" appear in task descriptions.
- **Mitigation:** Path takes priority. If the file is under `(marketing)/` or is the root landing page, it is always `ui-ux-pro-max`.

### Stitch (design component tool)
- **Integration complexity: MEDIUM** — Cross-cutting concern. Used by both dashboard and marketing surfaces. Must integrate with existing Tailwind config and shadcn patterns.
- **Risk:** Duplicating existing components. The project already has 20+ ui components.
- **Mitigation:** "Check existing before creating" rule. Stitch output should follow existing shadcn/Tailwind conventions.
- **Key constraint:** Stitch output goes to `components/ui/` or inline in the consuming component. It should not create standalone page files.

### Gemini (nano banana 2)
- **Integration complexity: LOW** — Completely decoupled from code. Produces image files only.
- **Risk:** Being invoked for non-image tasks (e.g., "generate a component" misinterpreted as "generate an image of a component").
- **Mitigation:** Only invoke when the expected output is a file with an image extension, or when the user explicitly says "image", "illustration", "photo", "icon", "asset", "graphic".
- **Output location:** Images should go to `frontend/public/` or a subdirectory thereof.

### 21st.dev (3D component library)
- **Integration complexity: MEDIUM** — External library dependency. Components must be compatible with Next.js 14 App Router, React 18, and the existing Tailwind setup.
- **Risk:** Performance. 3D components can significantly increase bundle size and load time.
- **Mitigation:** Landing pages only (not dashboard). Performance note in routing rules. Prefer lightweight components (CSS 3D transforms) over heavy WebGL.
- **Dependency:** Requires checking if `@21st-dev/*` packages are installed. May need `npm install` step.

---

## 5. Dependencies Between Features

```
Gemini ──────────────────────┐
  (produces image assets)    │
                             ▼
21st.dev ──────────┐   Page Composition
  (3D components)  │   ┌─────────────────┐
                   ├──▶│ ui-ux-pro-max   │ (marketing pages)
Stitch ────────────┤   └─────────────────┘
  (base components)│   ┌─────────────────┐
                   ├──▶│ frontend-design │ (dashboard pages)
                   │   └─────────────────┘
                   │
                   └── Can be used standalone for component/styling work
```

### Dependency Matrix

| Tool | Depends On | Depended On By |
|---|---|---|
| `frontend-design` | Stitch (for base components), Gemini (for image assets) | Nothing |
| `ui-ux-pro-max` | Stitch (for base components), Gemini (for image assets), 21st.dev (for 3D elements) | Nothing |
| Stitch | Nothing (standalone) | `frontend-design`, `ui-ux-pro-max` |
| Gemini | Nothing (standalone) | `frontend-design`, `ui-ux-pro-max` |
| 21st.dev | Nothing (standalone) | `ui-ux-pro-max` only |

### Key Dependency Rules

1. **Stitch before design skills** — If a task requires a new base component AND a page layout change, create the component with Stitch first, then compose the page with the appropriate design skill.

2. **Gemini before page composition** — If a task requires generated images AND page layout, generate assets first so they can be referenced in the page build.

3. **21st.dev is additive only** — It adds 3D elements to existing marketing pages. It does not replace or restructure page layouts (that is `ui-ux-pro-max`'s job).

4. **No circular dependencies** — The two design skills (`frontend-design`, `ui-ux-pro-max`) never depend on each other. They operate in completely separate path domains.

5. **Stitch and Gemini are domain-agnostic** — Both can serve either design skill. Their output (components and images respectively) is consumed by whichever design skill is active for the current task.

---

## 6. Summary: Routing Decision Tree

```
Is the task about generating an image/illustration/asset?
  YES → Gemini (nano banana 2)
  NO  ↓

Is the task about creating/modifying a reusable UI component or styling/theming?
  YES → Stitch
  NO  ↓

Is the target file under dashboard/ or is it an auth page?
  YES → frontend-design
  NO  ↓

Is the target file under (marketing)/, root page.tsx, or components/marketing/?
  YES ↓
    Does the task involve adding 3D elements?
      YES → 21st.dev (then ui-ux-pro-max for integration)
      NO  → ui-ux-pro-max
  NO  ↓

Is the task purely functional (API calls, hooks, data logic)?
  YES → No design tool. Standard Claude Code.
  NO  → Ask the user for clarification.
```

---

*Research completed: 2026-03-17*
