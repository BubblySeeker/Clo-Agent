package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"crm-api/internal/config"
	"crm-api/internal/middleware"
)

// ConfirmToolAction proxies a tool confirmation to the AI service.
func ConfirmToolAction(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		_ = chi.URLParam(r, "id") // conversation ID (available for future use)

		var body struct {
			PendingID string `json:"pending_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PendingID == "" {
			respondError(w, http.StatusBadRequest, "pending_id is required")
			return
		}

		payload, _ := json.Marshal(map[string]string{
			"pending_id": body.PendingID,
			"agent_id":   agentID,
		})

		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
			cfg.AIServiceURL+"/ai/confirm", bytes.NewBuffer(payload))
		if err != nil {
			respondError(w, http.StatusInternalServerError, "proxy request build failed")
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			respondError(w, http.StatusBadGateway, "AI service unavailable")
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body) //nolint:errcheck
	}
}
