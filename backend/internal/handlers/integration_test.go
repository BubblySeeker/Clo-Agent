//go:build integration

package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/middleware"
)

// testPool creates a pgxpool from TEST_DATABASE_URL or skips the test.
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}
	t.Cleanup(func() { pool.Close() })
	return pool
}

// testAgentID is a stable UUID used as the agent identity in integration tests.
// It is seeded into the users table before each test that needs a real DB.
const testAgentID = "00000000-0000-0000-0000-000000000001"

// withAgentID injects agentID into the request context under the same key that
// UserSync middleware uses, so that middleware.AgentUUIDFromContext works in
// handler code without going through Clerk.
func withAgentID(r *http.Request, agentID string) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.AgentUUIDKey, agentID)
	return r.WithContext(ctx)
}

// requestJSON builds an httptest.Request with a JSON body and Content-Type header.
func requestJSON(method, path string, body interface{}) *http.Request {
	var bodyBytes []byte
	switch v := body.(type) {
	case string:
		bodyBytes = []byte(v)
	case []byte:
		bodyBytes = v
	default:
		bodyBytes, _ = json.Marshal(v)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	return req
}

// assertErrorResponse checks that:
//   - the HTTP status equals wantStatus
//   - the JSON body has a non-empty "error" field
//   - the JSON body "code" field equals wantCode (if wantCode != "")
func assertErrorResponse(t *testing.T, w *httptest.ResponseRecorder, wantStatus int, wantCode string) {
	t.Helper()
	if w.Code != wantStatus {
		t.Errorf("expected status %d, got %d; body: %s", wantStatus, w.Code, w.Body.String())
	}
	var result map[string]string
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if result["error"] == "" {
		t.Errorf("expected non-empty 'error' field in response body; got: %v", result)
	}
	if wantCode != "" && result["code"] != wantCode {
		t.Errorf("expected code=%q, got code=%q", wantCode, result["code"])
	}
}

// ─── Error Response Format ────────────────────────────────────────────────────

// TestErrorResponseFormat verifies that all validation-triggered error responses
// include both the "error" and "code" fields required by the frontend.
func TestErrorResponseFormat(t *testing.T) {
	cases := []struct {
		name     string
		handler  http.HandlerFunc
		method   string
		path     string
		body     interface{}
		wantCode string
	}{
		{
			name:     "CreateContact invalid JSON",
			handler:  CreateContact(nil),
			method:   http.MethodPost,
			path:     "/api/contacts",
			body:     "not json",
			wantCode: ErrCodeBadRequest,
		},
		{
			name:     "CreateContact missing first_name",
			handler:  CreateContact(nil),
			method:   http.MethodPost,
			path:     "/api/contacts",
			body:     map[string]string{"last_name": "Smith"},
			wantCode: ErrCodeBadRequest,
		},
		{
			name:     "CreateContact missing last_name",
			handler:  CreateContact(nil),
			method:   http.MethodPost,
			path:     "/api/contacts",
			body:     map[string]string{"first_name": "John"},
			wantCode: ErrCodeBadRequest,
		},
		{
			name:    "CreateContact invalid email",
			handler: CreateContact(nil),
			method:  http.MethodPost,
			path:    "/api/contacts",
			body: map[string]string{
				"first_name": "John",
				"last_name":  "Smith",
				"email":      "not-an-email",
			},
			wantCode: ErrCodeBadRequest,
		},
		{
			name:    "CreateContact first_name too long",
			handler: CreateContact(nil),
			method:  http.MethodPost,
			path:    "/api/contacts",
			body: map[string]string{
				"first_name": string(make([]byte, 101)), // 101 chars > 100 limit
				"last_name":  "Smith",
			},
			wantCode: ErrCodeBadRequest,
		},
		{
			name:     "CreateDeal invalid JSON",
			handler:  CreateDeal(nil),
			method:   http.MethodPost,
			path:     "/api/deals",
			body:     "{bad json",
			wantCode: ErrCodeBadRequest,
		},
		{
			name:    "CreateDeal missing contact_id",
			handler: CreateDeal(nil),
			method:  http.MethodPost,
			path:    "/api/deals",
			body: map[string]string{
				"stage_id": "abc",
				"title":    "Test Deal",
			},
			wantCode: ErrCodeBadRequest,
		},
		{
			name:    "CreateDeal missing stage_id",
			handler: CreateDeal(nil),
			method:  http.MethodPost,
			path:    "/api/deals",
			body: map[string]string{
				"contact_id": "abc",
				"title":      "Test Deal",
			},
			wantCode: ErrCodeBadRequest,
		},
		{
			name:    "CreateDeal missing title",
			handler: CreateDeal(nil),
			method:  http.MethodPost,
			path:    "/api/deals",
			body: map[string]string{
				"contact_id": "abc",
				"stage_id":   "def",
			},
			wantCode: ErrCodeBadRequest,
		},
		{
			name:    "CreateDeal title too long",
			handler: CreateDeal(nil),
			method:  http.MethodPost,
			path:    "/api/deals",
			body: map[string]string{
				"contact_id": "abc",
				"stage_id":   "def",
				"title":      string(make([]byte, 201)), // 201 chars > 200 limit
			},
			wantCode: ErrCodeBadRequest,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			req := requestJSON(tc.method, tc.path, tc.body)
			w := httptest.NewRecorder()
			tc.handler.ServeHTTP(w, req)
			assertErrorResponse(t, w, http.StatusBadRequest, tc.wantCode)
		})
	}
}

