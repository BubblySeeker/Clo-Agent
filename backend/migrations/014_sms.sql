-- SMS / Twilio integration tables
CREATE TABLE twilio_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID UNIQUE NOT NULL REFERENCES users(id),
    account_sid TEXT NOT NULL,
    auth_token TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE twilio_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY twilio_config_agent ON twilio_config
    USING (agent_id = current_setting('app.current_agent_id')::uuid);

CREATE TABLE sms_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    twilio_sid TEXT,
    contact_id UUID REFERENCES contacts(id),
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    direction TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY sms_messages_agent ON sms_messages
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE INDEX idx_sms_agent_date ON sms_messages(agent_id, sent_at DESC);
CREATE INDEX idx_sms_contact ON sms_messages(contact_id);
