package reportinsights

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"openreport/internal/db"
)

var issueKeyPattern = regexp.MustCompile(`(?i)\b[A-Z]+-\d+\b`)
var tokenPattern = regexp.MustCompile(`[a-z0-9]+`)

// Build returns a minimal insight result with ignored activities excluded.
func Build(activities []db.Activity, items []db.ReportItem, ignored map[int64]bool) db.ReportInsights {
	result := db.ReportInsights{
		Summary: db.ReportInsightSummary{},
	}

	for _, activity := range activities {
		if ignored != nil && ignored[activity.ID] {
			continue
		}

		result.Summary.TotalActivities++
		if isLinked(activity, items) {
			result.Summary.LinkedActivities++
			continue
		}

		if isSuspiciouslyCovered(activity, items) {
			result.NeedsReview = append(result.NeedsReview, db.ReportInsightActivity{
				ActivityID:   activity.ID,
				Source:       activity.Source,
				Title:        activity.Title,
				Summary:      activity.Summary,
				ActivityDate: activity.ActivityDate,
			})
			continue
		}

		result.UnlinkedActivities = append(result.UnlinkedActivities, db.ReportInsightActivity{
			ActivityID:   activity.ID,
			Source:       activity.Source,
			Title:        activity.Title,
			Summary:      activity.Summary,
			ActivityDate: activity.ActivityDate,
		})
	}

	result.Summary.UnlinkedActivities = len(result.UnlinkedActivities)
	result.Summary.NeedsReview = len(result.NeedsReview)
	result.DraftCandidates = buildDraftCandidates(result.UnlinkedActivities)
	return result
}

func isLinked(activity db.Activity, items []db.ReportItem) bool {
	for _, item := range items {
		if item.ActivityID != nil && *item.ActivityID == activity.ID {
			return true
		}
	}
	return false
}

func isSuspiciouslyCovered(activity db.Activity, items []db.ReportItem) bool {
	activityTitle := strings.ToLower(activity.Title)
	activityIssueKey := issueKeyPattern.FindString(strings.ToUpper(activity.Title))
	activityExternalID := strings.ToLower(strings.TrimSpace(activity.ExternalID))
	titleTokens := makeTokenSet(activityTitle)

	for _, item := range items {
		content := strings.ToLower(item.Content)

		if activityIssueKey != "" && strings.Contains(strings.ToUpper(item.Content), strings.ToUpper(activityIssueKey)) {
			return true
		}
		if activityExternalID != "" && strings.Contains(content, activityExternalID) {
			return true
		}

		shared := 0
		for token := range makeTokenSet(content) {
			if _, ok := titleTokens[token]; ok {
				shared++
			}
		}
		if shared >= 3 {
			return true
		}
	}

	return false
}

func makeTokenSet(text string) map[string]struct{} {
	set := map[string]struct{}{}
	for _, token := range tokenPattern.FindAllString(strings.ToLower(text), -1) {
		if len(token) < 2 {
			continue
		}
		set[token] = struct{}{}
	}
	return set
}

func buildDraftCandidates(unlinked []db.ReportInsightActivity) []db.ReportInsightDraft {
	if len(unlinked) == 0 {
		return nil
	}

	grouped := map[string][]db.ReportInsightActivity{}
	for _, activity := range unlinked {
		key := groupKey(activity.Source, activity.Title, activity.Summary)
		grouped[key] = append(grouped[key], activity)
	}

	keys := make([]string, 0, len(grouped))
	for key := range grouped {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	candidates := make([]db.ReportInsightDraft, 0, len(keys))
	for _, key := range keys {
		group := grouped[key]
		activityIDs := make([]int64, 0, len(group))
		for _, g := range group {
			activityIDs = append(activityIDs, g.ActivityID)
		}

		section := suggestSection(group[0].Source, group[0].Title, group[0].Summary)
		candidates = append(candidates, db.ReportInsightDraft{
			Key:               key,
			SuggestedSection:  section,
			SuggestedCategory: "",
			SuggestedWorkType: "",
			Content:           fmt.Sprintf("%s related work update", group[0].Title),
			ActivityIDs:       activityIDs,
			Reason:            fmt.Sprintf("grouped %d unlinked activities by topic", len(group)),
		})
	}

	return candidates
}

func groupKey(source, title, summary string) string {
	text := strings.TrimSpace(title)
	if text == "" {
		text = strings.TrimSpace(summary)
	}
	text = strings.ToLower(text)
	text = issueKeyPattern.ReplaceAllString(text, " ")
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		text = "untitled"
	}
	return strings.ToLower(strings.TrimSpace(source)) + "|" + text
}

func suggestSection(source, title, summary string) string {
	s := strings.ToLower(strings.TrimSpace(source))
	text := strings.ToLower(strings.Join([]string{title, summary}, " "))

	if containsAny(text, []string{"todo", "backlog", "next", "next week", "plan", "planned", "follow-up"}) {
		return "next_week_plan"
	}
	if containsAny(text, []string{"risk", "blocker", "blocked", "delay", "incident", "issue", "problem"}) {
		return "issues"
	}

	switch {
	case strings.Contains(s, "calendar"), strings.Contains(s, "meeting"):
		return "attendance"
	case strings.Contains(s, "issue"), strings.Contains(s, "bug"):
		return "project_progress"
	case strings.Contains(s, "mail"):
		return "project_progress"
	default:
		return "other"
	}
}

func containsAny(text string, keywords []string) bool {
	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}
