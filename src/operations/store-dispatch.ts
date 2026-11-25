import { oldSystemApis, v51ContractApis } from "./apiClients"
import { getEventManifestLines, getTripItemDamageSummary, mutateOperationsStore, type OpsActor } from "./store-core"
import type {
  DispatchBatchDirection,
  DispatchBatchItem,
  DispatchBatchRecord,
  DispatchBatchStage,
  OperationsStoreState,
  WarehouseOrderRequest,
} from "./types"

function archiveReturnChecklist(order: WarehouseOrderRequest) {
  if (!order.returnChecklist) return
  const history = order.returnChecklistHistory ?? []
  const alreadyArchived = history.some(
    (h) =>
      h.submittedAt === order.returnChecklist?.submittedAt &&
      h.submittedByEmail === order.returnChecklist?.submittedByEmail,
  )
  order.returnChecklistHistory = alreadyArchived
    ? history
    : [...history, order.returnChecklist]
  order.returnChecklist = undefined
}

/**
 * D03 & Checkpoint 1 (DISPATCH LOADING):
 * Ground Crew counts the physical load on each manifest line.
 * If a line is modified after checklist submission, the checklist must be re-verified.
 */
export function updateManifestLoadedQuantity(
  eventId: string,
  assetId: string,
  loadedQty: number,
  notes?: string,
): { ok: true; hasShortfall: boolean } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot change outbound loaded quantities after Warehouse event accountability is closed.",
      }
    }
    if (order.outboundDeparture) {
      return {
        ok: false,
        error: "Outbound loaded quantities are locked once Warehouse has confirmed Outbound Departure.",
      }
    }

    let line = order.stockLines.find((s) => s.assetId === assetId)
    if (!line) {
      const readyJob = draft.fabricationJobs.find(
        (j) =>
          j.eventId === eventId &&
          j.customItemId === assetId &&
          j.status === "Ready to Load" &&
          j.releasedForLoading,
      )
      if (readyJob) {
        line = {
          assetId: readyJob.customItemId,
          assetCode: `FAB-${readyJob.id.slice(-4).toUpperCase()}`,
          name: `${readyJob.spec.name} (Custom Fabrication)`,
          category: "Custom Fabrication",
          image: readyJob.spec.referenceImages[0] || "/event-manager-images/planning.jpg",
          unit: "unit",
          approvedRequestedQty: readyJob.spec.requestedQty,
          allocatedQty: readyJob.spec.requestedQty,
          deficitQty: 0,
          releasedForLoadQty: readyJob.spec.requestedQty,
          loadedQty: 0,
          loadingVerified: false,
          returnedQty: 0,
          returnCounted: false,
        }
        order.stockLines.push(line)
      }
    }
    if (!line) return { ok: false, error: "Manifest line item not found." }

    const planned = line.releasedForLoadQty > 0 ? line.releasedForLoadQty : line.allocatedQty
    const clamped = Math.max(0, Math.min(planned, loadedQty))
    line.loadedQty = clamped
    line.loadingVerified = clamped === planned
    if (notes !== undefined) line.notes = notes

    // If any line now has a shortfall, invalidate any premature loadingChecklist clearance
    const anyShortfall = order.stockLines.some((s) => {
      const p = s.releasedForLoadQty > 0 ? s.releasedForLoadQty : s.allocatedQty
      return p > 0 && s.loadedQty < p
    })
    if (anyShortfall) {
      order.loadingChecklist = undefined
    }

    return { ok: true, hasShortfall: clamped < planned }
  })
}

/**
 * D03 & Scenario 3, 7, 8 — Team Lead submits final Loading Checklist:
 * - Only the currently designated Team Lead for the event can submit.
 * - Any shortfall (`loadedQty < plannedQty`) on any planned line blocks submission and vehicle departure.
 */
export function submitFinalLoadingChecklist(
  actor: OpsActor,
  eventId: string,
  notes: string,
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (!order.teamLeadEmail || order.teamLeadEmail.toLowerCase() !== actor.email.toLowerCase()) {
      return {
        ok: false,
        error: `Only the designated Team Lead (${order.teamLeadName || "Unassigned"}) can submit the final Loading Checklist for this event.`,
      }
    }

    const lines = getEventManifestLines(draft, eventId)
    if (lines.length === 0) {
      return {
        ok: false,
        error: "No manifest items have been released for loading yet.",
      }
    }

    const legacyBlocked = lines.filter((l) => l.blockedByLegacyReview)
    if (legacyBlocked.length > 0) {
      const detail = legacyBlocked
        .map((l) => `${l.name} (${l.legacyReviewReason || "pending Warehouse migration review"})`)
        .join("; ")
      return {
        ok: false,
        error: `LOADING SIGN-OFF BLOCKED: Warehouse must review and resolve legacy verification evidence before new loading sign-off can proceed for: ${detail}.`,
      }
    }

    const shortfalls = lines.filter((l) => l.loadedQty < l.plannedQty)
    if (shortfalls.length > 0) {
      const detail = shortfalls
        .map((s) => `${s.name} (${s.loadedQty}/${s.plannedQty} loaded, shortfall of ${s.shortfallQty})`)
        .join("; ")
      return {
        ok: false,
        error: `DISPATCH BLOCKED (D03): Vehicle cannot be cleared to leave while planned quantities have shortfalls: ${detail}. Resolve the shortfall with Warehouse and recheck the line.`,
      }
    }

    const submission = {
      submittedByEmail: actor.email.toLowerCase(),
      submittedByName: actor.name,
      submittedAt: new Date().toISOString(),
      notes: notes.trim() || "All planned manifest items physically counted and verified at full quantity.",
    }
    order.loadingChecklist = submission

    void v51ContractApis.submitLoadingChecklist(eventId, submission)
    return { ok: true }
  })
}

