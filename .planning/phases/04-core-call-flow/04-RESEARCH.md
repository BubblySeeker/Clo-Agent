# Phase 4: Core Call Flow - Research

**Researched:** 2026-03-24
**Domain:** Twilio Voice two-leg bridge calling, webhook infrastructure, call status tracking
**Confidence:** HIGH

## Summary

Phase 4 fixes the fundamentally broken outbound call flow and adds inbound call forwarding. The existing `calls.go` handler (line 61) dials the client directly via inline TwiML instead of bridging the agent first -- meaning no real calls have ever connected through the CRM. This phase rewrites the call initiation to use a proper two-leg bridge pattern, adds a `personal_phone` column to `twilio_config`, adds `WEBHOOK_BASE_URL` to the config, creates TwiML and inbound webhook endpoints, wires StatusCallback for real-time status updates, validates Twilio signatures on all call webhooks, fixes the RLS bug in `calls.go:100`, and fixes the SMS activity type bug in `sms.go:222`.

The two-leg bridge is a solved, well-documented Twilio pattern used by HubSpot, Close, FollowUpBoss, and OpenPhone. No new frontend dependencies are needed. The Go backend gains one new dependency (`github.com/twilio/twilio-go`) for typed TwiML generation and proper REST API calls. Three new public webhook endpoints and one settings update are required.

**Primary recommendation:** Use `twilio-go` SDK for TwiML generation and REST API calls. Add `personal_phone` column via migration. Add `WEBHOOK_BASE_URL` env var. Create three public webhook endpoints with Twilio signature validation. Include recording consent `<Say>` announcement in all TwiML from day one.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CALL-01 | Agent can configure personal phone number in Settings (stored in twilio_config) | Migration adds `personal_phone` to `twilio_config`; `SMSConfigure` handler extended to accept the field; Settings page gets a new input field |
| CALL-02 | Agent can initiate outbound call that rings their phone first, then bridges to client with recording consent | Two-leg bridge pattern: REST API calls agent's personal phone, TwiML bridge endpoint `<Say>` consent then `<Dial>` client. Requires `twilio-go` SDK rewrite of `InitiateCall` |
| CALL-03 | Inbound calls to Twilio number forwarded to agent's personal phone with caller ID | New `InboundCallWebhook` public endpoint returns TwiML `<Dial callerId="{caller}">` to agent's personal phone. Agent lookup via `twilio_config.phone_number` (same as SMS webhook pattern) |
| CALL-04 | All calls include recording consent announcement before conversation | `<Say>This call may be recorded for quality purposes.</Say>` in TwiML bridge endpoint before `<Dial>`. Legal requirement in two-party consent states (CA, FL, IL, MA, PA) |
| CALL-05 | Call status updates in real-time via StatusCallback without manual refresh | `StatusCallback` + `StatusCallbackEvent` params on outbound calls; existing `CallStatusWebhook` handler updates `call_logs`; frontend uses `refetchInterval` (already has 30s polling pattern) |
| CALL-06 | All call webhook endpoints validate Twilio signature | Extract `validateTwilioSignature` from `sms.go` to shared `twilio_util.go`; apply to all 3 new public endpoints + existing `CallStatusWebhook` |
| CALL-07 | Fix existing bugs: RLS in call handlers, SMS activity type | Fix `sms.go:222` type `'call'` to `'sms'`; fix `calls.go:100` to use `BeginWithRLS()`; move activity logging from initiation to completion |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `github.com/twilio/twilio-go` | v1.30.3 | Twilio REST API client + TwiML struct generation | Official Go SDK. Typed TwiML structs (`twiml.VoiceResponse`, `twiml.VoiceDial`, `twiml.VoiceSay`) prevent the structural TwiML bugs in the current code. Replaces raw HTTP calls. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto/hmac` + `crypto/sha1` (stdlib) | Go 1.25 | Twilio signature validation | Already used in `sms.go` `validateTwilioSignature`. Extract to shared util. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `twilio-go` SDK | Raw HTTP (current) | Raw HTTP works but produces the TwiML bugs we are fixing; SDK provides typed TwiML structs and proper error handling |
| TwiML structs from SDK | Hardcoded XML strings | XML strings are error-prone (existing bug proves this); SDK structs are compile-time checked |

**Installation:**
```bash
cd backend
go get github.com/twilio/twilio-go@v1.30.3
```

**Version verification:** v1.30.3 published March 2026 per pkg.go.dev (verified during milestone research). No newer version needed for this phase.

## Architecture Patterns

### Recommended Project Structure
```
backend/internal/handlers/
  calls.go           # REWRITE InitiateCall + ADD 3 new handlers
  twilio_util.go     # NEW — extracted validateTwilioSignature + phone normalization helpers
  sms.go             # MODIFY — remove validateTwilioSignature (moved), fix activity type bug

