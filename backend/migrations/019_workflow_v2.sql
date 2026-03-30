-- 019_workflow_v2.sql: Evolve workflow tables for AI-native execution

-- New workflow fields for AI-native execution model
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS instruction TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS approval_mode TEXT NOT NULL DEFAULT 'review';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS schedule_config JSONB;

-- New workflow_runs fields for execution tracking
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS is_dry_run BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS instruction_snapshot TEXT;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS error_details JSONB;

-- Conversation type for filtering workflow runs from chat sidebar
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'chat';

-- Index for scheduler admin query (only enabled workflows with schedule)
CREATE INDEX IF NOT EXISTS idx_workflows_schedule ON workflows (enabled) WHERE schedule_config IS NOT NULL;
