import { useEffect, useRef, useState } from 'react'
import { useAppApi } from '../hooks/useAppApi'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import { useNavigate } from 'react-router-dom'
import { Kanban, RefreshCw, ExternalLink, AlertCircle, Settings, X, User, Calendar, Tag, Flag, Loader2, Check, ChevronDown, Link2, Briefcase, AlignLeft, Hash, MessageSquare, Send, Bot, ChevronUp, Minimize2, Maximize2 } from 'lucide-react'

// Simple markdown to HTML converter for basic formatting
function renderMarkdown(text: string): string {
  if (!text) return ''

  // Step 1: Split into lines and categorize
  const lines = text.split('\n')
  const blocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block (```)
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      const code = escapeHtml(codeLines.join('\n'))
      blocks.push(`<pre style="background:#f1f5f9;padding:12px;border-radius:8px;overflow-x:auto;margin:8px 0;border:1px solid #e2e8f0"><code style="font-family:'Fira Code',monospace;font-size:12px;color:#334155">${code}</code></pre>`)
      i++ // skip closing ```
      continue
    }

    // Table
    if (line.startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('|')) {
      const tableLines: string[] = [line]
      i++
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      blocks.push(renderTableBlock(tableLines))
      continue
    }

    // Heading
    const h1Match = line.match(/^# (.+)$/)
    const h2Match = line.match(/^## (.+)$/)
    const h3Match = line.match(/^### (.+)$/)
    if (h1Match) { blocks.push(`<h1 class="font-bold mt-4 mb-2 text-base">${renderInline(h1Match[1])}</h1>`); i++; continue }
    if (h2Match) { blocks.push(`<h2 class="font-semibold mt-3 mb-2">${renderInline(h2Match[1])}</h2>`); i++; continue }
    if (h3Match) { blocks.push(`<h3 class="font-semibold mt-2 mb-1">${renderInline(h3Match[1])}</h3>`); i++; continue }

    // List
    const listMatch = line.match(/^\s*[-*] (.+)$/)
    if (listMatch) {
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i].match(/^\s*[-*] (.+)$/)
        if (!l) break
        items.push(`<li class="ml-4">${renderInline(l[1])}</li>`)
        i++
        // Skip blank lines between list items
        while (i < lines.length && lines[i].trim() === '') i++
      }
      blocks.push(`<ul class="list-disc my-1 space-y-0">${items.join('')}</ul>`)
      continue
    }

    // Regular line (may have inline formatting)
    if (line.trim()) {
      blocks.push(`<p class="my-0">${renderInline(line)}</p>`)
    }
    i++
  }

  return blocks.join('')
}

function renderTableBlock(lines: string[]): string {
  const header = lines[0]
  const rows = lines.slice(2) // skip header and separator
  const headers = header.split('|').map(h => h.trim()).filter(h => h)
  let html = '<table class="w-full text-xs border-collapse my-1"><thead><tr>'
  headers.forEach(h => { html += `<th class="border border-slate-300 px-2 py-1 bg-slate-100 text-left font-semibold">${renderInline(h)}</th>` })
  html += '</tr></thead><tbody>'
  rows.forEach(row => {
    const cells = row.split('|').map(c => c.trim()).filter((c, i) => i > 0 && i <= headers.length)
    html += '<tr>'
    cells.forEach(c => { html += `<td class="border border-slate-300 px-2 py-1">${renderInline(c)}</td>` })
    html += '</tr>'
  })
  html += '</tbody></table>'
  return html
}

function renderInline(text: string): string {
  // If no backticks, just apply inline formatting
  if (!text.includes('`')) {
    return escapeHtml(text)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
  }
  // Split by backticks to handle code segments
  const parts = text.split('`')
  let result = ''
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Even index: regular text - apply formatting
      result += escapeHtml(parts[i])
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
    } else {
      // Odd index: code content between backticks
      result += `<code style="background:#cbd5e1;padding:2px 5px;border-radius:4px;font-size:0.8em;font-family:'Fira Code',monospace;color:#334155;border:1px solid #94a3b8;">${escapeHtml(parts[i])}</code>`
    }
  }
  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

interface LinearIssueLabel {
  id: string
  name: string
  color: string
}

interface LinearIssue {
  id: string
  title: string
  identifier: string
  priority: number
  state: { id?: string; name: string; color: string; type: string }
  assignee?: { id?: string; name: string }
  url: string
  dueDate?: string
  description?: string
  estimate?: number | null
  labels?: { nodes: LinearIssueLabel[] }
  project?: { id: string; name: string } | null
}

interface WorkflowState {
  id: string
  name: string
  color: string
  type: string
}

interface AppTeamMember {
  id: number
  name: string
  linearUserId: string
  email: string
  active: boolean
}

interface LinearDashboardData {
  issues: LinearIssue[]
  issueCounts: Record<string, number>
}

interface DragState {
  issueId: string
  fromColType: string
}

const PRIORITY_COLORS: Record<number, string> = {
  0: 'text-slate-300', 1: 'text-red-500', 2: 'text-orange-500', 3: 'text-yellow-500', 4: 'text-slate-400',
}

const PRIORITY_LABELS: Record<number, string> = {
  0: '없음', 1: '긴급', 2: '높음', 3: '보통', 4: '낮음',
}

const STATE_TYPE_LABELS: Record<string, string> = {
  backlog: 'Backlog', unstarted: 'Todo', started: 'In Progress', completed: 'Done', cancelled: 'Cancelled',
}

