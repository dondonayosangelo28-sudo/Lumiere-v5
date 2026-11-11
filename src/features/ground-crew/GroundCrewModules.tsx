import { useState } from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  MapPin,
  Play,
  RotateCcw,
  ShieldAlert,
  Truck,
  UserCheck,
  Warehouse,
} from "lucide-react"
import { useNotify as useRawNotify } from "../../components/Notifications"
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui"

function useNotify() {
  const raw = useRawNotify()
  return (text: string) => {
    const isErr = /cannot|blocked|error|require|only|select|specify|enter|describe|provide|prepare|not found|confirm arrived/i.test(text)
    raw({ tone: isErr ? "error" : "success", text })
  }
}
import { Visual, fmtStamp, textareaCls } from "../event-manager/shared"
import {
  getEventManifestLines,
  recordDirectVenueRentalReceipt,
  recordDirectVenueRentalReturn,
  submitAfterShiftWorkPhoto,
  submitArrivalCheckpoint,
  submitFieldIncidentReport,
  submitFinalLoadingChecklist,
  submitFinalReturnChecklist,
  updateCrewTaskExecutionStatus,
  updateManifestLoadedQuantity,
  updateManifestReturnedQuantity,
  useOperationsStore,
  type OpsActor,
} from "../../operations/store"
import type { CheckpointName } from "../../operations/types"

const SAMPLE_PHOTOS = [
  { label: "Glasshouse Venue Setup Photo", url: "/event-manager-images/garden.jpg" },
  { label: "Custom Fabrication Finished Plinth Photo", url: "/event-manager-images/corporate.jpg" },
  { label: "Warehouse Loading Bay Photo", url: "/event-manager-images/planning.jpg" },
  { label: "Event Hours Table & Chandelier Photo", url: "/event-manager-images/christmas.jpg" },
]

