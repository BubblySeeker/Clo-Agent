-- Add recording metadata columns to call_logs
ALTER TABLE call_logs ADD COLUMN recording_sid TEXT;
ALTER TABLE call_logs ADD COLUMN recording_url TEXT;
ALTER TABLE call_logs ADD COLUMN recording_duration INTEGER DEFAULT 0;
ALTER TABLE call_logs ADD COLUMN local_recording_path TEXT;
