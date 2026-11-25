import { oldSystemApis, v51ContractApis } from "./apiClients"
import {
  parseManilaDateTimeMs,
  validateAndComputeShiftSchedule,
} from "./staffing-calculator"
import type {
  AfterShiftPhoto,
  AssignmentMode,
  CorrectionRequestRecord,
  CustomFabricationSpec,
  CustomFabricationStatus,
  DailyGroupProgressReport,
  EstimateBasis,
  FabricationJob,
  MigrationReviewFlagCode,
  ShiftActivityType,
  ShiftScheduleWindow,
  VerificationSubmission,
  WorkerAssignmentRecord,
  WorkerContributionLog,
} from "./types"
import { getState as getAuthState } from "../auth/store"
import {
  hasUnresolvedMigrationFlag,
  mutateOperationsStore,
  type OpsActor,
} from "./store-core"

/**
 * Custom Fabrication (Phase 1):
 * Creates a production job for an event's custom item.
 * Starts in `Unassigned` status without automatic demo-account assignment,
 * inheriting the event's crew roster and Event Team Lead as defaults without reserving worker time.
 */
export function createCustomFabricationJob(
  eventId: string,
  spec: Omit<CustomFabricationSpec, "id">,
  assignedCrewEmails: string[] = [],
): { ok: true; job: FabricationJob } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (!spec.name.trim()) {
      return { ok: false, error: "Custom item name is required." }
    }

    const fullSpec: CustomFabricationSpec = {
      ...spec,
      id: `cust-${Date.now().toString().slice(-5)}-${order.customSpecs.length + 1}`,
    }
    order.customSpecs.push(fullSpec)

    const cleanEmails = assignedCrewEmails
      .map((e) => e.trim().toLowerCase())
      .filter((e) => Boolean(e) && e !== "crew@demo.com")

    const now = new Date().toISOString()
    const job: FabricationJob = {
      id: `fab-${Date.now().toString().slice(-5)}-${draft.fabricationJobs.length + 1}`,
      eventId,
      eventTitle: order.eventTitle,
      customItemId: fullSpec.id,
      spec: fullSpec,
      status: "Unassigned",
      assignedCrewEmails: cleanEmails,
      progressPercent: 0,
      completedQty: 0,
      materialsVerified: true,
      linkedShiftPhotoIds: [],
      releasedForLoading: false,
      updatedAt: now,
      assignmentMode: "group",
      inheritedLeadEmail: order.teamLeadEmail,
      inheritedLeadName: order.teamLeadName,
      productionLeadEmail: order.teamLeadEmail,
      productionLeadName: order.teamLeadName,
      estimatedHoursPerUnitOrSet: spec.estimatedHoursPerUnitOrSet,
      estimateBasis: spec.estimateBasis ?? "per-unit",
      participantEmails: [],
      assignments: [],
      schedules: [],
      contributions: [],
      groupProgressReports: [],
      submissions: [],
      correctionRequests: [],
      migrationReviewFlags: [],
      migrationResolutionHistory: [],
    }
    draft.fabricationJobs.unshift(job)
    return { ok: true, job }
  })
}

/**
 * Warehouse Operations Manager:
 * Confirms the production window (start date, deadline, available production days),
 * labor estimate (`estimatedHoursPerUnitOrSet`, `estimateBasis`), assignment mode,
 * and optional job-specific Production Lead override.
 */
export function confirmProductionJobWindowAndEstimate(
  actor: OpsActor,
  payload: {
    jobId: string
    startDate: string
    deadlineDate: string
    availableProductionDays: number
    estimatedHoursPerUnitOrSet: number
    estimateBasis: EstimateBasis
    assignmentMode?: AssignmentMode
    participantEmails?: string[]
    productionLeadEmail?: string
    productionLeadName?: string
  },
): { ok: true; job: FabricationJob } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error:
        "Only the Warehouse Operations Manager can confirm production windows and labor estimates.",
    }
  }
  if (!payload.startDate || !payload.deadlineDate) {
    return {
      ok: false,
      error: "Select both the production start date and deadline date.",
    }
  }
  if (payload.startDate > payload.deadlineDate) {
    return {
      ok: false,
      error: "Production start date must be on or before the deadline date.",
    }
  }
  if (
    !Number.isFinite(payload.availableProductionDays) ||
    payload.availableProductionDays <= 0
  ) {
    return {
      ok: false,
      error: "Available production days must be greater than zero.",
    }
  }
  if (
    !Number.isFinite(payload.estimatedHoursPerUnitOrSet) ||
    payload.estimatedHoursPerUnitOrSet <= 0
  ) {
    return {
      ok: false,
      error: "Estimated labor hours per unit or complete set must be greater than zero.",
    }
  }

  return mutateOperationsStore((draft) => {
    const job = draft.fabricationJobs.find((j) => j.id === payload.jobId)
    if (!job) return { ok: false, error: "Production job not found." }
    const order = draft.orderRequests.find((o) => o.eventId === job.eventId)
    const activeRoster = (order?.eventRoster ?? []).filter((r) => !r.removedAt)
    const activeRosterEmails = new Set(
      activeRoster.map((r) => r.crewEmail.trim().toLowerCase()),
    )
    const authAccounts = getAuthState().accounts

    // Validate all inputs up front BEFORE mutating any fields on `job`
    let cleanParticipants: string[] | undefined
    if (payload.participantEmails !== undefined) {
      cleanParticipants = [
        ...new Set(
          payload.participantEmails
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean),
        ),
      ]
      const notOnRoster = cleanParticipants.filter((e) => !activeRosterEmails.has(e))
      if (notOnRoster.length > 0) {
        return {
          ok: false,
          error: `Confirmed production participants must belong to the Event Crew Group roster (add first in Crew & Scheduling: ${notOnRoster.join(", ")}).`,
        }
      }
      const ineligible = cleanParticipants.filter((email) => {
        const matchedAuth = authAccounts.find(
          (u) => u.email.trim().toLowerCase() === email,
        )
        return (
          matchedAuth &&
          (matchedAuth.role !== "Ground Crew" ||
            Boolean(matchedAuth.deletedAt) ||
            matchedAuth.status !== "Active")
        )
      })
      if (ineligible.length > 0) {
        return {
          ok: false,
          error: `Confirmed participants must be eligible active Ground Crew accounts (${ineligible.join(", ")}).`,
        }
      }
    }

    let cleanLead: string | undefined
    if (payload.productionLeadEmail !== undefined) {
      cleanLead = payload.productionLeadEmail.trim().toLowerCase()
      if (cleanLead) {
        if (activeRoster.length > 0 && !activeRosterEmails.has(cleanLead)) {
          return {
            ok: false,
            error: `Selected Production Lead (${cleanLead}) must be an active member of the Event Crew Group roster.`,
          }
        }
        const matchedAuth = authAccounts.find(
          (u) => u.email.trim().toLowerCase() === cleanLead,
        )
        if (
          matchedAuth &&
          (matchedAuth.role !== "Ground Crew" ||
            Boolean(matchedAuth.deletedAt) ||
            matchedAuth.status !== "Active")
        ) {
          return {
            ok: false,
            error: `Selected Production Lead (${cleanLead}) must be an eligible active Ground Crew account.`,
          }
        }
      }
    }

    // All validations succeeded — apply mutations atomically
    const now = new Date().toISOString()
    if (cleanParticipants !== undefined) {
      job.participantEmails = cleanParticipants
      job.assignedCrewEmails = cleanParticipants
      const hasDemoFlagUnresolved = (job.migrationReviewFlags ?? []).some(
        (f) => f.code === "DEMO_ACCOUNT_ASSIGNED" && !f.resolvedAt,
      )
      if (
        cleanParticipants.length > 0 &&
        (!cleanParticipants.includes("crew@demo.com") || !hasDemoFlagUnresolved)
      ) {
        for (const f of job.migrationReviewFlags ?? []) {
          if (f.code === "UNCONFIRMED_PARTICIPANTS" && !f.resolvedAt) {
            f.resolvedAt = now
            f.resolvedByEmail = actor.email
            f.resolvedByName = actor.name
            f.resolutionNotes = "Confirmed production participants from active Event Crew Roster."
          }
        }
      }
    }

    job.productionWindow = {
      startDate: payload.startDate,
      deadlineDate: payload.deadlineDate,
      availableProductionDays: payload.availableProductionDays,
      confirmed: true,
      confirmedByEmail: actor.email,
      confirmedByName: actor.name,
      confirmedAt: now,
    }
    job.estimatedHoursPerUnitOrSet = payload.estimatedHoursPerUnitOrSet
    job.estimateBasis = payload.estimateBasis
    job.spec.estimatedHoursPerUnitOrSet = payload.estimatedHoursPerUnitOrSet
    job.spec.estimateBasis = payload.estimateBasis

    if (payload.assignmentMode) {
      job.assignmentMode = payload.assignmentMode
    }
    if (cleanLead !== undefined) {
      const matchedMember = activeRoster.find(
        (r) => r.crewEmail.toLowerCase() === cleanLead,
      )
      job.productionLeadEmail = cleanLead || undefined
      job.productionLeadName = cleanLead
        ? payload.productionLeadName?.trim() || matchedMember?.crewName || cleanLead
        : undefined
    }
    job.needsWarehouseReview = hasUnresolvedMigrationFlag(job.migrationReviewFlags)
    job.updatedAt = now
    return { ok: true, job }
  })
}

