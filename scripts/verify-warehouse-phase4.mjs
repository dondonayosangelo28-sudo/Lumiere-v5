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
let failLocalStorageWrites = false
const localStorageMock = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => {
    if (failLocalStorageWrites && key === "lumiere.operations.store.v51") {
      throw new DOMException("QuotaExceededError", "QuotaExceededError")
    }
    memoryStore.set(key, String(val))
  },
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

const warehouseActor = {
  name: "Marcus Vance",
  email: "warehouse@demo.com",
  role: "Warehouse Operations Manager",
}
const jordanActor = {
  name: "Jordan Reyes",
  email: "crew@demo.com",
  role: "Ground Crew",
}
const alexActor = {
  name: "Alex Ramos",
  email: "alex@demo.com",
  role: "Ground Crew",
}
const carlosActor = {
  name: "Carlos Diaz",
  email: "carlos@demo.com",
  role: "Ground Crew",
}

console.log(
  "Testing Warehouse Operations & Ground Crew Phase 4 (Production, Verification, Dispatch & Returns) Suite...",
)

// ----------------------------------------------------------------------------
// 1. Production Workspace: Per-unit / Per-set, Combined Windows, Template Isolation
// ----------------------------------------------------------------------------
console.log(
  "Phase 4.1: Production estimates, combined-window rounding, template isolation, and Individual/Group roster confirmation...",
)
localStorageMock.clear()

const p4EventId = "evt-phase4-gala"
const published = store.publishApprovedEventToWarehouse(
  {
    id: p4EventId,
    approvalNote: "Approved client custom fabrication and stock release.",
    brief: {
      title: "Midnight Luminary Gala",
      client: "Isabella Ayala",
      clientEmail: "isabella@example.com",
      venue: "Ayala Museum Terrace",
      start: "2026-10-10T18:00",
      end: "2026-10-10T23:30",
      theme: "Champagne & Obsidian",
      pax: 200,
      requirements: [
        { id: "req-1", assetId: "evtast-0001", quantity: 10 },
      ],
      customItems: [
        {
          id: "cust-p4-arch",
          name: "Tri-Panel Brass Ceremony Arch",
          quantity: 3,
          dimensions: "3.2m x 2.6m",
          materials: "Brushed Brass",
          colors: "Champagne Gold",
          finish: "Satin Clear Coat",
          instructions: "Weld weighted floor plates on all 3 arch sets.",
          referenceImages: ["/event-manager-images/garden.jpg"],
        },
        {
          id: "cust-p4-plinth",
          name: "Fluted Travertine Pedestal",
          quantity: 4,
          dimensions: "1.2m x 0.45m",
          materials: "Honed Travertine",
          colors: "Ivory",
          finish: "Honed Matte",
          instructions: "Polish beveled top edges.",
          referenceImages: ["/event-manager-images/corporate.jpg"],
        },
        {
          id: "cust-p4-podium",
          name: "Solo Walnut Host Podium",
          quantity: 1,
          dimensions: "1.2m x 0.7m",
          materials: "Solid Walnut",
          colors: "Dark Walnut",
          finish: "Natural Oil",
          instructions: "Conceal microphone conduit.",
          referenceImages: ["/event-manager-images/planning.jpg"],
        },
      ],
      rentals: [
        {
          id: "rnt-p4-1",
          entryType: "supplier",
          vendorId: "sample-lighting",
          name: "Sinag Stage Lighting",
          vendorName: "Sinag Stage Lighting",
          supplierType: "Lighting supplier",
          itemName: "Warm Ambient Uplight Pack",
          directToVenue: true,
          note: "Deliver 2 PM",
          quantity: 6,
          optional: true,
          selected: true,
        },
      ],
      notes: "Terrace outdoor wind bracing required.",
      pins: [],
    },
  },
  warehouseActor,
)
assert.equal(published.eventId, p4EventId)

// Add Jordan, Alex, and Carlos to Event Crew Group Roster and explicitly designate Jordan as Team Lead
store.addCrewToEventRoster(warehouseActor, {
  eventId: p4EventId,
  crewEmail: jordanActor.email,
  crewName: jordanActor.name,
})
store.addCrewToEventRoster(warehouseActor, {
  eventId: p4EventId,
  crewEmail: alexActor.email,
  crewName: alexActor.name,
})
store.addCrewToEventRoster(warehouseActor, {
  eventId: p4EventId,
  crewEmail: carlosActor.email,
  crewName: carlosActor.name,
})
store.designateEventTeamLead(warehouseActor, {
  eventId: p4EventId,
  newLeadEmail: jordanActor.email,
  newLeadName: jordanActor.name,
  reason: "Explicit Event Team Lead for Phase 4 gala.",
})

let state = store.readOperationsStore()
const archJob = state.fabricationJobs.find((j) => j.customItemId === "cust-p4-arch")
const plinthJob = state.fabricationJobs.find((j) => j.customItemId === "cust-p4-plinth")
const podiumJob = state.fabricationJobs.find((j) => j.customItemId === "cust-p4-podium")
assert.ok(archJob && plinthJob && podiumJob)

// Confirm non-roster participant rejection inside confirmProductionJobWindowAndEstimate
const rejectNonRosterPlan = store.confirmProductionJobWindowAndEstimate(warehouseActor, {
  jobId: archJob.id,
  startDate: "2026-10-01",
  deadlineDate: "2026-10-04",
  availableProductionDays: 3,
  estimatedHoursPerUnitOrSet: 19,
  estimateBasis: "complete-set",
  assignmentMode: "group",
  participantEmails: ["outsider@demo.com"],
})
assert.equal(rejectNonRosterPlan.ok, false)

// Confirm Arch (3 sets x 19h/set = 57h) and Plinth (4 units x 6h/unit = 24h) on SAME window (81h combined -> ceil(81/(8*3))=4 crew)
assert.equal(
  store.confirmProductionJobWindowAndEstimate(warehouseActor, {
    jobId: archJob.id,
    startDate: "2026-10-01",
    deadlineDate: "2026-10-04",
    availableProductionDays: 3,
    estimatedHoursPerUnitOrSet: 19,
    estimateBasis: "complete-set",
    assignmentMode: "group",
    participantEmails: [jordanActor.email, alexActor.email],
    productionLeadEmail: jordanActor.email,
  }).ok,
  true,
)
assert.equal(
  store.confirmProductionJobWindowAndEstimate(warehouseActor, {
    jobId: plinthJob.id,
    startDate: "2026-10-01",
    deadlineDate: "2026-10-04",
    availableProductionDays: 3,
    estimatedHoursPerUnitOrSet: 6,
    estimateBasis: "per-unit",
    assignmentMode: "individual",
    participantEmails: [alexActor.email, carlosActor.email],
    productionLeadEmail: alexActor.email,
  }).ok,
  true,
)
// Confirm Podium on DIFFERENT deadline window (1 unit x 6h = 6h, 1 day -> ceil(6/8)=1 crew)
assert.equal(
  store.confirmProductionJobWindowAndEstimate(warehouseActor, {
    jobId: podiumJob.id,
    startDate: "2026-10-05",
    deadlineDate: "2026-10-06",
    availableProductionDays: 1,
    estimatedHoursPerUnitOrSet: 6,
    estimateBasis: "per-unit",
    assignmentMode: "individual",
    participantEmails: [carlosActor.email],
    productionLeadEmail: "", // Optional separate lead on single-worker Individual job!
  }).ok,
  true,
)

assert.equal(store.OPERATIONS_STORAGE_KEY, "lumiere.operations.store.v51")

// Rejected production plan (valid participants + dates + hours, invalid Production Lead) must leave BOTH memory & localStorage unchanged
const storageSnapshotBeforeBadLead = localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)
const podiumBeforeBadLead = store.readOperationsStore().fabricationJobs.find((j) => j.id === podiumJob.id)
const rejectedBadLeadPlan = store.confirmProductionJobWindowAndEstimate(warehouseActor, {
  jobId: podiumJob.id,
  startDate: "2026-10-08",
  deadlineDate: "2026-10-12",
  availableProductionDays: 4,
  estimatedHoursPerUnitOrSet: 99,
  estimateBasis: "complete-set",
  assignmentMode: "group",
  participantEmails: [jordanActor.email, carlosActor.email],
  productionLeadEmail: "not.on.roster@demo.com",
})
assert.equal(rejectedBadLeadPlan.ok, false)
assert.equal(
  localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY),
  storageSnapshotBeforeBadLead,
  "Rejected plan must not persist partial changes to localStorage",
)
const podiumAfterBadLead = store.readOperationsStore().fabricationJobs.find((j) => j.id === podiumJob.id)
assert.equal(podiumAfterBadLead.estimatedHoursPerUnitOrSet, podiumBeforeBadLead.estimatedHoursPerUnitOrSet)
assert.deepEqual(podiumAfterBadLead.participantEmails, podiumBeforeBadLead.participantEmails)
assert.equal(podiumAfterBadLead.productionWindow.deadlineDate, podiumBeforeBadLead.productionWindow.deadlineDate)
assert.equal(podiumAfterBadLead.productionLeadEmail, podiumBeforeBadLead.productionLeadEmail)

