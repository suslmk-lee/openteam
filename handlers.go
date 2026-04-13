package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"

	"openreport/internal/ai"
	"openreport/internal/db"
	"openreport/internal/excel"
	"openreport/internal/integrations"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// --- User ---

func (a *App) GetCurrentUser() (*db.User, error) {
	return a.database.GetOrCreateDefaultUser()
}

func (a *App) UpdateUser(name, team string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.ExecRaw("UPDATE users SET name=?, team=? WHERE id=?", name, team, user.ID)
}

// --- Activities ---

type ActivityWithSource struct {
	db.Activity
	SourceLabel string `json:"sourceLabel"`
	SourceIcon  string `json:"sourceIcon"`
}

func (a *App) GetWeekActivities(weekStart, weekEnd string) ([]ActivityWithSource, error) {
	log.Printf("[GetWeekActivities] Called with range: %s ~ %s", weekStart, weekEnd)
	activities, err := a.database.ListActivities(weekStart, weekEnd)
	if err != nil {
		return nil, err
	}

	var result []ActivityWithSource
	calendarCount := 0
	for _, act := range activities {
		aws := ActivityWithSource{
			Activity:    act,
			SourceLabel: sourceLabel(act.Source),
			SourceIcon:  sourceIcon(act.Source),
		}
		result = append(result, aws)
		if act.Source == "google_calendar" {
			calendarCount++
			log.Printf("[GetWeekActivities] Calendar activity: ID=%d, Title=%s, Date=%s", act.ID, act.Title, act.ActivityDate)
		}
	}
	log.Printf("[GetWeekActivities] Total: %d activities, Calendar: %d", len(result), calendarCount)
	return result, nil
}

func sourceLabel(source string) string {
	labels := map[string]string{
		"naverworks_mail":     "NaverWorks 메일",
		"naverworks_calendar": "NaverWorks 캘린더",
		"naverworks_board":    "NaverWorks 게시판",
		"linear_issue":        "Linear 이슈",
		"gmail":               "Gmail",
		"gmail_sent":          "Gmail 발신",
		"gmail_received":      "Gmail 수신",
		"google_calendar":     "Google 캘린더",
		"kakaotalk":           "카카오톡",
		"manual":              "수동 입력",
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
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}

	report, err := a.database.GetWeeklyReportByWeek(user.ID, weekStart)
	if err != nil {
		return nil, err
	}
	if report != nil {
		return report, nil
	}

	id, err := a.database.CreateWeeklyReport(user.ID, weekStart, weekEnd)
	if err != nil {
		return nil, err
	}

	// Carry over next_week items from previous report → this_week
	prevReport, err := a.database.GetPreviousWeekReport(user.ID, weekStart)
	if err != nil {
		log.Printf("[CarryOver] Error finding previous report: %v", err)
	} else if prevReport != nil {
		nextWeekItems, err := a.database.ListReportItemsByPeriod(prevReport.ID, "next_week")
		if err != nil {
			log.Printf("[CarryOver] Error listing prev next_week items: %v", err)
		} else {
			for i, item := range nextWeekItems {
				carried := &db.ReportItem{
					ReportID:   id,
					Section:    item.Section,
					Category:   item.Category,
					WorkType:   item.WorkType,
					Content:    item.Content,
					Period:     "this_week",
					SortOrder:  i,
					IsSelected: true,
				}
				if _, err := a.database.SaveReportItem(carried); err != nil {
					log.Printf("[CarryOver] Failed to carry over item %d: %v", item.ID, err)
				}
			}
			if len(nextWeekItems) > 0 {
				log.Printf("[CarryOver] Carried over %d items from report %d to %d", len(nextWeekItems), prevReport.ID, id)
			}
		}
	}

	return a.database.GetWeeklyReport(id)
}

func (a *App) ListWeeklyReports() ([]db.WeeklyReport, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.ListWeeklyReports(user.ID)
}

func (a *App) GetWeeklyReport(reportID int64) (*db.WeeklyReport, error) {
	return a.database.GetWeeklyReport(reportID)
}

// --- Report Items ---

func (a *App) GetReportItems(reportID int64) ([]db.ReportItem, error) {
	return a.database.ListReportItems(reportID)
}

func (a *App) AddReportItem(reportID int64, section, category, content string, activityID *int64, period string) (*db.ReportItem, error) {
	if period == "" {
		period = "this_week"
	}
	items, err := a.database.ListReportItems(reportID)
	if err != nil {
		return nil, err
	}
	sortOrder := len(items)
	workType := inferWorkType(section, category, content)

	item := &db.ReportItem{
		ReportID:   reportID,
		ActivityID: activityID,
		Section:    section,
		Category:   category,
		WorkType:   workType,
		Content:    content,
		Period:     period,
		SortOrder:  sortOrder,
		IsSelected: true,
	}

	id, err := a.database.SaveReportItem(item)
	if err != nil {
		return nil, err
	}
	item.ID = id
	return item, nil
}

func (a *App) UpdateReportItem(item db.ReportItem) error {
	log.Printf("[UpdateReportItem] Updating item %d: content=%.50s..., section=%s, category=%s",
		item.ID, item.Content, item.Section, item.Category)
	_, err := a.database.SaveReportItem(&item)
	if err != nil {
		log.Printf("[UpdateReportItem] Failed to save item %d: %v", item.ID, err)
	} else {
		log.Printf("[UpdateReportItem] Successfully saved item %d", item.ID)
	}
	return err
}

func (a *App) DeleteReportItem(id int64) error {
	return a.database.DeleteReportItem(id)
}

func (a *App) AddActivityToReport(reportID int64, activityID int64, section, category string) (*db.ReportItem, error) {
	// Check if this activity is already added to the report
	existingItems, err := a.database.ListReportItems(reportID)
	if err != nil {
		return nil, err
	}
	for _, item := range existingItems {
		if item.ActivityID != nil && *item.ActivityID == activityID {
			log.Printf("[AddActivityToReport] Activity %d already exists in report %d, skipping duplicate", activityID, reportID)
			return nil, fmt.Errorf("이미 추가된 활동입니다")
		}
	}

	activities, err := a.database.ListActivities("2000-01-01", "2099-12-31")
	if err != nil {
		return nil, err
	}

	var activity *db.Activity
	for _, act := range activities {
		if act.ID == activityID {
			activity = &act
			break
		}
	}
	if activity == nil {
		return nil, fmt.Errorf("activity not found: %d", activityID)
	}

	content := activity.Title
	if activity.Summary != "" && activity.Title != "" {
		content = activity.Title + "\n" + activity.Summary
	} else if activity.Summary != "" {
		content = activity.Summary
	}

	generated, err := a.generateAIReportContent(activity, section, category)
	if err != nil {
		log.Printf("[openai] failed to generate report content for activity %d: %v", activity.ID, err)
	} else if generated != "" {
		content = normalizeNarrativeContent(generated)
	}

	item, err := a.AddReportItem(reportID, section, category, content, &activityID, "this_week")
	if err != nil {
		return nil, err
	}

	if item.WorkType == "" {
		item.WorkType = inferWorkType(section, category, content)
		_, _ = a.database.SaveReportItem(item)
	}

	return item, nil
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
					weekday := []string{"일", "월", "화", "수", "목", "금", "토"}[date.Weekday()]
					dateStr = fmt.Sprintf("%04d/%02d/%02d(%s)", date.Year(), date.Month(), date.Day(), weekday)
				}

				switch r.Type {
				case "vacation":
					dateParts = append(dateParts, dateStr+" 연차")
				case "morning_half":
					dateParts = append(dateParts, dateStr+" 오전반차")
				case "afternoon_half":
					dateParts = append(dateParts, dateStr+" 오후반차")
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
			addItem("attendance", "근태현황", content, "", "this_week")
		}
	}

	// 2. Active projects → project_progress section (both SI and SM)
	projects, err := a.database.ListProjectsWithClient(user.ID, "")
	if err != nil {
		log.Printf("[PopulateReport] Projects error: %v", err)
	} else {
		statusLabel := map[string]string{
			"preparing":      "준비중",
			"poc_proposal":   "PoC/제안",
			"in_development": "개발중",
			"in_operation":   "운영중",
			"closed":         "종료",
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
				client = "내부"
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
		utilizationContent := fmt.Sprintf("팀 가동률: %.0f%%, 미배치 인원: %d명",
			snapshot.TeamUtilizationPercent, snapshot.UnassignedCount)
		addItem("other", "인원현황", utilizationContent, "sm", "this_week")
	}

	log.Printf("[PopulateReport] Added %d items to report %d", addedCount, reportID)
	return addedCount, nil
}

