package handlers

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	twilio "github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// InitiateCall starts an outbound call via the two-leg bridge pattern.
// Twilio calls the agent's personal phone first. When the agent answers,
// TwiMLBridge plays a consent announcement and bridges to the client.
// POST /api/calls/initiate
func InitiateCall(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var body struct {
			To        string  `json:"to"`
			ContactID *string `json:"contact_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if body.To == "" {
			respondError(w, http.StatusBadRequest, "to is required")
			return
		}

		if cfg.WebhookBaseURL == "" {
			respondError(w, http.StatusInternalServerError, "WEBHOOK_BASE_URL not configured")
			return
		}

		// Fetch Twilio config INCLUDING personal_phone
		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var accountSID, authToken, fromNumber string
		var personalPhone *string
		err = tx.QueryRow(r.Context(),
			`SELECT account_sid, auth_token, phone_number, personal_phone
			 FROM twilio_config WHERE agent_id = $1`, agentID,
		).Scan(&accountSID, &authToken, &fromNumber, &personalPhone)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Twilio not configured. Please add your Twilio credentials in Settings.")
			return
		}

		if personalPhone == nil || *personalPhone == "" {
			respondError(w, http.StatusBadRequest, "Personal phone number not configured. Please add it in Settings.")
			return
		}

		// Auto-match contact by phone if contact_id not provided
		contactID := body.ContactID
		if contactID == nil {
			contactID = matchContactByPhone(r.Context(), pool, agentID, body.To)
		}

		// Insert call_logs FIRST to get call_id
		now := time.Now()
		var callID string
		err = tx.QueryRow(r.Context(),
			`INSERT INTO call_logs (agent_id, contact_id, from_number, to_number, direction, status, started_at)
			 VALUES ($1, $2, $3, $4, 'outbound', 'initiated', $5) RETURNING id`,
			agentID, contactID, fromNumber, body.To, now,
		).Scan(&callID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create call record")
			return
		}
		tx.Commit(r.Context())

		// Create two-leg call: Twilio calls AGENT's personal phone first
		client := twilio.NewRestClientWithParams(twilio.ClientParams{
			Username: accountSID,
			Password: authToken,
		})
		params := &api.CreateCallParams{}
		params.SetTo(*personalPhone)
		params.SetFrom(fromNumber)
		bridgeURL := cfg.WebhookBaseURL + "/api/calls/twiml/bridge?to=" +
			url.QueryEscape(body.To) + "&call_id=" + callID
		params.SetUrl(bridgeURL)
		params.SetStatusCallback(cfg.WebhookBaseURL + "/api/calls/webhook")
		params.SetStatusCallbackEvent([]string{"initiated", "ringing", "answered", "completed"})

		call, err := client.Api.CreateCall(params)
		if err != nil {
			slog.Error("twilio call failed", "error", err)
			// Update call_logs to failed
			pool.Exec(r.Context(),
				`UPDATE call_logs SET status = 'failed' WHERE id = $1`, callID)
			respondError(w, http.StatusBadGateway, "Failed to initiate call via Twilio")
			return
		}

		// Update call_logs with twilio_sid
		pool.Exec(r.Context(),
			`UPDATE call_logs SET twilio_sid = $1, status = $2 WHERE id = $3`,
			*call.Sid, *call.Status, callID)

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"id":      callID,
			"sid":     *call.Sid,
			"status":  *call.Status,
			"message": "Call initiated — your phone will ring shortly",
		})
	}
}

// TwiMLBridge returns TwiML to bridge the agent to the client.
// GET/POST /api/calls/twiml/bridge?to=+15551234567&call_id=uuid
// PUBLIC — Twilio hits this when agent answers their phone.
func TwiMLBridge(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clientPhone := r.URL.Query().Get("to")
		callID := r.URL.Query().Get("call_id")

		if clientPhone == "" || callID == "" {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>An error occurred. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Look up the Twilio number (callerId for the client leg) via call_id
		var fromNumber, agentID, authToken string
		err := pool.QueryRow(r.Context(),
			`SELECT cl.from_number, cl.agent_id, tc.auth_token
			 FROM call_logs cl
			 JOIN twilio_config tc ON tc.agent_id = cl.agent_id
			 WHERE cl.id = $1`, callID,
		).Scan(&fromNumber, &agentID, &authToken)
		if err != nil {
			slog.Error("twiml bridge: call_id lookup failed", "call_id", callID, "error", err)
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>Call not found. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Validate Twilio signature
		if r.Method == "POST" {
			r.ParseForm()
			requestURL := "https://" + r.Host + r.URL.String()
			if !validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
				respondError(w, http.StatusForbidden, "invalid Twilio signature")
				return
			}
		}

		// Return TwiML: consent announcement then bridge to client
		twimlXML := fmt.Sprintf(
			`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This call may be recorded for quality purposes.</Say>
  <Dial callerId="%s">
    <Number>%s</Number>
  </Dial>
</Response>`, xmlEscape(fromNumber), xmlEscape(clientPhone))

		w.Header().Set("Content-Type", "text/xml")
		w.Write([]byte(twimlXML))
	}
}

// InboundCallWebhook handles incoming calls to the Twilio number.
// POST /api/calls/inbound-webhook
// PUBLIC — Twilio hits this when someone calls the Twilio number.
func InboundCallWebhook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>An error occurred.</Say><Hangup/></Response>`))
			return
		}

		calledNumber := r.FormValue("To")   // The Twilio number that was called
		callerNumber := r.FormValue("From")  // The person calling in
		callSID := r.FormValue("CallSid")

		// Look up agent by Twilio phone number (same pattern as SMSWebhook)
		var agentID, authToken string
		var personalPhone *string
		err := pool.QueryRow(r.Context(),
			`SELECT agent_id, auth_token, personal_phone FROM twilio_config WHERE phone_number = $1`,
			calledNumber,
		).Scan(&agentID, &authToken, &personalPhone)
		if err != nil {
			slog.Warn("inbound call: no agent found for number", "to", calledNumber)
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>This number is not configured. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Validate Twilio signature
		requestURL := "https://" + r.Host + r.URL.String()
		if !validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
			respondError(w, http.StatusForbidden, "invalid Twilio signature")
			return
		}

		if personalPhone == nil || *personalPhone == "" {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>The agent has not configured call forwarding. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Match caller to contact
		contactID := matchContactByPhone(r.Context(), pool, agentID, callerNumber)

		// Insert inbound call_logs row
		pool.Exec(r.Context(),
			`INSERT INTO call_logs (agent_id, twilio_sid, contact_id, from_number, to_number, direction, status, started_at)
			 VALUES ($1, $2, $3, $4, $5, 'inbound', 'ringing', NOW())`,
			agentID, callSID, contactID, callerNumber, calledNumber,
		)

		// Return TwiML: consent announcement then forward to agent's personal phone
		// callerId = callerNumber so agent sees who is calling
		twimlXML := fmt.Sprintf(
			`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This call may be recorded for quality purposes.</Say>
  <Dial callerId="%s">
    <Number>%s</Number>
  </Dial>
</Response>`, xmlEscape(callerNumber), xmlEscape(*personalPhone))

		w.Header().Set("Content-Type", "text/xml")
		w.Write([]byte(twimlXML))
	}
}

