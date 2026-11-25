import { useNotify } from '../../../components/ui/Notifications'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Menu } from "@base-ui/react/menu"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Download,
  Eye,
  FileText,
  Hand,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Maximize2,
  PanelsTopLeft,
  Pencil,
  Plus,
  Redo2,
  StickyNote,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react"

import { Badge, Button, IconButton, cx } from "../../../components/ui/ui"
import { ghostBtn } from "../../../components/admin/AdminKit"
import Board, { PAGE_H, pinHeight } from "./Board"
import BoardSlideshow from "./BoardSlideshow"
import OverlayLayer, {
  useCloseOnOverlay,
  useOverlayContainer,
} from "../../../components/overlay/OverlayLayer"
import { themes, type Brief, type Pin } from "../model"
import { themeTemplate, insertThemePages } from "./theme-templates"
import { themeByName } from "../shared"
import {
  clamp,
  LEGACY_PAPER,
  NEW_PAPER,
  PEN_COLORS,
  TEMPLATES,
  tabs,
  type ShelfItem,
  type Tab,
} from "./canvas-constants"
import CanvasContextToolbar from "./CanvasContextToolbar"
import { ensureBoardFontsLoaded } from "./board-fonts"
import FontPanel from "./FontPanel"
import TextColorPanel from "./TextColorPanel"
import CanvasSidebarPanels from "./CanvasSidebarPanels"
import CanvasPageFilmstrip from "./CanvasPageFilmstrip"
import BoardCommentOverlay, { type DraftNoteAnchor } from "./BoardCommentOverlay"
import BoardCommentsPanel, { type NotesFilterScope } from "./BoardCommentsPanel"
import {
  deleteBoardNote,
  getBoardNotesSnapshot,
  getBoardPermissions,
  removePageNotes,
  replaceBoardNotes,
  useBoardNotes,
  type BoardMode,
  type BoardNote,
} from "./board-comments"
import { storeRevision, subscribe } from "../../../auth/store"
import "./mood-board.css"

export type { ShelfItem } from "./canvas-constants"

