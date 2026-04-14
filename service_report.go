package main

import (
	"fmt"
	"log"
	"path/filepath"
	"time"

	"openreport/internal/constants"
	"openreport/internal/db"
	"openreport/internal/excel"
	"openreport/internal/reportinsights"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type ReportService struct {
	app *App
}

func NewReportService(app *App) *ReportService {
	return &ReportService{app: app}
}

func (s *ReportService) GetCurrentUser() (*db.User, error) {
	return s.app.database.GetOrCreateDefaultUser()
}

func (s *ReportService) UpdateUser(name, team string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.database.ExecRaw("UPDATE users SET name=?, team=? WHERE id=?", name, team, user.ID)
}

func (s *ReportService) GetWeekActivities(weekStart, weekEnd string) ([]ActivityWithSource, error) {
	log.Printf("[GetWeekActivities] Called with range: %s ~ %s", weekStart, weekEnd)
	activities, err := s.app.database.ListActivities(weekStart, weekEnd)
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

func (s *ReportService) GetOrCreateWeeklyReport(weekStart, weekEnd string) (*db.WeeklyReport, error) {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}

	report, err := s.app.database.GetWeeklyReportByWeek(user.ID, weekStart)
	if err != nil {
		return nil, err
	}
	if report != nil {
		return report, nil
	}

	id, err := s.app.database.CreateWeeklyReport(user.ID, weekStart, weekEnd)
	if err != nil {
		return nil, err
	}

	prevReport, err := s.app.database.GetPreviousWeekReport(user.ID, weekStart)
	if err != nil {
		log.Printf("[CarryOver] Error finding previous report: %v", err)
	} else if prevReport != nil {
		nextWeekItems, err := s.app.database.ListReportItemsByPeriod(prevReport.ID, constants.PeriodNextWeek)
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
					Period:     constants.PeriodThisWeek,
					SortOrder:  i,
					IsSelected: true,
				}
				if _, err := s.app.database.SaveReportItem(carried); err != nil {
					log.Printf("[CarryOver] Failed to carry over item %d: %v", item.ID, err)
				}
			}
			if len(nextWeekItems) > 0 {
				log.Printf("[CarryOver] Carried over %d items from report %d to %d", len(nextWeekItems), prevReport.ID, id)
			}
		}
	}

	return s.app.database.GetWeeklyReport(id)
}

func (s *ReportService) ListWeeklyReports() ([]db.WeeklyReport, error) {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return s.app.database.ListWeeklyReports(user.ID)
}

func (s *ReportService) GetWeeklyReport(reportID int64) (*db.WeeklyReport, error) {
	return s.app.database.GetWeeklyReport(reportID)
}

func (s *ReportService) GetReportItems(reportID int64) ([]db.ReportItem, error) {
	return s.app.database.ListReportItems(reportID)
}

func (s *ReportService) AddReportItem(reportID int64, section, category, content string, activityID *int64, period string) (*db.ReportItem, error) {
	if period == "" {
		period = constants.PeriodThisWeek
	}
	items, err := s.app.database.ListReportItems(reportID)
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

	id, err := s.app.database.SaveReportItem(item)
	if err != nil {
		return nil, err
	}
	item.ID = id
	return item, nil
}

func (s *ReportService) UpdateReportItem(item db.ReportItem) error {
	log.Printf("[UpdateReportItem] Updating item %d: content=%.50s..., section=%s, category=%s",
		item.ID, item.Content, item.Section, item.Category)
	_, err := s.app.database.SaveReportItem(&item)
	if err != nil {
		log.Printf("[UpdateReportItem] Failed to save item %d: %v", item.ID, err)
	} else {
		log.Printf("[UpdateReportItem] Successfully saved item %d", item.ID)
	}
	return err
}

func (s *ReportService) DeleteReportItem(id int64) error {
	return s.app.database.DeleteReportItem(id)
}

