# OpenReport (한국어 도움말)

[English README](./README.md)

OpenReport는 협업 도구 데이터(예: Gmail, Google Calendar, Linear, 수동 입력)를 기반으로 주간업무일지를 생성하고, 기존 Excel 템플릿 형식으로 내보내는 Windows 데스크톱 앱입니다.

## 기술 스택

- Wails v2 (Go + WebView2)
- React + TypeScript + Vite + TailwindCSS
- SQLite (`modernc.org/sqlite`, CGo-free)
- Excel 처리: `excelize`

## 주요 기능

- 주간 활동 수집 및 보고서 초안 구성
- 섹션 기반 보고서 편집 (`this_week`, `next_week`)
- 인사이트 패널(미반영 활동, 초안 후보, 무시 기능)
- Excel 템플릿 업로드 및 보고서 내보내기
- 팀 운영 기능(팀원, 근태, 프로젝트, 이슈, 회고)

## 사전 요구사항

- Go 1.21+ (현재 `go.mod`는 Go 1.25 사용)
- Node.js 18+
- Wails CLI `v2.12.0` 고정 사용

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
```

## 개발 실행

```bash
./scripts/wails.ps1 dev
```

개발 모드 실행 시 로컬 개발 서버(일반적으로 `http://localhost:34115`)가 함께 구동됩니다.

## 프로덕션 빌드

```bash
./scripts/wails.ps1 build
```

Windows 실행 파일: `build/bin/OpenReport.exe`

## 테스트 실행

백엔드:

```bash
go test ./...
```

프론트엔드:

```bash
cd frontend
npm run test:run
```

## 프로젝트 구조

```text
openreport-wind/
├── main.go                  # Wails 엔트리포인트
├── app.go                   # 앱 생명주기 및 서비스 연결
├── handlers_*.go            # Wails 바인딩 API 핸들러
├── service_*.go             # 서비스 레이어
├── internal/
│   ├── db/                  # SQLite 스키마/리포지토리
│   ├── excel/               # 템플릿 파싱/Excel 내보내기
│   ├── integrations/        # 외부 연동 동기화
│   └── reportinsights/      # 인사이트 분류 로직
├── frontend/
│   ├── src/                 # React 앱 코드
│   └── wailsjs/             # Wails 자동 생성 바인딩
└── wails.json               # Wails 설정
```

## 로컬 데이터 저장 경로

- DB: `~/.openreport/openreport.db`
- 템플릿: `~/.openreport/templates/`
- 내보내기: `~/.openreport/exports/`

## 참고

- `frontend/wailsjs/*` 파일은 자동 생성되므로 수동 수정하지 마세요.
- 저장소에는 레거시 핸들러 파일(`handlers.go`, 빌드 태그로 제외)과 분리된 활성 핸들러(`handlers_*.go`)가 함께 존재합니다.
- 브랜치 전환 시 자동 동기화를 쓰려면 1회 설정:
  `git config core.hooksPath .githooks`
