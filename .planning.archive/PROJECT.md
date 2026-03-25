# CloAgent — Tool Routing Configuration

## What This Is

A CLAUDE.md configuration update for CloAgent that maps specific development tasks to the correct AI tools and skills. This ensures Claude Code automatically uses the right skill/tool depending on what's being built — frontend components, landing pages, images, 3D elements, or design work.

## Core Value

Claude Code should always use the most appropriate specialized tool for each task type, without the developer needing to manually invoke skills every time.

## Requirements

### Validated

- Auth (Clerk sign-in/up, JWT, user sync) — existing
- Contacts CRUD (list, create, edit, delete) — existing
- Contact Detail (overview, activities, deals, buyer profile, AI profile tabs) — existing
- Deals CRUD with stage management — existing
- Pipeline Kanban with drag-drop — existing
- Activities (call/email/note/showing/task) — existing
- Dashboard with metrics, charts, widget customization — existing
- AI Chat Bubble (floating, global) with SSE streaming — existing
- AI Chat Full Page with conversation management — existing
- AI Tools (23 total: 11 read, 12 write) — existing
- AI Profile Generation — existing
- Analytics (KPI cards, pipeline/activities/contacts charts) — existing
- Tasks Page (full-stack with DB support) — existing
- Marketing Pages (home, about, features, pricing, team, mission) — existing
- Buyer Profile (frontend + backend) — existing
- Notifications (real recent activities from API) — existing
- Settings Page (partial — pipeline stages, commission localStorage) — existing

- Tool routing rules for frontend-design skill — v1.0
- Tool routing rules for ui-ux-pro-max skill (landing/marketing) — v1.0
- Tool routing rules for Stitch (component design + styling) — v1.0
- Tool routing rules for Gemini (nano banana 2) image generation — v1.0
- Tool routing rules for 21st.dev 3D components (landing page only) — v1.0

### Active

(None — next milestone TBD)

### Out of Scope

- Backend Go changes — this is a CLAUDE.md/instruction file update only
- AI service Python changes — not relevant to tool routing
- Database schema changes — not relevant to tool routing
- New frontend features — this is about configuring how Claude builds, not what it builds

## Context

CloAgent is a brownfield project with a mature three-tier architecture (Next.js 14 + Go/Chi + FastAPI/Python) and an extensive feature set already built. The project uses several specialized skills/tools available to Claude Code:

- **`frontend-design` skill** — for building dashboard/app UI components and pages
- **`ui-ux-pro-max` skill** — for landing pages, marketing pages, and high-design work
- **Stitch** — design component tool for any frontend styling and new component creation
- **Gemini (nano banana 2)** — AI image generation for any image assets needed (marketing, app placeholders, icons)
- **21st.dev** — pre-built 3D component library, used exclusively on landing/marketing pages

Shipped v1.0: CLAUDE.md now contains a "Design & Build Tool Routing" section (50 lines) with tool inventory, routing rules, multi-tool composition, hard constraints, and excluded paths.

## Constraints

- **File**: Must be CLAUDE.md additions (not a separate file)
- **Scope**: Tool routing rules only — no changes to application code
- **3D scope**: 21st.dev 3D components are landing page only, never in dashboard
- **Stitch scope**: Used for any frontend styling work and new component creation
- **Gemini scope**: Used whenever any image asset is needed anywhere in the project

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLAUDE.md additions (not separate file) | Keep all instructions in one place, simpler to maintain | ✓ Good |
| 21st.dev landing-only restriction | 3D elements would be distracting in a CRM dashboard | ✓ Good |
| Gemini for all image needs | Single tool for consistency across marketing and app assets | ✓ Good |
| Stitch for all styling + components | Ensures consistent design language across the project | ✓ Good |
| Path-based first-match-wins routing | Simple precedence, directory patterns over file-level rules | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after v1.0 milestone*
