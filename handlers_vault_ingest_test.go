package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestIngestKnowledgeSource_EmptyInputFails(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	_, err := app.IngestKnowledgeSource("text", "", "claude", "")
	if err == nil {
		t.Fatal("expected error for empty source")
	}
	if !strings.Contains(err.Error(), "source is empty") {
		t.Fatalf("expected source validation error, got %q", err.Error())
	}
}

func TestIngestKnowledgeSource_WhitespaceSourceTrimmed(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	result, err := app.IngestKnowledgeSource("text", "  hello world  ", "claude", "tester")
	if err != nil {
		t.Fatalf("expected valid ingest, got error: %v", err)
	}

	if result.Source != "hello world" {
		t.Fatalf("expected trimmed source, got %q", result.Source)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}
}

func TestIngest_WritesRawSource(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	result, err := app.IngestKnowledgeSource("text", "  Hello vault ingest.  ", "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}

	rawPath, rawContent := readSingleIngestMarkdownFile(t, app.vaultRoot, "knowledge-base/raw/sources", "hello-vault-ingest")

	if !strings.Contains(rawPath, "knowledge-base/raw/sources/") {
		t.Fatalf("expected raw source path under knowledge-base/raw/sources, got %q", rawPath)
	}
	assertContainsAll(t, rawContent,
		"---",
		"source_type: 'text'",
		"ingested_at: '",
		"model: 'claude'",
		"requested_by: 'tester'",
		"---",
		"Hello vault ingest.",
	)

	item, err := app.database.GetVaultItemByPath(rawPath)
	if err != nil {
		t.Fatalf("expected raw source file in refreshed cache: %v", err)
	}
	if item == nil || item.Type != "file" {
		t.Fatalf("expected refreshed cache entry for raw source, got %+v", item)
	}
}

func TestIngest_CreatesWikiSourcePage(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	sourcePath := filepath.Join(t.TempDir(), "Quarterly Report.txt")
	if err := os.WriteFile(sourcePath, []byte("Quarterly summary.\nSecond line."), 0o644); err != nil {
		t.Fatalf("failed to create source file: %v", err)
	}

	result, err := app.IngestKnowledgeSource("file", sourcePath, "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}

	rawPath, _ := readSingleIngestMarkdownFile(t, app.vaultRoot, "knowledge-base/raw/sources", "quarterly-report")
	wikiPath, wikiContent := readSingleIngestMarkdownFile(t, app.vaultRoot, "knowledge-base/wiki/sources", "quarterly-report")

	if !strings.Contains(wikiPath, "knowledge-base/wiki/sources/") {
		t.Fatalf("expected wiki source path under knowledge-base/wiki/sources, got %q", wikiPath)
	}

	assertContainsAll(t, wikiContent,
		"---",
		"title: 'Quarterly Report'",
		"source_type: 'file'",
		"ingested_at: '",
		"model: 'claude'",
		"requested_by: 'tester'",
		"raw_path: '"+rawPath+"'",
		"source_path: '"+filepath.ToSlash(sourcePath)+"'",
		"---",
		"# Quarterly Report",
		"Raw source: `"+rawPath+"`",
	)

	item, err := app.database.GetVaultItemByPath(wikiPath)
	if err != nil {
		t.Fatalf("expected wiki source page in refreshed cache: %v", err)
	}
	if item == nil || item.Type != "file" {
		t.Fatalf("expected refreshed cache entry for wiki source page, got %+v", item)
	}
}

func TestIngest_UpdatesIndexAndLog(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	result, err := app.IngestKnowledgeSource("text", "Quarterly wiki entry.", "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}

	wikiPath, _ := readSingleIngestMarkdownFile(t, app.vaultRoot, "knowledge-base/wiki/sources", "quarterly-wiki-entry")

	indexContent := readVaultTestFile(t, app.vaultRoot, "knowledge-base/wiki/index.md")
	if !strings.Contains(indexContent, wikiPath) {
		t.Fatalf("expected wiki index to reference %q, got:\n%s", wikiPath, indexContent)
	}
	if !strings.Contains(indexContent, "[Quarterly wiki entry.](/"+wikiPath+")") {
		t.Fatalf("expected wiki index to use readable page title for %q, got:\n%s", wikiPath, indexContent)
	}

	logContent := readVaultTestFile(t, app.vaultRoot, "knowledge-base/wiki/log.md")
	if !strings.Contains(logContent, "ingest") || !strings.Contains(logContent, wikiPath) {
		t.Fatalf("expected wiki log to record ingest for %q, got:\n%s", wikiPath, logContent)
	}

	indexItem, err := app.database.GetVaultItemByPath("knowledge-base/wiki/index.md")
	if err != nil {
		t.Fatalf("expected wiki index in refreshed cache: %v", err)
	}
	if indexItem == nil || indexItem.Type != "file" {
		t.Fatalf("expected refreshed cache entry for wiki index, got %+v", indexItem)
	}

	logItem, err := app.database.GetVaultItemByPath("knowledge-base/wiki/log.md")
	if err != nil {
		t.Fatalf("expected wiki log in refreshed cache: %v", err)
	}
	if logItem == nil || logItem.Type != "file" {
		t.Fatalf("expected refreshed cache entry for wiki log, got %+v", logItem)
	}
}

func TestIngest_CreatesDerivedWikiArtifacts(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	result, err := app.IngestKnowledgeSource(
		"text",
		"Graphify is a knowledge graph tool for AI coding assistants. Hermes Agent uses Graphify for code and docs indexing.",
		"claude",
		"tester",
	)
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}

	entityFiles := listIngestMarkdownFiles(t, app.vaultRoot, "knowledge-base/wiki/entities")
	conceptFiles := listIngestMarkdownFiles(t, app.vaultRoot, "knowledge-base/wiki/concepts")
	synthesisFiles := listIngestMarkdownFiles(t, app.vaultRoot, "knowledge-base/wiki/synthesis")

	if len(entityFiles) == 0 {
		t.Fatal("expected at least one entity page to be created")
	}
	if len(conceptFiles) == 0 {
		t.Fatal("expected at least one concept page to be created")
	}
	if len(synthesisFiles) == 0 {
		t.Fatal("expected at least one synthesis page to be created")
	}

	indexContent := readVaultTestFile(t, app.vaultRoot, wikiIndexPath)
	if !strings.Contains(indexContent, "/knowledge-base/wiki/entities/") {
		t.Fatalf("expected index to include entity pages, got:\n%s", indexContent)
	}
	if !strings.Contains(indexContent, "/knowledge-base/wiki/concepts/") {
		t.Fatalf("expected index to include concept pages, got:\n%s", indexContent)
	}
	if !strings.Contains(indexContent, "/knowledge-base/wiki/synthesis/") {
		t.Fatalf("expected index to include synthesis pages, got:\n%s", indexContent)
	}
}

func TestIngest_UsesStructuredExtractorWhenAvailable(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	originalExtractor := ingestKnowledgeExtractor
	ingestKnowledgeExtractor = func(_ *App, _ *ingestSource) (*ingestStructuredKnowledge, error) {
		return &ingestStructuredKnowledge{
			Entities: []string{"Hermes Agent"},
			Concepts: []string{"Knowledge Graph"},
			Summary:  "Hermes Agent uses a knowledge graph workflow for coding assistance.",
			Claims:   []string{"Hermes Agent integrates graph-based retrieval."},
			Gaps:     []string{"Need benchmark on retrieval precision."},
		}, nil
	}
	defer func() {
		ingestKnowledgeExtractor = originalExtractor
	}()

	result, err := app.IngestKnowledgeSource("text", "input text for extractor", "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}

	entityContent := readVaultTestFile(t, app.vaultRoot, "knowledge-base/wiki/entities/hermes-agent.md")
	assertContainsAll(t, entityContent, "# Hermes Agent")

	conceptContent := readVaultTestFile(t, app.vaultRoot, "knowledge-base/wiki/concepts/knowledge-graph.md")
	assertContainsAll(t, conceptContent,
		"# Knowledge Graph",
		"## Related Entities",
		"[Hermes Agent](/knowledge-base/wiki/entities/hermes-agent.md)",
		"## Related Synthesis",
	)

	synthesisFiles := listIngestMarkdownFiles(t, app.vaultRoot, "knowledge-base/wiki/synthesis")
	if len(synthesisFiles) == 0 {
		t.Fatal("expected synthesis file")
	}
	synthesisContent := readVaultTestFile(t, app.vaultRoot, synthesisFiles[0])
	assertContainsAll(t, synthesisContent,
		"## Summary",
		"Hermes Agent uses a knowledge graph workflow for coding assistance.",
		"## Claims",
		"Hermes Agent integrates graph-based retrieval.",
		"## Gaps",
		"Need benchmark on retrieval precision.",
	)
}

func TestIngest_ResultIncludesArtifactMetadata(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	skillDir := filepath.Join(app.vaultRoot, ".claude", "skills")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatalf("failed to create skill directory: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(skillDir, "ingest.md"),
		[]byte("# Ingest Skill\n\nPrefer concept names that match plugin and workflow terms.\n"),
		0o644,
	); err != nil {
		t.Fatalf("failed to seed ingest skill file: %v", err)
	}

	originalExtractor := ingestKnowledgeExtractor
	ingestKnowledgeExtractor = func(_ *App, _ *ingestSource) (*ingestStructuredKnowledge, error) {
		return &ingestStructuredKnowledge{
			Entities: []string{"AmebaHead"},
			Concepts: []string{"Skills Cleaner"},
			Summary:  "Skills Cleaner provides slash-command based skill inventory workflows.",
			Claims: []string{
				"Supports /profile-skills and /clean-skills command flows.",
			},
		}, nil
	}
	defer func() {
		ingestKnowledgeExtractor = originalExtractor
	}()

	result, err := app.IngestKnowledgeSource(
		"text",
		"skills-cleaner plugin tracks skill usage with /profile-skills and /clean-skills commands.",
		"claude",
		"tester",
	)
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}

	if !result.ExtractorUsed {
		t.Fatalf("expected extractorUsed=true, got false")
	}
	if result.ExtractorWarning != "" {
		t.Fatalf("expected empty extractor warning, got %q", result.ExtractorWarning)
	}
	if result.ElapsedMs <= 0 {
		t.Fatalf("expected elapsedMs > 0, got %d", result.ElapsedMs)
	}
	if result.RawPath == "" {
		t.Fatal("expected rawPath to be populated")
	}
	if result.WikiSourcePath == "" {
		t.Fatal("expected wikiSourcePath to be populated")
	}
	if result.IndexPath != wikiIndexPath {
		t.Fatalf("expected index path %q, got %q", wikiIndexPath, result.IndexPath)
	}
	if result.LogPath != wikiLogPath {
		t.Fatalf("expected log path %q, got %q", wikiLogPath, result.LogPath)
	}
	if len(result.DerivedPaths) == 0 {
		t.Fatal("expected derived paths to be populated")
	}
	if len(result.CreatedPaths) < 4 {
		t.Fatalf("expected created paths to include raw/source/derived/index/log, got %#v", result.CreatedPaths)
	}
	if result.SkillSourceDir == "" {
		t.Fatal("expected skill source directory to be populated")
	}
	if len(result.ProcessLogs) == 0 {
		t.Fatal("expected process logs to be populated")
	}
	foundSkillLog := false
	for _, line := range result.ProcessLogs {
		if strings.Contains(line, "skills loaded") {
			foundSkillLog = true
			break
		}
	}
	if !foundSkillLog {
		t.Fatalf("expected process logs to include skills loaded entry, got %#v", result.ProcessLogs)
	}
}

func TestBuildIngestKnowledgeExtractionPrompt_IncludesSkillGuidance(t *testing.T) {
	src := &ingestSource{
		Title:      "skills-cleaner README",
		SourceType: "url",
		Content:    "Tracks usage with /profile-skills and /clean-skills hooks.",
		SkillHints: []ingestSkillHint{
			{Name: "ingest", Description: "Collect evidence and keep claims grounded in source content."},
			{Name: "query", Description: "Prefer repository-specific terms for concepts and entities."},
		},
	}

	prompt := buildIngestKnowledgeExtractionPrompt(src)
	assertContainsAll(t, prompt,
		"Skill Guidance (local Claude skills):",
		"- ingest: Collect evidence and keep claims grounded in source content.",
		"- query: Prefer repository-specific terms for concepts and entities.",
	)
}

func TestIngest_WikiSourcePageIncludesSummaryKeyPointsAndCommands(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	originalExtractor := ingestKnowledgeExtractor
	ingestKnowledgeExtractor = func(_ *App, _ *ingestSource) (*ingestStructuredKnowledge, error) {
		return &ingestStructuredKnowledge{
			Entities: []string{"Skills Cleaner"},
			Concepts: []string{"Skill Cleanup Workflow"},
			Summary:  "Skills Cleaner summarizes skill usage and duplicate cleanup opportunities.",
			Claims: []string{
				"Tracks skill calls from PostToolUse and UserPromptSubmit hooks.",
				"Shows duplicate cleanup candidates above 90 percent similarity.",
			},
		}, nil
	}
	defer func() {
		ingestKnowledgeExtractor = originalExtractor
	}()

	sourcePath := filepath.Join(t.TempDir(), "skills-cleaner.md")
	sourceContent := strings.Join([]string{
		"# Skills Cleaner",
		"",
		"Commands:",
		"- /profile-skills",
		"- /clean-skills",
		"",
		"Tracks tool usage events for analysis.",
	}, "\n")
	if err := os.WriteFile(sourcePath, []byte(sourceContent), 0o644); err != nil {
		t.Fatalf("failed to write source file: %v", err)
	}

	result, err := app.IngestKnowledgeSource("file", sourcePath, "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}

	_, wikiContent := readSingleIngestMarkdownFile(t, app.vaultRoot, "knowledge-base/wiki/sources", "skills-cleaner")
	assertContainsAll(t, wikiContent,
		"## Summary",
		"Skills Cleaner summarizes skill usage and duplicate cleanup opportunities.",
		"## Key Points",
		"Tracks skill calls from PostToolUse and UserPromptSubmit hooks.",
		"## Commands",
		"`/profile-skills`",
		"`/clean-skills`",
	)
}

func TestIngest_FailsWhenStructuredExtractionFails(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	originalExtractor := ingestKnowledgeExtractor
	ingestKnowledgeExtractor = func(_ *App, _ *ingestSource) (*ingestStructuredKnowledge, error) {
		return nil, fmt.Errorf("extractor unavailable")
	}
	defer func() {
		ingestKnowledgeExtractor = originalExtractor
	}()

	result, err := app.IngestKnowledgeSource("text", "구조화 추출 실패 케이스", "claude", "tester")
	_ = result
	if err == nil {
		t.Fatal("expected ingest failure when structured extraction fails")
	}
	if !strings.Contains(err.Error(), "structured knowledge extraction failed") {
		t.Fatalf("expected structured extraction failure error, got %q", err.Error())
	}
}

func TestIngest_FailsWhenStructuredExtractionMissingEntityOrConcept(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	originalExtractor := ingestKnowledgeExtractor
	ingestKnowledgeExtractor = func(_ *App, _ *ingestSource) (*ingestStructuredKnowledge, error) {
		return &ingestStructuredKnowledge{
			Summary: "요약은 있지만 엔티티/컨셉이 없습니다.",
		}, nil
	}
	defer func() {
		ingestKnowledgeExtractor = originalExtractor
	}()

	_, err := app.IngestKnowledgeSource("text", "LLM 위키 필수 링크 검증", "claude", "tester")
	if err == nil {
		t.Fatal("expected ingest failure when structured extraction lacks entity/concept")
	}
	if !strings.Contains(err.Error(), "must include at least one entity and one concept") {
		t.Fatalf("unexpected error: %q", err.Error())
	}
}

func TestIngest_UpdatesIndexAndLog_RebuildsCatalogRowWhenMalformedRowExists(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	expectedWikiPath := fmt.Sprintf("knowledge-base/wiki/sources/%s-%s.md",
		time.Now().Format("2006-01-02"),
		sanitizeIngestSlug("Quarterly wiki entry."),
	)
	writeVaultTestFile(t, app.vaultRoot, wikiIndexPath, "# Wiki Index\n\n- [Quarterly wiki entry.](/"+expectedWikiPath+") extra\n")

	result, err := app.IngestKnowledgeSource("text", "Quarterly wiki entry.", "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}

	wikiPath, _ := readSingleIngestMarkdownFile(t, app.vaultRoot, "knowledge-base/wiki/sources", "quarterly-wiki-entry")
	indexContent := readVaultTestFile(t, app.vaultRoot, wikiIndexPath)
	if !strings.Contains(indexContent, "[Quarterly wiki entry.](/"+wikiPath+")") {
		t.Fatalf("expected rebuilt wiki index to include link for %q, got:\n%s", wikiPath, indexContent)
	}
	if !strings.Contains(indexContent, "## Sources") {
		t.Fatalf("expected catalog section heading in index, got:\n%s", indexContent)
	}
}

func TestIngest_LintLiteFlagsBrokenLinks(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	result, err := app.IngestKnowledgeSource("text", "Broken link [missing](knowledge-base/wiki/missing-page.md)", "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed_with_warnings status, got %q", result.Status)
	}
	assertWarningContains(t, result.Warnings, "broken link knowledge-base/wiki/missing-page.md")
}

func TestIngest_LintLiteWarnsOnMissingFrontmatterAndWikiArtifacts(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(t, app.vaultRoot, "notes/bare.md", "# Bare note\n\nNo frontmatter here.\n")

	warnings, err := app.runIngestLintLite([]string{"notes/bare.md"}, "", "")
	if err != nil {
		t.Fatalf("runIngestLintLite returned error: %v", err)
	}

	assertWarningContains(t, warnings, "notes/bare.md: missing frontmatter")
	assertWarningContains(t, warnings, "missing wiki index: knowledge-base/wiki/index.md")
	assertWarningContains(t, warnings, "missing wiki log: knowledge-base/wiki/log.md")
}

func TestIngest_LintLiteSkipsBrokenLinkChecksForRawSources(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(
		t,
		app.vaultRoot,
		"knowledge-base/raw/sources/sample.md",
		"---\nsource_type: 'url'\ningested_at: '2026-04-15T00:00:00Z'\nmodel: 'claude'\nrequested_by: 'tester'\n---\n\n[LICENSE](LICENSE)\n",
	)

	warnings, err := app.runIngestLintLite([]string{"knowledge-base/raw/sources/sample.md"}, "", "")
	if err != nil {
		t.Fatalf("runIngestLintLite returned error: %v", err)
	}
	for _, warning := range warnings {
		if strings.Contains(warning, "broken link") {
			t.Fatalf("expected raw source broken link checks to be skipped, got warnings %#v", warnings)
		}
	}
}

func TestIngest_LintLiteWarnsOnMissingIndexEntryAndLogMarker(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(t, app.vaultRoot, wikiIndexPath, "# Wiki Index\n")
	writeVaultTestFile(t, app.vaultRoot, wikiLogPath, "# Wiki Log\n")
	writeVaultTestFile(t, app.vaultRoot, "knowledge-base/wiki/sources/example.md", "---\ntitle: 'Example'\n---\n\n# Example\n")

	warnings, err := app.runIngestLintLite(
		[]string{"knowledge-base/wiki/sources/example.md", wikiIndexPath, wikiLogPath},
		"- [Example](/knowledge-base/wiki/sources/example.md)",
		"ingest knowledge-base/wiki/sources/example.md",
	)
	if err != nil {
		t.Fatalf("runIngestLintLite returned error: %v", err)
	}

	assertWarningContains(t, warnings, "missing wiki index entry - [Example](/knowledge-base/wiki/sources/example.md)")
	assertWarningContains(t, warnings, "missing wiki log marker ingest knowledge-base/wiki/sources/example.md")
}

func TestIngest_LintLiteWarnsOnMalformedIndexEntry(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(t, app.vaultRoot, wikiIndexPath, "# Wiki Index\n\n- [Wrong Label](/knowledge-base/wiki/sources/example.md)\n")
	writeVaultTestFile(t, app.vaultRoot, wikiLogPath, "# Wiki Log\n\ningest knowledge-base/wiki/sources/example.md\n")
	writeVaultTestFile(t, app.vaultRoot, "knowledge-base/wiki/sources/example.md", "---\ntitle: 'Example'\n---\n\n# Example\n")

	warnings, err := app.runIngestLintLite(
		[]string{"knowledge-base/wiki/sources/example.md", wikiIndexPath, wikiLogPath},
		"- [Example](/knowledge-base/wiki/sources/example.md)",
		"ingest knowledge-base/wiki/sources/example.md",
	)
	if err != nil {
		t.Fatalf("runIngestLintLite returned error: %v", err)
	}

	assertWarningContains(t, warnings, "missing wiki index entry - [Example](/knowledge-base/wiki/sources/example.md)")
}

func TestIngest_LintLiteWarnsOnIndexEntryWithExtraSuffix(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(t, app.vaultRoot, wikiIndexPath, "# Wiki Index\n\n- [Example](/knowledge-base/wiki/sources/example.md) extra\n")
	writeVaultTestFile(t, app.vaultRoot, wikiLogPath, "# Wiki Log\n\ningest knowledge-base/wiki/sources/example.md\n")
	writeVaultTestFile(t, app.vaultRoot, "knowledge-base/wiki/sources/example.md", "---\ntitle: 'Example'\n---\n\n# Example\n")

	warnings, err := app.runIngestLintLite(
		[]string{"knowledge-base/wiki/sources/example.md", wikiIndexPath, wikiLogPath},
		"- [Example](/knowledge-base/wiki/sources/example.md)",
		"ingest knowledge-base/wiki/sources/example.md",
	)
	if err != nil {
		t.Fatalf("runIngestLintLite returned error: %v", err)
	}

	assertWarningContains(t, warnings, "missing wiki index entry - [Example](/knowledge-base/wiki/sources/example.md)")
}

func TestRunKnowledgeBaseLint_ReturnsWarningsForBrokenLinks(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(
		t,
		app.vaultRoot,
		"knowledge-base/wiki/sources/example.md",
		"---\ntitle: 'Example'\n---\n\n# Example\n\nBroken [link](knowledge-base/wiki/missing.md)\n",
	)

	result, err := app.RunKnowledgeBaseLint()
	if err != nil {
		t.Fatalf("RunKnowledgeBaseLint returned error: %v", err)
	}
	if result.SourceType != "lint" {
		t.Fatalf("expected sourceType lint, got %q", result.SourceType)
	}
	if result.Source != "knowledge-base/wiki" {
		t.Fatalf("expected source knowledge-base/wiki, got %q", result.Source)
	}
	if result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed_with_warnings, got %q", result.Status)
	}
	assertWarningContains(t, result.Warnings, "broken link knowledge-base/wiki/missing.md")
}

func TestRunKnowledgeBaseLint_AdvancedWarnings(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(t, app.vaultRoot, wikiIndexPath, "# Wiki Index\n")
	writeVaultTestFile(t, app.vaultRoot, wikiLogPath, "# Wiki Log\n")
	writeVaultTestFile(
		t,
		app.vaultRoot,
		"knowledge-base/wiki/concepts/stale-contradiction.md",
		"---\ntitle: 'Stale'\nupdated_at: '2024-01-01T00:00:00Z'\n---\n\n# Stale\n\nGraphify is awesome.\nGraphify is not awesome.\n",
	)

	result, err := app.RunKnowledgeBaseLint()
	if err != nil {
		t.Fatalf("RunKnowledgeBaseLint returned error: %v", err)
	}
	if result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed_with_warnings, got %q", result.Status)
	}
	assertWarningContains(t, result.Warnings, "stale page (updated_at=2024-01-01T00:00:00Z)")
	assertWarningContains(t, result.Warnings, "orphan page (no inbound links except index)")
	assertWarningContains(t, result.Warnings, "possible contradiction on subject")
}

func TestSaveKnowledgeQuery_WritesQueryPageAndIndexes(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	writeVaultTestFile(t, app.vaultRoot, "knowledge-base/wiki/sources/sample.md", "---\ntitle: 'Sample Source'\n---\n\n# Sample Source\n")

	result, err := app.SaveKnowledgeQuery(
		"What is Graphify?",
		"Graphify builds a knowledge graph for retrieval.",
		"claude",
		"tester",
		[]string{"knowledge-base/wiki/sources/sample.md"},
	)
	if err != nil {
		t.Fatalf("SaveKnowledgeQuery returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}
	if result.SourceType != "query" {
		t.Fatalf("expected source type query, got %q", result.SourceType)
	}

	queryPath, queryContent := readSingleIngestMarkdownFile(t, app.vaultRoot, "knowledge-base/wiki/queries", "what-is-graphify")
	assertContainsAll(t, queryContent,
		"type: 'query'",
		"## Query",
		"What is Graphify?",
		"## Answer",
		"Graphify builds a knowledge graph for retrieval.",
		"## References",
		"[Sample Source](/knowledge-base/wiki/sources/sample.md)",
	)

	indexContent := readVaultTestFile(t, app.vaultRoot, wikiIndexPath)
	if !strings.Contains(indexContent, "/"+queryPath) {
		t.Fatalf("expected wiki index to include query path %q, got:\n%s", queryPath, indexContent)
	}

	logContent := readVaultTestFile(t, app.vaultRoot, wikiLogPath)
	if !strings.Contains(logContent, "query | "+queryPath) {
		t.Fatalf("expected wiki log to include query entry for %q, got:\n%s", queryPath, logContent)
	}
}

func TestIngestKnowledgeBatch_ContinuesOnPerItemFailure(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	results, err := app.IngestKnowledgeBatch("text", []string{"first text", "   ", "second text"}, "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeBatch returned error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for _, result := range results {
		if result.Status != "completed" && result.Status != "completed_with_warnings" {
			t.Fatalf("expected completed status, got %q", result.Status)
		}
	}
}

func TestIngestKnowledgeBatch_ReportsFailuresPerItem(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	results, err := app.IngestKnowledgeBatch("url", []string{"not-a-url", "https://example.invalid/path"}, "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeBatch returned error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for _, result := range results {
		if result.Status != "failed" {
			t.Fatalf("expected failed status, got %q", result.Status)
		}
		if len(result.Warnings) == 0 {
			t.Fatalf("expected failure warning for source %q", result.Source)
		}
	}
}

func TestIngestKnowledgeSource_InvalidSourceTypeFails(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	_, err := app.IngestKnowledgeSource("email", "hello", "claude", "tester")
	if err == nil {
		t.Fatal("expected error for invalid source type")
	}
	if !strings.Contains(err.Error(), "invalid sourceType") {
		t.Fatalf("expected sourceType validation error, got %q", err.Error())
	}
}

func TestIngestKnowledgeSource_InvalidModelFails(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	_, err := app.IngestKnowledgeSource("text", "hello", "gemini", "tester")
	if err == nil {
		t.Fatal("expected error for invalid model")
	}
	if !strings.Contains(err.Error(), "invalid model") {
		t.Fatalf("expected model validation error, got %q", err.Error())
	}
}

func TestIngestKnowledgeSource_EmptyRequestedByFails(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	_, err := app.IngestKnowledgeSource("text", "hello", "claude", "   ")
	if err == nil {
		t.Fatal("expected error for empty requestedBy")
	}
	if !strings.Contains(err.Error(), "requestedBy is required") {
		t.Fatalf("expected requestedBy validation error, got %q", err.Error())
	}
}

func TestAcquireSource_TextUsesInput(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	raw := "  hello vault ingest  \n"

	src, err := app.acquireIngestSource("text", raw)
	if err != nil {
		t.Fatalf("acquireIngestSource returned error: %v", err)
	}

	if src.SourceType != "text" {
		t.Fatalf("expected source type text, got %q", src.SourceType)
	}
	if src.Content != raw {
		t.Fatalf("expected exact raw content %q, got %q", raw, src.Content)
	}
	if src.SourcePath != "" {
		t.Fatalf("expected empty source path for text, got %q", src.SourcePath)
	}
	if src.SourceURL != "" {
		t.Fatalf("expected empty source url for text, got %q", src.SourceURL)
	}
}

func TestAcquireSource_FileReadsDisk(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	filePath := filepath.Join(t.TempDir(), "notes.txt")
	const fileContent = "Line one.\nLine two."
	if err := os.WriteFile(filePath, []byte(fileContent), 0o644); err != nil {
		t.Fatalf("failed to create source file: %v", err)
	}

	src, err := app.acquireIngestSource("file", filePath)
	if err != nil {
		t.Fatalf("acquireIngestSource returned error: %v", err)
	}

	if src.SourceType != "file" {
		t.Fatalf("expected source type file, got %q", src.SourceType)
	}
	if src.SourcePath != filePath {
		t.Fatalf("expected source path %q, got %q", filePath, src.SourcePath)
	}
	if src.Content != fileContent {
		t.Fatalf("expected file content %q, got %q", fileContent, src.Content)
	}
}

func TestAcquireSource_FileResolvesVaultRelativePath(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	const relPath = "notes/quarterly-report.txt"
	const fileContent = "Quarterly summary.\nSecond line."
	writeVaultTestFile(t, app.vaultRoot, relPath, fileContent)

	src, err := app.acquireIngestSource("file", relPath)
	if err != nil {
		t.Fatalf("acquireIngestSource returned error: %v", err)
	}

	if src.SourceType != "file" {
		t.Fatalf("expected source type file, got %q", src.SourceType)
	}
	if src.SourcePath != relPath {
		t.Fatalf("expected vault-relative source path %q, got %q", relPath, src.SourcePath)
	}
	if src.Content != fileContent {
		t.Fatalf("expected file content %q, got %q", fileContent, src.Content)
	}
}

func TestAcquireSource_FileRejectsVaultEscape(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	outsidePath := filepath.Join(filepath.Dir(app.vaultRoot), "outside.txt")
	if err := os.WriteFile(outsidePath, []byte("outside"), 0o644); err != nil {
		t.Fatalf("failed to create outside file: %v", err)
	}

	_, err := app.acquireIngestSource("file", "../outside.txt")
	if err == nil {
		t.Fatal("expected vault escape error")
	}
	if !strings.Contains(err.Error(), "vault path escapes root") {
		t.Fatalf("expected vault escape error, got %q", err.Error())
	}
}

func TestAcquireSource_URLExtractsMainContent(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html>
<html>
<head>
  <title>Example Article</title>
  <style>.hidden { display:none; }</style>
  <script>window.ignore = true;</script>
</head>
<body>
  <article>
    <p>Sidebar article that should not be preferred.</p>
  </article>
  <header>Header Nav</header>
  <main>
    <section>
      <h1>Example Article</h1>
      <p>Primary article content.</p>
      <p>Second paragraph.</p>
    </section>
  </main>
</body>
</html>`))
	}))
	defer server.Close()

	src, err := app.acquireIngestSource("url", server.URL)
	if err != nil {
		t.Fatalf("acquireIngestSource returned error: %v", err)
	}

	if src.SourceType != "url" {
		t.Fatalf("expected source type url, got %q", src.SourceType)
	}
	if src.SourceURL != server.URL {
		t.Fatalf("expected source url %q, got %q", server.URL, src.SourceURL)
	}
	if src.Title != "Example Article" {
		t.Fatalf("expected extracted title, got %q", src.Title)
	}
	if !strings.Contains(src.Content, "Primary article content.") {
		t.Fatalf("expected main article content in %q", src.Content)
	}
	if !strings.Contains(src.Content, "Second paragraph.") {
		t.Fatalf("expected second paragraph in %q", src.Content)
	}
	if strings.Contains(src.Content, "Sidebar article that should not be preferred.") {
		t.Fatalf("expected main content to be preferred over first article, got %q", src.Content)
	}
	if strings.Contains(src.Content, "window.ignore") {
		t.Fatalf("expected script content removed, got %q", src.Content)
	}
	if strings.Contains(src.Content, "display:none") {
		t.Fatalf("expected style content removed, got %q", src.Content)
	}
	if strings.Contains(src.Content, "<main>") {
		t.Fatalf("expected html tags removed, got %q", src.Content)
	}
}

func TestAcquireSource_URLNon2xxReturnsError(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unavailable", http.StatusBadGateway)
	}))
	defer server.Close()

	_, err := app.acquireIngestSource("url", server.URL)
	if err == nil {
		t.Fatal("expected error for non-2xx response")
	}
	if !strings.Contains(err.Error(), "status 502") {
		t.Fatalf("expected status error, got %q", err.Error())
	}
}

func TestIngest_URLRawSourceStoresOriginalContent(t *testing.T) {
	app := setupVaultRetrievalTest(t)

	originalExtractor := ingestKnowledgeExtractor
	ingestKnowledgeExtractor = func(_ *App, _ *ingestSource) (*ingestStructuredKnowledge, error) {
		return &ingestStructuredKnowledge{
			Entities: []string{"Graphify"},
			Concepts: []string{"Knowledge Graph"},
			Summary:  "Graphify builds a persistent knowledge graph from mixed sources.",
			Claims: []string{
				"Supports multiple coding assistant platforms.",
				"Uses AST and multimodal inputs.",
			},
			Gaps: []string{"Missing benchmark details."},
		}, nil
	}
	defer func() {
		ingestKnowledgeExtractor = originalExtractor
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>Graphify README</title></head><body><main><p>Raw README body.</p></main></body></html>`))
	}))
	defer server.Close()

	result, err := app.IngestKnowledgeSource("url", server.URL, "claude", "tester")
	if err != nil {
		t.Fatalf("IngestKnowledgeSource returned error: %v", err)
	}
	if result.Status != "completed" && result.Status != "completed_with_warnings" {
		t.Fatalf("expected completed status, got %q", result.Status)
	}

	_, rawContent := readSingleIngestMarkdownFile(t, app.vaultRoot, "knowledge-base/raw/sources", "graphify-readme")
	assertContainsAll(t, rawContent,
		"source_type: 'url'",
		"source_url: '"+server.URL+"'",
		"Raw README body.",
	)
}

