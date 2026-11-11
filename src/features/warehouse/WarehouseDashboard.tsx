import { useMemo, useState } from "react"
import {
  Boxes,
  PackageCheck,
  AlertTriangle,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  Search,
  MapPin,
  Clock,
  User,
  X,
  type LucideIcon,
} from "lucide-react"
import { Badge, Button, Card, PageHeader, StatCard, cx } from "../../components/ui"
import { useOperationsStore } from "../../operations/store"
import type { WarehouseOrderRequest } from "../../operations/types"
import { calendarDays, shiftMonth } from "../../components/calendarDates"
import { MANILA_TIME_ZONE } from "../../auth/manilaTime"

interface WarehouseDashboardProps {
  onNavigate: (route: string, eventId?: string) => void
}

const MANILA_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

/**
 * Returns the current date in Asia/Manila timezone as a standard Date object set to noon.
 */
function getNowInManila(): Date {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })
  const parts = formatter.formatToParts(now)
  let year = now.getFullYear()
  let month = now.getMonth() + 1
  let day = now.getDate()
  for (const part of parts) {
    if (part.type === "year") year = parseInt(part.value, 10)
    if (part.type === "month") month = parseInt(part.value, 10)
    if (part.type === "day") day = parseInt(part.value, 10)
  }
  return new Date(year, month - 1, day, 12, 0, 0)
}

/**
 * Parses an ISO date/time string into a Manila date key "YYYY-MM-DD".
 */
function getManilaDateKey(isoString: string): string {
  if (!isoString) return ""
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) {
      // Fallback: take first 10 characters if format is YYYY-MM-DD...
      return isoString.slice(0, 10)
    }
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: MANILA_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    return formatter.format(d) // YYYY-MM-DD
  } catch {
    return isoString.slice(0, 10)
  }
}

/**
 * Formats a Date object to "YYYY-MM-DD" in local/noon representation.
 */
function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Formats date range label (e.g., "2026-05-28 - 2026-05-29").
 */
function formatDateRange(startIso: string, endIso: string): string {
  const s = getManilaDateKey(startIso)
  const e = getManilaDateKey(endIso)
  if (!s && !e) return "Dates TBD"
  if (s && e && s !== e) return `${s} - ${e}`
  return s || e
}

/**
 * Extracts a compact date tile representation from start date:
 * { month: "MAY", day: "29", weekday: "Fri" }
 */
function getCompactDateTile(startIso: string): { month: string; day: string; weekday: string } {
  if (!startIso) return { month: "---", day: "--", weekday: "---" }
  try {
    const d = new Date(startIso)
    if (isNaN(d.getTime())) return { month: "---", day: "--", weekday: "---" }
    const mStr = d.toLocaleDateString("en-US", { timeZone: MANILA_TIME_ZONE, month: "short" }).toUpperCase()
    const dStr = d.toLocaleDateString("en-US", { timeZone: MANILA_TIME_ZONE, day: "numeric" })
    const wStr = d.toLocaleDateString("en-US", { timeZone: MANILA_TIME_ZONE, weekday: "short" })
    return { month: mStr, day: dStr, weekday: wStr }
  } catch {
    return { month: "---", day: "--", weekday: "---" }
  }
}

/**
 * Derives lifecycle status from warehouse order progress.
 */
function getEventLifecycleStatus(order: WarehouseOrderRequest): {
  label: string
  kind: "completed" | "review" | "dispatched" | "preparing"
} {
  if (order.warehouseClosed) {
    return { label: "Completed", kind: "completed" }
  }
  if (order.returnChecklist) {
    return { label: "Ready for Review", kind: "review" }
  }
  if (order.outboundDeparture) {
    return { label: "Dispatched", kind: "dispatched" }
  }
  return { label: "Preparing", kind: "preparing" }
}

function EventStatusBadge({ status }: { status: ReturnType<typeof getEventLifecycleStatus> }) {
  if (status.kind === "dispatched") {
    return (
      <span className="inline-flex items-center rounded-full bg-[#2563eb]/15 px-2.5 py-1 text-[12px] font-semibold leading-4 text-[#2563eb] ring-1 ring-inset ring-[#2563eb]/25 dark:text-[#60a5fa] dark:ring-[#60a5fa]/20">
        {status.label}
      </span>
    )
  }
  if (status.kind === "preparing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.08] px-2.5 py-1 text-[12px] font-semibold leading-4 text-foreground ring-1 ring-inset ring-fg/10 dark:bg-fg/[0.12] dark:text-foreground dark:ring-fg/15">
        <span className="size-1.5 rounded-full bg-fg/70 dark:bg-fg/80" aria-hidden="true" />
        {status.label}
      </span>
    )
  }
  const tone = status.kind === "completed" ? "success" : "warning"
  return <Badge tone={tone}>{status.label}</Badge>
}