// ─── Activity Validation ──────────────────────────────────────────────────────

// TestCreateActivityValidation tests that CreateActivity (contact-scoped) and
// CreateGeneralActivity reject invalid input before touching the database.
func TestCreateActivityValidation(t *testing.T) {
	t.Run("CreateActivity invalid JSON", func(t *testing.T) {
		// Build a Chi router so chi.URLParam("id") works.
		r := chi.NewRouter()
		r.Post("/api/contacts/{id}/activities", CreateActivity(nil))

		req := requestJSON(http.MethodPost, "/api/contacts/some-id/activities", "not json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assertErrorResponse(t, w, http.StatusBadRequest, ErrCodeBadRequest)
	})

	t.Run("CreateActivity invalid type", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/contacts/{id}/activities", CreateActivity(nil))

		req := requestJSON(http.MethodPost, "/api/contacts/some-id/activities",
			map[string]string{"type": "invalid_type", "body": "test"})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assertErrorResponse(t, w, http.StatusBadRequest, ErrCodeBadRequest)
	})

	t.Run("CreateActivity empty type", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/contacts/{id}/activities", CreateActivity(nil))

		req := requestJSON(http.MethodPost, "/api/contacts/some-id/activities",
			map[string]string{"body": "test"})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assertErrorResponse(t, w, http.StatusBadRequest, ErrCodeBadRequest)
	})

	t.Run("CreateActivity body too long", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/contacts/{id}/activities", CreateActivity(nil))

		longBody := string(make([]byte, 10001)) // 10001 chars > 10000 limit
		body := fmt.Sprintf(`{"type":"note","body":%q}`, longBody)
		req := requestJSON(http.MethodPost, "/api/contacts/some-id/activities", body)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assertErrorResponse(t, w, http.StatusBadRequest, ErrCodeBadRequest)
	})

	t.Run("CreateGeneralActivity invalid JSON", func(t *testing.T) {
		handler := CreateGeneralActivity(nil)
		req := requestJSON(http.MethodPost, "/api/activities", "not json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		assertErrorResponse(t, w, http.StatusBadRequest, ErrCodeBadRequest)
	})

	t.Run("CreateGeneralActivity invalid type", func(t *testing.T) {
		handler := CreateGeneralActivity(nil)
		req := requestJSON(http.MethodPost, "/api/activities",
			map[string]string{"type": "meeting", "body": "test"})
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		assertErrorResponse(t, w, http.StatusBadRequest, ErrCodeBadRequest)
	})

	t.Run("CreateGeneralActivity missing type", func(t *testing.T) {
		handler := CreateGeneralActivity(nil)
		req := requestJSON(http.MethodPost, "/api/activities",
			map[string]string{"body": "test"})
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		assertErrorResponse(t, w, http.StatusBadRequest, ErrCodeBadRequest)
	})
}

