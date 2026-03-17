package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"crm-api/internal/config"
	"crm-api/internal/middleware"
)

// SemanticSearch proxies search requests to the Python AI service.
func SemanticSearch(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if body.Query == "" {
			respondError(w, http.StatusBadRequest, "query is required")
			return
		}
		if body.Limit <= 0 {
			body.Limit = 10
		}

		payload, _ := json.Marshal(map[string]interface{}{
			"query":    body.Query,
			"agent_id": agentID,
			"limit":    body.Limit,
		})

		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
			cfg.AIServiceURL+"/ai/search", bytes.NewBuffer(payload))
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
