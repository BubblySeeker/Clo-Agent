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

type Conversation struct {
	ID          string    `json:"id"`
	ContactID   *string   `json:"contact_id"`
	AgentID     string    `json:"agent_id"`
	CreatedAt   time.Time `json:"created_at"`
	ContactName *string   `json:"contact_name,omitempty"`
	Title       *string   `json:"title,omitempty"`
}

func ListConversations(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		rows, err := tx.Query(r.Context(),
			`SELECT cv.id, cv.contact_id, cv.agent_id, cv.created_at,
			        c.first_name || ' ' || c.last_name AS contact_name,
			        cv.title
			 FROM conversations cv
			 LEFT JOIN contacts c ON c.id = cv.contact_id
			 ORDER BY cv.created_at DESC`,
		)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		convs := make([]Conversation, 0)
		for rows.Next() {
			var cv Conversation
			if err := rows.Scan(&cv.ID, &cv.ContactID, &cv.AgentID, &cv.CreatedAt, &cv.ContactName, &cv.Title); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			convs = append(convs, cv)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, convs)
	}
}

func CreateConversation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			ContactID *string `json:"contact_id"`
		}
		// Body is optional — ignore decode errors for empty body
		json.NewDecoder(r.Body).Decode(&body)

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var cv Conversation
		err = tx.QueryRow(r.Context(),
			`INSERT INTO conversations (contact_id, agent_id) VALUES ($1, $2)
			 RETURNING id, contact_id, agent_id, created_at`,
			body.ContactID, agentID,
		).Scan(&cv.ID, &cv.ContactID, &cv.AgentID, &cv.CreatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "create failed", ErrCodeDatabase)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, cv)
	}
}

func GetConversation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var cv Conversation
		err = tx.QueryRow(r.Context(),
			`SELECT cv.id, cv.contact_id, cv.agent_id, cv.created_at,
			        c.first_name || ' ' || c.last_name AS contact_name,
			        cv.title
			 FROM conversations cv
			 LEFT JOIN contacts c ON c.id = cv.contact_id
			 WHERE cv.id = $1`,
			id,
		).Scan(&cv.ID, &cv.ContactID, &cv.AgentID, &cv.CreatedAt, &cv.ContactName, &cv.Title)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "conversation not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, cv)
	}
}

func DeleteConversation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		// Verify conversation belongs to this agent before deleting anything
		var exists bool
		err = tx.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1)`, id,
		).Scan(&exists)
		if err != nil || !exists {
			respondErrorWithCode(w, http.StatusNotFound, "conversation not found", ErrCodeNotFound)
			return
		}

		// Delete messages first, then conversation
		_, err = tx.Exec(r.Context(), `DELETE FROM messages WHERE conversation_id = $1`, id)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "delete messages failed", ErrCodeDatabase)
			return
		}

		_, err = tx.Exec(r.Context(), `DELETE FROM conversations WHERE id = $1`, id)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "delete failed", ErrCodeDatabase)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	}
}
