import { useEffect, useState } from "react"
import { ClipboardCheck, FileWarning, UserCheck, Warehouse } from "lucide-react"
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui/ui"
import { fmtStamp } from "../event-manager/shared"
import {
  getEventManifestLines,
  reconcileLegacyReturnTotal,
  recordDirectVenueRentalReturn,
  setOperationsNavigationContext,
  submitArrivalCheckpoint,
  submitFieldIncidentReport,
  submitFinalReturnChecklist,
  updateManifestReturnedQuantity,
  updateTripItemReturnedQuantity,
  useOperationsStore,
  type OpsActor,
} from "../../operations/store"
import {
  EventSelectorHeader,
  getWorkerRelevantOrders,
  notifyMutationResult,
  useNotify,
} from "./ground-crew-shared"

export default function WarehouseArrivalAndReturnAuditModule({
  actor,
  initialEventId,
}: {
  actor: OpsActor
  initialEventId?: string
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const relevantOrders = getWorkerRelevantOrders(state, actor.email)
  const [selectedEventId, setSelectedEventId] = useState(
    () =>
      (initialEventId && relevantOrders.some((o) => o.eventId === initialEventId)
        ? initialEventId
        : relevantOrders[0]?.eventId) || "",
  )
  const [whPhotoUrl, setWhPhotoUrl] = useState("/event-manager-images/planning.jpg")
  const [whNotes, setWhNotes] = useState("")
  const [returnChecklistNotes, setReturnChecklistNotes] = useState("")

  useEffect(() => {
    if (initialEventId && relevantOrders.some((o) => o.eventId === initialEventId)) {
      setSelectedEventId(initialEventId)
    } else if (!relevantOrders.some((o) => o.eventId === selectedEventId)) {
      setSelectedEventId(relevantOrders[0]?.eventId || "")
    }
  }, [initialEventId, relevantOrders, selectedEventId])

  // Incident filing on return
  const [incType, setIncType] = useState<"Missing" | "Damage">("Missing")
  const [incItem, setIncItem] = useState("")
  const [incBatchId, setIncBatchId] = useState("")
  const [incQty, setIncQty] = useState(1)
  const [incDesc, setIncDesc] = useState("")
  const [incPhoto, setIncPhoto] = useState("/event-manager-images/planning.jpg")

  // Direct-to-venue rental return handback state
  const [handbackQty, setHandbackQty] = useState<Record<string, number>>({})
  const [missingRentalQty, setMissingRentalQty] = useState<Record<string, number>>({})
  const [damagedRentalQty, setDamagedRentalQty] = useState<Record<string, number>>({})
  const [returnRentalNotes, setReturnRentalNotes] = useState<Record<string, string>>({})

  const order = relevantOrders.find((o) => o.eventId === selectedEventId) ?? relevantOrders[0]
  if (!order) {
    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={["Dashboard", "My Work", "Warehouse Arrival & Returns"]}
          title="Warehouse Arrival & Returns"
          subtitle="Confirm arrival with a photo, count returns, and report discrepancies."
        />
        <Card className="p-6 text-sm text-muted-foreground">
          You have no assigned events for warehouse arrival or return audit under {actor.name} (
          {actor.email}).
        </Card>
      </div>
    )
  }

  const isClosed = Boolean(order.warehouseClosed)
  const manifestLines = getEventManifestLines(state, order.eventId)

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "My Work", "Warehouse Arrival & Returns"]}
        title="Warehouse Arrival & Returns"
        subtitle="Confirm arrival with a photo, count returns, and report discrepancies."
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={(id) => {
          setSelectedEventId(id)
          setOperationsNavigationContext({ eventId: id }, { merge: true })
        }}
      />

      {/* Step 1: Warehouse Arrival Confirmation */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Arrived at warehouse
            </h3>
            <p className="text-xs text-muted-foreground">
              The currently designated Team Lead ({order.teamLeadName || "Unassigned"}) selects
              Arrived at Warehouse and submits a photo taken at the warehouse unloading bay.
            </p>
          </div>
          {order.warehouseArrival ? (
            <Badge tone="success">
              Confirmed by {order.warehouseArrival.submittedByName} at{" "}
              {fmtStamp(order.warehouseArrival.submittedAt)}
            </Badge>
          ) : (
            <Badge tone="warning">Pending Warehouse Arrival</Badge>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
          <Field label="Mandatory Warehouse Arrival Photo URL">
            <Input
              value={whPhotoUrl}
              disabled={isClosed}
              onChange={(e) => setWhPhotoUrl(e.target.value)}
              placeholder="/event-manager-images/planning.jpg"
            />
          </Field>
          <Field label="Unloading Bay Notes">
            <Input
              value={whNotes}
              disabled={isClosed}
              onChange={(e) => setWhNotes(e.target.value)}
              placeholder="e.g. Arrived at Warehouse Bay 2; return count in progress."
            />
          </Field>
          <Button
            type="button"
            icon={Warehouse}
            disabled={isClosed}
            onClick={() => {
              const res = submitArrivalCheckpoint(actor, {
                eventId: order.eventId,
                checkpoint: "Warehouse Arrival",
                photoUrl: whPhotoUrl,
                notes: whNotes,
              })
              notifyMutationResult(
                notify,
                res,
                "Arrived at Warehouse confirmed with warehouse photo.",
              )
            }}
          >
            Confirm Arrived at Warehouse (Team Lead)
          </Button>
        </div>
      </Card>

      {/* Step 2: Return Count vs Outbound Loaded Quantities & Final Return Checklist */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Step 2 — Return Count Against Outbound Loaded Quantities & Final Return Checklist
            </h3>
            <p className="text-xs text-muted-foreground">
              Count returned items against the quantities that actually left. Any return shortfall
              requires a Missing Item Report or Damage Report for Warehouse reconciliation.
            </p>
          </div>
          {order.warehouseClosed ? (
            <Badge tone="success">
              Accountability Closed by {order.closedByName} at {fmtStamp(order.closedAt!)}
            </Badge>
          ) : order.returnChecklist ? (
            <Badge tone="success">
              Return Checklist Submitted by {order.returnChecklist.submittedByName}
            </Badge>
          ) : (order.returnChecklistHistory?.length ?? 0) > 0 ? (
            <Badge tone="warning">
              Count Changed — New Return Checklist Submission Required
            </Badge>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-3 pr-4">Asset</th>
                <th className="py-3 pr-4">Outbound Actual Loaded</th>
                <th className="py-3 pr-4">Physical Returned Qty</th>
                <th className="py-3 pr-4">Discrepancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {manifestLines.map((line) => {
                const outbound = line.loadedQty > 0 ? line.loadedQty : line.plannedQty
                const isCounted = Boolean(line.returnCounted)
                const isUncertainLegacy = Boolean(line.legacyReturnUncertain)
                const isUncounted = !isCounted && !isUncertainLegacy
                const diff = isCounted ? Math.max(0, outbound - line.returnedQty) : outbound
                const activeTripsForLine = (order.dispatchBatches ?? []).filter(
                  (b) => !b.deletedAt && b.stage !== "Cancelled" && b.items.some((i) => i.manifestLineId === line.lineId),
                )
                const tripCountedSum = activeTripsForLine.reduce((sum, b) => {
                  const bi = b.items.find((i) => i.manifestLineId === line.lineId)
                  return sum + (bi?.returnCounted ? (bi.returnActualQty ?? 0) : 0)
                }, 0)
                const hasAnyTripCount = activeTripsForLine.some(
                  (b) => b.items.find((i) => i.manifestLineId === line.lineId)?.returnCounted,
                )
                const stockLine = order.stockLines.find((s) => s.assetId === line.sourceId)
                const legacyTotal = stockLine?.legacyEventReturnedQty
                const allTripsCountedForLine =
                  activeTripsForLine.length > 0 &&
                  activeTripsForLine.every((b) => b.items.find((i) => i.manifestLineId === line.lineId)?.returnCounted)
                const hasAmbiguousEventCount =
                  legacyTotal !== undefined ||
                  (activeTripsForLine.length > 0 &&
                    isCounted &&
                    (!hasAnyTripCount || tripCountedSum !== line.returnedQty))
                const unresolvedBalance =
                  legacyTotal !== undefined
                    ? Math.abs(legacyTotal - tripCountedSum)
                    : Math.abs(line.returnedQty - tripCountedSum)
                return (
                  <tr key={line.lineId}>
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-foreground">{line.name}</div>
                      <div className="text-xs text-muted-foreground">{line.code}</div>
                      {hasAmbiguousEventCount && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge tone="warning">
                            Unallocated event count ({legacyTotal ?? line.returnedQty}) · {unresolvedBalance} unresolved — confirm per-trip counts below
                          </Badge>
                          {allTripsCountedForLine && !order.warehouseClosed && (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                const res = reconcileLegacyReturnTotal(actor, order.eventId, line.sourceId)
                                notifyMutationResult(
                                  notify,
                                  res,
                                  res.ok ? `Reconciled return total (${tripCountedSum}) for ${line.name}.` : "",
                                )
                              }}
                            >
                              Reconcile to Trip Total ({tripCountedSum})
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">
                      {outbound} {line.unit}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={outbound}
                          disabled={order.warehouseClosed}
                          value={isUncounted ? "" : line.returnedQty}
                          placeholder="Not counted yet"
                          onChange={(e) => {
                            if (e.target.value === "") return
                            const res = updateManifestReturnedQuantity(
                              order.eventId,
                              line.sourceId,
                              Number(e.target.value),
                            )
                            if (!res.ok) notifyMutationResult(notify, res)
                          }}
                          className="w-32 tabular-nums"
                        />
                        {isUncounted && outbound > 0 && !order.warehouseClosed && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const res = updateManifestReturnedQuantity(
                                order.eventId,
                                line.sourceId,
                                0,
                              )
                              if (!res.ok) notifyMutationResult(notify, res)
                            }}
                            className="h-8 px-2.5 text-xs"
                          >
                            Confirm 0
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {isUncertainLegacy ? (
                        <Badge tone="warning">Uncertain Legacy Count</Badge>
                      ) : isUncounted ? (
                        <Badge tone="warning">Not counted yet</Badge>
                      ) : diff > 0 ? (
                        <Badge tone="danger">
                          {line.returnedQty === 0
                            ? `Confirmed 0 Returned · Missing: ${diff}`
                            : `Missing / Unaccounted: ${diff}`}
                        </Badge>
                      ) : (
                        <Badge tone="success">100% Returned</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {(() => {
          const activeTrips = (order.dispatchBatches ?? []).filter(
            (b) => !b.deletedAt && b.stage !== "Cancelled" && b.items.length > 0,
          )
          if (activeTrips.length === 0) return null
          return (
            <div className="border-t border-line pt-4 space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Per-Trip Verified Return Counts</h4>
                <p className="text-xs text-muted-foreground">
                  Record or confirm returned quantities for each vehicle trip. Event totals reconcile automatically from verified trip counts.
                </p>
              </div>
              <div className="space-y-3">
                {activeTrips.map((trip) => (
                  <div key={trip.id} className="rounded-lg border border-line bg-fg/[0.02] p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-foreground">
                        {trip.id} · {trip.returnVehicleType ?? trip.vehicleType} ({trip.returnPlateNumber ?? trip.plateNumber})
                      </span>
                      <Badge tone={trip.stage === "Returned" ? "success" : "neutral"}>{trip.stage}</Badge>
                    </div>
                    <div className="divide-y divide-line">
                      {trip.items.map((item) => {
                        const plannedRet =
                          trip.direction === "outbound"
                            ? (item.returnPlannedQty ?? (item.actualQty > 0 ? item.actualQty : item.plannedQty))
                            : item.plannedQty
                        const counted = Boolean(item.returnCounted)
                        const actualRet = item.returnActualQty ?? 0
                        const shortage = counted ? Math.max(0, plannedRet - actualRet) : plannedRet
                        const locked = order.warehouseClosed || trip.stage === "Returned"
                        return (
                          <div key={item.manifestLineId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                            <div>
                              <div className="font-medium text-foreground">{item.name}</div>
                              <div className="text-muted-foreground">Expected: {plannedRet}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={plannedRet}
                                disabled={locked}
                                value={counted ? actualRet : ""}
                                placeholder="Not counted"
                                onChange={(e) => {
                                  if (e.target.value === "") return
                                  const res = updateTripItemReturnedQuantity(
                                    order.eventId,
                                    trip.id,
                                    item.manifestLineId,
                                    Number(e.target.value),
                                  )
                                  if (!res.ok) notifyMutationResult(notify, res)
                                }}
                                className="w-28 tabular-nums"
                              />
                              {!counted && plannedRet > 0 && !locked && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    const res = updateTripItemReturnedQuantity(
                                      order.eventId,
                                      trip.id,
                                      item.manifestLineId,
                                      0,
                                    )
                                    if (!res.ok) notifyMutationResult(notify, res)
                                  }}
                                  className="h-8 px-2.5 text-xs"
                                >
                                  Confirm 0
                                </Button>
                              )}
                              {!counted ? (
                                <Badge tone="warning">Not counted</Badge>
                              ) : shortage > 0 ? (
                                <Badge tone="danger">
                                  {actualRet === 0 ? `Confirmed 0 · Short ${shortage}` : `Short ${shortage}`}
                                </Badge>
                              ) : (
                                <Badge tone="success">Returned {actualRet}</Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        <div className="border-t border-line pt-4 space-y-3">
          <Field label="Final Return Checklist Notes">
            <Input
              value={returnChecklistNotes}
              disabled={order.warehouseClosed}
              onChange={(e) => setReturnChecklistNotes(e.target.value)}
              placeholder="Summary of post-event return count for Warehouse reconciliation…"
            />
          </Field>
          <Button
            type="button"
            icon={ClipboardCheck}
            disabled={order.warehouseClosed}
            onClick={() => {
              const res = submitFinalReturnChecklist(
                actor,
                order.eventId,
                returnChecklistNotes,
              )
              notifyMutationResult(
                notify,
                res,
                res.ok && res.alreadySubmitted
                  ? "Final Return Checklist was already submitted for these counts."
                  : `Final Return Checklist submitted to Warehouse${res.ok && res.autoCreatedMissingReports > 0 ? ` (${res.autoCreatedMissingReports} Missing Item Report(s) automatically logged for return discrepancies)` : ""}.`,
              )
            }}
          >
            Submit Final Return Checklist to Warehouse (Team Lead)
          </Button>
        </div>
      </Card>

      {/* Step 3: File Missing Item Report or Damage Report at Warehouse Arrival */}
      <Card className="p-6 space-y-4">
        <h3 className="text-base font-bold text-foreground">
          Step 3 — File Missing Item Report or Return Damage Report (Warehouse Arrival)
        </h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Report Type">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground disabled:opacity-50"
              disabled={isClosed}
              value={incType}
              onChange={(e) => setIncType(e.target.value as "Missing" | "Damage")}
            >
              <option value="Missing">Missing Item Report</option>
              <option value="Damage">Damage Report</option>
            </select>
          </Field>
          <Field label="Affected Item">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground disabled:opacity-50"
              disabled={isClosed}
              value={incItem}
              onChange={(e) => {
                setIncItem(e.target.value)
                setIncBatchId("")
              }}
            >
              <option value="">Choose manifest asset…</option>
              {manifestLines.map((l) => (
                <option key={l.lineId} value={`${l.code}|${l.name}`}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dispatch Trip">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground disabled:opacity-50"
              disabled={isClosed || !incItem}
              value={incBatchId}
              onChange={(e) => setIncBatchId(e.target.value)}
            >
              <option value="">Event-wide (unassigned)</option>
              {(() => {
                const [selCode = "", selName = ""] = incItem.split("|")
                return (order.dispatchBatches ?? [])
                  .filter(
                    (b) =>
                      !b.deletedAt &&
                      b.stage !== "Cancelled" &&
                      b.items.some((i) => i.itemCode === selCode || i.name === selName),
                  )
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} · {b.returnVehicleType ?? b.vehicleType} ({b.returnPlateNumber ?? b.plateNumber})
                    </option>
                  ))
              })()}
            </select>
          </Field>
          <Field label="Affected Quantity">
            <Input
              type="number"
              min={1}
              disabled={isClosed}
              value={incQty}
              onChange={(e) => setIncQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Discrepancy / Damage Description">
            <Input
              value={incDesc}
              disabled={isClosed}
              onChange={(e) => setIncDesc(e.target.value)}
              placeholder="Describe missing item or return damage details…"
            />
          </Field>
          <Field label="Evidence Photo URL">
            <Input value={incPhoto} disabled={isClosed} onChange={(e) => setIncPhoto(e.target.value)} />
          </Field>
        </div>
        <Button
          type="button"
          variant="outline"
          icon={FileWarning}
          disabled={isClosed}
          onClick={() => {
            if (!incItem) {
              notify("Select an affected asset from the event manifest before submitting.")
              return
            }
            const [code = "", name = ""] = incItem.split("|")
            const res = submitFieldIncidentReport(actor, {
              eventId: order.eventId,
              reportType: incType,
              checkpoint: "Warehouse Arrival",
              batchId: incBatchId || undefined,
              itemCode: code,
              itemName: name,
              quantity: incQty,
              description: incDesc,
              photoUrl: incPhoto,
            })
            if (notifyMutationResult(notify, res, `Filed ${incType} Report at Warehouse Arrival for ${name}.`)) {
              setIncDesc("")
              setIncBatchId("")
            }
          }}
        >
          File {incType} Report (Warehouse Arrival)
        </Button>
      </Card>

      {/* Step 4: D08 Direct-to-Venue Rental Return Verification */}
      <Card className="p-6 space-y-4">
        <h3 className="text-base font-bold text-foreground">
          Rental return to supplier
        </h3>
        <p className="text-xs text-muted-foreground">
          After the event, the Team Lead verifies the items handed back to the supplier and records
          any missing or damaged rental items. <strong>Handed Back Qty</strong> includes any damaged
          units physically returned to the supplier, so Handed Back + Missing must equal Delivered
          Qty.
        </p>

        {order.rentals.map((r) => {
          const baseQty = r.venueReceipt?.deliveredQty ?? r.ApprovedRequestedQty
          const hbVal = handbackQty[r.id] ?? baseQty
          const misVal = missingRentalQty[r.id] ?? 0
          const dmgVal = damagedRentalQty[r.id] ?? 0
          const notesVal = returnRentalNotes[r.id] ?? ""

          return (
            <div
              key={r.id}
              className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">
                  {r.vendorName} — {r.itemName} (Delivered Qty: {baseQty})
                </span>
                {r.supplierReturn ? (
                  <Badge tone={r.supplierReturn.hasDiscrepancy ? "danger" : "success"}>
                    Supplier Return Verified by {r.supplierReturn.verifiedByName}
                  </Badge>
                ) : (
                  <Badge tone="warning">Pending Supplier Return Verification</Badge>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Handed Back Qty">
                  <Input
                    type="number"
                    min={0}
                    disabled={isClosed}
                    value={hbVal}
                    onChange={(e) =>
                      setHandbackQty({
                        ...handbackQty,
                        [r.id]: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </Field>
                <Field label="Missing Qty">
                  <Input
                    type="number"
                    min={0}
                    disabled={isClosed}
                    value={misVal}
                    onChange={(e) =>
                      setMissingRentalQty({
                        ...missingRentalQty,
                        [r.id]: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </Field>
                <Field label="Damaged Qty">
                  <Input
                    type="number"
                    min={0}
                    disabled={isClosed}
                    value={dmgVal}
                    onChange={(e) =>
                      setDamagedRentalQty({
                        ...damagedRentalQty,
                        [r.id]: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </Field>
                <Field label="Handback Notes / Discrepancy">
                  <Input
                    value={notesVal}
                    disabled={isClosed}
                    onChange={(e) =>
                      setReturnRentalNotes({ ...returnRentalNotes, [r.id]: e.target.value })
                    }
                    placeholder="Notes on supplier handback…"
                  />
                </Field>
              </div>

              <Button
                type="button"
                icon={UserCheck}
                disabled={isClosed}
                onClick={() => {
                  const res = recordDirectVenueRentalReturn(actor, {
                    eventId: order.eventId,
                    rentalId: r.id,
                    handedBackQty: hbVal,
                    missingQty: misVal,
                    damagedQty: dmgVal,
                    discrepancyNotes: notesVal,
                  })
                  notifyMutationResult(
                    notify,
                    res,
                    `Recorded supplier return confirmation for ${r.vendorName}.`,
                  )
                }}
              >
                Confirm Rental Handback to Supplier (Team Lead)
              </Button>
            </div>
          )
        })}
      </Card>
    </div>
  )
}

export { WarehouseArrivalAndReturnAuditModule }
