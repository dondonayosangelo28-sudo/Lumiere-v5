import { getState as getAuthState } from "../auth/store"
import { oldSystemApis, v51ContractApis } from "./apiClients"
import {
  parseManilaDateTimeMs,
  validateAndComputeShiftSchedule,
} from "./staffing-calculator"
import type {
  CrewTaskStatus,
  FabricationJob,
  OperationsStoreState,
  ShiftActivityType,
  ShiftScheduleWindow,
  WorkerAssignmentRecord,
} from "./types"
import {
  getAvailableGroundCrewAccounts,
  hasUnresolvedMigrationFlag,
  mutateOperationsStore,
  readOperationsStore,
  type OpsActor,
} from "./store-core"

export type RosterOrLeadImpactReport = {
  eventId: string
  targetCrewEmail: string
  action: "remove-roster" | "replace-lead"
  affectedJobIds: string[]
  affectedJobs: {
    id: string
    name: string
    status: string
    isLead: boolean
    isParticipant: boolean
  }[]
  futureScheduleIds: string[]
  futureSchedules: ShiftScheduleWindow[]
  activeAssignmentIds: string[]
  requiresResolution: boolean
}

/**
 * Computes the impact of removing a roster member or replacing a lead BEFORE confirmation,
 * showing affected production jobs and future schedules.
 */
function isFutureUnstartedShift(s: ShiftScheduleWindow, nowMs: number): boolean {
  if (s.status !== "scheduled") return false
  const startMs = parseManilaDateTimeMs(s.startDateTime)
  return startMs === null ? true : startMs > nowMs
}

export function previewRosterOrLeadChangeImpact(
  state: OperationsStoreState,
  input: {
    eventId: string
    targetCrewEmail: string
    action: "remove-roster" | "replace-lead"
    referenceNowMs?: number
  },
): RosterOrLeadImpactReport {
  const email = input.targetCrewEmail.trim().toLowerCase()
  const nowMs = input.referenceNowMs ?? Date.now()
  const order = state.orderRequests.find((o) => o.eventId === input.eventId)

  const affectedJobs: RosterOrLeadImpactReport["affectedJobs"] = []
  const futureSchedules: ShiftScheduleWindow[] = []
  const activeAssignmentIds: string[] = []

  const eventJobs = state.fabricationJobs.filter(
    (j) => j.eventId === input.eventId && j.status !== "Ready to Load",
  )

  for (const job of eventJobs) {
    const isLead =
      job.productionLeadEmail?.toLowerCase() === email ||
      job.inheritedLeadEmail?.toLowerCase() === email
    const isParticipant =
      (job.participantEmails ?? []).some((e) => e.toLowerCase() === email) ||
      (job.assignedCrewEmails ?? []).some((e) => e.toLowerCase() === email) ||
      (job.assignments ?? []).some(
        (a) =>
          a.crewEmail.toLowerCase() === email && a.status !== "Completed",
      )

    if (
      (input.action === "remove-roster" && (isLead || isParticipant)) ||
      (input.action === "replace-lead" && isLead)
    ) {
      affectedJobs.push({
        id: job.id,
        name: job.spec.name,
        status: job.status,
        isLead,
        isParticipant,
      })
    }

    for (const s of job.schedules ?? []) {
      if (s.crewEmail.toLowerCase() !== email) continue
      if (isFutureUnstartedShift(s, nowMs)) {
        futureSchedules.push(s)
      }
    }

    for (const a of job.assignments ?? []) {
      if (a.crewEmail.toLowerCase() === email && a.status === "Assigned") {
        activeAssignmentIds.push(a.id)
      }
    }
  }

  for (const s of order?.eventSchedules ?? []) {
    if (s.crewEmail.toLowerCase() !== email) continue
    if (isFutureUnstartedShift(s, nowMs)) {
      futureSchedules.push(s)
    }
  }

  for (const a of order?.eventAssignments ?? []) {
    if (a.crewEmail.toLowerCase() === email && a.status === "Assigned") {
      activeAssignmentIds.push(a.id)
    }
  }

  for (const a of order?.crewAssignments ?? []) {
    if (a.crewEmail.toLowerCase() === email && a.taskStatus !== "Completed") {
      activeAssignmentIds.push(a.id)
    }
  }

  const requiresResolution =
    affectedJobs.length > 0 ||
    futureSchedules.length > 0 ||
    (input.action === "remove-roster" && activeAssignmentIds.length > 0)

  return {
    eventId: input.eventId,
    targetCrewEmail: email,
    action: input.action,
    affectedJobIds: affectedJobs.map((j) => j.id),
    affectedJobs,
    futureScheduleIds: futureSchedules.map((s) => s.id),
    futureSchedules,
    activeAssignmentIds,
    requiresResolution,
  }
}

/**
 * Warehouse Operations Manager:
 * Adds an active Ground Crew account to the event's crew group (roster).
 * Roster membership does NOT automatically schedule production or event-day work,
 * and does NOT automatically designate the member as Event Team Lead.
 */