func inferWorkType(section, category, content string) string {
	text := strings.ToLower(strings.Join([]string{section, category, content}, " "))

	smKeywords := []string{"운영", "유지보수", "지원", "장애", "문의", "헬프", "helpdesk", "dooray", "모니터링", "sm"}
	for _, kw := range smKeywords {
		if strings.Contains(text, kw) {
			return "sm"
		}
	}

	siKeywords := []string{"si", "프로젝트", "구축", "개발", "고도화", "전개", "개선", "도입", "설계", "구현", "poc"}
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
	return client.GenerateReportSentence(activity.Source, section, category, activity.Title, activity.Summary, activity.ActivityDate)
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
		for _, prefix := range []string{"re:", "fw:", "fwd:", "답장:", "회신:", "[external]", "[외부]", "[공지]"} {
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
		summary = "(요약 없음)"
	}
	if title == "" {
		title = "(제목 없음)"
	}
	return fmt.Sprintf("[%s] %s | 제목: %s | 요약: %s", act.Source, act.ActivityDate, title, summary)
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

	// Check if content is already in new format with " - 진행사항 :" and " - 후속조치 :"
	hasNewFormat := false
	if len(lines) >= 3 {
		for i := 1; i < len(lines); i++ {
			if strings.Contains(lines[i], " - 진행사항") || strings.Contains(lines[i], " - 후속조치") {
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
	// For new format, we should have: projectName, " - 진행사항 : ...", " - 후속조치 : ..."
	// If content is single line or doesn't have the markers, rebuild it

	if len(lines) == 1 {
		// Single line: assume it's project activity, create both lines
		return lines[0] + "\n - 진행사항 : (진행 중)\n - 후속조치 : 후속 조치 필요"
	}

	if len(lines) == 2 {
		// Two lines: first is project name, second is activity
		return lines[0] + "\n - 진행사항 : " + lines[1] + "\n - 후속조치 : 후속 조치 필요"
	}

	// Three or more lines: first is project name, second is activity, third+ is follow-up
	return lines[0] + "\n - 진행사항 : " + lines[1] + "\n - 후속조치 : " + strings.Join(lines[2:], " ")
}

func (a *App) PreprocessReportItemsWithAI(reportID int64) SyncResult {
	cfg, err := a.getOpenAIConfig()
	if err != nil {
		return SyncResult{Success: false, Count: 0, Message: fmt.Sprintf("OpenAI 설정 조회 실패: %v", err)}
	}
	if cfg == nil {
		return SyncResult{Success: false, Count: 0, Message: "OpenAI 설정이 비활성화되어 있습니다"}
	}

	updated, merged, err := a.consolidateSelectedActivityItemsWithAI(reportID, cfg)
	if err != nil {
		return SyncResult{Success: false, Count: 0, Message: fmt.Sprintf("AI 취합 전처리 실패: %v", err)}
	}

	msg := fmt.Sprintf("AI 취합 전처리 완료 (업데이트 %d개", updated)
	if merged > 0 {
		msg += fmt.Sprintf(", 병합 %d개", merged)
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
		return "", fmt.Errorf("OpenAI 설정 조회 실패: %w", err)
	}
	if cfg == nil {
		return "", fmt.Errorf("OpenAI API Key가 설정되지 않았습니다. 설정 > 연동 설정에서 OpenAI를 등록해주세요.")
	}

	systemPrompt := "당신은 한국어 업무 보고서 작성 전문가입니다. 주어진 주간업무보고서 마크다운을 자연스럽고 간결한 한국어 보고서체로 다듬어주세요. 마크다운 구조(##, - 등)는 그대로 유지하고 내용만 교정합니다. 원본에 없는 내용을 추가하지 마세요."

	client := ai.NewClient(cfg.APIKey, cfg.Model)
	refined, err := client.ChatCompletion(systemPrompt, markdownText)
	if err != nil {
		return "", fmt.Errorf("AI 다듬기 실패: %w", err)
	}
	return refined, nil
}

// --- Excel Template ---

func (a *App) UploadExcelTemplate() (string, error) {
	selection, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Excel 템플릿 선택",
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
		Title: "Excel 템플릿 선택",
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
	log.Printf("ExportWeeklyReport called with reportID: %d", reportID)

	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("Export error - GetOrCreateDefaultUser: %v", err)
		return "", err
	}

	profile, _ := a.database.GetTeamProfile(user.ID)
	teamType := "default"
	if profile != nil && profile.TeamType != "" {
		teamType = profile.TeamType
	}
	tmpl, err := a.database.GetExcelTemplateByType(user.ID, teamType)
	if err != nil {
		log.Printf("Export error - GetExcelTemplate: %v", err)
		return "", fmt.Errorf("템플릿 조회 실패: %w", err)
	}
	if tmpl == nil {
		log.Println("Export error - no template found")
		return "", fmt.Errorf("Excel 템플릿이 없습니다. 설정에서 먼저 업로드해주세요.")
	}
	log.Printf("Using template: %s (path: %s)", tmpl.Name, tmpl.FilePath)

	report, err := a.database.GetWeeklyReport(reportID)
	if err != nil {
		log.Printf("Export error - GetWeeklyReport: %v", err)
		return "", fmt.Errorf("보고서 조회 실패: %w", err)
	}

	items, err := a.database.ListReportItems(reportID)
	if err != nil {
		log.Printf("Export error - ListReportItems: %v", err)
		return "", err
	}
	log.Printf("Report items: %d total", len(items))

	// Group items by section, splitting content by period (this_week / next_week)
	type itemKey struct {
		section  string
		category string
		workType string
	}
	// Track merged items: same section+category → combine this_week and next_week content
	mergedMap := make(map[itemKey]*excel.ReportItem)
	var mergedKeys []itemKey
	sectionSet := make(map[string]bool)
	var sectionOrder []string

	for _, item := range items {
		if !item.IsSelected {
			continue
		}
		if item.WorkType == "" {
			item.WorkType = inferWorkType(item.Section, item.Category, item.Content)
		}
		if !sectionSet[item.Section] {
			sectionSet[item.Section] = true
			sectionOrder = append(sectionOrder, item.Section)
		}

		key := itemKey{section: item.Section, category: item.Category, workType: item.WorkType}
		merged, exists := mergedMap[key]
		if !exists {
			merged = &excel.ReportItem{
				Category: item.Category,
				WorkType: item.WorkType,
			}
			mergedMap[key] = merged
			mergedKeys = append(mergedKeys, key)
		}

		switch item.Period {
		case "next_week":
			if merged.NextWeek != "" {
				merged.NextWeek += "\n"
			}
			merged.NextWeek += item.Content
		default: // "this_week" or empty
			if merged.ThisWeek != "" {
				merged.ThisWeek += "\n"
			}
			merged.ThisWeek += item.Content
		}
	}

	// Build sections in order
	var sections []excel.ReportSection
	sectionMap := make(map[string]*excel.ReportSection)
	for _, key := range mergedKeys {
		sec, exists := sectionMap[key.section]
		if !exists {
			sec = &excel.ReportSection{
				Name: key.section,
				Type: "content",
			}
			sectionMap[key.section] = sec
		}
		sec.Items = append(sec.Items, *mergedMap[key])
	}
	for _, name := range sectionOrder {
		if sec, ok := sectionMap[name]; ok {
			sections = append(sections, *sec)
		}
	}

	// Fetch team members for utilization data
	teamMembers, err := a.database.ListTeamMembers(user.ID)
	if err != nil {
		log.Printf("Export warning - ListTeamMembers: %v", err)
	}

	// Fetch all SI projects for reference
	projects, err := a.database.ListProjectsWithClient(user.ID, "si")
	if err != nil {
		log.Printf("Export warning - ListProjectsWithClient: %v", err)
	}
	projectMap := make(map[int64]string)
	for _, p := range projects {
		projectMap[p.ID] = p.Name
	}

	// Build utilization member data
	var utilMembers []excel.UtilizationMemberData
	for _, member := range teamMembers {
		utilMember := excel.UtilizationMemberData{
			Name: member.Name,
			Team: member.Position,
		}

		// Get assignments for this member by TeamMemberID
		assignments, err := a.database.ListMemberAssignments(user.ID, report.WeekStart, report.WeekEnd)
		if err != nil {
			log.Printf("Export warning - ListMemberAssignments for %s: %v", member.Name, err)
		} else {
			// Find assignments for this member
			for _, assignment := range assignments {
				if assignment.TeamMemberID == member.ID {
					projectName := projectMap[assignment.ProjectID]
					if projectName == "" {
						projectName = "프로젝트" + fmt.Sprintf("%d", assignment.ProjectID)
					}
					utilMember.Projects = append(utilMember.Projects, projectName)
					utilMember.Note = assignment.Notes
					// Set monthly M/M based on assignment allocation percent (convert percentage to ratio)
					monthIdx := time.Now().Month() - 1
					if monthIdx >= 0 && monthIdx < 12 {
						utilMember.MonthlyMM[monthIdx] = assignment.AllocationPercent / 100.0
					}
				}
			}
		}

		// If no projects assigned, set default 1.0 for current month
		if len(utilMember.Projects) == 0 {
			monthIdx := time.Now().Month() - 1
			if monthIdx >= 0 && monthIdx < 12 {
				utilMember.MonthlyMM[monthIdx] = 1.0
			}
		}

		utilMembers = append(utilMembers, utilMember)
	}

	data := &excel.ReportData{
		WeekLabel: report.WeekStart,
		WeekStart: report.WeekStart,
		WeekEnd:   report.WeekEnd,
		UserName:  user.Name,
		TeamName:  user.Team,
		Sections:  sections,
		Members:   utilMembers, // Add utilization members
	}

	defaultName := fmt.Sprintf("주간업무일지_%s.xlsx", report.WeekStart)

	savePath, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title:           "주간업무일지 저장",
		DefaultFilename: defaultName,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Excel Files", Pattern: "*.xlsx"},
		},
	})
	if err != nil {
		log.Printf("Export error - SaveFileDialog: %v", err)
		return "", fmt.Errorf("파일 저장 다이얼로그 오류: %w", err)
	}

	if savePath == "" {
		// User cancelled — use default exports directory
		outputDir := filepath.Join(a.dataDir, "exports")
		savePath = filepath.Join(outputDir, defaultName)
		log.Printf("SaveDialog cancelled, using default path: %s", savePath)
	}

	outputPath, err := excel.ExportToPath(tmpl.FilePath, savePath, data)
	if err != nil {
		log.Printf("Export error - ExportToPath: %v", err)
		return "", fmt.Errorf("Excel 생성 실패: %w", err)
	}

	if err := a.database.UpdateReportStatus(reportID, "exported"); err != nil {
		log.Println("Warning: failed to update report status:", err)
	}

	log.Printf("Export success: %s", outputPath)
	return outputPath, nil
}

