# Phase 6: AI Transcription & Intelligence - Research

**Researched:** 2026-03-24
**Domain:** Audio transcription, AI analysis, pgvector embeddings, confirmation card UI
**Confidence:** HIGH

## Summary

Phase 6 transforms call recordings (stored locally as MP3 by Phase 5) into transcripts with speaker labels, AI-generated summaries, extracted action items, and searchable embeddings. The entire pipeline runs in the Python AI service, triggered by the Go backend after recording download completes. No new external vendors are needed -- OpenAI (already installed, `openai==2.26.0`) handles transcription and Claude Haiku (already configured) handles analysis.

The critical architectural decision is **dual-channel split with pydub vs native diarization via `gpt-4o-transcribe-diarize`**. Research shows `gpt-4o-transcribe-diarize` exists ($0.006/min) with native speaker labels, but community reports significant quality issues (missed sentences, hallucinations, language mixing). The dual-channel approach -- split stereo MP3 into two mono tracks with pydub, transcribe each with `gpt-4o-transcribe`, interleave by timestamp -- is more reliable because Twilio already records agent and client on separate channels (`record-from-answer-dual` set in Phase 5). This gives perfect speaker attribution without relying on AI diarization.

The AI analysis pipeline mirrors existing patterns: `asyncio.create_task` for async processing (same as workflow engine), structured JSON extraction via Claude Haiku (same model, same SDK), pending_actions-style confirmation cards for suggested CRM updates (same frontend pattern). New AI tools (`get_call_transcript`, `search_call_transcripts`) follow the exact same pattern as the 16 existing read tools.

**Primary recommendation:** Use dual-channel pydub split + `gpt-4o-transcribe` per channel for reliable speaker labels. Trigger the pipeline from Go backend after `downloadAndStoreRecording` completes. Store transcripts in a new `call_transcripts` table. Surface AI actions as confirmation cards using the existing pending_actions pattern.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-01 | Completed call recordings are automatically transcribed using OpenAI gpt-4o-transcribe with speaker diarization via dual-channel split | pydub splits stereo MP3 into mono channels; gpt-4o-transcribe at $0.006/min; interleave by timestamp for speaker labels |
| AI-02 | Call transcripts are analyzed by Claude to generate a call summary, action items, and CRM update suggestions | Claude Haiku 4.5 with structured JSON output; same SDK already in use; prompt extracts summary, tasks, deal/buyer updates |
| AI-03 | AI-extracted tasks are surfaced as confirmation cards the agent can approve with one click | Reuse existing pending_actions table + confirmation SSE event + frontend confirmation card pattern |
| AI-04 | AI-suggested deal stage and buyer profile updates are surfaced as confirmation cards | Same pending_actions pattern; queue multiple actions from single analysis; frontend renders per-action cards |
| AI-05 | Recent call transcripts and summaries are loaded into AI chat contact context | Extend `_load_contact_context` in agent.py to query call_transcripts for contact's recent calls |
| AI-06 | Call transcripts are embedded in pgvector for semantic search | Reuse existing `embed_activity` pattern from embeddings.py; new `embed_transcript` function; source_type="call_transcript" |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai | 2.26.0 | Audio transcription via `gpt-4o-transcribe` model | Already installed; same SDK used for embeddings |
| anthropic | 0.84.0 | Post-call analysis via Claude Haiku 4.5 | Already installed; same agent loop pattern |
| pydub | 0.25.1 | Split dual-channel stereo MP3 into mono tracks | De facto Python audio manipulation; minimal dependency |
| ffmpeg | system pkg | Audio codec backend for pydub | Required by pydub for MP3 handling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| psycopg2-binary | 2.9.11 | Database access for transcript storage | Already installed; used by all AI service DB operations |
| pgvector | 0.4.2 | Semantic search embeddings | Already installed; used by embeddings.py |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dual-channel split + gpt-4o-transcribe | gpt-4o-transcribe-diarize (native diarization) | Native diarization at same price, but community reports quality issues (missed sentences, hallucinations); dual-channel is deterministic |
| gpt-4o-transcribe ($0.006/min) | gpt-4o-mini-transcribe ($0.003/min) | Mini is half-price but lower accuracy; for real estate CRM where transcripts drive CRM updates, accuracy matters |
| pydub | ffmpeg CLI directly | pydub provides clean Python API; direct ffmpeg subprocess is fragile |

