package ai

import "testing"

func TestNormalizeSettingsAppliesDefaults(t *testing.T) {
	s := NormalizeSettings(Settings{})

	if s.DefaultProvider != ProviderOpenAI {
		t.Fatalf("expected default provider %q, got %q", ProviderOpenAI, s.DefaultProvider)
	}
	if !s.Policy.ChatAllowOverride {
		t.Fatalf("expected chat override default true")
	}
	if s.Providers[ProviderOpenAI].Model == "" {
		t.Fatalf("expected default OpenAI model")
	}
	if s.Providers[ProviderMiniMax].BaseURL != DefaultMiniMaxBaseURL {
		t.Fatalf("expected default MiniMax base URL %q, got %q", DefaultMiniMaxBaseURL, s.Providers[ProviderMiniMax].BaseURL)
	}
}

func TestResolveForFeatureUsesChatOverrideOnlyForChat(t *testing.T) {
	s := NormalizeSettings(Settings{
		DefaultProvider: ProviderOpenAI,
		Providers: map[string]ProviderConfig{
			ProviderOpenAI: {
				Enabled: true,
				APIKey:  "sk-openai",
				Model:   "gpt-4o-mini",
				BaseURL: "https://api.openai.com/v1",
				Mode:    ModeOpenAICompatible,
			},
			ProviderMiniMax: {
				Enabled: true,
				APIKey:  "mm-key",
				Model:   "MiniMax-Text-01",
				BaseURL: "https://api.minimax.example/v1",
				Mode:    ModeOpenAICompatible,
			},
		},
		Policy: PolicyConfig{ChatAllowOverride: true},
	})

	cfg, err := ResolveForFeature(s, FeatureChat, ChatOverride{
		Provider: ProviderMiniMax,
		Model:    "MiniMax-Chat-01",
	})
	if err != nil {
		t.Fatalf("ResolveForFeature(chat) failed: %v", err)
	}
	if cfg.Provider != ProviderMiniMax || cfg.Model != "MiniMax-Chat-01" {
		t.Fatalf("expected chat override minimax/MiniMax-Chat-01, got %#v", cfg)
	}

	cfg, err = ResolveForFeature(s, FeatureReportPreprocess, ChatOverride{
		Provider: ProviderMiniMax,
		Model:    "MiniMax-Chat-01",
	})
	if err != nil {
		t.Fatalf("ResolveForFeature(report) failed: %v", err)
	}
	if cfg.Provider != ProviderOpenAI {
		t.Fatalf("expected report to ignore chat override and keep global provider, got %q", cfg.Provider)
	}
}

func TestResolveForFeatureFallsBackWhenDefaultProviderDisabled(t *testing.T) {
	s := NormalizeSettings(Settings{
		DefaultProvider: ProviderOpenAI,
		Providers: map[string]ProviderConfig{
			ProviderOpenAI: {
				Enabled: false,
				APIKey:  "",
				Model:   "gpt-4o-mini",
				BaseURL: "https://api.openai.com/v1",
				Mode:    ModeOpenAICompatible,
			},
			ProviderMiniMax: {
				Enabled: true,
				APIKey:  "mm-key",
				Model:   "MiniMax-M2.7",
				BaseURL: "https://api.minimax.example/v1",
				Mode:    ModeOpenAICompatible,
			},
		},
		Policy: PolicyConfig{ChatAllowOverride: true},
	})

	cfg, err := ResolveForFeature(s, FeatureChat, ChatOverride{})
	if err != nil {
		t.Fatalf("ResolveForFeature(chat) failed: %v", err)
	}
	if cfg.Provider != ProviderMiniMax {
		t.Fatalf("expected fallback provider %q, got %q", ProviderMiniMax, cfg.Provider)
	}
	if cfg.Model != "MiniMax-M2.7" {
		t.Fatalf("expected minimax model, got %q", cfg.Model)
	}
}

func TestResolveForFeatureUsesDefaultMiniMaxBaseURLWhenMissing(t *testing.T) {
	s := NormalizeSettings(Settings{
		DefaultProvider: ProviderMiniMax,
		Providers: map[string]ProviderConfig{
			ProviderMiniMax: {
				Enabled: true,
				APIKey:  "mm-key",
				Model:   "MiniMax-M2.7",
				BaseURL: "",
				Mode:    ModeOpenAICompatible,
			},
		},
	})

	cfg, err := ResolveForFeature(s, FeatureChat, ChatOverride{})
	if err != nil {
		t.Fatalf("ResolveForFeature(chat) failed: %v", err)
	}
	if cfg.Provider != ProviderMiniMax {
		t.Fatalf("expected provider %q, got %q", ProviderMiniMax, cfg.Provider)
	}
	if cfg.BaseURL != DefaultMiniMaxBaseURL {
		t.Fatalf("expected minimax base URL %q, got %q", DefaultMiniMaxBaseURL, cfg.BaseURL)
	}
}