export function addCrewToEventRoster(
  actor: OpsActor,
  payload: {
    eventId: string
    crewEmail: string
    crewName?: string
  },
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can modify the event crew roster.",
    }
  }
  const cleanEmail = payload.crewEmail.trim().toLowerCase()
  if (!cleanEmail) {
    return { ok: false, error: "Select a Ground Crew account to add to the roster." }
  }

  const activeCrew = getAvailableGroundCrewAccounts()
  const matchedAccount = activeCrew.find(
    (u) => u.email.toLowerCase() === cleanEmail,
  )
  if (activeCrew.length > 0 && !matchedAccount && !payload.crewName?.trim()) {
    return {
      ok: false,
      error: `${cleanEmail} is not an active Ground Crew account.`,
    }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const roster = order.eventRoster ?? []
    const existing = roster.find(
      (r) => r.crewEmail.toLowerCase() === cleanEmail,
    )
    const now = new Date().toISOString()
    const displayName =
      matchedAccount?.name || payload.crewName?.trim() || cleanEmail

    if (existing) {
      existing.removedAt = undefined
      existing.removedByEmail = undefined
      existing.removalReason = undefined
      existing.crewName = displayName
      existing.needsWarehouseReview = false
    } else {
      roster.push({
        crewEmail: cleanEmail,
        crewName: displayName,
        addedAt: now,
        addedByEmail: actor.email,
        addedByName: actor.name,
      })
    }
    order.eventRoster = roster
    return { ok: true }
  })
}

/**
 * Warehouse Operations Manager:
 * Removes a member from the Event Crew Group after checking affected production jobs
 * and future schedules. Preserves original submitters, attendance, actual hours, and reports.
 */
