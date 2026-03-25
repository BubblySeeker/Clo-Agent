---
phase: quick
plan: 260325-dat
subsystem: backend/contacts
tags: [lead-scoring, sorting, contacts, api]
dependency_graph:
  requires: [step-3-scoring-triggers]
  provides: [step-4-sort-score, step-4-going-cold-count]
  affects: [frontend-contacts-list, frontend-going-cold-banner]
tech_stack:
  added: []
  patterns: [chi-route-ordering, dynamic-order-clause]
key_files:
  created: []
  modified:
    - backend/internal/handlers/contacts.go
    - backend/cmd/api/main.go
decisions:
  - Used secondary sort (lead_score DESC, created_at DESC) for stable ordering of contacts with equal scores
  - NOT EXISTS subquery for going-cold detection — cleaner than LEFT JOIN, handles zero-activity contacts correctly
  - Route registered before {id} wildcard to prevent Chi matching "going-cold-count" as a contact ID
metrics:
  duration: ~5 minutes
  completed_date: "2026-03-25"
  tasks: 2
  files_modified: 2
---

# Quick Task 260325-dat: Add sort=score to ListContacts and GoingColdCount

**One-liner:** Sort-by-lead-score query param and going-cold count endpoint added to contacts API (Step 4 of lead scoring pipeline).

## What Was Built

Two backend changes implementing Step 4 of the lead scoring feature:

1. **`sort=score` query param in `ListContacts`** — When `?sort=score` is passed, the SQL ORDER BY switches from `c.created_at DESC` to `c.lead_score DESC, c.created_at DESC`. Default sort is completely unchanged. Secondary `created_at DESC` sort ensures stable ordering for contacts sharing the same score.

2. **`GoingColdCount` handler** — New handler at `GET /api/contacts/going-cold-count` returning `{"count": N}`. Counts contacts with `lead_score < 20` AND no activity in the last 14 days (via NOT EXISTS subquery against activities table). Uses the standard RLS transaction pattern.

3. **Route registration** — Route placed between `POST /api/contacts` and `GET /api/contacts/{id}` in main.go. Critical: if placed after `{id}`, Chi would match the literal string "going-cold-count" as a contact ID.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add sort=score to ListContacts + GoingColdCount handler | 28d19cd | backend/internal/handlers/contacts.go |
| 2 | Register going-cold-count route | 8516489 | backend/cmd/api/main.go |

## Verification

- `go build ./...` passed with zero errors
- `go vet ./...` passed with zero warnings
- Sort param injection uses string interpolation only for the order clause (not user input directly), preserving SQL injection safety

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both changes are fully functional. The going-cold-count endpoint returns live data from the database. Sort ordering is live.

## Self-Check: PASSED

- `backend/internal/handlers/contacts.go` modified — verified
- `backend/cmd/api/main.go` modified — verified
- Commit `28d19cd` exists — verified
- Commit `8516489` exists — verified
