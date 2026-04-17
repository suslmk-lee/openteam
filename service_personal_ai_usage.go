package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"openreport/internal/db"
)

const (
	featureExternalClaudeCodeLocal = "external_claude_code_local"
	featureExternalCodexLocal      = "external_codex_local"
	featureExternalManual          = "external_manual"
)

type personalUsageBucket struct {
	requestCount int64
	inputTokens  int64
	outputTokens int64
	costUSD      float64
}

type parsedUsageEvent struct {
	day          string
	providerCode string
	modelCode    string
	inputTokens  int64
	outputTokens int64
	costUSD      float64
}

func (a *App) ensurePersonalTeam(userID int64) error {
	profile, err := a.database.GetTeamProfile(userID)
	if err != nil {
		return err
	}
	if profile == nil || strings.TrimSpace(strings.ToLower(profile.TeamType)) != "personal" {
		return fmt.Errorf("개인팀에서만 사용할 수 있는 메뉴입니다")
	}
	return nil
}

func personalSourceMeta(feature string) (code, name string, isExternal bool) {
	normalized := strings.TrimSpace(strings.ToLower(feature))
	switch normalized {
	case featureExternalClaudeCodeLocal:
		return featureExternalClaudeCodeLocal, "Claude Code (로컬)", true
	case featureExternalCodexLocal:
		return featureExternalCodexLocal, "Codex (로컬)", true
	case featureExternalManual:
		return featureExternalManual, "수동 입력", true
	default:
		if strings.HasPrefix(normalized, "external_") {
			return normalized, "외부 기타", true
		}
		return "app_internal", "앱 내부", false
	}
}

func resolveUsageProviderModel(
	row db.AIUsageDaily,
	providerByID map[int64]db.AIProvider,
	modelByID map[int64]db.AIModel,
) (providerCode, providerName, modelCode, modelName string, isUnregistered bool) {
	providerCode = strings.TrimSpace(row.RawProvider)
	providerName = strings.TrimSpace(row.RawProvider)
	modelCode = strings.TrimSpace(row.RawModel)
	modelName = strings.TrimSpace(row.RawModel)
	isUnregistered = false

	if row.ProviderID > 0 {
		if provider, ok := providerByID[row.ProviderID]; ok {
			providerCode = provider.Code
			providerName = provider.DisplayName
		} else {
			isUnregistered = true
		}
	} else if providerCode == "" {
		isUnregistered = true
	}

	if row.ModelID > 0 {
		if model, ok := modelByID[row.ModelID]; ok {
			modelCode = model.ModelCode
			modelName = model.DisplayName
		} else {
			isUnregistered = true
		}
	} else if modelCode == "" {
		isUnregistered = true
	}

	if strings.TrimSpace(providerCode) == "" {
		providerCode = "unknown"
	}
	if strings.TrimSpace(providerName) == "" {
		providerName = "미분류 Provider"
	}
	if strings.TrimSpace(modelCode) == "" {
		modelCode = "unknown"
	}
	if strings.TrimSpace(modelName) == "" {
		modelName = "미분류 Model"
	}

	return providerCode, providerName, modelCode, modelName, isUnregistered
}

