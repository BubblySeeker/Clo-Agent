---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/app/dashboard/communication/page.tsx
  - frontend/src/app/globals.css
  - frontend/tailwind.config.ts
autonomous: false
must_haves:
  truths:
    - "Three-panel layout (sidebar, reading pane, contact panel) renders with refined premium styling"
    - "All existing functionality works identically — filters, search, thread selection, expand/collapse, reply, compose, log modal, keyboard shortcuts, Gmail sync"
    - "Typography uses the project's existing distinctive fonts (DM Sans body, Sora headings) with strong hierarchy"
    - "Color palette is richer and more sophisticated than the current gray/blue defaults"
    - "Hover states, selection states, and transitions feel smooth and polished"
  artifacts:
    - path: "frontend/src/app/dashboard/communication/page.tsx"
      provides: "Redesigned communication page with premium visual styling"
    - path: "frontend/src/app/globals.css"
      provides: "Communication-specific CSS utilities and custom properties"
    - path: "frontend/tailwind.config.ts"
      provides: "Extended color palette for communication page"
  key_links:
    - from: "frontend/src/app/dashboard/communication/page.tsx"
      to: "frontend/src/lib/api/activities.ts"
      via: "import listAllActivities, createActivity"
      pattern: "import.*from.*api/activities"
    - from: "frontend/src/app/dashboard/communication/page.tsx"
      to: "frontend/src/lib/api/gmail.ts"
      via: "import Gmail API functions"
      pattern: "import.*from.*api/gmail"
---

<objective>
Redesign the Communication page visual layer to feel like a premium, editorial-grade email client. Think Superhuman sophistication meets high-end real estate brand warmth.

Purpose: Transform the functional but visually basic email inbox into a refined, luxurious UI that matches the caliber of CloAgent's target audience (professional real estate agents).

Output: A visually stunning communication page with zero functional regressions.
</objective>

<execution_context>
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/workflows/execute-plan.md
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/app/dashboard/communication/page.tsx
@frontend/src/app/globals.css
@frontend/tailwind.config.ts
@frontend/src/app/layout.tsx

<interfaces>
<!-- Existing fonts already imported in layout.tsx (use CSS variables): -->
<!-- --font-dm-sans (body text), --font-sora (headings), --font-cinzel (display), --font-josefin (accent) -->

<!-- Existing type colors (to be evolved, not removed): -->
```typescript
const typeColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#0EA5E9" },
  email: { bg: "#F0FDF4", color: "#22C55E" },
  gmail: { bg: "#FEF2F2", color: "#EA4335" },
};
```

<!-- Existing Tailwind CSS variables in globals.css — can be extended -->
<!-- Existing animations in tailwind.config.ts — can be extended -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend design system — colors, CSS utilities, and Tailwind config for communication page</name>
  <files>frontend/src/app/globals.css, frontend/tailwind.config.ts</files>
  <action>
Add communication-specific design tokens and utilities to support the premium redesign. Changes to TWO files:

**globals.css — Add communication CSS custom properties and utilities:**

Add to `:root` block (or create a new `@layer components` section for communication):

```css
/* Communication page design tokens */
--comm-bg: #FAFAF8;              /* Warm off-white background, NOT cold gray-50 */
--comm-sidebar-bg: #FFFFFF;
--comm-sidebar-selected: #F0F4FA; /* Soft blue-tinted selection */
--comm-sidebar-hover: #F8F9FC;
--comm-border: #E8E6E1;           /* Warm gray border */
--comm-border-subtle: #F0EEEA;    /* Even lighter warm border */
--comm-navy: #1A2E44;             /* Deepened navy for headings */
--comm-navy-light: #2D4A6F;       /* Medium navy for secondary text */
--comm-accent: #2563EB;           /* Richer blue accent (evolved from #0EA5E9) */
--comm-accent-soft: #EFF4FF;      /* Soft accent background */
--comm-text-primary: #1A1A1A;     /* Near-black for primary text */
--comm-text-secondary: #6B7280;   /* Refined gray for secondary */
--comm-text-tertiary: #9CA3AF;    /* Light gray for timestamps */
--comm-gmail-red: #DC2626;        /* Slightly deeper Gmail red */
--comm-success: #16A34A;          /* Richer green for email/success */
--comm-star: #F59E0B;             /* Warm amber for stars */
```

Add utility classes:
```css
/* Communication page utilities */
.comm-card {
  @apply bg-white rounded-2xl;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}

.comm-card-elevated {
  @apply bg-white rounded-2xl;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
}

.comm-input {
  @apply w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200;
  background: var(--comm-bg);
  border: 1.5px solid var(--comm-border);
  color: var(--comm-text-primary);
  font-family: var(--font-dm-sans);
}
.comm-input:focus {
  border-color: var(--comm-accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}
.comm-input::placeholder {
  color: var(--comm-text-tertiary);
}
```

**tailwind.config.ts — Add a keyframe for a subtle fade-in:**

Add to `keyframes`:
```
'comm-fade-in': {
  '0%': { opacity: '0', transform: 'translateY(4px)' },
  '100%': { opacity: '1', transform: 'translateY(0)' },
},
```

