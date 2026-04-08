import { useEffect, useState } from 'react'
import { ListRetrospectives, SaveRetrospective, GetCurrentWeek } from '../../wailsjs/go/main/App'
import { RotateCcw, Plus, ChevronDown, ChevronUp, Save } from 'lucide-react'

interface Retrospective {
  id: number
  userId: number
  weekStart: string
  weekEnd: string
  wentWell: string
  toImprove: string
  actionItems: string
  createdAt: string
}

interface Week {
  weekStart: string
  weekEnd: string
  label: string
}

function normalizeDate(d: string) {
  if (!d) return ''
  return d.includes('T') ? d.split('T')[0] : d
}

export default function WeeklyRetro() {
  const [retros, setRetros] = useState<Retrospective[]>([])
  const [currentWeek, setCurrentWeek] = useState<Week | null>(null)
  const [editing, setEditing] = useState<Partial<Retrospective>>({})
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<number | 'new' | null>('new')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [retrosData, weekData] = await Promise.all([
        ListRetrospectives(),
        GetCurrentWeek(),
      ])
      setRetros((retrosData || []) as Retrospective[])
      setCurrentWeek(weekData as Week)

      // Initialize editing with current week
      const existing = (retrosData || []).find(r =>
        normalizeDate((r as any).weekStart) === (weekData as any)?.weekStart
      )
      if (existing) {
        setEditing({ ...existing as any })
        setExpandedId((existing as any).id)
      } else if (weekData) {
        setEditing({
          weekStart: (weekData as any).weekStart,
          weekEnd: (weekData as any).weekEnd,
          wentWell: '',
          toImprove: '',
          actionItems: '',
        })
        setExpandedId('new')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!editing.weekStart) return
    setSaving(true)
    try {
      await SaveRetrospective(editing as any)
      await load()
    } finally {
      setSaving(false)
    }
  }

  function startNewRetro(weekStart: string, weekEnd: string) {
    setEditing({ weekStart, weekEnd, wentWell: '', toImprove: '', actionItems: '' })
    setExpandedId('new')
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <RotateCcw size={20} className="text-green-600" />
          <h2 className="text-lg font-semibold text-slate-800">주간 회고</h2>
          {currentWeek && (
            <span className="text-sm text-slate-400">{currentWeek.label}</span>
          )}
        </div>
        {currentWeek && !retros.find(r => normalizeDate(r.weekStart) === currentWeek.weekStart) && (
          <button
            onClick={() => startNewRetro(currentWeek.weekStart, currentWeek.weekEnd)}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={16} /> 이번 주 회고 작성
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        {loading ? (
          <p className="text-slate-400 text-center py-12">로딩 중...</p>
        ) : (
          <div className="space-y-4">
            {/* Current week / new form */}
            {expandedId === 'new' && editing.weekStart && (
              <div className="bg-white border-2 border-green-300 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-green-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium mr-2">이번 주</span>
                      <span className="font-semibold text-slate-800">
                        {normalizeDate(editing.weekStart)} ~ {normalizeDate(editing.weekEnd || '')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <KPTSection
                    icon="✅"
                    label="잘 된 것 (Keep)"
                    color="green"
                    value={editing.wentWell || ''}
                    onChange={v => setEditing(p => ({ ...p, wentWell: v }))}
                    placeholder="이번 주 잘 된 점, 계속 유지할 것들을 기록하세요"
                  />
                  <KPTSection
                    icon="🔧"
                    label="개선할 것 (Problem)"
                    color="amber"
                    value={editing.toImprove || ''}
                    onChange={v => setEditing(p => ({ ...p, toImprove: v }))}
                    placeholder="아쉬웠던 점, 개선이 필요한 것들을 기록하세요"
                  />
                  <KPTSection
                    icon="🚀"
                    label="다음 주 실행 (Try)"
                    color="blue"
                    value={editing.actionItems || ''}
                    onChange={v => setEditing(p => ({ ...p, actionItems: v }))}
                    placeholder="다음 주에 시도할 액션 아이템을 기록하세요"
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <Save size={16} />
                    {saving ? '저장 중...' : '회고 저장'}
                  </button>
                </div>
              </div>
            )}

            {/* Past retros */}
            {retros.map(retro => {
              const isExpanded = expandedId === retro.id
              const isEditing = editing.id === retro.id

              return (
                <div key={retro.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedId(null)
                      } else {
                        setExpandedId(retro.id)
                        setEditing({ ...retro })
                      }
                    }}
                  >
                    <span className="font-medium text-slate-700">
                      {normalizeDate(retro.weekStart)} ~ {normalizeDate(retro.weekEnd)}
                    </span>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-5 space-y-4">
                      <KPTSection
                        icon="✅" label="잘 된 것 (Keep)" color="green"
                        value={isEditing ? (editing.wentWell || '') : retro.wentWell}
                        onChange={v => setEditing(p => ({ ...p, wentWell: v }))}
                        placeholder=""
                      />
                      <KPTSection
                        icon="🔧" label="개선할 것 (Problem)" color="amber"
                        value={isEditing ? (editing.toImprove || '') : retro.toImprove}
                        onChange={v => setEditing(p => ({ ...p, toImprove: v }))}
                        placeholder=""
                      />
                      <KPTSection
                        icon="🚀" label="액션 아이템 (Try)" color="blue"
                        value={isEditing ? (editing.actionItems || '') : retro.actionItems}
                        onChange={v => setEditing(p => ({ ...p, actionItems: v }))}
                        placeholder=""
                      />
                      <button
                        onClick={handleSave}
                        disabled={saving || !isEditing}
                        className="w-full py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        <Save size={14} /> {saving ? '저장 중...' : '수정 저장'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {retros.length === 0 && expandedId !== 'new' && (
              <div className="text-center py-12">
                <RotateCcw size={40} className="mx-auto text-slate-200 mb-3" />
                <p className="text-slate-400">작성된 회고가 없습니다</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KPTSection({
  icon, label, color, value, onChange, placeholder,
}: {
  icon: string
  label: string
  color: 'green' | 'amber' | 'blue'
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const borderColor = color === 'green' ? 'border-l-green-400' : color === 'amber' ? 'border-l-amber-400' : 'border-l-blue-400'
  return (
    <div className={`border-l-4 pl-4 ${borderColor}`}>
      <label className="text-sm font-medium text-slate-700 mb-1.5 block">
        {icon} {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  )
}
