package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type DashboardSummary struct {
	TotalContacts   int              `json:"total_contacts"`
	ActiveDeals     int              `json:"active_deals"`
	PipelineValue   float64          `json:"pipeline_value"`
	ClosedThisMonth int              `json:"closed_this_month"`
	RecentActivity  []ActivityItem   `json:"recent_activity"`
	NeedsFollowUp   []FollowUpItem   `json:"needs_follow_up"`
	PipelineByStage []StageAggregate `json:"pipeline_by_stage"`
}

type ActivityItem struct {
	ID          string    `json:"id"`
	ContactName string    `json:"contact_name"`
	Type        string    `json:"type"`
	Body        *string   `json:"body"`
	CreatedAt   time.Time `json:"created_at"`
}

type FollowUpItem struct {
	ContactID       string    `json:"contact_id"`
	ContactName     string    `json:"contact_name"`
	LastActivityAt  *time.Time `json:"last_activity_at"`
	DaysSinceContact int       `json:"days_since_contact"`
}

type StageAggregate struct {
	StageID    string  `json:"stage_id"`
	StageName  string  `json:"stage_name"`
	StageColor string  `json:"stage_color"`
	DealCount  int     `json:"deal_count"`
	TotalValue float64 `json:"total_value"`
}

func GetDashboardSummary(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		summary := DashboardSummary{
			RecentActivity:  make([]ActivityItem, 0),
			NeedsFollowUp:   make([]FollowUpItem, 0),
			PipelineByStage: make([]StageAggregate, 0),
		}

		// Total contacts
		tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM contacts`).Scan(&summary.TotalContacts)

		// Active deals (not Closed or Lost)
		tx.QueryRow(r.Context(),
			`SELECT COUNT(*), COALESCE(SUM(COALESCE(d.value, 0)), 0)
			 FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE ds.name NOT IN ('Closed', 'Lost')`,
		).Scan(&summary.ActiveDeals, &summary.PipelineValue)

		// Closed this month
		now := time.Now()
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE ds.name = 'Closed' AND d.updated_at >= $1`,
			monthStart,
		).Scan(&summary.ClosedThisMonth)

		// Recent activity (last 15)
		rows, err := tx.Query(r.Context(),
			`SELECT a.id, c.first_name || ' ' || c.last_name, a.type, a.body, a.created_at
			 FROM activities a
			 JOIN contacts c ON c.id = a.contact_id
			 ORDER BY a.created_at DESC LIMIT 15`,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var item ActivityItem
				if err := rows.Scan(&item.ID, &item.ContactName, &item.Type, &item.Body, &item.CreatedAt); err == nil {
					summary.RecentActivity = append(summary.RecentActivity, item)
				}
			}
		}

		// Needs follow-up: contacts with no activity in 7+ days
		followUpRows, err := tx.Query(r.Context(),
			`SELECT c.id, c.first_name || ' ' || c.last_name,
			        MAX(a.created_at) AS last_activity,
			        EXTRACT(DAY FROM NOW() - MAX(a.created_at))::int AS days_ago
			 FROM contacts c
			 LEFT JOIN activities a ON a.contact_id = c.id
			 GROUP BY c.id, c.first_name, c.last_name
			 HAVING MAX(a.created_at) IS NULL OR MAX(a.created_at) < NOW() - INTERVAL '7 days'
			 ORDER BY last_activity ASC NULLS FIRST
			 LIMIT 10`,
		)
		if err == nil {
			defer followUpRows.Close()
			for followUpRows.Next() {
				var item FollowUpItem
				if err := followUpRows.Scan(&item.ContactID, &item.ContactName, &item.LastActivityAt, &item.DaysSinceContact); err == nil {
					summary.NeedsFollowUp = append(summary.NeedsFollowUp, item)
				}
			}
		}

		// Pipeline by stage
		stageRows, err := tx.Query(r.Context(),
			`SELECT ds.id, ds.name, ds.color,
			        COUNT(d.id) AS deal_count,
			        COALESCE(SUM(COALESCE(d.value, 0)), 0) AS total_value
			 FROM deal_stages ds
			 LEFT JOIN deals d ON d.stage_id = ds.id
			 GROUP BY ds.id, ds.name, ds.color, ds.position
			 ORDER BY ds.position ASC`,
		)
		if err == nil {
			defer stageRows.Close()
			for stageRows.Next() {
				var s StageAggregate
				if err := stageRows.Scan(&s.StageID, &s.StageName, &s.StageColor, &s.DealCount, &s.TotalValue); err == nil {
					summary.PipelineByStage = append(summary.PipelineByStage, s)
				}
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, summary)
	}
}
