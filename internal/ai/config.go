package ai

import (
	"fmt"
	"strings"
)

const (
	ProviderOpenAI    = "openai"
	ProviderMiniMax   = "minimax"
	ProviderClaudeCLI = "claude_cli"
)

const (
	ModeOpenAICompatible = "openai_compatible"
	ModeLocalCLI         = "local_cli"
	ModeUnknown          = "unknown"
)

const (
	FeatureChat             = "chat"
	FeatureReportPreprocess = "report_preprocess"
	FeatureReportRefine     = "report_refine"
	FeatureLinearSummary    = "linear_summary"
)

const DefaultOpenAIModel = "gpt-4o-mini"
const DefaultOpenAIBaseURL = "https://api.openai.com/v1"
const DefaultMiniMaxBaseURL = "https://api.minimax.io/v1"

type ProviderConfig struct {
	Enabled bool   `json:"enabled"`
	APIKey  string `json:"apiKey,omitempty"`
	Model   string `json:"model,omitempty"`
	BaseURL string `json:"baseUrl,omitempty"`
	Mode    string `json:"mode,omitempty"`
}

type PolicyConfig struct {
	ChatAllowOverride bool `json:"chatAllowOverride"`
}

type Settings struct {
	DefaultProvider string                    `json:"defaultProvider"`
	Policy          PolicyConfig              `json:"policy"`
	Providers       map[string]ProviderConfig `json:"providers"`
}

type ChatOverride struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

type ResolvedConfig struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	APIKey   string `json:"apiKey,omitempty"`
	BaseURL  string `json:"baseUrl,omitempty"`
	Mode     string `json:"mode,omitempty"`
}

func DefaultSettings() Settings {
	return Settings{
		DefaultProvider: ProviderOpenAI,
		Policy: PolicyConfig{
			ChatAllowOverride: true,
		},
		Providers: map[string]ProviderConfig{
			ProviderOpenAI: {
				Enabled: false,
				Model:   DefaultOpenAIModel,
				BaseURL: DefaultOpenAIBaseURL,
				Mode:    ModeOpenAICompatible,
			},
			ProviderMiniMax: {
				Enabled: false,
				Model:   "",
				BaseURL: DefaultMiniMaxBaseURL,
				Mode:    ModeOpenAICompatible,
			},
			ProviderClaudeCLI: {
				Enabled: true,
				Model:   "",
				BaseURL: "",
				Mode:    ModeLocalCLI,
			},
		},
	}
}

func NormalizeSettings(in Settings) Settings {
	out := DefaultSettings()

	if normalizedProvider := normalizeProviderID(in.DefaultProvider); normalizedProvider != "" {
		out.DefaultProvider = normalizedProvider
	}

	if in.Providers != nil {
		for rawProvider, rawCfg := range in.Providers {
			provider := normalizeProviderID(rawProvider)
			if provider == "" {
				continue
			}

			cfg := ProviderConfig{
				Enabled: rawCfg.Enabled,
				APIKey:  strings.TrimSpace(rawCfg.APIKey),
				Model:   strings.TrimSpace(rawCfg.Model),
				BaseURL: normalizeBaseURL(rawCfg.BaseURL),
				Mode:    normalizeProviderMode(provider, rawCfg.Mode),
			}
			out.Providers[provider] = cfg
		}
	}

	applyProviderDefaults(out.Providers)
	if _, ok := out.Providers[out.DefaultProvider]; !ok {
		out.DefaultProvider = ProviderOpenAI
	}
	shouldFallbackDefault := strings.TrimSpace(in.DefaultProvider) != "" || hasEnabledProvider(in.Providers)
	if shouldFallbackDefault && !out.Providers[out.DefaultProvider].Enabled {
		if fallback := firstEnabledProvider(out.Providers); fallback != "" {
			out.DefaultProvider = fallback
		}
	}

	// Keep default=true when settings are empty/legacy.
	if in.Policy.ChatAllowOverride {
		out.Policy.ChatAllowOverride = true
	} else if strings.TrimSpace(in.DefaultProvider) != "" || len(in.Providers) > 0 {
		out.Policy.ChatAllowOverride = false
	}

	return out
}

