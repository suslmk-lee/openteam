package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
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

	originalExtractor := ingestKnowledgeExtractor
	ingestKnowledgeExtractor = func(_ *App, src *ingestSource) (*ingestStructuredKnowledge, error) {
		if src == nil {
			return nil, fmt.Errorf("ingest source is nil")
		}

		title := strings.TrimSpace(ingestSourceTitle(src))
		if title == "" {
			title = "Source"
		}

		concept := "Documentation"
		switch strings.TrimSpace(src.SourceType) {
		case "url":
			concept = "Web Source"
		case "file":
			concept = "File Source"
		case "text":
			concept = "Text Note"
		}

		return &ingestStructuredKnowledge{
			Entities: []string{title},
			Concepts: []string{concept},
			Summary:  fmt.Sprintf("%s knowledge summary.", title),
			Claims:   []string{fmt.Sprintf("Source type is %s.", strings.TrimSpace(src.SourceType))},
		}, nil
	}
	t.Cleanup(func() {
		ingestKnowledgeExtractor = originalExtractor
	})

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

func TestRetrieveVaultContextEmptyQueryReturnsNoReferences(t *testing.T) {
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
}

func TestRetrieveVaultContextFallsBackWhenNoKeywordMatch(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(
		t,
		app.vaultRoot,
		"knowledge-base/wiki/sources/weekly-report.md",
		"---\ntitle: 'Weekly Report'\n---\n\n# Weekly Report\n\n어제 작업 내역 정리 문서입니다.\n",
	)

	count, err := app.RefreshVault()
	if err != nil {
		t.Fatalf("RefreshVault failed: %v", err)
	}
	if count < 3 {
		t.Fatalf("expected vault refresh to index knowledge files and folders, got %d items", count)
	}

	noResultRefs, err := app.RetrieveVaultContext("한글로 알려줘", 3)
	if err != nil {
		t.Fatalf("no-result query failed: %v", err)
	}
	if len(noResultRefs) == 0 {
		t.Fatalf("expected fallback references for natural-language follow-up query, got 0")
	}
	if noResultRefs[0].Path == "" || noResultRefs[0].Content == "" {
		t.Fatalf("expected populated fallback reference, got %+v", noResultRefs[0])
	}
}

func TestUpdateTeamProfileRefreshesVaultCacheForNewRoot(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(t, app.vaultRoot, "legacy/old-notes.md", "Legacy vault file.\n")
	if _, err := app.RefreshVault(); err != nil {
		t.Fatalf("initial RefreshVault failed: %v", err)
	}

	newVaultRoot := filepath.Join(app.dataDir, "vault-new")
	if err := os.MkdirAll(newVaultRoot, 0o755); err != nil {
		t.Fatalf("failed to create new vault root: %v", err)
	}
	writeVaultTestFile(
		t,
		newVaultRoot,
		"knowledge-base/wiki/sources/newdoc.md",
		"---\ntitle: 'New Doc'\n---\n\n# New Doc\n\nThis file should be retrievable after profile update.\n",
	)

	err := app.UpdateTeamProfile(db.TeamProfile{
		TeamType:    "personal",
		TeamName:    "Test Team",
		UserName:    "Tester",
		SetupDone:   true,
		VaultRoot:   newVaultRoot,
		MemberCount: 1,
	})
	if err != nil {
		t.Fatalf("UpdateTeamProfile failed: %v", err)
	}

	refs, err := app.RetrieveVaultContext("newdoc", 3)
	if err != nil {
		t.Fatalf("RetrieveVaultContext failed: %v", err)
	}
	if len(refs) == 0 {
		t.Fatalf("expected references from new vault root after profile update, got 0")
	}
	foundNewRootDoc := false
	for _, ref := range refs {
		if strings.Contains(ref.Path, "newdoc.md") {
			foundNewRootDoc = true
			break
		}
	}
	if !foundNewRootDoc {
		t.Fatalf("expected to include newdoc.md from updated vault root, got refs: %+v", refs)
	}
}
