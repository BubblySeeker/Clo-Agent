# Tool Routing Rules Architecture for CLAUDE.md

Research document for structuring tool routing rules within CloAgent's CLAUDE.md file.

---

## 1. Section Organization Within CLAUDE.md

### Current CLAUDE.md Structure (top to bottom)

1. Architecture overview
2. Current Implementation Status
3. Database Schema
4. API Endpoints
5. AI Agent Tools
6. Project Structure
7. Path Forward (phases A-E)
8. **gstack Skills** (existing tool/skill routing section)
9. Backend Patterns
10. Frontend Patterns
11. Environment Variables

### Recommended Placement

The tool routing rules should be inserted as a new top-level section **between "gstack Skills" and "Backend Patterns"**, titled `## Design & Build Tool Routing`.

Rationale:
- It groups naturally with the existing "gstack Skills" section, which already establishes the pattern of telling Claude which tool to use for which task.
- It sits before the "Backend Patterns" and "Frontend Patterns" sections, which describe *how* to write code -- the routing section describes *which tool writes the code*.
- Placing it after "gstack Skills" avoids breaking the current logical flow from project overview through API/DB documentation down to implementation patterns.

Alternative considered: Adding it as a subsection within "Frontend Patterns." Rejected because the routing rules span concerns beyond frontend code patterns (image generation, 3D components, design tools).

### Relationship to Existing "gstack Skills" Section

The existing gstack section covers operational skills (browse, review, ship, QA). The new section covers *creative/build* tools. They should remain separate sections because:
- gstack skills are slash-command invocations (`/browse`, `/review`)
- The new tools are contextually triggered based on file paths and task types, not explicit slash commands
- Mixing them would dilute both sections

---

## 2. Rule Priority and Precedence

### The Core Problem

Multiple tools have overlapping domains. Examples:
- A new button component on a marketing page could trigger `ui-ux-pro-max`, `Stitch`, or `21st.dev`
- Restyling a dashboard card could trigger `frontend-design` or `Stitch`
- Adding a hero image to the landing page could trigger `Gemini` or `ui-ux-pro-max`

### Proposed Precedence Model: Domain-First, Then Task-Type

The routing should use a two-level decision tree:

**Level 1 -- Domain (which part of the app):**
| Domain | Path Pattern | Primary Tool |
|--------|-------------|--------------|
| Dashboard / App UI | `frontend/src/app/dashboard/**`, `frontend/src/components/shared/**` | `frontend-design` |
| Landing / Marketing | `frontend/src/app/(marketing)/**`, `frontend/src/app/page.tsx`, `frontend/src/components/marketing/**` | `ui-ux-pro-max` |
| Auth pages | `frontend/src/app/sign-in/**`, `frontend/src/app/sign-up/**` | `frontend-design` |

**Level 2 -- Task Type (what kind of work within that domain):**
| Task Type | Tool | Overrides Domain? |
|-----------|------|-------------------|
| New reusable component or design system element | `Stitch` | Yes -- always use Stitch for new shared components regardless of domain |
| Styling changes to existing components | `Stitch` | No -- only when the task is purely styling (colors, spacing, animations) |
| 3D/interactive visual elements | `21st.dev` | Partial -- only in marketing domain; blocked in dashboard domain |
| Image asset generation | `Gemini` | Yes -- always use Gemini when an image is needed, regardless of domain |

### Precedence Stack (highest to lowest)

```
1. Gemini         -- if the task requires generating an image asset
2. 21st.dev       -- if the task needs a 3D component AND is in marketing domain
3. Stitch         -- if the task is creating a new reusable component
4. ui-ux-pro-max  -- if the file is in marketing/landing domain
5. frontend-design -- if the file is in dashboard/app domain
```

The key insight: **asset-producing tools (Gemini, 21st.dev) take priority over page-building tools** because they produce artifacts that the page-building tools then consume. A marketing page redesign might invoke `Gemini` for a hero image, `21st.dev` for a 3D globe component, and `ui-ux-pro-max` for the page layout -- in that order within a single task.

---

## 3. Interaction with Existing CLAUDE.md Content

### Existing Content That the Routing Rules Must Respect

**Project Structure section** defines the file tree. The routing rules reference these paths, so any path restructuring would require updating the routing table. This is a documentation dependency, not a code dependency.

