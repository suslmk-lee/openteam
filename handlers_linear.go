package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

const linearAPIURL = "https://api.linear.app/graphql"

var linearHTTPClient = &http.Client{Timeout: 15 * time.Second}

type linearGraphQLRequest struct {
	Query     string                 `json:"query"`
	Variables map[string]interface{} `json:"variables"`
}

type linearGraphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func callLinearAPI(apiKey, teamID string) (*LinearDashboardData, error) {
	if teamID == "" {
		return fetchLinearWithoutTeam(apiKey)
	}
	return fetchLinearWithTeam(apiKey, teamID)
}

// fetchLinearWithTeam fetches data for a specific team.
// teamID may be a UUID or a URL key (slug). We query all teams and match by either.
func fetchLinearWithTeam(apiKey, teamID string) (*LinearDashboardData, error) {
	// Step 1: resolve team UUID from slug or UUID
	resolvedID, err := resolveLinearTeamID(apiKey, teamID)
	if err != nil {
		return nil, err
	}

	gqlQuery := `
	query($teamId: String!) {
		team(id: $teamId) {
			projects(first: 50) {
				nodes { id name state progress url }
			}
			issues(first: 100, orderBy: updatedAt) {
				nodes {
					id title identifier priority description estimate
					state { id name color type }
					assignee { id name }
					labels { nodes { id name color } }
					project { id name }
					url createdAt updatedAt dueDate
				}
			}
			cycles(first: 5, orderBy: createdAt) {
				nodes {
					id name number startsAt endsAt completedAt
					issues { nodes { id } }
				}
			}
		}
	}`

	reqBody := linearGraphQLRequest{
		Query: gqlQuery,
		Variables: map[string]interface{}{
			"teamId": resolvedID,
		},
	}

	respData, err := doLinearRequest(apiKey, reqBody)
	if err != nil {
		return nil, err
	}

	var result struct {
		Team struct {
			Projects struct {
				Nodes []LinearProject `json:"nodes"`
			} `json:"projects"`
			Issues struct {
				Nodes []LinearIssue `json:"nodes"`
			} `json:"issues"`
			Cycles struct {
				Nodes []struct {
					ID          string  `json:"id"`
					Name        string  `json:"name"`
					Number      int     `json:"number"`
					StartsAt    string  `json:"startsAt"`
					EndsAt      string  `json:"endsAt"`
					CompletedAt *string `json:"completedAt"`
					Issues      struct {
						Nodes []struct {
							ID string `json:"id"`
						} `json:"nodes"`
					} `json:"issues"`
				} `json:"nodes"`
			} `json:"cycles"`
		} `json:"team"`
	}

	if err := json.Unmarshal(respData, &result); err != nil {
		return nil, fmt.Errorf("Linear 응답 파싱 실패: %w", err)
	}

	dashboard := &LinearDashboardData{
		Projects:    result.Team.Projects.Nodes,
		Issues:      result.Team.Issues.Nodes,
		IssueCounts: map[string]int{},
	}

	for _, c := range result.Team.Cycles.Nodes {
		dashboard.Cycles = append(dashboard.Cycles, LinearCycle{
			ID:          c.ID,
			Name:        c.Name,
			Number:      c.Number,
			StartsAt:    c.StartsAt,
			EndsAt:      c.EndsAt,
			CompletedAt: c.CompletedAt,
			IssueCount:  len(c.Issues.Nodes),
		})
	}

	for _, iss := range dashboard.Issues {
		stateType := iss.State.Type
		if stateType == "" {
			stateType = "unstarted"
		}
		dashboard.IssueCounts[stateType]++
	}

	return dashboard, nil
}

// resolveLinearTeamID returns the UUID for a team given either its UUID or URL key (slug).
func resolveLinearTeamID(apiKey, teamIDOrKey string) (string, error) {
	gqlQuery := `{ teams { nodes { id key } } }`
	respData, err := doLinearRequest(apiKey, linearGraphQLRequest{Query: gqlQuery})
	if err != nil {
		return "", err
	}

	var result struct {
		Teams struct {
			Nodes []struct {
				ID  string `json:"id"`
				Key string `json:"key"`
			} `json:"nodes"`
		} `json:"teams"`
	}
	if err := json.Unmarshal(respData, &result); err != nil {
		return "", fmt.Errorf("팀 목록 파싱 실패: %w", err)
	}

	for _, t := range result.Teams.Nodes {
		if t.ID == teamIDOrKey || t.Key == teamIDOrKey {
			return t.ID, nil
		}
	}

	// If no match found, return helpful error listing available keys
	keys := make([]string, 0, len(result.Teams.Nodes))
	for _, t := range result.Teams.Nodes {
		keys = append(keys, t.Key)
	}
	return "", fmt.Errorf("팀을 찾을 수 없습니다: '%s'. 사용 가능한 팀 키: %v", teamIDOrKey, keys)
}

