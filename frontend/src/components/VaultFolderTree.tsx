import { ChevronLeft, ChevronRight, Folder, FolderOpen, Home, Loader2 } from 'lucide-react'
import type { VaultItem } from '../services/appApi'

interface VaultFolderTreeProps {
  breadcrumbs: VaultItem[]
  folders: VaultItem[]
  loading: boolean
  onGoBack: () => void
  onGoRoot: () => void
  onSelectFolder: (folder: VaultItem) => void
}

export function VaultFolderTree({
  breadcrumbs,
  folders,
  loading,
  onGoBack,
  onGoRoot,
  onSelectFolder,
}: VaultFolderTreeProps) {
  const currentLabel = breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].name : '루트 폴더'
  const currentPath = breadcrumbs.length ? breadcrumbs.map(item => item.name).join(' / ') : '최상위 폴더'
  const canGoBack = breadcrumbs.length > 0

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[var(--color-card)]">
      <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          <FolderOpen size={14} />
          <span>폴더 트리</span>
        </div>
        <div className="mt-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{currentLabel}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-words">{currentPath}</p>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onGoBack}
            disabled={!canGoBack}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={14} />
            뒤로
          </button>
          <button
            type="button"
            onClick={onGoRoot}
            disabled={!canGoBack}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Home size={14} />
            루트
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : folders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <Folder className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">하위 폴더가 없습니다</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">이 단계에는 파일만 있습니다.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {folders.map(folder => (
              <button
                key={folder.id}
                type="button"
                onClick={() => onSelectFolder(folder)}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-sky-200 hover:bg-sky-50 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
                  <Folder size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {folder.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {folder.path}
                  </span>
                </span>
                <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
