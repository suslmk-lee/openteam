package main

import (
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"openreport/internal/ai"
)

const maxIngestURLBodyBytes = 2 << 20

const (
	wikiIndexPath = "knowledge-base/wiki/index.md"
	wikiLogPath   = "knowledge-base/wiki/log.md"
)

var ingestIndexLogMu sync.Mutex

type ingestSource struct {
	Title          string
	Content        string
	SourcePath     string
	SourceURL      string
	SourceType     string
	IngestedAt     string
	Model          string
	RequestedBy    string
	SkillHints     []ingestSkillHint
	SkillSourceDir string
}

type ingestStructuredKnowledge struct {
	Entities []string `json:"entities"`
	Concepts []string `json:"concepts"`
	Summary  string   `json:"summary"`
	Claims   []string `json:"claims,omitempty"`
	Gaps     []string `json:"gaps,omitempty"`
}

type wikiIndexEntry struct {
	Path      string
	Title     string
	Summary   string
	UpdatedAt string
	Type      string
	Category  string
}

type ingestSkillHint struct {
	Name        string
	Description string
}

type ingestStructuredExtractor func(app *App, src *ingestSource) (*ingestStructuredKnowledge, error)

var ingestKnowledgeExtractor ingestStructuredExtractor = defaultIngestKnowledgeExtractor

func (a *App) acquireIngestSource(sourceType, source string) (*ingestSource, error) {
	sourceType = strings.TrimSpace(sourceType)
	rawSource := source
	trimmedSource := strings.TrimSpace(source)
	if trimmedSource == "" {
		return nil, fmt.Errorf("source is empty")
	}

	switch sourceType {
	case "text":
		return &ingestSource{
			Content:    rawSource,
			SourceType: "text",
		}, nil
	case "file":
		diskPath := trimmedSource
		sourcePath := trimmedSource
		if !filepath.IsAbs(trimmedSource) {
			normalizedPath := normalizeVaultRelativePath(trimmedSource)
			if normalizedPath == "" {
				return nil, fmt.Errorf("source file path is empty")
			}

			resolvedPath, err := a.resolveVaultDiskPath(normalizedPath)
			if err != nil {
				return nil, err
			}
			diskPath = resolvedPath
			sourcePath = normalizedPath
		}

		content, err := os.ReadFile(diskPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read source file %s: %w", trimmedSource, err)
		}
		return &ingestSource{
			Title:      strings.TrimSuffix(filepath.Base(sourcePath), filepath.Ext(sourcePath)),
			Content:    string(content),
			SourcePath: sourcePath,
			SourceType: "file",
		}, nil
	case "url":
		return acquireURLIngestSource(trimmedSource)
	default:
		return nil, fmt.Errorf("invalid sourceType: must be one of file, url, or text")
	}
}

func (a *App) writeRawSource(src *ingestSource) (string, error) {
	if src == nil {
		return "", fmt.Errorf("ingest source is nil")
	}

	content := src.Content
	if content == "" {
		return "", fmt.Errorf("ingest source content is empty")
	}

	baseName := fmt.Sprintf("%s-%s", time.Now().Format("2006-01-02"), ingestSourceSlug(src))
	relPath, absPath, err := a.nextAvailableIngestPath("knowledge-base/raw/sources", baseName)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return "", fmt.Errorf("failed to create raw source directory: %w", err)
	}

	lines := []string{
		"---",
		fmt.Sprintf("source_type: %s", quoteYAMLString(src.SourceType)),
		fmt.Sprintf("ingested_at: %s", quoteYAMLString(ingestSourceIngestedAt(src))),
		fmt.Sprintf("model: %s", quoteYAMLString(src.Model)),
		fmt.Sprintf("requested_by: %s", quoteYAMLString(src.RequestedBy)),
	}
	if sourcePath := strings.TrimSpace(src.SourcePath); sourcePath != "" {
		lines = append(lines, fmt.Sprintf("source_path: %s", quoteYAMLString(filepath.ToSlash(sourcePath))))
	}
	if sourceURL := strings.TrimSpace(src.SourceURL); sourceURL != "" {
		lines = append(lines, fmt.Sprintf("source_url: %s", quoteYAMLString(sourceURL)))
	}
	lines = append(lines, "---", "", content)

	if err := os.WriteFile(absPath, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
		return "", fmt.Errorf("failed to write raw source file: %w", err)
	}

	return relPath, nil
}

func (a *App) writeWikiSourcePage(src *ingestSource, rawPath string, knowledge *ingestStructuredKnowledge) (string, error) {
	if src == nil {
		return "", fmt.Errorf("ingest source is nil")
	}

	rawPath = normalizeVaultRelativePath(rawPath)
	if rawPath == "" {
		return "", fmt.Errorf("raw source path is empty")
	}

	baseName := strings.TrimSuffix(filepath.Base(filepath.FromSlash(rawPath)), filepath.Ext(rawPath))
	if baseName == "" {
		baseName = fmt.Sprintf("%s-%s", time.Now().Format("2006-01-02"), ingestSourceSlug(src))
	}

	relPath, absPath, err := a.nextAvailableIngestPath("knowledge-base/wiki/sources", baseName)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return "", fmt.Errorf("failed to create wiki source directory: %w", err)
	}

	title := ingestSourceTitle(src)
	lines := []string{
		"---",
		fmt.Sprintf("title: %s", quoteYAMLString(title)),
		fmt.Sprintf("source_type: %s", quoteYAMLString(src.SourceType)),
		fmt.Sprintf("ingested_at: %s", quoteYAMLString(ingestSourceIngestedAt(src))),
		fmt.Sprintf("model: %s", quoteYAMLString(src.Model)),
		fmt.Sprintf("requested_by: %s", quoteYAMLString(src.RequestedBy)),
		fmt.Sprintf("raw_path: %s", quoteYAMLString(rawPath)),
	}

	if sourcePath := strings.TrimSpace(src.SourcePath); sourcePath != "" {
		lines = append(lines, fmt.Sprintf("source_path: %s", quoteYAMLString(filepath.ToSlash(sourcePath))))
	}
	if sourceURL := strings.TrimSpace(src.SourceURL); sourceURL != "" {
		lines = append(lines, fmt.Sprintf("source_url: %s", quoteYAMLString(sourceURL)))
	}

	lines = append(lines,
		"---",
		fmt.Sprintf("# %s", title),
		"",
		fmt.Sprintf("Raw source: `%s`", rawPath),
	)

	summary := ""
	if knowledge != nil {
		summary = strings.TrimSpace(knowledge.Summary)
	}
	if summary != "" {
		lines = append(lines, "", "## Summary", summary)
	}

	if knowledge != nil && len(knowledge.Claims) > 0 {
		lines = append(lines, "", "## Key Points")
		for _, claim := range normalizeIngestTerms(knowledge.Claims, 8) {
			lines = append(lines, "- "+claim)
		}
	}

	commands := extractIngestSlashCommands(src.Content)
	if len(commands) > 0 {
		lines = append(lines, "", "## Commands")
		for _, command := range commands {
			lines = append(lines, fmt.Sprintf("- `%s`", command))
		}
	}
	lines = append(lines, "")

	if err := os.WriteFile(absPath, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
		return "", fmt.Errorf("failed to write wiki source page: %w", err)
	}

	return relPath, nil
}

func (a *App) updateWikiIndex(sourcePage string) error {
	indexAbsPath, err := a.resolveVaultDiskPath(wikiIndexPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(indexAbsPath), 0o755); err != nil {
		return fmt.Errorf("failed to create wiki index directory: %w", err)
	}

	entries, err := a.collectWikiIndexEntries()
	if err != nil {
		return fmt.Errorf("failed to collect wiki index entries: %w", err)
	}

	rendered := renderWikiIndexCatalog(entries)
	if err := os.WriteFile(indexAbsPath, []byte(rendered), 0o644); err != nil {
		return fmt.Errorf("failed to write wiki index: %w", err)
	}
	return nil
}

func (a *App) appendWikiLog(entry string) error {
	entry = strings.TrimSpace(entry)
	if entry == "" {
		return fmt.Errorf("wiki log entry is empty")
	}

	logAbsPath, err := a.resolveVaultDiskPath(wikiLogPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(logAbsPath), 0o755); err != nil {
		return fmt.Errorf("failed to create wiki log directory: %w", err)
	}

	content, err := os.ReadFile(logAbsPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to read wiki log: %w", err)
	}

	current := strings.TrimRight(string(content), "\n")
	if current == "" {
		current = "# Wiki Log"
	}

	updated := current + "\n\n" + entry + "\n"
	if err := os.WriteFile(logAbsPath, []byte(updated), 0o644); err != nil {
		return fmt.Errorf("failed to write wiki log: %w", err)
	}
	return nil
}

