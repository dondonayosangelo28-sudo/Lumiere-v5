import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react"
import { Card, cx } from "../../../components/ui/ui"
import {
  dateKey,
  parseDate,
  shiftMonth,
} from "../../../components/ui/calendarDates"
import type { Brief, Project } from "../model"
import { datePart } from "../shared"
import { EventPreviewTrigger, ActivityPreviewTrigger } from "./CalendarPreviews"
import { ActivityCreatePopover } from "./ActivityForm"
import {
  BREAKDOWN_BAR_COLORS,
  HOUR_ROW_HEIGHT,
  LATE_NIGHT_MIN_TAIL,
  buildDaySegments,
  computeContextualAddSlots,
  fmt24,
  fmtClock12,
  fmtEventClockRange,
  fmtMinutes12,
  formatPopupDate,
  getManilaCurrentMonth,
  getManilaNow,
  mondayCalendarDays,
  mondayMiniWeekdays,
  mondayShortWeekdays,
  mondayWeekDays,
  parseClockMinutes,
  parseMinutesOfDay,
  projectHoursInCurrentMonth,
  scheduledHoursForActivity,
  segmentHeightPx,
  segmentTopPx,
  shortDate,
  spans,
  type CalendarActivity,
  type CalendarMode,
  type SelectedBlockInfo,
} from "./calendar-helpers"

type Open = (
  project: Project | null,
  brief?: Brief,
  step?: number,
  restored?: boolean,
) => void

export interface CalendarViewProps {
  projects: Project[]
  open: Open
  viewPitches: () => void
  today: string
  day: string
  setDay: (day: string) => void
  month: Date
  setMonth: (month: Date) => void
  activePopoverKey: string | null
  setActivePopoverKey: (key: string | null) => void
  selectedBlock: SelectedBlockInfo | null
  setSelectedBlock: (block: SelectedBlockInfo | null) => void
  activities: CalendarActivity[]
  onCreateActivity: (data: {
    title: string
    date: string
    startTime: string
    endTime: string
    meetingLink?: string
    tags: string[]
  }) => void
  onUpdateActivity: (
    id: string,
    patch: {
      title: string
      date: string
      startTime: string
      endTime: string
      meetingLink?: string
      tags: string[]
    },
  ) => void
  onUpdateActivityNote: (id: string, note: string | undefined) => void
  onDeleteActivity: (id: string) => void
}

