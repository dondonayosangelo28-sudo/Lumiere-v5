import { useNotify } from '../../components/Notifications'
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ChevronsDown,
  ChevronsUp,
  LayoutTemplate,
  Compass,
  Link2,
  RotateCcw,
  SlidersHorizontal,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  BringToFront,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CloudUpload,
  Copy,
  Download,
  Droplet,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  LayoutGrid,
  PanelsTopLeft,
  Maximize2,
  Hand,
  Images,
  Italic,
  Layers,
  Lock,
  LockOpen,
  Minus,
  PenTool,
  Plus,
  Redo2,
  Search,
  SendToBack,
  Shapes,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react"

import { Badge, Button, IconButton, Input, Toggle, cx } from "../../components/ui"
import Dropdown from "../../components/Dropdown"
import ColourPicker from "../../components/ColourPicker"
import { safePaint, validHex } from "../../components/colourValues"
import { fieldCls, ghostBtn } from "../../components/AdminKit"
import Board, { PAGE_H, pinHeight } from "./Board"
import BoardSlideshow from "./BoardSlideshow"
import OverlayLayer from "../../components/OverlayLayer"
import { themes, safeImage, type Brief, type Pin } from "./model"
import { themeTemplate, insertThemePages } from "./theme-templates"
import { FieldError, Visual, themeByName } from "./shared"
import "./mood-board.css"

const LEGACY_PAPER = "#ebe8e1"
const NEW_PAPER = "#ffffff"
const PEN_COLORS = [
  "#292524",
  "#7a8069",
  "#e11d48",
  "#f59e0b",
  "#16a34a",
  "#2563eb",
  "#ffffff",
]
const FONTS = [
  ["Arial, sans-serif", "Sans serif"],
  ["Georgia, serif", "Serif"],
  ["monospace", "Monospace"],
  ["cursive", "Script"],
] as const
type Draft = Omit<Pin, "id" | "rotation" | "page"> & { rotation?: number }
const frame = (x: number, y: number, width: number, height: number, rotation = 0): Draft => ({
  title: "Photo frame",
  kind: "frame",
  x,
  y,
  width,
  height,
  rotation,
})
const words = (title: string, text: string, x: number, y: number, width: number, height: number, extra: Partial<Pin> = {}): Draft => ({
  title,
  text,
  kind: "text",
  x,
  y,
  width,
  height,
  fontSize: 18,
  ...extra,
})
/** Starter layouts. Positions are % of the page; sizes use the 800 x 450 logical page. */
const TEMPLATES: { id: string; name: string; build: (palette: readonly string[]) => Draft[] }[] = [
  {
    id: "hero",
    name: "Editorial hero",
    build: (c) => [
      frame(4, 8, 420, 420),
      words("Heading", "Your event title", 60, 14, 300, 90, { fontSize: 40, bold: true }),
      words("Text", "A few words about the mood, the guests and the moment.", 60, 38, 290, 100),
      ...c.slice(0, 3).map((fill, i): Draft => ({ title: "Swatch", kind: "circle", fill, x: 60 + i * 8, y: 70, width: 52, height: 52 })),
    ],
  },
  {
    id: "grid",
    name: "Grid of four",
    build: () => [
      words("Heading", "Inspiration", 6, 5, 500, 60, { fontSize: 32, bold: true }),
      frame(6, 20, 344, 175),
      frame(51, 20, 344, 175),
      frame(6, 58, 344, 175),
      frame(51, 58, 344, 175),
    ],
  },
  {
    id: "palette",
    name: "Colour palette",
    build: (c) => [
      words("Heading", "Colour palette", 6, 8, 500, 60, { fontSize: 32, bold: true }),
      ...c.flatMap((fill, i): Draft[] => [
        { title: "Swatch", kind: "rect", fill, radius: 12, x: 6 + i * 30, y: 26, width: 216, height: 250 },
        words("Colour code", fill.toUpperCase(), 6 + i * 30, 80, 216, 40, { fontSize: 16, letterSpacing: 120 }),
      ]),
    ],
  },
  {
    id: "collage",
    name: "Collage",
    build: () => [
      frame(6, 10, 300, 220, -4),
      frame(40, 16, 300, 220, 3),
      frame(22, 50, 280, 210, -1),
      { title: "Note", text: "What should guests feel?", kind: "sticky", fill: "#fff1b8", fontSize: 18, x: 72, y: 58, width: 170, height: 130, rotation: 2 },
    ],
  },
  {
    id: "quote",
    name: "Quote",
    build: (c) => [
      { title: "Background", kind: "rect", fill: c[1] ?? "#f0e7db", x: 0, y: 0, width: 800, height: PAGE_H },
      words("Quote", "\u201cA feeling, not a floor plan.\u201d", 10, 30, 640, 150, { fontSize: 44, italic: true, fontFamily: "Georgia, serif", align: "center" }),
      words("Caption", "The client brief", 10, 70, 640, 40, { fontSize: 14, align: "center", uppercase: true, letterSpacing: 200 }),
    ],
  },
]

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n))

type Snapshot = Pick<Brief, "pins" | "boardPages">
type Tab =
  | "library"
  | "templates"
  | "elements"
  | "text"
  | "inspiration"
  | "uploads"
  | "draw"
  | "layers"
export type ShelfItem = {
  cutout?: boolean
  key: string
  title: string
  image: string
  category: string
}
type Props = {
  onPresent?: () => void
  fullScreen?: boolean
  onExitFullScreen?: () => void
  brief: Brief
  update: (changes: Partial<Brief>) => void
  readOnly: boolean
  selected: string | null
  onSelect: (id: string | null) => void
  onDropItem: (key: string, x: number, y: number, page: number) => void
  shelf: ShelfItem[]
  onAddShelf: (key: string, page: number) => void
  themeName?: string
  onThemePins?: (page: number) => void
  /** Overrides the pitch theme palette, e.g. for standalone theme boards. */
  palette?: readonly string[]
}

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "library", label: "Library", icon: Images },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "text", label: "Text", icon: Type },
  { id: "inspiration", label: "Inspiration", icon: Compass },
  { id: "uploads", label: "Uploads", icon: CloudUpload },
  { id: "draw", label: "Draw", icon: PenTool },
  { id: "layers", label: "Edit", icon: SlidersHorizontal },
]

