# Architecture: Twilio Voice Calling with Recording, Transcription, AI Processing, and React Native Mobile Dialer

**Domain:** Voice calling integration for AI-powered real estate CRM
**Researched:** 2026-03-23
**Confidence:** HIGH (Twilio APIs well-documented, existing codebase patterns clear)

## Recommended Architecture

### High-Level Overview

```
React Native App (:mobile)          Next.js Frontend (:3000)
        |                                    |
        |  Clerk JWT                         |  Clerk JWT
        v                                    v
     Go Backend (:8080)  <-- single entry point for all clients
        |         |
        |         +---> Twilio REST API (initiate calls, fetch recordings)
        |         +---> Twilio TwiML webhooks (inbound voice URL, status, recording)
        |
        +---> AI Service / FastAPI (:8000)
                  |
                  +---> OpenAI Transcription API (gpt-4o-mini-transcribe)
                  +---> Claude API (post-call analysis)
                  +---> PostgreSQL (call_logs, call_transcripts)
```

### Key Architectural Principle

**All business logic stays in Go backend + Python AI service.** The React Native app is a thin dialer shell. The Next.js frontend is the primary rich client. Both authenticate via Clerk and talk only to the Go backend.

---

## Component Boundaries

### Existing Components (Modified)

| Component | Current State | Modifications Needed |
|-----------|--------------|---------------------|
| `call_logs` table | Basic fields, no recording/transcript refs | Add `recording_sid`, `recording_url`, `recording_duration` columns |
| `twilio_config` table | Stores account_sid, auth_token, phone_number | Add `personal_phone` column for agent's real phone |
| `calls.go` handler | Broken TwiML (dials client directly, no agent bridge) | Rewrite InitiateCall for two-leg bridge pattern |
| `CallStatusWebhook` | Updates status only | Keep as-is, add separate recording webhook |
| AI tools (3 call tools) | search_call_logs, get_call_history, initiate_call | Add get_call_transcript, search_transcripts tools |
| Communication page | Has Calls tab with basic list | Add call detail with transcript, recording playback |

### New Components

| Component | Service | Responsibility |
|-----------|---------|----------------|
| `call_transcripts` table | Database | Full transcript text, speaker labels, AI summary |
| Recording webhook handler | Go backend | Receives Twilio RecordingStatusCallback, stores metadata, triggers AI |
| Inbound call webhook handler | Go backend | Returns TwiML to forward to agent's personal phone |
| TwiML bridge endpoint | Go backend | Returns TwiML for the agent-leg of two-leg calls |
| Transcription service | AI Service (Python) | Downloads recording, sends to OpenAI, stores transcript |
| Post-call analysis service | AI Service (Python) | Feeds transcript to Claude for CRM action extraction |
| Voice token endpoint | Go backend | Generates Twilio Access Tokens for mobile VoIP (future) |
| React Native app | New standalone | Thin dialer UI, triggers calls via backend API |

---

## Data Flow: Outbound Call (Two-Leg Bridge)

This is the critical flow that is currently broken. The existing code in `calls.go` line 61 does:

```go
// BROKEN: This calls the client directly from Twilio, agent is not on the call
data.Set("Twiml", "<Response><Say>Connecting your call now.</Say><Dial>"+body.To+"</Dial></Response>")
```

The correct pattern is a two-leg bridge where the agent's real phone rings first, then bridges to the client.

### Step 1: Agent Initiates Call (Web or Mobile)

```
Frontend/Mobile --> POST /api/calls/initiate { to: "+15551234567", contact_id: "uuid" }
                --> Go Backend
```

### Step 2: Go Backend Creates Two-Leg Call via Twilio API

```go
// Leg 1: Call the AGENT's personal phone
data.Set("To", agentPersonalPhone)        // Agent's real phone rings
data.Set("From", twilioPhoneNumber)        // CRM's Twilio number shows as caller ID
data.Set("Url", backendURL+"/api/calls/twiml/bridge?to="+url.QueryEscape(clientPhone)+"&call_id="+callID)
data.Set("StatusCallback", backendURL+"/api/calls/webhook")
data.Set("StatusCallbackEvent", "initiated ringing answered completed")
```

