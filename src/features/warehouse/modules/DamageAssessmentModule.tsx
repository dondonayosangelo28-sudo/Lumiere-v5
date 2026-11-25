import { useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { Badge, Button, Card, Input, PageHeader } from "../../../components/ui/ui"
import { Visual, fmtStamp } from "../../event-manager/shared"
import {
  resolveFieldIncidentReport,
  useOperationsStore,
  type OpsActor,
} from "../../../operations/store"
import type { IssueResolutionType } from "../../../operations/types"
import { useNotify, RESOLUTION_OPTIONS } from "../warehouse-shared"

export default function DamageAssessmentModule({ actor }: { actor: OpsActor }) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [resState, setResState] = useState<
    Record<string, { type: IssueResolutionType; notes: string }>
  >({})

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Damage Assessment"]}
        title="Damage Assessment"
        subtitle="Review damaged and missing items and record how each case was resolved."
      />

      <Card className="p-6">
        {state.incidentReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No field Damage Reports or Missing Item Reports have been filed yet. Reports submitted
            by Ground Crew during Venue Arrival, Event Hours, or Warehouse Arrival appear here.
          </p>
        ) : (
          <div className="space-y-4">
            {state.incidentReports.map((rep) => {
              const draft = resState[rep.id] ?? { type: "Repair Scheduled", notes: "" }
              return (
                <div
                  key={rep.id}
                  className="rounded-xl border border-line bg-fg/[0.02] p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <Visual
                        src={rep.photoUrl}
                        label={rep.itemName}
                        className="size-16 shrink-0 rounded-lg"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={rep.reportType === "Damage" ? "danger" : "warning"}>
                            {rep.reportType} Report
                          </Badge>
                          <Badge tone="info">Checkpoint: {rep.checkpoint}</Badge>
                          <Badge tone="neutral">{rep.eventTitle}</Badge>
                          <Badge
                            tone={rep.resolutionStatus === "Resolved" ? "success" : "danger"}
                          >
                            {rep.resolutionStatus}
                          </Badge>
                        </div>
                        <h4 className="mt-1 text-base font-bold text-foreground">
                          {rep.itemName} ({rep.itemCode}) · Affected Qty: {rep.quantity}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Description: “{rep.description}” · Submitted by{" "}
                          <strong className="text-foreground">{rep.submittedByName}</strong> (
                          {rep.submittedByEmail}) at {fmtStamp(rep.submittedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {rep.resolutionStatus === "Resolved" ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                      <strong className="text-[#4ade80]">
                        Documented Resolution ({rep.resolutionType}):
                      </strong>{" "}
                      {rep.resolutionNotes} · Signed off by {rep.resolvedByName} at{" "}
                      {rep.resolvedAt && fmtStamp(rep.resolvedAt)}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)_auto] items-center border-t border-line pt-3">
                      <select
                        className="h-10 rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-sm text-foreground"
                        value={draft.type}
                        onChange={(e) =>
                          setResState({
                            ...resState,
                            [rep.id]: { ...draft, type: e.target.value as IssueResolutionType },
                          })
                        }
                      >
                        {RESOLUTION_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={draft.notes}
                        onChange={(e) =>
                          setResState({
                            ...resState,
                            [rep.id]: { ...draft, notes: e.target.value },
                          })
                        }
                        placeholder="Record documented resolution (e.g. item recovered, repair ticket, approved write-off)…"
                      />
                      <Button
                        type="button"
                        icon={CheckCircle2}
                        onClick={() => {
                          const res = resolveFieldIncidentReport(actor, rep.id, {
                            resolutionType: draft.type,
                            resolutionNotes: draft.notes,
                          })
                          if (!res.ok) notify(res.error)
                          else notify(`Resolved ${rep.reportType} report ${rep.id}.`)
                        }}
                      >
                        Record Resolution
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
