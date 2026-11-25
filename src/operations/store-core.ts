import { useEffect, useState } from "react"
import { accountName, getState, subscribe } from "../auth/store"
import {
  assets as catalogAssets,
  syncCatalogAssetsFromInventory,
} from "../features/event-manager/model"
import { validateAndComputeShiftSchedule } from "./staffing-calculator"
import { buildSeedVendors } from "./store-vendors"
import type {
  AfterShiftPhoto,
  CustomFabricationSpec,
  DispatchBatchRecord,
  EventRosterMember,
  FabricationJob,
  ManifestLineItem,
  MigrationReviewFlag,
  MigrationReviewFlagCode,
  OperationsStoreState,
  WarehouseInventoryItem,
  WarehouseOrderRequest,
} from "./types"

export const OPERATIONS_STORAGE_KEY = "lumiere.operations.store.v51"
export const OPERATIONS_EVENT = "lumiere:operations-store-updated"
export const OPERATIONS_PERSISTENCE_WARNING_EVENT =
  "lumiere:operations-persistence-warning"
export const OPERATIONS_PERSISTENCE_WARNING_TEXT =
  "Not saved—changes may be lost on refresh."
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

export function getPitchBoardId(projectId?: string | null): string | undefined {
  const trimmed = projectId?.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith("pitch:") || trimmed.startsWith("pitch-draft:")) {
    return trimmed
  }
  return `pitch:${trimmed}`
}

export function getDraftBoardId(draftEventId: string): string {
  return `pitch-draft:${draftEventId}`
}

/**
 * Resolves the canonical mood board comment identifier (`pitch:<projectId>`) for a WarehouseOrderRequest.
 * Never assumes a bare `eventId` is interchangeable with the canonical `boardId`.
 */
