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
let failOpsWrites = false
let failEmWrites = false
const localStorageMock = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => {
    if (failOpsWrites && key === "lumiere.operations.store.v51") {
      throw new DOMException("QuotaExceededError", "QuotaExceededError")
    }
    if (failEmWrites && key.startsWith("lumiere-event-manager-preview-v1:")) {
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

globalThis.window = new MockWindow()
globalThis.localStorage = localStorageMock
globalThis.sessionStorage = sessionStorageMock
globalThis.CustomEvent = CustomEvent

const store = await import("../src/operations/store.ts")
const previewData = await import("../src/features/event-manager/preview-data.ts")

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
const emActor = {
  name: "Elena Cruz",
  email: "em@demo.com",
  role: "Event Manager",
}

const baseline = structuredClone(store.readOperationsStore())
function resetSeed() {
  failOpsWrites = false
  failEmWrites = false
  localStorageMock.clear()
  store.writeOperationsStore(structuredClone(baseline))
  return store.readOperationsStore()
}

// ----------------------------------------------------------------------------
// Finding 1: Prevent duplicate contribution hours (Save -> Save -> Submit = 4h; new 2h = 6h)
// ----------------------------------------------------------------------------
console.log("F1: Checking duplicate contribution hours prevention...")
{
  let s = resetSeed()
  const evt = s.orderRequests[0]
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: jordanActor.email, crewName: jordanActor.name })
  const job = store.createCustomFabricationJob(evt.eventId, {
    name: "F1 Floral Arch",
    requestedQty: 2,
    dimensions: "2m",
    materials: "Wood",
    colors: "Ivory",
    finish: "Matte",
    buildInstructions: "Build",
    referenceImages: [],
  }).job
  store.confirmProductionJobWindowAndEstimate(warehouseActor, {
    jobId: job.id,
    startDate: "2026-11-18",
    deadlineDate: "2026-11-22",
    availableProductionDays: 4,
    estimatedHoursPerUnitOrSet: 4,
    estimateBasis: "per-unit",
    assignmentMode: "individual",
    participantEmails: [jordanActor.email],
  })
  const shf = store.scheduleWorkerShift(warehouseActor, {
    eventId: evt.eventId,
    jobId: job.id,
    crewEmail: jordanActor.email,
    crewName: jordanActor.name,
    activityType: "fabrication",
    startDateTime: "2026-11-18T08:00:00+08:00",
    endDateTime: "2026-11-18T12:00:00+08:00",
    breakMinutes: 0,
  })
  assert.equal(shf.ok, true)

  // Save 4h draft
  const save1 = store.recordWorkerContributionAndHours(jordanActor, {
    eventId: evt.eventId,
    jobId: job.id,
    assignmentId: shf.assignment.id,
    manilaDate: "2026-11-18",
    attendance: "Present",
    actualProductiveHours: 4,
    contributionSummary: "Frame cut",
    markContributionSubmitted: false,
  })
  assert.equal(save1.ok, true)
  // Save unchanged with same contributionId
  const save2 = store.recordWorkerContributionAndHours(jordanActor, {
    contributionId: save1.log.id,
    eventId: evt.eventId,
    jobId: job.id,
    assignmentId: shf.assignment.id,
    manilaDate: "2026-11-18",
    attendance: "Present",
    actualProductiveHours: 4,
    contributionSummary: "Frame cut",
    markContributionSubmitted: false,
  })
  assert.equal(save2.ok, true)

  // Separate genuine 2h entry on same date
  const saveSeparate = store.recordWorkerContributionAndHours(jordanActor, {
    eventId: evt.eventId,
    jobId: job.id,
    assignmentId: shf.assignment.id,
    manilaDate: "2026-11-18",
    attendance: "Present",
    actualProductiveHours: 2,
    contributionSummary: "Sanding & trim",
    markContributionSubmitted: false,
  })
  assert.equal(saveSeparate.ok, true)

  // Submit finalizing the 2h entry (using its contributionId)
  const submitFinal = store.recordWorkerContributionAndHours(jordanActor, {
    contributionId: saveSeparate.log.id,
    eventId: evt.eventId,
    jobId: job.id,
    assignmentId: shf.assignment.id,
    manilaDate: "2026-11-18",
    attendance: "Present",
    actualProductiveHours: 2,
    contributionSummary: "Sanding & trim finalized",
    markContributionSubmitted: true,
  })
  assert.equal(submitFinal.ok, true)

  s = store.readOperationsStore()
  const updatedJob = s.fabricationJobs.find((j) => j.id === job.id)
  const totalHrs = (updatedJob.contributions ?? []).reduce((sum, c) => sum + c.actualProductiveHours, 0)
  assert.equal(totalHrs, 6, `Expected 4h + 2h = 6h total without double counting, got ${totalHrs}`)
}