// xmlEscape escapes a string for safe inclusion in XML attributes/content.
func xmlEscape(s string) string {
	var buf strings.Builder
	xml.EscapeText(&buf, []byte(s))
	return buf.String()
}

// ListCallLogs returns paginated call history.
// GET /api/calls
func ListCallLogs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		contactID := r.URL.Query().Get("contact_id")
		direction := r.URL.Query().Get("direction")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 25
		}
		offset := (page - 1) * limit

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		whereExpr := "1=1"
		var args []interface{}

		if contactID != "" {
			args = append(args, contactID)
			whereExpr += fmt.Sprintf(" AND contact_id = $%d", len(args))
		}
		if direction != "" {
			args = append(args, direction)
			whereExpr += fmt.Sprintf(" AND direction = $%d", len(args))
		}

		var total int
		countArgs := append([]interface{}{}, args...)
		err = tx.QueryRow(r.Context(),
			"SELECT COUNT(*) FROM call_logs WHERE "+whereExpr, countArgs...,
		).Scan(&total)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "count error")
			return
		}

		dataArgs := append(append([]interface{}{}, args...), limit, offset)
		dataSQL := fmt.Sprintf(
			`SELECT cl.id, cl.twilio_sid, cl.contact_id, cl.from_number, cl.to_number,
			        cl.direction, cl.status, cl.duration, cl.started_at, cl.ended_at, cl.created_at,
			        COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name
			 FROM call_logs cl
			 LEFT JOIN contacts c ON c.id = cl.contact_id
			 WHERE %s
			 ORDER BY cl.started_at DESC
			 LIMIT $%d OFFSET $%d`,
			whereExpr, len(dataArgs)-1, len(dataArgs),
		)

		rows, err := tx.Query(r.Context(), dataSQL, dataArgs...)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		type CallLog struct {
			ID          string     `json:"id"`
			TwilioSID   *string    `json:"twilio_sid"`
			ContactID   *string    `json:"contact_id"`
			FromNumber  string     `json:"from_number"`
			ToNumber    string     `json:"to_number"`
			Direction   string     `json:"direction"`
			Status      string     `json:"status"`
			Duration    int        `json:"duration"`
			StartedAt   time.Time  `json:"started_at"`
			EndedAt     *time.Time `json:"ended_at"`
			CreatedAt   time.Time  `json:"created_at"`
			ContactName string     `json:"contact_name"`
		}

		var calls []CallLog
		for rows.Next() {
			var cl CallLog
			err := rows.Scan(
				&cl.ID, &cl.TwilioSID, &cl.ContactID, &cl.FromNumber, &cl.ToNumber,
				&cl.Direction, &cl.Status, &cl.Duration, &cl.StartedAt, &cl.EndedAt, &cl.CreatedAt,
				&cl.ContactName,
			)
			if err != nil {
				continue
			}
			calls = append(calls, cl)
		}

		tx.Commit(r.Context())

		if calls == nil {
			calls = []CallLog{}
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"calls": calls,
			"total": total,
		})
	}
}

