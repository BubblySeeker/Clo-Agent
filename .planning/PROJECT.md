# CloAgent — Project Plan

## What This Is

CloAgent is an AI-powered CRM for real estate agents. Monorepo with three services (Next.js 14 frontend, Go/Chi backend, FastAPI AI service) sharing PostgreSQL 15 + pgvector. Full-stack CRM with contacts, deals, pipeline, activities, AI chat, workflows, Gmail integration, SMS/Twilio integration, and partial voice call scaffolding.

## Core Value

AI-powered CRM that automates real estate agent workflows — including communication intelligence that listens to calls, transcribes conversations, and automatically updates the CRM.

## Requirements

### Validated (v1.0 — Tool Routing)

- Tool routing rules in CLAUDE.md for frontend-design, ui-ux-pro-max, Stitch, Gemini, 21st.dev
- Hard constraints (21st.dev landing-only, backend exclusions, Tailwind conformance)
- Integration structure and section placement

### Validated (Existing CRM Features)

- Auth (Clerk sign-in/up, JWT, user sync)
- Contacts CRUD, Contact Detail (5 tabs), Buyer Profiles
- Deals CRUD, Pipeline Kanban, Deal Stages
- Activities (call/email/note/showing/task)
- Dashboard with metrics, charts, widget customization
- AI Chat (bubble + full page), 30 AI tools (16 read, 14 write)
- AI Profile Generation, Semantic Search / Embeddings
- Analytics, Tasks Page, Workflows, Settings
- Gmail Integration (auth, sync, send, receive, search, labels)
- SMS Integration (configure, send, receive, sync, webhook, AI tools)
- Voice Call scaffolding (broken — initiate endpoint, call_logs table, status webhook, AI tools, but call flow doesn't actually work)

## Current Milestone: v2.0 Twilio Voice Calling

**Goal:** Build a fully working end-to-end voice calling system where the agent makes/receives calls through Twilio, the AI listens via post-call recording, transcribes the conversation, and automatically updates the CRM with call notes, tasks, and deal updates.

**Target features:**
- Fix two-leg bridge call flow (agent phone → client phone)
- Agent personal phone number in Twilio config
- Inbound call forwarding to agent's real phone
- Call recording via Twilio (Record=true)
- Recording webhook + storage
- Audio transcription (Whisper or Twilio built-in)
- AI post-call analysis (Claude summarizes transcript → CRM actions)
- Auto-log activity with call notes
- Auto-create follow-up tasks from call content
- Auto-update deal stage / buyer profile if relevant
- Call history loaded into AI contact context
- StatusCallback URL for real-time call status updates
- React Native mobile dialer app (thin client shell)

## Context

The project has partial call infrastructure from a recent SMS integration sprint. The `call_logs` table, backend handler (`calls.go`), frontend API client (`calls.ts`), communication page integration, and 3 AI tools exist but the core call flow is broken — the TwiML doesn't properly bridge two parties, there's no recording, no transcription, and no AI processing.

## Constraints

- Must reuse existing `twilio_config` table (shared SMS + voice credentials)
- Must not modify migration files 012, 013 (referenced in CLAUDE.md constraints)
- Backend follows existing Go handler patterns (pgxpool, RLS, Chi router)
- AI service follows existing Python patterns (psycopg2, httpx proxy, tool definitions)
- Frontend follows existing patterns (TanStack Query, Tailwind, api client module)
- Mobile app should be a thin shell — all business logic stays in the backend/AI service

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Post-call recording (not real-time stream) | Simpler, more reliable, how HubSpot/Close/Salesloft do it | Option A |
| Two-leg bridge call flow | Agent's real phone rings first, then bridges to client — feels natural | Standard Twilio pattern |
| Whisper for transcription | Better accuracy than Twilio built-in, supports speaker diarization | Pending research |
| React Native + Expo for mobile | Cross-platform, reuses JS skills, Twilio has RN Voice SDK | Pending research |
| Thin mobile client | All intelligence in backend/AI service, app is just a dialer UI | Agreed |

---
*Last updated: 2026-03-23 — Milestone v2.0 started*
