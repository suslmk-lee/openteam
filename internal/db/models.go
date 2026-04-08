package db

import "time"

type User struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Team      string    `json:"team"`
	CreatedAt time.Time `json:"createdAt"`
}

type Integration struct {
	ID           int64      `json:"id"`
	UserID       int64      `json:"userId"`
	ToolType     string     `json:"toolType"`
	ConfigJSON   string     `json:"configJson"`
	Enabled      bool       `json:"enabled"`
	LastSyncedAt *time.Time `json:"lastSyncedAt"`
}

type Activity struct {
	ID            int64     `json:"id"`
	IntegrationID int64     `json:"integrationId"`
	Source        string    `json:"source"`
	ExternalID    string    `json:"externalId"`
	Title         string    `json:"title"`
	Summary       string    `json:"summary"`
	RawData       string    `json:"rawData"`
	ActivityDate  string    `json:"activityDate"`
	FetchedAt     time.Time `json:"fetchedAt"`
}

type WeeklyReport struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"userId"`
	WeekStart string    `json:"weekStart"`
	WeekEnd   string    `json:"weekEnd"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type ReportItem struct {
	ID         int64  `json:"id"`
	ReportID   int64  `json:"reportId"`
	ActivityID *int64 `json:"activityId"`
	Section    string `json:"section"`
	Category   string `json:"category"`
	WorkType   string `json:"workType"`
	Content    string `json:"content"`
	Period     string `json:"period"` // "this_week" or "next_week"
	SortOrder  int    `json:"sortOrder"`
	IsSelected bool   `json:"isSelected"`
}

type ExcelTemplate struct {
	ID            int64     `json:"id"`
	UserID        int64     `json:"userId"`
	Name          string    `json:"name"`
	FilePath      string    `json:"filePath"`
	StructureJSON string    `json:"structureJson"`
	CreatedAt     time.Time `json:"createdAt"`
}

type ProjectCategory struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"userId"`
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
}

type TeamMember struct {
	ID             int64     `json:"id"`
	UserID         int64     `json:"userId"`
	Name           string    `json:"name"`
	Position       string    `json:"position"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
	EmploymentType string    `json:"employmentType"`
	HireDate       string    `json:"hireDate"`
	ResignDate     *string   `json:"resignDate"`
	Active         bool      `json:"active"`
	LinearUserID   string    `json:"linearUserId"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Project struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"userId"`
	TeamType    string    `json:"teamType"`
	ClientID    int64     `json:"clientId"`
	Name        string    `json:"name"`
	ClientName  string    `json:"clientName"`
	Status      string    `json:"status"`
	Description string    `json:"description"`
	StartDate   string    `json:"startDate"`
	EndDate     *string   `json:"endDate"`
	CreatedAt   time.Time `json:"createdAt"`
	// SI Project Detail fields (migrated from si_project_details table)
	ProjectType  string  `json:"projectType"`  // 직영, 당선, 신대방동, 거제 등
	PMName       string  `json:"pmName"`       // 프로젝트 책임자/PM
	TotalMM      float64 `json:"totalMM"`      // 총 투입 M/M
	ProgressRate int     `json:"progressRate"` // 진행율 %
}

type MemberAssignment struct {
	ID                int64     `json:"id"`
	UserID            int64     `json:"userId"`
	TeamMemberID      int64     `json:"teamMemberId"`
	ProjectID         int64     `json:"projectId"`
	AllocationPercent float64   `json:"allocationPercent"`
	StartDate         string    `json:"startDate"`
	EndDate           *string   `json:"endDate"`
	WorkMode          string    `json:"workMode"`
	Notes             string    `json:"notes"`
	CreatedAt         time.Time `json:"createdAt"`
}

type UtilizationMemberRow struct {
	TeamMemberID      int64   `json:"teamMemberId"`
	TeamMemberName    string  `json:"teamMemberName"`
	AllocationPercent float64 `json:"allocationPercent"`
	Unassigned        bool    `json:"unassigned"`
	OverAllocated     bool    `json:"overAllocated"`
}

type ProjectStatusCount struct {
	Status string `json:"status"`
	Count  int    `json:"count"`
}

type SIWeeklySnapshot struct {
	WeekStart              string                 `json:"weekStart"`
	WeekEnd                string                 `json:"weekEnd"`
	TeamUtilizationPercent float64                `json:"teamUtilizationPercent"`
	UnassignedCount        int                    `json:"unassignedCount"`
	MemberRows             []UtilizationMemberRow `json:"memberRows"`
	ProjectStatusCounts    []ProjectStatusCount   `json:"projectStatusCounts"`
}

type AttendanceRecord struct {
	ID                int64     `json:"id"`
	UserID            int64     `json:"userId"`
	TeamMemberID      int64     `json:"teamMemberId"`
	TeamMemberName    string    `json:"teamMemberName"` // From JOIN with team_members
	RecordDate        string    `json:"recordDate"`
	Type              string    `json:"type"`
	CheckInTime       *string   `json:"checkInTime"`
	CheckOutTime      *string   `json:"checkOutTime"`
	Notes             string    `json:"notes"`
	IntegrationSource string    `json:"integrationSource"`
	ExternalID        string    `json:"externalId"`
	CreatedAt         time.Time `json:"createdAt"`
}