func (a *App) appendWikiLogSafe(entry string) error {
	ingestIndexLogMu.Lock()
	defer ingestIndexLogMu.Unlock()
	return a.appendWikiLog(entry)
}

func (a *App) updateWikiIndexAndLog(sourcePage, logEntry string) error {
	return a.updateWikiIndexEntriesAndLog(sourcePage, nil, logEntry)
}

func (a *App) updateWikiIndexEntriesAndLog(sourcePage string, additionalPages []string, logEntry string) error {
	ingestIndexLogMu.Lock()
	defer ingestIndexLogMu.Unlock()

	if err := a.updateWikiIndex(sourcePage); err != nil {
		return err
	}
	for _, page := range additionalPages {
		if err := a.updateWikiIndex(page); err != nil {
			return err
		}
	}
	if err := a.appendWikiLog(logEntry); err != nil {
		return err
	}
	return nil
}

func formatWikiLogEntry(operation, subject string, details []string) string {
	op := strings.TrimSpace(operation)
	if op == "" {
		op = "event"
	}
	subject = strings.TrimSpace(subject)
	if subject == "" {
		subject = "knowledge-base/wiki"
	}

	lines := []string{
		fmt.Sprintf("## [%s] %s | %s", time.Now().UTC().Format(time.RFC3339), op, subject),
	}
	for _, detail := range details {
		detail = strings.TrimSpace(detail)
		if detail == "" {
			continue
		}
		lines = append(lines, "- "+detail)
	}
	return strings.Join(lines, "\n")
}

func (a *App) generateDerivedWikiArtifacts(src *ingestSource, sourcePage string, precomputedKnowledge *ingestStructuredKnowledge) ([]string, error) {
	sourcePage = normalizeVaultRelativePath(sourcePage)
	if src == nil || sourcePage == "" {
		return nil, nil
	}

	knowledge := precomputedKnowledge
	if err := validateIngestStructuredKnowledge(knowledge); err != nil {
		return nil, fmt.Errorf("structured knowledge is required for derived artifacts: %w", err)
	}
	entities := knowledge.Entities
	concepts := knowledge.Concepts

	createdPaths := make([]string, 0, len(entities)+len(concepts)+1)
	conceptPages := make(map[string]string, len(concepts))
	for _, concept := range concepts {
		path, err := a.upsertWikiTermPage("concepts", concept, sourcePage, nil)
		if err != nil {
			return nil, err
		}
		if path != "" {
			conceptPages[concept] = path
			createdPaths = append(createdPaths, path)
		}
	}

	entityPages := make(map[string]string, len(entities))
	for _, entity := range entities {
		path, err := a.upsertWikiTermPage("entities", entity, sourcePage, conceptPages)
		if err != nil {
			return nil, err
		}
		if path != "" {
			entityPages[entity] = path
			createdPaths = append(createdPaths, path)
		}
	}

	synthesisPath, err := a.writeWikiSynthesisPage(src, sourcePage, entities, concepts, entityPages, conceptPages, knowledge)
	if err != nil {
		return nil, err
	}
	if synthesisPath != "" {
		createdPaths = append(createdPaths, synthesisPath)
	}

	if err := a.enrichConceptPagesWithRelations(conceptPages, entityPages, synthesisPath); err != nil {
		return nil, err
	}

	if err := a.appendDerivedLinksToSourcePage(sourcePage, entityPages, conceptPages, synthesisPath); err != nil {
		return nil, err
	}

	return uniqueNormalizedPaths(createdPaths), nil
}

func defaultIngestKnowledgeExtractor(app *App, src *ingestSource) (*ingestStructuredKnowledge, error) {
	if app == nil || src == nil {
		return nil, fmt.Errorf("ingest extractor input is nil")
	}

	prompt := buildIngestKnowledgeExtractionPrompt(src)
	raw := ""
	var err error
	if strings.EqualFold(strings.TrimSpace(src.Model), "claude") {
		result, claudeErr := app.ClaudeChatWithSession(prompt, "", "")
		if claudeErr != nil {
			return nil, claudeErr
		}
		raw = result.Reply
	} else {
		cfg, cfgErr := app.getOpenAIConfig()
		if cfgErr != nil {
			return nil, cfgErr
		}
		if cfg == nil {
			return nil, fmt.Errorf("openai config is not available")
		}
		client := ai.NewClient(cfg.APIKey, cfg.Model)
		raw, err = client.ChatCompletion("Return strict JSON only.", prompt)
		if err != nil {
			return nil, err
		}
		app.trackOpenAIUsageFromClient(client, "vault_ingest")
	}

	parsed, parseErr := parseStructuredKnowledgeJSON(raw)
	if parseErr != nil {
		return nil, parseErr
	}
	parsed.Entities = normalizeIngestTerms(parsed.Entities, 8)
	parsed.Concepts = normalizeIngestTerms(parsed.Concepts, 8)
	parsed.Claims = normalizeIngestTerms(parsed.Claims, 8)
	parsed.Gaps = normalizeIngestTerms(parsed.Gaps, 8)
	parsed.Summary = strings.TrimSpace(parsed.Summary)
	return parsed, nil
}

func buildIngestKnowledgeExtractionPrompt(src *ingestSource) string {
	title := ingestSourceTitle(src)
	content := strings.TrimSpace(src.Content)
	if len([]rune(content)) > 4000 {
		content = string([]rune(content)[:4000])
	}

	skillGuidance := ""
	if len(src.SkillHints) > 0 {
		lines := make([]string, 0, len(src.SkillHints)+2)
		lines = append(lines, "Skill Guidance (local Claude skills):")
		for _, hint := range src.SkillHints {
			name := strings.TrimSpace(hint.Name)
			description := strings.TrimSpace(hint.Description)
			if name == "" && description == "" {
				continue
			}
			if name == "" {
				lines = append(lines, "- "+description)
				continue
			}
			if description == "" {
				lines = append(lines, "- "+name)
				continue
			}
			lines = append(lines, fmt.Sprintf("- %s: %s", name, description))
		}
		if len(lines) > 1 {
			skillGuidance = strings.Join(lines, "\n") + "\n\n"
		}
	}

	return fmt.Sprintf(`Extract structured knowledge from the source text and return JSON only.
Schema:
{
  "entities": ["..."],
  "concepts": ["..."],
  "summary": "...",
  "claims": ["..."],
  "gaps": ["..."]
}
Rules:
- entities: concrete names (products, people, organizations, tools)
- concepts: abstract topics/ideas
- max 8 items per list
- summary in 1-2 sentences
- no markdown, no prose, no code block wrapper
- prioritize repository/domain naming patterns suggested by skill guidance when present

%sTitle: %s
SourceType: %s
SkillSourceDir: %s
Content:
%s
`, skillGuidance, title, src.SourceType, strings.TrimSpace(src.SkillSourceDir), content)
}

func (a *App) loadIngestSkillHints(limit int) ([]ingestSkillHint, string, string) {
	candidates := a.ingestSkillCandidateDirs()
	for _, dir := range candidates {
		info, err := os.Stat(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, "", fmt.Sprintf("skills directory stat failed (%s): %v", dir, err)
		}
		if !info.IsDir() {
			continue
		}

		hints, readErr := readIngestSkillHintsFromDir(dir, limit)
		if readErr != nil {
			return nil, "", fmt.Sprintf("failed to read skills from %s: %v", dir, readErr)
		}
		if len(hints) == 0 {
			continue
		}
		return hints, filepath.Clean(dir), ""
	}
	return nil, "", ""
}

func (a *App) ingestSkillCandidateDirs() []string {
	root := strings.TrimSpace(a.vaultRootDir())
	candidates := []string{
		strings.TrimSpace(os.Getenv("OPENREPORT_INGEST_SKILLS_DIR")),
		filepath.Join(root, ".claude", "skills"),
		filepath.Join(root, "knowledge-base", ".claude", "skills"),
		filepath.Join(root, "AI-News", "knowledge-base", ".claude", "skills"),
		`D:\vault\.claude\skills`,
		`D:\vault\AI-News\knowledge-base\.claude\skills`,
		`D:\valut\.claude\skills`,
	}

	seen := map[string]struct{}{}
	unique := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		normalized := filepath.Clean(candidate)
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		unique = append(unique, normalized)
	}
	return unique
}