export function resolveOrderMoodBoardId(
  order?: { eventId?: string; projectId?: string; moodBoardId?: string } | null,
): string | undefined {
  if (!order) return undefined
  if (order.moodBoardId?.trim()) return getPitchBoardId(order.moodBoardId)
  if (order.projectId?.trim()) return getPitchBoardId(order.projectId)
  return getPitchBoardId(order.eventId)
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

export function zoneForInventoryCategory(category: string): string {
  const normalized = category.trim().toLowerCase()
  if (
    normalized === "furniture" ||
    normalized === "seating" ||
    normalized === "tables"
  ) {
    return ZONES[0]
  }
  if (
    normalized === "structure" ||
    normalized === "structures" ||
    normalized === "backdrop"
  ) {
    return ZONES[1]
  }
  if (
    normalized === "lighting" ||
    normalized === "rigging" ||
    normalized === "audio / visual"
  ) {
    return ZONES[2]
  }
  return ZONES[3]
}

function buildSeedInventory(): WarehouseInventoryItem[] {
  return catalogAssets.slice(0, 23).map((item, index) => {
    const isSeating = item.category === "Furniture"
    const totalStock = isSeating ? 160 : item.category === "Decor" ? 60 : 28
    const allocatedStock =
      item.id === "evtast-0001"
        ? 12
        : item.id === "evtast-0010"
          ? 24
          : item.id === "evtast-0018"
            ? 1
            : 0
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

function ensureFlag(
  flags: MigrationReviewFlag[],
  flag: Omit<MigrationReviewFlag, "id" | "createdAt"> & { id?: string },
  now: string,
): MigrationReviewFlag[] {
  const existing = flags.find(
    (f) => f.code === flag.code && f.targetId === flag.targetId && !f.resolvedAt,
  )
  if (existing) return flags
  const resolvedSame = flags.find(
    (f) => f.code === flag.code && f.targetId === flag.targetId && f.resolvedAt,
  )
  if (resolvedSame) return flags
  return [
    ...flags,
    {
      ...flag,
      id: flag.id ?? `mrf-${flag.code.toLowerCase()}-${flag.targetId}`,
      createdAt: now,
    },
  ]
}

export function hasUnresolvedMigrationFlag(
  flags: ReadonlyArray<MigrationReviewFlag> | undefined,
  code?: MigrationReviewFlagCode,
): boolean {
  if (!flags || flags.length === 0) return false
  return flags.some((f) => !f.resolvedAt && (!code || f.code === code))
}

/**
 * Try to parse a legacy schedule string ONLY if it explicitly contains an ISO local pair
 * like "2026-04-25T07:00 - 2026-04-25T16:00". Free-text strings like
 * "Apr 25, 2026 · 07:00 AM – 11:59 PM" or "08:00 - 18:00" are treated as uncertain
 * and preserved in `legacyScheduleText` for Warehouse review.
 */
function tryParseStrictLegacySchedule(raw: string): {
  startDateTime: string
  endDateTime: string
} | null {
  const m = raw
    .trim()
    .match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\s*(?:to|–|-)\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/i,
    )
  if (!m) return null
  const check = validateAndComputeShiftSchedule({
    startDateTime: m[1],
    endDateTime: m[2],
  })
  if (!check.ok) return null
  return { startDateTime: m[1], endDateTime: m[2] }
}

/**
 * Non-destructive, repeatable migration for browser-local operations state:
 * - Preserves existing job statuses (never downgrades ongoing `In Production` to `Unassigned`).
 * - Preserves progress, photos, approvals, manifest entries, and history.
 * - Flags missing/unparseable schedules, unconfirmed participants, demo-account assignments,
 *   auto-selected leads, and incomplete verification/approval evidence for Warehouse review.
 * - Labels imported daily photos as legacy evidence without fabricating a finished-work submission.
 */
export function migrateOperationsStore(
  rawState: OperationsStoreState,
): OperationsStoreState {
  const now = rawState.migratedAt || "2026-04-13T18:00:00.000Z"
  const state: OperationsStoreState = {
    ...rawState,
    version: Math.max(2, rawState.version || 1),
    migratedAt: now,
    vendors: Array.isArray(rawState.vendors)
      ? rawState.vendors.map((v) => ({
          ...v,
          status:
            v.status === "On Hold" || v.status === "Inactive"
              ? v.status
              : "Active",
        }))
      : buildSeedVendors(),
    inventory: Array.isArray(rawState.inventory) ? rawState.inventory : [],
    orderRequests: Array.isArray(rawState.orderRequests)
      ? rawState.orderRequests
      : [],
    fabricationJobs: Array.isArray(rawState.fabricationJobs)
      ? rawState.fabricationJobs
      : [],
    afterShiftPhotos: Array.isArray(rawState.afterShiftPhotos)
      ? rawState.afterShiftPhotos
      : [],
    incidentReports: Array.isArray(rawState.incidentReports)
      ? rawState.incidentReports
      : [],
    deficitQueue: Array.isArray(rawState.deficitQueue)
      ? rawState.deficitQueue
      : [],
    acquisitions: Array.isArray(rawState.acquisitions)
      ? rawState.acquisitions
      : [],
  }

  // Mark imported fabrication shift photos as legacy evidence if not already marked
  const legacyPhotoJobIds = new Set<string>(
    state.fabricationJobs
      .filter((j) => !j.submissions || j.submissions.length === 0)
      .map((j) => j.id),
  )

  state.afterShiftPhotos = state.afterShiftPhotos.map((photo) => {
    if (
      photo.isFabricationWork &&
      photo.fabricationJobId &&
      legacyPhotoJobIds.has(photo.fabricationJobId) &&
      photo.isLegacyImportedEvidence === undefined
    ) {
      return { ...photo, isLegacyImportedEvidence: true }
    }
    return photo
  })

  // Migrate Order Requests (roster, lead flags, free-text schedules)
  state.orderRequests = state.orderRequests.map((order) => {
    let flags = Array.isArray(order.migrationReviewFlags)
      ? [...order.migrationReviewFlags]
      : []
    const resolutionHistory = Array.isArray(order.migrationResolutionHistory)
      ? [...order.migrationResolutionHistory]
      : []
    const roster: EventRosterMember[] = Array.isArray(order.eventRoster)
      ? [...order.eventRoster]
      : []

    // Seed roster from existing crewAssignments + teamLeadEmail without duplicating
    const upsertRoster = (
      email: string,
      name: string,
      needsReview: boolean,
    ) => {
      const cleanEmail = email.trim().toLowerCase()
      if (!cleanEmail) return
      if (!roster.some((r) => r.crewEmail.toLowerCase() === cleanEmail)) {
        roster.push({
          crewEmail: cleanEmail,
          crewName: name.trim() || cleanEmail,
          addedAt: order.approvedAt || now,
          addedByEmail: order.approvedByEmail || "system-migration",
          needsWarehouseReview: needsReview,
        })
      }
    }

    for (const asg of order.crewAssignments ?? []) {
      const isDemo = asg.crewEmail.trim().toLowerCase() === "crew@demo.com"
      upsertRoster(asg.crewEmail, asg.crewName, isDemo)
      if (isDemo) {
        flags = ensureFlag(
          flags,
          {
            code: "DEMO_ACCOUNT_ASSIGNED",
            targetType: "assignment",
            targetId: asg.id,
            message: `Assignment ${asg.id} uses demo account crew@demo.com and requires Warehouse review.`,
            blockingActions: [],
          },
          now,
        )
      }
    }

    if (order.teamLeadEmail) {
      const isDemoLead =
        order.teamLeadEmail.trim().toLowerCase() === "crew@demo.com"
      upsertRoster(
        order.teamLeadEmail,
        order.teamLeadName || order.teamLeadEmail,
        isDemoLead,
      )
      const latestLeadEntry = order.teamLeadHistory?.[0]
      const wasAutoLead =
        !order.teamLeadExplicitlySelected &&
        (latestLeadEntry?.reason === "Initial Team Lead designation." ||
          latestLeadEntry?.isAutoDesignatedLegacy ||
          isDemoLead)

      if (wasAutoLead) {
        flags = ensureFlag(
          flags,
          {
            code: "AUTO_DESIGNATED_TEAM_LEAD",
            targetType: "lead",
            targetId: order.eventId,
            message: `Team Lead (${order.teamLeadEmail}) was automatically designated or uses a demo account; Warehouse must confirm or replace the Event Team Lead.`,
            blockingActions: [],
          },
          now,
        )
      }
    }

    const updatedCrewAssignments = (order.crewAssignments ?? []).map((asg) => {
      const rawSched = asg.legacyScheduleText ?? asg.schedule ?? ""
      const parsed = tryParseStrictLegacySchedule(rawSched)
      if (!parsed && rawSched.trim()) {
        flags = ensureFlag(
          flags,
          {
            code: "UNPARSEABLE_SCHEDULE_TEXT",
            targetType: "schedule",
            targetId: asg.id,
            message: `Schedule "${rawSched}" on assignment ${asg.id} (${asg.crewName}) is free-text and requires explicit Asia/Manila start and end dates/times.`,
            blockingActions: [],
          },
          now,
        )
        return {
          ...asg,
          legacyScheduleText: rawSched,
          needsWarehouseReview: hasUnresolvedMigrationFlag(
            flags,
            "UNPARSEABLE_SCHEDULE_TEXT",
          ),
        }
      }
      return asg
    })

    const hasReturnPhaseRecord = Boolean(
      order.warehouseClosed || order.returnChecklist || order.warehouseArrival,
    )
    const updatedStockLines = (order.stockLines ?? []).map((line) => {
      if (line.returnCounted === true) return line
      if (hasReturnPhaseRecord) {
        if (line.loadedQty > 0 && line.returnedQty === 0) {
          return {
            ...line,
            returnCounted: false,
            legacyReturnUncertain: true,
          }
        }
        if (line.returnedQty > 0) {
          return {
            ...line,
            returnCounted: true,
            legacyReturnUncertain: false,
          }
        }
      }
      return line
    })

    return {
      ...order,
      stockLines: updatedStockLines,
      eventRoster: roster,
      eventAssignments: Array.isArray(order.eventAssignments)
        ? order.eventAssignments
        : [],
      eventSchedules: Array.isArray(order.eventSchedules)
        ? order.eventSchedules
        : [],
      eventContributions: Array.isArray(order.eventContributions)
        ? order.eventContributions
        : [],
      returnChecklistHistory: Array.isArray(order.returnChecklistHistory)
        ? order.returnChecklistHistory
        : [],
      crewAssignments: updatedCrewAssignments,
      migrationReviewFlags: flags,
      migrationResolutionHistory: resolutionHistory,
      ...(order.projectId ? { projectId: order.projectId } : {}),
      ...(order.moodBoardId
        ? { moodBoardId: order.moodBoardId }
        : order.projectId
          ? { moodBoardId: `pitch:${order.projectId}` }
          : {}),
    }
  })

  // Migrate Fabrication Jobs non-destructively
  state.fabricationJobs = state.fabricationJobs.map((job) => {
    const order = state.orderRequests.find((o) => o.eventId === job.eventId)
    let flags = Array.isArray(job.migrationReviewFlags)
      ? [...job.migrationReviewFlags]
      : []
    const resolutionHistory = Array.isArray(job.migrationResolutionHistory)
      ? [...job.migrationResolutionHistory]
      : []
    const submissions = Array.isArray(job.submissions)
      ? [...job.submissions]
      : []
    const correctionRequests = Array.isArray(job.correctionRequests)
      ? [...job.correctionRequests]
      : []
    const schedules = Array.isArray(job.schedules) ? [...job.schedules] : []
    const assignments = Array.isArray(job.assignments)
      ? [...job.assignments]
      : []
    const contributions = Array.isArray(job.contributions)
      ? [...job.contributions]
      : []
    const groupProgressReports = Array.isArray(job.groupProgressReports)
      ? [...job.groupProgressReports]
      : []

    let status = job.status
    if (status === "Pending") {
      status = "Unassigned"
    } else if (status === "Needs Correction") {
      status = "In Production"
      if (correctionRequests.length === 0 && job.correctionNotes) {
        correctionRequests.push({
          id: `cor-mig-${job.id}`,
          jobId: job.id,
          eventId: job.eventId,
          round: 1,
          requestedByEmail: "warehouseops@demo.com",
          requestedByName: "Warehouse Operations Manager",
          requestedAt: job.updatedAt || now,
          explanation: job.correctionNotes,
          referencePhotoUrls: [],
          responsibleCrewEmails: [],
          createdAssignmentIds: [],
          scheduledAdditionalShiftIds: [],
        })
      }
      flags = ensureFlag(
        flags,
        {
          code: "MIGRATED_CORRECTION_NEEDS_ASSIGNMENT",
          targetType: "job",
          targetId: job.id,
          message:
            "Migrated correction request requires Warehouse to confirm responsible workers and schedules.",
          blockingActions: ["submit", "approve"],
        },
        now,
      )
    }

    // Do NOT downgrade ongoing In Production jobs to Unassigned; flag missing schedules/participants instead
    const hasConfirmedParticipants =
      Array.isArray(job.participantEmails) && job.participantEmails.length > 0
    const hasConfirmedSchedules =
      schedules.some((s) => s.status === "scheduled" && !s.needsWarehouseReview)

    const hasDemoEmail = (job.assignedCrewEmails ?? []).some(
      (e) => e.trim().toLowerCase() === "crew@demo.com",
    )
    if (hasDemoEmail && !hasConfirmedParticipants) {
      flags = ensureFlag(
        flags,
        {
          code: "DEMO_ACCOUNT_ASSIGNED",
          targetType: "job",
          targetId: job.id,
          message: `Job ${job.spec.name} references demo account crew@demo.com; Warehouse must confirm actual participants.`,
          blockingActions: ["submit", "approve"],
        },
        now,
      )
    }

    if (status === "In Production") {
      if (!hasConfirmedParticipants && (job.assignedCrewEmails ?? []).length > 0) {
        flags = ensureFlag(
          flags,
          {
            code: "UNCONFIRMED_PARTICIPANTS",
            targetType: "job",
            targetId: job.id,
            message:
              "Legacy crew emails do not establish confirmed assignments; Warehouse must confirm participants.",
            blockingActions: ["submit", "approve"],
          },
          now,
        )
      }
      if (!hasConfirmedSchedules) {
        flags = ensureFlag(
          flags,
          {
            code: "MISSING_CONFIRMED_SCHEDULE",
            targetType: "job",
            targetId: job.id,
            message:
              "Ongoing In Production job is missing structured Asia/Manila shift schedules; enter schedules or correct legacy status.",
            blockingActions: ["submit", "approve"],
          },
          now,
        )
      }
    }

    // For Awaiting Verification jobs with imported photos and no explicit VerificationSubmission:
    // Label imported photos as legacy evidence; never fabricate a submission, submitter, or timestamp.
    if (status === "Awaiting Verification" && submissions.length === 0) {
      flags = ensureFlag(
        flags,
        {
          code: "LEGACY_EVIDENCE_NO_EXPLICIT_SUBMISSION",
          targetType: "job",
          targetId: job.id,
          message:
            "Job is Awaiting Verification with imported legacy shift photos but no explicit finished-work submission.",
          blockingActions: ["approve"],
        },
        now,
      )
    }

    // For Ready to Load jobs missing reviewer/evidence or full quantity:
    if (status === "Ready to Load") {
      const missingEvidence =
        !job.verifiedByEmail ||
        !job.verifiedPhotoUrl ||
        job.completedQty < job.spec.requestedQty ||
        (!job.approval && submissions.length === 0)
      if (missingEvidence && !job.approval?.isHistoricalException) {
        flags = ensureFlag(
          flags,
          {
            code: "LEGACY_APPROVAL_MISSING_EVIDENCE",
            targetType: "job",
            targetId: job.id,
            message:
              "Legacy Ready to Load job is missing complete verification evidence or explicit submission record; Warehouse review is required before new loading sign-off.",
            blockingActions: ["loading-signoff"],
          },
          now,
        )
      }
    }

    const resolvedMode = job.assignmentMode ?? "group"
    const participantsForLeadRule =
      Array.isArray(job.participantEmails) && job.participantEmails.length > 0
        ? job.participantEmails
        : (job.assignedCrewEmails ?? [])
    const isSingleWorkerIndividual =
      resolvedMode === "individual" && participantsForLeadRule.length <= 1
    const allowInheritedLead = !isSingleWorkerIndividual

    const inheritedLeadEmail = allowInheritedLead
      ? (job.inheritedLeadEmail ?? order?.teamLeadEmail ?? undefined)
      : job.inheritedLeadEmail
    const inheritedLeadName = allowInheritedLead
      ? (job.inheritedLeadName ?? order?.teamLeadName ?? undefined)
      : job.inheritedLeadName

    return {
      ...job,
      status,
      assignmentMode: resolvedMode,
      inheritedLeadEmail,
      inheritedLeadName,
      productionLeadEmail: allowInheritedLead
        ? (job.productionLeadEmail ?? inheritedLeadEmail)
        : job.productionLeadEmail,
      productionLeadName: allowInheritedLead
        ? (job.productionLeadName ?? inheritedLeadName)
        : job.productionLeadName,
      estimateBasis:
        job.estimateBasis ?? job.spec.estimateBasis ?? "per-unit",
      estimatedHoursPerUnitOrSet:
        job.estimatedHoursPerUnitOrSet ?? job.spec.estimatedHoursPerUnitOrSet,
      participantEmails: job.participantEmails ?? [],
      assignments,
      schedules,
      contributions,
      groupProgressReports,
      submissions,
      correctionRequests,
      migrationReviewFlags: flags,
      migrationResolutionHistory: resolutionHistory,
      needsWarehouseReview: hasUnresolvedMigrationFlag(flags),
    }
  })

  // Migrate Incident Reports non-destructively (never fabricate missing inventoryAdjustedQty or guess provenance)
  state.incidentReports = (Array.isArray(state.incidentReports) ? state.incidentReports : []).map(
    (rep) => {
      const withProvenance = rep.reportSource
        ? rep
        : { ...rep, reportSource: "legacy-unknown" as const }
      if (
        withProvenance.legacyInventoryReconciliation &&
        !withProvenance.needsWarehouseInventoryReconciliation
      ) {
        return withProvenance
      }
      if (typeof withProvenance.inventoryAdjustedQty === "number") {
        return withProvenance
      }
      if (withProvenance.legacyInventoryAttribution) {
        return withProvenance
      }
      return {
        ...withProvenance,
        legacyInventoryAttribution: "uncertain" as const,
      }
    },
  )

  return state
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
    materials:
      "Brushed brass framing, honed travertine panels, weighted steel baseplate",
    colors: "Warm Champagne Gold (#C8A96A) & Ivory Travertine (#F3EFE6)",
    finish: "Satin matte lacquer with weather-sealed seams",
    buildInstructions:
      "Weld internal steel baseplate for wind stability at Glasshouse Lawn. Mount laser-cut C&M monogram at 1.65m eye level and conceal warm LED uplight channel in base.",
    referenceImages: ["/event-manager-images/arch-lattice.jpg"],
    estimatedHoursPerUnitOrSet: 8,
    estimateBasis: "per-unit",
  }

  const seedOrder: WarehouseOrderRequest = {
    id: "ORD-2026-0101",
    eventId: seedEventId,
    projectId: seedEventId,
    moodBoardId: `pitch:${seedEventId}`,
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
        itemName:
          "Low-profile aluminum box truss & warm architectural wash package (12m span)",
        contact: "ops@sinaglighting.ph · +63 917 555 0141",
        ApprovedRequestedQty: 4,
        directToVenue: true,
        notes:
          "Confirm low-profile chain hoist clearance with Fernbrook engineering before load-in.",
        bookingReference: "SNG-2026-8841",
        confirmationStatus: "Pending Confirmation",
        eLetter: {
          supplierName: "Sinag Stage Lighting",
          supplierContact: "ops@sinaglighting.ph · +63 917 555 0141",
          eventTitle: seedEventTitle,
          eventDates: "Apr 25, 2026, 4:00 PM – 11:00 PM",
          venue: "The Glasshouse at Fernbrook, Alabang",
          itemsSummary:
            "Low-profile aluminum box truss & warm architectural wash package (12m span)",
          quantity: 4,
          deliveryLocation:
            "Direct-to-Venue — Fernbrook Service Gate B, Alabang",
          deliveryArrangements:
            "Supplier delivers directly to venue by 09:00 AM on Apr 25, 2026; Ground Crew Team Lead verifies receipt at Venue Arrival.",
          returnArrangements:
            "Supplier strike pickup at venue at 11:45 PM after event; Team Lead verifies handback count and condition.",
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
        duties:
          "Lead dispatch loading verification, venue arrival inspection, direct-to-venue truss receipt check, and post-event return audit.",
        shiftLabel: "Shift 1 — Fabrication & Ingress Prep",
        taskStatus: "InProgress",
        startedAt: "2026-04-13T08:00:00.000Z",
        updatedAt: "2026-04-13T10:15:00.000Z",
      },
    ],
    teamLeadEmail: "crew@demo.com",
    teamLeadName: "Ground Crew",
    teamLeadExplicitlySelected: true,
    teamLeadHistory: [
      {
        id: "tlh-celeste-1",
        newLeadEmail: "crew@demo.com",
        newLeadName: "Ground Crew",
        changedByEmail: "warehouseops@demo.com",
        changedByName: "Warehouse Operations Manager",
        changedAt: "2026-04-13T08:00:00.000Z",
        reason:
          "Initial Team Lead designation for Celeste & Marcos Garden Reception.",
      },
    ],
    manifestPrepared: true,
    manifestPreparedAt: "2026-04-13T11:00:00.000Z",
    manifestPreparedBy: "Warehouse Operations Manager",
    warehouseClosed: false,
    isPreviewSeed: true,
    moodBoardNotes:
      "Outdoor-to-glasshouse transition reception; custom monogram plinth pair at ceremony arch entrance. Maintain warm champagne gold and ivory travertine styling across entry and dining zones.",
    moodBoardPins: [
      {
        id: "pin-celeste-1",
        title: "Garden romance",
        image: "/event-manager-images/garden.jpg",
        x: 5,
        y: 5,
        width: 300,
        rotation: -2,
      },
      {
        id: "pin-celeste-2",
        title: "Pink rose bouquet",
        image: "/event-manager-images/cutouts/evtast-0001.webp",
        x: 45,
        y: 12,
        width: 180,
        rotation: 1,
      },
    ],
  }

  const seedPhoto: AfterShiftPhoto = {
    id: "asp-celeste-1",
    eventId: seedEventId,
    eventTitle: seedEventTitle,
    shiftLabel: "Shift 1 — Fabrication Workshop",
    photoUrl: "/event-manager-images/arch-lattice.jpg",
    caption:
      "Completed brass & travertine monogram plinth pair assembly; LED channels tested and satin seal applied.",
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
    participantEmails: ["crew@demo.com"],
    assignmentMode: "group",
    inheritedLeadEmail: "crew@demo.com",
    inheritedLeadName: "Ground Crew",
    productionLeadEmail: "crew@demo.com",
    productionLeadName: "Ground Crew",
    progressPercent: 100,
    completedQty: 2,
    materialsVerified: true,
    linkedShiftPhotoIds: [seedPhoto.id],
    releasedForLoading: false,
    updatedAt: "2026-04-13T17:30:00.000Z",
    submissions: [
      {
        id: "sub-celeste-1",
        jobId: "fab-celeste-1",
        eventId: seedEventId,
        round: 1,
        submittedByEmail: "crew@demo.com",
        submittedByName: "Ground Crew",
        submittedAt: "2026-04-13T17:30:00.000Z",
        completedQty: 2,
        photoUrls: [seedPhoto.photoUrl],
        summary: seedPhoto.caption,
      },
    ],
  }

  return migrateOperationsStore({
    version: 2,
    vendors: buildSeedVendors(),
    inventory,
    orderRequests: [seedOrder],
    fabricationJobs: [seedFabJob],
    afterShiftPhotos: [seedPhoto],
    incidentReports: [],
    deficitQueue: [],
    acquisitions: [],
  })
}

let cachedStoreRaw: string | null = null
let cachedStoreState: OperationsStoreState | null = null
let pendingMemoryState: OperationsStoreState | null = null
let persistenceWarning: string | null = null

export function getOperationsPersistenceWarning(): string | null {
  return persistenceWarning
}

export function hasUnsavedOperationsChanges(): boolean {
  return pendingMemoryState !== null || persistenceWarning !== null
}

function setPersistenceWarningState(warning: string | null) {
  const changed = persistenceWarning !== warning
  persistenceWarning = warning
  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(OPERATIONS_PERSISTENCE_WARNING_EVENT, {
        detail: { warning },
      }),
    )
  }
}

