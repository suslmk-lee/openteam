import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, Plus, Trash2, User } from 'lucide-react'
import { 
  GetMyAttendanceSummary, 
  SaveAttendanceRecord, 
  DeleteAttendanceRecord,
  ListAttendanceRecords
} from '../../wailsjs/go/main/App'
import { db } from '../../wailsjs/go/models'

type AttendanceRecord = db.AttendanceRecord
type MyAttendanceSummary = db.MyAttendanceSummary

// Helper function to format date with Korean weekday
function formatDateWithWeekday(dateStr: string): string {
  if (!dateStr) return ''
  // Handle ISO format with time
  const datePart = dateStr.split('T')[0]
  const date = new Date(datePart)
  if (isNaN(date.getTime())) return dateStr
  
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekday = weekdays[date.getDay()]
  
  return `${year}-${month}-${day}(${weekday})`
}

export default function PersonalAttendance() {
  const navigate = useNavigate()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<MyAttendanceSummary | null>(null)
  const [totalAnnualLeave, setTotalAnnualLeave] = useState<number>(15)
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  
  // Form state
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedType, setSelectedType] = useState<'vacation' | 'morning_half' | 'afternoon_half'>('vacation')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    loadData()
    // Load saved annual leave from localStorage
    const saved = localStorage.getItem('totalAnnualLeave')
    if (saved) setTotalAnnualLeave(parseInt(saved, 10))
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const today = new Date()
      // Get current week (Mon-Sun)
      const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(today)
      monday.setDate(today.getDate() + diffToMonday)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      
      const weekStart = monday.toISOString().split('T')[0]
      const weekEnd = sunday.toISOString().split('T')[0]
      
      console.log('[PersonalAttendance] Loading data for:', weekStart, '~', weekEnd)
      
      const [summaryData, recordsData] = await Promise.all([
        GetMyAttendanceSummary(weekStart, weekEnd) as Promise<MyAttendanceSummary>,
        ListAttendanceRecords(0, weekStart, weekEnd) as Promise<AttendanceRecord[]>
      ])
      
      console.log('[PersonalAttendance] Summary:', summaryData)
      console.log('[PersonalAttendance] Records:', recordsData)
      
      setSummary(summaryData)
      setRecords(recordsData || [])
    } catch (err) {
      console.error('Failed to load attendance:', err)
    } finally {
      setLoading(false)
    }
  }

  function saveAnnualLeave(days: number) {
    setTotalAnnualLeave(days)
    localStorage.setItem('totalAnnualLeave', days.toString())
  }

  async function handleAddRecord() {
    if (!selectedDate) return
    
    try {
      await SaveAttendanceRecord({
        recordDate: selectedDate,
        type: selectedType,
        notes: notes,
        teamMemberId: 0 // Personal attendance uses 0 or self
      } as any)
      
      setShowAddForm(false)
      setSelectedDate('')
      setNotes('')
      loadData()
    } catch (err) {
      console.error('Failed to save record:', err)
    }
  }

  const remainingLeave = totalAnnualLeave - (summary?.vacationDays || 0)
  const usedHalfDays = (summary?.morningHalfDays || 0) + (summary?.afternoonHalfDays || 0)

  return (
    <div className="h-full flex flex-col">
      {/* Header - unified with Settings style */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800">설정 · 내 근태 관리</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">
        {/* Annual Leave Settings */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-blue-600" />
            연차 설정
          </h2>
          <div className="flex items-center gap-4">
            <label className="text-sm text-slate-600">올해 연차 일수:</label>
            <input
              type="number"
              value={totalAnnualLeave}
              onChange={(e) => saveAnnualLeave(parseInt(e.target.value) || 0)}
              className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-center font-semibold"
              min={0}
              max={30}
            />
            <span className="text-sm text-slate-500">일</span>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">총 연차</p>
            <p className="text-2xl font-bold text-blue-600">{totalAnnualLeave}</p>
            <p className="text-xs text-slate-400">일</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">사용 연차</p>
            <p className="text-2xl font-bold text-rose-600">{summary?.vacationDays || 0}</p>
            <p className="text-xs text-slate-400">일</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">남은 연차</p>
            <p className="text-2xl font-bold text-green-600">{remainingLeave}</p>
            <p className="text-xs text-slate-400">일</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">반차 사용</p>
            <p className="text-2xl font-bold text-amber-600">{usedHalfDays}</p>
            <p className="text-xs text-slate-400">회</p>
          </div>
        </div>

        {/* Add Record Button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus size={18} />
            근태 등록
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
            <h3 className="font-semibold text-slate-800 mb-4">근태 등록</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">날짜</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">유형</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="vacation">휴가 (연차)</option>
                  <option value="morning_half">오전 반차</option>
                  <option value="afternoon_half">오후 반차</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">메모 (선택)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="예: 개인 사유"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddRecord}
                disabled={!selectedDate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg transition-colors"
              >
                등록
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* Records List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-800">근태 기록</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400">로딩 중...</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Clock size={48} className="mx-auto mb-3 text-slate-300" />
              <p>등록된 근태가 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {records.map((record) => (
                <div key={record.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-slate-800">{formatDateWithWeekday(record.recordDate)}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      record.type === 'vacation' ? 'bg-rose-100 text-rose-700' :
                      record.type === 'morning_half' ? 'bg-amber-100 text-amber-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {record.type === 'vacation' ? '휴가' :
                       record.type === 'morning_half' ? '오전 반차' : '오후 반차'}
                    </span>
                    {record.notes && (
                      <span className="text-sm text-slate-500">{record.notes}</span>
                    )}
                    {/* Approval Status - placeholder for future approval system */}
                    <span className="px-2 py-1 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
                      대기중
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Approval Button - placeholder for future approval system */}
                    <button
                      onClick={() => alert('결재 시스템 연동 예정입니다.')}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs rounded-lg transition-colors"
                    >
                      결재
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('정말 삭제하시겠습니까?')) return
                        try {
                          await DeleteAttendanceRecord(record.id)
                          loadData()
                        } catch (err) {
                          console.error('Failed to delete:', err)
                        }
                      }}
                      className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