**Installation:**
```bash
# AI service
pip install pydub==0.25.1

# Docker (add to Dockerfile runtime stage)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

**Version verification:** openai 2.26.0 (already in requirements.txt), anthropic 0.84.0 (already in requirements.txt), pydub 0.25.1 (new addition).

## Architecture Patterns

### Recommended Project Structure
```
ai-service/app/
  services/
    transcription.py      # Download audio, split channels, transcribe, interleave
    call_analysis.py      # Feed transcript to Claude, extract structured CRM actions
    embeddings.py          # (existing) Add embed_transcript function
  routes/
    calls.py               # NEW: POST /ai/calls/process-recording endpoint
  tools.py                 # Add get_call_transcript, search_call_transcripts read tools
  services/agent.py        # Extend _load_contact_context with call transcripts
```

### Pattern 1: Async Pipeline Triggered by Go Backend
**What:** Go backend's `downloadAndStoreRecording` goroutine, after successfully downloading the MP3, POSTs to `POST /ai/calls/process-recording` with the call_id and agent_id. The AI service acknowledges immediately (200 OK), then spawns an `asyncio.create_task` for the full pipeline.
**When to use:** Every completed call with a recording.
**Why:** Same pattern as workflow engine triggers. Go fires and forgets; AI service processes asynchronously. Avoids blocking Go goroutine. Handles retries internally.

```python
# In routes/calls.py
@router.post("/ai/calls/process-recording")
async def process_recording(request: Request):
    body = await request.json()
    call_id = body["call_id"]
    agent_id = body["agent_id"]
    local_path = body["local_path"]

    # Acknowledge immediately
    asyncio.create_task(run_transcription_pipeline(call_id, agent_id, local_path))
    return {"status": "processing"}
```

### Pattern 2: Dual-Channel Split and Transcribe
**What:** pydub loads the stereo MP3 (left=agent, right=client based on Twilio dual-channel convention). Split into two mono tracks. Transcribe each separately with `gpt-4o-transcribe`. Merge results by timestamp.
**When to use:** Every recording from a call that used `record-from-answer-dual`.

```python
from pydub import AudioSegment
import tempfile, os

def split_and_transcribe(local_path: str) -> dict:
    audio = AudioSegment.from_mp3(local_path)
    channels = audio.split_to_mono()

    # Twilio dual-channel: channel 0 = leg originator (depends on call direction)
    # For outbound: channel 0 = agent, channel 1 = client
    # For inbound: channel 0 = caller (client), channel 1 = agent
    agent_channel = channels[0]  # Adjusted per direction
    client_channel = channels[1]

    # Export to temp files for OpenAI API
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        agent_channel.export(f, format="mp3")
        agent_path = f.name
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        client_channel.export(f, format="mp3")
        client_path = f.name

    try:
        agent_transcript = transcribe_audio(agent_path)
        client_transcript = transcribe_audio(client_path)
        return interleave_by_timestamp(agent_transcript, client_transcript)
    finally:
        os.unlink(agent_path)
        os.unlink(client_path)
