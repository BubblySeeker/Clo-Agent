package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// DocumentFolder represents a folder for organizing documents.
type DocumentFolder struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	ContactID     *string   `json:"contact_id"`
	DocumentCount int       `json:"document_count"`
	CreatedAt     time.Time `json:"created_at"`
}

// ListFolders returns all document folders for the authenticated agent.
func ListFolders(pool *pgxpool.Pool) http.HandlerFunc {
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
			`SELECT f.id, f.name, f.contact_id, COUNT(d.id)::int AS document_count, f.created_at
			 FROM document_folders f
			 LEFT JOIN documents d ON d.folder_id = f.id
			 GROUP BY f.id, f.name, f.contact_id, f.created_at
			 ORDER BY f.name ASC`)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		folders := make([]DocumentFolder, 0)
		for rows.Next() {
			var f DocumentFolder
			if err := rows.Scan(&f.ID, &f.Name, &f.ContactID, &f.DocumentCount, &f.CreatedAt); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			folders = append(folders, f)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"folders": folders,
		})
	}
}

// CreateFolder creates a new document folder.
func CreateFolder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			respondError(w, http.StatusBadRequest, "name is required")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var f DocumentFolder
		err = tx.QueryRow(r.Context(),
			`INSERT INTO document_folders (agent_id, name)
			 VALUES ($1, $2)
			 RETURNING id, name, contact_id, 0, created_at`,
			agentID, body.Name,
		).Scan(&f.ID, &f.Name, &f.ContactID, &f.DocumentCount, &f.CreatedAt)
		if err != nil {
			if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "23505") {
				respondError(w, http.StatusConflict, "a folder with that name already exists")
				return
			}
			respondError(w, http.StatusInternalServerError, "failed to create folder")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, f)
	}
}

// RenameFolder updates the name of a document folder.
func RenameFolder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		id := chi.URLParam(r, "id")

		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			respondError(w, http.StatusBadRequest, "name is required")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var f DocumentFolder
		err = tx.QueryRow(r.Context(),
			`UPDATE document_folders SET name = $1 WHERE id = $2
			 RETURNING id, name, contact_id, 0, created_at`,
			body.Name, id,
		).Scan(&f.ID, &f.Name, &f.ContactID, &f.DocumentCount, &f.CreatedAt)
		if err != nil {
			if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "23505") {
				respondError(w, http.StatusConflict, "a folder with that name already exists")
				return
			}
			respondError(w, http.StatusNotFound, "folder not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, f)
	}
}

// DeleteFolder removes a document folder. Documents in it get folder_id = NULL (General).
func DeleteFolder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `DELETE FROM document_folders WHERE id = $1`, id)
		if err != nil || result.RowsAffected() == 0 {
			respondError(w, http.StatusNotFound, "folder not found")
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}
