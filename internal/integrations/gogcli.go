package integrations

import (
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"
)

// GogCLI wraps the gogcli (gog) command-line tool
type GogCLI struct {
	Account string // Gmail account email
}

// GmailThread represents a thread from gog gmail search --json
type GmailThread struct {
	ID       string         `json:"id"`
	Snippet  string         `json:"snippet"`
	Messages []GmailMessage `json:"messages"`
}

// GmailMessage represents a message from gog gmail messages search --json
type GmailMessage struct {
	ID       string `json:"id"`
	ThreadID string `json:"threadId"`
	Subject  string `json:"subject"`
	From     string `json:"from"`
	Date     string `json:"date"`
	Body     string `json:"body,omitempty"`
	Snippet  string `json:"snippet,omitempty"`
}

type gmailSearchResult struct {
	Threads []GmailThread `json:"threads"`
}

type gmailMessagesResult struct {
	Messages []GmailMessage `json:"messages"`
}

// CalendarEvent represents an event from gog cal list --json
type CalendarEvent struct {
	ID          string          `json:"id"`
	Summary     string          `json:"summary"`
	Description string          `json:"description,omitempty"`
	Start       string          `json:"-"` // Parsed from rawStart
	End         string          `json:"-"` // Parsed from rawEnd
	Location    string          `json:"location,omitempty"`
	Status      string          `json:"status,omitempty"`
	rawStart    json.RawMessage `json:"start"`
	rawEnd      json.RawMessage `json:"end"`
}

// UnmarshalJSON handles both string and object formats for start/end times
func (e *CalendarEvent) UnmarshalJSON(data []byte) error {
	type Alias CalendarEvent
	aux := &struct {
		*Alias
		Start json.RawMessage `json:"start"`
		End   json.RawMessage `json:"end"`
	}{
		Alias: (*Alias)(e),
	}

	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	// Parse Start field (can be string or object with dateTime/date)
	e.Start = parseTimeField(aux.Start)
	// Parse End field (can be string or object with dateTime/date)
	e.End = parseTimeField(aux.End)

	return nil
}

// parseTimeField extracts time string from either "2026-04-10T10:00:00Z" or {"dateTime": "..."} or {"date": "..."}
func parseTimeField(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}

	// Try parsing as simple string first
	var strValue string
	if err := json.Unmarshal(raw, &strValue); err == nil {
		return strValue
	}

	// Try parsing as object with dateTime or date field
	var objValue struct {
		DateTime string `json:"dateTime"`
		Date     string `json:"date"`
	}
	if err := json.Unmarshal(raw, &objValue); err == nil {
		if objValue.DateTime != "" {
			return objValue.DateTime
		}
		return objValue.Date
	}

	return string(raw)
}

type calendarListResult struct {
	Events []CalendarEvent `json:"events"`
}

// CheckInstalled verifies that gog CLI is available
func CheckInstalled() error {
	_, err := exec.LookPath("gog")
	if err != nil {
		return fmt.Errorf("gogcli (gog) not found in PATH. Install: go install github.com/steipete/gogcli/cmd/gog@latest")
	}
	return nil
}

// CheckAuth verifies that the account is authenticated
func (g *GogCLI) CheckAuth() error {
	out, err := g.runGog("gmail", "labels", "list")
	if err != nil {
		return fmt.Errorf("Gmail auth check failed: %w (output: %s)", err, out)
	}
	return nil
}

// FetchSentEmails fetches sent emails for the given date range
func (g *GogCLI) FetchSentEmails(after, before time.Time) ([]GmailMessage, error) {
	query := fmt.Sprintf("in:sent after:%s before:%s",
		after.Format("2006/01/02"),
		before.Add(24*time.Hour).Format("2006/01/02"),
	)
	log.Printf("[gogcli] Fetching sent emails: %s", query)

	out, err := g.runGog("gmail", "messages", "search", query, "--max", "50", "--json")
	if err != nil {
		return nil, fmt.Errorf("gmail messages search failed: %w (output: %s)", err, out)
	}

	var result gmailMessagesResult
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return nil, fmt.Errorf("failed to parse gmail output: %w", err)
	}

	log.Printf("[gogcli] Found %d sent emails", len(result.Messages))
	return result.Messages, nil
}

