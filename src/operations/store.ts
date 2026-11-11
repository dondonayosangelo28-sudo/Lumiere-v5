import { useEffect, useState } from "react"
import { accountName, getState, subscribe } from "../auth/store"
import { assets as catalogAssets, type Brief, type Project } from "../features/event-manager/model"
import { rentalVendors } from "../features/event-manager/rental-catalog"
import { oldSystemApis, v51ContractApis } from "./apiClients"
import type {
  AcquisitionOrder,
  AfterShiftPhoto,
  CheckpointName,
  CrewTaskStatus,
  CustomFabricationSpec,
  DeficitQueueEntry,
  EventRentalRecord,
  FabricationJob,
  FieldIncidentReport,
  IssueResolutionType,
  ManifestLineItem,
  OperationsStoreState,
  RentalELetter,
  RentalSupplierAcceptance,
  StockAllocationLine,
  WarehouseInventoryItem,
  WarehouseOrderRequest,
} from "./types"

export const OPERATIONS_STORAGE_KEY = "lumiere.operations.store.v51"
const OPERATIONS_EVENT = "lumiere:operations-store-updated"
export const WAREHOUSE_SELECTED_EVENT_KEY = "lumiere.warehouse.selectedEventId"

export function setWarehouseSelectedEventId(eventId: string) {
  if (typeof window !== "undefined") {
    if (eventId) {
      window.sessionStorage.setItem(WAREHOUSE_SELECTED_EVENT_KEY, eventId)
    } else {
      window.sessionStorage.removeItem(WAREHOUSE_SELECTED_EVENT_KEY)
    }
  }
}

export function getWarehouseSelectedEventId(): string | null {
  if (typeof window === "undefined") return null
  return window.sessionStorage.getItem(WAREHOUSE_SELECTED_EVENT_KEY)
}

export type OpsActor = {
  email: string
  name: string
  role: string
}

const ZONES = [
  "Zone A — Seating & Tables",
  "Zone B — Structures & Backdrop",
  "Zone C — Lighting & Rigging",
  "Zone D — Tabletop & Decor",
]

function buildSeedInventory(): WarehouseInventoryItem[] {
  return catalogAssets.map((item, index) => {
    const isSeating = item.category === "Furniture"
    const totalStock = isSeating ? 160 : item.category === "Decor" ? 60 : 28
    const allocatedStock = item.id === "evtast-0001" ? 12 : item.id === "evtast-0010" ? 24 : item.id === "evtast-0018" ? 1 : 0
    return {
      assetId: item.id,
      assetCode: `AST-${String(index + 1).padStart(4, "0")}`,
      name: item.name,
      category: item.category,
      zone: ZONES[index % ZONES.length],
      unit: item.unit,
      image: item.image,
      totalStock,
      availableStock: totalStock - allocatedStock,
      allocatedStock,
      dispatchedStock: 0,
      damagedCount: 0,
      missingCount: 0,
      reorderThreshold: isSeating ? 30 : 8,
    }
  })
}

