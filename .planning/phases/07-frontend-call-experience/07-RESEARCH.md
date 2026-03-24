# Phase 7: Frontend Call Experience - Research

**Researched:** 2026-03-24
**Domain:** Frontend UI (Next.js 14 / React), Twilio TwiML (whisper, AMD), Go backend (outcome tagging, whisper endpoint)
**Confidence:** HIGH

## Summary

Phase 7 builds the frontend call detail experience on top of the transcription pipeline (Phase 6) and recording infrastructure (Phase 5). The critical insight is that Phases 5 and 6 already deliver most of the heavy lifting: `RecordingPlayer`, `TranscriptSection`, `AIActionCard` components, `GetCallTranscript`/`ConfirmTranscriptAction`/`DismissTranscriptAction` Go endpoints, and the `ProxyRecording` endpoint. Phase 7's unique scope is: (1) a call detail modal/panel that integrates all these existing components into a cohesive view, (2) call outcome tagging (new DB column + Go endpoint + frontend UI), (3) inbound call whisper (TwiML `<Number url>` attribute + Go whisper endpoint), and (4) outbound voicemail detection (`MachineDetection` Twilio API parameter).

The whisper and AMD features require backend TwiML changes in the Go handlers, not just frontend work. The whisper uses Twilio's `url` attribute on the `<Number>` noun inside `<Dial>` to play a private message to the agent before connecting to the caller. AMD uses the `MachineDetection=DetectMessageEnd` parameter on the Twilio REST API call, with an `AsyncAmd=true` option and a `MachineDetectionUrl` callback.

**Primary recommendation:** Split into 2 plans: (1) call detail panel + outcome tagging (pure frontend + simple backend), (2) whisper + AMD backend TwiML changes. This keeps the frontend-heavy work separate from the Twilio webhook changes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FE-01 | Agent can view call transcripts with speaker labels in the communication page | TranscriptSection component already planned in 06-02. Phase 7 integrates it into a call detail modal/panel. |
| FE-02 | Agent can play call recordings with an audio player in call detail view | RecordingPlayer component already built in 05-02. Phase 7 wraps it in the call detail panel. |
| FE-03 | AI action suggestion cards appear in call detail with confirm/dismiss buttons | AIActionCard + TranscriptSection already planned in 06-02. Phase 7 ensures they render correctly in the call detail panel. |
| FE-04 | Agent can tag call outcomes (Connected, Voicemail, No Answer) | New: requires `outcome` column on call_logs, PATCH endpoint, and frontend dropdown. |
| FE-05 | Inbound calls include a whisper (agent hears contact name and key context before being connected) | New: requires TwiML `<Number url>` attribute pointing to a whisper endpoint that returns `<Say>` with contact context. |
| FE-06 | Outbound calls detect voicemail automatically (MachineDetection) | New: requires `MachineDetection=DetectMessageEnd` on the Twilio API call, AMD callback endpoint, and frontend status display. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14 | App Router, page rendering | Already in use |
| TanStack Query | latest | Server state, cache invalidation | Already in use for all API data |
| Tailwind CSS | latest | All styling | Already in use, no component library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | latest | Icons | Already in use (Phone, PhoneCall, Play, etc.) |
| @clerk/nextjs | v5 | Auth (getToken for API calls) | Already in use for all authenticated requests |

### No New Dependencies
Phase 7 requires zero new frontend or backend packages. All work uses existing infrastructure.

## Architecture Patterns

### What Phase 6 Already Delivers (DO NOT REBUILD)

These components and endpoints are planned in `06-02-PLAN.md` and will exist when Phase 7 starts:

**Go Backend:**
- `GET /api/calls/{id}/transcript` -- returns transcript with speaker_segments, ai_summary, ai_actions
- `POST /api/calls/{id}/transcript/actions/{index}/confirm` -- executes AI action and marks confirmed
- `POST /api/calls/{id}/transcript/actions/{index}/dismiss` -- marks AI action as dismissed

