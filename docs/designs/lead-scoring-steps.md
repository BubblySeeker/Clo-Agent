# Lead Scoring — Implementation Steps

Self-contained prompts for Claude Code. Each step fits in a single context window.

## Step 1: Database Migration

Add migration 016 to backend/migrations/ that adds these columns to the contacts table:
- lead_score INTEGER DEFAULT 0
- lead_score_signals JSONB
- previous_lead_score INTEGER

Add an index on lead_score for sorting performance.

Also add a show_lead_scores BOOLEAN DEFAULT true column to the agent_settings table (or user_settings — check which exists).

Follow the existing migration file naming pattern in backend/migrations/.

## Step 2: computeLeadScore Function

Create a new file backend/internal/scoring/scoring.go with a function:

func ComputeLeadScore(ctx context.Context, tx pgx.Tx, contactID string) error

This function runs INSIDE an existing RLS-scoped transaction (tx). It:

1. Queries activities for the contact with time decay:
   - Full weight (1.0x) for 0-14 days old
   - Half weight (0.5x) for 15-30 days old
   - Zero weight for >30 days old
   - Activity type multipliers: Showing 1.5x, Call 1.0x, Email 0.75x, Note/Task 0.5x

2. Computes 4 dimensions (0-100 total):
   - Engagement (max 30): weighted activity count buckets — <0.5=0, 0.5-2.5=10, 2.5-5.5=20, >=5.5=30
   - Readiness (max 30): deal stage progression + buyer profile has pre-approval + budget + timeline
   - Velocity (max 20): activity count last 7d vs prior 7d — ratio mapped to 0/5/10/15/20
   - Profile Completeness (max 20): count filled buyer profile fields / total possible fields * 20

3. Saves previous score to previous_lead_score, writes new lead_score and lead_score_signals JSONB (containing dimension breakdowns and top signal descriptions)

4. FAULT TOLERANT: if any query fails, log the error and return nil — never block the parent mutation.

See backend/internal/handlers/contacts.go for the Contact struct and backend/internal/handlers/deals.go for deal queries. Use the existing database patterns (pgx v5, RLS transactions).

## Step 3: Wire Scoring Triggers

Add ComputeLeadScore calls to existing handlers. Import backend/internal/scoring.

Each call goes AFTER the primary mutation succeeds, INSIDE the same transaction. If ComputeLeadScore returns an error, LOG it but don't fail the request.

Files to modify:
- backend/internal/handlers/contacts.go: CreateContact (after insert), UpdateContact (after update)
- backend/internal/handlers/activities.go: CreateActivity (contactID from URL param), CreateGeneralActivity (ONLY when body.ContactID is non-nil)
- backend/internal/handlers/buyer_profiles.go: CreateBuyerProfile, UpdateBuyerProfile (contactID from URL param)
- backend/internal/handlers/deals.go: UpdateDeal (after stage change — contact_id from deal fetch), DeleteDeal (fetch contact_id BEFORE delete, compute AFTER delete)

Also update the Contact struct and ALL scan sites in contacts.go to include lead_score, lead_score_signals, previous_lead_score fields. There are 4 scan sites — check lines around 106, 146, 222, 285.

## Step 4: Backend API — Sort by Score + Going Cold Count

In backend/internal/handlers/contacts.go ListContacts:
- Add support for query param sort=score that adds ORDER BY lead_score DESC
- Keep existing default sort unchanged — score sort is opt-in

Add a new endpoint GET /api/contacts/going-cold-count that returns:
{"count": N}
Where N = count of contacts where lead_score < 20 AND last activity > 14 days ago.

Register the new route in backend/cmd/api/main.go following the existing pattern.

## Step 5: AI Tool — get_lead_score

