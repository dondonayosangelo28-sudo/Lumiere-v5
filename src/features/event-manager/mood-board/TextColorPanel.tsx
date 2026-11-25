import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Pipette, Plus, Search, X } from "lucide-react"
import {
  hexRGB,
  parseGradient,
  validHex,
} from "../../../components/ui/colourValues"
import { cx } from "../../../components/ui/ui"
import type { Brief, Pin } from "../model"
import {
  DEFAULT_GRADIENT_COLORS,
  DEFAULT_SOLID_COLORS,
  FULL_SOLID_PALETTE,
  GRADIENT_SECTIONS,
  collectBoardPhotos,
  collectDesignColors,
  extractPhotoPalette,
  findColorName,
  normalizeHexInput,
  type NamedColor,
} from "./board-colors"

type EyeDropperConstructor = new () => {
  open: () => Promise<{ sRGBHex: string }>
}

type PaletteView = "main" | "solids" | "gradients"

const isTextPin = (pin: Pin) =>
  !pin.image && (!pin.kind || pin.kind === "text" || pin.kind === "sticky")

function isLightSwatch(value: string): boolean {
  const hex = validHex(value)
    ? value
    : parseGradient(value)?.stops[0]
  if (!hex) return false
  const [r, g, b] = hexRGB(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 180
}

export function TextColorPanel({
  pin,
  brief,
  readOnly,
  onPatchPin,
  onClose,
}: {
  pin: Pin | undefined
  brief: Pick<Brief, "pins" | "boardPages">
  readOnly: boolean
  onPatchPin: (changes: Partial<Pin>) => void
  onClose: () => void
}) {
  const [view, setView] = useState<PaletteView>("main")
  const [query, setQuery] = useState("")
  const [customOpen, setCustomOpen] = useState(false)
  const [hexInput, setHexInput] = useState("#292524")
  const [hexError, setHexError] = useState<string | null>(null)
  const [photoPalettes, setPhotoPalettes] = useState<Record<string, string[]>>({})

  const selectedTextPin = pin && isTextPin(pin) ? pin : undefined
  const activeColor = selectedTextPin?.color ?? "#292524"
  const activeNormalized = activeColor.trim().toLowerCase()
  const activeGradient = parseGradient(activeColor)
  const activeSolidHex = validHex(activeColor)
    ? activeColor.toLowerCase()
    : activeGradient?.stops[0] ?? "#292524"

  useEffect(() => {
    setHexInput(activeSolidHex)
    setHexError(null)
  }, [selectedTextPin?.id, activeSolidHex])

  const designColors = useMemo(() => collectDesignColors(brief), [brief])
  const boardPhotos = useMemo(() => collectBoardPhotos(brief), [brief])

  useEffect(() => {
    let alive = true
    for (const photo of boardPhotos) {
      if (photoPalettes[photo.src] !== undefined) continue
      void extractPhotoPalette(photo.src).then((colors) => {
        if (!alive) return
        setPhotoPalettes((prev) =>
          prev[photo.src] !== undefined ? prev : { ...prev, [photo.src]: colors },
        )
      })
    }
    return () => {
      alive = false
    }
  }, [boardPhotos, photoPalettes])

  const supportsEyeDropper =
    typeof window !== "undefined" && "EyeDropper" in window

  const applyColor = (color: string) => {
    if (readOnly || !selectedTextPin) return
    onPatchPin({ color })
  }

  const handleEyeDropper = async () => {
    if (readOnly || !selectedTextPin || !supportsEyeDropper) return
    try {
      const EyeDropperApi = (
        window as unknown as { EyeDropper: EyeDropperConstructor }
      ).EyeDropper
      const result = await new EyeDropperApi().open()
      const normalized = normalizeHexInput(result.sRGBHex)
      if (normalized) {
        setHexInput(normalized)
        setHexError(null)
        applyColor(normalized)
      }
    } catch {
      // User cancelled or browser blocked EyeDropper.
    }
  }

  const handleHexChange = (raw: string) => {
    setHexInput(raw)
    const normalized = normalizeHexInput(raw)
    if (normalized) {
      setHexError(null)
      applyColor(normalized)
    } else if (raw.trim().length > 0) {
      setHexError("Enter a valid 3- or 6-digit HEX code (e.g. #292524).")
    } else {
      setHexError("HEX code is required.")
    }
  }

  const normalizedQuery = query.trim().toLowerCase()
  const hexQuery = normalizedQuery.replace(/^#/, "")

  const matchesColor = (value: string, label?: string) => {
    if (!normalizedQuery) return true
    const name = (label ?? findColorName(value)).toLowerCase()
    const val = value.toLowerCase()
    return (
      name.includes(normalizedQuery) ||
      val.includes(normalizedQuery) ||
      (hexQuery.length > 0 && val.replace(/^#/, "").includes(hexQuery))
    )
  }

  const filteredDesignColors = useMemo(
    () => designColors.filter((c) => matchesColor(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [designColors, normalizedQuery],
  )

  const filteredSolids = useMemo(() => {
    if (!normalizedQuery) return DEFAULT_SOLID_COLORS
    return FULL_SOLID_PALETTE.filter((c) => matchesColor(c.value, c.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedQuery])

  const allGradientItems = useMemo(
    () => GRADIENT_SECTIONS.flatMap((s) => s.items),
    [],
  )

  const filteredGradients = useMemo(() => {
    if (!normalizedQuery) return DEFAULT_GRADIENT_COLORS
    return allGradientItems.filter((c) => matchesColor(c.value, c.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGradientItems, normalizedQuery])

  const filteredPhotoGroups = useMemo(
    () =>
      boardPhotos
        .map((photo) => {
          const rawPalette = photoPalettes[photo.src] ?? []
          const colors = rawPalette.filter((c) => matchesColor(c))
          return { photo, colors }
        })
        .filter((group) => group.colors.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardPhotos, photoPalettes, normalizedQuery],
  )

  const renderSwatch = (
    value: string,
    label: string,
    keyPrefix: string,
    index?: number,
  ) => {
    const isActive =
      Boolean(selectedTextPin) && activeNormalized === value.trim().toLowerCase()
    const light = isLightSwatch(value)
    return (
      <button
        key={`${keyPrefix}-${value}-${index ?? ""}`}
        type="button"
        disabled={readOnly || !selectedTextPin}
        aria-label={`${label} (${value})`}
        aria-pressed={isActive}
        title={`${label} · ${value}`}
        onClick={() => applyColor(value)}
        className={cx(
          "relative flex aspect-square w-full min-w-0 items-center justify-center rounded-full transition-transform outline-none focus-visible:ring-2 focus-visible:ring-fg/50 disabled:cursor-default disabled:opacity-50",
          !readOnly && selectedTextPin && "hover:scale-105",
          light && "border border-line",
          isActive &&
            "ring-2 ring-foreground ring-offset-2 ring-offset-panel",
        )}
        style={{ background: value }}
      >
        {isActive && (
          <Check
            size={13}
            strokeWidth={2.5}
            aria-hidden
            className={light ? "text-stone-900" : "text-white drop-shadow-sm"}
          />
        )}
      </button>
    )
  }

  if (view === "solids") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-panel text-foreground">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setView("main")}
              aria-label="Back to Text color"
              title="Back"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fg/[0.08] hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
            >
              <ArrowLeft size={16} aria-hidden />
            </button>
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
              Default solid colors
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close text color panel"
            title="Close"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fg/[0.08] hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-5">
          <div
            role="group"
            aria-label="Default solid colors"
            className="grid grid-cols-7 gap-2"
          >
            {FULL_SOLID_PALETTE.map((c, idx) =>
              renderSwatch(c.value, c.name, "full-solid", idx),
            )}
          </div>
        </div>
      </div>
    )
  }

  if (view === "gradients") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-panel text-foreground">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setView("main")}
              aria-label="Back to Text color"
              title="Back"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fg/[0.08] hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
            >
              <ArrowLeft size={16} aria-hidden />
            </button>
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
              Default gradient colors
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close text color panel"
            title="Close"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fg/[0.08] hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3 pb-5">
          {GRADIENT_SECTIONS.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="mb-2 text-[11px] font-semibold text-muted-foreground">
                {section.title}
              </h3>
              <div className="grid grid-cols-7 gap-2">
                {section.items.map((c, idx) =>
                  renderSwatch(c.value, c.name, `grad-${section.title}`, idx),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel text-foreground">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Text color
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close text color panel"
          title="Close"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fg/[0.08] hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-line p-3">
        <div className="relative">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search colors by name or HEX code"
            placeholder="Try “sage” or #7A8069"
            className="h-9 w-full rounded-lg border border-line bg-field pl-9 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-fg/25"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear color search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X size={13} aria-hidden />
            </button>
          )}
        </div>
        {!selectedTextPin && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Select a text element on the board to change its text color.
          </p>
        )}
      </div>

      {/* Scrollable Body */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3 pb-5">
        {/* Text colors (custom + eyedropper + current) */}
        <section aria-label="Text colors">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Text colors
            </h3>
            <span className="truncate pl-2 text-[11px] text-muted-foreground">
              {findColorName(activeColor)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={readOnly || !selectedTextPin}
              aria-label="Add custom color"
              aria-expanded={customOpen}
              title="Add custom color"
              onClick={() => setCustomOpen((v) => !v)}
              className={cx(
                "inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-line bg-field text-foreground transition-colors hover:bg-fg/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:cursor-default disabled:opacity-50",
                customOpen && "border-solid border-foreground/40 bg-fg/[0.1]",
              )}
            >
              <Plus size={15} aria-hidden />
            </button>
            {supportsEyeDropper && (
              <button
                type="button"
                disabled={readOnly || !selectedTextPin}
                aria-label="Pick color from screen"
                title="Eyedropper"
                onClick={handleEyeDropper}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-field text-foreground transition-colors hover:bg-fg/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:cursor-default disabled:opacity-50"
              >
                <Pipette size={14} aria-hidden />
              </button>
            )}
            <div
              aria-label={`Current text color: ${findColorName(activeColor)}`}
              title={`Current: ${activeColor}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line ring-2 ring-foreground ring-offset-2 ring-offset-panel"
              style={{ background: activeColor }}
            >
              <Check
                size={13}
                strokeWidth={2.5}
                aria-hidden
                className={
                  isLightSwatch(activeColor)
                    ? "text-stone-900"
                    : "text-white drop-shadow-sm"
                }
              />
            </div>
          </div>

          {customOpen && (
            <div className="mt-2.5 rounded-lg border border-line bg-field/70 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Choose custom color"
                  disabled={readOnly || !selectedTextPin}
                  value={activeSolidHex}
                  onChange={(e) => {
                    const next = e.target.value.toLowerCase()
                    setHexInput(next)
                    setHexError(null)
                    applyColor(next)
                  }}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
                />
                <input
                  type="text"
                  aria-label="Custom HEX color"
                  disabled={readOnly || !selectedTextPin}
                  value={hexInput}
                  placeholder="#292524"
                  onChange={(e) => handleHexChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleHexChange(hexInput)
                    }
                  }}
                  className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-fg/25"
                />
              </div>
              {hexError && (
                <p role="alert" className="mt-1.5 text-[11px] text-rose-500">
                  {hexError}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Colors in this design */}
        {filteredDesignColors.length > 0 && (
          <section aria-label="Colors in this design">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Colors in this design
            </h3>
            <div className="grid grid-cols-7 gap-2">
              {filteredDesignColors.map((color, idx) =>
                renderSwatch(color, findColorName(color), "design", idx),
              )}
            </div>
          </section>
        )}

        {/* Photo colors */}
        {filteredPhotoGroups.length > 0 && (
          <section aria-label="Photo colors">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Photo colors
            </h3>
            <div className="space-y-2.5">
              {filteredPhotoGroups.map(({ photo, colors }) => (
                <div
                  key={photo.id}
                  className="flex items-center gap-2.5"
                >
                  <img
                    src={photo.src}
                    alt={photo.title}
                    className="h-7 w-7 shrink-0 rounded-md border border-line object-cover"
                  />
                  <div className="grid min-w-0 flex-1 grid-cols-5 gap-2">
                    {colors.map((color, idx) =>
                      renderSwatch(
                        color,
                        `${photo.title} ${color}`,
                        `photo-${photo.id}`,
                        idx,
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Default solid colors */}
        {filteredSolids.length > 0 && (
          <section aria-label="Default solid colors">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Default solid colors
              </h3>
              {!normalizedQuery && (
                <button
                  type="button"
                  onClick={() => setView("solids")}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground outline-none focus-visible:underline"
                >
                  See all
                </button>
              )}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {filteredSolids.map((c: NamedColor, idx) =>
                renderSwatch(c.value, c.name, "solid", idx),
              )}
            </div>
          </section>
        )}

        {/* Default gradient colors */}
        {filteredGradients.length > 0 && (
          <section aria-label="Default gradient colors">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Default gradient colors
              </h3>
              {!normalizedQuery && (
                <button
                  type="button"
                  onClick={() => setView("gradients")}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground outline-none focus-visible:underline"
                >
                  See all
                </button>
              )}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {filteredGradients.map((c: NamedColor, idx) =>
                renderSwatch(c.value, c.name, "gradient", idx),
              )}
            </div>
          </section>
        )}

        {normalizedQuery &&
          filteredDesignColors.length === 0 &&
          filteredPhotoGroups.length === 0 &&
          filteredSolids.length === 0 &&
          filteredGradients.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No matching colors
            </p>
          )}
      </div>
    </div>
  )
}

export default TextColorPanel
