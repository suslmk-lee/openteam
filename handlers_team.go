// --- Integrations ---

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"openreport/internal/constants"
	"openreport/internal/db"
)

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

var validSIProjectStatuses = map[string]bool{}

func init() {
	for _, phase := range constants.DefaultProjectPhases {
		validSIProjectStatuses[phase] = true
	}
}

type commonCodeSeed struct {
	GroupCode   string
	GroupName   string
	Description string
	Values      []db.CodeValue
}

var defaultCommonCodeSeeds = []commonCodeSeed{
	{
		GroupCode:   string(constants.CodeGroupPosition),
		GroupName:   "Position Types",
		Description: "Default code values for positions",
		Values: []db.CodeValue{
			{CodeValue: "Staff", CodeLabel: "Staff", SortOrder: 0, IsActive: true},
			{CodeValue: "Manager", CodeLabel: "Manager", SortOrder: 1, IsActive: true},
			{CodeValue: "PM", CodeLabel: "PM", SortOrder: 2, IsActive: true},
		},
	},
	{
		GroupCode:   string(constants.CodeGroupEmployment),
		GroupName:   "Employment Types",
		Description: "Default code values for employment types",
		Values: []db.CodeValue{
			{CodeValue: "Full-time", CodeLabel: "Full-time", SortOrder: 0, IsActive: true},
			{CodeValue: "Part-time", CodeLabel: "Part-time", SortOrder: 1, IsActive: true},
			{CodeValue: "Contract", CodeLabel: "Contract", SortOrder: 2, IsActive: true},
		},
	},
	{
		GroupCode:   string(constants.CodeGroupProjectType),
		GroupName:   "Project Types",
		Description: "Default project type values",
		Values: []db.CodeValue{
			{CodeValue: "SI", CodeLabel: "SI", SortOrder: 0, IsActive: true},
			{CodeValue: "SM", CodeLabel: "SM", SortOrder: 1, IsActive: true},
			{CodeValue: "Outsourcing", CodeLabel: "Outsourcing", SortOrder: 2, IsActive: true},
			{CodeValue: "Maintenance", CodeLabel: "Maintenance", SortOrder: 3, IsActive: true},
			{CodeValue: "Other", CodeLabel: "Other", SortOrder: 4, IsActive: true},
		},
	},
	{
		GroupCode:   string(constants.CodeGroupProjectPhase),
		GroupName:   "Project Phases",
		Description: "Default project phase values",
		Values: []db.CodeValue{
			{CodeValue: "poc_proposal", CodeLabel: "PoC Proposal", SortOrder: 0, IsActive: true},
			{CodeValue: "in_progress", CodeLabel: "In Progress", SortOrder: 1, IsActive: true},
			{CodeValue: "in_development", CodeLabel: "In Development", SortOrder: 2, IsActive: true},
			{CodeValue: "in_operation", CodeLabel: "In Operation", SortOrder: 3, IsActive: true},
			{CodeValue: "completed", CodeLabel: "Completed", SortOrder: 4, IsActive: true},
			{CodeValue: "cancelled", CodeLabel: "Cancelled", SortOrder: 5, IsActive: true},
			{CodeValue: "closed", CodeLabel: "Closed", SortOrder: 6, IsActive: true},
		},
	},
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

func (a *App) getCommonCodeValues(userID int64, groupCode string) ([]string, error) {
	values, err := a.database.ListCodeValuesByGroup(userID, groupCode)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(values))
	for _, v := range values {
		out = append(out, v.CodeValue)
	}
	return out, nil
}

func (a *App) ensureDefaultCommonCodes(userID int64) error {
	groups, err := a.database.ListCodeGroups(userID)
	if err != nil {
		return err
	}
	existingGroups := map[string]bool{}
	for _, g := range groups {
		existingGroups[g.GroupCode] = true
	}

	for _, seed := range defaultCommonCodeSeeds {
		if !existingGroups[seed.GroupCode] {
			_, err := a.database.SaveCodeGroup(&db.CodeGroup{
				UserID:      userID,
				GroupCode:   seed.GroupCode,
				GroupName:   seed.GroupName,
				Description: seed.Description,
				SortOrder:   len(groups),
			})
			if err != nil {
				return err
			}
			existingGroups[seed.GroupCode] = true
		}

		existingValues, err := a.database.ListCodeValuesByGroup(userID, seed.GroupCode)
		if err != nil {
			return err
		}
		existingSet := map[string]bool{}
		for _, v := range existingValues {
			existingSet[strings.ToLower(strings.TrimSpace(v.CodeValue))] = true
		}

		for _, v := range seed.Values {
			key := strings.ToLower(strings.TrimSpace(v.CodeValue))
			if key == "" || existingSet[key] {
				continue
			}
			if _, err := a.database.SaveCodeValue(&db.CodeValue{
				UserID:      userID,
				GroupCode:   seed.GroupCode,
				CodeValue:   v.CodeValue,
				CodeLabel:   v.CodeLabel,
				Description: v.Description,
				SortOrder:   v.SortOrder,
				IsActive:    v.IsActive,
			}); err != nil {
				return err
			}
		}
	}
	return nil
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
	return a.team.ListTeamMembers()
}

