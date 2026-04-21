package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"openreport/internal/ai"
	"openreport/internal/db"
)

type aiUsageEvent struct {
	ProviderCode      string
	ModelCode         string
	Feature           string
	MetadataJSON      string
	RequestCount      int64
	InputTokens       int64
	OutputTokens      int64
	CacheReadTokens   int64
	CacheCreateTokens int64
	PaygCostUSD       float64
	OccurredAt        time.Time
}

var usageKSTLocation = time.FixedZone("KST", 9*60*60)

func usageTimeInKST(value time.Time) time.Time {
	if value.IsZero() {
		value = time.Now()
	}
	return value.In(usageKSTLocation)
}

func usageDayString(value time.Time) string {
	return usageTimeInKST(value).Format("2006-01-02")
}

func canonicalAIProviderCode(input string) string {
	code := strings.ToLower(strings.TrimSpace(input))
	switch code {
	case "codex":
		return "openai"
	case "claude":
		return "anthropic"
	case "mini-max", "mini_max":
		return "minimax"
	default:
		return code
	}
}

func defaultAIProviderDisplayName(providerCode string) string {
	switch canonicalAIProviderCode(providerCode) {
	case "openai":
		return "OpenAI"
	case "anthropic":
		return "Anthropic"
	case "minimax":
		return "MiniMax"
	case "google":
		return "Google"
	case "xai":
		return "xAI"
	case "mistral":
		return "Mistral"
	case "deepseek":
		return "DeepSeek"
	default:
		return strings.TrimSpace(providerCode)
	}
}

func canonicalAIProviderDisplayName(providerCode, displayName string) string {
	code := canonicalAIProviderCode(providerCode)
	name := strings.TrimSpace(displayName)
	defaultName := defaultAIProviderDisplayName(code)
	if name == "" {
		return defaultName
	}
	if code == "openai" && (strings.EqualFold(name, "codex") || strings.EqualFold(name, "openai")) {
		return defaultName
	}
	if defaultName != "" && (strings.EqualFold(name, code) || strings.EqualFold(name, defaultName)) {
		return defaultName
	}
	return name
}

func shouldAutoRegisterProviderForUsage(providerCode string) bool {
	code := canonicalAIProviderCode(providerCode)
	switch code {
	case "", "unknown", "unregistered", "external":
		return false
	default:
		return true
	}
}

func (a *App) resolveUsageProviderModelIDs(userID int64, providerCode, modelCode string) (int64, int64, error) {
	providerCode = canonicalAIProviderCode(providerCode)
	if !shouldAutoRegisterProviderForUsage(providerCode) {
		return 0, 0, nil
	}

	provider, err := a.database.FindAIProviderByCode(userID, providerCode)
	if err != nil {
		return 0, 0, err
	}
	if provider == nil {
		displayName := canonicalAIProviderDisplayName(providerCode, providerCode)
		if strings.TrimSpace(displayName) == "" {
			displayName = providerCode
		}
		if _, err := a.database.SaveAIProvider(&db.AIProvider{
			UserID:      userID,
			Code:        providerCode,
			DisplayName: displayName,
			Enabled:     true,
		}); err != nil {
			return 0, 0, err
		}
		provider, err = a.database.FindAIProviderByCode(userID, providerCode)
		if err != nil {
			return 0, 0, err
		}
	}
	if provider == nil {
		return 0, 0, nil
	}

	modelCode = strings.TrimSpace(modelCode)
	if modelCode == "" || strings.EqualFold(modelCode, "unknown") {
		return provider.ID, 0, nil
	}

	model, err := a.database.FindAIModelByCode(userID, provider.ID, modelCode)
	if err != nil {
		return provider.ID, 0, err
	}
	if model == nil {
		if _, err := a.database.SaveAIModel(&db.AIModel{
			UserID:      userID,
			ProviderID:  provider.ID,
			ModelCode:   modelCode,
			DisplayName: modelCode,
			Enabled:     true,
		}); err != nil {
			return provider.ID, 0, err
		}
		model, err = a.database.FindAIModelByCode(userID, provider.ID, modelCode)
		if err != nil {
			return provider.ID, 0, err
		}
	}
	if model == nil {
		return provider.ID, 0, nil
	}
	return provider.ID, model.ID, nil
}

func parseUsageDayInKST(value string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", strings.TrimSpace(value), usageKSTLocation)
}

func isExternalUsageFeature(feature string) bool {
	normalized := strings.TrimSpace(strings.ToLower(feature))
	return strings.HasPrefix(normalized, "external_")
}

