import { oldSystemApis, v51ContractApis } from "./apiClients"
import type {
  CheckpointName,
  FieldIncidentReport,
  IssueResolutionType,
  LegacyInventoryReconciliationAudit,
  LegacyInventoryReconciliationDecision,
  LegacyInventorySnapshot,
  OperationsStoreState,
  WarehouseInventoryItem,
  WarehouseOrderRequest,
} from "./types"
import { getOrderLineDispatchedQty, getTripItemDamageSummary, mutateOperationsStore, type OpsActor } from "./store-core"

function recalculateAvailableStock(inv: WarehouseInventoryItem) {
  inv.availableStock = Math.max(
    0,
    inv.totalStock -
      inv.allocatedStock -
      inv.dispatchedStock -
      inv.damagedCount -
      inv.missingCount,
  )
}

function getRemainingDispatchedForOrderLine(
  draft: OperationsStoreState,
  order: WarehouseOrderRequest,
  line: WarehouseOrderRequest["stockLines"][number],
): number {
  const dispatchedQty = getOrderLineDispatchedQty(order, line)
  if (order.warehouseClosed || dispatchedQty <= 0) {
    return 0
  }
  const alreadyTransferred = draft.incidentReports
    .filter(
      (r) =>
        r.eventId === order.eventId &&
        (r.lineId === line.assetId ||
          r.itemCode === line.assetCode ||
          r.itemName === line.name),
    )
    .reduce((sum, r) => sum + (r.transferredFromDispatchedQty ?? 0), 0)
  return Math.max(0, dispatchedQty - alreadyTransferred)
}

function applyIncidentInventoryAdjustment(
  draft: OperationsStoreState,
  inv: WarehouseInventoryItem,
  order: WarehouseOrderRequest | undefined,
  line: WarehouseOrderRequest["stockLines"][number] | undefined,
  reportType: "Damage" | "Missing",
  qty: number,
): { adjustedQty: number; transferredFromDispatchedQty: number } {
  const remainingDispatched =
    order && line ? getRemainingDispatchedForOrderLine(draft, order, line) : 0
  const transferFromDispatched = Math.min(
    qty,
    remainingDispatched,
    inv.dispatchedStock,
  )
  if (transferFromDispatched > 0) {
    inv.dispatchedStock = Math.max(0, inv.dispatchedStock - transferFromDispatched)
  }
  if (reportType === "Damage") inv.damagedCount += qty
  else inv.missingCount += qty
  recalculateAvailableStock(inv)
  return {
    adjustedQty: qty,
    transferredFromDispatchedQty: transferFromDispatched,
  }
}

function reverseIncidentInventoryAdjustment(
  inv: WarehouseInventoryItem | undefined,
  order: WarehouseOrderRequest | undefined,
  reportType: "Damage" | "Missing",
  reverseAdjustedQty: number,
  reverseTransferredQty: number,
) {
  if (!inv) return
  if (reverseAdjustedQty > 0) {
    if (reportType === "Missing") {
      inv.missingCount = Math.max(
        0,
        inv.missingCount - Math.min(inv.missingCount, reverseAdjustedQty),
      )
    } else {
      inv.damagedCount = Math.max(
        0,
        inv.damagedCount - Math.min(inv.damagedCount, reverseAdjustedQty),
      )
    }
  }
  if (order && !order.warehouseClosed && reverseTransferredQty > 0) {
    inv.dispatchedStock += reverseTransferredQty
  }
  recalculateAvailableStock(inv)
}

function findInventoryForReport(
  draft: OperationsStoreState,
  itemCode: string,
  itemName: string,
  order?: WarehouseOrderRequest,
  lineId?: string,
): WarehouseInventoryItem | undefined {
  if (lineId) {
    const byLineId = draft.inventory.find((i) => i.assetId === lineId)
    if (byLineId) return byLineId
  }
  if (order) {
    const lineMatch = order.stockLines.find(
      (s) => s.assetId === lineId || s.assetCode === itemCode || s.name === itemName,
    )
    if (lineMatch) {
      const byOrderLine = draft.inventory.find(
        (i) => i.assetId === lineMatch.assetId || i.assetCode === lineMatch.assetCode,
      )
      if (byOrderLine) return byOrderLine
    }
  }
  return draft.inventory.find(
    (i) => i.assetCode === itemCode || i.name === itemName,
  )
}

/**
 * Checkpoints 2, 3 (EVENT HOURS), and 4 — File Damage Report or Missing Item Report:
 * Tags the report with the checkpoint (`Venue Arrival`, `Event Hours`, `Warehouse Arrival`),
 * item, quantity, description, and photo evidence.
 */
