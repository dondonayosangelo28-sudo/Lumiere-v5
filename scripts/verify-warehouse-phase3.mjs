import assert from "node:assert/strict"
import { registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith(".")) {
        try {
          return next(`${specifier}.ts`, context)
        } catch {}
        try {
          return next(`${specifier}.tsx`, context)
        } catch {}
      }
      throw error
    }
  },
})

const memoryStore = new Map()
const localStorageMock = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
}
const sessionStorageMock = {
  getItem: (key) => memoryStore.get(`s:${key}`) ?? null,
  setItem: (key, val) => memoryStore.set(`s:${key}`, String(val)),
  removeItem: (key) => memoryStore.delete(`s:${key}`),
  clear: () => {},
}

class MockWindow extends EventTarget {
  constructor() {
    super()
    this.localStorage = localStorageMock
    this.sessionStorage = sessionStorageMock
  }
}

const mockWin = new MockWindow()
globalThis.window = mockWin
globalThis.localStorage = localStorageMock
globalThis.sessionStorage = sessionStorageMock
globalThis.CustomEvent = CustomEvent

const store = await import("../src/operations/store.ts")
const assetHistory = await import("../src/features/warehouse/modules/asset-history.ts")

const warehouseActor = {
  name: "Marcus Vance",
  email: "warehouse@demo.com",
  role: "Warehouse Operations Manager",
}

const crewActorA = {
  name: "Mateo Cruz",
  email: "mateo.cruz@lumiere.com",
  role: "Ground Crew",
}

const crewActorB = {
  name: "Elena Rostova",
  email: "elena.rostova@lumiere.com",
  role: "Ground Crew",
}

console.log(
  "Testing Warehouse Operations & Ground Crew Phase 3 (Events, Asset Inventory, Crew & Scheduling) Suite...",
)

// ----------------------------------------------------------------------------
// 1. Events Workspace: Mood Board & Notes, Guest Staffing, Approved Custom Assets
// ----------------------------------------------------------------------------
console.log("Phase 3.1: Events Mood Board & Notes viewer data, guest staffing, and custom assets...")
localStorageMock.clear()
let state = store.readOperationsStore()

const seedOrder = state.orderRequests.find((o) => o.eventId === "evt-celeste-marcos")
assert.ok(seedOrder, "Seeded Celeste & Marcos order must exist")
assert.ok(
  typeof seedOrder.moodBoardNotes === "string" && seedOrder.moodBoardNotes.length > 0,
  "Seeded order should carry read-only Mood Board notes",
)
assert.ok(
  Array.isArray(seedOrder.moodBoardPins) && seedOrder.moodBoardPins.length >= 2,
  "Seeded order should carry read-only Mood Board pins",
)

const guestStaffing = store.calculateGuestBasedEventStaffing(seedOrder.pax)
assert.equal(guestStaffing.minCrew, 8) // ceil(180/25)=8
assert.equal(guestStaffing.maxCrew, 12) // ceil(180/15)=12
assert.equal(guestStaffing.rangeLabel, "8–12")

// Verify publishApprovedEventToWarehouse carries moodBoardNotes & moodBoardPins
const publishedOrder = store.publishApprovedEventToWarehouse(
  {
    id: "evt-phase3-brief",
    approvalNote: "Approved all floral arches and crystal lighting.",
    brief: {
      title: "Solstice Garden Gala",
      client: "Aurelia Reyes",
      clientEmail: "aurelia@example.com",
      venue: "Botanical Conservatory",
      start: "2026-08-15T17:00",
      end: "2026-08-15T23:00",
      theme: "Botanical Brass & Glass",
      pax: 180,
      requirements: [
        {
          id: "req-stock-1",
          assetId: "evtast-0001",
          quantity: 120,
          note: "Main conservatory seating",
        },
      ],
      customItems: [
        {
          id: "req-custom-1",
          name: "Botanical Brass Pergola",
          quantity: 2,
          dimensions: "4m x 4m x 3.2m",
          materials: "Brass Tube, Steel Baseplate",
          colors: "Antique Gold",
          finish: "Brushed Antique Brass",
          instructions: "Two complete pergola sets required.",
          referenceImages: ["/event-manager-images/planning.jpg"],
        },
      ],
      rentals: [],
      notes: "Conservatory Rigging Rule: Use freestanding Weighted Bases only; no ceiling points.",
      pins: [
        {
          id: "pin-p3-1",
          title: "Antique Brass Reference",
          image: "/event-manager-images/planning.jpg",
          x: 32,
          y: 14,
          width: 240,
        },
      ],
    },
  },
  warehouseActor,
)
assert.ok(publishedOrder)
assert.equal(
  publishedOrder.moodBoardNotes,
  "Conservatory Rigging Rule: Use freestanding Weighted Bases only; no ceiling points.",
)
assert.equal(publishedOrder.moodBoardPins?.length, 1)
assert.equal(publishedOrder.moodBoardPins?.[0].title, "Antique Brass Reference")
assert.equal(publishedOrder.customSpecs.length, 1)
assert.equal(publishedOrder.customSpecs[0].requestedQty, 2)

// ----------------------------------------------------------------------------
// 2. Asset Inventory: Production Template Estimates & Factual Event Usage History
// ----------------------------------------------------------------------------
console.log(
  "Phase 3.2: Asset Inventory optional production-template estimates & factual Event Usage History...",
)
const existingJobsBeforeTemplateUpdate = store
  .readOperationsStore()
  .fabricationJobs.map((j) => ({
    id: j.id,
    estimatedHoursPerUnitOrSet: j.estimatedHoursPerUnitOrSet,
    estimateBasis: j.estimateBasis,
  }))

const createInvRes = store.createWarehouseInventoryItem({
  name: "Modular Mirror Plinth Set",
  category: "Architectural / Custom",
  stock: 8,
  availableStock: 6,
  image: "/event-manager-images/planning.jpg",
  estimatedHoursPerUnitOrSet: 6.5,
  estimateBasis: "complete-set",
  defaultSharedShiftMinCrew: 2,
})
assert.equal(createInvRes.ok, true)
assert.equal(createInvRes.item.estimatedHoursPerUnitOrSet, 6.5)
assert.equal(createInvRes.item.estimateBasis, "complete-set")
assert.equal(createInvRes.item.defaultSharedShiftMinCrew, 2)

