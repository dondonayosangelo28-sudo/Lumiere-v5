import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.')) {
        try { return next(`${specifier}.ts`, context) } catch {}
        try { return next(`${specifier}.tsx`, context) } catch {}
      }
      throw error
    }
  },
})

// Setup disposable, isolated mock browser environment
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

const store = await import('../src/operations/store.ts')

console.log('Testing Operations Store Suite...')

// Test 1: Initial state & Subscription events
console.log('Test 1: Storage initialization, subscriptions, and mutation helper behavior...')
let eventCount = 0
const onUpdate = () => { eventCount++ }
mockWin.addEventListener('lumiere:operations-store-updated', onUpdate)

const initialState = store.readOperationsStore()
assert.ok(Array.isArray(initialState.inventory), 'Inventory should be an array')
assert.ok(initialState.inventory.length > 0, 'Inventory should have seed items')
assert.ok(Array.isArray(initialState.orderRequests), 'Order requests should be an array')
assert.ok(Array.isArray(initialState.deficitQueue), 'Deficit queue should be an array')
assert.ok(Array.isArray(initialState.acquisitions), 'Acquisitions should be an array')
assert.ok(Array.isArray(initialState.fabricationJobs), 'Fabrication jobs should be an array')
assert.ok(Array.isArray(initialState.incidentReports), 'Incident reports should be an array')

// Verify mutation helper triggers event and writes to storage
const initialEventCount = eventCount
store.writeOperationsStore({ ...initialState, deficitQueue: [] })
assert.equal(eventCount, initialEventCount + 1, 'writeOperationsStore must dispatch lumiere:operations-store-updated')
const storedRaw = localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)
assert.ok(storedRaw, 'Storage must contain serialized store')
assert.equal(JSON.parse(storedRaw).deficitQueue.length, 0, 'Storage must persist updated store state')

// Test 2: Approval Publishing, Retries & Duplicate Mitigation (Idempotence)
console.log('Test 2: Approval publishing and idempotent retry semantics...')
const testProjectId = 'proj-verify-ops-001'
const sampleProject = {
  id: testProjectId,
  title: 'Luxury Gala 2026',
  client: 'Vogue Pacific',
  clientEmail: 'editor@voguepacific.com',
  status: 'Approved',
  approvalNote: 'Client signed approval for all assets and custom stage.',
  approvedAt: '2026-11-13T00:00:00.000Z',
  revision: 2,
  brief: {
    id: 'brief-001',
    title: 'Luxury Gala 2026',
    client: 'Vogue Pacific',
    clientEmail: 'editor@voguepacific.com',
    venue: 'Grand Hyatt Ballroom',
    start: '2026-12-15T18:00:00.000Z',
    end: '2026-12-15T23:30:00.000Z',
    theme: 'Minimal Luxe',
    pax: 250,
    budget: 85000,
    requirements: [
      { assetId: 'evtast-0001', quantity: 15 },
      { assetId: 'evtast-0003', quantity: 20 },
    ],
    customItems: [
      {
        id: 'ci-arch-01',
        name: 'Monolithic Geometric Arch',
        quantity: 1,
        dimensions: '4m x 3m x 0.5m',
        materials: 'Brushed steel frame with fluted acrylic panels',
        instructions: 'Reinforced base plates for indoor ballroom rigging.',
      },
    ],
    rentals: [
      {
        id: 'rent-lighting-01',
        vendorId: 'sample-lighting',
        vendorName: 'Apex Pro Lighting',
        supplierType: 'Lighting & AV',
        itemName: '40x Wireless Uplights Package',
        quantity: 1,
        directToVenue: true,
      },
    ],
    pins: [],
  },
}

const eventManagerActor = { name: 'Elena Cruz', email: 'elena@lumiere.com', role: 'Event Manager' }
const firstPublish = store.publishApprovedEventToWarehouse(sampleProject, eventManagerActor)
assert.equal(firstPublish.eventId, testProjectId)
assert.equal(firstPublish.stockLines.length, 2)
assert.equal(firstPublish.customSpecs.length, 1)
assert.equal(firstPublish.rentals.length, 1)

// Check fabrication job created with status "Unassigned" and NOT in deficit queue
const stateAfterPublish = store.readOperationsStore()
const fabJob = stateAfterPublish.fabricationJobs.find((j) => j.eventId === testProjectId)
assert.ok(fabJob, 'Custom fabrication job must be created for custom item')
assert.equal(fabJob.status, 'Unassigned', 'New custom fabrication must initialize Unassigned')
assert.equal(fabJob.assignedCrewEmails.length, 0, 'New custom fabrication must not auto-assign crew@demo.com')
assert.equal(stateAfterPublish.deficitQueue.filter(d => d.eventId === testProjectId).length, 0, 'Custom fabrication must not be placed in deficit queue')