// ----------------------------------------------------------------------------
// Finding 2: Roster removal / replacement safety
// ----------------------------------------------------------------------------
console.log("F2: Checking roster removal/replacement safety...")
{
  let s = resetSeed()
  const evt = s.orderRequests[0]
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: alexActor.email, crewName: alexActor.name })
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: carlosActor.email, crewName: carlosActor.name })

  // Past shift (2020) vs Future shift (2099)
  const pastShift = store.scheduleWorkerShift(warehouseActor, {
    eventId: evt.eventId,
    crewEmail: alexActor.email,
    crewName: alexActor.name,
    activityType: "loading",
    startDateTime: "2020-01-10T08:00:00+08:00",
    endDateTime: "2020-01-10T12:00:00+08:00",
    breakMinutes: 0,
  })
  assert.equal(pastShift.ok, true)

  const futureShift = store.scheduleWorkerShift(warehouseActor, {
    eventId: evt.eventId,
    crewEmail: alexActor.email,
    crewName: alexActor.name,
    activityType: "setup",
    startDateTime: "2099-05-10T08:00:00+08:00",
    endDateTime: "2099-05-10T12:00:00+08:00",
    breakMinutes: 0,
  })
  assert.equal(futureShift.ok, true)

  // Impact preview without referenceNowMs must NOT treat 2020 past shift as future!
  s = store.readOperationsStore()
  const preview = store.previewRosterOrLeadChangeImpact(s, {
    eventId: evt.eventId,
    targetCrewEmail: alexActor.email,
    action: "remove-roster",
  })
  assert.equal(preview.futureScheduleIds.includes(pastShift.shift.id), false, "Past 2020 shift must not be treated as future")
  assert.equal(preview.futureScheduleIds.includes(futureShift.shift.id), true, "Future 2099 shift must be included")

  // Self-replacement rejected atomically
  const selfRep = store.removeCrewFromEventRoster(warehouseActor, {
    eventId: evt.eventId,
    crewEmail: alexActor.email,
    reason: "Self test",
    reassignToEmail: alexActor.email,
  })
  assert.equal(selfRep.ok, false, "Self-replacement must be rejected")

  // Conflicting schedule on Carlos must fail atomically without removing Alex
  const carlosConflict = store.scheduleWorkerShift(warehouseActor, {
    eventId: evt.eventId,
    crewEmail: carlosActor.email,
    crewName: carlosActor.name,
    activityType: "dismantling",
    startDateTime: "2099-05-10T10:00:00+08:00",
    endDateTime: "2099-05-10T14:00:00+08:00",
    breakMinutes: 0,
  })
  assert.equal(carlosConflict.ok, true)
  const conflictReplace = store.removeCrewFromEventRoster(warehouseActor, {
    eventId: evt.eventId,
    crewEmail: alexActor.email,
    reason: "Handover",
    reassignToEmail: carlosActor.email,
    reassignToName: carlosActor.name,
  })
  assert.equal(conflictReplace.ok, false, "Conflicting replacement schedule must be rejected atomically")
  s = store.readOperationsStore()
  assert.ok(
    s.orderRequests.find((o) => o.eventId === evt.eventId).eventRoster.some((r) => r.crewEmail === alexActor.email && !r.removedAt),
    "Rejected replacement must leave Alex active on roster",
  )

  // Valid replacement moves ONLY future unstarted duty/shift and preserves 2020 past shift on Alex!
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: jordanActor.email, crewName: jordanActor.name })
  const validReplace = store.removeCrewFromEventRoster(warehouseActor, {
    eventId: evt.eventId,
    crewEmail: alexActor.email,
    reason: "Reassigned future setup to Jordan",
    reassignToEmail: jordanActor.email,
    reassignToName: jordanActor.name,
  })
  assert.equal(validReplace.ok, true, validReplace.ok ? "" : validReplace.error)
  s = store.readOperationsStore()
  const updatedOrder = s.orderRequests.find((o) => o.eventId === evt.eventId)
  const storedPast = updatedOrder.eventSchedules.find((sh) => sh.id === pastShift.shift.id)
  const storedFuture = updatedOrder.eventSchedules.find((sh) => sh.id === futureShift.shift.id)
  const storedFutureAsg = updatedOrder.eventAssignments.find((a) => a.id === futureShift.assignment.id)
  assert.equal(storedPast.crewEmail, alexActor.email, "Past shift must stay on original worker Alex")
  assert.equal(storedFuture.crewEmail, jordanActor.email, "Future shift must transfer to Jordan")
  assert.equal(storedFutureAsg.crewEmail, jordanActor.email, "Future eventAssignment must transfer to Jordan alongside its shift")
}