const updateInvRes = store.updateWarehouseInventoryItem(createInvRes.item.assetId, {
  name: "Modular Mirror Plinth Set",
  category: "Architectural / Custom",
  stock: 8,
  availableStock: 6,
  image: "/event-manager-images/planning.jpg",
  estimatedHoursPerUnitOrSet: 7.5,
  estimateBasis: "complete-set",
  defaultSharedShiftMinCrew: 3,
})
assert.equal(updateInvRes.ok, true)
assert.equal(updateInvRes.item.estimatedHoursPerUnitOrSet, 7.5)
assert.equal(updateInvRes.item.defaultSharedShiftMinCrew, 3)

// Confirm existing fabrication jobs were not silently mutated by template update
const existingJobsAfterTemplateUpdate = store
  .readOperationsStore()
  .fabricationJobs.map((j) => ({
    id: j.id,
    estimatedHoursPerUnitOrSet: j.estimatedHoursPerUnitOrSet,
    estimateBasis: j.estimateBasis,
  }))
assert.deepEqual(existingJobsAfterTemplateUpdate, existingJobsBeforeTemplateUpdate)

// Factual Event Usage History derivation: Reservation vs Confirmed Usage + Incidents
state = store.readOperationsStore()
const firstSeededLine = seedOrder.stockLines[0]
const firstSeededInvItem = state.inventory.find(
  (i) => i.assetId === firstSeededLine.assetId || i.assetCode === firstSeededLine.assetCode,
) ?? {
  assetId: firstSeededLine.assetId,
  assetCode: firstSeededLine.assetCode,
  unit: firstSeededLine.unit,
  name: firstSeededLine.name,
}
const assetHistoryRows = assetHistory.deriveAssetUsageHistoryFromStore(
  firstSeededInvItem,
  state.orderRequests,
  state.incidentReports,
)
assert.ok(assetHistoryRows.length >= 1, "Seeded asset should appear in Event Usage History")
const celesteRow = assetHistoryRows.find((r) => r.eventId === "evt-celeste-marcos")
assert.ok(celesteRow)
assert.equal(celesteRow.requestedQty, firstSeededLine.approvedRequestedQty)
assert.equal(celesteRow.allocatedQty, firstSeededLine.allocatedQty)
assert.equal(celesteRow.loadedQty, firstSeededLine.loadedQty)
assert.equal(celesteRow.returnedQty, firstSeededLine.returnedQty)

// Check incident linkage on the asset referenced by state.incidentReports[0]
if (state.incidentReports.length > 0) {
  const inc = state.incidentReports[0]
  const incItem = state.inventory.find((i) => i.assetCode === inc.itemCode) ?? {
    assetId: inc.itemCode,
    assetCode: inc.itemCode,
    unit: "pcs",
    name: inc.itemName,
  }
  const incHistory = assetHistory.deriveAssetUsageHistoryFromStore(
    incItem,
    state.orderRequests,
    state.incidentReports,
  )
  const incEventRow = incHistory.find((r) => r.eventId === inc.eventId)
  if (incEventRow) {
    assert.ok(
      incEventRow.incidents.length >= 1,
      "Linked field incident report must be attached to the Event Usage History row",
    )
  }
}

// ----------------------------------------------------------------------------
// 3. Crew & Scheduling: Roster vs Shift Separation, Explicit Team Lead & Impact Previews
// ----------------------------------------------------------------------------
console.log(
  "Phase 3.3: Event Crew Roster, Explicit Team Lead selection, and Impact Previews...",
)

// Add Mateo and Elena to the new event's roster
const addMateoRes = store.addCrewToEventRoster(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewName: crewActorA.name,
  crewEmail: crewActorA.email,
})
assert.equal(addMateoRes.ok, true)

const addElenaRes = store.addCrewToEventRoster(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewName: crewActorB.name,
  crewEmail: crewActorB.email,
})
assert.equal(addElenaRes.ok, true)

// Verify adding to roster does NOT auto-select Team Lead and does NOT create scheduled shifts
state = store.readOperationsStore()
const briefOrderAfterRoster = state.orderRequests.find((o) => o.eventId === "evt-phase3-brief")
assert.equal(briefOrderAfterRoster.eventRoster.length, 2)
assert.equal(briefOrderAfterRoster.teamLeadEmail, undefined)
assert.equal((briefOrderAfterRoster.eventSchedules ?? []).length, 0)

// Explicitly designate Mateo as Event Team Lead
const leadRes = store.designateEventTeamLead(warehouseActor, {
  eventId: "evt-phase3-brief",
  newLeadEmail: crewActorA.email,
  newLeadName: crewActorA.name,
  reason: "Selected Mateo as explicit Event Team Lead.",
})
assert.equal(leadRes.ok, true)
state = store.readOperationsStore()
assert.equal(
  state.orderRequests.find((o) => o.eventId === "evt-phase3-brief")?.teamLeadEmail,
  crewActorA.email,
)

// Schedule a shift for Elena on evt-phase3-brief
const shift1Res = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewEmail: crewActorB.email,
  crewName: crewActorB.name,
  role: "crew",
  activityType: "setup",
  startDateTime: "2026-08-10T08:00",
  endDateTime: "2026-08-10T17:00",
  breakMinutes: 60,
  instructions: "Prepare conservatory floor anchors",
})
assert.equal(shift1Res.ok, true)

// Impact preview should require resolution before removing Elena while his shift is active
state = store.readOperationsStore()
const removeImpact = store.previewRosterOrLeadChangeImpact(state, {
  eventId: "evt-phase3-brief",
  targetCrewEmail: crewActorB.email,
  action: "remove-roster",
  referenceNowMs: Date.parse("2026-08-01T00:00:00+08:00"),
})
assert.equal(removeImpact.requiresResolution, true)
assert.equal(removeImpact.futureSchedules.length, 1)

const blockedRemoveRes = store.removeCrewFromEventRoster(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewEmail: crewActorB.email,
  reason: "Attempt removal without resolving active shift",
  referenceNowMs: Date.parse("2026-08-01T00:00:00+08:00"),
})
assert.equal(blockedRemoveRes.ok, false, "Must block removing roster member with active shift")