**Frontend Patterns section** defines:
- Brand colors: `#0EA5E9` (primary blue), `#1E3A5F` (navy)
- Component patterns: cards, modals, loading states
- All Tailwind CSS, no component library

The routing rules should explicitly state that **all tools must output code conforming to the Frontend Patterns section**. The tools produce code; the patterns section governs the code's style. The routing section should not redefine any styling rules.

**Phase E (Design & Polish)** in the Path Forward section mentions "UI consistency and component extraction." The routing rules directly support this phase by ensuring consistent tool usage.

**`.claude/agents/frontend-page.md`** already defines detailed patterns for dashboard pages (auth, data fetching, brand colors, loading states). The `frontend-design` routing rule should reference this agent as the source of truth for dashboard UI conventions.

**`.claude/settings.json`** already has `frontend-design` and `ui-ux-pro-max` enabled as plugins. The routing rules in CLAUDE.md complement (not replace) the plugin configuration -- CLAUDE.md tells Claude *when* to use each plugin; settings.json tells Claude the plugins *exist*.

### What the Routing Rules Should NOT Do

- Redefine brand colors or Tailwind patterns (already in Frontend Patterns)
- Override the frontend-page agent's conventions (already in `.claude/agents/frontend-page.md`)
- Change the project structure (defined elsewhere)
- Duplicate API endpoint documentation

---

## 4. Proposed Section Structure

