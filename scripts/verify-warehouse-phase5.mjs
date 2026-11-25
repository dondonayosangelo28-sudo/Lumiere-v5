import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
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
  "Testing Warehouse Operations & Ground Crew Phase 5 (Complete Ground Crew My Work & Cross-Role Verification)...",
)

let baselineSeed = null
function resetFreshSeed() {
  failLocalStorageWrites = false
  if (!baselineSeed) {
    localStorageMock.clear()
    baselineSeed = structuredClone(store.readOperationsStore())
  }
  store.writeOperationsStore(structuredClone(baselineSeed))
  return store.readOperationsStore()
}

// ----------------------------------------------------------------------------
// Scenario A: Individual Single-Worker Job -> Hours/Photos -> Submit -> Warehouse Approval
// ----------------------------------------------------------------------------
console.log("Scenario A: Individual single-worker job end-to-end flow...")
let state = resetFreshSeed()
const evt = state.orderRequests[0]
assert.ok(evt, "Seeded event order request should exist")

// Ensure Jordan and Alex are on the event roster
store.addCrewToEventRoster(warehouseActor, {
  eventId: evt.eventId,
  crewEmail: jordanActor.email,
  crewName: jordanActor.name,
})
store.addCrewToEventRoster(warehouseActor, {
  eventId: evt.eventId,
  crewEmail: alexActor.email,
  crewName: alexActor.name,
})

const jobARes = store.createCustomFabricationJob(evt.eventId, {
  name: "Sculpted Ivory Arch Frame",
  requestedQty: 4,
  dimensions: "2.8m x 2.2m",
  materials: "Marine Plywood",
  colors: "Bone Ivory",
  finish: "Matte",
  buildInstructions: "Carved plywood arch finished in matte bone paint",
  referenceImages: ["/event-manager-images/garden.jpg"],
})
assert.equal(jobARes.ok, true)
const jobAId = jobARes.job.id

const planARes = store.confirmProductionJobWindowAndEstimate(warehouseActor, {
  jobId: jobAId,
  startDate: "2026-11-18",
  deadlineDate: "2026-11-22",
  availableProductionDays: 4,
  estimatedHoursPerUnitOrSet: 6,
  estimateBasis: "per-unit",
  assignmentMode: "individual",
  participantEmails: [jordanActor.email],
})
assert.equal(planARes.ok, true, "Warehouse should confirm Individual production plan")

const shiftARes = store.scheduleWorkerShift(warehouseActor, {
  eventId: evt.eventId,
  jobId: jobAId,
  crewEmail: jordanActor.email,
  crewName: jordanActor.name,
  activityType: "fabrication",
  startDateTime: "2026-11-18T08:00:00+08:00",
  endDateTime: "2026-11-18T17:00:00+08:00",
  breakMinutes: 60,
  instructions: "Cut and sand all 4 arches before base coat.",
})
assert.equal(shiftARes.ok, true, "Shift scheduling should create Jordan's assignment")
const assignAId = shiftARes.assignment.id

// Start assignment (Assigned -> In Progress)
const startARes = store.startProductionWorkerAssignment(jordanActor, {
  jobId: jobAId,
  assignmentId: assignAId,
})
assert.equal(startARes.ok, true)

// Record attendance, Asia/Manila hours, progress, and submit contribution (In Progress -> Submitted)
const logARes = store.recordWorkerContributionAndHours(jordanActor, {
  eventId: evt.eventId,
  jobId: jobAId,
  assignmentId: assignAId,
  manilaDate: "2026-11-18",
  attendance: "Present",
  actualProductiveHours: 7.5,
  contributionSummary: "Built and base-coated all 4 sculpted arches.",
  progressPercent: 100,
  photoUrls: ["/event-manager-images/garden.jpg"],
  markContributionSubmitted: true,
})
assert.equal(logARes.ok, true)
state = store.readOperationsStore()
let jobA = state.fabricationJobs.find((j) => j.id === jobAId)
assert.equal(
  jobA.status,
  "In Production",
  "Worker hours/contribution submission alone must NOT auto-transition job to Awaiting Verification",
)
assert.equal(
  jobA.assignments.find((a) => a.id === assignAId)?.status,
  "Submitted",
  "Jordan's assignment should move to Submitted",
)