func marshalUsageMetadata(metadata map[string]any) string {
	if len(metadata) == 0 {
		return ""
	}
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return ""
	}
	return string(encoded)
}

func (a *App) trackAIUsage(event aiUsageEvent) error {
	if a == nil || a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil || user == nil {
		if err != nil {
			return err
		}
		return fmt.Errorf("default user is not available")
	}

	providerCode := canonicalAIProviderCode(event.ProviderCode)
	modelCode := strings.TrimSpace(event.ModelCode)
	feature := strings.TrimSpace(event.Feature)
	if feature == "" {
		feature = "unknown"
	}

	usage := &db.AIUsageDaily{
		Day:               usageDayString(event.OccurredAt),
		UserID:            user.ID,
		ProviderID:        0,
		ModelID:           0,
		RawProvider:       providerCode,
		RawModel:          modelCode,
		Feature:           feature,
		RequestCount:      event.RequestCount,
		InputTokens:       event.InputTokens,
		OutputTokens:      event.OutputTokens,
		CacheReadTokens:   event.CacheReadTokens,
		CacheCreateTokens: event.CacheCreateTokens,
		PaygCostUSD:       event.PaygCostUSD,
	}

	if providerCode != "" {
		providerID, modelID, resolveErr := a.resolveUsageProviderModelIDs(user.ID, providerCode, modelCode)
		if resolveErr != nil {
			log.Printf("[AIUsage] provider/model registry resolution failed (%s/%s): %v", providerCode, modelCode, resolveErr)
		} else if providerID > 0 {
			usage.ProviderID = providerID
			usage.RawProvider = ""
			if modelID > 0 {
				usage.ModelID = modelID
				usage.RawModel = ""
			}
		}
	}

	if err := a.database.IncrementAIUsageDaily(usage); err != nil {
		return err
	}

	history := &db.AIUsageHistoryEvent{
		OccurredAt:        usageTimeInKST(event.OccurredAt).Format(time.RFC3339Nano),
		Day:               usage.Day,
		UserID:            usage.UserID,
		ProviderID:        usage.ProviderID,
		ModelID:           usage.ModelID,
		RawProvider:       providerCode,
		RawModel:          modelCode,
		Feature:           feature,
		RequestCount:      event.RequestCount,
		InputTokens:       event.InputTokens,
		OutputTokens:      event.OutputTokens,
		CacheReadTokens:   event.CacheReadTokens,
		CacheCreateTokens: event.CacheCreateTokens,
		PaygCostUSD:       event.PaygCostUSD,
		MetadataJSON:      strings.TrimSpace(event.MetadataJSON),
	}
	if err := a.database.AppendAIUsageHistoryEvent(history); err != nil {
		return err
	}
	a.emitAIUsageUpdated(event)
	if err := a.maybeEnforceAIUsageHistoryRetention(user.ID, time.Now()); err != nil {
		log.Printf("[AIUsage] history retention skipped due to error: %v", err)
	}

	return nil
}

func (a *App) trackOpenAIUsageFromClient(client *ai.Client, feature string) {
	if client == nil {
		return
	}
	usage := client.LastUsage()
	if err := a.trackAIUsage(aiUsageEvent{
		ProviderCode: "openai",
		ModelCode:    usage.Model,
		Feature:      feature,
		RequestCount: 1,
		InputTokens:  int64(usage.PromptTokens),
		OutputTokens: int64(usage.CompletionTokens),
		OccurredAt:   time.Now(),
	}); err != nil {
		log.Printf("[AIUsage] failed to track OpenAI usage: %v", err)
	}
}

func normalizeUsageMonth(month string) (string, time.Time, time.Time, error) {
	value := strings.TrimSpace(month)
	if value == "" {
		now := usageTimeInKST(time.Now())
		value = now.Format("2006-01")
	}
	parsed, err := time.Parse("2006-01", value)
	if err != nil {
		return "", time.Time{}, time.Time{}, fmt.Errorf("invalid month format: %w", err)
	}
	start := time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, usageKSTLocation)
	end := start.AddDate(0, 1, 0).Add(-time.Nanosecond)
	return parsed.Format("2006-01"), start, end, nil
}

