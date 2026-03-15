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

func main() {
	loadEnv(".env")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
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

	// Idempotency check
	var count int
	pool.QueryRow(ctx, "SELECT COUNT(*) FROM contacts WHERE agent_id = $1", agentID).Scan(&count)
	if count > 0 {
		fmt.Printf("Already seeded (%d contacts found). Skipping.\n", count)
		return
	}

	// -------------------------------------------------------------------------
	// Contacts
	// -------------------------------------------------------------------------
	type contact struct{ first, last, email, phone, source string }
	contactRows := []contact{
		{"Sarah", "Johnson", "sarah.johnson@email.com", "201-555-0101", "Zillow"},
		{"Michael", "Williams", "m.williams@gmail.com", "908-555-0102", "Referral"},
		{"Emily", "Davis", "emily.davis@yahoo.com", "732-555-0103", "Open House"},
		{"James", "Martinez", "james.m@proton.me", "201-555-0104", "Cold Call"},
		{"Jennifer", "Brown", "jen.brown@outlook.com", "973-555-0105", "Zillow"},
		{"Robert", "Wilson", "r.wilson@gmail.com", "908-555-0106", "WhatsApp"},
		{"Lisa", "Anderson", "lisa.anderson@email.com", "732-555-0107", "Referral"},
		{"David", "Taylor", "david.t@gmail.com", "201-555-0108", "Cold Call"},
		{"Amanda", "Thomas", "amanda.t@yahoo.com", "973-555-0109", "Open House"},
		{"Daniel", "Jackson", "d.jackson@gmail.com", "908-555-0110", "Zillow"},
		{"Michelle", "White", "michelle.w@email.com", "732-555-0111", "Referral"},
		{"Christopher", "Harris", "chris.h@gmail.com", "201-555-0112", "WhatsApp"},
		{"Jessica", "Clark", "jessica.clark@yahoo.com", "973-555-0113", "Zillow"},
		{"Matthew", "Lewis", "matt.lewis@gmail.com", "908-555-0114", "Open House"},
		{"Ashley", "Robinson", "ashley.r@outlook.com", "732-555-0115", "Cold Call"},
	}

	contactIDs := make([]string, len(contactRows))
	for i, c := range contactRows {
		var id string
		err := pool.QueryRow(ctx,
			`INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source)
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			agentID, c.first, c.last, c.email, c.phone, c.source,
		).Scan(&id)
		if err != nil {
			log.Fatalf("insert contact %s: %v", c.first, err)
		}
		contactIDs[i] = id
		fmt.Printf("  + Contact: %s %s\n", c.first, c.last)
	}

	// -------------------------------------------------------------------------
	// Buyer Profiles (3 contacts)
	// -------------------------------------------------------------------------
	type buyerProfile struct {
		idx          int
		budgetMin    float64
		budgetMax    float64
		bedrooms     int
		bathrooms    float64
		locations    []string
		mustHaves    []string
		propType     string
		timeline     string
		preApproved  bool
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
	// Deals (10 across all 7 stages)
	// -------------------------------------------------------------------------
	type deal struct {
		contactIdx int
		stageName  string
		title      string
		value      float64
		notes      string
	}
	dealRows := []deal{
		{0, "Lead", "Johnson — 3BR Hoboken Condo", 525000, "Interested in downtown Hoboken, needs parking"},
		{1, "Contacted", "Williams — Montclair Colonial", 875000, "Pre-approved, very motivated"},
		{2, "Touring", "Davis — Edgewater High-Rise", 385000, "Showing 3 units next Tuesday"},
		{3, "Offer", "Martinez — Summit Cape Cod", 650000, "Offer at $640k, awaiting seller response"},
		{4, "Under Contract", "Brown — Maplewood Craftsman", 720000, "Under contract, closing in 30 days"},
		{5, "Closed", "Wilson — Jersey City Brownstone", 890000, "Closed! Commission pending"},
		{6, "Lost", "Anderson — Hoboken Studio", 295000, "Went with another agent"},
		{7, "Lead", "Taylor — Westfield New Build", 950000, "Early stage, just exploring options"},
		{8, "Contacted", "Thomas — Morristown Victorian", 580000, "Second contact made, scheduling call"},
		{9, "Touring", "Jackson — Princeton Townhouse", 675000, "Toured 3 properties, narrowing down"},
	}
	for _, d := range dealRows {
		stageID, ok := stageMap[d.stageName]
		if !ok {
			log.Fatalf("stage not found: %s", d.stageName)
		}
		var id string
		err := pool.QueryRow(ctx,
			`INSERT INTO deals (agent_id, contact_id, stage_id, title, value, notes)
			 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			agentID, contactIDs[d.contactIdx], stageID, d.title, d.value, d.notes,
		).Scan(&id)
		if err != nil {
			log.Fatalf("insert deal %s: %v", d.title, err)
		}
		fmt.Printf("  + Deal: %s (%s)\n", d.title, d.stageName)
	}

	// -------------------------------------------------------------------------
	// Activities (20 — some old to trigger "needs follow-up" widget)
	// -------------------------------------------------------------------------
	type activity struct {
		contactIdx int
		actType    string
		body       string
		daysAgo    int
	}
	actRows := []activity{
		{0, "call", "Left voicemail about new Hoboken listings", 1},
		{0, "email", "Sent listing report — 5 matching properties", 3},
		{1, "call", "Spoke 20 min, very motivated buyer", 0},
		{1, "showing", "Toured 123 Grove St and 456 Pine Ave in Montclair", 2},
		{2, "email", "Followed up on Edgewater tour feedback", 5},
		{3, "note", "Client prefers older neighborhoods with character", 7},
		{3, "call", "Discussed offer strategy for Summit property", 1},
		{4, "email", "Sent contract to attorney for review", 0},
		{5, "note", "Commission payment received — great transaction!", 14},
		{6, "call", "Final check-in — client found property elsewhere", 21},
		{7, "email", "Initial inquiry response with neighborhood guides", 10},
		{8, "call", "First call with Amanda, very nice couple", 4},
		{9, "showing", "Toured 4 properties in Princeton area", 6},
		{10, "email", "Sent comparable sales for counter-offer prep", 2},
		{11, "note", "Chris referred by Johnson family — warm lead", 12},
		{12, "call", "Voicemail left — interested in Zillow listing 789 Main", 8},
		{13, "task", "Call back Monday about scheduling showings", 3},
		{14, "email", "Cold outreach — NJ real estate market update newsletter", 15},
		{5, "call", "Post-closing checklist sent", 10},
		{1, "task", "Prepare comparative market analysis for Williams", 0},
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
	fmt.Printf("  + %d activities seeded\n", len(actRows))

	fmt.Println("\n✅ Seed complete!")
}
