---
phase: quick
plan: 260325-e4t
subsystem: frontend
tags: [lead-scoring, scorebadge, contact-detail, pipeline, ui]
dependency_graph:
  requires: [260325-dqz]
  provides: [ScoreBadge on contact detail page, ScoreBadge on pipeline deal cards]
  affects: [frontend/src/app/dashboard/contacts/[id]/page.tsx, frontend/src/app/dashboard/pipeline/page.tsx]
tech_stack:
  added: []
  patterns: [TanStack Query settings fetch, IIFE JSX pattern for conditional render]
key_files:
  created: []
  modified:
    - frontend/src/app/dashboard/contacts/[id]/page.tsx
    - frontend/src/app/dashboard/pipeline/page.tsx
decisions:
  - Used IIFE pattern in pipeline JSX to look up contact score without adding extra variables
  - Dimension breakdown rendered inline (not modal) to avoid overlay complexity on detail page
metrics:
  duration: 8 minutes
  completed: 2026-03-25
---

# Phase quick Plan 260325-e4t: Add ScoreBadge to Contact Detail and Pipeline Summary

**One-liner:** ScoreBadge added to contact detail header (expandable dimension breakdown) and pipeline deal cards (compact, gated by show_lead_scores setting).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add ScoreBadge with expandable dimension breakdown to contact detail page | 42e6820 | contacts/[id]/page.tsx |
| 2 | Add compact ScoreBadge to pipeline deal cards with settings gating | ebc7606 | pipeline/page.tsx |

## What Was Built

### Contact Detail Page (contacts/[id]/page.tsx)
- Imported `ScoreBadge` from `@/app/dashboard/components/score-badge`
- Imported `getSettings` from `@/lib/api/settings`
- Added `ChevronUp` to lucide-react imports
- Added `scoreExpanded` state variable for toggle behavior
- Added settings query (`queryKey: ["settings"]`) and derived `showScores` flag
- Rendered ScoreBadge in header section, below source badge, when `showScores && contact.lead_score > 0`
- Clicking ScoreBadge toggles an inline dimension breakdown card with four progress bars (Engagement/30, Readiness/30, Velocity/20, Profile/20)
- Breakdown values sourced from `contact.lead_score_signals` with `?? 0` fallback

### Pipeline Page (pipeline/page.tsx)
- Imported `ScoreBadge` from `@/app/dashboard/components/score-badge`
- Imported `getSettings` from `@/lib/api/settings`
- Added settings query and `showScores` flag
- Built `contactScoreMap` (Map<contact_id, contact>) for O(1) score lookup
- Rendered compact ScoreBadge before the health dot in the deal card bottom row
- IIFE pattern used: `{showScores && (() => { const sc = ...; return sc ? <ScoreBadge .../> : null; })()}`
- Only renders when contact has `lead_score > 0`

## Verification

- `npx next lint --file src/app/dashboard/pipeline/page.tsx` — no warnings or errors
- `npx next lint --file src/app/dashboard/contacts/[id]/page.tsx` — only pre-existing line 60 `any[]` type (not introduced by this task)
- `npx next build` — compiled successfully, no new errors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows from live `contact.lead_score`, `contact.lead_score_signals`, and `contact.previous_lead_score` fields.

## Self-Check: PASSED

- contacts/[id]/page.tsx modified: confirmed (54 insertions, commit 42e6820)
- pipeline/page.tsx modified: confirmed (20 insertions, commit ebc7606)
- Both commits exist in git log
- Build passes without errors
