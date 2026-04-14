import { useEffect, useState } from 'react'
import { useAppApi } from '../hooks/useAppApi'
import { X, FileText, Calendar, CheckCircle } from 'lucide-react'

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function normalizeDate(dateStr: string): string {
  if (!dateStr) return ''
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0]
  }
  return dateStr
}

function formatDateWithWeekday(dateStr: string | Date): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return String(dateStr)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const weekday = WEEKDAY_NAMES[date.getDay()]
  return `${yyyy}-${mm}-${dd} (${weekday})`
}

interface WeeklyReport {
  id: number
  weekStart: string
  weekEnd: string
  status: string
  createdAt: any
}

interface ReportItem {
  id: number
  reportId: number
  section: string
  category: string
  content: string
  isSelected: boolean
  workType: string
}

interface GroupedItems {
  [section: string]: ReportItem[]
}

export default function WeeklyReportList() {
  const appApi = useAppApi()
  const { ListWeeklyReports, GetReportItems } = appApi

  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null)
  const [reportItems, setReportItems] = useState<ReportItem[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    setLoading(true)
    try {
      const loaded = await ListWeeklyReports()
      setReports(loaded || [])
    } catch (err) {
      console.error('Failed to load reports:', err)
    } finally {
      setLoading(false)
    }
  }

  async function openReportDetail(report: WeeklyReport) {
    setSelectedReport(report)
    setShowModal(true)
    setModalLoading(true)
    try {
      const items = await GetReportItems(report.id)
      setReportItems(items || [])
    } catch (err) {
      console.error('Failed to load report items:', err)
    } finally {
      setModalLoading(false)
    }
  }

  function closeModal() {
    setShowModal(false)
    setSelectedReport(null)
    setReportItems([])
  }

  function groupItemsBySection(items: ReportItem[]): GroupedItems {
    const grouped: GroupedItems = {}
    items.filter(item => item.isSelected).forEach(item => {
      if (!grouped[item.section]) {
        grouped[item.section] = []
      }
      grouped[item.section].push(item)
    })
    return grouped
  }

  const groupedItems = groupItemsBySection(reportItems)
  const sections = Object.keys(groupedItems).sort()

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">주간 보고서 목록</h2>
          <p className="text-xs text-slate-500">생성된 주간업무일지 조회</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadReports}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            {loading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {reports.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">생성된 주간 보고서가 없습니다.</p>
              <p className="text-sm text-slate-400 mt-1">Dashboard에서 보고서를 생성하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(report => (
                <div
                  key={report.id}
                  onClick={() => openReportDetail(report)}
                  className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                      </div>
                      <div>
                        <h3 className="font-medium text-slate-800">
                          {normalizeDate(report.weekStart)} ~ {normalizeDate(report.weekEnd)}
                        </h3>
                        <p className="text-sm text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateWithWeekday(report.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        report.status === 'exported' 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' 
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                      }`}>
                        {report.status === 'exported' ? '보내기 완료' : '임시저장'}
                      </span>
                      <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200 px-3 py-1 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg">
                        상세보기
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
              <div>
                <h3 className="font-semibold text-slate-800">
                  주간업무일지 상세 ({normalizeDate(selectedReport.weekStart)} ~ {normalizeDate(selectedReport.weekEnd)})
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {modalLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-slate-500">보고서 항목을 불러오는 중...</p>
                </div>
              ) : reportItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500">보고서 항목이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {sections.map(section => (
                    <div key={section} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Section Header */}
                      <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                        <h4 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-500 dark:bg-blue-300 rounded-full"></span>
                          {section}
                          <span className="text-sm font-normal text-slate-500">
                            ({groupedItems[section].length}개 항목)
                          </span>
                        </h4>
                      </div>

                      {/* Section Items */}
                      <div className="divide-y divide-slate-100">
                        {groupedItems[section].map((item, index) => (
                          <div key={item.id} className="p-4 bg-white">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-1">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                                    {item.category}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                  item.workType === 'sm'
                                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                                }`}>
                                    {item.workType?.toUpperCase() || 'SI'}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                  {item.content}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Summary */}
                  <div className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-600">
                      총 <strong>{sections.length}</strong>개 섹션, 
                      {' '}<strong>{reportItems.filter(i => i.isSelected).length}</strong>개 선택된 항목
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="h-14 border-t border-slate-200 flex items-center justify-end px-6 gap-2 shrink-0">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
