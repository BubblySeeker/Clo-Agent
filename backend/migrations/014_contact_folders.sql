-- Contact folders for organizing contacts into groups (e.g., by area, client type)
CREATE TABLE IF NOT EXISTS contact_folders (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_folders_agent ON contact_folders(agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_folders_agent_name ON contact_folders(agent_id, LOWER(name));

ALTER TABLE contact_folders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'contact_folders_agent_isolation'
  ) THEN
    CREATE POLICY contact_folders_agent_isolation ON contact_folders
      USING (agent_id = current_setting('app.current_agent_id')::uuid);
  END IF;
END $$;

-- Add folder_id to contacts (NULL = unfiled)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES contact_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_agent_folder ON contacts(agent_id, folder_id);