// Partial quantity finished submission must be blocked
const partialSubmit = store.submitProductionJobForVerification(jordanActor, {
  jobId: jobAId,
  completedQty: 3,
  photoUrls: ["/event-manager-images/garden.jpg"],
  summary: "Trying partial submission of 3/4",
})
assert.equal(partialSubmit.ok, false, "Partial-quantity finished submission must be rejected")

// Full quantity submission succeeds
const fullSubmit = store.submitProductionJobForVerification(jordanActor, {
  jobId: jobAId,
  completedQty: 4,
  photoUrls: ["/event-manager-images/garden.jpg"],
  summary: "All 4 sculpted ivory arches finished to client spec.",
})
assert.equal(fullSubmit.ok, true, "Single worker on Individual job must be able to submit full qty")
state = store.readOperationsStore()
jobA = state.fabricationJobs.find((j) => j.id === jobAId)
assert.equal(jobA.status, "Awaiting Verification")

// Warehouse confirms finished work Ready to Load
const approveA = store.approveProductionJobFinishedWork(warehouseActor, jobAId, {
  checklist: {
    fullQuantityFinished: true,
    matchesClientApprovedSpec: true,
    correctionsResolved: true,
  },
  notes: "Verified all 4 arches ready for load-out.",
})
assert.equal(approveA.ok, true)
state = store.readOperationsStore()
jobA = state.fabricationJobs.find((j) => j.id === jobAId)
assert.equal(jobA.status, "Ready to Load")

// ----------------------------------------------------------------------------
// Scenario B: Multi-worker Group Job -> Separate Group Report vs Personal Hours & Ownership
// ----------------------------------------------------------------------------
console.log("Scenario B: Multi-worker Group job, daily report vs personal hours, and ownership rules...")
const jobBRes = store.createCustomFabricationJob(evt.eventId, {
  name: "Botanical Truss Canopy",
  requestedQty: 2,
  dimensions: "4.0m x 3.0m",
  materials: "Anodized Aluminum",
  colors: "Champagne",
  finish: "Powder Coat",
  buildInstructions: "Twin welded aluminum truss canopy spans",
  referenceImages: ["/event-manager-images/reception.jpg"],
})
assert.equal(jobBRes.ok, true)
const jobBId = jobBRes.job.id

const planBRes = store.confirmProductionJobWindowAndEstimate(warehouseActor, {
  jobId: jobBId,
  startDate: "2026-11-18",
  deadlineDate: "2026-11-23",
  availableProductionDays: 5,
  estimatedHoursPerUnitOrSet: 12,
  estimateBasis: "complete-set",
  assignmentMode: "group",
  participantEmails: [jordanActor.email, alexActor.email],
  productionLeadEmail: jordanActor.email,
  productionLeadName: jordanActor.name,
})
assert.equal(planBRes.ok, true)

const shiftBJordan = store.scheduleWorkerShift(warehouseActor, {
  eventId: evt.eventId,
  jobId: jobBId,
  crewEmail: jordanActor.email,
  crewName: jordanActor.name,
  role: "working-lead",
  activityType: "fabrication",
  startDateTime: "2026-11-19T08:00:00+08:00",
  endDateTime: "2026-11-19T17:00:00+08:00",
  breakMinutes: 60,
  instructions: "Lead canopy welding and final assembly.",
})
const shiftBAlex = store.scheduleWorkerShift(warehouseActor, {
  eventId: evt.eventId,
  jobId: jobBId,
  crewEmail: alexActor.email,
  crewName: alexActor.name,
  role: "crew",
  activityType: "fabrication",
  startDateTime: "2026-11-19T08:00:00+08:00",
  endDateTime: "2026-11-19T15:00:00+08:00",
  breakMinutes: 60,
  instructions: "Assist with gusset plates and rigging brackets.",
})
assert.equal(shiftBJordan.ok && shiftBAlex.ok, true)

assert.equal(
  store.recordWorkerContributionAndHours(jordanActor, {
    eventId: evt.eventId,
    jobId: jobBId,
    assignmentId: shiftBJordan.assignment.id,
    manilaDate: "2026-11-19",
    attendance: "Present",
    actualProductiveHours: 8,
    contributionSummary: "Welded main arch truss chords.",
    progressPercent: 60,
    markContributionSubmitted: false,
  }).ok,
  true,
)
assert.equal(
  store.recordWorkerContributionAndHours(alexActor, {
    eventId: evt.eventId,
    jobId: jobBId,
    assignmentId: shiftBAlex.assignment.id,
    manilaDate: "2026-11-19",
    attendance: "Present",
    actualProductiveHours: 6,
    contributionSummary: "Prepared gusset brackets.",
    progressPercent: 100,
    markContributionSubmitted: true,
  }).ok,
  true,
)