export function removeCrewFromEventRoster(
  actor: OpsActor,
  payload: {
    eventId: string
    crewEmail: string
    reason: string
    reassignToEmail?: string
    reassignToName?: string
    cancelFutureShifts?: boolean
    referenceNowMs?: number
  },
):
  | { ok: true; impact: RosterOrLeadImpactReport }
  | { ok: false; error: string; impact?: RosterOrLeadImpactReport } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can remove a roster member.",
    }
  }
  const cleanEmail = payload.crewEmail.trim().toLowerCase()
  if (!payload.reason.trim()) {
    return {
      ok: false,
      error: "Provide a reason for removing this member from the event roster.",
    }
  }

  const replacementEmail = payload.reassignToEmail?.trim().toLowerCase() || ""
  if (replacementEmail && replacementEmail === cleanEmail) {
    return {
      ok: false,
      error: "Replacement worker cannot be the same as the removed worker.",
    }
  }
  if (replacementEmail) {
    const authAccounts = getAuthState().accounts
    const matchedAuth = authAccounts.find(
      (u) => u.email.trim().toLowerCase() === replacementEmail,
    )
    if (
      matchedAuth &&
      (matchedAuth.role !== "Ground Crew" ||
        Boolean(matchedAuth.deletedAt) ||
        matchedAuth.status !== "Active")
    ) {
      return {
        ok: false,
        error: `${replacementEmail} is not an eligible active Ground Crew account.`,
      }
    }
    const activeCrew = getAvailableGroundCrewAccounts()
    if (
      activeCrew.length > 0 &&
      !matchedAuth &&
      !payload.reassignToName?.trim()
    ) {
      return {
        ok: false,
        error: `${replacementEmail} is not an active Ground Crew account.`,
      }
    }
  }

  const nowMs = payload.referenceNowMs ?? Date.now()
  const currentState = readOperationsStore()
  const orderCheck = currentState.orderRequests.find(
    (o) => o.eventId === payload.eventId,
  )
  if (!orderCheck) {
    return { ok: false, error: "Event Order Request not found." }
  }
  if (orderCheck.teamLeadEmail?.toLowerCase() === cleanEmail && !replacementEmail) {
    return {
      ok: false,
      error:
        "Replace the Event Team Lead before removing them from the event roster.",
    }
  }

  const impact = previewRosterOrLeadChangeImpact(currentState, {
    eventId: payload.eventId,
    targetCrewEmail: cleanEmail,
    action: "remove-roster",
    referenceNowMs: nowMs,
  })

  if (
    impact.requiresResolution &&
    !replacementEmail &&
    !payload.cancelFutureShifts
  ) {
    return {
      ok: false,
      error: `Cannot remove ${cleanEmail} without resolving ${impact.affectedJobs.length} affected job(s) and ${impact.futureSchedules.length} scheduled shift(s). Specify a replacement worker or confirm cancelling future unstarted shifts.`,
      impact,
    }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const activeCrew = getAvailableGroundCrewAccounts()
    const matchedReplacement = activeCrew.find(
      (u) => u.email.toLowerCase() === replacementEmail,
    )
    const replacementName =
      matchedReplacement?.name ||
      payload.reassignToName?.trim() ||
      replacementEmail

    // Helper: identify future unstarted shifts belonging to unstarted ("Assigned") assignments
    const isTransferableShift = (
      s: ShiftScheduleWindow,
      assignments: WorkerAssignmentRecord[],
    ) => {
      if (s.crewEmail.toLowerCase() !== cleanEmail) return false
      if (!isFutureUnstartedShift(s, nowMs)) return false
      const linked = assignments.find((a) => a.id === s.assignmentId)
      return !linked || linked.status === "Assigned"
    }

    // Validate replacement schedule conflicts atomically BEFORE mutating any records
    if (replacementEmail) {
      const candidateShifts: ShiftScheduleWindow[] = [
        ...(order.eventSchedules ?? []).filter((s) =>
          isTransferableShift(s, order.eventAssignments ?? []),
        ),
        ...draft.fabricationJobs
          .filter((j) => j.eventId === payload.eventId && j.status !== "Ready to Load")
          .flatMap((j) =>
            (j.schedules ?? []).filter((s) =>
              isTransferableShift(s, j.assignments ?? []),
            ),
          ),
      ]

      const replacementExisting: ShiftScheduleWindow[] = [
        ...draft.orderRequests.flatMap((o) => o.eventSchedules ?? []),
        ...draft.fabricationJobs.flatMap((j) => j.schedules ?? []),
      ].filter(
        (s) =>
          s.status === "scheduled" &&
          s.crewEmail.toLowerCase() === replacementEmail,
      )

      const againstList = [...replacementExisting]
      for (const cand of candidateShifts) {
        const cStart = parseManilaDateTimeMs(cand.startDateTime)
        const cEnd = parseManilaDateTimeMs(cand.endDateTime)
        if (cStart === null || cEnd === null) continue
        for (const ex of againstList) {
          const eStart = parseManilaDateTimeMs(ex.startDateTime)
          const eEnd = parseManilaDateTimeMs(ex.endDateTime)
          if (eStart !== null && eEnd !== null && cStart < eEnd && eStart < cEnd) {
            return {
              ok: false,
              error: `Schedule conflict: ${replacementEmail} is already scheduled during ${ex.startDateTime}–${ex.endDateTime}.`,
              impact,
            }
          }
        }
        againstList.push(cand)
      }
    }

    const now = new Date().toISOString()

    // Shared helper to transfer/cancel unstarted assignments & future unstarted shifts while preserving past/started work
    const resolveScopeAssignmentsAndShifts = (
      assignments: WorkerAssignmentRecord[],
      schedules: ShiftScheduleWindow[],
    ) => {
      for (const s of schedules) {
        if (!isTransferableShift(s, assignments)) continue
        if (replacementEmail) {
          const oldAsg = assignments.find((a) => a.id === s.assignmentId)
          if (oldAsg && oldAsg.status === "Assigned") {
            const hasNonTransferableShift = schedules.some(
              (other) =>
                other.id !== s.id &&
                other.assignmentId === oldAsg.id &&
                !isTransferableShift(other, assignments),
            )
            if (!hasNonTransferableShift) {
              oldAsg.crewEmail = replacementEmail
              oldAsg.crewName = replacementName
              oldAsg.updatedAt = now
            } else {
              // Split future unstarted shift into a new Assigned assignment for replacement so historical work stays intact
              const splitId = `asg-rep-${Date.now().toString().slice(-5)}-${assignments.length + 1}`
              const splitAsg: WorkerAssignmentRecord = {
                ...oldAsg,
                id: splitId,
                crewEmail: replacementEmail,
                crewName: replacementName,
                status: "Assigned",
                startedAt: undefined,
                submittedAt: undefined,
                completedAt: undefined,
                updatedAt: now,
              }
              assignments.push(splitAsg)
              s.assignmentId = splitId
            }
          }
          s.crewEmail = replacementEmail
          s.crewName = replacementName
        } else if (payload.cancelFutureShifts) {
          s.status = "cancelled"
          s.cancelledAt = now
          s.cancelledByEmail = actor.email
          s.cancellationReason = payload.reason.trim()
        }
      }

      if (replacementEmail) {
        for (const a of assignments) {
          if (a.crewEmail.toLowerCase() === cleanEmail && a.status === "Assigned") {
            const hasStartedOrPastShift = schedules.some(
              (s) =>
                s.assignmentId === a.id &&
                s.status === "scheduled" &&
                !isFutureUnstartedShift(s, nowMs),
            )
            if (!hasStartedOrPastShift) {
              a.crewEmail = replacementEmail
              a.crewName = replacementName
              a.updatedAt = now
            }
          }
        }
      }
    }

    if (replacementEmail) {
      const roster = order.eventRoster ?? []
      const existingRep = roster.find(
        (r) => r.crewEmail.toLowerCase() === replacementEmail,
      )
      if (existingRep) {
        existingRep.removedAt = undefined
        existingRep.removedByEmail = undefined
        existingRep.removalReason = undefined
        existingRep.crewName = replacementName
      } else {
        roster.push({
          crewEmail: replacementEmail,
          crewName: replacementName,
          addedAt: now,
          addedByEmail: actor.email,
          addedByName: actor.name,
        })
      }
      order.eventRoster = roster

      if (order.teamLeadEmail?.toLowerCase() === cleanEmail) {
        order.teamLeadHistory = order.teamLeadHistory ?? []
        order.teamLeadHistory.unshift({
          id: `tlc-${Date.now().toString().slice(-6)}`,
          previousLeadEmail: order.teamLeadEmail,
          previousLeadName: order.teamLeadName,
          newLeadEmail: replacementEmail,
          newLeadName: replacementName,
          changedByEmail: actor.email,
          changedByName: actor.name,
          changedAt: now,
          reason: payload.reason.trim(),
        })
        order.teamLeadEmail = replacementEmail
        order.teamLeadName = replacementName
      }
    }

    for (const r of order.eventRoster ?? []) {
      if (r.crewEmail.toLowerCase() === cleanEmail && !r.removedAt) {
        r.removedAt = now
        r.removedByEmail = actor.email
        r.removalReason = payload.reason.trim()
      }
    }

    for (const job of draft.fabricationJobs) {
      if (job.eventId !== payload.eventId || job.status === "Ready to Load") continue

      const jobAssignments = job.assignments ?? (job.assignments = [])
      const jobSchedules = job.schedules ?? (job.schedules = [])
      const hasStartedOrCompletedWork = jobAssignments.some(
        (a) =>
          a.crewEmail.toLowerCase() === cleanEmail &&
          (a.status === "In Progress" ||
            a.status === "Submitted" ||
            a.status === "Completed"),
      )

      if (replacementEmail) {
        if (job.productionLeadEmail?.toLowerCase() === cleanEmail) {
          job.productionLeadEmail = replacementEmail
          job.productionLeadName = replacementName
        }
        if (job.inheritedLeadEmail?.toLowerCase() === cleanEmail) {
          job.inheritedLeadEmail = replacementEmail
          job.inheritedLeadName = replacementName
        }
        if (!hasStartedOrCompletedWork) {
          job.participantEmails = (job.participantEmails ?? []).map((e) =>
            e.toLowerCase() === cleanEmail ? replacementEmail : e,
          )
          job.assignedCrewEmails = (job.assignedCrewEmails ?? []).map((e) =>
            e.toLowerCase() === cleanEmail ? replacementEmail : e,
          )
        } else if (
          !(job.participantEmails ?? []).some(
            (e) => e.toLowerCase() === replacementEmail,
          )
        ) {
          job.participantEmails = [
            ...(job.participantEmails ?? []),
            replacementEmail,
          ]
          job.assignedCrewEmails = [
            ...(job.assignedCrewEmails ?? []),
            replacementEmail,
          ]
        }
      } else if (!hasStartedOrCompletedWork) {
        job.participantEmails = (job.participantEmails ?? []).filter(
          (e) => e.toLowerCase() !== cleanEmail,
        )
        job.assignedCrewEmails = (job.assignedCrewEmails ?? []).filter(
          (e) => e.toLowerCase() !== cleanEmail,
        )
      }

      resolveScopeAssignmentsAndShifts(jobAssignments, jobSchedules)
    }

    const evtAssignments = order.eventAssignments ?? (order.eventAssignments = [])
    const evtSchedules = order.eventSchedules ?? (order.eventSchedules = [])
    resolveScopeAssignmentsAndShifts(evtAssignments, evtSchedules)

    return { ok: true, impact }
  })
}

