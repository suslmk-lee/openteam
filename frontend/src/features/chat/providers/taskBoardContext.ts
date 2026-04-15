import type { ChatContext } from '../types'

type LinearIssueLike = {
  identifier: string
  title: string
  priority: number
  state: { name: string }
  assignee?: { name?: string }
  project?: { name?: string } | null
  labels?: { nodes: Array<{ name: string }> }
}

const PRIORITY_LABELS = ['None', 'Urgent', 'High', 'Normal', 'Low']

export async function buildTaskBoardChatContext(_query: string, issues: LinearIssueLike[]): Promise<ChatContext> {
  const summary = (issues || []).slice(0, 30).map(issue => {
    const labels = issue.labels?.nodes.map(label => label.name).join(', ') || ''
    const project = issue.project?.name || ''
    const assignee = issue.assignee?.name || ''
    const parts = [
      `[${issue.identifier}] ${issue.title}`,
      `state: ${issue.state?.name || 'Unknown'}`,
      `priority: ${PRIORITY_LABELS[issue.priority] || issue.priority}`,
    ]
    if (labels) parts.push(`labels: ${labels}`)
    if (project) parts.push(`project: ${project}`)
    if (assignee) parts.push(`assignee: ${assignee}`)
    return parts.join(' | ')
  }).join('\n')

  return {
    systemPrompt: [
      'You are a Linear taskboard assistant.',
      'Answer only from the issue context below.',
      'Use the issue summary as the source of truth.',
    ].join(' '),
    contextText: `Current issues (${(issues || []).length} total, first 30 shown):\n${summary}`,
    references: [],
  }
}
