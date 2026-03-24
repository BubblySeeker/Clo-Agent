# Phase 5: Recording Infrastructure - Research

**Researched:** 2026-03-24
**Domain:** Twilio call recording, audio storage, credential encryption, frontend audio playback
**Confidence:** HIGH

## Summary

Phase 5 adds recording infrastructure to the working call flow built in Phase 4. The core work is: (1) enable dual-channel recording on all calls via TwiML attributes, (2) receive recording-ready webhooks from Twilio and store metadata, (3) download recordings from Twilio to local storage and delete the Twilio copy, (4) encrypt Twilio auth tokens at rest, and (5) build a recording proxy endpoint and frontend audio player.

All of this builds directly on Phase 4's completed infrastructure: the TwiMLBridge and InboundCallWebhook handlers already return `<Dial>` TwiML -- adding `record` and `recordingStatusCallback` attributes is a small modification. The recording webhook follows the exact same pattern as CallStatusWebhook (public endpoint, Twilio signature validation, agent lookup via CallSid). No new dependencies are required in the frontend. The Go backend needs only stdlib `crypto/aes` + `crypto/cipher` for encryption.

**Primary recommendation:** Add `record="record-from-answer-dual"` and `recordingStatusCallback` to the existing TwiML in both TwiMLBridge and InboundCallWebhook, build a new RecordingWebhook handler following the CallStatusWebhook pattern, add a recording proxy endpoint, and encrypt auth_token in twilio_config using AES-256-GCM with a key from env var.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REC-01 | Outbound and inbound calls are recorded in dual-channel format | Add `record="record-from-answer-dual"` + `recordingStatusCallback` to existing TwiML in TwiMLBridge and InboundCallWebhook |
| REC-02 | Recording webhook receives notification when recording is ready and stores metadata in call_logs | New RecordingWebhook handler following CallStatusWebhook pattern; add recording_sid, recording_url, recording_duration columns |
| REC-03 | Agent can play back call recordings in the communication page via a proxy endpoint | New ProxyRecording endpoint streams audio from local storage; frontend adds HTML5 audio player |
| REC-04 | Recordings are downloaded from Twilio and stored locally/S3, then deleted from Twilio | Recording webhook triggers async download via HTTP GET with Basic Auth, stores to disk, then DELETE via Twilio API |
| REC-05 | Twilio auth tokens are encrypted at rest in the database | AES-256-GCM encryption using Go stdlib crypto/aes + crypto/cipher, key from TWILIO_ENCRYPTION_KEY env var |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `crypto/aes` + `crypto/cipher` | Go stdlib | AES-256-GCM encryption for auth tokens | Go standard library; no external dependency needed |
| twilio-go | v1.30.3 | Delete recordings via Twilio REST API | Already installed in Phase 4 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `encoding/hex` | Go stdlib | Encode/decode encrypted ciphertext for DB storage | Store encrypted token as hex string in TEXT column |
| `crypto/rand` | Go stdlib | Generate random nonce for GCM encryption | Every encryption operation needs unique nonce |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AES-256-GCM (Go stdlib) | HashiCorp Vault, AWS KMS | Overkill for single-key encryption; adds external dependency |
| Local file storage | S3 | S3 adds AWS SDK dependency; local is fine for dev/small scale; use pluggable interface |
| Hex encoding for ciphertext | Base64 | Hex is simpler to debug; Base64 is more compact but marginal difference |

**Installation:**
No new packages needed. All dependencies are Go stdlib or already installed.

## Architecture Patterns

### Recommended Project Structure

No new files needed beyond modifications to existing handlers. New additions:

```
backend/
  internal/
    handlers/
      calls.go           # ADD: RecordingWebhook, ProxyRecording
      twilio_util.go      # ADD: encrypt/decrypt helpers
    config/
      config.go           # ADD: TwilioEncryptionKey field
  migrations/
    017_recording_fields.sql   # ADD recording columns to call_logs

frontend/
  src/
    lib/api/calls.ts           # ADD: getRecordingUrl helper
    app/dashboard/communication/page.tsx  # ADD: audio player in call detail
```

