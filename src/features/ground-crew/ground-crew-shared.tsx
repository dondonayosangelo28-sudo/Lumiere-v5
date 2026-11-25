import { useNotify as useRawNotify } from "../../components/ui/Notifications"
import { Badge, Card, Field } from "../../components/ui/ui"
import {
  getOperationsPersistenceWarning,
  OPERATIONS_PERSISTENCE_WARNING_TEXT,
  useOperationsStore,
  type OpsActor,
} from "../../operations/store"
import type {
  FabricationJob,
  OperationsStoreState,
  WarehouseOrderRequest,
} from "../../operations/types"

export function useNotify() {
  const raw = useRawNotify()
  return (text: string) => {
    const persistenceWarning = getOperationsPersistenceWarning()
    const isErr =
      Boolean(persistenceWarning) ||
      /cannot|blocked|error|require|only|select|specify|enter|describe|provide|prepare|not found|confirm arrived|not saved/i.test(
        text,
      )
    if (persistenceWarning && !/not saved/i.test(text)) {
      raw({
        tone: "error",
        text: OPERATIONS_PERSISTENCE_WARNING_TEXT,
      })
      return
    }
    raw({ tone: isErr ? "error" : "success", text })
  }
}

export function notifyMutationResult(
  notify: (text: string) => void,
  res: { ok: boolean; error?: string; savedToStorage?: boolean },
  successText = "Saved.",
): boolean {
  if (!res.ok) {
    notify(res.error || "Action failed.")
    return false
  }
  if (res.savedToStorage === false || getOperationsPersistenceWarning()) {
    notify(OPERATIONS_PERSISTENCE_WARNING_TEXT)
    return true
  }
  if (successText) notify(successText)
  return true
}

export function getManilaTodayDateString(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function isWorkerAssignedToProductionJob(
  job: FabricationJob,
  workerEmail: string,
): boolean {
  const email = workerEmail.trim().toLowerCase()
  if (!email) return false
  if (
    (job.assignments ?? []).some((a) => a.crewEmail.toLowerCase() === email) ||
    (job.participantEmails ?? []).some((e) => e.toLowerCase() === email) ||
    job.assignedCrewEmails.some((e) => e.toLowerCase() === email)
  ) {
    return true
  }
  const mode = job.assignmentMode ?? "group"
  const participants = job.participantEmails?.length
    ? job.participantEmails
    : job.assignedCrewEmails
  if (mode === "individual" && participants.length <= 1) {
    return false
  }
  return (
    (job.productionLeadEmail ?? job.inheritedLeadEmail ?? "").toLowerCase() ===
    email
  )
}

export function getWorkerProductionJobs(
  state: OperationsStoreState,
  eventId: string,
  workerEmail: string,
): FabricationJob[] {
  return state.fabricationJobs.filter(
    (j) =>
      j.eventId === eventId &&
      isWorkerAssignedToProductionJob(j, workerEmail),
  )
}

export function isWorkerRelevantToOrder(
  state: OperationsStoreState,
  order: WarehouseOrderRequest,
  workerEmail: string,
): boolean {
  const email = workerEmail.trim().toLowerCase()
  if (!email) return false
  if (order.teamLeadEmail?.toLowerCase() === email) return true
  if (
    (order.eventRoster ?? []).some(
      (r) => r.crewEmail.toLowerCase() === email && !r.removedAt,
    )
  ) {
    return true
  }
  if (
    (order.eventAssignments ?? []).some(
      (a) => a.crewEmail.toLowerCase() === email,
    )
  ) {
    return true
  }
  if (
    order.crewAssignments.some((a) => a.crewEmail.toLowerCase() === email)
  ) {
    return true
  }
  return state.fabricationJobs.some(
    (j) =>
      j.eventId === order.eventId &&
      isWorkerAssignedToProductionJob(j, email),
  )
}

export function getWorkerRelevantOrders(
  state: OperationsStoreState,
  workerEmail: string,
): WarehouseOrderRequest[] {
  return state.orderRequests.filter((order) =>
    isWorkerRelevantToOrder(state, order, workerEmail),
  )
}

export const SAMPLE_PHOTOS = [
  { label: "Glasshouse Venue Setup Photo", url: "/event-manager-images/garden.jpg" },
  { label: "Custom Fabrication Finished Plinth Photo", url: "/event-manager-images/corporate.jpg" },
  { label: "Warehouse Loading Bay Photo", url: "/event-manager-images/planning.jpg" },
  { label: "Event Hours Table & Chandelier Photo", url: "/event-manager-images/christmas.jpg" },
]

export function EventSelectorHeader({
  actor,
  selectedEventId,
  onSelect,
}: {
  actor: OpsActor
  selectedEventId: string
  onSelect: (id: string) => void
}) {
  const state = useOperationsStore()
  const relevantOrders = getWorkerRelevantOrders(state, actor.email)
  if (relevantOrders.length === 0) return null

  const order =
    relevantOrders.find((o) => o.eventId === selectedEventId) ?? relevantOrders[0]
  if (!order) return null

  const isTeamLead = order.teamLeadEmail?.toLowerCase() === actor.email.toLowerCase()

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:max-w-72">
          <Field label="Event">
            <select
              aria-label="Event"
              className="h-10 w-full rounded-md border border-line bg-elev px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
              value={order.eventId}
              onChange={(event) => onSelect(event.target.value)}
            >
              {relevantOrders.map((item) => (
                <option key={item.eventId} value={item.eventId}>
                  {item.eventTitle}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isTeamLead ? "info" : "neutral"}>
            {isTeamLead ? "Team Lead" : `Team Lead: ${order.teamLeadName || "Unassigned"}`}
          </Badge>
          {order.warehouseClosed && (
            <Badge tone="success">Warehouse Closed</Badge>
          )}
        </div>
      </div>
    </Card>
  )
}
