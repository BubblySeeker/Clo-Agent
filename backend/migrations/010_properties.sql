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