type Snapshot = Pick<Brief, "pins" | "boardPages"> & { notes?: BoardNote[] }
type Props = {
  boardId?: string
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

/** Canva-style embedded editor. Every change uses the pitch's update/save pipeline. */
export default function MoodBoardCanvas({
  boardId,
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
  useSyncExternalStore(subscribe, storeRevision)
  const permissions = getBoardPermissions(readOnly)
  const effectiveBoardId =
    boardId || `board:${brief.title.trim().toLowerCase() || "untitled"}`
  const [mode, setMode] = useState<BoardMode>(() =>
    permissions.canEdit ? "editing" : "viewing",
  )
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [draftPin, setDraftPin] = useState<DraftNoteAnchor | null>(null)
  const [notesPanelOpen, setNotesPanelOpen] = useState(false)
  const [notesScope, setNotesScope] = useState<NotesFilterScope>("current")
  const notes = useBoardNotes(effectiveBoardId)

  useEffect(() => {
    if (mode === "editing" && !permissions.canEdit) {
      setMode("viewing")
    } else if (mode === "notes" && !permissions.canReadNotes) {
      setMode("viewing")
    }
  }, [mode, permissions.canEdit, permissions.canReadNotes])

  const isEditing = permissions.canEdit && mode === "editing"
  const isNotes = permissions.canReadNotes && mode === "notes"
  const isViewing = !isEditing && !isNotes

  const latest = useRef({ brief, readOnly: !isEditing, update })
  latest.current = { brief, readOnly: !isEditing, update }
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
  const overlayContainer = useOverlayContainer()
  const fullPortalHost = useRef<HTMLDivElement>(null)
  const menuPortalContainer = full ? fullPortalHost : overlayContainer
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportingRef = useRef(false)
  useCloseOnOverlay(() => {
    setExportOpen(false)
    setModeMenuOpen(false)
  })
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
  const isEditableTextSelected = Boolean(
    isEditing &&
      pin &&
      !pin.locked &&
      !pin.image &&
      (!pin.kind || pin.kind === "text" || pin.kind === "sticky"),
  )
  const palette = paletteOverride?.length ? paletteOverride : themeByName(brief.theme)?.palette ?? ["#d6c7b3", "#f0e7db", "#7a8069"]

  useEffect(() => {
    if (tab === "textColor" && !isEditableTextSelected) {
      setTab(null)
    }
  }, [tab, isEditableTextSelected])

  useEffect(() => {
    const h = history.current,
      next: Snapshot = {
        pins: brief.pins,
        boardPages: brief.boardPages,
        notes: getBoardNotesSnapshot(effectiveBoardId),
      }
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
    if (!isEditing) return
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
    if (next.notes !== undefined) {
      replaceBoardNotes(effectiveBoardId, next.notes)
    }
    commit({ pins: next.pins, boardPages: next.boardPages })
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
    if (!isEditing) return
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
    if (!template || !isEditing) return
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
    notify({
      tone: "success", text: target === page
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
  const runExport = async (kind: "png" | "pdf") => {
    if (!capture.current || exportingRef.current) return
    setExportOpen(false)
    exportingRef.current = true
    setExporting(kind)
    try {
      await ensureBoardFontsLoaded(brief.pins)
      const { exportBoardAsPng, exportBoardAsPdf } = await import("./board-export")
      const title = brief.title || "mood-board"
      if (kind === "png") {
        await exportBoardAsPng({
          captureEl: capture.current,
          title,
          backgroundColor: LEGACY_PAPER,
        })
        notify({ tone: "success", text: "PNG exported." })
      } else {
        await exportBoardAsPdf({
          captureEl: capture.current,
          title,
          pageBackgrounds: pages.map((p) => p.background || LEGACY_PAPER),
          fallbackBackground: LEGACY_PAPER,
        })
        notify({ tone: "success", text: "PDF exported." })
      }
    } catch {
      notify({
        tone: "error",
        text: `${kind.toUpperCase()} export failed. An external image may block export; upload a local copy of that image and try again.`,
      })
    } finally {
      exportingRef.current = false
      setExporting(null)
    }
  }

  const changePage = (index: number, changes: Partial<typeof pages[number]>) =>
    commit({
      boardPages: pages.map((p, i) => (i === index ? { ...p, ...changes } : p)),
    })
  const goTo = (index: number) => {
    setPage(index)
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
    if (pages.length <= 1) return
    history.current.last = {
      ...history.current.last,
      notes: getBoardNotesSnapshot(effectiveBoardId),
    }
    removePageNotes(effectiveBoardId, index)
    commit({
      boardPages: pages.filter((_, i) => i !== index),
      pins: brief.pins
        .filter((p) => (p.page ?? 0) !== index)
        .map((p) => ({
          ...p,
          page: (p.page ?? 0) > index ? (p.page ?? 0) - 1 : p.page,
        })),
    })
    setPage((current) =>
      current > index
        ? current - 1
        : current === index
          ? Math.max(0, index - 1)
          : current,
    )
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
  const divider = <span className="mb-divider" aria-hidden />

  const docColors = [
    ...new Set(
      brief.pins
        .flatMap((p) => [p.fill, p.color, p.stroke])
        .filter((c): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c)),
    ),
  ]

  const switchMode = (next: BoardMode) => {
    if (next === "editing" && !permissions.canEdit) return
    if (next === "notes" && !permissions.canReadNotes) return
    if (next !== "editing") {
      onSelect(null)
      if (tool === "draw") setTool("select")
      setTab(null)
    }
    if (next !== "notes") {
      setDraftPin(null)
      setActiveNoteId(null)
      setNotesPanelOpen(false)
    } else {
      setNotesPanelOpen(true)
    }
    setMode(next)
    setModeMenuOpen(false)
  }

  const modeOptions: {
    id: BoardMode
    label: string
    description: string
    icon: LucideIcon
    disabled: boolean
  }[] = [
      {
        id: "editing",
        label: "Editing",
        description: "Make changes",
        icon: Pencil,
        disabled: !permissions.canEdit,
      },
      {
        id: "notes",
        label: "Notes",
        description: permissions.canAddNotes ? "Add or view notes" : "View notes",
        icon: StickyNote,
        disabled: !permissions.canReadNotes,
      },
      {
        id: "viewing",
        label: "Viewing",
        description: "Read-only",
        icon: Eye,
        disabled: false,
      },
    ]
  const activeModeOption =
    modeOptions.find((opt) => opt.id === (isEditing ? "editing" : isNotes ? "notes" : "viewing")) ??
    modeOptions[2]
  const ActiveModeIcon = activeModeOption.icon

  const modeSelector = (
    <Menu.Root
      modal={false}
      open={modeMenuOpen}
      onOpenChange={setModeMenuOpen}
    >
      <Menu.Trigger
        type="button"
        aria-label={`Board mode: ${activeModeOption.label}`}
        data-board-mode-trigger
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border-0 bg-panel px-2.5 text-[13px] font-semibold text-white shadow-none transition-colors hover:bg-elev focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#737373]"
      >
        <ActiveModeIcon size={14} className="shrink-0 text-white" aria-hidden />
        <span>{activeModeOption.label}</span>
        <ChevronDown size={14} className="shrink-0 text-white" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal container={menuPortalContainer}>
        <Menu.Positioner
          sideOffset={8}
          align="start"
          collisionPadding={8}
          className="pointer-events-auto z-[100] max-w-[calc(100vw-16px)]"
        >
          <Menu.Popup
            aria-label="Board access mode"
            className="w-60 overflow-hidden rounded-2xl border border-border bg-card p-1 text-foreground shadow-2xl outline-none animate-pop"
          >
            {modeOptions.map((option) => {
              const Icon = option.icon
              const selectedMode = activeModeOption.id === option.id
              return (
                <Menu.Item
                  key={option.id}
                  disabled={option.disabled}
                  onClick={() => switchMode(option.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors hover:bg-elev data-highlighted:bg-elev focus-visible:bg-elev data-disabled:cursor-not-allowed data-disabled:opacity-45"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon size={16} className="shrink-0 text-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-[12px] text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </span>
                  {selectedMode && (
                    <Check size={16} className="shrink-0 text-foreground" aria-hidden />
                  )}
                </Menu.Item>
              )
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )

  const handleDeleteNote = (noteId: string) => {
    const res = deleteBoardNote({ noteId, readOnly })
    if (!res.ok) {
      notify({ tone: "error", text: res.error })
      return
    }
    if (activeNoteId === noteId) setActiveNoteId(null)
    notify({ tone: "success", text: "Note deleted." })
  }

  const editor = (
    <section
      ref={root}
      className={`mb-editor${full ? " mb-editor--full" : ""}${!isEditing ? " mb-editor--readonly" : ""
        }`}
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
      aria-label={full ? "Full-screen mood board editor" : "Mood board editor"}
      tabIndex={-1}
      onPaste={(e) => {
        if (!isEditing) e.preventDefault()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (modeMenuOpen) { e.preventDefault(); e.stopPropagation(); setModeMenuOpen(false); return }
          if (exportOpen) { e.preventDefault(); e.stopPropagation(); setExportOpen(false); return }
          if (draftPin) { e.preventDefault(); e.stopPropagation(); setDraftPin(null); return }
          if (activeNoteId) { e.preventDefault(); e.stopPropagation(); setActiveNoteId(null); return }
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
        if (!isEditing) return
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
          {isEditing && (
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
              {modeSelector}
              <CanvasContextToolbar
                pin={pin}
                readOnly={!isEditing}
                tool={tool}
                setTool={setTool}
                patchPin={patchPin}
                palette={palette}
                docColors={docColors}
                tab={tab}
                setTab={setTab}
                duplicate={duplicate}
                remove={remove}
                page={page}
                pageBackground={pages[page]?.background ?? LEGACY_PAPER}
                changePageBackground={(background) => changePage(page, { background })}
                showPages={showPages}
                setShowPages={setShowPages}
                pageGrid={pageGrid}
                setPageGrid={setPageGrid}
                fontPanelOpen={tab === "fonts"}
                onToggleFontPanel={() =>
                  setTab((t) => (t === "fonts" ? null : "fonts"))
                }
                textColorPanelOpen={tab === "textColor"}
                onToggleTextColorPanel={() =>
                  setTab((t) => (t === "textColor" ? null : "textColor"))
                }
              />
            </>
          )}
          {isNotes && (
            <div className="flex min-h-9 flex-nowrap items-center gap-2 whitespace-nowrap">
              {modeSelector}
              <button
                type="button"
                aria-pressed={notesPanelOpen}
                onClick={() => setNotesPanelOpen((v) => !v)}
                className={cx(
                  ghostBtn,
                  "h-9 shrink-0 px-2.5 text-xs",
                  notesPanelOpen && "bg-fg/[0.14] text-foreground",
                )}
              >
                <StickyNote size={14} aria-hidden />
                Notes ({notes.length})
              </button>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {permissions.canAddNotes
                  ? "Click any page or element to add a note"
                  : "Click a note pin to read"}
              </span>
            </div>
          )}
          {isViewing && (
            <div className="flex min-h-9 flex-nowrap items-center gap-2 whitespace-nowrap">
              {modeSelector}
              {readOnly && <Badge tone="neutral">Read-only board</Badge>}
            </div>
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
          <Menu.Root
            modal={false}
            open={exportOpen}
            onOpenChange={(next) => {
              if (!exporting && brief.pins.length > 0) setExportOpen(next)
              else if (!next) setExportOpen(false)
            }}
          >
            <Menu.Trigger
              type="button"
              aria-label="Export"
              aria-busy={!!exporting}
              disabled={!!exporting || !brief.pins.length}
              className="mb-download inline-flex h-9 items-center justify-center gap-2 rounded-full bg-invert px-4 text-[13px] font-semibold text-invert-fg transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden />
              ) : (
                <Download size={15} className="shrink-0" aria-hidden />
              )}
              <span className="mb-primary-label">
                {exporting ? "Exporting…" : "Export"}
              </span>
            </Menu.Trigger>
            <Menu.Portal container={menuPortalContainer}>
              <Menu.Positioner
                sideOffset={8}
                align="end"
                collisionPadding={8}
                className="pointer-events-auto z-[100] max-w-[calc(100vw-16px)]"
              >
                <Menu.Popup className="w-52 overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl outline-none animate-pop">
                  <Menu.Item
                    onClick={() => void runExport("png")}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-elev data-highlighted:bg-elev focus-visible:bg-elev"
                  >
                    <ImageIcon size={18} className="shrink-0 text-blue-400" aria-hidden />
                    <span>
                      <span className="block text-[14px] font-semibold">Export as Image</span>
                      <span className="block text-[12px] text-muted-foreground">Download PNG</span>
                    </span>
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => void runExport("pdf")}
                    className="flex w-full cursor-pointer items-center gap-3 border-t border-border px-4 py-2.5 text-left outline-none transition-colors hover:bg-elev data-highlighted:bg-elev focus-visible:bg-elev"
                  >
                    <FileText size={18} className="shrink-0 text-emerald-400" aria-hidden />
                    <span>
                      <span className="block text-[14px] font-semibold">Export as PDF</span>
                      <span className="block text-[12px] text-muted-foreground">Download PDF</span>
                    </span>
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>

      <div
        className="mb-body"
        data-panel={isEditing && tab ? "open" : "closed"}
      >
        {isEditing && (
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
        {isEditing && tab && (
          <aside
            className="mb-panel"
            aria-label={
              tab === "fonts"
                ? "Font panel"
                : tab === "textColor"
                  ? "Text color panel"
                  : `${tabs.find((t) => t.id === tab)?.label} panel`
            }
          >
            {tab === "fonts" ? (
              <FontPanel
                pin={pin}
                pins={brief.pins}
                readOnly={!isEditing}
                onPatchPin={patchPin}
                onClose={() => setTab(null)}
              />
            ) : tab === "textColor" ? (
              <TextColorPanel
                pin={pin}
                brief={brief}
                readOnly={!isEditing}
                onPatchPin={patchPin}
                onClose={() => setTab(null)}
              />
            ) : (
              <div key={tab === "templates" ? selectedTheme ?? "templates" : tab} className="mb-panel-scroll">
                <CanvasSidebarPanels
                tab={tab}
                brief={brief}
                readOnly={!isEditing}
                page={page}
                pages={pages}
                palette={palette}
                docColors={docColors}
                shelf={shelf}
                onAddShelf={onAddShelf}
                pin={pin}
                fillFrame={fillFrame}
                add={add}
                applyTemplate={applyTemplate}
                applyTheme={applyTheme}
                themeTemplates={themeTemplates}
                selectedTheme={selectedTheme}
                setSelectedTheme={setSelectedTheme}
                query={query}
                setQuery={setQuery}
                category={category}
                setCategory={setCategory}
                web={web}
                setWeb={setWeb}
                link={link}
                setLink={setLink}
                linkError={linkError}
                setLinkError={setLinkError}
                uploading={uploading}
                upload={upload}
                inputRef={input}
                duplicate={duplicate}
                tool={tool}
                setTool={setTool}
                penColor={penColor}
                setPenColor={setPenColor}
                patchPin={patchPin}
                reorder={reorder}
                stepLayer={stepLayer}
                alignTo={alignTo}
                goTo={goTo}
                selected={selected}
                select={onSelect}
                setPins={(pins) => update({ pins })}
              />
              </div>
            )}
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

        <div className={cx("mb-stage relative", pageGrid && "mb-stage--overview")}>
          {isNotes && notesPanelOpen && (
            <BoardCommentsPanel
              currentPage={page}
              notes={notes}
              scope={notesScope}
              onScopeChange={setNotesScope}
              activeNoteId={activeNoteId}
              onSelectNote={(note) => {
                setDraftPin(null)
                setActiveNoteId(note.id)
                if (note.page !== page) goTo(note.page)
              }}
              onAddNote={() => {
                if (!permissions.canAddNotes) return
                setActiveNoteId(null)
                setDraftPin({ page, x: 50, y: 45 })
              }}
              onClose={() => setNotesPanelOpen(false)}
              canAddNotes={permissions.canAddNotes}
              canDeleteNotes={permissions.canDeleteNotes}
              onDeleteNote={handleDeleteNote}
              portalContainer={menuPortalContainer}
            />
          )}
          <div
            ref={viewport}
            tabIndex={0}
            className={`mb-viewport${tool === "pan" ? " mb-panning" : ""
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
                  }}
                >
                  <div className="mb-page-head">
                    <span className="mb-page-label">Page {i + 1}</span>
                    {!isEditing ? (
                      p.title.trim() && p.title.trim() !== `Page ${i + 1}` ? (
                        <>
                          <span aria-hidden className="mb-page-sep">
                            -
                          </span>
                          <span className="mb-page-name mb-page-name--readonly">
                            {p.title}
                          </span>
                        </>
                      ) : null
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
                            () => dropPage(i),
                            { disabled: pages.length === 1 },
                          )}
                          {iconButton(
                            Plus,
                            "Add page after",
                            () => addPage(i),
                            { disabled: pages.length >= 12 },
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="relative">
                    <Board
                      pins={brief.pins}
                      page={i}
                      theme={brief.theme}
                      background={p.background}
                      editable={isEditing && tool !== "pan"}
                      selected={selected}
                      onSelect={select}
                      onChange={setPins}
                      label={`${p.title} mood board`}
                      className="mb-paper"
                      draw={tool === "draw" && isEditing}
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
                    {isNotes && (
                      <BoardCommentOverlay
                        boardId={effectiveBoardId}
                        pageIndex={i}
                        pins={brief.pins.filter((item) => (item.page ?? 0) === i)}
                        notes={notes}
                        activeNoteId={activeNoteId}
                        onSelectNote={(id) => {
                          setDraftPin(null)
                          setActiveNoteId(id)
                        }}
                        draftPin={draftPin}
                        onPlaceDraft={(anchor) => {
                          if (!permissions.canAddNotes) return
                          setActiveNoteId(null)
                          setDraftPin(anchor)
                        }}
                        onCancelDraft={() => setDraftPin(null)}
                        canAddNotes={permissions.canAddNotes}
                        canDeleteNotes={permissions.canDeleteNotes}
                        onDeleteNote={handleDeleteNote}
                        portalContainer={menuPortalContainer}
                        panning={tool === "pan"}
                        onNoteCreated={(note) => {
                          setDraftPin(null)
                          setActiveNoteId(note.id)
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
              {isEditing && pages.length < 12 && (
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

          {(showPages || pageGrid) && (
            <CanvasPageFilmstrip
              pages={pages}
              page={page}
              brief={brief}
              readOnly={!isEditing}
              pageGrid={pageGrid}
              setPageGrid={setPageGrid}
              goTo={goTo}
              addPage={addPage}
              duplicatePage={duplicatePage}
            />
          )}

          <div className="mb-bottom">
            <p className="mb-status" role="status">
              {isNotes
                ? permissions.canAddNotes
                  ? "Notes mode · click a page or element to add a note, or click a pin to read."
                  : "Notes mode · click a pin to read notes."
                : isViewing
                  ? "Viewing mode · scroll, zoom, present or download."
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
      {full && (
        <div
          ref={fullPortalHost}
          className="pointer-events-none fixed inset-0 z-[100] [&_[data-base-ui-portal]>*]:pointer-events-auto"
        />
      )}
    </section>
  )
  return full ? (
    <OverlayLayer panelRef={root} onClose={() => onExitFullScreen?.()} className="fixed inset-0 bg-panel">
      {editor}
    </OverlayLayer>
  ) : editor

}
