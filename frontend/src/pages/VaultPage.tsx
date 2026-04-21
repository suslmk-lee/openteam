import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, RefreshCw, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CanResolveFilePaths, ResolveFilePaths } from '../../wailsjs/runtime/runtime'
import { VaultFolderTree } from '../components/VaultFolderTree'
import { VaultFileList } from '../components/VaultFileList'
import { VaultFileViewer } from '../components/VaultFileViewer'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import { AiChatPanel as SharedAiChatPanel } from '../features/chat/AiChatPanel'
import { buildVaultChatContext } from '../features/chat/providers/vaultContext'
import type { ChatCommand } from '../features/chat/types'
import { useAiChatSession } from '../features/chat/useAiChatSession'
import { formatIngestCompletionMessage } from '../features/vault/ingestResultSummary'
import { useAppApi } from '../hooks/useAppApi'
import type { VaultFile, VaultItem } from '../services/appApi'

function splitItems(items: VaultItem[]) {
  const folders = items.filter(item => item.type === 'folder')
  const files = items.filter(item => item.type === 'file')
  return { folders, files }
}

function formatCount(label: string, count: number) {
  return `${label} ${count}건`
}

function isIngestURL(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeIngestTriggerText(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s.!?,;:"'()[\]{}<>/\\`~\u00B7-]+/g, '')
}

const KOREAN_INGEST_TRIGGER_ALIASES = new Set([
  '이내용도ingest해줘',
  '\uC774\uB0B4\uC6A9\uB3C4ingest\uD574\uC8FC',
  '\uC774\uB0B4\uC6A9\uB3C4ingest\uD574\uC8FC\uC694',
])

const ENGLISH_INGEST_TRIGGER_ALIASES = new Set([
  'ingestthismessage',
  'ingestthismessageplease',
])

function shouldTriggerLatestIngest(text: string) {
  const normalized = normalizeIngestTriggerText(text)
  return KOREAN_INGEST_TRIGGER_ALIASES.has(normalized) || ENGLISH_INGEST_TRIGGER_ALIASES.has(normalized)
}

type IngestSourceType = 'file' | 'text' | 'url'

type IngestFeedbackTone = 'info' | 'success' | 'error'

type IngestFeedback = {
  tone: IngestFeedbackTone
  message: string
  detail?: string
  warnings: string[]
}

type ResolvedFile = File & {
  path?: string
}

type VaultPageMode = 'explore' | 'ingest'

interface VaultPageProps {
  mode?: VaultPageMode
}

function truncateText(value: string, maxLength = 80) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function summarizeIngestSource(sourceType: IngestSourceType, source: string) {
  const normalized = source.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined

  if (sourceType === 'file') {
    const fileName = normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized
    return truncateText(fileName)
  }

  if (sourceType === 'url') {
    try {
      const url = new URL(normalized)
      const path = url.pathname && url.pathname !== '/' ? url.pathname : ''
      return truncateText(`${url.host}${path}`)
    } catch {
      return truncateText(normalized)
    }
  }

  return truncateText(normalized)
}

function summarizeFailureDetail(sourceType: IngestSourceType, source: string) {
  const sourceSummary = summarizeIngestSource(sourceType, source)
  if (!sourceSummary) return '요청 정보를 확인해주세요.'
  return sourceType === 'text' ? sourceSummary : `대상: ${sourceSummary}`
}

function sanitizeErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  const normalized = message.replace(/\s+/g, ' ').trim()
  return normalized ? truncateText(normalized) : fallback
}

