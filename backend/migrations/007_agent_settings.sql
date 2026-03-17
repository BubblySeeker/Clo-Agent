-- Agent settings (commission rate, notification preferences, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