// Non-lead Alex cannot submit Group Daily Progress Report or Final Group Finish Submission
const nonLeadGroupReport = store.submitDailyGroupProgressReport(alexActor, {
  eventId: evt.eventId,
  jobId: jobBId,
  manilaDate: "2026-11-19",
  summary: "Alex trying to submit lead report",
  photoUrls: [],
})
assert.equal(nonLeadGroupReport.ok, false, "Non-lead cannot submit Group Daily Progress Report")

const nonLeadFinishSubmit = store.submitProductionJobForVerification(alexActor, {
  jobId: jobBId,
  completedQty: 2,
  photoUrls: ["/event-manager-images/reception.jpg"],
  summary: "Alex trying to submit whole group finish",
})
assert.equal(nonLeadFinishSubmit.ok, false, "Non-lead cannot submit Group finished work")

const warehouseFinishSubmit = store.submitProductionJobForVerification(warehouseActor, {
  jobId: jobBId,
  completedQty: 2,
  photoUrls: ["/event-manager-images/reception.jpg"],
  summary: "Warehouse should not submit finished work",
})
assert.equal(warehouseFinishSubmit.ok, false, "Warehouse must never submit finished production work")

// Group Lead Jordan submits Group Daily Progress Report separately from personal hours (no duplication)
const leadReport = store.submitDailyGroupProgressReport(jordanActor, {
  eventId: evt.eventId,
  jobId: jobBId,
  manilaDate: "2026-11-19",
  summary: "Team completed 80% of truss frame assembly; primer cured.",
  photoUrls: ["/event-manager-images/reception.jpg"],
})
assert.equal(leadReport.ok, true)

state = store.readOperationsStore()
let jobB = state.fabricationJobs.find((j) => j.id === jobBId)
assert.equal(jobB.groupProgressReports.length, 1)
assert.equal(
  (jobB.contributions ?? []).reduce((s, c) => s + c.actualProductiveHours, 0),
  14,
  "Personal hours across Jordan (8h) + Alex (6h) must remain exact without duplicating daily group reports",
)

// Group Lead submits full finished work
const leadFinishSubmit = store.submitProductionJobForVerification(jordanActor, {
  jobId: jobBId,
  completedQty: 2,
  photoUrls: ["/event-manager-images/reception.jpg"],
  summary: "Both truss canopy sets welded, painted, and QA-checked.",
})
assert.equal(leadFinishSubmit.ok, true)

// ----------------------------------------------------------------------------
// Scenario C: Request Corrections -> Responsible Worker Rework -> Resubmit -> Ready to Load
// ----------------------------------------------------------------------------
console.log("Scenario C: Warehouse requests corrections -> rework -> resubmission -> Ready to Load...")
const corrRes = store.requestProductionJobCorrections(warehouseActor, {
  jobId: jobBId,
  explanation: "Repaint truss joint corners and tighten rigging bolts on Set 2.",
  referencePhotoUrls: ["/event-manager-images/planning.jpg"],
  responsibleCrewEmails: [alexActor.email],
  additionalShifts: [
    {
      crewEmail: alexActor.email,
      crewName: alexActor.name,
      startDateTime: "2026-11-20T09:00:00+08:00",
      endDateTime: "2026-11-20T12:00:00+08:00",
      breakMinutes: 0,
      activityType: "fabrication",
    },
  ],
})
assert.equal(corrRes.ok, true)
state = store.readOperationsStore()
jobB = state.fabricationJobs.find((j) => j.id === jobBId)
assert.equal(jobB.status, "In Production")
assert.equal(jobB.correctionRequests.length, 1)

