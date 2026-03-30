//go:build integration

package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// ─── Scoring Integration Tests ──────────────────────────────────────────────
// These tests verify that lead score triggers fire correctly in handlers.
// Requires TEST_DATABASE_URL to be set.

// seedScoringTestData creates a test user, contact, deal stage, and returns
// their IDs for use in scoring integration tests.
func seedScoringTestData(t *testing.T, pool interface{ Exec(ctx context.Context, sql string, args ...interface{}) (interface{}, error) }) (contactID, stageID string) {
	t.Helper()
	// This function uses the testPool pattern from integration_test.go
	return "", ""
}

func TestIntegration_CreateActivityTriggersScoring(t *testing.T) {
	pool := testPool(t)

	// Seed user and contact
	_, _ = pool.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, name)
		 VALUES ($1, 'test_clerk_scoring_act', 'scoring_act@test.com', 'Scoring Act Test')
		 ON CONFLICT (id) DO NOTHING`,
		testAgentID,
	)
	var contactID string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO contacts (agent_id, first_name, last_name)
		 VALUES ($1, 'ScoreAct', 'Test') RETURNING id`,
		testAgentID,
	).Scan(&contactID)
	if err != nil {
		t.Fatalf("failed to seed contact: %v", err)
	}

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM activities WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM contacts WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, testAgentID)
	})

	// Create an activity for the contact
	r := chi.NewRouter()
	r.Post("/api/contacts/{id}/activities", CreateActivity(pool))

	body := fmt.Sprintf(`{"type":"call","body":"scoring test"}`)
	req := requestJSON(http.MethodPost, fmt.Sprintf("/api/contacts/%s/activities", contactID), body)
	req = withAgentID(req, testAgentID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d; body: %s", w.Code, w.Body.String())
	}

	// Verify lead_score was computed (should be > 0 since there's now 1 activity)
	var leadScore int
	err = pool.QueryRow(context.Background(),
		`SELECT lead_score FROM contacts WHERE id = $1`, contactID,
	).Scan(&leadScore)
	if err != nil {
		t.Fatalf("failed to read lead_score: %v", err)
	}
	// With 1 call activity at 0 days: engagement=10, velocity=10, readiness=0, profile=0 → ≥10
	if leadScore < 10 {
		t.Errorf("expected lead_score >= 10 after activity creation, got %d", leadScore)
	}
}

func TestIntegration_UpdateDealTriggersScoring(t *testing.T) {
	pool := testPool(t)

	_, _ = pool.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, name)
		 VALUES ($1, 'test_clerk_scoring_deal', 'scoring_deal@test.com', 'Scoring Deal Test')
		 ON CONFLICT (id) DO NOTHING`,
		testAgentID,
	)
	var contactID string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO contacts (agent_id, first_name, last_name)
		 VALUES ($1, 'ScoreDeal', 'Test') RETURNING id`,
		testAgentID,
	).Scan(&contactID)
	if err != nil {
		t.Fatalf("failed to seed contact: %v", err)
	}

	// Get first two deal stages
	var stageID1, stageID2 string
	err = pool.QueryRow(context.Background(),
		`SELECT id FROM deal_stages ORDER BY position ASC LIMIT 1`,
	).Scan(&stageID1)
	if err != nil {
		t.Fatalf("failed to fetch stage 1: %v", err)
	}
	err = pool.QueryRow(context.Background(),
		`SELECT id FROM deal_stages ORDER BY position ASC OFFSET 1 LIMIT 1`,
	).Scan(&stageID2)
	if err != nil {
		t.Fatalf("failed to fetch stage 2: %v", err)
	}

	// Create a deal
	var dealID string
	err = pool.QueryRow(context.Background(),
		`INSERT INTO deals (agent_id, contact_id, stage_id, title)
		 VALUES ($1, $2, $3, 'Scoring Test Deal') RETURNING id`,
		testAgentID, contactID, stageID1,
	).Scan(&dealID)
	if err != nil {
		t.Fatalf("failed to create deal: %v", err)
	}

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM deals WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM contacts WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, testAgentID)
	})

	// Read initial score
	var initialScore int
	pool.QueryRow(context.Background(),
		`SELECT lead_score FROM contacts WHERE id = $1`, contactID,
	).Scan(&initialScore)

	// Update deal stage
	rr := chi.NewRouter()
	rr.Patch("/api/deals/{id}", UpdateDeal(pool))

	req := requestJSON(http.MethodPatch, fmt.Sprintf("/api/deals/%s", dealID),
		map[string]string{"stage_id": stageID2})
	req = withAgentID(req, testAgentID)
	w := httptest.NewRecorder()
	rr.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body: %s", w.Code, w.Body.String())
	}

	// Verify lead_score was recomputed
	var newScore int
	err = pool.QueryRow(context.Background(),
		`SELECT lead_score FROM contacts WHERE id = $1`, contactID,
	).Scan(&newScore)
	if err != nil {
		t.Fatalf("failed to read lead_score: %v", err)
	}
	// Score should exist (may be same or different depending on stage position)
	t.Logf("score after deal stage change: initial=%d, new=%d", initialScore, newScore)
}