Add to `animation`:
```
'comm-fade-in': 'comm-fade-in 0.2s ease-out',
```
  </action>
  <verify>
    <automated>cd /Users/matthewfaust/CloAgent/Clo-Agent/frontend && npx tailwindcss --content src/app/globals.css --output /dev/null 2>&1 || echo "Tailwind parse check"; grep -c "comm-" src/app/globals.css</automated>
  </verify>
  <done>CSS custom properties for communication palette exist in globals.css. Utility classes comm-card, comm-card-elevated, comm-input defined. Tailwind config has comm-fade-in animation. No existing styles broken.</done>
</task>

<task type="auto">
  <name>Task 2: Redesign communication page — sidebar, reading pane, contact panel, modals</name>
  <files>frontend/src/app/dashboard/communication/page.tsx</files>
  <action>
VISUAL-ONLY changes to classNames, inline styles, and JSX structure. ZERO changes to state, hooks, API calls, mutations, keyboard shortcuts, or any logic.

**CRITICAL RULES:**
- Do NOT change any useState, useEffect, useMemo, useCallback, useRef, useQuery, useMutation calls
- Do NOT change any function signatures or logic (selectThread, goNewer, goOlder, toggleExpanded, etc.)
- Do NOT change any import statements (except adding icons if needed from lucide-react)
- Do NOT change the CommItem interface, timeAgo, formatDate, or helper functions
- Do NOT change EmailHtmlFrame component logic (only its wrapper styling)
- ONLY change: className strings, style={{}} objects, JSX wrapper divs for layout, static text styling

**Evolved color palette — update typeColors constant (visual only):**
```typescript
const typeColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF4FF", color: "#2563EB" },
  email: { bg: "#ECFDF5", color: "#16A34A" },
  gmail: { bg: "#FEF2F2", color: "#DC2626" },
};
```

**1. Overall container:**
- Change outer div background from implicit to `bg-[#FAFAF8]` (warm off-white)
- Add `font-[family-name:var(--font-dm-sans)]` to outer container

**2. Left sidebar thread list:**
- Sidebar background: `bg-white` (keep)
- Border: change `border-gray-100` to `border-[#E8E6E1]` (warm border)
- Header "Communication" text: use `font-[family-name:var(--font-sora)] text-xl font-semibold tracking-tight` with color `#1A2E44`
- Search input: use `comm-input` utility class, add a subtle `rounded-xl` with warm bg
- Filter tabs: refined pill style — selected state gets `bg-[#2563EB] text-white` (solid accent, not transparent), unselected gets `text-[#6B7280] hover:text-[#1A2E44] hover:bg-[#F8F9FC]`, all with `rounded-lg py-2 text-xs font-medium tracking-wide uppercase` and `transition-all duration-200`
- Gmail sync badge: softer green with `bg-emerald-50 text-emerald-600 rounded-full px-3 py-1`
- Thread items:
  - Remove `border-b border-gray-50`, use spacing instead (add `mb-0.5`)
  - Selected: `bg-[#F0F4FA] border-l-2 border-l-[#2563EB]` (left accent border on selection)
  - Hover: `hover:bg-[#F8F9FC]` with `transition-all duration-150`
  - Avatar: add `ring-2 ring-white shadow-sm` for depth, use gradient backgrounds: `background: linear-gradient(135deg, #1A2E44, #2D4A6F)` for contacts, `background: linear-gradient(135deg, #6B7280, #9CA3AF)` for email-only
  - Unread dot: `bg-[#2563EB]` (match accent), slightly larger `w-2.5 h-2.5`
  - Contact name: `font-[family-name:var(--font-sora)]` for thread names
  - Time text: `text-[#9CA3AF] text-[11px] font-medium`
  - Item count badge: styled as a subtle pill `bg-[#F0F4FA] text-[#2563EB] text-[10px] font-semibold px-2 py-0.5 rounded-full`
- Empty state: larger icon `size={32}`, more personality — use `font-[family-name:var(--font-sora)]` for heading, `text-[#6B7280]` for body

**3. Center reading pane:**
- Background: `bg-[#FAFAF8]` (warm off-white, not gray-50)
- Header bar: `bg-white/80 backdrop-blur-sm` for a frosted glass effect, `border-b border-[#E8E6E1]`
- Thread name in header: `font-[family-name:var(--font-sora)] text-base font-semibold text-[#1A2E44]`
- Nav arrows: `rounded-lg hover:bg-[#F0F4FA]` with refined styling
- Action buttons (Email, Log): more refined — `rounded-xl` with subtle shadow on hover: `hover:shadow-sm`
- Thread items (email cards):
  - Use `comm-card` utility, add `hover:shadow-md transition-shadow duration-200`
  - Expand chevron: color `text-[#9CA3AF]` with `hover:text-[#2563EB]` transition
  - Type badge pills: `rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase`
  - Subject line: `font-[family-name:var(--font-sora)] text-sm font-semibold text-[#1A2E44]`
  - Date stamps: `text-[#9CA3AF] text-[11px] font-medium`
  - Expanded body area: `px-8 py-6` (more breathing room), warm divider `border-[#E8E6E1]`
  - User label pills: `bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-0.5 text-[10px] font-semibold` (evolved from purple)
  - Star icon: `text-[#F59E0B] fill-[#F59E0B]`