// Add a second shift for Elena on another day and verify non-overwriting append
const shift2Res = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewEmail: crewActorB.email,
  crewName: crewActorB.name,
  role: "crew",
  activityType: "event",
  startDateTime: "2026-08-15T09:00",
  endDateTime: "2026-08-15T18:00",
  breakMinutes: 60,
  instructions: "Day-of conservatory support",
})
assert.equal(shift2Res.ok, true)
state = store.readOperationsStore()
const activeElenaShifts = (
  state.orderRequests.find((o) => o.eventId === "evt-phase3-brief")?.eventSchedules ?? []
).filter((s) => s.crewEmail === crewActorB.email && s.status !== "cancelled")
assert.equal(activeElenaShifts.length, 2, "Second shift must append without overwriting first shift")

// Overnight shift with breaks MUST require explicit Break Start & Break End
const invalidOvernightRes = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewEmail: crewActorB.email,
  crewName: crewActorB.name,
  role: "crew",
  activityType: "dismantling",
  startDateTime: "2026-08-15T20:00",
  endDateTime: "2026-08-16T04:00",
  breakMinutes: 60,
  instructions: "Overnight strike and load-out",
})
assert.equal(
  invalidOvernightRes.ok,
  false,
  "Overnight shift with breaks must reject scalar-only breakMinutes without Break Start/End",
)

const validOvernightRes = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewEmail: crewActorB.email,
  crewName: crewActorB.name,
  role: "crew",
  activityType: "dismantling",
  startDateTime: "2026-08-15T20:00",
  endDateTime: "2026-08-16T04:00",
  breakStartDateTime: "2026-08-15T23:30",
  breakEndDateTime: "2026-08-16T00:30",
  instructions: "Overnight strike and load-out",
})
assert.equal(validOvernightRes.ok, true, "Overnight shift with explicit Break Start/End must succeed")

// Cancel shift 2 and verify it stays in history with status cancelled
const cancelRes = store.cancelScheduledShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  shiftId: shift2Res.shift.id,
  reason: "Rescheduled load-in window to morning shift",
})
assert.equal(cancelRes.ok, true)
state = store.readOperationsStore()
const cancelledShift = state.orderRequests
  .find((o) => o.eventId === "evt-phase3-brief")
  ?.eventSchedules?.find((s) => s.id === shift2Res.shift.id)
assert.ok(cancelledShift, "Cancelled shift must remain in history")
assert.equal(cancelledShift.status, "cancelled")
assert.equal(cancelledShift.cancellationReason, "Rescheduled load-in window to morning shift")

// ----------------------------------------------------------------------------
// 4. Independent Worker Assignment Completion (Submitted -> Completed)
// ----------------------------------------------------------------------------
console.log(
  "Phase 3.4: Independent Worker Assignment Completion (Submitted -> Completed before asset verification)...",
)
state = store.readOperationsStore()
const pergolaJob = state.fabricationJobs.find((j) => j.eventId === "evt-phase3-brief")
assert.ok(pergolaJob, "Pergola custom job should exist")

// Schedule Elena on the pergola production job to create a production WorkerAssignmentRecord
const prodShiftRes = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  jobId: pergolaJob.id,
  crewEmail: crewActorB.email,
  crewName: crewActorB.name,
  role: "crew",
  activityType: "fabrication",
  startDateTime: "2026-08-11T08:00",
  endDateTime: "2026-08-11T17:00",
  breakMinutes: 60,
  instructions: "Polish and seal 8 antique brass columns",
})
assert.equal(prodShiftRes.ok, true)
const elenaProdAssignmentId = prodShiftRes.assignment.id

// Elena records her attendance, 8 productive hours, and submits her contribution
const contribRes = store.recordWorkerContributionAndHours(crewActorB, {
  eventId: "evt-phase3-brief",
  jobId: pergolaJob.id,
  assignmentId: elenaProdAssignmentId,
  shiftId: prodShiftRes.shift.id,
  manilaDate: "2026-08-11",
  attendance: "Present",
  actualProductiveHours: 8,
  contributionSummary: "All 8 brass columns polished and sealed with 2 coats.",
  photoUrls: ["/event-manager-images/planning.jpg"],
  markContributionSubmitted: true,
})
assert.equal(contribRes.ok, true)

// Warehouse confirms Elena's assignment completion while pergolaJob is still In Production (not yet Ready to Load)
const confirmWorkerRes = store.confirmWorkerAssignmentCompletion(warehouseActor, {
  jobId: pergolaJob.id,
  assignmentId: elenaProdAssignmentId,
  notes: "Verified Elena's 8 columns and 8.0 actual hours.",
})
assert.equal(confirmWorkerRes.ok, true)
state = store.readOperationsStore()
const updatedPergolaJob = state.fabricationJobs.find((j) => j.id === pergolaJob.id)
const updatedElenaAssignment = updatedPergolaJob.assignments.find(
  (a) => a.id === elenaProdAssignmentId,
)
assert.equal(
  updatedElenaAssignment.status,
  "Completed",
  "Worker assignment must transition Submitted -> Completed",
)
assert.notEqual(
  updatedPergolaJob.status,
  "Ready to Load",
  "Worker assignment completion must remain independent of full asset verification",
)

// ----------------------------------------------------------------------------
// 5. Migration-Review Controls (Non-Circular Resolution & Audit Reason)
// ----------------------------------------------------------------------------
console.log(
  "Phase 3.5: Non-circular Migration-Review Controls (preserving legacyScheduleText & requiring audit reason)...",
)
state = store.readOperationsStore()
const celesteOrder = state.orderRequests.find((o) => o.eventId === "evt-celeste-marcos")
const unparseableFlagsBefore = (celesteOrder.migrationReviewFlags ?? []).filter(
  (f) => f.code === "UNPARSEABLE_SCHEDULE_TEXT" && !f.resolvedAt,
)
assert.ok(unparseableFlagsBefore.length >= 1, "Seeded order has UNPARSEABLE_SCHEDULE_TEXT flag")
const targetLegacyAssignmentId = unparseableFlagsBefore[0].targetId
const legacyAssignmentBefore = celesteOrder.crewAssignments.find(
  (a) => a.id === targetLegacyAssignmentId,
)
assert.ok(legacyAssignmentBefore?.legacyScheduleText, "Legacy schedule text must exist on assignment")

