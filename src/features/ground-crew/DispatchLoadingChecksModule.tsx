import { useEffect, useState } from "react"
import { ClipboardCheck, ShieldAlert } from "lucide-react"
import { Badge, Button, Card, Input, PageHeader } from "../../components/ui/ui"
import { fmtStamp } from "../event-manager/shared"
import {
  getEventManifestLines,
  setOperationsNavigationContext,
  submitFinalLoadingChecklist,
  updateManifestLoadedQuantity,
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../operations/store"
import {
  EventSelectorHeader,
  getWorkerRelevantOrders,
  notifyMutationResult,
  useNotify,
} from "./ground-crew-shared"

export default function DispatchLoadingChecksModule({
  actor,
  onNavigate,
  initialEventId,
}: {
  actor: OpsActor
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
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
  const [checklistNotes, setChecklistNotes] = useState("")

  useEffect(() => {
    if (initialEventId && relevantOrders.some((o) => o.eventId === initialEventId)) {
      setSelectedEventId(initialEventId)
    } else if (!relevantOrders.some((o) => o.eventId === selectedEventId)) {
      setSelectedEventId(relevantOrders[0]?.eventId || "")
    }
  }, [initialEventId, relevantOrders, selectedEventId])

  const order = relevantOrders.find((o) => o.eventId === selectedEventId) ?? relevantOrders[0]
  if (!order) {
    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={["Dashboard", "My Work", "Dispatch Loading Checks"]}
          title="Dispatch Loading Checks"
          subtitle="Count the load against the manifest before the vehicle leaves."
        />
        <Card className="p-6 text-sm text-muted-foreground">
          You have no assigned events for dispatch loading checks under {actor.name} ({actor.email}).
        </Card>
      </div>
    )
  }

  const isTeamLead = order.teamLeadEmail?.toLowerCase() === actor.email.toLowerCase()
  const isLocked = Boolean(order.outboundDeparture || order.warehouseClosed)
  const manifestLines = getEventManifestLines(state, order.eventId)
  const shortfalls = manifestLines.filter((l) => l.loadedQty < l.plannedQty)

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "My Work", "Dispatch Loading Checks"]}
        title="Dispatch Loading Checks"
        subtitle="Count the load against the manifest before the vehicle leaves."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onNavigate("module-my-work", {
                eventId: order.eventId,
                groundCrewOperation: "venue-arrival",
              })
            }
          >
            Next: Venue arrival
          </Button>
        }
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={(id) => {
          setSelectedEventId(id)
          setOperationsNavigationContext({ eventId: id }, { merge: true })
        }}
      />

      {manifestLines.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">The manifest will appear once Warehouse releases items for loading.</Card>
      ) : shortfalls.length > 0 ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-4">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-danger">Departure blocked</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {shortfalls.length} {shortfalls.length === 1 ? "item is" : "items are"} below the planned quantity. Load the remaining items and update the counts.
            </p>
          </div>
        </div>
      ) : (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-4 py-3">
          <Badge tone="success">Counts match the manifest</Badge>
          {order.loadingChecklist && <span className="text-sm text-muted-foreground">Submitted by {order.loadingChecklist.submittedByName}</span>}
        </div>
      )}

      <Card className="space-y-4 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-semibold">Loading checklist</h3>
          <p className="mt-1 text-sm text-muted-foreground">Enter the quantity you counted on the vehicle.</p>
        </div>
        {manifestLines.length > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {manifestLines.map((line) => (
              <li key={line.lineId} className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_9rem]">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{line.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{line.code} · {line.plannedQty} planned</p>
                </div>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Loaded</span>
                  <Input
                    aria-label={"Loaded quantity for " + line.name}
                    type="number"
                    min={0}
                    max={line.plannedQty}
                    value={line.loadedQty}
                    disabled={Boolean(order.outboundDeparture || order.warehouseClosed)}
                    onChange={(event) => {
                      const res = updateManifestLoadedQuantity(
                        order.eventId,
                        line.sourceId,
                        Number(event.target.value),
                      )
                      if (!res.ok) notifyMutationResult(notify, res)
                    }}
                    className="tabular-nums"
                  />
                </label>
                <div className="col-span-2 sm:col-span-1 sm:justify-self-end">
                  {order.outboundDeparture || order.warehouseClosed ? (
                    <Badge tone="neutral">Locked after departure</Badge>
                  ) : (
                    <Badge tone={line.shortfallQty > 0 ? "danger" : "neutral"}>
                      {line.shortfallQty > 0 ? line.shortfallQty + " remaining" : "Full quantity"}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Team Lead Final Loading Checklist Submission */}
        <div className="border-t border-line pt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-foreground">
                Submit loading checklist
              </h4>
              <p className="text-xs text-muted-foreground">
                Current Event Team Lead:{" "}
                <strong className="text-foreground">
                  {order.teamLeadName || "Unassigned"} ({order.teamLeadEmail || "—"})
                </strong>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {order.outboundDeparture ? (
                <Badge tone="info">
                  Departed Warehouse {fmtStamp(order.outboundDeparture.confirmedAt)}
                </Badge>
              ) : (
                <Badge tone="warning">Awaiting Warehouse Departure</Badge>
              )}
              {order.loadingChecklist && (
                <Badge tone="success">
                  Submitted by {order.loadingChecklist.submittedByName} at{" "}
                  {fmtStamp(order.loadingChecklist.submittedAt)}
                </Badge>
              )}
            </div>
          </div>

          <Input
            value={checklistNotes}
            disabled={isLocked}
            onChange={(e) => setChecklistNotes(e.target.value)}
            placeholder="Add a note about the load (optional)"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              icon={ClipboardCheck}
              disabled={isLocked}
              onClick={() => {
                const res = submitFinalLoadingChecklist(actor, order.eventId, checklistNotes)
                notifyMutationResult(
                  notify,
                  res,
                  "Final Loading Checklist submitted! Vehicle is now cleared for Warehouse outbound departure.",
                )
              }}
            >
              Submit Final Loading Checklist (Team Lead)
            </Button>
            {!isTeamLead && (
              <span className="text-xs text-amber-400">
                Note: You are signed in as {actor.name} ({actor.email}). Submitting will verify
                Team Lead permission rules.
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}


export { DispatchLoadingChecksModule }
