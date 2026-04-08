import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Clock, Briefcase, FileText, Building2, TrendingUp,
  ArrowRight, Calendar, AlertTriangle, Kanban, RotateCcw, CheckSquare,
} from 'lucide-react'
import {
  ListTeamMembers, GetAttendanceSummary, ListSIProjects,
  GetSIWeeklySnapshot, ListWeeklyReports, ListClients, GetCurrentWeek,
  ListIssues, ListRetrospectives, GetLinearDashboard,
} from '../../wailsjs/go/main/App'
import { useTeamProfile } from '../contexts/TeamProfileContext'

// ── interfaces ──────────────────────────────────────────────────────────────

interface TeamMember { id: number; name: string; position: string; active: boolean }
interface AttendanceSummary {
  teamMemberId: number; teamMemberName: string
  vacationDays: number; morningHalfDays: number; afternoonHalfDays: number; totalDays: number
}
interface Project { id: number; name: string; status: string; clientName: string }
interface WeeklyReport { id: number; weekStart: string; weekEnd: string; status: string; createdAt: any }
interface Client { id: number; name: string; status: string }
interface Snapshot {
  weekStart: string; weekEnd: string; teamUtilizationPercent: number
  unassignedCount: number; memberRows: any[]; projectStatusCounts: { status: string; count: number }[]
}
interface Issue { id: number; title: string; status: string; severity: string }
interface Retrospective {
  id: number; weekStart: string; weekEnd: string
  wentWell: string; toImprove: string; actionItems: string
}
interface LinearIssue { id: string; state: { type: string } }

// ── constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  preparing: '준비중', poc_proposal: 'PoC/제안',
  in_development: '개발중', in_operation: '운영중', closed: '종료',
}
const STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-slate-100 text-slate-600', poc_proposal: 'bg-blue-100 text-blue-600',
  in_development: 'bg-amber-100 text-amber-600', in_operation: 'bg-green-100 text-green-600',
  closed: 'bg-gray-100 text-gray-600',
}
const ISSUE_STATUS_LABELS: Record<string, string> = {
  open: '미처리', in_progress: '처리중', resolved: '해결됨', closed: '종료',
}
const ISSUE_STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-600', in_progress: 'bg-amber-100 text-amber-600',
  resolved: 'bg-green-100 text-green-600', closed: 'bg-slate-100 text-slate-500',
}

function normalizeDate(d: string) {
  if (!d) return ''
  return d.includes('T') ? d.split('T')[0] : d
}

// ── shared sub-cards ─────────────────────────────────────────────────────────

function MembersCard({ members }: { members: TeamMember[] }) {
  const active = members.filter(m => m.active).length
  return (
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
          <span className="text-lg font-semibold text-blue-600">{active}</span>
          <p className="text-xs text-slate-500">재직중</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2 text-center">
          <span className="text-lg font-semibold text-slate-600">{members.length - active}</span>
          <p className="text-xs text-slate-500">휴직/퇴사</p>
        </div>
      </div>
    </div>
  )
}

function AttendanceCard({ attendance }: { attendance: AttendanceSummary[] }) {
  const total = attendance.reduce((s, a) => s + (a.totalDays || 0), 0)
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
          <Clock className="w-5 h-5 text-rose-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">이번달 근태</h3>
          <p className="text-xs text-slate-500">{attendance.length}명 기록</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        <div className="bg-rose-50 rounded p-1">
          <span className="font-semibold text-rose-600">{attendance.reduce((s, a) => s + a.vacationDays, 0)}</span>
          <p className="text-slate-500">휴가</p>
        </div>
        <div className="bg-amber-50 rounded p-1">
          <span className="font-semibold text-amber-600">{attendance.reduce((s, a) => s + a.morningHalfDays, 0)}</span>
          <p className="text-slate-500">오전반차</p>
        </div>
        <div className="bg-orange-50 rounded p-1">
          <span className="font-semibold text-orange-600">{attendance.reduce((s, a) => s + a.afternoonHalfDays, 0)}</span>
          <p className="text-slate-500">오후반차</p>
        </div>
      </div>
      <div className="mt-2 text-center text-sm">
        <span className="text-slate-500">총 결근일: </span>
        <span className="font-semibold text-slate-700">{total.toFixed(1)}일</span>
      </div>
    </div>
  )
}

