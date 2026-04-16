package main

import (
	"fmt"
	"strings"

	"openreport/internal/ai"
)

type AIChatResult struct {
	Reply    string `json:"reply"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

type openAIIntegrationConfig struct {
	APIKey  string `json:"apiKey"`
	Model   string `json:"model"`
	BaseURL string `json:"baseUrl,omitempty"`
}

func buildChatOverride(provider, model string) ai.ChatOverride {
	return ai.ChatOverride{
		Provider: normalizeChatProviderInput(provider),
		Model:    strings.TrimSpace(model),
	}
}

func normalizeChatProviderInput(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "openai":
		return ai.ProviderOpenAI
	case "minimax":
		return ai.ProviderMiniMax
	case "claude", "claude_cli":
		return ai.ProviderClaudeCLI
	default:
		return ""
	}
}

func (a *App) ChatWithAI(prompt, systemContext, overrideProvider, overrideModel string) (AIChatResult, error) {
	trimmedPrompt := strings.TrimSpace(prompt)
	if trimmedPrompt == "" {
		return AIChatResult{}, fmt.Errorf("prompt is empty")
	}

	settings, err := a.loadOrMigrateAISettings()
	if err != nil {
		return AIChatResult{}, err
	}

	resolved, err := ai.ResolveForFeature(settings, ai.FeatureChat, buildChatOverride(overrideProvider, overrideModel))
	if err != nil {
		return AIChatResult{}, err
	}

	if resolved.Provider == ai.ProviderClaudeCLI {
		result, err := a.ClaudeChatWithSession(trimmedPrompt, systemContext, "")
		if err != nil {
			return AIChatResult{}, err
		}

		model := strings.TrimSpace(result.Model)
		if model == "" {
			model = strings.TrimSpace(resolved.Model)
		}

		return AIChatResult{
			Reply:    result.Reply,
			Provider: ai.ProviderClaudeCLI,
			Model:    model,
		}, nil
	}

	if resolved.Mode != "" && resolved.Mode != ai.ModeOpenAICompatible {
		return AIChatResult{}, fmt.Errorf("provider mode %q is not supported for chat", resolved.Mode)
	}

	client := ai.NewClient(resolved.APIKey, resolved.Model, resolved.BaseURL)
	reply, err := client.ChatCompletion(systemContext, trimmedPrompt)
	if err != nil {
		return AIChatResult{}, err
	}

	return AIChatResult{
		Reply:    reply,
		Provider: resolved.Provider,
		Model:    resolved.Model,
	}, nil
}

func (a *App) resolveFeatureConfig(feature string) (ai.ResolvedConfig, error) {
	settings, err := a.loadOrMigrateAISettings()
	if err != nil {
		return ai.ResolvedConfig{}, err
	}
	return ai.ResolveForFeature(settings, feature, ai.ChatOverride{})
}

func (a *App) resolveFeatureClient(feature string) (*ai.Client, error) {
	resolved, err := a.resolveFeatureConfig(feature)
	if err != nil {
		return nil, err
	}
	if resolved.Provider == ai.ProviderClaudeCLI {
		return nil, fmt.Errorf("provider %q is not supported for feature %q", ai.ProviderClaudeCLI, feature)
	}
	if resolved.Mode != "" && resolved.Mode != ai.ModeOpenAICompatible {
		return nil, fmt.Errorf("provider mode %q is not supported for feature %q", resolved.Mode, feature)
	}
	return ai.NewClient(resolved.APIKey, resolved.Model, resolved.BaseURL), nil
}

func (a *App) getOpenAIConfigForFeature(feature string) (*openAIIntegrationConfig, error) {
	resolved, err := a.resolveFeatureConfig(feature)
	if err != nil {
		return nil, err
	}
	if resolved.Provider == ai.ProviderClaudeCLI {
		return nil, fmt.Errorf("provider %q is not supported for feature %q", ai.ProviderClaudeCLI, feature)
	}
	return &openAIIntegrationConfig{
		APIKey:  resolved.APIKey,
		Model:   resolved.Model,
		BaseURL: resolved.BaseURL,
	}, nil
}

func (a *App) getOpenAIConfig() (*openAIIntegrationConfig, error) {
	return a.getOpenAIConfigForFeature(ai.FeatureReportRefine)
}
