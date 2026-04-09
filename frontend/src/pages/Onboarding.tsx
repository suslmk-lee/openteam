import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SetupTeamProfile } from '../../wailsjs/go/main/App'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import {
  Building2,
  HardHat,
  Users,
  UserCircle,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  BarChart3,
  GitBranch,
  ClipboardList,
} from 'lucide-react'

const TEAM_TYPES = [
  {
    code: 'si_business',
    label: 'SI 사업팀',
    icon: Building2,
    color: 'blue',
    desc: '시스템통합(SI) 프로젝트를 수주하고 팀을 운영하는 관리자',
    features: ['가동률 대시보드', 'M/M 투입 배정', '고객사 관리', 'SI/SM 프로젝트', '주간보고서'],
  },
  {
    code: 'si_field',
    label: '현장 SI팀 (PM/PL)',
    icon: HardHat,
    color: 'amber',
    desc: '현장에서 SI 프로젝트를 지휘하는 PM 또는 PL',
    features: ['Linear 연동 대시보드', '이슈/리스크 트래커', '투입인력 관리', '고객소통 현황', '주간보고서'],
  },
  {
    code: 'small_team',
    label: '소규모팀 (3~4인)',
    icon: Users,
    color: 'green',
    desc: '소규모 개발팀 또는 연구팀을 운영하는 팀장',
    features: ['Linear 태스크보드', '주간 회고(KPT)', '간단 근태', '주간보고서'],
  },
  {
    code: 'personal',
    label: '개인용',
    icon: UserCircle,
    color: 'purple',
    desc: '개인 업무 관리 및 생산성 추적을 위한 단독 사용자',
    features: ['개인 태스크보드', '일정/캘린더', '주간 회고', '개인 리포트'],
  },
]

const COLOR_MAP: Record<string, { card: string; badge: string; btn: string; icon: string }> = {
  blue: {
    card: 'border-blue-400 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    btn: 'bg-blue-600 hover:bg-blue-700',
    icon: 'bg-blue-100 text-blue-600',
  },
  amber: {
    card: 'border-amber-400 bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    btn: 'bg-amber-600 hover:bg-amber-700',
    icon: 'bg-amber-100 text-amber-600',
  },
  green: {
    card: 'border-green-400 bg-green-50',
    badge: 'bg-green-100 text-green-700',
    btn: 'bg-green-600 hover:bg-green-700',
    icon: 'bg-green-100 text-green-600',
  },
  purple: {
    card: 'border-purple-400 bg-purple-50',
    badge: 'bg-purple-100 text-purple-700',
    btn: 'bg-purple-600 hover:bg-purple-700',
    icon: 'bg-purple-100 text-purple-600',
  },
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { reload } = useTeamProfile()
  const [step, setStep] = useState(0)
  const [selectedType, setSelectedType] = useState('')
  const [teamName, setTeamName] = useState('')
  const [userName, setUserName] = useState('')
  const [memberCount, setMemberCount] = useState(4)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selected = TEAM_TYPES.find(t => t.code === selectedType)

  async function handleFinish() {
    if (!selectedType || !teamName.trim() || !userName.trim()) return
    setSaving(true)
    setError('')
    try {
      await SetupTeamProfile(selectedType, teamName.trim(), userName.trim(), memberCount)
      await reload()
      navigate('/', { replace: true })
    } catch (e: any) {
      setError(String(e))
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i < step
                    ? 'bg-blue-600 text-white'
                    : i === step
                    ? 'bg-white border-2 border-blue-600 text-blue-600'
                    : 'bg-white border-2 border-slate-300 text-slate-400'
                }`}
              >
                {i < step ? <CheckCircle2 size={16} /> : i + 1}
              </div>
              {i < 2 && <div className={`w-16 h-0.5 ${i < step ? 'bg-blue-600' : 'bg-slate-300'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="w-10 h-10 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800 mb-3">OpenReport에 오신 것을 환영합니다</h1>
              <p className="text-slate-500 mb-8 leading-relaxed">
                팀 유형에 맞는 관리 도구를 제공합니다.<br />
                몇 가지 설정만 하면 바로 시작할 수 있습니다.
              </p>
              <div className="grid grid-cols-4 gap-4 mb-8 text-sm">
                <div className="bg-slate-50 rounded-xl p-4">
                  <Building2 className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                  <p className="font-medium text-slate-700">SI 사업팀</p>
                  <p className="text-slate-400 text-xs mt-1">가동률·배정 관리</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <HardHat className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <p className="font-medium text-slate-700">현장 SI팀</p>
                  <p className="text-slate-400 text-xs mt-1">이슈·Linear 연동</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <Users className="w-6 h-6 text-green-500 mx-auto mb-2" />
                  <p className="font-medium text-slate-700">소규모팀</p>
                  <p className="text-slate-400 text-xs mt-1">칸반·회고</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <UserCircle className="w-6 h-6 text-purple-500 mx-auto mb-2" />
                  <p className="font-medium text-slate-700">개인용</p>
                  <p className="text-slate-400 text-xs mt-1">태스크·일정 관리</p>
                </div>
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                시작하기 <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* Step 1: Team type selection */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <GitBranch className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-slate-800">팀 유형을 선택하세요</h2>
              </div>
              <div className="space-y-3 mb-8">
                {TEAM_TYPES.map(t => {
                  const colors = COLOR_MAP[t.color]
                  const Icon = t.icon
                  const isSelected = selectedType === t.code
                  return (
                    <button
                      key={t.code}
                      onClick={() => setSelectedType(t.code)}
                      className={`w-full text-left border-2 rounded-xl p-4 transition-all ${
                        isSelected ? colors.card + ' border-opacity-100' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? colors.icon : 'bg-slate-100 text-slate-500'}`}>
                          <Icon size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-slate-800">{t.label}</span>
                            {isSelected && <CheckCircle2 size={16} className="text-blue-600" />}
                          </div>
                          <p className="text-sm text-slate-500 mb-2">{t.desc}</p>
                          <div className="flex flex-wrap gap-1">
                            {t.features.map(f => (
                              <span key={f} className={`text-xs px-2 py-0.5 rounded-full ${isSelected ? colors.badge : 'bg-slate-100 text-slate-500'}`}>
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="px-6 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <ChevronLeft size={18} /> 이전
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedType}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  다음 <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Basic info */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <ClipboardList className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-slate-800">기본 정보 입력</h2>
              </div>
              {selected && (
                <div className={`flex items-center gap-3 p-3 rounded-xl mb-6 ${COLOR_MAP[selected.color].card} border`}>
                  <selected.icon size={18} className={COLOR_MAP[selected.color].icon.split(' ')[1]} />
                  <span className="text-sm font-medium text-slate-700">{selected.label} 선택됨</span>
                </div>
              )}
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">팀 이름 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    placeholder="예: SI사업1팀, 개발팀"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">팀장 이름 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={userName}
                    onChange={e => setUserName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">팀 인원수</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={memberCount}
                      onChange={e => setMemberCount(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-12 text-center font-semibold text-slate-700 bg-slate-100 rounded-lg py-1">{memberCount}명</span>
                  </div>
                </div>
              </div>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <ChevronLeft size={18} /> 이전
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving || !teamName.trim() || !userName.trim()}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  {saving ? '저장 중...' : (
                    <><CheckCircle2 size={18} /> 설정 완료</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">설정은 나중에 설정 페이지에서 변경할 수 있습니다</p>
      </div>
    </div>
  )
}
