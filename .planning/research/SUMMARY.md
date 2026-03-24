# Research Summary: CloAgent v2.0 — Twilio Voice Calling Milestone

**Synthesized:** 2026-03-23
**Research files:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Synthesized by:** gsd-research-synthesizer

---

## Executive Summary

CloAgent v2.0 adds voice calling, recording, AI transcription, and a React Native mobile dialer to an already-working Twilio SMS + CRM system. The existing codebase provides solid scaffolding — `twilio_config`, `call_logs`, `calls.go`, the AI service, and the SMS webhook pattern are all reusable. However, the existing `InitiateCall` handler in `calls.go` is fundamentally broken: it dials the client directly instead of bridging the agent in first, meaning no real calls have ever successfully connected through the CRM. Fixing this is the unconditional first step before any other voice work begins.

The recommended architecture is a two-leg bridge pattern (the industry standard across HubSpot, Close, FollowUpBoss, and OpenPhone): Twilio calls the agent's real phone first; when the agent answers, TwiML bridges them to the client with dual-channel recording enabled. After the call, a recording webhook triggers an async pipeline in the Python AI service — download audio, split channels with pydub, transcribe each with OpenAI `gpt-4o-transcribe` ($0.006/min, 6-8x cheaper than Twilio's built-in), feed the transcript to Claude Haiku for CRM action extraction, and surface suggestions as confirmation cards. This approach leverages every existing infrastructure component — OpenAI SDK, Anthropic SDK, pending_actions confirmation pattern, RLS, pgvector — with minimal new dependencies.

Two risks require explicit attention before writing any code. First, recording consent compliance is a legal requirement from day one in two-party consent states (CA, FL, IL, MA, PA, and others) — it cannot be retrofitted after recordings have already been made. Second, per-agent costs run approximately $160-200/month at typical real estate agent call volumes, which must factor into pricing before Phase 3 ships to users. The mobile app is a parallel track and should be built last; the core value (recording, transcription, AI intelligence) is fully available in the web UI before the mobile app exists.

---

## Key Findings