/**
 * Assigned Ground Crew / Production Lead:
 * Starts their scheduled production assignment (`Assigned -> In Progress`),
 * transitioning the production job from `Assigned` to `In Production`.
 */
export function startProductionWorkerAssignment(
  actor: OpsActor,
  payload: {
    jobId: string
    assignmentId: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const job = draft.fabricationJobs.find((j) => j.id === payload.jobId)
    if (!job) return { ok: false, error: "Production job not found." }

    const assignment = (job.assignments ?? []).find(
      (a) => a.id === payload.assignmentId,
    )
    if (!assignment) {
      return { ok: false, error: "Worker assignment not found on this job." }
    }

    if (assignment.crewEmail.toLowerCase() !== actor.email.trim().toLowerCase()) {
      return {
        ok: false,
        error: "Only the assigned worker can start their own assignment.",
      }
    }
    const order = draft.orderRequests.find((o) => o.eventId === job.eventId)
    if (order?.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot start production assignments after Warehouse event accountability is closed.",
      }
    }
    if (assignment.status === "Completed") {
      return {
        ok: false,
        error: "Completed assignments cannot be reopened by a worker.",
      }
    }
    if (assignment.status === "Submitted") {
      return {
        ok: false,
        error: "This contribution has already been submitted for Warehouse completion confirmation.",
      }
    }

    const now = new Date().toISOString()
    assignment.status = "In Progress"
    if (!assignment.startedAt) assignment.startedAt = now
    assignment.updatedAt = now

    if (job.status === "Unassigned" || job.status === "Assigned") {
      job.status = "In Production"
    }
    job.updatedAt = now
    return { ok: true }
  })
}

/**
 * Ground Crew:
 * Records own attendance, actual productive hours, progress, contribution summary, blockers,
 * and optional in-progress photos for either a production job assignment OR an event-operation duty.
 * NEVER automatically marks a production asset finished or transitions a job to Awaiting Verification.
 */
export function recordWorkerContributionAndHours(
  actor: OpsActor,
  payload: {
    contributionId?: string
    eventId: string
    jobId?: string
    assignmentId: string
    shiftId?: string
    manilaDate: string
    attendance: "Present" | "Partial" | "Absent"
    actualProductiveHours: number
    contributionSummary: string
    progressPercent?: number
    blockerReason?: string
    photoUrls?: string[]
    markContributionSubmitted?: boolean
  },
): { ok: true; log: WorkerContributionLog } | { ok: false; error: string } {
  if (
    !Number.isFinite(payload.actualProductiveHours) ||
    payload.actualProductiveHours < 0
  ) {
    return {
      ok: false,
      error: "Actual productive hours must be 0 or greater.",
    }
  }
  if (!payload.manilaDate.trim()) {
    return { ok: false, error: "Specify the Asia/Manila date for this log." }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const job = payload.jobId
      ? draft.fabricationJobs.find((j) => j.id === payload.jobId)
      : undefined
    if (payload.jobId) {
      if (!job) return { ok: false, error: "Production job not found." }
      if (job.eventId !== payload.eventId) {
        return {
          ok: false,
          error: "Production job does not belong to the specified event.",
        }
      }
    }

    const assignmentList = job
      ? (job.assignments ?? [])
      : (order.eventAssignments ?? [])
    const assignment = assignmentList.find((a) => a.id === payload.assignmentId)
    if (!assignment) {
      return {
        ok: false,
        error: job
          ? "Worker assignment not found on this job."
          : "Worker event-operation assignment not found.",
      }
    }

    const actorEmail = actor.email.trim().toLowerCase()
    if (assignment.crewEmail.toLowerCase() !== actorEmail) {
      return {
        ok: false,
        error: "Workers can only record attendance and hours for their own assignment.",
      }
    }
    if (order.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot modify worker contributions after Warehouse event accountability is closed.",
      }
    }
    if (assignment.status === "Completed") {
      return {
        ok: false,
        error: "Cannot modify or reopen an assignment already confirmed Completed by Warehouse.",
      }
    }
    if (assignment.status === "Submitted") {
      return {
        ok: false,
        error: "This contribution has already been submitted and is awaiting Warehouse confirmation.",
      }
    }

    const now = new Date().toISOString()
    const targetContributions = job
      ? (job.contributions ?? (job.contributions = []))
      : (order.eventContributions ?? (order.eventContributions = []))

    const requestedContributionId = payload.contributionId?.trim()
    if (requestedContributionId) {
      const belongsElsewhere = [
        ...draft.fabricationJobs.flatMap((j) => j.contributions ?? []),
        ...draft.orderRequests.flatMap((o) => o.eventContributions ?? []),
      ].some(
        (c) =>
          c.id === requestedContributionId &&
          (c.assignmentId !== assignment.id ||
            c.eventId !== payload.eventId ||
            (c.jobId ?? undefined) !== (job?.id ?? undefined) ||
            c.crewEmail.toLowerCase() !== actorEmail),
      )
      if (belongsElsewhere) {
        return {
          ok: false,
          error:
            "Contribution ID belongs to a different worker, event, job, or assignment context.",
        }
      }
    }

    const existingLog = requestedContributionId
      ? targetContributions.find(
          (c) =>
            c.id === requestedContributionId &&
            c.assignmentId === assignment.id &&
            c.crewEmail.toLowerCase() === actorEmail,
        )
      : undefined

    if (existingLog?.status === "Submitted") {
      return {
        ok: false,
        error: "This contribution entry has already been submitted and cannot be modified.",
      }
    }

    const normalizedProgress =
      typeof payload.progressPercent === "number" &&
      Number.isFinite(payload.progressPercent)
        ? Math.max(0, Math.min(100, Math.round(payload.progressPercent)))
        : undefined

    const nextStatus = payload.markContributionSubmitted ? "Submitted" : "Saved"
    let log: WorkerContributionLog
    if (existingLog) {
      existingLog.shiftId = payload.shiftId ?? existingLog.shiftId
      existingLog.manilaDate = payload.manilaDate.trim()
      existingLog.attendance = payload.attendance
      existingLog.actualProductiveHours = payload.actualProductiveHours
      if (normalizedProgress !== undefined) {
        existingLog.progressPercent = normalizedProgress
      }
      existingLog.contributionSummary = payload.contributionSummary.trim()
      existingLog.blockerReason = payload.blockerReason?.trim() || undefined
      existingLog.photoUrls = (payload.photoUrls ?? []).filter((u) => u.trim().length > 0)
      existingLog.submittedByEmail = actorEmail
      existingLog.submittedByName = actor.name
      existingLog.submittedAt = now
      existingLog.updatedAt = now
      existingLog.status = nextStatus
      log = existingLog
    } else {
      log = {
        id:
          requestedContributionId ||
          `wcl-${Date.now().toString().slice(-6)}-${targetContributions.length + 1}`,
        assignmentId: assignment.id,
        eventId: payload.eventId,
        ...(job ? { jobId: job.id } : {}),
        shiftId: payload.shiftId,
        crewEmail: actorEmail,
        crewName: actor.name,
        manilaDate: payload.manilaDate.trim(),
        attendance: payload.attendance,
        actualProductiveHours: payload.actualProductiveHours,
        ...(normalizedProgress !== undefined
          ? { progressPercent: normalizedProgress }
          : {}),
        contributionSummary: payload.contributionSummary.trim(),
        blockerReason: payload.blockerReason?.trim() || undefined,
        photoUrls: (payload.photoUrls ?? []).filter((u) => u.trim().length > 0),
        submittedByEmail: actorEmail,
        submittedByName: actor.name,
        submittedAt: now,
        updatedAt: now,
        status: nextStatus,
      }
      targetContributions.push(log)
    }
    assignment.blockerReason = payload.blockerReason?.trim() || undefined
    if (
      typeof payload.progressPercent === "number" &&
      Number.isFinite(payload.progressPercent)
    ) {
      assignment.progressPercent = Math.max(
        0,
        Math.min(100, Math.round(payload.progressPercent)),
      )
    }

    if (payload.markContributionSubmitted) {
      assignment.status = "Submitted"
      assignment.submittedAt = now
      assignment.progressPercent = assignment.progressPercent ?? 100
    } else if (assignment.status === "Assigned") {
      assignment.status = "In Progress"
      if (!assignment.startedAt) assignment.startedAt = now
    }
    assignment.updatedAt = now

    if (job) {
      if (job.status === "Assigned") {
        job.status = "In Production"
      }
      job.updatedAt = now
    }

    return { ok: true, log }
  })
}