// FetchReceivedEmails fetches received emails for the given date range
func (g *GogCLI) FetchReceivedEmails(after, before time.Time) ([]GmailMessage, error) {
	query := fmt.Sprintf("in:inbox after:%s before:%s",
		after.Format("2006/01/02"),
		before.Add(24*time.Hour).Format("2006/01/02"),
	)
	log.Printf("[gogcli] Fetching received emails: %s", query)

	out, err := g.runGog("gmail", "messages", "search", query, "--max", "50", "--json")
	if err != nil {
		return nil, fmt.Errorf("gmail messages search failed: %w (output: %s)", err, out)
	}

	var result gmailMessagesResult
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return nil, fmt.Errorf("failed to parse gmail output: %w", err)
	}

	log.Printf("[gogcli] Found %d received emails", len(result.Messages))
	return result.Messages, nil
}

// FetchCalendarEvents fetches calendar events for the given date range
func (g *GogCLI) FetchCalendarEvents(after, before time.Time) ([]CalendarEvent, error) {
	log.Printf("[gogcli] Fetching calendar events: %s ~ %s",
		after.Format("2006-01-02"), before.Format("2006-01-02"))

	out, err := g.runGog("cal", "list",
		"--from", after.Format("2006-01-02"),
		"--to", before.Add(24*time.Hour).Format("2006-01-02"),
		"--json",
	)
	if err != nil {
		return nil, fmt.Errorf("calendar list failed: %w (output: %s)", err, out)
	}

	var result calendarListResult
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return nil, fmt.Errorf("failed to parse calendar output: %w", err)
	}

	log.Printf("[gogcli] Found %d calendar events", len(result.Events))
	return result.Events, nil
}

// runGog executes the gog CLI with given arguments (with retry logic)
func (g *GogCLI) runGog(args ...string) (string, error) {
	if g.Account != "" {
		args = append([]string{"--account", g.Account}, args...)
	}

	log.Printf("[gogcli] Running: gog %s", strings.Join(args, " "))

	// Retry logic with exponential backoff
	maxRetries := 3
	var lastErr error
	var output []byte

	for i := 0; i < maxRetries; i++ {
		if i > 0 {
			waitTime := time.Duration(i*2) * time.Second
			log.Printf("[gogcli] Retry %d/%d after %v...", i, maxRetries, waitTime)
			time.Sleep(waitTime)
		}

		cmd := exec.Command("gog", args...)
		output, lastErr = cmd.CombinedOutput()
		outStr := strings.TrimSpace(string(output))

		if lastErr == nil {
			return outStr, nil
		}

		// Check if it's a retryable HTTP error
		errStr := string(output)
		if strings.Contains(errStr, "HTTP/1.1 400 Bad Request") ||
			strings.Contains(errStr, "idle HTTP channel") ||
			strings.Contains(errStr, "connection reset") ||
			strings.Contains(errStr, "timeout") {
			log.Printf("[gogcli] Retryable error detected: %s", errStr)
			continue
		}

		// Non-retryable error, return immediately
		return outStr, fmt.Errorf("gog command failed: %w (output: %s)", lastErr, outStr)
	}

	return strings.TrimSpace(string(output)), fmt.Errorf("gog command failed after %d retries: %w (output: %s)", maxRetries, lastErr, strings.TrimSpace(string(output)))
}

// StartAuth initiates the OAuth flow for a Gmail account
func (g *GogCLI) StartAuth() (string, error) {
	out, err := g.runGog("auth", "add", g.Account)
	if err != nil {
		return out, fmt.Errorf("auth add failed: %w (output: %s)", err, out)
	}
	return out, nil
}

// StoreCredentials stores OAuth client credentials from a JSON file
func StoreCredentials(jsonPath string) (string, error) {
	cmd := exec.Command("gog", "auth", "credentials", jsonPath)
	output, err := cmd.CombinedOutput()
	outStr := strings.TrimSpace(string(output))
	if err != nil {
		return outStr, fmt.Errorf("credentials store failed: %w", err)
	}
	return outStr, nil
}
