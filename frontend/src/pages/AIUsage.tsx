import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useAppApi } from '../hooks/useAppApi'
import type { AIBillingPlan, AIModel, AIProvider, AIUsageDashboard, AIUsageSummaryRow } from '../services/appApi'

type TrendMetric = 'costKrw' | 'costUsd' | 'inputTokens' | 'outputTokens'

type DailyPoint = AIUsageDashboard['daily'][number]

const TREND_OPTIONS: Array<{ key: TrendMetric; label: string }> = [
  { key: 'costKrw', label: '비용(KRW)' },
  { key: 'costUsd', label: '비용(USD)' },
  { key: 'inputTokens', label: '입력 토큰' },
  { key: 'outputTokens', label: '출력 토큰' },
]

const PROVIDER_PRESETS: Array<{ code: string; label: string }> = [
  { code: 'minimax', label: 'MiniMax' },
  { code: 'anthropic', label: 'Anthropic (Claude)' },
  { code: 'openai', label: 'OpenAI (GPT/Codex)' },
  { code: 'google', label: 'Google (Gemini)' },
  { code: 'xai', label: 'xAI (Grok)' },
  { code: 'deepseek', label: 'DeepSeek' },
  { code: 'mistral', label: 'Mistral' },
  { code: 'cohere', label: 'Cohere' },
  { code: 'aws-bedrock', label: 'AWS Bedrock' },
  { code: 'azure-openai', label: 'Azure OpenAI' },
]

const DEFAULT_PROVIDER_CODE = PROVIDER_PRESETS[0].code

