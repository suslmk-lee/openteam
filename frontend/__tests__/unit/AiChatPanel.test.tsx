// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AiChatPanel } from '../../src/features/chat/AiChatPanel'
import type { AiChatSession, ChatMessage } from '../../src/features/chat/types'

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

function renderPanel(options?: {
  allowUnknownSlashPassthrough?: boolean
  chatModel?: 'claude' | 'openai'
  claudeAvailable?: boolean
}) {
  const handleSendText = vi.fn(async () => true)
  const handleClaudeSkill = vi.fn(async () => {})

  function Harness() {
    const [open, setOpen] = useState(true)
    const [maximized, setMaximized] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')

    const session: AiChatSession = {
      open,
      setOpen,
      maximized,
      toggleMaximized: () => setMaximized(prev => !prev),
      messages,
      setMessages,
      sending: false,
      input,
      setInput,
      apiKey: 'test-key',
      setApiKey: vi.fn(),
      keyLoaded: true,
      chatModel: options?.chatModel ?? 'claude',
      setChatModel: vi.fn(),
      claudeAvailable: options?.claudeAvailable ?? true,
      claudeSessionID: '',
      setClaudeSessionID: vi.fn(),
      claudeMeta: null,
      setClaudeMeta: vi.fn(),
      cumInputTokens: 0,
      cumOutputTokens: 0,
      cumCostUsd: 0,
      setCumInputTokens: vi.fn(),
      setCumOutputTokens: vi.fn(),
      setCumCostUsd: vi.fn(),
      showKeyInput: false,
      setShowKeyInput: vi.fn(),
      localKeyInput: '',
      setLocalKeyInput: vi.fn(),
      saveKey: vi.fn(),
      handleSendText,
      handleClaudeSkill,
      clearSession: vi.fn(),
    }

    return (
      <AiChatPanel
        session={session}
        title="Test Chat"
        subtitle="Test subtitle"
        buttonLabel="Open"
        commands={[
          {
            cmd: '/summary',
            desc: 'Summarize items',
            run: vi.fn(() => true),
          },
        ]}
        allowUnknownSlashPassthrough={options?.allowUnknownSlashPassthrough}
      />
    )
  }

  render(<Harness />)
  return { handleSendText, handleClaudeSkill }
}

describe('AiChatPanel', () => {
  it('shows guidance for unknown slash commands by default', async () => {
    const { handleClaudeSkill } = renderPanel()

    const textarea = screen.getByPlaceholderText('Ask a question or type / for commands')

    fireEvent.change(textarea, {
      target: { value: '/unknown' },
    })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await screen.findByText(/Unknown command:/)
    expect(handleClaudeSkill).not.toHaveBeenCalled()
  })

  it('passes unknown slash commands through to Claude when enabled', async () => {
    const { handleClaudeSkill } = renderPanel({ allowUnknownSlashPassthrough: true })

    const textarea = screen.getByPlaceholderText('Ask a question or type / for commands')

    fireEvent.change(textarea, {
      target: { value: '/unknown task command' },
    })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(handleClaudeSkill).toHaveBeenCalledWith('/unknown task command')
    })
    expect(screen.queryByText(/Unknown command:/)).toBeNull()
  })
})