state = store.readOperationsStore()
const combinedRec = store.calculateCombinedWindowCrewRecommendations(
  state.fabricationJobs
    .filter((j) => j.eventId === p4EventId)
    .map((j) => ({
      id: j.id,
      requestedQty: j.spec.requestedQty,
      estimatedHoursPerUnitOrSet: j.estimatedHoursPerUnitOrSet,
      estimateBasis: j.estimateBasis,
      productionWindow: j.productionWindow,
    })),
)
assert.equal(combinedRec.windows.length, 2, "Must group same windows together and keep separate deadlines apart")
const sharedWindowRec = combinedRec.windows.find((w) => w.availableProductionDays === 3)
assert.equal(sharedWindowRec.combinedEstimatedLaborHours, 81) // 57 + 24
assert.equal(sharedWindowRec.recommendedProductionCrew, 4) // ceil(81 / 24) = 4

// Updating an Inventory Template Default must NOT mutate confirmed jobs
const tplCreate = store.createWarehouseInventoryItem({
  name: "Tri-Panel Brass Ceremony Arch",
  category: "Architectural / Custom",
  stock: 2,
  availableStock: 2,
  image: "/event-manager-images/garden.jpg",
  estimatedHoursPerUnitOrSet: 99,
  estimateBasis: "complete-set",
  defaultSharedShiftMinCrew: 4,
})
assert.equal(tplCreate.ok, true)
state = store.readOperationsStore()
assert.equal(
  state.fabricationJobs.find((j) => j.id === archJob.id).estimatedHoursPerUnitOrSet,
  19,
  "Saved template changes must never silently modify already-confirmed jobs",
)

// ----------------------------------------------------------------------------
// 2. Shared Shifts, Working Lead Capacity, Independent Worker Completion
// ----------------------------------------------------------------------------
console.log(
  "Phase 4.2: Shared-shift break coverage, working-lead hours, and independent worker completion...",
)
// Schedule Jordan + Alex on a shared shift on archJob with staggered explicit break windows
assert.equal(
  store.scheduleWorkerShift(warehouseActor, {
    eventId: p4EventId,
    jobId: archJob.id,
    crewEmail: jordanActor.email,
    crewName: jordanActor.name,
    role: "working-lead",
    activityType: "fabrication",
    startDateTime: "2026-10-01T08:00",
    endDateTime: "2026-10-01T17:00",
    breakStartDateTime: "2026-10-01T12:00",
    breakEndDateTime: "2026-10-01T13:00",
    isSharedShift: true,
    sharedShiftGroupId: "grp-arch-1",
    requiredSimultaneousCrew: 2,
  }).ok,
  true,
)
assert.equal(
  store.scheduleWorkerShift(warehouseActor, {
    eventId: p4EventId,
    jobId: archJob.id,
    crewEmail: alexActor.email,
    crewName: alexActor.name,
    role: "crew",
    activityType: "fabrication",
    startDateTime: "2026-10-01T08:00",
    endDateTime: "2026-10-01T17:00",
    breakStartDateTime: "2026-10-01T12:00", // Simultaneous break drops active crew below 2!
    breakEndDateTime: "2026-10-01T13:00",
    isSharedShift: true,
    sharedShiftGroupId: "grp-arch-1",
    requiredSimultaneousCrew: 2,
  }).ok,
  true,
)
// Jordan also has lead-coordination shift on 2026-10-02 (does not add to fabrication build hours)
assert.equal(
  store.scheduleWorkerShift(warehouseActor, {
    eventId: p4EventId,
    jobId: archJob.id,
    crewEmail: jordanActor.email,
    crewName: jordanActor.name,
    role: "working-lead",
    activityType: "lead-coordination",
    startDateTime: "2026-10-02T08:00",
    endDateTime: "2026-10-02T12:00",
    breakMinutes: 0,
  }).ok,
  true,
)

state = store.readOperationsStore()
const conflictReport = store.validateStoreSchedulesAndWorkload(state)
assert.ok(
  conflictReport.conflicts.some(
    (c) => c.kind === "shared-shift-understaffed" && c.jobId === archJob.id,
  ),
  "Simultaneous break on shared shift requiring 2 crew must trigger shared-shift-understaffed conflict",
)

const archLeadCap = store.calculateWorkingLeadCapacity(
  state.fabricationJobs.find((j) => j.id === archJob.id).schedules,
  jordanActor.email,
)
assert.equal(archLeadCap.plannedFabricationHours, 8)
assert.equal(archLeadCap.plannedCoordinationHours, 4)

// Alex submits his fabrication contribution and Warehouse confirms Alex Completed while archJob is still In Production
const alexArchAsg = state.fabricationJobs
  .find((j) => j.id === archJob.id)
  .assignments.find((a) => a.crewEmail === alexActor.email && a.activityType === "fabrication")
assert.equal(
  store.recordWorkerContributionAndHours(alexActor, {
    eventId: p4EventId,
    jobId: archJob.id,
    assignmentId: alexArchAsg.id,
    manilaDate: "2026-10-01",
    attendance: "Present",
    actualProductiveHours: 8,
    contributionSummary: "Welded Arch Set 1 & 2 joints.",
    markContributionSubmitted: true,
  }).ok,
  true,
)
assert.equal(
  store.confirmWorkerAssignmentCompletion(warehouseActor, {
    eventId: p4EventId,
    jobId: archJob.id,
    assignmentId: alexArchAsg.id,
    notes: "Alex's fabrication hours verified Completed prior to asset finish.",
  }).ok,
  true,
)

// ----------------------------------------------------------------------------
// 3. Verification Workspace: Checklist, Partial Rejection, Ownership & Selective Corrections
// ----------------------------------------------------------------------------
console.log(
  "Phase 4.3: Verification 3-point checklist, ownership rules, partial rejection, and selective corrections...",
)
// Daily photo alone must NOT allow approval
store.submitAfterShiftWorkPhoto(alexActor, {
  eventId: p4EventId,
  shiftLabel: "Day 1 Shift",
  photoUrl: "/event-manager-images/garden.jpg",
  caption: "Progress photo",
  isFabricationWork: true,
  fabricationJobId: archJob.id,
})
assert.equal(
  store.approveProductionJobFinishedWork(warehouseActor, archJob.id, {
    checklist: {
      fullQuantityFinished: true,
      matchesClientApprovedSpec: true,
      correctionsResolved: true,
    },
    notes: "Attempt approve from daily photo only",
  }).ok,
  false,
)

// Warehouse cannot submit finished work
assert.equal(
  store.submitProductionJobForVerification(warehouseActor, {
    jobId: archJob.id,
    completedQty: 3,
    photoUrls: ["/event-manager-images/garden.jpg"],
    summary: "Warehouse trying to self-submit",
  }).ok,
  false,
)

// Jordan (Production Lead on Group job archJob) submits full quantity (3/3)
assert.equal(
  store.submitProductionJobForVerification(jordanActor, {
    jobId: archJob.id,
    completedQty: 3,
    photoUrls: ["/event-manager-images/garden.jpg"],
    summary: "All 3 arch sets completed and clear-coated.",
  }).ok,
  true,
)

// Unchecked checklist item MUST reject approval
assert.equal(
  store.approveProductionJobFinishedWork(warehouseActor, archJob.id, {
    checklist: {
      fullQuantityFinished: true,
      matchesClientApprovedSpec: false,
      correctionsResolved: true,
    },
    notes: "Incomplete checklist",
  }).ok,
  false,
)

// Correction validation checks: non-responsible shift worker & intra-batch overlapping shifts must leave state untouched
const archBeforeRejectedCorr = store.readOperationsStore().fabricationJobs.find((j) => j.id === archJob.id)
const rejectedNonRespCorr = store.requestProductionJobCorrections(warehouseActor, {
  jobId: archJob.id,
  explanation: "Rework test targeting non-responsible shift worker.",
  responsibleCrewEmails: [jordanActor.email],
  additionalShifts: [
    {
      crewEmail: alexActor.email, // NOT in responsibleCrewEmails!
      startDateTime: "2026-10-03T08:00",
      endDateTime: "2026-10-03T11:00",
      breakMinutes: 0,
    },
  ],
})
assert.equal(rejectedNonRespCorr.ok, false)
const archAfterRejectedNonResp = store.readOperationsStore().fabricationJobs.find((j) => j.id === archJob.id)
assert.equal(archAfterRejectedNonResp.status, "Awaiting Verification")
assert.equal(archAfterRejectedNonResp.correctionRequests.length, archBeforeRejectedCorr.correctionRequests.length)
assert.equal(archAfterRejectedNonResp.assignments.length, archBeforeRejectedCorr.assignments.length)
assert.equal(archAfterRejectedNonResp.schedules.length, archBeforeRejectedCorr.schedules.length)

const rejectedBatchOverlapCorr = store.requestProductionJobCorrections(warehouseActor, {
  jobId: archJob.id,
  explanation: "Overlapping additional shifts in same correction batch.",
  responsibleCrewEmails: [jordanActor.email, alexActor.email],
  additionalShifts: [
    {
      crewEmail: jordanActor.email,
      startDateTime: "2026-10-03T08:00",
      endDateTime: "2026-10-03T12:00",
      breakMinutes: 0,
    },
    {
      crewEmail: jordanActor.email,
      startDateTime: "2026-10-03T11:00",
      endDateTime: "2026-10-03T14:00",
      breakMinutes: 0,
    },
  ],
})
assert.equal(rejectedBatchOverlapCorr.ok, false)
const archAfterBatchOverlap = store.readOperationsStore().fabricationJobs.find((j) => j.id === archJob.id)
assert.equal(archAfterBatchOverlap.correctionRequests.length, archBeforeRejectedCorr.correctionRequests.length)
assert.equal(archAfterBatchOverlap.assignments.length, archBeforeRejectedCorr.assignments.length)
assert.equal(archAfterBatchOverlap.schedules.length, archBeforeRejectedCorr.schedules.length)

