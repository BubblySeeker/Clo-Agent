package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// GetLeadScoreExplanation returns a human-readable explanation of a contact's lead score.
func GetLeadScoreExplanation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		contactID := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var firstName string
		var leadScore int
		var previousLeadScore *int
		var signalsJSON []byte

		err = tx.QueryRow(r.Context(),
			`SELECT first_name, lead_score, previous_lead_score, lead_score_signals
			 FROM contacts WHERE id = $1`, contactID,
		).Scan(&firstName, &leadScore, &previousLeadScore, &signalsJSON)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "contact not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())

		explanation := buildExplanation(firstName, leadScore, previousLeadScore, signalsJSON)
		respondJSON(w, http.StatusOK, map[string]string{"explanation": explanation})
	}
}

type signalBreakdown struct {
	Engagement int      `json:"engagement"`
	Readiness  int      `json:"readiness"`
	Velocity   int      `json:"velocity"`
	Profile    int      `json:"profile"`
	TopSignals []string `json:"top_signals"`
}

func tierLabel(score int) string {
	switch {
	case score >= 80:
		return "Hot"
	case score >= 50:
		return "Warm"
	case score >= 20:
		return "Cool"
	default:
		return "Cold"
	}
}

func strongestDimension(s signalBreakdown) string {
	// Return the dimension with the highest percentage of its max
	type dim struct {
		name string
		pct  float64
	}
	dims := []dim{
		{"engagement", float64(s.Engagement) / 30},
		{"readiness", float64(s.Readiness) / 30},
		{"velocity", float64(s.Velocity) / 20},
		{"profile completeness", float64(s.Profile) / 20},
	}
	best := dims[0]
	for _, d := range dims[1:] {
		if d.pct > best.pct {
			best = d
		}
	}
	return best.name
}

func buildExplanation(firstName string, score int, prevScore *int, signalsJSON []byte) string {
	if score == 0 {
		return fmt.Sprintf("%s hasn't shown enough activity yet to generate a meaningful score. As they interact more, their score will update automatically.", firstName)
	}

	var signals signalBreakdown
	if signalsJSON != nil {
		json.Unmarshal(signalsJSON, &signals)
	}

	tier := tierLabel(score)
	strongest := strongestDimension(signals)

	var parts []string

	// Lead sentence
	parts = append(parts, fmt.Sprintf("%s is a %s lead at %d/100, driven primarily by strong %s.", firstName, tier, score, strongest))

	// Signals sentence
	if len(signals.TopSignals) > 0 {
		joined := strings.Join(signals.TopSignals, ", ")
		// Lowercase first char of joined signals for mid-sentence use
		if len(joined) > 0 {
			joined = strings.ToLower(joined[:1]) + joined[1:]
		}
		parts = append(parts, fmt.Sprintf("Key factors: %s.", joined))
	}

	// Change context
	if prevScore != nil && *prevScore != score {
		delta := score - *prevScore
		if delta > 0 {
			parts = append(parts, fmt.Sprintf("Score is up %d points — momentum is building.", delta))
		} else {
			parts = append(parts, fmt.Sprintf("Score is down %d points — may need re-engagement.", -delta))
		}
	}

	return strings.Join(parts, " ")
}
