package main

import (
	"strings"
	"time"

	"openreport/internal/db"
)

const defaultPersonalAIHistoryLimit = 500

func (a *App) GetPersonalAIUsageDashboard(month string) (db.PersonalAIUsageDashboard, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.PersonalAIUsageDashboard{}, err
	}
	return a.buildPersonalAIUsageDashboard(user.ID, month)
}

func (a *App) CollectPersonalAIUsage(month string) (db.PersonalAICollectorResponse, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.PersonalAICollectorResponse{}, err
	}
	return a.collectPersonalAIUsage(user.ID, month, personalCollectRunOptions{
		Incremental: false,
		Trigger:     personalAICollectTriggerManual,
	})
}

func (a *App) GetPersonalAIUsageHistory(month string, limit int) ([]db.AIUsageHistoryEvent, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if err := a.ensurePersonalTeam(user.ID); err != nil {
		return nil, err
	}
	normalizedMonth, _, _, err := normalizeUsageMonth(month)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = defaultPersonalAIHistoryLimit
	}
	if limit > 2000 {
		limit = 2000
	}
	return a.database.ListAIUsageHistoryEventsByMonth(user.ID, normalizedMonth, limit)
}

func (a *App) AddPersonalAIManualUsage(
	day string,
	providerCode string,
	modelCode string,
	inputTokens int64,
	outputTokens int64,
	costUSD float64,
) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	if err := a.ensurePersonalTeam(user.ID); err != nil {
		return err
	}
	if inputTokens <= 0 && outputTokens <= 0 && costUSD <= 0 {
		return nil
	}

	targetDay := strings.TrimSpace(day)
	occurredAt := usageTimeInKST(time.Now())
	if targetDay != "" {
		if parsed, parseErr := parseUsageDayInKST(targetDay); parseErr == nil {
			occurredAt = parsed.Add(12 * time.Hour)
		}
	}

	if err := a.trackAIUsage(aiUsageEvent{
		ProviderCode: strings.TrimSpace(strings.ToLower(providerCode)),
		ModelCode:    strings.TrimSpace(modelCode),
		Feature:      featureExternalManual,
		MetadataJSON: marshalUsageMetadata(map[string]any{
			"collector": "manual_entry",
			"day":       targetDay,
		}),
		RequestCount: 1,
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
		PaygCostUSD:  costUSD,
		OccurredAt:   occurredAt,
	}); err != nil {
		return err
	}
	return nil
}
