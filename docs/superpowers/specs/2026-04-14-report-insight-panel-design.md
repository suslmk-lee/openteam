# Report Insight Panel Design

**Goal:** 보고서 편집 화면에 `인사이트 패널`을 추가해, 사용자가 보고서를 열자마자 미반영 활동과 자동 초안 후보를 확인하고 정확하게 반영할 수 있게 한다.

**Context:** 현재 제품은 Gmail, Google Calendar, Linear, 팀 운영 데이터, 수동 입력을 모아 주간 보고서를 만들 수 있다. 하지만 사용자는 무엇이 빠졌는지 직접 확인해야 하고, AI 전처리는 편집 이후에 수동으로 실행해야 한다. 이 기능은 그 공백을 메우는 정확성 우선의 도우미다.

## Problem

현재 흐름은 다음과 같다.

- `ReportCreate`에서 활동을 확인하고 일부를 보고서로 추가한다.
- `ReportEditor`에서 섹션별로 편집하고 AI 전처리나 Excel export를 수동 실행한다.

이 구조의 한계는 분명하다.

- 어떤 활동이 아직 보고서에 안 들어갔는지 한눈에 알 수 없다.
- 이미 반영된 활동과 빠진 활동을 사람이 직접 대조해야 한다.
- AI는 문장을 다듬어주지만, 빠진 근거를 먼저 찾아주지는 못한다.

## Design Principles

- 정확성이 최우선이다.
- 자동화는 `제안`까지만 한다. 본문 반영은 사용자가 승인한다.
- 애매하면 자동으로 넣지 않고 `검토 필요`로 보낸다.
- 모든 초안 후보는 근거 활동을 함께 보여준다.
- 기존 편집기와 export 흐름을 유지하고, 그 앞단에 인사이트 레이어를 추가한다.

## User Experience

기능은 [ReportEditor.tsx](D:/workspace/openreport-codex/frontend/src/pages/ReportEditor.tsx) 상단에 `인사이트 패널`을 추가하는 방식으로 제공한다.

### 1. Insight Summary

헤더 바로 아래에 3개의 상태 카드를 둔다.

- `반영률`: 이번 주 활동 총수, 연결된 활동 수
- `미반영`: 아직 보고서에 안 들어간 활동 수
- `검토 필요`: 이미 반영되었을 수도 있지만 확정할 수 없는 활동 수

이 영역은 사용자가 3초 안에 현재 보고서의 완성 상태를 이해하도록 만든다.

### 2. Unlinked Activities Panel

메인 영역은 `미반영 활동` 리스트다. 각 카드에는 아래 정보가 보인다.

- 소스 아이콘
- 제목
- 날짜
- 짧은 요약
- 추천 섹션
- 추천 이유

각 카드에는 아래 액션을 제공한다.

- `이번 주에 추가`
- `다음 주에 추가`
- `이슈로 추가`
- `무시`

버튼은 내부 섹션 키가 아니라 사용자 언어로 노출한다.

### 3. Draft Candidates Panel

`미반영 활동` 아래에 접을 수 있는 `초안 후보` 패널을 둔다.

각 초안 후보는 아래 정보를 가진다.

- 제안 문장
- 추천 섹션
- 추천 이유
- 근거 활동 수
- `근거 보기`
- `채택`
- `수정 후 채택`

초안 후보는 자동 반영하지 않는다. 사용자가 확인 후 승인해야만 보고서 본문으로 내려간다.

### 4. Existing Report Editor

기존 섹션별 편집 UI는 그대로 유지한다. 인사이트 패널에서 채택한 항목은 기존 `report_items`로 저장되고, 이후 사용자는 기존 편집 흐름대로 수정하거나 삭제할 수 있다.

## Architecture

이 기능은 3개의 논리 레이어로 나뉜다.

### Evidence Layer

원본 활동 데이터다.

- Gmail
- Google Calendar
- Linear
- 팀 운영 데이터
- 수동 입력

이 레이어는 사실 데이터만 가진다.

### Insight Layer

현재 기능의 핵심 계산 레이어다.

- 활동과 `report_items`를 비교한다.
- `이미 반영됨`, `미반영`, `검토 필요`를 계산한다.
- 미반영 활동만 대상으로 초안 후보를 만든다.

이 레이어는 보고서를 직접 수정하지 않는다.

### Report Layer

기존 보고서 본문 레이어다.

- 사용자가 `채택`, `추가`, `무시`를 선택했을 때만 변경된다.

## Backend Design

### Core Response Models

```go
type ReportInsightSummary struct {
    TotalActivities    int `json:"totalActivities"`
    LinkedActivities   int `json:"linkedActivities"`
    UnlinkedActivities int `json:"unlinkedActivities"`
    NeedsReview        int `json:"needsReview"`
}

type ReportInsightActivity struct {
    ActivityID        int64    `json:"activityId"`
    Source            string   `json:"source"`
    Title             string   `json:"title"`
    Summary           string   `json:"summary"`
    ActivityDate      string   `json:"activityDate"`
    SuggestedSection  string   `json:"suggestedSection"`
    SuggestedCategory string   `json:"suggestedCategory"`
    SuggestedWorkType string   `json:"suggestedWorkType"`
    Reason            string   `json:"reason"`
    Signals           []string `json:"signals"`
}

type ReportInsightDraft struct {
    Key               string  `json:"key"`
    SuggestedSection  string  `json:"suggestedSection"`
    SuggestedCategory string  `json:"suggestedCategory"`
    SuggestedWorkType string  `json:"suggestedWorkType"`
    Content           string  `json:"content"`
    ActivityIDs       []int64 `json:"activityIds"`
    Reason            string  `json:"reason"`
}

type ReportInsights struct {
    Summary            ReportInsightSummary    `json:"summary"`
    UnlinkedActivities []ReportInsightActivity `json:"unlinkedActivities"`
    DraftCandidates    []ReportInsightDraft    `json:"draftCandidates"`
    NeedsReview        []ReportInsightActivity `json:"needsReview"`
}
```