// ----------------------------------------------------------------------------
// Finding 3: Multi-worker Individual Lead access & submission vs Single-worker privacy
// ----------------------------------------------------------------------------
console.log("F3: Checking Multi-worker Individual Lead submission ownership...")
{
  let s = resetSeed()
  const evt = s.orderRequests[0]
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: jordanActor.email, crewName: jordanActor.name })
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: alexActor.email, crewName: alexActor.name })
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: carlosActor.email, crewName: carlosActor.name })
  store.designateEventTeamLead(warehouseActor, {
    eventId: evt.eventId,
    newLeadEmail: jordanActor.email,
    newLeadName: jordanActor.name,
    reason: "Site Lead",
  })

  // Multi-worker Individual job: Alex & Carlos are participants, Jordan is non-participant Team Lead / Production Lead
  const multiJob = store.createCustomFabricationJob(evt.eventId, {
    name: "F3 Multi-Worker Individual Plinths",
    requestedQty: 4,
    dimensions: "1m",
    materials: "Wood",
    colors: "White",
    finish: "Gloss",
    buildInstructions: "Build 4",
    referenceImages: [],
  }).job
  const planMulti = store.confirmProductionJobWindowAndEstimate(warehouseActor, {
    jobId: multiJob.id,
    startDate: "2026-11-18",
    deadlineDate: "2026-11-22",
    availableProductionDays: 4,
    estimatedHoursPerUnitOrSet: 5,
    estimateBasis: "per-unit",
    assignmentMode: "individual",
    participantEmails: [alexActor.email, carlosActor.email],
    productionLeadEmail: jordanActor.email,
    productionLeadName: jordanActor.name,
  })
  assert.equal(planMulti.ok, true)

  // Persist & reload (trigger migration) -> multi-worker lead must NOT be erased!
  s = store.readOperationsStore()
  const reloadedMulti = s.fabricationJobs.find((j) => j.id === multiJob.id)
  assert.equal(reloadedMulti.productionLeadEmail, jordanActor.email, "Migration must preserve multi-worker individual lead")

  // Non-participant lead Jordan submits full batch
  const leadSubmit = store.submitProductionJobForVerification(jordanActor, {
    jobId: multiJob.id,
    completedQty: 4,
    photoUrls: ["/event-manager-images/garden.jpg"],
    summary: "Lead submitted full batch of 4.",
  })
  assert.equal(leadSubmit.ok, true, "Non-participant Production Lead must be able to submit multi-worker Individual job")

  // Single-worker Individual job: ONLY Alex assigned -> coordinating lead Jordan must NOT submit
  const singleJob = store.createCustomFabricationJob(evt.eventId, {
    name: "F3 Single-Worker Plinth",
    requestedQty: 1,
    dimensions: "1m",
    materials: "Wood",
    colors: "White",
    finish: "Gloss",
    buildInstructions: "Build 1",
    referenceImages: [],
  }).job
  assert.equal(
    store.confirmProductionJobWindowAndEstimate(warehouseActor, {
      jobId: singleJob.id,
      startDate: "2026-11-18",
      deadlineDate: "2026-11-22",
      availableProductionDays: 4,
      estimatedHoursPerUnitOrSet: 5,
      estimateBasis: "per-unit",
      assignmentMode: "individual",
      participantEmails: [alexActor.email],
    }).ok,
    true,
  )
  const leadSingleAttempt = store.submitProductionJobForVerification(jordanActor, {
    jobId: singleJob.id,
    completedQty: 1,
    photoUrls: ["/event-manager-images/garden.jpg"],
    summary: "Coordinating lead trying to submit sole worker's job",
  })
  assert.equal(leadSingleAttempt.ok, false, "Coordinating lead must NOT submit single-worker Individual job")
}

