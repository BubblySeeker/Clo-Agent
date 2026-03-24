# Research: CLAUDE.md Tool/Skill Routing Configuration

## Context

CloAgent is a brownfield AI-powered CRM with an extensive CLAUDE.md (~400 lines) and a mature `.claude/` directory structure including agents, commands, skills, hooks, and GSD workflows. The goal is to add routing rules so Claude Code automatically invokes the correct specialized tool based on task context.

### Tools to Route

| Tool | Plugin ID | Purpose | Scope |
|------|-----------|---------|-------|
| `frontend-design` | `frontend-design@claude-plugins-official` | Dashboard/app UI design and implementation | `/dashboard/*` pages, app components |
| `ui-ux-pro-max` | `ui-ux-pro-max@ui-ux-pro-max-skill` | Landing/marketing page design | `page.tsx` (root), `(marketing)/*` routes |
| Stitch | MCP tool or standalone | Component styling, new component creation | Any frontend file |
| Gemini (nano banana 2) | MCP tool or standalone | AI image generation | Any image asset needed anywhere |
| 21st.dev | MCP tool or API | Pre-built 3D component library | Landing/marketing pages only |

---

## 1. How CLAUDE.md Routing Rules Should Be Structured

### 1.1 Placement Within CLAUDE.md

**Recommendation:** Add a dedicated `## Tool & Skill Routing` section immediately after the existing `## gstack Skills` section and before `## Backend Patterns`. This keeps all tool/skill configuration grouped together.

**Confidence: HIGH** -- CLAUDE.md is read top-to-bottom and injected as system context. Placement order affects priority when instructions conflict. Placing routing rules after existing skill docs and before implementation patterns means routing decisions happen early but after the project context is established.

### 1.2 Format: Imperative Directives with File-Path Triggers

Claude Code processes CLAUDE.md as natural-language system instructions. The most effective format uses:

1. **Imperative voice** ("ALWAYS use X when...", "NEVER use Y for...")
2. **File-path pattern matching** as the primary trigger (Claude can see which files are being edited)
3. **Task-type keywords** as the secondary trigger (what the user is asking to do)
4. **Explicit exclusion rules** to prevent misrouting

**Confidence: HIGH** -- This mirrors the pattern already used successfully in the existing CLAUDE.md (e.g., "Use the `/browse` skill from gstack for all web browsing tasks. Never use `mcp__claude-in-chrome__*` tools directly.").

### 1.3 Routing Table Format

The GSD `do.md` workflow demonstrates a proven routing table pattern using "If the text describes... | Route to | Why" columns. This same pattern should be adapted for tool routing.

**Confidence: HIGH** -- The GSD dispatcher at `.claude/get-shit-done/workflows/do.md` already uses this exact pattern and it works reliably for intent-to-command routing.

---

## 2. What Triggers Each Tool

### 2.1 `frontend-design` Skill

**Triggers:**
- Editing or creating files under `frontend/src/app/dashboard/`
- Editing or creating files under `frontend/src/components/` (excluding `marketing/`)
- Keywords: "dashboard", "app UI", "contact page", "pipeline", "kanban", "widget", "settings page", "chat page", "analytics page"
- Any task involving TanStack Query data display, form layouts, or interactive app components

**Does NOT trigger for:**
- Marketing pages (`(marketing)/` route group or root `page.tsx`)
- Pure backend/API work
- Image generation requests
- 3D component requests

### 2.2 `ui-ux-pro-max` Skill

**Triggers:**
- Editing or creating `frontend/src/app/page.tsx` (marketing home)
- Editing or creating files under `frontend/src/app/(marketing)/`
- Editing or creating files under `frontend/src/components/marketing/`
- Keywords: "landing page", "marketing page", "hero section", "pricing page", "about page", "features page", "team page", "mission page", "footer", "marketing nav"

**Does NOT trigger for:**
- Dashboard pages (`/dashboard/*`)
- Backend work
- Image generation (hand off to Gemini)

### 2.3 Stitch

**Triggers:**
- "Style this component", "restyle", "redesign", "make it look better"
- Creating a new reusable component (not a page)
- Tailwind CSS refactoring or design system work
- "Create a component for...", "extract component", "build a card component"
- Any request focused on visual styling rather than functionality

**Does NOT trigger for:**
- Full page creation (use `frontend-design` or `ui-ux-pro-max` instead)
- Backend/API work
- Image generation

### 2.4 Gemini (nano banana 2)

**Triggers:**
- "Generate an image", "create an image", "make a graphic"
- "Hero image", "placeholder image", "icon", "illustration"
- Any request for a visual asset (PNG, JPG, SVG, WebP)
- "Marketing banner", "app screenshot mockup", "avatar placeholder"

**Does NOT trigger for:**
- Code generation of any kind
- Component creation (use Stitch)
- 3D components (use 21st.dev)

### 2.5 21st.dev

**Triggers:**
- "3D component", "3D element", "3D animation", "globe", "3D card"
- "Interactive 3D", "three.js component", "WebGL"
- Specifically when working on landing/marketing pages AND the request involves 3D

