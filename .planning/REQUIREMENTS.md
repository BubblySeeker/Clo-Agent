# Requirements: CloAgent v2.0 — Twilio Voice Calling

**Defined:** 2026-03-23
**Core Value:** AI-powered voice calling that automatically transcribes conversations and updates the CRM, so real estate agents never miss a follow-up.

## v2.0 Requirements

### Call Foundation

- [x] **CALL-01**: Agent can configure their personal phone number in Settings (stored in twilio_config)
- [x] **CALL-02**: Agent can initiate an outbound call that rings their real phone first, then bridges to the client (two-leg bridge)
- [x] **CALL-03**: Inbound calls to the Twilio number are forwarded to the agent's personal phone with caller ID matching
- [x] **CALL-04**: All calls include a recording consent announcement before the conversation begins
- [x] **CALL-05**: Call status (ringing, in-progress, completed, no-answer, busy, failed) updates in real-time via StatusCallback
- [x] **CALL-06**: All call webhook endpoints validate Twilio signature (X-Twilio-Signature)
- [x] **CALL-07**: Existing bugs are fixed: RLS in call handlers, SMS activity type logged as 'call' instead of 'sms'

### Recording

- [x] **REC-01**: Outbound and inbound calls are recorded in dual-channel format (agent/client on separate channels)
- [x] **REC-02**: Recording webhook receives notification when recording is ready and stores metadata in call_logs
- [ ] **REC-03**: Agent can play back call recordings in the communication page via a proxy endpoint
- [x] **REC-04**: Recordings are downloaded from Twilio and stored locally/S3, then deleted from Twilio
- [x] **REC-05**: Twilio auth tokens are encrypted at rest in the database

### AI Intelligence

- [ ] **AI-01**: Completed call recordings are automatically transcribed using OpenAI gpt-4o-transcribe with speaker diarization via dual-channel split
- [ ] **AI-02**: Call transcripts are analyzed by Claude to generate a call summary, action items, and CRM update suggestions
- [ ] **AI-03**: AI-extracted tasks are surfaced as confirmation cards the agent can approve with one click
- [ ] **AI-04**: AI-suggested deal stage and buyer profile updates are surfaced as confirmation cards
- [ ] **AI-05**: Recent call transcripts and summaries are loaded into AI chat contact context
- [ ] **AI-06**: Call transcripts are embedded in pgvector for semantic search

### Frontend

- [ ] **FE-01**: Agent can view call transcripts with speaker labels in the communication page
- [ ] **FE-02**: Agent can play call recordings with an audio player in call detail view
- [ ] **FE-03**: AI action suggestion cards appear in call detail with confirm/dismiss buttons
- [ ] **FE-04**: Agent can tag call outcomes (Connected, Voicemail, No Answer)
- [ ] **FE-05**: Inbound calls include a whisper (agent hears contact name and key context before being connected)
- [ ] **FE-06**: Outbound calls detect voicemail automatically (MachineDetection)

### Mobile App

- [ ] **MOB-01**: React Native (Expo) app scaffold with Clerk authentication
- [ ] **MOB-02**: Agent can view and search their contact list from the mobile app
- [ ] **MOB-03**: Agent can tap a contact to initiate a call (API-triggered, their phone rings)
- [ ] **MOB-04**: Agent can view call history with status, duration, and transcript summaries
- [ ] **MOB-05**: Agent can configure their personal phone number in mobile settings

## Future Requirements

### Advanced Voice
- **ADV-01**: In-app VoIP calling via Twilio Voice SDK (no phone needed)
- **ADV-02**: iOS push notifications for incoming calls (APNs/PushKit/CallKit)
- **ADV-03**: Call analytics dashboard (call volume, duration trends, outcome rates)
- **ADV-04**: Recording archival to S3 with configurable retention policy

### AI Enhancements
- **AIE-01**: Real-time transcription during calls
- **AIE-02**: Auto-apply AI suggestions without confirmation (configurable threshold)
- **AIE-03**: Call coaching suggestions based on transcript patterns

## Out of Scope

| Feature | Reason |
|---------|--------|
| Power dialer / auto-dialer | TCPA regulatory risk, wrong use case for solo agents |
| IVR / phone trees | Over-engineered for solo agents |
| In-browser WebRTC calling | Agents prefer their real phone; defer to future |
| Real-time streaming transcription | Post-call is simpler, more reliable, sufficient |
| Self-hosted Whisper | Needs GPU infrastructure; OpenAI API is cheaper |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CALL-01 | Phase 4 | Complete (04-01) |
| CALL-02 | Phase 4 | Complete (04-02) |
| CALL-03 | Phase 4 | Complete (04-02) |
| CALL-04 | Phase 4 | Complete (04-02) |
| CALL-05 | Phase 4 | Complete (04-02) |
| CALL-06 | Phase 4 | Complete (04-01) |
| CALL-07 | Phase 4 | Complete (04-01) |
| REC-01 | Phase 5 | Complete |
| REC-02 | Phase 5 | Complete |
| REC-03 | Phase 5 | Pending |
| REC-04 | Phase 5 | Complete |
| REC-05 | Phase 5 | Complete |
| AI-01 | Phase 6 | Pending |
| AI-02 | Phase 6 | Pending |
| AI-03 | Phase 6 | Pending |
| AI-04 | Phase 6 | Pending |
| AI-05 | Phase 6 | Pending |
| AI-06 | Phase 6 | Pending |
| FE-01 | Phase 7 | Pending |
| FE-02 | Phase 7 | Pending |
| FE-03 | Phase 7 | Pending |
| FE-04 | Phase 7 | Pending |
| FE-05 | Phase 7 | Pending |
| FE-06 | Phase 7 | Pending |
| MOB-01 | Phase 8 | Pending |
| MOB-02 | Phase 8 | Pending |
| MOB-03 | Phase 8 | Pending |
| MOB-04 | Phase 8 | Pending |
| MOB-05 | Phase 8 | Pending |

**Coverage:**
- v2.0 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
