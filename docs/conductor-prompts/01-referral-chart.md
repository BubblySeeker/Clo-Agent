# Prompt 1: Referral Network Chart

## Project Context

CloAgent is an AI-powered CRM for real estate agents. Monorepo with three services:

```
Frontend (Next.js 14, :3000) → Backend (Go/Chi, :8080) → PostgreSQL 15 + pgvector
                                       ↕
                               AI Service (FastAPI, :8000)
```

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Clerk auth (`@clerk/nextjs` v5), TanStack Query, Zustand, recharts, lucide-react
- **Backend**: Go 1.24, Chi v5 router, pgx v5 connection pool, Clerk JWT middleware, RLS for data isolation
- **Database**: PostgreSQL 15, row-level security per agent
- **Auth**: Clerk — frontend uses `@clerk/nextjs` v5, backend validates JWT

### Key Patterns

**Backend handler pattern:**
```go
func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID)
        defer tx.Rollback(r.Context())
        // query, marshal, respond
        tx.Commit(r.Context())
    }
}
// Response helpers: respondJSON(w, status, data) / respondError(w, status, "msg")
```

**Frontend data fetching pattern:**
```tsx
const { data } = useQuery({ queryKey: ['contacts'], queryFn: async () => {
  const token = await getToken();
  return listContacts(token!, { search, source, page, limit });
}});
```

**API client pattern** (`src/lib/api/client.ts`):
```ts
export async function apiRequest<T>(path: string, token: string, options?: RequestInit): Promise<T>
```

All styling is Tailwind CSS. No component library beyond one shadcn button. All UI built from scratch.

Routes are registered in `backend/cmd/api/main.go`. Protected routes use ClerkAuth + UserSync middleware.

### Existing contacts table schema
```sql
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    source TEXT, -- Zillow, Referral, Cold Call, Open House, WhatsApp
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Feature: Referral Network Chart

Build a visual referral network diagram showing how contacts refer each other. This helps real estate agents understand their referral chains and identify their best referral sources.

### What to Build

#### 1. Database (Migration `012_referrals.sql`)
```sql
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    referrer_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referrer_id, referred_id)
);
-- Add RLS policy matching existing pattern
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referrals_agent_isolation ON referrals
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE INDEX idx_referrals_agent ON referrals(agent_id);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_id);
```

Also add a `referred_by` column to contacts:
```sql
ALTER TABLE contacts ADD COLUMN referred_by UUID REFERENCES contacts(id) ON DELETE SET NULL;
```

#### 2. Backend (Go)
Create `backend/internal/handlers/referrals.go` with these endpoints:

```
GET    /api/referrals              — list all referral relationships for agent (include contact names via JOIN)
POST   /api/referrals              — create referral link {referrer_id, referred_id, notes?}
DELETE /api/referrals/{id}         — remove referral link
GET    /api/referrals/network      — get full network graph data (nodes = contacts, edges = referrals) optimized for visualization
GET    /api/referrals/stats        — top referrers, referral counts, conversion rates
```

The `/network` endpoint should return:
```json
{
  "nodes": [
    {"id": "uuid", "name": "John Doe", "source": "Referral", "deals_count": 3, "referral_count": 5}
  ],
  "edges": [
    {"from": "uuid", "to": "uuid", "created_at": "..."}
  ]
}
```

Register routes in `main.go` under the protected route group.

#### 3. Frontend

**API module** — `frontend/src/lib/api/referrals.ts`

**Page** — `frontend/src/app/dashboard/referrals/page.tsx`

Build an interactive referral network visualization:
- Use a force-directed graph layout (you can use `d3-force` or build a simple one with CSS/SVG)
- Each node is a contact (circle with initials or name)
- Edges show referral relationships with arrows showing direction
- Node size scales with number of referrals made
- Click a node to see contact details + their referral chain
- Color coding: green for contacts who've closed deals, blue for active, gray for leads
- Stats panel on the side: top 5 referrers, total referrals, referral conversion rate
- "Add Referral" button to link two existing contacts
- Search/filter to find contacts in the graph

**Navigation** — Add "Referrals" link to the dashboard sidebar/nav in `frontend/src/app/dashboard/layout.tsx`

### DO NOT modify these files (other parallel features are editing them):
- `ai-service/app/tools.py`
- `ai-service/app/services/agent.py`
- `frontend/src/app/dashboard/communication/page.tsx`
- `frontend/src/app/dashboard/settings/page.tsx`
- Any migration files numbered 013, 014, or 015

### Also update
- Add referral endpoints to the API section of `CLAUDE.md`
- Add "Referrals" to the Current Implementation Status table in `CLAUDE.md`