/**
 * D03 & Scenario 3 — Warehouse Operations Manager confirms Outbound Departure:
 * - Authorized ONLY for Warehouse Operations Manager.
 * - Enforces Loading Checklist, non-empty manifest, full loaded quantities, and legacy migration-review gates.
 * - Idempotent: repeated confirmations preserve the existing departure confirmation and never re-decrement allocated
 *   stock or re-increment dispatched stock.
 */
export function confirmOutboundDeparture(
  actor: OpsActor,
  eventId: string,
  payload: { vehiclePlate: string; driverName: string; notes: string },
):
  | { ok: true; alreadyConfirmed?: boolean }
  | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can confirm outbound vehicle departure.",
    }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (order.outboundDeparture) {
      return { ok: true, alreadyConfirmed: true }
    }

    if (order.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot confirm outbound departure: event accountability is already closed.",
      }
    }

    if (!order.loadingChecklist) {
      return {
        ok: false,
        error: "Cannot confirm outbound departure: Team Lead must submit the final Loading Checklist with zero shortfalls first.",
      }
    }

    const lines = getEventManifestLines(draft, eventId)
    if (lines.length === 0) {
      return {
        ok: false,
        error: "Cannot confirm outbound departure: no manifest items have been released for loading yet.",
      }
    }

    const legacyBlocked = lines.filter((l) => l.blockedByLegacyReview)
    if (legacyBlocked.length > 0) {
      const detail = legacyBlocked
        .map((l) => `${l.name} (${l.legacyReviewReason || "pending Warehouse migration review"})`)
        .join("; ")
      return {
        ok: false,
        error: `DISPATCH BLOCKED: Warehouse must resolve legacy verification review before outbound departure can be confirmed for: ${detail}.`,
      }
    }

    const shortfalls = lines.filter((l) => l.loadedQty < l.plannedQty)
    if (shortfalls.length > 0) {
      return {
        ok: false,
        error: "Cannot confirm outbound departure: one or more manifest lines have a physical loading shortfall.",
      }
    }

    // Validate all un-transferred stock lines before mutating any state
    const plannedTransfers: {
      line: (typeof order.stockLines)[number]
      inv: (typeof draft.inventory)[number]
      alreadyTransferred: number
      remainingToTransfer: number
    }[] = []
    for (const line of order.stockLines) {
      const alreadyTransferred = line.dispatchedQty ?? 0
      const remainingToTransfer = Math.max(0, line.loadedQty - alreadyTransferred)
      if (remainingToTransfer > 0) {
        const inv = draft.inventory.find((i) => i.assetId === line.assetId)
        if (!inv) {
          return {
            ok: false,
            error: `Cannot confirm outbound departure: inventory asset "${line.name}" was not found.`,
          }
        }
        if (inv.allocatedStock < remainingToTransfer) {
          return {
            ok: false,
            error: `Cannot confirm outbound departure: insufficient allocated stock for "${line.name}" (${inv.allocatedStock} available, ${remainingToTransfer} required).`,
          }
        }
        plannedTransfers.push({ line, inv, alreadyTransferred, remainingToTransfer })
      }
    }

    const departure = {
      confirmedByEmail: actor.email,
      confirmedByName: actor.name,
      confirmedAt: new Date().toISOString(),
      vehiclePlate: payload.vehiclePlate.trim() || "NGA-4821 (Lumière Box Truck 02)",
      driverName: payload.driverName.trim() || "R. Santos",
      notes: payload.notes.trim() || "Vehicle cleared and departed warehouse after full manifest verification.",
    }
    order.outboundDeparture = departure

    // Move remaining un-transferred allocated stock to dispatched stock in inventory
    for (const { line, inv, alreadyTransferred, remainingToTransfer } of plannedTransfers) {
      inv.allocatedStock -= remainingToTransfer
      inv.dispatchedStock += remainingToTransfer
      inv.availableStock = Math.max(
        0,
        inv.totalStock - inv.allocatedStock - inv.dispatchedStock - inv.damagedCount - inv.missingCount,
      )
      line.dispatchedQty = alreadyTransferred + remainingToTransfer
    }

    void oldSystemApis.dispatch.dispatchAssets(eventId, departure.notes)
    void v51ContractApis.confirmOutboundDeparture(eventId, departure)
    return { ok: true, alreadyConfirmed: false }
  })
}

/**
 * Checkpoint 2 (VENUE ARRIVAL) & Checkpoint 4 (WAREHOUSE ARRIVAL) — Scenario 7 & 8:
 * - Requires the currently designated Team Lead for the event.
 * - Requires a mandatory checkpoint photo taken at the venue or warehouse.
 * - Stored distinctly from after-shift work photos and damage report photos.
 */
export function submitArrivalCheckpoint(
  actor: OpsActor,
  payload: {
    eventId: string
    checkpoint: "Venue Arrival" | "Warehouse Arrival"
    photoUrl: string
    notes: string
  },
): { ok: true } | { ok: false; error: string } {
  if (!payload.photoUrl.trim()) {
    return {
      ok: false,
      error: `A photo taken at the ${payload.checkpoint === "Venue Arrival" ? "venue" : "warehouse"} is required to confirm ${payload.checkpoint}.`,
    }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (!order.teamLeadEmail || order.teamLeadEmail.toLowerCase() !== actor.email.toLowerCase()) {
      return {
        ok: false,
        error: `Only the currently designated Team Lead (${order.teamLeadName || "Unassigned"}) can submit ${payload.checkpoint} confirmation.`,
      }
    }

    const record = {
      checkpoint: payload.checkpoint,
      photoUrl: payload.photoUrl.trim(),
      notes:
        payload.notes.trim() ||
        `Confirmed ${payload.checkpoint} with timestamped location photo.`,
      submittedByEmail: actor.email.toLowerCase(),
      submittedByName: actor.name,
      submittedAt: new Date().toISOString(),
    }

    if (payload.checkpoint === "Venue Arrival") {
      order.venueArrival = record
    } else {
      order.warehouseArrival = record
    }

    void v51ContractApis.submitArrivalConfirmation(payload.eventId, record)
    return { ok: true }
  })
}

