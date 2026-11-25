import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.')) {
        try { return next(`${specifier}.ts`, context) } catch { }
        try { return next(`${specifier}.tsx`, context) } catch { }
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
  clear: () => { },
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
const roleConfig = await import('../src/auth/roleConfig.ts')

console.log('Testing Warehouse Operations & Ground Crew Phase 2 (Navigation & Overview) Suite...')

// ----------------------------------------------------------------------------
// 1. Warehouse 7-Destination Navigation & Ground Crew My Work Consolidation
// ----------------------------------------------------------------------------
console.log('Phase 2.1: Warehouse 7 destinations (Overview once) & Ground Crew My Work sidebar entries...')

const whModules = roleConfig.roleModules['Warehouse Operations Manager']
assert.deepEqual(
  whModules.map((m) => m.label),
  [
    'Events',
    'Asset Inventory',
    'Replenishment',
    'Vendors',
    'Crew & Scheduling',
    'Production',
    'Verification',
    'Damage & Missing',
    'Dispatch & Returns',
  ],
  'Warehouse roleModules must define the 9 module entries after Overview (10 total)',
)
assert.equal(
  whModules.some((m) => m.label === 'Overview' || m.key === 'overview'),
  false,
  'Overview must not be duplicated inside roleModules (Shell prepends Overview once)',
)

const gcModules = roleConfig.roleModules['Ground Crew']
assert.deepEqual(
  gcModules.map((m) => ({ key: m.key, label: m.label })),
  [{ key: 'my-work', label: 'My Work' }],
  'Ground Crew sidebar must have My Work as its single operational module entry',
)

// ----------------------------------------------------------------------------
// 2. Legacy Route Aliases & Context Preservation
// ----------------------------------------------------------------------------
console.log('Phase 2.2: Warehouse & Ground Crew legacy route alias mapping and context preservation...')

const whAliasChecks = [
  {
    raw: 'module-order-requests',
    canonical: 'module-events',
    moduleKey: 'events',
    subView: 'orders',
  },
  {
    raw: 'module-deficit-queue',
    canonical: 'module-replenishment-deficits',
    moduleKey: 'replenishment-deficits',
    subView: 'deficits',
  },
  {
    raw: 'module-asset-acquisition',
    canonical: 'module-replenishment-deficits',
    moduleKey: 'replenishment-deficits',
    subView: 'acquisitions',
  },
  {
    raw: 'module-personnel-deployment',
    canonical: 'module-crew-scheduling',
    moduleKey: 'crew-scheduling',
    subView: 'crew',
  },
  {
    raw: 'module-custom-fabrication',
    canonical: 'module-production',
    moduleKey: 'production',
    subView: 'production',
  },
  {
    raw: 'module-damage-assessment',
    canonical: 'module-damage-missing-reports',
    moduleKey: 'damage-missing-reports',
    subView: 'incidents',
  },
]

for (const check of whAliasChecks) {
  const res = store.resolveOperationsRoute(check.raw)
  assert.equal(res.canonicalRoute, check.canonical, `${check.raw} must map to ${check.canonical}`)
  assert.equal(res.moduleKey, check.moduleKey)
  assert.equal(res.isLegacyAlias, true)
  assert.equal(res.impliedContext.subView, check.subView)
}

const parameterizedVerify = store.resolveOperationsRoute(
  'module-verification?eventId=evt-celeste-marcos&jobId=fab-celeste-1',
)
assert.equal(parameterizedVerify.canonicalRoute, 'module-verification')
assert.equal(parameterizedVerify.impliedContext.eventId, 'evt-celeste-marcos')
assert.equal(parameterizedVerify.impliedContext.jobId, 'fab-celeste-1')
assert.equal(parameterizedVerify.impliedContext.subView, 'verification')

const gcAliasChecks = [
  { raw: 'module-assigned-work', op: 'overview' },
  { raw: 'module-dispatch-checks', op: 'loading' },
  { raw: 'module-venue-arrival', op: 'venue-arrival' },
  { raw: 'module-evidence-capture', op: 'evidence' },
  { raw: 'module-post-event-audits', op: 'return-audit' },
]

