import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, Inbox, Send, Clock, X, Filter, MailOpen, Mail as MailIcon } from 'lucide-react'
import { GetWeekActivities, SyncAll } from '../../wailsjs/go/main/App'

interface GmailMessage {
  id: number
  source: string
  title: string
  summary: string
  activityDate: string
  sourceLabel: string
  sourceIcon: string
  body?: string
  from?: string
  to?: string
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  gmail_received: <Inbox size={16} />,
  gmail_sent: <Send size={16} />,
  mail: <MailIcon size={16} />,
}

export default function GmailPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'inbox' | 'sent'>('all')
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null)

  // Load Gmail activities
  const loadMessages = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
      const startDate = thirtyDaysAgo.toISOString().split('T')[0]
      const endDate = ninetyDaysLater.toISOString().split('T')[0]
      const allActivities = await GetWeekActivities(startDate, endDate) || []
      // Filter Gmail activities
      const gmailActivities = allActivities.filter(
        (a: any) => a.source === 'gmail_sent' || a.source === 'gmail_received' || a.sourceLabel?.includes('Gmail')
      )
      setMessages(gmailActivities)
    } catch (err) {
      console.error('Failed to load Gmail messages:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Sync Gmail
  const syncGmail = useCallback(async () => {
    setSyncing(true)
    try {
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
      const startDate = thirtyDaysAgo.toISOString().split('T')[0]
      const endDate = ninetyDaysLater.toISOString().split('T')[0]
      await SyncAll(startDate, endDate)
      setLastSync(new Date())
      await loadMessages()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }, [loadMessages])

  // Initial load
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Filter messages by tab
  const filteredMessages = messages.filter(m => {
    if (activeTab === 'inbox') {
      return m.source === 'gmail_received' || m.sourceLabel?.includes('수신')
    }
    if (activeTab === 'sent') {
      return m.source === 'gmail_sent' || m.sourceLabel?.includes('발신')
    }
    return true // 'all' tab
  })

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '방금'
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    if (days < 7) return `${days}일 전`
    return date.toLocaleDateString('ko-KR')
  }

  // Get source icon
  const getSourceIcon = (message: GmailMessage) => {
    if (message.source === 'gmail_received') return SOURCE_ICONS.gmail_received
    if (message.source === 'gmail_sent') return SOURCE_ICONS.gmail_sent
    return SOURCE_ICONS.mail
  }

  // Get source label
  const getSourceLabel = (message: GmailMessage) => {
    if (message.source === 'gmail_received') return '수신'
    if (message.source === 'gmail_sent') return '발신'
    return message.sourceLabel || '메일'
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-slate-800">Gmail</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Last sync time */}
          {lastSync && (
            <span className="text-xs text-slate-500">
              <Clock className="w-3 h-3 inline mr-1" />
              {formatDate(lastSync.toISOString())}
            </span>
          )}
          {/* Sync button */}
          <button
            onClick={syncGmail}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '동기화 중...' : '지금 동기화'}
          </button>
        </div>
      </header>

      {/* Source filter */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            전체
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
              {messages.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              activeTab === 'inbox'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Inbox className="w-3 h-3 inline mr-1" />
            수신함
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
              {messages.filter(m => m.source === 'gmail_received' || m.sourceLabel?.includes('수신')).length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              activeTab === 'sent'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Send className="w-3 h-3 inline mr-1" />
            발신함
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
              {messages.filter(m => m.source === 'gmail_sent' || m.sourceLabel?.includes('발신')).length}
            </span>
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Mail className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">
              {activeTab === 'inbox' ? '수신된 메일이 없습니다' : activeTab === 'sent' ? '발신된 메일이 없습니다' : '메일이 없습니다'}
            </p>
            <p className="text-sm mt-1">동기화를 실행하여 메일을 가져오세요</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-2">
            {filteredMessages.map((message) => (
              <div
                key={message.id}
                onClick={() => setSelectedMessage(message)}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-4 transition-all hover:shadow-sm hover:border-blue-300 cursor-pointer"
              >
                {/* Source icon */}
                <div className="mt-0.5 p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                  {getSourceIcon(message)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      message.source === 'gmail_received' 
                        ? 'bg-blue-100 text-blue-700' 
                        : message.source === 'gmail_sent'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {getSourceLabel(message)}
                    </span>
                    <span className="text-xs text-slate-300">•</span>
                    <span className="text-xs text-slate-400">
                      {message.activityDate}
                    </span>
                    <span className="text-xs text-slate-300">•</span>
                    <span className="text-xs text-slate-400">
                      {formatDate(message.activityDate)}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium text-slate-800 truncate">
                    {message.title?.replace(/^\[발신\]|\[수신\]\s*/, '') || '(제목 없음)'}
                  </h4>
                  {message.summary && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {message.summary}
                    </p>
                  )}
                </div>

                {/* View button */}
                <button className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600 transition-colors">
                  <MailOpen size={14} />
                  보기
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-slate-700">메일 상세</span>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">
                {selectedMessage.title || '(제목 없음)'}
              </h2>

              <div className="space-y-3 text-sm mb-6 pb-6 border-b border-slate-100">
                <div className="flex">
                  <span className="w-16 text-slate-500">발신:</span>
                  <span className="text-slate-700">{selectedMessage.from || 'Unknown'}</span>
                </div>
                <div className="flex">
                  <span className="w-16 text-slate-500">수신:</span>
                  <span className="text-slate-700">{selectedMessage.to || 'Me'}</span>
                </div>
                <div className="flex">
                  <span className="w-16 text-slate-500">날짜:</span>
                  <span className="text-slate-700">
                    {new Date(selectedMessage.activityDate).toLocaleString('ko-KR')}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div
                className="prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{
                  __html: selectedMessage.body || selectedMessage.summary || '(내용 없음)'
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
