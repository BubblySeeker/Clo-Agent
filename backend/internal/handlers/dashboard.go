package handlers

import (
	"encoding/json"
	"log"
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
	Trends          KPITrends        `json:"trends"`
	LeadSources     []LeadSourceItem  `json:"lead_sources"`
	Tasks           []TaskItem        `json:"tasks"`
	MonthlyRevenue  []MonthlyRevenue  `json:"monthly_revenue"`
	SpeedToLead     []SpeedToLeadItem `json:"speed_to_lead"`
}

type KPITrends struct {
	PrevTotalContacts    int     `json:"prev_total_contacts"`
	PrevActiveDeals      int     `json:"prev_active_deals"`
	PrevPipelineValue    float64 `json:"prev_pipeline_value"`
	PrevClosedThisMonth  int     `json:"prev_closed_this_month"`
	ClosedThisMonthValue float64 `json:"closed_this_month_value"`
	PrevClosedMonthValue float64 `json:"prev_closed_month_value"`
}

type LeadSourceItem struct {
	Source string `json:"source"`
	Count  int    `json:"count"`
}

type TaskItem struct {
	ID          string     `json:"id"`
	ContactID   *string    `json:"contact_id"`
	ContactName *string    `json:"contact_name"`
	Body        *string    `json:"body"`
	DueDate     *string    `json:"due_date"`
	Priority    *string    `json:"priority"`
	CompletedAt *time.Time `json:"completed_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

type MonthlyRevenue struct {
	Month string  `json:"month"`
	Value float64 `json:"value"`
}

type SpeedToLeadItem struct {
	ContactID   string    `json:"contact_id"`
	ContactName string    `json:"contact_name"`
	Source      *string   `json:"source"`
	CreatedAt   time.Time `json:"created_at"`
	Contacted   bool      `json:"contacted"`
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
		if err := tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM contacts`).Scan(&summary.TotalContacts); err != nil {
			log.Printf("dashboard: total contacts query failed: %v", err)
		}

		// Active deals (not Closed or Lost)
		if err := tx.QueryRow(r.Context(),
			`SELECT COUNT(*), COALESCE(SUM(COALESCE(d.value, 0)), 0)
			 FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE ds.name NOT IN ('Closed', 'Lost')`,
		).Scan(&summary.ActiveDeals, &summary.PipelineValue); err != nil {
			log.Printf("dashboard: active deals query failed: %v", err)
		}

		// Closed this month
		now := time.Now()
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		if err := tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE ds.name = 'Closed' AND d.updated_at >= $1`,
			monthStart,
		).Scan(&summary.ClosedThisMonth); err != nil {
			log.Printf("dashboard: closed this month query failed: %v", err)
		}

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

		// ── KPI Trends ──────────────────────────────────────────────────
		// Previous month's total contacts (created before this month)
		if err := tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM contacts WHERE created_at < $1`, monthStart,
		).Scan(&summary.Trends.PrevTotalContacts); err != nil {
			log.Printf("dashboard: prev total contacts query failed: %v", err)
		}

		// Previous month's active deals & pipeline value
		if err := tx.QueryRow(r.Context(),
			`SELECT COUNT(*), COALESCE(SUM(COALESCE(d.value, 0)), 0)
			 FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE ds.name NOT IN ('Closed', 'Lost') AND d.created_at < $1`, monthStart,
		).Scan(&summary.Trends.PrevActiveDeals, &summary.Trends.PrevPipelineValue); err != nil {
			log.Printf("dashboard: prev active deals query failed: %v", err)
		}

		// Previous month closed deals count & value
		prevMonthStart := monthStart.AddDate(0, -1, 0)
		if err := tx.QueryRow(r.Context(),
			`SELECT COUNT(*), COALESCE(SUM(COALESCE(d.value, 0)), 0)
			 FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE ds.name = 'Closed' AND d.updated_at >= $1 AND d.updated_at < $2`,
			prevMonthStart, monthStart,
		).Scan(&summary.Trends.PrevClosedThisMonth, &summary.Trends.PrevClosedMonthValue); err != nil {
			log.Printf("dashboard: prev closed deals query failed: %v", err)
		}

		// This month's closed deal value
		if err := tx.QueryRow(r.Context(),
			`SELECT COALESCE(SUM(COALESCE(d.value, 0)), 0)
			 FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE ds.name = 'Closed' AND d.updated_at >= $1`, monthStart,
		).Scan(&summary.Trends.ClosedThisMonthValue); err != nil {
			log.Printf("dashboard: closed month value query failed: %v", err)
		}

		// ── Lead Sources ────────────────────────────────────────────────
		summary.LeadSources = make([]LeadSourceItem, 0)
		leadRows, err := tx.Query(r.Context(),
			`SELECT COALESCE(source, 'Unknown'), COUNT(*) FROM contacts GROUP BY 1 ORDER BY 2 DESC`,
		)
		if err != nil {
			log.Printf("dashboard: lead sources query failed: %v", err)
		} else {
			defer leadRows.Close()
			for leadRows.Next() {
				var item LeadSourceItem
				if err := leadRows.Scan(&item.Source, &item.Count); err == nil {
					summary.LeadSources = append(summary.LeadSources, item)
				}
			}
		}

		// ── Task Activities (recent 10, incomplete first) ───────────────
		summary.Tasks = make([]TaskItem, 0)
		taskRows, err := tx.Query(r.Context(),
			`SELECT a.id, a.contact_id, COALESCE(c.first_name || ' ' || c.last_name, ''),
			        a.body, a.due_date::text, a.priority, a.completed_at, a.created_at
			 FROM activities a
			 LEFT JOIN contacts c ON c.id = a.contact_id
			 WHERE a.type = 'task'
			 ORDER BY a.completed_at IS NOT NULL, a.due_date ASC NULLS LAST, a.created_at DESC
			 LIMIT 10`,
		)
		if err != nil {
			log.Printf("dashboard: tasks query failed: %v", err)
		} else {
			defer taskRows.Close()
			for taskRows.Next() {
				var item TaskItem
				if err := taskRows.Scan(&item.ID, &item.ContactID, &item.ContactName, &item.Body,
					&item.DueDate, &item.Priority, &item.CompletedAt, &item.CreatedAt); err == nil {
					summary.Tasks = append(summary.Tasks, item)
				}
			}
		}

		// ── Monthly Revenue (last 12 months) ────────────────────────────
		summary.MonthlyRevenue = make([]MonthlyRevenue, 0)
		// Build 12-month slot list
		type monthSlot struct {
			key   time.Time
			label string
		}
		slots := make([]monthSlot, 12)
		for i := 11; i >= 0; i-- {
			m := monthStart.AddDate(0, -i, 0)
			slots[11-i] = monthSlot{key: m, label: m.Format("Jan")}
		}
		revenueMap := make(map[string]float64)
		revRows, err := tx.Query(r.Context(),
			`SELECT DATE_TRUNC('month', d.updated_at) AS m, COALESCE(SUM(COALESCE(d.value, 0)), 0)
			 FROM deals d
			 JOIN deal_stages ds ON ds.id = d.stage_id
			 WHERE ds.name = 'Closed' AND d.updated_at >= $1
			 GROUP BY m ORDER BY m`,
			slots[0].key,
		)
		if err != nil {
			log.Printf("dashboard: monthly revenue query failed: %v", err)
		} else {
			defer revRows.Close()
			for revRows.Next() {
				var mTime time.Time
				var val float64
				if err := revRows.Scan(&mTime, &val); err == nil {
					key := mTime.Format("2006-01")
					revenueMap[key] = val
				}
			}
		}
		for _, s := range slots {
			summary.MonthlyRevenue = append(summary.MonthlyRevenue, MonthlyRevenue{
				Month: s.label,
				Value: revenueMap[s.key.Format("2006-01")],
			})
		}

		// ── Speed to Lead (10 newest contacts) ──────────────────────────
		summary.SpeedToLead = make([]SpeedToLeadItem, 0)
		stlRows, err := tx.Query(r.Context(),
			`SELECT c.id, c.first_name || ' ' || c.last_name, c.source, c.created_at,
			        EXISTS(SELECT 1 FROM activities a WHERE a.contact_id = c.id)
			 FROM contacts c
			 ORDER BY c.created_at DESC LIMIT 10`,
		)
		if err != nil {
			log.Printf("dashboard: speed to lead query failed: %v", err)
		} else {
			defer stlRows.Close()
			for stlRows.Next() {
				var item SpeedToLeadItem
				if err := stlRows.Scan(&item.ContactID, &item.ContactName, &item.Source, &item.CreatedAt, &item.Contacted); err == nil {
					summary.SpeedToLead = append(summary.SpeedToLead, item)
				}
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, summary)
	}
}

// GetDashboardLayout returns the agent's saved widget layout (null if not set).
func GetDashboardLayout(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var layout *json.RawMessage
		tx.QueryRow(r.Context(),
			`SELECT dashboard_layout FROM users WHERE id = $1`, agentID,
		).Scan(&layout)

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{"layout": layout})
	}
}

// SaveDashboardLayout persists the agent's widget layout as JSONB.
func SaveDashboardLayout(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			Layout json.RawMessage `json:"layout"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		_, err = tx.Exec(r.Context(),
			`UPDATE users SET dashboard_layout = $1 WHERE id = $2`,
			body.Layout, agentID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save layout")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]string{"status": "saved"})
	}
}