export function submitFieldIncidentReport(
  actor: OpsActor,
  payload: {
    eventId: string
    reportType: "Damage" | "Missing"
    checkpoint: CheckpointName
    batchId?: string
    itemCode: string
    itemName: string
    quantity: number
    description: string
    photoUrl: string
  },
): { ok: true; report: FieldIncidentReport } | { ok: false; error: string } {
  if (!payload.itemName.trim()) {
    return { ok: false, error: "Select or enter the affected item." }
  }
  if (!Number.isInteger(payload.quantity) || payload.quantity < 1) {
    return {
      ok: false,
      error: "Affected quantity must be a whole number of at least 1.",
    }
  }
  if (!payload.description.trim()) {
    return { ok: false, error: "Describe the damage or missing item details." }
  }
  if (payload.reportType === "Damage" && !payload.photoUrl.trim()) {
    return { ok: false, error: "Photo evidence is required for a Damage Report." }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot file field incident reports after Warehouse event accountability is closed.",
      }
    }

    const cleanCode = payload.itemCode.trim() || "AST-GEN"
    const cleanName = payload.itemName.trim()

    const matchedLine = order.stockLines.find(
      (s) => s.assetCode === cleanCode || s.name === cleanName,
    )
    const matchedJob = !matchedLine
      ? draft.fabricationJobs.find(
          (j) =>
            j.eventId === payload.eventId &&
            j.status === "Ready to Load" &&
            (`FAB-${j.id.slice(-4).toUpperCase()}` === cleanCode ||
              j.spec.name === cleanName ||
              `${j.spec.name} (Custom Fabrication)` === cleanName),
        )
      : undefined
    const matchedRental =
      !matchedLine && !matchedJob
        ? order.rentals.find(
            (r) => r.itemName === cleanName || r.id === cleanCode,
          )
        : undefined

    if (!matchedLine && !matchedJob && !matchedRental) {
      return {
        ok: false,
        error: `Affected item (${cleanCode} — ${cleanName}) does not belong to this event's accountable manifest or rentals.`,
      }
    }

    const accountableQty = matchedLine
      ? matchedLine.loadedQty > 0
        ? matchedLine.loadedQty
        : matchedLine.releasedForLoadQty > 0
          ? matchedLine.releasedForLoadQty
          : matchedLine.allocatedQty
      : matchedJob
        ? matchedJob.spec.requestedQty
        : (matchedRental?.venueReceipt?.deliveredQty ??
          matchedRental?.ApprovedRequestedQty ??
          0)

    if (accountableQty < 1) {
      return {
        ok: false,
        error: `${cleanName} has 0 accountable units on this event.`,
      }
    }

    const alreadyAccountedQty = draft.incidentReports
      .filter(
        (r) =>
          r.eventId === payload.eventId &&
          r.resolutionType !== "Recovered" &&
          ((matchedLine && r.lineId === matchedLine.assetId) ||
            r.itemCode === cleanCode ||
            r.itemName === cleanName),
      )
      .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)

    const remainingAccountable = Math.max(0, accountableQty - alreadyAccountedQty)
    if (payload.quantity > remainingAccountable) {
      return {
        ok: false,
        error: `Incident quantity (${payload.quantity}) exceeds the remaining accountable balance (${remainingAccountable} of ${accountableQty}) for ${cleanName} on this event.`,
      }
    }

    let linkedTrip: { batch: NonNullable<WarehouseOrderRequest["dispatchBatches"]>[number]; item: NonNullable<WarehouseOrderRequest["dispatchBatches"]>[number]["items"][number] } | undefined
    if (payload.batchId) {
      const trip = (order.dispatchBatches ?? []).find(
        (b) => b.id === payload.batchId && !b.deletedAt && b.stage !== "Cancelled",
      )
      if (!trip) {
        return { ok: false, error: `Dispatch trip ${payload.batchId} was not found for this event.` }
      }
      const tripItem = trip.items.find(
        (i) =>
          (matchedLine && (i.assetId === matchedLine.assetId || i.manifestLineId === matchedLine.assetId)) ||
          i.itemCode === cleanCode ||
          i.name === cleanName,
      )
      if (!tripItem) {
        return { ok: false, error: `Dispatch trip ${payload.batchId} does not carry ${cleanName}.` }
      }
      if (payload.reportType === "Damage") {
        const cap = getTripItemDamageSummary(draft.incidentReports, order, trip, tripItem)
        if (payload.quantity > cap.remainingDamageCapacity) {
          return {
            ok: false,
            error: `Damage quantity (${payload.quantity}) exceeds remaining damage capacity (${cap.remainingDamageCapacity} of ${cap.tripAccountableQty}) for ${cleanName} on trip ${payload.batchId}.`,
          }
        }
      } else {
        const tripQty =
          trip.direction === "outbound"
            ? (tripItem.returnPlannedQty ?? (tripItem.actualQty > 0 ? tripItem.actualQty : tripItem.plannedQty))
            : tripItem.plannedQty
        if (payload.quantity > tripQty) {
          return {
            ok: false,
            error: `Incident quantity (${payload.quantity}) exceeds the quantity (${tripQty}) carried by trip ${payload.batchId}.`,
          }
        }
      }
      linkedTrip = { batch: trip, item: tripItem }
    }

    const report: FieldIncidentReport = {
      id: `INC-${Date.now().toString().slice(-6)}`,
      eventId: payload.eventId,
      eventTitle: order.eventTitle,
      reportType: payload.reportType,
      checkpoint: payload.checkpoint,
      itemCode: cleanCode,
      itemName: cleanName,
      quantity: payload.quantity,
      originalQuantity: payload.quantity,
      reportSource: "manual-field-report",
      description: payload.description.trim(),
      photoUrl: payload.photoUrl.trim() || "/event-manager-images/planning.jpg",
      submittedByEmail: actor.email.toLowerCase(),
      submittedByName: actor.name,
      submittedAt: new Date().toISOString(),
      resolutionStatus: "Pending",
    }

    if (matchedLine) {
      report.lineId = matchedLine.assetId
    }
    if (linkedTrip) {
      report.batchId = linkedTrip.batch.id
      report.tripAllocations = [
        {
          batchId: linkedTrip.batch.id,
          quantity: payload.quantity,
          allocatedAt: report.submittedAt,
          allocatedByEmail: actor.email.toLowerCase(),
          allocatedByName: actor.name,
        },
      ]
      if (payload.reportType === "Damage") {
        const capAfter = getTripItemDamageSummary(
          [report, ...draft.incidentReports],
          order,
          linkedTrip.batch,
          linkedTrip.item,
        )
        linkedTrip.item.returnDamagedQty = capAfter.existingDamageAllocated
      }
    }
    const inv = findInventoryForReport(
      draft,
      report.itemCode,
      report.itemName,
      order,
      report.lineId,
    )
    if (inv) {
      const adj = applyIncidentInventoryAdjustment(
        draft,
        inv,
        order,
        matchedLine,
        payload.reportType,
        payload.quantity,
      )
      report.inventoryAdjustedQty = adj.adjustedQty
      report.transferredFromDispatchedQty = adj.transferredFromDispatchedQty
      report.inventoryRecoveryApplied = false
    } else {
      report.inventoryAdjustedQty = 0
      report.transferredFromDispatchedQty = 0
    }

    draft.incidentReports.unshift(report)

    void oldSystemApis.damage.submitDamageReport({
      eventId: payload.eventId,
      assetId: report.itemCode,
      damageSeverity: payload.reportType === "Missing" ? "Missing" : "Damaged",
      description: `[${payload.checkpoint}] ${report.description}`,
      quantityAffected: report.quantity,
      photoEvidenceUrl: report.photoUrl,
    })
    void v51ContractApis.submitIncidentReport(payload.eventId, report)

    return { ok: true, report }
  })
}

