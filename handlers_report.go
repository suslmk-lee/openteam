package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"openreport/internal/ai"
	"openreport/internal/db"
	"openreport/internal/excel"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// --- User ---

func (a *App) GetCurrentUser() (*db.User, error) {
	return a.report.GetCurrentUser()
}

func (a *App) UpdateUser(name, team string) error {
	return a.report.UpdateUser(name, team)
}

// --- Activities ---

type ActivityWithSource struct {
	db.Activity
	SourceLabel string `json:"sourceLabel"`
	SourceIcon  string `json:"sourceIcon"`
}

func (a *App) GetWeekActivities(weekStart, weekEnd string) ([]ActivityWithSource, error) {
	return a.report.GetWeekActivities(weekStart, weekEnd)
}

func sourceLabel(source string) string {
	labels := map[string]string{
		"naverworks_mail":     "NaverWorks Mail",
		"naverworks_calendar": "NaverWorks Calendar",
		"naverworks_board":    "NaverWorks Board",
		"linear_issue":        "Linear Issue",
		"gmail":               "Gmail",
		"gmail_sent":          "Gmail Sent",
		"gmail_received":      "Gmail Received",
		"google_calendar":     "Google Calendar",
		"kakaotalk":           "Kakaotalk",
		"manual":              "Manual Entry",
	}
	if l, ok := labels[source]; ok {
		return l
	}
	return source
}

func sourceIcon(source string) string {
	icons := map[string]string{
		"naverworks_mail":     "mail",
		"naverworks_calendar": "calendar",
		"naverworks_board":    "clipboard",
		"linear_issue":        "circle-dot",
		"gmail":               "mail",
		"gmail_sent":          "mail",
		"gmail_received":      "mail",
		"google_calendar":     "calendar",
		"kakaotalk":           "message-circle",
		"manual":              "pencil",
	}
	if i, ok := icons[source]; ok {
		return i
	}
	return "file"
}

// --- Weekly Reports ---

func (a *App) GetOrCreateWeeklyReport(weekStart, weekEnd string) (*db.WeeklyReport, error) {
	return a.report.GetOrCreateWeeklyReport(weekStart, weekEnd)
}

func (a *App) ListWeeklyReports() ([]db.WeeklyReport, error) {
	return a.report.ListWeeklyReports()
}

// ListMyWeeklyReports is an alias for ListWeeklyReports for personal dashboard
func (a *App) ListMyWeeklyReports() ([]db.WeeklyReport, error) {
	return a.ListWeeklyReports()
}

func (a *App) GetWeeklyReport(reportID int64) (*db.WeeklyReport, error) {
	return a.report.GetWeeklyReport(reportID)
}

// --- Report Items ---

func (a *App) GetReportItems(reportID int64) ([]db.ReportItem, error) {
	return a.report.GetReportItems(reportID)
}

func (a *App) AddReportItem(reportID int64, section, category, content string, activityID *int64, period string) (*db.ReportItem, error) {
	return a.report.AddReportItem(reportID, section, category, content, activityID, period)
}

func (a *App) UpdateReportItem(item db.ReportItem) error {
	return a.report.UpdateReportItem(item)
}

func (a *App) DeleteReportItem(id int64) error {
	return a.report.DeleteReportItem(id)
}

func (a *App) AddActivityToReport(reportID int64, activityID int64, section, category string) (*db.ReportItem, error) {
	return a.report.AddActivityToReport(reportID, activityID, section, category)
}

func (a *App) GetReportInsights(reportID int64) (*db.ReportInsights, error) {
	return a.report.GetReportInsights(reportID)
}

func (a *App) AcceptInsightActivity(reportID int64, activityID int64, section, category, period string) (*db.ReportItem, error) {
	return a.report.AcceptInsightActivity(reportID, activityID, section, category, period)
}

func (a *App) AcceptInsightDraft(reportID int64, draft db.ReportInsightDraft, period string) ([]db.ReportItem, error) {
	return a.report.AcceptInsightDraft(reportID, draft, period)
}

