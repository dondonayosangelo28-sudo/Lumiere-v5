import { useNotify } from '../../components/Notifications'
import { Popover } from "@base-ui/react/popover"
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  FileText,
  Home,
  LayoutGrid,
  Loader2,
  MapPin,
  PackageOpen,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
  UsersRound,
  Video,
  X,
} from "lucide-react"
import { Badge, Button, Card, cx } from "../../components/ui"
import Modal from "../../components/Modal"
import DatePicker from "../../components/DatePicker"
import TimePicker from "../../components/TimePicker"
import { useCloseOnOverlay, useOverlayContainer } from "../../components/OverlayLayer"
import RowMenu from "../../components/RowMenu"
import { NavigationContext } from "../../components/NavigationContext"
import type { Route } from "../../components/Shell"
import {
  calendarDays,
  dateKey,
  parseDate,
  shiftMonth,
} from "../../components/calendarDates"
import {
  catalog,
  displayDate,
  newBrief,
  safeImage,
  themePins,
  themes,
  type Brief,
  type Project,
} from "./model"
import { previewStudio } from "./preview-data"
import {
  clearPitchIntent,
  peekPitchIntent,
  requestPitch,
  type PitchIntent,
} from "./intent"
import {
  eventManagerLabel,
  eventManagerRoutes,
  type EventManagerRoute,
  type EventManagerView,
} from "./routes"
import Editor, { type Working } from "./Editor"
import ThemeBoardEditor from "./ThemeBoardEditor"
import { deleteThemeBoard, listThemeBoards, themePitchBrief, type ThemeBoard } from "./theme-boards"
import {
  FALLBACK_COVER,
  StatusBadge,
  Visual,
  coverAlt,
  datePart,
  fmtRange,
  pitchCover,
  type StudioUser,
} from "./shared"

type Theme = (typeof themes)[number]
type EditorState = {
  key: number
  project: Project | null
  brief: Brief
  step: number
  restored?: boolean
}
type StatusFilter = "all" | Project["status"]
// Event Pitches status row; "For presentation" is the existing ready status.
const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All pitches" },
  { value: "draft", label: "Drafts" },
  { value: "ready", label: "For presentation" },
  { value: "approved", label: "Approved" },
]

const pageCopy: Record<EventManagerView, { title: string; copy: string }> = {
  studio: {
    title: "Event Pitches",
    copy: "Every occasion starts with a conversation.",
  },
  concepts: {
    title: "Ideas worth pinning.",
    copy: "Visual references, textures, and themes for your next occasion.",
  },
  creation: {
    title: "Save the date.",
    copy: "Every approved occasion, by the day it comes to life.",
  },
  assets: {
    title: "Asset library",
    copy: "Find the pieces that belong in your next story.",
  },
}

const workingKey = (user: StudioUser) =>
  `lumiere-event-manager-working:${user.email.trim().toLowerCase()}`
const copyBrief = (b: Brief): Brief => ({
  ...b,
  pins: b.pins.map((p) => ({ ...p, id: crypto.randomUUID() })),
  rentals: b.rentals.map((r) => ({ ...r, id: crypto.randomUUID() })),
  requirements: b.requirements.map((r) => ({ ...r })),
})
const byUpdated = (list: Project[]) =>
  [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

export default function EventManager({
  user,
  route = "module-client-pitching",
}: {
  user: StudioUser
  route?: EventManagerRoute
}) {
  const navigation = useContext(NavigationContext)
  const config = eventManagerRoutes[route]
  const label = eventManagerLabel(route)
  const view = config.view
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const setFlash = useNotify()
  // A Dashboard shortcut may ask Event Pitches to open a pitch, a theme or a blank brief.
  const [intent] = useState(() =>
    route === "module-client-pitching" ? peekPitchIntent(user.email) : null,
  )
  const intentHandled = useRef(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [themeBoards, setThemeBoards] = useState<ThemeBoard[]>([])
  const [themeEditor, setThemeEditor] = useState<{ key: number; board: ThemeBoard | null } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [recovered, setRecovered] = useState<Working | null>(null)
  const [deleteTheme, setDeleteTheme] = useState<ThemeBoard | null>(null)
  const [del, setDel] = useState<Project | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  const todayKey = manilaTodayKey()
  const [calDay, setCalDay] = useState(todayKey)
  const [calMonth, setCalMonth] = useState(() => parseDate(todayKey))
  const [calPopoverKey, setCalPopoverKey] = useState<string | null>(null)
  const [calSelectedBlock, setCalSelectedBlock] = useState<SelectedBlockInfo | null>(null)
  const [activities, setActivities] = useState<CalendarActivity[]>(() =>
    readCalendarActivities(user),
  )

  useEffect(() => {
    setActivities(readCalendarActivities(user))
  }, [user])

  const createActivity = useCallback(
    (data: {
      title: string
      date: string
      startTime: string
      endTime: string
      meetingLink?: string
      tags: string[]
    }) => {
      const now = new Date().toISOString()
      const created: CalendarActivity = {
        id: `act-${crypto.randomUUID()}`,
        ...data,
        createdAt: now,
        updatedAt: now,
      }
      const next = [...activities, created].sort((a, b) =>
        `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
      )
      writeCalendarActivities(user, next)
      setActivities(next)
      setCalDay(data.date)
      setCalMonth(parseDate(data.date))
      setCalSelectedBlock(null)
      setFlash({ tone: "success", text: `Added “${created.title}” to calendar.` })
    },
    [user, setFlash, activities],
  )

  const updateActivity = useCallback(
    (
      id: string,
      patch: {
        title: string
        date: string
        startTime: string
        endTime: string
        meetingLink?: string
        tags: string[]
      },
    ) => {
      const now = new Date().toISOString()
      const next = activities
        .map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now } : item))
        .sort((a, b) =>
          `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
        )
      writeCalendarActivities(user, next)
      setActivities(next)
      setFlash({ tone: "success", text: `Updated “${patch.title}”.` })
    },
    [user, setFlash, activities],
  )

  const updateActivityNote = useCallback(
    (id: string, note: string | undefined) => {
      const target = activities.find((item) => item.id === id)
      if (!target) return
      const now = new Date().toISOString()
      const next = activities.map((item) =>
        item.id === id ? { ...item, note, updatedAt: now } : item,
      )
      writeCalendarActivities(user, next)
      setActivities(next)
      setFlash({
        tone: "success",
        text: note
          ? `Saved note for “${target.title}”.`
          : `Removed note from “${target.title}”.`,
      })
    },
    [user, setFlash, activities],
  )

  const deleteActivity = useCallback(
    (id: string) => {
      const target = activities.find((item) => item.id === id)
      if (!target) return
      const next = activities.filter((item) => item.id !== id)
      writeCalendarActivities(user, next)
      setActivities(next)
      setCalSelectedBlock((prev) => (prev?.id === id ? null : prev))
      setFlash({ tone: "success", text: `Removed “${target.title}”.` })
    },
    [user, setFlash, activities],
  )

  const load = useCallback(async () => {
    try {
      const list = await previewStudio(user)
      setProjects(byUpdated(list))
      setThemeBoards(listThemeBoards(user))
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email])

  useEffect(() => {
    load()
  }, [load])

  // Recover an unsaved working copy left by host navigation or a reload.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(workingKey(user))
      if (raw) setRecovered(JSON.parse(raw) as Working)
    } catch {
      /* ignore unreadable working copy */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email])

  const onWorking = useCallback(
    (w: Working | null) => {
      try {
        if (w) sessionStorage.setItem(workingKey(user), JSON.stringify(w))
        else sessionStorage.removeItem(workingKey(user))
      } catch {
        /* storage unavailable */
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [user.email],
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const guard = (action: () => void) =>
    dirty ? setPending(() => action) : action()
  const open = (
    project: Project | null,
    brief?: Brief,
    step = 0,
    restored = false,
  ) =>
    guard(() => {
      setRecovered(null)
      setDirty(false)
      setEditor({
        key: ++seq.current,
        project,
        brief: brief ?? project?.brief ?? newBrief(),
        step,
        restored,
      })
    })
  const openTheme = (board: ThemeBoard | null) =>
    guard(() => {
      setDirty(false)
      setThemeEditor({ key: ++seq.current, board })
    })
  const closeTheme = () =>
    guard(() => {
      setThemeEditor(null)
      setDirty(false)
      setThemeBoards(listThemeBoards(user))
    })
  const onThemeSaved = useCallback(
    () => setThemeBoards(listThemeBoards(user)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.email],
  )
  const close = () =>
    guard(() => {
      setEditor(null)
      setDirty(false)
      onWorking(null)
    })
  const startTheme = (themeId: string, step = 0) => {
    const t = themes.find((x) => x.id === themeId)
    if (t) open(null, { ...newBrief(t.name), pins: themePins(t) }, step)
  }

  const resume = () => {
    if (!recovered) return
    const project = recovered.id
      ? (projects.find((p) => p.id === recovered.id) ?? null)
      : null
    if (recovered.id && !project) {
      setFlash({
        tone: "error",
        text: "The pitch for those unsaved changes no longer exists. They were discarded.",
      })
      discardRecovered()
      return
    }
    setEditor({
      key: ++seq.current,
      project,
      brief: recovered.brief,
      step: recovered.step,
      restored: true,
    })
    setRecovered(null)
  }
  const discardRecovered = () => {
    setRecovered(null)
    onWorking(null)
  }

  const onSaved = useCallback(
    (p: Project | null) => {
      setEditor((current) => (p && current ? { ...current, project: p } : null))
      load()
    },
    [load],
  )

  // Duplicating saves an independent draft copy straight away.
  const duplicate = async (p: Project) => {
    try {
      const copy = await previewStudio(user, {
        action: "save",
        brief: {
          ...copyBrief(p.brief),
          title: `${p.brief.title} (copy)`.slice(0, 120),
        },
        revision: 0,
        status: "draft",
      })
      setFlash({
        tone: "success",
        text: `Duplicated as “${copy.brief.title}”. The copy is a draft.`,
      })
      load()
    } catch (e) {
      setFlash({
        tone: "error",
        text:
          e instanceof Error ? e.message : "The pitch could not be duplicated.",
      })
    }
  }

  const confirmDelete = async () => {
    if (!del || busy) return
    setBusy(true)
    try {
      await previewStudio(user, {
        action: "delete",
        id: del.id,
        revision: del.revision,
      })
      setFlash({ tone: "success", text: `Deleted “${del.brief.title}”.` })
      if (editor?.project?.id === del.id) setEditor(null)
      setDel(null)
      load()
    } catch (e) {
      setFlash({
        tone: "error",
        text: e instanceof Error ? e.message : "The pitch could not be deleted.",
      })
      setDel(null)
      load()
    } finally {
      setBusy(false)
    }
  }

  const viewPitches = () =>
    guard(() => navigation?.go("module-client-pitching"))

  useEffect(() => {
    if (intent) clearPitchIntent(user.email)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!intent || intentHandled.current) return
    if (intent.kind === "new") {
      intentHandled.current = true
      open(null, undefined, intent.step ?? 0)
      return
    }
    if (intent.kind === "theme") {
      intentHandled.current = true
      startTheme(intent.themeId, intent.step ?? 0)
      return
    }
    if (loading) return
    intentHandled.current = true
    if (intent.kind === "registered-theme") {
      const board = themeBoards.find((b) => b.id === intent.id)
      if (board) open(null, themePitchBrief(board), 1)
      else setFlash({ tone: "error", text: "That mood board is no longer saved in this browser." })
      return
    }
    const p = projects.find((x) => x.id === intent.id)
    if (p) open(p, undefined, config.openStep)
    else
      setFlash({
        tone: "error",
        text: "That pitch is no longer saved in this browser.",
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, loading, projects, themeBoards])

  const copy = pageCopy[view]
  const headAction =
    view === "studio" ? (
      <button
        type="button"
        className="em-btn em-btn--primary"
        onClick={() => open(null, undefined, 0)}
      >
        <Plus size={15} strokeWidth={1.75} aria-hidden /> New event pitch
      </button>
    ) : view === "concepts" ? (
      <button
        type="button"
        className="em-btn em-btn--primary"
        onClick={() => openTheme(null)}
      >
        <Plus size={15} strokeWidth={1.75} aria-hidden /> New mood board
      </button>
    ) : undefined

  const nextValidSchedule = useMemo(
    () => getNextValidActivitySchedule(calDay),
    [calDay, calPopoverKey],
  )

  const headSubAction =
    view === "creation" ? (
      <ActivityCreatePopover
        openState={calPopoverKey === "header-add-activity"}
        onOpenChange={(next) =>
          setCalPopoverKey(next ? "header-add-activity" : null)
        }
        defaultDate={nextValidSchedule.date}
        defaultStartTime={nextValidSchedule.startTime}
        defaultEndTime={nextValidSchedule.endTime}
        onCreate={createActivity}
        side="bottom"
        align="end"
        triggerClassName="inline-flex h-9 items-center justify-center rounded-full bg-invert px-4 text-[12.5px] font-semibold text-invert-fg transition-opacity hover:opacity-90"
      >
        Add activity
      </ActivityCreatePopover>
    ) : undefined

  return (
    <div className="em-page">
      {!editor && !themeEditor && (
        <PageHead
          crumb={label}
          eyebrow={label}
          title={copy.title}
          copy={copy.copy}
          action={headAction}
          subAction={headSubAction}
        />
      )}
      {recovered && !editor && !themeEditor && view === "studio" && (
        <div role="status" className="em-notice mb-6">
          <FileText size={16} strokeWidth={1.5} aria-hidden />
          <span className="min-w-0 flex-1">
            You have unsaved changes to “
            {recovered.brief.title.trim() || "Untitled pitch"}” from earlier in
            this session.
          </span>
          <button
            type="button"
            className="em-btn em-btn--quiet em-btn--sm"
            onClick={discardRecovered}
          >
            Discard
          </button>
          <button
            type="button"
            className="em-btn em-btn--primary em-btn--sm"
            onClick={view === "studio" || recovered.id ? resume : viewPitches}
          >
            {view === "studio" || recovered.id
              ? "Resume editing"
              : "View event pitches"}
          </button>
        </div>
      )}

      <div id="em-panel" role="region" aria-label={label}>
        {themeEditor ? (
          <ThemeBoardEditor
            key={themeEditor.key}
            user={user}
            board={themeEditor.board}
            onClose={closeTheme}
            onSaved={onThemeSaved}
            onDirty={setDirty}
          />
        ) : editor ? (
          <Editor
            key={editor.key}
            user={user}
            project={editor.project}
            initialBrief={editor.brief}
            initialStep={editor.step}
            onSaved={onSaved}
            onClose={close}
            onDirty={setDirty}
            onWorking={onWorking}
            restored={editor.restored}
            backLabel={label}
          />
        ) : loading ? (
          <LoadingState view={view} />
        ) : loadError ? (
          <StateCard
            icon={CircleAlert}
            title="We couldn't open your pitches."
            copy="Saved pitches in this browser could not be read. Try again, or clear site data for this preview to start fresh."
            action={
              <button
                type="button"
                className="em-btn em-btn--outline"
                onClick={() => {
                  setLoading(true)
                  load()
                }}
              >
                <RefreshCw size={15} strokeWidth={1.5} aria-hidden /> Try again
              </button>
            }
          />
        ) : view === "studio" ? (
          <PitchesView
            projects={projects}
            open={open}
            duplicate={duplicate}
            remove={setDel}
            startNew={() => open(null, undefined, 0)}
          />
        ) : view === "concepts" ? (
          <ConceptsView
            projects={projects}
            themeBoards={themeBoards}
            startRegisteredTheme={(board) => open(null, themePitchBrief(board), 1)}
            editTheme={openTheme}
            removeTheme={setDeleteTheme}
            open={open}
            startNew={() => open(null, undefined, 1)}
          />
        ) : view === "creation" ? (
          <CalendarView
            projects={projects}
            open={open}
            viewPitches={viewPitches}
            today={todayKey}
            day={calDay}
            setDay={setCalDay}
            month={calMonth}
            setMonth={setCalMonth}
            activePopoverKey={calPopoverKey}
            setActivePopoverKey={setCalPopoverKey}
            selectedBlock={calSelectedBlock}
            setSelectedBlock={setCalSelectedBlock}
            activities={activities}
            onCreateActivity={createActivity}
            onUpdateActivity={updateActivity}
            onUpdateActivityNote={updateActivityNote}
            onDeleteActivity={deleteActivity}
          />
        ) : (
          <AssetsView projects={projects} />
        )}
      </div>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Discard changes?"
        panelClassName="em-discard-dialog"
        compact
      >
        <p className="em-copy">
          Unsaved changes will be lost.
        </p>
        <div className="em-modal-actions">
          <button
            type="button"
            className="em-btn em-btn--outline"
            onClick={() => setPending(null)}
          >
            Keep working
          </button>
          <button
            type="button"
            className="em-btn em-btn--danger"
            onClick={() => {
              const next = pending
              setPending(null)
              setDirty(false)
              onWorking(null)
              next?.()
            }}
          >
            Discard changes
          </button>
        </div>
      </Modal>

      <Modal
        open={!!deleteTheme}
        onClose={() => setDeleteTheme(null)}
        title="Delete this mood board?"
        compact
        lowered
      >
        <p className="em-copy pr-6">
          Delete “{deleteTheme?.details.name}” permanently? Existing pitches won’t change.
        </p>
        <div className="em-modal-actions">
          <button type="button" className="em-btn em-btn--outline" onClick={() => setDeleteTheme(null)}>Keep mood board</button>
          <button type="button" className="em-btn em-btn--danger" onClick={() => {
            if (!deleteTheme) return
            try {
              deleteThemeBoard(user, deleteTheme.id)
              setThemeBoards(listThemeBoards(user))
              setFlash({ tone: "success", text: "Mood board deleted." })
              setDeleteTheme(null)
            } catch {
              setFlash({ tone: "error", text: "The mood board could not be deleted. Please try again." })
              setDeleteTheme(null)
            }
          }}><Trash2 size={15} aria-hidden /> Delete mood board</button>
        </div>
      </Modal>

      <Modal
        open={!!del}
        onClose={() => !busy && setDel(null)}
        title="Delete this pitch?"
        compact
        lowered
      >
        <p className="em-copy pr-6">
          “{del?.brief.title}”{del?.brief.client ? ` for ${del.brief.client}` : ""}{" "}
          will be removed from this browser, including its mood board, asset
          plan and history. This can't be undone.
        </p>
        <div className="em-modal-actions">
          <button
            type="button"
            className="em-btn em-btn--outline"
            onClick={() => setDel(null)}
            disabled={busy}
          >
            Keep pitch
          </button>
          <button
            type="button"
            className="em-btn em-btn--danger"
            onClick={confirmDelete}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Trash2 size={15} strokeWidth={1.5} aria-hidden />
            )}
            {busy ? "Deleting…" : "Delete pitch"}
          </button>
        </div>
      </Modal>
    </div>
  )
}

type Open = (
  p: Project | null,
  brief?: Brief,
  step?: number,
  restored?: boolean,
) => void

function PageHead({
  eyebrow,
  title,
  copy,
  action,
  subAction,
  crumb,
}: {
  eyebrow: string
  title: string
  copy: string
  action?: ReactNode
  subAction?: ReactNode
  crumb?: string
}) {
  const navigation = useContext(NavigationContext)
  const home = () => navigation?.go("overview")
  const crumbs = crumb ? ["Dashboard", crumb] : ["Dashboard"]
  return (
    <>
    {/* Same breadcrumb trail as the admin PageHeader. */}
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground"
    >
      <button
        type="button"
        onClick={home}
        className="transition-colors hover:text-foreground"
        aria-label="Home"
      >
        <Home size={16} />
      </button>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={c} className="flex items-center gap-2">
            <ChevronRight size={16} aria-hidden="true" />
            <button
              type="button"
              aria-current={last ? "page" : undefined}
              onClick={() => !last && home()}
              className={cx(
                "rounded-sm transition-colors hover:text-foreground",
                last && "font-semibold text-foreground",
              )}
            >
              {c}
            </button>
          </span>
        )
      })}
    </nav>
    <header className="em-page-head">
      <div className={subAction ? "w-full" : "min-w-0"}>
        <p className="em-eyebrow">{eyebrow}</p>
        <h1 className="em-title">{title}</h1>
        {subAction ? (
          <div className="mt-2 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="em-lede max-w-[640px]" style={{ marginTop: 0 }}>
              {copy}
            </p>
            <div className="shrink-0">{subAction}</div>
          </div>
        ) : (
          <p className="em-lede">{copy}</p>
        )}
      </div>
      {action && <div className="em-page-head-action">{action}</div>}
    </header>
    </>
  )
}