/**
 * Production Lead (Group work):
 * Submits one daily group progress report and photos.
 * Keeps the job in `In Production` — does NOT mark the asset finished.
 */
export function submitDailyGroupProgressReport(
  actor: OpsActor,
  payload: {
    eventId: string
    jobId: string
    manilaDate: string
    summary: string
    photoUrls: string[]
  },
): { ok: true; report: DailyGroupProgressReport } | { ok: false; error: string } {
  if (!payload.summary.trim()) {
    return { ok: false, error: "Enter a daily group progress summary." }
  }
  return mutateOperationsStore((draft) => {
    const job = draft.fabricationJobs.find((j) => j.id === payload.jobId)
    if (!job || job.eventId !== payload.eventId) {
      return { ok: false, error: "Production job not found for this event." }
    }

    const actorEmail = actor.email.trim().toLowerCase()
    const leadEmail = (
      job.productionLeadEmail ??
      job.inheritedLeadEmail ??
      ""
    ).toLowerCase()
    if (actorEmail !== leadEmail) {
      return {
        ok: false,
        error:
          "Only the designated Production Lead can submit the daily group progress report.",
      }
    }

    const now = new Date().toISOString()
    const report: DailyGroupProgressReport = {
      id: `gpr-${Date.now().toString().slice(-6)}-${(job.groupProgressReports?.length ?? 0) + 1}`,
      jobId: job.id,
      eventId: job.eventId,
      manilaDate: payload.manilaDate.trim(),
      summary: payload.summary.trim(),
      photoUrls: payload.photoUrls.filter((u) => u.trim().length > 0),
      submittedByLeadEmail: actorEmail,
      submittedByLeadName: actor.name,
      submittedAt: now,
    }

    job.groupProgressReports = [...(job.groupProgressReports ?? []), report]
    if (job.status === "Assigned") {
      job.status = "In Production"
    }
    job.updatedAt = now

    return { ok: true, report }
  })
}

/**
 * Warehouse Operations Manager:
 * Confirms a worker's assignment completion (`Submitted -> Completed`) independently of full asset approval
 * and independently of sibling duties for the same worker.
 */
export function confirmWorkerAssignmentCompletion(
  actor: OpsActor,
  payload: {
    eventId?: string
    jobId?: string
    assignmentId: string
    notes?: string
  },
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error:
        "Only the Warehouse Operations Manager can confirm worker assignment completion.",
    }
  }
  return mutateOperationsStore((draft) => {
    const job = payload.jobId
      ? draft.fabricationJobs.find((j) => j.id === payload.jobId)
      : undefined
    if (payload.jobId && !job) {
      return { ok: false, error: "Production job not found." }
    }

    const order = job
      ? draft.orderRequests.find((o) => o.eventId === job.eventId)
      : payload.eventId
        ? draft.orderRequests.find((o) => o.eventId === payload.eventId)
        : draft.orderRequests.find((o) =>
            (o.eventAssignments ?? []).some((a) => a.id === payload.assignmentId),
          )

    if (!job && !order) {
      return { ok: false, error: "Event or production job not found for this assignment." }
    }

    const assignment = job
      ? (job.assignments ?? []).find((a) => a.id === payload.assignmentId)
      : (order?.eventAssignments ?? []).find((a) => a.id === payload.assignmentId)

    if (!assignment) {
      return { ok: false, error: "Worker assignment not found." }
    }
    if (assignment.status !== "Submitted") {
      return {
        ok: false,
        error: "Worker must submit their contribution and hours before Warehouse confirms completion.",
      }
    }

    const now = new Date().toISOString()
    assignment.status = "Completed"
    assignment.progressPercent = 100
    assignment.completedAt = now
    assignment.completedByEmail = actor.email
    assignment.completedByName = actor.name
    assignment.completionNotes = payload.notes?.trim()
    assignment.updatedAt = now
    if (job) {
      job.updatedAt = now
    }

    return { ok: true }
  })
}

/**
 * Ground Crew After-Shift Work Photo:
 * Stored separately from Venue/Warehouse Arrival photos and Damage Evidence photos.
 * Uploading a daily shift photo NEVER automatically marks the production job finished
 * or submits it for verification.
 */
export function submitAfterShiftWorkPhoto(
  actor: OpsActor,
  payload: {
    eventId: string
    shiftLabel: string
    photoUrl: string
    caption: string
    isFabricationWork: boolean
    fabricationJobId?: string
  },
): { ok: true; photo: AfterShiftPhoto } | { ok: false; error: string } {
  if (!payload.photoUrl.trim()) {
    return {
      ok: false,
      error: "A work photo is required for after-shift submission.",
    }
  }
  if (!payload.shiftLabel.trim()) {
    return { ok: false, error: "Enter the shift label." }
  }
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event not found." }

    if (payload.isFabricationWork && payload.fabricationJobId) {
      const targetJob = draft.fabricationJobs.find(
        (j) => j.id === payload.fabricationJobId,
      )
      if (!targetJob || targetJob.eventId !== payload.eventId) {
        return {
          ok: false,
          error: "Selected fabrication job does not belong to this event.",
        }
      }
    }

    const now = new Date().toISOString()
    const photo: AfterShiftPhoto = {
      id: `asp-${Date.now().toString().slice(-6)}-${draft.afterShiftPhotos.length + 1}`,
      eventId: payload.eventId,
      eventTitle: order.eventTitle,
      shiftLabel: payload.shiftLabel.trim(),
      photoUrl: payload.photoUrl.trim(),
      caption: payload.caption.trim() || "Completed shift work documentation.",
      isFabricationWork: payload.isFabricationWork,
      fabricationJobId: payload.isFabricationWork
        ? payload.fabricationJobId
        : undefined,
      submittedByEmail: actor.email.toLowerCase(),
      submittedByName: actor.name,
      submittedAt: now,
      isLegacyImportedEvidence: false,
    }

    draft.afterShiftPhotos.unshift(photo)

    if (payload.isFabricationWork && payload.fabricationJobId) {
      const job = draft.fabricationJobs.find(
        (j) => j.id === payload.fabricationJobId,
      )
      if (job) {
        if (!job.linkedShiftPhotoIds.includes(photo.id)) {
          job.linkedShiftPhotoIds.push(photo.id)
        }
        // Daily shift photos NEVER mark the asset finished or transition to Awaiting Verification.
        job.updatedAt = now
      }
    }

    void v51ContractApis.submitAfterShiftPhoto(photo)
    return { ok: true, photo }
  })
}

/**
 * Explicit Submit for Verification (Full Finished Asset Job):
 * - Group work: Production Lead submits.
 * - Multi-worker Individual work: designated or inherited Production Lead submits.
 * - Single-worker Individual work: that single worker (or lead) submits.
 * - Warehouse is strictly the verifier and can NEVER submit finished work.
 * - Requires finished-work photos, brief summary, and full required quantity (`completedQty === spec.requestedQty`).
 * - Transitions the job to `Awaiting Verification` (never `Ready to Load`).
 */
