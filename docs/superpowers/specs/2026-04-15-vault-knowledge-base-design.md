# Vault 지식베이스 관리 UI - 설계 문서

**날짜**: 2026-04-15  
**담당자**: OpenReport  
**상태**: 설계 승인 완료

---

## 1. 요구사항 요약

### 목표
사용자의 로컬 지식베이스 폴더 (D:\vault)를 OpenReport 앱 내에서 탐색, 조회, 검색할 수 있는 전용 페이지 구현

### 사용 목적
- 정보 수집/학습용 지식베이스 (읽기 전용)
- 저장된 마크다운/텍스트 문서의 빠른 조회 및 검색

### 주요 기능 (Phase 1)
- 폴더 구조 탐색 (트리 뷰)
- 문서 목록 표시
- 마크다운 미리보기
- 파일명 기반 검색
- 폴더 새로고침 (DB 동기화)

### 콘텐츠 형식
마크다운(.md) 및 텍스트(.txt) 파일 중심

---

## 2. 아키텍처

### 2.1 백엔드 (Go)

#### DB 스키마 추가
```sql
CREATE TABLE vault_items (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,        -- 'file' 또는 'folder'
  name TEXT NOT NULL,         -- 파일/폴더명
  path TEXT NOT NULL UNIQUE,  -- 절대 경로
  parent_id INTEGER,          -- 부모 폴더 ID (NULL = root)
  content TEXT,               -- 파일 내용 (type='file'일 때만)
  modified_at TEXT,           -- 수정 시간 (ISO8601)
  size INTEGER,               -- 파일 크기 (bytes)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(parent_id) REFERENCES vault_items(id)
);

CREATE INDEX idx_vault_parent ON vault_items(parent_id);
CREATE INDEX idx_vault_path ON vault_items(path);
```

#### API 엔드포인트

**1. GetVaultStructure()**
- **설명**: DB에 캐시된 폴더 구조 반환
- **입력**: parentID (int, optional - 기본값: root)
- **반환**: 
  ```go
  {
    items: [
      { id, type, name, path, isFolder, modifiedAt, size },
      ...
    ]
  }
  ```
- **용도**: UI 로드 시, 트리 뷰 표시

**2. GetVaultFile(path string)**
- **설명**: 특정 파일의 전체 내용 반환
- **입력**: 파일의 상대경로 (예: "AI-News/article.md")
- **반환**:
  ```go
  {
    name: string,
    path: string,
    content: string,        // 마크다운 또는 텍스트
    modifiedAt: string,
    size: int
  }
  ```
- **용도**: 파일 미리보기 렌더링

**3. SearchVault(keyword string)**
- **설명**: 파일명으로 검색 (DB 쿼리)
- **입력**: 검색 키워드
- **반환**: GetVaultStructure과 동일한 형식의 결과 배열
- **용도**: 검색창 입력 시

**4. RefreshVault()**
- **설명**: D:\vault 폴더 전체를 스캔하고 DB 업데이트
- **알고리즘**:
  1. D:\vault 폴더 재귀 탐색
  2. 기존 DB 레코드와 비교
  3. 신규/수정/삭제 파일 감지
  4. DB 업데이트 (트랜잭션)
  5. 완료 후 구조 반환
- **에러 처리**: 폴더 접근 실패 시 상세 에러 메시지 반환
- **용도**: 앱 시작 시 + 사용자 새로고침 버튼 클릭 시

#### 초기화 흐름
- 앱 시작 시 `RefreshVault()` 호출
- 첫 로드 시간 2-5초 (vault 크기에 따라)
- 이후 조회는 DB에서 빠르게 (ms 단위)

### 2.2 프론트엔드 (React/TypeScript)

#### 페이지 구조
**새 페이지**: `frontend/src/pages/VaultPage.tsx`

#### 컴포넌트 구성
```
VaultPage
├─ Header (제목, 새로고침 버튼, 검색바)
├─ Main Container
│  ├─ FolderTree (좌측, 40% 너비)
│  ├─ FileList (중앙, 30% 너비)
│  └─ FileViewer (우측, 30% 너비)
└─ StatusBar (로딩 상태, 에러 메시지)
```

