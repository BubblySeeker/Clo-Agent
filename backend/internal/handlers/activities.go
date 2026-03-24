package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type Activity struct {
	ID          string     `json:"id"`
	ContactID   *string    `json:"contact_id"`
	DealID      *string    `json:"deal_id"`
	PropertyID  *string    `json:"property_id"`
	AgentID     string     `json:"agent_id"`
	Type        string     `json:"type"`
	Body        *string    `json:"body"`
	CreatedAt   time.Time  `json:"created_at"`
	DueDate     *string    `json:"due_date"`
	Priority    *string    `json:"priority"`
	CompletedAt *time.Time `json:"completed_at"`
	ContactName *string    `json:"contact_name,omitempty"`
	PropertyAddress *string `json:"property_address,omitempty"`
}

// ListActivities returns activities for a specific contact.
func ListActivities(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")
		typeFilter := r.URL.Query().Get("type")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		whereExpr := "a.contact_id = $1"
		args := []interface{}{contactID}
		if typeFilter != "" {
			args = append(args, typeFilter)
			whereExpr += fmt.Sprintf(" AND a.type = $%d", len(args))
		}

		rows, err := tx.Query(r.Context(),
			fmt.Sprintf(`SELECT a.id, a.contact_id, a.deal_id, a.property_id, a.agent_id, a.type, a.body, a.created_at,
			       a.due_date::text, a.priority, a.completed_at,
			       COALESCE(p.address, '') as property_address
			 FROM activities a LEFT JOIN properties p ON p.id = a.property_id WHERE %s ORDER BY a.created_at DESC`, whereExpr),
			args...,
		)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		activities := make([]Activity, 0)
		for rows.Next() {
			var a Activity
			if err := rows.Scan(&a.ID, &a.ContactID, &a.DealID, &a.PropertyID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt,
				&a.DueDate, &a.Priority, &a.CompletedAt, &a.PropertyAddress); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			activities = append(activities, a)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"activities": activities,
			"total":      len(activities),
		})
	}
}

// ListAllActivities returns all activities for the authenticated agent (across all contacts).
func ListAllActivities(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		typeFilter := r.URL.Query().Get("type")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		whereExpr := "1=1"
		var args []interface{}
		if typeFilter != "" {
			args = append(args, typeFilter)
			whereExpr += fmt.Sprintf(" AND a.type = $%d", len(args))
		}

		rows, err := tx.Query(r.Context(),
			fmt.Sprintf(`SELECT a.id, a.contact_id, a.deal_id, a.property_id, a.agent_id, a.type, a.body, a.created_at,
			       a.due_date::text, a.priority, a.completed_at,
			       c.first_name || ' ' || c.last_name AS contact_name,
			       COALESCE(p.address, '') as property_address
			 FROM activities a
			 LEFT JOIN contacts c ON c.id = a.contact_id
			 LEFT JOIN properties p ON p.id = a.property_id
			 WHERE %s ORDER BY a.created_at DESC LIMIT 100`, whereExpr),
			args...,
		)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		activities := make([]Activity, 0)
		for rows.Next() {
			var a Activity
			if err := rows.Scan(&a.ID, &a.ContactID, &a.DealID, &a.PropertyID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt,
				&a.DueDate, &a.Priority, &a.CompletedAt, &a.ContactName, &a.PropertyAddress); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			activities = append(activities, a)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"activities": activities,
			"total":      len(activities),
		})
	}
}

// CreateGeneralActivity logs a new activity with optional contact_id in the body.
func CreateGeneralActivity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			Type       string  `json:"type"`
			Body       *string `json:"body"`
			DealID     *string `json:"deal_id"`
			PropertyID *string `json:"property_id"`
			ContactID  *string `json:"contact_id"`
			DueDate    *string `json:"due_date"`
			Priority   *string `json:"priority"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}
		validTypes := map[string]bool{"call": true, "email": true, "note": true, "showing": true, "task": true}
		if !validTypes[body.Type] {
			respondErrorWithCode(w, http.StatusBadRequest, "type must be one of: call, email, note, showing, task", ErrCodeBadRequest)
			return
		}
		if body.Body != nil {
			if err := validateMaxLen("body", *body.Body, 10000); err != nil {
				respondErrorWithCode(w, http.StatusBadRequest, err.Error(), ErrCodeBadRequest)
				return
			}
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var a Activity
		err = tx.QueryRow(r.Context(),
			`INSERT INTO activities (contact_id, deal_id, property_id, agent_id, type, body, due_date, priority)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING id, contact_id, deal_id, property_id, agent_id, type, body, created_at, due_date::text, priority, completed_at`,
			body.ContactID, body.DealID, body.PropertyID, agentID, body.Type, body.Body, body.DueDate, body.Priority,
		).Scan(&a.ID, &a.ContactID, &a.DealID, &a.PropertyID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt,
			&a.DueDate, &a.Priority, &a.CompletedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "create failed", ErrCodeDatabase)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, a)
	}
}

// CreateActivity logs a new activity for a contact.
func CreateActivity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		var body struct {
			Type       string  `json:"type"`
			Body       *string `json:"body"`
			DealID     *string `json:"deal_id"`
			PropertyID *string `json:"property_id"`
			DueDate    *string `json:"due_date"`
			Priority   *string `json:"priority"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}
		validTypes := map[string]bool{"call": true, "email": true, "note": true, "showing": true, "task": true}
		if !validTypes[body.Type] {
			respondErrorWithCode(w, http.StatusBadRequest, "type must be one of: call, email, note, showing, task", ErrCodeBadRequest)
			return
		}
		if body.Body != nil {
			if err := validateMaxLen("body", *body.Body, 10000); err != nil {
				respondErrorWithCode(w, http.StatusBadRequest, err.Error(), ErrCodeBadRequest)
				return
			}
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var a Activity
		err = tx.QueryRow(r.Context(),
			`INSERT INTO activities (contact_id, deal_id, property_id, agent_id, type, body, due_date, priority)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING id, contact_id, deal_id, property_id, agent_id, type, body, created_at, due_date::text, priority, completed_at`,
			contactID, body.DealID, body.PropertyID, agentID, body.Type, body.Body, body.DueDate, body.Priority,
		).Scan(&a.ID, &a.ContactID, &a.DealID, &a.PropertyID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt,
			&a.DueDate, &a.Priority, &a.CompletedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "create failed", ErrCodeDatabase)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, a)
	}
}

