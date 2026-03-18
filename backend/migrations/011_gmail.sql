-- Gmail integration: OAuth tokens and synced emails

-- Store OAuth tokens for each agent's Gmail connection
CREATE TABLE gmail_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    gmail_address TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMPTZ NOT NULL,
    history_id BIGINT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY gmail_tokens_agent_isolation ON gmail_tokens
    USING (agent_id = current_setting('app.current_agent_id')::uuid);

-- Store synced Gmail messages
CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gmail_message_id TEXT NOT NULL,
    thread_id TEXT,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    from_address TEXT,
    from_name TEXT,
    to_addresses JSONB DEFAULT '[]',
    cc_addresses JSONB DEFAULT '[]',
    subject TEXT,
    snippet TEXT,
    body_text TEXT,
    body_html TEXT,
    labels JSONB DEFAULT '[]',
    is_read BOOLEAN DEFAULT true,
    is_outbound BOOLEAN DEFAULT false,
    gmail_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX emails_agent_gmail_msg ON emails(agent_id, gmail_message_id);
CREATE INDEX emails_contact_id ON emails(contact_id);
CREATE INDEX emails_gmail_date ON emails(gmail_date DESC);
CREATE INDEX emails_thread_id ON emails(thread_id);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY emails_agent_isolation ON emails
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