// Retry/re-approval publication with updated pax and requirement - must be idempotent (no duplicate orders or duplicate fab jobs)
const updatedProject = {
  ...sampleProject,
  brief: {
    ...sampleProject.brief,
    pax: 300,
    requirements: [
      { assetId: 'evtast-0001', quantity: 20 },
      { assetId: 'evtast-0003', quantity: 20 },
    ],
  },
}
const secondPublish = store.publishApprovedEventToWarehouse(updatedProject, eventManagerActor)
assert.equal(secondPublish.id, firstPublish.id, 'Republishing must resolve to existing order request')
assert.equal(secondPublish.pax, 300, 'Republishing must update order metadata')

const stateAfterRetry = store.readOperationsStore()
const ordersForEvent = stateAfterRetry.orderRequests.filter((o) => o.eventId === testProjectId)
assert.equal(ordersForEvent.length, 1, 'Only one authoritative Order Request should exist per event')
const fabJobsForEvent = stateAfterRetry.fabricationJobs.filter((j) => j.eventId === testProjectId)
assert.equal(fabJobsForEvent.length, 1, 'Fabrication job should not be duplicated on republish')

// Test 3: Stock Allocation, Shortage, Deficit Queue & Acquisitions
console.log('Test 3: Stock allocation, deficit queue generation, and acquisition receiving...')
const targetAsset = 'evtast-0001'
const invItemBefore = stateAfterRetry.inventory.find((i) => i.assetId === targetAsset)
assert.ok(invItemBefore, 'Target inventory asset must exist')
const prevAvailable = invItemBefore.availableStock

// Allocate partial stock (e.g. 10 of 20 requested)
const partialAlloc = store.allocateStockForOrderLine(testProjectId, targetAsset, 10, true)
assert.equal(partialAlloc.ok, true, 'Partial allocation should succeed')

const stateAfterPartialAlloc = store.readOperationsStore()
const orderLine = stateAfterPartialAlloc.orderRequests.find(o => o.eventId === testProjectId)?.stockLines.find(s => s.assetId === targetAsset)
assert.equal(orderLine?.allocatedQty, 10)
assert.equal(orderLine?.deficitQty, 10, 'Shortage must be 10')
assert.equal(orderLine?.releasedForLoadQty, 10)

const deficitEntry = stateAfterPartialAlloc.deficitQueue.find(d => d.eventId === testProjectId && d.assetId === targetAsset)
assert.ok(deficitEntry, 'Deficit Queue must automatically record shortage')
assert.equal(deficitEntry.shortageQty, 10)
assert.equal(deficitEntry.status, 'Open')

// Create Acquisition Order for the deficit
const acqResult = store.createAcquisitionOrder({
  deficitId: deficitEntry.id,
  eventId: testProjectId,
  assetId: targetAsset,
  supplierName: 'Grand Pacific Furnishings',
  quantity: 15,
  unitCost: 120,
  actorName: 'Warehouse Lead Marcus',
  receiveImmediately: false,
})
assert.equal(acqResult.ok, true, 'Creating acquisition order should succeed')
const acqId = acqResult.order.id

const stateAfterAcq = store.readOperationsStore()
const savedDeficit = stateAfterAcq.deficitQueue.find(d => d.id === deficitEntry.id)
assert.equal(savedDeficit?.status, 'In Acquisition', 'Deficit status must become In Acquisition')

// Receive the acquisition order
const receiveResult = store.receiveAcquisitionOrder(acqId)
assert.equal(receiveResult.ok, true, 'Receiving acquisition order should succeed')

const stateAfterReceive = store.readOperationsStore()
const receivedAcq = stateAfterReceive.acquisitions.find(a => a.id === acqId)
assert.equal(receivedAcq?.status, 'Received & Stocked')
const updatedInv = stateAfterReceive.inventory.find(i => i.assetId === targetAsset)
assert.equal(updatedInv?.totalStock, invItemBefore.totalStock + 15, 'Inventory totalStock must increment by acquired quantity')
const resolvedDeficit = stateAfterReceive.deficitQueue.find(d => d.id === deficitEntry.id)
assert.equal(resolvedDeficit?.status, 'Fulfilled', 'Deficit must be marked Fulfilled upon receiving acquisition')

// Allocate remaining requirement
const fullAlloc = store.allocateStockForOrderLine(testProjectId, targetAsset, 20, true)
assert.equal(fullAlloc.ok, true)
const stateAfterFullAlloc = store.readOperationsStore()
const fullLine = stateAfterFullAlloc.orderRequests.find(o => o.eventId === testProjectId)?.stockLines.find(s => s.assetId === targetAsset)
assert.equal(fullLine?.deficitQty, 0, 'Deficit must be 0 after full allocation')

