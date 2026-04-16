import type { db } from '../../../wailsjs/go/models'

type IngestResultLike = Pick<db.IngestResult, 'status' | 'sourceType' | 'model' | 'warnings'> &
  Partial<Pick<db.IngestResult, 'elapsedMs' | 'createdPaths' | 'skillSourceDir' | 'processLogs'>>

export function formatIngestCompletionMessage(result: IngestResultLike): string {
  const lines = [
    'Ingest completed.',
    '',
    `- status: \`${result.status}\``,
    `- source type: \`${result.sourceType}\``,
    `- model: \`${result.model}\``,
  ]

  if ((result.elapsedMs ?? 0) > 0) {
    lines.push(`- elapsed: \`${result.elapsedMs}ms\``)
  }
  if ((result.skillSourceDir ?? '').trim()) {
    lines.push(`- skills: \`${result.skillSourceDir}\``)
  }

  const createdPaths = (result.createdPaths ?? []).filter(Boolean)
  if (createdPaths.length > 0) {
    lines.push('', 'Generated files:')
    for (const path of createdPaths) {
      lines.push(`- \`${path}\``)
    }
  }

  const processLogs = (result.processLogs ?? []).filter(Boolean)
  if (processLogs.length > 0) {
    lines.push('', 'Process:')
    for (const entry of processLogs) {
      lines.push(`- ${entry}`)
    }
  }

  return lines.join('\n')
}
