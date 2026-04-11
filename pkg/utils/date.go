package utils

import (
	"fmt"
	"time"
)

// FormatISO formats a time as ISO8601 string.
func FormatISO(t time.Time) string {
	return t.Format(time.RFC3339)
}

// NowInLocation returns current time in specific location.
func NowInLocation(locName string) (time.Time, error) {
	loc, err := time.LoadLocation(locName)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid location: %w", err)
	}
	return time.Now().In(loc), nil
}

// DurationToString converts duration to friendly string.
func DurationToString(d time.Duration) string {
	return d.String()
}

// Epoch returns current unix epoch in seconds.
func Epoch() int64 {
	return time.Now().Unix()
}

// EpochNano returns current unix epoch in nanoseconds.
func EpochNano() int64 {
	return time.Now().UnixNano()
}
