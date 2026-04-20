package db

type User struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Team      string `json:"team"`
	CreatedAt string `json:"createdAt"`
}

type Integration struct {
	ID           int64   `json:"id"`
	UserID       int64   `json:"userId"`
	ToolType     string  `json:"toolType"`
	ConfigJSON   string  `json:"configJson"`
	Enabled      bool    `json:"enabled"`
	LastSyncedAt *string `json:"lastSyncedAt"`
}

type VaultItem struct {
	ID         int64  `json:"id"`
	Type       string `json:"type"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	ParentID   *int64 `json:"parentId"`
	ModifiedAt string `json:"modifiedAt"`
	Size       int64  `json:"size"`
	CreatedAt  string `json:"createdAt"`
}

type VaultFile struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	Content    string `json:"content"`
	ModifiedAt string `json:"modifiedAt"`
	Size       int64  `json:"size"`
}

type VaultReference struct {
	Path    string `json:"path"`
	Title   string `json:"title"`
	Snippet string `json:"snippet"`
	Content string `json:"content"`
}

type IngestResult struct {
	SourceType       string   `json:"sourceType"`
	Source           string   `json:"source"`
	Model            string   `json:"model"`
	RequestedBy      string   `json:"requestedBy"`
	Status           string   `json:"status"`
	Warnings         []string `json:"warnings,omitempty"`
	RawPath          string   `json:"rawPath,omitempty"`
	WikiSourcePath   string   `json:"wikiSourcePath,omitempty"`
	DerivedPaths     []string `json:"derivedPaths,omitempty"`
	CreatedPaths     []string `json:"createdPaths,omitempty"`
	IndexPath        string   `json:"indexPath,omitempty"`
	LogPath          string   `json:"logPath,omitempty"`
	ElapsedMs        int64    `json:"elapsedMs,omitempty"`
	ExtractorUsed    bool     `json:"extractorUsed,omitempty"`
	ExtractorWarning string   `json:"extractorWarning,omitempty"`
	SkillSourceDir   string   `json:"skillSourceDir,omitempty"`
	ProcessLogs      []string `json:"processLogs,omitempty"`
}

type Activity struct {
	ID               int64  `json:"id"`
	IntegrationID    int64  `json:"integrationId"`
	Source           string `json:"source"`
	ExternalID       string `json:"externalId"`
	Title            string `json:"title"`
	Summary          string `json:"summary"`
	RawData          string `json:"rawData"`
	ActivityDate     string `json:"activityDate"`
	Date             string `json:"date"`                       // Alias for frontend compatibility
	ActivityDateTime string `json:"activityDateTime,omitempty"` // Full datetime for calendar events with time
	EndDateTime      string `json:"endDateTime,omitempty"`      // End datetime for multi-day events
	CalendarID       string `json:"calendarId,omitempty"`       // For Google Calendar
	FetchedAt        string `json:"fetchedAt"`
}

type WeeklyReport struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"userId"`
	WeekStart string `json:"weekStart"`
	WeekEnd   string `json:"weekEnd"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

type MyAttendanceSummary struct {
	VacationDays      int `json:"vacationDays"`
	MorningHalfDays   int `json:"morningHalfDays"`
	AfternoonHalfDays int `json:"afternoonHalfDays"`
	TotalDays         int `json:"totalDays"`
	LateCount         int `json:"lateCount"`
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

type ReportInsightSummary struct {
	TotalActivities    int `json:"totalActivities"`
	LinkedActivities   int `json:"linkedActivities"`
	UnlinkedActivities int `json:"unlinkedActivities"`
	NeedsReview        int `json:"needsReview"`
}

type ReportInsightActivity struct {
	ActivityID   int64  `json:"activityId"`
	Source       string `json:"source"`
	Title        string `json:"title"`
	Summary      string `json:"summary"`
	ActivityDate string `json:"activityDate"`
}

type ReportInsightDraft struct {
	Key               string  `json:"key"`
	SuggestedSection  string  `json:"suggestedSection"`
	SuggestedCategory string  `json:"suggestedCategory"`
	SuggestedWorkType string  `json:"suggestedWorkType"`
	Content           string  `json:"content"`
	ActivityIDs       []int64 `json:"activityIds"`
	Reason            string  `json:"reason"`
}

type ReportInsights struct {
	Summary            ReportInsightSummary    `json:"summary"`
	UnlinkedActivities []ReportInsightActivity `json:"unlinkedActivities"`
	DraftCandidates    []ReportInsightDraft    `json:"draftCandidates"`
	NeedsReview        []ReportInsightActivity `json:"needsReview"`
}

type ReportInsightIgnore struct {
	ID         int64  `json:"id"`
	ReportID   int64  `json:"reportId"`
	ActivityID int64  `json:"activityId"`
	CreatedAt  string `json:"createdAt"`
}

type ExcelTemplate struct {
	ID            int64  `json:"id"`
	UserID        int64  `json:"userId"`
	TeamType      string `json:"teamType"`
	Name          string `json:"name"`
	FilePath      string `json:"filePath"`
	StructureJSON string `json:"structureJson"`
	CreatedAt     string `json:"createdAt"`
}

type ProjectCategory struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"userId"`
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
}

