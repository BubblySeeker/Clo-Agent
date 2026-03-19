# Prompt 2: AI Contact Enrichment from Email History

## Project Context

CloAgent is an AI-powered CRM for real estate agents. Monorepo with three services:

```
Frontend (Next.js 14, :3000) → Backend (Go/Chi, :8080) → PostgreSQL 15 + pgvector
                                       ↕
                               AI Service (FastAPI, :8000)
```

- **Backend**: Go 1.24, Chi v5, pgx v5, Clerk JWT + RLS
- **AI Service**: Python 3.11, FastAPI, psycopg2, Claude API via `anthropic` SDK (Haiku 4.5), SSE streaming
- **Database**: PostgreSQL 15, row-level security per agent

### Key AI Service Patterns

**Database access in AI service:**
```python
from app.database import get_conn, run_query

def _some_query(agent_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT ... WHERE agent_id = %s", (agent_id,))
        return dict(cur.fetchone())

# Async wrapper:
result = await run_query(lambda: _some_query(agent_id))
```

**Config** (`ai-service/app/config.py`):
```python
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
DATABASE_URL = os.environ["DATABASE_URL"]
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080")
```

**Routes are registered in** `ai-service/app/main.py`

### Existing Schema

**contacts table:**
```sql
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    email TEXT, phone TEXT,
    source TEXT, -- Zillow, Referral, Cold Call, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**emails table (synced from Gmail):**
```sql
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

**buyer_profiles table:**
```sql
CREATE TABLE buyer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID UNIQUE NOT NULL REFERENCES contacts(id),
    budget_min NUMERIC, budget_max NUMERIC,
    bedrooms INTEGER, bathrooms INTEGER,
    locations TEXT[], must_haves TEXT[], deal_breakers TEXT[],
    property_type TEXT, pre_approved BOOLEAN DEFAULT false,
    timeline TEXT, notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Go Backend Patterns

```go
func HandlerName(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID)
        defer tx.Rollback(r.Context())
        // ... query, respond
        tx.Commit(r.Context())
    }
}
```

**Go proxies AI requests** using `X-AI-Service-Secret` header to the Python AI service.

### Frontend Patterns

Next.js 14 App Router, TypeScript, Tailwind CSS. TanStack Query for data fetching. API client at `src/lib/api/client.ts` with `apiRequest<T>(path, token, options)`.

## Feature: AI Contact Enrichment from Email History

Build an AI-powered feature that analyzes a contact's email history and automatically extracts/updates their information — preferences, budget mentions, timeline, property interests, etc.

### What to Build

#### 1. Database (Migration `013_enrichment.sql`)
```sql
CREATE TABLE contact_enrichments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,       -- e.g. 'budget_max', 'timeline', 'locations', 'phone'
    old_value TEXT,
    new_value TEXT NOT NULL,
    source TEXT NOT NULL,           -- 'email_analysis'
    source_email_id UUID REFERENCES emails(id),
    confidence TEXT NOT NULL,       -- 'high', 'medium', 'low'
    status TEXT DEFAULT 'pending',  -- 'pending', 'accepted', 'rejected'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contact_enrichments ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrichments_agent_isolation ON contact_enrichments
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE INDEX idx_enrichments_contact ON contact_enrichments(contact_id);
CREATE INDEX idx_enrichments_status ON contact_enrichments(status);
```

#### 2. AI Service — Enrichment Endpoint

Create `ai-service/app/routes/enrichment.py`:

```
POST /ai/enrich-contact    — analyze emails for a contact and extract info
```

**Flow:**
1. Accept `{contact_id, agent_id}`
2. Fetch the contact's current info from `contacts` + `buyer_profiles`
3. Fetch last 20 emails for this contact from `emails` table (body_text, subject)
4. Send to Claude with a structured prompt asking it to extract:
   - Phone number (if mentioned in emails but not in contact record)
   - Budget range (mentions of price, "looking for something under 500k", etc.)
   - Preferred locations/neighborhoods
   - Number of bedrooms/bathrooms wanted
   - Timeline ("moving by June", "need to close before school starts")
   - Property type preferences
   - Must-haves and deal-breakers
   - Pre-approval status
   - Any other actionable info
5. Claude returns structured JSON with extracted fields + confidence levels
6. Save each extracted field as a row in `contact_enrichments` with status='pending'
7. Return the list of suggested enrichments

**Claude prompt should:**
- Only extract info NOT already in the contact/buyer profile
- Assign confidence: high (explicitly stated), medium (strongly implied), low (inferred)
- Include the source email snippet as evidence
- Return `{"enrichments": [{"field": "budget_max", "value": "600000", "confidence": "high", "evidence": "She mentioned looking for homes under 600k"}]}`

#### 3. Go Backend — Proxy + Review Endpoints

Create `backend/internal/handlers/enrichment.go`:

```
POST   /api/contacts/{id}/enrich          — trigger enrichment (proxies to AI service)
GET    /api/contacts/{id}/enrichments      — list pending/accepted/rejected enrichments
POST   /api/enrichments/{id}/accept        — accept suggestion (updates contact/buyer profile)
POST   /api/enrichments/{id}/reject        — reject suggestion
POST   /api/enrichments/{id}/accept-all    — accept all pending for a contact
```

**Accept flow:** When an enrichment is accepted:
- Update the corresponding field in `contacts` or `buyer_profiles` table
- If buyer_profile doesn't exist, create it
- Set enrichment status to 'accepted'

#### 4. Frontend

**API module** — `frontend/src/lib/api/enrichment.ts`

**UI on contact detail page** — Add enrichment to the existing contact detail page at `frontend/src/app/dashboard/contacts/[id]/page.tsx`:

- Add an "AI Enrich" button (sparkle icon) in the contact detail header area
- Clicking it triggers the enrichment analysis (show a loading state — "Analyzing emails...")
- Show results as a list of suggestion cards:
  - Each card shows: field name, suggested value, confidence badge (green/yellow/orange), evidence snippet
  - "Accept" and "Reject" buttons per card
  - "Accept All" button at the top for high-confidence suggestions
- Show a history of past enrichments (accepted/rejected) in a collapsible section
- After accepting, the contact detail / buyer profile tabs should reflect the updated data (invalidate TanStack Query cache)

### DO NOT modify these files (other parallel features are editing them):
- `ai-service/app/tools.py` (do NOT add AI tools — this is a standalone endpoint)
- `ai-service/app/services/agent.py`
- `frontend/src/app/dashboard/communication/page.tsx`
- `frontend/src/app/dashboard/layout.tsx` (no nav changes needed)
- Any migration files numbered 012, 014, or 015

### Also update
- Add enrichment endpoints to the API section of `CLAUDE.md`
- Add "AI Contact Enrichment" to the Current Implementation Status table in `CLAUDE.md`