```

### Pattern 3: Structured Claude Analysis with JSON Output
**What:** Feed transcript + contact context to Claude Haiku. Use a system prompt that demands structured JSON output with specific fields: summary, tasks, buyer_profile_updates, deal_stage_suggestion, key_quotes.
**When to use:** After transcription completes for every call.

```python
# Claude prompt structure
ANALYSIS_SYSTEM = """You are analyzing a real estate agent's phone call transcript.
Extract structured CRM updates from the conversation.
Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence call summary",
  "tasks": [{"body": "task description", "due_date": "YYYY-MM-DD", "priority": "high|medium|low"}],
  "buyer_profile_updates": {"budget_max": null, "locations": [], "bedrooms": null, ...},
  "deal_stage_suggestion": null | "stage_name",
  "key_quotes": ["quote1", "quote2"]
}
Only include fields where the transcript provides clear evidence. Use null for uncertain fields."""
```

### Pattern 4: Confirmation Cards for AI-Suggested Actions
**What:** Store extracted actions in `call_transcripts.ai_actions` as JSONB. When the frontend loads a call detail, it renders each action as a confirmation card with Confirm/Dismiss buttons. Confirming triggers the existing API endpoints (create_task, update_deal, update_buyer_profile).
**When to use:** For every AI-suggested CRM update from call analysis.
**Why not use pending_actions directly:** pending_actions has a 10-minute TTL and is designed for real-time AI chat confirmations. Call transcript actions are persistent -- they remain until the agent acts on them. A separate `action_status` field in `ai_actions` JSONB tracks confirmed/dismissed state.

### Anti-Patterns to Avoid
- **Processing in the webhook handler:** The Go `RecordingWebhook` must NOT wait for transcription. It acknowledges Twilio immediately. Transcription is triggered async after download completes.
- **Single-channel transcription of stereo audio:** Transcribing the stereo MP3 directly loses speaker separation. Always split channels first.
- **Auto-applying CRM updates:** Never auto-create tasks or update deals without agent confirmation. Trust must be built first.
- **Loading full transcripts into AI chat context:** Transcripts can be 4,000+ words. Load only the summary + key quotes into the system prompt. Full transcript available via tool call.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio channel splitting | Custom ffmpeg subprocess calls | pydub `split_to_mono()` | pydub handles codec detection, temp files, format conversion cleanly |
| Speaker diarization | NLP-based speaker detection | Dual-channel recording (already configured) | Twilio records each party on separate channels; splitting gives perfect attribution |
| Transcript timestamp merging | Custom timestamp parser | OpenAI verbose_json response format with word-level timestamps | API returns timestamps; merge by time ordering |
| Confirmation cards | New frontend component system | Existing pending_actions / confirmation card pattern | Pattern already works in AI chat; call detail cards follow same UX |
| Semantic search | Custom text search | Existing pgvector + embeddings.py patterns | embed_transcript mirrors embed_activity exactly |

**Key insight:** Every component of this phase has a direct precedent in the existing codebase. Transcription uses the existing OpenAI SDK. Analysis uses the existing Anthropic SDK. Async processing uses the existing asyncio.create_task pattern. Confirmation cards use the existing pending_actions UX. Embeddings use the existing pgvector infrastructure. The only truly new code is the pipeline orchestration connecting these pieces.

## Common Pitfalls

### Pitfall 1: 25MB File Size Limit on OpenAI Transcription API
**What goes wrong:** Long calls (30+ minutes) produce MP3 files exceeding 25MB, causing the API to reject them.
**Why it happens:** Dual-channel stereo MP3 at 128kbps = ~1MB/min. A 30-minute call = ~30MB stereo, but after splitting to mono ~15MB per channel.
**How to avoid:** After splitting to mono, each channel is half the size. For extremely long calls (60+ min), chunk the audio into 20-minute segments with pydub before transcribing. Most real estate calls are 5-20 minutes.
**Warning signs:** OpenAI API returns 413 or error about file size.

### Pitfall 2: Twilio Dual-Channel Convention Varies by Direction
**What goes wrong:** Agent and client are assigned to wrong speaker labels because the channel mapping differs between inbound and outbound calls.
**Why it happens:** Twilio dual-channel recording places the call initiator on channel 0. For outbound calls (Twilio calls agent first), channel 0 = agent. For inbound calls (client calls Twilio number), channel 0 = client.
**How to avoid:** Query the `call_logs.direction` field. If "outbound": channel 0 = agent, channel 1 = client. If "inbound": channel 0 = client, channel 1 = agent.
**Warning signs:** Transcript shows agent saying things the client said.

### Pitfall 3: Transcript Processing Blocks Event Loop
**What goes wrong:** Transcription + analysis takes 30-120 seconds. If run synchronously in a FastAPI request handler, it blocks the event loop and causes timeouts.
**Why it happens:** pydub operations are CPU-bound (audio decoding). OpenAI API calls are I/O-bound but slow.
**How to avoid:** Use `asyncio.create_task` for the pipeline. Use `asyncio.to_thread` (via existing `run_query` wrapper) for pydub operations. OpenAI async client for transcription calls.
**Warning signs:** AI service becomes unresponsive during transcription.

### Pitfall 4: Claude JSON Output Not Actually Valid JSON
**What goes wrong:** Claude returns markdown-wrapped JSON (```json ... ```) or adds commentary before/after the JSON block.
**Why it happens:** LLMs sometimes add narrative around structured output despite instructions.
**How to avoid:** Strip markdown code fences. Use `json.loads()` with a fallback regex to extract the JSON block. Validate required fields after parsing.
**Warning signs:** `json.JSONDecodeError` on Claude's response.

### Pitfall 5: Embedding Transcript Text Exceeds Token Limit
**What goes wrong:** A 30-minute call transcript is 4,000+ words. The embedding model (`text-embedding-3-small`) has a token limit of 8,191 tokens. Very long transcripts may exceed this.
**Why it happens:** Transcripts are much longer than contact or activity text.
**How to avoid:** Embed the AI summary + key quotes (compact, high-signal) rather than the full transcript. Full-text search on the transcript uses PostgreSQL's GIN index (already planned in architecture). This gives two search vectors: semantic (pgvector on summary) and keyword (full-text on transcript body).
**Warning signs:** OpenAI embedding API returns token limit error.

### Pitfall 6: Go Backend Cannot Reach AI Service After Recording Download
**What goes wrong:** The `downloadAndStoreRecording` goroutine finishes downloading but fails to notify the AI service because the AI_SERVICE_URL is not configured or the AI service is down.
**Why it happens:** The goroutine runs in the background with no caller waiting for the result. Errors are logged but not surfaced to the user.
**How to avoid:** Add retry logic (3 attempts with backoff) for the Go-to-AI POST. Store a `transcription_status` field on `call_logs` so the frontend can show "Transcribing..." or "Failed" state. Add a manual retry endpoint.
**Warning signs:** Recordings exist but no transcripts appear.

## Code Examples

### Database Migration: call_transcripts table

```sql
-- Migration 018_call_transcripts.sql
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
```

### speaker_segments JSONB Structure

```json
[
  {"speaker": "agent", "start": 0.0, "end": 3.5, "text": "Hi Sarah, thanks for calling back."},
  {"speaker": "client", "start": 3.8, "end": 8.2, "text": "Hey! Yeah, I wanted to talk about those Cherry Creek listings."},
  {"speaker": "agent", "start": 8.5, "end": 15.0, "text": "Great, I found three properties in your budget range..."}
]
```

### ai_actions JSONB Structure

```json
[
  {
    "type": "create_task",
    "params": {"body": "Send Cherry Creek listings under $850K", "due_date": "2026-03-25", "priority": "high"},
    "status": "pending",
    "confidence": "high"
  },
  {
    "type": "update_buyer_profile",
    "params": {"contact_id": "uuid", "budget_max": 850000, "locations": ["Cherry Creek"], "pre_approved": true},
    "status": "pending",
    "confidence": "medium"
  },
  {
    "type": "update_deal",
    "params": {"deal_id": "uuid", "stage_name": "Touring"},
    "status": "pending",
    "confidence": "low"
  }
]
```

### Go Backend: Trigger AI Service After Download

```go
// Add to end of downloadAndStoreRecording in calls.go
// After successful download and DB update, trigger transcription
func triggerTranscription(cfg *config.Config, callSID, agentID, localPath string) {
    // Look up call_id from call_logs
    var callID string
    pool.QueryRow(ctx, `SELECT id FROM call_logs WHERE twilio_sid = $1`, callSID).Scan(&callID)

    payload, _ := json.Marshal(map[string]string{
        "call_id":    callID,
        "agent_id":   agentID,
        "local_path": localPath,
    })

    req, _ := http.NewRequest("POST", cfg.AIServiceURL+"/ai/calls/process-recording", bytes.NewReader(payload))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

    resp, err := http.DefaultClient.Do(req)
    if err != nil || resp.StatusCode >= 400 {
        slog.Error("transcription trigger failed", "error", err, "call_id", callID)
    }
}
```

### Transcription Service: Split and Transcribe

```python
# ai-service/app/services/transcription.py
import openai
from pydub import AudioSegment
from app.config import OPENAI_API_KEY