export function isBatchReturnPhase(batch: Pick<DispatchBatchRecord, "direction" | "stage">): boolean {
  return (
    batch.direction === "return" ||
    batch.stage === "Return loading" ||
    batch.stage === "Return in transit" ||
    batch.stage === "Returned"
  )
}

export function isBatchOutboundInTransit(batch: Pick<DispatchBatchRecord, "direction" | "stage">): boolean {
  return batch.stage === "Outbound in transit" || (batch.direction === "outbound" && batch.stage === "In Transit")
}

export function isBatchReturnInTransit(batch: Pick<DispatchBatchRecord, "direction" | "stage">): boolean {
  return batch.stage === "Return in transit" || (batch.direction === "return" && batch.stage === "In Transit")
}

export function getEventDispatchBatchBalances(
  state: OperationsStoreState,
  eventId: string,
) {
  const order = state.orderRequests.find((o) => o.eventId === eventId)
  const lines = getEventManifestLines(state, eventId)
  const batches = order?.dispatchBatches ?? []

  return lines.map((line) => {
    const outboundReservedQty = batches
      .filter((b) => !b.deletedAt && b.direction === "outbound" && b.stage !== "Cancelled")
      .reduce(
        (sum, b) =>
          sum +
          b.items
            .filter((i) => i.manifestLineId === line.lineId)
            .reduce((s, i) => s + i.plannedQty, 0),
        0,
      )
    const returnReservedQty = batches
      .filter((b) => !b.deletedAt && b.stage !== "Cancelled" && isBatchReturnPhase(b))
      .reduce(
        (sum, b) =>
          sum +
          b.items
            .filter((i) => i.manifestLineId === line.lineId)
            .reduce((s, i) => s + (b.direction === "outbound" ? (i.returnPlannedQty ?? i.actualQty ?? i.plannedQty) : i.plannedQty), 0),
        0,
      )
    const outboundRemainingQty = Math.max(0, line.plannedQty - outboundReservedQty)
    const recordedReturned = line.returnCounted ? line.returnedQty : 0
    const returnRemainingQty = Math.max(
      0,
      line.loadedQty - Math.max(recordedReturned, returnReservedQty),
    )

    return {
      line,
      outboundReservedQty,
      outboundRemainingQty,
      returnReservedQty,
      returnRemainingQty,
    }
  })
}

export function createDispatchBatch(
  actor: OpsActor,
  payload: {
    eventId: string
    direction: DispatchBatchDirection
    vehicleType: string
    plateNumber: string
    driverName: string
    handoffNotes?: string
    assignedCrewEmails?: string[]
    items: { manifestLineId: string; qty: number }[]
  },
): { ok: true; batch: DispatchBatchRecord } | { ok: false; error: string } {
  const vehicleType = payload.vehicleType.trim()
  const plateNumber = payload.plateNumber.trim()
  const driverName = payload.driverName.trim() || "Unassigned"
  if (!vehicleType) return { ok: false, error: "Vehicle type is required." }
  if (!plateNumber) return { ok: false, error: "Plate number is required." }
  if (!payload.items || payload.items.length === 0) {
    return { ok: false, error: "Select at least one asset with a positive quantity." }
  }

  let createdBatch: DispatchBatchRecord | null = null
  const res = mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return { ok: false, error: "Event accountability is closed; batches cannot be created." }
    }

    const balances = getEventDispatchBatchBalances(draft, payload.eventId)
    const seenIds = new Set<string>()
    const batchItems: DispatchBatchItem[] = []

    for (const reqItem of payload.items) {
      if (seenIds.has(reqItem.manifestLineId)) {
        return { ok: false, error: "Duplicate asset allocation within the same batch is not allowed." }
      }
      seenIds.add(reqItem.manifestLineId)
      const qty = Math.floor(Number(reqItem.qty))
      if (!Number.isFinite(qty) || qty <= 0) {
        return { ok: false, error: "Selected quantities must be greater than zero." }
      }
      const entry = balances.find((b) => b.line.lineId === reqItem.manifestLineId)
      if (!entry) {
        return { ok: false, error: `Manifest line ${reqItem.manifestLineId} not found for this event.` }
      }
      const maxAllowed =
        payload.direction === "outbound" ? entry.outboundRemainingQty : entry.returnRemainingQty
      if (qty > maxAllowed) {
        return {
          ok: false,
          error:
            payload.direction === "outbound"
              ? `Requested ${qty} for "${entry.line.name}" exceeds remaining dispatchable balance (${maxAllowed}).`
              : `Requested return ${qty} for "${entry.line.name}" exceeds remaining returnable balance (${maxAllowed}).`,
        }
      }

      batchItems.push({
        manifestLineId: entry.line.lineId,
        assetId: entry.line.sourceType === "stock" ? entry.line.sourceId : undefined,
        itemCode: entry.line.code,
        name: entry.line.name,
        kind: entry.line.sourceType === "custom" ? "Custom Fabrication" : "Stock",
        plannedQty: qty,
        actualQty: 0,
      })
    }

    const existingBatches = order.dispatchBatches ?? []
    const seq = existingBatches.length + 1
    const prefix = payload.direction === "outbound" ? "OUT" : "RET"
    const now = new Date().toISOString()
    const batch: DispatchBatchRecord = {
      id: `${prefix}-${order.id.slice(-4)}-${String(seq).padStart(2, "0")}`,
      eventId: order.eventId,
      direction: payload.direction,
      stage: "Planned",
      vehicleType,
      plateNumber,
      driverName,
      handoffNotes: payload.handoffNotes?.trim() || undefined,
      assignedCrewEmails: payload.assignedCrewEmails ?? [],
      items: batchItems,
      createdAt: now,
      createdByName: actor.name,
      createdByEmail: actor.email.toLowerCase(),
      updatedAt: now,
    }
    order.dispatchBatches = [...existingBatches, batch]
    createdBatch = batch
    return { ok: true }
  })

  if (!res.ok || !createdBatch) return res as { ok: false; error: string }
  return { ok: true, batch: createdBatch }
}