### From STACK.md — Technology Decisions

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Go Twilio SDK | `github.com/twilio/twilio-go@v1.30.3` | Replaces broken raw HTTP; typed TwiML structs prevent the existing structural TwiML bug |
| Transcription | OpenAI `gpt-4o-transcribe` via existing `openai` SDK | $0.006/min vs $0.035-0.05/min Twilio built-in; zero new vendor; better accuracy |
| Speaker diarization | Dual-channel split with `pydub==0.25.1` + ffmpeg | Twilio records stereo by default; split into mono tracks, transcribe each separately |
| AI analysis | Claude Haiku 4.5 via existing `anthropic` SDK | No new dependency; same agent loop pattern; use Haiku to control per-call cost |
| Recording storage | Download-to-local/S3 + delete from Twilio | Twilio hosts for free (30 days); download before deleting to avoid URL expiration |
| Mobile app | Expo SDK 55 + `@twilio/voice-react-native-sdk@1.7.0` | MEDIUM confidence — v1.7.0 stable but Expo 55 compatibility not explicitly documented |
| Mobile call model | Option A: API-triggered (backend calls agent's phone) | Zero native SDK complexity; same pipeline; defer VoIP to a future version |

**New dependencies total:** 1 Go package (`twilio-go`), 1 Python package (`pydub`), 1 system package (ffmpeg in Docker). Frontend: 0 new packages.

**Do not use:** `@twilio/voice-react-native-sdk` v2.0.0-preview (only tested with Expo 52), Twilio built-in transcription (6-8x more expensive), self-hosted Whisper (needs GPU infrastructure).

---

### From FEATURES.md — Feature Landscape

**Table stakes — users consider the feature broken without these:**
- Two-leg bridge outbound calls (CURRENTLY BROKEN — the priority-zero fix)
- `agent_phone_number` in `twilio_config` (nothing works without it; requires DB migration)
- Call recording with storage and audio playback
- Call status tracking via StatusCallback (currently never fires because URL is not set)
- Inbound call forwarding to agent's real phone
- Contact matching on inbound calls by caller ID (helper already built, reusable)
- Auto-log activity on call completion, not initiation (currently logs on initiation)
- Call outcome tagging (Connected / Voicemail / No Answer)

**Differentiators — what makes CloAgent worth paying for vs a basic dialer:**
- AI post-call transcription (saves agents from manual note-taking)
- AI call summary + action item extraction via Claude (74% of teams fail to act on call data per Vendasta research)
- Auto-create follow-up tasks from transcript with confirmation cards
- Auto-suggest deal stage / buyer profile updates with confirmation cards
- Call transcript loaded into AI chat contact context ("What did Sarah say about her budget?")
- Call whisper on inbound (agent hears pre-call context before client picks up)
- Transcript embeddings in pgvector for semantic search

**Defer indefinitely:**
- Real-time transcription — post-call is simpler, more reliable, and sufficient
- Power dialer / auto-dialer — TCPA regulatory risk, wrong use case for solo agents
- In-browser WebRTC calling — agents prefer their real phone
- IVR / phone trees — over-engineered for solo agents

**Feature dependency chain (everything cascades from the config):**
```
agent_phone_number
    --> two-leg bridge
        --> call recording
            --> recording webhook
                --> AI transcription (pydub + OpenAI)
                    --> AI analysis (Claude) --> action confirmation cards
                        --> transcript in AI chat context + pgvector embeddings

mobile app (independent track — reuses all backend endpoints)
```

---

### From ARCHITECTURE.md — Patterns and Component Boundaries

**Core principle:** Go backend remains the single entry point. AI service handles transcription and analysis. Mobile app is a thin trigger shell. All clients authenticate via Clerk JWT. No new architectural patterns introduced.

**Public webhook endpoints (no Clerk auth, must validate X-Twilio-Signature):**
- `POST /api/calls/inbound-webhook` — inbound call forwarding, returns TwiML
- `POST /api/calls/recording-webhook` — recording ready, triggers AI pipeline
- `GET /api/calls/twiml/bridge` — TwiML served to Twilio when agent answers (leg 2)

**Protected endpoints (Clerk JWT):**
- `GET /api/calls/{id}/transcript`
- `GET /api/calls/{id}/recording` — proxy; never expose Twilio credentials to client
- `POST /api/calls/token` (future: VoIP access tokens for mobile SDK)

**AI service internal endpoints (AI_SERVICE_SECRET):**
- `POST /ai/calls/process-recording` — async transcribe + analyze pipeline

**Schema — one migration (`016_voice_calling.sql`):**
- `twilio_config`: add `personal_phone TEXT`
- `call_logs`: add `recording_sid`, `recording_url`, `recording_duration`
- New `call_transcripts` table with RLS, unique index on `call_id`, full-text GIN index, `ai_summary TEXT`, `ai_actions JSONB`, `status TEXT`

**Reuse existing infrastructure — do not reinvent:**
- `validateTwilioSignature` from `sms.go` — extract to shared `twilio_util.go`
- `matchContactByPhone` helper — already works for inbound caller ID matching
- `asyncio.create_task` pattern from `workflow_engine.py` — use for async transcription
- Pending actions / confirmation card pattern — reuse for AI-extracted action suggestions
- `BeginWithRLS()` — required in all webhook handlers once agent_id is resolved from `call_logs`

---

### From PITFALLS.md — Critical Risks and Prevention

**Critical (blocking — must address in Phase 1):**

| Pitfall | What Breaks | Prevention |
|---------|-------------|------------|
| Broken TwiML (existing bug, `calls.go:61`) | Agent never connected to call | REST API `To` = agent phone; TwiML `<Dial>` = client phone |
| Missing `agent_phone_number` column | Cannot implement bridge at all | Add column via migration; validate E.164 on input |
| No `StatusCallback` URL on outbound calls | All call_logs stuck at "initiated", duration always 0, pipeline never triggers | Add `StatusCallback` + `StatusCallbackEvent` to every outbound Twilio API call |
| Recording consent announcement missing | Legal liability in 12+ two-party consent states | `<Say>This call may be recorded.</Say>` in TwiML before `<Dial record="...">` — cannot retrofit |
| Webhook URL not publicly accessible | Entire call flow silently broken in dev | Add `WEBHOOK_BASE_URL` env var; validate HTTPS on startup; use ngrok stable subdomain in dev |
| No Twilio signature validation on call webhooks | Anyone can POST fake call status updates | Copy `validateTwilioSignature` pattern from `SMSWebhook` to all voice webhook handlers |
| `calls.go:100` uses `pool.QueryRow` without RLS | Data isolation inconsistency | Use `BeginWithRLS()` with agent_id derived from `call_logs`, not from webhook payload |

**High (blocking for specific phases):**

| Pitfall | Phase | Prevention |
|---------|-------|------------|
| `recordingStatusCallback` not set (distinct from StatusCallback) | Phase 2 | Set both webhooks; recordings exist in Twilio but CRM never learns about them without this |
| Auth token plaintext in `twilio_config.auth_token` | Phase 2 | Encrypt before recordings (higher-value PII) flow through system; AES-256-GCM, key from env |
| Transcription processing blocks webhook handler | Phase 3 | Acknowledge recording webhook immediately (200 OK), then `asyncio.create_task` for pipeline |
| Speaker diarization: Whisper does not label speakers | Phase 3 | Use `record="record-from-answer-dual"` to get dual-channel; split with pydub before transcribing |

**Medium (important but phase-bounded):**

| Pitfall | Phase | Prevention |
|---------|-------|------------|
| Per-agent costs ~$162-200/month | Before Phase 3 launch | Factor into pricing; use Haiku (not Sonnet/Opus) for analysis; download + delete Twilio recordings |
| SMS webhook conflicts with voice webhook on same number | Phase 1 inbound | Configure both webhooks on the Twilio number (separate Voice URL and SMS URL) |
| iOS VoIP push notifications are a separate effort | Phase 5 | Build mobile outbound-only first; defer APNs/PushKit/CallKit to a later sub-phase |
| Expo 55 + Twilio Voice RN SDK v1.7.0 compatibility unverified | Phase 5 | Run compatibility spike before scaffolding; fallback is WebView + Twilio Client JS SDK |
| Recording URL expiration after deletion | Phase 2 | Download audio before deleting from Twilio; store local/S3 path, not Twilio URL |

**Existing bugs to fix in Phase 1 (discovered during research):**
1. `calls.go:61` — TwiML wrong, no Record attribute, no StatusCallback
2. `calls.go:100` — no RLS transaction
3. `sms.go:222` — SMS activities logged with type `'call'` instead of `'sms'`
4. `CallStatusWebhook` — missing Twilio signature validation

---

## Implications for Roadmap

The research converges on a clear 5-phase structure. Each phase has a hard gate that must pass before the next begins. Phases 1-4 follow the natural data dependency chain. Phase 5 (mobile) is independent and can begin after Phase 1 is complete, but sequencing it last maximizes reuse of the finished backend.

### Suggested Phase Structure

**Phase 1: Fix Core Call Flow**

Rationale: Three existing bugs make the call flow completely non-functional. Compliance requirements (consent announcement, webhook security) must be present from day one and cannot be retrofitted.

Delivers: Agent's phone rings when they click "Call". Client's phone rings after agent answers. Calls log correctly on completion with real status and duration.

Key work:
- Add `personal_phone` to `twilio_config` (migration) + settings UI field
- Rewrite `InitiateCall` using `twilio-go` SDK for correct two-leg bridge
- Add `WEBHOOK_BASE_URL` env var, validate on startup
- Add TwiML bridge endpoint (returns `<Dial record="...">` TwiML for leg 2)
- Add inbound call forwarding webhook
- Add recording consent `<Say>` announcement (legal requirement)
- Add Twilio signature validation to all call webhook handlers
- Fix `calls.go:100` to use `BeginWithRLS()`
- Fix `sms.go:222` SMS activity type bug
- Wire `StatusCallback` + `StatusCallbackEvent` on outbound calls
- Extend `SMSConfigure` (or new `VoiceConfigure`) to set voice webhook URL on Twilio number

Gate: Real end-to-end call connects. `call_logs` shows correct status, real duration, correct `ended_at`.

Research needed: No — two-leg bridge is a well-documented, solved Twilio pattern.

---

**Phase 2: Recording Infrastructure**

Rationale: Recording is the bridge between working calls and AI intelligence. Auth token encryption must happen before recordings — which contain sensitive client PII — flow through the system.

Delivers: Calls are recorded. Agent can play back recordings in the communication page. Recording metadata persists in the DB.

Key work:
- Enable dual-channel recording (`record="record-from-answer-dual"` on `<Dial>`)
- Set `recordingStatusCallback` on `<Dial>` pointing to dedicated endpoint
- Build recording webhook handler (acknowledge immediately, store metadata, trigger async download)
- Add `recording_sid`, `recording_url`, `recording_duration` to `call_logs`
- Build recording proxy endpoint (stream from Twilio, never expose credentials)
- Encrypt `auth_token` at rest in `twilio_config` (AES-256-GCM)
- Download recordings to local/S3 after webhook fires; delete from Twilio after confirmed download

Gate: `call_logs` has populated `recording_url`. Agent can play back audio in communication page.

Research needed: No — recording webhook and storage are standard Twilio patterns.

---

**Phase 3: AI Transcription + Intelligence**

Rationale: The core differentiator. Requires recordings from Phase 2. Fully async via `asyncio.create_task` — same pattern as workflow engine.

Delivers: Every call gets a transcript, AI summary, and actionable suggestions in the CRM within minutes of call completion.

Key work:
- Create `call_transcripts` table in migration 016
- Add `pydub==0.25.1` to `requirements.txt`; add `ffmpeg` to AI service Dockerfile
- Build transcription service: download from Twilio, split dual-channel with pydub, transcribe each with `gpt-4o-transcribe`, interleave by timestamp
- Build post-call analysis service: feed transcript + contact context to Claude Haiku, extract structured JSON (summary, tasks, deal stage suggestion, buyer profile updates, key quotes)
- Store transcript + AI analysis in `call_transcripts`
- New AI read tools: `get_call_transcript`, `search_transcripts`
- Load recent call summaries into contact-scoped AI chat system prompt
- Add transcript embeddings to pgvector for semantic search
- Frontend: transcript viewer with speaker labels, AI action confirmation cards in call detail

Gate: AI summary and extracted task suggestions appear in CRM within 2-3 minutes of call completion.

Research needed: No — uses existing OpenAI SDK, Anthropic SDK, and agent loop patterns.

---

**Phase 4: Frontend Polish + Inbound Intelligence**

Rationale: With the backend pipeline solid, surface the full value in the web UI. Add high-value inbound features (call whisper, voicemail detection) that require no new backend infrastructure.

Delivers: Rich call detail experience, AI action cards wired to existing endpoints, inbound call whisper, voicemail detection.

Key work:
- Recording audio player in communication page + contact detail
- Transcript viewer with speaker labels
- AI action suggestion cards (confirm/dismiss) wired to existing contact/deal/task API endpoints
- Call outcome tagging UI (Connected / Voicemail / No Answer)
- Call whisper on inbound (`<Say>` with contact name, deal stage, key notes before `<Dial>` to agent)
- Voicemail detection on outbound (`MachineDetection=DetectMessageEnd` Twilio param)

Gate: Full call lifecycle visible in web UI. Agent can act on AI suggestions with one click.

Research needed: No — standard frontend patterns using existing component and API structure.

---

**Phase 5: React Native Mobile Dialer**

Rationale: Parallel track — backend fully complete by Phase 3. Mobile reuses all existing API endpoints. Start with API-triggered calls (agent's phone rings natively — no VoIP SDK needed), which delivers full value with minimal mobile SDK risk.

Delivers: Agent can trigger calls and view call history + transcripts from their phone.

Key work:
- Expo SDK 55 project scaffold in `denver-mobile/`
- Clerk auth via `@clerk/clerk-expo`
- Contact list with search
- Tap-to-call (POST `/api/calls/initiate` — agent's phone rings)
- Call history with status, duration, transcript summaries
- Personal phone config in mobile settings

Defer within Phase 5: iOS incoming call push notifications (APNs VoIP cert, PushKit, CallKit — separate sub-phase), VoIP in-app audio (Option B).

Gate: Agent can tap a contact and their phone rings within 3 seconds.

Research needed: YES — run an Expo 55 + `@twilio/voice-react-native-sdk@1.7.0` compatibility spike before scaffolding. If incompatible, choose: WebView shell (simpler, avoids all native module issues) vs bare React Native (more control, more build complexity).

---

### Research Flags

| Phase | Research Before Building? | Reason |
|-------|--------------------------|--------|
| Phase 1 | No | Two-leg bridge is solved, well-documented |
| Phase 2 | No | Recording webhooks are standard Twilio patterns |
| Phase 3 | No | Uses existing OpenAI + Anthropic SDK infrastructure |
| Phase 4 | No | Standard frontend work, established patterns |
| Phase 5 | YES — compatibility spike required | Expo 55 + `@twilio/voice-react-native-sdk@1.7.0` compatibility unverified; decision gates entire mobile architecture |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Two-leg bridge pattern | HIGH | Twilio docs explicit; standard across all CRM calling products |
| Recording + webhooks | HIGH | RecordingStatusCallback and dual-channel recording well-documented |
| OpenAI `gpt-4o-transcribe` transcription | HIGH | SDK already in project; pricing verified; dual-channel pydub split is established pattern |
| AI post-call analysis | HIGH | Uses existing Claude + agent loop; same pending_actions confirmation pattern |
| Go `twilio-go@v1.30.3` | HIGH | Published March 2026; pkg.go.dev verified |
| Recording consent compliance | HIGH | Two-party consent states well-documented; legal risk of omission is severe |
| Expo 55 + Twilio Voice RN SDK v1.7.0 | MEDIUM | SDK v1.7.0 is GA stable; Expo 55 compatibility not explicitly documented; needs spike |
| Per-agent cost estimates | MEDIUM | Based on published pricing; actual call volumes will vary by agent |

**Overall confidence:** HIGH for Phases 1-4. MEDIUM for Phase 5 (mobile SDK compatibility).

---

## Gaps to Address

1. **Expo 55 + Twilio Voice RN SDK compatibility spike** — Must run before Phase 5 begins. Create a minimal Expo 55 project, install `@twilio/voice-react-native-sdk@1.7.0`, confirm the config plugin links successfully. If it fails, decide: WebView shell (eliminates all native module issues for a thin dialer) vs bare React Native (more control, more build setup). This decision gates the entire Phase 5 architecture.

2. **Auth token encryption implementation** — Research identifies the risk but does not prescribe the Go implementation. Standard approach: AES-256-GCM with a key stored in an env var (`TWILIO_ENCRYPTION_KEY`). Confirm the Go pattern (likely `crypto/aes` + `crypto/cipher`) before Phase 2 begins. Consider encrypting API keys instead of (or alongside) auth tokens for future-proofing.

3. **`WEBHOOK_BASE_URL` per-environment configuration** — In production with Docker Compose + a reverse proxy, the URL the Go service uses to construct webhook callbacks may differ from what Twilio needs. Document the expected value for each environment (dev with ngrok, staging, prod) in `.env.example` before Phase 1 ships.

4. **Recording storage backend abstraction** — Research recommends download-to-local for dev and S3 for prod. The Phase 2 code should use a pluggable storage interface so Phase 2 does not need to be rewritten when S3 is added. A minimal Go interface (`StoreRecording(sid, data) (path string, err error)`) is sufficient.

5. **Pricing model impact** — ~$162-200/month per agent in Twilio + AI API costs. This must be factored into CloAgent's subscription tier pricing before Phase 3 ships to paying users. Identify the cost per call at launch (~$0.40-0.60 per 15-minute call all-in) and build a usage monitoring view into the settings page.

---

## Sources (Aggregated)

### HIGH Confidence
- [Twilio TwiML Dial verb](https://www.twilio.com/docs/voice/twiml/dial)
- [Twilio Recording Status Callbacks](https://support.twilio.com/hc/en-us/articles/360014251313)
- [Twilio Dual-Channel Recordings Default](https://www.twilio.com/en-us/changelog/dual-channel-voice-recordings-by-default)
- [Twilio Recording Legal Considerations](https://support.twilio.com/hc/en-us/articles/360011522553)
- [Twilio Webhook Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [twilio-go SDK v1.30.3 (pkg.go.dev)](https://pkg.go.dev/github.com/twilio/twilio-go/twiml)
- [OpenAI Speech to Text / gpt-4o-transcribe](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Twilio Voice React Native SDK (GA)](https://www.twilio.com/docs/voice/sdks/react-native)
- [Twilio Inbound Call Forwarding](https://support.twilio.com/hc/en-us/articles/223179908)
- [Twilio Voice Pricing (US)](https://www.twilio.com/en-us/voice/pricing/us)
- [Expo SDK 55](https://expo.dev/sdk/55)
- [Twilio Recordings Resource API](https://www.twilio.com/docs/voice/api/recording)
- [Downloading and Deleting Twilio Recordings](https://support.twilio.com/hc/en-us/articles/360002588893)

### MEDIUM Confidence
- [OpenAI gpt-4o-transcribe-diarize](https://platform.openai.com/docs/models/gpt-4o-transcribe-diarize)
- [Twilio Voice RN SDK Expo issue #496](https://github.com/twilio/twilio-voice-react-native/issues/496)
- [Vendasta AI-Native CRM Research (74% follow-up failure stat)](https://www.vendasta.com/blog/ai-native-crm/)
- [Two-Party Consent State Laws (HubSpot)](https://knowledge.hubspot.com/calling/what-are-the-call-recording-laws)
- [Whisper Diarization Limitations](https://github.com/openai/whisper/discussions/264)
- [OpenAI Transcription Pricing comparison](https://costgoat.com/pricing/openai-transcription)

### Competitive Benchmarks
- [FollowUpBoss Outbound Calling](https://www.followupboss.com/features/outbound-calling)
- [OpenPhone CRM Integration Guide](https://www.openphone.com/blog/crm-phone-integration/)
- [Salesloft Call Recording + Conversation Intelligence](https://www.salesloft.com/platform/call-recording-software)
- [HubSpot Calling Setup](https://knowledge.hubspot.com/calling/manage-phone-numbers-registered-for-calling)
- [Twilio Voice React Native Reference App](https://github.com/twilio/twilio-voice-react-native-app)
