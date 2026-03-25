-- Add pdf_preview column for storing PDF conversions of non-PDF documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pdf_preview BYTEA;
