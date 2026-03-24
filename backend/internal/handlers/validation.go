package handlers

import (
	"fmt"
	"regexp"
	"strings"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// validateMaxLen checks that a string field does not exceed max characters.
func validateMaxLen(field, value string, max int) error {
	if len(value) > max {
		return fmt.Errorf("%s must be %d characters or less", field, max)
	}
	return nil
}

// validateEmail checks basic email format if the value is non-empty.
func validateEmail(email string) error {
	if email == "" {
		return nil
	}
	if len(email) > 254 {
		return fmt.Errorf("email must be 254 characters or less")
	}
	if !emailRegex.MatchString(email) {
		return fmt.Errorf("invalid email format")
	}
	return nil
}

// validatePositiveFloat checks that a numeric value is >= 0.
func validatePositiveFloat(field string, value float64) error {
	if value < 0 {
		return fmt.Errorf("%s must be zero or positive", field)
	}
	return nil
}

// validateOneOf checks that a value is in the allowed set (case-insensitive).
func validateOneOf(field, value string, allowed []string) error {
	if value == "" {
		return nil
	}
	lower := strings.ToLower(value)
	for _, a := range allowed {
		if strings.ToLower(a) == lower {
			return nil
		}
	}
	return fmt.Errorf("%s must be one of: %s", field, strings.Join(allowed, ", "))
}
