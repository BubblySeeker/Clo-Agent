package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// GetDemoDataStatus returns whether demo data is currently active for the agent.
func GetDemoDataStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		// Check if the known demo contact exists
		var count int
		tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM contacts WHERE id = 'c0000000-0000-0000-0000-000000000001'`,
		).Scan(&count)
		tx.Commit(r.Context())

		respondJSON(w, http.StatusOK, map[string]bool{"active": count > 0})
	}
}

// SeedDemoData inserts sample CRM data for the authenticated agent.
func SeedDemoData(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		// Check if demo data already exists
		var count int
		tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM contacts WHERE id = 'c0000000-0000-0000-0000-000000000001'`,
		).Scan(&count)
		if count > 0 {
			respondJSON(w, http.StatusOK, map[string]string{"status": "already_active"})
			return
		}

		// Insert all demo data in one batch to minimize round-trips
		stmts := demoDataSQL(agentID)
		batch := ""
		for _, s := range stmts {
			batch += s + ";\n"
		}
		if _, err := tx.Exec(r.Context(), batch); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "failed to seed demo data", ErrCodeDatabase)
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "failed to commit demo data", ErrCodeDatabase)
			return
		}

		respondJSON(w, http.StatusOK, map[string]string{"status": "seeded"})
	}
}

// ClearDemoData removes all demo data for the authenticated agent.
func ClearDemoData(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		// Delete in dependency order (children first)
		deletes := []string{
			`DELETE FROM workflow_runs WHERE workflow_id IN (SELECT id FROM workflows WHERE id IN ('00000000-0000-0000-0004-000000000001','00000000-0000-0000-0004-000000000002','00000000-0000-0000-0004-000000000003'))`,
			`DELETE FROM workflows WHERE id IN ('00000000-0000-0000-0004-000000000001','00000000-0000-0000-0004-000000000002','00000000-0000-0000-0004-000000000003')`,
			`DELETE FROM portal_tokens WHERE id IN ('00000000-0000-0000-0003-000000000001','00000000-0000-0000-0003-000000000002')`,
			`DELETE FROM messages WHERE conversation_id IN ('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002')`,
			`DELETE FROM conversations WHERE id IN ('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002')`,
			`DELETE FROM activities WHERE id::text LIKE 'ac000000-0000-0000-0000-%'`,
			`DELETE FROM ai_profiles WHERE id::text LIKE 'a0000000-0000-0000-0001-%'`,
			`DELETE FROM buyer_profiles WHERE id::text LIKE 'b0000000-0000-0000-0000-%'`,
			`DELETE FROM deals WHERE id::text LIKE 'd0000000-0000-0000-0000-%'`,
			`DELETE FROM contacts WHERE id::text LIKE 'c0000000-0000-0000-0000-%'`,
			`DELETE FROM properties WHERE id::text LIKE 'e0000000-0000-0000-0000-%'`,
			`DELETE FROM contact_folders WHERE id::text LIKE 'f0000000-0000-0000-0000-%'`,
		}

		batch := ""
		for _, s := range deletes {
			batch += s + ";\n"
		}
		if _, err := tx.Exec(r.Context(), batch); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "failed to clear demo data", ErrCodeDatabase)
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "failed to commit", ErrCodeDatabase)
			return
		}

		respondJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
	}
}
