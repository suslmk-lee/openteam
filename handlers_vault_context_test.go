package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"openreport/internal/db"
)

func setupVaultRetrievalTest(t *testing.T) *App {
	t.Helper()

	dataDir := t.TempDir()
	database, err := db.New(filepath.Join(dataDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to initialize test db: %v", err)
	}
	t.Cleanup(func() {
		_ = database.Close()
	})

	vaultRoot := filepath.Join(dataDir, "vault")
	if err := os.MkdirAll(vaultRoot, 0o755); err != nil {
		t.Fatalf("failed to create vault root: %v", err)
	}

	return &App{
		database:  database,
		dataDir:   dataDir,
		vaultRoot: vaultRoot,
	}
}

func writeVaultTestFile(t *testing.T, root, relPath, content string) {
	t.Helper()

	fullPath := filepath.Join(root, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("failed to create parent dir for %s: %v", relPath, err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("failed to write %s: %v", relPath, err)
	}
}

func TestRetrieveVaultContextDefaultLimit(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	for i := 1; i <= 8; i++ {
		relPath := fmt.Sprintf("notes/alpha-%02d.md", i)
		writeVaultTestFile(t, app.vaultRoot, relPath, fmt.Sprintf("Alpha note %d\n\nThis alpha document mentions alpha twice for retrieval testing.\n", i))
	}

	count, err := app.RefreshVault()
	if err != nil {
		t.Fatalf("RefreshVault failed: %v", err)
	}
	if count < 9 {
		t.Fatalf("expected vault refresh to index files and folders, got %d items", count)
	}

	refs, err := app.RetrieveVaultContext("alpha", 0)
	if err != nil {
		t.Fatalf("RetrieveVaultContext failed: %v", err)
	}
	if len(refs) != 7 {
		t.Fatalf("expected default limit of 7, got %d", len(refs))
	}
	for i, ref := range refs {
		if ref.Path == "" || ref.Title == "" || ref.Snippet == "" || ref.Content == "" {
			t.Fatalf("expected populated reference at index %d, got %+v", i, ref)
		}
	}
}

func TestRetrieveVaultContextEmptyAndNoResult(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(t, app.vaultRoot, "misc/general.md", "General vault content without the search term.\n")

	count, err := app.RefreshVault()
	if err != nil {
		t.Fatalf("RefreshVault failed: %v", err)
	}
	if count < 2 {
		t.Fatalf("expected vault refresh to index file and parent folder, got %d items", count)
	}

	emptyRefs, err := app.RetrieveVaultContext("   ", 0)
	if err != nil {
		t.Fatalf("empty query failed: %v", err)
	}
	if len(emptyRefs) != 0 {
		t.Fatalf("expected no references for empty query, got %d", len(emptyRefs))
	}

	noResultRefs, err := app.RetrieveVaultContext("missing-term", 0)
	if err != nil {
		t.Fatalf("no-result query failed: %v", err)
	}
	if len(noResultRefs) != 0 {
		t.Fatalf("expected no references for missing query, got %d", len(noResultRefs))
	}
}
