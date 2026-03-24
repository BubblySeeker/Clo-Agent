// Package background provides background worker goroutines.
package background

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/handlers"
)

// StartEmailSyncLoop runs a background loop that syncs Gmail for all connected agents
// every 5 minutes, then triggers AI lead triage and email embedding.
func StartEmailSyncLoop(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config) {
	// Wait 30s on startup before first sync to let everything initialize
	select {
	case <-time.After(30 * time.Second):
	case <-ctx.Done():
		return
	}

	slog.Info("email sync loop: starting first cycle")
	runSyncCycle(ctx, pool, cfg)

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("email sync loop: shutting down")
			return
		case <-ticker.C:
			runSyncCycle(ctx, pool, cfg)
		}
	}
}

// runSyncCycle syncs Gmail for all agents with connected accounts.
func runSyncCycle(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config) {
	slog.Info("email sync loop: starting cycle")

	// Query all agents with Gmail tokens
	// gmail_tokens has a system SELECT policy (from migration 017) that allows reading without RLS context
	rows, err := pool.Query(ctx,
		`SELECT agent_id, last_synced_at FROM gmail_tokens`,
	)
	if err != nil {
		slog.Error("email sync loop: failed to list agents", "error", err)
		return
	}
	defer rows.Close()

	type agentInfo struct {
		ID         string
		LastSynced *time.Time
	}
	var agents []agentInfo

	for rows.Next() {
		var a agentInfo
		if err := rows.Scan(&a.ID, &a.LastSynced); err != nil {
			slog.Warn("email sync loop: failed to scan agent", "error", err)
			continue
		}
		agents = append(agents, a)
	}
	rows.Close()

	if len(agents) == 0 {
		slog.Info("email sync loop: no connected agents")
		return
	}

	slog.Info("email sync loop: found agents", "count", len(agents))

	for _, agent := range agents {
		select {
		case <-ctx.Done():
			return
		default:
		}

		syncAgent(ctx, pool, cfg, agent.ID)

		// Small delay between agents to be nice to Gmail API
		select {
		case <-time.After(2 * time.Second):
		case <-ctx.Done():
			return
		}
	}

	slog.Info("email sync loop: cycle complete")
}

// syncAgent syncs a single agent's Gmail and triggers AI processing.
func syncAgent(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config, agentID string) {
	result, err := handlers.SyncAgentGmail(ctx, pool, cfg, agentID)
	if err != nil {
		slog.Error("email sync loop: sync failed", "agent_id", agentID, "error", err)
		return
	}

	if result.Skipped {
		slog.Debug("email sync loop: skipped (recent sync)", "agent_id", agentID)
		return
	}

	slog.Info("email sync loop: synced agent",
		"agent_id", agentID,
		"synced", result.Synced,
		"unmatched", len(result.UnmatchedIDs),
		"matched", len(result.MatchedIDs),
	)

	// Trigger AI lead triage for unmatched emails
	if len(result.UnmatchedIDs) > 0 {
		go func() {
			if err := callAITriage(ctx, pool, cfg, agentID, result.UnmatchedIDs); err != nil {
				slog.Error("email sync loop: triage failed", "agent_id", agentID, "error", err)
			}
		}()
	}

	// Trigger email embedding for matched emails
	if len(result.MatchedIDs) > 0 {
		go func() {
			if err := callAIEmbed(ctx, pool, cfg, agentID, result.MatchedIDs); err != nil {
				slog.Error("email sync loop: embed failed", "agent_id", agentID, "error", err)
			}
		}()
	}
}

// ── AI service calls ──────────────────────────────────────────

type triageEmail struct {
	ID          string   `json:"id"`
	FromAddress string   `json:"from_address"`
	FromName    *string  `json:"from_name"`
	Subject     *string  `json:"subject"`
	Snippet     *string  `json:"snippet"`
	Labels      []string `json:"labels"`
}

type triageRequest struct {
	AgentID string         `json:"agent_id"`
	Emails  []triageEmail  `json:"emails"`
}

func callAITriage(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config, agentID string, emailIDs []string) error {
	// Fetch email details for triage
	tx, err := database.BeginWithRLS(ctx, pool, agentID)
	if err != nil {
		return fmt.Errorf("db error: %w", err)
	}
	defer tx.Rollback(ctx)

	var emails []triageEmail
	for _, eid := range emailIDs {
		var e triageEmail
		var labelsJSON []byte
		err := tx.QueryRow(ctx,
			`SELECT id, from_address, from_name, subject, snippet, labels
			 FROM emails WHERE id = $1 AND agent_id = $2`,
			eid, agentID,
		).Scan(&e.ID, &e.FromAddress, &e.FromName, &e.Subject, &e.Snippet, &labelsJSON)
		if err != nil {
			continue
		}
		if labelsJSON != nil {
			json.Unmarshal(labelsJSON, &e.Labels)
		}
		emails = append(emails, e)
	}
	tx.Commit(ctx)

	if len(emails) == 0 {
		return nil
	}

	body, _ := json.Marshal(triageRequest{AgentID: agentID, Emails: emails})
	return postToAIService(ctx, cfg, "/ai/emails/triage", body)
}

type embedEmail struct {
	ID          string  `json:"id"`
	Subject     *string `json:"subject"`
	FromName    *string `json:"from_name"`
	FromAddress *string `json:"from_address"`
	Snippet     *string `json:"snippet"`
}

type embedRequest struct {
	AgentID string       `json:"agent_id"`
	Emails  []embedEmail `json:"emails"`
}

func callAIEmbed(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config, agentID string, emailIDs []string) error {
	// Fetch email details for embedding
	tx, err := database.BeginWithRLS(ctx, pool, agentID)
	if err != nil {
		return fmt.Errorf("db error: %w", err)
	}
	defer tx.Rollback(ctx)

	var emails []embedEmail
	for _, eid := range emailIDs {
		var e embedEmail
		err := tx.QueryRow(ctx,
			`SELECT id, subject, from_name, from_address, snippet
			 FROM emails WHERE id = $1 AND agent_id = $2`,
			eid, agentID,
		).Scan(&e.ID, &e.Subject, &e.FromName, &e.FromAddress, &e.Snippet)
		if err != nil {
			continue
		}
		emails = append(emails, e)
	}
	tx.Commit(ctx)

	if len(emails) == 0 {
		return nil
	}

	body, _ := json.Marshal(embedRequest{AgentID: agentID, Emails: emails})
	return postToAIService(ctx, cfg, "/ai/emails/embed", body)
}

func postToAIService(ctx context.Context, cfg *config.Config, path string, body []byte) error {
	url := cfg.AIServiceURL + path

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("AI service returned %d", resp.StatusCode)
	}

	return nil
}
