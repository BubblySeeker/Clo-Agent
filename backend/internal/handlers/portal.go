package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PortalToken struct {
	ID         string     `json:"id"`
	ContactID  string     `json:"contact_id"`
	AgentID    string     `json:"agent_id"`
	Token      string     `json:"token"`
	ExpiresAt  time.Time  `json:"expires_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	CreatedAt  time.Time  `json:"created_at"`
	// Joined fields
	ContactName string `json:"contact_name,omitempty"`
	ContactEmail *string `json:"contact_email,omitempty"`
}

type PortalSettings struct {
	ID             string  `json:"id"`
	AgentID        string  `json:"agent_id"`
	ShowDealValue  bool    `json:"show_deal_value"`
	ShowActivities bool    `json:"show_activities"`
	ShowProperties bool    `json:"show_properties"`
	WelcomeMessage *string `json:"welcome_message"`
	AgentPhone     *string `json:"agent_phone"`
	AgentEmail     *string `json:"agent_email"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Agent-side endpoints (behind ClerkAuth)
// ---------------------------------------------------------------------------

// POST /api/portal/invite/{contact_id} — generate magic link for a contact
func CreatePortalInvite(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		contactID := chi.URLParam(r, "contact_id")
		if contactID == "" {
			respondError(w, http.StatusBadRequest, "contact_id is required")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Verify contact belongs to this agent
		var exists bool
		err = tx.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM contacts WHERE id = $1)`, contactID,
		).Scan(&exists)
		if err != nil || !exists {
			respondError(w, http.StatusNotFound, "contact not found")
			return
		}

		// Generate random 64-char hex token
		tokenBytes := make([]byte, 32)
		if _, err := rand.Read(tokenBytes); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to generate token")
			return
		}
		token := hex.EncodeToString(tokenBytes)

		expiresAt := time.Now().Add(30 * 24 * time.Hour) // 30 days

		var pt PortalToken
		err = tx.QueryRow(r.Context(),
			`INSERT INTO portal_tokens (contact_id, agent_id, token, expires_at)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, contact_id, agent_id, token, expires_at, last_used_at, created_at`,
			contactID, agentID, token, expiresAt,
		).Scan(&pt.ID, &pt.ContactID, &pt.AgentID, &pt.Token, &pt.ExpiresAt, &pt.LastUsedAt, &pt.CreatedAt)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create portal invite")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, pt)
	}
}

// GET /api/portal/invites — list all active portal invites
func ListPortalInvites(pool *pgxpool.Pool) http.HandlerFunc {
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
			`SELECT pt.id, pt.contact_id, pt.agent_id, pt.token, pt.expires_at, pt.last_used_at, pt.created_at,
			        c.first_name || ' ' || c.last_name AS contact_name, c.email AS contact_email
			 FROM portal_tokens pt
			 JOIN contacts c ON c.id = pt.contact_id
			 WHERE pt.agent_id = $1 AND pt.expires_at > NOW()
			 ORDER BY pt.created_at DESC`, agentID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		invites := make([]PortalToken, 0)
		for rows.Next() {
			var pt PortalToken
			if err := rows.Scan(&pt.ID, &pt.ContactID, &pt.AgentID, &pt.Token, &pt.ExpiresAt, &pt.LastUsedAt, &pt.CreatedAt, &pt.ContactName, &pt.ContactEmail); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			invites = append(invites, pt)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{"invites": invites})
	}
}

// DELETE /api/portal/invite/{token_id} — revoke a portal link
func RevokePortalInvite(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		tokenID := chi.URLParam(r, "token_id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(),
			`DELETE FROM portal_tokens WHERE id = $1 AND agent_id = $2`, tokenID, agentID,
		)
		if err != nil || result.RowsAffected() == 0 {
			respondError(w, http.StatusNotFound, "invite not found")
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /api/portal/settings — get portal display settings
func GetPortalSettings(pool *pgxpool.Pool) http.HandlerFunc {
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

		var ps PortalSettings
		err = tx.QueryRow(r.Context(),
			`SELECT id, agent_id, show_deal_value, show_activities, show_properties, welcome_message, agent_phone, agent_email, created_at, updated_at
			 FROM portal_settings WHERE agent_id = $1`, agentID,
		).Scan(&ps.ID, &ps.AgentID, &ps.ShowDealValue, &ps.ShowActivities, &ps.ShowProperties, &ps.WelcomeMessage, &ps.AgentPhone, &ps.AgentEmail, &ps.CreatedAt, &ps.UpdatedAt)
		if err != nil {
			// Return defaults if no settings exist
			respondJSON(w, http.StatusOK, PortalSettings{
				AgentID:        agentID,
				ShowDealValue:  false,
				ShowActivities: true,
				ShowProperties: true,
			})
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, ps)
	}
}

// PATCH /api/portal/settings — update portal settings
func UpdatePortalSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var body struct {
			ShowDealValue  *bool   `json:"show_deal_value"`
			ShowActivities *bool   `json:"show_activities"`
			ShowProperties *bool   `json:"show_properties"`
			WelcomeMessage *string `json:"welcome_message"`
			AgentPhone     *string `json:"agent_phone"`
			AgentEmail     *string `json:"agent_email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Upsert portal settings
		var ps PortalSettings
		err = tx.QueryRow(r.Context(),
			`INSERT INTO portal_settings (agent_id, show_deal_value, show_activities, show_properties, welcome_message, agent_phone, agent_email)
			 VALUES ($1,
			         COALESCE($2, false),
			         COALESCE($3, true),
			         COALESCE($4, true),
			         $5, $6, $7)
			 ON CONFLICT (agent_id) DO UPDATE SET
			     show_deal_value  = COALESCE($2, portal_settings.show_deal_value),
			     show_activities  = COALESCE($3, portal_settings.show_activities),
			     show_properties  = COALESCE($4, portal_settings.show_properties),
			     welcome_message  = COALESCE($5, portal_settings.welcome_message),
			     agent_phone      = COALESCE($6, portal_settings.agent_phone),
			     agent_email      = COALESCE($7, portal_settings.agent_email),
			     updated_at       = NOW()
			 RETURNING id, agent_id, show_deal_value, show_activities, show_properties, welcome_message, agent_phone, agent_email, created_at, updated_at`,
			agentID, body.ShowDealValue, body.ShowActivities, body.ShowProperties, body.WelcomeMessage, body.AgentPhone, body.AgentEmail,
		).Scan(&ps.ID, &ps.AgentID, &ps.ShowDealValue, &ps.ShowActivities, &ps.ShowProperties, &ps.WelcomeMessage, &ps.AgentPhone, &ps.AgentEmail, &ps.CreatedAt, &ps.UpdatedAt)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update settings")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, ps)
	}
}

