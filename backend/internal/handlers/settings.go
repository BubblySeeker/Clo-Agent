package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// GetSettings returns the agent's saved settings.
func GetSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var settings json.RawMessage
		err = tx.QueryRow(r.Context(),
			`SELECT COALESCE(settings, '{}') FROM users WHERE id = $1`, agentID,
		).Scan(&settings)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}

		tx.Commit(r.Context())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(settings)
	}
}

// UpdateSettings merges the provided JSON into the agent's settings.
func UpdateSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		const maxSettingsBodyBytes = 10 * 1024 // 10 KB
		rawBody, err := io.ReadAll(io.LimitReader(r.Body, maxSettingsBodyBytes+1))
		if err != nil {
			respondError(w, http.StatusBadRequest, "failed to read request body")
			return
		}
		if len(rawBody) > maxSettingsBodyBytes {
			respondError(w, http.StatusRequestEntityTooLarge, "request body must be 10KB or less")
			return
		}
		var body json.RawMessage
		if err := json.Unmarshal(rawBody, &body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Merge: existing settings || new values (new values win)
		_, err = tx.Exec(r.Context(),
			`UPDATE users SET settings = COALESCE(settings, '{}') || $1::jsonb WHERE id = $2`,
			body, agentID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save settings")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]string{"status": "saved"})
	}
}