// LinearWorkflowState represents a Linear workflow state
type LinearWorkflowState struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
	Type  string `json:"type"`
}

// GetLinearTeamStates returns all workflow states for the resolved team.
func GetLinearTeamStates(apiKey, teamID string) ([]LinearWorkflowState, error) {
	resolvedID, err := resolveLinearTeamID(apiKey, teamID)
	if err != nil {
		return nil, err
	}
	gqlQuery := `
	query($teamId: String!) {
		team(id: $teamId) {
			states { nodes { id name color type } }
		}
	}`
	respData, err := doLinearRequest(apiKey, linearGraphQLRequest{
		Query:     gqlQuery,
		Variables: map[string]interface{}{"teamId": resolvedID},
	})
	if err != nil {
		return nil, err
	}
	var result struct {
		Team struct {
			States struct {
				Nodes []LinearWorkflowState `json:"nodes"`
			} `json:"states"`
		} `json:"team"`
	}
	if err := json.Unmarshal(respData, &result); err != nil {
		return nil, fmt.Errorf("states 파싱 실패: %w", err)
	}
	return result.Team.States.Nodes, nil
}

// LinearTeamMember represents a Linear team member
type LinearTeamMember struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
}

type LinearViewer struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// GetLinearTeamMembers returns members of the resolved team.
func GetLinearTeamMembers(apiKey, teamID string) ([]LinearTeamMember, error) {
	resolvedID, err := resolveLinearTeamID(apiKey, teamID)
	if err != nil {
		return nil, err
	}
	gqlQuery := `
	query($teamId: String!) {
		team(id: $teamId) {
			members { nodes { id name email displayName } }
		}
	}`
	respData, err := doLinearRequest(apiKey, linearGraphQLRequest{
		Query:     gqlQuery,
		Variables: map[string]interface{}{"teamId": resolvedID},
	})
	if err != nil {
		return nil, err
	}
	var result struct {
		Team struct {
			Members struct {
				Nodes []LinearTeamMember `json:"nodes"`
			} `json:"members"`
		} `json:"team"`
	}
	if err := json.Unmarshal(respData, &result); err != nil {
		return nil, fmt.Errorf("members 파싱 실패: %w", err)
	}
	return result.Team.Members.Nodes, nil
}

// GetLinearTeamLabels returns labels of the resolved team.
func GetLinearTeamLabels(apiKey, teamID string) ([]LinearIssueLabel, error) {
	resolvedID, err := resolveLinearTeamID(apiKey, teamID)
	if err != nil {
		return nil, err
	}
	gqlQuery := `
	query($teamId: String!) {
		team(id: $teamId) {
			labels(first: 200) { nodes { id name color } }
		}
	}`
	respData, err := doLinearRequest(apiKey, linearGraphQLRequest{
		Query:     gqlQuery,
		Variables: map[string]interface{}{"teamId": resolvedID},
	})
	if err != nil {
		return nil, err
	}
	var result struct {
		Team struct {
			Labels struct {
				Nodes []LinearIssueLabel `json:"nodes"`
			} `json:"labels"`
		} `json:"team"`
	}
	if err := json.Unmarshal(respData, &result); err != nil {
		return nil, fmt.Errorf("labels parse failed: %w", err)
	}
	return result.Team.Labels.Nodes, nil
}

// LinearIssueUpdateInput holds optional fields for issue mutation
type LinearIssueUpdateInput struct {
	StateID    string    `json:"stateId,omitempty"`
	Priority   *int      `json:"priority,omitempty"`
	DueDate    string    `json:"dueDate,omitempty"`
	AssigneeID string    `json:"assigneeId,omitempty"`
	LabelIDs   *[]string `json:"labelIds,omitempty"`
}