// --- Integrations ---

func (a *App) GetIntegrations() ([]db.Integration, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.ListIntegrations(user.ID)
}

func (a *App) SaveIntegration(toolType, configJSON string, enabled bool) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}

	integrations, err := a.database.ListIntegrations(user.ID)
	if err != nil {
		return err
	}

	var existing *db.Integration
	for _, i := range integrations {
		if i.ToolType == toolType {
			existing = &i
			break
		}
	}

	if existing != nil {
		existing.ConfigJSON = configJSON
		existing.Enabled = enabled
		_, err = a.database.SaveIntegration(existing)
	} else {
		_, err = a.database.SaveIntegration(&db.Integration{
			UserID:     user.ID,
			ToolType:   toolType,
			ConfigJSON: configJSON,
			Enabled:    enabled,
		})
	}
	return err
}

// --- Project Categories ---

func (a *App) GetProjectCategories() ([]db.ProjectCategory, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.ListProjectCategories(user.ID)
}

func (a *App) AddProjectCategory(name string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	cats, err := a.database.ListProjectCategories(user.ID)
	if err != nil {
		return err
	}
	_, err = a.database.SaveProjectCategory(user.ID, name, len(cats))
	return err
}

func (a *App) DeleteProjectCategory(id int64) error {
	return a.database.DeleteProjectCategory(id)
}

// --- SI Team Ops ---

var validSIProjectStatuses = map[string]bool{
	"제안/POC": true,
	"분석/설계":  true,
	"개발":     true,
	"테스트":    true,
	"오픈":     true,
	"안정화":    true,
	"종료":     true,
}

type commonCodeSeed struct {
	GroupCode   string
	GroupName   string
	Description string
	Values      []db.CodeValue
}

var defaultCommonCodeSeeds = []commonCodeSeed{
	{
		GroupCode:   "position_types",
		GroupName:   "직급체계",
		Description: "팀원 직급 분류",
		Values: []db.CodeValue{
			{CodeValue: "책임", CodeLabel: "책임", SortOrder: 0, IsActive: true},
		},
	},
	{
		GroupCode:   "employment_types",
		GroupName:   "고용형태",
		Description: "팀원 고용형태 분류",
		Values: []db.CodeValue{
			{CodeValue: "정규", CodeLabel: "정규", SortOrder: 0, IsActive: true},
			{CodeValue: "외주", CodeLabel: "외주", SortOrder: 1, IsActive: true},
			{CodeValue: "계약", CodeLabel: "계약", SortOrder: 2, IsActive: true},
		},
	},
	{
		GroupCode:   "project_types",
		GroupName:   "프로젝트 유형",
		Description: "프로젝트 상세 유형 분류",
		Values: []db.CodeValue{
			{CodeValue: "직영", CodeLabel: "직영", SortOrder: 0, IsActive: true},
			{CodeValue: "당선", CodeLabel: "당선", SortOrder: 1, IsActive: true},
			{CodeValue: "신대방동", CodeLabel: "신대방동", SortOrder: 2, IsActive: true},
			{CodeValue: "거제", CodeLabel: "거제", SortOrder: 3, IsActive: true},
			{CodeValue: "의왕", CodeLabel: "의왕", SortOrder: 4, IsActive: true},
			{CodeValue: "판교", CodeLabel: "판교", SortOrder: 5, IsActive: true},
			{CodeValue: "군포", CodeLabel: "군포", SortOrder: 6, IsActive: true},
			{CodeValue: "기타", CodeLabel: "기타", SortOrder: 7, IsActive: true},
		},
	},
	{
		GroupCode:   "project_phases",
		GroupName:   "프로젝트 단계",
		Description: "프로젝트 현재 진행 단계",
		Values: []db.CodeValue{
			{CodeValue: "제안/POC", CodeLabel: "제안/POC", SortOrder: 0, IsActive: true},
			{CodeValue: "분석/설계", CodeLabel: "분석/설계", SortOrder: 1, IsActive: true},
			{CodeValue: "개발", CodeLabel: "개발", SortOrder: 2, IsActive: true},
			{CodeValue: "테스트", CodeLabel: "테스트", SortOrder: 3, IsActive: true},
			{CodeValue: "오픈", CodeLabel: "오픈", SortOrder: 4, IsActive: true},
			{CodeValue: "안정화", CodeLabel: "안정화", SortOrder: 5, IsActive: true},
			{CodeValue: "종료", CodeLabel: "종료", SortOrder: 6, IsActive: true},
		},
	},
}

func (a *App) ensureDefaultCommonCodes(userID int64) error {
	groups, err := a.database.ListCodeGroups(userID)
	if err != nil {
		return err
	}

	groupSet := make(map[string]bool, len(groups))
	for _, g := range groups {
		groupSet[g.GroupCode] = true
	}

	for idx, seed := range defaultCommonCodeSeeds {
		createdGroup := false
		if !groupSet[seed.GroupCode] {
			_, err := a.database.SaveCodeGroup(&db.CodeGroup{
				UserID:      userID,
				GroupCode:   seed.GroupCode,
				GroupName:   seed.GroupName,
				Description: seed.Description,
				SortOrder:   idx,
			})
			if err != nil {
				return err
			}
			createdGroup = true
			groupSet[seed.GroupCode] = true
		}

		if createdGroup {
			for i, value := range seed.Values {
				value.UserID = userID
				value.GroupCode = seed.GroupCode
				value.SortOrder = i
				if _, err := a.database.SaveCodeValue(&value); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

func (a *App) getCommonCodeValues(userID int64, groupCode string) ([]string, error) {
	if err := a.ensureDefaultCommonCodes(userID); err != nil {
		return nil, err
	}

	values, err := a.database.ListCodeValuesByGroup(userID, groupCode)
	if err != nil {
		return nil, err
	}

	result := make([]string, 0, len(values))
	for _, v := range values {
		if strings.TrimSpace(v.CodeValue) == "" {
			continue
		}
		result = append(result, v.CodeValue)
	}
	return result, nil
}

func (a *App) addCommonCodeValue(userID int64, groupCode, value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fmt.Errorf("code value is required")
	}
	if err := a.ensureDefaultCommonCodes(userID); err != nil {
		return err
	}

	values, err := a.database.ListCodeValuesByGroup(userID, groupCode)
	if err != nil {
		return err
	}
	for _, v := range values {
		if strings.EqualFold(strings.TrimSpace(v.CodeValue), trimmed) {
			return nil
		}
	}

	_, err = a.database.SaveCodeValue(&db.CodeValue{
		UserID:      userID,
		GroupCode:   groupCode,
		CodeValue:   trimmed,
		CodeLabel:   trimmed,
		Description: "",
		SortOrder:   len(values),
		IsActive:    true,
	})
	return err
}

func (a *App) removeCommonCodeValue(userID int64, groupCode, value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fmt.Errorf("code value is required")
	}

	values, err := a.database.ListCodeValuesByGroup(userID, groupCode)
	if err != nil {
		return err
	}

	for _, v := range values {
		if strings.EqualFold(strings.TrimSpace(v.CodeValue), trimmed) {
			return a.database.DeleteCodeValue(userID, v.ID)
		}
	}

	return nil
}

func (a *App) ListTeamMembers() ([]db.TeamMember, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.ListTeamMembers(user.ID)
}

func (a *App) SaveTeamMember(member db.TeamMember) (*db.TeamMember, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(member.Name) == "" {
		return nil, fmt.Errorf("team member name is required")
	}
	// Validate email format if provided
	if member.Email != "" && !strings.Contains(member.Email, "@") {
		return nil, fmt.Errorf("invalid email format")
	}
	member.UserID = user.ID
	id, err := a.database.SaveTeamMember(&member)
	if err != nil {
		return nil, err
	}
	member.ID = id
	return &member, nil
}

func (a *App) DeleteTeamMember(id int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteTeamMember(user.ID, id)
}

func (a *App) GetPositionTypes() []string {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("[GetPositionTypes] failed to load default user: %v", err)
		return []string{"책임"}
	}

	values, err := a.getCommonCodeValues(user.ID, "position_types")
	if err != nil {
		log.Printf("[GetPositionTypes] failed to load common codes: %v", err)
		return []string{"책임"}
	}
	return values
}

func (a *App) AddPositionType(value string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.addCommonCodeValue(user.ID, "position_types", value)
}

func (a *App) DeletePositionType(value string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.removeCommonCodeValue(user.ID, "position_types", value)
}

func (a *App) GetEmploymentTypes() []string {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("[GetEmploymentTypes] failed to load default user: %v", err)
		return []string{"정규", "외주", "계약"}
	}

	values, err := a.getCommonCodeValues(user.ID, "employment_types")
	if err != nil {
		log.Printf("[GetEmploymentTypes] failed to load common codes: %v", err)
		return []string{"정규", "외주", "계약"}
	}
	return values
}