// Rework photo & contribution by responsible worker Alex on the newly scheduled rework assignment
const reworkAssign = jobB.assignments.find(
  (a) => a.crewEmail === alexActor.email && a.status !== "Completed" && a.status !== "Submitted",
)
assert.ok(reworkAssign, "Request Corrections should schedule rework assignment for responsible worker")
assert.equal(
  store.recordWorkerContributionAndHours(alexActor, {
    eventId: evt.eventId,
    jobId: jobBId,
    assignmentId: reworkAssign.id,
    manilaDate: "2026-11-20",
    attendance: "Present",
    actualProductiveHours: 2.5,
    contributionSummary: "Re-tightened Set 2 bolts and touched up joint paint.",
    progressPercent: 100,
    photoUrls: ["/event-manager-images/christmas.jpg"],
    markContributionSubmitted: true,
  }).ok,
  true,
)

// Lead resubmits finished work with correction explanation
const resubmitB = store.submitProductionJobForVerification(jordanActor, {
  jobId: jobBId,
  completedQty: 2,
  photoUrls: ["/event-manager-images/christmas.jpg"],
  summary: "Corrected Set 2 bolt torque and repainted all joint corners.",
})
assert.equal(resubmitB.ok, true)
state = store.readOperationsStore()
jobB = state.fabricationJobs.find((j) => j.id === jobBId)
assert.equal(jobB.status, "Awaiting Verification")
assert.equal(jobB.submissions.length, 2)

// Warehouse approves Ready to Load and confirms worker completions independently
const approveB = store.approveProductionJobFinishedWork(warehouseActor, jobBId, {
  checklist: {
    fullQuantityFinished: true,
    matchesClientApprovedSpec: true,
    correctionsResolved: true,
  },
  notes: "Rework verified; approved Ready to Load.",
})
assert.equal(approveB.ok, true)

// ----------------------------------------------------------------------------
// Scenario D: Independent Worker Completion Confirmation & Reopen / Isolation Locks
// ----------------------------------------------------------------------------
console.log("Scenario D: Independent Warehouse completion confirmation & Phase 5 reopen locks...")
const confirmA = store.confirmWorkerAssignmentCompletion(warehouseActor, {
  eventId: evt.eventId,
  jobId: jobAId,
  assignmentId: assignAId,
  notes: "Hours and arch delivery verified.",
})
assert.equal(confirmA.ok, true)

// Worker CANNOT modify, add hours to, or reopen Completed assignment
const reopenCompletedStart = store.startProductionWorkerAssignment(jordanActor, {
  jobId: jobAId,
  assignmentId: assignAId,
})
assert.equal(reopenCompletedStart.ok, false, "Completed assignments must not be reopened by worker")

const overwriteCompletedLog = store.recordWorkerContributionAndHours(jordanActor, {
  eventId: evt.eventId,
  jobId: jobAId,
  assignmentId: assignAId,
  manilaDate: "2026-11-18",
  attendance: "Present",
  actualProductiveHours: 2,
  contributionSummary: "Attempt to overwrite confirmed history",
})
assert.equal(overwriteCompletedLog.ok, false, "Workers must not overwrite Completed assignments")

// Worker CANNOT submit/edit another worker's assignment (cross-worker isolation)
const otherWorkerAttempt = store.startProductionWorkerAssignment(alexActor, {
  jobId: jobAId,
  assignmentId: assignAId,
})
assert.equal(otherWorkerAttempt.ok, false, "Other workers cannot modify Jordan's assignment")

// Post-approval finished-work submission is blocked
const postApprovalResubmit = store.submitProductionJobForVerification(jordanActor, {
  jobId: jobAId,
  completedQty: 4,
  photoUrls: ["/event-manager-images/garden.jpg"],
  summary: "Trying to resubmit Ready to Load job",
})
assert.equal(postApprovalResubmit.ok, false, "Already approved job cannot be resubmitted")

// ----------------------------------------------------------------------------
// Scenario E, F, G: Full Event Execution, Incident Resolution, Legacy Reconciliation, Closeout Locks
// ----------------------------------------------------------------------------
console.log("Scenarios E, F & G: Dispatch -> Venue -> Return -> Shortage/Write-off/Recovery -> Legacy Audit -> Closeout...")
state = store.readOperationsStore()
// Designate Jordan as Team Lead and allocate stock on evt
const leadRes = store.designateEventTeamLead(warehouseActor, {
  eventId: evt.eventId,
  newLeadEmail: jordanActor.email,
  newLeadName: jordanActor.name,
  reason: "Assigned on-site lead for loading and returns",
})
assert.equal(leadRes.ok, true)