backend/internal/config/
  config.go           # ADD WebhookBaseURL field

backend/migrations/
  016_voice_calling.sql  # ADD personal_phone to twilio_config
```

### Pattern 1: Two-Leg Bridge Outbound Call
**What:** Agent clicks "Call" -> Twilio calls agent's personal phone -> agent answers -> TwiML bridges to client with consent announcement
**When to use:** Every outbound call from the CRM
**Example:**
```go
// Step 1: InitiateCall creates the first leg via Twilio REST API
// To = agent's personal phone (NOT the client)
// Url = TwiML bridge endpoint that will connect to client
client := twilio.NewRestClientWithParams(twilio.ClientParams{
    Username: accountSID,
    Password: authToken,
})
params := &api.CreateCallParams{}
params.SetTo(agentPersonalPhone)
params.SetFrom(twilioPhoneNumber)
params.SetUrl(webhookBaseURL + "/api/calls/twiml/bridge?to=" + url.QueryEscape(clientPhone) + "&call_id=" + callID)
params.SetStatusCallback(webhookBaseURL + "/api/calls/webhook")
params.SetStatusCallbackEvent([]string{"initiated", "ringing", "answered", "completed"})
call, err := client.Api.CreateCall(params)

// Step 2: TwiML bridge endpoint (GET /api/calls/twiml/bridge)
// Twilio hits this when agent answers their phone
// Returns XML:
// <Response>
//   <Say>This call may be recorded for quality purposes.</Say>
//   <Dial callerId="{twilio_number}">
//     <Number>{client_phone}</Number>
//   </Dial>
// </Response>
```

### Pattern 2: Inbound Call Forwarding
**What:** Client calls Twilio number -> webhook looks up agent -> returns TwiML forwarding to agent's personal phone
**When to use:** Every inbound call
**Example:**
```go
// POST /api/calls/inbound-webhook (PUBLIC)
// 1. Validate Twilio signature
// 2. Look up agent by twilio_config.phone_number = called number (To)
// 3. Look up agent's personal_phone from twilio_config
// 4. Match caller to contact via matchContactByPhone
// 5. Insert call_logs row (direction=inbound)
// 6. Return TwiML:
// <Response>
//   <Say>This call may be recorded for quality purposes.</Say>
//   <Dial callerId="{caller_number}">
//     <Number>{agent_personal_phone}</Number>
//   </Dial>
// </Response>
```

### Pattern 3: Webhook Agent Identification + RLS
**What:** Public webhooks derive agent_id from database lookups, then use RLS for subsequent queries
**When to use:** All Twilio webhook handlers (call status, inbound, recording)
**Example:**
```go
// In CallStatusWebhook:
// 1. Parse CallSid from form
// 2. Look up agent_id from call_logs WHERE twilio_sid = CallSid (no RLS needed for this lookup)
// 3. For any agent-scoped writes, use BeginWithRLS(ctx, pool, agentID)
// 4. Never trust agent_id from the webhook payload
```

### Pattern 4: Real-Time Status Updates via Polling
**What:** Frontend polls call status at short intervals during active calls
**When to use:** Communication page call list
**Implementation:** The communication page already uses `refetchInterval: 30000` for call logs. For active call status, reduce to 5-second polling when a call is in-progress, revert to 30s when idle. TanStack Query supports dynamic `refetchInterval` via a function.
```typescript
refetchInterval: (query) => {
  const hasActiveCalls = query.state.data?.calls?.some(
    c => ['initiated', 'ringing', 'in-progress'].includes(c.status)
  );
  return hasActiveCalls ? 5000 : 30000;
}
```

### Anti-Patterns to Avoid
- **Inline TwiML strings:** The existing `data.Set("Twiml", "<Response>...")` pattern is what caused the bridge bug. Use `twilio-go` TwiML structs or at minimum use the SDK's `Url` parameter to point to a TwiML endpoint.
- **Logging activity on initiation:** Currently logs "Outbound call to..." when the call is created, before it connects. Move activity logging to `CallStatusWebhook` when status = `completed`.
- **Trusting webhook payloads for agent identity:** Always derive `agent_id` from your own database via `CallSid` lookup.
- **Direct pool queries without RLS in authenticated contexts:** Use `BeginWithRLS()` for all agent-scoped queries in `InitiateCall`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TwiML XML generation | String concatenation / `fmt.Sprintf` | `twilio-go` `twiml` package structs | The existing inline TwiML string has a structural bug. SDK structs are type-safe. |
| Twilio REST API calls | Raw `http.DefaultClient` POST | `twilio-go` `Api.CreateCall()` | SDK handles auth, retries, error parsing, URL construction |
| Twilio signature validation | Custom HMAC from scratch | Extract existing `validateTwilioSignature` from `sms.go` | Already correctly implemented, just needs to be shared |
| Phone number normalization | New function | Existing `normalizePhone` + `matchContactByPhone` in `sms.go` | Already handles US numbers, already tested via SMS flow |

**Key insight:** The existing SMS infrastructure (`validateTwilioSignature`, `matchContactByPhone`, `normalizePhone`, agent lookup by phone number) solves most of the webhook plumbing. Extract and reuse, do not rewrite.

## Common Pitfalls

### Pitfall 1: TwiML Bridge Calls Client Twice
**What goes wrong:** Setting REST API `To` = client AND TwiML `<Dial>` = client results in the client getting called but agent never connected.
**Why it happens:** Confusion about two-leg bridge. REST API `To` is WHO TWILIO CALLS FIRST (agent). TwiML `<Dial>` is WHO TO BRIDGE TO (client).
**How to avoid:** REST API `To` = agent's personal phone. TwiML `<Dial><Number>` = client's phone. Never the same number in both.
**Warning signs:** Calls show "completed" with 0 duration, or agent reports never receiving a call.

### Pitfall 2: Missing WEBHOOK_BASE_URL
**What goes wrong:** Twilio cannot reach localhost. TwiML endpoint returns 11200 errors in Twilio debugger. All calls fail silently.
**Why it happens:** StatusCallback and Url parameters require publicly accessible HTTPS URLs. `localhost:8080` is not reachable from Twilio's servers.
**How to avoid:** Add `WEBHOOK_BASE_URL` env var. Validate on startup that it is set and starts with `https://`. Use ngrok with stable subdomain in dev.
**Warning signs:** Twilio debugger shows 11200 HTTP retrieval failure. No webhook POSTs received by backend.

