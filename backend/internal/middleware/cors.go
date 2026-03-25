package middleware

import (
	"net/http"

	"github.com/rs/cors"
)

// CORSHandler returns an HTTP middleware that restricts cross-origin requests
// to the specified allowed origins. Pass your frontend URL(s) here.
func CORSHandler(allowedOrigins []string) func(http.Handler) http.Handler {
	c := cors.New(cors.Options{
		AllowedOrigins: allowedOrigins,
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
