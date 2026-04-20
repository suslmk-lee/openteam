package main

import (
	"path/filepath"
	"testing"
	"time"

	"openreport/internal/db"
)

func setupAIUsageTestApp(t *testing.T) *App {
	t.Helper()

	dataDir := t.TempDir()
	database, err := db.New(filepath.Join(dataDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to initialize test db: %v", err)
	}
	t.Cleanup(func() {
		_ = database.Close()
	})

	return &App{database: database}
}

func TestCanonicalAIProviderDisplayName_MiniMax(t *testing.T) {
	got := canonicalAIProviderDisplayName("minimax", "minimax")
	if got != "MiniMax" {
		t.Fatalf("expected MiniMax display name, got %q", got)
	}
}

func TestTrackAIUsage_AutoRegistersMiniMaxProviderAndModel(t *testing.T) {
	app := setupAIUsageTestApp(t)

	occurredAt := time.Date(2026, 4, 20, 12, 0, 0, 0, usageKSTLocation)
	if err := app.trackAIUsage(aiUsageEvent{
		ProviderCode: "minimax",
		ModelCode:    "MiniMax-M2.7",
		Feature:      "chat",
		RequestCount: 1,
		InputTokens:  120,
		OutputTokens: 30,
		OccurredAt:   occurredAt,
	}); err != nil {
		t.Fatalf("trackAIUsage failed: %v", err)
	}

	user, err := app.database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("GetOrCreateDefaultUser failed: %v", err)
	}

	provider, err := app.database.FindAIProviderByCode(user.ID, "minimax")
	if err != nil {
		t.Fatalf("FindAIProviderByCode failed: %v", err)
	}
	if provider == nil {
		t.Fatalf("expected minimax provider to be auto-registered")
	}
	if provider.DisplayName != "MiniMax" {
		t.Fatalf("expected provider display name MiniMax, got %q", provider.DisplayName)
	}

	model, err := app.database.FindAIModelByCode(user.ID, provider.ID, "MiniMax-M2.7")
	if err != nil {
		t.Fatalf("FindAIModelByCode failed: %v", err)
	}
	if model == nil {
		t.Fatalf("expected MiniMax model to be auto-registered")
	}

	rows, err := app.database.ListAIUsageDailyByMonth(user.ID, "2026-04")
	if err != nil {
		t.Fatalf("ListAIUsageDailyByMonth failed: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 usage row, got %d", len(rows))
	}
	if rows[0].ProviderID <= 0 {
		t.Fatalf("expected usage row to reference provider_id, got %d", rows[0].ProviderID)
	}
	if rows[0].ModelID <= 0 {
		t.Fatalf("expected usage row to reference model_id, got %d", rows[0].ModelID)
	}
	if rows[0].RawProvider != "" || rows[0].RawModel != "" {
		t.Fatalf("expected raw provider/model fields to be empty, got provider=%q model=%q", rows[0].RawProvider, rows[0].RawModel)
	}

	historyRows, err := app.database.ListAIUsageHistoryEventsByMonth(user.ID, "2026-04", 100)
	if err != nil {
		t.Fatalf("ListAIUsageHistoryEventsByMonth failed: %v", err)
	}
	if len(historyRows) != 1 {
		t.Fatalf("expected 1 history row, got %d", len(historyRows))
	}
	if historyRows[0].ProviderID <= 0 || historyRows[0].ModelID <= 0 {
		t.Fatalf("expected history row to keep provider/model ids, got provider=%d model=%d", historyRows[0].ProviderID, historyRows[0].ModelID)
	}
	if historyRows[0].RawProvider != "minimax" || historyRows[0].RawModel != "MiniMax-M2.7" {
		t.Fatalf("expected history raw provider/model to be minimax/MiniMax-M2.7, got %q/%q", historyRows[0].RawProvider, historyRows[0].RawModel)
	}
	if historyRows[0].RequestCount != 1 || historyRows[0].InputTokens != 120 || historyRows[0].OutputTokens != 30 {
		t.Fatalf(
			"expected history usage 1/120/30, got %d/%d/%d",
			historyRows[0].RequestCount,
			historyRows[0].InputTokens,
			historyRows[0].OutputTokens,
		)
	}
}
