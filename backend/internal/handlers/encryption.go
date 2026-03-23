package handlers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
)

// encryptionKey is set once at startup from config. If empty, encryption is disabled
// and tokens are stored in plaintext (backward compatible).
var encryptionKey []byte

// InitEncryption sets up the AES-256 encryption key from a hex-encoded string.
// Call once at startup. If key is empty, encryption is disabled.
func InitEncryption(hexKey string) {
	if hexKey == "" {
		slog.Warn("ENCRYPTION_KEY not set — Gmail tokens will be stored in plaintext")
		return
	}
	key, err := hex.DecodeString(hexKey)
	if err != nil || len(key) != 32 {
		slog.Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes). Encryption disabled.", "error", err)
		return
	}
	encryptionKey = key
	slog.Info("AES-256-GCM token encryption enabled")
}

// encryptToken encrypts plaintext using AES-256-GCM. Returns hex-encoded ciphertext.
// If encryption is disabled, returns the plaintext unchanged.
func encryptToken(plaintext string) string {
	if encryptionKey == nil || plaintext == "" {
		return plaintext
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		slog.Error("AES cipher creation failed", "error", err)
		return plaintext
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		slog.Error("GCM creation failed", "error", err)
		return plaintext
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		slog.Error("nonce generation failed", "error", err)
		return plaintext
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return "enc:" + hex.EncodeToString(ciphertext)
}

// decryptToken decrypts a hex-encoded AES-256-GCM ciphertext prefixed with "enc:".
// If the value doesn't have the prefix, it's assumed to be plaintext (backward compatible).
func decryptToken(encrypted string) (string, error) {
	if encryptionKey == nil {
		return encrypted, nil
	}

	// Plaintext tokens (stored before encryption was enabled)
	if len(encrypted) < 4 || encrypted[:4] != "enc:" {
		return encrypted, nil
	}

	data, err := hex.DecodeString(encrypted[4:])
	if err != nil {
		return "", errors.New("invalid encrypted token format")
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
