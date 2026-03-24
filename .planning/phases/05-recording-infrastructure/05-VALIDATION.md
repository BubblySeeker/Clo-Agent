---
phase: 5
slug: recording-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | go test (backend), manual curl (webhooks/proxy) |
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
| 05-01-01 | 01 | 1 | REC-05 | build | `cd backend && go build ./...` | N/A | pending |
| 05-01-02 | 01 | 1 | REC-01 | build | `cd backend && go build ./...` | N/A | pending |
| 05-01-03 | 01 | 1 | REC-02, REC-04 | build | `cd backend && go build ./...` | N/A | pending |
| 05-02-01 | 02 | 2 | REC-03 | build+curl | `cd backend && go build ./... && cd ../frontend && npx tsc --noEmit` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. Go build validates compilation. Manual curl testing validates webhook/proxy flows.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dual-channel recording created | REC-01 | Requires real Twilio call | Make call, verify recording has 2 channels |
| Recording appears within 60s | REC-02 | Requires real Twilio webhook | Complete call, check call detail for recording |
| Audio playback works | REC-03 | Requires browser + audio file | Click play in communication page |
| Twilio copy deleted after download | REC-04 | Requires real Twilio account | Check Twilio console after recording processed |
| Auth tokens encrypted in DB | REC-05 | Requires DB inspection | Query twilio_config, verify auth_token is not plaintext |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
