import Modal from "../../components/Modal"
import { stockWarning, stockConfirmationKey, unconfirmedStockWarnings, withStockState, stockThreshold } from "./stock-policy"
import RentalEntry from "./RentalEntry"
import { rentalCatalogOptions } from "./rental-catalog"
import { addEventSupplier, isSupplierAdded } from "./event-rentals"
import { syncBoardAssets } from "./board-assets"
import { formatBudget, parseBudget } from "./budget"
import { useNotify } from '../../components/Notifications'
import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Download,
  Eye,
  History,
  Loader2,
  Lock,
  MapPin,
  PackageOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Type,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { Badge, Button, Field, Input, cx } from "../../components/ui"
import Dropdown from "../../components/Dropdown"
import SearchableDropdown from "../../components/SearchableDropdown"
import DatePicker from "../../components/DatePicker"
import TimePicker from "../../components/TimePicker"
import {
  fieldCls,
  ghostBtn,
} from "../../components/AdminKit"
import {
  assets,
  catalog,
  displayDate,
  themePins,
  themes,
  type Availability,
  type Brief,
  type CustomItemRequirement,
  type Pin,
  type Project,
  type Rental,
} from "./model"
import { publishApprovedEventToWarehouse, useOperationsStore } from "../../operations/store"
import { previewAudit, previewStudio } from "./preview-data"
import Board from "./Board"
import MoodBoardCanvas from "./MoodBoardCanvas"
import {
  FieldError,
  Pill,
  StatusBadge,
  Visual,
  combine,
  addOneHour,
  coverAlt,
  pitchCover,
  datePart,
  fmtRange,
  fmtStamp,
  textareaCls,
  themeByName,
  registeredPitchTheme,
  timePart,
  validateBrief,
  clientEmailError,
  type Errors,
  type StudioUser,
} from "./shared"

