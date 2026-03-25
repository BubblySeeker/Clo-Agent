package handlers

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type AIProfile struct {
	ID        string    `json:"id"`
	ContactID string    `json:"contact_id"`
	Summary   *string   `json:"summary"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func GetAIProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var p AIProfile
		err = tx.QueryRow(r.Context(),
			`SELECT id, contact_id, summary, created_at, updated_at FROM ai_profiles WHERE contact_id = $1`,
			contactID,
		).Scan(&p.ID, &p.ContactID, &p.Summary, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "AI profile not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, p)
	}
}

// RegenerateAIProfile proxies to the Python AI service to generate a real summary.
// TODO: Re-implement AI profile generation logic
func RegenerateAIProfile(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		respondErrorWithCode(w, http.StatusNotImplemented, "AI service not yet implemented", ErrCodeInternal)
	}
}