export function updateDispatchBatchDetails(
  actor: OpsActor,
  payload: {
    eventId: string
    batchId: string
    vehicleType?: string
    plateNumber?: string
    driverName?: string
    handoffNotes?: string
    assignedCrewEmails?: string[]
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return { ok: false, error: "Event accountability is closed." }
    }
    const batch = (order.dispatchBatches ?? []).find((b) => b.id === payload.batchId)
    if (!batch) return { ok: false, error: "Dispatch batch not found." }
    if (batch.stage === "Cancelled") {
      return { ok: false, error: "Cancelled batches are preserved read-only for audit history." }
    }

    const inReturnPhase = isBatchReturnPhase(batch) && batch.direction === "outbound"
    if (payload.vehicleType !== undefined) {
      const v = payload.vehicleType.trim()
      if (!v) return { ok: false, error: "Vehicle type cannot be empty." }
      if (inReturnPhase) batch.returnVehicleType = v
      else batch.vehicleType = v
    }
    if (payload.plateNumber !== undefined) {
      const p = payload.plateNumber.trim()
      if (!p) return { ok: false, error: "Plate number cannot be empty." }
      if (inReturnPhase) batch.returnPlateNumber = p
      else batch.plateNumber = p
    }
    if (payload.driverName !== undefined) {
      const d = payload.driverName.trim() || "Unassigned"
      if (inReturnPhase) batch.returnDriverName = d
      else batch.driverName = d
    }
    if (payload.handoffNotes !== undefined) {
      const h = payload.handoffNotes.trim() || undefined
      if (inReturnPhase) batch.returnHandoffNotes = h
      else batch.handoffNotes = h
    }
    if (payload.assignedCrewEmails !== undefined) {
      batch.assignedCrewEmails = payload.assignedCrewEmails
    }
    batch.updatedAt = new Date().toISOString()
    void actor
    return { ok: true }
  })
}

export function updateTripItemReturnedQuantity(
  eventId: string,
  batchId: string,
  manifestLineId: string,
  returnedQty: number,
): { ok: true; discrepancy: number } | { ok: false; error: string } {
  if (!Number.isFinite(returnedQty) || returnedQty < 0) {
    return { ok: false, error: "Returned quantity must be a finite number (0 or greater)." }
  }
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot change return counts after Warehouse event accountability is closed.",
      }
    }
    const batch = (order.dispatchBatches ?? []).find((b) => b.id === batchId && !b.deletedAt)
    if (!batch) return { ok: false, error: "Dispatch trip not found." }
    if (batch.stage === "Cancelled") {
      return { ok: false, error: "Cancelled trips cannot record return counts." }
    }
    if (batch.stage === "Returned") {
      return { ok: false, error: "Returned trip counts are locked once marked Returned." }
    }

    const item = batch.items.find((i) => i.manifestLineId === manifestLineId)
    if (!item) return { ok: false, error: "Asset not found on this dispatch trip." }

    const plannedRet =
      batch.direction === "outbound"
        ? (item.returnPlannedQty ?? (item.actualQty > 0 ? item.actualQty : item.plannedQty))
        : item.plannedQty
    const nextQty = Math.floor(returnedQty)
    if (nextQty > plannedRet) {
      return {
        ok: false,
        error: `Returned quantity (${nextQty}) cannot exceed trip expected quantity (${plannedRet}) for "${item.name}".`,
      }
    }

    // Capture pre-edit event & per-trip state BEFORE mutating this item
    const assetId = item.assetId ?? item.manifestLineId
    const stockLine = order.stockLines.find((s) => s.assetId === assetId)
    const activeTripsForLine = (order.dispatchBatches ?? []).filter(
      (b) =>
        !b.deletedAt &&
        b.stage !== "Cancelled" &&
        b.items.some((i) => i.manifestLineId === manifestLineId),
    )
    const prevTripTotal = activeTripsForLine.reduce((sum, b) => {
      const bi = b.items.find((i) => i.manifestLineId === manifestLineId)
      if (!bi || !bi.returnCounted) return sum
      return sum + (bi.returnActualQty ?? 0)
    }, 0)
    const prevThisTripQty = item.returnCounted ? (item.returnActualQty ?? 0) : 0
    const nextTripTotal = prevTripTotal - prevThisTripQty + nextQty

    if (stockLine) {
      const outboundActual = stockLine.loadedQty > 0 ? stockLine.loadedQty : stockLine.releasedForLoadQty
      if (nextTripTotal > outboundActual) {
        return {
          ok: false,
          error: `Total returned quantity across trips (${nextTripTotal}) exceeds outbound quantity (${outboundActual}) for "${stockLine.name}".`,
        }
      }
    }

    const prevEventReturned = stockLine?.returnedQty ?? 0
    const prevEventCounted = Boolean(stockLine?.returnCounted)
    const prevEventUncertain = Boolean(stockLine?.legacyReturnUncertain)
    const prevLegacyBaseline = stockLine?.legacyEventReturnedQty

    const isAmbiguousLegacy =
      Boolean(stockLine) &&
      (prevLegacyBaseline !== undefined ||
        prevEventUncertain ||
        (prevEventCounted && prevEventReturned !== prevTripTotal))
    const legacyBaseline = isAmbiguousLegacy ? (prevLegacyBaseline ?? prevEventReturned) : undefined

    item.returnPlannedQty = plannedRet
    item.returnActualQty = nextQty
    item.returnCounted = true
    item.returnShortageQty = Math.max(0, plannedRet - nextQty)
    if (batch.direction === "return") {
      item.actualQty = nextQty
    }
    batch.updatedAt = new Date().toISOString()

    // Reconcile event-level stockLine return totals without overwriting ambiguous legacy totals
    if (stockLine) {
      const allTripsCounted =
        activeTripsForLine.length > 0 &&
        activeTripsForLine.every((b) => b.items.find((i) => i.manifestLineId === manifestLineId)?.returnCounted)

      if (legacyBaseline !== undefined) {
        stockLine.legacyEventReturnedQty = legacyBaseline
        // Only auto-clear legacy ambiguity if all trips are counted and match the preserved baseline exactly
        if (allTripsCounted && nextTripTotal === legacyBaseline) {
          const stateChanged =
            prevEventReturned !== nextTripTotal ||
            prevEventUncertain ||
            prevLegacyBaseline !== undefined
          if (stateChanged) {
            archiveReturnChecklist(order)
          }
          stockLine.returnedQty = nextTripTotal
          stockLine.returnCounted = true
          stockLine.legacyReturnUncertain = false
          stockLine.legacyEventReturnedQty = undefined
        } else {
          stockLine.returnedQty = legacyBaseline
          stockLine.legacyReturnUncertain = true
        }
      } else {
        const stateChanged =
          prevEventReturned !== nextTripTotal ||
          prevEventCounted !== allTripsCounted ||
          prevEventUncertain
        stockLine.returnedQty = nextTripTotal
        stockLine.returnCounted = allTripsCounted
        stockLine.legacyReturnUncertain = false

        if (stateChanged) {
          archiveReturnChecklist(order)
        }
      }
    }

    return { ok: true, discrepancy: Math.max(0, plannedRet - nextQty) }
  })
}

