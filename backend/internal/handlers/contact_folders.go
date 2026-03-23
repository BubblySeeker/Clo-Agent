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

// ContactFolder represents a folder for organizing contacts.
type ContactFolder struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	ContactCount int       `json:"contact_count"`
	CreatedAt    time.Time `json:"created_at"`
}

// ListContactFolders returns all contact folders for the authenticated agent.
func ListContactFolders(pool *pgxpool.Pool) http.HandlerFunc {
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
			`SELECT f.id, f.name, COUNT(c.id)::int AS contact_count, f.created_at
			 FROM contact_folders f
			 LEFT JOIN contacts c ON c.folder_id = f.id
			 GROUP BY f.id, f.name, f.created_at
			 ORDER BY f.name ASC`)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		folders := make([]ContactFolder, 0)
		for rows.Next() {
			var f ContactFolder
			if err := rows.Scan(&f.ID, &f.Name, &f.ContactCount, &f.CreatedAt); err != nil {
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

// CreateContactFolder creates a new contact folder.
func CreateContactFolder(pool *pgxpool.Pool) http.HandlerFunc {
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

		var f ContactFolder
		err = tx.QueryRow(r.Context(),
			`INSERT INTO contact_folders (agent_id, name)
			 VALUES ($1, $2)
			 RETURNING id, name, 0, created_at`,
			agentID, body.Name,
		).Scan(&f.ID, &f.Name, &f.ContactCount, &f.CreatedAt)
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

// UpdateContactFolder updates the name of a contact folder.
func UpdateContactFolder(pool *pgxpool.Pool) http.HandlerFunc {
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

		var f ContactFolder
		err = tx.QueryRow(r.Context(),
			`UPDATE contact_folders SET name = $1 WHERE id = $2
			 RETURNING id, name, 0, created_at`,
			body.Name, id,
		).Scan(&f.ID, &f.Name, &f.ContactCount, &f.CreatedAt)
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

// DeleteContactFolder removes a contact folder. Requires confirm_name to match.
// Contacts in the folder get folder_id = NULL (unfiled).
func DeleteContactFolder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		id := chi.URLParam(r, "id")

		var body struct {
			ConfirmName string `json:"confirm_name"`
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

		// Verify folder exists and name matches
		var actualName string
		err = tx.QueryRow(r.Context(), `SELECT name FROM contact_folders WHERE id = $1`, id).Scan(&actualName)
		if err != nil {
			respondError(w, http.StatusNotFound, "folder not found")
			return
		}

		if body.ConfirmName != actualName {
			respondError(w, http.StatusBadRequest, "folder name does not match — type the exact folder name to confirm deletion")
			return
		}

		// Delete folder (ON DELETE SET NULL moves contacts to unfiled)
		_, err = tx.Exec(r.Context(), `DELETE FROM contact_folders WHERE id = $1`, id)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to delete folder")
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}

// MoveContactsToFolder assigns contacts to a folder.
func MoveContactsToFolder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		folderID := chi.URLParam(r, "id")

		var body struct {
			ContactIDs []string `json:"contact_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if len(body.ContactIDs) == 0 {
			respondError(w, http.StatusBadRequest, "contact_ids is required")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Verify folder exists
		var exists bool
		err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM contact_folders WHERE id = $1)`, folderID).Scan(&exists)
		if err != nil || !exists {
			respondError(w, http.StatusNotFound, "folder not found")
			return
		}

		// Update contacts
		for _, cid := range body.ContactIDs {
			_, _ = tx.Exec(r.Context(), `UPDATE contacts SET folder_id = $1, updated_at = NOW() WHERE id = $2`, folderID, cid)
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}

// RemoveContactsFromFolder unassigns contacts from a folder (sets folder_id = NULL).
func RemoveContactsFromFolder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var body struct {
			ContactIDs []string `json:"contact_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if len(body.ContactIDs) == 0 {
			respondError(w, http.StatusBadRequest, "contact_ids is required")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		for _, cid := range body.ContactIDs {
			_, _ = tx.Exec(r.Context(), `UPDATE contacts SET folder_id = NULL, updated_at = NOW() WHERE id = $1`, cid)
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}
