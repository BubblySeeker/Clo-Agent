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

	// Global middleware stack
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Compress(5))
	r.Use(middleware.CORSHandler())

	// -------------------------------------------------------------------------
	// Routes
	// -------------------------------------------------------------------------

	// Public
	r.Get("/health", handlers.Health)

	// Protected — Clerk JWT + user sync required
	r.Group(func(r chi.Router) {
		r.Use(middleware.ClerkAuth(clerkClient))
		r.Use(middleware.UserSync(pool, clerkClient))

		// Dashboard
		r.Get("/api/dashboard/summary", handlers.GetDashboardSummary(pool))
		r.Get("/api/dashboard/layout", handlers.GetDashboardLayout(pool))
		r.Put("/api/dashboard/layout", handlers.SaveDashboardLayout(pool))

		// Contacts
		r.Get("/api/contacts", handlers.ListContacts(pool))
		r.Post("/api/contacts", handlers.CreateContact(pool))
		r.Get("/api/contacts/{id}", handlers.GetContact(pool))
		r.Patch("/api/contacts/{id}", handlers.UpdateContact(pool))
		r.Delete("/api/contacts/{id}", handlers.DeleteContact(pool))

		// Buyer Profiles
		r.Get("/api/contacts/{id}/buyer-profile", handlers.GetBuyerProfile(pool))
		r.Post("/api/contacts/{id}/buyer-profile", handlers.CreateBuyerProfile(pool))
		r.Patch("/api/contacts/{id}/buyer-profile", handlers.UpdateBuyerProfile(pool))

		// Activities
		r.Get("/api/contacts/{id}/activities", handlers.ListActivities(pool))
		r.Post("/api/contacts/{id}/activities", handlers.CreateActivity(pool))
		r.Get("/api/activities", handlers.ListAllActivities(pool))
		r.Post("/api/activities", handlers.CreateGeneralActivity(pool))

		// AI Profile
		r.Get("/api/contacts/{id}/ai-profile", handlers.GetAIProfile(pool))
		r.Post("/api/contacts/{id}/ai-profile/regenerate", handlers.RegenerateAIProfile(pool, cfg))

		// Deals
		r.Get("/api/deals", handlers.ListDeals(pool))
		r.Post("/api/deals", handlers.CreateDeal(pool))
		r.Get("/api/deals/{id}", handlers.GetDeal(pool))
		r.Patch("/api/deals/{id}", handlers.UpdateDeal(pool))
		r.Delete("/api/deals/{id}", handlers.DeleteDeal(pool))

		// Deal stages
		r.Get("/api/deal-stages", handlers.ListDealStages(pool))

		// Conversations
		r.Get("/api/ai/conversations", handlers.ListConversations(pool))
		r.Post("/api/ai/conversations", handlers.CreateConversation(pool))
		r.Get("/api/ai/conversations/{id}", handlers.GetConversation(pool))
		r.Delete("/api/ai/conversations/{id}", handlers.DeleteConversation(pool))
		r.Get("/api/ai/conversations/{id}/messages", handlers.GetMessages(pool))
		r.Post("/api/ai/conversations/{id}/messages", handlers.SendMessage(pool, cfg))
		r.Post("/api/ai/conversations/{id}/confirm", handlers.ConfirmToolAction(cfg))

		// Analytics
		r.Get("/api/analytics/pipeline", handlers.GetPipelineAnalytics(pool))
		r.Get("/api/analytics/activities", handlers.GetActivityAnalytics(pool))
		r.Get("/api/analytics/contacts", handlers.GetContactAnalytics(pool))
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

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("HTTP server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		return fmt.Errorf("server error: %w", err)
	case sig := <-quit:
		slog.Info("shutdown signal received", "signal", sig)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown failed: %w", err)
	}

	slog.Info("server shutdown complete")
	return nil
}
