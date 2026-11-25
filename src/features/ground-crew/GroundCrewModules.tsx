import { useEffect, useState } from "react"
import { ArrowLeft, ClipboardCheck, Hammer } from "lucide-react"
import { Badge, Button, Card } from "../../components/ui/ui"
import { fmtStamp, TabBar } from "../event-manager/shared"
import {
  resolveOperationsRoute,
  setOperationsNavigationContext,
  useOperationsNavigationContext,
  useOperationsStore,
  type GroundCrewOperationView,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../operations/store"
import { OperationsPersistenceBanner } from "../../operations/OperationsPersistenceBanner"
import AssignedWorkModule from "./AssignedWorkModule"
import DispatchLoadingChecksModule from "./DispatchLoadingChecksModule"
import VenueArrivalAndEventHoursModule from "./VenueArrivalAndEventHoursModule"
import EvidenceCaptureModule from "./EvidenceCaptureModule"
import WarehouseArrivalAndReturnAuditModule from "./WarehouseArrivalAndReturnAuditModule"
import {
  getWorkerRelevantOrders,
  isWorkerAssignedToProductionJob,
} from "./ground-crew-shared"

export {
  AssignedWorkModule,
  DispatchLoadingChecksModule,
  VenueArrivalAndEventHoursModule,
  EvidenceCaptureModule,
  WarehouseArrivalAndReturnAuditModule,
}

export function GroundCrewDashboardSummary({
  actor,
  onNavigate,
}: {
  actor: OpsActor
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const email = actor.email.toLowerCase()
  const assignedOrders = getWorkerRelevantOrders(state, email)
  const assignedProductionJobs = state.fabricationJobs.filter((job) =>
    isWorkerAssignedToProductionJob(job, email),
  )
  const hasAssignments = assignedOrders.length > 0 || assignedProductionJobs.length > 0
  const hasScheduledWork =
    assignedProductionJobs.length > 0 ||
    assignedOrders.some(
      (order) =>
        order.crewAssignments.some((a) => a.crewEmail.toLowerCase() === email) ||
        (order.eventAssignments ?? []).some((a) => a.crewEmail.toLowerCase() === email) ||
        order.teamLeadEmail?.toLowerCase() === email,
    )

  return (
    <div className="mb-6 space-y-4">
      <OperationsPersistenceBanner />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">My Work — Production & Events</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasScheduledWork
                ? "See your assigned custom production jobs and event duties, and open event checkpoints."
                : "You are listed on an event roster; scheduled assignments will appear once Warehouse assigns your shifts or production work."}
            </p>
          </div>
          {hasAssignments && (
            <Button
              type="button"
              icon={ClipboardCheck}
              onClick={() =>
                onNavigate("module-my-work", { groundCrewOperation: "overview" })
              }
            >
              Open My Work
            </Button>
          )}
        </div>
        {!hasAssignments ? (
          <div className="border-t border-line px-5 py-5">
            <p className="text-sm font-semibold">No assignments yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your production and event assignments will appear here when Warehouse schedules you.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {assignedProductionJobs.length > 0 && (
              <div className="space-y-2.5 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Production Assignments ({assignedProductionJobs.length})
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {assignedProductionJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {job.spec.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {job.eventTitle} · Qty {job.spec.requestedQty}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
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
                        <Button
                          type="button"
                          variant="outline"
                          icon={Hammer}
                          onClick={() =>
                            onNavigate("module-my-work", {
                              eventId: job.eventId,
                              jobId: job.id,
                              groundCrewOperation: "evidence",
                            })
                          }
                          className="h-7 px-2.5 text-xs"
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ul className="divide-y divide-line">
              {assignedOrders.map((order) => {
                const checkpoints: {
                  title: string
                  status: string
                  op: GroundCrewOperationView
                }[] = [
                  {
                    title: "Dispatch Loading",
                    status: order.loadingChecklist ? "Submitted" : "Pending",
                    op: "loading",
                  },
                  {
                    title: "Venue Arrival",
                    status: order.venueArrival ? "Confirmed" : "Pending",
                    op: "venue-arrival",
                  },
                  {
                    title: "Evidence Capture",
                    status: order.returnChecklist
                      ? "Past"
                      : order.venueArrival
                        ? "Reporting open"
                        : "Available",
                    op: "evidence",
                  },
                  {
                    title: "Warehouse Return",
                    status: order.returnChecklist
                      ? "Return submitted"
                      : order.warehouseArrival
                        ? "Arrived"
                        : "Pending",
                    op: "return-audit",
                  },
                ]
                return (
                  <li key={order.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold">{order.eventTitle}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {order.venue} · {fmtStamp(order.startDateTime)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.teamLeadEmail?.toLowerCase() === email && (
                          <Badge tone="info">Team Lead</Badge>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            onNavigate("module-my-work", {
                              eventId: order.eventId,
                              groundCrewOperation: "overview",
                            })
                          }
                          className="h-7 px-2.5 text-xs"
                        >
                          View Event in My Work
                        </Button>
                      </div>
                    </div>
                    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {checkpoints.map((checkpoint, index) => (
                        <li key={checkpoint.title} className="min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate("module-my-work", {
                                eventId: order.eventId,
                                groundCrewOperation: checkpoint.op,
                              })
                            }
                            className="w-full rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:border-fg/30 hover:bg-fg/[0.03]"
                          >
                            <p className="text-xs font-semibold">
                              {index + 1}. {checkpoint.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {checkpoint.status}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}

export default function GroundCrewModulePage({
  moduleKey,
  rawRoute,
  actor,
  onNavigate,
}: {
  moduleKey: string
  rawRoute?: string
  actor: OpsActor
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const navCtx = useOperationsNavigationContext()
  const resolved = resolveOperationsRoute(rawRoute || `module-${moduleKey}`)

  const explicitRouteOp = resolved.isLegacyAlias
    ? resolved.impliedContext.groundCrewOperation
    : rawRoute?.includes("?op=") || rawRoute?.includes("&op=")
      ? resolved.impliedContext.groundCrewOperation
      : undefined

  const [activeOperation, setActiveOperation] = useState<GroundCrewOperationView>(() => {
    return (
      explicitRouteOp ??
      navCtx.groundCrewOperation ??
      resolved.impliedContext.groundCrewOperation ??
      "overview"
    )
  })

  useEffect(() => {
    const nextOp =
      navCtx.groundCrewOperation ??
      explicitRouteOp ??
      resolved.impliedContext.groundCrewOperation ??
      "overview"
    setActiveOperation(nextOp)
  }, [
    rawRoute,
    explicitRouteOp,
    resolved.impliedContext.groundCrewOperation,
    navCtx.groundCrewOperation,
    navCtx.updatedAt,
  ])

  const selectOperation = (op: GroundCrewOperationView) => {
    setActiveOperation(op)
    setOperationsNavigationContext({ groundCrewOperation: op }, { merge: true })
  }

  const renderModule = () => {
    switch (activeOperation) {
      case "loading":
        return (
          <DispatchLoadingChecksModule
            actor={actor}
            initialEventId={navCtx.eventId}
            onNavigate={onNavigate}
          />
        )
      case "venue-arrival":
        return (
          <VenueArrivalAndEventHoursModule
            actor={actor}
            initialEventId={navCtx.eventId}
            onNavigate={onNavigate}
          />
        )
      case "evidence":
        return (
          <EvidenceCaptureModule
            actor={actor}
            initialEventId={navCtx.eventId}
            initialJobId={navCtx.jobId}
          />
        )
      case "return-audit":
        return (
          <WarehouseArrivalAndReturnAuditModule
            actor={actor}
            initialEventId={navCtx.eventId}
          />
        )
      case "overview":
      default:
        return (
          <AssignedWorkModule
            actor={actor}
            initialEventId={navCtx.eventId}
            onNavigate={onNavigate}
          />
        )
    }
  }

  return (
    <div className="space-y-4">
      <OperationsPersistenceBanner />
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabBar
            label="My Work contextual event operations"
            idPrefix="gc-my-work-op"
            value={activeOperation}
            onChange={selectOperation}
            tabs={[
              { key: "overview", label: "My Work (Production & Events)" },
              { key: "loading", label: "1. Loading Checks" },
              { key: "venue-arrival", label: "2. Venue Arrival" },
              { key: "evidence", label: "3. Evidence Capture" },
              { key: "return-audit", label: "4. Return Audit" },
            ]}
          />
          {activeOperation !== "overview" && (
            <Button
              type="button"
              variant="ghost"
              icon={ArrowLeft}
              onClick={() => selectOperation("overview")}
              className="h-8 px-2.5 text-xs"
            >
              Back to My Work
            </Button>
          )}
        </div>
      </Card>
      {renderModule()}
    </div>
  )
}
