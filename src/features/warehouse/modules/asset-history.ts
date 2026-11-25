import { HAS_LIVE_BACKEND } from "../../../operations/apiConfig"
import { oldSystemApis } from "../../../operations/apiClients"
import type {
  FieldIncidentReport,
  OperationsStoreState,
  WarehouseInventoryItem,
  WarehouseOrderRequest,
} from "../../../operations/types"

export type AssetIncidentSummary = {
  id: string
  reportType: "Damage" | "Missing"
  quantity: number
  checkpoint: string
  description: string
  resolutionStatus: string
  resolutionType?: string
}

export type AssetUsageRecord = {
  eventId: string
  eventTitle: string
  date: string
  endDateTime?: string
  venue: string
  /** Dispatched qty (`loadedQty`) for confirmed usage, reserved qty for reservations, or null if confirmed usage has unknown loaded qty */
  quantity: number | null
  requestedQty: number
  allocatedQty: number
  loadedQty: number | null
  returnedQty: number | null
  unit: string
  /** Confirmed only when asset-line loading or return evidence exists; otherwise Reserved */
  usageKind: "confirmed" | "reserved"
  statusLabel: string
  statusTone: "success" | "warning" | "neutral"
  dispatchSummary?: string
  incidents: AssetIncidentSummary[]
}

function hasAssetLineEvidence(
  loadedQty: number,
  returnedQty: number,
): boolean {
  return loadedQty > 0 || returnedQty > 0
}

