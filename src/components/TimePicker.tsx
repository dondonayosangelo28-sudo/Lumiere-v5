import { useEffect, useRef, useState, type AriaAttributes } from "react"
import { Popover } from "@base-ui/react/popover"
import { Clock3 } from "lucide-react"
import { Button, cx } from "./ui"
import { dropdownSurface } from "./Dropdown"
import { useCloseOnOverlay, useOverlayContainer } from "./OverlayLayer"
import { timeParts, timeValue } from "./timeValues"

function TimeColumn({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.scrollIntoView({ block: "nearest" })
  }, [value])
  return (
    <div
      ref={list}
      role="radiogroup"
      aria-label={label}
      className="time-picker-column max-h-64 space-y-1 overflow-y-auto overscroll-contain"
    >
      {options.map((option, index) => (
        <Button
          key={option}
          type="button"
          variant="ghost"
          role="radio"
          aria-checked={value === option}
          tabIndex={value === option || (!value && index === 0) ? 0 : -1}
          onClick={() => onChange(option)}
          onKeyDown={(event) => {
            const delta =
              event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
            if (!delta) return
            event.preventDefault()
            const next = (index + delta + options.length) % options.length
            onChange(options[next])
            requestAnimationFrame(() =>
              list.current
                ?.querySelectorAll<HTMLElement>('[role="radio"]')
                [next]?.focus(),
            )
          }}
          className={cx(
            "h-8 w-full rounded-md px-0 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/30",
            value === option
              ? "bg-fg/15 font-semibold"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {option}
        </Button>
      ))}
    </div>
  )
}

type Props = AriaAttributes & {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function TimePicker({
  value,
  onChange,
  disabled,
  ...aria
}: Props) {
  const [open, setOpen] = useState(false)
  const container = useOverlayContainer()
  const popup = useRef<HTMLDivElement>(null)
  const { hour, minute, period } = timeParts(value)
  const hasTime = !!value
  const hourText = hasTime ? String(hour).padStart(2, "0") : ""
  const minuteText = hasTime ? String(minute).padStart(2, "0") : ""
  const periodText = hasTime ? period : ""
  useCloseOnOverlay(() => setOpen(false))
  return (
    <Popover.Root open={open} modal={false} onOpenChange={setOpen}>
      <Popover.Trigger
        {...aria}
        disabled={disabled}
        className="flex h-10 w-full items-center justify-between gap-1 rounded-md border border-fg/[0.06] bg-fg/[0.08] px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-default disabled:opacity-60"
      >
        <span className={cx("whitespace-nowrap tabular-nums", !hasTime && "text-muted-foreground")}>
          {hasTime ? `${hourText}:${minuteText} ${period}` : "--:-- --"}
        </span>
        <Clock3
          size={16}
          aria-hidden
          className="shrink-0 text-muted-foreground"
        />
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner
          align="start"
          sideOffset={5}
          collisionPadding={8}
          className="z-[100] max-w-full"
        >
          <Popover.Popup
            ref={popup}
            aria-label="Select time"
            initialFocus={() =>
              popup.current?.querySelector<HTMLButtonElement>(
                '[aria-checked="true"]',
              ) ?? popup.current?.querySelector<HTMLElement>('[role="radio"]') ?? popup.current
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
              }
            }}
            className={cx(
              dropdownSurface,
              "w-44 max-w-full max-h-[var(--available-height)] p-1.5 outline-none",
            )}
          >
            <div className="grid grid-cols-3 gap-1">
              <TimeColumn
                label="Hour"
                options={Array.from({ length: 12 }, (_, i) =>
                  String(i + 1).padStart(2, "0"),
                )}
                value={hourText}
                onChange={(next) =>
                  onChange(timeValue(Number(next), minute, period))
                }
              />
              <TimeColumn
                label="Minute"
                options={Array.from({ length: 60 }, (_, i) =>
                  String(i).padStart(2, "0"),
                )}
                value={minuteText}
                onChange={(next) =>
                  onChange(timeValue(hour, Number(next), period))
                }
              />
              <TimeColumn
                label="AM or PM"
                options={["AM", "PM"]}
                value={periodText}
                onChange={(next) => onChange(timeValue(hour, minute, next))}
              />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