function providerPresetLabel(code: string) {
  if ((code || '').toLowerCase() === 'codex') return 'OpenAI (GPT/Codex)'
  return PROVIDER_PRESETS.find(preset => preset.code === code)?.label || ''
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function formatKrw(value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatCount(value: number) {
  return (value || 0).toLocaleString('ko-KR')
}

function formatCompact(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return `${Math.round(value)}`
}

function providerNameByID(providers: AIProvider[], providerID: number) {
  return providers.find(provider => provider.id === providerID)?.displayName || `provider #${providerID}`
}

function modelNameByID(models: AIModel[], modelID?: number | null) {
  if (!modelID || modelID <= 0) {
    return '전체 모델'
  }
  return models.find(model => model.id === modelID)?.displayName || `model #${modelID}`
}

function metricValue(point: DailyPoint, metric: TrendMetric) {
  if (metric === 'costKrw') return point.totalCostKrw
  if (metric === 'costUsd') return point.totalCostUsd
  if (metric === 'inputTokens') return point.inputTokens
  return point.outputTokens
}

function formatMetric(metric: TrendMetric, value: number) {
  if (metric === 'costKrw') return formatKrw(value)
  if (metric === 'costUsd') return formatUsd(value)
  return formatCount(value)
}

function formatAxisLabel(metric: TrendMetric, value: number) {
  if (metric === 'costKrw') return `₩${formatCompact(value)}`
  if (metric === 'costUsd') return `$${formatCompact(value)}`
  return formatCompact(value)
}

function formatDay(day: string) {
  if (!day || day.length < 10) return day
  return `${day.slice(5, 7)}-${day.slice(8, 10)}`
}

export default function AIUsage() {
  const {
    GetAIUsageDashboard,
    ListAIProviders,
    SaveAIProvider,
    DeleteAIProvider,
    ListAIModels,
    SaveAIModel,
    DeleteAIModel,
    ListAIBillingPlans,
    SaveAIBillingPlan,
    DeleteAIBillingPlan,
    RefreshUSDKRWRate,
  } = useAppApi()

  const [month, setMonth] = useState(currentMonth())
  const [dashboard, setDashboard] = useState<AIUsageDashboard | null>(null)
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [models, setModels] = useState<AIModel[]>([])
  const [plans, setPlans] = useState<AIBillingPlan[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [trendMetric, setTrendMetric] = useState<TrendMetric>('costKrw')

  const [newProviderCode, setNewProviderCode] = useState(DEFAULT_PROVIDER_CODE)
  const [newProviderName, setNewProviderName] = useState(providerPresetLabel(DEFAULT_PROVIDER_CODE))

  const [editingProviderID, setEditingProviderID] = useState<number | null>(null)
  const [editingProviderCode, setEditingProviderCode] = useState('')
  const [editingProviderName, setEditingProviderName] = useState('')

  const [newModelProviderID, setNewModelProviderID] = useState<number>(0)
  const [newModelCode, setNewModelCode] = useState('')
  const [newModelName, setNewModelName] = useState('')

  const [editingModelID, setEditingModelID] = useState<number | null>(null)
  const [editingModelProviderID, setEditingModelProviderID] = useState<number>(0)
  const [editingModelCode, setEditingModelCode] = useState('')
  const [editingModelName, setEditingModelName] = useState('')

  const [planProviderID, setPlanProviderID] = useState<number>(0)
  const [planModelID, setPlanModelID] = useState<number>(0)
  const [planFixed, setPlanFixed] = useState<number>(0)
  const [planIncludedInput, setPlanIncludedInput] = useState<number>(0)
  const [planIncludedOutput, setPlanIncludedOutput] = useState<number>(0)
  const [planOverageInput, setPlanOverageInput] = useState<number>(0)
  const [planOverageOutput, setPlanOverageOutput] = useState<number>(0)
  const [planFrom, setPlanFrom] = useState(`${month}-01`)
  const [planTo, setPlanTo] = useState('')

  const planModelOptions = useMemo(
    () => models.filter(model => !planProviderID || model.providerId === planProviderID),
    [models, planProviderID],
  )

  const orderedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const providerA = providerNameByID(providers, a.providerId)
      const providerB = providerNameByID(providers, b.providerId)
      if (providerA === providerB) {
        return a.displayName.localeCompare(b.displayName)
      }
      return providerA.localeCompare(providerB)
    })
  }, [models, providers])

  const editingProviderOptions = useMemo(() => {
    if (!editingProviderCode.trim()) {
      return PROVIDER_PRESETS
    }
    const exists = PROVIDER_PRESETS.some(preset => preset.code === editingProviderCode)
    if (exists) {
      return PROVIDER_PRESETS
    }
    return [{ code: editingProviderCode, label: `현재값 (${editingProviderCode})` }, ...PROVIDER_PRESETS]
  }, [editingProviderCode])

  async function loadDashboard() {
    const data = await GetAIUsageDashboard(month)
    setDashboard(data)
  }

  async function loadRegistry() {
    const [providerList, modelList, planList] = await Promise.all([
      ListAIProviders(),
      ListAIModels(),
      ListAIBillingPlans(),
    ])

    const safeProviders = providerList || []
    setProviders(safeProviders)
    setModels(modelList || [])
    setPlans(planList || [])

    if (!newModelProviderID && safeProviders.length > 0) {
      setNewModelProviderID(safeProviders[0].id)
    }
    if (!planProviderID && safeProviders.length > 0) {
      setPlanProviderID(safeProviders[0].id)
    }
  }

  async function reloadAll() {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadDashboard(), loadRegistry()])
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadAll()
    setPlanFrom(`${month}-01`)
  }, [month])

  function showMessage(text: string) {
    setMessage(text)
    setTimeout(() => setMessage(''), 2500)
  }

  function clearProviderEdit() {
    setEditingProviderID(null)
    setEditingProviderCode('')
    setEditingProviderName('')
  }

  function clearModelEdit() {
    setEditingModelID(null)
    setEditingModelProviderID(0)
    setEditingModelCode('')
    setEditingModelName('')
  }

  async function handleAddProvider() {
    if (!newProviderCode.trim()) return
    try {
      await SaveAIProvider(0, newProviderCode.trim(), newProviderName.trim(), true)
      setNewProviderCode(DEFAULT_PROVIDER_CODE)
      setNewProviderName(providerPresetLabel(DEFAULT_PROVIDER_CODE))
      await loadRegistry()
      await loadDashboard()
      showMessage('Provider를 추가했습니다.')
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function handleSaveProviderEdit() {
    if (!editingProviderID || !editingProviderCode.trim()) return
    try {
      await SaveAIProvider(editingProviderID, editingProviderCode.trim(), editingProviderName.trim(), true)
      clearProviderEdit()
      await loadRegistry()
      await loadDashboard()
      showMessage('Provider 정보를 수정했습니다.')
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function handleAddModel() {
    if (!newModelProviderID || !newModelCode.trim()) return
    try {
      await SaveAIModel(0, newModelProviderID, newModelCode.trim(), newModelName.trim(), true)
      setNewModelCode('')
      setNewModelName('')
      await loadRegistry()
      await loadDashboard()
      showMessage('모델을 추가했습니다.')
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function handleSaveModelEdit() {
    if (!editingModelID || !editingModelProviderID || !editingModelCode.trim()) return
    try {
      await SaveAIModel(
        editingModelID,
        editingModelProviderID,
        editingModelCode.trim(),
        editingModelName.trim(),
        true,
      )
      clearModelEdit()
      await loadRegistry()
      await loadDashboard()
      showMessage('모델 정보를 수정했습니다.')
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function handleAddPlan() {
    if (!planProviderID || !planFrom.trim()) return
    try {
      await SaveAIBillingPlan(
        0,
        planProviderID,
        planModelID || 0,
        Number(planFixed) || 0,
        Number(planIncludedInput) || 0,
        Number(planIncludedOutput) || 0,
        Number(planOverageInput) || 0,
        Number(planOverageOutput) || 0,
        planFrom,
        planTo,
      )
      await loadRegistry()
      await loadDashboard()
      showMessage('요금제를 저장했습니다.')
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-blue-600">Settings / AI Usage</p>
              <h2 className="text-lg font-semibold text-slate-800">AI 사용량 대시보드</h2>
              <p className="text-xs text-slate-500">모델별 토큰, 비용(USD/KRW), 정액제·초과요금을 한 번에 확인합니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={event => setMonth(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  void reloadAll()
                }}
                className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
              >
                <RefreshCw size={14} />
                새로고침
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await RefreshUSDKRWRate('')
                    await loadDashboard()
                    showMessage('환율을 갱신했습니다.')
                  } catch (e: any) {
                    setError(String(e?.message || e))
                  }
                }}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                환율 갱신
              </button>
            </div>
          </div>

          {dashboard && (
            <p className="mt-2 text-[11px] text-slate-500">
              FX 기준일: {dashboard.fxRateDate} / 출처: {dashboard.fxSource} / USDKRW: {dashboard.fxRateUsed.toFixed(2)}
              {dashboard.fxFallbackUsed ? ' (fallback)' : ''}
            </p>
          )}

          {message && <p className="mt-2 text-xs text-emerald-600">{message}</p>}

          {error && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {dashboard && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <Card title="총 요청" value={formatCount(dashboard.overview.requestCount)} />
              <Card title="입력 토큰" value={formatCount(dashboard.overview.inputTokens)} />
              <Card title="출력 토큰" value={formatCount(dashboard.overview.outputTokens)} />
              <Card title="총 비용 (USD)" value={formatUsd(dashboard.overview.totalCostUsd)} />
              <Card title="총 비용 (KRW)" value={formatKrw(dashboard.overview.totalCostKrw)} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-700">일별 추이</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {TREND_OPTIONS.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setTrendMetric(option.key)}
                      className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                        option.key === trendMetric
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <DailyUsageChart points={dashboard.daily} metric={trendMetric} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <UsageTable title="Provider별 비용" rows={dashboard.byProvider} showModel={false} />
              <UsageTable title="Model별 비용" rows={dashboard.byModel} showModel />
            </div>

            {dashboard.unregistered.length > 0 && (
              <UsageTable title="미등록 Provider/Model" rows={dashboard.unregistered} showModel />
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">일별 상세 데이터</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-2 py-1 text-left">날짜</th>
                      <th className="px-2 py-1 text-right">입력</th>
                      <th className="px-2 py-1 text-right">출력</th>
                      <th className="px-2 py-1 text-right">USD</th>
                      <th className="px-2 py-1 text-right">KRW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.daily.map(point => (
                      <tr key={point.day} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-2 py-1.5 text-slate-700">{point.day}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(point.inputTokens)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(point.outputTokens)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-700">{formatUsd(point.totalCostUsd)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-700">{formatKrw(point.totalCostKrw)}</td>
                      </tr>
                    ))}
                    {dashboard.daily.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Provider 관리</h3>
            <div className="mb-3 flex gap-2">
              <select
                value={newProviderCode}
                onChange={event => {
                  const selectedCode = event.target.value
                  setNewProviderCode(selectedCode)
                  setNewProviderName(providerPresetLabel(selectedCode))
                }}
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {PROVIDER_PRESETS.map(preset => (
                  <option key={preset.code} value={preset.code}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <input
                value={newProviderName}
                onChange={event => setNewProviderName(event.target.value)}
                placeholder="표시 이름"
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  void handleAddProvider()
                }}
                className="rounded-lg bg-violet-600 px-2.5 text-white hover:bg-violet-700"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="space-y-2">
              {providers.map(provider => (
                <div key={provider.id} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  {editingProviderID === provider.id ? (
                    <>
                      <div className="flex gap-2">
                        <select
                          value={editingProviderCode}
                          onChange={event => {
                            const selectedCode = event.target.value
                            setEditingProviderCode(selectedCode)
                            if (!editingProviderName.trim()) {
                              setEditingProviderName(providerPresetLabel(selectedCode))
                            }
                          }}
                          className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        >
                          {editingProviderOptions.map(option => (
                            <option key={option.code} value={option.code}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={editingProviderName}
                          onChange={event => setEditingProviderName(event.target.value)}
                          className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          placeholder="표시 이름"
                        />
                      </div>
                      <div className="mt-2 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void handleSaveProviderEdit()
                          }}
                          className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={clearProviderEdit}
                          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-700">{provider.displayName}</p>
                        <p className="text-xs text-slate-400">{provider.code}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProviderID(provider.id)
                            setEditingProviderCode(provider.code)
                            setEditingProviderName(provider.displayName)
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await DeleteAIProvider(provider.id)
                              await loadRegistry()
                              await loadDashboard()
                            } catch (e: any) {
                              setError(String(e?.message || e))
                            }
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {providers.length === 0 && <p className="text-xs text-slate-400">등록된 provider가 없습니다.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Model 관리</h3>
            <div className="mb-3 space-y-2">
              <select
                value={newModelProviderID}
                onChange={event => setNewModelProviderID(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value={0}>Provider 선택</option>
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.displayName}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <input
                  value={newModelCode}
                  onChange={event => setNewModelCode(event.target.value)}
                  placeholder="model code"
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <input
                  value={newModelName}
                  onChange={event => setNewModelName(event.target.value)}
                  placeholder="표시 이름"
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleAddModel()
                  }}
                  className="rounded-lg bg-violet-600 px-2.5 text-white hover:bg-violet-700"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {orderedModels.map(model => (
                <div key={model.id} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  {editingModelID === model.id ? (
                    <>
                      <div className="space-y-2">
                        <select
                          value={editingModelProviderID}
                          onChange={event => setEditingModelProviderID(Number(event.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        >
                          {providers.map(provider => (
                            <option key={provider.id} value={provider.id}>
                              {provider.displayName}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <input
                            value={editingModelCode}
                            onChange={event => setEditingModelCode(event.target.value)}
                            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            placeholder="model code"
                          />
                          <input
                            value={editingModelName}
                            onChange={event => setEditingModelName(event.target.value)}
                            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            placeholder="표시 이름"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void handleSaveModelEdit()
                          }}
                          className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={clearModelEdit}
                          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-700">{model.displayName}</p>
                        <p className="text-xs text-slate-400">
                          {providerNameByID(providers, model.providerId)} / {model.modelCode}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingModelID(model.id)
                            setEditingModelProviderID(model.providerId)
                            setEditingModelCode(model.modelCode)
                            setEditingModelName(model.displayName)
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await DeleteAIModel(model.id)
                              await loadRegistry()
                              await loadDashboard()
                            } catch (e: any) {
                              setError(String(e?.message || e))
                            }
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {orderedModels.length === 0 && <p className="text-xs text-slate-400">등록된 모델이 없습니다.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">요금제 관리</h3>

            <div className="space-y-2 text-sm">
              <select
                value={planProviderID}
                onChange={event => {
                  setPlanProviderID(Number(event.target.value))
                  setPlanModelID(0)
                }}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              >
                <option value={0}>Provider 선택</option>
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.displayName}
                  </option>
                ))}
              </select>

              <select
                value={planModelID}
                onChange={event => setPlanModelID(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              >
                <option value={0}>Provider 전체(모델 공통)</option>
                {planModelOptions.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={planFixed}
                  onChange={e => setPlanFixed(Number(e.target.value))}
                  placeholder="월 고정 USD"
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="number"
                  value={planIncludedInput}
                  onChange={e => setPlanIncludedInput(Number(e.target.value))}
                  placeholder="입력 포함 토큰"
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="number"
                  value={planIncludedOutput}
                  onChange={e => setPlanIncludedOutput(Number(e.target.value))}
                  placeholder="출력 포함 토큰"
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={planOverageInput}
                  onChange={e => setPlanOverageInput(Number(e.target.value))}
                  placeholder="입력 초과/1k USD"
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={planOverageOutput}
                  onChange={e => setPlanOverageOutput(Number(e.target.value))}
                  placeholder="출력 초과/1k USD"
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="date"
                  value={planFrom}
                  onChange={e => setPlanFrom(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </div>

              <input
                type="date"
                value={planTo}
                onChange={e => setPlanTo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />

              <button
                type="button"
                onClick={() => {
                  void handleAddPlan()
                }}
                className="w-full rounded-lg bg-violet-600 py-2 text-white hover:bg-violet-700"
              >
                요금제 저장
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {plans.map(plan => (
                <div key={plan.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                  <div>
                    <p className="font-medium text-slate-700">
                      {providerNameByID(providers, plan.providerId)} / {modelNameByID(models, plan.modelId)}
                    </p>
                    <p className="text-slate-500">
                      {formatUsd(plan.monthlyFixedUsd)} / {plan.effectiveFrom}~{plan.effectiveTo || 'ongoing'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await DeleteAIBillingPlan(plan.id)
                        await loadRegistry()
                        await loadDashboard()
                      } catch (e: any) {
                        setError(String(e?.message || e))
                      }
                    }}
                    className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              {plans.length === 0 && <p className="text-xs text-slate-400">등록된 요금제가 없습니다.</p>}
            </div>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500">불러오는 중...</p>}
      </div>
    </div>
  )
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-1 text-lg font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function DailyUsageChart({ points, metric }: { points: DailyPoint[]; metric: TrendMetric }) {
  if (points.length === 0) {
    return <p className="text-xs text-slate-400">표시할 일별 데이터가 없습니다.</p>
  }

  const width = 860
  const height = 240
  const padding = { top: 12, right: 16, bottom: 30, left: 56 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom

  const values = points.map(point => metricValue(point, metric))
  const maxValue = Math.max(...values, 1)
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth

  const chartPoints = points.map((point, idx) => {
    const value = metricValue(point, metric)
    const x = padding.left + idx * stepX
    const y = padding.top + innerHeight - (value / maxValue) * innerHeight
    return { day: point.day, value, x, y }
  })

  const linePath = chartPoints
    .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const areaPath = `${linePath} L ${(padding.left + innerWidth).toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} L ${padding.left.toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} Z`

  const tickRatios = [0, 0.25, 0.5, 0.75, 1]
  const labelIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]))

  const peak = chartPoints.reduce((top, point) => (point.value > top.value ? point : top), chartPoints[0])

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {tickRatios.map(ratio => {
          const y = padding.top + innerHeight - ratio * innerHeight
          const tickValue = maxValue * ratio
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="rgb(226 232 240)"
                strokeWidth="1"
              />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" className="fill-slate-400" fontSize="10">
                {formatAxisLabel(metric, tickValue)}
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill="rgb(59 130 246 / 0.12)" />
        <path d={linePath} fill="none" stroke="rgb(37 99 235)" strokeWidth="2" strokeLinejoin="round" />

        {chartPoints.map(point => (
          <circle key={point.day} cx={point.x} cy={point.y} r={3} fill="rgb(37 99 235)" />
        ))}

        {labelIndexes.map(index => {
          const point = chartPoints[index]
          if (!point) return null
          return (
            <text key={point.day} x={point.x} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize="10">
              {formatDay(point.day)}
            </text>
          )
        })}
      </svg>

      <p className="mt-1 text-xs text-slate-500">
        최고치: {formatDay(peak.day)} / {formatMetric(metric, peak.value)}
      </p>
    </div>
  )
}

function UsageTable({
  title,
  rows,
  showModel,
}: {
  title: string
  rows: AIUsageSummaryRow[]
  showModel: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-2 py-1 text-left">Provider</th>
              {showModel && <th className="px-2 py-1 text-left">Model</th>}
              <th className="px-2 py-1 text-right">요청 수</th>
              <th className="px-2 py-1 text-right">입력</th>
              <th className="px-2 py-1 text-right">출력</th>
              <th className="px-2 py-1 text-right">USD</th>
              <th className="px-2 py-1 text-right">KRW</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.providerCode}-${row.modelCode}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-1.5">
                  <span className={row.isUnregistered ? 'text-amber-600' : 'text-slate-700'}>{row.providerName}</span>
                </td>
                {showModel && (
                  <td className="px-2 py-1.5">
                    <span className={row.isUnregistered ? 'text-amber-600' : 'text-slate-700'}>{row.modelName}</span>
                  </td>
                )}
                <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.requestCount)}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.inputTokens)}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.outputTokens)}</td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatUsd(row.totalCostUsd)}</td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatKrw(row.totalCostKrw)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showModel ? 7 : 6} className="py-6 text-center text-slate-400">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
