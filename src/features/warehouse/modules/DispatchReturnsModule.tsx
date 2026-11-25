import { useEffect, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Plus,
  ShieldAlert,
  Truck,
} from "lucide-react"
import Modal from "../../../components/overlay/Modal"
import { Badge, Button, Card, Field, Input, PageHeader, cx } from "../../../components/ui/ui"
import { TabBar, Visual, fmtStamp, textareaCls } from "../../event-manager/shared"
import {
  advanceDispatchBatchStage,
  cancelDispatchBatch,
  closeWarehouseEventAccountability,
  confirmOutboundDeparture,
  createDispatchBatch,
  getEventDispatchBatchBalances,
  getEventManifestLines,
  getOperationsPersistenceWarning,
  isBatchOutboundInTransit,
  isBatchReturnInTransit,
  isBatchReturnPhase,
  OPERATIONS_PERSISTENCE_WARNING_TEXT,
  reconcileLegacyReturnManually,
  resolveRentalDiscrepancy,
  retryPersistOperationsStore,
  setOperationsNavigationContext,
  setWarehouseSelectedEventId,
  updateDispatchBatchDetails,
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
  type WarehouseSubView,
} from "../../../operations/store"
import type {
  DispatchBatchDirection,
  DispatchBatchRecord,
  IssueResolutionType,
} from "../../../operations/types"
import { deriveAssetUsageHistoryFromStore } from "./asset-history"
import { RESOLUTION_OPTIONS, notifyMutationResult, useNotify } from "../warehouse-shared"

import DispatchWorkspace, { DispatchDirectory, type DispatchSelection } from "./DispatchWorkspace"

function openManifestPrintWindow(title: string, subtitle: string, rows: { code: string; name: string; planned: number; actual: number; status: string }[]) {
  if (typeof window === "undefined") return
  const w = window.open("", "_blank", "width=900,height=700")
  if (!w) return
  w.opener = null
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  const bodyRows = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td style="text-align:right">${r.planned}</td><td style="text-align:right">${r.actual}</td><td>${escapeHtml(r.status)}</td></tr>`,
    )
    .join("")
  w.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{font-size:12px;color:#555;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><table><thead><tr><th>Code</th><th>Item</th><th style="text-align:right">Planned</th><th style="text-align:right">Actual</th><th>Status</th></tr></thead><tbody>${bodyRows}</tbody></table></body></html>`)
  w.document.close()
  w.focus()
  w.print()
}

export type DispatchSubTabKey = "manifest" | "transport" | "returns"

function mapSubViewToTab(subView?: WarehouseSubView): DispatchSubTabKey {
  if (subView === "transport") return "transport"
  if (subView === "returns" || subView === "incidents") return "returns"
  return "manifest"
}

