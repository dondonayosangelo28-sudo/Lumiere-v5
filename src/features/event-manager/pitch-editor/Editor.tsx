import { unconfirmedStockWarnings, withStockState } from "../stock-policy"
import { syncBoardAssets } from "../mood-board/board-assets"
import {
  getBoardPermissions,
  getDraftBoardId,
  getPitchBoardId,
  migrateBoardComments,
} from "../mood-board/board-comments"
import { formatBudget, parseBudget } from "./budget"
import { useNotify } from '../../../components/ui/Notifications'
import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  X,
} from "lucide-react"
import { Button, cx } from "../../../components/ui/ui"
import {
  assets,
  type Availability,
  type Brief,
  type Project,
} from "../model"
import {
  ApprovalHandoffError,
  getPendingApprovalHandoff,
  previewAudit,
  previewStudio,
  retryApprovalHandoff,
  type PendingApprovalHandoff,
} from "../preview-data"
import {
  Pill,
  StatusBadge,
  fmtRange,
  fmtStamp,
  validateBrief,
  clientEmailError,
  type Errors,
  type StudioUser,
} from "../shared"
import BriefStep from "./BriefStep"
import BoardStep, { shelf, type ShelfItem } from "./BoardStep"
import AssetStep from "./AssetStep"
import ApprovalStep, { type Audit } from "./ApprovalStep"
import Presentation from "./Presentation"

export { Presentation }
export { shelf, type ShelfItem }
export type Working = { id?: string; brief: Brief; step: number }

const steps = [
  "Client brief",
  "Mood board",
  "Asset plan",
  "Client approval",
] as const

type Props = {
  user: StudioUser
  project: Project | null
  initialBrief: Brief
  initialStep?: number
  onSaved: (project: Project | null) => void
  onClose: () => void
  onDirty: (dirty: boolean) => void
  onWorking: (working: Working | null) => void
  /** True when resuming a recovered working copy, so it stays guarded until saved. */
  restored?: boolean
  /** Destination the editor returns to, used for the back link. */
  backLabel?: string
}

