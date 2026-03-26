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
	"github.com/go-chi/httprate"

	"crm-api/internal/background"
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

	// Initialise token encryption (optional — if ENCRYPTION_KEY is set)
	handlers.InitEncryption(cfg.EncryptionKey)

	// -------------------------------------------------------------------------
	// Recover stuck documents from previous crashes
	// -------------------------------------------------------------------------
	{
		cleanupCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		// Use a transaction with a dummy agent ID to satisfy FORCE RLS.
		tx, txErr := pool.Begin(cleanupCtx)
		if txErr == nil {
			tx.Exec(cleanupCtx, "SET LOCAL app.current_agent_id = '00000000-0000-0000-0000-000000000000'")
			result, err := tx.Exec(cleanupCtx,
				`UPDATE documents SET status = 'failed', error_message = 'Processing interrupted by server restart', updated_at = NOW()
				 WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'`)
			if err != nil {
				slog.Error("failed to recover stuck documents", "error", err)
			} else if result.RowsAffected() > 0 {
				slog.Info("recovered stuck documents", "count", result.RowsAffected())
			}
			tx.Commit(cleanupCtx)
		}
	}

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
	r.Use(middleware.StructuredLogger())
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Compress(5))
	r.Use(middleware.CORSHandler([]string{cfg.FrontendURL}))

	// Global rate limit: 100 requests/min per IP
	r.Use(httprate.LimitByIP(100, time.Minute))

	// -------------------------------------------------------------------------
	// Routes
	// -------------------------------------------------------------------------

	// Public
	r.Get("/health", handlers.Health)
	r.Get("/api/auth/google/callback", handlers.GmailAuthCallback(pool, cfg))

	// Client Portal (public — token-based auth, no Clerk)
	r.Get("/api/portal/auth/{token}", handlers.PortalAuth(pool))
	r.Get("/api/portal/view/{token}/dashboard", handlers.PortalDashboard(pool))
	r.Get("/api/portal/view/{token}/deals", handlers.PortalDeals(pool))
	r.Get("/api/portal/view/{token}/properties", handlers.PortalProperties(pool))
	r.Get("/api/portal/view/{token}/timeline", handlers.PortalTimeline(pool))

	// Protected — Clerk JWT + user sync required
	r.Group(func(r chi.Router) {
		r.Use(middleware.ClerkAuth(clerkClient, cfg.AIServiceSecret))
		r.Use(middleware.UserSync(pool, clerkClient))

		// Dashboard
		r.Get("/api/dashboard/summary", handlers.GetDashboardSummary(pool))
		r.Get("/api/dashboard/layout", handlers.GetDashboardLayout(pool))
		r.Put("/api/dashboard/layout", handlers.SaveDashboardLayout(pool))

		// Demo Data
		r.Get("/api/demo-data", handlers.GetDemoDataStatus(pool))
		r.Post("/api/demo-data", handlers.SeedDemoData(pool))
		r.Delete("/api/demo-data", handlers.ClearDemoData(pool))

		// Contacts
		r.Get("/api/contacts", handlers.ListContacts(pool))
		r.Post("/api/contacts", handlers.CreateContact(pool))
		r.Get("/api/contacts/going-cold-count", handlers.GoingColdCount(pool))
		r.Get("/api/contacts/{id}", handlers.GetContact(pool))
		r.Patch("/api/contacts/{id}", handlers.UpdateContact(pool))
		r.Delete("/api/contacts/{id}", handlers.DeleteContact(pool))
		r.Get("/api/contacts/{id}/lead-score-explanation", handlers.GetLeadScoreExplanation(pool))

		// Buyer Profiles
		r.Get("/api/contacts/{id}/buyer-profile", handlers.GetBuyerProfile(pool))
		r.Post("/api/contacts/{id}/buyer-profile", handlers.CreateBuyerProfile(pool))
		r.Patch("/api/contacts/{id}/buyer-profile", handlers.UpdateBuyerProfile(pool))

		// Activities
		r.Get("/api/contacts/{id}/activities", handlers.ListActivities(pool))
		r.Post("/api/contacts/{id}/activities", handlers.CreateActivity(pool))
		r.Get("/api/activities", handlers.ListAllActivities(pool))
		r.Post("/api/activities", handlers.CreateGeneralActivity(pool))
		r.Patch("/api/activities/{id}", handlers.UpdateActivity(pool))

		// Tasks
		r.Get("/api/tasks", handlers.ListTasks(pool))

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

		// Properties
		r.Get("/api/properties", handlers.ListProperties(pool))
		r.Post("/api/properties", handlers.CreateProperty(pool))
		r.Get("/api/properties/{id}", handlers.GetProperty(pool))
		r.Patch("/api/properties/{id}", handlers.UpdateProperty(pool))
		r.Delete("/api/properties/{id}", handlers.DeleteProperty(pool))
		r.Get("/api/properties/{id}/matches", handlers.GetPropertyMatches(pool))

		// Conversations (stricter rate limit for AI-heavy endpoints)
		r.Group(func(r chi.Router) {
			r.Use(httprate.LimitByIP(20, time.Minute))
			r.Get("/api/ai/conversations", handlers.ListConversations(pool))
			r.Post("/api/ai/conversations", handlers.CreateConversation(pool))
			r.Get("/api/ai/conversations/{id}", handlers.GetConversation(pool))
			r.Delete("/api/ai/conversations/{id}", handlers.DeleteConversation(pool))
			r.Get("/api/ai/conversations/{id}/messages", handlers.GetMessages(pool))
			r.Post("/api/ai/conversations/{id}/messages", handlers.SendMessage(pool, cfg))
			r.Post("/api/ai/conversations/{id}/confirm", handlers.ConfirmToolAction(cfg))
			r.Post("/api/ai/conversations/{id}/undo", handlers.UndoToolAction(cfg))
		})

		// Settings
		r.Get("/api/settings", handlers.GetSettings(pool))
		r.Patch("/api/settings", handlers.UpdateSettings(pool))

		// Search
		r.Post("/api/search", handlers.SemanticSearch(cfg))

		// Workflows
		r.Get("/api/workflows", handlers.ListWorkflows(pool))
		r.Post("/api/workflows", handlers.CreateWorkflow(pool))
		r.Get("/api/workflows/{id}", handlers.GetWorkflow(pool))
		r.Patch("/api/workflows/{id}", handlers.UpdateWorkflow(pool))
		r.Delete("/api/workflows/{id}", handlers.DeleteWorkflow(pool))
		r.Post("/api/workflows/{id}/toggle", handlers.ToggleWorkflow(pool))
		r.Post("/api/workflows/{id}/run", handlers.RunWorkflow(pool, cfg))
		r.Post("/api/workflows/{id}/dry-run", handlers.DryRunWorkflow(pool, cfg))
		r.Get("/api/workflows/{id}/runs", handlers.ListWorkflowRuns(pool))

		// Referrals
		r.Get("/api/referrals", handlers.ListReferrals(pool))
		r.Post("/api/referrals", handlers.CreateReferral(pool))
		r.Delete("/api/referrals/{id}", handlers.DeleteReferral(pool))
		r.Get("/api/referrals/network", handlers.GetReferralNetwork(pool))
		r.Get("/api/referrals/stats", handlers.GetReferralStats(pool))

		// Analytics
		r.Get("/api/analytics/pipeline", handlers.GetPipelineAnalytics(pool))
		r.Get("/api/analytics/activities", handlers.GetActivityAnalytics(pool))
		r.Get("/api/analytics/contacts", handlers.GetContactAnalytics(pool))

		// Portal (agent-side)
		r.Post("/api/portal/invite/{contact_id}", handlers.CreatePortalInvite(pool))
		r.Get("/api/portal/invites", handlers.ListPortalInvites(pool))
		r.Delete("/api/portal/invite/{token_id}", handlers.RevokePortalInvite(pool))
		r.Get("/api/portal/settings", handlers.GetPortalSettings(pool))
		r.Patch("/api/portal/settings", handlers.UpdatePortalSettings(pool))

		// Contact Folders
		r.Get("/api/contact-folders", handlers.ListContactFolders(pool))
		r.Post("/api/contact-folders", handlers.CreateContactFolder(pool))
		r.Patch("/api/contact-folders/{id}", handlers.UpdateContactFolder(pool))
		r.Delete("/api/contact-folders/{id}", handlers.DeleteContactFolder(pool))
		r.Post("/api/contact-folders/{id}/contacts", handlers.MoveContactsToFolder(pool))
		r.Delete("/api/contact-folders/{id}/contacts", handlers.RemoveContactsFromFolder(pool))

		// Document Folders
		r.Get("/api/document-folders", handlers.ListFolders(pool))
		r.Post("/api/document-folders", handlers.CreateFolder(pool))
		r.Patch("/api/document-folders/{id}", handlers.RenameFolder(pool))
		r.Delete("/api/document-folders/{id}", handlers.DeleteFolder(pool))

		// Documents
		r.Post("/api/documents", handlers.UploadDocument(pool, cfg))
		r.Get("/api/documents", handlers.ListDocuments(pool))
		r.Get("/api/documents/counts", handlers.DocumentCounts(pool))
		r.Get("/api/documents/{id}", handlers.GetDocument(pool))
		r.Patch("/api/documents/{id}", handlers.UpdateDocument(pool))
		r.Delete("/api/documents/{id}", handlers.DeleteDocument(pool))
		r.Get("/api/documents/{id}/download", handlers.DownloadDocument(pool))
		r.Get("/api/documents/{id}/preview", handlers.PreviewDocument(pool))
		r.Post("/api/documents/{id}/extract-property", handlers.ProxyExtractProperty(pool, cfg))
		r.Get("/api/documents/{id}/chunks", handlers.GetDocumentChunks(pool))
		r.Get("/api/documents/{id}/chunks/{chunkId}", handlers.GetDocumentChunk(pool))

		// Gmail
		r.Post("/api/gmail/auth/init", handlers.GmailAuthInit(cfg))
		r.Get("/api/gmail/status", handlers.GmailStatus(pool))
		r.Delete("/api/gmail/disconnect", handlers.GmailDisconnect(pool))
		r.Post("/api/gmail/sync", handlers.GmailSync(pool, cfg))
		r.Get("/api/gmail/emails", handlers.ListEmails(pool))
		r.Get("/api/gmail/emails/{id}", handlers.GetEmail(pool))
		r.Post("/api/gmail/send", handlers.SendEmail(pool, cfg))
		r.Post("/api/gmail/forward", handlers.ForwardEmail(pool, cfg))
		r.Patch("/api/gmail/emails/{id}/read", handlers.MarkEmailRead(pool, cfg))

		// Lead suggestions
		r.Get("/api/lead-suggestions", handlers.ListLeadSuggestions(pool))
		r.Post("/api/lead-suggestions/{id}/accept", handlers.AcceptLeadSuggestion(pool))
		r.Post("/api/lead-suggestions/{id}/dismiss", handlers.DismissLeadSuggestion(pool))
	})

	// -------------------------------------------------------------------------
	// Background workers
	// -------------------------------------------------------------------------
	// Wire up sync callback so HTTP-triggered syncs also process emails
	handlers.SyncCallback = background.ProcessNewEmails

	bgCtx, bgCancel := context.WithCancel(context.Background())
	defer bgCancel()
	go background.StartEmailSyncLoop(bgCtx, pool, cfg)

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

	// Stop background workers
	bgCancel()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown failed: %w", err)
	}

	slog.Info("server shutdown complete")
	return nil
}