function buildInitialOperationsStore(): OperationsStoreState {
  const inventory = buildSeedInventory()
  const findCatalog = (id: string) => catalogAssets.find((a) => a.id === id)
  const chandelier = findCatalog("evtast-0001")
  const chair = findCatalog("evtast-0010")
  const arch = findCatalog("evtast-0018")

  const seedEventId = "evt-celeste-marcos"
  const seedEventTitle = "Celeste & Marcos Garden Reception"

  const customSpec1: CustomFabricationSpec = {
    id: "cust-celeste-monogram-arch",
    name: "Bespoke Brass & Travertine Monogram Plinth Pair",
    requestedQty: 2,
    dimensions: "2.4m H × 0.9m W × 0.6m D",
    materials: "Brushed brass framing, honed travertine panels, weighted steel baseplate",
    colors: "Warm Champagne Gold (#C8A96A) & Ivory Travertine (#F3EFE6)",
    finish: "Satin matte lacquer with weather-sealed seams",
    buildInstructions:
      "Weld internal steel baseplate for wind stability at Glasshouse Lawn. Mount laser-cut C&M monogram at 1.65m eye level and conceal warm LED uplight channel in base.",
    referenceImages: ["/event-manager-images/arch-lattice.jpg"],
  }

  const seedOrder: WarehouseOrderRequest = {
    id: "ORD-2026-0101",
    eventId: seedEventId,
    eventTitle: seedEventTitle,
    clientName: "Celeste Villanueva",
    clientEmail: "celeste.villanueva@velvetatelier.ph",
    venue: "The Glasshouse at Fernbrook, Alabang",
    startDateTime: "2026-04-25T16:00",
    endDateTime: "2026-04-25T23:00",
    theme: "Glasshouse Botanical",
    pax: 180,
    approvalNote:
      "Approved by Celeste Villanueva after live presentation; reserve arch, crystal chandeliers, and chairs.",
    approvedByName: "Event Manager",
    approvedByEmail: "eventmanager@demo.com",
    approvedAt: "2026-04-12T18:10:00.000Z",
    revisionAtApproval: 3,
    stockLines: [
      {
        assetId: "evtast-0001",
        assetCode: "AST-0001",
        name: chandelier?.name ?? "Empire Crystal Chandelier",
        category: chandelier?.category ?? "Lighting",
        image: chandelier?.image ?? "/event-assets/evtast-0001.png",
        unit: chandelier?.unit ?? "piece",
        approvedRequestedQty: 12,
        allocatedQty: 12,
        deficitQty: 0,
        releasedForLoadQty: 12,
        loadedQty: 12,
        loadingVerified: true,
        returnedQty: 12,
      },
      {
        assetId: "evtast-0010",
        assetCode: "AST-0010",
        name: chair?.name ?? "Gold Chiavari Dining Chair",
        category: chair?.category ?? "Furniture",
        image: chair?.image ?? "/event-assets/evtast-0010.png",
        unit: chair?.unit ?? "chair",
        approvedRequestedQty: 24,
        allocatedQty: 24,
        deficitQty: 0,
        releasedForLoadQty: 24,
        loadedQty: 24,
        loadingVerified: true,
        returnedQty: 24,
      },
      {
        assetId: "evtast-0018",
        assetCode: "AST-0018",
        name: arch?.name ?? "White Lattice Ceremony Arch",
        category: arch?.category ?? "Structure",
        image: arch?.image ?? "/event-assets/evtast-0018.png",
        unit: arch?.unit ?? "set",
        approvedRequestedQty: 1,
        allocatedQty: 1,
        deficitQty: 0,
        releasedForLoadQty: 1,
        loadedQty: 1,
        loadingVerified: true,
        returnedQty: 1,
      },
    ],
    customSpecs: [customSpec1],
      rentals: [
      {
        id: "rnt-celeste-1",
        eventId: seedEventId,
        vendorId: "sample-lighting",
        vendorName: "Sinag Stage Lighting",
        category: "Lighting supplier",
        itemName: "Low-profile aluminum box truss & warm architectural wash package (12m span)",
        contact: "ops@sinaglighting.ph · +63 917 555 0141",
        ApprovedRequestedQty: 4,
        directToVenue: true,
        notes: "Confirm low-profile chain hoist clearance with Fernbrook engineering before load-in.",
        bookingReference: "SNG-2026-8841",
        confirmationStatus: "Pending Confirmation",
        eLetter: {
          supplierName: "Sinag Stage Lighting",
          supplierContact: "ops@sinaglighting.ph · +63 917 555 0141",
          eventTitle: seedEventTitle,
          eventDates: "Apr 25, 2026, 4:00 PM – 11:00 PM",
          venue: "The Glasshouse at Fernbrook, Alabang",
          itemsSummary: "Low-profile aluminum box truss & warm architectural wash package (12m span)",
          quantity: 4,
          deliveryLocation: "Direct-to-Venue — Fernbrook Service Gate B, Alabang",
          deliveryArrangements: "Supplier delivers directly to venue by 09:00 AM on Apr 25, 2026; Ground Crew Team Lead verifies receipt at Venue Arrival.",
          returnArrangements: "Supplier strike pickup at venue at 11:45 PM after event; Team Lead verifies handback count and condition.",
          preparedByEmail: "warehouseops@demo.com",
          preparedByName: "Warehouse Operations Manager",
          preparedAt: "2026-04-13T09:30:00.000Z",
        },
      },
    ],
    crewAssignments: [
      {
        id: "asg-celeste-crew-1",
        eventId: seedEventId,
        crewEmail: "crew@demo.com",
        crewName: "Ground Crew",
        schedule: "Apr 25, 2026 · 07:00 AM – 11:59 PM",
        duties: "Lead dispatch loading verification, venue arrival inspection, direct-to-venue truss receipt check, and post-event return audit.",
        shiftLabel: "Shift 1 — Fabrication & Ingress Prep",
        taskStatus: "InProgress",
        startedAt: "2026-04-13T08:00:00.000Z",
        updatedAt: "2026-04-13T10:15:00.000Z",
      },
    ],
    teamLeadEmail: "crew@demo.com",
    teamLeadName: "Ground Crew",
    teamLeadHistory: [
      {
        id: "tlh-celeste-1",
        newLeadEmail: "crew@demo.com",
        newLeadName: "Ground Crew",
        changedByEmail: "warehouseops@demo.com",
        changedByName: "Warehouse Operations Manager",
        changedAt: "2026-04-13T08:00:00.000Z",
        reason: "Initial Team Lead designation for Celeste & Marcos Garden Reception.",
      },
    ],
    manifestPrepared: true,
    manifestPreparedAt: "2026-04-13T11:00:00.000Z",
    manifestPreparedBy: "Warehouse Operations Manager",
    warehouseClosed: false,
    isPreviewSeed: true,
  }

  const seedPhoto: AfterShiftPhoto = {
    id: "asp-celeste-1",
    eventId: seedEventId,
    eventTitle: seedEventTitle,
    shiftLabel: "Shift 1 — Fabrication Workshop",
    photoUrl: "/event-manager-images/arch-lattice.jpg",
    caption: "Completed brass & travertine monogram plinth pair assembly; LED channels tested and satin seal applied.",
    isFabricationWork: true,
    fabricationJobId: "fab-celeste-1",
    submittedByEmail: "crew@demo.com",
    submittedByName: "Ground Crew",
    submittedAt: "2026-04-13T17:30:00.000Z",
  }

  const seedFabJob: FabricationJob = {
    id: "fab-celeste-1",
    eventId: seedEventId,
    eventTitle: seedEventTitle,
    customItemId: customSpec1.id,
    spec: customSpec1,
    status: "Awaiting Verification",
    assignedCrewEmails: ["crew@demo.com"],
    progressPercent: 100,
    completedQty: 2,
    materialsVerified: true,
    linkedShiftPhotoIds: [seedPhoto.id],
    releasedForLoading: false,
    updatedAt: "2026-04-13T17:30:00.000Z",
  }

  return {
    version: 1,
    inventory,
    orderRequests: [seedOrder],
    fabricationJobs: [seedFabJob],
    afterShiftPhotos: [seedPhoto],
    incidentReports: [],
    deficitQueue: [],
    acquisitions: [],
  }
}

export function readOperationsStore(): OperationsStoreState {
  if (typeof window === "undefined") return buildInitialOperationsStore()
  try {
    const raw = window.localStorage.getItem(OPERATIONS_STORAGE_KEY)
    if (!raw) {
      const seeded = buildInitialOperationsStore()
      window.localStorage.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(seeded))
      return seeded
    }
    const parsed = JSON.parse(raw) as OperationsStoreState
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.orderRequests)) {
      const seeded = buildInitialOperationsStore()
      window.localStorage.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(seeded))
      return seeded
    }
    return parsed
  } catch {
    return buildInitialOperationsStore()
  }
}

export function writeOperationsStore(next: OperationsStoreState): OperationsStoreState {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(OPERATIONS_EVENT))
  }
  return next
}

function mutateOperationsStore<T>(
  mutator: (draft: OperationsStoreState) => T,
): T {
  const current = readOperationsStore()
  const clone = JSON.parse(JSON.stringify(current)) as OperationsStoreState
  const result = mutator(clone)
  writeOperationsStore(clone)
  return result
}