type TeamMember struct {
	ID             int64   `json:"id"`
	UserID         int64   `json:"userId"`
	Name           string  `json:"name"`
	Position       string  `json:"position"`
	Email          string  `json:"email"`
	Role           string  `json:"role"`
	EmploymentType string  `json:"employmentType"`
	HireDate       string  `json:"hireDate"`
	ResignDate     *string `json:"resignDate"`
	Active         bool    `json:"active"`
	LinearUserID   string  `json:"linearUserId"`
	CreatedAt      string  `json:"createdAt"`
}

type Project struct {
	ID          int64   `json:"id"`
	UserID      int64   `json:"userId"`
	TeamType    string  `json:"teamType"`
	ClientID    int64   `json:"clientId"`
	Name        string  `json:"name"`
	ClientName  string  `json:"clientName"`
	Status      string  `json:"status"`
	Description string  `json:"description"`
	StartDate   string  `json:"startDate"`
	EndDate     *string `json:"endDate"`
	CreatedAt   string  `json:"createdAt"`
	// SI Project Detail fields (migrated from si_project_details table)
	ProjectType  string  `json:"projectType"`  // 직영, 당선, 신대방동, 거제 등
	PMName       string  `json:"pmName"`       // 프로젝트 책임자/PM
	TotalMM      float64 `json:"totalMM"`      // 총 투입 M/M
	ProgressRate int     `json:"progressRate"` // 진행율 %
}

type MemberAssignment struct {
	ID                int64   `json:"id"`
	UserID            int64   `json:"userId"`
	TeamMemberID      int64   `json:"teamMemberId"`
	ProjectID         int64   `json:"projectId"`
	AllocationPercent float64 `json:"allocationPercent"`
	StartDate         string  `json:"startDate"`
	EndDate           *string `json:"endDate"`
	WorkMode          string  `json:"workMode"`
	Notes             string  `json:"notes"`
	CreatedAt         string  `json:"createdAt"`
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
	ID                int64   `json:"id"`
	UserID            int64   `json:"userId"`
	TeamMemberID      int64   `json:"teamMemberId"`
	TeamMemberName    string  `json:"teamMemberName"` // From JOIN with team_members
	RecordDate        string  `json:"recordDate"`
	Type              string  `json:"type"`
	CheckInTime       *string `json:"checkInTime"`
	CheckOutTime      *string `json:"checkOutTime"`
	Notes             string  `json:"notes"`
	IntegrationSource string  `json:"integrationSource"`
	ExternalID        string  `json:"externalId"`
	CreatedAt         string  `json:"createdAt"`
}

