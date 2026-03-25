---
phase: quick
plan: 260325-dqz
subsystem: frontend
tags: [lead-scoring, component, ui]
dependency_graph:
  requires: [260325-dg5]
  provides: [ScoreBadge component]
  affects: [contacts list, contact detail, pipeline]
tech_stack:
  added: []
  patterns: [inline styles for dynamic tier colors, Tailwind for layout]
key_files:
  created:
    - frontend/src/app/dashboard/components/score-badge.tsx
  modified: []
decisions:
  - Used inline styles for tier colors (dynamic values cannot be Tailwind utility classes without JIT safelisting)
  - Named export only — no default export, per spec
metrics:
  duration: "< 5 minutes"
  completed_date: "2026-03-25"
---

# Quick Task 260325-dqz: Create ScoreBadge Component Summary

**One-liner:** Reusable ScoreBadge circle component with four tier color sets (Hot/Warm/Cool/Cold), two size variants (42px default, 24px compact), and threshold-gated change arrows.

## What Was Built

`frontend/src/app/dashboard/components/score-badge.tsx` — a `"use client"` React component exported as `ScoreBadge`.

### Props

| Prop | Type | Default |
|------|------|---------|
| `score` | `number` | required |
| `previousScore` | `number \| null` | `undefined` |
| `size` | `'default' \| 'compact'` | `'default'` |

### Tier Color Mapping

| Tier | Range | BG | Text | Border |
|------|-------|----|------|--------|
| Hot | 80-100 | #dcfce7 | #16a34a | #86efac |
| Warm | 50-79 | #fef9c3 | #ca8a04 | #fde047 |
| Cool | 20-49 | #e0f2fe | #0284c7 | #7dd3fc |
| Cold | 0-19 | #f1f5f9 | #94a3b8 | #cbd5e1 |

### Size Variants

- `default`: 42px circle, 14px bold font
- `compact`: 24px circle, 10px bold font

### Change Arrows

- Only rendered when `previousScore` is non-null and `|score - previousScore| >= 5`
- Increase: green (#16a34a) up arrow (↑)
- Decrease: red (#ef4444) down arrow (↓)
- Positioned immediately right of the circle via `inline-flex gap-0.5` wrapper

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: Create ScoreBadge component | 6c97ffd | frontend/src/app/dashboard/components/score-badge.tsx |

## Verification

- [x] File exists at `frontend/src/app/dashboard/components/score-badge.tsx`
- [x] Named export `ScoreBadge` present (no default export)
- [x] TypeScript compiles with no errors (no `score-badge` errors in `tsc --noEmit`)
- [x] All four tiers implemented (0-19, 20-49, 50-79, 80-100)
- [x] Both size variants implemented (42px default, 24px compact)
- [x] Change arrow logic respects >= 5 threshold
- [x] Component is ready for consumption by Steps 8-10

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `frontend/src/app/dashboard/components/score-badge.tsx`: FOUND
- Commit `6c97ffd`: FOUND
