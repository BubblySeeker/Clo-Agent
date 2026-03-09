package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/clerkinc/clerk-sdk-go/clerk"
)

// contextKey is an unexported type for context keys in this package,
// preventing collisions with keys defined in other packages.
type contextKey string

const (
	// UserIDKey is the context key under which the authenticated Clerk user ID is stored.
	UserIDKey contextKey = "userID"
)

// UserIDFromContext retrieves the authenticated user ID from the request context.
// Returns an empty string if the key is absent.
func UserIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(UserIDKey).(string)
	return id
}

// ClerkAuth returns an HTTP middleware that validates Clerk session tokens supplied
// as Bearer tokens in the Authorization header. On success the verified user ID is
// injected into the request context. On failure a 401 is returned immediately.
func ClerkAuth(client clerk.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "Authorization header is required", http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				http.Error(w, "Authorization header must be in the format: Bearer <token>", http.StatusUnauthorized)
				return
			}

			sessionToken := strings.TrimSpace(parts[1])
			if sessionToken == "" {
				http.Error(w, "Bearer token must not be empty", http.StatusUnauthorized)
				return
			}

			// Verify the session token with Clerk.
			claims, err := client.VerifyToken(sessionToken)
			if err != nil {
				http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
				return
			}

			// Store the subject (Clerk user ID) in the request context.
			ctx := context.WithValue(r.Context(), UserIDKey, claims.Subject)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
