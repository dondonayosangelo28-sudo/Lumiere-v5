import { useEffect, useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Copy,
  Droplet,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Italic,
  Lock,
  LockOpen,
  Minus,
  Plus,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { Badge, IconButton, cx } from "../../../components/ui/ui"
import Dropdown from "../../../components/ui/Dropdown"
import ColourPicker from "../../../components/ui/ColourPicker"
import { fieldCls, ghostBtn } from "../../../components/admin/AdminKit"
import type { Pin } from "../model"
import { clamp, LEGACY_PAPER, type Tab } from "./canvas-constants"
import {
  findFontOption,
  resolvePinFontWeight,
} from "./board-fonts"

export function CanvasContextToolbar({
  pin,
  readOnly,
  tool,
  setTool,
  patchPin,
  palette,
  docColors,
  tab,
  setTab,
  duplicate,
  remove,
  page,
  pageBackground,
  changePageBackground,
  fontPanelOpen,
  onToggleFontPanel,
  textColorPanelOpen,
  onToggleTextColorPanel,
}: {
  pin: Pin | undefined
  readOnly: boolean
  tool: "select" | "pan" | "draw"
  setTool: (tool: "select" | "pan" | "draw") => void
  patchPin: (changes: Partial<Pin>) => void
  palette: readonly string[]
  docColors: string[]
  tab: Tab | null
  setTab: (tab: Tab | null | ((t: Tab | null) => Tab | null)) => void
  duplicate: (p: Pin) => void
  remove: () => void
  page: number
  pageBackground: string
  changePageBackground: (color: string) => void
  showPages: boolean
  setShowPages: (show: boolean | ((s: boolean) => boolean)) => void
  pageGrid: boolean
  setPageGrid: (grid: boolean | ((g: boolean) => boolean)) => void
  fontPanelOpen?: boolean
  onToggleFontPanel?: () => void
  textColorPanelOpen?: boolean
  onToggleTextColorPanel?: () => void
}) {
  const currentFontSize = pin?.fontSize ?? 22
  const [sizeInput, setSizeInput] = useState(String(currentFontSize))

  useEffect(() => {
    setSizeInput(String(currentFontSize))
  }, [pin?.id, currentFontSize])

  const commitFontSize = (raw: string) => {
    const parsed = Number(raw.trim())
    if (!raw.trim() || !Number.isFinite(parsed)) {
      setSizeInput(String(currentFontSize))
      return
    }
    const next = clamp(Math.round(parsed), 8, 144)
    setSizeInput(String(next))
    if (next !== currentFontSize) {
      patchPin({ fontSize: next })
    }
  }
  const iconButton = (
    Icon: LucideIcon,
    label: string,
    action: () => void,
    {
      disabled = false,
      active = false,
      text,
    }: { disabled?: boolean; active?: boolean; text?: string } = {},
  ) =>
    text ? (
      <button
        type="button"
        className={cx(ghostBtn, active && "bg-fg/[0.18]")}
        title={label}
        disabled={disabled}
        aria-pressed={active || undefined}
        onClick={action}
      >
        <Icon size={15} strokeWidth={1.75} aria-hidden />
        {text}
      </button>
    ) : (
      <IconButton
        type="button"
        icon={Icon}
        label={label}
        disabled={disabled}
        aria-pressed={active || undefined}
        onClick={action}
        className={cx(
          "shrink-0 disabled:pointer-events-none disabled:opacity-40",
          active && "bg-fg/[0.18] text-foreground",
        )}
      />
    )

  const dropdown = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: readonly (readonly [string, string])[],
    className?: string,
  ) => (
    <div className={cx("relative", className)}>
      <Dropdown
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(fieldCls, "appearance-none pr-9 text-left")}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Dropdown>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )

  const swatch = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    text?: string,
    gradient = false,
  ) => (
    <ColourPicker
      label={label}
      value={value}
      onChange={onChange}
      text={text}
      gradient={gradient}
      palette={palette}
    />
  )

  const divider = <span className="mb-divider" aria-hidden />

  const textPin =
    pin &&
    !pin.image &&
    (!pin.kind || pin.kind === "text" || pin.kind === "sticky")
  const alignIcon =
    pin?.align === "center"
      ? AlignCenter
      : pin?.align === "right"
        ? AlignRight
        : AlignLeft
  const nextAlign: Record<string, Pin["align"]> = {
    left: "center",
    center: "right",
    right: "left",
  }

  const selectionTools = pin ? (
    pin.locked ? (
      <>
        <Badge tone="neutral">Locked</Badge>
        {iconButton(LockOpen, "Unlock", () => patchPin({ locked: false }), {
          text: "Unlock",
        })}
      </>
    ) : (
      <>
        {textPin && (
          <>
            {(() => {
              const activeFont = findFontOption(pin.fontFamily)
              return (
                <button
                  type="button"
                  aria-label="Font"
                  title="Font & text styles"
                  aria-expanded={fontPanelOpen}
                  disabled={readOnly}
                  onClick={onToggleFontPanel}
                  className={cx(
                    fieldCls,
                    "mb-compact flex h-8 w-[148px] items-center justify-between gap-1.5 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-default disabled:opacity-60",
                    fontPanelOpen && "ring-2 ring-fg/25",
                  )}
                >
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ fontFamily: activeFont.value }}
                  >
                    {activeFont.label}
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className="shrink-0 opacity-60"
                  />
                </button>
              )
            })()}
            <span className="mb-stepper">
              <button
                type="button"
                aria-label="Decrease font size"
                onClick={() =>
                  patchPin({
                    fontSize: clamp((pin.fontSize ?? 22) - 2, 8, 144),
                  })
                }
              >
                <Minus size={14} aria-hidden />
              </button>
              <input
                type="number"
                inputMode="numeric"
                aria-label="Font size"
                min={8}
                max={144}
                disabled={readOnly}
                value={sizeInput}
                onChange={(e) => setSizeInput(e.target.value)}
                onBlur={() => commitFontSize(sizeInput)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitFontSize(sizeInput)
                    e.currentTarget.blur()
                  } else if (e.key === "Escape") {
                    e.preventDefault()
                    setSizeInput(String(currentFontSize))
                    e.currentTarget.blur()
                  }
                }}
              />
              <button
                type="button"
                aria-label="Increase font size"
                onClick={() =>
                  patchPin({
                    fontSize: clamp((pin.fontSize ?? 22) + 2, 8, 144),
                  })
                }
              >
                <Plus size={14} aria-hidden />
              </button>
            </span>
            <button
              type="button"
              aria-label="Text color"
              title="Text color"
              aria-expanded={textColorPanelOpen}
              disabled={readOnly}
              onClick={onToggleTextColorPanel}
              className={cx(
                "grid size-8 shrink-0 place-items-center rounded-full p-0 text-muted-foreground transition-colors hover:bg-elev hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
                textColorPanelOpen && "bg-fg/[0.18] text-foreground",
              )}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                className="h-5 w-5 shrink-0"
              >
                <defs>
                  <linearGradient
                    id="mb-text-color-bar"
                    x1="2.5"
                    y1="0"
                    x2="17.5"
                    y2="0"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="22%" stopColor="#f97316" />
                    <stop offset="42%" stopColor="#eab308" />
                    <stop offset="62%" stopColor="#22c55e" />
                    <stop offset="80%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                </defs>
                <path
                  d="M5.5 13.5 10 2.5l4.5 11M7 10h6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="2.5"
                  y="16"
                  width="15"
                  height="3"
                  rx="1.5"
                  fill="url(#mb-text-color-bar)"
                />
              </svg>
            </button>
            {(() => {
              const isBold = resolvePinFontWeight(pin) >= 600
              return iconButton(
                Bold,
                "Bold",
                () =>
                  patchPin({
                    bold: !isBold,
                    fontWeight: isBold ? 400 : 700,
                    textStyle: undefined,
                  }),
                {
                  active: isBold,
                },
              )
            })()}
            {iconButton(
              Italic,
              "Italic",
              () => patchPin({ italic: !pin.italic }),
              { active: pin.italic },
            )}
            {iconButton(alignIcon, `Alignment: ${pin.align ?? "left"}`, () =>
              patchPin({ align: nextAlign[pin.align ?? "left"] }),
            )}
            {pin.kind !== "text" &&
              swatch("Note color", pin.fill ?? "#fff1b8", (fill) =>
                patchPin({ fill }), undefined, true,
              )}
          </>
        )}
        {["rect", "circle", "triangle", "diamond", "star", "arrow", "frame"].includes(pin.kind ?? "") &&
          swatch(
            "Fill color",
            pin.fill ?? "#d6c7b3",
            (fill) => patchPin({ fill }),
            "Color",
            ["rect", "circle", "frame"].includes(pin.kind ?? ""),
          )}
        {(pin.kind === "line" || pin.kind === "draw") &&
          swatch(
            "Stroke color",
            pin.color ?? "#44403c",
            (color) => patchPin({ color }),
            "Color",
          )}
        {pin.image && (
          <>
            {iconButton(
              FlipHorizontal2,
              "Flip horizontal",
              () => patchPin({ flipX: !pin.flipX }),
              { active: pin.flipX },
            )}
            {iconButton(
              FlipVertical2,
              "Flip vertical",
              () => patchPin({ flipY: !pin.flipY }),
              { active: pin.flipY },
            )}
          </>
        )}
        {divider}
        <label className="mb-opacity" title="Transparency">
          <Droplet size={15} strokeWidth={1.75} aria-hidden />
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            aria-label="Transparency"
            value={Math.round((pin.opacity ?? 1) * 100)}
            onChange={(e) =>
              patchPin({ opacity: Number(e.target.value) / 100 })
            }
          />
        </label>
        {iconButton(SlidersHorizontal, "Edit, align and effects", () => setTab("layers"), {
          text: "Edit",
          active: tab === "layers",
        })}
        {divider}
        {iconButton(Lock, "Lock", () => patchPin({ locked: true }))}
        {iconButton(Copy, "Duplicate", () => duplicate(pin))}
        {iconButton(Trash2, "Delete", remove)}
      </>
    )
  ) : null

  const pageTools =
    tool === "draw" ? (
      <>
        <Badge tone="neutral">Drawing on page {page + 1}</Badge>
        {iconButton(Hand, "Stop drawing", () => setTool("select"), {
          text: "Done",
        })}
      </>
    ) : (
      <>
        {swatch(
          `Page ${page + 1} background`,
          pageBackground ?? LEGACY_PAPER,
          changePageBackground,
          "Background",
          true,
        )}
      </>
    )

  return (
    <div
      className="mb-context"
      role="toolbar"
      aria-label="Edit selection"
    >
      {selectionTools ?? pageTools}
    </div>
  )
}

export default CanvasContextToolbar

