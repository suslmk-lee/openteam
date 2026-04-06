# OpenReport — 주간업무일지 자동생성

협업툴(NaverWorks, Linear, Gmail, 카카오톡 등) 데이터를 수집하여 기존 Excel 포맷과 동일한 주간업무일지를 자동 생성하는 Windows 데스크톱 앱.

## 기술 스택

| 구분 | 기술 |
|------|------|
| **프레임워크** | Wails v2 (Go + WebView2) |
| **프론트엔드** | React 18 + TypeScript + TailwindCSS |
| **로컬 DB** | SQLite (modernc.org/sqlite, CGo-free) |
| **Excel 처리** | excelize v2 |
| **아이콘** | Lucide React |

## 주요 기능

- **대시보드** — 주간 협업툴 활동 조회, 필터링, 보고서 항목 선택
- **보고서 편집** — 섹션별 항목 관리, 인라인 편집, 체크박스 선택/해제
- **Excel 내보내기** — 업로드한 템플릿 포맷 그대로 주간업무일지 생성
- **설정** — 사용자 정보, 협업툴 연동, 프로젝트 카테고리 관리
- **수동 입력** — API 연동 외 직접 업무 항목 추가 가능

## 빠른 시작

### 사전 요구사항

- Go 1.21+
- Node.js 18+
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

### 개발 모드

```bash
wails dev
```

브라우저에서 http://localhost:34115 로 접속하여 개발 가능.

### 프로덕션 빌드

```bash
wails build
```

`build/bin/` 디렉토리에 실행 파일 생성.

## 프로젝트 구조

```
openreport-wind/
├── main.go                  # Wails 엔트리포인트
├── app.go                   # 앱 구조체 (DB 초기화, 생명주기)
├── handlers.go              # Wails 바인딩 핸들러 (프론트엔드 API)
├── internal/
│   ├── db/                  # SQLite DB
│   │   ├── database.go      # DB 초기화 및 마이그레이션
│   │   ├── models.go        # 데이터 모델
│   │   └── repository.go    # CRUD 연산
│   └── excel/               # Excel 처리
│       ├── template.go      # 템플릿 파싱
│       └── exporter.go      # 보고서 생성
├── frontend/
│   ├── src/
│   │   ├── main.tsx         # React 엔트리 + 라우팅
│   │   ├── components/
│   │   │   └── Layout.tsx   # 사이드바 레이아웃
│   │   └── pages/
│   │       ├── Dashboard.tsx    # 대시보드
│   │       ├── Settings.tsx     # 설정
│   │       └── ReportEditor.tsx # 보고서 편집
│   └── wailsjs/             # Wails 자동 생성 바인딩
└── wails.json               # Wails 설정
```

## 데이터 저장 경로

- DB: `~/.openreport/openreport.db`
- 템플릿: `~/.openreport/templates/`
- 내보내기: `~/.openreport/exports/` (또는 사용자 지정 경로)

## 협업툴 연동 로드맵

| Phase | 도구 | 상태 |
|-------|------|------|
| 1 | NaverWorks (메일/캘린더/게시판) | 🔲 예정 |
| 1 | Linear (이슈/태스크) | 🔲 예정 |
| 2 | Gmail | 🔲 예정 |
| 2 | Google Calendar | 🔲 예정 |
| 3 | 카카오톡 (txt 파일 파싱) | 🔲 예정 |
| 3 | Slack / GitHub / Jira | 🔲 예정 |
