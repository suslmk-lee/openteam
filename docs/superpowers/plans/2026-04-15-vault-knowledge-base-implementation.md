# Vault Knowledge Base UI - 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenReport 앱 내에서 D:\vault 폴더의 지식베이스를 탐색, 조회, 검색할 수 있는 전용 UI 페이지 구현

**Architecture:** 하이브리드 캐싱 방식 (DB 캐시 + 새로고침 버튼)으로 폴더 구조를 관리. 3패널 레이아웃(FolderTree | FileList | FileViewer)에서 마크다운 파일 조회 및 검색 기능 제공.

**Tech Stack:** 
- 백엔드: Go, SQLite (vault_items 테이블)
- 프론트엔드: React, TypeScript, react-markdown, TailwindCSS

---

## 파일 구조

### 백엔드 (Go)
```
internal/db/
  ├─ models.go           (VaultItem, VaultFile 타입 추가)
  ├─ database.go         (vault_items 테이블 마이그레이션)
  └─ repository.go       (Vault CRUD 함수)

handlers.go              (4개 API 엔드포인트: GetVaultStructure, GetVaultFile, SearchVault, RefreshVault)
```

### 프론트엔드 (React)
```
frontend/src/
  ├─ pages/
  │  └─ VaultPage.tsx                      (메인 페이지)
  ├─ components/
  │  ├─ VaultFolderTree.tsx               (폴더 트리)
  │  ├─ VaultFileList.tsx                 (파일 목록)
  │  ├─ VaultFileViewer.tsx               (마크다운 뷰어)
  │  └─ Layout.tsx                        (사이드바 메뉴 수정)
  └─ main.tsx                             (라우팅 추가)
```

---

## 구현 태스크

### Task 1: DB 모델 정의

**Files:**
- Modify: `internal/db/models.go`

- [ ] **Step 1: VaultItem 구조체 추가**

`models.go` 파일 끝에 다음 코드 추가:

```go
// VaultItem represents a file or folder in the vault
type VaultItem struct {
	ID         int64     `json:"id"`
	Type       string    `json:"type"`        // "file" or "folder"
	Name       string    `json:"name"`
	Path       string    `json:"path"`        // absolute path
	ParentID   *int64    `json:"parentId"`    // nil for root
	ModifiedAt string    `json:"modifiedAt"` // ISO8601 format
	Size       int64     `json:"size"`        // bytes
	CreatedAt  string    `json:"createdAt"`
}

// VaultFile represents a file with its content
type VaultFile struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	Content    string `json:"content"`
	ModifiedAt string `json:"modifiedAt"`
	Size       int64  `json:"size"`
}
```

- [ ] **Step 2: Verify models compile**

Run: `cd D:\workspace\openreport-wind && go build ./internal/db/...`

Expected: No compilation errors

- [ ] **Step 3: Commit**

```bash
cd D:\workspace\openreport-wind
git add internal/db/models.go
git commit -m "feat: add VaultItem and VaultFile models"
```

---

### Task 2: DB 마이그레이션 추가

**Files:**
- Modify: `internal/db/database.go`

- [ ] **Step 1: vault_items 테이블 생성 SQL 추가**

`database.go` 파일에서 다른 CREATE TABLE 문들이 있는 곳(보통 `ensureSchema()` 함수)을 찾아, 아래 코드를 추가:

```go
// Vault Items table
const createVaultItemsSQL = `
CREATE TABLE IF NOT EXISTS vault_items (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL,
	name TEXT NOT NULL,
	path TEXT NOT NULL UNIQUE,
	parent_id INTEGER,
	modified_at TEXT,
	size INTEGER,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY(parent_id) REFERENCES vault_items(id)
);

CREATE INDEX IF NOT EXISTS idx_vault_parent ON vault_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_vault_path ON vault_items(path);
`
```

- [ ] **Step 2: 마이그레이션 실행 코드 추가**

`ensureSchema()` 함수 내에서 다른 CREATE TABLE 실행 코드와 함께:

```go
if _, err := db.Exec(createVaultItemsSQL); err != nil {
	return fmt.Errorf("failed to create vault_items table: %w", err)
}
```

