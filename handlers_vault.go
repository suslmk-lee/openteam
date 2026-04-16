package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"openreport/internal/db"
)

func (a *App) vaultRootDir() string {
	if a.database != nil {
		if user, err := a.database.GetOrCreateDefaultUser(); err == nil {
			if profile, err := a.database.GetTeamProfile(user.ID); err == nil && profile != nil {
				if root := strings.TrimSpace(profile.VaultRoot); root != "" {
					return root
				}
			}
		}
	}

	root := strings.TrimSpace(a.vaultRoot)
	if root == "" {
		return defaultVaultRoot
	}
	return root
}

func normalizeVaultRelativePath(path string) string {
	cleaned := strings.TrimSpace(path)
	if cleaned == "" {
		return ""
	}

	cleaned = filepath.ToSlash(filepath.Clean(cleaned))
	if cleaned == "." {
		return ""
	}
	cleaned = strings.TrimPrefix(cleaned, "./")
	cleaned = strings.TrimPrefix(cleaned, "/")
	return cleaned
}

func parentVaultRelativePath(path string) string {
	dir := filepath.Dir(filepath.FromSlash(path))
	if dir == "." {
		return ""
	}
	return normalizeVaultRelativePath(dir)
}

func isVaultTextFile(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".txt":
		return true
	default:
		return false
	}
}

func (a *App) resolveVaultDiskPath(relPath string) (string, error) {
	root := a.vaultRootDir()
	normalized := normalizeVaultRelativePath(relPath)
	if normalized == "" {
		return "", fmt.Errorf("vault path is empty")
	}

	fullPath := filepath.Clean(filepath.Join(root, filepath.FromSlash(normalized)))
	rel, err := filepath.Rel(root, fullPath)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("vault path escapes root: %s", relPath)
	}
	return fullPath, nil
}

func (a *App) GetVaultStructure(parentID *int64) ([]db.VaultItem, error) {
	items, err := a.database.GetVaultItemsByParent(parentID)
	if err != nil {
		return nil, fmt.Errorf("failed to get vault structure: %w", err)
	}
	return items, nil
}

func (a *App) GetVaultFile(path string) (*db.VaultFile, error) {
	normalized := normalizeVaultRelativePath(path)
	if normalized == "" {
		return nil, fmt.Errorf("vault file path is empty")
	}

	item, err := a.database.GetVaultItemByPath(normalized)
	if err != nil {
		return nil, fmt.Errorf("failed to get vault item: %w", err)
	}
	if item == nil {
		return nil, fmt.Errorf("vault item not found: %s", normalized)
	}
	if item.Type != "file" {
		return nil, fmt.Errorf("vault path is not a file: %s", normalized)
	}

	fullPath, err := a.resolveVaultDiskPath(item.Path)
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read vault file %s: %w", fullPath, err)
	}

	return &db.VaultFile{
		ID:         item.ID,
		Name:       item.Name,
		Path:       item.Path,
		Content:    string(content),
		ModifiedAt: item.ModifiedAt,
		Size:       item.Size,
	}, nil
}

func (a *App) SearchVault(keyword string) ([]db.VaultItem, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return []db.VaultItem{}, nil
	}

	items, err := a.database.SearchVaultItems(keyword)
	if err != nil {
		return nil, fmt.Errorf("failed to search vault: %w", err)
	}
	return items, nil
}

func (a *App) IngestKnowledgeSource(sourceType, source, model, requestedBy string) (*db.IngestResult, error) {
	return a.runIngestPipeline(sourceType, source, model, requestedBy)
}