// ---------------------------------------------------------------------------
// Client-side endpoints (PUBLIC — token-based auth, no ClerkAuth)
// ---------------------------------------------------------------------------

// validatePortalToken checks the token and returns contact_id, agent_id if valid.
// Also updates last_used_at. Does NOT use RLS since there's no agent context yet.
func validatePortalToken(r *http.Request, pool *pgxpool.Pool, token string) (contactID, agentID string, err error) {
	tx, err := pool.Begin(r.Context())
	if err != nil {
		return "", "", fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(r.Context())

	err = tx.QueryRow(r.Context(),
		`UPDATE portal_tokens SET last_used_at = NOW()
		 WHERE token = $1 AND expires_at > NOW()
		 RETURNING contact_id, agent_id`, token,
	).Scan(&contactID, &agentID)
	if err != nil {
		return "", "", fmt.Errorf("invalid or expired token")
	}

	tx.Commit(r.Context())
	return contactID, agentID, nil
}

// GET /api/portal/auth/{token} — validate token, return contact info + agent info
func PortalAuth(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := chi.URLParam(r, "token")
		contactID, agentID, err := validatePortalToken(r, pool, token)
		if err != nil {
			respondError(w, http.StatusUnauthorized, "invalid or expired portal link")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Get contact info (contact_id already validated via portal_tokens)
		var contact struct {
			ID        string  `json:"id"`
			FirstName string  `json:"first_name"`
			LastName  string  `json:"last_name"`
			Email     *string `json:"email"`
		}
		err = tx.QueryRow(r.Context(),
			`SELECT id, first_name, last_name, email FROM contacts WHERE id = $1`,
			contactID,
		).Scan(&contact.ID, &contact.FirstName, &contact.LastName, &contact.Email)
		if err != nil {
			respondError(w, http.StatusNotFound, "contact not found")
			return
		}

		// Get agent info
		var agent struct {
			Name  string  `json:"name"`
			Email string  `json:"email"`
		}
		err = tx.QueryRow(r.Context(),
			`SELECT name, email FROM users WHERE id = $1`, agentID,
		).Scan(&agent.Name, &agent.Email)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "agent lookup failed")
			return
		}

		// Get portal settings
		var settings PortalSettings
		err = tx.QueryRow(r.Context(),
			`SELECT id, agent_id, show_deal_value, show_activities, show_properties, welcome_message, agent_phone, agent_email, created_at, updated_at
			 FROM portal_settings WHERE agent_id = $1`, agentID,
		).Scan(&settings.ID, &settings.AgentID, &settings.ShowDealValue, &settings.ShowActivities, &settings.ShowProperties, &settings.WelcomeMessage, &settings.AgentPhone, &settings.AgentEmail, &settings.CreatedAt, &settings.UpdatedAt)
		if err != nil {
			// Use defaults
			settings = PortalSettings{
				AgentID:        agentID,
				ShowDealValue:  false,
				ShowActivities: true,
				ShowProperties: true,
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"contact":  contact,
			"agent":    agent,
			"settings": settings,
		})
	}
}

