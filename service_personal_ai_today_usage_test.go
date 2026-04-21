package main

import (
	"testing"
	"time"

	"openreport/internal/db"
)

func TestBuildPersonalAIUsageTodayUsage_HalfHourBucketsAndProviderSeries(t *testing.T) {
	app := setupAIUsageTestApp(t)

	user, err := app.database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("GetOrCreateDefaultUser failed: %v", err)
	}
	if err := app.database.SaveTeamProfile(user.ID, &db.TeamProfile{
		TeamType:    "personal",
		TeamName:    "개인",
		UserName:    "tester",
		MemberCount: 1,
		SetupDone:   true,
	}); err != nil {
		t.Fatalf("SaveTeamProfile failed: %v", err)
	}
	if err := app.database.SaveAIFXRate(&db.AIFXRate{
		Day:       "2026-04-21",
		Base:      "USD",
		Quote:     "KRW",
		Rate:      1400,
		Source:    "unit-test",
		FetchedAt: "2026-04-21T00:00:00+09:00",
	}); err != nil {
		t.Fatalf("SaveAIFXRate failed: %v", err)
	}

	events := []db.AIUsageHistoryEvent{
		{
			OccurredAt:        "2026-04-21T00:10:00+09:00",
			Day:               "2026-04-21",
			UserID:            user.ID,
			RawProvider:       "openai",
			RawModel:          "gpt-5.4",
			Feature:           "external_codex_local",
			MetadataJSON:      `{"collector":"local_file_scan","granularity":"half_hour_v2"}`,
			RequestCount:      2,
			InputTokens:       100,
			OutputTokens:      20,
			CacheReadTokens:   5,
			CacheCreateTokens: 0,
			PaygCostUSD:       0.5,
		},
		{
			OccurredAt:   "2026-04-21T12:40:00+09:00",
			Day:          "2026-04-21",
			UserID:       user.ID,
			RawProvider:  "anthropic",
			RawModel:     "claude-sonnet-4-6",
			Feature:      "external_claude_code_local",
			RequestCount: 1,
			InputTokens:  50,
			OutputTokens: 10,
			PaygCostUSD:  0.2,
		},
		{
			OccurredAt:   "2026-04-21T23:40:00+09:00",
			Day:          "2026-04-21",
			UserID:       user.ID,
			RawProvider:  "minimax",
			RawModel:     "MiniMax-M2.7",
			Feature:      featureExternalMiniMaxTokenPlanAPI,
			RequestCount: 1,
			InputTokens:  20,
			OutputTokens: 5,
			PaygCostUSD:  0.1,
		},
		{
			OccurredAt:   "2026-04-21T12:00:00+09:00",
			Day:          "2026-04-21",
			UserID:       user.ID,
			RawProvider:  "openai",
			RawModel:     "gpt-5.4",
			Feature:      "external_codex_local",
			MetadataJSON: `{"collector":"local_file_scan"}`,
			RequestCount: 99,
			InputTokens:  999999,
			OutputTokens: 99999,
			PaygCostUSD:  9.9,
		},
	}
	for _, event := range events {
		event := event
		if err := app.database.AppendAIUsageHistoryEvent(&event); err != nil {
			t.Fatalf("AppendAIUsageHistoryEvent failed: %v", err)
		}
	}

	now := time.Date(2026, 4, 21, 16, 0, 0, 0, usageKSTLocation)
	today, err := app.buildPersonalAIUsageTodayUsage(user.ID, now)
	if err != nil {
		t.Fatalf("buildPersonalAIUsageTodayUsage failed: %v", err)
	}

	if today.Day != "2026-04-21" {
		t.Fatalf("expected day 2026-04-21, got %s", today.Day)
	}
	if len(today.Buckets) != 48 {
		t.Fatalf("expected 48 half-hour buckets, got %d", len(today.Buckets))
	}
	if today.Buckets[0].TotalTokens != 120 {
		t.Fatalf("expected first bucket total tokens 120, got %d", today.Buckets[0].TotalTokens)
	}
	if today.Buckets[25].TotalTokens != 60 {
		t.Fatalf("expected 12:30 bucket total tokens 60, got %d", today.Buckets[25].TotalTokens)
	}
	if today.Buckets[47].TotalTokens != 25 {
		t.Fatalf("expected 23:30 bucket total tokens 25, got %d", today.Buckets[47].TotalTokens)
	}

	if len(today.ByProvider) != 3 {
		t.Fatalf("expected 3 providers, got %d", len(today.ByProvider))
	}
	if today.ByProvider[0].ProviderCode != "openai" {
		t.Fatalf("expected top provider openai, got %s", today.ByProvider[0].ProviderCode)
	}
	if today.ByProvider[0].TotalTokens != 120 {
		t.Fatalf("expected openai total tokens 120, got %d", today.ByProvider[0].TotalTokens)
	}
	if today.ByProvider[0].Buckets[0].TotalTokens != 120 {
		t.Fatalf("expected openai first bucket total tokens 120, got %d", today.ByProvider[0].Buckets[0].TotalTokens)
	}
	if today.ByProvider[0].Buckets[25].TotalTokens != 0 {
		t.Fatalf("expected openai 12:30 bucket total tokens 0, got %d", today.ByProvider[0].Buckets[25].TotalTokens)
	}

	if len(today.ByModel) != 3 {
		t.Fatalf("expected 3 models, got %d", len(today.ByModel))
	}
	if today.ByModel[0].ProviderCode != "openai" || today.ByModel[0].ModelCode != "gpt-5.4" {
		t.Fatalf("expected top model openai/gpt-5.4, got %s/%s", today.ByModel[0].ProviderCode, today.ByModel[0].ModelCode)
	}
	if today.ByModel[0].ModelName != "gpt-5.4" {
		t.Fatalf("expected model name gpt-5.4, got %s", today.ByModel[0].ModelName)
	}
	if today.ByModel[0].Buckets[0].TotalTokens != 120 {
		t.Fatalf("expected gpt-5.4 first bucket total tokens 120, got %d", today.ByModel[0].Buckets[0].TotalTokens)
	}
}