/**
 * Checkpoint 4 (WAREHOUSE ARRIVAL):
 * Updates the physical returned count for a manifest line against the quantity that actually left.
 */
export function updateManifestReturnedQuantity(
  eventId: string,
  assetId: string,
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
    const line = order.stockLines.find((s) => s.assetId === assetId)
    if (!line) return { ok: false, error: "Manifest line not found." }

    const outboundActual = line.loadedQty > 0 ? line.loadedQty : line.releasedForLoadQty
    const clamped = Math.max(0, Math.min(outboundActual, returnedQty))
    const changed = !line.returnCounted || line.returnedQty !== clamped

    line.returnedQty = clamped
    line.returnCounted = true
    line.legacyReturnUncertain = false

    if (changed && order.returnChecklist) {
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

    return { ok: true, discrepancy: Math.max(0, outboundActual - clamped) }
  })
}

/**
 * Checkpoint 4 — Team Lead submits final Return Checklist to Warehouse (Scenario 1, 6, 7, 8):
 * - Requires the currently designated Team Lead for the event.
 * - Requires Warehouse Arrival photo confirmation first.
 * - Automatically files a Missing Item Report for any line where `returnedQty < loadedQty`
 *   if one hasn't been filed yet, ensuring Warehouse must resolve it before closing the event.
 */