function IssueModal({
  issue,
  states,
  onClose,
  onUpdate,
}: {
  issue: LinearIssue
  states: WorkflowState[]
  onClose: () => void
  onUpdate: (updated: Partial<LinearIssue>) => void
}) {
  const appApi = useAppApi()
  const { ListTeamMembers, GetLinearTeamLabels, UpdateLinearIssue } = appApi
  const { profile } = useTeamProfile()
  const navigate = useNavigate()
  const [members, setMembers] = useState<AppTeamMember[]>([])
  const [teamLabels, setTeamLabels] = useState<LinearIssueLabel[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  // Local editable state
  const [selStateId, setSelStateId] = useState(issue.state.id ?? '')
  const [selPriority, setSelPriority] = useState(issue.priority)
  // selAssigneeId is the app member's linearUserId (= Linear user ID)
  const [selAssigneeLinearId, setSelAssigneeLinearId] = useState(issue.assignee?.id ?? '')
  const [selDueDate, setSelDueDate] = useState(issue.dueDate ? issue.dueDate.slice(0, 10) : '')
  const [selLabelIds, setSelLabelIds] = useState<string[]>((issue.labels?.nodes || []).map(l => l.id))
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [labelQuery, setLabelQuery] = useState('')
  const labelPickerRef = useRef<HTMLDivElement | null>(null)

  const teamType = (profile?.teamType || 'personal').trim().toLowerCase()
  const canEdit = !!profile?.linearTeamId
  const isPersonalTeam = teamType === 'personal'
  const personalLinearUserId = (profile?.linearUserId || '').trim()
  const personalAssigneeName = (issue.assignee?.name || '').trim() || '본인'

  useEffect(() => {
    ListTeamMembers().then(r => setMembers((r as AppTeamMember[]) || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!canEdit) return
    GetLinearTeamLabels()
      .then(r => setTeamLabels((r as LinearIssueLabel[]) || []))
      .catch(() => {})
  }, [canEdit])

  useEffect(() => {
    if (!labelPickerOpen) return
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (labelPickerRef.current && target && !labelPickerRef.current.contains(target)) {
        setLabelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [labelPickerOpen])

  const currentState = states.find(s => s.id === selStateId) ?? issue.state
  const allLabelOptions: LinearIssueLabel[] = Array.from(
    new Map([...(teamLabels || []), ...((issue.labels?.nodes || []) as LinearIssueLabel[])]
      .map(lbl => [lbl.id, lbl]))
      .values(),
  )
  const filteredLabelOptions = allLabelOptions.filter(lbl =>
    lbl.name.toLowerCase().includes(labelQuery.trim().toLowerCase()),
  )
  const selectedLabels = canEdit
    ? allLabelOptions.filter(lbl => selLabelIds.includes(lbl.id))
    : (issue.labels?.nodes || [])

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const input: Record<string, any> = {}
      if (selStateId && selStateId !== issue.state.id) input.stateId = selStateId
      if (selPriority !== issue.priority) input.priority = selPriority
      const origDue = issue.dueDate ? issue.dueDate.slice(0, 10) : ''
      if (selDueDate !== origDue) input.dueDate = selDueDate === '' ? '__clear__' : selDueDate
      const origAssignee = issue.assignee?.id ?? ''
      if (isPersonalTeam) {
        if (personalLinearUserId && personalLinearUserId !== origAssignee) {
          input.assigneeId = personalLinearUserId
        }
      } else if (selAssigneeLinearId !== origAssignee) {
        input.assigneeId = selAssigneeLinearId === '' ? '__clear__' : selAssigneeLinearId
      }
      const origLabelIds = (issue.labels?.nodes || []).map(l => l.id).sort().join(',')
      const nextLabelIds = [...selLabelIds].sort().join(',')
      if (origLabelIds !== nextLabelIds) {
        input.labelIds = selLabelIds
      }

      if (Object.keys(input).length === 0) { setSaving(false); return }

      await UpdateLinearIssue(issue.id, input as any)

      // Build updated partial to propagate up
      const updated: Partial<LinearIssue> = {}
      if (input.stateId) {
        const ns = states.find(s => s.id === input.stateId)
        if (ns) updated.state = { id: ns.id, name: ns.name, color: ns.color, type: ns.type }
      }
      if (input.priority !== undefined) updated.priority = input.priority
      if (input.dueDate !== undefined) updated.dueDate = input.dueDate === '__clear__' ? undefined : input.dueDate
      if (input.assigneeId !== undefined) {
        if (input.assigneeId === '__clear__') updated.assignee = undefined
        else {
          const m = members.find(m => m.linearUserId === input.assigneeId)
          if (m) updated.assignee = { id: m.linearUserId, name: m.name }
        }
      }
      if (input.labelIds !== undefined) {
        updated.labels = {
          nodes: allLabelOptions.filter(lbl => (input.labelIds as string[]).includes(lbl.id)),
        }
      }
      onUpdate(updated)

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: (currentState as any).color || '#94a3b8' }} />
            <span className="text-xs font-mono text-slate-400">{issue.identifier}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800 leading-snug">{issue.title}</h2>

          <div className="grid grid-cols-2 gap-3">
            {/* State */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Tag size={12} /> 상태
              </label>
              {canEdit && states.length > 0 ? (
                <div className="relative">
                  <select
                    value={selStateId}
                    onChange={e => setSelStateId(e.target.value)}
                    className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 pr-8"
                  >
                    {states.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-700 px-1">
                  {STATE_TYPE_LABELS[issue.state.type] || issue.state.name}
                </p>
              )}
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Flag size={12} /> 우선순위
              </label>
              {canEdit ? (
                <div className="relative">
                  <select
                    value={selPriority}
                    onChange={e => setSelPriority(Number(e.target.value))}
                    className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 pr-8"
                  >
                    {[0,1,2,3,4].map(p => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              ) : (
                <p className={`text-sm font-medium px-1 ${PRIORITY_COLORS[issue.priority]}`}>
                  {PRIORITY_LABELS[issue.priority] ?? '없음'}
                </p>
              )}
            </div>

            {/* Assignee */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <User size={12} /> 담당자
              </label>
              {isPersonalTeam ? (
                <div className="space-y-1">
                  <div
                    className={`text-sm px-3 py-2 rounded-lg border ${
                      personalLinearUserId
                        ? 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200'
                        : 'border-amber-300/80 bg-amber-50/70 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                    }`}
                  >
                    {personalLinearUserId
                      ? `담당자: ${personalAssigneeName}`
                      : '개인 모드에서는 본인 Linear ID 연결이 필요합니다.'}
                  </div>
                  {!personalLinearUserId && (
                    <button
                      type="button"
                      onClick={() => navigate('/settings/integrations')}
                      className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 underline underline-offset-2"
                    >
                      <Link2 size={10} />
                      연동 설정으로 이동
                    </button>
                  )}
                </div>
              ) : canEdit && members.length > 0 ? (
                <div className="space-y-1">
                  <div className="relative">
                    <select
                      value={selAssigneeLinearId}
                      onChange={e => setSelAssigneeLinearId(e.target.value)}
                      className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 pr-8"
                    >
                      <option value="">미지정</option>
                      {members.map(m => (
                        <option
                          key={m.id}
                          value={m.linearUserId ?? ''}
                          disabled={!m.linearUserId}
                        >
                          {m.name}{!m.linearUserId ? ' (Linear 미연결)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {selAssigneeLinearId === '' && members.some(m => !m.linearUserId) && (
                    <p className="flex items-center gap-1 text-xs text-amber-500">
                      <Link2 size={10} />
                      팀원 관리에서 Linear 자동 매핑 후 선택 가능합니다
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-700 px-1">{issue.assignee?.name || '미지정'}</p>
              )}
            </div>

            {/* Due Date */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Calendar size={12} /> 기한
              </label>
              {canEdit ? (
                <input
                  type="date"
                  value={selDueDate}
                  onChange={e => setSelDueDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              ) : (
                <p className="text-sm font-medium text-slate-700 px-1">
                  {issue.dueDate ? issue.dueDate.slice(0, 10) : '없음'}
                </p>
              )}
            </div>
          </div>

          {(canEdit || allLabelOptions.length > 0) && (
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Tag size={12} /> 레이블
              </label>
              {canEdit && allLabelOptions.length > 0 && (
                <div className="relative" ref={labelPickerRef}>
                  <button
                    type="button"
                    onClick={() => setLabelPickerOpen(v => !v)}
                    className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                  >
                    <span>{selLabelIds.length > 0 ? `${selLabelIds.length}개 선택됨` : '레이블 선택'}</span>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${labelPickerOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {labelPickerOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg p-2">
                      <input
                        type="text"
                        placeholder="레이블 검색..."
                        value={labelQuery}
                        onChange={e => setLabelQuery(e.target.value)}
                        className="w-full px-2.5 py-1.5 mb-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                      <div className="max-h-44 overflow-y-auto space-y-1">
                        {filteredLabelOptions.map(lbl => {
                          const active = selLabelIds.includes(lbl.id)
                          return (
                            <button
                              key={lbl.id}
                              type="button"
                              onClick={() => {
                                setSelLabelIds(prev =>
                                  prev.includes(lbl.id) ? prev.filter(id => id !== lbl.id) : [...prev, lbl.id],
                                )
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 text-left"
                            >
                              <span className={`w-4 h-4 rounded border flex items-center justify-center ${active ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300'}`}>
                                {active && <Check size={11} />}
                              </span>
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
                              <span className="text-sm text-slate-700">{lbl.name}</span>
                            </button>
                          )
                        })}
                        {filteredLabelOptions.length === 0 && (
                          <p className="px-2 py-2 text-xs text-slate-400">검색 결과가 없습니다.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {selectedLabels.map(lbl => (
                  <span
                    key={lbl.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: lbl.color + '22', color: lbl.color, border: `1px solid ${lbl.color}44` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
                    {lbl.name}
                  </span>
                ))}
                {selectedLabels.length === 0 && (
                  <span className="text-xs text-slate-400">선택된 레이블 없음</span>
                )}
              </div>
              {canEdit && allLabelOptions.length === 0 && (
                <p className="text-xs text-slate-400">Team ID가 설정되어야 레이블을 불러올 수 있습니다.</p>
              )}
            </div>
          )}

          {false && (canEdit || allLabelOptions.length > 0) && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Tag size={12} /> 레이블
              </label>
              {canEdit && allLabelOptions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {allLabelOptions.map(lbl => {
                    const active = selLabelIds.includes(lbl.id)
                    return (
                      <button
                        key={lbl.id}
                        type="button"
                        onClick={() => {
                          setSelLabelIds(prev =>
                            prev.includes(lbl.id) ? prev.filter(id => id !== lbl.id) : [...prev, lbl.id],
                          )
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          active ? '' : 'opacity-55 hover:opacity-80'
                        }`}
                        style={{ backgroundColor: lbl.color + '22', color: lbl.color, borderColor: lbl.color + '66' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
                        {lbl.name}
                        {active && <Check size={11} />}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(issue.labels?.nodes || []).map(lbl => (
                    <span
                      key={lbl.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: lbl.color + '22', color: lbl.color, border: `1px solid ${lbl.color}44` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
                      {lbl.name}
                    </span>
                  ))}
                </div>
              )}
              {canEdit && allLabelOptions.length === 0 && (
                <p className="text-xs text-slate-400">Team ID가 설정되어야 레이블을 불러올 수 있습니다.</p>
              )}
            </div>
          )}

          {/* Labels */}
          {false && (issue.labels?.nodes?.length || 0) > 0 && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Tag size={12} /> 레이블
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(issue.labels?.nodes || []).map(lbl => (
                  <span
                    key={lbl.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: lbl.color + '22', color: lbl.color, border: `1px solid ${lbl.color}44` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
                    {lbl.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Project */}
          {issue.project && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Briefcase size={12} /> 프로젝트
              </label>
              <p className="text-sm text-slate-700 px-1">{issue.project.name}</p>
            </div>
          )}

          {/* Estimate */}
          {issue.estimate != null && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Hash size={12} /> 예상 포인트
              </label>
              <p className="text-sm text-slate-700 px-1">{issue.estimate}pt</p>
            </div>
          )}

          {/* Description */}
          {issue.description && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <AlignLeft size={12} /> 설명
              </label>
              <p className="text-sm text-slate-600 px-1 whitespace-pre-wrap leading-relaxed line-clamp-6">{issue.description}</p>
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{saveError}</p>
            </div>
          )}

          {!canEdit && (
            <p className="text-xs text-slate-400 text-center">
              팀 ID를 설정하면 이슈를 직접 수정할 수 있습니다
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors"
          >
            <ExternalLink size={14} />
            Linear에서 열기
          </a>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              닫기
            </button>
            {canEdit && (() => {
              // block save if a member without linearUserId is selected
              const assigneeBlocked = isPersonalTeam && !personalLinearUserId
              return (
                <button
                  onClick={handleSave}
                  disabled={saving || !!assigneeBlocked}
                  title={assigneeBlocked ? '개인 모드에서는 연동 설정에서 본인 Linear ID를 먼저 연결해야 저장할 수 있습니다.' : undefined}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
                  {saving ? '저장 중...' : saved ? '저장됨' : '저장'}
                </button>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AI Chat Panel ───────────────────────────────────────────────────────────

interface ClaudeMeta {
  model: string
  numTurns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  costUsd: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function AiChatPanel({
  issues,
  onClose,
  isMaximized,
  onMaximize,
  messages,
  setMessages,
  apiKey,
  setApiKey,
  keyLoaded,
  chatModel,
  setChatModel,
  claudeAvailable,
  claudeSessionID,
  setClaudeSessionID,
  claudeMeta,
  setClaudeMeta,
  cumInputTokens,
  cumOutputTokens,
  cumCostUsd,
  setCumInputTokens,
  setCumOutputTokens,
  setCumCostUsd,
}: {
  issues: LinearIssue[]
  onClose: () => void
  isMaximized: boolean
  onMaximize: () => void
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  apiKey: string
  setApiKey: (k: string) => void
  keyLoaded: boolean
  chatModel: 'openai' | 'claude'
  setChatModel: (m: 'openai' | 'claude') => void
  claudeAvailable: boolean
  claudeSessionID: string
  setClaudeSessionID: (id: string) => void
  claudeMeta: ClaudeMeta | null
  setClaudeMeta: (m: ClaudeMeta | null) => void
  cumInputTokens: number
  cumOutputTokens: number
  cumCostUsd: number
  setCumInputTokens: (n: number | ((prev: number) => number)) => void
  setCumOutputTokens: (n: number | ((prev: number) => number)) => void
  setCumCostUsd: (n: number | ((prev: number) => number)) => void
}) {
  const appApi = useAppApi()
  const { ScanClaudeSkills, ClaudeChatWithSession, CheckClaudeCLI } = appApi
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [localKeyInput, setLocalKeyInput] = useState('')
  const [cmdPopup, setCmdPopup] = useState(false)
  const [cmdIndex, setCmdIndex] = useState(0)
  const [dynamicCmds, setDynamicCmds] = useState<{ skill: string; cmd: string; desc: string }[]>([])
  const cmdListRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scan installed Claude skills on mount
  useEffect(() => {
    ScanClaudeSkills().then(skills => { if (skills?.length) setDynamicCmds(skills) })
  }, [])

  // ── Slash command registry ──
  interface SlashCommand {
    cmd: string
    desc: string
    run: () => void
  }

  // Send a raw skill command directly to claude CLI, maintaining session
  async function handleClaudeSkill(cmd: string) {
    setCmdPopup(false)
    setInput('')
    const userMsg: ChatMessage = { role: 'user', content: cmd }
    setMessages(prev => [...prev, userMsg])
    setSending(true)
    try {
      const res = await ClaudeChatWithSession(cmd, '', claudeSessionID)
      if (res.sessionId) setClaudeSessionID(res.sessionId)
      setClaudeMeta({ model: res.model, numTurns: res.numTurns, inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheReadTokens: res.cacheReadTokens, cacheCreateTokens: res.cacheCreateTokens, costUsd: res.costUsd })
      // Accumulate totals
      setCumInputTokens(prev => prev + res.inputTokens)
      setCumOutputTokens(prev => prev + res.outputTokens)
      setCumCostUsd(prev => prev + res.costUsd)
      const reply = res.reply
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `오류: ${e.message}` }])
    } finally {
      setSending(false)
    }
  }

  const SLASH_COMMANDS: SlashCommand[] = [
    {
      cmd: '/clear',
      desc: '대화 세션 초기화',
      run: () => { setMessages([]); setInput(''); setCmdPopup(false); setClaudeSessionID(''); setClaudeMeta(null); setCumInputTokens(0); setCumOutputTokens(0); setCumCostUsd(0) },
    },
    {
      cmd: '/summary',
      desc: '현재 이슈 전체 요약',
      run: () => { setInput('현재 이슈 전체를 상태별로 요약해줘'); setCmdPopup(false); setTimeout(() => handleSendWith('현재 이슈 전체를 상태별로 요약해줘'), 0) },
    },
    {
      cmd: '/urgent',
      desc: '긴급 우선순위 이슈 목록',
      run: () => { setCmdPopup(false); setTimeout(() => handleSendWith('긴급(Priority 1) 이슈를 모두 알려줘. 미해결이면 특히 표시해줘'), 0) },
    },
    {
      cmd: '/unassigned',
      desc: '미배정 이슈 확인',
      run: () => { setCmdPopup(false); setTimeout(() => handleSendWith('미배정 이슈(담당자 없음)만 모두 나열해줘'), 0) },
    },
    {
      cmd: '/overdue',
      desc: '기한 지난 이슈 확인',
      run: () => { setCmdPopup(false); setTimeout(() => handleSendWith(`오늘은 ${new Date().toISOString().slice(0,10)}이야. 기한이 지난 이슈를 모두 보여줘`), 0) },
    },
    {
      cmd: '/blockers',
      desc: '진행 차단 이슈 분석',
      run: () => { setCmdPopup(false); setTimeout(() => handleSendWith('진행을 차단하는 이슈나 의존성 문제의 이슈를 분석해줘'), 0) },
    },
    {
      cmd: '/ls',
      desc: '[Linear Skill] 사용 가능한 ls 명령어 확인',
      run: () => handleClaudeSkill('/ls'),
    },
    {
      cmd: '/ls:status',
      desc: '[Linear Skill] 현재 작업 세션 상태',
      run: () => handleClaudeSkill('/ls:status'),
    },
    {
      cmd: '/ls:list',
      desc: '[Linear Skill] 이슈 목록 조회',
      run: () => handleClaudeSkill('/ls:list'),
    },
    {
      cmd: '/ls:start',
      desc: '[Linear Skill] 이슈 작업 시작 — /ls:start ISSUE-KEY',
      run: () => { setCmdPopup(false); setInput('/ls:start ') },
    },
    {
      cmd: '/ls:pr',
      desc: '[Linear Skill] 현재 이슈에 PR 생성',
      run: () => handleClaudeSkill('/ls:pr'),
    },
    {
      cmd: '/ls:done',
      desc: '[Linear Skill] 현재 이슈 완료 처리',
      run: () => handleClaudeSkill('/ls:done'),
    },
    {
      cmd: '/help',
      desc: '사용 가능한 명령어 목록',
      run: () => {
        const allCmds = [...SLASH_COMMANDS, ...dynamicCmds.map(d => ({ cmd: d.cmd, desc: `[${d.skill}] ${d.desc}` }))]
        const helpText = allCmds.map(c => `${c.cmd} — ${c.desc}`).join('\n')
        setMessages(prev => [...prev, { role: 'assistant', content: `사용 가능한 명령어:\n\n${helpText}` }])
        setInput('')
        setCmdPopup(false)
      },
    },
  ]

  // Merge dynamic skill commands (deduplicate against hardcoded)
  const hardcodedCmds = new Set(SLASH_COMMANDS.map(c => c.cmd))
  const allSlashCommands = [
    ...SLASH_COMMANDS,
    ...dynamicCmds
      .filter(d => !hardcodedCmds.has(d.cmd))
      .map(d => ({
        cmd: d.cmd,
        desc: `[${d.skill}] ${d.desc}`,
        run: () => handleClaudeSkill(d.cmd),
      })),
  ]

  const filteredCmds = input.startsWith('/')
    ? allSlashCommands.filter(c => c.cmd.startsWith(input.toLowerCase()))
    : []

  useEffect(() => {
    const open = input.startsWith('/') && filteredCmds.length > 0
    setCmdPopup(open)
    if (open) setCmdIndex(0)
  }, [input])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function buildSystemPrompt() {
    const summary = issues.slice(0, 30).map(i => {
      const labels = i.labels?.nodes.map(l => l.name).join(', ') || ''
      const project = i.project?.name || ''
      return `[${i.identifier}] ${i.title} | 상태: ${i.state.name} | 우선순위: ${['없음','긴급','높음','보통','낮음'][i.priority] ?? i.priority}${labels ? ` | 레이블: ${labels}` : ''}${project ? ` | 프로젝트: ${project}` : ''}${i.assignee ? ` | 담당자: ${i.assignee.name}` : ''}`
    }).join('\n')
    return `당신은 Linear 태스크보드 AI 어시스턴트입니다. 현재 팀의 이슈 목록을 바탕으로 질문에 답변하세요.\n\n현재 이슈 목록 (${issues.length}개 중 최대 30개 표시):\n${summary}\n\n이슈에 대한 질문, 진행 상황 분석, 우선순위 추천, 요약 등을 도와드릴 수 있습니다.`
  }

  async function handleSendWith(text: string) {
    if (!text.trim() || sending) return
    if (chatModel === 'openai' && !apiKey) { setShowKeyInput(true); return }
    setShowKeyInput(false)
    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      let reply = ''
      if (chatModel === 'claude') {
        // First turn: pass system context. Subsequent turns: session handles history via --resume
        const ctx = claudeSessionID ? '' : buildSystemPrompt()
        const res = await ClaudeChatWithSession(text.trim(), ctx, claudeSessionID)
        if (res.sessionId) setClaudeSessionID(res.sessionId)
        setClaudeMeta({ model: res.model, numTurns: res.numTurns, inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheReadTokens: res.cacheReadTokens, cacheCreateTokens: res.cacheCreateTokens, costUsd: res.costUsd })
        // Accumulate totals
        setCumInputTokens(prev => prev + res.inputTokens)
        setCumOutputTokens(prev => prev + res.outputTokens)
        setCumCostUsd(prev => prev + res.costUsd)
        reply = res.reply
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: buildSystemPrompt() },
              ...next.map(m => ({ role: m.role, content: m.content })),
            ],
            max_tokens: 1024,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error?.message || `HTTP ${res.status}`)
        }
        const data = await res.json()
        reply = data.choices?.[0]?.message?.content || '(응답 없음)'
      }
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `오류: ${e.message}` }])
    } finally {
      setSending(false)
    }
  }

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed) return
    // Check all slash commands (static + dynamic)
    const exact = allSlashCommands.find(c => c.cmd === trimmed.toLowerCase())
    if (exact) { exact.run(); return }
    // Any unrecognised /xxx command → send to claude CLI directly
    if (trimmed.startsWith('/')) { handleClaudeSkill(trimmed); return }
    handleSendWith(trimmed)
  }

  function saveKey() {
    setApiKey(localKeyInput)
    setShowKeyInput(false)
  }

  const SUGGESTIONS = ['진행 중인 이슈를 요약해줘', '긴급 우선순위 이슈를 알려줘', '미배정 이슈가 있나요?']

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-3 pb-0 border-b border-slate-100 dark:border-slate-700 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-violet-100 dark:bg-violet-500/20 rounded-lg flex items-center justify-center">
              <Bot size={14} className="text-violet-600 dark:text-violet-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">AI 어시스턴트</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{issues.length}개 이슈 컨텍스트 로드됨</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {chatModel === 'openai' && keyLoaded && (
              apiKey
                ? <span className="text-[10px] px-2 py-0.5 bg-green-100 dark:bg-emerald-500/20 text-green-600 dark:text-emerald-300 rounded-full font-medium">API 연결됨</span>
                : <button
                    onClick={() => setShowKeyInput(v => !v)}
                    className="text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 rounded-full font-medium hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors"
                  >
                    API Key 설정
                  </button>
            )}
            {chatModel === 'claude' && (
              <span className="text-[10px] px-2 py-0.5 bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 rounded-full font-medium">로컬 Claude</span>
            )}
            <button onClick={onMaximize} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
        {/* Model selector tabs */}
        <div className="flex gap-1 -mb-px">
          {claudeAvailable && (
            <button
              onClick={() => setChatModel('claude')}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                chatModel === 'claude'
                  ? 'text-violet-700 dark:text-violet-300 border-violet-500 bg-violet-50 dark:bg-violet-500/15'
                  : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Claude (로컬)
            </button>
          )}
          <button
            onClick={() => setChatModel('openai')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
              chatModel === 'openai'
                ? 'text-blue-700 dark:text-blue-300 border-blue-500 bg-blue-50 dark:bg-blue-500/15'
                : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            OpenAI
          </button>
        </div>
      </div>

      {/* Claude session metadata bar */}
      {chatModel === 'claude' && claudeMeta && (
        <div className="px-3 py-1.5 bg-violet-50 dark:bg-violet-500/10 border-b border-violet-100 dark:border-violet-500/20 shrink-0 flex items-center gap-2 flex-wrap">
          <span
            style={{ fontFamily: "'Fira Code', monospace" }}
            className="text-[9px] font-semibold text-violet-600 dark:text-violet-300 bg-violet-100 dark:bg-violet-500/20 px-1.5 py-0.5 rounded truncate max-w-[140px]"
            title={claudeMeta.model}
          >{claudeMeta.model || '—'}</span>
          <span className="text-[9px] text-slate-400 dark:text-slate-500">턴 {Math.ceil(messages.length / 2)}</span>
          <span
            style={{ fontFamily: "'Fira Code', monospace" }}
            className="text-[9px] font-medium text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/20 px-1.5 py-0.5 rounded"
          >in {cumInputTokens.toLocaleString()}</span>
          <span
            style={{ fontFamily: "'Fira Code', monospace" }}
            className="text-[9px] font-medium text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/20 px-1.5 py-0.5 rounded"
          >out {cumOutputTokens.toLocaleString()}</span>
          <span className="text-[9px] text-slate-400 dark:text-slate-500 ml-auto">${cumCostUsd.toFixed(4)}</span>
        </div>
      )}

      {/* API Key input */}
      {showKeyInput && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-100 dark:border-amber-500/20 shrink-0">
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-1.5">OpenAI API Key</p>
          <div className="flex gap-2">
            <input
              type="password"
              value={localKeyInput}
              onChange={e => setLocalKeyInput(e.target.value)}
              placeholder="sk-..."
              className="flex-1 text-xs border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button onClick={saveKey} className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600">
              저장
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
            <div className="w-12 h-12 bg-violet-100 dark:bg-violet-500/20 rounded-2xl flex items-center justify-center">
              <Bot size={22} className="text-violet-500 dark:text-violet-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">태스크보드 AI</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">이슈에 대해 무엇이든 물어보세요</p>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s) }}
                  className="text-xs text-left px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {m.role === 'assistant' && (
                <div className="w-6 h-6 bg-violet-100 dark:bg-violet-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={11} className="text-violet-600 dark:text-violet-300" />
                </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-violet-600 text-white rounded-tr-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-sm'
              }`}
              dangerouslySetInnerHTML={{
                __html: m.role === 'assistant' ? renderMarkdown(m.content) : renderInline(m.content).replace(/\n/g, '<br/>'),
              }}
            />
          </div>
        ))}
        {sending && (
          <div className="flex gap-2">
            <div className="w-6 h-6 bg-violet-100 dark:bg-violet-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Bot size={11} className="text-violet-600 dark:text-violet-300" />
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-3 py-2">
              <Loader2 size={14} className="text-slate-400 dark:text-slate-500 animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 shrink-0">
        {/* Slash command popup */}
        {cmdPopup && filteredCmds.length > 0 && (
          <div ref={cmdListRef} className="mb-2 bg-white dark:bg-[var(--color-card)] border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
            <div className="px-3 py-1 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0">
              <p className="text-[9px] text-slate-400 dark:text-slate-500 tracking-wide">↑↓ 이동 · Tab/Enter 선택 · Esc 닫기</p>
            </div>
            {filteredCmds.map((c, idx) => (
              <button
                key={c.cmd}
                data-idx={idx}
                onMouseDown={e => { e.preventDefault(); c.run(); textareaRef.current?.focus() }}
                onMouseEnter={() => setCmdIndex(idx)}
                className={`w-full flex items-center gap-3 px-3 py-1.5 transition-colors text-left ${
                  idx === cmdIndex ? 'bg-violet-50 dark:bg-violet-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span
                  style={{ fontFamily: "'Fira Code', monospace" }}
                   className={`text-[11px] font-semibold shrink-0 w-36 truncate ${idx === cmdIndex ? 'text-violet-700 dark:text-violet-300' : 'text-violet-500 dark:text-violet-400'}`}
                >{c.cmd}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{c.desc}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setCmdPopup(false); return }
              if (cmdPopup && filteredCmds.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const next = (cmdIndex + 1) % filteredCmds.length
                  setCmdIndex(next)
                  // Scroll selected item into view
                  cmdListRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' })
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const prev = (cmdIndex - 1 + filteredCmds.length) % filteredCmds.length
                  setCmdIndex(prev)
                  cmdListRef.current?.querySelector(`[data-idx="${prev}"]`)?.scrollIntoView({ block: 'nearest' })
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  filteredCmds[cmdIndex].run()
                  textareaRef.current?.focus()
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="질문하거나 / 로 명령어 입력 (Enter 전송)"
            rows={1}
            className="flex-1 resize-none text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 max-h-24 overflow-y-auto"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="p-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl transition-colors shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-300 dark:text-slate-500 text-center">/help 으로 명령어 목록 확인</p>
      </div>
    </div>
  )
}

const COLUMNS = [
  { type: 'backlog', label: 'Backlog', color: 'border-slate-300' },
  { type: 'unstarted', label: 'Todo', color: 'border-blue-400' },
  { type: 'started', label: 'In Progress', color: 'border-amber-400' },
  { type: 'completed', label: 'Done', color: 'border-green-400' },
  { type: 'cancelled', label: 'Cancelled', color: 'border-red-300' },
]

const KNOWN_TYPES = new Set(['backlog', 'unstarted', 'started', 'completed', 'cancelled'])

function resolveStateType(type: string): string {
  if (!type || !KNOWN_TYPES.has(type)) return 'backlog'
  return type
}

export default function TaskBoard() {
  const { profile } = useTeamProfile()
  const appApi = useAppApi()
  const {
    GetLinearDashboard,
    GetMyLinearIssues,
    GetLinearTeamStates,
    UpdateLinearIssueState,
    ListTeamMembers,
    GetIntegrations,
    UpdateLinearIssue,
    CheckClaudeCLI,
    ClaudeChat,
    ClaudeChatWithSession,
    ScanClaudeSkills,
  } = appApi
  const navigate = useNavigate()
  const [issues, setIssues] = useState<LinearIssue[]>([])
  const [states, setStates] = useState<WorkflowState[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null)
  // issueId → 'saving' | 'error'
  const [updateStatus, setUpdateStatus] = useState<Record<string, 'saving' | 'error'>>({})
  // drag state stored in ref to avoid re-renders during drag
  const dragRef = useRef<DragState | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [pollInterval, setPollInterval] = useState(30) // seconds, 0 = off
  const [lastUpdatedText, setLastUpdatedText] = useState('')
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMaximized, setChatMaximized] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatApiKey, setChatApiKey] = useState('')
  const [chatKeyLoaded, setChatKeyLoaded] = useState(false)
  const [chatModel, setChatModel] = useState<'openai' | 'claude'>('openai')
  const [claudeAvailable, setClaudeAvailable] = useState(false)
  const [claudeSessionID, setClaudeSessionID] = useState('')
  const [claudeMeta, setClaudeMeta] = useState<ClaudeMeta | null>(null)
  // Cumulative session stats for accurate totals (API only returns current turn values)
  const [cumInputTokens, setCumInputTokens] = useState(0)
  const [cumOutputTokens, setCumOutputTokens] = useState(0)
  const [cumCostUsd, setCumCostUsd] = useState(0)

  const hasKey = profile?.linearApiKey
  const teamType = (profile?.teamType || 'personal').trim().toLowerCase()
  const isPersonalTeam = teamType === 'personal'

  function normalizeIssues(result: any): LinearIssue[] {
    if (Array.isArray(result)) return result as LinearIssue[]
    return (result?.issues || []) as LinearIssue[]
  }

  async function fetchBoardIssues(): Promise<LinearIssue[]> {
    if (isPersonalTeam) {
      const mine = await GetMyLinearIssues()
      return normalizeIssues(mine)
    }
    const dash = await GetLinearDashboard()
    return normalizeIssues(dash)
  }

  // Check claude CLI availability once on mount
  useEffect(() => {
    CheckClaudeCLI().then(r => { if (r.ok) { setClaudeAvailable(true); setChatModel('claude') } })
  }, [])

  // Load OpenAI key once on mount
  useEffect(() => {
    GetIntegrations().then((ints: any[]) => {
      const openAIInt = ints?.find((i: any) => i.toolType === 'openai')
      if (openAIInt?.enabled && openAIInt.configJson) {
        try {
          const cfg = JSON.parse(openAIInt.configJson)
          if (cfg.apiKey) { setChatApiKey(cfg.apiKey); setChatKeyLoaded(true); return }
        } catch {}
      }
      const stored = localStorage.getItem('openai_api_key') || ''
      setChatApiKey(stored)
      setChatKeyLoaded(true)
    }).catch(() => {
      const stored = localStorage.getItem('openai_api_key') || ''
      setChatApiKey(stored)
      setChatKeyLoaded(true)
    })
  }, [])

  // Auto-poll setup
  useEffect(() => {
    if (!hasKey || pollInterval === 0) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      return
    }
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(pollInterval)
    pollTimerRef.current = setInterval(() => {
      loadSilent()
      setCountdown(pollInterval)
    }, pollInterval * 1000)
    countdownRef.current = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1))
    }, 1000)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [hasKey, pollInterval])

  // Relative time updater
  useEffect(() => {
    if (!lastUpdated) return
    const update = () => {
      const secs = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
      if (secs < 60) setLastUpdatedText(`${secs}초 전`)
      else setLastUpdatedText(`${Math.floor(secs / 60)}분 전`)
    }
    update()
    const t = setInterval(update, 10000)
    return () => clearInterval(t)
  }, [lastUpdated])

  useEffect(() => {
    if (hasKey) load()
  }, [hasKey, isPersonalTeam])

  useEffect(() => {
    if (isPersonalTeam && assigneeFilter) {
      setAssigneeFilter('')
    }
  }, [isPersonalTeam, assigneeFilter])

  // Silent background refresh — does not show loading spinner
  async function loadSilent() {
    try {
      const boardIssues = await fetchBoardIssues()
      setIssues(boardIssues)
      setLastUpdated(new Date())
    } catch { /* silent */ }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [boardIssues, statesResult] = await Promise.all([
        fetchBoardIssues(),
        profile?.linearTeamId ? GetLinearTeamStates() : Promise.resolve([]),
      ])
      setIssues(boardIssues)
      setStates((statesResult as WorkflowState[]) || [])
      setLastUpdated(new Date())
      setCountdown(pollInterval)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // Find the first state matching the target column type
  function findStateForType(targetType: string): WorkflowState | undefined {
    return states.find(s => s.type === targetType)
  }

  async function moveIssue(issueId: string, toColType: string) {
    const targetState = findStateForType(toColType)
    if (!targetState) {
      setError(`'${toColType}' 타입의 상태를 찾을 수 없습니다. 팀 ID를 확인하세요.`)
      return
    }

    // Optimistic update
    setIssues(prev => prev.map(iss =>
      iss.id === issueId
        ? { ...iss, state: { ...iss.state, id: targetState.id, name: targetState.name, type: targetState.type, color: targetState.color } }
        : iss
    ))
    setUpdateStatus(prev => ({ ...prev, [issueId]: 'saving' }))

    try {
      await UpdateLinearIssueState(issueId, targetState.id)
      setUpdateStatus(prev => { const n = { ...prev }; delete n[issueId]; return n })
      // Update selected modal if open
      setSelectedIssue(prev => prev?.id === issueId
        ? { ...prev, state: { ...prev.state, id: targetState.id, name: targetState.name, type: targetState.type, color: targetState.color } }
        : prev
      )
    } catch (e: any) {
      setUpdateStatus(prev => ({ ...prev, [issueId]: 'error' }))
      setError(`상태 변경 실패: ${String(e)}`)
      // Rollback by reloading
      setTimeout(() => load(), 1500)
    }
  }

  if (!hasKey) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <Kanban size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Linear API 연동 필요</h3>
          <p className="text-slate-500 text-sm mb-6">설정 페이지에서 Linear API Key와 Team ID를 입력하면 태스크보드를 사용할 수 있습니다.</p>
          <button
            onClick={() => navigate('/settings/integrations')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm mx-auto transition-colors"
          >
            <Settings size={16} /> 설정하러 가기
          </button>
        </div>
      </div>
    )
  }

  // Derived values
  const assignees = Array.from(new Set(issues.filter(i => i.assignee?.name).map(i => i.assignee!.name)))
  const hasUnassigned = issues.some(i => !i.assignee?.name)

  const filtered = (() => {
    if (!assigneeFilter) return issues
    if (assigneeFilter === '__unassigned__') return issues.filter(i => !i.assignee?.name)
    return issues.filter(i => i.assignee?.name === assigneeFilter)
  })()

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.type] = filtered.filter(i => resolveStateType(i.state.type) === col.type)
    return acc
  }, {} as Record<string, LinearIssue[]>)

  const canDragDrop = states.length > 0

  return (
    <div className="h-full flex flex-col">
      {selectedIssue && (
        <IssueModal
          issue={selectedIssue}
          states={states}
          onClose={() => setSelectedIssue(null)}
          onUpdate={updated => {
            setIssues(prev => prev.map(i => i.id === selectedIssue.id ? { ...i, ...updated } : i))
            setSelectedIssue(prev => prev ? { ...prev, ...updated } : prev)
          }}
        />
      )}

      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <Kanban size={20} className="text-green-600" />
          <h2 className="text-lg font-semibold text-slate-800">Linear 태스크보드</h2>
          {issues.length > 0 && (
            <span className="text-xs text-slate-400">총 {issues.length}개</span>
          )}
          {!canDragDrop && issues.length > 0 && (
            <span className="text-xs text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">
              팀 ID 설정 시 드래그 이동 가능
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isPersonalTeam && (assignees.length > 0 || hasUnassigned) && (
            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체 담당자</option>
              {hasUnassigned && <option value="__unassigned__">담당자 없음</option>}
              {assignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {lastUpdated && (
            <span className="text-xs text-slate-400">
              {lastUpdatedText} 갱신
              {pollInterval > 0 && (
                <span className="ml-1 text-slate-300">({countdown}s)</span>
              )}
            </span>
          )}
          <select
            value={pollInterval}
            onChange={e => setPollInterval(Number(e.target.value))}
            className="text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value={0}>자동갱신 off</option>
            <option value={15}>15초</option>
            <option value={30}>30초</option>
            <option value={60}>1분</option>
            <option value={300}>5분</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-6">
        {error && (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <X size={16} />
            </button>
          </div>
        )}

        {loading && issues.length === 0 && (
          <p className="text-slate-400 text-center py-16">Linear에서 데이터를 불러오는 중...</p>
        )}

        {issues.length > 0 && (
          <div className="flex gap-4 min-w-max">
            {COLUMNS.map(col => (
              <div
                key={col.type}
                className={`w-72 shrink-0 rounded-xl transition-colors duration-150 ${
                  dragOver === col.type ? 'bg-blue-50 ring-2 ring-blue-200' : ''
                }`}
                onDragOver={e => {
                  if (!canDragDrop) return
                  e.preventDefault()
                  setDragOver(col.type)
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOver(null)
                  if (!canDragDrop || !dragRef.current) return
                  const { issueId, fromColType } = dragRef.current
                  dragRef.current = null
                  if (fromColType !== col.type) moveIssue(issueId, col.type)
                }}
              >
                <div className={`flex items-center justify-between mb-3 pb-2 border-b-2 ${col.color}`}>
                  <span className="font-semibold text-slate-700 text-sm">{col.label}</span>
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                    {grouped[col.type]?.length || 0}
                  </span>
                </div>

                <div className="space-y-2 min-h-[60px]">
                  {(grouped[col.type] || []).map(iss => {
                    const status = updateStatus[iss.id]
                    return (
                      <div
                        key={iss.id}
                        draggable={canDragDrop}
                        onDragStart={() => {
                          dragRef.current = { issueId: iss.id, fromColType: col.type }
                        }}
                        onDragEnd={() => { dragRef.current = null; setDragOver(null) }}
                        onClick={() => setSelectedIssue(iss)}
                        className={`bg-white border rounded-xl p-3 transition-all duration-150 group
                          will-change-transform
                          ${canDragDrop ? 'cursor-grab active:cursor-grabbing active:scale-95 active:shadow-lg active:rotate-1' : 'cursor-pointer'}
                          ${status === 'saving' ? 'opacity-60 border-blue-300' : ''}
                          ${status === 'error' ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300'}
                        `}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="text-xs font-mono text-slate-400">{iss.identifier}</span>
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: iss.state.color || '#94a3b8' }}
                              />
                              {status === 'saving' && (
                                <Loader2 size={10} className="text-blue-400 animate-spin ml-auto" />
                              )}
                            </div>
                            <p className="text-sm text-slate-700 leading-snug mb-2">{iss.title}</p>
                            {iss.labels && iss.labels.nodes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1.5">
                                {iss.labels.nodes.map(lbl => (
                                  <span
                                    key={lbl.id}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none"
                                    style={{ backgroundColor: lbl.color + '22', color: lbl.color }}
                                  >
                                    {lbl.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {iss.project && (
                              <p className="text-[10px] text-slate-400 mb-1 truncate">{iss.project.name}</p>
                            )}
                            <div className="flex items-center justify-between">
                              <span className={`text-xs ${PRIORITY_COLORS[iss.priority] || ''}`}>
                                {PRIORITY_LABELS[iss.priority] ?? ''}
                              </span>
                              {iss.assignee && (
                                <span className="text-xs text-slate-400">{iss.assignee.name}</span>
                              )}
                            </div>
                            {iss.dueDate && (
                              <p className="text-xs text-slate-400 mt-1">기한: {iss.dueDate.slice(0, 10)}</p>
                            )}
                          </div>
                          <ExternalLink
                            size={12}
                            className="opacity-0 group-hover:opacity-40 text-slate-400 mt-0.5 shrink-0 transition-opacity"
                          />
                        </div>
                      </div>
                    )
                  })}

                  {(grouped[col.type] || []).length === 0 && (
                    <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                      dragOver === col.type ? 'border-blue-300 bg-blue-50' : 'border-slate-200'
                    }`}>
                      <p className="text-xs text-slate-300">없음</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── AI Chat floating panel (always mounted to preserve session) ── */}
      <div
        className="fixed z-40 bg-white dark:bg-[var(--color-card)] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
        style={{
          transition: 'top 0.35s cubic-bezier(0.4, 0, 0.2, 1), right 0.35s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          top: chatMaximized ? 16 : 'calc(100vh - 680px - 24px)',
          right: chatMaximized ? 16 : 24,
          bottom: chatMaximized ? 16 : 24,
          left: chatMaximized ? 16 : 'calc(100vw - 480px - 24px)',
          width: chatMaximized ? 'calc(100vw - 32px)' : 480,
          height: chatMaximized ? 'calc(100vh - 32px)' : 680,
          display: chatOpen ? 'flex' : 'none',
          animation: chatOpen ? (chatMaximized ? 'fadeIn 0.25s ease-out' : 'slideUp 0.25s ease-out') : undefined,
        }}
      >
        <AiChatPanel
          issues={issues}
          onClose={() => setChatOpen(false)}
          isMaximized={chatMaximized}
          onMaximize={() => setChatMaximized(v => !v)}
          messages={chatMessages}
          setMessages={setChatMessages}
          apiKey={chatApiKey}
          setApiKey={(k) => { setChatApiKey(k); localStorage.setItem('openai_api_key', k) }}
          keyLoaded={chatKeyLoaded}
          chatModel={chatModel}
          setChatModel={setChatModel}
          claudeAvailable={claudeAvailable}
          claudeSessionID={claudeSessionID}
          setClaudeSessionID={setClaudeSessionID}
          claudeMeta={claudeMeta}
          setClaudeMeta={setClaudeMeta}
          cumInputTokens={cumInputTokens}
          cumOutputTokens={cumOutputTokens}
          cumCostUsd={cumCostUsd}
          setCumInputTokens={setCumInputTokens}
          setCumOutputTokens={setCumOutputTokens}
          setCumCostUsd={setCumCostUsd}
        />
      </div>

      {/* ── Floating AI button (only shown when chat is closed) ── */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg transition-all duration-200 bg-violet-600 hover:bg-violet-700 text-white"
        >
          <MessageSquare size={16} />
          <span className="text-sm font-medium">AI 채팅</span>
          {issues.length > 0 && (
            <span className="bg-white/30 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">{issues.length}</span>
          )}
        </button>
      )}
    </div>
  )
}
