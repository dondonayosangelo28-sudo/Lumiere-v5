import { useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileText,
  Hammer,
  PackageCheck,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
} from "lucide-react"
import { useNotify as useRawNotify } from "../../components/Notifications"
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui"

function useNotify() {
  const raw = useRawNotify()
  return (text: string) => {
    const isErr = /cannot|blocked|error|require|only|select|specify|enter|describe|provide|prepare|not found|assign the/i.test(text)
    raw({ tone: isErr ? "error" : "success", text })
  }
}
import { Visual, fmtStamp, TabBar, textareaCls } from "../event-manager/shared"
import {
  allocateAllStockForEvent,
  allocateStockForOrderLine,
  assignCrewMemberToEvent,
  closeWarehouseEventAccountability,
  confirmOutboundDeparture,
  createAcquisitionOrder,
  createCustomFabricationJob,
  designateEventTeamLead,
  getAvailableGroundCrewAccounts,
  getEventManifestLines,
  receiveAcquisitionOrder,
  recordRentalSupplierAcceptance,
  resolveFieldIncidentReport,
  resolveRentalDiscrepancy,
  saveRentalELetterAndBookingRef,
  useOperationsStore,
  verifyCustomFabricationJob,
  getWarehouseSelectedEventId,
  setWarehouseSelectedEventId,
  type OpsActor,
} from "../../operations/store"
import type { IssueResolutionType, RentalSupplierAcceptance } from "../../operations/types"

const RESOLUTION_OPTIONS: IssueResolutionType[] = [
  "Recovered",
  "Repair Scheduled",
  "Approved Write-off",
  "Supplier Settled",
  "Charged to Client",
]

