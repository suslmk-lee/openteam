import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Loader2, Maximize2, MessageSquare, Mic, Minimize2, Plus, Sparkles, X } from 'lucide-react'
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

function renderReferences(references: ChatReference[]) {
  if (!references.length) return null

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white/70 p-2 text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-900/60">
      <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">References</p>
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
  const [reasoningLevel, setReasoningLevel] = useState('high')
  const openAiModelLabel = 'GPT-4o mini'
  const modelDisplay = session.chatModel === 'claude'
    ? session.claudeMeta?.model || 'Claude Code'
    : openAiModelLabel

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
      if (allowUnknownSlashPassthrough && session.chatModel === 'claude' && session.claudeAvailable) {
        await session.handleClaudeSkill(trimmed)
        session.setInput('')
        textareaRef.current?.focus()
        return
      }

      appendAssistantMessage(`Unknown command: \`${trimmed}\`\n\nType \`/\` to browse available commands.`)
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

  const placeholder = commands.length > 0 ? 'Ask a question or type / for commands' : 'Ask a question about the vault'

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
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20">
                <Sparkles size={14} className="text-violet-600 dark:text-violet-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {modelDisplay}
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
        </div>

        {session.showKeyInput && (
          <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
            <p className="mb-1.5 text-xs text-amber-700 dark:text-amber-300">OpenAI API Key</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={session.localKeyInput}
                onChange={event => session.setLocalKeyInput(event.target.value)}
                placeholder="sk-..."
                className="flex-1 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-amber-500/30 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={session.saveKey}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-white hover:bg-amber-600"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {session.messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-500/20">
                <Sparkles size={22} className="text-violet-500 dark:text-violet-300" />
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
                    <Sparkles size={11} className="text-violet-600 dark:text-violet-300" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'rounded-tr-sm bg-violet-600 text-white'
                      : 'rounded-tl-sm bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: message.role === 'assistant'
                      ? renderMarkdown(message.content)
                      : renderInline(message.content).replace(/\n/g, '<br/>'),
                  }}
                />
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
                <Sparkles size={11} className="text-violet-600 dark:text-violet-300" />
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
                <p className="text-[9px] tracking-wide text-slate-400 dark:text-slate-500">Slash commands</p>
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

          <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2 shadow-sm dark:border-slate-600 dark:from-slate-900 dark:to-slate-800">
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
              rows={2}
              className="max-h-28 min-h-[44px] w-full resize-none rounded-xl border border-transparent bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-violet-300 focus:bg-white/70 dark:text-slate-100 dark:focus:border-violet-500/40 dark:focus:bg-slate-900/60"
            />

            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  title="추가 기능(준비 중)"
                  aria-label="추가 기능"
                >
                  <Plus size={14} />
                </button>

                <div className="relative">
                  <select
                    value={session.chatModel}
                    onChange={event => session.setChatModel(event.target.value as 'openai' | 'claude')}
                    className="h-7 appearance-none rounded-lg border border-slate-300 bg-white pl-2 pr-6 text-[11px] font-medium text-slate-700 outline-none transition-colors hover:bg-slate-100 focus:ring-2 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {session.claudeAvailable && <option value="claude">Claude</option>}
                    <option value="openai">OpenAI</option>
                  </select>
                  <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>

                <div className="relative">
                  <select
                    value={reasoningLevel}
                    onChange={event => setReasoningLevel(event.target.value)}
                    className="h-7 appearance-none rounded-lg border border-slate-300 bg-white pl-2 pr-6 text-[11px] font-medium text-slate-700 outline-none transition-colors hover:bg-slate-100 focus:ring-2 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    title="응답 깊이(현재 UI 전용)"
                  >
                    <option value="normal">보통</option>
                    <option value="high">높음</option>
                    <option value="very-high">매우 높음</option>
                  </select>
                  <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>

                {session.chatModel === 'openai' && session.keyLoaded && !session.apiKey && (
                  <button
                    type="button"
                    onClick={() => session.setShowKeyInput(prev => !prev)}
                    className="h-7 rounded-lg border border-amber-300 bg-amber-50 px-2 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                  >
                    API Key
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                  aria-label="음성 입력(준비 중)"
                  title="음성 입력(준비 중)"
                >
                  <Mic size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSend() }}
                  disabled={session.sending || !session.input.trim()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  aria-label="보내기"
                >
                  <ArrowUp size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
            <span>{commands.length > 0 ? 'Type / to browse commands' : 'Read-only chat'}</span>
            {session.chatModel === 'claude' && session.claudeMeta ? (
              <span style={{ fontFamily: "'Fira Code', monospace" }}>
                in {session.cumInputTokens.toLocaleString()} / out {session.cumOutputTokens.toLocaleString()} / ${session.cumCostUsd.toFixed(4)}
              </span>
            ) : (
              <span>{modelDisplay}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
