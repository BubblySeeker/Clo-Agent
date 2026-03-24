---
phase: 07-frontend-call-experience
plan: 01
subsystem: api
tags: [go, twilio, twiml, amd, whisper, postgresql]

# Dependency graph
requires:
  - phase: 05-recording-infrastructure
    provides: "Local MP3 recordings, downloadAndStoreRecording, RecordingWebhook"
  - phase: 06-ai-transcription-intelligence
    provides: "call_transcripts table, GetCallTranscript endpoint, TranscriptSection component"
provides:
  - "outcome and answered_by columns on call_logs (migration 019)"
  - "PATCH /api/calls/{id} endpoint for outcome tagging"
  - "POST /api/calls/whisper TwiML endpoint with contact context"
  - "POST /api/calls/amd-webhook for async answering machine detection"
  - "MachineDetection=DetectMessageEnd on outbound calls"
  - "answerOnBridge + whisper URL on inbound call TwiML"
affects: [07-02, frontend-communication, ai-tools]

# Tech tracking
tech-stack:
  added: []
  patterns: [twilio-async-amd, twilio-whisper-via-number-url, outcome-tagging]

key-files:
  created:
    - backend/migrations/019_call_outcome.sql
  modified:
    - backend/internal/handlers/calls.go
    - backend/cmd/api/main.go

key-decisions:
  - "SetAsyncAmd takes string 'true' not bool in twilio-go SDK v1.30.3"
  - "Whisper queries contact name, deal stage, and buyer profile budget/property type for maximum agent context"
  - "AMD auto-sets outcome to voicemail only via COALESCE to preserve manual overrides"

patterns-established:
  - "Outcome tagging: nullable TEXT column with agent-editable values, separate from Twilio status"
  - "Whisper pattern: InboundCallWebhook inserts with RETURNING id, passes call_id to whisper URL"
  - "AMD pattern: async detection with auto-voicemail tagging, agent can override"

requirements-completed: [FE-04, FE-05, FE-06]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 07 Plan 01: Backend Call Outcome, Whisper, and AMD Summary

**Call outcome PATCH endpoint, inbound whisper TwiML with contact/deal/buyer context, and async answering machine detection with auto-voicemail tagging**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T23:38:17Z
- **Completed:** 2026-03-24T23:41:08Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Migration 019 adds outcome and answered_by columns to call_logs for call result tracking
- UpdateCallLog PATCH handler enables frontend to tag call outcomes (connected, voicemail, no_answer, etc.)
- WhisperEndpoint returns TwiML with contact name, active deal stage, and buyer profile budget/property type
- AMDWebhook stores Twilio answered_by result and auto-sets outcome to voicemail for machine detections
- InitiateCall now includes async AMD params (MachineDetection=DetectMessageEnd)
- InboundCallWebhook TwiML updated with answerOnBridge=true and whisper URL on Number noun
- GetCallLog and ListCallLogs both return outcome and answered_by fields in responses

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration and UpdateCallLog + WhisperEndpoint + AMDWebhook handlers** - `6a65ac2` (feat)

## Files Created/Modified
- `backend/migrations/019_call_outcome.sql` - Adds outcome TEXT and answered_by TEXT columns to call_logs
- `backend/internal/handlers/calls.go` - UpdateCallLog, WhisperEndpoint, AMDWebhook handlers; modified InitiateCall (AMD), InboundCallWebhook (whisper+answerOnBridge), GetCallLog and ListCallLogs (new fields)
- `backend/cmd/api/main.go` - Route registration for whisper, amd-webhook (public) and PATCH calls/{id} (protected)

## Decisions Made
- SetAsyncAmd takes string "true" not bool -- discovered via build error, twilio-go SDK v1.30.3 types this as string
- Whisper queries contact name + deal stage + buyer profile (budget, property type) to give agent maximum context before connecting
- AMD auto-sets outcome to voicemail only when outcome is NULL (COALESCE), preserving any manual override the agent may have set
- InboundCallWebhook changed from pool.Exec to pool.QueryRow with RETURNING id to get call_id for whisper URL

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SetAsyncAmd parameter type mismatch**
- **Found during:** Task 1 (build verification)
- **Issue:** Plan specified `params.SetAsyncAmd(true)` but twilio-go SDK expects string "true"
- **Fix:** Changed to `params.SetAsyncAmd("true")`
- **Files modified:** backend/internal/handlers/calls.go
- **Verification:** go build ./... passes
- **Committed in:** 6a65ac2

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type fix required by SDK API. No scope creep.

## Issues Encountered
None beyond the type mismatch noted above.

## User Setup Required
None - no external service configuration required. Existing Twilio credentials and WEBHOOK_BASE_URL env var are sufficient.

## Next Phase Readiness
- Backend endpoints ready for Plan 02 frontend integration (outcome dropdown, AMD status display)
- Whisper and AMD webhooks registered and ready for Twilio to call
- Migration ready to apply to database

## Self-Check

Verified via automated acceptance criteria:
- Migration file exists with outcome and answered_by columns
- All 3 new handler functions exist (UpdateCallLog, WhisperEndpoint, AMDWebhook)
- AMD params present in InitiateCall (SetMachineDetection, SetAsyncAmd)
- answerOnBridge and whisper URL present in InboundCallWebhook TwiML
- Routes registered in main.go (whisper, amd-webhook, PATCH)
- Backend compiles clean: `go build ./...` exits 0

---
*Phase: 07-frontend-call-experience*
*Completed: 2026-03-24*
