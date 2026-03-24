# Feature Landscape: Twilio Voice Calling with AI Post-Call Processing

**Domain:** CRM Voice Calling + AI Call Intelligence + Mobile Dialer
**Researched:** 2026-03-23
**Confidence:** MEDIUM-HIGH (Twilio docs well-known, CRM calling patterns well-established, RN Voice SDK is GA)

---

## Table Stakes

Features users expect from any CRM with voice calling. Missing any of these makes the feature feel broken or incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Two-leg bridge outbound calls** | Every CRM dialer works this way (HubSpot, Close, FollowUpBoss). Agent clicks "Call" in CRM, their phone rings first, then bridges to client. Feels natural. | MEDIUM | Existing `twilio_config`, `call_logs` table, `calls.go` handler (needs TwiML fix) | Current code is broken -- TwiML dials client directly instead of agent first. Must fix to: (1) call agent's personal phone, (2) on answer, bridge to client via `<Dial>`. Requires `agent_phone_number` field in config. |
| **Agent personal phone number** | Two-leg bridge requires knowing where to ring the agent. Every CRM calling setup asks for this. | LOW | `twilio_config` table needs `agent_phone_number` column | Simple ALTER TABLE + settings UI field. This is the foundation -- nothing else works without it. |
| **Call status tracking (StatusCallback)** | Users expect to see "ringing", "in-progress", "completed" in real-time. HubSpot, Close, Salesloft all show live call status. | LOW | Existing `CallStatusWebhook` handler (already built), needs public URL config | Webhook handler exists but needs the StatusCallback URL set on the Twilio API call. Add `StatusCallback` param when initiating. |
| **Call recording** | Standard in every sales CRM. HubSpot, Close, Salesloft, OpenPhone all record by default. Agents expect it. Compliance requires consent notice. | LOW | Twilio `Record=true` on `<Dial>` verb, `RecordingStatusCallback` webhook | Just add `record="record-from-answer-dual"` to TwiML `<Dial>`. Twilio handles storage. Need webhook to receive recording URL. |
| **Recording storage + playback** | If you record, users must be able to listen back. Every CRM with recording has an audio player in the call detail view. | MEDIUM | `call_logs` table needs `recording_url`, `recording_sid`, `recording_duration` columns. Frontend audio player. | Store Twilio recording URL. Recordings live on Twilio servers (or S3 if you want to own them). Simple `<audio>` element for playback. |
| **Call history in contact detail** | Users expect to see all calls with a contact, with duration, status, date, and playback. Standard in every CRM. | LOW | Existing `ListCallLogs` with `contact_id` filter, existing Communication page Calls tab | Already partially built. Need to add recording playback and richer status display. |
| **Inbound call forwarding** | When someone calls the Twilio number, it must ring the agent's real phone. Without this, inbound calls go nowhere. | MEDIUM | TwiML app / webhook URL on Twilio number, `agent_phone_number` in config | Twilio number needs a Voice webhook URL configured. Webhook returns TwiML `<Dial>` to agent's personal phone. Must also create `call_logs` entry for inbound calls and match contact by caller ID. |
| **Contact matching (caller ID)** | Inbound calls should show who's calling by matching phone number to contacts. HubSpot, Close, OpenPhone all do this. | LOW | Existing `matchContactByPhone` helper in `calls.go` | Already built for outbound. Same logic applies to inbound webhook. |
| **Call duration tracking** | Users need to know how long calls lasted. Every CRM shows this. | LOW | Already tracked via `StatusCallback` webhook `CallDuration` param | Already partially implemented in `CallStatusWebhook`. Just needs the recording callback to also capture accurate duration. |
| **Auto-log activity on call completion** | When a call ends, an activity should be logged to the contact's timeline. HubSpot, Close, Salesloft all auto-log. | LOW | Existing activities system, trigger on `completed` status | Currently logs on initiation (premature). Should log on completion with duration, outcome, and link to recording. |
| **Call outcome tagging** | After a call, agent marks it as "Connected", "Voicemail", "No Answer", "Wrong Number". HubSpot and Close both have this. | LOW | New `outcome` column on `call_logs`, simple dropdown UI | Simple enum field. Could auto-set based on Twilio status (no-answer, busy) with manual override for connected calls. |

---

## Differentiators