**각 컴포넌트 역할:**

1. **FolderTree** (`VaultFolderTree.tsx`)
   - 계층적 폴더 구조 표시 (좌측 패널)
   - 폴더 클릭 → FileList 업데이트
   - 확대/축소 기능
   - 현재 선택된 폴더 하이라이트

2. **FileList** (`VaultFileList.tsx`)
   - 현재 폴더의 파일 목록 표시 (중앙 패널)
   - 파일 아이콘, 이름, 수정일 표시
   - 파일 클릭 → FileViewer 업데이트
   - 정렬 옵션 (이름순, 수정일순)

3. **FileViewer** (`VaultFileViewer.tsx`)
   - 선택된 파일의 마크다운 콘텐츠 렌더링 (우측 패널)
   - `react-markdown` 사용
   - 스크롤 가능
   - 파일명, 수정일, 크기 메타정보 표시

4. **SearchBar** (Header 내)
   - 입력 시 실시간 검색 (디바운스 300ms)
   - 검색 결과를 FileList에 표시

#### 상태 관리 (Hooks)
```typescript
// VaultPage.tsx
const [folderTree, setFolderTree] = useState<VaultItem[]>([]);
const [selectedFolder, setSelectedFolder] = useState<string>('');
const [fileList, setFileList] = useState<VaultItem[]>([]);
const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
const [searchQuery, setSearchQuery] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState('');
```

#### 사이드바 메뉴 추가
`Layout.tsx`에 새 메뉴 항목 추가:
```
Navigation
├─ Dashboard
├─ Reports
├─ ...
├─ 지식베이스 (새 추가)  ← VaultPage로 라우팅
└─ Settings
```

---

## 3. 데이터 흐름

### 3.1 초기 로드 (앱 시작)
```
App 시작 → RefreshVault() 호출 → DB 업데이트 → VaultPage 로드 시 
→ GetVaultStructure() → FolderTree 렌더링
```

### 3.2 폴더 탐색
```
사용자가 FolderTree에서 폴더 클릭 
→ selectedFolder 상태 변경 
→ GetVaultStructure(parentID) 호출 
→ FileList 업데이트
```

### 3.3 파일 조회
```
사용자가 FileList에서 파일 클릭 
→ selectedFile 상태 변경 
→ GetVaultFile(path) 호출 
→ FileViewer에 마크다운 렌더링
```

### 3.4 검색
```
사용자가 SearchBar에 입력 (300ms 디바운스) 
→ SearchVault(keyword) 호출 
→ FileList에 검색 결과 표시
```

### 3.5 새로고침
```
사용자가 새로고침 버튼 클릭 
→ isLoading = true (스피너 표시) 
→ RefreshVault() 호출 
→ DB 업데이트 → GetVaultStructure() → UI 새로고침 
→ isLoading = false
```

---

## 4. UI 레이아웃

### 4.1 페이지 구조
```
┌───────────────────────────────────────────────────────────┐
│ 지식베이스          [🔄]  [검색...]                       │
├──────────────┬──────────────┬──────────────────────────────┤
│              │              │                              │
│  FolderTree  │  FileList    │       FileViewer            │
│              │              │                              │
│  📁 AI-News  │ 📄 news1.md  │  # 마크다운 제목             │
│    📄 2024   │ 📄 news2.md  │  마크다운 내용이             │
│    📄 2025   │ 📄 news3.md  │  여기 표시됨                 │
│              │              │                              │
│  📁 Tech     │              │  (스크롤 가능)              │
│  📁 Project  │              │                              │
│              │              │                              │
└──────────────┴──────────────┴──────────────────────────────┘
```

### 4.2 컴포넌트 너비 (반응형)
- **Desktop (1280px+)**: FolderTree 40% | FileList 30% | FileViewer 30%
- **Tablet (768-1279px)**: FolderTree와 FileList 모두 표시, FileViewer 숨김 (클릭 시 전체 화면)
- **Mobile**: 아직 지원 안 함 (Desktop 앱이므로 우선순위 낮음)