### Pattern 1: Recording Webhook (mirrors CallStatusWebhook)

**What:** Public endpoint that Twilio POSTs to when a recording is ready.
**When to use:** After every call that has recording enabled.

The handler pattern is identical to CallStatusWebhook:
1. Parse form data from Twilio POST
2. Look up agent_id via CallSid from call_logs
3. Fetch auth_token for signature validation
4. Validate X-Twilio-Signature
5. Update call_logs with recording metadata
6. Trigger async recording download

```go
// RecordingWebhook receives Twilio recording status callbacks.
// POST /api/calls/recording-webhook (PUBLIC)
func RecordingWebhook(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        r.ParseForm()
        callSID := r.FormValue("CallSid")
        recordingSID := r.FormValue("RecordingSid")
        recordingURL := r.FormValue("RecordingUrl")
        recordingDuration := r.FormValue("RecordingDuration")
        recordingStatus := r.FormValue("RecordingStatus")

        // Only process completed recordings
        if recordingStatus != "completed" {
            w.WriteHeader(http.StatusNoContent)
            return
        }

        // Look up agent_id from call_logs via CallSid
        var agentID string
        pool.QueryRow(ctx, `SELECT agent_id FROM call_logs WHERE twilio_sid = $1`, callSID).Scan(&agentID)

        // Validate Twilio signature (same pattern as CallStatusWebhook)
        // ...

        // Store recording metadata with RLS
        tx, _ := database.BeginWithRLS(ctx, pool, agentID)
        duration, _ := strconv.Atoi(recordingDuration)
        tx.Exec(ctx,
            `UPDATE call_logs SET recording_sid = $1, recording_url = $2, recording_duration = $3
             WHERE twilio_sid = $4`,
            recordingSID, recordingURL, duration, callSID)
        tx.Commit(ctx)

        // Trigger async download in background goroutine
        go downloadAndStoreRecording(pool, cfg, agentID, recordingSID, recordingURL, callSID)

        w.WriteHeader(http.StatusNoContent)
    }
}
```

### Pattern 2: Recording Download + Twilio Deletion

**What:** Download recording from Twilio via authenticated HTTP GET, store locally, then DELETE from Twilio.
**When to use:** Triggered asynchronously after recording webhook fires.

```go
func downloadAndStoreRecording(pool *pgxpool.Pool, cfg *config.Config, agentID, recordingSID, recordingURL, callSID string) {
    // 1. Fetch Twilio credentials (decrypt auth_token)
    // 2. HTTP GET recordingURL + ".mp3" with Basic Auth (accountSID:authToken)
    // 3. Write to local file: recordings/{agentID}/{recordingSID}.mp3
    // 4. Update call_logs.recording_url to local path
    // 5. HTTP DELETE recording from Twilio via twilio-go SDK
}
```

Recording download URL format:
```
GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Recordings/{RecordingSid}.mp3
Authorization: Basic {base64(AccountSid:AuthToken)}
```

Recording delete URL format:
```
DELETE https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Recordings/{RecordingSid}.json
Authorization: Basic {base64(AccountSid:AuthToken)}
```

### Pattern 3: AES-256-GCM Encryption for Auth Tokens

**What:** Encrypt Twilio auth_token before storing in DB, decrypt when reading.
**When to use:** All writes to and reads from twilio_config.auth_token.

```go
func encryptToken(plaintext string, key []byte) (string, error) {
    block, _ := aes.NewCipher(key)         // key must be 32 bytes for AES-256
    gcm, _ := cipher.NewGCM(block)
    nonce := make([]byte, gcm.NonceSize()) // 12 bytes
    io.ReadFull(rand.Reader, nonce)
    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil) // prepend nonce
    return hex.EncodeToString(ciphertext), nil
}

func decryptToken(ciphertextHex string, key []byte) (string, error) {
    ciphertext, _ := hex.DecodeString(ciphertextHex)
    block, _ := aes.NewCipher(key)
    gcm, _ := cipher.NewGCM(block)
    nonceSize := gcm.NonceSize()
    nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
    plaintext, _ := gcm.Open(nil, nonce, ct, nil)
    return string(plaintext), nil
}
```