for (const check of gcAliasChecks) {
  const res = store.resolveOperationsRoute(check.raw)
  assert.equal(res.canonicalRoute, 'module-my-work', `${check.raw} must map to module-my-work`)
  assert.equal(res.moduleKey, 'my-work')
  assert.equal(res.isLegacyAlias, true)
  assert.equal(
    res.impliedContext.groundCrewOperation,
    check.op,
    `${check.raw} must open ${check.op} within My Work`,
  )
}

// Context persistence in sessionStorage + memory
store.setOperationsNavigationContext({
  eventId: 'evt-celeste-marcos',
  jobId: 'fab-celeste-1',
  subView: 'verification',
})
const readCtx = store.getOperationsNavigationContext()
assert.equal(readCtx.eventId, 'evt-celeste-marcos')
assert.equal(readCtx.jobId, 'fab-celeste-1')
assert.equal(readCtx.subView, 'verification')
assert.equal(store.getWarehouseSelectedEventId(), 'evt-celeste-marcos')

// ----------------------------------------------------------------------------
// 3. Frontend Route Access Boundaries
// ----------------------------------------------------------------------------
console.log('Phase 2.3: Frontend route access (canAccess & moduleForRoute) across canonical and legacy routes...')

for (const route of [
  'overview',
  'module-events',
  'module-asset-inventory',
  'module-crew-scheduling',
  'module-production',
  'module-verification',
  'module-dispatch-returns',
  'module-order-requests',
  'module-deficit-queue',
  'module-asset-acquisition',
  'module-personnel-deployment',
  'module-custom-fabrication',
  'module-damage-assessment',
]) {
  assert.equal(
    roleConfig.canAccess('Warehouse Operations Manager', route),
    true,
    `Warehouse Operations Manager must have access to ${route}`,
  )
}
assert.equal(roleConfig.canAccess('Warehouse Operations Manager', 'module-my-work'), false)
assert.equal(roleConfig.canAccess('Warehouse Operations Manager', 'module-assigned-work'), false)
assert.equal(roleConfig.canAccess('Warehouse Operations Manager', 'accounts'), false)

for (const route of [
  'overview',
  'module-my-work',
  'module-assigned-work',
  'module-dispatch-checks',
  'module-venue-arrival',
  'module-evidence-capture',
  'module-post-event-audits',
]) {
  assert.equal(
    roleConfig.canAccess('Ground Crew', route),
    true,
    `Ground Crew must have access to ${route}`,
  )
}
assert.equal(roleConfig.canAccess('Ground Crew', 'module-events'), false)
assert.equal(roleConfig.canAccess('Ground Crew', 'module-production'), false)
assert.equal(roleConfig.canAccess('Ground Crew', 'module-verification'), false)

// ----------------------------------------------------------------------------
// 4. Overview Calculations, Missing-Data Handling, and Action Queue
// ----------------------------------------------------------------------------
console.log('Phase 2.4: Overview summaries, missing-data ("Not configured" / "Not selected") handling, and 7-category action queue...')

localStorageMock.clear()
const warehouseActor = {
  name: 'Marcus Vance',
  email: 'warehouse@demo.com',
  role: 'Warehouse Operations Manager',
}
const crewLeadActor = {
  name: 'Jordan Reyes',
  email: 'crew@demo.com',
  role: 'Ground Crew',
}

// Publish a second event with unconfigured production window, no roster, no Team Lead, and no schedules
const unconfiguredEventId = 'evt-phase2-unconfigured'
store.publishApprovedEventToWarehouse(
  {
    id: unconfiguredEventId,
    title: 'Aurora Gala Unconfigured',
    client: 'Aurora Foundation',
    clientEmail: 'info@aurora.org',
    status: 'Approved',
    approvedAt: '2026-11-12T00:00:00.000Z',
    revision: 1,
    brief: {
      id: 'brief-p2',
      title: 'Aurora Gala Unconfigured',
      client: 'Aurora Foundation',
      clientEmail: 'info@aurora.org',
      venue: 'Peninsula Manila Conservatory',
      start: '2026-11-28T18:00:00+08:00',
      end: '2026-11-28T23:00:00+08:00',
      pax: 120,
      theme: 'Winter Luminescence',
      budget: 650000,
      requirements: [{ assetId: 'evtast-0001', quantity: 20 }],
      customItems: [
        {
          id: 'cust-aurora-canopy',
          name: 'Suspended Crystal Canopy',
          quantity: 2,
          dimensions: '6m x 4m',
          materials: 'Aluminum truss & crystal strands',
          instructions: 'Rig over main dining table.',
        },
      ],
      rentals: [],
      pins: [],
    },
  },
  { name: 'Elena Cruz', email: 'elena@lumiere.com', role: 'Event Manager' },
)

