package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/gmail/v1"
	"google.golang.org/api/option"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// gmailOAuthConfig builds an oauth2.Config from app config.
func gmailOAuthConfig(cfg *config.Config) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.GoogleClientID,
		ClientSecret: cfg.GoogleClientSecret,
		RedirectURL:  cfg.GoogleRedirectURI,
		Scopes: []string{
			gmail.GmailReadonlyScope,
			gmail.GmailSendScope,
			gmail.GmailModifyScope,
		},
		Endpoint: google.Endpoint,
	}
}

// GmailAuthInit starts the OAuth flow. Returns a Google consent URL.
// POST /api/gmail/auth/init
func GmailAuthInit(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.GoogleClientID == "" || cfg.GoogleClientSecret == "" {
			respondError(w, http.StatusBadRequest, "Google OAuth is not configured")
			return
		}

		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		// Generate random state with embedded agent ID
		b := make([]byte, 16)
		if _, err := rand.Read(b); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to generate state")
			return
		}
		state := base64.URLEncoding.EncodeToString(b) + "|" + agentID

		// Set state in a cookie so we can validate on callback
		http.SetCookie(w, &http.Cookie{
			Name:     "gmail_oauth_state",
			Value:    state,
			Path:     "/",
			MaxAge:   600, // 10 minutes
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})

		oauthCfg := gmailOAuthConfig(cfg)
		url := oauthCfg.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)

		respondJSON(w, http.StatusOK, map[string]string{"url": url})
	}
}

// GmailAuthCallback handles the Google OAuth redirect.
// GET /api/auth/google/callback (public — no Clerk auth, browser redirect)
func GmailAuthCallback(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		frontendURL := cfg.FrontendURL

		// Check for error from Google
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=error&reason="+errParam, http.StatusFound)
			return
		}

		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")
		if code == "" || state == "" {
			http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=error&reason=missing_params", http.StatusFound)
			return
		}

		// Validate state — try cookie first, fall back to state param alone
		// Cookie may be missing due to SameSite restrictions on cross-origin redirects
		cookie, cookieErr := r.Cookie("gmail_oauth_state")
		parts := strings.SplitN(state, "|", 2)
		if len(parts) != 2 {
			http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=error&reason=invalid_state", http.StatusFound)
			return
		}
		// If cookie exists, validate it matches
		if cookieErr == nil && cookie.Value != state {
			http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=error&reason=invalid_state", http.StatusFound)
			return
		}
		agentID := parts[1]

		// Exchange code for tokens
		oauthCfg := gmailOAuthConfig(cfg)
		token, err := oauthCfg.Exchange(r.Context(), code)
		if err != nil {
			slog.Error("gmail oauth exchange failed", "error", err)
			http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=error&reason=exchange_failed", http.StatusFound)
			return
		}

		// Get Gmail address via profile
		client := oauthCfg.Client(r.Context(), token)
		svc, err := gmail.NewService(r.Context(), option.WithHTTPClient(client))
		if err != nil {
			slog.Error("gmail service creation failed", "error", err)
			http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=error&reason=service_error", http.StatusFound)
			return
		}

		profile, err := svc.Users.GetProfile("me").Do()
		if err != nil {
			slog.Error("gmail profile fetch failed", "error", err)
			http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=error&reason=profile_error", http.StatusFound)
			return
		}

		// Upsert gmail_tokens row
		_, err = pool.Exec(r.Context(),
			`INSERT INTO gmail_tokens (agent_id, gmail_address, access_token, refresh_token, token_expiry)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (agent_id) DO UPDATE SET
			   gmail_address = EXCLUDED.gmail_address,
			   access_token = EXCLUDED.access_token,
			   refresh_token = EXCLUDED.refresh_token,
			   token_expiry = EXCLUDED.token_expiry,
			   updated_at = now()`,
			agentID, profile.EmailAddress, token.AccessToken, token.RefreshToken, token.Expiry,
		)
		if err != nil {
			slog.Error("gmail token save failed", "error", err)
			http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=error&reason=db_error", http.StatusFound)
			return
		}

		// Clear state cookie
		http.SetCookie(w, &http.Cookie{
			Name:   "gmail_oauth_state",
			Value:  "",
			Path:   "/",
			MaxAge: -1,
		})

		http.Redirect(w, r, frontendURL+"/dashboard/settings?section=integrations&gmail=connected", http.StatusFound)
	}
}