Features that set the product apart. Not expected by every user, but highly valued and aligned with CloAgent's AI-first positioning.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **AI post-call transcription** | Automatically transcribe every recorded call. Saves agents from manual note-taking. OpenPhone and Salesloft have this; most small-agent CRMs do not. | MEDIUM | Recording URL from Twilio, OpenAI Whisper API (already have `OPENAI_API_KEY`), new `call_transcripts` table or column | Use Whisper API (not Twilio built-in transcription -- Whisper is better quality and supports diarization). Process async after recording webhook fires. Store transcript as text. |
| **AI call summary + action items** | Claude reads transcript and generates: (1) call summary, (2) extracted action items, (3) suggested CRM updates. This is the killer feature -- 74% of teams fail to turn call data into follow-up (Vendasta research). | MEDIUM | Transcript text, Claude API (already integrated), existing AI tools infrastructure | After transcription completes, run Claude with transcript + contact context. Output: summary paragraph, list of action items, suggested deal stage change, buyer profile updates. Store in `call_logs` or linked table. |
| **Auto-create follow-up tasks** | AI identifies "I'll send you the comps by Friday" and auto-creates a task with due date. Otter.ai and Gong do this for enterprise; rare in small-agent CRMs. | MEDIUM | AI summary output, existing task creation (`create_task` AI tool), workflow engine | Claude extracts commitments from transcript. Creates pending tasks via existing task system. Could use existing workflow triggers (`activity_logged` with type=call). |
| **Auto-update deal stage / buyer profile** | If transcript reveals "they accepted our offer" or "they want 4 bedrooms", AI updates the deal or buyer profile automatically. Transformative for agents who forget to update CRM after calls. | HIGH | AI analysis output, existing `update_deal` and `update_buyer_profile` AI tools, confirmation flow | This is powerful but risky -- wrong auto-updates damage trust. Use existing confirmation card pattern: AI suggests updates, agent confirms with one click. Never fully automatic. |
| **Call transcript in AI chat context** | When chatting about a contact, AI has access to their call transcripts. "What did Sarah say about her budget?" works because the AI can reference the transcript. | MEDIUM | Stored transcripts, modification to AI system prompt context loading, possibly embeddings | Embed transcripts into pgvector for semantic search. Load recent call summaries into contact-scoped AI chat system prompt (like buyer profile is loaded today). |
| **Mobile dialer app (React Native)** | Agent can make/receive CRM-connected calls from their phone with a native experience. Twilio has an official GA React Native Voice SDK with a reference dialer app. | HIGH | Twilio Voice React Native SDK (GA), backend token generation endpoint, push notification setup | Thin client -- backend handles all business logic. App needs: auth (Clerk), contact list, dialer UI, call screen, push notifications for inbound. Twilio provides reference app as starting point. |
| **Call whisper / pre-call context** | Before connecting to the client, the agent hears a whisper: "Incoming call from Sarah Johnson, interested in 4BR in Denver, deal at Offer stage." Close CRM has this. | LOW | Contact data lookup on inbound, TwiML `<Say>` before `<Dial>` | When inbound call webhook fires, look up contact, generate a short whisper, insert `<Say>` TwiML before `<Dial>`. Simple but very useful for agents juggling many clients. |
| **Voicemail detection + drop** | Detect answering machines on outbound calls. If voicemail detected, auto-leave a pre-recorded message. FollowUpBoss and power dialers have this. | MEDIUM | Twilio `MachineDetection` parameter, pre-recorded voicemail audio | Set `MachineDetection=DetectMessageEnd` on outbound call. If machine detected, play pre-recorded message. Saves agent time on unconnected calls. |
| **Recording consent announcement** | Auto-play "This call may be recorded" at the start. Required in many US states (two-party consent). HubSpot does this. | LOW | TwiML `<Say>` or `<Play>` before recording starts | Simple TwiML addition. Could be toggled in settings. Critical for compliance in CA, IL, FL, and other two-party consent states. |

---

## Anti-Features

