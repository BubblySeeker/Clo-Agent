package config

import (
	"bufio"
	"fmt"
	"log/slog"
	"os"
	"strings"
)

// loadDotEnv reads a .env file from the given path and sets any variable that
// is not already present in the process environment. Safe to call when the
// file does not exist.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // file not found is fine
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		// Only set if not already in environment (real env vars take precedence).
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

// Config holds all application configuration loaded from environment variables.
type Config struct {
	DatabaseURL        string
	ClerkSecretKey     string
	RedisURL           string
	Port               string
	AIServiceURL       string
	AIServiceSecret    string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI   string
	FrontendURL         string
	WebhookBaseURL      string
	TwilioEncryptionKey string
	EncryptionKey       string
}

// Load reads configuration from environment variables (and a .env file if present)
// and returns a validated Config.
// It returns an error if any required variable is missing.
func Load() (*Config, error) {
	loadDotEnv(".env")

	cfg := &Config{
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		ClerkSecretKey:     os.Getenv("CLERK_SECRET_KEY"),
		RedisURL:           os.Getenv("REDIS_URL"),
		Port:               os.Getenv("PORT"),
		AIServiceURL:       os.Getenv("AI_SERVICE_URL"),
		AIServiceSecret:    os.Getenv("AI_SERVICE_SECRET"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURI:  os.Getenv("GOOGLE_REDIRECT_URI"),
		FrontendURL:         os.Getenv("FRONTEND_URL"),
		WebhookBaseURL:      os.Getenv("WEBHOOK_BASE_URL"),
		TwilioEncryptionKey: os.Getenv("TWILIO_ENCRYPTION_KEY"),
		EncryptionKey:       os.Getenv("ENCRYPTION_KEY"),
	}

	if cfg.AIServiceURL == "" {
		cfg.AIServiceURL = "http://localhost:8000"
	}

	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	if cfg.GoogleRedirectURI == "" {
		cfg.GoogleRedirectURI = "http://localhost:8080/api/auth/google/callback"
	}
	if cfg.FrontendURL == "" {
		cfg.FrontendURL = "http://localhost:3000"
	}

	if cfg.WebhookBaseURL == "" {
		slog.Warn("WEBHOOK_BASE_URL not set — Twilio voice webhooks will not work")
	}

	if cfg.TwilioEncryptionKey == "" {
		slog.Warn("TWILIO_ENCRYPTION_KEY not set — Twilio auth tokens will not be encrypted")
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	if cfg.ClerkSecretKey == "" {
		return nil, fmt.Errorf("CLERK_SECRET_KEY environment variable is required")
	}

	if cfg.AIServiceSecret == "" {
		return nil, fmt.Errorf("AI_SERVICE_SECRET environment variable is required")
	}

	return cfg, nil
}