export default function CalendarView({
  projects,
  open,
  viewPitches,
  today,
  day,
  setDay,
  month,
  setMonth,
  activePopoverKey,
  setActivePopoverKey,
  selectedBlock,
  setSelectedBlock,
  activities,
  onCreateActivity,
  onUpdateActivity,
  onUpdateActivityNote,
  onDeleteActivity,
}: CalendarViewProps) {
  // Only approved pitches are booked events; drafts and ready pitches stay off the calendar.
  const approved = useMemo(
    () =>
      projects
        .filter((p) => p.status === "approved" && p.brief.start)
        .sort((a, b) => a.brief.start.localeCompare(b.brief.start)),
    [projects],
  )
  const [viewMode, setViewMode] = useState<CalendarMode>("week")
  const [showAllAgenda, setShowAllAgenda] = useState(false)
  const [showHoursDetail, setShowHoursDetail] = useState(false)
  const [calendarsExpanded, setCalendarsExpanded] = useState(false)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  const pick = useCallback(
    (key: string) => {
      setDay(key)
      setMonth(parseDate(key))
    },
    [setDay, setMonth],
  )

  const stepMonth = useCallback(
    (delta: number) => {
      const pageY = window.scrollY
      const gridY = gridScrollRef.current ? gridScrollRef.current.scrollTop : lastScrollPosRef.current.grid
      scrollLockoutRef.current = true
      pendingScrollHourRef.current = null

      const next = shiftMonth(month, delta)
      setMonth(next)
      setDay(dateKey(next))
      setActivePopoverKey(null)
      setSelectedBlock(null)

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gridScrollRef.current) {
            gridScrollRef.current.scrollTop = gridY
            lastScrollPosRef.current.grid = gridY
          }
          if (window.scrollY !== pageY) {
            window.scrollTo({ top: pageY, behavior: "instant" })
          }
          lastScrollPosRef.current.page = pageY
          scrollLockoutRef.current = false
        })
      })
    },
    [month, setMonth, setDay, setActivePopoverKey, setSelectedBlock],
  )

  const selectedDateObj = useMemo(() => parseDate(day), [day])
  const weekDays = useMemo(() => mondayWeekDays(selectedDateObj), [selectedDateObj])
  const miniDays = useMemo(() => mondayCalendarDays(month), [month])

  const visibleDays = useMemo(
    () => (viewMode === "day" ? [selectedDateObj] : weekDays),
    [viewMode, selectedDateObj, weekDays],
  )

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  const initialScrolledRef = useRef(false)
  const pendingScrollHourRef = useRef<number | null>(null)
  const scrollLockoutRef = useRef(false)
  const lastScrollPosRef = useRef({ page: 0, grid: 6 * HOUR_ROW_HEIGHT })

  useEffect(() => {
    const onPageScroll = () => {
      if (!scrollLockoutRef.current) {
        lastScrollPosRef.current.page = window.scrollY
      }
    }
    window.addEventListener("scroll", onPageScroll, { passive: true })
    return () => window.removeEventListener("scroll", onPageScroll)
  }, [])

  const scrollToHour = useCallback((hour: number) => {
    pendingScrollHourRef.current = hour
    scrollLockoutRef.current = true
    const pageY = window.scrollY

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gridScrollRef.current) {
          gridScrollRef.current.scrollTop = hour * HOUR_ROW_HEIGHT
          lastScrollPosRef.current.grid = hour * HOUR_ROW_HEIGHT
        }
        window.scrollTo({ top: pageY, behavior: "instant" })
        pendingScrollHourRef.current = null
        scrollLockoutRef.current = false
      })
    })
  }, [])

  useEffect(() => {
    if (viewMode === "month") return
    if (pendingScrollHourRef.current !== null) {
      const targetHour = pendingScrollHourRef.current
      scrollToHour(targetHour)
    } else if (!initialScrolledRef.current) {
      initialScrolledRef.current = true
      scrollToHour(6)
    }
  }, [viewMode, scrollToHour])

  useEffect(() => {
    if (pendingScrollHourRef.current !== null) return
    const prevGrid = lastScrollPosRef.current.grid
    const prevPage = lastScrollPosRef.current.page
    const timer = requestAnimationFrame(() => {
      if (gridScrollRef.current && pendingScrollHourRef.current === null) {
        if (Math.abs(gridScrollRef.current.scrollTop - prevGrid) > 10) {
          gridScrollRef.current.scrollTop = prevGrid
        }
      }
      if (Math.abs(window.scrollY - prevPage) > 10) {
        window.scrollTo({ top: prevPage, behavior: "instant" })
      }
    })
    return () => cancelAnimationFrame(timer)
  }, [month, day, activePopoverKey])

  const handleAgendaItemClick = useCallback(
    (targetDate: string, startMin: number) => {
      const targetHour = Math.max(0, Math.min(23, Math.floor(startMin / 60)))
      pick(targetDate)
      setActivePopoverKey(null)
      setSelectedBlock(null)
      if (viewMode === "month") {
        pendingScrollHourRef.current = targetHour
        setViewMode("week")
      } else {
        scrollToHour(targetHour)
      }
    },
    [pick, viewMode, scrollToHour, setActivePopoverKey, setSelectedBlock],
  )

  const handleGridScroll = useCallback(() => {
    if (gridScrollRef.current && !scrollLockoutRef.current) {
      lastScrollPosRef.current.grid = gridScrollRef.current.scrollTop
    }
    if (!activePopoverKey || !gridScrollRef.current) return
    if (!activePopoverKey.startsWith("grid-") && !activePopoverKey.startsWith("adjacent-add-")) {
      return
    }
    const container = gridScrollRef.current
    const target = container.querySelector<HTMLElement>(
      `[data-grid-pop-key="${activePopoverKey}"]`,
    )
    if (!target) return
    const cRect = container.getBoundingClientRect()
    if (cRect.height <= 0 || cRect.width <= 0) return
    const tRect = target.getBoundingClientRect()
    const outOfView =
      tRect.bottom <= cRect.top ||
      tRect.top >= cRect.bottom ||
      tRect.right <= cRect.left ||
      tRect.left >= cRect.right
    if (outOfView) {
      setActivePopoverKey(null)
    }
  }, [activePopoverKey, setActivePopoverKey])

  // Combined agenda items (approved events + calendar activities)
  type AgendaItem =
    | { kind: "pitch"; id: string; dateKey: string; sortKey: string; project: Project }
    | { kind: "activity"; id: string; dateKey: string; sortKey: string; activity: CalendarActivity }

  const manilaMonthStartKey = useMemo(() => {
    const now = getManilaNow()
    return `${now.dateKey.slice(0, 7)}-01`
  }, [])

  const eligibleAllItems = useMemo<AgendaItem[]>(() => {
    const items: AgendaItem[] = [
      ...approved
        .filter((p) => {
          const endKey = datePart(p.brief.end || p.brief.start)
          return endKey >= manilaMonthStartKey
        })
        .map((p) => ({
          kind: "pitch" as const,
          id: p.id,
          dateKey: datePart(p.brief.start),
          sortKey: p.brief.start,
          project: p,
        })),
      ...activities
        .filter((a) => a.date >= manilaMonthStartKey)
        .map((a) => ({
          kind: "activity" as const,
          id: a.id,
          dateKey: a.date,
          sortKey: `${a.date}T${a.startTime}`,
          activity: a,
        })),
    ]
    return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [approved, activities, manilaMonthStartKey])

  const dayItems = useMemo(
    () =>
      eligibleAllItems.filter((item) =>
        item.kind === "pitch" ? spans(item.project, day) : item.activity.date === day,
      ),
    [eligibleAllItems, day],
  )
  const agendaItems = showAllAgenda || dayItems.length === 0 ? eligibleAllItems : dayItems

  // Time breakdown derived from scheduled hours of Approved events and Calendar activities scoped to the actual current month in Asia/Manila
  const currentMonth = useMemo(() => getManilaCurrentMonth(), [])

  // Qualifying approved events in actual current month in Asia/Manila (each counted once)
  const currentMonthApproved = useMemo(
    () =>
      approved.filter((p) =>
        projectHoursInCurrentMonth(p, currentMonth.startMs, currentMonth.endMs) > 0,
      ),
    [approved, currentMonth],
  )

  // Qualifying manual activities in actual current month in Asia/Manila (each counted once)
  const currentMonthActivities = useMemo(
    () =>
      activities.filter(
        (a) => a.date >= currentMonth.startKey && a.date <= currentMonth.endKey,
      ),
    [activities, currentMonth],
  )

  const timeBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; hours: number; color: string }>()
    let colorIdx = 0
    currentMonthApproved.forEach((p) => {
      const label = p.brief.theme?.trim() || "Approved events"
      const hrs = projectHoursInCurrentMonth(p, currentMonth.startMs, currentMonth.endMs)
      if (hrs <= 0) return
      const existing = map.get(label)
      if (existing) {
        existing.hours += hrs
      } else {
        map.set(label, {
          label,
          hours: hrs,
          color: BREAKDOWN_BAR_COLORS[colorIdx++ % BREAKDOWN_BAR_COLORS.length],
        })
      }
    })
    currentMonthActivities.forEach((a) => {
      const label = (a.tags && a.tags[0]) || a.type || "Activities"
      const hrs = scheduledHoursForActivity(a)
      if (hrs <= 0) return
      const existing = map.get(label)
      if (existing) {
        existing.hours += hrs
      } else {
        map.set(label, {
          label,
          hours: hrs,
          color: BREAKDOWN_BAR_COLORS[colorIdx++ % BREAKDOWN_BAR_COLORS.length],
        })
      }
    })
    const entries = Array.from(map.values())
    const totalHours = entries.reduce((sum, item) => sum + item.hours, 0)
    return {
      totalHours,
      rows: entries.map((item) => ({
        ...item,
        pct:
          totalHours > 0
            ? Math.max(12, Math.min(100, Math.round((item.hours / totalHours) * 100)))
            : 0,
      })),
    }
  }, [currentMonthApproved, currentMonthActivities, currentMonth])

  const visibleColumnsData = useMemo(() => {
    let maxLateBottomPx = 0
    const columns = visibleDays.map((d) => {
      const colKey = dateKey(d)
      const segments = buildDaySegments(colKey, approved, activities, 0, 24 * 60)
      const contextualSlots = computeContextualAddSlots(colKey, segments, selectedBlock)
      for (const seg of segments) {
        const bottom = segmentTopPx(seg) + segmentHeightPx(seg)
        if (bottom > maxLateBottomPx) maxLateBottomPx = bottom
      }
      for (const slot of contextualSlots) {
        const bottom = slot.topPx + slot.heightPx
        if (bottom > maxLateBottomPx) maxLateBottomPx = bottom
      }
      return { dateObj: d, colKey, segments, contextualSlots }
    })

    const lastRowHeight = Math.max(
      LATE_NIGHT_MIN_TAIL,
      Math.ceil(maxLateBottomPx - 23 * HOUR_ROW_HEIGHT + 6),
    )
    const totalGridHeightPx = 23 * HOUR_ROW_HEIGHT + lastRowHeight

    return { columns, lastRowHeight, totalGridHeightPx }
  }, [visibleDays, approved, activities, selectedBlock])

  const monthHeading = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const formatHourGutter = (h: number) => {
    const h12 = h % 12 || 12
    const period = h >= 12 ? "PM" : "AM"
    return `${h12}:00 ${period}`
  }

  return (
    <div
      className="dashboard-surfaces w-full font-sans text-foreground"
      aria-label="Event Manager Calendar"
    >
      <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-[425px_minmax(0,1fr)] lg:items-stretch">
        {/* ─── LEFT RAIL (425 px desktop width, 1.25× original dimensions) ─── */}
        <aside
          className="flex min-w-0 flex-col gap-4"
          aria-label="Calendar controls and summary"
        >
          {/* 1. Mini Month Card (~456 px tall on desktop, distributed week rows, compact week highlight) */}
          <Card className="flex flex-col p-4 lg:h-[456px]" aria-labelledby="em-mini-month-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="em-mini-month-heading" className="text-[15px] font-semibold text-foreground" aria-live="polite">
                {monthHeading}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.currentTarget.focus({ preventScroll: true })
                  }}
                  onClick={(e) => {
                    e.currentTarget.focus({ preventScroll: true })
                    stepMonth(-1)
                  }}
                  className="grid size-7 place-items-center rounded-full border border-line text-muted-foreground transition-colors hover:bg-fg/10 hover:text-foreground"
                >
                  <ChevronLeft size={14} strokeWidth={1.8} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.currentTarget.focus({ preventScroll: true })
                  }}
                  onClick={(e) => {
                    e.currentTarget.focus({ preventScroll: true })
                    stepMonth(1)
                  }}
                  className="grid size-7 place-items-center rounded-full border border-line text-muted-foreground transition-colors hover:bg-fg/10 hover:text-foreground"
                >
                  <ChevronRight size={14} strokeWidth={1.8} aria-hidden />
                </button>
              </div>
            </div>

            <div
              className="mt-3.5 mb-1.5 grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground lg:mt-4 lg:mb-2"
              aria-hidden
            >
              {mondayMiniWeekdays.map((w, idx) => (
                <span key={idx}>{w}</span>
              ))}
            </div>

            <div
              role="grid"
              aria-label="Mini month dates"
              className="space-y-[3px] lg:grid lg:flex-1 lg:grid-rows-6 lg:gap-0 lg:space-y-0"
            >
              {Array.from({ length: 6 }, (_, rowIdx) => {
                const rowDates = miniDays.slice(rowIdx * 7, rowIdx * 7 + 7)
                const rowStartKey = dateKey(rowDates[0])
                const rowEndKey = dateKey(rowDates[6])
                const isSelectedWeek = day >= rowStartKey && day <= rowEndKey

                return (
                  <div
                    key={rowStartKey}
                    role="row"
                    className={cx(
                      "grid h-[36px] w-full grid-cols-7 items-center rounded-full transition-colors self-center lg:h-[44px]",
                      isSelectedWeek && "bg-fg/[0.06]",
                    )}
                  >
                    {rowDates.map((d) => {
                      const key = dateKey(d)
                      const inMonth = d.getMonth() === month.getMonth()
                      const isSelected = key === day
                      const isWeekBoundary =
                        isSelectedWeek && (key === rowStartKey || key === rowEndKey)
                      const hasApproved = approved.some((p) => spans(p, key))
                      const hasActivity = activities.some((a) => a.date === key)
                      const hasBooking = hasApproved || hasActivity

                      return (
                        <button
                          key={key}
                          type="button"
                          role="gridcell"
                          aria-selected={isSelected}
                          aria-current={key === today ? "date" : undefined}
                          aria-label={`${d.toLocaleDateString("en-PH", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}${hasBooking ? ", has scheduled item" : ""}`}
                          onClick={() => {
                            pick(key)
                            setActivePopoverKey(null)
                            setSelectedBlock(null)
                          }}
                          className={cx(
                            "relative mx-auto grid size-[30px] place-items-center rounded-full text-[12px] tabular-nums transition-colors lg:size-[36px] lg:text-[13px]",
                            isSelected || isWeekBoundary
                              ? "bg-invert font-semibold text-invert-fg"
                              : hasBooking
                                ? "bg-fg/[0.08] font-semibold text-foreground hover:bg-fg/15"
                                : inMonth
                                  ? "text-foreground hover:bg-fg/10"
                                  : "text-muted-foreground/50",
                            key === today && !isSelected && !isWeekBoundary && "ring-1 ring-fg/30",
                          )}
                        >
                          <span>{d.getDate()}</span>
                          {hasBooking && !isSelected && !isWeekBoundary && (
                            <span
                              className={cx(
                                "absolute bottom-[2.5px] size-[3.5px] rounded-full lg:bottom-[3px] lg:size-[4px]",
                                hasApproved ? "bg-success" : "bg-fg/50",
                              )}
                              aria-hidden
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* 2. Agenda Card */}
          <Card className="p-4" aria-labelledby="em-agenda-heading">
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              <h2
                id="em-agenda-heading"
                className="truncate text-[15px] font-semibold text-foreground"
              >
                Upcoming events today
              </h2>
              <button
                type="button"
                onClick={() => setShowAllAgenda((v) => !v)}
                className="shrink-0 whitespace-nowrap text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showAllAgenda ? "Selected day" : "View all"}
              </button>
            </div>

            {dayItems.length === 0 && !showAllAgenda && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                No events on {shortDate(day)}.{" "}
                {eligibleAllItems.length > 0 ? "Scheduled items:" : ""}
              </p>
            )}

            {agendaItems.length === 0 ? (
              <div className="mt-2.5 space-y-2">
                <p className="text-[12px] text-muted-foreground">
                  No upcoming events or activities scheduled this month.
                </p>
                <button
                  type="button"
                  onClick={viewPitches}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  View event pitches <ArrowRight size={12} aria-hidden />
                </button>
              </div>
            ) : (
              <ul className="mt-3 space-y-2" aria-label="Agenda events">
                {agendaItems.slice(0, 5).map((item, idx) => {
                  if (item.kind === "pitch") {
                    const p = item.project
                    const isOnSelectedDay = spans(p, day)
                    const targetDate = datePart(p.brief.start)
                    const startMin = parseMinutesOfDay(p.brief.start, 9 * 60)

                    return (
                      <li key={`pitch-${p.id}`}>
                        <button
                          type="button"
                          onClick={() => handleAgendaItemClick(targetDate, startMin)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-fg/[0.05]"
                        >
                          <span
                            className={cx(
                              "grid size-[15px] shrink-0 place-items-center rounded-[4px]",
                              isOnSelectedDay || idx === 0
                                ? "bg-success text-white"
                                : "border border-line bg-elev",
                            )}
                            aria-hidden
                          >
                            {(isOnSelectedDay || idx === 0) && (
                              <Check size={10} strokeWidth={3} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                            {p.brief.title}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                            {fmtEventClockRange(p)}
                          </span>
                        </button>
                      </li>
                    )
                  }

                  const act = item.activity
                  const isOnSelectedDay = act.date === day
                  const targetDate = act.date
                  const startMin = parseClockMinutes(act.startTime, 9 * 60)

                  return (
                    <li key={`act-${act.id}`}>
                      <button
                        type="button"
                        onClick={() => handleAgendaItemClick(targetDate, startMin)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-fg/[0.05]"
                      >
                        <span
                          className={cx(
                            "grid size-[15px] shrink-0 place-items-center rounded-[4px]",
                            isOnSelectedDay
                              ? "bg-invert text-invert-fg"
                              : "border border-line bg-elev",
                          )}
                          aria-hidden
                        >
                          {isOnSelectedDay && <Check size={10} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                          {act.title}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                          {fmtClock12(act.startTime)} - {fmtClock12(act.endTime)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* 3. Time Breakdown Card */}
          <Card className="p-4" aria-labelledby="em-breakdown-heading">
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              <h2
                id="em-breakdown-heading"
                className="truncate text-[15px] font-semibold text-foreground"
              >
                Time breakdown
              </h2>
              <button
                type="button"
                onClick={() => setShowHoursDetail((v) => !v)}
                className="shrink-0 whitespace-nowrap text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showHoursDetail ? `${timeBreakdown.totalHours.toFixed(1)}h` : "View all"}
              </button>
            </div>

            {timeBreakdown.rows.length === 0 ? (
              <p className="mt-2.5 text-[12px] text-muted-foreground">
                No scheduled hours this month.
              </p>
            ) : (
              <div className="mt-3.5 space-y-3">
                {(showHoursDetail ? timeBreakdown.rows : timeBreakdown.rows.slice(0, 4)).map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3"
                    title={`${row.label}: ${row.hours.toFixed(1)} scheduled hours (${row.pct}%)`}
                  >
                    <span className="truncate text-[12px] text-muted-foreground">
                      {row.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-fg/[0.08]">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${row.pct}%`, background: row.color }}
                        />
                      </div>
                      {showHoursDetail && (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {row.hours.toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 4. Collapsible My Calendars Card */}
          <Card className="px-4 py-3.5" aria-label="My calendars">
            <button
              type="button"
              aria-expanded={calendarsExpanded}
              onClick={() => setCalendarsExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-[15px] font-semibold text-foreground">
                My calendars
              </span>
              <span className="grid size-7 place-items-center rounded-full border border-line text-muted-foreground transition-transform">
                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  className={cx(
                    "transition-transform duration-200",
                    calendarsExpanded && "rotate-180",
                  )}
                  aria-hidden
                />
              </span>
            </button>

            {calendarsExpanded && (
              <div className="mt-3 space-y-2 border-t border-line pt-2.5 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <span className="grid size-[14px] place-items-center rounded-[4px] bg-success text-white">
                      <Check size={9} strokeWidth={3} aria-hidden />
                    </span>
                    Approved events
                  </span>
                  <span className="rounded-full bg-fg/[0.08] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                    {currentMonthApproved.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <span className="grid size-[14px] place-items-center rounded-[4px] bg-invert text-invert-fg">
                      <Check size={9} strokeWidth={3} aria-hidden />
                    </span>
                    Activities
                  </span>
                  <span className="rounded-full bg-fg/[0.08] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                    {currentMonthActivities.length}
                  </span>
                </div>
              </div>
            )}
          </Card>
        </aside>

        {/* ─── MAIN SCHEDULE PANEL (stretches on desktop to align with left rail) ─── */}
        <Card
          className="flex min-w-0 flex-col p-4 sm:p-5 lg:h-full"
          aria-label="Scheduled events calendar"
        >
          {/* Main Panel Header */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <h2
              className="text-[22px] font-bold tracking-tight text-foreground sm:text-[24px]"
              aria-live="polite"
            >
              {monthHeading}
            </h2>

            {/* Compact Month / Week / Day Segmented Control */}
            <div
              role="group"
              aria-label="Calendar view mode"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-fg/[0.04] p-1"
            >
              {(["month", "week", "day"] as const).map((mode) => {
                const active = viewMode === mode
                const label = mode === "month" ? "Month" : mode === "week" ? "Week" : "Day"
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setViewMode(mode)
                      setActivePopoverKey(null)
                      setSelectedBlock(null)
                    }}
                    className={cx(
                      "h-7 rounded-full px-3.5 text-[12px] font-semibold transition-colors",
                      active
                        ? "bg-invert text-invert-fg shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {viewMode === "month" ? (
            /* ─── MONTH VIEW ─── */
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="mb-2 grid grid-cols-7 gap-1.5">
                {mondayShortWeekdays.map((w) => (
                  <div
                    key={w}
                    className="flex h-[38px] items-center justify-center rounded-lg bg-fg/[0.04] text-[12px] font-semibold text-muted-foreground"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div
                role="grid"
                aria-label="Scheduled events and activities by day"
                className="grid flex-1 auto-rows-fr grid-cols-7 gap-1.5"
              >
                {miniDays.map((d) => {
                  const key = dateKey(d)
                  const inMonth = d.getMonth() === month.getMonth()
                  const isSelected = key === day
                  const dayPitches = approved.filter((p) => spans(p, key))
                  const dayActivities = activities.filter((a) => a.date === key)
                  const totalCount = dayPitches.length + dayActivities.length

                  return (
                    <div
                      key={key}
                      role="gridcell"
                      aria-selected={isSelected}
                      onClick={() => pick(key)}
                      className={cx(
                        "flex min-h-[88px] cursor-pointer flex-col rounded-xl border p-1.5 transition-colors",
                        isSelected
                          ? "border-foreground bg-fg/[0.05]"
                          : "border-line bg-fg/[0.02] hover:bg-fg/[0.05]",
                        !inMonth && "opacity-45",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cx(
                            "grid size-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
                            isSelected && "bg-invert text-invert-fg",
                          )}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayPitches.slice(0, 2).map((p) => {
                          const popKey = `month-pitch-${key}-${p.id}`
                          return (
                            <div key={p.id} onClick={(e) => e.stopPropagation()}>
                              <EventPreviewTrigger
                                project={p}
                                openPitch={open}
                                openState={activePopoverKey === popKey}
                                onOpenChange={(next) => {
                                  if (next) {
                                    pick(key)
                                    setActivePopoverKey(popKey)
                                  } else if (activePopoverKey === popKey) {
                                    setActivePopoverKey(null)
                                  }
                                }}
                                className="flex w-full items-center gap-1.5 truncate rounded-md border border-line bg-elev px-1.5 py-0.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-chip"
                              >
                                <span
                                  className="size-1.5 shrink-0 rounded-full bg-success"
                                  aria-hidden
                                />
                                <span className="truncate">{p.brief.title}</span>
                              </EventPreviewTrigger>
                            </div>
                          )
                        })}
                        {dayActivities.slice(0, Math.max(0, 2 - dayPitches.length)).map((act) => {
                          const popKey = `month-act-${key}-${act.id}`
                          return (
                            <div key={act.id} onClick={(e) => e.stopPropagation()}>
                              <ActivityPreviewTrigger
                                activity={act}
                                onUpdate={onUpdateActivity}
                                onUpdateNote={onUpdateActivityNote}
                                onDelete={onDeleteActivity}
                                openState={activePopoverKey === popKey}
                                onOpenChange={(next) => {
                                  if (next) {
                                    pick(key)
                                    setActivePopoverKey(popKey)
                                  } else if (activePopoverKey === popKey) {
                                    setActivePopoverKey(null)
                                  }
                                }}
                                className="flex w-full items-center gap-1.5 truncate rounded-md border border-line bg-fg/[0.06] px-1.5 py-0.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-elev"
                              >
                                <span
                                  className="size-1.5 shrink-0 rounded-full bg-fg/50"
                                  aria-hidden
                                />
                                <span className="truncate">{act.title}</span>
                              </ActivityPreviewTrigger>
                            </div>
                          )
                        })}
                        {totalCount > 2 && (
                          <span className="block px-1 text-[10px] font-medium text-muted-foreground">
                            +{totalCount - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ─── WEEK & DAY TIME-GRID VIEW (~52 px date headers, ~74 px hourly rows, stretches on desktop) ─── */
            <div
              onScroll={handleGridScroll}
              className="mt-4 flex min-h-0 flex-1 flex-col overflow-x-auto lg:overflow-y-hidden"
            >
              <div
                className={cx(
                  viewMode === "week" ? "min-w-[620px]" : "w-full",
                  "flex flex-1 flex-col lg:min-h-0",
                )}
              >
                {/* Date Headers Row (~52 px height) */}
                <div className="mb-2.5 flex shrink-0 items-center gap-1.5">
                  <div className="w-[68px] shrink-0 whitespace-nowrap pl-1 text-[11px] font-semibold text-muted-foreground">
                    GMT +8
                  </div>
                  <div
                    className={cx(
                      "grid flex-1 gap-1.5",
                      viewMode === "week" ? "grid-cols-7" : "grid-cols-1",
                    )}
                  >
                    {visibleDays.map((d) => {
                      const key = dateKey(d)
                      const isSelected = key === day
                      const dowIndex = (d.getDay() + 6) % 7
                      const label =
                        viewMode === "day"
                          ? d.toLocaleDateString("en-US", {
                              weekday: "long",
                              month: "short",
                              day: "numeric",
                            })
                          : `${mondayShortWeekdays[dowIndex]} ${d.getDate()}`

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            pick(key)
                            setActivePopoverKey(null)
                            setSelectedBlock(null)
                          }}
                          aria-pressed={isSelected}
                          className={cx(
                            "flex h-[52px] items-center justify-center whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold transition-colors",
                            isSelected
                              ? "bg-invert text-invert-fg shadow-2xs"
                              : "bg-fg/[0.04] text-foreground hover:bg-fg/[0.08]",
                          )}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Scrollable Hourly Grid (~74 px rows, desktop fills remaining height, mobile stays compact) */}
                <div className="relative h-[530px] lg:h-auto lg:min-h-0 lg:flex-1">
                  <div
                    ref={gridScrollRef}
                    onScroll={handleGridScroll}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && !activePopoverKey && selectedBlock) {
                        e.preventDefault()
                        setSelectedBlock(null)
                      }
                    }}
                    className="h-full overflow-y-auto pr-0.5 lg:absolute lg:inset-0"
                  >
                    <div
                      className="relative flex pt-[6px] pb-[4px]"
                      style={{ height: `${visibleColumnsData.totalGridHeightPx + 10}px` }}
                    >
                      {/* Narrow Time Gutter */}
                      <div className="w-[68px] shrink-0 select-none" aria-hidden>
                        {hours.map((h) => (
                          <div
                            key={h}
                            style={{
                              height: `${h < 23 ? HOUR_ROW_HEIGHT : visibleColumnsData.lastRowHeight}px`,
                            }}
                            className="pr-2.5 text-right text-[11px] font-medium tabular-nums leading-none text-muted-foreground"
                          >
                            <span className="inline-block whitespace-nowrap pt-[1px]">
                              {formatHourGutter(h)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Day Columns & Fine Hourly Dividers */}
                      <div
                        className={cx(
                          "relative grid flex-1 gap-1.5",
                          viewMode === "week" ? "grid-cols-7" : "grid-cols-1",
                        )}
                      >
                        {/* Horizontal Hour Lines */}
                        <div
                          className="pointer-events-none absolute inset-0 flex flex-col"
                          aria-hidden
                        >
                          {hours.map((h) => (
                            <div
                              key={h}
                              style={{
                                height: `${h < 23 ? HOUR_ROW_HEIGHT : visibleColumnsData.lastRowHeight}px`,
                              }}
                              className="border-t border-line"
                            />
                          ))}
                        </div>

                        {/* Day Columns with Positioned Event Blocks & Contextual Dashed Add Slots */}
                        {visibleColumnsData.columns.map(({ colKey, segments, contextualSlots }) => (
                          <div
                            key={colKey}
                            onClick={(e) => {
                              // Scope selection reset strictly to clicks on the empty grid
                              if (e.target !== e.currentTarget) return
                              pick(colKey)
                              setActivePopoverKey(null)
                              setSelectedBlock(null)
                            }}
                            className="relative h-full"
                          >
                            {/* Scheduled Segments (Approved Pitches & Calendar Activities) */}
                            {segments.map((seg) => {
                              const topPx = segmentTopPx(seg)
                              const heightPx = segmentHeightPx(seg)
                              const widthPct = 100 / seg.totalCols
                              const leftPct = seg.col * widthPct

                              if (seg.kind === "pitch") {
                                const popKey = `grid-pitch-${colKey}-${seg.project.id}`
                                return (
                                  <div
                                    key={`pitch-${colKey}-${seg.project.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <EventPreviewTrigger
                                      project={seg.project}
                                      openPitch={open}
                                      openState={activePopoverKey === popKey}
                                      dataGridPopKey={popKey}
                                      dataGridBlock
                                      onOpenChange={(next, details) => {
                                        if (next) {
                                          pick(colKey)
                                          setActivePopoverKey(popKey)
                                          setSelectedBlock({
                                            kind: "pitch",
                                            id: seg.project.id,
                                            colKey,
                                            date: colKey,
                                            startMin: seg.startMin,
                                            endMin: seg.endMin,
                                            topPx,
                                            heightPx,
                                            leftPct,
                                            widthPct,
                                          })
                                          return
                                        }
                                        const target = (details?.event as Event | undefined)
                                          ?.target as Element | null
                                        const isImperative =
                                          !details?.reason || details.reason === "none"
                                        const keepSelection =
                                          isImperative ||
                                          details?.reason === "escape-key" ||
                                          details?.reason === "trigger-press" ||
                                          (details?.reason === "outside-press" &&
                                            !!target?.closest?.(
                                              "[data-contextual-add-slot], [data-grid-block]",
                                            ))
                                        if (activePopoverKey === popKey) {
                                          setActivePopoverKey(null)
                                          if (!keepSelection) setSelectedBlock(null)
                                        }
                                      }}
                                      ariaLabel={`${seg.project.brief.title}, ${fmtMinutes12(seg.startMin)} to ${fmtMinutes12(seg.endMin)}`}
                                      style={{
                                        top: `${topPx}px`,
                                        height: `${heightPx}px`,
                                        left: `calc(${leftPct}% + 1px)`,
                                        width: `calc(${widthPct}% - 2px)`,
                                      }}
                                      className="absolute z-10 flex flex-col items-start justify-start overflow-hidden rounded-xl border border-line bg-elev py-2.5 pr-2.5 pl-3.5 text-left text-foreground shadow-2xs transition-colors hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground"
                                    >
                                      <span
                                        className="pointer-events-none absolute inset-y-2 left-1.5 w-[3px] rounded-full bg-success"
                                        aria-hidden
                                      />
                                      <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                                        {seg.project.brief.title}
                                      </span>
                                      <span className="mt-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                                        {fmtMinutes12(seg.startMin)} - {fmtMinutes12(seg.endMin)}
                                      </span>
                                    </EventPreviewTrigger>
                                  </div>
                                )
                              }

                              const popKey = `grid-act-${colKey}-${seg.activity.id}`
                              return (
                                <div
                                  key={`act-${colKey}-${seg.activity.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ActivityPreviewTrigger
                                    activity={seg.activity}
                                    onUpdate={onUpdateActivity}
                                    onUpdateNote={onUpdateActivityNote}
                                    onDelete={onDeleteActivity}
                                    openState={activePopoverKey === popKey}
                                    dataGridPopKey={popKey}
                                    dataGridBlock
                                    onOpenChange={(next, details) => {
                                      if (next) {
                                        pick(colKey)
                                        setActivePopoverKey(popKey)
                                        setSelectedBlock({
                                          kind: "activity",
                                          id: seg.activity.id,
                                          colKey,
                                          date: colKey,
                                          startMin: seg.startMin,
                                          endMin: seg.endMin,
                                          topPx,
                                          heightPx,
                                          leftPct,
                                          widthPct,
                                        })
                                        return
                                      }
                                      const target = (details?.event as Event | undefined)
                                        ?.target as Element | null
                                      const isImperative =
                                        !details?.reason || details.reason === "none"
                                      const keepSelection =
                                        isImperative ||
                                        details?.reason === "escape-key" ||
                                        details?.reason === "trigger-press" ||
                                        (details?.reason === "outside-press" &&
                                          !!target?.closest?.(
                                            "[data-contextual-add-slot], [data-grid-block]",
                                          ))
                                      if (activePopoverKey === popKey) {
                                        setActivePopoverKey(null)
                                        if (!keepSelection) setSelectedBlock(null)
                                      }
                                    }}
                                    ariaLabel={`${seg.activity.title}, ${fmtMinutes12(seg.startMin)} to ${fmtMinutes12(seg.endMin)}`}
                                    style={{
                                      top: `${topPx}px`,
                                      height: `${heightPx}px`,
                                      left: `calc(${leftPct}% + 1px)`,
                                      width: `calc(${widthPct}% - 2px)`,
                                    }}
                                    className="absolute z-10 flex flex-col items-start justify-start overflow-hidden rounded-xl border border-line bg-fg/[0.06] py-2.5 pr-2.5 pl-3.5 text-left text-foreground shadow-2xs transition-colors hover:bg-elev focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground"
                                  >
                                    <span
                                      className="pointer-events-none absolute inset-y-2 left-1.5 w-[3px] rounded-full bg-fg/45"
                                      aria-hidden
                                    />
                                    <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                                      {seg.activity.title}
                                    </span>
                                    <span className="mt-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                                      {fmtMinutes12(seg.startMin)} - {fmtMinutes12(seg.endMin)}
                                    </span>
                                  </ActivityPreviewTrigger>
                                </div>
                              )
                            })}

                            {/* Contextual Dashed Add Slots on Free Edges Above & Below Selected Booking/Group */}
                            {contextualSlots.map((slot) => {
                              const isAddOpen = activePopoverKey === slot.key
                              return (
                                <ActivityCreatePopover
                                  key={slot.key}
                                  openState={isAddOpen}
                                  onOpenChange={(next, details) => {
                                    if (next) {
                                      setActivePopoverKey(slot.key)
                                      return
                                    }
                                    const target = (details?.event as Event | undefined)
                                      ?.target as Element | null
                                    const isImperative =
                                      !details?.reason || details.reason === "none"
                                    const keepSelection =
                                      isImperative ||
                                      details?.reason === "escape-key" ||
                                      details?.reason === "close-press" ||
                                      details?.reason === "trigger-press" ||
                                      (details?.reason === "outside-press" &&
                                        !!target?.closest?.(
                                          "[data-contextual-add-slot], [data-grid-block]",
                                        ))
                                    if (activePopoverKey === slot.key) {
                                      setActivePopoverKey(null)
                                      if (!keepSelection) setSelectedBlock(null)
                                    }
                                  }}
                                  defaultDate={slot.date}
                                  defaultStartTime={fmt24(slot.startMin)}
                                  defaultEndTime={fmt24(slot.endMin)}
                                  onCreate={(data) => {
                                    onCreateActivity(data)
                                    setActivePopoverKey(null)
                                    setSelectedBlock(null)
                                  }}
                                  side="right"
                                  align="center"
                                  sideOffset={8}
                                  dataContextualAddSlot
                                  dataGridPopKey={slot.key}
                                  onTriggerClick={(e) => e.stopPropagation()}
                                  triggerAriaLabel={`Add activity from ${fmtMinutes12(slot.startMin)} to ${fmtMinutes12(slot.endMin)} on ${formatPopupDate(slot.date)}`}
                                  triggerStyle={{
                                    top: `${slot.topPx}px`,
                                    left: "1px",
                                    width: "calc(100% - 2px)",
                                    height: `${slot.heightPx}px`,
                                  }}
                                  triggerClassName="absolute z-20 flex w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-fg/[0.03] text-foreground transition-colors hover:border-fg/35 hover:bg-fg/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground"
                                >
                                  <span
                                    className={cx(
                                      "pointer-events-none grid place-items-center rounded-full border border-line bg-card text-foreground shadow-2xs transition-transform",
                                      slot.heightPx < 40 ? "size-6" : "size-7",
                                    )}
                                  >
                                    <Plus size={15} strokeWidth={2} aria-hidden />
                                  </span>
                                </ActivityCreatePopover>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

