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
} from 'lucide-react'
import {
  GetReportItems,
  UpdateReportItem,
  DeleteReportItem,
  AddReportItem,
  ExportWeeklyReport,
  GetProjectCategories,
  PreprocessReportItemsWithAI,
} from '../../wailsjs/go/main/App'

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

const SECTIONS = [
  { key: 'project_progress', label: '프로젝트 진행사항' },
  { key: 'business_dev', label: '사업개발/영업' },
  { key: 'attendance', label: '근태' },
  { key: 'hiring', label: '인력채용' },
  { key: 'other', label: '기타' },
]

const PERIODS = [
  { key: 'this_week', label: '금주 현황' },
  { key: 'next_week', label: '차주 계획' },
]

export default function ReportEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reportId = Number(id)

  const [items, setItems] = useState<ReportItem[]>([])
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [preprocessing, setPreprocessing] = useState(false)
  const [activePeriod, setActivePeriod] = useState('this_week')

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
      const [reportItems, cats] = await Promise.all([
        GetReportItems(reportId),
        GetProjectCategories(),
      ])
      setItems(reportItems || [])
      setCategories(cats || [])
    } catch (err) {
      console.error('Failed to load report data:', err)
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
        showStatus(`Excel 파일이 생성되었습니다: ${outputPath}`)
      }
    } catch (err) {
      console.error('Failed to export:', err)
      showStatus('Excel 내보내기에 실패했습니다')
    } finally {
      setExporting(false)
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="text-lg font-semibold text-slate-800">보고서 편집</h2>
          <span className="text-sm text-slate-400">
            {items.filter(i => i.isSelected).length}개 항목 선택됨
          </span>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
              <CheckCircle size={16} />
              {saveStatus}
            </div>
          )}
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw size={15} />
            최신 내용 불러오기
          </button>
          <button
            onClick={() => runPreprocess(false)}
            disabled={preprocessing}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-violet-100 text-violet-700 hover:bg-violet-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={preprocessing ? 'animate-spin' : ''} />
            {preprocessing ? 'AI 전처리 중...' : 'AI 전처리'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || preprocessing || items.filter(i => i.isSelected).length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            <Download size={16} />
            {exporting ? '생성 중...' : 'Excel 내보내기'}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
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

          {SECTIONS.map(section => {
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
                            <select
                              value={item.workType || 'si'}
                              onChange={e => handleWorkTypeChange(item, e.target.value)}
                              className="text-xs border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="sm">SM</option>
                              <option value="si">SI</option>
                            </select>
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
    </div>
  )
}