### Pitfall 3: Missing StatusCallback on Outbound Calls
**What goes wrong:** `call_logs` rows stuck at `status: "initiated"` forever. Duration always 0. `ended_at` always NULL.
**Why it happens:** StatusCallback is optional in Twilio API. Code "works" without it -- you get a call SID -- but never learn the outcome.
**How to avoid:** Always set `StatusCallback` and `StatusCallbackEvent` on every outbound call. The existing `CallStatusWebhook` handler already handles updates.
**Warning signs:** All call_logs have identical status.

### Pitfall 4: Recording Consent Missing from Day One
**What goes wrong:** Recordings made without consent announcement create legal liability in 12+ two-party consent US states.
**Why it happens:** Developer focuses on technical implementation, forgets compliance. Hard to retrofit after recordings exist.
**How to avoid:** Include `<Say>This call may be recorded for quality purposes.</Say>` in TwiML before every `<Dial>`. Do this in Phase 4 even though recording is not enabled until Phase 5.
**Warning signs:** No `<Say>` in TwiML before `<Dial>`.

### Pitfall 5: SMS Activity Type Bug Masks Real Call Activities
**What goes wrong:** SMS activities logged as type `'call'` (sms.go:222). When real call activities also use type `'call'`, the activity feed becomes unreliable.
**Why it happens:** Copy-paste error in the SMS handler. The hardcoded string `'call'` should be `'sms'`.
**How to avoid:** Fix to `'sms'` before adding more call-related activities.
**Warning signs:** Activity feed shows "SMS sent: ..." entries with call icon.

