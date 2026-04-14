# Report Insight Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보고서 편집 화면에서 미반영 활동, 검토 필요 활동, 초안 후보를 정확하게 보여주고 사용자가 원클릭으로 보고서에 반영할 수 있게 만든다.

**Architecture:** 기존 `activities`와 `report_items`를 비교하는 인사이트 계산 레이어를 새로 추가하고, Wails API는 `App -> ReportService -> internal/reportinsights` 흐름으로 연결한다. 프런트는 `ReportEditor` 상단에 인사이트 패널을 추가하되, 기존 편집기는 유지하고 인사이트 패널은 추천과 채택만 담당한다.

**Tech Stack:** Go, Wails, SQLite, React, TypeScript, TailwindCSS

---

## File Structure

**Create**

- `internal/reportinsights/insights.go`
  보고서 인사이트 계산 로직
- `internal/reportinsights/insights_test.go`
  미반영/검토 필요/초안 후보 계산 테스트
- `frontend/src/services/reportInsightService.ts`
  인사이트 전용 프런트 API 래퍼
- `frontend/src/hooks/useReportInsights.ts`
  인사이트 조회/액션 상태 관리

**Modify**

- `internal/db/database.go`
  `report_insight_ignores` 테이블 마이그레이션 추가
- `internal/db/repository.go`
  ignore 조회/저장 메서드 추가
- `internal/db/models.go`
  인사이트 관련 모델 또는 ignore 모델 추가
- `service_report.go`
  인사이트 조회/채택 메서드 추가
- `handlers_report.go`
  Wails 바인딩용 메서드 위임 추가
- `frontend/src/pages/ReportEditor.tsx`
  인사이트 요약/미반영 활동/검토 필요/초안 후보 패널 추가
- `frontend/src/services/appApi.ts`
  Wails 메서드 타입 정의 추가

**Test**

- `internal/reportinsights/insights_test.go`
- `service_report.go` 경유 동작은 `go test ./...`로 통합 검증
- `frontend`는 `npx tsc --noEmit`

**Environment Note**

- 현재 워크스페이스는 `.git` 저장소가 아니라 `git commit` 단계는 실제 실행 대신 체크포인트 메모로 대체한다.

---

### Task 1: Insight Storage And Models

**Files:**

- Create: `internal/reportinsights/insights_test.go`
- Modify: `internal/db/database.go`
- Modify: `internal/db/repository.go`
- Modify: `internal/db/models.go`
- Test: `internal/reportinsights/insights_test.go`

- [ ] **Step 1: Write the failing test**

```go
package reportinsights

import (
	"testing"

	"openreport/internal/db"
)

func TestIgnoredActivitiesAreExcluded(t *testing.T) {
	activities := []db.Activity{
		{ID: 10, Source: "gmail", Title: "Follow up", ActivityDate: "2026-04-13"},
	}
	items := []db.ReportItem{}
	ignored := map[int64]bool{10: true}

	result := Build(activities, items, ignored)

	if len(result.UnlinkedActivities) != 0 {
		t.Fatalf("expected ignored activity to be excluded, got %+v", result.UnlinkedActivities)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/reportinsights -run TestIgnoredActivitiesAreExcluded`

Expected: FAIL with package or symbol missing errors.

- [ ] **Step 3: Write minimal implementation**

```go
package reportinsights

import "openreport/internal/db"

type Result struct {
	UnlinkedActivities []db.Activity
}

func Build(activities []db.Activity, items []db.ReportItem, ignored map[int64]bool) Result {
	result := Result{}
	for _, activity := range activities {
		if ignored[activity.ID] {
			continue
		}
		result.UnlinkedActivities = append(result.UnlinkedActivities, activity)
	}
	return result
}
```

그리고 DB에 아래 저장 구조를 추가한다.

```sql
CREATE TABLE IF NOT EXISTS report_insight_ignores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    activity_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(report_id, activity_id)
)
```

Repository에는 아래 형태의 메서드를 추가한다.

```go
func (d *Database) IgnoreReportInsightActivity(reportID, activityID int64) error
func (d *Database) ListIgnoredReportInsightActivities(reportID int64) (map[int64]bool, error)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/reportinsights -run TestIgnoredActivitiesAreExcluded`

Expected: PASS

- [ ] **Step 5: Checkpoint**

Checkpoint note: `feat: add report insight ignore storage and base result model`

---

### Task 2: Insight Classification Engine

**Files:**

- Modify: `internal/reportinsights/insights.go`
- Modify: `internal/reportinsights/insights_test.go`
- Test: `internal/reportinsights/insights_test.go`

