// Package integrations provides Google Workspace integration using the official gws CLI
package integrations

import (
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"
)

// GWSCLI wraps the official Google Workspace CLI (gws)
type GWSCLI struct {
	Account string
}

// CheckInstalled verifies that gws CLI is installed and available
func (g *GWSCLI) CheckInstalled() error {
	_, err := exec.LookPath("gws")
	if err != nil {
		return fmt.Errorf("gws CLI not found in PATH. Please install it: npm install -g @googleworkspace/cli")
	}
	return nil
}

// CheckAuth verifies that gws is authenticated
func (g *GWSCLI) CheckAuth() error {
	// Try to list calendars as an auth check
	_, err := g.runGWS("calendar", "calendarList", "list", "--params", `{"maxResults": 1}`)
	if err != nil {
		return fmt.Errorf("gws not authenticated. Please run 'gws auth setup' first: %w", err)
	}
	return nil
}

// EmailMessage represents a Gmail message from gws
type EmailMessage struct {
	ID       string `json:"id"`
	ThreadID string `json:"threadId"`
	Subject  string `json:"subject"`
	From     string `json:"from"`
	To       string `json:"to"`
	Date     string `json:"date"`
	Snippet  string `json:"snippet"`
	Body     string `json:"body,omitempty"`
}

// Calendar represents a Google Calendar
type Calendar struct {
	ID       string `json:"id"`
	Summary  string `json:"summary"`
	Primary  bool   `json:"primary,omitempty"`
	Selected bool   `json:"selected,omitempty"`
}

// CalendarEvent represents a calendar event from gws
type CalendarEvent struct {
	ID          string `json:"id"`
	CalendarID  string `json:"calendarId,omitempty"` // Added by us
	Summary     string `json:"summary"`
	Description string `json:"description,omitempty"`
	Location    string `json:"location,omitempty"`
	Start       string `json:"start"` // Format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
	End         string `json:"end"`   // Format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
	Status      string `json:"status,omitempty"`
}

// EventTime represents Google API datetime format (can be date or dateTime)
type EventTime struct {
	Date     string `json:"date"`
	DateTime string `json:"dateTime"`
}

// RawCalendarEvent is the raw format from Google Calendar API
type RawCalendarEvent struct {
	ID          string    `json:"id"`
	Summary     string    `json:"summary"`
	Description string    `json:"description,omitempty"`
	Location    string    `json:"location,omitempty"`
	Start       EventTime `json:"start"`
	End         EventTime `json:"end"`
	Status      string    `json:"status,omitempty"`
}

// runGWS executes the gws command and returns output
func (g *GWSCLI) runGWS(args ...string) (string, error) {
	cmd := exec.Command("gws", args...)
	log.Printf("[gws] Running: gws %s", strings.Join(args, " "))

	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("gws command failed: %w (stderr: %s)", err, stderr.String())
	}

	return stdout.String(), nil
}

// --- Gmail Operations ---

// FetchSentEmails fetches sent emails from Gmail
func (g *GWSCLI) FetchSentEmails(after, before time.Time) ([]EmailMessage, error) {
	log.Printf("[gws] Fetching sent emails: after:%s before:%s",
		after.Format("2006/01/02"), before.Format("2006/01/02"))

	query := fmt.Sprintf("in:sent after:%s before:%s",
		after.Format("2006/01/02"), before.Format("2006/01/02"))

	params := map[string]interface{}{
		"userId":     "me",
		"q":          query,
		"maxResults": 50,
	}
	paramsJSON, _ := json.Marshal(params)

	out, err := g.runGWS("gmail", "users", "messages", "list", "--params", string(paramsJSON))
	if err != nil {
		return nil, fmt.Errorf("gmail list failed: %w", err)
	}

	var result struct {
		Messages []struct {
			ID       string `json:"id"`
			ThreadID string `json:"threadId"`
		} `json:"messages"`
	}
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return nil, fmt.Errorf("failed to parse gmail list: %w", err)
	}

	// Fetch details for each message
	var messages []EmailMessage
	for _, msg := range result.Messages {
		detail, err := g.getMessageDetail(msg.ID)
		if err != nil {
			log.Printf("[gws] Warning: failed to get message %s: %v", msg.ID, err)
			continue
		}
		messages = append(messages, *detail)
	}

	log.Printf("[gws] Found %d sent emails", len(messages))
	return messages, nil
}

// FetchReceivedEmails fetches received emails from Gmail inbox
func (g *GWSCLI) FetchReceivedEmails(after, before time.Time) ([]EmailMessage, error) {
	log.Printf("[gws] Fetching received emails: after:%s before:%s",
		after.Format("2006/01/02"), before.Format("2006/01/02"))

	query := fmt.Sprintf("in:inbox after:%s before:%s",
		after.Format("2006/01/02"), before.Format("2006/01/02"))

	params := map[string]interface{}{
		"userId":     "me",
		"q":          query,
		"maxResults": 50,
	}
	paramsJSON, _ := json.Marshal(params)

	out, err := g.runGWS("gmail", "users", "messages", "list", "--params", string(paramsJSON))
	if err != nil {
		return nil, fmt.Errorf("gmail list failed: %w", err)
	}

	var result struct {
		Messages []struct {
			ID       string `json:"id"`
			ThreadID string `json:"threadId"`
		} `json:"messages"`
	}
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return nil, fmt.Errorf("failed to parse gmail list: %w", err)
	}

	// Fetch details for each message
	var messages []EmailMessage
	for _, msg := range result.Messages {
		detail, err := g.getMessageDetail(msg.ID)
		if err != nil {
			log.Printf("[gws] Warning: failed to get message %s: %v", msg.ID, err)
			continue
		}
		messages = append(messages, *detail)
	}

	log.Printf("[gws] Found %d received emails", len(messages))
	return messages, nil
}