**Hard constraint:** ONLY on landing/marketing pages. Never on dashboard pages.

**Does NOT trigger for:**
- Dashboard pages (even if user asks for 3D -- redirect to simpler alternatives)
- 2D components or standard UI elements
- Image generation (use Gemini)

---

## 3. Best Practices for Skill Invocation Directives in CLAUDE.md

### 3.1 Use Explicit Priority Ordering

When multiple tools could apply, specify which takes precedence. The GSD `do.md` uses "Apply the **first matching** rule" -- this same principle should apply.

**Example conflict:** User says "make the landing page hero look better with a 3D globe." This matches both `ui-ux-pro-max` (landing page) and `21st.dev` (3D). The routing rule should specify: use `ui-ux-pro-max` as the orchestrator, and invoke `21st.dev` for the 3D component within that context.

**Confidence: HIGH**

### 3.2 Use MUST/NEVER/ALWAYS Language

CLAUDE.md directives are strongest when they use RFC 2119-style language. The existing CLAUDE.md already uses this pattern (e.g., "The Go backend is the single entry point for the frontend. AI requests are proxied from Go -> Python AI service. The frontend **never** talks to the AI service directly.").

**Confidence: HIGH**

### 3.3 Define the Boundary Clearly, Not Just the Trigger

Exclusion rules are as important as inclusion rules. Each tool entry should have both "use when" and "do NOT use when" clauses.

**Confidence: HIGH** -- Without explicit exclusions, Claude will sometimes apply a tool to edge cases where it seems plausible but is wrong (e.g., using `21st.dev` on a dashboard page because the user mentioned "3D").

### 3.4 File-Path Patterns Are More Reliable Than Keyword Matching

When Claude is editing a specific file, it has high confidence about the file path. Keywords in user requests are ambiguous. Prefer file-path triggers as the primary routing signal.

**Confidence: MEDIUM-HIGH** -- File paths work well for the dashboard vs. marketing distinction, but some tasks (like "generate an image for the hero") don't involve editing a specific file when the routing decision is made.

### 3.5 Composability: Allow Multiple Tools Per Task

Some tasks legitimately need multiple tools. The routing rules should allow chaining, not force a single tool choice. For example: "Rebuild the landing page hero with a 3D globe and AI-generated background image" needs `ui-ux-pro-max` + `21st.dev` + Gemini.

**Confidence: MEDIUM** -- Claude Code can chain tool invocations, but the CLAUDE.md directive needs to explicitly say this is allowed or Claude may stop after the first tool.

### 3.6 Keep Routing Rules Close to the Tool Descriptions

Do not scatter routing rules across multiple sections. A single routing table followed by per-tool detail blocks is the most maintainable format.

**Confidence: HIGH**

---

## 4. Concrete CLAUDE.md Routing Rule Syntax

### 4.1 Recommended Section to Add

