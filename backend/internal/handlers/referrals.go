package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type Referral struct {
	ID           string    `json:"id"`
	AgentID      string    `json:"agent_id"`
	ReferrerID   string    `json:"referrer_id"`
	ReferredID   string    `json:"referred_id"`
	Notes        *string   `json:"notes"`
	CreatedAt    time.Time `json:"created_at"`
	ReferrerName string    `json:"referrer_name"`
	ReferredName string    `json:"referred_name"`
}

type NetworkNode struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Source        string `json:"source"`
	DealsCount    int    `json:"deals_count"`
	ReferralCount int    `json:"referral_count"`
}

type NetworkEdge struct {
	From      string    `json:"from"`
	To        string    `json:"to"`
	CreatedAt time.Time `json:"created_at"`
}

func ListReferrals(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		rows, err := tx.Query(r.Context(), `
			SELECT r.id, r.agent_id, r.referrer_id, r.referred_id, r.notes, r.created_at,
			       cr.first_name || ' ' || cr.last_name AS referrer_name,
			       cd.first_name || ' ' || cd.last_name AS referred_name
			FROM referrals r
			JOIN contacts cr ON cr.id = r.referrer_id
			JOIN contacts cd ON cd.id = r.referred_id
			ORDER BY r.created_at DESC
		`)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		referrals := make([]Referral, 0)
		for rows.Next() {
			var ref Referral
			if err := rows.Scan(&ref.ID, &ref.AgentID, &ref.ReferrerID, &ref.ReferredID, &ref.Notes, &ref.CreatedAt, &ref.ReferrerName, &ref.ReferredName); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			referrals = append(referrals, ref)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"referrals": referrals,
			"total":     len(referrals),
		})
	}
}

func CreateReferral(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			ReferrerID string  `json:"referrer_id"`
			ReferredID string  `json:"referred_id"`
			Notes      *string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.ReferrerID == "" || body.ReferredID == "" {
			respondError(w, http.StatusBadRequest, "referrer_id and referred_id are required")
			return
		}
		if body.ReferrerID == body.ReferredID {
			respondError(w, http.StatusBadRequest, "a contact cannot refer themselves")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var ref Referral
		err = tx.QueryRow(r.Context(), `
			INSERT INTO referrals (agent_id, referrer_id, referred_id, notes)
			VALUES ($1, $2, $3, $4)
			RETURNING id, agent_id, referrer_id, referred_id, notes, created_at
		`, agentID, body.ReferrerID, body.ReferredID, body.Notes).Scan(
			&ref.ID, &ref.AgentID, &ref.ReferrerID, &ref.ReferredID, &ref.Notes, &ref.CreatedAt,
		)
		if err != nil {
			respondError(w, http.StatusConflict, "referral already exists or invalid contact IDs")
			return
		}

		// Also update referred_by on the referred contact
		tx.Exec(r.Context(), `UPDATE contacts SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL`,
			body.ReferrerID, body.ReferredID)

		// Fetch names
		tx.QueryRow(r.Context(), `SELECT first_name || ' ' || last_name FROM contacts WHERE id = $1`, body.ReferrerID).Scan(&ref.ReferrerName)
		tx.QueryRow(r.Context(), `SELECT first_name || ' ' || last_name FROM contacts WHERE id = $1`, body.ReferredID).Scan(&ref.ReferredName)

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, ref)
	}
}

func DeleteReferral(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `DELETE FROM referrals WHERE id = $1`, id)
		if err != nil || result.RowsAffected() == 0 {
			respondError(w, http.StatusNotFound, "referral not found")
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}

func GetReferralNetwork(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Get all contacts involved in referrals as nodes
		nodeRows, err := tx.Query(r.Context(), `
			SELECT c.id,
			       c.first_name || ' ' || c.last_name AS name,
			       COALESCE(c.source, '') AS source,
			       COALESCE(d.deals_count, 0) AS deals_count,
			       COALESCE(ref.referral_count, 0) AS referral_count
			FROM contacts c
			LEFT JOIN (
				SELECT contact_id, COUNT(*) AS deals_count FROM deals GROUP BY contact_id
			) d ON d.contact_id = c.id
			LEFT JOIN (
				SELECT referrer_id, COUNT(*) AS referral_count FROM referrals GROUP BY referrer_id
			) ref ON ref.referrer_id = c.id
			WHERE c.id IN (
				SELECT referrer_id FROM referrals
				UNION
				SELECT referred_id FROM referrals
			)
		`)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer nodeRows.Close()

		nodes := make([]NetworkNode, 0)
		for nodeRows.Next() {
			var n NetworkNode
			if err := nodeRows.Scan(&n.ID, &n.Name, &n.Source, &n.DealsCount, &n.ReferralCount); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			nodes = append(nodes, n)
		}

		// Get edges
		edgeRows, err := tx.Query(r.Context(), `
			SELECT referrer_id, referred_id, created_at FROM referrals ORDER BY created_at
		`)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer edgeRows.Close()

		edges := make([]NetworkEdge, 0)
		for edgeRows.Next() {
			var e NetworkEdge
			if err := edgeRows.Scan(&e.From, &e.To, &e.CreatedAt); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			edges = append(edges, e)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"nodes": nodes,
			"edges": edges,
		})
	}
}

func GetReferralStats(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Total referrals
		var totalReferrals int
		tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM referrals`).Scan(&totalReferrals)

		// Total contacts from referrals
		var totalReferred int
		tx.QueryRow(r.Context(), `SELECT COUNT(DISTINCT referred_id) FROM referrals`).Scan(&totalReferred)

		// Referral conversion rate: referred contacts with closed deals / total referred
		var closedFromReferrals int
		tx.QueryRow(r.Context(), `
			SELECT COUNT(DISTINCT r.referred_id)
			FROM referrals r
			JOIN deals d ON d.contact_id = r.referred_id
			JOIN deal_stages ds ON ds.id = d.stage_id
			WHERE ds.name = 'Closed'
		`).Scan(&closedFromReferrals)

		conversionRate := 0.0
		if totalReferred > 0 {
			conversionRate = float64(closedFromReferrals) / float64(totalReferred) * 100
		}

		// Top referrers
		type TopReferrer struct {
			ID            string `json:"id"`
			Name          string `json:"name"`
			ReferralCount int    `json:"referral_count"`
		}

		topRows, err := tx.Query(r.Context(), `
			SELECT c.id, c.first_name || ' ' || c.last_name AS name, COUNT(*) AS referral_count
			FROM referrals r
			JOIN contacts c ON c.id = r.referrer_id
			GROUP BY c.id, c.first_name, c.last_name
			ORDER BY referral_count DESC
			LIMIT 5
		`)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer topRows.Close()

		topReferrers := make([]TopReferrer, 0)
		for topRows.Next() {
			var t TopReferrer
			if err := topRows.Scan(&t.ID, &t.Name, &t.ReferralCount); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			topReferrers = append(topReferrers, t)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"total_referrals":  totalReferrals,
			"total_referred":   totalReferred,
			"conversion_rate":  conversionRate,
			"top_referrers":    topReferrers,
		})
	}
}