// Request selective correction naming Jordan & Carlos with per-worker shifts (testing exact worker<->assignment link without last-assignment fallback)
assert.equal(
  store.requestProductionJobCorrections(warehouseActor, {
    jobId: archJob.id,
    explanation: "Apply second satin seal coat to Set 2 baseplate welds.",
    referencePhotoUrls: ["/event-manager-images/planning.jpg"],
    responsibleCrewEmails: [jordanActor.email, carlosActor.email],
    additionalShifts: [
      {
        crewEmail: jordanActor.email,
        startDateTime: "2026-10-03T08:00",
        endDateTime: "2026-10-03T12:00",
        breakMinutes: 0,
      },
      {
        crewEmail: carlosActor.email,
        startDateTime: "2026-10-03T13:00",
        endDateTime: "2026-10-03T16:00",
        breakMinutes: 0,
      },
    ],
  }).ok,
  true,
)
state = store.readOperationsStore()
const archAfterCorr = state.fabricationJobs.find((j) => j.id === archJob.id)
assert.equal(archAfterCorr.status, "In Production")
assert.equal(archAfterCorr.submissions.length, 1, "Round 1 submission history must be preserved")
assert.equal(
  archAfterCorr.assignments.find((a) => a.id === alexArchAsg.id).status,
  "Completed",
  "Unaffected worker's Completed status must be preserved",
)
const jordanCorrAsg = archAfterCorr.assignments.find(
  (a) => a.isCorrectionAssignment && a.crewEmail === jordanActor.email,
)
const carlosCorrAsg = archAfterCorr.assignments.find(
  (a) => a.isCorrectionAssignment && a.crewEmail === carlosActor.email,
)
assert.ok(jordanCorrAsg && carlosCorrAsg)
assert.equal(jordanCorrAsg.status, "Assigned", "Correction assignment must start Assigned until started")
assert.equal(carlosCorrAsg.status, "Assigned")
const jordanCorrShift = archAfterCorr.schedules.find(
  (s) => s.crewEmail === jordanActor.email && s.startDateTime === "2026-10-03T08:00",
)
const carlosCorrShift = archAfterCorr.schedules.find(
  (s) => s.crewEmail === carlosActor.email && s.startDateTime === "2026-10-03T13:00",
)
assert.equal(jordanCorrShift.assignmentId, jordanCorrAsg.id, "Jordan correction shift must link strictly to Jordan's assignment")
assert.equal(carlosCorrShift.assignmentId, carlosCorrAsg.id, "Carlos correction shift must link strictly to Carlos's assignment")

// Jordan starts correction assignment, logs hours, and resubmits -> returns to Awaiting Verification
assert.equal(
  store.startProductionWorkerAssignment(jordanActor, {
    jobId: archJob.id,
    assignmentId: jordanCorrAsg.id,
  }).ok,
  true,
)
assert.equal(
  store.submitProductionJobForVerification(jordanActor, {
    jobId: archJob.id,
    completedQty: 3,
    photoUrls: ["/event-manager-images/garden.jpg"],
    summary: "Round 2 rework complete: second satin seal coat applied to Set 2.",
  }).ok,
  true,
)
state = store.readOperationsStore()
const archResubmitted = state.fabricationJobs.find((j) => j.id === archJob.id)
assert.equal(archResubmitted.status, "Awaiting Verification")
assert.equal(archResubmitted.submissions.length, 2)
assert.equal(archResubmitted.submissions[1].isCorrectionResubmission, true)

// Approve archJob with all 3 checks -> Ready to Load + manifest line without duplicates
assert.equal(
  store.approveProductionJobFinishedWork(warehouseActor, archJob.id, {
    checklist: {
      fullQuantityFinished: true,
      matchesClientApprovedSpec: true,
      correctionsResolved: true,
    },
    notes: "Verified all 3 arch sets after Round 2 correction.",
  }).ok,
  true,
)

// Single-worker Individual podiumJob (Carlos): inherited lead (Jordan) CANNOT submit; Carlos submits
assert.equal(
  store.submitProductionJobForVerification(jordanActor, {
    jobId: podiumJob.id,
    completedQty: 1,
    photoUrls: ["/event-manager-images/planning.jpg"],
    summary: "Lead trying to submit Carlos's single-worker job",
  }).ok,
  false,
)
assert.equal(
  store.submitProductionJobForVerification(carlosActor, {
    jobId: podiumJob.id,
    completedQty: 1,
    photoUrls: ["/event-manager-images/planning.jpg"],
    summary: "Podium walnut finish and conduit complete.",
  }).ok,
  true,
)
// Verify Jordan's still-unreviewed archJob assignment was NOT auto-completed by archJob approval
state = store.readOperationsStore()
const archApproved = state.fabricationJobs.find((j) => j.id === archJob.id)
assert.equal(archApproved.status, "Ready to Load")
const jordanFabricationAsg = archApproved.assignments.find(
  (a) => a.crewEmail === jordanActor.email && a.activityType === "fabrication" && !a.isCorrectionAssignment,
)
assert.equal(
  jordanFabricationAsg.status,
  "Submitted",
  "Asset approval must never auto-complete unreviewed worker hours",
)

// ----------------------------------------------------------------------------
// 4. Dispatch & Returns: Routes, Manifest Distinct Quantities, Incidents & Closeout
// ----------------------------------------------------------------------------
console.log(
  "Phase 4.4: Dispatch & Returns routing, manifest loading/shortfall gates, incidents, closeout, and failed save retry...",
)
const dispRoute = store.resolveOperationsRoute("module-dispatch-returns?eventId=" + p4EventId + "&subView=transport")
assert.equal(dispRoute.moduleKey, "dispatch-returns")
assert.equal(dispRoute.impliedContext.subView, "transport")
const retRoute = store.resolveOperationsRoute("module-damage-assessment?eventId=" + p4EventId)
assert.equal(retRoute.moduleKey, "damage-missing-reports")
assert.equal(retRoute.impliedContext.subView, "incidents")

// Allocate stock, verify manifest has exact single arch line (planned 3), load & dispatch
store.allocateAllStockForEvent(p4EventId)
let manifest = store.getEventManifestLines(store.readOperationsStore(), p4EventId)
assert.equal(manifest.filter((l) => l.sourceId === "cust-p4-arch").length, 1)
assert.equal(manifest.find((l) => l.sourceId === "cust-p4-arch").plannedQty, 3)

// Partial load blocks Team Lead checklist & outbound departure
store.updateManifestLoadedQuantity(p4EventId, "cust-p4-arch", 2)
assert.equal(
  store.submitFinalLoadingChecklist(jordanActor, p4EventId, "Shortfall test").ok,
  false,
)
store.updateManifestLoadedQuantity(p4EventId, "cust-p4-arch", 3)
store.updateManifestLoadedQuantity(p4EventId, "evtast-0001", 10)
assert.equal(
  store.submitFinalLoadingChecklist(jordanActor, p4EventId, "Full quantity verified loaded.").ok,
  true,
)
// Verify loading NEVER populates returnedQty (no fictitious returns)
let manifestAfterLoad = store.getEventManifestLines(store.readOperationsStore(), p4EventId)
for (const l of manifestAfterLoad) {
  assert.equal(l.returnedQty, 0, "Loading checklist must not set returnedQty")
  assert.equal(l.returnCounted, false, "Loading checklist must leave items as Not counted yet")
}

// Non-Warehouse actor cannot confirm outbound departure
assert.equal(
  store.confirmOutboundDeparture(jordanActor, p4EventId, {
    vehiclePlate: "ABC-908",
    driverName: "D. Lim",
    notes: "Unauthorized actor",
  }).ok,
  false,
)

const invBeforeDeparture = store.readOperationsStore().inventory.find((i) => i.assetId === "evtast-0001")
const dispatchedBefore = invBeforeDeparture.dispatchedStock
const allocatedBefore = invBeforeDeparture.allocatedStock

assert.equal(
  store.confirmOutboundDeparture(warehouseActor, p4EventId, {
    vehiclePlate: "ABC-908",
    driverName: "D. Lim",
    notes: "Departed at 14:00",
  }).ok,
  true,
)
const invAfterFirstDeparture = store.readOperationsStore().inventory.find((i) => i.assetId === "evtast-0001")
assert.equal(invAfterFirstDeparture.dispatchedStock, dispatchedBefore + 10)
assert.equal(invAfterFirstDeparture.allocatedStock, allocatedBefore - 10)

// Repeated departure confirmation must be idempotent without re-updating inventory
const repeatDeparture = store.confirmOutboundDeparture(warehouseActor, p4EventId, {
  vehiclePlate: "ABC-908",
  driverName: "D. Lim",
  notes: "Retry click",
})
assert.equal(repeatDeparture.ok, true)
assert.equal(repeatDeparture.alreadyConfirmed, true)
const invAfterRepeatDeparture = store.readOperationsStore().inventory.find((i) => i.assetId === "evtast-0001")
assert.equal(invAfterRepeatDeparture.dispatchedStock, dispatchedBefore + 10, "Repeat departure must not re-increment dispatchedStock")
assert.equal(invAfterRepeatDeparture.allocatedStock, allocatedBefore - 10, "Repeat departure must not re-decrement allocatedStock")