Key source: `TWILIO_ENCRYPTION_KEY` env var (32-byte hex string = 64 hex characters).

### Pattern 4: Recording Proxy Endpoint

**What:** Stream recording audio to frontend without exposing file paths or Twilio credentials.
**When to use:** Frontend requests audio playback for a call.

```go
// ProxyRecording streams the recording file to the client.
// GET /api/calls/{id}/recording (Protected - Clerk JWT)
func ProxyRecording(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Look up call_logs with RLS to get local recording path
        // Open file, set Content-Type: audio/mpeg, stream to response
        // Support Range headers for seeking
    }
}
```

### Anti-Patterns to Avoid

- **Exposing Twilio recording URLs to the frontend:** Never send the raw Twilio URL or local file path to the client. Always proxy through an authenticated endpoint.
- **Synchronous download in webhook handler:** Twilio expects a fast response (15s timeout). Download must be async (goroutine).
- **Storing encryption key in the database:** The encryption key MUST come from an environment variable, never from the same database that stores the encrypted data.
- **Forgetting to decrypt when reading auth_token:** After encryption is added, every code path that reads auth_token must decrypt. This includes: InitiateCall, TwiMLBridge, InboundCallWebhook, CallStatusWebhook, SyncCallLogs, SMSConfigure, SMSStatus, SMSWebhook, SendSMS, SyncSMS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encryption | Custom crypto scheme | Go stdlib AES-256-GCM | Crypto is notoriously hard to get right; stdlib is audited |
| Recording storage abstraction | Complex S3 client | Simple file write + interface | Local storage is sufficient for current scale; add S3 later behind same interface |
| Audio format conversion | FFmpeg transcoding pipeline | Twilio's .mp3 endpoint directly | Twilio already serves compressed MP3 |
| Audio player | Custom waveform player | HTML5 `<audio>` element | Native browser audio player handles seeking, buffering, controls |

**Key insight:** This phase is plumbing, not innovation. Every component (webhook, download, encrypt, proxy, audio player) is a solved problem with standard patterns.

## Common Pitfalls

### Pitfall 1: recordingStatusCallback vs StatusCallback Confusion

**What goes wrong:** Team sets StatusCallback (call status) but not recordingStatusCallback (recording status). Recording is created by Twilio but the app never learns about it.
**Why it happens:** These are two different webhook URLs on the `<Dial>` verb. StatusCallback tracks call state. recordingStatusCallback tracks recording state. Both are needed.
**How to avoid:** Set BOTH on the `<Dial>` verb. recordingStatusCallback is set on the `<Dial>` element itself, not on the `<Number>` child.
**Warning signs:** Calls complete with correct status but recording_sid is always NULL.

### Pitfall 2: Recording Download 404 Race Condition

**What goes wrong:** Recording webhook fires with status "completed" but the file is not yet downloadable. HTTP GET returns 404.
**Why it happens:** Small delay between Twilio marking recording as completed and the file being fully available.
**How to avoid:** Add a brief delay (2-3 seconds) before download attempt. Implement retry with exponential backoff (3 attempts, 2s/4s/8s delays). Only attempt download when recordingStatus is "completed".
**Warning signs:** Intermittent 404s on recording download. Some recordings missing from local storage.

### Pitfall 3: Auth Token Encryption Migration

**What goes wrong:** Encryption is added but existing plaintext auth_tokens in the database are not migrated. Decrypt function fails on unencrypted data.
**Why it happens:** New code expects encrypted format, old data is plaintext.
**How to avoid:** Either (a) add a migration step that reads all tokens, encrypts them, and writes back, or (b) add detection logic that tries to decrypt, and if it fails (not valid hex or GCM auth fails), treats the value as plaintext and re-encrypts it on next write.
**Warning signs:** Existing agents' SMS/call features break immediately after deployment.