// GmailStatus returns the connection status for the agent.
// GET /api/gmail/status
func GmailStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var gmailAddress string
		var lastSynced *time.Time
		err := pool.QueryRow(r.Context(),
			`SELECT gmail_address, last_synced_at FROM gmail_tokens WHERE agent_id = $1`,
			agentID,
		).Scan(&gmailAddress, &lastSynced)

		if err != nil {
			respondJSON(w, http.StatusOK, map[string]interface{}{
				"connected":      false,
				"gmail_address":  nil,
				"last_synced_at": nil,
			})
			return
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"connected":      true,
			"gmail_address":  gmailAddress,
			"last_synced_at": lastSynced,
		})
	}
}

// GmailDisconnect removes tokens and synced emails.
// DELETE /api/gmail/disconnect
func GmailDisconnect(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		// Delete emails first (FK), then tokens
		tx, err := pool.Begin(r.Context())
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		tx.Exec(r.Context(), `DELETE FROM emails WHERE agent_id = $1`, agentID)
		tx.Exec(r.Context(), `DELETE FROM gmail_tokens WHERE agent_id = $1`, agentID)

		if err := tx.Commit(r.Context()); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to disconnect")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// getGmailService reads tokens from DB, refreshes if expired, and returns a Gmail service.
func getGmailService(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config, agentID string) (*gmail.Service, error) {
	var accessToken, refreshToken string
	var expiry time.Time
	err := pool.QueryRow(ctx,
		`SELECT access_token, refresh_token, token_expiry FROM gmail_tokens WHERE agent_id = $1`,
		agentID,
	).Scan(&accessToken, &refreshToken, &expiry)
	if err != nil {
		return nil, fmt.Errorf("no gmail connection found")
	}

	oauthCfg := gmailOAuthConfig(cfg)
	tok := &oauth2.Token{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		Expiry:       expiry,
		TokenType:    "Bearer",
	}

	// TokenSource auto-refreshes expired tokens
	ts := oauthCfg.TokenSource(ctx, tok)
	newTok, err := ts.Token()
	if err != nil {
		return nil, fmt.Errorf("failed to refresh token: %w", err)
	}

	// If token was refreshed, persist the new one
	if newTok.AccessToken != accessToken {
		pool.Exec(ctx,
			`UPDATE gmail_tokens SET access_token = $1, token_expiry = $2, updated_at = now() WHERE agent_id = $3`,
			newTok.AccessToken, newTok.Expiry, agentID,
		)
	}

	svc, err := gmail.NewService(ctx, option.WithHTTPClient(oauth2.NewClient(ctx, ts)))
	if err != nil {
		return nil, fmt.Errorf("failed to create gmail service: %w", err)
	}
	return svc, nil
}

// GmailSync fetches emails from Gmail and stores them.
// POST /api/gmail/sync
func GmailSync(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		// Check rate limit: skip if synced < 5 min ago
		var lastSynced *time.Time
		pool.QueryRow(r.Context(),
			`SELECT last_synced_at FROM gmail_tokens WHERE agent_id = $1`, agentID,
		).Scan(&lastSynced)

		if lastSynced != nil && time.Since(*lastSynced) < 5*time.Minute {
			respondJSON(w, http.StatusOK, map[string]interface{}{
				"synced": 0,
				"message": "recently synced, skipping",
			})
			return
		}

		svc, err := getGmailService(r.Context(), pool, cfg, agentID)
		if err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		// Build query — first sync gets last 50, subsequent gets newer messages
		query := ""
		if lastSynced != nil {
			// Fetch messages after last sync
			query = "after:" + lastSynced.Format("2006/01/02")
		}

		listCall := svc.Users.Messages.List("me").MaxResults(50)
		if query != "" {
			listCall = listCall.Q(query)
		}

		msgList, err := listCall.Do()
		if err != nil {
			slog.Error("gmail list messages failed", "error", err)
			respondError(w, http.StatusInternalServerError, "failed to list messages")
			return
		}

		// Build a map of contact emails for matching
		contactEmailMap := map[string]string{} // email -> contact_id
		rows, err := pool.Query(r.Context(),
			`SELECT id, email FROM contacts WHERE agent_id = $1 AND email IS NOT NULL AND email != ''`,
			agentID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var cid, cemail string
				rows.Scan(&cid, &cemail)
				contactEmailMap[strings.ToLower(cemail)] = cid
			}
		}

		synced := 0
		for _, msgRef := range msgList.Messages {
			msg, err := svc.Users.Messages.Get("me", msgRef.Id).Format("full").Do()
			if err != nil {
				slog.Warn("gmail get message failed", "msg_id", msgRef.Id, "error", err)
				continue
			}

			// Parse headers
			var from, subject string
			var to, cc []string
			for _, h := range msg.Payload.Headers {
				switch strings.ToLower(h.Name) {
				case "from":
					from = h.Value
				case "to":
					to = parseAddressList(h.Value)
				case "cc":
					cc = parseAddressList(h.Value)
				case "subject":
					subject = h.Value
				}
			}

			fromAddr, fromName := parseEmailAddress(from)
			isOutbound := false

			// Check if this is an outbound email by checking gmail labels
			for _, lbl := range msg.LabelIds {
				if lbl == "SENT" {
					isOutbound = true
					break
				}
			}

			isRead := true
			for _, lbl := range msg.LabelIds {
				if lbl == "UNREAD" {
					isRead = false
					break
				}
			}

			// Extract body
			bodyText, bodyHTML := extractBody(msg.Payload)

			// Match contact
			var contactID *string
			// For outbound, match against to addresses; for inbound, match from address
			if isOutbound {
				for _, addr := range to {
					if cid, ok := contactEmailMap[strings.ToLower(addr)]; ok {
						contactID = &cid
						break
					}
				}
			} else {
				if cid, ok := contactEmailMap[strings.ToLower(fromAddr)]; ok {
					contactID = &cid
				}
			}

			gmailDate := time.Unix(0, msg.InternalDate*int64(time.Millisecond))

			// Detect attachments and add a synthetic label
			labelIds := msg.LabelIds
			if hasAttachments(msg.Payload) {
				labelIds = append(labelIds, "HAS_ATTACHMENT")
			}

			toJSON, _ := json.Marshal(to)
			ccJSON, _ := json.Marshal(cc)
			labelsJSON, _ := json.Marshal(labelIds)

			_, err = pool.Exec(r.Context(),
				`INSERT INTO emails (agent_id, gmail_message_id, thread_id, contact_id, from_address, from_name,
				  to_addresses, cc_addresses, subject, snippet, body_text, body_html, labels, is_read, is_outbound, gmail_date)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
				 ON CONFLICT (agent_id, gmail_message_id) DO NOTHING`,
				agentID, msg.Id, msg.ThreadId, contactID, fromAddr, fromName,
				toJSON, ccJSON, subject, msg.Snippet, bodyText, bodyHTML, labelsJSON, isRead, isOutbound, gmailDate,
			)
			if err != nil {
				slog.Warn("gmail insert email failed", "msg_id", msg.Id, "error", err)
				continue
			}
			synced++
		}

		// Update last_synced_at
		pool.Exec(r.Context(),
			`UPDATE gmail_tokens SET last_synced_at = now(), updated_at = now() WHERE agent_id = $1`,
			agentID,
		)

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"synced": synced,
		})
	}
}

