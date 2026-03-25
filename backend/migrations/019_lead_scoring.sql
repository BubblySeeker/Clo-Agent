-- Add lead scoring columns to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score          INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score_signals  JSONB;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS previous_lead_score INTEGER;