export function retryPersistOperationsStore():
  | { ok: true }
  | { ok: false; error: string } {
  const stateToSave = pendingMemoryState ?? cachedStoreState
  if (!stateToSave) {
    setPersistenceWarningState(null)
    return { ok: true }
  }
  if (typeof window === "undefined") {
    pendingMemoryState = null
    setPersistenceWarningState(null)
    return { ok: true }
  }
  try {
    const serialized = JSON.stringify(stateToSave)
    window.localStorage.setItem(OPERATIONS_STORAGE_KEY, serialized)
    cachedStoreRaw = serialized
    cachedStoreState = stateToSave
    pendingMemoryState = null
    syncCatalogAssetsFromInventory(stateToSave.inventory)
    setPersistenceWarningState(null)
    window.dispatchEvent(new CustomEvent(OPERATIONS_EVENT))
    return { ok: true }
  } catch {
    setPersistenceWarningState(OPERATIONS_PERSISTENCE_WARNING_TEXT)
    return { ok: false, error: OPERATIONS_PERSISTENCE_WARNING_TEXT }
  }
}

export function useOperationsPersistenceWarning(): {
  warning: string | null
  retry: () => { ok: true } | { ok: false; error: string }
} {
  const [warning, setWarning] = useState<string | null>(() =>
    getOperationsPersistenceWarning(),
  )

  useEffect(() => {
    const sync = () => setWarning(getOperationsPersistenceWarning())
    window.addEventListener(OPERATIONS_PERSISTENCE_WARNING_EVENT, sync)
    window.addEventListener(OPERATIONS_EVENT, sync)
    return () => {
      window.removeEventListener(OPERATIONS_PERSISTENCE_WARNING_EVENT, sync)
      window.removeEventListener(OPERATIONS_EVENT, sync)
    }
  }, [])

  return {
    warning,
    retry: retryPersistOperationsStore,
  }
}

