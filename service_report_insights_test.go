package main

import (
	"path/filepath"
	"testing"

	"openreport/internal/constants"
	"openreport/internal/db"
)

func setupReportInsightServiceTest(t *testing.T) (*App, *ReportService) {
	t.Helper()

	dataDir := t.TempDir()
	database, err := db.New(filepath.Join(dataDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to initialize test db: %v", err)
	}
	t.Cleanup(func() {
		_ = database.Close()
	})

	app := &App{
		database: database,
		dataDir:  dataDir,
	}
	report := NewReportService(app)
	app.report = report
	return app, report
}

func seedReportWithActivities(t *testing.T, app *App, weekStart, weekEnd string, acts []db.Activity) (int64, []int64) {
	t.Helper()

	user, err := app.database.GetOrCreateDefaultUser()
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	integrationID, err := app.database.SaveIntegration(&db.Integration{
		UserID:     user.ID,
		ToolType:   "gmail",
		ConfigJSON: "{}",
		Enabled:    true,
	})
	if err != nil {
		t.Fatalf("failed to create integration: %v", err)
	}

	reportID, err := app.database.CreateWeeklyReport(user.ID, weekStart, weekEnd)
	if err != nil {
		t.Fatalf("failed to create weekly report: %v", err)
	}

	ids := make([]int64, 0, len(acts))
	for _, activity := range acts {
		activity.IntegrationID = integrationID
		id, saveErr := app.database.SaveActivity(&activity)
		if saveErr != nil {
			t.Fatalf("failed to save activity: %v", saveErr)
		}
		ids = append(ids, id)
	}

	return reportID, ids
}

func TestReportInsightFlowAcceptAndIgnore(t *testing.T) {
	app, service := setupReportInsightServiceTest(t)
	reportID, activityIDs := seedReportWithActivities(t, app, "2026-04-14", "2026-04-20", []db.Activity{
		{Source: "gmail", Title: "Customer follow-up", Summary: "send status mail", ActivityDate: "2026-04-15"},
		{Source: "linear_issue", Title: "ABC-200 bug fix", Summary: "resolve blocker", ActivityDate: "2026-04-16"},
	})

	initial, err := service.GetReportInsights(reportID)
	if err != nil {
		t.Fatalf("GetReportInsights failed: %v", err)
	}
	if len(initial.UnlinkedActivities) != 2 {
		t.Fatalf("expected 2 unlinked activities, got %d", len(initial.UnlinkedActivities))
	}

	if _, err := service.AcceptInsightActivity(reportID, activityIDs[0], "project_progress", "", constants.PeriodThisWeek); err != nil {
		t.Fatalf("AcceptInsightActivity failed: %v", err)
	}

	afterAccept, err := service.GetReportInsights(reportID)
	if err != nil {
		t.Fatalf("GetReportInsights after accept failed: %v", err)
	}
	if afterAccept.Summary.LinkedActivities != 1 {
		t.Fatalf("expected linked count 1 after accept, got %d", afterAccept.Summary.LinkedActivities)
	}
	if len(afterAccept.UnlinkedActivities) != 1 {
		t.Fatalf("expected 1 unlinked activity after accept, got %d", len(afterAccept.UnlinkedActivities))
	}

	if err := service.IgnoreInsightActivity(reportID, activityIDs[1]); err != nil {
		t.Fatalf("IgnoreInsightActivity failed: %v", err)
	}

	afterIgnore, err := service.GetReportInsights(reportID)
	if err != nil {
		t.Fatalf("GetReportInsights after ignore failed: %v", err)
	}
	if len(afterIgnore.UnlinkedActivities) != 0 {
		t.Fatalf("expected 0 unlinked activities after ignore, got %d", len(afterIgnore.UnlinkedActivities))
	}
	if afterIgnore.Summary.LinkedActivities != 1 {
		t.Fatalf("expected linked count to remain 1, got %d", afterIgnore.Summary.LinkedActivities)
	}

	items, err := app.database.ListReportItems(reportID)
	if err != nil {
		t.Fatalf("ListReportItems failed: %v", err)
	}
	if len(items) != 1 || items[0].ActivityID == nil || *items[0].ActivityID != activityIDs[0] {
		t.Fatalf("expected one report item linked to accepted activity, got %+v", items)
	}
}

func TestAcceptInsightDraftWithActivityIDsRespectsPeriod(t *testing.T) {
	app, service := setupReportInsightServiceTest(t)
	reportID, activityIDs := seedReportWithActivities(t, app, "2026-04-14", "2026-04-20", []db.Activity{
		{Source: "linear_issue", Title: "ABC-300 next sprint prep", Summary: "prepare backlog", ActivityDate: "2026-04-17"},
	})

	draft := db.ReportInsightDraft{
		Key:              "linear|abc-300",
		SuggestedSection: "next_week_plan",
		Content:          "Prepare ABC-300 scope for next sprint",
		ActivityIDs:      []int64{activityIDs[0]},
	}

	items, err := service.AcceptInsightDraft(reportID, draft, constants.PeriodNextWeek)
	if err != nil {
		t.Fatalf("AcceptInsightDraft failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected one report item from draft, got %d", len(items))
	}
	if items[0].Period != constants.PeriodNextWeek {
		t.Fatalf("expected period next_week, got %s", items[0].Period)
	}
	if items[0].Section != "next_week_plan" {
		t.Fatalf("expected section next_week_plan, got %s", items[0].Section)
	}

	insights, err := service.GetReportInsights(reportID)
	if err != nil {
		t.Fatalf("GetReportInsights failed: %v", err)
	}
	if insights.Summary.LinkedActivities != 1 || len(insights.UnlinkedActivities) != 0 {
		t.Fatalf("expected linked=1 and unlinked=0 after draft accept, got summary=%+v", insights.Summary)
	}
}