func TestAcquireSource_URLOversizedResponseReturnsError(t *testing.T) {
	app := setupVaultRetrievalTest(t)
	oversizedBody := "<html><body>" + strings.Repeat("a", (2<<20)+1) + "</body></html>"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(oversizedBody))
	}))
	defer server.Close()

	_, err := app.acquireIngestSource("url", server.URL)
	if err == nil {
		t.Fatal("expected error for oversized response")
	}
	if !strings.Contains(err.Error(), "too large") {
		t.Fatalf("expected size error, got %q", err.Error())
	}
}

func TestParseStructuredKnowledgeJSON_ParsesFencedJSON(t *testing.T) {
	raw := "```json\n{\"entities\":[\"Hermes\"],\"concepts\":[\"Knowledge Graph\"],\"summary\":\"ok\"}\n```"
	parsed, err := parseStructuredKnowledgeJSON(raw)
	if err != nil {
		t.Fatalf("parseStructuredKnowledgeJSON returned error: %v", err)
	}
	if len(parsed.Entities) != 1 || parsed.Entities[0] != "Hermes" {
		t.Fatalf("unexpected entities: %#v", parsed.Entities)
	}
	if len(parsed.Concepts) != 1 || parsed.Concepts[0] != "Knowledge Graph" {
		t.Fatalf("unexpected concepts: %#v", parsed.Concepts)
	}
	if parsed.Summary != "ok" {
		t.Fatalf("unexpected summary: %q", parsed.Summary)
	}
}