func (a *App) AddEmploymentType(value string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.addCommonCodeValue(user.ID, "employment_types", value)
}

func (a *App) DeleteEmploymentType(value string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.removeCommonCodeValue(user.ID, "employment_types", value)
}

// --- Clients ---

var validClientStatuses = map[string]bool{
	"existing": true,
	"target":   true,
	"inactive": true,
}

func (a *App) GetClientStatuses() []string {
	return []string{"existing", "target", "inactive"}
}

func (a *App) ListClients(status string, activeOnly bool) ([]db.Client, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.ListClients(user.ID, status, activeOnly)
}

func (a *App) SaveClient(client db.Client) (*db.Client, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(client.Name) == "" {
		return nil, fmt.Errorf("client name is required")
	}
	if !validClientStatuses[client.Status] {
		client.Status = "existing"
	}
	// Validate email format if provided
	if client.ContactEmail != "" && !strings.Contains(client.ContactEmail, "@") {
		return nil, fmt.Errorf("invalid contact email format")
	}
	client.UserID = user.ID
	id, err := a.database.SaveClient(&client)
	if err != nil {
		return nil, err
	}
	client.ID = id
	return &client, nil
}

func (a *App) DeleteClient(clientID int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteClient(user.ID, clientID)
}

func (a *App) ListSIProjects() ([]db.ProjectWithClient, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	// Fetch all projects (both SI and SM)
	return a.database.ListProjectsWithClient(user.ID, "")
}

func (a *App) SaveSIProject(project db.Project) (*db.Project, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(project.Name) == "" {
		return nil, fmt.Errorf("project name is required")
	}
	if project.ClientID == 0 {
		return nil, fmt.Errorf("client is required")
	}
	// Get valid phases from common codes
	phases, err := a.getCommonCodeValues(user.ID, "project_phases")
	if err != nil {
		phases = []string{"제안/POC", "분석/설계", "개발", "테스트", "오픈", "안정화", "종료"}
	}
	// Check if status is valid
	validStatus := false
	for _, phase := range phases {
		if project.Status == phase {
			validStatus = true
			break
		}
	}
	if !validStatus && len(phases) > 0 {
		project.Status = phases[0]
	}
	project.UserID = user.ID
	// Only default to 'si' if teamType is not provided
	if project.TeamType == "" {
		project.TeamType = "si"
	}
	id, err := a.database.SaveProject(&project)
	if err != nil {
		return nil, err
	}
	project.ID = id
	return &project, nil
}

func (a *App) UpdateSIProjectStatus(projectID int64, status string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	// Get valid phases from common codes
	phases, err := a.getCommonCodeValues(user.ID, "project_phases")
	if err != nil {
		phases = []string{"제안/POC", "분석/설계", "개발", "테스트", "오픈", "안정화", "종료"}
	}
	// Check if status is valid
	validStatus := false
	for _, phase := range phases {
		if status == phase {
			validStatus = true
			break
		}
	}
	if !validStatus {
		return fmt.Errorf("invalid project status: %s", status)
	}
	return a.database.UpdateProjectStatus(user.ID, projectID, status)
}

func (a *App) DeleteSIProject(projectID int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteProject(user.ID, projectID)
}

func (a *App) ListMemberAssignments(weekStart, weekEnd string) ([]db.MemberAssignment, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(weekStart) == "" || strings.TrimSpace(weekEnd) == "" {
		wk := a.GetCurrentWeek()
		weekStart = wk.WeekStart
		weekEnd = wk.WeekEnd
	}
	return a.database.ListMemberAssignments(user.ID, weekStart, weekEnd)
}

func (a *App) SaveMemberAssignment(assignment db.MemberAssignment) (*db.MemberAssignment, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	assignment.UserID = user.ID
	id, err := a.database.SaveMemberAssignment(&assignment)
	if err != nil {
		return nil, err
	}
	assignment.ID = id
	return &assignment, nil
}

func (a *App) DeleteMemberAssignment(assignmentID int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteMemberAssignment(user.ID, assignmentID)
}

// --- SI Project Weekly Reporting Handlers ---

func (a *App) GetSIProjectTypes() []string {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("[GetSIProjectTypes] failed to load default user: %v", err)
		return []string{"직영", "당선", "신대방동", "거제", "의왕", "판교", "군포", "기타"}
	}

	values, err := a.getCommonCodeValues(user.ID, "project_types")
	if err != nil {
		log.Printf("[GetSIProjectTypes] failed to load common codes: %v", err)
		return []string{"직영", "당선", "신대방동", "거제", "의왕", "판교", "군포", "기타"}
	}
	return values
}

func (a *App) AddSIProjectType(value string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.addCommonCodeValue(user.ID, "project_types", value)
}

func (a *App) DeleteSIProjectType(value string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.removeCommonCodeValue(user.ID, "project_types", value)
}

func (a *App) GetSIPhases() []string {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("[GetSIPhases] failed to load default user: %v", err)
		return []string{"제안/POC", "분석/설계", "개발", "테스트", "오픈", "안정화", "종료"}
	}

	values, err := a.getCommonCodeValues(user.ID, "project_phases")
	if err != nil {
		log.Printf("[GetSIPhases] failed to load common codes: %v", err)
		return []string{"제안/POC", "분석/설계", "개발", "테스트", "오픈", "안정화", "종료"}
	}
	return values
}

func (a *App) AddSIPhase(value string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.addCommonCodeValue(user.ID, "project_phases", value)
}

func (a *App) DeleteSIPhase(value string) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.removeCommonCodeValue(user.ID, "project_phases", value)
}

func (a *App) GetSIRoles() []string {
	return []string{"PM", "PL", "책임", "선임", "사원", "아키텍트", "분석가", "개발자", "현장관리자"}
}

func (a *App) GetSIProjectView(projectID int64, weekStart, weekEnd string) (*db.SIProjectView, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.GetSIProjectView(user.ID, projectID, weekStart, weekEnd)
}

func (a *App) SaveSIProjectDetail(detail db.SIProjectDetail) (*db.SIProjectDetail, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	detail.UserID = user.ID
	id, err := a.database.SaveSIProjectDetail(&detail)
	if err != nil {
		return nil, err
	}
	detail.ID = id
	return &detail, nil
}

func (a *App) SaveSIWeeklyReport(report db.SIWeeklyReport) (*db.SIWeeklyReport, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	report.UserID = user.ID
	id, err := a.database.SaveSIWeeklyReport(&report)
	if err != nil {
		return nil, err
	}
	report.ID = id
	return &report, nil
}

func (a *App) SaveSIProjectMember(member db.SIProjectMember) (*db.SIProjectMember, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	member.UserID = user.ID
	id, err := a.database.SaveSIProjectMember(&member)
	if err != nil {
		return nil, err
	}
	member.ID = id
	return &member, nil
}

func (a *App) DeleteSIProjectMember(memberID int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteSIProjectMember(user.ID, memberID)
}

func (a *App) GetUtilizationByDate(date string) ([]db.UtilizationMemberRow, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(date) == "" {
		date = time.Now().Format("2006-01-02")
	}
	return a.database.GetUtilizationByDate(user.ID, date)
}

func (a *App) GetSIWeeklySnapshot(weekStart, weekEnd string) (*db.SIWeeklySnapshot, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(weekStart) == "" || strings.TrimSpace(weekEnd) == "" {
		wk := a.GetCurrentWeek()
		weekStart = wk.WeekStart
		weekEnd = wk.WeekEnd
	}
	return a.database.GetSIWeeklySnapshot(user.ID, weekStart, weekEnd)
}

// --- Attendance ---

