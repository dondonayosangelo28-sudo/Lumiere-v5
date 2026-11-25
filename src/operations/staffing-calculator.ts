import type {
  EstimateBasis,
  EventRosterMember,
  FabricationJob,
  OperationsStoreState,
  ProductionWindow,
  ShiftScheduleWindow,
} from "./types"

export const DEFAULT_PRODUCTIVE_HOURS_PER_DAY = 8

/**
 * Unchanged Event Manager guest-count staffing formula:
 * 1 person per 15–25 guests, minimum 2.
 * Recommends staffing for event operations and never limits Warehouse roster size.
 */
export function calculateGuestBasedEventStaffing(pax: number): {
  minCrew: number
  maxCrew: number
  rangeLabel: string
} {
  const safePax = Math.max(0, Number.isFinite(pax) ? Math.floor(pax) : 0)
  const minCrew = Math.max(2, Math.ceil(safePax / 25))
  const maxCrew = Math.max(2, Math.ceil(safePax / 15))
  return {
    minCrew,
    maxCrew,
    rangeLabel: minCrew === maxCrew ? `${minCrew}` : `${minCrew}–${maxCrew}`,
  }
}

/**
 * Calculates total estimated labor hours for a customized asset job:
 * Total estimated labor hours = required quantity × estimated labor hours per unit or complete set.
 * - Per-unit basis: quantity is individual units.
 * - Complete-set basis: quantity is complete sets (e.g. 3 arch sets × 19h/set = 57 person-hours).
 */
export function calculateJobEstimatedLaborHours(input: {
  requestedQty: number
  estimatedHoursPerUnitOrSet?: number
  estimateBasis?: EstimateBasis
}):
  | {
      ok: true
      requestedQty: number
      estimatedHoursPerUnitOrSet: number
      estimateBasis: EstimateBasis
      totalEstimatedLaborHours: number
    }
  | { ok: false; error: string } {
  const qty = Number(input.requestedQty)
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    return {
      ok: false,
      error: "Required quantity must be a positive whole number.",
    }
  }
  const hours = Number(input.estimatedHoursPerUnitOrSet)
  if (!Number.isFinite(hours) || hours <= 0) {
    return {
      ok: false,
      error:
        "Enter a positive estimated labor hours value per unit or complete set.",
    }
  }
  const basis: EstimateBasis = input.estimateBasis ?? "per-unit"
  const totalEstimatedLaborHours = Math.round(qty * hours * 100) / 100
  return {
    ok: true,
    requestedQty: qty,
    estimatedHoursPerUnitOrSet: hours,
    estimateBasis: basis,
    totalEstimatedLaborHours,
  }
}

export type WindowCrewRecommendation = {
  windowKey: string
  startDate: string
  deadlineDate: string
  availableProductionDays: number
  jobIds: string[]
  combinedEstimatedLaborHours: number
  recommendedProductionCrew: number
}

export type SkippedJobStaffingReason = {
  jobId: string
  reason: string
}

/**
 * Combines labor hours before rounding for jobs sharing the same Warehouse-confirmed production window:
 * Recommended production crew = ceil(combined estimated labor hours / (8 × available production days)).
 * Evaluates different deadlines/windows separately and excludes unconfirmed or invalid windows.
 */