func TestPersonalAIUsage_DashboardAndTodayShareSameTokenBasis(t *testing.T) {
	app := setupAIUsageTestApp(t)

	user, err := app.database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("GetOrCreateDefaultUser failed: %v", err)
	}
	if err := app.database.SaveTeamProfile(user.ID, &db.TeamProfile{
		TeamType:    "personal",
		TeamName:    "개인",
		UserName:    "tester",
		MemberCount: 1,
		SetupDone:   true,
	}); err != nil {
		t.Fatalf("SaveTeamProfile failed: %v", err)
	}
	if err := app.database.SaveAIFXRate(&db.AIFXRate{
		Day:       "2026-04-21",
		Base:      "USD",
		Quote:     "KRW",
		Rate:      1400,
		Source:    "unit-test",
		FetchedAt: "2026-04-21T00:00:00+09:00",
	}); err != nil {
		t.Fatalf("SaveAIFXRate failed: %v", err)
	}

	events := []db.AIUsageHistoryEvent{
		{
			OccurredAt:   "2026-04-21T09:10:00+09:00",
			Day:          "2026-04-21",
			UserID:       user.ID,
			RawProvider:  "openai",
			RawModel:     "gpt-5.4",
			Feature:      "external_codex_local",
			RequestCount: 2,
			InputTokens:  1000,
			OutputTokens: 200,
			PaygCostUSD:  0.3,
		},
		{
			OccurredAt:   "2026-04-21T10:40:00+09:00",
			Day:          "2026-04-21",
			UserID:       user.ID,
			RawProvider:  "anthropic",
			RawModel:     "claude-sonnet-4-6",
			Feature:      "external_claude_code_local",
			RequestCount: 1,
			InputTokens:  50,
			OutputTokens: 10,
			PaygCostUSD:  0.1,
		},
		{
			// legacy local daily event without granularity should be excluded on both tabs.
			OccurredAt:   "2026-04-21T12:00:00+09:00",
			Day:          "2026-04-21",
			UserID:       user.ID,
			RawProvider:  "openai",
			RawModel:     "gpt-5.4",
			Feature:      "external_codex_local",
			MetadataJSON: `{"collector":"local_file_scan"}`,
			RequestCount: 99,
			InputTokens:  999999,
			OutputTokens: 99999,
			PaygCostUSD:  9.9,
		},
	}
	for _, event := range events {
		event := event
		if err := app.database.AppendAIUsageHistoryEvent(&event); err != nil {
			t.Fatalf("AppendAIUsageHistoryEvent failed: %v", err)
		}
	}

	today, err := app.buildPersonalAIUsageTodayUsage(user.ID, time.Date(2026, 4, 21, 15, 0, 0, 0, usageKSTLocation))
	if err != nil {
		t.Fatalf("buildPersonalAIUsageTodayUsage failed: %v", err)
	}
	dashboard, err := app.buildPersonalAIUsageDashboard(user.ID, "2026-04")
	if err != nil {
		t.Fatalf("buildPersonalAIUsageDashboard failed: %v", err)
	}

	var todayTokenTotal int64
	for _, bucket := range today.Buckets {
		todayTokenTotal += bucket.TotalTokens
	}
	var dashboardDayTokenTotal int64
	for _, day := range dashboard.Daily {
		if day.Day == "2026-04-21" {
			dashboardDayTokenTotal = day.InputTokens + day.OutputTokens
			break
		}
	}

	if todayTokenTotal != dashboardDayTokenTotal {
		t.Fatalf("expected same token basis across tabs, today=%d dashboard=%d", todayTokenTotal, dashboardDayTokenTotal)
	}
}
