# Domain Pitfalls

**Domain:** Twilio Voice Calling + Recording + Transcription + AI Analysis + React Native Mobile Dialer for Existing CRM
**Researched:** 2026-03-23

## Critical Pitfalls

Mistakes that cause rewrites, broken call flows, compliance violations, or major user-facing failures.

### Pitfall 1: Broken TwiML Two-Leg Bridge (ALREADY EXISTS IN CODEBASE)

**What goes wrong:** The existing `calls.go` handler (line 61) uses inline TwiML that dials the client's number directly: `<Dial>+1234567890</Dial>`. This calls the client FROM the Twilio number, but the agent never picks up a phone. The agent hears nothing. The client gets a robotic "Connecting your call now" then gets dialed, but nobody is on the other end because Twilio called the client directly rather than bridging the agent in first.

**Why it happens:** Confusion between "who Twilio calls first" and "who gets dialed second." In a proper two-leg bridge, Twilio first calls the AGENT's real phone number, and only after the agent picks up does TwiML `<Dial>` the CLIENT. The current code has it backwards -- it uses the REST API `To` field for the client number and then the TwiML also dials the client number, resulting in the client getting called twice or the agent never being connected.

**Consequences:** Calls appear to initiate (Twilio returns a SID) but no actual conversation happens. Agent thinks the system is broken. Activity gets logged with a bogus "Outbound call" entry.

**Prevention:** The correct two-leg bridge pattern is:
1. REST API creates call TO the agent's personal phone, FROM the Twilio number
2. The `Url` parameter points to a TwiML endpoint that returns `<Response><Say>This call may be recorded.</Say><Dial callerId="{twilio_number}" record="record-from-answer-dual"><Number>{client_number}</Number></Dial></Response>`
3. Agent picks up, hears ringing as the client is dialed
4. Client sees the Twilio number (not the agent's personal number) as caller ID

**Detection:** Calls show status "completed" with 0 duration, or agent reports never receiving a phone call.

**Phase:** Must be fixed in Phase 1 (core call flow). This is the number one blocker.

---

### Pitfall 2: Missing Agent Personal Phone Number in Database

**What goes wrong:** The `twilio_config` table stores `account_sid`, `auth_token`, and `phone_number` (the Twilio number). There is no column for the agent's PERSONAL phone number -- the number Twilio should call first in the two-leg bridge. Without this, there is nowhere to store or retrieve the agent's real phone.

**Why it happens:** The table was designed for SMS only. SMS only needs the Twilio number (to send FROM). Voice calling needs both the Twilio number AND the agent's real phone.

**Consequences:** Cannot implement the two-leg bridge at all. If you hardcode or pass the agent's phone from the frontend, you have no server-side source of truth and the inbound forwarding flow (Twilio receives inbound call -> forwards to agent's phone) also breaks.

**Prevention:** Add `agent_phone_number TEXT` to `twilio_config` (or a new migration column). Require it during voice setup. Validate E.164 format.

**Detection:** Any attempt to implement outbound calling that asks "where does the agent's phone number come from?"

**Phase:** Must be addressed in Phase 1 (database migration).

---

### Pitfall 3: No StatusCallback URL on Outbound Calls

**What goes wrong:** The existing `InitiateCall` handler does not set `StatusCallback` when creating the Twilio call via REST API. This means Twilio has no URL to POST status updates to. The `call_logs` table gets a row with `status: "initiated"` that never gets updated to `ringing`, `in-progress`, or `completed`.

**Why it happens:** StatusCallback is optional in the Twilio API. The code "works" without it -- you get a call SID back. But you never learn what happened after.

**Consequences:** Call logs show all calls as "initiated" forever. Duration is always 0. `ended_at` is always NULL. Cannot trigger recording webhooks, transcription pipelines, or AI analysis because you never know when a call ends. The entire post-call pipeline is dead.

**Prevention:** Always set `StatusCallback` to your public webhook URL when creating calls. Set `StatusCallbackEvent` to include `initiated ringing answered completed`. The existing `CallStatusWebhook` handler exists but is never actually called because no call is configured to use it.

**Detection:** All call_logs rows have `status = 'initiated'` and `duration = 0`.

**Phase:** Phase 1 -- must be included when fixing the call flow.

---

### Pitfall 4: Recording Consent Compliance Violations

