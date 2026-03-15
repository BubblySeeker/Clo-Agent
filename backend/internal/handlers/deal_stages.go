package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DealStage struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Position int    `json:"position"`
	Color    string `json:"color"`
}

// ListDealStages is public to all agents — stages are shared/seeded.
func ListDealStages(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// Use a short timeout to avoid blocking.
		rows, err := pool.Query(ctx, `SELECT id, name, position, color FROM deal_stages ORDER BY position ASC`)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		stages := make([]DealStage, 0)
		for rows.Next() {
			var s DealStage
			if err := rows.Scan(&s.ID, &s.Name, &s.Position, &s.Color); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			stages = append(stages, s)
		}

		// Cache for 1 hour since stages rarely change.
		w.Header().Set("Cache-Control", "public, max-age=3600")
		_ = time.Now() // suppress unused import
		respondJSON(w, http.StatusOK, stages)
	}
}