type AttendanceSummary struct {
	TeamMemberID      int64   `json:"teamMemberId"`
	TeamMemberName    string  `json:"teamMemberName"`
	VacationDays      int     `json:"vacationDays"`
	MorningHalfDays   int     `json:"morningHalfDays"`
	AfternoonHalfDays int     `json:"afternoonHalfDays"`
	TotalDays         float64 `json:"totalDays"`
}

// Client master data for managing customers
type Client struct {
	ID           int64  `json:"id"`
	UserID       int64  `json:"userId"`
	Name         string `json:"name"`
	Status       string `json:"status"`
	OwnerName    string `json:"ownerName"`
	ContactEmail string `json:"contactEmail"`
	Notes        string `json:"notes"`
	Active       bool   `json:"active"`
	CreatedAt    string `json:"createdAt"`
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
	ProjectType  string  `json:"projectType"`  // 직영, 당선, 신대방동, 거제 등
	PMName       string  `json:"pmName"`       // 프로젝트 책임자/PM
	TotalMM      float64 `json:"totalMM"`      // 총 투입 M/M
	CurrentPhase string  `json:"currentPhase"` // 현재 진행단계
	ProgressRate int     `json:"progressRate"` // 진행율 %
	CreatedAt    string  `json:"createdAt"`
}

// SIWeeklyReport stores weekly progress for SI projects
type SIWeeklyReport struct {
	ID               int64  `json:"id"`
	UserID           int64  `json:"userId"`
	ProjectID        int64  `json:"projectId"`
	WeekStart        string `json:"weekStart"`
	WeekEnd          string `json:"weekEnd"`
	ThisWeekProgress string `json:"thisWeekProgress"` // 금주 진행사항
	NextWeekPlan     string `json:"nextWeekPlan"`     // 차주 계획
	Risks            string `json:"risks"`            // 리스크/이슈
	Notes            string `json:"notes"`            // 비고
	CreatedAt        string `json:"createdAt"`
}

// SIProjectMember stores project member assignments with SI-specific details
type SIProjectMember struct {
	ID           int64   `json:"id"`
	UserID       int64   `json:"userId"`
	ProjectID    int64   `json:"projectId"`
	TeamMemberID int64   `json:"teamMemberId"`
	MemberName   string  `json:"memberName"`
	Role         string  `json:"role"`         // 역할 (책임, 선임, 등)
	AllocationMM float64 `json:"allocationMM"` // 투입 M/M
	StartDate    string  `json:"startDate"`
	EndDate      *string `json:"endDate"`
}

// SIProjectView combines Project + SIProjectDetail + WeeklyReport for UI display
type SIProjectView struct {
	Project      Project           `json:"project"`
	Detail       *SIProjectDetail  `json:"detail,omitempty"`
	Members      []SIProjectMember `json:"members"`
	WeeklyReport *SIWeeklyReport   `json:"weeklyReport,omitempty"`
}

// CodeGroup represents a group of common codes (e.g., position_types, employment_types)
type CodeGroup struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"userId"`
	GroupCode   string `json:"groupCode"`
	GroupName   string `json:"groupName"`
	Description string `json:"description"`
	SortOrder   int    `json:"sortOrder"`
	CreatedAt   string `json:"createdAt"`
}

// TeamProfile stores the team type and basic setup info
type TeamProfile struct {
	TeamType     string `json:"teamType"` // si_business, si_field, small_team
	TeamName     string `json:"teamName"`
	UserName     string `json:"userName"`
	MemberCount  int    `json:"memberCount"`
	SetupDone    bool   `json:"setupDone"`
	LinearAPIKey string `json:"linearApiKey"`
	LinearTeamID string `json:"linearTeamId"`
	LinearUserID string `json:"linearUserId"` // Current user's Linear ID
	VaultRoot    string `json:"vaultRoot"`
}

// Issue stores issues/risks for si_field team
type Issue struct {
	ID          int64   `json:"id"`
	UserID      int64   `json:"userId"`
	ProjectID   *int64  `json:"projectId"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Severity    string  `json:"severity"` // critical, high, medium, low
	Status      string  `json:"status"`   // open, in_progress, resolved, closed
	Assignee    string  `json:"assignee"`
	DueDate     *string `json:"dueDate"`
	CreatedAt   string  `json:"createdAt"`
}

