import type { Dispatch, SetStateAction } from 'react'

export type ChatRole = 'user' | 'assistant'
export type ChatModel = 'openai' | 'claude' | 'minimax'

export interface ChatReference {
  id: string
  title: string
  path: string
  snippet: string
}

export interface ChatMessage {
  role: ChatRole
  content: string
  references?: ChatReference[]
}

export interface ChatContext {
  systemPrompt: string
  contextText: string
  references: ChatReference[]
}

export type ChatContextProvider = (query: string) => Promise<ChatContext>

export interface ClaudeMeta {
  model: string
  numTurns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  costUsd: number
}

export interface ChatCommand {
  cmd: string
  desc: string
  run: (rawInput?: string) => boolean | Promise<boolean>
  keepInput?: boolean
}

export interface AiChatSession {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  maximized: boolean
  toggleMaximized: () => void
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  sending: boolean
  input: string
  setInput: Dispatch<SetStateAction<string>>
  apiKey: string
  setApiKey: (key: string) => void
  keyLoaded: boolean
  chatModel: ChatModel
  setChatModel: (model: ChatModel) => void
  claudeAvailable: boolean
  claudeSessionID: string
  setClaudeSessionID: Dispatch<SetStateAction<string>>
  claudeMeta: ClaudeMeta | null
  setClaudeMeta: Dispatch<SetStateAction<ClaudeMeta | null>>
  cumInputTokens: number
  cumOutputTokens: number
  cumCostUsd: number
  setCumInputTokens: Dispatch<SetStateAction<number>>
  setCumOutputTokens: Dispatch<SetStateAction<number>>
  setCumCostUsd: Dispatch<SetStateAction<number>>
  showKeyInput: boolean
  setShowKeyInput: Dispatch<SetStateAction<boolean>>
  localKeyInput: string
  setLocalKeyInput: Dispatch<SetStateAction<string>>
  saveKey: () => void
  handleSendText: (text: string) => Promise<boolean>
  handleClaudeSkill: (cmd: string) => Promise<void>
  clearSession: () => void
}