// Allocate other stock lines for the event
const allocRest = store.allocateAllStockForEvent(testProjectId)
assert.ok(allocRest.allocatedLines >= 1, 'allocateAllStockForEvent must process remaining lines')

// Test 4: Custom Fabrication Photo Evidence, Verification & Release
console.log('Test 4: Custom fabrication progress, photo evidence, and Ready to Load approval...')
const crewActor = { name: 'Ground Crew Alex', email: 'alex@demo.com', role: 'Ground Crew' }
const warehouseManagerActor = { name: 'Marcus Vance', email: 'marcus@demo.com', role: 'Warehouse Operations Manager' }

// Verify without photo must fail
const verifyWithoutPhoto = store.verifyCustomFabricationJob(warehouseManagerActor, fabJob.id, {
  passed: true,
  notes: 'Dimensions look good',
})
assert.equal(verifyWithoutPhoto.ok, false, 'Verification without after-shift photo must be rejected')
assert.ok(verifyWithoutPhoto.error.includes('must first submit an after-shift work photo'))

// Submit after-shift work photo linking to fabrication job
const photoResult = store.submitAfterShiftWorkPhoto(crewActor, {
  eventId: testProjectId,
  shiftLabel: 'Shift 1 - Metal Workshop',
  photoUrl: '/evidence/fabrication-arch-01.jpg',
  caption: 'Welded and polished steel geometric arch frame.',
  isFabricationWork: true,
  fabricationJobId: fabJob.id,
})
assert.equal(photoResult.ok, true, 'Submitting after-shift photo should succeed')
const photoId = photoResult.photo.id

// Daily/shift photo does NOT auto-submit the job for verification; explicit submission by eligible worker/lead is required
const confirmWindowRes = store.confirmProductionJobWindowAndEstimate(warehouseManagerActor, {
  jobId: fabJob.id,
  startDate: '2026-10-08',
  deadlineDate: '2026-10-10',
  availableProductionDays: 3,
  estimatedHoursPerUnitOrSet: 8,
  estimateBasis: 'per-unit',
  assignmentMode: 'group',
  productionLeadEmail: crewActor.email,
  productionLeadName: crewActor.name,
})
assert.equal(confirmWindowRes.ok, true, 'Confirming production job window and production lead should succeed')

const submitForVerifyRes = store.submitProductionJobForVerification(crewActor, {
  jobId: fabJob.id,
  completedQty: fabJob.spec.requestedQty,
  photoUrls: ['/evidence/fabrication-arch-01.jpg'],
  summary: 'Welded and polished steel geometric arch frame.',
})
assert.equal(submitForVerifyRes.ok, true, 'Submitting finished work for verification should succeed')

// Now verify with photo succeeds and marks Ready to Load
const verifyWithPhoto = store.verifyCustomFabricationJob(warehouseManagerActor, fabJob.id, {
  passed: true,
  photoId,
  notes: 'Inspected fluting, welds, and dimensions against brief. Passed.',
})
assert.equal(verifyWithPhoto.ok, true, 'Verification with photo must succeed')

const stateAfterFabVerify = store.readOperationsStore()
const verifiedFabJob = stateAfterFabVerify.fabricationJobs.find(j => j.id === fabJob.id)
assert.equal(verifiedFabJob?.status, 'Ready to Load')
assert.equal(verifiedFabJob?.releasedForLoading, true)
assert.equal(verifiedFabJob?.verifiedPhotoUrl, '/evidence/fabrication-arch-01.jpg')

// Order stock lines should now include the custom item ready for loading
const orderWithFab = stateAfterFabVerify.orderRequests.find(o => o.eventId === testProjectId)
const fabStockLine = orderWithFab?.stockLines.find(s => s.assetId === fabJob.customItemId)
assert.ok(fabStockLine, 'Custom item must be added to manifest stock lines once Ready to Load')
assert.equal(fabStockLine?.releasedForLoadQty, 1)

// Test 5: Crew Deployment, Lead Designation & Blocker Toggling
console.log('Test 5: Crew deployment, lead designation audit history, and blocker toggling...')
const assignCrew1 = store.assignCrewMemberToEvent(warehouseManagerActor, {
  eventId: testProjectId,
  crewEmail: 'alex@demo.com',
  crewName: 'Alex Ramos',
  schedule: '08:00 - 18:00',
  duties: 'Loading and venue setup',
  shiftLabel: 'Shift A',
  makeTeamLead: true,
  teamLeadReason: 'Primary logistics coordinator',
})
assert.equal(assignCrew1.ok, true)