```markdown
## Tool & Skill Routing

When working on frontend tasks, ALWAYS use the appropriate specialized tool. Apply the **first matching** rule:

### Routing Table

| Context | Tool/Skill | Invocation |
|---------|-----------|------------|
| Editing/creating `frontend/src/app/dashboard/**` or `frontend/src/components/` (not `marketing/`) | `frontend-design` skill | Use for layout, data display, forms, interactive app UI |
| Editing/creating `frontend/src/app/page.tsx`, `frontend/src/app/(marketing)/**`, or `frontend/src/components/marketing/**` | `ui-ux-pro-max` skill | Use for all landing page and marketing page work |
| Creating a new reusable component, restyling existing components, or design system work | Stitch | Use for component-level styling and creation |
| Any request for image assets (hero images, icons, illustrations, placeholders) | Gemini (nano banana 2) | Use for ALL image generation regardless of where the image will be used |
| 3D components, WebGL elements, interactive 3D animations | 21st.dev | Use ONLY on landing/marketing pages — NEVER on dashboard pages |

### Composition Rules

- A single task MAY require multiple tools. For example, a landing page rebuild might use `ui-ux-pro-max` for layout + `21st.dev` for 3D elements + Gemini for images.
- When composing, the **page-level tool** (`frontend-design` or `ui-ux-pro-max`) is the primary orchestrator. Other tools (Stitch, Gemini, 21st.dev) are invoked as needed within that context.
- Stitch is used for individual component styling regardless of whether the component lives in dashboard or marketing pages.

### Hard Constraints

- **21st.dev is landing-page only.** If a user requests 3D elements on a dashboard page, suggest a simpler alternative (CSS animations, SVG, Framer Motion) instead.
- **Gemini is the sole image generator.** Never attempt to create images with any other tool.
- **Stitch is for components, not pages.** For full page creation, use `frontend-design` (dashboard) or `ui-ux-pro-max` (marketing).
```

### 4.2 Alternative: Inline Imperative Style

If the routing table format feels too rigid, an imperative-directive style also works:

```markdown
## Tool & Skill Routing

### Dashboard / App UI
ALWAYS use the `frontend-design` skill when creating or modifying pages under `frontend/src/app/dashboard/` or components under `frontend/src/components/` (excluding `marketing/`). This includes contact pages, pipeline, chat, analytics, tasks, settings, and all dashboard widgets.

### Landing / Marketing Pages
ALWAYS use the `ui-ux-pro-max` skill when creating or modifying the marketing home page (`frontend/src/app/page.tsx`), any page under `frontend/src/app/(marketing)/`, or components under `frontend/src/components/marketing/`.

### Component Design & Styling
Use Stitch when the task is focused on creating a new reusable component or restyling an existing component. Stitch handles the visual/design layer — not full page layout or data wiring.

### Image Generation
ALWAYS use Gemini (nano banana 2) when any image asset is needed — hero images, icons, illustrations, placeholders, marketing banners. This applies to both dashboard and marketing contexts.

### 3D Components
Use 21st.dev for pre-built 3D components (globes, 3D cards, WebGL effects). NEVER use 21st.dev on dashboard pages — 3D elements are restricted to landing and marketing pages only. If a user requests 3D on a dashboard page, suggest CSS animations or Framer Motion instead.
```

**Confidence: HIGH for both formats** -- The routing table is more scannable; the imperative style is more explicit. Either will work. The imperative style may be slightly more effective because Claude processes natural-language instructions better than structured tables when making real-time decisions.

### 4.3 Disambiguation Directive

Add a fallback for ambiguous cases:

```markdown
### Ambiguous Requests
If a task could reasonably trigger multiple tools, ask the user which scope applies:
- "Is this for the dashboard app or the marketing site?"
- "Do you want a new reusable component (Stitch) or a full page (frontend-design/ui-ux-pro-max)?"

When in doubt, default to: `frontend-design` for app work, `ui-ux-pro-max` for marketing work.
```

**Confidence: MEDIUM** -- Claude will sometimes just pick one rather than asking. The directive makes it more likely to ask, but not guaranteed.

---

## 5. Confidence Summary

| Recommendation | Confidence | Rationale |
|----------------|-----------|-----------|
| Place routing rules in a dedicated `## Tool & Skill Routing` section after `## gstack Skills` | HIGH | Follows existing CLAUDE.md organization; groups all tool config |
| Use file-path patterns as primary routing trigger | HIGH | File paths are unambiguous; Claude sees them during editing |
| Use imperative MUST/NEVER/ALWAYS language | HIGH | Proven effective in existing CLAUDE.md; mirrors RFC 2119 |
| Include both "use when" and "do NOT use when" clauses | HIGH | Prevents misrouting on edge cases |
| Allow multi-tool composition with a primary orchestrator | MEDIUM | Works in practice, but Claude may not always chain correctly |
| Add disambiguation fallback directive | MEDIUM | Claude sometimes picks a tool instead of asking |
| Routing table format (vs. imperative prose) | MEDIUM | Both work; imperative may be slightly more reliable for real-time decisions |
| 21st.dev hard constraint on landing pages only | HIGH | Clear, simple rule with no ambiguity |
| Gemini as sole image generator | HIGH | Single-tool policy is easy to enforce |
| Stitch for components (not pages) | HIGH | Clear scope boundary between component-level and page-level tools |

---

## 6. Implementation Notes

### What Already Exists

- `frontend-design` and `ui-ux-pro-max` are already enabled in `.claude/settings.json` as plugins
- The existing `frontend-page` agent (`.claude/agents/frontend-page.md`) handles page creation but does NOT reference any of these skills -- it operates independently
- The GSD command system has its own routing via `/gsd:do` which dispatches to workflows, not to these design tools
- No existing CLAUDE.md content references `frontend-design`, `ui-ux-pro-max`, Stitch, Gemini, or 21st.dev

### Integration Considerations

1. **GSD + Tool Routing:** The GSD executor (`/gsd:execute-phase`) may trigger frontend work. The CLAUDE.md routing rules should apply regardless of whether work is initiated manually or via GSD.

2. **Agent Files:** The `.claude/agents/frontend-page.md` agent could be updated to reference `frontend-design` skill, but this is a separate change from CLAUDE.md routing rules.

3. **Hooks:** The existing `PostToolUse` hook runs Prettier on `.tsx` files. This will continue to work alongside skill-based routing with no conflicts.

4. **Stitch and Gemini:** These tools are not currently listed in `.claude/settings.json` `enabledPlugins`. They may need to be added there as well, or they may be available as MCP tools. Verify their availability before writing routing rules that reference them.

5. **21st.dev:** Same as above -- verify this is available as a tool/plugin before writing routing rules.

### Recommended Order of Operations

1. Verify Stitch, Gemini, and 21st.dev are accessible as tools/plugins
2. Add them to `.claude/settings.json` if needed
3. Add the `## Tool & Skill Routing` section to CLAUDE.md using the imperative format from section 4.2
4. Add the routing table from section 4.1 as a quick-reference within that section
5. Add the disambiguation directive from section 4.3
6. Test by issuing tasks in each category and verifying correct tool invocation
