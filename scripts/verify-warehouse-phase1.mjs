import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
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

// Setup isolated mock browser environment
const memoryStore = new Map()
let failLocalStorageWrites = false
const localStorageMock = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => {
    if (failLocalStorageWrites) {
      throw new Error('QuotaExceededError: Mock localStorage write failure')
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

const store = await import('../src/operations/store.ts')

console.log('Testing Warehouse Operations & Ground Crew Phase 1 Suite...')

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
const crewAlexActor = {
  name: 'Alex Ramos',
  email: 'alex@demo.com',
  role: 'Ground Crew',
}
const crewCarlosActor = {
  name: 'Carlos Diaz',
  email: 'carlos@demo.com',
  role: 'Ground Crew',
}

// ----------------------------------------------------------------------------
// 1. Per-unit and per-set multiplication & combined-window rounding
// ----------------------------------------------------------------------------
console.log('Phase 1.1: Per-unit and per-set labor multiplication and combined-window rounding...')

// 3 arch sets * 19 person-hours/set = 57 person-hours
const archSetHours = store.calculateJobEstimatedLaborHours({
  requestedQty: 3,
  estimatedHoursPerUnitOrSet: 19,
  estimateBasis: 'complete-set',
})
assert.equal(archSetHours.ok, true)
assert.equal(archSetHours.totalEstimatedLaborHours, 57, '3 complete arch sets x 19 hours/set must equal 57 person-hours')

// 10 plinth units * 2.5 person-hours/unit = 25 person-hours
const plinthUnitHours = store.calculateJobEstimatedLaborHours({
  requestedQty: 10,
  estimatedHoursPerUnitOrSet: 2.5,
  estimateBasis: 'per-unit',
})
assert.equal(plinthUnitHours.ok, true)
assert.equal(plinthUnitHours.totalEstimatedLaborHours, 25, '10 individual units x 2.5 hours/unit must equal 25 person-hours')

// Combine labor hours for jobs sharing a confirmed production window before rounding:
// Job A (57h) + Job B (25h) = 82h over 3 production days (24h/worker) => ceil(82 / 24) = 4 crew
// Whereas separate deadline Job C (19h over 2 days = 16h/worker) => ceil(19 / 16) = 2 crew
const combinedRecs = store.calculateCombinedWindowCrewRecommendations([
  {
    id: 'job-arch-sets',
    requestedQty: 3,
    estimateBasis: 'complete-set',
    estimatedHoursPerUnitOrSet: 19,
    productionWindow: {
      startDate: '2026-10-10',
      deadlineDate: '2026-10-12',
      availableProductionDays: 3,
      confirmed: true,
    },
  },
  {
    id: 'job-plinths',
    requestedQty: 10,
    estimateBasis: 'per-unit',
    estimatedHoursPerUnitOrSet: 2.5,
    productionWindow: {
      startDate: '2026-10-10',
      deadlineDate: '2026-10-12',
      availableProductionDays: 3,
      confirmed: true,
    },
  },
  {
    id: 'job-later-bar',
    requestedQty: 1,
    estimateBasis: 'complete-set',
    estimatedHoursPerUnitOrSet: 19,
    productionWindow: {
      startDate: '2026-10-13',
      deadlineDate: '2026-10-14',
      availableProductionDays: 2,
      confirmed: true,
    },
  },
])

const sharedWindowGroup = combinedRecs.windows.find((g) => g.jobIds.includes('job-arch-sets'))
assert.ok(sharedWindowGroup, 'Shared production window group must exist')
assert.deepEqual(sharedWindowGroup.jobIds, ['job-arch-sets', 'job-plinths'])
assert.equal(sharedWindowGroup.combinedEstimatedLaborHours, 82)
assert.equal(sharedWindowGroup.recommendedProductionCrew, 4, 'ceil((57 + 25) / (8 * 3)) must equal 4')

const separateWindowGroup = combinedRecs.windows.find((g) => g.jobIds.includes('job-later-bar'))
assert.ok(separateWindowGroup, 'Separate deadline group must be evaluated separately')
assert.equal(separateWindowGroup.combinedEstimatedLaborHours, 19)
assert.equal(separateWindowGroup.recommendedProductionCrew, 2, 'ceil(19 / (8 * 2)) must equal 2')

// ----------------------------------------------------------------------------
// 2. Unconfirmed or invalid production windows & Guest-based formula
// ----------------------------------------------------------------------------
console.log('Phase 1.2: Unconfirmed/invalid windows and guest-based Event Manager staffing...')

const guestRange = store.calculateGuestBasedEventStaffing(150)
assert.equal(guestRange.minCrew, 6)
assert.equal(guestRange.maxCrew, 10)
assert.equal(guestRange.rangeLabel, '6–10')

const invalidWindowRecs = store.calculateCombinedWindowCrewRecommendations([
  {
    id: 'job-unconfirmed',
    requestedQty: 2,
    estimateBasis: 'complete-set',
    estimatedHoursPerUnitOrSet: 12,
    productionWindow: {
      startDate: '2026-10-10',
      deadlineDate: '2026-10-12',
      availableProductionDays: 0,
      confirmed: false,
    },
  },
])
assert.equal(invalidWindowRecs.windows.length, 0, 'Unconfirmed window must not produce numeric crew recommendation')
assert.equal(invalidWindowRecs.skippedJobs.length, 1)
assert.ok(invalidWindowRecs.skippedJobs[0].reason.includes('confirmed by Warehouse'))

// ----------------------------------------------------------------------------
// 3. Working-lead capacity
// ----------------------------------------------------------------------------
console.log('Phase 1.3: Working-lead fabrication capacity vs coordination hours...')

const leadShifts = [
  store.validateAndComputeShiftSchedule({
    startDateTime: '2026-10-10T08:00',
    endDateTime: '2026-10-10T14:00',
    breakMinutes: 0,
  }),
  store.validateAndComputeShiftSchedule({
    startDateTime: '2026-10-10T14:00',
    endDateTime: '2026-10-10T16:00',
    breakMinutes: 0,
  }),
]
const leadCap = store.calculateWorkingLeadCapacity(
  [
    {
      id: 'sh-lead-fab',
      eventId: 'evt-p1',
      jobId: 'job-1',
      assignmentId: 'asg-1',
      crewEmail: 'crew@demo.com',
      crewName: 'Jordan Reyes',
      activityType: 'fabrication',
      startDateTime: '2026-10-10T08:00',
      endDateTime: '2026-10-10T14:00',
      breakMinutes: 0,
      plannedProductiveHours: leadShifts[0].plannedProductiveHours,
      dailyProductiveHoursByManilaDate: leadShifts[0].dailyProductiveHoursByManilaDate,
      status: 'scheduled',
    },
    {
      id: 'sh-lead-sup',
      eventId: 'evt-p1',
      jobId: 'job-1',
      assignmentId: 'asg-1',
      crewEmail: 'crew@demo.com',
      crewName: 'Jordan Reyes',
      activityType: 'lead-coordination',
      startDateTime: '2026-10-10T14:00',
      endDateTime: '2026-10-10T16:00',
      breakMinutes: 0,
      plannedProductiveHours: leadShifts[1].plannedProductiveHours,
      dailyProductiveHoursByManilaDate: leadShifts[1].dailyProductiveHoursByManilaDate,
      status: 'scheduled',
    },
  ],
  'crew@demo.com',
)
assert.equal(leadCap.plannedFabricationHours, 6, 'Only fabrication hours contribute to fabrication capacity')
assert.equal(leadCap.plannedCoordinationHours, 2)
assert.equal(leadCap.totalPlannedHours, 8)
assert.equal(leadCap.fitsWithinSchedule, true)

// ----------------------------------------------------------------------------
// 4. Overnight breaks and daily workload in Asia/Manila
// ----------------------------------------------------------------------------
console.log('Phase 1.4: Overnight breaks and Asia/Manila daily productive hours...')

// Overnight shift with breakMinutes > 0 but WITHOUT explicit Break Start/End must fail
const overnightMissingBreakWindow = store.validateAndComputeShiftSchedule({
  startDateTime: '2026-10-12T22:00',
  endDateTime: '2026-10-13T06:00',
  breakMinutes: 60,
})
assert.equal(overnightMissingBreakWindow.ok, false, 'Overnight shift with break must require explicit Break Start and Break End times')
assert.ok(overnightMissingBreakWindow.error.includes('Break Start and Break End'))

// Overnight shift with explicit Break Start (01:00) and Break End (02:00) on 2026-10-13:
// 2026-10-12: 22:00-24:00 = 2.0h productive
// 2026-10-13: 00:00-06:00 (6h) minus 01:00-02:00 (1h break) = 5.0h productive
const overnightValidBreak = store.validateAndComputeShiftSchedule({
  startDateTime: '2026-10-12T22:00',
  endDateTime: '2026-10-13T06:00',
  breakStartDateTime: '2026-10-13T01:00',
  breakEndDateTime: '2026-10-13T02:00',
})
assert.equal(overnightValidBreak.ok, true)
assert.equal(overnightValidBreak.isOvernight, true)
assert.equal(overnightValidBreak.plannedProductiveHours, 7)
assert.equal(overnightValidBreak.dailyProductiveHoursByManilaDate['2026-10-12'], 2)
assert.equal(overnightValidBreak.dailyProductiveHoursByManilaDate['2026-10-13'], 5)

// ----------------------------------------------------------------------------
// 5. Shared-shift coverage during breaks
// ----------------------------------------------------------------------------
console.log('Phase 1.5: Shared-shift simultaneous coverage during breaks...')

// Shared shift with breakMinutes > 0 but no explicit Break Start/End must fail
const sharedMissingBreakWindow = store.validateAndComputeShiftSchedule({
  startDateTime: '2026-10-11T09:00',
  endDateTime: '2026-10-11T17:00',
  breakMinutes: 60,
  isSharedShift: true,
  requiredSimultaneousCrew: 2,
})
assert.equal(sharedMissingBreakWindow.ok, false, 'Shared shift with break must require explicit Break Start and Break End times')

// Two workers on a shared shift requiring 2 simultaneous crew, taking staggered breaks:
// During 12:00-13:00 (Worker 1 on break) and 13:00-14:00 (Worker 2 on break), only 1 worker is active -> shortfall!
const w1Shift = store.validateAndComputeShiftSchedule({
  startDateTime: '2026-10-11T09:00',
  endDateTime: '2026-10-11T17:00',
  breakStartDateTime: '2026-10-11T12:00',
  breakEndDateTime: '2026-10-11T13:00',
  isSharedShift: true,
  requiredSimultaneousCrew: 2,
})
const w2Shift = store.validateAndComputeShiftSchedule({
  startDateTime: '2026-10-11T09:00',
  endDateTime: '2026-10-11T17:00',
  breakStartDateTime: '2026-10-11T13:00',
  breakEndDateTime: '2026-10-11T14:00',
  isSharedShift: true,
  requiredSimultaneousCrew: 2,
})
const twoWorkerCoverage = store.validateSharedShiftSimultaneousCoverage(
  [
    {
      id: 'sh-w1',
      eventId: 'evt-p1',
      jobId: 'job-shared',
      assignmentId: 'asg-w1',
      crewEmail: 'alex@demo.com',
      crewName: 'Alex Ramos',
      activityType: 'fabrication',
      startDateTime: '2026-10-11T09:00',
      endDateTime: '2026-10-11T17:00',
      breakMinutes: 60,
      breakStartDateTime: '2026-10-11T12:00',
      breakEndDateTime: '2026-10-11T13:00',
      isSharedShift: true,
      requiredSimultaneousCrew: 2,
      plannedProductiveHours: w1Shift.plannedProductiveHours,
      dailyProductiveHoursByManilaDate: w1Shift.dailyProductiveHoursByManilaDate,
      status: 'scheduled',
    },
    {
      id: 'sh-w2',
      eventId: 'evt-p1',
      jobId: 'job-shared',
      assignmentId: 'asg-w2',
      crewEmail: 'carlos@demo.com',
      crewName: 'Carlos Diaz',
      activityType: 'fabrication',
      startDateTime: '2026-10-11T09:00',
      endDateTime: '2026-10-11T17:00',
      breakMinutes: 60,
      breakStartDateTime: '2026-10-11T13:00',
      breakEndDateTime: '2026-10-11T14:00',
      isSharedShift: true,
      requiredSimultaneousCrew: 2,
      plannedProductiveHours: w2Shift.plannedProductiveHours,
      dailyProductiveHoursByManilaDate: w2Shift.dailyProductiveHoursByManilaDate,
      status: 'scheduled',
    },
  ],
  {
    requiredSimultaneousCrew: 2,
    startDateTime: '2026-10-11T09:00',
    endDateTime: '2026-10-11T17:00',
    jobId: 'job-shared',
  },
)
assert.equal(twoWorkerCoverage.ok, false, '2 workers with breaks cannot maintain 2 simultaneous active workers during break windows')
assert.ok(twoWorkerCoverage.uncoveredIntervals.length > 0)

// Adding a 3rd worker whose break is 14:00-15:00 ensures at least 2 active workers throughout 09:00-17:00
const w3Shift = store.validateAndComputeShiftSchedule({
  startDateTime: '2026-10-11T09:00',
  endDateTime: '2026-10-11T17:00',
  breakStartDateTime: '2026-10-11T14:00',
  breakEndDateTime: '2026-10-11T15:00',
  isSharedShift: true,
  requiredSimultaneousCrew: 2,
})
const threeWorkerCoverage = store.validateSharedShiftSimultaneousCoverage(
  [
    {
      id: 'sh-w1',
      eventId: 'evt-p1',
      jobId: 'job-shared',
      assignmentId: 'asg-w1',
      crewEmail: 'alex@demo.com',
      crewName: 'Alex Ramos',
      activityType: 'fabrication',
      startDateTime: '2026-10-11T09:00',
      endDateTime: '2026-10-11T17:00',
      breakMinutes: 60,
      breakStartDateTime: '2026-10-11T12:00',
      breakEndDateTime: '2026-10-11T13:00',
      isSharedShift: true,
      requiredSimultaneousCrew: 2,
      plannedProductiveHours: w1Shift.plannedProductiveHours,
      dailyProductiveHoursByManilaDate: w1Shift.dailyProductiveHoursByManilaDate,
      status: 'scheduled',
    },
    {
      id: 'sh-w2',
      eventId: 'evt-p1',
      jobId: 'job-shared',
      assignmentId: 'asg-w2',
      crewEmail: 'carlos@demo.com',
      crewName: 'Carlos Diaz',
      activityType: 'fabrication',
      startDateTime: '2026-10-11T09:00',
      endDateTime: '2026-10-11T17:00',
      breakMinutes: 60,
      breakStartDateTime: '2026-10-11T13:00',
      breakEndDateTime: '2026-10-11T14:00',
      isSharedShift: true,
      requiredSimultaneousCrew: 2,
      plannedProductiveHours: w2Shift.plannedProductiveHours,
      dailyProductiveHoursByManilaDate: w2Shift.dailyProductiveHoursByManilaDate,
      status: 'scheduled',
    },
    {
      id: 'sh-w3',
      eventId: 'evt-p1',
      jobId: 'job-shared',
      assignmentId: 'asg-w3',
      crewEmail: 'dana@demo.com',
      crewName: 'Dana Lim',
      activityType: 'fabrication',
      startDateTime: '2026-10-11T09:00',
      endDateTime: '2026-10-11T17:00',
      breakMinutes: 60,
      breakStartDateTime: '2026-10-11T14:00',
      breakEndDateTime: '2026-10-11T15:00',
      isSharedShift: true,
      requiredSimultaneousCrew: 2,
      plannedProductiveHours: w3Shift.plannedProductiveHours,
      dailyProductiveHoursByManilaDate: w3Shift.dailyProductiveHoursByManilaDate,
      status: 'scheduled',
    },
  ],
  {
    requiredSimultaneousCrew: 2,
    startDateTime: '2026-10-11T09:00',
    endDateTime: '2026-10-11T17:00',
    jobId: 'job-shared',
  },
)
assert.equal(threeWorkerCoverage.ok, true, '3 workers with staggered breaks maintain >= 2 active workers throughout 09:00-17:00')

// ----------------------------------------------------------------------------
// 6. Schedule preservation, overlaps, and cancelled shifts
// ----------------------------------------------------------------------------
console.log('Phase 1.6: Schedule preservation (no overwriting), overlap checks, and cancelled shift preservation...')

localStorageMock.clear()

const p1EventId = 'evt-phase1-main'
store.publishApprovedEventToWarehouse(
  {
    id: p1EventId,
    title: 'Solstice Couture Showcase',
    client: 'Solstice Maison',
    clientEmail: 'maison@solstice.com',
    status: 'Approved',
    approvedAt: '2026-11-10T00:00:00.000Z',
    revision: 1,
    brief: {
      id: 'brief-p1',
      title: 'Solstice Couture Showcase',
      client: 'Solstice Maison',
      clientEmail: 'maison@solstice.com',
      venue: 'The Fifth at Rockwell',
      start: '2026-11-20T18:00:00+08:00',
      end: '2026-11-21T01:00:00+08:00',
      pax: 200,
      theme: 'Sculptural Gold',
      budget: 900000,
      requirements: [],
      customItems: [
        {
          id: 'cust-arch-set',
          name: 'Sculpted Brass Arch Set',
          quantity: 3,
          dimensions: '4m x 3m',
          materials: 'Brushed brass and steel',
          instructions: 'Build 3 matching arch sets.',
        },
      ],
      rentals: [],
      pins: [],
    },
  },
  { name: 'Elena Cruz', email: 'elena@lumiere.com', role: 'Event Manager' },
)

const p1Job = store.readOperationsStore().fabricationJobs.find((j) => j.eventId === p1EventId)
assert.ok(p1Job, 'Published custom fabrication job must exist')
assert.equal(p1Job.status, 'Unassigned', 'New production job must start Unassigned')
assert.equal(p1Job.assignedCrewEmails.length, 0, 'New production job must not auto-assign crew@demo.com')

// Add members to Event Crew Group roster without auto-selecting first member as Team Lead
const addRosterLead = store.addCrewToEventRoster(warehouseActor, {
  eventId: p1EventId,
  crewEmail: 'crew@demo.com',
  crewName: 'Jordan Reyes',
})
assert.equal(addRosterLead.ok, true)
assert.equal(store.readOperationsStore().orderRequests.find((o) => o.eventId === p1EventId).teamLeadEmail, undefined, 'Adding first member to roster must not auto-select Team Lead')

store.addCrewToEventRoster(warehouseActor, {
  eventId: p1EventId,
  crewEmail: 'alex@demo.com',
  crewName: 'Alex Ramos',
})
store.addCrewToEventRoster(warehouseActor, {
  eventId: p1EventId,
  crewEmail: 'carlos@demo.com',
  crewName: 'Carlos Diaz',
})

// Designate Jordan (crew@demo.com) as Event Team Lead
const designateLeadRes = store.designateEventTeamLead(warehouseActor, {
  eventId: p1EventId,
  newLeadEmail: 'crew@demo.com',
  newLeadName: 'Jordan Reyes',
  reason: 'Primary Event & Production Lead',
})
assert.equal(designateLeadRes.ok, true)

// Confirm production window and estimate (3 sets * 19h = 57h)
const confirmRes = store.confirmProductionJobWindowAndEstimate(warehouseActor, {
  jobId: p1Job.id,
  startDate: '2026-11-15',
  deadlineDate: '2026-11-18',
  availableProductionDays: 3,
  estimatedHoursPerUnitOrSet: 19,
  estimateBasis: 'complete-set',
  assignmentMode: 'individual',
  productionLeadEmail: 'crew@demo.com',
  productionLeadName: 'Jordan Reyes',
})
assert.equal(confirmRes.ok, true)

// Schedule Shift 1 for Alex on Day 1
const s1Alex = store.scheduleWorkerShift(warehouseActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  crewEmail: 'alex@demo.com',
  crewName: 'Alex Ramos',
  activityType: 'fabrication',
  startDateTime: '2026-11-15T08:00',
  endDateTime: '2026-11-15T17:00',
  breakMinutes: 60,
  instructions: 'Weld Arch Set 1 & 2 base frames',
})
assert.equal(s1Alex.ok, true)

// Schedule Shift 2 for Alex on Day 2 — MUST NOT overwrite Shift 1!
const s2Alex = store.scheduleWorkerShift(warehouseActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  crewEmail: 'alex@demo.com',
  crewName: 'Alex Ramos',
  activityType: 'fabrication',
  startDateTime: '2026-11-16T08:00',
  endDateTime: '2026-11-16T17:00',
  breakMinutes: 60,
  instructions: 'Polish Arch Set 1 & 2',
})
assert.equal(s2Alex.ok, true)

let currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
assert.equal(currentJob.schedules.filter((s) => s.crewEmail === 'alex@demo.com').length, 2, 'Adding a second shift for Alex must preserve the first shift')

// Overlapping shift for Alex on Day 1 must be rejected
const overlapAlex = store.scheduleWorkerShift(warehouseActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  crewEmail: 'alex@demo.com',
  crewName: 'Alex Ramos',
  activityType: 'fabrication',
  startDateTime: '2026-11-15T14:00',
  endDateTime: '2026-11-15T19:00',
  breakMinutes: 0,
})
assert.equal(overlapAlex.ok, false, 'Overlapping shift for same worker must be rejected')
assert.ok(overlapAlex.error.includes('Schedule overlap'))

// Cancel Shift 2 for Alex -> preserved in history, excluded from future conflicts
const cancelRes = store.cancelScheduledShift(warehouseActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  shiftId: s2Alex.shift.id,
  reason: 'Rescheduled workshop bay slot',
})
assert.equal(cancelRes.ok, true)

currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
const cancelledShift = currentJob.schedules.find((s) => s.id === s2Alex.shift.id)
assert.equal(cancelledShift.status, 'cancelled', 'Cancelled shift must remain in history with cancelled status')
assert.equal(cancelledShift.cancellationReason, 'Rescheduled workshop bay slot')

