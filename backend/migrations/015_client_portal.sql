-- Migration 015: Client Portal
-- Magic link tokens for client authentication + portal display settings

-- Magic link tokens for client authentication (no passwords)
CREATE TABLE portal_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portal_tokens_token ON portal_tokens(token);
CREATE INDEX idx_portal_tokens_contact ON portal_tokens(contact_id);

-- Portal settings per agent (what to show/hide)
CREATE TABLE portal_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID UNIQUE NOT NULL REFERENCES users(id),
    show_deal_value BOOLEAN DEFAULT false,
    show_activities BOOLEAN DEFAULT true,
    show_properties BOOLEAN DEFAULT true,
    welcome_message TEXT,
    agent_phone TEXT,
    agent_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_settings_agent ON portal_settings
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