// GetCallLog returns a single call record.
// GET /api/calls/{id}
func GetCallLog(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		callID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		type CallLog struct {
			ID          string     `json:"id"`
			TwilioSID   *string    `json:"twilio_sid"`
			ContactID   *string    `json:"contact_id"`
			FromNumber  string     `json:"from_number"`
			ToNumber    string     `json:"to_number"`
			Direction   string     `json:"direction"`
			Status      string     `json:"status"`
			Duration    int        `json:"duration"`
			StartedAt   time.Time  `json:"started_at"`
			EndedAt     *time.Time `json:"ended_at"`
			CreatedAt   time.Time  `json:"created_at"`
			ContactName string     `json:"contact_name"`
		}

		var cl CallLog
		err = tx.QueryRow(r.Context(),
			`SELECT cl.id, cl.twilio_sid, cl.contact_id, cl.from_number, cl.to_number,
			        cl.direction, cl.status, cl.duration, cl.started_at, cl.ended_at, cl.created_at,
			        COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name
			 FROM call_logs cl
			 LEFT JOIN contacts c ON c.id = cl.contact_id
			 WHERE cl.id = $1`,
			callID,
		).Scan(
			&cl.ID, &cl.TwilioSID, &cl.ContactID, &cl.FromNumber, &cl.ToNumber,
			&cl.Direction, &cl.Status, &cl.Duration, &cl.StartedAt, &cl.EndedAt, &cl.CreatedAt,
			&cl.ContactName,
		)
		if err != nil {
			respondError(w, http.StatusNotFound, "call not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, cl)
	}
}

// SyncCallLogs pulls recent call history from Twilio API.
// POST /api/calls/sync
func SyncCallLogs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		// Fetch Twilio config
		var accountSID, authToken, phoneNumber string
		err := pool.QueryRow(r.Context(),
			`SELECT account_sid, auth_token, phone_number FROM twilio_config WHERE agent_id = $1`,
			agentID,
		).Scan(&accountSID, &authToken, &phoneNumber)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Twilio not configured")
			return
		}

		// Fetch calls from Twilio API
		twilioURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Calls.json?PageSize=50", accountSID)

		req, err := http.NewRequestWithContext(r.Context(), "GET", twilioURL, nil)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create request")
			return
		}
		req.SetBasicAuth(accountSID, authToken)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			slog.Error("twilio call sync failed", "error", err)
			respondError(w, http.StatusInternalServerError, "failed to fetch calls from Twilio")
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			respondError(w, http.StatusBadGateway, "Twilio API error")
			return
		}

		var twilioResp struct {
			Calls []struct {
				SID       string `json:"sid"`
				From      string `json:"from"`
				To        string `json:"to"`
				Status    string `json:"status"`
				Direction string `json:"direction"`
				Duration  string `json:"duration"`
				StartTime string `json:"start_time"`
				EndTime   string `json:"end_time"`
			} `json:"calls"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&twilioResp); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to parse Twilio response")
			return
		}

		// Build contact phone map for matching
		contactPhoneMap := buildContactPhoneMap(r.Context(), pool, agentID)

		synced := 0
		for _, call := range twilioResp.Calls {
			direction := "outbound"
			if call.Direction == "inbound" {
				direction = "inbound"
			}

			startedAt, _ := time.Parse(time.RFC1123Z, call.StartTime)
			if startedAt.IsZero() {
				startedAt = time.Now()
			}

			var endedAt *time.Time
			if call.EndTime != "" {
				t, err := time.Parse(time.RFC1123Z, call.EndTime)
				if err == nil {
					endedAt = &t
				}
			}

			duration, _ := strconv.Atoi(call.Duration)

			otherNumber := call.From
			if direction == "outbound" {
				otherNumber = call.To
			}
			contactID := matchPhoneInMap(contactPhoneMap, otherNumber)

			_, err := pool.Exec(r.Context(),
				`INSERT INTO call_logs (agent_id, twilio_sid, contact_id, from_number, to_number, direction, status, duration, started_at, ended_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
				 ON CONFLICT (twilio_sid) DO UPDATE SET status = EXCLUDED.status, duration = EXCLUDED.duration, ended_at = EXCLUDED.ended_at`,
				agentID, call.SID, contactID, call.From, call.To, direction, call.Status, duration, startedAt, endedAt,
			)
			if err != nil {
				slog.Warn("call insert failed", "sid", call.SID, "error", err)
				continue
			}
			synced++
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"synced": synced,
		})
	}
}

// CallStatusWebhook receives call status updates from Twilio.
// POST /api/calls/webhook (PUBLIC — no Clerk auth, validates Twilio signature)
func CallStatusWebhook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			respondError(w, http.StatusBadRequest, "invalid form data")
			return
		}

		callSID := r.FormValue("CallSid")
		callStatus := r.FormValue("CallStatus")
		durationStr := r.FormValue("CallDuration")

		if callSID == "" {
			respondError(w, http.StatusBadRequest, "missing CallSid")
			return
		}

		// Look up agent_id from call_logs (no RLS needed for this lookup)
		var agentID string
		err := pool.QueryRow(r.Context(),
			`SELECT agent_id FROM call_logs WHERE twilio_sid = $1`, callSID,
		).Scan(&agentID)
		if err != nil {
			slog.Warn("call status webhook: unknown CallSid", "sid", callSID)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Get auth_token for signature validation
		var authToken string
		err = pool.QueryRow(r.Context(),
			`SELECT auth_token FROM twilio_config WHERE agent_id = $1`, agentID,
		).Scan(&authToken)
		if err != nil {
			slog.Warn("call status webhook: no twilio config for agent", "agent_id", agentID)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Validate Twilio signature
		requestURL := "https://" + r.Host + r.URL.String()
		if !validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
			respondError(w, http.StatusForbidden, "invalid Twilio signature")
			return
		}

		duration, _ := strconv.Atoi(durationStr)

		var endedAt *time.Time
		if callStatus == "completed" || callStatus == "busy" || callStatus == "no-answer" || callStatus == "canceled" || callStatus == "failed" {
			now := time.Now()
			endedAt = &now
		}

		// Update with RLS
		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			slog.Error("call status webhook: RLS begin failed", "error", err)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		defer tx.Rollback(r.Context())

		tx.Exec(r.Context(),
			`UPDATE call_logs SET status = $1, duration = $2, ended_at = $3 WHERE twilio_sid = $4`,
			callStatus, duration, endedAt, callSID,
		)

		// Log activity on terminal status if contact is known
		if callStatus == "completed" || callStatus == "no-answer" || callStatus == "busy" || callStatus == "failed" {
			var contactID *string
			var toNumber, direction string
			tx.QueryRow(r.Context(),
				`SELECT contact_id, to_number, direction FROM call_logs WHERE twilio_sid = $1`, callSID,
			).Scan(&contactID, &toNumber, &direction)

			if contactID != nil && *contactID != "" {
				var body string
				if callStatus == "completed" {
					mins := duration / 60
					secs := duration % 60
					body = fmt.Sprintf("Call %s (%d:%02d)", toNumber, mins, secs)
				} else {
					body = fmt.Sprintf("Call to %s (%s)", toNumber, callStatus)
				}
				if direction == "inbound" {
					body = "Inbound call from " + toNumber
					if callStatus != "completed" {
						body += " (" + callStatus + ")"
					}
				}
				tx.Exec(r.Context(),
					`INSERT INTO activities (agent_id, contact_id, type, body) VALUES ($1, $2, 'call', $3)`,
					agentID, *contactID, body,
				)
			}
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}
