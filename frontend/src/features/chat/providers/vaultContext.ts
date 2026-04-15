import type { ChatContext } from '../types'
import type { VaultReference } from '../../../services/appApi'

type RetrieveVaultContextFn = (query: string, limit: number) => Promise<VaultReference[]>

const MAX_REFERENCE_CONTEXT_CHARS = 3000
const MAX_TOTAL_CONTEXT_CHARS = 9000
const TRUNCATION_MARKER = '\n...[truncated]'

function truncateReferenceContent(content: string, maxChars: number): string {
  const normalized = content.trim()
  if (normalized.length <= maxChars) {
    return normalized
  }
  if (maxChars <= TRUNCATION_MARKER.length) {
    return normalized.slice(0, maxChars)
  }

  return `${normalized.slice(0, maxChars - TRUNCATION_MARKER.length).trimEnd()}${TRUNCATION_MARKER}`
}

export async function buildVaultChatContext(query: string, retrieveVaultContext: RetrieveVaultContextFn): Promise<ChatContext> {
  const references = await retrieveVaultContext(query, 7)
  let usedChars = 0
  const contextParts: string[] = []

  for (const [index, reference] of references.entries()) {
    const separator = contextParts.length > 0 ? '\n\n' : ''
    const heading = `[${index + 1}] ${reference.path}\n`
    const remainingChars = MAX_TOTAL_CONTEXT_CHARS - usedChars - separator.length - heading.length
    if (remainingChars <= 0) {
      break
    }

    const content = truncateReferenceContent(reference.content, Math.min(MAX_REFERENCE_CONTEXT_CHARS, remainingChars))
    if (!content) {
      continue
    }

    const section = `${heading}${content}`
    contextParts.push(section)
    usedChars += separator.length + section.length
  }

  const contextText = contextParts.join('\n\n')

  return {
    systemPrompt: [
      'You are a read-only Knowledge Base assistant.',
      'Answer only from the retrieved Vault documents.',
      'Use inline citations like [1], [2] tied to the provided references for every key claim.',
      'If the retrieved context is insufficient, explicitly say what is missing instead of guessing.',
      'Do not suggest file edits, file creation, or destructive actions.',
    ].join(' '),
    contextText,
    references: references.map((reference, index) => ({
      id: String(index + 1),
      title: reference.title || reference.path,
      path: reference.path,
      snippet: reference.snippet,
    })),
  }
}
