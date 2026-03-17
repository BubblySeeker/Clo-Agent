# Properties Page Design Spec

## Overview

Add a properties/listings feature to CloAgent. Properties are independent entities that can be linked to deals, matched against buyer profiles, and managed via AI tools. Supports both seller-side listings and buyer-side showings.

## Data Model

### New Table: `properties`

```sql
CREATE TABLE properties (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address       TEXT NOT NULL,
    city          TEXT,
    state         TEXT,
    zip           TEXT,
    price         BIGINT,
    bedrooms      INT,
    bathrooms     NUMERIC(3,1),
    sqft          INT,
    property_type TEXT,       -- single_family, condo, townhouse, multi_family, land
    status        TEXT NOT NULL DEFAULT 'active',  -- active, pending, sold, off_market
    listing_type  TEXT,       -- listing (seller-side), showing (buyer-side)
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
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
```

### Schema Change: `deals.property_id`

```sql
ALTER TABLE deals ADD COLUMN property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
```

## API Endpoints

All follow the existing Go handler factory pattern with RLS transactions.

| Method | Path | Description | Filters |
|--------|------|-------------|---------|
| GET | /api/properties | List properties | ?search, ?status, ?property_type, ?listing_type, ?min_price, ?max_price, ?bedrooms, ?page, ?limit |
| POST | /api/properties | Create property | Required: address |
| GET | /api/properties/{id} | Get single property | Includes linked deals count |
| PATCH | /api/properties/{id} | Partial update | Any property field |
| DELETE | /api/properties/{id} | Hard delete | |
| GET | /api/properties/{id}/matches | Buyer profile matches | Returns ranked contacts |

### Matches Endpoint Logic

Queries all buyer_profiles for the agent. Scores each against the property:
- Budget: price BETWEEN budget_min AND budget_max (+1)
- Bedrooms: bedrooms >= buyer.bedrooms (+1)
- Bathrooms: bathrooms >= buyer.bathrooms (+1)
- Property type: property_type = buyer.property_type (+1, if buyer has preference)
- Location: city = ANY(buyer.locations) (+1, if buyer has locations)

Returns contacts sorted by match score descending.

### Deal Response Update

GET /api/deals/{id} includes `property_address` via LEFT JOIN on property_id when set.

## AI Tools

5 new tools. Total goes from 23 to 28 (14 read, 14 write).

### Read Tools (3)

| Tool | Inputs | Returns |
|------|--------|---------|
| search_properties | query?, status?, property_type?, min_price?, max_price?, bedrooms?, limit? | Property list with summary fields |
| get_property | property_id | Full property details + linked deals |
| match_buyer_to_properties | contact_id | Buyer profile fields + ranked property matches with scores |

### Write Tools (2)

| Tool | Required | Optional |
|------|----------|----------|
| create_property | address | city, state, zip, price, bedrooms, bathrooms, sqft, property_type, status, listing_type, mls_id, description, year_built, lot_size |
| update_property | property_id | Any property field |

Write tools follow the existing pending_actions confirmation flow.

## Frontend

### Properties List Page (`/dashboard/properties`)

- Search bar + filter dropdowns: status, property_type, listing_type, price range
- Table/grid view toggle (same pattern as contacts page)
- Table columns: Address, Price, Beds/Baths, SqFt, Status, Type, Listed
- Grid view: cards with status badge, price, key stats
- Inline create modal (address required, all else optional)
- Pagination

### Property Detail Page (`/dashboard/properties/[id]`)

Header: address, price, status badge, edit/delete buttons.

3 tabs:
1. **Overview** — all property fields rendered in a card layout. Photos as URL list. Description, MLS ID, year built, lot size.
2. **Deals** — deals linked via property_id. Button to link an existing deal.
3. **Matching Buyers** — calls matches endpoint. Shows ranked contacts with match score and buyer profile summary snippet.

### Layout Integration

- Nav item: "Properties" with Building icon, positioned between Pipeline and AI Chat
- +New dropdown: add "New Property" option
- Pipeline: deal create modal gets optional property selector. Pipeline cards show property address when linked.

### New API Module

`frontend/src/lib/api/properties.ts` — listProperties, getProperty, createProperty, updateProperty, deleteProperty, getPropertyMatches

## Testing

### Go Tests (`handlers/properties_test.go`)
- TestPropertyHandlerFactoriesReturnHandlers — all 6 factories return non-nil
- TestCreatePropertyValidation — rejects missing address, invalid JSON

### Python Tests (update `tests/test_tools.py`)
- Update expected read/write tool counts (14 each)
- Add new tools to expected_read_tools and expected_write_tools sets
- Schema test for create_property (address in required)

### QA
- /qa against localhost after build for end-to-end validation

## Files to Create/Modify

### Create
- `backend/migrations/010_properties.sql`
- `backend/internal/handlers/properties.go`
- `frontend/src/lib/api/properties.ts`
- `frontend/src/app/dashboard/properties/page.tsx`
- `frontend/src/app/dashboard/properties/[id]/page.tsx`

### Modify
- `backend/cmd/api/main.go` — register property routes
- `ai-service/app/tools.py` — add 5 tools + update READ_TOOLS/WRITE_TOOLS sets
- `ai-service/tests/test_tools.py` — update counts and expected tool sets
- `frontend/src/app/dashboard/layout.tsx` — add nav item + +New option
- `frontend/src/app/dashboard/pipeline/page.tsx` — property selector in deal create, address on cards
- `frontend/src/lib/api/deals.ts` — add property_id to Deal type
