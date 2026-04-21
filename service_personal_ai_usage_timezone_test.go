package main

import (
	"openreport/internal/db"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func kstLocationForTest() *time.Location {
	return time.FixedZone("KST", 9*60*60)
}

func TestExtractUsageEventFromNode_UsesKSTDayBucket(t *testing.T) {
	node := map[string]any{
		"input_tokens":  float64(120),
		"output_tokens": float64(80),
		"provider":      "openai",
		"model":         "gpt-4.1",
		"timestamp":     "2026-04-20T16:30:00Z", // 2026-04-21 01:30 KST
	}

	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
	fallbackDay := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)

	event, ok := extractUsageEventFromNode(node, fallbackDay, "openai", monthStart, monthEnd)
	if !ok {
		t.Fatalf("expected event to be parsed")
	}
	if event.day != "2026-04-21" {
		t.Fatalf("expected KST day bucket 2026-04-21, got %s", event.day)
	}
}

func TestParseAnyTime_NoTimezoneString_AssumesKST(t *testing.T) {
	parsed, ok := parseAnyTime("2026-04-20 23:30:00")
	if !ok {
		t.Fatalf("expected parseAnyTime to parse timestamp without timezone")
	}
	day := usageDayString(parsed)
	if day != "2026-04-20" {
		t.Fatalf("expected day 2026-04-20 in KST, got %s", day)
	}
}

func TestExtractUsageEventFromNode_CodexTokenCountUsesLastUsage(t *testing.T) {
	node := map[string]any{
		"timestamp": "2026-04-14T04:09:45.118Z",
		"type":      "event_msg",
		"payload": map[string]any{
			"type": "token_count",
			"info": map[string]any{
				"total_token_usage": map[string]any{
					"input_tokens":  float64(100026503),
					"output_tokens": float64(428830),
				},
				"last_token_usage": map[string]any{
					"input_tokens":  float64(97631),
					"output_tokens": float64(555),
				},
				"model": "gpt-5.3-codex",
			},
		},
	}
	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
	fallbackDay := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)

	event, ok := extractUsageEventFromNode(node, fallbackDay, "codex", monthStart, monthEnd)
	if !ok {
		t.Fatalf("expected token_count event to be parsed")
	}
	if event.inputTokens != 97631 || event.outputTokens != 555 {
		t.Fatalf("expected last_token_usage (97631/555), got %d/%d", event.inputTokens, event.outputTokens)
	}
	if event.modelCode != "gpt-5.3-codex" {
		t.Fatalf("expected model from payload.info.model, got %q", event.modelCode)
	}
}

func TestCollectUsageEventsFromTree_DoesNotDoubleCountNestedTokenUsage(t *testing.T) {
	node := map[string]any{
		"timestamp": "2026-04-14T04:09:45.118Z",
		"type":      "event_msg",
		"payload": map[string]any{
			"type": "token_count",
			"info": map[string]any{
				"total_token_usage": map[string]any{
					"input_tokens":  float64(100026503),
					"output_tokens": float64(428830),
				},
				"last_token_usage": map[string]any{
					"input_tokens":  float64(97631),
					"output_tokens": float64(555),
				},
			},
		},
	}

	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
	fallbackDay := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)

	events := make([]parsedUsageEvent, 0)
	collectUsageEventsFromTree(node, fallbackDay, "codex", monthStart, monthEnd, &events)
	if len(events) != 1 {
		t.Fatalf("expected exactly 1 event from a single token_count payload, got %d", len(events))
	}
}

func TestMonthDayKeys_IncludesAllDaysInRange(t *testing.T) {
	kst := kstLocationForTest()
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	end := time.Date(2026, 4, 30, 23, 59, 59, 0, kst)

	keys := monthDayKeys(start, end)
	if len(keys) != 30 {
		t.Fatalf("expected 30 day keys, got %d", len(keys))
	}
	if keys[0] != "2026-04-01" || keys[len(keys)-1] != "2026-04-30" {
		t.Fatalf("unexpected range: first=%s last=%s", keys[0], keys[len(keys)-1])
	}
}

