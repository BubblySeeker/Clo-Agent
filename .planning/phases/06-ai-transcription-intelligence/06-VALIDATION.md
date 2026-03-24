---
phase: 6
slug: ai-transcription-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | go build (backend), python ast.parse (ai-service), npx tsc --noEmit (frontend) |
| **Quick run command** | `cd backend && go build ./...` |
| **AI service check** | `python3 -c "import ast; ast.parse(open('ai-service/app/tools.py').read()); ast.parse(open('ai-service/app/services/agent.py').read()); print('OK')"` |
| **Full suite command** | `cd backend && go build ./... && cd .. && python3 -c "import ast; ast.parse(open('ai-service/app/tools.py').read()); ast.parse(open('ai-service/app/services/agent.py').read()); ast.parse(open('ai-service/app/routes/chat.py').read()); print('OK')"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick build check for modified service
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 06-01-01 | 01 | 1 | AI-01 | build+ast | `cd backend && go build ./... && python3 -c "import ast; ast.parse(open('ai-service/app/services/transcription.py').read()); print('OK')"` | pending |
| 06-01-02 | 01 | 1 | AI-02 | ast | AI service check | pending |
| 06-02-01 | 02 | 2 | AI-03, AI-04 | ast | AI service check | pending |
| 06-02-02 | 02 | 2 | AI-05, AI-06 | ast+build | Full suite command | pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Transcript appears within 3 min | AI-01 | Requires real Twilio call + recording | Complete call, wait, check call detail |
| Speaker labels correct | AI-01 | Requires real dual-channel audio | Verify Agent/Client labels match actual speakers |
| AI summary quality | AI-02 | Subjective quality check | Review generated summary for accuracy |
| Confirmation cards appear | AI-03 | Requires full UI + AI pipeline | Complete call, check for task/update suggestions |
| Chat returns transcript info | AI-04 | Requires running AI service | Ask chat about call topics |
| Semantic search finds transcripts | AI-05 | Requires embeddings + search | Search for discussed topic |

---

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] Sampling continuity maintained
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
