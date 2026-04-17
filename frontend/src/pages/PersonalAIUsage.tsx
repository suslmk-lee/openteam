import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'
import { useAppApi } from '../hooks/useAppApi'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import type {
  PersonalAICollectStatus,
  PersonalAICollectorResponse,
  PersonalAIUsageDashboard,
} from '../services/appApi'

const PROVIDER_OPTIONS = [
  { code: 'minimax', label: 'MiniMax' },
  { code: 'anthropic', label: 'Anthropic (Claude)' },
  { code: 'openai', label: 'OpenAI' },
  { code: 'codex', label: 'Codex' },
  { code: 'google', label: 'Google (Gemini)' },
  { code: 'xai', label: 'xAI (Grok)' },
  { code: 'deepseek', label: 'DeepSeek' },
  { code: 'mistral', label: 'Mistral' },
  { code: 'cohere', label: 'Cohere' },
  { code: 'aws-bedrock', label: 'AWS Bedrock' },
  { code: 'azure-openai', label: 'Azure OpenAI' },
]

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayString() {
  const now = new Date()
  return now.toISOString().slice(0, 10)
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

export default function PersonalAIUsage() {
  const {
    GetPersonalAIUsageDashboard,
    StartPersonalAIUsageCollection,
    GetPersonalAIUsageCollectionStatus,
    AddPersonalAIManualUsage,
  } = useAppApi()
  const { profile } = useTeamProfile()

  const [month, setMonth] = useState(currentMonth())
  const [dashboard, setDashboard] = useState<PersonalAIUsageDashboard | null>(null)
  const [collectResult, setCollectResult] = useState<PersonalAICollectorResponse | null>(null)
  const [collectStatus, setCollectStatus] = useState<PersonalAICollectStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const collecting = Boolean(collectStatus?.running)

  const previousCollectRunningRef = useRef(false)
  const handledFinishedKeyRef = useRef('')

  const [manualDay, setManualDay] = useState(todayString())
  const [manualProvider, setManualProvider] = useState(PROVIDER_OPTIONS[0].code)
  const [manualModel, setManualModel] = useState('')
  const [manualInput, setManualInput] = useState(0)
  const [manualOutput, setManualOutput] = useState(0)
  const [manualCost, setManualCost] = useState(0)

  const loadDashboard = useCallback(async () => {
    const data = await GetPersonalAIUsageDashboard(month)
    setDashboard(data)
  }, [GetPersonalAIUsageDashboard, month])

  const showMessage = useCallback((text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 2500)
  }, [])

  const refreshCollectStatus = useCallback(async () => {
    const status = await GetPersonalAIUsageCollectionStatus()
    setCollectStatus(status)

    if (status.lastResult) {
      setCollectResult(status.lastResult)
    }

    const wasRunning = previousCollectRunningRef.current
    const isRunning = Boolean(status.running)
    const finishedKey = status.finishedAt ? `${status.month}:${status.finishedAt}` : ''

    if (wasRunning && !isRunning && finishedKey && handledFinishedKeyRef.current !== finishedKey) {
      handledFinishedKeyRef.current = finishedKey
      if (status.lastError) {
        setError(status.lastError)
      } else {
        showMessage('로컬 AI 사용량 수집이 완료되었습니다.')
        await loadDashboard()
      }
    }

    previousCollectRunningRef.current = isRunning
  }, [GetPersonalAIUsageCollectionStatus, loadDashboard, showMessage])

  const reloadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await loadDashboard()
      await refreshCollectStatus()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [loadDashboard, refreshCollectStatus])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshCollectStatus()
    }, 1500)

    return () => {
      window.clearInterval(timer)
    }
  }, [refreshCollectStatus])

  if (profile?.teamType !== 'personal') {
    return (
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          개인 팀에서만 사용할 수 있는 메뉴입니다.
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-blue-600">Settings / Personal AI Usage</p>
              <h2 className="text-lg font-semibold text-slate-800">개인 AI 통합 사용량</h2>
              <p className="text-xs text-slate-500">앱 내부 + PC/계정 사용량(로컬 수집/수동 입력)을 통합해서 확인합니다.</p>
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
                disabled={collecting}
                onClick={async () => {
                  try {
                    setError('')
                    const status = await StartPersonalAIUsageCollection(month)
                    setCollectStatus(status)
                    previousCollectRunningRef.current = Boolean(status.running)
                    showMessage('로컬 AI 사용량 수집을 시작했습니다.')
                  } catch (e: any) {
                    setError(String(e?.message || e))
                  }
                }}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {collecting ? '수집 중...' : '로컬 수집 실행'}
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
              <Card title="내부 입력 토큰" value={formatCount(dashboard.overview.internalInputTokens)} />
              <Card title="외부 입력 토큰" value={formatCount(dashboard.overview.externalInputTokens)} />
              <Card title="총 비용 (USD)" value={formatUsd(dashboard.overview.totalCostUsd)} />
              <Card title="총 비용 (KRW)" value={formatKrw(dashboard.overview.totalCostKrw)} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">소스별 통계</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-2 py-1 text-left">소스</th>
                      <th className="px-2 py-1 text-right">요청 수</th>
                      <th className="px-2 py-1 text-right">입력</th>
                      <th className="px-2 py-1 text-right">출력</th>
                      <th className="px-2 py-1 text-right">USD</th>
                      <th className="px-2 py-1 text-right">KRW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.bySource.map(row => (
                      <tr key={row.sourceCode} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-2 py-1.5 text-slate-700">{row.sourceName}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.requestCount)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.inputTokens)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.outputTokens)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-700">{formatUsd(row.totalCostUsd)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-700">{formatKrw(row.totalCostKrw)}</td>
                      </tr>
                    ))}
                    {dashboard.bySource.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <UsageTable title="Provider별 통계" rows={dashboard.byProvider} showModel={false} />
              <UsageTable title="Model별 통계" rows={dashboard.byModel} showModel />
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">수동 입력</h3>
            <div className="space-y-2 text-sm">
              <input
                type="date"
                value={manualDay}
                onChange={event => setManualDay(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
              <select
                value={manualProvider}
                onChange={event => setManualProvider(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              >
                {PROVIDER_OPTIONS.map(provider => (
                  <option key={provider.code} value={provider.code}>{provider.label}</option>
                ))}
              </select>
              <input
                value={manualModel}
                onChange={event => setManualModel(event.target.value)}
                placeholder="model code (예: claude-3-7-sonnet)"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  value={manualInput}
                  onChange={e => setManualInput(Number(e.target.value))}
                  placeholder="입력 토큰"
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="number"
                  value={manualOutput}
                  onChange={e => setManualOutput(Number(e.target.value))}
                  placeholder="출력 토큰"
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={manualCost}
                  onChange={e => setManualCost(Number(e.target.value))}
                  placeholder="비용 USD"
                  className="rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await AddPersonalAIManualUsage(
                      manualDay,
                      manualProvider,
                      manualModel.trim(),
                      Number(manualInput) || 0,
                      Number(manualOutput) || 0,
                      Number(manualCost) || 0,
                    )
                    await loadDashboard()
                    setManualInput(0)
                    setManualOutput(0)
                    setManualCost(0)
                    showMessage('수동 사용량을 추가했습니다.')
                  } catch (e: any) {
                    setError(String(e?.message || e))
                  }
                }}
                className="flex items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-white hover:bg-violet-700"
              >
                <Plus size={14} />
                수동 항목 추가
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">최근 수집 결과</h3>
            {!collectResult && <p className="text-xs text-slate-400">아직 수집을 실행하지 않았습니다.</p>}
            {collectResult && (
              <div className="space-y-2">
                {collectResult.results.map(item => (
                  <div key={item.sourceCode} className="rounded-lg border border-slate-200 p-2 text-xs">
                    <p className="font-medium text-slate-700">{item.sourceName}</p>
                    <p className="text-slate-500">
                      파일 {formatCount(item.scannedFiles)}개 / 파싱 {formatCount(item.parsedEntries)}건 / 반영 {formatCount(item.importedRows)}건
                    </p>
                    {item.warnings?.length > 0 && (
                      <div className="mt-1 space-y-0.5 text-amber-600">
                        {item.warnings.map((warning, idx) => (
                          <p key={`${item.sourceCode}-warn-${idx}`}>- {warning}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500">불러오는 중...</p>}
      </div>

      {collecting && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/20 backdrop-blur-[1px]">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-center gap-2 text-slate-700">
              <RefreshCw size={18} className="animate-spin" />
              <span className="text-sm font-semibold">개인 AI 사용량 수집 중...</span>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              수집이 완료될 때까지 이 화면을 사용할 수 없습니다.
              <br />
              다른 메뉴는 사용 가능합니다.
            </p>
          </div>
        </div>
      )}
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

function UsageTable({
  title,
  rows,
  showModel,
}: {
  title: string
  rows: PersonalAIUsageDashboard['byModel']
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
                <td className="px-2 py-1.5 text-slate-700">{row.providerName}</td>
                {showModel && <td className="px-2 py-1.5 text-slate-700">{row.modelName}</td>}
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
