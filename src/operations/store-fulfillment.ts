import { assets as catalogAssets, type Brief, type Project } from "../features/event-manager/model"
import { rentalVendors } from "../features/event-manager/rentals/rental-catalog"
import { oldSystemApis, v51ContractApis } from "./apiClients"
import type {
  CustomFabricationSpec,
  EventRentalRecord,
  OperationsStoreState,
  StockAllocationLine,
  WarehouseOrderRequest,
} from "./types"
import { mutateOperationsStore } from "./store-core"

/**
 * D01 & D02 & Scenario 9:
 * Publishes an approved Event Manager pitch to Warehouse -> Order Requests.
 * Strictly idempotent by `project.id` (`eventId`): repeating or retrying client approval
 * resolves to the same Order Request without duplicating allocations or fabrication jobs.
 */
export function publishApprovedEventToWarehouse(
  project: Project,
  actor: { name: string; email: string },
  briefOverride?: Brief,
): WarehouseOrderRequest {
  const brief = briefOverride ?? project.brief
  return mutateOperationsStore((draft) => {
    const existingOrder = draft.orderRequests.find((o) => o.eventId === project.id)

    const customSpecs: CustomFabricationSpec[] = (brief.customItems ?? []).map((ci) => ({
      id: ci.id,
      name: ci.name,
      requestedQty: Math.max(1, ci.quantity || 1),
      dimensions: ci.dimensions || "Standard build dimensions",
      ...(ci.heightCm !== undefined ? { heightCm: ci.heightCm } : {}),
      ...(ci.widthCm !== undefined ? { widthCm: ci.widthCm } : {}),
      ...(ci.depthCm !== undefined ? { depthCm: ci.depthCm } : {}),
      materials: ci.materials || "Specified per mood board",
      colors: ci.colors || "Event palette",
      finish: ci.finish || "Matte protective finish",
      buildInstructions: ci.instructions || "Follow Event Manager asset plan specifications.",
      referenceImages:
        ci.referenceImages && ci.referenceImages.length > 0
          ? ci.referenceImages
          : ["/event-manager-images/planning.jpg"],
    }))

    const mapRentals = (prevRentals: EventRentalRecord[]): EventRentalRecord[] => {
      return (brief.rentals ?? []).map((r) => {
        const vendor = rentalVendors.find((v) => v.id === r.vendorId)
        const prev = prevRentals.find((pr) => pr.id === r.id || (r.vendorId && pr.vendorId === r.vendorId))
        return {
          id: r.id,
          eventId: project.id,
          vendorId: r.vendorId ?? "sample-equipment",
          vendorName: vendor?.company ?? r.vendorName ?? r.snapshot?.vendorCompany ?? r.name ?? "External Rental Supplier",
          category: vendor?.supplierType ?? r.supplierType ?? r.snapshot?.supplierType ?? "Equipment rental supplier",
          itemName: r.itemName?.trim() || r.note?.trim() || r.snapshot?.itemName || vendor?.supplierType || "Event Rental Package",
          contact: r.contact || prev?.contact || "ops@supplier-partner.ph",
          ApprovedRequestedQty: Math.max(1, r.quantity ?? prev?.ApprovedRequestedQty ?? 1),
          directToVenue: r.directToVenue ?? prev?.directToVenue ?? true,
          notes: r.note || r.notes || prev?.notes || "",
          bookingReference: prev?.bookingReference ?? r.bookingReference ?? "",
          confirmationStatus: prev?.confirmationStatus ?? r.confirmationStatus ?? "Pending Confirmation",
          eLetter: prev?.eLetter,
          supplierAcceptance: prev?.supplierAcceptance,
          venueReceipt: prev?.venueReceipt,
          supplierReturn: prev?.supplierReturn,
        }
      })
    }

    if (existingOrder) {
      // Idempotent update on retry/re-approval (Scenario 9)
      existingOrder.projectId = existingOrder.projectId ?? project.id
      existingOrder.moodBoardId = existingOrder.moodBoardId ?? `pitch:${project.id}`
      existingOrder.eventTitle = brief.title
      existingOrder.clientName = brief.client
      existingOrder.clientEmail = brief.clientEmail
      existingOrder.venue = brief.venue
      existingOrder.venueLocation = brief.venueLocation ?? existingOrder.venueLocation
      existingOrder.startDateTime = brief.start
      existingOrder.endDateTime = brief.end
      existingOrder.theme = brief.theme
      existingOrder.pax = brief.pax
      existingOrder.approvalNote = project.approvalNote || existingOrder.approvalNote
      existingOrder.moodBoardNotes = brief.notes || existingOrder.moodBoardNotes
      existingOrder.moodBoardPages = brief.boardPages || existingOrder.moodBoardPages
      existingOrder.moodBoardPins = brief.pins || existingOrder.moodBoardPins
      existingOrder.eventContributions = existingOrder.eventContributions ?? []
      existingOrder.customSpecs = customSpecs
      existingOrder.rentals = mapRentals(existingOrder.rentals)

      // Sync any new stock lines without duplicating existing allocations
      for (const req of brief.requirements) {
        const cat = catalogAssets.find((a) => a.id === req.assetId)
        const inv = draft.inventory.find((i) => i.assetId === req.assetId)
        const existingLine = existingOrder.stockLines.find((s) => s.assetId === req.assetId)
        if (existingLine) {
          existingLine.approvedRequestedQty = req.quantity
        } else if (cat) {
          existingOrder.stockLines.push({
            assetId: req.assetId,
            assetCode: inv?.assetCode ?? `AST-${req.assetId.slice(-4).toUpperCase()}`,
            name: cat.name,
            category: cat.category,
            image: cat.image,
            unit: cat.unit,
            approvedRequestedQty: req.quantity,
            allocatedQty: 0,
            deficitQty: 0,
            releasedForLoadQty: 0,
            loadedQty: 0,
            loadingVerified: false,
            returnedQty: 0,
          })
        }
      }

      // Sync custom fabrication jobs without duplicating
      for (const spec of customSpecs) {
        const existingJob = draft.fabricationJobs.find(
          (j) => j.eventId === project.id && j.customItemId === spec.id,
        )
        if (existingJob) {
          existingJob.spec = spec
          existingJob.eventTitle = brief.title
        } else {
          draft.fabricationJobs.push({
            id: `fab-${project.id.slice(-5)}-${spec.id.slice(-4)}`,
            eventId: project.id,
            eventTitle: brief.title,
            customItemId: spec.id,
            spec,
            status: "Unassigned",
            assignedCrewEmails: [],
            progressPercent: 0,
            completedQty: 0,
            materialsVerified: true,
            linkedShiftPhotoIds: [],
            releasedForLoading: false,
            updatedAt: new Date().toISOString(),
            assignmentMode: "group",
            inheritedLeadEmail: existingOrder.teamLeadEmail,
            inheritedLeadName: existingOrder.teamLeadName,
            productionLeadEmail: existingOrder.teamLeadEmail,
            productionLeadName: existingOrder.teamLeadName,
            estimateBasis: spec.estimateBasis ?? "per-unit",
            estimatedHoursPerUnitOrSet: spec.estimatedHoursPerUnitOrSet,
            participantEmails: [],
            assignments: [],
            schedules: [],
            contributions: [],
            groupProgressReports: [],
            submissions: [],
            correctionRequests: [],
            migrationReviewFlags: [],
            migrationResolutionHistory: [],
          })
        }
      }

      void v51ContractApis.publishOrderRequest({
        eventId: project.id,
        eventTitle: brief.title,
        venue: brief.venue,
        startDateTime: brief.start,
        endDateTime: brief.end,
        stockItems: brief.requirements,
        customSpecs,
        rentals: existingOrder.rentals,
      })

      return existingOrder
    }

    // Create new single authoritative WarehouseOrderRequest for this eventId
    const stockLines: StockAllocationLine[] = brief.requirements.map((req) => {
      const cat = catalogAssets.find((a) => a.id === req.assetId)
      const inv = draft.inventory.find((i) => i.assetId === req.assetId)
      return {
        assetId: req.assetId,
        assetCode: inv?.assetCode ?? `AST-${req.assetId.slice(-4).toUpperCase()}`,
        name: cat?.name ?? req.assetId,
        category: cat?.category ?? "Decor",
        image: cat?.image ?? "/event-manager-images/planning.jpg",
        unit: cat?.unit ?? "piece",
        approvedRequestedQty: req.quantity,
        allocatedQty: 0,
        deficitQty: 0,
        releasedForLoadQty: 0,
        loadedQty: 0,
        loadingVerified: false,
        returnedQty: 0,
      }
    })

    const rentals = mapRentals([])
    const orderNumber = String(draft.orderRequests.length + 101).padStart(4, "0")
    const newOrder: WarehouseOrderRequest = {
      id: `ORD-2026-${orderNumber}`,
      eventId: project.id,
      projectId: project.id,
      moodBoardId: `pitch:${project.id}`,
      eventTitle: brief.title,
      clientName: brief.client,
      clientEmail: brief.clientEmail,
      venue: brief.venue,
      venueLocation: brief.venueLocation,
      startDateTime: brief.start,
      endDateTime: brief.end,
      theme: brief.theme,
      pax: brief.pax,
      approvalNote: project.approvalNote || "Approved by client for event fulfillment.",
      approvedByName: actor.name,
      approvedByEmail: actor.email,
      approvedAt: project.approvedAt || new Date().toISOString(),
      revisionAtApproval: project.revision,
      stockLines,
      customSpecs,
      rentals,
      eventRoster: [],
      crewAssignments: [],
      eventAssignments: [],
      eventSchedules: [],
      eventContributions: [],
      teamLeadHistory: [],
      manifestPrepared: false,
      warehouseClosed: false,
      moodBoardNotes: brief.notes,
      moodBoardPages: brief.boardPages,
      moodBoardPins: brief.pins,
      migrationReviewFlags: [],
      migrationResolutionHistory: [],
    }

    draft.orderRequests.unshift(newOrder)

    // Create linked production jobs for any custom items (start Unassigned without auto demo crew)
    for (const spec of customSpecs) {
      draft.fabricationJobs.unshift({
        id: `fab-${project.id.slice(-5)}-${spec.id.slice(-4)}`,
        eventId: project.id,
        eventTitle: brief.title,
        customItemId: spec.id,
        spec,
        status: "Unassigned",
        assignedCrewEmails: [],
        progressPercent: 0,
        completedQty: 0,
        materialsVerified: true,
        linkedShiftPhotoIds: [],
        releasedForLoading: false,
        updatedAt: new Date().toISOString(),
        assignmentMode: "group",
        estimateBasis: spec.estimateBasis ?? "per-unit",
        estimatedHoursPerUnitOrSet: spec.estimatedHoursPerUnitOrSet,
        participantEmails: [],
        assignments: [],
        schedules: [],
        contributions: [],
        groupProgressReports: [],
        submissions: [],
        correctionRequests: [],
        migrationReviewFlags: [],
        migrationResolutionHistory: [],
      })
    }

    void oldSystemApis.events.createBulkReservations(
      project.id,
      brief.requirements.map((r) => ({ assetId: r.assetId, quantityRequested: r.quantity })),
    )
    void v51ContractApis.publishOrderRequest({
      eventId: project.id,
      eventTitle: brief.title,
      venue: brief.venue,
      startDateTime: brief.start,
      endDateTime: brief.end,
      stockItems: brief.requirements,
      customSpecs,
      rentals,
    })

    return newOrder
  })
}