When the agent answers their phone, Twilio fetches the TwiML URL.

### Step 3: TwiML Bridge Endpoint Connects to Client (Leg 2)

```xml
<!-- GET /api/calls/twiml/bridge?to=+15551234567&call_id=uuid -->
<Response>
  <Say>Connecting you now.</Say>
  <Dial record="record-from-answer-dual"
        recordingStatusCallback="https://yourapp.com/api/calls/recording-webhook"
        recordingStatusCallbackEvent="completed">
    <Number>+15551234567</Number>
  </Dial>
</Response>
```

**Key attributes:**
- `record="record-from-answer-dual"` -- Records both parties on separate audio channels from when the client answers. Dual-channel is critical for speaker diarization during transcription.
- `recordingStatusCallback` -- Twilio POSTs here when recording processing is complete and the file is downloadable.
- Twilio changed dual-channel to the default in late 2024, but being explicit avoids surprises.

### Step 4: Call Proceeds

```
Agent's Phone <---> Twilio <---> Client's Phone
                     |
              (dual-channel recording in progress)
```

### Step 5: Call Ends, Status Webhook Fires

```
Twilio --> POST /api/calls/webhook
        { CallSid, CallStatus: "completed", CallDuration: "180" }
        --> Go updates call_logs row (existing handler works as-is)
```

### Step 6: Recording Ready, Recording Webhook Fires (Async, Seconds to Minutes Later)

```
Twilio --> POST /api/calls/recording-webhook
        { CallSid, RecordingSid, RecordingUrl, RecordingDuration, RecordingStatus: "completed" }
        --> Go stores recording metadata in call_logs
        --> Go notifies AI service: POST /ai/calls/process-recording { call_id, recording_url, agent_id }
```

### Step 7: AI Service Transcribes and Analyzes (Async)

```
AI Service:
  1. Download recording from Twilio (RecordingUrl + ".mp3", authenticated with account_sid/auth_token)
  2. Send audio to OpenAI gpt-4o-mini-transcribe API ($0.003/min, ~$0.05 for a 15-min call)
  3. Store transcript in call_transcripts table
  4. Feed transcript + contact context to Claude for analysis
  5. Claude extracts: call summary, follow-up tasks, deal updates, buyer profile changes
  6. Store AI summary + extracted actions in call_transcripts
  7. Queue extracted actions as suggestions (not auto-applied in v1)
```

---

## Data Flow: Inbound Call

### Step 1: Client Calls Twilio Number

```
Client Phone --> Twilio --> POST /api/calls/inbound-webhook (PUBLIC, no auth)
```

### Step 2: Go Backend Identifies Agent, Returns Forward TwiML

The handler looks up which agent owns the called Twilio number (same pattern as `SMSWebhook` in sms.go line 621), validates the Twilio signature, then returns TwiML:

```xml
<Response>
  <Dial record="record-from-answer-dual"
        recordingStatusCallback="https://yourapp.com/api/calls/recording-webhook"
        recordingStatusCallbackEvent="completed"
        callerId="+1CLIENT_NUMBER">
    <Number statusCallback="https://yourapp.com/api/calls/webhook"
            statusCallbackEvent="initiated ringing answered completed">
      +1AGENT_PERSONAL_PHONE
    </Number>
  </Dial>
</Response>
```

The handler also inserts a `call_logs` row with direction "inbound" and matches the caller to a contact via the existing `matchContactByPhone` helper.

### Step 3: Same Recording/Transcription Pipeline

After the call ends, the same recording webhook fires, same transcription and AI analysis pipeline runs. No special handling needed for inbound vs outbound.

---

## Data Flow: Mobile App Calling

### Option A: API-Initiated Calls (Recommended for v1)

The mobile app acts as a thin trigger. When the agent taps "Call":

```
RN App --> POST /api/calls/initiate { to: "+15551234567" }
        --> Go Backend creates Twilio two-leg call
        --> Agent's real phone rings (native phone dialer)
        --> Agent answers, bridge connects to client
```

