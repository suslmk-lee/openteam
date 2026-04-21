import * as AppModule from '../../wailsjs/go/main/App'
import type { ai, db } from '../../wailsjs/go/models'

export interface VaultItem {
  id: number
  type: 'file' | 'folder' | string
  name: string
  path: string
  parentId?: number | null
  modifiedAt: string
  size: number
  createdAt?: string
}

export interface VaultFile {
  id: number
  name: string
  path: string
  content: string
  modifiedAt: string
  size: number
}

export interface VaultReference {
  path: string
  title: string
  snippet: string
  content: string
}

export interface AIProvider {
  id: number
  userId: number
  code: string
  displayName: string
  enabled: boolean
  createdAt: string
}

export interface AIModel {
  id: number
  userId: number
  providerId: number
  modelCode: string
  displayName: string
  enabled: boolean
  createdAt: string
}

export interface AIBillingPlan {
  id: number
  userId: number
  providerId: number
  modelId?: number | null
  monthlyFixedUsd: number
  includedInputTokens: number
  includedOutputTokens: number
  overageInputPer1kUsd: number
  overageOutputPer1kUsd: number
  effectiveFrom: string
  effectiveTo?: string | null
  createdAt: string
}

export interface AIUsageSummaryRow {
  providerCode: string
  providerName: string
  modelCode: string
  modelName: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  paygCostUsd: number
  fixedCostUsd: number
  overageCostUsd: number
  totalCostUsd: number
  totalCostKrw: number
  isUnregistered: boolean
}

export interface AIUsageDailyPoint {
  day: string
  totalCostUsd: number
  totalCostKrw: number
  inputTokens: number
  outputTokens: number
}

export interface AIUsageSeriesPoint {
  day: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalCostUsd: number
  totalCostKrw: number
}

export interface AIUsageSeriesRow {
  providerCode: string
  providerName: string
  modelCode: string
  modelName: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalCostUsd: number
  totalCostKrw: number
  daily: AIUsageSeriesPoint[]
}

export interface AIUsageDashboard {
  overview: {
    month: string
    requestCount: number
    inputTokens: number
    outputTokens: number
    totalCostUsd: number
    totalCostKrw: number
    fixedCostUsd: number
    overageCostUsd: number
    paygCostUsd: number
  }
  byProvider: AIUsageSummaryRow[]
  byModel: AIUsageSummaryRow[]
  unregistered: AIUsageSummaryRow[]
  daily: AIUsageDailyPoint[]
  fxRateUsed: number
  fxRateDate: string
  fxSource: string
  fxFallbackUsed: boolean
}

export interface PersonalAISourceSummaryRow {
  sourceCode: string
  sourceName: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalCostUsd: number
  totalCostKrw: number
}

export interface PersonalAIUsageDashboard {
  overview: {
    month: string
    requestCount: number
    internalInputTokens: number
    internalOutputTokens: number
    externalInputTokens: number
    externalOutputTokens: number
    internalCostUsd: number
    externalCostUsd: number
    totalCostUsd: number
    totalCostKrw: number
  }
  bySource: PersonalAISourceSummaryRow[]
  byProvider: AIUsageSummaryRow[]
  byModel: AIUsageSummaryRow[]
  daily: AIUsageDailyPoint[]
  dailyByProvider: AIUsageSeriesRow[]
  dailyByModel: AIUsageSeriesRow[]
  fxRateUsed: number
  fxRateDate: string
  fxSource: string
  fxFallbackUsed: boolean
}

export interface PersonalAICollectorResult {
  sourceCode: string
  sourceName: string
  scannedFiles: number
  parsedEntries: number
  importedRows: number
  warnings: string[]
}

export interface PersonalAICollectorResponse {
  month: string
  results: PersonalAICollectorResult[]
}

export interface AIUsageHistoryEvent {
  id: number
  occurredAt: string
  day: string
  userId: number
  providerId: number
  modelId: number
  rawProvider: string
  rawModel: string
  feature: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  paygCostUsd: number
  metadataJson?: string
  createdAt: string
}

