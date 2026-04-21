import { useEffect, useRef, useState } from 'react'
import { useAppApi } from '../hooks/useAppApi'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import { useNavigate } from 'react-router-dom'
import { Kanban, RefreshCw, ExternalLink, AlertCircle, Settings, X, User, Calendar, Tag, Flag, Loader2, Check, ChevronDown, Link2, Briefcase, AlignLeft, Hash } from 'lucide-react'
import { AiChatPanel as SharedAiChatPanel } from '../features/chat/AiChatPanel'
import { buildTaskBoardChatContext } from '../features/chat/providers/taskBoardContext'
import { useAiChatSession } from '../features/chat/useAiChatSession'
import type { ChatCommand } from '../features/chat/types'

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
    UpdateLinearIssue,
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
  const chatSession = useAiChatSession(query => buildTaskBoardChatContext(query, issues))

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
  const taskBoardCommands: ChatCommand[] = [
    {
      cmd: '/clear',
      desc: '채팅 세션 초기화',
      run: () => {
        chatSession.clearSession()
        return true
      },
    },
    {
      cmd: '/summary',
      desc: '현재 이슈 요약',
      run: async () => {
        if (chatSession.sending || (chatSession.chatModel !== 'claude' && !chatSession.apiKey)) {
          return false
        }
        return chatSession.handleSendText('현재 이슈를 상태와 우선순위 기준으로 요약해줘.')
      },
    },
    {
      cmd: '/urgent',
      desc: '긴급 이슈 목록',
      run: async () => {
        if (chatSession.sending || (chatSession.chatModel !== 'claude' && !chatSession.apiKey)) {
          return false
        }
        return chatSession.handleSendText('긴급 이슈와 블로커를 보여줘.')
      },
    },
    {
      cmd: '/unassigned',
      desc: '미할당 이슈 목록',
      run: async () => {
        if (chatSession.sending || (chatSession.chatModel !== 'claude' && !chatSession.apiKey)) {
          return false
        }
        return chatSession.handleSendText('담당자가 지정되지 않은 이슈를 모두 보여줘.')
      },
    },
    {
      cmd: '/overdue',
      desc: '기한 초과 이슈 목록',
      run: async () => {
        if (chatSession.sending || (chatSession.chatModel !== 'claude' && !chatSession.apiKey)) {
          return false
        }
        return chatSession.handleSendText(`오늘 날짜는 ${new Date().toISOString().slice(0, 10)}야. 기한이 지난 이슈를 보여줘.`)
      },
    },
  ]

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

      <SharedAiChatPanel
        session={chatSession}
        title="Linear AI 어시스턴트"
        subtitle="현재 이슈 컨텍스트를 바탕으로 답변합니다."
        buttonLabel="AI 채팅"
        badgeCount={issues.length}
        suggestions={[
          '현재 이슈를 요약해줘',
          '블로커가 있는 긴급 이슈를 보여줘',
          '담당자 없는 이슈를 보여줘',
        ]}
        commands={taskBoardCommands}
        allowUnknownSlashPassthrough
      />
    </div>
  )
}