export function deriveAssetUsageHistoryFromStore(
  item: Pick<WarehouseInventoryItem, "assetId" | "assetCode" | "unit" | "name">,
  orderRequests: WarehouseOrderRequest[],
  incidentReports: FieldIncidentReport[] = [],
): AssetUsageRecord[] {
  const records: AssetUsageRecord[] = []
  const itemCodeUpper = (item.assetCode || "").toUpperCase()
  const itemNameLower = (item.name || "").trim().toLowerCase()

  for (const order of orderRequests) {
    const line = order.stockLines.find(
      (s) => s.assetId === item.assetId || s.assetCode === item.assetCode,
    )
    if (!line) continue

    const linkedIncidents: AssetIncidentSummary[] = incidentReports
      .filter((inc) => {
        if (inc.eventId !== order.eventId) return false
        const codeMatch =
          Boolean(itemCodeUpper) &&
          (inc.itemCode || "").toUpperCase() === itemCodeUpper
        const lineCodeMatch =
          Boolean(line.assetCode) &&
          (inc.itemCode || "").toUpperCase() === line.assetCode.toUpperCase()
        const nameMatch =
          Boolean(itemNameLower) &&
          (inc.itemName || "").trim().toLowerCase() === itemNameLower
        return codeMatch || lineCodeMatch || nameMatch
      })
      .map((inc) => ({
        id: inc.id,
        reportType: inc.reportType,
        quantity: inc.quantity,
        checkpoint: inc.checkpoint,
        description: inc.description,
        resolutionStatus: inc.resolutionStatus,
        resolutionType: inc.resolutionType,
      }))

    const hasEvidence = hasAssetLineEvidence(line.loadedQty, line.returnedQty)
    const unit = line.unit || item.unit
    const hasEventDispatchOrArrival = Boolean(
      order.outboundDeparture ||
        order.venueArrival ||
        order.warehouseArrival ||
        order.returnChecklist ||
        order.warehouseClosed,
    )

    if (hasEvidence) {
      const hasReturnCheckpoint = Boolean(
        !line.legacyReturnUncertain &&
          (line.returnCounted ||
            order.warehouseClosed ||
            order.returnChecklist ||
            line.returnedQty > 0),
      )
      const knownLoadedQty = line.loadedQty > 0 ? line.loadedQty : null
      const knownReturnedQty = hasReturnCheckpoint ? line.returnedQty : null

      let statusLabel = "Loaded for Dispatch"
      let statusTone: AssetUsageRecord["statusTone"] = "success"
      let dispatchSummary = `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded ${knownLoadedQty ?? "Unknown"} · Returned ${knownReturnedQty ?? "Not counted"} ${unit}`

      if (line.legacyReturnUncertain) {
        statusLabel = "Returned (Uncertain Legacy Count)"
        statusTone = "warning"
        dispatchSummary = `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded ${knownLoadedQty ?? "Unknown"} · Returned Uncertain (Legacy 0 unverified) ${unit}`
      } else if (knownLoadedQty === null && line.returnedQty > 0) {
        statusLabel = "Returned (Loaded Qty Unknown)"
        statusTone = "warning"
        dispatchSummary = `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded Unknown · Returned ${line.returnedQty} ${unit}`
      } else if (hasReturnCheckpoint) {
        statusLabel =
          line.returnedQty < line.loadedQty ? "Returned (With Shortfall)" : "Returned"
        statusTone = line.returnedQty < line.loadedQty ? "warning" : "success"
        dispatchSummary = `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded ${line.loadedQty} · Returned ${line.returnedQty} ${unit}`
      } else if (order.warehouseArrival) {
        statusLabel = "Arrived at Warehouse (Return Not Counted)"
        statusTone = "warning"
        dispatchSummary = `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded ${line.loadedQty} ${unit} returned to warehouse (not counted yet)`
      } else if (order.venueArrival) {
        statusLabel = "On-Site (Venue Arrival)"
        dispatchSummary = `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded ${line.loadedQty} ${unit} arrived at venue (return pending)`
      } else if (order.outboundDeparture) {
        statusLabel = "Dispatched (In Transit)"
        dispatchSummary = `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded ${line.loadedQty} ${unit} departed warehouse (return pending)`
      } else {
        statusLabel = "Loaded for Dispatch"
        dispatchSummary = `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded ${line.loadedQty} ${unit} verified on vehicle`
      }

      records.push({
        eventId: order.eventId,
        eventTitle: order.eventTitle,
        date: order.startDateTime,
        endDateTime: order.endDateTime,
        venue: order.venue,
        quantity: knownLoadedQty,
        requestedQty: line.approvedRequestedQty,
        allocatedQty: line.allocatedQty,
        loadedQty: knownLoadedQty,
        returnedQty: knownReturnedQty,
        unit,
        usageKind: "confirmed",
        statusLabel,
        statusTone,
        dispatchSummary,
        incidents: linkedIncidents,
      })
    } else {
      const reservedQty =
        line.allocatedQty > 0 ? line.allocatedQty : line.approvedRequestedQty
      if (reservedQty <= 0) continue

      const reservationStatus = hasEventDispatchOrArrival
        ? "Reserved · Not Loaded at Dispatch"
        : line.allocatedQty >= line.approvedRequestedQty && line.approvedRequestedQty > 0
          ? "Reserved · Allocated"
          : line.allocatedQty > 0
            ? "Reserved · Partial Allocation"
            : "Reserved · Pending Allocation"

      records.push({
        eventId: order.eventId,
        eventTitle: order.eventTitle,
        date: order.startDateTime,
        endDateTime: order.endDateTime,
        venue: order.venue,
        quantity: reservedQty,
        requestedQty: line.approvedRequestedQty,
        allocatedQty: line.allocatedQty,
        loadedQty: 0,
        returnedQty: 0,
        unit,
        usageKind: "reserved",
        statusLabel: reservationStatus,
        statusTone: hasEventDispatchOrArrival || line.allocatedQty === 0 ? "warning" : "neutral",
        dispatchSummary: hasEventDispatchOrArrival
          ? `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} · Loaded 0 ${unit} (allocated only; not loaded)`
          : `Requested ${line.approvedRequestedQty} · Allocated ${line.allocatedQty} ${unit} (awaiting dispatch)`,
        incidents: linkedIncidents,
      })
    }
  }

  return records.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
}