function KpiTileCard({
  icon: Icon,
  title,
  value,
  description,
  accentClass,
  danger = false,
}: {
  icon: LucideIcon
  title: string
  value: number
  description: string
  accentClass?: string
  danger?: boolean
}) {
  if (!accentClass && !danger) {
    return (
      <StatCard
        icon={Icon}
        title={title}
        value={value.toLocaleString()}
        description={description}
        aligned
        showHandle={false}
        watermark={false}
      />
    )
  }
  return (
    <Card className="stat-card relative flex h-full flex-col overflow-hidden p-4 pl-5">
      {accentClass && (
        <div aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-1", accentClass)} />
      )}
      <div className="flex flex-1 items-start gap-3">
        <span
          className={cx(
            "grid size-10 shrink-0 place-items-center rounded-md",
            danger ? "bg-danger/15 text-danger" : "bg-fg/20 text-foreground",
          )}
        >
          <Icon size={20} strokeWidth={1.6} aria-hidden />
        </span>
        <span
          className={cx(
            "min-w-0 flex-1 self-center break-words text-[14px] font-semibold",
            danger ? "text-danger" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span
          className={cx(
            "text-[18px] font-bold leading-7 tabular-nums",
            danger ? "text-danger" : "text-foreground",
          )}
        >
          {value.toLocaleString()}
        </span>
      </div>
      <div
        className={cx(
          "relative mt-2 text-xs font-normal",
          danger ? "text-danger/90" : "text-muted-foreground",
        )}
      >
        {description}
      </div>
    </Card>
  )
}

export default function WarehouseDashboard({ onNavigate }: WarehouseDashboardProps) {
  const state = useOperationsStore()
  const nowInManila = useMemo(() => getNowInManila(), [])
  const todayKey = useMemo(() => toDateKey(nowInManila), [nowInManila])

  // Month navigation: starts at current Manila month (1st of month)
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(
    () => new Date(nowInManila.getFullYear(), nowInManila.getMonth(), 1, 12, 0, 0),
  )

  // Local event search query
  const [searchQuery, setSearchQuery] = useState("")

  // Optional day filter (selected day key "YYYY-MM-DD" or null)
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)

  // 1. KPI Calculations
  const kpiData = useMemo(() => {
    // Total Assets: Count of registered inventory records
    const totalAssets = state.inventory.length

    // Available Assets: Count of registered inventory records with availableStock > 0
    const availableAssets = state.inventory.filter((item) => item.availableStock > 0).length

    // Critical Deficits: Count of deficitQueue entries where urgency is 'Critical' and status !== 'Fulfilled'
    const criticalDeficits = state.deficitQueue.filter(
      (item) => item.urgency === "Critical" && item.status !== "Fulfilled",
    ).length

    // Pending Procurement: Count of acquisitions where status is 'Planned' or 'Ordered'
    const pendingProcurement = state.acquisitions.filter(
      (item) => item.status === "Planned" || item.status === "Ordered",
    ).length

    return {
      totalAssets,
      availableAssets,
      criticalDeficits,
      pendingProcurement,
    }
  }, [state.inventory, state.deficitQueue, state.acquisitions])

  // Current viewed month and year
  const currentYear = currentMonthDate.getFullYear()
  const currentMonthIdx = currentMonthDate.getMonth()
  const currentMonthLabel = `${MANILA_MONTH_NAMES[currentMonthIdx]} ${currentYear}`

  // 2. Map all order requests with Manila booking dates
  const ordersWithDates = useMemo(() => {
    return state.orderRequests.map((order) => {
      const startKey = getManilaDateKey(order.startDateTime)
      const endKey = getManilaDateKey(order.endDateTime)
      return {
        order,
        startKey,
        endKey,
      }
    })
  }, [state.orderRequests])

  // Set of all booked date keys in the system (for fast calendar lookup)
  const bookedDatesSet = useMemo(() => {
    const set = new Set<string>()
    ordersWithDates.forEach(({ startKey, endKey }) => {
      if (!startKey) return
      // Book the start day
      set.add(startKey)
      if (endKey && endKey !== startKey) {
        // Book the date range if valid
        try {
          const s = new Date(`${startKey}T12:00:00`)
          const e = new Date(`${endKey}T12:00:00`)
          const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
          if (diff > 0 && diff <= 31) {
            for (let i = 0; i <= diff; i++) {
              const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i, 12, 0, 0)
              set.add(toDateKey(cur))
            }
          }
        } catch {
          set.add(endKey)
        }
      }
    })
    return set
  }, [ordersWithDates])

  // 3. Days booked in the current viewed month
  const bookedDaysInCurrentMonthCount = useMemo(() => {
    let count = 0
    const prefix = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}-`
    bookedDatesSet.forEach((key) => {
      if (key.startsWith(prefix)) {
        count++
      }
    })
    return count
  }, [bookedDatesSet, currentYear, currentMonthIdx])

  // 4. Calendar grid days (42 cells: 6 weeks × 7 days)
  const calendarGrid = useMemo(() => {
    return calendarDays(currentMonthDate)
  }, [currentMonthDate])

  // 5. Month navigation handlers
  const handlePrevMonth = () => {
    setCurrentMonthDate((prev) => shiftMonth(prev, -1))
    setSelectedDayKey(null)
  }

  const handleNextMonth = () => {
    setCurrentMonthDate((prev) => shiftMonth(prev, 1))
    setSelectedDayKey(null)
  }

  const handleCurrentMonth = () => {
    setCurrentMonthDate(new Date(nowInManila.getFullYear(), nowInManila.getMonth(), 1, 12, 0, 0))
    setSelectedDayKey(null)
  }

  // 6. Filter events for current viewed month & search & optional day filter
  const currentMonthEvents = useMemo(() => {
    const monthPrefix = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}`
    const query = searchQuery.trim().toLowerCase()

    return ordersWithDates
      .filter(({ startKey, endKey, order }) => {
        // Belongs to the current viewed month if start or end intersects
        const inMonth =
          (startKey && startKey.startsWith(monthPrefix)) ||
          (endKey && endKey.startsWith(monthPrefix))

        if (!inMonth) return false

        // Day filter
        if (selectedDayKey) {
          const matchesDay =
            startKey === selectedDayKey ||
            endKey === selectedDayKey ||
            (startKey <= selectedDayKey && endKey >= selectedDayKey)
          if (!matchesDay) return false
        }

        // Search query filter: event title, client, venue
        if (query) {
          const matchTitle = (order.eventTitle || "").toLowerCase().includes(query)
          const matchClient = (order.clientName || "").toLowerCase().includes(query)
          const matchVenue = (order.venue || "").toLowerCase().includes(query)
          if (!matchTitle && !matchClient && !matchVenue) return false
        }

        return true
      })
      .map(({ order }) => order)
  }, [ordersWithDates, currentYear, currentMonthIdx, selectedDayKey, searchQuery])

  // Calculate overall summary progress percentage based on completed warehouse orders
  const monthSummaryData = useMemo(() => {
    const monthPrefix = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}`
    const allInMonth = ordersWithDates
      .filter(({ startKey, endKey }) =>
        (startKey && startKey.startsWith(monthPrefix)) ||
        (endKey && endKey.startsWith(monthPrefix)),
      )
      .map(({ order }) => order)

    return allInMonth
  }, [ordersWithDates, currentYear, currentMonthIdx])

  const handleViewOrder = (eventId: string) => {
    onNavigate("module-order-requests", eventId)
  }

  const isCritical = kpiData.criticalDeficits > 0

  return (
    <div className="w-full font-sans text-foreground">
      {/* ─── Shared Overview-style PageHeader with search in actions ─── */}
      <PageHeader
        crumbs={['Dashboard']}
        title="Overview"
        subtitle="Warehouse KPIs, booking calendar, and upcoming events."
        onHome={() => onNavigate("overview")}
        actions={
          <div className="search-control relative flex h-10 w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[14px] text-foreground transition-colors not-dark:hover:border-fg/20 not-dark:focus-within:border-fg/25 not-dark:focus-within:ring-2 not-dark:focus-within:ring-fg/10 sm:w-72">
            <Search
              size={16}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events"
              aria-label="Search events"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-fg/10 hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        }
      />

      <div className="dashboard-surfaces space-y-4">
        {/* ─── KPI Cards Row ─── */}
        <section aria-label="Warehouse Key Performance Indicators">
          <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTileCard
              icon={Boxes}
              title="Total Assets"
              value={kpiData.totalAssets}
              description="Registered inventory"
              accentClass="bg-[#C8A96A]"
            />

            <KpiTileCard
              icon={PackageCheck}
              title="Available Assets"
              value={kpiData.availableAssets}
              description="Ready for allocation"
              accentClass="bg-emerald-600 dark:bg-emerald-500"
            />

            <KpiTileCard
              icon={AlertTriangle}
              title="Critical Deficits"
              value={kpiData.criticalDeficits}
              description="Requires attention"
              accentClass={isCritical ? "bg-danger" : undefined}
              danger={isCritical}
            />

            <KpiTileCard
              icon={CircleDollarSign}
              title="Pending Procurement"
              value={kpiData.pendingProcurement}
              description="Open replenishment items"
              accentClass="bg-amber-600 dark:bg-amber-500"
            />
          </div>
        </section>

        {/* ─── Main Two-Column Split (1/3 Left, 2/3 Right) ─── */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          {/* ── LEFT COLUMN (lg:col-span-4): Booking Calendar + Month Summary ── */}
          <div className="space-y-4 lg:col-span-4">
            {/* Calendar Card */}
            <Card className="p-4">
              {/* Card Header */}
              <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <h2 className="text-[16px] font-semibold text-foreground">
                  Booking Calendar
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCurrentMonth}
                  className="h-8 shrink-0 px-3 text-[12px]"
                >
                  Current Month
                </Button>
              </div>

              {/* Month & Year Navigation + Booked Days Count */}
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                  className="grid size-7 place-items-center rounded-full text-foreground transition-colors hover:bg-fg/10"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>

                <div className="text-center">
                  <h3
                    key={currentMonthLabel}
                    className="text-[14px] font-semibold text-foreground animate-fade-up"
                  >
                    {currentMonthLabel}
                  </h3>
                  <p className="text-[12px] text-muted-foreground">
                    {bookedDaysInCurrentMonthCount}{" "}
                    {bookedDaysInCurrentMonthCount === 1 ? "day booked" : "days booked"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                  className="grid size-7 place-items-center rounded-full text-foreground transition-colors hover:bg-fg/10"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>

              {/* Weekday Header */}
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[12px] text-muted-foreground">
                {WEEKDAY_HEADERS.map((day) => (
                  <div key={day} className="py-1">
                    {day}
                  </div>
                ))}
              </div>

              {/* 42-day Calendar Grid */}
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarGrid.map((date, idx) => {
                  const dayNum = date.getDate()
                  const dayKey = toDateKey(date)
                  const isCurrentMonth = date.getMonth() === currentMonthIdx
                  const isBooked = bookedDatesSet.has(dayKey)
                  const isSelected = selectedDayKey === dayKey
                  const isToday = dayKey === todayKey

                  return (
                    <button
                      key={`${dayKey}-${idx}`}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDayKey(null)
                        } else {
                          setSelectedDayKey(dayKey)
                        }
                      }}
                      className={cx(
                        "relative flex h-9 w-full flex-col items-center justify-center rounded-md text-[14px] tabular-nums transition-colors duration-150",
                        isSelected
                          ? "bg-invert font-semibold text-invert-fg"
                          : isBooked && isCurrentMonth
                            ? "bg-fg/[0.06] font-semibold text-foreground hover:bg-fg/10"
                            : isCurrentMonth
                              ? "text-foreground hover:bg-fg/10"
                              : "text-muted-foreground/40 hover:bg-fg/[0.06] hover:text-muted-foreground",
                        isToday && !isSelected && "ring-1 ring-fg/30",
                      )}
                    >
                      <span className="leading-none">{dayNum}</span>

                      {/* Distinct booked-date marker */}
                      {isBooked && isCurrentMonth && (
                        <span
                          className={cx(
                            "pointer-events-none absolute bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full",
                            isSelected ? "bg-invert-fg" : "bg-fg/70",
                          )}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Legend & Filter Clear */}
              <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[12px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-fg/70" />
                    Booked
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-[2px] bg-invert" />
                    Selected
                  </span>
                </div>
                {selectedDayKey && (
                  <button
                    type="button"
                    onClick={() => setSelectedDayKey(null)}
                    className="font-semibold text-foreground hover:underline"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </Card>

            {/* Month Summary Card */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[16px] font-semibold text-foreground">
                  {currentMonthLabel} Summary
                </h3>
                <Badge tone="neutral">
                  {monthSummaryData.length} {monthSummaryData.length === 1 ? "Event" : "Events"}
                </Badge>
              </div>

              <div className="mt-3 space-y-2.5">
                {monthSummaryData.length === 0 ? (
                  <p className="py-1 text-[13px] text-muted-foreground">
                    No events booked for {currentMonthLabel}.
                  </p>
                ) : (
                  monthSummaryData.map((order) => {
                    const tile = getCompactDateTile(order.startDateTime)
                    const isDone = order.warehouseClosed
                    const percent = isDone ? 100 : order.outboundDeparture ? 60 : 30

                    return (
                      <div key={order.id} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-8 shrink-0 flex-col items-center justify-center rounded-md border border-line bg-elev text-center leading-none tabular-nums">
                            <span className="text-[11px] font-semibold text-foreground">
                              {tile.day}
                            </span>
                            <span className="mt-0.5 text-[9px] text-muted-foreground">
                              {tile.weekday}
                            </span>
                          </span>
                          <span className="truncate text-[13px] font-medium text-foreground">
                            {order.eventTitle}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-fg/[0.08]">
                            <div
                              className="h-full bg-foreground transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-[12px] font-medium tabular-nums text-muted-foreground">
                            {percent}%
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer link to Order Requests */}
              <div className="mt-3 border-t border-line pt-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate("module-order-requests")}
                  className="group flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>Warehouse event registry</span>
                  <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </Card>
          </div>

          {/* ── RIGHT COLUMN (lg:col-span-8): Events Header + Event Rows ── */}
          <div className="space-y-4 lg:col-span-8">
            {/* Header Banner */}
            <Card className="p-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[16px] font-semibold text-foreground">
                  {currentMonthLabel} Events
                </h2>
                <Badge tone="neutral">{currentMonthEvents.length}</Badge>
              </div>
              <p className="mt-0.5 text-[14px] text-muted-foreground">
                {selectedDayKey
                  ? `Filtered by booking date ${selectedDayKey}`
                  : `All active and scheduled events for ${currentMonthLabel}`}
                {searchQuery ? ` matching "${searchQuery}"` : ""}
              </p>
            </Card>

            {/* Event Rows List */}
            <div className="space-y-3">
              {currentMonthEvents.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-[14px] font-semibold text-foreground">
                    No matching events found
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {searchQuery
                      ? `No events in ${currentMonthLabel} match your search "${searchQuery}".`
                      : selectedDayKey
                        ? `No bookings found for the selected day (${selectedDayKey}).`
                        : `No warehouse order requests scheduled for ${currentMonthLabel}.`}
                  </p>
                  {(searchQuery || selectedDayKey) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSearchQuery("")
                        setSelectedDayKey(null)
                      }}
                      className="mt-4 h-8 px-3 text-[12px]"
                    >
                      Reset filters
                    </Button>
                  )}
                </Card>
              ) : (
                currentMonthEvents.map((order) => {
                  const tile = getCompactDateTile(order.startDateTime)
                  const dateRange = formatDateRange(order.startDateTime, order.endDateTime)
                  const status = getEventLifecycleStatus(order)

                  return (
                    <Card
                      key={order.id}
                      className="group relative flex flex-col gap-3 p-4 transition-colors hover:border-fg/25! sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3.5">
                        {/* Compact Date Tile */}
                        <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-md border border-line bg-elev text-center tabular-nums">
                          <span className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
                            {tile.month}
                          </span>
                          <span className="mt-0.5 text-[16px] font-bold leading-none text-foreground">
                            {tile.day}
                          </span>
                          <span className="mt-0.5 text-[10px] leading-none text-muted-foreground">
                            {tile.weekday}
                          </span>
                        </div>

                        {/* Event Details */}
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[12px] font-medium text-muted-foreground">
                              {order.id}
                            </span>
                            <EventStatusBadge status={status} />
                          </div>

                          {/* Title */}
                          <h3 className="truncate text-[15px] font-semibold leading-snug text-foreground">
                            {order.eventTitle}
                          </h3>

                          {/* Meta: Client, Venue, Date range */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                            {order.clientName && (
                              <span className="flex items-center gap-1.5">
                                <User size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span>{order.clientName}</span>
                              </span>
                            )}
                            {order.venue && (
                              <span className="flex items-center gap-1.5 truncate">
                                <MapPin size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="truncate">{order.venue}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 tabular-nums">
                              <Clock size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span>{dateRange}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* View Action Button */}
                      <div className="flex shrink-0 items-center gap-2 sm:pt-0">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleViewOrder(order.eventId)}
                          className="h-8 px-3.5 text-[13px]"
                        >
                          View
                        </Button>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

