import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Hammer,
  MapPin,
  PackageCheck,
  Search,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react"
import { Badge, Button, Card, Field, Input, PageHeader, cx } from "../../../components/ui/ui"
import {
  FALLBACK_COVER,
  Visual,
  fmtStamp,
  pitchCover,
  registeredPitchTheme,
  TabBar,
  textareaCls,
  themeByName,
} from "../../event-manager/shared"
import { newBrief, type Brief, type Pin } from "../../event-manager/model"
import MoodBoardCanvas from "../../event-manager/mood-board/MoodBoardCanvas"
import { resolveOrderMoodBoardId } from "../../event-manager/mood-board/board-comments"
import {
  allocateAllStockForEvent,
  allocateStockForOrderLine,
  calculateGuestBasedEventStaffing,
  calculateJobEstimatedLaborHours,
  closeWarehouseEventAccountability,
  computeWarehouseOverviewData,
  confirmOutboundDeparture,
  createAcquisitionOrder,
  getEventManifestLines,
  recordRentalSupplierAcceptance,
  resolveFieldIncidentReport,
  resolveRentalDiscrepancy,
  saveRentalELetterAndBookingRef,
  setOperationsNavigationContext,
  useOperationsStore,
  setWarehouseSelectedEventId,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../../operations/store"
import type {
  IssueResolutionType,
  RentalSupplierAcceptance,
  WarehouseOrderRequest,
} from "../../../operations/types"
import { useNotify, RESOLUTION_OPTIONS } from "../warehouse-shared"
import CustomFabricationModule from "./CustomFabricationModule"
import DamageMissingReportsModule from "./DamageMissingReportsModule"
import DispatchReturnsModule from "./DispatchReturnsModule"
import PersonnelDeploymentModule from "./PersonnelDeploymentModule"

const EVENT_MANAGER_STORAGE_PREFIX = "lumiere-event-manager-preview-v1:"

function resolveApprovedOrderMoodBoardBrief(order?: WarehouseOrderRequest): Brief | null {
  if (!order) return null
  const targetProjectId = order.projectId?.trim() || order.eventId

  if (typeof window !== "undefined" && targetProjectId) {
    try {
      const candidateKeys: string[] = []
      const preferredEmail = order.approvedByEmail?.trim().toLowerCase()
      if (preferredEmail) {
        candidateKeys.push(`${EVENT_MANAGER_STORAGE_PREFIX}${preferredEmail}`)
      }
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith(EVENT_MANAGER_STORAGE_PREFIX) && !candidateKeys.includes(k)) {
          candidateKeys.push(k)
        }
      }
      for (const key of candidateKeys) {
        const raw = window.localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw) as Array<{
          project?: { id?: string; status?: string; brief?: Brief }
        }>
        if (!Array.isArray(parsed)) continue
        const match = parsed.find(
          (entry) =>
            entry?.project?.id === targetProjectId &&
            entry.project.status === "approved" &&
            entry.project.brief,
        )
        const emBrief = match?.project?.brief
        if (
          emBrief &&
          (emBrief.pins.length > 0 || (emBrief.boardPages?.length ?? 0) > 0)
        ) {
          return emBrief
        }
      }
    } catch {
      // Fall back to the order snapshot if Event Manager storage is unreadable.
    }
  }

  const orderPins = order.moodBoardPins ?? []
  const orderPages = order.moodBoardPages ?? []
  if (orderPins.length === 0 && orderPages.length === 0) {
    return null
  }

  return {
    ...newBrief(order.eventId),
    title: order.eventTitle,
    client: order.clientName,
    clientEmail: order.clientEmail ?? "",
    start: order.startDateTime,
    end: order.endDateTime,
    venue: order.venue,
    pax: order.pax,
    theme: order.theme,
    notes: order.moodBoardNotes ?? "",
    pins: orderPins.map((p) => ({
      id: p.id,
      title: p.title,
      image: p.image,
      text: p.text,
      page: p.page,
      x: p.x,
      y: p.y,
      width: p.width,
      rotation: p.rotation,
    })) as Pin[],
    ...(orderPages.length > 0 ? { boardPages: orderPages } : {}),
  }
}

type EventWorkspaceTab =
  | "overview"
  | "mood-board"
  | "assets"
  | "crew"
  | "production"
  | "verification"
  | "dispatch"
  | "damage"

function resolveEventCover(order: WarehouseOrderRequest): {
  src: string
  alt: string
} {
  const brief = resolveApprovedOrderMoodBoardBrief(order)
  if (brief) {
    return {
      src: pitchCover(brief),
      alt: `${order.eventTitle || "Event"} cover image`,
    }
  }
  const themeCover = themeByName(order.theme)?.image
  const pinImage = order.moodBoardPins?.find((p) => p.image)?.image
  return {
    src: themeCover ?? pinImage ?? FALLBACK_COVER,
    alt: `${order.eventTitle || "Event"} cover image`,
  }
}

