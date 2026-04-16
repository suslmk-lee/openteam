import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from '../../hooks/useAppApi'
import type { AIProviderID, AISettings } from '../../services/appApi'
import type { AiChatSession, ChatContextProvider, ChatMessage, ChatProvider, ClaudeMeta } from './types'

const DEFAULT_PROVIDER: ChatProvider = 'openai'
const DEFAULT_MODEL = 'gpt-4o-mini'
const PROVIDER_ORDER: ChatProvider[] = ['openai', 'minimax', 'claude_cli']

function normalizeProvider(raw: string): ChatProvider {
  if (raw === 'openai' || raw === 'minimax' || raw === 'claude_cli') {
    return raw
  }
  return DEFAULT_PROVIDER
}

function providerModel(settings: AISettings, provider: ChatProvider): string {
  return settings.providers?.[provider]?.model?.trim() || DEFAULT_MODEL
}

function listAvailableProviders(settings: AISettings, claudeAvailable: boolean): ChatProvider[] {
  const providers: ChatProvider[] = []
  for (const provider of PROVIDER_ORDER) {
    const enabled = Boolean(settings.providers?.[provider]?.enabled)
    if (!enabled) {
      continue
    }
    if (provider === 'claude_cli' && !claudeAvailable) {
      continue
    }
    providers.push(provider)
  }
  if (providers.length > 0) {
    return providers
  }
  return [normalizeProvider(settings.defaultProvider || DEFAULT_PROVIDER)]
}

function combineContext(systemPrompt: string, contextText: string, historyText: string) {
  return [systemPrompt.trim(), contextText.trim(), historyText.trim()].filter(Boolean).join('\n\n')
}

function buildConversationContext(history: ChatMessage[]) {
  const recent = history.slice(-8)
  if (recent.length === 0) return ''

  const lines = recent.map(message => {
    const role = message.role === 'user' ? 'User' : 'Assistant'
    return `${role}: ${message.content}`
  })
  return ['Conversation history (recent turns):', ...lines].join('\n')
}

function fallbackSettings(): AISettings {
  return {
    defaultProvider: DEFAULT_PROVIDER,
    policy: {
      chatAllowOverride: true,
    },
    providers: {
      openai: { enabled: true, model: DEFAULT_MODEL, baseUrl: 'https://api.openai.com/v1', mode: 'openai_compatible' },
      minimax: { enabled: false, model: '', baseUrl: 'https://api.minimax.io/v1', mode: 'openai_compatible' },
      claude_cli: { enabled: false, model: '', baseUrl: '', mode: 'local_cli' },
    },
  }
}

export function useAiChatSession(contextProvider: ChatContextProvider): AiChatSession {
  const appApi = useAppApi()
  const { CheckClaudeCLI, ClaudeChatWithSession, GetAISettings, ChatWithAI } = appApi

  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')

  const [globalProvider, setGlobalProvider] = useState<ChatProvider>(DEFAULT_PROVIDER)
  const [globalModel, setGlobalModel] = useState(DEFAULT_MODEL)
  const [chatProvider, setChatProviderState] = useState<ChatProvider>(DEFAULT_PROVIDER)
  const [chatModel, setChatModel] = useState(DEFAULT_MODEL)
  const [availableProviders, setAvailableProviders] = useState<ChatProvider[]>([DEFAULT_PROVIDER])
  const [canOverride, setCanOverride] = useState(true)
  const [overrideEnabled, setOverrideEnabled] = useState(false)

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

  const effectiveProvider = useMemo<ChatProvider>(() => {
    if (canOverride && overrideEnabled) {
      return chatProvider
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
    if (!canOverride || !overrideEnabled) {
      setChatProviderState(globalProvider)
      setChatModel(globalModel)
      return
    }
    if (!availableProviders.includes(chatProvider)) {
      setChatProviderState(globalProvider)
      setChatModel(globalModel)
    }
  }, [availableProviders, canOverride, chatProvider, globalModel, globalProvider, overrideEnabled])

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

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const history = [...messages, userMsg]
    setMessages(history)
    setSending(true)

    try {
      const context = await contextProvider(trimmed)
      const historyContext = buildConversationContext(messages)
      const combinedContext = combineContext(context.systemPrompt, context.contextText, historyContext)

      const response = await ChatWithAI(
        trimmed,
        combinedContext,
        canOverride && overrideEnabled ? chatProvider : '',
        canOverride && overrideEnabled ? chatModel : '',
      )

      setMessages(prev => [...prev, { role: 'assistant', content: response.reply || '(no response)', references: context.references }])
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
