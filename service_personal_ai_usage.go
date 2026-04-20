package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
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
	featureExternalClaudeCodeLocal         = "external_claude_code_local"
	featureExternalCodexLocal              = "external_codex_local"
	featureExternalMiniMaxTokenPlanAPI     = "external_minimax_token_plan_api"
	featureExternalManual                  = "external_manual"
	personalAICollectCursorIntegrationType = "personal_ai_collect_cursor"
	personalAICollectTriggerManual         = "manual"
	personalAICollectTriggerAuto           = "auto"
	personalAICollectIncrementalTailBytes  = int64(512 * 1024)
	personalAIModelHintSeedBytes           = int64(128 * 1024)
	personalAIModelHintBacktrackBytes      = int64(256 * 1024)
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
	occurredAt   time.Time
}

type personalCollectRunOptions struct {
	Incremental bool
	Trigger     string
}

type personalAICollectFileCursor struct {
	Size        int64 `json:"size"`
	ModTimeUnix int64 `json:"modTimeUnix"`
}

type personalAICollectCursorSource struct {
	LastSuccessAt string                                 `json:"lastSuccessAt"`
	Files         map[string]personalAICollectFileCursor `json:"files"`
	State         map[string]string                      `json:"state,omitempty"`
}

type personalAICollectCursorPayload struct {
	Sources map[string]personalAICollectCursorSource `json:"sources"`
}

type personalSeriesAggregate struct {
	row   db.AIUsageSeriesRow
	daily map[string]*db.AIUsageDailySeriesPoint
}

func normalizeUsageDayKey(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if parsed, err := parseUsageDayInKST(trimmed); err == nil {
		return parsed.Format("2006-01-02")
	}
	if parsed, ok := parseAnyTime(trimmed); ok {
		return usageDayString(parsed)
	}
	if len(trimmed) >= 10 {
		prefix := trimmed[:10]
		if parsed, err := parseUsageDayInKST(prefix); err == nil {
			return parsed.Format("2006-01-02")
		}
	}
	return trimmed
}

func upsertSeriesPoint(daily map[string]*db.AIUsageDailySeriesPoint, day string) *db.AIUsageDailySeriesPoint {
	key := normalizeUsageDayKey(day)
	if key == "" {
		key = day
	}
	point, ok := daily[key]
	if !ok {
		point = &db.AIUsageDailySeriesPoint{Day: key}
		daily[key] = point
	}
	return point
}

func buildSeriesRows(aggregates map[string]*personalSeriesAggregate, fxRate float64) []db.AIUsageSeriesRow {
	rows := make([]db.AIUsageSeriesRow, 0, len(aggregates))
	for _, aggregate := range aggregates {
		aggregate.row.TotalCostKRW = aggregate.row.TotalCostUSD * fxRate
		aggregate.row.Daily = make([]db.AIUsageDailySeriesPoint, 0, len(aggregate.daily))
		for _, point := range aggregate.daily {
			point.TotalCostKRW = point.TotalCostUSD * fxRate
			aggregate.row.Daily = append(aggregate.row.Daily, *point)
		}
		sort.Slice(aggregate.row.Daily, func(i, j int) bool {
			return aggregate.row.Daily[i].Day < aggregate.row.Daily[j].Day
		})
		rows = append(rows, aggregate.row)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].TotalCostUSD == rows[j].TotalCostUSD {
			if rows[i].ProviderName == rows[j].ProviderName {
				return rows[i].ModelName < rows[j].ModelName
			}
			return rows[i].ProviderName < rows[j].ProviderName
		}
		return rows[i].TotalCostUSD > rows[j].TotalCostUSD
	})
	return rows
}

func monthDayKeys(start, end time.Time) []string {
	startKST := usageTimeInKST(start)
	endKST := usageTimeInKST(end)
	startDay := time.Date(startKST.Year(), startKST.Month(), startKST.Day(), 0, 0, 0, 0, usageKSTLocation)
	endDay := time.Date(endKST.Year(), endKST.Month(), endKST.Day(), 0, 0, 0, 0, usageKSTLocation)
	if endDay.Before(startDay) {
		return nil
	}
	keys := make([]string, 0, int(endDay.Sub(startDay).Hours()/24)+1)
	for day := startDay; !day.After(endDay); day = day.AddDate(0, 0, 1) {
		keys = append(keys, day.Format("2006-01-02"))
	}
	return keys
}