export function submitProductionJobForVerification(
  actor: OpsActor,
  payload: {
    jobId: string
    completedQty: number
    photoUrls: string[]
    summary: string
  },
): { ok: true; submission: VerificationSubmission } | { ok: false; error: string } {
  if (actor.role === "Warehouse Operations Manager") {
    return {
      ok: false,
      error:
        "Warehouse Operations Manager is the verifier and cannot submit finished production work.",
    }
  }
  const cleanPhotos = (payload.photoUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
  if (cleanPhotos.length === 0) {
    return {
      ok: false,
      error: "Attach at least one finished-work photo to submit for verification.",
    }
  }
  if (!payload.summary.trim()) {
    return {
      ok: false,
      error: "Provide a brief summary (or explanation of what was fixed) when submitting for verification.",
    }
  }

  return mutateOperationsStore((draft) => {
    const job = draft.fabricationJobs.find((j) => j.id === payload.jobId)
    if (!job) return { ok: false, error: "Production job not found." }
    const order = draft.orderRequests.find((o) => o.eventId === job.eventId)
    if (order?.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot submit finished work after Warehouse event accountability is closed.",
      }
    }

    if (job.status === "Awaiting Verification") {
      return {
        ok: false,
        error: "This production job is already Awaiting Verification.",
      }
    }
    if (job.status === "Ready to Load") {
      return {
        ok: false,
        error: "This production job has already been approved Ready to Load.",
      }
    }

    // Check blocking migration review flags
    const blockingFlag = (job.migrationReviewFlags ?? []).find(
      (f) => !f.resolvedAt && f.blockingActions.includes("submit"),
    )
    if (blockingFlag) {
      return {
        ok: false,
        error: `Cannot submit for verification until Warehouse resolves migration review: ${blockingFlag.message}`,
      }
    }

    if (payload.completedQty !== job.spec.requestedQty) {
      return {
        ok: false,
        error: `Full required quantity (${job.spec.requestedQty}) must be finished before submitting for verification.`,
      }
    }

    const actorEmail = actor.email.trim().toLowerCase()
    const mode = job.assignmentMode ?? "group"
    const leadEmail = (
      job.productionLeadEmail ??
      job.inheritedLeadEmail ??
      ""
    ).toLowerCase()
    const participants = (
      job.participantEmails?.length
        ? job.participantEmails
        : job.assignedCrewEmails
    ).map((e) => e.toLowerCase())

    if (mode === "group") {
      if (!leadEmail || actorEmail !== leadEmail) {
        return {
          ok: false,
          error:
            "For group work, only the designated Production Lead can submit the finished job for verification.",
        }
      }
    } else {
      // Individual mode
      if (participants.length > 1) {
        if (!leadEmail || actorEmail !== leadEmail) {
          return {
            ok: false,
            error:
              "For individual work with multiple contributors, only the designated or inherited Production Lead can submit the complete job for verification.",
          }
        }
      } else if (participants.length === 1) {
        const isSoleWorker = participants[0] === actorEmail
        if (!isSoleWorker) {
          return {
            ok: false,
            error:
              "For single-worker individual work, only the single assigned worker can submit their complete job for verification (an inherited or coordinating lead does not gain submission permission solely from coordinating the job).",
          }
        }
      } else {
        return {
          ok: false,
          error:
            "Assign the individual worker to this production job before submitting for verification.",
        }
      }
    }

    const now = new Date().toISOString()
    const submissions = job.submissions ?? []
    const round = submissions.length + 1
    const openCorrections = (job.correctionRequests ?? []).filter(
      (c) => !c.resolvedAt,
    )

    const submission: VerificationSubmission = {
      id: `vsub-${Date.now().toString().slice(-6)}-${round}`,
      jobId: job.id,
      eventId: job.eventId,
      round,
      submittedByEmail: actorEmail,
      submittedByName: actor.name,
      submittedAt: now,
      completedQty: payload.completedQty,
      photoUrls: cleanPhotos,
      summary: payload.summary.trim(),
      isCorrectionResubmission: openCorrections.length > 0,
    }

    job.submissions = [...submissions, submission]
    for (const corr of openCorrections) {
      corr.resolvedBySubmissionId = submission.id
      corr.resolvedAt = now
    }

    // Update submitter's own assignment to Submitted if currently Assigned/In Progress
    for (const asg of job.assignments ?? []) {
      if (
        asg.crewEmail.toLowerCase() === actorEmail &&
        asg.status !== "Completed"
      ) {
        asg.status = "Submitted"
        asg.submittedAt = now
        asg.updatedAt = now
      }
    }

    job.status = "Awaiting Verification"
    job.completedQty = payload.completedQty
    job.progressPercent = 100
    job.updatedAt = now

    return { ok: true, submission }
  })
}

/**
 * Warehouse Operations Manager — Request Corrections:
 * - Keeps corrections within the same production job, returning it to `In Production`.
 * - Requires explanation and allows optional reference photos.
 * - Confirms responsible workers and optional additional shift schedules (checking availability and overlaps).
 * - Creates or updates correction assignments ONLY for responsible workers, keeping them `Assigned`
 *   until those workers actually start.
 * - Preserves unaffected workers' completed contributions and all earlier history.
 */