- [ ] **Step 1: Write the failing tests**

```go
func TestLinkedActivitiesAreNotMarkedUnlinked(t *testing.T) {
	activityID := int64(21)
	activities := []db.Activity{
		{ID: activityID, Source: "linear_issue", Title: "ABC-123 fix", ActivityDate: "2026-04-14"},
	}
	items := []db.ReportItem{
		{ID: 1, ActivityID: &activityID, Section: "project_progress", Content: "done"},
	}

	result := Build(activities, items, nil)

	if len(result.UnlinkedActivities) != 0 {
		t.Fatalf("expected linked activity to be excluded from unlinked")
	}
	if result.Summary.LinkedActivities != 1 {
		t.Fatalf("expected linked count 1, got %d", result.Summary.LinkedActivities)
	}
}

func TestSuspiciousSimilarityGoesToNeedsReview(t *testing.T) {
	activities := []db.Activity{
		{ID: 31, Source: "linear_issue", Title: "ABC-123 fix login bug", ActivityDate: "2026-04-15"},
	}
	items := []db.ReportItem{
		{ID: 1, Section: "project_progress", Content: "ABC-123 login bug fix applied"},
	}

	result := Build(activities, items, nil)

	if len(result.NeedsReview) != 1 {
		t.Fatalf("expected one review item, got %d", len(result.NeedsReview))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/reportinsights -run "TestLinkedActivitiesAreNotMarkedUnlinked|TestSuspiciousSimilarityGoesToNeedsReview"`

Expected: FAIL because `Summary` / `NeedsReview` fields and classification rules are missing.

- [ ] **Step 3: Write minimal implementation**

```go
type Summary struct {
	TotalActivities    int
	LinkedActivities   int
	UnlinkedActivities int
	NeedsReview        int
}

type ActivitySuggestion struct {
	ActivityID       int64
	SuggestedSection string
	Reason           string
}

type Result struct {
	Summary            Summary
	UnlinkedActivities []ActivitySuggestion
	NeedsReview        []ActivitySuggestion
}
```

분류 규칙은 처음에는 아래처럼 단순하게 구현한다.

```go
func isLinked(activity db.Activity, items []db.ReportItem) bool
func isSuspiciouslyCovered(activity db.Activity, items []db.ReportItem) bool
func suggestSection(activity db.Activity) string
```

`isSuspiciouslyCovered`는 첫 버전에서 아래 시그널만 사용한다.

