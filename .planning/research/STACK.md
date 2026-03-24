# Technology Stack

**Project:** CloAgent v2.0 — Voice Calling, Recording, Transcription, AI Analysis, Mobile Dialer
**Researched:** 2026-03-23

## Recommended Stack

### Twilio Voice (Backend — Go)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `github.com/twilio/twilio-go` | v1.30.3 | Twilio REST API client + TwiML generation | Official Go SDK. Has typed TwiML structs (`VoiceDial`, `VoiceRecord`, etc.) with `Record`, `RecordingStatusCallback`, `StatusCallback` fields. Replaces the current raw HTTP calls in `calls.go`. Published Mar 10, 2026. |
| Twilio Voice API (2010-04-01) | Current | Make/receive calls, manage recordings | Already used implicitly via raw HTTP. The Go SDK wraps this properly with auth, retries, and type safety. |
| Twilio Dual-Channel Recording | Default | Separate agent/client audio tracks | Twilio records dual-channel (stereo) by default since 2023. Left channel = customer, right channel = agent. Critical for accurate per-speaker transcription. No extra cost. |

**Confidence:** HIGH — verified via Twilio official docs, Go SDK pkg.go.dev page (v1.30.3 published Mar 10, 2026).

### Audio Transcription (AI Service — Python)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| OpenAI `gpt-4o-transcribe` | Current (via openai SDK) | Primary transcription model | $0.006/min vs Twilio's $0.035-0.05/min (6-8x cheaper). Better accuracy than Whisper-1. Already have `openai==2.26.0` in requirements.txt and `OPENAI_API_KEY` configured. Zero new dependencies. |
| OpenAI `gpt-4o-transcribe-diarize` | Current (via openai SDK) | Speaker-labeled transcription (fallback) | Same price as base transcribe. Returns `diarized_json` with speaker labels (A/B), start/end timestamps per segment. Use when dual-channel splitting is not available. |
| `pydub` | 0.25.1 | Audio file manipulation | Split dual-channel stereo WAV into mono tracks (agent vs client) before transcription. Lightweight, well-maintained, wraps ffmpeg. |
| `ffmpeg` (system) | 6.x+ | Audio codec/format conversion | Required by pydub for WAV/MP3 processing. Add to Docker image. Twilio recordings come as WAV or MP3. |

**Why NOT Twilio built-in transcription:**
- 6-8x more expensive ($0.035-0.05/min vs $0.006/min)
- Lower accuracy (generic ASR vs GPT-4o-class model)
- No speaker diarization support
- Less control over output format
- We already have the OpenAI SDK and API key configured

**Why NOT self-hosted Whisper:**
- Requires GPU infrastructure (not in our Docker Compose setup)
- OpenAI API at $0.006/min is cheaper than GPU rental at our volume
- No maintenance burden

**Why `gpt-4o-transcribe` over `gpt-4o-mini-transcribe` ($0.003/min):**
- Call transcription accuracy is critical for CRM intelligence
- The $0.003 savings per minute is negligible vs the cost of a bad transcription missing a deal detail
- Use mini-transcribe only if cost becomes a concern at high volume

**Transcription strategy — dual approach:**
1. **Primary:** Download dual-channel recording from Twilio, split into agent/client mono tracks with pydub, transcribe each with `gpt-4o-transcribe`, interleave by timestamp
2. **Fallback:** If dual-channel splitting fails, use `gpt-4o-transcribe-diarize` on the mixed audio to get speaker-labeled segments automatically

**File size constraint:** OpenAI audio API accepts files up to 25 MB (~30 min at 16kHz mono WAV). Twilio recordings for typical real estate calls (5-30 min) fit within this limit. For longer recordings, chunk with pydub before transcribing.

**Confidence:** HIGH — OpenAI pricing verified via official pricing page, SDK already in project, gpt-4o-transcribe-diarize verified via OpenAI docs.

### AI Post-Call Analysis (AI Service — Python)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Anthropic Claude (Haiku 4.5) | Current (via anthropic SDK) | Analyze transcript, extract CRM actions | Already the AI backbone. Feed transcript as context, ask for structured output: summary, action items, deal updates, buyer profile changes. No new dependency. |

**No new dependencies needed.** The existing agent loop in `agent.py` already handles tool calls. Post-call analysis is a new service function that takes a transcript string and returns structured JSON via Claude, then executes the same write tools (log_activity, create_task, update_deal, update_buyer_profile) without requiring user confirmation (the agent already approved the call).

