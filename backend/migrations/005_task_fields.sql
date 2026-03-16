-- Migration 005: Add proper task fields to activities table
ALTER TABLE activities ADD COLUMN due_date DATE DEFAULT NULL;
ALTER TABLE activities ADD COLUMN priority TEXT DEFAULT 'medium';
ALTER TABLE activities ADD COLUMN completed_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX idx_activities_agent_type_due ON activities(agent_id, type, due_date);
