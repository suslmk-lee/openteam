package main

import (
	"strings"
	"testing"
)

func TestNormalizeNarrativeContent(t *testing.T) {
	t.Run("blank input returns empty", func(t *testing.T) {
		if got := normalizeNarrativeContent("   \n\t"); got != "" {
			t.Fatalf("expected empty string, got %q", got)
		}
	})

	t.Run("single line expands into structured output", func(t *testing.T) {
		got := normalizeNarrativeContent("project kickoff")
		if !strings.Contains(got, "project kickoff") {
			t.Fatalf("expected original content to be preserved, got %q", got)
		}
		if !strings.Contains(got, "\n") {
			t.Fatalf("expected multiline output, got %q", got)
		}
	})

	t.Run("multi line keeps first line as topic", func(t *testing.T) {
		got := normalizeNarrativeContent("Project A\nProgress update\nNext action")
		lines := strings.Split(got, "\n")
		if len(lines) < 2 {
			t.Fatalf("expected at least two lines, got %q", got)
		}
		if lines[0] != "Project A" {
			t.Fatalf("expected first line to keep topic, got %q", lines[0])
		}
	})
}
