import { appApi } from './appApi'
import type { db } from '../../wailsjs/go/models'

export const reportInsightService = {
  getInsights: (reportId: number) => appApi.GetReportInsights(reportId),
  acceptActivity: (reportId: number, activityId: number, section: string, category: string, period: string) =>
    appApi.AcceptInsightActivity(reportId, activityId, section, category, period),
  acceptDraft: (reportId: number, draft: db.ReportInsightDraft, period: string) =>
    appApi.AcceptInsightDraft(reportId, draft, period),
  ignoreActivity: (reportId: number, activityId: number) =>
    appApi.IgnoreInsightActivity(reportId, activityId),
}