// Now scheduling a replacement shift during 2026-11-16T08:00-17:00 succeeds
const replacementShift = store.scheduleWorkerShift(warehouseActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  crewEmail: 'alex@demo.com',
  crewName: 'Alex Ramos',
  activityType: 'fabrication',
  startDateTime: '2026-11-16T08:00',
  endDateTime: '2026-11-16T17:00',
  breakMinutes: 60,
})
assert.equal(replacementShift.ok, true, 'Cancelled shift must not block replacement shift in same window')

// Also schedule Carlos and Jordan on the job so it is a multi-worker Individual job
const s1Carlos = store.scheduleWorkerShift(warehouseActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  crewEmail: 'carlos@demo.com',
  crewName: 'Carlos Diaz',
  activityType: 'fabrication',
  startDateTime: '2026-11-15T08:00',
  endDateTime: '2026-11-15T17:00',
  breakMinutes: 60,
  instructions: 'Build Arch Set 3',
})
assert.equal(s1Carlos.ok, true)

const s1Jordan = store.scheduleWorkerShift(warehouseActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  crewEmail: 'crew@demo.com',
  crewName: 'Jordan Reyes',
  activityType: 'fabrication',
  startDateTime: '2026-11-15T08:00',
  endDateTime: '2026-11-15T17:00',
  breakMinutes: 60,
  instructions: 'Lead fabrication & assembly',
})
assert.equal(s1Jordan.ok, true)