func readIngestSkillHintsFromDir(dir string, limit int) ([]ingestSkillHint, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = len(entries)
	}

	hints := make([]ingestSkillHint, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".md" && ext != ".markdown" {
			continue
		}

		path := filepath.Join(dir, entry.Name())
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil, readErr
		}
		name, description := extractIngestSkillHint(string(content), entry.Name())
		if name == "" && description == "" {
			continue
		}
		hints = append(hints, ingestSkillHint{Name: name, Description: description})
	}

	sort.SliceStable(hints, func(i, j int) bool {
		return strings.ToLower(hints[i].Name) < strings.ToLower(hints[j].Name)
	})
	if len(hints) > limit {
		hints = hints[:limit]
	}
	return hints, nil
}

func extractIngestSkillHint(content, fallbackName string) (string, string) {
	name := strings.TrimSpace(strings.TrimSuffix(fallbackName, filepath.Ext(fallbackName)))
	description := ""

	frontmatter, ok := extractSimpleFrontmatter(content)
	if ok {
		if value := strings.TrimSpace(extractSimpleFrontmatterValue(content, "name")); value != "" {
			name = value
		}
		for _, line := range strings.Split(frontmatter, "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(strings.ToLower(trimmed), "description:") {
				description = strings.TrimSpace(strings.TrimPrefix(trimmed, "description:"))
				description = strings.Trim(description, "\"'")
				break
			}
		}
	}

	for _, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			heading := strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
			if heading != "" {
				name = heading
			}
			continue
		}
		if strings.HasPrefix(trimmed, "---") {
			continue
		}
		if description == "" {
			description = trimmed
		}
		if name != "" && description != "" {
			break
		}
	}

	if len([]rune(description)) > 220 {
		description = strings.TrimSpace(string([]rune(description)[:220])) + " ..."
	}
	return strings.TrimSpace(name), strings.TrimSpace(description)
}

func parseStructuredKnowledgeJSON(raw string) (*ingestStructuredKnowledge, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return nil, fmt.Errorf("empty extraction response")
	}
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```JSON")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("structured extraction is not valid json object")
	}
	text = text[start : end+1]

	var parsed ingestStructuredKnowledge
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse structured extraction json: %w", err)
	}
	return &parsed, nil
}

func normalizeIngestTerms(values []string, limit int) []string {
	if limit <= 0 {
		limit = len(values)
	}
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, trimmed)
		if len(result) >= limit {
			break
		}
	}
	return result
}

func validateIngestStructuredKnowledge(knowledge *ingestStructuredKnowledge) error {
	if knowledge == nil {
		return fmt.Errorf("empty structured extraction result")
	}

	knowledge.Summary = strings.TrimSpace(knowledge.Summary)
	knowledge.Entities = normalizeIngestTerms(knowledge.Entities, 8)
	knowledge.Concepts = normalizeIngestTerms(knowledge.Concepts, 8)
	knowledge.Claims = normalizeIngestTerms(knowledge.Claims, 8)
	knowledge.Gaps = normalizeIngestTerms(knowledge.Gaps, 8)

	if knowledge.Summary == "" {
		return fmt.Errorf("summary is required")
	}
	if len(knowledge.Entities) == 0 || len(knowledge.Concepts) == 0 {
		return fmt.Errorf("must include at least one entity and one concept")
	}
	return nil
}

func (a *App) runIngestLintLite(touched []string, expectedIndexEntry, expectedLogMarker string) ([]string, error) {
	uniqueTouched := make(map[string]struct{}, len(touched))
	paths := make([]string, 0, len(touched))
	for _, path := range touched {
		normalized := normalizeVaultRelativePath(path)
		if normalized == "" || !isVaultTextFile(normalized) {
			continue
		}
		if _, seen := uniqueTouched[normalized]; seen {
			continue
		}
		uniqueTouched[normalized] = struct{}{}
		paths = append(paths, normalized)
	}
	sort.Strings(paths)

	uniqueWarnings := make(map[string]struct{})
	warnings := make([]string, 0)

	for _, requiredPath := range []string{wikiIndexPath, wikiLogPath} {
		exists, err := a.ingestLintTargetExists(requiredPath)
		if err != nil {
			return nil, err
		}
		if !exists {
			kind := "log"
			if requiredPath == wikiIndexPath {
				kind = "index"
			}
			addIngestLintWarning(uniqueWarnings, &warnings, fmt.Sprintf("missing wiki %s: %s", kind, requiredPath))
		}
	}

	expectedIndexEntry = strings.TrimSpace(expectedIndexEntry)
	if expectedIndexEntry != "" {
		indexContent, err := a.ingestLintReadRequiredFile(wikiIndexPath)
		if err != nil {
			return nil, err
		}
		if indexContent != "" && !hasExactTrimmedLine(indexContent, expectedIndexEntry) {
			addIngestLintWarning(uniqueWarnings, &warnings, fmt.Sprintf("missing wiki index entry %s", expectedIndexEntry))
		}
	}

	expectedLogMarker = strings.TrimSpace(expectedLogMarker)
	if expectedLogMarker != "" {
		logContent, err := a.ingestLintReadRequiredFile(wikiLogPath)
		if err != nil {
			return nil, err
		}
		if logContent != "" && !strings.Contains(logContent, expectedLogMarker) {
			addIngestLintWarning(uniqueWarnings, &warnings, fmt.Sprintf("missing wiki log marker %s", expectedLogMarker))
		}
	}

	for _, path := range paths {
		absPath, err := a.resolveVaultDiskPath(path)
		if err != nil {
			return nil, err
		}

		content, err := os.ReadFile(absPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read lint target %s: %w", path, err)
		}

		if ingestLintRequiresFrontmatter(path) && !hasSimpleFrontmatter(string(content)) {
			addIngestLintWarning(uniqueWarnings, &warnings, fmt.Sprintf("%s: missing frontmatter", path))
		}

		// Raw source layer is immutable capture; relative links from external docs
		// (e.g., README -> LICENSE) are expected and should not fail KB lint.
		if ingestLintChecksBrokenLinks(path) {
			matches := vaultMarkdownLinkPattern.FindAllStringSubmatch(string(content), -1)
			for _, match := range matches {
				if len(match) < 2 {
					continue
				}

				target := strings.TrimSpace(match[1])
				resolved := resolveVaultLinkPath(path, target)
				if resolved == "" {
					continue
				}

				exists, err := a.ingestLintTargetExists(resolved)
				if err != nil {
					return nil, err
				}
				if exists {
					continue
				}

				addIngestLintWarning(uniqueWarnings, &warnings, fmt.Sprintf("%s: broken link %s", path, target))
			}
		}
	}

	sort.Strings(warnings)
	return warnings, nil
}

func (a *App) ingestLintReadRequiredFile(path string) (string, error) {
	absPath, err := a.resolveVaultDiskPath(path)
	if err != nil {
		return "", err
	}

	content, err := os.ReadFile(absPath)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("failed to read lint target %s: %w", path, err)
	}
	return string(content), nil
}

func addIngestLintWarning(seen map[string]struct{}, warnings *[]string, warning string) {
	if _, exists := seen[warning]; exists {
		return
	}
	seen[warning] = struct{}{}
	*warnings = append(*warnings, warning)
}

func dedupeAndSortWarnings(warnings []string) []string {
	seen := make(map[string]struct{}, len(warnings))
	result := make([]string, 0, len(warnings))
	for _, warning := range warnings {
		trimmed := strings.TrimSpace(warning)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	sort.Strings(result)
	return result
}

func ingestLintRequiresFrontmatter(path string) bool {
	normalized := normalizeVaultRelativePath(path)
	if normalized == "" {
		return false
	}
	switch normalized {
	case wikiIndexPath, wikiLogPath:
		return false
	}
	ext := strings.ToLower(filepath.Ext(normalized))
	return ext == ".md" || ext == ".markdown"
}

func ingestLintChecksBrokenLinks(path string) bool {
	normalized := normalizeVaultRelativePath(path)
	if normalized == "" {
		return false
	}
	if strings.HasPrefix(normalized, "knowledge-base/raw/sources/") {
		return false
	}
	return true
}

func (a *App) ingestLintTargetExists(path string) (bool, error) {
	normalized := normalizeVaultRelativePath(path)
	if normalized == "" {
		return false, nil
	}

	candidates := []string{normalized}
	if filepath.Ext(normalized) == "" {
		candidates = append(candidates, normalized+".md", normalized+".markdown", normalized+"/index.md")
	}

	for _, candidate := range candidates {
		absPath, err := a.resolveVaultDiskPath(candidate)
		if err != nil {
			return false, err
		}

		info, err := os.Stat(absPath)
		if err == nil && !info.IsDir() {
			return true, nil
		}
		if err != nil && !os.IsNotExist(err) {
			return false, fmt.Errorf("failed to stat lint target %s: %w", candidate, err)
		}
	}

	return false, nil
}

func (a *App) runIngestLintAdvanced(paths []string) ([]string, error) {
	unique := make(map[string]struct{}, len(paths))
	filtered := make([]string, 0, len(paths))
	for _, path := range paths {
		normalized := normalizeVaultRelativePath(path)
		if normalized == "" || !isVaultTextFile(normalized) {
			continue
		}
		if _, ok := unique[normalized]; ok {
			continue
		}
		unique[normalized] = struct{}{}
		filtered = append(filtered, normalized)
	}
	sort.Strings(filtered)

	contents := make(map[string]string, len(filtered))
	for _, path := range filtered {
		absPath, err := a.resolveVaultDiskPath(path)
		if err != nil {
			return nil, err
		}
		content, err := os.ReadFile(absPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read lint target %s: %w", path, err)
		}
		contents[path] = string(content)
	}

	inboundWithoutIndex := make(map[string]int, len(filtered))
	for _, path := range filtered {
		inboundWithoutIndex[path] = 0
	}
	for fromPath, content := range contents {
		matches := vaultMarkdownLinkPattern.FindAllStringSubmatch(content, -1)
		for _, match := range matches {
			if len(match) < 2 {
				continue
			}
			target := resolveVaultLinkPath(fromPath, match[1])
			if target == "" {
				continue
			}
			if _, ok := inboundWithoutIndex[target]; !ok {
				continue
			}
			if fromPath == wikiIndexPath {
				continue
			}
			inboundWithoutIndex[target]++
		}
	}

	const staleThreshold = 120 * 24 * time.Hour
	warnings := make([]string, 0, 32)
	for _, path := range filtered {
		if path == wikiIndexPath || path == wikiLogPath {
			continue
		}
		content := contents[path]

		updatedAt := extractSimpleFrontmatterValue(content, "updated_at")
		if updatedAt == "" {
			updatedAt = extractSimpleFrontmatterValue(content, "ingested_at")
		}
		if updatedAt != "" {
			if ts, err := time.Parse(time.RFC3339, updatedAt); err == nil {
				if time.Since(ts) > staleThreshold {
					warnings = append(warnings, fmt.Sprintf("%s: stale page (updated_at=%s)", path, updatedAt))
				}
			}
		}

		if inboundWithoutIndex[path] == 0 && wikiIndexCategoryForPath(path) != "sources" {
			warnings = append(warnings, fmt.Sprintf("%s: orphan page (no inbound links except index)", path))
		}

		if subject := detectSimpleMarkdownContradiction(content); subject != "" {
			warnings = append(warnings, fmt.Sprintf("%s: possible contradiction on subject %q", path, subject))
		}
	}

	return dedupeAndSortWarnings(warnings), nil
}

var (
	contradictionPositivePattern = regexp.MustCompile(`(?i)^([A-Za-z0-9 _./-]{3,80})\s+is\s+(.+)$`)
	contradictionNegativePattern = regexp.MustCompile(`(?i)^([A-Za-z0-9 _./-]{3,80})\s+is\s+not\s+(.+)$`)
)

func detectSimpleMarkdownContradiction(content string) string {
	if strings.TrimSpace(content) == "" {
		return ""
	}

	positive := map[string]struct{}{}
	negative := map[string]struct{}{}
	for _, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(strings.TrimPrefix(line, "- "))
		if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "```") {
			continue
		}
		if match := contradictionPositivePattern.FindStringSubmatch(trimmed); len(match) > 1 {
			subject := strings.ToLower(strings.TrimSpace(match[1]))
			if subject != "" {
				positive[subject] = struct{}{}
			}
		}
		if match := contradictionNegativePattern.FindStringSubmatch(trimmed); len(match) > 1 {
			subject := strings.ToLower(strings.TrimSpace(match[1]))
			if subject != "" {
				negative[subject] = struct{}{}
			}
		}
	}

	for subject := range positive {
		if _, ok := negative[subject]; ok {
			return subject
		}
	}
	return ""
}