func (a *App) IngestKnowledgeBatch(sourceType string, sources []string, model, requestedBy string) ([]db.IngestResult, error) {
	sourceType = strings.TrimSpace(sourceType)
	model = strings.TrimSpace(model)
	requestedBy = strings.TrimSpace(requestedBy)
	results := make([]db.IngestResult, 0, len(sources))

	successCount := 0
	for _, source := range sources {
		trimmedSource := strings.TrimSpace(source)
		if trimmedSource == "" {
			continue
		}

		result, err := a.runIngestPipeline(sourceType, trimmedSource, model, requestedBy)
		if err != nil {
			results = append(results, db.IngestResult{
				SourceType:  sourceType,
				Source:      trimmedSource,
				Model:       model,
				RequestedBy: requestedBy,
				Status:      "failed",
				Warnings:    []string{err.Error()},
			})
			continue
		}
		successCount++
		results = append(results, *result)
	}

	logEntry := formatWikiLogEntry("batch_ingest", "knowledge-base/wiki", []string{
		fmt.Sprintf("source_type=%s", sourceType),
		fmt.Sprintf("requested_by=%s", requestedBy),
		fmt.Sprintf("count=%d", len(results)),
		fmt.Sprintf("success=%d", successCount),
		fmt.Sprintf("failed=%d", len(results)-successCount),
	})
	if err := a.appendWikiLogSafe(logEntry); err != nil {
		log.Printf("[vault] failed to append batch ingest log: %v", err)
	}

	return results, nil
}

func (a *App) SaveKnowledgeQuery(query, answer, model, requestedBy string, referencePaths []string) (*db.IngestResult, error) {
	query = strings.TrimSpace(query)
	answer = strings.TrimSpace(answer)
	model = strings.TrimSpace(model)
	requestedBy = strings.TrimSpace(requestedBy)

	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	if answer == "" {
		return nil, fmt.Errorf("answer is required")
	}
	if requestedBy == "" {
		return nil, fmt.Errorf("requestedBy is required")
	}
	if model == "" {
		model = "claude"
	}

	queryPath, err := a.writeWikiQueryPage(query, answer, model, requestedBy, referencePaths)
	if err != nil {
		return nil, fmt.Errorf("failed to write query page: %w", err)
	}

	logEntry := formatWikiLogEntry("query", queryPath, []string{
		fmt.Sprintf("requested_by=%s", requestedBy),
		fmt.Sprintf("model=%s", model),
		fmt.Sprintf("references=%d", len(referencePaths)),
	})
	if err := a.updateWikiIndexEntriesAndLog(queryPath, nil, logEntry); err != nil {
		return nil, fmt.Errorf("failed to update wiki index/log: %w", err)
	}

	touchedPaths := []string{queryPath, wikiIndexPath, wikiLogPath}
	expectedIndexEntry := a.ingestIndexEntryLine(queryPath)
	warnings, err := a.runIngestLintLite(touchedPaths, expectedIndexEntry, logEntry)
	if err != nil {
		return nil, fmt.Errorf("failed to run ingest lint-lite: %w", err)
	}

	if _, err := a.RefreshVault(); err != nil {
		return nil, fmt.Errorf("failed to refresh vault cache: %w", err)
	}

	status := "completed"
	if len(warnings) > 0 {
		status = "completed_with_warnings"
	}
	return &db.IngestResult{
		SourceType:  "query",
		Source:      query,
		Model:       model,
		RequestedBy: requestedBy,
		Status:      status,
		Warnings:    warnings,
	}, nil
}

func (a *App) RunKnowledgeBaseLint() (*db.IngestResult, error) {
	paths, err := a.listKnowledgeBaseWikiTextFiles()
	if err != nil {
		return nil, fmt.Errorf("failed to collect knowledge base files: %w", err)
	}

	warnings, err := a.runIngestLintLite(paths, "", "")
	if err != nil {
		return nil, fmt.Errorf("failed to run knowledge base lint: %w", err)
	}
	advancedWarnings, err := a.runIngestLintAdvanced(paths)
	if err != nil {
		return nil, fmt.Errorf("failed to run knowledge base advanced lint: %w", err)
	}
	warnings = append(warnings, advancedWarnings...)
	warnings = dedupeAndSortWarnings(warnings)

	status := "completed"
	if len(warnings) > 0 {
		status = "completed_with_warnings"
	}

	logEntry := formatWikiLogEntry("lint", "knowledge-base/wiki", []string{
		fmt.Sprintf("status=%s", status),
		fmt.Sprintf("warnings=%d", len(warnings)),
	})
	if err := a.appendWikiLogSafe(logEntry); err != nil {
		log.Printf("[vault] failed to append lint log: %v", err)
	}

	return &db.IngestResult{
		SourceType: "lint",
		Source:     "knowledge-base/wiki",
		Model:      "",
		Status:     status,
		Warnings:   warnings,
	}, nil
}

