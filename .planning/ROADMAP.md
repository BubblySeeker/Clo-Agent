# Roadmap: CloAgent v2.0 — Twilio Voice Calling

## Overview

Build end-to-end voice calling where the agent makes/receives calls through Twilio, the AI transcribes recordings and automatically updates the CRM with notes, tasks, and deal updates. Starts by fixing the broken call flow, adds recording infrastructure, layers on AI intelligence, polishes the frontend experience, and finishes with a React Native mobile dialer. Each phase delivers a verifiable capability that builds on the previous one.

## Milestones

- ~~v1.0 Tool Routing~~ - Phases 1-3 (shipped 2026-03-17)
- v2.0 Twilio Voice Calling - Phases 4-8 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (4, 5, 6, 7, 8): Planned milestone work
- Decimal phases (e.g., 5.1): Urgent insertions (marked with INSERTED)

<details>
<summary>v1.0 Tool Routing (Phases 1-3) - SHIPPED 2026-03-17</summary>

- [x] **Phase 1: Integration & Structure** - CLAUDE.md section scaffolding
- [x] **Phase 2: Tool Defaults & Routing Rules** - Five tool routing definitions
- [x] **Phase 3: Hard Constraints & Exclusions** - Guard rails and exclusions

</details>

### v2.0 Twilio Voice Calling

- [x] **Phase 4: Core Call Flow** - Fix broken call infrastructure; agent can make and receive real calls
- [ ] **Phase 5: Recording Infrastructure** - Calls are recorded, stored, and playable; credentials encrypted
- [ ] **Phase 6: AI Transcription & Intelligence** - Recordings auto-transcribed, AI extracts summaries and CRM actions
- [ ] **Phase 7: Frontend Call Experience** - Full call lifecycle visible in web UI with AI action cards and inbound intelligence
- [ ] **Phase 8: React Native Mobile Dialer** - Thin mobile app for calling and viewing call history

## Phase Details

### Phase 4: Core Call Flow
**Goal**: Agent can make outbound calls that properly bridge both parties, receive inbound calls forwarded to their phone, and see accurate call status in the CRM
**Depends on**: Nothing (first phase of v2.0)
**Requirements**: CALL-01, CALL-02, CALL-03, CALL-04, CALL-05, CALL-06, CALL-07
**Success Criteria** (what must be TRUE):
  1. Agent can enter their personal phone number in Settings and it persists across sessions
  2. Agent clicks "Call" on a contact, their real phone rings, and when they answer they are bridged to the client with a recording consent announcement playing first
  3. When someone calls the Twilio number, the agent's personal phone rings with the caller's number displayed
  4. Call status (ringing, in-progress, completed, failed) updates in the communication page without manual refresh
  5. The SMS activity type bug is fixed (SMS logs as 'sms', not 'call') and all call webhook endpoints validate Twilio signatures
**Plans:** 2 plans

Plans:
- [x] 04-01-PLAN.md — Backend foundation: bug fixes, shared Twilio utils, migration, config, personal_phone support
- [x] 04-02-PLAN.md — Two-leg bridge call flow, inbound forwarding, TwiML endpoints, frontend settings + dynamic polling

### Phase 5: Recording Infrastructure
**Goal**: All calls are automatically recorded in dual-channel format, recordings are stored securely, and agents can play back any call recording in the web UI
**Depends on**: Phase 4
**Requirements**: REC-01, REC-02, REC-03, REC-04, REC-05
**Success Criteria** (what must be TRUE):
  1. After a call completes, a recording appears in the call detail within 60 seconds with correct duration metadata
  2. Agent can click play on any call in the communication page and hear the recording through an audio player
  3. Recordings are downloaded from Twilio and stored locally (or S3), and the Twilio copy is deleted after confirmed download
  4. Twilio auth tokens are encrypted at rest in the database (not stored as plaintext)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: AI Transcription & Intelligence
**Goal**: Every completed call is automatically transcribed with speaker labels, analyzed by AI for summaries and action items, and the results are searchable and available in AI chat context
**Depends on**: Phase 5
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06
**Success Criteria** (what must be TRUE):
  1. Within 3 minutes of a call ending, a transcript with speaker labels (Agent/Client) appears in the call detail view
  2. Each transcript includes an AI-generated summary and list of extracted action items
  3. AI-suggested tasks and deal/buyer-profile updates appear as confirmation cards the agent can approve or dismiss with one click
  4. Asking the AI chat "What did [contact] say about their budget?" returns relevant information from call transcripts
  5. Call transcripts appear in semantic search results when searching for topics discussed on calls
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

### Phase 7: Frontend Call Experience
**Goal**: The web UI surfaces the full call lifecycle with transcript viewer, audio playback, AI action cards, call outcome tagging, and inbound call intelligence features
**Depends on**: Phase 6
**Requirements**: FE-01, FE-02, FE-03, FE-04, FE-05, FE-06
**Success Criteria** (what must be TRUE):
  1. Agent can view call transcripts with clearly labeled speaker turns (Agent vs Client) in the communication page
  2. Agent can play call recordings with standard audio controls (play/pause/seek) in the call detail view
  3. AI action suggestion cards (tasks, deal updates, buyer profile updates) appear in call detail with confirm/dismiss buttons that execute real API calls
  4. Agent can tag call outcomes (Connected, Voicemail, No Answer) and the tag persists on the call record
  5. On inbound calls, the agent hears a whisper with the contact's name and key context before being connected; outbound calls detect voicemail automatically
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

### Phase 8: React Native Mobile Dialer
**Goal**: Agent can authenticate, browse contacts, initiate calls, and view call history with transcripts from a mobile app on their phone
**Depends on**: Phase 4 (uses all backend endpoints built in Phases 4-7)
**Requirements**: MOB-01, MOB-02, MOB-03, MOB-04, MOB-05
**Success Criteria** (what must be TRUE):
  1. Agent can sign in to the mobile app with their existing Clerk credentials
  2. Agent can search and browse their contact list from the mobile app
  3. Agent taps a contact to call, their phone rings within 3 seconds, and the call bridges to the client
  4. Agent can view call history showing status, duration, and AI transcript summaries for each call
  5. Agent can configure their personal phone number in mobile app settings
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. Core Call Flow | 1/2 | In progress | - |
| 5. Recording Infrastructure | 0/? | Not started | - |
| 6. AI Transcription & Intelligence | 0/? | Not started | - |
| 7. Frontend Call Experience | 0/? | Not started | - |
| 8. React Native Mobile Dialer | 0/? | Not started | - |

---
*Roadmap created: 2026-03-23*
