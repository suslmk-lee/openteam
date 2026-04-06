package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// --- Users ---

func (d *Database) CreateUser(name, team string) (int64, error) {
	res, err := d.conn.Exec("INSERT INTO users (name, team) VALUES (?, ?)", name, team)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) GetUser(id int64) (*User, error) {
	u := &User{}
	err := d.conn.QueryRow("SELECT id, name, team, created_at FROM users WHERE id = ?", id).
		Scan(&u.ID, &u.Name, &u.Team, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (d *Database) ListUsers() ([]User, error) {
	rows, err := d.conn.Query("SELECT id, name, team, created_at FROM users ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Team, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	log.Printf("[ListUsers] Retrieved %d users", len(users))
	return users, nil
}

func (d *Database) GetOrCreateDefaultUser() (*User, error) {
	users, err := d.ListUsers()
	if err != nil {
		log.Printf("[GetOrCreateDefaultUser] Error: %v", err)
		return nil, err
	}
	if len(users) > 0 {
		log.Printf("[GetOrCreateDefaultUser] Retrieved default user with ID: %d", users[0].ID)
		return &users[0], nil
	}
	id, err := d.CreateUser("기본 사용자", "기본 팀")
	if err != nil {
		log.Printf("[GetOrCreateDefaultUser] Error: %v", err)
		return nil, err
	}
	log.Printf("[GetOrCreateDefaultUser] Created default user with ID: %d", id)
	return d.GetUser(id)
}

// --- Integrations ---

func (d *Database) SaveIntegration(i *Integration) (int64, error) {
	if i.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE integrations SET tool_type=?, config_json=?, enabled=? WHERE id=?",
			i.ToolType, i.ConfigJSON, i.Enabled, i.ID,
		)
		return i.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO integrations (user_id, tool_type, config_json, enabled) VALUES (?, ?, ?, ?)",
		i.UserID, i.ToolType, i.ConfigJSON, i.Enabled,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) UpdateIntegrationSyncTime(id int64) error {
	_, err := d.conn.Exec("UPDATE integrations SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	return err
}

func (d *Database) GetIntegrationByType(userID int64, toolType string) (*Integration, error) {
	i := &Integration{}
	err := d.conn.QueryRow(
		"SELECT id, user_id, tool_type, config_json, enabled, last_synced_at FROM integrations WHERE user_id = ? AND tool_type = ?",
		userID, toolType,
	).Scan(&i.ID, &i.UserID, &i.ToolType, &i.ConfigJSON, &i.Enabled, &i.LastSyncedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return i, nil
}

func (d *Database) ListIntegrations(userID int64) ([]Integration, error) {
	rows, err := d.conn.Query(
		"SELECT id, user_id, tool_type, config_json, enabled, last_synced_at FROM integrations WHERE user_id = ?",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var integrations []Integration
	for rows.Next() {
		var i Integration
		if err := rows.Scan(&i.ID, &i.UserID, &i.ToolType, &i.ConfigJSON, &i.Enabled, &i.LastSyncedAt); err != nil {
			return nil, err
		}
		integrations = append(integrations, i)
	}
	return integrations, nil
}

// --- Activities ---

func (d *Database) SaveActivity(a *Activity) (int64, error) {
	res, err := d.conn.Exec(
		`INSERT OR REPLACE INTO activities (integration_id, source, external_id, title, summary, raw_data, activity_date)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		a.IntegrationID, a.Source, a.ExternalID, a.Title, a.Summary, a.RawData, a.ActivityDate,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) UpsertActivity(a *Activity) (int64, error) {
	if a.ExternalID != "" {
		var existingID int64
		err := d.conn.QueryRow(
			"SELECT id FROM activities WHERE source = ? AND external_id = ?",
			a.Source, a.ExternalID,
		).Scan(&existingID)
		if err == nil {
			_, err := d.conn.Exec(
				`UPDATE activities SET title = ?, summary = ?, raw_data = ?, activity_date = ?, fetched_at = CURRENT_TIMESTAMP
				 WHERE id = ?`,
				a.Title, a.Summary, a.RawData, a.ActivityDate, existingID,
			)
			return existingID, err
		}
	}
	return d.SaveActivity(a)
}

func (d *Database) ListActivities(weekStart, weekEnd string) ([]Activity, error) {
	rows, err := d.conn.Query(
		`SELECT id, integration_id, source, external_id, title, summary, raw_data, activity_date, fetched_at
		 FROM activities WHERE activity_date BETWEEN ? AND ? ORDER BY activity_date DESC`,
		weekStart, weekEnd,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var activities []Activity
	for rows.Next() {
		var a Activity
		if err := rows.Scan(&a.ID, &a.IntegrationID, &a.Source, &a.ExternalID, &a.Title, &a.Summary, &a.RawData, &a.ActivityDate, &a.FetchedAt); err != nil {
			return nil, err
		}
		activities = append(activities, a)
	}
	return activities, nil
}

// --- Weekly Reports ---

func (d *Database) CreateWeeklyReport(userID int64, weekStart, weekEnd string) (int64, error) {
	res, err := d.conn.Exec(
		"INSERT INTO weekly_reports (user_id, week_start, week_end) VALUES (?, ?, ?)",
		userID, weekStart, weekEnd,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) GetWeeklyReport(id int64) (*WeeklyReport, error) {
	r := &WeeklyReport{}
	err := d.conn.QueryRow(
		"SELECT id, user_id, week_start, week_end, status, created_at FROM weekly_reports WHERE id = ?", id,
	).Scan(&r.ID, &r.UserID, &r.WeekStart, &r.WeekEnd, &r.Status, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (d *Database) GetWeeklyReportByWeek(userID int64, weekStart string) (*WeeklyReport, error) {
	r := &WeeklyReport{}
	err := d.conn.QueryRow(
		"SELECT id, user_id, week_start, week_end, status, created_at FROM weekly_reports WHERE user_id = ? AND week_start = ?",
		userID, weekStart,
	).Scan(&r.ID, &r.UserID, &r.WeekStart, &r.WeekEnd, &r.Status, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (d *Database) ListWeeklyReports(userID int64) ([]WeeklyReport, error) {
	rows, err := d.conn.Query(
		"SELECT id, user_id, week_start, week_end, status, created_at FROM weekly_reports WHERE user_id = ? ORDER BY week_start DESC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []WeeklyReport
	for rows.Next() {
		var r WeeklyReport
		if err := rows.Scan(&r.ID, &r.UserID, &r.WeekStart, &r.WeekEnd, &r.Status, &r.CreatedAt); err != nil {
			return nil, err
		}
		reports = append(reports, r)
	}
	return reports, nil
}

func (d *Database) UpdateReportStatus(id int64, status string) error {
	_, err := d.conn.Exec("UPDATE weekly_reports SET status = ? WHERE id = ?", status, id)
	return err
}

// --- Report Items ---

func (d *Database) SaveReportItem(item *ReportItem) (int64, error) {
	if item.Period == "" {
		item.Period = "this_week"
	}
	if item.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE report_items SET section=?, category=?, work_type=?, content=?, period=?, sort_order=?, is_selected=? WHERE id=?",
			item.Section, item.Category, item.WorkType, item.Content, item.Period, item.SortOrder, item.IsSelected, item.ID,
		)
		return item.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO report_items (report_id, activity_id, section, category, work_type, content, period, sort_order, is_selected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		item.ReportID, item.ActivityID, item.Section, item.Category, item.WorkType, item.Content, item.Period, item.SortOrder, item.IsSelected,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListReportItems(reportID int64) ([]ReportItem, error) {
	rows, err := d.conn.Query(
		"SELECT id, report_id, activity_id, section, category, work_type, content, period, sort_order, is_selected FROM report_items WHERE report_id = ? ORDER BY period, section, sort_order",
		reportID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ReportItem
	for rows.Next() {
		var item ReportItem
		if err := rows.Scan(&item.ID, &item.ReportID, &item.ActivityID, &item.Section, &item.Category, &item.WorkType, &item.Content, &item.Period, &item.SortOrder, &item.IsSelected); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (d *Database) ListReportItemsByPeriod(reportID int64, period string) ([]ReportItem, error) {
	rows, err := d.conn.Query(
		"SELECT id, report_id, activity_id, section, category, work_type, content, period, sort_order, is_selected FROM report_items WHERE report_id = ? AND period = ? ORDER BY section, sort_order",
		reportID, period,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ReportItem
	for rows.Next() {
		var item ReportItem
		if err := rows.Scan(&item.ID, &item.ReportID, &item.ActivityID, &item.Section, &item.Category, &item.WorkType, &item.Content, &item.Period, &item.SortOrder, &item.IsSelected); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (d *Database) GetPreviousWeekReport(userID int64, currentWeekStart string) (*WeeklyReport, error) {
	r := &WeeklyReport{}
	err := d.conn.QueryRow(
		"SELECT id, user_id, week_start, week_end, status, created_at FROM weekly_reports WHERE user_id = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1",
		userID, currentWeekStart,
	).Scan(&r.ID, &r.UserID, &r.WeekStart, &r.WeekEnd, &r.Status, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (d *Database) DeleteReportItem(id int64) error {
	_, err := d.conn.Exec("DELETE FROM report_items WHERE id = ?", id)
	return err
}

// --- Excel Templates ---

func (d *Database) SaveExcelTemplate(t *ExcelTemplate) (int64, error) {
	if t.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE excel_templates SET name=?, file_path=?, structure_json=? WHERE id=?",
			t.Name, t.FilePath, t.StructureJSON, t.ID,
		)
		return t.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO excel_templates (user_id, name, file_path, structure_json) VALUES (?, ?, ?, ?)",
		t.UserID, t.Name, t.FilePath, t.StructureJSON,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) GetExcelTemplate(userID int64) (*ExcelTemplate, error) {
	t := &ExcelTemplate{}
	err := d.conn.QueryRow(
		"SELECT id, user_id, name, file_path, structure_json, created_at FROM excel_templates WHERE user_id = ? ORDER BY id DESC LIMIT 1",
		userID,
	).Scan(&t.ID, &t.UserID, &t.Name, &t.FilePath, &t.StructureJSON, &t.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return t, nil
}

// --- Project Categories ---

func (d *Database) SaveProjectCategory(userID int64, name string, sortOrder int) (int64, error) {
	res, err := d.conn.Exec(
		"INSERT INTO project_categories (user_id, name, sort_order) VALUES (?, ?, ?)",
		userID, name, sortOrder,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListProjectCategories(userID int64) ([]ProjectCategory, error) {
	rows, err := d.conn.Query(
		"SELECT id, user_id, name, sort_order FROM project_categories WHERE user_id = ? ORDER BY sort_order",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []ProjectCategory
	for rows.Next() {
		var c ProjectCategory
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.SortOrder); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, nil
}

func (d *Database) DeleteProjectCategory(id int64) error {
	_, err := d.conn.Exec("DELETE FROM project_categories WHERE id = ?", id)
	return err
}

// --- SI Team Ops ---

func (d *Database) SaveTeamMember(m *TeamMember) (int64, error) {
	if m.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE team_members SET name=?, position=?, email=?, role=?, employment_type=?, active=?, hire_date=?, resign_date=? WHERE id=? AND user_id=?",
			m.Name, m.Position, m.Email, m.Role, m.EmploymentType, m.Active, m.HireDate, m.ResignDate, m.ID, m.UserID,
		)
		return m.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO team_members (user_id, name, position, email, role, employment_type, active, hire_date, resign_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		m.UserID, m.Name, m.Position, m.Email, m.Role, m.EmploymentType, m.Active, m.HireDate, m.ResignDate,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListTeamMembers(userID int64) ([]TeamMember, error) {
	rows, err := d.conn.Query(
		"SELECT id, user_id, name, position, email, role, employment_type, active, hire_date, resign_date, created_at FROM team_members WHERE user_id = ? ORDER BY active DESC, name ASC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []TeamMember
	for rows.Next() {
		var m TeamMember
		var active int64
		var hireDate sql.NullString
		var resignDate sql.NullString
		if err := rows.Scan(&m.ID, &m.UserID, &m.Name, &m.Position, &m.Email, &m.Role, &m.EmploymentType, &active, &hireDate, &resignDate, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Active = active == 1
		if hireDate.Valid {
			m.HireDate = hireDate.String
		}
		if resignDate.Valid {
			value := resignDate.String
			m.ResignDate = &value
		}
		members = append(members, m)
	}
	return members, nil
}

func (d *Database) DeleteTeamMember(userID, memberID int64) error {
	_, err := d.conn.Exec("DELETE FROM team_members WHERE id = ? AND user_id = ?", memberID, userID)
	return err
}

// --- Clients ---

func (d *Database) SaveClient(c *Client) (int64, error) {
	if c.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE clients SET name=?, status=?, owner_name=?, contact_email=?, notes=?, active=? WHERE id=? AND user_id=?",
			c.Name, c.Status, c.OwnerName, c.ContactEmail, c.Notes, c.Active, c.ID, c.UserID,
		)
		return c.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO clients (user_id, name, status, owner_name, contact_email, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?)",
		c.UserID, c.Name, c.Status, c.OwnerName, c.ContactEmail, c.Notes, c.Active,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListClients(userID int64, status string, activeOnly bool) ([]Client, error) {
	query := "SELECT id, user_id, name, status, owner_name, contact_email, notes, active, created_at FROM clients WHERE user_id = ?"
	args := []interface{}{userID}
	if status != "" {
		query += " AND status = ?"
		args = append(args, status)
	}
	if activeOnly {
		query += " AND active = 1"
	}
	query += " ORDER BY active DESC, name ASC"

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var clients []Client
	for rows.Next() {
		var c Client
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Status, &c.OwnerName, &c.ContactEmail, &c.Notes, &c.Active, &c.CreatedAt); err != nil {
			return nil, err
		}
		clients = append(clients, c)
	}
	return clients, nil
}

func (d *Database) GetClient(userID, clientID int64) (*Client, error) {
	row := d.conn.QueryRow(
		"SELECT id, user_id, name, status, owner_name, contact_email, notes, active, created_at FROM clients WHERE id = ? AND user_id = ?",
		clientID, userID,
	)
	var c Client
	if err := row.Scan(&c.ID, &c.UserID, &c.Name, &c.Status, &c.OwnerName, &c.ContactEmail, &c.Notes, &c.Active, &c.CreatedAt); err != nil {
		return nil, err
	}
	return &c, nil
}

func (d *Database) DeleteClient(userID, clientID int64) error {
	_, err := d.conn.Exec("DELETE FROM clients WHERE id = ? AND user_id = ?", clientID, userID)
	return err
}

func (d *Database) SaveProject(p *Project) (int64, error) {
	if p.TeamType == "" {
		p.TeamType = "si"
	}
	if p.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE projects SET team_type=?, client_id=?, name=?, client_name=?, status=?, description=?, start_date=?, end_date=? WHERE id=? AND user_id=?",
			p.TeamType, p.ClientID, p.Name, p.ClientName, p.Status, p.Description, p.StartDate, p.EndDate, p.ID, p.UserID,
		)
		return p.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO projects (user_id, team_type, client_id, name, client_name, status, description, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		p.UserID, p.TeamType, p.ClientID, p.Name, p.ClientName, p.Status, p.Description, p.StartDate, p.EndDate,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListProjectsWithClient(userID int64, teamType string) ([]ProjectWithClient, error) {
	if teamType == "" {
		teamType = "si"
	}
	query := `
		SELECT p.id, p.user_id, p.team_type, p.client_id, p.name, p.client_name, p.status, p.description, p.start_date, p.end_date, p.created_at,
		       c.name as client_display_name
		FROM projects p
		LEFT JOIN clients c ON c.id = p.client_id
		WHERE p.user_id = ? AND p.team_type = ?
		ORDER BY p.created_at DESC`
	rows, err := d.conn.Query(query, userID, teamType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []ProjectWithClient
	for rows.Next() {
		var p ProjectWithClient
		var clientDisplayName sql.NullString
		if err := rows.Scan(&p.ID, &p.UserID, &p.TeamType, &p.ClientID, &p.Name, &p.ClientName, &p.Status, &p.Description, &p.StartDate, &p.EndDate, &p.CreatedAt, &clientDisplayName); err != nil {
			return nil, err
		}
		if clientDisplayName.Valid && clientDisplayName.String != "" {
			p.ClientName = clientDisplayName.String
		}
		projects = append(projects, p)
	}
	return projects, nil
}

func (d *Database) UpdateProjectStatus(userID, projectID int64, status string) error {
	_, err := d.conn.Exec("UPDATE projects SET status = ? WHERE id = ? AND user_id = ?", status, projectID, userID)
	return err
}

func (d *Database) DeleteProject(userID, projectID int64) error {
	_, err := d.conn.Exec("DELETE FROM projects WHERE id = ? AND user_id = ?", projectID, userID)
	return err
}

func (d *Database) validateAssignmentTotal(userID, memberID int64, startDate string, endDate *string, excludeID int64, pendingAllocation float64) error {
	checkStart := startDate
	checkEnd := startDate
	if endDate != nil && *endDate != "" {
		checkEnd = *endDate
	}

	query := `SELECT COALESCE(SUM(allocation_percent), 0)
		FROM member_assignments
		WHERE user_id = ? AND team_member_id = ?
		  AND start_date <= ?
		  AND (end_date IS NULL OR end_date >= ?)`
	args := []interface{}{userID, memberID, checkEnd, checkStart}
	if excludeID > 0 {
		query += " AND id != ?"
		args = append(args, excludeID)
	}

	var current float64
	if err := d.conn.QueryRow(query, args...).Scan(&current); err != nil {
		return err
	}
	if current+pendingAllocation > 100 {
		return fmt.Errorf("assignment would exceed 100%% allocation for member")
	}
	return nil
}

func (d *Database) SaveMemberAssignment(a *MemberAssignment) (int64, error) {
	if a.AllocationPercent < 0 || a.AllocationPercent > 100 {
		return 0, fmt.Errorf("allocation percent must be between 0 and 100")
	}
	if a.StartDate == "" {
		return 0, fmt.Errorf("start date is required")
	}
	if err := d.validateAssignmentTotal(a.UserID, a.TeamMemberID, a.StartDate, a.EndDate, a.ID, a.AllocationPercent); err != nil {
		return 0, err
	}

	if a.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE member_assignments SET team_member_id=?, project_id=?, allocation_percent=?, start_date=?, end_date=?, work_mode=?, notes=? WHERE id=? AND user_id=?",
			a.TeamMemberID, a.ProjectID, a.AllocationPercent, a.StartDate, a.EndDate, a.WorkMode, a.Notes, a.ID, a.UserID,
		)
		return a.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO member_assignments (user_id, team_member_id, project_id, allocation_percent, start_date, end_date, work_mode, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		a.UserID, a.TeamMemberID, a.ProjectID, a.AllocationPercent, a.StartDate, a.EndDate, a.WorkMode, a.Notes,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListMemberAssignments(userID int64, weekStart, weekEnd string) ([]MemberAssignment, error) {
	rows, err := d.conn.Query(
		`SELECT id, user_id, team_member_id, project_id, allocation_percent, start_date, end_date, work_mode, notes, created_at
		 FROM member_assignments
		 WHERE user_id = ?
		   AND start_date <= ?
		   AND (end_date IS NULL OR end_date >= ?)
		 ORDER BY start_date DESC, id DESC`,
		userID, weekEnd, weekStart,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assignments []MemberAssignment
	for rows.Next() {
		var a MemberAssignment
		if err := rows.Scan(&a.ID, &a.UserID, &a.TeamMemberID, &a.ProjectID, &a.AllocationPercent, &a.StartDate, &a.EndDate, &a.WorkMode, &a.Notes, &a.CreatedAt); err != nil {
			return nil, err
		}
		assignments = append(assignments, a)
	}
	return assignments, nil
}

func (d *Database) DeleteMemberAssignment(userID, assignmentID int64) error {
	_, err := d.conn.Exec("DELETE FROM member_assignments WHERE id = ? AND user_id = ?", assignmentID, userID)
	return err
}

func (d *Database) GetUtilizationByDate(userID int64, date string) ([]UtilizationMemberRow, error) {
	rows, err := d.conn.Query(
		`SELECT tm.id, tm.name, COALESCE(SUM(ma.allocation_percent), 0) AS alloc
		 FROM team_members tm
		 LEFT JOIN member_assignments ma
		   ON ma.team_member_id = tm.id
		  AND ma.user_id = tm.user_id
		  AND ma.start_date <= ?
		  AND (ma.end_date IS NULL OR ma.end_date >= ?)
		 WHERE tm.user_id = ? AND tm.active = 1
		 GROUP BY tm.id, tm.name
		 ORDER BY tm.name ASC`,
		date, date, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []UtilizationMemberRow
	for rows.Next() {
		var r UtilizationMemberRow
		if err := rows.Scan(&r.TeamMemberID, &r.TeamMemberName, &r.AllocationPercent); err != nil {
			return nil, err
		}
		r.Unassigned = r.AllocationPercent == 0
		r.OverAllocated = r.AllocationPercent > 100
		result = append(result, r)
	}
	return result, nil
}

func (d *Database) GetProjectStatusCounts(userID int64, teamType string) ([]ProjectStatusCount, error) {
	if teamType == "" {
		teamType = "si"
	}
	rows, err := d.conn.Query(
		`SELECT status, COUNT(*)
		 FROM projects
		 WHERE user_id = ? AND team_type = ?
		 GROUP BY status`,
		userID, teamType,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var counts []ProjectStatusCount
	for rows.Next() {
		var c ProjectStatusCount
		if err := rows.Scan(&c.Status, &c.Count); err != nil {
			return nil, err
		}
		counts = append(counts, c)
	}
	return counts, nil
}

func (d *Database) GetSIWeeklySnapshot(userID int64, weekStart, weekEnd string) (*SIWeeklySnapshot, error) {
	start, err := time.Parse("2006-01-02", weekStart)
	if err != nil {
		return nil, err
	}
	end, err := time.Parse("2006-01-02", weekEnd)
	if err != nil {
		return nil, err
	}

	if end.Before(start) {
		return nil, fmt.Errorf("week end must be after week start")
	}

	memberSum := make(map[int64]*UtilizationMemberRow)
	days := 0
	for dte := start; !dte.After(end); dte = dte.AddDate(0, 0, 1) {
		rows, err := d.GetUtilizationByDate(userID, dte.Format("2006-01-02"))
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			existing, ok := memberSum[r.TeamMemberID]
			if !ok {
				copyRow := r
				copyRow.AllocationPercent = 0
				copyRow.Unassigned = false
				copyRow.OverAllocated = false
				memberSum[r.TeamMemberID] = &copyRow
				existing = &copyRow
			}
			existing.AllocationPercent += r.AllocationPercent
		}
		days++
	}

	memberRows := make([]UtilizationMemberRow, 0, len(memberSum))
	teamTotal := 0.0
	unassignedCount := 0
	for _, r := range memberSum {
		if days > 0 {
			r.AllocationPercent = r.AllocationPercent / float64(days)
		}
		r.Unassigned = r.AllocationPercent == 0
		r.OverAllocated = r.AllocationPercent > 100
		if r.Unassigned {
			unassignedCount++
		}
		teamTotal += r.AllocationPercent
		memberRows = append(memberRows, *r)
	}

	teamUtilization := 0.0
	if len(memberRows) > 0 {
		teamUtilization = teamTotal / float64(len(memberRows))
	}

	statusCounts, err := d.GetProjectStatusCounts(userID, "si")
	if err != nil {
		return nil, err
	}

	return &SIWeeklySnapshot{
		WeekStart:              weekStart,
		WeekEnd:                weekEnd,
		TeamUtilizationPercent: teamUtilization,
		UnassignedCount:        unassignedCount,
		MemberRows:             memberRows,
		ProjectStatusCounts:    statusCounts,
	}, nil
}

// --- Attendance ---

func (d *Database) SaveAttendanceRecord(r *AttendanceRecord) (int64, error) {
	if r.ID > 0 {
		_, err := d.conn.Exec(
			`UPDATE attendance_records SET 
				team_member_id=?, record_date=?, type=?, check_in_time=?, check_out_time=?, notes=?, integration_source=?, external_id=?
			 WHERE id=? AND user_id=?`,
			r.TeamMemberID, r.RecordDate, r.Type, r.CheckInTime, r.CheckOutTime, r.Notes, r.IntegrationSource, r.ExternalID,
			r.ID, r.UserID,
		)
		return r.ID, err
	}
	res, err := d.conn.Exec(
		`INSERT INTO attendance_records (user_id, team_member_id, record_date, type, check_in_time, check_out_time, notes, integration_source, external_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.UserID, r.TeamMemberID, r.RecordDate, r.Type, r.CheckInTime, r.CheckOutTime, r.Notes, r.IntegrationSource, r.ExternalID,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListAttendanceRecords(userID int64, memberID int64, startDate, endDate string) ([]AttendanceRecord, error) {
	query := `SELECT id, user_id, team_member_id, record_date, type, check_in_time, check_out_time, notes, integration_source, external_id, created_at
		 FROM attendance_records
		 WHERE user_id = ?`
	args := []interface{}{userID}
	
	if memberID > 0 {
		query += " AND team_member_id = ?"
		args = append(args, memberID)
	}
	if startDate != "" {
		query += " AND record_date >= ?"
		args = append(args, startDate)
	}
	if endDate != "" {
		query += " AND record_date <= ?"
		args = append(args, endDate)
	}
	query += " ORDER BY record_date DESC, team_member_id"

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []AttendanceRecord
	for rows.Next() {
		var r AttendanceRecord
		if err := rows.Scan(&r.ID, &r.UserID, &r.TeamMemberID, &r.RecordDate, &r.Type, &r.CheckInTime, &r.CheckOutTime, &r.Notes, &r.IntegrationSource, &r.ExternalID, &r.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, nil
}

func (d *Database) DeleteAttendanceRecord(userID, recordID int64) error {
	_, err := d.conn.Exec("DELETE FROM attendance_records WHERE id = ? AND user_id = ?", recordID, userID)
	return err
}

func (d *Database) GetAttendanceSummary(userID int64, startDate, endDate string) ([]AttendanceSummary, error) {
	log.Printf("[DB GetAttendanceSummary] userID=%d, startDate=%s, endDate=%s", userID, startDate, endDate)
	
	// 먼저 해당 기간에 근태 기록이 있는지 확인
	countQuery := `SELECT COUNT(*) FROM attendance_records WHERE user_id = ? AND record_date >= ? AND record_date <= ?`
	var totalCount int
	err := d.conn.QueryRow(countQuery, userID, startDate, endDate).Scan(&totalCount)
	if err != nil {
		log.Printf("[DB GetAttendanceSummary] Count query error: %v", err)
	} else {
		log.Printf("[DB GetAttendanceSummary] Total records in period: %d", totalCount)
	}
	
	query := `
		SELECT 
			tm.id as team_member_id,
			tm.name as team_member_name,
			SUM(CASE WHEN ar.type = 'vacation' THEN 1 ELSE 0 END) as vacation_days,
			SUM(CASE WHEN ar.type = 'morning_half' THEN 1 ELSE 0 END) as morning_half_days,
			SUM(CASE WHEN ar.type = 'afternoon_half' THEN 1 ELSE 0 END) as afternoon_half_days,
			SUM(CASE WHEN ar.type = 'vacation' THEN 1 
			         WHEN ar.type IN ('morning_half', 'afternoon_half') THEN 0.5 
			         ELSE 0 END) as total_days
		FROM team_members tm
		LEFT JOIN attendance_records ar ON ar.team_member_id = tm.id 
			AND ar.record_date >= ? AND ar.record_date <= ?
			AND ar.user_id = ?
		WHERE tm.user_id = ?
		GROUP BY tm.id, tm.name
		ORDER BY tm.name
	`
	log.Printf("[DB GetAttendanceSummary] Executing query with params: start=%s, end=%s, userID=%d", startDate, endDate, userID)
	rows, err := d.conn.Query(query, startDate, endDate, userID, userID)
	if err != nil {
		log.Printf("[DB GetAttendanceSummary] Query error: %v", err)
		return nil, err
	}
	defer rows.Close()

	var summaries []AttendanceSummary
	for rows.Next() {
		var s AttendanceSummary
		if err := rows.Scan(&s.TeamMemberID, &s.TeamMemberName, &s.VacationDays, &s.MorningHalfDays, &s.AfternoonHalfDays, &s.TotalDays); err != nil {
			log.Printf("[DB GetAttendanceSummary] Scan error: %v", err)
			return nil, err
		}
		log.Printf("[DB GetAttendanceSummary] Scanned: %s (ID=%d) - vacation=%d, morning=%d, afternoon=%d, total=%.1f",
			s.TeamMemberName, s.TeamMemberID, s.VacationDays, s.MorningHalfDays, s.AfternoonHalfDays, s.TotalDays)
		summaries = append(summaries, s)
	}
	log.Printf("[DB GetAttendanceSummary] Returning %d summaries", len(summaries))
	return summaries, nil
}

// --- Utility ---

func (d *Database) ExecRaw(query string, args ...interface{}) error {
	_, err := d.conn.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("exec failed: %w", err)
	}
	return nil
}

// --- SI Project Weekly Reporting ---

func (d *Database) SaveSIProjectDetail(detail *SIProjectDetail) (int64, error) {
	if detail.ID > 0 {
		_, err := d.conn.Exec(
			`UPDATE si_project_details 
			 SET project_type=?, pm_name=?, total_mm=?, current_phase=?, progress_rate=?
			 WHERE id=? AND user_id=?`,
			detail.ProjectType, detail.PMName, detail.TotalMM, detail.CurrentPhase, detail.ProgressRate,
			detail.ID, detail.UserID,
		)
		return detail.ID, err
	}
	res, err := d.conn.Exec(
		`INSERT INTO si_project_details (user_id, project_id, project_type, pm_name, total_mm, current_phase, progress_rate) 
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		detail.UserID, detail.ProjectID, detail.ProjectType, detail.PMName, detail.TotalMM, detail.CurrentPhase, detail.ProgressRate,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) GetSIProjectDetail(userID, projectID int64) (*SIProjectDetail, error) {
	row := d.conn.QueryRow(
		`SELECT id, user_id, project_id, project_type, pm_name, total_mm, current_phase, progress_rate, created_at 
		 FROM si_project_details WHERE user_id=? AND project_id=?`,
		userID, projectID,
	)
	var detail SIProjectDetail
	if err := row.Scan(&detail.ID, &detail.UserID, &detail.ProjectID, &detail.ProjectType, 
		&detail.PMName, &detail.TotalMM, &detail.CurrentPhase, &detail.ProgressRate, &detail.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &detail, nil
}

func (d *Database) SaveSIWeeklyReport(report *SIWeeklyReport) (int64, error) {
	if report.ID > 0 {
		_, err := d.conn.Exec(
			`UPDATE si_weekly_reports 
			 SET this_week_progress=?, next_week_plan=?, risks=?, notes=?
			 WHERE id=? AND user_id=?`,
			report.ThisWeekProgress, report.NextWeekPlan, report.Risks, report.Notes,
			report.ID, report.UserID,
		)
		return report.ID, err
	}
	res, err := d.conn.Exec(
		`INSERT INTO si_weekly_reports (user_id, project_id, week_start, week_end, this_week_progress, next_week_plan, risks, notes) 
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		report.UserID, report.ProjectID, report.WeekStart, report.WeekEnd,
		report.ThisWeekProgress, report.NextWeekPlan, report.Risks, report.Notes,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) GetSIWeeklyReport(userID, projectID int64, weekStart string) (*SIWeeklyReport, error) {
	row := d.conn.QueryRow(
		`SELECT id, user_id, project_id, week_start, week_end, this_week_progress, next_week_plan, risks, notes, created_at 
		 FROM si_weekly_reports WHERE user_id=? AND project_id=? AND week_start=?`,
		userID, projectID, weekStart,
	)
	var report SIWeeklyReport
	if err := row.Scan(&report.ID, &report.UserID, &report.ProjectID, &report.WeekStart, &report.WeekEnd,
		&report.ThisWeekProgress, &report.NextWeekPlan, &report.Risks, &report.Notes, &report.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &report, nil
}

func (d *Database) SaveSIProjectMember(member *SIProjectMember) (int64, error) {
	if member.ID > 0 {
		_, err := d.conn.Exec(
			`UPDATE si_project_members SET role=?, allocation_mm=?, start_date=?, end_date=?
			 WHERE id=? AND user_id=?`,
			member.Role, member.AllocationMM, member.StartDate, member.EndDate,
			member.ID, member.UserID,
		)
		return member.ID, err
	}
	res, err := d.conn.Exec(
		`INSERT INTO si_project_members (user_id, project_id, team_member_id, role, allocation_mm, start_date, end_date) 
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		member.UserID, member.ProjectID, member.TeamMemberID, member.Role, member.AllocationMM, member.StartDate, member.EndDate,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListSIProjectMembers(userID, projectID int64) ([]SIProjectMember, error) {
	rows, err := d.conn.Query(
		`SELECT pm.id, pm.user_id, pm.project_id, pm.team_member_id, tm.name, pm.role, pm.allocation_mm, pm.start_date, pm.end_date
		 FROM si_project_members pm
		 JOIN team_members tm ON tm.id = pm.team_member_id
		 WHERE pm.user_id=? AND pm.project_id=?
		 ORDER BY tm.name`,
		userID, projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []SIProjectMember
	for rows.Next() {
		var m SIProjectMember
		if err := rows.Scan(&m.ID, &m.UserID, &m.ProjectID, &m.TeamMemberID, &m.MemberName, 
			&m.Role, &m.AllocationMM, &m.StartDate, &m.EndDate); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func (d *Database) DeleteSIProjectMember(userID, memberID int64) error {
	_, err := d.conn.Exec("DELETE FROM si_project_members WHERE id=? AND user_id=?", memberID, userID)
	return err
}

func (d *Database) GetSIProjectView(userID, projectID int64, weekStart, weekEnd string) (*SIProjectView, error) {
	// Get base project
	row := d.conn.QueryRow(
		`SELECT id, user_id, team_type, client_id, name, client_name, status, description, start_date, end_date, created_at
		 FROM projects WHERE id=? AND user_id=?`,
		projectID, userID,
	)
	var view SIProjectView
	if err := row.Scan(&view.Project.ID, &view.Project.UserID, &view.Project.TeamType, &view.Project.ClientID,
		&view.Project.Name, &view.Project.ClientName, &view.Project.Status, &view.Project.Description,
		&view.Project.StartDate, &view.Project.EndDate, &view.Project.CreatedAt); err != nil {
		return nil, err
	}

	// Get detail
	detail, _ := d.GetSIProjectDetail(userID, projectID)
	view.Detail = detail

	// Get members
	members, _ := d.ListSIProjectMembers(userID, projectID)
	view.Members = members

	// Get weekly report for this week
	weeklyReport, _ := d.GetSIWeeklyReport(userID, projectID, weekStart)
	view.WeeklyReport = weeklyReport

	return &view, nil
}

// --- Common Code Management ---

func (d *Database) SaveCodeGroup(g *CodeGroup) (int64, error) {
	if g.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE code_groups SET group_code=?, group_name=?, description=?, sort_order=? WHERE id=? AND user_id=?",
			g.GroupCode, g.GroupName, g.Description, g.SortOrder, g.ID, g.UserID,
		)
		return g.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO code_groups (user_id, group_code, group_name, description, sort_order) VALUES (?, ?, ?, ?, ?)",
		g.UserID, g.GroupCode, g.GroupName, g.Description, g.SortOrder,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) DeleteCodeGroup(userID, groupID int64) error {
	_, err := d.conn.Exec("DELETE FROM code_groups WHERE id = ? AND user_id = ?", groupID, userID)
	return err
}

func (d *Database) ListCodeGroups(userID int64) ([]CodeGroup, error) {
	rows, err := d.conn.Query(
		"SELECT id, user_id, group_code, group_name, description, sort_order, created_at FROM code_groups WHERE user_id = ? ORDER BY sort_order, group_name",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []CodeGroup
	for rows.Next() {
		var g CodeGroup
		if err := rows.Scan(&g.ID, &g.UserID, &g.GroupCode, &g.GroupName, &g.Description, &g.SortOrder, &g.CreatedAt); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, nil
}

func (d *Database) SaveCodeValue(v *CodeValue) (int64, error) {
	if v.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE code_values SET code_value=?, code_label=?, description=?, sort_order=?, is_active=? WHERE id=? AND user_id=?",
			v.CodeValue, v.CodeLabel, v.Description, v.SortOrder, v.IsActive, v.ID, v.UserID,
		)
		return v.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO code_values (user_id, group_code, code_value, code_label, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
		v.UserID, v.GroupCode, v.CodeValue, v.CodeLabel, v.Description, v.SortOrder, v.IsActive,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) DeleteCodeValue(userID, valueID int64) error {
	_, err := d.conn.Exec("DELETE FROM code_values WHERE id = ? AND user_id = ?", valueID, userID)
	return err
}

func (d *Database) ListCodeValuesByGroup(userID int64, groupCode string) ([]CodeValue, error) {
	rows, err := d.conn.Query(
		"SELECT id, user_id, group_code, code_value, code_label, description, sort_order, is_active, created_at FROM code_values WHERE user_id = ? AND group_code = ? AND is_active = 1 ORDER BY sort_order, code_label",
		userID, groupCode,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var values []CodeValue
	for rows.Next() {
		var v CodeValue
		var isActive int
		if err := rows.Scan(&v.ID, &v.UserID, &v.GroupCode, &v.CodeValue, &v.CodeLabel, &v.Description, &v.SortOrder, &isActive, &v.CreatedAt); err != nil {
			return nil, err
		}
		v.IsActive = isActive == 1
		values = append(values, v)
	}
	return values, nil
}
