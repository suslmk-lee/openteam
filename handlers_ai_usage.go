package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"openreport/internal/db"
)

type OpenAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OpenAIChatResult struct {
	Reply        string  `json:"reply"`
	Model        string  `json:"model"`
	InputTokens  int     `json:"inputTokens"`
	OutputTokens int     `json:"outputTokens"`
	TotalTokens  int     `json:"totalTokens"`
	CostUSD      float64 `json:"costUsd"`
}

type miniMaxIntegrationConfig struct {
	APIKey        string `json:"apiKey"`
	Model         string `json:"model"`
	BaseURL       string `json:"baseUrl"`
	UsageEndpoint string `json:"usageEndpoint,omitempty"`
}

func (a *App) OpenAIChatWithMessages(systemContext string, messages []OpenAIChatMessage) (OpenAIChatResult, error) {
	cfg, err := a.getOpenAIConfig()
	if err != nil {
		return OpenAIChatResult{}, err
	}
	if cfg == nil || strings.TrimSpace(cfg.APIKey) == "" {
		return OpenAIChatResult{}, fmt.Errorf("OpenAI API Key is not configured")
	}

	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "gpt-4o-mini"
	}

	payloadMessages := make([]map[string]string, 0, len(messages)+1)
	if strings.TrimSpace(systemContext) != "" {
		payloadMessages = append(payloadMessages, map[string]string{
			"role":    "system",
			"content": systemContext,
		})
	}
	for _, message := range messages {
		role := strings.TrimSpace(strings.ToLower(message.Role))
		if role != "user" && role != "assistant" && role != "system" {
			continue
		}
		payloadMessages = append(payloadMessages, map[string]string{
			"role":    role,
			"content": message.Content,
		})
	}
	if len(payloadMessages) == 0 {
		return OpenAIChatResult{}, fmt.Errorf("no messages provided")
	}

	reqBody := map[string]any{
		"model":      model,
		"messages":   payloadMessages,
		"max_tokens": 1024,
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return OpenAIChatResult{}, err
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return OpenAIChatResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return OpenAIChatResult{}, err
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		var apiErr struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(rawBody, &apiErr)
		if strings.TrimSpace(apiErr.Error.Message) != "" {
			return OpenAIChatResult{}, fmt.Errorf("%s", apiErr.Error.Message)
		}
		return OpenAIChatResult{}, fmt.Errorf("OpenAI API returned HTTP %d", resp.StatusCode)
	}

	var parsed struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(rawBody, &parsed); err != nil {
		return OpenAIChatResult{}, err
	}
	if len(parsed.Choices) == 0 {
		return OpenAIChatResult{}, fmt.Errorf("OpenAI returned empty response")
	}

	result := OpenAIChatResult{
		Reply:        strings.TrimSpace(parsed.Choices[0].Message.Content),
		Model:        strings.TrimSpace(parsed.Model),
		InputTokens:  parsed.Usage.PromptTokens,
		OutputTokens: parsed.Usage.CompletionTokens,
		TotalTokens:  parsed.Usage.TotalTokens,
		CostUSD:      0,
	}
	if result.Model == "" {
		result.Model = model
	}

	_ = a.trackAIUsage(aiUsageEvent{
		ProviderCode: "openai",
		ModelCode:    result.Model,
		Feature:      "chat",
		RequestCount: 1,
		InputTokens:  int64(result.InputTokens),
		OutputTokens: int64(result.OutputTokens),
		PaygCostUSD:  result.CostUSD,
		OccurredAt:   time.Now(),
	})

	return result, nil
}