func ensureDailyPointsForDays(daily map[string]*db.AIUsageDailyPoint, dayKeys []string) {
	for _, day := range dayKeys {
		if _, ok := daily[day]; ok {
			continue
		}
		daily[day] = &db.AIUsageDailyPoint{Day: day}
	}
}

func ensureSeriesDaysForMonth(aggregates map[string]*personalSeriesAggregate, dayKeys []string) {
	for _, aggregate := range aggregates {
		for _, day := range dayKeys {
			if _, ok := aggregate.daily[day]; ok {
				continue
			}
			aggregate.daily[day] = &db.AIUsageDailySeriesPoint{Day: day}
		}
	}
}

func (a *App) ensurePersonalTeam(userID int64) error {
	profile, err := a.database.GetTeamProfile(userID)
	if err != nil {
		return err
	}
	if profile == nil || strings.TrimSpace(strings.ToLower(profile.TeamType)) != "personal" {
		return fmt.Errorf("this menu is available for personal teams only")
	}
	return nil
}

func personalSourceMeta(feature string) (code, name string, isExternal bool) {
	normalized := strings.TrimSpace(strings.ToLower(feature))
	switch normalized {
	case featureExternalClaudeCodeLocal:
		return featureExternalClaudeCodeLocal, "Claude Code (local)", true
	case featureExternalCodexLocal:
		return featureExternalCodexLocal, "Codex (local)", true
	case featureExternalMiniMaxTokenPlanAPI:
		return featureExternalMiniMaxTokenPlanAPI, "MiniMax API (account usage)", true
	case featureExternalManual:
		return featureExternalManual, "manual input", true
	default:
		if strings.HasPrefix(normalized, "external_") {
			return normalized, "external other", true
		}
		return "app_internal", "app internal", false
	}
}