export function useOperationsStore(): OperationsStoreState {
  const [state, setState] = useState<OperationsStoreState>(() => readOperationsStore())

  useEffect(() => {
    const sync = () => setState(readOperationsStore())
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === OPERATIONS_STORAGE_KEY || e.key === "lumiere.demo.store") {
        sync()
      }
    }
    window.addEventListener(OPERATIONS_EVENT, sync)
    window.addEventListener("storage", onStorage)
    const unsubAuth = subscribe(sync)
    return () => {
      window.removeEventListener(OPERATIONS_EVENT, sync)
      window.removeEventListener("storage", onStorage)
      unsubAuth()
    }
  }, [])

  return state
}

/**
 * Returns all active Ground Crew accounts provisioned by System Admin in `src/auth/store.ts`.
 * Ensures newly created and activated Ground Crew accounts immediately appear in Personnel Deployment.
 */
export function getAvailableGroundCrewAccounts(): {
  id: string
  name: string
  email: string
  status: string
}[] {
  const authStore = getState()
  return authStore.accounts
    .filter((u) => u.role === "Ground Crew" && !u.deletedAt && u.status === "Active")
    .map((u) => ({
      id: String(u.id),
      name: accountName(u),
      email: u.email.toLowerCase(),
      status: u.status,
    }))
}

/**
 * Computes the authoritative Dispatch Manifest lines for an event:
 * - Stock items where `releasedForLoadQty > 0`
 * - Custom fabrication items that have passed verification (`status === "Ready to Load"` and `releasedForLoading === true`)
 */
export function getEventManifestLines(
  state: OperationsStoreState,
  eventId: string,
): ManifestLineItem[] {
  const order = state.orderRequests.find((o) => o.eventId === eventId)
  if (!order) return []

  const lines: ManifestLineItem[] = []

  for (const stock of order.stockLines) {
    if (stock.category === "Custom Fabrication") continue
    const planned = stock.releasedForLoadQty > 0 ? stock.releasedForLoadQty : stock.allocatedQty
    if (planned > 0) {
      lines.push({
        lineId: `stk-${stock.assetId}`,
        sourceType: "stock",
        sourceId: stock.assetId,
        code: stock.assetCode,
        name: stock.name,
        category: stock.category,
        unit: stock.unit,
        plannedQty: planned,
        loadedQty: stock.loadedQty,
        returnedQty: stock.returnedQty,
        shortfallQty: Math.max(0, planned - stock.loadedQty),
        loadingNotes: stock.notes,
      })
    }
  }

  const jobs = state.fabricationJobs.filter(
    (j) => j.eventId === eventId && j.status === "Ready to Load" && j.releasedForLoading,
  )
  for (const job of jobs) {
    const existingCustomLine = order.stockLines.find((s) => s.assetId === job.customItemId)
    const planned = job.spec.requestedQty
    const loaded = existingCustomLine ? existingCustomLine.loadedQty : planned
    const returned = existingCustomLine ? existingCustomLine.returnedQty : loaded
    lines.push({
      lineId: `fab-${job.id}`,
      sourceType: "custom",
      sourceId: job.customItemId,
      code: `FAB-${job.id.slice(-4).toUpperCase()}`,
      name: `${job.spec.name} (Custom Fabrication)`,
      category: "Custom Fabrication",
      unit: "unit",
      plannedQty: planned,
      loadedQty: loaded,
      returnedQty: returned,
      shortfallQty: Math.max(0, planned - loaded),
      loadingNotes: `Dimensions: ${job.spec.dimensions}`,
    })
  }

  return lines
}

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
      existingOrder.eventTitle = brief.title
      existingOrder.clientName = brief.client
      existingOrder.clientEmail = brief.clientEmail
      existingOrder.venue = brief.venue
      existingOrder.startDateTime = brief.start
      existingOrder.endDateTime = brief.end
      existingOrder.theme = brief.theme
      existingOrder.pax = brief.pax
      existingOrder.approvalNote = project.approvalNote || existingOrder.approvalNote
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
            status: "In Production",
            assignedCrewEmails: existingOrder.teamLeadEmail ? [existingOrder.teamLeadEmail] : ["crew@demo.com"],
            progressPercent: 25,
            completedQty: 0,
            materialsVerified: true,
            linkedShiftPhotoIds: [],
            releasedForLoading: false,
            updatedAt: new Date().toISOString(),
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
      eventTitle: brief.title,
      clientName: brief.client,
      clientEmail: brief.clientEmail,
      venue: brief.venue,
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
      crewAssignments: [],
      teamLeadHistory: [],
      manifestPrepared: false,
      warehouseClosed: false,
    }

    draft.orderRequests.unshift(newOrder)

    // Create linked production jobs for any custom items (D02)
    for (const spec of customSpecs) {
      draft.fabricationJobs.unshift({
        id: `fab-${project.id.slice(-5)}-${spec.id.slice(-4)}`,
        eventId: project.id,
        eventTitle: brief.title,
        customItemId: spec.id,
        spec,
        status: "In Production",
        assignedCrewEmails: ["crew@demo.com"],
        progressPercent: 15,
        completedQty: 0,
        materialsVerified: true,
        linkedShiftPhotoIds: [],
        releasedForLoading: false,
        updatedAt: new Date().toISOString(),
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

/**
 * Deficit Queue & Asset Acquisition:
 * Creates an acquisition order from a deficit entry or directly for inventory replenishment,
 * and when received, adds the acquired quantity to Warehouse Inventory and fulfills the shortage.
 */
export function createAcquisitionOrder(payload: {
  deficitId?: string
  eventId?: string
  assetId: string
  supplierName: string
  quantity: number
  unitCost: number
  actorName: string
  receiveImmediately?: boolean
}): { ok: true; order: AcquisitionOrder } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const inv = draft.inventory.find((i) => i.assetId === payload.assetId)
    if (!inv) return { ok: false, error: "Inventory asset not found." }
    if (payload.quantity < 1) return { ok: false, error: "Quantity must be at least 1." }

    const deficit = payload.deficitId
      ? draft.deficitQueue.find((d) => d.id === payload.deficitId)
      : undefined

    const now = new Date().toISOString()
    const acq: AcquisitionOrder = {
      id: `ACQ-${Date.now().toString().slice(-5)}`,
      deficitId: deficit?.id,
      eventId: deficit?.eventId ?? payload.eventId,
      eventTitle: deficit?.eventTitle,
      assetId: inv.assetId,
      assetCode: inv.assetCode,
      assetName: inv.name,
      supplierName: payload.supplierName.trim() || "Lumière Preferred Supply Partner",
      quantity: payload.quantity,
      unitCost: Math.max(0, payload.unitCost),
      status: payload.receiveImmediately ? "Received & Stocked" : "Ordered",
      orderedByName: payload.actorName,
      createdAt: now,
      receivedAt: payload.receiveImmediately ? now : undefined,
    }

    draft.acquisitions.unshift(acq)

    if (deficit) {
      deficit.status = payload.receiveImmediately ? "Fulfilled" : "In Acquisition"
      if (payload.receiveImmediately) deficit.resolvedAt = now
    }

    if (payload.receiveImmediately) {
      inv.totalStock += payload.quantity
      inv.availableStock += payload.quantity
    }

    return { ok: true, order: acq }
  })
}

