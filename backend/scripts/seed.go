//go:build ignore

package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func loadEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.TrimSpace(parts[0])
		v := strings.TrimSpace(parts[1])
		if os.Getenv(k) == "" {
			os.Setenv(k, v)
		}
	}
}

func hasFlag(name string) bool {
	for _, arg := range os.Args[1:] {
		if arg == name || arg == "-"+name {
			return true
		}
	}
	return false
}

func main() {
	loadEnv(".env")
	loadEnv("../.env")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		// Build DATABASE_URL from individual Postgres vars (root .env uses these)
		user := os.Getenv("POSTGRES_USER")
		pass := os.Getenv("POSTGRES_PASSWORD")
		db := os.Getenv("POSTGRES_DB")
		if user != "" && db != "" {
			dbURL = fmt.Sprintf("postgres://%s:%s@localhost:5432/%s", user, pass, db)
		} else {
			log.Fatal("DATABASE_URL not set and POSTGRES_USER/POSTGRES_DB not found")
		}
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	// Get first user
	var agentID string
	err = pool.QueryRow(ctx, "SELECT id FROM users LIMIT 1").Scan(&agentID)
	if err != nil {
		log.Fatal("No users found. Sign in to the app first to create your account, then run this script.")
	}
	fmt.Printf("Seeding data for agent: %s\n", agentID)

	// --reset flag: delete existing data and re-seed
	if hasFlag("--reset") {
		fmt.Println("Resetting existing seed data...")
		// Deleting contacts cascades to deals, activities, buyer_profiles, etc.
		_, err := pool.Exec(ctx, "DELETE FROM contacts WHERE agent_id = $1", agentID)
		if err != nil {
			log.Fatalf("reset contacts: %v", err)
		}
		// Also clean up deals that might not cascade (agent-level)
		_, _ = pool.Exec(ctx, "DELETE FROM deals WHERE agent_id = $1", agentID)
		// Clean up conversations
		_, _ = pool.Exec(ctx, "DELETE FROM conversations WHERE agent_id = $1", agentID)
		fmt.Println("  Reset complete.")
	} else {
		// Idempotency check
		var count int
		pool.QueryRow(ctx, "SELECT COUNT(*) FROM contacts WHERE agent_id = $1", agentID).Scan(&count)
		if count > 0 {
			fmt.Printf("Already seeded (%d contacts found). Use --reset to re-seed.\n", count)
			return
		}
	}

	// -------------------------------------------------------------------------
	// Contacts (15 total, created in 3 waves for time distribution)
	// -------------------------------------------------------------------------
	type contact struct {
		first, last, email, phone, source string
		daysAgo                           int // backdate created_at
	}
	contactRows := []contact{
		// Wave 1: 8 contacts created 30-90 days ago (previous months)
		{"Sarah", "Johnson", "sarah.johnson@email.com", "201-555-0101", "Zillow", 75},
		{"Michael", "Williams", "m.williams@gmail.com", "908-555-0102", "Referral", 60},
		{"Emily", "Davis", "emily.davis@yahoo.com", "732-555-0103", "Open House", 55},
		{"James", "Martinez", "james.m@proton.me", "201-555-0104", "Cold Call", 45},
		{"Jennifer", "Brown", "jen.brown@outlook.com", "973-555-0105", "Zillow", 40},
		{"Robert", "Wilson", "r.wilson@gmail.com", "908-555-0106", "WhatsApp", 35},
		{"Lisa", "Anderson", "lisa.anderson@email.com", "732-555-0107", "Referral", 32},
		{"David", "Taylor", "david.t@gmail.com", "201-555-0108", "Cold Call", 30},
		// Wave 2: 4 contacts created 10-25 days ago (this month or late last month)
		{"Amanda", "Thomas", "amanda.t@yahoo.com", "973-555-0109", "Open House", 22},
		{"Daniel", "Jackson", "d.jackson@gmail.com", "908-555-0110", "Zillow", 18},
		{"Michelle", "White", "michelle.w@email.com", "732-555-0111", "Referral", 14},
		{"Christopher", "Harris", "chris.h@gmail.com", "201-555-0112", "WhatsApp", 10},
		// Wave 3: 3 contacts created 0-3 days ago (very recent — some with no activities for Speed to Lead "Pending")
		{"Jessica", "Clark", "jessica.clark@yahoo.com", "973-555-0113", "Zillow", 3},
		{"Matthew", "Lewis", "matt.lewis@gmail.com", "908-555-0114", "Open House", 1},
		{"Ashley", "Robinson", "ashley.r@outlook.com", "732-555-0115", "Cold Call", 0},
	}

	contactIDs := make([]string, len(contactRows))
	for i, c := range contactRows {
		var id string
		err := pool.QueryRow(ctx,
			`INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, NOW() - $7::interval) RETURNING id`,
			agentID, c.first, c.last, c.email, c.phone, c.source,
			fmt.Sprintf("%d days", c.daysAgo),
		).Scan(&id)
		if err != nil {
			log.Fatalf("insert contact %s: %v", c.first, err)
		}
		contactIDs[i] = id
		fmt.Printf("  + Contact: %s %s (%d days ago)\n", c.first, c.last, c.daysAgo)
	}

	// -------------------------------------------------------------------------
	// Buyer Profiles (6 contacts — was 3)
	// -------------------------------------------------------------------------
	type buyerProfile struct {
		idx         int
		budgetMin   float64
		budgetMax   float64
		bedrooms    int
		bathrooms   float64
		locations   []string
		mustHaves   []string
		propType    string
		timeline    string
		preApproved bool
	}
	bpRows := []buyerProfile{
		{
			idx: 0, budgetMin: 450000, budgetMax: 600000, bedrooms: 3, bathrooms: 2.0,
			locations: []string{"Hoboken", "Jersey City", "Weehawken"},
			mustHaves: []string{"garage", "updated kitchen", "good schools"},
			propType: "single_family", timeline: "3-6 months", preApproved: true,
		},
		{
			idx: 1, budgetMin: 700000, budgetMax: 950000, bedrooms: 4, bathrooms: 2.5,
			locations: []string{"Montclair", "Glen Ridge", "Bloomfield"},
			mustHaves: []string{"large backyard", "master suite", "home office"},
			propType: "single_family", timeline: "ASAP", preApproved: true,
		},
		{
			idx: 2, budgetMin: 300000, budgetMax: 450000, bedrooms: 2, bathrooms: 2.0,
			locations: []string{"Hoboken", "Edgewater"},
			mustHaves: []string{"doorman", "gym", "parking"},
			propType: "condo", timeline: "6-12 months", preApproved: false,
		},
		{
			idx: 4, budgetMin: 550000, budgetMax: 750000, bedrooms: 3, bathrooms: 2.5,
			locations: []string{"Maplewood", "South Orange", "Millburn"},
			mustHaves: []string{"finished basement", "walkable downtown", "good schools"},
			propType: "single_family", timeline: "3-6 months", preApproved: true,
		},
		{
			idx: 8, budgetMin: 400000, budgetMax: 550000, bedrooms: 2, bathrooms: 1.5,
			locations: []string{"Morristown", "Madison", "Chatham"},
			mustHaves: []string{"close to train", "updated kitchen"},
			propType: "townhouse", timeline: "ASAP", preApproved: true,
		},
		{
			idx: 9, budgetMin: 600000, budgetMax: 800000, bedrooms: 3, bathrooms: 2.0,
			locations: []string{"Princeton", "Lawrenceville", "Pennington"},
			mustHaves: []string{"home office", "large lot", "quiet street"},
			propType: "single_family", timeline: "6-12 months", preApproved: false,
		},
	}
	for _, bp := range bpRows {
		_, err := pool.Exec(ctx,
			`INSERT INTO buyer_profiles
			 (contact_id, budget_min, budget_max, bedrooms, bathrooms, locations, must_haves, property_type, timeline, pre_approved)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			 ON CONFLICT (contact_id) DO NOTHING`,
			contactIDs[bp.idx], bp.budgetMin, bp.budgetMax, bp.bedrooms, bp.bathrooms,
			bp.locations, bp.mustHaves, bp.propType, bp.timeline, bp.preApproved,
		)
		if err != nil {
			log.Fatalf("insert buyer profile: %v", err)
		}
		fmt.Printf("  + Buyer profile for %s %s\n", contactRows[bp.idx].first, contactRows[bp.idx].last)
	}

	// -------------------------------------------------------------------------
	// Deal stages
	// -------------------------------------------------------------------------
	stageMap := map[string]string{}
	rows, err := pool.Query(ctx, "SELECT id, name FROM deal_stages ORDER BY position")
	if err != nil {
		log.Fatalf("load stages: %v", err)
	}
	for rows.Next() {
		var id, name string
		rows.Scan(&id, &name)
		stageMap[name] = id
	}
	rows.Close()

	// -------------------------------------------------------------------------
	// Deals — 10 active pipeline deals + 6 historical closed deals for revenue chart
	// -------------------------------------------------------------------------
	type deal struct {
		contactIdx int
		stageName  string
		title      string
		value      float64
		notes      string
		daysAgo    int // backdate created_at and updated_at (0 = now)
	}

	// Active pipeline deals (current)
	dealRows := []deal{
		{0, "Lead", "Johnson — 3BR Hoboken Condo", 525000, "Interested in downtown Hoboken, needs parking", 5},
		{1, "Contacted", "Williams — Montclair Colonial", 875000, "Pre-approved, very motivated", 3},
		{2, "Touring", "Davis — Edgewater High-Rise", 385000, "Showing 3 units next Tuesday", 4},
		{3, "Offer", "Martinez — Summit Cape Cod", 650000, "Offer at $640k, awaiting seller response", 2},
		{4, "Under Contract", "Brown — Maplewood Craftsman", 720000, "Under contract, closing in 30 days", 1},
		{5, "Closed", "Wilson — Jersey City Brownstone", 890000, "Closed! Commission pending", 5},
		{6, "Lost", "Anderson — Hoboken Studio", 295000, "Went with another agent", 20},
		{7, "Lead", "Taylor — Westfield New Build", 950000, "Early stage, just exploring options", 8},
		{8, "Contacted", "Thomas — Morristown Victorian", 580000, "Second contact made, scheduling call", 6},
		{9, "Touring", "Jackson — Princeton Townhouse", 675000, "Toured 3 properties, narrowing down", 3},
	}

	// Historical closed deals spread across 6 months for revenue chart
	historicalDeals := []deal{
		{0, "Closed", "Johnson — Previous Sale (Bayonne Ranch)", 425000, "Closed 6 months ago", 180},
		{1, "Closed", "Williams — Previous Sale (Montclair Split)", 780000, "Closed 5 months ago", 150},
		{2, "Closed", "Davis — Previous Sale (Edgewater Studio)", 310000, "Closed 4 months ago", 120},
		{3, "Closed", "Martinez — Previous Sale (Summit Colonial)", 675000, "Closed 3 months ago", 90},
		{6, "Closed", "Anderson — Previous Sale (Hoboken 2BR)", 520000, "Closed 2 months ago", 60},
		{7, "Closed", "Taylor — Previous Sale (Westfield Condo)", 390000, "Closed last month", 25},
	}

	allDeals := append(dealRows, historicalDeals...)
	for _, d := range allDeals {
		stageID, ok := stageMap[d.stageName]
		if !ok {
			log.Fatalf("stage not found: %s", d.stageName)
		}
		var id string
		err := pool.QueryRow(ctx,
			`INSERT INTO deals (agent_id, contact_id, stage_id, title, value, notes, created_at, updated_at)
			 VALUES ($1,$2,$3,$4,$5,$6, NOW() - $7::interval, NOW() - $7::interval) RETURNING id`,
			agentID, contactIDs[d.contactIdx], stageID, d.title, d.value, d.notes,
			fmt.Sprintf("%d days", d.daysAgo),
		).Scan(&id)
		if err != nil {
			log.Fatalf("insert deal %s: %v", d.title, err)
		}
		fmt.Printf("  + Deal: %s (%s, %d days ago)\n", d.title, d.stageName, d.daysAgo)
	}

	// -------------------------------------------------------------------------
	// Activities (~35 total — time-distributed, 8 tasks)
	// -------------------------------------------------------------------------
	type activity struct {
		contactIdx int
		actType    string
		body       string
		daysAgo    int
	}
	actRows := []activity{
		// Recent activities (0-6 days ago)
		{0, "call", "Left voicemail about new Hoboken listings", 1},
		{0, "email", "Sent listing report — 5 matching properties", 3},
		{1, "call", "Spoke 20 min, very motivated buyer", 0},
		{1, "showing", "Toured 123 Grove St and 456 Pine Ave in Montclair", 2},
		{2, "email", "Followed up on Edgewater tour feedback", 5},
		{3, "call", "Discussed offer strategy for Summit property", 1},
		{4, "email", "Sent contract to attorney for review", 0},
		{8, "call", "First call with Amanda, very nice couple", 4},
		{9, "showing", "Toured 4 properties in Princeton area", 6},
		{10, "email", "Sent comparable sales for counter-offer prep", 2},

		// Older activities (7-60 days ago — triggers "needs follow-up" for some contacts)
		{3, "note", "Client prefers older neighborhoods with character", 12},
		{5, "note", "Commission payment received — great transaction!", 14},
		{5, "call", "Post-closing checklist sent", 10},
		{6, "call", "Final check-in — client found property elsewhere", 25},
		{7, "email", "Initial inquiry response with neighborhood guides", 15},
		{11, "note", "Chris referred by Johnson family — warm lead", 18},
		{12, "call", "Voicemail left — interested in Zillow listing 789 Main", 8},
		{14, "email", "Cold outreach — NJ real estate market update newsletter", 20},

		// Historical activities (30-60 days ago — for history depth)
		{0, "call", "Initial phone consultation about buying timeline", 45},
		{1, "email", "Sent pre-approval lender recommendations", 40},
		{2, "showing", "First showing — 2 units in Edgewater", 35},
		{3, "call", "First contact — inquired about Summit homes", 38},
		{4, "email", "Sent neighborhood overview for Maplewood", 32},
		{5, "call", "Discussed Jersey City brownstone market", 50},
		{6, "note", "Met at open house, interested in studios", 55},
		{7, "call", "Exploratory call about new construction options", 30},

		// Task activities (8 tasks, spread across 0-7 days ago)
		{1, "task", "Prepare comparative market analysis for Williams", 0},
		{13, "task", "Schedule showing for Matt Lewis — 3 properties", 0},
		{0, "task", "Send CMA report for Hoboken condos", 1},
		{3, "task", "Follow up on offer response from seller", 1},
		{9, "task", "Call back about financing options", 2},
		{2, "task", "Schedule second showing at Edgewater", 3},
		{4, "task", "Coordinate home inspection appointment", 4},
		{8, "task", "Send Morristown listing packet to Amanda", 7},
	}
	for _, a := range actRows {
		_, err := pool.Exec(ctx,
			`INSERT INTO activities (agent_id, contact_id, type, body, created_at)
			 VALUES ($1, $2, $3, $4, NOW() - $5::interval)`,
			agentID, contactIDs[a.contactIdx], a.actType, a.body,
			fmt.Sprintf("%d days", a.daysAgo),
		)
		if err != nil {
			log.Fatalf("insert activity: %v", err)
		}
	}
	fmt.Printf("  + %d activities seeded (including 8 tasks)\n", len(actRows))

	fmt.Println("\n✅ Seed complete!")
	fmt.Println("  15 contacts (spread across 0-75 days)")
	fmt.Println("  6 buyer profiles")
	fmt.Println("  16 deals (10 active pipeline + 6 historical closed)")
	fmt.Println("  35 activities (8 tasks, varied recency)")
}
