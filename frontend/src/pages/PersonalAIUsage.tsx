import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'
import { useAppApi } from '../hooks/useAppApi'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import type {
  AIUsageHistoryEvent,
  AIUsageDailyPoint,
  AIUsageSeriesPoint,
  AIUsageSeriesRow,
  PersonalAICollectStatus,
  PersonalAICollectorResponse,
  PersonalAIUsageDashboard,
} from '../services/appApi'
import { aggregateSeriesValues, buildMotionProfile, type MotionProfile } from './personalAiMotionProfile'

const PROVIDER_OPTIONS = [
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

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'daily', label: '일간 사용량' },
  { id: 'model', label: 'Model별 일간' },
  { id: 'provider', label: 'Provider별 일간' },
  { id: 'history', label: 'History' },
  { id: 'collect', label: '수집 / 입력' },
] as const

type DashboardTab = (typeof TABS)[number]['id']
type TrendMetric = 'tokens' | 'cost'

const SERIES_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#eab308', '#14b8a6']
const AUTO_INTERVAL_OPTIONS = [
  { value: 15, label: '15초' },
  { value: 30, label: '30초' },
  { value: 60, label: '1분' },
  { value: 120, label: '2분' },
  { value: 300, label: '5분' },
  { value: 600, label: '10분' },
]

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0)
}

function formatKrw(value: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(value || 0)
}

function formatCount(value: number) {
  return (value || 0).toLocaleString('ko-KR')
}

function formatDay(value: string) {
  if (!value) return '-'
  return value.includes('T') ? value.slice(0, 10) : value
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed)
}

function formatHistoryMetadata(metadataJson?: string) {
  if (!metadataJson) return '-'
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>
    const collector = typeof parsed.collector === 'string' ? parsed.collector : ''
    const trigger = typeof parsed.trigger === 'string' ? parsed.trigger : ''
    const endpoint = typeof parsed.usedEndpoint === 'string' ? parsed.usedEndpoint : ''
    const summary = [collector, trigger ? `trigger:${trigger}` : '', endpoint ? `endpoint:${endpoint}` : '']
      .filter(Boolean)
      .join(' / ')
    return summary || metadataJson
  } catch {
    return metadataJson
  }
}

function metricLabel(metric: TrendMetric) {
  return metric === 'tokens' ? '토큰' : '비용(USD)'
}

function dailyMetricValue(point: AIUsageDailyPoint, metric: TrendMetric) {
  return metric === 'cost' ? point.totalCostUsd : point.inputTokens + point.outputTokens
}

function seriesMetricValue(point: AIUsageSeriesPoint, metric: TrendMetric) {
  return metric === 'cost' ? point.totalCostUsd : point.inputTokens + point.outputTokens
}

function formatPercent(value: number) {
  const clamped = Math.max(0, Math.min(1, value))
  return `${Math.round(clamped * 100)}%`
}