**What goes wrong:** Team enables `Record=true` on all calls without implementing consent mechanisms. In two-party consent states (California, Florida, Illinois, Maryland, Massachusetts, Michigan, Pennsylvania, and 6+ others), recording without all-party consent is ILLEGAL and can result in lawsuits and fines.

**Why it happens:** Developers focus on the technical implementation and forget that real estate agents operate across state lines. A California agent calling a client in Florida needs to comply with BOTH states' laws. Many states where real estate is hot (CA, FL, IL, MA, PA) are two-party consent states.

**Consequences:** Legal liability for the agent and the platform. Twilio's own Terms of Service require customers to comply with recording laws. Recordings made without consent may be inadmissible and create liability.

**Prevention:**
1. Play a consent announcement at the start of every recorded call: "This call may be recorded for quality purposes"
2. Use TwiML `<Say>` before `<Dial record="...">` to announce recording
3. Store consent acknowledgment (the fact that the announcement was played and the caller stayed on the line implies consent in most jurisdictions)
4. Provide a setting for agents to enable/disable recording per call or per state
5. Document in the UI that recording is enabled and what the legal requirements are

**Detection:** No `<Say>` announcement in the TwiML before recording starts. No consent documentation in the system.

**Phase:** Phase 1 -- must be part of the TwiML design from day one. Cannot retrofit consent after recordings are already being made.

---

### Pitfall 5: Recording Webhook Never Fires / Recordings Lost

**What goes wrong:** Team sets `Record=true` on the `<Dial>` verb but does not set `recordingStatusCallback`. Twilio creates the recording but has no URL to notify when it is ready. The recording sits in Twilio's cloud, the CRM never knows about it, and the transcription/AI pipeline never triggers.

**Why it happens:** Confusion between `StatusCallback` (call status) and `recordingStatusCallback` (recording status). These are DIFFERENT webhooks. You need both. Additionally, recordings require post-processing by Twilio and are not available immediately when the call ends -- there is a delay of seconds to minutes.

**Consequences:** Recordings exist in Twilio but the CRM has no reference to them. No transcription happens. No AI analysis. The entire value proposition of "AI listens to your calls" is dead. Worse, recordings accumulate in Twilio's storage costing $0.0025/min and nobody notices.

**Prevention:**
1. Set `recordingStatusCallback` on the `<Dial>` verb pointing to a dedicated webhook endpoint
2. Set `recordingStatusCallbackEvent` to `completed` (default, but be explicit)
3. The webhook receives `RecordingUrl`, `RecordingSid`, `RecordingDuration`, `CallSid` -- store ALL of these
4. Download the recording from Twilio to your own storage (S3 or local) within the webhook handler
5. Delete from Twilio after successful download to avoid storage costs and reduce PII exposure

**Detection:** Calls complete successfully but no recording URLs appear in the database. Check Twilio console -- recordings are there but the app does not know about them.

**Phase:** Phase 2 (recording infrastructure). This is the bridge between "calls work" and "AI processing works."

---

### Pitfall 6: Storing Twilio Auth Tokens in Plaintext

**What goes wrong:** The existing `twilio_config` table stores `auth_token` in plaintext. The auth token is the master key to the Twilio account -- it can make calls, send SMS, read recordings, and rack up charges. If the database is compromised, every agent's Twilio account is compromised.

**Why it happens:** The SMS integration was built quickly and encryption was deferred. The pattern was copied from simpler credential storage.

**Consequences:** A database breach (SQL injection, backup leak, insider access) exposes Twilio credentials. Attacker can make calls, send SMS, and access recordings containing sensitive client conversations about finances, property details, and personal information.

**Prevention:**
1. Encrypt auth tokens at rest using AES-256 with a key stored in environment variables (not in the database)
2. Use Twilio API Keys (SK...) instead of the master Auth Token where possible -- API keys can be scoped and revoked
3. At minimum, add encryption before adding voice recording (recordings are higher-value PII than SMS)

**Detection:** `SELECT auth_token FROM twilio_config` returns readable tokens. The column should contain ciphertext.

**Phase:** Phase 2 (security hardening before recordings flow through the system).

---

### Pitfall 7: Webhook URL Must Be Publicly Accessible

**What goes wrong:** Twilio webhooks (StatusCallback, recordingStatusCallback, voice URL for TwiML) require a publicly accessible HTTPS URL. Developers test locally, forget to configure ngrok or a tunnel, webhooks silently fail, and the entire call flow breaks because Twilio cannot reach the TwiML endpoint.