// UpdateLinearIssue updates multiple fields of a Linear issue.
func UpdateLinearIssue(apiKey, issueID string, input LinearIssueUpdateInput) error {
	// Build input map with only provided fields
	inputMap := map[string]interface{}{}
	if input.StateID != "" {
		inputMap["stateId"] = input.StateID
	}
	if input.Priority != nil {
		inputMap["priority"] = *input.Priority
	}
	if input.DueDate != "" {
		if input.DueDate == "__clear__" {
			inputMap["dueDate"] = nil
		} else {
			inputMap["dueDate"] = input.DueDate
		}
	}
	if input.AssigneeID != "" {
		if input.AssigneeID == "__clear__" {
			inputMap["assigneeId"] = nil
		} else {
			inputMap["assigneeId"] = input.AssigneeID
		}
	}
	if input.LabelIDs != nil {
		inputMap["labelIds"] = *input.LabelIDs
	}

	gqlQuery := `
	mutation($issueId: String!, $input: IssueUpdateInput!) {
		issueUpdate(id: $issueId, input: $input) {
			success
			issue { id priority dueDate assignee { id name } state { id name type color } }
		}
	}`
	respData, err := doLinearRequest(apiKey, linearGraphQLRequest{
		Query: gqlQuery,
		Variables: map[string]interface{}{
			"issueId": issueID,
			"input":   inputMap,
		},
	})
	if err != nil {
		return err
	}
	var result struct {
		IssueUpdate struct {
			Success bool `json:"success"`
		} `json:"issueUpdate"`
	}
	if err := json.Unmarshal(respData, &result); err != nil {
		return fmt.Errorf("mutation 응답 파싱 실패: %w", err)
	}
	if !result.IssueUpdate.Success {
		return fmt.Errorf("Linear 이슈 업데이트 실패")
	}
	return nil
}

// UpdateLinearIssueState updates a Linear issue's state via GraphQL mutation.
func UpdateLinearIssueState(apiKey, issueID, stateID string) error {
	gqlQuery := `
	mutation($issueId: String!, $stateId: String!) {
		issueUpdate(id: $issueId, input: { stateId: $stateId }) {
			success
			issue { id state { id name type } }
		}
	}`
	respData, err := doLinearRequest(apiKey, linearGraphQLRequest{
		Query: gqlQuery,
		Variables: map[string]interface{}{
			"issueId": issueID,
			"stateId": stateID,
		},
	})
	if err != nil {
		return err
	}
	var result struct {
		IssueUpdate struct {
			Success bool `json:"success"`
		} `json:"issueUpdate"`
	}
	if err := json.Unmarshal(respData, &result); err != nil {
		return fmt.Errorf("mutation 응답 파싱 실패: %w", err)
	}
	if !result.IssueUpdate.Success {
		return fmt.Errorf("Linear 이슈 상태 업데이트 실패")
	}
	return nil
}

func fetchLinearWithoutTeam(apiKey string) (*LinearDashboardData, error) {
	gqlQuery := `
	{
		viewer {
			assignedIssues(first: 50, orderBy: updatedAt) {
				nodes {
					id title identifier priority description estimate
					state { id name color type }
					assignee { id name }
					labels { nodes { id name color } }
					project { id name }
					url createdAt updatedAt dueDate
				}
			}
		}
	}`

	reqBody := linearGraphQLRequest{Query: gqlQuery}
	respData, err := doLinearRequest(apiKey, reqBody)
	if err != nil {
		return nil, err
	}

	var result struct {
		Viewer struct {
			AssignedIssues struct {
				Nodes []LinearIssue `json:"nodes"`
			} `json:"assignedIssues"`
		} `json:"viewer"`
	}

	if err := json.Unmarshal(respData, &result); err != nil {
		return nil, fmt.Errorf("Linear 응답 파싱 실패: %w", err)
	}

	dashboard := &LinearDashboardData{
		Projects:    []LinearProject{},
		Issues:      result.Viewer.AssignedIssues.Nodes,
		Cycles:      []LinearCycle{},
		IssueCounts: map[string]int{},
	}

	for _, iss := range dashboard.Issues {
		stateType := iss.State.Type
		if stateType == "" {
			stateType = "unstarted"
		}
		dashboard.IssueCounts[stateType]++
	}

	return dashboard, nil
}