export function submitFinalReturnChecklist(
  actor: OpsActor,
  eventId: string,
  notes: string,
):
  | { ok: true; autoCreatedMissingReports: number; alreadySubmitted?: boolean }
  | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (order.warehouseClosed) {
      return {
        ok: false,
        error: "Warehouse event accountability is already closed.",
      }
    }

    if (!order.teamLeadEmail || order.teamLeadEmail.toLowerCase() !== actor.email.toLowerCase()) {
      return {
        ok: false,
        error: `Only the currently designated Team Lead (${order.teamLeadName || "Unassigned"}) can submit the final Return Checklist.`,
      }
    }

    if (!order.warehouseArrival) {
      return {
        ok: false,
        error: "Confirm Arrived at Warehouse with a warehouse arrival photo before submitting the final Return Checklist.",
      }
    }

    const uncountedLines = order.stockLines.filter(
      (line) => line.loadedQty > 0 && !line.returnCounted && !line.legacyReturnUncertain,
    )
    if (uncountedLines.length > 0) {
      const names = uncountedLines.map((l) => l.name).join(", ")
      return {
        ok: false,
        error: `Record physical return counts (or confirm 0 returned) before submitting the final Return Checklist for: ${names}.`,
      }
    }

    const hadChecklistBefore = Boolean(order.returnChecklist)
    const activeTrips = (order.dispatchBatches ?? []).filter(
      (b) => !b.deletedAt && b.stage !== "Cancelled",
    )
    const unresolvedTrips = activeTrips.filter((b) => b.stage !== "Returned")
    if (unresolvedTrips.length > 0) {
      const summary = unresolvedTrips.map((b) => `${b.id} (${b.stage})`).join(", ")
      return {
        ok: false,
        error: `CLOSEOUT BLOCKED (D05): All active dispatch trips must complete return accountability (Returned) or be cancelled before closing the event: ${summary}.`,
      }
    }

    if (activeTrips.length > 0) {
      const unallocatedDamage = draft.incidentReports.filter((r) => {
        if (r.eventId !== eventId || r.reportType !== "Damage") return false
        if (r.batchId) return false
        const allocated = (r.tripAllocations ?? []).reduce((s, a) => s + a.quantity, 0)
        return allocated < r.quantity
      })
      if (unallocatedDamage.length > 0) {
        const summary = unallocatedDamage.map((r) => `${r.itemName} (×${r.quantity})`).join(", ")
        return {
          ok: false,
          error: `CLOSEOUT BLOCKED (D05): Allocate all event-level damage reports to dispatch trip(s) before closing the event: ${summary}.`,
        }
      }
      for (const trip of activeTrips) {
        for (const tripItem of trip.items) {
          const cap = getTripItemDamageSummary(draft.incidentReports, order, trip, tripItem)
          if (cap.isExcessive) {
            return {
              ok: false,
              error: `CLOSEOUT BLOCKED (D05): Trip ${trip.id} has excessive damage allocations for ${tripItem.name} (${cap.existingDamageAllocated} allocated vs ${cap.tripAccountableQty} carried).`,
            }
          }
        }
      }
    }

    const now = new Date().toISOString()
    let autoCreatedMissingReports = 0

    for (const line of order.stockLines) {
      const outbound = line.loadedQty > 0 ? line.loadedQty : line.releasedForLoadQty
      const shortage = Math.max(0, outbound - line.returnedQty)

      const matchingActiveMissing = draft.incidentReports.filter(
        (r) =>
          r.eventId === eventId &&
          r.reportType === "Missing" &&
          r.resolutionType !== "Recovered" &&
          (r.lineId === line.assetId ||
            r.itemCode === line.assetCode ||
            r.itemName === line.name),
      )
      let existingMissingQty = matchingActiveMissing.reduce(
        (sum, r) => sum + (Number(r.quantity) || 0),
        0,
      )

      // Reconcile decreased shortages against still-Pending auto-created Return Checklist reports
      if (shortage < existingMissingQty) {
        let excess = existingMissingQty - shortage
        const inv = findInventoryForReport(
          draft,
          line.assetCode,
          line.name,
          order,
          line.assetId,
        )
        for (const rep of matchingActiveMissing) {
          if (excess <= 0) break
          if (
            rep.resolutionStatus !== "Pending" ||
            rep.reportSource !== "auto-return-checklist"
          ) {
            continue
          }
          if (rep.originalQuantity === undefined) {
            rep.originalQuantity = rep.quantity
          }
          if (excess >= rep.quantity) {
            const prevQty = rep.quantity
            const revAdj =
              typeof rep.inventoryAdjustedQty === "number" ? rep.inventoryAdjustedQty : 0
            const revTrans = rep.transferredFromDispatchedQty ?? 0
            reverseIncidentInventoryAdjustment(inv, order, "Missing", revAdj, revTrans)
            rep.quantityAdjustmentHistory = [
              ...(rep.quantityAdjustmentHistory ?? []),
              {
                previousQty: prevQty,
                newQty: 0,
                adjustedAt: now,
                adjustedByEmail: actor.email.toLowerCase(),
                adjustedByName: actor.name,
                reason: `Reconciled to 0 missing after updated Return Checklist (${line.returnedQty}/${outbound} returned).`,
              },
            ]
            rep.resolutionStatus = "Resolved"
            rep.resolutionType = "Recovered"
            rep.resolutionNotes =
              "Reconciled after updated physical return count on Return Checklist."
            rep.resolvedByEmail = actor.email.toLowerCase()
            rep.resolvedByName = actor.name
            rep.resolvedAt = now
            rep.inventoryRecoveryApplied = true
            rep.inventoryAdjustedQty = 0
            rep.transferredFromDispatchedQty = 0
            excess -= rep.quantity
          } else {
            const prevQty = rep.quantity
            const revAdj =
              typeof rep.inventoryAdjustedQty === "number"
                ? Math.min(rep.inventoryAdjustedQty, excess)
                : 0
            const revTrans = Math.min(rep.transferredFromDispatchedQty ?? 0, excess)
            reverseIncidentInventoryAdjustment(inv, order, "Missing", revAdj, revTrans)
            if (typeof rep.inventoryAdjustedQty === "number") {
              rep.inventoryAdjustedQty = Math.max(0, rep.inventoryAdjustedQty - revAdj)
            }
            if (typeof rep.transferredFromDispatchedQty === "number") {
              rep.transferredFromDispatchedQty = Math.max(
                0,
                rep.transferredFromDispatchedQty - revTrans,
              )
            }
            rep.quantity -= excess
            rep.quantityAdjustmentHistory = [
              ...(rep.quantityAdjustmentHistory ?? []),
              {
                previousQty: prevQty,
                newQty: rep.quantity,
                adjustedAt: now,
                adjustedByEmail: actor.email.toLowerCase(),
                adjustedByName: actor.name,
                reason: `Reduced shortage after updated Return Checklist (${line.returnedQty}/${outbound} returned).`,
              },
            ]
            rep.description = `Return count discrepancy on Return Checklist (updated): ${line.returnedQty} returned of ${outbound} outbound loaded.`
            excess = 0
          }
        }
        existingMissingQty = matchingActiveMissing
          .filter((r) => r.resolutionType !== "Recovered")
          .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
      }

      if (shortage > existingMissingQty) {
        const unreportedShortage = shortage - existingMissingQty
        const inv = findInventoryForReport(
          draft,
          line.assetCode,
          line.name,
          order,
          line.assetId,
        )
        let adj = { adjustedQty: 0, transferredFromDispatchedQty: 0 }
        if (inv) {
          adj = applyIncidentInventoryAdjustment(
            draft,
            inv,
            order,
            line,
            "Missing",
            unreportedShortage,
          )
        }

        draft.incidentReports.unshift({
          id: `INC-MIS-${Date.now().toString().slice(-5)}-${draft.incidentReports.length + autoCreatedMissingReports + 1}`,
          eventId,
          eventTitle: order.eventTitle,
          reportType: "Missing",
          checkpoint: "Warehouse Arrival",
          lineId: line.assetId,
          itemCode: line.assetCode,
          itemName: line.name,
          quantity: unreportedShortage,
          originalQuantity: unreportedShortage,
          reportSource: "auto-return-checklist",
          description: `Return count discrepancy on Return Checklist: ${line.returnedQty} returned of ${outbound} outbound loaded.`,
          photoUrl: order.warehouseArrival.photoUrl,
          submittedByEmail: actor.email.toLowerCase(),
          submittedByName: actor.name,
          submittedAt: now,
          resolutionStatus: "Pending",
          inventoryAdjustedQty: adj.adjustedQty,
          transferredFromDispatchedQty: adj.transferredFromDispatchedQty,
          inventoryRecoveryApplied: false,
        })
        autoCreatedMissingReports += 1
      }
    }

    if (hadChecklistBefore && autoCreatedMissingReports === 0) {
      return { ok: true, autoCreatedMissingReports: 0, alreadySubmitted: true }
    }

    const submission = {
      submittedByEmail: actor.email.toLowerCase(),
      submittedByName: actor.name,
      submittedAt: now,
      notes:
        notes.trim() ||
        "Final post-event Return Checklist counted against outbound loaded quantities and submitted to Warehouse.",
    }
    order.returnChecklist = submission

    void v51ContractApis.submitReturnChecklist(eventId, submission)
    return { ok: true, autoCreatedMissingReports, alreadySubmitted: false }
  })
}

