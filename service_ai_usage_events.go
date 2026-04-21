package main

import (
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const eventAIUsageUpdated = "personal-ai-usage-updated"

type aiUsageUpdatedPayload struct {
	Feature    string `json:"feature"`
	Day        string `json:"day"`
	OccurredAt string `json:"occurredAt"`
}

func (a *App) emitAIUsageUpdated(event aiUsageEvent) {
	if a == nil || a.ctx == nil {
		return
	}
	occurredAt := usageTimeInKST(event.OccurredAt)
	payload := aiUsageUpdatedPayload{
		Feature:    event.Feature,
		Day:        usageDayString(occurredAt),
		OccurredAt: occurredAt.Format(time.RFC3339Nano),
	}
	wailsRuntime.EventsEmit(a.ctx, eventAIUsageUpdated, payload)
}

