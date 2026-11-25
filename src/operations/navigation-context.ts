import { useEffect, useState } from "react"
import {
  calculateCombinedWindowCrewRecommendations,
  calculateGuestBasedEventStaffing,
  calculateJobEstimatedLaborHours,
  calculateWorkingLeadCapacity,
  validateStoreSchedulesAndWorkload,
} from "./staffing-calculator"
import {
  getWarehouseSelectedEventId,
  setWarehouseSelectedEventId,
} from "./store-core"
import type {
  FabricationJob,
  MigrationReviewFlag,
  OperationsStoreState,
} from "./types"

export type WarehouseTabKey =
  | "events"
  | "asset-inventory"
  | "replenishment-deficits"
  | "vendors"
  | "crew-scheduling"
  | "production"
  | "verification"
  | "damage-missing-reports"
  | "dispatch-returns"

export type WarehouseSubView =
  | "orders"
  | "deficits"
  | "consolidated"
  | "inventory"
  | "acquisitions"
  | "vendors"
  | "crew"
  | "production"
  | "verification"
  | "dispatch"
  | "transport"
  | "returns"
  | "incidents"

export type GroundCrewOperationView =
  | "overview"
  | "loading"
  | "venue-arrival"
  | "evidence"
  | "return-audit"

export type OperationsNavigationContext = {
  eventId?: string
  jobId?: string
  reportId?: string
  subView?: WarehouseSubView
  groundCrewOperation?: GroundCrewOperationView
  sourceRoute?: string
  updatedAt?: number
}

const OPS_NAV_STORAGE_KEY = "lumiere.operations.navContext.v2"
const OPS_NAV_EVENT = "lumiere:operations-nav-context"

let memoryNavContext: OperationsNavigationContext = {}

export function getOperationsNavigationContext(): OperationsNavigationContext {
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(OPS_NAV_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as OperationsNavigationContext
        memoryNavContext = { ...memoryNavContext, ...parsed }
      }
    } catch {
      // ignore storage read errors
    }
    const legacyEventId = getWarehouseSelectedEventId()
    if (legacyEventId && !memoryNavContext.eventId) {
      memoryNavContext = { ...memoryNavContext, eventId: legacyEventId }
    }
  }
  return { ...memoryNavContext }
}

let inSessionNavUpdated = false

export function hasInSessionOperationsNavigation(): boolean {
  return inSessionNavUpdated
}

export function setOperationsNavigationContext(
  next: Partial<OperationsNavigationContext>,
  options?: { merge?: boolean },
): OperationsNavigationContext {
  inSessionNavUpdated = true
  const base = options?.merge ? getOperationsNavigationContext() : {}
  const updated: OperationsNavigationContext = {
    ...base,
    ...next,
    updatedAt: Date.now(),
  }
  memoryNavContext = updated

  if (updated.eventId !== undefined) {
    setWarehouseSelectedEventId(updated.eventId)
  } else if ("eventId" in next) {
    setWarehouseSelectedEventId("")
  }

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(OPS_NAV_STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // ignore sessionStorage quota errors
    }
    window.dispatchEvent(new CustomEvent(OPS_NAV_EVENT, { detail: updated }))
  }
  return updated
}

export function clearOperationsNavigationContext(): void {
  memoryNavContext = {}
  setWarehouseSelectedEventId("")
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(OPS_NAV_STORAGE_KEY)
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(OPS_NAV_EVENT, { detail: {} }))
  }
}

export function useOperationsNavigationContext(): OperationsNavigationContext {
  const [ctx, setCtx] = useState<OperationsNavigationContext>(() =>
    getOperationsNavigationContext(),
  )

  useEffect(() => {
    const sync = () => setCtx(getOperationsNavigationContext())
    window.addEventListener(OPS_NAV_EVENT, sync)
    return () => window.removeEventListener(OPS_NAV_EVENT, sync)
  }, [])

  return ctx
}

export type ResolvedOperationsRoute = {
  rawRoute: string
  baseRoute: string
  canonicalRoute: string
  moduleKey: string
  isLegacyAlias: boolean
  impliedContext: Partial<OperationsNavigationContext>
}

/**
 * Maps any Warehouse or Ground Crew route (including legacy routes and optional query params
 * such as `module-events?eventId=evt-1&subView=deficits`) to its canonical Phase 2 route
 * and implied subview/operation context.
 */
