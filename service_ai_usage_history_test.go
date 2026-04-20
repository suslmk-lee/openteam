package main

import (
	"testing"
	"time"

	"openreport/internal/db"
)

func TestEnforceAIUsageHistoryRetention_PrunesOldEvents(t *testing.T) {
	app := setupAIUsageTestApp(t)

	user, err := app.database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("GetOrCreateDefaultUser failed: %v", err)
	}

	seed := []db.AIUsageHistoryEvent{
		{
			OccurredAt:   "2025-09-01T10:00:00+09:00",
			Day:          "2025-09-01",
			UserID:       user.ID,
			RawProvider:  "openai",
			RawModel:     "gpt-5",
			Feature:      "chat",
			RequestCount: 1,
		},
		{
			OccurredAt:   "2025-11-01T10:00:00+09:00",
			Day:          "2025-11-01",
			UserID:       user.ID,
			RawProvider:  "openai",
			RawModel:     "gpt-5",
			Feature:      "chat",
			RequestCount: 1,
		},
	}

	for idx := range seed {
		if err := app.database.AppendAIUsageHistoryEvent(&seed[idx]); err != nil {
			t.Fatalf("AppendAIUsageHistoryEvent(%d) failed: %v", idx, err)
		}
	}

	now := time.Date(2026, 4, 20, 12, 0, 0, 0, usageKSTLocation)
	if err := app.enforceAIUsageHistoryRetention(user.ID, now); err != nil {
		t.Fatalf("enforceAIUsageHistoryRetention failed: %v", err)
	}

	oldRows, err := app.database.ListAIUsageHistoryEventsByMonth(user.ID, "2025-09", 100)
	if err != nil {
		t.Fatalf("ListAIUsageHistoryEventsByMonth old month failed: %v", err)
	}
	if len(oldRows) != 0 {
		t.Fatalf("expected old rows pruned, got %d", len(oldRows))
	}

	keptRows, err := app.database.ListAIUsageHistoryEventsByMonth(user.ID, "2025-11", 100)
	if err != nil {
		t.Fatalf("ListAIUsageHistoryEventsByMonth kept month failed: %v", err)
	}
	if len(keptRows) != 1 {
		t.Fatalf("expected 1 retained row, got %d", len(keptRows))
	}
}
