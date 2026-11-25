import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react"
import { Badge, Button, Card, Field, Input, PageHeader } from "../../../components/ui/ui"
import { Visual, fmtStamp, textareaCls } from "../../event-manager/shared"
import {
  approveProductionJobFinishedWork,
  requestProductionJobCorrections,
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../../operations/store"
import { notifyMutationResult, useNotify } from "../warehouse-shared"

type VerifyChecklistDraft = {
  fullQuantityFinished: boolean
  matchesClientApprovedSpec: boolean
  correctionsResolved: boolean
  notes: string
}

type CorrectionDraft = {
  open: boolean
  explanation: string
  referencePhotoUrl: string
  responsibleWorkers: string[]
  includeAdditionalShift: boolean
  shiftCrewEmail: string
  shiftStartDateTime: string
  shiftEndDateTime: string
  shiftBreakMinutes: string
  shiftBreakStart: string
  shiftBreakEnd: string
}

export default function VerificationWorkspaceModule({
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

  const [search, setSearch] = useState("")
  const [focusedJobId, setFocusedJobId] = useState<string>(initialJobId ?? "")
  const [statusFilter, setStatusFilter] = useState<
    "awaiting" | "ready" | "all"
  >(() => (initialJobId ? "all" : "awaiting"))

  const [checklistByJob, setChecklistByJob] = useState<Record<string, VerifyChecklistDraft>>({})
  const [correctionByJob, setCorrectionByJob] = useState<Record<string, CorrectionDraft>>({})

  useEffect(() => {
    if (initialJobId !== undefined) {
      setFocusedJobId(initialJobId)
      if (initialJobId) setStatusFilter("all")
    }
  }, [initialJobId])

  const getChecklist = (jobId: string): VerifyChecklistDraft =>
    checklistByJob[jobId] ?? {
      fullQuantityFinished: false,
      matchesClientApprovedSpec: false,
      correctionsResolved: false,
      notes: "",
    }

  const updateChecklist = (
    jobId: string,
    patch: Partial<VerifyChecklistDraft>,
  ) => {
    setChecklistByJob((prev) => ({
      ...prev,
      [jobId]: { ...getChecklist(jobId), ...patch },
    }))
  }

  const getCorrectionDraft = (
    job: (typeof state.fabricationJobs)[number],
  ): CorrectionDraft => {
    if (correctionByJob[job.id]) return correctionByJob[job.id]
    const participants =
      job.participantEmails && job.participantEmails.length > 0
        ? job.participantEmails
        : job.assignedCrewEmails
    const defaultWorker = participants[0] || job.productionLeadEmail || ""
    return {
      open: false,
      explanation: "",
      referencePhotoUrl: "",
      responsibleWorkers: defaultWorker ? [defaultWorker.toLowerCase()] : [],
      includeAdditionalShift: false,
      shiftCrewEmail: defaultWorker.toLowerCase(),
      shiftStartDateTime: "2026-04-20T08:00",
      shiftEndDateTime: "2026-04-20T12:00",
      shiftBreakMinutes: "0",
      shiftBreakStart: "",
      shiftBreakEnd: "",
    }
  }

  const updateCorrectionDraft = (
    job: (typeof state.fabricationJobs)[number],
    patch: Partial<CorrectionDraft>,
  ) => {
    setCorrectionByJob((prev) => ({
      ...prev,
      [job.id]: { ...getCorrectionDraft(job), ...patch },
    }))
  }

  const q = search.trim().toLowerCase()
  const eventScopedJobs = embedded
    ? state.fabricationJobs.filter((job) => Boolean(initialEventId) && job.eventId === initialEventId)
    : state.fabricationJobs
  const searchFilteredJobs = eventScopedJobs.filter((job) => {
    if (!q) return true
    const order = state.orderRequests.find((o) => o.eventId === job.eventId)
    return `${job.eventTitle} ${order?.id ?? ""} ${job.id} ${job.spec.name}`
      .toLowerCase()
      .includes(q)
  })

  const visibleJobs = searchFilteredJobs
    .filter((job) => {
      if (statusFilter === "awaiting") return job.status === "Awaiting Verification"
      if (statusFilter === "ready") return job.status === "Ready to Load"
      return true
    })
    .slice()
    .sort((a, b) => {
      if (focusedJobId) {
        if (a.id === focusedJobId && b.id !== focusedJobId) return -1
        if (b.id === focusedJobId && a.id !== focusedJobId) return 1
      }
      const rank = (s: string) =>
        s === "Awaiting Verification" ? 0 : s === "In Production" ? 1 : 2
      return rank(a.status) - rank(b.status)
    })

  const awaitingCount = searchFilteredJobs.filter(
    (j) => j.status === "Awaiting Verification",
  ).length
  const readyCount = searchFilteredJobs.filter(
    (j) => j.status === "Ready to Load",
  ).length

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          crumbs={["Dashboard", "Verification"]}
          title="Verification"
          subtitle="Inspect submitted custom builds against client-approved specifications and full required quantities, enforce the 3-point Warehouse verification checklist, or request targeted corrections."
        />
      )}

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={statusFilter === "awaiting" ? "solid" : "outline"}
            onClick={() => setStatusFilter("awaiting")}
          >
            Awaiting Verification ({awaitingCount})
          </Button>
          <Button
            type="button"
            variant={statusFilter === "ready" ? "solid" : "outline"}
            onClick={() => setStatusFilter("ready")}
          >
            Ready to Load ({readyCount})
          </Button>
          <Button
            type="button"
            variant={statusFilter === "all" ? "solid" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            All Production Jobs ({searchFilteredJobs.length})
          </Button>
        </div>

        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search event title, order ID, or job name..."
            aria-label="Search verification jobs"
            className="pl-9"
          />
        </div>
      </div>

      {visibleJobs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {statusFilter === "awaiting"
            ? "No production jobs are currently Awaiting Verification."
            : "No production jobs match the current filter."}
        </Card>
      ) : (
        <div className="space-y-6">
          {visibleJobs.map((job) => {
            const order = state.orderRequests.find((o) => o.eventId === job.eventId)
            const activeRoster = (order?.eventRoster ?? []).filter((r) => !r.removedAt)
            const submissions = job.submissions ?? []
            const latestSubmission = submissions[submissions.length - 1]
            const corrections = job.correctionRequests ?? []
            const linkedPhotos = state.afterShiftPhotos.filter((p) =>
              job.linkedShiftPhotoIds.includes(p.id),
            )
            const unresolvedFlags = (job.migrationReviewFlags ?? []).filter((f) => !f.resolvedAt)
            const blockingApproveFlags = unresolvedFlags.filter(
              (f) => f.blockingActions.includes("approve") || f.blockingActions.includes("loading-signoff"),
            )

            const checklist = getChecklist(job.id)
            const corrDraft = getCorrectionDraft(job)
            const isFocused = focusedJobId === job.id

            const ownershipRuleText =
              (job.assignmentMode ?? "group") === "group"
                ? "Group work: Designated or inherited Production Lead submits finished work."
                : (job.participantEmails?.length ?? 0) > 1
                  ? "Multi-worker Individual work: Designated or inherited Production Lead submits complete job."
                  : "Single-worker Individual work: Single assigned worker submits (Warehouse verifies and never submits)."

            const candidateResponsible: { email: string; name: string }[] = Array.from(
              new Map<string, { email: string; name: string }>([
                ...activeRoster.map(
                  (r) =>
                    [
                      r.crewEmail.toLowerCase(),
                      { email: r.crewEmail.toLowerCase(), name: r.crewName },
                    ] as const,
                ),
                ...(job.participantEmails ?? []).map(
                  (e) =>
                    [
                      e.toLowerCase(),
                      { email: e.toLowerCase(), name: e },
                    ] as const,
                ),
              ]).values(),
            )

            return (
              <Card
                key={job.id}
                className={`p-6 space-y-5 ${isFocused ? "ring-2 ring-fg/30" : ""}`}
              >
                {/* Job Header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{job.id}</span>
                      <Badge tone="neutral">Event: {job.eventTitle}</Badge>
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
                      {job.releasedForLoading && (
                        <Badge tone="info">Released on Dispatch Manifest</Badge>
                      )}
                      {latestSubmission?.isCorrectionResubmission && (
                        <Badge tone="info">Correction Resubmission (Round {latestSubmission.round})</Badge>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-lg font-bold text-foreground">{job.spec.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ownershipRuleText}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {onNavigate && (
                      <Button
                        type="button"
                        variant="outline"
                        icon={ArrowRight}
                        onClick={() =>
                          onNavigate("module-dispatch-returns", {
                            eventId: job.eventId,
                            subView: "dispatch",
                          })
                        }
                      >
                        Open Dispatch Manifest
                      </Button>
                    )}
                  </div>
                </div>

                {/* Migration Review Blocker Notice */}
                {unresolvedFlags.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <ShieldAlert className="size-4 shrink-0" />
                        <span>
                          Migration Review Safeguards Active ({unresolvedFlags.length} unresolved)
                        </span>
                      </div>
                      {unresolvedFlags.map((f) => (
                        <div key={f.id}>
                          • <strong>{f.code.replace(/_/g, " ")}:</strong> {f.message}
                        </div>
                      ))}
                    </div>
                    {onNavigate && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          onNavigate("module-crew-scheduling", {
                            eventId: job.eventId,
                            jobId: job.id,
                            subView: "crew",
                          })
                        }
                        className="h-7 px-2.5 text-xs"
                      >
                        Resolve in Crew &amp; Scheduling
                      </Button>
                    )}
                  </div>
                )}

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Left: Client-Approved Spec + Contributions + Photos + Corrections History */}
                  <div className="space-y-4 text-xs">
                    <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-foreground">
                          1. Client-Approved Specifications &amp; Full Quantity
                        </span>
                        <Badge tone="neutral">Required Qty: {job.spec.requestedQty}</Badge>
                      </div>
                      <div className="flex items-start gap-3">
                        <Visual
                          src={job.spec.referenceImages[0] || "/event-manager-images/garden.jpg"}
                          label={job.spec.name}
                          className="size-20 shrink-0 rounded-lg"
                        />
                        <div className="grid gap-1.5 sm:grid-cols-2 flex-1">
                          <div>
                            <span className="text-muted-foreground">Required Qty:</span>{" "}
                            <strong className="text-foreground">{job.spec.requestedQty}</strong>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Dimensions:</span>{" "}
                            <strong className="text-foreground">{job.spec.dimensions}</strong>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Materials:</span>{" "}
                            <strong className="text-foreground">{job.spec.materials}</strong>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Colors:</span>{" "}
                            <strong className="text-foreground">{job.spec.colors}</strong>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-muted-foreground">Finish:</span>{" "}
                            <strong className="text-foreground">{job.spec.finish}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-line pt-2">
                        <span className="font-semibold text-foreground">Build Instructions:</span>
                        <p className="mt-1 text-muted-foreground">{job.spec.buildInstructions}</p>
                      </div>
                    </div>

                    {/* Contributions & Daily Shift Photos */}
                    <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-2.5">
                      <div className="font-bold text-sm text-foreground">
                        2. Worker Contributions ({(job.contributions ?? []).length}) &amp; Shift Photos ({linkedPhotos.length})
                      </div>
                      {(job.contributions ?? []).length === 0 ? (
                        <p className="text-muted-foreground">No worker contribution hour logs recorded.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(job.contributions ?? []).map((c) => (
                            <div key={c.id} className="rounded border border-line bg-card p-2">
                              <span className="font-semibold text-foreground">{c.crewName}</span> ·{" "}
                              {c.manilaDate} · {c.attendance} ({c.actualProductiveHours}h) — “
                              {c.contributionSummary}”
                            </div>
                          ))}
                        </div>
                      )}
                      {linkedPhotos.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2 pt-1">
                          {linkedPhotos.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-start gap-2 rounded border border-line bg-card p-2"
                            >
                              <Visual
                                src={p.photoUrl}
                                label={p.caption}
                                className="size-12 shrink-0 rounded"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground">{p.shiftLabel}</div>
                                {p.isLegacyImportedEvidence && (
                                  <Badge tone="warning">Legacy Shift Photo</Badge>
                                )}
                                <div className="text-muted-foreground line-clamp-2">
                                  “{p.caption}”
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Correction Requests & Previous Submissions */}
                    {(corrections.length > 0 || submissions.length > 1) && (
                      <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-2">
                        <div className="font-bold text-sm text-foreground">
                          Submission &amp; Correction Audit Trail
                        </div>
                        {submissions.map((sub) => (
                          <div key={sub.id} className="rounded border border-line bg-card p-2">
                            <div className="font-semibold text-foreground">
                              Submission Round {sub.round} · Qty {sub.completedQty}/
                              {job.spec.requestedQty}
                              {sub.isCorrectionResubmission ? " (Resubmission)" : ""}
                            </div>
                            <div className="text-muted-foreground">
                              By {sub.submittedByName} ({sub.submittedByEmail}) at{" "}
                              {fmtStamp(sub.submittedAt)}: “{sub.summary}”
                            </div>
                          </div>
                        ))}
                        {corrections.map((corr) => (
                          <div
                            key={corr.id}
                            className="rounded border border-danger/30 bg-danger/10 p-2"
                          >
                            <div className="font-semibold text-danger">
                              Correction Round {corr.round} (
                              {corr.resolvedAt ? "Resubmitted" : "Open"}) — By{" "}
                              {corr.requestedByName} at {fmtStamp(corr.requestedAt)}
                            </div>
                            <div className="text-foreground">“{corr.explanation}”</div>
                            <div className="text-muted-foreground">
                              Responsible Crew: {corr.responsibleCrewEmails.join(", ")} ·{" "}
                              {corr.createdAssignmentIds.length} correction assignment(s)
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: Latest Finished-Work Submission + 3-Point Checklist + Request Corrections */}
                  <div className="space-y-4 text-xs">
                    <div className="rounded-xl border border-line bg-fg/[0.02] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-foreground">
                          3. Latest Finished-Work Submission
                        </span>
                        {latestSubmission ? (
                          <Badge tone="info">Round {latestSubmission.round}</Badge>
                        ) : job.approval?.isHistoricalException ? (
                          <Badge tone="warning">Audited Historical Exception</Badge>
                        ) : (
                          <Badge tone="danger">No Explicit Submission</Badge>
                        )}
                      </div>

                      {latestSubmission ? (
                        <div className="rounded-lg border border-line bg-card p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              Submitted by{" "}
                              <strong className="text-foreground">
                                {latestSubmission.submittedByName}
                              </strong>{" "}
                              ({latestSubmission.submittedByEmail})
                            </span>
                            <span className="text-muted-foreground">
                              {fmtStamp(latestSubmission.submittedAt)}
                            </span>
                          </div>
                          <div>
                            Submitted Quantity:{" "}
                            <strong
                              className={
                                latestSubmission.completedQty === job.spec.requestedQty
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-danger"
                              }
                            >
                              {latestSubmission.completedQty} / {job.spec.requestedQty} required
                            </strong>
                          </div>
                          <p className="text-muted-foreground">“{latestSubmission.summary}”</p>
                          <div className="flex flex-wrap gap-2">
                            {latestSubmission.photoUrls.map((url, idx) => (
                              <Visual
                                key={`${latestSubmission.id}-p-${idx}`}
                                src={url}
                                label={`Submission photo ${idx + 1}`}
                                className="size-16 rounded-md"
                              />
                            ))}
                          </div>
                        </div>
                      ) : job.approval?.isHistoricalException ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-foreground">
                          <strong>Documented Historical Exception:</strong> “
                          {job.approval.historicalExceptionReason}”
                        </div>
                      ) : (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-muted-foreground">
                          Awaiting explicit finished-work submission for full required quantity (
                          {job.spec.requestedQty}). Uploaded progress photos or partial counts
                          cannot approve this job Ready to Load.
                        </div>
                      )}

                      {/* Status = Ready to Load OR Verification Action Workbench */}
                      {job.status === "Ready to Load" ? (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1 text-foreground">
                          <div className="font-bold text-emerald-700 dark:text-[#4ade80]">
                            Approved Ready to Load (Released to Dispatch Manifest)
                          </div>
                          <div>
                            Verified by{" "}
                            <strong>{job.verifiedByName || job.approval?.verifiedByName}</strong> at{" "}
                            {(job.verifiedAt || job.approval?.verifiedAt) &&
                              fmtStamp(job.verifiedAt || job.approval!.verifiedAt)}
                          </div>
                          <div>Notes: “{job.verificationNotes || job.approval?.notes}”</div>
                          {job.approval?.checklist && (
                            <div className="text-[11px] text-muted-foreground">
                              Checklist Confirmed: Full Qty ✓ · Client Spec ✓ · Corrections Resolved ✓
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 border-t border-line pt-3">
                          <div className="font-bold text-foreground">
                            Warehouse 3-Point Verification Checklist (Required)
                          </div>
                          <label className="flex items-start gap-2 rounded-lg border border-line bg-card p-2.5">
                            <input
                              type="checkbox"
                              checked={checklist.fullQuantityFinished}
                              onChange={(e) =>
                                updateChecklist(job.id, {
                                  fullQuantityFinished: e.target.checked,
                                })
                              }
                            />
                            <span>
                              1. Full required quantity (
                              <strong className="text-foreground">{job.spec.requestedQty}</strong>) is
                              finished and passes inspection together.
                            </span>
                          </label>
                          <label className="flex items-start gap-2 rounded-lg border border-line bg-card p-2.5">
                            <input
                              type="checkbox"
                              checked={checklist.matchesClientApprovedSpec}
                              onChange={(e) =>
                                updateChecklist(job.id, {
                                  matchesClientApprovedSpec: e.target.checked,
                                })
                              }
                            />
                            <span>
                              2. Physical build, materials, colors, finish, and dimensions match
                              client-approved specifications.
                            </span>
                          </label>
                          <label className="flex items-start gap-2 rounded-lg border border-line bg-card p-2.5">
                            <input
                              type="checkbox"
                              checked={checklist.correctionsResolved}
                              onChange={(e) =>
                                updateChecklist(job.id, {
                                  correctionsResolved: e.target.checked,
                                })
                              }
                            />
                            <span>
                              3. All requested corrections are resolved (if any were requested).
                            </span>
                          </label>

                          <Field label="Warehouse Inspection Notes">
                            <Input
                              value={checklist.notes}
                              onChange={(e) =>
                                updateChecklist(job.id, { notes: e.target.value })
                              }
                              placeholder="Inspection findings, finish confirmation, or notes…"
                            />
                          </Field>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              icon={CheckCircle2}
                              disabled={
                                job.status !== "Awaiting Verification" ||
                                blockingApproveFlags.length > 0
                              }
                              onClick={() => {
                                const res = approveProductionJobFinishedWork(actor, job.id, {
                                  checklist: {
                                    fullQuantityFinished: checklist.fullQuantityFinished,
                                    matchesClientApprovedSpec: checklist.matchesClientApprovedSpec,
                                    correctionsResolved: checklist.correctionsResolved,
                                  },
                                  notes: checklist.notes,
                                })
                                notifyMutationResult(
                                  notify,
                                  res,
                                  `Approved ${job.spec.name} (${job.spec.requestedQty} required) Ready to Load and updated event dispatch manifest.`,
                                )
                              }}
                            >
                              Approve Finished Work (Ready to Load)
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              icon={RotateCcw}
                              disabled={
                                job.status !== "Awaiting Verification" ||
                                Boolean(order?.warehouseClosed)
                              }
                              onClick={() =>
                                updateCorrectionDraft(job, { open: !corrDraft.open })
                              }
                            >
                              {corrDraft.open
                                ? "Close Correction Form"
                                : "Request Corrections"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Request Corrections Panel */}
                    {corrDraft.open &&
                      job.status === "Awaiting Verification" &&
                      !order?.warehouseClosed && (
                      <div className="rounded-xl border border-danger/40 bg-danger/[0.05] p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-danger">
                          <AlertTriangle className="size-4 shrink-0" />
                          <span>Request Targeted Corrections (Returns Job to In Production)</span>
                        </div>
                        <p className="text-muted-foreground">
                          Keeps corrections inside this same job, creates rework assignments only
                          for selected workers (in <strong>Assigned</strong> state until started),
                          and preserves unaffected completed contributions &amp; earlier submissions.
                        </p>

                        <Field label="Required Correction Explanation">
                          <textarea
                            className={textareaCls}
                            rows={2}
                            value={corrDraft.explanation}
                            onChange={(e) =>
                              updateCorrectionDraft(job, { explanation: e.target.value })
                            }
                            placeholder="Describe exactly what must be reworked or fixed against the client spec…"
                          />
                        </Field>

                        <Field label="Optional Reference Photo URL">
                          <Input
                            value={corrDraft.referencePhotoUrl}
                            onChange={(e) =>
                              updateCorrectionDraft(job, { referencePhotoUrl: e.target.value })
                            }
                            placeholder="/event-manager-images/planning.jpg"
                          />
                        </Field>

                        <div className="space-y-1.5">
                          <div className="font-semibold text-foreground">
                            Select Responsible Worker(s) from Roster / Participants
                          </div>
                          {candidateResponsible.length === 0 ? (
                            <p className="text-danger">
                              Add Ground Crew members to the event roster in Crew &amp; Scheduling
                              first.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {candidateResponsible.map((m) => {
                                const checked = corrDraft.responsibleWorkers.includes(m.email)
                                return (
                                  <label
                                    key={m.email}
                                    className="flex items-center gap-1.5 rounded border border-line bg-card px-2.5 py-1"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const next = e.target.checked
                                          ? [...corrDraft.responsibleWorkers, m.email]
                                          : corrDraft.responsibleWorkers.filter((x) => x !== m.email)
                                        updateCorrectionDraft(job, {
                                          responsibleWorkers: next,
                                          shiftCrewEmail: next.includes(corrDraft.shiftCrewEmail)
                                            ? corrDraft.shiftCrewEmail
                                            : next[0] || "",
                                        })
                                      }}
                                    />
                                    <span className="text-foreground">{m.name}</span>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        <div className="border-t border-line pt-2.5 space-y-2">
                          <label className="flex items-center gap-2 font-semibold text-foreground">
                            <input
                              type="checkbox"
                              checked={corrDraft.includeAdditionalShift}
                              onChange={(e) =>
                                updateCorrectionDraft(job, {
                                  includeAdditionalShift: e.target.checked,
                                })
                              }
                            />
                            Also schedule additional Asia/Manila rework shift (checks overlaps &amp; breaks)
                          </label>
                          {corrDraft.includeAdditionalShift && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Field label="Responsible Shift Worker">
                                <select
                                  aria-label="Responsible Shift Worker"
                                  className="h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-foreground"
                                  value={
                                    corrDraft.responsibleWorkers.includes(corrDraft.shiftCrewEmail)
                                      ? corrDraft.shiftCrewEmail
                                      : corrDraft.responsibleWorkers[0] || ""
                                  }
                                  disabled={corrDraft.responsibleWorkers.length === 0}
                                  onChange={(e) =>
                                    updateCorrectionDraft(job, {
                                      shiftCrewEmail: e.target.value,
                                    })
                                  }
                                >
                                  {corrDraft.responsibleWorkers.length === 0 ? (
                                    <option value="">
                                      Select responsible worker(s) above first…
                                    </option>
                                  ) : (
                                    candidateResponsible
                                      .filter((m) =>
                                        corrDraft.responsibleWorkers.includes(m.email),
                                      )
                                      .map((m) => (
                                        <option key={m.email} value={m.email}>
                                          {m.name} ({m.email})
                                        </option>
                                      ))
                                  )}
                                </select>
                              </Field>
                              <Field label="Same-Day Break (Min)">
                                <Input
                                  type="number"
                                  min={0}
                                  value={corrDraft.shiftBreakMinutes}
                                  onChange={(e) =>
                                    updateCorrectionDraft(job, {
                                      shiftBreakMinutes: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Start (Asia/Manila)">
                                <Input
                                  type="datetime-local"
                                  value={corrDraft.shiftStartDateTime}
                                  onChange={(e) =>
                                    updateCorrectionDraft(job, {
                                      shiftStartDateTime: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="End (Asia/Manila)">
                                <Input
                                  type="datetime-local"
                                  value={corrDraft.shiftEndDateTime}
                                  onChange={(e) =>
                                    updateCorrectionDraft(job, {
                                      shiftEndDateTime: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const res = requestProductionJobCorrections(actor, {
                                jobId: job.id,
                                explanation: corrDraft.explanation,
                                referencePhotoUrls: corrDraft.referencePhotoUrl.trim()
                                  ? [corrDraft.referencePhotoUrl.trim()]
                                  : [],
                                responsibleCrewEmails: corrDraft.responsibleWorkers,
                                additionalShifts: corrDraft.includeAdditionalShift
                                  ? [
                                      {
                                        crewEmail: corrDraft.responsibleWorkers.includes(
                                          corrDraft.shiftCrewEmail,
                                        )
                                          ? corrDraft.shiftCrewEmail
                                          : corrDraft.responsibleWorkers[0] || "",
                                        startDateTime: corrDraft.shiftStartDateTime,
                                        endDateTime: corrDraft.shiftEndDateTime,
                                        breakMinutes:
                                          corrDraft.shiftBreakStart && corrDraft.shiftBreakEnd
                                            ? undefined
                                            : Number(corrDraft.shiftBreakMinutes) || 0,
                                        breakStartDateTime:
                                          corrDraft.shiftBreakStart || undefined,
                                        breakEndDateTime: corrDraft.shiftBreakEnd || undefined,
                                        activityType: "fabrication",
                                      },
                                    ]
                                  : undefined,
                              })
                              notifyMutationResult(
                                notify,
                                res,
                                `Requested corrections for ${job.spec.name}; job returned to In Production for responsible crew.`,
                              )
                              if (res.ok) {
                                updateCorrectionDraft(job, {
                                  open: false,
                                  explanation: "",
                                })
                              }
                            }}
                          >
                            Send Correction Request (Return to In Production)
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