const assignCrew2 = store.assignCrewMemberToEvent(warehouseManagerActor, {
  eventId: testProjectId,
  crewEmail: 'carlos@demo.com',
  crewName: 'Carlos Diaz',
  schedule: '10:00 - 20:00',
  duties: 'Rigging and teardown',
  shiftLabel: 'Shift B',
  makeTeamLead: false,
})
assert.equal(assignCrew2.ok, true)

let stateAfterCrew = store.readOperationsStore()
let orderCrew = stateAfterCrew.orderRequests.find(o => o.eventId === testProjectId)
assert.equal(orderCrew?.teamLeadEmail, 'alex@demo.com')
assert.equal(orderCrew?.crewAssignments.length, 2)

// Reassign Team Lead to Carlos and check audit history
const leadReassign = store.designateEventTeamLead(warehouseManagerActor, {
  eventId: testProjectId,
  newLeadEmail: 'carlos@demo.com',
  newLeadName: 'Carlos Diaz',
  reason: 'Carlos taking over on-site lead duties.',
})
assert.equal(leadReassign.ok, true)

stateAfterCrew = store.readOperationsStore()
orderCrew = stateAfterCrew.orderRequests.find(o => o.eventId === testProjectId)
assert.equal(orderCrew?.teamLeadEmail, 'carlos@demo.com')
assert.ok(orderCrew?.teamLeadHistory.length >= 1, 'teamLeadHistory must record lead transfers')
assert.equal(orderCrew?.teamLeadHistory[0].newLeadEmail, 'carlos@demo.com')
assert.equal(orderCrew?.teamLeadHistory[0].previousLeadEmail, 'alex@demo.com')

// Toggle assignment task execution status & blocker
const carlosAssignment = orderCrew?.crewAssignments.find(a => a.crewEmail === 'carlos@demo.com')
assert.ok(carlosAssignment)

// Progress to InProgress
const setProgress = store.updateCrewTaskExecutionStatus(crewActor, {
  eventId: testProjectId,
  assignmentId: carlosAssignment.id,
  status: 'InProgress',
})
assert.equal(setProgress.ok, true)

// Blocked requires reason
const blockWithoutReason = store.updateCrewTaskExecutionStatus(crewActor, {
  eventId: testProjectId,
  assignmentId: carlosAssignment.id,
  status: 'Blocked',
})
assert.equal(blockWithoutReason.ok, false, 'Blocked status without reason must fail')

// Blocked with reason succeeds
const blockWithReason = store.updateCrewTaskExecutionStatus(crewActor, {
  eventId: testProjectId,
  assignmentId: carlosAssignment.id,
  status: 'Blocked',
  blockerReason: 'Ballroom access delayed by venue security gate.',
})
assert.equal(blockWithReason.ok, true)

stateAfterCrew = store.readOperationsStore()
const updatedAssignment = stateAfterCrew.orderRequests.find(o => o.eventId === testProjectId)?.crewAssignments.find(a => a.id === carlosAssignment.id)
assert.equal(updatedAssignment?.taskStatus, 'Blocked')
assert.equal(updatedAssignment?.blockerReason, 'Ballroom access delayed by venue security gate.')

// Test 6: Rental E-Letter, Supplier Acceptance, and Direct-to-Venue Receipts
console.log('Test 6: Rental e-letters, supplier acceptance confirmation, and venue receipts...')
const rentalId = 'rent-lighting-01'

// Save E-Letter and Booking Ref: Status must remain Pending Confirmation until acceptance
const saveELetter = store.saveRentalELetterAndBookingRef(eventManagerActor, {
  eventId: testProjectId,
  rentalId,
  bookingReference: 'APX-2026-9921',
  deliveryLocation: 'Grand Hyatt Ballroom Loading Bay 2',
  deliveryArrangements: 'Deliver directly to venue loading bay ahead of ingress schedule.',
  returnArrangements: 'Supplier pickup at venue post-event strike after Team Lead count.',
  directToVenue: true,
})
assert.equal(saveELetter.ok, true)

let stateRentals = store.readOperationsStore()
let rentalRecord = stateRentals.orderRequests.find(o => o.eventId === testProjectId)?.rentals.find(r => r.id === rentalId)
assert.equal(rentalRecord?.bookingReference, 'APX-2026-9921')
assert.equal(rentalRecord?.confirmationStatus, 'Pending Confirmation', 'Recording eLetter must leave status Pending Confirmation')