func (a *App) buildPersonalAIUsageDashboard(userID int64, month string) (db.PersonalAIUsageDashboard, error) {
	if err := a.ensurePersonalTeam(userID); err != nil {
		return db.PersonalAIUsageDashboard{}, err
	}

	normalizedMonth, _, monthEnd, err := normalizeUsageMonth(month)
	if err != nil {
		return db.PersonalAIUsageDashboard{}, err
	}

	usageRows, err := a.database.ListAIUsageDailyByMonth(userID, normalizedMonth)
	if err != nil {
		return db.PersonalAIUsageDashboard{}, err
	}
	providers, err := a.database.ListAIProviders(userID)
	if err != nil {
		return db.PersonalAIUsageDashboard{}, err
	}
	models, err := a.database.ListAIModels(userID)
	if err != nil {
		return db.PersonalAIUsageDashboard{}, err
	}

	providerByID := make(map[int64]db.AIProvider, len(providers))
	for _, item := range providers {
		providerByID[item.ID] = item
	}
	modelByID := make(map[int64]db.AIModel, len(models))
	for _, item := range models {
		modelByID[item.ID] = item
	}

	sourceMap := map[string]*db.PersonalAISourceSummaryRow{}
	providerMap := map[string]*db.AIUsageSummaryRow{}
	modelMap := map[string]*db.AIUsageSummaryRow{}
	dailyMap := map[string]*db.AIUsageDailyPoint{}
	overview := db.PersonalAIUsageOverview{
		Month: normalizedMonth,
	}

	for _, row := range usageRows {
		sourceCode, sourceName, isExternal := personalSourceMeta(row.Feature)
		sourceRow, ok := sourceMap[sourceCode]
		if !ok {
			sourceRow = &db.PersonalAISourceSummaryRow{
				SourceCode: sourceCode,
				SourceName: sourceName,
			}
			sourceMap[sourceCode] = sourceRow
		}
		sourceRow.RequestCount += row.RequestCount
		sourceRow.InputTokens += row.InputTokens
		sourceRow.OutputTokens += row.OutputTokens
		sourceRow.TotalCostUSD += row.PaygCostUSD

		providerCode, providerName, modelCode, modelName, isUnregistered := resolveUsageProviderModel(row, providerByID, modelByID)

		providerKey := providerCode
		providerAgg, ok := providerMap[providerKey]
		if !ok {
			providerAgg = &db.AIUsageSummaryRow{
				ProviderCode: providerCode,
				ProviderName: providerName,
			}
			providerMap[providerKey] = providerAgg
		}
		providerAgg.RequestCount += row.RequestCount
		providerAgg.InputTokens += row.InputTokens
		providerAgg.OutputTokens += row.OutputTokens
		providerAgg.PaygCostUSD += row.PaygCostUSD
		providerAgg.TotalCostUSD = providerAgg.PaygCostUSD
		providerAgg.IsUnregistered = providerAgg.IsUnregistered || isUnregistered

		modelKey := providerCode + "::" + modelCode
		modelAgg, ok := modelMap[modelKey]
		if !ok {
			modelAgg = &db.AIUsageSummaryRow{
				ProviderCode:   providerCode,
				ProviderName:   providerName,
				ModelCode:      modelCode,
				ModelName:      modelName,
				IsUnregistered: isUnregistered,
			}
			modelMap[modelKey] = modelAgg
		}
		modelAgg.RequestCount += row.RequestCount
		modelAgg.InputTokens += row.InputTokens
		modelAgg.OutputTokens += row.OutputTokens
		modelAgg.PaygCostUSD += row.PaygCostUSD
		modelAgg.TotalCostUSD = modelAgg.PaygCostUSD

		dayAgg, ok := dailyMap[row.Day]
		if !ok {
			dayAgg = &db.AIUsageDailyPoint{Day: row.Day}
			dailyMap[row.Day] = dayAgg
		}
		dayAgg.InputTokens += row.InputTokens
		dayAgg.OutputTokens += row.OutputTokens
		dayAgg.TotalCostUSD += row.PaygCostUSD

		overview.RequestCount += row.RequestCount
		if isExternal {
			overview.ExternalInputTokens += row.InputTokens
			overview.ExternalOutputTokens += row.OutputTokens
			overview.ExternalCostUSD += row.PaygCostUSD
		} else {
			overview.InternalInputTokens += row.InputTokens
			overview.InternalOutputTokens += row.OutputTokens
			overview.InternalCostUSD += row.PaygCostUSD
		}
	}

	overview.TotalCostUSD = overview.InternalCostUSD + overview.ExternalCostUSD

	fxRate, fxDate, fxSource, fxFallback, fxErr := a.ensureUSDKRWRate(monthEnd.Format("2006-01-02"))
	if fxErr != nil || fxRate <= 0 {
		fxRate = 1300
		fxDate = monthEnd.Format("2006-01-02")
		fxSource = "fallback-default"
		fxFallback = true
	}

	overview.TotalCostKRW = overview.TotalCostUSD * fxRate

	bySource := make([]db.PersonalAISourceSummaryRow, 0, len(sourceMap))
	for _, item := range sourceMap {
		item.TotalCostKRW = item.TotalCostUSD * fxRate
		bySource = append(bySource, *item)
	}
	sort.Slice(bySource, func(i, j int) bool {
		if bySource[i].TotalCostUSD == bySource[j].TotalCostUSD {
			return bySource[i].SourceName < bySource[j].SourceName
		}
		return bySource[i].TotalCostUSD > bySource[j].TotalCostUSD
	})

	byProvider := make([]db.AIUsageSummaryRow, 0, len(providerMap))
	for _, item := range providerMap {
		item.TotalCostKRW = item.TotalCostUSD * fxRate
		byProvider = append(byProvider, *item)
	}
	sort.Slice(byProvider, func(i, j int) bool {
		if byProvider[i].TotalCostUSD == byProvider[j].TotalCostUSD {
			return byProvider[i].ProviderName < byProvider[j].ProviderName
		}
		return byProvider[i].TotalCostUSD > byProvider[j].TotalCostUSD
	})

	byModel := make([]db.AIUsageSummaryRow, 0, len(modelMap))
	for _, item := range modelMap {
		item.TotalCostKRW = item.TotalCostUSD * fxRate
		byModel = append(byModel, *item)
	}
	sort.Slice(byModel, func(i, j int) bool {
		if byModel[i].TotalCostUSD == byModel[j].TotalCostUSD {
			if byModel[i].ProviderName == byModel[j].ProviderName {
				return byModel[i].ModelName < byModel[j].ModelName
			}
			return byModel[i].ProviderName < byModel[j].ProviderName
		}
		return byModel[i].TotalCostUSD > byModel[j].TotalCostUSD
	})

	daily := make([]db.AIUsageDailyPoint, 0, len(dailyMap))
	for _, point := range dailyMap {
		point.TotalCostKRW = point.TotalCostUSD * fxRate
		daily = append(daily, *point)
	}
	sort.Slice(daily, func(i, j int) bool {
		return daily[i].Day < daily[j].Day
	})

	return db.PersonalAIUsageDashboard{
		Overview:       overview,
		BySource:       bySource,
		ByProvider:     byProvider,
		ByModel:        byModel,
		Daily:          daily,
		FXRateUsed:     fxRate,
		FXRateDate:     fxDate,
		FXSource:       fxSource,
		FXFallbackUsed: fxFallback,
	}, nil
}