func (a *App) IgnoreInsightActivity(reportID int64, activityID int64) error {
	return a.report.IgnoreInsightActivity(reportID, activityID)
}

// PopulateReportFromTeamData auto-populates a report with team data (attendance, projects, utilization)
func (a *App) PopulateReportFromTeamData(reportID int64) (int, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return 0, err
	}

	report, err := a.database.GetWeeklyReport(reportID)
	if err != nil {
		return 0, err
	}

	// Check existing items to avoid duplicates
	existingItems, err := a.database.ListReportItems(reportID)
	if err != nil {
		return 0, err
	}
	existingContentSet := make(map[string]bool)
	for _, item := range existingItems {
		existingContentSet[item.Section+"|"+item.Content] = true
	}

	addedCount := 0
	addItem := func(section, category, content, workType, period string) {
		key := section + "|" + content
		if existingContentSet[key] {
			return
		}
		item := &db.ReportItem{
			ReportID:   reportID,
			Section:    section,
			Category:   category,
			WorkType:   workType,
			Content:    content,
			Period:     period,
			SortOrder:  len(existingItems) + addedCount,
			IsSelected: true,
		}
		if _, err := a.database.SaveReportItem(item); err != nil {
			log.Printf("[PopulateReport] Failed to save item: %v", err)
			return
		}
		existingContentSet[key] = true
		addedCount++
	}

	// 1. Attendance records for the week - show individual dates
	records, err := a.database.GetAttendanceRecords(user.ID, report.WeekStart, report.WeekEnd)
	if err != nil {
		log.Printf("[PopulateReport] Attendance records error: %v", err)
	} else {
		// Group by team member
		memberRecords := make(map[int64][]db.AttendanceRecord)
		for _, r := range records {
			memberRecords[r.TeamMemberID] = append(memberRecords[r.TeamMemberID], r)
		}

		// Format each member's attendance as date list
		attendanceLines := []string{}
		for _, recs := range memberRecords {
			if len(recs) == 0 {
				continue
			}
			memberName := recs[0].TeamMemberName

			// Format dates
			dateParts := []string{}
			for _, r := range recs {
				// Parse date - handle both "2006-01-02" and "2006-01-02T00:00:00Z" formats
				dateStr := r.RecordDate
				if idx := strings.Index(dateStr, "T"); idx != -1 {
					dateStr = dateStr[:idx]
				}

				date, parseErr := time.Parse("2006-01-02", dateStr)
				if parseErr == nil {
					weekday := []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}[date.Weekday()]
					dateStr = fmt.Sprintf("%04d/%02d/%02d(%s)", date.Year(), date.Month(), date.Day(), weekday)
				}

				switch r.Type {
				case "vacation":
					dateParts = append(dateParts, dateStr+" [Vacation]")
				case "morning_half":
					dateParts = append(dateParts, dateStr+" [Half Day AM]")
				case "afternoon_half":
					dateParts = append(dateParts, dateStr+" [Half Day PM]")
				}
			}

			if len(dateParts) > 0 {
				// Group by member
				attendanceLines = append(attendanceLines,
					fmt.Sprintf("%s: %s", memberName, strings.Join(dateParts, ", ")))
			}
		}

		if len(attendanceLines) > 0 {
			content := strings.Join(attendanceLines, "\n")
			addItem("attendance", "洹쇳깭?꾪솴", content, "", "this_week")
		}
	}

	// 2. Active projects ??project_progress section (both SI and SM)
	projects, err := a.database.ListProjectsWithClient(user.ID, "")
	if err != nil {
		log.Printf("[PopulateReport] Projects error: %v", err)
	} else {
		statusLabel := map[string]string{
			"preparing":      "preparing",
			"poc_proposal":   "PoC Proposal",
			"in_development": "in development",
			"in_operation":   "in operation",
			"closed":         "closed",
		}
		for _, p := range projects {
			if p.Status == "closed" {
				continue
			}
			label := statusLabel[p.Status]
			if label == "" {
				label = p.Status
			}
			client := p.ClientName
			if client == "" {
				client = "Unknown"
			}
			content := fmt.Sprintf("[%s] %s (%s) - %s", label, p.Name, client, p.Description)
			if p.Description == "" {
				content = fmt.Sprintf("[%s] %s (%s)", label, p.Name, client)
			}
			// Use project's actual TeamType (si or sm)
			workType := p.TeamType
			if workType == "" {
				workType = "si" // default fallback
			}
			addItem("project_progress", p.Name, content, workType, "this_week")
		}
	}

	// 3. SI utilization snapshot
	snapshot, err := a.database.GetSIWeeklySnapshot(user.ID, report.WeekStart, report.WeekEnd)
	if err != nil {
		log.Printf("[PopulateReport] Snapshot error: %v", err)
	} else if snapshot != nil {
		utilizationContent := fmt.Sprintf("Utilization: %.0f%%, Unassigned: %d", snapshot.TeamUtilizationPercent, snapshot.UnassignedCount)
		addItem("other", "Utilization", utilizationContent, "sm", "this_week")
	}

	log.Printf("[PopulateReport] Added %d items to report %d", addedCount, reportID)
	return addedCount, nil
}