func firstEnabledProvider(providers map[string]ProviderConfig) string {
	order := []string{ProviderOpenAI, ProviderMiniMax, ProviderClaudeCLI}
	for _, provider := range order {
		if cfg, ok := providers[provider]; ok && cfg.Enabled {
			return provider
		}
	}
	return ""
}

func hasEnabledProvider(providers map[string]ProviderConfig) bool {
	for _, cfg := range providers {
		if cfg.Enabled {
			return true
		}
	}
	return false
}

func ResolveForFeature(s Settings, feature string, override ChatOverride) (ResolvedConfig, error) {
	settings := NormalizeSettings(s)

	provider := settings.DefaultProvider
	if feature == FeatureChat && settings.Policy.ChatAllowOverride {
		if overrideProvider := normalizeProviderID(override.Provider); overrideProvider != "" {
			provider = overrideProvider
		}
	}

	cfg, ok := settings.Providers[provider]
	if !ok {
		return ResolvedConfig{}, fmt.Errorf("provider %q is not configured", provider)
	}
	if !cfg.Enabled {
		return ResolvedConfig{}, fmt.Errorf("provider %q is not enabled", provider)
	}

	model := strings.TrimSpace(cfg.Model)
	if feature == FeatureChat && settings.Policy.ChatAllowOverride {
		if overrideModel := strings.TrimSpace(override.Model); overrideModel != "" {
			model = overrideModel
		}
	}

	if provider != ProviderClaudeCLI {
		if strings.TrimSpace(cfg.APIKey) == "" {
			return ResolvedConfig{}, fmt.Errorf("provider %q api key is empty", provider)
		}
		if model == "" {
			return ResolvedConfig{}, fmt.Errorf("provider %q model is empty", provider)
		}
	}

	baseURL := normalizeBaseURL(cfg.BaseURL)
	if provider == ProviderOpenAI && baseURL == "" {
		baseURL = DefaultOpenAIBaseURL
	}

	return ResolvedConfig{
		Provider: provider,
		Model:    model,
		APIKey:   strings.TrimSpace(cfg.APIKey),
		BaseURL:  baseURL,
		Mode:     normalizeProviderMode(provider, cfg.Mode),
	}, nil
}

func normalizeProviderID(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case ProviderOpenAI:
		return ProviderOpenAI
	case ProviderMiniMax:
		return ProviderMiniMax
	case ProviderClaudeCLI:
		return ProviderClaudeCLI
	default:
		return ""
	}
}

func normalizeProviderMode(provider, rawMode string) string {
	mode := strings.ToLower(strings.TrimSpace(rawMode))
	if mode == "" {
		switch provider {
		case ProviderOpenAI, ProviderMiniMax:
			return ModeOpenAICompatible
		case ProviderClaudeCLI:
			return ModeLocalCLI
		default:
			return ModeUnknown
		}
	}
	return mode
}

func normalizeBaseURL(raw string) string {
	baseURL := strings.TrimSpace(raw)
	baseURL = strings.TrimRight(baseURL, "/")
	return baseURL
}

func applyProviderDefaults(providers map[string]ProviderConfig) {
	openai := providers[ProviderOpenAI]
	if strings.TrimSpace(openai.Model) == "" {
		openai.Model = DefaultOpenAIModel
	}
	if strings.TrimSpace(openai.BaseURL) == "" {
		openai.BaseURL = DefaultOpenAIBaseURL
	}
	if strings.TrimSpace(openai.Mode) == "" {
		openai.Mode = ModeOpenAICompatible
	}
	providers[ProviderOpenAI] = openai

	minimax := providers[ProviderMiniMax]
	if strings.TrimSpace(minimax.BaseURL) == "" {
		minimax.BaseURL = DefaultMiniMaxBaseURL
	}
	if strings.TrimSpace(minimax.Mode) == "" {
		minimax.Mode = ModeOpenAICompatible
	}
	providers[ProviderMiniMax] = minimax

	claude := providers[ProviderClaudeCLI]
	if strings.TrimSpace(claude.Mode) == "" {
		claude.Mode = ModeLocalCLI
	}
	providers[ProviderClaudeCLI] = claude
}
