---
phase: quick
plan: 260325-dqz
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/app/dashboard/components/score-badge.tsx
autonomous: true
must_haves:
  truths:
    - "ScoreBadge renders a circle with the numeric score inside"
    - "Default variant is 42px with 14px bold font, compact is 24px with 10px font"
    - "Badge color changes based on tier: Hot green, Warm yellow, Cool blue, Cold gray"
    - "Change arrow appears when |score - previousScore| >= 5"
  artifacts:
    - path: "frontend/src/app/dashboard/components/score-badge.tsx"
      provides: "Reusable ScoreBadge component"
      exports: ["ScoreBadge"]
---

<objective>
Create the ScoreBadge component (Step 7 of lead-scoring-steps.md) — a reusable circle badge showing a contact's lead score with tier-based colors and optional change arrows.

Purpose: This component is consumed by Steps 8, 9, and 10 (contact list, score panel, contact detail, pipeline).
Output: frontend/src/app/dashboard/components/score-badge.tsx
</objective>

<execution_context>
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/workflows/execute-plan.md
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/designs/lead-scoring-steps.md (Step 7 specification)
@frontend/src/lib/api/contacts.ts (Contact type with lead_score, previous_lead_score fields)

<interfaces>
From frontend/src/lib/api/contacts.ts:
```typescript
export interface Contact {
  id: string;
  lead_score: number;
  lead_score_signals: Record<string, any> | null;
  previous_lead_score: number | null;
  // ... other fields
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create ScoreBadge component</name>
  <files>frontend/src/app/dashboard/components/score-badge.tsx</files>
  <action>
Create the directory frontend/src/app/dashboard/components/ if it does not exist.

Create score-badge.tsx with a ScoreBadge React component. Use "use client" directive.

Props interface:
```typescript
interface ScoreBadgeProps {
  score: number;
  previousScore?: number | null;
  size?: 'default' | 'compact';
}
```

Tier logic (function getTier):
- 80-100: Hot — bg #dcfce7, text #16a34a, border #86efac
- 50-79: Warm — bg #fef9c3, text #ca8a04, border #fde047
- 20-49: Cool — bg #e0f2fe, text #0284c7, border #7dd3fc
- 0-19: Cold — bg #f1f5f9, text #94a3b8, border #cbd5e1

Rendering:
- Circle container using inline styles for the tier colors (since CSS custom properties are tier-dynamic). Use Tailwind for layout and non-dynamic styles.
- Default size: w-[42px] h-[42px], text-sm (14px), font-bold
- Compact size: w-[24px] h-[24px], text-[10px], font-bold
- Circle: rounded-full, flex items-center justify-center, border-2
- Apply tier bg/text/border colors via style prop

Change arrow logic:
- Only show if previousScore is not null/undefined AND Math.abs(score - previousScore) >= 5
- Arrow positioned immediately to the right of the circle (use inline-flex wrapper with gap-0.5)
- Arrow size: text-xs (12px)
- Increase (score > previousScore): green text (#16a34a), render unicode up arrow (unicode 2191)
- Decrease (score < previousScore): red text (#ef4444), render unicode down arrow (unicode 2193)

Export ScoreBadge as named export. Do NOT use default export.
  </action>
  <verify>
    <automated>cd /Users/matthewfaust/CloAgent/Clo-Agent/frontend && npx tsc --noEmit --strict frontend/src/app/dashboard/components/score-badge.tsx 2>&1 || npx tsc --noEmit 2>&1 | grep -i "score-badge" | head -20</automated>
  </verify>
  <done>ScoreBadge component exists, exports correctly, TypeScript compiles with no errors. Two size variants render different dimensions. Four tier color sets map to score ranges. Change arrows appear only when delta >= 5.</done>
</task>

</tasks>

<verification>
- File exists at frontend/src/app/dashboard/components/score-badge.tsx
- Named export ScoreBadge is present
- TypeScript compilation passes
- Component handles all four tiers (0-19, 20-49, 50-79, 80-100)
- Both size variants (default 42px, compact 24px) are implemented
- Change arrow logic respects the >= 5 threshold
</verification>

<success_criteria>
ScoreBadge component is ready for consumption by Steps 8-10 (contact list, score panel, contact detail, pipeline). TypeScript compiles cleanly and the component covers all specified variants, tiers, and change arrow behavior.
</success_criteria>

<output>
After completion, create `.planning/quick/260325-dqz-create-scorebadge-component-with-tier-co/260325-dqz-SUMMARY.md`
</output>