var validAttendanceTypes = map[string]bool{
	"vacation":       true,
	"morning_half":   true,
	"afternoon_half": true,
}

func (a *App) GetAttendanceTypes() []string {
	return []string{"vacation", "morning_half", "afternoon_half"}
}

func (a *App) ListAttendanceRecords(memberID int64, startDate, endDate string) ([]db.AttendanceRecord, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.ListAttendanceRecords(user.ID, memberID, startDate, endDate)
}

func (a *App) SaveAttendanceRecord(record db.AttendanceRecord) (*db.AttendanceRecord, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if !validAttendanceTypes[record.Type] {
		return nil, fmt.Errorf("invalid attendance type: %s", record.Type)
	}
	record.UserID = user.ID
	id, err := a.database.SaveAttendanceRecord(&record)
	if err != nil {
		return nil, err
	}
	record.ID = id
	return &record, nil
}

func (a *App) DeleteAttendanceRecord(recordID int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteAttendanceRecord(user.ID, recordID)
}

func (a *App) GetAttendanceSummary(startDate, endDate string) ([]db.AttendanceSummary, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(startDate) == "" || strings.TrimSpace(endDate) == "" {
		now := time.Now()
		startDate = now.Format("2006-01-02")
		endDate = now.Format("2006-01-02")
	}
	return a.database.GetAttendanceSummary(user.ID, startDate, endDate)
}

// --- Manual Activity ---

func (a *App) AddManualActivity(title, summary, date string) (*db.Activity, error) {
	act := &db.Activity{
		Source:       "manual",
		Title:        title,
		Summary:      summary,
		ActivityDate: date,
	}
	id, err := a.database.SaveActivity(act)
	if err != nil {
		return nil, err
	}
	act.ID = id
	return act, nil
}

// --- Week Calculation ---

type WeekInfo struct {
	WeekStart string `json:"weekStart"`
	WeekEnd   string `json:"weekEnd"`
	Label     string `json:"label"`
}

// calcWeekLabel calculates the week label using Wednesday (midpoint) as the
// reference day for the month. This ensures that a week spanning two months
// (e.g., Mon 3/30 ~ Fri 4/3) is labeled based on the month that contains
// the majority of workdays.
func calcWeekLabel(monday time.Time) string {
	wednesday := monday.AddDate(0, 0, 2)
	month := int(wednesday.Month())
	// Count which week of the month Wednesday falls in
	weekNum := (wednesday.Day()-1)/7 + 1
	return fmt.Sprintf("%02d월 %02d주차", month, weekNum)
}

func buildWeekInfo(monday time.Time) WeekInfo {
	friday := monday.AddDate(0, 0, 4)
	return WeekInfo{
		WeekStart: monday.Format("2006-01-02"),
		WeekEnd:   friday.Format("2006-01-02"),
		Label:     calcWeekLabel(monday),
	}
}

func (a *App) GetCurrentWeek() WeekInfo {
	now := time.Now()
	weekday := now.Weekday()
	if weekday == 0 {
		weekday = 7
	}
	monday := now.AddDate(0, 0, -int(weekday-1))
	return buildWeekInfo(monday)
}

func (a *App) GetWeekByOffset(offset int) WeekInfo {
	now := time.Now()
	weekday := now.Weekday()
	if weekday == 0 {
		weekday = 7
	}
	monday := now.AddDate(0, 0, -int(weekday-1)+offset*7)
	return buildWeekInfo(monday)
}

// --- Utility ---

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func toJSON(v interface{}) string {
	data, _ := json.Marshal(v)
	return string(data)
}

// --- GWS Integration ---

type SyncResult struct {
	Success bool   `json:"success"`
	Count   int    `json:"count"`
	Message string `json:"message"`
}

type StatusResult struct {
	Ok      bool   `json:"ok"`
	Message string `json:"message"`
}

// CheckGWSCLI checks if the gws CLI is installed
func (a *App) CheckGWSCLI() StatusResult {
	cli := &integrations.GWSCLI{}
	if err := cli.CheckInstalled(); err != nil {
		return StatusResult{Ok: false, Message: err.Error()}
	}
	return StatusResult{Ok: true, Message: "gws CLI is installed"}
}

// CheckGWSAuth checks if gws is authenticated
func (a *App) CheckGWSAuth() StatusResult {
	cli := &integrations.GWSCLI{}
	if err := cli.CheckAuth(); err != nil {
		return StatusResult{Ok: false, Message: err.Error()}
	}
	return StatusResult{Ok: true, Message: "Google Workspace 인증 성공"}
}

// GetCalendars returns the list of available Google Calendars
func (a *App) GetCalendars() ([]integrations.Calendar, error) {
	cli := &integrations.GWSCLI{}
	calendars, err := cli.FetchCalendars()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch calendars: %w", err)
	}
	return calendars, nil
}

// SetupGWSAuth opens gws auth setup in terminal
func (a *App) SetupGWSAuth() (string, error) {
	return "터미널에서 'gws auth setup'을 실행하여 Google Workspace 인증을 설정하세요.", nil
}

func (a *App) SyncGmail(weekStart, weekEnd string) SyncResult {
	log.Printf("[sync] SyncGmail called: %s ~ %s", weekStart, weekEnd)

	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("사용자 조회 실패: %v", err)}
	}

	// Find Gmail integration
	ints, err := a.database.ListIntegrations(user.ID)
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("연동 조회 실패: %v", err)}
	}

	var gmailInt *db.Integration
	for i, intg := range ints {
		if intg.ToolType == "gmail" && intg.Enabled {
			gmailInt = &ints[i]
			break
		}
	}
	if gmailInt == nil {
		return SyncResult{Success: false, Message: "Gmail 연동이 설정되지 않았습니다. 설정 페이지에서 먼저 연동해주세요."}
	}

	// Check gws auth
	cli := &integrations.GWSCLI{}
	if err := cli.CheckAuth(); err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("GWS 인증 실패: %v", err)}
	}

	ws, _ := time.Parse("2006-01-02", weekStart)
	we, _ := time.Parse("2006-01-02", weekEnd)

	// Use empty account for GWS (auth is handled by gws auth setup)
	count, err := integrations.SyncGmail(a.database, "", ws, we, gmailInt.ID)
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("Gmail 동기화 실패: %v", err)}
	}

	// Update last synced
	a.database.UpdateIntegrationSyncTime(gmailInt.ID)

	return SyncResult{Success: true, Count: count, Message: fmt.Sprintf("Gmail %d개 활동을 가져왔습니다", count)}
}

func (a *App) SyncGoogleCalendar(weekStart, weekEnd string) SyncResult {
	log.Printf("[sync] SyncGoogleCalendar called: %s ~ %s", weekStart, weekEnd)

	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("사용자 조회 실패: %v", err)}
	}

	ints, err := a.database.ListIntegrations(user.ID)
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("연동 조회 실패: %v", err)}
	}

	var calInt *db.Integration
	for i, intg := range ints {
		if intg.ToolType == "google_calendar" && intg.Enabled {
			calInt = &ints[i]
			break
		}
	}
	if calInt == nil {
		return SyncResult{Success: false, Message: "Google Calendar 연동이 설정되지 않았습니다."}
	}

	// Check gws auth
	cli := &integrations.GWSCLI{}
	if err := cli.CheckAuth(); err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("GWS 인증 실패: %v", err)}
	}

	// Parse config to get calendar list
	var config struct {
		Calendars []integrations.CalendarConfig `json:"calendars"`
	}
	json.Unmarshal([]byte(calInt.ConfigJSON), &config)

	// Use configured calendars or default to primary
	var calendarConfigs []integrations.CalendarConfig
	if len(config.Calendars) > 0 {
		calendarConfigs = config.Calendars
	} else {
		// Default to primary calendar
		calendarConfigs = []integrations.CalendarConfig{{ID: "primary", Color: "#3b82f6"}}
	}

	ws, _ := time.Parse("2006-01-02", weekStart)
	we, _ := time.Parse("2006-01-02", weekEnd)

	// Use empty account for GWS (auth is handled by gws auth setup)
	count, err := integrations.SyncGoogleCalendar(a.database, "", ws, we, calInt.ID, calendarConfigs)
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("Calendar 동기화 실패: %v", err)}
	}

	a.database.UpdateIntegrationSyncTime(calInt.ID)

	return SyncResult{Success: true, Count: count, Message: fmt.Sprintf("Calendar %d개 활동을 가져왔습니다", count)}
}

func (a *App) SyncAll(weekStart, weekEnd string) []SyncResult {
	log.Printf("[sync] SyncAll called: %s ~ %s", weekStart, weekEnd)
	var results []SyncResult

	gmailResult := a.SyncGmail(weekStart, weekEnd)
	results = append(results, gmailResult)

	calResult := a.SyncGoogleCalendar(weekStart, weekEnd)
	results = append(results, calResult)

	return results
}

