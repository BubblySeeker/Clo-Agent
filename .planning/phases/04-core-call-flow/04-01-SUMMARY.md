---
phase: 04-core-call-flow
plan: 01
subsystem: backend/twilio-voice
tags: [twilio, voice, bugfix, infrastructure, migration]
dependency_graph:
  requires: []
  provides: [twilio_util.go, personal_phone_column, webhook_base_url_config, twilio-go-sdk]
  affects: [calls.go, sms.go, config.go]
tech_stack:
  added: [twilio-go v1.30.3]
  patterns: [shared-twilio-utils, rls-webhook, signature-validation]
key_files:
  created:
    - backend/internal/handlers/twilio_util.go
    - backend/migrations/016_voice_calling.sql
  modified:
    - backend/internal/handlers/calls.go
    - backend/internal/handlers/sms.go
    - backend/internal/config/config.go
    - backend/go.mod
    - backend/go.sum
decisions:
  - Activity logging moved from call initiation to terminal status webhook for accuracy
  - personal_phone uses COALESCE to preserve existing value when not provided
metrics:
  duration: 3m17s
  completed: 2026-03-24T14:57:18Z
  tasks: 3/3
  files_changed: 7
---

# Phase 4 Plan 1: Foundation, Bug Fixes, and Shared Infrastructure Summary

Bug-free call status webhook with Twilio signature validation and RLS, shared Twilio utilities extracted to twilio_util.go, personal_phone DB column for two-leg bridge calling, WebhookBaseURL config, and twilio-go SDK installed.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install twilio-go SDK, create migration, add WebhookBaseURL config | f175a35 | go.mod, 016_voice_calling.sql, config.go |
| 2 | Extract shared Twilio utilities and fix SMS activity type bug | 01d55b9 | twilio_util.go, sms.go |
| 3 | Fix CallStatusWebhook with signature validation + RLS, update SMSConfigure/SMSStatus for personal_phone | 2d707ae | calls.go, sms.go |

## What Was Built

1. **twilio-go SDK installed** (v1.30.3) -- dependency ready for Plan 02's two-leg bridge call flow
2. **Migration 016** adds `personal_phone TEXT` column to `twilio_config` table
3. **WebhookBaseURL** config field loaded from `WEBHOOK_BASE_URL` env var with startup warning if empty
4. **twilio_util.go** consolidates 5 shared functions: `validateTwilioSignature`, `normalizePhone`, `matchContactByPhone`, `buildContactPhoneMap`, `matchPhoneInMap`
5. **SMS activity type bug fixed** -- activities logged as `'sms'` instead of incorrect `'call'`
6. **CallStatusWebhook rewritten** with: Twilio signature validation (rejects with 403), RLS transactions for agent-scoped writes, terminal-status activity logging with call duration formatting
7. **InitiateCall fixed** -- uses RLS for call_logs INSERT, premature activity logging removed (now happens in webhook on terminal status)
8. **SMSConfigure** accepts optional `personal_phone` field, preserves existing value via COALESCE
9. **SMSStatus** returns `personal_phone` in response

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Activity logging moved to webhook**: Instead of logging "Outbound call to X" at initiation (before knowing outcome), activities are now logged at terminal status with actual duration and outcome.
2. **COALESCE for personal_phone**: When SMSConfigure is called without personal_phone, the existing value is preserved rather than being nulled out.

## Verification Results

- `go build ./...` exits 0
- `validateTwilioSignature` exists only in twilio_util.go (not duplicated in sms.go)
- SMS activity type confirmed as `'sms'` (not `'call'`)
- `personal_phone` present in both SMSConfigure and SMSStatus
- `WebhookBaseURL` field exists in config with env loading and warning

## Self-Check: PASSED

All 5 created/modified files verified on disk. All 3 commit hashes verified in git log.