// ----------------------------------------------------------------------------
// Finding 4 & 5: Incident quantities/attribution & Manual report preservation
// ----------------------------------------------------------------------------
console.log("F4 & F5: Checking incident quantity bounds, attribution, and manual report preservation...")
{
  let s = resetSeed()
  const evt = s.orderRequests[0]
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: jordanActor.email, crewName: jordanActor.name })
  store.designateEventTeamLead(warehouseActor, {
    eventId: evt.eventId,
    newLeadEmail: jordanActor.email,
    newLeadName: jordanActor.name,
    reason: "Lead",
  })
  store.allocateAllStockForEvent(evt.eventId)
  s = store.readOperationsStore()
  const line = store.getEventManifestLines(s, evt.eventId).find((l) => l.plannedQty >= 3)
  assert.ok(line)
  for (const ml of store.getEventManifestLines(s, evt.eventId)) {
    store.updateManifestLoadedQuantity(evt.eventId, ml.sourceId, ml.plannedQty)
  }
  store.submitFinalLoadingChecklist(jordanActor, evt.eventId, "Loaded")
  store.confirmOutboundDeparture(warehouseActor, evt.eventId, { vehiclePlate: "ABC-1", driverName: "Driver", notes: "Out" })
  store.submitArrivalCheckpoint(jordanActor, { eventId: evt.eventId, checkpoint: "Venue Arrival", photoUrl: "/event-manager-images/garden.jpg", notes: "Venue" })
  store.submitArrivalCheckpoint(jordanActor, { eventId: evt.eventId, checkpoint: "Warehouse Arrival", photoUrl: "/event-manager-images/planning.jpg", notes: "Bay" })

  // F4: Invalid / oversized / unrelated asset incident rejections
  assert.equal(
    store.submitFieldIncidentReport(jordanActor, {
      eventId: evt.eventId,
      reportType: "Damage",
      checkpoint: "Event Hours",
      itemCode: line.code,
      itemName: line.name,
      quantity: 1.5,
      description: "Fraction",
      photoUrl: "/event-manager-images/christmas.jpg",
    }).ok,
    false,
    "Fractional quantity must be rejected",
  )
  assert.equal(
    store.submitFieldIncidentReport(jordanActor, {
      eventId: evt.eventId,
      reportType: "Missing",
      checkpoint: "Warehouse Arrival",
      itemCode: line.code,
      itemName: line.name,
      quantity: line.plannedQty + 10,
      description: "Oversized",
      photoUrl: "/event-manager-images/planning.jpg",
    }).ok,
    false,
    "Oversized incident quantity exceeding accountable event load must be rejected",
  )
  assert.equal(
    store.submitFieldIncidentReport(jordanActor, {
      eventId: evt.eventId,
      reportType: "Damage",
      checkpoint: "Event Hours",
      itemCode: "AST-UNRELATED-999",
      itemName: "Unrelated Mystery Item",
      quantity: 1,
      description: "Not on event",
      photoUrl: "/event-manager-images/christmas.jpg",
    }).ok,
    false,
    "Unrelated asset not on event manifest/rentals must be rejected",
  )

  // F5: Manual Warehouse Arrival Missing report must NOT be auto-modified by return checklist recount!
  const manualRep = store.submitFieldIncidentReport(jordanActor, {
    eventId: evt.eventId,
    reportType: "Missing",
    checkpoint: "Warehouse Arrival",
    itemCode: line.code,
    itemName: line.name,
    quantity: 1,
    description: "Manual warehouse arrival missing item report",
    photoUrl: "/event-manager-images/planning.jpg",
  })
  assert.equal(manualRep.ok, true)
  assert.equal(manualRep.report.reportSource, "manual-field-report")

  // Return ALL items on checklist (shortage = 0 < manual 1) -> manual report must remain Pending & quantity 1!
  s = store.readOperationsStore()
  for (const ml of store.getEventManifestLines(s, evt.eventId)) {
    store.updateManifestReturnedQuantity(evt.eventId, ml.sourceId, ml.loadedQty)
  }
  const chk = store.submitFinalReturnChecklist(jordanActor, evt.eventId, "All returned")
  assert.equal(chk.ok, true)
  s = store.readOperationsStore()
  const preservedManual = s.incidentReports.find((r) => r.id === manualRep.report.id)
  assert.equal(preservedManual.resolutionStatus, "Pending", "Manual Warehouse Arrival report must stay Pending after return recount")
  assert.equal(preservedManual.quantity, 1, "Manual Warehouse Arrival report quantity must not be reduced by recount")
}

