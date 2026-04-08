import { useEffect, useState } from 'react'
import { ListIssues, SaveIssue, DeleteIssue } from '../../wailsjs/go/main/App'
import { Plus, AlertTriangle, Pencil, Trash2, X, CheckCircle2 } from 'lucide-react'

type Issue = {
  id: number
  userId: number
  projectId?: number | null
  title: string
  description: string
  severity: string
  status: string
  assignee: string
  dueDate?: string | null
  createdAt: string
}

const SEVERITY_LABELS: Record<string, string> = { critical: '치명적', high: '높음', medium: '보통', low: '낮음' }
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
}
const STATUS_LABELS: Record<string, string> = { open: '미처리', in_progress: '처리중', resolved: '해결됨', closed: '종료' }
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-50 text-red-600',
  in_progress: 'bg-blue-50 text-blue-600',
  resolved: 'bg-green-50 text-green-600',
  closed: 'bg-slate-100 text-slate-500',
}

const EMPTY_ISSUE: Partial<Issue> = { title: '', description: '', severity: 'medium', status: 'open', assignee: '', dueDate: null }

export default function FieldIssues() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Partial<Issue>>(EMPTY_ISSUE)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    try {
      const data = await ListIssues(statusFilter)
      setIssues(data || [])
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditing({ ...EMPTY_ISSUE })
    setShowModal(true)
  }

  function openEdit(issue: Issue) {
    setEditing({ ...issue })
    setShowModal(true)
  }

  async function handleSave() {
    if (!editing.title?.trim()) return
    setSaving(true)
    try {
      await SaveIssue(editing as any)
      setShowModal(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이슈를 삭제하시겠습니까?')) return
    await DeleteIssue(id)
    await load()
  }

  const openCount = issues.filter(i => i.status === 'open').length
  const inProgressCount = issues.filter(i => i.status === 'in_progress').length

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-800">이슈/리스크 트래커</h2>
          <div className="flex gap-2 text-xs">
            <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full">미처리 {openCount}</span>
            <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">처리중 {inProgressCount}</span>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={16} /> 이슈 등록
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {[['', '전체'], ['open', '미처리'], ['in_progress', '처리중'], ['resolved', '해결됨'], ['closed', '종료']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${statusFilter === val ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-slate-400 text-center py-12">로딩 중...</p>
        ) : issues.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-400">등록된 이슈가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map(issue => (
              <div key={issue.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[issue.severity] || ''}`}>
                        {SEVERITY_LABELS[issue.severity] || issue.severity}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[issue.status] || ''}`}>
                        {STATUS_LABELS[issue.status] || issue.status}
                      </span>
                      {issue.assignee && <span className="text-xs text-slate-400">담당: {issue.assignee}</span>}
                      {issue.dueDate && <span className="text-xs text-slate-400">기한: {issue.dueDate}</span>}
                    </div>
                    <p className="font-medium text-slate-800">{issue.title}</p>
                    {issue.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{issue.description}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(issue)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                      <Pencil size={15} className="text-slate-400" />
                    </button>
                    <button onClick={() => handleDelete(issue.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={15} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
            <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6">
              <h3 className="font-semibold text-slate-800">{editing.id ? '이슈 수정' : '이슈 등록'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">제목 *</label>
                <input
                  type="text"
                  value={editing.title || ''}
                  onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="이슈 제목을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">설명</label>
                <textarea
                  value={editing.description || ''}
                  onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="상세 내용"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">심각도</label>
                  <select
                    value={editing.severity || 'medium'}
                    onChange={e => setEditing(p => ({ ...p, severity: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(SEVERITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">상태</label>
                  <select
                    value={editing.status || 'open'}
                    onChange={e => setEditing(p => ({ ...p, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">담당자</label>
                  <input
                    type="text"
                    value={editing.assignee || ''}
                    onChange={e => setEditing(p => ({ ...p, assignee: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="이름"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">기한</label>
                  <input
                    type="date"
                    value={editing.dueDate || ''}
                    onChange={e => setEditing(p => ({ ...p, dueDate: e.target.value || null }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editing.title?.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded-lg"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