export function receiveAcquisitionOrder(acquisitionId: string): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const acq = draft.acquisitions.find((a) => a.id === acquisitionId)
    if (!acq) return { ok: false, error: "Acquisition order not found." }
    if (acq.status === "Received & Stocked") return { ok: true }

    const now = new Date().toISOString()
    acq.status = "Received & Stocked"
    acq.receivedAt = now

    const inv = draft.inventory.find((i) => i.assetId === acq.assetId)
    if (inv) {
      inv.totalStock += acq.quantity
      inv.availableStock += acq.quantity
    }

    if (acq.deficitId) {
      const def = draft.deficitQueue.find((d) => d.id === acq.deficitId)
      if (def) {
        def.status = "Fulfilled"
        def.resolvedAt = now
      }
    }

    // If linked to an event with a shortage, automatically top up the allocation
    if (acq.eventId) {
      const order = draft.orderRequests.find((o) => o.eventId === acq.eventId)
      const line = order?.stockLines.find((s) => s.assetId === acq.assetId)
      if (line && line.deficitQty > 0 && inv) {
        const addAlloc = Math.min(line.deficitQty, inv.availableStock)
        line.allocatedQty += addAlloc
        line.releasedForLoadQty = line.allocatedQty
        line.deficitQty = Math.max(0, line.approvedRequestedQty - line.allocatedQty)
        inv.allocatedStock += addAlloc
        inv.availableStock = Math.max(0, inv.availableStock - addAlloc)
      }
    }

    return { ok: true }
  })
}

/**
 * Custom Fabrication (D02 & Scenario 2):
 * Creates or updates a production job for an event's custom item.
 */
export function createCustomFabricationJob(
  eventId: string,
  spec: Omit<CustomFabricationSpec, "id">,
  assignedCrewEmails: string[],
): { ok: true; job: FabricationJob } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (!spec.name.trim()) return { ok: false, error: "Custom item name is required." }

    const fullSpec: CustomFabricationSpec = {
      ...spec,
      id: `cust-${Date.now().toString().slice(-5)}`,
    }
    order.customSpecs.push(fullSpec)

    const job: FabricationJob = {
      id: `fab-${Date.now().toString().slice(-5)}`,
      eventId,
      eventTitle: order.eventTitle,
      customItemId: fullSpec.id,
      spec: fullSpec,
      status: "In Production",
      assignedCrewEmails: assignedCrewEmails.length > 0 ? assignedCrewEmails : ["crew@demo.com"],
      progressPercent: 10,
      completedQty: 0,
      materialsVerified: true,
      linkedShiftPhotoIds: [],
      releasedForLoading: false,
      updatedAt: new Date().toISOString(),
    }
    draft.fabricationJobs.unshift(job)
    return { ok: true, job }
  })
}

/**
 * Ground Crew After-Shift Work Photo (Scenario 2 & Scenario 7):
 * Stored separately from Venue/Warehouse Arrival photos and Damage Evidence photos.
 * Links to event and shift, and when `fabricationJobId` is provided, links to the production job
 * so Warehouse can verify progress and approve `Ready to Load`.
 */
export function submitAfterShiftWorkPhoto(
  actor: OpsActor,
  payload: {
    eventId: string
    shiftLabel: string
    photoUrl: string
    caption: string
    isFabricationWork: boolean
    fabricationJobId?: string
  },
): { ok: true; photo: AfterShiftPhoto } | { ok: false; error: string } {
  if (!payload.photoUrl.trim()) {
    return { ok: false, error: "A work photo is required for after-shift submission." }
  }
  if (!payload.shiftLabel.trim()) {
    return { ok: false, error: "Enter the shift label." }
  }
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event not found." }

    const now = new Date().toISOString()
    const photo: AfterShiftPhoto = {
      id: `asp-${Date.now().toString().slice(-6)}`,
      eventId: payload.eventId,
      eventTitle: order.eventTitle,
      shiftLabel: payload.shiftLabel.trim(),
      photoUrl: payload.photoUrl.trim(),
      caption: payload.caption.trim() || "Completed shift work documentation.",
      isFabricationWork: payload.isFabricationWork,
      fabricationJobId: payload.isFabricationWork ? payload.fabricationJobId : undefined,
      submittedByEmail: actor.email.toLowerCase(),
      submittedByName: actor.name,
      submittedAt: now,
    }

    draft.afterShiftPhotos.unshift(photo)

    if (payload.isFabricationWork && payload.fabricationJobId) {
      const job = draft.fabricationJobs.find((j) => j.id === payload.fabricationJobId)
      if (job) {
        if (!job.linkedShiftPhotoIds.includes(photo.id)) {
          job.linkedShiftPhotoIds.push(photo.id)
        }
        job.progressPercent = 100
        job.completedQty = job.spec.requestedQty
        if (job.status !== "Ready to Load") {
          job.status = "Awaiting Verification"
        }
        job.updatedAt = now
      }
    }

    void v51ContractApis.submitAfterShiftPhoto(photo)
    return { ok: true, photo }
  })
}

/**
 * Warehouse Operations Manager:
 * Verifies finished custom fabrication work against Event Manager's approved specifications
 * using the Ground Crew after-shift work photo (Scenario 2).
 * - Cannot mark `Ready to Load` without a linked Ground Crew after-shift work photo.
 * - If it passes, marks `Ready to Load` and releases it onto the event's dispatch manifest.
 * - If corrections are needed, marks `Needs Correction` and keeps it in production.
 */