/**
 * Warehouse Operations Manager:
 * Allocates available stock to an Order Request line and optionally logs any shortage to Deficit Queue.
 */
export function allocateStockForOrderLine(
  eventId: string,
  assetId: string,
  allocateQty: number,
  releaseForLoad: boolean,
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Order Request not found." }
    const line = order.stockLines.find((s) => s.assetId === assetId)
    if (!line) return { ok: false, error: "Stock line not found in Order Request." }

    const inv = draft.inventory.find((i) => i.assetId === assetId)
    const prevAllocated = line.allocatedQty
    const delta = allocateQty - prevAllocated

    if (inv && delta > inv.availableStock) {
      return {
        ok: false,
        error: `Cannot allocate ${allocateQty}: only ${inv.availableStock + prevAllocated} available in warehouse stock. Queue the shortage in Deficit Queue first.`,
      }
    }

    if (inv) {
      inv.allocatedStock = Math.max(0, inv.allocatedStock + delta)
      inv.availableStock = Math.max(0, inv.totalStock - inv.allocatedStock - inv.dispatchedStock - inv.damagedCount - inv.missingCount)
    }

    line.allocatedQty = Math.max(0, allocateQty)
    line.deficitQty = Math.max(0, line.approvedRequestedQty - line.allocatedQty)
    if (releaseForLoad) {
      line.releasedForLoadQty = line.allocatedQty
    }

    // Automatically sync shortage to Deficit Queue if deficitQty > 0
    const existingDeficit = draft.deficitQueue.find(
      (d) => d.eventId === eventId && d.assetId === assetId && d.status !== "Fulfilled",
    )
    if (line.deficitQty > 0) {
      if (existingDeficit) {
        existingDeficit.shortageQty = line.deficitQty
      } else {
        draft.deficitQueue.unshift({
          id: `DEF-${Date.now().toString().slice(-5)}`,
          eventId,
          eventTitle: order.eventTitle,
          assetId: line.assetId,
          assetCode: line.assetCode,
          assetName: line.name,
          category: line.category,
          shortageQty: line.deficitQty,
          urgency: line.deficitQty >= 10 ? "High" : "Standard",
          status: "Open",
          createdAt: new Date().toISOString(),
        })
      }
    } else if (existingDeficit) {
      existingDeficit.status = "Fulfilled"
      existingDeficit.resolvedAt = new Date().toISOString()
    }

    return { ok: true }
  })
}