export interface AIUsageTodayHalfHourPoint {
  slot: string
  startAt: string
  endAt: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  paygCostUsd: number
  paygCostKrw: number
}

export interface PersonalAIUsageTodayProviderRow {
  providerCode: string
  providerName: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  paygCostUsd: number
  paygCostKrw: number
  buckets: AIUsageTodayHalfHourPoint[]
}

export interface PersonalAIUsageTodayModelRow {
  providerCode: string
  providerName: string
  modelCode: string
  modelName: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  paygCostUsd: number
  paygCostKrw: number
  buckets: AIUsageTodayHalfHourPoint[]
}

export interface PersonalAIUsageTodayUsage {
  day: string
  timezone: string
  buckets: AIUsageTodayHalfHourPoint[]
  byProvider: PersonalAIUsageTodayProviderRow[]
  byModel: PersonalAIUsageTodayModelRow[]
  fxRateUsed: number
  fxRateDate: string
  fxSource: string
  fxFallbackUsed: boolean
}

export interface PersonalAICollectStatus {
  running: boolean
  trigger?: string
  month: string
  startedAt: string
  finishedAt: string
  lastError: string
  lastResult?: PersonalAICollectorResponse | null
  autoEnabled?: boolean
  autoIntervalSeconds?: number
  autoNextRunAt?: string
  autoLastTriggeredAt?: string
  autoLastTriggeredMonth?: string
}

export interface PersonalAIAutoCollectConfig {
  enabled: boolean
  intervalSeconds: number
  nextRunAt: string
  lastTriggeredAt: string
  lastTriggeredMonth: string
}