---

## 5. 에러 처리

| 상황 | 처리 방식 |
|------|---------|
| vault 폴더 찾을 수 없음 | "폴더를 찾을 수 없습니다: D:\vault" + 설정 링크 |
| 파일 읽기 실패 | "파일을 열 수 없습니다: [파일명]" |
| 권한 부족 (폴더 접근 거부) | "폴더에 접근할 권한이 없습니다" |
| 새로고침 중 에러 | 스피너 숨김 + 에러 메시지 표시 + 재시도 버튼 |
| 검색 결과 없음 | "검색 결과가 없습니다" (FileList 비움) |

---

## 6. Phase 1 구현 범위

### 포함 사항
- ✅ 폴더 구조 캐싱 (DB)
- ✅ 폴더 탐색 (트리 뷰)
- ✅ 파일 목록 표시
- ✅ 마크다운 렌더링 (react-markdown)
- ✅ 파일명 검색
- ✅ 새로고침 기능
- ✅ 에러 처리 및 로딩 상태

### 제외 사항 (Phase 2)
- ❌ 파일 내용 검색 (인덱싱 필요)
- ❌ 북마크/즐겨찾기
- ❌ 파일 태그
- ❌ 파일 복사/이동
- ❌ 문서 인쇄

---

## 7. 테스트 계획

### 7.1 단위 테스트
- RefreshVault: 폴더 추가/삭제/수정 감지 확인
- SearchVault: 검색 결과 정확성 확인
- GetVaultFile: 파일 내용 올바르게 읽히는지 확인

### 7.2 UI 테스트
1. **폴더 탐색**: 폴더 클릭 → FileList 업데이트 확인
2. **파일 조회**: 파일 클릭 → FileViewer에 마크다운 렌더링 확인
3. **검색**: 키워드 입력 → 결과 정확성 확인
4. **새로고침**: vault에 파일 추가 → 새로고침 후 UI 업데이트 확인
5. **에러 케이스**: 폴더 삭제, 파일 삭제 시 에러 처리 확인
6. **마크다운 렌더링**: 제목, 목록, 코드블록, 링크 등 문법 확인

### 7.3 성능 테스트
- vault 폴더 크기별 로드 시간 측정 (목표: < 5초)
- 검색 응답 시간 (목표: < 100ms)
- 메모리 사용량 (10,000개 파일 기준)

---

## 8. 기술 스택

| 영역 | 기술 |
|------|------|
| 마크다운 렌더링 | `react-markdown` |
| 트리 컴포넌트 | TailwindCSS 커스텀 구현 |
| 상태 관리 | React Hooks (useState, useEffect) |
| API 통신 | 기존 Wails 바인딩 |
| 스타일 | TailwindCSS v4 |

---

## 9. 파일 변경 목록

### 백엔드
- `internal/db/models.go`: VaultItem, VaultFile 타입 추가
- `internal/db/database.go`: vault_items 테이블 마이그레이션
- `internal/db/repository.go`: Vault CRUD 함수
- `handlers.go`: 위의 4개 엔드포인트 구현

### 프론트엔드
- `frontend/src/pages/VaultPage.tsx`: 새 페이지
- `frontend/src/components/VaultFolderTree.tsx`: 폴더 트리
- `frontend/src/components/VaultFileList.tsx`: 파일 목록
- `frontend/src/components/VaultFileViewer.tsx`: 파일 뷰어
- `frontend/src/components/Layout.tsx`: 사이드바 메뉴 추가

### 라우팅
- `frontend/src/main.tsx`: VaultPage 라우트 추가

---

## 10. 향후 계획 (Phase 2+)

- 파일 내용 검색 (전문 검색 인덱스)
- 파일 메타정보 (수정자, 버전 히스토리)
- 북마크 및 즐겨찾기 카테고리
- 파일 태그 및 커스텀 분류
- Dark mode 지원
- 모바일 반응형 (아직 우선순위 낮음)

---

**작성자**: Claude Haiku 4.5  
**승인 상태**: ✅ 설계 승인 완료
