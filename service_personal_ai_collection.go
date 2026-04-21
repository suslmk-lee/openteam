package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"openreport/internal/db"
)

const (
	personalAIAutoCollectIntegrationType        = "personal_ai_auto_collect"
	defaultPersonalAIAutoCollectIntervalSeconds = 120
	minPersonalAIAutoCollectIntervalSeconds     = 15
	maxPersonalAIAutoCollectIntervalSeconds     = 3600
)

type personalAIAutoCollectConfigPayload struct {
	IntervalSeconds int `json:"intervalSeconds"`
}

func normalizePersonalAIAutoCollectIntervalSeconds(input int) int {
	switch {
	case input <= 0:
		return defaultPersonalAIAutoCollectIntervalSeconds
	case input < minPersonalAIAutoCollectIntervalSeconds:
		return minPersonalAIAutoCollectIntervalSeconds
	case input > maxPersonalAIAutoCollectIntervalSeconds:
		return maxPersonalAIAutoCollectIntervalSeconds
	default:
		return input
	}
}

func parsePersonalAIAutoCollectConfig(raw string) personalAIAutoCollectConfigPayload {
	config := personalAIAutoCollectConfigPayload{
		IntervalSeconds: defaultPersonalAIAutoCollectIntervalSeconds,
	}
	if strings.TrimSpace(raw) == "" {
		return config
	}
	if err := json.Unmarshal([]byte(raw), &config); err != nil {
		return personalAIAutoCollectConfigPayload{
			IntervalSeconds: defaultPersonalAIAutoCollectIntervalSeconds,
		}
	}
	config.IntervalSeconds = normalizePersonalAIAutoCollectIntervalSeconds(config.IntervalSeconds)
	return config
}

func serializePersonalAIAutoCollectConfig(config personalAIAutoCollectConfigPayload) string {
	config.IntervalSeconds = normalizePersonalAIAutoCollectIntervalSeconds(config.IntervalSeconds)
	encoded, err := json.Marshal(config)
	if err != nil {
		return fmt.Sprintf(`{"intervalSeconds":%d}`, config.IntervalSeconds)
	}
	return string(encoded)
}

func personalAIAutoCollectTargetMonth(now time.Time) string {
	return usageTimeInKST(now).Format("2006-01")
}

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
	if strings.TrimSpace(update.Trigger) == "" {
		update.Trigger = a.personalCollectStatus.Trigger
	}
	update.AutoEnabled = a.personalCollectStatus.AutoEnabled
	update.AutoIntervalSeconds = a.personalCollectStatus.AutoIntervalSeconds
	update.AutoNextRunAt = a.personalCollectStatus.AutoNextRunAt
	update.AutoLastTriggeredAt = a.personalCollectStatus.AutoLastTriggeredAt
	update.AutoLastTriggeredMonth = a.personalCollectStatus.AutoLastTriggeredMonth
	a.personalCollectStatus = update
	a.personalCollectMu.Unlock()
}

func (a *App) loadPersonalAIAutoCollectConfig(userID int64) (bool, int, error) {
	item, err := a.database.GetIntegrationByType(userID, personalAIAutoCollectIntegrationType)
	if err != nil {
		return false, defaultPersonalAIAutoCollectIntervalSeconds, err
	}
	if item == nil {
		return true, defaultPersonalAIAutoCollectIntervalSeconds, nil
	}
	config := parsePersonalAIAutoCollectConfig(item.ConfigJSON)
	return item.Enabled, config.IntervalSeconds, nil
}

func (a *App) savePersonalAIAutoCollectConfig(userID int64, enabled bool, intervalSeconds int) error {
	intervalSeconds = normalizePersonalAIAutoCollectIntervalSeconds(intervalSeconds)
	item, err := a.database.GetIntegrationByType(userID, personalAIAutoCollectIntegrationType)
	if err != nil {
		return err
	}
	if item == nil {
		item = &db.Integration{
			UserID:   userID,
			ToolType: personalAIAutoCollectIntegrationType,
		}
	}
	item.Enabled = enabled
	item.ConfigJSON = serializePersonalAIAutoCollectConfig(personalAIAutoCollectConfigPayload{
		IntervalSeconds: intervalSeconds,
	})
	_, err = a.database.SaveIntegration(item)
	return err
}