func doLinearRequest(apiKey string, reqBody linearGraphQLRequest) (json.RawMessage, error) {
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("요청 직렬화 실패: %w", err)
	}

	req, err := http.NewRequest("POST", linearAPIURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("요청 생성 실패: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", apiKey)

	resp, err := linearHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Linear API 호출 실패: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("응답 읽기 실패: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Linear API 오류 (HTTP %d): %s", resp.StatusCode, string(rawBody))
	}

	var gqlResp linearGraphQLResponse
	if err := json.Unmarshal(rawBody, &gqlResp); err != nil {
		return nil, fmt.Errorf("응답 파싱 실패: %w", err)
	}

	if len(gqlResp.Errors) > 0 {
		return nil, fmt.Errorf("Linear GraphQL 오류: %s", gqlResp.Errors[0].Message)
	}

	return gqlResp.Data, nil
}

// getLinearViewerID retrieves the current Linear user's ID
func getLinearViewerID(apiKey string) (string, error) {
	gqlQuery := `{ viewer { id } }`
	reqBody := linearGraphQLRequest{
		Query:     gqlQuery,
		Variables: map[string]interface{}{},
	}

	respData, err := doLinearRequest(apiKey, reqBody)
	if err != nil {
		return "", err
	}

	var result struct {
		Viewer struct {
			ID string `json:"id"`
		} `json:"viewer"`
	}

	if err := json.Unmarshal(respData, &result); err != nil {
		return "", fmt.Errorf("viewer ID 파싱 실패: %w", err)
	}

	return result.Viewer.ID, nil
}

func getLinearViewer(apiKey string) (*LinearViewer, error) {
	gqlQuery := `{ viewer { id name email } }`
	reqBody := linearGraphQLRequest{
		Query:     gqlQuery,
		Variables: map[string]interface{}{},
	}

	respData, err := doLinearRequest(apiKey, reqBody)
	if err != nil {
		return nil, err
	}

	var result struct {
		Viewer LinearViewer `json:"viewer"`
	}

	if err := json.Unmarshal(respData, &result); err != nil {
		return nil, fmt.Errorf("viewer parse failed: %w", err)
	}
	if result.Viewer.ID == "" {
		return nil, fmt.Errorf("viewer id is empty")
	}

	return &result.Viewer, nil
}

// GetMyLinearIssues retrieves issues assigned to the current user (identified by linearUserID), filtered by active states
func GetMyLinearIssues(apiKey, teamID, linearUserID string) ([]LinearIssue, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("Linear API Key가 설정되지 않았습니다")
	}

	if linearUserID == "" {
		// Fallback: fetch viewer ID if not provided
		var err error
		linearUserID, err = getLinearViewerID(apiKey)
		if err != nil {
			return nil, fmt.Errorf("현재 사용자 조회 실패: %w", err)
		}
	}

	var allIssues []LinearIssue

	if teamID != "" {
		// Fetch team issues and filter by assignee
		dashboardData, err := fetchLinearWithTeam(apiKey, teamID)
		if err != nil {
			return nil, err
		}
		if dashboardData != nil {
			allIssues = dashboardData.Issues
		}
	} else {
		// Fetch viewer's assigned issues (already assignee-filtered)
		dashboardData, err := fetchLinearWithoutTeam(apiKey)
		if err != nil {
			return nil, err
		}
		if dashboardData != nil {
			allIssues = dashboardData.Issues
		}
	}

	// Filter: include only if assigned to current user and not cancelled/completed
	var filtered []LinearIssue
	log.Printf("[GetMyLinearIssues] Filtering %d issues, teamID=%s, linearUserID=%s", len(allIssues), teamID, linearUserID)
	for _, issue := range allIssues {
		assigneeID := ""
		if issue.Assignee != nil {
			assigneeID = issue.Assignee.ID
		}

		// Check if assigned to current user (if teamID, otherwise already assigned)
		if teamID != "" && (issue.Assignee == nil || issue.Assignee.ID != linearUserID) {
			log.Printf("[GetMyLinearIssues] Skipping issue %s: assignee=%s, expected=%s", issue.ID, assigneeID, linearUserID)
			continue
		}

		// Exclude cancelled states only (include completed for stats)
		if issue.State.Type == "cancelled" || issue.State.Type == "canceled" {
			log.Printf("[GetMyLinearIssues] Skipping issue %s: state=%s", issue.ID, issue.State.Type)
			continue
		}

		log.Printf("[GetMyLinearIssues] Including issue %s: assignee=%s", issue.ID, assigneeID)
		filtered = append(filtered, issue)
	}

	log.Printf("[GetMyLinearIssues] Filtered %d issues from %d total", len(filtered), len(allIssues))
	return filtered, nil
}