export default function VaultPage({ mode = 'explore' }: VaultPageProps) {
  const appApi = useAppApi()
  const {
    GetVaultStructure,
    GetVaultFile,
    SearchVault,
    RefreshVault,
    IngestKnowledgeSource,
    IngestKnowledgeBatch,
    SaveKnowledgeQuery,
    RunKnowledgeBaseLint,
  } = appApi
  const { profile } = useTeamProfile()
  const chatSession = useAiChatSession(query => buildVaultChatContext(query, appApi.RetrieveVaultContext))
  const ingestModel = chatSession.effectiveProvider === 'claude_cli' ? 'claude' : 'openai'

  const [breadcrumbs, setBreadcrumbs] = useState<VaultItem[]>([])
  const [folders, setFolders] = useState<VaultItem[]>([])
  const [files, setFiles] = useState<VaultItem[]>([])
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<VaultItem[]>([])
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [structureLoading, setStructureLoading] = useState(mode === 'explore')
  const [searchLoading, setSearchLoading] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshCount, setRefreshCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [batchDraft, setBatchDraft] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [ingestingSource, setIngestingSource] = useState<IngestSourceType | null>(null)
  const [linting, setLinting] = useState(false)
  const [ingestFeedback, setIngestFeedback] = useState<IngestFeedback | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const loadFolderRequestSeqRef = useRef(0)
  const searchRequestSeqRef = useRef(0)
  const fileRequestSeqRef = useRef(0)

  const currentParentId = breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].id : null
  const currentFolderName = breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].name : '루트 폴더'
  const currentPath = breadcrumbs.length ? breadcrumbs.map(item => item.name).join(' / ') : '최상위 폴더'
  const isExploreMode = mode === 'explore'
  const isIngestMode = mode === 'ingest'
  const isSearchMode = searchQuery.trim().length > 0
  const visibleItems = isSearchMode ? searchResults : files
  const requestedBy = profile?.userName?.trim() || profile?.teamName?.trim() || 'default-user'
  const pageBusy = refreshing || ingestingSource !== null || linting

  const loadFolder = useCallback(
    async (parentID: number | null, nextBreadcrumbs: VaultItem[]) => {
      const requestId = ++loadFolderRequestSeqRef.current
      setStructureLoading(true)
      setError(null)
      try {
        const items = await GetVaultStructure(parentID)
        if (requestId !== loadFolderRequestSeqRef.current) return

        const normalized = items ?? []
        const split = splitItems(normalized)
        setBreadcrumbs(nextBreadcrumbs)
        setFolders(split.folders)
        setFiles(split.files)
        setSearchDraft('')
        setSearchQuery('')
        setSearchResults([])
        setSelectedFile(null)
        setSelectedFilePath(null)
      } catch (err) {
        if (requestId !== loadFolderRequestSeqRef.current) return
        console.error('Failed to load vault folder:', err)
        setError(sanitizeErrorMessage(err, '지식 베이스 폴더를 불러오지 못했습니다.'))
      } finally {
        if (requestId === loadFolderRequestSeqRef.current) {
          setStructureLoading(false)
        }
      }
    },
    [GetVaultStructure],
  )

  const runSearch = useCallback(
    async (keyword: string) => {
      const trimmed = keyword.trim()
      if (!trimmed) {
        setSearchQuery('')
        setSearchResults([])
        return
      }

      const requestId = ++searchRequestSeqRef.current
      setSearchLoading(true)
      setError(null)
      try {
        const results = await SearchVault(trimmed)
        if (requestId !== searchRequestSeqRef.current) return

        const normalized = ((results ?? []) as VaultItem[]).filter((item: VaultItem) => item.type === 'file')
        setSearchQuery(trimmed)
        setSearchResults(normalized)
        setSelectedFile(null)
        setSelectedFilePath(null)
      } catch (err) {
        if (requestId !== searchRequestSeqRef.current) return
        console.error('Failed to search vault:', err)
        setError(sanitizeErrorMessage(err, '지식 베이스 검색에 실패했습니다.'))
        setSearchResults([])
      } finally {
        if (requestId === searchRequestSeqRef.current) {
          setSearchLoading(false)
        }
      }
    },
    [SearchVault],
  )

  useEffect(() => {
    if (!isExploreMode) return
    void loadFolder(null, [])
  }, [isExploreMode, loadFolder])

  const handleSelectFolder = useCallback(
    (folder: VaultItem) => {
      if (pageBusy) return
      void loadFolder(folder.id, [...breadcrumbs, folder])
    },
    [breadcrumbs, loadFolder, pageBusy],
  )

  const handleGoBack = useCallback(() => {
    if (pageBusy) return
    if (breadcrumbs.length === 0) return
    const nextBreadcrumbs = breadcrumbs.slice(0, -1)
    const nextParentId = nextBreadcrumbs.length ? nextBreadcrumbs[nextBreadcrumbs.length - 1].id : null
    void loadFolder(nextParentId, nextBreadcrumbs)
  }, [breadcrumbs, loadFolder, pageBusy])

  const handleGoRoot = useCallback(() => {
    if (pageBusy) return
    void loadFolder(null, [])
  }, [loadFolder, pageBusy])

  const handleClearSearch = useCallback(() => {
    setSearchDraft('')
    setSearchQuery('')
    setSearchResults([])
    setSelectedFile(null)
    setSelectedFilePath(null)
  }, [])

  const handleSearchSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (pageBusy) return

      const keyword = searchDraft.trim()
      if (!keyword) {
        handleClearSearch()
        return
      }

      await runSearch(keyword)
    },
    [handleClearSearch, pageBusy, runSearch, searchDraft],
  )

  const reloadVisibleItems = useCallback(async () => {
    if (!isExploreMode) {
      return
    }

    if (isSearchMode) {
      await runSearch(searchQuery)
      return
    }

    await loadFolder(currentParentId, breadcrumbs)
  }, [breadcrumbs, currentParentId, isExploreMode, isSearchMode, loadFolder, runSearch, searchQuery])

  const refreshVisibleItems = useCallback(async () => {
    const count = await RefreshVault()
    setRefreshCount(count)
    await reloadVisibleItems()
  }, [RefreshVault, reloadVisibleItems])

  const handleRefresh = useCallback(async () => {
    if (pageBusy) return
    setRefreshing(true)
    setError(null)
    try {
      await refreshVisibleItems()
    } catch (err) {
      console.error('Failed to refresh vault:', err)
      setError(sanitizeErrorMessage(err, '지식 베이스를 새로고침하지 못했습니다.'))
    } finally {
      setRefreshing(false)
    }
  }, [pageBusy, refreshVisibleItems])

  const runKnowledgeBaseLint = useCallback(async () => {
    if (pageBusy) {
      return { ok: false as const, error: 'Another task is already running.' }
    }

    setLinting(true)
    setIngestFeedback({
      tone: 'info',
      message: 'Knowledge Base lint is running.',
      detail: 'target: knowledge-base/wiki',
      warnings: [],
    })
    setError(null)

    try {
      const result = await RunKnowledgeBaseLint()
      setIngestFeedback({
        tone: result.warnings?.length ? 'error' : 'success',
        message: result.warnings?.length ? 'Lint completed with warnings.' : 'Lint completed successfully.',
        detail: `status: ${result.status}`,
        warnings: result.warnings ?? [],
      })
      return { ok: true as const, result }
    } catch (lintError) {
      const sanitizedError = sanitizeErrorMessage(lintError, 'Knowledge Base lint failed.')
      setIngestFeedback({
        tone: 'error',
        message: 'Knowledge Base lint failed.',
        detail: sanitizedError,
        warnings: [],
      })
      return { ok: false as const, error: sanitizedError }
    } finally {
      setLinting(false)
    }
  }, [RunKnowledgeBaseLint, pageBusy])

  const handleSelectFile = useCallback(
    async (item: VaultItem) => {
      if (pageBusy) return
      if (item.type !== 'file') return

      const requestId = ++fileRequestSeqRef.current
      setFileLoading(true)
      setError(null)
      try {
        const file = await GetVaultFile(item.path)
        if (requestId !== fileRequestSeqRef.current) return
        setSelectedFile(file)
        setSelectedFilePath(item.path)
      } catch (err) {
        if (requestId !== fileRequestSeqRef.current) return
        console.error('Failed to load vault file:', err)
        setError(sanitizeErrorMessage(err, '파일을 불러오지 못했습니다.'))
        setSelectedFile(null)
        setSelectedFilePath(null)
      } finally {
        if (requestId === fileRequestSeqRef.current) {
          setFileLoading(false)
        }
      }
    },
    [GetVaultFile, pageBusy],
  )

  const runIngest = useCallback(
    async (sourceType: IngestSourceType, source: string) => {
      const trimmedSource = source.trim()
      const sourceSummary = summarizeIngestSource(sourceType, trimmedSource)
      const progressMessage =
        sourceType === 'file'
          ? '파일을 추가하는 중입니다.'
          : sourceType === 'url'
            ? 'URL을 추가하는 중입니다.'
            : '지식 소스를 추가하는 중입니다.'
      const successMessage =
        sourceType === 'file'
          ? '파일 추가가 완료되었습니다.'
          : sourceType === 'url'
            ? 'URL 추가가 완료되었습니다.'
            : '지식 소스 추가가 완료되었습니다.'
      const failureMessage =
        sourceType === 'file'
          ? '파일 추가에 실패했습니다.'
          : sourceType === 'url'
            ? 'URL 추가에 실패했습니다.'
            : '지식 소스 추가에 실패했습니다.'

      setIngestingSource(sourceType)
      setIngestFeedback({
        tone: 'info',
        message: progressMessage,
        detail: sourceSummary,
        warnings: [],
      })
      setError(null)

      try {
        const result = await IngestKnowledgeSource(sourceType, trimmedSource, ingestModel, requestedBy)
        const metadataBits: string[] = []
        if ((result.elapsedMs ?? 0) > 0) metadataBits.push(`elapsed ${result.elapsedMs}ms`)
        if ((result.createdPaths?.length ?? 0) > 0) metadataBits.push(`files ${result.createdPaths?.length}`)

        const detailBits = [`status: ${result.status}`]
        if (metadataBits.length > 0) detailBits.push(metadataBits.join(', '))
        if (sourceSummary) detailBits.push(sourceSummary)

        setIngestFeedback({
          tone: 'success',
          message: successMessage,
          detail: detailBits.join(' · '),
          warnings: result.warnings ?? [],
        })

        try {
          await reloadVisibleItems()
        } catch (refreshError) {
          console.error('Failed to reload vault view after ingest:', refreshError)
          setError(sanitizeErrorMessage(refreshError, 'Ingest succeeded, but the current view reload failed.'))
        }

        return { ok: true as const, result }
      } catch (ingestError) {
        const sanitizedError = sanitizeErrorMessage(ingestError, failureMessage)
        console.error('Failed to ingest knowledge source:', ingestError)
        setIngestFeedback({
          tone: 'error',
          message: failureMessage,
          detail: summarizeFailureDetail(sourceType, trimmedSource),
          warnings: [],
        })
        return { ok: false as const, error: sanitizedError }
      } finally {
        setIngestingSource(null)
      }
    },
    [IngestKnowledgeSource, ingestModel, reloadVisibleItems, requestedBy],
  )

  const handleOpenFilePicker = useCallback(() => {
    if (pageBusy) return
    fileInputRef.current?.click()
  }, [pageBusy])

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      if (pageBusy) {
        event.target.value = ''
        return
      }

      const selectedFile = event.target.files?.[0] ?? null
      event.target.value = ''

      if (!selectedFile) return

      try {
        if (!CanResolveFilePaths()) {
          throw new Error('현재 환경에서는 파일 경로를 확인할 수 없습니다.')
        }

        await Promise.resolve(ResolveFilePaths([selectedFile]))
        const resolvedPath = ((selectedFile as ResolvedFile).path ?? '').trim()
        if (!resolvedPath) {
          throw new Error('선택한 파일의 경로를 확인할 수 없습니다.')
        }

        await runIngest('file', resolvedPath)
      } catch (resolveError) {
        console.error('Failed to resolve selected file path:', resolveError)
        setIngestingSource(null)
        setIngestFeedback({
          tone: 'error',
          message: '파일 추가에 실패했습니다.',
          detail: summarizeFailureDetail('file', selectedFile.name),
          warnings: [],
        })
      }
    },
    [pageBusy, runIngest],
  )

  const handleUrlSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (pageBusy) return

      const trimmedUrl = urlDraft.trim()

      if (!trimmedUrl) {
        setIngestFeedback({
          tone: 'error',
          message: 'URL을 입력해주세요.',
          warnings: [],
        })
        return
      }

      if (!isIngestURL(trimmedUrl)) {
        setIngestFeedback({
          tone: 'error',
          message: '올바른 URL을 입력해주세요.',
          detail: summarizeIngestSource('url', trimmedUrl),
          warnings: [],
        })
        return
      }

      const result = await runIngest('url', trimmedUrl)
      if (result.ok) {
        setUrlDraft('')
        setShowUrlInput(false)
      }
    },
    [pageBusy, runIngest, urlDraft],
  )

  const handleBatchIngestSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (pageBusy) return

      const sources = batchDraft
        .split(/[\n,]/)
        .map(token => token.trim())
        .filter(Boolean)

      if (sources.length === 0) {
        setIngestFeedback({
          tone: 'error',
          message: '배치 ingest 대상이 없습니다.',
          detail: 'URL 또는 파일 경로를 한 줄에 하나씩 입력해주세요.',
          warnings: [],
        })
        return
      }

      const sourceType: IngestSourceType = sources.every(isIngestURL) ? 'url' : 'file'
      setIngestingSource(sourceType)
      setIngestFeedback({
        tone: 'info',
        message: '배치 ingest를 실행하는 중입니다.',
        detail: `대상 ${sources.length}건`,
        warnings: [],
      })
      setError(null)

      try {
        const results = await IngestKnowledgeBatch(sourceType, sources, ingestModel, requestedBy)
        const successCount = results.filter(result => result.status !== 'failed').length
        const failedCount = results.length - successCount
        const warnings = results.flatMap(result => result.warnings ?? [])

        setIngestFeedback({
          tone: failedCount > 0 ? 'error' : 'success',
          message: failedCount > 0 ? '배치 ingest가 경고와 함께 완료되었습니다.' : '배치 ingest가 완료되었습니다.',
          detail: `총 ${results.length}건 · 성공 ${successCount}건 · 실패 ${failedCount}건`,
          warnings,
        })
        setBatchDraft('')
        setShowUrlInput(false)
        await refreshVisibleItems()
      } catch (batchError) {
        setIngestFeedback({
          tone: 'error',
          message: '배치 ingest에 실패했습니다.',
          detail: sanitizeErrorMessage(batchError, 'unknown error'),
          warnings: [],
        })
      } finally {
        setIngestingSource(null)
      }
    },
    [IngestKnowledgeBatch, batchDraft, ingestModel, pageBusy, refreshVisibleItems, requestedBy],
  )

  const handleIngestCommand = useCallback(
    async (rawInput?: string) => {
      if (pageBusy) return false

      const trimmedInput = rawInput?.trim() || '/ingest'
      const arg = trimmedInput.replace(/^\/ingest\b/i, '').trim()

      let sourceType: IngestSourceType
      let source = arg

      if (!arg) {
        const latestUserMessage = [...chatSession.messages]
          .reverse()
          .find(message => message.role === 'user' && message.content.trim() && !message.content.trim().startsWith('/'))

        if (!latestUserMessage) {
          chatSession.setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: 'Nothing to ingest yet. Send a message first, or run `/ingest <url>` or `/ingest <path>`.',
            },
          ])
          return false
        }

        sourceType = 'text'
        source = latestUserMessage.content.trim()
      } else {
        sourceType = isIngestURL(arg) ? 'url' : 'file'
      }

      const ingestResult = await runIngest(sourceType, source)
      if (ingestResult.ok) {
        const { result } = ingestResult
        const warningText = result.warnings?.length
          ? `\n\nWarnings:\n- ${result.warnings.join('\n- ')}`
          : ''

        chatSession.setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `${formatIngestCompletionMessage(result)}${warningText}`,
          },
        ])
        return true
      }

      chatSession.setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Ingest failed: ${ingestResult.error}`,
        },
      ])
      return false
    },
    [chatSession.messages, chatSession.setMessages, pageBusy, runIngest],
  )

  const handleIngestBatchCommand = useCallback(
    async (rawInput?: string) => {
      if (pageBusy) return false
      const trimmedInput = rawInput?.trim() || '/ingestbatch'
      const arg = trimmedInput.replace(/^\/ingestbatch\b/i, '').trim()
      if (!arg) {
        chatSession.setMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Usage: /ingestbatch <url1, url2, filePath1, ...>' },
        ])
        return false
      }

      const sources = arg
        .split(/[\n,]/)
        .map(token => token.trim())
        .filter(Boolean)
      if (sources.length === 0) {
        chatSession.setMessages(prev => [...prev, { role: 'assistant', content: 'No sources parsed from command.' }])
        return false
      }

      const sourceType: IngestSourceType = sources.every(isIngestURL) ? 'url' : 'file'
      try {
        const results = await IngestKnowledgeBatch(sourceType, sources, ingestModel, requestedBy)
        const successCount = results.filter(result => result.status !== 'failed').length
        const failedCount = results.length - successCount
        const warningLines = results
          .filter(result => (result.warnings?.length ?? 0) > 0)
          .map(result => `- ${result.source}: ${result.warnings?.[0] ?? 'warning'}`)

        chatSession.setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `Batch ingest completed.\n\n- total: \`${results.length}\`\n- success: \`${successCount}\`\n- failed: \`${failedCount}\`${
              warningLines.length ? `\n\nWarnings:\n${warningLines.join('\n')}` : ''
            }`,
          },
        ])
        await reloadVisibleItems()
        return true
      } catch (error) {
        chatSession.setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Batch ingest failed: ${sanitizeErrorMessage(error, 'unknown error')}` },
        ])
        return false
      }
    },
    [IngestKnowledgeBatch, chatSession, pageBusy, reloadVisibleItems, requestedBy],
  )

  const handleLintCommand = useCallback(async () => {
    const lintResult = await runKnowledgeBaseLint()
    if (!lintResult.ok) {
      chatSession.setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Lint failed: ${lintResult.error}`,
        },
      ])
      return false
    }

    const warningText = lintResult.result.warnings?.length
      ? `\n\nWarnings:\n- ${lintResult.result.warnings.join('\n- ')}`
      : ''
    chatSession.setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `Lint completed.\n\n- status: \`${lintResult.result.status}\`\n- target: \`knowledge-base/wiki\`${warningText}`,
      },
    ])
    return true
  }, [chatSession, runKnowledgeBaseLint])

  const handleSaveQueryCommand = useCallback(async () => {
    if (pageBusy) return false

    const indexed = chatSession.messages.map((message, index) => ({ message, index }))
    const assistantEntry = [...indexed]
      .reverse()
      .find(entry => entry.message.role === 'assistant' && entry.message.content.trim())
    if (!assistantEntry) {
      chatSession.setMessages(prev => [...prev, { role: 'assistant', content: 'No assistant answer to save yet.' }])
      return false
    }

    const userMessage = [...chatSession.messages.slice(0, assistantEntry.index)]
      .reverse()
      .find(message => message.role === 'user' && message.content.trim() && !message.content.trim().startsWith('/'))
    if (!userMessage) {
      chatSession.setMessages(prev => [...prev, { role: 'assistant', content: 'No matching user query found.' }])
      return false
    }

    const referencePaths = (assistantEntry.message.references ?? [])
      .map(reference => reference.path?.trim() ?? '')
      .filter(Boolean)

    try {
      const result = await SaveKnowledgeQuery(
        userMessage.content.trim(),
        assistantEntry.message.content.trim(),
        ingestModel,
        requestedBy,
        referencePaths,
      )
      const warningText = result.warnings?.length ? `\n\nWarnings:\n- ${result.warnings.join('\n- ')}` : ''
      chatSession.setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Query filed.\n\n- status: \`${result.status}\`${warningText}` },
      ])
      await reloadVisibleItems()
      return true
    } catch (error) {
      chatSession.setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Save query failed: ${sanitizeErrorMessage(error, 'unknown error')}` },
      ])
      return false
    }
  }, [SaveKnowledgeQuery, chatSession.messages, chatSession.setMessages, ingestModel, pageBusy, reloadVisibleItems, requestedBy])

  const vaultChatSession = {
    ...chatSession,
    handleSendText: async (text: string) => {
      if (shouldTriggerLatestIngest(text)) {
        return handleIngestCommand()
      }

      return chatSession.handleSendText(text)
    },
  }

  const vaultCommands: ChatCommand[] = [
    {
      cmd: '/clear',
      desc: '채팅 세션 초기화',
      run: () => {
        chatSession.clearSession()
        return true
      },
    },
    {
      cmd: '/summary',
      desc: '현재 주제 요약',
      run: async () => {
        if (chatSession.sending) {
          return false
        }


        return chatSession.handleSendText('지식 베이스 관련 문서를 바탕으로 현재 주제를 요약해줘.')
      },
    },
    {
      cmd: '/ingest',
      desc: '최근 메시지, URL, 또는 파일 경로 ingest',
      run: handleIngestCommand,
    },
    {
      cmd: '/lint',
      desc: 'Knowledge Base 전체 lint 실행',
      run: handleLintCommand,
    },
    {
      cmd: '/ingestbatch',
      desc: 'URL/寃쎈줈 紐⑸줉 batch ingest',
      run: handleIngestBatchCommand,
    },
    {
      cmd: '/savequery',
      desc: 'Save latest Q&A into wiki/queries',
      run: handleSaveQueryCommand,
    },
    {
      cmd: '/help',
      desc: '사용 가능한 명령어 표시',
      run: () => {
        const helpText = vaultCommands.map(command => `${command.cmd} - ${command.desc}`).join('\n')
        chatSession.setMessages(prev => [...prev, { role: 'assistant', content: `사용 가능한 명령어\n\n${helpText}` }])
        return true
      },
    },
  ]

  const listTitle = isSearchMode ? '검색 결과' : currentFolderName
  const listSubtitle = isSearchMode
    ? `"${searchQuery.trim()}" 검색 결과 · ${formatCount('문서', visibleItems.length)}`
    : `${currentPath} · ${formatCount('문서', files.length)}`
  const listEmptyText = isSearchMode ? '검색 결과가 없습니다.' : '이 폴더에는 파일이 없습니다.'

  const statusText = useMemo(() => {
    if (ingestingSource === 'file') return '파일을 추가하는 중입니다.'
    if (ingestingSource === 'url') return 'URL을 추가하는 중입니다.'
    if (ingestingSource === 'text') return '지식 소스를 추가하는 중입니다.'
    if (refreshing) return '지식 베이스 인덱스를 새로고침하는 중입니다.'
    if (isIngestMode) return '지식 추가 준비 완료'
    if (searchLoading) return `"${searchQuery.trim()}" 검색 중입니다.`
    if (structureLoading) return '지식 베이스 구조를 불러오는 중입니다.'
    if (refreshCount !== null) return `마지막 새로고침: ${refreshCount}개 항목 인덱싱`
    return '지식 베이스 인덱스 준비 완료'
  }, [ingestingSource, isIngestMode, refreshCount, refreshing, searchLoading, searchQuery, structureLoading])

  const ingestFeedbackClassName =
    ingestFeedback?.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-500/10 dark:text-emerald-200'
      : ingestFeedback?.tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-500/10 dark:text-rose-200'
        : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-500/10 dark:text-sky-200'

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-[var(--color-bg)]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-[var(--color-card)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              <BookOpen size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">지식 베이스</h1>
              {isExploreMode ? (
                <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                  현재 Vault 인덱스를 탐색하고 마크다운 문서를 확인할 수 있습니다. 변경 사항이 있으면 새로고침으로 목록을 갱신하세요.
                </p>
              ) : (
                <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                  파일과 URL을 지식 베이스에 추가하고, 배치 ingest 및 lint로 품질을 확인하세요.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">{statusText}</span>
            {isExploreMode && isSearchMode && (
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                {formatCount('검색 결과', searchResults.length)}
              </span>
            )}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInputChange} />
            {isIngestMode && (
              <>
                <button
                  type="button"
                  onClick={handleOpenFilePicker}
                  disabled={pageBusy}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  파일 추가
                </button>
                <button
                  type="button"
                  onClick={() => setShowUrlInput(current => !current)}
                  disabled={pageBusy}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  URL 추가
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={pageBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>
        </div>

        {isExploreMode && (
          <form onSubmit={handleSearchSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchDraft}
                onChange={event => setSearchDraft(event.target.value)}
                placeholder="지식 베이스 파일 검색"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500"
              />
              {searchDraft && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={searchLoading || pageBusy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                <Search size={16} />
                검색
              </button>
              <button
                type="button"
                onClick={handleGoRoot}
                disabled={pageBusy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                루트
              </button>
            </div>
          </form>
        )}

        {isIngestMode && showUrlInput && (
          <form
            onSubmit={handleUrlSubmit}
            className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-900/70"
          >
            <input
              value={urlDraft}
              onChange={event => setUrlDraft(event.target.value)}
              placeholder="https://example.com/article"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pageBusy}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUrlInput(false)
                  setUrlDraft('')
                }}
                disabled={pageBusy}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                취소
              </button>
            </div>
          </form>
        )}
      </header>

      {error && (
        <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-500/10 dark:text-rose-200">
          <div className="flex items-start justify-between gap-4">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-md p-1 transition-colors hover:bg-rose-100 dark:hover:bg-rose-500/20"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {ingestFeedback && (
        <div className={`shrink-0 border-b px-6 py-3 text-sm ${ingestFeedbackClassName}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">{ingestFeedback.message}</p>
              {ingestFeedback.detail && <p className="break-all text-xs opacity-90">{ingestFeedback.detail}</p>}
              {ingestFeedback.warnings.length > 0 && (
                <div className="pt-1 text-xs">
                  <p className="font-medium">Warnings ({ingestFeedback.warnings.length})</p>
                  <ul className="mt-1 list-disc pl-5">
                    {ingestFeedback.warnings.map(warning => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIngestFeedback(null)}
              className="rounded-md p-1 transition-colors hover:bg-white/40 dark:hover:bg-white/10"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {isExploreMode && (
        <div data-testid="vault-explore-panel" className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_320px_minmax(0,1fr)]">
          <section
            className={`min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r dark:border-slate-700 ${
              pageBusy ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            <VaultFolderTree
              breadcrumbs={breadcrumbs}
              folders={folders}
              loading={structureLoading}
              onGoBack={handleGoBack}
              onGoRoot={handleGoRoot}
              onSelectFolder={handleSelectFolder}
            />
          </section>

          <section
            className={`min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r dark:border-slate-700 ${
              pageBusy ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            <VaultFileList
              items={visibleItems}
              loading={structureLoading || searchLoading}
              selectedPath={selectedFilePath}
              title={listTitle}
              subtitle={listSubtitle}
              emptyText={listEmptyText}
              showPath={isSearchMode}
              onSelectFile={handleSelectFile}
            />
          </section>

          <section className="min-h-0">
            <VaultFileViewer file={selectedFile} loading={fileLoading} />
          </section>
        </div>
      )}

      {isIngestMode && (
        <div data-testid="vault-ingest-panel" className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">지식 추가 작업</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                파일/URL/배치 입력으로 지식을 수집하고, Lint로 문서 상태를 확인할 수 있습니다.
              </p>
            </div>

            <form
              onSubmit={handleBatchIngestSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">배치 ingest</h3>
                <button
                  type="submit"
                  disabled={pageBusy}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  배치 실행
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                URL 또는 파일 경로를 콤마(,) 또는 줄바꿈으로 구분해 입력하세요.
              </p>
              <textarea
                value={batchDraft}
                onChange={event => setBatchDraft(event.target.value)}
                rows={6}
                placeholder="https://example.com/a
https://example.com/b
D:\\Vault\\knowledge-base\\wiki\\sources\\sample.md"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500"
              />
            </form>

            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  void runKnowledgeBaseLint()
                }}
                disabled={pageBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {linting ? 'Linting...' : 'KB Lint'}
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={pageBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                인덱스 새로고침
              </button>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">지식 추가 후 문서 확인과 질의는 탐색 화면에서 진행하세요.</p>
              <Link
                to="/vault/explore"
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
              >
                탐색으로 이동
              </Link>
            </div>
          </div>
        </div>
      )}

      {isExploreMode && (
        <SharedAiChatPanel
          session={vaultChatSession}
          title="Knowledge Base AI"
          subtitle="검색된 지식 베이스 문서를 바탕으로 질문하세요."
          buttonLabel="지식 베이스 채팅"
          badgeCount={isSearchMode ? searchResults.length : files.length}
          suggestions={[
            '현재 폴더 내용을 요약해줘',
            '보안 관련 문서를 찾아줘',
            '이 주제와 관련된 힌트를 보여줘',
          ]}
          commands={vaultCommands}
        />
      )}
    </div>
  )
}