**Frontend (in communication/page.tsx):**
- `TranscriptSection` component -- shows AI summary, pending action cards, expandable transcript with speaker labels
- `AIActionCard` component -- renders action type badge, description, Confirm/Dismiss buttons
- `RecordingPlayer` component (from Phase 5) -- on-demand audio blob fetch + HTML5 audio element

**Frontend API (in calls.ts):**
- `CallTranscript` and `AIAction` TypeScript interfaces
- `getCallTranscript()`, `confirmTranscriptAction()`, `dismissTranscriptAction()` functions
- `transcription_status` field on `CallLog` interface

### What Phase 7 MUST Build

#### 1. Call Detail Panel/Modal
The communication page currently renders call items inline in the detail pane. Phase 7 needs a dedicated call detail view that aggregates:
- Call metadata (direction, status, duration, contact, timestamps)
- Outcome tag (new)
- Recording player (existing `RecordingPlayer`)
- Transcript + AI actions (existing `TranscriptSection`)

**Pattern:** Inline expansion panel within the existing communication page detail pane, NOT a separate page or modal. This matches the existing UX pattern where clicking an email/SMS shows detail in the right pane.

```
src/app/dashboard/communication/page.tsx
  - CallDetailPanel component (new, inline)
    - Call metadata header
    - OutcomeTagDropdown (new)
    - RecordingPlayer (existing)
    - TranscriptSection (existing, includes AIActionCard)
```

#### 2. Call Outcome Tagging

**Backend:**
- Migration `019_call_outcome.sql`: `ALTER TABLE call_logs ADD COLUMN outcome TEXT;`
- Update `GetCallLog` and `ListCallLogs` to return `outcome` field
- New endpoint or extend existing PATCH: `PATCH /api/calls/{id}` with `{outcome: "connected"}` body
  - Simplest: add a `UpdateCallLog` handler that accepts partial updates (just outcome for now)
  - Alternative: dedicated `POST /api/calls/{id}/outcome` endpoint

**Frontend:**
- Add `outcome: string | null` to `CallLog` interface
- Dropdown with options: Connected, Voicemail, No Answer, Wrong Number, Left Message
- Auto-set from Twilio status where possible: `no-answer` -> "No Answer", `busy` -> "Busy"
- Manual override always allowed

**Values:** `"connected" | "voicemail" | "no_answer" | "wrong_number" | "left_message" | "busy" | null`

#### 3. Inbound Call Whisper (FE-05)

This is a backend TwiML change, not a frontend feature. The "frontend" aspect is that the agent hears the whisper on their phone.

**How Twilio whisper works:**
The `<Number>` noun inside `<Dial>` supports a `url` attribute. When specified, Twilio fetches TwiML from that URL and executes it on the called party's end (the agent) BEFORE connecting the two parties. The caller continues to hear ringing during this time (requires `answerOnBridge="true"` on `<Dial>`).

**Implementation:**
1. Modify `InboundCallWebhook` in `calls.go` to add `url` attribute on `<Number>`:
```xml
<Response>
  <Say>This call may be recorded for quality purposes.</Say>
  <Dial callerId="+15551234567" record="record-from-answer-dual"
        recordingStatusCallback="..." answerOnBridge="true">
    <Number url="{webhookBaseURL}/api/calls/whisper?call_id={callID}">+15559876543</Number>
  </Dial>
</Response>
```

2. New Go endpoint `GET /api/calls/whisper?call_id={id}` (PUBLIC, no Clerk auth):
   - Look up call_logs by ID to get contact_id
   - If contact matched: query contact name, active deal stage, buyer profile summary
   - Return TwiML `<Say>` with context: "Incoming call from Sarah Johnson, deal at Touring stage, looking for 4 bedroom in Denver"
   - If no contact matched: return `<Say>Incoming call from unknown number</Say>`
   - Validate Twilio signature (POST method)

3. The caller hears ringing the whole time (answerOnBridge). The agent hears the whisper privately, then both parties are connected.

#### 4. Outbound Voicemail Detection (FE-06)

**How Twilio AMD works:**
Add `MachineDetection=DetectMessageEnd` parameter to the Twilio REST API `CreateCall` in `InitiateCall`. This makes Twilio analyze the audio when the call is answered:
- If human answers: call proceeds normally
- If machine detected: Twilio waits for the beep, then triggers the `MachineDetectionUrl` callback