func (a *App) ingestIndexEntryTitle(sourcePage string) string {
	normalized := normalizeVaultRelativePath(sourcePage)
	if normalized == "" {
		return "Source"
	}

	if absPath, err := a.resolveVaultDiskPath(normalized); err == nil {
		if content, readErr := os.ReadFile(absPath); readErr == nil {
			if title := extractSimpleFrontmatterValue(string(content), "title"); title != "" {
				return title
			}
		}
	}

	title := strings.TrimSpace(strings.TrimSuffix(filepath.Base(filepath.FromSlash(normalized)), filepath.Ext(normalized)))
	if title == "" {
		return normalized
	}
	return title
}

func (a *App) ingestIndexEntryLine(sourcePage string) string {
	normalized := normalizeVaultRelativePath(sourcePage)
	if normalized == "" {
		return ""
	}
	return a.buildWikiIndexEntryLine(normalized)
}

func (a *App) collectWikiIndexEntries() ([]wikiIndexEntry, error) {
	rootPath := normalizeVaultRelativePath("knowledge-base/wiki")
	rootDiskPath, err := a.resolveVaultDiskPath(rootPath)
	if err != nil {
		return nil, err
	}

	entries := make([]wikiIndexEntry, 0, 128)
	walkErr := filepath.Walk(rootDiskPath, func(absPath string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() || !isVaultTextFile(absPath) {
			return nil
		}

		rel, err := filepath.Rel(a.vaultRootDir(), absPath)
		if err != nil {
			return err
		}
		normalized := normalizeVaultRelativePath(rel)
		if normalized == "" || normalized == wikiIndexPath || normalized == wikiLogPath {
			return nil
		}

		entry, err := a.buildWikiIndexEntry(normalized)
		if err != nil {
			return err
		}
		entries = append(entries, entry)
		return nil
	})
	if walkErr != nil {
		if os.IsNotExist(walkErr) {
			return []wikiIndexEntry{}, nil
		}
		return nil, walkErr
	}

	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Category != entries[j].Category {
			return entries[i].Category < entries[j].Category
		}
		if entries[i].Title != entries[j].Title {
			return entries[i].Title < entries[j].Title
		}
		return entries[i].Path < entries[j].Path
	})

	return entries, nil
}

func (a *App) buildWikiIndexEntry(path string) (wikiIndexEntry, error) {
	absPath, err := a.resolveVaultDiskPath(path)
	if err != nil {
		return wikiIndexEntry{}, err
	}
	content, err := os.ReadFile(absPath)
	if err != nil {
		return wikiIndexEntry{}, err
	}

	text := string(content)
	summary := strings.TrimSpace(extractSimpleFrontmatterValue(text, "summary"))
	if summary == "" {
		summary = extractIndexSummaryFromMarkdown(text)
	}
	summary = truncateIndexSummary(summary, 140)

	updatedAt := strings.TrimSpace(extractSimpleFrontmatterValue(text, "updated_at"))
	if updatedAt == "" {
		updatedAt = strings.TrimSpace(extractSimpleFrontmatterValue(text, "ingested_at"))
	}

	typ := strings.TrimSpace(extractSimpleFrontmatterValue(text, "type"))
	if typ == "" {
		typ = strings.TrimSpace(extractSimpleFrontmatterValue(text, "source_type"))
	}
	if typ == "" {
		typ = "page"
	}

	return wikiIndexEntry{
		Path:      path,
		Title:     a.ingestIndexEntryTitle(path),
		Summary:   summary,
		UpdatedAt: updatedAt,
		Type:      typ,
		Category:  wikiIndexCategoryForPath(path),
	}, nil
}

func (a *App) buildWikiIndexEntryLine(path string) string {
	entry, err := a.buildWikiIndexEntry(path)
	if err != nil {
		return fmt.Sprintf("- [%s](/%s)", a.ingestIndexEntryTitle(path), path)
	}
	return renderWikiIndexEntryLine(entry)
}

func wikiIndexCategoryForPath(path string) string {
	normalized := normalizeVaultRelativePath(path)
	switch {
	case strings.HasPrefix(normalized, "knowledge-base/wiki/sources/"):
		return "sources"
	case strings.HasPrefix(normalized, "knowledge-base/wiki/entities/"):
		return "entities"
	case strings.HasPrefix(normalized, "knowledge-base/wiki/concepts/"):
		return "concepts"
	case strings.HasPrefix(normalized, "knowledge-base/wiki/synthesis/"):
		return "synthesis"
	case strings.HasPrefix(normalized, "knowledge-base/wiki/queries/"):
		return "queries"
	default:
		return "other"
	}
}

