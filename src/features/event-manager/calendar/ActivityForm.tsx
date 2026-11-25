import { Popover } from "@base-ui/react/popover"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Trash2, X } from "lucide-react"
import { Button } from "../../../components/ui/ui"
import DatePicker from "../../../components/ui/DatePicker"
import TimePicker from "../../../components/ui/TimePicker"
import { useCloseOnOverlay, useOverlayContainer } from "../../../components/overlay/OverlayLayer"
import {
  fmt24,
  getManilaNow,
  parseClockMinutes,
  validateHttpsUrl,
} from "./calendar-helpers"

export interface ActivityFieldErrors {
  title?: string
  date?: string
  time?: string
  meetingLink?: string
}

export function ActivityForm({
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

export function ActivityCreatePopover({
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