func inferWorkType(section, category, content string) string {
	text := strings.ToLower(strings.Join([]string{section, category, content}, " "))

	smKeywords := []string{"sm", "support", "help", "ticket", "helpdesk", "dooray", "inquiry", "customer", "issue", "incident"}
	for _, kw := range smKeywords {
		if strings.Contains(text, kw) {
			return "sm"
		}
	}

	siKeywords := []string{"si", "project", "development", "milestone", "delivery", "poc"}
	for _, kw := range siKeywords {
		if strings.Contains(text, kw) {
			return "si"
		}
	}

	if section == "attendance" || section == "hiring" {
		return "sm"
	}

	return "si"
}

func isMailSource(source string) bool {
	s := strings.ToLower(source)
	return strings.Contains(s, "mail") || strings.HasPrefix(s, "gmail_")
}

type openAIIntegrationConfig struct {
	APIKey string `json:"apiKey"`
	Model  string `json:"model"`
}

func (a *App) generateAIReportContent(activity *db.Activity, section, category string) (string, error) {
	cfg, err := a.getOpenAIConfig()
	if err != nil {
		return "", err
	}
	if cfg == nil {
		return "", nil
	}

	return a.generateAIReportContentWithConfig(cfg, activity, section, category)
}

func (a *App) generateAIReportContentWithConfig(cfg *openAIIntegrationConfig, activity *db.Activity, section, category string) (string, error) {
	client := ai.NewClient(cfg.APIKey, cfg.Model)
	result, err := client.GenerateReportSentence(activity.Source, section, category, activity.Title, activity.Summary, activity.ActivityDate)
	if err != nil {
		return "", err
	}
	a.trackOpenAIUsageFromClient(client, "report_generation")
	return result, nil
}

type activityTopicGroup struct {
	base       *db.ReportItem
	members    []*db.ReportItem
	activities []db.Activity
	topic      string
}

var issueKeyPattern = regexp.MustCompile(`(?i)\b([a-z][a-z0-9]+-\d+)\b`)

func extractTopicIdentifier(act db.Activity) string {
	title := strings.TrimSpace(act.Title)
	if m := issueKeyPattern.FindStringSubmatch(title); len(m) > 1 {
		return strings.ToLower(m[1])
	}

	if strings.TrimSpace(act.RawData) != "" {
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(act.RawData), &obj); err == nil {
			for _, key := range []string{"threadId", "thread_id", "conversationId", "conversation_id", "issueId", "issue_id", "ticketId", "ticket_id", "parentId", "parent_id"} {
				if v, ok := obj[key]; ok {
					if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
						return strings.ToLower(strings.TrimSpace(s))
					}
				}
			}
		}
	}

	source := strings.ToLower(strings.TrimSpace(act.Source))
	if act.ExternalID != "" {
		toolLikeIssue := strings.Contains(source, "linear") || strings.Contains(source, "jira") || strings.Contains(source, "github") || strings.Contains(source, "gitlab") || strings.Contains(source, "asana") || strings.Contains(source, "trello") || strings.Contains(source, "clickup") || strings.Contains(source, "notion")
		if toolLikeIssue {
			return strings.ToLower(strings.TrimSpace(act.ExternalID))
		}
	}

	return ""
}