func TestMapSpecialMarkdownURL_GitHubBlobToRaw(t *testing.T) {
	fetchURL, title, accept, ok := mapSpecialMarkdownURL("https://github.com/org/repo/blob/main/docs/guide.md")
	if !ok {
		t.Fatal("expected github blob url mapping")
	}
	if fetchURL != "https://raw.githubusercontent.com/org/repo/main/docs/guide.md" {
		t.Fatalf("unexpected fetch url: %q", fetchURL)
	}
	if title != "guide.md" {
		t.Fatalf("unexpected title: %q", title)
	}
	if accept != "text/plain" {
		t.Fatalf("unexpected accept header: %q", accept)
	}
}

func TestMapSpecialMarkdownURL_GitHubRepoToReadmeAPI(t *testing.T) {
	fetchURL, title, accept, ok := mapSpecialMarkdownURL("https://github.com/org/repo")
	if !ok {
		t.Fatal("expected github repo url mapping")
	}
	if fetchURL != "https://api.github.com/repos/org/repo/readme" {
		t.Fatalf("unexpected fetch url: %q", fetchURL)
	}
	if title != "repo README" {
		t.Fatalf("unexpected title: %q", title)
	}
	if accept != "application/vnd.github.raw" {
		t.Fatalf("unexpected accept header: %q", accept)
	}
}

