package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"openreport/internal/db"
)

type App struct {
	ctx      context.Context
	database *db.Database
	dataDir  string
	report   *ReportService
	team     *TeamService
	external *ExternalService
}

func NewApp() *App {
	app := &App{}
	app.report = NewReportService(app)
	app.team = NewTeamService(app)
	app.external = NewExternalService(app)
	return app
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal("Failed to get home directory:", err)
	}
	a.dataDir = filepath.Join(homeDir, ".openreport")
	if err := os.MkdirAll(a.dataDir, 0755); err != nil {
		log.Fatal("Failed to create data directory:", err)
	}

	dbPath := filepath.Join(a.dataDir, "openreport.db")
	a.database, err = db.New(dbPath)
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	log.Println("OpenReport started. Data dir:", a.dataDir)
}

func (a *App) shutdown(ctx context.Context) {
	if a.database != nil {
		a.database.Close()
	}
	log.Println("OpenReport shutdown.")
}

func (a *App) GetDataDir() string {
	return a.dataDir
}

func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
