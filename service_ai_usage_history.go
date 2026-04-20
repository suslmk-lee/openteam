package main

import (
	"time"
)

const aiUsageHistoryRetentionMonths = 6

func aiUsageHistoryRetentionCutoffDay(now time.Time) string {
	return usageTimeInKST(now).AddDate(0, -aiUsageHistoryRetentionMonths, 0).Format("2006-01-02")
}

func (a *App) enforceAIUsageHistoryRetention(userID int64, now time.Time) error {
	if a == nil || a.database == nil {
		return nil
	}
	cutoffDay := aiUsageHistoryRetentionCutoffDay(now)
	_, err := a.database.DeleteAIUsageHistoryEventsBefore(userID, cutoffDay)
	return err
}

func (a *App) maybeEnforceAIUsageHistoryRetention(userID int64, now time.Time) error {
	dayKey := usageTimeInKST(now).Format("2006-01-02")

	a.aiHistoryRetentionMu.Lock()
	if a.aiHistoryRetentionDay == dayKey {
		a.aiHistoryRetentionMu.Unlock()
		return nil
	}
	a.aiHistoryRetentionDay = dayKey
	a.aiHistoryRetentionMu.Unlock()

	if err := a.enforceAIUsageHistoryRetention(userID, now); err != nil {
		a.aiHistoryRetentionMu.Lock()
		a.aiHistoryRetentionDay = ""
		a.aiHistoryRetentionMu.Unlock()
		return err
	}
	return nil
}
