# Prompt 4: Client Portal (Contact-Facing Dashboard)

## Project Context

CloAgent is an AI-powered CRM for real estate agents. Monorepo with three services:

```
Frontend (Next.js 14, :3000) → Backend (Go/Chi, :8080) → PostgreSQL 15 + pgvector
                                       ↕
                               AI Service (FastAPI, :8000)
```

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Clerk auth (`@clerk/nextjs` v5), TanStack Query
- **Backend**: Go 1.24, Chi v5, pgx v5, Clerk JWT + RLS
- **Database**: PostgreSQL 15, row-level security per agent

### Key Patterns

**Backend:**
```go
func HandlerName(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID)
        defer tx.Rollback(r.Context())
        // query, respond with respondJSON/respondError
        tx.Commit(r.Context())
    }
}
```

**Frontend:** Next.js 14 App Router. API client at `src/lib/api/client.ts`. TanStack Query. All Tailwind CSS.

**Existing Auth:** Clerk handles agent authentication. The client portal needs SEPARATE auth — contacts are NOT Clerk users.

### Existing Schema (relevant tables)

```sql
-- contacts: the people who will access the portal
CREATE TABLE contacts (
    id UUID, agent_id UUID, first_name TEXT, last_name TEXT,
    email TEXT, phone TEXT, source TEXT, created_at TIMESTAMPTZ
);

-- deals: what clients want to see progress on
CREATE TABLE deals (
    id UUID, contact_id UUID, agent_id UUID, stage_id UUID,
    title TEXT, value NUMERIC, notes TEXT, property_id UUID,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
);

-- deal_stages: 7 stages (Lead, Contacted, Touring, Offer, Under Contract, Closed, Lost)
CREATE TABLE deal_stages (id UUID, name TEXT, position INT, color TEXT);

-- activities: timeline of interactions
CREATE TABLE activities (
    id UUID, contact_id UUID, agent_id UUID, deal_id UUID,
    type TEXT, body TEXT, due_date DATE, priority TEXT,
    completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ
);

-- properties: listings the agent manages
CREATE TABLE properties (
    id UUID, agent_id UUID, address TEXT, city TEXT, state TEXT, zip TEXT,
    price NUMERIC, bedrooms INT, bathrooms NUMERIC, sqft INT,
    property_type TEXT, status TEXT, description TEXT, ...
);
```

## Feature: Client Portal

Build a contact-facing dashboard where the agent's clients can log in and see updates about their deals, properties, and activity timeline. The agent can share a link with a client, and the client gets a read-only view of their relevant CRM data.

### What to Build

#### 1. Database (Migration `015_client_portal.sql`)

```sql
-- Magic link tokens for client authentication (no passwords)
CREATE TABLE portal_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,       -- random 64-char hex token
    expires_at TIMESTAMPTZ NOT NULL,  -- 30 days from creation
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_portal_tokens_token ON portal_tokens(token);
CREATE INDEX idx_portal_tokens_contact ON portal_tokens(contact_id);

-- Portal settings per agent (what to show/hide)
CREATE TABLE portal_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID UNIQUE NOT NULL REFERENCES users(id),
    show_deal_value BOOLEAN DEFAULT false,    -- hide financial details by default
    show_activities BOOLEAN DEFAULT true,
    show_properties BOOLEAN DEFAULT true,
    welcome_message TEXT,                     -- custom welcome text
    agent_phone TEXT,                         -- contact info shown to clients
    agent_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE portal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_settings_agent ON portal_settings
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
```

Note: `portal_tokens` does NOT use RLS — the token-based auth flow accesses it before agent context is set.

#### 2. Backend — Go Handlers

Create `backend/internal/handlers/portal.go`:

**Agent-side endpoints (behind ClerkAuth):**
```
POST   /api/portal/invite/{contact_id}     — generate magic link for a contact (creates portal_token)
GET    /api/portal/invites                  — list all active portal invites
DELETE /api/portal/invite/{token_id}        — revoke a portal link
GET    /api/portal/settings                 — get portal display settings
PATCH  /api/portal/settings                 — update portal settings
```