### Pitfall 4: Missing Decrypt in All Read Paths

**What goes wrong:** Auth token is encrypted on write but one handler still reads the raw (now encrypted) value and passes it to Twilio. Twilio rejects the request with 401.
**Why it happens:** Multiple handlers read auth_token: InitiateCall, TwiMLBridge, InboundCallWebhook, CallStatusWebhook, SyncCallLogs, SMSWebhook, SendSMS, SyncSMS. Missing any one breaks that feature.
**How to avoid:** Create a single helper function `getTwilioConfig(ctx, pool, agentID)` that always returns decrypted credentials. All handlers use this instead of raw SQL queries. This is the safest approach -- one decrypt point, impossible to miss.
**Warning signs:** Some features work (those that decrypt) while others return 401 errors from Twilio.

### Pitfall 5: Recording URL Becomes 404 After Twilio Deletion

**What goes wrong:** Code deletes recording from Twilio but stores the Twilio URL (not local path) in the database. Frontend tries to proxy from the Twilio URL, gets 404.
**Why it happens:** Download happens async, but the database update to local path races with or is forgotten.
**How to avoid:** Update call_logs.recording_url to the local path AFTER confirmed download, BEFORE deleting from Twilio. Never delete from Twilio until local file existence is verified.
**Warning signs:** Recordings play fine initially (from Twilio) but stop working after background job runs.

## Code Examples

### TwiML with Recording Enabled (modify existing TwiMLBridge)

```go
// Current TwiMLBridge returns:
// <Dial callerId="%s"><Number>%s</Number></Dial>
//
// Modified to add recording:
twimlXML := fmt.Sprintf(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This call may be recorded for quality purposes.</Say>
  <Dial callerId="%s"
        record="record-from-answer-dual"
        recordingStatusCallback="%s/api/calls/recording-webhook"
        recordingStatusCallbackEvent="completed">
    <Number>%s</Number>
  </Dial>
</Response>`, xmlEscape(fromNumber), xmlEscape(cfg.WebhookBaseURL), xmlEscape(clientPhone))
```

Source: [Twilio TwiML Dial](https://www.twilio.com/docs/voice/twiml/dial)

### Twilio Recording Download via HTTP

```go
// Download recording as MP3
downloadURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Recordings/%s.mp3",
    accountSID, recordingSID)
