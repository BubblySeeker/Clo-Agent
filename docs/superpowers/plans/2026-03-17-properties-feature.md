# Properties Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a properties/listings feature to CloAgent CRM — database table, API endpoints, AI tools, and frontend pages.

**Architecture:** New `properties` table with RLS, linked to deals via `deals.property_id` FK. Go handlers follow existing factory pattern (CRUD + matches endpoint). 6 new AI tools (3 read, 3 write) follow existing `tools.py` patterns. Frontend gets list + detail pages with the same TanStack Query inline pattern used by contacts/deals.

**Tech Stack:** PostgreSQL 15, Go 1.24/Chi v5, Python 3.11/FastAPI, Next.js 14/TypeScript/Tailwind CSS, TanStack Query

---

## File Structure

### Create
| File | Responsibility |
|------|---------------|
| `backend/migrations/010_properties.sql` | Properties table, RLS, indexes, deals.property_id FK |
| `backend/internal/handlers/properties.go` | 6 HTTP handler factories: List, Create, Get, Update, Delete, GetMatches |
| `frontend/src/lib/api/properties.ts` | TypeScript API client functions for properties |
| `frontend/src/app/dashboard/properties/page.tsx` | Properties list page with search, filters, create modal |
| `frontend/src/app/dashboard/properties/[id]/page.tsx` | Property detail page with 3 tabs |

### Modify
| File | Change |
|------|--------|
| `backend/cmd/api/main.go` | Register 6 property routes |
| `backend/internal/handlers/deals.go` | Add property_id + property_address to Deal struct, SQL, scan |
| `backend/internal/handlers/handlers_test.go` | Add property handler factory + validation tests |
| `ai-service/app/tools.py` | Add 6 tool definitions + READ/WRITE sets + executors |
| `ai-service/tests/test_tools.py` | Update expected counts and tool sets |
| `frontend/src/app/dashboard/layout.tsx` | Add "Properties" nav item + "+New Property" quick action |
| `frontend/src/lib/ai-chat-helpers.ts` | Add property tool labels + confirm labels + formatPreview cases |
| `frontend/src/lib/api/deals.ts` | Add `property_id` and `property_address` to Deal type |
| `frontend/src/app/dashboard/pipeline/page.tsx` | Show property address on deal cards |

---

## Task 1: Database Migration

**Files:**
- Create: `backend/migrations/010_properties.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 010_properties.sql — Properties table + deals.property_id FK

CREATE TABLE properties (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address       TEXT NOT NULL,
    city          TEXT,
    state         TEXT,
    zip           TEXT,
    price         NUMERIC(12,2),
    bedrooms      INT,
    bathrooms     NUMERIC(3,1),
    sqft          INT,
    property_type TEXT,
    status        TEXT NOT NULL DEFAULT 'active',
    listing_type  TEXT,
    mls_id        TEXT,
    description   TEXT,
    photos        JSONB NOT NULL DEFAULT '[]',
    year_built    INT,
    lot_size      NUMERIC(10,2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_properties_agent ON properties(agent_id);
CREATE INDEX idx_properties_status ON properties(status);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY properties_agent_isolation ON properties
    USING (agent_id = current_agent_id());

CREATE TRIGGER trg_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE deals ADD COLUMN property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply migration**

Run: `psql $DATABASE_URL -f backend/migrations/010_properties.sql`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/010_properties.sql
git commit -m "feat: add properties table and deals.property_id FK (migration 010)"
```

---

## Task 2: Go Handlers + Route Registration + Deal Updates

**Files:**
- Create: `backend/internal/handlers/properties.go`
- Modify: `backend/cmd/api/main.go`, `backend/internal/handlers/deals.go`

- [ ] **Step 1: Create properties.go with all 6 handlers**

Follow exact patterns from contacts.go/deals.go. Property struct with 20 fields, scanProperty helper, propertySelectCols constant.

