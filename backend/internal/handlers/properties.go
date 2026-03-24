package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

type Property struct {
	ID           string          `json:"id"`
	AgentID      string          `json:"agent_id"`
	Address      string          `json:"address"`
	City         *string         `json:"city"`
	State        *string         `json:"state"`
	Zip          *string         `json:"zip"`
	Price        *float64        `json:"price"`
	Bedrooms     *int            `json:"bedrooms"`
	Bathrooms    *float64        `json:"bathrooms"`
	Sqft         *int            `json:"sqft"`
	PropertyType *string         `json:"property_type"`
	Status       string          `json:"status"`
	ListingType  *string         `json:"listing_type"`
	MlsID        *string         `json:"mls_id"`
	Description  *string         `json:"description"`
	Photos       json.RawMessage `json:"photos"`
	YearBuilt    *int            `json:"year_built"`
	LotSize      *float64        `json:"lot_size"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

const propertySelectCols = `id, agent_id, address, city, state, zip, price, bedrooms, bathrooms, sqft, property_type, status, listing_type, mls_id, description, photos, year_built, lot_size, created_at, updated_at`

func scanProperty(row interface{ Scan(...any) error }) (Property, error) {
	var p Property
	err := row.Scan(&p.ID, &p.AgentID, &p.Address, &p.City, &p.State, &p.Zip, &p.Price, &p.Bedrooms, &p.Bathrooms, &p.Sqft, &p.PropertyType, &p.Status, &p.ListingType, &p.MlsID, &p.Description, &p.Photos, &p.YearBuilt, &p.LotSize, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func ListProperties(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		search := r.URL.Query().Get("search")
		status := r.URL.Query().Get("status")
		propertyType := r.URL.Query().Get("property_type")
		listingType := r.URL.Query().Get("listing_type")
		minPrice := r.URL.Query().Get("min_price")
		maxPrice := r.URL.Query().Get("max_price")
		bedroomsStr := r.URL.Query().Get("bedrooms")
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
			whereExpr += fmt.Sprintf(" AND (address ILIKE $%d OR city ILIKE $%d OR mls_id ILIKE $%d)", n, n, n)
		}
		if status != "" {
			args = append(args, status)
			whereExpr += fmt.Sprintf(" AND status = $%d", len(args))
		}
		if propertyType != "" {
			args = append(args, propertyType)
			whereExpr += fmt.Sprintf(" AND property_type = $%d", len(args))
		}
		if listingType != "" {
			args = append(args, listingType)
			whereExpr += fmt.Sprintf(" AND listing_type = $%d", len(args))
		}
		if minPrice != "" {
			if v, err := strconv.ParseFloat(minPrice, 64); err == nil {
				args = append(args, v)
				whereExpr += fmt.Sprintf(" AND price >= $%d", len(args))
			}
		}
		if maxPrice != "" {
			if v, err := strconv.ParseFloat(maxPrice, 64); err == nil {
				args = append(args, v)
				whereExpr += fmt.Sprintf(" AND price <= $%d", len(args))
			}
		}
		if bedroomsStr != "" {
			if v, err := strconv.Atoi(bedroomsStr); err == nil {
				args = append(args, v)
				whereExpr += fmt.Sprintf(" AND bedrooms >= $%d", len(args))
			}
		}

		var total int
		countSQL := "SELECT COUNT(*) FROM properties WHERE " + whereExpr
		if err := tx.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "count error", ErrCodeDatabase)
			return
		}

		dataArgs := append(append([]interface{}{}, args...), limit, offset)
		dataSQL := fmt.Sprintf(
			"SELECT %s FROM properties WHERE %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d",
			propertySelectCols, whereExpr, len(dataArgs)-1, len(dataArgs),
		)

		rows, err := tx.Query(r.Context(), dataSQL, dataArgs...)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		properties := make([]Property, 0)
		for rows.Next() {
			p, err := scanProperty(rows)
			if err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			properties = append(properties, p)
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "commit error", ErrCodeDatabase)
			return
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"properties": properties,
			"total":      total,
		})
	}
}

func GetProperty(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		row := tx.QueryRow(r.Context(), fmt.Sprintf("SELECT %s FROM properties WHERE id = $1", propertySelectCols), id)
		p, err := scanProperty(row)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "property not found", ErrCodeNotFound)
			return
		}

		var dealsCount int
		_ = tx.QueryRow(r.Context(), "SELECT COUNT(*) FROM deals WHERE property_id = $1", id).Scan(&dealsCount)

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"id":            p.ID,
			"agent_id":      p.AgentID,
			"address":       p.Address,
			"city":          p.City,
			"state":         p.State,
			"zip":           p.Zip,
			"price":         p.Price,
			"bedrooms":      p.Bedrooms,
			"bathrooms":     p.Bathrooms,
			"sqft":          p.Sqft,
			"property_type": p.PropertyType,
			"status":        p.Status,
			"listing_type":  p.ListingType,
			"mls_id":        p.MlsID,
			"description":   p.Description,
			"photos":        p.Photos,
			"year_built":    p.YearBuilt,
			"lot_size":      p.LotSize,
			"created_at":    p.CreatedAt,
			"updated_at":    p.UpdatedAt,
			"deals_count":   dealsCount,
		})
	}
}

func CreateProperty(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())

		var body struct {
			Address      string          `json:"address"`
			City         *string         `json:"city"`
			State        *string         `json:"state"`
			Zip          *string         `json:"zip"`
			Price        *float64        `json:"price"`
			Bedrooms     *int            `json:"bedrooms"`
			Bathrooms    *float64        `json:"bathrooms"`
			Sqft         *int            `json:"sqft"`
			PropertyType *string         `json:"property_type"`
			Status       *string         `json:"status"`
			ListingType  *string         `json:"listing_type"`
			MlsID        *string         `json:"mls_id"`
			Description  *string         `json:"description"`
			Photos       json.RawMessage `json:"photos"`
			YearBuilt    *int            `json:"year_built"`
			LotSize      *float64        `json:"lot_size"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}
		if body.Address == "" {
			respondErrorWithCode(w, http.StatusBadRequest, "address is required", ErrCodeBadRequest)
			return
		}

		status := "active"
		if body.Status != nil && *body.Status != "" {
			status = *body.Status
		}

		photos := json.RawMessage("[]")
		if body.Photos != nil {
			photos = body.Photos
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var p Property
		err = tx.QueryRow(r.Context(),
			fmt.Sprintf(`INSERT INTO properties (agent_id, address, city, state, zip, price, bedrooms, bathrooms, sqft, property_type, status, listing_type, mls_id, description, photos, year_built, lot_size)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
			 RETURNING %s`, propertySelectCols),
			agentID, body.Address, body.City, body.State, body.Zip, body.Price, body.Bedrooms, body.Bathrooms, body.Sqft, body.PropertyType, status, body.ListingType, body.MlsID, body.Description, photos, body.YearBuilt, body.LotSize,
		).Scan(&p.ID, &p.AgentID, &p.Address, &p.City, &p.State, &p.Zip, &p.Price, &p.Bedrooms, &p.Bathrooms, &p.Sqft, &p.PropertyType, &p.Status, &p.ListingType, &p.MlsID, &p.Description, &p.Photos, &p.YearBuilt, &p.LotSize, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "create failed", ErrCodeDatabase)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusCreated, p)
	}
}