_client = openai.OpenAI(api_key=OPENAI_API_KEY)

def transcribe_audio_file(file_path: str) -> dict:
    """Transcribe a single audio file, returning segments with timestamps."""
    with open(file_path, "rb") as f:
        result = _client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    return result

def split_channels_and_transcribe(local_path: str, direction: str) -> tuple[str, list]:
    """Split dual-channel MP3 and transcribe each channel separately."""
    audio = AudioSegment.from_mp3(local_path)
    channels = audio.split_to_mono()

    # Channel mapping based on call direction
    if direction == "outbound":
        agent_audio, client_audio = channels[0], channels[1]
    else:  # inbound
        client_audio, agent_audio = channels[0], channels[1]

    # Export to temp files, transcribe, interleave
    # ... (see full implementation in plan)
```

### AI Analysis: Structured Extraction

```python
# ai-service/app/services/call_analysis.py
import anthropic
from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL

_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

def analyze_transcript(transcript_text: str, contact_context: dict, call_metadata: dict) -> dict:
    """Extract CRM actions from a call transcript using Claude."""
    response = _client.messages.create(
        model=ANTHROPIC_MODEL,  # claude-haiku-4-5
        max_tokens=2048,
        system=ANALYSIS_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Contact: {json.dumps(contact_context)}\n\n"
                       f"Call: {call_metadata['direction']}, {call_metadata['duration']}s, "
                       f"{call_metadata['date']}\n\n"
                       f"Transcript:\n{transcript_text}"
        }],
    )
    return parse_analysis_json(response.content[0].text)
