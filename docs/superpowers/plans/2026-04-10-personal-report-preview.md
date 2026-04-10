# Personal Report MD Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ReportEditor에 MD 미리보기 탭을 추가하고, AI 다듬기·클립보드 복사·팀유형별 Excel 템플릿을 지원한다.

**Architecture:** 프론트엔드에서 ReportItems → MD 문자열 생성(팀유형 분기), react-markdown으로 렌더링. AI 다듬기는 Go 핸들러(`RefineMarkdownWithAI`)가 OpenAI로 전달하고 결과를 반환. Excel 템플릿은 DB에 `team_type` 컬럼을 추가해 팀유형별로 분리 저장.

**Tech Stack:** React 19, TypeScript, react-markdown, Go, SQLite (modernc), Wails v2, OpenAI API

---

## File Map

| 파일 | 역할 |
|------|------|
| `frontend/package.json` | react-markdown 의존성 추가 |
| `internal/db/models.go` | `ExcelTemplate.TeamType` 필드 추가 |
| `internal/db/database.go` | `excel_templates.team_type` 컬럼 마이그레이션 |
| `internal/db/repository.go` | `GetExcelTemplateByType`, `SaveExcelTemplateByType` 추가 |
| `handlers.go` | `RefineMarkdownWithAI`, `UploadExcelTemplateForType`, `GetExcelTemplateForType` 추가; `ExportWeeklyReport` 수정 |
| `frontend/wailsjs/` | wails dev 실행으로 자동 재생성 |
| `frontend/__tests__/unit/generateMarkdown.test.ts` | MD 생성 로직 단위 테스트 (신규) |
| `frontend/src/pages/ReportEditor.tsx` | 탭 UI, MD 생성 함수, 미리보기, AI 다듬기, MD 복사 |
| `frontend/src/pages/Settings.tsx` | 팀유형별 템플릿 업로드 UI |

---

## Task 1: react-markdown 설치

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 패키지 설치**

```bash
cd frontend && npm install react-markdown
```

Expected output: `added 1 package` (또는 관련 패키지들)

- [ ] **Step 2: 설치 확인**

```bash
grep "react-markdown" frontend/package.json
```

Expected: `"react-markdown": "^x.x.x"` 라인 출력

- [ ] **Step 3: 커밋**

```bash
rtk git add frontend/package.json frontend/package-lock.json
rtk git commit -m "chore: add react-markdown dependency"
```

---

## Task 2: DB 마이그레이션 — excel_templates.team_type 컬럼 추가

**Files:**
- Modify: `internal/db/database.go`

- [ ] **Step 1: migrate() 함수에 헬퍼 및 마이그레이션 추가**

`internal/db/database.go`의 `migrate()` 함수 끝 부분(migrations 슬라이스 이후)에 컬럼 존재 여부를 확인 후 추가하는 로직을 삽입한다.

현재 `migrate()` 함수에서 `for _, m := range migrations { ... }` 루프가 끝난 직후에 아래를 추가:

```go
	// Idempotent column additions (ALTER TABLE IF NOT EXISTS is not supported in SQLite)
	if err := d.addColumnIfNotExists("excel_templates", "team_type", "TEXT NOT NULL DEFAULT 'default'"); err != nil {
		return fmt.Errorf("failed to add team_type column: %w", err)
	}

	return nil
}

func (d *Database) addColumnIfNotExists(table, column, definition string) error {
	rows, err := d.conn.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notNull int
		var dfltValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dfltValue, &pk); err != nil {
			return err
		}
		if name == column {
			return nil // 이미 존재
		}
	}
	_, err = d.conn.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
	return err
}
```

> **주의:** 현재 `migrate()` 마지막에 `return nil`이 있다면 그 앞에 위 코드를 삽입한다. `addColumnIfNotExists`는 `migrate()` 닫는 `}` 이후 새 메서드로 추가.

- [ ] **Step 2: 빌드 확인**