func normalizeCollectorRoots(roots []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(roots))
	for _, root := range roots {
		trimmed := strings.TrimSpace(root)
		if trimmed == "" {
			continue
		}
		cleaned := filepath.Clean(trimmed)
		if seen[cleaned] {
			continue
		}
		seen[cleaned] = true
		out = append(out, cleaned)
	}
	return out
}

func shouldSkipCollectorDir(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	switch lower {
	case ".git", "node_modules", "dist", "build", "tmp", "temp", "cache":
		return true
	default:
		return false
	}
}

func shouldInspectCollectorFile(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".json") ||
		strings.HasSuffix(lower, ".jsonl") ||
		strings.HasSuffix(lower, ".ndjson") ||
		strings.HasSuffix(lower, ".log") ||
		strings.HasSuffix(lower, ".txt")
}

func canonicalKey(key string) string {
	replacer := strings.NewReplacer("_", "", "-", "", " ", "")
	return strings.ToLower(replacer.Replace(strings.TrimSpace(key)))
}

func findFirstValue(node any, keys []string) (any, bool) {
	keySet := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		keySet[canonicalKey(key)] = struct{}{}
	}
	var walk func(value any) (any, bool)
	walk = func(value any) (any, bool) {
		switch typed := value.(type) {
		case map[string]any:
			for key, child := range typed {
				if _, ok := keySet[canonicalKey(key)]; ok {
					return child, true
				}
			}
			for _, child := range typed {
				if found, ok := walk(child); ok {
					return found, true
				}
			}
		case []any:
			for _, child := range typed {
				if found, ok := walk(child); ok {
					return found, true
				}
			}
		}
		return nil, false
	}
	return walk(node)
}

