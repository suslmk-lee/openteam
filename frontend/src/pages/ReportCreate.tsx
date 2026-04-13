import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  Mail,
  Calendar,
  Clipboard,
  CircleDot,
  MessageCircle,
  Pencil,
  Filter,
  Users,
} from 'lucide-react'
import { GetCurrentWeek, GetWeekByOffset, GetOrCreateWeeklyReport, GetWeekActivities, AddActivityToReport, GetReportItems, AddManualActivity, SyncAll, PopulateReportFromTeamData, PopulateReportFromProjects } from '../../wailsjs/go/main/App'
import { Briefcase } from 'lucide-react'
import { useTeamProfile } from '../contexts/TeamProfileContext'

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  mail: <Mail size={16} />,
  calendar: <Calendar size={16} />,
  clipboard: <Clipboard size={16} />,
  'circle-dot': <CircleDot size={16} />,
  'message-circle': <MessageCircle size={16} />,
  pencil: <Pencil size={16} />,
}

interface WeekInfo {
  weekStart: string
  weekEnd: string
  label: string
}

interface Activity {
  id: number
  source: string
  title: string
  summary: string
  activityDate: string
  sourceLabel: string
  sourceIcon: string
}

interface ReportItem {
  id: number
  activityId?: number
  section: string
  category: string
  content: string
  period: string
  isSelected: boolean
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { profile } = useTeamProfile()
  const teamType = profile?.teamType || 'personal'
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [reportItems, setReportItems] = useState<ReportItem[]>([])
  const [reportId, setReportId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedSource, setSelectedSource] = useState<string>('all')
  const [addedActivityIds, setAddedActivityIds] = useState<Set<number>>(new Set())