func TestMapSpecialMarkdownURL_GitHubReleaseTagToAPI(t *testing.T) {
	fetchURL, title, accept, ok := mapSpecialMarkdownURL("https://github.com/openai/codex/releases/tag/rust-v0.121.0")
	if !ok {
		t.Fatal("expected github release tag url mapping")
	}
	if fetchURL != "https://api.github.com/repos/openai/codex/releases/tags/rust-v0.121.0" {
		t.Fatalf("unexpected fetch url: %q", fetchURL)
	}
	if title != "codex release rust-v0.121.0" {
		t.Fatalf("unexpected title: %q", title)
	}
	if accept != "application/vnd.github+json" {
		t.Fatalf("unexpected accept header: %q", accept)
	}
}

func readSingleIngestMarkdownFile(t *testing.T, vaultRoot, relDir, nameFragment string) (string, string) {
	t.Helper()

	dirPath := filepath.Join(vaultRoot, filepath.FromSlash(relDir))
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		t.Fatalf("failed to read ingest directory %s: %v", dirPath, err)
	}

	var matchName string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if filepath.Ext(name) != ".md" {
			continue
		}
		if !strings.Contains(name, nameFragment) {
			continue
		}
		if matchName != "" {
			t.Fatalf("expected one markdown file containing %q in %s, found %q and %q", nameFragment, relDir, matchName, name)
		}
		matchName = name
	}

	if matchName == "" {
		t.Fatalf("expected one markdown file containing %q in %s", nameFragment, relDir)
	}

	relPath := filepath.ToSlash(filepath.Join(relDir, matchName))
	content, err := os.ReadFile(filepath.Join(dirPath, matchName))
	if err != nil {
		t.Fatalf("failed to read ingest file %s: %v", relPath, err)
	}

	return relPath, string(content)
}

