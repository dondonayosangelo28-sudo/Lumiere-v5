import { useEffect, useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, ImageOff, Search, TriangleAlert } from "lucide-react"
import Drawer from "../../../components/overlay/Drawer"
import { Badge, Button, Card, Field, Input, PageHeader } from "../../../components/ui/ui"
import { fmtStamp, Visual } from "../../event-manager/shared"
import { notifyMutationResult, useNotify } from "../../ground-crew/ground-crew-shared"
import {
  allocateIncidentToTrip,
  getTripItemDamageSummary,
  reconcileLegacyIncidentInventory,
  resolveFieldIncidentReport,
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../../operations/store"
import type {
  FieldIncidentReport,
  IssueResolutionType,
  LegacyInventoryReconciliationDecision,
} from "../../../operations/types"

type FilterKey = "all" | "damage" | "missing" | "pending" | "resolved"

const RESOLUTION_OPTIONS: IssueResolutionType[] = [
  "Recovered",
  "Repair Scheduled",
  "Approved Write-off",
  "Supplier Settled",
  "Charged to Client",
  "Client Invoiced",
  "Supplier Credited",
]

function sourceLabel(source?: FieldIncidentReport["reportSource"]): string {
  if (source === "auto-return-checklist") return "Auto Return Checklist"
  if (source === "manual-field-report") return "Manual Field Report"
  return "Legacy Report"
}

function EvidenceThumbnail({ photoUrl, label }: { photoUrl?: string; label: string }) {
  const clean = photoUrl?.trim()
  if (clean) {
    return <Visual src={clean} label={label} className="size-12 shrink-0 rounded-md object-cover" />
  }
  return (
    <div
      className="flex size-12 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-line bg-fg/[0.03] text-[10px] text-muted-foreground"
      title="No field evidence photo submitted"
    >
      <ImageOff className="size-3.5 mb-0.5" aria-hidden="true" />
      <span>No photo</span>
    </div>
  )
}

export default function DamageMissingReportsModule({
  actor,
  initialEventId,
  initialReportId,
  embedded = false,
  onNavigate,
}: {
  actor: OpsActor
  initialEventId?: string
  initialReportId?: string
  embedded?: boolean
  onNavigate?: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterKey>("all")
  const [eventFilterId, setEventFilterId] = useState<string>(initialEventId ?? "")
  const [selectedReportId, setSelectedReportId] = useState<string | null>(initialReportId ?? null)

  const [resDrafts, setResDrafts] = useState<
    Record<string, { type: IssueResolutionType; notes: string }>
  >({})
  const [reconDrafts, setReconDrafts] = useState<
    Record<
      string,
      {
        open: boolean
        decision: LegacyInventoryReconciliationDecision
        qty: string
        reason: string
      }
    >
  >({})
  const [allocDrafts, setAllocDrafts] = useState<Record<string, { batchId: string; qty: string }>>({})

  useEffect(() => {
    if (initialEventId !== undefined) {
      setEventFilterId(initialEventId)
    }
  }, [initialEventId])

  useEffect(() => {
    if (initialReportId) {
      setSelectedReportId(initialReportId)
    }
  }, [initialReportId])

  const effectiveEventFilterId = embedded ? (initialEventId ?? "") : eventFilterId

  const baseReports = useMemo(() => {
    if (embedded) {
      return effectiveEventFilterId
        ? state.incidentReports.filter((r) => r.eventId === effectiveEventFilterId)
        : []
    }
    if (!effectiveEventFilterId) return state.incidentReports
    return state.incidentReports.filter((r) => r.eventId === effectiveEventFilterId)
  }, [state.incidentReports, effectiveEventFilterId, embedded])

  const counts = useMemo(() => {
    const damage = baseReports.filter((r) => r.reportType === "Damage").length
    const missing = baseReports.filter((r) => r.reportType === "Missing").length
    const pending = baseReports.filter((r) => r.resolutionStatus !== "Resolved").length
    const resolved = baseReports.filter((r) => r.resolutionStatus === "Resolved").length
    const pendingDamage = baseReports.filter(
      (r) => r.reportType === "Damage" && r.resolutionStatus !== "Resolved",
    ).length
    const pendingMissing = baseReports.filter(
      (r) => r.reportType === "Missing" && r.resolutionStatus !== "Resolved",
    ).length
    return {
      all: baseReports.length,
      damage,
      missing,
      pending,
      resolved,
      pendingDamage,
      pendingMissing,
    }
  }, [baseReports])

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase()
    return baseReports.filter((r) => {
      if (filter === "damage" && r.reportType !== "Damage") return false
      if (filter === "missing" && r.reportType !== "Missing") return false
      if (filter === "pending" && r.resolutionStatus === "Resolved") return false
      if (filter === "resolved" && r.resolutionStatus !== "Resolved") return false
      if (!q) return true
      return (
        r.id.toLowerCase().includes(q) ||
        r.eventTitle.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q) ||
        r.itemCode.toLowerCase().includes(q) ||
        r.submittedByName.toLowerCase().includes(q) ||
        r.submittedByEmail.toLowerCase().includes(q) ||
        r.checkpoint.toLowerCase().includes(q)
      )
    })
  }, [baseReports, filter, search])

  const selectedReport =
    state.incidentReports.find((r) => r.id === selectedReportId) ?? null

  const activeEventOrder = eventFilterId
    ? state.orderRequests.find((o) => o.eventId === eventFilterId)
    : undefined

  const filterPills: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "damage", label: "Damage", count: counts.damage },
    { key: "missing", label: "Missing", count: counts.missing },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "resolved", label: "Resolved", count: counts.resolved },
  ]

  return (
    <div className="space-y-5">
      {!embedded && (
        <PageHeader
          crumbs={["Dashboard", "Damage & Missing Reports"]}
          title="Damage & Missing Reports"
          subtitle="Review field damage and missing-item reports, photographic evidence, inventory impact, and resolutions."
        />
      )}

      {/* Filter Pills (left) + Search (right) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter reports">
          {filterPills.map((pill) => {
            const active = filter === pill.key
            return (
              <button
                key={pill.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(pill.key)}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-full bg-invert px-3.5 py-1.5 text-xs font-semibold text-invert-fg transition-colors"
                    : "inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                }
              >
                <span>{pill.label}</span>
                <span className="tabular-nums opacity-80">{pill.count}</span>
              </button>
            )
          })}
        </div>

        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search damage and missing reports"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search report ID, event, asset, submitter…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary Strip */}
      <div className="dashboard-surfaces">
        <Card className="dashboard-welcome relative overflow-hidden">
          <dl className="grid grid-cols-2 divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {[
              { label: "Total Reports", value: counts.all },
              { label: "Pending Damage", value: counts.pendingDamage },
              { label: "Pending Missing", value: counts.pendingMissing },
              { label: "Resolved", value: counts.resolved },
            ].map((stat) => (
              <div key={stat.label} className="px-4 py-3.5 sm:px-5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {/* Reports Table / Mobile List */}
      {(embedded ? baseReports.length === 0 : state.incidentReports.length === 0) ? (
        <Card className="p-8 text-center space-y-2">
          <p className="text-base font-semibold text-foreground">
            {embedded ? "No damage or missing reports for this event" : "No damage or missing reports yet"}
          </p>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Manual Ground Crew field reports and automatic return-shortage reports from Dispatch
            &amp; Returns will appear here for Warehouse assessment and inventory reconciliation.
          </p>
        </Card>
      ) : filteredReports.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-foreground">
            No reports match the current filter or search.
          </p>
          <div className="flex justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilter("all")
                setSearch("")
                if (!embedded) setEventFilterId("")
              }}
            >
              Reset Filters
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-fg/[0.02] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 pl-4 pr-3">Preview</th>
                    <th className="py-3 px-3">Report ID</th>
                    <th className="py-3 px-3">Event</th>
                    <th className="py-3 px-3">Submitter</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Asset</th>
                    <th className="py-3 px-3">Details</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 pl-3 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredReports.map((rep) => (
                    <tr
                      key={rep.id}
                      onClick={() => setSelectedReportId(rep.id)}
                      className="cursor-pointer transition-colors hover:bg-fg/[0.03]"
                    >
                      <td className="py-3 pl-4 pr-3">
                        <EvidenceThumbnail photoUrl={rep.photoUrl} label={rep.itemName} />
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-foreground whitespace-nowrap">
                        {rep.id}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-foreground">{rep.eventTitle}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-foreground">{rep.submittedByName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {rep.submittedByEmail}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge tone={rep.reportType === "Damage" ? "danger" : "warning"}>
                          {rep.reportType}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-foreground">{rep.itemName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">
                          {rep.itemCode}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-semibold tabular-nums text-foreground">
                          Qty: {rep.quantity}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{rep.checkpoint}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtStamp(rep.submittedAt)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            tone={rep.resolutionStatus === "Resolved" ? "success" : "danger"}
                          >
                            {rep.resolutionStatus}
                          </Badge>
                          {rep.needsWarehouseInventoryReconciliation && (
                            <Badge tone="warning">Needs Inventory Reconciliation</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant={rep.resolutionStatus === "Resolved" ? "ghost" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedReportId(rep.id)
                          }}
                          className="h-7 px-2.5 text-xs"
                        >
                          {rep.resolutionStatus === "Resolved" &&
                          !rep.needsWarehouseInventoryReconciliation
                            ? "View Report"
                            : "Review & Resolve"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {filteredReports.map((rep) => (
              <Card key={rep.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSelectedReportId(rep.id)}
                  className="w-full cursor-pointer p-4 space-y-2.5 text-left text-xs hover:bg-fg/[0.02]"
                >
                  <div className="flex items-start gap-3">
                    <EvidenceThumbnail photoUrl={rep.photoUrl} label={rep.itemName} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-semibold text-foreground">{rep.id}</span>
                        <Badge tone={rep.reportType === "Damage" ? "danger" : "warning"}>
                          {rep.reportType}
                        </Badge>
                        <Badge tone={rep.resolutionStatus === "Resolved" ? "success" : "danger"}>
                          {rep.resolutionStatus}
                        </Badge>
                        {rep.needsWarehouseInventoryReconciliation && (
                          <Badge tone="warning">Needs Inventory Reconciliation</Badge>
                        )}
                      </div>
                      <div className="font-semibold text-foreground">
                        {rep.itemName} ({rep.itemCode}) · Qty {rep.quantity}
                      </div>
                      <div className="text-muted-foreground">
                        {rep.eventTitle} · {rep.checkpoint} · {fmtStamp(rep.submittedAt)}
                      </div>
                      <div className="text-muted-foreground">
                        Submitted by {rep.submittedByName}
                      </div>
                    </div>
                  </div>
                </button>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Report Detail Drawer */}
      <Drawer
        open={Boolean(selectedReport)}
        onClose={() => setSelectedReportId(null)}
        title={selectedReport ? `${selectedReport.reportType} Report · ${selectedReport.id}` : "Report Details"}
        subtitle={
          selectedReport
            ? `${selectedReport.eventTitle} · ${selectedReport.checkpoint}`
            : undefined
        }
      >
        {selectedReport && (() => {
          const inc = selectedReport
          const invAsset = state.inventory.find(
            (i) =>
              (inc.lineId && i.assetId === inc.lineId) ||
              i.assetCode === inc.itemCode ||
              i.name === inc.itemName,
          )
          const incOrder = state.orderRequests.find((o) => o.eventId === inc.eventId)
          const draftRes = resDrafts[inc.id] ?? {
            type: "Repair Scheduled" as IssueResolutionType,
            notes: "",
          }

          const rDraft = reconDrafts[inc.id] ?? {
            open: Boolean(inc.needsWarehouseInventoryReconciliation),
            decision: "no-adjustment-required" as LegacyInventoryReconciliationDecision,
            qty: "1",
            reason: "",
          }
          const bucketName = inc.reportType === "Missing" ? "missingCount" : "damagedCount"
          const currentBucket = invAsset
            ? inc.reportType === "Missing"
              ? invAsset.missingCount
              : invAsset.damagedCount
            : 0
          const parsedQty = Number(rDraft.qty)
          const previewValid =
            rDraft.decision === "no-adjustment-required" ||
            (rDraft.decision === "reverse-attributable-loss" &&
              Number.isInteger(parsedQty) &&
              parsedQty >= 1 &&
              parsedQty <= inc.quantity &&
              parsedQty <= currentBucket)
          const previewDelta =
            rDraft.decision === "reverse-attributable-loss" && previewValid ? parsedQty : 0
          const previewTrans =
            previewDelta > 0 && incOrder && !incOrder.warehouseClosed
              ? Math.min(inc.transferredFromDispatchedQty ?? 0, previewDelta)
              : 0
          const previewAfterBucket = Math.max(0, currentBucket - previewDelta)
          const previewAfterDisp = invAsset ? invAsset.dispatchedStock + previewTrans : 0
          const previewAfterAvail = invAsset
            ? Math.max(
                0,
                invAsset.totalStock -
                  invAsset.allocatedStock -
                  previewAfterDisp -
                  (inc.reportType === "Damage" ? previewAfterBucket : invAsset.damagedCount) -
                  (inc.reportType === "Missing" ? previewAfterBucket : invAsset.missingCount),
              )
            : 0

          const hasEvidencePhoto = Boolean(inc.photoUrl?.trim())

          return (
            <div className="space-y-5 text-xs">
              {/* Status & Provenance */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={inc.reportType === "Damage" ? "danger" : "warning"}>
                  {inc.reportType} Report
                </Badge>
                <Badge tone={inc.resolutionStatus === "Resolved" ? "success" : "danger"}>
                  {inc.resolutionStatus}
                </Badge>
                <Badge tone="neutral">{sourceLabel(inc.reportSource)}</Badge>
                {inc.needsWarehouseInventoryReconciliation && (
                  <Badge tone="warning">Needs Inventory Reconciliation</Badge>
                )}
              </div>

              {/* Description & Submission Metadata */}
              <div className="rounded-lg border border-line bg-fg/[0.02] p-3.5 space-y-2">
                <div className="font-semibold text-foreground">
                  {inc.itemName} ({inc.itemCode}) · Affected Qty: {inc.quantity}
                  {inc.originalQuantity !== undefined && inc.originalQuantity !== inc.quantity
                    ? ` (originally ${inc.originalQuantity})`
                    : ""}
                </div>
                <p className="text-foreground">“{inc.description}”</p>
                <div className="text-muted-foreground">
                  Submitted by <strong className="text-foreground">{inc.submittedByName}</strong> (
                  {inc.submittedByEmail}) at {fmtStamp(inc.submittedAt)} · Checkpoint:{" "}
                  <strong className="text-foreground">{inc.checkpoint}</strong>
                </div>
                {(inc.quantityAdjustmentHistory?.length ?? 0) > 0 && (
                  <div className="border-t border-line pt-2 space-y-1 text-[11px] text-muted-foreground">
                    <div className="font-semibold text-foreground">Quantity Adjustment History</div>
                    {inc.quantityAdjustmentHistory!.map((adj, idx) => (
                      <div key={idx}>
                        • {adj.previousQty} → {adj.newQty} ({fmtStamp(adj.adjustedAt)} by{" "}
                        {adj.adjustedByName}): {adj.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Evidence Section (strictly distinguishes actual field evidence from reference photo) */}
              <div className="rounded-lg border border-line bg-fg/[0.02] p-3.5 space-y-2.5">
                <div className="font-semibold text-foreground">Submitted Field Evidence</div>
                {hasEvidencePhoto ? (
                  <div className="space-y-1.5">
                    <Visual
                      src={inc.photoUrl}
                      label={`Evidence for ${inc.itemName}`}
                      className="h-44 w-full rounded-md object-cover"
                    />
                    <div className="text-[11px] text-muted-foreground break-all">{inc.photoUrl}</div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-line bg-card px-3 py-3 text-muted-foreground">
                    <ImageOff className="size-4 shrink-0" aria-hidden="true" />
                    <span>No field evidence photo was submitted with this report.</span>
                  </div>
                )}
                {!hasEvidencePhoto && invAsset?.image && (
                  <div className="border-t border-line pt-2.5 space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      Asset Reference Image (Not Field Evidence)
                    </div>
                    <Visual
                      src={invAsset.image}
                      label={`Reference image for ${invAsset.name}`}
                      className="size-16 rounded-md object-cover opacity-80"
                    />
                  </div>
                )}
              </div>

              {/* Inventory Impact */}
              <div className="rounded-lg border border-line bg-fg/[0.02] p-3.5 space-y-2">
                <div className="font-semibold text-foreground">Inventory Impact</div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>
                    Tracked Adjustment:{" "}
                    <strong className="text-foreground">
                      {typeof inc.inventoryAdjustedQty === "number"
                        ? `${inc.inventoryAdjustedQty} unit(s)`
                        : "Untracked legacy"}
                    </strong>
                  </div>
                  <div>
                    Transferred from Dispatched:{" "}
                    <strong className="text-foreground">
                      {inc.transferredFromDispatchedQty ?? 0} unit(s)
                    </strong>
                  </div>
                  <div>
                    Recovery Reversal Applied:{" "}
                    <strong className="text-foreground">
                      {inc.inventoryRecoveryApplied ? "Yes" : "No"}
                    </strong>
                  </div>
                </div>
                {invAsset && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded border border-line bg-card p-2 text-[11px] tabular-nums">
                    <div>
                      Available: <strong className="text-foreground">{invAsset.availableStock}</strong>
                    </div>
                    <div>
                      Dispatched: <strong className="text-foreground">{invAsset.dispatchedStock}</strong>
                    </div>
                    <div>
                      Missing: <strong className="text-foreground">{invAsset.missingCount}</strong>
                    </div>
                    <div>
                      Damaged: <strong className="text-foreground">{invAsset.damagedCount}</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Resolution Information */}
              {inc.resolutionStatus === "Resolved" && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-[#4ade80]">
                    <CheckCircle2 className="size-4 shrink-0" />
                    Resolution Recorded: {inc.resolutionType}
                  </div>
                  <div className="text-foreground">“{inc.resolutionNotes}”</div>
                  <div className="text-muted-foreground">
                    Signed off by <strong className="text-foreground">{inc.resolvedByName}</strong>
                    {inc.resolvedAt ? ` at ${fmtStamp(inc.resolvedAt)}` : ""}
                  </div>
                </div>
              )}

              {/* Legacy Reconciliation Audit */}
              {inc.legacyInventoryReconciliation && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-1 text-foreground">
                  <div className="font-semibold text-emerald-700 dark:text-[#4ade80]">
                    Inventory Reconciliation Completed (
                    {inc.legacyInventoryReconciliation.decision === "no-adjustment-required"
                      ? "No Stock Adjustment Required"
                      : `Reversed ${inc.legacyInventoryReconciliation.adjustedQty} Attributable Unit(s)`}
                    )
                  </div>
                  <div className="text-muted-foreground">
                    Asset: {inc.legacyInventoryReconciliation.assetName} (
                    {inc.legacyInventoryReconciliation.assetCode}) · Reviewed by{" "}
                    <strong className="text-foreground">
                      {inc.legacyInventoryReconciliation.reviewedByName}
                    </strong>{" "}
                    at {fmtStamp(inc.legacyInventoryReconciliation.reviewedAt)}
                  </div>
                  <div className="text-muted-foreground">
                    Reason: “{inc.legacyInventoryReconciliation.reason}”
                  </div>
                </div>
              )}

              {/* Legacy Reconciliation Controls */}
              {inc.needsWarehouseInventoryReconciliation && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                      <TriangleAlert className="size-4 shrink-0" />
                      Legacy Inventory Reconciliation Required
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setReconDrafts({
                          ...reconDrafts,
                          [inc.id]: { ...rDraft, open: !rDraft.open },
                        })
                      }
                      className="h-7 px-2.5 text-xs"
                    >
                      {rDraft.open ? "Hide review" : "Review inventory reconciliation"}
                    </Button>
                  </div>

                  {rDraft.open && (
                    <div className="space-y-3">
                      <Field label="Attribution Decision">
                        <select
                          aria-label="Legacy inventory reconciliation decision"
                          className="h-9 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                          value={rDraft.decision}
                          onChange={(e) =>
                            setReconDrafts({
                              ...reconDrafts,
                              [inc.id]: {
                                ...rDraft,
                                decision: e.target
                                  .value as LegacyInventoryReconciliationDecision,
                              },
                            })
                          }
                        >
                          <option value="no-adjustment-required">
                            No adjustment required (other incident / never adjusted)
                          </option>
                          <option value="reverse-attributable-loss">
                            Reverse verified attributable loss
                          </option>
                          <option value="attribution-still-uncertain">
                            Attribution still uncertain (keep pending)
                          </option>
                        </select>
                      </Field>

                      {rDraft.decision === "reverse-attributable-loss" && (
                        <Field
                          label={`Attributable Qty (1–${Math.min(inc.quantity, currentBucket)})`}
                        >
                          <Input
                            type="number"
                            min={1}
                            max={Math.min(inc.quantity, currentBucket)}
                            step={1}
                            value={rDraft.qty}
                            onChange={(e) =>
                              setReconDrafts({
                                ...reconDrafts,
                                [inc.id]: { ...rDraft, qty: e.target.value },
                              })
                            }
                          />
                        </Field>
                      )}

                      <Field label="Documented Reconciliation Reason">
                        <Input
                          value={rDraft.reason}
                          onChange={(e) =>
                            setReconDrafts({
                              ...reconDrafts,
                              [inc.id]: { ...rDraft, reason: e.target.value },
                            })
                          }
                          placeholder="Explain physical count / event attribution evidence…"
                        />
                      </Field>

                      {invAsset && rDraft.decision !== "attribution-still-uncertain" && (
                        <div className="rounded border border-line bg-card px-3 py-2 text-[11px] text-muted-foreground">
                          <strong className="text-foreground">Resulting Inventory Preview:</strong>{" "}
                          {previewValid ? (
                            <span>
                              {bucketName}: {currentBucket} →{" "}
                              <strong className="text-foreground">{previewAfterBucket}</strong> ·{" "}
                              availableStock: {invAsset.availableStock} →{" "}
                              <strong className="text-foreground">{previewAfterAvail}</strong>
                              {previewTrans > 0
                                ? ` · dispatchedStock: ${invAsset.dispatchedStock} → ${previewAfterDisp}`
                                : ""}
                            </span>
                          ) : (
                            <span className="text-danger">
                              Enter a whole number between 1 and{" "}
                              {Math.min(inc.quantity, currentBucket)}.
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={() => {
                            const res = reconcileLegacyIncidentInventory(actor, inc.id, {
                              decision: rDraft.decision,
                              attributableQty:
                                rDraft.decision === "reverse-attributable-loss"
                                  ? Number(rDraft.qty)
                                  : undefined,
                              reason: rDraft.reason,
                            })
                            notifyMutationResult(
                              notify,
                              res,
                              res.ok && res.alreadyReconciled
                                ? `Inventory reconciliation for ${inc.itemName} was already completed.`
                                : `Completed Warehouse inventory reconciliation for ${inc.itemName}.`,
                            )
                            if (res.ok) {
                              setReconDrafts({
                                ...reconDrafts,
                                [inc.id]: { ...rDraft, open: false },
                              })
                            }
                          }}
                        >
                          Confirm Inventory Reconciliation
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Trip Damage Allocation */}
              {inc.reportType === "Damage" && (() => {
                const incOrder = state.orderRequests.find((o) => o.eventId === inc.eventId)
                const eligibleTrips = (incOrder?.dispatchBatches ?? []).filter(
                  (b) =>
                    !b.deletedAt &&
                    b.stage !== "Cancelled" &&
                    b.items.some(
                      (i) =>
                        (inc.lineId && (i.assetId === inc.lineId || i.manifestLineId === inc.lineId)) ||
                        i.itemCode === inc.itemCode ||
                        i.name === inc.itemName,
                    ),
                )
                if (eligibleTrips.length === 0) return null
                const existingAllocations = inc.tripAllocations ?? []
                const allocatedQty = inc.batchId && existingAllocations.length === 0
                  ? inc.quantity
                  : existingAllocations.reduce((s, a) => s + a.quantity, 0)
                const remainingQty = Math.max(0, inc.quantity - allocatedQty)
                const excessiveTrips = incOrder
                  ? eligibleTrips.filter((b) => {
                      const ti = b.items.find(
                        (i) =>
                          (inc.lineId && (i.assetId === inc.lineId || i.manifestLineId === inc.lineId)) ||
                          i.itemCode === inc.itemCode ||
                          i.name === inc.itemName,
                      )
                      return ti ? getTripItemDamageSummary(state.incidentReports, incOrder, b, ti).isExcessive : false
                    })
                  : []
                const aDraft = allocDrafts[inc.id] ?? { batchId: eligibleTrips[0]?.id ?? "", qty: String(remainingQty || 1) }
                return (
                  <div className="rounded-lg border border-line bg-fg/[0.02] p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">Trip Damage Attribution</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {excessiveTrips.length > 0 && (
                          <Badge tone="danger">
                            Excessive allocation on {excessiveTrips.map((b) => b.id).join(", ")}
                          </Badge>
                        )}
                        <Badge tone={remainingQty === 0 ? "success" : "warning"}>
                          {remainingQty === 0 ? "Fully Allocated" : `${remainingQty} of ${inc.quantity} Unallocated`}
                        </Badge>
                      </div>
                    </div>
                    {existingAllocations.length > 0 && (
                      <ul className="space-y-1 text-muted-foreground">
                        {existingAllocations.map((a) => (
                          <li key={a.batchId}>
                            <strong className="text-foreground">{a.batchId}</strong>: ×{a.quantity} allocated by{" "}
                            {a.allocatedByName} ({fmtStamp(a.allocatedAt)})
                          </li>
                        ))}
                      </ul>
                    )}
                    {remainingQty > 0 && !incOrder?.warehouseClosed && (
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto] items-end pt-1">
                        <Field label="Dispatch Trip">
                          <select
                            aria-label="Allocate damage to trip"
                            className="h-9 w-full rounded-md border border-line bg-elev px-2.5 text-xs text-foreground"
                            value={aDraft.batchId}
                            onChange={(e) =>
                              setAllocDrafts({ ...allocDrafts, [inc.id]: { ...aDraft, batchId: e.target.value } })
                            }
                          >
                            {eligibleTrips.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.id} · {b.returnVehicleType ?? b.vehicleType} ({b.returnPlateNumber ?? b.plateNumber})
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Qty">
                          <Input
                            type="number"
                            min={1}
                            max={remainingQty}
                            value={aDraft.qty}
                            onChange={(e) =>
                              setAllocDrafts({ ...allocDrafts, [inc.id]: { ...aDraft, qty: e.target.value } })
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const res = allocateIncidentToTrip(actor, inc.id, {
                              batchId: aDraft.batchId,
                              quantity: Number(aDraft.qty),
                            })
                            notifyMutationResult(
                              notify,
                              res,
                              res.ok ? `Allocated ×${aDraft.qty} damage to ${aDraft.batchId}.` : "",
                            )
                          }}
                        >
                          Allocate to Trip
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Pending Resolution Controls */}
              {inc.resolutionStatus !== "Resolved" && (
                <div className="rounded-lg border border-line bg-card p-3.5 space-y-3">
                  <div className="font-semibold text-foreground">Warehouse Resolution</div>
                  <Field label="Resolution Action">
                    <select
                      aria-label="Incident resolution type"
                      className="h-9 w-full rounded-md border border-line bg-elev px-2.5 text-xs text-foreground"
                      value={draftRes.type}
                      onChange={(e) =>
                        setResDrafts({
                          ...resDrafts,
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
                  </Field>
                  <Field label="Resolution Details / Audit Notes">
                    <Input
                      value={draftRes.notes}
                      onChange={(e) =>
                        setResDrafts({
                          ...resDrafts,
                          [inc.id]: { ...draftRes, notes: e.target.value },
                        })
                      }
                      placeholder="Document recovery, repair ticket, or write-off…"
                    />
                  </Field>
                  <Button
                    type="button"
                    onClick={() => {
                      const res = resolveFieldIncidentReport(actor, inc.id, {
                        resolutionType: draftRes.type,
                        resolutionNotes: draftRes.notes,
                      })
                      notifyMutationResult(
                        notify,
                        res,
                        res.ok && res.alreadyResolved
                          ? `${inc.reportType} report for ${inc.itemName} was already resolved.`
                          : `Resolved ${inc.reportType} report for ${inc.itemName}.`,
                      )
                    }}
                  >
                    Record Resolution
                  </Button>
                </div>
              )}

              {/* Contextual Link to Dispatch & Returns */}
              {onNavigate && (
                <div className="flex justify-end border-t border-line pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    icon={ArrowRight}
                    onClick={() => {
                      setSelectedReportId(null)
                      onNavigate("module-dispatch-returns", {
                        eventId: inc.eventId,
                        subView: "returns",
                      })
                    }}
                  >
                    Open Event in Dispatch &amp; Returns
                  </Button>
                </div>
              )}
            </div>
          )
        })()}
      </Drawer>
    </div>
  )
}

export { DamageMissingReportsModule }
