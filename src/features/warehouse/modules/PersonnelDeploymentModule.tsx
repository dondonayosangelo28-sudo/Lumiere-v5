import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Plus,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react"
import Modal from "../../../components/overlay/Modal"
import { Badge, Button, Card, Field, Input, PageHeader, cx } from "../../../components/ui/ui"
import { fmtStamp } from "../../event-manager/shared"
import {
  addCrewToEventRoster,
  calculateGuestBasedEventStaffing,
  calculateWorkingLeadCapacity,
  cancelScheduledShift,
  computeWarehouseOverviewData,
  confirmWorkerAssignmentCompletion,
  designateEventTeamLead,
  getAvailableGroundCrewAccounts,
  hasInSessionOperationsNavigation,
  previewRosterOrLeadChangeImpact,
  removeCrewFromEventRoster,
  resolveMigrationReviewFlag,
  scheduleWorkerShift,
  useOperationsStore,
  validateAndComputeShiftSchedule,
  validateStoreSchedulesAndWorkload,
  type CustomFabricationStatus,
  type OperationsNavigationContext,
  type OpsActor,
  type ShiftActivityType,
} from "../../../operations/store"
import { useNotify } from "../warehouse-shared"

export default function PersonnelDeploymentModule({
  actor,
  initialEventId,
  initialJobId,
  embedded = false,
  onNavigate,
}: {
  actor: OpsActor
  initialEventId?: string
  initialJobId?: string
  embedded?: boolean
  onNavigate?: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const availableCrew = getAvailableGroundCrewAccounts()

  const [selectedEventId, setSelectedEventId] = useState(() => {
    if (initialEventId && state.orderRequests.some((o) => o.eventId === initialEventId)) {
      return initialEventId
    }
    return state.orderRequests[0]?.eventId ?? ""
  })

  const [crewSubTab, setCrewSubTab] = useState<"upcoming" | "rosters">("upcoming")
  const [staffingEventOpen, setStaffingEventOpen] = useState<boolean>(() =>
    Boolean(
      !embedded &&
        hasInSessionOperationsNavigation() &&
        ((initialEventId && state.orderRequests.some((o) => o.eventId === initialEventId)) ||
          initialJobId),
    ),
  )
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignTargetEventId, setAssignTargetEventId] = useState<string>(
    () => initialEventId || state.orderRequests[0]?.eventId || "",
  )
  const [assignCrewEmail, setAssignCrewEmail] = useState<string>(
    () => availableCrew[0]?.email ?? "",
  )
  const [assignCustomName, setAssignCustomName] = useState("")
  const [assignMakeLead, setAssignMakeLead] = useState(false)

  useEffect(() => {
    if (
      !embedded &&
      hasInSessionOperationsNavigation() &&
      initialEventId &&
      state.orderRequests.some((o) => o.eventId === initialEventId)
    ) {
      setSelectedEventId(initialEventId)
      setStaffingEventOpen(true)
    } else if (!embedded && initialEventId === undefined) {
      setStaffingEventOpen(false)
    }
  }, [embedded, initialEventId, state.orderRequests])

  useEffect(() => {
    if (!embedded && hasInSessionOperationsNavigation() && initialJobId) {
      setStaffingEventOpen(true)
    }
  }, [embedded, initialJobId])

  const effectiveEventId = embedded ? (initialEventId ?? "") : selectedEventId
  const order = embedded
    ? state.orderRequests.find((o) => o.eventId === effectiveEventId)
    : (state.orderRequests.find((o) => o.eventId === effectiveEventId) ?? state.orderRequests[0])

  // 1. Roster Add State
  const [rosterCrewEmail, setRosterCrewEmail] = useState(
    availableCrew[0]?.email ?? "crew@demo.com",
  )
  const [customRosterName, setCustomRosterName] = useState("")

  // 2. Roster Removal Impact Preview State
  const [removingCrewEmail, setRemovingCrewEmail] = useState<string | null>(null)
  const [removalReason, setRemovalReason] = useState("")
  const [removalReassignEmail, setRemovalReassignEmail] = useState("")
  const [removalCancelShifts, setRemovalCancelShifts] = useState(false)

  // 3. Explicit Team Lead Selection / Replacement State
  const [replaceLeadEmail, setReplaceLeadEmail] = useState("")
  const [replaceReason, setReplaceReason] = useState("")

  // 4. Structured Asia/Manila Shift Scheduling Form State
  const [shiftScopeJobId, setShiftScopeJobId] = useState<string>(initialJobId ?? "")
  const [shiftCrewEmail, setShiftCrewEmail] = useState("crew@demo.com")
  const [shiftActivityType, setShiftActivityType] = useState<ShiftActivityType>("fabrication")
  const [shiftAssignmentTargetId, setShiftAssignmentTargetId] = useState<string>("")
  const [shiftStartDateTime, setShiftStartDateTime] = useState("2026-04-20T08:00")
  const [shiftEndDateTime, setShiftEndDateTime] = useState("2026-04-20T17:00")
  const [shiftBreakMinutes, setShiftBreakMinutes] = useState("60")
  const [shiftBreakStart, setShiftBreakStart] = useState("")
  const [shiftBreakEnd, setShiftBreakEnd] = useState("")
  const [shiftIsShared, setShiftIsShared] = useState(false)
  const [shiftRequiredSimultaneousCrew, setShiftRequiredSimultaneousCrew] = useState("2")
  const [shiftInstructions, setShiftInstructions] = useState("")

  // 5. Shift Cancellation State
  const [cancelReasonByShiftId, setCancelReasonByShiftId] = useState<Record<string, string>>({})

  // 6. Migration Review Resolution State
  const [flagReasonById, setFlagReasonById] = useState<Record<string, string>>({})
  const [flagNewStatusById, setFlagNewStatusById] = useState<
    Record<string, CustomFabricationStatus>
  >({})
  const [flagParticipantsById, setFlagParticipantsById] = useState<Record<string, string>>({})
  const [flagConfirmedLeadById, setFlagConfirmedLeadById] = useState<Record<string, string>>({})
  const [flagReplacementCrewById, setFlagReplacementCrewById] = useState<Record<string, string>>({})
  const [flagExplicitDemoConfirmById, setFlagExplicitDemoConfirmById] = useState<
    Record<string, boolean>
  >({})

  // 7. Legacy Assignment Form State (preserved for compatibility)
  const [legacyCrewEmail, setLegacyCrewEmail] = useState(
    availableCrew[0]?.email ?? "crew@demo.com",
  )
  const [legacySchedule, setLegacySchedule] = useState("Apr 25, 2026 · 07:00 AM – 11:59 PM")
  const [legacyShiftLabel, setLegacyShiftLabel] = useState("Shift 1 — Ingress, Event & Return")
  const [legacyDuties, setLegacyDuties] = useState(
    "Execute dispatch loading counts, venue arrival checks, event hours monitoring, and warehouse return audit.",
  )
  const [legacyMakeLead, setLegacyMakeLead] = useState(false)

  useEffect(() => {
    if (initialJobId !== undefined) {
      setShiftScopeJobId(initialJobId)
    }
  }, [initialJobId])

  const overviewData = useMemo(() => computeWarehouseOverviewData(state), [state])
  const scheduleReport = useMemo(() => validateStoreSchedulesAndWorkload(state), [state])

  if (!order) return null

  const activeRoster = (order.eventRoster ?? []).filter((r) => !r.removedAt)
  const removedRoster = (order.eventRoster ?? []).filter((r) => Boolean(r.removedAt))
  const eventJobs = state.fabricationJobs.filter((j) => j.eventId === order.eventId)
  const guestStaffing = calculateGuestBasedEventStaffing(order.pax)
  const eventSummary = overviewData.eventSummaries.find((s) => s.eventId === order.eventId)

  // Candidate crew options for lead / shift scheduling (combine activeRoster + availableCrew)
  const rosterAndAvailablePool: { email: string; name: string; inRoster: boolean }[] = Array.from(
    new Map<string, { email: string; name: string; inRoster: boolean }>([
      ...activeRoster.map(
        (r) =>
          [
            r.crewEmail.toLowerCase(),
            { email: r.crewEmail, name: r.crewName, inRoster: true },
          ] as const,
      ),
      ...order.crewAssignments.map(
        (a) =>
          [
            a.crewEmail.toLowerCase(),
            { email: a.crewEmail, name: a.crewName, inRoster: false },
          ] as const,
      ),
      ...availableCrew.map(
        (u) =>
          [
            u.email.toLowerCase(),
            {
              email: u.email,
              name: u.name,
              inRoster: activeRoster.some(
                (r) => r.crewEmail.toLowerCase() === u.email.toLowerCase(),
              ),
            },
          ] as const,
      ),
    ]).values(),
  )

  // Impact preview for removing a roster member
  const removalImpact = removingCrewEmail
    ? previewRosterOrLeadChangeImpact(state, {
      eventId: order.eventId,
      targetCrewEmail: removingCrewEmail,
      action: "remove-roster",
    })
    : null

  // Impact preview for replacing the current Event Team Lead
  const leadReplaceImpact =
    order.teamLeadEmail &&
      replaceLeadEmail &&
      replaceLeadEmail.toLowerCase() !== order.teamLeadEmail.toLowerCase()
      ? previewRosterOrLeadChangeImpact(state, {
        eventId: order.eventId,
        targetCrewEmail: order.teamLeadEmail,
        action: "replace-lead",
      })
      : null

  // Live preview of the shift being configured
  const isOvernightPreview =
    shiftStartDateTime.slice(0, 10) !== "" &&
    shiftEndDateTime.slice(0, 10) !== "" &&
    shiftStartDateTime.slice(0, 10) !== shiftEndDateTime.slice(0, 10)
  const requiresExplicitBreakWindow =
    (isOvernightPreview ||
      (shiftIsShared && Number(shiftRequiredSimultaneousCrew) > 1)) &&
    (Number(shiftBreakMinutes) > 0 || Boolean(shiftBreakStart) || Boolean(shiftBreakEnd))

  const liveShiftPreview = validateAndComputeShiftSchedule({
    startDateTime: shiftStartDateTime,
    endDateTime: shiftEndDateTime,
    breakMinutes:
      shiftBreakStart && shiftBreakEnd ? undefined : Number(shiftBreakMinutes) || 0,
    breakStartDateTime: shiftBreakStart || undefined,
    breakEndDateTime: shiftBreakEnd || undefined,
    isSharedShift: shiftIsShared,
    requiredSimultaneousCrew: shiftIsShared
      ? Number(shiftRequiredSimultaneousCrew) || 2
      : undefined,
  })

  // Collect all shifts (active + cancelled) for this event & its production jobs
  const allEventShifts = [
    ...(order.eventSchedules ?? []),
    ...eventJobs.flatMap((j) => j.schedules ?? []),
  ]

  // Collect all production AND event-operation worker assignments & contributions for independent completion review
  const allAssignmentsWithMeta = [
    ...eventJobs.flatMap((job) =>
      (job.assignments ?? []).map((asg) => ({
        job,
        assignment: asg,
        logs: (job.contributions ?? []).filter((c) => c.assignmentId === asg.id),
        shifts: (job.schedules ?? []).filter((s) => s.assignmentId === asg.id),
      })),
    ),
    ...(order.eventAssignments ?? []).map((asg) => ({
      job: undefined,
      assignment: asg,
      logs: (order.eventContributions ?? []).filter((c) => c.assignmentId === asg.id),
      shifts: (order.eventSchedules ?? []).filter((s) => s.assignmentId === asg.id),
    })),
  ]

  // Candidate same-scope incomplete assignments matching the currently selected worker & duty
  const matchingOpenAssignmentsForShiftForm = (
    shiftScopeJobId
      ? eventJobs.find((j) => j.id === shiftScopeJobId)?.assignments ?? []
      : order.eventAssignments ?? []
  ).filter((a) => {
    if (a.crewEmail.toLowerCase() !== shiftCrewEmail.toLowerCase()) return false
    if (a.status === "Completed" || a.isCorrectionAssignment) return false
    const expectedPhase =
      !shiftScopeJobId &&
        shiftActivityType !== "fabrication" &&
        shiftActivityType !== "lead-coordination"
        ? shiftActivityType
        : undefined
    const asgActivity =
      a.activityType ??
      a.phase ??
      (a.kind === "production"
        ? a.role === "working-lead"
          ? "lead-coordination"
          : "fabrication"
        : undefined)
    return a.phase === expectedPhase && asgActivity === shiftActivityType
  })

  // Collect all unresolved and resolved migration flags for this event and its jobs
  const unresolvedEventFlags = (order.migrationReviewFlags ?? []).filter(
    (f) => !f.resolvedAt,
  )
  const unresolvedJobFlags = eventJobs.flatMap((job) =>
    (job.migrationReviewFlags ?? [])
      .filter((f) => !f.resolvedAt)
      .map((flag) => ({ flag, job })),
  )
  const allMigrationAudits = [
    ...(order.migrationResolutionHistory ?? []),
    ...eventJobs.flatMap((j) => j.migrationResolutionHistory ?? []),
  ]

  // Event-specific schedule/workload/shared-shift conflicts
  const eventJobIds = new Set(eventJobs.map((j) => j.id))
  const eventScheduleConflicts = scheduleReport.conflicts.filter(
    (c) =>
      c.eventId === order.eventId ||
      (c.jobId && eventJobIds.has(c.jobId)) ||
      c.kind === "daily-workload-exceeded",
  )

  return (
    <div className="space-y-6">
      {!embedded && (
        <>
          <PageHeader
            crumbs={["Dashboard", "Crew & Scheduling"]}
            title="Crew & Scheduling"
            subtitle="Ground crew scheduling, event deployments, and zone duty rosters."
          />

          {/* Toolbar: Left Event Staffing Tabs + Right Directory / Assign Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Event Staffing
              </div>
              <div
                className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-card p-1"
                role="tablist"
                aria-label="Crew and Scheduling views"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!staffingEventOpen && crewSubTab === "upcoming"}
                  onClick={() => {
                    setCrewSubTab("upcoming")
                    setStaffingEventOpen(false)
                  }}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    !staffingEventOpen && crewSubTab === "upcoming"
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Calendar className="size-3.5" aria-hidden="true" />
                  <span>Upcoming Events</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!staffingEventOpen && crewSubTab === "rosters"}
                  onClick={() => {
                    setCrewSubTab("rosters")
                    setStaffingEventOpen(false)
                  }}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    !staffingEventOpen && crewSubTab === "rosters"
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Users className="size-3.5" aria-hidden="true" />
                  <span>Event Rosters</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                icon={Users}
                onClick={() => setDirectoryOpen(true)}
              >
                Crew Directory ({availableCrew.length})
              </Button>
              <Button
                type="button"
                icon={UserPlus}
                onClick={() => {
                  setAssignTargetEventId(order.eventId)
                  setAssignCrewEmail(availableCrew[0]?.email ?? "")
                  setAssignCustomName("")
                  setAssignMakeLead(false)
                  setAssignModalOpen(true)
                }}
              >
                Assign Event Crew
              </Button>
            </div>
          </div>
        </>
      )}

      {/* STANDALONE VIEW A: UPCOMING EVENTS */}
      {!embedded && !staffingEventOpen && crewSubTab === "upcoming" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Upcoming Event Staffing</h2>
            <p className="text-xs text-muted-foreground">
              Review crew readiness by event, then open the staffing plan for the event that needs
              attention.
            </p>
          </div>

          {state.orderRequests.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No approved events available for staffing yet.
            </Card>
          ) : (
            <div className="dashboard-surfaces space-y-3">
              {state.orderRequests.map((o) => {
                const summary = overviewData.eventSummaries.find(
                  (s) => s.eventId === o.eventId,
                )
                const roster = (o.eventRoster ?? []).filter((r) => !r.removedAt)
                const activeShifts = (o.eventSchedules ?? []).filter(
                  (s) => s.status !== "cancelled",
                )
                const leadLabel =
                  o.teamLeadEmail && o.teamLeadExplicitlySelected !== false
                    ? o.teamLeadName || o.teamLeadEmail
                    : null
                const statusLabel = summary?.readiness.statusLabel ?? "Configuration pending"
                const statusTone = summary?.readiness.tone ?? "warning"
                const isUnstaffed = roster.length === 0 && activeShifts.length === 0

                return (
                  <Card key={o.id} className="dashboard-welcome relative overflow-hidden p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{o.eventTitle}</h3>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {o.id}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Target Date: {fmtStamp(o.startDateTime)} – {fmtStamp(o.endDateTime)} ·
                          Venue: {o.venue || "Not configured"}
                        </p>
                      </div>
                      <Badge tone={statusTone}>{statusLabel}</Badge>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                      {isUnstaffed ? (
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          No Ground Crew Deployment Assigned Yet
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-foreground">
                          {roster.length} crew on roster · {activeShifts.length} active shift(s) ·
                          Team Lead: {leadLabel ?? "Not selected"}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedEventId(o.eventId)
                          setRemovingCrewEmail(null)
                          setStaffingEventOpen(true)
                        }}
                      >
                        Staff This Event
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* STANDALONE VIEW B: EVENT ROSTERS */}
      {!embedded && !staffingEventOpen && crewSubTab === "rosters" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Event Rosters</h2>
            <p className="text-xs text-muted-foreground">
              Crew rosters, Team Leads, event duties, scheduled shifts, and assignment statuses
              across approved events.
            </p>
          </div>

          {state.orderRequests.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No approved events available yet.
            </Card>
          ) : (
            <div className="dashboard-surfaces space-y-4">
              {state.orderRequests.map((o) => {
                const roster = (o.eventRoster ?? []).filter((r) => !r.removedAt)
                const shifts = o.eventSchedules ?? []
                const duties = o.eventAssignments ?? []
                const legacyAssignments = o.crewAssignments ?? []
                const leadLabel =
                  o.teamLeadEmail && o.teamLeadExplicitlySelected !== false
                    ? `${o.teamLeadName || o.teamLeadEmail} (${o.teamLeadEmail})`
                    : o.teamLeadEmail
                      ? `${o.teamLeadName || o.teamLeadEmail} (Needs confirmation)`
                      : "Not selected"

                return (
                  <Card key={o.id} className="dashboard-welcome relative overflow-hidden p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
                          <h3 className="text-base font-semibold text-foreground">
                            {o.eventTitle}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {fmtStamp(o.startDateTime)} · {o.venue || "Not configured"} · Team Lead:{" "}
                          <strong className="text-foreground">{leadLabel}</strong>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedEventId(o.eventId)
                          setRemovingCrewEmail(null)
                          setStaffingEventOpen(true)
                        }}
                      >
                        Staff This Event
                      </Button>
                    </div>

                    {roster.length === 0 && shifts.length === 0 && duties.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-line p-4 text-xs text-muted-foreground">
                        No Ground Crew members, duties, or scheduled shifts assigned to this event
                        yet.
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Roster &amp; Duties ({roster.length})
                          </div>
                          {roster.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No crew on roster.</p>
                          ) : (
                            <ul className="space-y-1.5 text-xs">
                              {roster.map((member) => {
                                const isLead =
                                  o.teamLeadEmail?.toLowerCase() === member.crewEmail.toLowerCase() &&
                                  o.teamLeadExplicitlySelected !== false
                                const memberDuties = duties.filter(
                                  (d) =>
                                    d.crewEmail.toLowerCase() === member.crewEmail.toLowerCase(),
                                )
                                const legacy = legacyAssignments.find(
                                  (a) =>
                                    a.crewEmail.toLowerCase() === member.crewEmail.toLowerCase(),
                                )
                                return (
                                  <li
                                    key={member.crewEmail}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-fg/[0.02] px-3 py-2"
                                  >
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                                        <span>{member.crewName}</span>
                                        {isLead && <Badge tone="success">Team Lead</Badge>}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground">
                                        {member.crewEmail}
                                        {memberDuties.length > 0
                                          ? ` · ${memberDuties.map((d) => d.activityType || d.phase || d.kind).join(", ")}`
                                          : ""}
                                      </div>
                                    </div>
                                    <Badge tone={legacy?.taskStatus === "Blocked" ? "danger" : "neutral"}>
                                      {legacy?.taskStatus ?? (memberDuties[0]?.status || "On Roster")}
                                    </Badge>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Scheduled Shifts ({shifts.length})
                          </div>
                          {shifts.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No shifts scheduled for this event yet.
                            </p>
                          ) : (
                            <ul className="space-y-1.5 text-xs">
                              {shifts.map((shift) => (
                                <li
                                  key={shift.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-fg/[0.02] px-3 py-2"
                                >
                                  <div>
                                    <div className="font-medium text-foreground">
                                      {shift.crewName} · {shift.activityType}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      {fmtStamp(shift.startDateTime)} – {fmtStamp(shift.endDateTime)}
                                    </div>
                                  </div>
                                  <Badge
                                    tone={
                                      shift.status === "cancelled"
                                        ? "neutral"
                                        : "info"
                                    }
                                  >
                                    {shift.status}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* EVENT STAFFING & SCHEDULING CONTROLS (Shown when embedded OR after clicking Staff This Event) */}
      {(embedded || staffingEventOpen) && (
        <>
          {!embedded && (
            <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  icon={ArrowLeft}
                  onClick={() => setStaffingEventOpen(false)}
                >
                  Back to Upcoming Events
                </Button>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
                    <span className="text-sm font-semibold text-foreground">
                      {order.eventTitle}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtStamp(order.startDateTime)} – {fmtStamp(order.endDateTime)} · {order.venue}
                  </div>
                </div>
              </div>
              {onNavigate && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      onNavigate("module-events", {
                        eventId: order.eventId,
                        subView: "orders",
                      })
                    }
                  >
                    Open Event Requirements
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      onNavigate("module-production", {
                        eventId: order.eventId,
                        subView: "production",
                      })
                    }
                  >
                    Open Production ({eventJobs.length})
                  </Button>
                </div>
              )}
            </Card>
          )}

      {/* Actionable Validation & Conflict Banner */}
      {eventScheduleConflicts.length > 0 && (
        <Card className="border-danger/40 bg-danger/[0.06] p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Schedule, Workload &amp; Shared-Shift Coverage Alerts ({eventScheduleConflicts.length})
            </span>
          </div>
          <ul className="space-y-1 text-xs text-foreground">
            {eventScheduleConflicts.map((c, idx) => (
              <li key={`${c.kind}-${idx}`}>
                • <strong className="uppercase">{c.kind.replace(/-/g, " ")}:</strong> {c.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ─── SECTION 1: EVENT CREW GROUP ROSTER & EXPLICIT TEAM LEAD ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Event Crew Group Roster Management */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-foreground">
                1. Event Crew Group (Roster) — {order.eventTitle}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Roster membership makes Ground Crew accounts eligible for this event.{" "}
                <strong className="text-foreground">
                  Adding to the roster does not automatically schedule work or appoint a Team Lead.
                </strong>{" "}
                Guest-based event recommendation:{" "}
                <strong className="text-foreground">
                  {guestStaffing.rangeLabel} crew ({order.pax} guests)
                </strong>{" "}
                (additional crew may be added for custom fabrication).
              </p>
            </div>
            <Badge tone={activeRoster.length > 0 ? "info" : "warning"}>
              {activeRoster.length > 0
                ? `${activeRoster.length} Active on Roster`
                : "Not configured"}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] items-end border-t border-line pt-4">
            <Field label="Active Ground Crew Account">
              <select
                aria-label="Active Ground Crew Account"
                className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
                value={rosterCrewEmail}
                onChange={(e) => setRosterCrewEmail(e.target.value)}
              >
                {availableCrew.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name} ({u.email})
                  </option>
                ))}
                <option value="alex@demo.com">Alex Ramos (alex@demo.com)</option>
                <option value="carlos@demo.com">Carlos Diaz (carlos@demo.com)</option>
                <option value="dana@demo.com">Dana Lim (dana@demo.com)</option>
              </select>
            </Field>
            <Field label="Display Name (Optional)">
              <Input
                value={customRosterName}
                onChange={(e) => setCustomRosterName(e.target.value)}
                placeholder="Override name…"
              />
            </Field>
            <Button
              type="button"
              icon={UserPlus}
              onClick={() => {
                const known = availableCrew.find(
                  (u) => u.email.toLowerCase() === rosterCrewEmail.toLowerCase(),
                )
                const fallbackNames: Record<string, string> = {
                  "alex@demo.com": "Alex Ramos",
                  "carlos@demo.com": "Carlos Diaz",
                  "dana@demo.com": "Dana Lim",
                }
                const resolvedName =
                  customRosterName.trim() ||
                  known?.name ||
                  fallbackNames[rosterCrewEmail.toLowerCase()] ||
                  rosterCrewEmail
                const res = addCrewToEventRoster(actor, {
                  eventId: order.eventId,
                  crewEmail: rosterCrewEmail,
                  crewName: resolvedName,
                })
                if (!res.ok) notify(res.error)
                else {
                  notify(
                    `Added ${resolvedName} (${rosterCrewEmail}) to the Event Crew Group roster. No shifts were auto-scheduled.`,
                  )
                  setCustomRosterName("")
                }
              }}
            >
              Add to Roster
            </Button>
          </div>

          {/* Active Roster Members List */}
          {activeRoster.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-4 text-xs text-muted-foreground">
              No members have been added to the Event Crew Group roster yet. Add active Ground Crew
              accounts above before scheduling shifts or selecting a Team Lead.
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {activeRoster.map((member) => {
                const isTeamLead =
                  order.teamLeadEmail?.toLowerCase() === member.crewEmail.toLowerCase() &&
                  order.teamLeadExplicitlySelected !== false
                const memberShifts = allEventShifts.filter(
                  (s) =>
                    s.crewEmail.toLowerCase() === member.crewEmail.toLowerCase() &&
                    s.status === "scheduled",
                )
                const totalHours =
                  Math.round(
                    memberShifts.reduce((sum, s) => sum + s.plannedProductiveHours, 0) * 100,
                  ) / 100

                return (
                  <li
                    key={member.crewEmail}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{member.crewName}</span>
                        <span className="text-muted-foreground">({member.crewEmail})</span>
                        {isTeamLead && <Badge tone="info">Explicit Event Team Lead</Badge>}
                        {member.needsWarehouseReview && (
                          <Badge tone="warning">Legacy Roster — Confirm</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-muted-foreground">
                        Scheduled capacity:{" "}
                        <strong className="text-foreground">
                          {memberShifts.length > 0
                            ? `${totalHours}h across ${memberShifts.length} shift(s)`
                            : "0 shifts scheduled (roster only)"}
                        </strong>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isTeamLead && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const res = designateEventTeamLead(actor, {
                              eventId: order.eventId,
                              newLeadEmail: member.crewEmail,
                              newLeadName: member.crewName,
                              reason: `Explicitly selected ${member.crewName} as Event Team Lead from roster.`,
                            })
                            if (!res.ok) notify(res.error)
                            else
                              notify(
                                `Selected ${member.crewName} as Event Team Lead for ${order.eventTitle}.`,
                              )
                          }}
                          className="h-7 px-2.5 text-xs"
                        >
                          Select as Team Lead
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        icon={UserMinus}
                        onClick={() => {
                          setRemovingCrewEmail(member.crewEmail)
                          setRemovalReason("")
                          setRemovalReassignEmail("")
                          setRemovalCancelShifts(false)
                        }}
                        className="h-7 px-2.5 text-xs text-danger"
                      >
                        Remove…
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Impact Preview & Confirmation Box for Roster Removal */}
          {removingCrewEmail && removalImpact && (
            <div
              role="region"
              aria-label="Roster removal impact preview"
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">
                  Impact Preview — Removing {removingCrewEmail} from Roster
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRemovingCrewEmail(null)}
                  className="h-6 px-2 text-xs"
                >
                  Cancel
                </Button>
              </div>
              <div className="space-y-1 text-muted-foreground">
                <div>
                  • Affected Production Jobs:{" "}
                  <strong className="text-foreground">{removalImpact.affectedJobs.length}</strong>
                  {removalImpact.affectedJobs.length > 0 &&
                    ` (${removalImpact.affectedJobs.map((j) => j.name).join(", ")})`}
                </div>
                <div>
                  • Future Scheduled Shifts:{" "}
                  <strong className="text-foreground">
                    {removalImpact.futureSchedules.length}
                  </strong>
                </div>
                <div>
                  • Active Event Assignments:{" "}
                  <strong className="text-foreground">
                    {removalImpact.activeAssignmentIds.length}
                  </strong>
                </div>
                <div>
                  • Historical completed contributions, attendance, actual hours, and past reports
                  are preserved intact.
                </div>
              </div>

              {removalImpact.requiresResolution && (
                <div className="grid gap-3 sm:grid-cols-2 border-t border-amber-500/30 pt-3">
                  <Field label="Reassign Outstanding Work To (Optional)">
                    <select
                      className="h-9 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                      value={removalReassignEmail}
                      onChange={(e) => setRemovalReassignEmail(e.target.value)}
                    >
                      <option value="">Select replacement roster member…</option>
                      {activeRoster
                        .filter((r) => r.crewEmail.toLowerCase() !== removingCrewEmail.toLowerCase())
                        .map((r) => (
                          <option key={r.crewEmail} value={r.crewEmail}>
                            {r.crewName} ({r.crewEmail})
                          </option>
                        ))}
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 pt-5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={removalCancelShifts}
                      onChange={(e) => setRemovalCancelShifts(e.target.checked)}
                    />
                    Or cancel unstarted future shifts in history
                  </label>
                </div>
              )}

              <Field label="Reason for Roster Removal (Required)">
                <Input
                  value={removalReason}
                  onChange={(e) => setRemovalReason(e.target.value)}
                  placeholder="e.g. Reallocated to concurrent event; shifts reassigned."
                />
              </Field>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const repl = activeRoster.find(
                    (r) => r.crewEmail.toLowerCase() === removalReassignEmail.toLowerCase(),
                  )
                  const res = removeCrewFromEventRoster(actor, {
                    eventId: order.eventId,
                    crewEmail: removingCrewEmail,
                    reason: removalReason,
                    reassignToEmail: removalReassignEmail || undefined,
                    reassignToName: repl?.crewName,
                    cancelFutureShifts: removalCancelShifts,
                  })
                  if (!res.ok) notify(res.error)
                  else {
                    notify(`Removed ${removingCrewEmail} from the Event Crew Group roster.`)
                    setRemovingCrewEmail(null)
                  }
                }}
              >
                Confirm Roster Removal
              </Button>
            </div>
          )}

          {removedRoster.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">
                Removed Roster History ({removedRoster.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {removedRoster.map((r) => (
                  <li key={`${r.crewEmail}-${r.removedAt}`}>
                    • <strong>{r.crewName}</strong> ({r.crewEmail}) — Removed at{" "}
                    {r.removedAt && fmtStamp(r.removedAt)}: “{r.removalReason}”
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        {/* Right: Explicit Event Team Lead & Inherited Production Leadership */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-foreground">
                2. Explicit Event Team Lead &amp; Inherited Production Lead
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                The Event Team Lead is explicitly selected from the roster. Production jobs inherit
                this lead by default unless overridden per job.{" "}
                <strong className="text-foreground">
                  Inherited leadership does not automatically reserve worker time.
                </strong>
              </p>
            </div>
            {order.teamLeadEmail && order.teamLeadExplicitlySelected !== false ? (
              <Badge tone="info">Selected: {order.teamLeadName || order.teamLeadEmail}</Badge>
            ) : order.teamLeadEmail ? (
              <Badge tone="warning">
                {order.teamLeadName || order.teamLeadEmail} (Needs confirmation)
              </Badge>
            ) : (
              <Badge tone="warning">Not selected</Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 border-t border-line pt-4">
            <Field label="Select Roster Member as Event Team Lead">
              <select
                aria-label="Select Roster Member as Event Team Lead"
                className="h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
                value={replaceLeadEmail || order.teamLeadEmail || ""}
                onChange={(e) => setReplaceLeadEmail(e.target.value)}
              >
                <option value="">Choose roster member…</option>
                {rosterAndAvailablePool.map((m) => (
                  <option key={m.email} value={m.email}>
                    {m.name} ({m.email})
                    {order.teamLeadEmail?.toLowerCase() === m.email.toLowerCase()
                      ? " — Current Team Lead"
                      : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reason for Selection / Replacement">
              <Input
                value={replaceReason}
                onChange={(e) => setReplaceReason(e.target.value)}
                placeholder="e.g. Explicit Event & Production Lead appointment."
              />
            </Field>
          </div>

          {leadReplaceImpact && (
            <div className="rounded-lg border border-line bg-fg/[0.03] p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground">
                Lead Replacement Impact Preview ({order.teamLeadEmail} → {replaceLeadEmail})
              </div>
              <div className="text-muted-foreground">
                • Production jobs inheriting lead:{" "}
                <strong className="text-foreground">
                  {leadReplaceImpact.affectedJobs.length}
                </strong>
              </div>
              <div className="text-muted-foreground">
                • Previous submitters on completed loading, arrival, return, and production
                submissions remain unchanged.
              </div>
            </div>
          )}

          <Button
            type="button"
            icon={UserCheck}
            onClick={() => {
              const targetEmail =
                replaceLeadEmail || order.teamLeadEmail || activeRoster[0]?.crewEmail
              if (!targetEmail) {
                notify("Add a Ground Crew member to the event roster first.")
                return
              }
              const matched = rosterAndAvailablePool.find(
                (m) => m.email.toLowerCase() === targetEmail.toLowerCase(),
              )
              const res = designateEventTeamLead(actor, {
                eventId: order.eventId,
                newLeadEmail: targetEmail,
                newLeadName: matched?.name || targetEmail,
                reason:
                  replaceReason.trim() ||
                  "Explicitly selected Event Team Lead in Crew & Scheduling.",
              })
              if (!res.ok) notify(res.error)
              else {
                notify(
                  `Confirmed ${matched?.name || targetEmail} as Event Team Lead for ${order.eventTitle}.`,
                )
                setReplaceReason("")
              }
            }}
          >
            Confirm / Replace Event Team Lead
          </Button>

          {/* Working-Lead Capacity & Inherited Production Jobs Breakdown */}
          {order.teamLeadEmail && (
            <div className="rounded-xl border border-line bg-card/60 p-3.5 text-xs space-y-2">
              {(() => {
                const cap = calculateWorkingLeadCapacity(allEventShifts, order.teamLeadEmail)
                return (
                  <>
                    <div className="font-semibold text-foreground">
                      Working-Lead Scheduled Capacity ({order.teamLeadName || order.teamLeadEmail})
                    </div>
                    <div className="text-muted-foreground">
                      • Fabrication Capacity Hours:{" "}
                      <strong className="text-foreground">{cap.plannedFabricationHours}h</strong>{" "}
                      (counts toward job fabrication labor) · Lead Coordination / Event Hours:{" "}
                      <strong className="text-foreground">
                        {cap.plannedCoordinationHours + cap.plannedEventOpsHours}h
                      </strong>
                    </div>
                  </>
                )
              })()}
              {eventJobs.length > 0 && (
                <div className="border-t border-line pt-2 space-y-1">
                  <div className="font-medium text-foreground">
                    Production Jobs Inheriting Lead ({eventJobs.length}):
                  </div>
                  {eventJobs.map((j) => (
                    <div key={j.id} className="text-muted-foreground">
                      • <strong className="text-foreground">{j.spec.name}</strong>: Lead{" "}
                      <strong className="text-foreground">
                        {j.productionLeadName ||
                          j.productionLeadEmail ||
                          j.inheritedLeadName ||
                          "Not selected"}
                      </strong>{" "}
                      ({j.assignmentMode ?? "group"} mode)
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preserved Checkpoint Submitter Attribution & Lead History */}
          {order.teamLeadHistory.length > 0 && (
            <div className="border-t border-line pt-3 text-xs">
              <div className="font-semibold text-foreground">
                Team Lead Audit History ({order.teamLeadHistory.length})
              </div>
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                {order.teamLeadHistory.map((h) => (
                  <li key={h.id}>
                    {h.previousLeadName ? (
                      <>
                        Replaced <strong>{h.previousLeadName}</strong> with{" "}
                        <strong className="text-foreground">{h.newLeadName}</strong>
                      </>
                    ) : (
                      <>
                        Designated <strong className="text-foreground">{h.newLeadName}</strong>
                      </>
                    )}{" "}
                    by {h.changedByName} at {fmtStamp(h.changedAt)} — “{h.reason}”
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* ─── SECTION 2: STRUCTURED ASIA/MANILA WORK SCHEDULING & BREAKS ─── */}
      <div id="schedule-shift-form">
        <Card className="p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-foreground">
                3. Structured Asia/Manila Shift &amp; Break Scheduling
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Schedule production fabrication, lead coordination, or event-operation shifts in{" "}
                <strong className="text-foreground">Asia/Manila (GMT+8)</strong>. Different duties
                (loading, setup, event support, dismantling, returns) keep separate assignments,
                instructions, and completion states; multiple shifts can still be grouped onto the
                same duty assignment.{" "}
                <strong className="text-foreground">
                  Overnight shifts with breaks and designated shared shifts with breaks require
                  explicit Break Start and Break End times.
                </strong>
              </p>
            </div>
            <Badge tone="neutral">{allEventShifts.length} Total Shift Record(s)</Badge>
          </div>

          <div className="grid gap-4 rounded-xl border border-line bg-fg/[0.02] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="1. Shift Scope (Event vs Production Job)">
              <select
                aria-label="Shift Scope"
                className="h-10 w-full rounded-md border border-line bg-card px-3 text-sm text-foreground"
                value={shiftScopeJobId}
                onChange={(e) => {
                  const nextJobId = e.target.value
                  setShiftScopeJobId(nextJobId)
                  setShiftAssignmentTargetId("")
                  if (nextJobId) {
                    setShiftActivityType("fabrication")
                  } else if (shiftActivityType === "fabrication") {
                    setShiftActivityType("setup")
                  }
                }}
              >
                <option value="">Event Operations — {order.eventTitle}</option>
                {eventJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    Production Job: {j.spec.name} ({j.status})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="2. Roster Worker">
              <select
                aria-label="Roster Worker"
                className="h-10 w-full rounded-md border border-line bg-card px-3 text-sm text-foreground"
                value={shiftCrewEmail}
                onChange={(e) => {
                  setShiftCrewEmail(e.target.value)
                  setShiftAssignmentTargetId("")
                }}
              >
                {rosterAndAvailablePool.map((m) => (
                  <option key={m.email} value={m.email}>
                    {m.name} ({m.email}){m.inRoster ? "" : " — Add to roster first"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="3. Duty / Activity Type">
              <select
                aria-label="Activity Type"
                className="h-10 w-full rounded-md border border-line bg-card px-3 text-sm text-foreground"
                value={shiftActivityType}
                onChange={(e) => {
                  setShiftActivityType(e.target.value as ShiftActivityType)
                  setShiftAssignmentTargetId("")
                }}
              >
                {shiftScopeJobId && <option value="fabrication">Fabrication (Counts toward build labor)</option>}
                <option value="lead-coordination">Lead Coordination / Supervision</option>
                <option value="loading">Dispatch Loading Checks</option>
                <option value="transport">Asset Transport</option>
                <option value="setup">Event Setup &amp; Ingress</option>
                <option value="event">Event Hours Support</option>
                <option value="dismantling">Dismantling &amp; Egress</option>
                <option value="returns">Warehouse Return &amp; Audit</option>
              </select>
            </Field>

            <Field label="4. Shift Duties / Instructions">
              <Input
                value={shiftInstructions}
                onChange={(e) => setShiftInstructions(e.target.value)}
                placeholder="Specific instructions for this duty assignment…"
              />
            </Field>

            <div className="sm:col-span-2 lg:col-span-4">
              <Field label="Duty Assignment Target (Multi-Shift Same Duty vs New Assignment)">
                <select
                  aria-label="Duty Assignment Target"
                  className="h-10 w-full rounded-md border border-line bg-card px-3 text-xs text-foreground"
                  value={shiftAssignmentTargetId}
                  onChange={(e) => setShiftAssignmentTargetId(e.target.value)}
                >
                  <option value="">
                    Auto — Link only if same duty phase &amp; matching instructions; otherwise create separate assignment
                  </option>
                  <option value="__new__">
                    Always Create Separate New Duty Assignment
                  </option>
                  {matchingOpenAssignmentsForShiftForm.map((a) => (
                    <option key={a.id} value={a.id}>
                      Add shift to existing {a.phase ?? a.activityType ?? a.kind} assignment ({a.id}): “
                      {a.instructions}”
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="5. Start Date & Time (Asia/Manila)">
              <Input
                aria-label="Start Date and Time"
                type="datetime-local"
                value={shiftStartDateTime}
                onChange={(e) => setShiftStartDateTime(e.target.value)}
              />
            </Field>

            <Field label="6. End Date & Time (Asia/Manila)">
              <Input
                aria-label="End Date and Time"
                type="datetime-local"
                value={shiftEndDateTime}
                onChange={(e) => setShiftEndDateTime(e.target.value)}
              />
            </Field>

            <Field label="7. Break Duration (Minutes, same-day)">
              <Input
                aria-label="Break Duration Minutes"
                type="number"
                min={0}
                step={15}
                value={shiftBreakMinutes}
                onChange={(e) => setShiftBreakMinutes(e.target.value)}
                disabled={Boolean(shiftBreakStart && shiftBreakEnd)}
              />
            </Field>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={shiftIsShared}
                  onChange={(e) => setShiftIsShared(e.target.checked)}
                />
                Designated Shared Shift (Min Simultaneous Crew)
              </label>
              {shiftIsShared && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Min Active Crew:</span>
                  <Input
                    aria-label="Required Simultaneous Crew"
                    type="number"
                    min={2}
                    step={1}
                    value={shiftRequiredSimultaneousCrew}
                    onChange={(e) => setShiftRequiredSimultaneousCrew(e.target.value)}
                    className="h-8 w-20"
                  />
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <Field
                label={
                  requiresExplicitBreakWindow
                    ? "8. Break Start (Required for Overnight / Shared Shift with Break)"
                    : "8. Break Start (Optional for Same-Day Non-Shared Shift)"
                }
              >
                <Input
                  aria-label="Break Start Date and Time"
                  type="datetime-local"
                  value={shiftBreakStart}
                  onChange={(e) => setShiftBreakStart(e.target.value)}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field
                label={
                  requiresExplicitBreakWindow
                    ? "9. Break End (Required for Overnight / Shared Shift with Break)"
                    : "9. Break End (Optional for Same-Day Non-Shared Shift)"
                }
              >
                <Input
                  aria-label="Break End Date and Time"
                  type="datetime-local"
                  value={shiftBreakEnd}
                  onChange={(e) => setShiftBreakEnd(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Live Calculation Preview & Add Shift Action */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4 text-xs">
            <div>
              {liveShiftPreview.ok ? (
                <div className="space-y-0.5">
                  <div className="font-semibold text-foreground">
                    Planned Productive Hours: {liveShiftPreview.plannedProductiveHours}h{" "}
                    {liveShiftPreview.isOvernight ? "(Overnight Shift across Manila midnight)" : ""}
                  </div>
                  <div className="text-muted-foreground">
                    Daily Asia/Manila breakdown:{" "}
                    {Object.entries(liveShiftPreview.dailyProductiveHoursByManilaDate)
                      .map(([d, h]) => `${d}: ${h}h`)
                      .join(" · ")}
                  </div>
                </div>
              ) : (
                <div className="font-medium text-danger">{liveShiftPreview.error}</div>
              )}
            </div>
            <Button
              type="button"
              icon={Plus}
              onClick={() => {
                const matched = rosterAndAvailablePool.find(
                  (m) => m.email.toLowerCase() === shiftCrewEmail.toLowerCase(),
                )
                const res = scheduleWorkerShift(actor, {
                  eventId: order.eventId,
                  jobId: shiftScopeJobId || undefined,
                  assignmentId:
                    shiftAssignmentTargetId && shiftAssignmentTargetId !== "__new__"
                      ? shiftAssignmentTargetId
                      : undefined,
                  createNewAssignment: shiftAssignmentTargetId === "__new__",
                  crewEmail: shiftCrewEmail,
                  crewName: matched?.name || shiftCrewEmail,
                  activityType: shiftActivityType,
                  startDateTime: shiftStartDateTime,
                  endDateTime: shiftEndDateTime,
                  breakMinutes:
                    shiftBreakStart && shiftBreakEnd
                      ? undefined
                      : Number(shiftBreakMinutes) || 0,
                  breakStartDateTime: shiftBreakStart || undefined,
                  breakEndDateTime: shiftBreakEnd || undefined,
                  isSharedShift: shiftIsShared,
                  requiredSimultaneousCrew: shiftIsShared
                    ? Math.max(2, Number(shiftRequiredSimultaneousCrew) || 2)
                    : undefined,
                  instructions: shiftInstructions || undefined,
                })
                if (!res.ok) notify(res.error)
                else {
                  notify(
                    `Scheduled ${res.shift.plannedProductiveHours}h ${res.shift.activityType} shift on assignment ${res.assignment.id} for ${res.shift.crewName || res.shift.crewEmail} (${res.shift.startDateTime} → ${res.shift.endDateTime}).`,
                  )
                  setShiftInstructions("")
                  setShiftAssignmentTargetId("")
                }
              }}
            >
              Add Shift to Schedule
            </Button>
          </div>

          {/* Scheduled & Cancelled Shift History Table */}
          {allEventShifts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No structured Asia/Manila shifts have been scheduled for this event yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 pr-4">Worker</th>
                    <th className="py-2.5 pr-4">Scope &amp; Activity</th>
                    <th className="py-2.5 pr-4">Asia/Manila Window</th>
                    <th className="py-2.5 pr-4">Break</th>
                    <th className="py-2.5 pr-4">Planned Productive Hrs</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs">
                  {allEventShifts.map((s) => {
                    const job = s.jobId ? eventJobs.find((j) => j.id === s.jobId) : undefined
                    const cancelDraft = cancelReasonByShiftId[s.id] ?? ""
                    return (
                      <tr key={s.id}>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-foreground">
                            {s.crewName || s.crewEmail}
                          </div>
                          <div className="text-muted-foreground">{s.crewEmail}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-foreground">
                            {job ? `Job: ${job.spec.name}` : "Event Operations"}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <Badge tone="neutral">{s.activityType}</Badge>
                            {s.isSharedShift && (
                              <Badge tone="info">
                                Shared (Min {s.requiredSimultaneousCrew ?? 2})
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-mono">
                          <div>{s.startDateTime.replace("T", " ")}</div>
                          <div className="text-muted-foreground">
                            → {s.endDateTime.replace("T", " ")}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {s.breakStartDateTime && s.breakEndDateTime ? (
                            <div>
                              <div>{s.breakMinutes}m window</div>
                              <div className="font-mono text-[11px]">
                                {s.breakStartDateTime.slice(11)}–{s.breakEndDateTime.slice(11)}
                              </div>
                            </div>
                          ) : (
                            `${s.breakMinutes} min`
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-bold tabular-nums text-foreground">
                            {s.plannedProductiveHours}h
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {Object.entries(s.dailyProductiveHoursByManilaDate ?? {})
                              .map(([d, h]) => `${d}: ${h}h`)
                              .join(" · ")}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          {s.status === "cancelled" ? (
                            <div className="space-y-0.5">
                              <Badge tone="danger">Cancelled</Badge>
                              {s.cancellationReason && (
                                <div className="text-[11px] text-muted-foreground">
                                  “{s.cancellationReason}”
                                </div>
                              )}
                            </div>
                          ) : (
                            <Badge tone="success">Scheduled</Badge>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {s.status === "scheduled" && (
                            <div className="flex items-center justify-end gap-1.5">
                              <Input
                                value={cancelDraft}
                                onChange={(e) =>
                                  setCancelReasonByShiftId({
                                    ...cancelReasonByShiftId,
                                    [s.id]: e.target.value,
                                  })
                                }
                                placeholder="Cancel reason…"
                                className="h-7 w-32 text-xs"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  const res = cancelScheduledShift(actor, {
                                    eventId: order.eventId,
                                    jobId: s.jobId,
                                    shiftId: s.id,
                                    reason:
                                      cancelDraft.trim() ||
                                      "Shift cancelled in Crew & Scheduling.",
                                  })
                                  if (!res.ok) notify(res.error)
                                  else
                                    notify(
                                      `Cancelled shift ${s.id} (preserved in history; excluded from future capacity).`,
                                    )
                                }}
                                className="h-7 px-2.5 text-xs"
                              >
                                Cancel Shift
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ─── SECTION 3: INDEPENDENT WORKER ASSIGNMENT COMPLETION REVIEW ─── */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">
              4. Worker Contributions, Attendance &amp; Independent Assignment Completion
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Review submitted worker contributions, attendance, and actual productive hours across
              production jobs and event-operation duties.{" "}
              <strong className="text-foreground">
                Warehouse confirms each duty assignment’s completion (Submitted → Completed)
                independently of sibling duties and independently of full asset verification.
              </strong>{" "}
              Approving a finished asset never auto-completes unreviewed worker hours.
            </p>
          </div>
          <Badge tone="neutral">{allAssignmentsWithMeta.length} Worker Assignment(s)</Badge>
        </div>

        {allAssignmentsWithMeta.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No worker assignments recorded on this event’s production jobs or event-operation duties
            yet. Schedule a shift above to create an assignment.
          </p>
        ) : (
          <div className="space-y-3">
            {allAssignmentsWithMeta.map(({ job, assignment, logs, shifts }) => {
              const plannedHrs =
                Math.round(
                  shifts
                    .filter((s) => s.status !== "cancelled")
                    .reduce((sum, s) => sum + s.plannedProductiveHours, 0) * 100,
                ) / 100
              const actualHrs =
                Math.round(
                  logs.reduce((sum, l) => sum + l.actualProductiveHours, 0) * 100,
                ) / 100
              const dutyLabel =
                assignment.phase ??
                assignment.activityType ??
                (assignment.kind === "production" ? "fabrication" : "event-ops")

              return (
                <div
                  key={assignment.id}
                  className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {assignment.id}
                        </span>
                        <span className="font-bold text-sm text-foreground">
                          {assignment.crewName}
                        </span>
                        <span className="text-muted-foreground">({assignment.crewEmail})</span>
                        <Badge tone="neutral">
                          {job ? `Job: ${job.spec.name}` : `Event Duty: ${dutyLabel}`}
                        </Badge>
                        {job && <Badge tone="neutral">Duty: {dutyLabel}</Badge>}
                        <Badge
                          tone={
                            assignment.status === "Completed"
                              ? "success"
                              : assignment.status === "Submitted"
                                ? "info"
                                : "warning"
                          }
                        >
                          Assignment: {assignment.status}
                        </Badge>
                        {assignment.isCorrectionAssignment && (
                          <Badge tone="danger">Correction Rework</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        Instructions: <strong className="text-foreground">{assignment.instructions}</strong>{" "}
                        · Linked Shifts: <strong className="text-foreground">{shifts.length}</strong>{" "}
                        · Planned Hrs: <strong className="text-foreground">{plannedHrs}h</strong>{" "}
                        · Logged Actual Hrs: <strong className="text-foreground">{actualHrs}h</strong>
                        {assignment.progressPercent !== undefined && (
                          <>
                            {" "}· Progress: <strong className="text-foreground">{assignment.progressPercent}%</strong>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {assignment.status === "Completed" ? (
                        <Badge tone="success">
                          Confirmed Completed by {assignment.completedByName || "Warehouse"}
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          icon={CheckCircle2}
                          onClick={() => {
                            const res = confirmWorkerAssignmentCompletion(actor, {
                              eventId: order.eventId,
                              jobId: job?.id,
                              assignmentId: assignment.id,
                            })
                            if (!res.ok) notify(res.error)
                            else
                              notify(
                                `Confirmed worker ${dutyLabel} assignment Completed for ${assignment.crewName}${job ? ` on ${job.spec.name}` : ""}.`,
                              )
                          }}
                          className="h-8 px-3 text-xs"
                        >
                          Confirm Worker Assignment Completed
                        </Button>
                      )}
                    </div>
                  </div>

                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">
                      No attendance or actual-hours contribution logs submitted for this assignment
                      yet.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 border-t border-line pt-2.5">
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          className="rounded-lg border border-line bg-card p-2.5 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">
                              {log.manilaDate} · Attendance: {log.attendance}
                            </span>
                            <Badge tone="info">{log.actualProductiveHours}h actual</Badge>
                          </div>
                          <p className="text-muted-foreground">“{log.contributionSummary}”</p>
                          {log.blockerReason && (
                            <p className="text-danger font-medium">
                              Blocker: “{log.blockerReason}”
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ─── SECTION 4: MIGRATION-REVIEW CONTROLS ─── */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">
              5. Migration-Review Controls &amp; Audit History
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Review flagged legacy records for {order.eventTitle}. Supply missing participants or
              schedules non-circularly, resolve free-text schedules while preserving{" "}
              <code>legacyScheduleText</code>, confirm demo/lead assignments, or correct an
              erroneous legacy status with a required audit reason.
            </p>
          </div>
          <Badge
            tone={
              unresolvedEventFlags.length + unresolvedJobFlags.length > 0 ? "warning" : "success"
            }
          >
            {unresolvedEventFlags.length + unresolvedJobFlags.length} Unresolved Flag(s)
          </Badge>
        </div>

        {unresolvedEventFlags.length === 0 && unresolvedJobFlags.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No unresolved migration review flags on {order.eventTitle}.
          </p>
        ) : (
          <div className="space-y-3">
            {[
              ...unresolvedEventFlags.map((flag) => ({ flag, job: undefined })),
              ...unresolvedJobFlags,
            ].map(({ flag, job }) => {
              const reasonVal = flagReasonById[flag.id] ?? ""
              const statusVal =
                flagNewStatusById[flag.id] ??
                (job?.status === "Unassigned" ||
                  job?.status === "Assigned" ||
                  job?.status === "In Production"
                  ? job.status
                  : "In Production")
              const participantsVal =
                flagParticipantsById[flag.id] ??
                (job?.participantEmails ?? []).join(", ")
              const confirmedLeadVal = flagConfirmedLeadById[flag.id] ?? ""
              const replacementCrewVal = flagReplacementCrewById[flag.id] ?? ""
              const explicitDemoChecked = flagExplicitDemoConfirmById[flag.id] ?? false
              const isVerifyEvidenceFlag =
                flag.code === "LEGACY_APPROVAL_MISSING_EVIDENCE" ||
                flag.code === "LEGACY_EVIDENCE_NO_EXPLICIT_SUBMISSION"
              const isScheduleFlag =
                flag.code === "MISSING_CONFIRMED_SCHEDULE" ||
                flag.code === "UNPARSEABLE_SCHEDULE_TEXT"
              const isParticipantsFlag =
                job &&
                (flag.code === "UNCONFIRMED_PARTICIPANTS" ||
                  flag.code === "DEMO_ACCOUNT_ASSIGNED" ||
                  flag.code === "MIGRATED_CORRECTION_NEEDS_ASSIGNMENT")
              const isAutoLeadFlag = !job && flag.code === "AUTO_DESIGNATED_TEAM_LEAD"
              const isEventDemoFlag = !job && flag.code === "DEMO_ACCOUNT_ASSIGNED"
              const legacyTargetAsg = !job
                ? order.crewAssignments.find((a) => a.id === flag.targetId)
                : undefined

              return (
                <div
                  key={flag.id}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="danger">{flag.code.replace(/_/g, " ")}</Badge>
                        {job && <Badge tone="neutral">Job: {job.spec.name}</Badge>}
                        {flag.blockingActions.length > 0 && (
                          <Badge tone="warning">
                            Blocks: {flag.blockingActions.join(", ")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 font-medium text-foreground">{flag.message}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isScheduleFlag && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (job) {
                              setShiftScopeJobId(job.id)
                              setShiftActivityType("fabrication")
                            } else {
                              setShiftScopeJobId("")
                              setShiftActivityType("setup")
                              if (legacyTargetAsg) {
                                setShiftCrewEmail(legacyTargetAsg.crewEmail)
                              }
                            }
                            document
                              .getElementById("schedule-shift-form")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" })
                            notify(
                              `Pre-filled Section 3 shift scheduler for ${job ? job.spec.name : legacyTargetAsg?.crewName || "this event"}.`,
                            )
                          }}
                          className="h-7 px-2.5 text-xs"
                        >
                          Schedule Affected Worker / Job in Section 3
                        </Button>
                      )}
                      {isVerifyEvidenceFlag && onNavigate && job && (
                        <Button
                          type="button"
                          variant="outline"
                          icon={ArrowRight}
                          onClick={() =>
                            onNavigate("module-verification", {
                              eventId: order.eventId,
                              jobId: job.id,
                              subView: "verification",
                            })
                          }
                          className="h-7 px-2.5 text-xs"
                        >
                          Open in Verification
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 border-t border-amber-500/30 pt-3">
                    {isParticipantsFlag && job && (
                      <Field label="Confirmed Roster Participants (Active Roster Emails)">
                        <Input
                          value={participantsVal}
                          onChange={(e) =>
                            setFlagParticipantsById({
                              ...flagParticipantsById,
                              [flag.id]: e.target.value,
                            })
                          }
                          placeholder={
                            activeRoster.length > 0
                              ? `e.g. ${activeRoster.map((r) => r.crewEmail).join(", ")}`
                              : "Add crew to Event Roster in Section 1 first"
                          }
                        />
                      </Field>
                    )}

                    {isAutoLeadFlag && (
                      <Field label="Select / Confirm Active Roster Member as Event Team Lead">
                        <select
                          aria-label="Confirmed Event Team Lead"
                          className="h-10 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                          value={confirmedLeadVal}
                          onChange={(e) =>
                            setFlagConfirmedLeadById({
                              ...flagConfirmedLeadById,
                              [flag.id]: e.target.value,
                            })
                          }
                        >
                          <option value="">Choose confirmed Team Lead from roster…</option>
                          {activeRoster.map((r) => (
                            <option key={r.crewEmail} value={r.crewEmail}>
                              {r.crewName} ({r.crewEmail})
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}

                    {isEventDemoFlag && (
                      <Field label="Replace Demo Account with Active Roster Member">
                        <select
                          aria-label="Replacement Crew Member"
                          className="h-10 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                          value={replacementCrewVal}
                          onChange={(e) =>
                            setFlagReplacementCrewById({
                              ...flagReplacementCrewById,
                              [flag.id]: e.target.value,
                            })
                          }
                        >
                          <option value="">Select replacement roster member…</option>
                          {activeRoster
                            .filter((r) => r.crewEmail.toLowerCase() !== "crew@demo.com")
                            .map((r) => (
                              <option key={r.crewEmail} value={r.crewEmail}>
                                {r.crewName} ({r.crewEmail})
                              </option>
                            ))}
                        </select>
                      </Field>
                    )}

                    {job && (
                      <Field label="Revert Legacy Status (Cannot Bypass Verification)">
                        <select
                          aria-label="Revert Legacy Status"
                          className="h-10 w-full rounded-md border border-line bg-card px-2.5 text-xs text-foreground"
                          value={statusVal}
                          onChange={(e) =>
                            setFlagNewStatusById({
                              ...flagNewStatusById,
                              [flag.id]: e.target.value as CustomFabricationStatus,
                            })
                          }
                        >
                          <option value="Unassigned">Unassigned</option>
                          <option value="Assigned">Assigned</option>
                          <option value="In Production">In Production</option>
                        </select>
                      </Field>
                    )}

                    <div className={job || isAutoLeadFlag || isEventDemoFlag ? undefined : "sm:col-span-3"}>
                      <Field label="Audit / Resolution Reason (Required)">
                        <Input
                          value={reasonVal}
                          onChange={(e) =>
                            setFlagReasonById({
                              ...flagReasonById,
                              [flag.id]: e.target.value,
                            })
                          }
                          placeholder="Enter resolution reason for audit history…"
                        />
                      </Field>
                    </div>
                  </div>

                  {(flag.code === "DEMO_ACCOUNT_ASSIGNED" || isAutoLeadFlag) && (
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={explicitDemoChecked}
                        onChange={(e) =>
                          setFlagExplicitDemoConfirmById({
                            ...flagExplicitDemoConfirmById,
                            [flag.id]: e.target.checked,
                          })
                        }
                      />
                      <span>
                        I have reviewed this legacy demo/auto assignment and explicitly confirm
                        keeping the selected account if retained.
                      </span>
                    </label>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const emails = participantsVal
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                        const res = resolveMigrationReviewFlag(actor, {
                          eventId: order.eventId,
                          jobId: job?.id,
                          flagId: flag.id,
                          flagCode: flag.code,
                          action:
                            flag.code === "DEMO_ACCOUNT_ASSIGNED" ||
                              flag.code === "AUTO_DESIGNATED_TEAM_LEAD"
                              ? "replaced-demo-or-lead"
                              : "confirmed-data",
                          reason: reasonVal,
                          confirmedParticipantEmails: emails.length > 0 ? emails : undefined,
                          confirmedLeadEmail: confirmedLeadVal || undefined,
                          replacementCrewEmail: replacementCrewVal || undefined,
                          explicitDemoConfirmation: explicitDemoChecked,
                        })
                        if (!res.ok) notify(res.error)
                        else
                          notify(`Resolved migration flag ${flag.code} and recorded audit entry.`)
                      }}
                    >
                      Confirm Data &amp; Resolve Flag
                    </Button>

                    {job && statusVal !== job.status && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const res = resolveMigrationReviewFlag(actor, {
                            eventId: order.eventId,
                            jobId: job.id,
                            flagId: flag.id,
                            flagCode: flag.code,
                            action: "corrected-status",
                            reason: reasonVal,
                            newStatus: statusVal,
                          })
                          if (!res.ok) notify(res.error)
                          else
                            notify(
                              `Corrected legacy job status to ${statusVal} with audit record.`,
                            )
                        }}
                      >
                        Correct Legacy Status to {statusVal}
                      </Button>
                    )}

                    {isVerifyEvidenceFlag && job && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const res = resolveMigrationReviewFlag(actor, {
                            eventId: order.eventId,
                            jobId: job.id,
                            flagId: flag.id,
                            flagCode: flag.code,
                            action: "recorded-historical-exception",
                            reason: reasonVal,
                          })
                          if (!res.ok) notify(res.error)
                          else
                            notify(
                              `Recorded audited historical verification exception for ${job.spec.name}.`,
                            )
                        }}
                      >
                        Record Audited Historical Exception
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {allMigrationAudits.length > 0 && (
          <div className="border-t border-line pt-3 text-xs">
            <div className="font-semibold text-foreground">
              Migration Resolution Audit Log ({allMigrationAudits.length})
            </div>
            <ul className="mt-1.5 space-y-1 text-muted-foreground">
              {allMigrationAudits.map((a) => (
                <li key={a.id}>
                  • <strong>{a.flagCode}</strong> ({a.action}
                  {a.previousStatus && a.newStatus && a.previousStatus !== a.newStatus
                    ? `: ${a.previousStatus} → ${a.newStatus}`
                    : ""}
                  ) by <strong className="text-foreground">{a.resolvedByName}</strong> at{" "}
                  {fmtStamp(a.resolvedAt)} — “{a.reason}”
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* ─── SECTION 5: EVENT ASSIGNMENTS, LEGACY SCHEDULE TEXT & BLOCKERS ─── */}
      <Card className="p-6 space-y-4">
        <h3 className="text-base font-bold text-foreground">
          6. Event Duty Assignments, Legacy Schedule Text &amp; Reported Blockers (
          {order.crewAssignments.length})
        </h3>
        {order.crewAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No event duty assignments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4">Crew Member</th>
                  <th className="py-3 pr-4">Designation</th>
                  <th className="py-3 pr-4">Shift &amp; Schedule (Legacy Text Preserved)</th>
                  <th className="py-3 pr-4">Duties</th>
                  <th className="py-3 pr-4">Task Status &amp; Blocker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {order.crewAssignments.map((a) => {
                  const isLead =
                    order.teamLeadEmail?.toLowerCase() === a.crewEmail.toLowerCase()
                  return (
                    <tr key={a.id}>
                      <td className="py-3.5 pr-4">
                        <div className="font-semibold text-foreground">{a.crewName}</div>
                        <div className="text-xs text-muted-foreground">{a.crewEmail}</div>
                      </td>
                      <td className="py-3.5 pr-4">
                        {isLead ? (
                          <Badge tone="info">Event Team Lead</Badge>
                        ) : (
                          <Badge tone="neutral">Ground Crew</Badge>
                        )}
                      </td>
                      <td className="py-3.5 pr-4 text-xs">
                        <div className="font-medium text-foreground">{a.shiftLabel}</div>
                        <div className="text-muted-foreground">{a.schedule}</div>
                        {a.legacyScheduleText && (
                          <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                            Preserved legacy schedule: “{a.legacyScheduleText}”
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 pr-4 text-xs text-muted-foreground max-w-xs">
                        {a.duties}
                      </td>
                      <td className="py-3.5 pr-4 text-xs">
                        <Badge
                          tone={
                            a.taskStatus === "Completed"
                              ? "success"
                              : a.taskStatus === "Blocked"
                                ? "danger"
                                : a.taskStatus === "InProgress"
                                  ? "info"
                                  : "neutral"
                          }
                        >
                          {a.taskStatus}
                        </Badge>
                        {a.blockerReason && (
                          <div className="mt-1 text-danger font-medium">
                            Blocker: “{a.blockerReason}”
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </>
      )}

      {!embedded && (
        <>
          {/* Crew Directory Modal */}
          <Modal
            open={directoryOpen}
            onClose={() => setDirectoryOpen(false)}
            title={`Crew Directory (${availableCrew.length})`}
          >
            {availableCrew.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Ground Crew accounts found.
              </p>
            ) : (
              <ul className="space-y-2.5 text-xs">
                {availableCrew.map((acc) => {
                  const assignedEvents = state.orderRequests.filter((o) =>
                    (o.eventRoster ?? []).some(
                      (r) => !r.removedAt && r.crewEmail.toLowerCase() === acc.email.toLowerCase(),
                    ),
                  ).length
                  const activeShifts = state.orderRequests.reduce(
                    (sum, o) =>
                      sum +
                      (o.eventSchedules ?? []).filter(
                        (s) =>
                          s.status !== "cancelled" &&
                          s.crewEmail.toLowerCase() === acc.email.toLowerCase(),
                      ).length,
                    0,
                  )
                  return (
                    <li
                      key={acc.email}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-fg/[0.02] p-3"
                    >
                      <div>
                        <div className="font-semibold text-foreground">{acc.name}</div>
                        <div className="text-muted-foreground">
                          {acc.email} · Ground Crew
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral">
                          {assignedEvents} event(s) · {activeShifts} shift(s)
                        </Badge>
                        <Badge tone="success">{acc.status}</Badge>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Modal>

          {/* Assign Event Crew Modal */}
          <Modal
            open={assignModalOpen}
            onClose={() => setAssignModalOpen(false)}
            title="Assign Event Crew"
          >
            <div className="space-y-4 text-xs">
              <Field label="Target Approved Event">
                <select
                  aria-label="Target Approved Event"
                  className="h-10 w-full rounded-md border border-line bg-elev px-3 text-sm text-foreground"
                  value={assignTargetEventId}
                  onChange={(e) => setAssignTargetEventId(e.target.value)}
                >
                  {state.orderRequests.map((o) => (
                    <option key={o.eventId} value={o.eventId}>
                      {o.eventTitle} ({o.id})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Ground Crew Account">
                <select
                  aria-label="Ground Crew Account"
                  className="h-10 w-full rounded-md border border-line bg-elev px-3 text-sm text-foreground"
                  value={assignCrewEmail}
                  onChange={(e) => setAssignCrewEmail(e.target.value)}
                >
                  {availableCrew.map((c) => (
                    <option key={c.email} value={c.email}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Custom Roster Name (optional)">
                <Input
                  value={assignCustomName}
                  onChange={(e) => setAssignCustomName(e.target.value)}
                  placeholder="Uses selected account name if blank"
                />
              </Field>

              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={assignMakeLead}
                  onChange={(e) => setAssignMakeLead(e.target.checked)}
                />
                Designate as Event Team Lead
              </label>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (assignTargetEventId) {
                      setSelectedEventId(assignTargetEventId)
                      setStaffingEventOpen(true)
                    }
                    setAssignModalOpen(false)
                  }}
                >
                  Open Full Scheduling
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!assignTargetEventId || !assignCrewEmail) return
                    const matched = availableCrew.find((c) => c.email === assignCrewEmail)
                    const resolvedName =
                      assignCustomName.trim() || matched?.name || assignCrewEmail
                    const res = addCrewToEventRoster(actor, {
                      eventId: assignTargetEventId,
                      crewEmail: assignCrewEmail,
                      crewName: resolvedName,
                    })
                    if (!res.ok) {
                      notify(res.error)
                      return
                    }
                    if (assignMakeLead) {
                      const leadRes = designateEventTeamLead(actor, {
                        eventId: assignTargetEventId,
                        newLeadEmail: assignCrewEmail,
                        newLeadName: resolvedName,
                        reason: "Designated via Assign Event Crew.",
                      })
                      if (!leadRes.ok) {
                        notify(leadRes.error)
                        return
                      }
                    }
                    setSelectedEventId(assignTargetEventId)
                    setAssignModalOpen(false)
                    notify(`${resolvedName} assigned to event roster.`)
                  }}
                >
                  Assign to Event Roster
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}