// Scheduling a structured shift for that worker resolves UNPARSEABLE_SCHEDULE_TEXT while preserving legacyScheduleText
const resolveViaScheduleRes = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-celeste-marcos",
  crewEmail: legacyAssignmentBefore.crewEmail,
  crewName: legacyAssignmentBefore.crewName,
  role: "crew",
  activityType: "setup",
  startDateTime: "2026-06-18T06:00",
  endDateTime: "2026-06-18T14:00",
  breakMinutes: 60,
  instructions: "Structured replacement shift for legacy unparseable schedule text",
})
assert.equal(resolveViaScheduleRes.ok, true)

state = store.readOperationsStore()
const celesteOrderAfter = state.orderRequests.find((o) => o.eventId === "evt-celeste-marcos")
const resolvedFlag = (celesteOrderAfter.migrationReviewFlags ?? []).find(
  (f) => f.id === unparseableFlagsBefore[0].id,
)
assert.ok(resolvedFlag?.resolvedAt, "Scheduling a structured shift must resolve UNPARSEABLE_SCHEDULE_TEXT")
const legacyAssignmentAfter = celesteOrderAfter.crewAssignments.find(
  (a) => a.id === legacyAssignmentBefore.id,
)
assert.equal(
  legacyAssignmentAfter.legacyScheduleText,
  legacyAssignmentBefore.legacyScheduleText,
  "legacyScheduleText must be preserved even after resolving UNPARSEABLE_SCHEDULE_TEXT",
)

// Test resolveMigrationReviewFlag requiring a non-empty audit reason and supporting status correction
store.mutateOperationsStore((draft) => {
  draft.fabricationJobs.push({
    id: "fab-legacy-mig-p3",
    eventId: "evt-celeste-marcos",
    eventTitle: celesteOrderAfter.eventTitle,
    customItemId: "spec-legacy-p3",
    spec: {
      id: "spec-legacy-p3",
      name: "Legacy Velvet Canopy Frame",
      requestedQty: 1,
      dimensions: "3m x 3m",
      materials: "Steel & Velvet",
      colors: "Champagne",
      finish: "Matte",
      buildInstructions: "Legacy migrated job without structured schedule.",
      referenceImages: ["/event-manager-images/planning.jpg"],
    },
    status: "In Production",
    assignedCrewEmails: ["crew@demo.com"],
    progressPercent: 40,
    completedQty: 0,
    materialsVerified: true,
    linkedShiftPhotoIds: [],
    releasedForLoading: false,
    updatedAt: "2026-04-13T12:00:00.000Z",
  })
  const migrated = store.migrateOperationsStore(draft)
  draft.fabricationJobs = migrated.fabricationJobs
})

state = store.readOperationsStore()
const remainingJobFlag = state.fabricationJobs
  .flatMap((j) => (j.migrationReviewFlags ?? []).map((f) => ({ job: j, flag: f })))
  .find((item) => item.job.id === "fab-legacy-mig-p3" && !item.flag.resolvedAt)

assert.ok(remainingJobFlag, "Migrated legacy In Production job must have unresolved migration flags")

const missingReasonRes = store.resolveMigrationReviewFlag(warehouseActor, {
  eventId: remainingJobFlag.job.eventId,
  jobId: remainingJobFlag.job.id,
  flagId: remainingJobFlag.flag.id,
  flagCode: remainingJobFlag.flag.code,
  action: "corrected-status",
  reason: "   ",
  newStatus: "Assigned",
})
assert.equal(
  missingReasonRes.ok,
  false,
  "Correcting a migration flag must require a non-empty audit reason",
)

const validCorrectionRes = store.resolveMigrationReviewFlag(warehouseActor, {
  eventId: remainingJobFlag.job.eventId,
  jobId: remainingJobFlag.job.id,
  flagId: remainingJobFlag.flag.id,
  flagCode: remainingJobFlag.flag.code,
  action: "corrected-status",
  reason: "Reconciled legacy job status and verified production readiness.",
  newStatus: "Assigned",
})
assert.equal(validCorrectionRes.ok, true)

state = store.readOperationsStore()
const correctedJob = state.fabricationJobs.find((j) => j.id === remainingJobFlag.job.id)
assert.equal(correctedJob.status, "Assigned")
assert.ok(
  (correctedJob.migrationResolutionHistory ?? []).some(
    (entry) =>
      entry.flagCode === remainingJobFlag.flag.code &&
      entry.action === "corrected-status" &&
      entry.reason === "Reconciled legacy job status and verified production readiness.",
  ),
  "Migration resolution audit trail must record the correction and audit reason",
)

// ----------------------------------------------------------------------------
// 6. Correction 1 Regression: Validate migration resolution before clearing flags
// ----------------------------------------------------------------------------
console.log(
  "Phase 3.6: Migration resolution validation, flag isolation, and verification/loading gates...",
)