export function calculateCombinedWindowCrewRecommendations(
  jobs: ReadonlyArray<{
    id: string
    requestedQty: number
    estimatedHoursPerUnitOrSet?: number
    estimateBasis?: EstimateBasis
    productionWindow?: ProductionWindow
  }>,
  productiveHoursPerDay = DEFAULT_PRODUCTIVE_HOURS_PER_DAY,
): {
  windows: WindowCrewRecommendation[]
  skippedJobs: SkippedJobStaffingReason[]
} {
  const skippedJobs: SkippedJobStaffingReason[] = []
  const groups = new Map<
    string,
    {
      startDate: string
      deadlineDate: string
      availableProductionDays: number
      jobIds: string[]
      combinedHours: number
    }
  >()

  for (const job of jobs) {
    const win = job.productionWindow
    if (!win || !win.confirmed) {
      skippedJobs.push({
        jobId: job.id,
        reason:
          "Production window must be confirmed by Warehouse before calculating staffing recommendations.",
      })
      continue
    }
    if (!win.startDate || !win.deadlineDate || win.startDate > win.deadlineDate) {
      skippedJobs.push({
        jobId: job.id,
        reason: "Production start date must be on or before the deadline date.",
      })
      continue
    }
    const days = Number(win.availableProductionDays)
    if (!Number.isFinite(days) || days <= 0) {
      skippedJobs.push({
        jobId: job.id,
        reason: "Available production days must be greater than zero.",
      })
      continue
    }
    const labor = calculateJobEstimatedLaborHours({
      requestedQty: job.requestedQty,
      estimatedHoursPerUnitOrSet: job.estimatedHoursPerUnitOrSet,
      estimateBasis: job.estimateBasis,
    })
    if (!labor.ok) {
      skippedJobs.push({
        jobId: job.id,
        reason: labor.error,
      })
      continue
    }

    const windowKey = `${win.startDate}__${win.deadlineDate}__${days}`
    const existing = groups.get(windowKey)
    if (existing) {
      existing.jobIds.push(job.id)
      existing.combinedHours =
        Math.round((existing.combinedHours + labor.totalEstimatedLaborHours) * 100) /
        100
    } else {
      groups.set(windowKey, {
        startDate: win.startDate,
        deadlineDate: win.deadlineDate,
        availableProductionDays: days,
        jobIds: [job.id],
        combinedHours: labor.totalEstimatedLaborHours,
      })
    }
  }

  const hoursPerDay =
    Number.isFinite(productiveHoursPerDay) && productiveHoursPerDay > 0
      ? productiveHoursPerDay
      : DEFAULT_PRODUCTIVE_HOURS_PER_DAY

  const windows: WindowCrewRecommendation[] = []
  for (const [windowKey, group] of groups.entries()) {
    const recommendedProductionCrew = Math.ceil(
      group.combinedHours / (hoursPerDay * group.availableProductionDays),
    )
    windows.push({
      windowKey,
      startDate: group.startDate,
      deadlineDate: group.deadlineDate,
      availableProductionDays: group.availableProductionDays,
      jobIds: group.jobIds,
      combinedEstimatedLaborHours: group.combinedHours,
      recommendedProductionCrew,
    })
  }

  return { windows, skippedJobs }
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/**
 * Parses an Asia/Manila local datetime string ("YYYY-MM-DDTHH:mm" or "YYYY-MM-DD HH:mm")
 * or an ISO string into UTC epoch milliseconds.
 */
export function parseManilaDateTimeMs(value: string): number | null {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim()
  const localMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (localMatch) {
    const [, y, m, d, hh, mm, ss = "00"] = localMatch
    const ms = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`)
    return Number.isNaN(ms) ? null : ms
  }
  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Formats UTC epoch ms into Asia/Manila date key "YYYY-MM-DD".
 */
export function formatManilaDateKey(epochMs: number): string {
  const manilaMs = epochMs + MANILA_OFFSET_MS
  const d = new Date(manilaMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Formats UTC epoch ms into Asia/Manila local datetime "YYYY-MM-DDTHH:mm".
 */
export function formatManilaLocalDateTime(epochMs: number): string {
  const manilaMs = epochMs + MANILA_OFFSET_MS
  const d = new Date(manilaMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return `${y}-${m}-${day}T${hh}:${mm}`
}

/**
 * Returns the UTC epoch ms of 00:00:00 Asia/Manila for a given "YYYY-MM-DD" date key.
 */
function manilaDayStartMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00+08:00`)
}

/**
 * Validates a shift schedule and its breaks under the confirmed Asia/Manila rules:
 * - Supports overnight shifts (startDateTime and endDateTime on different Manila calendar days).
 * - Requires explicit breakStartDateTime and breakEndDateTime when:
 *   1. An overnight shift includes a break, OR
 *   2. A designated shared shift (isSharedShift && requiredSimultaneousCrew > 1) includes a break.
 * - Validates positive break duration within [startDateTime, endDateTime] and deducts break overlap
 *   accurately from each Asia/Manila calendar day.
 * - Allows total breakMinutes for other same-day non-shared shifts.
 */
export function validateAndComputeShiftSchedule(input: {
  startDateTime: string
  endDateTime: string
  breakMinutes?: number
  breakStartDateTime?: string
  breakEndDateTime?: string
  isSharedShift?: boolean
  requiredSimultaneousCrew?: number
}):
  | {
      ok: true
      startMs: number
      endMs: number
      isOvernight: boolean
      breakMinutes: number
      breakStartMs?: number
      breakEndMs?: number
      plannedProductiveHours: number
      dailyProductiveHoursByManilaDate: Record<string, number>
    }
  | { ok: false; error: string } {
  const startMs = parseManilaDateTimeMs(input.startDateTime)
  const endMs = parseManilaDateTimeMs(input.endDateTime)
  if (startMs === null || endMs === null) {
    return {
      ok: false,
      error: "Enter valid Asia/Manila start and end dates and times.",
    }
  }
  if (endMs <= startMs) {
    return {
      ok: false,
      error: "Shift end date/time must be after start date/time.",
    }
  }

  const grossDurationMs = endMs - startMs
  const grossMinutes = Math.round(grossDurationMs / MINUTE_MS)
  const startDateKey = formatManilaDateKey(startMs)
  const endDateKey = formatManilaDateKey(endMs - 1) // -1ms so exact 00:00 end belongs to previous day
  const isOvernight = startDateKey !== endDateKey
  const isSharedShift = Boolean(
    input.isSharedShift && (input.requiredSimultaneousCrew ?? 1) > 1,
  )

  const hasExplicitBreakWindow = Boolean(
    input.breakStartDateTime?.trim() || input.breakEndDateTime?.trim(),
  )
  const rawBreakMinutes = Number(input.breakMinutes ?? 0)
  if (!Number.isFinite(rawBreakMinutes) || rawBreakMinutes < 0) {
    return { ok: false, error: "Break duration cannot be negative." }
  }

  const hasBreak = rawBreakMinutes > 0 || hasExplicitBreakWindow
  let breakMinutes = 0
  let breakStartMs: number | undefined
  let breakEndMs: number | undefined

  if (hasBreak) {
    if ((isOvernight || isSharedShift) && !hasExplicitBreakWindow) {
      return {
        ok: false,
        error: isOvernight
          ? "Overnight shifts that include breaks require explicit Break Start and Break End dates/times."
          : "Designated shared shifts that include breaks require explicit Break Start and Break End dates/times to verify simultaneous crew coverage.",
      }
    }

    if (hasExplicitBreakWindow) {
      if (!input.breakStartDateTime?.trim() || !input.breakEndDateTime?.trim()) {
        return {
          ok: false,
          error: "Provide both Break Start and Break End dates/times.",
        }
      }
      const bStart = parseManilaDateTimeMs(input.breakStartDateTime)
      const bEnd = parseManilaDateTimeMs(input.breakEndDateTime)
      if (bStart === null || bEnd === null) {
        return {
          ok: false,
          error: "Enter valid Asia/Manila Break Start and Break End dates/times.",
        }
      }
      if (bEnd <= bStart) {
        return {
          ok: false,
          error: "Break End must be after Break Start.",
        }
      }
      if (bStart < startMs || bEnd > endMs) {
        return {
          ok: false,
          error: "Break Start and Break End must fall within the shift window.",
        }
      }
      breakMinutes = Math.round((bEnd - bStart) / MINUTE_MS)
      if (breakMinutes >= grossMinutes) {
        return {
          ok: false,
          error: "Break duration must be shorter than the total shift duration.",
        }
      }
      breakStartMs = bStart
      breakEndMs = bEnd
    } else {
      breakMinutes = Math.round(rawBreakMinutes)
      if (breakMinutes >= grossMinutes) {
        return {
          ok: false,
          error: "Break duration must be shorter than the total shift duration.",
        }
      }
    }
  }

  // Compute exact productive hours per Asia/Manila calendar day
  const dailyProductiveHoursByManilaDate: Record<string, number> = {}
  let cursorMs = startMs
  while (cursorMs < endMs) {
    const dayKey = formatManilaDateKey(cursorMs)
    const nextDayStart = manilaDayStartMs(dayKey) + 24 * HOUR_MS
    const sliceEnd = Math.min(endMs, nextDayStart)
    const sliceGrossMs = sliceEnd - cursorMs

    let sliceBreakMs = 0
    if (breakStartMs !== undefined && breakEndMs !== undefined) {
      const overlapStart = Math.max(cursorMs, breakStartMs)
      const overlapEnd = Math.min(sliceEnd, breakEndMs)
      if (overlapEnd > overlapStart) {
        sliceBreakMs = overlapEnd - overlapStart
      }
    } else if (breakMinutes > 0) {
      // Same-day non-shared shift: entire break belongs to this single Manila calendar day
      sliceBreakMs = breakMinutes * MINUTE_MS
    }

    const netHours = Math.max(
      0,
      Math.round(((sliceGrossMs - sliceBreakMs) / HOUR_MS) * 100) / 100,
    )
    dailyProductiveHoursByManilaDate[dayKey] =
      Math.round(((dailyProductiveHoursByManilaDate[dayKey] ?? 0) + netHours) * 100) /
      100
    cursorMs = sliceEnd
  }

  const plannedProductiveHours =
    Math.round(((grossDurationMs - breakMinutes * MINUTE_MS) / HOUR_MS) * 100) /
    100

  return {
    ok: true,
    startMs,
    endMs,
    isOvernight,
    breakMinutes,
    breakStartMs,
    breakEndMs,
    plannedProductiveHours,
    dailyProductiveHoursByManilaDate,
  }
}

/**
 * Validates that a designated shared work interval has at least `requiredSimultaneousCrew`
 * active (non-breaking, non-cancelled) workers throughout the entire required interval.
 */
export function validateSharedShiftSimultaneousCoverage(
  schedules: ReadonlyArray<ShiftScheduleWindow>,
  target: {
    startDateTime: string
    endDateTime: string
    requiredSimultaneousCrew: number
    jobId?: string
    sharedShiftGroupId?: string
  },
): {
  ok: boolean
  requiredCrew: number
  minActiveWorkers: number
  uncoveredIntervals: {
    startDateTime: string
    endDateTime: string
    activeWorkers: number
  }[]
} {
  const reqStart = parseManilaDateTimeMs(target.startDateTime)
  const reqEnd = parseManilaDateTimeMs(target.endDateTime)
  const requiredCrew = Math.max(1, Math.round(target.requiredSimultaneousCrew || 1))

  if (reqStart === null || reqEnd === null || reqEnd <= reqStart) {
    return {
      ok: false,
      requiredCrew,
      minActiveWorkers: 0,
      uncoveredIntervals: [],
    }
  }

  const activeShifts = schedules.filter((s) => {
    if (s.status === "cancelled") return false
    if (target.sharedShiftGroupId && s.sharedShiftGroupId) {
      return s.sharedShiftGroupId === target.sharedShiftGroupId
    }
    if (target.jobId && s.jobId) {
      return s.jobId === target.jobId
    }
    return true
  })

  // Build active working intervals [a, b] per shift (excluding break windows)
  const workingSegments: { crewEmail: string; startMs: number; endMs: number }[] = []
  const boundaryPoints = new Set<number>([reqStart, reqEnd])

  for (const shift of activeShifts) {
    const sStart = parseManilaDateTimeMs(shift.startDateTime)
    const sEnd = parseManilaDateTimeMs(shift.endDateTime)
    if (sStart === null || sEnd === null || sEnd <= sStart) continue

    const bStart = shift.breakStartDateTime
      ? parseManilaDateTimeMs(shift.breakStartDateTime)
      : null
    const bEnd = shift.breakEndDateTime
      ? parseManilaDateTimeMs(shift.breakEndDateTime)
      : null

    const email = shift.crewEmail.toLowerCase()
    if (bStart !== null && bEnd !== null && bEnd > bStart) {
      if (bStart > sStart) {
        workingSegments.push({ crewEmail: email, startMs: sStart, endMs: bStart })
      }
      if (sEnd > bEnd) {
        workingSegments.push({ crewEmail: email, startMs: bEnd, endMs: sEnd })
      }
      if (bStart > reqStart && bStart < reqEnd) boundaryPoints.add(bStart)
      if (bEnd > reqStart && bEnd < reqEnd) boundaryPoints.add(bEnd)
    } else {
      workingSegments.push({ crewEmail: email, startMs: sStart, endMs: sEnd })
    }

    if (sStart > reqStart && sStart < reqEnd) boundaryPoints.add(sStart)
    if (sEnd > reqStart && sEnd < reqEnd) boundaryPoints.add(sEnd)
  }

  const sortedPoints = [...boundaryPoints].sort((a, b) => a - b)
  let minActiveWorkers = Infinity
  const uncoveredIntervals: {
    startDateTime: string
    endDateTime: string
    activeWorkers: number
  }[] = []

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const segStart = sortedPoints[i]
    const segEnd = sortedPoints[i + 1]
    if (segEnd <= segStart) continue

    const activeCrewSet = new Set<string>()
    for (const seg of workingSegments) {
      if (seg.startMs <= segStart && seg.endMs >= segEnd) {
        activeCrewSet.add(seg.crewEmail)
      }
    }
    const count = activeCrewSet.size
    if (count < minActiveWorkers) minActiveWorkers = count
    if (count < requiredCrew) {
      uncoveredIntervals.push({
        startDateTime: formatManilaLocalDateTime(segStart),
        endDateTime: formatManilaLocalDateTime(segEnd),
        activeWorkers: count,
      })
    }
  }

  if (minActiveWorkers === Infinity) minActiveWorkers = 0

  return {
    ok: uncoveredIntervals.length === 0 && minActiveWorkers >= requiredCrew,
    requiredCrew,
    minActiveWorkers,
    uncoveredIntervals,
  }
}