/**
 * D05 & Scenario 6 — Warehouse Operations Manager resolves a Missing Item Report or Damage Report:
 * - Records a documented resolution (`Recovered`, `Repair Scheduled`, `Approved Write-off`, etc.).
 * - Reconciles inventory when items are physically `Recovered` (reversing `missingCount` / `damagedCount`
 *   and reconciling the return line count), while keeping written-off/missing/invoiced items excluded
 *   from `availableStock` without double-deducting `totalStock`.
 * - Idempotent: repeated resolution attempts on an already-resolved report make zero duplicate adjustments.
 */
export function allocateIncidentToTrip(
  actor: OpsActor,
  reportId: string,
  payload: { batchId: string; quantity: number },
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return { ok: false, error: "Only the Warehouse Operations Manager can allocate incident quantities to trips." }
  }
  if (!Number.isInteger(payload.quantity) || payload.quantity < 1) {
    return { ok: false, error: "Allocated quantity must be a whole number of at least 1." }
  }
  return mutateOperationsStore((draft) => {
    const report = draft.incidentReports.find((r) => r.id === reportId)
    if (!report) return { ok: false, error: "Incident report not found." }
    const order = draft.orderRequests.find((o) => o.eventId === report.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return { ok: false, error: "Event accountability is already closed." }
    }

    const batch = (order.dispatchBatches ?? []).find(
      (b) => b.id === payload.batchId && !b.deletedAt && b.stage !== "Cancelled",
    )
    if (!batch) return { ok: false, error: `Dispatch trip ${payload.batchId} not found on this event.` }

    const tripItem = batch.items.find(
      (i) =>
        (report.lineId && (i.assetId === report.lineId || i.manifestLineId === report.lineId)) ||
        i.itemCode === report.itemCode ||
        i.name === report.itemName,
    )
    if (!tripItem) {
      return { ok: false, error: `Dispatch trip ${payload.batchId} does not carry ${report.itemName}.` }
    }

    const existing = report.tripAllocations ?? []
    if (report.batchId && existing.length === 0) {
      return { ok: false, error: `Incident is already linked to trip ${report.batchId}.` }
    }
    if (existing.some((a) => a.batchId === payload.batchId)) {
      return { ok: false, error: `Incident already has an allocation for trip ${payload.batchId}.` }
    }

    const alreadyAllocated = existing.reduce((sum, a) => sum + a.quantity, 0)
    if (alreadyAllocated + payload.quantity > report.quantity) {
      return {
        ok: false,
        error: `Allocation (${payload.quantity}) exceeds remaining unallocated incident quantity (${Math.max(0, report.quantity - alreadyAllocated)} of ${report.quantity}).`,
      }
    }

    const cap = getTripItemDamageSummary(draft.incidentReports, order, batch, tripItem)
    if (report.reportType === "Damage") {
      if (payload.quantity > cap.remainingDamageCapacity) {
        return {
          ok: false,
          error: `Allocation (${payload.quantity}) exceeds remaining damage capacity (${cap.remainingDamageCapacity} of ${cap.tripAccountableQty}) for "${report.itemName}" on trip ${payload.batchId}.`,
        }
      }
    } else if (payload.quantity > cap.tripAccountableQty) {
      return {
        ok: false,
        error: `Allocation (${payload.quantity}) exceeds the quantity (${cap.tripAccountableQty}) carried by trip ${payload.batchId}.`,
      }
    }

    const now = new Date().toISOString()
    report.tripAllocations = [
      ...existing,
      {
        batchId: payload.batchId,
        quantity: payload.quantity,
        allocatedAt: now,
        allocatedByEmail: actor.email.toLowerCase(),
        allocatedByName: actor.name,
      },
    ]

    if (report.reportType === "Damage") {
      const capAfter = getTripItemDamageSummary(draft.incidentReports, order, batch, tripItem)
      tripItem.returnDamagedQty = capAfter.existingDamageAllocated
    }

    return { ok: true }
  })
}