// Retrospective stores weekly retro for small_team
type Retrospective struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"userId"`
	WeekStart   string `json:"weekStart"`
	WeekEnd     string `json:"weekEnd"`
	WentWell    string `json:"wentWell"`
	ToImprove   string `json:"toImprove"`
	ActionItems string `json:"actionItems"`
	CreatedAt   string `json:"createdAt"`
}

// CodeValue represents a single code value within a group
type CodeValue struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"userId"`
	GroupCode   string `json:"groupCode"`
	CodeValue   string `json:"codeValue"`
	CodeLabel   string `json:"codeLabel"`
	Description string `json:"description"`
	SortOrder   int    `json:"sortOrder"`
	IsActive    bool   `json:"isActive"`
	CreatedAt   string `json:"createdAt"`
}

// AIProvider is a manually managed AI vendor registry entry.
type AIProvider struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"userId"`
	Code        string `json:"code"`
	DisplayName string `json:"displayName"`
	Enabled     bool   `json:"enabled"`
	CreatedAt   string `json:"createdAt"`
}

// AIModel is a manually managed model registry entry.
type AIModel struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"userId"`
	ProviderID  int64  `json:"providerId"`
	ModelCode   string `json:"modelCode"`
	DisplayName string `json:"displayName"`
	Enabled     bool   `json:"enabled"`
	CreatedAt   string `json:"createdAt"`
}

// AIBillingPlan stores fixed + overage billing settings by provider/model.
type AIBillingPlan struct {
	ID                    int64   `json:"id"`
	UserID                int64   `json:"userId"`
	ProviderID            int64   `json:"providerId"`
	ModelID               *int64  `json:"modelId"`
	MonthlyFixedUSD       float64 `json:"monthlyFixedUsd"`
	IncludedInputTokens   int64   `json:"includedInputTokens"`
	IncludedOutputTokens  int64   `json:"includedOutputTokens"`
	OverageInputPer1kUSD  float64 `json:"overageInputPer1kUsd"`
	OverageOutputPer1kUSD float64 `json:"overageOutputPer1kUsd"`
	EffectiveFrom         string  `json:"effectiveFrom"`
	EffectiveTo           *string `json:"effectiveTo"`
	CreatedAt             string  `json:"createdAt"`
}