func normalizeActivityTopic(source, title, summary string) string {
	text := strings.ToLower(strings.TrimSpace(title))
	if text == "" {
		text = strings.ToLower(strings.TrimSpace(summary))
	}
	if text == "" {
		return "untitled"
	}

	for {
		before := text
		for _, prefix := range []string{"re:", "fw:", "fwd:", "?듭옣:", "?뚯떊:", "[external]", "[?몃?]", "[怨듭?]"} {
			if strings.HasPrefix(text, prefix) {
				text = strings.TrimSpace(strings.TrimPrefix(text, prefix))
			}
		}
		if before == text {
			break
		}
	}

	replacer := strings.NewReplacer("[", " ", "]", " ", "(", " ", ")", " ", "{", " ", "}", " ", "_", " ", "-", " ", ":", " ", "|", " ")
	text = replacer.Replace(text)
	words := strings.Fields(text)
	if len(words) == 0 {
		return "untitled"
	}
	if len(words) > 10 {
		words = words[:10]
	}
	return strings.Join([]string{strings.ToLower(strings.TrimSpace(source)), strings.Join(words, " ")}, "|")
}

func buildActivityDigest(act db.Activity) string {
	title := strings.TrimSpace(strings.ReplaceAll(act.Title, "\n", " "))
	summary := strings.TrimSpace(strings.ReplaceAll(act.Summary, "\n", " "))
	if summary == "" {
		summary = "(?붿빟 ?놁쓬)"
	}
	if title == "" {
		title = "(?쒕ぉ ?놁쓬)"
	}
	return fmt.Sprintf("[%s] %s | ?쒕ぉ: %s | ?붿빟: %s", act.Source, act.ActivityDate, title, summary)
}

func (a *App) consolidateSelectedActivityItemsWithAI(reportID int64, cfg *openAIIntegrationConfig) (int, int, error) {
	items, err := a.database.ListReportItems(reportID)
	if err != nil {
		return 0, 0, err
	}

	activities, err := a.database.ListActivities("2000-01-01", "2099-12-31")
	if err != nil {
		return 0, 0, err
	}

	activityMap := make(map[int64]db.Activity, len(activities))
	for _, act := range activities {
		activityMap[act.ID] = act
	}

	groups := make(map[string]*activityTopicGroup)
	for i := range items {
		item := &items[i]
		if !item.IsSelected || item.ActivityID == nil {
			continue
		}

		act, ok := activityMap[*item.ActivityID]
		if !ok {
			continue
		}

		topicID := extractTopicIdentifier(act)
		topic := normalizeActivityTopic(act.Source, act.Title, act.Summary)
		if topicID != "" {
			topic = strings.Join([]string{strings.ToLower(strings.TrimSpace(act.Source)), "id", topicID}, "|")
		}
		groupKey := strings.Join([]string{item.Section, item.Category, item.WorkType, topic}, "|")

		grp, exists := groups[groupKey]
		if !exists {
			grp = &activityTopicGroup{
				base:    item,
				topic:   topic,
				members: []*db.ReportItem{},
			}
			groups[groupKey] = grp
		}

		grp.members = append(grp.members, item)
		grp.activities = append(grp.activities, act)
	}

	client := ai.NewClient(cfg.APIKey, cfg.Model)
	updated := 0
	merged := 0

	for _, grp := range groups {
		if len(grp.members) == 0 {
			continue
		}

		sort.Slice(grp.activities, func(i, j int) bool {
			return grp.activities[i].ActivityDate < grp.activities[j].ActivityDate
		})

		var content string
		if len(grp.activities) == 1 {
			generated, err := a.generateAIReportContentWithConfig(cfg, &grp.activities[0], grp.base.Section, grp.base.Category)
			if err != nil {
				log.Printf("[openai] single activity preprocessing failed for activity %d: %v", grp.activities[0].ID, err)
				content = grp.base.Content
			} else {
				content = generated
			}
		} else {
			digests := make([]string, 0, len(grp.activities))
			for _, act := range grp.activities {
				digests = append(digests, buildActivityDigest(act))
			}

			generated, err := client.GenerateGroupedReportSentence(grp.base.Section, grp.base.Category, grp.topic, digests)
			if err != nil {
				log.Printf("[openai] grouped preprocessing failed (topic=%s, items=%d): %v", grp.topic, len(grp.activities), err)
				content = grp.base.Content
			} else {
				a.trackOpenAIUsageFromClient(client, "report_consolidation")
				content = generated
			}
		}

		content = normalizeNarrativeContent(content)
		if strings.TrimSpace(content) == "" {
			content = grp.base.Content
		}

		if grp.base.WorkType == "" {
			grp.base.WorkType = inferWorkType(grp.base.Section, grp.base.Category, content)
		}

		if len(grp.members) > 1 {
			grp.base.ActivityID = nil
		}

		grp.base.Content = content
		if _, err := a.database.SaveReportItem(grp.base); err != nil {
			log.Printf("[openai] failed to save consolidated item %d: %v", grp.base.ID, err)
			continue
		}
		updated++

		if len(grp.members) > 1 {
			for i := 1; i < len(grp.members); i++ {
				if err := a.database.DeleteReportItem(grp.members[i].ID); err != nil {
					log.Printf("[openai] failed to delete merged item %d: %v", grp.members[i].ID, err)
					continue
				}
				merged++
			}
		}
	}

	return updated, merged, nil
}