export function requestProductionJobCorrections(
  actor: OpsActor,
  payload: {
    jobId: string
    explanation: string
    referencePhotoUrls?: string[]
    responsibleCrewEmails: string[]
    additionalShifts?: {
      crewEmail: string
      crewName?: string
      startDateTime: string
      endDateTime: string
      breakMinutes?: number
      breakStartDateTime?: string
      breakEndDateTime?: string
      isSharedShift?: boolean
      requiredSimultaneousCrew?: number
      activityType?: ShiftActivityType
    }[]
  },
):
  | { ok: true; correction: CorrectionRequestRecord }
  | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can request corrections.",
    }
  }
  if (!payload.explanation.trim()) {
    return {
      ok: false,
      error: "Specify the required corrections so the responsible crew can rework the item.",
    }
  }
  const responsibleEmails = [
    ...new Set(
      (payload.responsibleCrewEmails ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  if (responsibleEmails.length === 0) {
    return {
      ok: false,
      error: "Confirm which worker(s) or lead will perform the correction.",
    }
  }

  // Validate any additional shifts before mutating
  const computedAdditionalShifts: {
    input: NonNullable<typeof payload.additionalShifts>[number]
    calc: Extract<
      ReturnType<typeof validateAndComputeShiftSchedule>,
      { ok: true }
    >
  }[] = []

  for (const s of payload.additionalShifts ?? []) {
    const calc = validateAndComputeShiftSchedule({
      startDateTime: s.startDateTime,
      endDateTime: s.endDateTime,
      breakMinutes: s.breakMinutes,
      breakStartDateTime: s.breakStartDateTime,
      breakEndDateTime: s.breakEndDateTime,
      isSharedShift: s.isSharedShift,
      requiredSimultaneousCrew: s.requiredSimultaneousCrew,
    })
    if (!calc.ok) {
      return { ok: false, error: calc.error }
    }
    computedAdditionalShifts.push({ input: s, calc })
  }

  return mutateOperationsStore((draft) => {
    const job = draft.fabricationJobs.find((j) => j.id === payload.jobId)
    if (!job) return { ok: false, error: "Production job not found." }
    const order = draft.orderRequests.find((o) => o.eventId === job.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot request production corrections after Warehouse event accountability is closed.",
      }
    }
    if (job.status !== "Awaiting Verification") {
      return {
        ok: false,
        error: `Correction requests can only be sent while a job is Awaiting Verification (current status: ${job.status}).`,
      }
    }
    if ((job.submissions?.length ?? 0) === 0) {
      return {
        ok: false,
        error: "Cannot request corrections before Ground Crew submits finished work for verification.",
      }
    }

    // Validate responsible workers (active roster membership + active eligible Ground Crew account)
    const roster = (order.eventRoster ?? []).filter((r) => !r.removedAt)
    const rosterEmails = new Set(roster.map((r) => r.crewEmail.toLowerCase()))
    const authAccounts = getAuthState().accounts

    for (const email of responsibleEmails) {
      if (!rosterEmails.has(email)) {
        return {
          ok: false,
          error: `Responsible worker ${email} must be an active member of the Event Crew Group roster before requesting corrections.`,
        }
      }
      const matchedAuth = authAccounts.find(
        (u) => u.email.trim().toLowerCase() === email,
      )
      if (
        matchedAuth &&
        (matchedAuth.role !== "Ground Crew" ||
          Boolean(matchedAuth.deletedAt) ||
          matchedAuth.status !== "Active")
      ) {
        return {
          ok: false,
          error: `Responsible worker ${email} is not an eligible active Ground Crew account.`,
        }
      }
    }

    // Validate additional shifts: worker must be selected responsible, on active roster,
    // no overlap against existing scheduled shifts OR against earlier shifts in the same request.
    const allExistingShifts: ShiftScheduleWindow[] = [
      ...draft.orderRequests.flatMap((o) => o.eventSchedules ?? []),
      ...draft.fabricationJobs.flatMap((j) => j.schedules ?? []),
    ].filter((s) => s.status === "scheduled")

    const acceptedBatchShifts: { email: string; startMs: number; endMs: number; startDateTime: string; endDateTime: string }[] = []

    for (const { input, calc } of computedAdditionalShifts) {
      const email = input.crewEmail.trim().toLowerCase()
      if (!email) {
        return {
          ok: false,
          error: "Select a responsible worker for each additional correction shift.",
        }
      }
      if (!responsibleEmails.includes(email)) {
        return {
          ok: false,
          error: `Correction shift worker ${email} must be one of the selected responsible workers for this correction request.`,
        }
      }
      for (const existing of allExistingShifts) {
        if (existing.crewEmail.toLowerCase() !== email) continue
        const exStart = parseManilaDateTimeMs(existing.startDateTime)
        const exEnd = parseManilaDateTimeMs(existing.endDateTime)
        if (exStart !== null && exEnd !== null) {
          if (calc.startMs < exEnd && exStart < calc.endMs) {
            return {
              ok: false,
              error: `Schedule overlap while scheduling correction: ${email} is already scheduled during ${existing.startDateTime}–${existing.endDateTime}.`,
            }
          }
        }
      }
      for (const batchExisting of acceptedBatchShifts) {
        if (batchExisting.email !== email) continue
        if (calc.startMs < batchExisting.endMs && batchExisting.startMs < calc.endMs) {
          return {
            ok: false,
            error: `Schedule overlap between correction shifts in this request for ${email} (${batchExisting.startDateTime}–${batchExisting.endDateTime}).`,
          }
        }
      }
      acceptedBatchShifts.push({
        email,
        startMs: calc.startMs,
        endMs: calc.endMs,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
      })
    }

    const now = new Date().toISOString()
    const corrections = job.correctionRequests ?? []
    const round = corrections.length + 1
    const correctionId = `cor-${Date.now().toString().slice(-6)}-${round}`
    const createdAssignmentIds: string[] = []
    const scheduledAdditionalShiftIds: string[] = []

    const jobAssignments = job.assignments ?? (job.assignments = [])
    const jobSchedules = job.schedules ?? (job.schedules = [])

    // Create correction assignments ONLY for responsible workers, in `Assigned` state.
    // Unaffected workers' Completed/Submitted assignments are untouched.
    for (const email of responsibleEmails) {
      const rosterMember = roster.find(
        (r) => r.crewEmail.toLowerCase() === email,
      )
      const displayName = rosterMember?.crewName || email
      const isLead =
        email ===
        (job.productionLeadEmail ?? job.inheritedLeadEmail ?? "").toLowerCase()

      const corrAsg: WorkerAssignmentRecord = {
        id: `wasg-cor-${Date.now().toString().slice(-5)}-${jobAssignments.length + 1}`,
        eventId: job.eventId,
        kind: "production",
        jobId: job.id,
        crewEmail: email,
        crewName: displayName,
        role: isLead ? "working-lead" : "crew",
        instructions: `Correction Round ${round}: ${payload.explanation.trim()}`,
        status: "Assigned",
        isCorrectionAssignment: true,
        correctionRequestId: correctionId,
        updatedAt: now,
      }
      jobAssignments.push(corrAsg)
      createdAssignmentIds.push(corrAsg.id)
    }

    for (const { input, calc } of computedAdditionalShifts) {
      const email = input.crewEmail.trim().toLowerCase()
      const corrAsg = jobAssignments.find(
        (a) =>
          a.correctionRequestId === correctionId &&
          a.eventId === job.eventId &&
          a.jobId === job.id &&
          a.crewEmail.toLowerCase() === email,
      )
      if (!corrAsg) {
        return {
          ok: false,
          error: `Could not link correction shift: no matching correction assignment for ${email}.`,
        }
      }

      const shift: ShiftScheduleWindow = {
        id: `shf-cor-${Date.now().toString().slice(-5)}-${jobSchedules.length + 1}`,
        eventId: job.eventId,
        jobId: job.id,
        assignmentId: corrAsg.id,
        crewEmail: email,
        crewName: input.crewName?.trim() || corrAsg.crewName,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        breakMinutes: calc.breakMinutes,
        ...(input.breakStartDateTime?.trim()
          ? { breakStartDateTime: input.breakStartDateTime.trim() }
          : {}),
        ...(input.breakEndDateTime?.trim()
          ? { breakEndDateTime: input.breakEndDateTime.trim() }
          : {}),
        plannedProductiveHours: calc.plannedProductiveHours,
        dailyProductiveHoursByManilaDate: calc.dailyProductiveHoursByManilaDate,
        activityType: input.activityType ?? "fabrication",
        isSharedShift: input.isSharedShift,
        requiredSimultaneousCrew: input.requiredSimultaneousCrew,
        status: "scheduled",
      }
      jobSchedules.push(shift)
      scheduledAdditionalShiftIds.push(shift.id)
    }

    const correction: CorrectionRequestRecord = {
      id: correctionId,
      jobId: job.id,
      eventId: job.eventId,
      round,
      requestedByEmail: actor.email,
      requestedByName: actor.name,
      requestedAt: now,
      explanation: payload.explanation.trim(),
      referencePhotoUrls: (payload.referencePhotoUrls ?? []).filter((u) =>
        u.trim().length > 0,
      ),
      responsibleCrewEmails: responsibleEmails,
      createdAssignmentIds,
      scheduledAdditionalShiftIds,
    }

    job.correctionRequests = [...corrections, correction]
    job.status = "In Production"
    job.correctionNotes = payload.explanation.trim()
    job.releasedForLoading = false
    job.updatedAt = now

    void oldSystemApis.production.rejectTask(job.id, payload.explanation.trim())
    return { ok: true, correction }
  })
}

/**
 * Warehouse Operations Manager — Approve Finished Work:
 * - Requires explicit confirmation of all 3 checklist items:
 *   1. Full required quantity is finished (`completedQty === spec.requestedQty`; partial quantities cannot pass).
 *   2. Work matches client-approved specifications.
 *   3. All requested corrections are resolved.
 * - Requires an explicit VerificationSubmission (or an explicitly recorded historical exception).
 * - Records reviewer and timestamp, transitions job to `Ready to Load`, and updates the event manifest
 *   idempotently without duplicate lines or stale quantities.
 * - Does NOT automatically mark unreviewed worker attendance or actual hours `Completed`.
 */
export function approveProductionJobFinishedWork(
  actor: OpsActor,
  jobId: string,
  payload: {
    checklist: {
      fullQuantityFinished: boolean
      matchesClientApprovedSpec: boolean
      correctionsResolved: boolean
    }
    notes?: string
  },
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can approve finished work.",
    }
  }
  if (
    !payload.checklist.fullQuantityFinished ||
    !payload.checklist.matchesClientApprovedSpec ||
    !payload.checklist.correctionsResolved
  ) {
    return {
      ok: false,
      error:
        "Warehouse must explicitly confirm all three verification checks (full quantity finished, matches approved specifications, and all corrections resolved) before approving Ready to Load.",
    }
  }

  return mutateOperationsStore((draft) => {
    const job = draft.fabricationJobs.find((j) => j.id === jobId)
    if (!job) return { ok: false, error: "Production job not found." }

    const linkedPhotos = draft.afterShiftPhotos.filter((p) =>
      job.linkedShiftPhotoIds.includes(p.id),
    )
    const submissions = job.submissions ?? []
    const hasHistoricalException = Boolean(job.approval?.isHistoricalException)

    if (
      linkedPhotos.length === 0 &&
      submissions.length === 0 &&
      !hasHistoricalException
    ) {
      return {
        ok: false,
        error:
          "Ground Crew must first submit an after-shift work photo or finished-work submission before Warehouse can verify this item.",
      }
    }

    if (job.status !== "Awaiting Verification") {
      return {
        ok: false,
        error: "Job must be in Awaiting Verification before Warehouse can approve finished work.",
      }
    }

    const blockingFlag = (job.migrationReviewFlags ?? []).find(
      (f) => !f.resolvedAt && f.blockingActions.includes("approve"),
    )
    if (blockingFlag) {
      return {
        ok: false,
        error: `Cannot approve Ready to Load until Warehouse resolves migration review: ${blockingFlag.message}`,
      }
    }

    const latestSubmission = submissions[submissions.length - 1]

    if (!latestSubmission && !hasHistoricalException) {
      return {
        ok: false,
        error:
          "Cannot mark Ready to Load without an explicit finished-work submission from the responsible lead or worker.",
      }
    }

    const verifiedQty = latestSubmission
      ? latestSubmission.completedQty
      : job.completedQty
    if (verifiedQty !== job.spec.requestedQty) {
      return {
        ok: false,
        error: `All ${job.spec.requestedQty} required item(s) must pass verification together before Ready to Load (currently ${verifiedQty} of ${job.spec.requestedQty}).`,
      }
    }

    const openCorrections = (job.correctionRequests ?? []).filter(
      (c) => !c.resolvedAt,
    )
    if (openCorrections.length > 0) {
      return {
        ok: false,
        error: "Resolve all outstanding correction requests before approving Ready to Load.",
      }
    }

    const now = new Date().toISOString()
    const chosenPhotoUrl =
      latestSubmission?.photoUrls[0] ||
      job.verifiedPhotoUrl ||
      job.spec.referenceImages[0] ||
      "/event-manager-images/planning.jpg"

    const notes =
      payload.notes?.trim() ||
      "Verified full required quantity and physical build against client-approved specifications."

    job.status = "Ready to Load"
    job.completedQty = job.spec.requestedQty
    job.progressPercent = 100
    job.verifiedPhotoUrl = chosenPhotoUrl
    job.verificationNotes = notes
    job.verifiedByEmail = actor.email
    job.verifiedByName = actor.name
    job.verifiedAt = now
    job.releasedForLoading = true
    job.approval = {
      submissionId: latestSubmission?.id,
      isHistoricalException: job.approval?.isHistoricalException,
      historicalExceptionReason: job.approval?.historicalExceptionReason,
      verifiedByEmail: actor.email,
      verifiedByName: actor.name,
      verifiedAt: now,
      checklist: {
        fullQuantityFinished: true,
        matchesClientApprovedSpec: true,
        correctionsResolved: true,
      },
      notes,
    }
    job.updatedAt = now

    // Upsert the custom item on the event's stockLines without duplicating or leaving stale quantities
    const order = draft.orderRequests.find((o) => o.eventId === job.eventId)
    if (order) {
      const existingCustomStockLine = order.stockLines.find(
        (s) => s.assetId === job.customItemId,
      )
      if (existingCustomStockLine) {
        existingCustomStockLine.name = `${job.spec.name} (Custom Fabrication)`
        existingCustomStockLine.approvedRequestedQty = job.spec.requestedQty
        existingCustomStockLine.allocatedQty = job.spec.requestedQty
        existingCustomStockLine.deficitQty = 0
        existingCustomStockLine.releasedForLoadQty = job.spec.requestedQty
        existingCustomStockLine.notes = notes
      } else {
        order.stockLines.push({
          assetId: job.customItemId,
          assetCode: `FAB-${job.id.slice(-4).toUpperCase()}`,
          name: `${job.spec.name} (Custom Fabrication)`,
          category: "Custom Fabrication",
          image: job.spec.referenceImages[0] || chosenPhotoUrl,
          unit: "unit",
          approvedRequestedQty: job.spec.requestedQty,
          allocatedQty: job.spec.requestedQty,
          deficitQty: 0,
          releasedForLoadQty: job.spec.requestedQty,
          loadedQty: 0,
          loadingVerified: false,
          returnedQty: 0,
          notes,
        })
        order.loadingChecklist = undefined
      }
    }

    void oldSystemApis.production.approveTask(jobId, notes)
    void v51ContractApis.verifyCustomFabricationWithPhoto(jobId, {
      passed: true,
      photoUrl: chosenPhotoUrl,
      notes,
      verifiedByEmail: actor.email,
    })

    return { ok: true }
  })
}