// UpdateActivity partially updates an activity. PATCH /api/activities/{id}
func UpdateActivity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		activityID := chi.URLParam(r, "id")

		var body struct {
			Body        *string `json:"body"`
			DueDate     *string `json:"due_date"`
			Priority    *string `json:"priority"`
			CompletedAt *string `json:"completed_at"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		setClauses := []string{}
		args := []interface{}{}
		argIdx := 1

		if body.Body != nil {
			setClauses = append(setClauses, fmt.Sprintf("body = $%d", argIdx))
			args = append(args, *body.Body)
			argIdx++
		}
		if body.DueDate != nil {
			if *body.DueDate == "" {
				setClauses = append(setClauses, fmt.Sprintf("due_date = $%d", argIdx))
				args = append(args, nil)
			} else {
				setClauses = append(setClauses, fmt.Sprintf("due_date = $%d", argIdx))
				args = append(args, *body.DueDate)
			}
			argIdx++
		}
		if body.Priority != nil {
			setClauses = append(setClauses, fmt.Sprintf("priority = $%d", argIdx))
			args = append(args, *body.Priority)
			argIdx++
		}
		if body.CompletedAt != nil {
			if *body.CompletedAt == "now" {
				setClauses = append(setClauses, "completed_at = NOW()")
			} else if *body.CompletedAt == "" {
				setClauses = append(setClauses, fmt.Sprintf("completed_at = $%d", argIdx))
				args = append(args, nil)
				argIdx++
			} else {
				setClauses = append(setClauses, fmt.Sprintf("completed_at = $%d", argIdx))
				args = append(args, *body.CompletedAt)
				argIdx++
			}
		}

		if len(setClauses) == 0 {
			respondErrorWithCode(w, http.StatusBadRequest, "no fields to update", ErrCodeBadRequest)
			return
		}

		args = append(args, activityID, agentID)

		query := fmt.Sprintf(
			`UPDATE activities SET %s WHERE id = $%d AND agent_id = $%d
			 RETURNING id, contact_id, deal_id, property_id, agent_id, type, body, created_at, due_date::text, priority, completed_at`,
			joinStrings(setClauses, ", "), argIdx, argIdx+1,
		)

		var a Activity
		err = tx.QueryRow(r.Context(), query, args...).Scan(
			&a.ID, &a.ContactID, &a.DealID, &a.PropertyID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt,
			&a.DueDate, &a.Priority, &a.CompletedAt,
		)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "activity not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, a)
	}
}

// ListTasks returns tasks (activities with type='task') with status filtering.
// GET /api/tasks?status=overdue|today|upcoming|completed&page=1&limit=25
func ListTasks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		status := r.URL.Query().Get("status")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 25
		}
		offset := (page - 1) * limit

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		whereExpr := "a.type = 'task'"
		var args []interface{}
		argIdx := 1

		switch status {
		case "overdue":
			whereExpr += " AND a.due_date < CURRENT_DATE AND a.completed_at IS NULL"
		case "today":
			whereExpr += " AND a.due_date = CURRENT_DATE AND a.completed_at IS NULL"
		case "upcoming":
			whereExpr += " AND a.due_date > CURRENT_DATE AND a.completed_at IS NULL"
		case "completed":
			whereExpr += " AND a.completed_at IS NOT NULL"
		}

		// Count total
		var total int
		err = tx.QueryRow(r.Context(),
			fmt.Sprintf("SELECT COUNT(*) FROM activities a WHERE %s", whereExpr),
			args...,
		).Scan(&total)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "count error", ErrCodeDatabase)
			return
		}

		// Fetch tasks
		limitIdx := argIdx
		offsetIdx := argIdx + 1
		args = append(args, limit, offset)
		rows, err := tx.Query(r.Context(),
			fmt.Sprintf(`SELECT a.id, a.contact_id, a.deal_id, a.property_id, a.agent_id, a.type, a.body, a.created_at,
			       a.due_date::text, a.priority, a.completed_at,
			       c.first_name || ' ' || c.last_name AS contact_name,
			       COALESCE(p.address, '') as property_address
			 FROM activities a
			 LEFT JOIN contacts c ON c.id = a.contact_id
			 LEFT JOIN properties p ON p.id = a.property_id
			 WHERE %s
			 ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC
			 LIMIT $%d OFFSET $%d`, whereExpr, limitIdx, offsetIdx),
			args...,
		)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		tasks := make([]Activity, 0)
		for rows.Next() {
			var a Activity
			if err := rows.Scan(&a.ID, &a.ContactID, &a.DealID, &a.PropertyID, &a.AgentID, &a.Type, &a.Body, &a.CreatedAt,
				&a.DueDate, &a.Priority, &a.CompletedAt, &a.ContactName, &a.PropertyAddress); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			tasks = append(tasks, a)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"tasks": tasks,
			"total": total,
		})
	}
}

// joinStrings joins string slice with separator (avoids importing strings package).
func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for _, s := range strs[1:] {
		result += sep + s
	}
	return result
}
