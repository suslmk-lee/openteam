package db

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

type Database struct {
	conn *sql.DB
	path string
}

func New(dbPath string) (*Database, error) {
	conn, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	d := &Database{conn: conn, path: dbPath}
	if err := d.migrate(); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	log.Println("Database initialized at:", dbPath)
	return d, nil
}

func (d *Database) Close() error {
	if d.conn != nil {
		return d.conn.Close()
	}
	return nil
}

func (d *Database) Conn() *sql.DB {
	return d.conn
}

func (d *Database) migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			team TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS integrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			tool_type TEXT NOT NULL,
			config_json TEXT,
			enabled INTEGER DEFAULT 1,
			last_synced_at DATETIME
		)`,
		`CREATE TABLE IF NOT EXISTS activities (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			integration_id INTEGER REFERENCES integrations(id),
			source TEXT NOT NULL,
			external_id TEXT,
			title TEXT NOT NULL,
			summary TEXT,
			raw_data TEXT,
			activity_date DATE,
			fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS weekly_reports (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			week_start DATE NOT NULL,
			week_end DATE NOT NULL,
			status TEXT DEFAULT 'draft',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS report_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			report_id INTEGER REFERENCES weekly_reports(id),
			activity_id INTEGER REFERENCES activities(id),
			section TEXT NOT NULL,
			category TEXT,
			work_type TEXT DEFAULT 'si',
			content TEXT NOT NULL,
			sort_order INTEGER,
			is_selected INTEGER DEFAULT 1
		)`,
		`CREATE TABLE IF NOT EXISTS excel_templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			name TEXT,
			file_path TEXT,
			structure_json TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS project_categories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			name TEXT NOT NULL,
			sort_order INTEGER DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS clients (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			name TEXT NOT NULL,
			status TEXT DEFAULT 'existing',
			owner_name TEXT,
			contact_email TEXT,
			notes TEXT,
			active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, name)
		)`,
		`CREATE TABLE IF NOT EXISTS team_members (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			name TEXT NOT NULL,
			position TEXT,
			email TEXT,
			role TEXT,
			employment_type TEXT,
			active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS projects (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			team_type TEXT DEFAULT 'si',
			client_id INTEGER REFERENCES clients(id),
			name TEXT NOT NULL,
			client_name TEXT,
			status TEXT NOT NULL,
			description TEXT,
			start_date DATE,
			end_date DATE,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(user_id, status, active)`,
		`CREATE TABLE IF NOT EXISTS member_assignments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			team_member_id INTEGER REFERENCES team_members(id),
			project_id INTEGER REFERENCES projects(id),
			allocation_percent REAL NOT NULL,
			start_date DATE NOT NULL,
			end_date DATE,
			work_mode TEXT,
			notes TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS team_type_configs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			team_type TEXT NOT NULL,
			config_json TEXT,
			UNIQUE(user_id, team_type)
		)`,
		`CREATE TABLE IF NOT EXISTS attendance_records (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			team_member_id INTEGER REFERENCES team_members(id),
			record_date DATE NOT NULL,
			type TEXT NOT NULL,
			check_in_time TEXT,
			check_out_time TEXT,
			notes TEXT,
			integration_source TEXT,
			external_id TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_attendance_member_date
			ON attendance_records(team_member_id, record_date)`,
		`CREATE INDEX IF NOT EXISTS idx_attendance_external
			ON attendance_records(integration_source, external_id) WHERE external_id IS NOT NULL AND external_id != ''`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_source_external
			ON activities(source, external_id) WHERE external_id IS NOT NULL AND external_id != ''`,
		`CREATE INDEX IF NOT EXISTS idx_member_assignments_member_period
			ON member_assignments(team_member_id, start_date, end_date)`,
		`CREATE INDEX IF NOT EXISTS idx_member_assignments_project_period
			ON member_assignments(project_id, start_date, end_date)`,
		// SI Weekly Reporting tables (si_project_details and si_project_members migrated to projects/member_assignments)
		`CREATE TABLE IF NOT EXISTS si_weekly_reports (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			project_id INTEGER REFERENCES projects(id),
			week_start DATE NOT NULL,
			week_end DATE NOT NULL,
			this_week_progress TEXT,
			next_week_plan TEXT,
			risks TEXT,
			notes TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, project_id, week_start)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_si_weekly_reports_project_week ON si_weekly_reports(project_id, week_start)`,
		// Common Code Management tables
		`CREATE TABLE IF NOT EXISTS code_groups (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			group_code TEXT NOT NULL,
			group_name TEXT NOT NULL,
			description TEXT,
			sort_order INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, group_code)
		)`,
		`CREATE TABLE IF NOT EXISTS code_values (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			group_code TEXT NOT NULL,
			code_value TEXT NOT NULL,
			code_label TEXT NOT NULL,
			description TEXT,
			sort_order INTEGER DEFAULT 0,
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, group_code, code_value)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_code_values_group ON code_values(user_id, group_code)`,
	}

	for _, m := range migrations {
		if _, err := d.conn.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w\nSQL: %s", err, m)
		}
	}

	if err := d.ensureColumnExists("report_items", "work_type", "ALTER TABLE report_items ADD COLUMN work_type TEXT DEFAULT 'si'"); err != nil {
		return err
	}
	if err := d.ensureColumnExists("team_members", "position", "ALTER TABLE team_members ADD COLUMN position TEXT"); err != nil {
		return err
	}
	if err := d.ensureColumnExists("team_members", "email", "ALTER TABLE team_members ADD COLUMN email TEXT"); err != nil {
		return err
	}
	if err := d.ensureColumnExists("projects", "client_id", "ALTER TABLE projects ADD COLUMN client_id INTEGER"); err != nil {
		return err
	}
	// Create index after column is guaranteed to exist
	if _, err := d.conn.Exec("CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id)"); err != nil {
		return fmt.Errorf("failed to create index idx_projects_client: %w", err)
	}
	if err := d.ensureColumnExists("report_items", "period", "ALTER TABLE report_items ADD COLUMN period TEXT DEFAULT 'this_week'"); err != nil {
		return err
	}
	if err := d.ensureColumnExists("team_members", "hire_date", "ALTER TABLE team_members ADD COLUMN hire_date DATE"); err != nil {
		return err
	}
	if err := d.ensureColumnExists("team_members", "resign_date", "ALTER TABLE team_members ADD COLUMN resign_date DATE"); err != nil {
		return err
	}
	// Migrate existing next_week section items to period='next_week'
	if _, err := d.conn.Exec("UPDATE report_items SET period = 'next_week' WHERE section = 'next_week' AND period = 'this_week'"); err != nil {
		return fmt.Errorf("failed to migrate next_week period: %w", err)
	}

	// Migrate si_project_details.current_phase to projects.status if status is empty or old format
	if err := d.migrateProjectStatusFromCurrentPhase(); err != nil {
		return fmt.Errorf("failed to migrate project status from current_phase: %w", err)
	}

	// Add role column to member_assignments for si_project_members integration
	if err := d.ensureColumnExists("member_assignments", "role", "ALTER TABLE member_assignments ADD COLUMN role TEXT"); err != nil {
		return err
	}

	// Migrate si_project_members to member_assignments
	if err := d.migrateSIProjectMembersToAssignments(); err != nil {
		return fmt.Errorf("failed to migrate si_project_members to member_assignments: %w", err)
	}

	// Migrate si_project_details to projects table
	if err := d.migrateSIProjectDetailsToProjects(); err != nil {
		return fmt.Errorf("failed to migrate si_project_details to projects: %w", err)
	}

	return nil
}