func (a *App) runIngestPipeline(sourceType, source, model, requestedBy string) (*db.IngestResult, error) {
	startedAt := time.Now()
	processLogs := make([]string, 0, 12)
	appendProcessLog := func(message string) {
		elapsed := time.Since(startedAt).Milliseconds()
		if elapsed < 0 {
			elapsed = 0
		}
		processLogs = append(processLogs, fmt.Sprintf("+%dms %s", elapsed, strings.TrimSpace(message)))
	}

	sourceType = strings.TrimSpace(sourceType)
	source = strings.TrimSpace(source)
	model = strings.TrimSpace(model)
	requestedBy = strings.TrimSpace(requestedBy)

	switch sourceType {
	case "file", "url", "text":
	default:
		return nil, fmt.Errorf("invalid sourceType: must be one of file, url, or text")
	}

	if source == "" {
		return nil, fmt.Errorf("source is empty")
	}

	switch model {
	case "claude", "openai":
	default:
		return nil, fmt.Errorf("invalid model: must be one of claude or openai")
	}

	if requestedBy == "" {
		return nil, fmt.Errorf("requestedBy is required")
	}

	src, err := a.acquireIngestSource(sourceType, source)
	if err != nil {
		return nil, fmt.Errorf("failed to acquire ingest source: %w", err)
	}
	src.IngestedAt = time.Now().UTC().Format(time.RFC3339)
	src.Model = model
	src.RequestedBy = requestedBy
	appendProcessLog(fmt.Sprintf("source acquired (%s)", src.SourceType))

	skillHints, skillSourceDir, skillWarning := a.loadIngestSkillHints(12)
	if len(skillHints) > 0 {
		src.SkillHints = skillHints
		src.SkillSourceDir = skillSourceDir
		appendProcessLog(fmt.Sprintf("skills loaded (%d) from %s", len(skillHints), skillSourceDir))
	} else {
		appendProcessLog("skills not found; continuing without local skill guidance")
	}
	if skillWarning != "" {
		appendProcessLog("skills warning: " + skillWarning)
	}

	structuredKnowledge, extractionUsed, extractionErr := a.tryExtractStructuredKnowledge(src)
	if extractionErr != nil {
		appendProcessLog("structured extraction failed: " + strings.TrimSpace(extractionErr.Error()))
		return nil, fmt.Errorf("structured knowledge extraction failed: %w", extractionErr)
	}
	if validationErr := validateIngestStructuredKnowledge(structuredKnowledge); validationErr != nil {
		appendProcessLog("structured extraction validation failed: " + strings.TrimSpace(validationErr.Error()))
		return nil, fmt.Errorf("structured knowledge extraction failed: %w", validationErr)
	}
	appendProcessLog("structured extraction completed")

	rawPath, err := a.writeRawSource(src)
	if err != nil {
		return nil, fmt.Errorf("failed to write raw source: %w", err)
	}
	appendProcessLog("raw source written: " + rawPath)

	wikiPath, err := a.writeWikiSourcePage(src, rawPath, structuredKnowledge)
	if err != nil {
		return nil, fmt.Errorf("failed to write wiki source page: %w", err)
	}
	appendProcessLog("wiki source written: " + wikiPath)

	derivedPaths, err := a.generateDerivedWikiArtifacts(src, wikiPath, structuredKnowledge)
	if err != nil {
		return nil, fmt.Errorf("failed to generate derived wiki artifacts: %w", err)
	}
	appendProcessLog(fmt.Sprintf("derived artifacts generated: %d", len(derivedPaths)))

	logEntry := formatWikiLogEntry("ingest", wikiPath, []string{
		fmt.Sprintf("requested_by=%s", requestedBy),
		fmt.Sprintf("source_type=%s", sourceType),
		fmt.Sprintf("model=%s", model),
		fmt.Sprintf("derived=%d", len(derivedPaths)),
	})
	if err := a.updateWikiIndexEntriesAndLog(wikiPath, derivedPaths, logEntry); err != nil {
		return nil, fmt.Errorf("failed to update wiki index/log: %w", err)
	}
	appendProcessLog("wiki index/log updated")

	expectedIndexEntry := a.ingestIndexEntryLine(wikiPath)
	touchedPaths := []string{rawPath, wikiPath, wikiIndexPath, wikiLogPath}
	touchedPaths = append(touchedPaths, derivedPaths...)
	lintWarnings, err := a.runIngestLintLite(touchedPaths, expectedIndexEntry, logEntry)
	if err != nil {
		return nil, fmt.Errorf("failed to run ingest lint-lite: %w", err)
	}
	warnings := make([]string, 0, len(lintWarnings)+1)
	if skillWarning != "" {
		warnings = append(warnings, skillWarning)
	}
	warnings = append(warnings, lintWarnings...)
	warnings = dedupeAndSortWarnings(warnings)
	appendProcessLog(fmt.Sprintf("lint completed (warnings=%d)", len(warnings)))

	if _, err := a.RefreshVault(); err != nil {
		return nil, fmt.Errorf("failed to refresh vault cache: %w", err)
	}
	appendProcessLog("vault cache refreshed")

	status := "completed"
	if len(warnings) > 0 {
		status = "completed_with_warnings"
		log.Printf("[vault] ingest lint-lite warnings: %s", strings.Join(warnings, "; "))
	}

	createdPaths := uniqueNormalizedPaths(append([]string{rawPath, wikiPath}, derivedPaths...))
	createdPaths = uniqueNormalizedPaths(append(createdPaths, wikiIndexPath, wikiLogPath))
	elapsedMs := time.Since(startedAt).Milliseconds()
	if elapsedMs <= 0 {
		elapsedMs = 1
	}
	appendProcessLog(fmt.Sprintf("ingest completed status=%s", status))

	log.Printf("[vault] ingest completed sourceType=%s raw=%s wiki=%s status=%s", sourceType, rawPath, wikiPath, status)

	return &db.IngestResult{
		SourceType:     sourceType,
		Source:         source,
		Model:          model,
		RequestedBy:    requestedBy,
		Status:         status,
		Warnings:       warnings,
		RawPath:        rawPath,
		WikiSourcePath: wikiPath,
		DerivedPaths:   uniqueNormalizedPaths(derivedPaths),
		CreatedPaths:   createdPaths,
		IndexPath:      wikiIndexPath,
		LogPath:        wikiLogPath,
		ElapsedMs:      elapsedMs,
		ExtractorUsed:  extractionUsed,
		SkillSourceDir: skillSourceDir,
		ProcessLogs:    processLogs,
	}, nil
}

