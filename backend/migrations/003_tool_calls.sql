-- Migration 003: tool call audit trail on messages

ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_calls JSONB DEFAULT NULL;
