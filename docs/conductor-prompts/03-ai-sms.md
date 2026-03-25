# Prompt 3: AI SMS Integration

## Project Context

CloAgent is an AI-powered CRM for real estate agents. Monorepo with three services:

```
Frontend (Next.js 14, :3000) → Backend (Go/Chi, :8080) → PostgreSQL 15 + pgvector
                                       ↕
                               AI Service (FastAPI, :8000)
```

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Clerk auth, TanStack Query
- **Backend**: Go 1.24, Chi v5, pgx v5, Clerk JWT + RLS
- **AI Service**: Python 3.11, FastAPI, psycopg2, Claude API (Haiku 4.5)
- **Database**: PostgreSQL 15, row-level security per agent

### Existing Gmail Integration (follow this pattern for SMS)

The Gmail integration is fully built and provides the exact pattern to follow:

**Backend** (`backend/internal/handlers/gmail.go`):
- OAuth flow: init → Google consent → callback → store tokens
- Sync: fetch messages from API, store in `emails` table
- List/Get/Send/MarkRead endpoints
- Auto-matches emails to contacts by email address

**Database** (`backend/migrations/011_gmail.sql`):
```sql
CREATE TABLE gmail_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID UNIQUE NOT NULL REFERENCES users(id),
    gmail_address TEXT NOT NULL,
    access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMPTZ NOT NULL,
    history_id TEXT, last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    gmail_message_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    contact_id UUID REFERENCES contacts(id),
    from_address TEXT, from_name TEXT,
    to_addresses TEXT[], cc_addresses TEXT[],
    subject TEXT, snippet TEXT,
    body_text TEXT, body_html TEXT,
    labels TEXT[], is_read BOOLEAN DEFAULT false,
    is_outbound BOOLEAN DEFAULT false,
    gmail_date TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Frontend** (`frontend/src/app/dashboard/communication/page.tsx`):
- Tab-based inbox: shows email threads grouped by contact
- Compose modal, inline reply, thread expansion
- Search, labels, stars, attachments, keyboard shortcuts

**Settings** (`frontend/src/app/dashboard/settings/page.tsx`):
- Gmail connect/disconnect/sync buttons in an Integrations section

**AI Tools** (in `ai-service/app/tools.py`):
- `search_emails`, `get_email_thread`, `draft_email` (read tools)
- `send_email` (write tool, proxies through Go backend)

### Key Backend Patterns

```go
func HandlerName(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID)
        defer tx.Rollback(r.Context())
        // ... query, respond with respondJSON/respondError
        tx.Commit(r.Context())
    }
}
```

Routes registered in `backend/cmd/api/main.go` under protected group.

### Key Frontend Patterns

API client: `src/lib/api/client.ts` with `apiRequest<T>(path, token, options)`. TanStack Query inline in pages. All Tailwind CSS.

## Feature: SMS Integration via Twilio

Build SMS messaging integration following the exact same architecture as the Gmail integration. Use Twilio as the SMS provider.

### What to Build

#### 1. Database (Migration `014_sms.sql`)
```sql
CREATE TABLE twilio_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID UNIQUE NOT NULL REFERENCES users(id),
    account_sid TEXT NOT NULL,
    auth_token TEXT NOT NULL,      -- encrypted at rest ideally, but plain text OK for MVP
    phone_number TEXT NOT NULL,    -- agent's Twilio phone number
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE twilio_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY twilio_config_agent ON twilio_config
    USING (agent_id = current_setting('app.current_agent_id')::uuid);

