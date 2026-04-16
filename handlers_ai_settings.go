package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"openreport/internal/ai"
	"openreport/internal/db"
)

const aiIntegrationType = "ai"

type legacyOpenAIIntegrationConfig struct {
	APIKey  string `json:"apiKey"`
	Model   string `json:"model"`
	BaseURL string `json:"baseUrl"`
}

func (a *App) GetAISettings() (ai.Settings, error) {
	return a.loadOrMigrateAISettings()
}

func (a *App) SaveAISettings(input ai.Settings) error {
	normalized := ai.NormalizeSettings(input)
	payload, err := json.Marshal(normalized)
	if err != nil {
		return fmt.Errorf("failed to marshal ai settings: %w", err)
	}
	return a.SaveIntegration(aiIntegrationType, string(payload), true)
}

func (a *App) loadOrMigrateAISettings() (ai.Settings, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return ai.Settings{}, err
	}

	current, err := a.database.GetIntegrationByType(user.ID, aiIntegrationType)
	if err != nil {
		return ai.Settings{}, err
	}
	if current != nil && strings.TrimSpace(current.ConfigJSON) != "" {
		var parsed ai.Settings
		if unmarshalErr := json.Unmarshal([]byte(current.ConfigJSON), &parsed); unmarshalErr != nil {
			log.Printf("[ai settings] invalid ai integration JSON, fallback to legacy/default: %v", unmarshalErr)
		} else {
			return ai.NormalizeSettings(parsed), nil
		}
	}

	legacy, err := a.database.GetIntegrationByType(user.ID, "openai")
	if err != nil {
		return ai.Settings{}, err
	}
	if legacy == nil {
		return ai.DefaultSettings(), nil
	}

	settings, err := migrateLegacyOpenAISettings(legacy)
	if err != nil {
		return ai.Settings{}, err
	}
	if err := a.SaveAISettings(settings); err != nil {
		return ai.Settings{}, err
	}
	return settings, nil
}

func migrateLegacyOpenAISettings(legacy *db.Integration) (ai.Settings, error) {
	var cfg legacyOpenAIIntegrationConfig
	if err := json.Unmarshal([]byte(legacy.ConfigJSON), &cfg); err != nil {
		return ai.Settings{}, fmt.Errorf("invalid openai config json: %w", err)
	}

	settings := ai.DefaultSettings()
	settings.DefaultProvider = ai.ProviderOpenAI

	openaiCfg := settings.Providers[ai.ProviderOpenAI]
	openaiCfg.Enabled = legacy.Enabled
	openaiCfg.APIKey = strings.TrimSpace(cfg.APIKey)
	if model := strings.TrimSpace(cfg.Model); model != "" {
		openaiCfg.Model = model
	}
	if baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/"); baseURL != "" {
		openaiCfg.BaseURL = baseURL
	}
	openaiCfg.Mode = ai.ModeOpenAICompatible
	settings.Providers[ai.ProviderOpenAI] = openaiCfg

	return ai.NormalizeSettings(settings), nil
}
