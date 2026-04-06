import { useEffect, useState } from 'react'
import {
  ListTeamMembers,
  ListAttendanceRecords,
  SaveAttendanceRecord,
  DeleteAttendanceRecord,
  GetAttendanceSummary,
  GetAttendanceTypes,
} from '../../wailsjs/go/main/App'

interface TeamMember {
  id: number
  name: string
}

interface AttendanceRecord {
  id: number
  teamMemberId: number
  recordDate: string
  type: string
  checkInTime?: string
  checkOutTime?: string
  notes: string
}

interface AttendanceSummary {
  teamMemberId: number
  teamMemberName: string
  vacationDays: number
  morningHalfDays: number
  afternoonHalfDays: number
  totalDays: number
}

const TYPE_LABELS: Record<string, string> = {
  vacation: '휴가',
  morning_half: '오전반차',
  afternoon_half: '오후반차',
}

const TYPE_COLORS: Record<string, string> = {
  vacation: 'bg-rose-100 text-rose-700',
  morning_half: 'bg-amber-100 text-amber-700',
  afternoon_half: 'bg-orange-100 text-orange-700',
}

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function formatDateWithWeekday(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const weekday = WEEKDAY_NAMES[date.getDay()]
  return `${yyyy}-${mm}-${dd} (${weekday})`
}

