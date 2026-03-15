package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type BuyerProfile struct {
	ID                string    `json:"id"`
	ContactID         string    `json:"contact_id"`
	BudgetMin         *float64  `json:"budget_min"`
	BudgetMax         *float64  `json:"budget_max"`
	Bedrooms          *int64    `json:"bedrooms"`
	Bathrooms         *float64  `json:"bathrooms"`
	Locations         []string  `json:"locations"`
	MustHaves         []string  `json:"must_haves"`
	DealBreakers      []string  `json:"deal_breakers"`
	PropertyType      *string   `json:"property_type"`
	PreApproved       bool      `json:"pre_approved"`
	PreApprovalAmount *float64  `json:"pre_approval_amount"`
	Timeline          *string   `json:"timeline"`
	Notes             *string   `json:"notes"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func GetBuyerProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var bp BuyerProfile
		err = tx.QueryRow(r.Context(),
			`SELECT id, contact_id, budget_min, budget_max, bedrooms, bathrooms,
			        COALESCE(locations, '{}'), COALESCE(must_haves, '{}'), COALESCE(deal_breakers, '{}'),
			        property_type, pre_approved, pre_approval_amount, timeline, notes, created_at, updated_at
			 FROM buyer_profiles WHERE contact_id = $1`,
			contactID,
		).Scan(
			&bp.ID, &bp.ContactID, &bp.BudgetMin, &bp.BudgetMax, &bp.Bedrooms, &bp.Bathrooms,
			&bp.Locations, &bp.MustHaves, &bp.DealBreakers,
			&bp.PropertyType, &bp.PreApproved, &bp.PreApprovalAmount, &bp.Timeline, &bp.Notes,
			&bp.CreatedAt, &bp.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusNotFound, "buyer profile not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, bp)
	}
}

func CreateBuyerProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		var body struct {
			BudgetMin         *float64 `json:"budget_min"`
			BudgetMax         *float64 `json:"budget_max"`
			Bedrooms          *int64   `json:"bedrooms"`
			Bathrooms         *float64 `json:"bathrooms"`
			Locations         []string `json:"locations"`
			MustHaves         []string `json:"must_haves"`
			DealBreakers      []string `json:"deal_breakers"`
			PropertyType      *string  `json:"property_type"`
			PreApproved       bool     `json:"pre_approved"`
			PreApprovalAmount *float64 `json:"pre_approval_amount"`
			Timeline          *string  `json:"timeline"`
			Notes             *string  `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		var bp BuyerProfile
		err = tx.QueryRow(r.Context(),
			`INSERT INTO buyer_profiles
			 (contact_id, budget_min, budget_max, bedrooms, bathrooms,
			  locations, must_haves, deal_breakers, property_type, pre_approved,
			  pre_approval_amount, timeline, notes)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			 RETURNING id, contact_id, budget_min, budget_max, bedrooms, bathrooms,
			           COALESCE(locations,'{}'), COALESCE(must_haves,'{}'), COALESCE(deal_breakers,'{}'),
			           property_type, pre_approved, pre_approval_amount, timeline, notes, created_at, updated_at`,
			contactID, body.BudgetMin, body.BudgetMax, body.Bedrooms, body.Bathrooms,
			body.Locations, body.MustHaves, body.DealBreakers, body.PropertyType, body.PreApproved,
			body.PreApprovalAmount, body.Timeline, body.Notes,
		).Scan(
			&bp.ID, &bp.ContactID, &bp.BudgetMin, &bp.BudgetMax, &bp.Bedrooms, &bp.Bathrooms,
			&bp.Locations, &bp.MustHaves, &bp.DealBreakers,
			&bp.PropertyType, &bp.PreApproved, &bp.PreApprovalAmount, &bp.Timeline, &bp.Notes,
			&bp.CreatedAt, &bp.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusConflict, "buyer profile already exists or create failed")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, bp)
	}
}

func UpdateBuyerProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		contactID := chi.URLParam(r, "id")

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON")
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "database error")
			return
		}
		defer tx.Rollback(r.Context())

		setClauses := "updated_at = NOW()"
		args := []interface{}{}
		allowed := []string{"budget_min", "budget_max", "bedrooms", "bathrooms", "locations",
			"must_haves", "deal_breakers", "property_type", "pre_approved",
			"pre_approval_amount", "timeline", "notes"}
		for _, field := range allowed {
			if val, ok := body[field]; ok {
				args = append(args, val)
				setClauses += fmt.Sprintf(", %s = $%d", field, len(args))
			}
		}
		args = append(args, contactID)

		var bp BuyerProfile
		err = tx.QueryRow(r.Context(),
			fmt.Sprintf(`UPDATE buyer_profiles SET %s WHERE contact_id = $%d
			 RETURNING id, contact_id, budget_min, budget_max, bedrooms, bathrooms,
			           COALESCE(locations,'{}'), COALESCE(must_haves,'{}'), COALESCE(deal_breakers,'{}'),
			           property_type, pre_approved, pre_approval_amount, timeline, notes, created_at, updated_at`,
				setClauses, len(args)),
			args...,
		).Scan(
			&bp.ID, &bp.ContactID, &bp.BudgetMin, &bp.BudgetMax, &bp.Bedrooms, &bp.Bathrooms,
			&bp.Locations, &bp.MustHaves, &bp.DealBreakers,
			&bp.PropertyType, &bp.PreApproved, &bp.PreApprovalAmount, &bp.Timeline, &bp.Notes,
			&bp.CreatedAt, &bp.UpdatedAt,
		)
		if err != nil {
			respondError(w, http.StatusNotFound, "buyer profile not found")
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, bp)
	}
}