func renderWikiIndexCatalog(entries []wikiIndexEntry) string {
	sections := []struct {
		key   string
		title string
	}{
		{key: "sources", title: "Sources"},
		{key: "entities", title: "Entities"},
		{key: "concepts", title: "Concepts"},
		{key: "synthesis", title: "Synthesis"},
		{key: "queries", title: "Queries"},
		{key: "other", title: "Other"},
	}

	lines := []string{
		"# Wiki Index",
		"",
		fmt.Sprintf("_Updated: %s_", time.Now().UTC().Format(time.RFC3339)),
	}

	for _, section := range sections {
		group := make([]wikiIndexEntry, 0, len(entries))
		for _, entry := range entries {
			if entry.Category == section.key {
				group = append(group, entry)
			}
		}
		if len(group) == 0 {
			continue
		}
		lines = append(lines, "", "## "+section.title)
		for _, entry := range group {
			lines = append(lines, renderWikiIndexEntryLine(entry))
		}
	}

	if len(lines) == 3 {
		lines = append(lines, "", "_No indexed pages yet._")
	}

	return strings.TrimRight(strings.Join(lines, "\n"), "\n") + "\n"
}

func renderWikiIndexEntryLine(entry wikiIndexEntry) string {
	line := fmt.Sprintf("- [%s](/%s)", entry.Title, entry.Path)
	if entry.Summary != "" {
		line += " — " + entry.Summary
	}
	meta := make([]string, 0, 2)
	if entry.UpdatedAt != "" {
		meta = append(meta, "updated: "+entry.UpdatedAt)
	}
	if entry.Type != "" {
		meta = append(meta, "type: "+entry.Type)
	}
	if len(meta) > 0 {
		line += " _(" + strings.Join(meta, ", ") + ")_"
	}
	return line
}

func extractIndexSummaryFromMarkdown(content string) string {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	if _, ok := extractSimpleFrontmatter(normalized); ok {
		if idx := strings.Index(normalized, "\n---\n"); idx >= 0 {
			normalized = normalized[idx+5:]
		}
	}
	for _, line := range strings.Split(normalized, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
			continue
		}
		return trimmed
	}
	return ""
}

func truncateIndexSummary(summary string, maxRunes int) string {
	if maxRunes <= 0 {
		return strings.TrimSpace(summary)
	}
	runes := []rune(strings.TrimSpace(summary))
	if len(runes) <= maxRunes {
		return string(runes)
	}
	return strings.TrimSpace(string(runes[:maxRunes])) + " ..."
}

func hasSimpleFrontmatter(content string) bool {
	_, ok := extractSimpleFrontmatter(content)
	return ok
}

func extractSimpleFrontmatter(content string) (string, bool) {
	normalized := strings.TrimLeft(strings.ReplaceAll(content, "\r\n", "\n"), "\ufeff")
	if !strings.HasPrefix(normalized, "---\n") {
		return "", false
	}

	rest := strings.TrimPrefix(normalized, "---\n")
	switch idx := strings.Index(rest, "\n---\n"); {
	case idx >= 0:
		return rest[:idx], true
	case strings.HasSuffix(rest, "\n---"):
		return strings.TrimSuffix(rest, "\n---"), true
	default:
		return "", false
	}
}

func extractSimpleFrontmatterValue(content, key string) string {
	frontmatter, ok := extractSimpleFrontmatter(content)
	if !ok {
		return ""
	}

	prefix := key + ":"
	for _, line := range strings.Split(frontmatter, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, prefix) {
			continue
		}
		return unquoteSimpleYAMLValue(strings.TrimSpace(strings.TrimPrefix(trimmed, prefix)))
	}
	return ""
}

func unquoteSimpleYAMLValue(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 {
		if strings.HasPrefix(value, "'") && strings.HasSuffix(value, "'") {
			return strings.ReplaceAll(value[1:len(value)-1], "''", "'")
		}
		if strings.HasPrefix(value, "\"") && strings.HasSuffix(value, "\"") {
			return value[1 : len(value)-1]
		}
	}
	return value
}

func hasExactTrimmedLine(content, expected string) bool {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return false
	}

	for _, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		if strings.TrimSpace(line) == expected {
			return true
		}
	}
	return false
}

func acquireURLIngestSource(sourceURL string) (*ingestSource, error) {
	if specialURL, title, acceptHeader, ok := mapSpecialMarkdownURL(sourceURL); ok {
		if content, err := fetchURLContent(specialURL, acceptHeader); err == nil && strings.TrimSpace(content) != "" {
			normalizedTitle := strings.TrimSpace(title)
			normalizedContent := strings.TrimSpace(content)
			if releaseTitle, releaseContent, converted := formatGitHubReleasePayload(specialURL, normalizedContent); converted {
				normalizedContent = releaseContent
				if strings.TrimSpace(releaseTitle) != "" {
					normalizedTitle = releaseTitle
				}
			}

			return &ingestSource{
				Title:      normalizedTitle,
				Content:    normalizedContent,
				SourceURL:  sourceURL,
				SourceType: "url",
			}, nil
		}
	}

	rawHTML, err := fetchURLContent(sourceURL, "")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch source url %s: %w", sourceURL, err)
	}

	title, content := extractReadableHTML(rawHTML)
	if content == "" {
		return nil, fmt.Errorf("no readable content extracted from %s", sourceURL)
	}

	return &ingestSource{
		Title:      title,
		Content:    content,
		SourceURL:  sourceURL,
		SourceType: "url",
	}, nil
}

