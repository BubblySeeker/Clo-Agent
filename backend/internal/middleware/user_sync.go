package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/clerkinc/clerk-sdk-go/clerk"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
)

const (
	// AgentUUIDKey is the context key for the resolved internal agent UUID.
	AgentUUIDKey contextKey = "agentUUID"
)

// AgentUUIDFromContext retrieves the internal agent UUID from the request context.
func AgentUUIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(AgentUUIDKey).(string)
	return id
}

// UserSync resolves the Clerk user ID stored by ClerkAuth into an internal
// users.id UUID, creating the user row on first login. The agent UUID is then
// stored in the request context under AgentUUIDKey.
func UserSync(pool *pgxpool.Pool, clerkClient clerk.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// If AgentUUIDKey is already set (e.g., by service-to-service auth bypass),
			// skip the Clerk user lookup and upsert.
			if AgentUUIDFromContext(r.Context()) != "" {
				next.ServeHTTP(w, r)
				return
			}

			clerkID := UserIDFromContext(r.Context())
			if clerkID == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Fetch user profile from Clerk to get email and name.
			email := clerkID + "@unknown.com"
			name := "Agent"

			clerkUser, err := clerkClient.Users().Read(clerkID)
			if err != nil {
				slog.Warn("could not fetch Clerk user profile", "clerk_id", clerkID, "error", err)
			} else {
				// Build name from first + last.
				first, last := "", ""
				if clerkUser.FirstName != nil {
					first = *clerkUser.FirstName
				}
				if clerkUser.LastName != nil {
					last = *clerkUser.LastName
				}
				if n := strings.TrimSpace(first + " " + last); n != "" {
					name = n
				}
				// Use primary email address.
				if len(clerkUser.EmailAddresses) > 0 {
					email = clerkUser.EmailAddresses[0].EmailAddress
				}
			}

			// Upsert user row — creates on first login, updates name/email on subsequent logins.
			var agentID string
			err = pool.QueryRow(r.Context(),
				`INSERT INTO users (clerk_id, email, name)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (clerk_id) DO UPDATE
				   SET email = EXCLUDED.email,
				       name  = EXCLUDED.name
				 RETURNING id`,
				clerkID, email, name,
			).Scan(&agentID)

			if err != nil {
				slog.Error("user sync failed", "clerk_id", clerkID, "error", err)
				http.Error(w, `{"error":"user sync failed"}`, http.StatusInternalServerError)
				return
			}

			// Adopt demo seed data: if a demo user exists and this is a different
			// user, reassign all demo data to the real user and delete the demo row.
			// Uses a transaction with RLS set to the demo user so updates can see the rows.
			const demoClerkID = "demo_clerk_id_001"
			if clerkID != demoClerkID {
				var demoID string
				demoErr := pool.QueryRow(r.Context(),
					`SELECT id FROM users WHERE clerk_id = $1`, demoClerkID,
				).Scan(&demoID)
				if demoErr == nil && demoID != "" && demoID != agentID {
					tx, txErr := database.BeginWithRLS(r.Context(), pool, demoID)
					if txErr == nil {
						tables := []string{
							"contacts", "deals", "activities", "conversations",
							"ai_profiles", "embeddings", "pending_actions", "workflows",
							"workflow_runs", "properties", "portal_settings", "portal_tokens",
							"contact_folders",
						}
						adoptOK := true
						for _, table := range tables {
							_, execErr := tx.Exec(r.Context(),
								"UPDATE "+table+" SET agent_id = $1 WHERE agent_id = $2",
								agentID, demoID,
							)
							if execErr != nil {
								slog.Warn("demo adopt: failed to update table", "table", table, "error", execErr)
								adoptOK = false
							}
						}
						if adoptOK {
							// Delete demo user within same transaction
							_, _ = tx.Exec(r.Context(), `DELETE FROM users WHERE id = $1`, demoID)
							if commitErr := tx.Commit(r.Context()); commitErr != nil {
								slog.Error("demo adopt: commit failed", "error", commitErr)
							} else {
								slog.Info("adopted demo seed data", "agent_id", agentID, "demo_id", demoID)
							}
						} else {
							tx.Rollback(r.Context())
						}
					}
				}
			}

			ctx := context.WithValue(r.Context(), AgentUUIDKey, agentID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
