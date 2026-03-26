package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
	"crm-api/internal/scoring"
)

type Contact struct {
	ID                string          `json:"id"`
	AgentID           string          `json:"agent_id"`
	FirstName         string          `json:"first_name"`
	LastName          string          `json:"last_name"`
	Email             *string         `json:"email"`
	Phone             *string         `json:"phone"`
	Source            *string         `json:"source"`
	FolderID          *string         `json:"folder_id"`
	FolderName        *string         `json:"folder_name"`
	LeadScore         int             `json:"lead_score"`
	LeadScoreSignals  json.RawMessage `json:"lead_score_signals"`
	PreviousLeadScore *int            `json:"previous_lead_score"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

func ListContacts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		search := r.URL.Query().Get("search")
		source := r.URL.Query().Get("source")
		folderFilter := r.URL.Query().Get("folder_id")
		sortParam := r.URL.Query().Get("sort")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 25
		}
		offset := (page - 1) * limit

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var args []interface{}
		whereExpr := "1=1"

		if search != "" {
			args = append(args, "%"+search+"%")
			n := len(args)
			whereExpr += fmt.Sprintf(" AND (c.first_name ILIKE $%d OR c.last_name ILIKE $%d OR c.email ILIKE $%d)", n, n, n)
		}
		if source != "" {
			args = append(args, source)
			whereExpr += fmt.Sprintf(" AND c.source = $%d", len(args))
		}
		if folderFilter == "unfiled" {
			whereExpr += " AND c.folder_id IS NULL"
		} else if folderFilter != "" {
			args = append(args, folderFilter)
			whereExpr += fmt.Sprintf(" AND c.folder_id = $%d", len(args))
		}

		var total int
		countSQL := "SELECT COUNT(*) FROM contacts c WHERE " + whereExpr
		if err := tx.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "count error", ErrCodeDatabase)
			return
		}

		orderClause := "c.created_at DESC"
		if sortParam == "score" {
			orderClause = "c.lead_score DESC, c.created_at DESC"
		}

		dataArgs := append(append([]interface{}{}, args...), limit, offset)
		dataSQL := fmt.Sprintf(
			`SELECT c.id, c.agent_id, c.first_name, c.last_name, c.email, c.phone, c.source,
			        c.folder_id, cf.name,
			        c.lead_score, c.lead_score_signals, c.previous_lead_score,
			        c.created_at, c.updated_at
			 FROM contacts c
			 LEFT JOIN contact_folders cf ON cf.id = c.folder_id
			 WHERE %s ORDER BY %s LIMIT $%d OFFSET $%d`,
			whereExpr, orderClause, len(dataArgs)-1, len(dataArgs),
		)

		rows, err := tx.Query(r.Context(), dataSQL, dataArgs...)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		contacts := make([]Contact, 0)
		for rows.Next() {
			var c Contact
			if err := rows.Scan(&c.ID, &c.AgentID, &c.FirstName, &c.LastName, &c.Email, &c.Phone, &c.Source, &c.FolderID, &c.FolderName, &c.LeadScore, &c.LeadScoreSignals, &c.PreviousLeadScore, &c.CreatedAt, &c.UpdatedAt); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			contacts = append(contacts, c)
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "commit error", ErrCodeDatabase)
			return
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"contacts": contacts,
			"total":    total,
		})
	}
}

func GetContact(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var c Contact
		err = tx.QueryRow(r.Context(),
			`SELECT c.id, c.agent_id, c.first_name, c.last_name, c.email, c.phone, c.source,
			        c.folder_id, cf.name,
			        c.lead_score, c.lead_score_signals, c.previous_lead_score,
			        c.created_at, c.updated_at
			 FROM contacts c
			 LEFT JOIN contact_folders cf ON cf.id = c.folder_id
			 WHERE c.id = $1`,
			id,
		).Scan(&c.ID, &c.AgentID, &c.FirstName, &c.LastName, &c.Email, &c.Phone, &c.Source, &c.FolderID, &c.FolderName, &c.LeadScore, &c.LeadScoreSignals, &c.PreviousLeadScore, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "contact not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, c)
	}
}

func CreateContact(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			FirstName string  `json:"first_name"`
			LastName  string  `json:"last_name"`
			Email     *string `json:"email"`
			Phone     *string `json:"phone"`
			Source    *string `json:"source"`
			FolderID  *string `json:"folder_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}
		if body.FirstName == "" || body.LastName == "" {
			respondErrorWithCode(w, http.StatusBadRequest, "first_name and last_name are required", ErrCodeBadRequest)
			return
		}
		// Input validation
		for _, v := range []struct {
			f, val string
			max    int
		}{
			{"first_name", body.FirstName, 100},
			{"last_name", body.LastName, 100},
		} {
			if err := validateMaxLen(v.f, v.val, v.max); err != nil {
				respondErrorWithCode(w, http.StatusBadRequest, err.Error(), ErrCodeBadRequest)
				return
			}
		}
		if body.Email != nil {
			if err := validateEmail(*body.Email); err != nil {
				respondErrorWithCode(w, http.StatusBadRequest, err.Error(), ErrCodeBadRequest)
				return
			}
		}
		if body.Phone != nil {
			if err := validateMaxLen("phone", *body.Phone, 20); err != nil {
				respondErrorWithCode(w, http.StatusBadRequest, err.Error(), ErrCodeBadRequest)
				return
			}
		}
		if body.Source != nil {
			if err := validateMaxLen("source", *body.Source, 50); err != nil {
				respondErrorWithCode(w, http.StatusBadRequest, err.Error(), ErrCodeBadRequest)
				return
			}
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var c Contact
		err = tx.QueryRow(r.Context(),
			`INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source, folder_id)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 RETURNING id, agent_id, first_name, last_name, email, phone, source, folder_id, NULL::text,
			           lead_score, lead_score_signals, previous_lead_score, created_at, updated_at`,
			agentID, body.FirstName, body.LastName, body.Email, body.Phone, body.Source, body.FolderID,
		).Scan(&c.ID, &c.AgentID, &c.FirstName, &c.LastName, &c.Email, &c.Phone, &c.Source, &c.FolderID, &c.FolderName, &c.LeadScore, &c.LeadScoreSignals, &c.PreviousLeadScore, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "create failed", ErrCodeDatabase)
			return
		}

		// Auto-create a deal in "Lead" stage for every new contact
		_, _ = tx.Exec(r.Context(),
			`INSERT INTO deals (contact_id, agent_id, stage_id, title)
			 SELECT $1, $2, id, $3
			 FROM deal_stages WHERE LOWER(name) = 'lead' LIMIT 1`,
			c.ID, agentID, body.FirstName+" "+body.LastName,
		)

		// Auto-create a document folder for the contact
		_, _ = tx.Exec(r.Context(),
			`INSERT INTO document_folders (agent_id, name, contact_id) VALUES ($1, $2, $3)
			 ON CONFLICT DO NOTHING`,
			agentID, body.FirstName+" "+body.LastName, c.ID,
		)

		// Compute lead score for the new contact
		if err := scoring.ComputeLeadScore(r.Context(), tx, c.ID); err != nil {
			log.Printf("scoring: ComputeLeadScore failed for contact %s: %v", c.ID, err)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, c)
	}
}

