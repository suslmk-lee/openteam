package main

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"openreport/internal/db"
)

const (
	personalAICollectorSourceMiniMaxAccountAPI = "minimax_account_api"
	miniMaxTokenPlanRemainsEndpoint            = "https://www.minimax.io/v1/token_plan/remains"
	miniMaxOpenPlatformRemainsEndpoint         = "https://api.minimax.io/v1/api/openplatform/coding_plan/remains"
	miniMaxOpenPlatformRemainsEndpointWWW      = "https://www.minimax.io/v1/api/openplatform/coding_plan/remains"
)

type personalRemoteCollectorSpec struct {
	SourceCode string
	Collect    func(userID int64, month string, options personalCollectRunOptions, cursor personalAICollectCursorSource) (db.PersonalAICollectorResult, personalAICollectCursorSource, error)
}

type miniMaxUsageCounter struct {
	Path      string
	ModelCode string
	Used      float64
	Total     float64
	Remaining float64
}

type miniMaxUsageDelta struct {
	ModelCode string
	Delta     float64
}

func (a *App) remoteUsageCollectorSpecs() []personalRemoteCollectorSpec {
	return []personalRemoteCollectorSpec{
		{
			SourceCode: personalAICollectorSourceMiniMaxAccountAPI,
			Collect:    a.collectMiniMaxAccountUsage,
		},
	}
}

func (a *App) runRemoteUsageCollectors(
	userID int64,
	month string,
	options personalCollectRunOptions,
	cursorPayload personalAICollectCursorPayload,
) ([]db.PersonalAICollectorResult, personalAICollectCursorPayload, error) {
	if cursorPayload.Sources == nil {
		cursorPayload.Sources = map[string]personalAICollectCursorSource{}
	}
	specs := a.remoteUsageCollectorSpecs()
	results := make([]db.PersonalAICollectorResult, 0, len(specs))
	for _, spec := range specs {
		cursor := cursorPayload.Sources[spec.SourceCode]
		if cursor.Files == nil {
			cursor.Files = map[string]personalAICollectFileCursor{}
		}
		if cursor.State == nil {
			cursor.State = map[string]string{}
		}

		result, nextCursor, err := spec.Collect(userID, month, options, cursor)
		if err != nil {
			return nil, cursorPayload, err
		}
		cursorPayload.Sources[spec.SourceCode] = nextCursor
		results = append(results, result)
	}
	return results, cursorPayload, nil
}

