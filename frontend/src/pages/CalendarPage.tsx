import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar as CalendarIcon, RefreshCw, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { GetWeekActivities, SyncAll, GetIntegrations } from '../../wailsjs/go/main/App'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import type { EventInput, EventClickArg } from '@fullcalendar/core'

interface CalendarEvent {
  id: number
  source: string
  title: string
  summary: string
  activityDate: string
  sourceLabel: string
  sourceIcon: string
  endDate?: string
  description?: string
  location?: string
  calendarId?: string  // From DB: calendar_id
}

interface CalendarConfig {
  id: string
  color: string
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [calendarConfigs, setCalendarConfigs] = useState<CalendarConfig[]>([])
  const calendarRef = useRef<any>(null)

  // Load calendar configurations from integrations
  const loadCalendarConfigs = useCallback(async () => {
    try {
      const integrations = await GetIntegrations() || []
      const calendarInt = integrations.find((i: any) => i.toolType === 'google_calendar' && i.enabled)
      if (calendarInt) {
        const config = JSON.parse(calendarInt.configJson || '{}')
        if (config.calendars && Array.isArray(config.calendars)) {
          setCalendarConfigs(config.calendars)
        } else if (config.calendarId) {
          // Legacy single calendar config
          setCalendarConfigs([{ id: config.calendarId, color: '#3b82f6' }])
        }
      }
    } catch (err) {
      console.error('Failed to load calendar configs:', err)
    }
  }, [])

  // Load calendar events
  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      // First load calendar configs
      await loadCalendarConfigs()
      
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
      const startDate = thirtyDaysAgo.toISOString().split('T')[0]
      const endDate = ninetyDaysLater.toISOString().split('T')[0]
      const allActivities = await GetWeekActivities(startDate, endDate) || []
      console.log('[CalendarPage] Loaded activities:', allActivities.length, allActivities.slice(0, 3))
      
      // Filter Calendar activities and map calendarId
      const calendarActivities: CalendarEvent[] = allActivities
        .filter((a: any) => {
          const isCalendar = a.source === 'google_calendar' || a.source?.includes('calendar')
          if (isCalendar) {
            console.log('[CalendarPage] Calendar activity found:', a)
          }
          return isCalendar
        })
        .map((a: any) => ({
          id: a.id,
          source: a.source,
          title: a.title,
          summary: a.summary,
          activityDate: a.activityDate,
          sourceLabel: a.sourceLabel,
          sourceIcon: a.sourceIcon,
          endDate: a.endDate,
          description: a.description,
          location: a.location,
          calendarId: a.calendarId || a.calendar_id, // Support both camelCase and snake_case from DB
        }))
      
      console.log('[CalendarPage] Filtered calendar events:', calendarActivities.length)
      setEvents(calendarActivities)
    } catch (err) {
      console.error('Failed to load calendar events:', err)
    } finally {
      setLoading(false)
    }
  }, [loadCalendarConfigs])

  // Sync Calendar
  const syncCalendar = useCallback(async () => {
    setSyncing(true)
    try {
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
      const startDate = thirtyDaysAgo.toISOString().split('T')[0]
      const endDate = ninetyDaysLater.toISOString().split('T')[0]
      await SyncAll(startDate, endDate)
      setLastSync(new Date())
      await loadEvents()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }, [loadEvents])

  // Initial load
  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Get color for a calendar - matches DB calendar_id with config id
  const getCalendarColor = (event: CalendarEvent) => {
    // Direct match: event.calendarId comes from DB (calendar_id field)
    if (event.calendarId) {
      const config = calendarConfigs.find(c => c.id === event.calendarId)
      if (config) return config.color
    }
    // Fallback to default blue
    return '#3b82f6'
  }

  // Convert to FullCalendar events with colors
  const calendarEvents: EventInput[] = events.map(event => {
    const color = getCalendarColor(event)
    const fcEvent = {
      id: String(event.id),
      title: event.title || '(제목 없음)',
      start: event.activityDate,
      end: event.endDate || event.activityDate,
      extendedProps: {
        description: event.summary || event.description || '',
        location: event.location || '',
        source: event.source,
        calendarColor: color,
      },
      backgroundColor: color,
      borderColor: color,
      textColor: '#ffffff',
    }
    console.log('[CalendarPage] FC Event:', fcEvent)
    return fcEvent
  })
  
  console.log('[CalendarPage] Total FC events:', calendarEvents.length)

  // Handle event click
  const handleEventClick = (info: EventClickArg) => {
    const eventId = parseInt(info.event.id)
    const found = events.find(e => e.id === eventId)
    if (found) {
      setSelectedEvent(found)
    }
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Navigate to previous month
  const goToPrevMonth = () => {
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() - 1)
    setCurrentDate(newDate)
    calendarRef.current?.getApi().prev()
  }

  // Navigate to next month
  const goToNextMonth = () => {
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() + 1)
    setCurrentDate(newDate)
    calendarRef.current?.getApi().next()
  }

  // Go to today
  const goToToday = () => {
    setCurrentDate(new Date())
    calendarRef.current?.getApi().today()
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-slate-800">Google Calendar</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Last sync time */}
          {lastSync && (
            <span className="text-xs text-slate-500">
              <Clock className="w-3 h-3 inline mr-1" />
              {lastSync.toLocaleTimeString('ko-KR')}
            </span>
          )}
          {/* Sync button */}
          <button
            onClick={syncCalendar}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '동기화 중...' : '지금 동기화'}
          </button>
        </div>
      </header>

      {/* Navigation Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={goToPrevMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 min-w-[150px] text-center">
            {currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
          </h2>
          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <button
          onClick={goToToday}
          className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          오늘
        </button>
      </div>

      {/* Calendar */}
      <div className="flex-1 p-6 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm h-full">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              events={calendarEvents}
              eventClick={handleEventClick}
              headerToolbar={false}
              locale="ko"
              height="100%"
              dayMaxEvents={3}
              eventDisplay="block"
              eventTimeFormat={{
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
                hour12: false
              }}
              buttonText={{
                today: '오늘',
                month: '월',
                week: '주',
                day: '일',
              }}
              datesSet={(info) => {
                setCurrentDate(info.view.currentStart)
              }}
            />
          </div>
        )}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-blue-50">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-slate-700">일정 상세</span>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <span className="text-slate-500 text-xl">&times;</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">
                {selectedEvent.title || '(제목 없음)'}
              </h2>

              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-slate-500">시작</p>
                    <p className="text-slate-700 font-medium">
                      {formatDate(selectedEvent.activityDate)}
                    </p>
                  </div>
                </div>

                {selectedEvent.endDate && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-slate-500">종료</p>
                      <p className="text-slate-700 font-medium">
                        {formatDate(selectedEvent.endDate)}
                      </p>
                    </div>
                  </div>
                )}

                {selectedEvent.location && (
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-slate-500">장소</p>
                      <p className="text-slate-700">{selectedEvent.location}</p>
                    </div>
                  </div>
                )}

                {selectedEvent.summary && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-slate-500 mb-2">설명</p>
                    <div
                      className="prose prose-slate max-w-none text-slate-700"
                      dangerouslySetInnerHTML={{
                        __html: selectedEvent.summary
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
