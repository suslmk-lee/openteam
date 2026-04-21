import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from '../../hooks/useAppApi'
import type { AIProviderID, AISettings } from '../../services/appApi'
import type { AiChatSession, ChatContextProvider, ChatMessage, ChatProvider, ClaudeMeta } from './types'

function combineContext(systemPrompt: string, contextText: string) {
  return [systemPrompt.trim(), contextText.trim()].filter(Boolean).join('\n\n')
}

export function useAiChatSession(contextProvider: ChatContextProvider): AiChatSession {
  const appApi = useAppApi()
  const { CheckClaudeCLI, ClaudeChatWithSession, GetIntegrations, OpenAIChatWithMessages, MiniMaxChatWithMessages } = appApi

  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [apiKey, setApiKeyState] = useState('')
  const [openAIApiKey, setOpenAIApiKey] = useState('')
  const [miniMaxApiKey, setMiniMaxApiKey] = useState('')
  const [keyLoaded, setKeyLoaded] = useState(false)
  const [chatModel, setChatModel] = useState<ChatModel>('openai')
  const [claudeAvailable, setClaudeAvailable] = useState(false)
  const [claudeSessionID, setClaudeSessionID] = useState('')
  const [claudeMeta, setClaudeMeta] = useState<ClaudeMeta | null>(null)
  const [cumInputTokens, setCumInputTokens] = useState(0)
  const [cumOutputTokens, setCumOutputTokens] = useState(0)
  const [cumCostUsd, setCumCostUsd] = useState(0)
  const [providerDefaults, setProviderDefaults] = useState<Record<AIProviderID, string>>({
    openai: DEFAULT_MODEL,
    minimax: DEFAULT_MODEL,
    claude_cli: '',
  })

  function setApiKey(key: string) {
    setApiKeyState(key)
    if (typeof window !== 'undefined') {
      if (chatModel === 'minimax') {
        setMiniMaxApiKey(key)
        localStorage.setItem('minimax_api_key', key)
      } else {
        setOpenAIApiKey(key)
        localStorage.setItem('openai_api_key', key)
      }
    }
    return globalProvider
  }, [canOverride, overrideEnabled, chatProvider, globalProvider])

  const effectiveModel = useMemo(() => {
    if (canOverride && overrideEnabled) {
      return chatModel
    }
    return globalModel
  }, [canOverride, overrideEnabled, chatModel, globalModel])

  function setChatProvider(provider: ChatProvider) {
    setChatProviderState(provider)
    const fallback = providerDefaults[provider] || DEFAULT_MODEL
    setChatModel(fallback)
  }

  function clearSession() {
    setMessages([])
    setInput('')
    setClaudeSessionID('')
    setClaudeMeta(null)
    setCumInputTokens(0)
    setCumOutputTokens(0)
    setCumCostUsd(0)
  }

  function toggleMaximized() {
    setMaximized(prev => !prev)
  }

  useEffect(() => {
    let cancelled = false

    async function loadAISettings() {
      let hasClaudeCLI = false
      try {
        const result = await CheckClaudeCLI()
        hasClaudeCLI = Boolean(result.ok)
      } catch {
        hasClaudeCLI = false
      }

      let settings: AISettings
      try {
        settings = await GetAISettings()
      } catch {
        settings = fallbackSettings()
      }

      if (cancelled) return

      setClaudeAvailable(hasClaudeCLI)

      const defaults: Record<AIProviderID, string> = {
        openai: providerModel(settings, 'openai'),
        minimax: providerModel(settings, 'minimax'),
        claude_cli: providerModel(settings, 'claude_cli'),
      }
      setProviderDefaults(defaults)

      const providers = listAvailableProviders(settings, hasClaudeCLI)
      const requestedDefault = normalizeProvider(settings.defaultProvider || DEFAULT_PROVIDER)
      const nextGlobalProvider = providers.includes(requestedDefault) ? requestedDefault : providers[0]
      const nextGlobalModel = providerModel(settings, nextGlobalProvider)
      const nextCanOverride = Boolean(settings.policy?.chatAllowOverride)

      setAvailableProviders(providers)
      setGlobalProvider(nextGlobalProvider)
      setGlobalModel(nextGlobalModel)
      setCanOverride(nextCanOverride)
      setOverrideEnabled(false)
      setChatProviderState(nextGlobalProvider)
      setChatModel(nextGlobalModel)
    }

    void loadAISettings()
    return () => {
      cancelled = true
    }
  }, [CheckClaudeCLI, GetAISettings])

  useEffect(() => {
    GetIntegrations()
      .then((integrations: any[]) => {
        let openAIKey = ''
        const openAIIntegration = integrations?.find((item: any) => item.toolType === 'openai')
        if (openAIIntegration?.enabled && openAIIntegration.configJson) {
          try {
            const config = JSON.parse(openAIIntegration.configJson)
            if (config.apiKey) {
              openAIKey = String(config.apiKey)
            }
          } catch {
            // fall through to localStorage
          }
        }
        if (!openAIKey) {
          openAIKey = typeof window !== 'undefined' ? localStorage.getItem('openai_api_key') || '' : ''
        }

        let miniMaxKey = ''
        const miniMaxIntegration = integrations?.find((item: any) => item.toolType === 'minimax')
        if (miniMaxIntegration?.enabled && miniMaxIntegration.configJson) {
          try {
            const config = JSON.parse(miniMaxIntegration.configJson)
            if (config.apiKey) {
              miniMaxKey = String(config.apiKey)
            }
          } catch {
            // fall through to localStorage
          }
        }
        if (!miniMaxKey) {
          miniMaxKey = typeof window !== 'undefined' ? localStorage.getItem('minimax_api_key') || '' : ''
        }

        setOpenAIApiKey(openAIKey)
        setMiniMaxApiKey(miniMaxKey)
        setKeyLoaded(true)
      })
      .catch(() => {
        const openAIKey = typeof window !== 'undefined' ? localStorage.getItem('openai_api_key') || '' : ''
        const miniMaxKey = typeof window !== 'undefined' ? localStorage.getItem('minimax_api_key') || '' : ''
        setOpenAIApiKey(openAIKey)
        setMiniMaxApiKey(miniMaxKey)
        setKeyLoaded(true)
      })
  }, [GetIntegrations])

  useEffect(() => {
    if (chatModel === 'openai') {
      setApiKeyState(openAIApiKey)
      return
    }
    if (chatModel === 'minimax') {
      setApiKeyState(miniMaxApiKey)
      return
    }
    setApiKeyState('')
  }, [chatModel, miniMaxApiKey, openAIApiKey])

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
    if (chatModel !== 'claude' && !apiKey) {
      setShowKeyInput(true)
      return false
    }

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const history = [...messages, userMsg]
    setMessages(history)
    setSending(true)

    try {
      const context = await contextProvider(trimmed)
      const historyContext = buildConversationContext(messages)
      const combinedContext = combineContext(context.systemPrompt, context.contextText, historyContext)

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
      } else if (chatModel === 'minimax') {
        const result = await MiniMaxChatWithMessages(
          combinedContext,
          nextMessages.map(message => ({ role: message.role, content: message.content })),
        )
        setCumInputTokens(prev => prev + (result.inputTokens || 0))
        setCumOutputTokens(prev => prev + (result.outputTokens || 0))
        setCumCostUsd(prev => prev + (result.costUsd || 0))
        reply = result.reply || '(no response)'
      } else {
        const result = await OpenAIChatWithMessages(
          combinedContext,
          nextMessages.map(message => ({ role: message.role, content: message.content })),
        )
        setCumInputTokens(prev => prev + (result.inputTokens || 0))
        setCumOutputTokens(prev => prev + (result.outputTokens || 0))
        setCumCostUsd(prev => prev + (result.costUsd || 0))
        reply = result.reply || '(no response)'
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
    chatProvider,
    setChatProvider,
    chatModel,
    setChatModel,
    globalProvider,
    globalModel,
    effectiveProvider,
    effectiveModel,
    availableProviders,
    canOverride,
    overrideEnabled,
    setOverrideEnabled,
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
    handleSendText,
    handleClaudeSkill,
    clearSession,
  }
}
