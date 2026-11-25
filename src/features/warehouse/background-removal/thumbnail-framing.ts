export type ThumbnailFraming = {
  zoom: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_THUMBNAIL_FRAMING: ThumbnailFraming = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
}

export const MIN_THUMBNAIL_ZOOM = 1
export const MAX_THUMBNAIL_ZOOM = 3

/**
 * Returns the maximum safe percentage pan offset for a given zoom level so the
 * asset remains clearly visible inside the 4:3 card frame.
 */
export function maxThumbnailOffsetForZoom(zoom: number): number {
  const safeZoom = Math.min(MAX_THUMBNAIL_ZOOM, Math.max(MIN_THUMBNAIL_ZOOM, zoom))
  return Math.min(45, Math.round((15 + (safeZoom - 1) * 25) * 10) / 10)
}

export function clampThumbnailFraming(
  input: Partial<ThumbnailFraming> | null | undefined,
): ThumbnailFraming {
  const rawZoom = Number(input?.zoom)
  const zoom = Number.isFinite(rawZoom)
    ? Math.round(
        Math.min(MAX_THUMBNAIL_ZOOM, Math.max(MIN_THUMBNAIL_ZOOM, rawZoom)) * 100,
      ) / 100
    : DEFAULT_THUMBNAIL_FRAMING.zoom

  const maxOffset = maxThumbnailOffsetForZoom(zoom)
  const rawX = Number(input?.offsetX)
  const rawY = Number(input?.offsetY)

  const offsetX = Number.isFinite(rawX)
    ? Math.round(Math.min(maxOffset, Math.max(-maxOffset, rawX)) * 10) / 10
    : 0
  const offsetY = Number.isFinite(rawY)
    ? Math.round(Math.min(maxOffset, Math.max(-maxOffset, rawY)) * 10) / 10
    : 0

  return { zoom, offsetX, offsetY }
}

/**
 * Normalizes thumbnail framing metadata for storage. Returns undefined when framing
 * matches the default fit so legacy/default assets store no redundant metadata.
 */
export function normalizeThumbnailFraming(
  input: Partial<ThumbnailFraming> | null | undefined,
): ThumbnailFraming | undefined {
  if (!input || typeof input !== "object") return undefined
  const clamped = clampThumbnailFraming(input)
  if (
    clamped.zoom === DEFAULT_THUMBNAIL_FRAMING.zoom &&
    clamped.offsetX === DEFAULT_THUMBNAIL_FRAMING.offsetX &&
    clamped.offsetY === DEFAULT_THUMBNAIL_FRAMING.offsetY
  ) {
    return undefined
  }
  return clamped
}
