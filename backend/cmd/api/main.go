package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/clerkinc/clerk-sdk-go/clerk"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/handlers"
	"crm-api/internal/middleware"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	if err := run(); err != nil {
		slog.Error("server exited with error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// -------------------------------------------------------------------------
	// Configuration
	// -------------------------------------------------------------------------
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	// -------------------------------------------------------------------------
	// Database
	// -------------------------------------------------------------------------
	ctx := context.Background()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer pool.Close()

	slog.Info("database connection pool established")

	// -------------------------------------------------------------------------
	// Clerk client
	// -------------------------------------------------------------------------
	clerkClient, err := clerk.NewClient(cfg.ClerkSecretKey)
	if err != nil {
		return fmt.Errorf("initialising Clerk client: %w", err)
	}

	// -------------------------------------------------------------------------
	// Router
	// -------------------------------------------------------------------------
	r := chi.NewRouter()

	// Global middleware stack (applied to every request).
	r.Use(chimiddleware.RequestID)       // Inject X-Request-ID header
	r.Use(chimiddleware.RealIP)          // Trust X-Real-IP / X-Forwarded-For
	r.Use(chimiddleware.Logger)          // Structured request logging
	r.Use(chimiddleware.Recoverer)       // Recover from panics gracefully
	r.Use(chimiddleware.Compress(5))     // Gzip responses at level 5
	r.Use(middleware.CORSHandler())      // CORS headers

	// -------------------------------------------------------------------------
	// Routes
	// -------------------------------------------------------------------------

	// Public endpoints — no authentication required.
	r.Get("/health", handlers.Health)

	// Protected endpoints — Clerk JWT required.
	r.Group(func(r chi.Router) {
		r.Use(middleware.ClerkAuth(clerkClient))

		// Future authenticated routes go here, e.g.:
		// r.Get("/api/v1/contacts", handlers.ListContacts(pool))
	})

	// -------------------------------------------------------------------------
	// HTTP server
	// -------------------------------------------------------------------------
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Run the server in a goroutine so we can listen for shutdown signals.
	serverErr := make(chan error, 1)
	go func() {
		slog.Info("HTTP server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	// Wait for an OS signal or a server error.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		return fmt.Errorf("server error: %w", err)
	case sig := <-quit:
		slog.Info("shutdown signal received", "signal", sig)
	}

	// Graceful shutdown: give in-flight requests up to 30 s to complete.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown failed: %w", err)
	}

	slog.Info("server shutdown complete")
	return nil
}