export function resolveFieldIncidentReport(
  actor: OpsActor,
  reportId: string,
  payload: {
    resolutionType: IssueResolutionType
    resolutionNotes: string
  },
): { ok: true; alreadyResolved?: boolean } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can resolve damage and missing item reports.",
    }
  }
  if (!payload.resolutionNotes.trim()) {
    return { ok: false, error: "Enter the documented resolution details for audit accountability." }
  }
  return mutateOperationsStore((draft) => {
    const report = draft.incidentReports.find((r) => r.id === reportId)
    if (!report) return { ok: false, error: "Incident report not found." }

    if (report.resolutionStatus === "Resolved") {
      return { ok: true, alreadyResolved: true }
    }

    const order = draft.orderRequests.find((o) => o.eventId === report.eventId)
    const inv = findInventoryForReport(
      draft,
      report.itemCode,
      report.itemName,
      order,
      report.lineId,
    )

    if (payload.resolutionType === "Recovered") {
      const hasTrackedAdjustment = typeof report.inventoryAdjustedQty === "number"

      if (!hasTrackedAdjustment) {
        // Untracked legacy incident: never reverse global missingCount/damagedCount without attribution
        const hasGlobalCount =
          inv &&
          ((report.reportType === "Missing" && inv.missingCount > 0) ||
            (report.reportType === "Damage" && inv.damagedCount > 0))
        if (hasGlobalCount) {
          report.legacyInventoryAttribution = "uncertain"
          report.needsWarehouseInventoryReconciliation = true
        }
        if (report.reportType === "Missing" && order && !order.warehouseClosed) {
          const line = order.stockLines.find(
            (s) =>
              (report.lineId && s.assetId === report.lineId) ||
              s.assetCode === report.itemCode ||
              s.name === report.itemName,
          )
          if (line) {
            const outbound = line.loadedQty > 0 ? line.loadedQty : line.releasedForLoadQty
            const room = Math.max(0, outbound - line.returnedQty)
            if (room > 0 && report.quantity > 0) {
              line.returnedQty = Math.min(
                outbound,
                line.returnedQty + Math.min(room, report.quantity),
              )
              line.returnCounted = true
              line.legacyReturnUncertain = false
            }
          }
        }
      } else {
        const trackedQty = report.inventoryAdjustedQty ?? 0
        const trackedTransferred = report.transferredFromDispatchedQty ?? 0

        if (!report.inventoryRecoveryApplied && (trackedQty > 0 || trackedTransferred > 0)) {
          reverseIncidentInventoryAdjustment(
            inv,
            order,
            report.reportType,
            trackedQty,
            trackedTransferred,
          )
        }
        report.inventoryRecoveryApplied = true
        report.inventoryAdjustedQty = 0
        report.transferredFromDispatchedQty = 0

        // Reconcile the manifest return count if resolved before closeout
        if (report.reportType === "Missing" && order && !order.warehouseClosed) {
          const line = order.stockLines.find(
            (s) =>
              (report.lineId && s.assetId === report.lineId) ||
              s.assetCode === report.itemCode ||
              s.name === report.itemName,
          )
          if (line) {
            const outbound = line.loadedQty > 0 ? line.loadedQty : line.releasedForLoadQty
            const room = Math.max(0, outbound - line.returnedQty)
            if (room > 0 && report.quantity > 0) {
              line.returnedQty = Math.min(
                outbound,
                line.returnedQty + Math.min(room, report.quantity),
              )
              line.returnCounted = true
              line.legacyReturnUncertain = false
            }
          }
        }
      }
    } else if (inv) {
      // Non-recovery resolutions (`Approved Write-off`, `Charged to Client`, `Repair Scheduled`, etc.)
      // preserve totalStock without double-deducting while keeping missingCount / damagedCount excluded.
      recalculateAvailableStock(inv)
    }

    report.resolutionStatus = "Resolved"
    report.resolutionType = payload.resolutionType
    report.resolutionNotes = payload.resolutionNotes.trim()
    report.resolvedByEmail = actor.email
    report.resolvedByName = actor.name
    report.resolvedAt = new Date().toISOString()

    void oldSystemApis.damage.signOffReport(reportId, {
      isApproved: true,
      comments: `[${payload.resolutionType}] ${payload.resolutionNotes.trim()}`,
    })
    void v51ContractApis.resolveIncidentReport(reportId, {
      resolutionType: payload.resolutionType,
      resolutionNotes: payload.resolutionNotes.trim(),
      resolvedByEmail: actor.email,
      resolvedByName: actor.name,
    })

    return { ok: true, alreadyResolved: false }
  })
}

function snapshotInventoryCounts(inv: WarehouseInventoryItem): LegacyInventorySnapshot {
  return {
    totalStock: inv.totalStock,
    availableStock: inv.availableStock,
    allocatedStock: inv.allocatedStock,
    dispatchedStock: inv.dispatchedStock,
    damagedCount: inv.damagedCount,
    missingCount: inv.missingCount,
  }
}

/**
 * Warehouse Operations Manager — Reconcile Legacy Incident Inventory:
 * Explicitly resolves `needsWarehouseInventoryReconciliation` for an untracked legacy incident.
 * - Requires Warehouse Operations Manager role and documented audit reason.
 * - Distinguishes "no-adjustment-required" (preserves counts belonging to other events) from
 *   "reverse-attributable-loss" (bounded whole-number adjustment on the exact matched asset).
 * - Leaves review pending if decision is "attribution-still-uncertain".
 * - Preserves original incident, resolution history, and closed-event metadata.
 * - Idempotent: repeated calls after completion return existing audit without modifying stock.
 */
