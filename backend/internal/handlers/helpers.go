package handlers

import (
	"encoding/json"
	"net/http"
)

// Error code constants for structured error responses.
const (
	ErrCodeNotFound        = "ERR_NOT_FOUND"
	ErrCodeBadRequest      = "ERR_BAD_REQUEST"
	ErrCodeUnauthorized    = "ERR_UNAUTHORIZED"
	ErrCodeForbidden       = "ERR_FORBIDDEN"
	ErrCodeDatabase        = "ERR_DATABASE"
	ErrCodeInternal        = "ERR_INTERNAL"
	ErrCodeConflict        = "ERR_CONFLICT"
	ErrCodePayloadTooLarge = "ERR_PAYLOAD_TOO_LARGE"
)

// respondJSON writes a JSON response with the given status code.
func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

// respondError writes a JSON error response (backward-compatible, no code field).
func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

// respondErrorWithCode writes a JSON error response with a structured error code.
// The code field allows frontends to distinguish error types programmatically.
func respondErrorWithCode(w http.ResponseWriter, status int, msg string, code string) {
	respondJSON(w, status, map[string]string{"error": msg, "code": code})
}