// Inject two workers' unparseable legacy assignments + unconfirmed job + partial ready job + auto lead
store.mutateOperationsStore((draft) => {
  const order = draft.orderRequests.find((o) => o.eventId === "evt-phase3-brief")
  order.teamLeadEmail = "crew@demo.com"
  order.teamLeadName = "Ground Crew"
  order.teamLeadExplicitlySelected = false
  order.teamLeadHistory.unshift({
    id: "tlh-auto-leg",
    newLeadEmail: "crew@demo.com",
    newLeadName: "Ground Crew",
    changedByEmail: "system",
    changedByName: "System",
    changedAt: "2026-06-01T00:00:00.000Z",
    isAutoDesignatedLegacy: true,
    reason: "Initial Team Lead designation.",
  })
  order.crewAssignments.push(
    {
      id: "asg-leg-mateo",
      eventId: "evt-phase3-brief",
      crewEmail: crewActorA.email,
      crewName: crewActorA.name,
      schedule: "Morning before event",
      duties: "Stage truss",
      shiftLabel: "Legacy Shift A",
      taskStatus: "Assigned",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      id: "asg-leg-elena",
      eventId: "evt-phase3-brief",
      crewEmail: crewActorB.email,
      crewName: crewActorB.name,
      schedule: "Afternoon load-in",
      duties: "Floral arch setup",
      shiftLabel: "Legacy Shift B",
      taskStatus: "Assigned",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  )
  draft.fabricationJobs.push(
    {
      id: "fab-corr-mig-inprod",
      eventId: "evt-phase3-brief",
      eventTitle: order.eventTitle,
      customItemId: "spec-mig-inprod",
      spec: {
        id: "spec-mig-inprod",
        name: "Migrated In-Prod Wall",
        requestedQty: 2,
        dimensions: "4m x 3m",
        materials: "Wood & Brass",
        colors: "Champagne",
        finish: "Satin",
        buildInstructions: "Legacy wall build",
        referenceImages: ["/event-manager-images/planning.jpg"],
      },
      status: "In Production",
      assignedCrewEmails: ["crew@demo.com"],
      progressPercent: 30,
      completedQty: 0,
      materialsVerified: true,
      linkedShiftPhotoIds: [],
      releasedForLoading: false,
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      id: "fab-corr-mig-partial-ready",
      eventId: "evt-phase3-brief",
      eventTitle: order.eventTitle,
      customItemId: "spec-mig-partial-ready",
      spec: {
        id: "spec-mig-partial-ready",
        name: "Migrated Partial Ready Sign",
        requestedQty: 3,
        dimensions: "1m x 1m",
        materials: "Acrylic",
        colors: "Gold",
        finish: "Gloss",
        buildInstructions: "3 signs required",
        referenceImages: ["/event-manager-images/planning.jpg"],
      },
      status: "Ready to Load",
      assignedCrewEmails: ["crew@demo.com"],
      progressPercent: 100,
      completedQty: 2, // PARTIAL QUANTITY!
      materialsVerified: true,
      linkedShiftPhotoIds: [],
      releasedForLoading: true,
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  )
  const migrated = store.migrateOperationsStore(draft)
  draft.orderRequests = migrated.orderRequests
  draft.fabricationJobs = migrated.fabricationJobs
})

// Audit reason alone MUST NOT clear MISSING_CONFIRMED_SCHEDULE
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    jobId: "fab-corr-mig-inprod",
    flagCode: "MISSING_CONFIRMED_SCHEDULE",
    action: "confirmed-data",
    reason: "Reason entered without any actual schedule",
  }).ok,
  false,
  "Audit reason alone must NOT clear MISSING_CONFIRMED_SCHEDULE without structured shifts",
)

// Audit reason alone MUST NOT clear UNCONFIRMED_PARTICIPANTS
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    jobId: "fab-corr-mig-inprod",
    flagCode: "UNCONFIRMED_PARTICIPANTS",
    action: "confirmed-data",
    reason: "Reason entered without confirmed participants",
  }).ok,
  false,
  "Audit reason alone must NOT clear UNCONFIRMED_PARTICIPANTS",
)

// Non-roster participant MUST be rejected
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    jobId: "fab-corr-mig-inprod",
    flagCode: "UNCONFIRMED_PARTICIPANTS",
    action: "confirmed-data",
    reason: "Attempt non-roster worker",
    confirmedParticipantEmails: ["outsider@demo.com"],
  }).ok,
  false,
  "Participants outside active Event Crew Group roster must be rejected",
)

// Scheduling one worker (Mateo) resolves ONLY Mateo's UNPARSEABLE_SCHEDULE_TEXT, NOT Elena's!
// Note: Elena already had earlier shifts on evt-phase3-brief so test with another worker without shifts: carlos@demo.com
store.mutateOperationsStore((draft) => {
  const order = draft.orderRequests.find((o) => o.eventId === "evt-phase3-brief")
  order.crewAssignments.push({
    id: "asg-leg-carlos",
    eventId: "evt-phase3-brief",
    crewEmail: "carlos@demo.com",
    crewName: "Carlos Diaz",
    schedule: "Late night tear down",
    duties: "Teardown",
    shiftLabel: "Legacy Shift C",
    taskStatus: "Assigned",
    updatedAt: "2026-06-01T00:00:00.000Z",
  })
  const migrated = store.migrateOperationsStore(draft)
  draft.orderRequests = migrated.orderRequests
})

assert.equal(
  store.scheduleWorkerShift(warehouseActor, {
    eventId: "evt-phase3-brief",
    crewEmail: crewActorA.email,
    crewName: crewActorA.name,
    activityType: "setup",
    startDateTime: "2026-08-14T08:00",
    endDateTime: "2026-08-14T16:00",
    breakMinutes: 60,
    instructions: "Setup for Mateo",
  }).ok,
  true,
)

state = store.readOperationsStore()
const briefOrderCheck = state.orderRequests.find((o) => o.eventId === "evt-phase3-brief")
const mateoUnparseableFlag = (briefOrderCheck.migrationReviewFlags ?? []).find(
  (f) => f.targetId === "asg-leg-mateo" && f.code === "UNPARSEABLE_SCHEDULE_TEXT",
)
const carlosUnparseableFlag = (briefOrderCheck.migrationReviewFlags ?? []).find(
  (f) => f.targetId === "asg-leg-carlos" && f.code === "UNPARSEABLE_SCHEDULE_TEXT",
)
assert.ok(mateoUnparseableFlag?.resolvedAt, "Mateo schedule should resolve Mateo flag")
assert.equal(
  Boolean(carlosUnparseableFlag?.resolvedAt),
  false,
  "Scheduling Mateo must NOT clear Carlos's unrelated UNPARSEABLE_SCHEDULE_TEXT flag",
)

// Audit reason alone MUST NOT clear Carlos's UNPARSEABLE_SCHEDULE_TEXT without Carlos having a schedule
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    flagId: carlosUnparseableFlag.id,
    flagCode: "UNPARSEABLE_SCHEDULE_TEXT",
    action: "confirmed-data",
    reason: "Trying to clear Carlos unparseable flag with text reason only",
  }).ok,
  false,
)