export function reconcileLegacyReturnTotal(
  actor: OpsActor,
  eventId: string,
  assetId: string,
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return { ok: false, error: "Cannot reconcile return totals after Warehouse event accountability is closed." }
    }
    const stockLine = order.stockLines.find((s) => s.assetId === assetId)
    if (!stockLine) return { ok: false, error: "Manifest line not found." }

    const activeTripsForLine = (order.dispatchBatches ?? []).filter(
      (b) =>
        !b.deletedAt &&
        b.stage !== "Cancelled" &&
        b.items.some((i) => (i.assetId ?? i.manifestLineId) === assetId),
    )
    if (activeTripsForLine.length === 0) {
      return {
        ok: false,
        error: "No matching dispatch trips exist for this asset. Use manual Warehouse reconciliation with a verified quantity and reason.",
      }
    }
    const allTripsCounted = activeTripsForLine.every(
      (b) => b.items.find((i) => (i.assetId ?? i.manifestLineId) === assetId)?.returnCounted,
    )
    if (!allTripsCounted) {
      return {
        ok: false,
        error: "Record verified return counts for every trip carrying this asset before replacing the legacy total.",
      }
    }

    const totalTripCounted = activeTripsForLine.reduce((sum, b) => {
      const bi = b.items.find((i) => (i.assetId ?? i.manifestLineId) === assetId)
      return sum + (bi?.returnCounted ? (bi.returnActualQty ?? 0) : 0)
    }, 0)
    const outboundActual = stockLine.loadedQty > 0 ? stockLine.loadedQty : stockLine.releasedForLoadQty
    const nextReturned = Math.min(outboundActual, totalTripCounted)
    const previousReturned = stockLine.legacyEventReturnedQty ?? stockLine.returnedQty
    const stateChanged =
      stockLine.returnedQty !== nextReturned ||
      Boolean(stockLine.legacyReturnUncertain) ||
      stockLine.legacyEventReturnedQty !== undefined
    if (!stateChanged && stockLine.returnCounted) {
      return { ok: true }
    }

    if (stateChanged) {
      archiveReturnChecklist(order)
    }
    const now = new Date().toISOString()
    order.legacyReturnReconciliations = [
      ...(order.legacyReturnReconciliations ?? []),
      {
        eventId: order.eventId,
        assetId: stockLine.assetId,
        assetCode: stockLine.assetCode,
        assetName: stockLine.name,
        mode: "trip-totals",
        previousReturnedQty: previousReturned,
        reconciledReturnedQty: nextReturned,
        reason: "Reconciled from verified per-trip return counts.",
        supportingTripIds: activeTripsForLine.map((b) => b.id),
        reviewedByEmail: actor.email.toLowerCase(),
        reviewedByName: actor.name,
        reviewedAt: now,
      },
    ]
    stockLine.returnedQty = nextReturned
    stockLine.returnCounted = true
    stockLine.legacyReturnUncertain = false
    stockLine.legacyEventReturnedQty = undefined
    return { ok: true }
  })
}

