package scoring

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
)

// activityTypeMultiplier returns the scoring weight for a given activity type.
func activityTypeMultiplier(activityType string) float64 {
	switch activityType {
	case "showing":
		return 1.5
	case "call":
		return 1.0
	case "email":
		return 0.75
	case "note", "task":
		return 0.5
	default:
		return 0.5
	}
}

// timeDecay returns the decay factor based on activity age in days.
func timeDecay(ageDays float64) float64 {
	if ageDays <= 14 {
		return 1.0
	}
	if ageDays <= 30 {
		return 0.5
	}
	return 0.0
}

// SignalBreakdown stores the per-dimension scoring details.
type SignalBreakdown struct {
	Engagement  int      `json:"engagement"`
	Readiness   int      `json:"readiness"`
	Velocity    int      `json:"velocity"`
	Profile     int      `json:"profile"`
	TopSignals  []string `json:"top_signals"`
}

// ComputeLeadScore computes and persists the lead score for a contact.
// It runs inside an existing RLS-scoped transaction. If any query fails,
// it logs the error and returns nil — never blocking the parent mutation.
func ComputeLeadScore(ctx context.Context, tx pgx.Tx, contactID string) error {
	engagement, engSignals, err := computeEngagement(ctx, tx, contactID)
	if err != nil {
		log.Printf("scoring: engagement query failed for contact %s: %v", contactID, err)
		return nil
	}

	readiness, readSignals, err := computeReadiness(ctx, tx, contactID)
	if err != nil {
		log.Printf("scoring: readiness query failed for contact %s: %v", contactID, err)
		return nil
	}

	velocity, velSignals, err := computeVelocity(ctx, tx, contactID)
	if err != nil {
		log.Printf("scoring: velocity query failed for contact %s: %v", contactID, err)
		return nil
	}

	profile, profSignals, err := computeProfileCompleteness(ctx, tx, contactID)
	if err != nil {
		log.Printf("scoring: profile query failed for contact %s: %v", contactID, err)
		return nil
	}

	totalScore := engagement + readiness + velocity + profile

	// Collect top signals (up to 3)
	allSignals := append(append(append(engSignals, readSignals...), velSignals...), profSignals...)
	topSignals := allSignals
	if len(topSignals) > 3 {
		topSignals = topSignals[:3]
	}

	breakdown := SignalBreakdown{
		Engagement: engagement,
		Readiness:  readiness,
		Velocity:   velocity,
		Profile:    profile,
		TopSignals: topSignals,
	}

	signalsJSON, err := json.Marshal(breakdown)
	if err != nil {
		log.Printf("scoring: marshal signals failed for contact %s: %v", contactID, err)
		return nil
	}

	_, err = tx.Exec(ctx,
		`UPDATE contacts
		 SET previous_lead_score = lead_score,
		     lead_score = $1,
		     lead_score_signals = $2
		 WHERE id = $3`,
		totalScore, signalsJSON, contactID,
	)
	if err != nil {
		log.Printf("scoring: update failed for contact %s: %v", contactID, err)
		return nil
	}

	return nil
}