let overview = store.computeWarehouseOverviewData(store.readOperationsStore())
const unconfigSummary = overview.eventSummaries.find((s) => s.eventId === unconfiguredEventId)
assert.ok(unconfigSummary, 'Unconfigured event summary must exist')

// Event staffing recommendation uses guest formula (120 guests -> [5, 8])
assert.equal(unconfigSummary.eventStaffingRecommendation.minCrew, 5)
assert.equal(unconfigSummary.eventStaffingRecommendation.maxCrew, 8)

// Missing production window -> must show "Not configured", never 0 or numeric crew recommendation!
assert.equal(unconfigSummary.productionStaffingRecommendation.status, 'not-configured')
assert.equal(unconfigSummary.productionStaffingRecommendation.displayLabel, 'Not configured')
assert.equal(unconfigSummary.productionStaffingRecommendation.recommendedCrew, null)

// Missing roster, lead, and schedules -> "Not configured" / "Not selected"
assert.equal(unconfigSummary.rosterSummary.status, 'not-configured')
assert.equal(unconfigSummary.rosterSummary.displayLabel, 'Not configured')
assert.equal(unconfigSummary.teamLeadSummary.status, 'not-selected')
assert.equal(unconfigSummary.teamLeadSummary.displayLabel, 'Not selected')
assert.equal(unconfigSummary.scheduledCapacitySummary.status, 'not-configured')
assert.equal(unconfigSummary.scheduledCapacitySummary.displayLabel, 'Not configured')

// Trigger stock deficit, crew blocker, daily workload > 8h, shared-shift shortfall, and legacy flag
// so all 7 Action Queue categories are populated and verified!
store.allocateStockForOrderLine(unconfiguredEventId, 'evtast-0001', 5, true) // creates deficit of 15

store.addCrewToEventRoster(warehouseActor, {
  eventId: unconfiguredEventId,
  crewEmail: 'crew@demo.com',
  crewName: 'Jordan Reyes',
})
store.assignCrewMemberToEvent(warehouseActor, {
  eventId: unconfiguredEventId,
  crewEmail: 'crew@demo.com',
  crewName: 'Jordan Reyes',
  schedule: '08:00 - 17:00',
  duties: 'Setup canopy',
  shiftLabel: 'Shift 1',
  makeTeamLead: true,
})
const unconfigOrder = store.readOperationsStore().orderRequests.find((o) => o.eventId === unconfiguredEventId)
store.updateCrewTaskExecutionStatus(crewLeadActor, {
  eventId: unconfiguredEventId,
  assignmentId: unconfigOrder.crewAssignments[0].id,
  status: 'Blocked',
  blockerReason: 'Service elevator reserved by hotel engineering.',
})

// Schedule a 10h shift on a shared shift requiring 2 crew (with only 1 worker scheduled) -> triggers both >8h daily workload warning AND shared-shift shortfall!
const auroraJob = store.readOperationsStore().fabricationJobs.find((j) => j.eventId === unconfiguredEventId)
store.scheduleWorkerShift(warehouseActor, {
  eventId: unconfiguredEventId,
  jobId: auroraJob.id,
  crewEmail: 'crew@demo.com',
  crewName: 'Jordan Reyes',
  activityType: 'fabrication',
  startDateTime: '2026-11-25T08:00',
  endDateTime: '2026-11-25T19:00',
  breakStartDateTime: '2026-11-25T12:00',
  breakEndDateTime: '2026-11-25T13:00',
  isSharedShift: true,
  requiredSimultaneousCrew: 2,
  instructions: 'Build canopy frame',
})

overview = store.computeWarehouseOverviewData(store.readOperationsStore())