**Confidence:** HIGH — uses existing infrastructure.

### Call Recording Storage (Backend — Go)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Twilio Media Storage | Built-in | Store recordings | Twilio hosts recordings at `https://api.twilio.com/2010-04-01/Accounts/{sid}/Recordings/{recording_sid}.wav`. Default 30-day retention. Store the URL reference in DB rather than self-hosting. |
| PostgreSQL `call_logs` table | Existing + migration | Recording metadata | Extend with: `recording_sid`, `recording_url`, `recording_duration`, `transcript`, `transcript_raw` (JSONB), `ai_summary`, `ai_actions` (JSONB). |

**Why NOT S3/GCS for audio storage in v2.0:**
- Twilio stores recordings by default (30 days free, then $0.0025/min/month)
- Adding object storage is premature complexity
- If retention becomes an issue later, add S3 download-and-archive as a future enhancement
- The recording URL in the DB is sufficient for fetching and transcribing

**Confidence:** HIGH — standard Twilio pattern.

### React Native Mobile Dialer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Expo | SDK 55 (55.0.8) | React Native framework | Latest stable (Feb 25, 2026). Includes React Native 0.83. Managed workflow simplifies build/deploy. OTA updates. Team already knows React/TypeScript from the Next.js frontend. |
| React Native | 0.83 (via Expo 55) | Mobile UI runtime | Bundled with Expo 55. Do not install separately. |
| `@twilio/voice-react-native-sdk` | 1.7.0 (stable) | VoIP calling from mobile | Official Twilio SDK. Handles VoIP push notifications, call audio, CallKit (iOS) / ConnectionService (Android) integration. v1.7.0 is latest stable. |
| `@clerk/clerk-expo` | Latest | Auth in mobile app | Same Clerk auth as web frontend. Provides `useAuth()`, `useUser()`, token management. Shares the same Clerk application instance. |
| `expo-notifications` | ^55.0.0 | Push notification handling | For incoming call alerts when app is backgrounded. Bundled with Expo 55. |
| `@tanstack/react-query` | ^5.x | Data fetching | Same pattern as web frontend. Reuse API client patterns. |
| `expo-secure-store` | ^55.0.0 | Secure token storage | Store Clerk tokens and Twilio access tokens securely on device. |

**Why v1.7.0 (stable) over v2.0.0-preview of the Twilio Voice RN SDK:**
- Preview quality — only tested with Expo v52, not v55
- v2.x drops bare React Native support (breaking if we ever eject)
- v1.7.0 works with Expo via config plugin and with bare RN
- Stable, GA release with months of production use

**Why Expo over bare React Native:**
- Managed build pipeline (EAS Build) — no Xcode/Android Studio setup required
- OTA updates for JS bundle changes
- Config plugins handle native module linking (including Twilio Voice SDK)
- The mobile app is a thin dialer shell — does not need custom native code beyond what Twilio SDK provides

**Why NOT Flutter/Kotlin/Swift:**
- Team already knows TypeScript/React from the web frontend
- Twilio has an official React Native SDK (no official Flutter SDK for Voice)
- Cross-platform from a single codebase
- Thin client means framework choice matters less than developer velocity

**Confidence:** MEDIUM — Twilio Voice RN SDK v1.7.0 with Expo 55 is an untested combination. v1.7.0 docs reference Expo config plugin support but don't specify Expo 55 compatibility. May need `expo-build-properties` tweaks. Flag for validation during implementation.

### Twilio Access Tokens (Backend — Go)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Twilio Access Token (JWT) | Via `twilio-go` v1.30.3 | Authenticate mobile SDK | The mobile Twilio Voice SDK requires a short-lived access token (not Account SID/Auth Token). The Go backend generates these using the `twilio-go` SDK's access token utilities with a Voice grant. |
| Twilio TwiML App | Twilio Console config | Route mobile-originated calls | Required by Voice SDK. When the mobile app makes a call, Twilio hits the TwiML App's voice URL (our backend) to get call routing instructions. One-time setup per Twilio account. |

**New backend endpoint needed:** `GET /api/calls/token` — returns a short-lived Twilio access token for the authenticated agent's Twilio credentials. Used by the mobile app. Could also enable WebRTC web calling later.

