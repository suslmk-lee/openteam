package main

import (
	"fmt"
	"time"

	"openreport/internal/db"
)

func (a *App) getPersonalAICollectStatusSnapshot() db.PersonalAICollectStatus {
	a.personalCollectMu.RLock()
	defer a.personalCollectMu.RUnlock()
	status := a.personalCollectStatus
	if status.LastResult != nil {
		resultCopy := *status.LastResult
		resultCopy.Results = append([]db.PersonalAICollectorResult(nil), status.LastResult.Results...)
		status.LastResult = &resultCopy
	}
	return status
}

func (a *App) setPersonalAICollectStatus(update db.PersonalAICollectStatus) {
	a.personalCollectMu.Lock()
	a.personalCollectStatus = update
	a.personalCollectMu.Unlock()
}

func (a *App) StartPersonalAIUsageCollection(month string) (db.PersonalAICollectStatus, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.PersonalAICollectStatus{}, err
	}
	if err := a.ensurePersonalTeam(user.ID); err != nil {
		return db.PersonalAICollectStatus{}, err
	}
	normalizedMonth, _, _, err := normalizeUsageMonth(month)
	if err != nil {
		return db.PersonalAICollectStatus{}, err
	}

	now := time.Now().Format(time.RFC3339)

	a.personalCollectMu.Lock()
	if a.personalCollectStatus.Running {
		current := a.personalCollectStatus
		a.personalCollectMu.Unlock()
		return current, nil
	}
	a.personalCollectStatus = db.PersonalAICollectStatus{
		Running:    true,
		Month:      normalizedMonth,
		StartedAt:  now,
		FinishedAt: "",
		LastError:  "",
		LastResult: nil,
	}
	a.personalCollectMu.Unlock()

	go func(targetUserID int64, targetMonth string) {
		defer func() {
			if recovered := recover(); recovered != nil {
				a.setPersonalAICollectStatus(db.PersonalAICollectStatus{
					Running:    false,
					Month:      targetMonth,
					StartedAt:  now,
					FinishedAt: time.Now().Format(time.RFC3339),
					LastError:  fmt.Sprintf("panic: %v", recovered),
					LastResult: nil,
				})
			}
		}()

		result, collectErr := a.collectPersonalAIUsage(targetUserID, targetMonth)
		status := db.PersonalAICollectStatus{
			Running:    false,
			Month:      targetMonth,
			StartedAt:  now,
			FinishedAt: time.Now().Format(time.RFC3339),
			LastError:  "",
			LastResult: nil,
		}
		if collectErr != nil {
			status.LastError = collectErr.Error()
		} else {
			copyResult := result
			status.LastResult = &copyResult
		}
		a.setPersonalAICollectStatus(status)
	}(user.ID, normalizedMonth)

	return a.getPersonalAICollectStatusSnapshot(), nil
}

func (a *App) GetPersonalAIUsageCollectionStatus() (db.PersonalAICollectStatus, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.PersonalAICollectStatus{}, err
	}
	if err := a.ensurePersonalTeam(user.ID); err != nil {
		return db.PersonalAICollectStatus{}, err
	}
	return a.getPersonalAICollectStatusSnapshot(), nil
}