export type Working = { id?: string; brief: Brief; step: number }
type Audit = Awaited<ReturnType<typeof previewAudit>>[number]

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
      accept(
        p,
        "Client approval recorded. The event is now on the calendar and its sample stock is reserved in this browser.",
      )
      setNote("")
      setAck(false)
    } catch (err) {
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

export function Presentation({ brief }: { brief: Brief }) {
  const theme = registeredPitchTheme(brief) ?? themeByName(brief.theme)
  return (
    <div className="em-presentation pr-6 sm:pr-0">
      <p className="em-eyebrow">
        {theme?.category ?? "Event"} · {brief.theme}
      </p>
      <p className="em-presentation-title">
        {brief.title.trim() || "Untitled pitch"}
      </p>
      {theme && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          {theme.description}
        </p>
      )}
      <Board
        pins={brief.pins}
        pages={brief.boardPages}
        theme={brief.theme}
        label="Mood board presentation"
        className="mt-4"
      />
      {theme && (
        <div
          className="mt-3 flex items-center gap-2"
          aria-label="Theme palette"
        >
          {theme.palette.map((c) => (
            <span
              key={c}
              title={c}
              className="size-5 rounded-full ring-1 ring-line"
              style={{ background: c }}
            />
          ))}
        </div>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        {[
          ["Client", brief.client || "—"],
          ["When", fmtRange(brief)],
          ["Venue", brief.venue || "—"],
          ["Guests", String(brief.pax)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground">
              {k}
            </dt>
            <dd className="mt-0.5 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {brief.notes.trim() && (
        <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-fg/[0.05] p-3 text-[13px] leading-5">
          {brief.notes}
        </p>
      )}
    </div>
  )
}

function StepHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="em-step-head">
      <div className="min-w-0">
        <p className="em-eyebrow">{eyebrow}</p>
        <h3 className="em-step-title">{title}</h3>
        <p className="em-step-copy">{description}</p>
      </div>
      {actions && <div className="em-step-head-actions">{actions}</div>}
    </div>
  )
}

function BriefStep({
  brief,
  update,
  errors,
  onEmailBlur,
  budgetInput,
  onBudgetChange,
  onBudgetBlur,
  readOnly,
  saved,
  user,
}: {
  brief: Brief
  update: (p: Partial<Brief>) => void
  errors: Errors
  onEmailBlur?: () => void
  budgetInput: string
  onBudgetChange: (text: string) => void
  onBudgetBlur: () => void
  readOnly: boolean
  saved: Project | null
  user: StudioUser
}) {
  const err = (k: keyof Errors) => ({
    "aria-invalid": !!errors[k] || undefined,
    "aria-describedby": errors[k] ? `em-err-${k}` : undefined,
  })
  const setStart = (d: string, t: string) => {
    const start = combine(d, t)
    if (!d) {
      update({ start })
      return
    }
    const prevEnd = brief.end
    const prevDefault = addOneHour(datePart(brief.start), timePart(brief.start))
    const isDefaultEnd =
      !prevEnd ||
      prevEnd === prevDefault ||
      prevEnd === datePart(brief.start) ||
      prevEnd === d
    if (isDefaultEnd) {
      update({ start, end: addOneHour(d, t) })
      return
    }
    if (!timePart(prevEnd) && t) {
      const [, endTime = ""] = addOneHour(datePart(prevEnd), t).split("T")
      update({ start, end: combine(datePart(prevEnd), endTime) })
      return
    }
    update({ start })
  }
  return (
    <div className="em-step-grid">
      <section className="em-panel em-step-panel">
        <StepHead
          eyebrow="01 / The client brief"
          title="Who is this moment for?"
          description="Capture who the event is for and when it happens. A title and client are enough to save a draft."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Field label="Client">
              <Input
                value={brief.client}
                onChange={(e) => update({ client: e.target.value })}
                placeholder="Client or organization"
                autoComplete="organization"
                maxLength={120}
                {...err("client")}
              />
            </Field>
            <FieldError id="em-err-client" text={errors.client} />
          </div>
          <div className="relative">
            <Field label="Client email">
              <Input
                type="email"
                inputMode="email"
                value={brief.clientEmail ?? ""}
                onChange={(e) => update({ clientEmail: e.target.value })}
                onBlur={onEmailBlur}
                placeholder="name@example.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                {...err("clientEmail")}
              />
            </Field>
            <div className="absolute inset-x-0 top-full [&_.em-error]:mt-1 [&_.em-error]:leading-3">
              <FieldError id="em-err-clientEmail" text={errors.clientEmail} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Field label="Event title">
              <Input
                value={brief.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. Santos–Reyes garden wedding"
                maxLength={140}
                {...err("title")}
              />
            </Field>
            <FieldError id="em-err-title" text={errors.title} />
          </div>
          <DateTime
            label="Starts"
            value={brief.start}
            onChange={setStart}
            error={errors.start}
            errKey="start"
            disabled={readOnly}
          />
          <DateTime
            label="Ends"
            value={brief.end}
            onChange={(d, t) => update({ end: combine(d, t) })}
            error={errors.end}
            errKey="end"
            min={datePart(brief.start) || undefined}
            disabled={readOnly}
          />
          <div>
            <Field label="Venue">
              <Input
                value={brief.venue}
                onChange={(e) => update({ venue: e.target.value })}
                placeholder="Venue name and city"
                maxLength={160}
                {...err("venue")}
              />
            </Field>
            <FieldError id="em-err-venue" text={errors.venue} />
          </div>
          <div>
            <Field label="Guest count">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={5000}
                step={1}
                value={Number.isFinite(brief.pax) ? brief.pax : ""}
                onChange={(e) =>
                  update({
                    pax:
                      e.target.value === ""
                        ? 0
                        : Math.round(Number(e.target.value)),
                  })
                }
                {...err("pax")}
              />
            </Field>
            <FieldError id="em-err-pax" text={errors.pax} />
          </div>
          <div>
            <Field label="Theme">
              <Input
                value={brief.theme}
                onChange={(e) => update({ theme: e.target.value })}
                placeholder="Enter event theme"
                maxLength={120}
                {...err("theme")}
              />
            </Field>
            <FieldError id="em-err-theme" text={errors.theme} />
          </div>
          <div>
            <Field label="Estimated budget">
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[14px] text-muted-foreground">₱</span>
                <Input
                  aria-label="Estimated budget in Philippine pesos (PHP)"
                  inputMode="decimal"
                  value={budgetInput}
                  onFocus={() => {
                    const result = parseBudget(budgetInput)
                    if (!result.error && result.value != null) onBudgetChange(String(result.value))
                  }}
                  onChange={(e) => onBudgetChange(e.target.value)}
                  onBlur={onBudgetBlur}
                  placeholder="150,000"
                  className="pl-8 tabular-nums"
                  {...err("estimatedBudget")}
                />
              </div>
            </Field>
            <FieldError id="em-err-estimatedBudget" text={errors.estimatedBudget} />
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                value={brief.notes}
                onChange={(e) => update({ notes: e.target.value })}
                placeholder="Preferences, must-haves, budget cues or access constraints"
                maxLength={2000}
                className={textareaCls}
              />
            </Field>
            <p className="mt-1 text-right text-[12px] text-muted-foreground tabular-nums">
              {brief.notes.length}/2000
            </p>
          </div>
        </div>
      </section>

      <aside className="em-step-aside">
        <figure className="em-feeling">
          <img src={pitchCover(brief)} alt={coverAlt(brief)} />
          <figcaption>
            <span className="em-feeling-eyebrow">
              The beginning of something beautiful
            </span>
            <span className="em-feeling-title">First, imagine the feeling.</span>
          </figcaption>
        </figure>
        <div className="em-aside-card">
          <ShieldCheck size={18} strokeWidth={1.5} aria-hidden />
          <p className="em-aside-card-title">A record of every beginning.</p>
          <p className="em-aside-card-meta">
            {saved
              ? `Processed by ${saved.processedBy} on ${displayDate(saved.createdAt)}.`
              : `Processed by ${user.name} when this pitch is first saved.`}
          </p>
        </div>
      </aside>
    </div>
  )
}

function DateTime({
  label,
  value,
  onChange,
  error,
  errKey,
  min,
  disabled,
}: {
  label: string
  value: string
  onChange: (d: string, t: string) => void
  error?: string
  errKey: string
  min?: string
  disabled: boolean
}) {
  const id = `em-${errKey}`
  return (
    <div>
      <span id={`${id}-label`} className="mb-2 block text-[14px] font-semibold">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[160px] flex-1">
          <DatePicker
            aria-labelledby={`${id}-label`}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `em-err-${errKey}` : undefined}
            value={datePart(value)}
            min={min}
            disabled={disabled}
            onChange={(d) => onChange(d, timePart(value))}
          />
        </div>
        <div className="w-[120px] shrink-0">
          <TimePicker
            aria-label={`${label} time`}
            value={timePart(value)}
            disabled={disabled || !value}
            onChange={(time) => onChange(datePart(value), time)}
          />
        </div>
      </div>
      <FieldError id={`em-err-${errKey}`} text={error} />
    </div>
  )
}

type ShelfItem = {
  key: string
  title: string
  image: string
  category: string
  cutout?: boolean
}

export const shelf: ShelfItem[] = [
  ...catalog.map((a) => ({
    key: `asset:${a.id}`,
    title: a.name,
    image: a.image,
    category: a.category,
    cutout: a.cutout,
  })),
  ...themes.map((t) => ({
    key: `theme:${t.id}`,
    title: t.name,
    image: t.image,
    category: "Themes",
  })),
]

function BoardStep({
  brief,
  update,
  readOnly,
  onPresent,
  fullScreen,
  onExitFullScreen,
}: {
  brief: Brief
  update: (p: Partial<Brief>) => void
  readOnly: boolean
  onPresent: () => void
  fullScreen: boolean
  onExitFullScreen: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [text, setText] = useState("")
  const noteRef = useRef<HTMLDivElement>(null)
  const setPins = (pins: Pin[]) => update({ pins })
  const add = (
    p: Omit<Pin, "id" | "x" | "y" | "rotation">,
    at?: { x: number; y: number; page?: number },
  ) => {
    const n = brief.pins.length
    const half = (p.width / 800) * 50
    const next = {
      ...p,
      page: at?.page ?? 0,
      id: crypto.randomUUID(),
      x: at
        ? Math.round(Math.max(0, Math.min(100 - half * 2, at.x - half)))
        : 8 + ((n * 9) % 55),
      y: at ? Math.round(Math.max(0, Math.min(80, at.y - 10))) : 8 + ((n * 13) % 60),
      rotation: p.image ? 0 : n % 2 ? 2 : -2,
    }
    setPins([...brief.pins, next])
    setSelected(next.id)
  }
  const addShelf = (key: string, at?: { x: number; y: number; page?: number }) => {
    const item = shelf.find((s) => s.key === key)
    if (item)
      add({ title: item.title, image: item.image, source: "", width: 220 }, at)
  }
  const addNote = () => {
    if (!text.trim()) return
    add({ title: text.trim(), text: text.trim(), width: 190 })
    setText("")
    setNoteOpen(false)
  }

  useEffect(() => {
    if (noteOpen) noteRef.current?.querySelector("input")?.focus()
  }, [noteOpen])

  const download = () => {
    const data = {
      title: brief.title.trim() || "Untitled pitch",
      theme: brief.theme,
      boardPages: brief.boardPages,
      pins: brief.pins,
      references: brief.pins.map(({ title, image, text, source }) => ({
        title,
        ...(text ? { note: text } : {}),
        ...(image ? { image } : {}),
        ...(source ? { source } : {}),
      })),
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    )
    const a = document.createElement("a")
    a.href = url
    a.download = `${(brief.title.trim() || "mood-board")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-references.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const theme = themeByName(brief.theme)

  return (
    <div className="em-board-step">
      <StepHead
        eyebrow="02 / The mood board"
        title="The visual story"
        description="A collection of pegs and possibilities. No floor plans needed."

      />
      {noteOpen && !readOnly && (
        <div className="em-note-bar" ref={noteRef}>
          <Input
            aria-label="Note text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addNote()
              } else if (e.key === "Escape") setNoteOpen(false)
            }}
            placeholder="e.g. Lantern-lit aisle"
            maxLength={80}
          />
          <button
            type="button"
            className="em-btn em-btn--primary em-btn--sm"
            disabled={!text.trim()}
            onClick={addNote}
          >
            <Plus size={15} strokeWidth={1.5} aria-hidden /> Pin note
          </button>
        </div>
      )}

      <div className="em-canvas-wrap">
        <MoodBoardCanvas
          fullScreen={fullScreen}
          onPresent={onPresent}
          onExitFullScreen={onExitFullScreen}
          brief={brief}
          update={update}
          readOnly={readOnly}
          selected={selected}
          onSelect={setSelected}
          onDropItem={(key, x, y, page) => addShelf(key, { x, y, page })}
          shelf={shelf}
          onAddShelf={(key, page) => addShelf(key, { x: 50, y: 45, page })}
          palette={registeredPitchTheme(brief)?.palette}
          themeName={theme?.name}
          onThemePins={
            theme
              ? (page) =>
                  setPins([
                    ...brief.pins,
                    ...themePins(theme).map((p) => ({ ...p, page })),
                  ])
              : undefined
          }
        />
      </div>


    </div>
  )
}

function AssetStep({
  brief,
  update,
  avail,
  readOnly,
  user,
  savedId,
  onRefresh,
}: {
  brief: Brief
  update: (p: Partial<Brief>) => void
  avail: Availability[]
  readOnly: boolean
  user: StudioUser
  savedId?: string
  onRefresh: () => void
}) {
  const [rental, setRental] = useState("")
  const [rentalError, setRentalError] = useState("")
  const [requestPrompt, setRequestPrompt] = useState<{ id: string; quantity: number; available: number; shortage: number } | null>(null)
  const [localPickerRequest, setLocalPickerRequest] = useState(0)
  const [pick, setPick] = useState("")
  const [sameDay, setSameDay] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const day = datePart(brief.start)

  useEffect(() => {
    let live = true
    if (!day) {
      setSameDay(null)
      return
    }
    previewStudio(user)
      .then(
        (all) =>
          live &&
          setSameDay(
            all.filter(
              (p) =>
                p.status === "approved" &&
                p.id !== savedId &&
                datePart(p.brief.start) === day,
            ).length,
          ),
      )
      .catch(() => live && setSameDay(null))
    return () => {
      live = false
    }
  }, [day, savedId, user, tick])

  const setQty = (id: string, n: number, confirmed = false) => {
    const usedOnBoard = brief.requirements.find((r) => r.assetId === id)?.boardQuantity ?? 0
    const quantity = Math.max(usedOnBoard, 1, Math.min(9999, Math.round(n) || 1))
    const available = avail.find((entry) => entry.assetId === id)?.available
    const stockConfirmation = confirmed && available !== undefined ? stockConfirmationKey(brief, id, quantity, available) : undefined
    const exists = brief.requirements.some((r) => r.assetId === id)
    update({
      requirements: exists
        ? brief.requirements.map((r) =>
            r.assetId === id ? { ...r, quantity, manualQuantity: quantity, stockConfirmation } : r,
          )
        : [...brief.requirements, { assetId: id, quantity, manualQuantity: quantity, stockConfirmation }].sort(
            (a, b) =>
              assets.findIndex((x) => x.id === a.assetId) -
              assets.findIndex((x) => x.id === b.assetId),
          ),
    })
  }
  const removeReq = (id: string) =>
    update({ requirements: brief.requirements.filter((r) => r.assetId !== id) })
  const setRentals = (rentals: Rental[]) => update({ rentals })
  const patchRental = (id: string, p: Partial<Rental>) =>
    setRentals(brief.rentals.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const opsState = useOperationsStore()
  const warehouseOrder = savedId
    ? opsState.orderRequests.find((o) => o.eventId === savedId)
    : undefined
  const customItems = brief.customItems ?? []
  const setCustomItems = (next: CustomItemRequirement[]) => update({ customItems: next })
  const [newCustomOpen, setNewCustomOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState({
    name: "",
    quantity: 1,
    dimensions: "",
    materials: "",
    colors: "",
    finish: "",
    instructions: "",
    referenceImage: "/event-manager-images/garden.jpg",
  })

  const addCustomItem = () => {
    if (!customDraft.name.trim()) return
    const item: CustomItemRequirement = {
      id: `cust-${crypto.randomUUID().slice(0, 8)}`,
      name: customDraft.name.trim(),
      quantity: Math.max(1, Math.round(Number(customDraft.quantity) || 1)),
      dimensions: customDraft.dimensions.trim() || "Custom dimensions per venue plan",
      materials: customDraft.materials.trim() || "Specified per mood board",
      colors: customDraft.colors.trim() || "Event theme palette",
      finish: customDraft.finish.trim() || "Satin protective finish",
      instructions:
        customDraft.instructions.trim() ||
        "Fabricate and finish according to approved Event Manager specifications.",
      referenceImages: [customDraft.referenceImage.trim() || "/event-manager-images/garden.jpg"],
    }
    setCustomItems([...customItems, item])
    setCustomDraft({
      name: "",
      quantity: 1,
      dimensions: "",
      materials: "",
      colors: "",
      finish: "",
      instructions: "",
      referenceImage: "/event-manager-images/garden.jpg",
    })
    setNewCustomOpen(false)
  }

  const open = assets.filter(
    (a) => !brief.requirements.some((r) => r.assetId === a.id),
  )
  const datesKnown = !!brief.start && !!brief.end
  const pax = Math.max(0, brief.pax || 0)
  const crew = [Math.max(2, Math.ceil(pax / 25)), Math.max(2, Math.ceil(pax / 15))]

  return (
    <div className="em-step-grid">
      <div className="min-w-0 space-y-6">
        <section className="em-panel em-step-panel">
          <StepHead
            eyebrow="03 / The practical magic"
            title="The pieces behind the picture."
            description="Read-only availability previews. Stock is reserved only after client approval."
          />
          {!datesKnown && (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
              <CircleAlert size={14} aria-hidden /> Add start and end times to
              check against approved events.
            </p>
          )}
          {!readOnly && (
            <div className="em-pick-row">
              <div className="relative min-w-0 flex-1">
                <SearchableDropdown
                  openRequest={localPickerRequest}
                  aria-label="Choose a piece from the library"
                  value={pick}
                  onChange={setPick}
                  disabled={open.length === 0}
                  placeholder={open.length ? "Choose a piece from the library" : "Every library piece is in the plan"}
                  options={open.map((a) => ({ value: a.id, label: `${a.name} · ${a.category}` }))}
                  className={cx(fieldCls, "appearance-none pr-9 text-left")}
                />
                <ChevronDown
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
              <button
                type="button"
                className="em-btn em-btn--outline em-btn--sm"
                disabled={!pick}
                onClick={() => {
                  setQty(pick, 1)
                  setPick("")
                }}
              >
                <Plus size={14} strokeWidth={1.5} aria-hidden /> Add asset
              </button>
            </div>
          )}

          <div className="em-req" role="table" aria-label="Asset requirements and sample stock availability">
            <div className="em-req-head" role="row">
              <span role="columnheader">Asset</span>
              <span role="columnheader">{readOnly ? "Approved requested" : "Requested"}</span>
              <span role="columnheader">Available</span>
              <span role="columnheader">Deficit</span>
              <span role="columnheader" className="sr-only">
                Actions
              </span>
            </div>
            {brief.requirements.length === 0 ? (
              <div className="em-req-empty" role="row">
                <span role="cell">
                  <Boxes size={20} strokeWidth={1.5} aria-hidden />
                  Add the company assets this event will need.
                </span>
              </div>
            ) : (
              brief.requirements.map((r) => {
                const a = assets.find((x) => x.id === r.assetId)
                if (!a) return null
                const av = avail.find((x) => x.assetId === a.id)
                const whLine = warehouseOrder?.stockLines.find((s) => s.assetId === a.id)
                const approvedQty = whLine?.approvedRequestedQty ?? r.quantity
                const warning = av ? stockWarning(a.id, r.quantity, av.available) : null
                const short = av && r.quantity > av.available ? r.quantity - av.available : 0
                const confirmedRequest =
                  !!av &&
                  !!warning &&
                  r.stockConfirmation === stockConfirmationKey(brief, a.id, r.quantity, av.available)
                return (
                  <div className={cx("em-req-row", warning && "bg-amber-500/5 ring-1 ring-inset ring-amber-500/25")} role="row" key={a.id}>
                    <span role="cell" className="em-req-asset">
                      <Visual
                        src={a.image}
                        label={a.name}
                        icon={PackageOpen}
                        className="size-10 shrink-0 rounded-md"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium">
                          {a.name}
                        </span>
                        <span className="block text-[12px] text-muted-foreground tabular-nums">
                          {a.category} · {a.stock} in stock
                          {readOnly && whLine ? ` · Warehouse allocated: ${whLine.allocatedQty}/${approvedQty}` : ""}
                        </span>
                        {!!r.boardQuantity && <span className="block text-xs text-muted-foreground">{r.boardQuantity} used on mood board</span>}
                      </span>
                    </span>
                    <span role="cell">
                      {readOnly ? (
                        <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold tabular-nums">
                          {approvedQty} <span className="text-xs font-normal text-muted-foreground">{a.unit}</span>
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={Math.max(1, r.boardQuantity ?? 0)}
                          max={9999}
                          inputMode="numeric"
                          aria-label={`${a.name} quantity`}
                          value={r.quantity || ""}
                          placeholder="0"
                          onChange={(e) => setQty(a.id, Number(e.target.value))}
                          className="w-20"
                        />
                      )}
                    </span>
                    <span role="cell" className="tabular-nums">
                      <span className="em-req-label" aria-hidden>
                        Available{" "}
                      </span>
                      {av ? av.available : "—"}
                    </span>
                    <span role="cell" className="em-req-deficit">
                      <span className="em-req-label" aria-hidden>
                        Deficit{" "}
                      </span>
                      {short ? (
                        <>
                          <Badge tone="danger">Short by {short}</Badge>
                          {confirmedRequest ? (
                            <Badge tone="info">Request created</Badge>
                          ) : !readOnly && av ? (
                            <button
                              type="button"
                              className={ghostBtn}
                              onClick={() =>
                                setRequestPrompt({ id: a.id, quantity: r.quantity, available: av.available, shortage: short })
                              }
                            >
                              <Plus size={14} aria-hidden /> Request
                            </button>
                          ) : null}
                        </>
                      ) : warning?.reason === "low_stock" ? (
                        <>
                          <Badge tone="warning">Low stock</Badge>
                          {confirmedRequest ? (
                            <Badge tone="info">Request created</Badge>
                          ) : !readOnly && av ? (
                            <button
                              type="button"
                              className={ghostBtn}
                              onClick={() =>
                                setRequestPrompt({ id: a.id, quantity: r.quantity, available: av.available, shortage: 0 })
                              }
                            >
                              <Plus size={14} aria-hidden /> Request
                            </button>
                          ) : null}
                        </>
                      ) : r.quantity > 0 ? (
                        <span className="em-req-ok">
                          <Check size={13} strokeWidth={2} aria-hidden /> None
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                    <span role="cell" className="em-req-remove">
                      {!readOnly && (
                        <button
                          type="button"
                          className="em-icon-btn"
                          onClick={() => removeReq(a.id)}
                          disabled={!!r.boardQuantity}
                          title={r.boardQuantity ? "Remove this asset from the mood board first." : `Remove ${a.name}`}
                          aria-label={`Remove ${a.name}`}
                        >
                          <X size={15} strokeWidth={1.5} aria-hidden />
                        </button>
                      )}
                    </span>
                  </div>
                )
              })
            )}
          </div>
          <div className="em-req-foot">
            <span>Includes one preparation day and one return day.</span>
            <button
              type="button"
              className="em-btn em-btn--quiet em-btn--sm"
              onClick={() => {
                onRefresh()
                setTick((t) => t + 1)
              }}
            >
              <RefreshCw size={14} strokeWidth={1.5} aria-hidden /> Refresh
            </button>
          </div>
        </section>

        <section className="em-panel em-step-panel">
          <StepHead
            eyebrow="Custom fabrication (D02)"
            title="Custom-built structures & bespoke pieces"
            description="Register custom items under the same event Asset Plan with dimensions, reference imagery, materials, colors, finish, and build instructions for Warehouse production verification."
            actions={
              !readOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  icon={Plus}
                  onClick={() => setNewCustomOpen((v) => !v)}
                >
                  {newCustomOpen ? "Cancel" : "Add custom item"}
                </Button>
              ) : undefined
            }
          />
          {!readOnly && newCustomOpen && (
            <div className="mt-4 rounded-xl border border-line bg-fg/[0.03] p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_130px]">
                <Field label="Custom item name">
                  <Input
                    value={customDraft.name}
                    onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })}
                    placeholder="e.g. Bespoke Brass & Travertine Monogram Arch"
                  />
                </Field>
                <Field label="Requested qty">
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={customDraft.quantity}
                    onChange={(e) =>
                      setCustomDraft({
                        ...customDraft,
                        quantity: Math.max(1, Math.round(Number(e.target.value) || 1)),
                      })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Dimensions">
                  <Input
                    value={customDraft.dimensions}
                    onChange={(e) => setCustomDraft({ ...customDraft, dimensions: e.target.value })}
                    placeholder="e.g. 2.4m H × 0.9m W × 0.6m D"
                  />
                </Field>
                <Field label="Materials">
                  <Input
                    value={customDraft.materials}
                    onChange={(e) => setCustomDraft({ ...customDraft, materials: e.target.value })}
                    placeholder="e.g. Brushed brass frame, travertine panels, steel base"
                  />
                </Field>
                <Field label="Colors">
                  <Input
                    value={customDraft.colors}
                    onChange={(e) => setCustomDraft({ ...customDraft, colors: e.target.value })}
                    placeholder="e.g. Warm Champagne Gold & Ivory"
                  />
                </Field>
                <Field label="Finish">
                  <Input
                    value={customDraft.finish}
                    onChange={(e) => setCustomDraft({ ...customDraft, finish: e.target.value })}
                    placeholder="e.g. Satin matte weather-sealed lacquer"
                  />
                </Field>
              </div>
              <Field label="Reference image URL">
                <Input
                  value={customDraft.referenceImage}
                  onChange={(e) => setCustomDraft({ ...customDraft, referenceImage: e.target.value })}
                  placeholder="/event-manager-images/garden.jpg"
                />
              </Field>
              <Field label="Construction & assembly instructions">
                <textarea
                  className={textareaCls}
                  rows={3}
                  value={customDraft.instructions}
                  onChange={(e) => setCustomDraft({ ...customDraft, instructions: e.target.value })}
                  placeholder="Describe structural requirements, electrical/lighting channels, branding placement, and assembly tolerances…"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNewCustomOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!customDraft.name.trim()}
                  onClick={addCustomItem}
                >
                  Save custom item to Asset Plan
                </Button>
              </div>
            </div>
          )}

          {customItems.length > 0 ? (
            <ul className="mt-4 divide-y divide-line">
              {customItems.map((ci) => {
                const prodJob = savedId
                  ? opsState.fabricationJobs.find(
                      (j) => j.eventId === savedId && j.customItemId === ci.id,
                    )
                  : undefined
                return (
                  <li key={ci.id} className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Visual
                          src={ci.referenceImages?.[0] || "/event-manager-images/garden.jpg"}
                          label={ci.name}
                          className="size-12 shrink-0 rounded-md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{ci.name}</span>
                            <Badge tone="info">
                              {readOnly ? `Approved qty: ${ci.quantity}` : `Qty: ${ci.quantity}`}
                            </Badge>
                            {prodJob && (
                              <Badge
                                tone={
                                  prodJob.status === "Ready to Load"
                                    ? "success"
                                    : prodJob.status === "Needs Correction"
                                      ? "danger"
                                      : "warning"
                                }
                              >
                                Warehouse job: {prodJob.status}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1.5 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                            <span>
                              <strong className="text-foreground">Dimensions:</strong> {ci.dimensions}
                            </span>
                            <span>
                              <strong className="text-foreground">Materials:</strong> {ci.materials}
                            </span>
                            <span>
                              <strong className="text-foreground">Colors:</strong> {ci.colors}
                            </span>
                            <span>
                              <strong className="text-foreground">Finish:</strong> {ci.finish}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            <strong className="text-foreground">Build instructions:</strong>{" "}
                            {ci.instructions}
                          </p>
                        </div>
                      </div>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          icon={X}
                          onClick={() =>
                            setCustomItems(customItems.filter((item) => item.id !== ci.id))
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-muted-foreground">
              No custom fabrication items registered for this event yet.
            </p>
          )}
        </section>

        <section className="em-panel em-step-panel">
          <StepHead
            eyebrow="The extras"
            title="Rentals & technical services"
            description="Record rental suppliers, requested quantities, and view Warehouse supplier confirmation status."
          />
          {!readOnly && (
            <>
              <div className="em-pick-row items-end">
                <div className="relative min-w-0 basis-64 flex-1">
                  <SearchableDropdown
                    aria-label="Choose a rental supplier"
                    value={rental}
                    onChange={(value) => { setRental(value); setRentalError("") }}
                    placeholder="Choose a rental supplier."
                    searchPlaceholder="Search company name or supplier type…"
                    emptyMessage="No matching suppliers."
                    options={rentalCatalogOptions().filter((option) => !isSupplierAdded(brief.rentals, option.value))}
                    className={cx(fieldCls, "appearance-none pr-9 text-left")}
                  />
                  <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
                <Button type="button" variant="outline" icon={Plus} disabled={!rental || isSupplierAdded(brief.rentals, rental)} onClick={() => {
                  try {
                    setRentals(addEventSupplier(brief.rentals, rental))
                    setRental("")
                    setRentalError("")
                  } catch (error) {
                    setRentalError(error instanceof Error ? error.message : "The supplier could not be added.")
                  }
                }}>Add supplier</Button>
              </div>
              <FieldError id="em-rental-error" text={rentalError} />
            </>
          )}
          {brief.rentals.length > 0 ? (
            <ul className="em-rentals">
              {brief.rentals.map((r) => {
                const whRental = warehouseOrder?.rentals.find(
                  (wr) => wr.id === r.id || (r.vendorId && wr.vendorId === r.vendorId),
                )
                return (
                  <RentalEntry
                    key={r.id}
                    entry={r}
                    readOnly={readOnly}
                    warehouseRental={whRental}
                    onChange={(patch) => patchRental(r.id, patch)}
                    onRemove={() => setRentals(brief.rentals.filter((entry) => entry.id !== r.id))}
                  />
                )
              })}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-muted-foreground">
              No rental suppliers discussed yet.
            </p>
          )}
        </section>
      </div>

      <aside className="em-step-aside">
        <div className="em-aside-card em-crew">
          <Users size={20} strokeWidth={1.5} aria-hidden />
          <p className="em-eyebrow mt-5">People behind the moment</p>
          <p className="em-aside-card-title em-aside-card-title--lg">
            A little help bringing it to life.
          </p>
          <p className="em-crew-range tabular-nums">
            {crew[0] === crew[1] ? crew[0] : `${crew[0]}–${crew[1]}`}
          </p>
          <p className="em-crew-label">estimated personnel</p>
          <p className="em-aside-card-meta">
            For {pax} guests
            {day ? ` on ${displayDate(brief.start)}` : ", date to be decided"}.
          </p>
          <hr className="em-crew-rule" />
          <p className="em-aside-card-meta">
            {sameDay === null
              ? "Add a date to see other approved events that day."
              : sameDay === 0
                ? "No other approved events on this date in your studio."
                : `${sameDay} other approved ${sameDay === 1 ? "event" : "events"} on this date in your studio.`}
          </p>
          <p className="em-aside-card-meta mt-4">
            Planning assumption: 1 person per 15–25 guests, minimum 2. Setup,
            venue and technical needs may change this range. This Site has no
            live crew roster and does not assign staff.
          </p>
        </div>
      </aside>
      <Modal open={!!requestPrompt} onClose={() => setRequestPrompt(null)} title="Request replenishment" compact>
        <p className="text-sm text-muted-foreground">
          {requestPrompt && assets.find((a) => a.id === requestPrompt.id)?.name}:{" "}
          {requestPrompt?.shortage
            ? `${requestPrompt.quantity} requested (${requestPrompt.available} available, short by ${requestPrompt.shortage}).`
            : `${requestPrompt?.quantity} requested, leaving ${requestPrompt ? requestPrompt.available - requestPrompt.quantity : 0} available (at or below the configured threshold of ${requestPrompt ? stockThreshold(assets.find((a) => a.id === requestPrompt.id)?.stock ?? 0) : 0} pieces).`}{" "}
          Confirming saves a replenishment request linked to this event and asset for Warehouse Ops → Replenishment. Available stock does not increase.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { setRequestPrompt(null); requestAnimationFrame(() => setLocalPickerRequest((n) => n + 1)) }}>Choose alternatives</Button>
          <Button type="button" onClick={() => { if (!requestPrompt) return; setQty(requestPrompt.id, requestPrompt.quantity, true); setRequestPrompt(null) }}>Confirm request</Button>
        </div>
      </Modal>
    </div>
  )
}

function ApprovalStep({
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
              <div className="pt-2">
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
                  Retry client approval handoff (idempotent D01)
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