/**
 * Evaluates a working lead's planned capacity:
 * - Only planned `fabrication` hours contribute to fabrication capacity.
 * - Fabrication, coordination, and event duties must all fit within their daily schedule.
 */
export function calculateWorkingLeadCapacity(
  schedules: ReadonlyArray<ShiftScheduleWindow>,
  leadEmail: string,
  maxDailyHours = DEFAULT_PRODUCTIVE_HOURS_PER_DAY,
): {
  leadEmail: string
  plannedFabricationHours: number
  plannedCoordinationHours: number
  plannedEventOpsHours: number
  totalPlannedHours: number
  dailyBreakdown: Record<
    string,
    {
      fabricationHours: number
      coordinationHours: number
      eventOpsHours: number
      totalHours: number
      exceedsDailyLimit: boolean
    }
  >
  fitsWithinSchedule: boolean
} {
  const target = leadEmail.trim().toLowerCase()
  let plannedFabricationHours = 0
  let plannedCoordinationHours = 0
  let plannedEventOpsHours = 0

  const dailyBreakdown: Record<
    string,
    {
      fabricationHours: number
      coordinationHours: number
      eventOpsHours: number
      totalHours: number
      exceedsDailyLimit: boolean
    }
  > = {}

  for (const s of schedules) {
    if (s.status === "cancelled") continue
    if (s.crewEmail.trim().toLowerCase() !== target) continue

    const hours = s.plannedProductiveHours
    if (s.activityType === "fabrication") {
      plannedFabricationHours =
        Math.round((plannedFabricationHours + hours) * 100) / 100
    } else if (s.activityType === "lead-coordination") {
      plannedCoordinationHours =
        Math.round((plannedCoordinationHours + hours) * 100) / 100
    } else {
      plannedEventOpsHours =
        Math.round((plannedEventOpsHours + hours) * 100) / 100
    }

    for (const [dateKey, dayHours] of Object.entries(
      s.dailyProductiveHoursByManilaDate ?? {},
    )) {
      const entry = dailyBreakdown[dateKey] ?? {
        fabricationHours: 0,
        coordinationHours: 0,
        eventOpsHours: 0,
        totalHours: 0,
        exceedsDailyLimit: false,
      }
      if (s.activityType === "fabrication") {
        entry.fabricationHours =
          Math.round((entry.fabricationHours + dayHours) * 100) / 100
      } else if (s.activityType === "lead-coordination") {
        entry.coordinationHours =
          Math.round((entry.coordinationHours + dayHours) * 100) / 100
      } else {
        entry.eventOpsHours =
          Math.round((entry.eventOpsHours + dayHours) * 100) / 100
      }
      entry.totalHours =
        Math.round(
          (entry.fabricationHours +
            entry.coordinationHours +
            entry.eventOpsHours) *
            100,
        ) / 100
      entry.exceedsDailyLimit = entry.totalHours > maxDailyHours
      dailyBreakdown[dateKey] = entry
    }
  }

  const totalPlannedHours =
    Math.round(
      (plannedFabricationHours +
        plannedCoordinationHours +
        plannedEventOpsHours) *
        100,
    ) / 100

  const fitsWithinSchedule = Object.values(dailyBreakdown).every(
    (d) => !d.exceedsDailyLimit,
  )

  return {
    leadEmail: target,
    plannedFabricationHours,
    plannedCoordinationHours,
    plannedEventOpsHours,
    totalPlannedHours,
    dailyBreakdown,
    fitsWithinSchedule,
  }
}

