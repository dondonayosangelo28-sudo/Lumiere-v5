import { useEffect, useId, useRef, useState, type PointerEvent } from "react"
import { Popover } from "@base-ui/react/popover"
import { Pipette, Plus, Trash2 } from "lucide-react"
import { Button, IconButton, Input, cx } from "./ui"
import { dropdownSurface } from "./Dropdown"
import { useCloseOnOverlay, useOverlayContainer } from "./OverlayLayer"
import {
  GRADIENT_STYLES,
  MAX_GRADIENT_STOPS,
  clampColour,
  gradientCss,
  hexHSV,
  hsvHex,
  parseGradient,
  validHex,
  type Gradient,
  type HSV,
} from "./colourValues"

type EyeDropperWindow = Window & {
  EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
}

/** Spectrum, hue bar and HEX row. Applies each change immediately. */
function SolidEditor({
  colour,
  onChange,
}: {
  colour: string
  onChange: (hex: string) => void
}) {
  const [hsv, setHSV] = useState(() => hexHSV(colour))
  const [draft, setDraft] = useState(colour.toUpperCase())
  const last = useRef(colour)
  useEffect(() => {
    if (colour !== last.current) {
      last.current = colour
      setHSV(hexHSV(colour))
      setDraft(colour.toUpperCase())
    }
  }, [colour])
  const choose = (hex: string, next = hexHSV(hex)) => {
    last.current = hex
    setHSV(next)
    setDraft(hex.toUpperCase())
    onChange(hex)
  }
  const chooseHSV = (next: HSV) => choose(hsvHex(next), next)
  const selectAt = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    chooseHSV({
      ...hsv,
      s: clampColour(((e.clientX - r.left) / r.width) * 100),
      v: clampColour(100 - ((e.clientY - r.top) / r.height) * 100),
    })
  }
  const EyeDropper = (window as EyeDropperWindow).EyeDropper
  return (
    <div className="colour-picker-solid">
      <Button
        type="button"
        data-colour-area
        variant="ghost"
        className="colour-picker-area"
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s)}
        aria-valuetext={`${Math.round(hsv.s)}% saturation, ${Math.round(hsv.v)}% brightness. Left and right change saturation; up and down change brightness.`}
        style={{ backgroundColor: hsvHex({ h: hsv.h, s: 100, v: 100 }) }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.focus()
          e.currentTarget.setPointerCapture(e.pointerId)
          selectAt(e)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) selectAt(e)
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1
          if (e.key === "ArrowLeft")
            chooseHSV({ ...hsv, s: clampColour(hsv.s - step) })
          else if (e.key === "ArrowRight")
            chooseHSV({ ...hsv, s: clampColour(hsv.s + step) })
          else if (e.key === "ArrowUp")
            chooseHSV({ ...hsv, v: clampColour(hsv.v + step) })
          else if (e.key === "ArrowDown")
            chooseHSV({ ...hsv, v: clampColour(hsv.v - step) })
          else return
          e.preventDefault()
        }}
      >
        <span
          className="colour-picker-cursor"
          style={{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            background: colour,
          }}
          aria-hidden
        />
      </Button>
      <Input
        type="range"
        min={0}
        max={360}
        step={1}
        value={Math.round(hsv.h)}
        aria-label="Hue"
        className="colour-picker-hue"
        onChange={(e) => chooseHSV({ ...hsv, h: Number(e.target.value) })}
      />
      <div className="colour-picker-hex-row">
        <span className="colour-picker-hex">
          <span
            className="colour-picker-dot"
            style={{ background: colour }}
            aria-hidden
          />
          <Input
            aria-label="Hex colour"
            value={draft}
            maxLength={7}
            spellCheck={false}
            aria-invalid={!validHex(draft) || undefined}
            onChange={(e) => {
              const hex = e.target.value.startsWith("#")
                ? e.target.value
                : `#${e.target.value}`
              setDraft(hex.toUpperCase())
              if (validHex(hex)) choose(hex.toLowerCase())
            }}
            onBlur={() => setDraft(colour.toUpperCase())}
          />
        </span>
        {EyeDropper && (
          <IconButton
            type="button"
            icon={Pipette}
            label="Pick a colour from the screen"
            className="colour-picker-eyedropper"
            onClick={async () => {
              try {
                const { sRGBHex } = await new EyeDropper().open()
                if (validHex(sRGBHex)) choose(sRGBHex.toLowerCase())
              } catch {
                /* Picking was cancelled. */
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

/** Theme-aware colour picker. `gradient` adds the Gradient tab for CSS-painted fills. */
export default function ColourPicker({
  value,
  onChange,
  label,
  text,
  gradient = false,
  className,
}: {
  value: string
  onChange: (paint: string) => void
  label: string
  text?: string
  palette?: readonly string[]
  gradient?: boolean
  className?: string
}) {
  const parsed = gradient ? parseGradient(value) : null
  const solid = validHex(value)
    ? value.toLowerCase()
    : (parsed?.stops[0] ?? "#000000")
  const paint = parsed || validHex(value) ? value : solid
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"solid" | "gradient">(
    parsed ? "gradient" : "solid",
  )
  const [stop, setStop] = useState(0)
  const popup = useRef<HTMLDivElement>(null)
  const container = useOverlayContainer()
  const tabsId = useId()
  useCloseOnOverlay(() => setOpen(false))

  const current: Gradient = parsed ?? {
    style: "diagonal",
    stops: [solid, "#ffffff"],
  }
  const setGradient = (next: Gradient) => onChange(gradientCss(next))
  const selected = Math.min(stop, current.stops.length - 1)
  const showTab = (next: "solid" | "gradient") => {
    setTab(next)
    if (next === "gradient" && !parsed) setGradient(current)
    if (next === "solid" && parsed) onChange(parsed.stops[0])
  }

  return (
    <Popover.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (next) setTab(parsed ? "gradient" : "solid")
        setOpen(next)
      }}
    >
      <Popover.Trigger
        render={<Button type="button" variant="ghost" />}
        className={cx("colour-picker-trigger", className)}
        aria-label={label}
        title={label}
      >
        <span
          className="colour-picker-chip"
          style={{ background: paint }}
          aria-hidden
        />
        {text && <span className="text-xs font-semibold">{text}</span>}
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner
          sideOffset={6}
          collisionPadding={8}
          align="start"
          className="z-[100] max-w-full"
        >
          <Popover.Popup
            ref={popup}
            aria-label={label}
            className={cx(dropdownSurface, "colour-picker-popup outline-none")}
            initialFocus={() =>
              popup.current?.querySelector<HTMLButtonElement>(
                '[role="tab"][aria-selected="true"], [data-colour-area]',
              ) ?? popup.current
            }
            onKeyDown={(e) => {
              // Keep editor shortcuts (delete, undo) from firing while picking.
              e.stopPropagation()
              if (e.key === "Escape") {
                e.preventDefault()
                setOpen(false)
              }
            }}
          >
            {gradient && (
              <div
                role="tablist"
                aria-label="Colour type"
                className="colour-picker-tabs"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
                  e.preventDefault()
                  showTab(tab === "solid" ? "gradient" : "solid")
                  requestAnimationFrame(() =>
                    popup.current
                      ?.querySelector<HTMLButtonElement>(
                        '[role="tab"][aria-selected="true"]',
                      )
                      ?.focus(),
                  )
                }}
              >
                {(["solid", "gradient"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant="ghost"
                    role="tab"
                    id={`${tabsId}-${t}`}
                    aria-selected={tab === t}
                    aria-controls={`${tabsId}-${t}-panel`}
                    tabIndex={tab === t ? 0 : -1}
                    className="colour-picker-tab"
                    onClick={() => showTab(t)}
                  >
                    {t === "solid" ? "Solid colour" : "Gradient"}
                  </Button>
                ))}
              </div>
            )}

            {tab === "solid" || !gradient ? (
              <div
                role={gradient ? "tabpanel" : undefined}
                id={`${tabsId}-solid-panel`}
                aria-labelledby={gradient ? `${tabsId}-solid` : undefined}
              >
                <SolidEditor colour={solid} onChange={onChange} />
              </div>
            ) : (
              <div
                role="tabpanel"
                id={`${tabsId}-gradient-panel`}
                aria-labelledby={`${tabsId}-gradient`}
                className="colour-picker-gradient"
              >
                <span className="colour-picker-heading" id={`${tabsId}-stops`}>
                  Gradient colours
                </span>
                <div
                  className="colour-picker-stops"
                  role="group"
                  aria-labelledby={`${tabsId}-stops`}
                >
                  {current.stops.map((c, i) => (
                    <Button
                      key={i}
                      type="button"
                      variant="ghost"
                      className="colour-picker-stop"
                      aria-label={`Edit gradient colour ${i + 1}, ${c.toUpperCase()}`}
                      aria-pressed={selected === i}
                      onClick={() => setStop(i)}
                    >
                      <span style={{ background: c }} aria-hidden />
                    </Button>
                  ))}
                  {current.stops.length < MAX_GRADIENT_STOPS && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="colour-picker-stop colour-picker-stop--add"
                      aria-label="Add gradient colour"
                      title="Add gradient colour"
                      onClick={() => {
                        setGradient({
                          ...current,
                          stops: [
                            ...current.stops,
                            current.stops[current.stops.length - 1],
                          ],
                        })
                        setStop(current.stops.length)
                      }}
                    >
                      <span aria-hidden>
                        <Plus size={16} strokeWidth={2.25} />
                      </span>
                    </Button>
                  )}
                </div>
                <span className="colour-picker-heading" id={`${tabsId}-style`}>
                  Style
                </span>
                <div
                  className="colour-picker-styles"
                  role="radiogroup"
                  aria-labelledby={`${tabsId}-style`}
                >
                  {GRADIENT_STYLES.map((g) => (
                    <Button
                      key={g.id}
                      type="button"
                      variant="ghost"
                      role="radio"
                      aria-checked={current.style === g.id}
                      aria-label={g.label}
                      title={g.label}
                      className="colour-picker-style"
                      onClick={() => setGradient({ ...current, style: g.id })}
                    >
                      <span
                        style={{
                          background: gradientCss({ ...current, style: g.id }),
                        }}
                        aria-hidden
                      />
                    </Button>
                  ))}
                </div>
                <div className="colour-picker-stop-editor">
                  <div className="flex items-center justify-between gap-2">
                    <span className="colour-picker-heading">
                      Colour {selected + 1}
                    </span>
                    {current.stops.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        icon={Trash2}
                        className="colour-picker-remove"
                        onClick={() => {
                          setGradient({
                            ...current,
                            stops: current.stops.filter(
                              (_, i) => i !== selected,
                            ),
                          })
                          setStop(Math.max(0, selected - 1))
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <SolidEditor
                    colour={current.stops[selected]}
                    onChange={(hex) =>
                      setGradient({
                        ...current,
                        stops: current.stops.map((c, i) =>
                          i === selected ? hex : c,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
