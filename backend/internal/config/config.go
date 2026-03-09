package config

import (
	"fmt"
	"os"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	DatabaseURL    string
	ClerkSecretKey string
	RedisURL       string
	Port           string
}

// Load reads configuration from environment variables and returns a validated Config.
// It returns an error if any required variable is missing.
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		ClerkSecretKey: os.Getenv("CLERK_SECRET_KEY"),
		RedisURL:       os.Getenv("REDIS_URL"),
		Port:           os.Getenv("PORT"),
	}

	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	if cfg.ClerkSecretKey == "" {
		return nil, fmt.Errorf("CLERK_SECRET_KEY environment variable is required")
	}

	return cfg, nil
}