func UpdateProperty(pool *pgxpool.Pool) http.HandlerFunc {
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

		setClauses := "updated_at = NOW()"
		args := []interface{}{}
		allowed := []string{"address", "city", "state", "zip", "price", "bedrooms", "bathrooms", "sqft", "property_type", "status", "listing_type", "mls_id", "description", "photos", "year_built", "lot_size"}
		for _, field := range allowed {
			if val, ok := body[field]; ok {
				if field == "photos" {
					// Marshal photos back to JSON for JSONB column
					b, err := json.Marshal(val)
					if err != nil {
						respondErrorWithCode(w, http.StatusBadRequest, "invalid photos value", ErrCodeBadRequest)
						return
					}
					args = append(args, b)
				} else {
					args = append(args, val)
				}
				setClauses += fmt.Sprintf(", %s = $%d", field, len(args))
			}
		}
		args = append(args, id)

		var p Property
		err = tx.QueryRow(r.Context(),
			fmt.Sprintf("UPDATE properties SET %s WHERE id = $%d RETURNING %s", setClauses, len(args), propertySelectCols),
			args...,
		).Scan(&p.ID, &p.AgentID, &p.Address, &p.City, &p.State, &p.Zip, &p.Price, &p.Bedrooms, &p.Bathrooms, &p.Sqft, &p.PropertyType, &p.Status, &p.ListingType, &p.MlsID, &p.Description, &p.Photos, &p.YearBuilt, &p.LotSize, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "property not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, p)
	}
}

