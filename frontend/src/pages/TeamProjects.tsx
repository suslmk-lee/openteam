import { useEffect, useState } from 'react'
import { useTeamService } from '../hooks/useTeamService'
import { Plus, X, Edit3, Users, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import type { db } from '../../wailsjs/go/models'
import { useTeamProfile } from '../contexts/TeamProfileContext'

interface TeamMember {
  id: number
  name: string
}

interface Client {
  id: number
  name: string
  status: string
  active: boolean
}

interface Project {
  id: number
  clientId: number
  name: string
  clientName: string
  status: string
  startDate: string
  endDate?: string
  teamType?: string
  description?: string
  createdAt?: any
}

interface MemberAssignment {
  id: number
  teamMemberId: number
  projectId: number
  allocationPercent: number
  startDate: string
  endDate?: string
}

interface SIWeeklySnapshot {
  teamUtilizationPercent: number
  unassignedCount: number
  memberRows: {
    teamMemberId: number
    teamMemberName: string
    allocationPercent: number
  }[]
}

interface WeekInfo {
  weekStart: string
  weekEnd: string
  label: string
}

const STATUS_LABELS: Record<string, string> = {}

const CLIENT_STATUS_LABELS: Record<string, string> = {
  existing: '기존',
  target: '신규',
  inactive: '종료',
}

const CLIENT_STATUS_COLORS: Record<string, string> = {
  existing: 'bg-blue-100 text-blue-700',
  target: 'bg-amber-100 text-amber-700',
  inactive: 'bg-slate-100 text-slate-500',
}

function formatDateOnly(value?: string) {
  if (!value?.trim()) return '-'

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }

  if (trimmed.includes('T')) {
    return trimmed.split('T')[0]
  }

  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return trimmed
}