// Scheduling Mateo on fab-corr-mig-inprod MUST NOT auto-clear DEMO_ACCOUNT_ASSIGNED or UNCONFIRMED_PARTICIPANTS on that job
assert.equal(
  store.scheduleWorkerShift(warehouseActor, {
    eventId: "evt-phase3-brief",
    jobId: "fab-corr-mig-inprod",
    crewEmail: crewActorA.email,
    crewName: crewActorA.name,
    activityType: "fabrication",
    startDateTime: "2026-08-12T08:00",
    endDateTime: "2026-08-12T16:00",
    breakMinutes: 60,
  }).ok,
  true,
)
state = store.readOperationsStore()
const migJobAfterMateoShift = state.fabricationJobs.find((j) => j.id === "fab-corr-mig-inprod")
assert.ok(
  migJobAfterMateoShift.migrationReviewFlags.find((f) => f.code === "MISSING_CONFIRMED_SCHEDULE")
    ?.resolvedAt,
  "Scheduling on the job resolves its own MISSING_CONFIRMED_SCHEDULE flag",
)
assert.equal(
  Boolean(
    migJobAfterMateoShift.migrationReviewFlags.find((f) => f.code === "DEMO_ACCOUNT_ASSIGNED")
      ?.resolvedAt,
  ),
  false,
  "Scheduling a worker must NOT auto-clear DEMO_ACCOUNT_ASSIGNED without explicit review/replacement",
)
assert.equal(
  Boolean(
    migJobAfterMateoShift.migrationReviewFlags.find((f) => f.code === "UNCONFIRMED_PARTICIPANTS")
      ?.resolvedAt,
  ),
  false,
  "Scheduling one worker must NOT auto-clear UNCONFIRMED_PARTICIPANTS without explicit confirmation",
)

// DEMO_ACCOUNT_ASSIGNED on job cannot clear by passing crew@demo.com without explicitDemoConfirmation
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    jobId: "fab-corr-mig-inprod",
    flagCode: "DEMO_ACCOUNT_ASSIGNED",
    action: "replaced-demo-or-lead",
    reason: "Reason only",
    confirmedParticipantEmails: [crewActorA.email, "crew@demo.com"],
    explicitDemoConfirmation: false,
  }).ok,
  false,
)

// Replacing crew@demo.com with confirmed roster members Mateo & Elena resolves DEMO_ACCOUNT_ASSIGNED
store.addCrewToEventRoster(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewEmail: crewActorA.email,
  crewName: crewActorA.name,
})
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    jobId: "fab-corr-mig-inprod",
    flagCode: "DEMO_ACCOUNT_ASSIGNED",
    action: "replaced-demo-or-lead",
    reason: "Replaced demo account with active roster members Mateo and Elena.",
    confirmedParticipantEmails: [crewActorA.email, crewActorB.email],
  }).ok,
  true,
)

// AUTO_DESIGNATED_TEAM_LEAD cannot clear solely with reason when not explicitly confirmed/selected
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    flagCode: "AUTO_DESIGNATED_TEAM_LEAD",
    action: "replaced-demo-or-lead",
    reason: "Just typing a reason without selecting a confirmed lead",
  }).ok,
  false,
)

// Selecting Mateo explicitly as confirmedLeadEmail resolves AUTO_DESIGNATED_TEAM_LEAD
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    flagCode: "AUTO_DESIGNATED_TEAM_LEAD",
    action: "replaced-demo-or-lead",
    reason: "Confirmed Mateo Cruz as explicit Event Team Lead replacing legacy auto demo lead.",
    confirmedLeadEmail: crewActorA.email,
  }).ok,
  true,
)

// Status correction MUST NOT jump unverified job directly into Ready to Load
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    jobId: "fab-corr-mig-inprod",
    flagCode: "UNCONFIRMED_PARTICIPANTS",
    action: "corrected-status",
    reason: "Attempting to jump to Ready to Load without verification",
    newStatus: "Ready to Load",
  }).ok,
  false,
  "Migration status correction must never bypass verification into Ready to Load",
)

// Partial-quantity legacy Ready to Load job MUST NOT clear LEGACY_APPROVAL_MISSING_EVIDENCE via exception
assert.equal(
  store.resolveMigrationReviewFlag(warehouseActor, {
    eventId: "evt-phase3-brief",
    jobId: "fab-corr-mig-partial-ready",
    flagCode: "LEGACY_APPROVAL_MISSING_EVIDENCE",
    action: "recorded-historical-exception",
    reason: "Attempt exception on partial 2/3 completedQty",
  }).ok,
  false,
  "Historical exception must not bypass full-quantity (3/3) verification requirement",
)

// Loading checklist sign-off MUST remain blocked while LEGACY_APPROVAL_MISSING_EVIDENCE is unresolved
const blockedLoadingSignoff = store.submitFinalLoadingChecklist(
  crewActorA,
  "evt-phase3-brief",
  "Attempt loading signoff with unverified partial legacy job",
)
assert.equal(blockedLoadingSignoff.ok, false)
assert.ok(blockedLoadingSignoff.error.includes("LOADING SIGN-OFF BLOCKED"))

// ----------------------------------------------------------------------------
// 7. Correction 2 Regression: Canonical pitch:<projectId> note lookup & isolation
// ----------------------------------------------------------------------------
console.log(
  "Phase 3.7: Canonical pitch:<projectId> mood-board note lookup and cross-event isolation...",
)
localStorageMock.setItem(
  "lumiere-mood-board-comments-v1",
  JSON.stringify([
    {
      id: "note-canon-1",
      boardId: "pitch:proj-canonical-100",
      page: 0,
      x: 20,
      y: 30,
      authorName: "Clara Santos",
      authorEmail: "clara@lumiere.com",
      body: "Use matte champagne drape along Conservatory North wall.",
      createdAt: "2026-06-10T10:00:00.000Z",
    },
    {
      id: "note-other-event",
      boardId: "pitch:proj-other-200",
      page: 0,
      x: 40,
      y: 50,
      authorName: "Clara Santos",
      authorEmail: "clara@lumiere.com",
      body: "Other event isolated note — must not leak.",
      createdAt: "2026-06-10T11:00:00.000Z",
    },
  ]),
)

// Even when WarehouseOrderRequest.eventId differs from project.id, canonical lookup resolves pitch:<projectId>
const separatedOrder = {
  eventId: "evt-warehouse-separate-100",
  projectId: "proj-canonical-100",
  moodBoardId: store.getPitchBoardId("proj-canonical-100"),
}
const resolvedBoardId = store.resolveOrderMoodBoardId(separatedOrder)
assert.equal(resolvedBoardId, "pitch:proj-canonical-100")