func resolveUsageProviderModel(
	row db.AIUsageDaily,
	providerByID map[int64]db.AIProvider,
	modelByID map[int64]db.AIModel,
) (providerCode, providerName, modelCode, modelName string, isUnregistered bool) {
	providerCode = canonicalAIProviderCode(row.RawProvider)
	providerName = strings.TrimSpace(row.RawProvider)
	modelCode = strings.TrimSpace(row.RawModel)
	modelName = strings.TrimSpace(row.RawModel)
	isUnregistered = false

	if row.ProviderID > 0 {
		if provider, ok := providerByID[row.ProviderID]; ok {
			providerCode = canonicalAIProviderCode(provider.Code)
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
	providerName = canonicalAIProviderDisplayName(providerCode, providerName)
	if strings.TrimSpace(providerName) == "" {
		providerName = "癲??????쒓낯????源껎뀢癲?????????留곤┼??돢?룰퇌??Provider"
	}
	if strings.TrimSpace(modelCode) == "" {
		modelCode = "unknown"
	}
	if strings.TrimSpace(modelName) == "" {
		modelName = "癲??????쒓낯????源껎뀢癲?????????留곤┼??돢?룰퇌??Model"
	}

	return providerCode, providerName, modelCode, modelName, isUnregistered
}

func (a *App) buildPersonalAIUsageDashboard(userID int64, month string) (db.PersonalAIUsageDashboard, error) {
	if err := a.ensurePersonalTeam(userID); err != nil {
		return db.PersonalAIUsageDashboard{}, err
	}

	normalizedMonth, monthStart, monthEnd, err := normalizeUsageMonth(month)
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
		item.Code = canonicalAIProviderCode(item.Code)
		item.DisplayName = canonicalAIProviderDisplayName(item.Code, item.DisplayName)
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
	providerSeriesMap := map[string]*personalSeriesAggregate{}
	modelSeriesMap := map[string]*personalSeriesAggregate{}
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

		dayKey := normalizeUsageDayKey(row.Day)
		dayAgg, ok := dailyMap[dayKey]
		if !ok {
			dayAgg = &db.AIUsageDailyPoint{Day: dayKey}
			dailyMap[dayKey] = dayAgg
		}
		dayAgg.InputTokens += row.InputTokens
		dayAgg.OutputTokens += row.OutputTokens
		dayAgg.TotalCostUSD += row.PaygCostUSD

		providerSeriesAgg, ok := providerSeriesMap[providerKey]
		if !ok {
			providerSeriesAgg = &personalSeriesAggregate{
				row: db.AIUsageSeriesRow{
					ProviderCode: providerCode,
					ProviderName: providerName,
				},
				daily: map[string]*db.AIUsageDailySeriesPoint{},
			}
			providerSeriesMap[providerKey] = providerSeriesAgg
		}
		providerSeriesAgg.row.RequestCount += row.RequestCount
		providerSeriesAgg.row.InputTokens += row.InputTokens
		providerSeriesAgg.row.OutputTokens += row.OutputTokens
		providerSeriesAgg.row.TotalCostUSD += row.PaygCostUSD
		providerPoint := upsertSeriesPoint(providerSeriesAgg.daily, dayKey)
		providerPoint.RequestCount += row.RequestCount
		providerPoint.InputTokens += row.InputTokens
		providerPoint.OutputTokens += row.OutputTokens
		providerPoint.TotalCostUSD += row.PaygCostUSD

		modelSeriesAgg, ok := modelSeriesMap[modelKey]
		if !ok {
			modelSeriesAgg = &personalSeriesAggregate{
				row: db.AIUsageSeriesRow{
					ProviderCode: providerCode,
					ProviderName: providerName,
					ModelCode:    modelCode,
					ModelName:    modelName,
				},
				daily: map[string]*db.AIUsageDailySeriesPoint{},
			}
			modelSeriesMap[modelKey] = modelSeriesAgg
		}
		modelSeriesAgg.row.RequestCount += row.RequestCount
		modelSeriesAgg.row.InputTokens += row.InputTokens
		modelSeriesAgg.row.OutputTokens += row.OutputTokens
		modelSeriesAgg.row.TotalCostUSD += row.PaygCostUSD
		modelPoint := upsertSeriesPoint(modelSeriesAgg.daily, dayKey)
		modelPoint.RequestCount += row.RequestCount
		modelPoint.InputTokens += row.InputTokens
		modelPoint.OutputTokens += row.OutputTokens
		modelPoint.TotalCostUSD += row.PaygCostUSD

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

	dayKeys := monthDayKeys(monthStart, monthEnd)
	ensureDailyPointsForDays(dailyMap, dayKeys)
	ensureSeriesDaysForMonth(providerSeriesMap, dayKeys)
	ensureSeriesDaysForMonth(modelSeriesMap, dayKeys)

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

	dailyByProvider := buildSeriesRows(providerSeriesMap, fxRate)
	dailyByModel := buildSeriesRows(modelSeriesMap, fxRate)

	return db.PersonalAIUsageDashboard{
		Overview:        overview,
		BySource:        bySource,
		ByProvider:      byProvider,
		ByModel:         byModel,
		Daily:           daily,
		DailyByProvider: dailyByProvider,
		DailyByModel:    dailyByModel,
		FXRateUsed:      fxRate,
		FXRateDate:      fxDate,
		FXSource:        fxSource,
		FXFallbackUsed:  fxFallback,
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
		if parsed, err := time.Parse(time.RFC3339Nano, text); err == nil {
			return parsed, true
		}
		if parsed, err := time.Parse(time.RFC3339, text); err == nil {
			return parsed, true
		}
		localLayouts := []string{
			"2006-01-02 15:04:05",
			"2006-01-02 15:04",
			"2006-01-02",
		}
		for _, layout := range localLayouts {
			if parsed, err := time.ParseInLocation(layout, text, usageKSTLocation); err == nil {
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
	case strings.Contains(lower, "gpt"), strings.Contains(lower, "o1"), strings.Contains(lower, "o3"), strings.Contains(lower, "o4"), strings.Contains(lower, "codex"):
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

func firstStringValue(values ...any) string {
	for _, value := range values {
		text := strings.TrimSpace(fmt.Sprintf("%v", value))
		if text == "" || strings.EqualFold(text, "<nil>") {
			continue
		}
		return text
	}
	return ""
}

func normalizeModelHint(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || strings.EqualFold(trimmed, "<nil>") || strings.EqualFold(trimmed, "unknown") {
		return ""
	}
	return trimmed
}

func modelHintFromNode(node any) string {
	value, ok := findFirstValue(node, []string{"model", "model_name", "modelName"})
	if !ok {
		return ""
	}
	return normalizeModelHint(fmt.Sprintf("%v", value))
}

func extractTokenCountUsageEvent(node any, fallbackDay time.Time, providerFallback string, monthStart, monthEnd time.Time) (parsedUsageEvent, bool) {
	return extractTokenCountUsageEventWithFallback(node, fallbackDay, providerFallback, monthStart, monthEnd, "")
}

func extractTokenCountUsageEventWithFallback(
	node any,
	fallbackDay time.Time,
	providerFallback string,
	monthStart time.Time,
	monthEnd time.Time,
	modelFallback string,
) (parsedUsageEvent, bool) {
	root, ok := node.(map[string]any)
	if !ok {
		return parsedUsageEvent{}, false
	}
	rootType := strings.TrimSpace(fmt.Sprintf("%v", root["type"]))
	if !strings.EqualFold(rootType, "event_msg") {
		return parsedUsageEvent{}, false
	}
	payload, ok := root["payload"].(map[string]any)
	if !ok {
		return parsedUsageEvent{}, false
	}
	payloadType := strings.TrimSpace(fmt.Sprintf("%v", payload["type"]))
	if !strings.EqualFold(payloadType, "token_count") {
		return parsedUsageEvent{}, false
	}
	info, ok := payload["info"].(map[string]any)
	if !ok {
		return parsedUsageEvent{}, false
	}

	usageNode, _ := info["last_token_usage"].(map[string]any)
	if usageNode == nil {
		usageNode, _ = info["total_token_usage"].(map[string]any)
	}
	if usageNode == nil {
		return parsedUsageEvent{}, false
	}

	inputTokens, _ := toInt64(usageNode["input_tokens"])
	outputTokens, _ := toInt64(usageNode["output_tokens"])
	totalTokens, _ := toInt64(usageNode["total_tokens"])
	if inputTokens == 0 && outputTokens == 0 && totalTokens > 0 {
		inputTokens = totalTokens
	}
	if inputTokens == 0 && outputTokens == 0 {
		return parsedUsageEvent{}, false
	}

	model := normalizeModelHint(firstStringValue(info["model"], payload["model"], root["model"]))
	if model == "" {
		model = normalizeModelHint(modelFallback)
	}
	provider := strings.ToLower(firstStringValue(info["provider"], payload["provider"], root["provider"]))
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
	if parsed, ok := parseAnyTime(root["timestamp"]); ok {
		eventTime = parsed
	} else if parsed, ok := parseAnyTime(payload["timestamp"]); ok {
		eventTime = parsed
	} else if parsed, ok := parseAnyTime(info["timestamp"]); ok {
		eventTime = parsed
	}
	eventTime = usageTimeInKST(eventTime)
	if eventTime.Before(monthStart) || eventTime.After(monthEnd) {
		return parsedUsageEvent{}, false
	}

	return parsedUsageEvent{
		day:          usageDayString(eventTime),
		providerCode: provider,
		modelCode:    model,
		inputTokens:  inputTokens,
		outputTokens: outputTokens,
		occurredAt:   eventTime,
	}, true
}

func extractUsageEventFromNode(node any, fallbackDay time.Time, providerFallback string, monthStart, monthEnd time.Time) (parsedUsageEvent, bool) {
	return extractUsageEventFromNodeWithFallback(node, fallbackDay, providerFallback, monthStart, monthEnd, "")
}

func extractUsageEventFromNodeWithFallback(
	node any,
	fallbackDay time.Time,
	providerFallback string,
	monthStart time.Time,
	monthEnd time.Time,
	modelFallback string,
) (parsedUsageEvent, bool) {
	if event, ok := extractTokenCountUsageEventWithFallback(node, fallbackDay, providerFallback, monthStart, monthEnd, modelFallback); ok {
		return event, true
	}
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

	model := normalizeModelHint(fmt.Sprintf("%v", modelVal))
	if model == "" {
		model = normalizeModelHint(modelFallback)
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
	eventTime = usageTimeInKST(eventTime)
	if eventTime.Before(monthStart) || eventTime.After(monthEnd) {
		return parsedUsageEvent{}, false
	}

	return parsedUsageEvent{
		day:          usageDayString(eventTime),
		providerCode: provider,
		modelCode:    model,
		inputTokens:  inputTokens,
		outputTokens: outputTokens,
		costUSD:      costUSD,
		occurredAt:   eventTime,
	}, true
}

func collectUsageEventsFromTree(node any, fallbackDay time.Time, providerFallback string, monthStart, monthEnd time.Time, out *[]parsedUsageEvent) {
	collectUsageEventsFromTreeWithFallback(node, fallbackDay, providerFallback, monthStart, monthEnd, "", out)
}

func collectUsageEventsFromTreeWithFallback(
	node any,
	fallbackDay time.Time,
	providerFallback string,
	monthStart time.Time,
	monthEnd time.Time,
	modelFallback string,
	out *[]parsedUsageEvent,
) {
	if event, ok := extractTokenCountUsageEventWithFallback(node, fallbackDay, providerFallback, monthStart, monthEnd, modelFallback); ok {
		*out = append(*out, event)
		return
	}
	if event, ok := extractUsageEventFromNodeWithFallback(node, fallbackDay, providerFallback, monthStart, monthEnd, modelFallback); ok {
		*out = append(*out, event)
	}
	switch typed := node.(type) {
	case map[string]any:
		for _, child := range typed {
			collectUsageEventsFromTreeWithFallback(child, fallbackDay, providerFallback, monthStart, monthEnd, modelFallback, out)
		}
	case []any:
		for _, child := range typed {
			collectUsageEventsFromTreeWithFallback(child, fallbackDay, providerFallback, monthStart, monthEnd, modelFallback, out)
		}
	}
}

func isLineBasedCollectorFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".jsonl" || ext == ".ndjson" || ext == ".log" || ext == ".txt"
}

func filterParsedUsageEventsNotBefore(events []parsedUsageEvent, notBefore time.Time) []parsedUsageEvent {
	if len(events) == 0 || notBefore.IsZero() {
		return events
	}
	filtered := events[:0]
	for _, event := range events {
		if !event.occurredAt.IsZero() && event.occurredAt.Before(notBefore) {
			continue
		}
		filtered = append(filtered, event)
	}
	return filtered
}

func parseUsageEventsFromFile(path string, providerFallback string, monthStart, monthEnd time.Time) ([]parsedUsageEvent, error) {
	return parseUsageEventsFromFileWithOptions(path, providerFallback, monthStart, monthEnd, 0, time.Time{})
}

func scanModelHintFromFileRange(path string, startOffset, readLength int64) string {
	if readLength <= 0 {
		return ""
	}
	file, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return ""
	}
	if startOffset < 0 {
		startOffset = 0
	}
	if startOffset >= info.Size() {
		return ""
	}
	if readLength > info.Size()-startOffset {
		readLength = info.Size() - startOffset
	}
	if readLength <= 0 {
		return ""
	}

	if _, err := file.Seek(startOffset, io.SeekStart); err != nil {
		return ""
	}
	reader := io.LimitReader(file, readLength)
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 16*1024), 512*1024)

	skipPartialLine := startOffset > 0
	if skipPartialLine {
		prevByte := []byte{'\n'}
		if _, err := file.ReadAt(prevByte, startOffset-1); err == nil && prevByte[0] == '\n' {
			skipPartialLine = false
		}
	}

	hint := ""
	firstLine := true
	for scanner.Scan() {
		if firstLine && skipPartialLine {
			firstLine = false
			continue
		}
		firstLine = false
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.Contains(line, "{") {
			continue
		}
		var payload any
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			continue
		}
		if candidate := modelHintFromNode(payload); candidate != "" {
			hint = candidate
		}
	}
	return hint
}

func seedModelHintForIncrementalParse(path string, fileSize, startOffset int64) string {
	if startOffset <= 0 || fileSize <= 0 {
		return ""
	}

	// Prefer recent context near the incremental boundary.
	backtrackStart := startOffset - personalAIModelHintBacktrackBytes
	if backtrackStart < 0 {
		backtrackStart = 0
	}
	if hint := scanModelHintFromFileRange(path, backtrackStart, startOffset-backtrackStart); hint != "" {
		return hint
	}

	// Fallback: session/file header often includes stable model metadata.
	headLength := personalAIModelHintSeedBytes
	if headLength > fileSize {
		headLength = fileSize
	}
	return scanModelHintFromFileRange(path, 0, headLength)
}

func parseUsageEventsFromFileWithOptions(
	path string,
	providerFallback string,
	monthStart time.Time,
	monthEnd time.Time,
	startOffset int64,
	notBefore time.Time,
) ([]parsedUsageEvent, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if startOffset < 0 {
		startOffset = 0
	}
	if startOffset > info.Size() {
		startOffset = 0
	}
	lineBased := isLineBasedCollectorFile(path)
	if info.Size() > 16*1024*1024 && startOffset == 0 && !lineBased {
		return nil, nil
	}
	fallbackDay := usageTimeInKST(info.ModTime())
	events := make([]parsedUsageEvent, 0)

	if lineBased {
		file, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		defer file.Close()

		var reader io.Reader = file
		if startOffset > 0 {
			skipPartialLine := true
			prevByte := []byte{'\n'}
			if _, err := file.ReadAt(prevByte, startOffset-1); err == nil && prevByte[0] == '\n' {
				skipPartialLine = false
			}
			if _, err := file.Seek(startOffset, io.SeekStart); err == nil {
				buffered := bufio.NewReader(file)
				if skipPartialLine {
					_, _ = buffered.ReadString('\n')
				}
				reader = buffered
			} else {
				_, _ = file.Seek(0, io.SeekStart)
				reader = file
			}
		}

		scanner := bufio.NewScanner(reader)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		lastModelHint := seedModelHintForIncrementalParse(path, info.Size(), startOffset)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || !strings.Contains(line, "{") {
				continue
			}
			var payload any
			if err := json.Unmarshal([]byte(line), &payload); err != nil {
				continue
			}
			if hint := modelHintFromNode(payload); hint != "" {
				lastModelHint = hint
			}
			beforeLen := len(events)
			collectUsageEventsFromTreeWithFallback(payload, fallbackDay, providerFallback, monthStart, monthEnd, lastModelHint, &events)
			for idx := beforeLen; idx < len(events); idx++ {
				if hint := normalizeModelHint(events[idx].modelCode); hint != "" {
					lastModelHint = hint
				}
			}
		}
		if err := scanner.Err(); err != nil {
			return filterParsedUsageEventsNotBefore(events, notBefore), nil
		}
		return filterParsedUsageEventsNotBefore(events, notBefore), nil
	}

	if startOffset > 0 {
		return nil, nil
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, nil
	}
	modelFallback := modelHintFromNode(payload)
	collectUsageEventsFromTreeWithFallback(payload, fallbackDay, providerFallback, monthStart, monthEnd, modelFallback, &events)
	return filterParsedUsageEventsNotBefore(events, notBefore), nil
}

func parsePersonalAICollectCursorPayload(raw string) personalAICollectCursorPayload {
	payload := personalAICollectCursorPayload{
		Sources: map[string]personalAICollectCursorSource{},
	}
	if strings.TrimSpace(raw) == "" {
		return payload
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return personalAICollectCursorPayload{
			Sources: map[string]personalAICollectCursorSource{},
		}
	}
	if payload.Sources == nil {
		payload.Sources = map[string]personalAICollectCursorSource{}
	}
	for sourceCode, source := range payload.Sources {
		if source.Files == nil {
			source.Files = map[string]personalAICollectFileCursor{}
		}
		if source.State == nil {
			source.State = map[string]string{}
		}
		payload.Sources[sourceCode] = source
	}
	return payload
}

func serializePersonalAICollectCursorPayload(payload personalAICollectCursorPayload) string {
	if payload.Sources == nil {
		payload.Sources = map[string]personalAICollectCursorSource{}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return `{"sources":{}}`
	}
	return string(encoded)
}

func (a *App) loadPersonalAICollectCursor(userID int64) (personalAICollectCursorPayload, error) {
	item, err := a.database.GetIntegrationByType(userID, personalAICollectCursorIntegrationType)
	if err != nil {
		return personalAICollectCursorPayload{}, err
	}
	if item == nil {
		return personalAICollectCursorPayload{Sources: map[string]personalAICollectCursorSource{}}, nil
	}
	return parsePersonalAICollectCursorPayload(item.ConfigJSON), nil
}

func (a *App) savePersonalAICollectCursor(userID int64, payload personalAICollectCursorPayload) error {
	item, err := a.database.GetIntegrationByType(userID, personalAICollectCursorIntegrationType)
	if err != nil {
		return err
	}
	if item == nil {
		item = &db.Integration{
			UserID:   userID,
			ToolType: personalAICollectCursorIntegrationType,
		}
	}
	item.Enabled = true
	item.ConfigJSON = serializePersonalAICollectCursorPayload(payload)
	_, err = a.database.SaveIntegration(item)
	return err
}

func (a *App) runLocalUsageCollector(
	userID int64,
	month string,
	feature string,
	sourceCode string,
	sourceName string,
	providerFallback string,
	roots []string,
	options personalCollectRunOptions,
	sourceCursor personalAICollectCursorSource,
) (db.PersonalAICollectorResult, personalAICollectCursorSource, error) {
	normalizedMonth, monthStart, monthEnd, err := normalizeUsageMonth(month)
	if err != nil {
		return db.PersonalAICollectorResult{}, personalAICollectCursorSource{}, err
	}

	result := db.PersonalAICollectorResult{
		SourceCode: sourceCode,
		SourceName: sourceName,
		Warnings:   []string{},
	}

	if !options.Incremental {
		if err := a.database.DeleteAIUsageByFeatureMonth(userID, normalizedMonth, feature); err != nil {
			return result, personalAICollectCursorSource{}, err
		}
	}

	if sourceCursor.Files == nil {
		sourceCursor.Files = map[string]personalAICollectFileCursor{}
	}
	if sourceCursor.State == nil {
		sourceCursor.State = map[string]string{}
	}
	nextCursor := personalAICollectCursorSource{
		LastSuccessAt: sourceCursor.LastSuccessAt,
		Files:         map[string]personalAICollectFileCursor{},
		State:         map[string]string{},
	}
	for filePath, cursor := range sourceCursor.Files {
		nextCursor.Files[filePath] = cursor
	}
	for key, value := range sourceCursor.State {
		nextCursor.State[key] = value
	}

	var notBefore time.Time
	if options.Incremental && strings.TrimSpace(sourceCursor.LastSuccessAt) != "" {
		if parsed, parseErr := time.Parse(time.RFC3339, sourceCursor.LastSuccessAt); parseErr == nil {
			notBefore = parsed
		}
	}

	buckets := map[string]*personalUsageBucket{}
	normalizedRoots := normalizeCollectorRoots(roots)
	if len(normalizedRoots) == 0 {
		result.Warnings = append(result.Warnings, "collector root path is empty")
		return result, nextCursor, nil
	}
	metadataJSON := marshalUsageMetadata(map[string]any{
		"collector":  "local_file_scan",
		"sourceCode": sourceCode,
		"sourceName": sourceName,
		"trigger":    options.Trigger,
		"month":      normalizedMonth,
	})

	for _, root := range normalizedRoots {
		if stat, err := os.Stat(root); err != nil || !stat.IsDir() {
			result.Warnings = append(result.Warnings, fmt.Sprintf("collector root path does not exist: %s", root))
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

			fileInfo, infoErr := entry.Info()
			if infoErr != nil {
				return nil
			}
			fileSize := fileInfo.Size()
			nextCursor.Files[path] = personalAICollectFileCursor{
				Size:        fileSize,
				ModTimeUnix: fileInfo.ModTime().Unix(),
			}

			startOffset := int64(0)
			if options.Incremental {
				if previous, ok := sourceCursor.Files[path]; ok {
					if previous.Size >= 0 && previous.Size <= fileSize {
						startOffset = previous.Size
					}
				} else if fileSize > personalAICollectIncrementalTailBytes {
					startOffset = fileSize - personalAICollectIncrementalTailBytes
				}
				if startOffset >= fileSize {
					return nil
				}
			}

			events, err := parseUsageEventsFromFileWithOptions(path, providerFallback, monthStart, monthEnd, startOffset, notBefore)
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
		occurredAt, err := parseUsageDayInKST(day)
		if err != nil {
			continue
		}
		occurredAt = occurredAt.Add(12 * time.Hour)
		if err := a.trackAIUsage(aiUsageEvent{
			ProviderCode: providerCode,
			ModelCode:    modelCode,
			Feature:      feature,
			MetadataJSON: metadataJSON,
			RequestCount: bucket.requestCount,
			InputTokens:  bucket.inputTokens,
			OutputTokens: bucket.outputTokens,
			PaygCostUSD:  bucket.costUSD,
			OccurredAt:   occurredAt,
		}); err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("?????????嚥????????%s/%s/%s): %v", day, providerCode, modelCode, err))
			continue
		}
		result.ImportedRows++
	}

	nextCursor.LastSuccessAt = time.Now().Format(time.RFC3339)
	return result, nextCursor, nil
}

