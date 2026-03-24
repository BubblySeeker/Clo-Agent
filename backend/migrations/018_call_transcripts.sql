-- Call transcripts table for storing transcription results and AI analysis
CREATE TABLE call_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id),
    full_text TEXT NOT NULL,
    speaker_segments JSONB NOT NULL DEFAULT '[]',
    ai_summary TEXT,
    ai_actions JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    duration_seconds INTEGER,
    word_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_transcripts_agent ON call_transcripts
    USING (agent_id = current_setting('app.current_agent_id')::uuid);

CREATE UNIQUE INDEX idx_transcripts_call ON call_transcripts(call_id);
CREATE INDEX idx_transcripts_agent ON call_transcripts(agent_id, created_at DESC);
CREATE INDEX idx_transcripts_fulltext ON call_transcripts
    USING gin(to_tsvector('english', full_text));

-- Add transcription_status to call_logs for frontend status display
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transcription_status TEXT DEFAULT NULL;