// GET /api/portal/view/{token}/dashboard — client's dashboard data
func PortalDashboard(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := chi.URLParam(r, "token")
		contactID, agentID, err := validatePortalToken(r, pool, token)
		if err != nil {
			respondError(w, http.StatusUnauthorized, "invalid or expired portal link")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Get portal settings to know what to show
		var showDealValue, showActivities, showProperties bool
		var welcomeMessage *string
		err = tx.QueryRow(r.Context(),
			`SELECT show_deal_value, show_activities, show_properties, welcome_message
			 FROM portal_settings WHERE agent_id = $1`, agentID,
		).Scan(&showDealValue, &showActivities, &showProperties, &welcomeMessage)
		if err != nil {
			showDealValue = false
			showActivities = true
			showProperties = true
		}

		// Get deals for this contact
		type DealView struct {
			ID        string    `json:"id"`
			Title     string    `json:"title"`
			Value     *float64  `json:"value,omitempty"`
			StageName string    `json:"stage_name"`
			StagePos  int       `json:"stage_position"`
			StageColor string   `json:"stage_color"`
			UpdatedAt time.Time `json:"updated_at"`
		}
		dealRows, err := tx.Query(r.Context(),
			`SELECT d.id, d.title, d.value, ds.name, ds.position, ds.color, d.updated_at
			 FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE d.contact_id = $1
			 ORDER BY d.updated_at DESC`, contactID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer dealRows.Close()

		deals := make([]DealView, 0)
		for dealRows.Next() {
			var d DealView
			var val *float64
			if err := dealRows.Scan(&d.ID, &d.Title, &val, &d.StageName, &d.StagePos, &d.StageColor, &d.UpdatedAt); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			if showDealValue {
				d.Value = val
			}
			deals = append(deals, d)
		}

		// Get recent activities (last 10) if allowed
		type ActivityView struct {
			ID        string    `json:"id"`
			Type      string    `json:"type"`
			Body      string    `json:"body"`
			CreatedAt time.Time `json:"created_at"`
		}
		activities := make([]ActivityView, 0)
		if showActivities {
			actRows, err := tx.Query(r.Context(),
				`SELECT id, type, body, created_at
				 FROM activities
				 WHERE contact_id = $1
				 ORDER BY created_at DESC LIMIT 10`, contactID,
			)
			if err == nil {
				defer actRows.Close()
				for actRows.Next() {
					var a ActivityView
					if err := actRows.Scan(&a.ID, &a.Type, &a.Body, &a.CreatedAt); err == nil {
						activities = append(activities, a)
					}
				}
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"deals":           deals,
			"activities":      activities,
			"welcome_message": welcomeMessage,
		})
	}
}

// GET /api/portal/view/{token}/deals — client's deals with stage info
func PortalDeals(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := chi.URLParam(r, "token")
		contactID, agentID, err := validatePortalToken(r, pool, token)
		if err != nil {
			respondError(w, http.StatusUnauthorized, "invalid or expired portal link")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var showDealValue bool
		_ = tx.QueryRow(r.Context(),
			`SELECT show_deal_value FROM portal_settings WHERE agent_id = $1`, agentID,
		).Scan(&showDealValue)

		rows, err := tx.Query(r.Context(),
			`SELECT d.id, d.title, d.value, d.notes, ds.name, ds.position, ds.color, d.created_at, d.updated_at,
			        d.property_id
			 FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE d.contact_id = $1
			 ORDER BY d.updated_at DESC`, contactID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		type DealDetail struct {
			ID         string    `json:"id"`
			Title      string    `json:"title"`
			Value      *float64  `json:"value,omitempty"`
			Notes      *string   `json:"notes"`
			StageName  string    `json:"stage_name"`
			StagePos   int       `json:"stage_position"`
			StageColor string    `json:"stage_color"`
			PropertyID *string   `json:"property_id,omitempty"`
			CreatedAt  time.Time `json:"created_at"`
			UpdatedAt  time.Time `json:"updated_at"`
		}

		deals := make([]DealDetail, 0)
		for rows.Next() {
			var d DealDetail
			var val *float64
			if err := rows.Scan(&d.ID, &d.Title, &val, &d.Notes, &d.StageName, &d.StagePos, &d.StageColor, &d.CreatedAt, &d.UpdatedAt, &d.PropertyID); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			if showDealValue {
				d.Value = val
			}
			deals = append(deals, d)
		}

		// Also return all stages so the frontend can render progress bars
		stageRows, err := tx.Query(r.Context(),
			`SELECT name, position, color FROM deal_stages ORDER BY position`)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer stageRows.Close()

		type Stage struct {
			Name     string `json:"name"`
			Position int    `json:"position"`
			Color    string `json:"color"`
		}
		stages := make([]Stage, 0)
		for stageRows.Next() {
			var s Stage
			if err := stageRows.Scan(&s.Name, &s.Position, &s.Color); err == nil {
				stages = append(stages, s)
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"deals":  deals,
			"stages": stages,
		})
	}
}

// GET /api/portal/view/{token}/properties — properties linked to client's deals
func PortalProperties(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := chi.URLParam(r, "token")
		contactID, agentID, err := validatePortalToken(r, pool, token)
		if err != nil {
			respondError(w, http.StatusUnauthorized, "invalid or expired portal link")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var showProperties, showDealValue bool
		_ = tx.QueryRow(r.Context(),
			`SELECT show_properties, show_deal_value FROM portal_settings WHERE agent_id = $1`, agentID,
		).Scan(&showProperties, &showDealValue)

		if !showProperties {
			tx.Commit(r.Context())
			respondJSON(w, http.StatusOK, map[string]interface{}{"properties": []interface{}{}})
			return
		}

		type PropertyView struct {
			ID           string   `json:"id"`
			Address      string   `json:"address"`
			City         string   `json:"city"`
			State        string   `json:"state"`
			Zip          string   `json:"zip"`
			Price        *float64 `json:"price,omitempty"`
			Bedrooms     *int     `json:"bedrooms"`
			Bathrooms    *float64 `json:"bathrooms"`
			Sqft         *int     `json:"sqft"`
			PropertyType *string  `json:"property_type"`
			Status       *string  `json:"status"`
			Description  *string  `json:"description"`
		}

		rows, err := tx.Query(r.Context(),
			`SELECT DISTINCT p.id, p.address, p.city, p.state, p.zip, p.price, p.bedrooms, p.bathrooms, p.sqft, p.property_type, p.status, p.description
			 FROM properties p
			 JOIN deals d ON d.property_id = p.id
			 WHERE d.contact_id = $1`,
			contactID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		properties := make([]PropertyView, 0)
		for rows.Next() {
			var p PropertyView
			var price *float64
			if err := rows.Scan(&p.ID, &p.Address, &p.City, &p.State, &p.Zip, &price, &p.Bedrooms, &p.Bathrooms, &p.Sqft, &p.PropertyType, &p.Status, &p.Description); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			if showDealValue {
				p.Price = price
			}
			properties = append(properties, p)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{"properties": properties})
	}
}

// GET /api/portal/view/{token}/timeline — activity timeline for the client
func PortalTimeline(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := chi.URLParam(r, "token")
		contactID, agentID, err := validatePortalToken(r, pool, token)
		if err != nil {
			respondError(w, http.StatusUnauthorized, "invalid or expired portal link")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var showActivities bool
		_ = tx.QueryRow(r.Context(),
			`SELECT show_activities FROM portal_settings WHERE agent_id = $1`, agentID,
		).Scan(&showActivities)

		if !showActivities {
			tx.Commit(r.Context())
			respondJSON(w, http.StatusOK, map[string]interface{}{"activities": []interface{}{}})
			return
		}

		type TimelineItem struct {
			ID        string    `json:"id"`
			Type      string    `json:"type"`
			Body      string    `json:"body"`
			DealTitle *string   `json:"deal_title,omitempty"`
			CreatedAt time.Time `json:"created_at"`
		}

		rows, err := tx.Query(r.Context(),
			`SELECT a.id, a.type, a.body, d.title, a.created_at
			 FROM activities a
			 LEFT JOIN deals d ON d.id = a.deal_id
			 WHERE a.contact_id = $1
			 ORDER BY a.created_at DESC
			 LIMIT 50`, contactID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		items := make([]TimelineItem, 0)
		for rows.Next() {
			var item TimelineItem
			if err := rows.Scan(&item.ID, &item.Type, &item.Body, &item.DealTitle, &item.CreatedAt); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			items = append(items, item)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{"activities": items})
	}
}
