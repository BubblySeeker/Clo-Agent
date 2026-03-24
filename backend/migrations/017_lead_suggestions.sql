-- Lead suggestions table for AI-detected potential leads from unmatched emails
CREATE TABLE IF NOT EXISTS lead_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    from_address TEXT NOT NULL,
    from_name TEXT,
    suggested_first_name TEXT,
    suggested_last_name TEXT,
    suggested_phone TEXT,
    suggested_intent TEXT,
    confidence REAL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_suggestions_agent_status ON lead_suggestions(agent_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_suggestions_email ON lead_suggestions(email_id);

ALTER TABLE lead_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_suggestions FORCE ROW LEVEL SECURITY;

CREATE POLICY lead_suggestions_agent_isolation ON lead_suggestions
    USING (agent_id = current_setting('app.current_agent_id')::uuid);

-- System-level read policy on gmail_tokens so background sync worker can list connected agents
-- gmail_tokens has FORCE RLS (from migration 016), so we need an explicit policy for system reads
-- This policy allows reading agent_id and last_synced_at without setting app.current_agent_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'gmail_tokens' AND policyname = 'gmail_tokens_system_list'
    ) THEN
        CREATE POLICY gmail_tokens_system_list ON gmail_tokens
            FOR SELECT USING (true);
    END IF;
END $$;
