import {
  Boxes,
  CalendarDays,
  Check,
  CircleAlert,
  CircleCheck,
  Eye,
  History,
  Loader2,
  MapPin,
  RefreshCw,
  Users,
  type LucideIcon,
} from "lucide-react"
import { Badge, Button, cx } from "../../../components/ui/ui"
import { ghostBtn } from "../../../components/admin/AdminKit"
import { useNotify } from "../../../components/ui/Notifications"
import {
  publishApprovedEventToWarehouse,
  useOperationsStore,
} from "../../../operations/store"
import { displayDate, type Brief, type Project } from "../model"
import { previewAudit } from "../preview-data"
import {
  Pill,
  StatusBadge,
  Visual,
  coverAlt,
  fmtStamp,
  pitchCover,
  registeredPitchTheme,
  textareaCls,
  themeByName,
  type StudioUser,
} from "../shared"
import StepHead from "./StepHead"

export type Audit = Awaited<ReturnType<typeof previewAudit>>[number]

export function ApprovalStep({
  brief,
  saved,
  dirty,
  checks,
  goStep,
  busy,
  presentable,
  onReady,
  note,
  setNote,
  ack,
  setAck,
  onApprove,
  audit,
  user,
}: {
  brief: Brief
  saved: Project | null
  dirty: boolean
  checks: { label: string; ok: boolean; step: number }[]
  goStep: (n: number) => void
  busy: string
  presentable: boolean
  onReady: () => void
  note: string
  setNote: (v: string) => void
  ack: boolean
  setAck: (v: boolean) => void
  onApprove: () => void
  audit: Audit[]
  user: StudioUser
}) {
  const opsState = useOperationsStore()
  const notify = useNotify()
  const warehouseOrder = saved?.id
    ? opsState.orderRequests.find((o) => o.eventId === saved.id)
    : undefined
  const approved = saved?.status === "approved"
  const isReady = saved?.status === "ready" && !dirty
  const canApprove = isReady && note.trim().length > 0 && ack && !busy
  const pieces = brief.requirements.reduce((n, r) => n + r.quantity, 0)
  const customCount = (brief.customItems ?? []).reduce((n, c) => n + (c.quantity || 1), 0)
  const rentalCount = brief.rentals.length
  const theme = registeredPitchTheme(brief) ?? themeByName(brief.theme)
  const processor = saved?.processedBy ?? user.name
  const blocker = approved
    ? ""
    : !saved
      ? "Save the pitch, then mark it for presentation before recording approval."
      : dirty
        ? "Save your changes and mark the pitch for presentation to record approval."
        : saved.status !== "ready"
          ? presentable
            ? "Mark the pitch for presentation before recording approval."
            : "Resolve the checklist above, then mark the pitch for presentation."
          : ""
  const facts: [LucideIcon, string, string][] = [
    [CalendarDays, "Event date", brief.start ? displayDate(brief.start) : "Date to be decided"],
    [MapPin, "Venue", brief.venue.trim() || "Venue to be added"],
    [Users, "Guests", `${brief.pax || 0} pax`],
    [
      Boxes,
      "Asset requirements",
      `${pieces} stock ${pieces === 1 ? "piece" : "pieces"} · ${customCount} custom ${customCount === 1 ? "item" : "items"} · ${rentalCount} ${rentalCount === 1 ? "rental" : "rentals"}`,
    ],
  ]

  return (
    <div className="em-step-grid">
      <section className="em-panel em-step-panel">
        <StepHead
          eyebrow="04 / A beautiful beginning"
          title="Ready to make it official?"
          description="Review the saved vision, then record your client's approval."
        />
        <div className="em-summary">
          <Visual
            src={pitchCover(brief)}
            label={coverAlt(brief)}
            className="em-summary-img"
          />
          <div className="min-w-0">
            {saved ? (
              <StatusBadge status={saved.status} />
            ) : (
              <Pill>Not saved</Pill>
            )}
            <p className="em-summary-title">
              {brief.title.trim() || "Untitled pitch"}
            </p>
            <p className="em-meta mt-1">
              {brief.client.trim() || "Client to be added"} ·{" "}
              {theme?.name ?? brief.theme}
            </p>
          </div>
        </div>

        <dl className="em-facts">
          {facts.map(([Icon, k, v]) => (
            <div key={k} className="em-fact">
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              <div className="min-w-0">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            </div>
          ))}
        </dl>

        <ul className="em-checklist" aria-label="Approval readiness">
          {checks.map((c) => (
            <li key={c.label} className={cx(!c.ok && "is-open")}>
              {c.ok ? (
                <CircleCheck size={17} strokeWidth={1.5} aria-hidden />
              ) : (
                <CircleAlert size={17} strokeWidth={1.5} aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                {c.label}
                <span className="sr-only">
                  {c.ok ? ": done" : ": needs attention"}
                </span>
              </span>
              {!c.ok && !approved && (
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => goStep(c.step)}
                >
                  Fix
                </button>
              )}
            </li>
          ))}
          <li>
            <CircleCheck size={17} strokeWidth={1.5} aria-hidden />
            <span className="min-w-0 flex-1">
              Asset availability rechecked at approval
            </span>
          </li>
          <li>
            <CircleCheck size={17} strokeWidth={1.5} aria-hidden />
            <span className="min-w-0 flex-1">
              Calendar booking and inventory reservation recorded together
            </span>
          </li>
        </ul>

        {approved ? (
          <div className="em-approved-note space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="em-label">Client approval reference</p>
              {warehouseOrder && (
                <Badge tone={warehouseOrder.warehouseClosed ? "success" : "info"}>
                  Warehouse Order Request: {warehouseOrder.id} (
                  {warehouseOrder.warehouseClosed ? "Closed" : "Active"})
                </Badge>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words">
              {saved?.approvalNote}
            </p>
            <p className="em-meta">
              Approved {saved?.approvedAt && fmtStamp(saved.approvedAt)}. The
              event is on the calendar and published to Warehouse → Order Requests.
            </p>
            {saved && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  icon={RefreshCw}
                  onClick={() => {
                    const order = publishApprovedEventToWarehouse(saved, user, brief)
                    notify({
                      tone: "success",
                      text: `Idempotent handoff verified: resolved to existing Warehouse Order Request ${order.id} without duplicate creation.`,
                    })
                  }}
                >
                  Verify Idempotent Handoff
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8">
            <label className="block">
              <span className="mb-2 block text-[14px] font-semibold">
                Client approval reference
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!isReady}
                maxLength={1000}
                placeholder="Who approved, when, and the email or message reference…"
                className={textareaCls}
              />
            </label>
            <label className="mt-4 flex items-start gap-2.5 text-[14px] leading-5">
              <input
                type="checkbox"
                className="em-check mt-0.5"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                disabled={!isReady}
              />
              <span>I confirm the client approved this saved design and brief.</span>
            </label>
            <button
              type="button"
              className="em-btn em-btn--primary mt-6"
              onClick={onApprove}
              disabled={!canApprove}
              aria-busy={busy === "approve"}
              aria-describedby="em-approve-help"
            >
              {busy === "approve" ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <Check size={15} strokeWidth={1.5} aria-hidden />
              )}
              {busy === "approve" ? "Recording…" : "Approve & reserve assets"}
            </button>
            <p id="em-approve-help" className="em-meta mt-3">
              {blocker && <span className="em-blocker">{blocker} </span>}
              Stock shortages or low-stock items require a confirmed replenishment request before approval.
            </p>
            <button
              type="button"
              className="em-text-btn mt-3"
              onClick={onReady}
              disabled={!!busy || !presentable || isReady}
              aria-busy={busy === "ready"}
            >
              {busy === "ready" ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <Eye size={15} strokeWidth={1.5} aria-hidden />
              )}
              {isReady
                ? "Marked for presentation"
                : busy === "ready"
                  ? "Saving…"
                  : "Mark for presentation"}
            </button>
          </div>
        )}
      </section>

      <aside className="em-step-aside">
        <div className="em-aside-card">
          <History size={20} strokeWidth={1.5} aria-hidden />
          <p className="em-aside-card-title em-aside-card-title--lg mt-5">
            The story so far.
          </p>
          <p className="em-aside-card-meta">
            A record of who processed this pitch and when.
          </p>
          <div className="em-processor">
            <span className="em-avatar" aria-hidden>
              {processor.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium">
                {processor}
              </span>
              <span className="em-aside-card-meta block">
                Original processor
              </span>
            </span>
          </div>
          <p className="em-aside-card-meta mt-3">
            {saved ? `Created ${fmtStamp(saved.createdAt)}` : "Not saved yet"}
          </p>
          {audit.length === 0 ? (
            <p className="em-aside-card-meta mt-5">
              History appears after the first save.
            </p>
          ) : (
            <ol className="em-timeline">
              {audit.map((a) => (
                <li key={`${a.revision}-${a.at}`}>
                  <p className="text-[13px] font-medium">{a.action}</p>
                  <p className="em-aside-card-meta">
                    {a.actor} · Revision {a.revision}
                  </p>
                  <p className="em-aside-card-meta">{fmtStamp(a.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}

export default ApprovalStep