- [ ] **Step 3: DB 초기화 테스트**

Run: `cd D:\workspace\openreport-wind && go test ./internal/db -v -run TestDatabase`

Expected: Database schema created successfully (또는 기존 테스트 통과)

- [ ] **Step 4: Commit**

```bash
cd D:\workspace\openreport-wind
git add internal/db/database.go
git commit -m "feat: add vault_items table migration"
```

---

### Task 3: Repository CRUD 함수 구현

**Files:**
- Modify: `internal/db/repository.go`

- [ ] **Step 1: SaveVaultItem 함수 추가**

`repository.go` 파일 끝에 추가:

```go
// SaveVaultItem inserts or updates a vault item
func (r *Repository) SaveVaultItem(item *db.VaultItem) (int64, error) {
	if item.ID == 0 {
		// Insert
		result, err := r.db.Exec(`
			INSERT INTO vault_items (type, name, path, parent_id, modified_at, size)
			VALUES (?, ?, ?, ?, ?, ?)
		`, item.Type, item.Name, item.Path, item.ParentID, item.ModifiedAt, item.Size)
		if err != nil {
			return 0, err
		}
		return result.LastInsertRowID()
	} else {
		// Update
		_, err := r.db.Exec(`
			UPDATE vault_items 
			SET type = ?, name = ?, path = ?, parent_id = ?, modified_at = ?, size = ?
			WHERE id = ?
		`, item.Type, item.Name, item.Path, item.ParentID, item.ModifiedAt, item.Size, item.ID)
		return item.ID, err
	}
}

// GetVaultItemsByParent returns all items in a folder
func (r *Repository) GetVaultItemsByParent(parentID *int64) ([]db.VaultItem, error) {
	query := `SELECT id, type, name, path, parent_id, modified_at, size, created_at FROM vault_items`
	var args []interface{}
	
	if parentID == nil {
		query += ` WHERE parent_id IS NULL`
	} else {
		query += ` WHERE parent_id = ?`
		args = append(args, *parentID)
	}
	
	query += ` ORDER BY type DESC, name ASC`
	
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var items []db.VaultItem
	for rows.Next() {
		var item db.VaultItem
		if err := rows.Scan(&item.ID, &item.Type, &item.Name, &item.Path, &item.ParentID, &item.ModifiedAt, &item.Size, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	
	return items, rows.Err()
}

// GetVaultItemByPath returns a single vault item by path
func (r *Repository) GetVaultItemByPath(path string) (*db.VaultItem, error) {
	var item db.VaultItem
	err := r.db.QueryRow(`
		SELECT id, type, name, path, parent_id, modified_at, size, created_at 
		FROM vault_items 
		WHERE path = ?
	`, path).Scan(&item.ID, &item.Type, &item.Name, &item.Path, &item.ParentID, &item.ModifiedAt, &item.Size, &item.CreatedAt)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &item, err
}

// DeleteVaultItemByPath deletes a vault item and its children
func (r *Repository) DeleteVaultItemByPath(path string) error {
	_, err := r.db.Exec(`DELETE FROM vault_items WHERE path = ? OR path LIKE ?`, path, path+"/%")
	return err
}

// SearchVaultItems searches vault items by name
func (r *Repository) SearchVaultItems(keyword string) ([]db.VaultItem, error) {
	keyword = "%" + keyword + "%"
	rows, err := r.db.Query(`
		SELECT id, type, name, path, parent_id, modified_at, size, created_at 
		FROM vault_items 
		WHERE name LIKE ? AND type = 'file'
		ORDER BY name ASC
	`, keyword)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var items []db.VaultItem
	for rows.Next() {
		var item db.VaultItem
		if err := rows.Scan(&item.ID, &item.Type, &item.Name, &item.Path, &item.ParentID, &item.ModifiedAt, &item.Size, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	
	return items, rows.Err()
}

// ClearVaultItems deletes all vault items
func (r *Repository) ClearVaultItems() error {
	_, err := r.db.Exec(`DELETE FROM vault_items`)
	return err
}
```

- [ ] **Step 2: Go imports 확인**