**Why it happens:** The existing SMS webhook works because it was configured once in the Twilio console. Voice webhooks are set per-call via the REST API, so the URL must be correct every time. In development, `localhost:8080` is not reachable by Twilio.

**Consequences:** Outbound calls fail entirely (Twilio cannot fetch TwiML). Status callbacks never arrive. Recording callbacks never arrive. Everything appears broken with no clear error in the application logs -- the errors are only visible in the Twilio debugger console.

**Prevention:**
1. Add a `WEBHOOK_BASE_URL` environment variable (e.g., `https://abc123.ngrok.io` in dev, `https://api.cloagent.com` in prod)
2. All webhook URLs are constructed from this base: `WEBHOOK_BASE_URL + "/api/calls/twiml"`, `WEBHOOK_BASE_URL + "/api/calls/status"`, etc.
3. Validate on startup that the URL is set and is HTTPS
4. Use ngrok with a stable subdomain for development
5. Add Twilio signature validation on ALL webhook endpoints (the SMS webhook already has this pattern)

**Detection:** Twilio debugger shows 11200 errors (HTTP retrieval failure). Application logs show no incoming webhook requests.

**Phase:** Phase 1 -- required for any call flow to work at all.

---

## Moderate Pitfalls

### Pitfall 8: Whisper Cannot Do Speaker Diarization Natively

**What goes wrong:** Team assumes OpenAI Whisper API will return a transcript labeled "Agent said X, Client said Y." It does not. Whisper produces a flat text transcript with no speaker attribution. The AI analysis then cannot distinguish who said what.

**Prevention:** Use `record="record-from-answer-dual"` on the Twilio `<Dial>` verb to get dual-channel recording (agent on one channel, client on the other). Transcribe each channel separately with Whisper. Interleave by timestamp. This gives you clean speaker attribution without needing diarization. Alternatively, use WhisperX (open-source) or a service like Deepgram/AssemblyAI that has built-in diarization.

**Phase:** Phase 3 (transcription). This is a design decision that must be made before building the transcription pipeline.

---

### Pitfall 9: Recording Download Timing Race Condition

**What goes wrong:** The `recordingStatusCallback` webhook fires with `RecordingUrl`, but the recording file is not yet fully processed. Attempting to download immediately returns a 404 or partial file. Team adds retry logic that is either too aggressive (hammering Twilio) or too slow (delaying AI analysis by minutes).

**Prevention:** Wait for the `completed` status in the recording callback (do not try to download on `in-progress`). Add a short delay (2-5 seconds) before downloading. Implement exponential backoff with 3 retries. Store the recording URL in the database immediately and process asynchronously via a background job.

**Phase:** Phase 2 (recording download pipeline).

---

### Pitfall 10: Twilio Cost Surprises

**What goes wrong:** Team does not estimate costs. A real estate agent making 30 calls/day averaging 8 minutes each:
- Outbound calls: 30 x 8 min x $0.014/min = $3.36/day
- Recording: 30 x 8 min x $0.0025/min = $0.60/day
- Recording storage (if not deleted after download): accumulates at $0.0025/min/month
- Whisper API transcription: 30 x 8 min x $0.006/min = $1.44/day (OpenAI pricing)
- Total: ~$5.40/day per agent = ~$162/month per agent

This is BEFORE the Claude API costs for AI analysis of each transcript.

**Prevention:**
1. Calculate per-agent costs before launch and factor into pricing
2. Delete Twilio recordings after downloading to your own storage (eliminates storage costs)
3. Use Whisper API ($0.006/min) over Twilio built-in transcription ($0.05/min) -- Whisper is 8x cheaper
4. Set Twilio spending limits in the console
5. Add cost tracking to the admin dashboard

**Phase:** Phase 2 (cost estimation), Phase 4 (cost monitoring).

---

### Pitfall 11: SMS Webhook and Voice Webhook Conflict on Same Twilio Number

**What goes wrong:** The existing Twilio number has its SMS webhook configured to `POST /api/sms/webhook`. When voice is added, the same number needs a voice webhook configured in the Twilio console. Teams forget that Twilio numbers have SEPARATE webhook configurations for Voice and SMS. If the voice URL is not configured in the Twilio console, inbound calls to the Twilio number return a default "application error" message.

**Prevention:**
1. Configure BOTH webhooks in the Twilio console for the phone number: Voice URL -> `/api/calls/voice` (for inbound call handling), SMS URL -> `/api/sms/webhook` (already configured)
2. Alternatively, configure webhooks programmatically via the Twilio REST API when the agent sets up their number
3. The `SMSConfigure` handler should be extended (or a new `VoiceConfigure` handler added) to set BOTH webhook URLs on the Twilio number via their API