// ----------------------------------------------------------------------------
// Finding 6: Validate rental return quantities
// ----------------------------------------------------------------------------
console.log("F6: Checking rental return quantity validation...")
{
  let s = resetSeed()
  const evt = s.orderRequests[0]
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: jordanActor.email, crewName: jordanActor.name })
  store.designateEventTeamLead(warehouseActor, {
    eventId: evt.eventId,
    newLeadEmail: jordanActor.email,
    newLeadName: jordanActor.name,
    reason: "Lead",
  })
  const rental = evt.rentals[0]
  assert.ok(rental)
  const baseQty = rental.ApprovedRequestedQty

  // Excessive handedBackQty (60 for baseQty) must fail
  assert.equal(
    store.recordDirectVenueRentalReturn(jordanActor, {
      eventId: evt.eventId,
      rentalId: rental.id,
      handedBackQty: baseQty + 50,
      missingQty: 0,
      damagedQty: 0,
      discrepancyNotes: "",
    }).ok,
    false,
    "Excessive handedBackQty above delivered baseline must be rejected",
  )

  // Inconsistent total (handedBack + missing !== baseQty) must fail
  assert.equal(
    store.recordDirectVenueRentalReturn(jordanActor, {
      eventId: evt.eventId,
      rentalId: rental.id,
      handedBackQty: baseQty,
      missingQty: 1,
      damagedQty: 0,
      discrepancyNotes: "Inconsistent",
    }).ok,
    false,
    "Inconsistent handedBack + missing != baseline must be rejected",
  )

  // Damaged exceeding handedBack must fail
  assert.equal(
    store.recordDirectVenueRentalReturn(jordanActor, {
      eventId: evt.eventId,
      rentalId: rental.id,
      handedBackQty: 0,
      missingQty: baseQty,
      damagedQty: 1,
      discrepancyNotes: "Impossible damaged",
    }).ok,
    false,
    "Damaged units included in handback cannot exceed handedBackQty",
  )

  // Valid partial damaged return: handedBack = baseQty, missing = 0, damaged = 1
  assert.equal(
    store.recordDirectVenueRentalReturn(jordanActor, {
      eventId: evt.eventId,
      rentalId: rental.id,
      handedBackQty: baseQty,
      missingQty: 0,
      damagedQty: 1,
      discrepancyNotes: "1 unit dented and returned",
    }).ok,
    true,
    "Valid damaged return with handedBack + missing === baseline must succeed",
  )
}