export default function PersonalAIUsage() {
  const {
    GetPersonalAIUsageDashboard,
    GetPersonalAIUsageHistory,
    StartPersonalAIUsageCollection,
    GetPersonalAIUsageCollectionStatus,
    SetPersonalAIAutoCollect,
    AddPersonalAIManualUsage,
  } = useAppApi()
  const { profile } = useTeamProfile()

  const [month, setMonth] = useState(currentMonth())
  const [dashboard, setDashboard] = useState<PersonalAIUsageDashboard | null>(null)
  const [historyRows, setHistoryRows] = useState<AIUsageHistoryEvent[]>([])
  const [collectResult, setCollectResult] = useState<PersonalAICollectorResponse | null>(null)
  const [collectStatus, setCollectStatus] = useState<PersonalAICollectStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('tokens')
  const [webglEnabled, setWebglEnabled] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  const [manualDay, setManualDay] = useState(todayString())
  const [manualProvider, setManualProvider] = useState(PROVIDER_OPTIONS[0].code)
  const [manualModel, setManualModel] = useState('')
  const [manualInput, setManualInput] = useState(0)
  const [manualOutput, setManualOutput] = useState(0)
  const [manualCost, setManualCost] = useState(0)
  const [autoIntervalSeconds, setAutoIntervalSeconds] = useState(120)

  const collecting = Boolean(collectStatus?.running)
  const collectTrigger = String(collectStatus?.trigger || '').toLowerCase()
  const autoEnabled = Boolean(collectStatus?.autoEnabled)
  const previousCollectRunningRef = useRef(false)
  const handledFinishedKeyRef = useRef('')

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      const next = media.matches
      setReducedMotion(next)
      if (next) setWebglEnabled(false)
    }
    apply()
    media.addEventListener?.('change', apply)
    return () => media.removeEventListener?.('change', apply)
  }, [])

  const loadDashboard = useCallback(async () => {
    const data = await GetPersonalAIUsageDashboard(month)
    setDashboard(data)
  }, [GetPersonalAIUsageDashboard, month])

  const loadHistory = useCallback(async () => {
    const rows = await GetPersonalAIUsageHistory(month, 500)
    setHistoryRows(rows || [])
  }, [GetPersonalAIUsageHistory, month])

  const showMessage = useCallback((text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 2500)
  }, [])

  const refreshCollectStatus = useCallback(async () => {
    const status = await GetPersonalAIUsageCollectionStatus()
    setCollectStatus(status)
    if (status.lastResult) setCollectResult(status.lastResult)

    const wasRunning = previousCollectRunningRef.current
    const isRunning = Boolean(status.running)
    const finishedKey = status.finishedAt ? `${status.month}:${status.finishedAt}` : ''
    if (wasRunning && !isRunning && finishedKey && handledFinishedKeyRef.current !== finishedKey) {
      handledFinishedKeyRef.current = finishedKey
      const finishedTrigger = String(status.trigger || '').toLowerCase()
      if (status.lastError) {
        setError(status.lastError)
      } else {
        if (finishedTrigger === 'auto') {
          await loadDashboard()
          await loadHistory()
        } else {
          showMessage('로컬 AI 사용량 수집이 완료되었습니다.')
          await loadDashboard()
          await loadHistory()
        }
      }
    }
    previousCollectRunningRef.current = isRunning
  }, [GetPersonalAIUsageCollectionStatus, loadDashboard, loadHistory, showMessage])

  const reloadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadDashboard(), loadHistory()])
      await refreshCollectStatus()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [loadDashboard, loadHistory, refreshCollectStatus])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshCollectStatus()
    }, 1500)
    return () => window.clearInterval(timer)
  }, [refreshCollectStatus])

  useEffect(() => {
    if (!collectStatus?.autoIntervalSeconds) return
    setAutoIntervalSeconds(collectStatus.autoIntervalSeconds)
  }, [collectStatus?.autoIntervalSeconds])

  const updateAutoCollect = useCallback(async (enabled: boolean, intervalSeconds: number) => {
    setAutoSaving(true)
    setError('')
    try {
      const normalizedInterval = Number(intervalSeconds) || 120
      await SetPersonalAIAutoCollect(enabled, normalizedInterval)
      await refreshCollectStatus()
      showMessage(enabled ? '자동수집을 활성화했습니다.' : '자동수집을 비활성화했습니다.')
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setAutoSaving(false)
    }
  }, [SetPersonalAIAutoCollect, refreshCollectStatus, showMessage])

  const dailyChartPoints = useMemo(() => {
    if (!dashboard) return []
    return dashboard.daily.map(point => ({ label: formatDay(point.day), value: dailyMetricValue(point, trendMetric) }))
  }, [dashboard, trendMetric])

  const modelSeries = useMemo(() => {
    if (!dashboard) return []
    return dashboard.dailyByModel.slice(0, 6).map((row, idx) => ({
      name: `${row.providerName} / ${row.modelName}`,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
      points: row.daily.map(point => ({ day: formatDay(point.day), value: seriesMetricValue(point, trendMetric) })),
    }))
  }, [dashboard, trendMetric])

  const providerSeries = useMemo(() => {
    if (!dashboard) return []
    return dashboard.dailyByProvider.slice(0, 6).map((row, idx) => ({
      name: row.providerName,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
      points: row.daily.map(point => ({ day: formatDay(point.day), value: seriesMetricValue(point, trendMetric) })),
    }))
  }, [dashboard, trendMetric])

  const motionProfile = useMemo(() => {
    let values: number[] = []
    if (activeTab === 'daily') {
      values = dailyChartPoints.map(point => point.value)
    } else if (activeTab === 'model') {
      values = aggregateSeriesValues(modelSeries)
    } else if (activeTab === 'provider') {
      values = aggregateSeriesValues(providerSeries)
    }
    return buildMotionProfile(values)
  }, [activeTab, dailyChartPoints, modelSeries, providerSeries])

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
              <p className="text-xs text-slate-500">탭 기반 대시보드로 총량·일간 추세·모델별 추세를 함께 확인합니다.</p>
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
                disabled={autoSaving}
                onClick={() => { void updateAutoCollect(!autoEnabled, autoIntervalSeconds) }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  autoEnabled ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                } disabled:opacity-60`}
              >
                {autoEnabled ? '자동수집 ON' : '자동수집 OFF'}
              </button>
              <select
                value={autoIntervalSeconds}
                disabled={autoSaving}
                onChange={event => {
                  const nextInterval = Number(event.target.value) || 120
                  setAutoIntervalSeconds(nextInterval)
                  if (autoEnabled) {
                    void updateAutoCollect(true, nextInterval)
                  }
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                {AUTO_INTERVAL_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { void reloadAll() }}
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
                    showMessage('개인 AI 통합 사용량 수집을 시작했습니다.')
                  } catch (e: any) {
                    setError(String(e?.message || e))
                  }
                }}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {collecting ? '수집 중...' : '통합 수집 실행'}
              </button>
            </div>
          </div>

          {dashboard && (
            <p className="mt-2 text-[11px] text-slate-500">
              FX 기준일: {dashboard.fxRateDate} / 출처: {dashboard.fxSource} / USDKRW: {dashboard.fxRateUsed.toFixed(2)}
              {dashboard.fxFallbackUsed ? ' (fallback)' : ''}
            </p>
          )}

          <p className="mt-1 text-[11px] text-slate-500">
            자동수집: {autoEnabled ? '활성화' : '비활성화'} / 간격: {autoIntervalSeconds}초 / 다음 실행: {formatDateTime(collectStatus?.autoNextRunAt)} / 최근 실행: {formatDateTime(collectStatus?.autoLastTriggeredAt)}
            {collectStatus?.autoLastTriggeredMonth ? ` (${collectStatus.autoLastTriggeredMonth})` : ''}
            {collecting && collectTrigger === 'auto' ? ' / 백그라운드 자동 수집중' : ''}
          </p>

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

            <div className="rounded-2xl border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap gap-2">
                {TABS.map(tab => {
                  const active = tab.id === activeTab
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-xl px-3 py-2 text-sm transition ${
                        active ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {(activeTab === 'daily' || activeTab === 'model' || activeTab === 'provider') && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <MetricToggle metric={trendMetric} onChange={setTrendMetric} />
                  <span className="text-xs text-slate-500">현재 지표: {metricLabel(trendMetric)}</span>
                </div>
                <button
                  type="button"
                  disabled={reducedMotion}
                  onClick={() => setWebglEnabled(prev => !prev)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    reducedMotion
                      ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                      : webglEnabled
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {reducedMotion
                    ? 'WebGL 모션 (시스템 감소 모션으로 비활성화)'
                    : webglEnabled
                      ? 'WebGL 모션 켜짐'
                      : 'WebGL 모션 켜기'}
                </button>
              </div>
            )}

            {(activeTab === 'daily' || activeTab === 'model' || activeTab === 'provider') && (
              <WebGLMotionPanel enabled={webglEnabled && !reducedMotion} metric={trendMetric} profile={motionProfile} />
            )}

            {activeTab === 'overview' && (
              <>
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
                <UsageTable title="Provider별 통계" rows={dashboard.byProvider} showModel={false} />
                <UsageTable title="Model별 통계" rows={dashboard.byModel} showModel />
              </>
            )}

            {activeTab === 'daily' && (
              <>
                <LineChartPanel
                  title="일간 추세"
                  subtitle={`${month} · ${metricLabel(trendMetric)}`}
                  points={dailyChartPoints}
                  formatter={trendMetric === 'cost' ? formatUsd : formatCount}
                />
                <DailyUsageTable rows={dashboard.daily} />
              </>
            )}

            {activeTab === 'model' && (
              <>
                <MultiSeriesChart
                  title="Model별 일간 추세"
                  subtitle={`상위 6개 모델 · ${metricLabel(trendMetric)}`}
                  series={modelSeries}
                  formatter={trendMetric === 'cost' ? formatUsd : formatCount}
                />
                <SeriesUsageTable title="Model별 일간 상세" rows={dashboard.dailyByModel} showModel metric={trendMetric} />
                <SeriesDailyUsageTable title="Model별 일자 레코드" rows={dashboard.dailyByModel} showModel />
              </>
            )}

            {activeTab === 'provider' && (
              <>
                <MultiSeriesChart
                  title="Provider별 일간 추세"
                  subtitle={`상위 6개 Provider · ${metricLabel(trendMetric)}`}
                  series={providerSeries}
                  formatter={trendMetric === 'cost' ? formatUsd : formatCount}
                />
                <SeriesUsageTable title="Provider별 일간 상세" rows={dashboard.dailyByProvider} showModel={false} metric={trendMetric} />
                <SeriesDailyUsageTable title="Provider별 일자 레코드" rows={dashboard.dailyByProvider} showModel={false} />
              </>
            )}

            {activeTab === 'history' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-end justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">이벤트 히스토리 (최신 500건)</h3>
                  <p className="text-xs text-slate-500">{month} 기준</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="px-2 py-1 text-left">수집시각</th>
                        <th className="px-2 py-1 text-left">일자</th>
                        <th className="px-2 py-1 text-left">Provider</th>
                        <th className="px-2 py-1 text-left">Model</th>
                        <th className="px-2 py-1 text-left">Feature</th>
                        <th className="px-2 py-1 text-right">요청</th>
                        <th className="px-2 py-1 text-right">입력</th>
                        <th className="px-2 py-1 text-right">출력</th>
                        <th className="px-2 py-1 text-right">USD</th>
                        <th className="px-2 py-1 text-left">메타데이터</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map(row => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-2 py-1.5 text-slate-700">{formatDateTime(row.occurredAt)}</td>
                          <td className="px-2 py-1.5 text-slate-700">{formatDay(row.day)}</td>
                          <td className="px-2 py-1.5 text-slate-700">{row.rawProvider || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700">{row.rawModel || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700">{row.feature}</td>
                          <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.requestCount)}</td>
                          <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.inputTokens)}</td>
                          <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.outputTokens)}</td>
                          <td className="px-2 py-1.5 text-right text-slate-700">{formatUsd(row.paygCostUsd)}</td>
                          <td className="px-2 py-1.5 text-slate-500">{formatHistoryMetadata(row.metadataJson)}</td>
                        </tr>
                      ))}
                      {historyRows.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-6 text-center text-slate-400">이력 데이터가 없습니다.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'collect' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-700">수동 입력</h3>
                  <div className="space-y-2 text-sm">
                    <input type="date" value={manualDay} onChange={event => setManualDay(event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
                    <select value={manualProvider} onChange={event => setManualProvider(event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                      {PROVIDER_OPTIONS.map(provider => (
                        <option key={provider.code} value={provider.code}>{provider.label}</option>
                      ))}
                    </select>
                    <input value={manualModel} onChange={event => setManualModel(event.target.value)} placeholder="model code (예: claude-3-7-sonnet)" className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" value={manualInput} onChange={e => setManualInput(Number(e.target.value))} placeholder="입력 토큰" className="rounded-lg border border-slate-300 px-2 py-1.5" />
                      <input type="number" value={manualOutput} onChange={e => setManualOutput(Number(e.target.value))} placeholder="출력 토큰" className="rounded-lg border border-slate-300 px-2 py-1.5" />
                      <input type="number" step="0.0001" value={manualCost} onChange={e => setManualCost(Number(e.target.value))} placeholder="비용 USD" className="rounded-lg border border-slate-300 px-2 py-1.5" />
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await AddPersonalAIManualUsage(manualDay, manualProvider, manualModel.trim(), Number(manualInput) || 0, Number(manualOutput) || 0, Number(manualCost) || 0)
                          await Promise.all([loadDashboard(), loadHistory()])
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

                <CollectResultPanel collectResult={collectResult} />
              </div>
            )}
          </>
        )}

        {loading && <p className="text-sm text-slate-500">불러오는 중...</p>}
      </div>

      {collecting && collectTrigger !== 'auto' && (
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

function MetricToggle({ metric, onChange }: { metric: TrendMetric; onChange: (metric: TrendMetric) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
      <button type="button" onClick={() => onChange('tokens')} className={`rounded-md px-2 py-1 ${metric === 'tokens' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>토큰</button>
      <button type="button" onClick={() => onChange('cost')} className={`rounded-md px-2 py-1 ${metric === 'cost' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>비용</button>
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

function UsageTable({ title, rows, showModel }: { title: string; rows: PersonalAIUsageDashboard['byModel']; showModel: boolean }) {
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
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DailyUsageTable({ rows }: { rows: AIUsageDailyPoint[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">일자별 상세</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-2 py-1 text-left">날짜</th>
              <th className="px-2 py-1 text-right">입력</th>
              <th className="px-2 py-1 text-right">출력</th>
              <th className="px-2 py-1 text-right">총 토큰</th>
              <th className="px-2 py-1 text-right">USD</th>
              <th className="px-2 py-1 text-right">KRW</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(point => (
              <tr key={point.day} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-1.5 text-slate-700">{formatDay(point.day)}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(point.inputTokens)}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(point.outputTokens)}</td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatCount(point.inputTokens + point.outputTokens)}</td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatUsd(point.totalCostUsd)}</td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatKrw(point.totalCostKrw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SeriesUsageTable({ title, rows, showModel, metric }: { title: string; rows: AIUsageSeriesRow[]; showModel: boolean; metric: TrendMetric }) {
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
              <th className="px-2 py-1 text-right">총 토큰</th>
              <th className="px-2 py-1 text-right">USD</th>
              <th className="px-2 py-1 text-right">KRW</th>
              <th className="px-2 py-1 text-right">최근 {metricLabel(metric)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const latest = row.daily[row.daily.length - 1]
              const latestValue = latest ? seriesMetricValue(latest, metric) : 0
              return (
                <tr key={`${row.providerCode}-${row.modelCode}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-2 py-1.5 text-slate-700">{row.providerName}</td>
                  {showModel && <td className="px-2 py-1.5 text-slate-700">{row.modelName}</td>}
                  <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.requestCount)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.inputTokens + row.outputTokens)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{formatUsd(row.totalCostUsd)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{formatKrw(row.totalCostKrw)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{metric === 'cost' ? formatUsd(latestValue) : formatCount(latestValue)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LineChartPanel({ title, subtitle, points, formatter }: { title: string; subtitle: string; points: Array<{ label: string; value: number }>; formatter: (v: number) => string }) {
  if (points.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-400">{title}: 데이터가 없습니다.</div>
  }

  const width = 920
  const height = 220
  const pad = 24
  const max = Math.max(...points.map(p => p.value), 1)
  const coords = points.map((point, idx) => {
    const x = points.length === 1 ? width / 2 : pad + (idx / (points.length - 1)) * (width - pad * 2)
    const y = height - pad - (point.value / max) * (height - pad * 2)
    return { x, y }
  })
  const path = coords.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <p className="text-xs text-slate-500">최대 {formatter(max)}</p>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full min-w-[680px]">
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#E2E8F0" strokeWidth="1" />
          <path d={path} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

function SeriesDailyUsageTable({ title, rows, showModel }: { title: string; rows: AIUsageSeriesRow[]; showModel: boolean }) {
  const dailyRows = rows
    .flatMap(row => row.daily.map(point => ({
      day: point.day,
      providerCode: row.providerCode,
      providerName: row.providerName,
      modelCode: row.modelCode,
      modelName: row.modelName,
      requestCount: point.requestCount,
      inputTokens: point.inputTokens,
      outputTokens: point.outputTokens,
      totalCostUsd: point.totalCostUsd,
      totalCostKrw: point.totalCostKrw,
    })))
    .sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day)
      if (a.providerName !== b.providerName) return a.providerName.localeCompare(b.providerName)
      return a.modelName.localeCompare(b.modelName)
    })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-2 py-1 text-left">날짜</th>
              <th className="px-2 py-1 text-left">Provider</th>
              {showModel && <th className="px-2 py-1 text-left">Model</th>}
              <th className="px-2 py-1 text-right">요청 수</th>
              <th className="px-2 py-1 text-right">입력</th>
              <th className="px-2 py-1 text-right">출력</th>
              <th className="px-2 py-1 text-right">총 토큰</th>
              <th className="px-2 py-1 text-right">USD</th>
              <th className="px-2 py-1 text-right">KRW</th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.map((row, idx) => (
              <tr key={`${row.day}-${row.providerCode}-${row.modelCode}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-1.5 text-slate-700">{formatDay(row.day)}</td>
                <td className="px-2 py-1.5 text-slate-700">{row.providerName}</td>
                {showModel && <td className="px-2 py-1.5 text-slate-700">{row.modelName}</td>}
                <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.requestCount)}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.inputTokens)}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{formatCount(row.outputTokens)}</td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatCount(row.inputTokens + row.outputTokens)}</td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatUsd(row.totalCostUsd)}</td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatKrw(row.totalCostKrw)}</td>
              </tr>
            ))}
            {dailyRows.length === 0 && (
              <tr>
                <td colSpan={showModel ? 9 : 8} className="py-6 text-center text-slate-400">데이터가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MultiSeriesChart({ title, subtitle, series, formatter }: { title: string; subtitle: string; series: Array<{ name: string; color: string; points: Array<{ day: string; value: number }> }>; formatter: (v: number) => string }) {
  if (series.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-400">{title}: 데이터가 없습니다.</div>
  }

  const allDays = Array.from(new Set(series.flatMap(item => item.points.map(point => point.day)))).sort()
  const width = 920
  const height = 250
  const pad = 24
  const max = Math.max(...series.flatMap(item => item.points.map(point => point.value)), 1)
  const xForDay = (day: string) => {
    const idx = allDays.indexOf(day)
    if (allDays.length <= 1) return width / 2
    return pad + (idx / (allDays.length - 1)) * (width - pad * 2)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <p className="text-xs text-slate-500">최대 {formatter(max)}</p>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {series.map(item => (
          <span key={item.name} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full min-w-[680px]">
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#E2E8F0" strokeWidth="1" />
          {series.map(item => {
            const valueMap = new Map(item.points.map(point => [point.day, point.value]))
            const path = allDays
              .filter(day => valueMap.has(day))
              .map((day, idx) => {
                const value = valueMap.get(day) || 0
                const x = xForDay(day)
                const y = height - pad - (value / max) * (height - pad * 2)
                return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
              })
              .join(' ')
            return <path key={item.name} d={path} fill="none" stroke={item.color} strokeWidth="2" strokeLinecap="round" />
          })}
        </svg>
      </div>
    </div>
  )
}

function CollectResultPanel({ collectResult }: { collectResult: PersonalAICollectorResponse | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">최근 수집 결과</h3>
      {!collectResult && <p className="text-xs text-slate-400">아직 수집을 실행하지 않았습니다.</p>}
      {collectResult && (
        <div className="space-y-2">
          {collectResult.results.map(item => (
            <div key={item.sourceCode} className="rounded-lg border border-slate-200 p-2 text-xs">
              <p className="font-medium text-slate-700">{item.sourceName}</p>
              <p className="text-slate-500">스캔 {formatCount(item.scannedFiles)}건 / 파싱 {formatCount(item.parsedEntries)}건 / 반영 {formatCount(item.importedRows)}건</p>
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
  )
}

function WebGLMotionPanel({ enabled, metric, profile }: { enabled: boolean; metric: TrendMetric; profile: MotionProfile }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const metricRef = useRef(metric)
  const profileRef = useRef(profile)

  useEffect(() => {
    metricRef.current = metric
  }, [metric])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  useEffect(() => {
    if (!enabled) {
      setUnsupported(false)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true }) as WebGLRenderingContext | null
    if (!gl) {
      setUnsupported(true)
      return
    }

    const vertexSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;

      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `
    const fragmentSource = `
      precision mediump float;

      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_metric;
      uniform float u_intensity;
      uniform float u_volatility;
      uniform float u_trend;
      uniform float u_density;
      varying vec2 v_uv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main() {
        vec2 uv = v_uv;
        float aspect = u_resolution.x / max(u_resolution.y, 1.0);
        vec2 p = vec2((uv.x - 0.5) * aspect + 0.5, uv.y);
        float speed = 0.22 + u_intensity * 0.95 + u_metric * 0.18;
        float t = u_time * speed;
        float waveA = sin((p.x * (6.0 + u_density * 18.0)) + t * (1.4 + u_volatility));
        float waveB = cos((p.y * (4.0 + u_volatility * 15.0)) - t * (1.1 + u_density * 0.6));
        float waveC = sin((p.x + p.y) * (3.0 + abs(u_trend) * 6.0) + t * (0.8 + abs(u_trend) * 0.9));
        float n = noise(p * (2.0 + u_density * 5.0) + vec2(t * 0.24, -t * 0.17));
        float flow = 0.5 + 0.5 * (waveA * 0.35 + waveB * 0.30 + waveC * 0.25 + (n - 0.5) * (0.9 + u_volatility));

        float trendT = clamp((u_trend + 1.0) * 0.5, 0.0, 1.0);
        vec3 base = mix(vec3(0.03, 0.10, 0.20), vec3(0.05, 0.17, 0.33), u_metric);
        vec3 glowA = mix(vec3(0.08, 0.53, 0.85), vec3(0.72, 0.34, 0.95), trendT);
        vec3 glowB = mix(vec3(0.08, 0.74, 0.66), vec3(0.94, 0.55, 0.20), u_volatility);

        vec3 color = base;
        color += glowA * (0.12 + flow * (0.28 + u_intensity * 0.55));
        color += glowB * (0.06 + (1.0 - flow) * (0.16 + u_density * 0.30));
        float horizon = smoothstep(0.0, 0.85, uv.y);
        color *= 0.84 + horizon * 0.28;
        float dist = distance(uv, vec2(0.5, 0.5));
        float vignette = 1.0 - smoothstep(0.18, 0.85, dist);
        color *= 0.78 + 0.22 * vignette;

        gl_FragColor = vec4(color, 0.94);
      }
    `

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource)
    if (!vertexShader || !fragmentShader) {
      setUnsupported(true)
      if (vertexShader) gl.deleteShader(vertexShader)
      if (fragmentShader) gl.deleteShader(fragmentShader)
      return
    }

    const program = gl.createProgram()
    if (!program) {
      setUnsupported(true)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setUnsupported(true)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    if (positionLocation < 0) {
      setUnsupported(true)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }

    const buffer = gl.createBuffer()
    if (!buffer) {
      setUnsupported(true)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }

    setUnsupported(false)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const metricLocation = gl.getUniformLocation(program, 'u_metric')
    const intensityLocation = gl.getUniformLocation(program, 'u_intensity')
    const volatilityLocation = gl.getUniformLocation(program, 'u_volatility')
    const trendLocation = gl.getUniformLocation(program, 'u_trend')
    const densityLocation = gl.getUniformLocation(program, 'u_density')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    let raf = 0
    const render = (time: number) => {
      resize()
      gl.useProgram(program)
      const nextMetric = metricRef.current === 'cost' ? 1 : 0
      const nextProfile = profileRef.current
      if (timeLocation) gl.uniform1f(timeLocation, time * 0.001)
      if (metricLocation) gl.uniform1f(metricLocation, nextMetric)
      if (intensityLocation) gl.uniform1f(intensityLocation, nextProfile.intensity)
      if (volatilityLocation) gl.uniform1f(volatilityLocation, nextProfile.volatility)
      if (trendLocation) gl.uniform1f(trendLocation, nextProfile.trend)
      if (densityLocation) gl.uniform1f(densityLocation, nextProfile.density)
      if (resolutionLocation) gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      gl.disableVertexAttribArray(positionLocation)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)
      gl.deleteBuffer(buffer)
      gl.useProgram(null)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
    }
  }, [enabled])

  const profileSummary = `강도 ${formatPercent(profile.intensity)} · 변동성 ${formatPercent(profile.volatility)} · 밀도 ${formatPercent(profile.density)}`

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-600/20 via-indigo-600/15 to-cyan-300/20" />
      {enabled && !unsupported && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
      <div className="relative z-10">
        <p className="text-[11px] font-medium uppercase tracking-wide text-sky-300">WebGL Motion</p>
        <h3 className="mt-1 text-sm font-semibold text-white">데이터 반응형 배경 애니메이션</h3>
        <p className="mt-1 text-xs text-slate-200">{unsupported ? '현재 환경에서는 WebGL을 사용할 수 없습니다.' : enabled ? `${metricLabel(metric)} 추세와 연동되는 WebGL 모션입니다.` : 'WebGL 모션을 켜면 데이터 기반 애니메이션이 동작합니다.'}</p>
        <p className="mt-1 text-[11px] text-slate-300">{profileSummary}</p>
      </div>
    </div>
  )
}