func UpdateContact(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		// Build partial update
		setClauses := "updated_at = NOW()"
		args := []interface{}{}
		allowed := []string{"first_name", "last_name", "email", "phone", "source", "folder_id"}
		for _, field := range allowed {
			if val, ok := body[field]; ok {
				args = append(args, val)
				setClauses += fmt.Sprintf(", %s = $%d", field, len(args))
			}
		}
		args = append(args, id)

		var c Contact
		err = tx.QueryRow(r.Context(),
			fmt.Sprintf(`UPDATE contacts SET %s WHERE id = $%d
			 RETURNING id, agent_id, first_name, last_name, email, phone, source, folder_id,
			 (SELECT name FROM contact_folders WHERE id = contacts.folder_id),
			 lead_score, lead_score_signals, previous_lead_score,
			 created_at, updated_at`, setClauses, len(args)),
			args...,
		).Scan(&c.ID, &c.AgentID, &c.FirstName, &c.LastName, &c.Email, &c.Phone, &c.Source, &c.FolderID, &c.FolderName, &c.LeadScore, &c.LeadScoreSignals, &c.PreviousLeadScore, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "contact not found", ErrCodeNotFound)
			return
		}

		// Recompute lead score after contact update
		if err := scoring.ComputeLeadScore(r.Context(), tx, c.ID); err != nil {
			log.Printf("scoring: ComputeLeadScore failed for contact %s: %v", c.ID, err)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, c)
	}
}

func DeleteContact(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `DELETE FROM contacts WHERE id = $1`, id)
		if err != nil || result.RowsAffected() == 0 {
			respondErrorWithCode(w, http.StatusNotFound, "contact not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}

func GoingColdCount(pool *pgxpool.Pool) http.HandlerFunc {
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

		var count int
		err = tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM contacts c
			 WHERE c.lead_score < 20
			 AND NOT EXISTS (
			     SELECT 1 FROM activities a
			     WHERE a.contact_id = c.id
			     AND a.created_at > NOW() - INTERVAL '14 days'
			 )`).Scan(&count)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]int{"count": count})
	}
}