**Detection:** Inbound calls to the Twilio number play an error message or go to Twilio's default voicemail instead of forwarding to the agent.

**Phase:** Phase 1 (inbound call forwarding setup).

---

### Pitfall 12: React Native Twilio Voice SDK iOS Push Notification Hell

**What goes wrong:** Incoming calls on iOS require VoIP push notifications via Apple's PushKit framework. The app must report the incoming call to CallKit within a few seconds of receiving the push or iOS will terminate the app. The setup requires: Apple VoIP push certificate, Twilio Push Credential resource, correct AppDelegate configuration, and the SDK's PushKit handler initialization. Missing any one of these causes incoming calls to silently fail on iOS.

**Prevention:**
1. Start with outbound-only calls in the mobile app (no push notifications needed)
2. Add iOS incoming call support as a separate phase -- it has its own certificate, provisioning, and testing requirements
3. Use the SDK's built-in `Voice.initializePushRegistry()` rather than custom PushKit handling
4. Test on a REAL iOS device (push notifications do not work in the simulator)
5. Monitor for APNs rejection errors (52143) in the Twilio console
6. Do NOT delete the Push Credential when the VoIP certificate expires -- update it instead

**Detection:** Incoming calls work on Android but not iOS. Twilio console shows 52143 errors.

**Phase:** Phase 5 (mobile app). Start with outbound-only to defer this complexity.

---

### Pitfall 13: React Native Twilio Voice SDK Expo/New Architecture Incompatibility

**What goes wrong:** The Twilio Voice React Native SDK 2.x does not support frameworkless ("bare") React Native apps out-of-the-box. If using Expo (which the project plans to), there is no official Expo plugin. A community fork (`twilio-voice-react-native-expo`) exists but is not maintained by Twilio. The New Architecture migration can cause `java.lang.IllegalArgumentException` crashes.

**Prevention:**
1. Use Expo with a development build (not Expo Go -- native modules require custom builds)
2. Pin the SDK version and test thoroughly before upgrading
3. Seriously consider building the mobile app as a thin WebView shell that uses the web-based Twilio Client JS SDK instead of the native Voice SDK -- dramatically simpler, avoids all native module issues, and the project constraint says "thin shell" anyway
4. If native SDK is required for call quality, use bare React Native (not Expo) and accept the additional build complexity

**Detection:** Build failures, crash on app launch, or "module not found" errors related to twilio-voice-react-native.

**Phase:** Phase 5 (mobile app). This is a technology choice that should be decided before writing any mobile code.

---

### Pitfall 14: Webhook Endpoint Missing Twilio Signature Validation

**What goes wrong:** The existing `CallStatusWebhook` handler does NOT validate the `X-Twilio-Signature` header. Compare with `SMSWebhook` which does validate. This means anyone can POST to the call status webhook and inject fake call status updates, potentially corrupting call logs data.

**Prevention:** Copy the `validateTwilioSignature` pattern from `SMSWebhook` to all voice webhook endpoints. The `auth_token` lookup requires knowing which agent the call belongs to -- for voice webhooks, look up the agent via the `CallSid` in the `call_logs` table, then fetch their auth token from `twilio_config`.

**Detection:** The webhook endpoint accepts POST requests without `X-Twilio-Signature` header.

**Phase:** Phase 1 (security for all webhook endpoints).

---

### Pitfall 15: RLS Bypass in Webhook Handlers

**What goes wrong:** Webhook handlers (like `CallStatusWebhook`) are PUBLIC endpoints -- they have no Clerk auth and no `agentID` from context. The existing handler uses `pool.Exec` directly without RLS. This works for simple updates but is inconsistent with the rest of the codebase. As more webhook handlers are added (recording callback, transcription callback), developers may accidentally write queries that operate across agents or fail to scope data properly.

**Prevention:** In webhook handlers that need to query agent-scoped data:
1. Look up the agent_id from the call_logs row using the Twilio CallSid
2. Use `database.BeginWithRLS()` with that agent_id for any subsequent queries
3. Never trust data from the webhook payload for agent_id -- always derive it from your database

**Detection:** Webhook handler code that uses `pool.Exec` without RLS, or that does not verify the agent_id.

**Phase:** Phase 1 (all webhook handlers).

---

## Minor Pitfalls

