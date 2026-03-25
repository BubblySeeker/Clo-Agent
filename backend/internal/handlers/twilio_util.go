package handlers

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
)

// normalizePhone strips formatting, returns last 10 digits for comparison.
func normalizePhone(phone string) string {
	digits := ""
	for _, c := range phone {
		if c >= '0' && c <= '9' {
			digits += string(c)
		}
	}
	if len(digits) > 10 {
		return digits[len(digits)-10:]
	}
	return digits
}

// matchContactByPhone looks up a contact by phone number (last 10 digits comparison).
func matchContactByPhone(ctx context.Context, pool *pgxpool.Pool, agentID, phone string) *string {
	normalized := normalizePhone(phone)
	if normalized == "" {
		return nil
	}

	var contactID string
	err := pool.QueryRow(ctx,
		`SELECT id FROM contacts WHERE agent_id = $1 AND phone IS NOT NULL AND phone != ''
		 AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2
		 LIMIT 1`,
		agentID, normalized,
	).Scan(&contactID)
	if err != nil {
		return nil
	}
	return &contactID
}

// buildContactPhoneMap builds a map of normalized phone -> contact_id for batch matching.
func buildContactPhoneMap(ctx context.Context, pool *pgxpool.Pool, agentID string) map[string]string {
	m := map[string]string{}
	rows, err := pool.Query(ctx,
		`SELECT id, phone FROM contacts WHERE agent_id = $1 AND phone IS NOT NULL AND phone != ''`,
		agentID,
	)
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var id, phone string
		rows.Scan(&id, &phone)
		m[normalizePhone(phone)] = id
	}
	return m
}

// matchPhoneInMap finds a contact_id for a phone number from a pre-built map.
func matchPhoneInMap(m map[string]string, phone string) *string {
	normalized := normalizePhone(phone)
	if cid, ok := m[normalized]; ok {
		return &cid
	}
	return nil
}

// validateTwilioSignature validates the X-Twilio-Signature header.
func validateTwilioSignature(authToken, url string, params url.Values, signature string) bool {
	// Sort param keys
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Build data string: URL + sorted key/value pairs
	data := url
	for _, k := range keys {
		data += k + params.Get(k)
	}

	// HMAC-SHA1
	mac := hmac.New(sha1.New, []byte(authToken))
	mac.Write([]byte(data))
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(expected), []byte(signature))
}

// encryptToken encrypts plaintext using AES-256-GCM. The nonce is prepended to the
// ciphertext and the result is hex-encoded.
func encryptTwilioToken(plaintext string, key []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("nonce: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

// decryptToken decrypts a hex-encoded AES-256-GCM ciphertext (nonce prepended).
func decryptTwilioToken(ciphertextHex string, key []byte) (string, error) {
	data, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", fmt.Errorf("hex decode: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm: %w", err)
	}
	if len(data) < gcm.NonceSize() {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ct := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("gcm open: %w", err)
	}
	return string(plaintext), nil
}

// getTwilioConfig fetches and decrypts the Twilio configuration for an agent.
// If TwilioEncryptionKey is set, it attempts to decrypt auth_token. On decrypt
// failure it falls back to treating auth_token as plaintext (backward compat).
func getTwilioConfig(ctx context.Context, pool *pgxpool.Pool, agentID string, cfg *config.Config) (accountSID, authToken, phoneNumber, personalPhone string, err error) {
	err = pool.QueryRow(ctx,
		`SELECT account_sid, auth_token, phone_number, COALESCE(personal_phone, '')
		 FROM twilio_config WHERE agent_id = $1`, agentID,
	).Scan(&accountSID, &authToken, &phoneNumber, &personalPhone)
	if err != nil {
		return "", "", "", "", fmt.Errorf("twilio config not found: %w", err)
	}

	if cfg.TwilioEncryptionKey != "" {
		keyBytes, kerr := hex.DecodeString(cfg.TwilioEncryptionKey)
		if kerr == nil && len(keyBytes) == 32 {
			decrypted, derr := decryptTwilioToken(authToken, keyBytes)
			if derr == nil {
				authToken = decrypted
			} else {
				// Backward compat: treat as plaintext if decrypt fails
				slog.Warn("getTwilioConfig: decrypt failed, treating as plaintext", "agent_id", agentID, "error", derr)
			}
		}
	}

	return accountSID, authToken, phoneNumber, personalPhone, nil
}
