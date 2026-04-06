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
		// SI Project Detail tables for weekly reporting
		`CREATE TABLE IF NOT EXISTS si_project_details (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			project_id INTEGER REFERENCES projects(id) UNIQUE,
			project_type TEXT,
			pm_name TEXT,
			total_mm REAL DEFAULT 0,
			current_phase TEXT,
			progress_rate INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
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
		`CREATE TABLE IF NOT EXISTS si_project_members (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id),
			project_id INTEGER REFERENCES projects(id),
			team_member_id INTEGER REFERENCES team_members(id),
			role TEXT,
			allocation_mm REAL DEFAULT 0,
			start_date DATE,
			end_date DATE,
			UNIQUE(user_id, project_id, team_member_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_si_weekly_reports_project_week ON si_weekly_reports(project_id, week_start)`,
		`CREATE INDEX IF NOT EXISTS idx_si_project_members_project ON si_project_members(project_id)`,
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
