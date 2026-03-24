---
phase: 4
slug: core-call-flow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | go test (backend), manual curl (webhooks) |
| **Config file** | none — Go test is built-in |
| **Quick run command** | `cd backend && go build ./...` |
| **Full suite command** | `cd backend && go build ./... && cd ../frontend && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && go build ./...`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | CALL-07 | build | `cd backend && go build ./...` | N/A | pending |
| 04-01-02 | 01 | 1 | CALL-01 | build | `cd backend && go build ./...` | N/A | pending |
| 04-01-03 | 01 | 1 | CALL-06 | build | `cd backend && go build ./...` | N/A | pending |
| 04-02-01 | 02 | 2 | CALL-02 | build+curl | `cd backend && go build ./...` | N/A | pending |
| 04-02-02 | 02 | 2 | CALL-03 | build+curl | `cd backend && go build ./...` | N/A | pending |
| 04-02-03 | 02 | 2 | CALL-04 | build | `cd backend && go build ./...` | N/A | pending |
| 04-02-04 | 02 | 2 | CALL-05 | build | `cd backend && go build ./...` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. Go build validates compilation. Manual curl testing validates webhook flows.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two-leg bridge call flow | CALL-02 | Requires real Twilio account + phone | Initiate call via API, verify agent phone rings, answer, verify client phone rings |
| Inbound call forwarding | CALL-03 | Requires real inbound call to Twilio number | Call Twilio number, verify agent phone rings with caller ID |
| Recording consent announcement | CALL-04 | Requires listening to audio | Make test call, verify consent message plays before bridge |
| Real-time status updates | CALL-05 | Requires running app + Twilio | Make call, watch communication page for status changes |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