- Reply area:
  - Reply button (collapsed): `comm-card hover:border-[#2563EB] hover:shadow-sm transition-all duration-200`
  - Reply form (expanded): `comm-card-elevated` with `p-5`
  - Reply textarea and cc input: use `comm-input` utility
  - Send button: `bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl` with `transition-colors duration-200`, `shadow-sm hover:shadow-md`
- Empty state (no thread selected):
  - More premium feel: larger Mail icon with a subtle gradient ring background
  - Use `font-[family-name:var(--font-sora)]` for heading
  - Add a subtle `text-[#9CA3AF]` for the subtext

**4. Right contact details panel:**
- Background: `bg-white`
- Border: `border-[#E8E6E1]`
- Avatar: larger `w-20 h-20`, add `ring-4 ring-[#F0F4FA] shadow-lg`, gradient background `background: linear-gradient(135deg, #1A2E44, #2D4A6F)`
- Name: `font-[family-name:var(--font-sora)] text-base font-bold text-[#1A2E44]`
- Source badge: `bg-[#F0F4FA] text-[#2563EB] rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase`
- Detail labels (Email, Phone, Added): `text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest`
- Detail values: `text-sm text-[#1A2E44] font-medium`
- Add visual separation between contact sections with subtle dividers `border-t border-[#F0EEEA]`
- Add more padding: `p-6` overall

**5. Modals (Log and Compose):**
- Backdrop: `bg-black/40 backdrop-blur-sm` (add blur)
- Modal card: `comm-card-elevated max-w-md p-7` with `rounded-2xl`
- Modal title: `font-[family-name:var(--font-sora)] text-lg font-bold text-[#1A2E44]`
- Type toggle buttons (Call/Email): selected gets solid accent `bg-[#2563EB] text-white` or `bg-[#16A34A] text-white`, unselected gets `bg-[#FAFAF8] text-[#6B7280] border border-[#E8E6E1]`
- All inputs/textareas: use `comm-input` utility class
- Labels: `text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest`
- Primary action buttons: `bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl shadow-sm hover:shadow-md transition-all duration-200`
- Compose send button: `bg-[#DC2626] hover:bg-[#B91C1C]` (Gmail red)
- Close button (X): `text-[#9CA3AF] hover:text-[#1A2E44] hover:bg-[#F8F9FC] rounded-lg w-8 h-8 flex items-center justify-center transition-colors`
  </action>
  <verify>
    <automated>cd /Users/matthewfaust/CloAgent/Clo-Agent/frontend && npx next build 2>&1 | tail -5</automated>
  </verify>
  <done>Communication page renders with premium editorial-grade styling. Three-panel layout preserved. All interactions (thread selection, expand/collapse, reply, compose, log, keyboard shortcuts j/k/r/c/Esc, Gmail sync, mark-as-read) function identically. No TypeScript errors. No new imports beyond potential lucide-react icons.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Premium editorial-grade redesign of the Communication page. Evolved color palette (richer navy, warm backgrounds, sophisticated accent blue), distinctive typography (Sora for headings, DM Sans for body), refined spatial composition with better breathing room, polished hover/selection states, premium contact card panel, frosted glass header, upgraded modal styling.</what-built>
  <how-to-verify>
    1. Navigate to http://localhost:3000/dashboard/communication
    2. Check overall feel: warm off-white background, refined typography, polished borders
    3. Sidebar: verify filter tabs work (All, Calls, Manual, Gmail), search filters threads, thread selection shows left accent border
    4. Reading pane: click threads, expand/collapse items via chevron, check breathing room in expanded emails
    5. Contact panel (right): appears when selecting a thread with a linked contact — check premium card styling
    6. Keyboard shortcuts: j/k to navigate threads, r to reply, c to compose, Esc to close modals
    7. Reply flow: click Reply button or press r, type text, verify Send works
    8. Compose modal: click compose button or press c, fill fields, verify styling
    9. Log modal: click + button, verify Call/Email toggle styling, select contact, log entry
    10. Gmail sync button (if connected): verify sync animation still works
  </how-to-verify>
  <resume-signal>Type "approved" or describe any visual issues to fix</resume-signal>
</task>

</tasks>

<verification>
- Next.js build completes without errors
- All existing functionality works: filters, search, thread selection, expand/collapse, reply, compose, log, keyboard shortcuts, Gmail sync
- No TypeScript type errors
- No changed imports from API modules
- No changed state management, hooks, or mutation logic
</verification>

<success_criteria>
- Communication page has a noticeably premium, editorial-grade feel
- Typography hierarchy is clear using Sora/DM Sans font pairing
- Color palette is richer and warmer than the default gray/blue
- All 10 functional verification points pass without regression
- User approves the visual redesign at checkpoint
</success_criteria>

<output>
After completion, create `.planning/quick/260323-sfi-redesign-communication-page-visual-layer/260323-sfi-SUMMARY.md`
</output>
