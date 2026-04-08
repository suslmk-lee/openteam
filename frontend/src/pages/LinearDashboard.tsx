import { useEffect, useState } from 'react'
import { GetLinearDashboard } from '../../wailsjs/go/main/App'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import { useNavigate } from 'react-router-dom'
import {
  GitBranch,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Settings,
} from 'lucide-react'

interface LinearIssueState {
  name: string
  color: string
  type: string
}

interface LinearIssue {
  id: string
  title: string
  identifier: string
  priority: number
  state: LinearIssueState
  assignee?: { name: string }
  url: string
  createdAt: string
  updatedAt: string
  dueDate?: string
}

interface LinearProject {
  id: string
  name: string
  state: string
  progress: number
  url: string
}

interface LinearCycle {
  id: string
  name: string
  number: number
  startsAt: string
  endsAt: string
  completedAt?: string
  issueCount: number
  completedIssueCount: number
}

interface LinearDashboardData {
  projects: LinearProject[]
  issues: LinearIssue[]
  cycles: LinearCycle[]
  issueCounts: Record<string, number>
}

const PRIORITY_LABELS: Record<number, string> = { 0: '없음', 1: '긴급', 2: '높음', 3: '보통', 4: '낮음' }
const PRIORITY_COLORS: Record<number, string> = {
  0: 'text-slate-400',
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-yellow-500',
  4: 'text-slate-400',
}

const STATE_TYPE_ORDER = ['started', 'unstarted', 'backlog', 'completed', 'cancelled']

function groupByState(issues: LinearIssue[]): Record<string, LinearIssue[]> {
  return issues.reduce((acc, iss) => {
    const key = iss.state.type || 'backlog'
    acc[key] = acc[key] || []
    acc[key].push(iss)
    return acc
  }, {} as Record<string, LinearIssue[]>)
}

const STATE_TYPE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  unstarted: 'Todo',
  started: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
}

const STATE_TYPE_COLORS: Record<string, string> = {
  backlog: 'bg-slate-100 text-slate-600',
  unstarted: 'bg-blue-100 text-blue-600',
  started: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-400',
}

export default function LinearDashboard() {
  const { profile } = useTeamProfile()
  const navigate = useNavigate()
  const [data, setData] = useState<LinearDashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'board' | 'projects' | 'cycles'>('board')

  const hasKey = profile?.linearApiKey

  useEffect(() => {
    if (hasKey) load()
  }, [hasKey])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await GetLinearDashboard()
      setData(result as LinearDashboardData)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  if (!hasKey) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <GitBranch size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Linear API 연동 필요</h3>
          <p className="text-slate-500 text-sm mb-6">설정 페이지에서 Linear API Key와 Team ID를 입력하면 프로젝트/이슈 현황을 바로 확인할 수 있습니다.</p>
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

  const grouped = data ? groupByState(data.issues) : {}

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <GitBranch size={20} className="text-violet-500" />
          <h2 className="text-lg font-semibold text-slate-800">Linear 대시보드</h2>
          {data && (
            <div className="flex gap-2 text-xs">
              {Object.entries(data.issueCounts).map(([type, count]) => (
                <span key={type} className={`px-2 py-0.5 rounded-full ${STATE_TYPE_COLORS[type] || 'bg-slate-100 text-slate-500'}`}>
                  {STATE_TYPE_LABELS[type] || type} {count}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white px-6">
        <div className="flex gap-0">
          {[['board', '이슈 보드'], ['projects', '프로젝트'], ['cycles', '사이클']].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && !data && (
          <p className="text-slate-400 text-center py-16">Linear에서 데이터를 불러오는 중...</p>
        )}

        {/* Board view */}
        {activeTab === 'board' && data && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {STATE_TYPE_ORDER.filter(t => grouped[t]?.length).map(stateType => (
              <div key={stateType} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className={`px-4 py-2.5 border-b border-slate-100 flex items-center justify-between`}>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_TYPE_COLORS[stateType] || ''}`}>
                    {STATE_TYPE_LABELS[stateType] || stateType}
                  </span>
                  <span className="text-xs text-slate-400">{grouped[stateType].length}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {grouped[stateType].map(iss => (
                    <div key={iss.id} className="p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs text-slate-400 font-mono shrink-0">{iss.identifier}</span>
                            <span className={`text-xs font-medium ${PRIORITY_COLORS[iss.priority] || ''}`}>
                              {PRIORITY_LABELS[iss.priority] || ''}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 leading-snug line-clamp-2">{iss.title}</p>
                          {iss.assignee && (
                            <p className="text-xs text-slate-400 mt-1">{iss.assignee.name}</p>
                          )}
                        </div>
                        <a href={iss.url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 hover:bg-slate-200 rounded" onClick={e => e.stopPropagation()}>
                          <ExternalLink size={12} className="text-slate-400" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Projects view */}
        {activeTab === 'projects' && data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.projects.length === 0 ? (
              <p className="text-slate-400 text-sm col-span-2 text-center py-8">프로젝트가 없습니다</p>
            ) : data.projects.map(proj => (
              <div key={proj.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="font-medium text-slate-800">{proj.name}</p>
                  <a href={proj.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <ExternalLink size={14} className="text-slate-400 hover:text-slate-600" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.round(proj.progress * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{Math.round(proj.progress * 100)}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">{proj.state}</p>
              </div>
            ))}
          </div>
        )}

        {/* Cycles view */}
        {activeTab === 'cycles' && data && (
          <div className="space-y-3">
            {data.cycles.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">사이클이 없습니다</p>
            ) : data.cycles.map(cycle => {
              const completionRate = cycle.issueCount > 0 ? Math.round((cycle.completedIssueCount / cycle.issueCount) * 100) : 0
              const isActive = !cycle.completedAt
              return (
                <div key={cycle.id} className={`bg-white border rounded-xl p-4 ${isActive ? 'border-blue-300' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                        {isActive ? '진행중' : '완료'}
                      </span>
                      <span className="font-medium text-slate-800">{cycle.name || `Cycle #${cycle.number}`}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{completionRate}%</span>
                  </div>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 mb-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${completionRate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{cycle.startsAt?.slice(0, 10)} ~ {cycle.endsAt?.slice(0, 10)}</span>
                    <span>이슈 {cycle.completedIssueCount}/{cycle.issueCount}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
