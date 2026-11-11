import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { ImageIcon, Lock, RotateCw } from "lucide-react"
import { safeImage, type Pin } from "./model"
import { themeByName } from "./shared"
import { safePaint } from "../../components/colourValues"
import { cx } from "../../components/ui"

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
export const pinWidthPct = (p: Pin) => clamp(p.width / 8, 3, 100)
export const pinHeight = (p: Pin) =>
  p.height ?? (p.image ? p.width * 0.75 + 32 : 100)
const isText = (p: Pin) =>
  !p.image && (!p.kind || p.kind === "text" || p.kind === "sticky")

export type BoardProps = {
  pins: Pin[]
  theme: string
  editable?: boolean
  compact?: boolean
  selected?: string | null
  onSelect?: (id: string | null) => void
  onChange?: (pins: Pin[]) => void
  onDropItem?: (key: string, x: number, y: number) => void
  onFiles?: (files: File[], x: number, y: number) => void
  /** Called when a shelf item or image file is dropped onto a photo frame. */
  onFillFrame?: (frameId: string, item: { key?: string; files?: File[] }) => void
  onDraw?: (points: number[]) => void
  draw?: boolean
  drawColor?: string
  page?: number
  background?: string
  label: string
  className?: string
  pages?: { title: string; background: string }[]
  onGesture?: (active: boolean) => void
}

type Gesture = {
  id: string
  sx: number
  sy: number
  pin: Pin
  mode: "move" | "resize" | "rotate"
  hx: number
  hy: number
  cx: number
  cy: number
  moved: boolean
}

const corners = [
  ["nw", -1, -1],
  ["ne", 1, -1],
  ["sw", -1, 1],
  ["se", 1, 1],
] as const

const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 21 : 50,
    a = (Math.PI / 5) * i - Math.PI / 2
  return `${Math.round((50 + r * Math.cos(a)) * 10) / 10},${Math.round((52 + r * Math.sin(a)) * 10) / 10}`
}).join(" ")
const POLYGONS: Record<string, string> = {
  triangle: "50,0 100,100 0,100",
  diamond: "50,0 100,50 50,100 0,50",
  star: STAR,
  arrow: "0,35 62,35 62,8 100,50 62,92 62,65 0,65",
}
const cq = (n: number) => `${n / 8}cqw`
const imageFilter = (a: Pin["adjust"]) =>
  a
    ? `brightness(${a.brightness ?? 100}%) contrast(${a.contrast ?? 100}%) saturate(${a.saturate ?? 100}%) grayscale(${a.grayscale ?? 0}%) blur(${cq(a.blur ?? 0)})`
    : undefined

const toPoints = (values: number[]) =>
  values
    .reduce<string[]>((a, n, i, all) => {
      if (i % 2 === 0) a.push(`${n},${all[i + 1]}`)
      return a
    }, [])
    .join(" ")

