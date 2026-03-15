package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type Activity struct {
	ID          string    `json:"id"`
	ContactID   *string   `json:"contact_id"`
	DealID      *string   `json:"deal_id"`
	AgentID     string    `json:"agent_id"`
	Type        string    `json:"type"`
	Body        *string   `json:"body"`
	CreatedAt   time.Time `json:"created_at"`
	ContactName *string   `json:"contact_name,omitempty"`
}

// ListActivities returns activities for a specific contact.
func ListActivities(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")
		typeFilter := r.URL.Query().Get("type")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		whereExpr := "a.contact_id = $1"
		args := []interface{}{contactID}
		if typeFilter != "" {
			args = append(args, typeFilter)
			whereExpr += fmt.Sprintf(" AND a.type = $%d", len(args))
		}

		rows, err := tx.Query(r.Context(),
			fmt.Sprintf(`SELECT a.id, a.contact_id, a.deal_id, a.agent_id, a.type, a.body, a.created_at
			 FROM activities a WHERE %s ORDER BY a.created_at DESC`, whereExpr),
			args...,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		activities := make([]Activity, 0)
		for rows.Next() {
			var a Activity
			if err := rows.Scan(&a.ID, &a.ContactID, &a.DealID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			activities = append(activities, a)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"activities": activities,
			"total":      len(activities),
		})
	}
}

// ListAllActivities returns all activities for the authenticated agent (across all contacts).
func ListAllActivities(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		typeFilter := r.URL.Query().Get("type")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		whereExpr := "1=1"
		var args []interface{}
		if typeFilter != "" {
			args = append(args, typeFilter)
			whereExpr += fmt.Sprintf(" AND a.type = $%d", len(args))
		}

		rows, err := tx.Query(r.Context(),
			fmt.Sprintf(`SELECT a.id, a.contact_id, a.deal_id, a.agent_id, a.type, a.body, a.created_at,
			       c.first_name || ' ' || c.last_name AS contact_name
			 FROM activities a
			 LEFT JOIN contacts c ON c.id = a.contact_id
			 WHERE %s ORDER BY a.created_at DESC LIMIT 100`, whereExpr),
			args...,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		activities := make([]Activity, 0)
		for rows.Next() {
			var a Activity
			if err := rows.Scan(&a.ID, &a.ContactID, &a.DealID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt, &a.ContactName); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			activities = append(activities, a)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"activities": activities,
			"total":      len(activities),
		})
	}
}

// CreateActivity logs a new activity for a contact.
func CreateActivity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		var body struct {
			Type   string  `json:"type"`
			Body   *string `json:"body"`
			DealID *string `json:"deal_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		validTypes := map[string]bool{"call": true, "email": true, "note": true, "showing": true, "task": true}
		if !validTypes[body.Type] {
			respondError(w, http.StatusBadRequest, "type must be one of: call, email, note, showing, task")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var a Activity
		err = tx.QueryRow(r.Context(),
			`INSERT INTO activities (contact_id, deal_id, agent_id, type, body)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, contact_id, deal_id, agent_id, type, body, created_at`,
			contactID, body.DealID, agentID, body.Type, body.Body,
		).Scan(&a.ID, &a.ContactID, &a.DealID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "create failed")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, a)
	}
}