Features to explicitly NOT build. These add complexity without proportional value for a real-estate agent CRM.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Real-time transcription (live streaming)** | Massively complex (WebSocket media streams, real-time ASR, latency management). HubSpot and Close don't do this -- they all use post-call recording. Fragile, expensive, marginal benefit over post-call for a CRM. | Post-call recording + Whisper transcription. Simpler, more reliable, better accuracy. |
| **Power dialer / auto-dialer** | Regulatory minefield (TCPA compliance, FCC rules). Only makes sense for high-volume cold calling operations, not typical real estate agents. | Single-call dialer with click-to-call. Agents call one contact at a time. |
| **IVR / phone tree system** | Over-engineered for individual agents or small teams. IVR is for call centers, not solo real estate agents. | Direct forwarding to agent's phone. Simple, personal. |
| **Conference calling / multi-party** | Rarely needed in real estate sales calls. Adds complexity to call management. Not a table-stakes CRM feature. | Two-party calls only. If agent needs a conference, they use Zoom. |
| **In-browser calling (WebRTC)** | Requires Twilio Client SDK, complex audio handling, browser permissions, echo cancellation. Agents prefer using their actual phone -- it feels natural and professional. | Two-leg bridge to agent's real phone. Browser is for CRM, phone is for talking. |
| **Real-time sentiment analysis** | Gimmicky. Requires real-time audio streaming, NLP pipeline, and the output ("caller sounds angry") is rarely actionable during a call. Enterprise feature. | Post-call sentiment as part of AI summary. More accurate, less complex. |
| **Call coaching / live whisper to agent** | Requires a third call leg, real-time audio mixing. Manager-focused feature for sales teams, not individual agents. | Post-call AI summary with coaching notes (e.g., "You talked 70% of the time -- try asking more questions"). |
| **SMS-to-voice escalation** | Auto-calling contacts who don't respond to SMS. Invasive, likely to annoy contacts. | Keep SMS and voice as separate, user-initiated channels. |
| **Custom hold music / ring tones** | Vanity feature. Zero impact on agent productivity or deal conversion. | Default Twilio ring tone. |

---

## Feature Dependencies

```
agent_phone_number (config)
    |
    +---> Two-leg bridge outbound
    |        |
    |        +---> Call recording (Record on <Dial>)
    |        |        |
    |        |        +---> Recording webhook + storage
    |        |        |        |
    |        |        |        +---> AI transcription (Whisper)
    |        |        |        |        |
    |        |        |        |        +---> AI call summary + action items
    |        |        |        |        |        |
    |        |        |        |        |        +---> Auto-create tasks
    |        |        |        |        |        +---> Auto-update deals/profiles (with confirmation)
    |        |        |        |        |
    |        |        |        |        +---> Transcript in AI chat context
    |        |        |        |        +---> Transcript embeddings (pgvector)
    |        |        |        |
    |        |        |        +---> Recording playback UI
    |        |        |
    |        |        +---> Recording consent announcement
    |        |
    |        +---> Call status tracking (StatusCallback)
    |        +---> Call outcome tagging
    |        +---> Auto-log activity on completion
    |
    +---> Inbound call forwarding
    |        |
    |        +---> Contact matching (caller ID)
    |        +---> Call whisper (pre-call context)
    |
    +---> Mobile dialer app (parallel track)
             |
             +---> Twilio Voice RN SDK
             +---> Push notifications
             +---> Backend token generation
```

Key dependency insight: Everything starts with `agent_phone_number` in the config. The two-leg bridge is the foundation. Recording builds on the bridge. AI processing builds on recording. The mobile app is a parallel track that can be built alongside or after the web calling features.

---

## Existing Infrastructure (Already Built)

What exists today and its status:

| Component | Status | What Works | What's Broken/Missing |
|-----------|--------|------------|----------------------|
| `twilio_config` table | DONE | account_sid, auth_token, phone_number, last_synced_at | Missing `agent_phone_number` column |
| `call_logs` table | DONE | id, agent_id, twilio_sid, contact_id, from/to, direction, status, duration, started_at, ended_at | Missing recording_url, recording_sid, transcript, summary, outcome columns |
| `InitiateCall` handler | BROKEN | Twilio API call works, call_logs insert works, contact matching works | TwiML is wrong -- dials client directly instead of bridging through agent. No StatusCallback URL. No recording. |
| `CallStatusWebhook` handler | PARTIAL | Receives status updates, updates call_logs | No recording callback handling. No post-completion processing trigger. |
| `ListCallLogs` / `GetCallLog` | DONE | Pagination, contact_id filter, direction filter, JOIN for contact_name | No recording playback data returned |
| `SyncCallLogs` handler | DONE | Pulls recent calls from Twilio API, upserts, contact matching | No recording data synced |
| Frontend `calls.ts` API client | DONE | listCallLogs, getCallLog, initiateCall, syncCallLogs | No recording playback, no outcome tagging |
| Communication page Calls tab | DONE | Lists calls, shows status/duration | No recording player, no transcript view, no outcome tags |
| AI tools (3) | DONE | search_call_logs, get_call_history, initiate_call | No transcript search, no call summary access |

