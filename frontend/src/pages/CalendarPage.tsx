import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar as CalendarIcon, RefreshCw, Clock, ChevronLeft, ChevronRight, Eye, EyeOff, X } from 'lucide-react'
import { GetWeekActivities, SyncAll, GetIntegrations, SaveIntegration } from '../../wailsjs/go/main/App'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import type { EventInput, EventClickArg } from '@fullcalendar/core'

interface CalendarEvent {
  id: number
  source: string
  title: string
  summary: string
  activityDate: string
  activityDateTime?: string  // Full datetime for events with time
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
  name?: string
  visible?: boolean
}

// Google Calendar style 24-color palette
const GOOGLE_CALENDAR_COLORS = [
  // Row 1: Red/Pink
  { value: '#ac725e', label: '갈색' },
  { value: '#d06b64', label: '진빨강' },
  { value: '#f83a22', label: '빨강' },
  { value: '#fa573c', label: '주황빨강' },
  { value: '#ff7537', label: '주황' },
  { value: '#ffad46', label: '연주황' },
  // Row 2: Yellow/Green
  { value: '#fad165', label: '노랑' },
  { value: '#fbe983', label: '연노랑' },
  { value: '#b3dc6c', label: '연두' },
  { value: '#7bd148', label: '초록' },
  { value: '#16a765', label: '진초록' },
  { value: '#42d692', label: '민트' },
  // Row 3: Cyan/Blue
  { value: '#9fe1e7', label: '하늘' },
  { value: '#92e1c0', label: '청록' },
  { value: '#9fc6e7', label: '연파랑' },
  { value: '#4986e7', label: '파랑' },
  { value: '#9a9cff', label: '보라파랑' },
  { value: '#b99aff', label: '연보라' },
  // Row 4: Purple/Pink/Gray
  { value: '#c2c2c2', label: '회색' },
  { value: '#cabdbf', label: '연회색' },
  { value: '#cca6ac', label: '분홍회색' },
  { value: '#f691b2', label: '분홍' },
  { value: '#cd74e6', label: '진보라' },
  { value: '#a47ae2', label: '보라' },
]

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [calendarConfigs, setCalendarConfigs] = useState<CalendarConfig[]>([])
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set())
  const [showCalendarFilter, setShowCalendarFilter] = useState(false)
  const [editingCalendar, setEditingCalendar] = useState<string | null>(null)
  const calendarRef = useRef<any>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Load calendar configurations from integrations
  const loadCalendarConfigs = useCallback(async () => {
    try {
      const integrations = await GetIntegrations() || []
      const calendarInt = integrations.find((i: any) => i.toolType === 'google_calendar' && i.enabled)
      if (calendarInt) {
        const config = JSON.parse(calendarInt.configJson || '{}')
        console.log('[CalendarPage] Loaded config:', config)
        let calendars: CalendarConfig[] = []
        if (config.calendars && Array.isArray(config.calendars)) {
          calendars = config.calendars
          console.log('[CalendarPage] Calendars from config:', calendars)
        } else if (config.calendarId) {
          // Legacy single calendar config
          calendars = [{ id: config.calendarId, name: config.calendarName || '내 캘린더', color: '#3b82f6' }]
        }
        setCalendarConfigs(calendars)
        console.log('[CalendarPage] Loaded calendar configs:', calendars.map(c => ({ id: c.id, name: c.name })))
        
        // Load visibility from localStorage or default to all visible
        const savedVisibility = localStorage.getItem('calendarVisibility')
        if (savedVisibility) {
          const parsed = new Set(JSON.parse(savedVisibility) as string[])
          console.log('[CalendarPage] Loaded visibility from localStorage:', Array.from(parsed))
          setVisibleCalendars(parsed)
        } else {
          // Default: all calendars visible
          const allIds = new Set(calendars.map(c => c.id))
          console.log('[CalendarPage] Default visibility (all):', Array.from(allIds))
          setVisibleCalendars(allIds)
        }
      }
    } catch (err) {
      console.error('Failed to load calendar configs:', err)
    }
  }, [])

  // Toggle calendar visibility
  const toggleCalendarVisibility = (calendarId: string) => {
    setVisibleCalendars(prev => {
      const newSet = new Set(prev)
      if (newSet.has(calendarId)) {
        newSet.delete(calendarId)
      } else {
        newSet.add(calendarId)
      }
      // Save to localStorage
      localStorage.setItem('calendarVisibility', JSON.stringify(Array.from(newSet)))
      return newSet
    })
  }

  // Toggle all calendars
  const toggleAllCalendars = (visible: boolean) => {
    if (visible) {
      const allIds = calendarConfigs.map(c => c.id)
      setVisibleCalendars(new Set(allIds))
      localStorage.setItem('calendarVisibility', JSON.stringify(allIds))
    } else {
      setVisibleCalendars(new Set())
      localStorage.setItem('calendarVisibility', JSON.stringify([]))
    }
  }

  // Update calendar color
  const updateCalendarColor = async (calendarId: string, newColor: string) => {
    try {
      const integrations = await GetIntegrations() || []
      const calendarInt = integrations.find((i: any) => i.toolType === 'google_calendar' && i.enabled)
      if (calendarInt) {
        const config = JSON.parse(calendarInt.configJson || '{}')
        const updatedCalendars = (config.calendars || []).map((cal: any) =>
          cal.id === calendarId ? { ...cal, color: newColor } : cal
        )
        config.calendars = updatedCalendars
        await SaveIntegration('google_calendar', JSON.stringify(config), true)
        
        // Update local state
        setCalendarConfigs(prev => prev.map(cal =>
          cal.id === calendarId ? { ...cal, color: newColor } : cal
        ))
        setEditingCalendar(null)
      }
    } catch (err) {
      console.error('Failed to update calendar color:', err)
    }
  }

  // Raw events from DB (unfiltered)
  const [rawEvents, setRawEvents] = useState<CalendarEvent[]>([])

  // Load calendar events from DB
  const loadEventsFromDB = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
      const startDate = thirtyDaysAgo.toISOString().split('T')[0]
      const endDate = ninetyDaysLater.toISOString().split('T')[0]
      const allActivities = await GetWeekActivities(startDate, endDate) || []
      console.log('[CalendarPage] Loaded activities:', allActivities.length, allActivities.slice(0, 3))
      
      // Filter Calendar activities and map calendarId
      const calendarActivities: CalendarEvent[] = allActivities
        .filter((a: any) => a.source === 'google_calendar' || a.source?.includes('calendar'))
        .map((a: any) => {
          // Debug logging for endDateTime
          if (a.title?.includes('캠핑')) {
            console.log('[CalendarPage] Raw DB data for 캠핑:', {
              endDateTime: a.endDateTime,
              end_datetime: a.end_datetime,
              EndDateTime: a.EndDateTime,
              allKeys: Object.keys(a)
            })
          }
          return {
            id: a.id,
            source: a.source,
            title: a.title,
            summary: a.summary,
            activityDate: a.activityDate,
            activityDateTime: a.activityDateTime || a.activity_datetime,
            sourceLabel: a.sourceLabel,
            sourceIcon: a.sourceIcon,
            endDate: a.endDateTime || a.end_datetime || a.EndDateTime,
            description: a.description,
            location: a.location,
            calendarId: a.calendarId || a.calendar_id,
          }
        })
      
      console.log('[CalendarPage] Raw calendar events:', calendarActivities.length)
      setRawEvents(calendarActivities)
    } catch (err) {
      console.error('Failed to load calendar events:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Filter events based on visible calendars
  useEffect(() => {
    console.log('[CalendarPage] Filtering - rawEvents:', rawEvents.length, 'visibleCalendars:', Array.from(visibleCalendars))
    console.log('[CalendarPage] Raw events calendarIds:', rawEvents.map(e => ({ title: e.title?.substring(0, 20), calendarId: e.calendarId })))
    
    const filtered = rawEvents.filter(event => {
      const calendarId = event.calendarId
      if (!calendarId) {
        console.log('[CalendarPage] Event without calendarId (included):', event.title)
        return true
      }
      const isVisible = visibleCalendars.has(calendarId)
      console.log('[CalendarPage] Event:', event.title?.substring(0, 20), 'calendarId:', calendarId, 'visible:', isVisible)
      return isVisible
    })
    setEvents(filtered)
    console.log('[CalendarPage] Filtered events:', filtered.length, 'of', rawEvents.length)
  }, [rawEvents, visibleCalendars])

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
      await loadEventsFromDB()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }, [loadEventsFromDB])

  // Initial load - load configs and events
  useEffect(() => {
    loadCalendarConfigs()
    loadEventsFromDB()
  }, [])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowCalendarFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    // If event has datetime, use it for start; otherwise use date
    const start = event.activityDateTime || event.activityDate
    const end = event.endDate || event.activityDateTime || event.activityDate
    // Multi-day event if end date differs from start date
    const startDateOnly = start.split('T')[0]
    const endDateOnly = end ? end.split('T')[0] : startDateOnly
    const isMultiDay = endDateOnly !== startDateOnly
    // All-day if no datetime OR multi-day (Google Calendar style)
    const isAllDay = !event.activityDateTime || isMultiDay
    
    console.log('[CalendarPage] Event:', event.title, { 
      activityDateTime: event.activityDateTime, 
      endDate: event.endDate,
      startDateOnly, 
      endDateOnly, 
      isMultiDay, 
      isAllDay 
    })
    
    const fcEvent = {
      id: String(event.id),
      title: event.title || '(제목 없음)',
      start: start,
      end: end,
      extendedProps: {
        description: event.summary || event.description || '',
        location: event.location || '',
        source: event.source,
        calendarColor: color,
        activityDateTime: event.activityDateTime,
        isAllDay: isAllDay,
      },
      // All-day: colored block, Timed: text color only
      backgroundColor: isAllDay ? color : 'transparent',
      borderColor: isAllDay ? color : 'transparent',
      textColor: isAllDay ? '#ffffff' : color,
      allDay: isAllDay,
      display: isAllDay ? 'block' : 'list-item',
    }
    return fcEvent
  })
  
  console.log('[CalendarPage] Total FC events:', calendarEvents.length)

  // Custom event render for Google Calendar style
  const renderEventContent = (eventInfo: any) => {
    const event = eventInfo.event
    const color = event.extendedProps?.calendarColor || '#3b82f6'
    const isAllDay = event.extendedProps?.isAllDay
    
    // Parse time from ISO string
    const formatTime = (isoStr: string) => {
      if (!isoStr.includes('T')) return ''
      const date = new Date(isoStr)
      const hours = date.getHours()
      const minutes = date.getMinutes()
      const ampm = hours >= 12 ? '오후' : '오전'
      const displayHours = hours % 12 || 12
      return minutes === 0 ? `${ampm} ${displayHours}시` : `${ampm} ${displayHours}시 ${minutes}분`
    }
    
    const startTime = formatTime(event.startStr)
    const title = event.title || '(제목 없음)'
    
    if (isAllDay) {
      // All-day event: color block with title only (no time)
      return (
        <div 
          className="px-1 py-0.5 rounded text-xs font-medium truncate"
          style={{ 
            backgroundColor: color,
            color: '#ffffff',
          }}
        >
          {title}
        </div>
      )
    } else {
      // Timed event: time + title with text color only (no background block)
      console.log('[renderEventContent] Timed event:', { title, startTime, color })
      return (
        <div className="flex items-center gap-1 overflow-hidden" style={{ backgroundColor: 'transparent' }}>
          <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">{startTime}</span>
          <span 
            className="text-xs font-medium truncate"
            style={{ color: color, backgroundColor: 'transparent' }}
          >
            {title}
          </span>
        </div>
      )
    }
  }

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
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            오늘
          </button>
          
          {/* Calendar visibility toggle */}
          {calendarConfigs.length > 0 && (
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setShowCalendarFilter(!showCalendarFilter)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  showCalendarFilter 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Eye className="w-4 h-4" />
                내 캘린더
                <span className="text-xs bg-slate-200 px-1.5 py-0.5 rounded-full">
                  {visibleCalendars.size}/{calendarConfigs.length}
                </span>
              </button>
              
              {/* Calendar filter dropdown */}
              {showCalendarFilter && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-2">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">캘린더 표시</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleAllCalendars(true)}
                          className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          모두
                        </button>
                        <button
                          onClick={() => toggleAllCalendars(false)}
                          className="text-xs px-2 py-1 text-slate-500 hover:bg-slate-100 rounded"
                        >
                          없음
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {calendarConfigs.map(calendar => (
                      <div
                        key={calendar.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={visibleCalendars.has(calendar.id)}
                          onChange={() => toggleCalendarVisibility(calendar.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span 
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: calendar.color }}
                        />
                        <span className="text-sm text-slate-700 truncate flex-1">
                          {calendar.name || calendar.id.split('@')[0]}
                        </span>
                        
                        {/* Color picker button */}
                        <div className="relative group/color">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingCalendar(calendar.id)
                            }}
                            className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                            style={{ backgroundColor: calendar.color }}
                          />
                          
                          {/* Color palette popup */}
                          {editingCalendar === calendar.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-2">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-slate-600">색상 선택</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingCalendar(null)
                                  }}
                                  className="p-1 hover:bg-slate-100 rounded"
                                >
                                  <X className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              <div className="grid grid-cols-6 gap-1">
                                {GOOGLE_CALENDAR_COLORS.map((color) => (
                                  <button
                                    key={color.value}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      updateCalendarColor(calendar.id, color.value)
                                    }}
                                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                                      calendar.color === color.value
                                        ? 'border-slate-600 scale-110'
                                        : 'border-transparent hover:scale-105'
                                    }`}
                                    style={{ backgroundColor: color.value }}
                                    title={color.label}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {visibleCalendars.has(calendar.id) ? (
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
              eventContent={renderEventContent}
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