// computeEngagement calculates the engagement dimension (0-30).
// Uses time-decayed, type-weighted activity counts.
func computeEngagement(ctx context.Context, tx pgx.Tx, contactID string) (int, []string, error) {
	rows, err := tx.Query(ctx,
		`SELECT type, created_at FROM activities
		 WHERE contact_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
		contactID,
	)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()

	now := time.Now()
	var weightedCount float64
	typeCounts := map[string]int{}

	for rows.Next() {
		var actType string
		var createdAt time.Time
		if err := rows.Scan(&actType, &createdAt); err != nil {
			return 0, nil, err
		}
		ageDays := now.Sub(createdAt).Hours() / 24
		weight := timeDecay(ageDays) * activityTypeMultiplier(actType)
		weightedCount += weight
		typeCounts[actType]++
	}
	if err := rows.Err(); err != nil {
		return 0, nil, err
	}

	var score int
	switch {
	case weightedCount < 0.5:
		score = 0
	case weightedCount < 2.5:
		score = 10
	case weightedCount < 5.5:
		score = 20
	default:
		score = 30
	}

	var signals []string
	if typeCounts["showing"] > 0 {
		signals = append(signals, "Active showings")
	}
	if weightedCount >= 5.5 {
		signals = append(signals, "High engagement")
	} else if weightedCount < 0.5 {
		signals = append(signals, "No recent engagement")
	}

	return score, signals, nil
}

// computeReadiness calculates the readiness dimension (0-30).
// Based on deal stage progression, pre-approval, budget, and timeline.
func computeReadiness(ctx context.Context, tx pgx.Tx, contactID string) (int, []string, error) {
	// Get the most advanced deal stage for this contact
	var stagePosition *int
	err := tx.QueryRow(ctx,
		`SELECT MAX(ds.position) FROM deals d
		 JOIN deal_stages ds ON ds.id = d.stage_id
		 WHERE d.contact_id = $1`,
		contactID,
	).Scan(&stagePosition)
	if err != nil {
		return 0, nil, err
	}

	var score int
	var signals []string

	// Stage progression: positions 1-7 mapped to 0-15 points
	if stagePosition != nil {
		switch {
		case *stagePosition >= 5: // Under Contract or Closed
			score += 15
			signals = append(signals, "Deal in advanced stage")
		case *stagePosition >= 4: // Offer
			score += 12
			signals = append(signals, "Offer submitted")
		case *stagePosition >= 3: // Touring
			score += 8
			signals = append(signals, "Touring properties")
		case *stagePosition >= 2: // Contacted
			score += 4
		default: // Lead
			score += 2
		}
	}

	// Buyer profile factors: pre-approval (7pts), budget set (4pts), timeline set (4pts)
	var preApproved bool
	var budgetMin, budgetMax *float64
	var timeline *string
	err = tx.QueryRow(ctx,
		`SELECT pre_approved, budget_min, budget_max, timeline
		 FROM buyer_profiles WHERE contact_id = $1`,
		contactID,
	).Scan(&preApproved, &budgetMin, &budgetMax, &timeline)
	if err != nil && err != pgx.ErrNoRows {
		return 0, nil, err
	}

	if preApproved {
		score += 7
		signals = append(signals, "Pre-approved")
	}
	if budgetMin != nil || budgetMax != nil {
		score += 4
	}
	if timeline != nil && *timeline != "" {
		score += 4
	}

	// Cap at 30
	if score > 30 {
		score = 30
	}

	return score, signals, nil
}

// computeVelocity calculates the velocity dimension (0-20).
// Compares activity count in last 7 days vs prior 7 days.
func computeVelocity(ctx context.Context, tx pgx.Tx, contactID string) (int, []string, error) {
	var recentCount, priorCount int

	err := tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM activities
		 WHERE contact_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
		contactID,
	).Scan(&recentCount)
	if err != nil {
		return 0, nil, err
	}

	err = tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM activities
		 WHERE contact_id = $1
		   AND created_at >= NOW() - INTERVAL '14 days'
		   AND created_at < NOW() - INTERVAL '7 days'`,
		contactID,
	).Scan(&priorCount)
	if err != nil {
		return 0, nil, err
	}

	var signals []string
	var score int

	if priorCount == 0 && recentCount == 0 {
		score = 0
	} else if priorCount == 0 {
		// New activity with no prior baseline
		score = 10
		signals = append(signals, "New activity this week")
	} else {
		ratio := float64(recentCount) / float64(priorCount)
		switch {
		case ratio >= 2.0:
			score = 20
			signals = append(signals, "Accelerating engagement")
		case ratio >= 1.5:
			score = 15
		case ratio >= 1.0:
			score = 10
		case ratio >= 0.5:
			score = 5
		default:
			score = 0
			signals = append(signals, "Engagement declining")
		}
	}

	return score, signals, nil
}

// computeProfileCompleteness calculates the profile dimension (0-20).
// Counts filled buyer profile fields / total possible fields * 20.
func computeProfileCompleteness(ctx context.Context, tx pgx.Tx, contactID string) (int, []string, error) {
	var budgetMin, budgetMax, preApprovalAmount *float64
	var bedrooms *int64
	var bathrooms *float64
	var propertyType, timeline, notes *string
	var preApproved bool
	var locations, mustHaves, dealBreakers []string

	err := tx.QueryRow(ctx,
		`SELECT budget_min, budget_max, bedrooms, bathrooms,
		        COALESCE(locations, '{}'), COALESCE(must_haves, '{}'), COALESCE(deal_breakers, '{}'),
		        property_type, pre_approved, pre_approval_amount, timeline, notes
		 FROM buyer_profiles WHERE contact_id = $1`,
		contactID,
	).Scan(&budgetMin, &budgetMax, &bedrooms, &bathrooms,
		&locations, &mustHaves, &dealBreakers,
		&propertyType, &preApproved, &preApprovalAmount, &timeline, &notes)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, []string{"No buyer profile"}, nil
		}
		return 0, nil, err
	}

	// 12 possible fields
	totalFields := 12.0
	filled := 0.0

	if budgetMin != nil {
		filled++
	}
	if budgetMax != nil {
		filled++
	}
	if bedrooms != nil {
		filled++
	}
	if bathrooms != nil {
		filled++
	}
	if len(locations) > 0 {
		filled++
	}
	if len(mustHaves) > 0 {
		filled++
	}
	if len(dealBreakers) > 0 {
		filled++
	}
	if propertyType != nil && *propertyType != "" {
		filled++
	}
	if preApproved {
		filled++
	}
	if preApprovalAmount != nil {
		filled++
	}
	if timeline != nil && *timeline != "" {
		filled++
	}
	if notes != nil && *notes != "" {
		filled++
	}

	score := int(math.Round(filled / totalFields * 20))

	var signals []string
	if filled < 4 {
		signals = append(signals, "Incomplete buyer profile")
	} else if filled >= 10 {
		signals = append(signals, "Detailed buyer profile")
	}

	return score, signals, nil
}