export function verifyCustomFabricationJob(
  actor: OpsActor,
  jobId: string,
  decision: {
    passed: boolean
    photoId?: string
    notes: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const job = draft.fabricationJobs.find((j) => j.id === jobId)
    if (!job) return { ok: false, error: "Fabrication job not found." }

    const linkedPhotos = draft.afterShiftPhotos.filter((p) =>
      job.linkedShiftPhotoIds.includes(p.id),
    )

    if (decision.passed) {
      if (linkedPhotos.length === 0) {
        return {
          ok: false,
          error:
            "Cannot mark Ready to Load: Ground Crew must first submit an after-shift work photo of the finished fabrication item.",
        }
      }
      const chosenPhoto =
        (decision.photoId && linkedPhotos.find((p) => p.id === decision.photoId)) ||
        linkedPhotos[0]

      const now = new Date().toISOString()
      job.status = "Ready to Load"
      job.verifiedPhotoUrl = chosenPhoto.photoUrl
      job.verificationNotes =
        decision.notes.trim() ||
        "Verified against Event Manager dimensions, quantities, reference images, and build instructions."
      job.verifiedByEmail = actor.email
      job.verifiedByName = actor.name
      job.verifiedAt = now
      job.releasedForLoading = true
      job.updatedAt = now

      // Ensure custom item is tracked in the order's load/return counters
      const order = draft.orderRequests.find((o) => o.eventId === job.eventId)
      if (order) {
        const existingCustomStockLine = order.stockLines.find(
          (s) => s.assetId === job.customItemId,
        )
        if (!existingCustomStockLine) {
          order.stockLines.push({
            assetId: job.customItemId,
            assetCode: `FAB-${job.id.slice(-4).toUpperCase()}`,
            name: `${job.spec.name} (Custom Fabrication)`,
            category: "Custom Fabrication",
            image: job.spec.referenceImages[0] || chosenPhoto.photoUrl,
            unit: "unit",
            approvedRequestedQty: job.spec.requestedQty,
            allocatedQty: job.spec.requestedQty,
            deficitQty: 0,
            releasedForLoadQty: job.spec.requestedQty,
            loadedQty: 0,
            loadingVerified: false,
            returnedQty: 0,
            notes: `Verified Ready to Load via Ground Crew photo (${chosenPhoto.shiftLabel})`,
          })
          // If Loading Checklist was previously submitted, adding a new unreleased custom item requires re-verification
          order.loadingChecklist = undefined
        }
      }

      void oldSystemApis.production.approveTask(jobId, job.verificationNotes)
      void v51ContractApis.verifyCustomFabricationWithPhoto(jobId, {
        passed: true,
        photoUrl: chosenPhoto.photoUrl,
        notes: job.verificationNotes,
        verifiedByEmail: actor.email,
      })
    } else {
      if (!decision.notes.trim()) {
        return {
          ok: false,
          error: "Specify the required corrections so Ground Crew can rework the item.",
        }
      }
      job.status = "Needs Correction"
      job.correctionNotes = decision.notes.trim()
      job.releasedForLoading = false
      job.updatedAt = new Date().toISOString()
      void oldSystemApis.production.rejectTask(jobId, decision.notes.trim())
    }

    return { ok: true }
  })
}

/**
 * Warehouse Operations Manager — Personnel Deployment & Team Lead Designation (Scenario 1 & Scenario 8):
 * Assigns a Ground Crew account to an event and optionally designates them as Team Lead.
 */
export function assignCrewMemberToEvent(
  actor: OpsActor,
  payload: {
    eventId: string
    crewEmail: string
    crewName: string
    schedule: string
    duties: string
    shiftLabel: string
    makeTeamLead?: boolean
    teamLeadReason?: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const normalizedEmail = payload.crewEmail.trim().toLowerCase()
    const now = new Date().toISOString()
    const existing = order.crewAssignments.find(
      (a) => a.crewEmail.toLowerCase() === normalizedEmail,
    )

    if (existing) {
      existing.schedule = payload.schedule.trim() || existing.schedule
      existing.duties = payload.duties.trim() || existing.duties
      existing.shiftLabel = payload.shiftLabel.trim() || existing.shiftLabel
      existing.updatedAt = now
    } else {
      order.crewAssignments.push({
        id: `asg-${Date.now().toString().slice(-6)}`,
        eventId: payload.eventId,
        crewEmail: normalizedEmail,
        crewName: payload.crewName.trim(),
        schedule: payload.schedule.trim() || "Event Schedule — Full Shift",
        duties:
          payload.duties.trim() ||
          "Field logistics, dispatch loading checks, venue setup, and post-event return audit.",
        shiftLabel: payload.shiftLabel.trim() || "Shift 1 — Event Operations",
        taskStatus: "Assigned",
        updatedAt: now,
      })
    }

    if (payload.makeTeamLead || !order.teamLeadEmail) {
      const prevEmail = order.teamLeadEmail
      const prevName = order.teamLeadName
      if (prevEmail?.toLowerCase() !== normalizedEmail) {
        order.teamLeadEmail = normalizedEmail
        order.teamLeadName = payload.crewName.trim()
        order.teamLeadHistory.unshift({
          id: `tlh-${Date.now().toString().slice(-6)}`,
          previousLeadEmail: prevEmail,
          previousLeadName: prevName,
          newLeadEmail: normalizedEmail,
          newLeadName: payload.crewName.trim(),
          changedByEmail: actor.email,
          changedByName: actor.name,
          changedAt: now,
          reason:
            payload.teamLeadReason?.trim() ||
            (prevEmail
              ? "Team Lead designation reassigned by Warehouse Operations Manager."
              : "Initial Team Lead designation."),
        })
      }
    }

    return { ok: true }
  })
}

/**
 * Warehouse Operations Manager — Change or Replace Team Lead (Scenario 8):
 * Transfers Team Lead authority over remaining arrival confirmations, final checklists,
 * and rental receipt/return confirmations while preserving the original submitter on completed records.
 */