This requires zero Twilio Voice SDK integration. The agent's native phone handles the actual voice. The app just triggers the backend.

### Option B: VoIP Calling via Twilio Voice SDK (Future Phase)

For true in-app calling where voice goes through the app itself:

```
RN App --> GET /api/calls/token --> Go generates Twilio Access Token (VoiceGrant)
        --> RN App registers with Twilio using token
        --> RN App makes VoIP call through Twilio SDK
        --> Twilio fetches TwiML from backend --> bridges to client
```

Additional requirements for Option B:
- TwiML Application configured in Twilio Console (returns a TwiML App SID)
- API Key + API Secret created in Twilio Console (separate from account_sid/auth_token)
- `twilio-go` SDK's `client/jwt` package for access token generation with VoiceGrant
- `@twilio/voice-react-native-sdk` v2.x (Expo-compatible as of v2.0.0-preview.1, tested with Expo 52)
- FCM push credentials (Android) and APNs push credentials (iOS) for incoming call notifications
- New columns in twilio_config: `api_key_sid`, `api_key_secret`, `twiml_app_sid`

**Recommendation:** Build Option A first. It delivers full call functionality (including recording and transcription) without any mobile SDK complexity. Option B adds convenience (no phone switch) but the core value is the same.

---

## Database Schema Changes

### New Migration: `016_voice_calling.sql`

```sql
-- Add personal phone to existing twilio_config (agent's real phone number)
ALTER TABLE twilio_config ADD COLUMN personal_phone TEXT;

-- Add recording metadata to call_logs
ALTER TABLE call_logs ADD COLUMN recording_sid TEXT;
ALTER TABLE call_logs ADD COLUMN recording_url TEXT;
ALTER TABLE call_logs ADD COLUMN recording_duration INTEGER;

-- Call transcripts (1:1 with call_logs that have recordings)
CREATE TABLE call_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id),
    full_text TEXT NOT NULL,                    -- Complete transcript
    speaker_labels JSONB,                      -- Array of { speaker, start, end, text } segments
    ai_summary TEXT,                           -- Claude-generated call summary
    ai_actions JSONB,                          -- Extracted actions: tasks, deal updates, etc.
    status TEXT DEFAULT 'pending',             -- pending, transcribing, analyzing, complete, failed
    duration_seconds INTEGER,
    word_count INTEGER,
    language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_transcripts_agent ON call_transcripts
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE UNIQUE INDEX idx_transcripts_call ON call_transcripts(call_id);
CREATE INDEX idx_transcripts_agent ON call_transcripts(agent_id, created_at DESC);

-- Full-text search on transcripts
CREATE INDEX idx_transcripts_fulltext ON call_transcripts
    USING gin(to_tsvector('english', full_text));
```

### Schema Design Rationale

**Why columns on call_logs instead of a separate recordings table:** Recording metadata (sid, url, duration) maps 1:1 to a call_log row. Three columns on the existing table avoids an unnecessary join. There is no scenario where one call has multiple recordings in this architecture.

**Why a separate call_transcripts table:** Transcripts have their own lifecycle (created asynchronously after recording, go through pending -> transcribing -> analyzing -> complete states), contain substantial data (full text, speaker segments, AI analysis), and support independent queries (full-text search across all transcripts).

**Why UNIQUE index on call_id:** Enforces the 1:1 relationship. Each call produces at most one transcript.

---

## New API Endpoints

### Go Backend -- Public Webhooks (No Auth)

```
POST /api/calls/inbound-webhook       -- Twilio calls when someone dials the Twilio number
POST /api/calls/recording-webhook      -- Twilio calls when recording processing is complete
GET  /api/calls/twiml/bridge           -- Twilio fetches TwiML to bridge agent to client
```

All three validate `X-Twilio-Signature` using the existing `validateTwilioSignature` helper (currently in sms.go, should be extracted to a shared utility).

### Go Backend -- Protected Endpoints (Clerk JWT)