// Venue Arrival + Warehouse Arrival
assert.equal(
  store.submitArrivalCheckpoint(jordanActor, {
    eventId: p4EventId,
    checkpoint: "Venue Arrival",
    photoUrl: "/event-manager-images/garden.jpg",
    notes: "Arrived at Ayala Museum",
  }).ok,
  true,
)
assert.equal(
  store.submitArrivalCheckpoint(jordanActor, {
    eventId: p4EventId,
    checkpoint: "Warehouse Arrival",
    photoUrl: "/event-manager-images/planning.jpg",
    notes: "Returned to Warehouse",
  }).ok,
  true,
)

// Submitting Return Checklist while items remain "Not counted yet" must fail
assert.equal(
  store.submitFinalReturnChecklist(jordanActor, p4EventId, "Uncounted checklist").ok,
  false,
)

// Confirmed 0 return on evtast-0001 is distinct from uncounted cust-p4-arch
store.updateManifestReturnedQuantity(p4EventId, "evtast-0001", 0)
let manifestWithZeroCount = store.getEventManifestLines(store.readOperationsStore(), p4EventId)
assert.equal(manifestWithZeroCount.find((l) => l.sourceId === "evtast-0001").returnCounted, true)
assert.equal(manifestWithZeroCount.find((l) => l.sourceId === "evtast-0001").returnedQty, 0)
assert.equal(manifestWithZeroCount.find((l) => l.sourceId === "cust-p4-arch").returnCounted, false)
assert.equal(
  store.submitFinalReturnChecklist(jordanActor, p4EventId, "Still missing cust-p4-arch count").ok,
  false,
)

// Record return counts for BOTH items (evtast-0001 = 8 -> 2 missing; cust-p4-arch = 3 -> full return)
store.updateManifestReturnedQuantity(p4EventId, "evtast-0001", 8)
store.updateManifestReturnedQuantity(p4EventId, "cust-p4-arch", 3)
const retChecklist = store.submitFinalReturnChecklist(jordanActor, p4EventId, "2 bouquets missing.")
assert.equal(retChecklist.ok, true)
assert.equal(retChecklist.autoCreatedMissingReports, 1)

// Closeout blocked while incident is Pending
assert.equal(
  store.closeWarehouseEventAccountability(warehouseActor, p4EventId, "Premature closeout").ok,
  false,
)

// Resolve incident -> still blocked until direct-to-venue rental return is recorded
state = store.readOperationsStore()
const missingReport = state.incidentReports.find((r) => r.eventId === p4EventId)
assert.ok(missingReport)
assert.equal(
  store.resolveFieldIncidentReport(warehouseActor, missingReport.id, {
    resolutionType: "Charged to Client",
    resolutionNotes: "Invoiced 2 damaged floral bouquets per post-event sign-off.",
  }).ok,
  true,
)
assert.equal(
  store.closeWarehouseEventAccountability(warehouseActor, p4EventId, "Premature closeout before rental handback").ok,
  false,
)

assert.equal(
  store.recordDirectVenueRentalReturn(jordanActor, {
    eventId: p4EventId,
    rentalId: "rnt-p4-1",
    handedBackQty: 6,
    missingQty: 0,
    damagedQty: 0,
    discrepancyNotes: "",
  }).ok,
  true,
)

assert.equal(
  store.closeWarehouseEventAccountability(warehouseActor, p4EventId, "All items reconciled and closed.").ok,
  true,
)
state = store.readOperationsStore()
const closedOrder = state.orderRequests.find((o) => o.eventId === p4EventId)
assert.equal(closedOrder?.warehouseClosed, true)

// Legacy historical return preservation + uncertain legacy 0 migration flag + closeout block
const legReturnSnapshot = store.readOperationsStore()
legReturnSnapshot.orderRequests.push({
  ...closedOrder,
  id: "ORD-LEG-RET",
  eventId: "evt-legacy-ret",
  eventTitle: "Legacy Historical Return Event",
  warehouseClosed: false,
  closedAt: undefined,
  closedByEmail: undefined,
  closedByName: undefined,
  returnChecklist: {
    submittedByEmail: jordanActor.email,
    submittedByName: jordanActor.name,
    submittedAt: "2026-04-01T10:00:00.000Z",
    notes: "Legacy return checklist.",
  },
  rentals: [],
  stockLines: [
    {
      assetId: "evtast-0001",
      assetCode: "AST-0001",
      name: "Historical Counted Asset",
      category: "Florals",
      image: "/event-manager-images/garden.jpg",
      unit: "piece",
      approvedRequestedQty: 5,
      allocatedQty: 5,
      deficitQty: 0,
      releasedForLoadQty: 5,
      loadedQty: 5,
      loadingVerified: true,
      returnedQty: 5, // Legacy historical count preserved
    },
    {
      assetId: "evtast-0010",
      assetCode: "AST-0010",
      name: "Uncertain Legacy Zero Asset",
      category: "Seating",
      image: "/event-manager-images/planning.jpg",
      unit: "piece",
      approvedRequestedQty: 4,
      allocatedQty: 4,
      deficitQty: 0,
      releasedForLoadQty: 4,
      loadedQty: 4,
      loadingVerified: true,
      returnedQty: 0, // Pre-fix 0 without returnCounted on post-return order!
    },
  ],
})
const migratedRet = store.migrateOperationsStore(legReturnSnapshot)
const migLegOrder = migratedRet.orderRequests.find((o) => o.eventId === "evt-legacy-ret")
const preservedLine = migLegOrder.stockLines.find((s) => s.assetId === "evtast-0001")
const uncertainLine = migLegOrder.stockLines.find((s) => s.assetId === "evtast-0010")
assert.equal(preservedLine.returnedQty, 5, "Existing historical return record must be preserved")
assert.equal(preservedLine.returnCounted, true)
assert.equal(uncertainLine.returnedQty, 0, "Uncertain legacy count must not be silently rewritten")
assert.equal(uncertainLine.legacyReturnUncertain, true, "Uncertain legacy 0 return must be flagged")

// Verify uncertain return blocks closeout until explicitly counted
store.writeOperationsStore(migratedRet)
assert.equal(
  store.closeWarehouseEventAccountability(warehouseActor, "evt-legacy-ret", "Attempt premature close").ok,
  false,
)
assert.equal(
  store.updateManifestReturnedQuantity("evt-legacy-ret", "evtast-0010", 4).ok,
  true,
)
// Updating return count invalidated the stale legacy checklist -> require fresh Team Lead submission before closeout
assert.equal(
  store.closeWarehouseEventAccountability(warehouseActor, "evt-legacy-ret", "Without fresh checklist").ok,
  false,
)
assert.equal(
  store.submitFinalReturnChecklist(jordanActor, "evt-legacy-ret", "Verified 4 returned").ok,
  true,
)
assert.equal(
  store.closeWarehouseEventAccountability(warehouseActor, "evt-legacy-ret", "Verified legacy count").ok,
  true,
)

// Verify Failed Local Save + Persistence Warning + Retry across Phase 4 operations
const persistedBeforeFail = localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)
failLocalStorageWrites = true
const planDuringFailure = store.confirmProductionJobWindowAndEstimate(warehouseActor, {
  jobId: plinthJob.id,
  startDate: "2026-10-01",
  deadlineDate: "2026-10-04",
  availableProductionDays: 3,
  estimatedHoursPerUnitOrSet: 7,
  estimateBasis: "per-unit",
})
assert.equal(planDuringFailure.ok, true)
assert.equal(planDuringFailure.savedToStorage, false, "Failed save must report savedToStorage: false")
assert.equal(
  store.getOperationsPersistenceWarning(),
  "Not saved—changes may be lost on refresh.",
)
assert.equal(
  localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY),
  persistedBeforeFail,
  "Previously saved records in localStorage must remain intact during failed save",
)
assert.equal(
  store.readOperationsStore().fabricationJobs.find((j) => j.id === plinthJob.id)
    .estimatedHoursPerUnitOrSet,
  7,
  "Pending changes must remain available in memory during failed save",
)

// Retry fails while storage throws, then succeeds once storage recovers
assert.equal(store.retryPersistOperationsStore().ok, false)
failLocalStorageWrites = false
assert.equal(store.retryPersistOperationsStore().ok, true)
assert.equal(store.getOperationsPersistenceWarning(), null)
assert.equal(
  JSON.parse(localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)).fabricationJobs.find(
    (j) => j.id === plinthJob.id,
  ).estimatedHoursPerUnitOrSet,
  7,
  "Retry must persist pending changes into localStorage",
)