func (a *App) tryExtractStructuredKnowledge(src *ingestSource) (*ingestStructuredKnowledge, bool, error) {
	if src == nil {
		return nil, false, fmt.Errorf("ingest source is nil")
	}

	knowledge, err := ingestKnowledgeExtractor(a, src)
	if err != nil {
		return nil, true, fmt.Errorf("%s", strings.TrimSpace(err.Error()))
	}
	return knowledge, true, nil
}

func (a *App) RetrieveVaultContext(query string, limit int) ([]db.VaultReference, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []db.VaultReference{}, nil
	}
	if limit <= 0 {
		limit = 7
	}

	candidateLimit := limit * 5
	if candidateLimit < limit {
		candidateLimit = limit
	}
	if candidateLimit > 50 {
		candidateLimit = 50
	}

	candidateByPath := make(map[string]db.VaultItem, candidateLimit*2)
	candidateBoost := make(map[string]int, candidateLimit*2)
	candidateOrder := make([]string, 0, candidateLimit*2)
	pushCandidate := func(item db.VaultItem, boost int) {
		if item.Path == "" {
			return
		}
		if _, exists := candidateByPath[item.Path]; !exists {
			candidateByPath[item.Path] = item
			candidateOrder = append(candidateOrder, item.Path)
		}
		if boost > candidateBoost[item.Path] {
			candidateBoost[item.Path] = boost
		}
	}

	// index.md first retrieval:
	// pull candidate docs from index lines matching the query, then merge with direct file search.
	indexItems, err := a.indexRoutedVaultCandidates(query, candidateLimit)
	if err != nil {
		log.Printf("[vault] index routing failed: %v", err)
	}
	for _, item := range indexItems {
		pushCandidate(item, 120)
	}

	queryItems, err := a.database.SearchVaultFileItems(query, candidateLimit)
	if err != nil {
		return nil, fmt.Errorf("failed to search vault context: %w", err)
	}
	for _, item := range queryItems {
		pushCandidate(item, 80)
	}

	// Fallback: split a natural-language query into keyword terms and search each term.
	termLimit := candidateLimit
	terms := extractVaultQueryTerms(query)
	for _, term := range terms {
		items, termErr := a.database.SearchVaultFileItems(term, termLimit)
		if termErr != nil {
			log.Printf("[vault] term search failed for %q: %v", term, termErr)
			continue
		}
		for _, item := range items {
			pushCandidate(item, 40)
			if len(candidateByPath) >= candidateLimit {
				break
			}
		}
		if len(candidateByPath) >= candidateLimit {
			break
		}
	}

	if len(candidateByPath) == 0 {
		// Follow-up prompts like "한국어로 요약해줘" often don't contain retrievable
		// keywords. In that case, fall back to recently indexed files so the
		// assistant can stay grounded in the configured Vault.
		fallbackItems, fallbackErr := a.database.ListVaultFileItems(candidateLimit)
		if fallbackErr != nil {
			return nil, fmt.Errorf("failed to collect fallback vault context: %w", fallbackErr)
		}
		for _, item := range fallbackItems {
			pushCandidate(item, 10)
			if len(candidateByPath) >= candidateLimit {
				break
			}
		}
	}
	if len(candidateByPath) == 0 {
		return []db.VaultReference{}, nil
	}

	type scoredReference struct {
		reference db.VaultReference
		score     int
		order     int
	}

	candidateCount := len(candidateOrder)
	if candidateCount > candidateLimit {
		candidateCount = candidateLimit
	}

	scored := make([]scoredReference, 0, candidateCount)
	for i := 0; i < candidateCount; i++ {
		path := candidateOrder[i]
		item := candidateByPath[path]
		fullPath, err := a.resolveVaultDiskPath(item.Path)
		if err != nil {
			log.Printf("[vault] skipping %s: %v", item.Path, err)
			continue
		}

		content, err := os.ReadFile(fullPath)
		if err != nil {
			log.Printf("[vault] failed to read %s: %v", fullPath, err)
			continue
		}

		text := string(content)
		scored = append(scored, scoredReference{
			reference: db.VaultReference{
				Path:    item.Path,
				Title:   vaultReferenceTitle(item),
				Snippet: buildVaultSnippet(text, query),
				Content: text,
			},
			score: scoreVaultReference(item, text, query) + candidateBoost[item.Path],
			order: i,
		})
	}

	if len(scored) == 0 {
		return []db.VaultReference{}, nil
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		if scored[i].reference.Title != scored[j].reference.Title {
			return scored[i].reference.Title < scored[j].reference.Title
		}
		if scored[i].reference.Path != scored[j].reference.Path {
			return scored[i].reference.Path < scored[j].reference.Path
		}
		return scored[i].order < scored[j].order
	})

	if len(scored) > limit {
		scored = scored[:limit]
	}

	result := make([]db.VaultReference, 0, len(scored))
	for _, entry := range scored {
		result = append(result, entry.reference)
	}

	logEntry := formatWikiLogEntry("query", query, []string{
		fmt.Sprintf("result_count=%d", len(result)),
		fmt.Sprintf("limit=%d", limit),
	})
	if err := a.appendWikiLogSafe(logEntry); err != nil {
		log.Printf("[vault] failed to append query log: %v", err)
	}
	return result, nil
}