```

### New AI Read Tools

```python
# Add to tools.py TOOL_DEFINITIONS
{
    "name": "get_call_transcript",
    "description": "Get the full transcript, AI summary, and action items for a specific call.",
    "input_schema": {
        "type": "object",
        "properties": {
            "call_id": {"type": "string", "description": "UUID of the call log entry"},
        },
        "required": ["call_id"],
    },
},
{
    "name": "search_call_transcripts",
    "description": "Search call transcripts by text content. Use when the agent asks about what was discussed on calls.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search term to match in transcript text"},
            "contact_id": {"type": "string", "description": "Optional: limit to a specific contact's calls"},
            "limit": {"type": "integer", "description": "Max results (default 10)"},
        },
        "required": ["query"],
    },
},
```

### Contact Context Extension for AI Chat

```python
# Add to _load_contact_context in agent.py
# After existing SMS section, add call transcript summaries:
cur.execute(
    """SELECT ct.ai_summary, ct.created_at, cl.direction, cl.duration
       FROM call_transcripts ct
       JOIN call_logs cl ON cl.id = ct.call_id
       WHERE cl.contact_id = %s AND cl.agent_id = %s AND ct.ai_summary IS NOT NULL
       ORDER BY ct.created_at DESC LIMIT 3""",
    (contact_id, agent_id),
)
call_summaries = cur.fetchall()
if call_summaries:
    lines.append("Recent Call Summaries:")
    for cs in call_summaries:
        direction = "Outbound" if cs["direction"] == "outbound" else "Inbound"
        lines.append(f"  - [{direction}, {cs['duration']}s, {cs['created_at'].strftime('%b %d')}] {cs['ai_summary'][:200]}")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Whisper-1 ($0.006/min, no timestamps) | gpt-4o-transcribe ($0.006/min, better accuracy + timestamps) | Feb 2025 | Better word error rate, segment timestamps |
| No native diarization in API | gpt-4o-transcribe-diarize ($0.006/min) | Mar 2026 | Native speaker labels, but quality concerns reported |
| Dual-channel + manual split | Still best practice for reliability | Ongoing | Deterministic speaker separation vs probabilistic diarization |

**Deprecated/outdated:**
- `whisper-1` model: Still works but gpt-4o-transcribe has better accuracy at same price
- Twilio built-in transcription: $0.05/min, 8x more expensive, lower quality

## Open Questions

1. **Twilio dual-channel convention for two-leg bridge calls**
   - What we know: Twilio places the call initiator on channel 0. For our two-leg bridge, the first leg calls the agent.
   - What's unclear: In the two-leg bridge pattern (Twilio calls agent, agent answers, TwiML bridges to client), which channel gets which party on the second leg's recording?
   - Recommendation: Test with a real call. If channel assignment is wrong, swap in the code. Store `direction` with the transcript so it can be corrected retroactively.

