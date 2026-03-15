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

type Deal struct {
	ID          string    `json:"id"`
	ContactID   string    `json:"contact_id"`
	AgentID     string    `json:"agent_id"`
	StageID     *string   `json:"stage_id"`
	Title       string    `json:"title"`
	Value       *float64  `json:"value"`
	Notes       *string   `json:"notes"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	ContactName string    `json:"contact_name"`
	StageName   string    `json:"stage_name"`
	StageColor  string    `json:"stage_color"`
}

const dealSelectSQL = `
SELECT d.id, d.contact_id, d.agent_id, d.stage_id, d.title, d.value, d.notes, d.created_at, d.updated_at,
       c.first_name || ' ' || c.last_name AS contact_name,
       COALESCE(ds.name, '')              AS stage_name,
       COALESCE(ds.color, '')             AS stage_color
FROM deals d
JOIN contacts c ON c.id = d.contact_id
LEFT JOIN deal_stages ds ON ds.id = d.stage_id`

func scanDeal(row interface{ Scan(...any) error }) (Deal, error) {
	var d Deal
	err := row.Scan(&d.ID, &d.ContactID, &d.AgentID, &d.StageID, &d.Title, &d.Value, &d.Notes, &d.CreatedAt, &d.UpdatedAt, &d.ContactName, &d.StageName, &d.StageColor)
	return d, err
}

func ListDeals(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		stageID := r.URL.Query().Get("stage_id")
		contactID := r.URL.Query().Get("contact_id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		whereExpr := "1=1"
		var args []interface{}
		if stageID != "" {
			args = append(args, stageID)
			whereExpr += fmt.Sprintf(" AND d.stage_id = $%d", len(args))
		}
		if contactID != "" {
			args = append(args, contactID)
			whereExpr += fmt.Sprintf(" AND d.contact_id = $%d", len(args))
		}

		sql := dealSelectSQL + " WHERE " + whereExpr + " ORDER BY d.created_at DESC"
		rows, err := tx.Query(r.Context(), sql, args...)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		deals := make([]Deal, 0)
		for rows.Next() {
			d, err := scanDeal(rows)
			if err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			deals = append(deals, d)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"deals": deals,
			"total": len(deals),
		})
	}
}

func GetDeal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		row := tx.QueryRow(r.Context(), dealSelectSQL+" WHERE d.id = $1", id)
		d, err := scanDeal(row)
		if err != nil {
			respondError(w, http.StatusNotFound, "deal not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, d)
	}
}

func CreateDeal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			ContactID string   `json:"contact_id"`
			StageID   string   `json:"stage_id"`
			Title     string   `json:"title"`
			Value     *float64 `json:"value"`
			Notes     *string  `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.ContactID == "" || body.StageID == "" || body.Title == "" {
			respondError(w, http.StatusBadRequest, "contact_id, stage_id, and title are required")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var newID string
		err = tx.QueryRow(r.Context(),
			`INSERT INTO deals (contact_id, agent_id, stage_id, title, value, notes)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id`,
			body.ContactID, agentID, body.StageID, body.Title, body.Value, body.Notes,
		).Scan(&newID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "create failed")
			return
		}

		row := tx.QueryRow(r.Context(), dealSelectSQL+" WHERE d.id = $1", newID)
		d, err := scanDeal(row)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "fetch after create failed")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, d)
	}
}

func UpdateDeal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		var body map[string]interface{}
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

		setClauses := "updated_at = NOW()"
		args := []interface{}{}
		allowed := []string{"stage_id", "title", "value", "notes", "contact_id"}
		for _, field := range allowed {
			if val, ok := body[field]; ok {
				args = append(args, val)
				setClauses += fmt.Sprintf(", %s = $%d", field, len(args))
			}
		}
		args = append(args, id)

		var newID string
		err = tx.QueryRow(r.Context(),
			fmt.Sprintf(`UPDATE deals SET %s WHERE id = $%d RETURNING id`, setClauses, len(args)),
			args...,
		).Scan(&newID)
		if err != nil {
			respondError(w, http.StatusNotFound, "deal not found")
			return
		}

		row := tx.QueryRow(r.Context(), dealSelectSQL+" WHERE d.id = $1", newID)
		d, err := scanDeal(row)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "fetch after update failed")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, d)
	}
}

func DeleteDeal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `DELETE FROM deals WHERE id = $1`, id)
		if err != nil || result.RowsAffected() == 0 {
			respondError(w, http.StatusNotFound, "deal not found")
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}