export function reconcileLegacyReturnManually(
  actor: OpsActor,
  eventId: string,
  assetId: string,
  payload: { verifiedQty: number; reason: string },
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can perform manual legacy return reconciliation.",
    }
  }
  if (!Number.isInteger(payload.verifiedQty) || payload.verifiedQty < 0) {
    return { ok: false, error: "Verified return quantity must be a whole number (0 or greater)." }
  }
  if (!payload.reason.trim()) {
    return { ok: false, error: "Enter a documented reason for manual legacy return reconciliation." }
  }
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return { ok: false, error: "Cannot reconcile return totals after Warehouse event accountability is closed." }
    }
    const stockLine = order.stockLines.find((s) => s.assetId === assetId)
    if (!stockLine) return { ok: false, error: "Manifest line not found." }

    const outboundActual = stockLine.loadedQty > 0 ? stockLine.loadedQty : stockLine.releasedForLoadQty
    if (payload.verifiedQty > outboundActual) {
      return {
        ok: false,
        error: `Verified return quantity (${payload.verifiedQty}) cannot exceed outbound quantity (${outboundActual}).`,
      }
    }

    const previousReturned = stockLine.legacyEventReturnedQty ?? stockLine.returnedQty
    const stateChanged =
      stockLine.returnedQty !== payload.verifiedQty ||
      Boolean(stockLine.legacyReturnUncertain) ||
      stockLine.legacyEventReturnedQty !== undefined
    if (!stateChanged && stockLine.returnCounted) {
      return { ok: true }
    }

    if (stateChanged) {
      archiveReturnChecklist(order)
    }

    const now = new Date().toISOString()
    order.legacyReturnReconciliations = [
      ...(order.legacyReturnReconciliations ?? []),
      {
        eventId: order.eventId,
        assetId: stockLine.assetId,
        assetCode: stockLine.assetCode,
        assetName: stockLine.name,
        mode: "manual-warehouse",
        previousReturnedQty: previousReturned,
        reconciledReturnedQty: payload.verifiedQty,
        reason: payload.reason.trim(),
        reviewedByEmail: actor.email.toLowerCase(),
        reviewedByName: actor.name,
        reviewedAt: now,
      },
    ]
    stockLine.returnedQty = payload.verifiedQty
    stockLine.returnCounted = true
    stockLine.legacyReturnUncertain = false
    stockLine.legacyEventReturnedQty = undefined
    return { ok: true }
  })
}

