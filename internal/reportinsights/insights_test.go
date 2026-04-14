package reportinsights

import (
	"testing"

	"openreport/internal/db"
)

func TestIgnoredActivitiesAreExcluded(t *testing.T) {
	activities := []db.Activity{
		{ID: 10, Source: "gmail", Title: "Ignored", ActivityDate: "2026-04-13"},
		{ID: 11, Source: "linear", Title: "Kept", ActivityDate: "2026-04-13"},
	}

	result := Build(activities, nil, map[int64]bool{10: true})

	if len(result.UnlinkedActivities) != 1 {
		t.Fatalf("expected one non-ignored activity, got %+v", result.UnlinkedActivities)
	}
	if result.UnlinkedActivities[0].ActivityID != 11 {
		t.Fatalf("expected activity 11 to remain, got %+v", result.UnlinkedActivities[0])
	}
}

func TestLinkedActivitiesAreNotMarkedUnlinked(t *testing.T) {
	activityID := int64(21)
	activities := []db.Activity{
		{ID: activityID, Source: "linear_issue", Title: "ABC-123 fix", ActivityDate: "2026-04-14"},
	}
	items := []db.ReportItem{
		{ID: 1, ActivityID: &activityID, Section: "project_progress", Content: "done"},
	}

	result := Build(activities, items, nil)

	if len(result.UnlinkedActivities) != 0 {
		t.Fatalf("expected linked activity to be excluded from unlinked")
	}
	if result.Summary.LinkedActivities != 1 {
		t.Fatalf("expected linked count 1, got %d", result.Summary.LinkedActivities)
	}
}

func TestSuspiciousSimilarityGoesToNeedsReview(t *testing.T) {
	activities := []db.Activity{
		{ID: 31, Source: "linear_issue", Title: "ABC-123 fix login bug", ActivityDate: "2026-04-15"},
	}
	items := []db.ReportItem{
		{ID: 1, Section: "project_progress", Content: "ABC-123 login bug fix applied"},
	}

	result := Build(activities, items, nil)

	if len(result.NeedsReview) != 1 {
		t.Fatalf("expected one review item, got %d", len(result.NeedsReview))
	}
}

func TestDraftCandidatesAreBuiltOnlyFromUnlinkedActivities(t *testing.T) {
	activities := []db.Activity{
		{ID: 41, Source: "linear_issue", Title: "ABC-1 API update", Summary: "backend change", ActivityDate: "2026-04-15"},
		{ID: 42, Source: "linear_issue", Title: "ABC-2 API update", Summary: "follow-up test", ActivityDate: "2026-04-15"},
	}

	result := Build(activities, nil, nil)

	if len(result.DraftCandidates) == 0 {
		t.Fatalf("expected at least one draft candidate")
	}
	if len(result.DraftCandidates[0].ActivityIDs) != 2 {
		t.Fatalf("expected grouped candidate with 2 activities, got %+v", result.DraftCandidates[0])
	}
}

func TestBuildIncludesSummaryCounts(t *testing.T) {
	activities := []db.Activity{
		{ID: 1, Source: "gmail", Title: "mail", ActivityDate: "2026-04-14"},
		{ID: 2, Source: "linear_issue", Title: "ABC-100", ActivityDate: "2026-04-14"},
	}
	linkedID := int64(2)
	items := []db.ReportItem{
		{ID: 1, ActivityID: &linkedID, Section: "project_progress", Content: "done"},
	}

	result := Build(activities, items, nil)

	if result.Summary.TotalActivities != 2 || result.Summary.LinkedActivities != 1 || result.Summary.UnlinkedActivities != 1 {
		t.Fatalf("unexpected summary: %+v", result.Summary)
	}
}

func TestWeakTokenOverlapStaysUnlinked(t *testing.T) {
	activities := []db.Activity{
		{ID: 51, Source: "gmail", Title: "login bug update", ActivityDate: "2026-04-14"},
	}
	items := []db.ReportItem{
		{ID: 1, Section: "other", Content: "bug update shared for docs"},
	}

	result := Build(activities, items, nil)

	if len(result.NeedsReview) != 0 {
		t.Fatalf("expected no review-needed item for weak overlap, got %d", len(result.NeedsReview))
	}
	if len(result.UnlinkedActivities) != 1 {
		t.Fatalf("expected activity to remain unlinked, got %+v", result.UnlinkedActivities)
	}
}

func TestExternalIDMatchGoesToNeedsReview(t *testing.T) {
	activities := []db.Activity{
		{ID: 61, Source: "gmail", ExternalID: "thread-77", Title: "customer follow-up", ActivityDate: "2026-04-14"},
	}
	items := []db.ReportItem{
		{ID: 1, Section: "project_progress", Content: "Handled customer thread-77 and sent response"},
	}

	result := Build(activities, items, nil)
	if len(result.NeedsReview) != 1 {
		t.Fatalf("expected one review item from external id match, got %d", len(result.NeedsReview))
	}
}

func TestSectionRecommendationUsesKeywords(t *testing.T) {
	activities := []db.Activity{
		{ID: 71, Source: "gmail", Title: "todo backlog grooming for next sprint", ActivityDate: "2026-04-14"},
		{ID: 72, Source: "gmail", Title: "blocker and risk on production deploy", ActivityDate: "2026-04-14"},
	}

	result := Build(activities, nil, nil)
	if len(result.DraftCandidates) < 2 {
		t.Fatalf("expected two draft candidates, got %d", len(result.DraftCandidates))
	}

	sections := map[int64]string{}
	for _, candidate := range result.DraftCandidates {
		for _, id := range candidate.ActivityIDs {
			sections[id] = candidate.SuggestedSection
		}
	}

	if sections[71] != "next_week_plan" {
		t.Fatalf("expected next_week_plan recommendation, got %q", sections[71])
	}
	if sections[72] != "issues" {
		t.Fatalf("expected issues recommendation, got %q", sections[72])
	}
}
