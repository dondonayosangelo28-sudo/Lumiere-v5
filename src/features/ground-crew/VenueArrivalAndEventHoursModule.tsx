import { useEffect, useState } from "react"
import { FileWarning, MapPin, UserCheck } from "lucide-react"
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui/ui"
import { Visual, fmtStamp, textareaCls } from "../event-manager/shared"
import {
  getEventManifestLines,
  recordDirectVenueRentalReceipt,
  setOperationsNavigationContext,
  submitArrivalCheckpoint,
  submitFieldIncidentReport,
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../operations/store"
import type { CheckpointName } from "../../operations/types"
import {
  EventSelectorHeader,
  SAMPLE_PHOTOS,
  getWorkerRelevantOrders,
  notifyMutationResult,
  useNotify,
} from "./ground-crew-shared"

export default function VenueArrivalAndEventHoursModule({
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
  const [venuePhotoUrl, setVenuePhotoUrl] = useState("/event-manager-images/garden.jpg")
  const [venueNotes, setVenueNotes] = useState("")

  useEffect(() => {
    if (initialEventId && relevantOrders.some((o) => o.eventId === initialEventId)) {
      setSelectedEventId(initialEventId)
    } else if (!relevantOrders.some((o) => o.eventId === selectedEventId)) {
      setSelectedEventId(relevantOrders[0]?.eventId || "")
    }
  }, [initialEventId, relevantOrders, selectedEventId])

  // Direct-to-venue rental receipt state
  const [rentalDelivQty, setRentalDelivQty] = useState<Record<string, number>>({})
  const [rentalDiscNotes, setRentalDiscNotes] = useState<Record<string, string>>({})

  // Damage report form (supports Venue Arrival or Event Hours checkpoint)
  const [dmgCheckpoint, setDmgCheckpoint] = useState<"Venue Arrival" | "Event Hours">(
    "Event Hours",
  )
  const [dmgItem, setDmgItem] = useState("")
  const [dmgQty, setDmgQty] = useState(1)
  const [dmgDesc, setDmgDesc] = useState("")
  const [dmgPhoto, setDmgPhoto] = useState("/event-manager-images/christmas.jpg")

  const order = relevantOrders.find((o) => o.eventId === selectedEventId) ?? relevantOrders[0]
  if (!order) {
    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={["Dashboard", "My Work", "Venue Arrival & Event Hours"]}
          title="Venue Arrival & Event Hours"
          subtitle="Confirm arrival with a photo, check venue rentals, and report damage."
        />
        <Card className="p-6 text-sm text-muted-foreground">
          You have no assigned events for venue arrival or event-hours reporting under {actor.name}{" "}
          ({actor.email}).
        </Card>
      </div>
    )
  }

  const manifestLines = getEventManifestLines(state, order.eventId)
  const isClosed = Boolean(order.warehouseClosed)

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "My Work", "Venue Arrival & Event Hours"]}
        title="Venue Arrival & Event Hours"
        subtitle="Confirm arrival with a photo, check venue rentals, and report damage."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onNavigate("module-my-work", {
                eventId: order.eventId,
                groundCrewOperation: "return-audit",
              })
            }
          >
            Next: Warehouse arrival
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Checkpoint 2: Venue Arrival Confirmation */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-foreground">
              Arrived at venue
            </h3>
            {order.venueArrival ? (
              <Badge tone="success">
                Confirmed by {order.venueArrival.submittedByName}
              </Badge>
            ) : (
              <Badge tone="warning">Pending Venue Arrival</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Requires the currently designated <strong>Team Lead</strong> ({order.teamLeadName}) and
            a mandatory photo taken at <strong>{order.venue}</strong>.
          </p>

          {order.venueArrival && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
              <Visual
                src={order.venueArrival.photoUrl}
                label="Venue arrival photo"
                className="size-16 shrink-0 rounded-md"
              />
              <div>
                <div className="font-bold text-[#4ade80]">Arrived at Venue Recorded</div>
                <div>
                  Submitted by <strong>{order.venueArrival.submittedByName}</strong> (
                  {order.venueArrival.submittedByEmail}) at{" "}
                  {fmtStamp(order.venueArrival.submittedAt)}
                </div>
                <div className="text-muted-foreground">Notes: “{order.venueArrival.notes}”</div>
              </div>
            </div>
          )}

          <Field label="Mandatory Venue Arrival Photo URL">
            <div className="space-y-2">
              <Input
                value={venuePhotoUrl}
                disabled={isClosed}
                onChange={(e) => setVenuePhotoUrl(e.target.value)}
                placeholder="Paste venue photo URL or pick sample below…"
              />
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PHOTOS.map((sp) => (
                  <Button
                    key={sp.url}
                    type="button"
                    variant="ghost"
                    disabled={isClosed}
                    onClick={() => setVenuePhotoUrl(sp.url)}
                  >
                    Use: {sp.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isClosed}
                  onClick={() => setVenuePhotoUrl("")}
                >
                  Clear Photo (Test Mandatory Photo Check)
                </Button>
              </div>
            </div>
          </Field>

          <Field label="Venue Arrival Notes">
            <Input
              value={venueNotes}
              disabled={isClosed}
              onChange={(e) => setVenueNotes(e.target.value)}
              placeholder="e.g. Truck arrived at Fernbrook Service Gate B; unloading commenced."
            />
          </Field>

          <Button
            type="button"
            icon={MapPin}
            disabled={isClosed}
            onClick={() => {
              const res = submitArrivalCheckpoint(actor, {
                eventId: order.eventId,
                checkpoint: "Venue Arrival",
                photoUrl: venuePhotoUrl,
                notes: venueNotes,
              })
              notifyMutationResult(notify, res, "Arrived at Venue confirmed with venue photo.")
            }}
          >
            Confirm Arrived at Venue (Team Lead)
          </Button>
        </Card>

        {/* Checkpoint 3: Event Hours & Venue Arrival Damage Report Filing */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-foreground">
              Checkpoint 2 & 3 — File Field Damage Report
            </h3>
            <Badge tone="info">Tags: Venue Arrival / Event Hours</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            File a Damage Report if damage is discovered at Venue Arrival or when an item is
            damaged during <strong>Event Hours</strong>. Stored with checkpoint tag and photo
            evidence.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Checkpoint Tag">
              <select
                className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground disabled:opacity-50"
                disabled={isClosed}
                value={dmgCheckpoint}
                onChange={(e) =>
                  setDmgCheckpoint(e.target.value as "Venue Arrival" | "Event Hours")
                }
              >
                <option value="Event Hours">Checkpoint 3 — Event Hours</option>
                <option value="Venue Arrival">Checkpoint 2 — Venue Arrival</option>
              </select>
            </Field>
            <Field label="Affected Quantity">
              <Input
                type="number"
                min={1}
                disabled={isClosed}
                value={dmgQty}
                onChange={(e) => setDmgQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>

          <Field label="Affected Asset / Item">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground disabled:opacity-50"
              disabled={isClosed}
              value={dmgItem}
              onChange={(e) => setDmgItem(e.target.value)}
            >
              <option value="">Choose manifest asset…</option>
              {manifestLines.map((l) => (
                <option key={l.lineId} value={`${l.code}|${l.name}`}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Damage Description">
            <textarea
              className={textareaCls}
              rows={2}
              disabled={isClosed}
              value={dmgDesc}
              onChange={(e) => setDmgDesc(e.target.value)}
              placeholder="Describe how the item was damaged and its physical condition…"
            />
          </Field>

          <Field label="Damage Evidence Photo URL">
            <Input value={dmgPhoto} disabled={isClosed} onChange={(e) => setDmgPhoto(e.target.value)} />
          </Field>

          <Button
            type="button"
            icon={FileWarning}
            disabled={isClosed}
            onClick={() => {
              if (!dmgItem) {
                notify("Select an affected asset from the event manifest before submitting.")
                return
              }
              const [code = "", name = ""] = dmgItem.split("|")
              const res = submitFieldIncidentReport(actor, {
                eventId: order.eventId,
                reportType: "Damage",
                checkpoint: dmgCheckpoint as CheckpointName,
                itemCode: code,
                itemName: name,
                quantity: dmgQty,
                description: dmgDesc,
                photoUrl: dmgPhoto,
              })
              if (notifyMutationResult(notify, res, `Filed Damage Report (${dmgCheckpoint}) for ${name}.`)) {
                setDmgDesc("")
              }
            }}
          >
            Submit Damage Report ({dmgCheckpoint})
          </Button>
        </Card>
      </div>

      {/* D08: Direct-to-Venue Rentals Receipt Verification at Venue */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground">
            Rental delivery at venue
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Suppliers deliver direct-to-venue rentals directly to the venue. The Team Lead verifies
            delivered items and quantities at Venue Arrival and records any discrepancy on the
            rental record.
          </p>
        </div>

        {order.rentals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rentals registered on this event.</p>
        ) : (
          <div className="space-y-4">
            {order.rentals.map((r) => {
              const delivVal = rentalDelivQty[r.id] ?? r.ApprovedRequestedQty
              const discVal = rentalDiscNotes[r.id] ?? ""
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-bold text-foreground">
                        {r.vendorName} — {r.itemName}
                      </span>
                      <div className="text-muted-foreground">
                        Approved Requested Quantity:{" "}
                        <strong className="text-foreground">{r.ApprovedRequestedQty}</strong> ·
                        Supplier Status: <strong>{r.confirmationStatus}</strong>
                      </div>
                    </div>
                    {r.venueReceipt ? (
                      <Badge tone={r.venueReceipt.hasDiscrepancy ? "danger" : "success"}>
                        Receipt Verified by {r.venueReceipt.verifiedByName} (
                        {r.venueReceipt.deliveredQty}/{r.ApprovedRequestedQty} delivered)
                      </Badge>
                    ) : (
                      <Badge tone="warning">Pending Venue Receipt Verification</Badge>
                    )}
                  </div>

                  {r.venueReceipt && (
                    <div className="rounded-lg border border-line bg-card p-3 text-muted-foreground">
                      Recorded by <strong className="text-foreground">{r.venueReceipt.verifiedByName}</strong>{" "}
                      at {fmtStamp(r.venueReceipt.verifiedAt)}: “{r.venueReceipt.discrepancyNotes}”
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] items-end pt-1">
                    <Field label="Delivered Qty at Venue">
                      <Input
                        type="number"
                        min={0}
                        disabled={isClosed}
                        value={delivVal}
                        onChange={(e) =>
                          setRentalDelivQty({
                            ...rentalDelivQty,
                            [r.id]: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </Field>
                    <Field label="Delivery Condition / Discrepancy Notes">
                      <Input
                        value={discVal}
                        disabled={isClosed}
                        onChange={(e) =>
                          setRentalDiscNotes({ ...rentalDiscNotes, [r.id]: e.target.value })
                        }
                        placeholder="Leave blank if complete, or describe shortage/damage from supplier…"
                      />
                    </Field>
                    <Button
                      type="button"
                      icon={UserCheck}
                      disabled={isClosed}
                      onClick={() => {
                        const res = recordDirectVenueRentalReceipt(actor, {
                          eventId: order.eventId,
                          rentalId: r.id,
                          deliveredQty: delivVal,
                          discrepancyNotes: discVal,
                        })
                        notifyMutationResult(
                          notify,
                          res,
                          `Recorded venue receipt (${delivVal}/${r.ApprovedRequestedQty}) for ${r.vendorName}.`,
                        )
                      }}
                    >
                      Verify Venue Receipt (Team Lead)
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}


export { VenueArrivalAndEventHoursModule }