/**
 * Warehouse Operations Manager:
 * Allocates all available stock across every stock line in an Order Request.
 */
export function allocateAllStockForEvent(eventId: string): { allocatedLines: number; deficitsCreated: number } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { allocatedLines: 0, deficitsCreated: 0 }
    let allocatedLines = 0
    let deficitsCreated = 0

    for (const line of order.stockLines) {
      const inv = draft.inventory.find((i) => i.assetId === line.assetId)
      const maxCanAllocate = inv
        ? Math.min(line.approvedRequestedQty, inv.availableStock + line.allocatedQty)
        : line.approvedRequestedQty
      const delta = maxCanAllocate - line.allocatedQty
      if (inv) {
        inv.allocatedStock = Math.max(0, inv.allocatedStock + delta)
        inv.availableStock = Math.max(0, inv.totalStock - inv.allocatedStock - inv.dispatchedStock - inv.damagedCount - inv.missingCount)
      }
      line.allocatedQty = maxCanAllocate
      line.releasedForLoadQty = maxCanAllocate
      line.deficitQty = Math.max(0, line.approvedRequestedQty - maxCanAllocate)
      allocatedLines += 1

      if (line.deficitQty > 0) {
        const existingDeficit = draft.deficitQueue.find(
          (d) => d.eventId === eventId && d.assetId === line.assetId && d.status !== "Fulfilled",
        )
        if (!existingDeficit) {
          draft.deficitQueue.unshift({
            id: `DEF-${Date.now().toString().slice(-4)}-${allocatedLines}`,
            eventId,
            eventTitle: order.eventTitle,
            assetId: line.assetId,
            assetCode: line.assetCode,
            assetName: line.name,
            category: line.category,
            shortageQty: line.deficitQty,
            urgency: "High",
            status: "Open",
            createdAt: new Date().toISOString(),
          })
          deficitsCreated += 1
        }
      }
    }
    order.manifestPrepared = true
    order.manifestPreparedAt = new Date().toISOString()
    order.manifestPreparedBy = "Warehouse Operations Manager"
    return { allocatedLines, deficitsCreated }
  })
}

