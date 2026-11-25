import { useRef, useState } from "react"
import { useFrameCallback } from "./useFrameCallback"
import { Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react"
import { Button, cx } from "@/components/ui/ui"
import {
  DEFAULT_THUMBNAIL_FRAMING,
  MAX_THUMBNAIL_ZOOM,
  MIN_THUMBNAIL_ZOOM,
  type ThumbnailFraming,
  clampThumbnailFraming,
  maxThumbnailOffsetForZoom,
} from "./thumbnail-framing"

type Props = {
  previewUrl: string
  assetName: string
  framing: ThumbnailFraming
  onChange: (next: ThumbnailFraming) => void
}

export function ThumbnailFramingStage({
  previewUrl,
  assetName,
  framing,
  onChange,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const dragUpdates = useFrameCallback(onChange)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)

  const maxOffset = maxThumbnailOffsetForZoom(framing.zoom)
  const isDefault =
    framing.zoom === DEFAULT_THUMBNAIL_FRAMING.zoom &&
    framing.offsetX === DEFAULT_THUMBNAIL_FRAMING.offsetX &&
    framing.offsetY === DEFAULT_THUMBNAIL_FRAMING.offsetY

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: framing.offsetX,
      startOffsetY: framing.offsetY,
    }
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = dragRef.current
    const card = cardRef.current
    if (!active || active.pointerId !== e.pointerId || !card) return
    const rect = card.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const dxPct = ((e.clientX - active.startX) / rect.width) * 100
    const dyPct = ((e.clientY - active.startY) / rect.height) * 100

    dragUpdates.schedule(
      clampThumbnailFraming({
        zoom: framing.zoom,
        offsetX: active.startOffsetX + dxPct,
        offsetY: active.startOffsetY + dyPct,
      }),
    )
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = dragRef.current
    if (!active || active.pointerId !== e.pointerId) return
    dragUpdates.flush()
    dragRef.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.1 : -0.1
    onChange(
      clampThumbnailFraming({
        ...framing,
        zoom: framing.zoom + delta,
      }),
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:overflow-hidden">
      {/* Center 4:3 Catalog Card Preview */}
      <section className="flex min-h-[300px] flex-1 flex-col items-center justify-center bg-bg/35 p-6">
        <div className="w-full max-w-[380px] space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Catalog card preview (4:3)
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px]">
              <Move className="size-3.5" aria-hidden />
              Drag to reposition
            </span>
          </div>

          {/* Exact inventory card surface & cutout treatment */}
          <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-lg">
            <div
              ref={cardRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={handleWheel}
              className={cx(
                "em-asset-card-media em-product em-product--cutout relative overflow-hidden select-none touch-none",
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
              role="application"
              aria-label="Draggable 4:3 thumbnail framing preview"
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  transform: `translate3d(${framing.offsetX}%, ${framing.offsetY}%, 0) scale(${framing.zoom})`,
                  transformOrigin: "center",
                }}
              >
                <img
                  src={previewUrl}
                  alt={assetName || "Framed asset thumbnail preview"}
                  draggable={false}
                  className="absolute inset-0 size-full object-contain select-none"
                />
              </div>
            </div>

            <div className="border-t border-line px-4 py-3">
              <p className="truncate text-xs font-semibold text-foreground">
                {assetName || "New event asset"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Inventory & Event Manager Asset Library presentation
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Right panel: Zoom, X/Y Position & Reset controls */}
      <aside className="flex shrink-0 flex-col gap-4 border-t border-line p-4 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <div>
          <div className="text-xs font-semibold text-foreground">
            Thumbnail framing
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Adjust zoom and position for 4:3 catalog cards. The full transparent
            cutout stays intact for mood boards.
          </p>
        </div>

        {/* Zoom control */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <label
              htmlFor="thumb-framing-zoom"
              className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Zoom
            </label>
            <span className="tabular-nums text-muted-foreground">
              {framing.zoom.toFixed(2)}×
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Zoom out thumbnail"
              disabled={framing.zoom <= MIN_THUMBNAIL_ZOOM}
              onClick={() =>
                onChange(
                  clampThumbnailFraming({
                    ...framing,
                    zoom: framing.zoom - 0.15,
                  }),
                )
              }
              className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-elev text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <input
              id="thumb-framing-zoom"
              type="range"
              min={MIN_THUMBNAIL_ZOOM}
              max={MAX_THUMBNAIL_ZOOM}
              step={0.05}
              value={framing.zoom}
              onChange={(e) =>
                onChange(
                  clampThumbnailFraming({
                    ...framing,
                    zoom: Number(e.target.value),
                  }),
                )
              }
              className="w-full accent-foreground"
            />
            <button
              type="button"
              aria-label="Zoom in thumbnail"
              disabled={framing.zoom >= MAX_THUMBNAIL_ZOOM}
              onClick={() =>
                onChange(
                  clampThumbnailFraming({
                    ...framing,
                    zoom: framing.zoom + 0.15,
                  }),
                )
              }
              className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-elev text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ZoomIn className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Horizontal position */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <label
              htmlFor="thumb-framing-x"
              className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Horizontal position
            </label>
            <span className="tabular-nums text-muted-foreground">
              {framing.offsetX > 0 ? `+${framing.offsetX}` : framing.offsetX}%
            </span>
          </div>
          <input
            id="thumb-framing-x"
            type="range"
            min={-maxOffset}
            max={maxOffset}
            step={0.5}
            value={framing.offsetX}
            onChange={(e) =>
              onChange(
                clampThumbnailFraming({
                  ...framing,
                  offsetX: Number(e.target.value),
                }),
              )
            }
            className="w-full accent-foreground"
          />
        </div>

        {/* Vertical position */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <label
              htmlFor="thumb-framing-y"
              className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Vertical position
            </label>
            <span className="tabular-nums text-muted-foreground">
              {framing.offsetY > 0 ? `+${framing.offsetY}` : framing.offsetY}%
            </span>
          </div>
          <input
            id="thumb-framing-y"
            type="range"
            min={-maxOffset}
            max={maxOffset}
            step={0.5}
            value={framing.offsetY}
            onChange={(e) =>
              onChange(
                clampThumbnailFraming({
                  ...framing,
                  offsetY: Number(e.target.value),
                }),
              )
            }
            className="w-full accent-foreground"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          icon={RotateCcw}
          disabled={isDefault}
          onClick={() => onChange(DEFAULT_THUMBNAIL_FRAMING)}
          className="h-8 w-full justify-center px-3 text-xs"
        >
          Reset framing
        </Button>
      </aside>
    </div>
  )
}