func TestEnsureDailyPointsForDays_FillsZeroDays(t *testing.T) {
	daily := map[string]*db.AIUsageDailyPoint{
		"2026-04-02": {
			Day:         "2026-04-02",
			InputTokens: 10,
		},
	}
	dayKeys := []string{"2026-04-01", "2026-04-02", "2026-04-03"}

	ensureDailyPointsForDays(daily, dayKeys)

	if len(daily) != 3 {
		t.Fatalf("expected 3 daily rows, got %d", len(daily))
	}
	if daily["2026-04-01"] == nil || daily["2026-04-03"] == nil {
		t.Fatalf("expected missing days to be filled")
	}
	if daily["2026-04-02"].InputTokens != 10 {
		t.Fatalf("expected existing day data to be preserved")
	}
	if daily["2026-04-01"].InputTokens != 0 || daily["2026-04-03"].OutputTokens != 0 {
		t.Fatalf("expected filled day values to be zero")
	}
}

func TestEnsureSeriesDaysForMonth_FillsZeroDays(t *testing.T) {
	aggregates := map[string]*personalSeriesAggregate{
		"codex": {
			daily: map[string]*db.AIUsageDailySeriesPoint{
				"2026-04-02": {
					Day:         "2026-04-02",
					InputTokens: 20,
				},
			},
		},
	}
	dayKeys := []string{"2026-04-01", "2026-04-02", "2026-04-03"}

	ensureSeriesDaysForMonth(aggregates, dayKeys)

	daily := aggregates["codex"].daily
	if len(daily) != 3 {
		t.Fatalf("expected 3 daily series points, got %d", len(daily))
	}
	if daily["2026-04-01"] == nil || daily["2026-04-03"] == nil {
		t.Fatalf("expected missing series days to be filled")
	}
	if daily["2026-04-02"].InputTokens != 20 {
		t.Fatalf("expected existing series data to be preserved")
	}
	if daily["2026-04-01"].InputTokens != 0 || daily["2026-04-03"].OutputTokens != 0 {
		t.Fatalf("expected filled series day values to be zero")
	}
}

func TestExtractTokenCountUsageEventWithFallback_UsesFallbackModel(t *testing.T) {
	node := map[string]any{
		"timestamp": "2026-04-14T04:09:45.118Z",
		"type":      "event_msg",
		"payload": map[string]any{
			"type": "token_count",
			"info": map[string]any{
				"last_token_usage": map[string]any{
					"input_tokens":  float64(100),
					"output_tokens": float64(10),
				},
			},
		},
	}
	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
	fallbackDay := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)

	event, ok := extractTokenCountUsageEventWithFallback(node, fallbackDay, "codex", monthStart, monthEnd, "gpt-5.3-codex")
	if !ok {
		t.Fatalf("expected token_count event to be parsed")
	}
	if event.modelCode != "gpt-5.3-codex" {
		t.Fatalf("expected fallback model to be used, got %q", event.modelCode)
	}
}

func TestParseUsageEventsFromFile_UsesRecentModelHintForTokenCount(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sample.jsonl")

	lines := []string{
		`{"timestamp":"2026-04-14T03:59:00Z","type":"meta","payload":{"model":"gpt-5.3-codex"}}`,
		`{"timestamp":"2026-04-14T04:09:45.118Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":123,"output_tokens":7}}}}`,
	}
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatalf("failed to write temp jsonl: %v", err)
	}

	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
	events, err := parseUsageEventsFromFile(path, "codex", monthStart, monthEnd)
	if err != nil {
		t.Fatalf("parseUsageEventsFromFile failed: %v", err)
	}

	if len(events) != 1 {
		t.Fatalf("expected 1 token event, got %d", len(events))
	}
	if events[0].modelCode != "gpt-5.3-codex" {
		t.Fatalf("expected inferred model gpt-5.3-codex, got %q", events[0].modelCode)
	}
}

func TestHalfHourStartInKST_RoundsDown(t *testing.T) {
	input := time.Date(2026, 4, 21, 8, 8, 59, 0, usageKSTLocation)
	got := halfHourStartInKST(input)
	want := time.Date(2026, 4, 21, 8, 0, 0, 0, usageKSTLocation)
	if !got.Equal(want) {
		t.Fatalf("expected half-hour bucket start %s, got %s", want.Format(time.RFC3339), got.Format(time.RFC3339))
	}

	input = time.Date(2026, 4, 21, 8, 44, 0, 0, usageKSTLocation)
	got = halfHourStartInKST(input)
	want = time.Date(2026, 4, 21, 8, 30, 0, 0, usageKSTLocation)
	if !got.Equal(want) {
		t.Fatalf("expected half-hour bucket start %s, got %s", want.Format(time.RFC3339), got.Format(time.RFC3339))
	}
}