```markdown
## Design & Build Tool Routing

When working on frontend UI, use the correct specialized tool based on the domain
and task type. These rules determine which tool to invoke automatically.

### Tool Inventory

| Tool | Plugin ID | Purpose | Scope |
|------|-----------|---------|-------|
| `frontend-design` | `frontend-design@claude-plugins-official` | Dashboard and app UI pages/components | `dashboard/**`, `components/shared/**` |
| `ui-ux-pro-max` | `ui-ux-pro-max@ui-ux-pro-max-skill` | Landing pages, marketing pages, high-design work | `(marketing)/**`, root `page.tsx`, `components/marketing/**` |
| Stitch | *(design component tool)* | New reusable components, design system elements, styling overhauls | Any frontend file |
| Gemini (nano banana 2) | *(image generation)* | Generate image assets (hero images, icons, illustrations, placeholders) | Any context requiring images |
| 21st.dev | *(3D component library)* | Pre-built 3D/interactive components | **Landing/marketing pages ONLY** |

### Routing Rules (evaluated top to bottom, first match wins)

1. **Image needed** → Use **Gemini**
   - Trigger: task requires a new image, illustration, icon, or visual asset
   - Output: image file saved to `frontend/public/`
   - Then: continue with the appropriate page-building tool to integrate the image

2. **3D/interactive element on a marketing page** → Use **21st.dev**
   - Trigger: task involves 3D visuals, animated globes, interactive demos, or similar
   - Constraint: ONLY in `(marketing)/**` or root `page.tsx`
   - NEVER use 21st.dev in dashboard pages — 3D elements are inappropriate for a CRM workspace

3. **New reusable component (any domain)** → Use **Stitch**
   - Trigger: creating a component intended for reuse across multiple pages
   - Trigger: building a new design system primitive (button variant, card type, input style)
   - Output location: `frontend/src/components/shared/` or `frontend/src/components/ui/`
   - Must follow: brand colors and Tailwind patterns from "Frontend Patterns" section

4. **Styling-only changes** → Use **Stitch**
   - Trigger: task is purely visual — colors, spacing, typography, animations, hover states
   - Applies to: any existing component in any domain
   - Does NOT apply when the task involves data fetching, state management, or business logic

5. **Marketing/landing page work** → Use **ui-ux-pro-max**
   - Trigger: file is in `frontend/src/app/(marketing)/`, `frontend/src/app/page.tsx`,
     or `frontend/src/components/marketing/`
   - Covers: layout, sections, copy placement, responsive design, scroll animations
   - May delegate to Stitch for individual components within the page

6. **Dashboard/app UI work** → Use **frontend-design**
   - Trigger: file is in `frontend/src/app/dashboard/` or `frontend/src/components/shared/`
   - Covers: pages, data tables, forms, modals, charts, navigation
   - Must follow conventions in `.claude/agents/frontend-page.md`
   - May delegate to Stitch for individual components within the page

### Multi-Tool Tasks

Some tasks require multiple tools in sequence. When this happens:

1. Generate assets first (Gemini for images, 21st.dev for 3D components)
2. Build reusable components second (Stitch)
3. Assemble the page last (ui-ux-pro-max or frontend-design)

Example: "Add a hero section with a 3D animation and custom illustration to the landing page"
→ Gemini (illustration) → 21st.dev (3D animation component) → ui-ux-pro-max (hero section assembly)

### Hard Constraints

- **21st.dev is BLOCKED in dashboard pages.** No exceptions. CRM users need clean, fast UI.
- **Gemini output goes to `frontend/public/`** and must be referenced via Next.js `<Image>` or standard `<img>`.
- **All tools must produce code that follows the Frontend Patterns section** (brand colors, Tailwind, existing conventions).
- **Stitch components must be placed in `components/shared/` or `components/ui/`**, never inline in page files.
```

---

## 5. Handling Overlap: Decision Framework

### Scenario Analysis

| Scenario | Tools That Could Apply | Winner | Reasoning |
|----------|----------------------|--------|-----------|
| New button variant for dashboard | Stitch, frontend-design | **Stitch** | It is a reusable component (rule 3 > rule 6) |
| New button variant for landing page | Stitch, ui-ux-pro-max | **Stitch** | It is a reusable component (rule 3 > rule 5) |
| Restyling the pipeline Kanban colors | Stitch, frontend-design | **Stitch** | Purely visual change (rule 4 > rule 6) |
| Adding a new dashboard page with data tables | Stitch, frontend-design | **frontend-design** | Page-level work with data fetching (rule 6) |
| Building a pricing section on landing page | ui-ux-pro-max, Stitch | **ui-ux-pro-max** | Page section, not a reusable component (rule 5) |
| Adding a 3D globe to landing page | 21st.dev, ui-ux-pro-max | **21st.dev** | 3D element on marketing page (rule 2 > rule 5) |
| Adding a 3D element to dashboard | 21st.dev, frontend-design | **frontend-design** | 21st.dev is blocked in dashboard (hard constraint) |
| Generating a hero illustration | Gemini, ui-ux-pro-max | **Gemini** | Image generation needed (rule 1 > rule 5) |
| New contact list component with search/filter | Stitch, frontend-design | **frontend-design** | Has data fetching and business logic, not purely a design component (rule 6) |
| Extracting a reusable card component from dashboard | Stitch, frontend-design | **Stitch** | Explicit component extraction for reuse (rule 3) |

### The Key Distinction: "Component vs. Page" and "Visual vs. Functional"

The overlap resolution comes down to two questions:

1. **Is the output a reusable component or a page/section?**
   - Reusable component → Stitch
   - Page or page section → domain tool (frontend-design or ui-ux-pro-max)

2. **Is the work purely visual or does it involve logic/data?**
   - Purely visual → Stitch
   - Involves data fetching, state, business logic → domain tool

When both answers point to different tools, **the component/reuse question wins**. A new shared component always goes through Stitch, even if it will be used on a dashboard page. The domain tool then integrates the Stitch-produced component into the page.

---

## 6. Implementation Recommendations

### Formatting Considerations

- Use a numbered list for the routing rules rather than a decision tree diagram. Numbered lists are unambiguous in evaluation order and easier for an LLM to parse.
- Include the routing table (tool inventory) as a quick reference, but the numbered rules are the authoritative source.
- Keep the "Hard Constraints" subsection separate and prominent -- these are non-negotiable guardrails.

### Testing the Rules

After adding the section to CLAUDE.md, validate with these prompts:
- "Add a new 3D hero animation to the landing page" -- should trigger 21st.dev then ui-ux-pro-max
- "Restyle the dashboard sidebar" -- should trigger Stitch (styling-only)
- "Build the communications page" -- should trigger frontend-design (new dashboard page)
- "Generate an illustration for the about page" -- should trigger Gemini then ui-ux-pro-max
- "Create a reusable stat card component" -- should trigger Stitch
- "Add a 3D visualization to the analytics dashboard" -- should trigger frontend-design (21st.dev blocked)

### Future Considerations

- If more tools are added, the precedence stack may need sub-levels within asset-producing tools.
- If Stitch gains page-level capabilities, the component-vs-page distinction may need revisiting.
- The `frontend/src/components/ui/` directory currently only has `button.tsx`. As Stitch produces more components, a design system index may be warranted.

---

*Research completed: 2026-03-17*