export function readOperationsStore(): OperationsStoreState {
  if (pendingMemoryState) {
    return pendingMemoryState
  }
  if (typeof window === "undefined") {
    const initial = buildInitialOperationsStore()
    syncCatalogAssetsFromInventory(initial.inventory)
    return initial
  }
  try {
    const raw = window.localStorage.getItem(OPERATIONS_STORAGE_KEY)
    if (raw && raw === cachedStoreRaw && cachedStoreState) {
      return cachedStoreState
    }
    if (!raw) {
      const seeded = buildInitialOperationsStore()
      const serialized = JSON.stringify(seeded)
      window.localStorage.setItem(OPERATIONS_STORAGE_KEY, serialized)
      cachedStoreRaw = serialized
      cachedStoreState = seeded
      syncCatalogAssetsFromInventory(seeded.inventory)
      return seeded
    }
    const parsed = JSON.parse(raw) as OperationsStoreState
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.orderRequests)
    ) {
      const seeded = buildInitialOperationsStore()
      const serialized = JSON.stringify(seeded)
      window.localStorage.setItem(OPERATIONS_STORAGE_KEY, serialized)
      cachedStoreRaw = serialized
      cachedStoreState = seeded
      syncCatalogAssetsFromInventory(seeded.inventory)
      return seeded
    }
    const migrated = migrateOperationsStore(parsed)
    const migratedRaw = JSON.stringify(migrated)
    if (migratedRaw !== raw) {
      try {
        window.localStorage.setItem(OPERATIONS_STORAGE_KEY, migratedRaw)
        cachedStoreRaw = migratedRaw
        cachedStoreState = migrated
        pendingMemoryState = null
        setPersistenceWarningState(null)
      } catch {
        // Preserve previous serialized value in localStorage, retain migrated state in memory,
        // and surface the persistent unsaved warning + Retry.
        cachedStoreRaw = raw
        cachedStoreState = migrated
        pendingMemoryState = migrated
        setPersistenceWarningState(OPERATIONS_PERSISTENCE_WARNING_TEXT)
      }
    } else {
      cachedStoreRaw = raw
      cachedStoreState = migrated
    }
    syncCatalogAssetsFromInventory(migrated.inventory)
    return migrated
  } catch {
    const fallback = buildInitialOperationsStore()
    cachedStoreRaw = null
    cachedStoreState = null
    syncCatalogAssetsFromInventory(fallback.inventory)
    return fallback
  }
}