func toInt64(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int64:
		return typed, true
	case int32:
		return int64(typed), true
	case float64:
		return int64(typed), true
	case float32:
		return int64(typed), true
	case json.Number:
		if v, err := typed.Int64(); err == nil {
			return v, true
		}
		if v, err := typed.Float64(); err == nil {
			return int64(v), true
		}
	case string:
		cleaned := strings.TrimSpace(strings.ReplaceAll(typed, ",", ""))
		if cleaned == "" {
			return 0, false
		}
		if v, err := strconv.ParseInt(cleaned, 10, 64); err == nil {
			return v, true
		}
		if v, err := strconv.ParseFloat(cleaned, 64); err == nil {
			return int64(v), true
		}
	}
	return 0, false
}

func toFloat64(value any) (float64, bool) {
	switch typed := value.(type) {
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case json.Number:
		if v, err := typed.Float64(); err == nil {
			return v, true
		}
	case string:
		cleaned := strings.TrimSpace(strings.ReplaceAll(typed, ",", ""))
		if cleaned == "" {
			return 0, false
		}
		if v, err := strconv.ParseFloat(cleaned, 64); err == nil {
			return v, true
		}
	}
	return 0, false
}

func parseAnyTime(raw any) (time.Time, bool) {
	if raw == nil {
		return time.Time{}, false
	}
	switch typed := raw.(type) {
	case string:
		text := strings.TrimSpace(typed)
		if text == "" {
			return time.Time{}, false
		}
		layouts := []string{
			time.RFC3339Nano,
			time.RFC3339,
			"2006-01-02 15:04:05",
			"2006-01-02 15:04",
			"2006-01-02",
		}
		for _, layout := range layouts {
			if parsed, err := time.Parse(layout, text); err == nil {
				return parsed, true
			}
		}
		return time.Time{}, false
	case int64:
		if typed > 1_000_000_000_000 {
			return time.UnixMilli(typed), true
		}
		return time.Unix(typed, 0), true
	case int:
		v := int64(typed)
		if v > 1_000_000_000_000 {
			return time.UnixMilli(v), true
		}
		return time.Unix(v, 0), true
	case float64:
		v := int64(typed)
		if v > 1_000_000_000_000 {
			return time.UnixMilli(v), true
		}
		return time.Unix(v, 0), true
	}
	return time.Time{}, false
}

func inferProviderFromModel(model string) string {
	lower := strings.ToLower(strings.TrimSpace(model))
	switch {
	case lower == "":
		return ""
	case strings.Contains(lower, "claude"):
		return "anthropic"
	case strings.Contains(lower, "gpt"), strings.Contains(lower, "o1"), strings.Contains(lower, "o3"), strings.Contains(lower, "o4"):
		return "openai"
	case strings.Contains(lower, "gemini"):
		return "google"
	case strings.Contains(lower, "grok"):
		return "xai"
	case strings.Contains(lower, "deepseek"):
		return "deepseek"
	case strings.Contains(lower, "mistral"):
		return "mistral"
	case strings.Contains(lower, "minimax"):
		return "minimax"
	default:
		return ""
	}
}

