package handlers

import (
	"context"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
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

		// Fetch Twilio config (decrypts auth_token automatically)
		accountSID, authToken, fromNumber, personalPhoneStr, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Twilio not configured. Please add your Twilio credentials in Settings.")
			return
		}

		if personalPhoneStr == "" {
			respondError(w, http.StatusBadRequest, "Personal phone number not configured. Please add it in Settings.")
			return
		}

		// Auto-match contact by phone if contact_id not provided
		contactID := body.ContactID
		if contactID == nil {
			contactID = matchContactByPhone(r.Context(), pool, agentID, body.To)
		}

		// Insert call_logs FIRST to get call_id
		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

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
		params.SetTo(personalPhoneStr)
		params.SetFrom(fromNumber)
		bridgeURL := cfg.WebhookBaseURL + "/api/calls/twiml/bridge?to=" +
			url.QueryEscape(body.To) + "&call_id=" + callID
		params.SetUrl(bridgeURL)
		params.SetStatusCallback(cfg.WebhookBaseURL + "/api/calls/webhook")
		params.SetStatusCallbackEvent([]string{"initiated", "ringing", "answered", "completed"})

		// Async answering machine detection
		params.SetMachineDetection("DetectMessageEnd")
		params.SetAsyncAmd("true")
		params.SetAsyncAmdStatusCallback(cfg.WebhookBaseURL + "/api/calls/amd-webhook")
		params.SetAsyncAmdStatusCallbackMethod("POST")

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
func TwiMLBridge(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clientPhone := r.URL.Query().Get("to")
		callID := r.URL.Query().Get("call_id")

		if clientPhone == "" || callID == "" {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>An error occurred. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Look up from_number and agent_id from call_logs
		var fromNumber, agentID string
		err := pool.QueryRow(r.Context(),
			`SELECT from_number, agent_id FROM call_logs WHERE id = $1`, callID,
		).Scan(&fromNumber, &agentID)
		if err != nil {
			slog.Error("twiml bridge: call_id lookup failed", "call_id", callID, "error", err)
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>Call not found. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Get decrypted auth_token via helper
		_, authToken, _, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err != nil {
			slog.Error("twiml bridge: twilio config lookup failed", "agent_id", agentID, "error", err)
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>Configuration error. Goodbye.</Say><Hangup/></Response>`))
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

		// Return TwiML: consent announcement then bridge to client with dual-channel recording
		twimlXML := fmt.Sprintf(
			`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This call may be recorded for quality purposes.</Say>
  <Dial callerId="%s" record="record-from-answer-dual" recordingStatusCallback="%s/api/calls/recording-webhook" recordingStatusCallbackEvent="completed">
    <Number>%s</Number>
  </Dial>
</Response>`, xmlEscape(fromNumber), xmlEscape(cfg.WebhookBaseURL), xmlEscape(clientPhone))

		w.Header().Set("Content-Type", "text/xml")
		w.Write([]byte(twimlXML))
	}
}

// InboundCallWebhook handles incoming calls to the Twilio number.
// POST /api/calls/inbound-webhook
// PUBLIC — Twilio hits this when someone calls the Twilio number.
func InboundCallWebhook(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>An error occurred.</Say><Hangup/></Response>`))
			return
		}

		calledNumber := r.FormValue("To")   // The Twilio number that was called
		callerNumber := r.FormValue("From")  // The person calling in
		callSID := r.FormValue("CallSid")

		// Look up agent by Twilio phone number
		var agentID string
		err := pool.QueryRow(r.Context(),
			`SELECT agent_id FROM twilio_config WHERE phone_number = $1`,
			calledNumber,
		).Scan(&agentID)
		if err != nil {
			slog.Warn("inbound call: no agent found for number", "to", calledNumber)
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>This number is not configured. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Get decrypted auth_token and personal_phone via helper
		_, authToken, _, personalPhoneStr, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err != nil {
			slog.Warn("inbound call: twilio config error", "agent_id", agentID, "error", err)
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>Configuration error. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Validate Twilio signature
		requestURL := "https://" + r.Host + r.URL.String()
		if !validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
			respondError(w, http.StatusForbidden, "invalid Twilio signature")
			return
		}

		if personalPhoneStr == "" {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say>The agent has not configured call forwarding. Goodbye.</Say><Hangup/></Response>`))
			return
		}

		// Match caller to contact
		contactID := matchContactByPhone(r.Context(), pool, agentID, callerNumber)

		// Insert inbound call_logs row (RETURNING id for whisper URL)
		var callID string
		err = pool.QueryRow(r.Context(),
			`INSERT INTO call_logs (agent_id, twilio_sid, contact_id, from_number, to_number, direction, status, started_at)
			 VALUES ($1, $2, $3, $4, $5, 'inbound', 'ringing', NOW()) RETURNING id`,
			agentID, callSID, contactID, callerNumber, calledNumber,
		).Scan(&callID)
		if err != nil {
			slog.Error("inbound call: failed to insert call log", "error", err)
		}

		// Return TwiML: consent announcement then forward to agent's personal phone with dual-channel recording
		// callerId = callerNumber so agent sees who is calling
		// answerOnBridge = caller hears ringing while whisper plays to agent
		// Number url = whisper endpoint plays contact context to agent before connecting
		twimlXML := fmt.Sprintf(
			`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This call may be recorded for quality purposes.</Say>
  <Dial callerId="%s" record="record-from-answer-dual" recordingStatusCallback="%s/api/calls/recording-webhook" recordingStatusCallbackEvent="completed" answerOnBridge="true">
    <Number url="%s/api/calls/whisper?call_id=%s">%s</Number>
  </Dial>
</Response>`, xmlEscape(callerNumber), xmlEscape(cfg.WebhookBaseURL),
			xmlEscape(cfg.WebhookBaseURL), callID, xmlEscape(personalPhoneStr))

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

// ProxyRecording streams the recording MP3 file to the client.
// GET /api/calls/{id}/recording (Protected - Clerk JWT)
func ProxyRecording(pool *pgxpool.Pool) http.HandlerFunc {
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

		var localPath *string
		err = tx.QueryRow(r.Context(),
			`SELECT local_recording_path FROM call_logs WHERE id = $1`, callID,
		).Scan(&localPath)
		if err != nil || localPath == nil || *localPath == "" {
			respondError(w, http.StatusNotFound, "recording not found")
			return
		}
		tx.Commit(r.Context())

		// Open file and serve with Range header support
		file, err := os.Open(*localPath)
		if err != nil {
			slog.Error("proxy recording: file open failed", "path", *localPath, "error", err)
			respondError(w, http.StatusNotFound, "recording file not found")
			return
		}
		defer file.Close()

		stat, err := file.Stat()
		if err != nil {
			respondError(w, http.StatusInternalServerError, "file stat error")
			return
		}

		w.Header().Set("Content-Type", "audio/mpeg")
		http.ServeContent(w, r, stat.Name(), stat.ModTime(), file)
	}
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
			        COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name,
			        cl.recording_sid, cl.recording_duration, cl.local_recording_path,
			        cl.outcome, cl.answered_by
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
			ID                string     `json:"id"`
			TwilioSID         *string    `json:"twilio_sid"`
			ContactID         *string    `json:"contact_id"`
			FromNumber        string     `json:"from_number"`
			ToNumber          string     `json:"to_number"`
			Direction         string     `json:"direction"`
			Status            string     `json:"status"`
			Duration          int        `json:"duration"`
			StartedAt         time.Time  `json:"started_at"`
			EndedAt           *time.Time `json:"ended_at"`
			CreatedAt         time.Time  `json:"created_at"`
			ContactName       string     `json:"contact_name"`
			RecordingSID      *string    `json:"recording_sid"`
			RecordingDuration int        `json:"recording_duration"`
			HasRecording      bool       `json:"has_recording"`
			Outcome           *string    `json:"outcome"`
			AnsweredBy        *string    `json:"answered_by"`
		}

		var calls []CallLog
		for rows.Next() {
			var cl CallLog
			var localPath *string
			err := rows.Scan(
				&cl.ID, &cl.TwilioSID, &cl.ContactID, &cl.FromNumber, &cl.ToNumber,
				&cl.Direction, &cl.Status, &cl.Duration, &cl.StartedAt, &cl.EndedAt, &cl.CreatedAt,
				&cl.ContactName, &cl.RecordingSID, &cl.RecordingDuration, &localPath,
				&cl.Outcome, &cl.AnsweredBy,
			)
			if err != nil {
				continue
			}
			cl.HasRecording = cl.RecordingSID != nil && localPath != nil && *localPath != ""
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
			ID                string     `json:"id"`
			TwilioSID         *string    `json:"twilio_sid"`
			ContactID         *string    `json:"contact_id"`
			FromNumber        string     `json:"from_number"`
			ToNumber          string     `json:"to_number"`
			Direction         string     `json:"direction"`
			Status            string     `json:"status"`
			Duration          int        `json:"duration"`
			StartedAt         time.Time  `json:"started_at"`
			EndedAt           *time.Time `json:"ended_at"`
			CreatedAt         time.Time  `json:"created_at"`
			ContactName       string     `json:"contact_name"`
			RecordingSID      *string    `json:"recording_sid"`
			RecordingDuration int        `json:"recording_duration"`
			HasRecording      bool       `json:"has_recording"`
			Outcome           *string    `json:"outcome"`
			AnsweredBy        *string    `json:"answered_by"`
		}

		var cl CallLog
		var localPath *string
		err = tx.QueryRow(r.Context(),
			`SELECT cl.id, cl.twilio_sid, cl.contact_id, cl.from_number, cl.to_number,
			        cl.direction, cl.status, cl.duration, cl.started_at, cl.ended_at, cl.created_at,
			        COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name,
			        cl.recording_sid, cl.recording_duration, cl.local_recording_path,
			        cl.outcome, cl.answered_by
			 FROM call_logs cl
			 LEFT JOIN contacts c ON c.id = cl.contact_id
			 WHERE cl.id = $1`,
			callID,
		).Scan(
			&cl.ID, &cl.TwilioSID, &cl.ContactID, &cl.FromNumber, &cl.ToNumber,
			&cl.Direction, &cl.Status, &cl.Duration, &cl.StartedAt, &cl.EndedAt, &cl.CreatedAt,
			&cl.ContactName, &cl.RecordingSID, &cl.RecordingDuration, &localPath,
			&cl.Outcome, &cl.AnsweredBy,
		)
		if err != nil {
			respondError(w, http.StatusNotFound, "call not found")
			return
		}
		cl.HasRecording = cl.RecordingSID != nil && localPath != nil && *localPath != ""

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, cl)
	}
}

// UpdateCallLog partially updates a call log (currently: outcome field only).
// PATCH /api/calls/{id}
func UpdateCallLog(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		callID := chi.URLParam(r, "id")

		var body struct {
			Outcome *string `json:"outcome"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(),
			`UPDATE call_logs SET outcome = $1 WHERE id = $2`, body.Outcome, callID)
		if err != nil || tag.RowsAffected() == 0 {
			respondError(w, http.StatusNotFound, "call not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]string{"message": "updated"})
	}
}

// WhisperEndpoint returns TwiML that whispers contact context to the agent before connecting an inbound call.
// POST /api/calls/whisper?call_id={id}
// PUBLIC -- Twilio hits this as the url attribute on <Number> in InboundCallWebhook.
func WhisperEndpoint(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say voice="alice">Incoming call.</Say></Response>`))
			return
		}

		callID := r.URL.Query().Get("call_id")
		if callID == "" {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say voice="alice">Incoming call.</Say></Response>`))
			return
		}

		// Look up call to get agent_id and contact_id
		var agentID string
		var contactID *string
		err := pool.QueryRow(r.Context(),
			`SELECT agent_id, contact_id FROM call_logs WHERE id = $1`, callID,
		).Scan(&agentID, &contactID)
		if err != nil {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say voice="alice">Incoming call from unknown number.</Say></Response>`))
			return
		}

		// Validate Twilio signature
		_, authToken, _, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err == nil && r.Method == "POST" {
			requestURL := "https://" + r.Host + r.URL.String()
			if !validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
				respondError(w, http.StatusForbidden, "invalid Twilio signature")
				return
			}
		}

		// If no contact matched, say unknown
		if contactID == nil {
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte(`<Response><Say voice="alice">Incoming call from unknown number.</Say></Response>`))
			return
		}

		// Load contact context: name, deal stage, buyer profile summary
		var firstName, lastName string
		var dealStage *string
		var budgetMin, budgetMax *float64
		var propertyType *string

		// Contact name
		pool.QueryRow(r.Context(),
			`SELECT first_name, last_name FROM contacts WHERE id = $1`, *contactID,
		).Scan(&firstName, &lastName)

		// Active deal stage (most recent deal)
		pool.QueryRow(r.Context(),
			`SELECT ds.name FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE d.contact_id = $1
			 ORDER BY d.created_at DESC LIMIT 1`, *contactID,
		).Scan(&dealStage)

		// Buyer profile summary
		pool.QueryRow(r.Context(),
			`SELECT budget_min, budget_max, property_type FROM buyer_profiles
			 WHERE contact_id = $1`, *contactID,
		).Scan(&budgetMin, &budgetMax, &propertyType)

		// Build whisper text
		whisper := fmt.Sprintf("Incoming call from %s %s.", firstName, lastName)
		if dealStage != nil {
			whisper += fmt.Sprintf(" Deal at %s stage.", *dealStage)
		}
		if budgetMin != nil && budgetMax != nil {
			whisper += fmt.Sprintf(" Budget %g to %g thousand.", *budgetMin/1000, *budgetMax/1000)
		}
		if propertyType != nil && *propertyType != "" {
			whisper += fmt.Sprintf(" Looking for %s.", *propertyType)
		}

		twimlXML := fmt.Sprintf(
			`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">%s</Say>
</Response>`, xmlEscape(whisper))

		w.Header().Set("Content-Type", "text/xml")
		w.Write([]byte(twimlXML))
	}
}

// AMDWebhook receives Twilio's async answering machine detection result.
// POST /api/calls/amd-webhook
// PUBLIC -- Twilio hits this after analyzing the answered audio.
func AMDWebhook(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		callSID := r.FormValue("CallSid")
		answeredBy := r.FormValue("AnsweredBy")

		if callSID == "" || answeredBy == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// Look up call by twilio_sid to get agent_id for signature validation
		var agentID string
		err := pool.QueryRow(r.Context(),
			`SELECT agent_id FROM call_logs WHERE twilio_sid = $1`, callSID,
		).Scan(&agentID)
		if err != nil {
			slog.Warn("amd webhook: unknown CallSid", "sid", callSID)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Validate Twilio signature
		_, authToken, _, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err == nil {
			requestURL := "https://" + r.Host + r.URL.String()
			if !validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
				respondError(w, http.StatusForbidden, "invalid Twilio signature")
				return
			}
		}

		// Update call_logs with answered_by
		// If machine detected, auto-set outcome to "voicemail" (agent can override later)
		if strings.HasPrefix(answeredBy, "machine") {
			pool.Exec(r.Context(),
				`UPDATE call_logs SET answered_by = $1, outcome = COALESCE(outcome, 'voicemail') WHERE twilio_sid = $2`,
				answeredBy, callSID)
		} else {
			pool.Exec(r.Context(),
				`UPDATE call_logs SET answered_by = $1 WHERE twilio_sid = $2`,
				answeredBy, callSID)
		}

		slog.Info("amd webhook: detection result", "sid", callSID, "answered_by", answeredBy)
		w.WriteHeader(http.StatusNoContent)
	}
}

// SyncCallLogs pulls recent call history from Twilio API.
// POST /api/calls/sync
func SyncCallLogs(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		// Fetch Twilio config (decrypts auth_token automatically)
		accountSID, authToken, phoneNumber, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Twilio not configured")
			return
		}
		_ = phoneNumber

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
func CallStatusWebhook(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
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

		// Get auth_token for signature validation via getTwilioConfig
		_, authToken, _, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
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

// RecordingWebhook receives Twilio recording status callbacks.
// POST /api/calls/recording-webhook (PUBLIC)
func RecordingWebhook(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		callSID := r.FormValue("CallSid")
		recordingSID := r.FormValue("RecordingSid")
		recordingURL := r.FormValue("RecordingUrl")
		recordingDuration := r.FormValue("RecordingDuration")
		recordingStatus := r.FormValue("RecordingStatus")

		if recordingStatus != "completed" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Look up agent_id from call_logs via CallSid (no RLS needed)
		var agentID string
		err := pool.QueryRow(r.Context(),
			`SELECT agent_id FROM call_logs WHERE twilio_sid = $1`, callSID,
		).Scan(&agentID)
		if err != nil {
			slog.Warn("recording webhook: unknown CallSid", "sid", callSID)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Get auth_token for signature validation via getTwilioConfig
		_, authToken, _, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err != nil {
			slog.Warn("recording webhook: no twilio config", "agent_id", agentID)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Validate Twilio signature
		requestURL := "https://" + r.Host + r.URL.String()
		if !validateTwilioSignature(authToken, requestURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
			slog.Warn("recording webhook: invalid signature", "sid", callSID)
			w.WriteHeader(http.StatusForbidden)
			return
		}

		duration, _ := strconv.Atoi(recordingDuration)

		// Store recording metadata with RLS
		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			slog.Error("recording webhook: RLS begin failed", "error", err)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		defer tx.Rollback(r.Context())

		tx.Exec(r.Context(),
			`UPDATE call_logs SET recording_sid = $1, recording_url = $2, recording_duration = $3
			 WHERE twilio_sid = $4`,
			recordingSID, recordingURL, duration, callSID)
		tx.Commit(r.Context())

		// Trigger async download in background
		go downloadAndStoreRecording(pool, cfg, agentID, recordingSID, recordingURL, callSID)

		w.WriteHeader(http.StatusNoContent)
	}
}

// downloadAndStoreRecording downloads a recording from Twilio, stores locally, updates DB, then deletes from Twilio.
func downloadAndStoreRecording(pool *pgxpool.Pool, cfg *config.Config, agentID, recordingSID, recordingURL, callSID string) {
	ctx := context.Background()

	// Brief delay to avoid 404 race condition (Twilio may not have the file ready)
	time.Sleep(3 * time.Second)

	// Get Twilio credentials
	accountSID, authToken, _, _, err := getTwilioConfig(ctx, pool, agentID, cfg)
	if err != nil {
		slog.Error("recording download: failed to get config", "error", err, "agent_id", agentID)
		return
	}

	// Download recording as MP3 with retry (3 attempts, 2s/4s backoff)
	downloadURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Recordings/%s.mp3", accountSID, recordingSID)
	var resp *http.Response
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(1<<attempt) * time.Second)
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
		req.SetBasicAuth(accountSID, authToken)
		resp, err = http.DefaultClient.Do(req)
		if err == nil && resp.StatusCode == 200 {
			break
		}
		if resp != nil {
			resp.Body.Close()
		}
		slog.Warn("recording download: retry", "attempt", attempt+1, "recording_sid", recordingSID)
	}
	if err != nil || resp == nil || resp.StatusCode != 200 {
		slog.Error("recording download: all retries failed", "recording_sid", recordingSID)
		return
	}
	defer resp.Body.Close()

	// Ensure recordings directory exists
	dir := fmt.Sprintf("recordings/%s", agentID)
	os.MkdirAll(dir, 0755)
	localPath := fmt.Sprintf("%s/%s.mp3", dir, recordingSID)

	// Write to file
	file, err := os.Create(localPath)
	if err != nil {
		slog.Error("recording download: file create failed", "error", err, "path", localPath)
		return
	}
	_, err = io.Copy(file, resp.Body)
	file.Close()
	if err != nil {
		slog.Error("recording download: write failed", "error", err, "path", localPath)
		os.Remove(localPath)
		return
	}

	// Verify file exists before updating DB
	if _, err := os.Stat(localPath); err != nil {
		slog.Error("recording download: file not found after write", "path", localPath)
		return
	}

	// Update DB with local path
	pool.Exec(ctx,
		`UPDATE call_logs SET local_recording_path = $1 WHERE twilio_sid = $2`,
		localPath, callSID)

	// Trigger transcription pipeline in AI service (non-blocking)
	go triggerTranscription(cfg, pool, callSID, agentID, localPath)

	// Delete from Twilio
	client := twilio.NewRestClientWithParams(twilio.ClientParams{
		Username: accountSID,
		Password: authToken,
	})
	if err := client.Api.DeleteRecording(recordingSID, nil); err != nil {
		slog.Warn("recording download: twilio delete failed (non-fatal)", "error", err, "recording_sid", recordingSID)
	} else {
		slog.Info("recording downloaded and deleted from Twilio", "recording_sid", recordingSID, "local_path", localPath)
	}
}

// triggerTranscription POSTs to the AI service to start the transcription pipeline.
// Non-fatal: logs errors but does not block the recording cleanup.
func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// GetCallTranscript returns the transcript, AI summary, and AI actions for a call.
// GET /api/calls/{id}/transcript
func GetCallTranscript(pool *pgxpool.Pool) http.HandlerFunc {
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

		type Transcript struct {
			ID              string          `json:"id"`
			CallID          string          `json:"call_id"`
			FullText        string          `json:"full_text"`
			SpeakerSegments json.RawMessage `json:"speaker_segments"`
			AISummary       *string         `json:"ai_summary"`
			AIActions       json.RawMessage `json:"ai_actions"`
			Status          string          `json:"status"`
			DurationSeconds *int            `json:"duration_seconds"`
			WordCount       *int            `json:"word_count"`
			CreatedAt       time.Time       `json:"created_at"`
			CompletedAt     *time.Time      `json:"completed_at"`
		}

		var t Transcript
		err = tx.QueryRow(r.Context(),
			`SELECT id, call_id, full_text, speaker_segments, ai_summary,
			        ai_actions, status, duration_seconds, word_count,
			        created_at, completed_at
			 FROM call_transcripts WHERE call_id = $1`, callID,
		).Scan(
			&t.ID, &t.CallID, &t.FullText, &t.SpeakerSegments, &t.AISummary,
			&t.AIActions, &t.Status, &t.DurationSeconds, &t.WordCount,
			&t.CreatedAt, &t.CompletedAt,
		)
		if err != nil {
			respondError(w, http.StatusNotFound, "transcript not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, t)
	}
}

// ConfirmTranscriptAction executes an AI-suggested action and updates its status to "confirmed".
// POST /api/calls/{id}/transcript/actions/{index}/confirm
func ConfirmTranscriptAction(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		callID := chi.URLParam(r, "id")
		indexStr := chi.URLParam(r, "index")
		index, err := strconv.Atoi(indexStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid action index")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Load current ai_actions
		var actionsRaw json.RawMessage
		err = tx.QueryRow(r.Context(),
			`SELECT ai_actions FROM call_transcripts WHERE call_id = $1`, callID,
		).Scan(&actionsRaw)
		if err != nil {
			respondError(w, http.StatusNotFound, "transcript not found")
			return
		}

		var actions []map[string]interface{}
		if err := json.Unmarshal(actionsRaw, &actions); err != nil {
			respondError(w, http.StatusInternalServerError, "invalid actions data")
			return
		}
		if index < 0 || index >= len(actions) {
			respondError(w, http.StatusBadRequest, "action index out of range")
			return
		}
		if actions[index]["status"] != "pending" {
			respondError(w, http.StatusConflict, "action already processed")
			return
		}

		// Execute the action based on type
		actionType, _ := actions[index]["type"].(string)
		params, _ := actions[index]["params"].(map[string]interface{})

		switch actionType {
		case "create_task":
			body, _ := params["body"].(string)
			contactID, _ := params["contact_id"].(string)
			dueDate, _ := params["due_date"].(string)
			priority, _ := params["priority"].(string)
			if priority == "" {
				priority = "medium"
			}
			_, err = tx.Exec(r.Context(),
				`INSERT INTO activities (agent_id, type, body, due_date, priority, contact_id)
				 VALUES ($1, 'task', $2, $3::date, $4, NULLIF($5, '')::uuid)`,
				agentID, body, nilIfEmpty(dueDate), priority, contactID,
			)

		case "update_buyer_profile":
			contactID, _ := params["contact_id"].(string)
			if contactID == "" {
				respondError(w, http.StatusBadRequest, "missing contact_id for buyer profile update")
				return
			}
			// Build dynamic SET clause from params (excluding contact_id)
			// Allowlist of valid buyer_profiles columns to prevent SQL injection
			allowedCols := map[string]bool{
				"budget_min": true, "budget_max": true, "bedrooms": true, "bathrooms": true,
				"locations": true, "must_haves": true, "deal_breakers": true,
				"property_type": true, "pre_approved": true, "timeline": true,
			}
			setCols := []string{}
			setVals := []interface{}{}
			paramIdx := 1
			for k, v := range params {
				if k == "contact_id" || !allowedCols[k] {
					continue
				}
				setCols = append(setCols, fmt.Sprintf("%s = $%d", k, paramIdx))
				setVals = append(setVals, v)
				paramIdx++
			}
			if len(setCols) > 0 {
				setVals = append(setVals, contactID)
				query := fmt.Sprintf(
					`UPDATE buyer_profiles SET %s WHERE contact_id = $%d`,
					strings.Join(setCols, ", "), paramIdx,
				)
				_, err = tx.Exec(r.Context(), query, setVals...)
			}

		case "update_deal_stage":
			contactID, _ := params["contact_id"].(string)
			stageName, _ := params["stage_name"].(string)
			if contactID == "" || stageName == "" {
				respondError(w, http.StatusBadRequest, "missing contact_id or stage_name")
				return
			}
			_, err = tx.Exec(r.Context(),
				`UPDATE deals SET stage_id = (SELECT id FROM deal_stages WHERE name = $1)
				 WHERE contact_id = $2::uuid AND agent_id = $3`,
				stageName, contactID, agentID,
			)

		default:
			respondError(w, http.StatusBadRequest, "unknown action type: "+actionType)
			return
		}

		if err != nil {
			slog.Error("confirm action: exec failed", "type", actionType, "error", err)
			respondError(w, http.StatusInternalServerError, "failed to execute action")
			return
		}

		// Update action status to "confirmed"
		actions[index]["status"] = "confirmed"
		updatedJSON, _ := json.Marshal(actions)
		_, err = tx.Exec(r.Context(),
			`UPDATE call_transcripts SET ai_actions = $1 WHERE call_id = $2`,
			updatedJSON, callID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update action status")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]string{"status": "confirmed"})
	}
}

// DismissTranscriptAction marks an AI-suggested action as dismissed.
// POST /api/calls/{id}/transcript/actions/{index}/dismiss
func DismissTranscriptAction(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		callID := chi.URLParam(r, "id")
		indexStr := chi.URLParam(r, "index")
		index, err := strconv.Atoi(indexStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid action index")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var actionsRaw json.RawMessage
		err = tx.QueryRow(r.Context(),
			`SELECT ai_actions FROM call_transcripts WHERE call_id = $1`, callID,
		).Scan(&actionsRaw)
		if err != nil {
			respondError(w, http.StatusNotFound, "transcript not found")
			return
		}

		var actions []map[string]interface{}
		if err := json.Unmarshal(actionsRaw, &actions); err != nil {
			respondError(w, http.StatusInternalServerError, "invalid actions data")
			return
		}
		if index < 0 || index >= len(actions) {
			respondError(w, http.StatusBadRequest, "action index out of range")
			return
		}
		if actions[index]["status"] != "pending" {
			respondError(w, http.StatusConflict, "action already processed")
			return
		}

		actions[index]["status"] = "dismissed"
		updatedJSON, _ := json.Marshal(actions)
		_, err = tx.Exec(r.Context(),
			`UPDATE call_transcripts SET ai_actions = $1 WHERE call_id = $2`,
			updatedJSON, callID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update action status")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]string{"status": "dismissed"})
	}
}

func triggerTranscription(cfg *config.Config, pool *pgxpool.Pool, callSID, agentID, localPath string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Look up call_id from call_logs
	var callID string
	err := pool.QueryRow(ctx,
		`SELECT id::text FROM call_logs WHERE twilio_sid = $1`, callSID,
	).Scan(&callID)
	if err != nil {
		slog.Warn("triggerTranscription: call_id lookup failed", "twilio_sid", callSID, "error", err)
		return
	}

	payload, _ := json.Marshal(map[string]string{
		"call_id":    callID,
		"agent_id":   agentID,
		"local_path": localPath,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", cfg.AIServiceURL+"/ai/calls/process-recording", bytes.NewReader(payload))
	if err != nil {
		slog.Warn("triggerTranscription: request build failed", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("triggerTranscription: request failed", "error", err, "call_id", callID)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		slog.Warn("triggerTranscription: AI service error", "status", resp.StatusCode, "body", string(body), "call_id", callID)
		return
	}

	slog.Info("transcription triggered", "call_id", callID)
}