2. **Handling calls with no recording (failed, no-answer, busy)**
   - What we know: Only calls with `recording_sid` AND `local_recording_path` should trigger transcription.
   - What's unclear: Should we create an empty transcript record for tracking, or only create records when a recording exists?
   - Recommendation: Only create `call_transcripts` rows for calls with actual recordings. Use absence of transcript as signal that no recording exists.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (Python AI service) + go test (Go backend) |
| Config file | None -- see Wave 0 |
| Quick run command | `cd ai-service && python -m pytest tests/ -x -q` |
| Full suite command | `cd ai-service && python -m pytest tests/ -v && cd ../backend && go build ./...` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-01 | Dual-channel split + transcription produces speaker-labeled text | unit | `pytest tests/test_transcription.py::test_split_and_transcribe -x` | Wave 0 |
| AI-02 | Claude analysis returns structured JSON with summary + actions | unit | `pytest tests/test_call_analysis.py::test_analyze_transcript -x` | Wave 0 |
| AI-03 | AI-extracted tasks stored in ai_actions JSONB with pending status | unit | `pytest tests/test_call_analysis.py::test_task_extraction -x` | Wave 0 |
| AI-04 | Deal/buyer updates stored in ai_actions JSONB | unit | `pytest tests/test_call_analysis.py::test_crm_updates -x` | Wave 0 |
| AI-05 | Contact context includes call summaries | unit | `pytest tests/test_agent.py::test_contact_context_includes_calls -x` | Wave 0 |
| AI-06 | Transcript embedded in pgvector | unit | `pytest tests/test_embeddings.py::test_embed_transcript -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd ai-service && python -m pytest tests/ -x -q`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `ai-service/tests/test_transcription.py` -- covers AI-01
- [ ] `ai-service/tests/test_call_analysis.py` -- covers AI-02, AI-03, AI-04
- [ ] `ai-service/tests/test_agent.py` -- covers AI-05 (may need mocking)
- [ ] `ai-service/tests/test_embeddings.py` -- covers AI-06
- [ ] `ai-service/tests/conftest.py` -- shared fixtures (mock OpenAI/Anthropic clients, test DB)
- [ ] Framework install: `pip install pytest pytest-asyncio` if not already installed

## Sources

### Primary (HIGH confidence)
- OpenAI Speech-to-Text API docs -- gpt-4o-transcribe model, verbose_json format, segment timestamps
- OpenAI gpt-4o-transcribe-diarize docs -- native diarization exists but quality concerns
- Existing codebase: `ai-service/app/services/embeddings.py` -- embedding patterns
- Existing codebase: `ai-service/app/services/agent.py` -- contact context loading
- Existing codebase: `ai-service/app/tools.py` -- tool definition and execution patterns
- Existing codebase: `backend/internal/handlers/calls.go` -- recording webhook and download pipeline
- Phase 5 summaries -- recording infrastructure complete, local paths available

### Secondary (MEDIUM confidence)
- [OpenAI Transcription Pricing](https://costgoat.com/pricing/openai-transcription) -- $0.006/min for gpt-4o-transcribe
- [OpenAI Community: gpt-4o-transcribe-diarize issues](https://community.openai.com/t/introducing-gpt-4o-transcribe-diarize-now-available-in-the-audio-api/1362933) -- Quality concerns reported
- [pydub documentation](https://github.com/jiaaro/pydub) -- split_to_mono, AudioSegment operations
- Twilio dual-channel recording convention (from Phase 5 research)

### Tertiary (LOW confidence)
- Twilio channel assignment in two-leg bridge calls -- needs real-call verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed except pydub; patterns well-established in codebase
- Architecture: HIGH -- every component mirrors existing patterns (asyncio.create_task, tool definitions, embeddings, confirmation cards)
- Pitfalls: HIGH -- dual-channel convention and file size limit are well-documented; JSON parsing is a known LLM issue
- Transcription quality: MEDIUM -- gpt-4o-transcribe is well-tested but dual-channel interleaving needs real-call verification

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain; OpenAI API changes slowly)
