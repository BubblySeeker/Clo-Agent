package handlers

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// SMSConfigure saves Twilio credentials for the agent.
// POST /api/sms/configure
func SMSConfigure(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var body struct {
			AccountSID    string  `json:"account_sid"`
			AuthToken     string  `json:"auth_token"`
			PhoneNumber   string  `json:"phone_number"`
			PersonalPhone *string `json:"personal_phone"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		// Allow personal_phone-only updates when Twilio is already configured
		if body.AccountSID == "" && body.AuthToken == "" && body.PhoneNumber == "" {
			if body.PersonalPhone != nil && *body.PersonalPhone != "" {
				// Personal phone only update
				_, err := pool.Exec(r.Context(),
					`UPDATE twilio_config SET personal_phone = $1, updated_at = now() WHERE agent_id = $2`,
					*body.PersonalPhone, agentID,
				)
				if err != nil {
					respondError(w, http.StatusInternalServerError, "failed to save personal phone")
					return
				}
				respondJSON(w, http.StatusOK, map[string]string{"message": "Personal phone updated"})
				return
			}
			respondError(w, http.StatusBadRequest, "account_sid, auth_token, and phone_number are required")
			return
		}

		// Encrypt auth_token if encryption key is configured
		tokenToStore := body.AuthToken
		if cfg.TwilioEncryptionKey != "" {
			keyBytes, kerr := hex.DecodeString(cfg.TwilioEncryptionKey)
			if kerr == nil && len(keyBytes) == 32 {
				encrypted, eerr := encryptToken(body.AuthToken, keyBytes)
				if eerr == nil {
					tokenToStore = encrypted
				} else {
					slog.Warn("SMSConfigure: encrypt failed, storing plaintext", "error", eerr)
				}
			}
		}

		_, err := pool.Exec(r.Context(),
			`INSERT INTO twilio_config (agent_id, account_sid, auth_token, phone_number, personal_phone)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (agent_id) DO UPDATE SET
			   account_sid = EXCLUDED.account_sid,
			   auth_token = EXCLUDED.auth_token,
			   phone_number = EXCLUDED.phone_number,
			   personal_phone = COALESCE(EXCLUDED.personal_phone, twilio_config.personal_phone),
			   updated_at = now()`,
			agentID, body.AccountSID, tokenToStore, body.PhoneNumber, body.PersonalPhone,
		)
		if err != nil {
			slog.Error("sms configure failed", "error", err)
			respondError(w, http.StatusInternalServerError, "failed to save configuration")
			return
		}

		respondJSON(w, http.StatusOK, map[string]string{"message": "SMS configured"})
	}
}

// SMSStatus returns whether SMS/Twilio is configured for the agent.
// GET /api/sms/status
func SMSStatus(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var phoneNumber string
		var lastSynced *time.Time
		var personalPhone *string
		err := pool.QueryRow(r.Context(),
			`SELECT phone_number, last_synced_at, personal_phone FROM twilio_config WHERE agent_id = $1`,
			agentID,
		).Scan(&phoneNumber, &lastSynced, &personalPhone)

		if err != nil {
			respondJSON(w, http.StatusOK, map[string]interface{}{
				"configured":     false,
				"phone_number":   nil,
				"last_synced_at": nil,
				"personal_phone": nil,
			})
			return
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"configured":     true,
			"phone_number":   phoneNumber,
			"last_synced_at": lastSynced,
			"personal_phone": personalPhone,
		})
	}
}

// SMSDisconnect removes Twilio config and all SMS messages.
// DELETE /api/sms/disconnect
func SMSDisconnect(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		tx.Exec(r.Context(), `DELETE FROM sms_messages WHERE agent_id = $1`, agentID)
		tx.Exec(r.Context(), `DELETE FROM twilio_config WHERE agent_id = $1`, agentID)

		if err := tx.Commit(r.Context()); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to disconnect")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// SMSSend sends an SMS via Twilio REST API and stores the message.
// POST /api/sms/send
func SMSSend(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var body struct {
			To        string  `json:"to"`
			Body      string  `json:"body"`
			ContactID *string `json:"contact_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if body.To == "" || body.Body == "" {
			respondError(w, http.StatusBadRequest, "to and body are required")
			return
		}

		// Fetch Twilio config (decrypts auth_token automatically)
		accountSID, authToken, fromNumber, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err != nil {
			respondError(w, http.StatusBadRequest, "SMS not configured. Please add your Twilio credentials in Settings.")
			return
		}

		// Call Twilio Messages API
		twilioURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", accountSID)
		data := url.Values{}
		data.Set("To", body.To)
		data.Set("From", fromNumber)
		data.Set("Body", body.Body)

		req, err := http.NewRequestWithContext(r.Context(), "POST", twilioURL, strings.NewReader(data.Encode()))
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create request")
			return
		}
		req.SetBasicAuth(accountSID, authToken)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			slog.Error("twilio send failed", "error", err)
			respondError(w, http.StatusInternalServerError, "failed to send SMS")
			return
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			slog.Error("twilio API error", "status", resp.StatusCode, "body", string(respBody))
			respondError(w, http.StatusBadGateway, "Twilio API error: "+string(respBody))
			return
		}

		var twilioResp struct {
			SID    string `json:"sid"`
			Status string `json:"status"`
		}
		json.Unmarshal(respBody, &twilioResp)

		// Auto-match contact by phone if contact_id not provided
		contactID := body.ContactID
		if contactID == nil {
			contactID = matchContactByPhone(r.Context(), pool, agentID, body.To)
		}

		now := time.Now()
		var msgID string
		pool.QueryRow(r.Context(),
			`INSERT INTO sms_messages (agent_id, twilio_sid, contact_id, from_number, to_number, body, status, direction, sent_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, 'outbound', $8)
			 RETURNING id`,
			agentID, twilioResp.SID, contactID, fromNumber, body.To, body.Body, twilioResp.Status, now,
		).Scan(&msgID)

		// Log an activity if contact matched
		if contactID != nil && *contactID != "" {
			pool.Exec(r.Context(),
				`INSERT INTO activities (agent_id, contact_id, type, body)
				 VALUES ($1, $2, 'sms', $3)`,
				agentID, *contactID, fmt.Sprintf("SMS sent: %s", truncate(body.Body, 100)),
			)
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"id":      msgID,
			"sid":     twilioResp.SID,
			"status":  twilioResp.Status,
			"message": "SMS sent",
		})
	}
}