func (a *App) collectMiniMaxAccountUsage(
	_ int64,
	month string,
	options personalCollectRunOptions,
	sourceCursor personalAICollectCursorSource,
) (db.PersonalAICollectorResult, personalAICollectCursorSource, error) {
	result := db.PersonalAICollectorResult{
		SourceCode: personalAICollectorSourceMiniMaxAccountAPI,
		SourceName: "MiniMax API (account usage)",
		Warnings:   []string{},
	}

	if sourceCursor.Files == nil {
		sourceCursor.Files = map[string]personalAICollectFileCursor{}
	}
	if sourceCursor.State == nil {
		sourceCursor.State = map[string]string{}
	}
	nextCursor := personalAICollectCursorSource{
		LastSuccessAt: sourceCursor.LastSuccessAt,
		Files:         map[string]personalAICollectFileCursor{},
		State:         map[string]string{},
	}
	for k, v := range sourceCursor.Files {
		nextCursor.Files[k] = v
	}
	for k, v := range sourceCursor.State {
		nextCursor.State[k] = v
	}

	normalizedMonth, _, _, err := normalizeUsageMonth(month)
	if err != nil {
		return result, nextCursor, err
	}
	currentMonth := usageTimeInKST(time.Now()).Format("2006-01")
	if normalizedMonth != currentMonth {
		result.Warnings = append(result.Warnings, "MiniMax account API supports current-month snapshot collection only.")
		return result, nextCursor, nil
	}

	cfg, err := a.getMiniMaxConfig()
	if err != nil {
		result.Warnings = append(result.Warnings, fmt.Sprintf("MiniMax config read failed: %v", err))
		return result, nextCursor, nil
	}
	if cfg == nil || strings.TrimSpace(cfg.APIKey) == "" {
		result.Warnings = append(result.Warnings, "MiniMax integration is disabled or API key is missing.")
		return result, nextCursor, nil
	}

	endpoints := minimaxUsageEndpoints(cfg)
	payload, usedEndpoint, warnings := fetchMiniMaxUsagePayload(cfg.APIKey, endpoints)
	result.Warnings = append(result.Warnings, warnings...)
	result.ScannedFiles = len(endpoints)
	if payload == nil {
		return result, nextCursor, nil
	}
	if strings.TrimSpace(usedEndpoint) != "" {
		result.Warnings = append(result.Warnings, fmt.Sprintf("endpoint used: %s", usedEndpoint))
	}

	counters := extractMiniMaxUsageCounters(payload, cfg.Model)
	if len(counters) == 0 {
		result.Warnings = append(result.Warnings, "MiniMax response parsed, but usage counters were not found.")
		nextCursor.LastSuccessAt = time.Now().Format(time.RFC3339)
		return result, nextCursor, nil
	}
	result.ParsedEntries = len(counters)

	deltas, nextState, deltaWarnings := buildMiniMaxUsageDeltas(counters, sourceCursor.State, options)
	result.Warnings = append(result.Warnings, deltaWarnings...)
	nextCursor.State = nextState
	nextCursor.LastSuccessAt = time.Now().Format(time.RFC3339)

	occurredAt := usageTimeInKST(time.Now())
	for _, item := range deltas {
		requestCount := int64(math.Round(item.Delta))
		if requestCount <= 0 {
			continue
		}
		metadataJSON := marshalUsageMetadata(map[string]any{
			"collector":     personalAICollectorSourceMiniMaxAccountAPI,
			"trigger":       options.Trigger,
			"month":         normalizedMonth,
			"usedEndpoint":  usedEndpoint,
			"deltaModel":    item.ModelCode,
			"deltaQuantity": requestCount,
		})
		if err := a.trackAIUsage(aiUsageEvent{
			ProviderCode: "minimax",
			ModelCode:    item.ModelCode,
			Feature:      featureExternalMiniMaxTokenPlanAPI,
			MetadataJSON: metadataJSON,
			RequestCount: requestCount,
			InputTokens:  0,
			OutputTokens: 0,
			PaygCostUSD:  0,
			OccurredAt:   occurredAt,
		}); err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("failed to record MiniMax usage delta (%s): %v", item.ModelCode, err))
			continue
		}
		result.ImportedRows++
	}

	return result, nextCursor, nil
}

func minimaxUsageEndpoints(cfg *miniMaxIntegrationConfig) []string {
	ordered := make([]string, 0, 8)
	appendEndpoint := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		for _, existing := range ordered {
			if strings.EqualFold(existing, trimmed) {
				return
			}
		}
		ordered = append(ordered, trimmed)
	}

	appendEndpoint(cfg.UsageEndpoint)
	appendEndpoint(miniMaxTokenPlanRemainsEndpoint)
	appendEndpoint(miniMaxOpenPlatformRemainsEndpoint)
	appendEndpoint(miniMaxOpenPlatformRemainsEndpointWWW)

	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL != "" {
		appendEndpoint(baseURL + "/token_plan/remains")
		appendEndpoint(baseURL + "/api/openplatform/coding_plan/remains")
	}

	return ordered
}

func fetchMiniMaxUsagePayload(apiKey string, endpoints []string) (any, string, []string) {
	warnings := make([]string, 0)
	for _, endpoint := range endpoints {
		payload, err := requestMiniMaxUsagePayload(apiKey, endpoint)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("%s: %v", endpoint, err))
			continue
		}
		return payload, endpoint, warnings
	}
	if len(endpoints) == 0 {
		warnings = append(warnings, "MiniMax usage endpoint is not configured.")
	}
	return nil, "", warnings
}

func requestMiniMaxUsagePayload(apiKey, endpoint string) (any, error) {
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(body))
		if len(msg) > 180 {
			msg = msg[:180] + "..."
		}
		if msg == "" {
			msg = fmt.Sprintf("http status %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("http status %d: %s", resp.StatusCode, msg)
	}

	var payload any
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return nil, fmt.Errorf("invalid json response: %w", err)
	}

	if statusCode, statusMsg, hasStatus := minimaxResponseStatus(payload); hasStatus && statusCode != 0 {
		if strings.TrimSpace(statusMsg) == "" {
			statusMsg = "unknown error"
		}
		return nil, fmt.Errorf("status_code=%d: %s", statusCode, statusMsg)
	}

	return payload, nil
}

