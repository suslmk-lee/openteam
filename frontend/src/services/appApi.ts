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

export type AIProviderID = 'openai' | 'minimax' | 'claude_cli'

export interface AIProviderConfig {
  enabled: boolean
  apiKey?: string
  model?: string
  baseUrl?: string
  mode?: string
}

export interface AISettings {
  defaultProvider: AIProviderID
  policy: {
    chatAllowOverride: boolean
  }
  providers: Record<string, AIProviderConfig>
}

export interface AIChatResult {
  reply: string
  provider: string
  model: string
}

type BaseAppApi = typeof AppModule
type OverriddenAppApiKeys = 'GetAISettings' | 'SaveAISettings' | 'ChatWithAI'

export type AppApi = Omit<BaseAppApi, OverriddenAppApiKeys> & {
  LookupLinearViewer: (apiKey: string) => Promise<Record<string, string>>
  GetLinearTeamLabels: () => Promise<Array<{ id: string; name: string; color: string }>>
  AutoMapLinearMembers: () => Promise<number>
  UpdateLinearIssue: (id: string, input: any) => Promise<void>
  CheckClaudeCLI: () => Promise<{ ok: boolean; version: string }>
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
    (fallbackModule.CheckClaudeCLI as AppApi['CheckClaudeCLI'] | undefined) ??
    ((async () => ({ ok: false, version: '' })) as AppApi['CheckClaudeCLI']),
  ClaudeChat: (fallbackModule.ClaudeChat ?? unavailableClaudeChat) as AppApi['ClaudeChat'],
  ClaudeChatWithSession: (fallbackModule.ClaudeChatWithSession ?? unavailableClaudeChatWithSession) as AppApi['ClaudeChatWithSession'],
  ScanClaudeSkills:
    fallbackModule.ScanClaudeSkills ??
    unavailableError<{ skill: string; cmd: string; desc: string }[]>('ScanClaudeSkills not available'),
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