const allocRes = store.allocateAllStockForEvent(evt.eventId)
assert.ok(allocRes.allocatedLines >= 0, "Stock allocation should return allocation summary")
state = store.readOperationsStore()
const manifestLines = store.getEventManifestLines(state, evt.eventId)
const firstLine = manifestLines.find((l) => l.plannedQty > 0)
assert.ok(firstLine, "Event must have an allocated manifest line")

// Load all lines fully for outbound
for (const line of manifestLines) {
  const res = store.updateManifestLoadedQuantity(evt.eventId, line.sourceId, line.plannedQty)
  assert.equal(res.ok, true)
}

const loadChecklistRes = store.submitFinalLoadingChecklist(
  jordanActor,
  evt.eventId,
  "All manifest assets loaded cleanly onto truck 1.",
)
assert.equal(loadChecklistRes.ok, true)

// Warehouse confirms outbound departure -> loaded quantities lock for Ground Crew
const depRes = store.confirmOutboundDeparture(warehouseActor, evt.eventId, {
  vehiclePlate: "ABC-1234",
  driverName: "Marco Santos",
  notes: "Departed warehouse on schedule.",
})
assert.equal(depRes.ok, true)
const postDepLoadEdit = store.updateManifestLoadedQuantity(
  evt.eventId,
  firstLine.sourceId,
  Math.max(0, firstLine.plannedQty - 1),
)
assert.equal(postDepLoadEdit.ok, false, "Loaded quantities must lock after Warehouse departure")

// Venue Arrival (mandatory photo check + success)
const badVenueRes = store.submitArrivalCheckpoint(jordanActor, {
  eventId: evt.eventId,
  checkpoint: "Venue Arrival",
  photoUrl: "",
  notes: "Missing photo",
})
assert.equal(badVenueRes.ok, false, "Venue Arrival without photo must fail")

const goodVenueRes = store.submitArrivalCheckpoint(jordanActor, {
  eventId: evt.eventId,
  checkpoint: "Venue Arrival",
  photoUrl: "/event-manager-images/garden.jpg",
  notes: "Arrived at service bay.",
})
assert.equal(goodVenueRes.ok, true)

// Direct-to-venue rental receipt & handback verification
state = store.readOperationsStore()
const activeRentals = state.orderRequests.find((o) => o.eventId === evt.eventId)?.rentals ?? []
for (const rental of activeRentals) {
  assert.equal(
    store.recordDirectVenueRentalReceipt(jordanActor, {
      eventId: evt.eventId,
      rentalId: rental.id,
      deliveredQty: rental.ApprovedRequestedQty,
      discrepancyNotes: "",
    }).ok,
    true,
  )
  assert.equal(
    store.recordDirectVenueRentalReturn(jordanActor, {
      eventId: evt.eventId,
      rentalId: rental.id,
      handedBackQty: rental.ApprovedRequestedQty,
      missingQty: 0,
      damagedQty: 0,
      discrepancyNotes: "",
    }).ok,
    true,
  )
}

// Event Hours incident & Warehouse Arrival
const damageRep = store.submitFieldIncidentReport(jordanActor, {
  eventId: evt.eventId,
  reportType: "Damage",
  checkpoint: "Event Hours",
  itemCode: firstLine.code,
  itemName: firstLine.name,
  quantity: 1,
  description: "Corner dent occurred during stage transition.",
  photoUrl: "/event-manager-images/christmas.jpg",
})
assert.equal(damageRep.ok, true)

const whArrivalRes = store.submitArrivalCheckpoint(jordanActor, {
  eventId: evt.eventId,
  checkpoint: "Warehouse Arrival",
  photoUrl: "/event-manager-images/planning.jpg",
  notes: "Returned to bay 2.",
})
assert.equal(whArrivalRes.ok, true)

// Return count with shortage of 1 on firstLine; all others full
state = store.readOperationsStore()
const returnManifest = store.getEventManifestLines(state, evt.eventId)
for (const line of returnManifest) {
  const retQty =
    line.sourceId === firstLine.sourceId
      ? Math.max(0, line.loadedQty - 1)
      : line.loadedQty
  assert.equal(store.updateManifestReturnedQuantity(evt.eventId, line.sourceId, retQty).ok, true)
}

// Submit checklist (auto-creates Missing Item Report for the 1 missing unit)
const retCheck1 = store.submitFinalReturnChecklist(jordanActor, evt.eventId, "1 missing unit noted.")
assert.equal(retCheck1.ok, true)
assert.equal(retCheck1.autoCreatedMissingReports, 1)