func (a *App) bootstrapPersonalAIAutoCollect() error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	profile, err := a.database.GetTeamProfile(user.ID)
	if err != nil {
		return err
	}
	if profile == nil || strings.TrimSpace(strings.ToLower(profile.TeamType)) != "personal" {
		a.personalCollectMu.Lock()
		a.personalCollectStatus.AutoEnabled = false
		a.personalCollectStatus.AutoIntervalSeconds = defaultPersonalAIAutoCollectIntervalSeconds
		a.personalCollectStatus.AutoNextRunAt = ""
		a.personalCollectMu.Unlock()
		return nil
	}

	enabled, intervalSeconds, err := a.loadPersonalAIAutoCollectConfig(user.ID)
	if err != nil {
		return err
	}
	intervalSeconds = normalizePersonalAIAutoCollectIntervalSeconds(intervalSeconds)

	a.personalCollectMu.Lock()
	a.personalCollectStatus.AutoEnabled = enabled
	a.personalCollectStatus.AutoIntervalSeconds = intervalSeconds
	if !enabled {
		a.personalCollectStatus.AutoNextRunAt = ""
	}
	a.personalCollectMu.Unlock()

	if enabled {
		a.startPersonalAIAutoCollectWorker(intervalSeconds)
	}
	return nil
}

func (a *App) startPersonalAIAutoCollectWorker(intervalSeconds int) {
	intervalSeconds = normalizePersonalAIAutoCollectIntervalSeconds(intervalSeconds)
	a.stopPersonalAIAutoCollectWorker()

	ctx, cancel := context.WithCancel(context.Background())

	a.personalCollectMu.Lock()
	a.personalAutoCancel = cancel
	a.personalCollectStatus.AutoEnabled = true
	a.personalCollectStatus.AutoIntervalSeconds = intervalSeconds
	a.personalCollectStatus.AutoNextRunAt = time.Now().Add(1 * time.Second).Format(time.RFC3339)
	a.personalCollectMu.Unlock()

	go a.runPersonalAIAutoCollectLoop(ctx, intervalSeconds)
}

func (a *App) stopPersonalAIAutoCollectWorker() {
	var cancel context.CancelFunc
	a.personalCollectMu.Lock()
	cancel = a.personalAutoCancel
	a.personalAutoCancel = nil
	a.personalCollectMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (a *App) runPersonalAIAutoCollectLoop(ctx context.Context, intervalSeconds int) {
	intervalSeconds = normalizePersonalAIAutoCollectIntervalSeconds(intervalSeconds)
	interval := time.Duration(intervalSeconds) * time.Second
	timer := time.NewTimer(1 * time.Second)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			now := time.Now()
			month := personalAIAutoCollectTargetMonth(now)
			if _, err := a.startPersonalAIUsageCollection(month, personalCollectRunOptions{
				Incremental: true,
				Trigger:     personalAICollectTriggerAuto,
			}); err != nil {
				a.personalCollectMu.Lock()
				if ctx.Err() == nil {
					a.personalCollectStatus.LastError = fmt.Sprintf("auto collect failed: %v", err)
				}
				a.personalCollectMu.Unlock()
			}

			nextRun := now.Add(interval).Format(time.RFC3339)
			a.personalCollectMu.Lock()
			if ctx.Err() != nil {
				a.personalCollectMu.Unlock()
				return
			}
			a.personalCollectStatus.AutoLastTriggeredAt = now.Format(time.RFC3339)
			a.personalCollectStatus.AutoLastTriggeredMonth = month
			a.personalCollectStatus.AutoNextRunAt = nextRun
			a.personalCollectMu.Unlock()

			timer.Reset(interval)
		}
	}
}

func (a *App) StartPersonalAIUsageCollection(month string) (db.PersonalAICollectStatus, error) {
	return a.startPersonalAIUsageCollection(month, personalCollectRunOptions{
		Incremental: false,
		Trigger:     personalAICollectTriggerManual,
	})
}

