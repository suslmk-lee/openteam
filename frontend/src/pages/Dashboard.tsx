import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Clock,
  Briefcase,
  FileText,
  Building2,
  TrendingUp,
  ArrowRight,
  Calendar,
} from 'lucide-react'
import {
  ListTeamMembers,
  GetAttendanceSummary,
  ListSIProjects,
  GetSIWeeklySnapshot,
  ListWeeklyReports,
  ListClients,
  GetCurrentWeek,
} from '../../wailsjs/go/main/App'

interface TeamMember {
  id: number
  name: string
  position: string
  active: boolean
}

interface AttendanceSummary {
  teamMemberId: number
  teamMemberName: string
  vacationDays: number
  morningHalfDays: number
  afternoonHalfDays: number
  totalDays: number
}

interface Project {
  id: number
  name: string
  status: string
  clientName: string
}

interface WeeklyReport {
  id: number
  weekStart: string
  weekEnd: string
  status: string
  createdAt: any
}

interface Client {
  id: number
  name: string
  status: string
}

interface Snapshot {
  weekStart: string
  weekEnd: string
  teamUtilizationPercent: number
  unassignedCount: number
  memberRows: any[]
  projectStatusCounts: { status: string; count: number }[]
}

const STATUS_LABELS: Record<string, string> = {
  preparing: '준비중',
  poc_proposal: 'PoC/제안',
  in_development: '개발중',
  in_operation: '운영중',
  closed: '종료',
}

const STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-slate-100 text-slate-600',
  poc_proposal: 'bg-blue-100 text-blue-600',
  in_development: 'bg-amber-100 text-amber-600',
  in_operation: 'bg-green-100 text-green-600',
  closed: 'bg-gray-100 text-gray-600',
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return ''
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0]
  }
  return dateStr
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  // Team stats
  const [members, setMembers] = useState<TeamMember[]>([])
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [currentWeek, setCurrentWeek] = useState<any>(null)

  useEffect(() => {
    loadAllData()
  }, [])

  async function loadAllData() {
    setLoading(true)
    try {
      const today = new Date()
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      const formatDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      const [membersData, projectsData, reportsData, clientsData, weekData] = await Promise.all([
        ListTeamMembers(),
        ListSIProjects(),
        ListWeeklyReports(),
        ListClients('', false),
        GetCurrentWeek(),
      ])

      setMembers(membersData || [])
      setProjects(projectsData || [])
      setReports((reportsData || []).slice(0, 2))
      setClients(clientsData || [])
      setCurrentWeek(weekData)

      // Load attendance summary for current month
      try {
        const attendanceData = await GetAttendanceSummary(formatDate(firstDay), formatDate(lastDay))
        setAttendance(attendanceData || [])
      } catch {
        setAttendance([])
      }

      // Load SI weekly snapshot
      if (weekData) {
        try {
          const snapData = await GetSIWeeklySnapshot(weekData.weekStart, weekData.weekEnd)
          setSnapshot(snapData)
        } catch {
          setSnapshot(null)
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate stats
  const activeMembers = members.filter(m => m.active).length
  const projectStatusCounts = projects.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const clientStatusCounts = clients.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalAttendanceDays = attendance.reduce((sum, a) => sum + (a.totalDays || 0), 0)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-800">대시보드</h2>
          <span className="text-sm text-slate-500">
            {currentWeek?.label || ''}
          </span>
        </div>
        <button
          onClick={loadAllData}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Quick Actions */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => navigate('/report/create')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText size={18} />
              보고서 생성
            </button>
            <button
              onClick={() => navigate('/report/list')}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Calendar size={18} />
              보고서 목록
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* Team Members Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">팀원 현황</h3>
                  <p className="text-xs text-slate-500">총 {members.length}명</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <span className="text-lg font-semibold text-blue-600">{activeMembers}</span>
                  <p className="text-xs text-slate-500">재직중</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <span className="text-lg font-semibold text-slate-600">{members.length - activeMembers}</span>
                  <p className="text-xs text-slate-500">휴직/퇴사</p>
                </div>
              </div>
            </div>

            {/* Attendance Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">이번달 근태</h3>
                  <p className="text-xs text-slate-500">
                    {attendance.length}명 기록
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center text-xs">
                <div className="bg-rose-50 rounded p-1">
                  <span className="font-semibold text-rose-600">
                    {attendance.reduce((s, a) => s + a.vacationDays, 0)}
                  </span>
                  <p className="text-slate-500">휴가</p>
                </div>
                <div className="bg-amber-50 rounded p-1">
                  <span className="font-semibold text-amber-600">
                    {attendance.reduce((s, a) => s + a.morningHalfDays, 0)}
                  </span>
                  <p className="text-slate-500">오전반차</p>
                </div>
                <div className="bg-orange-50 rounded p-1">
                  <span className="font-semibold text-orange-600">
                    {attendance.reduce((s, a) => s + a.afternoonHalfDays, 0)}
                  </span>
                  <p className="text-slate-500">오후반차</p>
                </div>
              </div>
              <div className="mt-2 text-center text-sm">
                <span className="text-slate-500">총 결근일: </span>
                <span className="font-semibold text-slate-700">{totalAttendanceDays.toFixed(1)}일</span>
              </div>
            </div>

            {/* Projects Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">프로젝트 현황</h3>
                  <p className="text-xs text-slate-500">총 {projects.length}개</p>
                </div>
              </div>
              <div className="space-y-1">
                {Object.entries(projectStatusCounts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{STATUS_LABELS[status] || status}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[status] || 'bg-slate-100'}`}>
                        {count}개
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Utilization Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">SI 가동률</h3>
                  <p className="text-xs text-slate-500">{normalizeDate(snapshot?.weekStart || '')} ~ {normalizeDate(snapshot?.weekEnd || '')}</p>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-purple-600">
                  {snapshot ? `${snapshot.teamUtilizationPercent.toFixed(0)}%` : '-'}
                </span>
                <p className="text-sm text-slate-500 mt-1">
                  미배정 {snapshot?.unassignedCount || 0}명
                </p>
              </div>
            </div>

            {/* Clients Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">고객사 현황</h3>
                  <p className="text-xs text-slate-500">총 {clients.length}개사</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-indigo-50 rounded-lg p-2">
                  <span className="font-semibold text-indigo-600">{clientStatusCounts.existing || 0}</span>
                  <p className="text-xs text-slate-500">기존</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2">
                  <span className="font-semibold text-amber-600">{clientStatusCounts.target || 0}</span>
                  <p className="text-xs text-slate-500">타겟</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="font-semibold text-slate-600">{clientStatusCounts.inactive || 0}</span>
                  <p className="text-xs text-slate-500">비활성</p>
                </div>
              </div>
            </div>

            {/* Recent Reports Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">최근 보고서</h3>
                  <p className="text-xs text-slate-500">최근 {reports.length}건</p>
                </div>
              </div>
              <div className="space-y-2">
                {reports.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-2">생성된 보고서 없음</p>
                ) : (
                  reports.map(report => (
                    <div
                      key={report.id}
                      onClick={() => navigate(`/report/${report.id}`)}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <span className="text-sm text-slate-700">
                        {normalizeDate(report.weekStart)} ~ {normalizeDate(report.weekEnd)}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          report.status === 'exported'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {report.status === 'exported' ? '보냄' : '임시'}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {reports.length > 0 && (
                <button
                  onClick={() => navigate('/report/list')}
                  className="w-full mt-2 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 py-1"
                >
                  전체보기 <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Attendance Detail Table */}
          {attendance.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Clock size={18} className="text-slate-400" />
                이번달 근태 상세
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 text-slate-600">팀원</th>
                      <th className="text-center py-2 px-3 text-slate-600">휴가</th>
                      <th className="text-center py-2 px-3 text-slate-600">오전반차</th>
                      <th className="text-center py-2 px-3 text-slate-600">오후반차</th>
                      <th className="text-center py-2 px-3 text-slate-600">총결근일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map(a => (
                      <tr key={a.teamMemberId} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-3">{a.teamMemberName}</td>
                        <td className="py-2 px-3 text-center text-rose-600">{a.vacationDays}</td>
                        <td className="py-2 px-3 text-center text-amber-600">{a.morningHalfDays}</td>
                        <td className="py-2 px-3 text-center text-orange-600">{a.afternoonHalfDays}</td>
                        <td className="py-2 px-3 text-center font-semibold">{(a.totalDays || 0).toFixed(1)}일</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