export function designateEventTeamLead(
  actor: OpsActor,
  payload: {
    eventId: string
    newLeadEmail: string
    newLeadName: string
    reason: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const normalizedEmail = payload.newLeadEmail.trim().toLowerCase()
    const isAssigned = order.crewAssignments.some(
      (a) => a.crewEmail.toLowerCase() === normalizedEmail,
    )
    if (!isAssigned) {
      return {
        ok: false,
        error: "The designated Team Lead must be an assigned Ground Crew member for this event.",
      }
    }

    if (order.teamLeadEmail?.toLowerCase() === normalizedEmail) {
      return { ok: true }
    }

    const now = new Date().toISOString()
    const prevEmail = order.teamLeadEmail
    const prevName = order.teamLeadName

    order.teamLeadEmail = normalizedEmail
    order.teamLeadName = payload.newLeadName.trim()
    order.teamLeadHistory.unshift({
      id: `tlh-${Date.now().toString().slice(-6)}`,
      previousLeadEmail: prevEmail,
      previousLeadName: prevName,
      newLeadEmail: normalizedEmail,
      newLeadName: payload.newLeadName.trim(),
      changedByEmail: actor.email,
      changedByName: actor.name,
      changedAt: now,
      reason:
        payload.reason.trim() ||
        "Team Lead replaced by Warehouse Operations Manager during event operations.",
    })

    void v51ContractApis.setEventTeamLead(payload.eventId, {
      newLeadEmail: normalizedEmail,
      newLeadName: payload.newLeadName.trim(),
      changedByEmail: actor.email,
      changedByName: actor.name,
      reason: payload.reason.trim(),
    })

    return { ok: true }
  })
}

/**
 * Ground Crew — Assigned Work Task Execution & Blocker Reporting:
 * Ground Crew can start tasks, report a blocker with reason, resume work, and mark tasks complete.
 */
export function updateCrewTaskExecutionStatus(
  actor: OpsActor,
  payload: {
    eventId: string
    assignmentId: string
    status: CrewTaskStatus
    blockerReason?: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event not found." }

    const assignment = order.crewAssignments.find((a) => a.id === payload.assignmentId)
    if (!assignment) return { ok: false, error: "Crew assignment not found." }

    if (payload.status === "Blocked" && !payload.blockerReason?.trim()) {
      return { ok: false, error: "Provide the blocker reason so Warehouse can resolve it." }
    }

    const now = new Date().toISOString()
    assignment.taskStatus = payload.status
    assignment.updatedAt = now
    if (payload.status === "InProgress" && !assignment.startedAt) {
      assignment.startedAt = now
    }
    if (payload.status === "Blocked") {
      assignment.blockerReason = payload.blockerReason?.trim()
    } else if (payload.status === "InProgress" || payload.status === "Completed") {
      assignment.blockerReason = undefined
    }
    if (payload.status === "Completed") {
      assignment.completedAt = now
    }

    void oldSystemApis.manning.updateAssignmentStatus(payload.assignmentId, {
      status: payload.status,
      blockerReason: payload.blockerReason,
    })

    return { ok: true }
  })
}

/**
 * D07 & Scenario 4 — Rental E-Letter & Booking Reference:
 * Recording a booking reference and preparing an e-letter keeps the rental status as
 * `Pending Confirmation` until explicit supplier acceptance is recorded.
 */
export function saveRentalELetterAndBookingRef(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    bookingReference: string
    deliveryLocation: string
    deliveryArrangements: string
    returnArrangements: string
    directToVenue: boolean
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    const eLetter: RentalELetter = {
      supplierName: rental.vendorName,
      supplierContact: rental.contact,
      eventTitle: order.eventTitle,
      eventDates: `${order.startDateTime} – ${order.endDateTime}`,
      venue: order.venue,
      itemsSummary: rental.itemName,
      quantity: rental.ApprovedRequestedQty,
      deliveryLocation: payload.deliveryLocation.trim() || order.venue,
      deliveryArrangements:
        payload.deliveryArrangements.trim() ||
        "Deliver directly to venue loading bay ahead of ingress schedule.",
      returnArrangements:
        payload.returnArrangements.trim() ||
        "Supplier pickup at venue post-event strike after Team Lead count.",
      preparedByEmail: actor.email,
      preparedByName: actor.name,
      preparedAt: new Date().toISOString(),
    }

    rental.bookingReference = payload.bookingReference.trim()
    rental.directToVenue = payload.directToVenue
    rental.eLetter = eLetter
    // Explicitly enforce D07/Scenario 4: booking reference alone does NOT confirm the rental
    if (!rental.supplierAcceptance) {
      rental.confirmationStatus = "Pending Confirmation"
    }

    void v51ContractApis.saveRentalELetter(payload.eventId, payload.rentalId, {
      bookingReference: rental.bookingReference,
      eLetter,
    })

    return { ok: true }
  })
}

/**
 * D07 & Scenario 4 — Record Explicit Supplier Acceptance:
 * Marks the rental `Confirmed` only after recording supplier acceptance (accepted e-letter,
 * written confirmation, or signed agreement) linked to the event's rental record.
 */
export function recordRentalSupplierAcceptance(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    evidenceType: RentalSupplierAcceptance["evidenceType"]
    referenceOrUrl: string
    notes: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    if (!rental.eLetter) {
      return {
        ok: false,
        error: "Prepare the Rental E-Letter before recording supplier acceptance.",
      }
    }
    if (!payload.referenceOrUrl.trim()) {
      return {
        ok: false,
        error: "Provide the accepted e-letter reference, signed agreement ID, or confirmation document link.",
      }
    }

    const acceptance: RentalSupplierAcceptance = {
      evidenceType: payload.evidenceType,
      referenceOrUrl: payload.referenceOrUrl.trim(),
      notes: payload.notes.trim() || "Supplier explicitly accepted rental e-letter terms and schedule.",
      recordedByEmail: actor.email,
      recordedByName: actor.name,
      recordedAt: new Date().toISOString(),
    }

    rental.supplierAcceptance = acceptance
    rental.confirmationStatus = "Confirmed"

    void v51ContractApis.confirmRentalAcceptance(payload.eventId, payload.rentalId, acceptance)
    return { ok: true }
  })
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

    const line = order.stockLines.find((s) => s.assetId === assetId)
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

    // Default returnedQty to loadedQty initially so post-event audit starts with outbound baseline
    for (const s of order.stockLines) {
      if (s.returnedQty === 0 && s.loadedQty > 0) {
        s.returnedQty = s.loadedQty
      }
    }

    void v51ContractApis.submitLoadingChecklist(eventId, submission)
    return { ok: true }
  })
}

