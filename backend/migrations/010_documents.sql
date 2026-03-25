-- ============================================================
-- Documents & Document Chunks for RAG system
-- ============================================================

-- Documents: uploaded files with metadata
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    filename        TEXT NOT NULL,
    file_type       TEXT NOT NULL,
    file_size       BIGINT NOT NULL,
    raw_file        BYTEA NOT NULL,
    status          TEXT NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'ready', 'failed')),
    error_message   TEXT,
    page_count      INT,
    chunk_count     INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Document chunks: text fragments with embeddings for RAG retrieval
CREATE TABLE document_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    agent_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    page_number     INT,
    section_heading TEXT,
    embedding       vector(1536),
    search_vector   tsvector,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for documents
CREATE INDEX idx_documents_agent_id ON documents(agent_id);
CREATE INDEX idx_documents_agent_status ON documents(agent_id, status);
CREATE INDEX idx_documents_agent_contact ON documents(agent_id, contact_id);

-- Indexes for document_chunks
CREATE INDEX idx_doc_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_doc_chunks_agent ON document_chunks(agent_id);
CREATE INDEX idx_doc_chunks_doc_index ON document_chunks(document_id, chunk_index);
CREATE INDEX idx_doc_chunks_vector ON document_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_doc_chunks_fts ON document_chunks USING gin(search_vector);

-- RLS policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_agent_isolation ON documents
    USING (agent_id = current_setting('app.current_agent_id')::uuid);
CREATE POLICY doc_chunks_agent_isolation ON document_chunks
    USING (agent_id = current_setting('app.current_agent_id')::uuid);

-- Auto-update search_vector on insert/update
CREATE TRIGGER trg_doc_chunks_search_vector
    BEFORE INSERT OR UPDATE OF content ON document_chunks
    FOR EACH ROW EXECUTE FUNCTION
    tsvector_update_trigger(search_vector, 'pg_catalog.english', content);

-- Auto-update updated_at on documents
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
