import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { BookOpen, FileText, Loader2 } from 'lucide-react'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { VaultFile } from '../services/appApi'

interface VaultFileViewerProps {
  file: VaultFile | null
  loading: boolean
}

type ParsedFrontmatter = {
  body: string
  fields: Record<string, string>
}

type ViewMode = 'pretty' | 'raw'

const markdownSyntaxPattern = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`/

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
  if (!value) return '-'
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

function parseFrontmatter(content: string): ParsedFrontmatter {
  const normalized = (content || '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const fields: Record<string, string> = {}

  if (lines.length >= 3 && lines[0].trim() === '---') {
    const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (endIndex > 0) {
      for (const line of lines.slice(1, endIndex)) {
        const idx = line.indexOf(':')
        if (idx <= 0) continue
        const key = line.slice(0, idx).trim()
        const value = line
          .slice(idx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '')
        if (key) fields[key] = value
      }

      return {
        fields,
        body: lines.slice(endIndex + 1).join('\n').trim(),
      }
    }
  }

  return {
    fields,
    body: normalized.trim(),
  }
}

function isRawSourcePath(path: string): boolean {
  return path.replace(/\\/g, '/').includes('knowledge-base/raw/sources/')
}

function wrapLongLine(line: string, width = 100): string[] {
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const rows: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
      continue
    }
    if (`${current} ${word}`.length > width) {
      rows.push(current)
      current = word
      continue
    }
    current = `${current} ${word}`
  }
  if (current) rows.push(current)
  return rows
}

function prettifyRawMarkdown(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      out.push(line)
      continue
    }
    if (inCodeBlock || trimmed === '') {
      out.push(line)
      continue
    }

    const structural =
      trimmed.startsWith('#') ||
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      trimmed.startsWith('> ') ||
      trimmed.startsWith('|') ||
      /^\d+\.\s/.test(trimmed) ||
      trimmed.startsWith('[![')

    if (structural || line.length <= 120) {
      out.push(line)
      continue
    }

    out.push(...wrapLongLine(line, 100))
  }

  return out.join('\n')
}

export function VaultFileViewer({ file, loading }: VaultFileViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('raw')
  const parsed = file ? parseFrontmatter(file.content || '') : null
  const markdownBody = parsed?.body || ''
  const frontmatterEntries = Object.entries(parsed?.fields || {})
  const rawSourceFile = file ? isRawSourcePath(file.path || '') : false

  useEffect(() => {
    setViewMode(rawSourceFile ? 'pretty' : 'raw')
  }, [rawSourceFile, file?.path])

  const renderedBody = useMemo(() => {
    if (!rawSourceFile || viewMode === 'raw') return markdownBody
    return prettifyRawMarkdown(markdownBody)
  }, [markdownBody, rawSourceFile, viewMode])

  const hasMarkdownSyntax = markdownSyntaxPattern.test(renderedBody)
  const markdownComponents: Components = {
    p: ({ children }) => <p className="mb-4 leading-8 text-slate-100">{children}</p>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-4 border-slate-500/70 bg-slate-800/30 px-4 py-2 text-slate-200">
        {children}
      </blockquote>
    ),
    pre: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-7 text-slate-100">
        {children}
      </pre>
    ),
    code: ({ className, children, ...props }) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }
      return (
        <code className="rounded bg-slate-700/60 px-1.5 py-0.5 text-slate-100" {...props}>
          {children}
        </code>
      )
    },
    ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6">{children}</ol>,
    li: ({ children }) => <li className="leading-7 text-slate-100">{children}</li>,
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse border border-slate-600 text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-slate-800/80">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-slate-700">{children}</tr>,
    th: ({ children }) => <th className="border border-slate-600 px-3 py-2 text-left font-semibold text-slate-100">{children}</th>,
    td: ({ children }) => <td className="border border-slate-700 px-3 py-2 text-slate-100">{children}</td>,
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[var(--color-card)]">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-700">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          <BookOpen size={14} />
          <span>Viewer</span>
        </div>
        {file ? (
          <div className="mt-2 min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{file.name}</h2>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{file.path}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <FileText size={12} />
                {formatDate(file.modifiedAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                {formatSize(file.size)}
              </span>
              {rawSourceFile && (
                <div className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setViewMode('pretty')}
                    className={`rounded px-2 py-1 ${viewMode === 'pretty' ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    Pretty
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('raw')}
                    className={`rounded px-2 py-1 ${viewMode === 'raw' ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    Raw
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Select a markdown file to preview.</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : file ? (
          <div className="space-y-4">
            {frontmatterEntries.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/60">
                <div className="mb-2 font-semibold text-slate-600 dark:text-slate-300">Metadata</div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {frontmatterEntries.map(([key, value]) => (
                    <div key={key} className="truncate text-slate-600 dark:text-slate-300">
                      <span className="font-medium">{key}</span>: {value}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {hasMarkdownSyntax ? (
              <article className="max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                  {renderedBody || '_내용이 없습니다_'}
                </ReactMarkdown>
              </article>
            ) : (
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-[15px] leading-7 text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100">
                {renderedBody || '내용이 없습니다.'}
              </pre>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <div>
              <BookOpen className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">No file selected</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Choose a file from the middle panel to render markdown.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