// Verify all 7 Action Queue categories have actionable entries with correct target routes!
assert.ok(overview.actionCountsByCategory['awaiting-verification'] >= 1, 'Must have awaiting-verification action')
assert.ok(overview.actionCountsByCategory['crew-blocker'] >= 1, 'Must have crew-blocker action')
assert.ok(overview.actionCountsByCategory['unconfirmed-production-window'] >= 1, 'Must have unconfirmed-production-window action')
assert.ok(overview.actionCountsByCategory['schedule-workload-conflict'] >= 1, 'Must have schedule-workload-conflict action')
assert.ok(overview.actionCountsByCategory['shared-shift-shortfall'] >= 1, 'Must have shared-shift-shortfall action')
assert.ok(overview.actionCountsByCategory['legacy-review-flag'] >= 1, 'Must have legacy-review-flag action')
assert.ok(overview.actionCountsByCategory['event-stock-deficit'] >= 1, 'Must have event-stock-deficit action')

const deficitAction = overview.actionQueue.find((a) => a.category === 'event-stock-deficit')
assert.equal(deficitAction.targetRoute, 'module-replenishment-deficits')
assert.equal(deficitAction.targetContext.subView, 'deficits')
assert.equal(deficitAction.targetContext.eventId, unconfiguredEventId)

const verifyAction = overview.actionQueue.find((a) => a.category === 'awaiting-verification')
assert.equal(verifyAction.targetRoute, 'module-verification')
assert.equal(verifyAction.targetContext.subView, 'verification')

const unconfirmedWinAction = overview.actionQueue.find((a) => a.category === 'unconfirmed-production-window')
assert.equal(unconfirmedWinAction.targetRoute, 'module-production')
assert.equal(unconfirmedWinAction.targetContext.jobId, auroraJob.id)

// ----------------------------------------------------------------------------
// 7. Damage & Missing Reports Role Guard & Report-Specific Routing
// ----------------------------------------------------------------------------
console.log('Phase 2.7: resolveFieldIncidentReport role guard & reportId deep-link...')
const damageRouteWithReport = store.resolveOperationsRoute(
  'module-damage-missing-reports?eventId=evt-celeste-marcos&reportId=inc-test-1',
)
assert.equal(damageRouteWithReport.canonicalRoute, 'module-damage-missing-reports')
assert.equal(damageRouteWithReport.moduleKey, 'damage-missing-reports')
assert.equal(damageRouteWithReport.impliedContext.eventId, 'evt-celeste-marcos')
assert.equal(damageRouteWithReport.impliedContext.reportId, 'inc-test-1')

store.submitFieldIncidentReport(crewLeadActor, {
  eventId: 'evt-celeste-marcos',
  itemCode: 'AST-0001',
  itemName: 'Gold Arch Backdrop',
  reportType: 'Damage',
  quantity: 1,
  checkpoint: 'Return Audit',
  description: 'Role guard regression check report',
  photoUrl: 'data:image/png;base64,iVBORw0KGgo=',
})
const latestIncident = store.readOperationsStore().incidentReports[0]
assert.ok(latestIncident, 'Incident report must be created')

const deniedResolution = store.resolveFieldIncidentReport(crewLeadActor, {
  incidentId: latestIncident.id,
  resolutionType: 'Write Off / Lost',
  resolutionNotes: 'Should be rejected for Ground Crew',
})
assert.equal(deniedResolution.ok, false, 'Non-Warehouse role must be rejected by resolveFieldIncidentReport')
assert.match(deniedResolution.error, /Warehouse Operations Manager/i)
const unchangedIncident = store.readOperationsStore().incidentReports.find((r) => r.id === latestIncident.id)
assert.equal(unchangedIncident.resolutionStatus, 'Pending', 'Rejected resolution must leave report Pending')

// ----------------------------------------------------------------------------
// 8. Vendor Management Store, Routing, Archive Preservation & Selection Guards
// ----------------------------------------------------------------------------
console.log('Phase 2.8: Vendor Management routing, CRUD, archive preservation, and selection guards...')
const vendorsRoute = store.resolveOperationsRoute('module-vendors')
assert.equal(vendorsRoute.canonicalRoute, 'module-vendors')
assert.equal(vendorsRoute.moduleKey, 'vendors')
assert.equal(roleConfig.canAccess('Warehouse Operations Manager', 'module-vendors'), true)
assert.equal(roleConfig.canAccess('Ground Crew', 'module-vendors'), false)

const initialVendors = store.readOperationsStore().vendors
assert.ok(Array.isArray(initialVendors) && initialVendors.length === 6, 'Seeded vendors must preserve the 6 existing catalog suppliers')
assert.equal(initialVendors.some((v) => v.name.includes('ProAudio & Staging')), false, 'Screenshot example vendors must not be seeded')