// AIUsageDaily stores day-level aggregated usage by provider/model/feature.
type AIUsageDaily struct {
	Day               string  `json:"day"`
	UserID            int64   `json:"userId"`
	ProviderID        int64   `json:"providerId"`
	ModelID           int64   `json:"modelId"`
	RawProvider       string  `json:"rawProvider"`
	RawModel          string  `json:"rawModel"`
	Feature           string  `json:"feature"`
	RequestCount      int64   `json:"requestCount"`
	InputTokens       int64   `json:"inputTokens"`
	OutputTokens      int64   `json:"outputTokens"`
	CacheReadTokens   int64   `json:"cacheReadTokens"`
	CacheCreateTokens int64   `json:"cacheCreateTokens"`
	PaygCostUSD       float64 `json:"paygCostUsd"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

// AIUsageHistoryEvent stores append-only usage events for long-term history.
type AIUsageHistoryEvent struct {
	ID                int64   `json:"id"`
	OccurredAt        string  `json:"occurredAt"`
	Day               string  `json:"day"`
	UserID            int64   `json:"userId"`
	ProviderID        int64   `json:"providerId"`
	ModelID           int64   `json:"modelId"`
	RawProvider       string  `json:"rawProvider"`
	RawModel          string  `json:"rawModel"`
	Feature           string  `json:"feature"`
	RequestCount      int64   `json:"requestCount"`
	InputTokens       int64   `json:"inputTokens"`
	OutputTokens      int64   `json:"outputTokens"`
	CacheReadTokens   int64   `json:"cacheReadTokens"`
	CacheCreateTokens int64   `json:"cacheCreateTokens"`
	PaygCostUSD       float64 `json:"paygCostUsd"`
	MetadataJSON      string  `json:"metadataJson"`
	CreatedAt         string  `json:"createdAt"`
}

// AIFXRate stores daily USD->KRW FX rates.
type AIFXRate struct {
	Day       string  `json:"day"`
	Base      string  `json:"base"`
	Quote     string  `json:"quote"`
	Rate      float64 `json:"rate"`
	Source    string  `json:"source"`
	FetchedAt string  `json:"fetchedAt"`
}

// AIUsageSummaryRow is used by dashboard totals grouped by provider/model.
type AIUsageSummaryRow struct {
	ProviderCode      string  `json:"providerCode"`
	ProviderName      string  `json:"providerName"`
	ModelCode         string  `json:"modelCode"`
	ModelName         string  `json:"modelName"`
	RequestCount      int64   `json:"requestCount"`
	InputTokens       int64   `json:"inputTokens"`
	OutputTokens      int64   `json:"outputTokens"`
	CacheReadTokens   int64   `json:"cacheReadTokens"`
	CacheCreateTokens int64   `json:"cacheCreateTokens"`
	PaygCostUSD       float64 `json:"paygCostUsd"`
	FixedCostUSD      float64 `json:"fixedCostUsd"`
	OverageCostUSD    float64 `json:"overageCostUsd"`
	TotalCostUSD      float64 `json:"totalCostUsd"`
	TotalCostKRW      float64 `json:"totalCostKrw"`
	IsUnregistered    bool    `json:"isUnregistered"`
}

type AIUsageDailyPoint struct {
	Day          string  `json:"day"`
	TotalCostUSD float64 `json:"totalCostUsd"`
	TotalCostKRW float64 `json:"totalCostKrw"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
}

type AIUsageDailySeriesPoint struct {
	Day          string  `json:"day"`
	RequestCount int64   `json:"requestCount"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
	TotalCostUSD float64 `json:"totalCostUsd"`
	TotalCostKRW float64 `json:"totalCostKrw"`
}

type AIUsageSeriesRow struct {
	ProviderCode string                    `json:"providerCode"`
	ProviderName string                    `json:"providerName"`
	ModelCode    string                    `json:"modelCode"`
	ModelName    string                    `json:"modelName"`
	RequestCount int64                     `json:"requestCount"`
	InputTokens  int64                     `json:"inputTokens"`
	OutputTokens int64                     `json:"outputTokens"`
	TotalCostUSD float64                   `json:"totalCostUsd"`
	TotalCostKRW float64                   `json:"totalCostKrw"`
	Daily        []AIUsageDailySeriesPoint `json:"daily"`
}

type AIUsageOverview struct {
	Month          string  `json:"month"`
	RequestCount   int64   `json:"requestCount"`
	InputTokens    int64   `json:"inputTokens"`
	OutputTokens   int64   `json:"outputTokens"`
	TotalCostUSD   float64 `json:"totalCostUsd"`
	TotalCostKRW   float64 `json:"totalCostKrw"`
	FixedCostUSD   float64 `json:"fixedCostUsd"`
	OverageCostUSD float64 `json:"overageCostUsd"`
	PaygCostUSD    float64 `json:"paygCostUsd"`
}

type AIUsageDashboard struct {
	Overview       AIUsageOverview     `json:"overview"`
	ByProvider     []AIUsageSummaryRow `json:"byProvider"`
	ByModel        []AIUsageSummaryRow `json:"byModel"`
	Unregistered   []AIUsageSummaryRow `json:"unregistered"`
	Daily          []AIUsageDailyPoint `json:"daily"`
	FXRateUsed     float64             `json:"fxRateUsed"`
	FXRateDate     string              `json:"fxRateDate"`
	FXSource       string              `json:"fxSource"`
	FXFallbackUsed bool                `json:"fxFallbackUsed"`
}

type PersonalAISourceSummaryRow struct {
	SourceCode   string  `json:"sourceCode"`
	SourceName   string  `json:"sourceName"`
	RequestCount int64   `json:"requestCount"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
	TotalCostUSD float64 `json:"totalCostUsd"`
	TotalCostKRW float64 `json:"totalCostKrw"`
}

