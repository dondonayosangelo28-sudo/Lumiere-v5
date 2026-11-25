import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Hammer,
  Lock,
  MapPin,
  Play,
  RotateCcw,
  SearchCheck,
  Send,
  Truck,
} from "lucide-react"
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui/ui"
import { fmtStamp } from "../event-manager/shared"
import {
  getEventManifestLines,
  recordWorkerContributionAndHours,
  setOperationsNavigationContext,
  startProductionWorkerAssignment,
  submitDailyGroupProgressReport,
  updateCrewTaskExecutionStatus,
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../operations/store"
import {
  EventSelectorHeader,
  getManilaTodayDateString,
  getWorkerProductionJobs,
  getWorkerRelevantOrders,
  notifyMutationResult,
  useNotify,
} from "./ground-crew-shared"

type ContributionDraft = {
  draftLogId?: string
  shiftId?: string
  manilaDate: string
  attendance: "Present" | "Partial" | "Absent"
  hours: string
  progress: string
  summary: string
  blockerReason: string
  photoUrl: string
}

export default function AssignedWorkModule({
  actor,
  onNavigate,
  initialEventId,
}: {
  actor: OpsActor
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
  initialEventId?: string
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const email = actor.email.trim().toLowerCase()
  const relevantOrders = getWorkerRelevantOrders(state, email)

  const [selectedEventId, setSelectedEventId] = useState(
    () => initialEventId || relevantOrders[0]?.eventId || "",
  )
  const [blockerInputs, setBlockerInputs] = useState<Record<string, string>>({})
  const [contribDrafts, setContribDrafts] = useState<Record<string, ContributionDraft>>({})
  const [selectedEntryIdByAsg, setSelectedEntryIdByAsg] = useState<Record<string, string>>({})
  const [groupDrafts, setGroupDrafts] = useState<
    Record<string, { manilaDate: string; summary: string; photoUrl: string }>
  >({})

  useEffect(() => {
    if (
      initialEventId &&
      relevantOrders.some((o) => o.eventId === initialEventId)
    ) {
      setSelectedEventId(initialEventId)
    }
  }, [initialEventId, relevantOrders])

  if (relevantOrders.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={["Dashboard", "My Work"]}
          title="My Work"
          subtitle="Your scheduled production jobs, event operation shifts, and Team Lead checkpoints."
        />
        <Card className="p-8 text-center space-y-2">
          <p className="text-base font-semibold text-foreground">
            No assigned events or scheduled work yet
          </p>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Warehouse Operations Manager adds Ground Crew members to an Event Crew Group roster and
            assigns production jobs or event-operation shifts in Crew &amp; Scheduling / Production.
            Only your own assignments appear here.
          </p>
        </Card>
      </div>
    )
  }

  const order =
    relevantOrders.find((o) => o.eventId === selectedEventId) ?? relevantOrders[0]
  if (!order) return null

  const isActiveOnRoster = (order.eventRoster ?? []).some(
    (r) => r.crewEmail.toLowerCase() === email && !r.removedAt,
  )
  const isEventTeamLead = order.teamLeadEmail?.toLowerCase() === email

  // Filter strictly to signed-in worker's own production jobs, duties, and legacy assignments
  const myProductionJobs = getWorkerProductionJobs(state, order.eventId, email)
  const myEventDuties = (order.eventAssignments ?? []).filter(
    (a) => a.crewEmail.toLowerCase() === email,
  )
  const myLegacyAssignments = order.crewAssignments.filter(
    (a) => a.crewEmail.toLowerCase() === email,
  )

  const totalActionableCount =
    myProductionJobs.length + myEventDuties.length + myLegacyAssignments.length
  const manifestLines = getEventManifestLines(state, order.eventId)
  const defaultManilaDate =
    order.startDateTime.slice(0, 10) || getManilaTodayDateString()

  const resolveContributionState = (
    asgId: string,
    assignmentLogs: typeof state.fabricationJobs[number]["contributions"],
    fallbackHours = "8",
    fallbackProgress = "0",
    fallbackBlocker = "",
  ) => {
    const savedLogs = (assignmentLogs ?? []).filter(
      (c) => c.assignmentId === asgId && c.crewEmail.toLowerCase() === email && c.status === "Saved",
    )
    const explicitSelection = selectedEntryIdByAsg[asgId]
    let activeSelection = "__new__"
    let activeSavedLog = undefined

    if (explicitSelection === "__new__") {
      activeSelection = "__new__"
    } else if (explicitSelection && savedLogs.some((s) => s.id === explicitSelection)) {
      activeSelection = explicitSelection
      activeSavedLog = savedLogs.find((s) => s.id === explicitSelection)
    } else if (savedLogs.length === 1) {
      activeSelection = savedLogs[0].id
      activeSavedLog = savedLogs[0]
    } else if (savedLogs.length > 1) {
      activeSelection = "__choose__"
    }

    const draftKey = `${asgId}::${activeSelection}`
    const draft: ContributionDraft =
      contribDrafts[draftKey] ??
      (activeSavedLog
        ? {
            draftLogId: activeSavedLog.id,
            shiftId: activeSavedLog.shiftId,
            manilaDate: activeSavedLog.manilaDate,
            attendance: activeSavedLog.attendance,
            hours: String(activeSavedLog.actualProductiveHours),
            progress: String(activeSavedLog.progressPercent ?? fallbackProgress),
            summary: activeSavedLog.contributionSummary,
            blockerReason: activeSavedLog.blockerReason ?? "",
            photoUrl: activeSavedLog.photoUrls[0] ?? "",
          }
        : {
            manilaDate: defaultManilaDate,
            attendance: "Present",
            hours: fallbackHours,
            progress: fallbackProgress,
            summary: "",
            blockerReason: fallbackBlocker,
            photoUrl: "",
          })

    return {
      savedLogs,
      activeSelection,
      draftKey,
      draft,
      mustChooseSavedEntry: activeSelection === "__choose__",
    }
  }

  const updateDraft = (draftKey: string, patch: Partial<ContributionDraft>, base: ContributionDraft) => {
    setContribDrafts((prev) => ({
      ...prev,
      [draftKey]: { ...base, ...patch },
    }))
  }

  const startNewSeparateEntry = (asgId: string, defaultHours = "2", defaultProgress = "0") => {
    const newKey = `${asgId}::__new__`
    setSelectedEntryIdByAsg((prev) => ({ ...prev, [asgId]: "__new__" }))
    setContribDrafts((prev) => ({
      ...prev,
      [newKey]: {
        draftLogId: undefined,
        manilaDate: defaultManilaDate,
        attendance: "Present",
        hours: defaultHours,
        progress: defaultProgress,
        summary: "",
        blockerReason: "",
        photoUrl: "",
      },
    }))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "My Work"]}
        title="My Work"
        subtitle="Review your own production and event assignments, record hours & contributions, submit finished builds, and execute event checkpoints."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              icon={Truck}
              onClick={() =>
                onNavigate("module-my-work", {
                  eventId: order.eventId,
                  groundCrewOperation: "loading",
                })
              }
            >
              Loading Checks
            </Button>
            <Button
              type="button"
              variant="outline"
              icon={MapPin}
              onClick={() =>
                onNavigate("module-my-work", {
                  eventId: order.eventId,
                  groundCrewOperation: "venue-arrival",
                })
              }
            >
              Venue Arrival
            </Button>
            <Button
              type="button"
              variant="outline"
              icon={Camera}
              onClick={() =>
                onNavigate("module-my-work", {
                  eventId: order.eventId,
                  groundCrewOperation: "evidence",
                })
              }
            >
              Evidence Capture
            </Button>
            <Button
              type="button"
              variant="outline"
              icon={SearchCheck}
              onClick={() =>
                onNavigate("module-my-work", {
                  eventId: order.eventId,
                  groundCrewOperation: "return-audit",
                })
              }
            >
              Return Audit
            </Button>
          </div>
        }
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={(id) => {
          setSelectedEventId(id)
          setOperationsNavigationContext({ eventId: id }, { merge: true })
        }}
      />

      {/* Distinguish Roster Membership vs Scheduled Assignments */}
      {isActiveOnRoster && totalActionableCount === 0 && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
          <strong className="font-semibold">
            Roster Member — No Scheduled Assignments Yet:
          </strong>{" "}
          You are on the active Event Crew Group roster for <strong>{order.eventTitle}</strong>
          {isEventTeamLead ? " (designated Team Lead)" : ""}, but Warehouse has not assigned a
          production job or scheduled event-operation shift to you yet.
        </Card>
      )}

      {/* 1. My Production Assignments */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground">
              My Production Assignments — {order.eventTitle} ({myProductionJobs.length})
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Start assigned production tasks, log your own Asia/Manila hours &amp; progress
              independently, and submit completed individual contributions for Warehouse review.
            </p>
          </div>
        </div>

        {myProductionJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isActiveOnRoster
              ? "You are on the event roster, with no custom production jobs assigned to you on this event yet."
              : "No custom production jobs are assigned to you for this event."}
          </p>
        ) : (
          <div className="space-y-4">
            {myProductionJobs.map((job) => {
              const mode = job.assignmentMode ?? "group"
              const leadEmail = (
                job.productionLeadEmail ??
                job.inheritedLeadEmail ??
                ""
              ).toLowerCase()
              const isLead = leadEmail === email
              const leadLabel =
                job.productionLeadName ||
                job.productionLeadEmail ||
                job.inheritedLeadName ||
                "Not assigned"
              const myAssignments = (job.assignments ?? []).filter(
                (a) => a.crewEmail.toLowerCase() === email,
              )
              const myContributions = (job.contributions ?? []).filter(
                (c) => c.crewEmail.toLowerCase() === email,
              )
              const activeCorrections = (job.correctionRequests ?? []).filter(
                (c) =>
                  !c.resolvedAt &&
                  c.responsibleCrewEmails.some((e) => e.toLowerCase() === email),
              )
              const groupReports = job.groupProgressReports ?? []
              const gDraft = groupDrafts[job.id] ?? {
                manilaDate: defaultManilaDate,
                summary: "",
                photoUrl: "/event-manager-images/corporate.jpg",
              }

              return (
                <div
                  key={job.id}
                  className="rounded-xl border border-line bg-fg/[0.02] p-4 sm:p-5 space-y-4 text-xs"
                >
                  {/* Job Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-muted-foreground">{job.id}</span>
                        <Badge
                          tone={
                            job.status === "Ready to Load"
                              ? "success"
                              : job.status === "Awaiting Verification"
                                ? "info"
                                : "warning"
                          }
                        >
                          {job.status}
                        </Badge>
                        <Badge tone="neutral">
                          {mode === "group" ? "Group Mode" : "Individual Mode"}
                        </Badge>
                        {isLead && <Badge tone="info">Production Lead</Badge>}
                      </div>
                      <h4 className="text-sm font-bold text-foreground">{job.spec.name}</h4>
                      <p className="text-muted-foreground">
                        Qty:{" "}
                        <strong className="text-foreground">{job.spec.requestedQty}</strong> (
                        {job.estimateBasis === "complete-set" ? "complete set" : "per unit"}) ·
                        Lead: <strong className="text-foreground">{leadLabel}</strong> ·
                        Window:{" "}
                        <strong className="text-foreground">
                          {job.productionWindow?.confirmed
                            ? `${job.productionWindow.startDate} → ${job.productionWindow.deadlineDate}`
                            : "Not configured"}
                        </strong>
                      </p>
                      <p className="text-muted-foreground">
                        Spec: {job.spec.dimensions} · {job.spec.materials} · Finish:{" "}
                        {job.spec.finish}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      icon={Hammer}
                      onClick={() =>
                        onNavigate("module-my-work", {
                          eventId: order.eventId,
                          jobId: job.id,
                          groundCrewOperation: "evidence",
                        })
                      }
                    >
                      Open Job Evidence &amp; Submission
                    </Button>
                  </div>

                  {/* Targeted Correction Alert */}
                  {activeCorrections.length > 0 && job.status !== "Ready to Load" && (
                    <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 space-y-1 text-danger">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>
                          Correction Requested — Explicit Resubmission Required (
                          {activeCorrections.length})
                        </span>
                      </div>
                      {activeCorrections.map((corr) => (
                        <div key={corr.id} className="text-foreground">
                          • <strong>Round {corr.round}:</strong> {corr.explanation}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Signed-in Worker's Individual Assignments on this Job */}
                  {myAssignments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line p-3 text-muted-foreground">
                      You are listed on this job{isLead ? " as Production Lead" : " as a participant"},
                      with no individual scheduled assignment record created for you yet. Use{" "}
                      <strong>Open Job Evidence &amp; Submission</strong> when ready to upload work
                      or submit finished work.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myAssignments.map((asg) => {
                        const myShifts = (job.schedules ?? []).filter(
                          (s) => s.assignmentId === asg.id,
                        )
                        const isLocked =
                          asg.status === "Completed" ||
                          asg.status === "Submitted" ||
                          order.warehouseClosed
                        const firstScheduledShift = myShifts.find(
                          (s) => s.status === "scheduled",
                        )
                        const {
                          savedLogs,
                          activeSelection,
                          draftKey,
                          draft,
                          mustChooseSavedEntry,
                        } = resolveContributionState(
                          asg.id,
                          myContributions,
                          firstScheduledShift
                            ? String(firstScheduledShift.plannedProductiveHours)
                            : "8",
                          String(asg.progressPercent ?? 0),
                          asg.blockerReason ?? "",
                        )

                        return (
                          <div
                            key={asg.id}
                            className="rounded-lg border border-line bg-card p-3.5 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {asg.id}
                                  </span>
                                  <Badge
                                    tone={
                                      asg.status === "Completed"
                                        ? "success"
                                        : asg.status === "Submitted"
                                          ? "info"
                                          : asg.status === "In Progress"
                                            ? "warning"
                                            : "neutral"
                                    }
                                  >
                                    {asg.status}
                                  </Badge>
                                  {asg.isCorrectionAssignment && (
                                    <Badge tone="danger">Correction Assignment</Badge>
                                  )}
                                  {asg.blockerReason && (
                                    <Badge tone="danger">Blocker: {asg.blockerReason}</Badge>
                                  )}
                                </div>
                                <p className="text-foreground">
                                  <strong>Instructions:</strong> {asg.instructions}
                                </p>
                              </div>

                              {asg.status === "Assigned" && !order.warehouseClosed && (
                                <Button
                                  type="button"
                                  icon={Play}
                                  onClick={() => {
                                    const res = startProductionWorkerAssignment(actor, {
                                      jobId: job.id,
                                      assignmentId: asg.id,
                                    })
                                    notifyMutationResult(
                                      notify,
                                      res,
                                      `Started assignment ${asg.id} for ${job.spec.name}.`,
                                    )
                                  }}
                                >
                                  Start Production Assignment
                                </Button>
                              )}
                            </div>

                            {myShifts.length > 0 && (
                              <ul className="space-y-1 text-[11px] text-muted-foreground border-t border-line pt-2">
                                {myShifts.map((s) => (
                                  <li key={s.id} className="font-mono">
                                    • {s.startDateTime.replace("T", " ")} →{" "}
                                    {s.endDateTime.replace("T", " ")} (
                                    {s.plannedProductiveHours}h productive · {s.breakMinutes}m
                                    break · {s.status})
                                  </li>
                                ))}
                              </ul>
                            )}

                            {asg.status === "Completed" && (
                              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-[#4ade80]">
                                <Lock className="size-3.5 shrink-0" />
                                <span>
                                  Warehouse confirmed <strong>Completed</strong> by{" "}
                                  <strong>{asg.completedByName || "Warehouse"}</strong>
                                  {asg.completedAt ? ` at ${fmtStamp(asg.completedAt)}` : ""}.
                                  {asg.completionNotes ? ` Notes: “${asg.completionNotes}”` : ""}
                                </span>
                              </div>
                            )}

                            {asg.status === "Submitted" && (
                              <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-foreground">
                                Your contribution has been <strong>Submitted</strong>
                                {asg.submittedAt ? ` (${fmtStamp(asg.submittedAt)})` : ""} and is
                                awaiting independent Warehouse completion confirmation.
                              </div>
                            )}

                            {!isLocked && (
                              <div className="space-y-2.5 border-t border-line pt-3">
                                {savedLogs.length > 0 && (
                                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] items-end rounded-md border border-line bg-fg/[0.02] p-2.5">
                                    <Field label={`Saved Contribution Entry (${savedLogs.length})`}>
                                      <select
                                        aria-label="Saved contribution entry"
                                        className="h-9 w-full rounded-md border border-line bg-elev px-2.5 text-xs text-foreground"
                                        value={activeSelection}
                                        onChange={(e) =>
                                          setSelectedEntryIdByAsg((prev) => ({
                                            ...prev,
                                            [asg.id]: e.target.value,
                                          }))
                                        }
                                      >
                                        {savedLogs.length > 1 && (
                                          <option value="__choose__">
                                            Select a saved entry to edit or submit…
                                          </option>
                                        )}
                                        {savedLogs.map((sl) => (
                                          <option key={sl.id} value={sl.id}>
                                            {sl.manilaDate} · {sl.actualProductiveHours}h —{" "}
                                            {sl.contributionSummary.slice(0, 48)}
                                          </option>
                                        ))}
                                        <option value="__new__">+ New Separate Entry</option>
                                      </select>
                                    </Field>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() =>
                                        startNewSeparateEntry(
                                          asg.id,
                                          "2",
                                          String(asg.progressPercent ?? 0),
                                        )
                                      }
                                    >
                                      New Separate Entry
                                    </Button>
                                  </div>
                                )}
                                {mustChooseSavedEntry && (
                                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                                    Multiple saved entries exist for this assignment. Select one
                                    above to edit/finalize it, or choose New Separate Entry.
                                  </div>
                                )}
                                <div className="grid gap-2 sm:grid-cols-4">
                                  <Field label="Asia/Manila Date">
                                    <Input
                                      type="date"
                                      value={draft.manilaDate}
                                      onChange={(e) =>
                                        updateDraft(draftKey, { manilaDate: e.target.value }, draft)
                                      }
                                    />
                                  </Field>
                                  <Field label="Attendance">
                                    <select
                                      aria-label="Attendance"
                                      className="h-10 w-full rounded-md border border-line bg-elev px-2.5 text-xs text-foreground"
                                      value={draft.attendance}
                                      onChange={(e) =>
                                        updateDraft(
                                          draftKey,
                                          {
                                            attendance: e.target.value as
                                              | "Present"
                                              | "Partial"
                                              | "Absent",
                                          },
                                          draft,
                                        )
                                      }
                                    >
                                      <option value="Present">Present</option>
                                      <option value="Partial">Partial</option>
                                      <option value="Absent">Absent</option>
                                    </select>
                                  </Field>
                                  <Field label="Actual Productive Hours">
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.5}
                                      value={draft.hours}
                                      onChange={(e) =>
                                        updateDraft(draftKey, { hours: e.target.value }, draft)
                                      }
                                    />
                                  </Field>
                                  <Field label="Progress (%)">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={draft.progress}
                                      onChange={(e) =>
                                        updateDraft(draftKey, { progress: e.target.value }, draft)
                                      }
                                    />
                                  </Field>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                  <Field label="Personal Contribution Notes">
                                    <Input
                                      value={draft.summary}
                                      onChange={(e) =>
                                        updateDraft(draftKey, { summary: e.target.value }, draft)
                                      }
                                      placeholder="Work completed, welds, assembly, or rework steps…"
                                    />
                                  </Field>
                                  <Field label="Blocker Reason (Optional)">
                                    <Input
                                      value={draft.blockerReason}
                                      onChange={(e) =>
                                        updateDraft(
                                          draftKey,
                                          { blockerReason: e.target.value },
                                          draft,
                                        )
                                      }
                                      placeholder="Missing hardware, curing delay, tool issue…"
                                    />
                                  </Field>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={mustChooseSavedEntry}
                                    onClick={() => {
                                      const res = recordWorkerContributionAndHours(actor, {
                                        contributionId: draft.draftLogId,
                                        eventId: order.eventId,
                                        jobId: job.id,
                                        assignmentId: asg.id,
                                        shiftId: draft.shiftId ?? firstScheduledShift?.id,
                                        manilaDate: draft.manilaDate,
                                        attendance: draft.attendance,
                                        actualProductiveHours: Number(draft.hours) || 0,
                                        contributionSummary:
                                          draft.summary.trim() || "Recorded daily fabrication progress.",
                                        progressPercent: Number(draft.progress) || 0,
                                        blockerReason: draft.blockerReason,
                                        photoUrls: draft.photoUrl.trim() ? [draft.photoUrl.trim()] : [],
                                        markContributionSubmitted: false,
                                      })
                                      if (res.ok) {
                                        const savedId = res.log.id
                                        setSelectedEntryIdByAsg((prev) => ({
                                          ...prev,
                                          [asg.id]: savedId,
                                        }))
                                        setContribDrafts((prev) => {
                                          const next = { ...prev }
                                          delete next[`${asg.id}::__new__`]
                                          next[`${asg.id}::${savedId}`] = {
                                            ...draft,
                                            draftLogId: savedId,
                                            shiftId: res.log.shiftId,
                                          }
                                          return next
                                        })
                                      }
                                      notifyMutationResult(
                                        notify,
                                        res,
                                        `Saved daily hours (${draft.hours}h) for ${job.spec.name}.`,
                                      )
                                    }}
                                  >
                                    Save Daily Hours &amp; Contribution
                                  </Button>
                                  <Button
                                    type="button"
                                    icon={Send}
                                    disabled={mustChooseSavedEntry}
                                    onClick={() => {
                                      const res = recordWorkerContributionAndHours(actor, {
                                        contributionId: draft.draftLogId,
                                        eventId: order.eventId,
                                        jobId: job.id,
                                        assignmentId: asg.id,
                                        shiftId: draft.shiftId ?? firstScheduledShift?.id,
                                        manilaDate: draft.manilaDate,
                                        attendance: draft.attendance,
                                        actualProductiveHours: Number(draft.hours) || 0,
                                        contributionSummary:
                                          draft.summary.trim() ||
                                          "Completed my assigned production contribution.",
                                        progressPercent: 100,
                                        blockerReason: draft.blockerReason,
                                        photoUrls: draft.photoUrl.trim() ? [draft.photoUrl.trim()] : [],
                                        markContributionSubmitted: true,
                                      })
                                      if (res.ok) {
                                        setSelectedEntryIdByAsg((prev) => {
                                          const next = { ...prev }
                                          delete next[asg.id]
                                          return next
                                        })
                                        setContribDrafts((prev) => {
                                          const next = { ...prev }
                                          delete next[draftKey]
                                          return next
                                        })
                                      }
                                      notifyMutationResult(
                                        notify,
                                        res,
                                        `Submitted your contribution for ${job.spec.name}; awaiting Warehouse completion review.`,
                                      )
                                    }}
                                  >
                                    Submit My Contribution
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Lead Group Daily Progress Report (separate from individual personal hours) */}
                  {mode === "group" && isLead && !order.warehouseClosed && (
                    <div className="rounded-lg border border-line bg-fg/[0.03] p-3.5 space-y-2.5">
                      <div className="font-semibold text-foreground">
                        Group Daily Progress Report (Production Lead Only — Separate from Personal Hours)
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
                        <Field label="Asia/Manila Date">
                          <Input
                            type="date"
                            value={gDraft.manilaDate}
                            onChange={(e) =>
                              setGroupDrafts((prev) => ({
                                ...prev,
                                [job.id]: { ...gDraft, manilaDate: e.target.value },
                              }))
                            }
                          />
                        </Field>
                        <Field label="Group Progress Summary">
                          <Input
                            value={gDraft.summary}
                            onChange={(e) =>
                              setGroupDrafts((prev) => ({
                                ...prev,
                                [job.id]: { ...gDraft, summary: e.target.value },
                              }))
                            }
                            placeholder="Overall team build status for today…"
                          />
                        </Field>
                        <Field label="Group Photo URL">
                          <Input
                            value={gDraft.photoUrl}
                            onChange={(e) =>
                              setGroupDrafts((prev) => ({
                                ...prev,
                                [job.id]: { ...gDraft, photoUrl: e.target.value },
                              }))
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const res = submitDailyGroupProgressReport(actor, {
                              eventId: order.eventId,
                              jobId: job.id,
                              manilaDate: gDraft.manilaDate,
                              summary: gDraft.summary,
                              photoUrls: gDraft.photoUrl.trim() ? [gDraft.photoUrl.trim()] : [],
                            })
                            notifyMutationResult(
                              notify,
                              res,
                              `Recorded Group Daily Progress Report for ${job.spec.name}.`,
                            )
                            if (res.ok) {
                              setGroupDrafts((prev) => ({
                                ...prev,
                                [job.id]: { ...gDraft, summary: "" },
                              }))
                            }
                          }}
                        >
                          Submit Group Report
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Personal Logged Hours vs Group Reports */}
                  {(myContributions.length > 0 || groupReports.length > 0) && (
                    <div className="grid gap-3 md:grid-cols-2 text-[11px]">
                      {myContributions.length > 0 && (
                        <div className="rounded border border-line bg-card p-2.5 space-y-1">
                          <div className="font-semibold text-foreground">
                            My Recorded Hours &amp; Logs ({myContributions.length})
                          </div>
                          {myContributions.map((c) => (
                            <div key={c.id} className="text-muted-foreground">
                              • {c.manilaDate} · {c.attendance} ({c.actualProductiveHours}h) — “
                              {c.contributionSummary}”
                            </div>
                          ))}
                        </div>
                      )}
                      {groupReports.length > 0 && (
                        <div className="rounded border border-line bg-card p-2.5 space-y-1">
                          <div className="font-semibold text-foreground">
                            Group Daily Progress Reports ({groupReports.length})
                          </div>
                          {groupReports.map((r) => (
                            <div key={r.id} className="text-muted-foreground">
                              • {r.manilaDate} by {r.submittedByLeadName} — “{r.summary}”
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* 2. My Event-Operation Assignments & Scheduled Duties */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-foreground">
                My Event Assignments &amp; Shift Duties — {order.eventTitle}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Venue: <strong className="text-foreground">{order.venue}</strong> · Event Window:{" "}
                <strong className="text-foreground">
                  {order.startDateTime.replace("T", " ")} – {order.endDateTime.replace("T", " ")}
                </strong>
              </p>
            </div>
          </div>

          {myEventDuties.length > 0 && (
            <div className="space-y-3 border-b border-line pb-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                My Scheduled Event-Operation Duties ({myEventDuties.length})
              </div>
              {myEventDuties.map((asg) => {
                const linkedShifts = (order.eventSchedules ?? []).filter(
                  (s) => s.assignmentId === asg.id,
                )
                const dutyLogs = (order.eventContributions ?? []).filter(
                  (c) => c.assignmentId === asg.id && c.crewEmail.toLowerCase() === email,
                )
                const dutyLabel = asg.phase ?? asg.activityType ?? "event-ops"
                const firstShift = linkedShifts.find((s) => s.status === "scheduled")
                const {
                  savedLogs: savedDutyLogs,
                  activeSelection: activeDutySelection,
                  draftKey: dutyDraftKey,
                  draft,
                  mustChooseSavedEntry: mustChooseDutyEntry,
                } = resolveContributionState(
                  asg.id,
                  dutyLogs,
                  firstShift ? String(firstShift.plannedProductiveHours) : "8",
                  String(asg.progressPercent ?? 0),
                  asg.blockerReason ?? "",
                )
                const dutyLocked =
                  asg.status === "Completed" ||
                  asg.status === "Submitted" ||
                  order.warehouseClosed

                return (
                  <div
                    key={asg.id}
                    className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {asg.id}
                          </span>
                          <span className="font-bold text-sm text-foreground">
                            {asg.crewName}
                          </span>
                          <Badge tone="neutral">Duty: {dutyLabel}</Badge>
                          <Badge
                            tone={
                              asg.status === "Completed"
                                ? "success"
                                : asg.status === "Submitted"
                                  ? "info"
                                  : "warning"
                            }
                          >
                            {asg.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          Instructions:{" "}
                          <strong className="text-foreground">{asg.instructions}</strong> · Linked
                          Shifts: <strong className="text-foreground">{linkedShifts.length}</strong>{" "}
                          · My Logs: <strong className="text-foreground">{dutyLogs.length}</strong>
                        </p>
                      </div>
                    </div>

                    {linkedShifts.length > 0 && (
                      <ul className="space-y-1 text-[11px] text-muted-foreground">
                        {linkedShifts.map((s) => (
                          <li key={s.id} className="font-mono">
                            • {s.startDateTime.replace("T", " ")} →{" "}
                            {s.endDateTime.replace("T", " ")} ({s.plannedProductiveHours}h ·{" "}
                            {s.breakMinutes}m break · {s.status})
                          </li>
                        ))}
                      </ul>
                    )}

                    {asg.status === "Completed" && (
                      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-[#4ade80]">
                        <Lock className="size-3.5 shrink-0" />
                        <span>
                          Warehouse confirmed <strong>Completed</strong> by{" "}
                          <strong>{asg.completedByName || "Warehouse"}</strong>
                          {asg.completedAt ? ` at ${fmtStamp(asg.completedAt)}` : ""}.
                        </span>
                      </div>
                    )}

                    {asg.status === "Submitted" && (
                      <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-foreground">
                        Duty contribution <strong>Submitted</strong> — awaiting Warehouse
                        completion confirmation.
                      </div>
                    )}

                    {!dutyLocked && (
                      <div className="space-y-2 border-t border-line pt-2.5">
                        {savedDutyLogs.length > 0 && (
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] items-end rounded-md border border-line bg-fg/[0.02] p-2.5">
                            <Field label={`Saved Duty Entry (${savedDutyLogs.length})`}>
                              <select
                                aria-label="Saved duty entry"
                                className="h-9 w-full rounded-md border border-line bg-elev px-2.5 text-xs text-foreground"
                                value={activeDutySelection}
                                onChange={(e) =>
                                  setSelectedEntryIdByAsg((prev) => ({
                                    ...prev,
                                    [asg.id]: e.target.value,
                                  }))
                                }
                              >
                                {savedDutyLogs.length > 1 && (
                                  <option value="__choose__">
                                    Select a saved entry to edit or submit…
                                  </option>
                                )}
                                {savedDutyLogs.map((sl) => (
                                  <option key={sl.id} value={sl.id}>
                                    {sl.manilaDate} · {sl.actualProductiveHours}h —{" "}
                                    {sl.contributionSummary.slice(0, 48)}
                                  </option>
                                ))}
                                <option value="__new__">+ New Separate Entry</option>
                              </select>
                            </Field>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                startNewSeparateEntry(
                                  asg.id,
                                  "2",
                                  String(asg.progressPercent ?? 0),
                                )
                              }
                            >
                              New Separate Entry
                            </Button>
                          </div>
                        )}
                        {mustChooseDutyEntry && (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                            Multiple saved entries exist for this duty. Select one above to
                            edit/finalize it, or choose New Separate Entry.
                          </div>
                        )}
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Field label="Asia/Manila Date">
                            <Input
                              type="date"
                              value={draft.manilaDate}
                              onChange={(e) =>
                                updateDraft(dutyDraftKey, { manilaDate: e.target.value }, draft)
                              }
                            />
                          </Field>
                          <Field label="Actual Hours">
                            <Input
                              aria-label="Actual hours"
                              type="number"
                              min={0}
                              step={0.5}
                              value={draft.hours}
                              onChange={(e) =>
                                updateDraft(dutyDraftKey, { hours: e.target.value }, draft)
                              }
                            />
                          </Field>
                          <Field label="Duty Summary">
                            <Input
                              aria-label="Duty summary"
                              value={draft.summary}
                              onChange={(e) =>
                                updateDraft(dutyDraftKey, { summary: e.target.value }, draft)
                              }
                              placeholder={`Log ${dutyLabel} duty notes…`}
                            />
                          </Field>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={mustChooseDutyEntry}
                            onClick={() => {
                              const manilaDate =
                                draft.manilaDate ||
                                firstShift?.startDateTime.slice(0, 10) ||
                                defaultManilaDate
                              const res = recordWorkerContributionAndHours(actor, {
                                contributionId: draft.draftLogId,
                                eventId: order.eventId,
                                assignmentId: asg.id,
                                shiftId: draft.shiftId ?? firstShift?.id,
                                manilaDate,
                                attendance: "Present",
                                actualProductiveHours: Number(draft.hours) || 0,
                                contributionSummary:
                                  draft.summary.trim() || `Logged ${dutyLabel} duty hours.`,
                                progressPercent: 50,
                                markContributionSubmitted: false,
                              })
                              if (res.ok) {
                                const savedId = res.log.id
                                setSelectedEntryIdByAsg((prev) => ({
                                  ...prev,
                                  [asg.id]: savedId,
                                }))
                                setContribDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[`${asg.id}::__new__`]
                                  next[`${asg.id}::${savedId}`] = {
                                    ...draft,
                                    draftLogId: savedId,
                                    shiftId: res.log.shiftId,
                                  }
                                  return next
                                })
                              }
                              notifyMutationResult(
                                notify,
                                res,
                                `Saved ${dutyLabel} duty hours (${draft.hours}h).`,
                              )
                            }}
                          >
                            Save Duty Hours
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={mustChooseDutyEntry}
                            onClick={() => {
                              const manilaDate =
                                draft.manilaDate ||
                                firstShift?.startDateTime.slice(0, 10) ||
                                defaultManilaDate
                              const res = recordWorkerContributionAndHours(actor, {
                                contributionId: draft.draftLogId,
                                eventId: order.eventId,
                                assignmentId: asg.id,
                                shiftId: draft.shiftId ?? firstShift?.id,
                                manilaDate,
                                attendance: "Present",
                                actualProductiveHours: Number(draft.hours) || 0,
                                contributionSummary:
                                  draft.summary.trim() ||
                                  `Completed ${dutyLabel} duty per instructions.`,
                                progressPercent: 100,
                                markContributionSubmitted: true,
                              })
                              if (res.ok) {
                                setSelectedEntryIdByAsg((prev) => {
                                  const next = { ...prev }
                                  delete next[asg.id]
                                  return next
                                })
                                setContribDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[dutyDraftKey]
                                  return next
                                })
                              }
                              notifyMutationResult(
                                notify,
                                res,
                                `Submitted ${dutyLabel} duty (${asg.id}) for Warehouse completion review.`,
                              )
                            }}
                          >
                            Submit Duty
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {myLegacyAssignments.length === 0 && myEventDuties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isActiveOnRoster
                ? "You are on the event roster, with no scheduled event-operation duties assigned to you yet."
                : "No event-operation assignments assigned to you on this event yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {myLegacyAssignments.map((asg) => {
                const blockerText = blockerInputs[asg.id] ?? ""
                const taskLocked = asg.taskStatus === "Completed" || order.warehouseClosed
                return (
                  <div
                    key={asg.id}
                    className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-foreground">{asg.crewName}</span>
                          <span className="text-xs text-muted-foreground">({asg.crewEmail})</span>
                          {isEventTeamLead && <Badge tone="info">Designated Team Lead</Badge>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          <strong>{asg.shiftLabel}</strong> · {asg.schedule}
                        </div>
                      </div>
                      <Badge
                        tone={
                          asg.taskStatus === "Completed"
                            ? "success"
                            : asg.taskStatus === "Blocked"
                              ? "danger"
                              : asg.taskStatus === "InProgress"
                                ? "info"
                                : "neutral"
                        }
                      >
                        {asg.taskStatus}
                      </Badge>
                    </div>

                    <p className="text-xs text-foreground">
                      <strong>Duties:</strong> {asg.duties}
                    </p>

                    {asg.blockerReason && (
                      <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                        <strong>Reported Blocker:</strong> “{asg.blockerReason}” (Visible in
                        Warehouse → Crew &amp; Scheduling)
                      </div>
                    )}

                    {!taskLocked && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                        {asg.taskStatus === "Assigned" && (
                          <Button
                            type="button"
                            icon={Play}
                            onClick={() => {
                              const res = updateCrewTaskExecutionStatus(actor, {
                                eventId: order.eventId,
                                assignmentId: asg.id,
                                status: "InProgress",
                              })
                              notifyMutationResult(
                                notify,
                                res,
                                `Started task for ${asg.crewName}.`,
                              )
                            }}
                          >
                            Start Task
                          </Button>
                        )}
                        {asg.taskStatus === "Blocked" && (
                          <Button
                            type="button"
                            icon={RotateCcw}
                            onClick={() => {
                              const res = updateCrewTaskExecutionStatus(actor, {
                                eventId: order.eventId,
                                assignmentId: asg.id,
                                status: "InProgress",
                              })
                              notifyMutationResult(
                                notify,
                                res,
                                `Resumed work for ${asg.crewName}.`,
                              )
                            }}
                          >
                            Resume Work
                          </Button>
                        )}
                        {asg.taskStatus !== "Completed" && (
                          <Button
                            type="button"
                            variant="outline"
                            icon={CheckCircle2}
                            onClick={() => {
                              const res = updateCrewTaskExecutionStatus(actor, {
                                eventId: order.eventId,
                                assignmentId: asg.id,
                                status: "Completed",
                              })
                              notifyMutationResult(
                                notify,
                                res,
                                `Marked task Completed for ${asg.crewName}.`,
                              )
                            }}
                          >
                            Mark Task Complete
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Contextual Event Operation Shortcuts */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Event Operations:
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          onNavigate("module-my-work", {
                            eventId: order.eventId,
                            groundCrewOperation: "loading",
                          })
                        }
                      >
                        1. Loading Checks
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          onNavigate("module-my-work", {
                            eventId: order.eventId,
                            groundCrewOperation: "venue-arrival",
                          })
                        }
                      >
                        2. Venue Arrival
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          onNavigate("module-my-work", {
                            eventId: order.eventId,
                            groundCrewOperation: "evidence",
                          })
                        }
                      >
                        3. Evidence Capture
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          onNavigate("module-my-work", {
                            eventId: order.eventId,
                            groundCrewOperation: "return-audit",
                          })
                        }
                      >
                        4. Return Audit
                      </Button>
                    </div>

                    {!taskLocked && (
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] pt-1">
                        <Input
                          value={blockerText}
                          onChange={(e) =>
                            setBlockerInputs({ ...blockerInputs, [asg.id]: e.target.value })
                          }
                          placeholder="Reason for blocker (e.g. venue freight elevator locked, missing hardware)…"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          icon={AlertTriangle}
                          onClick={() => {
                            const res = updateCrewTaskExecutionStatus(actor, {
                              eventId: order.eventId,
                              assignmentId: asg.id,
                              status: "Blocked",
                              blockerReason: blockerText,
                            })
                            notifyMutationResult(
                              notify,
                              res,
                              "Blocker reported to Warehouse Operations Manager.",
                            )
                            if (res.ok) {
                              setBlockerInputs({ ...blockerInputs, [asg.id]: "" })
                            }
                          }}
                        >
                          Report Blocker
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* 3. Event Dispatch Manifest & Checkpoint Summary */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-foreground">
              Event Dispatch Manifest ({manifestLines.length} lines)
            </h3>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onNavigate("module-my-work", {
                  eventId: order.eventId,
                  groundCrewOperation: "loading",
                })
              }
            >
              Open Loading Checks
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge tone={order.loadingChecklist ? "success" : "warning"}>
              Loading Checklist: {order.loadingChecklist ? "Submitted" : "Pending"}
            </Badge>
            <Badge tone={order.outboundDeparture ? "success" : "neutral"}>
              Departure: {order.outboundDeparture ? "Departed" : "Staged"}
            </Badge>
            <Badge tone={order.venueArrival ? "success" : "warning"}>
              Venue Arrival: {order.venueArrival ? "Confirmed" : "Pending"}
            </Badge>
            <Badge tone={order.returnChecklist ? "success" : "warning"}>
              Return Checklist: {order.returnChecklist ? "Submitted" : "Pending"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Assets transported by Ground Crew. Direct-to-venue rentals are verified separately at
            Venue Arrival.
          </p>
          <ul className="divide-y divide-line text-xs">
            {manifestLines.map((line) => (
              <li key={line.lineId} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-foreground">{line.name}</div>
                  <div className="text-muted-foreground">
                    {line.code} · {line.category}
                  </div>
                </div>
                <Badge tone={line.loadedQty >= line.plannedQty ? "success" : "warning"}>
                  {line.loadedQty}/{line.plannedQty} {line.unit}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

export { AssignedWorkModule }
