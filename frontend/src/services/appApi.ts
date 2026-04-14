import * as AppModule from '../../wailsjs/go/main/App'
import type { db } from '../../wailsjs/go/models'

export type AppApi = typeof AppModule & {
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
const unavailableError = <T extends unknown>(message: string): (() => Promise<T>) =>
  async () => {
    throw new Error(message)
  }

export const appApi: AppApi = {
  ...fallbackModule,
  LookupLinearViewer:
    (fallbackModule as AppApi).LookupLinearViewer ??
    unavailableError<Record<string, string>>('LookupLinearViewer not available'),
  GetLinearTeamLabels:
    (fallbackModule as AppApi).GetLinearTeamLabels ??
    ((async () => []) as AppApi['GetLinearTeamLabels']),
  AutoMapLinearMembers: (fallbackModule.AutoMapLinearMembers ?? (() => Promise.resolve(0))) as AppApi['AutoMapLinearMembers'],
  UpdateLinearIssue: (fallbackModule.UpdateLinearIssue ?? (() => Promise.resolve())) as AppApi['UpdateLinearIssue'],
  CheckClaudeCLI:
    fallbackModule.CheckClaudeCLI ??
    (() => Promise.resolve({ ok: false, version: '' })) as AppApi['CheckClaudeCLI'],
  ClaudeChat: (fallbackModule.ClaudeChat ?? unavailableClaudeChat) as AppApi['ClaudeChat'],
  ClaudeChatWithSession: (fallbackModule.ClaudeChatWithSession ?? unavailableClaudeChatWithSession) as AppApi['ClaudeChatWithSession'],
  ScanClaudeSkills:
    (fallbackModule as AppApi).ScanClaudeSkills ??
    unavailableError<{ skill: string; cmd: string; desc: string }[]>('ScanClaudeSkills not available'),
  GetPositionTypes:
    (fallbackModule as AppApi).GetPositionTypes ??
    ((async () => []) as AppApi['GetPositionTypes']),
  AddPositionType:
    (fallbackModule as AppApi).AddPositionType ??
    ((_: string) => Promise.resolve()) as AppApi['AddPositionType'],
  DeletePositionType:
    (fallbackModule as AppApi).DeletePositionType ??
    ((_: string) => Promise.resolve()) as AppApi['DeletePositionType'],
  GetEmploymentTypes:
    (fallbackModule as AppApi).GetEmploymentTypes ??
    (async () => []) as AppApi['GetEmploymentTypes'],
  AddEmploymentType:
    (fallbackModule as AppApi).AddEmploymentType ??
    ((_: string) => Promise.resolve()) as AppApi['AddEmploymentType'],
  DeleteEmploymentType:
    (fallbackModule as AppApi).DeleteEmploymentType ??
    ((_: string) => Promise.resolve()) as AppApi['DeleteEmploymentType'],
  GetSIProjectTypes:
    (fallbackModule as AppApi).GetSIProjectTypes ??
    (async () => []) as AppApi['GetSIProjectTypes'],
  AddSIProjectType:
    (fallbackModule as AppApi).AddSIProjectType ??
    ((_: string) => Promise.resolve()) as AppApi['AddSIProjectType'],
  DeleteSIProjectType:
    (fallbackModule as AppApi).DeleteSIProjectType ??
    ((_: string) => Promise.resolve()) as AppApi['DeleteSIProjectType'],
  GetSIPhases:
    (fallbackModule as AppApi).GetSIPhases ??
    (async () => []) as AppApi['GetSIPhases'],
  AddSIPhase:
    (fallbackModule as AppApi).AddSIPhase ??
    ((_: string) => Promise.resolve()) as AppApi['AddSIPhase'],
  DeleteSIPhase:
    (fallbackModule as AppApi).DeleteSIPhase ??
    ((_: string) => Promise.resolve()) as AppApi['DeleteSIPhase'],
  GetReportInsights:
    (fallbackModule as AppApi).GetReportInsights ??
    unavailableError<db.ReportInsights>('GetReportInsights not available'),
  AcceptInsightActivity:
    (fallbackModule as AppApi).AcceptInsightActivity ??
    unavailableError<db.ReportItem>('AcceptInsightActivity not available'),
  AcceptInsightDraft:
    (fallbackModule as AppApi).AcceptInsightDraft ??
    unavailableError<db.ReportItem[]>('AcceptInsightDraft not available'),
  IgnoreInsightActivity:
    (fallbackModule as AppApi).IgnoreInsightActivity ??
    unavailableError<void>('IgnoreInsightActivity not available'),
}
