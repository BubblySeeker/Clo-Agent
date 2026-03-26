package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// LeadSuggestion represents a potential lead detected from an unmatched email.
type LeadSuggestion struct {
	ID                 string    `json:"id"`
	AgentID            string    `json:"agent_id"`
	EmailID            string    `json:"email_id"`
	FromAddress        string    `json:"from_address"`
	FromName           *string   `json:"from_name"`
	SuggestedFirstName *string   `json:"suggested_first_name"`
	SuggestedLastName  *string   `json:"suggested_last_name"`
	SuggestedPhone     *string   `json:"suggested_phone"`
	SuggestedIntent    *string   `json:"suggested_intent"`
	Confidence         float32   `json:"confidence"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"created_at"`
	// Joined from emails table
	Subject   *string `json:"subject"`
	Snippet   *string `json:"snippet"`
	EmailDate *string `json:"email_date"`
}

// ListLeadSuggestions returns pending lead suggestions for the agent.
// GET /api/lead-suggestions
func ListLeadSuggestions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		status := r.URL.Query().Get("status")
		if status == "" {
			status = "pending"
		}

		rows, err := tx.Query(r.Context(),
			`SELECT ls.id, ls.agent_id, ls.email_id, ls.from_address, ls.from_name,
			        ls.suggested_first_name, ls.suggested_last_name, ls.suggested_phone,
			        ls.suggested_intent, ls.confidence, ls.status, ls.created_at,
			        e.subject, e.snippet, e.email_date::text
			 FROM lead_suggestions ls
			 JOIN emails e ON e.id = ls.email_id
			 WHERE ls.status = $1
			 ORDER BY ls.created_at DESC
			 LIMIT 50`,
			status,
		)
		if err != nil {
			slog.Error("list lead suggestions failed", "error", err)
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer rows.Close()

		var suggestions []LeadSuggestion
		for rows.Next() {
			var s LeadSuggestion
			err := rows.Scan(
				&s.ID, &s.AgentID, &s.EmailID, &s.FromAddress, &s.FromName,
				&s.SuggestedFirstName, &s.SuggestedLastName, &s.SuggestedPhone,
				&s.SuggestedIntent, &s.Confidence, &s.Status, &s.CreatedAt,
				&s.Subject, &s.Snippet, &s.EmailDate,
			)
			if err != nil {
				slog.Warn("scan lead suggestion failed", "error", err)
				continue
			}
			suggestions = append(suggestions, s)
		}

		tx.Commit(r.Context())

		if suggestions == nil {
			suggestions = []LeadSuggestion{}
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"suggestions": suggestions,
			"total":       len(suggestions),
		})
	}
}

// AcceptLeadSuggestion creates a contact from the suggestion and links the email.
// POST /api/lead-suggestions/{id}/accept
func AcceptLeadSuggestion(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		suggestionID := chi.URLParam(r, "id")
		if suggestionID == "" {
			respondError(w, http.StatusBadRequest, "missing suggestion ID")
			return
		}

		// Allow optional overrides in request body
		var overrides struct {
			FirstName *string `json:"first_name"`
			LastName  *string `json:"last_name"`
			Phone     *string `json:"phone"`
		}
		if r.Body != nil {
			json.NewDecoder(r.Body).Decode(&overrides)
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		// Fetch the suggestion
		var s LeadSuggestion
		err = tx.QueryRow(r.Context(),
			`SELECT id, email_id, from_address, from_name,
			        suggested_first_name, suggested_last_name, suggested_phone, suggested_intent, status
			 FROM lead_suggestions WHERE id = $1`,
			suggestionID,
		).Scan(&s.ID, &s.EmailID, &s.FromAddress, &s.FromName,
			&s.SuggestedFirstName, &s.SuggestedLastName, &s.SuggestedPhone, &s.SuggestedIntent, &s.Status)
		if err != nil {
			respondError(w, http.StatusNotFound, "suggestion not found")
			return
		}

		if s.Status != "pending" {
			respondError(w, http.StatusBadRequest, "suggestion already "+s.Status)
			return
		}

		// Determine names (overrides take priority)
		firstName := "Unknown"
		lastName := "Lead"
		if overrides.FirstName != nil && *overrides.FirstName != "" {
			firstName = *overrides.FirstName
		} else if s.SuggestedFirstName != nil && *s.SuggestedFirstName != "" {
			firstName = *s.SuggestedFirstName
		} else if s.FromName != nil && *s.FromName != "" {
			firstName = *s.FromName
		}
		if overrides.LastName != nil && *overrides.LastName != "" {
			lastName = *overrides.LastName
		} else if s.SuggestedLastName != nil && *s.SuggestedLastName != "" {
			lastName = *s.SuggestedLastName
		}

		phone := ""
		if overrides.Phone != nil {
			phone = *overrides.Phone
		} else if s.SuggestedPhone != nil {
			phone = *s.SuggestedPhone
		}

		// Create the contact
		var contactID string
		err = tx.QueryRow(r.Context(),
			`INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source)
			 VALUES ($1, $2, $3, $4, $5, 'Email Lead')
			 RETURNING id`,
			agentID, firstName, lastName, s.FromAddress, phone,
		).Scan(&contactID)
		if err != nil {
			slog.Error("create contact from lead failed", "error", err)
			respondError(w, http.StatusInternalServerError, "failed to create contact")
			return
		}

		// Link the email to the new contact
		tx.Exec(r.Context(),
			`UPDATE emails SET contact_id = $1 WHERE id = $2 AND agent_id = $3`,
			contactID, s.EmailID, agentID,
		)

		// Also link any other emails from the same address to this contact
		tx.Exec(r.Context(),
			`UPDATE emails SET contact_id = $1 WHERE from_address = $2 AND agent_id = $3 AND contact_id IS NULL`,
			contactID, s.FromAddress, agentID,
		)

		// Mark suggestion as accepted
		tx.Exec(r.Context(),
			`UPDATE lead_suggestions SET status = 'accepted' WHERE id = $1`,
			suggestionID,
		)

		// Also dismiss other suggestions from the same email address
		tx.Exec(r.Context(),
			`UPDATE lead_suggestions SET status = 'dismissed'
			 WHERE from_address = $1 AND agent_id = $2 AND status = 'pending' AND id != $3`,
			s.FromAddress, agentID, suggestionID,
		)

		tx.Commit(r.Context())

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"contact_id": contactID,
			"first_name": firstName,
			"last_name":  lastName,
			"email":      s.FromAddress,
			"message":    "Contact created and email linked",
		})
	}
}

// DismissLeadSuggestion marks a suggestion as dismissed.
// POST /api/lead-suggestions/{id}/dismiss
func DismissLeadSuggestion(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		suggestionID := chi.URLParam(r, "id")
		if suggestionID == "" {
			respondError(w, http.StatusBadRequest, "missing suggestion ID")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(),
			`UPDATE lead_suggestions SET status = 'dismissed' WHERE id = $1 AND status = 'pending'`,
			suggestionID,
		)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}

		if tag.RowsAffected() == 0 {
			respondError(w, http.StatusNotFound, "suggestion not found or already processed")
			return
		}

		tx.Commit(r.Context())

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"message": "Suggestion dismissed",
		})
	}
}