// Test Return Checklist Invalidation when later count edits occur
const editRetRes = store.updateManifestReturnedQuantity(
  evt.eventId,
  firstLine.sourceId,
  Math.max(0, firstLine.loadedQty - 1),
)
assert.equal(editRetRes.ok, true)
const retCheckAgain = store.submitFinalReturnChecklist(jordanActor, evt.eventId, "Confirmed return count.")
assert.equal(retCheckAgain.ok, true)

// Resolve damage report + missing report (Damage -> Repair Scheduled; Missing -> Approved Write-off -> verifies closeout)
state = store.readOperationsStore()
const openReports = state.incidentReports.filter((r) => r.eventId === evt.eventId)
assert.ok(openReports.length >= 2)
for (const rep of openReports) {
  const resolutionType = rep.reportType === "Missing" ? "Approved Write-off" : "Repair Scheduled"
  const res = store.resolveFieldIncidentReport(warehouseActor, rep.id, {
    resolutionType,
    resolutionNotes: `Verified ${resolutionType} by Warehouse`,
  })
  assert.equal(res.ok, true)
}

// Also verify Recovered reversal clears missing state and updates return count cleanly
const extraMissing = store.submitFieldIncidentReport(jordanActor, {
  eventId: evt.eventId,
  reportType: "Missing",
  checkpoint: "Warehouse Arrival",
  itemCode: firstLine.code,
  itemName: firstLine.name,
  quantity: 1,
  description: "Found later in dock crate during unloading",
  photoUrl: "/event-manager-images/planning.jpg",
})
assert.equal(extraMissing.ok, true)
assert.equal(
  store.resolveFieldIncidentReport(warehouseActor, extraMissing.report.id, {
    resolutionType: "Recovered",
    resolutionNotes: "Found in unloading crate",
  }).ok,
  true,
)

// Scenario G: Inject a legacy NeedsInventoryReconciliation incident on evt & verify closeout is blocked until audited
state = store.readOperationsStore()
const legacyReportId = "inc-legacy-phase5-001"
state.incidentReports.push({
  id: legacyReportId,
  eventId: evt.eventId,
  eventName: evt.eventName,
  reportType: "Missing",
  checkpoint: "Warehouse Arrival",
  itemCode: firstLine.code,
  itemName: firstLine.name,
  quantity: 1,
  description: "Legacy pre-reconciliation shortage",
  photoUrl: "/event-manager-images/planning.jpg",
  reportedByEmail: jordanActor.email,
  reportedByName: jordanActor.name,
  reportedAt: "2026-11-10T10:00:00.000Z",
  resolutionStatus: "Resolved",
  resolutionAction: "Pending Audit",
  needsWarehouseInventoryReconciliation: true,
})
store.writeOperationsStore(state)

const blockedCloseout = store.closeWarehouseEventAccountability(
  warehouseActor,
  evt.eventId,
  "Attempting closeout before legacy reconciliation",
)
assert.equal(
  blockedCloseout.ok,
  false,
  "Closeout must remain blocked while needsWarehouseInventoryReconciliation is true",
)

const legRecRes = store.reconcileLegacyIncidentInventory(warehouseActor, legacyReportId, {
  decision: "no-adjustment-required",
  reason: "Physical shelf count confirmed 100% accurate in Bay 4.",
})
assert.equal(legRecRes.ok, true, "Audited legacy reconciliation must succeed")

// Now closeout should succeed!
const closeRes = store.closeWarehouseEventAccountability(
  warehouseActor,
  evt.eventId,
  "All assets verified and incidents closed.",
)
assert.equal(closeRes.ok, true, closeRes.ok ? "" : `Closeout failed: ${closeRes.error}`)

// Verify post-closeout Ground Crew locks (event duty + job hours + finish submission)
const postCloseFinish = store.submitProductionJobForVerification(jordanActor, {
  jobId: jobAId,
  completedQty: 4,
  photoUrls: ["/event-manager-images/garden.jpg"],
  summary: "Post closeout edit attempt",
})
assert.equal(postCloseFinish.ok, false, "Closed event blocks finished-work submission")