/**
 * D03 & Scenario 3 — Warehouse Operations Manager confirms Outbound Departure:
 * Allowed only after every planned item is present in its full planned quantity AND
 * the Team Lead has submitted the final Loading Checklist.
 */
export function confirmOutboundDeparture(
  actor: OpsActor,
  eventId: string,
  payload: { vehiclePlate: string; driverName: string; notes: string },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (!order.loadingChecklist) {
      return {
        ok: false,
        error: "Cannot confirm outbound departure: Team Lead must submit the final Loading Checklist with zero shortfalls first.",
      }
    }

    const lines = getEventManifestLines(draft, eventId)
    const shortfalls = lines.filter((l) => l.loadedQty < l.plannedQty)
    if (shortfalls.length > 0) {
      return {
        ok: false,
        error: "Cannot confirm outbound departure: one or more manifest lines have a physical loading shortfall.",
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

    // Move allocated stock to dispatched stock in inventory
    for (const line of order.stockLines) {
      const inv = draft.inventory.find((i) => i.assetId === line.assetId)
      if (inv && line.loadedQty > 0) {
        inv.allocatedStock = Math.max(0, inv.allocatedStock - line.loadedQty)
        inv.dispatchedStock += line.loadedQty
      }
    }

    void oldSystemApis.dispatch.dispatchAssets(eventId, departure.notes)
    void v51ContractApis.confirmOutboundDeparture(eventId, departure)
    return { ok: true }
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

/**
 * D08 & Scenario 5, 7, 8 — Direct-to-Venue Rental Receipt Verification at Venue Arrival:
 * Only the currently designated Team Lead can verify the supplier's delivered items and quantities
 * at the venue and record any discrepancy against the rental record.
 */
export function recordDirectVenueRentalReceipt(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    deliveredQty: number
    discrepancyNotes: string
    photoUrl?: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (!order.teamLeadEmail || order.teamLeadEmail.toLowerCase() !== actor.email.toLowerCase()) {
      return {
        ok: false,
        error: `Only the currently designated Team Lead (${order.teamLeadName || "Unassigned"}) can record direct-to-venue rental receipt confirmations.`,
      }
    }

    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    const hasDiscrepancy =
      payload.deliveredQty !== rental.ApprovedRequestedQty ||
      Boolean(payload.discrepancyNotes.trim())

    rental.venueReceipt = {
      deliveredQty: Math.max(0, payload.deliveredQty),
      hasDiscrepancy,
      discrepancyNotes:
        payload.discrepancyNotes.trim() ||
        (hasDiscrepancy
          ? `Delivered ${payload.deliveredQty} of ${rental.ApprovedRequestedQty} requested units.`
          : "Full requested rental quantity delivered directly to venue in good condition."),
      photoUrl: payload.photoUrl?.trim(),
      verifiedByEmail: actor.email.toLowerCase(),
      verifiedByName: actor.name,
      verifiedAt: new Date().toISOString(),
      resolutionStatus: hasDiscrepancy ? "Pending" : "Resolved",
    }

    void v51ContractApis.recordRentalVenueReceipt(payload.eventId, payload.rentalId, rental.venueReceipt)
    return { ok: true }
  })
}

/**
 * D08 & Scenario 5, 6, 7, 8 — Direct-to-Venue Rental Supplier Return Verification:
 * After the event, the current Team Lead verifies the items handed back to the supplier
 * and records any missing or damaged items. Any discrepancy blocks event closeout until resolved.
 */
export function recordDirectVenueRentalReturn(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    handedBackQty: number
    missingQty: number
    damagedQty: number
    discrepancyNotes: string
    photoUrl?: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (!order.teamLeadEmail || order.teamLeadEmail.toLowerCase() !== actor.email.toLowerCase()) {
      return {
        ok: false,
        error: `Only the currently designated Team Lead (${order.teamLeadName || "Unassigned"}) can submit rental supplier return confirmations.`,
      }
    }

    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    const baselineQty = rental.venueReceipt?.deliveredQty ?? rental.ApprovedRequestedQty
    const hasDiscrepancy =
      payload.missingQty > 0 ||
      payload.damagedQty > 0 ||
      payload.handedBackQty < baselineQty ||
      Boolean(payload.discrepancyNotes.trim())

    if (hasDiscrepancy && !payload.discrepancyNotes.trim()) {
      return {
        ok: false,
        error: "Describe the missing or damaged rental items handed back to the supplier.",
      }
    }

    rental.supplierReturn = {
      handedBackQty: Math.max(0, payload.handedBackQty),
      missingQty: Math.max(0, payload.missingQty),
      damagedQty: Math.max(0, payload.damagedQty),
      hasDiscrepancy,
      discrepancyNotes:
        payload.discrepancyNotes.trim() ||
        "All supplier rental items handed back complete and undamaged.",
      photoUrl: payload.photoUrl?.trim(),
      verifiedByEmail: actor.email.toLowerCase(),
      verifiedByName: actor.name,
      verifiedAt: new Date().toISOString(),
      resolutionStatus: hasDiscrepancy ? "Pending" : "Not Applicable",
    }

    void v51ContractApis.recordRentalSupplierReturn(payload.eventId, payload.rentalId, rental.supplierReturn)
    return { ok: true }
  })
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
  if (payload.quantity < 1) {
    return { ok: false, error: "Affected quantity must be at least 1." }
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

    const report: FieldIncidentReport = {
      id: `INC-${Date.now().toString().slice(-6)}`,
      eventId: payload.eventId,
      eventTitle: order.eventTitle,
      reportType: payload.reportType,
      checkpoint: payload.checkpoint,
      itemCode: payload.itemCode.trim() || "AST-GEN",
      itemName: payload.itemName.trim(),
      quantity: payload.quantity,
      description: payload.description.trim(),
      photoUrl: payload.photoUrl.trim() || "/event-manager-images/planning.jpg",
      submittedByEmail: actor.email.toLowerCase(),
      submittedByName: actor.name,
      submittedAt: new Date().toISOString(),
      resolutionStatus: "Pending",
    }

    draft.incidentReports.unshift(report)

    const inv = draft.inventory.find(
      (i) => i.assetCode === report.itemCode || i.name === report.itemName,
    )
    if (inv) {
      if (payload.reportType === "Damage") inv.damagedCount += payload.quantity
      else inv.missingCount += payload.quantity
    }

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
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    const line = order.stockLines.find((s) => s.assetId === assetId)
    if (!line) return { ok: false, error: "Manifest line not found." }

    const outboundActual = line.loadedQty > 0 ? line.loadedQty : line.releasedForLoadQty
    const clamped = Math.max(0, Math.min(outboundActual, returnedQty))
    line.returnedQty = clamped

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
): { ok: true; autoCreatedMissingReports: number } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

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

    let autoCreatedMissingReports = 0
    for (const line of order.stockLines) {
      const outbound = line.loadedQty > 0 ? line.loadedQty : line.releasedForLoadQty
      const shortage = Math.max(0, outbound - line.returnedQty)
      if (shortage > 0) {
        const alreadyReported = draft.incidentReports.some(
          (r) =>
            r.eventId === eventId &&
            r.reportType === "Missing" &&
            (r.itemCode === line.assetCode || r.itemName === line.name),
        )
        if (!alreadyReported) {
          draft.incidentReports.unshift({
            id: `INC-MIS-${Date.now().toString().slice(-5)}-${autoCreatedMissingReports}`,
            eventId,
            eventTitle: order.eventTitle,
            reportType: "Missing",
            checkpoint: "Warehouse Arrival",
            itemCode: line.assetCode,
            itemName: line.name,
            quantity: shortage,
            description: `Return count discrepancy on Return Checklist: ${line.returnedQty} returned of ${outbound} outbound loaded.`,
            photoUrl: order.warehouseArrival.photoUrl,
            submittedByEmail: actor.email.toLowerCase(),
            submittedByName: actor.name,
            submittedAt: new Date().toISOString(),
            resolutionStatus: "Pending",
          })
          autoCreatedMissingReports += 1
        }
      }
    }

    const submission = {
      submittedByEmail: actor.email.toLowerCase(),
      submittedByName: actor.name,
      submittedAt: new Date().toISOString(),
      notes:
        notes.trim() ||
        "Final post-event Return Checklist counted against outbound loaded quantities and submitted to Warehouse.",
    }
    order.returnChecklist = submission

    void v51ContractApis.submitReturnChecklist(eventId, submission)
    return { ok: true, autoCreatedMissingReports }
  })
}