`repository.go` 상단의 import에 `"database/sql"` 있는지 확인. 없으면 추가.

- [ ] **Step 3: 컴파일 확인**

Run: `cd D:\workspace\openreport-wind && go build ./...`

Expected: No compilation errors

- [ ] **Step 4: Commit**

```bash
cd D:\workspace\openreport-wind
git add internal/db/repository.go
git commit -m "feat: add vault items repository functions"
```

---

### Task 4: API - GetVaultStructure 엔드포인트

**Files:**
- Modify: `handlers.go`

- [ ] **Step 1: GetVaultStructure 핸들러 추가**

`handlers.go` 파일 끝에 추가:

```go
// GetVaultStructure returns the cached vault folder structure
func (a *App) GetVaultStructure(parentID *int64) ([]db.VaultItem, error) {
	items, err := a.database.GetVaultItemsByParent(parentID)
	if err != nil {
		return nil, fmt.Errorf("failed to get vault structure: %w", err)
	}
	return items, nil
}
```

- [ ] **Step 2: 컴파일 및 Wails 바인딩 갱신**

Run: `cd D:\workspace\openreport-wind && wails build`

Expected: Build succeeds, frontend wailsjs bindings updated with GetVaultStructure

- [ ] **Step 3: Commit**

```bash
cd D:\workspace\openreport-wind
git add handlers.go frontend/wailsjs/
git commit -m "feat: add GetVaultStructure API endpoint"
```

---

### Task 5: API - GetVaultFile 엔드포인트

**Files:**
- Modify: `handlers.go`

- [ ] **Step 1: GetVaultFile 핸들러 추가**

`handlers.go` 에서 GetVaultStructure 함수 아래에 추가:

```go
// GetVaultFile returns the content of a vault file
func (a *App) GetVaultFile(path string) (*db.VaultFile, error) {
	item, err := a.database.GetVaultItemByPath(path)
	if err != nil {
		return nil, fmt.Errorf("failed to get vault item: %w", err)
	}
	if item == nil {
		return nil, fmt.Errorf("file not found: %s", path)
	}
	if item.Type != "file" {
		return nil, fmt.Errorf("path is not a file: %s", path)
	}
	
	// Read file content from disk
	fullPath := filepath.Join("D:\\vault", path)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
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
```

- [ ] **Step 2: Go imports 확인**

`handlers.go` 상단의 import에 `"os"` 와 `"path/filepath"` 있는지 확인. 없으면 추가.

- [ ] **Step 3: 컴파일**

Run: `cd D:\workspace\openreport-wind && go build ./...`

Expected: No compilation errors

- [ ] **Step 4: Wails 바인딩 갱신**

Run: `cd D:\workspace\openreport-wind && wails build`

Expected: GetVaultFile added to frontend bindings

- [ ] **Step 5: Commit**

```bash
cd D:\workspace\openreport-wind
git add handlers.go frontend/wailsjs/
git commit -m "feat: add GetVaultFile API endpoint"
```

---

### Task 6: API - SearchVault 엔드포인트

**Files:**
- Modify: `handlers.go`

- [ ] **Step 1: SearchVault 핸들러 추가**

`handlers.go` 에서 GetVaultFile 함수 아래에 추가:

```go
// SearchVault searches vault files by name
func (a *App) SearchVault(keyword string) ([]db.VaultItem, error) {
	if keyword == "" {
		return []db.VaultItem{}, nil
	}
	
	items, err := a.database.SearchVaultItems(keyword)
	if err != nil {
		return nil, fmt.Errorf("failed to search vault: %w", err)
	}
	return items, nil
}
```

- [ ] **Step 2: 컴파일**

Run: `cd D:\workspace\openreport-wind && go build ./...`

Expected: No compilation errors

- [ ] **Step 3: Wails 바인딩 갱신**

Run: `cd D:\workspace\openreport-wind && wails build`

Expected: SearchVault added to frontend bindings

- [ ] **Step 4: Commit**

```bash
cd D:\workspace\openreport-wind
git add handlers.go frontend/wailsjs/
git commit -m "feat: add SearchVault API endpoint"
```

---

### Task 7: API - RefreshVault 엔드포인트