func (d *Database) migrateProjectStatusFromCurrentPhase() error {
	// Check if si_project_details table exists
	var tableExists int
	err := d.conn.QueryRow("SELECT 1 FROM sqlite_master WHERE type='table' AND name='si_project_details'").Scan(&tableExists)
	if err == sql.ErrNoRows {
		return nil // Table doesn't exist yet, nothing to migrate
	}
	if err != nil {
		return fmt.Errorf("failed to check si_project_details existence: %w", err)
	}

	// Check if current_phase column exists
	var colExists int
	err = d.conn.QueryRow(`
		SELECT 1 FROM pragma_table_info('si_project_details') WHERE name='current_phase'
	`).Scan(&colExists)
	if err == sql.ErrNoRows {
		return nil // Column doesn't exist, nothing to migrate
	}
	if err != nil {
		return fmt.Errorf("failed to check current_phase column: %w", err)
	}

	// Migrate: copy current_phase to projects.status where projects.status is empty or old value
	log.Println("[Migration] Migrating si_project_details.current_phase to projects.status...")
	result, err := d.conn.Exec(`
		UPDATE projects 
		SET status = COALESCE(
			(SELECT current_phase FROM si_project_details WHERE si_project_details.project_id = projects.id),
			status
		)
		WHERE status IS NULL OR status = '' OR status IN ('preparing', 'poc_proposal', 'in_development', 'in_operation', 'closed')
	`)
	if err != nil {
		return fmt.Errorf("failed to migrate current_phase to status: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows > 0 {
		log.Printf("[Migration] Updated %d projects with status from current_phase", rows)
	}

	// For any remaining projects with old status values, set to default
	result, err = d.conn.Exec(`
		UPDATE projects 
		SET status = '제안/POC'
		WHERE status IS NULL OR status = '' OR status IN ('preparing', 'poc_proposal', 'in_development', 'in_operation', 'closed')
	`)
	if err != nil {
		return fmt.Errorf("failed to set default status: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows > 0 {
		log.Printf("[Migration] Set default status for %d projects", rows)
	}

	// Mark current_phase column for future removal by renaming it
	// (SQLite doesn't support DROP COLUMN directly, we'll ignore it in code)
	log.Println("[Migration] Migration complete. current_phase column will be ignored.")
	return nil
}

func (d *Database) migrateSIProjectMembersToAssignments() error {
	// Check if si_project_members table exists
	var tableExists int
	err := d.conn.QueryRow("SELECT 1 FROM sqlite_master WHERE type='table' AND name='si_project_members'").Scan(&tableExists)
	if err == sql.ErrNoRows {
		return nil // Table doesn't exist, nothing to migrate
	}
	if err != nil {
		return fmt.Errorf("failed to check si_project_members existence: %w", err)
	}

	// Check if already migrated (check for any existing data in member_assignments with role)
	var count int
	err = d.conn.QueryRow("SELECT COUNT(*) FROM member_assignments WHERE role IS NOT NULL AND role != ''").Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to check member_assignments role count: %w", err)
	}
	if count > 0 {
		log.Println("[Migration] member_assignments already has role data, skipping si_project_members migration")
		return nil
	}

	// Migrate si_project_members to member_assignments
	log.Println("[Migration] Migrating si_project_members to member_assignments...")
	rows, err := d.conn.Query(`
		SELECT user_id, project_id, team_member_id, role, allocation_mm, start_date, end_date
		FROM si_project_members
	`)
	if err != nil {
		return fmt.Errorf("failed to query si_project_members: %w", err)
	}
	defer rows.Close()

	migrated := 0
	for rows.Next() {
		var userID, projectID, teamMemberID int64
		var role string
		var allocationMM float64
		var startDate, endDate sql.NullString

		if err := rows.Scan(&userID, &projectID, &teamMemberID, &role, &allocationMM, &startDate, &endDate); err != nil {
			log.Printf("[Migration] Failed to scan si_project_members row: %v", err)
			continue
		}

		// Check if this assignment already exists in member_assignments
		var existingID int64
		err := d.conn.QueryRow(
			"SELECT id FROM member_assignments WHERE user_id=? AND project_id=? AND team_member_id=?",
			userID, projectID, teamMemberID,
		).Scan(&existingID)

		if err == nil {
			// Update existing assignment with role and convert allocation_mm to allocation_percent
			_, err = d.conn.Exec(
				"UPDATE member_assignments SET role=?, allocation_percent=?, start_date=?, end_date=? WHERE id=?",
				role, int64(allocationMM*100), startDate.String, endDate.String, existingID,
			)
			if err != nil {
				log.Printf("[Migration] Failed to update member_assignments %d: %v", existingID, err)
				continue
			}
		} else {
			// Insert new assignment
			_, err = d.conn.Exec(
				`INSERT INTO member_assignments (user_id, team_member_id, project_id, allocation_percent, start_date, end_date, role, work_mode)
				 VALUES (?, ?, ?, ?, ?, ?, ?, '')`,
				userID, teamMemberID, projectID, int64(allocationMM*100), startDate.String, endDate.String, role,
			)
			if err != nil {
				log.Printf("[Migration] Failed to insert member_assignments: %v", err)
				continue
			}
		}
		migrated++
	}

	if err := rows.Err(); err != nil {
		log.Printf("[Migration] Row iteration error: %v", err)
	}

	log.Printf("[Migration] Migrated %d si_project_members to member_assignments", migrated)
	return nil
}

func (d *Database) migrateSIProjectDetailsToProjects() error {
	// Check if si_project_details table exists
	var tableExists int
	err := d.conn.QueryRow("SELECT 1 FROM sqlite_master WHERE type='table' AND name='si_project_details'").Scan(&tableExists)
	if err == sql.ErrNoRows {
		return nil // Table doesn't exist, nothing to migrate
	}
	if err != nil {
		return fmt.Errorf("failed to check si_project_details existence: %w", err)
	}

	// Add columns to projects table if they don't exist
	columns := []struct {
		name string
		sql  string
	}{
		{"project_type", "ALTER TABLE projects ADD COLUMN project_type TEXT"},
		{"pm_name", "ALTER TABLE projects ADD COLUMN pm_name TEXT"},
		{"total_mm", "ALTER TABLE projects ADD COLUMN total_mm REAL DEFAULT 0"},
		{"progress_rate", "ALTER TABLE projects ADD COLUMN progress_rate INTEGER DEFAULT 0"},
	}

	for _, col := range columns {
		if err := d.ensureColumnExists("projects", col.name, col.sql); err != nil {
			return fmt.Errorf("failed to add column %s: %w", col.name, err)
		}
	}

	// Migrate data from si_project_details to projects
	log.Println("[Migration] Migrating si_project_details to projects...")
	result, err := d.conn.Exec(`
		UPDATE projects 
		SET project_type = COALESCE(
			(SELECT project_type FROM si_project_details WHERE si_project_details.project_id = projects.id),
			project_type
		),
		pm_name = COALESCE(
			(SELECT pm_name FROM si_project_details WHERE si_project_details.project_id = projects.id),
			pm_name
		),
		total_mm = COALESCE(
			(SELECT total_mm FROM si_project_details WHERE si_project_details.project_id = projects.id),
			total_mm
		),
		progress_rate = COALESCE(
			(SELECT progress_rate FROM si_project_details WHERE si_project_details.project_id = projects.id),
			progress_rate
		)
		WHERE EXISTS (SELECT 1 FROM si_project_details WHERE si_project_details.project_id = projects.id)
	`)
	if err != nil {
		return fmt.Errorf("failed to migrate si_project_details to projects: %w", err)
	}

	if rows, _ := result.RowsAffected(); rows > 0 {
		log.Printf("[Migration] Migrated %d si_project_details to projects", rows)
	}

	// Mark si_project_details for removal (SQLite doesn't support DROP COLUMN, we'll ignore the table)
	log.Println("[Migration] Migration complete. si_project_details table will be ignored.")
	return nil
}

func (d *Database) ensureColumnExists(tableName, columnName, alterSQL string) error {
	rows, err := d.conn.Query(fmt.Sprintf("PRAGMA table_info(%s)", tableName))
	if err != nil {
		return fmt.Errorf("failed to inspect table %s: %w", tableName, err)
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name string
		var colType string
		var notNull int
		var dfltValue interface{}
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return fmt.Errorf("failed to scan pragma table_info(%s): %w", tableName, err)
		}
		if name == columnName {
			return nil
		}
	}

	if _, err := d.conn.Exec(alterSQL); err != nil {
		return fmt.Errorf("failed to add column %s.%s: %w", tableName, columnName, err)
	}
	return nil
}