// ----------------------------------------------------------------------------
// 7. Independent worker completion & 8. Daily photos do not complete jobs
// ----------------------------------------------------------------------------
console.log('Phase 1.7 & 1.8: Independent worker assignment completion and daily photos not completing jobs...')

currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
const alexAssignment = currentJob.assignments.find((a) => a.crewEmail === 'alex@demo.com')
const carlosAssignment = currentJob.assignments.find((a) => a.crewEmail === 'carlos@demo.com')

// Alex starts his assignment -> Job becomes In Production
const startAlex = store.startProductionWorkerAssignment(crewAlexActor, {
  jobId: p1Job.id,
  assignmentId: alexAssignment.id,
})
assert.equal(startAlex.ok, true)

currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
assert.equal(currentJob.status, 'In Production')

// Alex logs hours & submits his individual contribution
const logAlex = store.recordWorkerContributionAndHours(crewAlexActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  assignmentId: alexAssignment.id,
  shiftId: s1Alex.shift.id,
  manilaDate: '2026-11-15',
  attendance: 'Present',
  actualProductiveHours: 8,
  contributionSummary: 'Completed welding on Arch Sets 1 & 2.',
  photoUrls: ['/event-manager-images/corporate.jpg'],
  markContributionSubmitted: true,
})
assert.equal(logAlex.ok, true)

// Daily progress report and after-shift photo do NOT finish or submit the job
const dailyReport = store.submitDailyGroupProgressReport(crewLeadActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  manilaDate: '2026-11-15',
  summary: 'Day 1 frame welding complete.',
  photoUrls: ['/event-manager-images/corporate.jpg'],
})
assert.equal(dailyReport.ok, true)

