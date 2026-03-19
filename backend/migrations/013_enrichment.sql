-- 013_enrichment.sql: AI contact enrichment from email history

CREATE TABLE contact_enrichments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT NOT NULL,
    source TEXT NOT NULL,
    source_email_id UUID REFERENCES emails(id),
    confidence TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contact_enrichments ENABLE ROW LEVEL SECURITY;

CREATE POLICY enrichments_agent_isolation ON contact_enrichments
    USING (agent_id = current_setting('app.current_agent_id')::uuid);

CREATE INDEX idx_enrichments_contact ON contact_enrichments(contact_id);
CREATE INDEX idx_enrichments_status ON contact_enrichments(status);