Handlers:
- `ListProperties(pool)` — filters: search, status, property_type, listing_type, min_price, max_price, bedrooms, page, limit. Paginated.
- `GetProperty(pool)` — single property + deals_count via COUNT query
- `CreateProperty(pool)` — required: address. Returns created property.
- `UpdateProperty(pool)` — partial update, 15 allowed fields. Returns updated property.
- `DeleteProperty(pool)` — hard delete, returns 204
- `GetPropertyMatches(pool)` — fetch property fields, fetch all buyer_profiles for agent, score each (budget +1, bedrooms +1, bathrooms +1, property_type +1, city in locations +1), return sorted by score desc, only score > 0

- [ ] **Step 2: Register routes in main.go**

Add after the Deal stages section:
```go
// Properties
r.Get("/api/properties", handlers.ListProperties(pool))
r.Post("/api/properties", handlers.CreateProperty(pool))
r.Get("/api/properties/{id}", handlers.GetProperty(pool))
r.Patch("/api/properties/{id}", handlers.UpdateProperty(pool))
r.Delete("/api/properties/{id}", handlers.DeleteProperty(pool))
r.Get("/api/properties/{id}/matches", handlers.GetPropertyMatches(pool))
```

- [ ] **Step 3: Update deals.go for property linking**

Add `PropertyID *string` and `PropertyAddress string` to Deal struct.
Update `dealSelectSQL` to LEFT JOIN properties for address.
Update `scanDeal` to scan 2 new fields.
Add `"property_id"` to UpdateDeal allowed fields.

- [ ] **Step 4: Verify compilation**

Run: `cd backend && go build ./...`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/properties.go backend/cmd/api/main.go backend/internal/handlers/deals.go
git commit -m "feat: property CRUD handlers, route registration, deal-property linking"
```

---

## Task 3: Go Handler Tests

**Files:**
- Modify: `backend/internal/handlers/handlers_test.go`

- [ ] **Step 1: Add property factories to TestHandlerFactoriesReturnHandlers**

Add 6 entries: ListProperties, CreateProperty, GetProperty, UpdateProperty, DeleteProperty, GetPropertyMatches.

- [ ] **Step 2: Add TestCreatePropertyValidation**

Test cases: invalid JSON → 400, missing address → 400. Same pattern as TestCreateContactValidation.

- [ ] **Step 3: Run tests**

Run: `cd backend && go test ./internal/handlers/ -v`

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handlers/handlers_test.go
git commit -m "test: add property handler factory and validation tests"
```

---

## Task 4: AI Tool Definitions and Executors

**Files:**
- Modify: `ai-service/app/tools.py`

- [ ] **Step 1: Add 6 tool definitions to TOOL_DEFINITIONS**

3 read tools: search_properties, get_property, match_buyer_to_properties
3 write tools: create_property, update_property, delete_property

Follow exact schema format of existing tools. create_property required: ["address"].

- [ ] **Step 2: Add to READ_TOOLS and WRITE_TOOLS sets**

- [ ] **Step 3: Add read executor routing + functions**

`_search_properties(agent_id, inp)` — query properties with filters, return summary fields
`_get_property(agent_id, property_id)` — full property + linked deals via JOIN
`_match_buyer_to_properties(agent_id, contact_id)` — get buyer profile, get active properties, score each, return sorted

- [ ] **Step 4: Add write executor routing + functions**

`_create_property(agent_id, inp)` — INSERT RETURNING summary
`_update_property(agent_id, inp)` — partial update with _PROPERTY_FIELDS allowlist
`_delete_property(agent_id, inp)` — verify exists, DELETE, return address

- [ ] **Step 5: Commit**

```bash
git add ai-service/app/tools.py
git commit -m "feat: add 6 property AI tools (search, get, match, create, update, delete)"
```

---

## Task 5: AI Tool Tests

**Files:**
- Modify: `ai-service/tests/test_tools.py`

- [ ] **Step 1: Update counts**

read_tools_count: >= 14, write_tools_count: >= 15

- [ ] **Step 2: Add to expected sets**