**Confidence:** HIGH — standard Twilio Voice SDK pattern, documented in official quickstart.

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| Twilio built-in transcription | 6-8x more expensive, lower accuracy, no diarization |
| Self-hosted Whisper | Needs GPU, more infrastructure, OpenAI API is cheaper at our scale |
| AWS S3 / GCS for recording storage | Premature — Twilio hosts recordings. Add later if 30-day retention is insufficient |
| WebRTC / Twilio Client JS SDK | Out of scope for v2.0. Web calling is nice-to-have; focus on mobile + PSTN bridge first |
| Real-time transcription / streaming | Post-call is simpler, more reliable, and sufficient for CRM use case |
| `twilio-voice-react-native-expo` (community fork) | Unofficial fork. Use official SDK v1.7.0 with config plugin instead |
| Separate Twilio subaccount for Voice | Reuse existing twilio_config (shared SMS + Voice). Same Account SID works for both |
| `@twilio/voice-react-native-sdk` v2.0.0-preview | Preview quality, only tested on Expo 52, not production-ready |
| AssemblyAI / Deepgram | Extra vendor dependency when OpenAI SDK is already present and cheaper |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Transcription | OpenAI gpt-4o-transcribe | Twilio built-in | 6-8x more expensive, lower accuracy |
| Transcription | OpenAI gpt-4o-transcribe | AssemblyAI | Extra vendor dependency, similar pricing, OpenAI SDK already present |
| Transcription | OpenAI gpt-4o-transcribe | Deepgram | Extra vendor, no existing SDK in project |
| Mobile framework | Expo + React Native | Flutter | No Twilio Voice SDK for Flutter, team knows TypeScript |
| Mobile framework | Expo + React Native | Native iOS/Android | 2x the work, team is JS/TS-focused |
| Twilio Go interaction | twilio-go SDK | Raw HTTP (current) | SDK provides TwiML generation, typed responses, proper error handling |
| Audio processing | pydub + ffmpeg | SoX | pydub is more Pythonic, better maintained, more community examples |
| Call model | Two-leg bridge (PSTN) | WebRTC browser calling | PSTN bridge works with any phone, WebRTC needs browser/app open |

## New Dependencies Summary

### Backend (Go) — 1 new dependency

```bash
cd backend
go get github.com/twilio/twilio-go@v1.30.3
```

### AI Service (Python) — 1 new dependency + 1 system package

```bash
# Add to requirements.txt
pydub==0.25.1
```

Plus system dependency in ai-service Dockerfile:
```dockerfile
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

### Mobile App (New — React Native/Expo)

```bash
# Initialize new Expo project in repo root
npx create-expo-app@latest mobile --template blank-typescript

# Core Expo packages
npx expo install expo-secure-store expo-notifications expo-build-properties

# Auth (same Clerk as web)
npm install @clerk/clerk-expo

# Data fetching (same pattern as web)
npm install @tanstack/react-query

# Twilio Voice
npm install @twilio/voice-react-native-sdk@1.7.0
```

### Frontend (Next.js) — 0 new dependencies

No changes to the web frontend's package.json. Call UI already partially exists in the communication page.

## Integration Points with Existing Stack

| Existing Component | How Voice Integrates |
|-------------------|---------------------|
| `twilio_config` table | Reuse as-is. Same Account SID/Auth Token/Phone Number for SMS and Voice. Add `agent_phone TEXT` column for the agent's personal number (call forwarding target). |
| `call_logs` table (migration 015) | Extend with recording/transcript columns via new migration 016. |
| `calls.go` handler | Rewrite `InitiateCall` to use two-leg bridge TwiML via twilio-go SDK. Add recording webhook handler, TwiML endpoints, token endpoint. |
| `calls.ts` API client | Add recording URL, transcript, AI summary fields to `CallLog` interface. Add `getCallToken()` function. |
| AI service `tools.py` | Existing 3 call AI tools stay. Add `get_call_transcript` read tool. Post-call analysis is a service function, not a chat tool. |
| `agent.py` agent loop | No changes needed. Post-call analysis runs outside the chat loop as a background task triggered by the recording webhook. |
| `embeddings.py` | Add `embed_call_transcript()` to make call transcripts searchable via existing semantic search. |
| Communication page | Already has call log display. Extend with transcript viewer, AI summary display, recording audio playback. |
| Docker Compose | Add `ffmpeg` to ai-service Dockerfile. Mobile app runs on host via Expo, not in Docker. |
| `config.py` (AI service) | No new env vars needed — `OPENAI_API_KEY` already present for embeddings. |

## Database Migration Needed (016_call_recordings.sql)

```sql
-- Extend call_logs with recording and transcription columns
ALTER TABLE call_logs ADD COLUMN recording_sid TEXT;
ALTER TABLE call_logs ADD COLUMN recording_url TEXT;
ALTER TABLE call_logs ADD COLUMN recording_duration INTEGER;
ALTER TABLE call_logs ADD COLUMN transcript TEXT;
ALTER TABLE call_logs ADD COLUMN transcript_raw JSONB;  -- diarized segments with speaker/timestamps
ALTER TABLE call_logs ADD COLUMN ai_summary TEXT;
ALTER TABLE call_logs ADD COLUMN ai_actions JSONB;      -- actions taken by AI post-analysis

