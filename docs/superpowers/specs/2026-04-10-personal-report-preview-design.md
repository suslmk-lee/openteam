# 개인용 주간보고서 MD 미리보기 & 팀유형별 템플릿 설계

**날짜**: 2026-04-10  
**브랜치**: calandar  
**범위**: 개인(personal) 팀유형 중심, 전 팀유형 공통 개선 포함

---

## 배경 및 목표

OpenReport는 Linear, Gmail, Google Calendar 데이터를 수집해 주간업무보고서를 Excel로 출력하는 앱이다. 현재 흐름은:

1. 동기화 → 활동 목록
2. 개별 선택 → ReportItems 저장
3. ReportEditor에서 편집
4. Excel 내보내기

**이번 개선 목표**:
- ReportEditor에 MD 미리보기 탭 추가 (편집/미리보기 전환)
- 개인용은 단순 포맷(금주 한 일 / 차주 계획 / 특이사항), 팀 유형은 현행 섹션 유지
- 미리보기 탭에서 AI 다듬기(OpenAI) + MD 클립보드 복사
- Excel 템플릿을 팀유형별로 별도 업로드 가능하도록 개선

---

## 아키텍처 개요

```
ReportItems (기존 개별 선택 방식 유지)
    ↓ generateMarkdown(items, teamType, weekInfo)  [프론트엔드]
MD 문자열
    ↓ [AI 다듬기] RefineMarkdownWithAI(mdText)  [Go → OpenAI]
다듬어진 MD → react-markdown 렌더링 + 클립보드 복사
    ↓ [Excel 내보내기]
GetExcelTemplateForType(teamType) → 팀유형별 템플릿 → .xlsx
```

---

## Section 1: ReportEditor UI

### 탭 구조

헤더 좌측에 탭 전환:
- **편집** 탭: 현행 ReportItems 편집 UI (변경 없음)
- **미리보기** 탭: MD 렌더링 영역

헤더 우측 버튼 (미리보기 탭 활성 시):
- **AI 다듬기**: 현재 MD를 백엔드로 전송 → OpenAI 처리 → 미리보기 갱신
- **MD 복사**: 현재 미리보기 MD를 클립보드에 복사
- **Excel 내보내기**: 기존 흐름 유지 (항상 표시)

### 상태 관리

```typescript
const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
const [markdownText, setMarkdownText] = useState('')       // 생성된 MD
const [refinedMarkdown, setRefinedMarkdown] = useState('') // AI 다듬기 결과
const [isRefining, setIsRefining] = useState(false)
```

미리보기 탭 전환 시 `generateMarkdown(items, teamType, weekInfo)` 호출 → `markdownText` 설정.  
AI 다듬기 후 `refinedMarkdown` 설정. 표시 우선순위: `refinedMarkdown || markdownText`.

### 변경 파일
- `frontend/src/pages/ReportEditor.tsx`

---

## Section 2: MD 생성 로직

`generateMarkdown(items, teamType, weekInfo)` 함수를 `ReportEditor.tsx` 내부에 정의.

### 개인용 포맷 (`teamType === 'personal'`)

```markdown
# 주간업무보고 | 2026-04-07 ~ 04-11

## 금주 한 일
- [Gmail 발신] 외부 미팅 일정 조율 메일 발송
- [Linear] ENG-123 로그인 기능 구현 완료
- [Google 캘린더] 팀 미팅 참석 (04-07)

## 차주 계획
- ENG-124 대시보드 UI 작업

## 특이사항
- (없음)
```

**매핑 규칙**:
- `period === 'this_week'` + `section !== 'issues'` → **금주 한 일** (`[sourceLabel] content` 형태)
- `period === 'next_week'` → **차주 계획**
- `section === 'issues'` → **특이사항** (없으면 `(없음)`)

### 팀 유형 포맷 (`si_business`, `si_field`, `small_team`)

```markdown
# 주간업무보고 | 2026-04-07 ~ 04-11

## 프로젝트 진행사항
### [카테고리명]
- 내용

## 차주 계획
- 내용

## 이슈/리스크
- 내용
```