Add search_properties, get_property, match_buyer_to_properties to expected read.
Add create_property, update_property, delete_property to expected write.

- [ ] **Step 3: Add test_create_property_schema**

Verify address in properties and required.

- [ ] **Step 4: Run tests**

Run: `cd ai-service && python -m pytest tests/test_tools.py -v`

- [ ] **Step 5: Commit**

```bash
git add ai-service/tests/test_tools.py
git commit -m "test: update AI tool tests for 6 new property tools"
```

---

## Task 6: Frontend API Client + Deal Type Update

**Files:**
- Create: `frontend/src/lib/api/properties.ts`
- Modify: `frontend/src/lib/api/deals.ts`

- [ ] **Step 1: Create properties.ts**

Interfaces: Property, PropertiesResponse, PropertyFilters, CreatePropertyBody, UpdatePropertyBody, BuyerMatch, MatchesResponse.
Functions: listProperties, getProperty, createProperty, updateProperty, deleteProperty, getPropertyMatches.
Follow exact pattern of deals.ts.

- [ ] **Step 2: Add property_id and property_address to Deal type in deals.ts**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/properties.ts frontend/src/lib/api/deals.ts
git commit -m "feat: properties API client and property_id in Deal type"
```

---

## Task 7: Layout + Chat Helpers Integration

**Files:**
- Modify: `frontend/src/app/dashboard/layout.tsx`, `frontend/src/lib/ai-chat-helpers.ts`

- [ ] **Step 1: Add Building icon, Properties nav item, +New Property action**

Nav item between Pipeline and AI Chat. Building icon from lucide-react.

- [ ] **Step 2: Add property tool/confirm labels and formatPreview cases**

6 toolLabel entries, 3 confirmLabel entries, 3 formatPreview switch cases.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/layout.tsx frontend/src/lib/ai-chat-helpers.ts
git commit -m "feat: properties nav item, quick action, AI chat labels"
```

---

## Task 8: Properties List Page

**Files:**
- Create: `frontend/src/app/dashboard/properties/page.tsx`

- [ ] **Step 1: Build list page**

Use `@superpowers:frontend-design` skill. Same patterns as contacts page:
- Search bar + filter dropdowns (status, property_type, listing_type)
- Table: Address, Price, Beds/Baths, SqFt, Status, Type, Listed
- Create modal (address required)
- Pagination, click row → detail page
- Status badge colors: active=#22C55E, pending=#F59E0B, sold=#6366F1, off_market=#94A3B8

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx next build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/properties/page.tsx
git commit -m "feat: properties list page with search, filters, create modal"
```

---

## Task 9: Property Detail Page

**Files:**
- Create: `frontend/src/app/dashboard/properties/[id]/page.tsx`

- [ ] **Step 1: Build detail page**

Use `@superpowers:frontend-design` skill. 3 tabs:
1. **Overview** — all fields in card layout
2. **Deals** — linked deals list (fetch via listDeals with client-side property_id filter)
3. **Matching Buyers** — getPropertyMatches, ranked contacts with score display

Header: address, price, status badge, edit/delete buttons.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx next build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/properties/\[id\]/page.tsx
git commit -m "feat: property detail page with overview, deals, matching buyers tabs"
```

---

## Task 10: Pipeline Property Address + Final Verification

**Files:**
- Modify: `frontend/src/app/dashboard/pipeline/page.tsx`

- [ ] **Step 1: Show property address on deal cards**

Add Building icon import. If `deal.property_address`, show small line with icon + truncated address.

- [ ] **Step 2: Run all tests**

```bash
cd backend && go test ./... -v
cd ai-service && python -m pytest tests/ -v
cd frontend && npx next build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/pipeline/page.tsx
git commit -m "feat: show property address on pipeline deal cards"
```

---

## Task 11: QA Testing

- [ ] **Step 1: Start services and run /qa against properties pages**
- [ ] **Step 2: Fix any issues found**
- [ ] **Step 3: Final commit**