func extractUsageEventFromNode(node any, fallbackDay time.Time, providerFallback string, monthStart, monthEnd time.Time) (parsedUsageEvent, bool) {
	inputVal, inputOK := findFirstValue(node, []string{"input_tokens", "prompt_tokens", "inputTokens", "promptTokens"})
	outputVal, outputOK := findFirstValue(node, []string{"output_tokens", "completion_tokens", "outputTokens", "completionTokens"})
	totalVal, totalOK := findFirstValue(node, []string{"total_tokens", "totalTokens"})
	costVal, costOK := findFirstValue(node, []string{"cost_usd", "total_cost_usd", "costUsd", "totalCostUsd"})

	inputTokens, _ := toInt64(inputVal)
	outputTokens, _ := toInt64(outputVal)
	totalTokens, _ := toInt64(totalVal)
	costUSD, _ := toFloat64(costVal)

	if !inputOK && !outputOK && !totalOK && !costOK {
		return parsedUsageEvent{}, false
	}
	if inputTokens == 0 && outputTokens == 0 && totalTokens > 0 {
		inputTokens = totalTokens
	}
	if inputTokens == 0 && outputTokens == 0 && costUSD <= 0 {
		return parsedUsageEvent{}, false
	}

	modelVal, _ := findFirstValue(node, []string{"model", "model_name", "modelName"})
	providerVal, _ := findFirstValue(node, []string{"provider", "provider_name", "providerName", "vendor"})
	timeVal, timeOK := findFirstValue(node, []string{"timestamp", "created_at", "createdAt", "time", "event_time", "date"})

	model := strings.TrimSpace(fmt.Sprintf("%v", modelVal))
	if strings.EqualFold(model, "<nil>") {
		model = ""
	}
	provider := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", providerVal)))
	if strings.EqualFold(provider, "<nil>") {
		provider = ""
	}
	if provider == "" {
		provider = inferProviderFromModel(model)
	}
	if provider == "" {
		provider = strings.ToLower(strings.TrimSpace(providerFallback))
	}
	if provider == "" {
		provider = "external"
	}
	if model == "" {
		model = "unknown"
	}

	eventTime := fallbackDay
	if timeOK {
		if parsed, ok := parseAnyTime(timeVal); ok {
			eventTime = parsed
		}
	}
	if eventTime.Before(monthStart) || eventTime.After(monthEnd) {
		return parsedUsageEvent{}, false
	}

	return parsedUsageEvent{
		day:          eventTime.Format("2006-01-02"),
		providerCode: provider,
		modelCode:    model,
		inputTokens:  inputTokens,
		outputTokens: outputTokens,
		costUSD:      costUSD,
	}, true
}

func collectUsageEventsFromTree(node any, fallbackDay time.Time, providerFallback string, monthStart, monthEnd time.Time, out *[]parsedUsageEvent) {
	if event, ok := extractUsageEventFromNode(node, fallbackDay, providerFallback, monthStart, monthEnd); ok {
		*out = append(*out, event)
	}
	switch typed := node.(type) {
	case map[string]any:
		for _, child := range typed {
			collectUsageEventsFromTree(child, fallbackDay, providerFallback, monthStart, monthEnd, out)
		}
	case []any:
		for _, child := range typed {
			collectUsageEventsFromTree(child, fallbackDay, providerFallback, monthStart, monthEnd, out)
		}
	}
}

func parseUsageEventsFromFile(path string, providerFallback string, monthStart, monthEnd time.Time) ([]parsedUsageEvent, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Size() > 16*1024*1024 {
		return nil, nil
	}
	fallbackDay := info.ModTime()
	ext := strings.ToLower(filepath.Ext(path))
	events := make([]parsedUsageEvent, 0)

	if ext == ".jsonl" || ext == ".ndjson" || ext == ".log" || ext == ".txt" {
		file, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || !strings.Contains(line, "{") {
				continue
			}
			var payload any
			if err := json.Unmarshal([]byte(line), &payload); err != nil {
				continue
			}
			collectUsageEventsFromTree(payload, fallbackDay, providerFallback, monthStart, monthEnd, &events)
		}
		if err := scanner.Err(); err != nil {
			return events, nil
		}
		return events, nil
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, nil
	}
	collectUsageEventsFromTree(payload, fallbackDay, providerFallback, monthStart, monthEnd, &events)
	return events, nil
}

