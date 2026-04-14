import { useCallback, useEffect, useState } from 'react'
import { reportInsightService } from '../services/reportInsightService'
import { db } from '../../wailsjs/go/models'

export function useReportInsights(reportId: number | null) {
  const [insights, setInsights] = useState<db.ReportInsights | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!reportId) {
      setInsights(null)
      return
    }
    setLoading(true)
    try {
      const data = await reportInsightService.getInsights(reportId)
      setInsights(new db.ReportInsights({
        ...data,
        summary: data?.summary ?? {
          totalActivities: 0,
          linkedActivities: 0,
          unlinkedActivities: 0,
          needsReview: 0,
        },
        unlinkedActivities: data?.unlinkedActivities ?? [],
        draftCandidates: data?.draftCandidates ?? [],
        needsReview: data?.needsReview ?? [],
      }))
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const acceptActivity = useCallback(
    async (activityId: number, section: string, category = '', period = 'this_week') => {
      if (!reportId) return null
      const item = await reportInsightService.acceptActivity(reportId, activityId, section, category, period)
      await refresh()
      return item
    },
    [refresh, reportId],
  )

  const acceptDraft = useCallback(
    async (draft: db.ReportInsightDraft, period = 'this_week') => {
      if (!reportId) return []
      const items = await reportInsightService.acceptDraft(reportId, draft, period)
      await refresh()
      return items
    },
    [refresh, reportId],
  )

  const ignoreActivity = useCallback(
    async (activityId: number) => {
      if (!reportId) return
      await reportInsightService.ignoreActivity(reportId, activityId)
      await refresh()
    },
    [refresh, reportId],
  )

  return { insights, loading, refresh, acceptActivity, acceptDraft, ignoreActivity }
}