console.log(
  "Phase 4.5: Missing-item inventory reconciliation, write-off vs recovery, and idempotent closeout...",
)
const { v51ContractApis } = await import("../src/operations/apiClients.ts")
let closeApiCalls = 0
let resolveApiCalls = 0
let checklistApiCalls = 0
const origCloseApi = v51ContractApis.closeWarehouseEvent
const origResolveApi = v51ContractApis.resolveIncidentReport
const origChecklistApi = v51ContractApis.submitReturnChecklist
v51ContractApis.closeWarehouseEvent = (...args) => {
  closeApiCalls += 1
  return origCloseApi(...args)
}
v51ContractApis.resolveIncidentReport = (...args) => {
  resolveApiCalls += 1
  return origResolveApi(...args)
}
v51ContractApis.submitReturnChecklist = (...args) => {
  checklistApiCalls += 1
  return origChecklistApi(...args)
}

try {
  // Helper: create a clean 10-unit inventory asset for exact reconciliation math
  const mkAsset = (codeSuffix) => {
    const res = store.createWarehouseInventoryItem({
      name: `Reconciliation Asset ${codeSuffix}`,
      category: "Seating",
      stock: 10,
      availableStock: 10,
      image: "/event-manager-images/planning.jpg",
    })
    assert.equal(res.ok, true)
    return res.item
  }

  // Case 1: Automatic shortage (10 total, 10 dispatched, 8 returned) -> Approved Write-off -> closeout -> availableStock = 8 (totalStock stays 10)
  const itemA = mkAsset("WriteOff")
  const snap1 = store.readOperationsStore()
  const baseOrder = snap1.orderRequests.find((o) => o.eventId === p4EventId)
  const makeReturnReadyOrder = (eventId, item, loadedQty) => ({
    ...baseOrder,
    id: `ORD-${eventId}`,
    eventId,
    eventTitle: `Event ${eventId}`,
    warehouseClosed: false,
    closedAt: undefined,
    closedByEmail: undefined,
    closedByName: undefined,
    closeoutNotes: undefined,
    returnChecklist: undefined,
    rentals: [],
    warehouseArrival: {
      checkpoint: "Warehouse Arrival",
      photoUrl: "/event-manager-images/planning.jpg",
      notes: "Arrived",
      submittedByEmail: jordanActor.email,
      submittedByName: jordanActor.name,
      submittedAt: new Date().toISOString(),
    },
    stockLines: [
      {
        assetId: item.assetId,
        assetCode: item.assetCode,
        name: item.name,
        category: item.category,
        image: item.image,
        unit: item.unit,
        approvedRequestedQty: loadedQty,
        allocatedQty: loadedQty,
        deficitQty: 0,
        releasedForLoadQty: loadedQty,
        loadedQty,
        loadingVerified: true,
        returnedQty: 0,
        returnCounted: false,
      },
    ],
  })

  snap1.orderRequests.push(makeReturnReadyOrder("evt-recon-wo", itemA, 10))
  const invASet = snap1.inventory.find((i) => i.assetId === itemA.assetId)
  invASet.allocatedStock = 0
  invASet.dispatchedStock = 10
  invASet.availableStock = 0
  store.writeOperationsStore(snap1)

  store.updateManifestReturnedQuantity("evt-recon-wo", itemA.assetId, 8)
  const chkCallsBefore = checklistApiCalls
  const ret1 = store.submitFinalReturnChecklist(jordanActor, "evt-recon-wo", "8 returned, 2 missing")
  assert.equal(ret1.ok, true)
  assert.equal(ret1.autoCreatedMissingReports, 1)
  assert.equal(checklistApiCalls, chkCallsBefore + 1)

  // Missing count must increment immediately on auto-created Missing report
  let invA = store.readOperationsStore().inventory.find((i) => i.assetId === itemA.assetId)
  assert.equal(invA.missingCount, 2, "Auto missing report must update inventory.missingCount = 2")
  assert.equal(invA.totalStock, 10)

  // Repeated return checklist submission must NOT double-create report, re-increment missingCount, or re-call API
  const ret1Repeat = store.submitFinalReturnChecklist(jordanActor, "evt-recon-wo", "Repeat submit")
  assert.equal(ret1Repeat.ok, true)
  assert.equal(ret1Repeat.autoCreatedMissingReports, 0)
  assert.equal(checklistApiCalls, chkCallsBefore + 1)
  invA = store.readOperationsStore().inventory.find((i) => i.assetId === itemA.assetId)
  assert.equal(invA.missingCount, 2)

  // Resolve Approved Write-off -> totalStock stays 10, missingCount stays 2 -> closeout -> availableStock MUST BE 8
  const woRep = store.readOperationsStore().incidentReports.find((r) => r.eventId === "evt-recon-wo")
  assert.ok(woRep)
  const resCallsBefore = resolveApiCalls
  assert.equal(
    store.resolveFieldIncidentReport(warehouseActor, woRep.id, {
      resolutionType: "Approved Write-off",
      resolutionNotes: "Confirmed 2 lost in field.",
    }).ok,
    true,
  )
  assert.equal(resolveApiCalls, resCallsBefore + 1)
  // Repeat resolution must be idempotent
  const repeatRes = store.resolveFieldIncidentReport(warehouseActor, woRep.id, {
    resolutionType: "Recovered",
    resolutionNotes: "Duplicate resolution click",
  })
  assert.equal(repeatRes.ok, true)
  assert.equal(repeatRes.alreadyResolved, true)
  assert.equal(resolveApiCalls, resCallsBefore + 1)

  assert.equal(store.closeWarehouseEventAccountability(warehouseActor, "evt-recon-wo", "Closed with write-off").ok, true)
  invA = store.readOperationsStore().inventory.find((i) => i.assetId === itemA.assetId)
  assert.equal(invA.totalStock, 10, "Do not reduce totalStock on write-off while keeping missingCount")
  assert.equal(invA.missingCount, 2)
  assert.equal(invA.dispatchedStock, 0)
  assert.equal(invA.availableStock, 8, "After write-off & closeout, availableStock must be 8, not 10")

  // Case 2: Existing manual missing report followed by return checklist -> NO double counting
  const itemB = mkAsset("ManualFirst")
  const snap2 = store.readOperationsStore()
  snap2.orderRequests.push(makeReturnReadyOrder("evt-recon-manual", itemB, 10))
  const invBSet = snap2.inventory.find((i) => i.assetId === itemB.assetId)
  invBSet.dispatchedStock = 10
  invBSet.availableStock = 0
  store.writeOperationsStore(snap2)

  assert.equal(
    store.submitFieldIncidentReport(jordanActor, {
      eventId: "evt-recon-manual",
      reportType: "Missing",
      checkpoint: "Event Hours",
      itemCode: itemB.assetCode,
      itemName: itemB.name,
      quantity: 2,
      description: "2 lost during event hours.",
      photoUrl: "/event-manager-images/planning.jpg",
    }).ok,
    true,
  )
  let invB = store.readOperationsStore().inventory.find((i) => i.assetId === itemB.assetId)
  assert.equal(invB.missingCount, 2)
  store.updateManifestReturnedQuantity("evt-recon-manual", itemB.assetId, 8)
  const retMan = store.submitFinalReturnChecklist(jordanActor, "evt-recon-manual", "8 returned after manual report")
  assert.equal(retMan.ok, true)
  assert.equal(retMan.autoCreatedMissingReports, 0, "Manual missing report must prevent duplicate auto report")
  invB = store.readOperationsStore().inventory.find((i) => i.assetId === itemB.assetId)
  assert.equal(invB.missingCount, 2, "Manual + return checklist must NOT double-count missingCount")
  const manRep = store.readOperationsStore().incidentReports.find((r) => r.eventId === "evt-recon-manual")
  assert.equal(
    store.resolveFieldIncidentReport(warehouseActor, manRep.id, {
      resolutionType: "Charged to Client",
      resolutionNotes: "Client billed for 2 lost units.",
    }).ok,
    true,
  )
  assert.equal(store.closeWarehouseEventAccountability(warehouseActor, "evt-recon-manual", "Closed").ok, true)
  invB = store.readOperationsStore().inventory.find((i) => i.assetId === itemB.assetId)
  assert.equal(invB.availableStock, 8)

  // Case 3: Physical Recovery before closeout -> missingCount returns to 0, return count reconciles to 10, closeout yields availableStock = 10
  const itemC = mkAsset("Recovered")
  const snap3 = store.readOperationsStore()
  snap3.orderRequests.push(makeReturnReadyOrder("evt-recon-rec", itemC, 10))
  const invCSet = snap3.inventory.find((i) => i.assetId === itemC.assetId)
  invCSet.dispatchedStock = 10
  invCSet.availableStock = 0
  store.writeOperationsStore(snap3)

  store.updateManifestReturnedQuantity("evt-recon-rec", itemC.assetId, 8)
  assert.equal(store.submitFinalReturnChecklist(jordanActor, "evt-recon-rec", "Initial 8 count").autoCreatedMissingReports, 1)
  let invC = store.readOperationsStore().inventory.find((i) => i.assetId === itemC.assetId)
  assert.equal(invC.missingCount, 2)
  const recRep = store.readOperationsStore().incidentReports.find((r) => r.eventId === "evt-recon-rec")
  assert.equal(
    store.resolveFieldIncidentReport(warehouseActor, recRep.id, {
      resolutionType: "Recovered",
      resolutionNotes: "Both missing units found in backstage crate and returned to shelf.",
    }).ok,
    true,
  )
  invC = store.readOperationsStore().inventory.find((i) => i.assetId === itemC.assetId)
  assert.equal(invC.missingCount, 0, "Recovered incident must clear missingCount")
  const recLine = store
    .readOperationsStore()
    .orderRequests.find((o) => o.eventId === "evt-recon-rec")
    .stockLines.find((s) => s.assetId === itemC.assetId)
  assert.equal(recLine.returnedQty, 10, "Recovered items must reconcile return count to 10")
  assert.equal(store.closeWarehouseEventAccountability(warehouseActor, "evt-recon-rec", "All 10 recovered").ok, true)
  invC = store.readOperationsStore().inventory.find((i) => i.assetId === itemC.assetId)
  assert.equal(invC.availableStock, 10, "Recovered items must bring final availableStock to 10")

  // Case 4: Multi-event closeout idempotence (Event A = 5 dispatched, Event B = 5 dispatched)
  const itemD = mkAsset("IdempotentMulti")
  const snap4 = store.readOperationsStore()
  snap4.orderRequests.push(makeReturnReadyOrder("evt-multi-a", itemD, 5))
  snap4.orderRequests.push(makeReturnReadyOrder("evt-multi-b", itemD, 5))
  const invDSet = snap4.inventory.find((i) => i.assetId === itemD.assetId)
  invDSet.dispatchedStock = 10
  invDSet.availableStock = 0
  store.writeOperationsStore(snap4)

  store.updateManifestReturnedQuantity("evt-multi-a", itemD.assetId, 5)
  assert.equal(store.submitFinalReturnChecklist(jordanActor, "evt-multi-a", "Event A full 5 returned").ok, true)

  const closeCallsBeforeMulti = closeApiCalls
  const firstCloseA = store.closeWarehouseEventAccountability(warehouseActor, "evt-multi-a", "Original Event A closeout")
  assert.equal(firstCloseA.ok, true)
  assert.equal(firstCloseA.alreadyClosed, false)
  assert.equal(closeApiCalls, closeCallsBeforeMulti + 1)

  let invD = store.readOperationsStore().inventory.find((i) => i.assetId === itemD.assetId)
  assert.equal(invD.dispatchedStock, 5, "Closing Event A must leave Event B's 5 dispatched units intact")
  assert.equal(invD.availableStock, 5)
  const origCloseMeta = store.readOperationsStore().orderRequests.find((o) => o.eventId === "evt-multi-a")

  // Repeat closeout with a different Warehouse user & different notes -> idempotent, preserves metadata, zero API/inventory side effects!
  const repeatCloseA = store.closeWarehouseEventAccountability(
    { name: "Second Ops Manager", email: "ops2@demo.com", role: "Warehouse Operations Manager" },
    "evt-multi-a",
    "Should NOT overwrite or deduct Event B",
  )
  assert.equal(repeatCloseA.ok, true)
  assert.equal(repeatCloseA.alreadyClosed, true)
  assert.equal(closeApiCalls, closeCallsBeforeMulti + 1, "Repeat closeout must not re-invoke closeWarehouseEvent API")

  invD = store.readOperationsStore().inventory.find((i) => i.assetId === itemD.assetId)
  assert.equal(invD.dispatchedStock, 5, "Repeat closeout of Event A must leave Event B's 5 dispatched units intact")
  assert.equal(invD.availableStock, 5)
  const metaAfterRepeat = store.readOperationsStore().orderRequests.find((o) => o.eventId === "evt-multi-a")
  assert.equal(metaAfterRepeat.closedByEmail, origCloseMeta.closedByEmail)
  assert.equal(metaAfterRepeat.closedByName, origCloseMeta.closedByName)
  assert.equal(metaAfterRepeat.closedAt, origCloseMeta.closedAt)
  assert.equal(metaAfterRepeat.closeoutNotes, "Original Event A closeout")
} finally {
  v51ContractApis.closeWarehouseEvent = origCloseApi
  v51ContractApis.resolveIncidentReport = origResolveApi
  v51ContractApis.submitReturnChecklist = origChecklistApi
}