/**
 * Warehouse Operations Manager — Personnel Deployment & Team Lead Designation:
 * Assigns a Ground Crew account to an event WITHOUT overwriting existing worker schedules or duties,
 * and WITHOUT automatically designating the first member as Team Lead unless `makeTeamLead: true`.
 */
export function assignCrewMemberToEvent(
  actor: OpsActor,
  payload: {
    eventId: string
    assignmentId?: string
    crewEmail: string
    crewName: string
    schedule: string
    duties: string
    shiftLabel: string
    makeTeamLead?: boolean
    teamLeadReason?: string
  },
): { ok: true; assignmentId: string } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const normalizedEmail = payload.crewEmail.trim().toLowerCase()
    const cleanName = payload.crewName.trim() || normalizedEmail
    const now = new Date().toISOString()

    // Ensure member is on the event roster
    const roster = order.eventRoster ?? []
    const rosterEntry = roster.find(
      (r) => r.crewEmail.toLowerCase() === normalizedEmail,
    )
    if (rosterEntry) {
      rosterEntry.removedAt = undefined
    } else {
      roster.push({
        crewEmail: normalizedEmail,
        crewName: cleanName,
        addedAt: now,
        addedByEmail: actor.email,
        addedByName: actor.name,
      })
    }
    order.eventRoster = roster

    // Only update in place if an explicit `assignmentId` was provided;
    // otherwise append a distinct assignment so existing schedules/duties are NEVER overwritten.
    const existingById = payload.assignmentId
      ? order.crewAssignments.find((a) => a.id === payload.assignmentId)
      : undefined

    let assignmentId: string
    if (existingById) {
      existingById.schedule = payload.schedule.trim() || existingById.schedule
      existingById.duties = payload.duties.trim() || existingById.duties
      existingById.shiftLabel =
        payload.shiftLabel.trim() || existingById.shiftLabel
      existingById.updatedAt = now
      assignmentId = existingById.id
    } else {
      assignmentId = `asg-${Date.now().toString().slice(-6)}-${order.crewAssignments.length + 1}`
      order.crewAssignments.push({
        id: assignmentId,
        eventId: payload.eventId,
        crewEmail: normalizedEmail,
        crewName: cleanName,
        schedule: payload.schedule.trim() || "Event Schedule — Full Shift",
        duties:
          payload.duties.trim() ||
          "Field logistics, dispatch loading checks, venue setup, and post-event return audit.",
        shiftLabel: payload.shiftLabel.trim() || "Shift 1 — Event Operations",
        taskStatus: "Assigned",
        updatedAt: now,
      })
    }

    // Explicit Team Lead designation ONLY when `makeTeamLead === true`
    if (payload.makeTeamLead) {
      const prevEmail = order.teamLeadEmail
      const prevName = order.teamLeadName
      order.teamLeadExplicitlySelected = true
      if (prevEmail?.toLowerCase() !== normalizedEmail) {
        order.teamLeadEmail = normalizedEmail
        order.teamLeadName = cleanName
        order.teamLeadHistory.unshift({
          id: `tlh-${Date.now().toString().slice(-6)}`,
          previousLeadEmail: prevEmail,
          previousLeadName: prevName,
          newLeadEmail: normalizedEmail,
          newLeadName: cleanName,
          changedByEmail: actor.email,
          changedByName: actor.name,
          changedAt: now,
          reason:
            payload.teamLeadReason?.trim() ||
            (prevEmail
              ? "Team Lead designation reassigned by Warehouse Operations Manager."
              : "Explicit Team Lead designation by Warehouse Operations Manager."),
        })

        // Inherit onto event production jobs that haven't overridden their Production Lead
        for (const job of draft.fabricationJobs) {
          if (job.eventId !== payload.eventId) continue
          const hadInherited =
            !job.productionLeadEmail ||
            job.productionLeadEmail.toLowerCase() ===
              (prevEmail?.toLowerCase() ?? "")
          job.inheritedLeadEmail = normalizedEmail
          job.inheritedLeadName = cleanName
          if (hadInherited) {
            job.productionLeadEmail = normalizedEmail
            job.productionLeadName = cleanName
          }
        }
      }
    }

    return { ok: true, assignmentId }
  })
}

