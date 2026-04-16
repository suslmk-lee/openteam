import { useEffect, useRef, useState } from 'react'
import { Plus, Link2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useTeamService } from '../hooks/useTeamService'

interface TeamMember {
  id: number
  name: string
  position: string
  email: string
  role: string
  employmentType: string
  active: boolean
  hireDate: string
  resignDate?: string
  linearUserId?: string
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

const POSITION_LABELS: Record<string, string> = {
  staff: '사원',
  assistant_manager: '대리',
  manager: '과장',
  deputy_general_manager: '차장',
  general_manager: '부장',
}

export default function TeamMembers() {
  const teamService = useTeamService()
  const {
    listTeamMembers,
    saveTeamMember,
    deleteTeamMember,
    getPositionTypes,
    autoMapLinearMembers,
    getEmploymentTypes,
    addPositionType,
    addEmploymentType,
  } = teamService

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [positionTypes, setPositionTypes] = useState<string[]>([])
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [autoMapping, setAutoMapping] = useState(false)
  const [autoMapResult, setAutoMapResult] = useState<string | null>(null)
  // inline linear id editing: memberId → draft value
  const [linearIdEdits, setLinearIdEdits] = useState<Record<number, string>>({})
  const [savingLinearId, setSavingLinearId] = useState<Record<number, boolean>>({})
  const autoMapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [memberName, setMemberName] = useState('')
  const [memberPosition, setMemberPosition] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState('')
  const [memberEmploymentType, setMemberEmploymentType] = useState('정규')
  const [memberActive, setMemberActive] = useState(true)
  const [memberHireDate, setMemberHireDate] = useState('')
  const [memberResignDate, setMemberResignDate] = useState('')

  useEffect(() => {
    loadMembers()
    loadPositionTypes()
    loadEmploymentTypes()
  }, [])

  async function loadPositionTypes() {
    const types = await getPositionTypes()
    setPositionTypes(types || [])
    if ((!memberPosition || !types?.includes(memberPosition)) && types && types.length > 0) {
      setMemberPosition(types[0])
    }
  }

  async function loadEmploymentTypes() {
    try {
      const types = await getEmploymentTypes()
      const list = Array.isArray(types) ? types : []
      setEmploymentTypes(list)
      if ((!memberEmploymentType || !list.includes(memberEmploymentType)) && list.length > 0) {
        setMemberEmploymentType(list[0])
      }
    } catch {
      const fallback = ['정규', '외주', '계약']
      setEmploymentTypes(fallback)
      if (!memberEmploymentType) {
        setMemberEmploymentType(fallback[0])
      }
    }
  }

  async function handleAddPositionType() {
    const value = prompt('추가할 직급을 입력하세요')
    if (!value?.trim()) return
    await addPositionType(value.trim())
    await loadPositionTypes()
    setMemberPosition(value.trim())
  }

  async function handleAddEmploymentType() {
    const value = prompt('추가할 고용형태를 입력하세요')
    if (!value?.trim()) return
    await addEmploymentType(value.trim())
    await loadEmploymentTypes()
    setMemberEmploymentType(value.trim())
  }

  async function loadMembers() {
    setLoading(true)
    try {
      const loaded = await listTeamMembers()
      setMembers(loaded || [])
    } catch (err) {
      console.error('Failed to load team members:', err)
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  async function handleAddMember() {
    if (!memberName.trim()) return
    try {
      await saveTeamMember({
        id: 0,
        name: memberName.trim(),
        position: memberPosition,
        email: memberEmail.trim(),
        role: memberRole.trim(),
        employmentType: memberEmploymentType,
        active: memberActive,
        hireDate: memberHireDate,
        resignDate: memberResignDate || undefined,
      } as any)
      setMemberName('')
      setMemberPosition(positionTypes[0] || '')
      setMemberEmail('')
      setMemberRole('')
      setMemberEmploymentType(employmentTypes[0] || '정규')
      setMemberActive(true)
      setMemberHireDate('')
      setMemberResignDate('')
      setShowAddModal(false)
      await loadMembers()
    } catch (err: any) {
      console.error('Failed to save team member:', err)
      const msg = typeof err?.message === 'string' && err.message ? err.message : '팀원 저장에 실패했습니다.'
      alert(msg)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">팀원 관리</h2>
          <p className="text-xs text-slate-500">팀원 등록 및 직급/메일/역할 관리</p>
        </div>
        <div className="flex items-center gap-2">
          {autoMapResult && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">{autoMapResult}</span>
          )}
          <button
            onClick={async () => {
              setAutoMapping(true)
              setAutoMapResult(null)
              try {
                const count = await autoMapLinearMembers()
                setAutoMapResult(`${count}명 자동 매핑 완료`)
                await loadMembers()
                if (autoMapTimerRef.current) clearTimeout(autoMapTimerRef.current)
                autoMapTimerRef.current = setTimeout(() => setAutoMapResult(null), 4000)
              } catch (e: any) {
                setAutoMapResult(`실패: ${String(e)}`)
              } finally {
                setAutoMapping(false)
              }
            }}
            disabled={autoMapping}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 rounded-lg disabled:opacity-50"
          >
            {autoMapping ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Linear 자동 매핑
          </button>
          <button
            onClick={loadMembers}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            {loading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Members List */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">팀원 목록 ({members.length}명)</h3>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
              >
                <Plus size={16} />
                신규등록
              </button>
            </div>
            
            {members.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">등록된 팀원이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">이름</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">직급</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">이메일</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">역할</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">고용형태</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">입사일</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">퇴직일</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">상태</th>
                      <th className="text-left py-2 px-3 text-slate-600 font-medium">Linear 연결</th>
                      <th className="text-right py-2 px-3 text-slate-600 font-medium">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(member => (
                      <tr key={member.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-3">{member.name}</td>
                        <td className="py-2 px-3 text-slate-600">{POSITION_LABELS[member.position] || member.position || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{member.email || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{member.role || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{member.employmentType || '-'}</td>
                        <td className="py-2 px-3 text-slate-500 text-xs">{formatDateOnly(member.hireDate)}</td>
                        <td className="py-2 px-3 text-slate-500 text-xs">{formatDateOnly(member.resignDate)}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            member.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {member.active ? '재직중' : '퇴직'}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            {member.linearUserId ? (
                              <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                            ) : (
                              <AlertCircle size={12} className="text-slate-300 shrink-0" />
                            )}
                            <input
                              className="w-28 text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400 font-mono"
                              placeholder="Linear User ID"
                              value={linearIdEdits[member.id] ?? member.linearUserId ?? ''}
                              onChange={e => setLinearIdEdits(prev => ({ ...prev, [member.id]: e.target.value }))}
                              onBlur={async () => {
                                const draft = linearIdEdits[member.id]
                                if (draft === undefined || draft === (member.linearUserId ?? '')) return
                                setSavingLinearId(prev => ({ ...prev, [member.id]: true }))
                                try {
                                  await saveTeamMember({ ...member, linearUserId: draft } as any)
                                  setLinearIdEdits(prev => { const n = { ...prev }; delete n[member.id]; return n })
                                  await loadMembers()
                                } finally {
                                  setSavingLinearId(prev => { const n = { ...prev }; delete n[member.id]; return n })
                                }
                              }}
                            />
                            {savingLinearId[member.id] && <Loader2 size={10} className="animate-spin text-slate-400" />}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={async () => {
                              if (!confirm(`${member.name} 팀원을 삭제하시겠습니까?`)) return
                              await deleteTeamMember(member.id)
                              await loadMembers()
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

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">팀원 등록</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">이름 *</label>
                  <input
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="이름을 입력하세요"
                    value={memberName}
                    onChange={e => setMemberName(e.target.value)}
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-sm text-slate-600">직급</label>
                    <button
                      type="button"
                      onClick={handleAddPositionType}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      + 추가
                    </button>
                  </div>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    value={memberPosition}
                    onChange={e => setMemberPosition(e.target.value)}
                  >
                    {positionTypes.map(p => (
                      <option key={p} value={p}>{POSITION_LABELS[p] || p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">이메일</label>
                  <input
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="이메일을 입력하세요"
                    type="email"
                    value={memberEmail}
                    onChange={e => setMemberEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">역할</label>
                  <input
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="역할을 입력하세요"
                    value={memberRole}
                    onChange={e => setMemberRole(e.target.value)}
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-sm text-slate-600">고용형태</label>
                    <button
                      type="button"
                      onClick={handleAddEmploymentType}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      + 추가
                    </button>
                  </div>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    value={memberEmploymentType}
                    onChange={e => setMemberEmploymentType(e.target.value)}
                  >
                    {employmentTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">입사일</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    value={memberHireDate}
                    onChange={e => setMemberHireDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">퇴직일</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    value={memberResignDate}
                    onChange={e => setMemberResignDate(e.target.value)}
                  />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberActive}
                      onChange={e => setMemberActive(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-600">재직중</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
              >
                취소
              </button>
              <button
                onClick={handleAddMember}
                disabled={!memberName.trim() || loading}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