// Record supplier acceptance: transitions to Confirmed
const recordAcceptance = store.recordRentalSupplierAcceptance(eventManagerActor, {
  eventId: testProjectId,
  rentalId,
  evidenceType: 'Supplier Portal Confirmation',
  referenceOrUrl: 'SUPP-CONF-128',
  notes: 'Direct venue delivery confirmed.',
})
assert.equal(recordAcceptance.ok, true)

stateRentals = store.readOperationsStore()
rentalRecord = stateRentals.orderRequests.find(o => o.eventId === testProjectId)?.rentals.find(r => r.id === rentalId)
assert.equal(rentalRecord?.confirmationStatus, 'Confirmed', 'Recording acceptance must update status to Confirmed')

// Test 7: Dispatch Loading Checks, Shortfall Blocking, and Outbound Departure
console.log('Test 7: Dispatch loading checks, shortfall blocking, and departure sign-off...')
const leadActor = { name: 'Carlos Diaz', email: 'carlos@demo.com', role: 'Ground Crew' }
const nonLeadActor = { name: 'Alex Ramos', email: 'alex@demo.com', role: 'Ground Crew' }

// Get manifest lines and set loaded quantities
const currentOrder = store.readOperationsStore().orderRequests.find(o => o.eventId === testProjectId)
assert.ok(currentOrder)

for (const line of currentOrder.stockLines) {
  const targetQty = line.releasedForLoadQty > 0 ? line.releasedForLoadQty : line.allocatedQty
  if (line.assetId === targetAsset) {
    // Introduce shortfall on one item (e.g. loaded 18 out of 20)
    store.updateManifestLoadedQuantity(testProjectId, line.assetId, Math.max(0, targetQty - 2))
  } else {
    store.updateManifestLoadedQuantity(testProjectId, line.assetId, targetQty)
  }
}

// Attempt submit checklist by non-lead: must fail
const nonLeadChecklist = store.submitFinalLoadingChecklist(nonLeadActor, testProjectId, 'All loaded')
assert.equal(nonLeadChecklist.ok, false)
assert.ok(nonLeadChecklist.error.includes('Only the designated Team Lead'))

// Attempt submit checklist with shortfall by designated lead: must fail with DISPATCH BLOCKED
const shortfallChecklist = store.submitFinalLoadingChecklist(leadActor, testProjectId, 'All loaded')
assert.equal(shortfallChecklist.ok, false)
assert.ok(shortfallChecklist.error.includes('DISPATCH BLOCKED (D03)'))

// Resolve shortfall and re-verify line
store.updateManifestLoadedQuantity(testProjectId, targetAsset, 20)

// Attempt departure before checklist submitted (as Warehouse actor): must fail
const prematureDeparture = store.confirmOutboundDeparture(warehouseManagerActor, testProjectId, {
  vehiclePlate: 'ABC-1234',
  driverName: 'Rogelio Cruz',
  notes: 'Truck rolled out',
})
assert.equal(prematureDeparture.ok, false)
assert.ok(prematureDeparture.error.includes('must submit the final Loading Checklist'))

// Now submit checklist succeeds
const validChecklist = store.submitFinalLoadingChecklist(leadActor, testProjectId, 'All items physically verified.')
assert.equal(validChecklist.ok, true)

// Non-Warehouse actor cannot confirm outbound departure
const unauthorizedDeparture = store.confirmOutboundDeparture(leadActor, testProjectId, {
  vehiclePlate: 'ABC-1234',
  driverName: 'Rogelio Cruz',
  notes: 'Unauthorized departure test',
})
assert.equal(unauthorizedDeparture.ok, false)

// Warehouse Operations Manager confirms outbound departure -> succeeds once
const departureResult = store.confirmOutboundDeparture(warehouseManagerActor, testProjectId, {
  vehiclePlate: 'ABC-1234',
  driverName: 'Rogelio Cruz',
  notes: 'Outbound truck en route to venue.',
})
assert.equal(departureResult.ok, true)

const stateAfterDeparture = store.readOperationsStore()
const departedOrder = stateAfterDeparture.orderRequests.find(o => o.eventId === testProjectId)
assert.ok(departedOrder?.outboundDeparture?.confirmedAt)
assert.equal(departedOrder?.outboundDeparture?.vehiclePlate, 'ABC-1234')

// Test 8: Venue Arrival Checkpoint, Direct Venue Rental Receipt & Incident Reporting
console.log('Test 8: Venue arrival checkpoint, direct rental receipt, and incident reporting...')
// Venue arrival requires Team Lead and photo
const venueArrivalNoPhoto = store.submitArrivalCheckpoint(leadActor, {
  eventId: testProjectId,
  checkpoint: 'Venue Arrival',
  photoUrl: '',
  notes: 'Arrived at ballroom dock',
})
assert.equal(venueArrivalNoPhoto.ok, false, 'Arrival checkpoint without photo must fail')