/**
 * Warehouse Operations Manager — Explicitly Select or Replace Event Team Lead:
 * - Validates membership in the event roster (or assigned crew).
 * - Preserves original submitters, attendance, hours, reports, and past leadership records.
 * - Updates inherited Production Lead on the event's production jobs where not overridden.
 */
export function designateEventTeamLead(
  actor: OpsActor,
  payload: {
    eventId: string
    newLeadEmail: string
    newLeadName: string
    reason: string
    updateInheritedJobLeads?: boolean
  },
):
  | { ok: true; impact: RosterOrLeadImpactReport }
  | { ok: false; error: string } {
  const currentState = readOperationsStore()
  const normalizedEmail = payload.newLeadEmail.trim().toLowerCase()
  const prevLead =
    currentState.orderRequests.find((o) => o.eventId === payload.eventId)
      ?.teamLeadEmail ?? normalizedEmail

  const impact = previewRosterOrLeadChangeImpact(currentState, {
    eventId: payload.eventId,
    targetCrewEmail: prevLead,
    action: "replace-lead",
  })

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const isRosterOrAssigned =
      (order.eventRoster ?? []).some(
        (r) => r.crewEmail.toLowerCase() === normalizedEmail && !r.removedAt,
      ) ||
      order.crewAssignments.some(
        (a) => a.crewEmail.toLowerCase() === normalizedEmail,
      )
    if (!isRosterOrAssigned) {
      return {
        ok: false,
        error:
          "The designated Event Team Lead must be a member of the event crew roster.",
      }
    }

    const now = new Date().toISOString()
    const prevEmail = order.teamLeadEmail
    const prevName = order.teamLeadName
    const cleanName = payload.newLeadName.trim() || normalizedEmail

    order.teamLeadExplicitlySelected = true

    // Resolve any AUTO_DESIGNATED_TEAM_LEAD migration flag
    for (const f of order.migrationReviewFlags ?? []) {
      if (f.code === "AUTO_DESIGNATED_TEAM_LEAD" && !f.resolvedAt) {
        f.resolvedAt = now
        f.resolvedByEmail = actor.email
        f.resolvedByName = actor.name
        f.resolutionNotes = payload.reason.trim() || "Explicitly confirmed Team Lead."
      }
    }

    if (order.teamLeadEmail?.toLowerCase() !== normalizedEmail) {
      order.teamLeadEmail = normalizedEmail
      order.teamLeadName = cleanName
      order.teamLeadHistory.unshift({
        id: `tlh-${Date.now().toString().slice(-6)}`,
        previousLeadEmail: prevEmail,
        previousLeadName: prevName,
        newLeadEmail: normalizedEmail,
        newLeadName: cleanName,
        changedByEmail: actor.email,
        changedByName: actor.name,
        changedAt: now,
        reason:
          payload.reason.trim() ||
          "Team Lead designated by Warehouse Operations Manager.",
      })
    }

    // Update inherited lead on event's production jobs unless overridden
    const shouldUpdateJobs = payload.updateInheritedJobLeads ?? true
    for (const job of draft.fabricationJobs) {
      if (job.eventId !== payload.eventId) continue
      const wasUsingInherited =
        !job.productionLeadEmail ||
        job.productionLeadEmail.toLowerCase() ===
          (prevEmail?.toLowerCase() ?? "")
      job.inheritedLeadEmail = normalizedEmail
      job.inheritedLeadName = cleanName
      if (shouldUpdateJobs && wasUsingInherited) {
        job.productionLeadEmail = normalizedEmail
        job.productionLeadName = cleanName
      }
    }

    void v51ContractApis.setEventTeamLead(payload.eventId, {
      newLeadEmail: normalizedEmail,
      newLeadName: cleanName,
      changedByEmail: actor.email,
      changedByName: actor.name,
      reason: payload.reason.trim(),
    })

    return { ok: true, impact }
  })
}

