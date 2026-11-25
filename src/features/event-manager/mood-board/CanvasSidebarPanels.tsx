import { type ReactNode, type RefObject } from "react"
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  ChevronDown,
  ChevronLeft,
  ChevronsDown,
  ChevronsUp,
  CloudUpload,
  Eye,
  EyeOff,
  Link2,
  Lock,
  LockOpen,
  PenTool,
  RotateCcw,
  Search,
  SendToBack,
  Type,
  type LucideIcon,
} from "lucide-react"
import { Button, IconButton, Input, Toggle, cx } from "../../../components/ui/ui"
import Dropdown from "../../../components/ui/Dropdown"
import ColourPicker from "../../../components/ui/ColourPicker"
import { fieldCls, ghostBtn } from "../../../components/admin/AdminKit"
import { safePaint, validHex } from "../../../components/ui/colourValues"
import Board, { PAGE_H, pinHeight } from "./Board"
import { safeImage, type Brief, type Pin } from "../model"
import { themeTemplate } from "./theme-templates"
import { FieldError, Visual } from "../shared"
import {
  clamp,
  NEW_PAPER,
  PEN_COLORS,
  TEMPLATES,
  type ShelfItem,
  type Tab,
} from "./canvas-constants"

export function CanvasSidebarPanels({
  tab,
  brief,
  readOnly,
  page,
  pages,
  palette,
  docColors,
  shelf,
  onAddShelf,
  pin,
  fillFrame,
  add,
  applyTemplate,
  applyTheme,
  themeTemplates,
  selectedTheme,
  setSelectedTheme,
  query,
  setQuery,
  category,
  setCategory,
  web,
  setWeb,
  link,
  setLink,
  linkError,
  setLinkError,
  uploading,
  upload,
  inputRef,
  duplicate,
  tool,
  setTool,
  penColor,
  setPenColor,
  patchPin,
  reorder,
  stepLayer,
  alignTo,
  goTo,
  selected,
  select,
  setPins,
}: {
  tab: Tab
  brief: Brief
  readOnly: boolean
  page: number
  pages: { title: string; background?: string }[]
  palette: readonly string[]
  docColors: string[]
  shelf: ShelfItem[]
  onAddShelf: (key: string, page: number) => void
  pin: Pin | undefined
  fillFrame: (frameId: string, item: { key?: string; files?: File[] }) => void
  add: (changes: Partial<Pin>) => void
  applyTemplate: (id: string) => void
  applyTheme: (template: ReturnType<typeof themeTemplate>, selectedPages: number[]) => void
  themeTemplates: ReturnType<typeof themeTemplate>[]
  selectedTheme: string | null
  setSelectedTheme: (id: string | null) => void
  query: string
  setQuery: (q: string) => void
  category: string
  setCategory: (c: string) => void
  web: string
  setWeb: (w: string) => void
  link: { title: string; url: string }
  setLink: (l: { title: string; url: string }) => void
  linkError: string
  setLinkError: (e: string) => void
  uploading: boolean
  upload: (files: File[], x?: number, y?: number, page?: number) => Promise<void>
  inputRef: RefObject<HTMLInputElement | null>
  duplicate: (p: Pin, targetPage?: number) => void
  tool: "select" | "pan" | "draw"
  setTool: (t: "select" | "pan" | "draw") => void
  penColor: string
  setPenColor: (c: string) => void
  patchPin: (changes: Partial<Pin>) => void
  reorder: (front: boolean) => void
  stepLayer: (dir: 1 | -1) => void
  alignTo: (where: "left" | "center" | "right" | "top" | "middle" | "bottom") => void
  goTo: (index: number) => void
  selected: string | null
  select: (id: string | null) => void
  setPins: (pins: Pin[]) => void
}): ReactNode {
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

  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    action: (n: number) => void,
    step = 1,
  ) => (
    <label className="mb-field">
      {label}
      <input
        className={cx(fieldCls, "tabular-nums")}
        type="number"
        min={min}
        max={max}
        step={step}
        value={Math.round(value * 100) / 100}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber))
            action(clamp(e.target.valueAsNumber, min, max))
        }}
      />
    </label>
  )

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (n: number) => void,
    step = 1,
    format: (n: number) => string = (n) => String(n),
  ) => (
    <label className="mb-slider">
      <span>{label}</span>
      <output>{format(value)}</output>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )

  const colorRow = (label: string, value: string, onChange: (c: string) => void, gradient = false) => (
    <div className="mb-colors">
      <p className="mb-section">{label}</p>
      <div className="mb-color-row" role="group" aria-label={label}>
        {swatch(`Custom ${label.toLowerCase()}`, value, onChange, undefined, gradient)}
        {[...new Set([...palette, "#ffffff", "#292524", ...docColors])]
          .filter((c) => (gradient ? safePaint(c, "") : validHex(c)))
          .slice(0, 11)
          .map((c) => (
            <button
              key={c}
              type="button"
              className="mb-color"
              style={{ background: c }}
              aria-label={`${label} ${c}`}
              title={c}
              aria-pressed={value.toLowerCase() === c.toLowerCase()}
              onClick={() => onChange(c)}
            />
          ))}
      </div>
    </div>
  )

  const textPin =
    pin &&
    !pin.image &&
    (!pin.kind || pin.kind === "text" || pin.kind === "sticky")

  const needle = query.trim().toLowerCase()
  const libraryShelf = shelf.filter((s) => !s.key.startsWith("theme:"))
  const categories = ["All", ...new Set(libraryShelf.map((s) => s.category))]
  const items = libraryShelf.filter(
    (s) =>
      (category === "All" || s.category === category) &&
      `${s.title} ${s.category}`.toLowerCase().includes(needle),
  )
  const uploads = brief.pins.filter(
    (p, i, all) =>
      p.image?.startsWith("data:") &&
      all.findIndex((v) => v.image === p.image) === i,
  )
  const pagePins = brief.pins.filter((p) => (p.page ?? 0) === page)
  const themePreview = themeTemplates.find((t) => t.id === selectedTheme)

  switch (tab) {
    case "library":
      return (
        <>
          <p className="mb-eyebrow">The reference shelf</p>
          <h3 className="mb-panel-title">Find your pieces.</h3>
          <Input
            type="search"
            aria-label="Search assets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets…"
            icon={Search}
          />
          {dropdown(
            "Shelf category",
            category,
            setCategory,
            categories.map((c) => [c, c] as const),
            "mt-2 mb-4",
          )}
          {items.length === 0 ? (
            <p className="mb-help">No pieces match.</p>
          ) : (
            <ul className="mb-tiles" aria-label="Reference pieces">
              {items.map((s) => (
                <li key={s.key}>
                  <button
                    type="button"
                    className="mb-tile"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-em-ref", s.key)
                      e.dataTransfer.effectAllowed = "copy"
                      const img = e.currentTarget.querySelector("img")
                      if (img && img.complete && img.naturalWidth > 0) {
                        const rect = img.getBoundingClientRect()
                        e.dataTransfer.setDragImage(
                          img,
                          Math.round(rect.width / 2),
                          Math.round(rect.height / 2),
                        )
                      }
                    }}
                    onClick={() =>
                      pin?.kind === "frame" && !pin.locked
                        ? fillFrame(pin.id, { key: s.key })
                        : onAddShelf(s.key, page)
                    }
                    aria-label={`Pin ${s.title} to page ${page + 1}`}
                  >
                    <Visual
                      src={s.image}
                      label={s.title}
                      className={cx("mb-tile-img em-product", s.cutout && "em-product--cutout")}
                    />
                    <span className="mb-tile-name">{s.title}</span>
                    <span className="mb-tile-cat">{s.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )

    case "inspiration":
      return (
        <>
          <div className="mb-eyebrow">Beyond the library</div>
          <div role="heading" aria-level={3} className="mb-panel-title">
            Find a little more inspiration.
          </div>
          <div className="mb-help mb-4">
            Search online, or pin a reference image using its HTTPS link.
          </div>
          <div className="space-y-3">
            <Input
              aria-label="Inspiration search"
              value={web}
              onChange={(e) => setWeb(e.target.value)}
              placeholder="e.g. candlelit garden wedding"
              onKeyDown={(e) => {
                if (e.key === "Enter" && web.trim()) {
                  e.preventDefault()
                  window.open(
                    `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(web.trim())}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              icon={Search}
              className="w-full"
              disabled={!web.trim()}
              onClick={() =>
                window.open(
                  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(web.trim())}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Search Google
            </Button>
            <div className="border-t border-line pt-4 space-y-3">
              <Input
                aria-label="Reference title"
                value={link.title}
                onChange={(e) => setLink({ ...link, title: e.target.value })}
                placeholder="Reference title"
                maxLength={80}
              />
              <Input
                aria-label="HTTPS image link"
                type="url"
                inputMode="url"
                value={link.url}
                onChange={(e) => {
                  setLink({ ...link, url: e.target.value })
                  setLinkError("")
                }}
                placeholder="https://… image link"
                aria-invalid={!!linkError || undefined}
                aria-describedby={linkError ? "mb-link-error" : undefined}
              />
              <FieldError id="mb-link-error" text={linkError} />
              <Button
                type="button"
                variant="outline"
                icon={Link2}
                className="w-full"
                disabled={readOnly || !link.url.trim()}
                onClick={() => {
                  const url = link.url.trim()
                  if (!/^https:\/\//i.test(url) || !safeImage(url)) {
                    setLinkError("Enter a full HTTPS image link, starting with https://.")
                    return
                  }
                  add({
                    title: link.title.trim() || "Image reference",
                    kind: "image",
                    image: url,
                    source: url,
                    width: 220,
                    height: 197,
                  })
                  setLink({ title: "", url: "" })
                  setLinkError("")
                }}
              >
                Pin reference
              </Button>
            </div>
          </div>
        </>
      )

    case "templates":
      return (
        <>
          {themePreview ? (
            <>
              <Button
                type="button"
                variant="ghost"
                icon={ChevronLeft}
                onClick={() => setSelectedTheme(null)}
                className="mb-3 px-0"
              >
                All templates
              </Button>
              <div role="heading" aria-level={3} className="mb-1 text-base font-semibold">
                {themePreview.name}
              </div>
              <div className="mb-4 text-xs text-muted-foreground">{themePreview.category}</div>
              <Button
                type="button"
                variant="outline"
                disabled={readOnly}
                className="mb-4 w-full"
                onClick={() =>
                  applyTheme(themePreview, themePreview.boardPages.map((_, i) => i))
                }
              >
                Apply all pages
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {themePreview.boardPages.map((pg, index) => (
                  <Button
                    type="button"
                    variant="ghost"
                    key={index}
                    disabled={readOnly}
                    className="mb-theme-page"
                    onClick={() => applyTheme(themePreview, [index])}
                    aria-label={`Add ${pg.title} page from ${themePreview.name}`}
                  >
                    <Board
                      pins={themePreview.pins}
                      page={index}
                      theme={themePreview.name}
                      background={pg.background}
                      compact
                      label={`${pg.title} preview`}
                      className="mb-template-board"
                    />
                    <span className="text-xs">{pg.title}</span>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3 className="mb-panel-title">Templates</h3>
              <ul className="mb-templates">
                {TEMPLATES.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="mb-template"
                      onClick={() => applyTemplate(t.id)}
                    >
                      <Board
                        pins={t
                          .build(palette)
                          .map((d, i) => ({ rotation: 0, ...d, id: `${t.id}-${i}`, page: 0 }))}
                        page={0}
                        theme={brief.theme}
                        background={NEW_PAPER}
                        compact
                        label={`${t.name} preview`}
                        className="mb-template-board"
                      />
                      <span>{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div role="heading" aria-level={3} className="mb-3 mt-6 text-base font-semibold">
                Themes
              </div>
              <div className="mb-tiles mb-theme-tiles">
                {themeTemplates.map((theme) => (
                  <Button
                    type="button"
                    variant="ghost"
                    key={theme.id}
                    className="mb-theme-card"
                    onClick={() => setSelectedTheme(theme.id)}
                    aria-label={`View ${theme.name} template pages`}
                  >
                    <Visual src={theme.image} label={theme.name} className="mb-tile-img" />
                    <span className="mb-tile-name">{theme.name}</span>
                  </Button>
                ))}
              </div>
            </>
          )}
        </>
      )

    case "elements":
      return (
        <>
          <h3 className="mb-panel-title">Elements</h3>
          <p className="mb-section">Shapes</p>
          <div className="mb-shapes">
            <button
              type="button"
              onClick={() =>
                add({
                  title: "Rectangle",
                  kind: "rect",
                  fill: "#d6c7b3",
                  height: 140,
                })
              }
            >
              <span className="mb-shape mb-shape--rect" aria-hidden />
              Rectangle
            </button>
            <button
              type="button"
              onClick={() =>
                add({
                  title: "Circle",
                  kind: "circle",
                  fill: "#7a8069",
                  width: 150,
                  height: 150,
                })
              }
            >
              <span className="mb-shape mb-shape--circle" aria-hidden />
              Circle
            </button>
            <button
              type="button"
              onClick={() =>
                add({
                  title: "Line",
                  kind: "line",
                  color: "#44403c",
                  width: 260,
                  height: 24,
                })
              }
            >
              <span className="mb-shape mb-shape--line" aria-hidden />
              Line
            </button>
            <button
              type="button"
              onClick={() =>
                add({
                  title: "Note",
                  text: "Your inspiration here",
                  kind: "sticky",
                  fill: "#fff1b8",
                  fontSize: 20,
                  width: 190,
                  height: 150,
                })
              }
            >
              <span className="mb-shape mb-shape--sticky" aria-hidden />
              Sticky note
            </button>
            {(
              [
                ["triangle", "Triangle", 180, 160],
                ["diamond", "Diamond", 160, 160],
                ["star", "Star", 170, 170],
                ["arrow", "Arrow", 220, 120],
              ] as const
            ).map(([kind, title, width, height]) => (
              <button
                key={kind}
                type="button"
                onClick={() => add({ title, kind, fill: palette[0], width, height })}
              >
                <span className={`mb-shape mb-shape--${kind}`} aria-hidden />
                {title}
              </button>
            ))}
          </div>
          <p className="mb-section">Frames</p>
          <div className="mb-shapes">
            <button
              type="button"
              onClick={() =>
                add({ title: "Photo frame", kind: "frame", width: 300, height: 220 })
              }
            >
              <span className="mb-shape mb-shape--frame" aria-hidden />
              Photo frame
            </button>
            <button
              type="button"
              onClick={() =>
                add({
                  title: "Round frame",
                  kind: "frame",
                  radius: 400,
                  width: 200,
                  height: 200,
                })
              }
            >
              <span className="mb-shape mb-shape--frame mb-shape--round" aria-hidden />
              Round frame
            </button>
          </div>
          <p className="mb-help">
            Elements are placed in the middle of page {page + 1}. Drag the corners to resize and
            the round handle to rotate.
          </p>
        </>
      )

    case "text":
      return (
        <>
          <h3 className="mb-panel-title">Text</h3>
          <Button
            type="button"
            className="w-full"
            onClick={() =>
              add({
                title: "Text",
                text: "Add a little bit of body text",
                kind: "text",
                fontSize: 18,
                width: 320,
                height: 60,
              })
            }
          >
            <Type size={15} aria-hidden /> Add a text box
          </Button>
          <p className="mb-section">Default text styles</p>
          <div className="mb-text-styles">
            <button
              type="button"
              className="mb-ts mb-ts--h"
              onClick={() =>
                add({
                  title: "Heading",
                  text: "Add a heading",
                  kind: "text",
                  fontSize: 44,
                  bold: true,
                  width: 440,
                  height: 80,
                })
              }
            >
              Add a heading
            </button>
            <button
              type="button"
              className="mb-ts mb-ts--s"
              onClick={() =>
                add({
                  title: "Subheading",
                  text: "Add a subheading",
                  kind: "text",
                  fontSize: 26,
                  bold: true,
                  width: 360,
                  height: 56,
                })
              }
            >
              Add a subheading
            </button>
            <button
              type="button"
              className="mb-ts mb-ts--b"
              onClick={() =>
                add({
                  title: "Text",
                  text: "Add a little bit of body text",
                  kind: "text",
                  fontSize: 18,
                  width: 320,
                  height: 60,
                })
              }
            >
              Add a little bit of body text
            </button>
          </div>
        </>
      )

    case "uploads":
      return (
        <>
          <h3 className="mb-panel-title">Uploads</h3>
          <Button
            type="button"
            className="w-full"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <CloudUpload size={15} aria-hidden />{" "}
            {uploading ? "Uploading…" : "Upload files"}
          </Button>
          <div
            className="mb-dropzone"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault()
                e.dataTransfer.dropEffect = "copy"
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (e.dataTransfer.files.length)
                void upload(Array.from(e.dataTransfer.files))
            }}
          >
            Drop images here, or straight onto a page.
            <span>PNG, JPEG or WebP · up to 8 at once · 15 MB each</span>
          </div>
          {uploads.length > 0 && (
            <>
              <p className="mb-section">On this board</p>
              <ul className="mb-tiles mb-tiles--plain">
                {uploads.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="mb-tile"
                      onClick={() => duplicate(p, page)}
                      aria-label={`Add ${p.title} to page ${page + 1}`}
                    >
                      <img src={p.image} alt="" className="mb-tile-img" />
                      <span className="mb-tile-name">{p.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )

    case "draw":
      return (
        <>
          <h3 className="mb-panel-title">Draw</h3>
          <Button
            type="button"
            variant={tool === "draw" ? "solid" : "outline"}
            className="w-full"
            aria-pressed={tool === "draw"}
            onClick={() => setTool(tool === "draw" ? "select" : "draw")}
          >
            <PenTool size={15} aria-hidden />{" "}
            {tool === "draw" ? "Stop drawing" : "Start drawing"}
          </Button>
          <p className="mb-section">Pen color</p>
          <div className="mb-pens" role="group" aria-label="Pen color">
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={penColor === c}
                style={{ background: c }}
                onClick={() => setPenColor(c)}
              />
            ))}
            {swatch("Custom pen color", penColor, setPenColor)}
          </div>
          <p className="mb-help">
            Draw anywhere on a page and release to place the stroke. Each stroke becomes its own
            element.
          </p>
        </>
      )

    case "layers":
      return (
        <>
          <h3 className="mb-panel-title">Edit</h3>
          {pin ? (
            <>
              <fieldset disabled={pin.locked} className="mb-fieldset">
                <p className="mb-section mb-section--first">Align to page</p>
                <div className="mb-align" role="group" aria-label="Align to page">
                  {iconButton(AlignStartVertical, "Align left", () => alignTo("left"))}
                  {iconButton(AlignCenterVertical, "Align centre", () => alignTo("center"))}
                  {iconButton(AlignEndVertical, "Align right", () => alignTo("right"))}
                  {iconButton(AlignStartHorizontal, "Align top", () => alignTo("top"))}
                  {iconButton(AlignCenterHorizontal, "Align middle", () => alignTo("middle"))}
                  {iconButton(AlignEndHorizontal, "Align bottom", () => alignTo("bottom"))}
                </div>
                <p className="mb-section">Arrange</p>
                <div className="mb-arrange">
                  <Button type="button" variant="outline" icon={ChevronsUp} onClick={() => stepLayer(1)}>
                    Forward
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    icon={ChevronsDown}
                    onClick={() => stepLayer(-1)}
                  >
                    Backward
                  </Button>
                  <Button type="button" variant="outline" icon={BringToFront} onClick={() => reorder(true)}>
                    To front
                  </Button>
                  <Button type="button" variant="outline" icon={SendToBack} onClick={() => reorder(false)}>
                    To back
                  </Button>
                </div>
                {pin.kind !== "line" &&
                  pin.kind !== "draw" &&
                  !pin.image &&
                  pin.kind !== "text" &&
                  colorRow(
                    pin.kind === "sticky" || (!pin.kind && !pin.image) ? "Note colour" : "Fill",
                    pin.fill ??
                      (pin.kind === "frame"
                        ? "#e7e5e4"
                        : pin.kind === "sticky" || !pin.kind
                          ? "#fff1b8"
                          : "#d6c7b3"),
                    (fill) => patchPin({ fill }),
                    !pin.kind || ["sticky", "rect", "circle", "frame"].includes(pin.kind),
                  )}
                {(textPin || pin.kind === "line" || pin.kind === "draw") &&
                  colorRow(
                    textPin ? "Text colour" : "Stroke colour",
                    pin.color ?? "#292524",
                    (color) => patchPin({ color }),
                  )}
                {textPin && (
                  <>
                    <p className="mb-section">Text spacing</p>
                    {slider(
                      "Letter spacing",
                      pin.letterSpacing ?? 0,
                      -100,
                      800,
                      (letterSpacing) => patchPin({ letterSpacing }),
                      10,
                    )}
                    {slider(
                      "Line height",
                      pin.lineHeight ?? 1.25,
                      0.8,
                      2.5,
                      (lineHeight) => patchPin({ lineHeight }),
                      0.05,
                      (n) => n.toFixed(2),
                    )}
                    <div className="mb-toggle-row">
                      <span>Uppercase</span>
                      <Toggle
                        checked={!!pin.uppercase}
                        onChange={(uppercase) => patchPin({ uppercase })}
                        label="Uppercase"
                      />
                    </div>
                  </>
                )}
                {pin.kind !== "draw" && (
                  <>
                    <p className="mb-section">Effects</p>
                    {pin.kind !== "line" &&
                      pin.kind !== "circle" &&
                      !["triangle", "diamond", "star", "arrow"].includes(pin.kind ?? "") &&
                      slider("Corner radius", pin.radius ?? 0, 0, 120, (radius) =>
                        patchPin({ radius }),
                      )}
                    {pin.kind !== "line" && (
                      <>
                        {slider("Border", pin.strokeWidth ?? 0, 0, 24, (strokeWidth) =>
                          patchPin({ strokeWidth }),
                        )}
                        {!!pin.strokeWidth &&
                          colorRow("Border colour", pin.stroke ?? "#292524", (stroke) =>
                            patchPin({ stroke }),
                          )}
                      </>
                    )}
                    {pin.kind === "line" &&
                      slider("Thickness", pin.strokeWidth ?? 3, 1, 24, (strokeWidth) =>
                        patchPin({ strokeWidth }),
                      )}
                    <div className="mb-toggle-row">
                      <span>Drop shadow</span>
                      <Toggle
                        checked={!!pin.shadow}
                        onChange={(shadow) => patchPin({ shadow })}
                        label="Drop shadow"
                      />
                    </div>
                  </>
                )}
                {pin.image && (
                  <>
                    <div className="mb-section-row">
                      <p className="mb-section">Adjust image</p>
                      {pin.adjust &&
                        iconButton(RotateCcw, "Reset adjustments", () =>
                          patchPin({ adjust: undefined }),
                        )}
                    </div>
                    {(
                      [
                        ["brightness", "Brightness", 0, 200, 100],
                        ["contrast", "Contrast", 0, 200, 100],
                        ["saturate", "Saturation", 0, 200, 100],
                        ["grayscale", "Black and white", 0, 100, 0],
                        ["blur", "Blur", 0, 20, 0],
                      ] as const
                    ).map(([k, lbl, min, max, base]) => (
                      <div key={k}>
                        {slider(lbl, pin.adjust?.[k] ?? base, min, max, (n) =>
                          patchPin({ adjust: { ...pin.adjust, [k]: n } }),
                        )}
                      </div>
                    ))}
                  </>
                )}
                <p className="mb-section">Size and position</p>
                <label className="mb-field">
                  Label
                  <input
                    className={fieldCls}
                    value={pin.title}
                    maxLength={120}
                    onChange={(e) => patchPin({ title: e.target.value })}
                  />
                </label>
                <div className="mb-pair">
                  {number("X (%)", pin.x, 0, 97, (x) => patchPin({ x }))}
                  {number("Y (%)", pin.y, 0, 95, (y) => patchPin({ y }))}
                  {number("Width", pin.width, 24, 800, (width) => patchPin({ width }))}
                  {number("Height", pinHeight(pin), 12, PAGE_H, (height) => patchPin({ height }))}
                  {number("Rotation", pin.rotation, -360, 360, (rotation) => patchPin({ rotation }))}
                  {number(
                    "Opacity",
                    pin.opacity ?? 1,
                    0.05,
                    1,
                    (opacity) => patchPin({ opacity }),
                    0.05,
                  )}
                </div>
                <div className="mb-field">
                  Move to page
                  {dropdown(
                    "Move to page",
                    String(pin.page ?? 0),
                    (value) => {
                      patchPin({ page: Number(value) })
                      goTo(Number(value))
                    },
                    pages.map((p, i) => [String(i), `${i + 1}. ${p.title}`] as const),
                  )}
                </div>
              </fieldset>
            </>
          ) : (
            <p className="mb-help">
              Select an element to align, style and arrange it. Drag snaps to the page and other
              elements (hold Alt to skip); Shift keeps proportions while resizing. Arrow keys move,
              [ and ] rotate, Ctrl/⌘ D duplicates and Ctrl/⌘ Z undoes.
            </p>
          )}
          <p className="mb-section">Layers on page {page + 1}</p>
          {pagePins.length === 0 ? (
            <p className="mb-help">This page has no elements yet.</p>
          ) : (
            <ul className="mb-layers">
              {pagePins
                .slice()
                .reverse()
                .map((p) => (
                  <li key={p.id} aria-current={selected === p.id || undefined}>
                    <button
                      type="button"
                      className="mb-layer-name"
                      aria-pressed={selected === p.id}
                      onClick={() => select(p.id)}
                    >
                      {p.title}
                    </button>
                    <button
                      type="button"
                      aria-label={`${p.locked ? "Unlock" : "Lock"} ${p.title}`}
                      title={p.locked ? "Unlock" : "Lock"}
                      onClick={() =>
                        setPins(
                          brief.pins.map((v) => (v.id === p.id ? { ...v, locked: !v.locked } : v)),
                        )
                      }
                    >
                      {p.locked ? (
                        <Lock size={14} aria-hidden />
                      ) : (
                        <LockOpen size={14} aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`${p.hidden ? "Show" : "Hide"} ${p.title}`}
                      title={p.hidden ? "Show" : "Hide"}
                      onClick={() =>
                        setPins(
                          brief.pins.map((v) => (v.id === p.id ? { ...v, hidden: !v.hidden } : v)),
                        )
                      }
                    >
                      {p.hidden ? (
                        <EyeOff size={14} aria-hidden />
                      ) : (
                        <Eye size={14} aria-hidden />
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )

    default:
      return null
  }
}

export default CanvasSidebarPanels

