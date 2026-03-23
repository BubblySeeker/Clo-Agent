package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type Workflow struct {
	ID            string          `json:"id"`
	AgentID       string          `json:"agent_id"`
	Name          string          `json:"name"`
	Description   *string         `json:"description"`
	TriggerType   string          `json:"trigger_type"`
	TriggerConfig json.RawMessage `json:"trigger_config"`
	Steps         json.RawMessage `json:"steps"`
	Enabled       bool            `json:"enabled"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

type WorkflowRun struct {
	ID          string          `json:"id"`
	WorkflowID  string          `json:"workflow_id"`
	AgentID     string          `json:"agent_id"`
	TriggerData json.RawMessage `json:"trigger_data"`
	Status      string          `json:"status"`
	CurrentStep int             `json:"current_step"`
	StepResults json.RawMessage `json:"step_results"`
	StartedAt   time.Time       `json:"started_at"`
	CompletedAt *time.Time      `json:"completed_at"`
}

func ListWorkflows(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		rows, err := tx.Query(r.Context(),
			`SELECT id, agent_id, name, description, trigger_type, trigger_config, steps, enabled, created_at, updated_at
			 FROM workflows ORDER BY created_at DESC`)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		workflows := make([]Workflow, 0)
		for rows.Next() {
			var wf Workflow
			if err := rows.Scan(&wf.ID, &wf.AgentID, &wf.Name, &wf.Description, &wf.TriggerType,
				&wf.TriggerConfig, &wf.Steps, &wf.Enabled, &wf.CreatedAt, &wf.UpdatedAt); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			workflows = append(workflows, wf)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"workflows": workflows,
			"total":     len(workflows),
		})
	}
}

func GetWorkflow(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var wf Workflow
		err = tx.QueryRow(r.Context(),
			`SELECT id, agent_id, name, description, trigger_type, trigger_config, steps, enabled, created_at, updated_at
			 FROM workflows WHERE id = $1`, id).Scan(
			&wf.ID, &wf.AgentID, &wf.Name, &wf.Description, &wf.TriggerType,
			&wf.TriggerConfig, &wf.Steps, &wf.Enabled, &wf.CreatedAt, &wf.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "workflow not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, wf)
	}
}

func CreateWorkflow(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			Name          string          `json:"name"`
			Description   *string         `json:"description"`
			TriggerType   string          `json:"trigger_type"`
			TriggerConfig json.RawMessage `json:"trigger_config"`
			Steps         json.RawMessage `json:"steps"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}
		if body.Name == "" || body.TriggerType == "" {
			respondErrorWithCode(w, http.StatusBadRequest, "name and trigger_type are required", ErrCodeBadRequest)
			return
		}
		if err := validateMaxLen("name", body.Name, 200); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, err.Error(), ErrCodeBadRequest)
			return
		}
		if body.TriggerConfig == nil {
			body.TriggerConfig = json.RawMessage(`{}`)
		}
		if body.Steps == nil {
			body.Steps = json.RawMessage(`[]`)
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var wf Workflow
		err = tx.QueryRow(r.Context(),
			`INSERT INTO workflows (agent_id, name, description, trigger_type, trigger_config, steps)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id, agent_id, name, description, trigger_type, trigger_config, steps, enabled, created_at, updated_at`,
			agentID, body.Name, body.Description, body.TriggerType, body.TriggerConfig, body.Steps,
		).Scan(&wf.ID, &wf.AgentID, &wf.Name, &wf.Description, &wf.TriggerType,
			&wf.TriggerConfig, &wf.Steps, &wf.Enabled, &wf.CreatedAt, &wf.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "create failed", ErrCodeDatabase)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, wf)
	}
}

func UpdateWorkflow(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}
		if name, ok := body["name"].(string); ok {
			if err := validateMaxLen("name", name, 200); err != nil {
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

		setClauses := "updated_at = NOW()"
		args := []interface{}{}
		allowed := []string{"name", "description", "trigger_type", "trigger_config", "steps", "enabled"}
		for _, field := range allowed {
			if val, ok := body[field]; ok {
				switch field {
				case "trigger_config", "steps":
					b, _ := json.Marshal(val)
					args = append(args, b)
				default:
					args = append(args, val)
				}
				setClauses += fmt.Sprintf(", %s = $%d", field, len(args))
			}
		}
		args = append(args, id)

		var wf Workflow
		err = tx.QueryRow(r.Context(),
			fmt.Sprintf(`UPDATE workflows SET %s WHERE id = $%d
			 RETURNING id, agent_id, name, description, trigger_type, trigger_config, steps, enabled, created_at, updated_at`,
				setClauses, len(args)),
			args...,
		).Scan(&wf.ID, &wf.AgentID, &wf.Name, &wf.Description, &wf.TriggerType,
			&wf.TriggerConfig, &wf.Steps, &wf.Enabled, &wf.CreatedAt, &wf.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "workflow not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, wf)
	}
}

func DeleteWorkflow(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `DELETE FROM workflows WHERE id = $1`, id)
		if err != nil || result.RowsAffected() == 0 {
			respondErrorWithCode(w, http.StatusNotFound, "workflow not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}

func ToggleWorkflow(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var wf Workflow
		err = tx.QueryRow(r.Context(),
			`UPDATE workflows SET enabled = NOT enabled, updated_at = NOW() WHERE id = $1
			 RETURNING id, agent_id, name, description, trigger_type, trigger_config, steps, enabled, created_at, updated_at`, id,
		).Scan(&wf.ID, &wf.AgentID, &wf.Name, &wf.Description, &wf.TriggerType,
			&wf.TriggerConfig, &wf.Steps, &wf.Enabled, &wf.CreatedAt, &wf.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "workflow not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, wf)
	}
}

func ListWorkflowRuns(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		workflowID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		rows, err := tx.Query(r.Context(),
			`SELECT id, workflow_id, agent_id, trigger_data, status, current_step, step_results, started_at, completed_at
			 FROM workflow_runs WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT 50`, workflowID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		runs := make([]WorkflowRun, 0)
		for rows.Next() {
			var run WorkflowRun
			if err := rows.Scan(&run.ID, &run.WorkflowID, &run.AgentID, &run.TriggerData,
				&run.Status, &run.CurrentStep, &run.StepResults, &run.StartedAt, &run.CompletedAt); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			runs = append(runs, run)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"runs":  runs,
			"total": len(runs),
		})
	}
}