func (a *App) regenerateSelectedMailItemsForExport(items []db.ReportItem) ([]db.ReportItem, int) {
	cfg, err := a.getOpenAIConfig()
	if err != nil {
		log.Printf("[openai] config read failed: %v", err)
		return items, 0
	}
	if cfg == nil {
		return items, 0
	}

	activities, err := a.database.ListActivities("2000-01-01", "2099-12-31")
	if err != nil {
		log.Printf("[openai] failed to load activities for export regeneration: %v", err)
		return items, 0
	}

	activityMap := make(map[int64]db.Activity, len(activities))
	for _, act := range activities {
		activityMap[act.ID] = act
	}

	updated := 0
	for i := range items {
		item := &items[i]
		if !item.IsSelected || item.ActivityID == nil {
			continue
		}

		act, ok := activityMap[*item.ActivityID]
		if !ok || !isMailSource(act.Source) {
			continue
		}

		generated, err := a.generateAIReportContentWithConfig(cfg, &act, item.Section, item.Category)
		if err != nil {
			log.Printf("[openai] export regeneration failed for activity %d: %v", act.ID, err)
			continue
		}
		generated = normalizeNarrativeContent(generated)
		if strings.TrimSpace(generated) == "" || generated == item.Content {
			continue
		}

		item.Content = generated
		if _, err := a.database.SaveReportItem(item); err != nil {
			log.Printf("[openai] failed to persist regenerated content for report item %d: %v", item.ID, err)
			continue
		}
		updated++
	}

	if updated > 0 {
		log.Printf("[openai] regenerated %d selected mail report items before export", updated)
	}

	return items, updated
}

