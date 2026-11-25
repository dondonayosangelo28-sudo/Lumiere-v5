import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Columns3,
  Hammer,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  XCircle,
} from "lucide-react"
import Modal from "../../../components/overlay/Modal"
import { Badge, Button, Card, Field, Input, PageHeader, cx } from "../../../components/ui/ui"
import { Visual, fmtStamp, textareaCls } from "../../event-manager/shared"
import {
  calculateCombinedWindowCrewRecommendations,
  calculateJobEstimatedLaborHours,
  calculateWorkingLeadCapacity,
  cancelScheduledShift,
  confirmProductionJobWindowAndEstimate,
  confirmWorkerAssignmentCompletion,
  createCustomFabricationJob,
  scheduleWorkerShift,
  useOperationsStore,
  validateAndComputeShiftSchedule,
  validateSharedShiftSimultaneousCoverage,
  validateStoreSchedulesAndWorkload,
  type AssignmentMode,
  type EstimateBasis,
  type OperationsNavigationContext,
  type OpsActor,
  type ShiftActivityType,
} from "../../../operations/store"
import { notifyMutationResult, useNotify } from "../warehouse-shared"

type ProductionViewMode = "gantt" | "kanban"
type GanttGroupingMode = "event" | "all"

const MANILA_TIMEZONE = "Asia/Manila"

function getManilaTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function shiftManilaDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number)
  if (!y || !m || !d) return dateKey
  const utc = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000
  return new Date(utc).toISOString().slice(0, 10)
}

function getManilaWeekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number)
  if (!y || !m || !d) return dateKey
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return shiftManilaDateKey(dateKey, -dow)
}

function toManilaDateKey(value: string): string {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return trimmed.slice(0, 10)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed)
}

function formatManilaDayHeader(dateKey: string): { weekday: string; monthDay: string } {
  const [y, m, d] = dateKey.split("-").map(Number)
  if (!y || !m || !d) return { weekday: "", monthDay: dateKey }
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return {
    weekday: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
    })
      .format(dt)
      .toUpperCase(),
    monthDay: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(dt),
  }
}

type JobPlanDraft = {
  templateAssetId: string
  estHours: string
  basis: EstimateBasis
  startDate: string
  deadlineDate: string
  days: string
  assignmentMode: AssignmentMode
  productionLeadEmail: string
  participants: string[]
}

type JobShiftDraft = {
  selectedWorkers: string[]
  activityType: ShiftActivityType
  startDateTime: string
  endDateTime: string
  breakMinutes: string
  breakStart: string
  breakEnd: string
  isSharedShift: boolean
  minSimultaneousCrew: string
  sharedGroupId: string
  instructions: string
}

