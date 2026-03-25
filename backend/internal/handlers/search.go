package handlers

import (
	"net/http"

	"crm-api/internal/config"
)

// SemanticSearch proxies search requests to the Python AI service.
// TODO: Re-implement AI search logic
func SemanticSearch(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		respondErrorWithCode(w, http.StatusNotImplemented, "AI service not yet implemented", ErrCodeInternal)
	}
}