func normalizeNarrativeContent(content string) string {
	text := strings.TrimSpace(content)
	if text == "" {
		return ""
	}

	text = strings.ReplaceAll(text, "\\n", "\n")
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	lines := []string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	if len(lines) == 0 {
		return ""
	}

	// Check if content is already in new format with " - 吏꾪뻾?ы빆 :" and " - ?꾩냽議곗튂 :"
	hasNewFormat := false
	if len(lines) >= 3 {
		for i := 1; i < len(lines); i++ {
			if strings.Contains(lines[i], " - 吏꾪뻾?ы빆") || strings.Contains(lines[i], " - ?꾩냽議곗튂") {
				hasNewFormat = true
				break
			}
		}
	}

	if hasNewFormat {
		// Already in new format, return as-is
		return strings.Join(lines, "\n")
	}

	// Handle old format or unformatted content
	// For new format, we should have: projectName, " - 吏꾪뻾?ы빆 : ...", " - ?꾩냽議곗튂 : ..."
	// If content is single line or doesn't have the markers, rebuild it

	if len(lines) == 1 {
		// Single line: assume it's project activity, create both lines
		return lines[0] + "\n - 吏꾪뻾?ы빆 : (吏꾪뻾 以?\n - ?꾩냽議곗튂 : ?꾩냽 議곗튂 ?꾩슂"
	}

	if len(lines) == 2 {
		// Two lines: first is project name, second is activity
		return lines[0] + "\n - 吏꾪뻾?ы빆 : " + lines[1] + "\n - ?꾩냽議곗튂 : ?꾩냽 議곗튂 ?꾩슂"
	}

	// Three or more lines: first is project name, second is activity, third+ is follow-up
	return lines[0] + "\n - 吏꾪뻾?ы빆 : " + lines[1] + "\n - ?꾩냽議곗튂 : " + strings.Join(lines[2:], " ")
}

func (a *App) PreprocessReportItemsWithAI(reportID int64) SyncResult {
	cfg, err := a.getOpenAIConfig()
	if err != nil {
		return SyncResult{Success: false, Count: 0, Message: fmt.Sprintf("OpenAI ?ㅼ젙 議고쉶 ?ㅽ뙣: %v", err)}
	}
	if cfg == nil {
		return SyncResult{Success: false, Count: 0, Message: "OpenAI ?ㅼ젙??鍮꾪솢?깊솕?섏뼱 ?덉뒿?덈떎"}
	}

	updated, merged, err := a.consolidateSelectedActivityItemsWithAI(reportID, cfg)
	if err != nil {
		return SyncResult{Success: false, Count: 0, Message: fmt.Sprintf("AI 痍⑦빀 ?꾩쿂由??ㅽ뙣: %v", err)}
	}

	msg := fmt.Sprintf("AI preprocessing done (updated %d", updated)
	if merged > 0 {
		msg += fmt.Sprintf(", merged %d", merged)
	}
	msg += ")"
	return SyncResult{Success: true, Count: updated, Message: msg}
}

func (a *App) getOpenAIConfig() (*openAIIntegrationConfig, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}

	intg, err := a.database.GetIntegrationByType(user.ID, "openai")
	if err != nil {
		return nil, err
	}
	if intg == nil || !intg.Enabled {
		return nil, nil
	}

	var cfg openAIIntegrationConfig
	if err := json.Unmarshal([]byte(intg.ConfigJSON), &cfg); err != nil {
		return nil, fmt.Errorf("invalid openai config json: %w", err)
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, nil
	}
	if strings.TrimSpace(cfg.Model) == "" {
		cfg.Model = "gpt-4o-mini"
	}
	return &cfg, nil
}

// RefineMarkdownWithAI sends the markdown report to OpenAI for polishing.
// It returns the refined markdown. Original ReportItems are not modified.
func (a *App) RefineMarkdownWithAI(markdownText string) (string, error) {
	cfg, err := a.getOpenAIConfig()
	if err != nil {
		return "", fmt.Errorf("OpenAI ?ㅼ젙 議고쉶 ?ㅽ뙣: %w", err)
	}
	if cfg == nil {
		return "", fmt.Errorf("OpenAI API Key媛 ?ㅼ젙?섏? ?딆븯?듬땲?? ?ㅼ젙 > ?곕룞 ?ㅼ젙?먯꽌 OpenAI瑜??깅줉?댁＜?몄슂.")
	}

	systemPrompt := "?뱀떊? ?쒓뎅???낅Т 蹂닿퀬???묒꽦 ?꾨Ц媛?낅땲?? 二쇱뼱吏?二쇨컙?낅Т蹂닿퀬??留덊겕?ㅼ슫???먯뿰?ㅻ읇怨?媛꾧껐???쒓뎅??蹂닿퀬?쒖껜濡??ㅻ벉?댁＜?몄슂. 留덊겕?ㅼ슫 援ъ“(##, - ????洹몃?濡??좎??섍퀬 ?댁슜留?援먯젙?⑸땲?? ?먮낯???녿뒗 ?댁슜??異붽??섏? 留덉꽭??"

	client := ai.NewClient(cfg.APIKey, cfg.Model)
	refined, err := client.ChatCompletion(systemPrompt, markdownText)
	if err != nil {
		return "", fmt.Errorf("AI ?ㅻ벉湲??ㅽ뙣: %w", err)
	}
	a.trackOpenAIUsageFromClient(client, "report_refine")
	return refined, nil
}