// Test closed-event updateCrewTaskExecutionStatus guard on legacy crewAssignments
const stateAfterClose = store.readOperationsStore()
const closedEvt = stateAfterClose.orderRequests.find((o) => o.eventId === evt.eventId)
closedEvt.crewAssignments.push({
  id: "crew-assign-closed-1",
  crewEmail: jordanActor.email,
  crewName: jordanActor.name,
  schedule: "2026-11-22 08:00-17:00",
  duties: "Return bay sweep",
  shiftLabel: "Return",
  taskStatus: "In Progress",
})
store.writeOperationsStore(stateAfterClose)
const postCloseDuty = store.updateCrewTaskExecutionStatus(jordanActor, {
  eventId: evt.eventId,
  assignmentId: "crew-assign-closed-1",
  status: "Completed",
})
assert.equal(postCloseDuty.ok, false, "Ground Crew cannot update duty status after event closeout")
assert.match(postCloseDuty.error, /closed/i)

// ----------------------------------------------------------------------------
// Scenario H, I, J: Rejected Atomicity, Persistence Warning/Retry, Context Filtering Helpers
// ----------------------------------------------------------------------------
console.log("Scenarios H, I & J: Atomic rejections, persistence retry, and worker/roster isolation...")
resetFreshSeed()
state = store.readOperationsStore()
const targetEvt = state.orderRequests[0]
// Unassigned worker Carlos should see 0 relevant events / 0 production jobs
const carlosOrders = state.orderRequests.filter((o) => {
  const onRoster = (o.eventRoster ?? []).some(
    (r) => !r.removedAt && r.crewEmail.toLowerCase() === carlosActor.email.toLowerCase(),
  )
  return onRoster
})
assert.equal(carlosOrders.length, 0, "Carlos starts unassigned and is not on seeded roster")

// Put Carlos on roster ONLY (no shifts, no assignments, not lead) -> roster-only state
const addCarlosRoster = store.addCrewToEventRoster(warehouseActor, {
  eventId: targetEvt.eventId,
  crewEmail: carlosActor.email,
  crewName: carlosActor.name,
})
assert.equal(addCarlosRoster.ok, true)
state = store.readOperationsStore()
const carlosEvt = state.orderRequests.find((o) => o.eventId === targetEvt.eventId)
assert.equal(
  (carlosEvt.eventAssignments ?? []).some((a) => a.crewEmail === carlosActor.email),
  false,
  "Adding Carlos to roster alone creates zero scheduled duties",
)

// Persistence failure -> warning raised -> pending state held in memory -> Retry clears warning
failLocalStorageWrites = true
const addJordanRes = store.addCrewToEventRoster(warehouseActor, {
  eventId: targetEvt.eventId,
  crewEmail: jordanActor.email,
  crewName: jordanActor.name,
})
assert.equal(addJordanRes.ok, true)
assert.equal(addJordanRes.savedToStorage, false, "Failed save must report savedToStorage: false")
assert.ok(store.getOperationsPersistenceWarning(), "Persistence warning must be active after failed save")

failLocalStorageWrites = false
const retryRes = store.retryPersistOperationsStore()
assert.equal(retryRes.ok, true)
assert.equal(store.getOperationsPersistenceWarning(), null, "Successful retry must clear warning")

// Verify compiled production bundle includes Phase 5 Ground Crew My Work labels & Phase 1-4 protections
console.log("Checking compiled dist bundle for Phase 5 UI labels...")
const assetsDir = path.resolve("dist/assets")
const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith(".js"))
const bundleText = jsFiles
  .map((f) => fs.readFileSync(path.join(assetsDir, f), "utf8"))
  .join("\n")

const requiredUiStrings = [
  "Start Production Assignment",
  "Save Daily Hours &amp; Contribution",
  "Submit My Contribution",
  "Submit Group Daily Progress Report",
  "Submit Finished Job for Verification",
  "Completed assignments cannot be reopened by a worker.",
  "Roster Member — No Scheduled Assignments Yet:",
  "No assigned events or scheduled work yet",
  "Submit Final Loading Checklist (Team Lead)",
  "Not saved—changes may be lost on refresh.",
  "Approve Finished Work",
]
for (const s of requiredUiStrings) {
  const plain = s.replace("&amp;", "&")
  assert.ok(
    bundleText.includes(s) || bundleText.includes(plain),
    `Production bundle missing expected UI copy: ${plain}`,
  )
}

console.log("✅ All Phase 5 verification assertions passed!")