export function advanceDispatchBatchStage(
  actor: OpsActor,
  payload: {
    eventId: string
    batchId: string
    nextStage: Exclude<DispatchBatchStage, "Cancelled" | "Planned">
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return { ok: false, error: "Event accountability is closed." }
    }
    const batch = (order.dispatchBatches ?? []).find((b) => b.id === payload.batchId)
    if (!batch) return { ok: false, error: "Dispatch batch not found." }
    if (batch.stage === "Cancelled") {
      return { ok: false, error: "Cancelled batches cannot advance." }
    }

    const lines = getEventManifestLines(draft, order.eventId)
    const now = new Date().toISOString()

    const verifyOutboundBatchLoading = (): { ok: false; error: string } | { ok: true } => {
      for (const item of batch.items) {
        const line = lines.find((l) => l.lineId === item.manifestLineId)
        if (!line) return { ok: false, error: `Manifest line for ${item.name} not found.` }
        if (line.blockedByLegacyReview) {
          return {
            ok: false,
            error: `Item "${item.name}" is blocked by unresolved Warehouse Migration Review.`,
          }
        }
        if (line.loadedQty <= 0) {
          return {
            ok: false,
            error: `Record Team Lead loading count for "${item.name}" in Event Manifest before marking batch Loaded.`,
          }
        }
        const assignedLoadedQty = (order.dispatchBatches ?? [])
          .filter(
            (other) =>
              other.id !== batch.id &&
              !other.deletedAt &&
              other.direction === batch.direction &&
              (other.stage === "Loaded" ||
                other.stage === "Outbound in transit" ||
                other.stage === "In Transit" ||
                other.stage === "Delivered" ||
                other.stage === "Return loading" ||
                other.stage === "Return in transit" ||
                other.stage === "Returned" ||
                Boolean(other.departedAt)),
          )
          .reduce(
            (sum, other) =>
              sum +
              other.items
                .filter((otherItem) => otherItem.manifestLineId === item.manifestLineId)
                .reduce((s, otherItem) => s + otherItem.actualQty, 0),
            0,
          )
        const availableLoaded = Math.max(0, line.loadedQty - assignedLoadedQty)
        if (availableLoaded < item.plannedQty) {
          return {
            ok: false,
            error: `Insufficient loaded quantity for "${item.name}": ${availableLoaded} available, ${item.plannedQty} required.`,
          }
        }
      }
      return { ok: true }
    }

    const planOutboundBatchTransfers = ():
      | {
          ok: true
          transfers: {
            stockLine: (typeof order.stockLines)[number]
            inv: (typeof draft.inventory)[number]
            alreadyTransferred: number
            transferQty: number
          }[]
        }
      | { ok: false; error: string } => {
      if (batch.stockTransferredAt) return { ok: true, transfers: [] }
      const transfers: {
        stockLine: (typeof order.stockLines)[number]
        inv: (typeof draft.inventory)[number]
        alreadyTransferred: number
        transferQty: number
      }[] = []
      for (const item of batch.items) {
        if (item.kind === "Custom Fabrication") continue
        const stockLine = order.stockLines.find(
          (l) => l.assetId === (item.assetId ?? item.manifestLineId),
        )
        if (!stockLine) {
          return {
            ok: false,
            error: `Order stock line for "${item.name}" was not found.`,
          }
        }
        const inv = draft.inventory.find((i) => i.assetId === stockLine.assetId)
        if (!inv) {
          return {
            ok: false,
            error: `Inventory asset "${item.name}" was not found.`,
          }
        }
        const alreadyTransferred = order.outboundDeparture
          ? Math.max(stockLine.dispatchedQty ?? 0, stockLine.loadedQty)
          : (stockLine.dispatchedQty ?? 0)
        const remainingLoaded = Math.max(0, stockLine.loadedQty - alreadyTransferred)
        const transferQty = order.outboundDeparture ? 0 : item.plannedQty
        if (transferQty > 0) {
          if (remainingLoaded < transferQty) {
            return {
              ok: false,
              error: `Insufficient transferable loaded quantity for "${item.name}": ${remainingLoaded} available, ${transferQty} required.`,
            }
          }
          if (inv.allocatedStock < transferQty) {
            return {
              ok: false,
              error: `Insufficient allocated stock for "${item.name}": ${inv.allocatedStock} available, ${transferQty} required.`,
            }
          }
          transfers.push({ stockLine, inv, alreadyTransferred, transferQty })
        }
      }
      return { ok: true, transfers }
    }

    if (payload.nextStage === "Loaded") {
      if (batch.stage !== "Planned" || batch.departedAt) {
        return { ok: false, error: "Only a planned batch that has not departed can be marked Loaded." }
      }
      if (batch.direction === "outbound") {
        const check = verifyOutboundBatchLoading()
        if (!check.ok) return check
        for (const item of batch.items) {
          item.actualQty = item.plannedQty
        }
      } else {
        for (const item of batch.items) {
          const line = lines.find((l) => l.lineId === item.manifestLineId)
          item.actualQty = Math.min(item.plannedQty, line?.returnedQty ?? 0)
        }
      }
      batch.stage = "Loaded"
      batch.updatedAt = now
      return { ok: true }
    }

    if (payload.nextStage === "Outbound in transit" || (payload.nextStage === "In Transit" && batch.direction === "outbound")) {
      if (batch.stage !== "Loaded") {
        return { ok: false, error: "Only a loaded batch can enter Outbound in transit." }
      }
      if (batch.direction === "outbound") {
        const check = verifyOutboundBatchLoading()
        if (!check.ok) return check
        const transferPlan = planOutboundBatchTransfers()
        if (!transferPlan.ok) return transferPlan
        for (const item of batch.items) {
          item.actualQty = item.plannedQty
        }
        for (const { stockLine, inv, alreadyTransferred, transferQty } of transferPlan.transfers) {
          inv.allocatedStock -= transferQty
          inv.dispatchedStock += transferQty
          inv.availableStock = Math.max(
            0,
            inv.totalStock - inv.allocatedStock - inv.dispatchedStock - inv.damagedCount - inv.missingCount,
          )
          stockLine.dispatchedQty = alreadyTransferred + transferQty
        }
        if (!batch.stockTransferredAt) {
          batch.stockTransferredAt = now
        }
      }
      batch.stage = "Outbound in transit"
      batch.departedAt = batch.departedAt || now
      batch.updatedAt = now
      return { ok: true }
    }

    if (payload.nextStage === "Delivered") {
      if (batch.direction !== "outbound") {
        return { ok: false, error: "Only outbound trips transition to Delivered." }
      }
      if (!isBatchOutboundInTransit(batch)) {
        return { ok: false, error: "Only an outbound in-transit trip can be marked Delivered." }
      }
      if (!order.venueArrival) {
        return {
          ok: false,
          error: "Team Lead Venue Arrival confirmation photo is required before Delivered.",
        }
      }
      batch.stage = "Delivered"
      batch.departedAt = batch.departedAt || now
      batch.deliveredAt = batch.deliveredAt || now
      batch.updatedAt = now
      return { ok: true }
    }

    if (payload.nextStage === "Return loading") {
      const canStartReturn =
        (batch.direction === "outbound" && batch.stage === "Delivered") ||
        (batch.direction === "return" && batch.stage === "Planned")
      if (!canStartReturn) {
        return { ok: false, error: "Return loading can only start after delivery (or from a planned return batch)." }
      }
      if (!order.venueArrival) {
        return {
          ok: false,
          error: "Venue Arrival must be confirmed before starting return loading.",
        }
      }
      batch.returnStartedAt = batch.returnStartedAt || now
      batch.returnVehicleType = batch.returnVehicleType ?? batch.vehicleType
      batch.returnPlateNumber = batch.returnPlateNumber ?? batch.plateNumber
      batch.returnDriverName = batch.returnDriverName ?? batch.driverName
      batch.returnHandoffNotes = batch.returnHandoffNotes ?? batch.handoffNotes
      for (const item of batch.items) {
        item.returnPlannedQty =
          item.returnPlannedQty ?? (batch.direction === "outbound" ? (item.actualQty || item.plannedQty) : item.plannedQty)
        item.returnActualQty = item.returnActualQty ?? 0
      }
      batch.stage = "Return loading"
      batch.updatedAt = now
      return { ok: true }
    }

    if (payload.nextStage === "Return in transit" || (payload.nextStage === "In Transit" && batch.direction === "return")) {
      const canEnterReturnTransit =
        batch.stage === "Return loading" || (batch.direction === "return" && batch.stage === "Loaded")
      if (!canEnterReturnTransit) {
        return { ok: false, error: "Only a return-loading batch can enter Return in transit." }
      }
      if (!order.venueArrival) {
        return {
          ok: false,
          error: "Venue Arrival must be confirmed before return transit.",
        }
      }
      batch.stage = "Return in transit"
      batch.returnDepartedAt = batch.returnDepartedAt || now
      if (batch.direction === "return") {
        batch.departedAt = batch.departedAt || now
      }
      batch.updatedAt = now
      return { ok: true }
    }

    if (payload.nextStage === "Returned") {
      if (!isBatchReturnInTransit(batch)) {
        return { ok: false, error: "Only a return in-transit trip can be marked Returned." }
      }
      if (!order.warehouseArrival || !order.warehouseArrival.photoUrl) {
        return {
          ok: false,
          error: "Team Lead Warehouse Arrival confirmation photo is required before Returned.",
        }
      }
      for (const item of batch.items) {
        const line = lines.find((l) => l.lineId === item.manifestLineId)
        if (!line) return { ok: false, error: `Manifest line for ${item.name} not found.` }
        if (line.legacyReturnUncertain) {
          return {
            ok: false,
            error: `Item "${item.name}" has an uncertain legacy return count that must be reconciled first.`,
          }
        }
        if (!item.returnCounted) {
          return {
            ok: false,
            error: `Record verified return count for "${item.name}" on trip ${batch.id} before marking trip Returned.`,
          }
        }
        const plannedRet =
          batch.direction === "outbound"
            ? (item.returnPlannedQty ?? (item.actualQty > 0 ? item.actualQty : item.plannedQty))
            : item.plannedQty
        const actualRet = Math.max(0, Math.min(plannedRet, item.returnActualQty ?? 0))

        // Prevent duplicate counting across other already-returned trips
        const alreadyClaimedReturned = (order.dispatchBatches ?? [])
          .filter(
            (other) =>
              other.id !== batch.id &&
              !other.deletedAt &&
              other.stage === "Returned",
          )
          .reduce(
            (sum, other) =>
              sum +
              other.items
                .filter((otherItem) => otherItem.manifestLineId === item.manifestLineId)
                .reduce(
                  (s, otherItem) =>
                    s + (other.direction === "outbound" ? (otherItem.returnActualQty ?? 0) : otherItem.actualQty),
                  0,
                ),
            0,
          )
        if (actualRet > 0 && line.returnCounted && alreadyClaimedReturned + actualRet > line.returnedQty) {
          return {
            ok: false,
            error: `Return count for "${item.name}" (${actualRet}) exceeds remaining event counted returns (${Math.max(0, line.returnedQty - alreadyClaimedReturned)}).`,
          }
        }

        // Attribute only explicitly trip-linked or trip-allocated damage without silent capping
        const cap = getTripItemDamageSummary(draft.incidentReports, order, batch, item)
        if (cap.isExcessive) {
          return {
            ok: false,
            error: `Trip ${batch.id} has excessive damage allocations (${cap.existingDamageAllocated} allocated vs ${cap.tripAccountableQty} carried) for "${item.name}". Review allocations before completing return.`,
          }
        }

        item.returnPlannedQty = plannedRet
        item.returnActualQty = actualRet
        item.returnShortageQty = Math.max(0, plannedRet - actualRet)
        item.returnDamagedQty = cap.existingDamageAllocated
        if (batch.direction === "return") {
          item.actualQty = actualRet
        }
      }
      batch.stage = "Returned"
      batch.returnedAt = batch.returnedAt || now
      batch.returnDepartedAt = batch.returnDepartedAt || now
      batch.departedAt = batch.departedAt || now
      batch.updatedAt = now
      return { ok: true }
    }

    void actor
    return { ok: false, error: "Unsupported stage transition." }
  })
}

