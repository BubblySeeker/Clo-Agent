-- Migration 002: dashboard layout + general conversations

-- Allow agents to persist their dashboard widget layout
ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_layout JSONB DEFAULT NULL;

-- Allow conversations that are not tied to a specific contact (general AI chat)
ALTER TABLE conversations ALTER COLUMN contact_id DROP NOT NULL;
