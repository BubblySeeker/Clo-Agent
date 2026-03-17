-- Add unique constraint on (source_type, source_id) for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_source_unique
    ON embeddings(source_type, source_id);