export type AppApi = typeof AppModule & {
  LookupLinearViewer: (apiKey: string) => Promise<Record<string, string>>
  GetLinearTeamLabels: () => Promise<Array<{ id: string; name: string; color: string }>>
  AutoMapLinearMembers: () => Promise<number>
  UpdateLinearIssue: (id: string, input: any) => Promise<void>
  CheckClaudeCLI: () => Promise<{ ok: boolean; version: string }>
  OpenAIChatWithMessages: (
    systemContext: string,
    messages: Array<{ role: string; content: string }>,
  ) => Promise<{
    reply: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
  }>
  MiniMaxChatWithMessages: (
    systemContext: string,
    messages: Array<{ role: string; content: string }>,
  ) => Promise<{
    reply: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
  }>
  ClaudeChat: (prompt: string, ctx: string) => Promise<string>
  ClaudeChatWithSession: (
    prompt: string,
    ctx: string,
    sessionID: string,
  ) => Promise<{
    reply: string
    sessionId: string
    model: string
    numTurns: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreateTokens: number
    costUsd: number
  }>
  ScanClaudeSkills: () => Promise<{ skill: string; cmd: string; desc: string }[]>
  ListAIProviders: () => Promise<AIProvider[]>
  SaveAIProvider: (id: number, code: string, displayName: string, enabled: boolean) => Promise<AIProvider>
  DeleteAIProvider: (id: number) => Promise<void>
  ListAIModels: () => Promise<AIModel[]>
  SaveAIModel: (id: number, providerId: number, modelCode: string, displayName: string, enabled: boolean) => Promise<AIModel>
  DeleteAIModel: (id: number) => Promise<void>
  ListAIBillingPlans: () => Promise<AIBillingPlan[]>
  SaveAIBillingPlan: (
    id: number,
    providerId: number,
    modelId: number,
    monthlyFixedUsd: number,
    includedInputTokens: number,
    includedOutputTokens: number,
    overageInputPer1kUsd: number,
    overageOutputPer1kUsd: number,
    effectiveFrom: string,
    effectiveTo: string,
  ) => Promise<AIBillingPlan>
  DeleteAIBillingPlan: (id: number) => Promise<void>
  GetAIUsageDashboard: (month: string) => Promise<AIUsageDashboard>
  GetPersonalAIUsageDashboard: (month: string) => Promise<PersonalAIUsageDashboard>
  GetPersonalAIUsageTodayUsage: () => Promise<PersonalAIUsageTodayUsage>
  GetPersonalAIUsageHistory: (month: string, limit: number) => Promise<AIUsageHistoryEvent[]>
  StartPersonalAIUsageCollection: (month: string) => Promise<PersonalAICollectStatus>
  GetPersonalAIUsageCollectionStatus: () => Promise<PersonalAICollectStatus>
  GetPersonalAIAutoCollect: () => Promise<PersonalAIAutoCollectConfig>
  SetPersonalAIAutoCollect: (enabled: boolean, intervalSeconds: number) => Promise<PersonalAIAutoCollectConfig>
  CollectPersonalAIUsage: (month: string) => Promise<PersonalAICollectorResponse>
  AddPersonalAIManualUsage: (
    day: string,
    providerCode: string,
    modelCode: string,
    inputTokens: number,
    outputTokens: number,
    costUsd: number,
  ) => Promise<void>
  RefreshUSDKRWRate: (day: string) => Promise<{ day: string; base: string; quote: string; rate: number; source: string; fetchedAt: string }>
  GetPositionTypes: () => Promise<string[]>
  AddPositionType: (name: string) => Promise<void>
  DeletePositionType: (name: string) => Promise<void>
  GetEmploymentTypes: () => Promise<string[]>
  AddEmploymentType: (name: string) => Promise<void>
  DeleteEmploymentType: (name: string) => Promise<void>
  GetSIProjectTypes: () => Promise<string[]>
  AddSIProjectType: (name: string) => Promise<void>
  DeleteSIProjectType: (name: string) => Promise<void>
  GetSIPhases: () => Promise<string[]>
  AddSIPhase: (name: string) => Promise<void>
  DeleteSIPhase: (name: string) => Promise<void>
  GetReportInsights: (reportID: number) => Promise<db.ReportInsights>
  AcceptInsightActivity: (
    reportID: number,
    activityID: number,
    section: string,
    category: string,
    period: string,
  ) => Promise<db.ReportItem>
  AcceptInsightDraft: (reportID: number, draft: db.ReportInsightDraft, period: string) => Promise<db.ReportItem[]>
  IgnoreInsightActivity: (reportID: number, activityID: number) => Promise<void>
  IngestKnowledgeSource: (sourceType: string, source: string, model: string, requestedBy: string) => Promise<db.IngestResult>
  IngestKnowledgeBatch: (
    sourceType: string,
    sources: string[],
    model: string,
    requestedBy: string,
  ) => Promise<db.IngestResult[]>
  SaveKnowledgeQuery: (
    query: string,
    answer: string,
    model: string,
    requestedBy: string,
    referencePaths: string[],
  ) => Promise<db.IngestResult>
  RunKnowledgeBaseLint: () => Promise<db.IngestResult>
  GetVaultStructure: (parentID: number | null) => Promise<VaultItem[]>
  GetVaultFile: (path: string) => Promise<VaultFile>
  SearchVault: (keyword: string) => Promise<VaultItem[]>
  RefreshVault: () => Promise<number>
  RetrieveVaultContext: (query: string, limit: number) => Promise<VaultReference[]>
  GetAISettings: () => Promise<AISettings>
  SaveAISettings: (settings: AISettings) => Promise<void>
  ChatWithAI: (
    prompt: string,
    systemContext: string,
    overrideProvider: string,
    overrideModel: string,
  ) => Promise<AIChatResult>
}