func (a *App) MiniMaxChatWithMessages(systemContext string, messages []OpenAIChatMessage) (OpenAIChatResult, error) {
	cfg, err := a.getMiniMaxConfig()
	if err != nil {
		return OpenAIChatResult{}, err
	}
	if cfg == nil || strings.TrimSpace(cfg.APIKey) == "" {
		return OpenAIChatResult{}, fmt.Errorf("MiniMax API Key is not configured")
	}

	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "MiniMax-M2.7"
	}

	payloadMessages := make([]map[string]string, 0, len(messages)+1)
	if strings.TrimSpace(systemContext) != "" {
		payloadMessages = append(payloadMessages, map[string]string{
			"role":    "system",
			"content": systemContext,
		})
	}
	for _, message := range messages {
		role := strings.TrimSpace(strings.ToLower(message.Role))
		if role != "user" && role != "assistant" && role != "system" {
			continue
		}
		payloadMessages = append(payloadMessages, map[string]string{
			"role":    role,
			"content": message.Content,
		})
	}
	if len(payloadMessages) == 0 {
		return OpenAIChatResult{}, fmt.Errorf("no messages provided")
	}

	reqBody := map[string]any{
		"model":      model,
		"messages":   payloadMessages,
		"max_tokens": 1024,
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return OpenAIChatResult{}, err
	}

	reqURL := strings.TrimRight(cfg.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequest(http.MethodPost, reqURL, bytes.NewReader(body))
	if err != nil {
		return OpenAIChatResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return OpenAIChatResult{}, err
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		var apiErr struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(rawBody, &apiErr)
		if strings.TrimSpace(apiErr.Error.Message) != "" {
			return OpenAIChatResult{}, fmt.Errorf("%s", apiErr.Error.Message)
		}
		return OpenAIChatResult{}, fmt.Errorf("MiniMax API returned HTTP %d", resp.StatusCode)
	}

	var parsed struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(rawBody, &parsed); err != nil {
		return OpenAIChatResult{}, err
	}
	if len(parsed.Choices) == 0 {
		return OpenAIChatResult{}, fmt.Errorf("MiniMax returned empty response")
	}

	result := OpenAIChatResult{
		Reply:        strings.TrimSpace(parsed.Choices[0].Message.Content),
		Model:        strings.TrimSpace(parsed.Model),
		InputTokens:  parsed.Usage.PromptTokens,
		OutputTokens: parsed.Usage.CompletionTokens,
		TotalTokens:  parsed.Usage.TotalTokens,
		CostUSD:      0,
	}
	if result.Model == "" {
		result.Model = model
	}

	_ = a.trackAIUsage(aiUsageEvent{
		ProviderCode: "minimax",
		ModelCode:    result.Model,
		Feature:      "chat",
		RequestCount: 1,
		InputTokens:  int64(result.InputTokens),
		OutputTokens: int64(result.OutputTokens),
		PaygCostUSD:  result.CostUSD,
		OccurredAt:   time.Now(),
	})

	return result, nil
}

func (a *App) getMiniMaxConfig() (*miniMaxIntegrationConfig, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}

	intg, err := a.database.GetIntegrationByType(user.ID, "minimax")
	if err != nil {
		return nil, err
	}
	if intg == nil || !intg.Enabled {
		return nil, nil
	}

	var cfg miniMaxIntegrationConfig
	if err := json.Unmarshal([]byte(intg.ConfigJSON), &cfg); err != nil {
		return nil, fmt.Errorf("invalid minimax config json: %w", err)
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, nil
	}
	if strings.TrimSpace(cfg.Model) == "" {
		cfg.Model = "MiniMax-M2.7"
	}
	if strings.TrimSpace(cfg.BaseURL) == "" {
		cfg.BaseURL = "https://api.minimax.io/v1"
	}
	cfg.BaseURL = strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	cfg.UsageEndpoint = strings.TrimSpace(cfg.UsageEndpoint)
	return &cfg, nil
}

func (a *App) ListAIProviders() ([]db.AIProvider, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	items, err := a.database.ListAIProviders(user.ID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].Code = canonicalAIProviderCode(items[i].Code)
		items[i].DisplayName = canonicalAIProviderDisplayName(items[i].Code, items[i].DisplayName)
		if strings.TrimSpace(items[i].DisplayName) == "" {
			items[i].DisplayName = items[i].Code
		}
	}
	return items, nil
}