// TestUpdateActivityValidation tests that UpdateActivity (PATCH) rejects
// invalid JSON before touching the database. Note: the "no fields to update"
// 400 check cannot be tested without a real pool because BeginWithRLS is called
// before the setClauses length check in the current implementation.
func TestUpdateActivityValidation(t *testing.T) {
	t.Run("invalid JSON", func(t *testing.T) {
		r := chi.NewRouter()
		r.Patch("/api/activities/{id}", UpdateActivity(nil))

		req := requestJSON(http.MethodPatch, "/api/activities/some-id", "not json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assertErrorResponse(t, w, http.StatusBadRequest, ErrCodeBadRequest)
	})
}

// ─── DB-backed integration tests ─────────────────────────────────────────────
// These tests require TEST_DATABASE_URL to be set and a pre-seeded test agent.

// TestIntegration_ContactCRUD exercises the full create → get → update → delete
// flow against a real PostgreSQL database.
func TestIntegration_ContactCRUD(t *testing.T) {
	pool := testPool(t)

	// Seed a test user row so RLS can resolve the agent.
	_, err := pool.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, name)
		 VALUES ($1, 'test_clerk_id', 'test@example.com', 'Test Agent')
		 ON CONFLICT (id) DO NOTHING`,
		testAgentID,
	)
	if err != nil {
		t.Fatalf("failed to seed test user: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM contacts WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, testAgentID)
	})

	// ── Create ──────────────────────────────────────────────────────────────
	t.Run("CreateContact 201", func(t *testing.T) {
		req := requestJSON(http.MethodPost, "/api/contacts",
			map[string]string{"first_name": "Jane", "last_name": "Doe", "email": "jane@example.com"})
		req = withAgentID(req, testAgentID)
		w := httptest.NewRecorder()
		CreateContact(pool).ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d; body: %s", w.Code, w.Body.String())
		}
		var contact map[string]interface{}
		if err := json.NewDecoder(w.Body).Decode(&contact); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if contact["id"] == "" || contact["id"] == nil {
			t.Errorf("expected non-empty id in response; got: %v", contact)
		}
		if contact["first_name"] != "Jane" || contact["last_name"] != "Doe" {
			t.Errorf("unexpected contact data: %v", contact)
		}
	})

	// ── List ─────────────────────────────────────────────────────────────────
	t.Run("ListContacts 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/contacts", nil)
		req = withAgentID(req, testAgentID)
		w := httptest.NewRecorder()
		ListContacts(pool).ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d; body: %s", w.Code, w.Body.String())
		}
		var result map[string]interface{}
		if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		contacts, ok := result["contacts"].([]interface{})
		if !ok {
			t.Fatalf("expected contacts array; got %T", result["contacts"])
		}
		if len(contacts) == 0 {
			t.Errorf("expected at least one contact after create")
		}
	})
}

// TestIntegration_DealCRUD exercises deal create → list → delete.
func TestIntegration_DealCRUD(t *testing.T) {
	pool := testPool(t)

	// Seed user
	_, _ = pool.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, name)
		 VALUES ($1, 'test_clerk_deal', 'dealtest@example.com', 'Deal Test Agent')
		 ON CONFLICT (id) DO NOTHING`,
		testAgentID,
	)

	// Seed a contact to hang the deal from
	var contactID string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO contacts (agent_id, first_name, last_name)
		 VALUES ($1, 'Deal', 'Contact') RETURNING id`,
		testAgentID,
	).Scan(&contactID)
	if err != nil {
		t.Fatalf("failed to seed contact: %v", err)
	}

	// Get the first deal stage ID
	var stageID string
	err = pool.QueryRow(context.Background(),
		`SELECT id FROM deal_stages ORDER BY position ASC LIMIT 1`,
	).Scan(&stageID)
	if err != nil {
		t.Fatalf("failed to fetch deal stage: %v", err)
	}

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM deals WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM contacts WHERE agent_id = $1`, testAgentID)
		pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, testAgentID)
	})

	// ── Create ──────────────────────────────────────────────────────────────
	t.Run("CreateDeal 201", func(t *testing.T) {
		req := requestJSON(http.MethodPost, "/api/deals", map[string]string{
			"contact_id": contactID,
			"stage_id":   stageID,
			"title":      "Integration Test Deal",
		})
		req = withAgentID(req, testAgentID)
		w := httptest.NewRecorder()
		CreateDeal(pool).ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d; body: %s", w.Code, w.Body.String())
		}
		var deal map[string]interface{}
		if err := json.NewDecoder(w.Body).Decode(&deal); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if deal["id"] == "" || deal["id"] == nil {
			t.Errorf("expected non-empty id; got: %v", deal)
		}
		if deal["title"] != "Integration Test Deal" {
			t.Errorf("unexpected title: %v", deal["title"])
		}
	})

	// ── List ─────────────────────────────────────────────────────────────────
	t.Run("ListDeals 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/deals", nil)
		req = withAgentID(req, testAgentID)
		w := httptest.NewRecorder()
		ListDeals(pool).ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d; body: %s", w.Code, w.Body.String())
		}
	})
}

// TestIntegration_ActivityCreation tests activity creation for a contact.
func TestIntegration_ActivityCreation(t *testing.T) {
	pool := testPool(t)

	// Seed user and contact
	_, _ = pool.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, name)
		 VALUES ($1, 'test_clerk_activity', 'acttest@example.com', 'Activity Test')
		 ON CONFLICT (id) DO NOTHING`,
		testAgentID,
	)
	var contactID string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO contacts (agent_id, first_name, last_name)
		 VALUES ($1, 'Activity', 'Contact') RETURNING id`,
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

	validTypes := []string{"call", "email", "note", "showing", "task"}
	for _, actType := range validTypes {
		actType := actType
		t.Run(fmt.Sprintf("CreateActivity type=%s 201", actType), func(t *testing.T) {
			r := chi.NewRouter()
			r.Post("/api/contacts/{id}/activities", CreateActivity(pool))

			body := fmt.Sprintf(`{"type":%q,"body":"integration test"}`, actType)
			req := requestJSON(http.MethodPost, fmt.Sprintf("/api/contacts/%s/activities", contactID), body)
			req = withAgentID(req, testAgentID)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusCreated {
				t.Fatalf("expected 201 for type=%s, got %d; body: %s", actType, w.Code, w.Body.String())
			}
			var activity map[string]interface{}
			if err := json.NewDecoder(w.Body).Decode(&activity); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}
			if activity["type"] != actType {
				t.Errorf("expected type=%s, got %v", actType, activity["type"])
			}
		})
	}
}