func (a *App) RefreshVault() (int, error) {
	root := a.vaultRootDir()
	info, err := os.Stat(root)
	if err != nil {
		return 0, fmt.Errorf("failed to access vault root %s: %w", root, err)
	}
	if !info.IsDir() {
		return 0, fmt.Errorf("vault root is not a directory: %s", root)
	}

	if err := a.database.ClearVaultItems(); err != nil {
		return 0, fmt.Errorf("failed to clear vault cache: %w", err)
	}

	count := 0
	walkErr := filepath.Walk(root, func(absPath string, fileInfo os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if absPath == root {
			return nil
		}

		relPath, err := filepath.Rel(root, absPath)
		if err != nil {
			return err
		}
		relPath = normalizeVaultRelativePath(relPath)
		if relPath == "" {
			return nil
		}

		itemType := "folder"
		if !fileInfo.IsDir() {
			if !isVaultTextFile(absPath) {
				return nil
			}
			itemType = "file"
		}

		item := &db.VaultItem{
			Type:       itemType,
			Name:       fileInfo.Name(),
			Path:       relPath,
			ModifiedAt: fileInfo.ModTime().Format(time.RFC3339),
			Size:       fileInfo.Size(),
		}

		if parentPath := parentVaultRelativePath(relPath); parentPath != "" {
			parentItem, err := a.database.GetVaultItemByPath(parentPath)
			if err != nil {
				log.Printf("[vault] failed to resolve parent for %s: %v", relPath, err)
			} else if parentItem != nil {
				item.ParentID = &parentItem.ID
			}
		}

		id, err := a.database.SaveVaultItem(item)
		if err != nil {
			log.Printf("[vault] failed to save %s: %v", relPath, err)
			return nil
		}
		item.ID = id
		count++
		return nil
	})
	if walkErr != nil {
		return count, fmt.Errorf("failed to scan vault: %w", walkErr)
	}

	return count, nil
}