### Pitfall 16: Phone Number Format Inconsistency

**What goes wrong:** The existing `normalizePhone` function strips to last 10 digits for matching. Twilio always sends numbers in E.164 format (+1XXXXXXXXXX for US). If the agent enters their personal phone as "(555) 123-4567" in settings and the code compares it against "+15551234567" from Twilio, matching fails because the normalization strips the country code. This affects contact matching for call logs and inbound call routing.

**Prevention:** Store all phone numbers in E.164 format. Validate and normalize on input. The existing `normalizePhone` approach (last 10 digits) works for US numbers but will break for international numbers if the product ever expands.

**Phase:** Phase 1 (data consistency).

---

### Pitfall 17: Activity Type Collision -- SMS Logged as 'call'

**What goes wrong:** The existing SMS handler (`sms.go` line 222) logs SMS activities as type `'call'` instead of `'sms'`. When voice call activities are also logged as type `'call'`, the activity feed mixes real calls with SMS-related activities. Contact activity history becomes unreliable.

**Prevention:** Fix the SMS handler to log as type `'sms'`. Ensure voice call activities use type `'call'` consistently. Add recording/transcription data to the call activity body for AI context.

**Detection:** Activity feed shows "SMS sent: ..." with type "call".

**Phase:** Phase 1 (bug fix before adding more call activities).

---

### Pitfall 18: Transcription Processing Blocks Request Handler

**What goes wrong:** The recording webhook handler downloads the recording, sends it to Whisper for transcription, waits for the result, then sends the transcript to Claude for analysis -- all in the same HTTP request handler. This takes 30-120 seconds. Twilio's webhook timeout is 15 seconds. Twilio retries the webhook, causing duplicate processing.

**Prevention:** The recording webhook should:
1. Acknowledge the recording (200 response) immediately
2. Store the recording URL and metadata in the database
3. Queue the transcription job (background goroutine, or post to the AI service)
4. The AI service processes asynchronously (it already uses `asyncio.create_task` for workflows)

**Detection:** Twilio debugger shows timeout errors on recording callback. Duplicate transcriptions in the database.

**Phase:** Phase 3 (transcription pipeline design).

---

### Pitfall 19: Recording URL Expiration After Deletion

**What goes wrong:** Twilio recording URLs are not permanently accessible. If the recording is deleted from Twilio (which we recommend for cost/security), the URL becomes a 404. If the application stores only the URL and not the actual audio file, the recording is lost forever.

**Prevention:** Always download the recording to your own storage (local filesystem for dev, S3 for prod) within the recording webhook handler. Store the local/S3 path in the database, not just the Twilio URL. Delete from Twilio after confirmed download.

**Phase:** Phase 2 (recording storage).

---

### Pitfall 20: AI Analysis Token Costs for Long Calls

**What goes wrong:** A 30-minute real estate call produces ~4,500 words of transcript. Sending the full transcript to Claude for analysis with a system prompt uses ~6,000-8,000 tokens input. At Haiku pricing this is cheap (~$0.005), but if the team uses Sonnet or Opus for better analysis quality, costs jump 10-60x. With 30 calls/day, this adds up fast.

**Prevention:** Use Haiku for initial extraction (summary, action items, key facts). Only escalate to a larger model if the agent explicitly requests deeper analysis. Truncate or chunk very long transcripts. Cache analysis results.

**Phase:** Phase 3 (AI analysis pipeline).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Fix call flow | TwiML two-leg bridge wrong (Pitfall 1) | Test with actual phones, not just API responses |
| Phase 1: Fix call flow | No webhook base URL configured (Pitfall 7) | Add WEBHOOK_BASE_URL env var, validate on startup |
| Phase 1: Fix call flow | Missing agent phone number (Pitfall 2) | Add column to twilio_config, require on setup |
| Phase 1: Fix call flow | SMS activity type bug (Pitfall 17) | Fix `'call'` -> `'sms'` in sms.go line 222 |
| Phase 1: Fix call flow | Consent announcement missing (Pitfall 4) | Include `<Say>` in TwiML from day one |
| Phase 1: Fix call flow | No signature validation on call webhooks (Pitfall 14) | Copy pattern from SMS webhook |
| Phase 2: Recording | RecordingStatusCallback not set (Pitfall 5) | Both StatusCallback AND recordingStatusCallback needed |
| Phase 2: Recording | Recording URLs expire after deletion (Pitfall 19) | Download to S3/local before deleting from Twilio |
| Phase 2: Recording | Auth token plaintext (Pitfall 6) | Encrypt before recordings flow through system |
| Phase 2: Recording | Download race condition (Pitfall 9) | Async processing with retry backoff |
| Phase 3: Transcription | Whisper has no diarization (Pitfall 8) | Use dual-channel recording for speaker separation |
| Phase 3: Transcription | Sync processing blocks webhook (Pitfall 18) | Async pipeline, acknowledge webhook immediately |
| Phase 3: AI Analysis | Token cost escalation (Pitfall 20) | Use Haiku, truncate long transcripts |
| Phase 5: Mobile | iOS push notification setup (Pitfall 12) | Start outbound-only, defer incoming call support |
| Phase 5: Mobile | Expo/SDK incompatibility (Pitfall 13) | Consider WebView + Twilio Client JS instead |
| Phase 5: Mobile | Twilio number voice URL not configured (Pitfall 11) | Configure voice + SMS webhooks together |

