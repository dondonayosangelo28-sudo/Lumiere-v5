import { useCallback, useEffect, useRef, useState } from "react"
import { useFrameCallback } from "./useFrameCallback"
import { Check, ChevronsLeftRight, Loader2, RotateCcw, X } from "lucide-react"
import { Button, cx } from "@/components/ui/ui"
import type { EngineProgressUpdate } from "./background-removal-engine"
import {
  type CropRect,
  type StudioSource,
  paintBrushStroke,
  renderCutoutToCanvas,
} from "./studio-image"

export type PreviewViewMode = "original" | "result"
export type PreviewBackground = "checkerboard" | "white" | "dark"
export type BrushTool = "erase" | "restore"

type CropHandle = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

type Props = {
  source: StudioSource | null
  cropSource: StudioSource | null
  dimensionSource?: StudioSource | null
  sourceLoading?: boolean
  sourceError?: string
  emptyMessage?: string
  alphaMask: Uint8ClampedArray | null
  maskRevision: number
  viewMode: PreviewViewMode
  onViewModeChange: (mode: PreviewViewMode) => void
  previewBackground: PreviewBackground
  splitPercent: number
  onSplitPercentChange: (pct: number) => void
  brushTool: BrushTool
  brushSize: number
  brushEnabled: boolean
  busy: boolean
  progress: EngineProgressUpdate | null
  onCommitStroke: (nextMask: Uint8ClampedArray) => void
  isCropping: boolean
  draftCropRect: CropRect | null
  canResetCrop: boolean
  onDraftCropChange: (rect: CropRect) => void
  onApplyCrop: () => void
  onCancelCrop: () => void
  onResetCrop: () => void
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const PREVIEW_BG_STYLE: Record<PreviewBackground, React.CSSProperties> = {
  checkerboard: {
    backgroundColor: "#202124",
    backgroundImage:
      "linear-gradient(45deg, #2e3035 25%, transparent 25%), linear-gradient(-45deg, #2e3035 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2e3035 75%), linear-gradient(-45deg, transparent 75%, #2e3035 75%)",
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
  },
  white: {
    backgroundColor: "#ffffff",
  },
  dark: {
    backgroundColor: "#141416",
  },
}

const CROP_HANDLES: {
  id: Exclude<CropHandle, "move">
  className: string
}[] = [
  { id: "nw", className: "-top-1.5 -left-1.5 cursor-nwse-resize" },
  { id: "n", className: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize" },
  { id: "ne", className: "-top-1.5 -right-1.5 cursor-nesw-resize" },
  { id: "e", className: "top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize" },
  { id: "se", className: "-right-1.5 -bottom-1.5 cursor-nwse-resize" },
  { id: "s", className: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize" },
  { id: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { id: "w", className: "top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize" },
]

export function ComparisonCanvasStage({
  source,
  cropSource,
  dimensionSource = null,
  sourceLoading = false,
  sourceError = "",
  emptyMessage = "",
  alphaMask,
  maskRevision,
  viewMode,
  onViewModeChange,
  previewBackground,
  splitPercent,
  onSplitPercentChange,
  brushTool,
  brushSize,
  brushEnabled,
  busy,
  progress,
  onCommitStroke,
  isCropping,
  draftCropRect,
  canResetCrop,
  onDraftCropChange,
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paintedSourceRef = useRef<StudioSource | null>(null)
  const cropUpdates = useFrameCallback(onDraftCropChange)
  const splitUpdates = useFrameCallback(onSplitPercentChange)
  const brushReticleRef = useRef<HTMLDivElement>(null)
  const scratchImageDataRef = useRef<ImageData | undefined>(undefined)
  const lastPaintedMaskRef = useRef<Uint8ClampedArray | null>(null)
  const reticlePosRef = useRef<{ x: number; y: number } | null>(null)
  const reticleRafRef = useRef<number | null>(null)

  const [outerSize, setOuterSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  const strokeRef = useRef<{
    pointerId: number
    mask: Uint8ClampedArray
    lastX: number
    lastY: number
    changed: boolean
  } | null>(null)

  const sliderDragRef = useRef<{ pointerId: number } | null>(null)

  const cropDragRef = useRef<{
    pointerId: number
    handle: CropHandle
    startClientX: number
    startClientY: number
    startRect: CropRect
  } | null>(null)

  useEffect(() => {
    const el = outerRef.current
    if (!el || typeof ResizeObserver !== "function") return
    const update = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      setOuterSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const stageSource = isCropping ? cropSource : source
  const sourceWidth = source?.width ?? 0
  const sourceHeight = source?.height ?? 0
  const stageWidth = stageSource?.width ?? 0
  const stageHeight = stageSource?.height ?? 0

  // Fit aspect ratio cleanly inside the available center viewport without distortion.
  let frameWidth = stageSource?.width ?? Math.max(240, outerSize.width || 480)
  let frameHeight = stageSource?.height ?? Math.max(220, outerSize.height || 360)
  if (stageSource && outerSize.width > 0 && outerSize.height > 0) {
    const scale = Math.min(
      outerSize.width / stageSource.width,
      outerSize.height / stageSource.height,
    )
    frameWidth = Math.max(120, Math.floor(stageSource.width * scale))
    frameHeight = Math.max(120, Math.floor(stageSource.height * scale))
  } else if (!stageSource && outerSize.width > 0 && outerSize.height > 0) {
    frameWidth = Math.max(200, outerSize.width - 32)
    frameHeight = Math.max(200, outerSize.height - 32)
  }

  // Re-render canvas whenever working source, crop mode, or committed maskRevision changes,
  // skipping full redraw when the committed mask was just painted incrementally.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source || !alphaMask) return
    if (isCropping && cropSource !== source) return
    if (paintedSourceRef.current !== source) {
      scratchImageDataRef.current = undefined
      lastPaintedMaskRef.current = null
      paintedSourceRef.current = source
    }
    if (lastPaintedMaskRef.current === alphaMask) {
      lastPaintedMaskRef.current = null
      return
    }
    scratchImageDataRef.current = renderCutoutToCanvas(
      canvas,
      source.originalData,
      alphaMask,
      scratchImageDataRef.current,
    )
  }, [alphaMask, cropSource, isCropping, maskRevision, source])

  // Keep the scratch pixels populated after drawing; brush dirty-rectangle
  // updates reuse this buffer until the working source changes.

  const hideReticle = useCallback(() => {
    reticlePosRef.current = null
    if (reticleRafRef.current !== null) {
      cancelAnimationFrame(reticleRafRef.current)
      reticleRafRef.current = null
    }
    if (brushReticleRef.current) {
      brushReticleRef.current.style.opacity = "0"
    }
  }, [])

  const scheduleReticleUpdate = useCallback((cssX: number, cssY: number) => {
    reticlePosRef.current = { x: cssX, y: cssY }
    if (reticleRafRef.current !== null) return
    reticleRafRef.current = requestAnimationFrame(() => {
      reticleRafRef.current = null
      const el = brushReticleRef.current
      const pos = reticlePosRef.current
      if (!el || !pos) return
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`
      el.style.opacity = "1"
    })
  }, [])

  useEffect(() => {
    return () => {
      if (reticleRafRef.current !== null) {
        cancelAnimationFrame(reticleRafRef.current)
      }
    }
  }, [])

  const hasCutout = Boolean(source && alphaMask)
  const effectiveView: PreviewViewMode = !hasCutout ? "original" : viewMode
  const showComparisonSlider =
    Boolean(source) && !isCropping && hasCutout && effectiveView === "original"
  const canPaint =
    Boolean(source) &&
    !isCropping &&
    brushEnabled &&
    hasCutout &&
    !busy &&
    effectiveView === "result"

  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current
      if (!frame || sourceWidth <= 0 || sourceHeight <= 0) return null
      const rect = frame.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      const normX = (clientX - rect.left) / rect.width
      const normY = (clientY - rect.top) / rect.height
      return {
        canvasX: normX * sourceWidth,
        canvasY: normY * sourceHeight,
        cssX: clientX - rect.left,
        cssY: clientY - rect.top,
      }
    },
    [sourceHeight, sourceWidth],
  )

  const syncDirtyRectToCanvas = useCallback(
    (
      mask: Uint8ClampedArray,
      dirty: { minX: number; minY: number; maxX: number; maxY: number },
    ) => {
      const canvas = canvasRef.current
      const scratch = scratchImageDataRef.current
      if (!canvas || !scratch || !source) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const orig = source.originalData.data
      const out = scratch.data
      const width = source.width

      for (let y = dirty.minY; y <= dirty.maxY; y++) {
        const rowOffset = y * width
        for (let x = dirty.minX; x <= dirty.maxX; x++) {
          const px = rowOffset + x
          const rgba = px * 4
          out[rgba] = orig[rgba]
          out[rgba + 1] = orig[rgba + 1]
          out[rgba + 2] = orig[rgba + 2]
          out[rgba + 3] = mask[px]
        }
      }

      ctx.putImageData(
        scratch,
        0,
        0,
        dirty.minX,
        dirty.minY,
        dirty.maxX - dirty.minX + 1,
        dirty.maxY - dirty.minY + 1,
      )
    },
    [source],
  )

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canPaint || !alphaMask || !source || e.button !== 0) return
    const coords = toCanvasCoords(e.clientX, e.clientY)
    if (!coords) return

    e.currentTarget.setPointerCapture(e.pointerId)
    const workingMask = new Uint8ClampedArray(alphaMask)
    const radius = Math.max(2, brushSize / 2)
    const dirty = paintBrushStroke({
      alphaMask: workingMask,
      originalAlpha: source.originalAlpha,
      width: source.width,
      height: source.height,
      x0: coords.canvasX,
      y0: coords.canvasY,
      x1: coords.canvasX,
      y1: coords.canvasY,
      radius,
      mode: brushTool,
    })

    if (dirty) {
      syncDirtyRectToCanvas(workingMask, dirty)
    }

    strokeRef.current = {
      pointerId: e.pointerId,
      mask: workingMask,
      lastX: coords.canvasX,
      lastY: coords.canvasY,
      changed: Boolean(dirty),
    }
    scheduleReticleUpdate(coords.cssX, coords.cssY)
  }

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const coords = toCanvasCoords(e.clientX, e.clientY)
    if (coords && canPaint) {
      scheduleReticleUpdate(coords.cssX, coords.cssY)
    } else {
      hideReticle()
    }

    const active = strokeRef.current
    if (!active || active.pointerId !== e.pointerId || !coords || !source) return

    const radius = Math.max(2, brushSize / 2)
    const dirty = paintBrushStroke({
      alphaMask: active.mask,
      originalAlpha: source.originalAlpha,
      width: source.width,
      height: source.height,
      x0: active.lastX,
      y0: active.lastY,
      x1: coords.canvasX,
      y1: coords.canvasY,
      radius,
      mode: brushTool,
    })

    if (dirty) {
      active.changed = true
      syncDirtyRectToCanvas(active.mask, dirty)
    }
    active.lastX = coords.canvasX
    active.lastY = coords.canvasY
  }

  const finishStroke = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = strokeRef.current
    if (!active || active.pointerId !== e.pointerId) return
    strokeRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (active.changed) {
      lastPaintedMaskRef.current = active.mask
      onCommitStroke(active.mask)
    }
  }

  const updateSplitFromClientX = (clientX: number) => {
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    if (rect.width <= 0) return
    const next = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    splitUpdates.schedule(next)
  }

  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    sliderDragRef.current = { pointerId: e.pointerId }
    updateSplitFromClientX(e.clientX)
  }

  const handleSliderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sliderDragRef.current || sliderDragRef.current.pointerId !== e.pointerId) {
      return
    }
    e.stopPropagation()
    updateSplitFromClientX(e.clientX)
  }

  const handleSliderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sliderDragRef.current || sliderDragRef.current.pointerId !== e.pointerId) {
      return
    }
    e.stopPropagation()
    splitUpdates.flush()
    sliderDragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const startCropDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: CropHandle,
  ) => {
    if (!isCropping || !draftCropRect || e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    cropDragRef.current = {
      pointerId: e.pointerId,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: draftCropRect,
    }
  }

  const moveCropDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = cropDragRef.current
    if (!active || active.pointerId !== e.pointerId || stageWidth <= 0 || stageHeight <= 0) {
      return
    }
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    e.stopPropagation()
    const dx = ((e.clientX - active.startClientX) / rect.width) * stageWidth
    const dy = ((e.clientY - active.startClientY) / rect.height) * stageHeight
    const minW = Math.min(stageWidth, Math.max(24, Math.round(stageWidth * 0.08)))
    const minH = Math.min(stageHeight, Math.max(24, Math.round(stageHeight * 0.08)))

    const s = active.startRect
    let left = s.x
    let top = s.y
    let right = s.x + s.width
    let bottom = s.y + s.height

    if (active.handle === "move") {
      const nextX = Math.max(0, Math.min(stageWidth - s.width, s.x + dx))
      const nextY = Math.max(0, Math.min(stageHeight - s.height, s.y + dy))
      cropUpdates.schedule({
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: s.width,
        height: s.height,
      })
      return
    }

    if (active.handle.includes("w")) {
      left = Math.max(0, Math.min(right - minW, s.x + dx))
    }
    if (active.handle.includes("e")) {
      right = Math.min(stageWidth, Math.max(left + minW, s.x + s.width + dx))
    }
    if (active.handle.includes("n")) {
      top = Math.max(0, Math.min(bottom - minH, s.y + dy))
    }
    if (active.handle.includes("s")) {
      bottom = Math.min(stageHeight, Math.max(top + minH, s.y + s.height + dy))
    }

    cropUpdates.schedule({
      x: Math.round(left),
      y: Math.round(top),
      width: Math.max(minW, Math.round(right - left)),
      height: Math.max(minH, Math.round(bottom - top)),
    })
  }

  const endCropDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = cropDragRef.current
    if (!active || active.pointerId !== e.pointerId) return
    e.stopPropagation()
    cropUpdates.flush()
    cropDragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const reticleDiameterPx =
    frameWidth > 0 && sourceWidth > 0
      ? Math.max(6, (brushSize / sourceWidth) * frameWidth)
      : brushSize

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Top center bar: Original / Result tabs OR active Crop toolbar */}
      {isCropping ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold text-foreground">
              Crop image
            </span>
            {draftCropRect && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {Math.round(draftCropRect.width)} × {Math.round(draftCropRect.height)} px
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              icon={RotateCcw}
              disabled={!canResetCrop}
              onClick={onResetCrop}
              className="h-7 px-2.5 text-xs"
            >
              Reset crop
            </Button>
            <Button
              type="button"
              variant="outline"
              icon={X}
              onClick={onCancelCrop}
              className="h-7 px-2.5 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="solid"
              icon={Check}
              onClick={onApplyCrop}
              className="h-7 px-2.5 text-xs"
            >
              Apply crop
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div
            role="tablist"
            aria-label="Preview view"
            className="flex items-center gap-5"
          >
            {(
              [
                {
                  id: "original",
                  label: "Original",
                  disabled: !source || sourceLoading,
                },
                {
                  id: "result",
                  label: "Result",
                  disabled: !hasCutout || sourceLoading,
                },
              ] as const
            ).map((tab) => {
              const active = effectiveView === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={tab.disabled}
                  onClick={() => onViewModeChange(tab.id)}
                  className={cx(
                    "relative pb-1 text-xs font-medium transition-colors",
                    active
                      ? "text-foreground"
                      : tab.disabled
                        ? "cursor-not-allowed text-muted-foreground/45"
                        : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[11px] h-[2px] rounded-full bg-foreground"
                    />
                  )}
                </button>
              )
            })}
          </div>

          <span className="text-[11px] tabular-nums text-muted-foreground">
            {(source ?? dimensionSource)
              ? `${(source ?? dimensionSource)!.width} × ${(source ?? dimensionSource)!.height} px`
              : "Loading…"}
          </span>
        </div>
      )}

      {/* Stage container */}
      <div
        ref={outerRef}
        className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden p-4"
      >
        <div
          ref={frameRef}
          style={{
            width: `${frameWidth}px`,
            height: `${frameHeight}px`,
            ...(!stageSource
              ? PREVIEW_BG_STYLE.checkerboard
              : isCropping
                ? hasCutout
                  ? PREVIEW_BG_STYLE[previewBackground]
                  : { backgroundColor: "#141416" }
                : !hasCutout
                  ? { backgroundColor: "#141416" }
                  : PREVIEW_BG_STYLE[previewBackground]),
          }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={hideReticle}
          className={cx(
            "relative overflow-hidden rounded-xl border border-line shadow-sm select-none",
            canPaint ? "cursor-none touch-none" : "",
          )}
        >
          {!stageSource && (
            <div className="flex size-full flex-col items-center justify-center gap-2.5 p-6 text-center text-xs text-muted-foreground">
              {sourceLoading ? (
                <>
                  <Loader2 className="size-5 animate-spin text-foreground/80" />
                  <span>Preparing photo for background removal...</span>
                </>
              ) : (
                <span>
                  {sourceError ||
                    emptyMessage ||
                    "Click Remove background to preview the cutout."}
                </span>
              )}
            </div>
          )}

          {/* Result cutout canvas (shown in Result tab, right half of Original comparison slider, and when cropping a processed result) */}
          {stageSource && hasCutout && (!isCropping || cropSource === source) && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 size-full object-contain"
            />
          )}

          {/* Original image layer (only for pending-source crop or left-clipped in Original comparison slider) */}
          {stageSource && (
            <img
              src={stageSource.previewUrl}
              alt="Uploaded asset preview"
              draggable={false}
              style={
                showComparisonSlider
                  ? { clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }
                  : undefined
              }
              className={cx(
                "pointer-events-none absolute inset-0 size-full object-cover select-none",
                (isCropping && hasCutout) || (!isCropping && effectiveView === "result")
                  ? "hidden"
                  : "block",
              )}
            />
          )}

          {/* Interactive crop overlay */}
          {isCropping && draftCropRect && stageWidth > 0 && stageHeight > 0 && (
            <div
              role="region"
              aria-label="Crop selection"
              style={{
                left: `${(draftCropRect.x / stageWidth) * 100}%`,
                top: `${(draftCropRect.y / stageHeight) * 100}%`,
                width: `${(draftCropRect.width / stageWidth) * 100}%`,
                height: `${(draftCropRect.height / stageHeight) * 100}%`,
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.58)",
              }}
              onPointerDown={(e) => startCropDrag(e, "move")}
              onPointerMove={moveCropDrag}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
              className="absolute z-20 cursor-move touch-none border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
            >
              {/* Rule-of-thirds guides */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/30"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/30"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/30"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/30"
              />

              {/* 8 Resize handles */}
              {CROP_HANDLES.map((handle) => (
                <div
                  key={handle.id}
                  onPointerDown={(e) => startCropDrag(e, handle.id)}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                  className={cx(
                    "absolute size-3 rounded-full border border-black/60 bg-white shadow-sm",
                    handle.className,
                  )}
                />
              ))}
            </div>
          )}

          {/* Corner pills in Original comparison view & Result view */}
          {!isCropping && (effectiveView === "original" || !hasCutout) && (
            <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs">
              Original
            </span>
          )}
          {!isCropping && hasCutout && (
            <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs">
              Result
            </span>
          )}

          {/* Split slider handle (active in Original tab once cutout exists) */}
          {showComparisonSlider && (
            <div
              role="slider"
              tabIndex={0}
              aria-label="Comparison slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(splitPercent)}
              style={{ left: `${splitPercent}%` }}
              onPointerDown={handleSliderPointerDown}
              onPointerMove={handleSliderPointerMove}
              onPointerUp={handleSliderPointerUp}
              onPointerCancel={handleSliderPointerUp}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 10 : 3
                if (e.key === "ArrowLeft") {
                  e.preventDefault()
                  onSplitPercentChange(Math.max(0, splitPercent - step))
                } else if (e.key === "ArrowRight") {
                  e.preventDefault()
                  onSplitPercentChange(Math.min(100, splitPercent + step))
                }
              }}
              className="group absolute inset-y-0 z-10 w-6 -translate-x-1/2 cursor-ew-resize touch-none outline-none"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-white/90 shadow-[0_0_6px_rgba(0,0,0,0.45)]"
              />
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#121215]/90 text-white shadow-md transition-transform group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-white"
              >
                <ChevronsLeftRight className="size-3.5" strokeWidth={1.9} />
              </span>
            </div>
          )}

          {/* Circular brush reticle positioned via rAF without React re-renders */}
          {canPaint && (
            <div
              ref={brushReticleRef}
              aria-hidden="true"
              style={{
                left: 0,
                top: 0,
                opacity: 0,
                width: `${reticleDiameterPx}px`,
                height: `${reticleDiameterPx}px`,
              }}
              className={cx(
                "pointer-events-none absolute z-20 rounded-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-transform",
                brushTool === "erase"
                  ? "border-rose-300 bg-rose-400/15"
                  : "border-emerald-300 bg-emerald-400/15",
              )}
            />
          )}

          {/* Processing / model download status overlay */}
          {busy && !isCropping && (
            <div
              aria-live="polite"
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/50 p-6 text-center backdrop-blur-[2px]"
            >
              <div className="w-full max-w-[290px] rounded-xl border border-white/15 bg-[#141417]/95 p-4 text-left shadow-xl">
                <div className="flex items-center gap-2.5 text-xs font-medium text-white">
                  <Loader2 className="size-4 shrink-0 animate-spin text-white/85" />
                  <span>{progress?.stageLabel ?? "Starting local processing"}</span>
                </div>

                {progress?.hasDownloadActivity && (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-white/70">
                      <span>Model & runtime download</span>
                      <span className="tabular-nums">
                        {progress.downloadTotalBytes > 0
                          ? `${formatMb(progress.downloadLoadedBytes)} / ${formatMb(progress.downloadTotalBytes)}${
                              progress.downloadPercent !== null
                                ? ` (${progress.downloadPercent}%)`
                                : ""
                            }`
                          : formatMb(progress.downloadLoadedBytes)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                      {progress.downloadTotalBytes > 0 &&
                      progress.downloadPercent !== null ? (
                        <div
                          className="h-full rounded-full bg-white transition-[width] duration-200"
                          style={{
                            width: `${progress.downloadPercent}%`,
                          }}
                        />
                      ) : (
                        <div className="h-full w-full animate-pulse rounded-full bg-white/70" />
                      )}
                    </div>
                  </div>
                )}

                {progress &&
                  (progress.phase === "preparing" ||
                    progress.phase === "segmenting" ||
                    progress.phase === "encoding" ||
                    progress.phase === "finalizing") && (
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-white/70">
                        <span>
                          {progress.phase === "preparing"
                            ? "Image preparation"
                            : progress.phase === "encoding"
                              ? "Output encoding"
                              : progress.phase === "finalizing"
                                ? "Cutout preview"
                                : "Local segmentation"}
                        </span>
                        <span className="text-white/55">In progress</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                        <div className="h-full w-full animate-pulse rounded-full bg-emerald-400/80" />
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