func formatGitHubReleasePayload(fetchURL, raw string) (string, string, bool) {
	if !strings.Contains(fetchURL, "api.github.com/repos/") || !strings.Contains(fetchURL, "/releases/tags/") {
		return "", "", false
	}

	var payload struct {
		Name        string `json:"name"`
		TagName     string `json:"tag_name"`
		Body        string `json:"body"`
		HTMLURL     string `json:"html_url"`
		PublishedAt string `json:"published_at"`
		Draft       bool   `json:"draft"`
		Prerelease  bool   `json:"prerelease"`
		Author      struct {
			Login string `json:"login"`
		} `json:"author"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return "", "", false
	}

	title := strings.TrimSpace(payload.Name)
	if title == "" {
		title = strings.TrimSpace(payload.TagName)
	}
	if title == "" {
		title = "GitHub Release"
	}

	lines := []string{
		fmt.Sprintf("# %s", title),
		"",
	}
	if tag := strings.TrimSpace(payload.TagName); tag != "" {
		lines = append(lines, fmt.Sprintf("- tag: `%s`", tag))
	}
	if author := strings.TrimSpace(payload.Author.Login); author != "" {
		lines = append(lines, fmt.Sprintf("- author: `%s`", author))
	}
	if published := strings.TrimSpace(payload.PublishedAt); published != "" {
		lines = append(lines, fmt.Sprintf("- published_at: `%s`", published))
	}
	lines = append(lines, fmt.Sprintf("- draft: `%t`", payload.Draft))
	lines = append(lines, fmt.Sprintf("- prerelease: `%t`", payload.Prerelease))
	if htmlURL := strings.TrimSpace(payload.HTMLURL); htmlURL != "" {
		lines = append(lines, fmt.Sprintf("- release_url: %s", htmlURL))
	}

	if body := strings.TrimSpace(payload.Body); body != "" {
		lines = append(lines, "", "## Release Notes", body)
	}

	return title, strings.Join(lines, "\n"), true
}

func fetchURLContent(sourceURL, acceptHeader string) (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodGet, sourceURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to build request for %s: %w", sourceURL, err)
	}
	req.Header.Set("User-Agent", "openreport-ingest/1.0")
	if strings.TrimSpace(acceptHeader) != "" {
		req.Header.Set("Accept", acceptHeader)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch source url %s: %w", sourceURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("failed to fetch source url %s: status %d", sourceURL, resp.StatusCode)
	}

	body, err := readURLBodyWithinLimit(resp.Body, maxIngestURLBodyBytes)
	if err != nil {
		return "", fmt.Errorf("failed to read source url %s: %w", sourceURL, err)
	}
	return string(body), nil
}

func mapSpecialMarkdownURL(sourceURL string) (fetchURL string, title string, acceptHeader string, ok bool) {
	parsed, err := url.Parse(strings.TrimSpace(sourceURL))
	if err != nil || parsed == nil {
		return "", "", "", false
	}
	host := strings.ToLower(parsed.Hostname())
	path := strings.Trim(parsed.Path, "/")
	if path == "" {
		return "", "", "", false
	}
	parts := strings.Split(path, "/")

	switch host {
	case "github.com":
		// https://github.com/{owner}/{repo}
		if len(parts) >= 2 {
			owner := parts[0]
			repo := parts[1]
			if len(parts) == 2 {
				return fmt.Sprintf("https://api.github.com/repos/%s/%s/readme", owner, repo), repo + " README", "application/vnd.github.raw", true
			}
			// https://github.com/{owner}/{repo}/blob/{branch}/{path...}
			if len(parts) >= 5 && parts[2] == "blob" {
				branch := parts[3]
				filePath := strings.Join(parts[4:], "/")
				name := filepath.Base(filePath)
				return fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", owner, repo, branch, filePath), name, "text/plain", true
			}
			// https://github.com/{owner}/{repo}/releases/tag/{tag}
			if len(parts) >= 5 && parts[2] == "releases" && parts[3] == "tag" {
				tag := strings.TrimSpace(strings.Join(parts[4:], "/"))
				if tag != "" {
					return fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/tags/%s", owner, repo, url.PathEscape(tag)), repo + " release " + tag, "application/vnd.github+json", true
				}
			}
		}
	case "gist.github.com":
		// https://gist.github.com/{user}/{id}
		if len(parts) >= 2 {
			user := parts[0]
			id := parts[1]
			return fmt.Sprintf("https://gist.githubusercontent.com/%s/%s/raw", user, id), "gist-" + id, "text/plain", true
		}
	}

	return "", "", "", false
}

var (
	ingestTitlePattern         = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	ingestArticlePattern       = regexp.MustCompile(`(?is)<article[^>]*>(.*?)</article>`)
	ingestMainPattern          = regexp.MustCompile(`(?is)<main[^>]*>(.*?)</main>`)
	ingestBodyPattern          = regexp.MustCompile(`(?is)<body[^>]*>(.*?)</body>`)
	ingestScriptPattern        = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	ingestStylePattern         = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	ingestCommentPattern       = regexp.MustCompile(`(?is)<!--.*?-->`)
	ingestBlockBoundaryPattern = regexp.MustCompile(`(?i)</(p|div|section|article|main|header|footer|li|ul|ol|h[1-6]|tr|td|th)>|<br\s*/?>`)
	ingestTagPattern           = regexp.MustCompile(`(?is)<[^>]+>`)
	ingestWhitespacePattern    = regexp.MustCompile(`[ \t\r\f\v]+`)
	ingestNewlinePattern       = regexp.MustCompile(`\n+`)
	ingestSlugUnsafePattern    = regexp.MustCompile(`[^a-z0-9]+`)
	ingestSlugDashPattern      = regexp.MustCompile(`-+`)
	ingestEntityPhrasePattern  = regexp.MustCompile(`\b[A-Z][A-Za-z0-9#+.-]*(?:\s+[A-Z][A-Za-z0-9#+.-]*){0,2}\b`)
	ingestKoreanPhrasePattern  = regexp.MustCompile(`[가-힣][가-힣0-9A-Za-z#+.-]*(?:\s+[가-힣A-Za-z0-9#+.-]{2,}){0,2}`)
	ingestWordPattern          = regexp.MustCompile(`[A-Za-z가-힣][A-Za-z0-9가-힣#+.-]*`)
	ingestSlashCommandPattern  = regexp.MustCompile(`(?:^|[\s(])(/[a-zA-Z][a-zA-Z0-9-]{1,63})\b`)
)

func extractReadableHTML(raw string) (string, string) {
	title := ""
	if match := ingestTitlePattern.FindStringSubmatch(raw); len(match) > 1 {
		title = cleanIngestText(match[1])
	}

	contentHTML := selectReadableHTMLSection(raw)
	content := cleanIngestText(contentHTML)
	return title, content
}

func selectReadableHTMLSection(raw string) string {
	sanitized := ingestCommentPattern.ReplaceAllString(raw, " ")
	sanitized = ingestScriptPattern.ReplaceAllString(sanitized, " ")
	sanitized = ingestStylePattern.ReplaceAllString(sanitized, " ")

	for _, pattern := range []*regexp.Regexp{ingestMainPattern, ingestArticlePattern, ingestBodyPattern} {
		if match := pattern.FindStringSubmatch(sanitized); len(match) > 1 {
			return match[1]
		}
	}
	return sanitized
}

func readURLBodyWithinLimit(body io.Reader, maxBytes int64) ([]byte, error) {
	if maxBytes <= 0 {
		maxBytes = maxIngestURLBodyBytes
	}

	limited := io.LimitReader(body, maxBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("source too large: exceeds %d bytes", maxBytes)
	}
	return data, nil
}

func cleanIngestText(raw string) string {
	if raw == "" {
		return ""
	}

	text := ingestBlockBoundaryPattern.ReplaceAllString(raw, "\n")
	text = ingestTagPattern.ReplaceAllString(text, " ")
	text = html.UnescapeString(text)
	text = strings.ReplaceAll(text, "\u00a0", " ")
	text = ingestWhitespacePattern.ReplaceAllString(text, " ")
	text = ingestNewlinePattern.ReplaceAllString(text, "\n")

	lines := strings.Split(text, "\n")
	cleaned := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			cleaned = append(cleaned, line)
		}
	}
	return strings.Join(cleaned, "\n")
}

func (a *App) nextAvailableIngestPath(baseDir, baseName string) (string, string, error) {
	baseDir = normalizeVaultRelativePath(baseDir)
	if baseDir == "" {
		return "", "", fmt.Errorf("ingest base directory is empty")
	}

	baseName = strings.TrimSpace(baseName)
	if baseName == "" {
		baseName = fmt.Sprintf("%s-source", time.Now().Format("2006-01-02"))
	}

	for i := 1; ; i++ {
		candidateName := baseName
		if i > 1 {
			candidateName = fmt.Sprintf("%s-%d", baseName, i)
		}

		relPath := normalizeVaultRelativePath(filepath.ToSlash(filepath.Join(baseDir, candidateName+".md")))
		absPath, err := a.resolveVaultDiskPath(relPath)
		if err != nil {
			return "", "", err
		}

		if _, err := os.Stat(absPath); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			return "", "", err
		}

		return relPath, absPath, nil
	}
}

func ingestSourceTitle(src *ingestSource) string {
	if src == nil {
		return "Source"
	}

	if title := strings.TrimSpace(src.Title); title != "" {
		return title
	}
	if sourcePath := strings.TrimSpace(src.SourcePath); sourcePath != "" {
		name := strings.TrimSuffix(filepath.Base(sourcePath), filepath.Ext(sourcePath))
		if name != "" {
			return name
		}
	}
	if contentLine := ingestFirstNonEmptyLine(src.Content); contentLine != "" {
		return contentLine
	}
	if sourceURL := strings.TrimSpace(src.SourceURL); sourceURL != "" {
		return sourceURL
	}
	return "Source"
}

func ingestSourceSlug(src *ingestSource) string {
	candidates := []string{
		ingestSourceTitle(src),
		strings.TrimSpace(src.SourceURL),
		strings.TrimSpace(src.SourcePath),
		ingestFirstNonEmptyLine(src.Content),
	}

	for _, candidate := range candidates {
		if slug := sanitizeIngestSlug(candidate); slug != "" {
			return slug
		}
	}
	return "source"
}

func ingestFirstNonEmptyLine(content string) string {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			return line
		}
	}
	return ""
}

func sanitizeIngestSlug(value string) string {
	slug := strings.ToLower(strings.TrimSpace(value))
	if slug == "" {
		return ""
	}

	slug = filepath.ToSlash(slug)
	slug = ingestSlugUnsafePattern.ReplaceAllString(slug, "-")
	slug = ingestSlugDashPattern.ReplaceAllString(slug, "-")
	return strings.Trim(slug, "-")
}

func quoteYAMLString(value string) string {
	escaped := strings.ReplaceAll(value, "'", "''")
	return fmt.Sprintf("'%s'", escaped)
}

func ingestSourceIngestedAt(src *ingestSource) string {
	if src == nil {
		return ""
	}
	if value := strings.TrimSpace(src.IngestedAt); value != "" {
		return value
	}
	return time.Now().UTC().Format(time.RFC3339)
}

func extractIngestSlashCommands(content string) []string {
	matches := ingestSlashCommandPattern.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(matches))
	commands := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		command := strings.TrimSpace(match[1])
		if command == "" {
			continue
		}
		if _, exists := seen[command]; exists {
			continue
		}
		seen[command] = struct{}{}
		commands = append(commands, command)
		if len(commands) >= 12 {
			break
		}
	}
	return commands
}

