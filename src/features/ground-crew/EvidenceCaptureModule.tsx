import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Send,
} from "lucide-react"
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui/ui"
import { Visual, fmtStamp, textareaCls } from "../event-manager/shared"
import {
  setOperationsNavigationContext,
  submitAfterShiftWorkPhoto,
  submitDailyGroupProgressReport,
  submitProductionJobForVerification,
  useOperationsStore,
  type OpsActor,
} from "../../operations/store"
import {
  EventSelectorHeader,
  SAMPLE_PHOTOS,
  getManilaTodayDateString,
  getWorkerProductionJobs,
  getWorkerRelevantOrders,
  notifyMutationResult,
  useNotify,
} from "./ground-crew-shared"

export default function EvidenceCaptureModule({
  actor,
  initialEventId,
  initialJobId,
}: {
  actor: OpsActor
  initialEventId?: string
  initialJobId?: string
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const email = actor.email.trim().toLowerCase()
  const relevantOrders = getWorkerRelevantOrders(state, email)

  const [selectedEventId, setSelectedEventId] = useState(
    () => initialEventId || relevantOrders[0]?.eventId || "",
  )
  const [shiftLabel, setShiftLabel] = useState("Shift 1 — Custom Fabrication & Ingress Prep")
  const [photoUrl, setPhotoUrl] = useState("/event-manager-images/corporate.jpg")
  const [caption, setCaption] = useState(
    "Completed fabrication and assembly per Event Manager dimensions and finish specifications.",
  )
  const [isFabrication, setIsFabrication] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState(initialJobId ?? "")
  const [completedQtyByJob, setCompletedQtyByJob] = useState<Record<string, string>>({})
  const [groupManilaDate, setGroupManilaDate] = useState(() => getManilaTodayDateString())
  const [groupSummary, setGroupSummary] = useState("")
  const [groupPhotoUrl, setGroupPhotoUrl] = useState("/event-manager-images/corporate.jpg")

  useEffect(() => {
    if (initialEventId && relevantOrders.some((o) => o.eventId === initialEventId)) {
      setSelectedEventId(initialEventId)
    }
  }, [initialEventId, relevantOrders])

  useEffect(() => {
    if (initialJobId) {
      setSelectedJobId(initialJobId)
      setIsFabrication(true)
    }
  }, [initialJobId])

  if (relevantOrders.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={["Dashboard", "My Work", "Evidence Capture"]}
          title="Evidence Capture"
          subtitle="Upload shift progress photos, Group Lead daily reports, and finished-work submissions."
        />
        <Card className="p-8 text-center space-y-2">
          <p className="text-base font-semibold text-foreground">
            No assigned events for evidence or production submission
          </p>
          <p className="text-sm text-muted-foreground">
            Your assigned custom production jobs and event evidence logs will appear here once
            Warehouse schedules you.
          </p>
        </Card>
      </div>
    )
  }

  const order =
    relevantOrders.find((o) => o.eventId === selectedEventId) ?? relevantOrders[0]
  if (!order) return null

  const eventJobs = getWorkerProductionJobs(state, order.eventId, email)
  const activeJobId =
    (selectedJobId && eventJobs.some((j) => j.id === selectedJobId)
      ? selectedJobId
      : eventJobs[0]?.id) || ""
  const selectedJob = eventJobs.find((j) => j.id === activeJobId)

  const eventAfterShiftPhotos = state.afterShiftPhotos.filter(
    (p) => p.eventId === order.eventId,
  )
  const eventIncidentReports = state.incidentReports.filter(
    (r) => r.eventId === order.eventId,
  )

  const mode = selectedJob?.assignmentMode ?? "group"
  const leadEmail = (
    selectedJob?.productionLeadEmail ??
    selectedJob?.inheritedLeadEmail ??
    ""
  ).toLowerCase()
  const leadName =
    selectedJob?.productionLeadName ||
    selectedJob?.productionLeadEmail ||
    selectedJob?.inheritedLeadName ||
    "Not assigned"
  const participants = selectedJob
    ? (selectedJob.participantEmails?.length
        ? selectedJob.participantEmails
        : selectedJob.assignedCrewEmails
      ).map((e) => e.toLowerCase())
    : []

  const isEligibleSubmitter = Boolean(
    selectedJob &&
      actor.role !== "Warehouse Operations Manager" &&
      (mode === "group"
        ? Boolean(leadEmail) && email === leadEmail
        : participants.length > 1
          ? Boolean(leadEmail) && email === leadEmail
          : participants.length === 1
            ? participants[0] === email
            : false),
  )

  const ownershipRuleDescription = selectedJob
    ? mode === "group"
      ? `Group job: Only Production Lead (${leadName}) may submit finished work for verification.`
      : participants.length > 1
        ? `Multi-worker Individual job: Designated/Inherited Production Lead (${leadName}) submits full finished batch.`
        : "Single-worker Individual job: The sole assigned worker submits finished work."
    : ""

  const qtyDraft = selectedJob
    ? completedQtyByJob[selectedJob.id] ?? String(selectedJob.spec.requestedQty)
    : "0"
  const isJobSubmissionLocked = Boolean(
    !selectedJob ||
      selectedJob.status === "Ready to Load" ||
      selectedJob.status === "Awaiting Verification" ||
      order.warehouseClosed,
  )

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "My Work", "Evidence Capture"]}
        title="Evidence Capture & Finished-Work Submission"
        subtitle="Record after-shift photos, Group Lead daily progress reports, correction rework updates, and explicit finished-work submissions."
      />

      <EventSelectorHeader
        actor={actor}
        selectedEventId={order.eventId}
        onSelect={(id) => {
          setSelectedEventId(id)
          setSelectedJobId("")
          setOperationsNavigationContext({ eventId: id }, { merge: true })
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[460px_minmax(0,1fr)]">
        {/* Left: Shift Photo Upload & Explicit Finished-Work Submission */}
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="text-base font-bold text-foreground">
              After-Shift Work Photo &amp; Finished-Work Submission
            </h3>
            <p className="text-xs text-muted-foreground">
              Daily progress photos keep the job in production until an authorized submitter clicks{" "}
              <strong>Submit Finished Job for Verification</strong> with the full required quantity.
            </p>

            <Field label="Shift Label">
              <Input
                value={shiftLabel}
                onChange={(e) => setShiftLabel(e.target.value)}
                placeholder="e.g. Shift 1 — Custom Fabrication Workshop"
              />
            </Field>

            <Field label="Work Photo URL">
              <div className="space-y-2">
                <Input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="/event-manager-images/corporate.jpg"
                />
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_PHOTOS.map((sp) => (
                    <Button
                      key={sp.url}
                      type="button"
                      variant="ghost"
                      onClick={() => setPhotoUrl(sp.url)}
                    >
                      {sp.label}
                    </Button>
                  ))}
                </div>
              </div>
            </Field>

            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={isFabrication}
                onChange={(e) => setIsFabrication(e.target.checked)}
              />
              This shift involved Custom Fabrication work (link photo to assigned production job)
            </label>

            {isFabrication && (
              <Field label="Link to My Custom Fabrication Job">
                {eventJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No custom fabrication jobs assigned to you on this event.
                  </p>
                ) : (
                  <select
                    aria-label="Link to Custom Fabrication Job"
                    className="h-10 w-full rounded-md border border-line bg-elev px-3 text-sm text-foreground"
                    value={activeJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                  >
                    {eventJobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.spec.name} ({j.status})
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}

            {isFabrication && selectedJob && (
              <div className="rounded-lg border border-line bg-fg/[0.02] p-3.5 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-foreground">{selectedJob.spec.name}</span>
                  <Badge
                    tone={
                      selectedJob.status === "Ready to Load"
                        ? "success"
                        : selectedJob.status === "Awaiting Verification"
                          ? "info"
                          : "warning"
                    }
                  >
                    {selectedJob.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  Spec: {selectedJob.spec.dimensions} · {selectedJob.spec.materials} · Finish:{" "}
                  {selectedJob.spec.finish}
                </p>
                <p className="text-muted-foreground">
                  Instructions: {selectedJob.spec.buildInstructions}
                </p>
                <p className="text-muted-foreground">{ownershipRuleDescription}</p>
                <Field
                  label={`Finished Quantity (Required: ${selectedJob.spec.requestedQty} — partial qty cannot pass)`}
                >
                  <Input
                    aria-label="Finished Quantity"
                    type="number"
                    min={0}
                    max={selectedJob.spec.requestedQty}
                    disabled={isJobSubmissionLocked}
                    value={qtyDraft}
                    onChange={(e) =>
                      setCompletedQtyByJob((prev) => ({
                        ...prev,
                        [selectedJob.id]: e.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
            )}

            <Field label="Work Summary / Explanation of Completed Build or Corrections">
              <textarea
                className={textareaCls}
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Summarize progress, finished build check, or what was corrected…"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                icon={Camera}
                disabled={order.warehouseClosed}
                onClick={() => {
                  const res = submitAfterShiftWorkPhoto(actor, {
                    eventId: order.eventId,
                    shiftLabel,
                    photoUrl,
                    caption,
                    isFabricationWork: isFabrication && Boolean(activeJobId),
                    fabricationJobId: isFabrication ? activeJobId : undefined,
                  })
                  notifyMutationResult(
                    notify,
                    res,
                    `After-shift work photo submitted${isFabrication && activeJobId ? " and linked to Custom Fabrication job" : ""}.`,
                  )
                }}
              >
                Submit After-Shift Work Photo
              </Button>
              {isFabrication && selectedJob && (
                <Button
                  type="button"
                  variant="outline"
                  icon={Send}
                  disabled={isJobSubmissionLocked || !isEligibleSubmitter}
                  onClick={() => {
                    const res = submitProductionJobForVerification(actor, {
                      jobId: selectedJob.id,
                      completedQty: Number(qtyDraft),
                      photoUrls: photoUrl.trim() ? [photoUrl.trim()] : [],
                      summary: caption,
                    })
                    notifyMutationResult(
                      notify,
                      res,
                      `Submitted ${selectedJob.spec.name} (${selectedJob.spec.requestedQty} required) for Warehouse verification.`,
                    )
                  }}
                >
                  Submit Finished Job for Verification
                </Button>
              )}
            </div>
            {isFabrication && selectedJob && selectedJob.status === "Ready to Load" && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-[#4ade80]">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>
                  Approved <strong>Ready to Load</strong> by {selectedJob.verifiedByName} (
                  {selectedJob.verifiedAt ? fmtStamp(selectedJob.verifiedAt) : ""}).
                </span>
              </div>
            )}
          </Card>

          {/* Production Lead Daily Group Progress Report */}
          {selectedJob && mode === "group" && email === leadEmail && !order.warehouseClosed && (
            <Card className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <ClipboardList className="size-4" />
                <span>Lead Group Daily Progress Report</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Submits one daily Group progress summary for <strong>{selectedJob.spec.name}</strong>{" "}
                without duplicating team totals into individual workers’ personal hours.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Asia/Manila Date">
                  <Input
                    type="date"
                    value={groupManilaDate}
                    onChange={(e) => setGroupManilaDate(e.target.value)}
                  />
                </Field>
                <Field label="Group Progress Photo URL">
                  <Input
                    value={groupPhotoUrl}
                    onChange={(e) => setGroupPhotoUrl(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Group Progress Summary">
                <textarea
                  className={textareaCls}
                  rows={2}
                  value={groupSummary}
                  onChange={(e) => setGroupSummary(e.target.value)}
                  placeholder="Today’s group fabrication milestones and blockers…"
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const res = submitDailyGroupProgressReport(actor, {
                    eventId: order.eventId,
                    jobId: selectedJob.id,
                    manilaDate: groupManilaDate,
                    summary: groupSummary,
                    photoUrls: groupPhotoUrl.trim() ? [groupPhotoUrl.trim()] : [],
                  })
                  notifyMutationResult(
                    notify,
                    res,
                    `Submitted Group Daily Progress Report for ${selectedJob.spec.name}.`,
                  )
                  if (res.ok) setGroupSummary("")
                }}
              >
                Submit Group Daily Progress Report
              </Button>
            </Card>
          )}
        </div>

        {/* Right: Corrections History, Submission History & Distinct Photo Categories */}
        <div className="space-y-6">
          {selectedJob &&
            ((selectedJob.correctionRequests?.length ?? 0) > 0 ||
              (selectedJob.submissions?.length ?? 0) > 0) && (
              <Card className="p-6 space-y-4 text-xs">
                <h3 className="text-base font-bold text-foreground">
                  Job Submission &amp; Correction History — {selectedJob.spec.name}
                </h3>

                {(selectedJob.correctionRequests?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <div className="font-semibold text-danger flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      <span>
                        Warehouse Correction Requests ({selectedJob.correctionRequests?.length})
                      </span>
                    </div>
                    {selectedJob.correctionRequests!.map((corr) => {
                      const extraShifts = (selectedJob.schedules ?? []).filter((s) =>
                        corr.scheduledAdditionalShiftIds.includes(s.id),
                      )
                      return (
                        <div
                          key={corr.id}
                          className="rounded-lg border border-danger/30 bg-danger/[0.04] p-3 space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-foreground">
                              Round {corr.round} · Requested by {corr.requestedByName}
                            </span>
                            <Badge tone={corr.resolvedAt ? "success" : "danger"}>
                              {corr.resolvedAt
                                ? `Resubmitted (${fmtStamp(corr.resolvedAt)})`
                                : "Rework Needed"}
                            </Badge>
                          </div>
                          <p className="text-foreground">“{corr.explanation}”</p>
                          <p className="text-muted-foreground">
                            Responsible Crew: {corr.responsibleCrewEmails.join(", ")}
                          </p>
                          {extraShifts.length > 0 && (
                            <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                              {extraShifts.map((s) => (
                                <li key={s.id}>
                                  • Rework Shift ({s.crewEmail}):{" "}
                                  {s.startDateTime.replace("T", " ")} →{" "}
                                  {s.endDateTime.replace("T", " ")} ({s.plannedProductiveHours}h)
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {(selectedJob.submissions?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-semibold text-foreground">
                      Finished-Work Submissions ({selectedJob.submissions!.length})
                    </div>
                    {selectedJob.submissions!.map((sub) => (
                      <div key={sub.id} className="rounded border border-line bg-fg/[0.02] p-2.5">
                        <div className="font-semibold text-foreground">
                          Round {sub.round} · {sub.completedQty} finished · Submitted by{" "}
                          {sub.submittedByName} ({fmtStamp(sub.submittedAt)})
                        </div>
                        <div className="text-muted-foreground">“{sub.summary}”</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                Category A — After-Shift Work Photos ({eventAfterShiftPhotos.length})
              </h3>
              <Badge tone="info">Shift &amp; Fabrication Progress</Badge>
            </div>
            {eventAfterShiftPhotos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No after-shift progress photos uploaded for {order.eventTitle} yet.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {eventAfterShiftPhotos.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start gap-3 rounded-xl border border-line bg-fg/[0.02] p-3 text-xs"
                  >
                    <Visual
                      src={p.photoUrl}
                      label={p.caption}
                      className="size-16 shrink-0 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground">{p.shiftLabel}</div>
                      <div className="text-muted-foreground">{p.eventTitle}</div>
                      {p.isFabricationWork && (
                        <Badge tone="info">Linked to Job: {p.fabricationJobId}</Badge>
                      )}
                      <p className="mt-1 text-muted-foreground">“{p.caption}”</p>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        By {p.submittedByName} · {fmtStamp(p.submittedAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                Category B — Checkpoint Arrival Confirmation Photos (Venue &amp; Warehouse)
              </h3>
              <Badge tone="success">Team Lead Arrival Checkpoints</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-line bg-fg/[0.02] p-3">
                <div className="font-semibold text-foreground">2. Venue Arrival Photo</div>
                {order.venueArrival ? (
                  <div className="mt-2 flex items-start gap-3">
                    <Visual
                      src={order.venueArrival.photoUrl}
                      label="Venue arrival"
                      className="size-14 shrink-0 rounded-md"
                    />
                    <div>
                      <div>Submitted by {order.venueArrival.submittedByName}</div>
                      <div className="text-muted-foreground">
                        {fmtStamp(order.venueArrival.submittedAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">Not submitted yet.</p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-fg/[0.02] p-3">
                <div className="font-semibold text-foreground">4. Warehouse Arrival Photo</div>
                {order.warehouseArrival ? (
                  <div className="mt-2 flex items-start gap-3">
                    <Visual
                      src={order.warehouseArrival.photoUrl}
                      label="Warehouse arrival"
                      className="size-14 shrink-0 rounded-md"
                    />
                    <div>
                      <div>Submitted by {order.warehouseArrival.submittedByName}</div>
                      <div className="text-muted-foreground">
                        {fmtStamp(order.warehouseArrival.submittedAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">Not submitted yet.</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                Category C — Damage &amp; Missing Incident Evidence ({eventIncidentReports.length})
              </h3>
              <Badge tone="danger">Field Incident Evidence</Badge>
            </div>
            {eventIncidentReports.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No incident evidence photos filed for {order.eventTitle}.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                {eventIncidentReports.map((inc) => (
                  <div
                    key={inc.id}
                    className="flex items-start gap-3 rounded-xl border border-line bg-fg/[0.02] p-3"
                  >
                    <Visual
                      src={inc.photoUrl}
                      label={inc.itemName}
                      className="size-14 shrink-0 rounded-md"
                    />
                    <div>
                      <div className="font-semibold text-foreground">
                        {inc.reportType}: {inc.itemName} (×{inc.quantity})
                      </div>
                      <div className="text-muted-foreground">Checkpoint: {inc.checkpoint}</div>
                      <div className="text-muted-foreground">By {inc.submittedByName}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export { EvidenceCaptureModule }