export async function loadAssetUsageHistory(
  item: WarehouseInventoryItem,
  state: OperationsStoreState,
): Promise<{ records: AssetUsageRecord[]; error?: string }> {
  const localRecords = deriveAssetUsageHistoryFromStore(
    item,
    state.orderRequests,
    state.incidentReports,
  )
  if (!HAS_LIVE_BACKEND) {
    return { records: localRecords }
  }

  try {
    const eventsRes = await oldSystemApis.events.getEvents()
    if (!eventsRes.ok) {
      return {
        records: localRecords,
        error: `Could not refresh live usage history (${eventsRes.reason}). Showing synchronized records.`,
      }
    }
    const remoteEvents = Array.isArray(eventsRes.data) ? eventsRes.data : []
    const byEventId = new Map<string, AssetUsageRecord>(
      localRecords.map((r) => [r.eventId, r]),
    )

    await Promise.all(
      remoteEvents.slice(0, 20).map(async (rawEvent) => {
        const evt = rawEvent as Record<string, unknown>
        const eventId = String(evt.id ?? evt.eventId ?? "")
        if (!eventId) return

        const [resvRes, dispRes] = await Promise.all([
          oldSystemApis.events.getEventReservations(eventId),
          oldSystemApis.dispatch.getPreparation(eventId),
        ])

        if (!resvRes.ok) return
        const reservations = Array.isArray(resvRes.data) ? resvRes.data : []
        const match = reservations.find((r) => {
          const rec = r as Record<string, unknown>
          return (
            String(rec.assetId ?? "") === item.assetId ||
            String(rec.assetCode ?? "") === item.assetCode
          )
        }) as Record<string, unknown> | undefined
        if (!match) return

        const dispData =
          dispRes.ok && dispRes.data && typeof dispRes.data === "object"
            ? (dispRes.data as Record<string, unknown>)
            : null
        const dispStatus = String(
          dispData?.status ?? match.dispatchStatus ?? "",
        ).toLowerCase()
        const rawLoaded = match.loadedQty ?? match.dispatchedQuantity
        const rawReturned = match.returnedQty
        const loadedNum =
          rawLoaded !== undefined && rawLoaded !== null ? Number(rawLoaded) : 0
        const returnedNum =
          rawReturned !== undefined && rawReturned !== null ? Number(rawReturned) : 0
        const hasEvidence = hasAssetLineEvidence(loadedNum, returnedNum)

        const allocatedQty = Number(
          match.allocatedQuantity ?? match.quantityRequested ?? 0,
        )
        const requestedQty = Number(match.quantityRequested ?? allocatedQty)
        const knownLoadedQty = hasEvidence ? (loadedNum > 0 ? loadedNum : null) : 0
        const knownReturnedQty = hasEvidence
          ? returnedNum > 0 || dispStatus.includes("return")
            ? returnedNum
            : null
          : 0
        const qty = hasEvidence ? knownLoadedQty : allocatedQty || requestedQty
        if (!hasEvidence && (qty ?? 0) <= 0) return

        const existing = byEventId.get(eventId)
        if (existing && existing.usageKind === "confirmed" && !hasEvidence) {
          return
        }

        byEventId.set(eventId, {
          eventId,
          eventTitle: String(evt.title ?? evt.name ?? existing?.eventTitle ?? "Event"),
          date: String(evt.startDateTime ?? evt.eventDate ?? existing?.date ?? ""),
          endDateTime: String(evt.endDateTime ?? existing?.endDateTime ?? ""),
          venue: String(evt.venue ?? existing?.venue ?? "—"),
          quantity: qty,
          requestedQty,
          allocatedQty,
          loadedQty: knownLoadedQty,
          returnedQty: knownReturnedQty,
          unit: item.unit,
          usageKind: hasEvidence ? "confirmed" : "reserved",
          statusLabel: hasEvidence
            ? dispStatus.includes("return") || returnedNum > 0
              ? knownLoadedQty === null
                ? "Returned (Loaded Qty Unknown)"
                : "Returned"
              : dispStatus.includes("dispatch") || dispStatus.includes("transit")
                ? "Dispatched"
                : "Loaded for Dispatch"
            : `Reserved · ${String(match.status ?? "Allocated")}`,
          statusTone: hasEvidence
            ? knownLoadedQty === null
              ? "warning"
              : "success"
            : "neutral",
          dispatchSummary: hasEvidence
            ? `Requested ${requestedQty} · Allocated ${allocatedQty} · Loaded ${knownLoadedQty ?? "Unknown"} · Returned ${knownReturnedQty ?? "Unknown"} ${item.unit}`
            : `Requested ${requestedQty} · Allocated ${allocatedQty} ${item.unit} (awaiting dispatch)`,
          incidents: existing?.incidents ?? [],
        })
      }),
    )

    return {
      records: Array.from(byEventId.values()).sort((a, b) =>
        (b.date || "").localeCompare(a.date || ""),
      ),
    }
  } catch (err) {
    return {
      records: localRecords,
      error:
        err instanceof Error
          ? err.message
          : "Could not load live usage history.",
    }
  }
}
