package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// RunWorkflow fetches the workflow by ID (RLS-scoped), then proxies to the AI
// service's execute endpoint, streaming the SSE response back to the frontend.
func RunWorkflow(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		proxyWorkflowExecution(w, r, pool, cfg, false)
	}
}

// DryRunWorkflow is identical to RunWorkflow but passes is_dry_run=true so
// write tools return previews instead of executing.
func DryRunWorkflow(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		proxyWorkflowExecution(w, r, pool, cfg, true)
	}
}

func proxyWorkflowExecution(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, cfg *config.Config, isDryRun bool) {
	agentID := middleware.AgentUUIDFromContext(r.Context())
	workflowID := chi.URLParam(r, "id")

	// Optional trigger_data from request body.
	var body struct {
		TriggerData json.RawMessage `json:"trigger_data"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// Fetch workflow (RLS-scoped to agent).
	tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
	if err != nil {
		respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
		return
	}
	defer tx.Rollback(r.Context())

	var wf Workflow
	err = tx.QueryRow(r.Context(),
		`SELECT id, agent_id, name, description, trigger_type, trigger_config, steps,
		        instruction, approval_mode, schedule_config, enabled, created_at, updated_at
		 FROM workflows WHERE id = $1`, workflowID).Scan(
		&wf.ID, &wf.AgentID, &wf.Name, &wf.Description, &wf.TriggerType,
		&wf.TriggerConfig, &wf.Steps, &wf.Instruction, &wf.ApprovalMode, &wf.ScheduleConfig,
		&wf.Enabled, &wf.CreatedAt, &wf.UpdatedAt)
	if err != nil {
		respondErrorWithCode(w, http.StatusNotFound, "workflow not found", ErrCodeNotFound)
		return
	}
	tx.Commit(r.Context())

	// Build the instruction to send to the AI service.
	instruction := ""
	if wf.Instruction != nil {
		instruction = *wf.Instruction
	}
	if instruction == "" {
		respondErrorWithCode(w, http.StatusBadRequest, "workflow has no instruction", ErrCodeBadRequest)
		return
	}

	// Proxy to AI service.
	payload, _ := json.Marshal(map[string]interface{}{
		"workflow_id":   wf.ID,
		"agent_id":      agentID,
		"instruction":   instruction,
		"approval_mode": wf.ApprovalMode,
		"trigger_data":  body.TriggerData,
		"is_dry_run":    isDryRun,
	})

	endpoint := "/ai/workflows/execute"
	if isDryRun {
		endpoint = "/ai/workflows/dry-run"
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		cfg.AIServiceURL+endpoint, bytes.NewBuffer(payload))
	if err != nil {
		respondErrorWithCode(w, http.StatusInternalServerError, "proxy request build failed", ErrCodeInternal)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)
	req.Header.Set("X-Request-ID", chimiddleware.GetReqID(r.Context()))

	aiClient := &http.Client{Timeout: 5 * time.Minute}
	resp, err := aiClient.Do(req)
	if err != nil {
		respondErrorWithCode(w, http.StatusBadGateway, "AI service unavailable", ErrCodeInternal)
		return
	}
	defer resp.Body.Close()

	// If AI service returned an error (non-2xx), forward it as JSON.
	if resp.StatusCode >= 400 {
		var errBody map[string]interface{}
		if json.NewDecoder(resp.Body).Decode(&errBody) == nil {
			respondJSON(w, resp.StatusCode, errBody)
		} else {
			respondErrorWithCode(w, resp.StatusCode, "AI service error", ErrCodeInternal)
		}
		return
	}

	// Extend write deadline for SSE streaming.
	if rc := http.NewResponseController(w); rc != nil {
		_ = rc.SetWriteDeadline(time.Now().Add(5 * time.Minute))
	}

	// Stream SSE response through to frontend.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, hasFlusher := w.(http.Flusher)
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n]) //nolint:errcheck
			if hasFlusher {
				flusher.Flush()
			}
		}
		if readErr != nil {
			break
		}
	}
}