func (a *App) SaveTeamMember(member db.TeamMember) (*db.TeamMember, error) {
	return a.team.SaveTeamMember(member)
}

func (a *App) DeleteTeamMember(id int64) error {
	return a.team.DeleteTeamMember(id)
}

func (a *App) GetPositionTypes() []string {
	return a.team.GetPositionTypes()
}

func (a *App) AddPositionType(value string) error {
	return a.team.AddPositionType(value)
}

func (a *App) DeletePositionType(value string) error {
	return a.team.DeletePositionType(value)
}

func (a *App) GetEmploymentTypes() []string {
	return a.team.GetEmploymentTypes()
}

func (a *App) AddEmploymentType(value string) error {
	return a.team.AddEmploymentType(value)
}

func (a *App) DeleteEmploymentType(value string) error {
	return a.team.DeleteEmploymentType(value)
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
	phases, err := a.getCommonCodeValues(user.ID, string(constants.CodeGroupProjectPhase))
	if err != nil {
		phases = append([]string{}, constants.DefaultProjectPhases...)
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
	phases, err := a.getCommonCodeValues(user.ID, string(constants.CodeGroupProjectPhase))
	if err != nil {
		phases = append([]string{}, constants.DefaultProjectPhases...)
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
	return a.team.ListMemberAssignments(weekStart, weekEnd)
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
	return a.team.GetSIProjectTypes()
}

func (a *App) AddSIProjectType(value string) error {
	return a.team.AddSIProjectType(value)
}

func (a *App) DeleteSIProjectType(value string) error {
	return a.team.DeleteSIProjectType(value)
}

func (a *App) GetSIPhases() []string {
	return a.team.GetSIPhases()
}

func (a *App) AddSIPhase(value string) error {
	return a.team.AddSIPhase(value)
}

func (a *App) DeleteSIPhase(value string) error {
	return a.team.DeleteSIPhase(value)
}

func (a *App) GetSIRoles() []string {
	return a.team.GetSIRoles()
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
	return a.team.GetUtilizationByDate(date)
}

func (a *App) GetSIWeeklySnapshot(weekStart, weekEnd string) (*db.SIWeeklySnapshot, error) {
	return a.team.GetSIWeeklySnapshot(weekStart, weekEnd)
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

	// For personal attendance, auto-create self team member if teamMemberId is 0
	if record.TeamMemberID == 0 {
		selfMemberID, err := a.database.GetOrCreateSelfTeamMember(user.ID, user.Name)
		if err != nil {
			return nil, fmt.Errorf("failed to get or create self team member: %w", err)
		}
		record.TeamMemberID = selfMemberID
	}

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

// GetMyAttendanceSummary returns personal attendance summary for the date range
func (a *App) GetMyAttendanceSummary(startDate, endDate string) (*db.MyAttendanceSummary, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(startDate) == "" || strings.TrimSpace(endDate) == "" {
		now := time.Now()
		startDate = now.Format("2006-01-02")
		endDate = now.Format("2006-01-02")
	}

	log.Printf("[GetMyAttendanceSummary] userID=%d, startDate=%s, endDate=%s", user.ID, startDate, endDate)

	records, err := a.database.ListAttendanceRecords(user.ID, 0, startDate, endDate)
	if err != nil {
		return nil, err
	}

	summary := &db.MyAttendanceSummary{}
	for _, r := range records {
		switch r.Type {
		case "vacation":
			summary.VacationDays++
		case "morning_half":
			summary.MorningHalfDays++
		case "afternoon_half":
			summary.AfternoonHalfDays++
		}
		summary.TotalDays++
	}
	return summary, nil
}

// --- Manual Activity ---

// ListActivitiesByDateRange returns activities within a date range
func (a *App) ListActivitiesByDateRange(startDate, endDate string) ([]db.Activity, error) {
	return a.database.ListActivities(startDate, endDate)
}

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
	return fmt.Sprintf("%02d-%02d", month, weekNum)
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

	if err := a.database.SaveTeamProfile(user.ID, &profile); err != nil {
		return err
	}

	root := strings.TrimSpace(profile.VaultRoot)
	if root == "" {
		a.vaultRoot = defaultVaultRoot
	} else {
		a.vaultRoot = root
	}
	return nil
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
