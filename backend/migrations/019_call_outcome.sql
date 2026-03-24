-- Call outcome tagging and AMD detection
ALTER TABLE call_logs ADD COLUMN outcome TEXT;
ALTER TABLE call_logs ADD COLUMN answered_by TEXT;
