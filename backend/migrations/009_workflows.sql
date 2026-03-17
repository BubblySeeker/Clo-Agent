-- Workflow automation system
CREATE TABLE workflows (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    trigger_type    TEXT NOT NULL,  -- 'contact_created', 'deal_stage_changed', 'activity_logged', 'manual'
    trigger_config  JSONB NOT NULL DEFAULT '{}',
    steps           JSONB NOT NULL DEFAULT '[]',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    agent_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_data    JSONB,
    status          TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
    current_step    INT NOT NULL DEFAULT 0,
    step_results    JSONB NOT NULL DEFAULT '[]',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_workflows_agent ON workflows(agent_id);
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflows_agent_isolation ON workflows
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE POLICY workflow_runs_agent_isolation ON workflow_runs
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
