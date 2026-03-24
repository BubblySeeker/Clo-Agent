---
phase: 8
slug: mobile-dialer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | npx tsc --noEmit (mobile TypeScript check) |
| **Quick run command** | `cd mobile && npx tsc --noEmit 2>&1 | head -20` |
| **Full suite command** | `cd mobile && npx expo export --platform web --output-dir /tmp/expo-check 2>&1 | tail -5` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run TypeScript check
- **After every plan wave:** Run full export check
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 08-01-01 | 01 | 1 | MOB-01 | build | `cd mobile && npx tsc --noEmit` | pending |
| 08-01-02 | 01 | 1 | MOB-02 | build | `cd mobile && npx tsc --noEmit` | pending |
| 08-02-01 | 02 | 2 | MOB-03, MOB-05 | build | `cd mobile && npx tsc --noEmit` | pending |
| 08-02-02 | 02 | 2 | MOB-04 | build | `cd mobile && npx tsc --noEmit` | pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clerk sign-in works | MOB-01 | Requires real device + Clerk account | Open app, sign in with test credentials |
| Contact list loads | MOB-02 | Requires running backend + auth | Sign in, navigate to contacts, verify list |
| Call bridges within 3s | MOB-03 | Requires Twilio + real phone | Tap call on contact, verify phone rings |
| Call history + transcripts | MOB-04 | Requires completed calls | View call history, tap call for transcript |
| Phone number config | MOB-05 | Requires UI interaction | Open settings, enter phone, verify persists |

---

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] Sampling continuity maintained
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