### Pitfall 6: Webhook Voice URL Not Configured on Twilio Number
**What goes wrong:** Inbound calls to the Twilio number play a default error message instead of forwarding to agent.
**Why it happens:** Twilio numbers have SEPARATE Voice URL and SMS URL configurations. SMS URL is already configured. Voice URL defaults to Twilio's error response.
**How to avoid:** When configuring Twilio (SMSConfigure or a new handler), also set the Voice URL on the Twilio number via the REST API. Or document that the agent must configure it in the Twilio console.
**Warning signs:** Inbound calls play "An application error has occurred."

## Code Examples

### Migration: 016_voice_calling.sql
```sql
-- Add agent's personal phone number for two-leg bridge calling
ALTER TABLE twilio_config ADD COLUMN personal_phone TEXT;

-- Note: No recording columns yet -- those come in Phase 5 (REC-*)
-- This migration only adds what Phase 4 needs
```

### Config: Add WEBHOOK_BASE_URL
```go
// config.go
type Config struct {
    // ... existing fields ...
    WebhookBaseURL string
}

// In Load():
cfg.WebhookBaseURL = os.Getenv("WEBHOOK_BASE_URL")
// Validate: must be set and HTTPS in production
```

### Handler: Rewritten InitiateCall (Two-Leg Bridge)
```go
func InitiateCall(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        agentID := middleware.AgentUUIDFromContext(r.Context())
        // ... parse body (to, contact_id) ...

        // Fetch Twilio config INCLUDING personal_phone
        var accountSID, authToken, fromNumber, personalPhone string
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID) // FIX: use RLS
        defer tx.Rollback(r.Context())
        tx.QueryRow(r.Context(),
            `SELECT account_sid, auth_token, phone_number, personal_phone
             FROM twilio_config WHERE agent_id = $1`, agentID,
        ).Scan(&accountSID, &authToken, &fromNumber, &personalPhone)

        if personalPhone == "" {
            respondError(w, http.StatusBadRequest, "Personal phone not configured.")
            return
        }

        // Insert call_logs FIRST to get call_id
        var callID string
        tx.QueryRow(r.Context(),
            `INSERT INTO call_logs (agent_id, contact_id, from_number, to_number, direction, status, started_at)
             VALUES ($1, $2, $3, $4, 'outbound', 'initiated', NOW()) RETURNING id`,
            agentID, contactID, fromNumber, body.To,
        ).Scan(&callID)
        tx.Commit(r.Context())

        // Create two-leg call: Twilio calls AGENT first
        client := twilio.NewRestClientWithParams(twilio.ClientParams{
            Username: accountSID, Password: authToken,
        })
        params := &api.CreateCallParams{}
        params.SetTo(personalPhone)
        params.SetFrom(fromNumber)
        params.SetUrl(cfg.WebhookBaseURL + "/api/calls/twiml/bridge?to=" +
            url.QueryEscape(body.To) + "&call_id=" + callID)
        params.SetStatusCallback(cfg.WebhookBaseURL + "/api/calls/webhook")
        params.SetStatusCallbackEvent([]string{"initiated", "ringing", "answered", "completed"})

        call, err := client.Api.CreateCall(params)
        // ... update call_logs with twilio_sid ...
    }
}
```

### Handler: TwiML Bridge Endpoint
```go
// GET /api/calls/twiml/bridge?to=+15551234567&call_id=uuid
// PUBLIC — Twilio hits this when agent answers. Validates Twilio signature.
func TwiMLBridge(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Validate Twilio signature (look up auth_token via call_id -> agent_id)
        clientPhone := r.URL.Query().Get("to")
        callID := r.URL.Query().Get("call_id")
        // Look up agent's Twilio number for callerId
        // ...

        // Generate TwiML with consent announcement
        response := &twiml.VoiceResponse{}
        response.Say("This call may be recorded for quality purposes.")
        dial := response.Dial()
        dial.SetCallerId(twilioNumber) // Client sees Twilio number, not agent's personal
        dial.Number(clientPhone)

        w.Header().Set("Content-Type", "text/xml")
        xml, _ := response.ToXML()
        w.Write([]byte(xml))
    }
}
```