// ----------------------------------------------------------------------------
// Finding 7: Client approval / Warehouse handoff recoverability
// ----------------------------------------------------------------------------
console.log("F7: Checking recoverable Client Approval / Warehouse Handoff...")
{
  resetSeed()
  const savedPitch = await previewData.previewStudio(emActor, {
    action: "save",
    revision: 0,
    status: "ready",
    brief: {
      title: "F7 Recoverable Handoff Gala",
      client: "Lumina Client",
      clientEmail: "client@example.com",
      start: "2026-12-10T18:00",
      end: "2026-12-10T23:00",
      pax: 150,
      venue: "F7 Grand Ballroom",
      theme: "Gold",
      estimatedBudget: 400000,
      notes: "Handoff note",
      pins: [{ id: "pin-1", title: "Ref", image: "/event-manager-images/garden.jpg", x: 10, y: 10, width: 200, rotation: 0 }],
      requirements: [{ assetId: "evtast-0001", quantity: 5 }],
      customItems: [],
      rentals: [],
    },
  })

  // Simulate unrelated pending Operations Store save BEFORE approving a different event
  const opsEvt = store.readOperationsStore().orderRequests[0]
  failOpsWrites = true
  const unrelatedRoster = store.addCrewToEventRoster(warehouseActor, {
    eventId: opsEvt.eventId,
    crewEmail: carlosActor.email,
    crewName: carlosActor.name,
  })
  assert.equal(unrelatedRoster.savedToStorage, false)
  assert.ok(store.getOperationsPersistenceWarning(), "Unrelated pending save warning must be active")

  let handoffFailed = false
  try {
    await previewData.previewStudio(emActor, {
      action: "approve",
      id: savedPitch.id,
      revision: savedPitch.revision,
      approvalNote: "Client signed off",
    })
  } catch (err) {
    handoffFailed = true
  }
  assert.equal(handoffFailed, true, "Approval must NOT silently succeed when Warehouse storage write fails")

  // Restore storage and retry handoff -> must persist BOTH unrelated pending roster AND the newly approved event's Warehouse order
  failOpsWrites = false
  const retried = await previewData.retryApprovalHandoff(emActor, savedPitch.id)
  assert.equal(retried.status, "approved")
  const opsAfter = store.readOperationsStore()
  const matchingOrders = opsAfter.orderRequests.filter((o) => o.eventId === savedPitch.id)
  assert.equal(matchingOrders.length, 1, "Retry must produce exactly 1 Warehouse order for the approved event")
  assert.equal(matchingOrders[0].stockLines.length, 1, "Approved event must have its dependent stock line")
  assert.ok(
    opsAfter.orderRequests.find((o) => o.eventId === opsEvt.eventId)?.eventRoster?.some((r) => r.crewEmail === carlosActor.email && !r.removedAt),
    "Unrelated pending roster save must also be preserved",
  )

  // Repeat retry must not duplicate orders or audit entries
  const repeated = await previewData.previewStudio(emActor, {
    action: "approve",
    id: savedPitch.id,
    revision: retried.revision,
    approvalNote: "Repeat",
  })
  assert.equal(repeated.status, "approved")
  assert.equal(
    store.readOperationsStore().orderRequests.filter((o) => o.eventId === savedPitch.id).length,
    1,
    "Repeated approval retry must not duplicate Warehouse order",
  )

  // Event Manager write failure while Warehouse succeeds -> restore -> retry succeeds without duplicate Warehouse order
  const pitch2 = await previewData.previewStudio(emActor, {
    action: "save",
    revision: 0,
    status: "ready",
    brief: {
      title: "F7 EM Write Fail Gala",
      client: "Aurelia Client",
      clientEmail: "aurelia@example.com",
      start: "2026-12-12T18:00",
      end: "2026-12-12T23:00",
      pax: 120,
      venue: "F7 EM Fail Ballroom",
      theme: "Ivory",
      estimatedBudget: 350000,
      notes: "EM write failure test",
      pins: [{ id: "pin-2", title: "Ref2", image: "/event-manager-images/garden.jpg", x: 10, y: 10, width: 200, rotation: 0 }],
      requirements: [{ assetId: "evtast-0001", quantity: 3 }],
      customItems: [],
      rentals: [],
    },
  })
  failEmWrites = true
  let emFailed = false
  try {
    await previewData.previewStudio(emActor, {
      action: "approve",
      id: pitch2.id,
      revision: pitch2.revision,
      approvalNote: "Approve pitch2",
    })
  } catch (err) {
    emFailed = err instanceof previewData.ApprovalHandoffError && err.handoff.warehouseSaved && !err.handoff.eventManagerSaved
  }
  assert.equal(emFailed, true, "Event Manager write failure must throw ApprovalHandoffError with warehouseSaved=true, eventManagerSaved=false")
  failEmWrites = false
  const retriedPitch2 = await previewData.retryApprovalHandoff(emActor, pitch2.id)
  assert.equal(retriedPitch2.status, "approved")
  assert.equal(
    store.readOperationsStore().orderRequests.filter((o) => o.eventId === pitch2.id).length,
    1,
    "Retrying after EM write failure must not duplicate Warehouse order",
  )
}

