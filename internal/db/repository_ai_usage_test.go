package db

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestIncrementAIUsageDaily_LegacyNullableSchemaStillMergesSameKey(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy-usage.db")
	conn, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer conn.Close()

	schema := []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`,
		`INSERT INTO users(id, name) VALUES (1, 'default')`,
		`CREATE TABLE ai_providers (id INTEGER PRIMARY KEY, code TEXT)`,
		`CREATE TABLE ai_models (id INTEGER PRIMARY KEY, provider_id INTEGER, model_code TEXT)`,
		`CREATE TABLE ai_usage_daily (
			day DATE NOT NULL,
			user_id INTEGER NOT NULL REFERENCES users(id),
			provider_id INTEGER REFERENCES ai_providers(id),
			model_id INTEGER REFERENCES ai_models(id),
			raw_provider TEXT NOT NULL DEFAULT '',
			raw_model TEXT NOT NULL DEFAULT '',
			feature TEXT NOT NULL DEFAULT 'unknown',
			request_count INTEGER NOT NULL DEFAULT 0,
			input_tokens INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			cache_read_tokens INTEGER NOT NULL DEFAULT 0,
			cache_create_tokens INTEGER NOT NULL DEFAULT 0,
			payg_cost_usd REAL NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(day, user_id, provider_id, model_id, raw_provider, raw_model, feature)
		)`,
	}
	for _, stmt := range schema {
		if _, err := conn.Exec(stmt); err != nil {
			t.Fatalf("failed to execute schema statement %q: %v", stmt, err)
		}
	}

	database := &Database{conn: conn}
	first := &AIUsageDaily{
		Day:          "2026-04-20",
		UserID:       1,
		ProviderID:   0,
		ModelID:      0,
		RawProvider:  "openai",
		RawModel:     "unknown",
		Feature:      "external_codex_local",
		RequestCount: 3,
		InputTokens:  100,
		OutputTokens: 20,
	}
	second := &AIUsageDaily{
		Day:          "2026-04-20",
		UserID:       1,
		ProviderID:   0,
		ModelID:      0,
		RawProvider:  "openai",
		RawModel:     "unknown",
		Feature:      "external_codex_local",
		RequestCount: 2,
		InputTokens:  50,
		OutputTokens: 10,
	}

	if err := database.IncrementAIUsageDaily(first); err != nil {
		t.Fatalf("first increment failed: %v", err)
	}
	if err := database.IncrementAIUsageDaily(second); err != nil {
		t.Fatalf("second increment failed: %v", err)
	}

	rows, err := database.ListAIUsageDailyByMonth(1, "2026-04")
	if err != nil {
		t.Fatalf("list by month failed: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected one merged row in legacy schema, got %d", len(rows))
	}
	if rows[0].RequestCount != 5 {
		t.Fatalf("expected merged request_count 5, got %d", rows[0].RequestCount)
	}
	if rows[0].InputTokens != 150 || rows[0].OutputTokens != 30 {
		t.Fatalf("expected merged tokens 150/30, got %d/%d", rows[0].InputTokens, rows[0].OutputTokens)
	}
}

func TestAppendAIUsageHistoryEvent_AndListByMonth(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "history-usage.db")
	database, err := New(dbPath)
	if err != nil {
		t.Fatalf("failed to initialize db: %v", err)
	}
	defer database.Close()

	user, err := database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("failed to get default user: %v", err)
	}

	occurredAt := time.Date(2026, 4, 20, 12, 30, 0, 0, time.FixedZone("KST", 9*60*60))
	if err := database.AppendAIUsageHistoryEvent(&AIUsageHistoryEvent{
		OccurredAt:   occurredAt.Format(time.RFC3339Nano),
		Day:          "2026-04-20",
		UserID:       user.ID,
		ProviderID:   0,
		ModelID:      0,
		RawProvider:  "openai",
		RawModel:     "gpt-5.4",
		Feature:      "external_codex_local",
		RequestCount: 3,
		InputTokens:  111,
		OutputTokens: 22,
	}); err != nil {
		t.Fatalf("AppendAIUsageHistoryEvent failed: %v", err)
	}

	items, err := database.ListAIUsageHistoryEventsByMonth(user.ID, "2026-04", 100)
	if err != nil {
		t.Fatalf("ListAIUsageHistoryEventsByMonth failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 history row, got %d", len(items))
	}
	if items[0].RawProvider != "openai" || items[0].RawModel != "gpt-5.4" {
		t.Fatalf("unexpected provider/model %q/%q", items[0].RawProvider, items[0].RawModel)
	}
	if items[0].RequestCount != 3 || items[0].InputTokens != 111 || items[0].OutputTokens != 22 {
		t.Fatalf("unexpected usage values %d/%d/%d", items[0].RequestCount, items[0].InputTokens, items[0].OutputTokens)
	}
}

func TestDeleteAIUsageHistoryEventsBefore_RemovesOldRows(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "history-prune.db")
	database, err := New(dbPath)
	if err != nil {
		t.Fatalf("failed to initialize db: %v", err)
	}
	defer database.Close()

	user, err := database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("failed to get default user: %v", err)
	}

	for _, day := range []string{"2025-10-01", "2025-11-01", "2026-04-01"} {
		if err := database.AppendAIUsageHistoryEvent(&AIUsageHistoryEvent{
			OccurredAt:   day + "T12:00:00+09:00",
			Day:          day,
			UserID:       user.ID,
			RawProvider:  "openai",
			RawModel:     "gpt-5",
			Feature:      "chat",
			RequestCount: 1,
		}); err != nil {
			t.Fatalf("AppendAIUsageHistoryEvent(%s) failed: %v", day, err)
		}
	}

	affected, err := database.DeleteAIUsageHistoryEventsBefore(user.ID, "2025-11-01")
	if err != nil {
		t.Fatalf("DeleteAIUsageHistoryEventsBefore failed: %v", err)
	}
	if affected != 1 {
		t.Fatalf("expected 1 row deleted, got %d", affected)
	}

	items, err := database.ListAIUsageHistoryEventsByMonth(user.ID, "2025-10", 100)
	if err != nil {
		t.Fatalf("list 2025-10 failed: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected pruned month to be empty, got %d rows", len(items))
	}

	items, err = database.ListAIUsageHistoryEventsByMonth(user.ID, "2025-11", 100)
	if err != nil {
		t.Fatalf("list 2025-11 failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected retained month rows=1, got %d", len(items))
	}
}