**Client-side endpoints (PUBLIC — no ClerkAuth, token-based auth):**
```
GET    /api/portal/auth/{token}             — validate token, return contact info + agent info
GET    /api/portal/view/{token}/dashboard   — client's dashboard data (deals, recent activities)
GET    /api/portal/view/{token}/deals       — client's deals with stage info
GET    /api/portal/view/{token}/properties  — properties linked to client's deals
GET    /api/portal/view/{token}/timeline    — activity timeline for the client
```

**Key implementation details:**
- Magic link flow: agent clicks "Share Portal" on a contact → generates `/portal/{token}` URL → shares via email/SMS
- Token validation: check `portal_tokens WHERE token = X AND expires_at > NOW()`, get contact_id + agent_id
- Client endpoints query with the agent_id from the token (to respect data boundaries) but only return data for that specific contact_id
- These endpoints do NOT use ClerkAuth or UserSync — they have their own token middleware
- Register client-side routes OUTSIDE the protected route group in `main.go`
- Respect `portal_settings`: if `show_deal_value = false`, omit deal values from responses

#### 3. Frontend — Client Portal Pages

Create a NEW route group for the portal (separate from `/dashboard/`):

```
frontend/src/app/portal/
├── [token]/
│   ├── page.tsx              — Portal dashboard (main view after token validation)
│   ├── layout.tsx            — Portal layout (different from dashboard — no sidebar, no Clerk)
│   ├── deals/page.tsx        — Deal progress view
│   ├── properties/page.tsx   — Properties being shown/sold
│   └── timeline/page.tsx     — Activity timeline
├── expired/page.tsx          — "Link expired" page with agent contact info
└── layout.tsx                — Root portal layout (minimal, branded)
```

**Portal Dashboard (main page):**
- Clean, minimal design — this is client-facing, not agent-facing
- Header: agent's name/logo, contact info
- Welcome message (from portal_settings)
- Deal progress cards: show each deal with a visual stage progress bar (7 stages, highlight current)
- Recent activity feed: last 10 activities (calls, showings, notes — filtered to what's appropriate for clients)
- Properties section: if deals are linked to properties, show property cards with address, photo placeholder, price (if allowed), beds/baths
- Footer: "Powered by CloAgent" + agent contact info

**Design principles:**
- This is NOT the agent dashboard. It should feel like a polished client experience.
- Mobile-first — clients will mostly view on phones
- Read-only — clients cannot edit anything
- No Clerk auth — token in URL is the auth mechanism
- Minimal navigation: simple top tabs (Overview | Deals | Properties | Timeline)

#### 4. Agent-Side UI

**Contact detail page** — Add a "Share Portal" button to the contact detail header:
- In `frontend/src/app/dashboard/contacts/[id]/page.tsx`, add a "Share Portal" button (link icon)
- Clicking generates a magic link → shows a modal with the URL + copy button + "Send via Email" option
- Show if portal link is already active (with expiry date)
- Option to revoke existing link

**Settings page** — Add Portal Settings section in `frontend/src/app/dashboard/settings/page.tsx`:
- Toggle: show/hide deal values to clients
- Toggle: show/hide activities
- Toggle: show/hide properties
- Custom welcome message textarea
- Agent contact info (phone, email) shown on portal

### DO NOT modify these files (other parallel features are editing them):
- `ai-service/app/tools.py`
- `ai-service/app/services/agent.py`
- `frontend/src/lib/ai-chat-helpers.ts`
- `frontend/src/app/dashboard/communication/page.tsx`
- `frontend/src/app/dashboard/referrals/` (new feature)
- Any migration files numbered 012, 013, or 014

### Middleware Note
You'll need to update `frontend/src/middleware.ts` to allow `/portal/*` routes WITHOUT Clerk authentication. Currently it redirects unauthenticated users to sign-in. The portal routes must be public.

### Also update
- Add portal endpoints to the API section of `CLAUDE.md`
- Add "Client Portal" to the Current Implementation Status table in `CLAUDE.md`