console.log(
  "Phase 4.6: 6-defect regression pass (checklist invalidation, closed immutability, no incident double-deduction, frozen departure counts, legacy recovery isolation, correction state guards)...",
)

// 4.6.1 & 4.6.2: Return checklist invalidation on changed count, preservation on unchanged count, decreased shortage reconciliation, and post-closeout immutability
{
  const invRes = store.createWarehouseInventoryItem({
    name: "Checklist Invalidation Chair",
    category: "Seating",
    stock: 10,
    availableStock: 10,
    image: "/event-manager-images/planning.jpg",
  })
  assert.equal(invRes.ok, true)
  const item = invRes.item

  const snap = store.readOperationsStore()
  const baseOrder = snap.orderRequests.find((o) => o.eventId === p4EventId)
  snap.orderRequests.push({
    ...baseOrder,
    id: "ORD-DEF1",
    eventId: "evt-def1",
    eventTitle: "Defect 1 & 2 Event",
    warehouseClosed: false,
    closedAt: undefined,
    closedByEmail: undefined,
    closedByName: undefined,
    closeoutNotes: undefined,
    returnChecklist: undefined,
    returnChecklistHistory: [],
    rentals: [],
    outboundDeparture: {
      confirmedByEmail: warehouseActor.email,
      confirmedByName: warehouseActor.name,
      confirmedAt: new Date().toISOString(),
      vehiclePlate: "DEF-001",
      driverName: "Driver",
      notes: "Departed",
    },
    warehouseArrival: {
      checkpoint: "Warehouse Arrival",
      photoUrl: "/event-manager-images/planning.jpg",
      notes: "Arrived",
      submittedByEmail: jordanActor.email,
      submittedByName: jordanActor.name,
      submittedAt: new Date().toISOString(),
    },
    stockLines: [
      {
        assetId: item.assetId,
        assetCode: item.assetCode,
        name: item.name,
        category: item.category,
        image: item.image,
        unit: item.unit,
        approvedRequestedQty: 10,
        allocatedQty: 10,
        deficitQty: 0,
        releasedForLoadQty: 10,
        loadedQty: 10,
        loadingVerified: true,
        returnedQty: 0,
        returnCounted: false,
      },
    ],
  })
  const invEntry = snap.inventory.find((i) => i.assetId === item.assetId)
  invEntry.dispatchedStock = 10
  invEntry.availableStock = 0
  store.writeOperationsStore(snap)

  // Defect 4: Loaded quantity cannot change after departure
  assert.equal(
    store.updateManifestLoadedQuantity("evt-def1", item.assetId, 1).ok,
    false,
    "Loaded quantity must be frozen after outboundDeparture",
  )
  assert.equal(
    store.readOperationsStore().orderRequests.find((o) => o.eventId === "evt-def1").stockLines[0].loadedQty,
    10,
  )

  // Record 10 returned -> submit checklist
  assert.equal(store.updateManifestReturnedQuantity("evt-def1", item.assetId, 10).ok, true)
  assert.equal(store.submitFinalReturnChecklist(jordanActor, "evt-def1", "All 10 returned").ok, true)

  // Unchanged count (10 -> 10) must NOT invalidate checklist
  assert.equal(store.updateManifestReturnedQuantity("evt-def1", item.assetId, 10).ok, true)
  assert.ok(
    store.readOperationsStore().orderRequests.find((o) => o.eventId === "evt-def1").returnChecklist,
    "Unchanged return count must preserve valid returnChecklist",
  )

  // Changed count (10 -> 8) MUST invalidate checklist, archive prior submission, and block closeout
  assert.equal(store.updateManifestReturnedQuantity("evt-def1", item.assetId, 8).ok, true)
  const ordAfterEdit = store.readOperationsStore().orderRequests.find((o) => o.eventId === "evt-def1")
  assert.equal(ordAfterEdit.returnChecklist, undefined, "Return count edit must invalidate previous sign-off")
  assert.equal(ordAfterEdit.returnChecklistHistory.length, 1, "Prior checklist submission must be archived")
  assert.equal(
    store.closeWarehouseEventAccountability(warehouseActor, "evt-def1", "Stale close").ok,
    false,
    "Closeout must fail after return count invalidated previous checklist",
  )

  // Resubmit checklist -> creates Missing report for 2; then reduce shortage 8 -> 9 and resubmit -> reconciles without duplicates
  assert.equal(store.submitFinalReturnChecklist(jordanActor, "evt-def1", "8 returned, 2 missing").autoCreatedMissingReports, 1)
  assert.equal(store.readOperationsStore().inventory.find((i) => i.assetId === item.assetId).missingCount, 2)
  assert.equal(store.updateManifestReturnedQuantity("evt-def1", item.assetId, 9).ok, true)
  const resAfter9 = store.submitFinalReturnChecklist(jordanActor, "evt-def1", "9 returned, 1 missing")
  assert.equal(resAfter9.ok, true)
  assert.equal(resAfter9.autoCreatedMissingReports, 0)
  assert.equal(store.readOperationsStore().inventory.find((i) => i.assetId === item.assetId).missingCount, 1)
  const activeDef1Missing = store
    .readOperationsStore()
    .incidentReports.filter((r) => r.eventId === "evt-def1" && r.reportType === "Missing" && r.resolutionType !== "Recovered")
  assert.equal(activeDef1Missing.length, 1)
  assert.equal(activeDef1Missing[0].quantity, 1)

  // Resolve and close -> then return count edits MUST be rejected
  assert.equal(
    store.resolveFieldIncidentReport(warehouseActor, activeDef1Missing[0].id, {
      resolutionType: "Approved Write-off",
      resolutionNotes: "1 unit written off.",
    }).ok,
    true,
  )
  assert.equal(store.closeWarehouseEventAccountability(warehouseActor, "evt-def1", "Closed with 1 write-off").ok, true)
  assert.equal(store.readOperationsStore().inventory.find((i) => i.assetId === item.assetId).availableStock, 9)
  assert.equal(
    store.updateManifestReturnedQuantity("evt-def1", item.assetId, 5).ok,
    false,
    "Return count edits must be rejected after warehouseClosed",
  )
  assert.equal(
    store.readOperationsStore().orderRequests.find((o) => o.eventId === "evt-def1").stockLines[0].returnedQty,
    9,
  )
}

