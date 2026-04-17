package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"openreport/internal/db"
)

const defaultVaultRoot = `D:\Vault`

type App struct {
	ctx       context.Context
	database  *db.Database
	dataDir   string
	vaultRoot string
	report    *ReportService
	team      *TeamService
	external  *ExternalService

	personalCollectMu     sync.RWMutex
	personalCollectStatus db.PersonalAICollectStatus
}

func NewApp() *App {
	app := &App{vaultRoot: defaultVaultRoot}
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

	// Load user-specific vault root (if configured) before initial indexing.
	if user, userErr := a.database.GetOrCreateDefaultUser(); userErr == nil {
		if profile, profileErr := a.database.GetTeamProfile(user.ID); profileErr == nil && profile != nil {
			if root := profile.VaultRoot; root != "" {
				a.vaultRoot = root
			}
		}
	}

	if count, err := a.RefreshVault(); err != nil {
		log.Printf("Warning: failed to refresh vault cache: %v", err)
	} else {
		log.Printf("Vault cache initialized with %d items", count)
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