// ----------------------------------------------------------------------------
// Finding 9 (Defect 2): Contribution restore, multi-Saved entries, cross-context rejection, & event-duty flow
// ----------------------------------------------------------------------------
console.log("F9: Checking contribution restore, multi-Saved selection, cross-context ID rejection, and event duties...")
{
  let s = resetSeed()
  const evt = s.orderRequests[0]
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: jordanActor.email, crewName: jordanActor.name })
  store.addCrewToEventRoster(warehouseActor, { eventId: evt.eventId, crewEmail: alexActor.email, crewName: alexActor.name })

  const dutyShift = store.scheduleWorkerShift(warehouseActor, {
    eventId: evt.eventId,
    crewEmail: jordanActor.email,
    crewName: jordanActor.name,
    activityType: "setup",
    startDateTime: "2026-12-20T08:00:00+08:00",
    endDateTime: "2026-12-20T16:00:00+08:00",
    breakMinutes: 60,
  })
  assert.equal(dutyShift.ok, true)

  const alexShift = store.scheduleWorkerShift(warehouseActor, {
    eventId: evt.eventId,
    crewEmail: alexActor.email,
    crewName: alexActor.name,
    activityType: "loading",
    startDateTime: "2026-12-21T08:00:00+08:00",
    endDateTime: "2026-12-21T16:00:00+08:00",
    breakMinutes: 60,
  })
  assert.equal(alexShift.ok, true)

  // Save 4h on event duty -> edit to 5h using same contributionId -> finalize = 1 log & 5h
  const d1 = store.recordWorkerContributionAndHours(jordanActor, {
    eventId: evt.eventId,
    assignmentId: dutyShift.assignment.id,
    manilaDate: "2026-12-20",
    attendance: "Present",
    actualProductiveHours: 4,
    contributionSummary: "Initial duty setup",
    progressPercent: 50,
    markContributionSubmitted: false,
  })
  assert.equal(d1.ok, true)
  assert.equal(d1.log.status, "Saved")

  // Cross-context contributionId check: Alex supplying Jordan's log ID must be rejected without mutation
  const crossCtx = store.recordWorkerContributionAndHours(alexActor, {
    contributionId: d1.log.id,
    eventId: evt.eventId,
    assignmentId: alexShift.assignment.id,
    manilaDate: "2026-12-21",
    attendance: "Present",
    actualProductiveHours: 3,
    contributionSummary: "Cross-context attempt",
    markContributionSubmitted: false,
  })
  assert.equal(crossCtx.ok, false, "Explicit contributionId belonging to another assignment/worker must be rejected")

  // Multiple Saved entries on the same date stay independent
  const d2 = store.recordWorkerContributionAndHours(jordanActor, {
    eventId: evt.eventId,
    assignmentId: dutyShift.assignment.id,
    manilaDate: "2026-12-20",
    attendance: "Present",
    actualProductiveHours: 2,
    contributionSummary: "Evening lighting check",
    progressPercent: 80,
    markContributionSubmitted: false,
  })
  assert.equal(d2.ok, true)
  assert.notEqual(d2.log.id, d1.log.id)

  // Update d1 (4h -> 5h) and finalize d1, leaving total = 5h + 2h = 7h
  const d1Final = store.recordWorkerContributionAndHours(jordanActor, {
    contributionId: d1.log.id,
    eventId: evt.eventId,
    assignmentId: dutyShift.assignment.id,
    manilaDate: "2026-12-20",
    attendance: "Present",
    actualProductiveHours: 5,
    contributionSummary: "Updated duty setup finalized",
    progressPercent: 100,
    markContributionSubmitted: true,
  })
  assert.equal(d1Final.ok, true)
  assert.equal(d1Final.log.status, "Submitted")

  s = store.readOperationsStore()
  const updatedOrder = s.orderRequests.find((o) => o.eventId === evt.eventId)
  const jordanDutyLogs = (updatedOrder.eventContributions ?? []).filter(
    (c) => c.assignmentId === dutyShift.assignment.id,
  )
  assert.equal(jordanDutyLogs.length, 2, "Must have exactly 2 duty logs (5h finalized + 2h saved)")
  assert.equal(
    jordanDutyLogs.reduce((sum, c) => sum + c.actualProductiveHours, 0),
    7,
    "Total event-duty hours must equal 5h + 2h = 7h",
  )

  // Failed persistence -> pending Saved entry retained -> Retry persists same ID
  failOpsWrites = true
  const failedDutySave = store.recordWorkerContributionAndHours(alexActor, {
    eventId: evt.eventId,
    assignmentId: alexShift.assignment.id,
    manilaDate: "2026-12-21",
    attendance: "Present",
    actualProductiveHours: 4,
    contributionSummary: "Pending offline duty log",
    markContributionSubmitted: false,
  })
  assert.equal(failedDutySave.ok, true)
  assert.equal(failedDutySave.savedToStorage, false)
  const pendingAlexLogs = (store.readOperationsStore().orderRequests.find((o) => o.eventId === evt.eventId)?.eventContributions ?? []).filter(
    (c) => c.id === failedDutySave.log.id,
  )
  assert.equal(pendingAlexLogs.length, 1, "Pending Saved entry must remain in memory during storage failure")
  failOpsWrites = false
  assert.equal(store.retryPersistOperationsStore().ok, true)
  const persistedAlexLogs = JSON.parse(localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)).orderRequests
    .find((o) => o.eventId === evt.eventId)
    .eventContributions.filter((c) => c.id === failedDutySave.log.id)
  assert.equal(persistedAlexLogs.length, 1, "Retry must persist the exact same contribution ID")
}

