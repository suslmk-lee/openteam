package constants

type CodeGroup string

const (
	CodeGroupPosition    CodeGroup = "position_types"
	CodeGroupEmployment  CodeGroup = "employment_types"
	CodeGroupProjectType CodeGroup = "project_types"
	CodeGroupProjectPhase CodeGroup = "project_phases"
)

const (
	GithubIntegrationType = "github"
	GWSCalendarType      = "google_calendar"
	GmailIntegrationType  = "gmail"
	OpenAIIntegrationType = "openai"
)

var (
	DefaultPositionTypes = []string{"Staff", "Manager", "PM"}
	DefaultEmploymentTypes = []string{"Full-time", "Part-time", "Contract"}
	DefaultProjectTypes = []string{"SI", "SM", "Outsourcing", "Maintenance", "Other"}
	DefaultProjectPhases = []string{
		"poc_proposal",
		"in_progress",
		"in_development",
		"in_operation",
		"completed",
		"cancelled",
		"closed",
	}
	DefaultSIRoles = []string{"PM", "PL", "Lead", "Architect", "Designer", "Developer", "PO", "QA", "Client Manager", "Other"}
)

