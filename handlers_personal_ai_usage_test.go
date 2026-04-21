package main

import (
	"testing"
	"time"

	"openreport/internal/db"
)

func TestAddPersonalAIManualUsage_TodayUsesCurrentTime(t *testing.T) {
	app := setupAIUsageTestApp(t)

	user, err := app.database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("GetOrCreateDefaultUser failed: %v", err)
	}
	if err := app.database.SaveTeamProfile(user.ID, &db.TeamProfile{
		TeamType:    "personal",
		TeamName:    "개인",
		UserName:    "tester",
		MemberCount: 1,
		SetupDone:   true,
	}); err != nil {
		t.Fatalf("SaveTeamProfile failed: %v", err)
	}

	today := usageDayString(time.Now())
	if err := app.AddPersonalAIManualUsage(today, "openai", "gpt-5.4", 10, 2, 0); err != nil {
		t.Fatalf("AddPersonalAIManualUsage failed: %v", err)
	}

	month := usageTimeInKST(time.Now()).Format("2006-01")
	rows, err := app.GetPersonalAIUsageHistory(month, 50)
	if err != nil {
		t.Fatalf("GetPersonalAIUsageHistory failed: %v", err)
	}
	if len(rows) == 0 {
		t.Fatalf("expected at least 1 history row")
	}

	var manual *db.AIUsageHistoryEvent
	for idx := range rows {
		row := &rows[idx]
		if row.Feature == featureExternalManual {
			manual = row
			break
		}
	}
	if manual == nil {
		t.Fatalf("expected manual history row for today")
	}

	occurredAt, ok := parseAnyTime(manual.OccurredAt)
	if !ok {
		t.Fatalf("expected valid occurredAt timestamp, got %q", manual.OccurredAt)
	}
	nowKST := usageTimeInKST(time.Now())
	occurredAt = usageTimeInKST(occurredAt)
	if usageDayString(occurredAt) != today {
		t.Fatalf("expected manual usage day %s, got %s", today, usageDayString(occurredAt))
	}
	diff := nowKST.Sub(occurredAt)
	if diff < 0 {
		diff = -diff
	}
	if diff > 3*time.Minute {
		t.Fatalf("expected manual today usage time close to now; now=%s occurredAt=%s diff=%s", nowKST.Format(time.RFC3339), occurredAt.Format(time.RFC3339), diff.String())
	}
}