### Handler: Inbound Call Webhook
```go
// POST /api/calls/inbound-webhook
// PUBLIC — Twilio hits this when someone calls the Twilio number
func InboundCallWebhook(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        r.ParseForm()

        calledNumber := r.FormValue("To")    // The Twilio number
        callerNumber := r.FormValue("From")  // The client calling
        callSID := r.FormValue("CallSid")

        // Look up agent by Twilio phone number (same pattern as SMSWebhook)
        var agentID, authToken, personalPhone string
        pool.QueryRow(r.Context(),
            `SELECT agent_id, auth_token, personal_phone FROM twilio_config WHERE phone_number = $1`,
            calledNumber,
        ).Scan(&agentID, &authToken, &personalPhone)

        // Validate Twilio signature
        validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature"))

        // Match caller to contact
        contactID := matchContactByPhone(r.Context(), pool, agentID, callerNumber)

        // Insert call_logs row (inbound)
        pool.Exec(r.Context(), /* INSERT INTO call_logs ... direction='inbound' */)

        // Return forwarding TwiML
        response := &twiml.VoiceResponse{}
        response.Say("This call may be recorded for quality purposes.")
        dial := response.Dial()
        dial.SetCallerId(callerNumber) // Agent sees who is calling
        dial.Number(personalPhone)

        w.Header().Set("Content-Type", "text/xml")
        xml, _ := response.ToXML()
        w.Write([]byte(xml))
    }
}
```

### Fix: SMS Activity Type Bug
```go
// sms.go line 222 — BEFORE:
pool.Exec(r.Context(),
    `INSERT INTO activities (agent_id, contact_id, type, body) VALUES ($1, $2, 'call', $3)`,
    // ...
)

// AFTER:
pool.Exec(r.Context(),
    `INSERT INTO activities (agent_id, contact_id, type, body) VALUES ($1, $2, 'sms', $3)`,
    // ...
)
```