const shiftPhoto = store.submitAfterShiftWorkPhoto(crewAlexActor, {
  eventId: p1EventId,
  shiftLabel: 'Day 1 Metal Shop',
  photoUrl: '/event-manager-images/corporate.jpg',
  caption: 'In-progress arch frames',
  isFabricationWork: true,
  fabricationJobId: p1Job.id,
})
assert.equal(shiftPhoto.ok, true)

currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
assert.equal(currentJob.status, 'In Production', 'Daily progress report and shift photo must NEVER auto-submit or finish the job')

// Warehouse confirms Alex's individual worker assignment completion BEFORE the full asset is finished
const confirmAlexDone = store.confirmWorkerAssignmentCompletion(warehouseActor, {
  jobId: p1Job.id,
  assignmentId: alexAssignment.id,
})
assert.equal(confirmAlexDone.ok, true, 'Warehouse can mark an individual worker assignment Completed before full asset approval')

currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
assert.equal(currentJob.assignments.find((a) => a.id === alexAssignment.id).status, 'Completed')
assert.equal(currentJob.status, 'In Production', 'Completing one worker assignment must not mark the full asset finished')

// Carlos starts his assignment and logs hours (leaving his assignment In Progress, not yet Confirmed Completed by Warehouse)
store.startProductionWorkerAssignment(crewCarlosActor, {
  jobId: p1Job.id,
  assignmentId: carlosAssignment.id,
})
store.recordWorkerContributionAndHours(crewCarlosActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  assignmentId: carlosAssignment.id,
  shiftId: s1Carlos.shift.id,
  manilaDate: '2026-11-15',
  attendance: 'Present',
  actualProductiveHours: 8,
  contributionSummary: 'Built Arch Set 3 frame.',
  markContributionSubmitted: false,
})

// ----------------------------------------------------------------------------
// 9. Submission ownership & selective corrections
// ----------------------------------------------------------------------------
console.log('Phase 1.9: Submission ownership and selective correction assignments...')

// Single-worker Individual job test:
// Create a single-worker Individual job assigned solely to Dana Lim (dana@demo.com),
// while Jordan Reyes (crew@demo.com) is the inherited/coordinating lead.
store.addCrewToEventRoster(warehouseActor, {
  eventId: p1EventId,
  crewEmail: 'dana@demo.com',
  crewName: 'Dana Lim',
})
const singleWorkerJobRes = store.createCustomFabricationJob(
  p1EventId,
  {
    name: 'Single-Worker Bespoke Lectern',
    requestedQty: 1,
    dimensions: '1.2m x 0.6m',
    materials: 'Walnut & Brass',
    colors: 'Dark Walnut',
    finish: 'Matte Oil',
    buildInstructions: 'Hand-craft single lectern.',
    referenceImages: ['/event-manager-images/corporate.jpg'],
  },
  [],
)
assert.equal(singleWorkerJobRes.ok, true)
const singleWorkerJobId = singleWorkerJobRes.job.id

store.confirmProductionJobWindowAndEstimate(warehouseActor, {
  jobId: singleWorkerJobId,
  startDate: '2026-11-15',
  deadlineDate: '2026-11-16',
  availableProductionDays: 1,
  estimatedHoursPerUnitOrSet: 6,
  estimateBasis: 'per-unit',
  assignmentMode: 'individual',
})
store.scheduleWorkerShift(warehouseActor, {
  eventId: p1EventId,
  jobId: singleWorkerJobId,
  crewEmail: 'dana@demo.com',
  crewName: 'Dana Lim',
  activityType: 'fabrication',
  startDateTime: '2026-11-15T09:00',
  endDateTime: '2026-11-15T16:00',
  breakMinutes: 60,
  instructions: 'Build bespoke walnut lectern',
})

// Inherited coordinating lead (Jordan, crew@demo.com) MUST NOT be allowed to submit Dana's single-worker Individual job
const coordinatingLeadSubmitSingleWorker = store.submitProductionJobForVerification(crewLeadActor, {
  jobId: singleWorkerJobId,
  completedQty: 1,
  photoUrls: ['/event-manager-images/corporate.jpg'],
  summary: 'Coordinating lead trying to submit single-worker individual job.',
})
assert.equal(
  coordinatingLeadSubmitSingleWorker.ok,
  false,
  'Inherited coordinating lead must NOT gain submission permission on a single-worker Individual job',
)
assert.ok(coordinatingLeadSubmitSingleWorker.error.includes('only the single assigned worker'))

// The single assigned worker (Dana Lim) CAN submit her own complete single-worker Individual job
const soleWorkerSubmit = store.submitProductionJobForVerification(
  { name: 'Dana Lim', email: 'dana@demo.com', role: 'Ground Crew' },
  {
    jobId: singleWorkerJobId,
    completedQty: 1,
    photoUrls: ['/event-manager-images/corporate.jpg'],
    summary: 'Completed walnut & brass lectern per spec.',
  },
)
assert.equal(soleWorkerSubmit.ok, true, 'Single assigned worker must be allowed to submit their complete single-worker Individual job')

// On a multi-worker Individual job, a non-lead worker (Alex) CANNOT submit the full job for verification
const nonLeadSubmit = store.submitProductionJobForVerification(crewAlexActor, {
  jobId: p1Job.id,
  completedQty: 3,
  photoUrls: ['/event-manager-images/corporate.jpg'],
  summary: 'All 3 arch sets built.',
})
assert.equal(nonLeadSubmit.ok, false, 'Non-lead worker on multi-worker Individual job must not submit full job')

// Warehouse CANNOT submit finished work for verification
const warehouseSubmit = store.submitProductionJobForVerification(warehouseActor, {
  jobId: p1Job.id,
  completedQty: 3,
  photoUrls: ['/event-manager-images/corporate.jpg'],
  summary: 'Warehouse trying to submit',
})
assert.equal(warehouseSubmit.ok, false, 'Warehouse must never submit finished production work')

// Partial quantity submission (< 3) must be rejected
const partialSubmit = store.submitProductionJobForVerification(crewLeadActor, {
  jobId: p1Job.id,
  completedQty: 2,
  photoUrls: ['/event-manager-images/corporate.jpg'],
  summary: 'Only 2 of 3 arch sets done',
})
assert.equal(partialSubmit.ok, false, 'Partial quantity submission must be rejected')

// Designated Production Lead (Jordan) submits full 3 sets -> transitions to Awaiting Verification
const leadSubmit = store.submitProductionJobForVerification(crewLeadActor, {
  jobId: p1Job.id,
  completedQty: 3,
  photoUrls: ['/event-manager-images/corporate.jpg'],
  summary: 'All 3 sculpted brass arch sets completed and inspected by lead.',
})
assert.equal(leadSubmit.ok, true)

currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
assert.equal(currentJob.status, 'Awaiting Verification')

// Warehouse requests corrections ONLY for Carlos (responsible worker)
// Alex's Completed assignment must remain untouched!
const reqCorr = store.requestProductionJobCorrections(warehouseActor, {
  jobId: p1Job.id,
  explanation: 'Arch Set 3 top joint needs satin re-polishing.',
  failedChecks: ['matchesClientApprovedSpec'],
  responsibleCrewEmails: ['carlos@demo.com'],
})
assert.equal(reqCorr.ok, true)

currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
assert.equal(currentJob.status, 'In Production', 'Correction request must return job to In Production within the same job')
assert.equal(currentJob.assignments.find((a) => a.id === alexAssignment.id).status, 'Completed', 'Unaffected worker Completed assignment must be preserved')

const carlosCorrectionAsg = currentJob.assignments.find(
  (a) => a.crewEmail === 'carlos@demo.com' && a.isCorrectionAssignment,
)
assert.ok(carlosCorrectionAsg, 'Responsible worker must receive a correction assignment')
assert.equal(carlosCorrectionAsg.status, 'Assigned', 'Correction assignment must start in Assigned state until worker starts rework')

// Carlos starts rework, logs rework hours, and submits rework
store.startProductionWorkerAssignment(crewCarlosActor, {
  jobId: p1Job.id,
  assignmentId: carlosCorrectionAsg.id,
})
store.recordWorkerContributionAndHours(crewCarlosActor, {
  eventId: p1EventId,
  jobId: p1Job.id,
  assignmentId: carlosCorrectionAsg.id,
  manilaDate: '2026-11-16',
  attendance: 'Present',
  actualProductiveHours: 2,
  contributionSummary: 'Re-polished Arch Set 3 top joint to match satin finish.',
  markContributionSubmitted: true,
})

// Production Lead re-submits full job for verification -> resolves open correction request
const resubmitRes = store.submitProductionJobForVerification(crewLeadActor, {
  jobId: p1Job.id,
  completedQty: 3,
  photoUrls: ['/event-manager-images/corporate.jpg'],
  summary: 'Correction on Arch Set 3 resolved; all 3 sets ready.',
})
assert.equal(resubmitRes.ok, true)

// ----------------------------------------------------------------------------
// 10. Full-quantity verification, 3-point checklist, and manifest consistency
// ----------------------------------------------------------------------------
console.log('Phase 1.10: Full-quantity verification, 3-point checklist, and manifest consistency...')

// Approving with an unchecked item in the 3-point checklist must fail
const incompleteChecklistApprove = store.approveProductionJobFinishedWork(
  warehouseActor,
  p1Job.id,
  {
    checklist: {
      fullQuantityFinished: true,
      matchesClientApprovedSpec: true,
      correctionsResolved: false,
    },
    notes: 'Trying to approve without confirming corrections resolved',
  },
)
assert.equal(incompleteChecklistApprove.ok, false, 'Incomplete 3-point checklist must be rejected')

// Approving with all 3 checklist points confirmed succeeds
const fullApprove = store.approveProductionJobFinishedWork(
  warehouseActor,
  p1Job.id,
  {
    checklist: {
      fullQuantityFinished: true,
      matchesClientApprovedSpec: true,
      correctionsResolved: true,
    },
    notes: 'All 3 arch sets verified against client brief and correction resolved.',
  },
)
assert.equal(fullApprove.ok, true)

currentJob = store.readOperationsStore().fabricationJobs.find((j) => j.id === p1Job.id)
assert.equal(currentJob.status, 'Ready to Load')
assert.equal(currentJob.releasedForLoading, true)
assert.equal(currentJob.approval.verifiedByEmail, 'warehouse@demo.com')

// Carlos's unreviewed original assignment must STILL be In Progress (asset approval never auto-completes unreviewed worker hours)
assert.equal(
  currentJob.assignments.find((a) => a.id === carlosAssignment.id).status,
  'In Progress',
  'Approving finished asset must not auto-complete unreviewed worker assignments',
)

// Manifest lines must contain exactly 1 line for cust-arch-set with plannedQty === 3
const manifestLines = store.getEventManifestLines(store.readOperationsStore(), p1EventId)
const archManifestLines = manifestLines.filter((m) => m.sourceId === 'cust-arch-set')
assert.equal(archManifestLines.length, 1, 'Manifest must not contain duplicate lines for the custom item')
assert.equal(archManifestLines[0].plannedQty, 3, 'Manifest quantity must match full approved quantity (3)')

const orderStockLines = store.readOperationsStore().orderRequests.find((o) => o.eventId === p1EventId).stockLines
const archStockLines = orderStockLines.filter((s) => s.assetId === 'cust-arch-set')
assert.equal(archStockLines.length, 1, 'Order stockLines must not contain duplicate custom lines')
assert.equal(archStockLines[0].releasedForLoadQty, 3)

// ----------------------------------------------------------------------------
// 11. Repeatable non-destructive migration & legacy review flags
// ----------------------------------------------------------------------------
console.log('Phase 1.11: Repeatable non-destructive migration and legacy review flags...')

const stateBeforeMigration = store.readOperationsStore()
// Force migrationVersion back to 1 so migrateOperationsStore runs on the newly injected legacy records
stateBeforeMigration.migrationVersion = 1

