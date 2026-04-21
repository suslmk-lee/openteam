package main

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	"openreport/internal/db"
)

const personalAIHalfHourBucketCount = 48

func nonNegativeInt64(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}

func nonNegativeFloat64(value float64) float64 {
	if value < 0 {
		return 0
	}
	return value
}

func buildTodayHalfHourBuckets(dayStart time.Time) []db.AIUsageTodayHalfHourPoint {
	buckets := make([]db.AIUsageTodayHalfHourPoint, 0, personalAIHalfHourBucketCount)
	for idx := 0; idx < personalAIHalfHourBucketCount; idx++ {
		startAt := dayStart.Add(time.Duration(idx) * 30 * time.Minute)
		endAt := startAt.Add(30 * time.Minute)
		buckets = append(buckets, db.AIUsageTodayHalfHourPoint{
			Slot:    startAt.Format("15:04"),
			StartAt: startAt.Format(time.RFC3339Nano),
			EndAt:   endAt.Format(time.RFC3339Nano),
		})
	}
	return buckets
}

func cloneTodayHalfHourBuckets(template []db.AIUsageTodayHalfHourPoint) []db.AIUsageTodayHalfHourPoint {
	cloned := make([]db.AIUsageTodayHalfHourPoint, len(template))
	copy(cloned, template)
	return cloned
}

func parseHistoryOccurredAt(event db.AIUsageHistoryEvent) (time.Time, bool) {
	if parsed, ok := parseAnyTime(strings.TrimSpace(event.OccurredAt)); ok {
		return usageTimeInKST(parsed), true
	}
	if parsedDay, err := parseUsageDayInKST(event.Day); err == nil {
		return parsedDay.Add(12 * time.Hour), true
	}
	return time.Time{}, false
}

func shouldSkipLegacyLocalDailyEvent(event db.AIUsageHistoryEvent) bool {
	if strings.TrimSpace(event.MetadataJSON) == "" {
		return false
	}
	var metadata map[string]any
	if err := json.Unmarshal([]byte(event.MetadataJSON), &metadata); err != nil {
		return false
	}
	collector, _ := metadata["collector"].(string)
	if collector != "local_file_scan" {
		return false
	}
	granularity, _ := metadata["granularity"].(string)
	return strings.TrimSpace(granularity) == ""
}

func resolveHistoryProviderModel(
	event db.AIUsageHistoryEvent,
	providerByID map[int64]db.AIProvider,
	modelByID map[int64]db.AIModel,
) (string, string, string, string) {
	providerCode := canonicalAIProviderCode(event.RawProvider)
	providerName := canonicalAIProviderDisplayName(providerCode, event.RawProvider)
	modelCode := strings.TrimSpace(event.RawModel)
	modelName := strings.TrimSpace(event.RawModel)

	if event.ProviderID > 0 {
		if provider, ok := providerByID[event.ProviderID]; ok {
			providerCode = canonicalAIProviderCode(provider.Code)
			providerName = canonicalAIProviderDisplayName(providerCode, provider.DisplayName)
		}
	}
	if event.ModelID > 0 {
		if model, ok := modelByID[event.ModelID]; ok {
			modelCode = strings.TrimSpace(model.ModelCode)
			modelName = strings.TrimSpace(model.DisplayName)
		}
	}

	if strings.TrimSpace(providerCode) == "" {
		providerCode = "unknown"
	}
	if strings.TrimSpace(providerName) == "" {
		providerName = canonicalAIProviderDisplayName(providerCode, providerCode)
	}
	if strings.TrimSpace(providerName) == "" {
		providerName = "Unknown Provider"
	}
	if strings.TrimSpace(modelCode) == "" {
		modelCode = "unknown"
	}
	if strings.TrimSpace(modelName) == "" {
		modelName = modelCode
	}
	return providerCode, providerName, modelCode, modelName
}

