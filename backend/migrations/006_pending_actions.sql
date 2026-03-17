-- Persist pending AI write tool confirmations to survive service restarts
CREATE TABLE pending_actions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool        TEXT NOT NULL,
    input       JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
);

CREATE INDEX idx_pending_actions_agent ON pending_actions(agent_id);
CREATE INDEX idx_pending_actions_expires ON pending_actions(expires_at);

ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pending_actions_agent_isolation ON pending_actions
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