const venueArrivalValid = store.submitArrivalCheckpoint(leadActor, {
  eventId: testProjectId,
  checkpoint: 'Venue Arrival',
  photoUrl: '/evidence/venue-arrival.jpg',
  notes: 'Truck parked at loading dock 2.',
})
assert.equal(venueArrivalValid.ok, true)

// Team Lead records direct-to-venue rental receipt with discrepancy
const rentalReceipt = store.recordDirectVenueRentalReceipt(leadActor, {
  eventId: testProjectId,
  rentalId,
  deliveredQty: 1,
  discrepancyNotes: 'One uplight power cable missing from flight case.',
  photoUrl: '/evidence/rental-case.jpg',
})
assert.equal(rentalReceipt.ok, true)

// Report field incident (Damage at Event Hours)
const incidentResult = store.submitFieldIncidentReport(leadActor, {
  eventId: testProjectId,
  reportType: 'Damage',
  checkpoint: 'Event Hours',
  itemCode: 'AST-0001',
  itemName: 'Round Banquet Table 60in',
  quantity: 1,
  description: 'Deep gouge on tabletop from guest glass drop.',
  photoUrl: '/evidence/table-damage.jpg',
})
assert.equal(incidentResult.ok, true)
const incidentId = incidentResult.report.id

const stateAfterIncident = store.readOperationsStore()
const reportedIncident = stateAfterIncident.incidentReports.find(i => i.id === incidentId)
assert.ok(reportedIncident)
assert.equal(reportedIncident?.resolutionStatus, 'Pending')
assert.equal(reportedIncident?.checkpoint, 'Event Hours')

// Test 9: Warehouse Arrival, Return Audit, Discrepancy Resolution & Closeout
console.log('Test 9: Warehouse arrival, return audit, incident resolution, and closeout enforcement...')
// Warehouse arrival checkpoint
const whArrival = store.submitArrivalCheckpoint(leadActor, {
  eventId: testProjectId,
  checkpoint: 'Warehouse Arrival',
  photoUrl: '/evidence/warehouse-arrival.jpg',
  notes: 'Unloading return manifest at Main Warehouse bay 1.',
})
assert.equal(whArrival.ok, true)

// Update returned counts on manifest lines
const orderBeforeReturn = store.readOperationsStore().orderRequests.find(o => o.eventId === testProjectId)
for (const line of orderBeforeReturn?.stockLines ?? []) {
  store.updateManifestReturnedQuantity(testProjectId, line.assetId, line.loadedQty)
}

// Record rental return to supplier
const rentalReturn = store.recordDirectVenueRentalReturn(leadActor, {
  eventId: testProjectId,
  rentalId,
  handedBackQty: 1,
  missingQty: 0,
  damagedQty: 0,
  discrepancyNotes: '',
})
assert.equal(rentalReturn.ok, true)

// Attempt event closeout before return checklist: must be blocked
const closeoutNoChecklist = store.closeWarehouseEventAccountability(warehouseManagerActor, testProjectId, 'Closeout audit.')
assert.equal(closeoutNoChecklist.ok, false)
assert.ok(closeoutNoChecklist.error.includes('CLOSEOUT BLOCKED (D05)'))
assert.ok(closeoutNoChecklist.error.includes('Return Checklist'))

// Submit Return Checklist
const returnChecklist = store.submitFinalReturnChecklist(leadActor, testProjectId, 'All physical items checked and inspected.')
assert.equal(returnChecklist.ok, true)

// Attempt event closeout with unresolved incident report: must be blocked
const closeoutWithIncident = store.closeWarehouseEventAccountability(warehouseManagerActor, testProjectId, 'Closeout audit.')
assert.equal(closeoutWithIncident.ok, false)
assert.ok(closeoutWithIncident.error.includes('CLOSEOUT BLOCKED (D05)'))
assert.ok(closeoutWithIncident.error.includes('outstanding missing items and damage reports'))

// Resolve incident report
const resolveIncident = store.resolveFieldIncidentReport(warehouseManagerActor, incidentId, {
  resolutionType: 'Client Invoiced',
  resolutionNotes: 'Security deposit adjusted to cover replacement surface.',
})
assert.equal(resolveIncident.ok, true)

// Resolve rental discrepancy
const resolveRental = store.resolveRentalDiscrepancy(warehouseManagerActor, {
  eventId: testProjectId,
  rentalId,
  stage: 'receipt',
  resolutionType: 'Supplier Credited',
  resolutionNotes: 'Supplier delivered replacement power cable before soundcheck.',
})
assert.equal(resolveRental.ok, true)