/**
 * Backwards-compatible wrapper for existing callers (`CustomFabricationModule.tsx` & legacy tests):
 * Routes `passed: true` / `passed: false` through the Phase 1 verification and correction logic.
 */
export function verifyCustomFabricationJob(
  actor: OpsActor,
  jobId: string,
  decision: {
    passed: boolean
    photoId?: string
    notes: string
    checklist?: {
      fullQuantityFinished: boolean
      matchesClientApprovedSpec: boolean
      correctionsResolved: boolean
    }
    responsibleCrewEmails?: string[]
  },
): { ok: true } | { ok: false; error: string } {
  if (!decision.passed) {
    return mutateOperationsStore((draft) => {
      const job = draft.fabricationJobs.find((j) => j.id === jobId)
      if (!job) return { ok: false, error: "Fabrication job not found." }
      if (!decision.notes.trim()) {
        return {
          ok: false,
          error:
            "Specify the required corrections so Ground Crew can rework the item.",
        }
      }
      const fallbackCrew =
        decision.responsibleCrewEmails &&
        decision.responsibleCrewEmails.length > 0
          ? decision.responsibleCrewEmails
          : job.participantEmails && job.participantEmails.length > 0
            ? job.participantEmails
            : job.productionLeadEmail
              ? [job.productionLeadEmail]
              : job.assignedCrewEmails.length > 0
                ? job.assignedCrewEmails
                : ["crew@demo.com"]

      const now = new Date().toISOString()
      const round = (job.correctionRequests?.length ?? 0) + 1
      const correctionId = `cor-${Date.now().toString().slice(-6)}-${round}`
      const jobAssignments = job.assignments ?? (job.assignments = [])
      const createdAssignmentIds: string[] = []

      for (const email of fallbackCrew) {
        const cleanEmail = email.trim().toLowerCase()
        const corrAsg: WorkerAssignmentRecord = {
          id: `wasg-cor-${Date.now().toString().slice(-5)}-${jobAssignments.length + 1}`,
          eventId: job.eventId,
          kind: "production",
          jobId: job.id,
          crewEmail: cleanEmail,
          crewName: cleanEmail,
          role: "crew",
          instructions: `Correction Round ${round}: ${decision.notes.trim()}`,
          status: "Assigned",
          isCorrectionAssignment: true,
          correctionRequestId: correctionId,
          updatedAt: now,
        }
        jobAssignments.push(corrAsg)
        createdAssignmentIds.push(corrAsg.id)
      }

      job.correctionRequests = [
        ...(job.correctionRequests ?? []),
        {
          id: correctionId,
          jobId: job.id,
          eventId: job.eventId,
          round,
          requestedByEmail: actor.email,
          requestedByName: actor.name,
          requestedAt: now,
          explanation: decision.notes.trim(),
          referencePhotoUrls: [],
          responsibleCrewEmails: fallbackCrew,
          createdAssignmentIds,
          scheduledAdditionalShiftIds: [],
        },
      ]
      job.status = "In Production"
      job.correctionNotes = decision.notes.trim()
      job.releasedForLoading = false
      job.updatedAt = now
      void oldSystemApis.production.rejectTask(jobId, decision.notes.trim())
      return { ok: true }
    })
  }

  return approveProductionJobFinishedWork(actor, jobId, {
    checklist: decision.checklist ?? {
      fullQuantityFinished: true,
      matchesClientApprovedSpec: true,
      correctionsResolved: true,
    },
    notes: decision.notes,
  })
}

/**
 * Warehouse Operations Manager — Resolve Migration Review Flag:
 * Validates resolution against the actual flag's domain requirements before clearing it.
 * Never clears a flag solely because an audit reason was entered, and never lets status
 * correction silently bypass full-quantity verification, approval, or manifest safeguards.
 */