export function resolveOperationsRoute(rawRoute: string): ResolvedOperationsRoute {
  const [pathPart, queryPart] = rawRoute.split("?")
  const baseRoute = pathPart.trim()
  const params = new URLSearchParams(queryPart ?? "")
  const queryContext: Partial<OperationsNavigationContext> = {}

  const qEventId = params.get("eventId")
  const qJobId = params.get("jobId")
  const qReportId = params.get("reportId")
  const qSubView = params.get("subView") as WarehouseSubView | null
  const qOp = params.get("op") as GroundCrewOperationView | null

  if (qEventId) queryContext.eventId = qEventId
  if (qJobId) queryContext.jobId = qJobId
  if (qReportId) queryContext.reportId = qReportId
  if (qSubView) queryContext.subView = qSubView
  if (qOp) queryContext.groundCrewOperation = qOp

  switch (baseRoute) {
    // ── Warehouse Canonical Routes ──
    case "module-events":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-events",
        moduleKey: "events",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "orders",
          ...queryContext,
        },
      }
    case "module-asset-inventory":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-asset-inventory",
        moduleKey: "asset-inventory",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "inventory",
          ...queryContext,
        },
      }
    case "module-replenishment-deficits":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-replenishment-deficits",
        moduleKey: "replenishment-deficits",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "deficits",
          ...queryContext,
        },
      }
    case "module-vendors":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-vendors",
        moduleKey: "vendors",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "vendors",
          ...queryContext,
        },
      }
    case "module-crew-scheduling":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-crew-scheduling",
        moduleKey: "crew-scheduling",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "crew",
          ...queryContext,
        },
      }
    case "module-production":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-production",
        moduleKey: "production",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "production",
          ...queryContext,
        },
      }
    case "module-verification":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-verification",
        moduleKey: "verification",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "verification",
          ...queryContext,
        },
      }
    case "module-damage-missing-reports":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-damage-missing-reports",
        moduleKey: "damage-missing-reports",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "incidents",
          ...queryContext,
        },
      }
    case "module-dispatch-returns":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-dispatch-returns",
        moduleKey: "dispatch-returns",
        isLegacyAlias: false,
        impliedContext: {
          subView: queryContext.subView ?? "dispatch",
          ...queryContext,
        },
      }

    // ── Warehouse Legacy Route Aliases ──
    case "module-order-requests":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-events",
        moduleKey: "events",
        isLegacyAlias: true,
        impliedContext: {
          subView: "orders",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-deficit-queue":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-replenishment-deficits",
        moduleKey: "replenishment-deficits",
        isLegacyAlias: true,
        impliedContext: {
          subView: "deficits",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-asset-acquisition":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-replenishment-deficits",
        moduleKey: "replenishment-deficits",
        isLegacyAlias: true,
        impliedContext: {
          subView: "acquisitions",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-personnel-deployment":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-crew-scheduling",
        moduleKey: "crew-scheduling",
        isLegacyAlias: true,
        impliedContext: {
          subView: "crew",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-custom-fabrication":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-production",
        moduleKey: "production",
        isLegacyAlias: true,
        impliedContext: {
          subView: "production",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-damage-assessment":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-damage-missing-reports",
        moduleKey: "damage-missing-reports",
        isLegacyAlias: true,
        impliedContext: {
          subView: "incidents",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }

    // ── Ground Crew Canonical & Legacy Routes ──
    case "module-my-work":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-my-work",
        moduleKey: "my-work",
        isLegacyAlias: false,
        impliedContext: {
          groundCrewOperation: queryContext.groundCrewOperation ?? "overview",
          ...queryContext,
        },
      }
    case "module-assigned-work":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-my-work",
        moduleKey: "my-work",
        isLegacyAlias: true,
        impliedContext: {
          groundCrewOperation: queryContext.groundCrewOperation ?? "overview",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-dispatch-checks":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-my-work",
        moduleKey: "my-work",
        isLegacyAlias: true,
        impliedContext: {
          groundCrewOperation: "loading",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-venue-arrival":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-my-work",
        moduleKey: "my-work",
        isLegacyAlias: true,
        impliedContext: {
          groundCrewOperation: "venue-arrival",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-evidence-capture":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-my-work",
        moduleKey: "my-work",
        isLegacyAlias: true,
        impliedContext: {
          groundCrewOperation: "evidence",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }
    case "module-post-event-audits":
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: "module-my-work",
        moduleKey: "my-work",
        isLegacyAlias: true,
        impliedContext: {
          groundCrewOperation: "return-audit",
          ...queryContext,
          sourceRoute: baseRoute,
        },
      }

    default: {
      const key = baseRoute.startsWith("module-")
        ? baseRoute.slice("module-".length)
        : baseRoute
      return {
        rawRoute,
        baseRoute,
        canonicalRoute: baseRoute,
        moduleKey: key,
        isLegacyAlias: false,
        impliedContext: queryContext,
      }
    }
  }
}

// ============================================================================
// Warehouse Overview Derived Summary & Action Queue Selectors
// ============================================================================

export type EventStaffingAndReadinessSummary = {
  eventId: string
  orderId: string
  eventTitle: string
  venue: string
  startDateTime: string
  endDateTime: string
  pax: number
  /** 1. Guest-based event staffing recommendation (unchanged formula) */
  eventStaffingRecommendation: {
    minCrew: number
    maxCrew: number
    rangeLabel: string
    displayLabel: string
  }
  /** 2. Production staffing recommendation from Phase 1 calculator */
  productionStaffingRecommendation: {
    status: "no-custom-jobs" | "not-configured" | "partial" | "configured"
    displayLabel: string
    detailLabel: string
    recommendedCrew: number | null
    combinedEstimatedHours: number | null
    unconfiguredJobCount: number
    totalJobCount: number
  }
  /** 3. Current Event Crew Group roster count */
  rosterSummary: {
    status: "not-configured" | "configured"
    activeRosterCount: number
    displayLabel: string
    hasLegacyUnconfirmedCrew: boolean
  }
  /** 4. Explicit Event Team Lead, or "Not selected" */
  teamLeadSummary: {
    status: "not-selected" | "needs-confirmation" | "selected"
    leadEmail?: string
    leadName?: string
    displayLabel: string
    workingLeadFabricationHours?: number
    workingLeadCoordinationHours?: number
  }
  /** 5. Confirmed Scheduled Capacity (distinct from roster & recommendations) */
  scheduledCapacitySummary: {
    status: "not-configured" | "configured"
    scheduledShiftCount: number
    plannedFabricationHours: number
    plannedEventAndCoordinationHours: number
    displayLabel: string
    hasLegacyFreeTextSchedule: boolean
  }
  /** 6. Production readiness & unresolved issues */
  readiness: {
    totalJobs: number
    readyToLoadJobs: number
    awaitingVerificationJobs: number
    inProductionJobs: number
    unassignedOrAssignedJobs: number
    openDeficitsCount: number
    crewBlockersCount: number
    unresolvedMigrationFlagsCount: number
    openIncidentsCount: number
    scheduleConflictsCount: number
    statusLabel: string
    tone: "success" | "warning" | "danger" | "info" | "neutral"
    unmetRequirements: string[]
  }
}

export type WarehouseActionQueueCategory =
  | "awaiting-verification"
  | "crew-blocker"
  | "unconfirmed-production-window"
  | "schedule-workload-conflict"
  | "shared-shift-shortfall"
  | "legacy-review-flag"
  | "event-stock-deficit"

export type WarehouseActionQueueItem = {
  id: string
  category: WarehouseActionQueueCategory
  categoryLabel: string
  severity: "danger" | "warning" | "info"
  title: string
  description: string
  eventId: string
  eventTitle: string
  jobId?: string
  targetRoute: string
  targetContext: Partial<OperationsNavigationContext>
  actionLabel: string
}

export type WarehouseOverviewComputedData = {
  kpis: {
    activeEvents: number
    productionJobsInProgress: number
    jobsAwaitingVerification: number
    scheduleAndWorkloadConflicts: number
    legacyRecordsNeedingReview: number
    unresolvedLegacyFlagsTotal: number
    openStockDeficits: number
    totalAssets: number
    availableAssets: number
  }
  scheduleValidation: ReturnType<typeof validateStoreSchedulesAndWorkload>
  eventSummaries: EventStaffingAndReadinessSummary[]
  actionQueue: WarehouseActionQueueItem[]
  actionCountsByCategory: Record<WarehouseActionQueueCategory, number>
}

export function computeWarehouseOverviewData(
  state: OperationsStoreState,
): WarehouseOverviewComputedData {
  const activeOrders = state.orderRequests.filter((o) => !o.warehouseClosed)
  const scheduleValidation = validateStoreSchedulesAndWorkload(state)

  const productionJobsInProgress = state.fabricationJobs.filter(
    (j) => j.status === "In Production" || j.status === "Assigned",
  ).length

  const jobsAwaitingVerification = state.fabricationJobs.filter(
    (j) => j.status === "Awaiting Verification",
  ).length

  const scheduleAndWorkloadConflicts = scheduleValidation.conflicts.length

  let legacyRecordsNeedingReview = 0
  let unresolvedLegacyFlagsTotal = 0

  for (const order of state.orderRequests) {
    const unresolved = (order.migrationReviewFlags ?? []).filter(
      (f) => !f.resolvedAt,
    )
    if (unresolved.length > 0) {
      legacyRecordsNeedingReview++
      unresolvedLegacyFlagsTotal += unresolved.length
    }
  }
  for (const job of state.fabricationJobs) {
    const unresolved = (job.migrationReviewFlags ?? []).filter(
      (f) => !f.resolvedAt,
    )
    if (unresolved.length > 0) {
      legacyRecordsNeedingReview++
      unresolvedLegacyFlagsTotal += unresolved.length
    }
  }

  const openStockDeficits = state.deficitQueue.filter(
    (d) => d.status !== "Fulfilled",
  ).length

  const eventSummaries: EventStaffingAndReadinessSummary[] = activeOrders.map(
    (order) => {
      const guestStaffing = calculateGuestBasedEventStaffing(order.pax)
      const eventJobs = state.fabricationJobs.filter(
        (j) => j.eventId === order.eventId,
      )

      // 2. Production staffing recommendation
      let prodRec: EventStaffingAndReadinessSummary["productionStaffingRecommendation"]
      if (eventJobs.length === 0) {
        prodRec = {
          status: "no-custom-jobs",
          displayLabel: "No custom production jobs",
          detailLabel: "Standard stock & rental fulfillment only",
          recommendedCrew: null,
          combinedEstimatedHours: null,
          unconfiguredJobCount: 0,
          totalJobCount: 0,
        }
      } else {
        const calc = calculateCombinedWindowCrewRecommendations(
          eventJobs.map((j) => ({
            id: j.id,
            requestedQty: j.spec.requestedQty,
            estimatedHoursPerUnitOrSet:
              j.estimatedHoursPerUnitOrSet ??
              j.spec.estimatedHoursPerUnitOrSet,
            estimateBasis: j.estimateBasis ?? j.spec.estimateBasis,
            productionWindow: j.productionWindow,
          })),
        )
        const totalConfiguredCrew = calc.windows.reduce(
          (sum, w) => sum + w.recommendedProductionCrew,
          0,
        )
        const totalConfiguredHours =
          Math.round(
            calc.windows.reduce(
              (sum, w) => sum + w.combinedEstimatedLaborHours,
              0,
            ) * 100,
          ) / 100

        if (calc.windows.length === 0) {
          prodRec = {
            status: "not-configured",
            displayLabel: "Not configured",
            detailLabel: `${calc.skippedJobs.length} of ${eventJobs.length} job(s) missing confirmed production window or labor estimate`,
            recommendedCrew: null,
            combinedEstimatedHours: null,
            unconfiguredJobCount: calc.skippedJobs.length,
            totalJobCount: eventJobs.length,
          }
        } else if (calc.skippedJobs.length > 0) {
          prodRec = {
            status: "partial",
            displayLabel: `${totalConfiguredCrew} crew (${totalConfiguredHours}h) · ${calc.skippedJobs.length} Not configured`,
            detailLabel: `${calc.windows.length} confirmed window(s); ${calc.skippedJobs.length} job(s) awaiting window/estimate confirmation`,
            recommendedCrew: totalConfiguredCrew,
            combinedEstimatedHours: totalConfiguredHours,
            unconfiguredJobCount: calc.skippedJobs.length,
            totalJobCount: eventJobs.length,
          }
        } else {
          prodRec = {
            status: "configured",
            displayLabel: `${totalConfiguredCrew} crew (${totalConfiguredHours} person-hrs)`,
            detailLabel: `Across ${calc.windows.length} confirmed production window(s)`,
            recommendedCrew: totalConfiguredCrew,
            combinedEstimatedHours: totalConfiguredHours,
            unconfiguredJobCount: 0,
            totalJobCount: eventJobs.length,
          }
        }
      }

      // 3. Event Roster count
      const activeRoster = (order.eventRoster ?? []).filter((r) => !r.removedAt)
      const hasLegacyUnconfirmedCrew =
        activeRoster.length === 0 && order.crewAssignments.length > 0
      const rosterSummary: EventStaffingAndReadinessSummary["rosterSummary"] =
        activeRoster.length > 0
          ? {
              status: "configured",
              activeRosterCount: activeRoster.length,
              displayLabel: `${activeRoster.length} ${activeRoster.length === 1 ? "member" : "members"} on roster`,
              hasLegacyUnconfirmedCrew,
            }
          : {
              status: "not-configured",
              activeRosterCount: 0,
              displayLabel: hasLegacyUnconfirmedCrew
                ? "Not configured (legacy assignment needs roster confirmation)"
                : "Not configured",
              hasLegacyUnconfirmedCrew,
            }

      // 4. Explicit Event Team Lead
      const allEventSchedules = [
        ...(order.eventSchedules ?? []),
        ...eventJobs.flatMap((j) => j.schedules ?? []),
      ]
      const autoLeadFlag = (order.migrationReviewFlags ?? []).some(
        (f) => f.code === "AUTO_DESIGNATED_TEAM_LEAD" && !f.resolvedAt,
      )

      let teamLeadSummary: EventStaffingAndReadinessSummary["teamLeadSummary"]
      if (!order.teamLeadEmail) {
        teamLeadSummary = {
          status: "not-selected",
          displayLabel: "Not selected",
        }
      } else {
        const leadCap = calculateWorkingLeadCapacity(
          allEventSchedules,
          order.teamLeadEmail,
        )
        const isNeedsConfirm =
          autoLeadFlag || order.teamLeadExplicitlySelected === false
        teamLeadSummary = {
          status: isNeedsConfirm ? "needs-confirmation" : "selected",
          leadEmail: order.teamLeadEmail,
          leadName: order.teamLeadName || order.teamLeadEmail,
          displayLabel: isNeedsConfirm
            ? `${order.teamLeadName || order.teamLeadEmail} (Needs confirmation)`
            : `${order.teamLeadName || order.teamLeadEmail}`,
          workingLeadFabricationHours: leadCap.plannedFabricationHours,
          workingLeadCoordinationHours:
            leadCap.plannedCoordinationHours + leadCap.plannedEventOpsHours,
        }
      }

      // 5. Confirmed Scheduled Capacity
      const activeScheduledShifts = allEventSchedules.filter(
        (s) => s.status === "scheduled" && !s.needsWarehouseReview,
      )
      const hasLegacyFreeTextSchedule =
        order.crewAssignments.some((a) => Boolean(a.legacyScheduleText)) ||
        (order.migrationReviewFlags ?? []).some(
          (f) =>
            (f.code === "UNPARSEABLE_SCHEDULE_TEXT" ||
              f.code === "MISSING_CONFIRMED_SCHEDULE") &&
            !f.resolvedAt,
        )

      let scheduledCapacitySummary: EventStaffingAndReadinessSummary["scheduledCapacitySummary"]
      if (activeScheduledShifts.length === 0) {
        scheduledCapacitySummary = {
          status: "not-configured",
          scheduledShiftCount: 0,
          plannedFabricationHours: 0,
          plannedEventAndCoordinationHours: 0,
          displayLabel: hasLegacyFreeTextSchedule
            ? "Not configured (legacy text schedule requires Asia/Manila times)"
            : "Not configured",
          hasLegacyFreeTextSchedule,
        }
      } else {
        const plannedFab =
          Math.round(
            activeScheduledShifts
              .filter((s) => s.activityType === "fabrication")
              .reduce((sum, s) => sum + s.plannedProductiveHours, 0) * 100,
          ) / 100
        const plannedOther =
          Math.round(
            activeScheduledShifts
              .filter((s) => s.activityType !== "fabrication")
              .reduce((sum, s) => sum + s.plannedProductiveHours, 0) * 100,
          ) / 100
        scheduledCapacitySummary = {
          status: "configured",
          scheduledShiftCount: activeScheduledShifts.length,
          plannedFabricationHours: plannedFab,
          plannedEventAndCoordinationHours: plannedOther,
          displayLabel: `${plannedFab}h fabrication · ${plannedOther}h event/lead (${activeScheduledShifts.length} ${activeScheduledShifts.length === 1 ? "shift" : "shifts"})`,
          hasLegacyFreeTextSchedule,
        }
      }

      // 6. Readiness & unresolved issues
      const readyToLoadJobs = eventJobs.filter(
        (j) => j.status === "Ready to Load",
      ).length
      const awaitingVerificationJobs = eventJobs.filter(
        (j) => j.status === "Awaiting Verification",
      ).length
      const inProductionJobs = eventJobs.filter(
        (j) => j.status === "In Production",
      ).length
      const unassignedOrAssignedJobs = eventJobs.filter(
        (j) => j.status === "Unassigned" || j.status === "Assigned",
      ).length

      const openDeficitsCount = state.deficitQueue.filter(
        (d) => d.eventId === order.eventId && d.status !== "Fulfilled",
      ).length

      const crewBlockersCount =
        order.crewAssignments.filter((a) => a.taskStatus === "Blocked").length +
        eventJobs.reduce(
          (acc, j) =>
            acc +
            (j.contributions ?? []).filter((c) => Boolean(c.blockerReason))
              .length,
          0,
        )

      const unresolvedMigrationFlagsCount =
        (order.migrationReviewFlags ?? []).filter((f) => !f.resolvedAt).length +
        eventJobs.reduce(
          (acc, j) =>
            acc +
            (j.migrationReviewFlags ?? []).filter((f) => !f.resolvedAt).length,
          0,
        )

      const openIncidentsCount = state.incidentReports.filter(
        (r) =>
          r.eventId === order.eventId && r.resolutionStatus !== "Resolved",
      ).length

      const eventJobIds = new Set(eventJobs.map((j) => j.id))
      const scheduleConflictsCount = scheduleValidation.conflicts.filter(
        (c) =>
          c.eventId === order.eventId ||
          (c.jobId && eventJobIds.has(c.jobId)),
      ).length

      const stockPlannedQty = order.stockLines.reduce(
        (sum, l) => sum + l.approvedRequestedQty,
        0,
      )
      const stockLoadedQty = order.stockLines.reduce(
        (sum, l) => sum + l.loadedQty,
        0,
      )
      const manifestIncomplete =
        (stockPlannedQty > 0 && stockLoadedQty < stockPlannedQty) ||
        (eventJobs.length > 0 && readyToLoadJobs < eventJobs.length) ||
        ((stockPlannedQty > 0 || eventJobs.length > 0) && !order.loadingChecklist)

      const unmetRequirements: string[] = []
      if (crewBlockersCount > 0) unmetRequirements.push(`${crewBlockersCount} crew blocker(s)`)
      if (openDeficitsCount > 0) unmetRequirements.push(`${openDeficitsCount} open stock deficit(s)`)
      if (openIncidentsCount > 0) unmetRequirements.push(`${openIncidentsCount} open incident(s)`)
      if (scheduleConflictsCount > 0) unmetRequirements.push(`${scheduleConflictsCount} schedule conflict(s)`)
      if (teamLeadSummary.status !== "selected") unmetRequirements.push("No Team Lead")
      if (rosterSummary.status === "not-configured") unmetRequirements.push("No roster members")
      if (scheduledCapacitySummary.status === "not-configured") unmetRequirements.push("No confirmed schedule")
      if (awaitingVerificationJobs > 0) unmetRequirements.push(`${awaitingVerificationJobs} awaiting verification`)
      if (inProductionJobs > 0 || unassignedOrAssignedJobs > 0) unmetRequirements.push("Custom production incomplete")
      if (stockPlannedQty > 0 && stockLoadedQty < stockPlannedQty) {
        unmetRequirements.push(`${stockLoadedQty}/${stockPlannedQty} stock loaded`)
      } else if ((stockPlannedQty > 0 || eventJobs.length > 0) && !order.loadingChecklist) {
        unmetRequirements.push("Loading checklist pending")
      }

      let statusLabel = "Ready for dispatch"
      let tone: EventStaffingAndReadinessSummary["readiness"]["tone"] =
        "success"

      if (
        crewBlockersCount > 0 ||
        openDeficitsCount > 0 ||
        openIncidentsCount > 0 ||
        scheduleConflictsCount > 0
      ) {
        statusLabel = "Needs attention"
        tone = "danger"
      } else if (
        awaitingVerificationJobs > 0 ||
        unresolvedMigrationFlagsCount > 0 ||
        prodRec.status === "not-configured" ||
        prodRec.status === "partial" ||
        teamLeadSummary.status !== "selected" ||
        rosterSummary.status === "not-configured" ||
        scheduledCapacitySummary.status === "not-configured"
      ) {
        statusLabel =
          awaitingVerificationJobs > 0
            ? "Awaiting verification"
            : "Configuration pending"
        tone = "warning"
      } else if (inProductionJobs > 0 || unassignedOrAssignedJobs > 0) {
        statusLabel = "In production"
        tone = "info"
      } else if (order.warehouseClosed) {
        statusLabel = "Closed"
        tone = "success"
      } else if (order.outboundDeparture) {
        statusLabel = "Dispatched"
        tone = "info"
      } else if (manifestIncomplete) {
        statusLabel = "Loading pending"
        tone = "warning"
      }

      return {
        eventId: order.eventId,
        orderId: order.id,
        eventTitle: order.eventTitle,
        venue: order.venue,
        startDateTime: order.startDateTime,
        endDateTime: order.endDateTime,
        pax: order.pax,
        eventStaffingRecommendation: {
          ...guestStaffing,
          displayLabel: `${guestStaffing.rangeLabel} crew (${order.pax} guests)`,
        },
        productionStaffingRecommendation: prodRec,
        rosterSummary,
        teamLeadSummary,
        scheduledCapacitySummary,
        readiness: {
          totalJobs: eventJobs.length,
          readyToLoadJobs,
          awaitingVerificationJobs,
          inProductionJobs,
          unassignedOrAssignedJobs,
          openDeficitsCount,
          crewBlockersCount,
          unresolvedMigrationFlagsCount,
          openIncidentsCount,
          scheduleConflictsCount,
          statusLabel,
          tone,
          unmetRequirements,
        },
      }
    },
  )

  // Build Action Queue across all 7 required categories
  const actionQueue: WarehouseActionQueueItem[] = []
  const orderTitleById = new Map<string, string>(
    state.orderRequests.map((o) => [o.eventId, o.eventTitle]),
  )

  // 1. Awaiting Verification jobs
  for (const job of state.fabricationJobs) {
    if (job.status === "Awaiting Verification") {
      actionQueue.push({
        id: `act-verify-${job.id}`,
        category: "awaiting-verification",
        categoryLabel: "Awaiting Verification",
        severity: "warning",
        title: `${job.spec.name} (${job.spec.requestedQty} requested)`,
        description: `Submitted for verification on ${job.eventTitle}. Inspect against approved specifications and 3-point checklist.`,
        eventId: job.eventId,
        eventTitle: job.eventTitle,
        jobId: job.id,
        targetRoute: "module-verification",
        targetContext: {
          eventId: job.eventId,
          jobId: job.id,
          subView: "verification",
        },
        actionLabel: "Open Verification",
      })
    }
  }

  // 2. Crew-reported blockers
  for (const order of activeOrders) {
    for (const asg of order.crewAssignments) {
      if (asg.taskStatus === "Blocked") {
        actionQueue.push({
          id: `act-blocker-asg-${asg.id}`,
          category: "crew-blocker",
          categoryLabel: "Crew Blocker",
          severity: "danger",
          title: `Blocker reported by ${asg.crewName} (${asg.shiftLabel})`,
          description: asg.blockerReason
            ? `“${asg.blockerReason}”`
            : "Crew task marked Blocked and awaiting Warehouse resolution.",
          eventId: order.eventId,
          eventTitle: order.eventTitle,
          targetRoute: "module-crew-scheduling",
          targetContext: {
            eventId: order.eventId,
            subView: "crew",
          },
          actionLabel: "Open Crew & Scheduling",
        })
      }
    }
  }
  for (const job of state.fabricationJobs) {
    for (const contrib of job.contributions ?? []) {
      if (contrib.blockerReason) {
        actionQueue.push({
          id: `act-blocker-contrib-${contrib.id}`,
          category: "crew-blocker",
          categoryLabel: "Crew Blocker",
          severity: "danger",
          title: `Production blocker on ${job.spec.name} (${contrib.crewName})`,
          description: `“${contrib.blockerReason}”`,
          eventId: job.eventId,
          eventTitle: job.eventTitle,
          jobId: job.id,
          targetRoute: "module-production",
          targetContext: {
            eventId: job.eventId,
            jobId: job.id,
            subView: "production",
          },
          actionLabel: "Open Production",
        })
      }
    }
  }

  // 3. Unconfirmed production windows / missing labor estimates
  for (const job of state.fabricationJobs) {
    if (job.status === "Ready to Load") continue
    const est =
      job.estimatedHoursPerUnitOrSet ?? job.spec.estimatedHoursPerUnitOrSet
    const laborCheck = calculateJobEstimatedLaborHours({
      requestedQty: job.spec.requestedQty,
      estimatedHoursPerUnitOrSet: est,
      estimateBasis: job.estimateBasis ?? job.spec.estimateBasis,
    })
    const win = job.productionWindow
    const windowConfigured =
      Boolean(win?.confirmed) &&
      Boolean(win?.startDate) &&
      Boolean(win?.deadlineDate) &&
      win!.startDate <= win!.deadlineDate &&
      Number(win?.availableProductionDays) > 0

    if (!windowConfigured || !laborCheck.ok) {
      const missingParts: string[] = []
      if (!windowConfigured) missingParts.push("confirmed production window")
      if (!laborCheck.ok) missingParts.push("labor estimate")
      actionQueue.push({
        id: `act-unconfirmed-win-${job.id}`,
        category: "unconfirmed-production-window",
        categoryLabel: "Unconfirmed Production Window",
        severity: "warning",
        title: `${job.spec.name} — Not configured (${missingParts.join(" & ")})`,
        description: `Confirm ${missingParts.join(" and ")} before calculating production crew recommendations.`,
        eventId: job.eventId,
        eventTitle: job.eventTitle,
        jobId: job.id,
        targetRoute: "module-production",
        targetContext: {
          eventId: job.eventId,
          jobId: job.id,
          subView: "production",
        },
        actionLabel: "Open Production",
      })
    }
  }

  // 4 & 5. Overlapping assignments, daily workload warnings, insufficient capacity, and shared-shift staffing shortfalls
  for (let idx = 0; idx < scheduleValidation.conflicts.length; idx++) {
    const conflict = scheduleValidation.conflicts[idx]
    const evtId = conflict.eventId ?? activeOrders[0]?.eventId ?? ""
    const evtTitle = orderTitleById.get(evtId) || "Multi-Event Schedule"

    if (conflict.kind === "shared-shift-understaffed") {
      actionQueue.push({
        id: `act-shared-${idx}-${evtId}-${conflict.jobId ?? "evt"}`,
        category: "shared-shift-shortfall",
        categoryLabel: "Shared-Shift Shortfall",
        severity: "danger",
        title: `Shared-shift simultaneous crew shortfall`,
        description: conflict.message,
        eventId: evtId,
        eventTitle: evtTitle,
        jobId: conflict.jobId,
        targetRoute: "module-crew-scheduling",
        targetContext: {
          eventId: evtId,
          jobId: conflict.jobId,
          subView: "crew",
        },
        actionLabel: "Open Crew & Scheduling",
      })
    } else {
      const labelMap: Record<string, string> = {
        overlap: "Schedule Overlap",
        "daily-workload-exceeded": "Daily Workload > 8h",
        "insufficient-fabrication-capacity": "Scheduled Capacity Shortfall",
        "inactive-account": "Inactive Crew Account",
        "not-in-roster": "Roster Mismatch",
      }
      actionQueue.push({
        id: `act-sched-conflict-${idx}-${conflict.kind}`,
        category: "schedule-workload-conflict",
        categoryLabel: labelMap[conflict.kind] || "Schedule Conflict",
        severity: conflict.kind === "overlap" ? "danger" : "warning",
        title: `${labelMap[conflict.kind] || "Schedule Conflict"}${conflict.crewEmail ? ` — ${conflict.crewEmail}` : ""}`,
        description: conflict.message,
        eventId: evtId,
        eventTitle: evtTitle,
        jobId: conflict.jobId,
        targetRoute: "module-crew-scheduling",
        targetContext: {
          eventId: evtId,
          jobId: conflict.jobId,
          subView: "crew",
        },
        actionLabel: "Open Crew & Scheduling",
      })
    }
  }

  // 6. Unresolved legacy review flags
  const pushFlagItem = (
    flag: MigrationReviewFlag,
    eventId: string,
    eventTitle: string,
    job?: FabricationJob,
  ) => {
    const isVerifyFlag =
      flag.code === "LEGACY_APPROVAL_MISSING_EVIDENCE" ||
      flag.code === "LEGACY_EVIDENCE_NO_EXPLICIT_SUBMISSION"
    const isCrewFlag =
      flag.code === "AUTO_DESIGNATED_TEAM_LEAD" ||
      flag.code === "UNPARSEABLE_SCHEDULE_TEXT"
    const targetRoute = isVerifyFlag
      ? "module-verification"
      : isCrewFlag
        ? "module-crew-scheduling"
        : "module-production"
    const subView: WarehouseSubView = isVerifyFlag
      ? "verification"
      : isCrewFlag
        ? "crew"
        : "production"

    actionQueue.push({
      id: `act-flag-${eventId || "global"}-${job?.id || "evt"}-${flag.id}`,
      category: "legacy-review-flag",
      categoryLabel: "Legacy Review Required",
      severity: flag.blockingActions.length > 0 ? "danger" : "warning",
      title: `${job ? job.spec.name : eventTitle} — ${flag.code.replace(/_/g, " ")}`,
      description: flag.message,
      eventId,
      eventTitle,
      jobId: job?.id,
      targetRoute,
      targetContext: {
        eventId,
        jobId: job?.id,
        subView,
      },
      actionLabel: isVerifyFlag
        ? "Open Verification"
        : isCrewFlag
          ? "Open Crew & Scheduling"
          : "Open Production",
    })
  }

  for (const order of state.orderRequests) {
    for (const flag of order.migrationReviewFlags ?? []) {
      if (!flag.resolvedAt) {
        pushFlagItem(flag, order.eventId, order.eventTitle)
      }
    }
  }
  for (const job of state.fabricationJobs) {
    for (const flag of job.migrationReviewFlags ?? []) {
      if (!flag.resolvedAt) {
        pushFlagItem(flag, job.eventId, job.eventTitle, job)
      }
    }
  }

  // 7. Event stock deficits
  for (const def of state.deficitQueue) {
    if (def.status !== "Fulfilled") {
      actionQueue.push({
        id: `act-deficit-${def.id}`,
        category: "event-stock-deficit",
        categoryLabel: "Event Stock Deficit",
        severity:
          def.urgency === "Critical" || def.urgency === "High"
            ? "danger"
            : "warning",
        title: `${def.assetName} (${def.assetCode}) — Shortage of ${def.shortageQty}`,
        description: `${def.eventTitle} · Status: ${def.status} · Urgency: ${def.urgency}`,
        eventId: def.eventId,
        eventTitle: def.eventTitle,
        targetRoute: "module-replenishment-deficits",
        targetContext: {
          eventId: def.eventId,
          subView: "deficits",
        },
        actionLabel: "Open Replenishment → Deficits",
      })
    }
  }

  const actionCountsByCategory: Record<WarehouseActionQueueCategory, number> = {
    "awaiting-verification": 0,
    "crew-blocker": 0,
    "unconfirmed-production-window": 0,
    "schedule-workload-conflict": 0,
    "shared-shift-shortfall": 0,
    "legacy-review-flag": 0,
    "event-stock-deficit": 0,
  }
  for (const item of actionQueue) {
    actionCountsByCategory[item.category] =
      (actionCountsByCategory[item.category] ?? 0) + 1
  }

  return {
    kpis: {
      activeEvents: activeOrders.length,
      productionJobsInProgress,
      jobsAwaitingVerification,
      scheduleAndWorkloadConflicts,
      legacyRecordsNeedingReview,
      unresolvedLegacyFlagsTotal,
      openStockDeficits,
      totalAssets: state.inventory.length,
      availableAssets: state.inventory.filter((i) => i.availableStock > 0)
        .length,
    },
    scheduleValidation,
    eventSummaries,
    actionQueue,
    actionCountsByCategory,
  }
}