/** Canva-style embedded editor. Every change uses the pitch's update/save pipeline. */
export default function MoodBoardCanvas({
  onPresent,
  fullScreen = false,
  onExitFullScreen,
  brief,
  update,
  readOnly,
  selected,
  onSelect,
  onDropItem,
  shelf,
  onAddShelf,
  palette: paletteOverride,
}: Props) {
  const latest = useRef({ brief, readOnly, update })
  latest.current = { brief, readOnly, update }
  const pageCount = Math.max(
    brief.boardPages?.length ?? 1,
    ...brief.pins.map((p) => (p.page ?? 0) + 1),
  )
  const pages = Array.from(
    { length: pageCount },
    (_, i) =>
      brief.boardPages?.[i] ?? {
        title: `Page ${i + 1}`,
        background: i === 0 ? LEGACY_PAPER : NEW_PAPER,
      },
  )
  const [page, setPage] = useState(0)
  const [zoom, setZoomState] = useState(0.8)
  const [zoomMode, setZoomMode] = useState<"fit" | "fill" | null>("fit")
  const zoomMenu = useRef<HTMLDetailsElement>(null)
  const [tool, setTool] = useState<"select" | "pan" | "draw">("select")
  const [tab, setTab] = useState<Tab | null>(null)
  const [showPages, setShowPages] = useState(false)
  const [pageGrid, setPageGrid] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const full = fullScreen
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const themeTemplates = useMemo(() => themes.map(themeTemplate), [])
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const themePreview = themeTemplates.find((t) => t.id === selectedTheme)
  const [web, setWeb] = useState("")
  const [link, setLink] = useState({ title: "", url: "" })
  const [linkError, setLinkError] = useState("")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const notify = useNotify()
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deletePage, setDeletePage] = useState<number | null>(null)
  const [, setHistoryTick] = useState(0)
  const root = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const capture = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const clipboard = useRef<Pin | null>(null)
  const autoFit = useRef(true)
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null,
  )
  const history = useRef<{
    past: Snapshot[]
    future: Snapshot[]
    last: Snapshot
    grouping: boolean
    recorded: boolean
    skip: boolean
  }>({
    past: [],
    future: [],
    last: { pins: brief.pins, boardPages: brief.boardPages },
    grouping: false,
    recorded: false,
    skip: false,
  })
  const pin = brief.pins.find((p) => p.id === selected)
  const palette = paletteOverride?.length ? paletteOverride : themeByName(brief.theme)?.palette ?? ["#d6c7b3", "#f0e7db", "#7a8069"]

  useEffect(() => {
    const h = history.current,
      next = { pins: brief.pins, boardPages: brief.boardPages }
    if (next.pins === h.last.pins && next.boardPages === h.last.boardPages)
      return
    if (!h.skip) {
      if (!h.grouping || !h.recorded) h.past = [...h.past.slice(-39), h.last]
      h.recorded = true
      h.future = []
    }
    h.skip = false
    h.last = next
    setHistoryTick((n) => n + 1)
  }, [brief.pins, brief.boardPages])
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1))
  }, [pageCount])

  const setZoom = (next: number | ((z: number) => number)) => {
    autoFit.current = false
    setZoomMode(null)
    setZoomState(next)
  }
  const fit = () => {
    const v = viewport.current
    if (!v || !v.clientWidth || !v.clientHeight) return
    autoFit.current = true
    setZoomMode("fit")
    setZoomState(
      clamp(
        Math.min((v.clientWidth - 96) / 800, (v.clientHeight - 144) / PAGE_H),
        0.1,
        3,
      ),
    )
  }
  const fill = () => {
    const v = viewport.current
    if (!v) return
    setZoom(clamp(Math.max((v.clientWidth - 96) / 800, (v.clientHeight - 144) / PAGE_H), 0.1, 3))
    setZoomMode("fill")
  }
  useEffect(() => {
    const v = viewport.current
    if (!v) return
    const observer = new ResizeObserver(() => {
      if (autoFit.current) fit()
    })
    observer.observe(v)
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setZoom((z) => clamp(z - event.deltaY * 0.002, 0.1, 3))
    }
    v.addEventListener("wheel", wheel, { passive: false })
    return () => {
      observer.disconnect()
      v.removeEventListener("wheel", wheel)
    }
  }, [full])
  const wasFull = useRef(false)
  useEffect(() => {
    if (!full && wasFull.current) {
      root.current?.querySelector<HTMLElement>("[data-present-board]")?.focus({ preventScroll: true })
    }
    wasFull.current = full
  }, [full])

  const commit = (patch: Partial<Brief>) => {
    if (!latest.current.readOnly) latest.current.update(patch)
  }
  const setPins = (pins: Pin[]) => commit({ pins })
  const select = (id: string | null) => {
    onSelect(id)
    const target = id ? brief.pins.find((p) => p.id === id) : undefined
    if (target) setPage(target.page ?? 0)
  }
  const patchPin = (changes: Partial<Pin>) => {
    if (
      pin &&
      (!pin.locked ||
        Object.keys(changes).every((k) => k === "locked" || k === "hidden"))
    )
      setPins(
        brief.pins.map((p) => (p.id === pin.id ? { ...p, ...changes } : p)),
      )
  }
  const travel = (direction: "past" | "future") => {
    if (readOnly) return
    const h = history.current,
      source = h[direction],
      next = source[source.length - 1]
    if (!next) return
    const other = direction === "past" ? "future" : "past"
    h[other].push(h.last)
    h[direction] = source.slice(0, -1)
    h.skip = true
    h.grouping = false
    h.recorded = false
    commit(next)
    onSelect(null)
    setHistoryTick((n) => n + 1)
  }
  const add = (changes: Partial<Pin>) => {
    const width = changes.width ?? 240,
      height = changes.height ?? 110
    const p: Pin = {
      id: crypto.randomUUID(),
      title: "New element",
      x: Math.round(clamp(50 - width / 16, 0, 97)),
      y: Math.round(clamp(50 - height / 10, 0, 95)),
      width,
      height,
      rotation: 0,
      page,
      ...changes,
    }
    setPins([...brief.pins, p])
    onSelect(p.id)
    setTool("select")
  }
  const duplicate = (p: Pin, targetPage = p.page ?? 0) => {
    const next = {
      ...p,
      id: crypto.randomUUID(),
      page: targetPage,
      x: Math.min(p.x + 3, 90),
      y: Math.min(p.y + 3, 90),
      locked: false,
      hidden: false,
    }
    setPins([...brief.pins, next])
    onSelect(next.id)
  }
  const remove = () => {
    if (pin && !pin.locked) {
      setPins(brief.pins.filter((p) => p.id !== pin.id))
      onSelect(null)
    }
  }
  const reorder = (front: boolean) => {
    if (!pin || pin.locked) return
    const rest = brief.pins.filter((p) => p.id !== pin.id)
    setPins(front ? [...rest, pin] : [pin, ...rest])
  }

  const stepLayer = (direction: 1 | -1) => {
    if (!pin || pin.locked) return
    const list = [...brief.pins],
      from = list.findIndex((p) => p.id === pin.id)
    let to = from + direction
    while (to >= 0 && to < list.length && (list[to].page ?? 0) !== (pin.page ?? 0)) to += direction
    if (to < 0 || to >= list.length) return
    ;[list[from], list[to]] = [list[to], list[from]]
    setPins(list)
  }
  const alignTo = (where: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (!pin || pin.locked) return
    const w = clamp(pin.width / 8, 3, 100),
      h = (pinHeight(pin) / PAGE_H) * 100
    const next = {
      left: { x: 0 },
      center: { x: (100 - w) / 2 },
      right: { x: 100 - w },
      top: { y: 0 },
      middle: { y: Math.max(0, (100 - h) / 2) },
      bottom: { y: Math.max(0, 100 - h) },
    }[where]
    patchPin(next)
  }
  const fillFrame = (frameId: string, item: { key?: string; files?: File[] }) => {
    if (readOnly) return
    if (item.files) return void upload(item.files, undefined, undefined, page, frameId)
    const ref = shelf.find((s) => s.key === item.key)
    if (!ref) return
    setPins(
      brief.pins.map((p) =>
        p.id === frameId ? { ...p, kind: "image", image: ref.image, title: ref.title, source: "" } : p,
      ),
    )
    onSelect(frameId)
  }
  const applyTemplate = (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id)
    if (!template || readOnly) return
    const pageIsEmpty = !brief.pins.some((p) => (p.page ?? 0) === page)
    const target = pageIsEmpty || pages.length >= 12 ? page : page + 1
    const made = template.build(palette).map((d) => ({ rotation: 0, ...d, id: crypto.randomUUID(), page: target }))
    if (target === page) {
      setPins([...brief.pins, ...made])
    } else {
      commit({
        boardPages: [
          ...pages.slice(0, target),
          { title: template.name, background: NEW_PAPER },
          ...pages.slice(target),
        ],
        pins: [
          ...brief.pins.map((p) => ((p.page ?? 0) >= target ? { ...p, page: (p.page ?? 0) + 1 } : p)),
          ...made,
        ],
      })
      requestAnimationFrame(() => goTo(target))
    }
    onSelect(null)
    notify({ tone: "success", text: target === page
        ? `${template.name} added to page ${page + 1}. Drop images onto the frames.`
        : `${template.name} added on a new page ${target + 1}, so page ${page + 1} stays as it is.`,
    })
  }

  const applyTheme = (template: ReturnType<typeof themeTemplate>, selectedPages: number[]) => {
    if (latest.current.readOnly) return
    try {
      const { firstPage, ...changes } = insertThemePages(latest.current.brief, page, template, selectedPages)
      commit(changes)
      onSelect(null)
      requestAnimationFrame(() => goTo(firstPage))
      notify({ tone: "success", text: selectedPages.length === 1 ? "Theme page added." : "Theme pages added." })
    } catch (error) {
      notify({ tone: "error", text: error instanceof Error ? error.message : "Theme pages could not be added." })
    }
  }

  const upload = async (
    files: File[],
    x?: number,
    y?: number,
    targetPage = page,
    frameId?: string,
  ) => {
    if (latest.current.readOnly || uploading) return
    setUploading(true)
    const additions: Pin[] = [],
      errors: string[] = []
    try {
      for (const file of files.slice(0, 8)) {
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
          errors.push(`${file.name}: use PNG, JPEG or WebP.`)
          continue
        }
        if (file.size > 15 * 1024 * 1024) {
          errors.push(`${file.name}: maximum original size is 15 MB.`)
          continue
        }
        try {
          const bitmap = await createImageBitmap(file)
          const scale = Math.min(
            1,
            1200 / Math.max(bitmap.width, bitmap.height),
          )
          const canvas = document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(bitmap.width * scale))
          canvas.height = Math.max(1, Math.round(bitmap.height * scale))
          const context = canvas.getContext("2d")
          if (!context) throw new Error("Image processing is unavailable.")
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          bitmap.close()
          let image = canvas.toDataURL("image/webp", 0.78)
          if (image.length > 220_000) {
            const smaller = document.createElement("canvas")
            smaller.width = Math.max(1, Math.round(canvas.width / 2))
            smaller.height = Math.max(1, Math.round(canvas.height / 2))
            smaller
              .getContext("2d")!
              .drawImage(canvas, 0, 0, smaller.width, smaller.height)
            image = smaller.toDataURL("image/webp", 0.65)
          }
          if (image.length > 220_000) {
            errors.push(
              `${file.name}: image is too complex; try a smaller copy.`,
            )
            continue
          }
          const used = [...latest.current.brief.pins, ...additions].reduce(
            (n, p) => n + (p.image?.startsWith("data:") ? p.image.length : 0),
            0,
          )
          if (used + image.length > 1_800_000) {
            errors.push(
              "This board's upload budget is full. Remove an upload or use an HTTPS image link.",
            )
            break
          }
          const width = 240,
            height = Math.min(350, (240 * canvas.height) / canvas.width)
          const bx = x ?? 50 - width / 16,
            by = y ?? 50 - height / 10
          additions.push({
            id: crypto.randomUUID(),
            title: file.name.replace(/\.[^.]+$/, ""),
            image,
            source: file.name,
            kind: "image",
            page: targetPage,
            x: clamp(bx + additions.length * 3, 0, 70),
            y: clamp(by + additions.length * 3, 0, 60),
            width,
            height,
            rotation: 0,
          })
        } catch {
          errors.push(`${file.name}: could not read this image.`)
        }
      }
      if (files.length > 8) errors.push("Choose up to eight images per upload.")
      if (additions.length && !latest.current.readOnly) {
        let current = latest.current.brief.pins,
          added = additions
        if (frameId && current.some((p) => p.id === frameId)) {
          const [first, ...rest] = additions
          current = current.map((p) =>
            p.id === frameId
              ? { ...p, kind: "image" as const, image: first.image, title: first.title, source: first.source }
              : p,
          )
          added = rest
        }
        latest.current.update({ pins: [...current, ...added] })
        onSelect(frameId ?? additions[additions.length - 1].id)
      }
      if (errors.length) {
        notify({ tone: "error", text: errors.join(" ") })
      } else if (additions.length && !latest.current.readOnly) {
        notify({ tone: "success", text: additions.length === 1 ? "Image uploaded." : `${additions.length} images uploaded.` })
      }
    } catch {
      notify({ tone: "error", text: "Images could not be uploaded. Please try again." })
    } finally {
      setUploading(false)
    }
  }
  const exportPNG = async () => {
    if (!capture.current || exporting) return
    setExporting(true)
    try {
      const { toPng } = await import("html-to-image")
      const data = await toPng(capture.current, {
        pixelRatio: 2,
        cacheBust: false,
        backgroundColor: LEGACY_PAPER,
      })
      const a = document.createElement("a")
      a.href = data
      a.download = `${(brief.title || "mood-board").replace(/[^a-z0-9-]/gi, "-")}.png`
      a.click()
      notify({ tone: "success", text: "PNG exported." })
    } catch {
      notify({ tone: "error", text: "PNG export failed. An external image may block export; upload a local copy of that image and try again." })
    } finally {
      setExporting(false)
    }
  }

  const changePage = (index: number, changes: Partial<typeof pages[number]>) =>
    commit({
      boardPages: pages.map((p, i) => (i === index ? { ...p, ...changes } : p)),
    })
  const goTo = (index: number) => {
    setPage(index)
    setDeletePage(null)
    pageRefs.current[index]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    })
  }
  const addPage = (after = pages.length - 1) => {
    if (pages.length >= 12) return
    const at = after + 1
    commit({
      boardPages: [
        ...pages.slice(0, at),
        { title: `Page ${pages.length + 1}`, background: NEW_PAPER },
        ...pages.slice(at),
      ],
      pins: brief.pins.map((p) =>
        (p.page ?? 0) >= at ? { ...p, page: (p.page ?? 0) + 1 } : p,
      ),
    })
    setPage(at)
    if (!pageGrid) requestAnimationFrame(() => goTo(at))
  }
  const duplicatePage = (index: number) => {
    if (pages.length >= 12) return
    const at = index + 1
    commit({
      boardPages: [
        ...pages.slice(0, at),
        { ...pages[index], title: `${pages[index].title} copy` },
        ...pages.slice(at),
      ],
      pins: [
        ...brief.pins.map((p) =>
          (p.page ?? 0) >= at ? { ...p, page: (p.page ?? 0) + 1 } : p,
        ),
        ...brief.pins
          .filter((p) => (p.page ?? 0) === index)
          .map((p) => ({ ...p, id: crypto.randomUUID(), page: at })),
      ],
    })
    requestAnimationFrame(() => goTo(at))
  }
  const dropPage = (index: number) => {
    commit({
      boardPages: pages.filter((_, i) => i !== index),
      pins: brief.pins
        .filter((p) => (p.page ?? 0) !== index)
        .map((p) => ({
          ...p,
          page: (p.page ?? 0) > index ? (p.page ?? 0) - 1 : p.page,
        })),
    })
    setPage(Math.max(0, index - 1))
    setDeletePage(null)
    onSelect(null)
  }
  const movePage = (index: number, direction: number) => {
    const to = index + direction
    if (to < 0 || to >= pages.length) return
    const next = [...pages]
    ;[next[index], next[to]] = [next[to], next[index]]
    commit({
      boardPages: next,
      pins: brief.pins.map((p) => ({
        ...p,
        page:
          (p.page ?? 0) === index ? to : (p.page ?? 0) === to ? index : p.page,
      })),
    })
    requestAnimationFrame(() => goTo(to))
  }
  const trackPage = () => {
    const v = viewport.current
    if (!v) return
    const r = v.getBoundingClientRect(),
      mid = r.top + r.height / 2
    let best = page,
      distance = Infinity
    pageRefs.current.forEach((el, i) => {
      if (!el) return
      const b = el.getBoundingClientRect()
      const d = Math.abs(b.top + b.height / 2 - mid)
      if (d < distance) {
        distance = d
        best = i
      }
    })
    if (best !== page) setPage(best)
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
  const docColors = [
    ...new Set(
      brief.pins
        .flatMap((p) => [p.fill, p.color, p.stroke])
        .filter((c): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c)),
    ),
  ]
  const colorRow = (label: string, value: string, onChange: (c: string) => void, gradient = false) => (
    <div className="mb-colors">
      <p className="mb-section">{label}</p>
      <div className="mb-color-row" role="group" aria-label={label}>
        {swatch(`Custom ${label.toLowerCase()}`, value, onChange, undefined, gradient)}
        {[...new Set([...palette, "#ffffff", "#292524", ...docColors])]
          .filter((c) => gradient ? safePaint(c, "") : validHex(c))
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
            {dropdown(
              "Font",
              pin.fontFamily ?? "Arial, sans-serif",
              (fontFamily) => patchPin({ fontFamily }),
              FONTS,
              "mb-compact w-[132px]",
            )}
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
                aria-label="Font size"
                min={8}
                max={144}
                value={pin.fontSize ?? 22}
                onChange={(e) => {
                  if (Number.isFinite(e.target.valueAsNumber))
                    patchPin({
                      fontSize: clamp(e.target.valueAsNumber, 8, 144),
                    })
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
            {swatch("Text color", pin.color ?? "#292524", (color) =>
              patchPin({ color }),
            )}
            {iconButton(Bold, "Bold", () => patchPin({ bold: !pin.bold }), {
              active: pin.bold,
            })}
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
            // SVG polygons use a fill attribute, which cannot take a CSS gradient.
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
          pages[page]?.background ?? LEGACY_PAPER,
          (background) => changePage(page, { background }),
          "Background",
          true,
        )}
      </>
    )

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

  const panels: Record<Tab, ReactNode> = {
    library: (
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
    ),
    inspiration: (
      <>
        <div className="mb-eyebrow">Beyond the library</div>
        <div role="heading" aria-level={3} className="mb-panel-title">Find a little more inspiration.</div>
        <div className="mb-help mb-4">Search online, or pin a reference image using its HTTPS link.</div>
        <div className="space-y-3">
          <Input aria-label="Inspiration search" value={web} onChange={(e) => setWeb(e.target.value)} placeholder="e.g. candlelit garden wedding" onKeyDown={(e) => { if (e.key === "Enter" && web.trim()) { e.preventDefault(); window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(web.trim())}`, "_blank", "noopener,noreferrer") } }} />
          <Button type="button" variant="outline" icon={Search} className="w-full" disabled={!web.trim()} onClick={() => window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(web.trim())}`, "_blank", "noopener,noreferrer")}>Search Google</Button>
          <div className="border-t border-line pt-4 space-y-3">
            <Input aria-label="Reference title" value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} placeholder="Reference title" maxLength={80} />
            <Input aria-label="HTTPS image link" type="url" inputMode="url" value={link.url} onChange={(e) => { setLink({ ...link, url: e.target.value }); setLinkError("") }} placeholder="https://… image link" aria-invalid={!!linkError || undefined} aria-describedby={linkError ? "mb-link-error" : undefined} />
            <FieldError id="mb-link-error" text={linkError} />
            <Button type="button" variant="outline" icon={Link2} className="w-full" disabled={readOnly || !link.url.trim()} onClick={() => {
              const url = link.url.trim()
              if (!/^https:\/\//i.test(url) || !safeImage(url)) {
                setLinkError("Enter a full HTTPS image link, starting with https://.")
                return
              }
              add({ title: link.title.trim() || "Image reference", kind: "image", image: url, source: url, width: 220, height: 197 })
              setLink({ title: "", url: "" })
              setLinkError("")
            }}>Pin reference</Button>
          </div>
        </div>
      </>
    ),
    templates: (
      <>
        {themePreview ? (
          <>
            <Button type="button" variant="ghost" icon={ChevronLeft} onClick={() => setSelectedTheme(null)} className="mb-3 px-0">All templates</Button>
            <div role="heading" aria-level={3} className="mb-1 text-base font-semibold">{themePreview.name}</div>
            <div className="mb-4 text-xs text-muted-foreground">{themePreview.category}</div>
            <Button type="button" variant="outline" disabled={readOnly} className="mb-4 w-full" onClick={() => applyTheme(themePreview, themePreview.boardPages.map((_, i) => i))}>Apply all pages</Button>
            <div className="grid grid-cols-2 gap-2">
              {themePreview.boardPages.map((pg, index) => (
                <Button type="button" variant="ghost" key={index} disabled={readOnly} className="mb-theme-page" onClick={() => applyTheme(themePreview, [index])} aria-label={`Add ${pg.title} page from ${themePreview.name}`}>
                  <Board pins={themePreview.pins} page={index} theme={themePreview.name} background={pg.background} compact label={`${pg.title} preview`} className="mb-template-board" />
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
              <button type="button" className="mb-template" onClick={() => applyTemplate(t.id)}>
                <Board
                  pins={t.build(palette).map((d, i) => ({ rotation: 0, ...d, id: `${t.id}-${i}`, page: 0 }))}
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
        <div role="heading" aria-level={3} className="mb-3 mt-6 text-base font-semibold">Themes</div>
        <div className="mb-tiles mb-theme-tiles">
          {themeTemplates.map((theme) => (
            <Button type="button" variant="ghost" key={theme.id} className="mb-theme-card" onClick={() => setSelectedTheme(theme.id)} aria-label={`View ${theme.name} template pages`}>
              <Visual src={theme.image} label={theme.name} className="mb-tile-img" />
              <span className="mb-tile-name">{theme.name}</span>
            </Button>
          ))}
        </div>
          </>
        )}
      </>
    ),
    elements: (
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
          <button type="button" onClick={() => add({ title: "Photo frame", kind: "frame", width: 300, height: 220 })}>
            <span className="mb-shape mb-shape--frame" aria-hidden />
            Photo frame
          </button>
          <button
            type="button"
            onClick={() => add({ title: "Round frame", kind: "frame", radius: 400, width: 200, height: 200 })}
          >
            <span className="mb-shape mb-shape--frame mb-shape--round" aria-hidden />
            Round frame
          </button>
        </div>
        <p className="mb-help">
          Elements are placed in the middle of page {page + 1}. Drag the corners
          to resize and the round handle to rotate.
        </p>
      </>
    ),
    text: (
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
    ),
    uploads: (
      <>
        <h3 className="mb-panel-title">Uploads</h3>
        <Button
          type="button"
          className="w-full"
          disabled={uploading}
          onClick={() => input.current?.click()}
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
    ),
    draw: (
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
          Draw anywhere on a page and release to place the stroke. Each stroke
          becomes its own element.
        </p>
      </>
    ),
    layers: (
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
                <Button type="button" variant="outline" icon={ChevronsDown} onClick={() => stepLayer(-1)}>
                  Backward
                </Button>
                <Button type="button" variant="outline" icon={BringToFront} onClick={() => reorder(true)}>
                  To front
                </Button>
                <Button type="button" variant="outline" icon={SendToBack} onClick={() => reorder(false)}>
                  To back
                </Button>
              </div>
              {pin.kind !== "line" && pin.kind !== "draw" && !pin.image && pin.kind !== "text" &&
                colorRow(
                  pin.kind === "sticky" || (!pin.kind && !pin.image) ? "Note colour" : "Fill",
                  pin.fill ?? (pin.kind === "frame" ? "#e7e5e4" : pin.kind === "sticky" || !pin.kind ? "#fff1b8" : "#d6c7b3"),
                  (fill) => patchPin({ fill }),
                  !pin.kind || ["sticky", "rect", "circle", "frame"].includes(pin.kind),
                )}
              {(textPin || pin.kind === "line" || pin.kind === "draw") &&
                colorRow(textPin ? "Text colour" : "Stroke colour", pin.color ?? "#292524", (color) =>
                  patchPin({ color }),
                )}
              {textPin && (
                <>
                  <p className="mb-section">Text spacing</p>
                  {slider("Letter spacing", pin.letterSpacing ?? 0, -100, 800, (letterSpacing) => patchPin({ letterSpacing }), 10)}
                  {slider("Line height", pin.lineHeight ?? 1.25, 0.8, 2.5, (lineHeight) => patchPin({ lineHeight }), 0.05, (n) => n.toFixed(2))}
                  <div className="mb-toggle-row">
                    <span>Uppercase</span>
                    <Toggle checked={!!pin.uppercase} onChange={(uppercase) => patchPin({ uppercase })} label="Uppercase" />
                  </div>
                </>
              )}
              {pin.kind !== "draw" && (
                <>
                  <p className="mb-section">Effects</p>
                  {pin.kind !== "line" &&
                    pin.kind !== "circle" &&
                    !["triangle", "diamond", "star", "arrow"].includes(pin.kind ?? "") &&
                    slider("Corner radius", pin.radius ?? 0, 0, 120, (radius) => patchPin({ radius }))}
                  {pin.kind !== "line" && (
                    <>
                      {slider("Border", pin.strokeWidth ?? 0, 0, 24, (strokeWidth) => patchPin({ strokeWidth }))}
                      {!!pin.strokeWidth &&
                        colorRow("Border colour", pin.stroke ?? "#292524", (stroke) => patchPin({ stroke }))}
                    </>
                  )}
                  {pin.kind === "line" &&
                    slider("Thickness", pin.strokeWidth ?? 3, 1, 24, (strokeWidth) => patchPin({ strokeWidth }))}
                  <div className="mb-toggle-row">
                    <span>Drop shadow</span>
                    <Toggle checked={!!pin.shadow} onChange={(shadow) => patchPin({ shadow })} label="Drop shadow" />
                  </div>
                </>
              )}
              {pin.image && (
                <>
                  <div className="mb-section-row">
                    <p className="mb-section">Adjust image</p>
                    {pin.adjust && iconButton(RotateCcw, "Reset adjustments", () => patchPin({ adjust: undefined }))}
                  </div>
                  {(
                    [
                      ["brightness", "Brightness", 0, 200, 100],
                      ["contrast", "Contrast", 0, 200, 100],
                      ["saturate", "Saturation", 0, 200, 100],
                      ["grayscale", "Black and white", 0, 100, 0],
                      ["blur", "Blur", 0, 20, 0],
                    ] as const
                  ).map(([key, label, min, max, base]) => (
                    <div key={key}>
                      {slider(label, pin.adjust?.[key] ?? base, min, max, (n) =>
                        patchPin({ adjust: { ...pin.adjust, [key]: n } }),
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
                {number("Width", pin.width, 24, 800, (width) =>
                  patchPin({ width }),
                )}
                {number("Height", pinHeight(pin), 12, PAGE_H, (height) =>
                  patchPin({ height }),
                )}
                {number("Rotation", pin.rotation, -360, 360, (rotation) =>
                  patchPin({ rotation }),
                )}
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
            Select an element to align, style and arrange it. Drag snaps to the page and other elements (hold Alt to skip); Shift keeps proportions while resizing. Arrow keys move, [ and ] rotate,
            Ctrl/⌘ D duplicates and Ctrl/⌘ Z undoes.
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
                        brief.pins.map((v) =>
                          v.id === p.id ? { ...v, locked: !v.locked } : v,
                        ),
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
                        brief.pins.map((v) =>
                          v.id === p.id ? { ...v, hidden: !v.hidden } : v,
                        ),
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
    ),
  }

  const editor = (
    <section
      ref={root}
      className={`mb-editor${full ? " mb-editor--full" : ""}${
        readOnly ? " mb-editor--readonly" : ""
      }`}
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
      aria-label={full ? "Full-screen mood board editor" : "Mood board editor"}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (pageGrid) { e.preventDefault(); e.stopPropagation(); setPageGrid(false); return }
          if (tool === "draw") { e.preventDefault(); e.stopPropagation(); setTool("select") }
          else if (selected) { e.preventDefault(); e.stopPropagation(); onSelect(null) }
          else if (full) { e.preventDefault(); e.stopPropagation(); onExitFullScreen?.() }
          return
        }
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,select,[contenteditable=true]",
          )
        )
          return
        const mod = e.ctrlKey || e.metaKey
        if (mod && e.key === "0") {
          e.preventDefault()
          fit()
          return
        }
        if (readOnly) return
        const k = e.key.toLowerCase()
        if (mod && k === "z") {
          e.preventDefault()
          travel(e.shiftKey ? "future" : "past")
        } else if (mod && k === "y") {
          e.preventDefault()
          travel("future")
        } else if (mod && k === "d" && pin) {
          e.preventDefault()
          duplicate(pin)
        } else if (mod && k === "c" && pin) {
          e.preventDefault()
          clipboard.current = { ...pin }
        } else if (mod && k === "v" && clipboard.current) {
          e.preventDefault()
          duplicate(clipboard.current, page)
        } else if ((e.key === "Delete" || e.key === "Backspace") && pin) {
          e.preventDefault()
          remove()
        }
      }}
    >
      <div
        className="mb-context"
        role="toolbar"
        aria-label="Edit selection"
      >
        <div className="mb-context-tools">
          {!readOnly && (
            <>
              {iconButton(Undo2, "Undo (Ctrl/⌘ Z)", () => travel("past"), {
                disabled: !history.current.past.length,
              })}
              {iconButton(
                Redo2,
                "Redo (Ctrl/⌘ Shift Z)",
                () => travel("future"),
                { disabled: !history.current.future.length },
              )}
              {divider}
              {selectionTools ?? pageTools}
            </>
          )}
          {readOnly && (
            <Badge tone="neutral">Read-only board</Badge>
          )}
        </div>
        <div className="mb-context-end">
          {full && <Button type="button" variant="outline" icon={X} onClick={onExitFullScreen}>Exit full screen</Button>}
          {iconButton(
            Hand,
            "Pan",
            () => setTool(tool === "pan" ? "select" : "pan"),
            { active: tool === "pan" },
          )}
          {!full && onPresent && <Button type="button" variant="outline" icon={Eye} data-present-board onClick={onPresent}>Present board</Button>}
          <Button
            type="button"
            icon={Download}
            className="mb-download"
            aria-label="Download PNG"
            disabled={exporting || !brief.pins.length}
            onClick={() => void exportPNG()}
          >
            <span className="mb-primary-label">
              {exporting ? "Exporting…" : "Download PNG"}
            </span>
          </Button>
        </div>
      </div>

      <div
        className="mb-body"
        data-panel={!readOnly && tab ? "open" : "closed"}
      >
        {!readOnly && (
          <nav className="mb-rail" aria-label="Editor panels">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(tab === id ? null : id)}
              >
                <span className="mb-rail-icon">
                  <Icon size={20} strokeWidth={1.6} aria-hidden />
                </span>
                {label}
              </button>
            ))}
          </nav>
        )}
        {!readOnly && tab && (
          <aside
            className="mb-panel"
            aria-label={`${tabs.find((t) => t.id === tab)?.label} panel`}
          >
            <div key={tab === "templates" ? selectedTheme ?? "templates" : tab} className="mb-panel-scroll">{panels[tab]}</div>
            <button
              type="button"
              className="mb-collapse"
              aria-label="Hide panel"
              title="Hide panel"
              onClick={() => setTab(null)}
            >
              <ChevronLeft size={14} aria-hidden />
            </button>
          </aside>
        )}

        <div className={cx("mb-stage", pageGrid && "mb-stage--overview")}>
          <div
            ref={viewport}
            tabIndex={0}
            className={`mb-viewport${
              tool === "pan" ? " mb-panning" : ""
            }`}
            aria-label="Mood board pages. Control or Command plus wheel zooms."
            onScroll={trackPage}
            onPointerDownCapture={(e) => {
              if (tool !== "pan" || e.button !== 0) return
              e.preventDefault()
              e.stopPropagation()
              const el = e.currentTarget
              el.setPointerCapture(e.pointerId)
              pan.current = {
                x: e.clientX,
                y: e.clientY,
                left: el.scrollLeft,
                top: el.scrollTop,
              }
            }}
            onPointerMove={(e) => {
              if (!pan.current) return
              e.currentTarget.scrollLeft =
                pan.current.left - (e.clientX - pan.current.x)
              e.currentTarget.scrollTop =
                pan.current.top - (e.clientY - pan.current.y)
            }}
            onPointerUp={() => {
              pan.current = null
            }}
            onPointerCancel={() => {
              pan.current = null
            }}
            onPointerDown={(e) => {
              if (
                e.target === e.currentTarget ||
                (e.target as HTMLElement).classList.contains("mb-pages")
              )
                onSelect(null)
            }}
          >
            <div className="mb-pages">
              {pages.map((p, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    pageRefs.current[i] = el
                  }}
                  className="mb-page"
                  data-current={page === i || undefined}
                  style={{ width: 800 * zoom }}
                  onPointerDown={() => {
                    if (page !== i) setPage(i)
                    if (deletePage !== null && deletePage !== i)
                      setDeletePage(null)
                  }}
                >
                  <div className="mb-page-head">
                    <span className="mb-page-label">Page {i + 1}</span>
                    {readOnly ? (
                      <span className="mb-page-name">{p.title}</span>
                    ) : (
                      <>
                        <span aria-hidden className="mb-page-sep">
                          -
                        </span>
                        <input
                          className="mb-page-name"
                          aria-label={`Page ${i + 1} title`}
                          value={p.title}
                          maxLength={60}
                          placeholder="Add page title"
                          onChange={(e) =>
                            changePage(i, { title: e.target.value })
                          }
                        />
                        <span className="mb-page-actions">
                          {deletePage === i ? (
                            <>
                              <button
                                type="button"
                                className="inline-flex h-8 items-center rounded-full bg-danger px-3 text-[13px] font-semibold text-white"
                                onClick={() => dropPage(i)}
                              >
                                Delete page
                              </button>
                              <button
                                type="button"
                                className={ghostBtn}
                                onClick={() => setDeletePage(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              {iconButton(
                                ChevronUp,
                                "Move page up",
                                () => movePage(i, -1),
                                { disabled: i === 0 },
                              )}
                              {iconButton(
                                ChevronDown,
                                "Move page down",
                                () => movePage(i, 1),
                                { disabled: i === pages.length - 1 },
                              )}
                              {iconButton(
                                Copy,
                                "Duplicate page",
                                () => duplicatePage(i),
                                { disabled: pages.length >= 12 },
                              )}
                              {iconButton(
                                Trash2,
                                "Delete page",
                                () => setDeletePage(i),
                                { disabled: pages.length === 1 },
                              )}
                              {iconButton(
                                Plus,
                                "Add page after",
                                () => addPage(i),
                                { disabled: pages.length >= 12 },
                              )}
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <Board
                    pins={brief.pins}
                    page={i}
                    theme={brief.theme}
                    background={p.background}
                    editable={!readOnly && tool !== "pan"}
                    selected={selected}
                    onSelect={select}
                    onChange={setPins}
                    label={`${p.title} mood board`}
                    className="mb-paper"
                    draw={tool === "draw" && !readOnly}
                    drawColor={penColor}
                    onGesture={(active) => {
                      history.current.grouping = active
                      if (active) history.current.recorded = false
                    }}
                    onDropItem={(key, x, y) => onDropItem(key, x, y, i)}
                    onFillFrame={fillFrame}
                    onFiles={(files, x, y) => void upload(files, x, y, i)}
                    onDraw={(points) => {
                      const xs = points.filter((_, n) => n % 2 === 0),
                        ys = points.filter((_, n) => n % 2 === 1),
                        x = Math.min(...xs),
                        y = Math.min(...ys)
                      add({
                        title: "Drawing",
                        kind: "draw",
                        page: i,
                        x: x / 8,
                        y: (y / PAGE_H) * 100,
                        width: Math.max(24, Math.max(...xs) - x),
                        height: Math.max(24, Math.max(...ys) - y),
                        points: points.map((v, n) => v - (n % 2 === 0 ? x : y)),
                        color: penColor,
                      })
                      setTool("draw")
                    }}
                  />
                </div>
              ))}
              {!readOnly && pages.length < 12 && (
                <Button
                  type="button"
                  variant="outline"
                  icon={Plus}
                  className="mb-add-page"
                  style={{ width: 800 * zoom }}
                  onClick={() => addPage()}
                >
                  Add page
                </Button>
              )}
            </div>
          </div>

          {(showPages || pageGrid) && <div className={cx("mb-filmstrip", pageGrid && "mb-page-overview")} role="group" aria-label="Pages">
            {pages.map((p, i) => (
              <button
                key={i}
                type="button"
                className="mb-thumb"
                aria-current={page === i ? "page" : undefined}
                aria-label={`Go to page ${i + 1}: ${p.title}`}
                onClick={() => {
                  setPageGrid(false)
                  requestAnimationFrame(() => goTo(i))
                }}
              >
                <Board
                  pins={brief.pins}
                  page={i}
                  theme={brief.theme}
                  background={p.background}
                  compact
                  label={p.title}
                  className="mb-thumb-board"
                />
                <span className="mb-thumb-num">{i + 1}</span>
              </button>
            ))}
            {!readOnly && pages.length < 12 && (
              <div className="mb-page-add-controls">
                <button
                  type="button"
                  className="mb-page-add-main"
                  aria-label="Add page"
                  title="Add page"
                  onClick={() => addPage()}
                ><Plus size={18} aria-hidden /></button>
                <Dropdown
                  className="mb-page-add-dropdown"
                  aria-label="Page creation options"
                  value=""
                  onChange={(e) => e.target.value === "duplicate" ? duplicatePage(page) : addPage()}
                >
                  <option value="" disabled>Page options</option>
                  <option value="blank">Add blank page</option>
                  <option value="duplicate">Duplicate current page</option>
                </Dropdown>
              </div>
            )}
          </div>}

          <div className="mb-bottom">
            <p className="mb-status" role="status">
              {readOnly
                  ? "Read-only board · scroll, zoom, present or download."
                  : ""}
            </p>
            <div className="mb-zoombar">
              <input
                type="range"
                min={10}
                max={300}
                step={5}
                aria-label="Zoom"
                value={Math.round(zoom * 100)}
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
                style={{ ["--p" as string]: `${((Math.round(zoom * 100) - 10) / 290) * 100}%` }}
              />
              <details
                ref={zoomMenu}
                className="mb-zoom-menu"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation()
                    e.currentTarget.open = false
                    e.currentTarget.querySelector("summary")?.focus()
                  }
                }}
              >
                <summary className="mb-zoom" aria-label="Zoom options">{Math.round(zoom * 100)}%</summary>
                <div className="mb-zoom-options" role="group" aria-label="Zoom presets">
                  {[300, 200, 125, 100, 75, 50, 25, 10].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={!zoomMode && Math.round(zoom * 100) === value}
                      onClick={() => { setZoom(value / 100); if (zoomMenu.current) zoomMenu.current.open = false }}
                    >{value}%</button>
                  ))}
                  <div className="mb-zoom-divider" />
                  {(["fit", "fill"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={zoomMode === mode}
                      onClick={() => { mode === "fit" ? fit() : fill(); if (zoomMenu.current) zoomMenu.current.open = false }}
                    >
                      {mode === "fit" ? "Fit" : "Fill"}
                      {zoomMode === mode && <Check size={16} aria-hidden />}
                    </button>
                  ))}
                </div>
              </details>
              <button
                type="button"
                className="mb-pages-toggle"
                aria-pressed={showPages && !pageGrid}
                onClick={() => { setPageGrid(false); setShowPages((v) => !v) }}
              >
                <PanelsTopLeft size={20} strokeWidth={1.5} aria-hidden /> Pages
              </button>
              <span className="mb-page-count">
                {page + 1} / {pages.length}
              </span>
              {iconButton(
                LayoutGrid,
                "Page grid view",
                () => setPageGrid((v) => !v),
                { active: pageGrid },
              )}
              {iconButton(Maximize2, "Present full screen", () => setPresenting(true))}
            </div>
          </div>
        </div>
      </div>

      {presenting && <BoardSlideshow brief={brief} pages={pages} initialPage={page} onClose={() => setPresenting(false)} />}

      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          void upload(files)
        }}
      />
      <div className="mb-export-surface" aria-hidden="true">
        <div ref={capture} style={{ width: 800 }}>
          {pages.map((p, i) => (
            <Board
              key={i}
              pins={brief.pins}
              page={i}
              theme={brief.theme}
              background={p.background}
              label={p.title}
            />
          ))}
        </div>
      </div>
    </section>
  )
  return full ? (
    <OverlayLayer panelRef={root} onClose={() => onExitFullScreen?.()} className="fixed inset-0 bg-panel">
      {editor}
    </OverlayLayer>
  ) : editor

}