export type EventCancellationEvaluation = {
  canCancel: boolean
  reason?: string
  orderId?: string
  reservationsToRelease: { assetId: string; name: string; allocatedQty: number }[]
}

/**
 * Evaluates whether an approved event can be safely cancelled before any loading,
 * dispatch, return, fabrication, or incident activity begins.
 * Received acquisitions (including unresolved receipt reconciliation) do not block cancellation.
 */
export function evaluateApprovedEventCancellation(
  state: OperationsStoreState,
  eventId: string,
): EventCancellationEvaluation {
  const order = state.orderRequests.find(
    (o) => o.eventId === eventId || o.projectId === eventId,
  )
  if (!order) {
    return { canCancel: true, reservationsToRelease: [] }
  }

  if (order.warehouseClosed) {
    return {
      canCancel: false,
      orderId: order.id,
      reservationsToRelease: [],
      reason: "Warehouse event accountability is already closed.",
    }
  }
  if (order.outboundDeparture || order.venueArrival || order.warehouseArrival) {
    return {
      canCancel: false,
      orderId: order.id,
      reservationsToRelease: [],
      reason: "Dispatch or return checkpoint activity has already begun for this event.",
    }
  }
  const activeBatches = (order.dispatchBatches ?? []).filter(
    (b) =>
      b.departedAt ||
      b.stage === "Loaded" ||
      b.stage === "In Transit" ||
      b.stage === "Delivered" ||
      b.stage === "Returned",
  )
  if (activeBatches.length > 0) {
    return {
      canCancel: false,
      orderId: order.id,
      reservationsToRelease: [],
      reason: "One or more dispatch batches have already been loaded, dispatched, or returned.",
    }
  }
  if (order.stockLines.some((s) => s.loadedQty > 0 || Boolean(s.returnCounted))) {
    return {
      canCancel: false,
      orderId: order.id,
      reservationsToRelease: [],
      reason: "Physical manifest loading or return counts have already been recorded.",
    }
  }
  const eventJobs = state.fabricationJobs.filter((j) => j.eventId === order.eventId)
  if (
    eventJobs.some(
      (j) =>
        j.status !== "Unassigned" ||
        j.progressPercent > 0 ||
        j.completedQty > 0 ||
        (j.submissions?.length ?? 0) > 0 ||
        Boolean(j.releasedForLoading),
    )
  ) {
    return {
      canCancel: false,
      orderId: order.id,
      reservationsToRelease: [],
      reason: "Custom fabrication work, submissions, or loading release already exist for this event.",
    }
  }
  if (state.incidentReports.some((r) => r.eventId === order.eventId)) {
    return {
      canCancel: false,
      orderId: order.id,
      reservationsToRelease: [],
      reason: "Field damage or missing-item reports exist for this event.",
    }
  }

  const reservationsToRelease = order.stockLines
    .filter((s) => s.allocatedQty > 0)
    .map((s) => ({
      assetId: s.assetId,
      name: s.name,
      allocatedQty: s.allocatedQty,
    }))

  return {
    canCancel: true,
    orderId: order.id,
    reservationsToRelease,
  }
}

