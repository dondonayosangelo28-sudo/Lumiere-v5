import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Hammer,
  MapPin,
  Search,
  ShieldAlert,
  Truck,
  User,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react"
import Modal from "../../components/overlay/Modal"
import StatCards from "../../components/dashboard/StatCards"
import { Badge, Button, Card, PageHeader, cx } from "../../components/ui/ui"
import { currentSession as summarySession } from "../../auth/session"
import { fmtStamp } from "../event-manager/shared"
import {
  computeWarehouseOverviewData,
  getEventManifestLines,
  useOperationsStore,
  type OperationsNavigationContext,
  type WarehouseActionQueueCategory,
} from "../../operations/store"
import { OperationsPersistenceBanner } from "../../operations/OperationsPersistenceBanner"
import type { WarehouseOrderRequest } from "../../operations/types"
import { calendarDays, shiftMonth } from "../../components/ui/calendarDates"
import { MANILA_TIME_ZONE } from "../../auth/manilaTime"
import { Hero } from "../../pages/dashboard/Overview"

interface WarehouseDashboardProps {
  onNavigate: (
    route: string,
    contextOrEventId?: string | Partial<OperationsNavigationContext>,
  ) => void
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

const ACTION_CATEGORY_FILTERS: {
  key: "all" | WarehouseActionQueueCategory
  label: string
}[] = [
  { key: "all", label: "All Actions" },
  { key: "awaiting-verification", label: "Awaiting Verification" },
  { key: "crew-blocker", label: "Crew Blockers" },
  { key: "unconfirmed-production-window", label: "Unconfirmed Windows" },
  { key: "schedule-workload-conflict", label: "Schedule / Workload" },
  { key: "shared-shift-shortfall", label: "Shared-Shift Shortfalls" },
  { key: "legacy-review-flag", label: "Legacy Review" },
  { key: "event-stock-deficit", label: "Stock Deficits" },
]

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
      return isoString.slice(0, 10)
    }
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: MANILA_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    return formatter.format(d)
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
    const mStr = d
      .toLocaleDateString("en-US", { timeZone: MANILA_TIME_ZONE, month: "short" })
      .toUpperCase()
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

  // Action Queue modal & filter
  const [actionQueueOpen, setActionQueueOpen] = useState(false)
  const [selectedActionCategory, setSelectedActionCategory] = useState<
    "all" | WarehouseActionQueueCategory
  >("all")

  // Read-only Warehouse Event Summary modal
  const [summaryEventId, setSummaryEventId] = useState<string | null>(null)

  // Phase 2 Overview calculations from Phase 1 store selectors
  const overviewData = useMemo(() => computeWarehouseOverviewData(state), [state])

  // Current viewed month and year
  const currentYear = currentMonthDate.getFullYear()
  const currentMonthIdx = currentMonthDate.getMonth()
  const currentMonthLabel = `${MANILA_MONTH_NAMES[currentMonthIdx]} ${currentYear}`

  // Map all order requests with Manila booking dates
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
      set.add(startKey)
      if (endKey && endKey !== startKey) {
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

  // Days booked in the current viewed month
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

  // Calendar grid days (42 cells: 6 weeks × 7 days)
  const calendarGrid = useMemo(() => {
    return calendarDays(currentMonthDate)
  }, [currentMonthDate])

  // Month navigation handlers
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

  // Filter events for current viewed month & search & optional day filter
  const currentMonthEvents = useMemo(() => {
    const monthPrefix = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}`
    const query = searchQuery.trim().toLowerCase()

    return ordersWithDates
      .filter(({ startKey, endKey, order }) => {
        const inMonth =
          (startKey && startKey.startsWith(monthPrefix)) ||
          (endKey && endKey.startsWith(monthPrefix))

        if (!inMonth) return false

        if (selectedDayKey) {
          const matchesDay =
            startKey === selectedDayKey ||
            endKey === selectedDayKey ||
            (startKey <= selectedDayKey && endKey >= selectedDayKey)
          if (!matchesDay) return false
        }

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

  const monthSummaryData = useMemo(() => {
    const monthPrefix = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}`
    return ordersWithDates
      .filter(
        ({ startKey, endKey }) =>
          (startKey && startKey.startsWith(monthPrefix)) ||
          (endKey && endKey.startsWith(monthPrefix)),
      )
      .map(({ order }) => order)
  }, [ordersWithDates, currentYear, currentMonthIdx])

  const filteredEventSummaries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return overviewData.eventSummaries
    return overviewData.eventSummaries.filter(
      (s) =>
        s.eventTitle.toLowerCase().includes(query) ||
        s.venue.toLowerCase().includes(query) ||
        s.orderId.toLowerCase().includes(query),
    )
  }, [overviewData.eventSummaries, searchQuery])

  const activeProductionJobsCount = useMemo(() => {
    const activeEventIds = new Set(
      state.orderRequests.filter((o) => !o.warehouseClosed).map((o) => o.eventId),
    )
    return state.fabricationJobs.filter(
      (j) => activeEventIds.has(j.eventId) && !j.releasedForLoading,
    ).length
  }, [state.orderRequests, state.fabricationJobs])

  const readyToDispatchCount = useMemo(
    () =>
      overviewData.eventSummaries.filter(
        (s) => s.readiness.statusLabel === "Ready for dispatch",
      ).length,
    [overviewData.eventSummaries],
  )

  const recentActivity = useMemo(() => {
    type ActivityItem = {
      id: string
      title: string
      eventTitle: string
      timestamp: string
      tsMs: number
      icon: LucideIcon
      tintClass: string
      onClick: () => void
    }
    const items: ActivityItem[] = []
    const pushItem = (
      id: string,
      title: string,
      eventTitle: string,
      timestamp: string | undefined,
      icon: LucideIcon,
      tintClass: string,
      onClick: () => void,
    ) => {
      if (!timestamp) return
      const tsMs = Date.parse(timestamp)
      if (!Number.isFinite(tsMs)) return
      items.push({ id, title, eventTitle, timestamp, tsMs, icon, tintClass, onClick })
    }

    for (const order of state.orderRequests) {
      pushItem(
        `ord-approved-${order.id}`,
        "Event order published",
        order.eventTitle,
        order.approvedAt,
        ClipboardList,
        "bg-fg/10 text-foreground",
        () => onNavigate("module-events", { eventId: order.eventId }),
      )
      pushItem(
        `ord-manifest-${order.id}`,
        "Stock allocation reviewed",
        order.eventTitle,
        order.manifestPreparedAt,
        ClipboardCheck,
        "bg-amber-500/15 text-amber-400",
        () => onNavigate("module-events", { eventId: order.eventId }),
      )
      pushItem(
        `ord-loading-${order.id}`,
        "Loading checklist submitted",
        order.eventTitle,
        order.loadingChecklist?.submittedAt,
        ClipboardCheck,
        "bg-fg/10 text-foreground",
        () => onNavigate("module-dispatch-returns", { eventId: order.eventId }),
      )
      pushItem(
        `ord-depart-${order.id}`,
        "Outbound dispatch confirmed",
        order.eventTitle,
        order.outboundDeparture?.confirmedAt,
        Truck,
        "bg-[#2563eb]/15 text-[#60a5fa]",
        () => onNavigate("module-dispatch-returns", { eventId: order.eventId }),
      )
      pushItem(
        `ord-venue-${order.id}`,
        "Venue arrival confirmed",
        order.eventTitle,
        order.venueArrival?.submittedAt,
        MapPin,
        "bg-success/15 text-success",
        () => onNavigate("module-dispatch-returns", { eventId: order.eventId }),
      )
      pushItem(
        `ord-wh-${order.id}`,
        "Warehouse return arrival confirmed",
        order.eventTitle,
        order.warehouseArrival?.submittedAt,
        Truck,
        "bg-success/15 text-success",
        () => onNavigate("module-dispatch-returns", { eventId: order.eventId }),
      )
      pushItem(
        `ord-ret-${order.id}`,
        "Return audit submitted",
        order.eventTitle,
        order.returnChecklist?.submittedAt,
        ClipboardCheck,
        "bg-amber-500/15 text-amber-400",
        () => onNavigate("module-dispatch-returns", { eventId: order.eventId }),
      )
      pushItem(
        `ord-closed-${order.id}`,
        "Event accountability closed",
        order.eventTitle,
        order.closedAt,
        ClipboardCheck,
        "bg-success/15 text-success",
        () => onNavigate("module-events", { eventId: order.eventId }),
      )
    }

    for (const job of state.fabricationJobs) {
      pushItem(
        `job-ver-${job.id}`,
        "Custom build verified",
        job.eventTitle,
        job.verifiedAt,
        Hammer,
        "bg-success/15 text-success",
        () => onNavigate("module-verification", { eventId: job.eventId, jobId: job.id }),
      )
    }

    for (const acq of state.acquisitions) {
      const lastRcpt = acq.receiptHistory?.[acq.receiptHistory.length - 1]
      pushItem(
        `acq-rcpt-${acq.id}`,
        `Receipt recorded (${acq.assetName})`,
        acq.eventTitle || "General Stockroom",
        lastRcpt?.receivedAt,
        ClipboardCheck,
        "bg-success/15 text-success",
        () => onNavigate("module-replenishment-deficits", { subView: "acquisitions" }),
      )
    }

    for (const inc of state.incidentReports) {
      pushItem(
        `inc-rep-${inc.id}`,
        `${inc.reportType} report logged`,
        inc.eventTitle,
        inc.submittedAt,
        AlertTriangle,
        "bg-danger/15 text-danger",
        () => onNavigate("module-damage-missing-reports", { eventId: inc.eventId }),
      )
      pushItem(
        `inc-res-${inc.id}`,
        `${inc.reportType} report resolved`,
        inc.eventTitle,
        inc.resolvedAt,
        ClipboardCheck,
        "bg-success/15 text-success",
        () => onNavigate("module-damage-missing-reports", { eventId: inc.eventId }),
      )
    }

    for (const cancelled of state.cancelledEvents ?? []) {
      pushItem(
        `evt-cancel-${cancelled.eventId}`,
        "Approved event cancelled",
        cancelled.eventTitle,
        cancelled.cancelledAt,
        ShieldAlert,
        "bg-danger/15 text-danger",
        () => onNavigate("module-events"),
      )
    }

    const q = searchQuery.trim().toLowerCase()
    return items
      .filter((it) =>
        !q || `${it.title} ${it.eventTitle}`.toLowerCase().includes(q),
      )
      .sort((a, b) => b.tsMs - a.tsMs)
      .slice(0, 12)
  }, [
    state.orderRequests,
    state.fabricationJobs,
    state.acquisitions,
    state.incidentReports,
    state.cancelledEvents,
    searchQuery,
    onNavigate,
  ])

  const filteredActionQueue = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return overviewData.actionQueue.filter((item) => {
      if (selectedActionCategory !== "all" && item.category !== selectedActionCategory) {
        return false
      }
      if (query) {
        const hay = `${item.title} ${item.description} ${item.eventTitle}`.toLowerCase()
        if (!hay.includes(query)) return false
      }
      return true
    })
  }, [overviewData.actionQueue, selectedActionCategory, searchQuery])

  const handleViewOrder = (eventId: string) => {
    setSummaryEventId(eventId)
  }

  return (
    <div className="w-full font-sans text-foreground">
      {/* ─── Shared Overview-style PageHeader with search in actions ─── */}
      <PageHeader
        crumbs={["Dashboard"]}
        title="Overview"
        subtitle="Operational readiness, production & staffing summaries, action queue, and Asia/Manila fulfillment calendar."
        onHome={() => onNavigate("overview")}
        actions={
          <div className="search-control relative flex h-10 w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[14px] text-foreground transition-colors not-dark:hover:border-fg/20 not-dark:focus-within:border-fg/25 not-dark:focus-within:ring-2 not-dark:focus-within:ring-fg/10 sm:w-72">
            <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events or actions"
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
        <OperationsPersistenceBanner />

        {/* ─── Admin-Style Top Split: Left Hero + 4 Metrics, Right Warehouse Action Queue ─── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
            <Hero />

            <section aria-label="Warehouse Key Performance Indicators">
              <StatCards
                key={`${summarySession()?.accountId ?? 0}-warehouse-overview`}
                userId={summarySession()?.accountId ?? 0}
                groupId="warehouse-overview"
                gridCols="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                data={[
                  {
                    id: "active-event-orders",
                    title: "Active event orders",
                    icon: ClipboardList,
                    iconClassName: "bg-violet/15 text-violet",
                    value: overviewData.kpis.activeEvents,
                    action: () => onNavigate("module-events"),
                  },
                  {
                    id: "stock-deficits",
                    title: "Stock deficits",
                    icon: AlertTriangle,
                    iconClassName: "bg-warning/15 text-warning",
                    value: overviewData.kpis.openStockDeficits,
                    action: () => onNavigate("module-replenishment-deficits"),
                  },
                  {
                    id: "production-jobs",
                    title: "Production jobs",
                    icon: Hammer,
                    iconClassName: "bg-[#2563eb]/15 text-[#2563eb] dark:text-[#60a5fa]",
                    value: activeProductionJobsCount,
                    action: () => onNavigate("module-production"),
                  },
                  {
                    id: "ready-to-dispatch",
                    title: "Ready to dispatch",
                    icon: Truck,
                    iconClassName: "bg-success/15 text-success",
                    value: readyToDispatchCount,
                    action: () => onNavigate("module-dispatch-returns"),
                  },
                ]}
              />
            </section>
          </div>

          {/* ─── Right Panel: Recent activity ─── */}
          <Card className="flex flex-col p-5 xl:col-span-1 xl:h-0 xl:min-h-full">
            <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
              <div>
                <h2 className="text-[16px] font-semibold text-foreground">
                  Recent activity
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Latest Warehouse and crew updates
                </p>
              </div>
              {overviewData.actionQueue.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActionQueueOpen(true)}
                  className="shrink-0 cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Action queue ({overviewData.actionQueue.length})
                </button>
              )}
            </div>

            {recentActivity.length === 0 ? (
              <div className="mt-3 flex flex-1 items-center justify-center rounded-xl border border-line p-6 text-center text-xs text-muted-foreground">
                No recent Warehouse or crew updates yet.
              </div>
            ) : (
              <ul className="mt-3 max-h-[340px] min-h-0 flex-1 divide-y divide-line overflow-y-auto pr-1 xl:max-h-none">
                {recentActivity.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.id} className="py-1 first:pt-0 last:pb-0">
                      <button
                        type="button"
                        onClick={item.onClick}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-fg/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fg"
                      >
                        <span
                          className={cx(
                            "grid size-8 shrink-0 place-items-center rounded-lg",
                            item.tintClass,
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-foreground">
                            {item.title}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {item.eventTitle}
                          </div>
                        </div>
                        <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                          {fmtStamp(item.timestamp)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ─── Main Two-Column Split (1/3 Left, 2/3 Right): Asia/Manila Booking Calendar & Month Events ─── */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          {/* ── LEFT COLUMN (lg:col-span-4): Booking Calendar + Month Summary ── */}
          <div className="space-y-4 lg:col-span-4">
            {/* Calendar Card */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <h2 className="text-[16px] font-semibold text-foreground">Booking Calendar</h2>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCurrentMonth}
                  className="h-8 shrink-0 px-3 text-[12px]"
                >
                  Current Month
                </Button>
              </div>

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

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[12px] text-muted-foreground">
                {WEEKDAY_HEADERS.map((day) => (
                  <div key={day} className="py-1">
                    {day}
                  </div>
                ))}
              </div>

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

              <div className="mt-3 border-t border-line pt-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate("module-events", { subView: "orders" })}
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

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[12px] font-medium text-muted-foreground">
                              {order.id}
                            </span>
                            <EventStatusBadge status={status} />
                          </div>

                          <h3 className="truncate text-[15px] font-semibold leading-snug text-foreground">
                            {order.eventTitle}
                          </h3>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                            {order.clientName && (
                              <span className="flex items-center gap-1.5">
                                <User
                                  size={13}
                                  className="shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span>{order.clientName}</span>
                              </span>
                            )}
                            {order.venue && (
                              <span className="flex items-center gap-1.5 truncate">
                                <MapPin
                                  size={13}
                                  className="shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span className="truncate">{order.venue}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 tabular-nums">
                              <Clock
                                size={13}
                                className="shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span>{dateRange}</span>
                            </span>
                          </div>
                        </div>
                      </div>

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

      {/* ─── Read-Only Warehouse Event Summary Modal ─── */}
      {(() => {
        const selectedOrder = summaryEventId
          ? state.orderRequests.find((o) => o.eventId === summaryEventId)
          : undefined
        const selectedSummary = summaryEventId
          ? overviewData.eventSummaries.find((s) => s.eventId === summaryEventId)
          : undefined
        if (!selectedOrder || !selectedSummary) return null

        const eventJobs = state.fabricationJobs.filter(
          (j) => j.eventId === selectedOrder.eventId,
        )
        const eventDeficits = state.deficitQueue.filter(
          (d) => d.eventId === selectedOrder.eventId && d.status !== "Fulfilled",
        )
        const totalRequested = selectedOrder.stockLines.reduce(
          (s, l) => s + l.approvedRequestedQty,
          0,
        )
        const totalAllocated = selectedOrder.stockLines.reduce(
          (s, l) => s + l.allocatedQty,
          0,
        )
        const activeRoster = (selectedOrder.eventRoster ?? []).filter(
          (r) => !r.removedAt,
        )
        const assignedRecords =
          (selectedOrder.eventAssignments &&
            selectedOrder.eventAssignments.length > 0
            ? selectedOrder.eventAssignments
            : null) ?? []
        const legacyCrewAssignments = selectedOrder.crewAssignments ?? []
        const schedules = selectedOrder.eventSchedules ?? []
        const manifestLines = getEventManifestLines(state, selectedOrder.eventId)
        const totalPlannedManifest = manifestLines.reduce(
          (s, l) => s + l.plannedQty,
          0,
        )
        const totalLoadedManifest = manifestLines.reduce(
          (s, l) => s + l.loadedQty,
          0,
        )

        return (
          <Modal
            open={Boolean(selectedOrder)}
            onClose={() => setSummaryEventId(null)}
            title="Warehouse Event Summary"
            hideHeader
            panelClassName="max-w-3xl! flex flex-col overflow-hidden! p-0!"
          >
            <div className="flex max-h-[calc(100dvh-48px)] flex-col overflow-hidden">
              {/* Fixed Header */}
              <div className="flex items-start justify-between gap-4 border-b border-line p-6">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Warehouse Event Summary
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {selectedOrder.id}
                    </span>
                    <Badge tone={selectedSummary.readiness.tone}>
                      {selectedSummary.readiness.statusLabel}
                    </Badge>
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    {selectedOrder.eventTitle}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} aria-hidden="true" />
                      <span>
                        {formatDateRange(
                          selectedOrder.startDateTime,
                          selectedOrder.endDateTime,
                        )}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} aria-hidden="true" />
                      <span>{selectedOrder.venue || "Not configured"}</span>
                    </span>
                  </div>
                  {selectedSummary.readiness.unmetRequirements.length > 0 && (
                    <p className="pt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                      Unmet: {selectedSummary.readiness.unmetRequirements.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    icon={ArrowRight}
                    onClick={() => {
                      const id = selectedOrder.eventId
                      setSummaryEventId(null)
                      onNavigate("module-events", {
                        eventId: id,
                        subView: "orders",
                      })
                    }}
                  >
                    Full Event Detail
                  </Button>
                  <button
                    type="button"
                    onClick={() => setSummaryEventId(null)}
                    aria-label="Close"
                    className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-elev hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 space-y-6 overflow-y-auto p-6 text-xs">
                {/* 1. Asset Plan & Production */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                    <Hammer className="size-3.5" aria-hidden="true" />
                    <span>Asset Plan &amp; Production</span>
                  </div>
                  <div className="grid gap-4 rounded-xl border border-line bg-fg/[0.02] p-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Allocated Assets</div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedOrder.stockLines.length > 0
                          ? `${totalAllocated} / ${totalRequested} units (${selectedOrder.stockLines.length} lines)`
                          : "Not configured"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Approval Status</div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedOrder.approvedByName
                          ? `Approved (${selectedOrder.approvedByName} · Rev ${selectedOrder.revisionAtApproval})`
                          : "Not configured"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Custom Jobs &amp; Readiness</div>
                      <div className="text-sm font-semibold text-foreground">
                        {eventJobs.length > 0
                          ? `${selectedSummary.readiness.readyToLoadJobs} / ${eventJobs.length} Ready to Load`
                          : "Not configured"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Open Deficits</div>
                      <div className="text-sm font-semibold text-foreground">
                        {eventDeficits.length > 0
                          ? `${eventDeficits.length} open shortage(s)`
                          : "0 open"}
                      </div>
                    </div>
                  </div>
                  {eventJobs.length > 0 && (
                    <div className="space-y-1.5 rounded-lg border border-line p-3">
                      {eventJobs.map((job) => (
                        <div
                          key={job.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="font-medium text-foreground">
                            {job.spec.name} ({job.completedQty ?? 0}/{job.spec.requestedQty})
                          </span>
                          <Badge
                            tone={
                              job.status === "Ready to Load"
                                ? "success"
                                : job.status === "Awaiting Verification"
                                  ? "info"
                                  : "warning"
                            }
                          >
                            {job.status} · {job.progressPercent}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 2. Assigned Crew */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                    <UsersRound className="size-3.5" aria-hidden="true" />
                    <span>Assigned Crew (Roster vs. Assignments)</span>
                  </div>
                  <div className="grid gap-4 rounded-xl border border-line bg-fg/[0.02] p-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Explicit Team Lead</div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedSummary.teamLeadSummary.displayLabel}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Event Roster Membership</div>
                      <div className="text-sm font-semibold text-foreground">
                        {activeRoster.length > 0
                          ? `${activeRoster.length} on roster`
                          : "Not configured"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Assigned Workers</div>
                      <div className="text-sm font-semibold text-foreground">
                        {assignedRecords.length > 0
                          ? `${assignedRecords.length} assignment(s)`
                          : legacyCrewAssignments.length > 0
                            ? `${legacyCrewAssignments.length} legacy assignment(s)`
                            : "Not configured"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Confirmed Scheduled Capacity</div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedSummary.scheduledCapacitySummary.displayLabel}
                      </div>
                    </div>
                  </div>
                  {assignedRecords.length > 0 ? (
                    <div className="space-y-1.5 rounded-lg border border-line p-3">
                      {assignedRecords.map((a) => (
                        <div
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="text-foreground">
                            <strong>{a.crewName}</strong> · {a.phase || a.activityType || a.role}
                          </span>
                          <Badge tone={a.status === "Completed" ? "success" : "neutral"}>
                            {a.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : legacyCrewAssignments.length > 0 ? (
                    <div className="space-y-1.5 rounded-lg border border-line p-3">
                      {legacyCrewAssignments.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="text-foreground">
                            <strong>{c.crewName}</strong> · {c.duties || c.shiftLabel} ({c.schedule})
                          </span>
                          <Badge tone={c.taskStatus === "Blocked" ? "danger" : c.taskStatus === "Completed" ? "success" : "neutral"}>
                            {c.taskStatus}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {schedules.length > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      Scheduled windows: {schedules.length} shift window(s) configured.
                    </div>
                  )}
                </section>

                {/* 3. Dispatch & Logistics */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                    <Truck className="size-3.5" aria-hidden="true" />
                    <span>Dispatch &amp; Logistics</span>
                  </div>
                  <div className="grid gap-4 rounded-xl border border-line bg-fg/[0.02] p-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Driver &amp; Vehicle</div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedOrder.outboundDeparture?.driverName
                          ? `${selectedOrder.outboundDeparture.driverName}${
                              selectedOrder.outboundDeparture.vehiclePlate
                                ? ` · ${selectedOrder.outboundDeparture.vehiclePlate}`
                                : ""
                            }`
                          : "Not configured"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Manifest Counts</div>
                      <div className="text-sm font-semibold text-foreground">
                        {manifestLines.length > 0
                          ? `${totalLoadedManifest} / ${totalPlannedManifest} loaded (${manifestLines.length} lines)`
                          : "Not configured"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Departure / Arrival</div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedOrder.venueArrival
                          ? "Arrived at Venue"
                          : selectedOrder.outboundDeparture
                            ? "Dispatched"
                            : "Pending"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Return &amp; Closeout</div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedOrder.warehouseClosed
                          ? "Closed"
                          : selectedOrder.returnChecklist
                            ? "Return Checklist Submitted"
                            : selectedOrder.warehouseArrival
                              ? "Arrived at Warehouse"
                              : "Pending"}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Fixed Footer */}
              <div className="flex items-center justify-end border-t border-line bg-card px-6 py-4">
                <Button type="button" onClick={() => setSummaryEventId(null)}>
                  Close Summary
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      <Modal
        open={actionQueueOpen}
        onClose={() => setActionQueueOpen(false)}
        title="Warehouse Action Queue"
      >
        <div className="space-y-3">
          <select
            aria-label="Filter action queue by category"
            value={selectedActionCategory}
            onChange={(e) =>
              setSelectedActionCategory(
                e.target.value as "all" | WarehouseActionQueueCategory,
              )
            }
            className="h-9 w-full rounded-md border border-line bg-elev px-3 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            {ACTION_CATEGORY_FILTERS.map((cat) => {
              const count =
                cat.key === "all"
                  ? overviewData.actionQueue.length
                  : overviewData.actionCountsByCategory[cat.key]
              return (
                <option key={cat.key} value={cat.key}>
                  {cat.label} ({count})
                </option>
              )
            })}
          </select>

          {filteredActionQueue.length === 0 ? (
            <div className="rounded-xl border border-line p-6 text-center text-xs text-muted-foreground">
              No open action items in this category.
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto pr-1">
              {filteredActionQueue.map((item) => (
                <li key={item.id} className="py-1 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActionQueueOpen(false)
                      onNavigate(item.targetRoute, item.targetContext)
                    }}
                    className="w-full cursor-pointer space-y-1.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-fg/[0.04]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <Badge tone={item.severity}>{item.categoryLabel}</Badge>
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {item.eventTitle}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.description}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  )
}