// ----------------------------------------------------------------------------
// Finding 8: Surface failed migration persistence & Retry
// ----------------------------------------------------------------------------
console.log("F8: Checking failed migration persistence warning & Retry...")
{
  resetSeed()
  const rawBefore = localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)
  const parsed = JSON.parse(rawBefore)
  // Force a record requiring migration (e.g., status: "Pending" on a fabrication job & remove reportSource)
  parsed.fabricationJobs[0].status = "Pending"
  localStorageMock.setItem(store.OPERATIONS_STORAGE_KEY, JSON.stringify(parsed))
  const preMigrationSerialized = localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)

  failOpsWrites = true
  // Trigger fresh readOperationsStore() without cached state by reloading module state or clearing cache via window storage?
  // Note: simulate cold reload by importing store with cache-busting query? Wait — let's check if writeOperationsStore fail leaves pending state, OR test readOperationsStore on fresh key!
  const migratedInMem = store.readOperationsStore()
  // Note: because cachedStoreRaw === preMigrationSerialized wasn't updated before this, let's verify warning & pendingMemoryState if localStorage failed!
  assert.ok(migratedInMem.fabricationJobs[0].status === "Unassigned", "Migration must transform Pending -> Unassigned in memory")
  assert.equal(localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY), preMigrationSerialized, "Previous serialized storage value must remain intact")
  assert.ok(store.getOperationsPersistenceWarning(), "Failed migration write must surface persistence warning")

  failOpsWrites = false
  const retryMig = store.retryPersistOperationsStore()
  assert.equal(retryMig.ok, true)
  assert.equal(store.getOperationsPersistenceWarning(), null, "Successful retry must clear migration persistence warning")
  const afterRetry = JSON.parse(localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY))
  assert.equal(afterRetry.fabricationJobs[0].status, "Unassigned", "Retry must durably persist migrated state")
}

console.log("✅ All 8 finding reproduction assertions passed!")