export default function DispatchReturnsModule({
  actor,
  initialEventId,
  initialSubView,
  navUpdatedAt,
  embedded = false,
  onNavigate,
}: {
  actor: OpsActor
  initialEventId?: string
  initialSubView?: WarehouseSubView
  navUpdatedAt?: number
  embedded?: boolean
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()

  const [selectedEventId, setSelectedEventId] = useState(initialEventId)
  const [activeTab, setActiveTab] = useState<DispatchSubTabKey>(() =>
    mapSubViewToTab(initialSubView),
  )

  useEffect(() => {
    setSelectedEventId(initialEventId)
    setWorkspaceBatchId(null)
    setCreateBatchDir(null)
  }, [initialEventId, navUpdatedAt])

  useEffect(() => {
    if (initialSubView) {
      setActiveTab(mapSubViewToTab(initialSubView))
    }
  }, [initialSubView])
  // Outbound departure inputs
  const [vehiclePlate, setVehiclePlate] = useState("NGA-4821 (Lumière Box Truck 02)")
  const [driverName, setDriverName] = useState("R. Santos")
  const [departureNotes, setDepartureNotes] = useState("")

  // Returns, rental discrepancy, & closeout state
  const [closeoutNotes, setCloseoutNotes] = useState("")
  const [resDrafts, setResDrafts] = useState<
    Record<string, { type: IssueResolutionType; notes: string }>
  >({})
  const [legacyReconDrafts, setLegacyReconDrafts] = useState<
    Record<string, { qty: string; reason: string }>
  >({})

  // Standalone Dispatch & Returns state (filters, modals)
  const [workspaceBatchId, setWorkspaceBatchId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [directionFilter, setDirectionFilter] = useState<string>("all")
  const [reconcileFilter, setReconcileFilter] = useState<string>("all")

  const [createBatchDir, setCreateBatchDir] = useState<DispatchBatchDirection | null>(null)
  const [batchVehicleType, setBatchVehicleType] = useState("")
  const [batchPlateNumber, setBatchPlateNumber] = useState("")
  const [batchDriverName, setBatchDriverName] = useState("")
  const [batchSelectedQtyByLine, setBatchSelectedQtyByLine] = useState<Record<string, number>>({})

  const [batchToDelete, setBatchToDelete] = useState<DispatchBatchRecord | null>(null)

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const eventEntries: DispatchSelection[] = []

  if (!embedded && !selectedEventId) {
    for (const candidate of state.orderRequests) {
      const lines = getEventManifestLines(state, candidate.eventId)
      const hasShortfall = lines.some((line) => line.loadedQty < line.plannedQty || line.blockedByLegacyReview)
      const hasIncident = state.incidentReports.some(
        (report) => report.eventId === candidate.eventId && report.resolutionStatus !== "Resolved",
      )
      if (reconcileFilter === "reconciled") {
        if (hasShortfall || hasIncident || !candidate.warehouseClosed) continue
      } else if (candidate.warehouseClosed) {
        continue
      }
      if (reconcileFilter === "attention" && !hasShortfall && !hasIncident) continue

      const matchesEvent = (candidate.eventTitle + " " + candidate.id + " " + candidate.venue)
        .toLowerCase().includes(normalizedQuery)
      const matchingBatches = (candidate.dispatchBatches ?? []).filter((batch) => {
        if (batch.deletedAt) return false
        if (stageFilter !== "all") {
          const matchesStage =
            batch.stage === stageFilter ||
            (stageFilter === "Outbound in transit" && isBatchOutboundInTransit(batch)) ||
            (stageFilter === "Return in transit" && isBatchReturnInTransit(batch))
          if (!matchesStage) return false
        }
        if (directionFilter === "outbound" && isBatchReturnPhase(batch)) return false
        if (directionFilter === "return" && !isBatchReturnPhase(batch)) return false
        return matchesEvent || (
          batch.id + " " +
          batch.vehicleType + " " +
          batch.plateNumber + " " +
          batch.driverName + " " +
          (batch.returnVehicleType ?? "") + " " +
          (batch.returnPlateNumber ?? "") + " " +
          (batch.returnDriverName ?? "")
        ).toLowerCase().includes(normalizedQuery)
      })

      const isFilteringBatches = stageFilter !== "all" || directionFilter !== "all"
      if (!matchingBatches.length && (isFilteringBatches || !matchesEvent)) continue
      const needsAttention = hasShortfall || hasIncident
      const planned = lines.reduce((total, line) => total + line.plannedQty, 0)
      const loaded = lines.reduce((total, line) => total + Math.min(line.loadedQty, line.plannedQty), 0)
      eventEntries.push({ order: candidate, needsAttention, loadingPercent: planned ? Math.round(loaded / planned * 100) : 0 })
    }
  }

  if (!embedded && !selectedEventId) {
    return (
      <div className="min-w-0 space-y-6">
        <PageHeader
          crumbs={["Dashboard", "Dispatch & Returns"]}
          title="Dispatch & Returns"
          subtitle="Dispatch manifests, vehicle assignments, and transit checkpoints."
        />
        <DispatchDirectory
          query={searchQuery}
          onQueryChange={setSearchQuery}
          filters={[
            {
              label: "Dispatch stage",
              value: stageFilter,
              onChange: setStageFilter,
              options: [
                ["all", "All stages"],
                ["Planned", "Planned"],
                ["Loaded", "Loaded"],
                ["Outbound in transit", "Outbound in transit"],
                ["Delivered", "Delivered"],
                ["Return loading", "Return loading"],
                ["Return in transit", "Return in transit"],
                ["Returned", "Returned"],
                ["Cancelled", "Cancelled"],
              ],
            },
            {
              label: "Direction",
              value: directionFilter,
              onChange: setDirectionFilter,
              options: [["all", "All directions"], ["outbound", "Outbound"], ["return", "Return"]],
            },
            {
              label: "Reconciliation",
              value: reconcileFilter,
              onChange: setReconcileFilter,
              options: [["all", "All reconciliation"], ["attention", "Needs attention"], ["reconciled", "Reconciled / closed"]],
            },
          ]}
          entries={eventEntries}
          onSelect={(entry) => {
            setSelectedEventId(entry.order.eventId)
            setWarehouseSelectedEventId(entry.order.eventId)
            setWorkspaceBatchId(entry.batch?.id ?? null)
          }}
        />
      </div>
    )
  }

  const leaveWorkspace = () => {
    setSelectedEventId(undefined)
    if (!embedded) {
      setWarehouseSelectedEventId("")
      setOperationsNavigationContext({ eventId: undefined, subView: undefined }, { merge: true })
    }
    setWorkspaceBatchId(null)
    setCreateBatchDir(null)
    setDepartureNotes("")
    setCloseoutNotes("")
    setResDrafts({})
  }

  const order = state.orderRequests.find((candidate) => candidate.eventId === (embedded ? initialEventId : selectedEventId))
  if (!order) {
    return (
      <div className="space-y-4">
        <Card className="p-8 text-center text-muted-foreground">Event order record not found.</Card>
        {!embedded && <Button type="button" variant="outline" icon={ArrowLeft} onClick={leaveWorkspace}>Back to dispatch list</Button>}
      </div>
    )
  }

  const manifestLines = getEventManifestLines(state, order.eventId)
  const totalPlanned = manifestLines.reduce((sum, l) => sum + l.plannedQty, 0)
  const totalLoaded = manifestLines.reduce((sum, l) => sum + l.loadedQty, 0)
  const outboundReturnLines = manifestLines.filter((l) => l.loadedQty > 0)
  const uncountedReturnLines = outboundReturnLines.filter(
    (l) => !l.returnCounted || l.legacyReturnUncertain,
  )
  const totalReturned = manifestLines.reduce(
    (sum, l) =>
      sum + ((l.returnCounted || l.returnedQty > 0) && !l.legacyReturnUncertain ? l.returnedQty : 0),
    0,
  )
  const loadingProgressPct =
    totalPlanned > 0 ? Math.min(100, Math.round((totalLoaded / totalPlanned) * 100)) : 0
  const shortfalls = manifestLines.filter((l) => l.loadedQty < l.plannedQty)
  const legacyBlockedLines = manifestLines.filter((l) => l.blockedByLegacyReview)

  const eventIncidents = state.incidentReports.filter((r) => r.eventId === order.eventId)
  const openEventIncidentsCount = eventIncidents.filter(
    (r) => r.resolutionStatus !== "Resolved",
  ).length
  const pendingReconCount = eventIncidents.filter(
    (r) => r.needsWarehouseInventoryReconciliation === true,
  ).length
  const firstActionableIncident =
    eventIncidents.find(
      (r) => r.resolutionStatus !== "Resolved" || r.needsWarehouseInventoryReconciliation,
    ) ?? eventIncidents[0]
  const openRentalDiscCount = order.rentals.filter(
    (r) =>
      (r.venueReceipt?.hasDiscrepancy && r.venueReceipt.resolutionStatus !== "Resolved") ||
      (r.supplierReturn?.hasDiscrepancy && r.supplierReturn.resolutionStatus !== "Resolved"),
  ).length

  const dutyAssignments = order.eventAssignments ?? []
  const dutySchedules = order.eventSchedules ?? []
  const dutyContributions = order.eventContributions ?? []
  const eventBatches = (order.dispatchBatches ?? []).filter((batch) => !batch.deletedAt)
  const selectedBatch = eventBatches.find((batch) => batch.id === workspaceBatchId)
  const eventBalances = getEventDispatchBatchBalances(state, order.eventId)

  const openCreateBatchModal = (dir: DispatchBatchDirection) => {
    setCreateBatchDir(dir)
    setBatchVehicleType("")
    setBatchPlateNumber("")
    setBatchDriverName("")
    setBatchSelectedQtyByLine({})
  }

  const exportManifest = (batch?: DispatchBatchRecord) => {
    if (batch) {
      const inReturn = isBatchReturnPhase(batch)
      const outboundSummary = `Outbound: ${batch.vehicleType} (${batch.plateNumber}) · Driver: ${batch.driverName}`
      const returnSummary = inReturn
        ? ` | Return: ${batch.returnVehicleType ?? batch.vehicleType} (${batch.returnPlateNumber ?? batch.plateNumber}) · Driver: ${batch.returnDriverName ?? batch.driverName}`
        : ""
      openManifestPrintWindow(
        order.eventTitle + " — Trip " + batch.id,
        outboundSummary + returnSummary,
        batch.items.map((item) => ({
          code: item.itemCode,
          name: item.name,
          planned: inReturn && batch.direction === "outbound" ? (item.returnPlannedQty ?? item.actualQty ?? item.plannedQty) : item.plannedQty,
          actual: inReturn && batch.direction === "outbound" ? (item.returnActualQty ?? 0) : item.actualQty,
          status: batch.stage,
        })),
      )
      return
    }

    openManifestPrintWindow(
      order.eventTitle + " — Full Event Manifest",
      order.id + " · " + (order.venue || "Not configured"),
      manifestLines.map((line) => ({
        code: line.code,
        name: line.name,
        planned: line.plannedQty,
        actual: line.loadedQty,
        status: line.blockedByLegacyReview
          ? "Migration Hold"
          : line.loadedQty >= line.plannedQty
            ? "Loaded"
            : "Shortfall / Pending",
      })),
    )
  }

  const renderDispatchWorkspace = () => (
    <DispatchWorkspace
      key={order.eventId}
      order={order}
      batches={eventBatches}
      batch={selectedBatch}
      onSelectBatch={setWorkspaceBatchId}
      manifest={manifestLines}
      onMarkLoaded={(batch) => {
        const res = advanceDispatchBatchStage(actor, { eventId: batch.eventId, batchId: batch.id, nextStage: "Loaded" })
        notifyMutationResult(notify, res, "Batch " + batch.id + " marked as loaded.")
      }}
      onMarkInTransit={(batch) => {
        const res = advanceDispatchBatchStage(actor, { eventId: batch.eventId, batchId: batch.id, nextStage: "Outbound in transit" })
        notifyMutationResult(notify, res, "Trip " + batch.id + " marked as outbound in transit.")
      }}
      onMarkDelivered={(batch) => {
        const res = advanceDispatchBatchStage(actor, { eventId: batch.eventId, batchId: batch.id, nextStage: "Delivered" })
        notifyMutationResult(notify, res, "Trip " + batch.id + " marked as delivered.")
      }}
      onStartReturn={(batch) => {
        const res = advanceDispatchBatchStage(actor, { eventId: batch.eventId, batchId: batch.id, nextStage: "Return loading" })
        notifyMutationResult(notify, res, "Return loading started for trip " + batch.id + ".")
      }}
      onMarkReturnInTransit={(batch) => {
        const res = advanceDispatchBatchStage(actor, { eventId: batch.eventId, batchId: batch.id, nextStage: "Return in transit" })
        notifyMutationResult(notify, res, "Trip " + batch.id + " marked as return in transit.")
      }}
      onMarkReturned={(batch) => {
        const res = advanceDispatchBatchStage(actor, { eventId: batch.eventId, batchId: batch.id, nextStage: "Returned" })
        notifyMutationResult(notify, res, "Trip " + batch.id + " marked as returned.")
      }}
      onUpdateBatch={(batch, patch) => {
        const res = updateDispatchBatchDetails(actor, {
          eventId: order.eventId,
          batchId: batch.id,
          vehicleType: patch.vehicleType,
          plateNumber: patch.plateNumber,
          driverName: patch.driverName,
          handoffNotes: patch.handoffNotes,
        }) as { ok: true; savedToStorage?: boolean; persistenceWarning?: string } | { ok: false; error: string }
        notifyMutationResult(notify, res, res.ok ? `Batch ${batch.id} updated.` : "")
        if (!res.ok) return { status: "error", error: res.error }
        if (res.savedToStorage === false || getOperationsPersistenceWarning()) {
          return {
            status: "pending",
            error: res.persistenceWarning || getOperationsPersistenceWarning() || OPERATIONS_PERSISTENCE_WARNING_TEXT,
          }
        }
        return { status: "saved" }
      }}
      onRetryPersistBatch={(batch) => {
        const res = retryPersistOperationsStore()
        if (!res.ok) {
          notify(res.error)
          return { status: "pending", error: res.error }
        }
        notify(`Batch ${batch.id} updated.`)
        return { status: "saved" }
      }}
      onDeleteBatch={setBatchToDelete}
      onExport={() => exportManifest(selectedBatch)}
    />
  )

  const renderEventManifestAndReturnsControls = (sectionFilter?: "manifest" | "transport" | "returns") => {
    const showTab = sectionFilter ?? activeTab
    return (
      <>
        {/* ─── SUBVIEW A: EVENT MANIFEST & LOADING ─── */}
        {showTab === "manifest" && (
          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Combined Dispatch Manifest &amp; Loading Progress ({manifestLines.length} lines)
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Combines allocated stock lines and verified <strong>Ready to Load</strong> custom
                    assets without duplicate lines or stale quantities. Planned, loaded, and returned
                    counts remain distinct.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">
                    Loaded: {totalLoaded} / {totalPlanned} ({loadingProgressPct}%)
                  </Badge>
                  {legacyBlockedLines.length > 0 && (
                    <Badge tone="danger">
                      {legacyBlockedLines.length} Legacy Review Blocker(s)
                    </Badge>
                  )}
                </div>
              </div>

              {/* Loading Progress Bar */}
              <div className="space-y-1">
                <div
                  role="progressbar"
                  aria-label="Manifest loading progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={loadingProgressPct}
                  className="h-2 w-full overflow-hidden rounded-full bg-elev"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${shortfalls.length === 0 && totalPlanned > 0
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                      }`}
                    style={{ width: `${loadingProgressPct}%` }}
                  />
                </div>
              </div>

              {legacyBlockedLines.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-xs">
                  <div className="space-y-1 text-danger">
                    <div className="flex items-center gap-1.5 font-bold">
                      <ShieldAlert className="size-4 shrink-0" />
                      <span>
                        New Loading Sign-Off Blocked Pending Warehouse Migration Review (
                        {legacyBlockedLines.length})
                      </span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 text-foreground">
                      {legacyBlockedLines.map((l) => (
                        <li key={l.lineId}>
                          <strong>{l.name}:</strong> {l.legacyReviewReason || "Unresolved legacy review"}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      onNavigate("module-crew-scheduling", {
                        eventId: order.eventId,
                        subView: "crew",
                      })
                    }
                  >
                    Resolve in Crew &amp; Scheduling
                  </Button>
                </div>
              )}

              {manifestLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No stock allocations or verified Ready to Load custom items are released onto the
                  manifest yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line uppercase tracking-wider text-muted-foreground">
                        <th className="py-2.5 pr-3">Item &amp; Source</th>
                        <th className="py-2.5 pr-3 text-right">Req.</th>
                        <th className="py-2.5 pr-3 text-right">Alloc.</th>
                        <th className="py-2.5 pr-3 text-right">Planned</th>
                        <th className="py-2.5 pr-3 text-right">Loaded</th>
                        <th className="py-2.5 pr-3 text-right">Shortfall</th>
                        <th className="py-2.5 pr-3 text-right">Returned</th>
                        <th className="py-2.5">Gate / Line Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {manifestLines.map((line) => {
                        const stockRec = order.stockLines.find((s) => s.assetId === line.sourceId)
                        return (
                          <tr key={line.lineId}>
                            <td className="py-3 pr-3">
                              <div className="font-semibold text-foreground">{line.name}</div>
                              <div className="text-muted-foreground">
                                <span className="font-mono">{line.code}</span> ·{" "}
                                {line.sourceType === "custom" ? "Custom Fabrication" : "Stock Asset"}
                              </div>
                            </td>
                            <td className="py-3 pr-3 text-right tabular-nums">
                              {stockRec?.approvedRequestedQty ?? line.plannedQty}
                            </td>
                            <td className="py-3 pr-3 text-right tabular-nums">
                              {stockRec?.allocatedQty ?? line.plannedQty}
                            </td>
                            <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                              {line.plannedQty} {line.unit}
                            </td>
                            <td className="py-3 pr-3 text-right font-semibold tabular-nums text-foreground">
                              {line.loadedQty}
                            </td>
                            <td className="py-3 pr-3 text-right font-bold tabular-nums text-danger">
                              {line.shortfallQty}
                            </td>
                            <td className="py-3 pr-3 text-right tabular-nums">
                              {line.returnedQty}
                            </td>
                            <td className="py-3">
                              {line.blockedByLegacyReview ? (
                                <Badge tone="danger">Blocked: Legacy Review</Badge>
                              ) : line.shortfallQty > 0 ? (
                                <Badge tone="warning">
                                  Loading Shortfall ({line.shortfallQty})
                                </Badge>
                              ) : (
                                <Badge tone="success">Full Load Verified</Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Team Lead Sign-off + Warehouse Outbound Departure */}
              <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2 text-xs">
                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-2">
                  <div className="font-semibold text-foreground">
                    1. Team Lead Final Loading Checklist (Ground Crew Ownership)
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
                    <p className="text-muted-foreground">
                      Only the designated Event Team Lead (
                      <strong className="text-foreground">
                        {order.teamLeadName || "Not selected"}
                      </strong>
                      ) can submit the Loading Checklist once shortfalls and legacy blockers are 0.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3">
                  <div className="font-semibold text-foreground">
                    2. Warehouse Outbound Vehicle Departure Confirmation
                  </div>
                  {order.outboundDeparture ? (
                    <div className="space-y-1 text-muted-foreground">
                      <div>
                        <Badge tone="success">Outbound Departure Confirmed</Badge> by{" "}
                        <strong className="text-foreground">
                          {order.outboundDeparture.confirmedByName}
                        </strong>{" "}
                        at {fmtStamp(order.outboundDeparture.confirmedAt)}
                      </div>
                      <div>
                        Vehicle:{" "}
                        <strong className="text-foreground">
                          {order.outboundDeparture.vehiclePlate}
                        </strong>{" "}
                        · Driver:{" "}
                        <strong className="text-foreground">
                          {order.outboundDeparture.driverName}
                        </strong>
                      </div>
                      <div>Notes: “{order.outboundDeparture.notes}”</div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
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
                        placeholder="Outbound gate clearance remarks…"
                      />
                      <Button
                        type="button"
                        icon={Truck}
                        disabled={
                          !order.loadingChecklist ||
                          shortfalls.length > 0 ||
                          legacyBlockedLines.length > 0
                        }
                        onClick={() => {
                          const res = confirmOutboundDeparture(actor, order.eventId, {
                            vehiclePlate,
                            driverName,
                            notes: departureNotes,
                          })
                          notifyMutationResult(
                            notify,
                            res,
                            res.ok && res.alreadyConfirmed
                              ? `Outbound departure for ${order.eventTitle} was already confirmed earlier.`
                              : `Confirmed outbound vehicle departure for ${order.eventTitle}.`,
                          )
                        }}
                      >
                        Confirm Outbound Departure
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ─── SUBVIEW B: TRANSPORT, SETUP & DISMANTLING ─── */}
        {showTab === "transport" && (
          <div className="space-y-6">
            {/* Checkpoint Records (Factual Only — No Fabricated Timestamps) */}
            <Card className="p-6 space-y-4">
              <h3 className="text-base font-bold text-foreground">
                Transport &amp; Venue Arrival Checkpoints (Factual Records)
              </h3>
              <div className="grid gap-4 md:grid-cols-2 text-xs">
                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-1.5">
                  <div className="font-semibold text-foreground">Outbound Warehouse Departure</div>
                  {order.outboundDeparture ? (
                    <div className="space-y-1 text-muted-foreground">
                      <div>
                        <Badge tone="success">Confirmed</Badge> by{" "}
                        <strong className="text-foreground">
                          {order.outboundDeparture.confirmedByName}
                        </strong>{" "}
                        at {fmtStamp(order.outboundDeparture.confirmedAt)}
                      </div>
                      <div>
                        Vehicle: {order.outboundDeparture.vehiclePlate} · Driver:{" "}
                        {order.outboundDeparture.driverName}
                      </div>
                      <div>Notes: “{order.outboundDeparture.notes}”</div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Not departed yet (pending Team Lead loading checklist and Warehouse gate release).
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-1.5">
                  <div className="font-semibold text-foreground">Venue Arrival Confirmation</div>
                  {order.venueArrival ? (
                    <div className="flex items-start gap-3">
                      <Visual
                        src={order.venueArrival.photoUrl}
                        label="Venue arrival photo"
                        className="size-16 shrink-0 rounded-md"
                      />
                      <div className="space-y-1 text-muted-foreground">
                        <div>
                          <Badge tone="success">Arrived at Venue</Badge> by{" "}
                          <strong className="text-foreground">
                            {order.venueArrival.submittedByName}
                          </strong>{" "}
                          at {fmtStamp(order.venueArrival.submittedAt)}
                        </div>
                        <div>Notes: “{order.venueArrival.notes}”</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Venue arrival photo not yet recorded by Event Team Lead.
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Direct-to-Venue Rental Delivery & Receipts */}
            <Card className="p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    External Rental Delivery &amp; Venue Receipts ({order.rentals.length})
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Supplier e-letter confirmations and direct-to-venue receipts recorded for{" "}
                    {order.eventTitle}.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  icon={ArrowRight}
                  onClick={() =>
                    onNavigate("module-events", {
                      eventId: order.eventId,
                      subView: "orders",
                    })
                  }
                >
                  Manage Rental E-Letters in Events
                </Button>
              </div>

              {order.rentals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No external supplier rentals attached to this event.
                </p>
              ) : (
                <div className="space-y-3 text-xs">
                  {order.rentals.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {r.vendorName} — {r.itemName} (Qty {r.ApprovedRequestedQty})
                        </span>
                        <Badge
                          tone={r.confirmationStatus === "Confirmed" ? "success" : "warning"}
                        >
                          {r.confirmationStatus}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        Booking Ref:{" "}
                        <strong className="text-foreground">
                          {r.bookingReference || "Not entered"}
                        </strong>{" "}
                        · Delivery Mode:{" "}
                        <strong className="text-foreground">
                          {r.directToVenue ? "Direct-to-Venue" : "Via Warehouse"}
                        </strong>
                      </div>
                      <div className="text-muted-foreground">
                        Venue Receipt:{" "}
                        {r.venueReceipt
                          ? `${r.venueReceipt.deliveredQty}/${r.ApprovedRequestedQty} delivered — Verified by ${r.venueReceipt.verifiedByName} (${fmtStamp(r.venueReceipt.verifiedAt)})`
                          : "Not yet confirmed at venue"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Per-Duty Setup, Event Support & Dismantling Assignments + Schedules */}
            <Card className="p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Per-Duty Event Operations: Loading, Setup, Event Support &amp; Dismantling
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Each operational duty retains its own assignment ID, phase, instructions, linked
                    Asia/Manila schedules, progress, and independent completion status.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onNavigate("module-crew-scheduling", {
                      eventId: order.eventId,
                      subView: "crew",
                    })
                  }
                >
                  Adjust Shifts in Crew &amp; Scheduling
                </Button>
              </div>

              {dutyAssignments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No structured per-duty event-operation assignments scheduled yet.
                </p>
              ) : (
                <div className="space-y-3 text-xs">
                  {dutyAssignments.map((asg) => {
                    const linked = dutySchedules.filter((s) => s.assignmentId === asg.id)
                    const logs = dutyContributions.filter((c) => c.assignmentId === asg.id)
                    const dutyLabel = asg.phase ?? asg.activityType ?? "event-ops"
                    return (
                      <div
                        key={asg.id}
                        className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {asg.id}
                            </span>
                            <span className="font-bold text-sm text-foreground">{asg.crewName}</span>
                            <Badge tone="neutral">Duty: {dutyLabel}</Badge>
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
                          </div>
                          <span className="text-muted-foreground">
                            {linked.length} Shift(s) · {logs.length} Contribution Log(s)
                          </span>
                        </div>
                        <p className="text-muted-foreground">
                          Instructions: <strong className="text-foreground">{asg.instructions}</strong>
                        </p>
                        {linked.length > 0 && (
                          <ul className="space-y-1 text-muted-foreground">
                            {linked.map((s) => (
                              <li key={s.id} className="font-mono">
                                • {s.startDateTime.replace("T", " ")} →{" "}
                                {s.endDateTime.replace("T", " ")} ({s.plannedProductiveHours}h ·{" "}
                                {s.status})
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {order.crewAssignments.length > 0 && (
                <details className="border-t border-line pt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold text-foreground">
                    Preserved Legacy Event Crew Records ({order.crewAssignments.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {order.crewAssignments.map((a) => (
                      <li key={a.id}>
                        • <strong>{a.crewName}</strong> ({a.taskStatus}) — {a.duties}
                        {a.legacyScheduleText ? ` · Legacy schedule: “${a.legacyScheduleText}”` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          </div>
        )}

        {/* ─── SUBVIEW C: RETURNS, DAMAGE & CLOSEOUT ─── */}
        {showTab === "returns" && (
          <div className="space-y-6">
            {/* Post-Event Return Quantities & Discrepancy Comparison */}
            <Card className="p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Return Verification, Discrepancies &amp; Warehouse Accountability Closeout
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Warehouse can close accountability only after Team Lead Return Checklist
                    submission and documented resolution of every missing/damage report and rental
                    discrepancy.
                  </p>
                </div>
                <Badge tone={order.warehouseClosed ? "success" : "warning"}>
                  {order.warehouseClosed
                    ? `Closed by ${order.closedByName} (${fmtStamp(order.closedAt!)})`
                    : "Warehouse Accountability Open"}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-line bg-fg/[0.02] p-3.5">
                  <div className="font-semibold text-foreground">Warehouse Arrival Confirmation</div>
                  {order.warehouseArrival ? (
                    <div className="mt-1 text-muted-foreground">
                      Confirmed by{" "}
                      <strong className="text-foreground">
                        {order.warehouseArrival.submittedByName}
                      </strong>{" "}
                      at {fmtStamp(order.warehouseArrival.submittedAt)}
                    </div>
                  ) : (
                    <div className="mt-1 text-muted-foreground">
                      Awaiting Team Lead arrival photo at warehouse.
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-line bg-fg/[0.02] p-3.5">
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
                    <div className="mt-1 text-muted-foreground">
                      Pending submission by Event Team Lead.
                    </div>
                  )}
                </div>
              </div>

              {/* Distinct Outbound vs Returned Comparison Table */}
              {manifestLines.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3 text-right">Loaded Outbound</th>
                        <th className="py-2 pr-3 text-right">Returned</th>
                        <th className="py-2 pr-3 text-right">Missing / Variance</th>
                        <th className="py-2">Asset History Classification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {manifestLines.map((line) => {
                        const invMatch = state.inventory.find((i) => i.assetId === line.sourceId)
                        const histRec = invMatch
                          ? deriveAssetUsageHistoryFromStore(
                            invMatch,
                            [order],
                            state.incidentReports,
                          )[0]
                          : undefined
                        const isCounted = Boolean(line.returnCounted)
                        const isUncertainLegacy = Boolean(line.legacyReturnUncertain)
                        const isPendingReturn =
                          !isUncertainLegacy && !isCounted && line.returnedQty === 0 && line.loadedQty > 0
                        const variance =
                          isUncertainLegacy || isPendingReturn
                            ? null
                            : Math.max(0, line.loadedQty - line.returnedQty)
                        return (
                          <tr key={line.lineId}>
                            <td className="py-2.5 pr-3 font-semibold text-foreground">{line.name}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">
                              {line.loadedQty} {line.unit}
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">
                              {isUncertainLegacy ? (
                                <Badge tone="warning">Uncertain Legacy Count</Badge>
                              ) : isPendingReturn ? (
                                <Badge tone="warning">Not counted yet</Badge>
                              ) : isCounted && line.returnedQty === 0 ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span>0 {line.unit}</span>
                                  <Badge tone="danger">Confirmed 0</Badge>
                                </span>
                              ) : (
                                `${line.returnedQty} ${line.unit}`
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums font-bold text-danger">
                              {variance === null ? (
                                <span className="text-muted-foreground font-normal">
                                  {isUncertainLegacy ? "Uncertain" : "Pending count"}
                                </span>
                              ) : (
                                variance
                              )}
                            </td>
                            <td className="py-2.5">
                              {histRec ? (
                                <Badge tone={histRec.statusTone}>
                                  {histRec.usageKind === "confirmed"
                                    ? `Confirmed · ${histRec.statusLabel}`
                                    : `Reservation · ${histRec.statusLabel}`}
                                </Badge>
                              ) : (
                                <Badge tone="neutral">Custom Manifest Line</Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    Total Loaded: {totalLoaded} · Total Counted Returned: {totalReturned} (
                    {outboundReturnLines.length - uncountedReturnLines.length}/
                    {outboundReturnLines.length} outbound lines verified)
                  </div>
                  {!order.warehouseClosed && legacyBlockedLines.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
                      <div className="font-semibold text-foreground">
                        Manual Legacy Return Reconciliation ({legacyBlockedLines.length})
                      </div>
                      {legacyBlockedLines.map((line) => {
                        const lrDraft = legacyReconDrafts[line.sourceId] ?? {
                          qty: String(line.returnedQty),
                          reason: "",
                        }
                        return (
                          <div key={line.lineId} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,1.4fr)_auto] items-end pt-1">
                            <div>
                              <div className="font-medium text-foreground">{line.name}</div>
                              <div className="text-[11px] text-muted-foreground">
                                Outbound: {line.loadedQty} · Legacy returned: {line.returnedQty}
                              </div>
                            </div>
                            <Field label="Verified Qty">
                              <Input
                                type="number"
                                min={0}
                                max={line.loadedQty}
                                value={lrDraft.qty}
                                onChange={(e) =>
                                  setLegacyReconDrafts({
                                    ...legacyReconDrafts,
                                    [line.sourceId]: { ...lrDraft, qty: e.target.value },
                                  })
                                }
                              />
                            </Field>
                            <Field label="Reconciliation Reason">
                              <Input
                                value={lrDraft.reason}
                                onChange={(e) =>
                                  setLegacyReconDrafts({
                                    ...legacyReconDrafts,
                                    [line.sourceId]: { ...lrDraft, reason: e.target.value },
                                  })
                                }
                                placeholder="Document physical count verification…"
                              />
                            </Field>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const res = reconcileLegacyReturnManually(actor, order.eventId, line.sourceId, {
                                  verifiedQty: Number(lrDraft.qty),
                                  reason: lrDraft.reason,
                                })
                                notifyMutationResult(
                                  notify,
                                  res,
                                  res.ok ? `Reconciled legacy return count for ${line.name}.` : "",
                                )
                              }}
                            >
                              Reconcile
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Damage & Missing Reports Contextual Link */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-fg/[0.02] p-4 text-xs">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-foreground">
                    Damage &amp; Missing Reports ({eventIncidents.length})
                  </div>
                  <div className="text-muted-foreground">
                    {openEventIncidentsCount} pending resolution · {pendingReconCount} pending
                    inventory reconciliation. Review evidence photos, resolve incidents, and
                    complete legacy inventory reconciliation in Damage &amp; Missing Reports.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  icon={ArrowRight}
                  onClick={() =>
                    onNavigate("module-damage-missing-reports", {
                      eventId: order.eventId,
                      ...(firstActionableIncident ? { reportId: firstActionableIncident.id } : {}),
                      subView: "incidents",
                    })
                  }
                >
                  Open Damage &amp; Missing Reports
                </Button>
              </div>

              {/* Rental Handbacks & Discrepancy Settlement */}
              {order.rentals.length > 0 && (
                <div className="space-y-3 border-t border-line pt-4 text-xs">
                  <h4 className="text-sm font-bold text-foreground">
                    External Rental Handback &amp; Reconciliation ({order.rentals.length})
                  </h4>
                  {order.rentals.map((r) => {
                    const receiptDisc =
                      r.venueReceipt?.hasDiscrepancy &&
                      r.venueReceipt.resolutionStatus !== "Resolved"
                    const returnDisc =
                      r.supplierReturn?.hasDiscrepancy &&
                      r.supplierReturn.resolutionStatus !== "Resolved"
                    const key = `rnt-dr-${r.id}`
                    const draftRes = resDrafts[key] ?? {
                      type: "Supplier Settled",
                      notes: "",
                    }
                    return (
                      <div
                        key={r.id}
                        className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            {r.vendorName} — {r.itemName} (Req {r.ApprovedRequestedQty})
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
                              ? "Awaiting Handback Check"
                              : receiptDisc || returnDisc
                                ? "Unresolved Discrepancy"
                                : "Rental Reconciled"}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">
                          Supplier Return:{" "}
                          {r.supplierReturn
                            ? `${r.supplierReturn.handedBackQty} handed back, ${r.supplierReturn.missingQty} missing, ${r.supplierReturn.damagedQty} damaged (${r.supplierReturn.discrepancyNotes})`
                            : "Not yet recorded by Event Team Lead"}
                        </div>
                        {(receiptDisc || returnDisc) && !order.warehouseClosed && (
                          <div className="grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)_auto] items-center border-t border-line pt-2.5">
                            <select
                              aria-label="Rental discrepancy resolution"
                              className="h-9 rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                              value={draftRes.type}
                              onChange={(e) =>
                                setResDrafts({
                                  ...resDrafts,
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
                                setResDrafts({
                                  ...resDrafts,
                                  [key]: { ...draftRes, notes: e.target.value },
                                })
                              }
                              placeholder="Document supplier settlement details…"
                            />
                            <Button
                              type="button"
                              onClick={() => {
                                let latestRes: { ok: boolean; error?: string; savedToStorage?: boolean } = {
                                  ok: true,
                                }
                                if (receiptDisc) {
                                  latestRes = resolveRentalDiscrepancy(actor, {
                                    eventId: order.eventId,
                                    rentalId: r.id,
                                    stage: "receipt",
                                    resolutionType: draftRes.type,
                                    resolutionNotes: draftRes.notes,
                                  })
                                  if (!latestRes.ok) {
                                    notifyMutationResult(notify, latestRes, "")
                                    return
                                  }
                                }
                                if (returnDisc) {
                                  latestRes = resolveRentalDiscrepancy(actor, {
                                    eventId: order.eventId,
                                    rentalId: r.id,
                                    stage: "return",
                                    resolutionType: draftRes.type,
                                    resolutionNotes: draftRes.notes,
                                  })
                                }
                                notifyMutationResult(
                                  notify,
                                  latestRes,
                                  `Resolved rental discrepancy for ${r.vendorName}.`,
                                )
                              }}
                            >
                              Resolve Discrepancy
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Accountability Closeout Gates & Sign-off */}
              <div className="space-y-3 border-t border-line pt-4 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={order.returnChecklist ? "success" : "warning"}>
                    Return Checklist: {order.returnChecklist ? "Submitted" : "Pending"}
                  </Badge>
                  <Badge tone={uncountedReturnLines.length === 0 ? "success" : "danger"}>
                    Uncounted / Uncertain Returns: {uncountedReturnLines.length}
                  </Badge>
                  <Badge tone={openEventIncidentsCount === 0 ? "success" : "danger"}>
                    Open Incidents: {openEventIncidentsCount}
                  </Badge>
                  <Badge tone={pendingReconCount === 0 ? "success" : "danger"}>
                    Pending Inventory Reconciliations: {pendingReconCount}
                  </Badge>
                  <Badge tone={openRentalDiscCount === 0 ? "success" : "danger"}>
                    Open Rental Discrepancies: {openRentalDiscCount}
                  </Badge>
                </div>
                {pendingReconCount > 0 && !order.warehouseClosed && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
                    Closeout is blocked until Warehouse completes the {pendingReconCount} pending legacy
                    inventory reconciliation review(s) above.
                  </div>
                )}

                {order.warehouseClosed ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-foreground">
                    <div className="font-bold text-emerald-700 dark:text-[#4ade80]">
                      Warehouse Accountability Closed for {order.eventTitle}
                    </div>
                    <div className="mt-1">
                      Closed by <strong>{order.closedByName}</strong> ({order.closedByEmail}) at{" "}
                      {fmtStamp(order.closedAt!)}
                    </div>
                    <div className="mt-1 text-muted-foreground">Notes: “{order.closeoutNotes}”</div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <Field label="Warehouse Event Accountability Closeout Notes">
                      <textarea
                        className={textareaCls}
                        rows={2}
                        value={closeoutNotes}
                        onChange={(e) => setCloseoutNotes(e.target.value)}
                        placeholder="Final closeout reconciliation remarks…"
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
                        notifyMutationResult(
                          notify,
                          res,
                          res.ok && res.alreadyClosed
                            ? `Warehouse accountability for ${order.eventTitle} was already closed.`
                            : `Closed Warehouse accountability for ${order.eventTitle}.`,
                        )
                      }}
                    >
                      Sign Off Return &amp; Close Warehouse Event Accountability
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="min-w-0 space-y-6">
      {!embedded ? (
        <>
          <div className="dispatch-event-header">
            <PageHeader
              crumbs={["Dashboard", "Dispatch & Returns", order.eventTitle]}
              title={order.eventTitle}
              subtitle="Manage dispatch batches, cargo, and returns for this event."
              beforeHeading={
                <button type="button" className="mb-2 inline-flex items-center gap-2 rounded text-[13px] font-normal text-muted-foreground transition-colors hover:text-foreground" onClick={leaveWorkspace}>
                  <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
                  Back to dispatch list
                </button>
              }
              actions={!order.warehouseClosed && (
                <Button type="button" variant="outline" icon={Plus} onClick={() => openCreateBatchModal("outbound")}>New trip</Button>
              )}
            />
          </div>

          {renderDispatchWorkspace()}
        </>
      ) : (
        <div className="space-y-6">
          <Card className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabBar
                label="Dispatch and Returns workspace sections"
                idPrefix="wh-dr-subtab"
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                  {
                    key: "manifest",
                    label: "Event Manifest & Loading",
                    count: manifestLines.length,
                  },
                  {
                    key: "transport",
                    label: "Transport, Setup & Dismantling",
                    count: dutyAssignments.length + order.rentals.length,
                  },
                  {
                    key: "returns",
                    label: "Returns, Damage & Closeout",
                    count: openEventIncidentsCount + openRentalDiscCount + pendingReconCount,
                  },
                ]}
              />
              {!order.warehouseClosed && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" icon={Plus} onClick={() => openCreateBatchModal("outbound")}>
                    New Trip
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {renderDispatchWorkspace()}

          {renderEventManifestAndReturnsControls()}
        </div>
      )}

      {/* MODALS (Create Batch + Delete Batch) */}
      <Modal
        open={Boolean(createBatchDir)}
        onClose={() => setCreateBatchDir(null)}
        title={
          createBatchDir === "return"
            ? `New Return (Ingress) Batch — ${order.eventTitle}`
            : `New Outbound (Egress) Batch — ${order.eventTitle}`
        }
        panelClassName="max-w-2xl"
      >
        {createBatchDir && (() => {
          const isOutbound = createBatchDir === "outbound"
          const selectedEntries = Object.entries(batchSelectedQtyByLine)
            .filter(([, q]) => q > 0)
            .map(([manifestLineId, qty]) => ({ manifestLineId, qty }))
          const allSelectedValid =
            selectedEntries.length > 0 &&
            selectedEntries.every(({ manifestLineId, qty }) => {
              const bal = eventBalances.find((b) => b.line.lineId === manifestLineId)
              if (!bal) return false
              const max = isOutbound ? bal.outboundRemainingQty : bal.returnRemainingQty
              return qty > 0 && qty <= max
            })
          const canSubmit =
            Boolean(batchVehicleType.trim()) &&
            Boolean(batchPlateNumber.trim()) &&
            allSelectedValid

          return (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Vehicle Type">
                  <Input
                    value={batchVehicleType}
                    onChange={(e) => setBatchVehicleType(e.target.value)}
                    placeholder="e.g. Box Truck (14ft)"
                  />
                </Field>
                <Field label="Plate Number">
                  <Input
                    value={batchPlateNumber}
                    onChange={(e) => setBatchPlateNumber(e.target.value)}
                    placeholder="e.g. NBC 1234"
                  />
                </Field>
                <Field label="Driver Name">
                  <Input
                    value={batchDriverName}
                    onChange={(e) => setBatchDriverName(e.target.value)}
                    placeholder="Assigned driver..."
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                    {isOutbound ? "Select Event Assets to Allocate" : "Select Outbound Assets to Return"}
                  </span>
                  <span className="text-muted-foreground">
                    {selectedEntries.length} asset(s) selected
                  </span>
                </div>

                {eventBalances.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted-foreground">
                    No approved manifest items released for this event yet.
                  </p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {eventBalances.map((bal) => {
                      const remaining = isOutbound
                        ? bal.outboundRemainingQty
                        : bal.returnRemainingQty
                      const reserved = isOutbound
                        ? bal.outboundReservedQty
                        : bal.returnReservedQty
                      const eventTotal = isOutbound ? bal.line.plannedQty : bal.line.loadedQty
                      const checked = (batchSelectedQtyByLine[bal.line.lineId] ?? 0) > 0
                      const disabled = remaining <= 0

                      return (
                        <div
                          key={bal.line.lineId}
                          className={cx(
                            "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs",
                            disabled ? "bg-fg/[0.02] opacity-70" : "bg-card",
                          )}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={checked}
                              onChange={(e) => {
                                setBatchSelectedQtyByLine((prev) => {
                                  if (!e.target.checked) {
                                    const next = { ...prev }
                                    delete next[bal.line.lineId]
                                    return next
                                  }
                                  return { ...prev, [bal.line.lineId]: remaining }
                                })
                              }}
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground">{bal.line.name}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {isOutbound ? "Event Released" : "Actual Outbound"}: {eventTotal} ·{" "}
                                {isOutbound ? "Available" : "Returnable"}: {remaining}
                                {reserved > 0 ? ` · Reserved in open batch: ${reserved}` : ""}
                              </div>
                            </div>
                          </label>

                          {disabled ? (
                            <Badge tone="neutral">
                              {reserved > 0 ? "Reserved in Open Batch" : "None Available"}
                            </Badge>
                          ) : (
                            checked && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">Qty:</span>
                                <Input
                                  type="number"
                                  min={1}
                                  max={remaining}
                                  value={batchSelectedQtyByLine[bal.line.lineId] ?? 1}
                                  onChange={(e) => {
                                    const val = Math.max(
                                      1,
                                      Math.min(remaining, Math.floor(Number(e.target.value) || 1)),
                                    )
                                    setBatchSelectedQtyByLine((prev) => ({
                                      ...prev,
                                      [bal.line.lineId]: val,
                                    }))
                                  }}
                                  className="h-8 w-20 text-right"
                                />
                              </div>
                            )
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <Button type="button" variant="outline" onClick={() => setCreateBatchDir(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => {
                    const res = createDispatchBatch(actor, {
                      eventId: order.eventId,
                      direction: createBatchDir,
                      vehicleType: batchVehicleType,
                      plateNumber: batchPlateNumber,
                      driverName: batchDriverName,
                      items: selectedEntries,
                    })
                    notifyMutationResult(
                      notify,
                      res,
                      res.ok ? `Created ${createBatchDir} batch ${res.batch.id}.` : "",
                    )
                    if (res.ok) setCreateBatchDir(null)
                  }}
                >
                  Create Batch ({selectedEntries.length} Assets)
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal open={Boolean(batchToDelete)} onClose={() => setBatchToDelete(null)} title="Delete dispatch batch?" compact>
        {batchToDelete && (
          <>
            <p className="text-sm text-muted-foreground">
              Delete {batchToDelete.id} from dispatch and release its reserved quantities? The cancellation will be retained in the event record.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBatchToDelete(null)}>Keep batch</Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  const res = cancelDispatchBatch(actor, {
                    eventId: batchToDelete.eventId,
                    batchId: batchToDelete.id,
                    deleteFromDispatch: true,
                  })
                  notifyMutationResult(notify, res, "Batch " + batchToDelete.id + " deleted.")
                  if (res.ok) {
                    setWorkspaceBatchId(null)
                    setBatchToDelete(null)
                  }
                }}
              >
                Delete batch
              </Button>
            </div>
          </>
        )}
      </Modal>

    </div>
  )
}