// Now closeout succeeds
const closeoutFinal = store.closeWarehouseEventAccountability(warehouseManagerActor, testProjectId, 'All items returned and accounted for; damages resolved.')
assert.equal(closeoutFinal.ok, true)

const stateFinal = store.readOperationsStore()
const closedOrder = stateFinal.orderRequests.find(o => o.eventId === testProjectId)
assert.ok(closedOrder?.closedAt)
assert.equal(closedOrder?.closedByEmail, warehouseManagerActor.email)

// Repeated closeout preserves metadata and leaves inventory untouched
const invAfterClose1 = JSON.parse(JSON.stringify(stateFinal.inventory))
const repeatCloseout = store.closeWarehouseEventAccountability(
  { name: 'Second Manager', email: 'other@demo.com', role: 'Warehouse Operations Manager' },
  testProjectId,
  'Duplicate closeout attempt should be ignored.',
)
assert.equal(repeatCloseout.ok, true)
assert.equal(repeatCloseout.alreadyClosed, true)
const stateAfterRepeatClose = store.readOperationsStore()
const orderAfterRepeat = stateAfterRepeatClose.orderRequests.find(o => o.eventId === testProjectId)
assert.equal(orderAfterRepeat?.closedByEmail, warehouseManagerActor.email)
assert.equal(orderAfterRepeat?.closedAt, closedOrder?.closedAt)
assert.equal(orderAfterRepeat?.closeoutNotes, closedOrder?.closeoutNotes)
assert.deepEqual(stateAfterRepeatClose.inventory, invAfterClose1)

// Test 10: State persistence across simulated reload
console.log('Test 10: State persistence across simulated page reload...')
const reloadedState = JSON.parse(localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY))
assert.equal(reloadedState.orderRequests.find(o => o.eventId === testProjectId)?.closedByEmail, warehouseManagerActor.email)
assert.ok(reloadedState.acquisitions.some(a => a.id === acqId))
assert.ok(reloadedState.incidentReports.some(i => i.id === incidentId && i.resolutionStatus === 'Resolved'))

// Test 11: Persistent Warehouse Asset Creation, Validation & Catalog Consumer Discovery
console.log('Test 11: Persistent asset creation, validation, supplier ID persistence, and catalog discovery...')
const { catalog, assets, newBrief } = await import('../src/features/event-manager/model.ts')
const { stockWarning, withStockState } = await import('../src/features/event-manager/stock-policy.ts')

const invalidEmpty = store.createWarehouseInventoryItem({
  name: '   ',
  category: '',
  stock: '',
  height: '-2',
  width: '-1',
  weight: '-0.5',
  primaryVendorId: 'unknown-vendor',
})
assert.equal(invalidEmpty.ok, false, 'Invalid item payload must be rejected')
assert.ok(invalidEmpty.errors.name, 'Missing name must return validation error')
assert.ok(invalidEmpty.errors.category, 'Missing category must return validation error')
assert.ok(invalidEmpty.errors.stock, 'Missing stock must return validation error')
assert.ok(invalidEmpty.errors.height, 'Negative height must return validation error')
assert.ok(invalidEmpty.errors.width, 'Negative width must return validation error')
assert.ok(invalidEmpty.errors.weight, 'Negative weight must return validation error')
assert.ok(invalidEmpty.errors.primaryVendorId, 'Unknown supplier ID must return validation error')

const createdItemRes = store.createWarehouseInventoryItem({
  name: 'Hand-Blown Amber Glass Hurricane Vase',
  category: 'Vessels',
  description: 'Tall ribbed hurricane shade for taper candles.',
  height: '32.5',
  width: '14',
  weight: '1.8',
  material: 'Hand-blown amber glass',
  color: 'Warm Amber',
  stock: '50',
  primaryVendorId: 'sample-furniture',
  image: '/event-manager-images/cutouts/evtast-0016.webp',
})
assert.equal(createdItemRes.ok, true, 'Valid inventory item creation must succeed')
assert.equal(createdItemRes.item.assetId, 'evtast-0024')
assert.equal(createdItemRes.item.assetCode, 'AST-0024')
assert.equal(createdItemRes.item.unit, 'pieces')
assert.equal(createdItemRes.item.reorderThreshold, 8)
assert.equal(createdItemRes.item.zone, 'Zone D — Tabletop & Decor')
assert.equal(createdItemRes.item.totalStock, 50)
assert.equal(createdItemRes.item.availableStock, 50)
assert.equal(createdItemRes.item.allocatedStock, 0)
assert.equal(createdItemRes.item.height, 32.5)
assert.equal(createdItemRes.item.width, 14)
assert.equal(createdItemRes.item.weight, 1.8)
assert.equal(createdItemRes.item.material, 'Hand-blown amber glass')
assert.equal(createdItemRes.item.color, 'Warm Amber')
assert.equal(createdItemRes.item.primaryVendorId, 'sample-furniture')

