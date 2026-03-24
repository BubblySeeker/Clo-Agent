---
phase: 7
slug: frontend-call-experience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | go build (backend), npx tsc --noEmit (frontend) |
| **Quick run command** | `cd backend && go build ./...` |
| **Frontend check** | `cd frontend && npx tsc --noEmit 2>&1 | head -20` |
| **Full suite command** | `cd backend && go build ./... && cd ../frontend && npx tsc --noEmit 2>&1 | head -20` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick build for modified service
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 07-01-01 | 01 | 1 | FE-04 | build | `cd backend && go build ./...` | pending |
| 07-01-02 | 01 | 1 | FE-05, FE-06 | build | `cd backend && go build ./...` | pending |
| 07-02-01 | 02 | 2 | FE-01, FE-02, FE-03, FE-04 | build+ts | Full suite | pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Call detail panel shows transcript | FE-01 | Requires running app + data | Open communication page, click call, verify transcript |
| Audio playback works | FE-02 | Requires browser + recording | Click play on call with recording |
| AI action cards confirm/dismiss | FE-03 | Requires AI pipeline | Complete call, verify cards appear and work |
| Outcome tag persists | FE-04 | Requires UI interaction | Tag call, refresh, verify tag persists |
| Whisper plays on inbound | FE-05 | Requires real Twilio call | Call the Twilio number, verify agent hears whisper |
| AMD detects voicemail | FE-06 | Requires real Twilio call | Call voicemail, verify detection |

---

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] Sampling continuity maintained
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