// ListEmails returns paginated synced emails.
// GET /api/gmail/emails
func ListEmails(pool *pgxpool.Pool) http.HandlerFunc {
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
			whereExpr += fmt.Sprintf(" AND (subject ILIKE $%d OR snippet ILIKE $%d OR from_address ILIKE $%d OR from_name ILIKE $%d)", n, n, n, n)
		}

		var total int
		countArgs := append([]interface{}{}, args...)
		err = tx.QueryRow(r.Context(),
			"SELECT COUNT(*) FROM emails WHERE "+whereExpr, countArgs...,
		).Scan(&total)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "count error")
			return
		}

		dataArgs := append(append([]interface{}{}, args...), limit, offset)
		dataSQL := fmt.Sprintf(
			`SELECT e.id, e.gmail_message_id, e.thread_id, e.contact_id, e.from_address, e.from_name,
			        e.to_addresses, e.cc_addresses, e.subject, e.snippet, e.labels, e.is_read, e.is_outbound,
			        e.gmail_date, e.created_at,
			        COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name
			 FROM emails e
			 LEFT JOIN contacts c ON c.id = e.contact_id
			 WHERE %s
			 ORDER BY e.gmail_date DESC
			 LIMIT $%d OFFSET $%d`,
			whereExpr, len(dataArgs)-1, len(dataArgs),
		)

		rows, err := tx.Query(r.Context(), dataSQL, dataArgs...)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		type EmailSummary struct {
			ID             string      `json:"id"`
			GmailMessageID string      `json:"gmail_message_id"`
			ThreadID       *string     `json:"thread_id"`
			ContactID      *string     `json:"contact_id"`
			FromAddress    *string     `json:"from_address"`
			FromName       *string     `json:"from_name"`
			ToAddresses    json.RawMessage `json:"to_addresses"`
			CcAddresses    json.RawMessage `json:"cc_addresses"`
			Subject        *string     `json:"subject"`
			Snippet        *string     `json:"snippet"`
			Labels         json.RawMessage `json:"labels"`
			IsRead         bool        `json:"is_read"`
			IsOutbound     bool        `json:"is_outbound"`
			GmailDate      *time.Time  `json:"gmail_date"`
			CreatedAt      time.Time   `json:"created_at"`
			ContactName    string      `json:"contact_name"`
		}

		var emails []EmailSummary
		for rows.Next() {
			var e EmailSummary
			err := rows.Scan(
				&e.ID, &e.GmailMessageID, &e.ThreadID, &e.ContactID, &e.FromAddress, &e.FromName,
				&e.ToAddresses, &e.CcAddresses, &e.Subject, &e.Snippet, &e.Labels, &e.IsRead, &e.IsOutbound,
				&e.GmailDate, &e.CreatedAt, &e.ContactName,
			)
			if err != nil {
				continue
			}
			emails = append(emails, e)
		}

		tx.Commit(r.Context())

		if emails == nil {
			emails = []EmailSummary{}
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"emails": emails,
			"total":  total,
		})
	}
}