stateBeforeMigration.fabricationJobs.push(
  {
    id: 'fab-legacy-inprod',
    eventId: p1EventId,
    eventTitle: 'Solstice Couture Showcase',
    customItemId: 'cust-legacy-1',
    spec: {
      id: 'cust-legacy-1',
      name: 'Legacy Velvet Podium',
      requestedQty: 2,
      dimensions: '2m x 2m',
      materials: 'Velvet and plywood',
      colors: 'Emerald',
      finish: 'Plush',
      buildInstructions: 'Legacy build',
      referenceImages: ['/event-manager-images/garden.jpg'],
    },
    assignedCrewEmails: ['crew@demo.com'],
    status: 'In Production',
    progressPercent: 45,
    completedQty: 0,
    linkedShiftPhotoIds: ['pho-legacy-1'],
    releasedForLoading: false,
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'fab-legacy-readytoload',
    eventId: p1EventId,
    eventTitle: 'Solstice Couture Showcase',
    customItemId: 'cust-legacy-2',
    spec: {
      id: 'cust-legacy-2',
      name: 'Legacy Unverified Neon Sign',
      requestedQty: 1,
      dimensions: '1.5m x 0.8m',
      materials: 'LED Neon',
      colors: 'Warm White',
      finish: 'Gloss',
      buildInstructions: 'Mount on acrylic',
      referenceImages: ['/event-manager-images/garden.jpg'],
    },
    assignedCrewEmails: ['crew@demo.com'],
    status: 'Ready to Load',
    progressPercent: 100,
    completedQty: 1,
    linkedShiftPhotoIds: [],
    releasedForLoading: true,
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
)
stateBeforeMigration.afterShiftPhotos.push({
  id: 'pho-legacy-1',
  eventId: p1EventId,
  shiftLabel: 'Legacy Shift',
  photoUrl: '/event-manager-images/garden.jpg',
  caption: 'Legacy daily photo',
  isFabricationWork: true,
  fabricationJobId: 'fab-legacy-inprod',
  submittedByEmail: 'crew@demo.com',
  submittedByName: 'Jordan Reyes',
  submittedAt: '2026-10-01T00:00:00.000Z',
})

// Run migration twice to prove repeatability without duplicate records
const migratedOnce = store.migrateOperationsStore(stateBeforeMigration)
const migratedTwice = store.migrateOperationsStore(migratedOnce)

const legInProd1 = migratedOnce.fabricationJobs.find((j) => j.id === 'fab-legacy-inprod')
const legInProd2 = migratedTwice.fabricationJobs.find((j) => j.id === 'fab-legacy-inprod')
assert.equal(legInProd2.status, 'In Production', 'Migration must preserve ongoing In Production status and never downgrade to Unassigned')
assert.equal(legInProd2.migrationReviewFlags.length, legInProd1.migrationReviewFlags.length, 'Repeated migration must not duplicate review flags')
assert.ok(legInProd2.migrationReviewFlags.some((f) => f.code === 'DEMO_ACCOUNT_ASSIGNED'))
assert.ok(legInProd2.migrationReviewFlags.some((f) => f.code === 'MISSING_CONFIRMED_SCHEDULE'))

const legPhoto = migratedTwice.afterShiftPhotos.find((p) => p.id === 'pho-legacy-1')
assert.equal(legPhoto.isLegacyImportedEvidence, true, 'Legacy linked photo must be labeled isLegacyImportedEvidence')
assert.equal(legInProd2.submissions.length, 0, 'Migration must not fabricate a finished-work submission from legacy daily photos')

const legReady = migratedTwice.fabricationJobs.find((j) => j.id === 'fab-legacy-readytoload')
assert.ok(
  legReady.migrationReviewFlags.some(
    (f) => f.code === 'LEGACY_APPROVAL_MISSING_EVIDENCE' && f.blockingActions.includes('loading-signoff'),
  ),
)

// Persist migratedTwice and verify that submitFinalLoadingChecklist blocks on the flagged legacy Ready to Load item
store.writeOperationsStore(migratedTwice)

const manifestWithLegacy = store.getEventManifestLines(store.readOperationsStore(), p1EventId)
const flaggedLine = manifestWithLegacy.find((m) => m.sourceId === 'cust-legacy-2')
assert.ok(flaggedLine, 'Legacy Ready to Load item must appear on manifest')
assert.equal(flaggedLine.blockedByLegacyReview, true, 'Legacy Ready to Load item without verification must be flagged blockedByLegacyReview')

const blockedLoadingRes = store.submitFinalLoadingChecklist(
  crewLeadActor,
  p1EventId,
  'Attempting loading sign-off before resolving legacy flag',
)
assert.equal(blockedLoadingRes.ok, false, 'New loading sign-off must be blocked when a legacy Ready to Load item has unresolved LEGACY_APPROVAL_MISSING_EVIDENCE')
assert.ok(blockedLoadingRes.error.includes('LOADING SIGN-OFF BLOCKED'))

// Resolving a legacy status change without an audit reason must fail
const resolveNoReason = store.resolveMigrationReviewFlag(warehouseActor, {
  eventId: p1EventId,
  jobId: 'fab-legacy-readytoload',
  flagCode: 'LEGACY_APPROVAL_MISSING_EVIDENCE',
  action: 'corrected-status',
  reason: '',
  newStatus: 'Awaiting Verification',
})
assert.equal(resolveNoReason.ok, false, 'Changing a legacy status requires an audit reason')

// Resolving with an explicit audit reason succeeds
const resolveWithReason = store.resolveMigrationReviewFlag(warehouseActor, {
  eventId: p1EventId,
  jobId: 'fab-legacy-readytoload',
  flagCode: 'LEGACY_APPROVAL_MISSING_EVIDENCE',
  action: 'recorded-historical-exception',
  reason: 'Confirmed historical physical inspection prior to v2 upgrade.',
})
assert.equal(resolveWithReason.ok, true)

// ----------------------------------------------------------------------------
// 12. Failed local saves and retry
// ----------------------------------------------------------------------------
console.log('Phase 1.12: Failed local saves preserve persisted records, keep pending memory changes, and clear warning only after retry succeeds...')

const savedSnapshotBeforeFailure = localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY)
assert.ok(savedSnapshotBeforeFailure, 'Valid persisted snapshot must exist before simulated failure')

// Simulate localStorage write failure
failLocalStorageWrites = true

const createJobDuringFailure = store.createCustomFabricationJob(
  p1EventId,
  {
    name: 'Unsaved Memory Sculpture',
    requestedQty: 1,
    dimensions: '1m x 1m',
    materials: 'Resin',
    colors: 'Pearl',
    finish: 'Polished',
    buildInstructions: 'Cast in silicone mold',
    referenceImages: ['/event-manager-images/corporate.jpg'],
  },
  [],
)
assert.equal(createJobDuringFailure.ok, true, 'In-memory store mutation remains available during localStorage failure')
assert.equal(createJobDuringFailure.savedToStorage, false, 'Mutation result must report savedToStorage: false')

// 1) Previously saved records in localStorage are preserved intact
assert.equal(
  localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY),
  savedSnapshotBeforeFailure,
  'Previously saved localStorage records must be preserved when saving fails',
)

// 2) Pending changes are kept available in memory
const inMemoryState = store.readOperationsStore()
assert.ok(
  inMemoryState.fabricationJobs.some((j) => j.spec.name === 'Unsaved Memory Sculpture'),
  'Pending changes must remain available in memory',
)