// --- Excel Template ---

func (a *App) UploadExcelTemplate() (string, error) {
	selection, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Excel ?쒗뵆由??좏깮",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Excel Files", Pattern: "*.xlsx;*.xls"},
		},
	})
	if err != nil {
		return "", err
	}
	if selection == "" {
		return "", nil
	}

	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return "", err
	}

	destDir := filepath.Join(a.dataDir, "templates")
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", err
	}

	destPath := filepath.Join(destDir, filepath.Base(selection))
	if err := copyFile(selection, destPath); err != nil {
		return "", fmt.Errorf("failed to copy template: %w", err)
	}

	ts, err := excel.ParseTemplate(destPath)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	structJSON, err := excel.StructureToJSON(ts)
	if err != nil {
		return "", err
	}

	tmpl := &db.ExcelTemplate{
		UserID:        user.ID,
		Name:          filepath.Base(selection),
		FilePath:      destPath,
		StructureJSON: structJSON,
	}

	_, err = a.database.SaveExcelTemplate(tmpl)
	if err != nil {
		return "", err
	}

	log.Printf("Template uploaded: %s (%d sheets)", tmpl.Name, len(ts.Sheets))
	return structJSON, nil
}

func (a *App) GetExcelTemplate() (*db.ExcelTemplate, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.GetExcelTemplate(user.ID)
}

func (a *App) UploadExcelTemplateForType(teamType string) (string, error) {
	if teamType == "" {
		teamType = "default"
	}
	selection, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Excel ?쒗뵆由??좏깮",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Excel Files", Pattern: "*.xlsx;*.xls"},
		},
	})
	if err != nil {
		return "", err
	}
	if selection == "" {
		return "", nil
	}

	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return "", err
	}

	destDir := filepath.Join(a.dataDir, "templates")
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", err
	}

	destName := fmt.Sprintf("%s_%s", teamType, filepath.Base(selection))
	destPath := filepath.Join(destDir, destName)
	if err := copyFile(selection, destPath); err != nil {
		return "", fmt.Errorf("failed to copy template: %w", err)
	}

	ts, err := excel.ParseTemplate(destPath)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	structJSON, err := excel.StructureToJSON(ts)
	if err != nil {
		return "", err
	}

	// Find existing template for this teamType to update instead of insert
	existing, _ := a.database.GetExcelTemplateByType(user.ID, teamType)
	tmpl := &db.ExcelTemplate{
		UserID:        user.ID,
		TeamType:      teamType,
		Name:          filepath.Base(selection),
		FilePath:      destPath,
		StructureJSON: structJSON,
	}
	if existing != nil {
		tmpl.ID = existing.ID
	}

	_, err = a.database.SaveExcelTemplate(tmpl)
	if err != nil {
		return "", err
	}

	log.Printf("Template uploaded for teamType=%s: %s", teamType, tmpl.Name)
	return structJSON, nil
}

func (a *App) GetExcelTemplateForType(teamType string) (*db.ExcelTemplate, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.GetExcelTemplateByType(user.ID, teamType)
}

// --- Excel Export ---

func (a *App) ExportWeeklyReport(reportID int64) (string, error) {
	return a.report.ExportWeeklyReport(reportID)
}