export default function TeamProjects() {
  const teamService = useTeamService()
  const {
    getCurrentWeek: GetCurrentWeek,
    getWeekByOffset: GetWeekByOffset,
    getClientStatuses: GetClientStatuses,
    getSIWeeklySnapshot: GetSIWeeklySnapshot,
    listMemberAssignments: ListMemberAssignments,
    listTeamMembers: ListTeamMembers,
    listClients: ListClients,
    listSIProjects: ListSIProjects,
    saveMemberAssignment: SaveMemberAssignment,
    saveSIProject: SaveSIProject,
    saveClient: SaveClient,
    deleteMemberAssignment: DeleteMemberAssignment,
    deleteSIProject: DeleteSIProject,
    updateSIProjectStatus: UpdateSIProjectStatus,
    getSIProjectTypes: GetSIProjectTypes,
    getSIPhases: GetSIPhases,
    getSIRoles: GetSIRoles,
    getSIProjectView: GetSIProjectView,
    saveSIProjectDetail: SaveSIProjectDetail,
    saveSIWeeklyReport: SaveSIWeeklyReport,
    saveSIProjectMember: SaveSIProjectMember,
    deleteSIProjectMember: DeleteSIProjectMember,
  } = teamService

  const { profile } = useTeamProfile()
  const currentTeamType = profile?.teamType || ''

  // Debug log
  console.log('[TeamProjects] profile:', profile)
  console.log('[TeamProjects] currentTeamType:', currentTeamType)

  const [week, setWeek] = useState<WeekInfo | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [statuses, setStatuses] = useState<string[]>([])
  const [clientStatuses, setClientStatuses] = useState<string[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [assignments, setAssignments] = useState<MemberAssignment[]>([])
  const [snapshot, setSnapshot] = useState<SIWeeklySnapshot | null>(null)
  const [loading, setLoading] = useState(false)

  // SI Weekly Reporting State
  const [projectTypes, setProjectTypes] = useState<string[]>([])
  const [phases, setPhases] = useState<string[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectView, setProjectView] = useState<db.SIProjectView | null>(null)
  const [showWeeklyModal, setShowWeeklyModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  const [projectName, setProjectName] = useState('')
  const [projectClientId, setProjectClientId] = useState<number>(0)
  const [projectStatus, setProjectStatus] = useState('preparing')
  const [projectStartDate, setProjectStartDate] = useState('')
  const [projectEndDate, setProjectEndDate] = useState('')
  const [projectTeamType, setProjectTeamType] = useState<'si' | 'sm'>('si')

  const [assignmentMemberId, setAssignmentMemberId] = useState<number>(0)
  const [assignmentProjectId, setAssignmentProjectId] = useState<number>(0)
  const [assignmentAllocation, setAssignmentAllocation] = useState(100)
  const [assignmentStartDate, setAssignmentStartDate] = useState('')
  const [assignmentEndDate, setAssignmentEndDate] = useState('')

  // Client Modal
  const [showClientModal, setShowClientModal] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientStatus, setNewClientStatus] = useState('existing')
  const [newClientOwner, setNewClientOwner] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientNotes, setNewClientNotes] = useState('')
  const [newClientActive, setNewClientActive] = useState(true)

  useEffect(() => {
    ;(async () => {
      const currentWeek = await GetCurrentWeek()
      setWeek(currentWeek)
      setAssignmentStartDate(currentWeek.weekStart)
      setProjectStartDate(currentWeek.weekStart)
      const [clientStatusList, typeList, phaseList, roleList] = await Promise.all([
        GetClientStatuses(),
        GetSIProjectTypes(),
        GetSIPhases(),
        GetSIRoles(),
      ])
      setStatuses(phaseList) // 공통코드 프로젝트 단계를 상태로 사용
      setClientStatuses(clientStatusList)
      setProjectTypes(typeList)
      setPhases(phaseList)
      setRoles(roleList)
      if (phaseList.length > 0) {
        setProjectStatus(phaseList[0])
      }
      await loadData(currentWeek.weekStart, currentWeek.weekEnd)
    })()
  }, [])

  async function loadData(weekStart: string, weekEnd: string) {
    setLoading(true)
    try {
      const [loadedMembers, loadedProjects, loadedAssignments, loadedSnapshot, loadedClients] = await Promise.all([
        ListTeamMembers(),
        ListSIProjects(),
        ListMemberAssignments(weekStart, weekEnd),
        GetSIWeeklySnapshot(weekStart, weekEnd),
        ListClients('', true),
      ])
      setMembers(loadedMembers || [])
      setProjects(loadedProjects || [])
      setAssignments(loadedAssignments || [])
      setSnapshot(loadedSnapshot)
      setClients(loadedClients || [])
    } finally {
      setLoading(false)
    }
  }

  async function handleAddProject() {
    if (!projectName.trim() || !projectClientId) return
    await SaveSIProject({
      id: 0,
      clientId: projectClientId,
      name: projectName.trim(),
      teamType: projectTeamType,
      status: projectStatus,
      description: '',
      startDate: projectStartDate || week?.weekStart || '',
      endDate: projectEndDate || undefined,
    } as any)
    setProjectName('')
    setProjectClientId(0)
    setProjectTeamType('si')
    setProjectStartDate('')
    setProjectEndDate('')
    if (week) await loadData(week.weekStart, week.weekEnd)
  }

  async function handleAddClient() {
    if (!newClientName.trim()) return
    const saved = await SaveClient({
      id: 0,
      name: newClientName.trim(),
      status: newClientStatus,
      ownerName: newClientOwner.trim(),
      contactEmail: newClientEmail.trim(),
      notes: newClientNotes.trim(),
      active: newClientActive,
    } as any)
    // Reset form
    setNewClientName('')
    setNewClientStatus('existing')
    setNewClientOwner('')
    setNewClientEmail('')
    setNewClientNotes('')
    setNewClientActive(true)
    setShowClientModal(false)
    // Refresh clients and select the new one
    const updatedClients = await ListClients('', true)
    setClients(updatedClients || [])
    if (saved && saved.id) {
      setProjectClientId(saved.id)
    }
  }

  function getClientStatus(clientId: number): string {
    const client = clients.find(c => c.id === clientId)
    return client?.status || 'existing'
  }

  async function handleAddAssignment() {
    if (!assignmentMemberId || !assignmentProjectId || !assignmentStartDate) return
    await SaveMemberAssignment({
      id: 0,
      teamMemberId: assignmentMemberId,
      projectId: assignmentProjectId,
      allocationPercent: assignmentAllocation,
      startDate: assignmentStartDate,
      endDate: assignmentEndDate || undefined,
      workMode: '',
      notes: '',
    } as any)
    setAssignmentMemberId(0)
    setAssignmentProjectId(0)
    setAssignmentAllocation(100)
    if (week) await loadData(week.weekStart, week.weekEnd)
  }

  // SI Weekly Reporting Functions
  async function openProjectWeeklyReport(project: Project) {
    if (!week) return
    setSelectedProject(project)
    const view = await GetSIProjectView(project.id, week.weekStart, week.weekEnd)
    setProjectView(view)
    setShowWeeklyModal(true)
  }

  async function openProjectDetail(project: Project) {
    if (!week) return
    setSelectedProject(project)
    const view = await GetSIProjectView(project.id, week.weekStart, week.weekEnd)
    setProjectView(view)
    setShowDetailModal(true)
  }

  async function openProjectMembers(project: Project) {
    if (!week) return
    setSelectedProject(project)
    const view = await GetSIProjectView(project.id, week.weekStart, week.weekEnd)
    setProjectView(view)
    setShowMembersModal(true)
  }

  // Filter projects that overlap with the current week
  const filteredProjects = projects.filter(project => {
    if (!week) return true
    const weekStart = week.weekStart
    const weekEnd = week.weekEnd
    const projectStart = project.startDate
    const projectEnd = project.endDate
    
    // If project has no start date, include it
    if (!projectStart) return true
    
    // Project starts after week ends -> exclude
    if (projectStart > weekEnd) return false
    
    // Project ends before week starts -> exclude
    if (projectEnd && projectEnd < weekStart) return false
    
    return true
  })

  async function openProjectEdit(project: Project) {
    setSelectedProject(project)
    setShowEditModal(true)
  }

  async function handleSaveProjectEdit(name: string, clientId: number, status: string, startDate: string, endDate: string, teamType: string) {
    if (!selectedProject) return
    // Normalize dates to YYYY-MM-DD format (remove time component if present)
    const normalizeDate = (dateStr: string): string => {
      if (!dateStr) return ''
      // If date is in ISO 8601 format (2026-01-01T00:00:00Z), extract just the date part
      if (dateStr.includes('T')) {
        return dateStr.split('T')[0]
      }
      return dateStr
    }
    await SaveSIProject({
      id: selectedProject.id,
      userId: 1,
      teamType: teamType,
      clientId,
      name,
      clientName: clients.find(c => c.id === clientId)?.name || '',
      status,
      description: (selectedProject as any).description || '',
      startDate: normalizeDate(startDate),
      endDate: normalizeDate(endDate),
      createdAt: (selectedProject as any).createdAt
    } as any)
    setShowEditModal(false)
    setSelectedProject(null)
    if (week) await loadData(week.weekStart, week.weekEnd)
  }

  async function handleSaveWeeklyReport(progress: string, plan: string, risks: string, notes: string) {
    if (!selectedProject || !week) return
    await SaveSIWeeklyReport({
      id: projectView?.weeklyReport?.id || 0,
      userId: 0,
      projectId: selectedProject.id,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      thisWeekProgress: progress,
      nextWeekPlan: plan,
      risks,
      notes,
    } as any)
    setShowWeeklyModal(false)
    if (week) await loadData(week.weekStart, week.weekEnd)
  }

  async function handleSaveProjectDetail(projectType: string, pmName: string, totalMM: number, currentPhase: string, progressRate: number) {
    if (!selectedProject) return
    await SaveSIProjectDetail({
      id: projectView?.detail?.id || 0,
      userId: 0,
      projectId: selectedProject.id,
      projectType,
      pmName,
      totalMM,
      currentPhase,
      progressRate,
    } as any)
    setShowDetailModal(false)
  }

  async function handleAddProjectMember(teamMemberId: number, role: string, allocationMM: number, startDate: string, endDate?: string) {
    if (!selectedProject) return
    await SaveSIProjectMember({
      id: 0,
      userId: 0,
      projectId: selectedProject.id,
      teamMemberId,
      memberName: '',
      role,
      allocationMM,
      startDate,
      endDate,
    } as any)
    // Refresh view
    if (week) {
      const view = await GetSIProjectView(selectedProject.id, week.weekStart, week.weekEnd)
      setProjectView(view)
    }
  }

  async function handleDeleteProjectMember(memberId: number) {
    await DeleteSIProjectMember(memberId)
    // Refresh view
    if (week && selectedProject) {
      const view = await GetSIProjectView(selectedProject.id, week.weekStart, week.weekEnd)
      setProjectView(view)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">프로젝트 관리</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const newOffset = weekOffset - 1
                const targetWeek = await GetWeekByOffset(newOffset)
                if (targetWeek) {
                  setWeekOffset(newOffset)
                  setWeek(targetWeek)
                  await loadData(targetWeek.weekStart, targetWeek.weekEnd)
                }
              }}
              disabled={loading}
              className="p-1 hover:bg-slate-100 rounded transition-colors"
              title="전주"
            >
              <ChevronLeft size={16} className="text-slate-600" />
            </button>
            <p className="text-xs text-slate-500 min-w-[80px] text-center">{week?.label}</p>
            <button
              onClick={async () => {
                const newOffset = weekOffset + 1
                const targetWeek = await GetWeekByOffset(newOffset)
                if (targetWeek) {
                  setWeekOffset(newOffset)
                  setWeek(targetWeek)
                  await loadData(targetWeek.weekStart, targetWeek.weekEnd)
                }
              }}
              disabled={loading}
              className="p-1 hover:bg-slate-100 rounded transition-colors"
              title="다음주"
            >
              <ChevronRight size={16} className="text-slate-600" />
            </button>
          </div>
        </div>
        <button
          onClick={() => week && loadData(week.weekStart, week.weekEnd)}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Summary Cards */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">팀 평균 가동률</p>
              <p className="text-2xl font-semibold text-slate-800">
                {snapshot ? `${snapshot.teamUtilizationPercent.toFixed(1)}%` : '-'}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">미배정 인원</p>
              <p className="text-2xl font-semibold text-amber-600">{snapshot?.unassignedCount ?? '-'}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">진행중인 프로젝트</p>
              <p className="text-2xl font-semibold text-blue-600">
                {projects.filter(p => p.status !== '종료').length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">전체 프로젝트</p>
              <p className="text-2xl font-semibold text-slate-600">{projects.length}</p>
            </div>
          </section>

          {/* Projects */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">프로젝트 등록</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
              <input
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="프로젝트명"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={projectClientId}
                  onChange={e => setProjectClientId(Number(e.target.value))}
                >
                  <option value={0}>고객사 선택</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({CLIENT_STATUS_LABELS[c.status] || c.status})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowClientModal(true)}
                  className="px-2 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
                  title="신규 고객사 추가"
                >
                  <Plus size={16} />
                </button>
              </div>
              {currentTeamType === 'si_business' && (
                <select
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={projectTeamType}
                  onChange={e => setProjectTeamType(e.target.value as 'si' | 'sm')}
                >
                  <option value="si">SI</option>
                  <option value="sm">SM</option>
                </select>
              )}
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={projectStatus}
                onChange={e => setProjectStatus(e.target.value)}
              >
                {phases.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="date"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={projectStartDate}
                onChange={e => setProjectStartDate(e.target.value)}
                placeholder="시작일"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={projectEndDate}
                  onChange={e => setProjectEndDate(e.target.value)}
                  placeholder="완료기한"
                />
                <button
                  onClick={handleAddProject}
                  disabled={!projectName.trim() || !projectClientId}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  등록
                </button>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-700 mt-6 mb-3">프로젝트 목록 ({filteredProjects.length}개)</h3>
            {filteredProjects.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">해당 기간에 진행 중인 프로젝트가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">프로젝트명</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">고객사</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">타입</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">기간</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">상태</th>
                      <th className="text-right py-2 px-3 text-slate-600 font-medium">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map(project => {
                      const clientStatus = getClientStatus(project.clientId)
                      const isOverdue = project.endDate && new Date(project.endDate) < new Date() && project.status !== '종료'
                      return (
                        <tr key={project.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              {project.name}
                              {isOverdue && <span className="text-xs text-red-600 font-medium">(지연)</span>}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-slate-600">{project.clientName || '-'}</td>
                          <td className="py-2 px-3">
                            <span className={`text-xs px-2 py-0.5 rounded ${project.teamType === 'sm' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {project.teamType?.toUpperCase() || 'SI'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-500 text-xs">
                            {formatDateOnly(project.startDate) || '-'} ~ {formatDateOnly(project.endDate) || '미정'}
                          </td>
                          <td className="py-2 px-3">
                            <select
                              className="px-2 py-1 text-xs border border-slate-200 rounded"
                              value={project.status}
                              onChange={async e => {
                                await UpdateSIProjectStatus(project.id, e.target.value)
                                if (week) await loadData(week.weekStart, week.weekEnd)
                              }}
                            >
                              {phases.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openProjectEdit(project)}
                                className="text-indigo-600 hover:text-indigo-800 text-xs px-2 py-1 hover:bg-indigo-50 rounded flex items-center gap-1"
                                title="프로젝트 수정"
                              >
                                <Edit3 size={12} />
                                수정
                              </button>
                              <button
                                onClick={() => openProjectDetail(project)}
                                className="text-slate-600 hover:text-slate-800 text-xs px-2 py-1 hover:bg-slate-100 rounded flex items-center gap-1"
                                title="프로젝트 상세"
                              >
                                상세
                              </button>
                              <button
                                onClick={() => openProjectWeeklyReport(project)}
                                className="text-emerald-600 hover:text-emerald-800 text-xs px-2 py-1 hover:bg-emerald-50 rounded flex items-center gap-1"
                                title="주간보고"
                              >
                                <FileText size={12} />
                                보고
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(`${project.name} 프로젝트를 삭제하시겠습니까?`)) return
                                  await DeleteSIProject(project.id)
                                  if (week) await loadData(week.weekStart, week.weekEnd)
                                }}
                                className="text-rose-600 hover:text-rose-700 text-xs px-2 py-1 hover:bg-rose-50 rounded"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Assignment */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">투입 배정 등록</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={assignmentMemberId}
                onChange={e => setAssignmentMemberId(Number(e.target.value))}
              >
                <option value={0}>팀원 선택</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={assignmentProjectId}
                onChange={e => setAssignmentProjectId(Number(e.target.value))}
              >
                <option value={0}>프로젝트 선택</option>
                {projects.filter(p => p.status !== '종료').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input
                type="number"
                min={0}
                max={100}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={assignmentAllocation}
                onChange={e => setAssignmentAllocation(Number(e.target.value))}
                placeholder="가동률(%)"
              />
              <input
                type="date"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={assignmentStartDate}
                onChange={e => setAssignmentStartDate(e.target.value)}
                placeholder="시작일"
              />
              <button
                onClick={handleAddAssignment}
                disabled={!assignmentMemberId || !assignmentProjectId}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                배정
              </button>
            </div>
          </section>

          {/* Project Assignment Status */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">프로젝트별 투입 현황</h3>
            {projects.filter(p => p.status !== '종료').length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">진행 중인 프로젝트가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {projects.filter(p => p.status !== '종료').map(project => {
                  const projectAssignments = assignments.filter(a => a.projectId === project.id)
                  return (
                    <div key={project.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-slate-800">{project.name}</span>
                          <span className="text-xs text-slate-500">({projectAssignments.length}명)</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                          {projectAssignments.reduce((sum, a) => sum + a.allocationPercent, 0)}%
                        </span>
                      </div>
                      {projectAssignments.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-400">투입된 인력 없음</div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {projectAssignments.map(assignment => {
                            const member = members.find(m => m.id === assignment.teamMemberId)
                            return (
                              <div key={assignment.id} className="px-4 py-2 flex items-center justify-between text-sm">
                                <div className="flex items-center gap-3">
                                  <span className="font-medium text-slate-700">{member?.name || assignment.teamMemberId}</span>
                                  <span className="text-slate-500">{assignment.allocationPercent}%</span>
                                  <span className="text-slate-400 text-xs">
                                    투입기간: {formatDateOnly(assignment.startDate)}
                                    {assignment.endDate ? ` ~ ${formatDateOnly(assignment.endDate)}` : ' ~ 미정'}
                                  </span>
                                </div>
                                <button
                                  onClick={async () => {
                                    await DeleteMemberAssignment(assignment.id)
                                    if (week) await loadData(week.weekStart, week.weekEnd)
                                  }}
                                  className="text-rose-600 hover:text-rose-700 text-xs px-2 py-1 hover:bg-rose-50 rounded"
                                >
                                  해제
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Utilization Detail */}
          {snapshot && snapshot.memberRows && snapshot.memberRows.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">팀원별 가동률 현황</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {snapshot.memberRows.map(row => (
                  <div
                    key={row.teamMemberId}
                    className={`p-3 rounded-lg border ${
                      row.allocationPercent === 0
                        ? 'border-amber-200 bg-amber-50'
                        : row.allocationPercent >= 100
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-800">{row.teamMemberName}</p>
                    <p className={`text-lg font-semibold ${
                      row.allocationPercent === 0
                        ? 'text-amber-600'
                        : row.allocationPercent >= 100
                        ? 'text-blue-600'
                        : 'text-slate-700'
                    }`}>
                      {row.allocationPercent.toFixed(0)}%
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Client Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">신규 고객사 등록</h3>
              <button
                onClick={() => setShowClientModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">고객사명 *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="예: 삼성전자"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">고객사 상태</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={newClientStatus}
                  onChange={e => setNewClientStatus(e.target.value)}
                >
                  {clientStatuses.map(s => (
                    <option key={s} value={s}>{CLIENT_STATUS_LABELS[s] || s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">주요 담당자</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={newClientOwner}
                  onChange={e => setNewClientOwner(e.target.value)}
                  placeholder="예: 홍길동 과장"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">연띝처 이메일</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={newClientEmail}
                  onChange={e => setNewClientEmail(e.target.value)}
                  placeholder="example@company.com"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">비고</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={newClientNotes}
                  onChange={e => setNewClientNotes(e.target.value)}
                  placeholder="추가 정보..."
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newClientActive}
                  onChange={e => setNewClientActive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                활성 고객사
              </label>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowClientModal(false)}
                className="flex-1 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
              >
                취소
              </button>
              <button
                onClick={handleAddClient}
                disabled={!newClientName.trim()}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SI Weekly Report Modal */}
      {showWeeklyModal && selectedProject && (
        <WeeklyReportModal
          project={selectedProject}
          week={week}
          existingReport={projectView?.weeklyReport}
          onSave={handleSaveWeeklyReport}
          onClose={() => setShowWeeklyModal(false)}
        />
      )}

      {/* SI Project Detail Modal */}
      {showDetailModal && selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          detail={projectView?.detail}
          members={projectView?.members || []}
          projectTypes={projectTypes}
          phases={phases}
          onSave={handleSaveProjectDetail}
          onClose={() => setShowDetailModal(false)}
        />
      )}

      {/* SI Project Members Modal */}
      {showMembersModal && selectedProject && (
        <ProjectMembersModal
          project={selectedProject}
          members={projectView?.members || []}
          teamMembers={members}
          roles={roles}
          onAddMember={handleAddProjectMember}
          onDeleteMember={handleDeleteProjectMember}
          onClose={() => setShowMembersModal(false)}
        />
      )}
      {/* Project Edit Modal */}
      {showEditModal && selectedProject && (
        <ProjectEditModal
          project={selectedProject}
          clients={clients}
          phases={phases}
          currentTeamType={currentTeamType}
          onSave={handleSaveProjectEdit}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  )
}

// --- Modal Components ---

interface ProjectEditModalProps {
  project: Project
  clients: Client[]
  phases: string[]
  currentTeamType: string
  onSave: (name: string, clientId: number, status: string, startDate: string, endDate: string, teamType: string) => void
  onClose: () => void
}

function ProjectEditModal({ project, clients, phases, currentTeamType, onSave, onClose }: ProjectEditModalProps) {
  // Helper to normalize date format for input type="date"
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return ''
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0]
    }
    return dateStr
  }

  const [name, setName] = useState(project.name)
  const [clientId, setClientId] = useState(project.clientId)
  const [status, setStatus] = useState(project.status)
  const [startDate, setStartDate] = useState(normalizeDate(project.startDate || ''))
  const [endDate, setEndDate] = useState(normalizeDate(project.endDate || ''))
  const [teamType, setTeamType] = useState(project.teamType || 'si')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">프로젝트 수정</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">프로젝트명 *</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="프로젝트명을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">고객사 *</label>
            <select 
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
              value={clientId} 
              onChange={e => setClientId(Number(e.target.value))}
            >
              <option value={0}>고객사 선택</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {currentTeamType === 'si_business' && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">프로젝트 타입</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={teamType}
                onChange={e => setTeamType(e.target.value)}
              >
                <option value="si">SI</option>
                <option value="sm">SM</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-600 mb-1">프로젝트 단계</label>
            <select 
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
              value={status} 
              onChange={e => setStatus(e.target.value)}
            >
              {phases.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">시작일</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">완료기한</label>
              <input 
                type="date" 
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">취소</button>
          <button 
            onClick={() => onSave(name, clientId, status, startDate, endDate, teamType)} 
            disabled={!name.trim() || !clientId}
            className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

interface WeeklyReportModalProps {
  project: Project
  week: WeekInfo | null
  existingReport?: db.SIWeeklyReport
  onSave: (progress: string, plan: string, risks: string, notes: string) => void
  onClose: () => void
}

function WeeklyReportModal({ project, week, existingReport, onSave, onClose }: WeeklyReportModalProps) {
  const teamService = useTeamService()
  const {
    getWeekByOffset: GetWeekByOffset,
    getSIProjectView: GetSIProjectView,
  } = teamService
  const [progress, setProgress] = useState(existingReport?.thisWeekProgress || '')
  const [plan, setPlan] = useState(existingReport?.nextWeekPlan || '')
  const [risks, setRisks] = useState(existingReport?.risks || '')
  const [notes, setNotes] = useState(existingReport?.notes || '')
  const [loadingLastWeek, setLoadingLastWeek] = useState(false)

  async function loadLastWeekData() {
    if (!week) return
    setLoadingLastWeek(true)
    try {
      // Get last week dates (offset -1)
      const lastWeek = await GetWeekByOffset(-1)
      if (!lastWeek) {
        alert('지난 주 정보를 가져올 수 없습니다.')
        return
      }
      
      // Fetch last week's project data
      const lastWeekView = await GetSIProjectView(project.id, lastWeek.weekStart, lastWeek.weekEnd)
      
      if (lastWeekView?.weeklyReport?.nextWeekPlan) {
        // Set last week's "next week plan" as current week's "this week progress"
        setProgress(lastWeekView.weeklyReport.nextWeekPlan)
        alert(`지난 주(${lastWeek.label})의 차주 계획을 불러왔습니다.`)
      } else {
        alert('지난 주에 작성된 차주 계획이 없습니다.')
      }
    } catch (err) {
      console.error('Failed to load last week data:', err)
      alert('지난 주 데이터를 불러오는데 실패했습니다.')
    } finally {
      setLoadingLastWeek(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">주간업무 보고</h3>
            <p className="text-sm text-slate-500">{project.name} | {week?.label}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">금주 진행사항</label>
              {!existingReport?.thisWeekProgress && (
                <button
                  onClick={loadLastWeekData}
                  disabled={loadingLastWeek}
                  className="text-xs px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
                >
                  {loadingLastWeek ? '불러오는 중...' : '지난 주 불러오기'}
                </button>
              )}
            </div>
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[100px]"
              value={progress}
              onChange={e => setProgress(e.target.value)}
              placeholder="- 진행 중인 작업 내용\n- 완료된 항목\n- 이슈 및 대응"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">차주 계획</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[80px]"
              value={plan}
              onChange={e => setPlan(e.target.value)}
              placeholder="- 예정된 작업\n- 마일스톤\n- 회의 일정"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">리스크 / 이슈</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[60px]"
              value={risks}
              onChange={e => setRisks(e.target.value)}
              placeholder="- 현재 리스크\n- 대응 방안"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">비고</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[60px]"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="기타 참고사항"
            />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">취소</button>
          <button onClick={() => onSave(progress, plan, risks, notes)} className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">저장</button>
        </div>
      </div>
    </div>
  )
}

interface ProjectDetailModalProps {
  project: Project
  detail?: db.SIProjectDetail
  members: db.SIProjectMember[]
  projectTypes: string[]
  phases: string[]
  onSave: (projectType: string, pmName: string, totalMM: number, currentPhase: string, progressRate: number) => void
  onClose: () => void
}

function ProjectDetailModal({ project, detail, members, projectTypes, phases, onSave, onClose }: ProjectDetailModalProps) {
  // Use project.status as the source of truth for current phase
  const [projectType, setProjectType] = useState(detail?.projectType || projectTypes[0] || '')
  const [pmName, setPmName] = useState(detail?.pmName || '')
  const [totalMM, setTotalMM] = useState(detail?.totalMM || 0)
  const [currentPhase, setCurrentPhase] = useState(project.status || phases[0] || '')
  const [progressRate, setProgressRate] = useState(detail?.progressRate || 0)
  
  // Sync state when modal opens
  useEffect(() => {
    setProjectType(detail?.projectType || projectTypes[0] || '')
    setPmName(detail?.pmName || '')
    setTotalMM(detail?.totalMM || 0)
    // Always use project.status as the current phase
    const validPhase = phases.includes(project.status) ? project.status : phases[0] || ''
    setCurrentPhase(validPhase)
    setProgressRate(detail?.progressRate || 0)
  }, [detail, project.status, projectTypes, phases])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">프로젝트 상세</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">구분</label>
            <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={projectType} onChange={e => setProjectType(e.target.value)}>
              {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">PM/책임자</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
              value={pmName} 
              onChange={e => setPmName(e.target.value)} 
              placeholder="예: 홍길동 책임 (외부업체 PM 등 자유입력)"
            />
            <p className="text-xs text-slate-400 mt-1">※ 외부업체 PM, 고객사 담당자 등 자유롭게 입력 가능</p>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">총 M/M</label>
            <input type="number" step="0.1" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={totalMM} onChange={e => setTotalMM(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">현재 단계</label>
            <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={currentPhase} onChange={e => setCurrentPhase(e.target.value)}>
              {phases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">진행률 (%)</label>
            <input type="number" min="0" max="100" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={progressRate} onChange={e => setProgressRate(Number(e.target.value))} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">취소</button>
          <button onClick={() => onSave(projectType, pmName, totalMM, currentPhase, progressRate)} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">저장</button>
        </div>
      </div>
    </div>
  )
}

interface ProjectMembersModalProps {
  project: Project
  members: db.SIProjectMember[]
  teamMembers: TeamMember[]
  roles: string[]
  onAddMember: (teamMemberId: number, role: string, allocationMM: number, startDate: string, endDate?: string) => void
  onDeleteMember: (memberId: number) => void
  onClose: () => void
}

function ProjectMembersModal({ project, members, teamMembers, roles, onAddMember, onDeleteMember, onClose }: ProjectMembersModalProps) {
  const [selectedMemberId, setSelectedMemberId] = useState(0)
  const [selectedRole, setSelectedRole] = useState(roles[0] || '사원')
  const [allocationMM, setAllocationMM] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Filter out already assigned members
  const availableMembers = teamMembers.filter(tm => !members.some(m => m.teamMemberId === tm.id))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">투입 인력 관리</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6">
          {/* Add Member Form */}
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">인력 추가</h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm" value={selectedMemberId} onChange={e => setSelectedMemberId(Number(e.target.value))}>
                <option value={0}>팀원 선택</option>
                {availableMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm" value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input type="number" step="0.1" className="px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="M/M" value={allocationMM} onChange={e => setAllocationMM(Number(e.target.value))} />
              <input type="date" className="px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="시작일" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <input type="date" className="px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="종료일" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <button
              onClick={() => {
                if (selectedMemberId) {
                  onAddMember(selectedMemberId, selectedRole, allocationMM, startDate, endDate || undefined)
                  setSelectedMemberId(0)
                  setAllocationMM(0)
                }
              }}
              disabled={!selectedMemberId}
              className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              추가
            </button>
          </div>

          {/* Member List */}
          <h4 className="text-sm font-medium text-slate-700 mb-2">투입 인력 목록 ({members.length}명)</h4>
          {members.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">등록된 인력이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-medium text-sm">{member.memberName}</span>
                    <span className="text-slate-500 text-sm ml-2">{member.role}</span>
                    <span className="text-slate-400 text-xs ml-2">{member.allocationMM}M/M</span>
                  </div>
                  <button onClick={() => onDeleteMember(member.id)} className="text-rose-600 hover:text-rose-700 text-xs px-2 py-1 hover:bg-rose-50 rounded">삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="w-full px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">닫기</button>
        </div>
      </div>
    </div>
  )
}