type PersonalAIUsageOverview struct {
	Month                string  `json:"month"`
	RequestCount         int64   `json:"requestCount"`
	InternalInputTokens  int64   `json:"internalInputTokens"`
	InternalOutputTokens int64   `json:"internalOutputTokens"`
	ExternalInputTokens  int64   `json:"externalInputTokens"`
	ExternalOutputTokens int64   `json:"externalOutputTokens"`
	InternalCostUSD      float64 `json:"internalCostUsd"`
	ExternalCostUSD      float64 `json:"externalCostUsd"`
	TotalCostUSD         float64 `json:"totalCostUsd"`
	TotalCostKRW         float64 `json:"totalCostKrw"`
}

type PersonalAIUsageDashboard struct {
	Overview        PersonalAIUsageOverview      `json:"overview"`
	BySource        []PersonalAISourceSummaryRow `json:"bySource"`
	ByProvider      []AIUsageSummaryRow          `json:"byProvider"`
	ByModel         []AIUsageSummaryRow          `json:"byModel"`
	Daily           []AIUsageDailyPoint          `json:"daily"`
	DailyByProvider []AIUsageSeriesRow           `json:"dailyByProvider"`
	DailyByModel    []AIUsageSeriesRow           `json:"dailyByModel"`
	FXRateUsed      float64                      `json:"fxRateUsed"`
	FXRateDate      string                       `json:"fxRateDate"`
	FXSource        string                       `json:"fxSource"`
	FXFallbackUsed  bool                         `json:"fxFallbackUsed"`
}

type PersonalAICollectorResult struct {
	SourceCode    string   `json:"sourceCode"`
	SourceName    string   `json:"sourceName"`
	ScannedFiles  int      `json:"scannedFiles"`
	ParsedEntries int      `json:"parsedEntries"`
	ImportedRows  int      `json:"importedRows"`
	Warnings      []string `json:"warnings"`
}

type PersonalAICollectorResponse struct {
	Month   string                      `json:"month"`
	Results []PersonalAICollectorResult `json:"results"`
}

type PersonalAICollectStatus struct {
	Running                bool                         `json:"running"`
	Trigger                string                       `json:"trigger"`
	Month                  string                       `json:"month"`
	StartedAt              string                       `json:"startedAt"`
	FinishedAt             string                       `json:"finishedAt"`
	LastError              string                       `json:"lastError"`
	LastResult             *PersonalAICollectorResponse `json:"lastResult"`
	AutoEnabled            bool                         `json:"autoEnabled"`
	AutoIntervalSeconds    int                          `json:"autoIntervalSeconds"`
	AutoNextRunAt          string                       `json:"autoNextRunAt"`
	AutoLastTriggeredAt    string                       `json:"autoLastTriggeredAt"`
	AutoLastTriggeredMonth string                       `json:"autoLastTriggeredMonth"`
}

type PersonalAIAutoCollectConfig struct {
	Enabled            bool   `json:"enabled"`
	IntervalSeconds    int    `json:"intervalSeconds"`
	NextRunAt          string `json:"nextRunAt"`
	LastTriggeredAt    string `json:"lastTriggeredAt"`
	LastTriggeredMonth string `json:"lastTriggeredMonth"`
}