```
GET  /api/calls/{id}/transcript        -- Get transcript for a call
GET  /api/calls/{id}/recording         -- Proxy recording audio (stream from Twilio, don't expose URL)
POST /api/calls/token                  -- Generate Twilio Access Token (future: mobile VoIP)
```

### AI Service -- Internal Endpoints (AI_SERVICE_SECRET)

```
POST /ai/calls/process-recording       -- Triggered by Go after recording webhook
                                        -- Downloads audio, transcribes, analyzes, stores
POST /ai/calls/analyze-transcript      -- Re-analyze an existing transcript (manual trigger)
```

### Why Transcription Lives in the Python AI Service

1. The AI service already has the `openai` Python SDK (used for embeddings via `text-embedding-3-small`)
2. Post-call analysis requires Claude (already configured in AI service via `anthropic` SDK)
3. Transcription + analysis is a single pipeline: download audio -> transcribe -> analyze -> store
4. The Go backend should remain a thin routing/auth layer, not acquire ML dependencies
5. Python's `asyncio.create_task` pattern (already used for workflow triggers) handles the async processing naturally

---

## AI Post-Call Analysis Pipeline

### What Claude Receives

```
System prompt: You are analyzing a real estate agent's phone call transcript.
Extract structured CRM updates from the conversation.

Contact context: {name, email, phone, buyer_profile, recent_activities, deal_info}
Call transcript: {full_text with speaker labels}
Call metadata: {direction, duration, date, contact_name}
```

### What Claude Returns (Structured JSON)

```json
{
  "summary": "Discussed 3BR homes in Cherry Creek. Client confirmed pre-approval for $850K. Interested in showing at 123 Main St this weekend.",
  "topics": ["property search", "financing", "Cherry Creek neighborhood"],
  "tasks": [
    { "body": "Send Cherry Creek listings under $850K", "due_date": "2026-03-25", "priority": "high" },
    { "body": "Schedule showing at 123 Main St", "due_date": "2026-03-27", "priority": "medium" }
  ],
  "buyer_profile_updates": {
    "budget_max": 850000,
    "locations": ["Cherry Creek"],
    "bedrooms": 3,
    "pre_approved": true
  },
  "deal_stage_suggestion": "Touring",
  "sentiment": "positive",
  "key_quotes": [
    "We're definitely pre-approved up to eight fifty",
    "Can we see that Main Street place Saturday?"
  ]
}
```

### How Extracted Actions Are Handled

**v1 approach (recommended): Queue as suggestions.** The AI stores extracted actions in `call_transcripts.ai_actions` as JSON. The frontend displays these in the call detail view as actionable cards: "Create task: Send Cherry Creek listings" with Confirm/Dismiss buttons. Confirming creates the entity via the existing API endpoints.

This mirrors the existing pending_actions pattern for AI write tools -- the agent always has the final say.

**Future approach: Auto-apply with notification.** Once agents trust the system, enable auto-creation of tasks and activity logs, with a notification feed showing what was auto-created. Deal stage changes and buyer profile updates should always require confirmation.

---

## React Native Mobile App Architecture

### Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React Native | 0.76+ | Cross-platform mobile framework |
| Expo | ~52 | Build toolchain, managed workflow |
| Expo Router | v4 | File-based navigation |
| `@clerk/clerk-expo` | latest | Authentication (same Clerk project as web) |
| TanStack Query | v5 | Data fetching (same patterns as web) |

### App Structure

```
denver-mobile/
  app/
    _layout.tsx                 -- Root layout with Clerk provider
    (auth)/
      sign-in.tsx               -- Clerk sign-in screen
    (app)/
      _layout.tsx               -- Tab navigator
      index.tsx                 -- Recent calls + quick dial pad
      contacts.tsx              -- Contact list with search, tap to call
      call/[id].tsx             -- Call detail: status, duration, transcript
      settings.tsx              -- Personal phone number config
  lib/
    api/client.ts               -- apiRequest + Clerk token (same pattern as web)
    api/calls.ts                -- Call API functions (copy types from web)
    api/contacts.ts             -- Contact list/search only
  components/
    CallButton.tsx              -- Triggers POST /api/calls/initiate
    RecentCallsList.tsx         -- Paginated call history
    TranscriptViewer.tsx        -- Scrollable transcript with speaker labels
```