export function reconcileLegacyIncidentInventory(
  actor: OpsActor,
  reportId: string,
  payload: {
    decision: LegacyInventoryReconciliationDecision
    attributableQty?: number
    reason: string
  },
):
  | {
      ok: true
      alreadyReconciled?: boolean
      audit?: LegacyInventoryReconciliationAudit
    }
  | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can complete legacy incident inventory reconciliation.",
    }
  }
  const cleanReason = payload.reason.trim()
  if (!cleanReason) {
    return {
      ok: false,
      error: "Enter a documented audit reason before completing inventory reconciliation.",
    }
  }

  return mutateOperationsStore((draft) => {
    const report = draft.incidentReports.find((r) => r.id === reportId)
    if (!report) {
      return { ok: false, error: "Incident report not found." }
    }

    if (report.legacyInventoryReconciliation && !report.needsWarehouseInventoryReconciliation) {
      return {
        ok: true,
        alreadyReconciled: true,
        audit: report.legacyInventoryReconciliation,
      }
    }

    if (
      !report.needsWarehouseInventoryReconciliation &&
      report.legacyInventoryAttribution !== "uncertain"
    ) {
      return {
        ok: false,
        error: "This incident report does not require legacy inventory reconciliation.",
      }
    }

    if (payload.decision === "attribution-still-uncertain") {
      return {
        ok: false,
        error:
          "Inventory attribution remains uncertain: confirm whether the loss belongs to this incident or another event before clearing the reconciliation flag.",
      }
    }

    const order = draft.orderRequests.find((o) => o.eventId === report.eventId)
    const inv = findInventoryForReport(
      draft,
      report.itemCode,
      report.itemName,
      order,
      report.lineId,
    )
    if (!inv) {
      return {
        ok: false,
        error: `Inventory asset for ${report.itemName} (${report.itemCode}) was not found.`,
      }
    }

    const beforeInventory = snapshotInventoryCounts(inv)
    let adjustedQty = 0
    let revTransferred = 0

    if (payload.decision === "no-adjustment-required") {
      if (payload.attributableQty !== undefined && payload.attributableQty !== 0) {
        return {
          ok: false,
          error: "A 'no-adjustment-required' review cannot apply a nonzero stock adjustment.",
        }
      }
    } else if (payload.decision === "reverse-attributable-loss") {
      const qty = payload.attributableQty
      const bucketCount =
        report.reportType === "Missing" ? inv.missingCount : inv.damagedCount
      if (
        qty === undefined ||
        !Number.isFinite(qty) ||
        !Number.isInteger(qty) ||
        qty < 1
      ) {
        return {
          ok: false,
          error: "Enter a whole-number attributable quantity of at least 1.",
        }
      }
      if (qty > report.quantity) {
        return {
          ok: false,
          error: `Attributable adjustment (${qty}) cannot exceed the incident quantity (${report.quantity}).`,
        }
      }
      if (qty > bucketCount) {
        return {
          ok: false,
          error: `Attributable adjustment (${qty}) exceeds current inventory ${report.reportType.toLowerCase()} count (${bucketCount}).`,
        }
      }

      if (order && !order.warehouseClosed && (report.transferredFromDispatchedQty ?? 0) > 0) {
        revTransferred = Math.min(report.transferredFromDispatchedQty ?? 0, qty)
      }
      reverseIncidentInventoryAdjustment(
        inv,
        order,
        report.reportType,
        qty,
        revTransferred,
      )
      adjustedQty = qty
    }

    const afterInventory = snapshotInventoryCounts(inv)
    const now = new Date().toISOString()
    const audit: LegacyInventoryReconciliationAudit = {
      reportId: report.id,
      eventId: report.eventId,
      assetId: inv.assetId,
      assetCode: inv.assetCode,
      assetName: inv.name,
      decision: payload.decision,
      adjustedQty,
      transferredFromDispatchedQty: revTransferred,
      reason: cleanReason,
      reviewedByEmail: actor.email,
      reviewedByName: actor.name,
      reviewedAt: now,
      beforeInventory,
      afterInventory,
    }

    report.legacyInventoryReconciliation = audit
    report.needsWarehouseInventoryReconciliation = false
    report.legacyInventoryAttribution = "verified"
    report.inventoryRecoveryApplied = true
    report.inventoryAdjustedQty = 0
    if (revTransferred > 0 && typeof report.transferredFromDispatchedQty === "number") {
      report.transferredFromDispatchedQty = Math.max(
        0,
        report.transferredFromDispatchedQty - revTransferred,
      )
    }

    return { ok: true, alreadyReconciled: false, audit }
  })
}

/**
 * D05 & Scenario 6 — Warehouse Operations Manager Event Closeout:
 * Closes warehouse accountability for the event ONLY after:
 * 1. The Team Lead's final Return Checklist has been submitted.
 * 2. All outbound manifest items have verified return counts.
 * 3. All Missing Item Reports and Damage Reports for the event have a documented resolution.
 * 4. All direct-to-venue rental return confirmations and discrepancies are resolved.
 * Idempotent: repeated calls return `{ ok: true, alreadyClosed: true }` preserving original closeout
 * metadata, inventory state, and external API side effects.
 */
