//go:build ignore

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/scoring"
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

type contactResult struct {
	ID        string
	Name      string
	Score     int
	PrevScore *int
	Signals   *scoring.SignalBreakdown
}

func tierLabel(score int) string {
	switch {
	case score >= 80:
		return "🔥 Hot"
	case score >= 50:
		return "🟡 Warm"
	case score >= 20:
		return "🔵 Cool"
	default:
		return "⬜ Cold"
	}
}

func main() {
	loadEnv(".env")
	loadEnv("../.env")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
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

	// Get the agent ID — query via a transaction that bypasses RLS
	var agentID string
	err = pool.QueryRow(ctx, "SELECT id FROM users ORDER BY created_at ASC LIMIT 1").Scan(&agentID)
	if err != nil {
		// Try without ORDER BY in case created_at doesn't exist
		err = pool.QueryRow(ctx, "SET LOCAL row_security = off; SELECT id FROM users LIMIT 1").Scan(&agentID)
		if err != nil {
			log.Fatalf("No users found: %v", err)
		}
	}
	fmt.Printf("Computing lead scores for agent: %s\n\n", agentID)

	// Get all contacts for this agent
	rows, err := pool.Query(ctx,
		`SELECT id, first_name || ' ' || last_name AS name
		 FROM contacts WHERE agent_id = $1 ORDER BY created_at DESC`, agentID)
	if err != nil {
		log.Fatalf("query contacts: %v", err)
	}

	var contacts []struct {
		ID   string
		Name string
	}
	for rows.Next() {
		var c struct {
			ID   string
			Name string
		}
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			log.Fatalf("scan contact: %v", err)
		}
		contacts = append(contacts, c)
	}
	rows.Close()

	if len(contacts) == 0 {
		fmt.Println("No contacts found. Run the seed script first:")
		fmt.Println("  cd backend/scripts && go run seed.go")
		return
	}

	fmt.Printf("Found %d contacts. Computing scores...\n\n", len(contacts))

	// Compute lead score for each contact in an RLS-scoped transaction
	var results []contactResult
	for _, c := range contacts {
		tx, err := pool.Begin(ctx)
		if err != nil {
			log.Fatalf("begin tx: %v", err)
		}

		// Set RLS context
		_, err = tx.Exec(ctx, "SELECT set_config('app.current_agent_id', $1, true)", agentID)
		if err != nil {
			tx.Rollback(ctx)
			log.Fatalf("set RLS: %v", err)
		}

		// Compute the score
		err = scoring.ComputeLeadScore(ctx, tx, c.ID)
		if err != nil {
			tx.Rollback(ctx)
			log.Printf("scoring failed for %s: %v", c.Name, err)
			continue
		}

		if err := tx.Commit(ctx); err != nil {
			log.Fatalf("commit: %v", err)
		}

		// Read the computed score back
		var score int
		var prevScore *int
		var signalsJSON []byte
		err = pool.QueryRow(ctx,
			`SELECT lead_score, previous_lead_score, lead_score_signals
			 FROM contacts WHERE id = $1`, c.ID,
		).Scan(&score, &prevScore, &signalsJSON)
		if err != nil {
			log.Fatalf("read score for %s: %v", c.Name, err)
		}

		var breakdown *scoring.SignalBreakdown
		if signalsJSON != nil {
			breakdown = &scoring.SignalBreakdown{}
			json.Unmarshal(signalsJSON, breakdown)
		}

		results = append(results, contactResult{
			ID:        c.ID,
			Name:      c.Name,
			Score:     score,
			PrevScore: prevScore,
			Signals:   breakdown,
		})
	}

	// Print report
	fmt.Println("═══════════════════════════════════════════════════════════════════")
	fmt.Println("                    LEAD SCORING REPORT")
	fmt.Println("═══════════════════════════════════════════════════════════════════")
	fmt.Println()

	// Group by tier
	tiers := map[string][]contactResult{
		"hot":  {},
		"warm": {},
		"cool": {},
		"cold": {},
	}
	for _, r := range results {
		switch {
		case r.Score >= 80:
			tiers["hot"] = append(tiers["hot"], r)
		case r.Score >= 50:
			tiers["warm"] = append(tiers["warm"], r)
		case r.Score >= 20:
			tiers["cool"] = append(tiers["cool"], r)
		default:
			tiers["cold"] = append(tiers["cold"], r)
		}
	}

	for _, tier := range []string{"hot", "warm", "cool", "cold"} {
		contacts := tiers[tier]
		if len(contacts) == 0 {
			continue
		}

		var header string
		switch tier {
		case "hot":
			header = "HOT (80-100)"
		case "warm":
			header = "WARM (50-79)"
		case "cool":
			header = "COOL (20-49)"
		case "cold":
			header = "COLD (0-19)"
		}
		fmt.Printf("── %s ─────────────────────────────────────────────\n", header)
		for _, r := range contacts {
			fmt.Printf("\n  %s  %s — Score: %d\n", tierLabel(r.Score), r.Name, r.Score)
			if r.Signals != nil {
				fmt.Printf("    Engagement: %d/30  Readiness: %d/30  Velocity: %d/20  Profile: %d/20\n",
					r.Signals.Engagement, r.Signals.Readiness, r.Signals.Velocity, r.Signals.Profile)
				if len(r.Signals.TopSignals) > 0 {
					fmt.Printf("    Signals: %s\n", strings.Join(r.Signals.TopSignals, " | "))
				}
			}
			if r.PrevScore != nil {
				delta := r.Score - *r.PrevScore
				if delta > 0 {
					fmt.Printf("    Change: +%d from previous score %d\n", delta, *r.PrevScore)
				} else if delta < 0 {
					fmt.Printf("    Change: %d from previous score %d\n", delta, *r.PrevScore)
				}
			}
		}
		fmt.Println()
	}

	// Summary
	fmt.Println("── SUMMARY ────────────────────────────────────────────────────────")
	fmt.Printf("  Total contacts scored: %d\n", len(results))
	fmt.Printf("  Hot:  %d  |  Warm: %d  |  Cool: %d  |  Cold: %d\n",
		len(tiers["hot"]), len(tiers["warm"]), len(tiers["cool"]), len(tiers["cold"]))

	var totalScore int
	for _, r := range results {
		totalScore += r.Score
	}
	if len(results) > 0 {
		fmt.Printf("  Average score: %d\n", totalScore/len(results))
	}
	fmt.Println()
}
