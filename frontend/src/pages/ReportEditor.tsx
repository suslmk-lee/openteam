import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  Plus,
  Trash2,
  GripVertical,
  Save,
  CheckCircle,
  RefreshCw,
  Pencil,
  FileSpreadsheet,
  Copy,
  Sparkles,
  GitBranch,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { generateMarkdown } from '../utils/generateMarkdown'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import { useAppApi } from '../hooks/useAppApi'
import { useReportInsights } from '../hooks/useReportInsights'
import type { db } from '../../wailsjs/go/models'

interface ReportItem {
  id: number
  reportId: number
  activityId?: number
  section: string
  category: string
  workType: string
  content: string
  period: string
  sortOrder: number
  isSelected: boolean
}

interface ProjectCategory {
  id: number
  name: string
}

const ALL_SECTIONS = [
  { key: 'project_progress', label: '프로젝트 진행사항', period: 'this_week' },
  { key: 'next_week_plan', label: '차주 계획', period: 'next_week' },
  { key: 'issues', label: '이슈/리스크', period: 'this_week' },
  { key: 'business_dev', label: '사업개발/영업', period: 'this_week' },
  { key: 'attendance', label: '근태', period: 'this_week' },
  { key: 'hiring', label: '인력채용', period: 'this_week' },
  { key: 'other', label: '기타', period: 'this_week' },
]

const getVisibleSections = (teamType: string) => {
  if (teamType === 'personal') {
    // 개인 팀은 팀 관리 기능(근태, 인력채용) 및 팀 영업(사업개발) 제외
    return ALL_SECTIONS.filter(s => !['business_dev', 'attendance', 'hiring'].includes(s.key))
  }
  return ALL_SECTIONS
}

const PERIODS = [
  { key: 'this_week', label: '금주 현황' },
  { key: 'next_week', label: '차주 계획' },
]

