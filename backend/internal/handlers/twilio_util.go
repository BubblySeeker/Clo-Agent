package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"net/url"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
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