func extractIngestEntityConceptCandidates(src *ingestSource) ([]string, []string) {
	text := strings.TrimSpace(src.Content)
	if text == "" {
		return nil, nil
	}

	entitySeen := map[string]struct{}{}
	entities := make([]string, 0, 6)
	pushEntity := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		key := strings.ToLower(value)
		if _, exists := entitySeen[key]; exists {
			return
		}
		entitySeen[key] = struct{}{}
		entities = append(entities, value)
	}

	for _, match := range ingestEntityPhrasePattern.FindAllString(text, -1) {
		match = strings.TrimSpace(match)
		if match == "" {
			continue
		}
		if isIngestStopToken(match) {
			continue
		}
		pushEntity(match)
		if len(entities) >= 6 {
			break
		}
	}
	if len(entities) < 6 {
		for _, match := range ingestKoreanPhrasePattern.FindAllString(text, -1) {
			match = strings.TrimSpace(match)
			if match == "" {
				continue
			}
			if isIngestStopToken(match) {
				continue
			}
			pushEntity(match)
			if len(entities) >= 6 {
				break
			}
		}
	}
	if title := strings.TrimSpace(src.Title); title != "" && !isIngestStopToken(title) {
		pushEntity(title)
	}

	wordFreq := map[string]int{}
	for _, token := range ingestWordPattern.FindAllString(strings.ToLower(text), -1) {
		t := strings.TrimSpace(token)
		if len(t) < 4 || isIngestStopToken(t) {
			continue
		}
		wordFreq[t]++
	}
	type conceptScore struct {
		word  string
		score int
	}
	scored := make([]conceptScore, 0, len(wordFreq))
	for word, score := range wordFreq {
		scored = append(scored, conceptScore{word: word, score: score})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		return scored[i].word < scored[j].word
	})

	concepts := make([]string, 0, 6)
	for _, entry := range scored {
		concepts = append(concepts, titleCaseIngestWord(entry.word))
		if len(concepts) >= 6 {
			break
		}
	}

	if len(concepts) == 0 {
		for _, fallback := range []string{"Knowledge", "Documentation"} {
			concepts = append(concepts, fallback)
			if len(concepts) >= 2 {
				break
			}
		}
	}

	if len(entities) == 0 {
		for _, token := range []string{ingestSourceTitle(src), "Source"} {
			if strings.TrimSpace(token) == "" {
				continue
			}
			pushEntity(token)
			if len(entities) >= 2 {
				break
			}
		}
	}

	return entities, concepts
}

func isIngestStopToken(token string) bool {
	normalized := strings.ToLower(strings.TrimSpace(token))
	if normalized == "" {
		return true
	}

	stopwords := map[string]struct{}{
		"the": {}, "and": {}, "for": {}, "with": {}, "that": {}, "this": {}, "from": {},
		"uses": {}, "using": {}, "into": {}, "about": {}, "your": {}, "have": {}, "has": {},
		"are": {}, "was": {}, "were": {}, "will": {}, "can": {}, "not": {}, "but": {},
		"source": {}, "wiki": {}, "page": {}, "pages": {}, "note": {}, "notes": {},
		"그리고": {}, "또한": {}, "대한": {}, "관련": {}, "내용": {}, "문서": {}, "정리": {}, "설명": {},
		"링크": {}, "추가": {}, "파일": {}, "사용": {}, "합니다": {}, "했다": {}, "에서": {}, "으로": {},
		"이다": {}, "있다": {}, "없다": {},
	}
	_, blocked := stopwords[normalized]
	return blocked
}

func titleCaseIngestWord(word string) string {
	if word == "" {
		return ""
	}
	if len(word) == 1 {
		return strings.ToUpper(word)
	}
	return strings.ToUpper(word[:1]) + strings.ToLower(word[1:])
}

func (a *App) upsertWikiTermPage(
	sectionDir string,
	term string,
	sourcePage string,
	relatedConceptPaths map[string]string,
) (string, error) {
	sectionDir = strings.TrimSpace(sectionDir)
	term = strings.TrimSpace(term)
	sourcePage = normalizeVaultRelativePath(sourcePage)
	if sectionDir == "" || term == "" || sourcePage == "" {
		return "", nil
	}

	baseName := sanitizeIngestSlug(term)
	if baseName == "" {
		baseName = "term"
	}
	relPath := normalizeVaultRelativePath(filepath.ToSlash(filepath.Join("knowledge-base/wiki", sectionDir, baseName+".md")))
	absPath, err := a.resolveVaultDiskPath(relPath)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return "", fmt.Errorf("failed to create %s directory: %w", sectionDir, err)
	}

	sourceLine := fmt.Sprintf("- [%s](/%s)", a.ingestIndexEntryTitle(sourcePage), sourcePage)
	content := []string{
		"---",
		fmt.Sprintf("title: %s", quoteYAMLString(term)),
		fmt.Sprintf("type: %s", quoteYAMLString(wikiTermType(sectionDir))),
		fmt.Sprintf("updated_at: %s", quoteYAMLString(time.Now().UTC().Format(time.RFC3339))),
		"---",
		fmt.Sprintf("# %s", term),
		"",
		"## Sources",
		sourceLine,
	}

	if sectionDir == "entities" && len(relatedConceptPaths) > 0 {
		content = append(content, "", "## Related Concepts")
		keys := make([]string, 0, len(relatedConceptPaths))
		for key := range relatedConceptPaths {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			path := relatedConceptPaths[key]
			if path == "" {
				continue
			}
			content = append(content, fmt.Sprintf("- [%s](/%s)", key, path))
		}
	}

	if existing, err := os.ReadFile(absPath); err == nil {
		current := string(existing)
		if strings.Contains(current, sourceLine) {
			return relPath, nil
		}
		updated := strings.TrimRight(current, "\n") + "\n" + sourceLine + "\n"
		if err := os.WriteFile(absPath, []byte(updated), 0o644); err != nil {
			return "", fmt.Errorf("failed to update %s page: %w", sectionDir, err)
		}
		return relPath, nil
	}

	if err := os.WriteFile(absPath, []byte(strings.Join(content, "\n")+"\n"), 0o644); err != nil {
		return "", fmt.Errorf("failed to write %s page: %w", sectionDir, err)
	}
	return relPath, nil
}

func wikiTermType(sectionDir string) string {
	switch strings.TrimSpace(sectionDir) {
	case "entities":
		return "entity"
	case "concepts":
		return "concept"
	default:
		return strings.TrimSuffix(sectionDir, "s")
	}
}

func (a *App) writeWikiSynthesisPage(
	src *ingestSource,
	sourcePage string,
	entities []string,
	concepts []string,
	entityPages map[string]string,
	conceptPages map[string]string,
	knowledge *ingestStructuredKnowledge,
) (string, error) {
	if src == nil {
		return "", nil
	}

	baseName := fmt.Sprintf("%s-%s-synthesis", time.Now().Format("2006-01-02"), ingestSourceSlug(src))
	relPath, absPath, err := a.nextAvailableIngestPath("knowledge-base/wiki/synthesis", baseName)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return "", fmt.Errorf("failed to create wiki synthesis directory: %w", err)
	}

	lines := []string{
		"---",
		fmt.Sprintf("title: %s", quoteYAMLString(ingestSourceTitle(src)+" Synthesis")),
		fmt.Sprintf("source_path: %s", quoteYAMLString(sourcePage)),
		fmt.Sprintf("updated_at: %s", quoteYAMLString(time.Now().UTC().Format(time.RFC3339))),
		"---",
		fmt.Sprintf("# %s Synthesis", ingestSourceTitle(src)),
		"",
		"## Source",
		fmt.Sprintf("- [%s](/%s)", a.ingestIndexEntryTitle(sourcePage), sourcePage),
	}

	if len(entities) > 0 {
		lines = append(lines, "", "## Entities")
		for _, entity := range entities {
			if path := entityPages[entity]; path != "" {
				lines = append(lines, fmt.Sprintf("- [%s](/%s)", entity, path))
			} else {
				lines = append(lines, "- "+entity)
			}
		}
	}
	if len(concepts) > 0 {
		lines = append(lines, "", "## Concepts")
		for _, concept := range concepts {
			if path := conceptPages[concept]; path != "" {
				lines = append(lines, fmt.Sprintf("- [%s](/%s)", concept, path))
			} else {
				lines = append(lines, "- "+concept)
			}
		}
	}
	summary := ingestFirstNonEmptyLine(src.Content)
	if knowledge != nil && strings.TrimSpace(knowledge.Summary) != "" {
		summary = strings.TrimSpace(knowledge.Summary)
	}
	if summary != "" {
		lines = append(lines, "", "## Summary", summary)
	}
	if knowledge != nil && len(knowledge.Claims) > 0 {
		lines = append(lines, "", "## Claims")
		for _, claim := range knowledge.Claims {
			lines = append(lines, "- "+claim)
		}
	}
	if knowledge != nil && len(knowledge.Gaps) > 0 {
		lines = append(lines, "", "## Gaps")
		for _, gap := range knowledge.Gaps {
			lines = append(lines, "- "+gap)
		}
	}

	if err := os.WriteFile(absPath, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		return "", fmt.Errorf("failed to write wiki synthesis page: %w", err)
	}
	return relPath, nil
}