/** Pins keep percentage positions on an 800 x 450 (16:9) logical page. */
export const PAGE_H = 450
export default function Board({
  pins,
  theme,
  editable = false,
  compact = false,
  selected,
  onSelect,
  onChange,
  onDropItem,
  onFiles,
  onFillFrame,
  onDraw,
  draw,
  drawColor = "#292524",
  page,
  background,
  pages,
  label,
  className,
  onGesture,
}: BoardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Gesture | null>(null)
  const stroke = useRef<number[] | null>(null)
  const [preview, setPreview] = useState<number[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [guides, setGuides] = useState<{ x?: number; y?: number } | null>(null)
  const palette = themeByName(theme)?.palette ?? []
  const patch = (id: string, changes: Partial<Pin>) =>
    onChange?.(pins.map((p) => (p.id === id ? { ...p, ...changes } : p)))
  const point = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect()
    return [
      Math.round(clamp(((e.clientX - r.left) / r.width) * 800, 0, 800)),
      Math.round(clamp(((e.clientY - r.top) / r.height) * PAGE_H, 0, PAGE_H)),
    ]
  }
  const end = () => {
    if (drag.current) onGesture?.(false)
    drag.current = null
    setGuides(null)
  }

  const down = (
    e: PointerEvent<HTMLElement>,
    pin: Pin,
    mode: Gesture["mode"] = "move",
    hx = 1,
    hy = 1,
  ) => {
    if (!editable || draw || e.button !== 0) return
    e.stopPropagation()
    onSelect?.(pin.id)
    if (pin.locked || (mode === "move" && editing === pin.id)) return
    const box = (e.currentTarget.closest("[data-pin],[data-sel]") ??
      e.currentTarget) as HTMLElement
    const r = box.getBoundingClientRect()
    onGesture?.(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      id: pin.id,
      sx: e.clientX,
      sy: e.clientY,
      pin: { ...pin },
      mode,
      hx,
      hy,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      moved: false,
    }
  }

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current,
      r = ref.current?.getBoundingClientRect()
    if (!d || !r) return
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 3)
      return
    d.moved = true
    const p = d.pin
    if (d.mode === "rotate") {
      let angle =
        (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI - 90
      angle = ((angle + 540) % 360) - 180
      if (e.shiftKey) angle = Math.round(angle / 15) * 15
      else {
        const snap = Math.round(angle / 45) * 45
        if (Math.abs(snap - angle) < 4) angle = snap
      }
      patch(d.id, { rotation: Math.round(angle) })
      return
    }
    const dx = ((e.clientX - d.sx) / r.width) * 800,
      dy = ((e.clientY - d.sy) / r.height) * PAGE_H
    if (d.mode === "resize") {
      const h0 = pinHeight(p)
      const width = clamp(p.width + d.hx * dx, 24, 800)
      const height =
        p.image || e.shiftKey || p.kind === "circle"
        ? clamp((h0 * width) / p.width, 12, PAGE_H)
        : clamp(h0 + d.hy * dy, 12, PAGE_H)
      patch(d.id, {
        width: Math.round(width),
        height: Math.round(height),
        x: d.hx < 0 ? Math.max(0, p.x + (p.width - width) / 8) : p.x,
        y: d.hy < 0 ? Math.max(0, p.y + ((h0 - height) / PAGE_H) * 100) : p.y,
      })
      return
    }
    const w = pinWidthPct(p),
      h = (pinHeight(p) / PAGE_H) * 100
    let nx = clamp(p.x + dx / 8, 0, 100 - w),
      ny = clamp(p.y + (dy / PAGE_H) * 100, 0, Math.max(0, 100 - h))
    // Smart guides: snap edges and centres to the page and other elements. Alt skips snapping.
    let gx: number | undefined, gy: number | undefined
    if (!e.altKey) {
      const others = pins.filter(
        (o) => o.id !== p.id && !o.hidden && (o.page ?? 0) === (page ?? 0),
      )
      const xs = [0, 50, 100, ...others.flatMap((o) => [o.x, o.x + pinWidthPct(o) / 2, o.x + pinWidthPct(o)])]
      const ys = [0, 50, 100, ...others.flatMap((o) => [o.y, o.y + (pinHeight(o) / PAGE_H) * 50, o.y + (pinHeight(o) / PAGE_H) * 100])]
      const snap = (pos: number, size: number, targets: number[], tol: number) => {
        let best: { delta: number; at: number } | undefined
        for (const edge of [pos, pos + size / 2, pos + size])
          for (const t of targets) {
            const delta = t - edge
            if (Math.abs(delta) < tol && (!best || Math.abs(delta) < Math.abs(best.delta)))
              best = { delta, at: t }
          }
        return best
      }
      const sx = snap(nx, w, xs, (6 / r.width) * 100),
        sy = snap(ny, h, ys, (6 / r.height) * 100)
      if (sx) {
        nx += sx.delta
        gx = sx.at
      }
      if (sy) {
        ny += sy.delta
        gy = sy.at
      }
    }
    setGuides(gx === undefined && gy === undefined ? null : { x: gx, y: gy })
    patch(d.id, {
      x: Math.round(nx * 100) / 100,
      y: Math.round(ny * 100) / 100,
    })
  }

  const key = (e: KeyboardEvent<HTMLDivElement>, p: Pin) => {
    if (!editable || e.target !== e.currentTarget) return
    if (e.key === "Enter" && isText(p) && !p.locked) {
      e.preventDefault()
      e.stopPropagation()
      setEditing(p.id)
      return
    }
    if (p.locked) return
    const step = e.shiftKey ? 5 : 1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (moves[e.key]) {
      e.preventDefault()
      e.stopPropagation()
      patch(p.id, {
        x: clamp(p.x + moves[e.key][0], 0, 100 - pinWidthPct(p)),
        y: clamp(p.y + moves[e.key][1], 0, Math.max(0, 100 - (pinHeight(p) / PAGE_H) * 100)),
      })
    } else if (e.key === "[" || e.key === "]") {
      e.preventDefault()
      e.stopPropagation()
      patch(p.id, { rotation: p.rotation + (e.key === "]" ? 3 : -3) })
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      e.stopPropagation()
      onChange?.(pins.filter((v) => v.id !== p.id))
      onSelect?.(null)
    }
  }

  const count = Math.max(
    pages?.length ?? 1,
    ...pins.map((p) => (p.page ?? 0) + 1),
  )
  // Presentation and thumbnail callers without a page show every page.
  if (page === undefined && count > 1)
    return (
      <div className="space-y-4">
        {Array.from({ length: count }, (_, i) => (
          <Board
            key={i}
            pins={pins}
            theme={theme}
            compact={compact}
            page={i}
            background={pages?.[i]?.background}
            label={`${label}, page ${i + 1}`}
            className={className}
          />
        ))}
      </div>
    )

  const paper = background ?? pages?.[page ?? 0]?.background
  const visible = pins.filter((p) => !p.hidden && (p.page ?? 0) === (page ?? 0))
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cx(
        "relative aspect-video w-full overflow-hidden rounded-lg border border-line select-none",
        !compact && "em-moodboard",
        draw && "cursor-crosshair touch-none",
        className,
      )}
      style={{
        containerType: "inline-size",
        // Shorthand only when a page paint exists, so React never mixes it with longhands.
        ...(paper
          ? { background: safePaint(paper, "#ebe8e1") }
          : {
              backgroundColor: "#ebe8e1",
              ...(palette.length
                ? { backgroundImage: `radial-gradient(ellipse at 0% 0%, ${palette[1]}26, transparent 55%)` }
                : {}),
            }),
      }}
      onPointerDown={(e) => {
        if (!editable || e.button !== 0) return
        if (draw) {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          stroke.current = point(e)
          setPreview([...stroke.current])
        } else if (e.target === e.currentTarget) {
          setEditing(null)
          onSelect?.(null)
        }
      }}
      onPointerMove={(e) => {
        if (!stroke.current) return
        stroke.current.push(...point(e))
        if (stroke.current.length > 4000)
          stroke.current = stroke.current.filter(
            (_, i) => Math.floor(i / 2) % 2 === 0,
          )
        setPreview([...stroke.current])
      }}
      onPointerUp={() => {
        if (stroke.current && stroke.current.length > 3)
          onDraw?.(stroke.current)
        stroke.current = null
        setPreview([])
        end()
      }}
      onPointerCancel={() => {
        stroke.current = null
        setPreview([])
        end()
      }}
      onDragOver={(e) => {
        if (
          editable &&
          (e.dataTransfer.types.includes("application/x-em-ref") ||
            e.dataTransfer.types.includes("Files"))
        ) {
          e.preventDefault()
          e.dataTransfer.dropEffect = "copy"
        }
      }}
      onDrop={(e) => {
        if (!editable) return
        e.preventDefault()
        const [x, y] = point(e)
        const item = e.dataTransfer.getData("application/x-em-ref")
        const px = x / 8,
          py = (y / PAGE_H) * 100
        const frame = [...visible]
          .reverse()
          .find(
            (f) =>
              f.kind === "frame" &&
              !f.locked &&
              px >= f.x &&
              px <= f.x + pinWidthPct(f) &&
              py >= f.y &&
              py <= f.y + (pinHeight(f) / PAGE_H) * 100,
          )
        if (frame && onFillFrame && (item || e.dataTransfer.files.length))
          onFillFrame(frame.id, item ? { key: item } : { files: Array.from(e.dataTransfer.files) })
        else if (item) onDropItem?.(item, px, py)
        else if (e.dataTransfer.files.length)
          onFiles?.(Array.from(e.dataTransfer.files), x / 8, (y / PAGE_H) * 100)
      }}
    >
      {!visible.length && !compact && !editable && (
        <p className="mb-empty pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-stone-500">
          No pins on this board yet.
        </p>
      )}
      {visible.map((p) => {
        const active = editable && selected === p.id
        const kind = p.kind ?? (p.image ? "image" : "sticky")
        const h = pinHeight(p)
        const textStyle = {
          padding: kind === "sticky" ? "8%" : 0,
          background: kind === "sticky" ? safePaint(p.fill, "#fff1b8") : "transparent",
          color: p.color ?? "#292524",
          fontFamily: p.fontFamily ?? "Arial, sans-serif",
          fontSize: `${(p.fontSize ?? 22) / 8}cqw`,
          fontWeight: p.bold ? 700 : 400,
          fontStyle: p.italic ? "italic" : "normal",
          textAlign: p.align ?? "left",
          lineHeight: p.lineHeight ?? 1.25,
          letterSpacing: p.letterSpacing ? `${p.letterSpacing / 1000}em` : undefined,
          textTransform: p.uppercase ? "uppercase" : undefined,
          borderRadius: p.radius ? cq(p.radius) : undefined,
          border: p.strokeWidth ? `${cq(p.strokeWidth)} solid ${p.stroke ?? "#292524"}` : undefined,
          boxSizing: "border-box",
        } as const
        const radius = kind === "circle" ? "50%" : p.radius ? cq(p.radius) : undefined
        const border = p.strokeWidth
          ? `${cq(p.strokeWidth)} solid ${p.stroke ?? "#292524"}`
          : undefined
        return (
          <div
            key={p.id}
            data-pin=""
            tabIndex={editable ? 0 : undefined}
            role={editable ? "group" : undefined}
            aria-label={
              editable
                ? `${p.title}${p.locked ? ", locked" : ""}${
                    active ? ", selected" : ""
                  }`
                : undefined
            }
            onPointerDown={(e) => down(e, p)}
            onPointerMove={move}
            onPointerUp={end}
            onLostPointerCapture={end}
            onDoubleClick={() => {
              if (editable && !draw && isText(p) && !p.locked) setEditing(p.id)
            }}
            onKeyDown={(e) => key(e, p)}
            className={cx(
              "mb-el absolute outline-none",
              editable && !draw && "mb-el--editable touch-none",
              active && "is-selected",
            )}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${pinWidthPct(p)}%`,
              height: `${(h / PAGE_H) * 100}%`,
              transform: `rotate(${p.rotation}deg)`,
            }}
          >
            <div
              className="h-full w-full"
              style={{
                opacity: p.opacity ?? 1,
                transform: `scale(${p.flipX ? -1 : 1}, ${p.flipY ? -1 : 1})`,
                filter: p.shadow
                  ? "drop-shadow(0 0.5cqw 1.2cqw rgb(0 0 0 / 0.3))"
                  : undefined,
              }}
            >
              {kind === "image" || (kind === "frame" && p.image && safeImage(p.image)) ? (
                <div
                  className="h-full w-full overflow-hidden"
                  style={{ borderRadius: radius, border, boxSizing: "border-box" }}
                >
                  {p.image && safeImage(p.image) ? (
                    <img
                      src={p.image}
                      alt={p.title}
                      draggable={false}
                      referrerPolicy="no-referrer"
                      className={cx("h-full w-full", kind === "frame" ? "object-cover" : "object-contain")}
                      style={{ filter: imageFilter(p.adjust) }}
                    />
                  ) : (
                    <div className="h-full w-full bg-stone-200" />
                  )}
                </div>
              ) : kind === "frame" ? (
                <div
                  className="flex h-full w-full flex-col items-center justify-center gap-[0.6cqw] text-stone-500"
                  style={{
                    borderRadius: radius,
                    border: border ?? "0.25cqw dashed #a8a29e",
                    background: safePaint(p.fill, "#e7e5e4"),
                    boxSizing: "border-box",
                    fontSize: "1.5cqw",
                  }}
                >
                  <ImageIcon style={{ width: "3.2cqw", height: "3.2cqw" }} aria-hidden strokeWidth={1.5} />
                  {!compact && <span>Drop an image</span>}
                </div>
              ) : kind === "rect" || kind === "circle" ? (
                <div
                  className="h-full w-full"
                  style={{
                    background: safePaint(p.fill, "#d6c7b3"),
                    borderRadius: radius ?? 0,
                    border,
                    boxSizing: "border-box",
                  }}
                />
              ) : POLYGONS[kind] ? (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="h-full w-full overflow-visible"
                  aria-label={p.title}
                >
                  <polygon
                    points={POLYGONS[kind]}
                    fill={p.fill ?? "#d6c7b3"}
                    stroke={p.strokeWidth ? (p.stroke ?? "#292524") : "none"}
                    style={{ strokeWidth: p.strokeWidth ? cq(p.strokeWidth) : 0 }}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : kind === "line" || kind === "draw" ? (
                <svg
                  viewBox={`0 0 ${p.width} ${h}`}
                  preserveAspectRatio="none"
                  className="h-full w-full overflow-visible"
                  aria-label={p.title}
                >
                  <polyline
                    points={
                      kind === "line"
                        ? `0,${h / 2} ${p.width},${h / 2}`
                        : toPoints(p.points ?? [])
                    }
                    fill="none"
                    stroke={p.color ?? "#44403c"}
                    style={{ strokeWidth: p.strokeWidth ? cq(p.strokeWidth) : 3 }}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : editing === p.id ? (
                <textarea
                  autoFocus
                  aria-label={`Edit ${p.title}`}
                  className="mb-inline-text h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-0 outline-none"
                  style={textStyle}
                  value={p.text ?? p.title}
                  maxLength={3000}
                  onPointerDown={(e) => e.stopPropagation()}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => patch(p.id, { text: e.target.value })}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === "Escape") e.currentTarget.blur()
                  }}
                />
              ) : (
                <div
                  className="h-full w-full overflow-hidden whitespace-pre-wrap break-words"
                  style={textStyle}
                >
                  {p.text || p.title}
                </div>
              )}
            </div>
          </div>
        )
      })}
      {guides?.x !== undefined && (
        <span className="mb-guide mb-guide--v" style={{ left: `${guides.x}%` }} aria-hidden="true" />
      )}
      {guides?.y !== undefined && (
        <span className="mb-guide mb-guide--h" style={{ top: `${guides.y}%` }} aria-hidden="true" />
      )}
      {(() => {
        const p =
          editable && !draw ? visible.find((v) => v.id === selected) : undefined
        if (!p) return null
        return (
          <div
            data-sel=""
            aria-hidden="true"
            className="mb-sel-layer"
            onPointerMove={move}
            onPointerUp={end}
            onLostPointerCapture={end}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${pinWidthPct(p)}%`,
              height: `${(pinHeight(p) / PAGE_H) * 100}%`,
              transform: `rotate(${p.rotation}deg)`,
            }}
          >
            <span className="mb-sel" />
            {p.locked ? (
              <span className="mb-lock">
                <Lock size={11} strokeWidth={2} />
              </span>
            ) : (
              <>
                {corners.map(([name, hx, hy]) => (
                  <span
                    key={name}
                    className={`mb-handle mb-handle--${name}`}
                    onPointerDown={(e) => down(e, p, "resize", hx, hy)}
                  />
                ))}
                <span
                  className="mb-rotate"
                  title="Rotate"
                  onPointerDown={(e) => down(e, p, "rotate")}
                >
                  <RotateCw size={12} strokeWidth={2} />
                </span>
              </>
            )}
          </div>
        )
      })()}
      {preview.length > 3 && (
        <svg
          viewBox={`0 0 800 ${PAGE_H}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <polyline
            points={toPoints(preview)}
            fill="none"
            stroke={drawColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}