func (s *ReportService) AddActivityToReport(reportID int64, activityID int64, section, category string) (*db.ReportItem, error) {
	existingItems, err := s.app.database.ListReportItems(reportID)
	if err != nil {
		return nil, err
	}
	for _, item := range existingItems {
		if item.ActivityID != nil && *item.ActivityID == activityID {
			log.Printf("[AddActivityToReport] Activity %d already exists in report %d, skipping duplicate", activityID, reportID)
			return nil, fmt.Errorf("activity already added to report")
		}
	}

	activities, err := s.app.database.ListActivities("2000-01-01", "2099-12-31")
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

	generated, err := s.app.generateAIReportContent(activity, section, category)
	if err != nil {
		log.Printf("[openai] failed to generate report content for activity %d: %v", activity.ID, err)
	} else if generated != "" {
		content = normalizeNarrativeContent(generated)
	}

	item, err := s.AddReportItem(reportID, section, category, content, &activityID, constants.PeriodThisWeek)
	if err != nil {
		return nil, err
	}

	if item.WorkType == "" {
		item.WorkType = inferWorkType(section, category, content)
		_, _ = s.app.database.SaveReportItem(item)
	}
	return item, nil
}

func (s *ReportService) GetReportInsights(reportID int64) (*db.ReportInsights, error) {
	report, err := s.app.database.GetWeeklyReport(reportID)
	if err != nil {
		return nil, err
	}

	activities, err := s.app.database.ListActivities(report.WeekStart, report.WeekEnd)
	if err != nil {
		return nil, err
	}

	items, err := s.app.database.ListReportItems(reportID)
	if err != nil {
		return nil, err
	}

	ignored, err := s.app.database.ListIgnoredReportInsightActivities(reportID)
	if err != nil {
		return nil, err
	}

	insights := reportinsights.Build(activities, items, ignored)
	return &insights, nil
}