export function resolveMigrationReviewFlag(
  actor: OpsActor,
  payload: {
    eventId: string
    jobId?: string
    flagId?: string
    flagCode: MigrationReviewFlagCode
    action:
      | "confirmed-data"
      | "corrected-status"
      | "replaced-demo-or-lead"
      | "recorded-historical-exception"
    reason: string
    newStatus?: CustomFabricationStatus
    confirmedParticipantEmails?: string[]
    confirmedLeadEmail?: string
    replacementCrewEmail?: string
    explicitDemoConfirmation?: boolean
  },
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only the Warehouse Operations Manager can resolve migration review flags.",
    }
  }
  const cleanReason = payload.reason.trim()
  if (!cleanReason) {
    return {
      ok: false,
      error: "Enter a resolution or audit reason to resolve this migration review flag.",
    }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    const job = payload.jobId
      ? draft.fabricationJobs.find((j) => j.id === payload.jobId)
      : undefined
    if (payload.jobId && (!job || job.eventId !== payload.eventId)) {
      return { ok: false, error: "Production job not found for this event." }
    }

    const targetFlags = job
      ? (job.migrationReviewFlags ?? [])
      : (order.migrationReviewFlags ?? [])

    const matchingFlags = targetFlags.filter(
      (f) =>
        !f.resolvedAt &&
        f.code === payload.flagCode &&
        (!payload.flagId || f.id === payload.flagId),
    )

    if (matchingFlags.length === 0) {
      return {
        ok: false,
        error: `No unresolved migration flag (${payload.flagCode}) found.`,
      }
    }

    const now = new Date().toISOString()
    const activeRoster = (order.eventRoster ?? []).filter((r) => !r.removedAt)
    const activeRosterEmails = new Set(
      activeRoster.map((r) => r.crewEmail.trim().toLowerCase()),
    )
    const authAccounts = getAuthState().accounts
    const allJobShifts = (job?.schedules ?? []).filter(
      (s) => s.status === "scheduled" && !s.needsWarehouseReview,
    )
    const allEventShifts = [
      ...(order.eventSchedules ?? []),
      ...draft.fabricationJobs
        .filter((j) => j.eventId === order.eventId)
        .flatMap((j) => j.schedules ?? []),
    ].filter((s) => s.status === "scheduled" && !s.needsWarehouseReview)

    // ------------------------------------------------------------------
    // Action 1: Status Correction (must never bypass verification/approval)
    // ------------------------------------------------------------------
    if (payload.action === "corrected-status") {
      if (!job) {
        return {
          ok: false,
          error: "Status correction is only applicable to a production job.",
        }
      }
      if (!payload.newStatus) {
        return {
          ok: false,
          error: "Select a valid target status for legacy status correction.",
        }
      }
      if (payload.newStatus === job.status) {
        return {
          ok: false,
          error: `Job is already in ${job.status}. Choose a different target status.`,
        }
      }

      if (payload.newStatus === "Ready to Load") {
        const hasFullApprovedEvidence = Boolean(
          job.verifiedByEmail &&
            job.verifiedPhotoUrl &&
            job.completedQty === job.spec.requestedQty &&
            job.approval?.checklist.fullQuantityFinished &&
            job.approval?.checklist.matchesClientApprovedSpec &&
            job.approval?.checklist.correctionsResolved &&
            ((job.submissions?.length ?? 0) > 0 || job.approval?.isHistoricalException),
        )
        if (!hasFullApprovedEvidence) {
          return {
            ok: false,
            error:
              "Cannot move a job into Ready to Load via migration status correction without full-quantity verification evidence and a complete 3-point Warehouse approval (or documented full-quantity exception).",
          }
        }
      }

      if (payload.newStatus === "Awaiting Verification") {
        const hasSubmissionAtFullQty =
          (job.submissions?.length ?? 0) > 0 &&
          job.completedQty === job.spec.requestedQty
        if (!hasSubmissionAtFullQty) {
          return {
            ok: false,
            error:
              "Cannot move a job into Awaiting Verification without a full-quantity finished-work submission; revert to In Production or Assigned instead.",
          }
        }
      }

      if (payload.newStatus === "In Production" && allJobShifts.length === 0 && payload.flagCode === "MISSING_CONFIRMED_SCHEDULE") {
        return {
          ok: false,
          error:
            "Job remains In Production without a structured schedule; schedule an Asia/Manila shift or correct status back to Assigned / Unassigned.",
        }
      }

      const prevStatus = job.status
      job.status = payload.newStatus
      if (payload.newStatus !== "Ready to Load") {
        job.releasedForLoading = false
      }

      for (const f of matchingFlags) {
        f.resolvedAt = now
        f.resolvedByEmail = actor.email
        f.resolvedByName = actor.name
        f.resolutionNotes = cleanReason
      }

      job.migrationResolutionHistory = [
        ...(job.migrationResolutionHistory ?? []),
        {
          id: `mra-${Date.now().toString().slice(-6)}`,
          eventId: payload.eventId,
          jobId: job.id,
          flagCode: payload.flagCode,
          action: payload.action,
          previousStatus: prevStatus,
          newStatus: payload.newStatus,
          reason: cleanReason,
          resolvedByEmail: actor.email,
          resolvedByName: actor.name,
          resolvedAt: now,
        },
      ]
      job.needsWarehouseReview = hasUnresolvedMigrationFlag(job.migrationReviewFlags)
      job.updatedAt = now
      return { ok: true }
    }

    // ------------------------------------------------------------------
    // Action 2+: Domain-specific validation per MigrationReviewFlagCode
    // ------------------------------------------------------------------
    const validateParticipantsConsistentWithRoster = (
      rawEmails: string[] | undefined,
    ): { ok: true; emails: string[] } | { ok: false; error: string } => {
      const candidate = (
        rawEmails && rawEmails.length > 0
          ? rawEmails
          : job?.participantEmails ?? []
      )
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
      const unique = [...new Set(candidate)]
      if (unique.length === 0) {
        return {
          ok: false,
          error:
            "Select at least one active Event Crew Roster member as a confirmed participant before resolving this flag.",
        }
      }
      const notOnRoster = unique.filter((e) => !activeRosterEmails.has(e))
      if (notOnRoster.length > 0) {
        return {
          ok: false,
          error: `Confirmed participants must belong to the active Event Crew Group roster (add first: ${notOnRoster.join(", ")}).`,
        }
      }
      const ineligible = unique.filter((email) => {
        const matchedAuth = authAccounts.find(
          (u) => u.email.trim().toLowerCase() === email,
        )
        return (
          matchedAuth &&
          (matchedAuth.role !== "Ground Crew" ||
            Boolean(matchedAuth.deletedAt) ||
            matchedAuth.status !== "Active")
        )
      })
      if (ineligible.length > 0) {
        return {
          ok: false,
          error: `Selected participant(s) are not active Ground Crew accounts: ${ineligible.join(", ")}.`,
        }
      }
      return { ok: true, emails: unique }
    }

    switch (payload.flagCode) {
      case "MISSING_CONFIRMED_SCHEDULE": {
        if (payload.action !== "confirmed-data") {
          return {
            ok: false,
            error:
              "Enter valid structured Asia/Manila shift schedules (or correct the legacy job status) to resolve MISSING_CONFIRMED_SCHEDULE.",
          }
        }
        if (job) {
          if (allJobShifts.length === 0) {
            return {
              ok: false,
              error: `Job "${job.spec.name}" still has no scheduled Asia/Manila shifts. Schedule a shift for the affected worker/job first.`,
            }
          }
        } else {
          for (const f of matchingFlags) {
            const legacyAsg = order.crewAssignments.find((a) => a.id === f.targetId)
            const hasMatchingShift = allEventShifts.some((s) =>
              legacyAsg
                ? s.crewEmail.toLowerCase() === legacyAsg.crewEmail.toLowerCase()
                : f.targetType === "assignment" || f.targetType === "schedule"
                  ? s.assignmentId === f.targetId || s.id === f.targetId
                  : s.eventId === order.eventId,
            )
            if (!hasMatchingShift) {
              return {
                ok: false,
                error:
                  "The affected assignment still lacks a structured Asia/Manila shift schedule.",
              }
            }
          }
        }
        break
      }

      case "UNPARSEABLE_SCHEDULE_TEXT": {
        if (payload.action !== "confirmed-data") {
          return {
            ok: false,
            error:
              "Schedule a valid Asia/Manila shift for the flagged worker to resolve UNPARSEABLE_SCHEDULE_TEXT.",
          }
        }
        for (const f of matchingFlags) {
          const legacyAsg = order.crewAssignments.find((a) => a.id === f.targetId)
          if (!legacyAsg) {
            return {
              ok: false,
              error: "Targeted legacy assignment for UNPARSEABLE_SCHEDULE_TEXT could not be found.",
            }
          }
          const hasWorkerShift = allEventShifts.some(
            (s) => s.crewEmail.toLowerCase() === legacyAsg.crewEmail.toLowerCase(),
          )
          if (!hasWorkerShift) {
            return {
              ok: false,
              error: `Schedule at least one valid Asia/Manila shift for ${legacyAsg.crewName} (${legacyAsg.crewEmail}) before resolving UNPARSEABLE_SCHEDULE_TEXT. Original legacy text will be preserved.`,
            }
          }
        }
        break
      }

      case "UNCONFIRMED_PARTICIPANTS": {
        if (!job) {
          return {
            ok: false,
            error: "UNCONFIRMED_PARTICIPANTS must be resolved against the affected production job.",
          }
        }
        const check = validateParticipantsConsistentWithRoster(
          payload.confirmedParticipantEmails,
        )
        if (!check.ok) return check
        const hasUnresolvedDemoFlag = (job.migrationReviewFlags ?? []).some(
          (f) => f.code === "DEMO_ACCOUNT_ASSIGNED" && !f.resolvedAt,
        )
        if (
          check.emails.includes("crew@demo.com") &&
          hasUnresolvedDemoFlag &&
          !payload.explicitDemoConfirmation
        ) {
          return {
            ok: false,
            error:
              "Replace crew@demo.com with a confirmed roster worker (or explicitly review DEMO_ACCOUNT_ASSIGNED) before confirming participants.",
          }
        }
        job.participantEmails = check.emails
        job.assignedCrewEmails = check.emails
        for (const r of order.eventRoster ?? []) {
          if (check.emails.includes(r.crewEmail.toLowerCase())) {
            r.needsWarehouseReview = false
          }
        }
        break
      }

      case "DEMO_ACCOUNT_ASSIGNED": {
        if (job) {
          const check = validateParticipantsConsistentWithRoster(
            payload.confirmedParticipantEmails,
          )
          if (!check.ok) return check
          const stillIncludesDemo = check.emails.includes("crew@demo.com")
          if (stillIncludesDemo && !payload.explicitDemoConfirmation) {
            return {
              ok: false,
              error:
                "DEMO_ACCOUNT_ASSIGNED requires replacing crew@demo.com with confirmed roster worker(s) or checking the explicit demo-account confirmation after review.",
            }
          }
          job.participantEmails = check.emails
          job.assignedCrewEmails = check.emails
          for (const r of order.eventRoster ?? []) {
            if (check.emails.includes(r.crewEmail.toLowerCase())) {
              r.needsWarehouseReview = false
            }
          }
        } else {
          const replEmail = payload.replacementCrewEmail?.trim().toLowerCase()
          if (replEmail) {
            if (replEmail === "crew@demo.com") {
              return {
                ok: false,
                error: "Choose a replacement Ground Crew account other than crew@demo.com.",
              }
            }
            if (!activeRosterEmails.has(replEmail)) {
              return {
                ok: false,
                error: `Replacement worker ${replEmail} must be added to the Event Crew Group roster first.`,
              }
            }
            const replMember = activeRoster.find(
              (r) => r.crewEmail.toLowerCase() === replEmail,
            )
            for (const f of matchingFlags) {
              const legacyAsg = order.crewAssignments.find((a) => a.id === f.targetId)
              if (legacyAsg) {
                legacyAsg.crewEmail = replEmail
                legacyAsg.crewName = replMember?.crewName || replEmail
                legacyAsg.needsWarehouseReview = false
              }
            }
            if (replMember) replMember.needsWarehouseReview = false
          } else if (payload.explicitDemoConfirmation) {
            for (const r of activeRoster) {
              if (r.crewEmail.toLowerCase() === "crew@demo.com") {
                r.needsWarehouseReview = false
              }
            }
          } else {
            return {
              ok: false,
              error:
                "Select a confirmed replacement crew member from the roster or check the explicit demo-assignment review confirmation.",
            }
          }
        }
        break
      }

      case "AUTO_DESIGNATED_TEAM_LEAD": {
        const chosenLeadEmail = payload.confirmedLeadEmail?.trim().toLowerCase()
        if (chosenLeadEmail) {
          if (!activeRosterEmails.has(chosenLeadEmail)) {
            return {
              ok: false,
              error: `Selected Event Team Lead (${chosenLeadEmail}) must belong to the active Event Crew Group roster.`,
            }
          }
          if (
            chosenLeadEmail === "crew@demo.com" &&
            !payload.explicitDemoConfirmation
          ) {
            return {
              ok: false,
              error:
                "Replacing or confirming the demo account as Event Team Lead requires selecting another roster worker or checking the explicit demo confirmation.",
            }
          }
          const matchedRoster = activeRoster.find(
            (r) => r.crewEmail.toLowerCase() === chosenLeadEmail,
          )
          const prevEmail = order.teamLeadEmail
          const prevName = order.teamLeadName
          const newName = matchedRoster?.crewName || chosenLeadEmail

          order.teamLeadExplicitlySelected = true
          if (prevEmail?.toLowerCase() !== chosenLeadEmail) {
            order.teamLeadEmail = chosenLeadEmail
            order.teamLeadName = newName
            order.teamLeadHistory.unshift({
              id: `tlh-${Date.now().toString().slice(-6)}`,
              previousLeadEmail: prevEmail,
              previousLeadName: prevName,
              newLeadEmail: chosenLeadEmail,
              newLeadName: newName,
              changedByEmail: actor.email,
              changedByName: actor.name,
              changedAt: now,
              reason: cleanReason,
            })
            for (const eventJob of draft.fabricationJobs) {
              if (eventJob.eventId !== order.eventId) continue
              const wasUsingInherited =
                !eventJob.productionLeadEmail ||
                eventJob.productionLeadEmail.toLowerCase() ===
                  (prevEmail?.toLowerCase() ?? "")
              eventJob.inheritedLeadEmail = chosenLeadEmail
              eventJob.inheritedLeadName = newName
              if (wasUsingInherited) {
                eventJob.productionLeadEmail = chosenLeadEmail
                eventJob.productionLeadName = newName
              }
            }
          }
          if (matchedRoster) matchedRoster.needsWarehouseReview = false
        } else if (!order.teamLeadExplicitlySelected) {
          return {
            ok: false,
            error:
              "AUTO_DESIGNATED_TEAM_LEAD requires selecting/confirming an actual Event Team Lead from the active roster before resolving.",
          }
        }
        break
      }

      case "LEGACY_EVIDENCE_NO_EXPLICIT_SUBMISSION": {
        if (!job) {
          return { ok: false, error: "Verification evidence flag applies to a production job." }
        }
        if (payload.action === "recorded-historical-exception") {
          if (job.completedQty !== job.spec.requestedQty) {
            return {
              ok: false,
              error: `Cannot record a historical verification exception while completed quantity (${job.completedQty}) differs from full required quantity (${job.spec.requestedQty}).`,
            }
          }
          job.approval = {
            ...(job.approval ?? {
              verifiedByEmail: actor.email,
              verifiedByName: actor.name,
              verifiedAt: now,
              checklist: {
                fullQuantityFinished: true,
                matchesClientApprovedSpec: true,
                correctionsResolved: true,
              },
              notes: cleanReason,
            }),
            isHistoricalException: true,
            historicalExceptionReason: cleanReason,
          }
        } else {
          const hasExplicitSubmission =
            (job.submissions?.length ?? 0) > 0 &&
            job.completedQty === job.spec.requestedQty
          if (!hasExplicitSubmission) {
            return {
              ok: false,
              error:
                "An explicit full-quantity finished-work submission is required to confirm verification evidence (or record an audited historical exception).",
            }
          }
        }
        break
      }

      case "LEGACY_APPROVAL_MISSING_EVIDENCE": {
        if (!job) {
          return { ok: false, error: "Approval evidence flag applies to a production job." }
        }
        if (payload.action === "recorded-historical-exception") {
          if (job.completedQty !== job.spec.requestedQty) {
            return {
              ok: false,
              error: `Cannot clear LEGACY_APPROVAL_MISSING_EVIDENCE with an exception when completed quantity (${job.completedQty}) does not equal full required quantity (${job.spec.requestedQty}). Revert status to In Production instead.`,
            }
          }
          job.verifiedByEmail = job.verifiedByEmail || actor.email
          job.verifiedByName = job.verifiedByName || actor.name
          job.verifiedAt = job.verifiedAt || now
          job.approval = {
            ...(job.approval ?? {
              verifiedByEmail: actor.email,
              verifiedByName: actor.name,
              verifiedAt: now,
              checklist: {
                fullQuantityFinished: true,
                matchesClientApprovedSpec: true,
                correctionsResolved: true,
              },
              notes: cleanReason,
            }),
            isHistoricalException: true,
            historicalExceptionReason: cleanReason,
          }
        } else {
          const hasCompleteVerificationEvidence = Boolean(
            job.verifiedByEmail &&
              job.verifiedPhotoUrl &&
              job.completedQty === job.spec.requestedQty &&
              ((job.submissions?.length ?? 0) > 0 || job.approval?.isHistoricalException),
          )
          if (!hasCompleteVerificationEvidence) {
            return {
              ok: false,
              error:
                "Complete verification evidence (reviewer, photo, full quantity, and submission or audited historical exception) is required before clearing LEGACY_APPROVAL_MISSING_EVIDENCE.",
            }
          }
        }
        break
      }

      case "MIGRATED_CORRECTION_NEEDS_ASSIGNMENT": {
        if (!job) {
          return { ok: false, error: "Migrated correction assignment flag applies to a production job." }
        }
        const check = validateParticipantsConsistentWithRoster(
          payload.confirmedParticipantEmails,
        )
        if (!check.ok) return check
        if (allJobShifts.length === 0) {
          return {
            ok: false,
            error:
              "Schedule at least one valid Asia/Manila shift for the correction worker(s) before resolving MIGRATED_CORRECTION_NEEDS_ASSIGNMENT.",
          }
        }
        job.participantEmails = check.emails
        job.assignedCrewEmails = check.emails
        const jobAssignments = job.assignments ?? (job.assignments = [])
        for (const corr of job.correctionRequests ?? []) {
          if (corr.resolvedAt) continue
          corr.responsibleCrewEmails = check.emails
          for (const email of check.emails) {
            const hasCorrAsg = jobAssignments.some(
              (a) =>
                a.correctionRequestId === corr.id &&
                a.crewEmail.toLowerCase() === email,
            )
            if (!hasCorrAsg) {
              const member = activeRoster.find(
                (r) => r.crewEmail.toLowerCase() === email,
              )
              const asg: WorkerAssignmentRecord = {
                id: `wasg-cor-${Date.now().toString().slice(-5)}-${jobAssignments.length + 1}`,
                eventId: job.eventId,
                kind: "production",
                jobId: job.id,
                activityType: "fabrication",
                crewEmail: email,
                crewName: member?.crewName || email,
                role: "crew",
                instructions: `Correction Round ${corr.round}: ${corr.explanation}`,
                status: "Assigned",
                progressPercent: 0,
                isCorrectionAssignment: true,
                correctionRequestId: corr.id,
                updatedAt: now,
              }
              jobAssignments.push(asg)
              corr.createdAssignmentIds.push(asg.id)
            }
          }
        }
        break
      }
    }

    // Mark ONLY the validated matching flag(s) resolved and append audit entry
    for (const f of matchingFlags) {
      f.resolvedAt = now
      f.resolvedByEmail = actor.email
      f.resolvedByName = actor.name
      f.resolutionNotes = cleanReason
    }

    const auditEntry = {
      id: `mra-${Date.now().toString().slice(-6)}`,
      eventId: payload.eventId,
      jobId: job?.id,
      flagCode: payload.flagCode,
      action: payload.action,
      previousStatus: job?.status,
      newStatus: job?.status,
      reason: cleanReason,
      resolvedByEmail: actor.email,
      resolvedByName: actor.name,
      resolvedAt: now,
    }

    if (job) {
      job.migrationResolutionHistory = [
        ...(job.migrationResolutionHistory ?? []),
        auditEntry,
      ]
      job.needsWarehouseReview = hasUnresolvedMigrationFlag(
        job.migrationReviewFlags,
      )
      job.updatedAt = now
    } else {
      for (const asg of order.crewAssignments) {
        if (matchingFlags.some((f) => f.targetId === asg.id)) {
          asg.needsWarehouseReview = (order.migrationReviewFlags ?? []).some(
            (f) => !f.resolvedAt && f.targetId === asg.id,
          )
        }
      }
      order.migrationResolutionHistory = [
        ...(order.migrationResolutionHistory ?? []),
        auditEntry,
      ]
    }

    return { ok: true }
  })
}
