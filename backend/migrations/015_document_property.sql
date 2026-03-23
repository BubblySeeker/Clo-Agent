-- Migration 015: Add property_id to documents table
-- Links documents to properties for the two-level folder system

ALTER TABLE documents ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_agent_property ON documents(agent_id, property_id);