// ListSMSMessages returns paginated SMS messages.
// GET /api/sms/messages
func ListSMSMessages(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		contactID := r.URL.Query().Get("contact_id")
		search := r.URL.Query().Get("search")
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
		if search != "" {
			args = append(args, "%"+search+"%")
			n := len(args)
			whereExpr += fmt.Sprintf(" AND (body ILIKE $%d OR from_number ILIKE $%d OR to_number ILIKE $%d)", n, n, n)
		}

		var total int
		countArgs := append([]interface{}{}, args...)
		err = tx.QueryRow(r.Context(),
			"SELECT COUNT(*) FROM sms_messages WHERE "+whereExpr, countArgs...,
		).Scan(&total)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "count error")
			return
		}

		dataArgs := append(append([]interface{}{}, args...), limit, offset)
		dataSQL := fmt.Sprintf(
			`SELECT s.id, s.twilio_sid, s.contact_id, s.from_number, s.to_number, s.body,
			        s.status, s.direction, s.sent_at, s.created_at,
			        COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name
			 FROM sms_messages s
			 LEFT JOIN contacts c ON c.id = s.contact_id
			 WHERE %s
			 ORDER BY s.sent_at DESC
			 LIMIT $%d OFFSET $%d`,
			whereExpr, len(dataArgs)-1, len(dataArgs),
		)

		rows, err := tx.Query(r.Context(), dataSQL, dataArgs...)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		type SMSMessage struct {
			ID          string    `json:"id"`
			TwilioSID   *string   `json:"twilio_sid"`
			ContactID   *string   `json:"contact_id"`
			FromNumber  string    `json:"from_number"`
			ToNumber    string    `json:"to_number"`
			Body        string    `json:"body"`
			Status      string    `json:"status"`
			Direction   string    `json:"direction"`
			SentAt      time.Time `json:"sent_at"`
			CreatedAt   time.Time `json:"created_at"`
			ContactName string    `json:"contact_name"`
		}

		var messages []SMSMessage
		for rows.Next() {
			var m SMSMessage
			err := rows.Scan(
				&m.ID, &m.TwilioSID, &m.ContactID, &m.FromNumber, &m.ToNumber, &m.Body,
				&m.Status, &m.Direction, &m.SentAt, &m.CreatedAt, &m.ContactName,
			)
			if err != nil {
				continue
			}
			messages = append(messages, m)
		}

		tx.Commit(r.Context())

		if messages == nil {
			messages = []SMSMessage{}
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"messages": messages,
			"total":    total,
		})
	}
}

