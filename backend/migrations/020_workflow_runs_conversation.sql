-- 020: Add conversation_id to workflow_runs for AI-native execution tracking
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id);
