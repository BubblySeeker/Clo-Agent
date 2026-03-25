-- Twilio voice call logs
CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    twilio_sid TEXT,
    contact_id UUID REFERENCES contacts(id),
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    direction TEXT NOT NULL,           -- 'outbound' | 'inbound'
    status TEXT DEFAULT 'initiated',   -- initiated, ringing, in-progress, completed, busy, no-answer, canceled, failed
    duration INTEGER DEFAULT 0,        -- seconds
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_logs_agent ON call_logs
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE INDEX idx_calls_agent_date ON call_logs(agent_id, started_at DESC);
CREATE INDEX idx_calls_contact ON call_logs(contact_id);
CREATE UNIQUE INDEX idx_calls_twilio_sid ON call_logs(twilio_sid) WHERE twilio_sid IS NOT NULL;