const createdV = store.createVendor(warehouseActor, {
  name: 'Cebu Scenic Fabrication',
  contactPerson: 'Liza Navarro',
  category: 'Fabrication',
  specialty: 'Custom backdrops and wood joinery',
  email: 'ops@cebuscenic.ph',
  phone: '+63 917 888 1234',
  location: 'Cebu City',
  leadTime: '48h',
  status: 'Active',
})
assert.equal(createdV.ok, true, 'Warehouse Manager must be able to create vendor')

// Delete unreferenced vendor -> removes completely
const createdTemp = store.createVendor(warehouseActor, {
  name: 'Temp Unlinked Vendor',
  contactPerson: 'Test Contact',
  category: 'Misc',
  specialty: 'Temporary test',
  email: '',
  phone: '',
  location: 'Manila',
  leadTime: '24h',
  status: 'Active',
})
assert.equal(createdTemp.ok, true)
const delUnlinked = store.deleteOrArchiveVendor(warehouseActor, createdTemp.vendor.id)
assert.equal(delUnlinked.ok, true)
assert.equal(delUnlinked.archived, false, 'Unreferenced vendor must be deleted')
assert.equal(store.readOperationsStore().vendors.some((v) => v.id === createdTemp.vendor.id), false)

// Link vendor to an inventory asset, then deleteOrArchive -> archives to Inactive instead of deleting
const linkedAssetRes = store.createWarehouseInventoryItem({
  name: 'Custom Arch Prop',
  category: 'Structure',
  stock: 4,
  primaryVendorId: createdV.vendor.id,
})
assert.equal(linkedAssetRes.ok, true, 'Creating asset with Active vendor must succeed')

const archiveRes = store.deleteOrArchiveVendor(warehouseActor, createdV.vendor.id)
assert.equal(archiveRes.ok, true)
assert.equal(archiveRes.archived, true, 'Referenced vendor must be archived instead of deleted')
assert.equal(archiveRes.vendor.status, 'Inactive')

// Archived (Inactive) vendor cannot be newly selected, but stays visible/valid on existing linked asset
const newSelectOpts = store.getVendorSelectOptions(store.readOperationsStore().vendors)
assert.equal(newSelectOpts.some((o) => o.value === createdV.vendor.id), false, 'Inactive vendor must be unavailable for new selections')
const existingSelectOpts = store.getVendorSelectOptions(store.readOperationsStore().vendors, createdV.vendor.id)
assert.equal(existingSelectOpts.some((o) => o.value === createdV.vendor.id), true, 'Inactive vendor must stay visible on existing linked asset')

const newWithInactive = store.createWarehouseInventoryItem({
  name: 'Second Prop',
  category: 'Structure',
  stock: 2,
  primaryVendorId: createdV.vendor.id,
})
assert.equal(newWithInactive.ok, false, 'New asset must reject Inactive vendor')

const editExistingWithInactive = store.updateWarehouseInventoryItem(linkedAssetRes.item.assetId, {
  name: 'Custom Arch Prop Updated',
  category: 'Structure',
  stock: 5,
  primaryVendorId: createdV.vendor.id,
})
assert.equal(editExistingWithInactive.ok, true, 'Updating existing asset with its already-linked Inactive vendor must succeed')

// ----------------------------------------------------------------------------
// 9. Replenishment & Deficits Workflow, Partial/Repeated Receipts & Integrity
// ----------------------------------------------------------------------------
console.log('Phase 2.9: Replenishment & Deficits routing, General Stockroom, duplicate prevention, partial/repeated receipts...')
const repRoute = store.resolveOperationsRoute('module-replenishment-deficits?eventId=evt-celeste-marcos&subView=consolidated')
assert.equal(repRoute.canonicalRoute, 'module-replenishment-deficits')
assert.equal(repRoute.moduleKey, 'replenishment-deficits')
assert.equal(repRoute.impliedContext.subView, 'consolidated')
assert.equal(roleConfig.canAccess('Warehouse Operations Manager', 'module-replenishment-deficits'), true)
assert.equal(roleConfig.canAccess('Ground Crew', 'module-replenishment-deficits'), false)

