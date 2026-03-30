---
phase: quick
plan: 260325-dat
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/internal/handlers/contacts.go
  - backend/cmd/api/main.go
autonomous: true
requirements: [step-4-sort-score, step-4-going-cold-count]
must_haves:
  truths:
    - "GET /api/contacts?sort=score returns contacts ordered by lead_score DESC"
    - "GET /api/contacts without sort param returns contacts ordered by created_at DESC (unchanged)"
    - "GET /api/contacts/going-cold-count returns JSON {count: N} where N = contacts with lead_score < 20 AND last activity > 14 days ago"
  artifacts:
    - path: "backend/internal/handlers/contacts.go"
      provides: "sort=score support in ListContacts + GoingColdCount handler"
    - path: "backend/cmd/api/main.go"
      provides: "Route registration for going-cold-count"
  key_links:
    - from: "backend/cmd/api/main.go"
      to: "handlers.GoingColdCount"
      via: "route registration"
      pattern: "r\\.Get.*going-cold-count.*GoingColdCount"
---

<objective>
Add sort=score query param support to ListContacts and create GET /api/contacts/going-cold-count endpoint (Step 4 of lead scoring).

Purpose: Enable the frontend to sort contacts by lead score and show a "going cold" count banner.
Output: Two backend changes — sort param in existing endpoint + new count endpoint.
</objective>

<execution_context>
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/workflows/execute-plan.md
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/designs/lead-scoring-steps.md (Step 4 specification)
@backend/internal/handlers/contacts.go (ListContacts + Contact struct — already has lead_score fields from Step 3)
@backend/cmd/api/main.go (route registration)

<interfaces>
From backend/internal/handlers/contacts.go:
```go
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

func respondJSON(w http.ResponseWriter, status int, data interface{})
func respondErrorWithCode(w http.ResponseWriter, status int, msg string, code string)
func BeginWithRLS(ctx context.Context, pool *pgxpool.Pool, agentID string) (pgx.Tx, error)
```

Current ListContacts ORDER BY clause (line 98):
```
ORDER BY c.created_at DESC LIMIT $N OFFSET $M
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add sort=score to ListContacts and create GoingColdCount handler</name>
  <files>backend/internal/handlers/contacts.go</files>
  <action>
1. In ListContacts, after the existing query param parsing (around line 48), read `sort` query param:
   ```go
   sortParam := r.URL.Query().Get("sort")
   ```

2. Replace the hardcoded `ORDER BY c.created_at DESC` in the dataSQL (line 98) with a dynamic order clause:
   ```go
   orderClause := "c.created_at DESC"
   if sortParam == "score" {
       orderClause = "c.lead_score DESC, c.created_at DESC"
   }
   ```
   Then use `orderClause` in the format string instead of the hardcoded value. The secondary sort by created_at DESC ensures stable ordering for contacts with the same score.

3. Add a new handler function `GoingColdCount` at the end of contacts.go (after DeleteContact):
   ```go
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
   ```
   The query finds contacts with lead_score < 20 AND no activity in the last 14 days. Using NOT EXISTS with a subquery is cleaner than a LEFT JOIN and handles contacts with zero activities (they also qualify as "going cold" if their score is < 20).
  </action>
  <verify>
    <automated>cd /Users/matthewfaust/CloAgent/Clo-Agent/backend && go build ./...</automated>
  </verify>
  <done>ListContacts accepts sort=score param and orders by lead_score DESC when set. GoingColdCount handler exists and compiles. Default sort unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Register going-cold-count route</name>
  <files>backend/cmd/api/main.go</files>
  <action>
In backend/cmd/api/main.go, add the going-cold-count route in the Contacts section (after line 140, before the individual contact routes with {id} params to avoid route conflicts with Chi):
```go
r.Get("/api/contacts/going-cold-count", handlers.GoingColdCount(pool))
```

IMPORTANT: This route MUST be registered BEFORE the `r.Get("/api/contacts/{id}", ...)` route (line 142) because Chi matches routes in order and `{id}` would match "going-cold-count" as a contact ID otherwise. Place it between `r.Post("/api/contacts", ...)` (line 141) and `r.Get("/api/contacts/{id}", ...)` (line 142).
  </action>
  <verify>
    <automated>cd /Users/matthewfaust/CloAgent/Clo-Agent/backend && go build ./... && go vet ./...</automated>
  </verify>
  <done>Route GET /api/contacts/going-cold-count is registered and compiles. Placed before {id} routes to avoid Chi routing conflicts.</done>
</task>

</tasks>

<verification>
```bash
cd /Users/matthewfaust/CloAgent/Clo-Agent/backend && go build ./... && go vet ./...
```
</verification>

<success_criteria>
- `go build ./...` and `go vet ./...` pass with no errors
- ListContacts supports `sort=score` query param, defaulting to `created_at DESC` when not provided
- GoingColdCount handler returns `{"count": N}` for contacts with score < 20 and no recent activity
- New route registered at GET /api/contacts/going-cold-count before {id} routes
</success_criteria>

<output>
After completion, create `.planning/quick/260325-dat-add-sort-score-to-listcontacts-and-going/260325-dat-SUMMARY.md`
</output>