export function writeOperationsStore(
  next: OperationsStoreState,
  options?: { rollbackOnStorageFailure?: boolean },
): OperationsStoreState {
  if (typeof window !== "undefined") {
    const serialized = JSON.stringify(next)
    try {
      window.localStorage.setItem(OPERATIONS_STORAGE_KEY, serialized)
      cachedStoreRaw = serialized
      cachedStoreState = next
      pendingMemoryState = null
      syncCatalogAssetsFromInventory(next.inventory)
      setPersistenceWarningState(null)
      window.dispatchEvent(new CustomEvent(OPERATIONS_EVENT))
      return next
    } catch (err) {
      if (options?.rollbackOnStorageFailure) {
        throw err
      }
      // Preserve previously saved localStorage records, keep pending changes in memory,
      // and surface the explicit persistence warning.
      cachedStoreState = next
      pendingMemoryState = next
      syncCatalogAssetsFromInventory(next.inventory)
      setPersistenceWarningState(OPERATIONS_PERSISTENCE_WARNING_TEXT)
      window.dispatchEvent(new CustomEvent(OPERATIONS_EVENT))
      return next
    }
  }
  syncCatalogAssetsFromInventory(next.inventory)
  return next
}

export function mutateOperationsStore<T>(
  mutator: (draft: OperationsStoreState) => T,
  options?: { rollbackOnStorageFailure?: boolean },
): T {
  const current = readOperationsStore()
  const clone =
    typeof structuredClone === "function"
      ? structuredClone(current)
      : (JSON.parse(JSON.stringify(current)) as OperationsStoreState)
  const result = mutator(clone)
  if (
    result &&
    typeof result === "object" &&
    "ok" in result &&
    (result as { ok: unknown }).ok === false
  ) {
    return result
  }
  writeOperationsStore(clone, options)
  if (
    persistenceWarning &&
    result &&
    typeof result === "object" &&
    "ok" in result
  ) {
    return {
      ...result,
      savedToStorage: false,
      persistenceWarning,
    } as T
  }
  if (result && typeof result === "object" && "ok" in result) {
    return {
      ...result,
      savedToStorage: true,
    } as T
  }
  return result
}