func (a *App) runLocalUsageCollector(
	userID int64,
	month string,
	feature string,
	sourceCode string,
	sourceName string,
	providerFallback string,
	roots []string,
) (db.PersonalAICollectorResult, error) {
	normalizedMonth, monthStart, monthEnd, err := normalizeUsageMonth(month)
	if err != nil {
		return db.PersonalAICollectorResult{}, err
	}

	result := db.PersonalAICollectorResult{
		SourceCode: sourceCode,
		SourceName: sourceName,
		Warnings:   []string{},
	}

	if err := a.database.DeleteAIUsageByFeatureMonth(userID, normalizedMonth, feature); err != nil {
		return result, err
	}

	buckets := map[string]*personalUsageBucket{}
	normalizedRoots := normalizeCollectorRoots(roots)
	if len(normalizedRoots) == 0 {
		result.Warnings = append(result.Warnings, "수집 경로가 없습니다")
		return result, nil
	}

	for _, root := range normalizedRoots {
		if stat, err := os.Stat(root); err != nil || !stat.IsDir() {
			result.Warnings = append(result.Warnings, fmt.Sprintf("경로 없음: %s", root))
			continue
		}
		_ = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			if entry.IsDir() {
				if shouldSkipCollectorDir(entry.Name()) {
					return filepath.SkipDir
				}
				return nil
			}
			if !shouldInspectCollectorFile(entry.Name()) {
				return nil
			}
			result.ScannedFiles++
			events, err := parseUsageEventsFromFile(path, providerFallback, monthStart, monthEnd)
			if err != nil {
				return nil
			}
			for _, event := range events {
				result.ParsedEntries++
				key := event.day + "|" + event.providerCode + "|" + event.modelCode
				bucket, ok := buckets[key]
				if !ok {
					bucket = &personalUsageBucket{}
					buckets[key] = bucket
				}
				bucket.requestCount++
				bucket.inputTokens += event.inputTokens
				bucket.outputTokens += event.outputTokens
				bucket.costUSD += event.costUSD
			}
			return nil
		})
	}

	for key, bucket := range buckets {
		parts := strings.SplitN(key, "|", 3)
		if len(parts) != 3 {
			continue
		}
		day, providerCode, modelCode := parts[0], parts[1], parts[2]
		occurredAt, err := time.Parse("2006-01-02", day)
		if err != nil {
			continue
		}
		occurredAt = occurredAt.Add(12 * time.Hour)
		if err := a.trackAIUsage(aiUsageEvent{
			ProviderCode: providerCode,
			ModelCode:    modelCode,
			Feature:      feature,
			RequestCount: bucket.requestCount,
			InputTokens:  bucket.inputTokens,
			OutputTokens: bucket.outputTokens,
			PaygCostUSD:  bucket.costUSD,
			OccurredAt:   occurredAt,
		}); err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("저장 실패(%s/%s/%s): %v", day, providerCode, modelCode, err))
			continue
		}
		result.ImportedRows++
	}

	return result, nil
}

func (a *App) collectPersonalAIUsage(userID int64, month string) (db.PersonalAICollectorResponse, error) {
	if err := a.ensurePersonalTeam(userID); err != nil {
		return db.PersonalAICollectorResponse{}, err
	}
	normalizedMonth, _, _, err := normalizeUsageMonth(month)
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}
	codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME"))
	if codexHome == "" {
		codexHome = filepath.Join(home, ".codex")
	}

	claudeRoots := []string{
		filepath.Join(home, ".claude", "projects"),
		filepath.Join(home, ".claude", "sessions"),
		filepath.Join(home, ".claude", "logs"),
	}
	codexRoots := []string{
		filepath.Join(codexHome, "sessions"),
		filepath.Join(codexHome, "logs"),
		filepath.Join(codexHome, "history"),
	}

	claudeResult, err := a.runLocalUsageCollector(
		userID,
		normalizedMonth,
		featureExternalClaudeCodeLocal,
		"claude_code_local",
		"Claude Code (로컬)",
		"anthropic",
		claudeRoots,
	)
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}
	codexResult, err := a.runLocalUsageCollector(
		userID,
		normalizedMonth,
		featureExternalCodexLocal,
		"codex_local",
		"Codex (로컬)",
		"codex",
		codexRoots,
	)
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}

	return db.PersonalAICollectorResponse{
		Month:   normalizedMonth,
		Results: []db.PersonalAICollectorResult{claudeResult, codexResult},
	}, nil
}
