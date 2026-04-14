import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useCommonCodeService } from '../hooks/useCommonCodeService'

type CodeGroupKey = 'position_types' | 'employment_types' | 'project_types' | 'project_phases'

const GROUP_META: Record<CodeGroupKey, { title: string; description: string }> = {
  position_types: {
    title: '직급체계',
    description: '팀원 직급 목록을 관리합니다.',
  },
  employment_types: {
    title: '고용형태',
    description: '팀원 고용형태 목록을 관리합니다.',
  },
  project_types: {
    title: '프로젝트 유형',
    description: '프로젝트 상세 유형(직영, 당선 등)을 관리합니다.',
  },
  project_phases: {
    title: '프로젝트 단계',
    description: '프로젝트 현재 진행 단계를 관리합니다.',
  },
}

export default function CommonCodes() {
  const commonCodeService = useCommonCodeService()

  const [positionTypes, setPositionTypes] = useState<string[]>([])
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([])
  const [projectTypes, setProjectTypes] = useState<string[]>([])
  const [projectPhases, setProjectPhases] = useState<string[]>([])
  const [newPosition, setNewPosition] = useState('')
  const [newEmployment, setNewEmployment] = useState('')
  const [newProjectType, setNewProjectType] = useState('')
  const [newProjectPhase, setNewProjectPhase] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [positions, employments, projects, phases] = await Promise.all([
        commonCodeService.load('position_types'),
        commonCodeService.load('employment_types'),
        commonCodeService.load('project_types'),
        commonCodeService.load('project_phases'),
      ])
      setPositionTypes(Array.isArray(positions) ? positions : [])
      setEmploymentTypes(Array.isArray(employments) ? employments : [])
      setProjectTypes(Array.isArray(projects) ? projects : [])
      setProjectPhases(Array.isArray(phases) ? phases : [])
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(group: CodeGroupKey, value: string) {
    const trimmed = value.trim()
    if (!trimmed) return

    if (group === 'position_types') {
      await commonCodeService.add(group, trimmed)
      setNewPosition('')
    } else if (group === 'employment_types') {
      await commonCodeService.add(group, trimmed)
      setNewEmployment('')
    } else if (group === 'project_types') {
      await commonCodeService.add(group, trimmed)
      setNewProjectType('')
    } else {
      await commonCodeService.add(group, trimmed)
      setNewProjectPhase('')
    }

    await loadAll()
  }

  async function handleDelete(group: CodeGroupKey, value: string) {
    const ok = confirm(`'${value}' 항목을 삭제하시겠습니까?`)
    if (!ok) return

    if (group === 'position_types') {
      await commonCodeService.remove(group, value)
    } else if (group === 'employment_types') {
      await commonCodeService.remove(group, value)
    } else if (group === 'project_types') {
      await commonCodeService.remove(group, value)
    } else {
      await commonCodeService.remove(group, value)
    }

    await loadAll()
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">공통코드 관리</h2>
          <p className="text-xs text-slate-500">직급체계, 고용형태, 프로젝트 유형, 프로젝트 단계를 직접 관리합니다.</p>
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
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <CodeGroupCard
            title={GROUP_META.project_types.title}
            description={GROUP_META.project_types.description}
            values={projectTypes}
            inputValue={newProjectType}
            inputPlaceholder="예: 신규지점 / 해외"
            onInputChange={setNewProjectType}
            onAdd={() => void handleAdd('project_types', newProjectType)}
            onDelete={(value) => void handleDelete('project_types', value)}
          />

          <CodeGroupCard
            title={GROUP_META.project_phases.title}
            description={GROUP_META.project_phases.description}
            values={projectPhases}
            inputValue={newProjectPhase}
            inputPlaceholder="예: UAT / 롤백"
            onInputChange={setNewProjectPhase}
            onAdd={() => void handleAdd('project_phases', newProjectPhase)}
            onDelete={(value) => void handleDelete('project_phases', value)}
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