- 동일 issue key
- 제목 핵심 단어 2개 이상 겹침
- 같은 source + 같은 날짜 + 제목 유사

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/reportinsights -run "TestLinkedActivitiesAreNotMarkedUnlinked|TestSuspiciousSimilarityGoesToNeedsReview"`

Expected: PASS

- [ ] **Step 5: Checkpoint**

Checkpoint note: `feat: classify linked, unlinked, and review-needed activities`

---

### Task 3: Draft Candidate Generation

**Files:**

- Modify: `internal/reportinsights/insights.go`
- Modify: `internal/reportinsights/insights_test.go`
- Test: `internal/reportinsights/insights_test.go`

- [ ] **Step 1: Write the failing test**

```go
func TestDraftCandidatesAreBuiltOnlyFromUnlinkedActivities(t *testing.T) {
	activities := []db.Activity{
		{ID: 41, Source: "linear_issue", Title: "ABC-1 API update", Summary: "backend change", ActivityDate: "2026-04-15"},
		{ID: 42, Source: "linear_issue", Title: "ABC-2 API update", Summary: "follow-up test", ActivityDate: "2026-04-15"},
	}

	result := Build(activities, nil, nil)

	if len(result.DraftCandidates) == 0 {
		t.Fatalf("expected at least one draft candidate")
	}
	if len(result.DraftCandidates[0].ActivityIDs) != 2 {
		t.Fatalf("expected grouped candidate with 2 activities, got %+v", result.DraftCandidates[0])
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/reportinsights -run TestDraftCandidatesAreBuiltOnlyFromUnlinkedActivities`

Expected: FAIL because `DraftCandidates` does not exist.

- [ ] **Step 3: Write minimal implementation**

```go
type DraftCandidate struct {
	Key              string
	SuggestedSection string
	Content          string
	ActivityIDs      []int64
	Reason           string
}
```

초안 후보 생성은 첫 버전에서 아래 기준만 사용한다.

```go
func groupKey(activity db.Activity) string {
	return normalizeTopic(activity.Source, activity.Title, activity.Summary)
}
```

후보 문장은 첫 버전에서 AI 없이 안전한 규칙 기반 문장으로 시작한다.

```go
content := fmt.Sprintf("%s 관련 작업 진행", topicLabel)
```

AI 확장은 다음 단계로 미룬다.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/reportinsights -run TestDraftCandidatesAreBuiltOnlyFromUnlinkedActivities`

Expected: PASS

- [ ] **Step 5: Checkpoint**

Checkpoint note: `feat: add safe draft candidate grouping for unlinked activities`

---

### Task 4: Report Service And Wails API

**Files:**

- Modify: `service_report.go`
- Modify: `handlers_report.go`
- Modify: `internal/db/models.go`
- Test: `internal/reportinsights/insights_test.go`

- [ ] **Step 1: Write the failing integration-style test**

```go
func TestBuildIncludesSummaryCounts(t *testing.T) {
	activities := []db.Activity{
		{ID: 1, Source: "gmail", Title: "mail", ActivityDate: "2026-04-14"},
		{ID: 2, Source: "linear_issue", Title: "ABC-100", ActivityDate: "2026-04-14"},
	}
	linkedID := int64(2)
	items := []db.ReportItem{
		{ID: 1, ActivityID: &linkedID, Section: "project_progress", Content: "done"},
	}

	result := Build(activities, items, nil)

	if result.Summary.TotalActivities != 2 || result.Summary.LinkedActivities != 1 || result.Summary.UnlinkedActivities != 1 {
		t.Fatalf("unexpected summary: %+v", result.Summary)
	}
}
```

- [ ] **Step 2: Run test to verify it fails if summary shape changed**

Run: `go test ./internal/reportinsights -run TestBuildIncludesSummaryCounts`

Expected: FAIL until final model is wired.

- [ ] **Step 3: Write minimal implementation**

`service_report.go`에 아래 메서드를 추가한다.

```go
func (s *ReportService) GetReportInsights(reportID int64) (*db.ReportInsights, error)
func (s *ReportService) AcceptInsightActivity(reportID int64, activityID int64, section, category, period string) (*db.ReportItem, error)
func (s *ReportService) AcceptInsightDraft(reportID int64, draft db.ReportInsightDraft, period string) ([]db.ReportItem, error)
func (s *ReportService) IgnoreInsightActivity(reportID int64, activityID int64) error
```

`handlers_report.go`는 얇은 위임만 가진다.

```go
func (a *App) GetReportInsights(reportID int64) (*db.ReportInsights, error) {
	return a.report.GetReportInsights(reportID)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./...`

Expected: PASS

- [ ] **Step 5: Checkpoint**

Checkpoint note: `feat: expose report insight APIs through report service`

---

### Task 5: Frontend Insight Service And Hook

**Files:**

- Create: `frontend/src/services/reportInsightService.ts`
- Create: `frontend/src/hooks/useReportInsights.ts`
- Modify: `frontend/src/services/appApi.ts`
- Test: `frontend` TypeScript compile

- [ ] **Step 1: Write the failing type usage**

```ts
const insights = await appApi.GetReportInsights(reportId)
await appApi.IgnoreInsightActivity(reportId, activityId)
```

- [ ] **Step 2: Run type check to verify it fails**

Run: `npx tsc --noEmit`

Expected: FAIL with missing `GetReportInsights` / `IgnoreInsightActivity` members on `AppApi`.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/services/appApi.ts`

```ts
GetReportInsights: (reportID: number) => Promise<ReportInsights>
AcceptInsightActivity: (reportID: number, activityID: number, section: string, category: string, period: string) => Promise<ReportItem>
AcceptInsightDraft: (reportID: number, draft: ReportInsightDraft, period: string) => Promise<ReportItem[]>
IgnoreInsightActivity: (reportID: number, activityID: number) => Promise<void>
```

`frontend/src/services/reportInsightService.ts`

```ts
export const reportInsightService = {
  getInsights: (reportId: number) => appApi.GetReportInsights(reportId),
  acceptActivity: (reportId: number, activityId: number, section: string, category: string, period: string) =>
    appApi.AcceptInsightActivity(reportId, activityId, section, category, period),
  acceptDraft: (reportId: number, draft: ReportInsightDraft, period: string) =>
    appApi.AcceptInsightDraft(reportId, draft, period),
  ignoreActivity: (reportId: number, activityId: number) =>
    appApi.IgnoreInsightActivity(reportId, activityId),
}
```

`frontend/src/hooks/useReportInsights.ts`

```ts
export function useReportInsights(reportId: number | null) {
  const [insights, setInsights] = useState<ReportInsights | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() { /* load and set state */ }
  async function acceptActivity(...) { /* call service then refresh */ }
  async function acceptDraft(...) { /* call service then refresh */ }
  async function ignoreActivity(...) { /* call service then refresh */ }

  return { insights, loading, refresh, acceptActivity, acceptDraft, ignoreActivity }
}
```

- [ ] **Step 4: Run type check to verify it passes**

Run: `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 5: Checkpoint**

Checkpoint note: `feat: add frontend report insight service and state hook`

---

### Task 6: ReportEditor Insight Panel UI

**Files:**

- Modify: `frontend/src/pages/ReportEditor.tsx`
- Test: `npx tsc --noEmit`

- [ ] **Step 1: Write the failing UI integration shape**

Add temporary usage in `ReportEditor.tsx`:

```ts
const { insights, loading: insightsLoading, acceptActivity, acceptDraft, ignoreActivity } =
  useReportInsights(reportId)
```

and render:

```tsx
{insights && <div>{insights.summary.unlinkedActivities}</div>}
```

- [ ] **Step 2: Run type check to verify it fails**

Run: `npx tsc --noEmit`

Expected: FAIL until hook return shape and UI wiring are complete.

- [ ] **Step 3: Write minimal implementation**

상단 헤더 아래에 인사이트 패널을 추가한다.

```tsx
<section className="mb-6 space-y-4">
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <InsightStat label="반영률" value={`${insights.summary.linkedActivities}/${insights.summary.totalActivities}`} />
    <InsightStat label="미반영" value={String(insights.summary.unlinkedActivities)} />
    <InsightStat label="검토 필요" value={String(insights.summary.needsReview)} />
  </div>

  <InsightActivityList
    title="미반영 활동"
    items={insights.unlinkedActivities}
    onAcceptThisWeek={(item) => acceptActivity(reportId, item.activityId, "project_progress", item.suggestedCategory ?? "", "this_week")}
    onAcceptNextWeek={(item) => acceptActivity(reportId, item.activityId, "next_week_plan", item.suggestedCategory ?? "", "next_week")}
    onAcceptIssue={(item) => acceptActivity(reportId, item.activityId, "issues", item.suggestedCategory ?? "", "this_week")}
    onIgnore={(item) => ignoreActivity(reportId, item.activityId)}
  />

  <InsightDraftList
    items={insights.draftCandidates}
    onAccept={(draft) => acceptDraft(reportId, draft, draft.suggestedSection === "next_week_plan" ? "next_week" : "this_week")}
  />
</section>
```

UI 원칙은 아래를 따른다.

- 기존 편집기 유지
- 인사이트 패널은 접기/펼치기 가능
- `근거 보기`는 초안 후보 안에서 활동 ID 목록 또는 제목 목록을 펼쳐 보여줌
- 애매한 `needsReview`는 전용 리스트로 분리하고 자동 추천 버튼은 제공하지 않음

- [ ] **Step 4: Run verification**

Run: `npx tsc --noEmit`

Expected: PASS

Run: `go test ./...`

Expected: PASS

- [ ] **Step 5: Checkpoint**

Checkpoint note: `feat: add report insight panel to report editor`

---

### Task 7: Final Verification

**Files:**

- Modify: none
- Test: whole workspace verification

- [ ] **Step 1: Run backend tests**

Run: `go test ./...`

Expected: PASS

- [ ] **Step 2: Run frontend type verification**

Run: `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Run frontend build if environment permits**

Run: `npm run build`

Expected: PASS

If this fails due local sandbox or native module issues, record the exact environment failure and do not claim build success.

- [ ] **Step 4: Manual smoke checklist**

- Open report editor and confirm summary cards appear
- Confirm an unlinked activity can be added to `this_week`
- Confirm `ignore` removes the activity from the visible list
- Confirm a draft candidate can be accepted and appears in the editor list
- Confirm existing export flow still works

- [ ] **Step 5: Completion checkpoint**

Checkpoint note: `feat: ship report insight panel with accurate suggestion flow`

---

## Self-Review

- Spec coverage: 화면 구조, API, 정확성 규칙, ignore 저장, 프런트 연결, 테스트 전략을 모두 포함한다.
- Placeholder scan: `TBD`, `TODO`, vague task wording 없음.
- Type consistency: `ReportInsights`, `ReportInsightDraft`, `AcceptInsightActivity`, `IgnoreInsightActivity` 이름을 계획 전반에서 동일하게 사용한다.
