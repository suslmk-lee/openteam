// --- GWS Integration ---

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"openreport/internal/ai"
	"openreport/internal/db"
	"openreport/internal/integrations"
)

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
	return a.external.CheckGWSCLI()
}

// CheckGWSAuth checks if gws is authenticated
func (a *App) CheckGWSAuth() StatusResult {
	return a.external.CheckGWSAuth()
}

// GetCalendars returns the list of available Google Calendars
func (a *App) GetCalendars() ([]integrations.Calendar, error) {
	return a.external.GetCalendars()
}

// SetupGWSAuth opens gws auth setup in terminal
func (a *App) SetupGWSAuth() (string, error) {
	return "?곕??먯뿉??'gws auth setup'???ㅽ뻾?섏뿬 Google Workspace ?몄쬆???ㅼ젙?섏꽭??", nil
}

func (a *App) SyncGmail(weekStart, weekEnd string) SyncResult {
	return a.external.SyncGmail(weekStart, weekEnd)
}

func (a *App) SyncGoogleCalendar(weekStart, weekEnd string) SyncResult {
	return a.external.SyncGoogleCalendar(weekStart, weekEnd)
}

func (a *App) SyncAll(weekStart, weekEnd string) []SyncResult {
	return a.external.SyncAll(weekStart, weekEnd)
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
		if project.Status == "醫낅즺" {
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

			// Add "湲덉＜ 吏꾪뻾?ы빆" as a report item
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

			// Add "李⑥＜ 怨꾪쉷" as a report item
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

			// Add "由ъ뒪?? as a report item if exists
			if strings.TrimSpace(wr.Risks) != "" {
				content := fmt.Sprintf("[%s] 由ъ뒪?? %s", project.Name, wr.Risks)
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
		return nil, fmt.Errorf("? ?꾨줈?꾩쓣 遺덈윭?????놁뒿?덈떎")
	}
	if profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("linear API key is not configured")
	}
	return fetchLinearDashboard(profile.LinearAPIKey, profile.LinearTeamID)
}

func fetchLinearDashboard(apiKey, teamID string) (*LinearDashboardData, error) {
	return callLinearAPI(apiKey, teamID)
}

func (a *App) GetLinearTeamStates() ([]LinearWorkflowState, error) {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("linear API key is not configured")
	}
	return GetLinearTeamStates(profile.LinearAPIKey, profile.LinearTeamID)
}

func (a *App) UpdateLinearIssueState(issueID, stateID string) error {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return fmt.Errorf("linear API key is not configured")
	}
	return UpdateLinearIssueState(profile.LinearAPIKey, issueID, stateID)
}

func (a *App) GetLinearTeamMembers() ([]LinearTeamMember, error) {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("linear API key is not configured")
	}
	return GetLinearTeamMembers(profile.LinearAPIKey, profile.LinearTeamID)
}

func (a *App) GetLinearTeamLabels() ([]LinearIssueLabel, error) {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("linear API key is not configured")
	}
	if strings.TrimSpace(profile.LinearTeamID) == "" {
		return nil, fmt.Errorf("linear team id is not configured")
	}
	return GetLinearTeamLabels(profile.LinearAPIKey, profile.LinearTeamID)
}

// GetMyLinearIssues retrieves Linear issues assigned to the current user
func (a *App) GetMyLinearIssues() ([]LinearIssue, error) {
	profile, err := a.GetTeamProfile()
	if err != nil {
		return nil, fmt.Errorf("? ?꾨줈?꾩쓣 遺덈윭?????놁뒿?덈떎")
	}
	if profile.LinearAPIKey == "" {
		return nil, fmt.Errorf("linear API key is not configured")
	}
	return GetMyLinearIssues(profile.LinearAPIKey, profile.LinearTeamID, profile.LinearUserID)
}

// LookupLinearViewer resolves current viewer info from a Linear API key.
// If apiKey is empty, falls back to the saved team profile key.
func (a *App) LookupLinearViewer(apiKey string) (map[string]string, error) {
	key := strings.TrimSpace(apiKey)
	if key == "" {
		profile, err := a.GetTeamProfile()
		if err == nil {
			key = strings.TrimSpace(profile.LinearAPIKey)
		}
	}
	if key == "" {
		return nil, fmt.Errorf("linear api key is not configured")
	}

	viewer, err := getLinearViewer(key)
	if err != nil {
		return nil, err
	}

	return map[string]string{
		"id":    viewer.ID,
		"name":  viewer.Name,
		"email": viewer.Email,
	}, nil
}