export default function Editor({
  user,
  project,
  initialBrief,
  initialStep = 0,
  onSaved,
  onClose,
  onDirty,
  onWorking,
  restored = false,
  backLabel = "Event pitches",
}: Props) {
  const [draftEventId] = useState(() => project?.id ?? crypto.randomUUID())
  const [saved, setSaved] = useState<Project | null>(project)
  const [brief, setBrief] = useState<Brief>(() => project?.status === "approved" ? initialBrief : syncBoardAssets(initialBrief))
  const [budgetInput, setBudgetInput] = useState(() => formatBudget(initialBrief.estimatedBudget))
  const budgetError = parseBudget(budgetInput).error
  const [baseline, setBaseline] = useState(() =>
    restored ? "null" : JSON.stringify(project?.brief ?? initialBrief),
  )
  const [step, setStep] = useState(initialStep)
  const [errors, setErrors] = useState<Errors>({})
  const setFlash = useNotify()
  const [conflict, setConflict] = useState(false)
  const [pendingHandoff, setPendingHandoff] = useState<PendingApprovalHandoff | null>(() =>
    project?.id ? getPendingApprovalHandoff(user, project.id) : null,
  )
  const [busy, setBusy] =
    useState<"" | "save" | "ready" | "approve" | "reload">("")
  const [avail, setAvail] = useState<Availability[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [note, setNote] = useState("")
  const [ack, setAck] = useState(false)
  const [preview, setPreview] = useState(false)
  const [availTick, setAvailTick] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const readOnly = saved?.status === "approved"
  const dirty = !readOnly && (JSON.stringify(brief) !== baseline || !!budgetError)
  const update = (patch: Partial<Brief>) => {
    if (!getBoardPermissions(readOnly).canEdit) return
    setBrief((b) => syncBoardAssets({ ...b, ...patch }))
    if ("clientEmail" in patch) setErrors((e) => ({ ...e, clientEmail: undefined }))
  }

  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    onWorking(dirty ? { id: saved?.id, brief, step } : null)
  }, [dirty, brief, step, saved?.id, onWorking])
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  // Availability is checked against approved events only; drafts never consume stock.
  const qty = (id: string) =>
    brief.requirements.find((r) => r.assetId === id)?.quantity ?? 0
  const reqKey = JSON.stringify(brief.requirements)
  useEffect(() => {
    let live = true
    const probe = {
      ...brief,
      requirements: assets.map((a) => ({ assetId: a.id, quantity: qty(a.id) })),
    }
    const t = window.setTimeout(() => {
      previewStudio(user, {
        action: "availability",
        brief: probe,
        id: saved?.id,
      })
        .then((a) => {
          if (!live) return
          setAvail(a)
          if (readOnly) return
          setBrief((current) => {
            if (current.start !== probe.start || current.end !== probe.end || JSON.stringify(current.requirements) !== reqKey) return current
            const next = withStockState(current, a, saved?.id ?? draftEventId)
            return JSON.stringify(next) === JSON.stringify(current) ? current : next
          })
        })
        .catch(() => live && setAvail([]))
    }, 150)
    return () => {
      live = false
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, brief.start, brief.end, saved?.id, saved?.revision, user.email, availTick])

  useEffect(() => {
    let live = true
    if (saved)
      previewAudit(user, saved.id)
        .then((a) => live && setAudit(a))
        .catch(() => live && setAudit([]))
    else setAudit([])
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id, saved?.revision, user.email])

  const unconfirmedStock = unconfirmedStockWarnings(brief, avail)
  const validate = (complete: boolean): Errors => ({
    ...validateBrief(brief, complete),
    ...(budgetError ? { estimatedBudget: budgetError } : {}),
  })
  const completeErrors = validate(true)
  const checks = [
    {
      label: "Client brief is complete",
      ok: Object.keys(completeErrors).length === 0,
      step: 0,
    },
    {
      label: "Mood board has at least one pin",
      ok: brief.pins.length > 0,
      step: 1,
    },
    {
      label: "Asset plan lists at least one item",
      ok: brief.requirements.length > 0,
      step: 2,
    },
    {
      label: "Stock covers every item or replenishment is requested",
      ok: brief.requirements.length > 0 && avail.length > 0 && unconfirmedStock.length === 0,
      step: 2,
    },
  ]
  const presentable = checks.every((c) => c.ok)

  const fail = (e: unknown) => {
    const text =
      e instanceof Error ? e.message : "Something went wrong. Try again."
    setConflict(/changed/i.test(text))
    setFlash({ tone: "error", text })
  }

  const accept = (p: Project, text: string) => {
    if (!saved && p.id) {
      const targetBoardId = getPitchBoardId(p.id)
      if (targetBoardId) {
        migrateBoardComments(getDraftBoardId(draftEventId), targetBoardId)
      }
    }
    setSaved(p)
    setBrief(p.status === "approved" ? p.brief : syncBoardAssets(p.brief))
    setBudgetInput(formatBudget(p.brief.estimatedBudget))
    setBaseline(JSON.stringify(p.brief))
    setConflict(false)
    setFlash({ tone: "success", text })
    // Clear the host's guard in the same update so an immediate close never sees stale edits.
    onDirty(false)
    onWorking(null)
    onSaved(p)
  }

  const save = async (status: "draft" | "ready") => {
    if (busy || readOnly) return
    const e = validate(status === "ready")
    setErrors(e)
    if (Object.keys(e).length) {
      setStep(0)
      setFlash({
        tone: "error",
        text:
          status === "ready"
            ? "Complete the client brief before marking the pitch ready."
            : "Fix the highlighted brief fields before saving.",
      })
      return
    }
    if (status === "ready" && !presentable) {
      setFlash({
        tone: "error",
        text: "Resolve the readiness checklist before marking the pitch ready.",
      })
      return
    }
    setBusy(status === "ready" ? "ready" : "save")
    try {
      const wasReady = saved?.status === "ready"
      const p = await previewStudio(user, {
        action: "save",
        brief: {
          ...brief,
          title: brief.title.trim(),
          client: brief.client.trim(),
          clientEmail: (brief.clientEmail ?? "").trim(),
          venue: brief.venue.trim(),
          theme: brief.theme.trim(),
        },
        id: saved?.id,
        revision: saved?.revision ?? 0,
        eventId: draftEventId,
        status,
      })
      accept(
        p,
        status === "ready"
          ? "Pitch marked ready for the client presentation."
          : wasReady
            ? "Changes saved. The pitch returned to draft; mark it ready again before approval."
            : saved
              ? "Pitch saved."
              : "Pitch created and saved as a draft.",
      )
    } catch (err) {
      fail(err)
    } finally {
      setBusy("")
    }
  }

  const approve = async () => {
    if (!saved || busy) return
    setBusy("approve")
    try {
      const p = await previewStudio(user, {
        action: "approve",
        id: saved.id,
        revision: saved.revision,
        approvalNote: note,
      })
      setPendingHandoff(null)
      accept(
        p,
        "Client approval recorded and published to Warehouse.",
      )
      setNote("")
      setAck(false)
    } catch (err) {
      if (err instanceof ApprovalHandoffError) {
        setPendingHandoff(err.handoff)
      }
      fail(err)
    } finally {
      setBusy("")
    }
  }

  const retryHandoff = async () => {
    if (!saved || busy) return
    setBusy("approve")
    try {
      const p = await retryApprovalHandoff(user, saved.id)
      setPendingHandoff(null)
      accept(p, "Client approval recorded and published to Warehouse.")
      setNote("")
      setAck(false)
    } catch (err) {
      if (err instanceof ApprovalHandoffError) {
        setPendingHandoff(err.handoff)
      }
      fail(err)
    } finally {
      setBusy("")
    }
  }

  const reload = async () => {
    if (!saved) return
    setBusy("reload")
    try {
      const latest =
        (await previewStudio(user)).find((p) => p.id === saved.id) ?? null
      if (!latest) {
        setFlash({
          tone: "error",
          text: "This pitch was deleted in another tab.",
        })
        onSaved(null)
        return
      }
      accept(latest, `Loaded revision ${latest.revision}.`)
    } catch (err) {
      fail(err)
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="em-editor">
      <div className="em-editor-head">
        <button type="button" className="em-back" onClick={onClose}>
          <ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> Back to{" "}
          {backLabel.toLowerCase()}
        </button>
        <div className="em-editor-title-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              {saved ? (
                <StatusBadge status={saved.status} />
              ) : (
                <Pill>New pitch</Pill>
              )}
              {saved && (
                <span className="em-meta tabular-nums">
                  Revision {saved.revision}
                </span>
              )}
              {dirty && (
                <span className="em-unsaved">
                  <span aria-hidden className="em-dot em-dot--warm" />
                  Unsaved changes
                </span>
              )}
            </div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="em-editor-title"
            >
              {brief.title.trim() || "Untitled pitch"}
            </h2>
            <p className="em-lede">
              {brief.client.trim() || "Client to be added"} · {fmtRange(brief)}
            </p>
          </div>
          <div className="em-editor-actions">
            {!readOnly && (
              <button
                type="button"
                className="em-btn em-btn--primary"
                onClick={() => save("draft")}
                disabled={!!busy || (!dirty && !!saved)}
                aria-busy={busy === "save"}
              >
                {busy === "save" ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                ) : (
                  <Save size={15} strokeWidth={1.5} aria-hidden />
                )}
                {busy === "save" ? "Saving…" : "Save draft"}
              </button>
            )}
            <button
              type="button"
              className="em-icon-btn em-icon-btn--bordered"
              onClick={onClose}
              aria-label="Close pitch"
              title="Close"
            >
              <X size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </div>
        <ol className="em-stepper" aria-label="Pitch steps">
          {steps.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
                className={cx("em-step", i < step && "is-done")}
              >
                <span className="em-step-num" aria-hidden>
                  {i < step ? <Check size={13} strokeWidth={2} /> : `0${i + 1}`}
                </span>
                <span className="em-step-label">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {pendingHandoff && (
        <div className="-mt-2 mb-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            icon={RefreshCw}
            onClick={retryHandoff}
            disabled={busy === "approve"}
          >
            Retry Approval Handoff
          </Button>
        </div>
      )}
      {conflict && (
        <div className="-mt-2 mb-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            icon={RefreshCw}
            onClick={reload}
            disabled={busy === "reload"}
          >
            Reload latest revision
          </Button>
        </div>
      )}
      {readOnly && (
        <div role="status" className="em-notice mb-5">
          <Lock size={16} strokeWidth={1.5} aria-hidden />
          <span>
            Approved {saved?.approvedAt ? fmtStamp(saved.approvedAt) : ""}.
            Approved events are read-only; duplicate the pitch from Event
            pitches to start a revision.
          </span>
        </div>
      )}

      <div className="em-editor-body">
        <fieldset disabled={readOnly} className="min-w-0">
          <legend className="sr-only">{steps[step]}</legend>
          {step === 0 && (
            <BriefStep
              brief={brief}
              update={update}
              errors={{ ...errors, estimatedBudget: budgetError || errors.estimatedBudget }}
              onEmailBlur={() => setErrors((e) => ({ ...e, clientEmail: clientEmailError(brief.clientEmail) }))}
              budgetInput={budgetInput}
              onBudgetChange={(text) => {
                setBudgetInput(text)
                const result = parseBudget(text)
                if (!result.error) {
                  update({ estimatedBudget: result.value })
                  setErrors((e) => ({ ...e, estimatedBudget: undefined }))
                }
              }}
              onBudgetBlur={() => {
                const result = parseBudget(budgetInput)
                if (!result.error) setBudgetInput(formatBudget(result.value))
              }}
              readOnly={readOnly}
              saved={saved}
              user={user}
            />
          )}
          {step === 2 && (
            <AssetStep
              brief={brief}
              update={update}
              avail={avail}
              readOnly={readOnly}
              user={user}
              savedId={saved?.id}
              onRefresh={() => setAvailTick((t) => t + 1)}
            />
          )}
        </fieldset>
        {/* Outside the fieldset so presenting and downloading stay available once approved; editing controls hide themselves. */}
        {step === 1 && (
          <BoardStep
            boardId={saved?.id ? getPitchBoardId(saved.id) : getDraftBoardId(draftEventId)}
            brief={brief}
            update={update}
            readOnly={readOnly}
            onPresent={() => setPreview(true)}
            fullScreen={preview}
            onExitFullScreen={() => setPreview(false)}
          />
        )}
        {step === 3 && (
          <ApprovalStep
            brief={brief}
            saved={saved}
            dirty={dirty}
            checks={checks}
            goStep={setStep}
            busy={busy}
            presentable={presentable}
            onReady={() => save("ready")}
            note={note}
            setNote={setNote}
            ack={ack}
            setAck={setAck}
            onApprove={approve}
            audit={audit}
            user={user}
          />
        )}
        <div className="em-editor-foot">
          <button
            type="button"
            className="em-btn em-btn--quiet"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> Back
          </button>
          <span className="em-meta" aria-hidden>
            Step {step + 1} of {steps.length}
          </span>
          {step < steps.length - 1 && (
            <button
              type="button"
              className="em-btn em-btn--primary"
              onClick={() => setStep((s) => s + 1)}
            >
              Continue to {steps[step + 1].toLowerCase()}{" "}
              <ArrowRight size={15} strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


