// Package integrations provides sync functionality using GWS CLI
package integrations

import (
	"fmt"
	"log"
	"time"

	"openreport/internal/db"
)

// SyncGmail fetches sent/received emails via GWS CLI and stores them as activities
func SyncGmail(database *db.Database, account string, weekStart, weekEnd time.Time, integrationID int64) (int, error) {
	cli := &GWSCLI{Account: account}

	// Fetch sent emails
	sent, err := cli.FetchSentEmails(weekStart, weekEnd)
	if err != nil {
		return 0, fmt.Errorf("sent email fetch failed: %w", err)
	}

	// Fetch received emails
	received, err := cli.FetchReceivedEmails(weekStart, weekEnd)
	if err != nil {
		log.Printf("[sync] Warning: received email fetch failed: %v", err)
		// Don't fail entirely if received fetch fails
	}

	count := 0

	// Store sent emails as activities
	for _, msg := range sent {
		actDate := normalizeDate(msg.Date, weekStart)

		title := msg.Subject
		if title == "" {
			title = "(제목 없음)"
		}

		summary := fmt.Sprintf("To: %s", msg.To)
		if msg.Snippet != "" {
			summary = fmt.Sprintf("To: %s | %s", msg.To, msg.Snippet)
		}

		activity := &db.Activity{
			IntegrationID: integrationID,
			Source:        "gmail_sent",
			ExternalID:    msg.ID,
			Title:         fmt.Sprintf("[발신] %s", title),
			Summary:       summary,
			RawData:       "",
			ActivityDate:  actDate,
		}

		_, err := database.UpsertActivity(activity)
		if err != nil {
			log.Printf("[sync] Warning: failed to store sent email %s: %v", msg.ID, err)
			continue
		}
		count++
	}

	// Store received emails as activities
	for _, msg := range received {
		actDate := normalizeDate(msg.Date, weekStart)

		title := msg.Subject
		if title == "" {
			title = "(제목 없음)"
		}

		summary := fmt.Sprintf("From: %s", msg.From)

		activity := &db.Activity{
			IntegrationID: integrationID,
			Source:        "gmail_received",
			ExternalID:    msg.ID,
			Title:         fmt.Sprintf("[수신] %s", title),
			Summary:       summary,
			RawData:       "",
			ActivityDate:  actDate,
		}

		_, err := database.UpsertActivity(activity)
		if err != nil {
			log.Printf("[sync] Warning: failed to store received email %s: %v", msg.ID, err)
			continue
		}
		count++
	}

	log.Printf("[sync] Gmail sync complete: %d activities stored", count)
	return count, nil
}

// SyncGoogleCalendar fetches calendar events from multiple calendars via GWS CLI
// Supports multiple calendars when calendarConfigs is provided
func SyncGoogleCalendar(database *db.Database, account string, weekStart, weekEnd time.Time, integrationID int64, calendarConfigs []CalendarConfig) (int, error) {
	cli := &GWSCLI{Account: account}

	var allEvents []CalendarEvent

	// If specific calendars are configured, fetch from each
	if len(calendarConfigs) > 0 {
		for _, config := range calendarConfigs {
			if config.ID == "" {
				continue
			}
			events, err := cli.FetchCalendarEvents(config.ID, weekStart, weekEnd)
			if err != nil {
				log.Printf("[sync] Warning: failed to fetch calendar %s: %v", config.ID, err)
				continue
			}
			allEvents = append(allEvents, events...)
		}
	} else {
		// Fallback: fetch from primary calendar
		events, err := cli.FetchPrimaryCalendarEvents(weekStart, weekEnd)
		if err != nil {
			return 0, fmt.Errorf("calendar fetch failed: %w", err)
		}
		allEvents = events
	}

	count := 0
	for _, evt := range allEvents {
		actDate := evt.Start
		if len(actDate) >= 10 {
			actDate = actDate[:10]
		}

		log.Printf("[sync] Storing calendar event: ID=%s, Date=%s, Title=%s, Calendar=%s",
			evt.ID, actDate, evt.Summary, evt.CalendarID)

		activity := &db.Activity{
			IntegrationID: integrationID,
			Source:        "google_calendar",
			ExternalID:    evt.ID,
			Title:         evt.Summary,
			Summary:       formatCalendarSummary(evt),
			RawData:       "",
			ActivityDate:  actDate,
			CalendarID:    evt.CalendarID,
		}

		_, err := database.UpsertActivity(activity)
		if err != nil {
			log.Printf("[sync] Warning: failed to store calendar event %s: %v", evt.ID, err)
			continue
		}
		count++
	}

	log.Printf("[sync] Google Calendar sync complete: %d activities stored from %d calendars", count, len(calendarConfigs))
	return count, nil
}

// normalizeDate extracts YYYY-MM-DD from date strings
func normalizeDate(dateStr string, fallback time.Time) string {
	if dateStr == "" {
		return fallback.Format("2006-01-02")
	}
	// Try to parse RFC3339 format
	if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
		return t.Format("2006-01-02")
	}
	// Try to parse HTTP format
	if t, err := time.Parse(time.RFC1123, dateStr); err == nil {
		return t.Format("2006-01-02")
	}
	// Fallback: extract first 10 chars (YYYY-MM-DD)
	if len(dateStr) >= 10 {
		return dateStr[:10]
	}
	return dateStr
}

func formatCalendarSummary(evt CalendarEvent) string {
	parts := []string{}
	if evt.Start != "" {
		parts = append(parts, evt.Start)
	}
	if evt.End != "" && evt.End != evt.Start {
		parts = append(parts, "~ "+evt.End)
	}
	if evt.Location != "" {
		parts = append(parts, fmt.Sprintf("장소: %s", evt.Location))
	}
	if evt.Description != "" {
		desc := evt.Description
		if len(desc) > 100 {
			desc = desc[:100] + "..."
		}
		parts = append(parts, desc)
	}
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += " | "
		}
		result += p
	}
	return result
}