func DeleteProperty(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `DELETE FROM properties WHERE id = $1`, id)
		if err != nil || result.RowsAffected() == 0 {
			respondErrorWithCode(w, http.StatusNotFound, "property not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}

func GetPropertyMatches(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		// Fetch property details for matching
		var price *float64
		var bedrooms *int
		var bathrooms *float64
		var propType *string
		var city *string
		err = tx.QueryRow(r.Context(),
			`SELECT price, bedrooms, bathrooms, property_type, city FROM properties WHERE id = $1`, id,
		).Scan(&price, &bedrooms, &bathrooms, &propType, &city)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "property not found", ErrCodeNotFound)
			return
		}

		// Fetch all buyer profiles with contact info
		rows, err := tx.Query(r.Context(),
			`SELECT bp.contact_id, c.first_name, c.last_name, c.email, c.phone,
			        bp.budget_min, bp.budget_max, bp.bedrooms, bp.bathrooms,
			        bp.property_type, bp.locations
			 FROM buyer_profiles bp
			 JOIN contacts c ON c.id = bp.contact_id`)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		type Match struct {
			ContactID   string   `json:"contact_id"`
			FirstName   string   `json:"first_name"`
			LastName    string   `json:"last_name"`
			Email       *string  `json:"email"`
			Phone       *string  `json:"phone"`
			Score       int      `json:"score"`
			Reasons     []string `json:"reasons"`
		}

		matches := make([]Match, 0)
		for rows.Next() {
			var m Match
			var budgetMin, budgetMax *float64
			var bpBedrooms *int
			var bpBathrooms *float64
			var bpPropType *string
			var locations []string

			err := rows.Scan(&m.ContactID, &m.FirstName, &m.LastName, &m.Email, &m.Phone,
				&budgetMin, &budgetMax, &bpBedrooms, &bpBathrooms, &bpPropType, &locations)
			if err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}

			score := 0
			reasons := []string{}

			// Budget match: property price falls within buyer's budget range
			if price != nil {
				inRange := true
				if budgetMin != nil && *price < *budgetMin {
					inRange = false
				}
				if budgetMax != nil && *price > *budgetMax {
					inRange = false
				}
				if inRange && (budgetMin != nil || budgetMax != nil) {
					score++
					reasons = append(reasons, "budget match")
				}
			}

			// Bedrooms: buyer wants <= property bedrooms
			if bedrooms != nil && bpBedrooms != nil && *bedrooms >= *bpBedrooms {
				score++
				reasons = append(reasons, "bedrooms match")
			}

			// Bathrooms: buyer wants <= property bathrooms
			if bathrooms != nil && bpBathrooms != nil && *bathrooms >= *bpBathrooms {
				score++
				reasons = append(reasons, "bathrooms match")
			}

			// Property type match
			if propType != nil && bpPropType != nil && *propType == *bpPropType {
				score++
				reasons = append(reasons, "property type match")
			}

			// City in buyer's locations
			if city != nil && locations != nil {
				for _, loc := range locations {
					if loc == *city {
						score++
						reasons = append(reasons, "location match")
						break
					}
				}
			}

			if score > 0 {
				m.Score = score
				m.Reasons = reasons
				matches = append(matches, m)
			}
		}

		// Sort by score descending (simple insertion sort)
		for i := 1; i < len(matches); i++ {
			for j := i; j > 0 && matches[j].Score > matches[j-1].Score; j-- {
				matches[j], matches[j-1] = matches[j-1], matches[j]
			}
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"matches": matches,
			"total":   len(matches),
		})
	}
}