func vaultReferenceTitle(item db.VaultItem) string {
	title := strings.TrimSpace(item.Name)
	if title == "" {
		title = strings.TrimSpace(filepath.Base(item.Path))
	}
	title = strings.TrimSpace(strings.TrimSuffix(title, filepath.Ext(title)))
	if title == "" {
		title = strings.TrimSpace(item.Path)
	}
	return title
}

func scoreVaultReference(item db.VaultItem, content, query string) int {
	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	if normalizedQuery == "" {
		return 0
	}

	score := 0
	name := strings.ToLower(item.Name)
	path := strings.ToLower(item.Path)
	body := strings.ToLower(content)

	if strings.Contains(name, normalizedQuery) {
		score += 100
	}
	if strings.Contains(path, normalizedQuery) {
		score += 60
	}
	if strings.Contains(body, normalizedQuery) {
		score += 40 + strings.Count(body, normalizedQuery)
	}
	return score
}

func buildVaultSnippet(content, query string) string {
	text := strings.TrimSpace(content)
	if text == "" {
		return ""
	}

	if strings.TrimSpace(query) == "" {
		return truncateVaultText(text, 240)
	}

	lowerText := strings.ToLower(text)
	lowerQuery := strings.ToLower(strings.TrimSpace(query))
	idx := strings.Index(lowerText, lowerQuery)
	if idx < 0 {
		return truncateVaultText(text, 240)
	}

	runes := []rune(text)
	runeIdx := len([]rune(lowerText[:idx]))
	start := runeIdx - 80
	if start < 0 {
		start = 0
	}
	matchLen := len([]rune(query))
	if matchLen == 0 {
		matchLen = 1
	}
	end := runeIdx + matchLen + 80
	if end > len(runes) {
		end = len(runes)
	}

	snippet := compactVaultSnippet(string(runes[start:end]))
	if start > 0 {
		snippet = "... " + snippet
	}
	if end < len(runes) {
		snippet += " ..."
	}
	return snippet
}

func truncateVaultText(text string, maxRunes int) string {
	if maxRunes <= 0 {
		maxRunes = 240
	}

	runes := []rune(text)
	truncated := false
	if len(runes) > maxRunes {
		runes = runes[:maxRunes]
		truncated = true
	}

	snippet := compactVaultSnippet(string(runes))
	if truncated && snippet != "" {
		snippet += " ..."
	}
	return snippet
}

func compactVaultSnippet(text string) string {
	return strings.Join(strings.Fields(text), " ")
}

var vaultWordPattern = regexp.MustCompile(`[A-Za-z0-9._-]+`)
var vaultMarkdownLinkPattern = regexp.MustCompile(`\[[^\]]+\]\(([^)]+)\)`)

func extractVaultQueryTerms(query string) []string {
	raw := vaultWordPattern.FindAllString(query, -1)
	if len(raw) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(raw))
	terms := make([]string, 0, len(raw))
	for _, token := range raw {
		t := strings.TrimSpace(strings.ToLower(token))
		if len(t) < 2 {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		terms = append(terms, t)
	}
	return terms
}