export default function ReportEditor() {
  const appApi = useAppApi()
  const {
    GetReportItems,
    UpdateReportItem,
    DeleteReportItem,
    AddReportItem,
    ExportWeeklyReport,
    GetProjectCategories,
    PreprocessReportItemsWithAI,
    OpenFile,
    RefineMarkdownWithAI,
    GetWeeklyReport,
    PopulateReportFromLinear,
  } = appApi

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reportId = Number(id)

  const [items, setItems] = useState<ReportItem[]>([])
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [exportedFilePath, setExportedFilePath] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [preprocessing, setPreprocessing] = useState(false)
  const [activePeriod, setActivePeriod] = useState('this_week')

  const { profile } = useTeamProfile()
  const teamType = profile?.teamType || 'personal'

  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  const [markdownText, setMarkdownText] = useState('')
  const [refinedMarkdown, setRefinedMarkdown] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [weekInfo, setWeekInfo] = useState<{ weekStart: string; weekEnd: string; label: string } | null>(null)
  const [linearLoading, setLinearLoading] = useState(false)
  const [insightActivityConfig, setInsightActivityConfig] = useState<Record<number, { section: string; period: string }>>({})
  const [draftEditMode, setDraftEditMode] = useState<Record<string, boolean>>({})
  const [draftEditValue, setDraftEditValue] = useState<Record<string, { section: string; period: string; content: string }>>({})
  const [evidenceOpen, setEvidenceOpen] = useState<Record<string, boolean>>({})
  const {
    insights,
    loading: insightsLoading,
    acceptActivity: acceptInsightActivity,
    acceptDraft: acceptInsightDraft,
    ignoreActivity: ignoreInsightActivity,
    refresh: refreshInsights,
  } = useReportInsights(Number.isFinite(reportId) && reportId > 0 ? reportId : null)

  useEffect(() => {
    initializeEditor()
  }, [reportId])

  async function initializeEditor() {
    await runPreprocess(true)
  }

  async function handleWorkTypeChange(item: ReportItem, workType: string) {
    try {
      await UpdateReportItem({ ...item, workType })
      await loadData()
      showStatus('업무 구분이 저장되었습니다')
    } catch (err) {
      console.error('Failed to update work type:', err)
    }
  }

  async function loadData() {
    try {
      const [reportItems, cats, report] = await Promise.all([
        GetReportItems(reportId),
        GetProjectCategories(),
        GetWeeklyReport(reportId),
      ])

      setItems(reportItems || [])
      setCategories(cats || [])

      if (report) {
        setWeekInfo({
          weekStart: report.weekStart,
          weekEnd: report.weekEnd,
          label: `${report.weekStart} ~ ${report.weekEnd}`,
        })
      }
      await refreshInsights()
    } catch (err) {
      console.error('Failed to load report data:', err)
    }
  }

  async function handleInsightAcceptActivity(activity: db.ReportInsightActivity) {
    try {
      const config = getActivityConfig(activity)
      const section = config.section
      const period = config.period
      const activityId = activity.activityId
      await acceptInsightActivity(activityId, section, '', period)
      await loadData()
      showStatus('인사이트 활동을 보고서에 반영했습니다')
    } catch (err: any) {
      showStatus(err?.message || '인사이트 반영에 실패했습니다')
    }
  }

  async function handleInsightAcceptDraft(draft: db.ReportInsightDraft) {
    try {
      const value = getDraftEditValue(draft)
      await acceptInsightDraft({ ...draft, suggestedSection: value.section }, value.period)
      await loadData()
      showStatus('초안 후보를 반영했습니다')
    } catch (err: any) {
      showStatus(err?.message || '초안 반영에 실패했습니다')
    }
  }

  async function handleInsightAcceptDraftEdited(draft: db.ReportInsightDraft) {
    try {
      const value = getDraftEditValue(draft)
      await AddReportItem(reportId, value.section, '', value.content, undefined, value.period)
      setDraftEditMode(prev => ({ ...prev, [draft.key]: false }))
      await loadData()
      showStatus('수정 초안을 새 항목으로 반영했습니다')
    } catch (err: any) {
      showStatus(err?.message || '수정 초안 반영에 실패했습니다')
    }
  }

  async function handleInsightIgnore(activityId: number) {
    try {
      await ignoreInsightActivity(activityId)
      await loadData()
      showStatus('해당 활동을 인사이트에서 숨겼습니다')
    } catch (err: any) {
      showStatus(err?.message || '활동 무시에 실패했습니다')
    }
  }

  function handleTabChange(tab: 'edit' | 'preview') {
    setActiveTab(tab)
    if (tab === 'preview') {
      const md = generateMarkdown(items, teamType, weekInfo || { weekStart: '', weekEnd: '', label: '' })
      setMarkdownText(md)
      setRefinedMarkdown('') // 탭 전환 시 AI 결과 초기화
    }
  }

  async function handleRefine() {
    const source = markdownText
    if (!source) return
    setIsRefining(true)
    try {
      const result = await RefineMarkdownWithAI(source)
      setRefinedMarkdown(result)
    } catch (err: any) {
      showStatus(err?.message || 'AI 다듬기 실패')
    } finally {
      setIsRefining(false)
    }
  }

  async function handleCopyMarkdown() {
    const md = refinedMarkdown || markdownText
    if (!md) return
    try {
      await navigator.clipboard.writeText(md)
      setCopyMsg('복사됨!')
      setTimeout(() => setCopyMsg(null), 2000)
    } catch {
      setCopyMsg('복사 실패')
      setTimeout(() => setCopyMsg(null), 2000)
    }
  }

  async function runPreprocess(silent = false) {
    if (!reportId) return
    setPreprocessing(true)
    try {
      const result = await PreprocessReportItemsWithAI(reportId)
      await loadData()
      if (!silent) {
        showStatus(result.message || `AI 전처리 완료 (${result.count}개)`)
      }
    } catch (err) {
      console.error('Failed to preprocess with AI:', err)
      if (!silent) {
        showStatus('AI 전처리에 실패했습니다')
      }
      await loadData()
    } finally {
      setPreprocessing(false)
    }
  }

  async function handleLinearPopulate() {
    if (!weekInfo) return
    setLinearLoading(true)
    try {
      const count = await PopulateReportFromLinear(reportId, weekInfo.weekStart, weekInfo.weekEnd)
      await loadData()
      showStatus(`Linear에서 ${count}개 항목이 추가되었습니다`)
    } catch (err: any) {
      showStatus(err?.message || 'Linear 취합 실패')
    } finally {
      setLinearLoading(false)
    }
  }

  async function handleAddItem(section: string) {
    try {
      await AddReportItem(reportId, section, '', '새 항목을 입력하세요', undefined, activePeriod)
      await loadData()
    } catch (err) {
      console.error('Failed to add item:', err)
    }
  }

  async function handleUpdateItem(item: ReportItem) {
    try {
      await UpdateReportItem(item)
      setEditingId(null)
      await loadData()
      showStatus('저장되었습니다')
    } catch (err) {
      console.error('Failed to update item:', err)
    }
  }

  async function handleDeleteItem(itemId: number) {
    try {
      await DeleteReportItem(itemId)
      await loadData()
    } catch (err) {
      console.error('Failed to delete item:', err)
    }
  }

  async function handleToggleSelected(item: ReportItem) {
    try {
      await UpdateReportItem({ ...item, isSelected: !item.isSelected })
      await loadData()
    } catch (err) {
      console.error('Failed to toggle item:', err)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const outputPath = await ExportWeeklyReport(reportId)
      if (outputPath) {
        await loadData()
        setExportedFilePath(outputPath)
        showStatus('Excel 파일이 생성되었습니다')
      }
    } catch (err) {
      console.error('Failed to export:', err)
      showStatus('Excel 내보내기 실패했습니다')
    } finally {
      setExporting(false)
    }
  }

  async function handleOpenExportedFile() {
    if (!exportedFilePath) return
    try {
      await OpenFile(exportedFilePath)
    } catch (err) {
      console.error('Failed to open file:', err)
      showStatus('파일을 열 수 없습니다')
    }
  }

  function startEditing(item: ReportItem) {
    setEditingId(item.id)
    setEditContent(item.content)
  }

  function showStatus(msg: string) {
    setSaveStatus(msg)
    setTimeout(() => setSaveStatus(null), 4000)
  }

  function getItemsBySection(section: string) {
    return items.filter(item => item.section === section && (item.period || 'this_week') === activePeriod)
  }

  function shouldShowSection(sectionPeriod?: string) {
    return !sectionPeriod || sectionPeriod === activePeriod
  }

  function periodBySection(section: string) {
    return section === 'next_week_plan' ? 'next_week' : 'this_week'
  }

  function defaultSectionBySource(source: string) {
    const s = source.toLowerCase()
    if (s.includes('calendar') || s.includes('meeting')) return 'attendance'
    if (s.includes('issue') || s.includes('linear')) return 'project_progress'
    return 'project_progress'
  }

  function getActivityConfig(activity: db.ReportInsightActivity) {
    const existing = insightActivityConfig[activity.activityId]
    if (existing) return existing
    const section = defaultSectionBySource(activity.source)
    return { section, period: periodBySection(section) }
  }

  function updateActivityConfig(activityId: number, next: { section?: string; period?: string }) {
    setInsightActivityConfig(prev => {
      const current = prev[activityId] ?? { section: 'project_progress', period: 'this_week' }
      return {
        ...prev,
        [activityId]: {
          section: next.section ?? current.section,
          period: next.period ?? current.period,
        },
      }
    })
  }

  function getDraftEditValue(draft: db.ReportInsightDraft) {
    const existing = draftEditValue[draft.key]
    if (existing) return existing
    const section = draft.suggestedSection || 'other'
    return {
      section,
      period: periodBySection(section),
      content: draft.content || '',
    }
  }

  function updateDraftEditValue(draftKey: string, next: { section?: string; period?: string; content?: string }) {
    setDraftEditValue(prev => {
      const current = prev[draftKey] ?? { section: 'other', period: 'this_week', content: '' }
      return {
        ...prev,
        [draftKey]: {
          section: next.section ?? current.section,
          period: next.period ?? current.period,
          content: next.content ?? current.content,
        },
      }
    })
  }

  function toggleEvidence(key: string) {
    setEvidenceOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="report-editor h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          {/* 탭 */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 ring-1 ring-slate-200 dark:ring-slate-700">
            <button
              onClick={() => handleTabChange('edit')}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                activeTab === 'edit'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold border-slate-300 dark:border-slate-600 shadow-sm'
                  : 'bg-transparent text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              편집
            </button>
            <button
              onClick={() => handleTabChange('preview')}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold border-slate-300 dark:border-slate-600 shadow-sm'
                  : 'bg-transparent text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              미리보기
            </button>
          </div>
          <span className="text-sm text-slate-400">
            {items.filter(i => i.isSelected).length}개 항목 선택됨
          </span>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
                <CheckCircle size={16} />
                {saveStatus}
              </div>
              {exportedFilePath && (
                <button
                  onClick={handleOpenExportedFile}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors"
                >
                  <FileSpreadsheet size={16} />
                  파일 열기
                </button>
              )}
            </div>
          )}
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw size={15} className="opacity-80" />
            최신 내용 불러오기
          </button>
          {activeTab === 'edit' && (
            <button
              onClick={handleLinearPopulate}
              disabled={linearLoading || !weekInfo}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <GitBranch size={15} className={`${linearLoading ? 'animate-spin' : ''} opacity-80`} />
              {linearLoading ? 'Linear 취합 중...' : 'Linear 취합'}
            </button>
          )}
          <button
            onClick={() => runPreprocess(false)}
            disabled={preprocessing}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-violet-100 text-violet-700 hover:bg-violet-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={`${preprocessing ? 'animate-spin' : ''} opacity-80`} />
            {preprocessing ? 'AI 전처리 중...' : 'AI 전처리'}
          </button>
          {activeTab === 'preview' && (
            <>
              <button
                onClick={handleRefine}
                disabled={isRefining || !markdownText}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <Sparkles size={16} className={`${isRefining ? 'animate-pulse' : ''} opacity-80`} />
                {isRefining ? 'AI 처리 중...' : 'AI 다듬기'}
              </button>
              <button
                onClick={handleCopyMarkdown}
                disabled={!markdownText}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <Copy size={16} className="opacity-80" />
                {copyMsg || 'MD 복사'}
              </button>
            </>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || preprocessing || items.filter(i => i.isSelected).length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            <Download size={16} className="opacity-90" />
            {exporting ? '생성 중...' : 'Excel 내보내기'}
          </button>
        </div>
      </header>

      {/* Content */}
      {activeTab === 'edit' && (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {insights && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">인사이트 요약</h3>
                {insightsLoading && <span className="text-xs text-slate-400">불러오는 중...</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">반영률</div>
                  <div className="text-lg font-semibold text-slate-800">
                    {insights.summary.linkedActivities}/{insights.summary.totalActivities}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">미반영</div>
                  <div className="text-lg font-semibold text-slate-800">{insights.summary.unlinkedActivities}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">검토 필요</div>
                  <div className="text-lg font-semibold text-slate-800">{insights.summary.needsReview}</div>
                </div>
              </div>

              {(insights.unlinkedActivities ?? []).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-600">미반영 활동</h4>
                  <div className="space-y-2">
                    {(insights.unlinkedActivities ?? []).slice(0, 6).map(activity => (
                      <div key={activity.activityId} className="border border-slate-200 rounded-lg p-3 space-y-2">
                        <div className="text-sm font-medium text-slate-800">{activity.title || '(제목 없음)'}</div>
                        <div className="text-xs text-slate-500">
                          {activity.source} · {activity.activityDate} · #{activity.activityId}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={getActivityConfig(activity).section}
                            onChange={e => {
                              const section = e.target.value
                              updateActivityConfig(activity.activityId, { section, period: periodBySection(section) })
                            }}
                            className="text-xs border border-slate-200 rounded px-2 py-1"
                          >
                            {getVisibleSections(teamType).map(section => (
                              <option key={section.key} value={section.key}>
                                {section.key}
                              </option>
                            ))}
                          </select>
                          <select
                            value={getActivityConfig(activity).period}
                            onChange={e => updateActivityConfig(activity.activityId, { period: e.target.value })}
                            className="text-xs border border-slate-200 rounded px-2 py-1"
                          >
                            <option value="this_week">this_week</option>
                            <option value="next_week">next_week</option>
                          </select>
                          <button
                            onClick={() => toggleEvidence(`activity-${activity.activityId}`)}
                            className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                          >
                            {evidenceOpen[`activity-${activity.activityId}`] ? '근거 숨기기' : '근거 보기'}
                          </button>
                        </div>
                        {evidenceOpen[`activity-${activity.activityId}`] && (
                          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">
                            제목: {activity.title || '(없음)'}{'\n'}
                            요약: {activity.summary || '(없음)'}{'\n'}
                            출처: {activity.source}{'\n'}
                            날짜: {activity.activityDate}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleInsightAcceptActivity(activity)}
                            className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                          >
                            선택값으로 추가
                          </button>
                          <button
                            onClick={() => handleInsightIgnore(activity.activityId)}
                            className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                          >
                            무시
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(insights.needsReview ?? []).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-600">검토 필요</h4>
                  <div className="space-y-2">
                    {(insights.needsReview ?? []).slice(0, 4).map(activity => (
                      <div key={activity.activityId} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                        <div className="text-sm font-medium text-slate-800">{activity.title || '(제목 없음)'}</div>
                        <div className="text-xs text-slate-600">
                          {activity.source} · {activity.activityDate}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(insights.draftCandidates ?? []).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-600">초안 후보</h4>
                  <div className="space-y-2">
                    {(insights.draftCandidates ?? []).slice(0, 4).map(draft => (
                      <div key={draft.key} className="border border-slate-200 rounded-lg p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={getDraftEditValue(draft).section}
                            onChange={e => {
                              const section = e.target.value
                              updateDraftEditValue(draft.key, { section, period: periodBySection(section) })
                            }}
                            className="text-xs border border-slate-200 rounded px-2 py-1"
                          >
                            {getVisibleSections(teamType).map(section => (
                              <option key={section.key} value={section.key}>
                                {section.key}
                              </option>
                            ))}
                          </select>
                          <select
                            value={getDraftEditValue(draft).period}
                            onChange={e => updateDraftEditValue(draft.key, { period: e.target.value })}
                            className="text-xs border border-slate-200 rounded px-2 py-1"
                          >
                            <option value="this_week">this_week</option>
                            <option value="next_week">next_week</option>
                          </select>
                          <button
                            onClick={() => toggleEvidence(`draft-${draft.key}`)}
                            className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                          >
                            {evidenceOpen[`draft-${draft.key}`] ? '근거 숨기기' : '근거 보기'}
                          </button>
                          <button
                            onClick={() => {
                              const current = getDraftEditValue(draft)
                              setDraftEditValue(prev => ({
                                ...prev,
                                [draft.key]: current,
                              }))
                              setDraftEditMode(prev => ({ ...prev, [draft.key]: !prev[draft.key] }))
                            }}
                            className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                          >
                            수정 후 채택
                          </button>
                        </div>
                        {draftEditMode[draft.key] ? (
                          <textarea
                            value={getDraftEditValue(draft).content}
                            onChange={e => updateDraftEditValue(draft.key, { content: e.target.value })}
                            rows={4}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          />
                        ) : (
                          <div className="text-sm text-slate-800 whitespace-pre-wrap">{draft.content}</div>
                        )}
                        {evidenceOpen[`draft-${draft.key}`] && (
                          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">
                            reason: {draft.reason || '(none)'}{'\n'}
                            activityIds: {draft.activityIds.join(', ') || '(none)'}
                          </div>
                        )}
                        <div className="text-xs text-slate-500">근거 활동 {draft.activityIds.length}건</div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleInsightAcceptDraft(draft)}
                            className="px-2 py-1 text-xs rounded bg-violet-100 text-violet-700 hover:bg-violet-200"
                          >
                            채택
                          </button>
                          {draftEditMode[draft.key] && (
                            <button
                              onClick={() => handleInsightAcceptDraftEdited(draft)}
                              className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                            >
                              수정본 채택
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Period tabs */}
          <div className="flex items-center gap-2 mb-4">
            {PERIODS.map(period => (
              <button
                key={period.key}
                onClick={() => setActivePeriod(period.key)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activePeriod === period.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>

          {getVisibleSections(teamType).map(section => {
            if (!shouldShowSection(section.period)) return null
            const sectionItems = getItemsBySection(section.key)
            return (
              <div key={section.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Section header */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700">
                    {section.label}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      ({sectionItems.length})
                    </span>
                  </h3>
                  <button
                    onClick={() => handleAddItem(section.key)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Plus size={14} />
                    항목 추가
                  </button>
                </div>

                {/* Section items */}
                {sectionItems.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-slate-400">
                    항목이 없습니다. 대시보드에서 활동을 추가하거나 직접 입력하세요.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {sectionItems.map(item => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 px-5 py-3 group transition-colors ${
                          !item.isSelected ? 'opacity-50 bg-slate-50' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={item.isSelected}
                          onChange={() => handleToggleSelected(item)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />

                        {/* Drag handle */}
                        <div className="mt-1 text-slate-300 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
                          <GripVertical size={16} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {item.category && (
                              <span className="inline-block text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                {item.category}
                              </span>
                            )}
                            {teamType === 'si_business' && (section.key === 'project_progress' || section.key === 'business_dev') && item.workType && (
                              <select
                                value={item.workType || 'si'}
                                onChange={e => handleWorkTypeChange(item, e.target.value)}
                                className="text-xs border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="sm">SM</option>
                                <option value="si">SI</option>
                              </select>
                            )}
                          </div>

                          {editingId === item.id ? (
                            <div className="space-y-2">
                              {/* Category select */}
                              <select
                                value={item.category}
                                onChange={e => {
                                  const updated = { ...item, category: e.target.value }
                                  setItems(prev =>
                                    prev.map(i => (i.id === item.id ? updated : i))
                                  )
                                }}
                                className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">카테고리 없음</option>
                                {categories.map(cat => (
                                  <option key={cat.id} value={cat.name}>
                                    {cat.name}
                                  </option>
                                ))}
                              </select>
                              {teamType === 'si_business' && (section.key === 'project_progress' || section.key === 'business_dev') && item.workType && (
                                <select
                                  value={item.workType || 'si'}
                                  onChange={e => {
                                    const updated = { ...item, workType: e.target.value }
                                    setItems(prev =>
                                      prev.map(i => (i.id === item.id ? updated : i))
                                    )
                                  }}
                                  className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="sm">SM</option>
                                  <option value="si">SI</option>
                                </select>
                              )}

                              {/* Content textarea */}
                              <textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                rows={4}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    const updated = {
                                      ...items.find(i => i.id === item.id)!,
                                      content: editContent,
                                    }
                                    handleUpdateItem(updated)
                                  }}
                                  className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                  <Save size={12} />
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p
                                onClick={() => startEditing(item)}
                                className="text-sm text-slate-700 whitespace-pre-wrap cursor-pointer hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 transition-colors"
                              >
                                {item.content}
                              </p>
                              <button
                                onClick={() => startEditing(item)}
                                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors"
                              >
                                <Pencil size={12} />
                                편집
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="mt-1 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      )}

      {activeTab === 'preview' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="text-slate-800 text-sm leading-relaxed space-y-2">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold text-slate-900 mb-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2 border-b border-slate-200 pb-1">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-medium text-slate-700 mt-3 mb-1">{children}</h3>,
                  ul: ({ children }) => <ul className="space-y-1 ml-4">{children}</ul>,
                  li: ({ children }) => <li className="flex gap-2 text-slate-700"><span className="text-slate-400 shrink-0">•</span><span>{children}</span></li>,
                  p: ({ children }) => <p className="text-slate-600">{children}</p>,
                }}
              >
                {refinedMarkdown || markdownText || '항목을 선택하면 미리보기가 생성됩니다.'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
