package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BeginWithRLS starts a transaction and sets the RLS agent context so that
// row-level security policies can filter data to the authenticated agent.
// The caller is responsible for calling tx.Rollback(ctx) (typically via defer)
// and tx.Commit(ctx) on success.
func BeginWithRLS(ctx context.Context, pool *pgxpool.Pool, agentID string) (pgx.Tx, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}

	_, err = tx.Exec(ctx, "SELECT set_config('app.current_agent_id', $1, true)", agentID)
	if err != nil {
		tx.Rollback(ctx)
		return nil, fmt.Errorf("set RLS context: %w", err)
	}

	return tx, nil
}