// AutoMapLinearMembers matches app team members to Linear members by email then name,
// saves the linear_user_id, and returns the count of newly mapped members.
func (a *App) AutoMapLinearMembers() (int, error) {
	profile, err := a.GetTeamProfile()
	if err != nil || profile.LinearAPIKey == "" {
		return 0, fmt.Errorf("linear API key is not configured")
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
		return fmt.Errorf("linear API key is not configured")
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
		return ClaudeChatResult{}, fmt.Errorf("claude CLI ?ㅻ쪟: %s", errMsg)
	}

	// Parse NDJSON output ??find the last line with "type":"result" and assistant message for model
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
		return ClaudeChatResult{}, fmt.Errorf("claude CLI ?묐떟 ?뚯떛 ?ㅽ뙣")
	}
	if found.IsError {
		return ClaudeChatResult{}, fmt.Errorf("claude CLI ?ㅻ쪟: %s", found.Result)
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
	cmdRe := regexp.MustCompile("(?m)^\\s*[`*-]?\\s*(`?)(/(\\w[\\w-]*(?::\\w[\\w-]*)*))`?\\s*(?:[-??\\s*(.+))?$")

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
		priorityLabels := []string{"", "湲닿툒", "?믪쓬", "蹂댄넻", "??쓬"}
		if issue.Priority < len(priorityLabels) {
			priority = fmt.Sprintf(", ?곗꽑?쒖쐞: %s", priorityLabels[issue.Priority])
		}
	}

	return fmt.Sprintf("[%s] %s (?곹깭: %s%s)\n  %s",
		issue.Identifier, issue.Title, issue.State.Name, priority, desc)
}

func looksLikeEncodingIssueReply(reply string) bool {
	s := strings.ToLower(strings.TrimSpace(reply))
	if s == "" {
		return true
	}

	patterns := []string{
		"encoding issue",
		"encoding issues",
		"difficult to read",
		"resend your message",
		"proper encoding",
		"text appears to be corrupted",
		"cannot read your message clearly",
	}
	for _, p := range patterns {
		if strings.Contains(s, p) {
			return true
		}
	}

	mojibakeMarkers := []string{"??", "癰", "筌", "袁", "雅뚯", "獄", "甕"}
	for _, m := range mojibakeMarkers {
		if strings.Contains(reply, m) {
			return true
		}
	}
	return false
}

func normalizeLinearNarrativeContent(content string) string {
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
		if line != "" {
			lines = append(lines, line)
		}
	}
	if len(lines) == 0 {
		return ""
	}

	hasProgress := false
	hasPlan := false
	for _, line := range lines {
		if strings.HasPrefix(line, "- 진행 내용:") || strings.HasPrefix(line, "진행 내용:") {
			hasProgress = true
		}
		if strings.HasPrefix(line, "- 차주 계획:") || strings.HasPrefix(line, "차주 계획:") {
			hasPlan = true
		}
	}
	if hasProgress && hasPlan {
		return strings.Join(lines, "\n")
	}

	if len(lines) == 1 {
		return lines[0] + "\n- 진행 내용: (진행 내용 없음)\n- 차주 계획: (차주 계획 없음)"
	}
	if len(lines) == 2 {
		return lines[0] + "\n- 진행 내용: " + lines[1] + "\n- 차주 계획: (차주 계획 없음)"
	}
	return lines[0] + "\n- 진행 내용: " + lines[1] + "\n- 차주 계획: " + strings.Join(lines[2:], " ")
}

// generateLinearReportWithAISafe is the sanitized variant used by Linear populate flow.
// It avoids mojibake prompt text and rejects encoding-error style AI replies.
func (a *App) generateLinearReportWithAISafe(issues []LinearIssue, projectName, categoryName string) (string, error) {
	digests := make([]string, 0, len(issues))
	for _, issue := range issues {
		digests = append(digests, buildLinearIssueDigest(issue))
	}
	digestLines := strings.Join(digests, "\n\n")

	systemPrompt := `당신은 주간업무일지 작성 보조자입니다.
Linear 이슈 목록을 바탕으로 한국어 보고서용 문장을 작성하세요.
설명 없이 결과 문장만 출력하세요.`

	userPrompt := fmt.Sprintf(`[입력]
프로젝트명: %s
카테고리: %s
이슈 수: %d

[이슈 목록]
%s

[작성 규칙]
1. 출력 형식(반드시 3줄):
   - 1줄: 프로젝트명
   - 2줄: " - 진행 내용: ..."
   - 3줄: " - 차주 계획: ..."
2. 이슈 ID/URL/마크다운/특수문자는 출력하지 않습니다.
3. 진행 내용은 완료/진행 중 이슈 중심으로, 차주 계획은 Todo/Backlog 중심으로 작성합니다.
4. 각 줄은 자연스러운 한국어 한 문장으로 간결하게 작성합니다.`,
		projectName, categoryName, len(issues), digestLines)

	claudeCheck := a.CheckClaudeCLI()
	if ok, _ := claudeCheck["ok"].(bool); ok {
		result, err := a.ClaudeChatWithSession(systemPrompt+"\n\n---\n\n"+userPrompt, "", "")
		if err == nil {
			normalized := normalizeLinearNarrativeContent(result.Reply)
			if !looksLikeEncodingIssueReply(normalized) {
				return normalized, nil
			}
			log.Printf("[Linear AI Safe] Claude reply looked encoding-related, fallback to OpenAI")
		} else {
			log.Printf("[Linear AI Safe] Claude CLI failed, fallback to OpenAI: %v", err)
		}
	}

	cfg, err := a.getOpenAIConfigForFeature(ai.FeatureLinearSummary)
	if err != nil || cfg == nil {
		return "", fmt.Errorf("AI 설정이 없습니다. Claude CLI 설치 또는 OpenAI API Key를 설정해주세요")
	}

	client := ai.NewClient(cfg.APIKey, cfg.Model, cfg.BaseURL)
	reply, err := client.ChatCompletion(systemPrompt, userPrompt)
	if err != nil {
		return "", fmt.Errorf("OpenAI API 호출 실패: %w", err)
	}

	normalized := normalizeLinearNarrativeContent(reply)
	if looksLikeEncodingIssueReply(normalized) {
		return "", fmt.Errorf("AI 응답이 인코딩 오류 안내문으로 감지되어 보고서 항목 생성을 중단했습니다")
	}
	return normalized, nil
}