## Codebase-Specific Issues Found During Research

These are bugs or gaps in the EXISTING code that will cause problems during this milestone:

1. **`calls.go` line 61**: TwiML `<Dial>` dials `body.To` (the client) but the REST API also calls `body.To`. The agent's phone is never involved. The entire call flow is wrong.

2. **`calls.go` line 61**: No `Record` attribute on `<Dial>`. No `recordingStatusCallback`. No `StatusCallback` on the REST API call.

3. **`calls.go` line 100**: Inserts into `call_logs` without RLS transaction (uses `pool.QueryRow` directly). Inconsistent with the rest of the codebase.

4. **`sms.go` line 222**: SMS activity logged as type `'call'` -- should be `'sms'`.

5. **`twilio_config` table**: No `agent_phone_number` column. Cannot store the agent's personal phone for two-leg bridge.

6. **`call_logs` table**: No columns for `recording_url`, `recording_sid`, `recording_duration`, `transcript`, or `ai_summary`. These must be added via migration.

7. **`CallStatusWebhook`**: No Twilio signature validation (compare with `SMSWebhook` which does validate).

## Sources

- [Twilio Dial TwiML Documentation](https://www.twilio.com/docs/voice/twiml/dial) -- HIGH confidence
- [Twilio Recording Consent Legal Considerations](https://support.twilio.com/hc/en-us/articles/360011522553-Legal-Considerations-with-Recording-Voice-and-Video-Communications) -- HIGH confidence
- [Twilio Recording Status Callbacks](https://support.twilio.com/hc/en-us/articles/360014251313-Getting-Started-with-Recording-Status-Callbacks) -- HIGH confidence
- [Twilio Missing Recordings Troubleshooting](https://support.twilio.com/hc/en-us/articles/360014252253-Missing-Programmable-Voice-Recordings) -- HIGH confidence
- [Twilio Webhook Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) -- HIGH confidence
- [Twilio Voice React Native SDK](https://www.twilio.com/docs/voice/sdks/react-native) -- HIGH confidence
- [Twilio Voice React Native iOS Push Issues (GitHub #534)](https://github.com/twilio/twilio-voice-react-native/issues/534) -- MEDIUM confidence
- [Twilio Voice Pricing](https://www.twilio.com/en-us/voice/pricing/us) -- HIGH confidence
- [Twilio Recording Pricing](https://help.twilio.com/articles/223132527-How-much-does-it-cost-to-record-a-call-) -- HIGH confidence
- [Whisper Diarization Limitations (GitHub Discussion #264)](https://github.com/openai/whisper/discussions/264) -- MEDIUM confidence
- [WhisperX Benchmarks](https://brasstranscripts.com/blog/whisperx-vs-competitors-accuracy-benchmark) -- MEDIUM confidence
- [Twilio HIPAA and PII Guidelines](https://www.twilio.com/en-us/hipaa) -- HIGH confidence
- [Downloading and Deleting Twilio Recordings](https://support.twilio.com/hc/en-us/articles/360002588893-Downloading-and-Deleting-Twilio-Call-Recordings) -- HIGH confidence
- [Two-Party Consent State Laws (HubSpot)](https://knowledge.hubspot.com/calling/what-are-the-call-recording-laws) -- MEDIUM confidence
- [Twilio Call Recording Best Practices](https://support.twilio.com/hc/en-us/articles/360011435554-Best-Practices-for-Using-Twilio-to-Manage-and-Record-Communications-Between-Users) -- HIGH confidence