// GetSMSMessage returns a single SMS message.
// GET /api/sms/messages/{id}
func GetSMSMessage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		msgID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		type SMSMessage struct {
			ID          string    `json:"id"`
			TwilioSID   *string   `json:"twilio_sid"`
			ContactID   *string   `json:"contact_id"`
			FromNumber  string    `json:"from_number"`
			ToNumber    string    `json:"to_number"`
			Body        string    `json:"body"`
			Status      string    `json:"status"`
			Direction   string    `json:"direction"`
			SentAt      time.Time `json:"sent_at"`
			CreatedAt   time.Time `json:"created_at"`
			ContactName string    `json:"contact_name"`
		}

		var m SMSMessage
		err = tx.QueryRow(r.Context(),
			`SELECT s.id, s.twilio_sid, s.contact_id, s.from_number, s.to_number, s.body,
			        s.status, s.direction, s.sent_at, s.created_at,
			        COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name
			 FROM sms_messages s
			 LEFT JOIN contacts c ON c.id = s.contact_id
			 WHERE s.id = $1`,
			msgID,
		).Scan(
			&m.ID, &m.TwilioSID, &m.ContactID, &m.FromNumber, &m.ToNumber, &m.Body,
			&m.Status, &m.Direction, &m.SentAt, &m.CreatedAt, &m.ContactName,
		)
		if err != nil {
			respondError(w, http.StatusNotFound, "message not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, m)
	}
}

// ListSMSConversations returns SMS grouped by contact/phone number.
// GET /api/sms/conversations
func ListSMSConversations(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		rows, err := tx.Query(r.Context(),
			`SELECT
			   COALESCE(s.contact_id::text, CASE WHEN s.direction = 'inbound' THEN s.from_number ELSE s.to_number END) AS group_key,
			   s.contact_id,
			   CASE WHEN s.direction = 'inbound' THEN s.from_number ELSE s.to_number END AS other_number,
			   COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name,
			   COUNT(*) AS message_count,
			   MAX(s.sent_at) AS last_message_at,
			   (SELECT body FROM sms_messages s2 WHERE
			     COALESCE(s2.contact_id::text, CASE WHEN s2.direction = 'inbound' THEN s2.from_number ELSE s2.to_number END) =
			     COALESCE(s.contact_id::text, CASE WHEN s.direction = 'inbound' THEN s.from_number ELSE s.to_number END)
			     ORDER BY s2.sent_at DESC LIMIT 1) AS last_message,
			   COUNT(*) FILTER (WHERE s.direction = 'inbound' AND s.status != 'read') AS unread_count
			 FROM sms_messages s
			 LEFT JOIN contacts c ON c.id = s.contact_id
			 GROUP BY group_key, s.contact_id, other_number, contact_name
			 ORDER BY last_message_at DESC`,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		type Conversation struct {
			GroupKey      string    `json:"group_key"`
			ContactID     *string   `json:"contact_id"`
			OtherNumber   string    `json:"other_number"`
			ContactName   string    `json:"contact_name"`
			MessageCount  int       `json:"message_count"`
			LastMessageAt time.Time `json:"last_message_at"`
			LastMessage   string    `json:"last_message"`
			UnreadCount   int       `json:"unread_count"`
		}

		var convos []Conversation
		for rows.Next() {
			var c Conversation
			if err := rows.Scan(&c.GroupKey, &c.ContactID, &c.OtherNumber, &c.ContactName, &c.MessageCount, &c.LastMessageAt, &c.LastMessage, &c.UnreadCount); err != nil {
				continue
			}
			convos = append(convos, c)
		}

		tx.Commit(r.Context())

		if convos == nil {
			convos = []Conversation{}
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"conversations": convos,
		})
	}
}

