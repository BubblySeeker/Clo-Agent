package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"crm-api/internal/config"
)

// TestHandlerFactoriesReturnHandlers verifies that handler factory functions
// return non-nil HandlerFuncs. These require a pool but the factory itself
// should not panic.
func TestHandlerFactoriesReturnHandlers(t *testing.T) {
	// All factory functions accept (*pgxpool.Pool) and return http.HandlerFunc.
	// With a nil pool they should still return a function (it will fail at runtime
	// when called, but the factory itself should not panic).
	factories := map[string]func() http.HandlerFunc{
		"ListContacts":      func() http.HandlerFunc { return ListContacts(nil) },
		"CreateContact":     func() http.HandlerFunc { return CreateContact(nil) },
		"GetContact":        func() http.HandlerFunc { return GetContact(nil) },
		"UpdateContact":     func() http.HandlerFunc { return UpdateContact(nil) },
		"DeleteContact":     func() http.HandlerFunc { return DeleteContact(nil) },
		"ListDeals":         func() http.HandlerFunc { return ListDeals(nil) },
		"CreateDeal":        func() http.HandlerFunc { return CreateDeal(nil) },
		"GetDeal":           func() http.HandlerFunc { return GetDeal(nil) },
		"UpdateDeal":        func() http.HandlerFunc { return UpdateDeal(nil) },
		"DeleteDeal":        func() http.HandlerFunc { return DeleteDeal(nil) },
		"ListWorkflows":     func() http.HandlerFunc { return ListWorkflows(nil) },
		"CreateWorkflow":    func() http.HandlerFunc { return CreateWorkflow(nil) },
		"GetWorkflow":       func() http.HandlerFunc { return GetWorkflow(nil) },
		"UpdateWorkflow":    func() http.HandlerFunc { return UpdateWorkflow(nil) },
		"DeleteWorkflow":    func() http.HandlerFunc { return DeleteWorkflow(nil) },
		"ToggleWorkflow":    func() http.HandlerFunc { return ToggleWorkflow(nil) },
		"ListWorkflowRuns":  func() http.HandlerFunc { return ListWorkflowRuns(nil) },
		"ListProperties":    func() http.HandlerFunc { return ListProperties(nil) },
		"CreateProperty":    func() http.HandlerFunc { return CreateProperty(nil) },
		"GetProperty":       func() http.HandlerFunc { return GetProperty(nil) },
		"UpdateProperty":    func() http.HandlerFunc { return UpdateProperty(nil) },
		"DeleteProperty":    func() http.HandlerFunc { return DeleteProperty(nil) },
		"GetPropertyMatches": func() http.HandlerFunc { return GetPropertyMatches(nil) },
	}

	for name, factory := range factories {
		t.Run(name, func(t *testing.T) {
			handler := factory()
			if handler == nil {
				t.Errorf("%s returned nil handler", name)
			}
		})
	}
}

