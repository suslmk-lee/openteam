package main

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestParseUsageEventsFromFileWithOptions_StartOffsetSkipsOldLines(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "usage.jsonl")

	line1 := `{"timestamp":"2026-04-10T00:00:00Z","provider":"codex","model":"gpt-5","input_tokens":10,"output_tokens":1}`
	line2 := `{"timestamp":"2026-04-10T01:00:00Z","provider":"codex","model":"gpt-5","input_tokens":20,"output_tokens":2}`
	content := line1 + "\n" + line2 + "\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	offset := int64(len(line1 + "\n"))
	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)

	events, err := parseUsageEventsFromFileWithOptions(path, "codex", monthStart, monthEnd, offset, time.Time{})
	if err != nil {
		t.Fatalf("parseUsageEventsFromFileWithOptions failed: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event after offset parse, got %d", len(events))
	}
	if events[0].inputTokens != 20 || events[0].outputTokens != 2 {
		t.Fatalf("expected second event tokens 20/2, got %d/%d", events[0].inputTokens, events[0].outputTokens)
	}
}

func TestParseUsageEventsFromFileWithOptions_NotBeforeFiltersOlderEvents(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "usage.jsonl")

	lines := []string{
		`{"timestamp":"2026-04-10T00:00:00Z","provider":"codex","model":"gpt-5","input_tokens":10,"output_tokens":1}`,
		`{"timestamp":"2026-04-11T00:00:00Z","provider":"codex","model":"gpt-5","input_tokens":30,"output_tokens":3}`,
	}
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
	notBefore := time.Date(2026, 4, 10, 18, 0, 0, 0, time.UTC)

	events, err := parseUsageEventsFromFileWithOptions(path, "codex", monthStart, monthEnd, 0, notBefore)
	if err != nil {
		t.Fatalf("parseUsageEventsFromFileWithOptions failed: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 filtered event, got %d", len(events))
	}
	if events[0].inputTokens != 30 || events[0].outputTokens != 3 {
		t.Fatalf("expected filtered event tokens 30/3, got %d/%d", events[0].inputTokens, events[0].outputTokens)
	}
}

func TestParseUsageEventsFromFileWithOptions_StartOffsetUsesSeedModelHint(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "usage.jsonl")

	lines := []string{
		`{"type":"turn_context","payload":{"model":"gpt-5.4"}}`,
	}
	for i := 0; i < 6000; i++ {
		lines = append(lines, `{"type":"event_msg","payload":{"type":"noise","seq":`+strconv.Itoa(i)+`}}`)
	}
	lines = append(lines, `{"timestamp":"2026-04-20T01:10:00Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":321,"output_tokens":12}}}}`)

	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("failed to stat test file: %v", err)
	}

	offset := info.Size() - 2048
	if offset < 0 {
		offset = 0
	}

	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)

	events, err := parseUsageEventsFromFileWithOptions(path, "openai", monthStart, monthEnd, offset, time.Time{})
	if err != nil {
		t.Fatalf("parseUsageEventsFromFileWithOptions failed: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event in tail parse, got %d", len(events))
	}
	if events[0].modelCode != "gpt-5.4" {
		t.Fatalf("expected seeded model hint gpt-5.4, got %q", events[0].modelCode)
	}
}

func TestParseUsageEventsFromFileWithOptions_LargeLineBasedFileIsNotSkipped(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "large.jsonl")

	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("failed to create file: %v", err)
	}
	defer file.Close()

	firstLine := `{"timestamp":"2026-04-20T01:10:00Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":111,"output_tokens":9},"model":"gpt-5.4"}}}` + "\n"
	if _, err := file.WriteString(firstLine); err != nil {
		t.Fatalf("failed to write first line: %v", err)
	}

	if _, err := file.Seek(17*1024*1024, 0); err != nil {
		t.Fatalf("failed to seek sparse tail: %v", err)
	}
	if _, err := file.WriteString("\n"); err != nil {
		t.Fatalf("failed to write sparse tail newline: %v", err)
	}

	kst := kstLocationForTest()
	monthStart := time.Date(2026, 4, 1, 0, 0, 0, 0, kst)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)

	events, err := parseUsageEventsFromFileWithOptions(path, "openai", monthStart, monthEnd, 0, time.Time{})
	if err != nil {
		t.Fatalf("parseUsageEventsFromFileWithOptions failed: %v", err)
	}
	if len(events) == 0 {
		t.Fatalf("expected at least one parsed event from large line-based file")
	}
}
