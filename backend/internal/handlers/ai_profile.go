package handlers

import (
	"bytes"
	"encoding/json"
	"io"
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
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var p AIProfile
		err = tx.QueryRow(r.Context(),
			`SELECT id, contact_id, summary, created_at, updated_at FROM ai_profiles WHERE contact_id = $1`,
			contactID,
		).Scan(&p.ID, &p.ContactID, &p.Summary, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			respondError(w, http.StatusNotFound, "AI profile not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, p)
	}
}

// RegenerateAIProfile proxies to the Python AI service to generate a real summary.
func RegenerateAIProfile(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		payload, _ := json.Marshal(map[string]string{
			"contact_id": contactID,
			"agent_id":   agentID,
		})

		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
			cfg.AIServiceURL+"/ai/profiles/generate", bytes.NewBuffer(payload))
		if err != nil {
			respondError(w, http.StatusInternalServerError, "proxy request build failed")
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			// AI service unavailable — fall back to placeholder in DB
			tx, txErr := database.BeginWithRLS(r.Context(), pool, agentID)
			if txErr != nil {
				respondError(w, http.StatusInternalServerError, "database error")
				return
			}
			defer tx.Rollback(r.Context())
			placeholder := "AI profile generation requires the AI service. Please ensure it is running."
			var p AIProfile
			tx.QueryRow(r.Context(),
				`INSERT INTO ai_profiles (contact_id, summary)
				 VALUES ($1, $2)
				 ON CONFLICT (contact_id) DO UPDATE SET summary = EXCLUDED.summary, updated_at = NOW()
				 RETURNING id, contact_id, summary, created_at, updated_at`,
				contactID, placeholder,
			).Scan(&p.ID, &p.ContactID, &p.Summary, &p.CreatedAt, &p.UpdatedAt)
			tx.Commit(r.Context())
			respondJSON(w, http.StatusOK, p)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body) //nolint:errcheck
	}
}