req, _ := http.NewRequest("GET", downloadURL, nil)
req.SetBasicAuth(accountSID, authToken)
resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()
// Write resp.Body to local file
```

Source: [Twilio Recordings Resource](https://www.twilio.com/docs/voice/api/recording)

### Twilio Recording Deletion

```go
// Using twilio-go SDK (already installed)
client := twilio.NewRestClientWithParams(twilio.ClientParams{
    Username: accountSID,
    Password: authToken,
})
err := client.Api.DeleteRecording(recordingSID, nil)
```

Source: [Downloading and Deleting Twilio Recordings](https://support.twilio.com/hc/en-us/articles/360002588893)

### Frontend Audio Player

```tsx
// Simple HTML5 audio player with auth
function RecordingPlayer({ callId }: { callId: string }) {
    const { getToken } = useAuth();
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    useEffect(() => {
        async function loadAudio() {
            const token = await getToken();
            const resp = await fetch(`${API_URL}/calls/${callId}/recording`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const blob = await resp.blob();
            setAudioUrl(URL.createObjectURL(blob));
        }
        loadAudio();
        return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
    }, [callId]);

    if (!audioUrl) return null;
    return <audio controls src={audioUrl} className="w-full" />;
}
```

### Database Migration (017_recording_fields.sql)

```sql
-- Add recording metadata columns to call_logs
ALTER TABLE call_logs ADD COLUMN recording_sid TEXT;
ALTER TABLE call_logs ADD COLUMN recording_url TEXT;
ALTER TABLE call_logs ADD COLUMN recording_duration INTEGER DEFAULT 0;
ALTER TABLE call_logs ADD COLUMN local_recording_path TEXT;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Twilio mono recording | Dual-channel default | Late 2024 | Being explicit with `record-from-answer-dual` is still recommended |
| Store Twilio URL as permanent link | Download + delete from Twilio | Always best practice | Reduces storage costs and PII exposure |
| Plaintext API credentials in DB | Encrypt at rest | Industry standard | Prevents credential theft from DB compromise |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Go `testing` + manual endpoint testing |
| Config file | None -- Go tests use `go test ./...` |
| Quick run command | `cd backend && go build ./...` |
| Full suite command | `cd backend && go build ./...` (no test files exist yet) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | TwiML includes record attribute | manual | Inspect TwiML output from bridge/inbound endpoints | N/A |
| REC-02 | Recording webhook stores metadata | manual | POST to webhook endpoint, check DB | N/A |
| REC-03 | Proxy endpoint streams audio | manual | GET /api/calls/{id}/recording returns audio/mpeg | N/A |
| REC-04 | Download from Twilio + delete | manual | Check local file exists after webhook | N/A |
| REC-05 | Auth tokens encrypted | manual | SELECT auth_token shows ciphertext, not plaintext | N/A |

### Sampling Rate

- **Per task commit:** `cd /Users/rb/conductor/workspaces/Clo-Agent/denver/backend && go build ./...`
- **Per wave merge:** Full build + manual verification
- **Phase gate:** All 5 requirements verified via manual testing

### Wave 0 Gaps

- No automated test infrastructure exists for the backend (pre-existing gap)
- Manual verification is the established pattern from Phase 4

## Open Questions

1. **Recording storage location**
   - What we know: Local filesystem works for dev. S3 is the production standard.
   - What's unclear: Whether to implement S3 now or keep local-only.
   - Recommendation: Use a simple Go interface (`RecordingStore`) with a local filesystem implementation. Add S3 implementation later behind the same interface. Store recordings at `./recordings/{agent_id}/{recording_sid}.mp3`.

2. **Encryption key rotation**
   - What we know: AES-256-GCM with a single env var key works.
   - What's unclear: How to rotate keys without re-encrypting all tokens.
   - Recommendation: Defer key rotation to a future phase. For now, a single static key is sufficient. If rotation is needed later, add a key_version field to twilio_config.

3. **Recording file cleanup policy**
   - What we know: Local recordings accumulate over time.
   - What's unclear: How long to retain recordings locally.
   - Recommendation: Defer retention policy. For now, keep all recordings. This is a future concern when storage fills up.

## Sources

### Primary (HIGH confidence)
- [Twilio TwiML Dial verb](https://www.twilio.com/docs/voice/twiml/dial) - record attribute options, recordingStatusCallback
- [Twilio Recordings Resource API](https://www.twilio.com/docs/voice/api/recording) - download/delete REST API
- [Twilio Recording Status Callbacks](https://support.twilio.com/hc/en-us/articles/360014251313) - webhook parameters
- [Downloading and Deleting Twilio Recordings](https://support.twilio.com/hc/en-us/articles/360002588893) - download + delete workflow
- [Go crypto/cipher package](https://pkg.go.dev/crypto/cipher) - AES-GCM implementation
- [Twilio AES-256 Go tutorial](https://www.twilio.com/en-us/blog/developers/community/encrypt-and-decrypt-data-in-go-with-aes-256) - Go encryption example

### Secondary (MEDIUM confidence)
- [AES-256 GCM Example in Go (GitHub Gist)](https://gist.github.com/kkirsche/e28da6754c39d5e7ea10) - nonce prepend pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Go stdlib crypto, no new dependencies
- Architecture: HIGH - Direct extension of Phase 4 patterns (webhook handler, TwiML modification)
- Pitfalls: HIGH - Well-documented Twilio patterns, encryption is stdlib
- Recording download/delete: HIGH - Standard Twilio REST API, verified via official docs

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, no fast-moving dependencies)