export type ScheduleConflictIssue = {
  kind:
    | "overlap"
    | "daily-workload-exceeded"
    | "not-in-roster"
    | "inactive-account"
    | "shared-shift-understaffed"
    | "insufficient-fabrication-capacity"
  crewEmail?: string
  eventId?: string
  jobId?: string
  manilaDate?: string
  message: string
}

/**
 * Validates all non-cancelled schedules across the browser-local operations store for:
 * 1. Active Ground Crew account eligibility and event roster membership.
 * 2. Cross-job and cross-event shift overlaps.
 * 3. Combined daily workload against the 8-hour default in Asia/Manila.
 * 4. Estimated job labor hours vs. scheduled fabrication capacity.
 * 5. Minimum active (non-breaking) simultaneous crew on designated shared shifts.
 */
export function validateStoreSchedulesAndWorkload(
  state: OperationsStoreState,
  activeGroundCrewEmails?: ReadonlySet<string>,
  maxDailyHours = DEFAULT_PRODUCTIVE_HOURS_PER_DAY,
): {
  conflicts: ScheduleConflictIssue[]
  dailyWorkloadByWorker: Record<string, Record<string, number>>
  jobFabricationCapacity: Record<
    string,
    { estimatedHours: number; scheduledFabricationHours: number; sufficient: boolean }
  >
} {
  const conflicts: ScheduleConflictIssue[] = []
  const dailyWorkloadByWorker: Record<string, Record<string, number>> = {}

  const allScheduled: ShiftScheduleWindow[] = []
  const rosterByEvent = new Map<string, Set<string>>()

  for (const order of state.orderRequests) {
    const activeRoster = new Set<string>(
      (order.eventRoster ?? [])
        .filter((r: EventRosterMember) => !r.removedAt)
        .map((r: EventRosterMember) => r.crewEmail.toLowerCase()),
    )
    rosterByEvent.set(order.eventId, activeRoster)

    for (const s of order.eventSchedules ?? []) {
      if (s.status !== "cancelled") allScheduled.push(s)
    }
  }

  for (const job of state.fabricationJobs) {
    for (const s of job.schedules ?? []) {
      if (s.status !== "cancelled") allScheduled.push(s)
    }
  }

  // 1. Check account eligibility, roster membership, and accumulate daily workload
  for (const shift of allScheduled) {
    const email = shift.crewEmail.trim().toLowerCase()
    if (activeGroundCrewEmails && !activeGroundCrewEmails.has(email)) {
      conflicts.push({
        kind: "inactive-account",
        crewEmail: email,
        eventId: shift.eventId,
        jobId: shift.jobId,
        message: `${email} is not an active Ground Crew account.`,
      })
    }

    const eventRoster = rosterByEvent.get(shift.eventId)
    if (eventRoster && eventRoster.size > 0 && !eventRoster.has(email)) {
      conflicts.push({
        kind: "not-in-roster",
        crewEmail: email,
        eventId: shift.eventId,
        jobId: shift.jobId,
        message: `${email} is scheduled on event ${shift.eventId} but is not a member of its Event Crew Group.`,
      })
    }

    const workerDays = dailyWorkloadByWorker[email] ?? {}
    for (const [dateKey, hours] of Object.entries(
      shift.dailyProductiveHoursByManilaDate ?? {},
    )) {
      workerDays[dateKey] = Math.round(((workerDays[dateKey] ?? 0) + hours) * 100) / 100
    }
    dailyWorkloadByWorker[email] = workerDays
  }

  // 2. Check daily workload against 8-hour default
  for (const [email, days] of Object.entries(dailyWorkloadByWorker)) {
    for (const [dateKey, totalHours] of Object.entries(days)) {
      if (totalHours > maxDailyHours) {
        conflicts.push({
          kind: "daily-workload-exceeded",
          crewEmail: email,
          manilaDate: dateKey,
          message: `${email} is scheduled for ${totalHours}h on ${dateKey} (exceeds ${maxDailyHours}h daily default).`,
        })
      }
    }
  }

  // 3. Check cross-job and cross-event overlaps per worker
  const shiftsByWorker = new Map<string, ShiftScheduleWindow[]>()
  for (const shift of allScheduled) {
    const email = shift.crewEmail.trim().toLowerCase()
    const list = shiftsByWorker.get(email) ?? []
    list.push(shift)
    shiftsByWorker.set(email, list)
  }

  for (const [email, list] of shiftsByWorker.entries()) {
    const withMs = list
      .map((s) => ({
        shift: s,
        startMs: parseManilaDateTimeMs(s.startDateTime) ?? 0,
        endMs: parseManilaDateTimeMs(s.endDateTime) ?? 0,
      }))
      .filter((x) => x.endMs > x.startMs)
      .sort((a, b) => a.startMs - b.startMs)

    for (let i = 0; i < withMs.length; i++) {
      for (let j = i + 1; j < withMs.length; j++) {
        const a = withMs[i]
        const b = withMs[j]
        if (b.startMs >= a.endMs) break
        // Ignore exact identical shift ID
        if (a.shift.id === b.shift.id) continue
        conflicts.push({
          kind: "overlap",
          crewEmail: email,
          eventId: b.shift.eventId,
          jobId: b.shift.jobId,
          message: `${email} has overlapping shifts (${a.shift.startDateTime}–${a.shift.endDateTime} and ${b.shift.startDateTime}–${b.shift.endDateTime}).`,
        })
      }
    }
  }

  // 4. Check job estimated labor vs scheduled fabrication capacity & shared-shift simultaneous coverage
  const jobFabricationCapacity: Record<
    string,
    { estimatedHours: number; scheduledFabricationHours: number; sufficient: boolean }
  > = {}

  for (const job of state.fabricationJobs as FabricationJob[]) {
    const jobSchedules = (job.schedules ?? []).filter((s) => s.status !== "cancelled")
    const scheduledFabricationHours = jobSchedules
      .filter((s) => s.activityType === "fabrication")
      .reduce((sum, s) => Math.round((sum + s.plannedProductiveHours) * 100) / 100, 0)

    const laborRes = calculateJobEstimatedLaborHours({
      requestedQty: job.spec.requestedQty,
      estimatedHoursPerUnitOrSet:
        job.estimatedHoursPerUnitOrSet ?? job.spec.estimatedHoursPerUnitOrSet,
      estimateBasis: job.estimateBasis ?? job.spec.estimateBasis,
    })

    if (laborRes.ok) {
      const sufficient = scheduledFabricationHours >= laborRes.totalEstimatedLaborHours
      jobFabricationCapacity[job.id] = {
        estimatedHours: laborRes.totalEstimatedLaborHours,
        scheduledFabricationHours,
        sufficient,
      }
      if (jobSchedules.length > 0 && !sufficient) {
        conflicts.push({
          kind: "insufficient-fabrication-capacity",
          eventId: job.eventId,
          jobId: job.id,
          message: `Job ${job.spec.name} requires ${laborRes.totalEstimatedLaborHours}h of fabrication labor, but only ${scheduledFabricationHours}h are scheduled.`,
        })
      }
    }

    // Shared-shift check
    const checkedGroups = new Set<string>()
    for (const s of jobSchedules) {
      if (!s.isSharedShift || (s.requiredSimultaneousCrew ?? 1) <= 1) continue
      const groupKey =
        s.sharedShiftGroupId || `${s.startDateTime}__${s.endDateTime}__${s.requiredSimultaneousCrew}`
      if (checkedGroups.has(groupKey)) continue
      checkedGroups.add(groupKey)

      const cov = validateSharedShiftSimultaneousCoverage(jobSchedules, {
        startDateTime: s.startDateTime,
        endDateTime: s.endDateTime,
        requiredSimultaneousCrew: s.requiredSimultaneousCrew ?? 2,
        jobId: job.id,
        sharedShiftGroupId: s.sharedShiftGroupId,
      })
      if (!cov.ok) {
        conflicts.push({
          kind: "shared-shift-understaffed",
          eventId: job.eventId,
          jobId: job.id,
          message: `Shared shift on ${job.spec.name} (${s.startDateTime}–${s.endDateTime}) requires ${cov.requiredCrew} simultaneous active workers throughout the interval, but minimum coverage drops to ${cov.minActiveWorkers}.`,
        })
      }
    }
  }

  return {
    conflicts,
    dailyWorkloadByWorker,
    jobFabricationCapacity,
  }
}
