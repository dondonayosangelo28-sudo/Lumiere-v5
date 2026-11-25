import { Popover } from "@base-ui/react/popover"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  MapPin,
  Pencil,
  Video,
} from "lucide-react"
import { Badge, Button } from "../../../components/ui/ui"
import { useCloseOnOverlay, useOverlayContainer } from "../../../components/overlay/OverlayLayer"
import type { Project } from "../model"
import { datePart } from "../shared"
import {
  formatPopupDate,
  fmtClock12,
  type CalendarActivity,
} from "./calendar-helpers"
import { ActivityForm } from "./ActivityForm"

export function EventPreviewTrigger({
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

export function ActivityPreviewTrigger({
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