func (a *App) indexRoutedVaultCandidates(query string, limit int) ([]db.VaultItem, error) {
	if strings.TrimSpace(query) == "" || limit <= 0 {
		return []db.VaultItem{}, nil
	}

	indexFiles, err := a.database.SearchVaultFileItems("index.md", 32)
	if err != nil {
		return nil, err
	}
	if len(indexFiles) == 0 {
		return []db.VaultItem{}, nil
	}

	terms := extractVaultQueryTerms(query)
	if len(terms) == 0 {
		return []db.VaultItem{}, nil
	}

	results := make([]db.VaultItem, 0, limit)
	seen := make(map[string]struct{}, limit*2)
	push := func(item *db.VaultItem) {
		if item == nil || item.Path == "" {
			return
		}
		if _, ok := seen[item.Path]; ok {
			return
		}
		seen[item.Path] = struct{}{}
		results = append(results, *item)
	}

	for _, indexFile := range indexFiles {
		if len(results) >= limit {
			break
		}

		// Always include index file itself as one contextual anchor when it matches.
		fullPath, err := a.resolveVaultDiskPath(indexFile.Path)
		if err != nil {
			continue
		}
		content, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			normalizedLine := strings.ToLower(strings.TrimSpace(line))
			if normalizedLine == "" {
				continue
			}
			if !vaultContainsAnyTerm(normalizedLine, terms) {
				continue
			}
			push(&indexFile)
			linkPaths := extractVaultMarkdownLinks(line, indexFile.Path)
			for _, rel := range linkPaths {
				item, lookupErr := a.lookupVaultFileForLink(rel)
				if lookupErr != nil || item == nil {
					continue
				}
				push(item)
				if len(results) >= limit {
					break
				}
			}
			if len(results) >= limit {
				break
			}
		}
	}

	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

func vaultContainsAnyTerm(text string, terms []string) bool {
	for _, term := range terms {
		if strings.Contains(text, term) {
			return true
		}
	}
	return false
}

func extractVaultMarkdownLinks(line, basePath string) []string {
	matches := vaultMarkdownLinkPattern.FindAllStringSubmatch(line, -1)
	if len(matches) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(matches))
	paths := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		resolved := resolveVaultLinkPath(basePath, match[1])
		if resolved == "" {
			continue
		}
		if _, ok := seen[resolved]; ok {
			continue
		}
		seen[resolved] = struct{}{}
		paths = append(paths, resolved)
	}
	return paths
}

func resolveVaultLinkPath(basePath, rawLink string) string {
	target := strings.TrimSpace(rawLink)
	target = strings.Trim(target, "<>")
	if target == "" {
		return ""
	}

	lower := strings.ToLower(target)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") ||
		strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(target, "#") {
		return ""
	}

	if idx := strings.Index(target, "#"); idx >= 0 {
		target = target[:idx]
	}
	if idx := strings.Index(target, "?"); idx >= 0 {
		target = target[:idx]
	}
	target = strings.TrimSpace(target)
	if target == "" {
		return ""
	}

	if strings.HasPrefix(target, "/") || strings.HasPrefix(target, "\\") {
		return normalizeVaultRelativePath(target)
	}

	baseDir := parentVaultRelativePath(basePath)
	joined := target
	if baseDir != "" {
		joined = filepath.ToSlash(filepath.Join(filepath.FromSlash(baseDir), filepath.FromSlash(target)))
	}
	return normalizeVaultRelativePath(joined)
}

func (a *App) lookupVaultFileForLink(path string) (*db.VaultItem, error) {
	normalized := normalizeVaultRelativePath(path)
	if normalized == "" {
		return nil, nil
	}

	candidates := []string{normalized}
	if ext := strings.ToLower(filepath.Ext(normalized)); ext == "" {
		candidates = append(candidates, normalized+".md")
		candidates = append(candidates, normalized+".markdown")
		candidates = append(candidates, normalized+"/index.md")
	}

	for _, candidate := range candidates {
		item, err := a.database.GetVaultItemByPath(candidate)
		if err != nil {
			return nil, err
		}
		if item != nil && item.Type == "file" {
			return item, nil
		}
	}
	return nil, nil
}