// PopulateReportFromProjects populates the weekly report with SI project weekly report data
func (a *App) PopulateReportFromProjects(reportID int64, weekStart, weekEnd string) (int, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return 0, err
	}

	// Get existing report items to check for duplicates
	existingItems, err := a.database.ListReportItems(reportID)
	if err != nil {
		log.Printf("[PopulateReportFromProjects] Failed to list existing items: %v", err)
		// Continue anyway, just won't have duplicate checking
	}

	// Build a map of existing content for quick lookup
	existingContent := make(map[string]bool)
	for _, item := range existingItems {
		// Normalize content for comparison (remove project name prefix if exists)
		content := item.Content
		existingContent[content] = true
	}

	// Get all SI projects
	projects, err := a.database.ListProjectsWithClient(user.ID, "si")
	if err != nil {
		return 0, err
	}

	count := 0
	for _, project := range projects {
		// Skip closed projects
		if project.Status == "종료" {
			continue
		}

		// Get project view with weekly report
		view, err := a.database.GetSIProjectView(user.ID, project.ID, weekStart, weekEnd)
		if err != nil {
			log.Printf("[PopulateReportFromProjects] Failed to get project view for %d: %v", project.ID, err)
			continue
		}

		// If there's a weekly report, add it as report items
		if view.WeeklyReport != nil && view.WeeklyReport.ID > 0 {
			wr := view.WeeklyReport

			// Add "금주 진행사항" as a report item
			if strings.TrimSpace(wr.ThisWeekProgress) != "" {
				content := fmt.Sprintf("[%s] %s", project.Name, wr.ThisWeekProgress)
				// Skip if already exists
				if existingContent[content] {
					log.Printf("[PopulateReportFromProjects] Skipping duplicate this_week item for project %s", project.Name)
				} else {
					item := &db.ReportItem{
						ReportID:   reportID,
						Section:    "project_progress",
						Category:   project.Name,
						WorkType:   "SI",
						Content:    content,
						Period:     "this_week",
						SortOrder:  count,
						IsSelected: true,
					}
					if _, err := a.database.SaveReportItem(item); err != nil {
						log.Printf("[PopulateReportFromProjects] Failed to save report item: %v", err)
					} else {
						count++
						existingContent[content] = true // Add to map to prevent duplicates within this run
					}
				}
			}

			// Add "차주 계획" as a report item
			if strings.TrimSpace(wr.NextWeekPlan) != "" {
				content := fmt.Sprintf("[%s] %s", project.Name, wr.NextWeekPlan)
				// Skip if already exists
				if existingContent[content] {
					log.Printf("[PopulateReportFromProjects] Skipping duplicate next_week item for project %s", project.Name)
				} else {
					item := &db.ReportItem{
						ReportID:   reportID,
						Section:    "next_week_plan",
						Category:   project.Name,
						WorkType:   "SI",
						Content:    content,
						Period:     "next_week",
						SortOrder:  count,
						IsSelected: true,
					}
					if _, err := a.database.SaveReportItem(item); err != nil {
						log.Printf("[PopulateReportFromProjects] Failed to save report item: %v", err)
					} else {
						count++
						existingContent[content] = true
					}
				}
			}

			// Add "리스크" as a report item if exists
			if strings.TrimSpace(wr.Risks) != "" {
				content := fmt.Sprintf("[%s] 리스크: %s", project.Name, wr.Risks)
				// Skip if already exists
				if existingContent[content] {
					log.Printf("[PopulateReportFromProjects] Skipping duplicate risks item for project %s", project.Name)
				} else {
					item := &db.ReportItem{
						ReportID:   reportID,
						Section:    "issues",
						Category:   project.Name,
						WorkType:   "SI",
						Content:    content,
						Period:     "this_week",
						SortOrder:  count,
						IsSelected: true,
					}
					if _, err := a.database.SaveReportItem(item); err != nil {
						log.Printf("[PopulateReportFromProjects] Failed to save report item: %v", err)
					} else {
						count++
						existingContent[content] = true
					}
				}
			}
		}
	}

	log.Printf("[PopulateReportFromProjects] Added %d project items to report %d", count, reportID)
	return count, nil
}

// --- File Operations ---

// --- TeamProfile ---

func (a *App) GetTeamProfile() (*db.TeamProfile, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.GetTeamProfile(user.ID)
}

func (a *App) SetupTeamProfile(teamType, teamName, userName string, memberCount int) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	profile := &db.TeamProfile{
		TeamType:    teamType,
		TeamName:    teamName,
		UserName:    userName,
		MemberCount: memberCount,
		SetupDone:   true,
	}
	return a.database.SaveTeamProfile(user.ID, profile)
}

func (a *App) UpdateTeamProfile(profile db.TeamProfile) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	profile.SetupDone = true

	// If Linear API Key is set or changed, fetch and store the current user's Linear ID
	if profile.LinearAPIKey != "" && profile.LinearUserID == "" {
		viewerID, err := getLinearViewerID(profile.LinearAPIKey)
		if err != nil {
			log.Printf("[UpdateTeamProfile] Warning: Failed to fetch Linear viewer ID: %v", err)
			// Continue anyway - Linear user ID is optional
		} else {
			profile.LinearUserID = viewerID
			log.Printf("[UpdateTeamProfile] Fetched Linear user ID: %s", viewerID)
		}
	}

	return a.database.SaveTeamProfile(user.ID, &profile)
}

// --- Issues ---

func (a *App) ListIssues(statusFilter string) ([]db.Issue, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	issues, err := a.database.ListIssues(user.ID, statusFilter)
	if issues == nil {
		issues = []db.Issue{}
	}
	return issues, err
}

func (a *App) SaveIssue(issue db.Issue) (int64, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return 0, err
	}
	issue.UserID = user.ID
	return a.database.SaveIssue(&issue)
}

func (a *App) DeleteIssue(issueID int64) error {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return a.database.DeleteIssue(user.ID, issueID)
}

// --- Retrospectives ---

func (a *App) ListRetrospectives() ([]db.Retrospective, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	retros, err := a.database.ListRetrospectives(user.ID)
	if retros == nil {
		retros = []db.Retrospective{}
	}
	return retros, err
}

func (a *App) SaveRetrospective(retro db.Retrospective) (int64, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return 0, err
	}
	retro.UserID = user.ID
	return a.database.SaveRetrospective(&retro)
}

// --- Linear API Proxy ---

type LinearIssueState struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
	Type  string `json:"type"`
}

type LinearIssueLabel struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type LinearIssueLabelNodes struct {
	Nodes []LinearIssueLabel `json:"nodes"`
}

type LinearIssueAssignee struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type LinearIssueProject struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type LinearIssue struct {
	ID          string                 `json:"id"`
	Title       string                 `json:"title"`
	Identifier  string                 `json:"identifier"`
	Priority    int                    `json:"priority"`
	State       LinearIssueState       `json:"state"`
	Assignee    *LinearIssueAssignee   `json:"assignee"`
	URL         string                 `json:"url"`
	CreatedAt   string                 `json:"createdAt"`
	UpdatedAt   string                 `json:"updatedAt"`
	DueDate     *string                `json:"dueDate"`
	Description string                 `json:"description"`
	Estimate    *float64               `json:"estimate"`
	Labels      *LinearIssueLabelNodes `json:"labels"`
	Project     *LinearIssueProject    `json:"project"`
}

type LinearProject struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	State    string  `json:"state"`
	Progress float64 `json:"progress"`
	URL      string  `json:"url"`
}

type LinearCycle struct {
	ID                  string  `json:"id"`
	Name                string  `json:"name"`
	Number              int     `json:"number"`
	StartsAt            string  `json:"startsAt"`
	EndsAt              string  `json:"endsAt"`
	CompletedAt         *string `json:"completedAt"`
	IssueCount          int     `json:"issueCount"`
	CompletedIssueCount int     `json:"completedIssueCount"`
}

type LinearDashboardData struct {
	Projects    []LinearProject `json:"projects"`
	Issues      []LinearIssue   `json:"issues"`
	Cycles      []LinearCycle   `json:"cycles"`
	IssueCounts map[string]int  `json:"issueCounts"`
}

func (a *App) GetLinearDashboard() (*LinearDashboardData, error) {
	profile, err := a.GetTeamProfile()
	if err != nil {
		return nil, fmt.Errorf("팀 프로필을 불러올 수 없습니다")
	}
	if profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}
	return fetchLinearDashboard(profile.LinearAPIKey, profile.LinearTeamID)
}

func fetchLinearDashboard(apiKey, teamID string) (*LinearDashboardData, error) {
	return callLinearAPI(apiKey, teamID)
}

func (a *App) GetLinearTeamStates() ([]LinearWorkflowState, error) {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}
	return GetLinearTeamStates(profile.LinearAPIKey, profile.LinearTeamID)
}

func (a *App) UpdateLinearIssueState(issueID, stateID string) error {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}
	return UpdateLinearIssueState(profile.LinearAPIKey, issueID, stateID)
}

func (a *App) GetLinearTeamMembers() ([]LinearTeamMember, error) {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}
	return GetLinearTeamMembers(profile.LinearAPIKey, profile.LinearTeamID)
}