function ProjectsCard({ projects }: { projects: Project[] }) {
  const counts = projects.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc }, {} as Record<string, number>)
  return (
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
        {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => (
          <div key={status} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{STATUS_LABELS[status] || status}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[status] || 'bg-slate-100'}`}>{count}개</span>
          </div>
        ))}
        {projects.length === 0 && <p className="text-sm text-slate-400 text-center py-2">등록된 프로젝트 없음</p>}
      </div>
    </div>
  )
}

function UtilizationCard({ snapshot }: { snapshot: Snapshot | null }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">SI 가동률</h3>
          <p className="text-xs text-slate-500">
            {snapshot ? `${normalizeDate(snapshot.weekStart)} ~ ${normalizeDate(snapshot.weekEnd)}` : '이번 주'}
          </p>
        </div>
      </div>
      <div className="text-center">
        <span className="text-3xl font-bold text-purple-600">
          {snapshot ? `${snapshot.teamUtilizationPercent.toFixed(0)}%` : '-'}
        </span>
        <p className="text-sm text-slate-500 mt-1">미배정 {snapshot?.unassignedCount || 0}명</p>
      </div>
    </div>
  )
}

function ClientsCard({ clients }: { clients: Client[] }) {
  const counts = clients.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc }, {} as Record<string, number>)
  return (
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
          <span className="font-semibold text-indigo-600">{counts.existing || 0}</span>
          <p className="text-xs text-slate-500">기존</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-2">
          <span className="font-semibold text-amber-600">{counts.target || 0}</span>
          <p className="text-xs text-slate-500">타겟</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2">
          <span className="font-semibold text-slate-600">{counts.inactive || 0}</span>
          <p className="text-xs text-slate-500">비활성</p>
        </div>
      </div>
    </div>
  )
}

function ReportsCard({ reports, navigate }: { reports: WeeklyReport[]; navigate: (p: string) => void }) {
  return (
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
        {reports.length === 0
          ? <p className="text-sm text-slate-400 text-center py-2">생성된 보고서 없음</p>
          : reports.map(r => (
            <div key={r.id} onClick={() => navigate(`/report/${r.id}`)}
              className="flex items-center justify-between p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="text-sm text-slate-700">{normalizeDate(r.weekStart)} ~ {normalizeDate(r.weekEnd)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'exported' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {r.status === 'exported' ? '보냄' : '임시'}
              </span>
            </div>
          ))}
      </div>
      {reports.length > 0 && (
        <button onClick={() => navigate('/report/list')}
          className="w-full mt-2 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 py-1">
          전체보기 <ArrowRight size={12} />
        </button>
      )}
    </div>
  )
}

function IssuesCard({ issues }: { issues: Issue[] }) {
  const counts = issues.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc }, {} as Record<string, number>)
  const openCount = (counts.open || 0) + (counts.in_progress || 0)
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">이슈/리스크</h3>
          <p className="text-xs text-slate-500">미처리 {openCount}건</p>
        </div>
      </div>
      <div className="space-y-1">
        {Object.entries(ISSUE_STATUS_LABELS).map(([status, label]) => (
          <div key={status} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${ISSUE_STATUS_COLORS[status]}`}>{counts[status] || 0}건</span>
          </div>
        ))}
        {issues.length === 0 && <p className="text-sm text-slate-400 text-center py-2">등록된 이슈 없음</p>}
      </div>
    </div>
  )
}

function LinearTaskCard({ linearIssues, navigate }: { linearIssues: LinearIssue[]; navigate: (p: string) => void }) {
  const counts: Record<string, number> = { backlog: 0, unstarted: 0, started: 0, completed: 0, cancelled: 0 }
  linearIssues.forEach(i => { const t = i.state?.type || 'backlog'; if (t in counts) counts[t]++ })
  const cols = [
    { type: 'backlog', label: 'Backlog', color: 'text-slate-500', bg: 'bg-slate-50' },
    { type: 'unstarted', label: 'Todo', color: 'text-blue-600', bg: 'bg-blue-50' },
    { type: 'started', label: 'In Progress', color: 'text-amber-600', bg: 'bg-amber-50' },
    { type: 'completed', label: 'Done', color: 'text-green-600', bg: 'bg-green-50' },
  ]
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <Kanban className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">Linear 태스크</h3>
          <p className="text-xs text-slate-500">총 {linearIssues.length}개</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cols.map(col => (
          <div key={col.type} className={`${col.bg} rounded-lg p-2 text-center`}>
            <span className={`text-lg font-semibold ${col.color}`}>{counts[col.type]}</span>
            <p className="text-xs text-slate-500">{col.label}</p>
          </div>
        ))}
      </div>
      <button onClick={() => navigate('/team/taskboard')}
        className="w-full mt-3 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 py-1">
        태스크보드 바로가기 <ArrowRight size={12} />
      </button>
    </div>
  )
}

function RetroCard({ retro, navigate }: { retro: Retrospective | null; navigate: (p: string) => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
          <RotateCcw className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">주간 회고</h3>
          <p className="text-xs text-slate-500">
            {retro ? `${normalizeDate(retro.weekStart)} ~ ${normalizeDate(retro.weekEnd)}` : '최근 회고 없음'}
          </p>
        </div>
      </div>
      {retro ? (
        <div className="space-y-2 text-sm">
          {retro.wentWell && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">잘한 점</p>
              <p className="text-slate-700 line-clamp-2">{retro.wentWell}</p>
            </div>
          )}
          {retro.actionItems && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">액션아이템</p>
              <p className="text-slate-700 line-clamp-2">{retro.actionItems}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-2">작성된 회고가 없습니다</p>
      )}
      <button onClick={() => navigate('/team/retro')}
        className="w-full mt-3 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 py-1">
        회고 전체보기 <ArrowRight size={12} />
      </button>
    </div>
  )
}

