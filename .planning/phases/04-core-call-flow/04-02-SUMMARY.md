---
phase: 04-core-call-flow
plan: 02
subsystem: api
tags: [twilio, voice, twiml, two-leg-bridge, calls, webhook]

# Dependency graph
requires:
  - phase: 04-core-call-flow/01
    provides: call_logs table, twilio_util.go shared functions, personal_phone column, WebhookBaseURL config
provides:
  - Two-leg bridge outbound call flow (agent phone rings first, bridges to client)
  - TwiML bridge endpoint for consent announcement + client dial
  - Inbound call forwarding webhook to agent's personal phone
  - Personal phone settings UI in Settings page
  - Dynamic call status polling (5s active, 30s idle)
  - Backend personal-phone-only update path
affects: [04-core-call-flow/03, 05-recording-transcription]

# Tech tracking
tech-stack:
  added: [twilio-go SDK for call creation]
  patterns: [two-leg bridge call pattern, TwiML XML response endpoints, dynamic refetchInterval]

key-files:
  created: []
  modified:
    - backend/internal/handlers/calls.go
    - backend/cmd/api/main.go
    - backend/internal/handlers/sms.go
    - frontend/src/lib/api/sms.ts
    - frontend/src/app/dashboard/settings/page.tsx
    - frontend/src/app/dashboard/communication/page.tsx

key-decisions:
  - "Used twilio-go SDK instead of raw HTTP for call creation (cleaner, typed params)"
  - "Personal phone update reuses /sms/configure endpoint with empty credential fields to avoid new endpoint"
  - "TwiML bridge validates signature only on POST (Twilio may hit via GET initially)"

patterns-established:
  - "Two-leg bridge: insert call_logs first to get ID, pass ID in TwiML URL for lookup"
  - "Public TwiML endpoints return XML error responses (not JSON) for Twilio compatibility"

requirements-completed: [CALL-02, CALL-03, CALL-04, CALL-05]

# Metrics
duration: 4m41s
completed: 2026-03-24
---

# Phase 4 Plan 2: Core Call Flow Summary

**Two-leg bridge outbound calls via twilio-go SDK with consent announcement, inbound forwarding, and personal phone settings UI**

## Performance

- **Duration:** 4m 41s
- **Started:** 2026-03-24T15:00:06Z
- **Completed:** 2026-03-24T15:04:47Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Rewrote InitiateCall to use two-leg bridge: Twilio calls agent's personal phone first, TwiML bridge plays consent then dials client
- Added InboundCallWebhook that forwards incoming calls to agent's personal phone with caller ID passthrough
- Settings page now has personal phone number input for both new and existing Twilio configurations
- Communication page dynamically polls every 5s during active calls, 30s when idle

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite InitiateCall with two-leg bridge, add TwiMLBridge and InboundCallWebhook** - `7f743ab` (feat)
2. **Task 2: Frontend personal phone field, SMSStatus type update, dynamic polling** - `4e51a40` (feat)

## Files Created/Modified
- `backend/internal/handlers/calls.go` - Rewritten InitiateCall + new TwiMLBridge + InboundCallWebhook + xmlEscape helper
- `backend/cmd/api/main.go` - Registered public routes for TwiML bridge and inbound webhook, updated InitiateCall signature
- `backend/internal/handlers/sms.go` - Added personal-phone-only update path in SMSConfigure
- `frontend/src/lib/api/sms.ts` - Added personal_phone to SMSStatus interface and configureSMS params
- `frontend/src/app/dashboard/settings/page.tsx` - Personal phone input in both configured and unconfigured Twilio states
- `frontend/src/app/dashboard/communication/page.tsx` - Dynamic refetchInterval based on active call status

## Decisions Made
- Used twilio-go SDK instead of raw HTTP for call creation -- typed params, cleaner error handling
- Reused /sms/configure endpoint for personal-phone-only updates (empty credentials trigger update-only path) to avoid a new endpoint
- TwiML bridge validates Twilio signature only on POST requests since Twilio may initially hit via GET

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `io` import after rewrite**
- **Found during:** Task 1
- **Issue:** After rewriting InitiateCall to use twilio-go SDK, the `io` import was no longer needed (was used for `io.ReadAll` in the raw HTTP approach)
- **Fix:** Removed unused import
- **Files modified:** backend/internal/handlers/calls.go
- **Verification:** `go build ./...` passes
- **Committed in:** 7f743ab (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial cleanup. No scope creep.

## Issues Encountered
- TypeScript compiler not installed in frontend (pre-existing) -- verified changes via Go build and manual file inspection

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core call flow complete: outbound two-leg bridge, inbound forwarding, consent announcements
- Ready for Phase 5 (recording + transcription) which builds on these call endpoints
- WEBHOOK_BASE_URL must be set for production use (ngrok for development)

---
*Phase: 04-core-call-flow*
*Completed: 2026-03-24*
