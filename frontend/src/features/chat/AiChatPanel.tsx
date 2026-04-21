import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, Loader2, Maximize2, MessageSquare, Minimize2, Send, X } from 'lucide-react'
import type { AiChatSession, ChatCommand, ChatMessage, ChatReference } from './types'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderInline(text: string): string {
  if (!text.includes('`')) {
    return escapeHtml(text)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
  }

  const parts = text.split('`')
  let result = ''
  for (let index = 0; index < parts.length; index++) {
    if (index % 2 === 0) {
      result += escapeHtml(parts[index])
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
    } else {
      result += `<code style="background:#cbd5e1;padding:2px 5px;border-radius:4px;font-size:0.8em;font-family:'Fira Code',monospace;color:#334155;border:1px solid #94a3b8;">${escapeHtml(parts[index])}</code>`
    }
  }
  return result
}

function renderTableBlock(lines: string[]): string {
  const header = lines[0]
  const rows = lines.slice(2)
  const headers = header.split('|').map(cell => cell.trim()).filter(Boolean)
  let html = '<table class="w-full text-xs border-collapse my-1"><thead><tr>'
  headers.forEach(cell => {
    html += `<th class="border border-slate-300 px-2 py-1 bg-slate-100 text-left font-semibold">${renderInline(cell)}</th>`
  })
  html += '</tr></thead><tbody>'
  rows.forEach(row => {
    const cells = row.split('|').map(cell => cell.trim()).filter((cell, index) => index > 0 && index <= headers.length)
    html += '<tr>'
    cells.forEach(cell => {
      html += `<td class="border border-slate-300 px-2 py-1">${renderInline(cell)}</td>`
    })
    html += '</tr>'
  })
  html += '</tbody></table>'
  return html
}

function renderMarkdown(text: string): string {
  if (!text) return ''

  const lines = text.split('\n')
  const blocks: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (line.startsWith('```')) {
      const codeLines: string[] = []
      index++
      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index])
        index++
      }
      const code = escapeHtml(codeLines.join('\n'))
      blocks.push(`<pre style="background:#f1f5f9;padding:12px;border-radius:8px;overflow-x:auto;margin:8px 0;border:1px solid #e2e8f0"><code style="font-family:'Fira Code',monospace;font-size:12px;color:#334155">${code}</code></pre>`)
      index++
      continue
    }

    if (line.startsWith('|') && index + 1 < lines.length && lines[index + 1].includes('|')) {
      const tableLines: string[] = [line]
      index++
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index])
        index++
      }
      blocks.push(renderTableBlock(tableLines))
      continue
    }

    const h1Match = line.match(/^# (.+)$/)
    const h2Match = line.match(/^## (.+)$/)
    const h3Match = line.match(/^### (.+)$/)
    if (h1Match) {
      blocks.push(`<h1 class="font-bold mt-4 mb-2 text-base">${renderInline(h1Match[1])}</h1>`)
      index++
      continue
    }
    if (h2Match) {
      blocks.push(`<h2 class="font-semibold mt-3 mb-2">${renderInline(h2Match[1])}</h2>`)
      index++
      continue
    }
    if (h3Match) {
      blocks.push(`<h3 class="font-semibold mt-2 mb-1">${renderInline(h3Match[1])}</h3>`)
      index++
      continue
    }

    const listMatch = line.match(/^\s*[-*] (.+)$/)
    if (listMatch) {
      const items: string[] = []
      while (index < lines.length) {
        const matched = lines[index].match(/^\s*[-*] (.+)$/)
        if (!matched) break
        items.push(`<li class="ml-4">${renderInline(matched[1])}</li>`)
        index++
        while (index < lines.length && lines[index].trim() === '') index++
      }
      blocks.push(`<ul class="list-disc my-1 space-y-0">${items.join('')}</ul>`)
      continue
    }

    if (line.trim()) {
      blocks.push(`<p class="my-0">${renderInline(line)}</p>`)
    }
    index++
  }

  return blocks.join('')
}

type AssistantSegmentType = 'markdown' | 'think'

interface AssistantSegment {
  type: AssistantSegmentType
  content: string
}

function splitAssistantSegments(text: string): AssistantSegment[] {
  const input = text || ''
  const segments: AssistantSegment[] = []
  const thinkPattern = /<think>([\s\S]*?)<\/think>/gi

  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = thinkPattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      const markdown = input.slice(lastIndex, match.index)
      if (markdown.trim()) {
        segments.push({ type: 'markdown', content: markdown })
      }
    }

    const thinkContent = (match[1] ?? '').trim()
    if (thinkContent) {
      segments.push({ type: 'think', content: thinkContent })
    }

    lastIndex = thinkPattern.lastIndex
  }

  if (lastIndex < input.length) {
    const rest = input.slice(lastIndex)
    if (rest.trim()) {
      segments.push({ type: 'markdown', content: rest })
    }
  }

  if (segments.length === 0) {
    return [{ type: 'markdown', content: input }]
  }

  return segments
}