const fallbackModule = AppModule as unknown as AppApi
const unavailableClaudeChatWithSession: AppApi['ClaudeChatWithSession'] = async () => ({
  reply: '',
  sessionId: '',
  model: '',
  numTurns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  costUsd: 0,
})
const unavailableOpenAIChatWithMessages: AppApi['OpenAIChatWithMessages'] = async () => ({
  reply: '',
  model: '',
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: 0,
})
const unavailableMiniMaxChatWithMessages: AppApi['MiniMaxChatWithMessages'] = async () => ({
  reply: '',
  model: '',
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: 0,
})
const unavailableAIUsageDashboard = async (_month: string): Promise<AIUsageDashboard> =>
  ({
    overview: {
      month: '',
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
      totalCostKrw: 0,
      fixedCostUsd: 0,
      overageCostUsd: 0,
      paygCostUsd: 0,
    },
    byProvider: [],
    byModel: [],
    unregistered: [],
    daily: [],
    fxRateUsed: 0,
    fxRateDate: '',
    fxSource: '',
    fxFallbackUsed: false,
  })
const unavailablePersonalAIUsageDashboard = async (_month: string): Promise<PersonalAIUsageDashboard> =>
  ({
    overview: {
      month: '',
      requestCount: 0,
      internalInputTokens: 0,
      internalOutputTokens: 0,
      externalInputTokens: 0,
      externalOutputTokens: 0,
      internalCostUsd: 0,
      externalCostUsd: 0,
      totalCostUsd: 0,
      totalCostKrw: 0,
    },
    bySource: [],
    byProvider: [],
    byModel: [],
    daily: [],
    dailyByProvider: [],
    dailyByModel: [],
    fxRateUsed: 0,
    fxRateDate: '',
    fxSource: '',
    fxFallbackUsed: false,
  })
const unavailablePersonalAICollectorResponse = async (_month: string): Promise<PersonalAICollectorResponse> =>
  ({
    month: '',
    results: [],
  })
const unavailablePersonalAIHistory = async (_month: string, _limit: number): Promise<AIUsageHistoryEvent[]> => []
const unavailablePersonalAIUsageToday = async (): Promise<PersonalAIUsageTodayUsage> =>
  ({
    day: '',
    timezone: 'KST (Asia/Seoul)',
    buckets: [],
    byProvider: [],
    byModel: [],
    fxRateUsed: 0,
    fxRateDate: '',
    fxSource: '',
    fxFallbackUsed: false,
  })
const unavailablePersonalAICollectStatus = async (): Promise<PersonalAICollectStatus> =>
  ({
    running: false,
    trigger: '',
    month: '',
    startedAt: '',
    finishedAt: '',
    lastError: '',
    lastResult: null,
    autoEnabled: false,
    autoIntervalSeconds: 120,
    autoNextRunAt: '',
    autoLastTriggeredAt: '',
    autoLastTriggeredMonth: '',
  })
const unavailablePersonalAIAutoCollectConfig = async (): Promise<PersonalAIAutoCollectConfig> =>
  ({
    enabled: false,
    intervalSeconds: 120,
    nextRunAt: '',
    lastTriggeredAt: '',
    lastTriggeredMonth: '',
  })
const unavailableClaudeChat: AppApi['ClaudeChat'] = async () => {
  throw new Error('ClaudeChat not available')
}
const unavailableError = <T, Args extends unknown[] = []>(message: string): ((...args: Args) => Promise<T>) =>
  async () => {
    throw new Error(message)
  }

const fallbackAISettings: AISettings = {
  defaultProvider: 'openai',
  policy: {
    chatAllowOverride: true,
  },
  providers: {
    openai: {
      enabled: false,
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      mode: 'openai_compatible',
    },
    minimax: {
      enabled: false,
      model: '',
      baseUrl: 'https://api.minimax.io/v1',
      mode: 'openai_compatible',
    },
    claude_cli: {
      enabled: false,
      model: '',
      baseUrl: '',
      mode: 'local_cli',
    },
  },
}

function normalizeProviderID(raw: unknown): AIProviderID {
  if (raw === 'openai' || raw === 'minimax' || raw === 'claude_cli') {
    return raw
  }
  return 'openai'
}

function normalizeAISettings(input: ai.Settings | AISettings | null | undefined): AISettings {
  const rawProviders = input?.providers ?? {}
  return {
    defaultProvider: normalizeProviderID(input?.defaultProvider),
    policy: {
      chatAllowOverride: input?.policy?.chatAllowOverride ?? fallbackAISettings.policy.chatAllowOverride,
    },
    providers: {
      ...fallbackAISettings.providers,
      ...rawProviders,
    },
  }
}