CREATE TABLE sms_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    twilio_sid TEXT,               -- Twilio message SID
    contact_id UUID REFERENCES contacts(id),
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'sent',    -- sent, delivered, failed, received
    direction TEXT NOT NULL,       -- inbound, outbound
    sent_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY sms_messages_agent ON sms_messages
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE INDEX idx_sms_agent_date ON sms_messages(agent_id, sent_at DESC);
CREATE INDEX idx_sms_contact ON sms_messages(contact_id);
```

#### 2. Backend — Go Handlers

Create `backend/internal/handlers/sms.go`:

```
POST   /api/sms/configure          — save Twilio credentials {account_sid, auth_token, phone_number}
GET    /api/sms/status              — check if SMS is configured
DELETE /api/sms/disconnect          — remove Twilio config
POST   /api/sms/send                — send SMS {to, body} via Twilio API
GET    /api/sms/messages             — list SMS messages (?contact_id, ?search, ?page, ?limit)
GET    /api/sms/messages/{id}        — get single message
GET    /api/sms/conversations        — list SMS grouped by contact/phone number (like email threads)
POST   /api/sms/sync                 — pull recent inbound messages from Twilio API
POST   /api/sms/webhook              — Twilio webhook for incoming SMS (PUBLIC route, no auth — verify Twilio signature)
```

**Key implementation details:**
- Use Twilio REST API directly (no SDK needed — just HTTP calls from Go)
- `POST /api/sms/send`: call Twilio `Messages.create`, store in `sms_messages`, auto-match to contact by phone number
- `POST /api/sms/webhook`: receive inbound SMS from Twilio, store in `sms_messages`, match to contact by phone. This must be a PUBLIC route (not behind ClerkAuth). Validate Twilio's `X-Twilio-Signature` header.
- Contact matching: look up contacts WHERE phone matches the SMS from/to number (strip formatting, compare last 10 digits)
- Sync: fetch recent messages from Twilio API to backfill history

#### 3. Frontend

**API module** — `frontend/src/lib/api/sms.ts`

**Communication page** — Add an "SMS" tab alongside the existing email tab in `frontend/src/app/dashboard/communication/page.tsx`:

- Tab switching: "Email" | "SMS" tabs at the top of the communication page
- SMS tab shows conversations grouped by contact/phone number (like iMessage)
- Click a conversation → shows message thread in chronological order (bubbles UI — outbound right/blue, inbound left/gray)
- Compose: text input at bottom of thread + send button
- New message: "New SMS" button → select contact or enter phone number → compose
- Search across SMS messages
- Unread indicators on conversations with new inbound messages

**Settings page** — Add Twilio configuration section in `frontend/src/app/dashboard/settings/page.tsx`:
- Form: Account SID, Auth Token, Phone Number
- Connect / Disconnect buttons
- Status indicator (configured / not configured)

#### 4. AI Tools (in `ai-service/app/tools.py`)

Add these tools following the existing patterns:

**Read tools:**
- `search_sms` — search SMS messages by body text or contact (queries `sms_messages` table directly)
- `get_sms_conversation` — get all messages with a specific contact/number

**Write tool:**
- `send_sms` — send SMS via Go backend proxy (same pattern as `send_email`: queue confirmation → proxy to Go → Twilio API)

Add to `READ_TOOLS` / `WRITE_TOOLS` sets, `execute_read_tool` / `execute_write_tool` dispatchers, and `_TOOL_TO_TRIGGER` map (`"send_sms": "sms_sent"`).

Update `ai-service/app/services/agent.py`:
- Check Twilio config status alongside Gmail status in system prompt
- Add recent SMS to contact-scoped context (same pattern as email context)

Update `frontend/src/lib/ai-chat-helpers.ts`:
- Add tool labels: `search_sms: "Searching messages"`, `get_sms_conversation: "Loading conversation"`, `send_sms: "Sending text"`
- Add confirm label: `send_sms: "Send Text Message"`
- Add formatPreview case for `send_sms`

### DO NOT modify these files (other parallel features are editing them):
- `frontend/src/app/dashboard/contacts/[id]/page.tsx` (enrichment feature editing this)
- `frontend/src/app/dashboard/referrals/` (new feature being built there)
- Any migration files numbered 012, 013, or 015

### Also update
- Add SMS endpoints to the API section of `CLAUDE.md`
- Add "SMS Integration" to the Current Implementation Status table in `CLAUDE.md`
- Update AI Agent Tools section with new SMS tools