const storedComments = JSON.parse(
  localStorageMock.getItem("lumiere-mood-board-comments-v1") ?? "[]",
)
const matchedNotes = storedComments.filter((n) => n.boardId === resolvedBoardId)
assert.equal(matchedNotes.length, 1)
assert.equal(matchedNotes[0].body, "Use matte champagne drape along Conservatory North wall.")

// Bare eventId must NOT match pitch:<projectId> notes
assert.equal(storedComments.filter((n) => n.boardId === "evt-warehouse-separate-100").length, 0)
assert.equal(storedComments.filter((n) => n.boardId === "proj-canonical-100").length, 0)

// Empty-note event remains empty and isolated
assert.equal(
  storedComments.filter(
    (n) => n.boardId === store.resolveOrderMoodBoardId({ eventId: "evt-no-notes-999" }),
  ).length,
  0,
)

// ----------------------------------------------------------------------------
// 8. Correction 3 Regression: Evidence-based asset usage history
// ----------------------------------------------------------------------------
console.log(
  "Phase 3.8: Evidence-based asset usage history (loaded vs allocated-only vs unknown load)...",
)
const orderWithDepartureMixedAssets = {
  id: "ORD-HIST-1",
  eventId: "evt-hist-mixed",
  eventTitle: "Mixed Dispatch History Gala",
  clientName: "Test Client",
  venue: "Grand Hall",
  startDateTime: "2026-09-01T18:00",
  endDateTime: "2026-09-01T23:00",
  theme: "Modern",
  pax: 100,
  approvalNote: "Approved",
  approvedByName: "Manager",
  approvedByEmail: "em@demo.com",
  approvedAt: "2026-08-01T10:00:00.000Z",
  revisionAtApproval: 1,
  outboundDeparture: {
    confirmedByEmail: warehouseActor.email,
    confirmedByName: warehouseActor.name,
    confirmedAt: "2026-09-01T10:00:00.000Z",
    vehiclePlate: "ABC-123",
    driverName: "Driver",
    notes: "Truck departed warehouse",
  },
  stockLines: [
    {
      assetId: "ast-loaded",
      assetCode: "AST-LOAD",
      name: "Loaded Chair",
      category: "Furniture",
      image: "/event-manager-images/planning.jpg",
      unit: "pieces",
      approvedRequestedQty: 50,
      allocatedQty: 40,
      deficitQty: 10,
      releasedForLoadQty: 40,
      loadedQty: 35,
      loadingVerified: true,
      returnedQty: 0,
    },
    {
      assetId: "ast-alloc-only",
      assetCode: "AST-ALLOC",
      name: "Allocated Only Table",
      category: "Furniture",
      image: "/event-manager-images/planning.jpg",
      unit: "pieces",
      approvedRequestedQty: 20,
      allocatedQty: 20,
      deficitQty: 0,
      releasedForLoadQty: 20,
      loadedQty: 0, // NOT LOADED even though outboundDeparture exists on the event!
      loadingVerified: false,
      returnedQty: 0,
    },
    {
      assetId: "ast-unknown-load",
      assetCode: "AST-UNK",
      name: "Returned With Unknown Load Vase",
      category: "Decor",
      image: "/event-manager-images/planning.jpg",
      unit: "pieces",
      approvedRequestedQty: 12,
      allocatedQty: 12,
      deficitQty: 0,
      releasedForLoadQty: 12,
      loadedQty: 0, // Outbound loaded count unrecorded/unknown
      loadingVerified: false,
      returnedQty: 10,
    },
  ],
  customSpecs: [],
  rentals: [],
  crewAssignments: [],
  teamLeadHistory: [],
  manifestPrepared: true,
  warehouseClosed: false,
}

const loadedHistory = assetHistory.deriveAssetUsageHistoryFromStore(
  { assetId: "ast-loaded", assetCode: "AST-LOAD", unit: "pieces", name: "Loaded Chair" },
  [orderWithDepartureMixedAssets],
  [],
)
assert.equal(loadedHistory.length, 1)
assert.equal(loadedHistory[0].usageKind, "confirmed")
assert.equal(loadedHistory[0].quantity, 35, "Confirmed dispatched quantity must reflect actual loadedQty (35), not allocatedQty (40)")
assert.equal(loadedHistory[0].requestedQty, 50)
assert.equal(loadedHistory[0].allocatedQty, 40)
assert.equal(loadedHistory[0].loadedQty, 35)
assert.equal(loadedHistory[0].returnedQty, null, "Before return checkpoint, returnedQty should be null/pending rather than prematurely 0")

const allocOnlyHistory = assetHistory.deriveAssetUsageHistoryFromStore(
  {
    assetId: "ast-alloc-only",
    assetCode: "AST-ALLOC",
    unit: "pieces",
    name: "Allocated Only Table",
  },
  [orderWithDepartureMixedAssets],
  [],
)
assert.equal(allocOnlyHistory.length, 1)
assert.equal(
  allocOnlyHistory[0].usageKind,
  "reserved",
  "Allocated-only asset with loadedQty=0 must remain a reservation even when event has outboundDeparture",
)
assert.equal(allocOnlyHistory[0].statusLabel, "Reserved · Not Loaded at Dispatch")
assert.equal(allocOnlyHistory[0].loadedQty, 0)

const unknownLoadHistory = assetHistory.deriveAssetUsageHistoryFromStore(
  {
    assetId: "ast-unknown-load",
    assetCode: "AST-UNK",
    unit: "pieces",
    name: "Returned With Unknown Load Vase",
  },
  [orderWithDepartureMixedAssets],
  [],
)
assert.equal(unknownLoadHistory.length, 1)
assert.equal(unknownLoadHistory[0].usageKind, "confirmed")
assert.equal(
  unknownLoadHistory[0].loadedQty,
  null,
  "Unknown outbound loadedQty must remain null rather than substituting allocatedQty/releasedForLoadQty",
)
assert.equal(unknownLoadHistory[0].quantity, null)
assert.equal(unknownLoadHistory[0].returnedQty, 10)