### API Surface

아래 3개 API면 충분하다.

```go
func (a *App) GetReportInsights(reportID int64) (*ReportInsights, error)
func (a *App) AcceptInsightActivity(reportID int64, activityID int64, section, category, period string) (*db.ReportItem, error)
func (a *App) AcceptInsightDraft(reportID int64, draft ReportInsightDraft, period string) ([]db.ReportItem, error)
```

### Placement

- `service_report.go`
  오케스트레이션과 Wails 바인딩 대상 메서드
- `internal/reportinsights/insights.go`
  분류 규칙과 초안 후보 계산
- `handlers_report.go`
  얇은 위임만 유지

## Accuracy Rules

### Unlinked

아래 조건을 모두 만족할 때만 `미반영`으로 본다.

- 해당 `activity_id`가 현재 보고서의 어떤 `report_item`에도 직접 연결되어 있지 않다.
- 같은 외부 식별자나 토픽으로 묶인 기존 통합 결과에 포함된 흔적이 없다.
- 사용자가 명시적으로 무시한 기록이 없다.

### Needs Review

아래 조건 중 하나라도 만족하면 `검토 필요`로 보낸다.

- `activity_id` 직접 연결은 없지만 제목이나 토픽이 기존 보고서 문장과 강하게 유사하다.
- 동일한 issue key, thread id, ticket id, parent id가 기존 요약 문장에 포함됐을 가능성이 있다.
- 같은 날짜, 같은 출처, 같은 핵심 키워드가 이미 반영되어 있다.

### Draft Candidates

초안 후보는 `미반영`으로 확정된 활동에서만 만든다.

- 같은 프로젝트나 카테고리로 추정되는 활동
- 같은 토픽 식별자를 공유하는 활동
- 같은 주 내에서 핵심 키워드가 유사한 활동

너무 이질적인 활동은 억지로 합치지 않는다. 첫 버전은 한 후보당 2~4개 정도의 근거 활동만 묶는다.

### Section Recommendation

- 활성 Linear 이슈, 프로젝트 관련 메일/캘린더
  -> `project_progress`
- `todo`, `backlog`, 미래 일정, 후속 약속
  -> `next_week_plan`
- 위험, 장애, 지연, 문의, 클레임 신호
  -> `issues`
- 근태 신호
  -> `attendance`
- 나머지
  -> `other`

추천 결과에는 항상 이유를 붙인다.

## Ignore Handling

첫 버전부터 `무시` 기능이 필요하다. 같은 항목을 매번 다시 보여주면 제품 신뢰가 떨어진다.

권장 저장 구조는 별도 테이블이다.

```sql
CREATE TABLE report_insight_ignores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    activity_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(report_id, activity_id)
)
```

이 구조는 `이번 보고서에서만 무시` 정책을 가장 단순하게 지원한다.

## Frontend Design Mapping

추가/수정이 필요한 위치는 아래와 같다.

- [ReportEditor.tsx](D:/workspace/openreport-codex/frontend/src/pages/ReportEditor.tsx)
  인사이트 패널과 채택 액션 UI 추가
- 새 파일 예: `frontend/src/services/reportInsightService.ts`
  인사이트 API 래퍼
- 새 파일 예: `frontend/src/hooks/useReportInsights.ts`
  조회와 액션 상태 관리

## Rollout Scope

### V1

- 상단 인사이트 요약
- 미반영 활동 패널
- 검토 필요 패널
- 초안 후보 패널
- 활동 1건 채택
- 초안 후보 채택
- 무시

### Excluded From V1

- 자동 삽입
- 배치 채택
- 알림/스케줄 실행
- 학습형 개인화
- 점수 기반 복잡 추천 모델

## Testing Strategy

반드시 테스트해야 하는 핵심 시나리오는 아래다.

- `activity_id`가 연결된 활동은 미반영으로 나오지 않는다.
- 토픽이 유사하지만 확신할 수 없는 활동은 `검토 필요`로 간다.
- 무시한 활동은 다시 노출되지 않는다.
- 초안 후보는 미반영 활동만 포함한다.
- 초안 채택 시 기존 `report_items`가 올바른 period/section으로 저장된다.

## Risks

- 유사도 판정이 느슨하면 이미 반영된 활동이 다시 추천될 수 있다.
- AI 후보가 근거 없이 요약되면 정확성 우선 원칙이 깨진다.
- 인사이트 패널이 과도하게 크면 기존 편집기 사용성이 떨어질 수 있다.

대응은 단순하다.

- 첫 버전은 규칙 기반 판정을 우선한다.
- AI는 후보 생성에만 사용하고, 본문 반영은 항상 사용자 승인으로 제한한다.
- 패널은 접기/펼치기 가능하게 둔다.