**Files:**
- Modify: `handlers.go`

- [ ] **Step 1: RefreshVault 핸들러 추가**

`handlers.go` 에서 SearchVault 함수 아래에 추가:

```go
// RefreshVault scans D:\vault and updates the database
func (a *App) RefreshVault() (int, error) {
	vaultPath := "D:\\vault"
	
	// Clear existing items
	if err := a.database.ClearVaultItems(); err != nil {
		return 0, fmt.Errorf("failed to clear vault items: %w", err)
	}
	
	count := 0
	err := filepath.Walk(vaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		
		// Skip root vault folder itself
		if path == vaultPath {
			return nil
		}
		
		// Calculate relative path
		relPath, err := filepath.Rel(vaultPath, path)
		if err != nil {
			return err
		}
		
		// Normalize path to forward slashes for consistency
		relPath = filepath.ToSlash(relPath)
		
		itemType := "folder"
		if info.Mode().IsRegular() {
			itemType = "file"
		}
		
		// Skip if not a regular file or directory
		if itemType == "file" && !isMarkdownOrText(path) {
			return nil
		}
		
		item := &db.VaultItem{
			Type:       itemType,
			Name:       info.Name(),
			Path:       relPath,
			ModifiedAt: info.ModTime().Format(time.RFC3339),
			Size:       info.Size(),
		}
		
		// Calculate parent ID
		parentPath := filepath.Dir(relPath)
		if parentPath != "." {
			parentPath = filepath.ToSlash(parentPath)
			parentItem, err := a.database.GetVaultItemByPath(parentPath)
			if err == nil && parentItem != nil {
				item.ParentID = &parentItem.ID
			}
		}
		
		_, err = a.database.SaveVaultItem(item)
		if err != nil {
			log.Printf("failed to save vault item %s: %v", relPath, err)
			return nil // continue on error
		}
		
		count++
		return nil
	})
	
	if err != nil {
		return count, fmt.Errorf("failed to scan vault: %w", err)
	}
	
	return count, nil
}

// isMarkdownOrText checks if file is markdown or text
func isMarkdownOrText(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".md" || ext == ".txt" || ext == ".markdown"
}
```

- [ ] **Step 2: Go imports 확인**

Import에 `"time"` 과 `"strings"` 있는지 확인. 없으면 추가.

- [ ] **Step 3: 컴파일**

Run: `cd D:\workspace\openreport-wind && go build ./...`

Expected: No compilation errors

- [ ] **Step 4: Wails 바인딩 갱신**

Run: `cd D:\workspace\openreport-wind && wails build`

Expected: RefreshVault added to frontend bindings

- [ ] **Step 5: Commit**

```bash
cd D:\workspace\openreport-wind
git add handlers.go frontend/wailsjs/
git commit -m "feat: add RefreshVault API endpoint"
```

---

### Task 8: UI 컴포넌트 - VaultFolderTree

**Files:**
- Create: `frontend/src/components/VaultFolderTree.tsx`

- [ ] **Step 1: VaultFolderTree 컴포넌트 생성**

`frontend/src/components/VaultFolderTree.tsx` 생성:

```typescript
import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder } from 'lucide-react'
import { VaultItem } from '../wailsjs/go/models'

interface VaultFolderTreeProps {
  items: VaultItem[]
  selectedFolder: string | null
  onFolderSelect: (parentId: number | null) => void
}

export function VaultFolderTree({ items, selectedFolder, onFolderSelect }: VaultFolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())

  const toggleFolder = (id: number) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedFolders(newExpanded)
  }

  const folders = items.filter(item => item.type === 'folder')

  return (
    <div className="w-full h-full overflow-y-auto border-r border-gray-200 dark:border-gray-700 p-2">
      <div
        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
          selectedFolder === null ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
        onClick={() => onFolderSelect(null)}
      >
        <Folder size={16} />
        <span className="text-sm font-medium">All Files</span>
      </div>

      <div className="mt-2">
        {folders.map(folder => (
          <FolderNode
            key={folder.id}
            folder={folder}
            isExpanded={expandedFolders.has(folder.id)}
            onToggle={() => toggleFolder(folder.id)}
            onSelect={() => onFolderSelect(folder.id)}
            isSelected={selectedFolder === `${folder.id}`}
          />
        ))}
      </div>
    </div>
  )
}

interface FolderNodeProps {
  folder: VaultItem
  isExpanded: boolean
  onToggle: () => void
  onSelect: () => void
  isSelected: boolean
}

function FolderNode({ folder, isExpanded, onToggle, onSelect, isSelected }: FolderNodeProps) {
  return (
    <div>
      <div
        className={`flex items-center gap-1 p-2 rounded cursor-pointer ${
          isSelected ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-5 h-5 hover:bg-gray-300 dark:hover:bg-gray-600 rounded"
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <Folder size={16} />
        <span className="text-sm truncate flex-1" onClick={onSelect}>
          {folder.name}
        </span>
      </div>

      {/* Placeholder for nested items - will be populated when you add recursive loading */}
      {isExpanded && (
        <div className="ml-4 text-xs text-gray-500 p-2">
          (Nested items loaded on demand)
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 컴포넌트 테스트**

Run: `cd D:\workspace\openreport-wind && npm run build` (frontend 디렉토리에서)

Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
cd D:\workspace\openreport-wind
git add frontend/src/components/VaultFolderTree.tsx
git commit -m "feat: add VaultFolderTree component"
```

---

### Task 9: UI 컴포넌트 - VaultFileList

**Files:**
- Create: `frontend/src/components/VaultFileList.tsx`

- [ ] **Step 1: VaultFileList 컴포넌트 생성**

`frontend/src/components/VaultFileList.tsx` 생성:

```typescript
import { File, Calendar, HardDrive } from 'lucide-react'
import { VaultItem } from '../wailsjs/go/models'

interface VaultFileListProps {
  items: VaultItem[]
  selectedFile: string | null
  onFileSelect: (path: string) => void
  isLoading: boolean
}

export function VaultFileList({ items, selectedFile, onFileSelect, isLoading }: VaultFileListProps) {
  const files = items.filter(item => item.type === 'file')

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center border-r border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Loading files...</p>
        </div>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center border-r border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-400">No files found</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-auto border-r border-gray-200 dark:border-gray-700">
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {files.map(file => (
          <div
            key={file.id}
            className={`p-3 cursor-pointer transition-colors ${
              selectedFile === file.path
                ? 'bg-blue-50 dark:bg-blue-900 border-l-4 border-l-blue-600'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            onClick={() => onFileSelect(file.path)}
          >
            <div className="flex items-center gap-2 mb-1">
              <File size={16} className="flex-shrink-0 text-gray-400" />
              <span className="text-sm font-medium truncate flex-1">{file.name}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 ml-6">
              <div className="flex items-center gap-1">
                <Calendar size={12} />
                <span>{new Date(file.modifiedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-1">
                <HardDrive size={12} />
                <span>{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 확인**

Run: `cd D:\workspace\openreport-wind\frontend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd D:\workspace\openreport-wind
git add frontend/src/components/VaultFileList.tsx
git commit -m "feat: add VaultFileList component"
```

---

### Task 10: UI 컴포넌트 - VaultFileViewer

**Files:**
- Create: `frontend/src/components/VaultFileViewer.tsx`
- Modify: `frontend/package.json` (if react-markdown not installed)

- [ ] **Step 1: react-markdown 설치 확인**

Run: `cd D:\workspace\openreport-wind\frontend && npm list react-markdown`

If not installed: `npm install react-markdown`

- [ ] **Step 2: VaultFileViewer 컴포넌트 생성**

`frontend/src/components/VaultFileViewer.tsx` 생성:

```typescript
import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { File, Calendar, HardDrive } from 'lucide-react'
import { VaultFile } from '../wailsjs/go/models'

interface VaultFileViewerProps {
  file: VaultFile | null
  isLoading: boolean
}

export function VaultFileViewer({ file, isLoading }: VaultFileViewerProps) {
  const memoizedContent = useMemo(() => {
    if (!file) return null
    return (
      <div className="prose dark:prose-invert max-w-none">
        <ReactMarkdown>{file.content}</ReactMarkdown>
      </div>
    )
  }, [file])

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Loading file...</p>
        </div>
      </div>
    )
  }

  if (!file) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white dark:bg-gray-900">
        <p className="text-sm text-gray-400">Select a file to preview</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header with file info */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-2">
          <File size={20} className="text-gray-400" />
          <h2 className="text-lg font-semibold truncate">{file.name}</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Calendar size={14} />
            <span>{new Date(file.modifiedAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <HardDrive size={14} />
            <span>{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {memoizedContent}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript 확인**

Run: `cd D:\workspace\openreport-wind\frontend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd D:\workspace\openreport-wind
git add frontend/package.json frontend/src/components/VaultFileViewer.tsx
git commit -m "feat: add VaultFileViewer component with markdown rendering"
```

---

### Task 11: UI 페이지 - VaultPage 통합

**Files:**
- Create: `frontend/src/pages/VaultPage.tsx`

- [ ] **Step 1: VaultPage 컴포넌트 생성**

`frontend/src/pages/VaultPage.tsx` 생성:

```typescript
import { useEffect, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { useAppApi } from '../hooks/useAppApi'
import { VaultFolderTree } from '../components/VaultFolderTree'
import { VaultFileList } from '../components/VaultFileList'
import { VaultFileViewer } from '../components/VaultFileViewer'
import { VaultItem, VaultFile } from '../wailsjs/go/models'
import { GetVaultStructure, GetVaultFile, SearchVault, RefreshVault } from '../wailsjs/go/main/App'

export default function VaultPage() {
  const [vaultStructure, setVaultStructure] = useState<VaultItem[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null)
  const [searchResults, setSearchResults] = useState<VaultItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string>('')

  // Load root structure on mount
  useEffect(() => {
    loadVaultStructure(null)
  }, [])

  const loadVaultStructure = async (parentId: number | null) => {
    try {
      setIsLoading(true)
      setError('')
      const items = await GetVaultStructure(parentId)
      setVaultStructure(items || [])
      setSelectedFolder(parentId === null ? null : `${parentId}`)
      setSelectedFile(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load vault structure')
      setVaultStructure([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true)
      setError('')
      await RefreshVault()
      await loadVaultStructure(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh vault')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleFileSelect = async (path: string) => {
    try {
      setIsLoading(true)
      setError('')
      const file = await GetVaultFile(path)
      setSelectedFile(file)
    } catch (err: any) {
      setError(err?.message || 'Failed to load file')
      setSelectedFile(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    try {
      setIsLoading(true)
      setError('')
      const results = await SearchVault(query)
      setSearchResults(results || [])
    } catch (err: any) {
      setError(err?.message || 'Search failed')
      setSearchResults([])
    } finally {
      setIsLoading(false)
    }
  }

  const displayItems = searchQuery ? searchResults : vaultStructure

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Knowledge Base</h1>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex-shrink-0 bg-red-50 dark:bg-red-900 border-b border-red-200 dark:border-red-700 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Main content - 3 panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Folder Tree */}
        <div className="w-2/5 overflow-hidden">
          <VaultFolderTree items={vaultStructure} selectedFolder={selectedFolder} onFolderSelect={loadVaultStructure} />
        </div>

        {/* Middle: File List */}
        <div className="w-3/10 overflow-hidden">
          <VaultFileList items={displayItems} selectedFile={selectedFile?.path || null} onFileSelect={handleFileSelect} isLoading={isLoading} />
        </div>

        {/* Right: File Viewer */}
        <div className="w-3/10 overflow-hidden">
          <VaultFileViewer file={selectedFile} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 확인**

Run: `cd D:\workspace\openreport-wind\frontend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd D:\workspace\openreport-wind
git add frontend/src/pages/VaultPage.tsx
git commit -m "feat: add VaultPage with 3-panel layout"
```

---

### Task 12: 사이드바 메뉴 추가

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Layout.tsx에서 라우팅 링크 찾기**

`Layout.tsx` 에서 다른 페이지 링크들이 있는 부분(보통 nav 섹션)을 찾습니다.

- [ ] **Step 2: Knowledge Base 메뉴 항목 추가**

라우팅 링크 중 적절한 위치에 다음 코드 추가:

```typescript
<Link
  to="/vault"
  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
    location.pathname === '/vault'
      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
  }`}
>
  <BookOpen size={20} />
  <span>Knowledge Base</span>
</Link>
```

- [ ] **Step 3: 아이콘 import 확인**

Layout.tsx 상단에서 `lucide-react` 임포트에 `BookOpen` 추가:

```typescript
import { BookOpen, ... } from 'lucide-react'
```

- [ ] **Step 4: TypeScript 확인**

Run: `cd D:\workspace\openreport-wind\frontend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd D:\workspace\openreport-wind
git add frontend/src/components/Layout.tsx
git commit -m "feat: add Knowledge Base menu to sidebar"
```

---

### Task 13: 라우팅 설정

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: main.tsx에서 라우트 정의 찾기**

`main.tsx` 에서 다른 페이지의 라우트 정의가 있는 부분을 찾습니다.

- [ ] **Step 2: VaultPage 라우트 추가**

라우트 배열에 다음 추가:

```typescript
import VaultPage from './pages/VaultPage'

// In routes array:
{
  path: '/vault',
  element: <VaultPage />,
}
```

- [ ] **Step 3: TypeScript 확인**

Run: `cd D:\workspace\openreport-wind\frontend && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd D:\workspace\openreport-wind
git add frontend/src/main.tsx
git commit -m "feat: add vault route to frontend router"
```

---

### Task 14: 통합 테스트 및 초기 데이터 로드

**Files:**
- Modify: `handlers.go` (앱 시작 시 vault 초기화 로직 추가)

- [ ] **Step 1: App.startup() 메서드 확인**

`handlers.go` 또는 `app.go` 에서 `Startup()` 메서드를 찾습니다.

- [ ] **Step 2: Startup 메서드에 RefreshVault 호출 추가**

`Startup()` 메서드 내 적절한 위치(다른 초기화 작업 후)에 추가:

```go
// Initialize vault on startup
count, err := a.RefreshVault()
if err != nil {
	log.Printf("Warning: failed to initialize vault on startup: %v", err)
} else {
	log.Printf("Vault initialized with %d items", count)
}
```

- [ ] **Step 3: 컴파일**

Run: `cd D:\workspace\openreport-wind && go build ./...`

Expected: No compilation errors

- [ ] **Step 4: 앱 시작 테스트**

Run: `cd D:\workspace\openreport-wind && wails dev`

Expected:
- 앱 시작
- 로그에 "Vault initialized with X items" 메시지
- localhost:34115에서 앱 로드

- [ ] **Step 5: UI 테스트**

브라우저에서:
1. 사이드바의 "Knowledge Base" 클릭
2. 폴더 트리에 D:\vault의 폴더들 표시되는지 확인
3. 폴더 클릭 시 파일 목록 표시되는지 확인
4. 파일 클릭 시 마크다운 렌더링되는지 확인
5. 검색창에 키워드 입력 시 검색 결과 표시되는지 확인
6. "Refresh" 버튼 클릭 시 vault 재스캔 되는지 확인

- [ ] **Step 6: Commit**

```bash
cd D:\workspace\openreport-wind
git add handlers.go app.go
git commit -m "feat: initialize vault on app startup"
```

---

## 검증 체크리스트

- [ ] 모든 14개 태스크 완료
- [ ] `wails dev` 실행 시 에러 없음
- [ ] 사이드바 메뉴에 "Knowledge Base" 표시됨
- [ ] /vault 페이지 로드 시 3패널 레이아웃 표시됨
- [ ] 폴더 트리에 D:\vault 구조 표시됨
- [ ] 파일 클릭 시 마크다운 렌더링됨
- [ ] 검색 기능 작동됨
- [ ] Refresh 버튼 작동됨
- [ ] 에러 메시지 제대로 표시됨
- [ ] 모든 파일 커밋됨

---

**작성자**: Claude Haiku 4.5  
**완성도**: Phase 1 (조회 중심)  
**다음 단계**: Phase 2 - 파일 내용 검색, 북마크, 태그