```bash
go build ./...
```

Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
rtk git add internal/db/database.go
rtk git commit -m "feat: add team_type column to excel_templates via idempotent migration"
```

---

## Task 3: ExcelTemplate 모델 및 Repository 업데이트

**Files:**
- Modify: `internal/db/models.go`
- Modify: `internal/db/repository.go`

- [ ] **Step 1: ExcelTemplate 모델에 TeamType 추가**

`internal/db/models.go`의 `ExcelTemplate` struct:

```go
type ExcelTemplate struct {
	ID            int64     `json:"id"`
	UserID        int64     `json:"userId"`
	TeamType      string    `json:"teamType"`
	Name          string    `json:"name"`
	FilePath      string    `json:"filePath"`
	StructureJSON string    `json:"structureJson"`
	CreatedAt     time.Time `json:"createdAt"`
}
```

- [ ] **Step 2: 기존 SaveExcelTemplate 수정**

`internal/db/repository.go`의 `SaveExcelTemplate`:

```go
func (d *Database) SaveExcelTemplate(t *ExcelTemplate) (int64, error) {
	if t.TeamType == "" {
		t.TeamType = "default"
	}
	if t.ID > 0 {
		_, err := d.conn.Exec(
			"UPDATE excel_templates SET name=?, file_path=?, structure_json=?, team_type=? WHERE id=?",
			t.Name, t.FilePath, t.StructureJSON, t.TeamType, t.ID,
		)
		return t.ID, err
	}
	res, err := d.conn.Exec(
		"INSERT INTO excel_templates (user_id, name, file_path, structure_json, team_type) VALUES (?, ?, ?, ?, ?)",
		t.UserID, t.Name, t.FilePath, t.StructureJSON, t.TeamType,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}
```

- [ ] **Step 3: 기존 GetExcelTemplate 수정 (team_type 컬럼 포함 스캔)**

```go
func (d *Database) GetExcelTemplate(userID int64) (*ExcelTemplate, error) {
	t := &ExcelTemplate{}
	err := d.conn.QueryRow(
		"SELECT id, user_id, COALESCE(team_type, 'default'), name, file_path, structure_json, created_at FROM excel_templates WHERE user_id = ? ORDER BY id DESC LIMIT 1",
		userID,
	).Scan(&t.ID, &t.UserID, &t.TeamType, &t.Name, &t.FilePath, &t.StructureJSON, &t.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return t, nil
}
```

- [ ] **Step 4: GetExcelTemplateByType 추가**

`internal/db/repository.go`에 추가:

```go
// GetExcelTemplateByType returns the template for the given teamType.
// Falls back to 'default' if no teamType-specific template exists.
func (d *Database) GetExcelTemplateByType(userID int64, teamType string) (*ExcelTemplate, error) {
	if teamType == "" {
		teamType = "default"
	}
	t := &ExcelTemplate{}
	err := d.conn.QueryRow(
		"SELECT id, user_id, COALESCE(team_type, 'default'), name, file_path, structure_json, created_at FROM excel_templates WHERE user_id = ? AND team_type = ? ORDER BY id DESC LIMIT 1",
		userID, teamType,
	).Scan(&t.ID, &t.UserID, &t.TeamType, &t.Name, &t.FilePath, &t.StructureJSON, &t.CreatedAt)
	if err == sql.ErrNoRows {
		if teamType == "default" {
			return nil, nil
		}
		// fallback to default
		return d.GetExcelTemplateByType(userID, "default")
	}
	if err != nil {
		return nil, err
	}
	return t, nil
}
```

- [ ] **Step 5: 빌드 확인**

```bash
go build ./...
```

Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
rtk git add internal/db/models.go internal/db/repository.go
rtk git commit -m "feat: add TeamType to ExcelTemplate model and repository"
```

---

## Task 4: 핸들러 — 팀유형별 템플릿 업로드/조회 및 ExportWeeklyReport 수정

**Files:**
- Modify: `handlers.go`

- [ ] **Step 1: UploadExcelTemplateForType 추가**

`handlers.go`의 `UploadExcelTemplate()` 메서드 바로 아래에 추가:

```go
func (a *App) UploadExcelTemplateForType(teamType string) (string, error) {
	if teamType == "" {
		teamType = "default"
	}
	selection, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Excel 템플릿 선택",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Excel Files", Pattern: "*.xlsx;*.xls"},
		},
	})
	if err != nil {
		return "", err
	}
	if selection == "" {
		return "", nil
	}

	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return "", err
	}

	destDir := filepath.Join(a.dataDir, "templates")
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", err
	}

	destName := fmt.Sprintf("%s_%s", teamType, filepath.Base(selection))
	destPath := filepath.Join(destDir, destName)
	if err := copyFile(selection, destPath); err != nil {
		return "", fmt.Errorf("failed to copy template: %w", err)
	}

	ts, err := excel.ParseTemplate(destPath)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	structJSON, err := excel.StructureToJSON(ts)
	if err != nil {
		return "", err
	}

	// Find existing template for this teamType to update instead of insert
	existing, _ := a.database.GetExcelTemplateByType(user.ID, teamType)
	tmpl := &db.ExcelTemplate{
		UserID:        user.ID,
		TeamType:      teamType,
		Name:          filepath.Base(selection),
		FilePath:      destPath,
		StructureJSON: structJSON,
	}
	if existing != nil {
		tmpl.ID = existing.ID
	}

	_, err = a.database.SaveExcelTemplate(tmpl)
	if err != nil {
		return "", err
	}

	log.Printf("Template uploaded for teamType=%s: %s", teamType, tmpl.Name)
	return structJSON, nil
}
```

- [ ] **Step 2: GetExcelTemplateForType 추가**

```go
func (a *App) GetExcelTemplateForType(teamType string) (*db.ExcelTemplate, error) {
	user, err := a.database.GetOrCreateDefaultUser()
	if err != nil {
		return nil, err
	}
	return a.database.GetExcelTemplateByType(user.ID, teamType)
}
```

- [ ] **Step 3: ExportWeeklyReport에서 팀유형 반영**

`ExportWeeklyReport` 함수 내 `tmpl, err := a.database.GetExcelTemplate(user.ID)` 부분을 팀유형 조회로 교체:

기존:
```go
tmpl, err := a.database.GetExcelTemplate(user.ID)
```

변경:
```go
profile, _ := a.database.GetTeamProfile(user.ID)
teamType := "default"
if profile != nil && profile.TeamType != "" {
    teamType = profile.TeamType
}
tmpl, err := a.database.GetExcelTemplateByType(user.ID, teamType)
```

- [ ] **Step 4: 빌드 확인**

```bash
go build ./...
```

Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
rtk git add handlers.go
rtk git commit -m "feat: add team-type-aware template upload/export handlers"
```

---

## Task 5: RefineMarkdownWithAI 핸들러 추가

**Files:**
- Modify: `handlers.go`

- [ ] **Step 1: RefineMarkdownWithAI 메서드 추가**

`handlers.go`에서 `getOpenAIConfig()` 메서드 바로 아래에 추가:

```go
// RefineMarkdownWithAI sends the markdown report to OpenAI for polishing.
// It returns the refined markdown. Original ReportItems are not modified.
func (a *App) RefineMarkdownWithAI(markdownText string) (string, error) {
	cfg, err := a.getOpenAIConfig()
	if err != nil {
		return "", fmt.Errorf("OpenAI 설정 조회 실패: %w", err)
	}
	if cfg == nil {
		return "", fmt.Errorf("OpenAI API Key가 설정되지 않았습니다. 설정 > 연동 설정에서 OpenAI를 등록해주세요.")
	}

	systemPrompt := "당신은 한국어 업무 보고서 작성 전문가입니다. 주어진 주간업무보고서 마크다운을 자연스럽고 간결한 한국어 보고서체로 다듬어주세요. 마크다운 구조(##, - 등)는 그대로 유지하고 내용만 교정합니다. 원본에 없는 내용을 추가하지 마세요."

	client := ai.NewClient(cfg.APIKey, cfg.Model)
	refined, err := client.ChatCompletion(systemPrompt, markdownText)
	if err != nil {
		return "", fmt.Errorf("AI 다듬기 실패: %w", err)
	}
	return refined, nil
}
```

- [ ] **Step 2: ai.Client에 ChatCompletion 메서드 존재 여부 확인**

```bash
grep -n "ChatCompletion\|func.*Client" internal/ai/openai.go | head -20
```

`ChatCompletion` 메서드가 없으면 Step 3으로 이동. 있으면 Step 4로.

- [ ] **Step 3: ChatCompletion 메서드가 없을 경우 — openai.go에 추가**

`internal/ai/openai.go`에 추가:

```go
// ChatCompletion sends a system prompt + user message to the OpenAI chat API.
func (c *Client) ChatCompletion(systemPrompt, userMessage string) (string, error) {
	reqBody := map[string]interface{}{
		"model": c.model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMessage},
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Error != nil {
		return "", fmt.Errorf("openai error: %s", result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("openai returned empty response")
	}
	return result.Choices[0].Message.Content, nil
}
```

필요한 import(`bytes`, `encoding/json`, `fmt`, `net/http`)가 `openai.go`에 없으면 추가.

- [ ] **Step 4: 빌드 확인**

```bash
go build ./...
```

Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
rtk git add handlers.go internal/ai/
rtk git commit -m "feat: add RefineMarkdownWithAI handler and ChatCompletion to AI client"
```

---

## Task 6: Wails 바인딩 재생성

**Files:**
- Auto-regenerate: `frontend/wailsjs/`

- [ ] **Step 1: wails dev 실행하여 바인딩 재생성**

```bash
wails dev
```

앱이 실행되면 `frontend/wailsjs/go/main/App.d.ts`와 `App.js`에 신규 메서드가 추가됐는지 확인 후 앱 종료(Ctrl+C).

- [ ] **Step 2: 신규 메서드 확인**

```bash
grep -E "RefineMarkdownWithAI|UploadExcelTemplateForType|GetExcelTemplateForType" frontend/wailsjs/go/main/App.d.ts
```

Expected: 3개 메서드 모두 출력

- [ ] **Step 3: 커밋**

```bash
rtk git add frontend/wailsjs/
rtk git commit -m "chore: regenerate wails bindings for new handlers"
```

---

## Task 7: generateMarkdown 함수 — TDD

**Files:**
- Create: `frontend/__tests__/unit/generateMarkdown.test.ts`
- Modify: `frontend/src/pages/ReportEditor.tsx` (함수 추출)

- [ ] **Step 1: 테스트 파일 작성**

`frontend/__tests__/unit/generateMarkdown.test.ts` 생성:

```typescript
import { describe, it, expect } from 'vitest'
import { generateMarkdown } from '../../src/utils/generateMarkdown'

const weekInfo = { weekStart: '2026-04-07', weekEnd: '2026-04-11', label: '2026년 15주차' }

const makeItem = (overrides: Partial<Parameters<typeof generateMarkdown>[0][0]>) => ({
  id: 1,
  reportId: 1,
  section: 'project_progress',
  category: '',
  workType: '',
  content: '기본 업무 내용',
  period: 'this_week',
  sortOrder: 0,
  isSelected: true,
  ...overrides,
})

describe('generateMarkdown — personal', () => {
  it('제목에 주간 날짜 범위가 포함된다', () => {
    const md = generateMarkdown([], 'personal', weekInfo)
    expect(md).toContain('2026-04-07 ~ 2026-04-11')
  })

  it('this_week + non-issues 항목은 금주 한 일에 들어간다', () => {
    const items = [makeItem({ content: '로그인 기능 구현', period: 'this_week', section: 'project_progress' })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).toContain('## 금주 한 일')
    expect(md).toContain('로그인 기능 구현')
  })

  it('next_week 항목은 차주 계획에 들어간다', () => {
    const items = [makeItem({ content: '대시보드 UI 작업', period: 'next_week' })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).toContain('## 차주 계획')
    expect(md).toContain('대시보드 UI 작업')
  })

  it('issues 섹션 항목은 특이사항에 들어간다', () => {
    const items = [makeItem({ section: 'issues', content: '배포 서버 장애', period: 'this_week' })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).toContain('## 특이사항')
    expect(md).toContain('배포 서버 장애')
  })

  it('특이사항 항목이 없으면 (없음)을 표시한다', () => {
    const md = generateMarkdown([], 'personal', weekInfo)
    expect(md).toContain('(없음)')
  })

  it('isSelected=false 항목은 제외된다', () => {
    const items = [makeItem({ content: '제외될 항목', isSelected: false })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).not.toContain('제외될 항목')
  })

  it('category가 있으면 [category] 태그를 붙인다', () => {
    const items = [makeItem({ content: '기능 개발', category: 'OpenReport' })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).toContain('[OpenReport] 기능 개발')
  })
})

describe('generateMarkdown — team (si_business)', () => {
  it('SECTIONS 순서대로 섹션 헤더가 렌더링된다', () => {
    const items = [
      makeItem({ section: 'project_progress', content: '진행 업무' }),
      makeItem({ section: 'issues', content: '이슈 내용', period: 'this_week' }),
    ]
    const md = generateMarkdown(items, 'si_business', weekInfo)
    const progressIdx = md.indexOf('## 프로젝트 진행사항')
    const issueIdx = md.indexOf('## 이슈/리스크')
    expect(progressIdx).toBeGreaterThan(-1)
    expect(issueIdx).toBeGreaterThan(progressIdx)
  })

  it('항목이 없는 섹션은 출력하지 않는다', () => {
    const items = [makeItem({ section: 'project_progress', content: '진행 업무' })]
    const md = generateMarkdown(items, 'si_business', weekInfo)
    expect(md).not.toContain('## 이슈/리스크')
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd frontend && npm run test:run -- generateMarkdown
```

Expected: `Cannot find module '../../src/utils/generateMarkdown'` 에러

- [ ] **Step 3: generateMarkdown 유틸 함수 구현**

`frontend/src/utils/generateMarkdown.ts` 파일 생성:

```typescript
export interface ReportItemForMD {
  id: number
  reportId: number
  section: string
  category: string
  workType: string
  content: string
  period: string
  sortOrder: number
  isSelected: boolean
}

export interface WeekInfoForMD {
  weekStart: string
  weekEnd: string
  label: string
}

const SECTION_LABELS: Record<string, string> = {
  project_progress: '프로젝트 진행사항',
  next_week_plan: '차주 계획',
  issues: '이슈/리스크',
  business_dev: '사업개발/영업',
  attendance: '근태',
  hiring: '인력채용',
  other: '기타',
}

const SECTION_ORDER = [
  'project_progress',
  'next_week_plan',
  'issues',
  'business_dev',
  'attendance',
  'hiring',
  'other',
]

export function generateMarkdown(
  items: ReportItemForMD[],
  teamType: string,
  weekInfo: WeekInfoForMD,
): string {
  const selected = items.filter(i => i.isSelected)
  const header = `# 주간업무보고 | ${weekInfo.weekStart} ~ ${weekInfo.weekEnd}\n\n`

  if (teamType === 'personal') {
    return header + generatePersonalMarkdown(selected)
  }
  return header + generateTeamMarkdown(selected)
}

function generatePersonalMarkdown(items: ReportItemForMD[]): string {
  const thisWeek = items.filter(i => i.period !== 'next_week' && i.section !== 'issues')
  const nextWeek = items.filter(i => i.period === 'next_week')
  const issues = items.filter(i => i.section === 'issues')

  const lines: string[] = []

  lines.push('## 금주 한 일')
  if (thisWeek.length === 0) {
    lines.push('- (없음)')
  } else {
    thisWeek.forEach(item => {
      const tag = item.category ? `[${item.category}] ` : ''
      lines.push(`- ${tag}${item.content}`)
    })
  }

  lines.push('')
  lines.push('## 차주 계획')
  if (nextWeek.length === 0) {
    lines.push('- (없음)')
  } else {
    nextWeek.forEach(item => {
      const tag = item.category ? `[${item.category}] ` : ''
      lines.push(`- ${tag}${item.content}`)
    })
  }

  lines.push('')
  lines.push('## 특이사항')
  if (issues.length === 0) {
    lines.push('- (없음)')
  } else {
    issues.forEach(item => lines.push(`- ${item.content}`))
  }

  return lines.join('\n')
}

function generateTeamMarkdown(items: ReportItemForMD[]): string {
  const bySectionAndCategory = new Map<string, Map<string, string[]>>()

  items.forEach(item => {
    if (!bySectionAndCategory.has(item.section)) {
      bySectionAndCategory.set(item.section, new Map())
    }
    const catMap = bySectionAndCategory.get(item.section)!
    const catKey = item.category || ''
    if (!catMap.has(catKey)) catMap.set(catKey, [])
    catMap.get(catKey)!.push(item.content)
  })

  const lines: string[] = []

  SECTION_ORDER.forEach(section => {
    const catMap = bySectionAndCategory.get(section)
    if (!catMap || catMap.size === 0) return

    lines.push(`## ${SECTION_LABELS[section] || section}`)
    catMap.forEach((contents, cat) => {
      if (cat) lines.push(`### ${cat}`)
      contents.forEach(c => lines.push(`- ${c}`))
    })
    lines.push('')
  })

  return lines.join('\n').trimEnd()
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd frontend && npm run test:run -- generateMarkdown
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
rtk git add frontend/__tests__/unit/generateMarkdown.test.ts frontend/src/utils/generateMarkdown.ts
rtk git commit -m "feat: add generateMarkdown utility with personal/team format and tests"
```

---

## Task 8: ReportEditor — 탭 UI 및 미리보기 탭 추가

**Files:**
- Modify: `frontend/src/pages/ReportEditor.tsx`

- [ ] **Step 1: import 추가**

`ReportEditor.tsx` 상단 import에 추가:

```typescript
import ReactMarkdown from 'react-markdown'
import { generateMarkdown } from '../utils/generateMarkdown'
import { useTeamProfile } from '../contexts/TeamProfileContext'
```

기존 lucide import에 아이콘 추가:

```typescript
import { Copy, Sparkles } from 'lucide-react'
```

- [ ] **Step 2: 상태 변수 추가**

`ReportEditor` 컴포넌트 상단(기존 state 선언들 아래)에 추가:

```typescript
const { profile } = useTeamProfile()
const teamType = profile?.teamType || 'personal'

const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
const [markdownText, setMarkdownText] = useState('')
const [refinedMarkdown, setRefinedMarkdown] = useState('')
const [isRefining, setIsRefining] = useState(false)
const [copyMsg, setCopyMsg] = useState<string | null>(null)
```

- [ ] **Step 3: weekInfo 가져오기**

`ReportEditor`에는 현재 weekInfo가 없다. reportId에서 보고서를 조회하면 weekStart/weekEnd를 얻을 수 있다. `loadData()` 함수에서 report 정보도 함께 가져오도록 수정:

상단 state에 추가:
```typescript
const [weekInfo, setWeekInfo] = useState<{ weekStart: string; weekEnd: string; label: string } | null>(null)
```

import에 `GetWeeklyReport` 추가 (`wailsjs/go/main/App`에서):
```typescript
import { GetReportItems, UpdateReportItem, DeleteReportItem, AddReportItem,
  ExportWeeklyReport, GetProjectCategories, PreprocessReportItemsWithAI,
  OpenFile, GetWeeklyReport, RefineMarkdownWithAI } from '../../wailsjs/go/main/App'
```

> `GetWeeklyReport`가 바인딩에 없으면 `GetOrCreateWeeklyReport` 대신 사용 가능한 API 확인. 없으면 weekInfo는 reportId에서 파싱하거나 임시로 빈 문자열 사용.

`loadData()` 함수에 아래 추가:
```typescript
async function loadData() {
  try {
    const [reportItems, cats] = await Promise.all([
      GetReportItems(reportId),
      GetProjectCategories(),
    ])
    setItems(reportItems || [])
    setCategories(cats || [])
    // weekInfo: report 객체에서 가져오기 (핸들러에 GetWeeklyReport가 있는 경우)
    // 없으면 아래 fallback 사용
  } catch (err) {
    ...
  }
}
```

> `GetWeeklyReport` 바인딩이 없는 경우 `weekInfo`를 `{ weekStart: '', weekEnd: '', label: '' }`로 두고 헤더는 `# 주간업무보고`로만 표시해도 무방. Task 완료 후 Task 9에서 핸들러 추가 가능.

- [ ] **Step 4: 탭 전환 시 MD 생성 함수**

```typescript
function handleTabChange(tab: 'edit' | 'preview') {
  setActiveTab(tab)
  if (tab === 'preview') {
    const md = generateMarkdown(items, teamType, weekInfo || { weekStart: '', weekEnd: '', label: '' })
    setMarkdownText(md)
    setRefinedMarkdown('') // 탭 전환 시 AI 결과 초기화
  }
}
```

- [ ] **Step 5: 헤더에 탭 UI 추가**

기존 헤더의 `<h2 className="...">보고서 편집</h2>` 부분을 탭으로 교체:

```tsx
{/* 탭 */}
<div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
  <button
    onClick={() => handleTabChange('edit')}
    className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
      activeTab === 'edit'
        ? 'bg-white text-slate-800 font-medium shadow-sm'
        : 'text-slate-500 hover:text-slate-700'
    }`}
  >
    편집
  </button>
  <button
    onClick={() => handleTabChange('preview')}
    className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
      activeTab === 'preview'
        ? 'bg-white text-slate-800 font-medium shadow-sm'
        : 'text-slate-500 hover:text-slate-700'
    }`}
  >
    미리보기
  </button>
</div>
```

- [ ] **Step 6: 미리보기 패널 추가**

기존 편집 UI를 `{activeTab === 'edit' && (...)}` 로 감싸고, 그 아래에 미리보기 패널 추가:

```tsx
{activeTab === 'preview' && (
  <div className="flex-1 overflow-y-auto p-6">
    <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="text-slate-800 text-sm leading-relaxed space-y-2">
        <ReactMarkdown
          components={{
            h1: ({ children }) => <h1 className="text-xl font-bold text-slate-900 mb-4">{children}</h1>,
            h2: ({ children }) => <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2 border-b border-slate-200 pb-1">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-medium text-slate-700 mt-3 mb-1">{children}</h3>,
            ul: ({ children }) => <ul className="space-y-1 ml-4">{children}</ul>,
            li: ({ children }) => <li className="flex gap-2 text-slate-700"><span className="text-slate-400 shrink-0">•</span><span>{children}</span></li>,
            p: ({ children }) => <p className="text-slate-600">{children}</p>,
          }}
        >
          {refinedMarkdown || markdownText || '항목을 선택하면 미리보기가 생성됩니다.'}
        </ReactMarkdown>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: 빌드 확인**

```bash
cd frontend && npm run build
```

Expected: 오류 없음 (또는 타입 경고만)

- [ ] **Step 8: 커밋**

```bash
rtk git add frontend/src/pages/ReportEditor.tsx frontend/src/utils/
rtk git commit -m "feat: add edit/preview tabs to ReportEditor with react-markdown rendering"
```

---

## Task 9: ReportEditor — AI 다듬기 + MD 복사 버튼

**Files:**
- Modify: `frontend/src/pages/ReportEditor.tsx`

- [ ] **Step 1: AI 다듬기 핸들러**

`ReportEditor` 컴포넌트에 추가:

```typescript
async function handleRefine() {
  const source = markdownText
  if (!source) return
  setIsRefining(true)
  try {
    const result = await RefineMarkdownWithAI(source)
    setRefinedMarkdown(result)
  } catch (err: any) {
    showStatus(err?.message || 'AI 다듬기 실패')
  } finally {
    setIsRefining(false)
  }
}
```

- [ ] **Step 2: MD 복사 핸들러**

```typescript
async function handleCopyMarkdown() {
  const md = refinedMarkdown || markdownText
  if (!md) return
  try {
    await navigator.clipboard.writeText(md)
    setCopyMsg('복사됨!')
    setTimeout(() => setCopyMsg(null), 2000)
  } catch {
    setCopyMsg('복사 실패')
    setTimeout(() => setCopyMsg(null), 2000)
  }
}
```

- [ ] **Step 3: 헤더 우측에 버튼 추가**

미리보기 탭 활성 시에만 표시되도록 헤더 우측 버튼 영역에 추가:

```tsx
{activeTab === 'preview' && (
  <>
    <button
      onClick={handleRefine}
      disabled={isRefining || !markdownText}
      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg transition-colors disabled:opacity-50"
    >
      <Sparkles size={16} className={isRefining ? 'animate-pulse' : ''} />
      {isRefining ? 'AI 처리 중...' : 'AI 다듬기'}
    </button>
    <button
      onClick={handleCopyMarkdown}
      disabled={!markdownText}
      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
    >
      <Copy size={16} />
      {copyMsg || 'MD 복사'}
    </button>
  </>
)}
```

- [ ] **Step 4: 빌드 및 타입 확인**

```bash
cd frontend && npm run build
```

Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
rtk git add frontend/src/pages/ReportEditor.tsx
rtk git commit -m "feat: add AI refine and MD copy buttons to preview tab"
```

---

## Task 10: Settings — 팀유형별 템플릿 업로드 UI

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: 신규 바인딩 import 추가**

`Settings.tsx` 상단 import에 추가:

```typescript
import { UploadExcelTemplateForType, GetExcelTemplateForType } from '../../wailsjs/go/main/App'
```

- [ ] **Step 2: 개인용 템플릿 상태 추가**

Settings 컴포넌트 내 template section 관련 state 아래에 추가:

```typescript
const [personalTemplate, setPersonalTemplate] = useState<{ name: string } | null>(null)
const [personalTemplateLoading, setPersonalTemplateLoading] = useState(false)
```

- [ ] **Step 3: 개인용 템플릿 로드**

template 섹션 초기 로드 시 (기존 `GetExcelTemplate()` 호출 부분 근처):

```typescript
// 개인용 템플릿 로드 (teamType이 personal일 때)
if (teamProfile?.teamType === 'personal') {
  const personalTmpl = await GetExcelTemplateForType('personal')
  setPersonalTemplate(personalTmpl ? { name: personalTmpl.name } : null)
}
```

- [ ] **Step 4: 개인용 템플릿 업로드 핸들러**

```typescript
async function handleUploadPersonalTemplate() {
  setPersonalTemplateLoading(true)
  try {
    const result = await UploadExcelTemplateForType('personal')
    if (result) {
      const tmpl = await GetExcelTemplateForType('personal')
      setPersonalTemplate(tmpl ? { name: tmpl.name } : null)
      showStatus('개인용 템플릿이 업로드되었습니다')
    }
  } catch (err) {
    console.error('Personal template upload failed:', err)
    showStatus('개인용 템플릿 업로드 실패')
  } finally {
    setPersonalTemplateLoading(false)
  }
}
```

- [ ] **Step 5: Settings 템플릿 UI에 개인용 섹션 추가**

`Settings.tsx`에서 기존 템플릿 업로드 UI 블록 아래에 추가 (teamType이 personal일 때만 렌더링):

```tsx
{teamProfile?.teamType === 'personal' && (
  <div className="mt-4 pt-4 border-t border-slate-200">
    <h4 className="text-sm font-medium text-slate-700 mb-2">개인용 템플릿</h4>
    <p className="text-xs text-slate-400 mb-3">
      개인용 전용 템플릿입니다. 없을 경우 기본 템플릿을 사용합니다.
    </p>
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600 flex-1">
        {personalTemplate ? personalTemplate.name : '(업로드 없음 — 기본 템플릿 사용)'}
      </span>
      <button
        onClick={handleUploadPersonalTemplate}
        disabled={personalTemplateLoading}
        className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
      >
        {personalTemplateLoading ? '업로드 중...' : '업로드'}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: 빌드 확인**

```bash
cd frontend && npm run build
```

Expected: 오류 없음

- [ ] **Step 7: 전체 테스트 실행**

```bash
cd frontend && npm run test:run
```

Expected: 모든 테스트 PASS

- [ ] **Step 8: 최종 커밋**

```bash
rtk git add frontend/src/pages/Settings.tsx
rtk git commit -m "feat: add personal template upload section to Settings"
```

---

## Task 11: GetWeeklyReport 핸들러 추가 (weekInfo 보완)

> Task 8 Step 3에서 `GetWeeklyReport` 바인딩이 없는 경우 이 Task를 실행한다.

**Files:**
- Modify: `handlers.go`

- [ ] **Step 1: GetWeeklyReport 핸들러 추가**

`handlers.go`의 `ListWeeklyReports()` 메서드 바로 아래에 추가:

```go
func (a *App) GetWeeklyReport(reportID int64) (*db.WeeklyReport, error) {
	return a.database.GetWeeklyReport(reportID)
}
```

- [ ] **Step 2: 빌드 및 바인딩 재생성**

```bash
go build ./... && wails dev
```

앱 실행 후 종료(Ctrl+C).

- [ ] **Step 3: ReportEditor loadData에서 weekInfo 설정**

`ReportEditor.tsx`의 `loadData()` 함수:

```typescript
async function loadData() {
  try {
    const [reportItems, cats, report] = await Promise.all([
      GetReportItems(reportId),
      GetProjectCategories(),
      GetWeeklyReport(reportId),
    ])
    setItems(reportItems || [])
    setCategories(cats || [])
    if (report) {
      setWeekInfo({
        weekStart: report.weekStart,
        weekEnd: report.weekEnd,
        label: `${report.weekStart} ~ ${report.weekEnd}`,
      })
    }
  } catch (err) {
    console.error('Failed to load editor data:', err)
  }
}
```

- [ ] **Step 4: 커밋**

```bash
rtk git add handlers.go frontend/wailsjs/ frontend/src/pages/ReportEditor.tsx
rtk git commit -m "feat: add GetWeeklyReport handler and wire weekInfo in ReportEditor"
```

---

## 수동 검증 체크리스트

모든 Task 완료 후 `wails dev`로 앱을 실행하고 아래를 확인한다:

- [ ] 보고서 생성 → 활동 선택 → 보고서 편집 진입
- [ ] 편집 탭이 기본으로 활성화됨
- [ ] 미리보기 탭 클릭 시 MD 렌더링 확인 (개인용: 금주 한 일/차주 계획/특이사항, 팀: 섹션별)
- [ ] AI 다듬기 버튼 클릭 시 OpenAI 연동 작동 (API Key 설정된 경우)
- [ ] MD 복사 버튼 클릭 시 "복사됨!" 표시 및 클립보드 내용 확인
- [ ] 설정 > 템플릿 섹션에서 개인용 팀유형일 때 "개인용 템플릿" 영역 표시
- [ ] 개인용 템플릿 업로드 후 Excel 내보내기 시 해당 템플릿 사용 확인