export function useOperationsStore(): OperationsStoreState {
  const [state, setState] = useState<OperationsStoreState>(() =>
    readOperationsStore(),
  )

  useEffect(() => {
    const sync = () => setState(readOperationsStore())
    const onStorage = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key === OPERATIONS_STORAGE_KEY ||
        e.key === "lumiere.demo.store"
      ) {
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
 */
export function getAvailableGroundCrewAccounts(): {
  id: string
  name: string
  email: string
  status: string
}[] {
  const authStore = getState()
  return authStore.accounts
    .filter(
      (u) =>
        u.role === "Ground Crew" && !u.deletedAt && u.status === "Active",
    )
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
 * - Custom fabrication items that have passed verification (`status === "Ready to Load"` and `releasedForLoading === true`),
 *   deduplicated by `customItemId` and keeping `plannedQty` synchronized with `job.spec.requestedQty`.
 * - Flags any custom item whose legacy `Ready to Load` status has an unresolved `LEGACY_APPROVAL_MISSING_EVIDENCE` review flag.
 */
export function getTripItemDamageSummary(
  incidentReports: OperationsStoreState["incidentReports"],
  order: WarehouseOrderRequest,
  batch: DispatchBatchRecord,
  tripItem: DispatchBatchRecord["items"][number],
) {
  const tripAccountableQty =
    batch.direction === "outbound"
      ? (tripItem.returnPlannedQty ?? (tripItem.actualQty > 0 ? tripItem.actualQty : tripItem.plannedQty))
      : tripItem.plannedQty
  const existingDamageAllocated = incidentReports
    .filter(
      (r) =>
        r.eventId === order.eventId &&
        r.reportType === "Damage" &&
        r.resolutionType !== "Recovered" &&
        ((tripItem.assetId && r.lineId === tripItem.assetId) ||
          r.lineId === tripItem.manifestLineId ||
          r.itemCode === tripItem.itemCode ||
          r.itemName === tripItem.name),
    )
    .reduce((sum, r) => {
      if (r.tripAllocations && r.tripAllocations.length > 0) {
        return (
          sum +
          r.tripAllocations
            .filter((a) => a.batchId === batch.id)
            .reduce((s, a) => s + a.quantity, 0)
        )
      }
      return r.batchId === batch.id ? sum + (Number(r.quantity) || 0) : sum
    }, 0)
  return {
    tripAccountableQty,
    existingDamageAllocated,
    remainingDamageCapacity: Math.max(0, tripAccountableQty - existingDamageAllocated),
    isExcessive: existingDamageAllocated > tripAccountableQty,
  }
}

export function getOrderLineDispatchedQty(
  order: WarehouseOrderRequest,
  line: WarehouseOrderRequest["stockLines"][number],
): number {
  if (order.outboundDeparture) {
    return Math.max(line.dispatchedQty ?? 0, line.loadedQty)
  }
  if (typeof line.dispatchedQty === "number") {
    return Math.min(line.loadedQty, line.dispatchedQty)
  }
  const batchDispatched = (order.dispatchBatches ?? [])
    .filter(
      (b) =>
        !b.deletedAt &&
        b.stage !== "Cancelled" &&
        b.direction === "outbound" &&
        (b.stage === "Outbound in transit" ||
          b.stage === "In Transit" ||
          b.stage === "Delivered" ||
          b.stage === "Return loading" ||
          b.stage === "Return in transit" ||
          b.stage === "Returned" ||
          Boolean(b.departedAt)),
    )
    .reduce(
      (sum, b) =>
        sum +
        b.items
          .filter((item) => (item.assetId ?? item.manifestLineId) === line.assetId)
          .reduce((s, item) => s + item.actualQty, 0),
      0,
    )
  return Math.min(line.loadedQty, batchDispatched)
}

export function getEventManifestLines(
  state: OperationsStoreState,
  eventId: string,
): ManifestLineItem[] {
  const order = state.orderRequests.find((o) => o.eventId === eventId)
  if (!order) return []

  const lines: ManifestLineItem[] = []

  for (const stock of order.stockLines) {
    if (stock.category === "Custom Fabrication") continue
    const planned =
      stock.releasedForLoadQty > 0
        ? stock.releasedForLoadQty
        : stock.allocatedQty
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
        returnCounted: Boolean(stock.returnCounted),
        legacyReturnUncertain: Boolean(stock.legacyReturnUncertain),
        shortfallQty: Math.max(0, planned - stock.loadedQty),
        loadingNotes: stock.notes,
      })
    }
  }

  // Deduplicate Ready to Load custom jobs by customItemId
  const readyJobsByCustomItem = new Map<string, FabricationJob>()
  for (const job of state.fabricationJobs) {
    if (
      job.eventId === eventId &&
      job.status === "Ready to Load" &&
      job.releasedForLoading
    ) {
      const prev = readyJobsByCustomItem.get(job.customItemId)
      if (!prev || job.updatedAt >= prev.updatedAt) {
        readyJobsByCustomItem.set(job.customItemId, job)
      }
    }
  }

  for (const job of readyJobsByCustomItem.values()) {
    const existingCustomLine = order.stockLines.find(
      (s) => s.assetId === job.customItemId,
    )
    const planned = job.spec.requestedQty
    const loaded = existingCustomLine
      ? Math.min(planned, existingCustomLine.loadedQty)
      : 0
    const returned = existingCustomLine
      ? Math.min(loaded, existingCustomLine.returnedQty)
      : 0

    const legacyApprovalFlag = (job.migrationReviewFlags ?? []).find(
      (f) =>
        !f.resolvedAt &&
        (f.code === "LEGACY_APPROVAL_MISSING_EVIDENCE" ||
          f.blockingActions.includes("loading-signoff")),
    )

    lines.push({
      lineId: `fab-${job.customItemId}`,
      sourceType: "custom",
      sourceId: job.customItemId,
      code: `FAB-${job.id.slice(-4).toUpperCase()}`,
      name: `${job.spec.name} (Custom Fabrication)`,
      category: "Custom Fabrication",
      unit: "unit",
      plannedQty: planned,
      loadedQty: loaded,
      returnedQty: returned,
      returnCounted: Boolean(existingCustomLine?.returnCounted),
      legacyReturnUncertain: Boolean(existingCustomLine?.legacyReturnUncertain),
      shortfallQty: Math.max(0, planned - loaded),
      loadingNotes: `Dimensions: ${job.spec.dimensions}`,
      ...(legacyApprovalFlag
        ? {
            blockedByLegacyReview: true,
            legacyReviewReason: legacyApprovalFlag.message,
          }
        : {}),
    })
  }

  return lines
}