func (a *App) fetchUSDKRWRate(day string) (*db.AIFXRate, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	url := fmt.Sprintf("https://api.frankfurter.app/%s?from=USD&to=KRW", day)
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fx api returned status %d", resp.StatusCode)
	}

	var payload struct {
		Date  string             `json:"date"`
		Base  string             `json:"base"`
		Rates map[string]float64 `json:"rates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	rate, ok := payload.Rates["KRW"]
	if !ok || rate <= 0 {
		return nil, fmt.Errorf("fx rate not found in response")
	}

	return &db.AIFXRate{
		Day:    payload.Date,
		Base:   "USD",
		Quote:  "KRW",
		Rate:   rate,
		Source: "frankfurter",
	}, nil
}

func (a *App) ensureUSDKRWRate(day string) (rate float64, rateDay, source string, fallbackUsed bool, err error) {
	day = strings.TrimSpace(day)
	if day == "" {
		day = usageDayString(time.Now())
	}

	cached, err := a.database.GetAIFXRate(day, "USD", "KRW")
	if err == nil && cached != nil && cached.Rate > 0 {
		return cached.Rate, cached.Day, cached.Source, false, nil
	}

	fetched, fetchErr := a.fetchUSDKRWRate(day)
	if fetchErr == nil && fetched != nil {
		_ = a.database.SaveAIFXRate(fetched)
		return fetched.Rate, fetched.Day, fetched.Source, false, nil
	}

	latest, latestErr := a.database.GetLatestAIFXRate("USD", "KRW")
	if latestErr == nil && latest != nil && latest.Rate > 0 {
		return latest.Rate, latest.Day, latest.Source, true, nil
	}

	if fetchErr != nil {
		return 0, "", "", false, fetchErr
	}
	return 0, "", "", false, fmt.Errorf("fx rate unavailable")
}

func planActiveForRange(plan db.AIBillingPlan, start, end time.Time) bool {
	effectiveFrom, err := time.Parse("2006-01-02", plan.EffectiveFrom)
	if err != nil {
		return false
	}
	if effectiveFrom.After(end) {
		return false
	}
	if plan.EffectiveTo == nil || strings.TrimSpace(*plan.EffectiveTo) == "" {
		return true
	}
	effectiveTo, err := time.Parse("2006-01-02", strings.TrimSpace(*plan.EffectiveTo))
	if err != nil {
		return true
	}
	return !effectiveTo.Before(start)
}

func selectModelPlan(plans []db.AIBillingPlan, providerID, modelID int64, monthStart, monthEnd time.Time) *db.AIBillingPlan {
	var selected *db.AIBillingPlan
	for idx := range plans {
		plan := &plans[idx]
		if plan.ProviderID != providerID || plan.ModelID == nil || *plan.ModelID != modelID {
			continue
		}
		if !planActiveForRange(*plan, monthStart, monthEnd) {
			continue
		}
		if selected == nil || plan.EffectiveFrom > selected.EffectiveFrom {
			selected = plan
		}
	}
	return selected
}

func selectProviderPlan(plans []db.AIBillingPlan, providerID int64, monthStart, monthEnd time.Time) *db.AIBillingPlan {
	var selected *db.AIBillingPlan
	for idx := range plans {
		plan := &plans[idx]
		if plan.ProviderID != providerID || plan.ModelID != nil {
			continue
		}
		if !planActiveForRange(*plan, monthStart, monthEnd) {
			continue
		}
		if selected == nil || plan.EffectiveFrom > selected.EffectiveFrom {
			selected = plan
		}
	}
	return selected
}

func computeOverageUSD(plan *db.AIBillingPlan, inputTokens, outputTokens int64) float64 {
	if plan == nil {
		return 0
	}
	inputOver := int64(0)
	if inputTokens > plan.IncludedInputTokens {
		inputOver = inputTokens - plan.IncludedInputTokens
	}
	outputOver := int64(0)
	if outputTokens > plan.IncludedOutputTokens {
		outputOver = outputTokens - plan.IncludedOutputTokens
	}
	return (float64(inputOver)/1000.0)*plan.OverageInputPer1kUSD +
		(float64(outputOver)/1000.0)*plan.OverageOutputPer1kUSD
}

type usageAggregate struct {
	providerID        int64
	modelID           int64
	providerCode      string
	providerName      string
	modelCode         string
	modelName         string
	requestCount      int64
	inputTokens       int64
	outputTokens      int64
	cacheReadTokens   int64
	cacheCreateTokens int64
	paygCostUSD       float64
	isUnregistered    bool
}

func (a *App) buildAIUsageDashboard(userID int64, month string) (db.AIUsageDashboard, error) {
	normalizedMonth, monthStart, monthEnd, err := normalizeUsageMonth(month)
	if err != nil {
		return db.AIUsageDashboard{}, err
	}

	providers, err := a.database.ListAIProviders(userID)
	if err != nil {
		return db.AIUsageDashboard{}, err
	}
	models, err := a.database.ListAIModels(userID)
	if err != nil {
		return db.AIUsageDashboard{}, err
	}
	plans, err := a.database.ListAIBillingPlans(userID)
	if err != nil {
		return db.AIUsageDashboard{}, err
	}
	usageRows, err := a.database.ListAIUsageDailyByMonth(userID, normalizedMonth)
	if err != nil {
		return db.AIUsageDashboard{}, err
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

	aggByModel := map[string]*usageAggregate{}
	dailyMap := map[string]*db.AIUsageDailyPoint{}

	for _, row := range usageRows {
		if isExternalUsageFeature(row.Feature) {
			continue
		}

		providerCode := canonicalAIProviderCode(row.RawProvider)
		providerName := canonicalAIProviderDisplayName(providerCode, row.RawProvider)
		modelCode := row.RawModel
		modelName := row.RawModel
		isUnregistered := false

		if row.ProviderID > 0 {
			if provider, ok := providerByID[row.ProviderID]; ok {
				providerCode = canonicalAIProviderCode(provider.Code)
				providerName = canonicalAIProviderDisplayName(providerCode, provider.DisplayName)
			} else {
				isUnregistered = true
			}
		} else {
			isUnregistered = true
		}

		if row.ModelID > 0 {
			if model, ok := modelByID[row.ModelID]; ok {
				modelCode = model.ModelCode
				modelName = model.DisplayName
			} else {
				isUnregistered = true
			}
		} else {
			isUnregistered = true
		}

		if strings.TrimSpace(providerCode) == "" {
			providerCode = "unregistered"
		}
		if strings.TrimSpace(providerName) == "" {
			providerName = "미등록 제공사"
		}
		if strings.TrimSpace(modelCode) == "" {
			modelCode = "unregistered"
		}
		if strings.TrimSpace(modelName) == "" {
			modelName = "미등록 모델"
		}

		key := fmt.Sprintf("%d:%d:%s:%s", row.ProviderID, row.ModelID, providerCode, modelCode)
		agg, ok := aggByModel[key]
		if !ok {
			agg = &usageAggregate{
				providerID:     row.ProviderID,
				modelID:        row.ModelID,
				providerCode:   providerCode,
				providerName:   providerName,
				modelCode:      modelCode,
				modelName:      modelName,
				isUnregistered: isUnregistered,
			}
			aggByModel[key] = agg
		}
		agg.requestCount += row.RequestCount
		agg.inputTokens += row.InputTokens
		agg.outputTokens += row.OutputTokens
		agg.cacheReadTokens += row.CacheReadTokens
		agg.cacheCreateTokens += row.CacheCreateTokens
		agg.paygCostUSD += row.PaygCostUSD
		agg.isUnregistered = agg.isUnregistered || isUnregistered

		dayPoint, ok := dailyMap[row.Day]
		if !ok {
			dayPoint = &db.AIUsageDailyPoint{Day: row.Day}
			dailyMap[row.Day] = dayPoint
		}
		dayPoint.InputTokens += row.InputTokens
		dayPoint.OutputTokens += row.OutputTokens
		dayPoint.TotalCostUSD += row.PaygCostUSD
	}

	fxRate, fxDate, fxSource, fxFallback, fxErr := a.ensureUSDKRWRate(monthEnd.Format("2006-01-02"))
	if fxErr != nil || fxRate <= 0 {
		fxRate = 1300
		fxDate = monthEnd.Format("2006-01-02")
		fxSource = "fallback-default"
		fxFallback = true
	}

	byModel := make([]db.AIUsageSummaryRow, 0, len(aggByModel))
	byProviderMap := map[string]*db.AIUsageSummaryRow{}
	modelSpecificPlanUsed := map[int64]bool{}

	overview := db.AIUsageOverview{
		Month: normalizedMonth,
	}

	for _, agg := range aggByModel {
		row := db.AIUsageSummaryRow{
			ProviderCode:      agg.providerCode,
			ProviderName:      agg.providerName,
			ModelCode:         agg.modelCode,
			ModelName:         agg.modelName,
			RequestCount:      agg.requestCount,
			InputTokens:       agg.inputTokens,
			OutputTokens:      agg.outputTokens,
			CacheReadTokens:   agg.cacheReadTokens,
			CacheCreateTokens: agg.cacheCreateTokens,
			PaygCostUSD:       agg.paygCostUSD,
			IsUnregistered:    agg.isUnregistered,
		}

		if !agg.isUnregistered && agg.providerID > 0 && agg.modelID > 0 {
			if plan := selectModelPlan(plans, agg.providerID, agg.modelID, monthStart, monthEnd); plan != nil {
				row.FixedCostUSD = plan.MonthlyFixedUSD
				row.OverageCostUSD = computeOverageUSD(plan, agg.inputTokens, agg.outputTokens)
				modelSpecificPlanUsed[agg.providerID] = true
			}
		}
		row.TotalCostUSD = row.PaygCostUSD + row.FixedCostUSD + row.OverageCostUSD
		row.TotalCostKRW = row.TotalCostUSD * fxRate
		byModel = append(byModel, row)

		providerKey := agg.providerCode
		providerRow, ok := byProviderMap[providerKey]
		if !ok {
			providerRow = &db.AIUsageSummaryRow{
				ProviderCode: agg.providerCode,
				ProviderName: agg.providerName,
			}
			byProviderMap[providerKey] = providerRow
		}
		providerRow.RequestCount += row.RequestCount
		providerRow.InputTokens += row.InputTokens
		providerRow.OutputTokens += row.OutputTokens
		providerRow.CacheReadTokens += row.CacheReadTokens
		providerRow.CacheCreateTokens += row.CacheCreateTokens
		providerRow.PaygCostUSD += row.PaygCostUSD
		providerRow.FixedCostUSD += row.FixedCostUSD
		providerRow.OverageCostUSD += row.OverageCostUSD
	}

	for providerCode, providerRow := range byProviderMap {
		if providerCode == "unregistered" {
			providerRow.TotalCostUSD = providerRow.PaygCostUSD + providerRow.FixedCostUSD + providerRow.OverageCostUSD
			providerRow.TotalCostKRW = providerRow.TotalCostUSD * fxRate
			continue
		}

		var providerID int64
		for _, provider := range providers {
			if canonicalAIProviderCode(provider.Code) == providerCode {
				providerID = provider.ID
				break
			}
		}

		if providerID > 0 && !modelSpecificPlanUsed[providerID] {
			if plan := selectProviderPlan(plans, providerID, monthStart, monthEnd); plan != nil {
				providerRow.FixedCostUSD += plan.MonthlyFixedUSD
				providerRow.OverageCostUSD += computeOverageUSD(plan, providerRow.InputTokens, providerRow.OutputTokens)
			}
		}

		providerRow.TotalCostUSD = providerRow.PaygCostUSD + providerRow.FixedCostUSD + providerRow.OverageCostUSD
		providerRow.TotalCostKRW = providerRow.TotalCostUSD * fxRate
	}

	byProvider := make([]db.AIUsageSummaryRow, 0, len(byProviderMap))
	for _, row := range byProviderMap {
		byProvider = append(byProvider, *row)
	}

	sort.Slice(byProvider, func(i, j int) bool {
		if byProvider[i].TotalCostUSD == byProvider[j].TotalCostUSD {
			return byProvider[i].ProviderName < byProvider[j].ProviderName
		}
		return byProvider[i].TotalCostUSD > byProvider[j].TotalCostUSD
	})
	sort.Slice(byModel, func(i, j int) bool {
		if byModel[i].TotalCostUSD == byModel[j].TotalCostUSD {
			if byModel[i].ProviderName == byModel[j].ProviderName {
				return byModel[i].ModelName < byModel[j].ModelName
			}
			return byModel[i].ProviderName < byModel[j].ProviderName
		}
		return byModel[i].TotalCostUSD > byModel[j].TotalCostUSD
	})

	unregistered := make([]db.AIUsageSummaryRow, 0)
	for _, row := range byModel {
		if row.IsUnregistered {
			unregistered = append(unregistered, row)
		}
		overview.RequestCount += row.RequestCount
		overview.InputTokens += row.InputTokens
		overview.OutputTokens += row.OutputTokens
		overview.PaygCostUSD += row.PaygCostUSD
		overview.FixedCostUSD += row.FixedCostUSD
		overview.OverageCostUSD += row.OverageCostUSD
	}
	overview.TotalCostUSD = overview.PaygCostUSD + overview.FixedCostUSD + overview.OverageCostUSD
	overview.TotalCostKRW = overview.TotalCostUSD * fxRate

	daily := make([]db.AIUsageDailyPoint, 0, len(dailyMap))
	for _, point := range dailyMap {
		point.TotalCostKRW = point.TotalCostUSD * fxRate
		daily = append(daily, *point)
	}
	sort.Slice(daily, func(i, j int) bool {
		return daily[i].Day < daily[j].Day
	})

	return db.AIUsageDashboard{
		Overview:       overview,
		ByProvider:     byProvider,
		ByModel:        byModel,
		Unregistered:   unregistered,
		Daily:          daily,
		FXRateUsed:     fxRate,
		FXRateDate:     fxDate,
		FXSource:       fxSource,
		FXFallbackUsed: fxFallback,
	}, nil
}