-- Agent's personal phone number for two-leg bridge calling
ALTER TABLE twilio_config ADD COLUMN agent_phone TEXT;   -- e.g., +15551234567
```

## New API Endpoints

```
GET    /api/calls/token              -- Twilio access token for mobile SDK
POST   /api/calls/initiate           -- (REWRITE) Two-leg bridge via twilio-go SDK
POST   /api/calls/twiml/outbound     -- (NEW, PUBLIC) TwiML for outbound bridge — Twilio hits this
POST   /api/calls/twiml/inbound      -- (NEW, PUBLIC) TwiML for inbound calls — forward to agent phone
POST   /api/calls/webhook/status     -- (REWRITE) Enhanced status callback
POST   /api/calls/webhook/recording  -- (NEW, PUBLIC) RecordingStatusCallback — triggers transcription pipeline
GET    /api/calls/{id}/transcript    -- Get call transcript + AI summary
GET    /api/calls/{id}/recording     -- Proxy recording audio from Twilio (avoids exposing creds to client)
```

## Two-Leg Bridge Call Flow (Key Architecture Decision)

```
1. Agent clicks "Call" in CRM (web or mobile)
2. POST /api/calls/initiate → Go backend calls Twilio REST API
   - Twilio calls the agent's personal phone (agent_phone from twilio_config)
   - URL param points to /api/calls/twiml/outbound
3. Agent answers their phone → Twilio hits /api/calls/twiml/outbound
4. TwiML response: <Dial record="record-from-answer-dual"
     recordingStatusCallback="/api/calls/webhook/recording">
     <Number>{client_phone}</Number></Dial>
5. Client phone rings, answers → two parties bridged
6. Call ends → Twilio processes recording → hits /api/calls/webhook/recording
7. Go backend receives RecordingStatusCallback → proxies to AI service
8. AI service: download audio → split channels → transcribe → analyze → update CRM
```

## Sources

- [Twilio TwiML Dial verb](https://www.twilio.com/docs/voice/twiml/dial) — two-leg bridge pattern, Record attribute
- [Twilio Recording resource](https://www.twilio.com/docs/voice/api/recording) — recording lifecycle, formats
- [Twilio dual-channel recordings by default](https://www.twilio.com/en-us/changelog/dual-channel-voice-recordings-by-default) — stereo at no extra cost
- [Twilio RecordingStatusCallback guide](https://support.twilio.com/hc/en-us/articles/360014251313-Getting-Started-with-Recording-Status-Callbacks) — webhook setup
- [twilio-go SDK v1.30.3 (pkg.go.dev)](https://pkg.go.dev/github.com/twilio/twilio-go/twiml) — TwiML generation structs
- [OpenAI Speech to Text](https://platform.openai.com/docs/guides/speech-to-text) — gpt-4o-transcribe API
- [OpenAI gpt-4o-transcribe-diarize model](https://platform.openai.com/docs/models/gpt-4o-transcribe-diarize) — speaker diarization
- [OpenAI API Pricing](https://openai.com/api/pricing/) — $0.006/min transcription
- [Whisper API Pricing comparison](https://brasstranscripts.com/blog/openai-whisper-api-pricing-2025-self-hosted-vs-managed) — cost analysis
- [Twilio Voice React Native SDK docs](https://www.twilio.com/docs/voice/sdks/react-native) — mobile SDK
- [@twilio/voice-react-native-sdk npm](https://www.npmjs.com/package/@twilio/voice-react-native-sdk) — v1.7.0 stable
- [Twilio Voice RN SDK Expo issue #496](https://github.com/twilio/twilio-voice-react-native/issues/496) — v2.x Expo support status
- [Expo SDK 55](https://expo.dev/sdk/55) — React Native 0.83, Feb 2026