// 3) Warning text is exact: "Not saved—changes may be lost on refresh."
assert.equal(
  store.getOperationsPersistenceWarning(),
  'Not saved—changes may be lost on refresh.',
  'Persistence warning must match exact required message',
)
assert.equal(store.hasUnsavedOperationsChanges(), true)

// 4) Retry while storage is still failing keeps the warning
const failedRetry = store.retryPersistOperationsStore()
assert.equal(failedRetry.ok, false)
assert.equal(
  store.getOperationsPersistenceWarning(),
  'Not saved—changes may be lost on refresh.',
  'Warning must remain active when retry fails',
)

// 5) Restore storage and click Retry -> saves pending changes and clears warning
failLocalStorageWrites = false
const successfulRetry = store.retryPersistOperationsStore()
assert.equal(successfulRetry.ok, true, 'Retry must succeed once localStorage is available')
assert.equal(store.getOperationsPersistenceWarning(), null, 'Warning must clear after successful retry')
assert.equal(store.hasUnsavedOperationsChanges(), false)

const persistedAfterRetry = JSON.parse(localStorageMock.getItem(store.OPERATIONS_STORAGE_KEY))
assert.ok(
  persistedAfterRetry.fabricationJobs.some((j) => j.spec.name === 'Unsaved Memory Sculpture'),
  'Pending in-memory changes must be persisted to localStorage after successful retry',
)

// ----------------------------------------------------------------------------
// 13. UI Entry-Point Bundle Wiring, Refresh Restoration & Account-Switch Flow
// ----------------------------------------------------------------------------
console.log('Phase 1.13: Compiled UI entry-point wiring, refresh restoration, and cross-account production/loading flow...')

const distAssets = readdirSync('dist/assets').filter((f) => f.endsWith('.js'))
const combinedBundle = distAssets.map((f) => readFileSync(`dist/assets/${f}`, 'utf8')).join('\n')
assert.ok(
  combinedBundle.includes('Not saved—changes may be lost on refresh.'),
  'Compiled UI bundle must include OperationsPersistenceBanner warning text',
)
assert.ok(
  combinedBundle.includes('Submit Finished Job for Verification'),
  'Compiled UI bundle must include Ground Crew EvidenceCaptureModule Submit Finished Job for Verification button',
)
assert.ok(
  combinedBundle.includes('Approve Finished Work') ||
    combinedBundle.includes('Verify Against Spec & Mark Ready to Load'),
  'Compiled UI bundle must include Warehouse Verification approval button',
)
assert.ok(
  combinedBundle.includes('Submit Final Loading Checklist (Team Lead)'),
  'Compiled UI bundle must include Ground Crew DispatchLoadingChecksModule submission button',
)

// End-to-end simulation of the normal UI entry points across account switches:
// 1) Warehouse creates job ('Unsaved Memory Sculpture' already created & persisted via Retry above)
const memorySculptureJob = store
  .readOperationsStore()
  .fabricationJobs.find((j) => j.spec.name === 'Unsaved Memory Sculpture')
assert.ok(memorySculptureJob)
assert.equal(memorySculptureJob.status, 'Unassigned')

// 2) Switch to Ground Crew (crewLeadActor = Jordan Reyes, inherited production lead on p1EventId):
//    Submit After-Shift Work Photo in EvidenceCaptureModule -> stays Unassigned
const uiShiftPhotoRes = store.submitAfterShiftWorkPhoto(crewLeadActor, {
  eventId: p1EventId,
  shiftLabel: 'Shift 1 — Sculpture Workshop',
  photoUrl: '/event-manager-images/corporate.jpg',
  caption: 'Cast and polished pearl resin sculpture.',
  isFabricationWork: true,
  fabricationJobId: memorySculptureJob.id,
})
assert.equal(uiShiftPhotoRes.ok, true)
assert.equal(
  store.readOperationsStore().fabricationJobs.find((j) => j.id === memorySculptureJob.id).status,
  'Unassigned',
  'Submitting after-shift photo in EvidenceCaptureModule must not auto-submit the job',
)

// 3) Ground Crew clicks "Submit Finished Job for Verification" in EvidenceCaptureModule -> Awaiting Verification
const uiSubmitVerifyRes = store.submitProductionJobForVerification(crewLeadActor, {
  jobId: memorySculptureJob.id,
  completedQty: memorySculptureJob.spec.requestedQty,
  photoUrls: ['/event-manager-images/corporate.jpg'],
  summary: 'Cast and polished pearl resin sculpture.',
})
assert.equal(uiSubmitVerifyRes.ok, true)
assert.equal(
  store.readOperationsStore().fabricationJobs.find((j) => j.id === memorySculptureJob.id).status,
  'Awaiting Verification',
)

// 4) Switch back to Warehouse Operations Manager -> clicks "Verify Against Spec & Mark Ready to Load" in CustomFabricationModule
const uiWarehouseVerifyRes = store.verifyCustomFabricationJob(warehouseActor, memorySculptureJob.id, {
  passed: true,
  notes: 'Verified pearl resin finish and dimensions.',
})
assert.equal(uiWarehouseVerifyRes.ok, true)
assert.equal(
  store.readOperationsStore().fabricationJobs.find((j) => j.id === memorySculptureJob.id).status,
  'Ready to Load',
)

// 5) Switch back to Ground Crew -> DispatchLoadingChecksModule shows all Ready to Load items on manifest;
//    update loaded quantities and submit Final Loading Checklist as Team Lead
const finalManifestLines = store.getEventManifestLines(store.readOperationsStore(), p1EventId)
assert.ok(
  finalManifestLines.some((l) => l.sourceId === memorySculptureJob.customItemId),
  'Newly verified custom item must appear on Dispatch Loading Checks manifest',
)
for (const line of finalManifestLines) {
  const upd = store.updateManifestLoadedQuantity(p1EventId, line.sourceId, line.plannedQty)
  assert.equal(upd.ok, true)
  assert.equal(upd.hasShortfall, false)
}
const finalChecklistRes = store.submitFinalLoadingChecklist(
  crewLeadActor,
  p1EventId,
  'All custom fabrication items counted and loaded.',
)
assert.equal(finalChecklistRes.ok, true, 'Team Lead final loading checklist submission must succeed')

console.log('All 13 Phase 1 Warehouse Operations & Ground Crew verification suites passed!')