### What the Mobile App Does

- View contact list (search by name/phone)
- Tap to initiate a call (triggers backend, agent's phone rings)
- View call history with status and duration
- View call transcripts and AI summaries
- Configure personal phone number

### What the Mobile App Does NOT Do

- AI chat (complex UI, use web)
- Deal/pipeline management
- Analytics or dashboards
- Workflow management
- Email/Gmail integration
- SMS (use web, or add later)

### Authentication

`@clerk/clerk-expo` provides the same Clerk JWT. The Go backend validates JWTs from any Clerk client identically. No backend changes needed for mobile auth.

---

## Webhook Security

### Existing Pattern

The `validateTwilioSignature` function in `sms.go` (line 725) implements HMAC-SHA1 validation of `X-Twilio-Signature`. This works for all Twilio webhooks.

### Refactoring Needed

Extract `validateTwilioSignature` from `sms.go` into a shared utility (e.g., `twilio_util.go`) so both `sms.go` and `calls.go` can use it without duplication.

### Agent Identification in Webhooks

| Webhook | How to Find Agent |
|---------|------------------|
| Inbound call | Look up agent by `To` phone number in twilio_config (same as SMS webhook) |
| Recording callback | Look up agent via `CallSid` -> call_logs.agent_id |
| TwiML bridge | `call_id` query parameter -> call_logs.agent_id (validate it matches the CallSid) |
| Status callback | Look up via `CallSid` -> call_logs.agent_id (existing pattern) |

---

## Integration Points Summary

### Go Backend Changes

| File | Change Type | What |
|------|-------------|------|
| `calls.go` | **REWRITE** InitiateCall | Two-leg bridge: call agent phone, TwiML URL bridges to client |
| `calls.go` | **ADD** InboundCallWebhook | Look up agent, return forwarding TwiML with recording |
| `calls.go` | **ADD** RecordingWebhook | Store recording metadata, trigger AI processing |
| `calls.go` | **ADD** TwiMLBridge | Return TwiML that Dials the client with recording enabled |
| `calls.go` | **ADD** GetTranscript | Return transcript for a call |
| `calls.go` | **ADD** ProxyRecording | Stream recording audio from Twilio (don't expose URL) |
| `sms.go` | **EXTRACT** | Move validateTwilioSignature to shared twilio_util.go |
| `sms.go` | **MODIFY** SMSConfigure | Accept optional personal_phone field |
| `main.go` | **MODIFY** | Register 3 new public webhook routes, 2 new protected routes |

### AI Service Changes

| File | Change Type | What |
|------|-------------|------|
| `routes/calls.py` | **NEW** | POST /ai/calls/process-recording, POST /ai/calls/analyze-transcript |
| `services/transcription.py` | **NEW** | Download Twilio recording, call OpenAI gpt-4o-mini-transcribe |
| `services/call_analysis.py` | **NEW** | Feed transcript + contact context to Claude, extract actions |
| `tools.py` | **ADD** 2 read tools | get_call_transcript, search_transcripts |
| `services/agent.py` | **MODIFY** | Include recent call transcripts in contact-scoped system prompt |
| `main.py` | **MODIFY** | Register new /ai/calls routes |

### Frontend Changes

| File | Change Type | What |
|------|-------------|------|
| `lib/api/calls.ts` | **MODIFY** | Add getTranscript, getRecordingUrl types/functions |
| Communication page | **MODIFY** | Call detail panel: transcript viewer, audio player, AI actions |
| Contact detail page | **MODIFY** | Calls tab shows transcript summaries |
| Settings page | **MODIFY** | Personal phone number field in Twilio config |

### New Codebase

| Component | What |
|-----------|------|
| `denver-mobile/` | React Native Expo app (thin dialer client) |
| Migration `016_voice_calling.sql` | Schema changes for recording + transcripts |

---

## Scalability Considerations

| Concern | Current Scale (< 10 agents) | At 1,000 agents |
|---------|---------------------------|-----------------|
| Transcription latency | Sync in AI service (asyncio.create_task) | Background job queue |
| Recording storage | Twilio-hosted (default, free for 30 days) | S3 archival for long-term |
| Webhook throughput | Direct handler | Consider webhook queue |
| AI analysis cost | ~$0.05-0.10/call (transcribe + Claude) | Budget monitoring + rate limits |
| Transcript search | PostgreSQL full-text search | Add to pgvector embeddings |

At current scale, synchronous processing via `asyncio.create_task` in the AI service (same pattern as workflow engine triggers) is perfectly adequate.

---

## Suggested Build Order (Dependency-Driven)

### Phase 1: Fix Core Call Flow
1. Add `personal_phone` to twilio_config (migration + handler update)
2. Rewrite InitiateCall for two-leg bridge
3. Add TwiML bridge endpoint
4. Add inbound call webhook with forwarding
5. **Gate:** Agent can make and receive real phone calls through Twilio

### Phase 2: Recording + Transcription
1. Add recording attributes to TwiML (`record="record-from-answer-dual"`)
2. Add recording webhook handler in Go
3. Add recording columns to call_logs
4. Create call_transcripts table
5. Build transcription service in AI service (OpenAI gpt-4o-mini-transcribe)
6. Build recording proxy endpoint
7. **Gate:** Calls are recorded, transcripts appear in database

### Phase 3: AI Analysis + CRM Intelligence
1. Build post-call analysis service (Claude)
2. Store AI summary + extracted actions
3. Add new AI read tools (get_call_transcript, search_transcripts)
4. Add call transcript context to contact-scoped AI conversations
5. **Gate:** AI generates summaries and extracts actionable items

### Phase 4: Frontend Integration
1. Call detail panel with transcript viewer + audio player
2. AI action suggestion cards (confirm/dismiss)
3. Contact detail call history with transcript summaries
4. Settings page personal phone config
5. **Gate:** Full call experience in web UI

### Phase 5: Mobile App
1. Expo + Clerk scaffolding
2. Contact list + search
3. Call initiation (API-triggered, phone rings)
4. Call history + transcript viewer
5. **Gate:** Agent can trigger calls and view history from phone

**Phase ordering rationale:** Each phase produces artifacts the next phase consumes. Calls must work (P1) before recording works (P2). Recordings must exist before AI can analyze them (P3). Backend must be complete before frontend can display results (P4). Mobile reuses the same backend, so it comes last (P5).

---

## Sources

- [Twilio TwiML Dial Documentation](https://www.twilio.com/docs/voice/twiml/dial) -- HIGH confidence
- [Twilio Recording Status Callbacks](https://support.twilio.com/hc/en-us/articles/360014251313-Getting-Started-with-Recording-Status-Callbacks) -- HIGH confidence
- [Twilio Dual-Channel Recordings Default](https://www.twilio.com/en-us/changelog/dual-channel-voice-recordings-by-default) -- HIGH confidence
- [Twilio Voice React Native SDK v2.x](https://www.twilio.com/docs/voice/sdks/react-native) -- HIGH confidence
- [Twilio Voice RN SDK GitHub (Expo support in v2.x)](https://github.com/twilio/twilio-voice-react-native) -- HIGH confidence
- [twilio-go Access Token / VoiceGrant](https://github.com/twilio/twilio-go/blob/main/client/jwt/access_token.go) -- HIGH confidence
- [OpenAI gpt-4o-mini-transcribe ($0.003/min)](https://platform.openai.com/docs/models/gpt-4o-mini-transcribe) -- HIGH confidence
- [OpenAI Transcription Pricing](https://costgoat.com/pricing/openai-transcription) -- MEDIUM confidence
- [Twilio Inbound Call Forwarding](https://support.twilio.com/hc/en-us/articles/223179908-Setting-Up-Call-Forwarding) -- HIGH confidence
- [Twilio Recordings Resource API](https://www.twilio.com/docs/voice/api/recording) -- HIGH confidence
- [Twilio Call Resource API](https://www.twilio.com/docs/voice/api/call-resource) -- HIGH confidence