export default function ProductionWorkspaceModule({
  actor,
  initialEventId,
  initialJobId,
  embedded = false,
  onNavigate,
}: {
  actor: OpsActor
  initialEventId?: string
  initialJobId?: string
  embedded?: boolean
  onNavigate?: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()

  const [showNewModal, setShowNewModal] = useState(false)
  const [viewMode, setViewMode] = useState<ProductionViewMode>("gantt")
  const [ganttGroupBy, setGanttGroupBy] = useState<GanttGroupingMode>("event")
  const [searchQuery, setSearchQuery] = useState("")
  const [planningToolsOpen, setPlanningToolsOpen] = useState(false)
  const [windowAnchorDate, setWindowAnchorDate] = useState<string>(() =>
    getManilaWeekStartKey(getManilaTodayKey()),
  )
  const [activeJobModalId, setActiveJobModalId] = useState<string | null>(
    () => initialJobId || null,
  )
  const [filterEventId, setFilterEventId] = useState<string>(initialEventId ?? "")
  const [focusedJobId, setFocusedJobId] = useState<string>(initialJobId ?? "")
  const [newSpec, setNewSpec] = useState({
    eventId: initialEventId || state.orderRequests[0]?.eventId || "",
    name: "",
    requestedQty: 1,
    dimensions: "",
    materials: "",
    colors: "",
    finish: "",
    buildInstructions: "",
    referenceImage: "/event-manager-images/garden.jpg",
  })

  const [planDrafts, setPlanDrafts] = useState<Record<string, JobPlanDraft>>({})
  const [shiftDrafts, setShiftDrafts] = useState<Record<string, JobShiftDraft>>({})
  const [cancelReasonByShiftId, setCancelReasonByShiftId] = useState<Record<string, string>>({})

  useEffect(() => {
    setFilterEventId(initialEventId ?? "")
  }, [initialEventId])

  useEffect(() => {
    setFocusedJobId(initialJobId ?? "")
    setActiveJobModalId(initialJobId || null)
  }, [initialJobId])

  const effectiveFilterEventId = embedded ? (initialEventId ?? "") : filterEventId
  const normalizedSearch = searchQuery.trim().toLowerCase()

  const filteredJobs = state.fabricationJobs
    .filter((job) => {
      const matchesEvent = embedded
        ? Boolean(effectiveFilterEventId) && job.eventId === effectiveFilterEventId
        : !effectiveFilterEventId
          ? true
          : job.eventId === effectiveFilterEventId
      if (!matchesEvent) return false
      if (!normalizedSearch) return true
      return `${job.spec.name} ${job.eventTitle} ${job.id}`
        .toLowerCase()
        .includes(normalizedSearch)
    })
    .slice()
    .sort((a, b) => {
      if (focusedJobId) {
        if (a.id === focusedJobId && b.id !== focusedJobId) return -1
        if (b.id === focusedJobId && a.id !== focusedJobId) return 1
      }
      return 0
    })

  const scheduleReport = useMemo(() => validateStoreSchedulesAndWorkload(state), [state])
  const templateItems = state.inventory.filter(
    (item) => item.estimatedHoursPerUnitOrSet !== undefined && item.estimatedHoursPerUnitOrSet > 0,
  )

  // Combined window recommendations across filtered jobs (only sharing confirmed windows)
  const windowRecommendations = useMemo(
    () =>
      calculateCombinedWindowCrewRecommendations(
        filteredJobs.map((j) => ({
          id: j.id,
          requestedQty: j.spec.requestedQty,
          estimatedHoursPerUnitOrSet:
            j.estimatedHoursPerUnitOrSet ?? j.spec.estimatedHoursPerUnitOrSet,
          estimateBasis: j.estimateBasis ?? j.spec.estimateBasis,
          productionWindow: j.productionWindow,
        })),
      ),
    [filteredJobs],
  )

  const filteredJobIds = new Set(filteredJobs.map((j) => j.id))
  const relevantScheduleConflicts = scheduleReport.conflicts.filter(
    (c) =>
      (!c.jobId && (!effectiveFilterEventId || c.eventId === effectiveFilterEventId)) ||
      (c.jobId && filteredJobIds.has(c.jobId)),
  )

  const getPlanDraft = (job: (typeof state.fabricationJobs)[number]): JobPlanDraft => {
    if (planDrafts[job.id]) return planDrafts[job.id]
    const order = state.orderRequests.find((o) => o.eventId === job.eventId)
    const fallbackStart =
      job.productionWindow?.startDate ||
      order?.startDateTime.slice(0, 10) ||
      "2026-04-16"
    const fallbackDeadline =
      job.productionWindow?.deadlineDate ||
      order?.startDateTime.slice(0, 10) ||
      "2026-04-22"
    const matchedTemplate = templateItems.find(
      (i) => i.name.toLowerCase() === job.spec.name.toLowerCase(),
    )
    return {
      templateAssetId: matchedTemplate?.assetId ?? "",
      estHours:
        job.estimatedHoursPerUnitOrSet !== undefined
          ? String(job.estimatedHoursPerUnitOrSet)
          : job.spec.estimatedHoursPerUnitOrSet !== undefined
            ? String(job.spec.estimatedHoursPerUnitOrSet)
            : "",
      basis: job.estimateBasis ?? job.spec.estimateBasis ?? "per-unit",
      startDate: fallbackStart,
      deadlineDate: fallbackDeadline,
      days: job.productionWindow?.availableProductionDays
        ? String(job.productionWindow.availableProductionDays)
        : "4",
      assignmentMode: job.assignmentMode ?? "group",
      productionLeadEmail: job.productionLeadEmail ?? job.inheritedLeadEmail ?? "",
      participants: [...(job.participantEmails ?? [])],
    }
  }

  const updatePlanDraft = (jobId: string, base: JobPlanDraft, patch: Partial<JobPlanDraft>) => {
    setPlanDrafts((prev) => ({
      ...prev,
      [jobId]: { ...base, ...patch },
    }))
  }

  const getShiftDraft = (
    job: (typeof state.fabricationJobs)[number],
    planDraft: JobPlanDraft,
  ): JobShiftDraft => {
    if (shiftDrafts[job.id]) return shiftDrafts[job.id]
    const order = state.orderRequests.find((o) => o.eventId === job.eventId)
    const activeRoster = (order?.eventRoster ?? []).filter((r) => !r.removedAt)
    const defaultWorker =
      planDraft.participants[0] || activeRoster[0]?.crewEmail || "crew@demo.com"
    const startDay = planDraft.startDate || "2026-04-18"
    return {
      selectedWorkers: defaultWorker ? [defaultWorker] : [],
      activityType: "fabrication",
      startDateTime: `${startDay}T08:00`,
      endDateTime: `${startDay}T17:00`,
      breakMinutes: "60",
      breakStart: "",
      breakEnd: "",
      isSharedShift: false,
      minSimultaneousCrew: "2",
      sharedGroupId: `grp-${job.id.slice(-4)}`,
      instructions: "",
    }
  }

  const updateShiftDraft = (
    jobId: string,
    base: JobShiftDraft,
    patch: Partial<JobShiftDraft>,
  ) => {
    setShiftDrafts((prev) => ({
      ...prev,
      [jobId]: { ...base, ...patch },
    }))
  }

  const manilaTodayKey = getManilaTodayKey()
  const windowDays = useMemo(() => {
    return Array.from({ length: 14 }, (_, idx) => {
      const dateKey = shiftManilaDateKey(windowAnchorDate, idx)
      const { weekday, monthDay } = formatManilaDayHeader(dateKey)
      return {
        dateKey,
        weekday,
        monthDay,
        isToday: dateKey === manilaTodayKey,
      }
    })
  }, [windowAnchorDate, manilaTodayKey])

  const windowStartKey = windowDays[0]?.dateKey ?? windowAnchorDate
  const windowEndKey = windowDays[windowDays.length - 1]?.dateKey ?? windowAnchorDate

  const activeDetailJob = activeJobModalId
    ? filteredJobs.find((j) => j.id === activeJobModalId) ??
      state.fabricationJobs.find((j) => j.id === activeJobModalId)
    : undefined

  const allProductionShifts = useMemo(() => {
    const out: Array<{
      eventId: string
      jobId?: string
      crewEmail: string
      crewName: string
      startDateKey: string
      endDateKey: string
      productiveHours: number
      activityType: string
      status: string
    }> = []
    for (const o of state.orderRequests) {
      for (const s of o.eventSchedules ?? []) {
        if (s.status === "cancelled") continue
        out.push({
          eventId: o.eventId,
          jobId: s.jobId,
          crewEmail: s.crewEmail,
          crewName: s.crewName ?? s.crewEmail,
          startDateKey: toManilaDateKey(s.startDateTime),
          endDateKey: toManilaDateKey(s.endDateTime),
          productiveHours: s.plannedProductiveHours,
          activityType: s.activityType,
          status: s.status,
        })
      }
    }
    return out
  }, [state.orderRequests])

  const dailyCrewByDateKey = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const day of windowDays) map[day.dateKey] = new Set()
    for (const shift of allProductionShifts) {
      if (effectiveFilterEventId && shift.eventId !== effectiveFilterEventId) continue
      for (const day of windowDays) {
        if (day.dateKey >= shift.startDateKey && day.dateKey <= shift.endDateKey) {
          map[day.dateKey].add(shift.crewEmail.toLowerCase())
        }
      }
    }
    return map
  }, [allProductionShifts, windowDays, effectiveFilterEventId])

  const ganttEventGroups = useMemo(() => {
    if (embedded || ganttGroupBy === "all") {
      return [
        {
          eventId: effectiveFilterEventId || "all",
          eventTitle: "",
          jobs: filteredJobs,
        },
      ]
    }
    const groups = new Map<string, { eventId: string; eventTitle: string; jobs: typeof filteredJobs }>()
    for (const job of filteredJobs) {
      const existing = groups.get(job.eventId)
      if (existing) {
        existing.jobs.push(job)
      } else {
        groups.set(job.eventId, {
          eventId: job.eventId,
          eventTitle: job.eventTitle,
          jobs: [job],
        })
      }
    }
    return Array.from(groups.values())
  }, [filteredJobs, embedded, ganttGroupBy, effectiveFilterEventId])

  return (
    <div className="min-w-0 space-y-5">
      {!embedded && (
        <PageHeader
          crumbs={["Dashboard", "Production & Fabrication"]}
          title="Production & Fabrication"
          subtitle="Bespoke build estimation, Gantt timeline scheduling, and workshop capacity."
        />
      )}

      {/* Primary Toolbar: Views (Left) + Search / Planning Tools / Schedule Production (Right) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-card p-1"
          role="tablist"
          aria-label="Production views"
        >
          {(
            [
              { key: "gantt", label: "Gantt Timeline", icon: Calendar },
              { key: "kanban", label: "Kanban Board", icon: Columns3 },
            ] as const
          ).map((item) => {
            const Icon = item.icon
            const active = viewMode === item.key
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setViewMode(item.key)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items or events..."
              aria-label="Search production items or events"
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant={planningToolsOpen ? "solid" : "outline"}
            icon={SlidersHorizontal}
            onClick={() => setPlanningToolsOpen((v) => !v)}
          >
            Planning Tools
          </Button>
          <Button type="button" icon={Plus} onClick={() => setShowNewModal((v) => !v)}>
            {showNewModal ? "Close Form" : "Schedule Production"}
          </Button>
        </div>
      </div>

      {/* Visible Active Filter Bar (outside Planning Tools) */}
      {!embedded && (filterEventId || focusedJobId) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-fg/[0.02] px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-muted-foreground">Active Filter:</span>
            {filterEventId && (
              <Badge tone="info">
                Event:{" "}
                {state.orderRequests.find((o) => o.eventId === filterEventId)?.eventTitle ??
                  filterEventId}
              </Badge>
            )}
            {focusedJobId && <Badge tone="neutral">Job: {focusedJobId}</Badge>}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFilterEventId("")
              setFocusedJobId("")
              setActiveJobModalId(null)
            }}
          >
            Show All Events ({state.fabricationJobs.length})
          </Button>
        </div>
      )}

      {/* Collapsible Planning Tools Panel */}
      {planningToolsOpen && (
        <div className="space-y-4">
          {!embedded && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={!filterEventId ? "solid" : "outline"}
                  onClick={() => setFilterEventId("")}
                >
                  All Events ({state.fabricationJobs.length})
                </Button>
                {state.orderRequests.map((o) => {
                  const count = state.fabricationJobs.filter((j) => j.eventId === o.eventId).length
                  return (
                    <Button
                      key={o.eventId}
                      type="button"
                      variant={filterEventId === o.eventId ? "solid" : "outline"}
                      onClick={() => setFilterEventId(o.eventId)}
                    >
                      {o.eventTitle} ({count})
                    </Button>
                  )
                })}
              </div>
              {onNavigate && (
                <Button
                  type="button"
                  variant="outline"
                  icon={ClipboardCheck}
                  onClick={() =>
                    onNavigate("module-verification", {
                      eventId: filterEventId || undefined,
                      jobId: focusedJobId || undefined,
                      subView: "verification",
                    })
                  }
                >
                  Open Verification Queue
                </Button>
              )}
            </div>
          )}

          {/* Combined Production Window Crew Recommendations */}
          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Combined Production Window Staffing Recommendations
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Formula: <code>ceil(combined estimated labor hours / (8 × available production days))</code>.
                  Jobs sharing the same confirmed start/deadline/working-days window combine hours
                  before rounding; unconfigured jobs are listed explicitly rather than shown as 0.
                </p>
              </div>
              <Badge tone="neutral">
                {windowRecommendations.windows.length} Confirmed Window(s) ·{" "}
                {windowRecommendations.skippedJobs.length} Not Configured
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {windowRecommendations.windows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-3.5 text-xs text-muted-foreground">
                  No production windows and labor estimates confirmed yet. Click any job to
                  configure its estimate and working days.
                </div>
              ) : (
                windowRecommendations.windows.map((win) => (
                  <div
                    key={win.windowKey}
                    className="rounded-xl border border-line bg-fg/[0.02] p-3.5 text-xs space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {win.startDate} → {win.deadlineDate} ({win.availableProductionDays} working days)
                      </span>
                      <Badge tone="info">{win.recommendedProductionCrew} Recommended Crew</Badge>
                    </div>
                    <div className="text-muted-foreground">
                      Combined Estimated Labor:{" "}
                      <strong className="text-foreground">
                        {win.combinedEstimatedLaborHours} person-hrs
                      </strong>{" "}
                      across {win.jobIds.length} job(s) ({win.jobIds.join(", ")})
                    </div>
                  </div>
                ))
              )}

              {windowRecommendations.skippedJobs.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs space-y-1">
                  <div className="font-semibold text-foreground">
                    Jobs Not Yet Configured ({windowRecommendations.skippedJobs.length})
                  </div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {windowRecommendations.skippedJobs.map((s) => {
                      const j = filteredJobs.find((item) => item.id === s.jobId)
                      return (
                        <li key={s.jobId}>
                          • <strong className="text-foreground">{j?.spec.name ?? s.jobId}:</strong>{" "}
                          Not configured ({s.reason})
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* New Job Creation Card */}
      {showNewModal && (
        <Card className="p-5 space-y-4">
          <h3 className="text-base font-bold text-foreground">
            Create Custom Fabrication Job Linked to Approved Event
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {!embedded && (
              <Field label="Linked Approved Event">
                <select
                  className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
                  value={newSpec.eventId}
                  onChange={(e) => setNewSpec({ ...newSpec, eventId: e.target.value })}
                >
                  {state.orderRequests.map((o) => (
                    <option key={o.eventId} value={o.eventId}>
                      {o.eventTitle} ({o.id})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Custom Item Name">
              <Input
                value={newSpec.name}
                onChange={(e) => setNewSpec({ ...newSpec, name: e.target.value })}
                placeholder="e.g. Custom Botanical Entry Arch"
              />
            </Field>
            <Field label="Requested Quantity">
              <Input
                type="number"
                min={1}
                value={newSpec.requestedQty}
                onChange={(e) =>
                  setNewSpec({
                    ...newSpec,
                    requestedQty: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </Field>
            <Field label="Dimensions">
              <Input
                value={newSpec.dimensions}
                onChange={(e) => setNewSpec({ ...newSpec, dimensions: e.target.value })}
                placeholder="3.0m H × 2.2m W"
              />
            </Field>
            <Field label="Materials">
              <Input
                value={newSpec.materials}
                onChange={(e) => setNewSpec({ ...newSpec, materials: e.target.value })}
                placeholder="Powder-coated steel, cedar slats"
              />
            </Field>
            <Field label="Colors & Finish">
              <Input
                value={newSpec.colors}
                onChange={(e) =>
                  setNewSpec({ ...newSpec, colors: e.target.value, finish: e.target.value })
                }
                placeholder="Warm ivory satin matte"
              />
            </Field>
          </div>
          <Field label="Build & Assembly Instructions">
            <textarea
              className={textareaCls}
              rows={2}
              value={newSpec.buildInstructions}
              onChange={(e) =>
                setNewSpec({ ...newSpec, buildInstructions: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowNewModal(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const res = createCustomFabricationJob(
                  newSpec.eventId,
                  {
                    name: newSpec.name,
                    requestedQty: newSpec.requestedQty,
                    dimensions: newSpec.dimensions || "Per venue drawing",
                    materials: newSpec.materials || "Specified materials",
                    colors: newSpec.colors || "Theme palette",
                    finish: newSpec.finish || "Matte finish",
                    buildInstructions:
                      newSpec.buildInstructions ||
                      "Follow approved Event Manager specification.",
                    referenceImages: [newSpec.referenceImage],
                  },
                  [],
                )
                notifyMutationResult(
                  notify,
                  res,
                  res.ok ? `Created production job for ${res.job.spec.name}.` : "",
                )
                if (res.ok) setShowNewModal(false)
              }}
            >
              Create Production Job
            </Button>
          </div>
        </Card>
      )}

      {/* Schedule, Workload, Shared-Shift & Capacity Alerts */}
      {relevantScheduleConflicts.length > 0 && (
        <Card className="border-danger/40 bg-danger/[0.06] p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-bold text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Production Schedule, Workload &amp; Shared-Shift Alerts ({relevantScheduleConflicts.length})
            </span>
          </div>
          <ul className="space-y-1 text-xs text-foreground">
            {relevantScheduleConflicts.map((c, idx) => (
              <li key={`${c.kind}-${idx}`}>
                • <strong className="uppercase">{c.kind.replace(/-/g, " ")}:</strong> {c.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* VIEW 1: GANTT TIMELINE */}
      {viewMode === "gantt" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {!embedded ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  View:
                </span>
                <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-card p-0.5">
                  {(
                    [
                      { key: "event", label: "By Event" },
                      { key: "all", label: "All Jobs" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setGanttGroupBy(opt.key)}
                      className={cx(
                        "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                        ganttGroupBy === opt.key
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs font-medium text-muted-foreground">
                Showing {filteredJobs.length} event production job(s) across 14-day Asia/Manila
                window
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Previous 14 days"
                  onClick={() => setWindowAnchorDate((d) => shiftManilaDateKey(d, -7))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setWindowAnchorDate(getManilaWeekStartKey(manilaTodayKey))}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Next 14 days"
                  onClick={() => setWindowAnchorDate((d) => shiftManilaDateKey(d, 7))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {formatManilaDayHeader(windowStartKey).monthDay} –{" "}
                {formatManilaDayHeader(windowEndKey).monthDay} (Asia/Manila)
              </span>
            </div>
          </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[1120px]">
                  {/* Header Row */}
                  <div className="grid grid-cols-[300px_repeat(14,minmax(56px,1fr))] border-b border-line bg-fg/[0.03] text-[11px]">
                    <div className="sticky left-0 z-20 flex items-center justify-between border-r border-line bg-card px-4 py-2.5 font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>Job &amp; Quota</span>
                      <span>Crew / Status</span>
                    </div>
                    {windowDays.map((day) => (
                      <div
                        key={day.dateKey}
                        className={cx(
                          "border-r border-line px-1 py-2 text-center last:border-r-0",
                          day.isToday && "bg-accent/10",
                        )}
                      >
                        <div className="text-[10px] font-medium text-muted-foreground">
                          {day.weekday}
                        </div>
                        <div
                          className={cx(
                            "font-semibold",
                            day.isToday ? "text-accent" : "text-foreground",
                          )}
                        >
                          {day.monthDay}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Daily Assigned Crew Summary Row */}
                  <div className="grid grid-cols-[300px_repeat(14,minmax(56px,1fr))] border-b border-line bg-fg/[0.015] text-[11px]">
                    <div className="sticky left-0 z-20 flex items-center gap-1.5 border-r border-line bg-card px-4 py-2 font-medium text-muted-foreground">
                      <Users className="size-3.5" aria-hidden="true" />
                      <span>Daily Assigned Crew</span>
                    </div>
                    {windowDays.map((day) => {
                      const crewCount = dailyCrewByDateKey[day.dateKey]?.size ?? 0
                      return (
                        <div
                          key={day.dateKey}
                          className={cx(
                            "border-r border-line px-1 py-2 text-center last:border-r-0",
                            day.isToday && "bg-accent/5",
                          )}
                        >
                          {crewCount > 0 ? (
                            <span className="font-semibold text-foreground">{crewCount}</span>
                          ) : (
                            <span className="text-muted-foreground/70">None</span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {filteredJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-xs text-muted-foreground">
                      <p className="text-sm font-medium text-foreground">
                        No production jobs match the current filter.
                      </p>
                      {!embedded && (filterEventId || searchQuery.trim()) && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setFilterEventId("")
                            setFocusedJobId("")
                            setSearchQuery("")
                          }}
                        >
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  ) : (
                    /* Grouped Event + Job Rows */
                    ganttEventGroups.map((group) => (
                    <div key={group.eventId}>
                      {!embedded && ganttGroupBy === "event" && group.eventTitle && (
                        <div className="flex items-center justify-between border-b border-line bg-fg/[0.03] px-4 py-2 text-xs">
                          <span className="font-semibold text-foreground">{group.eventTitle}</span>
                          <span className="text-muted-foreground">
                            {group.jobs.length} custom job(s)
                          </span>
                        </div>
                      )}

                      {group.jobs.map((job) => {
                        const estHours = calculateJobEstimatedLaborHours({
                          requestedQty: job.spec.requestedQty,
                          estimatedHoursPerUnitOrSet:
                            job.estimatedHoursPerUnitOrSet ?? job.spec.estimatedHoursPerUnitOrSet,
                          estimateBasis: job.estimateBasis ?? job.spec.estimateBasis,
                        })
                        const participants =
                          job.participantEmails && job.participantEmails.length > 0
                            ? job.participantEmails
                            : job.assignedCrewEmails
                        const jobShifts = allProductionShifts.filter((s) => s.jobId === job.id)
                        const hasWindow = Boolean(
                          job.productionWindow?.confirmed &&
                            job.productionWindow.startDate &&
                            job.productionWindow.deadlineDate,
                        )
                        const winStart = job.productionWindow?.startDate ?? ""
                        const winEnd = job.productionWindow?.deadlineDate ?? ""
                        const windowInRange =
                          hasWindow && winEnd >= windowStartKey && winStart <= windowEndKey
                        const shiftsInRange = jobShifts.some(
                          (s) => s.endDateKey >= windowStartKey && s.startDateKey <= windowEndKey,
                        )
                        const hasAnySchedule = hasWindow || jobShifts.length > 0
                        const isOutsideVisible = hasAnySchedule && !windowInRange && !shiftsInRange

                        const outsideSummary = hasWindow
                          ? `${winStart} – ${winEnd}`
                          : jobShifts.length > 0
                            ? `${jobShifts[0].startDateKey} – ${jobShifts[jobShifts.length - 1].endDateKey}`
                            : ""

                        return (
                          <div
                            key={job.id}
                            className="grid grid-cols-[300px_repeat(14,minmax(56px,1fr))] border-b border-line last:border-b-0 hover:bg-fg/[0.02]"
                          >
                            {/* Sticky Left Job Info Column */}
                            <button
                              type="button"
                              onClick={() => setActiveJobModalId(job.id)}
                              className="sticky left-0 z-10 flex flex-col justify-between gap-1.5 border-r border-line bg-card px-4 py-3 text-left transition-colors hover:bg-fg/[0.04]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="line-clamp-2 text-xs font-semibold text-foreground">
                                  {job.spec.name}
                                </span>
                                <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                                  {job.spec.requestedQty} pcs
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
                                <span>
                                  {estHours ? `${estHours}h est.` : "Estimate pending"} ·{" "}
                                  {participants.length} crew
                                </span>
                                <Badge
                                  tone={
                                    job.status === "Ready to Load"
                                      ? "success"
                                      : job.status === "Awaiting Verification"
                                        ? "info"
                                        : job.status === "Needs Correction"
                                          ? "danger"
                                          : "warning"
                                  }
                                >
                                  {job.status}
                                </Badge>
                              </div>
                            </button>

                            {/* Timeline Cells */}
                            <div className="relative col-span-14 grid grid-cols-14">
                              {windowDays.map((day) => {
                                const inConfirmedWindow =
                                  hasWindow && day.dateKey >= winStart && day.dateKey <= winEnd
                                const dayShifts = jobShifts.filter(
                                  (s) =>
                                    day.dateKey >= s.startDateKey && day.dateKey <= s.endDateKey,
                                )
                                return (
                                  <div
                                    key={day.dateKey}
                                    onClick={() => setActiveJobModalId(job.id)}
                                    className={cx(
                                      "flex min-h-[68px] cursor-pointer flex-col justify-center gap-1 border-r border-line px-1 py-1.5 last:border-r-0",
                                      day.isToday && "bg-accent/5",
                                    )}
                                  >
                                    {inConfirmedWindow && (
                                      <div
                                        title={`Confirmed Production Window (${winStart} – ${winEnd})`}
                                        className="rounded border border-dashed border-accent/60 bg-accent/10 px-1 py-0.5 text-center text-[9px] font-medium text-accent"
                                      >
                                        Window
                                      </div>
                                    )}
                                    {dayShifts.map((sh, sIdx) => (
                                      <div
                                        key={`${sh.crewEmail}-${sIdx}`}
                                        title={`Worker Shift: ${sh.crewName} (${sh.productiveHours}h · ${sh.activityType})`}
                                        className="truncate rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground"
                                      >
                                        {sh.crewName.split(" ")[0]} {sh.productiveHours}h
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}

                              {!hasAnySchedule && (
                                <button
                                  type="button"
                                  onClick={() => setActiveJobModalId(job.id)}
                                  className="pointer-events-auto absolute inset-0 flex items-center justify-center text-xs italic text-muted-foreground hover:text-foreground"
                                >
                                  Unscheduled — click to configure window or assign shifts
                                </button>
                              )}

                              {isOutsideVisible && (
                                <button
                                  type="button"
                                  onClick={() => setActiveJobModalId(job.id)}
                                  className="pointer-events-auto absolute inset-0 flex items-center justify-center text-xs italic text-muted-foreground hover:text-foreground"
                                >
                                  Scheduled outside active 14-day window ({outsideSummary})
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))
                  )}
                </div>
              </div>
            </Card>
        </div>
      )}

      {/* VIEW 2: KANBAN BOARD (No drag-and-drop to preserve submission & verification gates) */}
      {viewMode === "kanban" && (
        <div className="space-y-3">
          {filteredJobs.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No custom production jobs match the current filter.
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(
                [
                  "Unassigned",
                  "Assigned",
                  "In Production",
                  "Needs Correction",
                  "Awaiting Verification",
                  "Ready to Load",
                ] as const
              ).map((statusCol) => {
                const colJobs = filteredJobs.filter((j) => j.status === statusCol)
                return (
                  <Card key={statusCol} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        {statusCol}
                      </span>
                      <Badge tone="neutral">{colJobs.length}</Badge>
                    </div>
                    {colJobs.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No jobs in {statusCol}.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {colJobs.map((job) => {
                          const estHours = calculateJobEstimatedLaborHours({
                            requestedQty: job.spec.requestedQty,
                            estimatedHoursPerUnitOrSet:
                              job.estimatedHoursPerUnitOrSet ??
                              job.spec.estimatedHoursPerUnitOrSet,
                            estimateBasis: job.estimateBasis ?? job.spec.estimateBasis,
                          })
                          const participants =
                            job.participantEmails && job.participantEmails.length > 0
                              ? job.participantEmails
                              : job.assignedCrewEmails
                          return (
                            <button
                              key={job.id}
                              type="button"
                              onClick={() => setActiveJobModalId(job.id)}
                              className="w-full rounded-xl border border-line bg-fg/[0.02] p-3 text-left space-y-1.5 transition-colors hover:border-fg/30 hover:bg-fg/[0.04]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  {job.spec.name}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {job.spec.requestedQty} pcs
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {job.eventTitle} · {estHours ? `${estHours}h est.` : "Est. pending"} ·{" "}
                                {participants.length} crew
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* JOB DETAILS & SCHEDULING MODAL */}
      <Modal
        open={Boolean(activeDetailJob)}
        onClose={() => setActiveJobModalId(null)}
        title={activeDetailJob ? `${activeDetailJob.spec.name} (${activeDetailJob.id})` : "Production Details"}
        panelClassName="max-w-5xl"
      >
        {activeDetailJob && (() => {
            const job = activeDetailJob
            const order = state.orderRequests.find((o) => o.eventId === job.eventId)
            const activeRoster = (order?.eventRoster ?? []).filter((r) => !r.removedAt)
            const linkedPhotos = state.afterShiftPhotos.filter((p) =>
              job.linkedShiftPhotoIds.includes(p.id),
            )
            const planDraft = getPlanDraft(job)
            const shiftDraft = getShiftDraft(job, planDraft)

            const estHoursVal =
              job.estimatedHoursPerUnitOrSet ?? job.spec.estimatedHoursPerUnitOrSet
            const laborCalc = calculateJobEstimatedLaborHours({
              requestedQty: job.spec.requestedQty,
              estimatedHoursPerUnitOrSet: estHoursVal,
              estimateBasis: job.estimateBasis ?? job.spec.estimateBasis,
            })

            const win = job.productionWindow
            const isWindowConfirmed =
              Boolean(win?.confirmed) &&
              Boolean(win?.startDate) &&
              Boolean(win?.deadlineDate) &&
              Number(win?.availableProductionDays) > 0

            const jobSchedules = job.schedules ?? []
            const activeJobSchedules = jobSchedules.filter((s) => s.status !== "cancelled")
            const fabricationHoursScheduled =
              Math.round(
                activeJobSchedules
                  .filter((s) => s.activityType === "fabrication")
                  .reduce((sum, s) => sum + s.plannedProductiveHours, 0) * 100,
              ) / 100
            const effectiveLeadEmail =
              job.productionLeadEmail ?? job.inheritedLeadEmail ?? ""
            const effectiveLeadCap = effectiveLeadEmail
              ? calculateWorkingLeadCapacity(activeJobSchedules, effectiveLeadEmail)
              : null

            const unresolvedFlags = (job.migrationReviewFlags ?? []).filter((f) => !f.resolvedAt)
            const isFocused = focusedJobId === job.id

            // Live shift form preview + shared-shift coverage check
            const isOvernightPreview =
              shiftDraft.startDateTime.slice(0, 10) !== "" &&
              shiftDraft.endDateTime.slice(0, 10) !== "" &&
              shiftDraft.startDateTime.slice(0, 10) !== shiftDraft.endDateTime.slice(0, 10)
            const requiresBreakWindow =
              (isOvernightPreview ||
                (shiftDraft.isSharedShift && Number(shiftDraft.minSimultaneousCrew) > 1)) &&
              (Number(shiftDraft.breakMinutes) > 0 ||
                Boolean(shiftDraft.breakStart) ||
                Boolean(shiftDraft.breakEnd))

            const shiftCalcPreview = validateAndComputeShiftSchedule({
              startDateTime: shiftDraft.startDateTime,
              endDateTime: shiftDraft.endDateTime,
              breakMinutes:
                shiftDraft.breakStart && shiftDraft.breakEnd
                  ? undefined
                  : Number(shiftDraft.breakMinutes) || 0,
              breakStartDateTime: shiftDraft.breakStart || undefined,
              breakEndDateTime: shiftDraft.breakEnd || undefined,
              isSharedShift: shiftDraft.isSharedShift,
              requiredSimultaneousCrew: shiftDraft.isSharedShift
                ? Math.max(2, Number(shiftDraft.minSimultaneousCrew) || 2)
                : undefined,
            })

            const sharedPreviewCoverage =
              shiftDraft.isSharedShift && shiftCalcPreview.ok
                ? validateSharedShiftSimultaneousCoverage(
                  [
                    ...activeJobSchedules,
                    ...shiftDraft.selectedWorkers.map((email, idx) => ({
                      id: `preview-${idx}`,
                      eventId: job.eventId,
                      jobId: job.id,
                      assignmentId: "preview",
                      crewEmail: email,
                      startDateTime: shiftDraft.startDateTime,
                      endDateTime: shiftDraft.endDateTime,
                      breakMinutes: shiftCalcPreview.breakMinutes,
                      breakStartDateTime: shiftDraft.breakStart || undefined,
                      breakEndDateTime: shiftDraft.breakEnd || undefined,
                      plannedProductiveHours: shiftCalcPreview.plannedProductiveHours,
                      dailyProductiveHoursByManilaDate:
                        shiftCalcPreview.dailyProductiveHoursByManilaDate,
                      activityType: shiftDraft.activityType,
                      isSharedShift: true,
                      sharedShiftGroupId: shiftDraft.sharedGroupId || undefined,
                      requiredSimultaneousCrew: Math.max(
                        2,
                        Number(shiftDraft.minSimultaneousCrew) || 2,
                      ),
                      status: "scheduled" as const,
                    })),
                  ],
                  {
                    startDateTime: shiftDraft.startDateTime,
                    endDateTime: shiftDraft.endDateTime,
                    requiredSimultaneousCrew: Math.max(
                      2,
                      Number(shiftDraft.minSimultaneousCrew) || 2,
                    ),
                    jobId: job.id,
                    sharedShiftGroupId: shiftDraft.sharedGroupId || undefined,
                  },
                )
                : null

            const isSingleWorkerIndividual =
              (job.assignmentMode ?? "group") === "individual" &&
              (job.participantEmails?.length ?? 0) === 1

            return (
              <Card
                key={job.id}
                className={`p-6 space-y-5 ${isFocused ? "ring-2 ring-fg/30" : ""}`}
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{job.id}</span>
                      <Badge tone="neutral">Event: {job.eventTitle}</Badge>
                      <Badge
                        tone={
                          job.status === "Ready to Load"
                            ? "success"
                            : job.status === "Awaiting Verification"
                              ? "info"
                              : job.status === "Needs Correction"
                                ? "danger"
                                : "warning"
                        }
                      >
                        {job.status}
                      </Badge>
                      <Badge tone="neutral">
                        Mode: {(job.assignmentMode ?? "group") === "individual" ? "Individual" : "Group"}
                      </Badge>
                      {job.releasedForLoading && (
                        <Badge tone="info">Included on Dispatch Manifest</Badge>
                      )}
                      {unresolvedFlags.length > 0 && (
                        <Badge tone="danger">
                          {unresolvedFlags.length} Migration Review Flag(s)
                        </Badge>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-lg font-bold text-foreground">{job.spec.name}</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {onNavigate && (
                      <Button
                        type="button"
                        variant="outline"
                        icon={Users}
                        onClick={() =>
                          onNavigate("module-crew-scheduling", {
                            eventId: job.eventId,
                            jobId: job.id,
                            subView: "crew",
                          })
                        }
                      >
                        Crew &amp; Roster ({activeRoster.length})
                      </Button>
                    )}
                    {job.status === "Awaiting Verification" && onNavigate && (
                      <Button
                        type="button"
                        variant="outline"
                        icon={ArrowRight}
                        onClick={() =>
                          onNavigate("module-verification", {
                            eventId: job.eventId,
                            jobId: job.id,
                            subView: "verification",
                          })
                        }
                      >
                        Inspect in Verification
                      </Button>
                    )}
                  </div>
                </div>

                {/* Migration Review Banner */}
                {unresolvedFlags.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                    <div className="space-y-1">
                      <div className="font-semibold">Warehouse Migration Review Required</div>
                      {unresolvedFlags.map((flag) => (
                        <div key={flag.id}>
                          • <strong>{flag.code.replace(/_/g, " ")}:</strong> {flag.message}
                        </div>
                      ))}
                    </div>
                    {onNavigate && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          onNavigate("module-crew-scheduling", {
                            eventId: job.eventId,
                            jobId: job.id,
                            subView: "crew",
                          })
                        }
                        className="h-7 px-2.5 text-xs"
                      >
                        Review in Crew &amp; Scheduling
                      </Button>
                    )}
                  </div>
                )}

                {/* Read-Only Client Spec + Staffing & Capacity Metrics */}
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-foreground">
                        1. Client-Approved Specification (Read-Only)
                      </span>
                      <Badge tone="neutral">Qty: {job.spec.requestedQty}</Badge>
                    </div>
                    <div className="flex items-start gap-3">
                      <Visual
                        src={job.spec.referenceImages[0] || "/event-manager-images/garden.jpg"}
                        label={job.spec.name}
                        className="size-20 shrink-0 rounded-lg"
                      />
                      <div className="grid gap-1.5 sm:grid-cols-2 flex-1">
                        <div>
                          <span className="text-muted-foreground">Required Qty:</span>{" "}
                          <strong className="text-foreground">{job.spec.requestedQty}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Basis:</span>{" "}
                          <strong className="text-foreground">
                            {(job.estimateBasis ?? job.spec.estimateBasis) === "complete-set"
                              ? "Per complete set"
                              : "Per unit"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Dimensions:</span>{" "}
                          <strong className="text-foreground">{job.spec.dimensions}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Materials:</span>{" "}
                          <strong className="text-foreground">{job.spec.materials}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Colors:</span>{" "}
                          <strong className="text-foreground">{job.spec.colors}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Finish:</span>{" "}
                          <strong className="text-foreground">{job.spec.finish}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-line pt-2">
                      <span className="font-semibold text-foreground">Build Instructions:</span>
                      <p className="mt-1 text-muted-foreground">{job.spec.buildInstructions}</p>
                    </div>
                  </div>

                  {/* Staffing & Capacity Readout */}
                  <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3 text-xs">
                    <div className="text-sm font-bold text-foreground">
                      2. Labor Estimate, Leadership &amp; Scheduled Fabrication Capacity
                    </div>
                    <dl className="grid gap-2.5 sm:grid-cols-2">
                      <div className="rounded-lg border border-line bg-card p-2.5">
                        <dt className="text-muted-foreground">Total Estimated Labor</dt>
                        <dd className="mt-0.5 font-semibold text-foreground">
                          {laborCalc.ok
                            ? `${laborCalc.totalEstimatedLaborHours} person-hrs (${job.spec.requestedQty} × ${laborCalc.estimatedHoursPerUnitOrSet}h ${laborCalc.estimateBasis === "complete-set" ? "per complete set" : "per unit"})`
                            : "Not configured"}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-line bg-card p-2.5">
                        <dt className="text-muted-foreground">Confirmed Production Window</dt>
                        <dd className="mt-0.5 font-semibold text-foreground">
                          {isWindowConfirmed
                            ? `${win!.startDate} → ${win!.deadlineDate} (${win!.availableProductionDays}d)`
                            : "Not configured"}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-line bg-card p-2.5">
                        <dt className="text-muted-foreground">Scheduled Fabrication Capacity</dt>
                        <dd className="mt-0.5 font-semibold text-foreground">
                          {activeJobSchedules.length > 0
                            ? `${fabricationHoursScheduled}h fabrication (${activeJobSchedules.length} shift${activeJobSchedules.length === 1 ? "" : "s"})`
                            : "Not scheduled"}
                        </dd>
                        {effectiveLeadCap && effectiveLeadCap.plannedCoordinationHours > 0 && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            Lead coordination ({effectiveLeadCap.plannedCoordinationHours}h) excluded
                            from build hours
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg border border-line bg-card p-2.5">
                        <dt className="text-muted-foreground">Production Lead &amp; Roster</dt>
                        <dd className="mt-0.5 font-semibold text-foreground">
                          {job.productionLeadName ||
                            job.productionLeadEmail ||
                            (isSingleWorkerIndividual
                              ? "Optional (Single-Worker Job)"
                              : job.inheritedLeadName || job.inheritedLeadEmail || "Not selected")}
                        </dd>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Inherited Event Lead:{" "}
                          {order?.teamLeadName || order?.teamLeadEmail || "Not selected"} · Event
                          Roster: {activeRoster.length} member(s)
                        </div>
                      </div>
                    </dl>
                    <div className="text-muted-foreground">
                      Confirmed Participants:{" "}
                      <strong className="text-foreground">
                        {job.participantEmails && job.participantEmails.length > 0
                          ? job.participantEmails.join(", ")
                          : "Not configured"}
                      </strong>
                      {isSingleWorkerIndividual && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          (Single-worker Individual job: separate lead optional; inherited lead does
                          not gain verification-submission permission.)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Production Configuration Form */}
                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        3. Configure Production Window, Estimates, Mode &amp; Participants
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Apply saved Asset Inventory template estimates as editable defaults without
                        mutating other confirmed jobs. Confirm participants directly from the active
                        Event Crew Group roster.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Apply Saved Template Estimate (Optional)">
                      <select
                        aria-label="Apply Saved Template Estimate"
                        className="h-10 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                        value={planDraft.templateAssetId}
                        onChange={(e) => {
                          const assetId = e.target.value
                          const tpl = state.inventory.find((i) => i.assetId === assetId)
                          if (tpl && tpl.estimatedHoursPerUnitOrSet) {
                            updatePlanDraft(job.id, planDraft, {
                              templateAssetId: assetId,
                              estHours: String(tpl.estimatedHoursPerUnitOrSet),
                              basis: tpl.estimateBasis ?? "per-unit",
                            })
                            if (tpl.defaultSharedShiftMinCrew) {
                              updateShiftDraft(job.id, shiftDraft, {
                                isSharedShift: tpl.defaultSharedShiftMinCrew > 1,
                                minSimultaneousCrew: String(tpl.defaultSharedShiftMinCrew),
                              })
                            }
                          } else {
                            updatePlanDraft(job.id, planDraft, { templateAssetId: assetId })
                          }
                        }}
                      >
                        <option value="">Choose saved template default…</option>
                        {templateItems.map((tpl) => (
                          <option key={tpl.assetId} value={tpl.assetId}>
                            {tpl.name} ({tpl.estimatedHoursPerUnitOrSet}h /{" "}
                            {tpl.estimateBasis === "complete-set" ? "set" : "unit"}
                            {tpl.defaultSharedShiftMinCrew
                              ? `, min ${tpl.defaultSharedShiftMinCrew} crew`
                              : ""}
                            )
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Est. Person-Hours per Unit / Set">
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={planDraft.estHours}
                        onChange={(e) =>
                          updatePlanDraft(job.id, planDraft, { estHours: e.target.value })
                        }
                        placeholder="e.g. 19"
                      />
                    </Field>

                    <Field label="Quantity Estimate Basis">
                      <select
                        aria-label="Quantity Estimate Basis"
                        className="h-10 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                        value={planDraft.basis}
                        onChange={(e) =>
                          updatePlanDraft(job.id, planDraft, {
                            basis: e.target.value as EstimateBasis,
                          })
                        }
                      >
                        <option value="per-unit">Per individual unit</option>
                        <option value="complete-set">Per complete set</option>
                      </select>
                    </Field>

                    <Field label="Assignment Mode">
                      <select
                        aria-label="Assignment Mode"
                        className="h-10 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                        value={planDraft.assignmentMode}
                        onChange={(e) =>
                          updatePlanDraft(job.id, planDraft, {
                            assignmentMode: e.target.value as AssignmentMode,
                          })
                        }
                      >
                        <option value="group">Group (Production Lead submits)</option>
                        <option value="individual">
                          Individual (Worker / Lead per headcount)
                        </option>
                      </select>
                    </Field>

                    <Field label="Production Start Date (Asia/Manila)">
                      <Input
                        type="date"
                        value={planDraft.startDate}
                        onChange={(e) =>
                          updatePlanDraft(job.id, planDraft, { startDate: e.target.value })
                        }
                      />
                    </Field>

                    <Field label="Production Deadline Date (Asia/Manila)">
                      <Input
                        type="date"
                        value={planDraft.deadlineDate}
                        onChange={(e) =>
                          updatePlanDraft(job.id, planDraft, { deadlineDate: e.target.value })
                        }
                      />
                    </Field>

                    <Field label="Available Production Working Days">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={planDraft.days}
                        onChange={(e) =>
                          updatePlanDraft(job.id, planDraft, { days: e.target.value })
                        }
                      />
                    </Field>

                    <Field label="Production Lead (Inherited or Override)">
                      <select
                        aria-label="Production Lead"
                        className="h-10 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                        value={planDraft.productionLeadEmail}
                        onChange={(e) =>
                          updatePlanDraft(job.id, planDraft, {
                            productionLeadEmail: e.target.value,
                          })
                        }
                      >
                        <option value="">
                          {planDraft.assignmentMode === "individual" &&
                            planDraft.participants.length <= 1
                            ? "Optional — No separate Production Lead"
                            : `Use Inherited Lead (${order?.teamLeadName || order?.teamLeadEmail || "Not selected"})`}
                        </option>
                        {activeRoster.map((r) => (
                          <option key={r.crewEmail} value={r.crewEmail}>
                            {r.crewName} ({r.crewEmail})
                            {order?.teamLeadEmail?.toLowerCase() === r.crewEmail.toLowerCase()
                              ? " — Event Lead"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  {/* Confirm Participants from Active Roster */}
                  <div className="space-y-2 border-t border-line pt-3 text-xs">
                    <div className="font-semibold text-foreground">
                      Confirm Job Participants from Event Crew Group Roster ({activeRoster.length}{" "}
                      eligible)
                    </div>
                    {activeRoster.length === 0 ? (
                      <p className="text-muted-foreground">
                        No Ground Crew members on {job.eventTitle}’s roster yet. Add roster members
                        in Crew &amp; Scheduling before confirming participants or scheduling shifts.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {activeRoster.map((member) => {
                          const emailLower = member.crewEmail.toLowerCase()
                          const checked = planDraft.participants.some(
                            (e) => e.toLowerCase() === emailLower,
                          )
                          return (
                            <label
                              key={member.crewEmail}
                              className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...planDraft.participants, emailLower]
                                    : planDraft.participants.filter(
                                      (x) => x.toLowerCase() !== emailLower,
                                    )
                                  updatePlanDraft(job.id, planDraft, { participants: next })
                                }}
                              />
                              <span className="font-medium text-foreground">{member.crewName}</span>
                              <span className="text-muted-foreground">({member.crewEmail})</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="text-xs text-muted-foreground">
                      {Number(planDraft.estHours) > 0 && Number(planDraft.days) > 0
                        ? `Preview: ${job.spec.requestedQty} × ${Number(planDraft.estHours)}h (${planDraft.basis === "complete-set" ? "complete set" : "per unit"}) = ${Math.round(job.spec.requestedQty * Number(planDraft.estHours) * 100) / 100} person-hrs · Standalone crew estimate: ${Math.ceil((job.spec.requestedQty * Number(planDraft.estHours)) / (8 * Number(planDraft.days)))} crew (shared windows combine first).`
                        : "Enter estimated hours and working days to preview labor calculation."}
                    </div>
                    <Button
                      type="button"
                      icon={Hammer}
                      onClick={() => {
                        const chosenLead = activeRoster.find(
                          (r) =>
                            r.crewEmail.toLowerCase() ===
                            planDraft.productionLeadEmail.toLowerCase(),
                        )
                        const res = confirmProductionJobWindowAndEstimate(actor, {
                          jobId: job.id,
                          startDate: planDraft.startDate,
                          deadlineDate: planDraft.deadlineDate,
                          availableProductionDays: Number(planDraft.days),
                          estimatedHoursPerUnitOrSet: Number(planDraft.estHours),
                          estimateBasis: planDraft.basis,
                          assignmentMode: planDraft.assignmentMode,
                          participantEmails:
                            activeRoster.length > 0 ? planDraft.participants : undefined,
                          productionLeadEmail: planDraft.productionLeadEmail,
                          productionLeadName: chosenLead?.crewName,
                        })
                        notifyMutationResult(
                          notify,
                          res,
                          `Confirmed production plan, labor estimate, and ${planDraft.assignmentMode} configuration for ${job.spec.name}.`,
                        )
                      }}
                    >
                      Confirm Production Plan &amp; Estimates
                    </Button>
                  </div>
                </div>

                {/* Participant Shift & Shared-Shift Scheduler */}
                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        4. Schedule Participants &amp; Shared Shifts (Asia/Manila)
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Uses the existing scheduling flow with overlap, 8h daily workload, and
                        shared-shift break coverage validation.
                      </p>
                    </div>
                    <Badge tone="neutral">{jobSchedules.length} Job Shift(s)</Badge>
                  </div>

                  {activeRoster.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-foreground">
                        Select Participant(s) to Schedule
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {activeRoster.map((member) => {
                          const emailLower = member.crewEmail.toLowerCase()
                          const checked = shiftDraft.selectedWorkers.some(
                            (e) => e.toLowerCase() === emailLower,
                          )
                          return (
                            <label
                              key={member.crewEmail}
                              className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...shiftDraft.selectedWorkers, emailLower]
                                    : shiftDraft.selectedWorkers.filter(
                                      (x) => x.toLowerCase() !== emailLower,
                                    )
                                  updateShiftDraft(job.id, shiftDraft, { selectedWorkers: next })
                                }}
                              />
                              <span className="font-medium text-foreground">{member.crewName}</span>
                            </label>
                          )
                        })}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Activity Type">
                          <select
                            aria-label="Job Shift Activity Type"
                            className="h-10 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                            value={shiftDraft.activityType}
                            onChange={(e) =>
                              updateShiftDraft(job.id, shiftDraft, {
                                activityType: e.target.value as ShiftActivityType,
                              })
                            }
                          >
                            <option value="fabrication">
                              Fabrication (Counts toward build hours)
                            </option>
                            <option value="lead-coordination">
                              Lead Coordination (Supervisory; not build hours)
                            </option>
                          </select>
                        </Field>

                        <Field label="Start Date & Time (Asia/Manila)">
                          <Input
                            type="datetime-local"
                            value={shiftDraft.startDateTime}
                            onChange={(e) =>
                              updateShiftDraft(job.id, shiftDraft, {
                                startDateTime: e.target.value,
                              })
                            }
                          />
                        </Field>

                        <Field label="End Date & Time (Asia/Manila)">
                          <Input
                            type="datetime-local"
                            value={shiftDraft.endDateTime}
                            onChange={(e) =>
                              updateShiftDraft(job.id, shiftDraft, {
                                endDateTime: e.target.value,
                              })
                            }
                          />
                        </Field>

                        <Field label="Break Minutes (Same-Day Non-Shared)">
                          <Input
                            type="number"
                            min={0}
                            step={15}
                            value={shiftDraft.breakMinutes}
                            disabled={Boolean(shiftDraft.breakStart && shiftDraft.breakEnd)}
                            onChange={(e) =>
                              updateShiftDraft(job.id, shiftDraft, {
                                breakMinutes: e.target.value,
                              })
                            }
                          />
                        </Field>

                        <div className="space-y-1.5 pt-1 text-xs">
                          <label className="flex items-center gap-2 font-semibold text-foreground">
                            <input
                              type="checkbox"
                              checked={shiftDraft.isSharedShift}
                              onChange={(e) =>
                                updateShiftDraft(job.id, shiftDraft, {
                                  isSharedShift: e.target.checked,
                                })
                              }
                            />
                            Designated Shared Shift
                          </label>
                          {shiftDraft.isSharedShift && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Min Crew:</span>
                              <Input
                                type="number"
                                min={2}
                                step={1}
                                value={shiftDraft.minSimultaneousCrew}
                                onChange={(e) =>
                                  updateShiftDraft(job.id, shiftDraft, {
                                    minSimultaneousCrew: e.target.value,
                                  })
                                }
                                className="h-8 w-20"
                              />
                            </div>
                          )}
                        </div>

                        <Field
                          label={
                            requiresBreakWindow
                              ? "Break Start (Required)"
                              : "Break Start (Optional)"
                          }
                        >
                          <Input
                            type="datetime-local"
                            value={shiftDraft.breakStart}
                            onChange={(e) =>
                              updateShiftDraft(job.id, shiftDraft, { breakStart: e.target.value })
                            }
                          />
                        </Field>

                        <Field
                          label={
                            requiresBreakWindow ? "Break End (Required)" : "Break End (Optional)"
                          }
                        >
                          <Input
                            type="datetime-local"
                            value={shiftDraft.breakEnd}
                            onChange={(e) =>
                              updateShiftDraft(job.id, shiftDraft, { breakEnd: e.target.value })
                            }
                          />
                        </Field>

                        <Field label="Task Instructions">
                          <Input
                            value={shiftDraft.instructions}
                            onChange={(e) =>
                              updateShiftDraft(job.id, shiftDraft, {
                                instructions: e.target.value,
                              })
                            }
                            placeholder="Build duties for this shift…"
                          />
                        </Field>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card p-3 text-xs">
                        <div className="space-y-0.5">
                          {shiftCalcPreview.ok ? (
                            <div className="font-semibold text-foreground">
                              Planned Productive Hours per Worker:{" "}
                              {shiftCalcPreview.plannedProductiveHours}h
                              {shiftCalcPreview.isOvernight ? " (Overnight Manila shift)" : ""}
                            </div>
                          ) : (
                            <div className="font-medium text-danger">{shiftCalcPreview.error}</div>
                          )}
                          {sharedPreviewCoverage && !sharedPreviewCoverage.ok && (
                            <div className="font-medium text-danger">
                              Shared-shift coverage warning: requires{" "}
                              {sharedPreviewCoverage.requiredCrew} active workers simultaneously,
                              but drops to {sharedPreviewCoverage.minActiveWorkers} during{" "}
                              {sharedPreviewCoverage.uncoveredIntervals
                                .map((u) => `${u.startDateTime}–${u.endDateTime}`)
                                .join(", ")}
                              .
                            </div>
                          )}
                          {sharedPreviewCoverage && sharedPreviewCoverage.ok && (
                            <div className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Shared-shift simultaneous coverage check passed (min{" "}
                              {sharedPreviewCoverage.minActiveWorkers} active throughout).
                            </div>
                          )}
                        </div>

                        <Button
                          type="button"
                          icon={CalendarClock}
                          onClick={() => {
                            if (shiftDraft.selectedWorkers.length === 0) {
                              notify("Select at least one participant from the event roster.")
                              return
                            }
                            let scheduledCount = 0
                            for (const workerEmail of shiftDraft.selectedWorkers) {
                              const matched = activeRoster.find(
                                (r) => r.crewEmail.toLowerCase() === workerEmail.toLowerCase(),
                              )
                              const res = scheduleWorkerShift(actor, {
                                eventId: job.eventId,
                                jobId: job.id,
                                crewEmail: workerEmail,
                                crewName: matched?.crewName || workerEmail,
                                role:
                                  job.productionLeadEmail?.toLowerCase() ===
                                    workerEmail.toLowerCase()
                                    ? "working-lead"
                                    : "crew",
                                activityType: shiftDraft.activityType,
                                startDateTime: shiftDraft.startDateTime,
                                endDateTime: shiftDraft.endDateTime,
                                breakMinutes:
                                  shiftDraft.breakStart && shiftDraft.breakEnd
                                    ? undefined
                                    : Number(shiftDraft.breakMinutes) || 0,
                                breakStartDateTime: shiftDraft.breakStart || undefined,
                                breakEndDateTime: shiftDraft.breakEnd || undefined,
                                isSharedShift: shiftDraft.isSharedShift,
                                sharedShiftGroupId: shiftDraft.isSharedShift
                                  ? shiftDraft.sharedGroupId || `grp-${job.id.slice(-4)}`
                                  : undefined,
                                requiredSimultaneousCrew: shiftDraft.isSharedShift
                                  ? Math.max(2, Number(shiftDraft.minSimultaneousCrew) || 2)
                                  : undefined,
                                instructions: shiftDraft.instructions || undefined,
                              })
                              if (!res.ok) {
                                notifyMutationResult(notify, res, "")
                                return
                              }
                              scheduledCount += 1
                            }
                            notifyMutationResult(
                              notify,
                              { ok: true },
                              `Scheduled ${scheduledCount} participant shift(s) for ${job.spec.name}.`,
                            )
                            updateShiftDraft(job.id, shiftDraft, { instructions: "" })
                          }}
                        >
                          Schedule Selected Participant(s)
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Job Shifts History */}
                  {jobSchedules.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-line uppercase tracking-wider text-muted-foreground">
                            <th className="py-2 pr-3">Worker</th>
                            <th className="py-2 pr-3">Activity</th>
                            <th className="py-2 pr-3">Asia/Manila Window</th>
                            <th className="py-2 pr-3">Break</th>
                            <th className="py-2 pr-3">Hours</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {jobSchedules.map((s) => (
                            <tr key={s.id}>
                              <td className="py-2 pr-3 font-semibold text-foreground">
                                {s.crewName || s.crewEmail}
                              </td>
                              <td className="py-2 pr-3">
                                <Badge tone="neutral">{s.activityType}</Badge>
                                {s.isSharedShift && (
                                  <span className="ml-1 text-[11px] text-muted-foreground">
                                    (Shared min {s.requiredSimultaneousCrew ?? 2})
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-3 font-mono">
                                {s.startDateTime.replace("T", " ")} →{" "}
                                {s.endDateTime.replace("T", " ")}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {s.breakStartDateTime && s.breakEndDateTime
                                  ? `${s.breakStartDateTime.slice(11)}–${s.breakEndDateTime.slice(11)} (${s.breakMinutes}m)`
                                  : `${s.breakMinutes}m`}
                              </td>
                              <td className="py-2 pr-3 font-semibold tabular-nums">
                                {s.plannedProductiveHours}h
                              </td>
                              <td className="py-2 pr-3">
                                <Badge tone={s.status === "cancelled" ? "danger" : "success"}>
                                  {s.status}
                                </Badge>
                              </td>
                              <td className="py-2 text-right">
                                {s.status === "scheduled" && (
                                  <div className="inline-flex items-center gap-1.5">
                                    <Input
                                      value={cancelReasonByShiftId[s.id] ?? ""}
                                      onChange={(e) =>
                                        setCancelReasonByShiftId({
                                          ...cancelReasonByShiftId,
                                          [s.id]: e.target.value,
                                        })
                                      }
                                      placeholder="Reason…"
                                      className="h-7 w-28 text-xs"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      icon={XCircle}
                                      onClick={() => {
                                        const res = cancelScheduledShift(actor, {
                                          eventId: job.eventId,
                                          jobId: job.id,
                                          shiftId: s.id,
                                          reason:
                                            (cancelReasonByShiftId[s.id] ?? "").trim() ||
                                            "Cancelled in Production workspace.",
                                        })
                                        notifyMutationResult(
                                          notify,
                                          res,
                                          `Cancelled shift ${s.id} (preserved in history).`,
                                        )
                                      }}
                                      className="h-7 px-2 text-xs"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Progress, Worker Contributions, Daily Group Reports, Photos & Independent Worker Completion */}
                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        5. Worker Progress, Daily Reports, Photos &amp; Independent Completion
                      </div>
                      <p className="text-muted-foreground">
                        Warehouse confirms checked worker assignments Completed (Submitted →
                        Completed) independently of full asset verification approval.
                      </p>
                    </div>
                    <Badge tone="neutral">
                      {(job.assignments ?? []).length} Assignment(s) ·{" "}
                      {(job.contributions ?? []).length} Contribution Log(s)
                    </Badge>
                  </div>

                  {/* Individual Worker Assignments & Independent Completion */}
                  {(job.assignments ?? []).length > 0 && (
                    <div className="space-y-2.5">
                      {(job.assignments ?? []).map((asg) => {
                        const logs = (job.contributions ?? []).filter(
                          (c) => c.assignmentId === asg.id,
                        )
                        const actualHrs =
                          Math.round(
                            logs.reduce((sum, l) => sum + l.actualProductiveHours, 0) * 100,
                          ) / 100
                        return (
                          <div
                            key={asg.id}
                            className="rounded-lg border border-line bg-card p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-foreground">
                                    {asg.crewName}
                                  </span>
                                  <span className="text-muted-foreground">({asg.crewEmail})</span>
                                  <Badge
                                    tone={
                                      asg.status === "Completed"
                                        ? "success"
                                        : asg.status === "Submitted"
                                          ? "info"
                                          : "warning"
                                    }
                                  >
                                    {asg.status}
                                  </Badge>
                                  {asg.isCorrectionAssignment && (
                                    <Badge tone="danger">Correction Assignment</Badge>
                                  )}
                                  {asg.blockerReason && (
                                    <Badge tone="danger">Blocker: {asg.blockerReason}</Badge>
                                  )}
                                </div>
                                <div className="mt-0.5 text-muted-foreground">
                                  Instructions: {asg.instructions} · Logged Actual Hours:{" "}
                                  <strong className="text-foreground">{actualHrs}h</strong>
                                </div>
                              </div>
                              {asg.status === "Completed" ? (
                                <Badge tone="success">
                                  Completed ({asg.completedByName || "Warehouse"})
                                </Badge>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  icon={CheckCircle2}
                                  onClick={() => {
                                    const res = confirmWorkerAssignmentCompletion(actor, {
                                      eventId: job.eventId,
                                      jobId: job.id,
                                      assignmentId: asg.id,
                                    })
                                    notifyMutationResult(
                                      notify,
                                      res,
                                      `Confirmed ${asg.crewName}'s assignment Completed independently.`,
                                    )
                                  }}
                                  className="h-7 px-2.5 text-xs"
                                >
                                  Confirm Worker Assignment Completed
                                </Button>
                              )}
                            </div>
                            {logs.length > 0 && (
                              <div className="grid gap-2 sm:grid-cols-2 border-t border-line pt-2">
                                {logs.map((l) => (
                                  <div
                                    key={l.id}
                                    className="rounded border border-line bg-fg/[0.02] p-2"
                                  >
                                    <div className="font-semibold text-foreground">
                                      {l.manilaDate} · {l.attendance} · {l.actualProductiveHours}h
                                    </div>
                                    <div className="text-muted-foreground">
                                      “{l.contributionSummary}”
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Daily Group Progress Reports & After-Shift Photos */}
                  {(job.groupProgressReports?.length ?? 0) > 0 && (
                    <div className="space-y-1.5 border-t border-line pt-3">
                      <div className="font-semibold text-foreground">
                        Daily Group Progress Reports ({job.groupProgressReports!.length})
                      </div>
                      {job.groupProgressReports!.map((r) => (
                        <div key={r.id} className="rounded-lg border border-line bg-card p-2.5">
                          <span className="font-semibold text-foreground">{r.manilaDate}</span> by{" "}
                          {r.submittedByLeadName} ({fmtStamp(r.submittedAt)}): “{r.summary}”
                        </div>
                      ))}
                    </div>
                  )}

                  {linkedPhotos.length > 0 && (
                    <div className="space-y-2 border-t border-line pt-3">
                      <div className="font-semibold text-foreground">
                        Linked Daily Shift Photos ({linkedPhotos.length})
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {linkedPhotos.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-start gap-2.5 rounded-lg border border-line bg-card p-2.5"
                          >
                            <Visual
                              src={p.photoUrl}
                              label={p.caption}
                              className="size-12 shrink-0 rounded-md"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 font-semibold text-foreground">
                                <span>{p.shiftLabel}</span>
                                {p.isLegacyImportedEvidence && (
                                  <Badge tone="warning">Legacy Evidence</Badge>
                                )}
                              </div>
                              <div className="text-muted-foreground">“{p.caption}”</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(job.correctionRequests?.length ?? 0) > 0 && (
                    <div className="space-y-1.5 border-t border-line pt-3">
                      <div className="font-semibold text-danger">
                        Correction Requests History ({job.correctionRequests!.length})
                      </div>
                      {job.correctionRequests!.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-foreground"
                        >
                          <div className="font-semibold">
                            Round {c.round} ({c.resolvedAt ? "Resubmitted" : "Open"}) — Requested by{" "}
                            {c.requestedByName}
                          </div>
                          <div>“{c.explanation}”</div>
                          <div className="text-muted-foreground">
                            Responsible Crew: {c.responsibleCrewEmails.join(", ") || "Unassigned"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )
          })()}
      </Modal>
    </div>
  )
}