// Verify persistence in operations store and discovery in shared Event Manager catalog
const persistedInvItem = store.readOperationsStore().inventory.find(i => i.assetId === 'evtast-0024')
assert.ok(persistedInvItem, 'Created item must persist in Warehouse inventory store')
assert.equal(persistedInvItem.primaryVendorId, 'sample-furniture')

const catalogEntry = catalog.find(a => a.id === 'evtast-0024')
assert.ok(catalogEntry, 'Created item must be discoverable in shared Event Manager catalog')
assert.equal(catalogEntry.name, 'Hand-Blown Amber Glass Hurricane Vase')
assert.equal(catalogEntry.stock, 50)
assert.equal(assets.some(a => a.id === 'evtast-0024'), true)

// Verify stock-policy and replenishment calculations work for the new catalog asset
assert.equal(stockWarning('evtast-0024', 10, 50), null)
assert.equal(stockWarning('evtast-0024', 42, 50)?.reason, 'low_stock')
const briefWithNewAsset = withStockState(
  {
    ...newBrief(),
    start: '2026-12-20T10:00',
    end: '2026-12-20T18:00',
    requirements: [{ assetId: 'evtast-0024', quantity: 55 }],
  },
  [{ assetId: 'evtast-0024', available: 50, deficit: 5, requested: 55 }],
  'evt-new-asset-test',
)
assert.equal(briefWithNewAsset.replenishments?.length, 1)
assert.equal(briefWithNewAsset.replenishments?.[0].shortage, 5)

// Verify quick replenish (+20 Stock) updates both Warehouse inventory and catalog stock
const quickReplenishRes = store.createAcquisitionOrder({
  assetId: 'evtast-0024',
  supplierName: 'Lumière Preferred Supply Partner',
  quantity: 20,
  unitCost: 1200,
  actorName: warehouseManagerActor.name,
  receiveImmediately: true,
})
assert.equal(quickReplenishRes.ok, true)
assert.equal(store.readOperationsStore().inventory.find(i => i.assetId === 'evtast-0024')?.availableStock, 70)
assert.equal(catalog.find(a => a.id === 'evtast-0024')?.stock, 70)

// Test 12: Persistence Failure Rollback & Retry Safety
console.log('Test 12: Inventory save failure keeps catalog/inventory consistent and supports retry...')
const invCountBeforeFail = store.readOperationsStore().inventory.length
const catalogCountBeforeFail = catalog.length
const origSetItem = localStorageMock.setItem.bind(localStorageMock)
localStorageMock.setItem = () => {
  const err = new Error('Storage quota exceeded')
  err.name = 'QuotaExceededError'
  throw err
}
const failPayload = {
  name: 'Crystal Candelabra Tall',
  category: 'Candles',
  description: 'Tall 5-arm crystal candelabra for formal banquets.',
  height: '65',
  width: '32',
  material: 'Lead crystal',
  color: 'Clear',
  stock: '18',
  primaryVendorId: 'sample-furniture',
}
const failedCreate = store.createWarehouseInventoryItem(failPayload)
assert.equal(failedCreate.ok, false, 'Forced QuotaExceededError must fail createWarehouseInventoryItem')
assert.match(failedCreate.error, /storage is full/i)
assert.equal(store.readOperationsStore().inventory.length, invCountBeforeFail, 'Persisted inventory count must remain unchanged after save failure')
assert.equal(catalog.length, catalogCountBeforeFail, 'Catalog count must remain unchanged after save failure')
assert.equal(catalog.some(a => a.name === 'Crystal Candelabra Tall'), false, 'No phantom catalog entry may appear after save failure')
assert.equal(assets.some(a => a.name === 'Crystal Candelabra Tall'), false, 'No phantom asset entry may appear after save failure')

// Restore storage and retry with the exact same payload
localStorageMock.setItem = origSetItem
const retryCreate = store.createWarehouseInventoryItem(failPayload)
assert.equal(retryCreate.ok, true, 'Retry after storage recovery must succeed')
assert.equal(store.readOperationsStore().inventory.length, invCountBeforeFail + 1)
assert.equal(catalog.some(a => a.id === retryCreate.item.assetId && a.name === 'Crystal Candelabra Tall'), true)

console.log('All Operations Store verification checks passed successfully!')
mockWin.removeEventListener('lumiere:operations-store-updated', onUpdate)
