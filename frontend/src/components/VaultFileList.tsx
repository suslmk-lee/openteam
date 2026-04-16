import { CalendarDays, FileText, Loader2, Search, HardDrive } from 'lucide-react'
import type { VaultItem } from '../services/appApi'

interface VaultFileListProps {
  items: VaultItem[]
  loading: boolean
  selectedPath: string | null
  title: string
  subtitle: string
  emptyText: string
  showPath: boolean
  onSelectFile: (item: VaultItem) => void
}

function formatSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatDate(value: string) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function VaultFileList({
  items,
  loading,
  selectedPath,
  title,
  subtitle,
  emptyText,
  showPath,
  onSelectFile,
}: VaultFileListProps) {
  return (
    <div className="flex h-full flex-col bg-white dark:bg-[var(--color-card)]">
      <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          <Search size={14} />
          <span>파일 목록</span>
        </div>
        <div className="mt-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">{emptyText}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              다른 폴더를 선택하거나 검색어를 바꿔보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map(item => {
              const active = selectedPath === item.path
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectFile(item)}
                  className={`flex w-full flex-col rounded-xl border px-3 py-3 text-left transition-colors ${
                    active
                      ? 'border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      <FileText size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {item.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
                        {showPath ? item.path : `경로: ${item.path}`}
                      </span>
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 pl-12 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={12} />
                      {formatDate(item.modifiedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HardDrive size={12} />
                      {formatSize(item.size)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