**Implementation:**
1. Modify `InitiateCall` in `calls.go`:
```go
params.SetMachineDetection("DetectMessageEnd")
params.SetAsyncAmd(true)
params.SetAsyncAmdStatusCallback(cfg.WebhookBaseURL + "/api/calls/amd-webhook")
params.SetAsyncAmdStatusCallbackMethod("POST")
```

2. New Go endpoint `POST /api/calls/amd-webhook` (PUBLIC):
   - Parse `AnsweredBy` from form data
   - Values: `human`, `machine_start`, `machine_end_beep`, `machine_end_silence`, `machine_end_other`, `fax`, `unknown`
   - Update `call_logs` with `answered_by` column
   - If machine detected: auto-set outcome to "voicemail"

3. Migration: `ALTER TABLE call_logs ADD COLUMN answered_by TEXT;`

4. Frontend: show "Voicemail Detected" badge on calls where `answered_by` starts with "machine_"

### Recommended Project Structure Changes

No new files beyond what's described. All changes are to existing files:

```
backend/
  migrations/019_call_outcome.sql     # outcome + answered_by columns
  internal/handlers/calls.go          # UpdateCallLog, WhisperEndpoint, AMDWebhook handlers
  cmd/api/main.go                     # Route registration

frontend/
  src/lib/api/calls.ts                # outcome, answered_by fields + updateCallOutcome function
  src/app/dashboard/communication/page.tsx  # CallDetailPanel, OutcomeTagDropdown
```

### Anti-Patterns to Avoid
- **Do NOT create a separate call detail page** -- the communication page already has a detail pane pattern. Use it.
- **Do NOT rebuild TranscriptSection or AIActionCard** -- they exist from Phase 6.
- **Do NOT add whisper for outbound calls** -- whisper is only for inbound (agent needs context about who is calling). On outbound, the agent already knows who they are calling.
- **Do NOT use synchronous AMD** -- always use `AsyncAmd=true` so the call connects immediately while detection happens in the background. Synchronous AMD adds 3-5 seconds of silence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio playback | Custom audio controls | Existing `RecordingPlayer` + HTML5 `<audio>` | Already built in Phase 5, handles blob auth fetch |
| Transcript display | New transcript component | Existing `TranscriptSection` from Phase 6 | Already handles speaker labels, summary, action cards |
| AI action confirm/dismiss | New confirmation system | Existing `AIActionCard` from Phase 6 | Already wired to backend endpoints |
| Call status polling | WebSocket or SSE | Existing TanStack Query refetchInterval | Already 5s during active calls from Phase 4 |

## Common Pitfalls

### Pitfall 1: Whisper TwiML Scope Limitation
**What goes wrong:** Trying to use `<Dial>` or `<Gather>` in the whisper TwiML response.
**Why it happens:** The `url` on `<Number>` only supports `<Say>`, `<Play>`, `<Pause>`, `<Gather>`, and `<Hangup>`.
**How to avoid:** Keep whisper TwiML simple -- just `<Response><Say>` with contact info. No complex logic.
**Warning signs:** Twilio silently ignores unsupported verbs in the whisper TwiML.

### Pitfall 2: answerOnBridge Required for Whisper
**What goes wrong:** Caller hears silence instead of ringing during whisper.
**Why it happens:** Without `answerOnBridge="true"`, Twilio answers the inbound call immediately, so the caller hears nothing while the whisper plays to the agent.
**How to avoid:** Add `answerOnBridge="true"` to the `<Dial>` element in `InboundCallWebhook`.
**Warning signs:** Caller complains about dead air before conversation starts.

### Pitfall 3: AMD Callback URL Not Matching CallSid
**What goes wrong:** AMD webhook cannot find the call in call_logs.
**Why it happens:** The AMD callback uses `CallSid` to identify the call, but the two-leg bridge creates TWO calls with different SIDs (agent leg and client leg). The SID in InitiateCall is the agent leg.
**How to avoid:** Store both SIDs, or look up by parent CallSid. In the current architecture, the `twilio_sid` in call_logs is the agent leg SID, which is the one Twilio sends in the AMD callback.
**Warning signs:** AMD webhook returns 204 with "unknown CallSid" log.

