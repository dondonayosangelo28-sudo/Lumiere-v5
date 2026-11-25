import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Check, ChevronDown, ChevronRight, Search, X } from "lucide-react"
import { cx } from "../../../components/ui/ui"
import type { Pin } from "../model"
import {
  BOARD_FONT_OPTIONS,
  TEXT_STYLE_PRESETS,
  ensureBoardFontLoaded,
  findFontOption,
  fontWeightLabel,
  loadAllPreviewFonts,
  resolvePinFontWeight,
  type BoardFontOption,
  type TextStylePreset,
} from "./board-fonts"

type FontPanelTab = "font" | "styles"

const isTextPin = (pin: Pin) =>
  !pin.image && (!pin.kind || pin.kind === "text" || pin.kind === "sticky")

export function FontPanel({
  pin,
  pins,
  readOnly,
  onPatchPin,
  onClose,
}: {
  pin: Pin | undefined
  pins: Pin[]
  readOnly: boolean
  onPatchPin: (changes: Partial<Pin>) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<FontPanelTab>("font")
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const tabRefs = useRef<Record<FontPanelTab, HTMLButtonElement | null>>({
    font: null,
    styles: null,
  })

  useEffect(() => {
    loadAllPreviewFonts()
  }, [])

  const selectedTextPin = pin && isTextPin(pin) ? pin : undefined
  const activeFont = useMemo(
    () => findFontOption(selectedTextPin?.fontFamily),
    [selectedTextPin?.fontFamily],
  )
  const activeWeight = resolvePinFontWeight(selectedTextPin)

  // Auto-expand the currently selected pin's font family so its active weight is visible.
  useEffect(() => {
    if (!selectedTextPin) return
    setExpanded((prev) =>
      prev[activeFont.value] ? prev : { ...prev, [activeFont.value]: true },
    )
  }, [activeFont.value, selectedTextPin])

  const documentFonts = useMemo(() => {
    const seen = new Set<string>()
    const result: BoardFontOption[] = []
    for (const p of pins) {
      if (!isTextPin(p)) continue
      const option = findFontOption(p.fontFamily)
      if (seen.has(option.value)) continue
      seen.add(option.value)
      result.push(option)
    }
    return result
  }, [pins])

  const normalizedQuery = query.trim().toLowerCase()
  const compactQuery = normalizedQuery.replace(/[\s_-]+/g, "")

  const matchesQuery = (opt: BoardFontOption) => {
    if (!normalizedQuery) return true
    if (opt.label.toLowerCase().includes(normalizedQuery)) return true
    if (
      compactQuery &&
      opt.label.toLowerCase().replace(/[\s_-]+/g, "").includes(compactQuery)
    ) {
      return true
    }
    return Boolean(
      opt.aliases?.some(
        (alias) =>
          alias.includes(normalizedQuery) ||
          (compactQuery && alias.includes(compactQuery)),
      ),
    )
  }

  const filteredDocumentFonts = useMemo(() => {
    if (!normalizedQuery) return documentFonts
    return documentFonts.filter(matchesQuery)
  }, [documentFonts, normalizedQuery])

  const filteredLibraryFonts = useMemo(() => {
    if (!normalizedQuery) return BOARD_FONT_OPTIONS
    return BOARD_FONT_OPTIONS.filter(matchesQuery)
  }, [normalizedQuery])

  const toggleExpand = (fontValue: string) => {
    setExpanded((prev) => ({ ...prev, [fontValue]: !prev[fontValue] }))
  }

  const applyFontWeight = (font: BoardFontOption, weight: number) => {
    if (readOnly || !selectedTextPin) return
    void ensureBoardFontLoaded(font.value)
    onPatchPin({
      fontFamily: font.value,
      fontWeight: weight,
      bold: weight >= 600,
      textStyle: undefined,
    })
  }

  const applyTextStyle = (preset: TextStylePreset) => {
    if (readOnly || !selectedTextPin) return
    void ensureBoardFontLoaded(preset.fontFamily)
    onPatchPin({
      textStyle: preset.id,
      fontFamily: preset.fontFamily,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      bold: preset.fontWeight >= 600,
      lineHeight: preset.lineHeight,
    })
  }

  const isPresetActive = (preset: TextStylePreset) => {
    if (!selectedTextPin) return false
    if (selectedTextPin.textStyle) {
      return selectedTextPin.textStyle === preset.id
    }
    const pinFamily = findFontOption(selectedTextPin.fontFamily).value
    const presetFamily = findFontOption(preset.fontFamily).value
    return (
      pinFamily === presetFamily &&
      (selectedTextPin.fontSize ?? 22) === preset.fontSize &&
      activeWeight === preset.fontWeight &&
      (selectedTextPin.lineHeight ?? 1.25) === preset.lineHeight
    )
  }

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: FontPanelTab) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    const next: FontPanelTab = current === "font" ? "styles" : "font"
    setActiveTab(next)
    tabRefs.current[next]?.focus()
  }

  const renderFontRow = (font: BoardFontOption, sectionKey: string) => {
    const isExpanded = Boolean(expanded[font.value])
    const isCurrentFamily = Boolean(
      selectedTextPin && activeFont.value === font.value,
    )

    return (
      <div
        key={`${sectionKey}-${font.value}`}
        className="rounded-lg border border-transparent transition-colors"
      >
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => toggleExpand(font.value)}
          className={cx(
            "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-fg/30",
            isCurrentFamily
              ? "bg-fg/[0.08] font-medium text-foreground"
              : "text-foreground hover:bg-fg/[0.06]",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {isExpanded ? (
              <ChevronDown
                size={15}
                aria-hidden
                className="shrink-0 text-muted-foreground"
              />
            ) : (
              <ChevronRight
                size={15}
                aria-hidden
                className="shrink-0 text-muted-foreground"
              />
            )}
            <span
              className="truncate text-[15px]"
              style={{ fontFamily: font.value }}
            >
              {font.label}
            </span>
          </span>
          {isCurrentFamily && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {fontWeightLabel(activeWeight)}
            </span>
          )}
        </button>

        {isExpanded && (
          <div
            role="group"
            aria-label={`${font.label} weights`}
            className="mt-0.5 space-y-0.5 pl-6 pr-1 pb-1"
          >
            {font.weights.map((weight) => {
              const isSelected = isCurrentFamily && activeWeight === weight
              return (
                <button
                  key={weight}
                  type="button"
                  disabled={readOnly || !selectedTextPin}
                  aria-pressed={isSelected}
                  onClick={() => applyFontWeight(font, weight)}
                  className={cx(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-default disabled:opacity-50",
                    isSelected
                      ? "bg-fg/[0.12] font-medium text-foreground"
                      : "text-foreground/90 hover:bg-fg/[0.06]",
                  )}
                >
                  <span
                    className="truncate"
                    style={{ fontFamily: font.value, fontWeight: weight }}
                  >
                    {fontWeightLabel(weight)}
                  </span>
                  {isSelected && (
                    <Check size={15} aria-hidden className="shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel text-foreground">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Font
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close font panel"
          title="Close"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fg/[0.08] hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Font panel sections"
        className="grid shrink-0 grid-cols-2 border-b border-line px-3"
      >
        <button
          ref={(el) => {
            tabRefs.current.font = el
          }}
          type="button"
          role="tab"
          id="font-panel-tab-font"
          aria-selected={activeTab === "font"}
          aria-controls="font-panel-tabpanel-font"
          tabIndex={activeTab === "font" ? 0 : -1}
          onClick={() => setActiveTab("font")}
          onKeyDown={(e) => onTabKeyDown(e, "font")}
          className={cx(
            "relative py-2.5 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/30",
            activeTab === "font"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Font
          {activeTab === "font" && (
            <span
              aria-hidden
              className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-foreground"
            />
          )}
        </button>
        <button
          ref={(el) => {
            tabRefs.current.styles = el
          }}
          type="button"
          role="tab"
          id="font-panel-tab-styles"
          aria-selected={activeTab === "styles"}
          aria-controls="font-panel-tabpanel-styles"
          tabIndex={activeTab === "styles" ? 0 : -1}
          onClick={() => setActiveTab("styles")}
          onKeyDown={(e) => onTabKeyDown(e, "styles")}
          className={cx(
            "relative py-2.5 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/30",
            activeTab === "styles"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Text styles
          {activeTab === "styles" && (
            <span
              aria-hidden
              className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-foreground"
            />
          )}
        </button>
      </div>

      {/* Scrollable Body */}
      {activeTab === "font" ? (
        <div
          role="tabpanel"
          id="font-panel-tabpanel-font"
          aria-labelledby="font-panel-tab-font"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 p-3 pb-2">
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
                aria-label="Search fonts"
                placeholder="Search fonts…"
                className="h-9 w-full rounded-lg border border-line bg-field pl-9 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-fg/25"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear font search"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X size={13} aria-hidden />
                </button>
              )}
            </div>
            {!selectedTextPin && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Select a text element on the board to apply a font or weight.
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-4">
            {filteredDocumentFonts.length > 0 && (
              <section aria-label="Document fonts">
                <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Document fonts
                </h3>
                <div className="space-y-0.5">
                  {filteredDocumentFonts.map((font) =>
                    renderFontRow(font, "doc"),
                  )}
                </div>
              </section>
            )}

            <section aria-label="Font library">
              <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Font library
              </h3>
              {filteredLibraryFonts.length > 0 ? (
                <div className="space-y-0.5">
                  {filteredLibraryFonts.map((font) =>
                    renderFontRow(font, "lib"),
                  )}
                </div>
              ) : (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No matching fonts
                </p>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="font-panel-tabpanel-styles"
          aria-labelledby="font-panel-tab-styles"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        >
          <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Document styles
          </h3>
          {!selectedTextPin && (
            <p className="mb-2 px-1 text-[11px] text-muted-foreground">
              Select a text element on the board to apply a text style.
            </p>
          )}
          <div className="space-y-2">
            {TEXT_STYLE_PRESETS.map((preset) => {
              const active = isPresetActive(preset)
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={readOnly || !selectedTextPin}
                  aria-pressed={active}
                  onClick={() => applyTextStyle(preset)}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-default disabled:opacity-50",
                    active
                      ? "border-foreground/30 bg-fg/[0.1]"
                      : "border-line bg-field/60 hover:bg-fg/[0.06]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-foreground"
                      style={{
                        fontFamily: preset.fontFamily,
                        fontSize: `${preset.previewSize}px`,
                        fontWeight: preset.fontWeight,
                        lineHeight: preset.lineHeight,
                      }}
                    >
                      {preset.label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {findFontOption(preset.fontFamily).label} ·{" "}
                      {fontWeightLabel(preset.fontWeight)} · {preset.fontSize}px
                    </div>
                  </div>
                  {active && (
                    <Check size={16} aria-hidden className="shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default FontPanel
