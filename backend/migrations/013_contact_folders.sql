-- Link folders to contacts (one auto-folder per contact)
ALTER TABLE document_folders ADD COLUMN contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_doc_folders_contact ON document_folders(contact_id) WHERE contact_id IS NOT NULL;

-- Backfill: create a folder for each existing contact
INSERT INTO document_folders (agent_id, name, contact_id)
SELECT c.agent_id, c.first_name || ' ' || c.last_name, c.id
FROM contacts c
WHERE NOT EXISTS (
    SELECT 1 FROM document_folders df WHERE df.contact_id = c.id
);

-- Move documents that were linked to contacts into their contact's folder
UPDATE documents d
SET folder_id = df.id
FROM document_folders df
WHERE d.contact_id = df.contact_id
  AND d.folder_id IS NULL;