func (s *ReportService) AcceptInsightActivity(reportID int64, activityID int64, section, category, period string) (*db.ReportItem, error) {
	item, err := s.AddActivityToReport(reportID, activityID, section, category)
	if err != nil {
		return nil, err
	}

	if period == "" || period == constants.PeriodThisWeek {
		return item, nil
	}

	item.Period = period
	if _, err := s.app.database.SaveReportItem(item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *ReportService) AcceptInsightDraft(reportID int64, draft db.ReportInsightDraft, period string) ([]db.ReportItem, error) {
	if period == "" {
		period = constants.PeriodThisWeek
	}

	section := draft.SuggestedSection
	if section == "" {
		section = "other"
	}

	if len(draft.ActivityIDs) == 0 {
		item, err := s.AddReportItem(reportID, section, draft.SuggestedCategory, draft.Content, nil, period)
		if err != nil {
			return nil, err
		}
		return []db.ReportItem{*item}, nil
	}

	accepted := make([]db.ReportItem, 0, len(draft.ActivityIDs))
	for _, activityID := range draft.ActivityIDs {
		item, err := s.AcceptInsightActivity(reportID, activityID, section, draft.SuggestedCategory, period)
		if err != nil {
			return nil, err
		}
		accepted = append(accepted, *item)
	}
	return accepted, nil
}

func (s *ReportService) IgnoreInsightActivity(reportID int64, activityID int64) error {
	return s.app.database.IgnoreReportInsightActivity(reportID, activityID)
}

func (s *ReportService) PopulateReportFromTeamData(reportID int64) (int, error) {
	return s.app.PopulateReportFromTeamData(reportID)
}

func (s *ReportService) PreprocessReportItemsWithAI(reportID int64) SyncResult {
	return s.app.PreprocessReportItemsWithAI(reportID)
}

func (s *ReportService) ExportWeeklyReport(reportID int64) (string, error) {
	log.Printf("ExportWeeklyReport called with reportID: %d", reportID)

	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("Export error - GetOrCreateDefaultUser: %v", err)
		return "", err
	}

	profile, _ := s.app.database.GetTeamProfile(user.ID)
	teamType := "default"
	if profile != nil && profile.TeamType != "" {
		teamType = profile.TeamType
	}
	tmpl, err := s.app.database.GetExcelTemplateByType(user.ID, teamType)
	if err != nil {
		log.Printf("Export error - GetExcelTemplate: %v", err)
		return "", fmt.Errorf("템플릿 조회 실패: %w", err)
	}
	if tmpl == nil {
		log.Println("Export error - no template found")
		return "", fmt.Errorf("Excel 템플릿이 없습니다. 설정에서 먼저 업로드해주세요")
	}

	report, err := s.app.database.GetWeeklyReport(reportID)
	if err != nil {
		log.Printf("Export error - GetWeeklyReport: %v", err)
		return "", fmt.Errorf("보고서 조회 실패: %w", err)
	}

	items, err := s.app.database.ListReportItems(reportID)
	if err != nil {
		log.Printf("Export error - ListReportItems: %v", err)
		return "", err
	}

	type itemKey struct {
		section  string
		category string
		workType string
	}
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
		case constants.PeriodNextWeek:
			if merged.NextWeek != "" {
				merged.NextWeek += "\n"
			}
			merged.NextWeek += item.Content
		default:
			if merged.ThisWeek != "" {
				merged.ThisWeek += "\n"
			}
			merged.ThisWeek += item.Content
		}
	}

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

	teamMembers, err := s.app.database.ListTeamMembers(user.ID)
	if err != nil {
		log.Printf("Export warning - ListTeamMembers: %v", err)
	}

	projects, err := s.app.database.ListProjectsWithClient(user.ID, "si")
	if err != nil {
		log.Printf("Export warning - ListProjectsWithClient: %v", err)
	}
	projectMap := make(map[int64]string)
	for _, p := range projects {
		projectMap[p.ID] = p.Name
	}

	var utilMembers []excel.UtilizationMemberData
	for _, member := range teamMembers {
		utilMember := excel.UtilizationMemberData{
			Name: member.Name,
			Team: member.Position,
		}

		assignments, err := s.app.database.ListMemberAssignments(user.ID, report.WeekStart, report.WeekEnd)
		if err != nil {
			log.Printf("Export warning - ListMemberAssignments for %s: %v", member.Name, err)
		} else {
			for _, assignment := range assignments {
				if assignment.TeamMemberID == member.ID {
					projectName := projectMap[assignment.ProjectID]
					if projectName == "" {
						projectName = "프로젝트" + fmt.Sprintf("%d", assignment.ProjectID)
					}
					utilMember.Projects = append(utilMember.Projects, projectName)
					utilMember.Note = assignment.Notes
					monthIdx := time.Now().Month() - 1
					if monthIdx >= 0 && monthIdx < 12 {
						utilMember.MonthlyMM[monthIdx] = assignment.AllocationPercent / 100.0
					}
				}
			}
		}

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
		Members:   utilMembers,
	}

	defaultName := fmt.Sprintf("주간업무일지_%s.xlsx", report.WeekStart)
	savePath, err := wailsRuntime.SaveFileDialog(s.app.ctx, wailsRuntime.SaveDialogOptions{
		Title:           "Export Report",
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
		outputDir := filepath.Join(s.app.dataDir, "exports")
		savePath = filepath.Join(outputDir, defaultName)
		log.Printf("SaveDialog cancelled, using default path: %s", savePath)
	}

	outputPath, err := excel.ExportToPath(tmpl.FilePath, savePath, data)
	if err != nil {
		log.Printf("Export error - ExportToPath: %v", err)
		return "", fmt.Errorf("Excel 생성 실패: %w", err)
	}

	if err := s.app.database.UpdateReportStatus(reportID, constants.ReportStatusExported); err != nil {
		log.Println("Warning: failed to update report status:", err)
	}

	log.Printf("Export success: %s", outputPath)
	return outputPath, nil
}
