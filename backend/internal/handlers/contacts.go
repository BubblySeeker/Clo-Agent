package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type Contact struct {
	ID        string    `json:"id"`
	AgentID   string    `json:"agent_id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     *string   `json:"email"`
	Phone     *string   `json:"phone"`
	Source    *string   `json:"source"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		search := r.URL.Query().Get("search")
		source := r.URL.Query().Get("source")
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

		var args []interface{}
		whereExpr := "1=1"

		if search != "" {
			args = append(args, "%"+search+"%")
			n := len(args)
			whereExpr += fmt.Sprintf(" AND (first_name ILIKE $%d OR last_name ILIKE $%d OR email ILIKE $%d)", n, n, n)
		}
		if source != "" {
			args = append(args, source)
			whereExpr += fmt.Sprintf(" AND source = $%d", len(args))
		}

		var total int
		countSQL := "SELECT COUNT(*) FROM contacts WHERE " + whereExpr
		if err := tx.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
			respondError(w, http.StatusInternalServerError, "count error")
			return
		}

		dataArgs := append(append([]interface{}{}, args...), limit, offset)
		dataSQL := fmt.Sprintf(
			"SELECT id, agent_id, first_name, last_name, email, phone, source, created_at, updated_at FROM contacts WHERE %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d",
			whereExpr, len(dataArgs)-1, len(dataArgs),
		)

		rows, err := tx.Query(r.Context(), dataSQL, dataArgs...)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		contacts := make([]Contact, 0)
		for rows.Next() {
			var c Contact
			if err := rows.Scan(&c.ID, &c.AgentID, &c.FirstName, &c.LastName, &c.Email, &c.Phone, &c.Source, &c.CreatedAt, &c.UpdatedAt); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			contacts = append(contacts, c)
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondError(w, http.StatusInternalServerError, "commit error")
			return
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"contacts": contacts,
			"total":    total,
		})
	}
}

func GetContact(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var c Contact
		err = tx.QueryRow(r.Context(),
			`SELECT id, agent_id, first_name, last_name, email, phone, source, created_at, updated_at FROM contacts WHERE id = $1`,
			id,
		).Scan(&c.ID, &c.AgentID, &c.FirstName, &c.LastName, &c.Email, &c.Phone, &c.Source, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			respondError(w, http.StatusNotFound, "contact not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, c)
	}
}

func CreateContact(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			FirstName string  `json:"first_name"`
			LastName  string  `json:"last_name"`
			Email     *string `json:"email"`
			Phone     *string `json:"phone"`
			Source    *string `json:"source"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.FirstName == "" || body.LastName == "" {
			respondError(w, http.StatusBadRequest, "first_name and last_name are required")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var c Contact
		err = tx.QueryRow(r.Context(),
			`INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id, agent_id, first_name, last_name, email, phone, source, created_at, updated_at`,
			agentID, body.FirstName, body.LastName, body.Email, body.Phone, body.Source,
		).Scan(&c.ID, &c.AgentID, &c.FirstName, &c.LastName, &c.Email, &c.Phone, &c.Source, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "create failed")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, c)
	}
}

func UpdateContact(pool *pgxpool.Pool) http.HandlerFunc {
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

		// Build partial update
		setClauses := "updated_at = NOW()"
		args := []interface{}{}
		allowed := []string{"first_name", "last_name", "email", "phone", "source"}
		for _, field := range allowed {
			if val, ok := body[field]; ok {
				args = append(args, val)
				setClauses += fmt.Sprintf(", %s = $%d", field, len(args))
			}
		}
		args = append(args, id)

		var c Contact
		err = tx.QueryRow(r.Context(),
			fmt.Sprintf(`UPDATE contacts SET %s WHERE id = $%d RETURNING id, agent_id, first_name, last_name, email, phone, source, created_at, updated_at`, setClauses, len(args)),
			args...,
		).Scan(&c.ID, &c.AgentID, &c.FirstName, &c.LastName, &c.Email, &c.Phone, &c.Source, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			respondError(w, http.StatusNotFound, "contact not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, c)
	}
}

func DeleteContact(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `DELETE FROM contacts WHERE id = $1`, id)
		if err != nil || result.RowsAffected() == 0 {
			respondError(w, http.StatusNotFound, "contact not found")
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}