### Pitfall 4: Outcome Column vs Twilio Status
**What goes wrong:** Confusing `status` (Twilio call status) with `outcome` (agent-tagged result).
**Why it happens:** Both describe "what happened with the call" but at different levels.
**How to avoid:** `status` is Twilio-provided and auto-updated via webhook (completed, no-answer, busy, failed). `outcome` is agent-tagged and manually set (connected, voicemail, left_message). Auto-populate outcome from status as a default, but always allow manual override.
**Warning signs:** Agent sets outcome to "Connected" but status shows "no-answer" -- this is valid (agent may tag based on callback, not call status).

### Pitfall 5: Whisper Endpoint Must Be PUBLIC
**What goes wrong:** Twilio cannot reach the whisper endpoint.
**Why it happens:** Whisper URL is fetched by Twilio's servers during the call, not by the frontend. It cannot have Clerk JWT auth.
**How to avoid:** Register `/api/calls/whisper` as a public endpoint in main.go, alongside other Twilio webhook endpoints. Validate Twilio signature instead.
**Warning signs:** Calls fail to connect on inbound, Twilio error log shows 403 or connection refused.

## Code Examples

### Whisper TwiML Response
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Incoming call from Sarah Johnson. Deal at Touring stage. Budget 500 to 700 thousand. Looking for 4 bedroom in Denver.</Say>
</Response>
```
Source: [Twilio Number noun docs](https://www.twilio.com/docs/voice/twiml/number), [Twilio Call Whisper glossary](https://www.twilio.com/docs/glossary/call-whisper)

### AMD Parameters on CreateCall
```go
params.SetMachineDetection("DetectMessageEnd")
params.SetAsyncAmd(true)
params.SetAsyncAmdStatusCallback(cfg.WebhookBaseURL + "/api/calls/amd-webhook")
params.SetAsyncAmdStatusCallbackMethod("POST")
```
Source: [Twilio Answering Machine Detection docs](https://www.twilio.com/docs/voice/answering-machine-detection)

### Outcome Dropdown Component Pattern
```tsx
function OutcomeTagDropdown({ callId, currentOutcome }: { callId: string; currentOutcome: string | null }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const outcomes = [
    { value: "connected", label: "Connected", color: "#22C55E" },
    { value: "voicemail", label: "Voicemail", color: "#F59E0B" },
    { value: "no_answer", label: "No Answer", color: "#EF4444" },
    { value: "left_message", label: "Left Message", color: "#3B82F6" },
    { value: "wrong_number", label: "Wrong Number", color: "#64748B" },
    { value: "busy", label: "Busy", color: "#F97316" },
  ];
  // ... select dropdown with PATCH /api/calls/{id} on change
}
```
Source: Project pattern from existing Tailwind component style

### InboundCallWebhook with Whisper URL
```go
twimlXML := fmt.Sprintf(
  `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This call may be recorded for quality purposes.</Say>
  <Dial callerId="%s" record="record-from-answer-dual"
        recordingStatusCallback="%s/api/calls/recording-webhook"
        recordingStatusCallbackEvent="completed"
        answerOnBridge="true">
    <Number url="%s/api/calls/whisper?call_id=%s">%s</Number>
  </Dial>
</Response>`,
  xmlEscape(callerNumber),
  xmlEscape(cfg.WebhookBaseURL),
  xmlEscape(cfg.WebhookBaseURL), callID,
  xmlEscape(personalPhoneStr))
