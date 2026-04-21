package main

import (
	"testing"

	"openreport/internal/ai"
)

func TestBuildChatOverrideFromInputs(t *testing.T) {
	override := buildChatOverride(" minimax ", " MiniMax-Chat-01 ")
	if override.Provider != ai.ProviderMiniMax {
		t.Fatalf("expected provider minimax, got %q", override.Provider)
	}
	if override.Model != "MiniMax-Chat-01" {
		t.Fatalf("expected model MiniMax-Chat-01, got %q", override.Model)
	}
}

