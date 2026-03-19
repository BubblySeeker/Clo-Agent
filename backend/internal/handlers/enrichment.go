package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type Enrichment struct {
	ID            string  `json:"id"`
	ContactID     string  `json:"contact_id"`
	FieldName     string  `json:"field_name"`
	OldValue      *string `json:"old_value"`
	NewValue      string  `json:"new_value"`
	Source        string  `json:"source"`
	SourceEmailID *string `json:"source_email_id"`
	Confidence    string  `json:"confidence"`
	Status        string  `json:"status"`
	Evidence      string  `json:"evidence,omitempty"`
	CreatedAt     string  `json:"created_at"`
}

// TriggerEnrichment proxies to the AI service to analyze a contact's emails.
func TriggerEnrichment(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		payload, _ := json.Marshal(map[string]string{
			"contact_id": contactID,
			"agent_id":   agentID,
		})

		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
			cfg.AIServiceURL+"/ai/enrich-contact", bytes.NewBuffer(payload))
		if err != nil {
			respondError(w, http.StatusInternalServerError, "proxy request build failed")
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

		client := &http.Client{Timeout: 60 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			respondError(w, http.StatusBadGateway, "AI service unavailable")
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body) //nolint:errcheck
	}
}

// ListEnrichments returns enrichment suggestions for a contact.
func ListEnrichments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		status := r.URL.Query().Get("status")

		query := `SELECT id, contact_id, field_name, old_value, new_value, source,
		                 source_email_id, confidence, status, created_at
		          FROM contact_enrichments WHERE contact_id = $1`
		args := []interface{}{contactID}

		if status != "" {
			query += " AND status = $2"
			args = append(args, status)
		}
		query += " ORDER BY created_at DESC"

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		enrichments := make([]Enrichment, 0)
		for rows.Next() {
			var e Enrichment
			var createdAt time.Time
			err := rows.Scan(&e.ID, &e.ContactID, &e.FieldName, &e.OldValue,
				&e.NewValue, &e.Source, &e.SourceEmailID, &e.Confidence,
				&e.Status, &createdAt)
			if err != nil {
				continue
			}
			e.CreatedAt = createdAt.Format(time.RFC3339)
			enrichments = append(enrichments, e)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"enrichments": enrichments,
		})
	}
}

// AcceptEnrichment accepts a single enrichment and applies it to the contact/buyer profile.
func AcceptEnrichment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		enrichmentID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var e Enrichment
		var createdAt time.Time
		err = tx.QueryRow(r.Context(),
			`SELECT id, contact_id, field_name, old_value, new_value, source,
			        source_email_id, confidence, status, created_at
			 FROM contact_enrichments WHERE id = $1`, enrichmentID,
		).Scan(&e.ID, &e.ContactID, &e.FieldName, &e.OldValue, &e.NewValue,
			&e.Source, &e.SourceEmailID, &e.Confidence, &e.Status, &createdAt)
		if err != nil {
			respondError(w, http.StatusNotFound, "enrichment not found")
			return
		}

		if e.Status != "pending" {
			respondError(w, http.StatusBadRequest, "enrichment already processed")
			return
		}

		if err := applyEnrichment(r.Context(), tx, e); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to apply enrichment")
			return
		}

		_, err = tx.Exec(r.Context(),
			`UPDATE contact_enrichments SET status = 'accepted' WHERE id = $1`, enrichmentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update status")
			return
		}

		tx.Commit(r.Context())
		e.Status = "accepted"
		e.CreatedAt = createdAt.Format(time.RFC3339)
		respondJSON(w, http.StatusOK, e)
	}
}

// RejectEnrichment rejects a single enrichment.
func RejectEnrichment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		enrichmentID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(),
			`UPDATE contact_enrichments SET status = 'rejected' WHERE id = $1 AND status = 'pending'`,
			enrichmentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update status")
			return
		}
		if tag.RowsAffected() == 0 {
			respondError(w, http.StatusNotFound, "enrichment not found or already processed")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
	}
}

// AcceptAllEnrichments accepts all pending enrichments for a contact.
func AcceptAllEnrichments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		rows, err := tx.Query(r.Context(),
			`SELECT id, contact_id, field_name, old_value, new_value, source,
			        source_email_id, confidence, status, created_at
			 FROM contact_enrichments WHERE contact_id = $1 AND status = 'pending'
			 ORDER BY created_at DESC`,
			contactID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var pending []Enrichment
		for rows.Next() {
			var e Enrichment
			var createdAt time.Time
			if err := rows.Scan(&e.ID, &e.ContactID, &e.FieldName, &e.OldValue,
				&e.NewValue, &e.Source, &e.SourceEmailID, &e.Confidence,
				&e.Status, &createdAt); err != nil {
				continue
			}
			e.CreatedAt = createdAt.Format(time.RFC3339)
			pending = append(pending, e)
		}

		accepted := 0
		for _, e := range pending {
			if err := applyEnrichment(r.Context(), tx, e); err != nil {
				continue
			}
			_, err := tx.Exec(r.Context(),
				`UPDATE contact_enrichments SET status = 'accepted' WHERE id = $1`, e.ID)
			if err != nil {
				continue
			}
			accepted++
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"accepted": accepted,
			"total":    len(pending),
		})
	}
}

// allowedContactFields and allowedBuyerFields whitelist valid column names for SQL safety.
var allowedContactFields = map[string]bool{"phone": true, "source": true}
var allowedBuyerFields = map[string]bool{
	"budget_min": true, "budget_max": true, "bedrooms": true, "bathrooms": true,
	"property_type": true, "pre_approved": true, "timeline": true,
}
var allowedArrayFields = map[string]bool{
	"locations": true, "must_haves": true, "deal_breakers": true,
}

func applyEnrichment(ctx context.Context, tx pgx.Tx, e Enrichment) error {
	if allowedContactFields[e.FieldName] {
		query := fmt.Sprintf("UPDATE contacts SET %s = $1 WHERE id = $2", e.FieldName)
		_, err := tx.Exec(ctx, query, e.NewValue, e.ContactID)
		return err
	}

	if allowedBuyerFields[e.FieldName] || allowedArrayFields[e.FieldName] {
		// Ensure buyer_profile exists
		var exists bool
		tx.QueryRow(ctx,
			"SELECT EXISTS(SELECT 1 FROM buyer_profiles WHERE contact_id = $1)",
			e.ContactID).Scan(&exists)
		if !exists {
			if _, err := tx.Exec(ctx,
				"INSERT INTO buyer_profiles (contact_id) VALUES ($1)", e.ContactID); err != nil {
				return err
			}
		}

		if allowedArrayFields[e.FieldName] {
			query := fmt.Sprintf("UPDATE buyer_profiles SET %s = $1, updated_at = NOW() WHERE contact_id = $2", e.FieldName)
			parts := strings.Split(e.NewValue, ",")
			trimmed := make([]string, 0, len(parts))
			for _, p := range parts {
				if s := strings.TrimSpace(p); s != "" {
					trimmed = append(trimmed, s)
				}
			}
			_, err := tx.Exec(ctx, query, trimmed, e.ContactID)
			return err
		}

		query := fmt.Sprintf("UPDATE buyer_profiles SET %s = $1, updated_at = NOW() WHERE contact_id = $2", e.FieldName)
		_, err := tx.Exec(ctx, query, e.NewValue, e.ContactID)
		return err
	}

	return nil
}