// TestCreateContactValidation tests that CreateContact rejects bad input
// before hitting the database.
func TestCreateContactValidation(t *testing.T) {
	handler := CreateContact(nil)

	tests := []struct {
		name       string
		body       interface{}
		wantStatus int
	}{
		{
			name:       "invalid JSON",
			body:       "not json",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing required fields",
			body:       map[string]string{"email": "test@example.com"},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var bodyBytes []byte
			switch v := tt.body.(type) {
			case string:
				bodyBytes = []byte(v)
			default:
				bodyBytes, _ = json.Marshal(v)
			}

			req := httptest.NewRequest(http.MethodPost, "/api/contacts", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d; body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// TestCreateDealValidation tests that CreateDeal rejects missing required fields.
func TestCreateDealValidation(t *testing.T) {
	handler := CreateDeal(nil)

	tests := []struct {
		name       string
		body       interface{}
		wantStatus int
	}{
		{
			name:       "invalid JSON",
			body:       "{bad",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing contact_id and stage_id",
			body:       map[string]string{"title": "Test Deal"},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing title",
			body:       map[string]string{"contact_id": "abc", "stage_id": "def"},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var bodyBytes []byte
			switch v := tt.body.(type) {
			case string:
				bodyBytes = []byte(v)
			default:
				bodyBytes, _ = json.Marshal(v)
			}

			req := httptest.NewRequest(http.MethodPost, "/api/deals", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d; body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// TestCreateWorkflowValidation tests that CreateWorkflow rejects bad input.
func TestCreateWorkflowValidation(t *testing.T) {
	handler := CreateWorkflow(nil)

	tests := []struct {
		name       string
		body       interface{}
		wantStatus int
	}{
		{
			name:       "invalid JSON",
			body:       "nope",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing name",
			body:       map[string]string{"trigger_type": "manual"},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing trigger_type",
			body:       map[string]string{"name": "Test Workflow"},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var bodyBytes []byte
			switch v := tt.body.(type) {
			case string:
				bodyBytes = []byte(v)
			default:
				bodyBytes, _ = json.Marshal(v)
			}

			req := httptest.NewRequest(http.MethodPost, "/api/workflows", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d; body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// TestCreatePropertyValidation tests that CreateProperty rejects bad input
// before hitting the database.
func TestCreatePropertyValidation(t *testing.T) {
	handler := CreateProperty(nil)

	tests := []struct {
		name       string
		body       interface{}
		wantStatus int
	}{
		{
			name:       "invalid JSON",
			body:       "not json",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing address",
			body:       map[string]string{"city": "Miami"},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var bodyBytes []byte
			switch v := tt.body.(type) {
			case string:
				bodyBytes = []byte(v)
			default:
				bodyBytes, _ = json.Marshal(v)
			}

			req := httptest.NewRequest(http.MethodPost, "/api/properties", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d; body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// TestCreateWorkflowValidationWithNewFields tests CreateWorkflow with
// instruction, approval_mode, and schedule_config fields.
func TestCreateWorkflowValidationWithNewFields(t *testing.T) {
	handler := CreateWorkflow(nil)

	tests := []struct {
		name       string
		body       interface{}
		wantStatus int
	}{
		{
			name: "instruction too long",
			body: map[string]interface{}{
				"name":         "Test",
				"trigger_type": "manual",
				"instruction":  string(make([]byte, 5001)),
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "name too long",
			body: map[string]interface{}{
				"name":         string(make([]byte, 201)),
				"trigger_type": "manual",
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/api/workflows", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d; body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// TestUpdateWorkflowValidation tests that UpdateWorkflow rejects bad input.
func TestUpdateWorkflowValidation(t *testing.T) {
	handler := UpdateWorkflow(nil)

	tests := []struct {
		name       string
		body       interface{}
		wantStatus int
	}{
		{
			name:       "invalid JSON",
			body:       "not json",
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "instruction too long",
			body: map[string]interface{}{
				"instruction": string(make([]byte, 5001)),
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "invalid approval_mode",
			body: map[string]interface{}{
				"approval_mode": "yolo",
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var bodyBytes []byte
			switch v := tt.body.(type) {
			case string:
				bodyBytes = []byte(v)
			default:
				bodyBytes, _ = json.Marshal(v)
			}

			req := httptest.NewRequest(http.MethodPatch, "/api/workflows/some-id", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d; body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// TestRunWorkflowFactoryExists verifies RunWorkflow and DryRunWorkflow handlers exist.
func TestRunWorkflowFactoryExists(t *testing.T) {
	cfg := &config.Config{}
	handler := RunWorkflow(nil, cfg)
	if handler == nil {
		t.Error("RunWorkflow returned nil handler")
	}
}

// TestDryRunWorkflowFactoryExists verifies DryRunWorkflow factory returns handler.
func TestDryRunWorkflowFactoryExists(t *testing.T) {
	cfg := &config.Config{}
	handler := DryRunWorkflow(nil, cfg)
	if handler == nil {
		t.Error("DryRunWorkflow returned nil handler")
	}
}

// TestHealthEndpoint verifies the health check handler.
func TestHealthEndpoint(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	Health(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}

	var result map[string]string
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["status"] != "ok" {
		t.Errorf("expected status=ok, got %s", result["status"])
	}
}
