package middleware

import (
	"net/http"

	"github.com/rs/cors"
)

// CORSHandler returns an HTTP middleware that applies permissive-but-secure CORS
// headers suitable for a production API. Adjust AllowedOrigins before deploying.
func CORSHandler() func(http.Handler) http.Handler {
	c := cors.New(cors.Options{
		// In production replace the wildcard with your actual frontend origin(s),
		// e.g. []string{"https://app.example.com"}.
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPut,
			http.MethodPatch,
			http.MethodDelete,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",
			"X-Request-ID",
		},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: false,
		MaxAge:           300, // 5 minutes preflight cache
	})

	return c.Handler
}