// Loaded-only before departure should label Loaded for Dispatch
const stagedOrder = {
  ...orderWithDepartureMixedAssets,
  eventId: "evt-hist-staged",
  outboundDeparture: undefined,
}
const stagedHistory = assetHistory.deriveAssetUsageHistoryFromStore(
  { assetId: "ast-loaded", assetCode: "AST-LOAD", unit: "pieces", name: "Loaded Chair" },
  [stagedOrder],
  [],
)
assert.equal(stagedHistory[0].usageKind, "confirmed")
assert.equal(stagedHistory[0].statusLabel, "Loaded for Dispatch")

// ----------------------------------------------------------------------------
// 9. Correction 4 Regression: Separate event duties & multi-shift same duty + 8h rule + persistence
// ----------------------------------------------------------------------------
console.log(
  "Phase 3.9: Duty separation (loading vs setup), same-duty multi-shift, 8h workload rule & refresh persistence...",
)

// Confirm daily workload calculator still enforces 8h default rule
const workload8hCheck = store.validateAndComputeShiftSchedule({
  startDateTime: "2026-08-20T08:00",
  endDateTime: "2026-08-20T17:00",
  breakMinutes: 60,
})
assert.equal(workload8hCheck.ok, true)
assert.equal(workload8hCheck.plannedProductiveHours, 8)
assert.equal(workload8hCheck.dailyProductiveHoursByManilaDate["2026-08-20"], 8)

// Schedule Mateo for two different duties on evt-phase3-brief: loading and dismantling/returns
const loadDutyRes = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewEmail: crewActorA.email,
  crewName: crewActorA.name,
  activityType: "loading",
  startDateTime: "2026-08-18T06:00",
  endDateTime: "2026-08-18T10:00",
  breakMinutes: 0,
  instructions: "Verify Dock A truck manifest loading",
})
assert.equal(loadDutyRes.ok, true)

const setupDutyRes = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  crewEmail: crewActorA.email,
  crewName: crewActorA.name,
  activityType: "setup",
  startDateTime: "2026-08-18T11:00",
  endDateTime: "2026-08-18T15:00",
  breakMinutes: 0,
  instructions: "Install Conservatory Main Stage arches",
})
assert.equal(setupDutyRes.ok, true)

assert.notEqual(
  loadDutyRes.assignment.id,
  setupDutyRes.assignment.id,
  "Different event duties (loading vs setup) for the same worker must create separate assignments",
)
assert.equal(loadDutyRes.assignment.phase, "loading")
assert.equal(setupDutyRes.assignment.phase, "setup")
assert.equal(loadDutyRes.assignment.instructions, "Verify Dock A truck manifest loading")
assert.equal(setupDutyRes.assignment.instructions, "Install Conservatory Main Stage arches")

// Multiple legitimate shifts on the SAME loading duty assignment share loadDutyRes.assignment.id
const loadDutyShift2Res = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  assignmentId: loadDutyRes.assignment.id,
  crewEmail: crewActorA.email,
  crewName: crewActorA.name,
  activityType: "loading",
  startDateTime: "2026-08-19T06:00",
  endDateTime: "2026-08-19T09:00",
  breakMinutes: 0,
})
assert.equal(loadDutyShift2Res.ok, true)
assert.equal(
  loadDutyShift2Res.assignment.id,
  loadDutyRes.assignment.id,
  "Second shift belonging to the same loading duty must link to the same loading assignment",
)

// Attempting to attach a returns shift onto the loading assignment ID must fail
const crossPhaseRejectRes = store.scheduleWorkerShift(warehouseActor, {
  eventId: "evt-phase3-brief",
  assignmentId: loadDutyRes.assignment.id,
  crewEmail: crewActorA.email,
  crewName: crewActorA.name,
  activityType: "returns",
  startDateTime: "2026-08-20T06:00",
  endDateTime: "2026-08-20T09:00",
  breakMinutes: 0,
})
assert.equal(
  crossPhaseRejectRes.ok,
  false,
  "Attaching a returns shift onto a loading assignment ID must be rejected",
)

// Mateo submits and Warehouse completes ONLY the loading duty; setup duty remains independent!
assert.equal(
  store.recordWorkerContributionAndHours(crewActorA, {
    eventId: "evt-phase3-brief",
    assignmentId: loadDutyRes.assignment.id,
    shiftId: loadDutyRes.shift.id,
    manilaDate: "2026-08-18",
    attendance: "Present",
    actualProductiveHours: 7,
    contributionSummary: "All Dock A items loaded and scanned.",
    progressPercent: 100,
    markContributionSubmitted: true,
  }).ok,
  true,
)

assert.equal(
  store.confirmWorkerAssignmentCompletion(warehouseActor, {
    eventId: "evt-phase3-brief",
    assignmentId: loadDutyRes.assignment.id,
    notes: "Confirmed Dock A loading duty completed.",
  }).ok,
  true,
)

// Simulate browser refresh by re-reading persisted localStorage JSON
const rawPersisted = localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)
assert.ok(rawPersisted && rawPersisted.length > 0, "Operations state must be persisted in storage")
const parsedReloaded = store.migrateOperationsStore(JSON.parse(rawPersisted))
const reloadedBriefOrder = parsedReloaded.orderRequests.find(
  (o) => o.eventId === "evt-phase3-brief",
)
const reloadedLoadAsg = reloadedBriefOrder.eventAssignments.find(
  (a) => a.id === loadDutyRes.assignment.id,
)
const reloadedSetupAsg = reloadedBriefOrder.eventAssignments.find(
  (a) => a.id === setupDutyRes.assignment.id,
)
assert.equal(reloadedLoadAsg.status, "Completed")
assert.equal(reloadedSetupAsg.status, "Assigned", "Setup duty must stay Assigned when Loading duty completes")
assert.equal(reloadedSetupAsg.instructions, "Install Conservatory Main Stage arches")
assert.equal(
  reloadedBriefOrder.eventSchedules.filter((s) => s.assignmentId === loadDutyRes.assignment.id).length,
  2,
  "Both loading shifts must stay linked to loading assignment across refresh",
)
assert.ok(
  reloadedBriefOrder.eventContributions.some(
    (c) => c.assignmentId === loadDutyRes.assignment.id && c.actualProductiveHours === 7,
  ),
  "Event duty contributions must persist across refresh",
)

console.log("All Phase 3 Warehouse Operations & Ground Crew checks passed!")