export function closeWarehouseEventAccountability(
  actor: OpsActor,
  eventId: string,
  closeoutNotes: string,
): { ok: true; alreadyClosed?: boolean } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can close warehouse event accountability.",
    }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (order.warehouseClosed) {
      return { ok: true, alreadyClosed: true }
    }

    if (!order.returnChecklist) {
      return {
        ok: false,
        error: "CLOSEOUT BLOCKED (D05): Team Lead must submit the final Return Checklist before Warehouse can close the event.",
      }
    }

    const unverifiedReturnLines = order.stockLines.filter(
      (line) => line.loadedQty > 0 && (!line.returnCounted || line.legacyReturnUncertain),
    )
    if (unverifiedReturnLines.length > 0) {
      const names = unverifiedReturnLines
        .map(
          (l) =>
            `${l.name} (${l.legacyReturnUncertain ? "uncertain legacy count" : "not counted yet"})`,
        )
        .join(", ")
      return {
        ok: false,
        error: `CLOSEOUT BLOCKED (D05): Record verified return counts for all outbound manifest items before closing event accountability: ${names}.`,
      }
    }

    // Independently verify every current physical return shortage is accounted for by Missing Item Reports
    for (const line of order.stockLines) {
      if (line.loadedQty <= 0) continue
      const shortage = Math.max(0, line.loadedQty - line.returnedQty)
      if (shortage > 0) {
        const accountedMissingQty = draft.incidentReports
          .filter(
            (r) =>
              r.eventId === eventId &&
              r.reportType === "Missing" &&
              r.resolutionType !== "Recovered" &&
              (r.lineId === line.assetId ||
                r.itemCode === line.assetCode ||
                r.itemName === line.name),
          )
          .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
        if (shortage > accountedMissingQty) {
          return {
            ok: false,
            error: `CLOSEOUT BLOCKED (D05): Return shortage for ${line.name} (${shortage} missing, only ${accountedMissingQty} documented) requires an updated Return Checklist or Missing Item Report before closeout.`,
          }
        }
      }
    }

    const unresolvedIncidents = draft.incidentReports.filter(
      (r) => r.eventId === eventId && r.resolutionStatus !== "Resolved",
    )
    if (unresolvedIncidents.length > 0) {
      const summary = unresolvedIncidents
        .map((i) => `${i.reportType}: ${i.itemName} (×${i.quantity} at ${i.checkpoint})`)
        .join("; ")
      return {
        ok: false,
        error: `CLOSEOUT BLOCKED (D05): Resolve all outstanding missing items and damage reports before closing the event: ${summary}.`,
      }
    }

    const pendingInventoryReconciliations = draft.incidentReports.filter(
      (r) => r.eventId === eventId && r.needsWarehouseInventoryReconciliation === true,
    )
    if (pendingInventoryReconciliations.length > 0) {
      const summary = pendingInventoryReconciliations
        .map((i) => `${i.reportType}: ${i.itemName} (×${i.quantity})`)
        .join("; ")
      return {
        ok: false,
        error: `CLOSEOUT BLOCKED (D05): Complete Warehouse inventory reconciliation review for legacy incident(s) before closing the event: ${summary}.`,
      }
    }

    const unreturnedRentals = order.rentals.filter((r) => !r.supplierReturn)
    if (unreturnedRentals.length > 0) {
      const names = unreturnedRentals.map((r) => r.vendorName).join(", ")
      return {
        ok: false,
        error: `CLOSEOUT BLOCKED (D05): Team Lead must record rental return confirmation for: ${names}.`,
      }
    }

    const unresolvedRentalDiscrepancies = order.rentals.filter(
      (r) =>
        (r.venueReceipt?.hasDiscrepancy && r.venueReceipt.resolutionStatus !== "Resolved") ||
        (r.supplierReturn?.hasDiscrepancy && r.supplierReturn.resolutionStatus !== "Resolved"),
    )
    if (unresolvedRentalDiscrepancies.length > 0) {
      const names = unresolvedRentalDiscrepancies.map((r) => `${r.vendorName} (${r.itemName})`).join(", ")
      return {
        ok: false,
        error: `CLOSEOUT BLOCKED (D05): Document a resolution for all rental delivery/return discrepancies before closing the event: ${names}.`,
      }
    }

    const activeTrips = (order.dispatchBatches ?? []).filter(
      (b) => !b.deletedAt && b.stage !== "Cancelled",
    )
    const unresolvedTrips = activeTrips.filter((b) => b.stage !== "Returned")
    if (unresolvedTrips.length > 0) {
      const summary = unresolvedTrips.map((b) => `${b.id} (${b.stage})`).join(", ")
      return {
        ok: false,
        error: `CLOSEOUT BLOCKED (D05): All active dispatch trips must complete return accountability (Returned) or be cancelled before closing the event: ${summary}.`,
      }
    }

    if (activeTrips.length > 0) {
      const unallocatedDamage = draft.incidentReports.filter((r) => {
        if (r.eventId !== eventId || r.reportType !== "Damage") return false
        if (r.batchId) return false
        const allocated = (r.tripAllocations ?? []).reduce((s, a) => s + a.quantity, 0)
        return allocated < r.quantity
      })
      if (unallocatedDamage.length > 0) {
        const summary = unallocatedDamage.map((r) => `${r.itemName} (×${r.quantity})`).join(", ")
        return {
          ok: false,
          error: `CLOSEOUT BLOCKED (D05): Allocate all event-level damage reports to dispatch trip(s) before closing the event: ${summary}.`,
        }
      }
      for (const trip of activeTrips) {
        for (const tripItem of trip.items) {
          const cap = getTripItemDamageSummary(draft.incidentReports, order, trip, tripItem)
          if (cap.isExcessive) {
            return {
              ok: false,
              error: `CLOSEOUT BLOCKED (D05): Trip ${trip.id} has excessive damage allocations for ${tripItem.name} (${cap.existingDamageAllocated} allocated vs ${cap.tripAccountableQty} carried).`,
            }
          }
        }
      }
    }

    const now = new Date().toISOString()
    order.warehouseClosed = true
    order.closedByEmail = actor.email
    order.closedByName = actor.name
    order.closedAt = now
    order.closeoutNotes =
      closeoutNotes.trim() ||
      "All outbound manifest returns, field incidents, and rental returns reconciled and signed off."

    // Return remaining un-transferred outbound stock to available warehouse inventory
    for (const line of order.stockLines) {
      const inv = draft.inventory.find(
        (i) => i.assetId === line.assetId || i.assetCode === line.assetCode,
      )
      if (inv && line.loadedQty > 0 && (line.returnedQty > 0 || line.returnCounted)) {
        const alreadyTransferred = draft.incidentReports
          .filter(
            (r) =>
              r.eventId === eventId &&
              (r.lineId === line.assetId ||
                r.itemCode === line.assetCode ||
                r.itemName === line.name),
          )
          .reduce((sum, r) => sum + (r.transferredFromDispatchedQty ?? 0), 0)
        const dispatchedQty = getOrderLineDispatchedQty(order, line)
        const remainingToRelease = Math.max(0, dispatchedQty - alreadyTransferred)
        inv.dispatchedStock = Math.max(0, inv.dispatchedStock - remainingToRelease)
        recalculateAvailableStock(inv)
      }
    }

    void v51ContractApis.closeWarehouseEvent(eventId, {
      closedByEmail: actor.email,
      closedByName: actor.name,
      notes: order.closeoutNotes,
    })

    return { ok: true, alreadyClosed: false }
  })
}