func (a *App) buildPersonalAIUsageTodayUsage(userID int64, now time.Time) (db.PersonalAIUsageTodayUsage, error) {
	if err := a.ensurePersonalTeam(userID); err != nil {
		return db.PersonalAIUsageTodayUsage{}, err
	}

	nowKST := usageTimeInKST(now)
	dayStart := time.Date(nowKST.Year(), nowKST.Month(), nowKST.Day(), 0, 0, 0, 0, usageKSTLocation)
	dayEnd := dayStart.Add(24 * time.Hour)
	dayKey := dayStart.Format("2006-01-02")

	events, err := a.database.ListAIUsageHistoryEventsByDay(userID, dayKey)
	if err != nil {
		return db.PersonalAIUsageTodayUsage{}, err
	}

	providers, err := a.database.ListAIProviders(userID)
	if err != nil {
		return db.PersonalAIUsageTodayUsage{}, err
	}
	models, err := a.database.ListAIModels(userID)
	if err != nil {
		return db.PersonalAIUsageTodayUsage{}, err
	}
	providerByID := make(map[int64]db.AIProvider, len(providers))
	for _, provider := range providers {
		provider.Code = canonicalAIProviderCode(provider.Code)
		provider.DisplayName = canonicalAIProviderDisplayName(provider.Code, provider.DisplayName)
		providerByID[provider.ID] = provider
	}
	modelByID := make(map[int64]db.AIModel, len(models))
	for _, model := range models {
		modelByID[model.ID] = model
	}

	fxRate, fxDate, fxSource, fxFallback, fxErr := a.ensureUSDKRWRate(dayKey)
	if fxErr != nil || fxRate <= 0 {
		fxRate = 1300
		fxDate = dayKey
		fxSource = "fallback-default"
		fxFallback = true
	}

	baseBuckets := buildTodayHalfHourBuckets(dayStart)
	allBuckets := cloneTodayHalfHourBuckets(baseBuckets)
	byProviderMap := map[string]*db.PersonalAIUsageTodayProviderRow{}
	byModelMap := map[string]*db.PersonalAIUsageTodayModelRow{}

	for _, event := range events {
		if shouldSkipLegacyLocalDailyEvent(event) {
			continue
		}
		occurredAt, ok := parseHistoryOccurredAt(event)
		if !ok {
			continue
		}
		if occurredAt.Before(dayStart) || !occurredAt.Before(dayEnd) {
			continue
		}

		bucketIndex := int(occurredAt.Sub(dayStart) / (30 * time.Minute))
		if bucketIndex < 0 || bucketIndex >= len(allBuckets) {
			continue
		}

		providerCode, providerName, modelCode, modelName := resolveHistoryProviderModel(event, providerByID, modelByID)
		providerRow, exists := byProviderMap[providerCode]
		if !exists {
			providerRow = &db.PersonalAIUsageTodayProviderRow{
				ProviderCode: providerCode,
				ProviderName: providerName,
				Buckets:      cloneTodayHalfHourBuckets(baseBuckets),
			}
			byProviderMap[providerCode] = providerRow
		}
		modelKey := providerCode + "|" + modelCode
		modelRow, exists := byModelMap[modelKey]
		if !exists {
			modelRow = &db.PersonalAIUsageTodayModelRow{
				ProviderCode: providerCode,
				ProviderName: providerName,
				ModelCode:    modelCode,
				ModelName:    modelName,
				Buckets:      cloneTodayHalfHourBuckets(baseBuckets),
			}
			byModelMap[modelKey] = modelRow
		}

		requestCount := nonNegativeInt64(event.RequestCount)
		inputTokens := nonNegativeInt64(event.InputTokens)
		outputTokens := nonNegativeInt64(event.OutputTokens)
		totalTokens := inputTokens + outputTokens
		paygCostUSD := nonNegativeFloat64(event.PaygCostUSD)

		allBucket := &allBuckets[bucketIndex]
		allBucket.RequestCount += requestCount
		allBucket.InputTokens += inputTokens
		allBucket.OutputTokens += outputTokens
		allBucket.TotalTokens += totalTokens
		allBucket.PaygCostUSD += paygCostUSD

		providerBucket := &providerRow.Buckets[bucketIndex]
		providerBucket.RequestCount += requestCount
		providerBucket.InputTokens += inputTokens
		providerBucket.OutputTokens += outputTokens
		providerBucket.TotalTokens += totalTokens
		providerBucket.PaygCostUSD += paygCostUSD

		providerRow.RequestCount += requestCount
		providerRow.InputTokens += inputTokens
		providerRow.OutputTokens += outputTokens
		providerRow.TotalTokens += totalTokens
		providerRow.PaygCostUSD += paygCostUSD

		modelBucket := &modelRow.Buckets[bucketIndex]
		modelBucket.RequestCount += requestCount
		modelBucket.InputTokens += inputTokens
		modelBucket.OutputTokens += outputTokens
		modelBucket.TotalTokens += totalTokens
		modelBucket.PaygCostUSD += paygCostUSD

		modelRow.RequestCount += requestCount
		modelRow.InputTokens += inputTokens
		modelRow.OutputTokens += outputTokens
		modelRow.TotalTokens += totalTokens
		modelRow.PaygCostUSD += paygCostUSD
	}

	for idx := range allBuckets {
		allBuckets[idx].PaygCostKRW = allBuckets[idx].PaygCostUSD * fxRate
	}

	byProvider := make([]db.PersonalAIUsageTodayProviderRow, 0, len(byProviderMap))
	for _, row := range byProviderMap {
		row.PaygCostKRW = row.PaygCostUSD * fxRate
		for idx := range row.Buckets {
			row.Buckets[idx].PaygCostKRW = row.Buckets[idx].PaygCostUSD * fxRate
		}
		byProvider = append(byProvider, *row)
	}
	sort.Slice(byProvider, func(i, j int) bool {
		if byProvider[i].TotalTokens == byProvider[j].TotalTokens {
			return byProvider[i].ProviderName < byProvider[j].ProviderName
		}
		return byProvider[i].TotalTokens > byProvider[j].TotalTokens
	})

	byModel := make([]db.PersonalAIUsageTodayModelRow, 0, len(byModelMap))
	for _, row := range byModelMap {
		row.PaygCostKRW = row.PaygCostUSD * fxRate
		for idx := range row.Buckets {
			row.Buckets[idx].PaygCostKRW = row.Buckets[idx].PaygCostUSD * fxRate
		}
		byModel = append(byModel, *row)
	}
	sort.Slice(byModel, func(i, j int) bool {
		if byModel[i].TotalTokens == byModel[j].TotalTokens {
			if byModel[i].ProviderName == byModel[j].ProviderName {
				return byModel[i].ModelName < byModel[j].ModelName
			}
			return byModel[i].ProviderName < byModel[j].ProviderName
		}
		return byModel[i].TotalTokens > byModel[j].TotalTokens
	})

	return db.PersonalAIUsageTodayUsage{
		Day:            dayKey,
		Timezone:       "KST (Asia/Seoul)",
		Buckets:        allBuckets,
		ByProvider:     byProvider,
		ByModel:        byModel,
		FXRateUsed:     fxRate,
		FXRateDate:     fxDate,
		FXSource:       fxSource,
		FXFallbackUsed: fxFallback,
	}, nil
}
