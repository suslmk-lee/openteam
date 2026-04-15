import { useEffect, useState } from 'react'
import { useAppApi } from '../../hooks/useAppApi'
import type { AiChatSession, ChatContextProvider, ChatMessage, ChatModel, ClaudeMeta } from './types'

const OPENAI_MODEL = 'gpt-4o-mini'

function combineContext(systemPrompt: string, contextText: string) {
  return [systemPrompt.trim(), contextText.trim()].filter(Boolean).join('\n\n')
}

export function useAiChatSession(contextProvider: ChatContextProvider): AiChatSession {
  const appApi = useAppApi()
  const { CheckClaudeCLI, ClaudeChatWithSession, GetIntegrations } = appApi

  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [apiKey, setApiKeyState] = useState('')
  const [keyLoaded, setKeyLoaded] = useState(false)
  const [chatModel, setChatModel] = useState<ChatModel>('openai')
  const [claudeAvailable, setClaudeAvailable] = useState(false)
  const [claudeSessionID, setClaudeSessionID] = useState('')
  const [claudeMeta, setClaudeMeta] = useState<ClaudeMeta | null>(null)
  const [cumInputTokens, setCumInputTokens] = useState(0)
  const [cumOutputTokens, setCumOutputTokens] = useState(0)
  const [cumCostUsd, setCumCostUsd] = useState(0)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [localKeyInput, setLocalKeyInput] = useState('')

  function setApiKey(key: string) {
    setApiKeyState(key)
    if (typeof window !== 'undefined') {
      localStorage.setItem('openai_api_key', key)
    }
  }

  function saveKey() {
    setApiKey(localKeyInput.trim())
    setLocalKeyInput('')
    setShowKeyInput(false)
  }

  function clearSession() {
    setMessages([])
    setInput('')
    setClaudeSessionID('')
    setClaudeMeta(null)
    setCumInputTokens(0)
    setCumOutputTokens(0)
    setCumCostUsd(0)
    setShowKeyInput(false)
    setLocalKeyInput('')
  }

  function toggleMaximized() {
    setMaximized(prev => !prev)
  }

  useEffect(() => {
    CheckClaudeCLI()
      .then(result => {
        if (result.ok) {
          setClaudeAvailable(true)
          setChatModel('claude')
        }
      })
      .catch(() => {})
  }, [CheckClaudeCLI])

  useEffect(() => {
    GetIntegrations()
      .then((integrations: any[]) => {
        const openAIIntegration = integrations?.find((item: any) => item.toolType === 'openai')
        if (openAIIntegration?.enabled && openAIIntegration.configJson) {
          try {
            const config = JSON.parse(openAIIntegration.configJson)
            if (config.apiKey) {
              setApiKey(config.apiKey)
              setKeyLoaded(true)
              return
            }
          } catch {
            // fall through to localStorage
          }
        }

        const stored = typeof window !== 'undefined' ? localStorage.getItem('openai_api_key') || '' : ''
        setApiKey(stored)
        setKeyLoaded(true)
      })
      .catch(() => {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('openai_api_key') || '' : ''
        setApiKey(stored)
        setKeyLoaded(true)
      })
  }, [GetIntegrations])

  async function handleClaudeSkill(cmd: string) {
    const userMsg: ChatMessage = { role: 'user', content: cmd }
    setMessages(prev => [...prev, userMsg])
    setSending(true)
    try {
      const res = await ClaudeChatWithSession(cmd, '', claudeSessionID)
      if (res.sessionId) setClaudeSessionID(res.sessionId)
      setClaudeMeta({
        model: res.model,
        numTurns: res.numTurns,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        cacheReadTokens: res.cacheReadTokens,
        cacheCreateTokens: res.cacheCreateTokens,
        costUsd: res.costUsd,
      })
      setCumInputTokens(prev => prev + res.inputTokens)
      setCumOutputTokens(prev => prev + res.outputTokens)
      setCumCostUsd(prev => prev + res.costUsd)
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }])
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error?.message ?? String(error)}` }])
    } finally {
      setSending(false)
    }
  }

  async function handleSendText(text: string): Promise<boolean> {
    const trimmed = text.trim()
    if (!trimmed || sending) return false
    if (chatModel === 'openai' && !apiKey) {
      setShowKeyInput(true)
      return false
    }

    setShowKeyInput(false)
    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setSending(true)

    try {
      const context = await contextProvider(trimmed)
      const combinedContext = combineContext(context.systemPrompt, context.contextText)
      let reply = ''

      if (chatModel === 'claude') {
        // Always pass retrieval context per turn so resumed Claude sessions stay grounded.
        const ctx = combinedContext
        const res = await ClaudeChatWithSession(trimmed, ctx, claudeSessionID)
        if (res.sessionId) setClaudeSessionID(res.sessionId)
        setClaudeMeta({
          model: res.model,
          numTurns: res.numTurns,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          cacheReadTokens: res.cacheReadTokens,
          cacheCreateTokens: res.cacheCreateTokens,
          costUsd: res.costUsd,
        })
        setCumInputTokens(prev => prev + res.inputTokens)
        setCumOutputTokens(prev => prev + res.outputTokens)
        setCumCostUsd(prev => prev + res.costUsd)
        reply = res.reply
      } else {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
              { role: 'system', content: combinedContext },
              ...nextMessages.map(message => ({ role: message.role, content: message.content })),
            ],
            max_tokens: 1024,
          }),
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err?.error?.message || `HTTP ${response.status}`)
        }

        const data = await response.json()
        reply = data.choices?.[0]?.message?.content || '(no response)'
      }

      setMessages(prev => [...prev, { role: 'assistant', content: reply, references: context.references }])
      return true
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error?.message ?? String(error)}` }])
      return false
    } finally {
      setSending(false)
    }
  }

  return {
    open,
    setOpen,
    maximized,
    toggleMaximized,
    messages,
    setMessages,
    sending,
    input,
    setInput,
    apiKey,
    setApiKey,
    keyLoaded,
    chatModel,
    setChatModel,
    claudeAvailable,
    claudeSessionID,
    setClaudeSessionID,
    claudeMeta,
    setClaudeMeta,
    cumInputTokens,
    cumOutputTokens,
    cumCostUsd,
    setCumInputTokens,
    setCumOutputTokens,
    setCumCostUsd,
    showKeyInput,
    setShowKeyInput,
    localKeyInput,
    setLocalKeyInput,
    saveKey,
    handleSendText,
    handleClaudeSkill,
    clearSession,
  }
}