export default function TeamAttendance() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<AttendanceSummary[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const [selectedMember, setSelectedMember] = useState<number>(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [newRecordMemberId, setNewRecordMemberId] = useState<number>(0)
  const [newRecordDate, setNewRecordDate] = useState('')
  const [newRecordType, setNewRecordType] = useState('vacation')
  const [newRecordNotes, setNewRecordNotes] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  const [showSummary, setShowSummary] = useState(false)

  useEffect(() => {
    const today = new Date()
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    // 로컬 시간대 기준으로 YYYY-MM-DD 형식 생성 (toISOString은 UTC라 timezone 문제 있음)
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    setStartDate(formatLocalDate(firstDay))
    setEndDate(formatLocalDate(lastDay))

    ;(async () => {
      const [loadedMembers, typeList] = await Promise.all([
        ListTeamMembers(),
        GetAttendanceTypes(),
      ])
      setMembers(loadedMembers || [])
      setTypes(typeList || [])
      if (typeList && typeList.length > 0) {
        setNewRecordType(typeList[0])
      }
    })()
  }, [])

  useEffect(() => {
    if (startDate && endDate) {
      loadRecords()
      loadSummary()
    }
  }, [startDate, endDate, selectedMember])

  async function loadRecords() {
    setLoading(true)
    try {
      const loaded = await ListAttendanceRecords(selectedMember || 0, startDate, endDate)
      setRecords(loaded || [])
    } finally {
      setLoading(false)
    }
  }

  async function loadSummary() {
    try {
      const loaded = await GetAttendanceSummary(startDate, endDate)
      console.log('Summary loaded:', loaded)
      setSummary(loaded || [])
    } catch (err) {
      console.error('Summary load failed:', err)
      setSummary([])
    }
  }

  async function handleAddRecord() {
    if (!newRecordMemberId || !newRecordDate) {
      setStatusMsg('팀원과 날짜를 선택하세요')
      return
    }
    // 중복 체크
    const isDuplicate = records.some(
      r => r.teamMemberId === newRecordMemberId && 
           r.recordDate === newRecordDate && 
           r.type === newRecordType
    )
    if (isDuplicate) {
      setStatusMsg('✗ 이미 동일한 규태 기록이 존재합니다')
      return
    }
    setStatusMsg('저장 중...')
    try {
      await SaveAttendanceRecord({
        id: 0,
        teamMemberId: newRecordMemberId,
        recordDate: newRecordDate,
        type: newRecordType,
        notes: newRecordNotes,
      } as any)
      setStatusMsg('✓ 저장 완료')
      // 날짜 범위에 새 기록이 포함되도록 조정
      if (newRecordDate < startDate) setStartDate(newRecordDate)
      if (newRecordDate > endDate) setEndDate(newRecordDate)
      setNewRecordDate('')
      setNewRecordNotes('')
      await loadRecords()
      setStatusMsg(`✓ 저장 완료 (총 ${records.length}건)`)
      await loadSummary()
      setTimeout(() => setStatusMsg(''), 2000)
    } catch (err) {
      setStatusMsg('✗ 저장 실패: ' + (err as Error).message)
    }
  }

  function getMemberName(id: number) {
    const member = members.find(m => m.id === id)
    return member?.name || `ID:${id}`
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">근태 관리</h2>
          <p className="text-xs text-slate-500">휴가 및 반차 기록 관리</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            {showSummary ? '요약 숨기기' : '요약 보기'}
          </button>
          <button
            onClick={loadRecords}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            {loading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Filters */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={selectedMember}
                onChange={e => setSelectedMember(Number(e.target.value))}
              >
                <option value={0}>전체 팀원</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input
                type="date"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
              <span className="text-slate-400">~</span>
              <input
                type="date"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </section>

          {/* Summary */}
          {showSummary && (
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                기간별 근태 요약 ({startDate} ~ {endDate})
              </h3>
              {summary.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">해당 기간에 근태 기록이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-3 text-slate-600 font-medium">팀원</th>
                        <th className="text-center py-2 px-3 text-slate-600 font-medium">휴가</th>
                        <th className="text-center py-2 px-3 text-slate-600 font-medium">오전반차</th>
                        <th className="text-center py-2 px-3 text-slate-600 font-medium">오후반차</th>
                        <th className="text-center py-2 px-3 text-slate-600 font-medium">총결근일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map(s => (
                        <tr key={s.teamMemberId} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium">{s.teamMemberName}</td>
                          <td className="py-2 px-3 text-center text-rose-600">{s.vacationDays}</td>
                          <td className="py-2 px-3 text-center text-amber-600">{s.morningHalfDays}</td>
                          <td className="py-2 px-3 text-center text-orange-600">{s.afternoonHalfDays}</td>
                          <td className="py-2 px-3 text-center font-semibold text-slate-700">
                            {s.totalDays?.toFixed(1) || (s.vacationDays + (s.morningHalfDays + s.afternoonHalfDays) * 0.5).toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Add Record */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">근태 기록 등록</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={newRecordMemberId}
                onChange={e => setNewRecordMemberId(Number(e.target.value))}
              >
                <option value={0}>팀원 선택</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input
                type="date"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={newRecordDate}
                onChange={e => setNewRecordDate(e.target.value)}
                placeholder="날짜"
              />
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={newRecordType}
                onChange={e => setNewRecordType(e.target.value)}
              >
                {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
              </select>
              <button
                onClick={() => {
                  console.log('Button clicked', { newRecordMemberId, newRecordDate, newRecordType })
                  handleAddRecord()
                }}
                disabled={!newRecordMemberId || !newRecordDate}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                등록
              </button>
            </div>
            <input
              type="text"
              className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="비고 (선택)"
              value={newRecordNotes}
              onChange={e => setNewRecordNotes(e.target.value)}
            />
            {statusMsg && (
              <p className={`mt-2 text-sm ${statusMsg.startsWith('✓') ? 'text-green-600' : statusMsg.startsWith('✗') ? 'text-rose-600' : 'text-slate-500'}`}>
                {statusMsg}
              </p>
            )}
          </section>

          {/* Records List */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              근태 기록 ({records.length}건)
            </h3>
            {records.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">등록된 근태 기록이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">날짜</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">팀원</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">유형</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">비고</th>
                      <th className="text-right py-2 px-3 text-slate-600 font-medium">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(record => (
                      <tr key={record.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-3">{formatDateWithWeekday(record.recordDate)}</td>
                        <td className="py-2 px-3 font-medium">{getMemberName(record.teamMemberId)}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${TYPE_COLORS[record.type] || 'bg-slate-100'}`}>
                            {TYPE_LABELS[record.type] || record.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-xs">{record.notes || '-'}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={async () => {
                              if (!confirm('이 기록을 삭제하시겠습니까?')) return
                              await DeleteAttendanceRecord(record.id)
                              await loadRecords()
                              await loadSummary()
                            }}
                            className="text-rose-600 hover:text-rose-700 text-xs px-2 py-1 hover:bg-rose-50 rounded"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