// 4.6.3: No double deduction of dispatched incidents across multiple concurrent events
{
  const invRes = store.createWarehouseInventoryItem({
    name: "Multi-Event Dispatched Vase",
    category: "Vessels",
    stock: 20,
    availableStock: 20,
    image: "/event-manager-images/planning.jpg",
  })
  assert.equal(invRes.ok, true)
  const item = invRes.item

  const snap = store.readOperationsStore()
  const baseOrder = snap.orderRequests.find((o) => o.eventId === p4EventId)
  const mkOpenDispatched = (eventId, qty) => ({
    ...baseOrder,
    id: `ORD-${eventId}`,
    eventId,
    eventTitle: `Event ${eventId}`,
    warehouseClosed: false,
    closedAt: undefined,
    closedByEmail: undefined,
    closedByName: undefined,
    closeoutNotes: undefined,
    returnChecklist: undefined,
    returnChecklistHistory: [],
    rentals: [],
    outboundDeparture: {
      confirmedByEmail: warehouseActor.email,
      confirmedByName: warehouseActor.name,
      confirmedAt: new Date().toISOString(),
      vehiclePlate: "TRK-10",
      driverName: "Driver",
      notes: "Departed",
    },
    warehouseArrival: {
      checkpoint: "Warehouse Arrival",
      photoUrl: "/event-manager-images/planning.jpg",
      notes: "Arrived",
      submittedByEmail: jordanActor.email,
      submittedByName: jordanActor.name,
      submittedAt: new Date().toISOString(),
    },
    stockLines: [
      {
        assetId: item.assetId,
        assetCode: item.assetCode,
        name: item.name,
        category: item.category,
        image: item.image,
        unit: item.unit,
        approvedRequestedQty: qty,
        allocatedQty: qty,
        deficitQty: 0,
        releasedForLoadQty: qty,
        loadedQty: qty,
        loadingVerified: true,
        returnedQty: 0,
        returnCounted: false,
      },
    ],
  })
  snap.orderRequests.push(mkOpenDispatched("evt-nodbl-a", 10))
  snap.orderRequests.push(mkOpenDispatched("evt-nodbl-b", 5))
  const invEntry = snap.inventory.find((i) => i.assetId === item.assetId)
  invEntry.dispatchedStock = 15 // 10 on Event A + 5 on Event B; 5 sitting available in warehouse
  invEntry.availableStock = 5
  store.writeOperationsStore(snap)

  // Report 2 of Event A's dispatched units Missing -> warehouse's 5 available units MUST stay 5!
  const manualRep = store.submitFieldIncidentReport(jordanActor, {
    eventId: "evt-nodbl-a",
    reportType: "Missing",
    checkpoint: "Event Hours",
    itemCode: item.assetCode,
    itemName: item.name,
    quantity: 2,
    description: "2 lost on Event A",
    photoUrl: "/event-manager-images/planning.jpg",
  })
  assert.equal(manualRep.ok, true)
  let invNow = store.readOperationsStore().inventory.find((i) => i.assetId === item.assetId)
  assert.equal(invNow.missingCount, 2)
  assert.equal(invNow.dispatchedStock, 13, "2 missing transferred out of Event A's dispatchedStock (15 -> 13)")
  assert.equal(invNow.availableStock, 5, "Reporting dispatched units missing must NOT consume unrelated warehouse availability")

  // Event A returns 8 -> submit checklist (0 new reports), write off 2, close A -> Event B's 5 remain dispatched, available = 5 + 8 = 13!
  store.updateManifestReturnedQuantity("evt-nodbl-a", item.assetId, 8)
  const chkA = store.submitFinalReturnChecklist(jordanActor, "evt-nodbl-a", "8 returned")
  assert.equal(chkA.ok, true)
  assert.equal(chkA.autoCreatedMissingReports, 0)
  assert.equal(
    store.resolveFieldIncidentReport(warehouseActor, manualRep.report.id, {
      resolutionType: "Approved Write-off",
      resolutionNotes: "Written off.",
    }).ok,
    true,
  )
  assert.equal(store.closeWarehouseEventAccountability(warehouseActor, "evt-nodbl-a", "Closed Event A").ok, true)
  invNow = store.readOperationsStore().inventory.find((i) => i.assetId === item.assetId)
  assert.equal(invNow.dispatchedStock, 5, "Event B's 5 dispatched units must stay untouched")
  assert.equal(invNow.missingCount, 2)
  assert.equal(invNow.availableStock, 13, "20 total - 5 Event B dispatched - 2 missing = 13 available")
}

