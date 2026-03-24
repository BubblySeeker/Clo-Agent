package middleware

import (
	"log/slog"
	"net/http"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// responseWriter wraps http.ResponseWriter to capture the HTTP status code
// written by downstream handlers.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// StructuredLogger returns a Chi-compatible middleware that logs every HTTP
// request as a structured JSON log line using log/slog.
//
// Fields logged per request:
//   - request_id  — from Chi's RequestID middleware (X-Request-Id header)
//   - method      — HTTP method (GET, POST, …)
//   - path        — URL path
//   - status      — response status code
//   - duration_ms — wall-clock time for the handler in milliseconds
//   - agent_id    — internal agent UUID if the request is authenticated (may be empty)
//
// Log level:
//   - INFO  for 2xx / 3xx
//   - WARN  for 4xx
//   - ERROR for 5xx
func StructuredLogger() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rw, r)

			duration := time.Since(start).Milliseconds()
			requestID := chimiddleware.GetReqID(r.Context())
			agentID := AgentUUIDFromContext(r.Context())

			attrs := []any{
				"request_id",  requestID,
				"method",      r.Method,
				"path",        r.URL.Path,
				"status",      rw.status,
				"duration_ms", duration,
			}
			if agentID != "" {
				attrs = append(attrs, "agent_id", agentID)
			}

			switch {
			case rw.status >= 500:
				slog.Error("request completed", attrs...)
			case rw.status >= 400:
				slog.Warn("request completed", attrs...)
			default:
				slog.Info("request completed", attrs...)
			}
		})
	}
}
