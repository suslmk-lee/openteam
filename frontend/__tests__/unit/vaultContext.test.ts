import { describe, expect, it, vi } from 'vitest'
import { buildVaultChatContext } from '../../src/features/chat/providers/vaultContext'

describe('buildVaultChatContext', () => {
  it('truncates large reference content while preserving ui references', async () => {
    const retrieveVaultContext = vi.fn(async () => [
      {
        path: 'notes/alpha.md',
        title: 'Alpha',
        snippet: 'Alpha snippet',
        content: `${'A'.repeat(9000)} tail-alpha`,
      },
      {
        path: 'notes/beta.md',
        title: 'Beta',
        snippet: 'Beta snippet',
        content: `${'B'.repeat(9000)} tail-beta`,
      },
    ])

    const context = await buildVaultChatContext('alpha', retrieveVaultContext)

    expect(retrieveVaultContext).toHaveBeenCalledWith('alpha', 7)
    expect(context.references).toEqual([
      {
        id: '1',
        title: 'Alpha',
        path: 'notes/alpha.md',
        snippet: 'Alpha snippet',
      },
      {
        id: '2',
        title: 'Beta',
        path: 'notes/beta.md',
        snippet: 'Beta snippet',
      },
    ])
    expect(context.contextText).toContain('[1] notes/alpha.md')
    expect(context.contextText).toContain('[2] notes/beta.md')
    expect(context.contextText).not.toContain('tail-alpha')
    expect(context.contextText).not.toContain('tail-beta')
    expect(context.contextText.length).toBeLessThan(10000)
  })
})