export function GroundCrewDashboardSummary({
  actor,
  onNavigate,
}: {
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  const state = useOperationsStore()
  const email = actor.email.toLowerCase()
  const assignedOrders = state.orderRequests.filter((order) =>
    order.crewAssignments.some((assignment) => assignment.crewEmail.toLowerCase() === email),
  )
  const hasAssignments = assignedOrders.length > 0

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your events</h2>
          <p className="mt-1 text-sm text-muted-foreground">See what is assigned to you and where each event stands.</p>
        </div>
        {hasAssignments && (
          <Button type="button" icon={ClipboardCheck} onClick={() => onNavigate("module-assigned-work")}>Open assigned work</Button>
        )}
      </div>
      {!hasAssignments ? (
        <div className="border-t border-line px-5 py-5">
          <p className="text-sm font-semibold">No events assigned yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Your events will appear when Warehouse assigns you.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {assignedOrders.map((order) => {
            const checkpoints = [
              { title: "Dispatch Loading", status: order.loadingChecklist ? "Submitted" : "Pending" },
              { title: "Venue Arrival", status: order.venueArrival ? "Confirmed" : "Pending" },
              { title: "Event Hours", status: order.returnChecklist ? "Past" : order.venueArrival ? "Reporting open" : "Upcoming" },
              { title: "Warehouse Arrival", status: order.returnChecklist ? "Return submitted" : order.warehouseArrival ? "Arrived" : "Pending" },
            ]
            return (
              <li key={order.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold">{order.eventTitle}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{order.venue} · {fmtStamp(order.startDateTime)}</p>
                  </div>
                  {order.teamLeadEmail?.toLowerCase() === email && <Badge tone="info">Team Lead</Badge>}
                </div>
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {checkpoints.map((checkpoint, index) => (
                    <li key={checkpoint.title} className="min-w-0 rounded-lg border border-line px-2.5 py-2">
                      <p className="text-xs font-semibold">{index + 1}. {checkpoint.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{checkpoint.status}</p>
                    </li>
                  ))}
                </ol>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export default function GroundCrewModulePage({
  moduleKey,
  actor,
  onNavigate,
}: {
  moduleKey: string
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  switch (moduleKey) {
    case "assigned-work":
      return <AssignedWorkModule actor={actor} onNavigate={onNavigate} />
    case "dispatch-checks":
      return <DispatchLoadingChecksModule actor={actor} onNavigate={onNavigate} />
    case "venue-arrival":
      return <VenueArrivalAndEventHoursModule actor={actor} onNavigate={onNavigate} />
    case "evidence-capture":
      return <EvidenceCaptureModule actor={actor} />
    case "post-event-audits":
      return <WarehouseArrivalAndReturnAuditModule actor={actor} />
    default:
      return <AssignedWorkModule actor={actor} onNavigate={onNavigate} />
  }
}

function EventSelectorHeader({
  actor,
  selectedEventId,
  onSelect,
}: {
  actor: OpsActor
  selectedEventId: string
  onSelect: (id: string) => void
}) {
  const state = useOperationsStore()
  const order =
    state.orderRequests.find((o) => o.eventId === selectedEventId) ?? state.orderRequests[0]
  if (!order) return null

  const isTeamLead = order.teamLeadEmail?.toLowerCase() === actor.email.toLowerCase()

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:max-w-72">
          <Field label="Event">
            <select
              className="h-10 w-full rounded-md border border-line bg-elev px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
              value={order.eventId}
              onChange={(event) => onSelect(event.target.value)}
            >
              {state.orderRequests.map((item) => <option key={item.eventId} value={item.eventId}>{item.eventTitle}</option>)}
            </select>
          </Field>
        </div>
        <Badge tone={isTeamLead ? "info" : "neutral"}>{isTeamLead ? "Team Lead" : `Team Lead: ${order.teamLeadName || "Unassigned"}`}</Badge>
      </div>
    </Card>
  )
}

/* ============================================================================
 * 1. ASSIGNED WORK MODULE
 * ========================================================================== */
function AssignedWorkModule({
  actor,
  onNavigate,
}: {
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [selectedEventId, setSelectedEventId] = useState(
    () => state.orderRequests[0]?.eventId ?? "",
  )
  const [blockerInputs, setBlockerInputs] = useState<Record<string, string>>({})

  const order =
    state.orderRequests.find((o) => o.eventId === selectedEventId) ?? state.orderRequests[0]
  if (!order) return null

  const manifestLines = getEventManifestLines(state, order.eventId)

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Ground Crew", "Assigned Work"]}
        title="Assigned Work"
        subtitle="Review your event, assigned duties, and dispatch manifest."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              icon={Camera}
              onClick={() => onNavigate("module-evidence-capture")}
            >
              Add shift photo
            </Button>
            <Button
              type="button"
              icon={Truck}
              onClick={() => onNavigate("module-dispatch-checks")}
            >
              Loading checklist
            </Button>
          </div>
        }
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={setSelectedEventId}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Assigned Tasks & Blocker Controls */}
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Assigned Duties & Shift Execution — {order.eventTitle}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Venue: <strong className="text-foreground">{order.venue}</strong> · Event Window:{" "}
              <strong className="text-foreground">
                {order.startDateTime.replace("T", " ")} – {order.endDateTime.replace("T", " ")}
              </strong>
            </p>
          </div>

          {order.crewAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Ground Crew assignments on this event yet. Warehouse Operations Manager assigns
              crew in Personnel Deployment.
            </p>
          ) : (
            <div className="space-y-4">
              {order.crewAssignments.map((asg) => {
                const isLead =
                  order.teamLeadEmail?.toLowerCase() === asg.crewEmail.toLowerCase()
                const blockerText = blockerInputs[asg.id] ?? ""
                return (
                  <div
                    key={asg.id}
                    className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-foreground">{asg.crewName}</span>
                          <span className="text-xs text-muted-foreground">({asg.crewEmail})</span>
                          {isLead && <Badge tone="info">Designated Team Lead</Badge>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          <strong>{asg.shiftLabel}</strong> · {asg.schedule}
                        </div>
                      </div>
                      <Badge
                        tone={
                          asg.taskStatus === "Completed"
                            ? "success"
                            : asg.taskStatus === "Blocked"
                              ? "danger"
                              : asg.taskStatus === "InProgress"
                                ? "info"
                                : "neutral"
                        }
                      >
                        {asg.taskStatus}
                      </Badge>
                    </div>

                    <p className="text-xs text-foreground">
                      <strong>Duties:</strong> {asg.duties}
                    </p>

                    {asg.blockerReason && (
                      <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                        <strong>Reported Blocker:</strong> “{asg.blockerReason}” (Visible in
                        Warehouse → Personnel Deployment)
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      {asg.taskStatus === "Assigned" && (
                        <Button
                          type="button"
                          icon={Play}
                          onClick={() => {
                            updateCrewTaskExecutionStatus(actor, {
                              eventId: order.eventId,
                              assignmentId: asg.id,
                              status: "InProgress",
                            })
                            notify(`Started task for ${asg.crewName}.`)
                          }}
                        >
                          Start Task
                        </Button>
                      )}
                      {asg.taskStatus === "Blocked" && (
                        <Button
                          type="button"
                          icon={RotateCcw}
                          onClick={() => {
                            updateCrewTaskExecutionStatus(actor, {
                              eventId: order.eventId,
                              assignmentId: asg.id,
                              status: "InProgress",
                            })
                            notify(`Resumed work for ${asg.crewName}.`)
                          }}
                        >
                          Resume Work
                        </Button>
                      )}
                      {asg.taskStatus !== "Completed" && (
                        <Button
                          type="button"
                          variant="outline"
                          icon={CheckCircle2}
                          onClick={() => {
                            updateCrewTaskExecutionStatus(actor, {
                              eventId: order.eventId,
                              assignmentId: asg.id,
                              status: "Completed",
                            })
                            notify(`Marked task Completed for ${asg.crewName}.`)
                          }}
                        >
                          Mark Task Complete
                        </Button>
                      )}
                    </div>

                    {asg.taskStatus !== "Completed" && (
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] pt-1">
                        <Input
                          value={blockerText}
                          onChange={(e) =>
                            setBlockerInputs({ ...blockerInputs, [asg.id]: e.target.value })
                          }
                          placeholder="Reason for blocker (e.g. venue freight elevator locked, missing hardware)…"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          icon={AlertTriangle}
                          onClick={() => {
                            const res = updateCrewTaskExecutionStatus(actor, {
                              eventId: order.eventId,
                              assignmentId: asg.id,
                              status: "Blocked",
                              blockerReason: blockerText,
                            })
                            if (!res.ok) notify(res.error)
                            else {
                              notify("Blocker reported to Warehouse Operations Manager.")
                              setBlockerInputs({ ...blockerInputs, [asg.id]: "" })
                            }
                          }}
                        >
                          Report Blocker
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Event Dispatch Manifest Preview */}
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-bold text-foreground">
            Event Dispatch Manifest ({manifestLines.length} lines)
          </h3>
          <p className="text-xs text-muted-foreground">
            Assets transported by Ground Crew. Direct-to-venue rentals are verified separately at
            Venue Arrival.
          </p>
          <ul className="divide-y divide-line text-xs">
            {manifestLines.map((line) => (
              <li key={line.lineId} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-foreground">{line.name}</div>
                  <div className="text-muted-foreground">
                    {line.code} · {line.category}
                  </div>
                </div>
                <Badge tone={line.loadedQty >= line.plannedQty ? "success" : "warning"}>
                  {line.loadedQty}/{line.plannedQty} {line.unit}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

/* ============================================================================
 * 2. CHECKPOINT 1 — DISPATCH LOADING CHECKS (D03 & Scenario 3, 7, 8)
 * ========================================================================== */
function DispatchLoadingChecksModule({
  actor,
  onNavigate,
}: {
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [selectedEventId, setSelectedEventId] = useState(
    () => state.orderRequests[0]?.eventId ?? "",
  )
  const [checklistNotes, setChecklistNotes] = useState("")

  const order =
    state.orderRequests.find((o) => o.eventId === selectedEventId) ?? state.orderRequests[0]
  if (!order) return null

  const isTeamLead = order.teamLeadEmail?.toLowerCase() === actor.email.toLowerCase()
  const manifestLines = getEventManifestLines(state, order.eventId)
  const shortfalls = manifestLines.filter((l) => l.loadedQty < l.plannedQty)

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Ground Crew", "Dispatch Loading Checks"]}
        title="Dispatch Loading Checks"
        subtitle="Count the load against the manifest before the vehicle leaves."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => onNavigate("module-venue-arrival")}
          >
            Next: Venue arrival
          </Button>
        }
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={setSelectedEventId}
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
                    onChange={(event) => updateManifestLoadedQuantity(order.eventId, line.sourceId, Number(event.target.value))}
                    className="tabular-nums"
                  />
                </label>
                <div className="col-span-2 sm:col-span-1 sm:justify-self-end">
                  <Badge tone={line.shortfallQty > 0 ? "danger" : "neutral"}>
                    {line.shortfallQty > 0 ? line.shortfallQty + " remaining" : "Full quantity"}
                  </Badge>
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
            {order.loadingChecklist && (
              <Badge tone="success">
                Submitted by {order.loadingChecklist.submittedByName} at{" "}
                {fmtStamp(order.loadingChecklist.submittedAt)}
              </Badge>
            )}
          </div>

          <Input
            value={checklistNotes}
            onChange={(e) => setChecklistNotes(e.target.value)}
            placeholder="Add a note about the load (optional)"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              icon={ClipboardCheck}
              onClick={() => {
                const res = submitFinalLoadingChecklist(actor, order.eventId, checklistNotes)
                if (!res.ok) notify(res.error)
                else
                  notify(
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

/* ============================================================================
 * 3. CHECKPOINT 2 (VENUE ARRIVAL + D08 RECEIPT) & CHECKPOINT 3 (EVENT HOURS)
 * ========================================================================== */
function VenueArrivalAndEventHoursModule({
  actor,
  onNavigate,
}: {
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [selectedEventId, setSelectedEventId] = useState(
    () => state.orderRequests[0]?.eventId ?? "",
  )
  const [venuePhotoUrl, setVenuePhotoUrl] = useState("/event-manager-images/garden.jpg")
  const [venueNotes, setVenueNotes] = useState("")

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

  const order =
    state.orderRequests.find((o) => o.eventId === selectedEventId) ?? state.orderRequests[0]
  if (!order) return null

  const manifestLines = getEventManifestLines(state, order.eventId)

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Ground Crew", "Venue Arrival Checks"]}
        title="Venue Arrival & Event Hours"
        subtitle="Confirm arrival with a photo, check venue rentals, and report damage."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => onNavigate("module-post-event-audits")}
          >
            Next: Warehouse arrival
          </Button>
        }
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={setSelectedEventId}
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
                onChange={(e) => setVenuePhotoUrl(e.target.value)}
                placeholder="Paste venue photo URL or pick sample below…"
              />
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PHOTOS.map((sp) => (
                  <Button
                    key={sp.url}
                    type="button"
                    variant="ghost"
                    onClick={() => setVenuePhotoUrl(sp.url)}
                  >
                    Use: {sp.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
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
              onChange={(e) => setVenueNotes(e.target.value)}
              placeholder="e.g. Truck arrived at Fernbrook Service Gate B; unloading commenced."
            />
          </Field>

          <Button
            type="button"
            icon={MapPin}
            onClick={() => {
              const res = submitArrivalCheckpoint(actor, {
                eventId: order.eventId,
                checkpoint: "Venue Arrival",
                photoUrl: venuePhotoUrl,
                notes: venueNotes,
              })
              if (!res.ok) notify(res.error)
              else notify("Arrived at Venue confirmed with venue photo.")
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
                className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
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
                value={dmgQty}
                onChange={(e) => setDmgQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>

          <Field label="Affected Asset / Item">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
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
              value={dmgDesc}
              onChange={(e) => setDmgDesc(e.target.value)}
              placeholder="Describe how the item was damaged and its physical condition…"
            />
          </Field>

          <Field label="Damage Evidence Photo URL">
            <Input value={dmgPhoto} onChange={(e) => setDmgPhoto(e.target.value)} />
          </Field>

          <Button
            type="button"
            icon={FileWarning}
            onClick={() => {
              const [code = "AST-0001", name = manifestLines[0]?.name || "Event Asset"] = dmgItem
                ? dmgItem.split("|")
                : ["AST-0001", manifestLines[0]?.name || "Event Asset"]
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
              if (!res.ok) notify(res.error)
              else {
                notify(`Filed Damage Report (${dmgCheckpoint}) for ${name}.`)
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
                        onChange={(e) =>
                          setRentalDiscNotes({ ...rentalDiscNotes, [r.id]: e.target.value })
                        }
                        placeholder="Leave blank if complete, or describe shortage/damage from supplier…"
                      />
                    </Field>
                    <Button
                      type="button"
                      icon={UserCheck}
                      onClick={() => {
                        const res = recordDirectVenueRentalReceipt(actor, {
                          eventId: order.eventId,
                          rentalId: r.id,
                          deliveredQty: delivVal,
                          discrepancyNotes: discVal,
                        })
                        if (!res.ok) notify(res.error)
                        else
                          notify(
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

/* ============================================================================
 * 4. EVIDENCE CAPTURE MODULE — AFTER-EVERY-SHIFT WORK PHOTOS (D02 & Scenario 2, 7)
 * ========================================================================== */
function EvidenceCaptureModule({ actor }: { actor: OpsActor }) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [selectedEventId, setSelectedEventId] = useState(
    () => state.orderRequests[0]?.eventId ?? "",
  )
  const [shiftLabel, setShiftLabel] = useState("Shift 1 — Custom Fabrication & Ingress Prep")
  const [photoUrl, setPhotoUrl] = useState("/event-manager-images/corporate.jpg")
  const [caption, setCaption] = useState(
    "Completed fabrication and assembly per Event Manager dimensions and finish specifications.",
  )
  const [isFabrication, setIsFabrication] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState("")

  const order =
    state.orderRequests.find((o) => o.eventId === selectedEventId) ?? state.orderRequests[0]
  if (!order) return null

  const eventJobs = state.fabricationJobs.filter((j) => j.eventId === order.eventId)
  const activeJobId = selectedJobId || eventJobs[0]?.id || ""

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Ground Crew", "Evidence Capture"]}
        title="Evidence Capture"
        subtitle="Add a work photo after each shift. Link fabrication photos to the production job."
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={(id) => {
          setSelectedEventId(id)
          setSelectedJobId("")
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[440px_minmax(0,1fr)]">
        {/* Left: Submit After-Shift Work Photo */}
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-bold text-foreground">
            Submit After-Shift Work Photo
          </h3>
          <p className="text-xs text-muted-foreground">
            After-shift work photos are stored separately from Venue/Warehouse Arrival confirmation
            photos and Damage Report evidence photos.
          </p>

          <Field label="Shift Label">
            <Input
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              placeholder="e.g. Shift 1 — Custom Fabrication Workshop"
            />
          </Field>

          <Field label="Work Photo URL">
            <div className="space-y-2">
              <Input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="/event-manager-images/corporate.jpg"
              />
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PHOTOS.map((sp) => (
                  <Button
                    key={sp.url}
                    type="button"
                    variant="ghost"
                    onClick={() => setPhotoUrl(sp.url)}
                  >
                    {sp.label}
                  </Button>
                ))}
              </div>
            </div>
          </Field>

          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={isFabrication}
              onChange={(e) => setIsFabrication(e.target.checked)}
            />
            This shift involved Custom Fabrication work (link photo to production job)
          </label>

          {isFabrication && (
            <Field label="Link to Custom Fabrication Job">
              {eventJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No custom fabrication jobs on this event.
                </p>
              ) : (
                <select
                  className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
                  value={activeJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                >
                  {eventJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.spec.name} ({j.status})
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <Field label="Work Completed Caption / Notes">
            <textarea
              className={textareaCls}
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </Field>

          <Button
            type="button"
            icon={Camera}
            onClick={() => {
              const res = submitAfterShiftWorkPhoto(actor, {
                eventId: order.eventId,
                shiftLabel,
                photoUrl,
                caption,
                isFabricationWork: isFabrication && Boolean(activeJobId),
                fabricationJobId: isFabrication ? activeJobId : undefined,
              })
              if (!res.ok) notify(res.error)
              else
                notify(
                  `After-shift work photo submitted${isFabrication && activeJobId ? " and linked to Custom Fabrication job for Warehouse Ready-to-Load verification" : ""}.`,
                )
            }}
          >
            Submit After-Shift Work Photo
          </Button>
        </Card>

        {/* Right: Distinct Photo Categories (Scenario 7) */}
        <div className="space-y-6">
          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                Category A — After-Shift Work Photos ({state.afterShiftPhotos.length})
              </h3>
              <Badge tone="info">Shift & Fabrication Progress</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {state.afterShiftPhotos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-fg/[0.02] p-3 text-xs"
                >
                  <Visual
                    src={p.photoUrl}
                    label={p.caption}
                    className="size-16 shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground">{p.shiftLabel}</div>
                    <div className="text-muted-foreground">{p.eventTitle}</div>
                    {p.isFabricationWork && (
                      <Badge tone="info">Linked to Job: {p.fabricationJobId}</Badge>
                    )}
                    <p className="mt-1 text-muted-foreground">“{p.caption}”</p>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      By {p.submittedByName} · {fmtStamp(p.submittedAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                Category B — Checkpoint Arrival Confirmation Photos (Venue & Warehouse)
              </h3>
              <Badge tone="success">Team Lead Arrival Checkpoints</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-line bg-fg/[0.02] p-3">
                <div className="font-semibold text-foreground">2. Venue Arrival Photo</div>
                {order.venueArrival ? (
                  <div className="mt-2 flex items-start gap-3">
                    <Visual
                      src={order.venueArrival.photoUrl}
                      label="Venue arrival"
                      className="size-14 shrink-0 rounded-md"
                    />
                    <div>
                      <div>Submitted by {order.venueArrival.submittedByName}</div>
                      <div className="text-muted-foreground">
                        {fmtStamp(order.venueArrival.submittedAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">Not submitted yet.</p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-fg/[0.02] p-3">
                <div className="font-semibold text-foreground">4. Warehouse Arrival Photo</div>
                {order.warehouseArrival ? (
                  <div className="mt-2 flex items-start gap-3">
                    <Visual
                      src={order.warehouseArrival.photoUrl}
                      label="Warehouse arrival"
                      className="size-14 shrink-0 rounded-md"
                    />
                    <div>
                      <div>Submitted by {order.warehouseArrival.submittedByName}</div>
                      <div className="text-muted-foreground">
                        {fmtStamp(order.warehouseArrival.submittedAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">Not submitted yet.</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                Category C — Damage & Missing Incident Evidence ({state.incidentReports.length})
              </h3>
              <Badge tone="danger">Field Incident Evidence</Badge>
            </div>
            {state.incidentReports.length === 0 ? (
              <p className="text-xs text-muted-foreground">No incident evidence photos filed.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                {state.incidentReports.map((inc) => (
                  <div
                    key={inc.id}
                    className="flex items-start gap-3 rounded-xl border border-line bg-fg/[0.02] p-3"
                  >
                    <Visual
                      src={inc.photoUrl}
                      label={inc.itemName}
                      className="size-14 shrink-0 rounded-md"
                    />
                    <div>
                      <div className="font-semibold text-foreground">
                        {inc.reportType}: {inc.itemName} (×{inc.quantity})
                      </div>
                      <div className="text-muted-foreground">Checkpoint: {inc.checkpoint}</div>
                      <div className="text-muted-foreground">By {inc.submittedByName}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
 * 5. CHECKPOINT 4 — WAREHOUSE ARRIVAL, RETURN CHECKLIST & D08 RENTAL RETURN
 * ========================================================================== */
function WarehouseArrivalAndReturnAuditModule({ actor }: { actor: OpsActor }) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [selectedEventId, setSelectedEventId] = useState(
    () => state.orderRequests[0]?.eventId ?? "",
  )
  const [whPhotoUrl, setWhPhotoUrl] = useState("/event-manager-images/planning.jpg")
  const [whNotes, setWhNotes] = useState("")
  const [returnChecklistNotes, setReturnChecklistNotes] = useState("")

  // Incident filing on return
  const [incType, setIncType] = useState<"Missing" | "Damage">("Missing")
  const [incItem, setIncItem] = useState("")
  const [incQty, setIncQty] = useState(1)
  const [incDesc, setIncDesc] = useState("")
  const [incPhoto, setIncPhoto] = useState("/event-manager-images/planning.jpg")

  // Direct-to-venue rental return handback state
  const [handbackQty, setHandbackQty] = useState<Record<string, number>>({})
  const [missingRentalQty, setMissingRentalQty] = useState<Record<string, number>>({})
  const [damagedRentalQty, setDamagedRentalQty] = useState<Record<string, number>>({})
  const [returnRentalNotes, setReturnRentalNotes] = useState<Record<string, string>>({})

  const order =
    state.orderRequests.find((o) => o.eventId === selectedEventId) ?? state.orderRequests[0]
  if (!order) return null

  const manifestLines = getEventManifestLines(state, order.eventId)

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Ground Crew", "Post-event Asset Audits"]}
        title="Warehouse Arrival & Returns"
        subtitle="Confirm arrival with a photo, count returns, and report discrepancies."
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={setSelectedEventId}
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
              onChange={(e) => setWhPhotoUrl(e.target.value)}
              placeholder="/event-manager-images/planning.jpg"
            />
          </Field>
          <Field label="Unloading Bay Notes">
            <Input
              value={whNotes}
              onChange={(e) => setWhNotes(e.target.value)}
              placeholder="e.g. Arrived at Warehouse Bay 2; return count in progress."
            />
          </Field>
          <Button
            type="button"
            icon={Warehouse}
            onClick={() => {
              const res = submitArrivalCheckpoint(actor, {
                eventId: order.eventId,
                checkpoint: "Warehouse Arrival",
                photoUrl: whPhotoUrl,
                notes: whNotes,
              })
              if (!res.ok) notify(res.error)
              else notify("Arrived at Warehouse confirmed with warehouse photo.")
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
          {order.returnChecklist && (
            <Badge tone="success">
              Return Checklist Submitted by {order.returnChecklist.submittedByName}
            </Badge>
          )}
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
                const diff = Math.max(0, outbound - line.returnedQty)
                return (
                  <tr key={line.lineId}>
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-foreground">{line.name}</div>
                      <div className="text-xs text-muted-foreground">{line.code}</div>
                    </td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">
                      {outbound} {line.unit}
                    </td>
                    <td className="py-3 pr-4">
                      <Input
                        type="number"
                        min={0}
                        max={outbound}
                        value={line.returnedQty}
                        onChange={(e) => {
                          updateManifestReturnedQuantity(
                            order.eventId,
                            line.sourceId,
                            Number(e.target.value),
                          )
                        }}
                        className="w-24 tabular-nums"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      {diff > 0 ? (
                        <Badge tone="danger">Missing / Unaccounted: {diff}</Badge>
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

        <div className="border-t border-line pt-4 space-y-3">
          <Field label="Final Return Checklist Notes">
            <Input
              value={returnChecklistNotes}
              onChange={(e) => setReturnChecklistNotes(e.target.value)}
              placeholder="Summary of post-event return count for Warehouse reconciliation…"
            />
          </Field>
          <Button
            type="button"
            icon={ClipboardCheck}
            onClick={() => {
              const res = submitFinalReturnChecklist(
                actor,
                order.eventId,
                returnChecklistNotes,
              )
              if (!res.ok) notify(res.error)
              else {
                notify(
                  `Final Return Checklist submitted to Warehouse${res.autoCreatedMissingReports > 0 ? ` (${res.autoCreatedMissingReports} Missing Item Report(s) automatically logged for return discrepancies)` : ""}.`,
                )
              }
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
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Report Type">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
              value={incType}
              onChange={(e) => setIncType(e.target.value as "Missing" | "Damage")}
            >
              <option value="Missing">Missing Item Report</option>
              <option value="Damage">Damage Report</option>
            </select>
          </Field>
          <Field label="Affected Item">
            <select
              className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
              value={incItem}
              onChange={(e) => setIncItem(e.target.value)}
            >
              <option value="">Choose manifest asset…</option>
              {manifestLines.map((l) => (
                <option key={l.lineId} value={`${l.code}|${l.name}`}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Affected Quantity">
            <Input
              type="number"
              min={1}
              value={incQty}
              onChange={(e) => setIncQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Discrepancy / Damage Description">
            <Input
              value={incDesc}
              onChange={(e) => setIncDesc(e.target.value)}
              placeholder="Describe missing item or return damage details…"
            />
          </Field>
          <Field label="Evidence Photo URL">
            <Input value={incPhoto} onChange={(e) => setIncPhoto(e.target.value)} />
          </Field>
        </div>
        <Button
          type="button"
          variant="outline"
          icon={FileWarning}
          onClick={() => {
            const [code = "AST-0001", name = manifestLines[0]?.name || "Event Asset"] = incItem
              ? incItem.split("|")
              : ["AST-0001", manifestLines[0]?.name || "Event Asset"]
            const res = submitFieldIncidentReport(actor, {
              eventId: order.eventId,
              reportType: incType,
              checkpoint: "Warehouse Arrival",
              itemCode: code,
              itemName: name,
              quantity: incQty,
              description: incDesc,
              photoUrl: incPhoto,
            })
            if (!res.ok) notify(res.error)
            else {
              notify(`Filed ${incType} Report at Warehouse Arrival for ${name}.`)
              setIncDesc("")
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
          any missing or damaged rental items. Warehouse reviews this record during reconciliation.
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
                onClick={() => {
                  const res = recordDirectVenueRentalReturn(actor, {
                    eventId: order.eventId,
                    rentalId: r.id,
                    handedBackQty: hbVal,
                    missingQty: misVal,
                    damagedQty: dmgVal,
                    discrepancyNotes: notesVal,
                  })
                  if (!res.ok) notify(res.error)
                  else notify(`Recorded supplier return confirmation for ${r.vendorName}.`)
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