// ── attendance detail table (shared) ────────────────────────────────────────

function AttendanceTable({ attendance }: { attendance: AttendanceSummary[] }) {
  if (attendance.length === 0) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Clock size={18} className="text-slate-400" /> 이번달 근태 상세
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
  )
}

// ── main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { profile } = useTeamProfile()
  const teamType = profile?.teamType || 'si_business'
  const [loading, setLoading] = useState(true)

  // shared
  const [members, setMembers] = useState<TeamMember[]>([])
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([])
  const [currentWeek, setCurrentWeek] = useState<any>(null)

  // si_business + si_field
  const [projects, setProjects] = useState<Project[]>([])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [reports, setReports] = useState<WeeklyReport[]>([])

  // si_business only
  const [clients, setClients] = useState<Client[]>([])

  // si_field only
  const [issues, setIssues] = useState<Issue[]>([])

  // small_team only
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([])
  const [latestRetro, setLatestRetro] = useState<Retrospective | null>(null)

  useEffect(() => { loadAllData() }, [teamType])

  async function loadAllData() {
    setLoading(true)
    try {
      const today = new Date()
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      const [membersData, weekData] = await Promise.all([ListTeamMembers(), GetCurrentWeek()])
      setMembers(membersData || [])
      setCurrentWeek(weekData)

      // attendance (all types)
      try {
        setAttendance((await GetAttendanceSummary(fmt(firstDay), fmt(lastDay))) || [])
      } catch { setAttendance([]) }

      if (teamType === 'small_team') {
        // Linear tasks + retrospective
        try { setLinearIssues(((await GetLinearDashboard()) as any)?.issues || []) } catch { setLinearIssues([]) }
        try {
          const retros: Retrospective[] = (await ListRetrospectives()) || []
          setLatestRetro(retros.length > 0 ? retros[0] : null)
        } catch { setLatestRetro(null) }

      } else {
        // si_business or si_field
        const [projectsData, reportsData] = await Promise.all([ListSIProjects(), ListWeeklyReports()])
        setProjects(projectsData || [])
        setReports((reportsData || []).slice(0, 2))

        if (weekData) {
          try { setSnapshot(await GetSIWeeklySnapshot(weekData.weekStart, weekData.weekEnd)) } catch { setSnapshot(null) }
        }

        if (teamType === 'si_business') {
          try { setClients((await ListClients('', false)) || []) } catch { setClients([]) }
        }
        if (teamType === 'si_field') {
          try { setIssues((await ListIssues('')) || []) } catch { setIssues([]) }
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-800">대시보드</h2>
          <span className="text-sm text-slate-500">{currentWeek?.label || ''}</span>
        </div>
        <button onClick={loadAllData} disabled={loading}
          className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50">
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">

          {/* ── Quick Actions ── */}
          <div className="flex gap-3 mb-6">
            {teamType === 'small_team' ? (
              <>
                <button onClick={() => navigate('/team/taskboard')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                  <Kanban size={18} /> 태스크보드
                </button>
                <button onClick={() => navigate('/team/retro')}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                  <RotateCcw size={18} /> 회고 작성
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('/report/create')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <FileText size={18} /> 보고서 생성
                </button>
                <button onClick={() => navigate('/report/list')}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                  <Calendar size={18} /> 보고서 목록
                </button>
                {teamType === 'si_field' && (
                  <button onClick={() => navigate('/team/issues')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                    <AlertTriangle size={18} /> 이슈/리스크
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Cards Grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* shared */}
            <MembersCard members={members} />
            <AttendanceCard attendance={attendance} />

            {/* si_business */}
            {teamType === 'si_business' && (
              <>
                <ProjectsCard projects={projects} />
                <UtilizationCard snapshot={snapshot} />
                <ClientsCard clients={clients} />
                <ReportsCard reports={reports} navigate={navigate} />
              </>
            )}

            {/* si_field */}
            {teamType === 'si_field' && (
              <>
                <IssuesCard issues={issues} />
                <ProjectsCard projects={projects} />
                <UtilizationCard snapshot={snapshot} />
                <ReportsCard reports={reports} navigate={navigate} />
              </>
            )}

            {/* small_team */}
            {teamType === 'small_team' && (
              <>
                <LinearTaskCard linearIssues={linearIssues} navigate={navigate} />
                <RetroCard retro={latestRetro} navigate={navigate} />
              </>
            )}
          </div>

          {/* ── Attendance Detail (all types) ── */}
          <AttendanceTable attendance={attendance} />

          {/* ── small_team: Linear 미설정 안내 ── */}
          {teamType === 'small_team' && linearIssues.length === 0 && !loading && (
            <div className="mt-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <CheckSquare size={18} className="text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">
                Linear API Key를 설정하면 태스크 현황이 여기에 표시됩니다.
                <button onClick={() => navigate('/settings')} className="ml-2 underline hover:no-underline">설정 바로가기</button>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
