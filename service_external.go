package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"openreport/internal/db"
	"openreport/internal/integrations"
)

type ExternalService struct {
	app *App
}

func NewExternalService(app *App) *ExternalService {
	return &ExternalService{app: app}
}

func (s *ExternalService) CheckGWSCLI() StatusResult {
	cli := &integrations.GWSCLI{}
	if err := cli.CheckInstalled(); err != nil {
		return StatusResult{Ok: false, Message: err.Error()}
	}
	return StatusResult{Ok: true, Message: "gws CLI is installed"}
}

func (s *ExternalService) CheckGWSAuth() StatusResult {
	cli := &integrations.GWSCLI{}
	if err := cli.CheckAuth(); err != nil {
		return StatusResult{Ok: false, Message: err.Error()}
	}
	return StatusResult{Ok: true, Message: "Google Workspace 인증 성공"}
}

func (s *ExternalService) GetCalendars() ([]integrations.Calendar, error) {
	cli := &integrations.GWSCLI{}
	calendars, err := cli.FetchCalendars()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch calendars: %w", err)
	}
	return calendars, nil
}

func (s *ExternalService) SyncGmail(weekStart, weekEnd string) SyncResult {
	log.Printf("[sync] SyncGmail called: %s ~ %s", weekStart, weekEnd)
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("사용자 조회 실패: %v", err)}
	}

	ints, err := s.app.database.ListIntegrations(user.ID)
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
		return SyncResult{Success: false, Message: "Gmail 연동이 설정되지 않았습니다. 설정 페이지에서 먼저 연결해주세요."}
	}

	cli := &integrations.GWSCLI{}
	if err := cli.CheckAuth(); err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("GWS 인증 실패: %v", err)}
	}

	ws, _ := time.Parse("2006-01-02", weekStart)
	we, _ := time.Parse("2006-01-02", weekEnd)
	count, err := integrations.SyncGmail(s.app.database, "", ws, we, gmailInt.ID)
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("Gmail 동기화 실패: %v", err)}
	}
	s.app.database.UpdateIntegrationSyncTime(gmailInt.ID)
	return SyncResult{Success: true, Count: count, Message: fmt.Sprintf("Gmail sync completed: %d items", count)}
}

func (s *ExternalService) SyncGoogleCalendar(weekStart, weekEnd string) SyncResult {
	log.Printf("[sync] SyncGoogleCalendar called: %s ~ %s", weekStart, weekEnd)
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("사용자 조회 실패: %v", err)}
	}

	ints, err := s.app.database.ListIntegrations(user.ID)
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

	cli := &integrations.GWSCLI{}
	if err := cli.CheckAuth(); err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("GWS 인증 실패: %v", err)}
	}

	var config struct {
		Calendars []integrations.CalendarConfig `json:"calendars"`
	}
	json.Unmarshal([]byte(calInt.ConfigJSON), &config)

	calendarConfigs := config.Calendars
	if len(calendarConfigs) == 0 {
		calendarConfigs = []integrations.CalendarConfig{{ID: "primary", Color: "#3b82f6"}}
	}

	ws, _ := time.Parse("2006-01-02", weekStart)
	we, _ := time.Parse("2006-01-02", weekEnd)
	count, err := integrations.SyncGoogleCalendar(s.app.database, "", ws, we, calInt.ID, calendarConfigs)
	if err != nil {
		return SyncResult{Success: false, Message: fmt.Sprintf("Calendar 동기화 실패: %v", err)}
	}
	s.app.database.UpdateIntegrationSyncTime(calInt.ID)
	return SyncResult{Success: true, Count: count, Message: fmt.Sprintf("Calendar sync completed: %d items", count)}
}

func (s *ExternalService) SyncAll(weekStart, weekEnd string) []SyncResult {
	log.Printf("[sync] SyncAll called: %s ~ %s", weekStart, weekEnd)
	results := make([]SyncResult, 0, 2)
	results = append(results, s.SyncGmail(weekStart, weekEnd))
	results = append(results, s.SyncGoogleCalendar(weekStart, weekEnd))
	return results
}