const genReq = store.createReplenishmentRequest(warehouseActor, {
  eventId: store.GENERAL_STOCKROOM_EVENT_ID,
  assetId: 'evtast-0001',
  quantity: 6,
  urgency: 'High',
  triggerSource: 'Manual Request',
  notes: 'Stockroom buffer',
})
assert.equal(genReq.ok, true, 'General Stockroom replenishment request must succeed')
assert.equal(genReq.deficit.isGeneralStockroom, true)

// Duplicate open request for same (eventId, assetId) must be rejected
const dupReq = store.createReplenishmentRequest(warehouseActor, {
  eventId: store.GENERAL_STOCKROOM_EVENT_ID,
  assetId: 'evtast-0001',
  quantity: 3,
})
assert.equal(dupReq.ok, false, 'Duplicate open request for same event/stockroom and asset must be rejected')

const availBeforeOrder = store.readOperationsStore().inventory.find((i) => i.assetId === 'evtast-0001').availableStock
const pendingOrderRes = store.createAcquisitionOrder({
  deficitIds: [genReq.deficit.id],
  vendorId: 'sample-furniture',
  assetId: 'evtast-0001',
  supplierName: '',
  quantity: 6,
  unitCost: 0,
  actorName: warehouseActor.name,
  receiveImmediately: false,
})
assert.equal(pendingOrderRes.ok, true)
assert.equal(pendingOrderRes.order.status, 'Ordered')
assert.equal(
  store.readOperationsStore().inventory.find((i) => i.assetId === 'evtast-0001').availableStock,
  availBeforeOrder,
  'Pending order (Ordered) must NOT increase availableStock before receipt',
)

// Duplicate purchasing for already-covered deficit must be blocked
const dupOrderRes = store.createAcquisitionOrder({
  deficitIds: [genReq.deficit.id],
  vendorId: 'sample-furniture',
  assetId: 'evtast-0001',
  supplierName: '',
  quantity: 6,
  unitCost: 0,
  actorName: warehouseActor.name,
  receiveImmediately: false,
})
assert.equal(dupOrderRes.ok, false, 'Duplicate purchase order for covered deficit must be rejected')

// Partial receipt (2 of 6) -> Partially Received, adds +2 only
const partialRes = store.receiveAcquisitionOrder(pendingOrderRes.order.id, {
  receiveQty: 2,
  actorName: warehouseActor.name,
  notes: 'First partial delivery',
})
assert.equal(partialRes.ok, true)
assert.equal(partialRes.status, 'Partially Received')
assert.equal(partialRes.addedQty, 2)
assert.equal(
  store.readOperationsStore().inventory.find((i) => i.assetId === 'evtast-0001').availableStock,
  availBeforeOrder + 2,
  'Partial receipt must add only confirmed received quantity',
)

// Exceeding remaining quantity (5 when 4 left) must be rejected
const overRes = store.receiveAcquisitionOrder(pendingOrderRes.order.id, { receiveQty: 5 })
assert.equal(overRes.ok, false, 'Receiving more than remaining quantity must be rejected')

// Final receipt (4 of 6) -> Received & Stocked, fulfills deficit
const finalRes = store.receiveAcquisitionOrder(pendingOrderRes.order.id, {
  receiveQty: 4,
  actorName: warehouseActor.name,
})
assert.equal(finalRes.ok, true)
assert.equal(finalRes.status, 'Received & Stocked')
assert.equal(
  store.readOperationsStore().inventory.find((i) => i.assetId === 'evtast-0001').availableStock,
  availBeforeOrder + 6,
)
assert.equal(
  store.readOperationsStore().deficitQueue.find((d) => d.id === genReq.deficit.id).status,
  'Fulfilled',
)

// Repeated receipt on completed order must be idempotent and add 0 stock
const repeatRes = store.receiveAcquisitionOrder(pendingOrderRes.order.id)
assert.equal(repeatRes.ok, true)
assert.equal(repeatRes.alreadyReceived, true)
assert.equal(repeatRes.addedQty, 0)
assert.equal(
  store.readOperationsStore().inventory.find((i) => i.assetId === 'evtast-0001').availableStock,
  availBeforeOrder + 6,
  'Repeated receipt must not increase stock twice',
)

console.log('All Phase 2 Navigation & Overview verification suites passed!')
