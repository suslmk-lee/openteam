package main

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"openreport/internal/ai"
	"openreport/internal/db"
)

func setupAISettingsTestApp(t *testing.T) *App {
	t.Helper()

	dataDir := t.TempDir()
	database, err := db.New(filepath.Join(dataDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to initialize test db: %v", err)
	}
	t.Cleanup(func() {
		_ = database.Close()
	})

	return &App{
		database: database,
		dataDir:  dataDir,
	}
}

func TestGetAISettingsMigratesLegacyOpenAIIntegration(t *testing.T) {
	app := setupAISettingsTestApp(t)
	user, err := app.database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("failed to get default user: %v", err)
	}

	legacyConfigJSON, err := json.Marshal(map[string]string{
		"apiKey": "legacy-key",
		"model":  "gpt-4o-mini",
	})
	if err != nil {
		t.Fatalf("failed to marshal legacy config: %v", err)
	}

	if _, err := app.database.SaveIntegration(&db.Integration{
		UserID:     user.ID,
		ToolType:   "openai",
		ConfigJSON: string(legacyConfigJSON),
		Enabled:    true,
	}); err != nil {
		t.Fatalf("failed to save legacy integration: %v", err)
	}

	got, err := app.GetAISettings()
	if err != nil {
		t.Fatalf("GetAISettings failed: %v", err)
	}
	if got.DefaultProvider != ai.ProviderOpenAI {
		t.Fatalf("expected default provider %q, got %q", ai.ProviderOpenAI, got.DefaultProvider)
	}

	openaiCfg := got.Providers[ai.ProviderOpenAI]
	if openaiCfg.APIKey != "legacy-key" {
		t.Fatalf("expected migrated api key 'legacy-key', got %q", openaiCfg.APIKey)
	}
	if openaiCfg.Model != "gpt-4o-mini" {
		t.Fatalf("expected migrated model gpt-4o-mini, got %q", openaiCfg.Model)
	}

	migrated, err := app.database.GetIntegrationByType(user.ID, "ai")
	if err != nil {
		t.Fatalf("failed to load migrated ai integration: %v", err)
	}
	if migrated == nil {
		t.Fatalf("expected ai integration to be created after migration")
	}
}

func TestSaveAISettingsPersistsNormalizedConfig(t *testing.T) {
	app := setupAISettingsTestApp(t)

	input := ai.Settings{
		DefaultProvider: ai.ProviderMiniMax,
		Policy: ai.PolicyConfig{
			ChatAllowOverride: false,
		},
		Providers: map[string]ai.ProviderConfig{
			ai.ProviderOpenAI: {
				Enabled: true,
				APIKey:  "openai-key",
				Model:   "gpt-4.1-mini",
				BaseURL: "https://api.openai.com/v1/",
				Mode:    ai.ModeOpenAICompatible,
			},
			ai.ProviderMiniMax: {
				Enabled: true,
				APIKey:  "mm-key",
				Model:   "MiniMax-Text-01",
				BaseURL: "https://api.minimax.chat/v1/",
				Mode:    ai.ModeOpenAICompatible,
			},
		},
	}

	if err := app.SaveAISettings(input); err != nil {
		t.Fatalf("SaveAISettings failed: %v", err)
	}

	got, err := app.GetAISettings()
	if err != nil {
		t.Fatalf("GetAISettings failed: %v", err)
	}
	if got.DefaultProvider != ai.ProviderMiniMax {
		t.Fatalf("expected default provider minimax, got %q", got.DefaultProvider)
	}
	if got.Policy.ChatAllowOverride {
		t.Fatalf("expected chat override policy to persist false")
	}

	mm := got.Providers[ai.ProviderMiniMax]
	if mm.APIKey != "mm-key" {
		t.Fatalf("expected minimax api key mm-key, got %q", mm.APIKey)
	}
	if mm.BaseURL != "https://api.minimax.chat/v1" {
		t.Fatalf("expected trimmed minimax base url, got %q", mm.BaseURL)
	}
}