func (a *App) appendDerivedLinksToSourcePage(
	sourcePage string,
	entityPages map[string]string,
	conceptPages map[string]string,
	synthesisPath string,
) error {
	sourcePage = normalizeVaultRelativePath(sourcePage)
	if sourcePage == "" {
		return nil
	}

	absPath, err := a.resolveVaultDiskPath(sourcePage)
	if err != nil {
		return err
	}
	content, err := os.ReadFile(absPath)
	if err != nil {
		return fmt.Errorf("failed to read source page for derived links: %w", err)
	}

	builder := strings.TrimRight(string(content), "\n")
	if !strings.Contains(builder, "\n## Derived Pages\n") {
		builder += "\n\n## Derived Pages\n"
	}

	appendLine := func(line string) {
		if strings.Contains(builder, line) {
			return
		}
		builder += line + "\n"
	}

	keys := make([]string, 0, len(entityPages))
	for key := range entityPages {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		path := entityPages[key]
		if path == "" {
			continue
		}
		appendLine(fmt.Sprintf("- Entity: [%s](/%s)", key, path))
	}

	keys = keys[:0]
	for key := range conceptPages {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		path := conceptPages[key]
		if path == "" {
			continue
		}
		appendLine(fmt.Sprintf("- Concept: [%s](/%s)", key, path))
	}
	if synthesisPath != "" {
		appendLine(fmt.Sprintf("- Synthesis: [%s](/%s)", a.ingestIndexEntryTitle(synthesisPath), synthesisPath))
	}

	if err := os.WriteFile(absPath, []byte(strings.TrimRight(builder, "\n")+"\n"), 0o644); err != nil {
		return fmt.Errorf("failed to write source page derived links: %w", err)
	}
	return nil
}

func (a *App) enrichConceptPagesWithRelations(
	conceptPages map[string]string,
	entityPages map[string]string,
	synthesisPath string,
) error {
	if len(conceptPages) == 0 {
		return nil
	}

	conceptTerms := make([]string, 0, len(conceptPages))
	for concept := range conceptPages {
		conceptTerms = append(conceptTerms, concept)
	}
	sort.Strings(conceptTerms)

	entityTerms := make([]string, 0, len(entityPages))
	for entity := range entityPages {
		entityTerms = append(entityTerms, entity)
	}
	sort.Strings(entityTerms)

	for _, concept := range conceptTerms {
		conceptPath := normalizeVaultRelativePath(conceptPages[concept])
		if conceptPath == "" {
			continue
		}

		absPath, err := a.resolveVaultDiskPath(conceptPath)
		if err != nil {
			return err
		}
		content, err := os.ReadFile(absPath)
		if err != nil {
			return fmt.Errorf("failed to read concept page for relation enrichment: %w", err)
		}

		builder := strings.TrimRight(string(content), "\n")
		changed := false

		ensureHeading := func(heading string) {
			marker := "\n" + heading + "\n"
			if strings.Contains(builder, marker) {
				return
			}
			builder += "\n\n" + heading + "\n"
			changed = true
		}
		appendLine := func(line string) {
			if strings.Contains(builder, line) {
				return
			}
			builder += line + "\n"
			changed = true
		}

		if len(entityTerms) > 0 {
			ensureHeading("## Related Entities")
			for _, entity := range entityTerms {
				path := normalizeVaultRelativePath(entityPages[entity])
				if path == "" {
					continue
				}
				appendLine(fmt.Sprintf("- [%s](/%s)", entity, path))
			}
		}

		relatedConceptCount := 0
		for _, relatedConcept := range conceptTerms {
			if relatedConcept == concept {
				continue
			}
			if normalizeVaultRelativePath(conceptPages[relatedConcept]) != "" {
				relatedConceptCount++
			}
		}
		if relatedConceptCount > 0 {
			ensureHeading("## Related Concepts")
			for _, relatedConcept := range conceptTerms {
				if relatedConcept == concept {
					continue
				}
				path := normalizeVaultRelativePath(conceptPages[relatedConcept])
				if path == "" {
					continue
				}
				appendLine(fmt.Sprintf("- [%s](/%s)", relatedConcept, path))
			}
		}

		if normalizedSynthesisPath := normalizeVaultRelativePath(synthesisPath); normalizedSynthesisPath != "" {
			ensureHeading("## Related Synthesis")
			appendLine(fmt.Sprintf("- [%s](/%s)", a.ingestIndexEntryTitle(normalizedSynthesisPath), normalizedSynthesisPath))
		}

		if !changed {
			continue
		}
		if err := os.WriteFile(absPath, []byte(strings.TrimRight(builder, "\n")+"\n"), 0o644); err != nil {
			return fmt.Errorf("failed to update concept page relations: %w", err)
		}
	}
	return nil
}

func uniqueNormalizedPaths(paths []string) []string {
	seen := make(map[string]struct{}, len(paths))
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		normalized := normalizeVaultRelativePath(path)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func (a *App) writeWikiQueryPage(query, answer, model, requestedBy string, referencePaths []string) (string, error) {
	query = strings.TrimSpace(query)
	answer = strings.TrimSpace(answer)
	if query == "" || answer == "" {
		return "", fmt.Errorf("query and answer are required")
	}

	baseName := fmt.Sprintf("%s-%s", time.Now().Format("2006-01-02"), sanitizeIngestSlug(query))
	relPath, absPath, err := a.nextAvailableIngestPath("knowledge-base/wiki/queries", baseName)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return "", fmt.Errorf("failed to create query page directory: %w", err)
	}

	title := truncateIndexSummary(query, 90)
	summary := truncateIndexSummary(answer, 140)
	lines := []string{
		"---",
		fmt.Sprintf("title: %s", quoteYAMLString(title)),
		fmt.Sprintf("type: %s", quoteYAMLString("query")),
		fmt.Sprintf("updated_at: %s", quoteYAMLString(time.Now().UTC().Format(time.RFC3339))),
		fmt.Sprintf("model: %s", quoteYAMLString(strings.TrimSpace(model))),
		fmt.Sprintf("requested_by: %s", quoteYAMLString(strings.TrimSpace(requestedBy))),
		fmt.Sprintf("summary: %s", quoteYAMLString(summary)),
		"---",
		fmt.Sprintf("# %s", title),
		"",
		"## Query",
		query,
		"",
		"## Answer",
		answer,
	}

	normalizedRefs := uniqueNormalizedPaths(referencePaths)
	if len(normalizedRefs) > 0 {
		lines = append(lines, "", "## References")
		for _, ref := range normalizedRefs {
			lines = append(lines, fmt.Sprintf("- [%s](/%s)", a.ingestIndexEntryTitle(ref), ref))
		}
	}

	if err := os.WriteFile(absPath, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		return "", fmt.Errorf("failed to write query page: %w", err)
	}
	return relPath, nil
}

func (a *App) listKnowledgeBaseWikiTextFiles() ([]string, error) {
	rootPath := normalizeVaultRelativePath("knowledge-base/wiki")
	rootDiskPath, err := a.resolveVaultDiskPath(rootPath)
	if err != nil {
		return nil, err
	}

	paths := make([]string, 0, 64)
	walkErr := filepath.Walk(rootDiskPath, func(absPath string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}

		if !isVaultTextFile(absPath) {
			return nil
		}

		rel, err := filepath.Rel(a.vaultRootDir(), absPath)
		if err != nil {
			return err
		}
		normalized := normalizeVaultRelativePath(rel)
		if normalized == "" {
			return nil
		}
		paths = append(paths, normalized)
		return nil
	})
	if walkErr != nil {
		if os.IsNotExist(walkErr) {
			return []string{wikiIndexPath, wikiLogPath}, nil
		}
		return nil, walkErr
	}

	for _, required := range []string{wikiIndexPath, wikiLogPath} {
		exists, err := a.ingestLintTargetExists(required)
		if err != nil {
			return nil, err
		}
		if exists {
			paths = append(paths, required)
		}
	}
	return uniqueNormalizedPaths(paths), nil
}