function defaultInstructionsForActivity(
  activityType: ShiftActivityType,
  job?: FabricationJob,
): string {
  if (activityType === "fabrication" && job) {
    return job.spec.buildInstructions
  }
  switch (activityType) {
    case "fabrication":
      return "Execute custom production fabrication build."
    case "lead-coordination":
      return job
        ? `Coordinate and supervise production for ${job.spec.name}.`
        : "Lead event crew coordination and checkpoint supervision."
    case "loading":
      return "Execute dispatch loading counts and vehicle manifest verification."
    case "transport":
      return "Manage asset transport between warehouse and venue."
    case "setup":
      return "Execute venue setup, placement, and ingress checks."
    case "event":
      return "Provide on-site event hours support and monitoring."
    case "dismantling":
      return "Execute post-event dismantling and egress pack-out."
    case "returns":
      return "Execute warehouse arrival unloading and return condition audit."
  }
}

/**
 * Warehouse Operations Manager:
 * Schedules a concrete Asia/Manila shift window for a worker on an event or production job.
 * Validates roster membership, overnight/shared-shift break rules, and cross-job/event overlaps.
 * Distinguishes assignments by event/job, duty or phase, role, and intended work context.
 */
export function scheduleWorkerShift(
  actor: OpsActor,
  payload: {
    eventId: string
    jobId?: string
    assignmentId?: string
    createNewAssignment?: boolean
    crewEmail: string
    crewName?: string
    role?: "working-lead" | "crew"
    activityType: ShiftActivityType
    startDateTime: string
    endDateTime: string
    breakMinutes?: number
    breakStartDateTime?: string
    breakEndDateTime?: string
    isSharedShift?: boolean
    sharedShiftGroupId?: string
    requiredSimultaneousCrew?: number
    instructions?: string
    allowOverlap?: boolean
  },
):
  | {
      ok: true
      shift: ShiftScheduleWindow
      assignment: WorkerAssignmentRecord
    }
  | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can schedule shifts.",
    }
  }

  const cleanEmail = payload.crewEmail.trim().toLowerCase()
  if (!cleanEmail) {
    return { ok: false, error: "Select a worker to schedule." }
  }

  const calc = validateAndComputeShiftSchedule({
    startDateTime: payload.startDateTime,
    endDateTime: payload.endDateTime,
    breakMinutes: payload.breakMinutes,
    breakStartDateTime: payload.breakStartDateTime,
    breakEndDateTime: payload.breakEndDateTime,
    isSharedShift: payload.isSharedShift,
    requiredSimultaneousCrew: payload.requiredSimultaneousCrew,
  })
  if (!calc.ok) {
    return { ok: false, error: calc.error }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const job = payload.jobId
      ? draft.fabricationJobs.find((j) => j.id === payload.jobId)
      : undefined
    if (payload.jobId && (!job || job.eventId !== payload.eventId)) {
      return {
        ok: false,
        error: "Production job does not belong to the specified event.",
      }
    }

    const roster = order.eventRoster ?? []
    const inRoster = roster.some(
      (r) => r.crewEmail.toLowerCase() === cleanEmail && !r.removedAt,
    )
    if (!inRoster) {
      return {
        ok: false,
        error: `${cleanEmail} must be added to the Event Crew Group before scheduling shifts.`,
      }
    }

    // Check cross-job and cross-event overlaps for this worker
    if (!payload.allowOverlap) {
      const existingShifts: ShiftScheduleWindow[] = [
        ...draft.orderRequests.flatMap((o) => o.eventSchedules ?? []),
        ...draft.fabricationJobs.flatMap((j) => j.schedules ?? []),
      ].filter(
        (s) =>
          s.status === "scheduled" &&
          s.crewEmail.toLowerCase() === cleanEmail,
      )

      for (const s of existingShifts) {
        const sStart = parseManilaDateTimeMs(s.startDateTime)
        const sEnd = parseManilaDateTimeMs(s.endDateTime)
        if (sStart !== null && sEnd !== null) {
          if (calc.startMs < sEnd && sStart < calc.endMs) {
            return {
              ok: false,
              error: `Schedule overlap: ${cleanEmail} is already scheduled during ${s.startDateTime}–${s.endDateTime}.`,
            }
          }
        }
      }
    }

    const now = new Date().toISOString()
    const rosterMember = roster.find(
      (r) => r.crewEmail.toLowerCase() === cleanEmail,
    )
    const displayName =
      payload.crewName?.trim() || rosterMember?.crewName || cleanEmail

    // Find or create WorkerAssignmentRecord strictly scoped by event/job, duty/phase, role, and work context.
    // Never reuse an incomplete assignment from a different duty or instructions merely because worker email matches.
    const targetAssignments = job
      ? (job.assignments ?? (job.assignments = []))
      : (order.eventAssignments ?? (order.eventAssignments = []))

    const expectedKind: WorkerAssignmentRecord["kind"] = job ? "production" : "event-ops"
    const expectedPhase: WorkerAssignmentRecord["phase"] =
      !job &&
      payload.activityType !== "fabrication" &&
      payload.activityType !== "lead-coordination"
        ? payload.activityType
        : undefined
    const expectedRole: WorkerAssignmentRecord["role"] =
      payload.role ?? (payload.activityType === "lead-coordination" ? "working-lead" : "crew")
    const defaultInstructions = defaultInstructionsForActivity(payload.activityType, job)
    const trimmedInstructions = payload.instructions?.trim() || ""

    let assignment: WorkerAssignmentRecord | undefined
    if (payload.assignmentId) {
      const explicitAsg = targetAssignments.find((a) => a.id === payload.assignmentId)
      if (!explicitAsg) {
        return { ok: false, error: "Selected target assignment was not found." }
      }
      if (explicitAsg.crewEmail.toLowerCase() !== cleanEmail) {
        return { ok: false, error: "Selected assignment belongs to a different worker." }
      }
      if (explicitAsg.status === "Completed") {
        return { ok: false, error: "Cannot attach a new shift to an already Completed assignment." }
      }
      const existingAct: ShiftActivityType | undefined =
        explicitAsg.activityType ??
        explicitAsg.phase ??
        (explicitAsg.kind === "production"
          ? explicitAsg.role === "working-lead"
            ? "lead-coordination"
            : "fabrication"
          : undefined)
      if (
        (existingAct && existingAct !== payload.activityType) ||
        explicitAsg.phase !== expectedPhase
      ) {
        return {
          ok: false,
          error: `Selected assignment is for ${existingAct ?? "another duty"}, not ${payload.activityType}. Create a separate duty assignment instead.`,
        }
      }
      assignment = explicitAsg
    } else if (!payload.createNewAssignment) {
      assignment = targetAssignments.find((a) => {
        if (a.crewEmail.toLowerCase() !== cleanEmail) return false
        if (a.kind !== expectedKind || (a.jobId ?? "") !== (job?.id ?? "")) return false
        if (a.status === "Completed" || a.isCorrectionAssignment) return false
        if (a.role !== expectedRole) return false
        if (a.phase !== expectedPhase) return false
        const existingAct: ShiftActivityType | undefined =
          a.activityType ??
          a.phase ??
          (a.kind === "production"
            ? a.role === "working-lead"
              ? "lead-coordination"
              : "fabrication"
            : undefined)
        if (existingAct !== payload.activityType) return false

        // On event-ops, distinct instructions represent distinct work duties unless identical
        if (!job) {
          const targetInstr = (trimmedInstructions || defaultInstructions).toLowerCase()
          if (a.instructions.trim().toLowerCase() !== targetInstr) return false
        }
        return true
      })
    }

    if (!assignment) {
      assignment = {
        id: `wasg-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}-${targetAssignments.length + 1}`,
        eventId: payload.eventId,
        kind: expectedKind,
        jobId: job?.id,
        phase: expectedPhase,
        activityType: payload.activityType,
        crewEmail: cleanEmail,
        crewName: displayName,
        role: expectedRole,
        instructions: trimmedInstructions || defaultInstructions,
        status: "Assigned",
        progressPercent: 0,
        updatedAt: now,
      }
      targetAssignments.push(assignment)
    }

    const targetSchedules = job
      ? (job.schedules ?? (job.schedules = []))
      : (order.eventSchedules ?? (order.eventSchedules = []))

    const shift: ShiftScheduleWindow = {
      id: `shf-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}-${targetSchedules.length + 1}`,
      eventId: payload.eventId,
      jobId: job?.id,
      assignmentId: assignment.id,
      crewEmail: cleanEmail,
      crewName: displayName,
      startDateTime: payload.startDateTime,
      endDateTime: payload.endDateTime,
      breakMinutes: calc.breakMinutes,
      ...(payload.breakStartDateTime?.trim()
        ? { breakStartDateTime: payload.breakStartDateTime.trim() }
        : {}),
      ...(payload.breakEndDateTime?.trim()
        ? { breakEndDateTime: payload.breakEndDateTime.trim() }
        : {}),
      plannedProductiveHours: calc.plannedProductiveHours,
      dailyProductiveHoursByManilaDate: calc.dailyProductiveHoursByManilaDate,
      activityType: payload.activityType,
      isSharedShift: payload.isSharedShift,
      sharedShiftGroupId: payload.sharedShiftGroupId,
      requiredSimultaneousCrew: payload.requiredSimultaneousCrew,
      status: "scheduled",
    }
    targetSchedules.push(shift)

    if (job) {
      const participants = new Set(
        (job.participantEmails ?? []).map((e) => e.toLowerCase()),
      )
      participants.add(cleanEmail)
      job.participantEmails = [...participants]
      // Preserve any existing legacy assignedCrewEmails until migration review confirms/replaces them
      job.assignedCrewEmails = [
        ...new Set([
          ...(job.assignedCrewEmails ?? []).map((e) => e.toLowerCase()),
          ...participants,
        ]),
      ]
      if (job.status === "Unassigned") {
        job.status = "Assigned"
      }
      // Only resolve MISSING_CONFIRMED_SCHEDULE for THIS job (or this worker's assignment on this job).
      // DEMO_ACCOUNT_ASSIGNED and UNCONFIRMED_PARTICIPANTS require explicit review/confirmation.
      for (const f of job.migrationReviewFlags ?? []) {
        if (
          f.code === "MISSING_CONFIRMED_SCHEDULE" &&
          !f.resolvedAt &&
          ((f.targetType === "job" && f.targetId === job.id) ||
            (f.targetType === "assignment" && f.targetId === assignment.id))
        ) {
          f.resolvedAt = now
          f.resolvedByEmail = actor.email
          f.resolvedByName = actor.name
          f.resolutionNotes = `Confirmed structured Asia/Manila schedule (${shift.startDateTime}–${shift.endDateTime}) on job ${job.spec.name}.`
        }
      }
      job.needsWarehouseReview = hasUnresolvedMigrationFlag(job.migrationReviewFlags)
      job.updatedAt = now
    }

    // Resolve ONLY the specific affected worker's UNPARSEABLE_SCHEDULE_TEXT (or worker-targeted MISSING_CONFIRMED_SCHEDULE)
    // on the event while preserving legacyScheduleText. Never clear unrelated workers' flags across the event.
    const matchingLegacyAsgIds = new Set(
      order.crewAssignments
        .filter((a) => a.crewEmail.toLowerCase() === cleanEmail)
        .map((a) => a.id),
    )
    for (const f of order.migrationReviewFlags ?? []) {
      if (f.resolvedAt) continue
      const targetsThisWorker =
        matchingLegacyAsgIds.has(f.targetId) ||
        f.targetId === assignment.id ||
        f.targetId.toLowerCase() === cleanEmail
      if (
        (f.code === "UNPARSEABLE_SCHEDULE_TEXT" && targetsThisWorker) ||
        (f.code === "MISSING_CONFIRMED_SCHEDULE" && targetsThisWorker)
      ) {
        f.resolvedAt = now
        f.resolvedByEmail = actor.email
        f.resolvedByName = actor.name
        f.resolutionNotes =
          "Entered structured Asia/Manila shift schedule for this worker while preserving original legacy schedule text."
      }
    }
    for (const asg of order.crewAssignments) {
      if (matchingLegacyAsgIds.has(asg.id)) {
        const stillFlagged = (order.migrationReviewFlags ?? []).some(
          (f) => !f.resolvedAt && f.targetId === asg.id,
        )
        asg.needsWarehouseReview = stillFlagged
      }
    }

    return { ok: true, shift, assignment }
  })
}