func minimaxResponseStatus(payload any) (int64, string, bool) {
	root, ok := payload.(map[string]any)
	if !ok {
		return 0, "", false
	}
	baseResp, ok := root["base_resp"].(map[string]any)
	if !ok {
		return 0, "", false
	}
	statusRaw, ok := baseResp["status_code"]
	if !ok {
		return 0, "", false
	}
	statusCode, ok := toInt64(statusRaw)
	if !ok {
		return 0, "", false
	}
	statusMsg := firstStringValue(baseResp["status_msg"], baseResp["status_message"], baseResp["message"])
	return statusCode, statusMsg, true
}

func extractMiniMaxUsageCounters(payload any, fallbackModel string) []miniMaxUsageCounter {
	counters := make([]miniMaxUsageCounter, 0)
	collectMiniMaxUsageCounters(payload, "", fallbackModel, &counters)
	if len(counters) == 0 {
		return counters
	}

	compact := map[string]miniMaxUsageCounter{}
	scoreOf := func(counter miniMaxUsageCounter) int {
		score := 0
		if counter.Used >= 0 {
			score += 2
		}
		if counter.Total >= 0 {
			score++
		}
		if counter.Remaining >= 0 {
			score++
		}
		if strings.TrimSpace(counter.ModelCode) != "" {
			score++
		}
		return score
	}

	for _, counter := range counters {
		key := minimaxCounterStateKey(counter)
		existing, ok := compact[key]
		if !ok || scoreOf(counter) > scoreOf(existing) || (scoreOf(counter) == scoreOf(existing) && counter.Used > existing.Used) {
			compact[key] = counter
		}
	}

	out := make([]miniMaxUsageCounter, 0, len(compact))
	for _, counter := range compact {
		if counter.Used < 0 && counter.Total >= 0 && counter.Remaining >= 0 {
			counter.Used = counter.Total - counter.Remaining
		}
		if counter.Used < 0 {
			continue
		}
		if strings.TrimSpace(counter.ModelCode) == "" {
			counter.ModelCode = normalizeModelHint(fallbackModel)
		}
		if strings.TrimSpace(counter.ModelCode) == "" {
			counter.ModelCode = "MiniMax-usage"
		}
		out = append(out, counter)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].ModelCode == out[j].ModelCode {
			return out[i].Path < out[j].Path
		}
		return out[i].ModelCode < out[j].ModelCode
	})
	return out
}

func collectMiniMaxUsageCounters(node any, path string, fallbackModel string, out *[]miniMaxUsageCounter) {
	switch typed := node.(type) {
	case map[string]any:
		modelCode := ""
		used := -1.0
		total := -1.0
		remaining := -1.0

		for key, value := range typed {
			normalizedKey := canonicalKey(key)
			if strValue, ok := value.(string); ok && minimaxIsModelKey(normalizedKey) {
				modelCode = normalizeModelHint(strValue)
				continue
			}
			numberValue, ok := toFloat64(value)
			if !ok {
				continue
			}
			switch {
			case minimaxIsUsedCounterKey(normalizedKey):
				used = numberValue
			case minimaxIsRemainingCounterKey(normalizedKey):
				remaining = numberValue
			case minimaxIsTotalCounterKey(normalizedKey):
				total = numberValue
			}
		}

		if used >= 0 || (total >= 0 && remaining >= 0) {
			if used < 0 && total >= 0 && remaining >= 0 {
				used = total - remaining
			}
			if strings.TrimSpace(modelCode) == "" {
				modelCode = miniMaxModelFromPath(path, fallbackModel)
			}
			*out = append(*out, miniMaxUsageCounter{
				Path:      path,
				ModelCode: modelCode,
				Used:      used,
				Total:     total,
				Remaining: remaining,
			})
		}

		for key, child := range typed {
			nextPath := key
			if strings.TrimSpace(path) != "" {
				nextPath = path + "." + key
			}
			collectMiniMaxUsageCounters(child, nextPath, fallbackModel, out)
		}
	case []any:
		for idx, child := range typed {
			nextPath := fmt.Sprintf("%s[%d]", path, idx)
			collectMiniMaxUsageCounters(child, nextPath, fallbackModel, out)
		}
	}
}