func normalizePersonalCollectRunOptions(options personalCollectRunOptions) personalCollectRunOptions {
	normalized := options
	normalized.Trigger = strings.TrimSpace(strings.ToLower(normalized.Trigger))
	if normalized.Trigger == "" {
		normalized.Trigger = personalAICollectTriggerManual
	}
	return normalized
}

func (a *App) collectPersonalAIUsage(userID int64, month string, options personalCollectRunOptions) (db.PersonalAICollectorResponse, error) {
	if err := a.ensurePersonalTeam(userID); err != nil {
		return db.PersonalAICollectorResponse{}, err
	}
	options = normalizePersonalCollectRunOptions(options)
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

	cursorPayload, err := a.loadPersonalAICollectCursor(userID)
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}
	claudeCursor := cursorPayload.Sources["claude_code_local"]
	codexCursor := cursorPayload.Sources["codex_local"]

	claudeResult, claudeNextCursor, err := a.runLocalUsageCollector(
		userID,
		normalizedMonth,
		featureExternalClaudeCodeLocal,
		"claude_code_local",
		"Claude Code (local)",
		"anthropic",
		claudeRoots,
		options,
		claudeCursor,
	)
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}
	codexResult, codexNextCursor, err := a.runLocalUsageCollector(
		userID,
		normalizedMonth,
		featureExternalCodexLocal,
		"codex_local",
		"Codex (local)",
		"openai",
		codexRoots,
		options,
		codexCursor,
	)
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}

	cursorPayload.Sources["claude_code_local"] = claudeNextCursor
	cursorPayload.Sources["codex_local"] = codexNextCursor

	remoteResults, nextPayload, err := a.runRemoteUsageCollectors(userID, normalizedMonth, options, cursorPayload)
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}
	cursorPayload = nextPayload

	if err := a.savePersonalAICollectCursor(userID, cursorPayload); err != nil {
		return db.PersonalAICollectorResponse{}, err
	}

	results := []db.PersonalAICollectorResult{claudeResult, codexResult}
	results = append(results, remoteResults...)

	return db.PersonalAICollectorResponse{
		Month:   normalizedMonth,
		Results: results,
	}, nil
}