// GetMyLinearIssues retrieves Linear issues assigned to the current user
func (a *App) GetMyLinearIssues() ([]LinearIssue, error) {
	profile, err := a.GetTeamProfile()
	if err != nil {
		return nil, fmt.Errorf("팀 프로필을 불러올 수 없습니다")
	}
	if profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}
	return GetMyLinearIssues(profile.LinearAPIKey, profile.LinearTeamID, profile.LinearUserID)
}

// AutoMapLinearMembers matches app team members to Linear members by email then name,
// saves the linear_user_id, and returns the count of newly mapped members.
func (a *App) AutoMapLinearMembers() (int, error) {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return 0, fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}
	linearMembers, err := GetLinearTeamMembers(profile.LinearAPIKey, profile.LinearTeamID)
	if err != nil {
		return 0, err
	}
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return 0, err
	}
	appMembers, err := a.database.ListTeamMembers(user.ID)
	if err != nil {
		return 0, err
	}

	// Build lookup maps from Linear members
	byEmail := map[string]LinearTeamMember{}
	byName := map[string]LinearTeamMember{}
	for _, lm := range linearMembers {
		if lm.Email != "" {
			byEmail[strings.ToLower(strings.TrimSpace(lm.Email))] = lm
		}
		byName[strings.ToLower(strings.TrimSpace(lm.Name))] = lm
		if lm.DisplayName != "" {
			byName[strings.ToLower(strings.TrimSpace(lm.DisplayName))] = lm
		}
	}

	mapped := 0
	for _, am := range appMembers {
		if am.LinearUserID != "" {
			continue // already mapped
		}
		var match *LinearTeamMember
		if am.Email != "" {
			if lm, ok := byEmail[strings.ToLower(strings.TrimSpace(am.Email))]; ok {
				match = &lm
			}
		}
		if match == nil {
			if lm, ok := byName[strings.ToLower(strings.TrimSpace(am.Name))]; ok {
				match = &lm
			}
		}
		if match != nil {
			am.LinearUserID = match.ID
			if _, err := a.database.SaveTeamMember(&am); err != nil {
				log.Printf("[AutoMapLinearMembers] save failed for %s: %v", am.Name, err)
				continue
			}
			mapped++
		}
	}
	return mapped, nil
}

func (a *App) UpdateLinearIssue(issueID string, input LinearIssueUpdateInput) error {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}
	return UpdateLinearIssue(profile.LinearAPIKey, issueID, input)
}

// CheckClaudeCLI returns whether the `claude` CLI is installed and its version string.
func (a *App) CheckClaudeCLI() map[string]interface{} {
	cmd := exec.Command("claude", "--version")
	out, err := cmd.Output()
	if err != nil {
		return map[string]interface{}{"ok": false, "version": ""}
	}
	return map[string]interface{}{"ok": true, "version": strings.TrimSpace(string(out))}
}

// ClaudeChat is kept for backward compatibility; delegates to ClaudeChatWithSession with no session.
func (a *App) ClaudeChat(prompt, systemContext string) (string, error) {
	res, err := a.ClaudeChatWithSession(prompt, systemContext, "")
	return res.Reply, err
}

// ClaudeChatResult holds the reply text and metadata returned by ClaudeChatWithSession.
type ClaudeChatResult struct {
	Reply        string  `json:"reply"`
	SessionID    string  `json:"sessionId"`
	Model        string  `json:"model"`
	NumTurns     int     `json:"numTurns"`
	InputTokens  int     `json:"inputTokens"`
	OutputTokens int     `json:"outputTokens"`
	CacheRead    int     `json:"cacheReadTokens"`
	CacheCreate  int     `json:"cacheCreateTokens"`
	CostUSD      float64 `json:"costUsd"`
}

// ClaudeChatWithSession sends a prompt to the local `claude` CLI using stream-json output so that
// the session_id can be extracted and returned.  Pass a non-empty sessionID to resume a previous
// conversation with --resume; pass "" to start a fresh session.
func (a *App) ClaudeChatWithSession(prompt, systemContext, sessionID string) (ClaudeChatResult, error) {
	fullPrompt := prompt
	if systemContext != "" {
		fullPrompt = systemContext + "\n\n---\n\n" + prompt
	}

	args := []string{}
	if sessionID != "" {
		args = append(args, "--resume", sessionID)
	}
	args = append(args, "-p", fullPrompt, "--output-format", "stream-json", "--verbose")

	cmd := exec.Command("claude", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return ClaudeChatResult{}, fmt.Errorf("claude CLI 오류: %s", errMsg)
	}

	// Parse NDJSON output — find the last line with "type":"result" and assistant message for model
	type usageInfo struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
	}
	type resultLine struct {
		Type         string    `json:"type"`
		Result       string    `json:"result"`
		SessionID    string    `json:"session_id"`
		IsError      bool      `json:"is_error"`
		NumTurns     int       `json:"num_turns"`
		TotalCostUSD float64   `json:"total_cost_usd"`
		Usage        usageInfo `json:"usage"`
	}
	type assistantLine struct {
		Type    string `json:"type"`
		Message struct {
			Model string `json:"model"`
		} `json:"message"`
	}
	var found resultLine
	var model string
	for _, raw := range strings.Split(stdout.String(), "\n") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		// Try assistant line for model name
		var aLine assistantLine
		if err := json.Unmarshal([]byte(raw), &aLine); err == nil && aLine.Type == "assistant" && aLine.Message.Model != "" {
			model = aLine.Message.Model
		}
		var line resultLine
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			continue
		}
		if line.Type == "result" {
			found = line
		}
	}

	if found.Type == "" {
		return ClaudeChatResult{}, fmt.Errorf("claude CLI 응답 파싱 실패")
	}
	if found.IsError {
		return ClaudeChatResult{}, fmt.Errorf("claude CLI 오류: %s", found.Result)
	}
	return ClaudeChatResult{
		Reply:        strings.TrimSpace(found.Result),
		SessionID:    found.SessionID,
		Model:        model,
		NumTurns:     found.NumTurns,
		InputTokens:  found.Usage.InputTokens,
		OutputTokens: found.Usage.OutputTokens,
		CacheRead:    found.Usage.CacheReadInputTokens,
		CacheCreate:  found.Usage.CacheCreationInputTokens,
		CostUSD:      found.TotalCostUSD,
	}, nil
}

// SkillCommand represents a single slash command discovered in a Claude skill.
type SkillCommand struct {
	Skill string `json:"skill"`
	Cmd   string `json:"cmd"`
	Desc  string `json:"desc"`
}

// ScanClaudeSkills scans ~/.claude/skills/ for installed skills and returns
// a list of slash commands parsed from each skill's SKILL.md file.
func (a *App) ScanClaudeSkills() []SkillCommand {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	skillsDir := filepath.Join(home, ".claude", "skills")
	entries, err := os.ReadDir(skillsDir)
	if err != nil {
		return nil
	}

	// Regex: matches lines like `/skillname:cmd` or `/skillname` inside backtick blocks or plain text
	cmdRe := regexp.MustCompile("(?m)^\\s*[`*-]?\\s*(`?)(/(\\w[\\w-]*(?::\\w[\\w-]*)*))`?\\s*(?:[-—]\\s*(.+))?$")

	var result []SkillCommand
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillName := entry.Name()
		mdPath := filepath.Join(skillsDir, skillName, "SKILL.md")
		data, err := os.ReadFile(mdPath)
		if err != nil {
			continue
		}
		matches := cmdRe.FindAllSubmatch(data, -1)
		seen := map[string]bool{}
		for _, m := range matches {
			cmdStr := string(m[2]) // e.g. /ls:list
			desc := strings.TrimSpace(string(m[4]))
			if seen[cmdStr] {
				continue
			}
			// Only include commands that belong to this skill (start with /skillname)
			prefix := "/" + skillName
			if !strings.HasPrefix(cmdStr, prefix) {
				continue
			}
			seen[cmdStr] = true
			result = append(result, SkillCommand{
				Skill: skillName,
				Cmd:   cmdStr,
				Desc:  desc,
			})
		}
	}
	return result
}

// OpenFile opens a file with the system's default application
func (a *App) OpenFile(filePath string) error {
	if filePath == "" {
		return fmt.Errorf("file path is empty")
	}

	// Verify file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return fmt.Errorf("file does not exist: %s", filePath)
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", filePath)
	case "darwin":
		cmd = exec.Command("open", filePath)
	default: // linux and others
		cmd = exec.Command("xdg-open", filePath)
	}

	return cmd.Start()
}

// --- Linear Content Integration ---