### Fix: CallStatusWebhook with Signature Validation + RLS
```go
func CallStatusWebhook(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        r.ParseForm()
        callSID := r.FormValue("CallSid")

        // Look up agent_id from call_logs (no RLS needed for this lookup)
        var agentID string
        pool.QueryRow(r.Context(),
            `SELECT agent_id FROM call_logs WHERE twilio_sid = $1`, callSID,
        ).Scan(&agentID)

        // Now get auth_token to validate signature
        var authToken string
        pool.QueryRow(r.Context(),
            `SELECT auth_token FROM twilio_config WHERE agent_id = $1`, agentID,
        ).Scan(&authToken)

        // Validate Twilio signature
        if !validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
            respondError(w, http.StatusForbidden, "invalid signature")
            return
        }

        // Update with RLS
        tx, _ := database.BeginWithRLS(r.Context(), pool, agentID)
        defer tx.Rollback(r.Context())
        tx.Exec(r.Context(),
            `UPDATE call_logs SET status = $1, duration = $2, ended_at = $3 WHERE twilio_sid = $4`,
            callStatus, duration, endedAt, callSID,
        )
        tx.Commit(r.Context())

        w.WriteHeader(http.StatusNoContent)
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw HTTP POST to Twilio API | `twilio-go` SDK with typed params | SDK v1.x (2022+) | Eliminates URL construction errors, provides typed TwiML, proper error handling |
| Inline TwiML strings | TwiML struct generation via SDK | SDK v1.x | Prevents structural XML bugs like the current bridge issue |
| Single-leg calls (call client directly) | Two-leg bridge (call agent first) | Industry standard | Agent must be on the call; this is how HubSpot/Close/FollowUpBoss all work |

**Deprecated/outdated:**
- Inline `Twiml` parameter on REST API calls: Works but bypasses TwiML validation. Use `Url` pointing to a TwiML endpoint instead.
- Raw `http.DefaultClient` for Twilio API: Works but misses SDK features (retries, typed responses, error parsing).

## Open Questions

1. **Voice webhook URL on Twilio number -- programmatic or manual?**
   - What we know: SMS webhook was configured manually in Twilio console. Voice webhook needs to be set too.
   - What's unclear: Should `SMSConfigure` (or a new handler) also programmatically set the Voice URL via Twilio API? Or document for agent to set in console?
   - Recommendation: Programmatically set both Voice URL and SMS URL when agent configures Twilio. Use `twilio-go` SDK to update the IncomingPhoneNumber resource. This is cleaner and prevents the Pitfall 6 scenario.

2. **Should activity logging move entirely to webhook completion?**
   - What we know: Currently logs on initiation (premature -- call may never connect). Should log on `completed` status.
   - What's unclear: Should we also log on `no-answer`, `busy`, `failed` for agent visibility?
   - Recommendation: Log activity on any terminal status (`completed`, `no-answer`, `busy`, `failed`). Use different body text: "Call to X (2:30)" vs "Missed call to X (no answer)".

3. **TwiML bridge endpoint: GET or POST?**
   - What we know: Twilio defaults to POST for webhook requests. The `Url` parameter receives a POST.
   - What's unclear: Research docs show GET in examples but Twilio sends POST by default.
   - Recommendation: Support both GET and POST on the bridge endpoint. Twilio defaults to POST. Register the route as both `r.Get` and `r.Post` or use `r.HandleFunc`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing with real Twilio account + ngrok |
| Config file | none -- no automated test framework currently |
| Quick run command | `curl -X POST localhost:8080/api/calls/initiate -H "Authorization: Bearer $TOKEN" -d '{"to":"+1..."}' ` |
| Full suite command | Manual end-to-end with real phones |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-01 | Personal phone persists in DB | smoke | `curl GET /api/sms/status` (check personal_phone in response) | No -- Wave 0 |
| CALL-02 | Outbound two-leg bridge connects | manual-only | Real phone test via ngrok | N/A -- requires real Twilio |
| CALL-03 | Inbound forwarding to agent phone | manual-only | Call Twilio number, verify agent phone rings | N/A -- requires real Twilio |
| CALL-04 | Consent announcement plays | manual-only | Listen for "This call may be recorded" during call | N/A |
| CALL-05 | Status updates in real-time | smoke | Check `call_logs` status after call completes | No -- Wave 0 |
| CALL-06 | Signature validation blocks invalid requests | unit | `curl POST /api/calls/webhook` without signature -> 403 | No -- Wave 0 |
| CALL-07 | SMS activity type fixed, RLS in call handlers | unit | Check activity type after SMS send; verify RLS on call insert | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** Manual smoke test of affected endpoint
- **Per wave merge:** Full end-to-end call flow test with real phones
- **Phase gate:** All 7 requirements verified before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No test infrastructure exists -- all testing is manual
- [ ] Create a simple test script that validates webhook signature rejection (can be automated)
- [ ] Create a curl-based smoke test script for API endpoints

## Sources

### Primary (HIGH confidence)
- Existing codebase: `calls.go`, `sms.go`, `main.go`, `config.go`, `015_calls.sql` -- direct source of truth for current bugs and patterns
- [Twilio TwiML Dial verb](https://www.twilio.com/docs/voice/twiml/dial) -- two-leg bridge pattern, Record attribute, callerId
- [Twilio Webhook Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) -- X-Twilio-Signature HMAC-SHA1 validation
- [twilio-go SDK v1.30.3 (pkg.go.dev)](https://pkg.go.dev/github.com/twilio/twilio-go/twiml) -- TwiML struct generation
- [Twilio Recording Legal Considerations](https://support.twilio.com/hc/en-us/articles/360011522553) -- two-party consent states

### Secondary (MEDIUM confidence)
- [Twilio Inbound Call Forwarding](https://support.twilio.com/hc/en-us/articles/223179908) -- forwarding pattern
- [Two-Party Consent State Laws (HubSpot)](https://knowledge.hubspot.com/calling/what-are-the-call-recording-laws) -- compliance requirements
- Milestone research documents: ARCHITECTURE.md, PITFALLS.md, STACK.md, FEATURES.md, SUMMARY.md

### Tertiary (LOW confidence)
- `twilio-go` v1.30.3 exact version -- research states March 2026 publish date but web search could not independently verify the exact latest version

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- `twilio-go` is the official Twilio Go SDK, well-documented
- Architecture: HIGH -- two-leg bridge is the industry standard pattern, well-documented by Twilio and used by all CRM calling products
- Pitfalls: HIGH -- all pitfalls identified from actual bugs in the existing codebase or from Twilio official documentation
- Code examples: HIGH -- based on direct reading of existing handlers and Twilio docs

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, Twilio APIs change slowly)
