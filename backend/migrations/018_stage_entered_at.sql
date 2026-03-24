-- Migration 018: Track when a deal entered its current stage
ALTER TABLE deals ADD COLUMN stage_entered_at TIMESTAMPTZ;
-- Backfill existing deals: use created_at as initial value
UPDATE deals SET stage_entered_at = created_at WHERE stage_entered_at IS NULL;
