package main

import (
	"testing"
	"time"
)

func TestNormalizePersonalAIAutoCollectIntervalSeconds(t *testing.T) {
	tests := []struct {
		name  string
		input int
		want  int
	}{
		{name: "zero uses default", input: 0, want: defaultPersonalAIAutoCollectIntervalSeconds},
		{name: "negative uses default", input: -10, want: defaultPersonalAIAutoCollectIntervalSeconds},
		{name: "below minimum clamps", input: minPersonalAIAutoCollectIntervalSeconds - 5, want: minPersonalAIAutoCollectIntervalSeconds},
		{name: "within range", input: 90, want: 90},
		{name: "above maximum clamps", input: maxPersonalAIAutoCollectIntervalSeconds + 999, want: maxPersonalAIAutoCollectIntervalSeconds},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := normalizePersonalAIAutoCollectIntervalSeconds(tc.input)
			if got != tc.want {
				t.Fatalf("normalizePersonalAIAutoCollectIntervalSeconds(%d) = %d, want %d", tc.input, got, tc.want)
			}
		})
	}
}

func TestPersonalAIAutoCollectTargetMonth_UsesKST(t *testing.T) {
	utc := time.Date(2026, 3, 31, 15, 30, 0, 0, time.UTC) // 2026-04-01 00:30 KST
	if got := personalAIAutoCollectTargetMonth(utc); got != "2026-04" {
		t.Fatalf("expected KST month 2026-04, got %s", got)
	}
}

func TestParsePersonalAIAutoCollectConfig_UsesDefaultsOnInvalidJSON(t *testing.T) {
	cfg := parsePersonalAIAutoCollectConfig("{invalid")
	if cfg.IntervalSeconds != defaultPersonalAIAutoCollectIntervalSeconds {
		t.Fatalf("expected default interval %d, got %d", defaultPersonalAIAutoCollectIntervalSeconds, cfg.IntervalSeconds)
	}
}

func TestParsePersonalAIAutoCollectConfig_NormalizesInterval(t *testing.T) {
	cfg := parsePersonalAIAutoCollectConfig(`{"intervalSeconds": 5}`)
	if cfg.IntervalSeconds != minPersonalAIAutoCollectIntervalSeconds {
		t.Fatalf("expected min interval %d, got %d", minPersonalAIAutoCollectIntervalSeconds, cfg.IntervalSeconds)
	}
}