// mapLinearProjectToCategory maps Linear project name to ProjectCategory (3-step matching)
func mapLinearProjectToCategory(linearProjectName string, categories []db.ProjectCategory, userID int64, database *db.Database) string {
	if linearProjectName == "" {
		return ""
	}

	// Step 1: Exact match (case-insensitive)
	for _, cat := range categories {
		if strings.EqualFold(cat.Name, linearProjectName) {
			return cat.Name
		}
	}

	// Step 2: Substring match (both directions)
	for _, cat := range categories {
		catLower := strings.ToLower(cat.Name)
		projLower := strings.ToLower(linearProjectName)
		if strings.Contains(projLower, catLower) || strings.Contains(catLower, projLower) {
			return cat.Name
		}
	}

	// Step 3: Create new category if no match found
	_, err := database.SaveProjectCategory(userID, linearProjectName, len(categories))
	if err != nil {
		log.Printf("[mapLinearProjectToCategory] Failed to create category %s: %v", linearProjectName, err)
	}
	return linearProjectName // Return name even if creation failed
}

// buildLinearIssueDigest creates a compact issue digest for AI prompt
func buildLinearIssueDigest(issue LinearIssue) string {
	desc := issue.Description
	if len([]rune(desc)) > 100 {
		runes := []rune(desc)
		desc = string(runes[:100]) + "..."
	}

	priority := ""
	if issue.Priority > 0 {
		priorityLabels := []string{"", "긴급", "높음", "보통", "낮음"}
		if issue.Priority < len(priorityLabels) {
			priority = fmt.Sprintf(", 우선순위: %s", priorityLabels[issue.Priority])
		}
	}

	return fmt.Sprintf("[%s] %s (상태: %s%s)\n  %s",
		issue.Identifier, issue.Title, issue.State.Name, priority, desc)
}

// generateLinearReportWithAI converts Linear issues to report text via AI (Claude CLI or OpenAI)
func (a *App) generateLinearReportWithAI(issues []LinearIssue, projectName, categoryName string) (string, error) {
	// Build issue digest list
	digests := []string{}
	for _, issue := range issues {
		digests = append(digests, buildLinearIssueDigest(issue))
	}
	digestLines := strings.Join(digests, "\n\n")

	systemPrompt := `너는 주간업무 보고서를 작성하는 보조자다.
Linear 이슈 목록을 받아 하나의 보고서 항목으로 통합 작성한다.
원문 복붙, 이슈 ID·URL 등 메타정보 나열을 금지한다.
엑셀 보고서 톤의 간결한 서술형으로 작성한다.`

	userPrompt := fmt.Sprintf(`[입력]
프로젝트: %s
카테고리: %s
이슈 건수: %d건

[이슈 목록]
%s

[작성 규칙]
1. 이슈 목록을 종합해 가장 핵심적인 업무명(업무 요약)을 첫 줄에 작성
   - 예: "API 연동 개선", "데이터베이스 마이그레이션", "버그 수정 및 최적화"
   - 프로젝트 이름이 아닌 실제 작업 내용을 요약한 이름
2. 두 번째 줄에는 진행 현황을 간단히 설명
3. 세 번째 줄에는 예정된 후속 조치를 설명
4. 이슈 ID, URL, 기술 용어 나열 금지
5. 업무 맥락과 진행 흐름 중심 서술
6. 각 줄 100자 이내

[출력 예시]
API 키 보안 강화
 - 사용자 인증 API 개선 작업 진행 중, 기본 구현 완료
 - 에러 처리 개선 및 문서화 예정

주의: 각 줄은 "항목명 : 내용" 형식으로 작성하되, 내용 앞에 대시(-)를 추가하지 마세요.`,
		projectName, categoryName, len(issues), digestLines)

	// Try Claude CLI first
	claudeCheck := a.CheckClaudeCLI()
	if ok, _ := claudeCheck["ok"].(bool); ok {
		result, err := a.ClaudeChatWithSession(systemPrompt+"\n\n---\n\n"+userPrompt, "", "")
		if err == nil {
			return normalizeNarrativeContent(result.Reply), nil
		}
		log.Printf("[Linear AI] Claude CLI failed, falling back to OpenAI: %v", err)
	}

	// Fallback to OpenAI
	cfg, err := a.getOpenAIConfig()
	if err != nil || cfg == nil {
		return "", fmt.Errorf("AI 설정이 없습니다. Claude CLI 설치 또는 OpenAI API Key를 설정해주세요")
	}

	client := ai.NewClient(cfg.APIKey, cfg.Model)
	reply, err := client.ChatCompletion(systemPrompt, userPrompt)
	if err != nil {
		return "", fmt.Errorf("OpenAI API 호출 실패: %w", err)
	}

	return normalizeNarrativeContent(reply), nil
}

// PopulateReportFromLinear auto-populates a report with Linear issues assigned to the user
func (a *App) PopulateReportFromLinear(reportID int64, weekStart, weekEnd string) (int, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return 0, err
	}

	profile, err := a.database.GetTeamProfile(user.ID)
	if err != nil {
		return 0, err
	}

	if profile.LinearAPIKey == "" {
		return 0, fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}

	// Get my issues
	myIssues, err := GetMyLinearIssues(profile.LinearAPIKey, profile.LinearTeamID, profile.LinearUserID)
	if err != nil {
		return 0, fmt.Errorf("Linear 이슈 조회 실패: %w", err)
	}

	if len(myIssues) == 0 {
		return 0, nil
	}

	// Get existing report items to prevent duplicates
	existingItems, err := a.database.ListReportItems(reportID)
	if err != nil {
		return 0, err
	}
	existingSet := make(map[string]bool)
	for _, item := range existingItems {
		key := "project_progress|" + item.Category + "|" + item.Content
		if len(key) > 100 {
			key = key[:100]
		}
		existingSet[key] = true
	}

	// Get categories
	categories, err := a.database.ListProjectCategories(user.ID)
	if err != nil {
		log.Printf("[PopulateReportFromLinear] Failed to list categories: %v", err)
		categories = []db.ProjectCategory{}
	}

	// Group issues by project and period (this_week vs next_week)
	type projectGroup struct {
		projectName    string
		categoryName   string
		thisWeekIssues []LinearIssue // In progress, In Review, etc.
		nextWeekIssues []LinearIssue // Todo, Backlog
	}
	groups := make(map[string]*projectGroup)

	for _, issue := range myIssues {
		projName := ""
		if issue.Project != nil {
			projName = issue.Project.Name
		}

		if _, exists := groups[projName]; !exists {
			catName := mapLinearProjectToCategory(projName, categories, user.ID, a.database)
			groups[projName] = &projectGroup{
				projectName:  projName,
				categoryName: catName,
			}
		}

		// Classify by state: Todo/Backlog -> next_week, others -> this_week
		stateType := strings.ToLower(issue.State.Type)
		stateName := strings.ToLower(issue.State.Name)
		if stateType == "backlog" || stateType == "todo" || stateType == "unstarted" ||
			strings.Contains(stateName, "todo") || strings.Contains(stateName, "backlog") {
			groups[projName].nextWeekIssues = append(groups[projName].nextWeekIssues, issue)
		} else {
			groups[projName].thisWeekIssues = append(groups[projName].thisWeekIssues, issue)
		}
	}

	// Convert each group to report items via AI
	addedCount := 0
	for _, group := range groups {
		// Process this_week issues
		if len(group.thisWeekIssues) > 0 {
			content, err := a.generateLinearReportWithAI(group.thisWeekIssues, group.projectName, group.categoryName)
			if err != nil {
				log.Printf("[PopulateReportFromLinear] AI generation failed for project %s this_week: %v", group.projectName, err)
			} else {
				key := "project_progress|" + group.categoryName + "|" + content
				if len(key) > 150 {
					key = key[:150]
				}
				if !existingSet[key] {
					item := &db.ReportItem{
						ReportID:   reportID,
						Section:    "project_progress",
						Category:   group.categoryName,
						WorkType:   "si",
						Content:    content,
						Period:     "this_week",
						SortOrder:  len(existingItems) + addedCount,
						IsSelected: true,
					}
					if _, err := a.database.SaveReportItem(item); err == nil {
						existingSet[key] = true
						addedCount++
					}
				}
			}
		}

		// Process next_week issues (Todo state)
		if len(group.nextWeekIssues) > 0 {
			content, err := a.generateLinearReportWithAI(group.nextWeekIssues, group.projectName, group.categoryName)
			if err != nil {
				log.Printf("[PopulateReportFromLinear] AI generation failed for project %s next_week: %v", group.projectName, err)
			} else {
				// Use next_week_plan section for Todo items
				key := "next_week_plan|" + group.categoryName + "|" + content
				if len(key) > 150 {
					key = key[:150]
				}
				if !existingSet[key] {
					item := &db.ReportItem{
						ReportID:   reportID,
						Section:    "next_week_plan",
						Category:   group.categoryName,
						WorkType:   "si",
						Content:    content,
						Period:     "next_week",
						SortOrder:  len(existingItems) + addedCount,
						IsSelected: true,
					}
					if _, err := a.database.SaveReportItem(item); err == nil {
						existingSet[key] = true
						addedCount++
					}
				}
			}
		}
	}

	log.Printf("[PopulateReportFromLinear] Added %d items to report %d", addedCount, reportID)
	return addedCount, nil
}