// GetEmail returns a single email with full body.
// GET /api/gmail/emails/{id}
func GetEmail(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		emailID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		type EmailFull struct {
			ID             string          `json:"id"`
			GmailMessageID string          `json:"gmail_message_id"`
			ThreadID       *string         `json:"thread_id"`
			ContactID      *string         `json:"contact_id"`
			FromAddress    *string         `json:"from_address"`
			FromName       *string         `json:"from_name"`
			ToAddresses    json.RawMessage `json:"to_addresses"`
			CcAddresses    json.RawMessage `json:"cc_addresses"`
			Subject        *string         `json:"subject"`
			Snippet        *string         `json:"snippet"`
			BodyText       *string         `json:"body_text"`
			BodyHTML       *string         `json:"body_html"`
			Labels         json.RawMessage `json:"labels"`
			IsRead         bool            `json:"is_read"`
			IsOutbound     bool            `json:"is_outbound"`
			GmailDate      *time.Time      `json:"gmail_date"`
			CreatedAt      time.Time       `json:"created_at"`
			ContactName    string          `json:"contact_name"`
		}

		var e EmailFull
		err = tx.QueryRow(r.Context(),
			`SELECT e.id, e.gmail_message_id, e.thread_id, e.contact_id, e.from_address, e.from_name,
			        e.to_addresses, e.cc_addresses, e.subject, e.snippet, e.body_text, e.body_html,
			        e.labels, e.is_read, e.is_outbound, e.gmail_date, e.created_at,
			        COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name
			 FROM emails e
			 LEFT JOIN contacts c ON c.id = e.contact_id
			 WHERE e.id = $1`,
			emailID,
		).Scan(
			&e.ID, &e.GmailMessageID, &e.ThreadID, &e.ContactID, &e.FromAddress, &e.FromName,
			&e.ToAddresses, &e.CcAddresses, &e.Subject, &e.Snippet, &e.BodyText, &e.BodyHTML,
			&e.Labels, &e.IsRead, &e.IsOutbound, &e.GmailDate, &e.CreatedAt, &e.ContactName,
		)
		if err != nil {
			respondError(w, http.StatusNotFound, "email not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, e)
	}
}

// SendEmail sends an email via Gmail API and logs it.
// POST /api/gmail/send
func SendEmail(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var body struct {
			To                string  `json:"to"`
			Cc                string  `json:"cc"`
			Subject           string  `json:"subject"`
			Body              string  `json:"body"`
			ContactID         *string `json:"contact_id"`
			ReplyToMessageID  *string `json:"reply_to_message_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if body.To == "" || body.Subject == "" || body.Body == "" {
			respondError(w, http.StatusBadRequest, "to, subject, and body are required")
			return
		}

		svc, err := getGmailService(r.Context(), pool, cfg, agentID)
		if err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		// Get sender email
		var senderEmail string
		pool.QueryRow(r.Context(),
			`SELECT gmail_address FROM gmail_tokens WHERE agent_id = $1`, agentID,
		).Scan(&senderEmail)

		// Build RFC 2822 message
		headers := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\n",
			senderEmail, body.To, body.Subject)

		if body.Cc != "" {
			headers += fmt.Sprintf("Cc: %s\r\n", body.Cc)
		}

		if body.ReplyToMessageID != nil {
			headers += fmt.Sprintf("In-Reply-To: %s\r\nReferences: %s\r\n", *body.ReplyToMessageID, *body.ReplyToMessageID)
		}

		raw := headers + "\r\n" + body.Body
		encoded := base64.URLEncoding.EncodeToString([]byte(raw))

		gmailMsg := &gmail.Message{Raw: encoded}

		// If replying, set thread ID
		if body.ReplyToMessageID != nil {
			var threadID string
			pool.QueryRow(r.Context(),
				`SELECT thread_id FROM emails WHERE gmail_message_id = $1 AND agent_id = $2`,
				*body.ReplyToMessageID, agentID,
			).Scan(&threadID)
			if threadID != "" {
				gmailMsg.ThreadId = threadID
			}
		}

		sent, err := svc.Users.Messages.Send("me", gmailMsg).Do()
		if err != nil {
			slog.Error("gmail send failed", "error", err)
			respondError(w, http.StatusInternalServerError, "failed to send email")
			return
		}

		// Insert into emails table
		toJSON, _ := json.Marshal([]string{body.To})
		now := time.Now()
		pool.Exec(r.Context(),
			`INSERT INTO emails (agent_id, gmail_message_id, thread_id, contact_id, from_address, from_name,
			  to_addresses, subject, body_text, is_read, is_outbound, gmail_date)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, true, $10)
			 ON CONFLICT (agent_id, gmail_message_id) DO NOTHING`,
			agentID, sent.Id, sent.ThreadId, body.ContactID, senderEmail, "",
			toJSON, body.Subject, body.Body, now,
		)

		// Log an activity if contact_id is provided
		if body.ContactID != nil && *body.ContactID != "" {
			pool.Exec(r.Context(),
				`INSERT INTO activities (agent_id, contact_id, type, body)
				 VALUES ($1, $2, 'email', $3)`,
				agentID, *body.ContactID, fmt.Sprintf("Sent email: %s", body.Subject),
			)
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"id":         sent.Id,
			"thread_id":  sent.ThreadId,
			"message":    "email sent",
		})
	}
}

// MarkEmailRead marks an email as read in the local DB and removes the UNREAD label in Gmail.
// PATCH /api/gmail/emails/{id}/read
func MarkEmailRead(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		emailID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Fetch the gmail_message_id and current is_read status
		var gmailMessageID string
		var isRead bool
		err = tx.QueryRow(r.Context(),
			`SELECT gmail_message_id, is_read FROM emails WHERE id = $1`,
			emailID,
		).Scan(&gmailMessageID, &isRead)
		if err != nil {
			respondError(w, http.StatusNotFound, "email not found")
			return
		}

		// If already read, return success immediately
		if isRead {
			tx.Commit(r.Context())
			respondJSON(w, http.StatusOK, map[string]bool{"success": true})
			return
		}

		// Mark as read in Gmail (remove UNREAD label)
		svc, err := getGmailService(r.Context(), pool, cfg, agentID)
		if err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		_, err = svc.Users.Messages.Modify("me", gmailMessageID, &gmail.ModifyMessageRequest{
			RemoveLabelIds: []string{"UNREAD"},
		}).Do()
		if err != nil {
			slog.Error("gmail mark read failed", "gmail_message_id", gmailMessageID, "error", err)
			respondError(w, http.StatusInternalServerError, "failed to mark email as read in Gmail")
			return
		}

		// Update local DB
		_, err = tx.Exec(r.Context(),
			`UPDATE emails SET is_read = true WHERE id = $1`,
			emailID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update email")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to commit")
			return
		}

		respondJSON(w, http.StatusOK, map[string]bool{"success": true})
	}
}

// --- Helper functions ---

// parseAddressList splits a comma-separated list of email addresses
func parseAddressList(raw string) []string {
	var result []string
	for _, part := range strings.Split(raw, ",") {
		addr := strings.TrimSpace(part)
		if addr != "" {
			// Extract just the email if in "Name <email>" format
			_, email := parseEmailAddress(addr)
			if email != "" {
				result = append(result, email)
			} else {
				result = append(result, addr)
			}
		}
	}
	return result
}

// parseEmailAddress extracts email and name from "Name <email>" format
func parseEmailAddress(raw string) (email string, name string) {
	raw = strings.TrimSpace(raw)
	if idx := strings.Index(raw, "<"); idx >= 0 {
		name = strings.TrimSpace(raw[:idx])
		end := strings.Index(raw, ">")
		if end > idx {
			email = raw[idx+1 : end]
		}
	} else {
		email = raw
	}
	// Clean up name — remove surrounding quotes
	name = strings.Trim(name, `"'`)
	return email, name
}

// hasAttachments checks if any part in the message payload has a non-empty Filename (i.e., an attachment).
func hasAttachments(payload *gmail.MessagePart) bool {
	if payload == nil {
		return false
	}
	if payload.Filename != "" {
		return true
	}
	for _, part := range payload.Parts {
		if hasAttachments(part) {
			return true
		}
	}
	return false
}

// extractBody extracts text and HTML body from a Gmail message payload
func extractBody(payload *gmail.MessagePart) (text string, html string) {
	if payload == nil {
		return "", ""
	}

	// Check this part directly
	if payload.MimeType == "text/plain" && payload.Body != nil && payload.Body.Data != "" {
		decoded, err := base64.URLEncoding.DecodeString(payload.Body.Data)
		if err == nil {
			text = string(decoded)
		}
	}
	if payload.MimeType == "text/html" && payload.Body != nil && payload.Body.Data != "" {
		decoded, err := base64.URLEncoding.DecodeString(payload.Body.Data)
		if err == nil {
			html = string(decoded)
		}
	}

	// Recurse into parts
	for _, part := range payload.Parts {
		t, h := extractBody(part)
		if text == "" && t != "" {
			text = t
		}
		if html == "" && h != "" {
			html = h
		}
	}

	return text, html
}