function makeVaultSnippet(content: string, query: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const needle = query.trim().toLowerCase()
  if (!needle) return normalized.slice(0, 240)

  const lower = normalized.toLowerCase()
  const index = lower.indexOf(needle)
  if (index === -1) return normalized.slice(0, 240)

  const start = Math.max(0, index - 80)
  const end = Math.min(normalized.length, index + needle.length + 160)
  const prefix = start > 0 ? '... ' : ''
  const suffix = end < normalized.length ? ' ...' : ''
  return `${prefix}${normalized.slice(start, end)}${suffix}`
}

async function fallbackRetrieveVaultContext(query: string, limit: number): Promise<VaultReference[]> {
  const cappedLimit = limit > 0 ? limit : 7
  const results = await fallbackModule.SearchVault(query)
  const fileItems = (results ?? []).filter((item: VaultItem) => item.type === 'file').slice(0, cappedLimit)

  return Promise.all(
    fileItems.map(async item => {
      const file = await fallbackModule.GetVaultFile(item.path)
      return {
        path: item.path,
        title: item.name || file.name || item.path,
        snippet: makeVaultSnippet(file.content || '', query),
        content: file.content || '',
      }
    }),
  )
}

export const appApi: AppApi = {
  ...fallbackModule,
  LookupLinearViewer:
    fallbackModule.LookupLinearViewer ??
    unavailableError<Record<string, string>>('LookupLinearViewer not available'),
  GetLinearTeamLabels:
    fallbackModule.GetLinearTeamLabels ??
    ((async () => []) as AppApi['GetLinearTeamLabels']),
  AutoMapLinearMembers: (fallbackModule.AutoMapLinearMembers ?? (() => Promise.resolve(0))) as AppApi['AutoMapLinearMembers'],
  UpdateLinearIssue: (fallbackModule.UpdateLinearIssue ?? (() => Promise.resolve())) as AppApi['UpdateLinearIssue'],
  CheckClaudeCLI:
    fallbackModule.CheckClaudeCLI ??
    (() => Promise.resolve({ ok: false, version: '' })) as AppApi['CheckClaudeCLI'],
  OpenAIChatWithMessages:
    (fallbackModule as AppApi).OpenAIChatWithMessages ??
    unavailableOpenAIChatWithMessages,
  MiniMaxChatWithMessages:
    (fallbackModule as AppApi).MiniMaxChatWithMessages ??
    unavailableMiniMaxChatWithMessages,
  ClaudeChat: (fallbackModule.ClaudeChat ?? unavailableClaudeChat) as AppApi['ClaudeChat'],
  ClaudeChatWithSession: (fallbackModule.ClaudeChatWithSession ?? unavailableClaudeChatWithSession) as AppApi['ClaudeChatWithSession'],
  ScanClaudeSkills:
    fallbackModule.ScanClaudeSkills ??
    unavailableError<{ skill: string; cmd: string; desc: string }[]>('ScanClaudeSkills not available'),
  ListAIProviders:
    (fallbackModule as AppApi).ListAIProviders ??
    ((async () => []) as AppApi['ListAIProviders']),
  SaveAIProvider:
    (fallbackModule as AppApi).SaveAIProvider ??
    unavailableError<AIProvider, [number, string, string, boolean]>('SaveAIProvider not available'),
  DeleteAIProvider:
    (fallbackModule as AppApi).DeleteAIProvider ??
    unavailableError<void, [number]>('DeleteAIProvider not available'),
  ListAIModels:
    (fallbackModule as AppApi).ListAIModels ??
    ((async () => []) as AppApi['ListAIModels']),
  SaveAIModel:
    (fallbackModule as AppApi).SaveAIModel ??
    unavailableError<AIModel, [number, number, string, string, boolean]>('SaveAIModel not available'),
  DeleteAIModel:
    (fallbackModule as AppApi).DeleteAIModel ??
    unavailableError<void, [number]>('DeleteAIModel not available'),
  ListAIBillingPlans:
    (fallbackModule as AppApi).ListAIBillingPlans ??
    ((async () => []) as AppApi['ListAIBillingPlans']),
  SaveAIBillingPlan:
    (fallbackModule as AppApi).SaveAIBillingPlan ??
    unavailableError<AIBillingPlan, [number, number, number, number, number, number, number, number, string, string]>('SaveAIBillingPlan not available'),
  DeleteAIBillingPlan:
    (fallbackModule as AppApi).DeleteAIBillingPlan ??
    unavailableError<void, [number]>('DeleteAIBillingPlan not available'),
  GetAIUsageDashboard:
    (fallbackModule as AppApi).GetAIUsageDashboard ??
    (unavailableAIUsageDashboard as unknown as AppApi['GetAIUsageDashboard']),
  GetPersonalAIUsageDashboard:
    (fallbackModule as AppApi).GetPersonalAIUsageDashboard ??
    (unavailablePersonalAIUsageDashboard as unknown as AppApi['GetPersonalAIUsageDashboard']),
  GetPersonalAIUsageTodayUsage:
    (fallbackModule as AppApi).GetPersonalAIUsageTodayUsage ??
    (unavailablePersonalAIUsageToday as unknown as AppApi['GetPersonalAIUsageTodayUsage']),
  GetPersonalAIUsageHistory:
    (fallbackModule as AppApi).GetPersonalAIUsageHistory ??
    (unavailablePersonalAIHistory as unknown as AppApi['GetPersonalAIUsageHistory']),
  StartPersonalAIUsageCollection:
    (fallbackModule as AppApi).StartPersonalAIUsageCollection ??
    (unavailablePersonalAICollectStatus as unknown as AppApi['StartPersonalAIUsageCollection']),
  GetPersonalAIUsageCollectionStatus:
    (fallbackModule as AppApi).GetPersonalAIUsageCollectionStatus ??
    (unavailablePersonalAICollectStatus as unknown as AppApi['GetPersonalAIUsageCollectionStatus']),
  GetPersonalAIAutoCollect:
    (fallbackModule as AppApi).GetPersonalAIAutoCollect ??
    (unavailablePersonalAIAutoCollectConfig as unknown as AppApi['GetPersonalAIAutoCollect']),
  SetPersonalAIAutoCollect:
    (fallbackModule as AppApi).SetPersonalAIAutoCollect ??
    (unavailablePersonalAIAutoCollectConfig as unknown as AppApi['SetPersonalAIAutoCollect']),
  CollectPersonalAIUsage:
    (fallbackModule as AppApi).CollectPersonalAIUsage ??
    (unavailablePersonalAICollectorResponse as unknown as AppApi['CollectPersonalAIUsage']),
  AddPersonalAIManualUsage:
    (fallbackModule as AppApi).AddPersonalAIManualUsage ??
    unavailableError<void, [string, string, string, number, number, number]>('AddPersonalAIManualUsage not available'),
  RefreshUSDKRWRate:
    (fallbackModule as AppApi).RefreshUSDKRWRate ??
    unavailableError<{ day: string; base: string; quote: string; rate: number; source: string; fetchedAt: string }, [string]>('RefreshUSDKRWRate not available'),
  GetPositionTypes:
    fallbackModule.GetPositionTypes ??
    ((async () => []) as AppApi['GetPositionTypes']),
  AddPositionType:
    fallbackModule.AddPositionType ??
    ((_: string) => Promise.resolve()) as AppApi['AddPositionType'],
  DeletePositionType:
    fallbackModule.DeletePositionType ??
    ((_: string) => Promise.resolve()) as AppApi['DeletePositionType'],
  GetEmploymentTypes:
    fallbackModule.GetEmploymentTypes ??
    (async () => []) as AppApi['GetEmploymentTypes'],
  AddEmploymentType:
    fallbackModule.AddEmploymentType ??
    ((_: string) => Promise.resolve()) as AppApi['AddEmploymentType'],
  DeleteEmploymentType:
    fallbackModule.DeleteEmploymentType ??
    ((_: string) => Promise.resolve()) as AppApi['DeleteEmploymentType'],
  GetSIProjectTypes:
    fallbackModule.GetSIProjectTypes ??
    (async () => []) as AppApi['GetSIProjectTypes'],
  AddSIProjectType:
    fallbackModule.AddSIProjectType ??
    ((_: string) => Promise.resolve()) as AppApi['AddSIProjectType'],
  DeleteSIProjectType:
    fallbackModule.DeleteSIProjectType ??
    ((_: string) => Promise.resolve()) as AppApi['DeleteSIProjectType'],
  GetSIPhases:
    fallbackModule.GetSIPhases ??
    (async () => []) as AppApi['GetSIPhases'],
  AddSIPhase:
    fallbackModule.AddSIPhase ??
    ((_: string) => Promise.resolve()) as AppApi['AddSIPhase'],
  DeleteSIPhase:
    fallbackModule.DeleteSIPhase ??
    ((_: string) => Promise.resolve()) as AppApi['DeleteSIPhase'],
  GetReportInsights:
    fallbackModule.GetReportInsights ??
    unavailableError<db.ReportInsights>('GetReportInsights not available'),
  AcceptInsightActivity:
    fallbackModule.AcceptInsightActivity ??
    unavailableError<db.ReportItem>('AcceptInsightActivity not available'),
  AcceptInsightDraft:
    fallbackModule.AcceptInsightDraft ??
    unavailableError<db.ReportItem[]>('AcceptInsightDraft not available'),
  IgnoreInsightActivity:
    fallbackModule.IgnoreInsightActivity ??
    unavailableError<void>('IgnoreInsightActivity not available'),
  IngestKnowledgeSource:
    fallbackModule.IngestKnowledgeSource ??
    unavailableError<db.IngestResult, [string, string, string, string]>('IngestKnowledgeSource not available'),
  IngestKnowledgeBatch:
    fallbackModule.IngestKnowledgeBatch ??
    unavailableError<db.IngestResult[], [string, string[], string, string]>('IngestKnowledgeBatch not available'),
  SaveKnowledgeQuery:
    fallbackModule.SaveKnowledgeQuery ??
    unavailableError<db.IngestResult, [string, string, string, string, string[]]>('SaveKnowledgeQuery not available'),
  RunKnowledgeBaseLint:
    fallbackModule.RunKnowledgeBaseLint ??
    unavailableError<db.IngestResult>('RunKnowledgeBaseLint not available'),
  GetVaultStructure:
    fallbackModule.GetVaultStructure ??
    unavailableError<VaultItem[], [number | null]>('GetVaultStructure not available'),
  GetVaultFile:
    fallbackModule.GetVaultFile ??
    unavailableError<VaultFile, [string]>('GetVaultFile not available'),
  SearchVault:
    fallbackModule.SearchVault ??
    unavailableError<VaultItem[], [string]>('SearchVault not available'),
  RefreshVault:
    fallbackModule.RefreshVault ??
    unavailableError<number>('RefreshVault not available'),
  RetrieveVaultContext:
    fallbackModule.RetrieveVaultContext ??
    fallbackRetrieveVaultContext,
  GetAISettings:
    fallbackModule.GetAISettings
      ? (async () => normalizeAISettings(await fallbackModule.GetAISettings()))
      : (async () => fallbackAISettings),
  SaveAISettings:
    fallbackModule.SaveAISettings
      ? ((settings: AISettings) => fallbackModule.SaveAISettings(settings))
      : unavailableError<void, [AISettings]>('SaveAISettings not available'),
  ChatWithAI:
    (fallbackModule.ChatWithAI as AppApi['ChatWithAI']) ??
    unavailableError<AIChatResult, [string, string, string, string]>('ChatWithAI not available'),
}