// SMSSync pulls recent messages from Twilio API to backfill history.
// POST /api/sms/sync
func SMSSync(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		// Rate limit: skip if synced < 5 min ago
		var lastSynced *time.Time
		pool.QueryRow(r.Context(),
			`SELECT last_synced_at FROM twilio_config WHERE agent_id = $1`, agentID,
		).Scan(&lastSynced)

		if lastSynced != nil && time.Since(*lastSynced) < 5*time.Minute {
			respondJSON(w, http.StatusOK, map[string]interface{}{
				"synced":  0,
				"message": "recently synced, skipping",
			})
			return
		}

		// Fetch Twilio config (decrypts auth_token automatically)
		accountSID, authToken, _, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err != nil {
			respondError(w, http.StatusBadRequest, "SMS not configured")
			return
		}

		// Fetch messages from Twilio API
		twilioURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json?PageSize=50", accountSID)

		req, err := http.NewRequestWithContext(r.Context(), "GET", twilioURL, nil)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create request")
			return
		}
		req.SetBasicAuth(accountSID, authToken)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			slog.Error("twilio sync failed", "error", err)
			respondError(w, http.StatusInternalServerError, "failed to fetch messages from Twilio")
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			respondError(w, http.StatusBadGateway, "Twilio API error")
			return
		}

		var twilioResp struct {
			Messages []struct {
				SID       string `json:"sid"`
				From      string `json:"from"`
				To        string `json:"to"`
				Body      string `json:"body"`
				Status    string `json:"status"`
				Direction string `json:"direction"`
				DateSent  string `json:"date_sent"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&twilioResp); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to parse Twilio response")
			return
		}

		// Build contact phone map for matching
		contactPhoneMap := buildContactPhoneMap(r.Context(), pool, agentID)

		synced := 0
		for _, msg := range twilioResp.Messages {
			direction := "outbound"
			if msg.Direction == "inbound" {
				direction = "inbound"
			}

			sentAt, _ := time.Parse(time.RFC1123Z, msg.DateSent)
			if sentAt.IsZero() {
				sentAt = time.Now()
			}

			// Match contact by phone
			otherNumber := msg.From
			if direction == "outbound" {
				otherNumber = msg.To
			}
			contactID := matchPhoneInMap(contactPhoneMap, otherNumber)

			_, err := pool.Exec(r.Context(),
				`INSERT INTO sms_messages (agent_id, twilio_sid, contact_id, from_number, to_number, body, status, direction, sent_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 ON CONFLICT DO NOTHING`,
				agentID, msg.SID, contactID, msg.From, msg.To, msg.Body, msg.Status, direction, sentAt,
			)
			if err != nil {
				slog.Warn("sms insert failed", "sid", msg.SID, "error", err)
				continue
			}
			synced++
		}

		// Update last_synced_at
		pool.Exec(r.Context(),
			`UPDATE twilio_config SET last_synced_at = now(), updated_at = now() WHERE agent_id = $1`,
			agentID,
		)

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"synced": synced,
		})
	}
}

// SMSWebhook receives inbound SMS from Twilio.
// POST /api/sms/webhook (PUBLIC — no Clerk auth, validates Twilio signature)
func SMSWebhook(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse form data
		if err := r.ParseForm(); err != nil {
			respondError(w, http.StatusBadRequest, "invalid form data")
			return
		}

		toNumber := r.FormValue("To")
		fromNumber := r.FormValue("From")
		body := r.FormValue("Body")
		messageSID := r.FormValue("MessageSid")

		if toNumber == "" || fromNumber == "" || body == "" {
			respondError(w, http.StatusBadRequest, "missing required fields")
			return
		}

		// Look up agent_id by phone number
		var agentID string
		err := pool.QueryRow(r.Context(),
			`SELECT agent_id FROM twilio_config WHERE phone_number = $1`,
			toNumber,
		).Scan(&agentID)
		if err != nil {
			slog.Warn("sms webhook: no agent found for number", "to", toNumber)
			// Return 200 so Twilio doesn't retry
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte("<Response/>"))
			return
		}

		// Get decrypted auth_token via helper
		_, authToken, _, _, err := getTwilioConfig(r.Context(), pool, agentID, cfg)
		if err != nil {
			slog.Warn("sms webhook: twilio config error", "agent_id", agentID, "error", err)
			w.Header().Set("Content-Type", "text/xml")
			w.Write([]byte("<Response/>"))
			return
		}

		// Validate Twilio signature
		twilioSig := r.Header.Get("X-Twilio-Signature")
		if twilioSig != "" {
			requestURL := "https://" + r.Host + r.URL.Path
			if !validateTwilioSignature(authToken, requestURL, r.PostForm, twilioSig) {
				slog.Warn("sms webhook: invalid Twilio signature")
				respondError(w, http.StatusForbidden, "invalid signature")
				return
			}
		}

		// Match contact by phone
		contactID := matchContactByPhone(r.Context(), pool, agentID, fromNumber)

		now := time.Now()
		pool.Exec(r.Context(),
			`INSERT INTO sms_messages (agent_id, twilio_sid, contact_id, from_number, to_number, body, status, direction, sent_at)
			 VALUES ($1, $2, $3, $4, $5, $6, 'received', 'inbound', $7)`,
			agentID, messageSID, contactID, fromNumber, toNumber, body, now,
		)

		// Return empty TwiML response
		w.Header().Set("Content-Type", "text/xml")
		w.Write([]byte("<Response/>"))
	}
}

// truncate trims a string to max length with ellipsis.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