// getMessageDetail fetches full message details
func (g *GWSCLI) getMessageDetail(messageID string) (*EmailMessage, error) {
	params := map[string]interface{}{
		"userId": "me",
		"id":     messageID,
		"format": "full",
	}
	paramsJSON, _ := json.Marshal(params)

	out, err := g.runGWS("gmail", "users", "messages", "get", "--params", string(paramsJSON))
	if err != nil {
		return nil, err
	}

	var msg struct {
		ID       string `json:"id"`
		ThreadID string `json:"threadId"`
		Snippet  string `json:"snippet"`
		Payload  struct {
			Headers []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			} `json:"headers"`
			Body struct {
				Data string `json:"data"`
			} `json:"body"`
			Parts []struct {
				MimeType string `json:"mimeType"`
				Body     struct {
					Data string `json:"data"`
				} `json:"body"`
			} `json:"parts"`
		} `json:"payload"`
		InternalDate string `json:"internalDate"`
	}
	if err := json.Unmarshal([]byte(out), &msg); err != nil {
		return nil, err
	}

	// Extract headers
	result := &EmailMessage{
		ID:       msg.ID,
		ThreadID: msg.ThreadID,
		Snippet:  msg.Snippet,
	}

	for _, h := range msg.Payload.Headers {
		switch strings.ToLower(h.Name) {
		case "subject":
			result.Subject = h.Value
		case "from":
			result.From = h.Value
		case "to":
			result.To = h.Value
		case "date":
			result.Date = h.Value
		}
	}

	// Convert internal date (Unix ms) to readable format if Date header missing
	if result.Date == "" && msg.InternalDate != "" {
		if ms, err := parseInt64(msg.InternalDate); err == nil {
			result.Date = time.Unix(0, ms*int64(time.Millisecond)).Format(time.RFC3339)
		}
	}

	return result, nil
}

func parseInt64(s string) (int64, error) {
	var result int64
	_, err := fmt.Sscanf(s, "%d", &result)
	return result, err
}

// --- Calendar Operations ---

// FetchCalendars fetches the list of available Google Calendars
func (g *GWSCLI) FetchCalendars() ([]Calendar, error) {
	log.Printf("[gws] Fetching calendar list")

	out, err := g.runGWS("calendar", "calendarList", "list")
	if err != nil {
		return nil, fmt.Errorf("calendar list failed: %w", err)
	}

	var result struct {
		Items []Calendar `json:"items"`
	}
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return nil, fmt.Errorf("failed to parse calendar list: %w", err)
	}

	log.Printf("[gws] Found %d calendars", len(result.Items))
	return result.Items, nil
}

// FetchCalendarEvents fetches events from a specific calendar
func (g *GWSCLI) FetchCalendarEvents(calendarID string, after, before time.Time) ([]CalendarEvent, error) {
	log.Printf("[gws] Fetching events from calendar %s: %s ~ %s",
		calendarID, after.Format("2006-01-02"), before.Format("2006-01-02"))

	params := map[string]interface{}{
		"calendarId": calendarID,
		"timeMin":    after.Format(time.RFC3339),
		"timeMax":    before.Format(time.RFC3339),
		"maxResults": 250,
	}
	paramsJSON, _ := json.Marshal(params)

	out, err := g.runGWS("calendar", "events", "list", "--params", string(paramsJSON))
	if err != nil {
		return nil, fmt.Errorf("events list failed for %s: %w", calendarID, err)
	}

	// Parse raw format from Google API
	var rawResult struct {
		Items []RawCalendarEvent `json:"items"`
	}
	if err := json.Unmarshal([]byte(out), &rawResult); err != nil {
		return nil, fmt.Errorf("failed to parse events: %w", err)
	}

	// Convert RawCalendarEvent to CalendarEvent
	var events []CalendarEvent
	for _, raw := range rawResult.Items {
		evt := CalendarEvent{
			ID:          raw.ID,
			CalendarID:  calendarID,
			Summary:     raw.Summary,
			Description: raw.Description,
			Location:    raw.Location,
			Status:      raw.Status,
			Start:       extractEventDateTime(raw.Start),
			End:         extractEventDateTime(raw.End),
		}
		events = append(events, evt)
	}

	log.Printf("[gws] Found %d events in calendar %s", len(events), calendarID)
	return events, nil
}

// extractEventDateTime extracts date or datetime from EventTime
func extractEventDateTime(et EventTime) string {
	if et.DateTime != "" {
		return et.DateTime[:10] // Extract YYYY-MM-DD from datetime
	}
	if et.Date != "" {
		return et.Date
	}
	return ""
}

// parseEventDateTime extracts date/datetime from various formats
func parseEventDateTime(dt string) string {
	// Handle Google API datetime format (2026-04-10T10:00:00+09:00)
	// Handle date format (2026-04-10)
	if len(dt) >= 10 {
		return dt[:10] // Extract YYYY-MM-DD
	}
	return dt
}

// FetchPrimaryCalendarEvents fetches events from the primary calendar
func (g *GWSCLI) FetchPrimaryCalendarEvents(after, before time.Time) ([]CalendarEvent, error) {
	return g.FetchCalendarEvents("primary", after, before)
}

// CalendarConfig represents a calendar to sync with its display color
type CalendarConfig struct {
	ID    string `json:"id"`
	Color string `json:"color"`
}