func minimaxIsModelKey(key string) bool {
	switch key {
	case "model", "modelname", "modelcode", "name":
		return true
	default:
		return false
	}
}

func minimaxIsCounterTimeLikeKey(key string) bool {
	return strings.Contains(key, "time") ||
		strings.Contains(key, "timestamp") ||
		strings.Contains(key, "date") ||
		strings.Contains(key, "status") ||
		strings.Contains(key, "code") ||
		strings.Contains(key, "msg") ||
		strings.Contains(key, "message") ||
		strings.Contains(key, "percent") ||
		strings.Contains(key, "ratio")
}

func minimaxIsUsedCounterKey(key string) bool {
	if minimaxIsCounterTimeLikeKey(key) {
		return false
	}
	return strings.Contains(key, "used") ||
		strings.Contains(key, "usage") ||
		strings.Contains(key, "consume") ||
		key == "current" ||
		strings.Contains(key, "currentcount") ||
		strings.Contains(key, "currentusage")
}

func minimaxIsTotalCounterKey(key string) bool {
	if minimaxIsCounterTimeLikeKey(key) {
		return false
	}
	return strings.Contains(key, "total") ||
		strings.Contains(key, "quota") ||
		strings.Contains(key, "limit") ||
		strings.Contains(key, "max") ||
		strings.Contains(key, "capacity")
}

func minimaxIsRemainingCounterKey(key string) bool {
	if minimaxIsCounterTimeLikeKey(key) {
		return false
	}
	return strings.Contains(key, "remain") ||
		strings.Contains(key, "remaining") ||
		strings.Contains(key, "left") ||
		strings.Contains(key, "balance")
}

func miniMaxModelFromPath(path string, fallbackModel string) string {
	segments := strings.Split(path, ".")
	for idx := len(segments) - 1; idx >= 0; idx-- {
		segment := strings.TrimSpace(segments[idx])
		if segment == "" {
			continue
		}
		lower := strings.ToLower(segment)
		if strings.Contains(lower, "minimax") || strings.HasPrefix(lower, "m2") || strings.Contains(lower, "m2.") {
			return segment
		}
	}
	return normalizeModelHint(fallbackModel)
}

func buildMiniMaxUsageDeltas(
	counters []miniMaxUsageCounter,
	prevState map[string]string,
	options personalCollectRunOptions,
) ([]miniMaxUsageDelta, map[string]string, []string) {
	if prevState == nil {
		prevState = map[string]string{}
	}
	nextState := make(map[string]string, len(prevState)+len(counters))
	for key, value := range prevState {
		nextState[key] = value
	}

	warnings := make([]string, 0)
	deltas := make([]miniMaxUsageDelta, 0)
	for _, counter := range counters {
		currentUsed := counter.Used
		if currentUsed < 0 && counter.Total >= 0 && counter.Remaining >= 0 {
			currentUsed = counter.Total - counter.Remaining
		}
		if currentUsed < 0 {
			continue
		}

		stateKey := minimaxCounterStateKey(counter)
		previousUsed, hasPrevious := parseMiniMaxStateFloat(prevState[stateKey])
		delta := 0.0
		if hasPrevious {
			delta = currentUsed - previousUsed
			if delta < 0 {
				delta = 0
			}
		} else {
			delta = currentUsed
			warnings = append(warnings, fmt.Sprintf("initial snapshot imported for %s (%.0f units)", counter.ModelCode, currentUsed))
		}

		nextState[stateKey] = strconv.FormatFloat(currentUsed, 'f', 6, 64)
		if delta <= 0 {
			continue
		}
		deltas = append(deltas, miniMaxUsageDelta{
			ModelCode: counter.ModelCode,
			Delta:     delta,
		})
	}
	return deltas, nextState, warnings
}

func minimaxCounterStateKey(counter miniMaxUsageCounter) string {
	modelCode := strings.ToLower(strings.TrimSpace(counter.ModelCode))
	if modelCode != "" {
		return "counter:model:" + modelCode
	}
	path := strings.ToLower(strings.TrimSpace(counter.Path))
	if path == "" {
		path = "root"
	}
	return "counter:path:" + path
}

func parseMiniMaxStateFloat(raw string) (float64, bool) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, false
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, false
	}
	return parsed, true
}