// generateLinearReportWithAI converts Linear issues to report text via AI (Claude CLI or OpenAI)
func (a *App) generateLinearReportWithAI(issues []LinearIssue, projectName, categoryName string) (string, error) {
	// Build issue digest list
	digests := []string{}
	for _, issue := range issues {
		digests = append(digests, buildLinearIssueDigest(issue))
	}
	digestLines := strings.Join(digests, "\n\n")

	systemPrompt := `?덈뒗 二쇨컙?낅Т 蹂닿퀬?쒕? ?묒꽦?섎뒗 蹂댁“?먮떎.
Linear ?댁뒋 紐⑸줉??諛쏆븘 ?섎굹??蹂닿퀬????ぉ?쇰줈 ?듯빀 ?묒꽦?쒕떎.
?먮Ц 蹂듬텤, ?댁뒋 ID쨌URL ??硫뷀??뺣낫 ?섏뿴??湲덉??쒕떎.
?묒? 蹂닿퀬???ㅼ쓽 媛꾧껐???쒖닠?뺤쑝濡??묒꽦?쒕떎.`

	userPrompt := fmt.Sprintf(`[?낅젰]
?꾨줈?앺듃: %s
移댄뀒怨좊━: %s
?댁뒋 嫄댁닔: %d嫄?

[?댁뒋 紐⑸줉]
%s

[?묒꽦 洹쒖튃]
1. ?댁뒋 紐⑸줉??醫낇빀??媛???듭떖?곸씤 ?낅Т紐??낅Т ?붿빟)??泥?以꾩뿉 ?묒꽦
   - ?? "API ?곕룞 媛쒖꽑", "?곗씠?곕쿋?댁뒪 留덉씠洹몃젅?댁뀡", "踰꾧렇 ?섏젙 諛?理쒖쟻??
   - ?꾨줈?앺듃 ?대쫫???꾨땶 ?ㅼ젣 ?묒뾽 ?댁슜???붿빟???대쫫
2. ??踰덉㎏ 以꾩뿉??吏꾪뻾 ?꾪솴??媛꾨떒???ㅻ챸
3. ??踰덉㎏ 以꾩뿉???덉젙???꾩냽 議곗튂瑜??ㅻ챸
4. ?댁뒋 ID, URL, 湲곗닠 ?⑹뼱 ?섏뿴 湲덉?
5. ?낅Т 留λ씫怨?吏꾪뻾 ?먮쫫 以묒떖 ?쒖닠
6. 媛?以?100???대궡

[異쒕젰 ?덉떆]
API ??蹂댁븞 媛뺥솕
 - ?ъ슜???몄쬆 API 媛쒖꽑 ?묒뾽 吏꾪뻾 以? 湲곕낯 援ы쁽 ?꾨즺
 - ?먮윭 泥섎━ 媛쒖꽑 諛?臾몄꽌???덉젙

二쇱쓽: 媛?以꾩? "??ぉ紐?: ?댁슜" ?뺤떇?쇰줈 ?묒꽦?섎릺, ?댁슜 ?욎뿉 ???-)瑜?異붽??섏? 留덉꽭??`,
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
	cfg, err := a.getOpenAIConfigForFeature(ai.FeatureLinearSummary)
	if err != nil || cfg == nil {
		return "", fmt.Errorf("AI ?ㅼ젙???놁뒿?덈떎. Claude CLI ?ㅼ튂 ?먮뒗 OpenAI API Key瑜??ㅼ젙?댁＜?몄슂")
	}

	client := ai.NewClient(cfg.APIKey, cfg.Model, cfg.BaseURL)
	reply, err := client.ChatCompletion(systemPrompt, userPrompt)
	if err != nil {
		return "", fmt.Errorf("OpenAI API ?몄텧 ?ㅽ뙣: %w", err)
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
		return 0, fmt.Errorf("linear API key is not configured")
	}

	// Get my issues
	myIssues, err := GetMyLinearIssues(profile.LinearAPIKey, profile.LinearTeamID, profile.LinearUserID)
	if err != nil {
		return 0, fmt.Errorf("Linear ?댁뒋 議고쉶 ?ㅽ뙣: %w", err)
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
			content, err := a.generateLinearReportWithAISafe(group.thisWeekIssues, group.projectName, group.categoryName)
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
			content, err := a.generateLinearReportWithAISafe(group.nextWeekIssues, group.projectName, group.categoryName)
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
