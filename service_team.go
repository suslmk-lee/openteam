package main

import (
	"fmt"
	"log"
	"strings"
	"time"

	"openreport/internal/constants"
	"openreport/internal/db"
)

type TeamService struct {
	app *App
}

func NewTeamService(app *App) *TeamService {
	return &TeamService{app: app}
}

func (s *TeamService) ListTeamMembers() ([]db.TeamMember, error) {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return s.app.database.ListTeamMembers(user.ID)
}

func (s *TeamService) SaveTeamMember(member db.TeamMember) (*db.TeamMember, error) {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(member.Name) == "" {
		return nil, fmt.Errorf("team member name is required")
	}
	if member.Email != "" && !strings.Contains(member.Email, "@") {
		return nil, fmt.Errorf("invalid email format")
	}
	member.UserID = user.ID
	id, err := s.app.database.SaveTeamMember(&member)
	if err != nil {
		return nil, err
	}
	member.ID = id
	return &member, nil
}

func (s *TeamService) DeleteTeamMember(id int64) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.database.DeleteTeamMember(user.ID, id)
}

func (s *TeamService) GetPositionTypes() []string {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("[GetPositionTypes] failed to load default user: %v", err)
		return constants.DefaultPositionTypes
	}
	values, err := s.app.getCommonCodeValues(user.ID, string(constants.CodeGroupPosition))
	if err != nil {
		log.Printf("[GetPositionTypes] failed to load common codes: %v", err)
		return constants.DefaultPositionTypes
	}
	return values
}

func (s *TeamService) AddPositionType(value string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.addCommonCodeValue(user.ID, string(constants.CodeGroupPosition), value)
}

func (s *TeamService) DeletePositionType(value string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.removeCommonCodeValue(user.ID, string(constants.CodeGroupPosition), value)
}

func (s *TeamService) GetEmploymentTypes() []string {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("[GetEmploymentTypes] failed to load default user: %v", err)
		return constants.DefaultEmploymentTypes
	}
	values, err := s.app.getCommonCodeValues(user.ID, string(constants.CodeGroupEmployment))
	if err != nil {
		log.Printf("[GetEmploymentTypes] failed to load common codes: %v", err)
		return constants.DefaultEmploymentTypes
	}
	return values
}

func (s *TeamService) AddEmploymentType(value string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.addCommonCodeValue(user.ID, string(constants.CodeGroupEmployment), value)
}

func (s *TeamService) DeleteEmploymentType(value string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.removeCommonCodeValue(user.ID, string(constants.CodeGroupEmployment), value)
}

func (s *TeamService) GetSIProjectTypes() []string {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("[GetSIProjectTypes] failed to load default user: %v", err)
		return constants.DefaultProjectTypes
	}
	values, err := s.app.getCommonCodeValues(user.ID, string(constants.CodeGroupProjectType))
	if err != nil {
		log.Printf("[GetSIProjectTypes] failed to load common codes: %v", err)
		return constants.DefaultProjectTypes
	}
	return values
}

func (s *TeamService) AddSIProjectType(value string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.addCommonCodeValue(user.ID, string(constants.CodeGroupProjectType), value)
}

func (s *TeamService) DeleteSIProjectType(value string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.removeCommonCodeValue(user.ID, string(constants.CodeGroupProjectType), value)
}

func (s *TeamService) GetSIPhases() []string {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		log.Printf("[GetSIPhases] failed to load default user: %v", err)
		return constants.DefaultProjectPhases
	}
	values, err := s.app.getCommonCodeValues(user.ID, string(constants.CodeGroupProjectPhase))
	if err != nil {
		log.Printf("[GetSIPhases] failed to load common codes: %v", err)
		return constants.DefaultProjectPhases
	}
	return values
}

func (s *TeamService) AddSIPhase(value string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.addCommonCodeValue(user.ID, string(constants.CodeGroupProjectPhase), value)
}

func (s *TeamService) DeleteSIPhase(value string) error {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return err
	}
	return s.app.removeCommonCodeValue(user.ID, string(constants.CodeGroupProjectPhase), value)
}

func (s *TeamService) GetSIRoles() []string {
	return constants.DefaultSIRoles
}

func (s *TeamService) ListMemberAssignments(weekStart, weekEnd string) ([]db.MemberAssignment, error) {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(weekStart) == "" || strings.TrimSpace(weekEnd) == "" {
		wk := s.app.GetCurrentWeek()
		weekStart = wk.WeekStart
		weekEnd = wk.WeekEnd
	}
	return s.app.database.ListMemberAssignments(user.ID, weekStart, weekEnd)
}

func (s *TeamService) GetUtilizationByDate(date string) ([]db.UtilizationMemberRow, error) {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(date) == "" {
		date = time.Now().Format("2006-01-02")
	}
	return s.app.database.GetUtilizationByDate(user.ID, date)
}

func (s *TeamService) GetSIWeeklySnapshot(weekStart, weekEnd string) (*db.SIWeeklySnapshot, error) {
	user, err := s.app.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(weekStart) == "" || strings.TrimSpace(weekEnd) == "" {
		wk := s.app.GetCurrentWeek()
		weekStart = wk.WeekStart
		weekEnd = wk.WeekEnd
	}
	return s.app.database.GetSIWeeklySnapshot(user.ID, weekStart, weekEnd)
}