---

## MVP Recommendation

**Phase 1 -- Fix the foundation (table stakes):**
1. Add `agent_phone_number` to `twilio_config` + settings UI
2. Fix two-leg bridge TwiML (call agent first, bridge to client)
3. Add `StatusCallback` URL to outbound calls
4. Enable call recording (`Record` attribute on `<Dial>`)
5. Build recording webhook to store recording URL
6. Add recording playback in call detail / communication page
7. Fix activity auto-logging (log on completion, not initiation)
8. Recording consent announcement (togglable in settings)

**Phase 2 -- Inbound + polish:**
1. Inbound call webhook (forward to agent's phone)
2. Inbound contact matching + call log creation
3. Call whisper for inbound (pre-call context)
4. Call outcome tagging UI
5. Voicemail detection on outbound

**Phase 3 -- AI intelligence (differentiators):**
1. AI transcription via Whisper API
2. AI call summary + action item extraction via Claude
3. Auto-create follow-up tasks (with confirmation)
4. Auto-suggest deal/profile updates (with confirmation cards)
5. Transcript loaded into AI chat contact context
6. Transcript embeddings for semantic search

**Phase 4 -- Mobile app (parallel track):**
1. React Native + Expo project setup with Twilio Voice RN SDK
2. Auth flow (Clerk)
3. Contact list + dialer UI
4. Outbound calls via Twilio Voice SDK
5. Inbound call handling with push notifications
6. Call history view

**Defer indefinitely:**
- Power dialer (regulatory risk, not needed for typical agent)
- In-browser calling (agents prefer their phone)
- Real-time transcription (post-call is sufficient and more reliable)
- IVR / phone trees (over-engineered for solo agents)

---

## Complexity Budget

| Phase | Estimated Effort | Risk Level | Notes |
|-------|-----------------|------------|-------|
| Phase 1 (Foundation) | 2-3 days | LOW | Mostly fixing existing code + adding Twilio params. Well-documented Twilio patterns. |
| Phase 2 (Inbound) | 1-2 days | LOW | Standard Twilio webhook patterns. Similar to existing SMS webhook. |
| Phase 3 (AI Intelligence) | 3-4 days | MEDIUM | Whisper API integration is straightforward. Claude summarization uses existing patterns. Risk is in prompt engineering for reliable extraction. |
| Phase 4 (Mobile App) | 5-7 days | HIGH | New codebase, new SDK, push notifications, app signing. Twilio reference app helps but RN + native modules always have environment friction. |

---

## Sources

- [Twilio TwiML Dial Verb](https://www.twilio.com/docs/voice/twiml/dial) -- Official docs for call bridging
- [Twilio Recording Status Callbacks](https://support.twilio.com/hc/en-us/articles/360014251313-Getting-Started-with-Recording-Status-Callbacks) -- Recording webhook setup
- [Twilio Voice React Native SDK (GA)](https://www.twilio.com/en-us/changelog/twilio-voice-react-native-sdk-and-reference-app-are-now-ga) -- Official SDK announcement
- [Twilio Voice React Native Reference App](https://github.com/twilio/twilio-voice-react-native-app) -- Dialer reference implementation
- [Salesloft Call Recording + Conversation Intelligence](https://www.salesloft.com/platform/call-recording-software) -- Enterprise CRM calling patterns
- [OpenPhone (Quo) CRM Integration Guide](https://www.openphone.com/blog/crm-phone-integration/) -- Small-business CRM calling expectations
- [FollowUpBoss Outbound Calling](https://www.followupboss.com/features/outbound-calling) -- Real estate-specific calling features
- [Vendasta AI-Native CRM Research](https://www.vendasta.com/blog/ai-native-crm/) -- 74% fail to turn call data into follow-up stat
- [HubSpot Calling Setup](https://knowledge.hubspot.com/calling/manage-phone-numbers-registered-for-calling) -- Enterprise CRM calling baseline
