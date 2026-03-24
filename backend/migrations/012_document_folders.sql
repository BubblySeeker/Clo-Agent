-- Document folders for organizing uploaded documents
CREATE TABLE document_folders (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doc_folders_agent ON document_folders(agent_id);
CREATE UNIQUE INDEX idx_doc_folders_agent_name ON document_folders(agent_id, LOWER(name));

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_folders_agent_isolation ON document_folders
    USING (agent_id = current_setting('app.current_agent_id')::uuid);

-- Add folder_id to documents (NULL = General/unfiled)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL;
CREATE INDEX idx_documents_agent_folder ON documents(agent_id, folder_id);