func (a *App) startPersonalAIUsageCollection(month string, options personalCollectRunOptions) (db.PersonalAICollectStatus, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.PersonalAICollectStatus{}, err
	}
	if err := a.ensurePersonalTeam(user.ID); err != nil {
		return db.PersonalAICollectStatus{}, err
	}
	options = normalizePersonalCollectRunOptions(options)
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
	current := a.personalCollectStatus
	a.personalCollectStatus = db.PersonalAICollectStatus{
		Running:                true,
		Trigger:                options.Trigger,
		Month:                  normalizedMonth,
		StartedAt:              now,
		FinishedAt:             "",
		LastError:              "",
		LastResult:             nil,
		AutoEnabled:            current.AutoEnabled,
		AutoIntervalSeconds:    current.AutoIntervalSeconds,
		AutoNextRunAt:          current.AutoNextRunAt,
		AutoLastTriggeredAt:    current.AutoLastTriggeredAt,
		AutoLastTriggeredMonth: current.AutoLastTriggeredMonth,
	}
	a.personalCollectMu.Unlock()

	go func(targetUserID int64, targetMonth string, runOptions personalCollectRunOptions) {
		runStartedAt := time.Now()
		if runOptions.Trigger == personalAICollectTriggerAuto {
			log.Printf(
				"[PersonalAIAutoCollect] START month=%s startedAt=%s",
				targetMonth,
				runStartedAt.Format(time.RFC3339),
			)
		}

		defer func() {
			if recovered := recover(); recovered != nil {
				finishedAt := time.Now()
				a.setPersonalAICollectStatus(db.PersonalAICollectStatus{
					Running:    false,
					Trigger:    runOptions.Trigger,
					Month:      targetMonth,
					StartedAt:  now,
					FinishedAt: finishedAt.Format(time.RFC3339),
					LastError:  fmt.Sprintf("panic: %v", recovered),
					LastResult: nil,
				})
				if runOptions.Trigger == personalAICollectTriggerAuto {
					log.Printf(
						"[PersonalAIAutoCollect] END month=%s finishedAt=%s duration=%s status=panic error=%v",
						targetMonth,
						finishedAt.Format(time.RFC3339),
						finishedAt.Sub(runStartedAt).Round(time.Millisecond),
						recovered,
					)
				}
			}
		}()

		result, collectErr := a.collectPersonalAIUsage(targetUserID, targetMonth, runOptions)
		finishedAt := time.Now()
		status := db.PersonalAICollectStatus{
			Running:    false,
			Trigger:    runOptions.Trigger,
			Month:      targetMonth,
			StartedAt:  now,
			FinishedAt: finishedAt.Format(time.RFC3339),
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
		if runOptions.Trigger == personalAICollectTriggerAuto {
			if collectErr != nil {
				log.Printf(
					"[PersonalAIAutoCollect] END month=%s finishedAt=%s duration=%s status=failed error=%v",
					targetMonth,
					finishedAt.Format(time.RFC3339),
					finishedAt.Sub(runStartedAt).Round(time.Millisecond),
					collectErr,
				)
			} else {
				log.Printf(
					"[PersonalAIAutoCollect] END month=%s finishedAt=%s duration=%s status=success sources=%d",
					targetMonth,
					finishedAt.Format(time.RFC3339),
					finishedAt.Sub(runStartedAt).Round(time.Millisecond),
					len(result.Results),
				)
			}
		}
	}(user.ID, normalizedMonth, options)

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

func (a *App) GetPersonalAIAutoCollect() (db.PersonalAIAutoCollectConfig, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.PersonalAIAutoCollectConfig{}, err
	}
	if err := a.ensurePersonalTeam(user.ID); err != nil {
		return db.PersonalAIAutoCollectConfig{}, err
	}
	status := a.getPersonalAICollectStatusSnapshot()
	return db.PersonalAIAutoCollectConfig{
		Enabled:            status.AutoEnabled,
		IntervalSeconds:    status.AutoIntervalSeconds,
		NextRunAt:          status.AutoNextRunAt,
		LastTriggeredAt:    status.AutoLastTriggeredAt,
		LastTriggeredMonth: status.AutoLastTriggeredMonth,
	}, nil
}

func (a *App) SetPersonalAIAutoCollect(enabled bool, intervalSeconds int) (db.PersonalAIAutoCollectConfig, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return db.PersonalAIAutoCollectConfig{}, err
	}
	if err := a.ensurePersonalTeam(user.ID); err != nil {
		return db.PersonalAIAutoCollectConfig{}, err
	}

	intervalSeconds = normalizePersonalAIAutoCollectIntervalSeconds(intervalSeconds)
	if err := a.savePersonalAIAutoCollectConfig(user.ID, enabled, intervalSeconds); err != nil {
		return db.PersonalAIAutoCollectConfig{}, err
	}

	if enabled {
		a.startPersonalAIAutoCollectWorker(intervalSeconds)
	} else {
		a.stopPersonalAIAutoCollectWorker()
		a.personalCollectMu.Lock()
		a.personalCollectStatus.AutoEnabled = false
		a.personalCollectStatus.AutoIntervalSeconds = intervalSeconds
		a.personalCollectStatus.AutoNextRunAt = ""
		a.personalCollectMu.Unlock()
	}

	status := a.getPersonalAICollectStatusSnapshot()
	return db.PersonalAIAutoCollectConfig{
		Enabled:            status.AutoEnabled,
		IntervalSeconds:    status.AutoIntervalSeconds,
		NextRunAt:          status.AutoNextRunAt,
		LastTriggeredAt:    status.AutoLastTriggeredAt,
		LastTriggeredMonth: status.AutoLastTriggeredMonth,
	}, nil
}