Add a new read tool get_lead_score to ai-service/app/tools.py (tool #35: 19 read + 16 write).

Parameters: contact_id (required string)

It queries the contact's lead_score, lead_score_signals, and previous_lead_score, then returns:
- score (number)
- tier (Hot/Warm/Cool/Cold)
- dimension breakdown (Engagement, Readiness, Velocity, Profile scores)
- top 3 signals from lead_score_signals
- suggested action based on tier

Also add 3 tests to ai-service/tests/test_tools.py following the existing TestToolDefinitions pattern:
- get_lead_score is present in tool definitions
- get_lead_score is classified as a read tool
- get_lead_score requires contact_id parameter

Update the Brief Me system prompt to inject lead score data when available — prompt engineering only, no new UI.

## Step 6: Frontend — Contact Type + API Updates

Update frontend/src/lib/api/contacts.ts:

1. Add to Contact interface:
   - lead_score: number
   - lead_score_signals: Record<string, any> | null
   - previous_lead_score: number | null

2. Add to ContactFilters:
   - sort?: string

3. Update listContacts to pass sort param when set

4. Add new function:
   export async function getGoingColdCount(token: string): Promise<{count: number}>

5. Add new function:
   export async function getLeadScoreExplanation(token: string, contactId: string): Promise<string>
   (This calls the AI endpoint to get a natural language explanation)

## Step 7: Frontend — Score Badge Component

Create frontend/src/app/dashboard/components/score-badge.tsx

A reusable ScoreBadge component with two variants:
- default: 42px circle, 14px bold font (for contact list + contact detail)
- compact: 24px circle, 10px font (for Kanban deal cards)

Props: score (number), previousScore (number | null), size ('default' | 'compact')

Tier logic: Hot (80-100 green), Warm (50-79 yellow), Cool (20-49 blue), Cold (0-19 gray)

CSS custom properties (define in the component or globals.css):
--score-hot-bg: #dcfce7; --score-hot-text: #16a34a; --score-hot-border: #86efac
--score-warm-bg: #fef9c3; --score-warm-text: #ca8a04; --score-warm-border: #fde047
--score-cool-bg: #e0f2fe; --score-cool-text: #0284c7; --score-cool-border: #7dd3fc
--score-cold-bg: #f1f5f9; --score-cold-text: #94a3b8; --score-cold-border: #cbd5e1

Change arrows: if previousScore exists and |score - previousScore| >= 5, show a 12px arrow immediately right of the badge circle. Green ↑ for increase, red ↓ for decrease. Hidden if change < 5.

Use Tailwind for all styling.

## Step 8: Frontend — Contact List Score Column + Sort

Modify frontend/src/app/dashboard/contacts/page.tsx:

1. Add ScoreBadge to each contact row (table view) and card (grid view)
2. Add "Score" to the sort dropdown — when selected, pass sort=score to listContacts API
3. Add signal tags next to each contact: top 3 from lead_score_signals by weight, "+N" chip if more. Colors: green for positive, amber for warning, gray for neutral.

4. Add going cold banner at top of contact list (above table, below page header):
   - Fetch going-cold count via getGoingColdCount
   - If count > 0: show amber banner "N contacts going cold" / "1 contact is going cold"
   - X button dismisses for 24 hours (localStorage with TTL, match existing follow-up banner pattern)

5. All score UI conditionally rendered: check show_lead_scores from user settings. If false, hide score column, sort option, banner.

## Step 9: Frontend — Score Slide-Over Panel

Create a ScorePanel slide-over component used on the contacts list page.

When user clicks a score badge on the contact list, a 400px panel slides in from the right:
- Dimension breakdown: Engagement/Readiness/Velocity/Profile sub-scores (from lead_score_signals JSONB, available immediately)
- AI explanation: fetch async, show skeleton pulse while loading. On error show "AI analysis temporarily unavailable."
- Suggested action: primary filled button that opens contact-scoped AI chat with suggested action as pre-filled message

Dismissal: click outside or Escape key.

Look at the existing contact detail page and chat components for patterns on opening AI chat with context.

## Step 10: Frontend — Contact Detail + Pipeline Integration

Two small integrations:

1. Contact detail page (frontend/src/app/dashboard/contacts/[id]/page.tsx):
   - Add ScoreBadge (default size) in the header area next to contact name
   - Clicking expands an inline card below showing dimension breakdown (same data as slide-over but inline, no AI explanation needed here)

2. Pipeline page (frontend/src/app/dashboard/pipeline/page.tsx):
   - Add ScoreBadge (compact size, 24px) to each deal card, next to existing health dot
   - Only show if the deal has a linked contact with a score
   - Check show_lead_scores setting — hide if false

## Step 11: Tests

Add tests for the scoring engine:

backend/internal/scoring/scoring_test.go — ~25 unit tests:
- Zero activities = score 0
- Each dimension at min/max boundaries
- Time decay: activity at 7d (full weight), 20d (half), 35d (zero)
- Activity type multipliers: showing 1.5x, call 1.0x, email 0.75x, note 0.5x
- Engagement buckets: weighted count thresholds at 0.5, 2.5, 5.5
- Velocity: no prior period = 0, equal periods, acceleration
- Profile completeness: 0 fields, all fields, partial
- Readiness: no deal, deal at various stages, pre-approval
- Fault tolerance: verify errors are swallowed and nil returned
- previous_lead_score preserved correctly on recompute

5 integration tests verifying triggers fire correctly:
- CreateActivity triggers recompute
- UpdateDeal stage change triggers recompute
- CreateBuyerProfile triggers recompute
- DeleteDeal triggers recompute
- CreateGeneralActivity with nil contact_id does NOT trigger recompute

---

## Execution Order

Steps 1-5 are backend (sequential). Steps 6-10 are frontend (6-7 first, then 8-10 can parallelize). Step 11 is tests, best done after steps 2-3.
