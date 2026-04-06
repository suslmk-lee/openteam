import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

type CodeGroupKey = 'position_types' | 'employment_types'

const GROUP_META: Record<CodeGroupKey, { title: string; description: string }> = {
  position_types: {
    title: '직급체계',
    description: '팀원 직급 목록을 관리합니다.',
  },
  employment_types: {
    title: '고용형태',
    description: '팀원 고용형태 목록을 관리합니다.',
  },
}

export default function CommonCodes() {
  const [positionTypes, setPositionTypes] = useState<string[]>([])
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([])
  const [newPosition, setNewPosition] = useState('')
  const [newEmployment, setNewEmployment] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [positions, employments] = await Promise.all([
        (window as any).go?.main?.App?.GetPositionTypes?.(),
        (window as any).go?.main?.App?.GetEmploymentTypes?.(),
      ])
      setPositionTypes(Array.isArray(positions) ? positions : [])
      setEmploymentTypes(Array.isArray(employments) ? employments : [])
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(group: CodeGroupKey, value: string) {
    const trimmed = value.trim()
    if (!trimmed) return

    if (group === 'position_types') {
      await (window as any).go?.main?.App?.AddPositionType?.(trimmed)
      setNewPosition('')
    } else {
      await (window as any).go?.main?.App?.AddEmploymentType?.(trimmed)
      setNewEmployment('')
    }

    await loadAll()
  }

  async function handleDelete(group: CodeGroupKey, value: string) {
    const ok = confirm(`'${value}' 항목을 삭제하시겠습니까?`)
    if (!ok) return

    if (group === 'position_types') {
      await (window as any).go?.main?.App?.DeletePositionType?.(value)
    } else {
      await (window as any).go?.main?.App?.DeleteEmploymentType?.(value)
    }

    await loadAll()
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">공통코드 관리</h2>
          <p className="text-xs text-slate-500">직급체계와 고용형태를 직접 관리합니다.</p>
        </div>
        <button
          onClick={() => void loadAll()}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CodeGroupCard
            title={GROUP_META.position_types.title}
            description={GROUP_META.position_types.description}
            values={positionTypes}
            inputValue={newPosition}
            inputPlaceholder="예: 책임 / 수석 / 이사"
            onInputChange={setNewPosition}
            onAdd={() => void handleAdd('position_types', newPosition)}
            onDelete={(value) => void handleDelete('position_types', value)}
          />

          <CodeGroupCard
            title={GROUP_META.employment_types.title}
            description={GROUP_META.employment_types.description}
            values={employmentTypes}
            inputValue={newEmployment}
            inputPlaceholder="예: 파견 / 인턴 / 프리랜서"
            onInputChange={setNewEmployment}
            onAdd={() => void handleAdd('employment_types', newEmployment)}
            onDelete={(value) => void handleDelete('employment_types', value)}
          />
        </div>
      </div>
    </div>
  )
}

function CodeGroupCard({
  title,
  description,
  values,
  inputValue,
  inputPlaceholder,
  onInputChange,
  onAdd,
  onDelete,
}: {
  title: string
  description: string
  values: string[]
  inputValue: string
  inputPlaceholder: string
  onInputChange: (value: string) => void
  onAdd: () => void
  onDelete: (value: string) => void
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500 mt-1">{description}</p>

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={inputValue}
          placeholder={inputPlaceholder}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={onAdd}
          disabled={!inputValue.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={16} />
          추가
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {values.length === 0 && (
          <p className="text-sm text-slate-400 py-2">등록된 항목이 없습니다.</p>
        )}

        {values.map((value) => (
          <div
            key={value}
            className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg"
          >
            <span className="text-sm text-slate-700">{value}</span>
            <button
              onClick={() => onDelete(value)}
              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
              title="삭제"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
