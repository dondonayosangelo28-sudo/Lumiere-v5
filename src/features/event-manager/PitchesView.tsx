import {
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import {
  Ban,
  CalendarDays,
  Copy,
  Plus,
  Presentation,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react"
import RowMenu from "../../components/ui/RowMenu"
import { StateCard } from "./PageHead"
import {
  displayDate,
  type Brief,
  type Project,
} from "./model"
import {
  FALLBACK_COVER,
  StatusBadge,
  Visual,
  coverAlt,
  pitchCover,
} from "./shared"

export type OpenPitch = (
  p: Project | null,
  brief?: Brief,
  step?: number,
  restored?: boolean,
) => void

export type StatusFilter = "all" | Project["status"]

// Event Pitches status row; "For presentation" is the existing ready status.
const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All pitches" },
  { value: "draft", label: "Drafts" },
  { value: "ready", label: "For presentation" },
  { value: "approved", label: "Approved" },
]

/** Underlined status navigation for Event Pitches, with roving focus and arrow keys. */
function StatusRow({
  value,
  onChange,
}: {
  value: StatusFilter
  onChange: (v: StatusFilter) => void
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = statusTabs.findIndex((t) => t.value === value)
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % statusTabs.length
        : e.key === "ArrowLeft"
          ? (i - 1 + statusTabs.length) % statusTabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? statusTabs.length - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    onChange(statusTabs[next].value)
    document.getElementById(`em-status-${statusTabs[next].value}`)?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label="Pitch status"
      onKeyDown={onKey}
      className="em-tabs"
    >
      {statusTabs.map((t) => (
        <button
          key={t.value}
          id={`em-status-${t.value}`}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          aria-controls="em-status-panel"
          tabIndex={t.value === value ? 0 : -1}
          onClick={() => onChange(t.value)}
          className="em-tab"
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function PitchCard({
  project: p,
  onOpen,
  menu,
  meta,
}: {
  project: Project
  onOpen: () => void
  menu?: Parameters<typeof RowMenu>[0]["items"]
  meta?: ReactNode
}) {
  const title = p.brief.title || "Untitled pitch"
  return (
    <li data-pitch-id={p.id} className="em-pitch-card">
      <button
        type="button"
        className="em-pitch-card-media"
        onClick={onOpen}
        aria-label={`Open ${title}`}
      >
        <Visual
          src={pitchCover(p.brief)}
          fallbackSrc={FALLBACK_COVER}
          label={coverAlt(p.brief)}
          className="size-full"
        />
        <span className="em-pitch-card-status">
          <StatusBadge status={p.status} />
        </span>
      </button>
      <div className="em-pitch-card-body">
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="em-pitch-card-title" onClick={onOpen}>
            {title}
          </button>
          {menu && (
            <div
              role="group"
              aria-label={`${title} actions`}
              className="-mr-1 -mt-0.5 shrink-0"
            >
              <RowMenu items={menu} />
            </div>
          )}
        </div>
        <p className="em-pitch-card-client" title={p.brief.client}>
          {p.brief.client || "No client yet"}
        </p>
        <div className="em-pitch-card-meta">
          {meta ?? (
            <>
              <span>
                <CalendarDays size={13} strokeWidth={1.5} aria-hidden />
                {displayDate(p.brief.start)}
              </span>
              <span>
                <UsersRound size={13} strokeWidth={1.5} aria-hidden />
                {p.brief.pax} guests
              </span>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export function PitchesView({
  projects,
  open,
  duplicate,
  remove,
  onCancelApproved,
  startNew,
}: {
  projects: Project[]
  open: OpenPitch
  duplicate: (p: Project) => void
  remove: (p: Project) => void
  onCancelApproved?: (p: Project) => void
  startNew: () => void
}) {
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return projects.filter(
      (p) =>
        (status === "all" || p.status === status) &&
        `${p.brief.title} ${p.brief.client} ${p.brief.venue} ${p.brief.theme}`
          .toLowerCase()
          .includes(needle),
    )
  }, [projects, q, status])
  return (
    <>
      <div className="em-toolbar -mt-3">
        <StatusRow value={status} onChange={setStatus} />
        <label className="em-search">
          <Search size={15} strokeWidth={1.5} aria-hidden />
          <span className="sr-only">Search pitches</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find an event or client…"
          />
        </label>
      </div>
      <div
        id="em-status-panel"
        role="tabpanel"
        aria-labelledby={`em-status-${status}`}
      >
        {rows.length === 0 ? (
          projects.length ? (
            <StateCard
              icon={Search}
              title="Nothing matches just yet."
              copy="Try another search, or look across all your pitches."
              action={
                <button
                  type="button"
                  className="em-btn em-btn--outline"
                  onClick={() => {
                    setQ("")
                    setStatus("all")
                  }}
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <StateCard
              icon={Presentation}
              title="Every beautiful event starts here."
              copy="Create a pitch to bring the brief, mood board and every detail together."
              action={
                <button
                  type="button"
                  className="em-btn em-btn--primary"
                  onClick={startNew}
                >
                  <Plus size={15} strokeWidth={1.75} aria-hidden /> Create your
                  first pitch
                </button>
              }
            />
          )
        ) : (
          <ul className="em-card-grid" aria-label="Event pitches">
            {rows.map((p) => (
              <PitchCard
                key={p.id}
                project={p}
                onOpen={() => open(p)}
                menu={[
                  {
                    label: "Open pitch",
                    icon: Presentation,
                    onClick: () => open(p),
                  },
                  {
                    label: "Duplicate",
                    icon: Copy,
                    onClick: () => duplicate(p),
                  },
                  ...(p.status === "approved" && onCancelApproved
                    ? [
                        {
                          label: "Cancel event",
                          icon: Ban,
                          danger: true,
                          onClick: () => onCancelApproved(p),
                        },
                      ]
                    : []),
                  {
                    label: "Delete",
                    icon: Trash2,
                    danger: true,
                    disabled:
                      p.status === "approved"
                        ? "Approved events are read-only"
                        : undefined,
                    onClick: () => remove(p),
                  },
                ]}
              />
            ))}
          </ul>
        )}
        <p className="em-count" aria-live="polite">
          Showing {rows.length} of {projects.length} pitches
        </p>
      </div>
    </>
  )
}

export default PitchesView