export function cancelDispatchBatch(
  actor: OpsActor,
  payload: { eventId: string; batchId: string; reason?: string; deleteFromDispatch?: boolean },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    const batch = (order.dispatchBatches ?? []).find((b) => b.id === payload.batchId)
    if (!batch) return { ok: false, error: "Dispatch batch not found." }

    if (
      batch.departedAt ||
      batch.stage === "Outbound in transit" ||
      batch.stage === "In Transit" ||
      batch.stage === "Delivered" ||
      batch.stage === "Return loading" ||
      batch.stage === "Return in transit" ||
      batch.stage === "Returned"
    ) {
      return {
        ok: false,
        error: "Departed or completed batches cannot be cancelled or deleted.",
      }
    }
    if (payload.deleteFromDispatch && order.warehouseClosed) {
      return { ok: false, error: "Event accountability is closed." }
    }
    if (batch.stage === "Cancelled") {
      if (payload.deleteFromDispatch && !batch.deletedAt) {
        const now = new Date().toISOString()
        batch.deletedAt = now
        batch.updatedAt = now
      }
      return { ok: true }
    }

    if (batch.direction === "outbound" && batch.stockTransferredAt) {
      for (const item of batch.items) {
        const stockLine = order.stockLines.find(
          (l) => l.assetId === (item.assetId ?? item.manifestLineId),
        )
        if (!stockLine) continue
        const lineDispatched = stockLine.dispatchedQty ?? 0
        const reverseQty = Math.min(item.actualQty, lineDispatched)
        if (reverseQty > 0) {
          const inv = draft.inventory.find((i) => i.assetId === stockLine.assetId)
          if (inv) {
            const actualReverse = Math.min(reverseQty, inv.dispatchedStock)
            inv.dispatchedStock = Math.max(0, inv.dispatchedStock - actualReverse)
            inv.allocatedStock += actualReverse
            inv.availableStock = Math.max(
              0,
              inv.totalStock - inv.allocatedStock - inv.dispatchedStock - inv.damagedCount - inv.missingCount,
            )
            stockLine.dispatchedQty = Math.max(0, lineDispatched - actualReverse)
          } else {
            stockLine.dispatchedQty = Math.max(0, lineDispatched - reverseQty)
          }
        }
      }
      batch.stockTransferredAt = undefined
    }

    batch.stage = "Cancelled"
    batch.cancelledAt = new Date().toISOString()
    batch.cancelReason = payload.reason?.trim() || `Cancelled by ${actor.name}`
    if (payload.deleteFromDispatch) batch.deletedAt = batch.cancelledAt
    batch.updatedAt = batch.cancelledAt
    return { ok: true }
  })
}