/**
 * Cancels a scheduled shift while preserving it in history and retaining any
 * previously recorded attendance or actual hours.
 */
export function cancelScheduledShift(
  actor: OpsActor,
  payload: {
    eventId: string
    jobId?: string
    shiftId: string
    reason: string
  },
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can cancel a scheduled shift.",
    }
  }
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const schedules = payload.jobId
      ? draft.fabricationJobs.find((j) => j.id === payload.jobId)?.schedules
      : order.eventSchedules
    const shift = schedules?.find((s) => s.id === payload.shiftId)
    if (!shift) return { ok: false, error: "Scheduled shift not found." }

    shift.status = "cancelled"
    shift.cancelledAt = new Date().toISOString()
    shift.cancelledByEmail = actor.email
    shift.cancellationReason =
      payload.reason.trim() || "Cancelled by Warehouse Operations Manager."

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

    const assignment = order.crewAssignments.find(
      (a) => a.id === payload.assignmentId,
    )
    if (!assignment) return { ok: false, error: "Crew assignment not found." }

    if (order.warehouseClosed && actor.role !== "Warehouse Operations Manager") {
      return {
        ok: false,
        error: "Cannot change task status after Warehouse event accountability is closed.",
      }
    }
    if (
      assignment.taskStatus === "Completed" &&
      actor.role !== "Warehouse Operations Manager"
    ) {
      return {
        ok: false,
        error: "Completed task assignments cannot be reopened by Ground Crew.",
      }
    }

    if (payload.status === "Blocked" && !payload.blockerReason?.trim()) {
      return {
        ok: false,
        error: "Provide the blocker reason so Warehouse can resolve it.",
      }
    }

    const now = new Date().toISOString()
    assignment.taskStatus = payload.status
    assignment.updatedAt = now
    if (
      (payload.status === "InProgress" || payload.status === "In Progress") &&
      !assignment.startedAt
    ) {
      assignment.startedAt = now
    }
    if (payload.status === "Blocked") {
      assignment.blockerReason = payload.blockerReason?.trim()
    } else if (
      payload.status === "InProgress" ||
      payload.status === "In Progress" ||
      payload.status === "Completed"
    ) {
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