/**
 * D05 & Scenario 6 — Warehouse Operations Manager resolves a Missing Item Report or Damage Report:
 * Records a documented resolution (`Recovered`, `Repair Scheduled`, `Approved Write-off`, etc.).
 */
export function resolveFieldIncidentReport(
  actor: OpsActor,
  reportId: string,
  payload: {
    resolutionType: IssueResolutionType
    resolutionNotes: string
  },
): { ok: true } | { ok: false; error: string } {
  if (!payload.resolutionNotes.trim()) {
    return { ok: false, error: "Enter the documented resolution details for audit accountability." }
  }
  return mutateOperationsStore((draft) => {
    const report = draft.incidentReports.find((r) => r.id === reportId)
    if (!report) return { ok: false, error: "Incident report not found." }

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

    return { ok: true }
  })
}

/**
 * D05 & D08 & Scenario 5, 6 — Warehouse resolves a Direct-to-Venue Rental Receipt or Return Discrepancy:
 */
export function resolveRentalDiscrepancy(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    stage: "receipt" | "return"
    resolutionType: IssueResolutionType
    resolutionNotes: string
  },
): { ok: true } | { ok: false; error: string } {
  if (!payload.resolutionNotes.trim()) {
    return { ok: false, error: "Record the supplier discrepancy resolution details." }
  }
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    const now = new Date().toISOString()
    if (payload.stage === "receipt" && rental.venueReceipt) {
      rental.venueReceipt.resolutionStatus = "Resolved"
      rental.venueReceipt.resolutionType = payload.resolutionType
      rental.venueReceipt.resolutionNotes = payload.resolutionNotes.trim()
      rental.venueReceipt.resolvedByName = actor.name
      rental.venueReceipt.resolvedAt = now
    } else if (payload.stage === "return" && rental.supplierReturn) {
      rental.supplierReturn.resolutionStatus = "Resolved"
      rental.supplierReturn.resolutionType = payload.resolutionType
      rental.supplierReturn.resolutionNotes = payload.resolutionNotes.trim()
      rental.supplierReturn.resolvedByName = actor.name
      rental.supplierReturn.resolvedAt = now
    }

    return { ok: true }
  })
}

/**
 * D05 & Scenario 6 — Warehouse Operations Manager Event Closeout:
 * Closes warehouse accountability for the event ONLY after:
 * 1. The Team Lead's final Return Checklist has been submitted.
 * 2. All Missing Item Reports and Damage Reports for the event have a documented resolution.
 * 3. All direct-to-venue rental return confirmations and discrepancies are resolved.
 * Tracks Ground Crew task completion separately from Warehouse event closeout.
 */
export function closeWarehouseEventAccountability(
  actor: OpsActor,
  eventId: string,
  closeoutNotes: string,
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (!order.returnChecklist) {
      return {
        ok: false,
        error: "CLOSEOUT BLOCKED (D05): Team Lead must submit the final Return Checklist before Warehouse can close the event.",
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

    const now = new Date().toISOString()
    order.warehouseClosed = true
    order.closedByEmail = actor.email
    order.closedByName = actor.name
    order.closedAt = now
    order.closeoutNotes =
      closeoutNotes.trim() ||
      "All outbound manifest returns, field incidents, and rental returns reconciled and signed off."

    // Return stock to available warehouse inventory
    for (const line of order.stockLines) {
      const inv = draft.inventory.find((i) => i.assetId === line.assetId)
      if (inv && line.returnedQty > 0) {
        inv.dispatchedStock = Math.max(0, inv.dispatchedStock - line.loadedQty)
        inv.availableStock = Math.max(
          0,
          inv.totalStock - inv.allocatedStock - inv.dispatchedStock - inv.damagedCount - inv.missingCount,
        )
      }
    }

    void v51ContractApis.closeWarehouseEvent(eventId, {
      closedByEmail: actor.email,
      closedByName: actor.name,
      notes: order.closeoutNotes,
    })

    return { ok: true }
  })
}
