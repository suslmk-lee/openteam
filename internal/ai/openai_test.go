package ai

import (
	"strings"
	"testing"
)

func TestNormalizeReportText(t *testing.T) {
	t.Run("returns empty when raw text is blank", func(t *testing.T) {
		got := normalizeReportText("   \r\n\t")
		if got != "" {
			t.Fatalf("expected empty string, got %q", got)
		}
	})

	t.Run("formats a single line into two numbered lines", func(t *testing.T) {
		got := normalizeReportText("single line")
		if !strings.Contains(got, "1)") || !strings.Contains(got, "\n2)") {
			t.Fatalf("expected two numbered lines, got %q", got)
		}
	})

	t.Run("splits inline second sentence", func(t *testing.T) {
		got := normalizeReportText("1) first 2) second")
		if !strings.Contains(got, "\n2)") {
			t.Fatalf("expected inline second sentence to be split, got %q", got)
		}
		if !strings.Contains(got, "second") {
			t.Fatalf("expected second sentence content to remain, got %q", got)
		}
	})

	t.Run("normalizes multiline input", func(t *testing.T) {
		got := normalizeReportText("first\nsecond")
		lines := strings.Split(got, "\n")
		if len(lines) < 2 {
			t.Fatalf("expected at least two lines, got %q", got)
		}
		if !strings.HasPrefix(lines[0], "1)") {
			t.Fatalf("expected first line to start with 1), got %q", lines[0])
		}
		if !strings.HasPrefix(lines[1], "2)") {
			t.Fatalf("expected second line to start with 2), got %q", lines[1])
		}
	})
}

func TestClientChatCompletionsURL(t *testing.T) {
	client := NewClient("k", "m", "https://example.ai/v1/")
	if got := client.chatCompletionsURL(); got != "https://example.ai/v1/chat/completions" {
		t.Fatalf("unexpected chat completions URL: %s", got)
	}
}