func listIngestMarkdownFiles(t *testing.T, vaultRoot, relDir string) []string {
	t.Helper()

	dirPath := filepath.Join(vaultRoot, filepath.FromSlash(relDir))
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		t.Fatalf("failed to read ingest directory %s: %v", dirPath, err)
	}

	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if filepath.Ext(name) != ".md" {
			continue
		}
		paths = append(paths, filepath.ToSlash(filepath.Join(relDir, name)))
	}
	return paths
}

func readVaultTestFile(t *testing.T, root, relPath string) string {
	t.Helper()

	content, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(relPath)))
	if err != nil {
		t.Fatalf("failed to read %s: %v", relPath, err)
	}
	return string(content)
}

func assertContainsAll(t *testing.T, content string, parts ...string) {
	t.Helper()

	for _, part := range parts {
		if !strings.Contains(content, part) {
			t.Fatalf("expected content to contain %q, got:\n%s", part, content)
		}
	}
}

func assertWarningContains(t *testing.T, warnings []string, want string) {
	t.Helper()

	for _, warning := range warnings {
		if strings.Contains(warning, want) {
			return
		}
	}
	t.Fatalf("expected warnings to contain %q, got %#v", want, warnings)
}

func hasExactTestLine(content, expected string) bool {
	expected = strings.TrimSpace(expected)
	for _, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		if strings.TrimSpace(line) == expected {
			return true
		}
	}
	return false
}