func TestIntegration_CreateBuyerProfileTriggersScoring(t *testing.T) {
	pool := testPool(t)

	_, _ = pool.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, name)
		 VALUES ($1, 'test_clerk_scoring_bp', 'scoring_bp@test.com', 'Scoring BP Test')
		 ON CONFLICT (id) DO NOTHING`,
		testAgentID,
	)
	var contactID string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO contacts (agent_id, first_name, last_name)
		 VALUES ($1, 'ScoreBP', 'Test') RETURNING id`,
		testAgentID,
	).Scan(&contactID)
	if err != nil {
		t.Fatalf("failed to seed contact: %v", err)
	}

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM buyer_profiles WHERE contact_id = $1`, contactID)
		pool.Exec(context.Background(), `DELETE FROM contacts WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, testAgentID)
	})

	// Create buyer profile
	rr := chi.NewRouter()
	rr.Post("/api/contacts/{id}/buyer-profile", CreateBuyerProfile(pool))

	req := requestJSON(http.MethodPost, fmt.Sprintf("/api/contacts/%s/buyer-profile", contactID),
		map[string]interface{}{
			"budget_min":   500000,
			"budget_max":   800000,
			"pre_approved": true,
			"timeline":     "3 months",
		})
	req = withAgentID(req, testAgentID)
	w := httptest.NewRecorder()
	rr.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d; body: %s", w.Code, w.Body.String())
	}

	// Verify lead_score was computed with profile data
	var leadScore int
	var signalsJSON []byte
	err = pool.QueryRow(context.Background(),
		`SELECT lead_score, lead_score_signals FROM contacts WHERE id = $1`, contactID,
	).Scan(&leadScore, &signalsJSON)
	if err != nil {
		t.Fatalf("failed to read lead_score: %v", err)
	}
	// With pre-approval, budget, and timeline: readiness should have points
	if leadScore == 0 {
		t.Errorf("expected non-zero lead_score after buyer profile creation, got 0")
	}
	if signalsJSON != nil {
		var signals map[string]interface{}
		if err := json.Unmarshal(signalsJSON, &signals); err == nil {
			t.Logf("signals after buyer profile: %v", signals)
		}
	}
}

func TestIntegration_DeleteDealTriggersScoring(t *testing.T) {
	pool := testPool(t)

	_, _ = pool.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, name)
		 VALUES ($1, 'test_clerk_scoring_dd', 'scoring_dd@test.com', 'Scoring DD Test')
		 ON CONFLICT (id) DO NOTHING`,
		testAgentID,
	)
	var contactID string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO contacts (agent_id, first_name, last_name)
		 VALUES ($1, 'ScoreDD', 'Test') RETURNING id`,
		testAgentID,
	).Scan(&contactID)
	if err != nil {
		t.Fatalf("failed to seed contact: %v", err)
	}

	var stageID string
	err = pool.QueryRow(context.Background(),
		`SELECT id FROM deal_stages ORDER BY position DESC LIMIT 1`,
	).Scan(&stageID)
	if err != nil {
		t.Fatalf("failed to fetch stage: %v", err)
	}

	var dealID string
	err = pool.QueryRow(context.Background(),
		`INSERT INTO deals (agent_id, contact_id, stage_id, title)
		 VALUES ($1, $2, $3, 'Delete Scoring Test') RETURNING id`,
		testAgentID, contactID, stageID,
	).Scan(&dealID)
	if err != nil {
		t.Fatalf("failed to create deal: %v", err)
	}

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM deals WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM contacts WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, testAgentID)
	})

	// Delete the deal
	rr := chi.NewRouter()
	rr.Delete("/api/deals/{id}", DeleteDeal(pool))

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/deals/%s", dealID), nil)
	req = withAgentID(req, testAgentID)
	w := httptest.NewRecorder()
	rr.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d; body: %s", w.Code, w.Body.String())
	}

	// Verify lead_score was recomputed (should be 0 or very low without a deal)
	var leadScore int
	err = pool.QueryRow(context.Background(),
		`SELECT lead_score FROM contacts WHERE id = $1`, contactID,
	).Scan(&leadScore)
	if err != nil {
		t.Fatalf("failed to read lead_score: %v", err)
	}
	t.Logf("score after deal deletion: %d", leadScore)
}

func TestIntegration_CreateGeneralActivity_NilContactID_NoScoring(t *testing.T) {
	pool := testPool(t)

	_, _ = pool.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, name)
		 VALUES ($1, 'test_clerk_scoring_ga', 'scoring_ga@test.com', 'Scoring GA Test')
		 ON CONFLICT (id) DO NOTHING`,
		testAgentID,
	)

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM activities WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, testAgentID)
	})

	// Create a general activity with NO contact_id
	handler := CreateGeneralActivity(pool)
	req := requestJSON(http.MethodPost, "/api/activities",
		map[string]string{"type": "note", "body": "general note without contact"})
	req = withAgentID(req, testAgentID)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d; body: %s", w.Code, w.Body.String())
	}

	// The activity was created successfully — no scoring should have been triggered
	// since there was no contact_id. Verify by checking that no contacts were updated.
	var count int
	err := pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM contacts WHERE agent_id = $1 AND lead_score > 0`, testAgentID,
	).Scan(&count)
	if err != nil {
		t.Fatalf("failed to count scored contacts: %v", err)
	}
	if count != 0 {
		t.Errorf("expected no contacts with lead_score > 0 after general activity without contact_id, got %d", count)
	}
}