type AttendanceSummary struct {
	TeamMemberID      int64  `json:"teamMemberId"`
	TeamMemberName    string `json:"teamMemberName"`
	VacationDays      int    `json:"vacationDays"`
	MorningHalfDays   int    `json:"morningHalfDays"`
	AfternoonHalfDays int    `json:"afternoonHalfDays"`
	TotalDays         float64 `json:"totalDays"`
}

// Client master data for managing customers
type Client struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"userId"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	OwnerName    string    `json:"ownerName"`
	ContactEmail string    `json:"contactEmail"`
	Notes        string    `json:"notes"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
}

// Extended Project with client reference - uses embedded Project fields
type ProjectWithClient struct {
	Project
}

// SIProjectDetail extends Project with SI-specific weekly reporting fields
type SIProjectDetail struct {
	ID           int64   `json:"id"`
	UserID       int64   `json:"userId"`
	ProjectID    int64   `json:"projectId"`
	ProjectType  string  `json:"projectType"` // 직영, 당선, 신대방동, 거제 등
	PMName       string  `json:"pmName"`      // 프로젝트 책임자/PM
	TotalMM      float64 `json:"totalMM"`     // 총 투입 M/M
	CurrentPhase string  `json:"currentPhase"` // 현재 진행단계
	ProgressRate int     `json:"progressRate"` // 진행율 %
	CreatedAt    time.Time `json:"createdAt"`
}

// SIWeeklyReport stores weekly progress for SI projects
type SIWeeklyReport struct {
	ID               int64     `json:"id"`
	UserID           int64     `json:"userId"`
	ProjectID        int64     `json:"projectId"`
	WeekStart        string    `json:"weekStart"`
	WeekEnd          string    `json:"weekEnd"`
	ThisWeekProgress string    `json:"thisWeekProgress"` // 금주 진행사항
	NextWeekPlan     string    `json:"nextWeekPlan"`     // 차주 계획
	Risks            string    `json:"risks"`            // 리스크/이슈
	Notes            string    `json:"notes"`            // 비고
	CreatedAt        time.Time `json:"createdAt"`
}

// SIProjectMember stores project member assignments with SI-specific details
type SIProjectMember struct {
	ID           int64   `json:"id"`
	UserID       int64   `json:"userId"`
	ProjectID    int64   `json:"projectId"`
	TeamMemberID int64   `json:"teamMemberId"`
	MemberName   string  `json:"memberName"`
	Role         string  `json:"role"`       // 역할 (책임, 선임, 등)
	AllocationMM float64 `json:"allocationMM"` // 투입 M/M
	StartDate    string  `json:"startDate"`
	EndDate      *string `json:"endDate"`
}

// SIProjectView combines Project + SIProjectDetail + WeeklyReport for UI display
type SIProjectView struct {
	Project          Project          `json:"project"`
	Detail           *SIProjectDetail `json:"detail,omitempty"`
	Members          []SIProjectMember `json:"members"`
	WeeklyReport     *SIWeeklyReport  `json:"weeklyReport,omitempty"`
}

// CodeGroup represents a group of common codes (e.g., position_types, employment_types)
type CodeGroup struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userId"`
	GroupCode   string    `json:"groupCode"`
	GroupName   string    `json:"groupName"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sortOrder"`
	CreatedAt   time.Time `json:"createdAt"`
}

// TeamProfile stores the team type and basic setup info
type TeamProfile struct {
	TeamType    string `json:"teamType"`    // si_business, si_field, small_team
	TeamName    string `json:"teamName"`
	UserName    string `json:"userName"`
	MemberCount int    `json:"memberCount"`
	SetupDone   bool   `json:"setupDone"`
	LinearAPIKey string `json:"linearApiKey"`
	LinearTeamID string `json:"linearTeamId"`
}

// Issue stores issues/risks for si_field team
type Issue struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userId"`
	ProjectID   *int64    `json:"projectId"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Severity    string    `json:"severity"`   // critical, high, medium, low
	Status      string    `json:"status"`     // open, in_progress, resolved, closed
	Assignee    string    `json:"assignee"`
	DueDate     *string   `json:"dueDate"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Retrospective stores weekly retro for small_team
type Retrospective struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userId"`
	WeekStart   string    `json:"weekStart"`
	WeekEnd     string    `json:"weekEnd"`
	WentWell    string    `json:"wentWell"`
	ToImprove   string    `json:"toImprove"`
	ActionItems string    `json:"actionItems"`
	CreatedAt   time.Time `json:"createdAt"`
}

// CodeValue represents a single code value within a group
type CodeValue struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userId"`
	GroupCode   string    `json:"groupCode"`
	CodeValue   string    `json:"codeValue"`
	CodeLabel   string    `json:"codeLabel"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sortOrder"`
	IsActive    bool      `json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
}