function ThinkFold({ content }: { content: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="my-1 rounded-xl border border-violet-200/60 bg-violet-50/70 dark:border-violet-500/30 dark:bg-violet-500/10">
      <button
        type="button"
        aria-label={open ? '생각 과정 접기' : '생각 과정 펼치기'}
        onClick={() => setOpen(prev => !prev)}
        className="group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors duration-200 hover:bg-violet-100/70 dark:hover:bg-violet-500/20"
      >
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-200">Think</span>
          <span className="text-[10px] text-violet-500 dark:text-violet-300/80">
            {open ? '클릭해서 접기' : '클릭해서 펼치기'}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-violet-500 transition-transform duration-300 ease-out dark:text-violet-300 ${open ? 'rotate-180' : 'rotate-0'}`}
        />
      </button>

      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="mx-2 mb-2 rounded-lg border border-violet-100 bg-white/70 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:border-violet-500/20 dark:bg-slate-900/60 dark:text-slate-300">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function AssistantMessageContent({ content }: { content: string }) {
  const segments = splitAssistantSegments(content)

  return (
    <div className="space-y-1">
      {segments.map((segment, index) => {
        if (segment.type === 'think') {
          return <ThinkFold key={`think-${index}`} content={segment.content} />
        }
        return (
          <div
            key={`markdown-${index}`}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(segment.content) }}
          />
        )
      })}
    </div>
  )
}

function renderReferences(references: ChatReference[]) {
  if (!references.length) return null

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white/70 p-2 text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-900/60">
      <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">참고 문서</p>
      <div className="space-y-1">
        {references.map(reference => (
          <div key={reference.id} className="rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/80">
            <p className="font-medium text-slate-700 dark:text-slate-200">{reference.path}</p>
            <p className="text-slate-500 dark:text-slate-400">{reference.snippet}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function providerLabel(provider: string): string {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'minimax') return 'MiniMax'
  if (provider === 'claude_cli') return 'Claude CLI'
  return provider
}

export interface AiChatPanelProps {
  session: AiChatSession
  title: string
  subtitle: string
  buttonLabel: string
  badgeCount?: number
  suggestions?: string[]
  commands?: ChatCommand[]
  allowUnknownSlashPassthrough?: boolean
}

export function AiChatPanel({
  session,
  title,
  subtitle,
  buttonLabel,
  badgeCount,
  suggestions = [],
  commands = [],
  allowUnknownSlashPassthrough = false,
}: AiChatPanelProps) {
  const [cmdPopup, setCmdPopup] = useState(false)
  const [cmdIndex, setCmdIndex] = useState(0)
  const cmdListRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const trimmedInput = session.input.trim()
  const normalizedInput = trimmedInput.toLowerCase()
  const commandQuery = normalizedInput.startsWith('/')
    ? normalizedInput.split(/\s+/, 1)[0]
    : ''

  const filteredCommands = commandQuery
    ? commands.filter(command => command.cmd.startsWith(commandQuery))
    : []
  const panelInset = 12

  function findMatchingCommand(rawInput: string) {
    const normalized = rawInput.toLowerCase()
    return (
      commands.find(command => command.cmd === normalized) ??
      commands.find(command => normalized.startsWith(`${command.cmd} `))
    )
  }

  function getSelectedCommand() {
    if (!cmdPopup || filteredCommands.length === 0) {
      return null
    }

    return filteredCommands[cmdIndex] ?? filteredCommands[0] ?? null
  }

  function appendAssistantMessage(content: string) {
    session.setMessages(prev => [...prev, { role: 'assistant', content }])
  }

  async function runCommand(command: ChatCommand, rawInput: string) {
    setCmdPopup(false)
    try {
      const executed = await Promise.resolve().then(() => command.run(rawInput))
      if (executed && !command.keepInput) {
        session.setInput('')
      }
    } catch (error: any) {
      appendAssistantMessage(`Command failed: ${error?.message ?? String(error)}`)
    }
    textareaRef.current?.focus()
  }

  async function runSendText(rawInput: string) {
    const sent = await session.handleSendText(rawInput)
    if (sent) {
      session.setInput('')
    }
    textareaRef.current?.focus()
  }

  useEffect(() => {
    const shouldOpen = session.input.startsWith('/') && commands.length > 0 && filteredCommands.length > 0
    setCmdPopup(shouldOpen)
    if (shouldOpen) {
      setCmdIndex(0)
    }
  }, [commands.length, filteredCommands.length, session.input])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages, session.sending])

  useEffect(() => {
    if (!session.open) return
    const handle = requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
    return () => cancelAnimationFrame(handle)
  }, [session.open])

  async function handleSend() {
    const trimmed = trimmedInput
    if (!trimmed || session.sending) return

    const matchedCommand = getSelectedCommand() ?? findMatchingCommand(trimmed)
    if (matchedCommand) {
      await runCommand(matchedCommand, trimmed)
      return
    }

    setCmdPopup(false)
    if (trimmed.startsWith('/') && commands.length > 0) {
      if (allowUnknownSlashPassthrough && session.effectiveProvider === 'claude_cli' && session.claudeAvailable) {
        await session.handleClaudeSkill(trimmed)
        session.setInput('')
        textareaRef.current?.focus()
        return
      }

      appendAssistantMessage(`알 수 없는 명령어: \`${trimmed}\`\n\n\`/\` 를 입력하면 사용 가능한 명령어를 볼 수 있어요.`)
      textareaRef.current?.focus()
      return
    }

    await runSendText(trimmed)
  }

  if (!session.open) {
    return (
      <button
        type="button"
        onClick={() => session.setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-white shadow-lg transition-all duration-200 hover:bg-violet-700"
      >
        <MessageSquare size={16} />
        <span className="text-sm font-medium">{buttonLabel}</span>
        {typeof badgeCount === 'number' && (
          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] leading-none text-white">{badgeCount}</span>
        )}
      </button>
    )
  }

  const placeholder = commands.length > 0 ? '질문을 입력하거나 / 로 명령어를 선택하세요' : '지식 베이스에 대해 질문해보세요'

  return (
    <div
      className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[var(--color-card)]"
      style={{
        transition: 'top 0.35s cubic-bezier(0.4, 0, 0.2, 1), right 0.35s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        top: session.maximized ? 16 : 'auto',
        right: session.maximized ? 16 : panelInset,
        bottom: session.maximized ? 16 : panelInset,
        left: session.maximized ? 16 : 'auto',
        width: session.maximized ? 'calc(100vw - 32px)' : `min(480px, calc(100vw - ${panelInset * 2}px))`,
        height: session.maximized ? 'calc(100vh - 32px)' : `min(680px, calc(100vh - ${panelInset * 2}px))`,
        animation: session.open ? (session.maximized ? 'fadeIn 0.25s ease-out' : 'slideUp 0.25s ease-out') : undefined,
      }}
    >
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-slate-100 px-4 pt-3 pb-0 dark:border-slate-700">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20">
                <Bot size={14} className="text-violet-600 dark:text-violet-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                {providerLabel(session.effectiveProvider)}
              </span>
              <span
                style={{ fontFamily: "'Fira Code', monospace" }}
                className="max-w-[140px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                title={session.effectiveModel}
              >
                {session.effectiveModel || '-'}
              </span>
              <button
                type="button"
                onClick={session.toggleMaximized}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                {session.maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => session.setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-3 pb-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              기본 설정: {providerLabel(session.globalProvider)} / {session.globalModel || '-'}
            </span>
            {session.canOverride && (
              <label className="inline-flex items-center gap-1.5">
                <input
                  aria-label="채팅 오버라이드 사용"
                  type="checkbox"
                  checked={session.overrideEnabled}
                  onChange={event => session.setOverrideEnabled(event.target.checked)}
                />
                채팅 오버라이드 사용
              </label>
            )}
          </div>

          {session.canOverride && session.overrideEnabled && (
            <div className="mb-2 grid grid-cols-1 gap-2 pb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                채팅 제공자
                <select
                  aria-label="채팅 제공자"
                  value={session.chatProvider}
                  onChange={event => session.setChatProvider(event.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {session.availableProviders.map(provider => (
                    <option key={provider} value={provider}>
                      {providerLabel(provider)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                채팅 모델
                <input
                  aria-label="채팅 모델"
                  value={session.chatModel}
                  onChange={event => session.setChatModel(event.target.value)}
                  placeholder="모델 이름"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </label>
            </div>
          )}
        </div>

        {session.effectiveProvider === 'claude_cli' && session.claudeMeta && (
          <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-violet-100 bg-violet-50 px-3 py-1.5 dark:border-violet-500/20 dark:bg-violet-500/10">
            <span
              style={{ fontFamily: "'Fira Code', monospace" }}
              className="max-w-[140px] truncate rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600 dark:bg-violet-500/20 dark:text-violet-300"
              title={session.claudeMeta.model}
            >
              {session.claudeMeta.model || '-'}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500">turn {Math.ceil(session.messages.length / 2)}</span>
            <span style={{ fontFamily: "'Fira Code', monospace" }} className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
              in {session.cumInputTokens.toLocaleString()}
            </span>
            <span style={{ fontFamily: "'Fira Code', monospace" }} className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
              out {session.cumOutputTokens.toLocaleString()}
            </span>
            <span className="ml-auto text-[9px] text-slate-400 dark:text-slate-500">${session.cumCostUsd.toFixed(4)}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {session.messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-500/20">
                <Bot size={22} className="text-violet-500 dark:text-violet-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
              </div>
              {suggestions.length > 0 && (
                <div className="flex w-full flex-col gap-1.5">
                  {suggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => session.setInput(suggestion)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {session.messages.map((message: ChatMessage, index) => (
            <div key={index} className="space-y-2">
              <div className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {message.role === 'assistant' && (
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20">
                    <Bot size={11} className="text-violet-600 dark:text-violet-300" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'rounded-tr-sm bg-violet-600 text-white'
                      : 'rounded-tl-sm bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <AssistantMessageContent content={message.content} />
                  ) : (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderInline(message.content).replace(/\n/g, '<br/>'),
                      }}
                    />
                  )}
                </div>
              </div>
              {message.role === 'assistant' && message.references?.length ? (
                <div className="ml-8 max-w-[80%]">
                  {renderReferences(message.references)}
                </div>
              ) : null}
            </div>
          ))}

          {session.sending && (
            <div className="flex gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20">
                <Bot size={11} className="text-violet-600 dark:text-violet-300" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 dark:bg-slate-800">
                <Loader2 size={14} className="animate-spin text-slate-400 dark:text-slate-500" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-3 dark:border-slate-700">
          {commands.length > 0 && cmdPopup && filteredCommands.length > 0 && (
            <div ref={cmdListRef} className="mb-2 max-h-52 overflow-y-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-[var(--color-card)]">
              <div className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[9px] tracking-wide text-slate-400 dark:text-slate-500">슬래시 명령어</p>
              </div>
              {filteredCommands.map((command, idx) => (
                <button
                  key={command.cmd}
                  type="button"
                  data-idx={idx}
                  onMouseDown={event => {
                    event.preventDefault()
                    void runCommand(command, trimmedInput || command.cmd)
                  }}
                  onMouseEnter={() => setCmdIndex(idx)}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                    idx === cmdIndex ? 'bg-violet-50 dark:bg-violet-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span
                    style={{ fontFamily: "'Fira Code', monospace" }}
                    className={`w-36 shrink-0 truncate text-[11px] font-semibold ${idx === cmdIndex ? 'text-violet-700 dark:text-violet-300' : 'text-violet-500 dark:text-violet-400'}`}
                  >
                    {command.cmd}
                  </span>
                  <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">{command.desc}</span>
                  <ChevronDown size={12} className="ml-auto text-slate-300" />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={session.input}
              onChange={event => session.setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  setCmdPopup(false)
                  return
                }
                if (commands.length > 0 && cmdPopup && filteredCommands.length > 0) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    const next = (cmdIndex + 1) % filteredCommands.length
                    setCmdIndex(next)
                    cmdListRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' })
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    const prev = (cmdIndex - 1 + filteredCommands.length) % filteredCommands.length
                    setCmdIndex(prev)
                    cmdListRef.current?.querySelector(`[data-idx="${prev}"]`)?.scrollIntoView({ block: 'nearest' })
                    return
                  }
                  if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                    event.preventDefault()
                    const command = filteredCommands[cmdIndex]
                    void runCommand(command, trimmedInput || command.cmd)
                    return
                  }
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSend()
                }
              }}
              placeholder={placeholder}
              rows={1}
              className="max-h-24 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => { void handleSend() }}
              disabled={session.sending || !session.input.trim()}
              className="shrink-0 rounded-xl bg-violet-600 p-2 text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-slate-300 dark:text-slate-500">
            {commands.length > 0 ? '/ 를 입력하면 명령어를 볼 수 있어요' : '읽기 전용 채팅'}
          </p>
        </div>
      </div>
    </div>
  )
}