export function WarehouseDashboardSummary({ onNavigate }: { onNavigate: (route: string) => void }) {
  const state = useOperationsStore()
  const orders = state.orderRequests.filter((order) => !order.warehouseClosed)
  const openDeficits = state.deficitQueue.filter((item) => item.status !== "Fulfilled").length
  const pendingRentals = orders.flatMap((order) => order.rentals).filter((rental) => rental.confirmationStatus !== "Confirmed").length
  const blockers = orders.reduce(
    (count, order) => count + order.crewAssignments.filter((assignment) => assignment.taskStatus === "Blocked").length,
    0,
  )

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Event fulfillment</h2>
          <p className="mt-1 text-sm text-muted-foreground">Track active orders from asset preparation through return.</p>
        </div>
        <Button type="button" icon={ArrowRight} onClick={() => onNavigate("module-order-requests")}>Open order requests</Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line px-5 py-3 sm:grid-cols-4">
        {[
          ["Active orders", orders.length],
          ["Stock shortages", openDeficits],
          ["Pending rentals", pendingRentals],
          ["Crew blockers", blockers],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {orders.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Approved events will appear here when their asset plans reach Warehouse.</p>
      ) : (
        <ul className="divide-y divide-line">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">{order.eventTitle}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{order.venue} · {fmtStamp(order.startDateTime)}</p>
              </div>
              <Badge tone={order.returnChecklist ? "info" : "neutral"}>
                {order.returnChecklist ? "Ready for review" : order.outboundDeparture ? "Dispatched" : "Preparing"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function WarehouseModulePage({
  moduleKey,
  actor,
  onNavigate,
}: {
  moduleKey: string
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  switch (moduleKey) {
    case "asset-inventory":
      return <AssetInventoryModule actor={actor} onNavigate={onNavigate} />
    case "order-requests":
      return <OrderRequestsModule actor={actor} onNavigate={onNavigate} />
    case "deficit-queue":
      return <DeficitQueueModule actor={actor} onNavigate={onNavigate} />
    case "asset-acquisition":
      return <AssetAcquisitionModule actor={actor} />
    case "custom-fabrication":
      return <CustomFabricationModule actor={actor} />
    case "personnel-deployment":
      return <PersonnelDeploymentModule actor={actor} />
    case "damage-assessment":
      return <DamageAssessmentModule actor={actor} />
    default:
      return <OrderRequestsModule actor={actor} onNavigate={onNavigate} />
  }
}

/* ============================================================================
 * 1. ORDER REQUESTS MODULE (D01, D02, D03, D05, D06, D07, D08)
 * ========================================================================== */
function OrderRequestsModule({
  actor,
  onNavigate,
}: {
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    const passed = getWarehouseSelectedEventId()
    if (passed && state.orderRequests.some((o) => o.eventId === passed)) {
      setWarehouseSelectedEventId("")
      return passed
    }
    return state.orderRequests[0]?.eventId ?? ""
  })
  const [subTab, setSubTab] = useState<"allocation" | "rentals" | "reconciliation">("allocation")

  const order =
    state.orderRequests.find((o) => o.eventId === selectedEventId) ?? state.orderRequests[0]

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

  if (!order) {
    return (
      <div>
        <PageHeader
          crumbs={["Dashboard", "Order Requests"]}
          title="Order Requests"
          subtitle="Approve an event in Event Manager to publish its asset request here."
        />
        <Card className="p-8 text-center text-muted-foreground">
          No approved event Order Requests have been published yet.
        </Card>
      </div>
    )
  }

  const manifestLines = getEventManifestLines(state, order.eventId)
  const shortfalls = manifestLines.filter((l) => l.loadedQty < l.plannedQty)
  const eventIncidents = state.incidentReports.filter((r) => r.eventId === order.eventId)
  const eventFabJobs = state.fabricationJobs.filter((j) => j.eventId === order.eventId)

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

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Order Requests"]}
        title="Order Requests"
        subtitle="Prepare assets, confirm rentals, and reconcile returns for approved events."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              icon={Hammer}
              onClick={() => onNavigate("module-custom-fabrication")}
            >
              Custom Fabrication ({eventFabJobs.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              icon={Users}
              onClick={() => onNavigate("module-personnel-deployment")}
            >
              Personnel Deployment
            </Button>
          </div>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-xl font-semibold tracking-tight">{order.eventTitle}</h2>
              <Badge tone={order.warehouseClosed ? "success" : "neutral"}>{order.warehouseClosed ? "Closed" : "Open"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{order.venue} · {fmtStamp(order.startDateTime)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {order.clientName} · {order.pax} guests · Team Lead: {order.teamLeadName || "Unassigned"} · {order.crewAssignments.length} crew assigned
            </p>
          </div>
          <div className="w-full sm:max-w-64">
            <Field label="Order request">
              <select
                className="h-10 w-full rounded-md border border-line bg-elev px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
                value={order.eventId}
                onChange={(event) => {
                  setSelectedEventId(event.target.value)
                  setActiveRentalId("")
                }}
              >
                {state.orderRequests.map((item) => <option key={item.id} value={item.eventId}>{item.eventTitle}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer font-medium">Order details</summary>
          <dl className="mt-2 space-y-1">
            <div><dt className="inline font-semibold">Order: </dt><dd className="inline">{order.id}</dd></div>
            <div><dt className="inline font-semibold">Event ends: </dt><dd className="inline">{fmtStamp(order.endDateTime)}</dd></div>
            <div><dt className="inline font-semibold">Approved by: </dt><dd className="inline">{order.approvedByName} · {fmtStamp(order.approvedAt)}</dd></div>
            <div><dt className="inline font-semibold">Client approval: </dt><dd className="inline break-words">{order.approvalNote}</dd></div>
            {order.isPreviewSeed && <div><dt className="inline font-semibold">Source: </dt><dd className="inline">Sample event</dd></div>}
          </dl>
        </details>
        <div className="mt-5">
          <TabBar
            label="Order Request fulfillment sections"
            idPrefix="wh-order"
            value={subTab}
            onChange={setSubTab}
            tabs={[
              {
                key: "allocation",
                label: "Assets & dispatch",
                count: order.stockLines.length,
              },
              {
                key: "rentals",
                label: "Rentals",
                count: order.rentals.length,
              },
              {
                key: "reconciliation",
                label: "Returns & closeout",
                count: eventIncidents.filter((i) => i.resolutionStatus !== "Resolved").length,
              },
            ]}
          />
        </div>
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

          {/* Custom Fabrication Summary inside Order Request */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Custom fabrication
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Custom items registered under this event require Ground Crew after-shift photo
                  verification before Warehouse marks them Ready to Load.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                icon={Hammer}
                onClick={() => onNavigate("module-custom-fabrication")}
              >
                Manage & Verify in Custom Fabrication
              </Button>
            </div>
            {eventFabJobs.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                No custom fabrication items on this event.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {eventFabJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-line bg-fg/[0.02] p-4 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-foreground">{job.spec.name}</span>
                      <Badge
                        tone={
                          job.status === "Ready to Load"
                            ? "success"
                            : job.status === "Needs Correction"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      Qty: <strong className="text-foreground">{job.spec.requestedQty}</strong> ·
                      Dimensions: <strong className="text-foreground">{job.spec.dimensions}</strong>
                    </div>
                    <div className="text-muted-foreground">
                      Materials: {job.spec.materials} · Finish: {job.spec.finish}
                    </div>
                    <div className="text-muted-foreground">
                      Linked Ground Crew shift photos:{" "}
                      <strong className="text-foreground">{job.linkedShiftPhotoIds.length}</strong>
                      {job.verifiedByName && ` · Verified by ${job.verifiedByName}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

/* ============================================================================
 * 2. ASSET INVENTORY MODULE
 * ========================================================================== */
function AssetInventoryModule({
  actor,
  onNavigate,
}: {
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState("All")

  const categories = ["All", ...Array.from(new Set(state.inventory.map((i) => i.category)))]
  const filtered = state.inventory.filter((item) => {
    if (catFilter !== "All" && item.category !== catFilter) return false
    if (
      query.trim() &&
      !`${item.name} ${item.assetCode} ${item.category} ${item.zone}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
      return false
    return true
  })

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Asset Inventory"]}
        title="Asset Inventory"
        subtitle="Review available, allocated, and dispatched stock."
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onNavigate("module-deficit-queue")}
            >
              Deficit Queue ({state.deficitQueue.filter((d) => d.status !== "Fulfilled").length})
            </Button>
            <Button
              type="button"
              onClick={() => onNavigate("module-asset-acquisition")}
              icon={PackagePlus}
            >
              Asset Acquisition
            </Button>
          </div>
        }
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <Input
              icon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search asset name, code, or zone…"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <Button
                key={cat}
                type="button"
                variant={catFilter === cat ? "solid" : "outline"}
                onClick={() => setCatFilter(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-3 pr-4">Asset</th>
                <th className="py-3 pr-4">Warehouse Zone</th>
                <th className="py-3 pr-4">Total Stock</th>
                <th className="py-3 pr-4">Available</th>
                <th className="py-3 pr-4">Allocated</th>
                <th className="py-3 pr-4">Dispatched</th>
                <th className="py-3 pr-4">Damaged / Missing</th>
                <th className="py-3 text-right">Quick Replenish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((item) => {
                const isLow = item.availableStock <= item.reorderThreshold
                return (
                  <tr key={item.assetId} className="hover:bg-fg/[0.02]">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <Visual
                          src={item.image}
                          label={item.name}
                          className="size-10 shrink-0 rounded-md"
                        />
                        <div>
                          <div className="font-semibold text-foreground">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.assetCode} · {item.category}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">{item.zone}</td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{item.totalStock}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      <span className="mr-2 font-semibold">{item.availableStock}</span>
                      {isLow && <Badge tone="warning">Low Stock</Badge>}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{item.allocatedStock}</td>
                    <td className="py-3 pr-4 tabular-nums">{item.dispatchedStock}</td>
                    <td className="py-3 pr-4 tabular-nums text-xs">
                      {item.damagedCount > 0 || item.missingCount > 0 ? (
                        <Badge tone="danger">
                          {item.damagedCount} dmg · {item.missingCount} mis
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const res = createAcquisitionOrder({
                            assetId: item.assetId,
                            supplierName: "Lumière Preferred Supply Partner",
                            quantity: 20,
                            unitCost: 1200,
                            actorName: actor.name,
                            receiveImmediately: true,
                          })
                          if (res.ok) {
                            notify(`Received +20 ${item.name} into available stock.`)
                          }
                        }}
                      >
                        +20 Stock
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/* ============================================================================
 * 3. DEFICIT QUEUE MODULE
 * ========================================================================== */
function DeficitQueueModule({
  actor,
  onNavigate,
}: {
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Deficit Queue"]}
        title="Deficit Queue"
        subtitle="Review shortages and replenishment requests by event."
        actions={
          <Button
            type="button"
            icon={ShoppingCart}
            onClick={() => onNavigate("module-asset-acquisition")}
          >
            Go to Asset Acquisition
          </Button>
        }
      />

      <Card className="p-6">
        {state.deficitQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active stock shortages in the Deficit Queue. When an Event Manager or Warehouse
            allocation exceeds available stock, shortages appear here automatically.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4">Deficit ID</th>
                  <th className="py-3 pr-4">Event</th>
                  <th className="py-3 pr-4">Asset</th>
                  <th className="py-3 pr-4">Shortage Qty</th>
                  <th className="py-3 pr-4">Urgency</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {state.deficitQueue.map((d) => (
                  <tr key={d.id}>
                    <td className="py-3.5 pr-4 font-mono text-xs">{d.id}</td>
                    <td className="py-3.5 pr-4 font-semibold">{d.eventTitle}</td>
                    <td className="py-3.5 pr-4">
                      {d.assetName} <span className="text-xs text-muted-foreground">({d.assetCode})</span>
                    </td>
                    <td className="py-3.5 pr-4 font-bold tabular-nums text-danger">
                      {d.shortageQty}
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge tone={d.urgency === "Critical" || d.urgency === "High" ? "danger" : "warning"}>
                        {d.urgency}
                      </Badge>
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge tone={d.status === "Fulfilled" ? "success" : "info"}>
                        {d.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 text-right">
                      {d.status !== "Fulfilled" && (
                        <Button
                          type="button"
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
                            if (res.ok) {
                              notify(
                                `Acquired ${d.shortageQty} × ${d.assetName} and fulfilled shortage for ${d.eventTitle}.`,
                              )
                            }
                          }}
                        >
                          Acquire & Fulfill ({d.shortageQty})
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
    </div>
  )
}

/* ============================================================================
 * 4. ASSET ACQUISITION MODULE
 * ========================================================================== */
function AssetAcquisitionModule({ actor }: { actor: OpsActor }) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [assetId, setAssetId] = useState(state.inventory[0]?.assetId ?? "evtast-0001")
  const [supplier, setSupplier] = useState("Manila Artisan Event Supply")
  const [qty, setQty] = useState(25)
  const [unitCost, setUnitCost] = useState(1450)

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Asset Acquisition"]}
        title="Asset Acquisition"
        subtitle="Acquire new warehouse stock to resolve Deficit Queue shortages and expand inventory capacity."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="p-5 space-y-4">
          <h3 className="text-base font-bold text-foreground">Create Acquisition Order</h3>
          <Field label="Catalog Asset">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              {state.inventory.map((inv) => (
                <option key={inv.assetId} value={inv.assetId}>
                  {inv.assetCode} — {inv.name} (Avail: {inv.availableStock})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier">
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
            <Field label="Unit Cost (PHP)">
              <Input
                type="number"
                min={0}
                value={unitCost}
                onChange={(e) => setUnitCost(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              icon={PackagePlus}
              onClick={() => {
                const res = createAcquisitionOrder({
                  assetId,
                  supplierName: supplier,
                  quantity: qty,
                  unitCost,
                  actorName: actor.name,
                  receiveImmediately: true,
                })
                if (!res.ok) notify(res.error)
                else notify(`Acquisition ${res.order.id} received and added to stock.`)
              }}
            >
              Acquire & Receive Into Stock Now
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const res = createAcquisitionOrder({
                  assetId,
                  supplierName: supplier,
                  quantity: qty,
                  unitCost,
                  actorName: actor.name,
                  receiveImmediately: false,
                })
                if (!res.ok) notify(res.error)
                else notify(`Purchase Order ${res.order.id} placed.`)
              }}
            >
              Place Order (Receive Later)
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-bold text-foreground">
            Acquisition Ledger ({state.acquisitions.length})
          </h3>
          {state.acquisitions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No acquisition orders recorded yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 pr-4">Order ID</th>
                    <th className="py-3 pr-4">Asset</th>
                    <th className="py-3 pr-4">Supplier</th>
                    <th className="py-3 pr-4">Qty</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {state.acquisitions.map((acq) => (
                    <tr key={acq.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{acq.id}</td>
                      <td className="py-3 pr-4 font-semibold">{acq.assetName}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {acq.supplierName}
                      </td>
                      <td className="py-3 pr-4 font-semibold tabular-nums">+{acq.quantity}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={acq.status === "Received & Stocked" ? "success" : "info"}>
                          {acq.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        {acq.status !== "Received & Stocked" && (
                          <Button
                            type="button"
                            onClick={() => {
                              receiveAcquisitionOrder(acq.id)
                              notify(`Order ${acq.id} received into Warehouse Inventory.`)
                            }}
                          >
                            Mark Received
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
      </div>
    </div>
  )
}

/* ============================================================================
 * 5. CUSTOM FABRICATION MODULE (D02 & Scenario 2)
 * ========================================================================== */
function CustomFabricationModule({ actor }: { actor: OpsActor }) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [notesByJob, setNotesByJob] = useState<Record<string, string>>({})
  const [showNewModal, setShowNewModal] = useState(false)
  const [newSpec, setNewSpec] = useState({
    eventId: state.orderRequests[0]?.eventId ?? "",
    name: "",
    requestedQty: 1,
    dimensions: "",
    materials: "",
    colors: "",
    finish: "",
    buildInstructions: "",
    referenceImage: "/event-manager-images/garden.jpg",
  })

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Custom Fabrication"]}
        title="Custom Fabrication"
        subtitle="Review build specifications and crew photos before releasing finished items."
        actions={
          <Button type="button" icon={Plus} onClick={() => setShowNewModal((v) => !v)}>
            {showNewModal ? "Close New Job Form" : "New Production Job"}
          </Button>
        }
      />

      {showNewModal && (
        <Card className="p-5 space-y-4">
          <h3 className="text-base font-bold text-foreground">
            Create Custom Fabrication Job Linked to Approved Event
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
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
                  setNewSpec({ ...newSpec, requestedQty: Math.max(1, Number(e.target.value) || 1) })
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
              onChange={(e) => setNewSpec({ ...newSpec, buildInstructions: e.target.value })}
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
                      newSpec.buildInstructions || "Follow approved Event Manager specification.",
                    referenceImages: [newSpec.referenceImage],
                  },
                  ["crew@demo.com"],
                )
                if (!res.ok) notify(res.error)
                else {
                  notify(`Created production job for ${res.job.spec.name}.`)
                  setShowNewModal(false)
                }
              }}
            >
              Create Production Job
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-5">
        {state.fabricationJobs.map((job) => {
          const linkedPhotos = state.afterShiftPhotos.filter((p) =>
            job.linkedShiftPhotoIds.includes(p.id),
          )
          const notes = notesByJob[job.id] ?? ""
          return (
            <Card key={job.id} className="p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{job.id}</span>
                    <Badge tone="neutral">Event: {job.eventTitle}</Badge>
                    <Badge
                      tone={
                        job.status === "Ready to Load"
                          ? "success"
                          : job.status === "Needs Correction"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {job.status}
                    </Badge>
                    {job.releasedForLoading && (
                      <Badge tone="info">Included on Dispatch Manifest</Badge>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-lg font-bold text-foreground">{job.spec.name}</h3>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                {/* Left: Event Manager Verification Criteria */}
                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3 text-xs">
                  <div className="text-sm font-bold text-foreground">
                    1. Event Manager Approved Specifications (Verification Criteria)
                  </div>
                  <div className="flex items-start gap-3">
                    <Visual
                      src={job.spec.referenceImages[0] || "/event-manager-images/garden.jpg"}
                      label={job.spec.name}
                      className="size-20 shrink-0 rounded-lg"
                    />
                    <div className="grid gap-1.5 sm:grid-cols-2 flex-1">
                      <div>
                        <span className="text-muted-foreground">Approved Qty:</span>{" "}
                        <strong className="text-foreground">{job.spec.requestedQty}</strong>
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
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Finish:</span>{" "}
                        <strong className="text-foreground">{job.spec.finish}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-line pt-2">
                    <span className="font-semibold text-foreground">
                      Construction & Assembly Instructions:
                    </span>
                    <p className="mt-1 text-muted-foreground">{job.spec.buildInstructions}</p>
                  </div>
                </div>

                {/* Right: Ground Crew Linked After-Shift Work Photos & Warehouse Verification */}
                <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3 text-xs">
                  <div className="text-sm font-bold text-foreground">
                    2. Ground Crew After-Shift Work Photo & Ready-to-Load Verification
                  </div>
                  {linkedPhotos.length === 0 ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-muted-foreground">
                      <strong className="text-foreground">Awaiting Ground Crew Work Photo:</strong>{" "}
                      Ground Crew must submit an after-shift work photo linked to this fabrication
                      job in <em>Ground Crew → Evidence Capture</em> before Warehouse can verify and
                      mark it <strong>Ready to Load</strong>.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {linkedPhotos.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-start gap-3 rounded-lg border border-line bg-card p-3"
                        >
                          <Visual
                            src={p.photoUrl}
                            label={p.caption}
                            className="size-16 shrink-0 rounded-md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-foreground">{p.shiftLabel}</div>
                            <div className="text-muted-foreground">“{p.caption}”</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Submitted by <strong>{p.submittedByName}</strong> at{" "}
                              {fmtStamp(p.submittedAt)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {job.status === "Ready to Load" ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-foreground">
                      <div className="font-bold text-[#4ade80]">
                        Verified & Marked Ready to Load (Released to Dispatch Manifest)
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        Verified by <strong className="text-foreground">{job.verifiedByName}</strong>{" "}
                        at {job.verifiedAt && fmtStamp(job.verifiedAt)}:{" "}
                        “{job.verificationNotes}”
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2">
                      {job.correctionNotes && (
                        <div className="rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-danger">
                          <strong>Corrections requested:</strong> {job.correctionNotes}
                        </div>
                      )}
                      <Input
                        value={notes}
                        onChange={(e) => setNotesByJob({ ...notesByJob, [job.id]: e.target.value })}
                        placeholder="Verification notes or required corrections…"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          icon={CheckCircle2}
                          onClick={() => {
                            const res = verifyCustomFabricationJob(actor, job.id, {
                              passed: true,
                              notes,
                            })
                            if (!res.ok) notify(res.error)
                            else
                              notify(
                                `${job.spec.name} verified against Event Manager specs and marked Ready to Load! Included in dispatch manifest.`,
                              )
                          }}
                        >
                          Verify Against Spec & Mark Ready to Load
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const res = verifyCustomFabricationJob(actor, job.id, {
                              passed: false,
                              notes,
                            })
                            if (!res.ok) notify(res.error)
                            else notify(`Marked ${job.spec.name} for rework/corrections.`)
                          }}
                        >
                          Request Corrections (Keep in Production)
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================================
 * 6. PERSONNEL DEPLOYMENT & TEAM LEAD ASSIGNMENT (Scenario 1 & Scenario 8)
 * ========================================================================== */
function PersonnelDeploymentModule({ actor }: { actor: OpsActor }) {
  const state = useOperationsStore()
  const notify = useNotify()
  const availableCrew = getAvailableGroundCrewAccounts()

  const [selectedEventId, setSelectedEventId] = useState(
    () => state.orderRequests[0]?.eventId ?? "",
  )
  const order =
    state.orderRequests.find((o) => o.eventId === selectedEventId) ?? state.orderRequests[0]

  const [crewEmail, setCrewEmail] = useState(availableCrew[0]?.email ?? "crew@demo.com")
  const [schedule, setSchedule] = useState("Apr 25, 2026 · 07:00 AM – 11:59 PM")
  const [shiftLabel, setShiftLabel] = useState("Shift 1 — Ingress, Event & Return")
  const [duties, setDuties] = useState(
    "Execute dispatch loading counts, venue arrival checks, event hours monitoring, and warehouse return audit.",
  )
  const [makeLead, setMakeLead] = useState(false)
  const [replaceLeadEmail, setReplaceLeadEmail] = useState("")
  const [replaceReason, setReplaceReason] = useState("")

  if (!order) return null

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Personnel Deployment"]}
        title="Personnel Deployment"
        subtitle="Assign crew and a Team Lead, then track progress and blockers."
      />

      {/* Event Selector */}
      <div className="flex flex-wrap gap-2">
        {state.orderRequests.map((o) => (
          <Button
            key={o.eventId}
            type="button"
            variant={o.eventId === order.eventId ? "solid" : "outline"}
            onClick={() => setSelectedEventId(o.eventId)}
          >
            {o.eventTitle} ({o.id})
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Assign Ground Crew Member */}
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-bold text-foreground">
            Assign Ground Crew Member to {order.eventTitle}
          </h3>
          <p className="text-xs text-muted-foreground">
            All active <strong>Ground Crew</strong> accounts provisioned by System Admin appear
            below. Team Lead is an event-specific designation; the account role remains Ground Crew.
          </p>

          <Field label="Ground Crew Account (from System Admin Accounts)">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
              value={crewEmail}
              onChange={(e) => setCrewEmail(e.target.value)}
            >
              {availableCrew.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shift Label">
              <Input value={shiftLabel} onChange={(e) => setShiftLabel(e.target.value)} />
            </Field>
            <Field label="Schedule">
              <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} />
            </Field>
          </div>

          <Field label="Assigned Duties">
            <textarea
              className={textareaCls}
              rows={2}
              value={duties}
              onChange={(e) => setDuties(e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={makeLead}
              onChange={(e) => setMakeLead(e.target.checked)}
            />
            Designate this Ground Crew member as the event’s Team Lead upon assignment
          </label>

          <Button
            type="button"
            icon={Users}
            onClick={() => {
              const chosen = availableCrew.find((u) => u.email === crewEmail) ?? {
                email: crewEmail,
                name: crewEmail,
              }
              const res = assignCrewMemberToEvent(actor, {
                eventId: order.eventId,
                crewEmail: chosen.email,
                crewName: chosen.name,
                schedule,
                duties,
                shiftLabel,
                makeTeamLead: makeLead,
              })
              if (!res.ok) notify(res.error)
              else
                notify(
                  `Assigned ${chosen.name} (${chosen.email}) to ${order.eventTitle}${makeLead ? " as Team Lead" : ""}.`,
                )
            }}
          >
            Assign Ground Crew Member
          </Button>
        </Card>

        {/* Right: Team Lead Designation & Replacement (Scenario 8) */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-foreground">
              Team Lead
            </h3>
            {order.teamLeadName ? (
              <Badge tone="info">Current Lead: {order.teamLeadName}</Badge>
            ) : (
              <Badge tone="warning">No Team Lead Designated</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Replacing the Team Lead (including after work has started) transfers authority over
            remaining arrival confirmations, final checklists, and rental confirmations while
            preserving the original submitter on already-completed records.
          </p>

          <Field label="Select Assigned Ground Crew Member as Replacement Team Lead">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
              value={replaceLeadEmail || order.teamLeadEmail || ""}
              onChange={(e) => setReplaceLeadEmail(e.target.value)}
            >
              <option value="" disabled>
                Choose assigned crew member…
              </option>
              {order.crewAssignments.map((a) => (
                <option key={a.crewEmail} value={a.crewEmail}>
                  {a.crewName} ({a.crewEmail})
                  {order.teamLeadEmail?.toLowerCase() === a.crewEmail.toLowerCase()
                    ? " — Current Team Lead"
                    : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reason for Team Lead Designation / Replacement">
            <Input
              value={replaceReason}
              onChange={(e) => setReplaceReason(e.target.value)}
              placeholder="e.g. Shift handover after Venue Arrival; Crew Member B assuming Team Lead authority for return."
            />
          </Field>

          <Button
            type="button"
            icon={UserCheck}
            onClick={() => {
              const targetEmail = replaceLeadEmail || order.crewAssignments[0]?.crewEmail
              const targetMember = order.crewAssignments.find(
                (a) => a.crewEmail.toLowerCase() === targetEmail?.toLowerCase(),
              )
              if (!targetMember) {
                notify("Assign the Ground Crew member to this event first.")
                return
              }
              const res = designateEventTeamLead(actor, {
                eventId: order.eventId,
                newLeadEmail: targetMember.crewEmail,
                newLeadName: targetMember.crewName,
                reason: replaceReason,
              })
              if (!res.ok) notify(res.error)
              else {
                notify(
                  `Updated Team Lead for ${order.eventTitle} to ${targetMember.crewName} (${targetMember.crewEmail}). Completed records retain their original submitters.`,
                )
                setReplaceReason("")
              }
            }}
          >
            Update / Replace Event Team Lead
          </Button>

          {/* Completed Records Attribution Preservation Audit */}
          <div className="border-t border-line pt-4 text-xs space-y-1.5">
            <div className="font-semibold text-foreground">
              Completed Checkpoint Attribution (Preserved Across Replacements)
            </div>
            <div className="text-muted-foreground">
              • Final Loading Checklist:{" "}
              <strong className="text-foreground">
                {order.loadingChecklist
                  ? `${order.loadingChecklist.submittedByName} (${order.loadingChecklist.submittedByEmail})`
                  : "Pending"}
              </strong>
            </div>
            <div className="text-muted-foreground">
              • Venue Arrival Confirmation:{" "}
              <strong className="text-foreground">
                {order.venueArrival
                  ? `${order.venueArrival.submittedByName} (${order.venueArrival.submittedByEmail})`
                  : "Pending"}
              </strong>
            </div>
            <div className="text-muted-foreground">
              • Warehouse Arrival Confirmation:{" "}
              <strong className="text-foreground">
                {order.warehouseArrival
                  ? `${order.warehouseArrival.submittedByName} (${order.warehouseArrival.submittedByEmail})`
                  : "Pending"}
              </strong>
            </div>
            <div className="text-muted-foreground">
              • Final Return Checklist:{" "}
              <strong className="text-foreground">
                {order.returnChecklist
                  ? `${order.returnChecklist.submittedByName} (${order.returnChecklist.submittedByEmail})`
                  : "Pending"}
              </strong>
            </div>
          </div>

          {/* Team Lead Change Audit Log */}
          {order.teamLeadHistory.length > 0 && (
            <div className="border-t border-line pt-3 text-xs">
              <div className="font-semibold text-foreground">
                Team Lead Designation History ({order.teamLeadHistory.length})
              </div>
              <ul className="mt-2 space-y-1.5 text-muted-foreground">
                {order.teamLeadHistory.map((h) => (
                  <li key={h.id}>
                    {h.previousLeadName ? (
                      <>
                        Replaced <strong>{h.previousLeadName}</strong> with{" "}
                        <strong className="text-foreground">{h.newLeadName}</strong>
                      </>
                    ) : (
                      <>
                        Designated <strong className="text-foreground">{h.newLeadName}</strong> as
                        Team Lead
                      </>
                    )}{" "}
                    by {h.changedByName} at {fmtStamp(h.changedAt)} — “{h.reason}”
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* Assigned Crew Roster, Task Progress & Blockers */}
      <Card className="p-6">
        <h3 className="text-base font-bold text-foreground">
          Assigned Ground Crew Roster, Progress & Blockers ({order.crewAssignments.length})
        </h3>
        {order.crewAssignments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No Ground Crew members assigned to this event yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4">Crew Member</th>
                  <th className="py-3 pr-4">Designation</th>
                  <th className="py-3 pr-4">Shift & Schedule</th>
                  <th className="py-3 pr-4">Duties</th>
                  <th className="py-3 pr-4">Task Status & Blocker</th>
                  <th className="py-3 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {order.crewAssignments.map((a) => {
                  const isLead =
                    order.teamLeadEmail?.toLowerCase() === a.crewEmail.toLowerCase()
                  return (
                    <tr key={a.id}>
                      <td className="py-3.5 pr-4">
                        <div className="font-semibold text-foreground">{a.crewName}</div>
                        <div className="text-xs text-muted-foreground">{a.crewEmail}</div>
                      </td>
                      <td className="py-3.5 pr-4">
                        {isLead ? (
                          <Badge tone="info">Event Team Lead</Badge>
                        ) : (
                          <Badge tone="neutral">Ground Crew</Badge>
                        )}
                      </td>
                      <td className="py-3.5 pr-4 text-xs">
                        <div className="font-medium text-foreground">{a.shiftLabel}</div>
                        <div className="text-muted-foreground">{a.schedule}</div>
                      </td>
                      <td className="py-3.5 pr-4 text-xs text-muted-foreground max-w-xs">
                        {a.duties}
                      </td>
                      <td className="py-3.5 pr-4 text-xs">
                        <Badge
                          tone={
                            a.taskStatus === "Completed"
                              ? "success"
                              : a.taskStatus === "Blocked"
                                ? "danger"
                                : a.taskStatus === "InProgress"
                                  ? "info"
                                  : "neutral"
                          }
                        >
                          {a.taskStatus}
                        </Badge>
                        {a.blockerReason && (
                          <div className="mt-1 text-danger font-medium">
                            Blocker: “{a.blockerReason}”
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 text-right">
                        {!isLead && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              designateEventTeamLead(actor, {
                                eventId: order.eventId,
                                newLeadEmail: a.crewEmail,
                                newLeadName: a.crewName,
                                reason: `Designated ${a.crewName} as Team Lead from roster.`,
                              })
                              notify(`${a.crewName} is now the designated Team Lead.`)
                            }}
                          >
                            Make Team Lead
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ============================================================================
 * 7. DAMAGE ASSESSMENT MODULE (D05 & Scenario 6)
 * ========================================================================== */
function DamageAssessmentModule({ actor }: { actor: OpsActor }) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [resState, setResState] = useState<
    Record<string, { type: IssueResolutionType; notes: string }>
  >({})

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Damage Assessment"]}
        title="Damage Assessment"
        subtitle="Review damaged and missing items and record how each case was resolved."
      />

      <Card className="p-6">
        {state.incidentReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No field Damage Reports or Missing Item Reports have been filed yet. Reports submitted
            by Ground Crew during Venue Arrival, Event Hours, or Warehouse Arrival appear here.
          </p>
        ) : (
          <div className="space-y-4">
            {state.incidentReports.map((rep) => {
              const draft = resState[rep.id] ?? { type: "Repair Scheduled", notes: "" }
              return (
                <div
                  key={rep.id}
                  className="rounded-xl border border-line bg-fg/[0.02] p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <Visual
                        src={rep.photoUrl}
                        label={rep.itemName}
                        className="size-16 shrink-0 rounded-lg"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={rep.reportType === "Damage" ? "danger" : "warning"}>
                            {rep.reportType} Report
                          </Badge>
                          <Badge tone="info">Checkpoint: {rep.checkpoint}</Badge>
                          <Badge tone="neutral">{rep.eventTitle}</Badge>
                          <Badge
                            tone={rep.resolutionStatus === "Resolved" ? "success" : "danger"}
                          >
                            {rep.resolutionStatus}
                          </Badge>
                        </div>
                        <h4 className="mt-1 text-base font-bold text-foreground">
                          {rep.itemName} ({rep.itemCode}) · Affected Qty: {rep.quantity}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Description: “{rep.description}” · Submitted by{" "}
                          <strong className="text-foreground">{rep.submittedByName}</strong> (
                          {rep.submittedByEmail}) at {fmtStamp(rep.submittedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {rep.resolutionStatus === "Resolved" ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                      <strong className="text-[#4ade80]">
                        Documented Resolution ({rep.resolutionType}):
                      </strong>{" "}
                      {rep.resolutionNotes} · Signed off by {rep.resolvedByName} at{" "}
                      {rep.resolvedAt && fmtStamp(rep.resolvedAt)}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)_auto] items-center border-t border-line pt-3">
                      <select
                        className="h-10 rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
                        value={draft.type}
                        onChange={(e) =>
                          setResState({
                            ...resState,
                            [rep.id]: { ...draft, type: e.target.value as IssueResolutionType },
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
                        value={draft.notes}
                        onChange={(e) =>
                          setResState({
                            ...resState,
                            [rep.id]: { ...draft, notes: e.target.value },
                          })
                        }
                        placeholder="Record documented resolution (e.g. item recovered, repair ticket, approved write-off)…"
                      />
                      <Button
                        type="button"
                        icon={CheckCircle2}
                        onClick={() => {
                          const res = resolveFieldIncidentReport(actor, rep.id, {
                            resolutionType: draft.type,
                            resolutionNotes: draft.notes,
                          })
                          if (!res.ok) notify(res.error)
                          else notify(`Resolved ${rep.reportType} report ${rep.id}.`)
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
      </Card>
    </div>
  )
}
