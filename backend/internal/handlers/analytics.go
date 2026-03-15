package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type PipelineAnalytics struct {
	Stages []StageAnalyticsItem `json:"stages"`
}

type StageAnalyticsItem struct {
	StageID    string  `json:"stage_id"`
	StageName  string  `json:"stage_name"`
	StageColor string  `json:"stage_color"`
	DealCount  int     `json:"deal_count"`
	TotalValue float64 `json:"total_value"`
	AvgValue   float64 `json:"avg_value"`
}

type ActivityAnalytics struct {
	ByType []ActivityTypeCount `json:"by_type"`
	Total  int                 `json:"total"`
}

type ActivityTypeCount struct {
	Type  string `json:"type"`
	Count int    `json:"count"`
}

type ContactAnalytics struct {
	BySource   []ContactSourceCount `json:"by_source"`
	Total      int                  `json:"total"`
	NewThisMonth int                `json:"new_this_month"`
}

type ContactSourceCount struct {
	Source string `json:"source"`
	Count  int    `json:"count"`
}

func GetPipelineAnalytics(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		result := PipelineAnalytics{Stages: make([]StageAnalyticsItem, 0)}

		rows, err := tx.Query(r.Context(),
			`SELECT ds.id, ds.name, ds.color,
			        COUNT(d.id) AS deal_count,
			        COALESCE(SUM(COALESCE(d.value, 0)), 0) AS total_value,
			        COALESCE(AVG(COALESCE(d.value, 0)), 0) AS avg_value
			 FROM deal_stages ds
			 LEFT JOIN deals d ON d.stage_id = ds.id
			 GROUP BY ds.id, ds.name, ds.color, ds.position
			 ORDER BY ds.position ASC`,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var s StageAnalyticsItem
				if err := rows.Scan(&s.StageID, &s.StageName, &s.StageColor, &s.DealCount, &s.TotalValue, &s.AvgValue); err == nil {
					result.Stages = append(result.Stages, s)
				}
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, result)
	}
}

func GetActivityAnalytics(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		result := ActivityAnalytics{ByType: make([]ActivityTypeCount, 0)}

		rows, err := tx.Query(r.Context(),
			`SELECT type, COUNT(*) FROM activities GROUP BY type ORDER BY COUNT(*) DESC`,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var item ActivityTypeCount
				if err := rows.Scan(&item.Type, &item.Count); err == nil {
					result.ByType = append(result.ByType, item)
					result.Total += item.Count
				}
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, result)
	}
}

func GetContactAnalytics(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		result := ContactAnalytics{BySource: make([]ContactSourceCount, 0)}

		tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM contacts`).Scan(&result.Total)
		tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM contacts WHERE created_at >= DATE_TRUNC('month', NOW())`,
		).Scan(&result.NewThisMonth)

		rows, err := tx.Query(r.Context(),
			`SELECT COALESCE(source, 'Unknown') AS source, COUNT(*) FROM contacts GROUP BY source ORDER BY COUNT(*) DESC`,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var item ContactSourceCount
				if err := rows.Scan(&item.Source, &item.Count); err == nil {
					result.BySource = append(result.BySource, item)
				}
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, result)
	}
}