  // Manual entry state
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualSummary, setManualSummary] = useState('')
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  useEffect(() => {
    loadWeek()
  }, [weekOffset])

  async function loadWeek() {
    try {
      setLoading(true)
      const week = weekOffset === 0
        ? await GetCurrentWeek()
        : await GetWeekByOffset(weekOffset)
      setWeekInfo(week)

      const report = await GetOrCreateWeeklyReport(week.weekStart, week.weekEnd)
      setReportId(report.id)

      const [acts, items] = await Promise.all([
        GetWeekActivities(week.weekStart, week.weekEnd),
        GetReportItems(report.id),
      ])
      setActivities(acts || [])
      setReportItems(items || [])

      const addedIds = new Set<number>()
      ;(items || []).forEach((item: ReportItem) => {
        if (item.activityId != null) addedIds.add(item.activityId)
      })
      setAddedActivityIds(addedIds)
    } catch (err) {
      console.error('Failed to load week:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddToReport(activity: Activity) {
    if (!reportId) return
    try {
      await AddActivityToReport(reportId, activity.id, 'project_progress', '')
      setAddedActivityIds(prev => new Set(prev).add(activity.id))
      const items = await GetReportItems(reportId)
      setReportItems(items || [])
    } catch (err) {
      console.error('Failed to add to report:', err)
    }
  }

  async function handleAddManual() {
    if (!weekInfo || !manualTitle.trim()) return
    try {
      await AddManualActivity(manualTitle, manualSummary, weekInfo.weekStart)
      setManualTitle('')
      setManualSummary('')
      setShowManualForm(false)
      await loadWeek()
    } catch (err) {
      console.error('Failed to add manual activity:', err)
    }
  }

  const filteredActivities = selectedSource === 'all'
    ? activities
    : activities.filter(a => a.sourceLabel === selectedSource)

  const sources = Array.from(new Set(activities.map(a => a.sourceLabel)))

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-800">보고서 생성</h2>
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-1 py-1">
            <button
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="p-1 rounded hover:bg-slate-200 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-2 min-w-[140px] text-center">
              <div className="text-sm font-medium">
                {weekInfo?.label || '로딩 중...'}
              </div>
              {weekInfo && (
                <div className="text-xs text-slate-500">
                  {weekInfo.weekStart.slice(5)} ~ {weekInfo.weekEnd.slice(5)}
                </div>
              )}
            </div>
            <button
              onClick={() => setWeekOffset(prev => prev + 1)}
              className="p-1 rounded hover:bg-slate-200 transition-colors"
              disabled={weekOffset >= 0}
            >
              <ChevronRight size={18} />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="ml-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                오늘
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
              {syncMsg}
            </span>
          )}
          <button
            onClick={async () => {
              if (!weekInfo) return
              setLoading(true)
              setSyncMsg('동기화 중...')
              try {
                const results = await SyncAll(weekInfo.weekStart, weekInfo.weekEnd)
                const msgs = results
                  .map((r: any) => r.message)
                  .join(' | ')
                setSyncMsg(msgs)
                setTimeout(() => setSyncMsg(null), 5000)
                await loadWeek()
              } catch (err) {
                console.error('Sync failed:', err)
                setSyncMsg('동기화 실패')
                setTimeout(() => setSyncMsg(null), 3000)
                setLoading(false)
              }
            }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            동기화
          </button>
          {reportId && (teamType === 'si_business' || teamType === 'si_field') && (
            <button
              onClick={async () => {
                if (!reportId || !weekInfo) return
                setSyncMsg('프로젝트 데이터 반영 중...')
                try {
                  const count = await PopulateReportFromProjects(reportId, weekInfo.weekStart, weekInfo.weekEnd)
                  setSyncMsg(`프로젝트 데이터 ${count}건 반영 완료`)
                  setTimeout(() => setSyncMsg(null), 4000)
                  await loadWeek()
                } catch (err) {
                  console.error('Failed to populate project data:', err)
                  setSyncMsg('프로젝트 데이터 반영 실패')
                  setTimeout(() => setSyncMsg(null), 3000)
                }
              }}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg transition-colors"
            >
              <Briefcase size={16} />
              프로젝트 데이터 반영
            </button>
          )}
          {reportId && teamType !== 'personal' && (
            <button
              onClick={async () => {
                if (!reportId) return
                setSyncMsg('팀 데이터 반영 중...')
                try {
                  const count = await PopulateReportFromTeamData(reportId)
                  setSyncMsg(`팀 데이터 ${count}건 반영 완료`)
                  setTimeout(() => setSyncMsg(null), 4000)
                  await loadWeek()
                } catch (err) {
                  console.error('Failed to populate team data:', err)
                  setSyncMsg('팀 데이터 반영 실패')
                  setTimeout(() => setSyncMsg(null), 3000)
                }
              }}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors"
            >
              <Users size={16} />
              팀 데이터 반영
            </button>
          )}
          {reportId && (
            <button
              onClick={() => navigate(`/report/${reportId}`)}
              className="flex items-center gap-2 px-4 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium"
            >
              <FileSpreadsheet size={16} />
              보고서 편집 ({reportItems.length})
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Source filter */}
          <div className="flex items-center gap-2 mb-4">
            <Filter size={16} className="text-slate-400" />
            <button
              onClick={() => setSelectedSource('all')}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                selectedSource === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              전체
            </button>
            {sources.map(source => (
              <button
                key={source}
                onClick={() => setSelectedSource(source)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  selectedSource === source
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {source}
              </button>
            ))}
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="ml-auto flex items-center gap-1 px-3 py-1 text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
            >
              <Plus size={14} />
              수동 입력
            </button>
          </div>

          {/* Manual entry form */}
          {showManualForm && (
            <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-700 mb-3">수동 업무 입력</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="업무 제목"
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <textarea
                  placeholder="상세 내용 (선택)"
                  value={manualSummary}
                  onChange={e => setManualSummary(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowManualForm(false)}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddManual}
                    disabled={!manualTitle.trim()}
                    className="px-4 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Activities list */}
          {filteredActivities.length === 0 && !loading ? (
            <div className="text-center py-16 text-slate-400">
              <FileSpreadsheet size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">이번 주 활동이 없습니다</p>
              <p className="text-sm mt-1">
                협업툴을 연동하거나 수동으로 업무를 입력해주세요
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredActivities.map(activity => {
                const isAdded = addedActivityIds.has(activity.id)
                return (
                  <div
                    key={activity.id}
                    className={`bg-white border rounded-xl p-4 flex items-start gap-4 transition-all hover:shadow-sm ${
                      isAdded ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'
                    }`}
                  >
                    {/* Source icon */}
                    <div className="mt-0.5 p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                      {SOURCE_ICONS[activity.sourceIcon] || <Clipboard size={16} />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-400 font-medium">
                          {activity.sourceLabel}
                        </span>
                        <span className="text-xs text-slate-300">•</span>
                        <span className="text-xs text-slate-400">
                          {activity.activityDate}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-slate-800 truncate">
                        {activity.title}
                      </h4>
                      {activity.summary && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {activity.summary}
                        </p>
                      )}
                    </div>

                    {/* Add to report button */}
                    <button
                      onClick={() => !isAdded && handleAddToReport(activity)}
                      disabled={isAdded}
                      className={`shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        isAdded
                          ? 'bg-blue-100 text-blue-600 cursor-default'
                          : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600'
                      }`}
                    >
                      {isAdded ? <Check size={14} /> : <Plus size={14} />}
                      {isAdded ? '추가됨' : '보고서에 추가'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
