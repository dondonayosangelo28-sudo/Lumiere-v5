import { emailPattern } from "../../auth/store"
import { validateBudget } from "./budget"
import { useState, type KeyboardEvent, type ReactNode } from "react"
import { ImageIcon, type LucideIcon } from "lucide-react"
import { cx } from "../../components/ui"
import { safeImage, themes, type Brief, type Project } from "./model"

export type StudioUser = {
  name: string
  email: string
}
export type StudioTab = "overview" | "pitches" | "boards" | "calendar" | "assets"

export const statusLabel: Record<Project["status"], string> = {
  draft: "Draft",
  ready: "For presentation",
  approved: "Approved",
}
export function StatusBadge({ status }: { status: Project["status"] }) {
  return (
    <span className={cx("em-status", `em-status--${status}`)}>
      {statusLabel[status]}
    </span>
  )
}

/** Neutral pill matching StatusBadge, for states that are not a saved status. */
export function Pill({ children }: { children: ReactNode }) {
  return <span className="em-status em-status--draft">{children}</span>
}

export const themeByName = (name: string) => themes.find((t) => t.name === name)
/** A pitch keeps its own theme snapshot, independent of later registration edits. */
export const registeredPitchTheme = (b: Brief) =>
  b.registeredTheme?.name === b.theme ? b.registeredTheme : undefined

/** Only bundled imagery and safe user-supplied HTTPS links are loaded. */
export const remoteImage = (src?: string) => !!src && safeImage(src)

// User-provided default photograph, independent of moodboard presets.
export const FALLBACK_COVER = "/event-manager-images/planning.jpg"

/** A pitch is always covered by its theme photograph, so every surface shows the same image. */
export const pitchCover = (brief: Brief) =>
  registeredPitchTheme(brief)?.cover ??
  themeByName(brief.theme)?.image ??
  brief.pins.find((pin) => remoteImage(pin.image))?.image ??
  FALLBACK_COVER
export const coverAlt = (brief: Brief) =>
  pitchCover(brief) === FALLBACK_COVER
    ? "Candlelit event reception with hanging greenery, draped fabric and floral tables"
    : themeByName(brief.theme)?.alt ?? `${brief.title || "Event"} inspiration`

export function Visual({
  src,
  label,
  className,
  icon: Icon = ImageIcon,
  palette,
  fallbackSrc,
}: {
  src?: string
  label: string
  className?: string
  icon?: LucideIcon
  palette?: readonly string[]
  fallbackSrc?: string
}) {
  const [loaded, setLoaded] = useState("")
  const [failed, setFailed] = useState<string[]>([])
  const image = src && failed.includes(src) && fallbackSrc ? fallbackSrc : src
  const show = remoteImage(image) && !failed.includes(image!)
  return (
    <div
      className={cx(
        "relative overflow-hidden bg-elev text-muted-foreground",
        className,
      )}
      role="img"
      aria-label={label}
    >
      <div
        className={cx(
          "absolute inset-0 grid place-items-center transition-opacity",
          show && loaded === image && "opacity-0",
        )}
        aria-hidden
      >
        <Icon size={22} strokeWidth={1.5} />
        {palette && (
          <span className="absolute bottom-2 left-2 flex gap-1">
            {palette.map((c) => (
              <span
                key={c}
                className="size-3 rounded-full ring-1 ring-line"
                style={{ background: c }}
              />
            ))}
          </span>
        )}
      </div>
      {show && (
        <img
          key={image}
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setLoaded(image!)}
          onError={() => setFailed((previous) => [...previous, image!])}
          className={cx(
            "absolute inset-0 size-full object-cover transition-opacity",
            loaded === image ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  )
}

export const datePart = (v: string) => v.slice(0, 10)
export const timePart = (v: string) => v.slice(11, 16)
export const combine = (date: string, time: string) =>
  date ? (time ? `${date}T${time}` : date) : ""
export function addOneHour(date: string, time: string): string {
  if (!date) return ""
  if (!time) return date
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const next = new Date(year, month - 1, day, hour + 1, minute)
  const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
  const nextTime = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`
  return combine(nextDate, nextTime)
}
export function clientEmailError(value?: string): string | undefined {
  const email = (value ?? "").trim()
  if (email && !emailPattern.test(email)) return "Enter a valid email address."
}

export type Errors = Partial<Record<"title" | "client" | "clientEmail" | "start" | "end" | "venue" | "pax" | "theme" | "estimatedBudget", string>>

/** Drafts need a title and client; presentation readiness needs a complete brief. */
export function validateBrief(b: Brief, complete: boolean): Errors {
  const e: Errors = {}
  if (!b.title.trim()) e.title = "Enter an event title."
  else if (b.title.trim().length > 120)
    e.title = "Keep the title to 120 characters or fewer."
  if (!b.client.trim()) e.client = "Enter the client name."
  const emailError = clientEmailError(b.clientEmail)
  if (emailError) e.clientEmail = emailError
  if (!Number.isInteger(b.pax) || b.pax < 1 || b.pax > 5000)
    e.pax = "Enter a guest count from 1 to 5,000."
  if (complete && !timePart(b.start)) e.start = "Choose a start date and time."
  if (complete && !timePart(b.end)) e.end = "Choose an end date and time."
  if (timePart(b.start) && timePart(b.end) && Date.parse(b.end) <= Date.parse(b.start))
    e.end = "The end must be after the start."
  if (complete && !b.venue.trim()) e.venue = "Enter the venue."
  if (complete && !b.theme.trim()) e.theme = "Enter an event theme."
  else if (b.theme.trim().length > 120) e.theme = "Keep the theme to 120 characters or fewer."
  const budgetError = validateBudget(b.estimatedBudget)
  if (budgetError) e.estimatedBudget = budgetError
  return e
}

export const fmtRange = (b: Brief) => {
  if (!b.start) return "Date to be decided"
  const s = new Date(b.start)
  const e = b.end ? new Date(b.end) : null
  const d = (x: Date) =>
    x.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  const t = (x: Date) =>
    x.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
  if (!e) return `${d(s)}, ${t(s)}`
  return datePart(b.start) === datePart(b.end)
    ? `${d(s)}, ${t(s)} – ${t(e)}`
    : `${d(s)} – ${d(e)}`
}

export const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

/** Compact tab bar reusing the V4 Security tab styling and keyboard model. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: {
    key: T
    label: string
    count?: number
  }[]
  value: T
  onChange: (v: T) => void
  label: string
  idPrefix: string
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.key === value)
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next].key)
    document.getElementById(`${idPrefix}-tab-${tabs[next].key}`)?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className="security-tabs bg-panel"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          id={`${idPrefix}-tab-${t.key}`}
          role="tab"
          type="button"
          aria-selected={value === t.key}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={value === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          className={cx(
            "security-tab",
            value === t.key
              ? "bg-elev text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="tab-count shrink-0 bg-fg/[0.12] tabular-nums">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <div className="em-section-head">
        <div className="min-w-0">
          <h2 className="em-section-title">{title}</h2>
          {description && <p className="em-copy mt-1.5">{description}</p>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </section>
  )
}

type FieldErrorProps = {
  id: string
  text?: string
}

export function FieldError({ id, text }: FieldErrorProps) {
  return text ? (
    <p id={id} className="em-error">
      {text}
    </p>
  ) : null
}

export const textareaCls = "em-textarea"

/** Studio form field: small uppercase label above the control. */
export function EmField({
  label,
  required,
  children,
  className,
}: {
  label: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx("em-field", className)}>
      <span className="em-label">
        {label}
        {required && <span aria-hidden> *</span>}
      </span>
      {children}
    </label>
  )
}