function StateCard({
  icon: Icon,
  title,
  copy,
  action,
  compact,
}: {
  icon: typeof Presentation
  title: string
  copy: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cx("em-state", compact && "em-state--compact")}>
      <span className="em-state-icon" aria-hidden>
        <Icon size={20} strokeWidth={1.4} />
      </span>
      <h2 className="em-state-title">{title}</h2>
      <p className="em-copy max-w-md">{copy}</p>
      {action}
    </div>
  )
}

function LoadingState({ view }: { view: EventManagerView }) {
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading your studio…</span>
      {view === "creation" ? (
        <div className="em-skeleton h-[420px]" aria-hidden />
      ) : (
        <ul className="em-card-grid" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="em-skeleton-card">
              <span className="em-skeleton h-[180px] rounded-none" />
              <span className="em-skeleton mx-5 mt-5 h-5 w-2/3" />
              <span className="em-skeleton mx-5 mb-6 mt-3 h-3.5 w-1/3" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ThemeSwatches({ palette }: { palette: readonly string[] }) {
  return (
    <span className="em-swatches" aria-hidden>
      {palette.map((c) => (
        <span key={c} style={{ background: c }} />
      ))}
    </span>
  )
}

type CardTheme = {
  name: string
  description: string
  category: string
  image?: string
  alt: string
  palette: readonly string[]
}

function ThemeCard({
  theme,
  onSelect,
  action,
  onEdit,
  onDelete,
}: {
  theme: CardTheme
  onSelect: () => void
  action: string
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <li className="min-w-0 relative">
      <button
        type="button"
        className="em-theme-card"
        onClick={onSelect}
        aria-label={`${action}: ${theme.name}${theme.category ? `, ${theme.category}` : ""}. ${theme.description}`}
      >
        <span className="em-theme-card-media">
          <Visual
            src={theme.image}
            fallbackSrc={FALLBACK_COVER}
            label={theme.alt}
            palette={theme.palette}
            className="size-full"
          />
          {theme.category && (
            <span className="em-overlay-pill">{theme.category}</span>
          )}
          {!onEdit && !onDelete && <span className="em-card-arrow" aria-hidden>
            <ArrowUpRight size={15} strokeWidth={1.5} />
          </span>}
        </span>
        <span className="em-theme-card-body">
          <span className="flex items-start justify-between gap-3">
            <span className="em-card-title">{theme.name}</span>
            <ThemeSwatches palette={theme.palette} />
          </span>
          <span className="em-card-copy">{theme.description}</span>
        </span>
      </button>
      {(onEdit || onDelete) && (
        <div className="absolute right-3 top-3 rounded-full border border-line bg-card text-foreground shadow-sm" role="group" aria-label={`Manage ${theme.name}`}>
          <RowMenu menuClassName="em-board-actions-menu" items={[
            ...(onEdit ? [{ label: "Edit board", icon: FileText, onClick: onEdit }] : []),
            ...(onDelete ? [{ label: "Delete board", icon: Trash2, danger: true, onClick: onDelete }] : []),
          ]} />
        </div>
      )}
    </li>
  )
}

/** Event Manager Dashboard: welcome, inspiration, recent pitches and the process. */
export function StudioDashboard({
  user,
  go,
}: {
  user: StudioUser
  go: (r: Route) => void
}) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [dashboardThemes, setDashboardThemes] = useState<ThemeBoard[] | null>(null)
  const [themesFailed, setThemesFailed] = useState(false)
  useEffect(() => {
    try {
      setDashboardThemes(listThemeBoards(user))
      setThemesFailed(false)
    } catch {
      setDashboardThemes([])
      setThemesFailed(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    previewStudio(user)
      .then((list) => live && setProjects(byUpdated(list)))
      .catch(() => live && (setFailed(true), setProjects([])))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email])
  const toPitches = (intent?: PitchIntent) => {
    if (intent) requestPitch(user.email, intent)
    go("module-client-pitching")
  }
  const newPitch = () => toPitches({ kind: "new" })
  const recent = projects?.slice(0, 4) ?? []
  const presenting = projects?.filter((p) => p.status === "ready").slice(0, 4) ?? []

  return (
    <div className="em-page em-dashboard">
      <PageHead
        eyebrow="Your creative command center"
        title="Your studio, at a glance."
        copy="A space for the ideas, people, and details that make an event."
        action={
          <button
            type="button"
            className="em-btn em-btn--primary"
            onClick={newPitch}
          >
            <Plus size={15} strokeWidth={1.75} aria-hidden /> New event pitch
          </button>
        }
      />

      <section className="em-hero" aria-labelledby="em-hero-title">
        <div className="em-hero-copy">
          <p className="em-eyebrow">From the first spark to the final detail</p>
          <h2 id="em-hero-title" className="em-hero-title">
            Every detail,
            <em>beautifully considered.</em>
          </h2>
          <p className="em-hero-text">
            Bring your client's vision into focus. Pitch the idea, shape the
            feeling, and plan what comes next.
          </p>
          <div className="em-hero-actions">
            <button
              type="button"
              className="em-btn em-btn--primary"
              onClick={newPitch}
            >
              Create your next event{" "}
              <ArrowRight size={15} strokeWidth={1.5} aria-hidden />
            </button>
            <span className="em-hero-note">
              <span aria-hidden className="em-dot" />
              One workspace. From pitch to approval.
            </span>
          </div>
        </div>
        <figure className="em-hero-media">
          <img
            src="/event-manager-images/garden.jpg"
            alt="Candlelit reception hall with chandeliers, columns and dressed banquet tables"
          />
          <span className="em-hero-index">01 / The possibilities</span>
          <figcaption>
            <span className="em-eyebrow">The Lumière approach</span>
            <span className="em-hero-caption">Gather beautifully.</span>
          </figcaption>
        </figure>
      </section>

      <section className="em-section" aria-labelledby="em-inspiration">
        <div className="em-section-head">
          <div>
            <p className="em-eyebrow">A little inspiration</p>
            <h2 id="em-inspiration" className="em-section-title">
              Start with a feeling.
            </h2>
          </div>
          <button
            type="button"
            className="em-link"
            onClick={() => go("module-event-concepts")}
          >
            Explore all themes <ArrowRight size={14} aria-hidden />
          </button>
        </div>
        <ul className="em-card-grid" aria-label="Theme inspiration">
          {dashboardThemes?.slice(0, 3).map((b) => (
            <ThemeCard
              key={b.id}
              theme={{
                name: b.details.name,
                category: b.details.category,
                description: b.details.description,
                image: b.details.cover ?? b.pins.find((p) => p.image && safeImage(p.image))?.image,
                alt: `${b.details.name} cover`,
                palette: b.details.palette,
              }}
              action="Start a pitch from"
              onSelect={() => toPitches({ kind: "registered-theme", id: b.id })}
            />
          ))}
        </ul>
        {dashboardThemes?.length === 0 && (
          <StateCard
            compact
            icon={LayoutGrid}
            title={themesFailed ? "Themes could not be loaded." : "Your next theme starts here."}
            copy={themesFailed ? "Open Mood Boards to review your collection." : "Create a mood board to use as the starting point for a pitch."}
            action={<button type="button" className="em-btn em-btn--outline" onClick={() => go("module-event-concepts")}>Open mood boards</button>}
          />
        )}
      </section>

      <div className="em-split">
        <section
          className="em-panel em-panel-pad"
          aria-labelledby="em-drawing-board"
        >
          <div className="em-section-head">
            <div>
              <p className="em-eyebrow">Recent work</p>
              <h2 id="em-drawing-board" className="em-section-title">
                On your drawing board
              </h2>
            </div>
            <button
              type="button"
              className="em-link"
              onClick={() => toPitches()}
            >
              View all pitches <ArrowRight size={14} aria-hidden />
            </button>
          </div>
          {failed && (
            <p className="em-error mb-3">
              Saved pitches in this browser could not be read.
            </p>
          )}
          {!projects ? (
            <div role="status" className="space-y-3">
              <span className="sr-only">Loading pitches…</span>
              {[0, 1, 2].map((i) => (
                <span key={i} className="em-skeleton block h-14" aria-hidden />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <StateCard
              compact
              icon={Presentation}
              title="Your next chapter is waiting."
              copy="Capture a client's brief and shape it into a pitch worth presenting."
              action={
                <button
                  type="button"
                  className="em-btn em-btn--primary"
                  onClick={newPitch}
                >
                  <Plus size={15} strokeWidth={1.75} aria-hidden /> Create your
                  first pitch
                </button>
              }
            />
          ) : (
            <ul className="em-rows" aria-labelledby="em-drawing-board">
              {recent.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="em-row"
                    data-pitch-id={p.id}
                    onClick={() => toPitches({ kind: "open", id: p.id })}
                  >
                    <Visual
                      src={pitchCover(p.brief)}
                      fallbackSrc={FALLBACK_COVER}
                      label={coverAlt(p.brief)}
                      className="em-row-thumb"
                    />
                    <span className="min-w-0">
                      <span className="em-row-title">
                        {p.brief.title || "Untitled pitch"}
                      </span>
                      <span className="em-row-meta">
                        {p.brief.client || "No client yet"} ·{" "}
                        {displayDate(p.brief.start)}
                      </span>
                    </span>
                    <StatusBadge status={p.status} />
                    <ArrowRight
                      size={16}
                      strokeWidth={1.5}
                      className="em-row-arrow"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="em-panel em-panel-pad"
          aria-labelledby="em-for-presentation"
        >
          <div className="em-section-head">
            <div>
              <p className="em-eyebrow">Ready to share</p>
              <h2 id="em-for-presentation" className="em-section-title">
                For presentation
              </h2>
            </div>
          </div>
          {!projects ? (
            <span className="em-skeleton block h-14" aria-hidden />
          ) : presenting.length === 0 ? (
            <StateCard
              compact
              icon={Presentation}
              title="Nothing is ready to present."
              copy="Mark a pitch as For presentation once the board and asset plan are set."
            />
          ) : (
            <ul className="em-rows" aria-labelledby="em-for-presentation">
              {presenting.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="em-row"
                    onClick={() => toPitches({ kind: "open", id: p.id })}
                  >
                    <Visual
                      src={pitchCover(p.brief)}
                      fallbackSrc={FALLBACK_COVER}
                      label={coverAlt(p.brief)}
                      className="em-row-thumb"
                    />
                    <span className="min-w-0">
                      <span className="em-row-title">
                        {p.brief.title || "Untitled pitch"}
                      </span>
                      <span className="em-row-meta">
                        {p.brief.client || "No client yet"} ·{" "}
                        {displayDate(p.brief.start)}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      strokeWidth={1.5}
                      className="em-row-arrow"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  )
}

function PitchesView({
  projects,
  open,
  duplicate,
  remove,
  startNew,
}: {
  projects: Project[]
  open: Open
  duplicate: (p: Project) => void
  remove: (p: Project) => void
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

function PitchCard({
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

function ConceptsView({
  projects,
  themeBoards,
  startRegisteredTheme,
  editTheme,
  removeTheme,
  open,
  startNew,
}: {
  projects: Project[]
  themeBoards: ThemeBoard[]
  startRegisteredTheme: (board: ThemeBoard) => void
  editTheme: (board: ThemeBoard) => void
  removeTheme: (board: ThemeBoard) => void
  open: Open
  startNew: () => void
}) {
  const boards = projects.filter((p) => p.brief.pins.length > 0)
  return (
    <div className="space-y-12">
      <section aria-label="Theme collection">
        <ul className="em-card-grid" aria-label="Theme collection">
            {themeBoards.map((b) => (
              <ThemeCard
                key={b.id}
                theme={{
                  name: b.details.name,
                  category: b.details.category,
                  description: b.details.description,
                  image: b.details.cover ?? b.pins.find((p) => p.image && safeImage(p.image))?.image,
                  alt: `${b.details.name} cover`,
                  palette: b.details.palette,
                }}
                action="Start a pitch from this mood board"
                onSelect={() => startRegisteredTheme(b)}
                onEdit={() => editTheme(b)}
                onDelete={() => removeTheme(b)}
              />
            ))}
        </ul>
      </section>
      <section aria-labelledby="em-your-boards">
        <div className="em-section-head">
          <div>
            <p className="em-eyebrow">Saved with your pitches</p>
            <h2 id="em-your-boards" className="em-section-title">
              Your mood boards
            </h2>
          </div>
        </div>
        {boards.length === 0 ? (
          <StateCard
            icon={LayoutGrid}
            title="No boards pinned yet."
            copy="Choose a theme above, or start a blank board and pin the references that capture the feeling."
            action={
              <button
                type="button"
                className="em-btn em-btn--outline"
                onClick={startNew}
              >
                <Plus size={15} strokeWidth={1.75} aria-hidden /> Start a blank
                board
              </button>
            }
          />
        ) : (
          <ul className="em-card-grid" aria-label="Your mood boards">
            {boards.map((p) => (
              <PitchCard
                key={p.id}
                project={p}
                onOpen={() => open(p, undefined, 1)}
                meta={
                  <>
                    <span>
                      <LayoutGrid size={13} strokeWidth={1.5} aria-hidden />
                      {p.brief.pins.length}{" "}
                      {p.brief.pins.length === 1 ? "pin" : "pins"}
                    </span>
                    <span>{p.brief.theme}</span>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const spans = (p: Project, key: string) =>
  !!p.brief.start &&
  datePart(p.brief.start) <= key &&
  key <= datePart(p.brief.end || p.brief.start)
const mondayShortWeekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const mondayMiniWeekdays = ["M", "T", "W", "T", "F", "S", "S"]
const shortDate = (key: string) =>
  parseDate(key).toLocaleDateString("en-PH", { month: "short", day: "numeric" })

function getManilaNow(): {
  dateKey: string
  hours: number
  minutes: number
  totalMinutes: number
} {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date())
    const year = parts.find((p) => p.type === "year")?.value ?? "2026"
    const month = parts.find((p) => p.type === "month")?.value ?? "01"
    const day = parts.find((p) => p.type === "day")?.value ?? "01"
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10)
    const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10)
    return {
      dateKey: `${year}-${month}-${day}`,
      hours: hour,
      minutes: min,
      totalMinutes: hour * 60 + min,
    }
  } catch {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, "0")
    const d = String(now.getDate()).padStart(2, "0")
    const h = now.getHours()
    const min = now.getMinutes()
    return {
      dateKey: `${y}-${m}-${d}`,
      hours: h,
      minutes: min,
      totalMinutes: h * 60 + min,
    }
  }
}

function manilaTodayKey(): string {
  return getManilaNow().dateKey
}

function getManilaCurrentMonth(): {
  year: number
  month: number
  startKey: string
  endKey: string
  startMs: number
  endMs: number
} {
  const manilaNow = getManilaNow()
  const [yStr, mStr] = manilaNow.dateKey.split("-")
  const year = parseInt(yStr, 10)
  const month = parseInt(mStr, 10)
  const lastDay = new Date(year, month, 0).getDate()
  const startKey = `${yStr}-${mStr}-01`
  const endKey = `${yStr}-${mStr}-${String(lastDay).padStart(2, "0")}`

  const startMs = Date.parse(`${startKey}T00:00:00+08:00`)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthStartKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  const endMs = Date.parse(`${nextMonthStartKey}T00:00:00+08:00`)

  return { year, month, startKey, endKey, startMs, endMs }
}

function parseIsoManilaMs(isoStr: string): number {
  if (!isoStr) return NaN
  const trimmed = isoStr.trim()
  if (!trimmed) return NaN
  if (/[Z+-]\d{2}(:?\d{2})?$/.test(trimmed) || trimmed.endsWith("Z")) {
    return Date.parse(trimmed)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Date.parse(`${trimmed}T00:00:00+08:00`)
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed
    return Date.parse(`${withSeconds}+08:00`)
  }
  return Date.parse(trimmed)
}

function projectHoursInCurrentMonth(p: Project, monthStartMs: number, monthEndMs: number): number {
  if (!p.brief.start) return 0
  const s = parseIsoManilaMs(p.brief.start)
  if (Number.isNaN(s)) return 0
  const e = p.brief.end ? parseIsoManilaMs(p.brief.end) : s + 3_600_000
  const end = Number.isNaN(e) || e <= s ? s + 3_600_000 : e

  const clampedStart = Math.max(s, monthStartMs)
  const clampedEnd = Math.min(end, monthEndMs)
  if (clampedEnd <= clampedStart) return 0
  return Math.max(0.5, (clampedEnd - clampedStart) / 3_600_000)
}

/** Formats a YYYY-MM-DD key as "Saturday 25, April" with the comma after the day number. */
function formatPopupDate(key: string): string {
  const d = parseDate(key)
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" })
  const dayNum = d.getDate()
  const monthName = d.toLocaleDateString("en-US", { month: "long" })
  return `${weekday} ${dayNum}, ${monthName}`
}

function validateHttpsUrl(raw: string): { valid: boolean; url: string; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { valid: true, url: "" }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:" || !parsed.hostname || !parsed.hostname.includes(".")) {
      return {
        valid: false,
        url: trimmed,
        error: "Enter a valid HTTPS link.",
      }
    }
    return { valid: true, url: trimmed }
  } catch {
    return {
      valid: false,
      url: trimmed,
      error: "Enter a valid HTTPS link.",
    }
  }
}

type CalendarMode = "month" | "week" | "day"

interface CalendarActivity {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  meetingLink?: string
  tags: string[]
  note?: string
  type?: string
  venue?: string
  createdAt: string
  updatedAt: string
}

type CalendarEventMetaMap = Record<string, { meetingLink?: string }>

const calendarActivitiesStorageKey = (user: StudioUser) =>
  `lumiere-event-manager-calendar-activities-v1:${user.email.trim().toLowerCase()}`
const calendarEventMetaStorageKey = (user: StudioUser) =>
  `lumiere-event-manager-calendar-meta-v1:${user.email.trim().toLowerCase()}`

function readCalendarActivities(user: StudioUser): CalendarActivity[] {
  try {
    const raw = localStorage.getItem(calendarActivitiesStorageKey(user))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CalendarActivity =>
        Boolean(
          item &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.date === "string" &&
            typeof item.startTime === "string" &&
            typeof item.endTime === "string",
        ),
    )
  } catch {
    return []
  }
}

function writeCalendarActivities(user: StudioUser, list: CalendarActivity[]): void {
  try {
    localStorage.setItem(calendarActivitiesStorageKey(user), JSON.stringify(list))
  } catch {
    /* ignore storage quota errors */
  }
}

function readCalendarEventMeta(user: StudioUser): CalendarEventMetaMap {
  try {
    const raw = localStorage.getItem(calendarEventMetaStorageKey(user))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as CalendarEventMetaMap)
      : {}
  } catch {
    return {}
  }
}

function writeCalendarEventMeta(user: StudioUser, map: CalendarEventMetaMap): void {
  try {
    localStorage.setItem(calendarEventMetaStorageKey(user), JSON.stringify(map))
  } catch {
    /* ignore storage quota errors */
  }
}

const BREAKDOWN_BAR_COLORS = [
  "var(--color-success)",
  "var(--fg)",
  "var(--chart-2)",
  "var(--chart-3)",
]

function startOfMondayWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const dow = d.getDay() // 0 = Sun, 1 = Mon .. 6 = Sat
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d
}

function mondayWeekDays(date: Date): Date[] {
  const start = startOfMondayWeek(date)
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12),
  )
}

function mondayCalendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const start = startOfMondayWeek(first)
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12),
  )
}

function parseClockMinutes(clock: string, fallbackMinutes: number): number {
  if (!clock || !clock.includes(":")) return fallbackMinutes
  const [h, m] = clock.slice(0, 5).split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return fallbackMinutes
  return Math.max(0, Math.min(24 * 60, h * 60 + m))
}

function parseMinutesOfDay(iso: string, fallbackMinutes: number): number {
  if (!iso) return fallbackMinutes
  const timeStr = iso.includes("T") ? iso.slice(11, 16) : iso.slice(0, 5)
  return parseClockMinutes(timeStr, fallbackMinutes)
}

function fmt24(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function getNextValidActivitySchedule(viewingDate: string): {
  date: string
  startTime: string
  endTime: string
} {
  const manila = getManilaNow()
  let targetDate = viewingDate
  if (targetDate < manila.dateKey) {
    targetDate = manila.dateKey
  }

  if (targetDate === manila.dateKey) {
    const nextHour = Math.floor(manila.totalMinutes / 60) + 1
    if (nextHour < 23) {
      const sMin = nextHour * 60
      const eMin = Math.min(24 * 60, (nextHour + 1) * 60)
      return {
        date: targetDate,
        startTime: fmt24(sMin),
        endTime: fmt24(eMin),
      }
    } else {
      // Past 11:00 PM Manila time: advance to tomorrow at 9:00 AM
      const tmrw = parseDate(manila.dateKey)
      tmrw.setDate(tmrw.getDate() + 1)
      return {
        date: dateKey(tmrw),
        startTime: "09:00",
        endTime: "10:00",
      }
    }
  }

  return {
    date: targetDate,
    startTime: "09:00",
    endTime: "10:00",
  }
}

function fmtMinutes12(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const h24 = Math.floor(clamped / 60)
  const m = clamped % 60
  const h12 = h24 % 12 || 12
  const period = h24 >= 12 ? "PM" : "AM"
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

function fmtClock12(clock: string): string {
  if (!clock) return ""
  const timeStr = clock.includes("T") ? clock.slice(11, 16) : clock.slice(0, 5)
  const min = parseClockMinutes(timeStr, 0)
  return fmtMinutes12(min)
}

function fmtEventClockRange(p: Project): string {
  const s = fmtClock12(p.brief.start || "09:00")
  const e = fmtClock12(p.brief.end || p.brief.start || "17:00")
  return `${s} - ${e}`
}

function scheduledHoursForProject(p: Project): number {
  if (!p.brief.start) return 0
  const s = Date.parse(p.brief.start)
  const e = p.brief.end ? Date.parse(p.brief.end) : s + 3_600_000
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 1
  return Math.max(0.5, (e - s) / 3_600_000)
}

function scheduledHoursForActivity(a: CalendarActivity): number {
  const s = parseClockMinutes(a.startTime, 9 * 60)
  const e = parseClockMinutes(a.endTime, s + 60)
  return Math.max(0.5, (e - s) / 60)
}

type DaySegment =
  | {
      kind: "pitch"
      id: string
      project: Project
      dayKey: string
      startMin: number
      endMin: number
      col: number
      totalCols: number
    }
  | {
      kind: "activity"
      id: string
      activity: CalendarActivity
      dayKey: string
      startMin: number
      endMin: number
      col: number
      totalCols: number
    }

type RawDaySegment =
  | {
      kind: "pitch"
      id: string
      project: Project
      dayKey: string
      startMin: number
      endMin: number
    }
  | {
      kind: "activity"
      id: string
      activity: CalendarActivity
      dayKey: string
      startMin: number
      endMin: number
    }

function buildDaySegments(
  dayKeyStr: string,
  approved: Project[],
  activities: CalendarActivity[],
  gridStartMin: number,
  gridEndMin: number,
): DaySegment[] {
  const raw: RawDaySegment[] = []

  approved.forEach((p) => {
    if (!spans(p, dayKeyStr)) return
    const sDate = datePart(p.brief.start)
    const eDate = datePart(p.brief.end || p.brief.start)
    const startsToday = sDate === dayKeyStr
    const endsToday = eDate === dayKeyStr
    const rawStart = startsToday ? parseMinutesOfDay(p.brief.start, 9 * 60) : gridStartMin
    const rawEnd = endsToday
      ? parseMinutesOfDay(p.brief.end || p.brief.start, rawStart + 60)
      : gridEndMin
    const startMin = Math.max(gridStartMin, Math.min(gridEndMin - 30, rawStart))
    const endMin = Math.max(startMin + 45, Math.min(gridEndMin, rawEnd))
    raw.push({
      kind: "pitch",
      id: p.id,
      project: p,
      dayKey: dayKeyStr,
      startMin,
      endMin,
    })
  })

  activities.forEach((act) => {
    if (act.date !== dayKeyStr) return
    const rawStart = parseClockMinutes(act.startTime, 9 * 60)
    const rawEnd = parseClockMinutes(act.endTime, rawStart + 60)
    const startMin = Math.max(gridStartMin, Math.min(gridEndMin - 30, rawStart))
    const endMin = Math.max(startMin + 30, Math.min(gridEndMin, rawEnd))
    raw.push({
      kind: "activity",
      id: act.id,
      activity: act,
      dayKey: dayKeyStr,
      startMin,
      endMin,
    })
  })

  raw.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  // Group overlapping segments into clusters and assign side-by-side columns
  const result: DaySegment[] = []
  let cluster: RawDaySegment[] = []
  let clusterEnd = -1

  const flushCluster = (items: RawDaySegment[]) => {
    if (items.length === 0) return
    const colEnds: number[] = []
    const assigned: { item: RawDaySegment; col: number }[] = []
    for (const item of items) {
      let placedCol = colEnds.findIndex((end) => end <= item.startMin)
      if (placedCol === -1) {
        placedCol = colEnds.length
        colEnds.push(item.endMin)
      } else {
        colEnds[placedCol] = item.endMin
      }
      assigned.push({ item, col: placedCol })
    }
    const totalCols = Math.max(1, colEnds.length)
    for (const { item, col } of assigned) {
      result.push({ ...item, col, totalCols } as DaySegment)
    }
  }

  for (const seg of raw) {
    if (cluster.length === 0 || seg.startMin < clusterEnd) {
      cluster.push(seg)
      clusterEnd = Math.max(clusterEnd, seg.endMin)
    } else {
      flushCluster(cluster)
      cluster = [seg]
      clusterEnd = seg.endMin
    }
  }
  flushCluster(cluster)
  return result
}

function EventPreviewTrigger({
  project,
  openPitch,
  openState,
  onOpenChange,
  className,
  style,
  children,
  ariaLabel,
  onClick,
  dataGridPopKey,
  dataGridBlock,
}: {
  project: Project
  openPitch: (p: Project) => void
  openState: boolean
  onOpenChange: (next: boolean, details?: Popover.Root.ChangeEventDetails) => void
  className?: string
  style?: React.CSSProperties
  children: ReactNode
  ariaLabel?: string
  onClick?: (e: React.MouseEvent) => void
  dataGridPopKey?: string
  dataGridBlock?: boolean
}) {
  const container = useOverlayContainer()
  const titleId = useId()
  useCloseOnOverlay(() => onOpenChange(false))

  const sDate = datePart(project.brief.start)
  const eDate = datePart(project.brief.end || project.brief.start)
  const formattedDate =
    sDate === eDate
      ? formatPopupDate(sDate)
      : `${formatPopupDate(sDate)} – ${formatPopupDate(eDate)}`
  const startClock12 = fmtClock12(project.brief.start || "09:00")
  const endClock12 = fmtClock12(project.brief.end || project.brief.start || "17:00")

  return (
    <Popover.Root open={openState} modal={false} onOpenChange={onOpenChange}>
      <Popover.Trigger
        type="button"
        aria-label={ariaLabel}
        style={style}
        className={className}
        onClick={onClick}
        data-grid-pop-key={dataGridPopKey}
        data-grid-block={dataGridBlock ? "true" : undefined}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner
          side="right"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="z-[100] max-w-[calc(100vw-24px)]"
        >
          <Popover.Popup
            aria-labelledby={titleId}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                onOpenChange(false)
              }
            }}
            className="w-[292px] max-w-[calc(100vw-24px)] max-h-[var(--available-height)] overflow-y-auto rounded-xl border border-line bg-card p-4 font-sans text-foreground shadow-2xl outline-none animate-fade-up"
          >
            <div className="flex items-start justify-between gap-2">
              <h3
                id={titleId}
                className="text-[15px] font-semibold leading-snug text-foreground"
              >
                {project.brief.title}
              </h3>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2 rounded-lg bg-fg/[0.05] px-2.5 py-2 text-[12.5px] font-medium text-foreground">
                <CalendarDays size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                <span>{formattedDate}</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center justify-between rounded-lg bg-fg/[0.05] px-2.5 py-2 text-[12.5px] font-medium tabular-nums text-foreground">
                  <span>{startClock12}</span>
                  <ChevronDown size={12} className="text-muted-foreground" aria-hidden />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-fg/[0.05] px-2.5 py-2 text-[12.5px] font-medium tabular-nums text-foreground">
                  <span>{endClock12}</span>
                  <ChevronDown size={12} className="text-muted-foreground" aria-hidden />
                </div>
              </div>

              {project.brief.venue && (
                <div className="flex items-start gap-2 rounded-lg bg-fg/[0.05] px-2.5 py-2 text-[12.5px] font-medium text-foreground">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 break-words whitespace-normal leading-snug">
                    {project.brief.venue}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="success">Approved</Badge>
              {project.brief.theme && <Badge tone="neutral">{project.brief.theme}</Badge>}
              <Badge tone="neutral">{project.brief.pax} guests</Badge>
              {project.brief.client && <Badge tone="info">{project.brief.client}</Badge>}
            </div>

            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                openPitch(project)
              }}
              className="mt-3.5 w-full"
            >
              View approved pitch
            </Button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface ActivityFieldErrors {
  title?: string
  date?: string
  time?: string
  meetingLink?: string
}

function ActivityForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: {
    title: string
    date: string
    startTime: string
    endTime: string
    meetingLink?: string
    tags?: string[]
  }
  onSave: (data: {
    title: string
    date: string
    startTime: string
    endTime: string
    meetingLink?: string
    tags: string[]
  }) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [date, setDate] = useState(initial.date)
  const [startTime, setStartTime] = useState(initial.startTime)
  const [endTime, setEndTime] = useState(initial.endTime)
  const [meetingLink, setMeetingLink] = useState(initial.meetingLink ?? "")
  const [tags, setTags] = useState<string[]>(initial.tags ?? [])
  const [tagInput, setTagInput] = useState("")
  const [errors, setErrors] = useState<ActivityFieldErrors>({})
  const titleErrorId = useId()
  const dateErrorId = useId()
  const timeErrorId = useId()
  const linkErrorId = useId()
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleInputRef.current?.focus({ preventScroll: true })
  }, [])

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      const clean = tagInput.trim()
      if (clean && !tags.includes(clean)) {
        setTags((prev) => [...prev, clean])
      }
      setTagInput("")
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: ActivityFieldErrors = {}
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      nextErrors.title = "Enter an activity title."
    }
    const manilaNow = getManilaNow()
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      nextErrors.date = "Select a valid date."
    } else if (date < manilaNow.dateKey) {
      nextErrors.date = "Date cannot be in the past."
    }
    const sMin = parseClockMinutes(startTime, -1)
    const eMin = parseClockMinutes(endTime, -1)
    if (sMin < 0 || eMin < 0 || eMin <= sMin) {
      nextErrors.time = "End time must be after start time."
    } else if (date === manilaNow.dateKey && sMin <= manilaNow.totalMinutes) {
      nextErrors.time = "Start time cannot be in the past."
    }
    const urlCheck = validateHttpsUrl(meetingLink)
    if (!urlCheck.valid) {
      nextErrors.meetingLink = urlCheck.error ?? "Enter a valid HTTPS link."
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    onSave({
      title: cleanTitle,
      date,
      startTime: fmt24(sMin),
      endTime: fmt24(eMin),
      meetingLink: urlCheck.url || undefined,
      tags,
    })
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-foreground">Title</span>
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            aria-invalid={!!errors.title || undefined}
            aria-describedby={errors.title ? titleErrorId : undefined}
            onChange={(e) => {
              setTitle(e.target.value)
              if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }))
            }}
            placeholder="Activity title"
            className="h-9 w-full rounded-md border border-line bg-fg/[0.06] px-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-fg/30 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-400"
          />
        </label>
        {errors.title && (
          <p id={titleErrorId} role="alert" className="mt-1 text-[12px] text-danger">
            {errors.title}
          </p>
        )}
      </div>

      <div>
        <span className="mb-1 block text-[12px] font-semibold text-foreground">Date</span>
        <DatePicker
          value={date}
          min={getManilaNow().dateKey}
          aria-invalid={!!errors.date || undefined}
          aria-describedby={errors.date ? dateErrorId : undefined}
          onChange={(nextDate) => {
            setDate(nextDate)
            if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }))
          }}
        />
        {errors.date && (
          <p id={dateErrorId} role="alert" className="mt-1 text-[12px] text-danger">
            {errors.date}
          </p>
        )}
      </div>

      <div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-foreground">Start</span>
            <TimePicker
              value={startTime}
              aria-invalid={!!errors.time || undefined}
              aria-describedby={errors.time ? timeErrorId : undefined}
              onChange={(nextTime) => {
                setStartTime(nextTime)
                if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }))
              }}
            />
          </div>
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-foreground">End</span>
            <TimePicker
              value={endTime}
              aria-invalid={!!errors.time || undefined}
              aria-describedby={errors.time ? timeErrorId : undefined}
              onChange={(nextTime) => {
                setEndTime(nextTime)
                if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }))
              }}
            />
          </div>
        </div>
        {errors.time && (
          <p id={timeErrorId} role="alert" className="mt-1 text-[12px] text-danger">
            {errors.time}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-[12px] font-semibold text-foreground">
            Meeting link
          </label>
          {meetingLink.trim() && (
            <button
              type="button"
              onClick={() => {
                setMeetingLink("")
                if (errors.meetingLink) setErrors((prev) => ({ ...prev, meetingLink: undefined }))
              }}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Remove
            </button>
          )}
        </div>
        <input
          type="url"
          value={meetingLink}
          aria-invalid={!!errors.meetingLink || undefined}
          aria-describedby={errors.meetingLink ? linkErrorId : undefined}
          onChange={(e) => {
            setMeetingLink(e.target.value)
            if (errors.meetingLink) setErrors((prev) => ({ ...prev, meetingLink: undefined }))
          }}
          placeholder="https://meet.google.com/..."
          className="h-9 w-full rounded-md border border-line bg-fg/[0.06] px-2.5 text-[12.5px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-fg/30 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-400"
        />
        {errors.meetingLink && (
          <p id={linkErrorId} role="alert" className="mt-1 text-[12px] text-danger">
            {errors.meetingLink}
          </p>
        )}
      </div>

      <div>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-foreground">
            Tags
          </span>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Type a tag and press Enter"
            className="h-9 w-full rounded-md border border-line bg-fg/[0.06] px-2.5 text-[12.5px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-fg/30"
          />
        </label>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected tags">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-fg/[0.08] px-2.5 py-0.5 text-[11.5px] font-semibold text-foreground ring-1 ring-inset ring-line"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag} tag`}
                  onClick={() => removeTag(tag)}
                  className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-fg/10 hover:text-foreground"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 size={13} aria-hidden />
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-8 px-3 text-[12px]"
          >
            Cancel
          </Button>
          <Button type="submit" className="h-8 px-3 text-[12px]">
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}

function ActivityPreviewTrigger({
  activity,
  onUpdate,
  onUpdateNote,
  onDelete,
  openState,
  onOpenChange,
  className,
  style,
  children,
  ariaLabel,
  onClick,
  dataGridPopKey,
  dataGridBlock,
}: {
  activity: CalendarActivity
  onUpdate: (
    id: string,
    patch: {
      title: string
      date: string
      startTime: string
      endTime: string
      meetingLink?: string
      tags: string[]
    },
  ) => void
  onUpdateNote: (id: string, note: string | undefined) => void
  onDelete: (id: string) => void
  openState: boolean
  onOpenChange: (next: boolean, details?: Popover.Root.ChangeEventDetails) => void
  className?: string
  style?: React.CSSProperties
  children: ReactNode
  ariaLabel?: string
  onClick?: (e: React.MouseEvent) => void
  dataGridPopKey?: string
  dataGridBlock?: boolean
}) {
  const container = useOverlayContainer()
  const titleId = useId()
  const [editing, setEditing] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(activity.note ?? "")
  const noteInputRef = useRef<HTMLTextAreaElement>(null)

  useCloseOnOverlay(() => onOpenChange(false))

  useEffect(() => {
    if (!openState) {
      setEditing(false)
      setEditingNote(false)
    }
  }, [openState])

  useEffect(() => {
    if (editingNote) {
      noteInputRef.current?.focus({ preventScroll: true })
    }
  }, [editingNote])

  const formattedDate = formatPopupDate(activity.date)
  const startClock12 = fmtClock12(activity.startTime)
  const endClock12 = fmtClock12(activity.endTime)

  const handleOpenChange = (next: boolean, details?: Popover.Root.ChangeEventDetails) => {
    if (!next) {
      const target = (details?.event as Event | undefined)?.target as Element | null
      const isPickerOpen = !!document.querySelector(".dropdown-surface")
      if (details?.reason === "escape-key" && isPickerOpen) {
        return
      }
      const isPickerOrFormClick = !!target?.closest?.(
        '[data-activity-popup], .dropdown-surface, [data-date], .time-picker-column, [aria-label="Select time"], [role="radiogroup"]'
      )
      if (details?.reason === "outside-press" && isPickerOrFormClick) {
        return
      }
    }
    onOpenChange(next, details)
  }

  return (
    <Popover.Root open={openState} modal={false} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        type="button"
        aria-label={ariaLabel}
        style={style}
        className={className}
        onClick={onClick}
        data-grid-pop-key={dataGridPopKey}
        data-grid-block={dataGridBlock ? "true" : undefined}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner
          side="right"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="z-[100] max-w-[calc(100vw-24px)]"
        >
          <Popover.Popup
            data-activity-popup="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (document.querySelector(".dropdown-surface")) {
                  e.preventDefault()
                  e.stopPropagation()
                  return
                }
                e.preventDefault()
                e.stopPropagation()
                if (editingNote) setEditingNote(false)
                else if (editing) setEditing(false)
                else onOpenChange(false)
              }
            }}
            className="w-[310px] max-w-[calc(100vw-24px)] max-h-[var(--available-height)] overflow-y-auto rounded-xl border border-line bg-card p-4 font-sans text-foreground shadow-2xl outline-none animate-fade-up"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3
                  id={titleId}
                  className="text-[15px] font-semibold leading-snug text-foreground"
                >
                  {activity.title}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Edit activity"
                  aria-pressed={editing}
                  onClick={() => {
                    setEditingNote(false)
                    setEditing((v) => !v)
                  }}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-elev hover:text-foreground"
                >
                  <Pencil size={14} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
            </div>

            {editing ? (
              <div className="mt-3">
                <ActivityForm
                  initial={{
                    title: activity.title,
                    date: activity.date,
                    startTime: activity.startTime,
                    endTime: activity.endTime,
                    meetingLink: activity.meetingLink ?? "",
                    tags: activity.tags ?? [],
                  }}
                  onSave={(data) => {
                    onUpdate(activity.id, data)
                    setEditing(false)
                  }}
                  onCancel={() => setEditing(false)}
                  onDelete={() => {
                    onOpenChange(false)
                    onDelete(activity.id)
                  }}
                />
              </div>
            ) : (
              <>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2 rounded-lg bg-fg/[0.05] px-2.5 py-2 text-[12.5px] font-medium text-foreground">
                    <CalendarDays size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span>{formattedDate}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center justify-between rounded-lg bg-fg/[0.05] px-2.5 py-2 text-[12.5px] font-medium tabular-nums text-foreground">
                      <span>{startClock12}</span>
                      <ChevronDown size={12} className="text-muted-foreground" aria-hidden />
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-fg/[0.05] px-2.5 py-2 text-[12.5px] font-medium tabular-nums text-foreground">
                      <span>{endClock12}</span>
                      <ChevronDown size={12} className="text-muted-foreground" aria-hidden />
                    </div>
                  </div>

                  {activity.meetingLink && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-fg/[0.05] px-2.5 py-2 text-[12.5px]">
                      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        <Video size={14} className="shrink-0" aria-hidden />
                        <span className="truncate">{activity.meetingLink}</span>
                      </span>
                      <a
                        href={activity.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 font-semibold text-foreground underline-offset-2 hover:underline"
                      >
                        Join meeting
                        <ExternalLink size={12} aria-hidden />
                      </a>
                    </div>
                  )}
                </div>

                {activity.tags && activity.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {activity.tags.map((tag) => (
                      <Badge key={tag} tone="neutral">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {editingNote ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      onUpdateNote(activity.id, noteDraft.trim() || undefined)
                      setEditingNote(false)
                    }}
                    className="mt-3 space-y-2.5"
                  >
                    <label className="block">
                      <span className="mb-1 block text-[12px] font-semibold text-foreground">
                        Note
                      </span>
                      <textarea
                        ref={noteInputRef}
                        rows={3}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Add a note for this activity..."
                        className="min-h-[76px] w-full resize-y rounded-md border border-line bg-fg/[0.06] px-2.5 py-2 text-[12.5px] leading-snug text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-fg/30"
                      />
                    </label>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditingNote(false)}
                        className="h-8 px-3 text-[12px]"
                      >
                        Cancel
                      </Button>
                      <Button type="submit" className="h-8 px-3 text-[12px]">
                        Save
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    {activity.note && (
                      <div className="mt-3 rounded-lg bg-fg/[0.05] px-2.5 py-2">
                        <p className="whitespace-pre-wrap break-words text-[12.5px] leading-snug text-foreground">
                          {activity.note}
                        </p>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant={activity.note ? "outline" : "solid"}
                      onClick={() => {
                        setNoteDraft(activity.note ?? "")
                        setEditingNote(true)
                      }}
                      className="mt-3.5 w-full"
                    >
                      {activity.note ? "Edit note" : "Add note"}
                    </Button>
                  </>
                )}
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ActivityCreatePopover({
  openState,
  onOpenChange,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  onCreate,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  triggerClassName,
  triggerStyle,
  triggerAriaLabel,
  dataContextualAddSlot,
  dataGridPopKey,
  onTriggerClick,
  children,
}: {
  openState: boolean
  onOpenChange: (next: boolean, details?: Popover.Root.ChangeEventDetails) => void
  defaultDate: string
  defaultStartTime: string
  defaultEndTime: string
  onCreate: (data: {
    title: string
    date: string
    startTime: string
    endTime: string
    meetingLink?: string
    tags: string[]
  }) => void
  side?: "bottom" | "top" | "left" | "right"
  align?: "start" | "center" | "end"
  sideOffset?: number
  triggerClassName?: string
  triggerStyle?: React.CSSProperties
  triggerAriaLabel?: string
  dataContextualAddSlot?: boolean
  dataGridPopKey?: string
  onTriggerClick?: (e: React.MouseEvent) => void
  children: ReactNode
}) {
  const container = useOverlayContainer()
  const titleId = useId()
  useCloseOnOverlay(() => onOpenChange(false))

  const handleOpenChange = (next: boolean, details?: Popover.Root.ChangeEventDetails) => {
    if (!next) {
      const target = (details?.event as Event | undefined)?.target as Element | null
      const isPickerOpen = !!document.querySelector(".dropdown-surface")
      if (details?.reason === "escape-key" && isPickerOpen) {
        return
      }
      const isPickerOrFormClick = !!target?.closest?.(
        '[data-activity-popup], .dropdown-surface, [data-date], .time-picker-column, [aria-label="Select time"], [role="radiogroup"]'
      )
      if (details?.reason === "outside-press" && isPickerOrFormClick) {
        return
      }
    }
    onOpenChange(next, details)
  }

  return (
    <Popover.Root open={openState} modal={false} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        type="button"
        aria-label={triggerAriaLabel}
        style={triggerStyle}
        className={triggerClassName}
        data-contextual-add-slot={dataContextualAddSlot ? "true" : undefined}
        data-grid-pop-key={dataGridPopKey}
        onClick={onTriggerClick}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={12}
          className="z-[100] max-w-[calc(100vw-24px)]"
        >
          <Popover.Popup
            data-activity-popup="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (document.querySelector(".dropdown-surface")) {
                  e.preventDefault()
                  e.stopPropagation()
                  return
                }
                e.preventDefault()
                e.stopPropagation()
                onOpenChange(false)
              }
            }}
            className="w-[320px] max-w-[calc(100vw-24px)] max-h-[var(--available-height)] overflow-y-auto rounded-xl border border-line bg-card p-4 font-sans text-foreground shadow-2xl outline-none animate-fade-up"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id={titleId} className="text-[15px] font-semibold text-foreground">
                Add activity
              </h3>
              <button
                type="button"
                aria-label="Close activity form"
                onClick={() => onOpenChange(false)}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-elev hover:text-foreground"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <ActivityForm
              key={`${defaultDate}-${defaultStartTime}-${defaultEndTime}-${openState}`}
              initial={{
                title: "",
                date: defaultDate,
                startTime: defaultStartTime,
                endTime: defaultEndTime,
                meetingLink: "",
                tags: [],
              }}
              onSave={(data) => {
                onCreate(data)
                onOpenChange(false)
              }}
              onCancel={() => onOpenChange(false)}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

const HOUR_ROW_HEIGHT = 74
const LATE_NIGHT_MIN_TAIL = 24

interface SelectedBlockInfo {
  kind: "pitch" | "activity"
  id: string
  colKey: string
  date: string
  startMin: number
  endMin: number
  topPx: number
  heightPx: number
  leftPct: number
  widthPct: number
}

interface ContextualAddSlot {
  edge: "above" | "below"
  key: string
  colKey: string
  date: string
  startMin: number
  endMin: number
  topPx: number
  heightPx: number
}

function segmentTopPx(seg: DaySegment): number {
  return (seg.startMin / 60) * HOUR_ROW_HEIGHT + 2
}

function segmentHeightPx(seg: DaySegment): number {
  return Math.max(48, ((seg.endMin - seg.startMin) / 60) * HOUR_ROW_HEIGHT - 4)
}

function computeContextualAddSlots(
  colKey: string,
  segments: DaySegment[],
  selectedBlock: SelectedBlockInfo | null,
): ContextualAddSlot[] {
  if (!selectedBlock || selectedBlock.colKey !== colKey) return []
  const manilaNow = getManilaNow()
  if (colKey < manilaNow.dateKey) return []

  const selectedSeg = segments.find(
    (seg) => seg.kind === selectedBlock.kind && seg.id === selectedBlock.id,
  )
  if (!selectedSeg) return []

  // Group touching or overlapping segments so dashed + slots sit only on free outer edges.
  const group = new Set<DaySegment>([selectedSeg])
  let changed = true
  while (changed) {
    changed = false
    for (const seg of segments) {
      if (group.has(seg)) continue
      for (const member of group) {
        if (seg.startMin <= member.endMin && member.startMin <= seg.endMin) {
          group.add(seg)
          changed = true
          break
        }
      }
    }
  }

  const groupMembers = Array.from(group)
  const groupStartMin = Math.min(...groupMembers.map((s) => s.startMin))
  const groupEndMin = Math.max(...groupMembers.map((s) => s.endMin))
  const groupTopPx = Math.min(...groupMembers.map((s) => segmentTopPx(s)))
  const groupBottomPx = Math.max(...groupMembers.map((s) => segmentTopPx(s) + segmentHeightPx(s)))

  let prevSeg: DaySegment | null = null
  let nextSeg: DaySegment | null = null
  for (const seg of segments) {
    if (group.has(seg)) continue
    if (seg.endMin < groupStartMin && (!prevSeg || seg.endMin > prevSeg.endMin)) {
      prevSeg = seg
    }
    if (seg.startMin > groupEndMin && (!nextSeg || seg.startMin < nextSeg.startMin)) {
      nextSeg = seg
    }
  }

  const slots: ContextualAddSlot[] = []

  const prevEndMin = prevSeg ? prevSeg.endMin : 0
  const prevBottomPx = prevSeg ? segmentTopPx(prevSeg) + segmentHeightPx(prevSeg) : 0
  const freeAboveMin = groupStartMin - prevEndMin
  const aboveStartMin = Math.max(prevEndMin, groupStartMin - 60)
  const aboveEndMin = groupStartMin
  const aboveClearancePx = groupTopPx - 4 - (prevSeg ? prevBottomPx + 4 : 2)

  const isAbovePast = colKey === manilaNow.dateKey && aboveStartMin <= manilaNow.totalMinutes
  if (freeAboveMin >= 15 && aboveClearancePx >= 24 && aboveStartMin < 23 * 60 && !isAbovePast) {
    const heightPx = Math.min(56, aboveClearancePx)
    slots.push({
      edge: "above",
      key: `adjacent-add-above-${selectedBlock.kind}-${selectedBlock.id}`,
      colKey,
      date: colKey,
      startMin: aboveStartMin,
      endMin: aboveEndMin,
      topPx: groupTopPx - 4 - heightPx,
      heightPx,
    })
  }

  const nextStartMin = nextSeg ? nextSeg.startMin : 24 * 60
  const nextTopPx = nextSeg ? segmentTopPx(nextSeg) : 24 * HOUR_ROW_HEIGHT
  const freeBelowMin = nextStartMin - groupEndMin
  const belowStartMin = groupEndMin
  const belowEndMin = Math.min(nextStartMin, groupEndMin + 60)
  const belowClearancePx = (nextSeg ? nextTopPx - 4 : 24 * HOUR_ROW_HEIGHT - 2) - (groupBottomPx + 4)

  // Exclude slots starting at or after 11:00 PM Manila time (23:00 / 1380 min) and slots in the past.
  const isBelowPast = colKey === manilaNow.dateKey && belowStartMin <= manilaNow.totalMinutes
  if (freeBelowMin >= 15 && belowClearancePx >= 24 && belowStartMin < 23 * 60 && !isBelowPast) {
    const heightPx = Math.min(56, belowClearancePx)
    slots.push({
      edge: "below",
      key: `adjacent-add-below-${selectedBlock.kind}-${selectedBlock.id}`,
      colKey,
      date: colKey,
      startMin: belowStartMin,
      endMin: belowEndMin,
      topPx: groupBottomPx + 4,
      heightPx,
    })
  }

  return slots
}

function CalendarView({
  projects,
  open,
  viewPitches,
  today,
  day,
  setDay,
  month,
  setMonth,
  activePopoverKey,
  setActivePopoverKey,
  selectedBlock,
  setSelectedBlock,
  activities,
  onCreateActivity,
  onUpdateActivity,
  onUpdateActivityNote,
  onDeleteActivity,
}: {
  projects: Project[]
  open: Open
  viewPitches: () => void
  today: string
  day: string
  setDay: (day: string) => void
  month: Date
  setMonth: (month: Date) => void
  activePopoverKey: string | null
  setActivePopoverKey: (key: string | null) => void
  selectedBlock: SelectedBlockInfo | null
  setSelectedBlock: (block: SelectedBlockInfo | null) => void
  activities: CalendarActivity[]
  onCreateActivity: (data: {
    title: string
    date: string
    startTime: string
    endTime: string
    meetingLink?: string
    tags: string[]
  }) => void
  onUpdateActivity: (
    id: string,
    patch: {
      title: string
      date: string
      startTime: string
      endTime: string
      meetingLink?: string
      tags: string[]
    },
  ) => void
  onUpdateActivityNote: (id: string, note: string | undefined) => void
  onDeleteActivity: (id: string) => void
}) {
  // Only approved pitches are booked events; drafts and ready pitches stay off the calendar.
  const approved = useMemo(
    () =>
      projects
        .filter((p) => p.status === "approved" && p.brief.start)
        .sort((a, b) => a.brief.start.localeCompare(b.brief.start)),
    [projects],
  )
  const [viewMode, setViewMode] = useState<CalendarMode>("week")
  const [showAllAgenda, setShowAllAgenda] = useState(false)
  const [showHoursDetail, setShowHoursDetail] = useState(false)
  const [calendarsExpanded, setCalendarsExpanded] = useState(false)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  const pick = useCallback(
    (key: string) => {
      setDay(key)
      setMonth(parseDate(key))
    },
    [setDay, setMonth],
  )

  const stepMonth = (delta: number) => {
    const next = shiftMonth(month, delta)
    setMonth(next)
    setDay(dateKey(next))
    setActivePopoverKey(null)
    setSelectedBlock(null)
  }

  const selectedDateObj = useMemo(() => parseDate(day), [day])
  const weekDays = useMemo(() => mondayWeekDays(selectedDateObj), [selectedDateObj])
  const miniDays = useMemo(() => mondayCalendarDays(month), [month])

  const visibleDays = useMemo(
    () => (viewMode === "day" ? [selectedDateObj] : weekDays),
    [viewMode, selectedDateObj, weekDays],
  )

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  const initialScrolledRef = useRef(false)
  const pendingScrollHourRef = useRef<number | null>(null)
  const scrollLockoutRef = useRef(false)
  const lastScrollPosRef = useRef({ page: 0, grid: 6 * HOUR_ROW_HEIGHT })

  useEffect(() => {
    const onPageScroll = () => {
      if (!scrollLockoutRef.current) {
        lastScrollPosRef.current.page = window.scrollY
      }
    }
    window.addEventListener("scroll", onPageScroll, { passive: true })
    return () => window.removeEventListener("scroll", onPageScroll)
  }, [])

  const scrollToHour = useCallback((hour: number) => {
    pendingScrollHourRef.current = hour
    scrollLockoutRef.current = true
    const pageY = window.scrollY

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gridScrollRef.current) {
          gridScrollRef.current.scrollTop = hour * HOUR_ROW_HEIGHT
          lastScrollPosRef.current.grid = hour * HOUR_ROW_HEIGHT
        }
        window.scrollTo({ top: pageY, behavior: "instant" })
        pendingScrollHourRef.current = null
        scrollLockoutRef.current = false
      })
    })
  }, [])

  useEffect(() => {
    if (viewMode === "month") return
    if (pendingScrollHourRef.current !== null) {
      const targetHour = pendingScrollHourRef.current
      scrollToHour(targetHour)
    } else if (!initialScrolledRef.current) {
      initialScrolledRef.current = true
      scrollToHour(6)
    }
  }, [viewMode, scrollToHour])

  useEffect(() => {
    const prevGrid = lastScrollPosRef.current.grid
    const prevPage = lastScrollPosRef.current.page
    const timer = requestAnimationFrame(() => {
      if (gridScrollRef.current && pendingScrollHourRef.current === null) {
        if (Math.abs(gridScrollRef.current.scrollTop - prevGrid) > 10) {
          gridScrollRef.current.scrollTop = prevGrid
        }
      }
      if (Math.abs(window.scrollY - prevPage) > 10) {
        window.scrollTo({ top: prevPage, behavior: "instant" })
      }
    })
    return () => cancelAnimationFrame(timer)
  }, [activePopoverKey])

  const handleAgendaItemClick = useCallback(
    (targetDate: string, startMin: number) => {
      const targetHour = Math.max(0, Math.min(23, Math.floor(startMin / 60)))
      pick(targetDate)
      setActivePopoverKey(null)
      setSelectedBlock(null)
      if (viewMode === "month") {
        pendingScrollHourRef.current = targetHour
        setViewMode("week")
      } else {
        scrollToHour(targetHour)
      }
    },
    [pick, viewMode, scrollToHour, setActivePopoverKey, setSelectedBlock],
  )

  const handleGridScroll = useCallback(() => {
    if (gridScrollRef.current && !scrollLockoutRef.current) {
      lastScrollPosRef.current.grid = gridScrollRef.current.scrollTop
    }
    if (!activePopoverKey || !gridScrollRef.current) return
    if (!activePopoverKey.startsWith("grid-") && !activePopoverKey.startsWith("adjacent-add-")) {
      return
    }
    const container = gridScrollRef.current
    const target = container.querySelector<HTMLElement>(
      `[data-grid-pop-key="${activePopoverKey}"]`,
    )
    if (!target) return
    const cRect = container.getBoundingClientRect()
    if (cRect.height <= 0 || cRect.width <= 0) return
    const tRect = target.getBoundingClientRect()
    const outOfView =
      tRect.bottom <= cRect.top ||
      tRect.top >= cRect.bottom ||
      tRect.right <= cRect.left ||
      tRect.left >= cRect.right
    if (outOfView) {
      setActivePopoverKey(null)
    }
  }, [activePopoverKey, setActivePopoverKey])

  // Combined agenda items (approved events + calendar activities)
  type AgendaItem =
    | { kind: "pitch"; id: string; dateKey: string; sortKey: string; project: Project }
    | { kind: "activity"; id: string; dateKey: string; sortKey: string; activity: CalendarActivity }

  const manilaMonthStartKey = useMemo(() => {
    const now = getManilaNow()
    return `${now.dateKey.slice(0, 7)}-01`
  }, [])

  const eligibleAllItems = useMemo<AgendaItem[]>(() => {
    const items: AgendaItem[] = [
      ...approved
        .filter((p) => {
          const endKey = datePart(p.brief.end || p.brief.start)
          return endKey >= manilaMonthStartKey
        })
        .map((p) => ({
          kind: "pitch" as const,
          id: p.id,
          dateKey: datePart(p.brief.start),
          sortKey: p.brief.start,
          project: p,
        })),
      ...activities
        .filter((a) => a.date >= manilaMonthStartKey)
        .map((a) => ({
          kind: "activity" as const,
          id: a.id,
          dateKey: a.date,
          sortKey: `${a.date}T${a.startTime}`,
          activity: a,
        })),
    ]
    return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [approved, activities, manilaMonthStartKey])

  const dayItems = useMemo(
    () =>
      eligibleAllItems.filter((item) =>
        item.kind === "pitch" ? spans(item.project, day) : item.activity.date === day,
      ),
    [eligibleAllItems, day],
  )
  const agendaItems = showAllAgenda || dayItems.length === 0 ? eligibleAllItems : dayItems

  // Time breakdown derived from scheduled hours of Approved events and Calendar activities scoped to the actual current month in Asia/Manila
  const currentMonth = useMemo(() => getManilaCurrentMonth(), [])

  // Qualifying approved events in actual current month in Asia/Manila (each counted once)
  const currentMonthApproved = useMemo(
    () =>
      approved.filter((p) =>
        projectHoursInCurrentMonth(p, currentMonth.startMs, currentMonth.endMs) > 0,
      ),
    [approved, currentMonth],
  )

  // Qualifying manual activities in actual current month in Asia/Manila (each counted once)
  const currentMonthActivities = useMemo(
    () =>
      activities.filter(
        (a) => a.date >= currentMonth.startKey && a.date <= currentMonth.endKey,
      ),
    [activities, currentMonth],
  )

  const timeBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; hours: number; color: string }>()
    let colorIdx = 0
    currentMonthApproved.forEach((p) => {
      const label = p.brief.theme?.trim() || "Approved events"
      const hrs = projectHoursInCurrentMonth(p, currentMonth.startMs, currentMonth.endMs)
      if (hrs <= 0) return
      const existing = map.get(label)
      if (existing) {
        existing.hours += hrs
      } else {
        map.set(label, {
          label,
          hours: hrs,
          color: BREAKDOWN_BAR_COLORS[colorIdx++ % BREAKDOWN_BAR_COLORS.length],
        })
      }
    })
    currentMonthActivities.forEach((a) => {
      const label = (a.tags && a.tags[0]) || a.type || "Activities"
      const hrs = scheduledHoursForActivity(a)
      if (hrs <= 0) return
      const existing = map.get(label)
      if (existing) {
        existing.hours += hrs
      } else {
        map.set(label, {
          label,
          hours: hrs,
          color: BREAKDOWN_BAR_COLORS[colorIdx++ % BREAKDOWN_BAR_COLORS.length],
        })
      }
    })
    const entries = Array.from(map.values())
    const totalHours = entries.reduce((sum, item) => sum + item.hours, 0)
    return {
      totalHours,
      rows: entries.map((item) => ({
        ...item,
        pct:
          totalHours > 0
            ? Math.max(12, Math.min(100, Math.round((item.hours / totalHours) * 100)))
            : 0,
      })),
    }
  }, [currentMonthApproved, currentMonthActivities, currentMonth])

  const visibleColumnsData = useMemo(() => {
    let maxLateBottomPx = 0
    const columns = visibleDays.map((d) => {
      const colKey = dateKey(d)
      const segments = buildDaySegments(colKey, approved, activities, 0, 24 * 60)
      const contextualSlots = computeContextualAddSlots(colKey, segments, selectedBlock)
      for (const seg of segments) {
        const bottom = segmentTopPx(seg) + segmentHeightPx(seg)
        if (bottom > maxLateBottomPx) maxLateBottomPx = bottom
      }
      for (const slot of contextualSlots) {
        const bottom = slot.topPx + slot.heightPx
        if (bottom > maxLateBottomPx) maxLateBottomPx = bottom
      }
      return { dateObj: d, colKey, segments, contextualSlots }
    })

    const lastRowHeight = Math.max(
      LATE_NIGHT_MIN_TAIL,
      Math.ceil(maxLateBottomPx - 23 * HOUR_ROW_HEIGHT + 6),
    )
    const totalGridHeightPx = 23 * HOUR_ROW_HEIGHT + lastRowHeight

    return { columns, lastRowHeight, totalGridHeightPx }
  }, [visibleDays, approved, activities, selectedBlock])

  const monthHeading = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const formatHourGutter = (h: number) => {
    const h12 = h % 12 || 12
    const period = h >= 12 ? "PM" : "AM"
    return `${h12}:00 ${period}`
  }

  return (
    <div
      className="dashboard-surfaces w-full font-sans text-foreground"
      aria-label="Event Manager Calendar"
    >
      <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-[425px_minmax(0,1fr)] lg:items-stretch">
        {/* ─── LEFT RAIL (425 px desktop width, 1.25× original dimensions) ─── */}
        <aside
          className="flex min-w-0 flex-col gap-4"
          aria-label="Calendar controls and summary"
        >
          {/* 1. Mini Month Card (~456 px tall on desktop, distributed week rows, compact week highlight) */}
          <Card className="flex flex-col p-4 lg:h-[456px]" aria-labelledby="em-mini-month-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="em-mini-month-heading" className="text-[15px] font-semibold text-foreground" aria-live="polite">
                {monthHeading}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => stepMonth(-1)}
                  className="grid size-7 place-items-center rounded-full border border-line text-muted-foreground transition-colors hover:bg-fg/10 hover:text-foreground"
                >
                  <ChevronLeft size={14} strokeWidth={1.8} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => stepMonth(1)}
                  className="grid size-7 place-items-center rounded-full border border-line text-muted-foreground transition-colors hover:bg-fg/10 hover:text-foreground"
                >
                  <ChevronRight size={14} strokeWidth={1.8} aria-hidden />
                </button>
              </div>
            </div>

            <div
              className="mt-3.5 mb-1.5 grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground lg:mt-4 lg:mb-2"
              aria-hidden
            >
              {mondayMiniWeekdays.map((w, idx) => (
                <span key={idx}>{w}</span>
              ))}
            </div>

            <div
              role="grid"
              aria-label="Mini month dates"
              className="space-y-[3px] lg:grid lg:flex-1 lg:grid-rows-6 lg:gap-0 lg:space-y-0"
            >
              {Array.from({ length: 6 }, (_, rowIdx) => {
                const rowDates = miniDays.slice(rowIdx * 7, rowIdx * 7 + 7)
                const rowStartKey = dateKey(rowDates[0])
                const rowEndKey = dateKey(rowDates[6])
                const isSelectedWeek = day >= rowStartKey && day <= rowEndKey

                return (
                  <div
                    key={rowStartKey}
                    role="row"
                    className={cx(
                      "grid h-[36px] w-full grid-cols-7 items-center rounded-full transition-colors self-center lg:h-[44px]",
                      isSelectedWeek && "bg-fg/[0.06]",
                    )}
                  >
                    {rowDates.map((d) => {
                      const key = dateKey(d)
                      const inMonth = d.getMonth() === month.getMonth()
                      const isSelected = key === day
                      const isWeekBoundary =
                        isSelectedWeek && (key === rowStartKey || key === rowEndKey)
                      const hasApproved = approved.some((p) => spans(p, key))
                      const hasActivity = activities.some((a) => a.date === key)
                      const hasBooking = hasApproved || hasActivity

                      return (
                        <button
                          key={key}
                          type="button"
                          role="gridcell"
                          aria-selected={isSelected}
                          aria-current={key === today ? "date" : undefined}
                          aria-label={`${d.toLocaleDateString("en-PH", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}${hasBooking ? ", has scheduled item" : ""}`}
                          onClick={() => {
                            pick(key)
                            setActivePopoverKey(null)
                            setSelectedBlock(null)
                          }}
                          className={cx(
                            "relative mx-auto grid size-[30px] place-items-center rounded-full text-[12px] tabular-nums transition-colors lg:size-[36px] lg:text-[13px]",
                            isSelected || isWeekBoundary
                              ? "bg-invert font-semibold text-invert-fg"
                              : hasBooking
                                ? "bg-fg/[0.08] font-semibold text-foreground hover:bg-fg/15"
                                : inMonth
                                  ? "text-foreground hover:bg-fg/10"
                                  : "text-muted-foreground/50",
                            key === today && !isSelected && !isWeekBoundary && "ring-1 ring-fg/30",
                          )}
                        >
                          <span>{d.getDate()}</span>
                          {hasBooking && !isSelected && !isWeekBoundary && (
                            <span
                              className={cx(
                                "absolute bottom-[2.5px] size-[3.5px] rounded-full lg:bottom-[3px] lg:size-[4px]",
                                hasApproved ? "bg-success" : "bg-fg/50",
                              )}
                              aria-hidden
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* 2. Agenda Card */}
          <Card className="p-4" aria-labelledby="em-agenda-heading">
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              <h2
                id="em-agenda-heading"
                className="truncate text-[15px] font-semibold text-foreground"
              >
                Upcoming events today
              </h2>
              <button
                type="button"
                onClick={() => setShowAllAgenda((v) => !v)}
                className="shrink-0 whitespace-nowrap text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showAllAgenda ? "Selected day" : "View all"}
              </button>
            </div>

            {dayItems.length === 0 && !showAllAgenda && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                No events on {shortDate(day)}.{" "}
                {eligibleAllItems.length > 0 ? "Scheduled items:" : ""}
              </p>
            )}

            {agendaItems.length === 0 ? (
              <div className="mt-2.5 space-y-2">
                <p className="text-[12px] text-muted-foreground">
                  No upcoming events or activities scheduled this month.
                </p>
                <button
                  type="button"
                  onClick={viewPitches}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  View event pitches <ArrowRight size={12} aria-hidden />
                </button>
              </div>
            ) : (
              <ul className="mt-3 space-y-2" aria-label="Agenda events">
                {agendaItems.slice(0, 5).map((item, idx) => {
                  if (item.kind === "pitch") {
                    const p = item.project
                    const isOnSelectedDay = spans(p, day)
                    const targetDate = datePart(p.brief.start)
                    const startMin = parseMinutesOfDay(p.brief.start, 9 * 60)

                    return (
                      <li key={`pitch-${p.id}`}>
                        <button
                          type="button"
                          onClick={() => handleAgendaItemClick(targetDate, startMin)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-fg/[0.05]"
                        >
                          <span
                            className={cx(
                              "grid size-[15px] shrink-0 place-items-center rounded-[4px]",
                              isOnSelectedDay || idx === 0
                                ? "bg-success text-white"
                                : "border border-line bg-elev",
                            )}
                            aria-hidden
                          >
                            {(isOnSelectedDay || idx === 0) && (
                              <Check size={10} strokeWidth={3} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                            {p.brief.title}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                            {fmtEventClockRange(p)}
                          </span>
                        </button>
                      </li>
                    )
                  }

                  const act = item.activity
                  const isOnSelectedDay = act.date === day
                  const targetDate = act.date
                  const startMin = parseClockMinutes(act.startTime, 9 * 60)

                  return (
                    <li key={`act-${act.id}`}>
                      <button
                        type="button"
                        onClick={() => handleAgendaItemClick(targetDate, startMin)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-fg/[0.05]"
                      >
                        <span
                          className={cx(
                            "grid size-[15px] shrink-0 place-items-center rounded-[4px]",
                            isOnSelectedDay
                              ? "bg-invert text-invert-fg"
                              : "border border-line bg-elev",
                          )}
                          aria-hidden
                        >
                          {isOnSelectedDay && <Check size={10} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                          {act.title}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                          {fmtClock12(act.startTime)} - {fmtClock12(act.endTime)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* 3. Time Breakdown Card */}
          <Card className="p-4" aria-labelledby="em-breakdown-heading">
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              <h2
                id="em-breakdown-heading"
                className="truncate text-[15px] font-semibold text-foreground"
              >
                Time breakdown
              </h2>
              <button
                type="button"
                onClick={() => setShowHoursDetail((v) => !v)}
                className="shrink-0 whitespace-nowrap text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showHoursDetail ? `${timeBreakdown.totalHours.toFixed(1)}h` : "View all"}
              </button>
            </div>

            {timeBreakdown.rows.length === 0 ? (
              <p className="mt-2.5 text-[12px] text-muted-foreground">
                No scheduled hours this month.
              </p>
            ) : (
              <div className="mt-3.5 space-y-3">
                {(showHoursDetail ? timeBreakdown.rows : timeBreakdown.rows.slice(0, 4)).map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3"
                    title={`${row.label}: ${row.hours.toFixed(1)} scheduled hours (${row.pct}%)`}
                  >
                    <span className="truncate text-[12px] text-muted-foreground">
                      {row.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-fg/[0.08]">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${row.pct}%`, background: row.color }}
                        />
                      </div>
                      {showHoursDetail && (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {row.hours.toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 4. Collapsible My Calendars Card */}
          <Card className="px-4 py-3.5" aria-label="My calendars">
            <button
              type="button"
              aria-expanded={calendarsExpanded}
              onClick={() => setCalendarsExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-[15px] font-semibold text-foreground">
                My calendars
              </span>
              <span className="grid size-7 place-items-center rounded-full border border-line text-muted-foreground transition-transform">
                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  className={cx(
                    "transition-transform duration-200",
                    calendarsExpanded && "rotate-180",
                  )}
                  aria-hidden
                />
              </span>
            </button>

            {calendarsExpanded && (
              <div className="mt-3 space-y-2 border-t border-line pt-2.5 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <span className="grid size-[14px] place-items-center rounded-[4px] bg-success text-white">
                      <Check size={9} strokeWidth={3} aria-hidden />
                    </span>
                    Approved events
                  </span>
                  <span className="rounded-full bg-fg/[0.08] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                    {currentMonthApproved.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <span className="grid size-[14px] place-items-center rounded-[4px] bg-invert text-invert-fg">
                      <Check size={9} strokeWidth={3} aria-hidden />
                    </span>
                    Activities
                  </span>
                  <span className="rounded-full bg-fg/[0.08] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                    {currentMonthActivities.length}
                  </span>
                </div>
              </div>
            )}
          </Card>
        </aside>

        {/* ─── MAIN SCHEDULE PANEL (stretches on desktop to align with left rail) ─── */}
        <Card
          className="flex min-w-0 flex-col p-4 sm:p-5 lg:h-full"
          aria-label="Scheduled events calendar"
        >
          {/* Main Panel Header */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <h2
              className="text-[22px] font-bold tracking-tight text-foreground sm:text-[24px]"
              aria-live="polite"
            >
              {monthHeading}
            </h2>

            {/* Compact Month / Week / Day Segmented Control */}
            <div
              role="group"
              aria-label="Calendar view mode"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-fg/[0.04] p-1"
            >
              {(["month", "week", "day"] as const).map((mode) => {
                const active = viewMode === mode
                const label = mode === "month" ? "Month" : mode === "week" ? "Week" : "Day"
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setViewMode(mode)
                      setActivePopoverKey(null)
                      setSelectedBlock(null)
                    }}
                    className={cx(
                      "h-7 rounded-full px-3.5 text-[12px] font-semibold transition-colors",
                      active
                        ? "bg-invert text-invert-fg shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {viewMode === "month" ? (
            /* ─── MONTH VIEW ─── */
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="mb-2 grid grid-cols-7 gap-1.5">
                {mondayShortWeekdays.map((w) => (
                  <div
                    key={w}
                    className="flex h-[38px] items-center justify-center rounded-lg bg-fg/[0.04] text-[12px] font-semibold text-muted-foreground"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div
                role="grid"
                aria-label="Scheduled events and activities by day"
                className="grid flex-1 auto-rows-fr grid-cols-7 gap-1.5"
              >
                {miniDays.map((d) => {
                  const key = dateKey(d)
                  const inMonth = d.getMonth() === month.getMonth()
                  const isSelected = key === day
                  const dayPitches = approved.filter((p) => spans(p, key))
                  const dayActivities = activities.filter((a) => a.date === key)
                  const totalCount = dayPitches.length + dayActivities.length

                  return (
                    <div
                      key={key}
                      role="gridcell"
                      aria-selected={isSelected}
                      onClick={() => pick(key)}
                      className={cx(
                        "flex min-h-[88px] cursor-pointer flex-col rounded-xl border p-1.5 transition-colors",
                        isSelected
                          ? "border-foreground bg-fg/[0.05]"
                          : "border-line bg-fg/[0.02] hover:bg-fg/[0.05]",
                        !inMonth && "opacity-45",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cx(
                            "grid size-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
                            isSelected && "bg-invert text-invert-fg",
                          )}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayPitches.slice(0, 2).map((p) => {
                          const popKey = `month-pitch-${key}-${p.id}`
                          return (
                            <div key={p.id} onClick={(e) => e.stopPropagation()}>
                              <EventPreviewTrigger
                                project={p}
                                openPitch={open}
                                openState={activePopoverKey === popKey}
                                onOpenChange={(next) => {
                                  if (next) {
                                    pick(key)
                                    setActivePopoverKey(popKey)
                                  } else if (activePopoverKey === popKey) {
                                    setActivePopoverKey(null)
                                  }
                                }}
                                className="flex w-full items-center gap-1.5 truncate rounded-md border border-line bg-elev px-1.5 py-0.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-chip"
                              >
                                <span
                                  className="size-1.5 shrink-0 rounded-full bg-success"
                                  aria-hidden
                                />
                                <span className="truncate">{p.brief.title}</span>
                              </EventPreviewTrigger>
                            </div>
                          )
                        })}
                        {dayActivities.slice(0, Math.max(0, 2 - dayPitches.length)).map((act) => {
                          const popKey = `month-act-${key}-${act.id}`
                          return (
                            <div key={act.id} onClick={(e) => e.stopPropagation()}>
                              <ActivityPreviewTrigger
                                activity={act}
                                onUpdate={onUpdateActivity}
                                onUpdateNote={onUpdateActivityNote}
                                onDelete={onDeleteActivity}
                                openState={activePopoverKey === popKey}
                                onOpenChange={(next) => {
                                  if (next) {
                                    pick(key)
                                    setActivePopoverKey(popKey)
                                  } else if (activePopoverKey === popKey) {
                                    setActivePopoverKey(null)
                                  }
                                }}
                                className="flex w-full items-center gap-1.5 truncate rounded-md border border-line bg-fg/[0.06] px-1.5 py-0.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-elev"
                              >
                                <span
                                  className="size-1.5 shrink-0 rounded-full bg-fg/50"
                                  aria-hidden
                                />
                                <span className="truncate">{act.title}</span>
                              </ActivityPreviewTrigger>
                            </div>
                          )
                        })}
                        {totalCount > 2 && (
                          <span className="block px-1 text-[10px] font-medium text-muted-foreground">
                            +{totalCount - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ─── WEEK & DAY TIME-GRID VIEW (~52 px date headers, ~74 px hourly rows, stretches on desktop) ─── */
            <div
              onScroll={handleGridScroll}
              className="mt-4 flex min-h-0 flex-1 flex-col overflow-x-auto lg:overflow-y-hidden"
            >
              <div
                className={cx(
                  viewMode === "week" ? "min-w-[620px]" : "w-full",
                  "flex flex-1 flex-col lg:min-h-0",
                )}
              >
                {/* Date Headers Row (~52 px height) */}
                <div className="mb-2.5 flex shrink-0 items-center gap-1.5">
                  <div className="w-[68px] shrink-0 whitespace-nowrap pl-1 text-[11px] font-semibold text-muted-foreground">
                    GMT +8
                  </div>
                  <div
                    className={cx(
                      "grid flex-1 gap-1.5",
                      viewMode === "week" ? "grid-cols-7" : "grid-cols-1",
                    )}
                  >
                    {visibleDays.map((d) => {
                      const key = dateKey(d)
                      const isSelected = key === day
                      const dowIndex = (d.getDay() + 6) % 7
                      const label =
                        viewMode === "day"
                          ? d.toLocaleDateString("en-US", {
                              weekday: "long",
                              month: "short",
                              day: "numeric",
                            })
                          : `${mondayShortWeekdays[dowIndex]} ${d.getDate()}`

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            pick(key)
                            setActivePopoverKey(null)
                            setSelectedBlock(null)
                          }}
                          aria-pressed={isSelected}
                          className={cx(
                            "flex h-[52px] items-center justify-center whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold transition-colors",
                            isSelected
                              ? "bg-invert text-invert-fg shadow-2xs"
                              : "bg-fg/[0.04] text-foreground hover:bg-fg/[0.08]",
                          )}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Scrollable Hourly Grid (~74 px rows, desktop fills remaining height, mobile stays compact) */}
                <div className="relative h-[530px] lg:h-auto lg:min-h-0 lg:flex-1">
                  <div
                    ref={gridScrollRef}
                    onScroll={handleGridScroll}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && !activePopoverKey && selectedBlock) {
                        e.preventDefault()
                        setSelectedBlock(null)
                      }
                    }}
                    className="h-full overflow-y-auto pr-0.5 lg:absolute lg:inset-0"
                  >
                    <div
                      className="relative flex pt-[6px] pb-[4px]"
                      style={{ height: `${visibleColumnsData.totalGridHeightPx + 10}px` }}
                    >
                      {/* Narrow Time Gutter */}
                      <div className="w-[68px] shrink-0 select-none" aria-hidden>
                        {hours.map((h) => (
                          <div
                            key={h}
                            style={{
                              height: `${h < 23 ? HOUR_ROW_HEIGHT : visibleColumnsData.lastRowHeight}px`,
                            }}
                            className="pr-2.5 text-right text-[11px] font-medium tabular-nums leading-none text-muted-foreground"
                          >
                            <span className="inline-block whitespace-nowrap pt-[1px]">
                              {formatHourGutter(h)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Day Columns & Fine Hourly Dividers */}
                      <div
                        className={cx(
                          "relative grid flex-1 gap-1.5",
                          viewMode === "week" ? "grid-cols-7" : "grid-cols-1",
                        )}
                      >
                        {/* Horizontal Hour Lines */}
                        <div
                          className="pointer-events-none absolute inset-0 flex flex-col"
                          aria-hidden
                        >
                          {hours.map((h) => (
                            <div
                              key={h}
                              style={{
                                height: `${h < 23 ? HOUR_ROW_HEIGHT : visibleColumnsData.lastRowHeight}px`,
                              }}
                              className="border-t border-line"
                            />
                          ))}
                        </div>

                        {/* Day Columns with Positioned Event Blocks & Contextual Dashed Add Slots */}
                        {visibleColumnsData.columns.map(({ colKey, segments, contextualSlots }) => (
                          <div
                            key={colKey}
                            onClick={(e) => {
                              // Scope selection reset strictly to clicks on the empty grid
                              if (e.target !== e.currentTarget) return
                              pick(colKey)
                              setActivePopoverKey(null)
                              setSelectedBlock(null)
                            }}
                            className="relative h-full"
                          >
                            {/* Scheduled Segments (Approved Pitches & Calendar Activities) */}
                            {segments.map((seg) => {
                              const topPx = segmentTopPx(seg)
                              const heightPx = segmentHeightPx(seg)
                              const widthPct = 100 / seg.totalCols
                              const leftPct = seg.col * widthPct

                              if (seg.kind === "pitch") {
                                const popKey = `grid-pitch-${colKey}-${seg.project.id}`
                                return (
                                  <div
                                    key={`pitch-${colKey}-${seg.project.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <EventPreviewTrigger
                                      project={seg.project}
                                      openPitch={open}
                                      openState={activePopoverKey === popKey}
                                      dataGridPopKey={popKey}
                                      dataGridBlock
                                      onOpenChange={(next, details) => {
                                        if (next) {
                                          pick(colKey)
                                          setActivePopoverKey(popKey)
                                          setSelectedBlock({
                                            kind: "pitch",
                                            id: seg.project.id,
                                            colKey,
                                            date: colKey,
                                            startMin: seg.startMin,
                                            endMin: seg.endMin,
                                            topPx,
                                            heightPx,
                                            leftPct,
                                            widthPct,
                                          })
                                          return
                                        }
                                        const target = (details?.event as Event | undefined)
                                          ?.target as Element | null
                                        const isImperative =
                                          !details?.reason || details.reason === "none"
                                        const keepSelection =
                                          isImperative ||
                                          details?.reason === "escape-key" ||
                                          details?.reason === "trigger-press" ||
                                          (details?.reason === "outside-press" &&
                                            !!target?.closest?.(
                                              "[data-contextual-add-slot], [data-grid-block]",
                                            ))
                                        if (activePopoverKey === popKey) {
                                          setActivePopoverKey(null)
                                          if (!keepSelection) setSelectedBlock(null)
                                        }
                                      }}
                                      ariaLabel={`${seg.project.brief.title}, ${fmtMinutes12(seg.startMin)} to ${fmtMinutes12(seg.endMin)}`}
                                      style={{
                                        top: `${topPx}px`,
                                        height: `${heightPx}px`,
                                        left: `calc(${leftPct}% + 1px)`,
                                        width: `calc(${widthPct}% - 2px)`,
                                      }}
                                      className="absolute z-10 flex flex-col items-start justify-start overflow-hidden rounded-xl border border-line bg-elev py-2.5 pr-2.5 pl-3.5 text-left text-foreground shadow-2xs transition-colors hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground"
                                    >
                                      <span
                                        className="pointer-events-none absolute inset-y-2 left-1.5 w-[3px] rounded-full bg-success"
                                        aria-hidden
                                      />
                                      <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                                        {seg.project.brief.title}
                                      </span>
                                      <span className="mt-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                                        {fmtMinutes12(seg.startMin)} - {fmtMinutes12(seg.endMin)}
                                      </span>
                                    </EventPreviewTrigger>
                                  </div>
                                )
                              }

                              const popKey = `grid-act-${colKey}-${seg.activity.id}`
                              return (
                                <div
                                  key={`act-${colKey}-${seg.activity.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ActivityPreviewTrigger
                                    activity={seg.activity}
                                    onUpdate={onUpdateActivity}
                                    onUpdateNote={onUpdateActivityNote}
                                    onDelete={onDeleteActivity}
                                    openState={activePopoverKey === popKey}
                                    dataGridPopKey={popKey}
                                    dataGridBlock
                                    onOpenChange={(next, details) => {
                                      if (next) {
                                        pick(colKey)
                                        setActivePopoverKey(popKey)
                                        setSelectedBlock({
                                          kind: "activity",
                                          id: seg.activity.id,
                                          colKey,
                                          date: colKey,
                                          startMin: seg.startMin,
                                          endMin: seg.endMin,
                                          topPx,
                                          heightPx,
                                          leftPct,
                                          widthPct,
                                        })
                                        return
                                      }
                                      const target = (details?.event as Event | undefined)
                                        ?.target as Element | null
                                      const isImperative =
                                        !details?.reason || details.reason === "none"
                                      const keepSelection =
                                        isImperative ||
                                        details?.reason === "escape-key" ||
                                        details?.reason === "trigger-press" ||
                                        (details?.reason === "outside-press" &&
                                          !!target?.closest?.(
                                            "[data-contextual-add-slot], [data-grid-block]",
                                          ))
                                      if (activePopoverKey === popKey) {
                                        setActivePopoverKey(null)
                                        if (!keepSelection) setSelectedBlock(null)
                                      }
                                    }}
                                    ariaLabel={`${seg.activity.title}, ${fmtMinutes12(seg.startMin)} to ${fmtMinutes12(seg.endMin)}`}
                                    style={{
                                      top: `${topPx}px`,
                                      height: `${heightPx}px`,
                                      left: `calc(${leftPct}% + 1px)`,
                                      width: `calc(${widthPct}% - 2px)`,
                                    }}
                                    className="absolute z-10 flex flex-col items-start justify-start overflow-hidden rounded-xl border border-line bg-fg/[0.06] py-2.5 pr-2.5 pl-3.5 text-left text-foreground shadow-2xs transition-colors hover:bg-elev focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground"
                                  >
                                    <span
                                      className="pointer-events-none absolute inset-y-2 left-1.5 w-[3px] rounded-full bg-fg/45"
                                      aria-hidden
                                    />
                                    <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                                      {seg.activity.title}
                                    </span>
                                    <span className="mt-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                                      {fmtMinutes12(seg.startMin)} - {fmtMinutes12(seg.endMin)}
                                    </span>
                                  </ActivityPreviewTrigger>
                                </div>
                              )
                            })}

                            {/* Contextual Dashed Add Slots on Free Edges Above & Below Selected Booking/Group */}
                            {contextualSlots.map((slot) => {
                              const isAddOpen = activePopoverKey === slot.key
                              return (
                                <ActivityCreatePopover
                                  key={slot.key}
                                  openState={isAddOpen}
                                  onOpenChange={(next, details) => {
                                    if (next) {
                                      setActivePopoverKey(slot.key)
                                      return
                                    }
                                    const target = (details?.event as Event | undefined)
                                      ?.target as Element | null
                                    const isImperative =
                                      !details?.reason || details.reason === "none"
                                    const keepSelection =
                                      isImperative ||
                                      details?.reason === "escape-key" ||
                                      details?.reason === "close-press" ||
                                      details?.reason === "trigger-press" ||
                                      (details?.reason === "outside-press" &&
                                        !!target?.closest?.(
                                          "[data-contextual-add-slot], [data-grid-block]",
                                        ))
                                    if (activePopoverKey === slot.key) {
                                      setActivePopoverKey(null)
                                      if (!keepSelection) setSelectedBlock(null)
                                    }
                                  }}
                                  defaultDate={slot.date}
                                  defaultStartTime={fmt24(slot.startMin)}
                                  defaultEndTime={fmt24(slot.endMin)}
                                  onCreate={(data) => {
                                    onCreateActivity(data)
                                    setActivePopoverKey(null)
                                    setSelectedBlock(null)
                                  }}
                                  side="right"
                                  align="center"
                                  sideOffset={8}
                                  dataContextualAddSlot
                                  dataGridPopKey={slot.key}
                                  onTriggerClick={(e) => e.stopPropagation()}
                                  triggerAriaLabel={`Add activity from ${fmtMinutes12(slot.startMin)} to ${fmtMinutes12(slot.endMin)} on ${formatPopupDate(slot.date)}`}
                                  triggerStyle={{
                                    top: `${slot.topPx}px`,
                                    left: "1px",
                                    width: "calc(100% - 2px)",
                                    height: `${slot.heightPx}px`,
                                  }}
                                  triggerClassName="absolute z-20 flex w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-fg/[0.03] text-foreground transition-colors hover:border-fg/35 hover:bg-fg/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground"
                                >
                                  <span
                                    className={cx(
                                      "pointer-events-none grid place-items-center rounded-full border border-line bg-card text-foreground shadow-2xs transition-transform",
                                      slot.heightPx < 40 ? "size-6" : "size-7",
                                    )}
                                  >
                                    <Plus size={15} strokeWidth={2} aria-hidden />
                                  </span>
                                </ActivityCreatePopover>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function AssetsView({ projects }: { projects: Project[] }) {
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const categories = [...new Set(catalog.map((a) => a.category))]
  const now = Date.now()
  // Stock held by approved events that have not yet finished.
  const reserved = (id: string) =>
    projects
      .filter((p) => p.status === "approved" && Date.parse(p.brief.end) >= now)
      .reduce(
        (s, p) =>
          s +
          (p.brief.requirements.find((r) => r.assetId === id)?.quantity ?? 0),
        0,
      )
  const rows = catalog.filter(
    (a) =>
      (!category || a.category === category) &&
      `${a.name} ${a.category}`.toLowerCase().includes(q.trim().toLowerCase()),
  )
  return (
    <>
      <div className="em-toolbar -mt-3">
        <div role="group" aria-label="Category" className="em-chips">
          {["", ...categories].map((c) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={category === c}
              className="em-chip"
              onClick={() => setCategory(c)}
            >
              {c || "All categories"}
            </button>
          ))}
        </div>
        <label className="em-search">
          <Search size={15} strokeWidth={1.5} aria-hidden />
          <span className="sr-only">Search sample stock</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sample stock"
          />
        </label>
      </div>
      {rows.length === 0 ? (
        <StateCard
          icon={PackageOpen}
          title="Nothing in the library matches."
          copy="Try another search or category."
          action={
            <button
              type="button"
              className="em-btn em-btn--outline"
              onClick={() => {
                setQ("")
                setCategory("")
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <ul className="em-card-grid em-asset-grid" aria-label="Sample stock">
          {rows.map((a) => {
            const stock = a.stock ?? 0
            const held = reserved(a.id)
            const free = Math.max(0, stock - held)
            return (
              <li key={a.id} className="em-asset-card">
                <Visual
                  src={a.image}
                  fallbackSrc={FALLBACK_COVER}
                  label={a.alt}
                  icon={PackageOpen}
                  className={cx("em-asset-card-media em-product", a.cutout && "em-product--cutout")}
                />
                <div className="em-pitch-card-body">
                  <p className="em-eyebrow">{a.category}</p>
                  <p className="em-card-title mt-1.5">{a.name}</p>
                  {a.stock === undefined ? (
                    <p className="em-asset-stats em-card-copy">
                      Library only. Record stock to add it to an asset plan.
                    </p>
                  ) : (
                    <>
                      <dl className="em-asset-stats">
                        <div>
                          <dt>Sample stock</dt>
                          <dd>
                            {stock} {a.unit}
                          </dd>
                        </div>
                        <div>
                          <dt>Held by upcoming approvals</dt>
                          <dd>{held}</dd>
                        </div>
                      </dl>
                      <div
                        className="em-meter"
                        role="img"
                        aria-label={`${free} of ${stock} not held by upcoming approvals`}
                      >
                        <span style={{ width: `${(free / stock) * 100}%` }} />
                      </div>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
