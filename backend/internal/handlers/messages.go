package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	Role           string    `json:"role"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
}

func GetMessages(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		convID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		rows, err := tx.Query(r.Context(),
			`SELECT id, conversation_id, role, content, created_at
			 FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
			convID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		messages := make([]Message, 0)
		for rows.Next() {
			var m Message
			if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
				respondError(w, http.StatusInternalServerError, "scan error")
				return
			}
			messages = append(messages, m)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, messages)
	}
}

// SendMessage saves the user message to the DB, then proxies to the AI service
// and streams the SSE response back to the frontend client.
func SendMessage(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		convID := chi.URLParam(r, "id")

		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
			respondError(w, http.StatusBadRequest, "content is required")
			return
		}

		// Persist user message in a separate committed transaction.
		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		_, err = tx.Exec(r.Context(),
			`INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
			convID, body.Content,
		)
		if err != nil {
			tx.Rollback(r.Context())
			respondError(w, http.StatusInternalServerError, "failed to save message")
			return
		}

		// Auto-set conversation title from first user message
		var msgCount int
		_ = tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM messages WHERE conversation_id = $1`,
			convID,
		).Scan(&msgCount)
		if msgCount == 1 {
			title := body.Content
			if len(title) > 50 {
				title = title[:50] + "…"
			}
			_, _ = tx.Exec(r.Context(),
				`UPDATE conversations SET title = $1 WHERE id = $2`,
				title, convID,
			)
		}

		tx.Commit(r.Context())

		// If AI service is not configured, fall back to placeholder.
		if cfg.AIServiceURL == "" || cfg.AIServiceSecret == "" {
			respondJSON(w, http.StatusOK, map[string]string{
				"error": "AI service not configured",
			})
			return
		}

		// Build proxy request to AI service.
		payload, _ := json.Marshal(map[string]string{
			"conversation_id": convID,
			"agent_id":        agentID,
			"content":         body.Content,
		})
		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
			cfg.AIServiceURL+"/ai/messages", bytes.NewBuffer(payload))
		if err != nil {
			respondError(w, http.StatusInternalServerError, "proxy request build failed")
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

		aiClient := &http.Client{Timeout: 5 * time.Minute}
		resp, err := aiClient.Do(req)
		if err != nil {
			respondError(w, http.StatusBadGateway, "AI service unavailable")
			return
		}
		defer resp.Body.Close()

		// Extend write deadline for SSE streaming.
		if rc := http.NewResponseController(w); rc != nil {
			_ = rc.SetWriteDeadline(time.Now().Add(5 * time.Minute))
		}

		// Set SSE headers and stream response through.
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
}