export default function OrderRequestsModule({
  actor,
  onNavigate,
  initialEventId,
  initialSubTab,
}: {
  actor: OpsActor
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
  initialEventId?: string
  initialSubTab?: "allocation" | "custom" | "rentals" | "reconciliation"
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    if (initialEventId && state.orderRequests.some((o) => o.eventId === initialEventId)) {
      return initialEventId
    }
    return ""
  })
  const [workspaceTab, setWorkspaceTab] = useState<EventWorkspaceTab>(() =>
    initialSubTab ? "assets" : "overview",
  )
  const [embeddedJobId, setEmbeddedJobId] = useState<string | undefined>(undefined)
  const [embeddedDispatchSubView, setEmbeddedDispatchSubView] = useState<
    "dispatch" | "transport" | "returns" | undefined
  >(undefined)
  const [listQuery, setListQuery] = useState("")
  const [listStatusFilter, setListStatusFilter] = useState<string>("All")
  const [subTab, setSubTab] = useState<"allocation" | "custom" | "rentals" | "reconciliation">(
    () => initialSubTab ?? "allocation",
  )

  useEffect(() => {
    if (initialEventId && state.orderRequests.some((o) => o.eventId === initialEventId)) {
      setSelectedEventId(initialEventId)
    } else if (initialEventId === undefined) {
      setSelectedEventId("")
    }
  }, [initialEventId, state.orderRequests])

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab)
      setWorkspaceTab("assets")
    }
  }, [initialSubTab])

  const overviewData = useMemo(() => computeWarehouseOverviewData(state), [state])
  const order = selectedEventId
    ? state.orderRequests.find((o) => o.eventId === selectedEventId)
    : undefined
  const [boardSelectedPinId, setBoardSelectedPinId] = useState<string | null>(null)
  const [boardFullScreen, setBoardFullScreen] = useState(false)
  const approvedBoardBrief = useMemo(
    () => resolveApprovedOrderMoodBoardBrief(order),
    [order],
  )
  const resolvedBoardId = resolveOrderMoodBoardId(order)

  useEffect(() => {
    setBoardSelectedPinId(null)
    setBoardFullScreen(false)
  }, [order?.eventId])

  // Dispatch outbound form state
  const [vehiclePlate, setVehiclePlate] = useState("NGA-4821 (Lumière Box Truck 02)")
  const [driverName, setDriverName] = useState("R. Santos")
  const [departureNotes, setDepartureNotes] = useState("")

  // Rental E-Letter & Confirmation state
  const [activeRentalId, setActiveRentalId] = useState<string>("")
  const [bookingRefInput, setBookingRefInput] = useState("")
  const [deliveryLocInput, setDeliveryLocInput] = useState("")
  const [deliveryArrInput, setDeliveryArrInput] = useState("")
  const [returnArrInput, setReturnArrInput] = useState("")
  const [directToVenueInput, setDirectToVenueInput] = useState(true)
  const [acceptanceType, setAcceptanceType] =
    useState<RentalSupplierAcceptance["evidenceType"]>("Accepted E-Letter")
  const [acceptanceRef, setAcceptanceRef] = useState("")
  const [acceptanceNotes, setAcceptanceNotes] = useState("")

  // Closeout state
  const [closeoutNotes, setCloseoutNotes] = useState("")
  const [inlineResolutions, setInlineResolutions] = useState<
    Record<string, { type: IssueResolutionType; notes: string }>
  >({})

  if (state.orderRequests.length === 0) {
    return (
      <div>
        <PageHeader
          crumbs={["Dashboard", "Events"]}
          title="Events"
          subtitle="Approve an event in Event Manager to publish its Warehouse event workspace here."
        />
        <Card className="p-8 text-center text-muted-foreground">
          No approved event Order Requests have been published yet.
        </Card>
      </div>
    )
  }

  // ── VIEW A: EVENT LIST GRID (3 cols desktop, 2 tablet, 1 mobile) ──
  if (!order) {
    const statusOptions = [
      "All",
      ...Array.from(
        new Set(overviewData.eventSummaries.map((s) => s.readiness.statusLabel)),
      ),
    ]
    const q = listQuery.trim().toLowerCase()
    const filteredEvents = state.orderRequests.filter((item) => {
      const summary = overviewData.eventSummaries.find(
        (s) => s.eventId === item.eventId,
      )
      const statusLabel = summary?.readiness.statusLabel ?? "Configuration pending"
      if (listStatusFilter !== "All" && statusLabel !== listStatusFilter) {
        return false
      }
      if (!q) return true
      const leadLabel = summary?.teamLeadSummary.displayLabel ?? ""
      return `${item.id} ${item.eventTitle} ${item.clientName} ${item.venue} ${leadLabel}`
        .toLowerCase()
        .includes(q)
    })

    return (
      <div className="space-y-5">
        <PageHeader
          crumbs={["Dashboard", "Events"]}
          title="Events"
          subtitle="Browse approved events, monitor Warehouse readiness, and open an event workspace."
          actions={
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Search event, order ID, client, venue..."
                aria-label="Search events"
                className="pl-9"
              />
            </div>
          }
        />

        {/* Derived Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter events by status">
          {statusOptions.map((opt) => {
            const count =
              opt === "All"
                ? state.orderRequests.length
                : state.orderRequests.filter((o) => {
                  const s = overviewData.eventSummaries.find(
                    (x) => x.eventId === o.eventId,
                  )
                  return (s?.readiness.statusLabel ?? "Configuration pending") === opt
                }).length
            const active = listStatusFilter === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setListStatusFilter(opt)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-line bg-card text-muted-foreground hover:bg-fg/[0.04] hover:text-foreground",
                )}
              >
                <span>{opt}</span>
                <span className="tabular-nums opacity-75">({count})</span>
              </button>
            )
          })}
        </div>

        {filteredEvents.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-foreground">
              No matching events found
            </p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search or status filter.
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setListQuery("")
                  setListStatusFilter("All")
                }}
              >
                Clear filters
              </Button>
            </div>
          </Card>
        ) : (
          <div className="dashboard-surfaces grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredEvents.map((item) => {
              const summary = overviewData.eventSummaries.find(
                (s) => s.eventId === item.eventId,
              )
              const statusLabel = summary?.readiness.statusLabel ?? "Configuration pending"
              const statusTone = summary?.readiness.tone ?? "warning"
              const readyJobs = summary?.readiness.readyToLoadJobs ?? 0
              const totalJobs = summary?.readiness.totalJobs ?? 0
              const progressPct =
                totalJobs > 0
                  ? Math.min(100, Math.round((readyJobs / totalJobs) * 100))
                  : 0
              const cover = resolveEventCover(item)

              return (
                <Card
                  key={item.id}
                  className="dashboard-welcome min-w-0 overflow-hidden transition-colors hover:border-fg/30"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventId(item.eventId)
                      setWorkspaceTab("overview")
                      setOperationsNavigationContext({ eventId: item.eventId }, { merge: true })
                    }}
                    className="flex h-full w-full cursor-pointer flex-col justify-between gap-3.5 p-2 pb-4 text-left"
                  >
                    <div className="space-y-3">
                      <div className="relative aspect-[412/250] w-full overflow-hidden rounded-lg bg-fg/[0.04]">
                        <Visual
                          src={cover.src}
                          fallbackSrc={FALLBACK_COVER}
                          label={cover.alt}
                          className="size-full object-cover object-center"
                        />
                        <div className="absolute right-2.5 top-2.5 rounded-full bg-card/90 backdrop-blur-sm">
                          <Badge tone={statusTone}>{statusLabel}</Badge>
                        </div>
                      </div>

                      <div className="space-y-1.5 px-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {fmtStamp(item.startDateTime)}
                          </span>
                        </div>
                        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
                          {item.eventTitle}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {item.venue || "Not configured"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-line px-2 pt-3 text-xs">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            Custom builds ready
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-foreground">
                            {readyJobs}/{totalJobs}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-fg/10">
                          <div
                            className={cx(
                              "h-full rounded-full transition-[width] duration-300",
                              totalJobs > 0 && readyJobs === totalJobs
                                ? "bg-success"
                                : "bg-foreground/70",
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="truncate font-mono text-muted-foreground">
                          {item.id}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-foreground">
                          Open workspace
                          <ArrowRight className="size-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </button>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const manifestLines = getEventManifestLines(state, order.eventId)
  const shortfalls = manifestLines.filter((l) => l.loadedQty < l.plannedQty)
  const eventIncidents = state.incidentReports.filter((r) => r.eventId === order.eventId)
  const eventFabJobs = state.fabricationJobs.filter((j) => j.eventId === order.eventId)
  const eventDeficits = state.deficitQueue.filter((d) => d.eventId === order.eventId)
  const guestStaffing = calculateGuestBasedEventStaffing(order.pax)
  const activeRoster = (order.eventRoster ?? []).filter((r) => !r.removedAt)
  const explicitLeadLabel =
    order.teamLeadEmail && order.teamLeadExplicitlySelected !== false
      ? `${order.teamLeadName || order.teamLeadEmail} (${order.teamLeadEmail})`
      : order.teamLeadEmail
        ? `${order.teamLeadName || order.teamLeadEmail} (Needs confirmation)`
        : "Not selected"

  const openRentalEditor = (rentalId: string) => {
    const r = order.rentals.find((x) => x.id === rentalId)
    if (!r) return
    setActiveRentalId(rentalId)
    setBookingRefInput(r.bookingReference || "")
    setDeliveryLocInput(r.eLetter?.deliveryLocation || `Direct-to-Venue — ${order.venue}`)
    setDeliveryArrInput(
      r.eLetter?.deliveryArrangements ||
      `Supplier delivers directly to ${order.venue} before ingress; Ground Crew Team Lead verifies receipt at Venue Arrival.`,
    )
    setReturnArrInput(
      r.eLetter?.returnArrangements ||
      "Supplier pickup at venue post-event strike; Team Lead verifies handback count and condition.",
    )
    setDirectToVenueInput(r.directToVenue ?? true)
    setAcceptanceRef(r.supplierAcceptance?.referenceOrUrl || `ACK-${r.bookingReference || "2026-01"}`)
    setAcceptanceNotes(
      r.supplierAcceptance?.notes ||
      "Supplier signed and returned the rental e-letter confirming items, quantities, and direct-to-venue schedule.",
    )
  }

  const eventSummary = overviewData.eventSummaries.find(
    (s) => s.eventId === order.eventId,
  )
  const totalRequestedUnits = order.stockLines.reduce(
    (s, l) => s + l.approvedRequestedQty,
    0,
  )
  const totalAllocatedUnits = order.stockLines.reduce(
    (s, l) => s + l.allocatedQty,
    0,
  )
  const totalPlannedManifest = manifestLines.reduce(
    (s, l) => s + l.plannedQty,
    0,
  )
  const totalLoadedManifest = manifestLines.reduce(
    (s, l) => s + l.loadedQty,
    0,
  )
  const openEventDeficits = eventDeficits.filter((d) => d.status !== "Fulfilled")
  const openEventIncidents = eventIncidents.filter(
    (i) => i.resolutionStatus !== "Resolved",
  )

  const workspaceTabs: { key: EventWorkspaceTab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "mood-board", label: "Mood Board", count: order.moodBoardPins?.length ?? 0 },
    {
      key: "assets",
      label: "Assets",
      count: order.stockLines.length + order.customSpecs.length + order.rentals.length,
    },
    { key: "crew", label: "Crew & Scheduling", count: activeRoster.length },
    { key: "production", label: "Production", count: eventFabJobs.length },
    {
      key: "verification",
      label: "Verification",
      count: eventFabJobs.filter((j) => j.status === "Awaiting Verification").length,
    },
    { key: "dispatch", label: "Dispatch & Returns", count: manifestLines.length },
    { key: "damage", label: "Damage & Missing", count: openEventIncidents.length },
  ]

  const handleEmbeddedNavigate = (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => {
    const navCtx = typeof ctx === "string" ? { eventId: ctx } : ctx
    if (navCtx?.jobId !== undefined) {
      setEmbeddedJobId(navCtx.jobId)
    }
    switch (route) {
      case "module-crew-scheduling":
        setWorkspaceTab("crew")
        return
      case "module-production":
        setWorkspaceTab("production")
        return
      case "module-verification":
        setWorkspaceTab("verification")
        return
      case "module-dispatch-returns":
        if (
          navCtx?.subView === "dispatch" ||
          navCtx?.subView === "transport" ||
          navCtx?.subView === "returns"
        ) {
          setEmbeddedDispatchSubView(navCtx.subView)
        }
        setWorkspaceTab("dispatch")
        return
      case "module-damage-missing-reports":
        setWorkspaceTab("damage")
        return
      case "module-events":
        setWorkspaceTab("assets")
        setSubTab("allocation")
        return
      default:
        onNavigate(route, ctx)
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* ── VIEW B: EVENT WORKSPACE HEADER ── */}
      <div className="dashboard-surfaces">
        <Card className="dashboard-welcome relative overflow-hidden p-4 sm:p-5 space-y-4">
          <div className="dashboard-surfaces">
            <Card className="dashboard-welcome relative overflow-hidden p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedEventId("")
                  setActiveRentalId("")
                  setWarehouseSelectedEventId("")
                  setOperationsNavigationContext({ eventId: undefined }, { merge: true })
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                <span>Back to Events</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
                <Badge tone={eventSummary?.readiness.tone ?? "warning"}>
                  {eventSummary?.readiness.statusLabel ?? "Configuration pending"}
                </Badge>
                <Badge tone="info">Theme: {order.theme}</Badge>
                {openEventDeficits.length > 0 && (
                  <>
                    <Badge tone="danger">
                      {openEventDeficits.length} shortage{openEventDeficits.length === 1 ? "" : "s"}
                    </Badge>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate("module-replenishment-deficits", {
                          eventId: order.eventId,
                          subView: "deficits",
                        })
                      }
                      className="text-xs font-semibold text-accent underline underline-offset-2 hover:opacity-80"
                    >
                      View shortages
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="min-w-0 space-y-1">
              <h2 className="break-words text-2xl font-semibold tracking-tight text-foreground">
                {order.eventTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 break-words text-xs text-muted-foreground">
                <span>
                  Client: <strong className="text-foreground">{order.clientName || "Not configured"}</strong>
                </span>
                <span>
                  Venue: <strong className="text-foreground">{order.venue || "Not configured"}</strong>
                </span>
                <span>
                  Date: <strong className="text-foreground">{fmtStamp(order.startDateTime)} – {fmtStamp(order.endDateTime)}</strong>
                </span>
                <span>
                  Team Lead: <strong className="text-foreground">{explicitLeadLabel}</strong>
                </span>
                <span>
                  Approved by <strong className="text-foreground">{order.approvedByName}</strong> (Rev {order.revisionAtApproval})
                </span>
              </div>
            </div>

            {/* Event-Specific Tabs */}
            <div
              className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-line pt-3"
              role="tablist"
              aria-label="Event workspace sections"
            >
              {workspaceTabs.map((t) => {
                const active = workspaceTab === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setWorkspaceTab(t.key)}
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-line bg-card text-muted-foreground hover:bg-fg/[0.04] hover:text-foreground",
                    )}
                  >
                    <span>{t.label}</span>
                    {t.count !== undefined && (
                      <span className="tabular-nums opacity-75">({t.count})</span>
                    )}
                  </button>
                )
              })}
            </div>
            </Card>
          </div>
        </Card>
      </div>

      {/* TAB 1: EVENT OVERVIEW */}
      {workspaceTab === "overview" && (
        <div className="space-y-4">
          <div className="dashboard-surfaces grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="dashboard-welcome relative overflow-hidden p-4 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Asset Fulfillment
              </div>
              <div className="text-xl font-bold tabular-nums text-foreground">
                {order.stockLines.length > 0
                  ? `${totalAllocatedUnits} / ${totalRequestedUnits} units`
                  : "Not configured"}
              </div>
              <p className="text-xs text-muted-foreground">
                {openEventDeficits.length > 0
                  ? `${openEventDeficits.length} open stock deficit(s)`
                  : "No open stock deficits"}
              </p>
              <button
                type="button"
                onClick={() => setWorkspaceTab("assets")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
              >
                <span>View Assets</span>
                <ArrowRight className="size-3" aria-hidden="true" />
              </button>
            </Card>

            <Card className="dashboard-welcome relative overflow-hidden p-4 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Crew &amp; Schedule Readiness
              </div>
              <div className="text-xl font-bold text-foreground">
                {activeRoster.length > 0
                  ? `${activeRoster.length} on roster`
                  : "Not configured"}
              </div>
              <p className="text-xs text-muted-foreground">
                Capacity: {eventSummary?.scheduledCapacitySummary.displayLabel ?? "Not configured"}
              </p>
              <button
                type="button"
                onClick={() => setWorkspaceTab("crew")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
              >
                <span>Open Crew &amp; Scheduling</span>
                <ArrowRight className="size-3" aria-hidden="true" />
              </button>
            </Card>

            <Card className="dashboard-welcome relative overflow-hidden p-4 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Production Progress
              </div>
              <div className="text-xl font-bold tabular-nums text-foreground">
                {eventFabJobs.length > 0
                  ? `${eventSummary?.readiness.readyToLoadJobs ?? 0} / ${eventFabJobs.length} Ready`
                  : "No custom builds"}
              </div>
              <p className="text-xs text-muted-foreground">
                {eventSummary?.readiness.awaitingVerificationJobs
                  ? `${eventSummary.readiness.awaitingVerificationJobs} awaiting verification`
                  : `Guest staffing rec: ${guestStaffing.rangeLabel}`}
              </p>
              <button
                type="button"
                onClick={() =>
                  setWorkspaceTab(
                    (eventSummary?.readiness.awaitingVerificationJobs ?? 0) > 0
                      ? "verification"
                      : "production",
                  )
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
              >
                <span>
                  {(eventSummary?.readiness.awaitingVerificationJobs ?? 0) > 0
                    ? "Open Verification"
                    : "Open Production"}
                </span>
                <ArrowRight className="size-3" aria-hidden="true" />
              </button>
            </Card>

            <Card className="dashboard-welcome relative overflow-hidden p-4 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dispatch &amp; Deficits
              </div>
              <div className="text-xl font-bold tabular-nums text-foreground">
                {manifestLines.length > 0
                  ? `${totalLoadedManifest} / ${totalPlannedManifest} loaded`
                  : "Not configured"}
              </div>
              <p className="text-xs text-muted-foreground">
                {order.warehouseClosed
                  ? "Warehouse closed"
                  : order.outboundDeparture
                    ? "Dispatched"
                    : "Pre-departure"}
                {openEventIncidents.length > 0
                  ? ` · ${openEventIncidents.length} open report(s)`
                  : ""}
              </p>
              <button
                type="button"
                onClick={() => setWorkspaceTab("dispatch")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
              >
                <span>Open Dispatch &amp; Returns</span>
                <ArrowRight className="size-3" aria-hidden="true" />
              </button>
            </Card>
          </div>

          <div className="dashboard-surfaces">
            <Card className="dashboard-welcome relative overflow-hidden p-5 space-y-2 text-xs">
              <div className="font-semibold text-foreground">Client Approval Record (Read-Only)</div>
              <p className="text-muted-foreground">“{order.approvalNote}”</p>
              {eventSummary && eventSummary.readiness.unmetRequirements.length > 0 && (
                <div className="pt-1 text-amber-600 dark:text-amber-400">
                  Unmet requirements: {eventSummary.readiness.unmetRequirements.join(" · ")}
                </div>
              )}
            </Card>
          </div>
        </div>
      )
    }

          {/* TAB 2: MOOD BOARD (Read-Only) */}
          {workspaceTab === "mood-board" && (
            approvedBoardBrief ? (
              <div className="em-canvas-wrap min-w-0">
                <MoodBoardCanvas
                  key={`${order.eventId}:${resolvedBoardId ?? ""}`}
                  boardId={resolvedBoardId}
                  brief={approvedBoardBrief}
                  update={() => { }}
                  readOnly
                  selected={boardSelectedPinId}
                  onSelect={setBoardSelectedPinId}
                  onDropItem={() => { }}
                  shelf={[]}
                  onAddShelf={() => { }}
                  fullScreen={boardFullScreen}
                  onPresent={() => setBoardFullScreen(true)}
                  onExitFullScreen={() => setBoardFullScreen(false)}
                  palette={registeredPitchTheme(approvedBoardBrief)?.palette}
                  themeName={themeByName(approvedBoardBrief.theme)?.name}
                />
              </div>
            ) : (
              <Card className="p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  No approved mood board available for this event
                </p>
                <p className="text-xs text-muted-foreground">
                  The Event Manager has not attached an approved mood board to {order.eventTitle} yet.
                </p>
              </Card>
            )
          )}

          {/* TAB 4: CREW & SCHEDULING */}
          {
            workspaceTab === "crew" && (
              <PersonnelDeploymentModule
                actor={actor}
                initialEventId={order.eventId}
                initialJobId={embeddedJobId}
                embedded
                onNavigate={handleEmbeddedNavigate}
              />
            )
          }

          {/* TAB 5: PRODUCTION */}
          {
            workspaceTab === "production" && (
              <CustomFabricationModule
                actor={actor}
                mode="production"
                initialEventId={order.eventId}
                initialJobId={embeddedJobId}
                embedded
                onNavigate={handleEmbeddedNavigate}
              />
            )
          }

          {/* TAB 6: VERIFICATION */}
          {
            workspaceTab === "verification" && (
              <CustomFabricationModule
                actor={actor}
                mode="verification"
                initialEventId={order.eventId}
                initialJobId={embeddedJobId}
                embedded
                onNavigate={handleEmbeddedNavigate}
              />
            )
          }

          {/* TAB 7: DISPATCH & RETURNS */}
          {
            workspaceTab === "dispatch" && (
              <DispatchReturnsModule
                actor={actor}
                initialEventId={order.eventId}
                initialSubView={embeddedDispatchSubView}
                embedded
                onNavigate={handleEmbeddedNavigate}
              />
            )
          }

          {/* TAB 8: DAMAGE & MISSING */}
          {
            workspaceTab === "damage" && (
              <DamageMissingReportsModule
                actor={actor}
                initialEventId={order.eventId}
                embedded
                onNavigate={handleEmbeddedNavigate}
              />
            )
          }

          {/* TAB 3: ASSETS (Stock Allocation, Custom Assets, Rentals, Closeout) */}
          {
            workspaceTab === "assets" && (
              <div className="space-y-6">
                <Card className="p-4 sm:p-5">
                  <TabBar
                    label="Events fulfillment subviews"
                    idPrefix="wh-order"
                    value={subTab}
                    onChange={setSubTab}
                    tabs={[
                      {
                        key: "allocation",
                        label: "Approved Stock & Event Deficits",
                        count: order.stockLines.filter((s) => s.category !== "Custom Fabrication").length + eventDeficits.filter((d) => d.status !== "Fulfilled").length,
                      },
                      {
                        key: "custom",
                        label: "Approved Custom Assets",
                        count: Math.max(order.customSpecs.length, eventFabJobs.length),
                      },
                      {
                        key: "rentals",
                        label: "External Rentals",
                        count: order.rentals.length,
                      },
                      {
                        key: "reconciliation",
                        label: "Returns & Closeout",
                        count: eventIncidents.filter((i) => i.resolutionStatus !== "Resolved").length,
                      },
                    ]}
                  />
                </Card>

                {/* SUBTAB 1: STOCK ALLOCATION & DISPATCH MANIFEST */}
                {subTab === "allocation" && (
                  <div className="space-y-6">
                    <Card className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Asset plan
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Approved requested quantities, Warehouse allocated quantities, and Ground Crew
                            actual loaded quantities are tracked distinctly. Shortages automatically sync to
                            Deficit Queue.
                          </p>
                        </div>
                        {!order.warehouseClosed && (
                          <Button
                            type="button"
                            icon={PackageCheck}
                            onClick={() => {
                              const res = allocateAllStockForEvent(order.eventId)
                              notify(
                                `Allocated stock across ${res.allocatedLines} lines (${res.deficitsCreated} shortage entries queued) and prepared dispatch manifest.`,
                              )
                            }}
                          >
                            Allocate All Available Stock & Prepare Manifest
                          </Button>
                        )}
                      </div>

                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                              <th className="py-3 pr-4">Asset</th>
                              <th className="py-3 pr-4">Whse Available</th>
                              <th className="py-3 pr-4">Approved Requested</th>
                              <th className="py-3 pr-4">Allocated Qty</th>
                              <th className="py-3 pr-4">Actual Loaded Qty</th>
                              <th className="py-3 pr-4">Returned Qty</th>
                              <th className="py-3 text-right">Allocation Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {order.stockLines.map((line) => {
                              const inv = state.inventory.find((i) => i.assetId === line.assetId)
                              const isCustom = line.category === "Custom Fabrication"
                              return (
                                <tr key={line.assetId}>
                                  <td className="py-3.5 pr-4">
                                    <div className="flex items-center gap-3">
                                      <Visual
                                        src={line.image}
                                        label={line.name}
                                        className="size-10 shrink-0 rounded-md"
                                      />
                                      <div>
                                        <div className="font-semibold text-foreground">{line.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {line.assetCode} · {line.category}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3.5 pr-4 tabular-nums text-xs">
                                    {isCustom ? (
                                      <Badge tone="info">Ready to Load (Custom)</Badge>
                                    ) : inv ? (
                                      <span>
                                        <strong>{inv.availableStock}</strong> free / {inv.totalStock} total
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="py-3.5 pr-4 font-semibold tabular-nums">
                                    {line.approvedRequestedQty} {line.unit}
                                  </td>
                                  <td className="py-3.5 pr-4 tabular-nums">
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={line.approvedRequestedQty}
                                        disabled={order.warehouseClosed || isCustom}
                                        value={line.allocatedQty}
                                        onChange={(e) => {
                                          const res = allocateStockForOrderLine(
                                            order.eventId,
                                            line.assetId,
                                            Number(e.target.value),
                                            true,
                                          )
                                          if (!res.ok) notify(res.error)
                                        }}
                                        className="w-20"
                                      />
                                      {line.deficitQty > 0 && (
                                        <Badge tone="danger">Deficit: {line.deficitQty}</Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3.5 pr-4 tabular-nums">
                                    <Badge
                                      tone={
                                        line.loadedQty >= line.allocatedQty && line.allocatedQty > 0
                                          ? "success"
                                          : "warning"
                                      }
                                    >
                                      {line.loadedQty} / {line.allocatedQty} loaded
                                    </Badge>
                                  </td>
                                  <td className="py-3.5 pr-4 tabular-nums text-xs">
                                    {line.returnedQty} / {line.loadedQty} returned
                                  </td>
                                  <td className="py-3.5 text-right">
                                    {!isCustom && !order.warehouseClosed && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                          const res = allocateStockForOrderLine(
                                            order.eventId,
                                            line.assetId,
                                            line.approvedRequestedQty,
                                            true,
                                          )
                                          if (!res.ok) notify(res.error)
                                          else notify(`Allocated ${line.approvedRequestedQty} for ${line.name}.`)
                                        }}
                                      >
                                        Allocate full ({line.approvedRequestedQty})
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    {/* Event Stock Deficits & Shortage Fulfillment inside Approved Stock & Event Deficits */}
                    <Card className="p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Event Stock Deficits ({eventDeficits.filter((d) => d.status !== "Fulfilled").length} open)
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Shortages generated when approved stock requirements exceed available warehouse stock. Fulfill shortages via acquisition or open Acquisitions &amp; Replenishment.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          icon={ShoppingCart}
                          onClick={() =>
                            onNavigate("module-replenishment-deficits", {
                              eventId: order.eventId,
                              subView: "acquisitions",
                            })
                          }
                        >
                          Open Replenishment → Acquisitions
                        </Button>
                      </div>

                      {eventDeficits.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No stock deficits recorded for {order.eventTitle}.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                                <th className="py-2.5 pr-4">Deficit ID</th>
                                <th className="py-2.5 pr-4">Asset</th>
                                <th className="py-2.5 pr-4">Shortage Qty</th>
                                <th className="py-2.5 pr-4">Urgency</th>
                                <th className="py-2.5 pr-4">Status</th>
                                <th className="py-2.5 text-right">Fulfillment Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {eventDeficits.map((d) => (
                                <tr key={d.id}>
                                  <td className="py-3 pr-4 font-mono text-xs">{d.id}</td>
                                  <td className="py-3 pr-4 font-semibold">
                                    {d.assetName}{" "}
                                    <span className="text-xs text-muted-foreground">({d.assetCode})</span>
                                  </td>
                                  <td className="py-3 pr-4 font-bold tabular-nums text-danger">
                                    {d.shortageQty}
                                  </td>
                                  <td className="py-3 pr-4">
                                    <Badge
                                      tone={
                                        d.urgency === "Critical" || d.urgency === "High"
                                          ? "danger"
                                          : "warning"
                                      }
                                    >
                                      {d.urgency}
                                    </Badge>
                                  </td>
                                  <td className="py-3 pr-4">
                                    <Badge tone={d.status === "Fulfilled" ? "success" : "info"}>
                                      {d.status}
                                    </Badge>
                                  </td>
                                  <td className="py-3 text-right">
                                    {d.status !== "Fulfilled" && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                          const res = createAcquisitionOrder({
                                            deficitId: d.id,
                                            eventId: d.eventId,
                                            assetId: d.assetId,
                                            supplierName: "Manila Event Supply Co.",
                                            quantity: d.shortageQty,
                                            unitCost: 1500,
                                            actorName: actor.name,
                                            receiveImmediately: true,
                                          })
                                          if (!res.ok) notify(res.error)
                                          else
                                            notify(
                                              `Acquired ${d.shortageQty} × ${d.assetName}, received into stock, and fulfilled deficit ${d.id}.`,
                                            )
                                        }}
                                      >
                                        Acquire &amp; Fulfill ({d.shortageQty})
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </Card>

                    {/* Custom Fabrication Summary inside Order Request */}
                    <Card className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Approved Custom Assets ({eventFabJobs.length})
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Client-approved custom specifications are read-only. Open the Approved Custom Assets tab or Production to review build progress.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSubTab("custom")}
                          >
                            View Approved Custom Specs
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            icon={Hammer}
                            onClick={() =>
                              onNavigate("module-production", {
                                eventId: order.eventId,
                                subView: "production",
                              })
                            }
                          >
                            Open in Production
                          </Button>
                        </div>
                      </div>
                    </Card>

                    {/* D03 Outbound Dispatch Clearance & Departure Confirmation */}
                    <Card className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Dispatch manifest
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            A shortfall on any planned line blocks departure. The vehicle is cleared to leave
                            only after every planned item is loaded in its full planned quantity and the Team
                            Lead submits the final Loading Checklist.
                          </p>
                        </div>
                        <Badge
                          tone={
                            order.outboundDeparture
                              ? "success"
                              : order.loadingChecklist && shortfalls.length === 0
                                ? "info"
                                : "warning"
                          }
                        >
                          {order.outboundDeparture
                            ? "Outbound Departure Confirmed"
                            : order.loadingChecklist && shortfalls.length === 0
                              ? "Cleared for Departure"
                              : "Blocked — Awaiting Full Load & Team Lead Checklist"}
                        </Badge>
                      </div>

                      {shortfalls.length > 0 && (
                        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger">
                          <div className="font-bold">
                            Departure blocked · {shortfalls.length} items below plan
                          </div>
                          <ul className="mt-1 list-disc pl-5 space-y-0.5">
                            {shortfalls.map((s) => (
                              <li key={s.lineId}>
                                <strong>{s.name}</strong>: Planned {s.plannedQty}, Physically Loaded{" "}
                                {s.loadedQty} (Shortfall of {s.shortfallQty}). Load remaining items and have
                                Ground Crew recheck.
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-line bg-fg/[0.02] p-4 text-xs space-y-2">
                          <div className="font-semibold text-foreground">
                            1. Team Lead Final Loading Checklist Status
                          </div>
                          {order.loadingChecklist ? (
                            <div className="space-y-1 text-muted-foreground">
                              <div>
                                <Badge tone="success">Submitted</Badge> by{" "}
                                <strong className="text-foreground">
                                  {order.loadingChecklist.submittedByName}
                                </strong>{" "}
                                ({order.loadingChecklist.submittedByEmail})
                              </div>
                              <div>Timestamp: {fmtStamp(order.loadingChecklist.submittedAt)}</div>
                              <div>Notes: “{order.loadingChecklist.notes}”</div>
                            </div>
                          ) : (
                            <div className="text-muted-foreground">
                              Pending submission by current Team Lead (
                              <strong className="text-foreground">
                                {order.teamLeadName || "Unassigned"}
                              </strong>
                              ) in Ground Crew → Dispatch Loading Checks.
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-line bg-fg/[0.02] p-4 text-xs space-y-3">
                          <div className="font-semibold text-foreground">
                            2. Warehouse Outbound Departure Confirmation
                          </div>
                          {order.outboundDeparture ? (
                            <div className="space-y-1 text-muted-foreground">
                              <div>
                                <Badge tone="success">Departed</Badge> Confirmed by{" "}
                                <strong className="text-foreground">
                                  {order.outboundDeparture.confirmedByName}
                                </strong>{" "}
                                at {fmtStamp(order.outboundDeparture.confirmedAt)}
                              </div>
                              <div>
                                Vehicle: <strong className="text-foreground">{order.outboundDeparture.vehiclePlate}</strong>{" "}
                                · Driver: <strong className="text-foreground">{order.outboundDeparture.driverName}</strong>
                              </div>
                              <div>Notes: “{order.outboundDeparture.notes}”</div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Input
                                  value={vehiclePlate}
                                  onChange={(e) => setVehiclePlate(e.target.value)}
                                  placeholder="Vehicle plate / truck ID"
                                />
                                <Input
                                  value={driverName}
                                  onChange={(e) => setDriverName(e.target.value)}
                                  placeholder="Driver name"
                                />
                              </div>
                              <Input
                                value={departureNotes}
                                onChange={(e) => setDepartureNotes(e.target.value)}
                                placeholder="Gate clearance notes…"
                              />
                              <Button
                                type="button"
                                icon={Truck}
                                disabled={!order.loadingChecklist || shortfalls.length > 0}
                                onClick={() => {
                                  const res = confirmOutboundDeparture(actor, order.eventId, {
                                    vehiclePlate,
                                    driverName,
                                    notes: departureNotes,
                                  })
                                  if (!res.ok) notify(res.error)
                                  else notify("Outbound vehicle departure confirmed.")
                                }}
                              >
                                Confirm Outbound Vehicle Departure
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {/* SUBTAB: APPROVED CUSTOM ASSETS (READ-ONLY SPECIFICATIONS) */}
                {subTab === "custom" && (
                  <div className="space-y-6">
                    <Card className="p-6 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-foreground">
                              Approved Custom Assets — {order.eventTitle}
                            </h3>
                            <Badge tone="neutral">Client-Approved Read-Only Specifications</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Custom-asset specifications use client-approved quantities, dimensions, materials,
                            colors, finish, and build instructions. Post-approval specification revisions are
                            outside Warehouse scope.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          icon={Hammer}
                          onClick={() =>
                            onNavigate("module-production", {
                              eventId: order.eventId,
                              subView: "production",
                            })
                          }
                        >
                          Open All in Production ({eventFabJobs.length})
                        </Button>
                      </div>

                      {eventFabJobs.length === 0 && order.customSpecs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No custom-fabricated assets were requested on this approved event.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {eventFabJobs.map((job) => {
                            const estHours =
                              job.estimatedHoursPerUnitOrSet ?? job.spec.estimatedHoursPerUnitOrSet
                            const laborCalc = calculateJobEstimatedLaborHours({
                              requestedQty: job.spec.requestedQty,
                              estimatedHoursPerUnitOrSet: estHours,
                              estimateBasis: job.estimateBasis ?? job.spec.estimateBasis,
                            })
                            const win = job.productionWindow
                            const winConfigured =
                              Boolean(win?.confirmed) &&
                              Boolean(win?.startDate) &&
                              Boolean(win?.deadlineDate) &&
                              Number(win?.availableProductionDays) > 0

                            return (
                              <div
                                key={job.id}
                                className="rounded-xl border border-line bg-fg/[0.02] p-5 space-y-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {job.id}
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
                                        {job.status}
                                      </Badge>
                                      {job.releasedForLoading && (
                                        <Badge tone="info">Released to Dispatch Manifest</Badge>
                                      )}
                                    </div>
                                    <h4 className="mt-1.5 text-base font-bold text-foreground">
                                      {job.spec.name}
                                    </h4>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      icon={Hammer}
                                      onClick={() =>
                                        onNavigate("module-production", {
                                          eventId: order.eventId,
                                          jobId: job.id,
                                          subView: "production",
                                        })
                                      }
                                      className="h-8 px-3 text-xs"
                                    >
                                      Open Job in Production
                                    </Button>
                                    {job.status === "Awaiting Verification" && (
                                      <Button
                                        type="button"
                                        icon={ClipboardCheck}
                                        onClick={() =>
                                          onNavigate("module-verification", {
                                            eventId: order.eventId,
                                            jobId: job.id,
                                            subView: "verification",
                                          })
                                        }
                                        className="h-8 px-3 text-xs"
                                      >
                                        Inspect in Verification
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      icon={Users}
                                      onClick={() =>
                                        onNavigate("module-crew-scheduling", {
                                          eventId: order.eventId,
                                          jobId: job.id,
                                          subView: "crew",
                                        })
                                      }
                                      className="h-8 px-3 text-xs"
                                    >
                                      Schedule Crew
                                    </Button>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-4 sm:flex-row">
                                  <Visual
                                    src={job.spec.referenceImages[0] || "/event-manager-images/garden.jpg"}
                                    label={job.spec.name}
                                    className="size-24 shrink-0 rounded-lg"
                                  />
                                  <dl className="grid flex-1 gap-2.5 text-xs sm:grid-cols-3">
                                    <div>
                                      <dt className="text-muted-foreground">Client-Approved Quantity</dt>
                                      <dd className="mt-0.5 font-semibold text-foreground">
                                        {job.spec.requestedQty}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-muted-foreground">Dimensions</dt>
                                      <dd className="mt-0.5 font-semibold text-foreground">
                                        {job.spec.dimensions}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-muted-foreground">Materials</dt>
                                      <dd className="mt-0.5 font-semibold text-foreground">
                                        {job.spec.materials}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-muted-foreground">Colors</dt>
                                      <dd className="mt-0.5 font-semibold text-foreground">
                                        {job.spec.colors}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-muted-foreground">Finish</dt>
                                      <dd className="mt-0.5 font-semibold text-foreground">
                                        {job.spec.finish}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-muted-foreground">Estimated Labor &amp; Window</dt>
                                      <dd className="mt-0.5 font-semibold text-foreground">
                                        {laborCalc.ok
                                          ? `${laborCalc.totalEstimatedLaborHours} person-hrs`
                                          : "Estimate not configured"}{" "}
                                        ·{" "}
                                        {winConfigured
                                          ? `${win!.startDate} → ${win!.deadlineDate}`
                                          : "Window not configured"}
                                      </dd>
                                    </div>
                                    <div className="sm:col-span-3 border-t border-line pt-2">
                                      <dt className="font-semibold text-foreground">
                                        Approved Build &amp; Assembly Instructions
                                      </dt>
                                      <dd className="mt-0.5 text-muted-foreground">
                                        {job.spec.buildInstructions}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </Card>
                  </div>
                )}

                {/* SUBTAB 2: RENTALS, E-LETTER & SUPPLIER CONFIRMATION (D07 & D08) */}
                {subTab === "rentals" && (
                  <div className="space-y-6">
                    <Card className="p-6">
                      <h3 className="text-base font-bold text-foreground">
                        Event rentals
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Recording a booking reference keeps the rental in{" "}
                        <strong className="text-foreground">Pending Confirmation</strong>. Mark the rental{" "}
                        <strong className="text-foreground">Confirmed</strong> only after recording explicit
                        supplier acceptance of the e-letter terms. Direct-to-venue rentals are verified at the
                        venue and on supplier handback by the Ground Crew Team Lead.
                      </p>

                      {order.rentals.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          No rentals registered for this event.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-4">
                          {order.rentals.map((r) => {
                            const isEditing = activeRentalId === r.id
                            return (
                              <div
                                key={r.id}
                                className="rounded-xl border border-line bg-fg/[0.02] p-5 space-y-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-bold text-foreground">
                                        {r.vendorName}
                                      </span>
                                      <Badge
                                        tone={r.confirmationStatus === "Confirmed" ? "success" : "warning"}
                                      >
                                        {r.confirmationStatus}
                                      </Badge>
                                      {r.directToVenue && (
                                        <Badge tone="info">Direct to venue</Badge>
                                      )}
                                    </div>
                                    <div className="mt-1 text-sm text-foreground">
                                      Item: <strong>{r.itemName}</strong> · Approved Requested Quantity:{" "}
                                      <strong className="tabular-nums">{r.ApprovedRequestedQty}</strong>
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      Category: {r.category} · Contact: {r.contact} · Booking Reference:{" "}
                                      <strong className="text-foreground">
                                        {r.bookingReference || "Not recorded yet"}
                                      </strong>
                                    </div>
                                  </div>
                                  {!order.warehouseClosed && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      icon={FileText}
                                      onClick={() =>
                                        isEditing ? setActiveRentalId("") : openRentalEditor(r.id)
                                      }
                                    >
                                      {isEditing
                                        ? "Close E-Letter & Confirmation Panel"
                                        : "Manage E-Letter & Supplier Confirmation"}
                                    </Button>
                                  )}
                                </div>

                                {/* E-Letter & Supplier Acceptance Summary */}
                                <div className="grid gap-3 md:grid-cols-3 text-xs">
                                  <div className="rounded-lg border border-line bg-card p-3 space-y-1">
                                    <div className="font-semibold text-foreground">
                                      1. Rental E-Letter & Booking Ref
                                    </div>
                                    {r.eLetter ? (
                                      <>
                                        <div>
                                          Prepared by <strong>{r.eLetter.preparedByName}</strong> (
                                          {fmtStamp(r.eLetter.preparedAt)})
                                        </div>
                                        <div className="text-muted-foreground">
                                          Delivery: {r.eLetter.deliveryLocation}
                                        </div>
                                        <div className="text-muted-foreground">
                                          Return: {r.eLetter.returnArrangements}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-muted-foreground">E-Letter not prepared yet.</div>
                                    )}
                                  </div>

                                  <div className="rounded-lg border border-line bg-card p-3 space-y-1">
                                    <div className="font-semibold text-foreground">
                                      2. Supplier confirmation
                                    </div>
                                    {r.supplierAcceptance ? (
                                      <>
                                        <div>
                                          <Badge tone="success">{r.supplierAcceptance.evidenceType}</Badge>{" "}
                                          Ref: <strong>{r.supplierAcceptance.referenceOrUrl}</strong>
                                        </div>
                                        <div className="text-muted-foreground">
                                          {r.supplierAcceptance.notes}
                                        </div>
                                        <div className="text-muted-foreground">
                                          Recorded by {r.supplierAcceptance.recordedByName} at{" "}
                                          {fmtStamp(r.supplierAcceptance.recordedAt)}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-muted-foreground">
                                        Awaiting explicit supplier acceptance. Status remains{" "}
                                        <strong>Pending Confirmation</strong> even when booking reference is
                                        set.
                                      </div>
                                    )}
                                  </div>

                                  <div className="rounded-lg border border-line bg-card p-3 space-y-1">
                                    <div className="font-semibold text-foreground">
                                      3. Venue receipt and return
                                    </div>
                                    {r.venueReceipt ? (
                                      <div>
                                        Venue Receipt: <strong>{r.venueReceipt.deliveredQty}</strong>/
                                        {r.ApprovedRequestedQty} delivered (Verified by{" "}
                                        {r.venueReceipt.verifiedByName})
                                        {r.venueReceipt.hasDiscrepancy && (
                                          <span className="ml-1 text-danger">
                                            · Discrepancy: {r.venueReceipt.discrepancyNotes}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground">
                                        Venue receipt not yet recorded by Team Lead.
                                      </div>
                                    )}
                                    {r.supplierReturn ? (
                                      <div className="mt-1">
                                        Supplier Return: <strong>{r.supplierReturn.handedBackQty}</strong>{" "}
                                        handed back (Missing: {r.supplierReturn.missingQty}, Damaged:{" "}
                                        {r.supplierReturn.damagedQty}) — Verified by{" "}
                                        {r.supplierReturn.verifiedByName}
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground">
                                        Supplier post-event return not yet recorded by Team Lead.
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Interactive E-Letter & Supplier Acceptance Editor */}
                                {isEditing && (
                                  <div className="grid gap-5 border-t border-line pt-4 lg:grid-cols-2">
                                    <div className="space-y-3 rounded-xl border border-line bg-card p-4">
                                      <div className="text-sm font-bold text-foreground">
                                        Step A — Prepare Rental E-Letter & Booking Reference
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Saving a booking reference and e-letter keeps the status as{" "}
                                        <strong>Pending Confirmation</strong> until supplier acceptance is
                                        recorded in Step B.
                                      </p>
                                      <Field label="Supplier Booking Reference">
                                        <Input
                                          value={bookingRefInput}
                                          onChange={(e) => setBookingRefInput(e.target.value)}
                                          placeholder="e.g. SNG-2026-8841"
                                        />
                                      </Field>
                                      <Field label="Delivery Location">
                                        <Input
                                          value={deliveryLocInput}
                                          onChange={(e) => setDeliveryLocInput(e.target.value)}
                                        />
                                      </Field>
                                      <Field label="Delivery Arrangements">
                                        <textarea
                                          className={textareaCls}
                                          rows={2}
                                          value={deliveryArrInput}
                                          onChange={(e) => setDeliveryArrInput(e.target.value)}
                                        />
                                      </Field>
                                      <Field label="Return Arrangements">
                                        <textarea
                                          className={textareaCls}
                                          rows={2}
                                          value={returnArrInput}
                                          onChange={(e) => setReturnArrInput(e.target.value)}
                                        />
                                      </Field>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        icon={FileText}
                                        onClick={() => {
                                          const res = saveRentalELetterAndBookingRef(actor, {
                                            eventId: order.eventId,
                                            rentalId: r.id,
                                            bookingReference: bookingRefInput,
                                            deliveryLocation: deliveryLocInput,
                                            deliveryArrangements: deliveryArrInput,
                                            returnArrangements: returnArrInput,
                                            directToVenue: directToVenueInput,
                                          })
                                          if (!res.ok) notify(res.error)
                                          else
                                            notify(
                                              `Saved Rental E-Letter and Booking Ref (${bookingRefInput || "none"}). Status remains Pending Confirmation until supplier acceptance is recorded.`,
                                            )
                                        }}
                                      >
                                        Save E-Letter & Booking Reference
                                      </Button>
                                    </div>

                                    <div className="space-y-3 rounded-xl border border-line bg-card p-4">
                                      <div className="text-sm font-bold text-foreground">
                                        Step B — Record Explicit Supplier Acceptance (Marks Confirmed)
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Requires an accepted e-letter, written confirmation of its terms, or a
                                        signed agreement. Updates both Warehouse and Event Manager views to{" "}
                                        <strong>Confirmed</strong>.
                                      </p>
                                      <Field label="Supplier Acceptance Evidence Type">
                                        <select
                                          className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
                                          value={acceptanceType}
                                          onChange={(e) =>
                                            setAcceptanceType(
                                              e.target.value as RentalSupplierAcceptance["evidenceType"],
                                            )
                                          }
                                        >
                                          <option value="Accepted E-Letter">Accepted E-Letter</option>
                                          <option value="Written Confirmation">
                                            Written Confirmation of Terms
                                          </option>
                                          <option value="Signed Agreement">Signed Agreement</option>
                                        </select>
                                      </Field>
                                      <Field label="Accepted E-Letter / Agreement Reference">
                                        <Input
                                          value={acceptanceRef}
                                          onChange={(e) => setAcceptanceRef(e.target.value)}
                                          placeholder="e.g. ACK-SNG-2026-8841-SIGNED.pdf"
                                        />
                                      </Field>
                                      <Field label="Supplier Response Notes">
                                        <textarea
                                          className={textareaCls}
                                          rows={2}
                                          value={acceptanceNotes}
                                          onChange={(e) => setAcceptanceNotes(e.target.value)}
                                        />
                                      </Field>
                                      <Button
                                        type="button"
                                        icon={FileCheck2}
                                        onClick={() => {
                                          const res = recordRentalSupplierAcceptance(actor, {
                                            eventId: order.eventId,
                                            rentalId: r.id,
                                            evidenceType: acceptanceType,
                                            referenceOrUrl: acceptanceRef,
                                            notes: acceptanceNotes,
                                          })
                                          if (!res.ok) notify(res.error)
                                          else {
                                            notify(
                                              `Supplier acceptance recorded for ${r.vendorName}. Rental is now Confirmed in Warehouse and Event Manager views.`,
                                            )
                                            setActiveRentalId("")
                                          }
                                        }}
                                      >
                                        Record Supplier Acceptance & Mark Confirmed
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </Card>
                  </div>
                )}

                {/* SUBTAB 3: RETURN SIGN-OFF & EVENT CLOSEOUT (D05) */}
                {subTab === "reconciliation" && (
                  <div className="space-y-6">
                    <Card className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Return reconciliation
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Warehouse can close accountability for the event only after the Team Lead submits
                            the Return Checklist and every missing item, damage report, and rental return
                            discrepancy has a documented resolution.
                          </p>
                        </div>
                        <Badge tone={order.warehouseClosed ? "success" : "warning"}>
                          {order.warehouseClosed
                            ? `Closed by ${order.closedByName} (${fmtStamp(order.closedAt!)})`
                            : "Warehouse Accountability Open"}
                        </Badge>
                      </div>

                      {/* Checkpoint Summary */}
                      <div className="mt-4 grid gap-3 md:grid-cols-4 text-xs">
                        <div className="rounded-lg border border-line bg-fg/[0.02] p-3">
                          <div className="font-semibold text-foreground">1. Dispatch Loading</div>
                          {order.loadingChecklist ? (
                            <div className="mt-1 text-muted-foreground">
                              Submitted by{" "}
                              <strong className="text-foreground">
                                {order.loadingChecklist.submittedByName}
                              </strong>{" "}
                              at {fmtStamp(order.loadingChecklist.submittedAt)}
                            </div>
                          ) : (
                            <div className="mt-1 text-muted-foreground">Not submitted yet</div>
                          )}
                        </div>
                        <div className="rounded-lg border border-line bg-fg/[0.02] p-3">
                          <div className="font-semibold text-foreground">2. Venue Arrival</div>
                          {order.venueArrival ? (
                            <div className="mt-1 text-muted-foreground">
                              Photo confirmed by{" "}
                              <strong className="text-foreground">
                                {order.venueArrival.submittedByName}
                              </strong>{" "}
                              at {fmtStamp(order.venueArrival.submittedAt)}
                            </div>
                          ) : (
                            <div className="mt-1 text-muted-foreground">Not confirmed yet</div>
                          )}
                        </div>
                        <div className="rounded-lg border border-line bg-fg/[0.02] p-3">
                          <div className="font-semibold text-foreground">4. Warehouse Arrival</div>
                          {order.warehouseArrival ? (
                            <div className="mt-1 text-muted-foreground">
                              Photo confirmed by{" "}
                              <strong className="text-foreground">
                                {order.warehouseArrival.submittedByName}
                              </strong>{" "}
                              at {fmtStamp(order.warehouseArrival.submittedAt)}
                            </div>
                          ) : (
                            <div className="mt-1 text-muted-foreground">Not confirmed yet</div>
                          )}
                        </div>
                        <div className="rounded-lg border border-line bg-fg/[0.02] p-3">
                          <div className="font-semibold text-foreground">Final Return Checklist</div>
                          {order.returnChecklist ? (
                            <div className="mt-1 text-muted-foreground">
                              Submitted by{" "}
                              <strong className="text-foreground">
                                {order.returnChecklist.submittedByName}
                              </strong>{" "}
                              at {fmtStamp(order.returnChecklist.submittedAt)}
                            </div>
                          ) : (
                            <div className="mt-1 text-muted-foreground">Pending Team Lead submission</div>
                          )}
                        </div>
                      </div>

                      {/* Missing & Damage Reports for this Event */}
                      <div className="mt-6">
                        <h4 className="text-sm font-bold text-foreground">
                          Field Damage Reports & Missing Item Reports ({eventIncidents.length})
                        </h4>
                        {eventIncidents.length === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            No damage or missing item reports filed for this event.
                          </p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {eventIncidents.map((inc) => {
                              const draftRes = inlineResolutions[inc.id] ?? {
                                type: "Recovered",
                                notes: "",
                              }
                              return (
                                <div
                                  key={inc.id}
                                  className="rounded-xl border border-line bg-fg/[0.02] p-4 text-xs"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge tone={inc.reportType === "Damage" ? "danger" : "warning"}>
                                          {inc.reportType} Report
                                        </Badge>
                                        <Badge tone="neutral">Checkpoint: {inc.checkpoint}</Badge>
                                        <span className="font-bold text-sm text-foreground">
                                          {inc.itemName} (×{inc.quantity})
                                        </span>
                                        <Badge
                                          tone={inc.resolutionStatus === "Resolved" ? "success" : "danger"}
                                        >
                                          {inc.resolutionStatus}
                                        </Badge>
                                      </div>
                                      <p className="mt-1 text-muted-foreground">
                                        Description: “{inc.description}” · Filed by{" "}
                                        <strong className="text-foreground">{inc.submittedByName}</strong> at{" "}
                                        {fmtStamp(inc.submittedAt)}
                                      </p>
                                      {inc.resolutionStatus === "Resolved" && (
                                        <p className="mt-1 text-foreground">
                                          <strong>Resolution ({inc.resolutionType}):</strong>{" "}
                                          {inc.resolutionNotes} — Signed off by {inc.resolvedByName}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {inc.resolutionStatus !== "Resolved" && !order.warehouseClosed && (
                                    <div className="mt-3 grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto] items-center border-t border-line pt-3">
                                      <select
                                        className="h-9 rounded-md border border-fg/[0.06] bg-fg/[0.08] px-2.5 text-xs text-foreground"
                                        value={draftRes.type}
                                        onChange={(e) =>
                                          setInlineResolutions({
                                            ...inlineResolutions,
                                            [inc.id]: {
                                              ...draftRes,
                                              type: e.target.value as IssueResolutionType,
                                            },
                                          })
                                        }
                                      >
                                        {RESOLUTION_OPTIONS.map((opt) => (
                                          <option key={opt} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                      <Input
                                        value={draftRes.notes}
                                        onChange={(e) =>
                                          setInlineResolutions({
                                            ...inlineResolutions,
                                            [inc.id]: { ...draftRes, notes: e.target.value },
                                          })
                                        }
                                        placeholder="Document resolution (e.g. item recovered, repair order #41, approved write-off)…"
                                      />
                                      <Button
                                        type="button"
                                        onClick={() => {
                                          const res = resolveFieldIncidentReport(actor, inc.id, {
                                            resolutionType: draftRes.type,
                                            resolutionNotes: draftRes.notes,
                                          })
                                          if (!res.ok) notify(res.error)
                                          else notify(`Resolved ${inc.reportType} report for ${inc.itemName}.`)
                                        }}
                                      >
                                        Record Resolution
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Rental Return Discrepancies */}
                      <div className="mt-6">
                        <h4 className="text-sm font-bold text-foreground">
                          Rental reconciliation
                        </h4>
                        <div className="mt-3 space-y-3">
                          {order.rentals.map((r) => {
                            const receiptDisc =
                              r.venueReceipt?.hasDiscrepancy &&
                              r.venueReceipt.resolutionStatus !== "Resolved"
                            const returnDisc =
                              r.supplierReturn?.hasDiscrepancy &&
                              r.supplierReturn.resolutionStatus !== "Resolved"
                            const key = `rnt-res-${r.id}`
                            const draftRes = inlineResolutions[key] ?? {
                              type: "Supplier Settled",
                              notes: "",
                            }
                            return (
                              <div
                                key={r.id}
                                className="rounded-xl border border-line bg-fg/[0.02] p-4 text-xs space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-sm text-foreground">
                                    {r.vendorName} — {r.itemName} (Requested: {r.ApprovedRequestedQty})
                                  </span>
                                  <Badge
                                    tone={
                                      !r.supplierReturn
                                        ? "warning"
                                        : receiptDisc || returnDisc
                                          ? "danger"
                                          : "success"
                                    }
                                  >
                                    {!r.supplierReturn
                                      ? "Awaiting Team Lead Return Check"
                                      : receiptDisc || returnDisc
                                        ? "Unresolved Discrepancy"
                                        : "Rental Return Reconciled"}
                                  </Badge>
                                </div>
                                <div className="text-muted-foreground">
                                  Venue Receipt:{" "}
                                  {r.venueReceipt
                                    ? `${r.venueReceipt.deliveredQty} delivered (${r.venueReceipt.discrepancyNotes}) — Verified by ${r.venueReceipt.verifiedByName}`
                                    : "Not recorded yet"}
                                </div>
                                <div className="text-muted-foreground">
                                  Supplier Return:{" "}
                                  {r.supplierReturn
                                    ? `${r.supplierReturn.handedBackQty} handed back, ${r.supplierReturn.missingQty} missing, ${r.supplierReturn.damagedQty} damaged (${r.supplierReturn.discrepancyNotes}) — Verified by ${r.supplierReturn.verifiedByName}`
                                    : "Not recorded yet"}
                                </div>
                                {r.supplierReturn?.resolutionStatus === "Resolved" && (
                                  <div className="text-foreground">
                                    <strong>Return Discrepancy Resolution ({r.supplierReturn.resolutionType}):</strong>{" "}
                                    {r.supplierReturn.resolutionNotes} (by {r.supplierReturn.resolvedByName})
                                  </div>
                                )}
                                {(receiptDisc || returnDisc) && !order.warehouseClosed && (
                                  <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto] items-center border-t border-line pt-3">
                                    <select
                                      className="h-9 rounded-md border border-fg/[0.06] bg-fg/[0.08] px-2.5 text-xs text-foreground"
                                      value={draftRes.type}
                                      onChange={(e) =>
                                        setInlineResolutions({
                                          ...inlineResolutions,
                                          [key]: {
                                            ...draftRes,
                                            type: e.target.value as IssueResolutionType,
                                          },
                                        })
                                      }
                                    >
                                      {RESOLUTION_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                    <Input
                                      value={draftRes.notes}
                                      onChange={(e) =>
                                        setInlineResolutions({
                                          ...inlineResolutions,
                                          [key]: { ...draftRes, notes: e.target.value },
                                        })
                                      }
                                      placeholder="Document supplier settlement or recovery…"
                                    />
                                    <Button
                                      type="button"
                                      onClick={() => {
                                        if (receiptDisc) {
                                          resolveRentalDiscrepancy(actor, {
                                            eventId: order.eventId,
                                            rentalId: r.id,
                                            stage: "receipt",
                                            resolutionType: draftRes.type,
                                            resolutionNotes: draftRes.notes,
                                          })
                                        }
                                        if (returnDisc) {
                                          resolveRentalDiscrepancy(actor, {
                                            eventId: order.eventId,
                                            rentalId: r.id,
                                            stage: "return",
                                            resolutionType: draftRes.type,
                                            resolutionNotes: draftRes.notes,
                                          })
                                        }
                                        notify(`Resolved rental discrepancy for ${r.vendorName}.`)
                                      }}
                                    >
                                      Resolve Rental Discrepancy
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Separate Ground Crew Task Completion vs Warehouse Event Closeout */}
                      <div className="mt-6 border-t border-line pt-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">
                            Ground Crew Task Completion (tracked separately from Warehouse Closeout):{" "}
                            <strong className="text-foreground">
                              {order.crewAssignments.filter((a) => a.taskStatus === "Completed").length}/
                              {order.crewAssignments.length} tasks completed
                            </strong>
                          </span>
                        </div>
                        {order.warehouseClosed ? (
                          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-foreground">
                            <div className="font-bold text-[#4ade80]">
                              Warehouse Accountability Closed for {order.eventTitle}
                            </div>
                            <div className="mt-1">
                              Closed by <strong>{order.closedByName}</strong> ({order.closedByEmail}) at{" "}
                              {fmtStamp(order.closedAt!)}
                            </div>
                            <div className="mt-1 text-muted-foreground">Notes: “{order.closeoutNotes}”</div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Field label="Warehouse Event Closeout Sign-off Notes">
                              <textarea
                                className={textareaCls}
                                rows={2}
                                value={closeoutNotes}
                                onChange={(e) => setCloseoutNotes(e.target.value)}
                                placeholder="Final reconciliation remarks before closing warehouse accountability for this event…"
                              />
                            </Field>
                            <Button
                              type="button"
                              icon={CheckCircle2}
                              onClick={() => {
                                const res = closeWarehouseEventAccountability(
                                  actor,
                                  order.eventId,
                                  closeoutNotes,
                                )
                                if (!res.ok) notify(res.error)
                                else notify(`Event ${order.eventTitle} reconciled and closed.`)
                              }}
                            >
                              Sign Off Return & Close Warehouse Event Accountability
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )
          }
    </div>
  )
}