func (a *App) SaveAIProvider(id int64, code, displayName string, enabled bool) (db.AIProvider, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.AIProvider{}, err
	}
	item := &db.AIProvider{
		ID:          id,
		UserID:      user.ID,
		Code:        code,
		DisplayName: displayName,
		Enabled:     enabled,
	}
	newID, err := a.database.SaveAIProvider(item)
	if err != nil {
		return db.AIProvider{}, err
	}
	item.ID = newID
	item.Code = canonicalAIProviderCode(item.Code)
	item.DisplayName = canonicalAIProviderDisplayName(item.Code, item.DisplayName)
	if strings.TrimSpace(item.DisplayName) == "" {
		item.DisplayName = item.Code
	}
	return *item, nil
}

func (a *App) DeleteAIProvider(id int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteAIProvider(user.ID, id)
}

func (a *App) ListAIModels() ([]db.AIModel, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.ListAIModels(user.ID)
}

func (a *App) SaveAIModel(id, providerID int64, modelCode, displayName string, enabled bool) (db.AIModel, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.AIModel{}, err
	}
	item := &db.AIModel{
		ID:          id,
		UserID:      user.ID,
		ProviderID:  providerID,
		ModelCode:   modelCode,
		DisplayName: displayName,
		Enabled:     enabled,
	}
	newID, err := a.database.SaveAIModel(item)
	if err != nil {
		return db.AIModel{}, err
	}
	item.ID = newID
	item.ModelCode = strings.TrimSpace(item.ModelCode)
	item.DisplayName = strings.TrimSpace(item.DisplayName)
	if item.DisplayName == "" {
		item.DisplayName = item.ModelCode
	}
	return *item, nil
}

func (a *App) DeleteAIModel(id int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteAIModel(user.ID, id)
}

func (a *App) ListAIBillingPlans() ([]db.AIBillingPlan, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.ListAIBillingPlans(user.ID)
}

func (a *App) SaveAIBillingPlan(
	id, providerID, modelID int64,
	monthlyFixedUSD float64,
	includedInputTokens, includedOutputTokens int64,
	overageInputPer1kUSD, overageOutputPer1kUSD float64,
	effectiveFrom, effectiveTo string,
) (db.AIBillingPlan, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.AIBillingPlan{}, err
	}

	var modelIDPtr *int64
	if modelID > 0 {
		value := modelID
		modelIDPtr = &value
	}
	var effectiveToPtr *string
	if strings.TrimSpace(effectiveTo) != "" {
		value := strings.TrimSpace(effectiveTo)
		effectiveToPtr = &value
	}

	item := &db.AIBillingPlan{
		ID:                    id,
		UserID:                user.ID,
		ProviderID:            providerID,
		ModelID:               modelIDPtr,
		MonthlyFixedUSD:       monthlyFixedUSD,
		IncludedInputTokens:   includedInputTokens,
		IncludedOutputTokens:  includedOutputTokens,
		OverageInputPer1kUSD:  overageInputPer1kUSD,
		OverageOutputPer1kUSD: overageOutputPer1kUSD,
		EffectiveFrom:         strings.TrimSpace(effectiveFrom),
		EffectiveTo:           effectiveToPtr,
	}
	newID, err := a.database.SaveAIBillingPlan(item)
	if err != nil {
		return db.AIBillingPlan{}, err
	}
	item.ID = newID
	return *item, nil
}

func (a *App) DeleteAIBillingPlan(id int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteAIBillingPlan(user.ID, id)
}

func (a *App) GetAIUsageDashboard(month string) (db.AIUsageDashboard, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.AIUsageDashboard{}, err
	}
	return a.buildAIUsageDashboard(user.ID, month)
}

func (a *App) RefreshUSDKRWRate(day string) (db.AIFXRate, error) {
	targetDay := strings.TrimSpace(day)
	if targetDay == "" {
		targetDay = time.Now().Format("2006-01-02")
	}
	fetched, err := a.fetchUSDKRWRate(targetDay)
	if err != nil {
		return db.AIFXRate{}, err
	}
	if err := a.database.SaveAIFXRate(fetched); err != nil {
		return db.AIFXRate{}, err
	}
	return *fetched, nil
}
