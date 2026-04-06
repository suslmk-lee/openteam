package integrations

import (
	"fmt"
	"log"
	"time"

	"openreport/internal/db"
)

// SyncGmail fetches sent emails via gogcli and stores them as activities
func SyncGmail(database *db.Database, account string, weekStart, weekEnd time.Time, integrationID int64) (int, error) {
	cli := &GogCLI{Account: account}

	// Fetch sent emails (업무 활동의 증거)
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

		summary := fmt.Sprintf("To: %s", msg.Snippet)

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

// SyncGoogleCalendar fetches calendar events via gogcli and stores them as activities
func SyncGoogleCalendar(database *db.Database, account string, weekStart, weekEnd time.Time, integrationID int64) (int, error) {
	cli := &GogCLI{Account: account}

	events, err := cli.FetchCalendarEvents(weekStart, weekEnd)
	if err != nil {
		return 0, fmt.Errorf("calendar fetch failed: %w", err)
	}

	count := 0
	for _, evt := range events {
		actDate := evt.Start
		if len(actDate) >= 10 {
			actDate = actDate[:10]
		}

		activity := &db.Activity{
			IntegrationID: integrationID,
			Source:        "google_calendar",
			ExternalID:    evt.ID,
			Title:         evt.Summary,
			Summary:       formatCalendarSummary(evt),
			RawData:       "",
			ActivityDate:  actDate,
		}

		_, err := database.UpsertActivity(activity)
		if err != nil {
			log.Printf("[sync] Warning: failed to store calendar event %s: %v", evt.ID, err)
			continue
		}
		count++
	}

	log.Printf("[sync] Google Calendar sync complete: %d activities stored", count)
	return count, nil
}

// normalizeDate extracts YYYY-MM-DD from date strings like "2026-04-02 10:17"
func normalizeDate(dateStr string, fallback time.Time) string {
	if dateStr == "" {
		return fallback.Format("2006-01-02")
	}
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