/**
 * Idempotently cancels an approved event in Warehouse:
 * releases only this event's unused stock reservations (preserving totalStock),
 * removes the linked order and unstarted fabrication/deficit records,
 * preserves linked acquisitions, receipt history, and any unresolved reconciliation,
 * and records an audit entry so retries cannot release stock twice.
 */
export function cancelApprovedEventInWarehouse(
  eventId: string,
  actor: { name: string; email: string },
  reason: string,
): { ok: true; alreadyCancelled: boolean; releasedUnits: number } | { ok: false; error: string } {
  const cleanReason = reason.trim()
  if (!cleanReason) {
    return { ok: false, error: "Cancellation reason is required." }
  }

  return mutateOperationsStore((draft) => {
    const orderIdx = draft.orderRequests.findIndex(
      (o) => o.eventId === eventId || o.projectId === eventId,
    )
    const alreadyAudited = (draft.cancelledEvents ?? []).some((c) => c.eventId === eventId)
    if (orderIdx < 0 && alreadyAudited) {
      return { ok: true, alreadyCancelled: true, releasedUnits: 0 }
    }

    const evalRes = evaluateApprovedEventCancellation(draft, eventId)
    if (!evalRes.canCancel) {
      return { ok: false, error: evalRes.reason || "Event cannot be cancelled." }
    }

    const order = orderIdx >= 0 ? draft.orderRequests[orderIdx] : undefined
    let releasedUnits = 0

    if (order) {
      for (const line of order.stockLines) {
        if (line.allocatedQty > 0) {
          const inv = draft.inventory.find((i) => i.assetId === line.assetId)
          if (inv) {
            inv.allocatedStock = Math.max(0, inv.allocatedStock - line.allocatedQty)
            inv.availableStock = Math.max(
              0,
              inv.totalStock -
              inv.allocatedStock -
              inv.dispatchedStock -
              inv.damagedCount -
              inv.missingCount,
            )
          }
          releasedUnits += line.allocatedQty
        }
      }

      const targetEventId = order.eventId
      draft.orderRequests.splice(orderIdx, 1)
      draft.fabricationJobs = draft.fabricationJobs.filter((j) => j.eventId !== targetEventId)
      draft.deficitQueue = draft.deficitQueue.filter((d) => d.eventId !== targetEventId)
    }

    draft.cancelledEvents = [
      ...(draft.cancelledEvents ?? []),
      {
        eventId,
        orderId: order?.id,
        eventTitle: order?.eventTitle ?? eventId,
        cancelledAt: new Date().toISOString(),
        cancelledByName: actor.name,
        cancelledByEmail: actor.email.toLowerCase(),
        reason: cleanReason,
        releasedReservations: evalRes.reservationsToRelease,
      },
    ]

    return { ok: true, alreadyCancelled: false, releasedUnits }
  })
}
