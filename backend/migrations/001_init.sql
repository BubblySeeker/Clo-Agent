-- ============================================================
-- CRM API - Initial Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- TABLES
-- ============================================================

-- Users (mapped to Clerk identities)
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_id    TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contacts (leads/clients belonging to an agent)
CREATE TABLE contacts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    source      TEXT,                          -- e.g. 'referral', 'zillow', 'cold_call'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Buyer Profiles (detailed buyer preferences per contact)
CREATE TABLE buyer_profiles (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id           UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
    budget_min           NUMERIC(12, 2),
    budget_max           NUMERIC(12, 2),
    bedrooms             SMALLINT,
    bathrooms            NUMERIC(3, 1),
    locations            TEXT[],                -- preferred neighborhoods/cities
    must_haves           TEXT[],
    deal_breakers        TEXT[],
    property_type        TEXT,                  -- e.g. 'single_family', 'condo', 'townhouse'
    pre_approved         BOOLEAN NOT NULL DEFAULT FALSE,
    pre_approval_amount  NUMERIC(12, 2),
    timeline             TEXT,                  -- e.g. '1-3 months', 'ASAP', 'flexible'
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deal Stages (pipeline configuration)
CREATE TABLE deal_stages (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name      TEXT NOT NULL UNIQUE,
    position  SMALLINT NOT NULL,
    color     TEXT NOT NULL DEFAULT '#6366f1'   -- hex color for UI
);

-- Seed default stages
INSERT INTO deal_stages (name, position, color) VALUES
    ('Lead',            1, '#94a3b8'),
    ('Contacted',       2, '#60a5fa'),
    ('Touring',         3, '#a78bfa'),
    ('Offer',           4, '#f59e0b'),
    ('Under Contract',  5, '#10b981'),
    ('Closed',          6, '#22c55e'),
    ('Lost',            7, '#f87171');

-- Deals (pipeline cards)
CREATE TABLE deals (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    agent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage_id    UUID REFERENCES deal_stages(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    value       NUMERIC(12, 2),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activities (calls, emails, notes, showings, etc.)
CREATE TABLE activities (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id  UUID REFERENCES contacts(id) ON DELETE CASCADE,
    deal_id     UUID REFERENCES deals(id) ON DELETE SET NULL,
    agent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,                  -- 'call', 'email', 'note', 'showing', 'task'
    body        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations (AI chat threads per contact)
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    agent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages (individual messages inside a conversation)
CREATE TABLE messages (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content          TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Profiles (AI-generated summaries per contact)
CREATE TABLE ai_profiles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id  UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
    summary     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Embeddings (pgvector — stores vector embeddings for semantic search)
CREATE TABLE embeddings (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type  TEXT NOT NULL,                 -- 'contact', 'message', 'activity', 'ai_profile'
    source_id    UUID NOT NULL,
    agent_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,                 -- original text that was embedded
    embedding    vector(1536),                  -- OpenAI text-embedding-3-small / ada-002 dims
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_contacts_agent_id        ON contacts(agent_id);
CREATE INDEX idx_contacts_email           ON contacts(email);
CREATE INDEX idx_deals_agent_id           ON deals(agent_id);
CREATE INDEX idx_deals_contact_id         ON deals(contact_id);
CREATE INDEX idx_deals_stage_id           ON deals(stage_id);
CREATE INDEX idx_activities_contact_id    ON activities(contact_id);
CREATE INDEX idx_activities_deal_id       ON activities(deal_id);
CREATE INDEX idx_activities_agent_id      ON activities(agent_id);
CREATE INDEX idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX idx_conversations_agent_id   ON conversations(agent_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_embeddings_agent_id      ON embeddings(agent_id);
CREATE INDEX idx_embeddings_source        ON embeddings(source_type, source_id);

-- IVFFlat index for approximate nearest-neighbor vector search
CREATE INDEX idx_embeddings_vector
    ON embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_buyer_profiles_updated_at
    BEFORE UPDATE ON buyer_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_deals_updated_at
    BEFORE UPDATE ON deals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ai_profiles_updated_at
    BEFORE UPDATE ON ai_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

-- Enable RLS on all agent-scoped tables
ALTER TABLE contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings     ENABLE ROW LEVEL SECURITY;

-- Helper: resolve the current agent's UUID from their Clerk ID
-- The app sets this via: SET LOCAL app.current_agent_id = '<uuid>';
CREATE OR REPLACE FUNCTION current_agent_id() RETURNS UUID AS $$
    SELECT current_setting('app.current_agent_id', TRUE)::UUID;
$$ LANGUAGE sql STABLE;

-- contacts: agent sees only their own contacts
CREATE POLICY contacts_agent_isolation ON contacts
    USING (agent_id = current_agent_id());

-- buyer_profiles: accessible if the parent contact belongs to the agent
CREATE POLICY buyer_profiles_agent_isolation ON buyer_profiles
    USING (
        contact_id IN (
            SELECT id FROM contacts WHERE agent_id = current_agent_id()
        )
    );

-- deals: agent sees only their own deals
CREATE POLICY deals_agent_isolation ON deals
    USING (agent_id = current_agent_id());

-- activities: agent sees only their own activities
CREATE POLICY activities_agent_isolation ON activities
    USING (agent_id = current_agent_id());

-- conversations: agent sees only their own conversations
CREATE POLICY conversations_agent_isolation ON conversations
    USING (agent_id = current_agent_id());

-- messages: accessible if the parent conversation belongs to the agent
CREATE POLICY messages_agent_isolation ON messages
    USING (
        conversation_id IN (
            SELECT id FROM conversations WHERE agent_id = current_agent_id()
        )
    );

-- ai_profiles: accessible if the parent contact belongs to the agent
CREATE POLICY ai_profiles_agent_isolation ON ai_profiles
    USING (
        contact_id IN (
            SELECT id FROM contacts WHERE agent_id = current_agent_id()
        )
    );

-- embeddings: agent sees only their own embeddings
CREATE POLICY embeddings_agent_isolation ON embeddings
    USING (agent_id = current_agent_id());
