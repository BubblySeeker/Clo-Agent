package handlers

import (
	"encoding/json"
	"net/http"
)

// healthResponse is the JSON body returned by the health endpoint.
type healthResponse struct {
	Status string `json:"status"`
}

// Health handles GET /health and returns a 200 OK with a JSON status body.
// It is intentionally lightweight — no DB ping — so that load-balancers can
// poll it at high frequency without impacting the connection pool.
func Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(healthResponse{Status: "ok"}); err != nil {
		// Encoding errors are extremely rare and non-actionable at this point,
		// but log them in case something goes wrong with the response writer.
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}