현재 `SECTIONS` 배열 순서(`project_progress`, `next_week_plan`, `issues`, `business_dev`, `attendance`, `hiring`, `other`) 그대로 렌더링. 항목이 없는 섹션은 생략.

### 변경 파일
- `frontend/src/pages/ReportEditor.tsx` (함수 내부 정의)

---

## Section 3: AI 다듬기

### 백엔드

`handlers.go`에 신규 메서드 추가:

```go
func (a *App) RefineMarkdownWithAI(markdownText string) (string, error)
```

- 기존 `getOpenAIConfig()` 재사용
- 시스템 프롬프트: "주간업무보고서를 자연스러운 한국어 보고서체로 다듬어라. 구조(##, - 등)는 유지하고 내용만 교정한다."
- 원본 ReportItems는 변경하지 않음 — 미리보기 전용

### 프론트엔드 호출

```typescript
import { RefineMarkdownWithAI } from '../../wailsjs/go/main/App'

async function handleRefine() {
  setIsRefining(true)
  try {
    const result = await RefineMarkdownWithAI(markdownText)
    setRefinedMarkdown(result)
  } finally {
    setIsRefining(false)
  }
}
```

### 변경 파일
- `handlers.go`
- `wailsjs/` (재생성)

---

## Section 4: 팀유형별 Excel 템플릿

### DB 스키마 변경 (`database.go`)

```sql
ALTER TABLE excel_templates ADD COLUMN team_type TEXT NOT NULL DEFAULT 'default';
```

- 기존 템플릿 레코드: `team_type = 'default'`로 마이그레이션
- `personal` 팀유형은 별도 레코드로 저장

### 백엔드 변경 (`handlers.go`, `repository.go`)

기존 메서드는 유지하되 내부적으로 teamType을 인식하도록 변경:

```go
// 신규
func (a *App) UploadExcelTemplateForType(teamType string) (string, error)
func (a *App) GetExcelTemplateForType(teamType string) (*db.ExcelTemplate, error)
// teamType에 해당하는 템플릿이 없으면 'default' 폴백
```

`ExportWeeklyReport(reportID)` 내부에서:
1. 현재 user의 teamType 조회
2. `GetExcelTemplateForType(teamType)` 호출
3. 없으면 `default` 템플릿 사용

### Settings UI 변경 (`Settings.tsx`, template 섹션)

```
템플릿 관리
├── 기본 템플릿 (공통)     현재파일명.xlsx  [업로드] [삭제]
└── 개인용 템플릿          현재파일명.xlsx  [업로드] [삭제]
    ※ 없을 경우 기본 템플릿 사용
```

개인용 팀유형일 때만 "개인용 템플릿" 섹션 표시.

### 변경 파일
- `internal/db/database.go`
- `internal/db/repository.go`
- `handlers.go`
- `frontend/src/pages/Settings.tsx`
- `wailsjs/` (재생성)

---

## 변경 파일 전체 목록

| 파일 | 변경 유형 |
|------|----------|
| `frontend/src/pages/ReportEditor.tsx` | 탭 UI, MD 생성, AI 다듬기, MD 복사 |
| `handlers.go` | `RefineMarkdownWithAI`, `UploadExcelTemplateForType`, `GetExcelTemplateForType` |
| `internal/db/database.go` | `team_type` 컬럼 마이그레이션 |
| `internal/db/repository.go` | 템플릿 CRUD에 teamType 파라미터 |
| `frontend/src/pages/Settings.tsx` | 팀유형별 템플릿 업로드 UI |
| `frontend/wailsjs/` | 바인딩 재생성 (자동) |

---

## 의존성

- `react-markdown`: MD 렌더링 — **미설치, 추가 필요** (`npm install react-markdown`)
- OpenAI API Key: 기존 설정 재사용 (AI 다듬기 기능은 API Key 없으면 버튼 비활성)

---

## 범위 외 (이번 구현에서 제외)

- 데이터 자동 일괄 반영 (개별 선택 방식 유지)
- 팀 유형별 MD 포맷 커스터마이징 UI
- AI 다듬기 결과를 ReportItems에 역반영