// 4.6.5: Legacy untracked incident recovery must NOT reverse another event's missingCount
{
  const invRes = store.createWarehouseInventoryItem({
    name: "Legacy Recovery Isolation Candle",
    category: "Candles",
    stock: 10,
    availableStock: 8,
    image: "/event-manager-images/planning.jpg",
  })
  assert.equal(invRes.ok, true)
  const item = invRes.item

  const snap = store.readOperationsStore()
  const invEntry = snap.inventory.find((i) => i.assetId === item.assetId)
  invEntry.missingCount = 2 // Attributable to another event!
  invEntry.availableStock = 8
  snap.incidentReports.unshift({
    id: "INC-LEG-UNTRACKED",
    eventId: "evt-leg-other",
    eventTitle: "Legacy Untracked Event",
    reportType: "Missing",
    checkpoint: "Warehouse Arrival",
    itemCode: item.assetCode,
    itemName: item.name,
    quantity: 2,
    description: "Old pre-fix auto report without inventoryAdjustedQty",
    photoUrl: "/event-manager-images/planning.jpg",
    submittedByEmail: jordanActor.email,
    submittedByName: jordanActor.name,
    submittedAt: "2026-03-01T10:00:00.000Z",
    resolutionStatus: "Pending",
  })
  const migratedLeg = store.migrateOperationsStore(snap)
  const legRepMig = migratedLeg.incidentReports.find((r) => r.id === "INC-LEG-UNTRACKED")
  assert.equal(legRepMig.inventoryAdjustedQty, undefined, "Migration must not fabricate inventoryAdjustedQty")
  assert.equal(legRepMig.legacyInventoryAttribution, "uncertain")
  store.writeOperationsStore(migratedLeg)

  assert.equal(
    store.resolveFieldIncidentReport(warehouseActor, "INC-LEG-UNTRACKED", {
      resolutionType: "Recovered",
      resolutionNotes: "Recovered legacy incident.",
    }).ok,
    true,
  )
  const afterLegRec = store.readOperationsStore()
  assert.equal(
    afterLegRec.inventory.find((i) => i.assetId === item.assetId).missingCount,
    2,
    "Recovering untracked legacy incident must NOT reverse another event's missingCount",
  )
  assert.equal(
    afterLegRec.incidentReports.find((r) => r.id === "INC-LEG-UNTRACKED").needsWarehouseInventoryReconciliation,
    true,
  )

  // Attach an open return-ready order for evt-leg-other to verify closeout is BLOCKED while needsWarehouseInventoryReconciliation is true
  const baseOrder = afterLegRec.orderRequests.find((o) => o.eventId === p4EventId)
  afterLegRec.orderRequests.push({
    ...baseOrder,
    id: "ORD-LEG-OTHER",
    eventId: "evt-leg-other",
    eventTitle: "Legacy Untracked Event",
    warehouseClosed: false,
    closedAt: undefined,
    closedByEmail: undefined,
    closedByName: undefined,
    closeoutNotes: undefined,
    rentals: [],
    returnChecklist: {
      submittedByEmail: jordanActor.email,
      submittedByName: jordanActor.name,
      submittedAt: "2026-03-01T12:00:00.000Z",
      notes: "Legacy return checklist.",
    },
    stockLines: [
      {
        assetId: item.assetId,
        assetCode: item.assetCode,
        name: item.name,
        category: item.category,
        image: item.image,
        unit: item.unit,
        approvedRequestedQty: 4,
        allocatedQty: 4,
        deficitQty: 0,
        releasedForLoadQty: 4,
        loadedQty: 4,
        loadingVerified: true,
        returnedQty: 4,
        returnCounted: true,
      },
    ],
  })
  store.writeOperationsStore(afterLegRec)

  const blockedClose = store.closeWarehouseEventAccountability(
    warehouseActor,
    "evt-leg-other",
    "Premature close before reconciliation",
  )
  assert.equal(blockedClose.ok, false, "Resolved incident with needsWarehouseInventoryReconciliation must block closeout")
  assert.ok(blockedClose.error.includes("reconciliation"))

  // Reject non-Warehouse actor, missing reason, invalid quantities, and "attribution-still-uncertain"
  assert.equal(
    store.reconcileLegacyIncidentInventory(jordanActor, "INC-LEG-UNTRACKED", {
      decision: "no-adjustment-required",
      reason: "Unauthorized crew attempt",
    }).ok,
    false,
  )
  assert.equal(
    store.reconcileLegacyIncidentInventory(warehouseActor, "INC-LEG-UNTRACKED", {
      decision: "no-adjustment-required",
      reason: "   ",
    }).ok,
    false,
  )
  assert.equal(
    store.reconcileLegacyIncidentInventory(warehouseActor, "INC-LEG-UNTRACKED", {
      decision: "attribution-still-uncertain",
      reason: "Still checking shelves",
    }).ok,
    false,
    "Uncertain decision must keep review pending even with a reason",
  )
  assert.equal(
    store.reconcileLegacyIncidentInventory(warehouseActor, "INC-LEG-UNTRACKED", {
      decision: "reverse-attributable-loss",
      attributableQty: 3, // > report.quantity (2) and > missingCount (2)
      reason: "Invalid over-bounded qty",
    }).ok,
    false,
  )
  assert.equal(
    store.reconcileLegacyIncidentInventory(warehouseActor, "INC-LEG-UNTRACKED", {
      decision: "reverse-attributable-loss",
      attributableQty: 1.5, // non-integer
      reason: "Invalid fractional qty",
    }).ok,
    false,
  )
  assert.equal(
    store.readOperationsStore().incidentReports.find((r) => r.id === "INC-LEG-UNTRACKED")
      .needsWarehouseInventoryReconciliation,
    true,
  )

  // Complete "no-adjustment-required" review -> clears flag, leaves missingCount=2 (other event) intact, allows closeout!
  const noAdjRes = store.reconcileLegacyIncidentInventory(warehouseActor, "INC-LEG-UNTRACKED", {
    decision: "no-adjustment-required",
    reason: "Confirmed 2 missing units belong to another active event; legacy report never deducted stock.",
  })
  assert.equal(noAdjRes.ok, true)
  assert.equal(noAdjRes.alreadyReconciled, false)
  assert.equal(
    store.readOperationsStore().inventory.find((i) => i.assetId === item.assetId).missingCount,
    2,
  )
  // Idempotent repeat does not overwrite audit or change stock
  const repeatNoAdj = store.reconcileLegacyIncidentInventory(
    { name: "Other Ops", email: "ops2@demo.com", role: "Warehouse Operations Manager" },
    "INC-LEG-UNTRACKED",
    { decision: "reverse-attributable-loss", attributableQty: 2, reason: "Duplicate attempt" },
  )
  assert.equal(repeatNoAdj.ok, true)
  assert.equal(repeatNoAdj.alreadyReconciled, true)
  assert.equal(repeatNoAdj.audit.reviewedByEmail, warehouseActor.email)

  // Repeated migration preserves completed reconciliation and never recreates warning
  const remigAfterRecon = store.migrateOperationsStore(store.readOperationsStore())
  const remigRep = remigAfterRecon.incidentReports.find((r) => r.id === "INC-LEG-UNTRACKED")
  assert.equal(remigRep.needsWarehouseInventoryReconciliation, false)
  assert.ok(remigRep.legacyInventoryReconciliation)

  // Normal closeout succeeds once reconciled
  assert.equal(
    store.closeWarehouseEventAccountability(warehouseActor, "evt-leg-other", "Reconciled and closed").ok,
    true,
  )

  // Also test "reverse-attributable-loss" on a historical already-closed event + failed save Retry
  const histSnap = store.readOperationsStore()
  const closedLegOrder = histSnap.orderRequests.find((o) => o.eventId === "evt-leg-other")
  const origClosedAt = closedLegOrder.closedAt
  const origClosedBy = closedLegOrder.closedByEmail
  histSnap.incidentReports.unshift({
    id: "INC-LEG-HIST-CLOSED",
    eventId: "evt-leg-other",
    eventTitle: "Legacy Untracked Event",
    reportType: "Missing",
    checkpoint: "Warehouse Arrival",
    itemCode: item.assetCode,
    itemName: item.name,
    quantity: 2,
    description: "Historical closed incident attributable to this asset",
    photoUrl: "/event-manager-images/planning.jpg",
    submittedByEmail: jordanActor.email,
    submittedByName: jordanActor.name,
    submittedAt: "2026-03-01T11:00:00.000Z",
    resolutionStatus: "Resolved",
    resolutionType: "Recovered",
    resolutionNotes: "Recovered 1 unit after audit.",
    legacyInventoryAttribution: "uncertain",
    needsWarehouseInventoryReconciliation: true,
  })
  store.writeOperationsStore(histSnap)

  // Simulate storage failure during reconciliation -> preserves memory, warns, and persists on Retry
  const persistedBeforeReconFail = localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)
  failLocalStorageWrites = true
  const reconDuringFail = store.reconcileLegacyIncidentInventory(
    warehouseActor,
    "INC-LEG-HIST-CLOSED",
    {
      decision: "reverse-attributable-loss",
      attributableQty: 1,
      reason: "Confirmed 1 of the 2 missing candles came from this legacy closed event.",
    },
  )
  assert.equal(reconDuringFail.ok, true)
  assert.equal(reconDuringFail.savedToStorage, false)
  assert.equal(
    store.getOperationsPersistenceWarning(),
    "Not saved—changes may be lost on refresh.",
  )
  assert.equal(localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY), persistedBeforeReconFail)
  assert.equal(
    store.readOperationsStore().inventory.find((i) => i.assetId === item.assetId).missingCount,
    1,
  )

  failLocalStorageWrites = false
  assert.equal(store.retryPersistOperationsStore().ok, true)
  assert.equal(store.getOperationsPersistenceWarning(), null)
  const postRetryHist = store.readOperationsStore()
  const invHistAfter = postRetryHist.inventory.find((i) => i.assetId === item.assetId)
  assert.equal(invHistAfter.missingCount, 1)
  assert.equal(invHistAfter.availableStock, 9)
  const orderHistAfter = postRetryHist.orderRequests.find((o) => o.eventId === "evt-leg-other")
  assert.equal(orderHistAfter.closedAt, origClosedAt, "Closed-event review must preserve original closedAt")
  assert.equal(orderHistAfter.closedByEmail, origClosedBy)
}

// 4.6.6: requestProductionJobCorrections restricted to Awaiting Verification with submission on open event
{
  const { oldSystemApis } = await import("../src/operations/apiClients.ts")
  let rejectApiCalls = 0
  const origReject = oldSystemApis.production.rejectTask
  oldSystemApis.production.rejectTask = (...args) => {
    rejectApiCalls += 1
    return origReject(...args)
  }
  try {
    // 1) Ready to Load job (archJob) must be rejected without mutating state or calling API
    const beforeArch = JSON.stringify(store.readOperationsStore())
    const rejReady = store.requestProductionJobCorrections(warehouseActor, {
      jobId: archJob.id,
      explanation: "Invalid post-approval correction",
      responsibleCrewEmails: [jordanActor.email],
    })
    assert.equal(rejReady.ok, false)
    assert.equal(JSON.stringify(store.readOperationsStore()), beforeArch)
    assert.equal(rejectApiCalls, 0)

    // 2) Unsubmitted job (plinthJob) must be rejected without mutating state or calling API
    const beforePlinth = JSON.stringify(store.readOperationsStore())
    const rejUnsubmitted = store.requestProductionJobCorrections(warehouseActor, {
      jobId: plinthJob.id,
      explanation: "Invalid correction before submission",
      responsibleCrewEmails: [jordanActor.email],
    })
    assert.equal(rejUnsubmitted.ok, false)
    assert.equal(JSON.stringify(store.readOperationsStore()), beforePlinth)
    assert.equal(rejectApiCalls, 0)

    // 3) Awaiting Verification job on closed event (p4EventId is closed!) must be rejected without API call
    const snapClosedJob = store.readOperationsStore()
    const targetPodium = snapClosedJob.fabricationJobs.find((j) => j.id === podiumJob.id)
    targetPodium.status = "Awaiting Verification"
    targetPodium.submissions = [
      {
        id: "sub-closed-test",
        jobId: podiumJob.id,
        eventId: p4EventId,
        round: 1,
        submittedByEmail: carlosActor.email,
        submittedByName: carlosActor.name,
        submittedAt: new Date().toISOString(),
        completedQty: targetPodium.spec.requestedQty,
        photoUrls: ["/event-manager-images/planning.jpg"],
        summary: "Submitted on closed event",
        isCorrectionResubmission: false,
      },
    ]
    store.writeOperationsStore(snapClosedJob)
    const beforeClosed = JSON.stringify(store.readOperationsStore())
    const rejClosed = store.requestProductionJobCorrections(warehouseActor, {
      jobId: podiumJob.id,
      explanation: "Invalid correction on closed event",
      responsibleCrewEmails: [carlosActor.email],
    })
    assert.equal(rejClosed.ok, false)
    assert.equal(JSON.stringify(store.readOperationsStore()), beforeClosed)
    assert.equal(rejectApiCalls, 0)
  } finally {
    oldSystemApis.production.rejectTask = origReject
  }
}

console.log("All Phase 4 Warehouse Operations & Ground Crew checks passed!")
