# Testing Guide

이 문서는 OpenReport 프로젝트의 테스트 구조와 실행 방법을 설명합니다.

## 디렉토리 구조

```
openreport/
├── frontend/
│   ├── __tests__/              # Frontend 테스트
│   │   ├── setup/              # 테스트 설정
│   │   │   ├── setup.ts        # Vitest 초기화
│   │   │   └── test-utils.tsx  # 테스트 유틸리티
│   │   ├── unit/               # 단위 테스트
│   │   │   ├── example.test.ts
│   │   │   └── Layout.test.tsx
│   │   └── integration/        # 통합 테스트 (추후 추가)
│   ├── vitest.config.ts        # Vitest 설정
│   └── package.json
│
├── test/                        # Backend 테스트
│   ├── test_helpers.go         # 테스트 헬퍼
│   ├── unit/                   # 단위 테스트
│   │   └── example_test.go
│   ├── integration/            # 통합 테스트 (추후 추가)
│   └── fixtures/               # 테스트 데이터 (추후 추가)
│
└── internal/                    # Backend 패키지들
    ├── db/
    ├── excel/
    ├── integrations/
    └── ai/
```

## Frontend 테스트

### 필수 사항
- Node.js 18+
- npm/pnpm

### 테스트 실행

```bash
cd frontend

# 의존성 설치
npm install

# 테스트 실행
npm run test

# 감시 모드 (파일 변경 시 자동 재실행)
npm run test -- --watch

# UI로 테스트 보기
npm run test:ui

# 커버리지 리포트
npm run test -- --coverage
```

### 테스트 작성 방법

새로운 컴포넌트 테스트를 작성할 때는:

1. `__tests__/unit/` 또는 `__tests__/integration/` 폴더에 `*.test.tsx` 파일 생성
2. `test-utils`에서 커스텀 `render` 함수 사용 (React Router 통합됨)
3. `@testing-library/react` 사용

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '../setup/test-utils';
import MyComponent from '../../src/components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

## Backend 테스트

### 필수 사항
- Go 1.21+

### 테스트 실행

```bash
# 모든 테스트 실행
go test ./...

# 상세 출력
go test -v ./...

# 특정 패키지 테스트
go test ./internal/db

# 커버리지 리포트
go test -cover ./...

# 커버리지 HTML 리포트
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### 테스트 작성 방법

Go 프로젝트에서는 표준 `*_test.go` 파일 규칙을 사용합니다:

```go
// internal/db/database_test.go
package db_test

import (
    "testing"
    "openreport/internal/db"
)

func TestCreateUser(t *testing.T) {
    // 테스트 코드
    if got != want {
        t.Errorf("got %v, want %v", got, want)
    }
}
```

## 테스트 작성 Best Practices

### General
- 각 변경사항에 대해 테스트 작성
- 테스트는 독립적이고 재현 가능해야 함
- Descriptive 한 테스트 이름 사용

### Frontend
- 사용자 상호작용 중심 테스트 작성 (`userEvent` 사용)
- 구현 세부사항보다는 동작 테스트
- 대량의 스냅샷 테스트는 피하기

### Backend
- 테이블 드리븐 테스트 (Table-driven tests) 사용
- 에러 케이스 포함
- 데이터베이스 테스트는 임시 DB 또는 mock 사용

## CI/CD 통합

GitHub Actions 등을 통한 CI/CD 파이프라인에 테스트가 통합될 예정입니다:
- PR 시 자동으로 frontend/backend 테스트 실행
- 테스트 성공 필수 조건 추가

## 추가 리소스

- [Vitest 문서](https://vitest.dev/)
- [Testing Library 문서](https://testing-library.com/)
- [Go Testing 패키지](https://golang.org/pkg/testing/)