```
Source: [Twilio Dial verb docs](https://www.twilio.com/docs/voice/twiml/dial)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sync AMD (DetectMessageEnd blocks call) | Async AMD (`AsyncAmd=true`) | Twilio 2023+ | Call connects immediately while detection happens in background |
| Whisper via separate call leg | `<Number url>` attribute | Long-standing Twilio feature | Single Dial verb handles both whisper and bridging |

## Open Questions

1. **Should AMD auto-hang-up on voicemail?**
   - What we know: `MachineDetection=DetectMessageEnd` waits for beep. We could play a pre-recorded voicemail message automatically.
   - What's unclear: Do agents want to leave voicemail themselves or have the system do it? Pre-recorded voicemail drop is a separate feature.
   - Recommendation: For v2.0, just detect and tag. Show "Voicemail Detected" badge. Don't auto-hang-up or auto-leave message. Agent can decide to hang up or wait.

2. **Should outcome auto-populate from AMD results?**
   - What we know: If AMD says `machine_end_beep`, outcome should default to "voicemail". If Twilio status is `no-answer`, outcome should default to "no_answer".
   - What's unclear: Edge cases where AMD detects machine but agent actually spoke to a person.
   - Recommendation: Auto-set as default, always allow manual override. The `answered_by` column preserves the raw AMD result separately from the agent-tagged `outcome`.

3. **Call detail panel vs call detail page?**
   - What we know: Communication page uses an inline detail pane (right side). Emails and SMS show detail there.
   - What's unclear: Whether call detail (recording + transcript + actions + outcome) is too much content for the pane.
   - Recommendation: Use the existing pane pattern. The transcript is expandable (collapsed by default per Phase 6 design), so content is manageable. If it feels cramped, we can always add a "View Full Detail" link later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Go test + TypeScript compiler |
| Config file | None -- uses go build and tsc --noEmit |
| Quick run command | `cd backend && go build ./... && cd ../frontend && npx tsc --noEmit` |
| Full suite command | Same as quick run (no test files currently) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FE-01 | Transcript with speaker labels renders | manual-only | Visual check in browser | N/A |
| FE-02 | Audio player plays call recordings | manual-only | Visual check in browser | N/A |
| FE-03 | AI action cards confirm/dismiss | manual-only | Click Confirm, verify task created | N/A |
| FE-04 | Outcome tag persists | smoke | `curl -X PATCH .../calls/{id} -d '{"outcome":"connected"}'` then `curl .../calls/{id}` | Wave 0 |
| FE-05 | Whisper plays contact context | manual-only | Call Twilio number, listen for whisper | N/A |
| FE-06 | AMD detects voicemail | manual-only | Call a voicemail number, check answered_by | N/A |

### Sampling Rate
- **Per task commit:** `cd backend && go build ./... && cd ../frontend && npx tsc --noEmit`
- **Per wave merge:** Same (no test suite beyond compilation)
- **Phase gate:** Full compilation green + manual verification of all 6 requirements

### Wave 0 Gaps
- None -- existing build infrastructure covers compilation checks. Manual testing required for Twilio integration features (whisper, AMD).

## Sources

### Primary (HIGH confidence)
- [Twilio TwiML Dial verb](https://www.twilio.com/docs/voice/twiml/dial) -- recording attributes, answerOnBridge, Number noun
- [Twilio Number noun](https://www.twilio.com/docs/voice/twiml/number) -- url attribute for whisper
- [Twilio Call Whisper glossary](https://www.twilio.com/docs/glossary/call-whisper) -- whisper pattern explanation
- [Twilio Answering Machine Detection](https://www.twilio.com/docs/voice/answering-machine-detection) -- AMD parameters, async mode, callback values
- [Twilio AMD FAQ & Best Practices](https://www.twilio.com/docs/voice/answering-machine-detection-faq-best-practices) -- DetectMessageEnd accuracy, timeout config
- Phase 5 plans (05-01, 05-02) -- RecordingPlayer, ProxyRecording endpoint
- Phase 6 plans (06-01, 06-02) -- TranscriptSection, AIActionCard, backend transcript endpoints
- Project codebase -- calls.go, communication/page.tsx, calls.ts, main.go

### Secondary (MEDIUM confidence)
- [Twilio Async AMD tutorial](https://www.twilio.com/en-us/blog/async-answering-machine-detection-tutorial) -- async AMD pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all existing patterns
- Architecture: HIGH -- building on established Phase 5/6 components, Twilio patterns well-documented
- Pitfalls: HIGH -- Twilio whisper and AMD are well-documented; call_logs schema is well-understood

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- Twilio TwiML and Next.js 14 are not moving fast)
