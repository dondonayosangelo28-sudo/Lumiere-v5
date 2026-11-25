export const MAX_ASSET_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_WORKING_DIMENSION = 1024
const MAX_STORAGE_DATA_URL_LENGTH = 320_000
const HARD_MAX_DATA_URL_LENGTH = 440_000

export type CropRect = {
  x: number
  y: number
  width: number
  height: number
}

export type AlphaTrimBounds = CropRect

/**
 * Finds the tight bounding box of visible pixels (alpha >= threshold) while ignoring
 * isolated stray residual specks (< 3 visible pixels in a 5x5 neighborhood) so
 * single stray pixels do not distort framing. Preserves connected stems and fine
 * details, falls back to raw bounds if needed, and adds a proportional safety margin.
 * Returns null when the cutout is completely transparent.
 */
export function computeAlphaTrimBounds(
  alphaMask: Uint8ClampedArray,
  width: number,
  height: number,
  options?: {
    alphaThreshold?: number
    marginRatio?: number
    minMarginPx?: number
  },
): AlphaTrimBounds | null {
  if (width <= 0 || height <= 0 || alphaMask.length < width * height) {
    return null
  }
  const threshold = options?.alphaThreshold ?? 6
  const marginRatio = options?.marginRatio ?? 0.025
  const minMarginPx = options?.minMarginPx ?? 4

  let rawMinX = width
  let rawMinY = height
  let rawMaxX = -1
  let rawMaxY = -1

  let supMinX = width
  let supMinY = height
  let supMaxX = -1
  let supMaxY = -1

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    for (let x = 0; x < width; x++) {
      if (alphaMask[rowOffset + x] < threshold) continue

      if (x < rawMinX) rawMinX = x
      if (x > rawMaxX) rawMaxX = x
      if (y < rawMinY) rawMinY = y
      if (y > rawMaxY) rawMaxY = y

      // Count visible neighbors in 5x5 window; stems/petals have >= 3, isolated specks have 1-2.
      let neighbors = 0
      const ny0 = Math.max(0, y - 2)
      const ny1 = Math.min(height - 1, y + 2)
      const nx0 = Math.max(0, x - 2)
      const nx1 = Math.min(width - 1, x + 2)
      for (let ny = ny0; ny <= ny1 && neighbors < 3; ny++) {
        const nRow = ny * width
        for (let nx = nx0; nx <= nx1; nx++) {
          if (alphaMask[nRow + nx] >= threshold) {
            neighbors++
            if (neighbors >= 3) break
          }
        }
      }

      if (neighbors >= 3) {
        if (x < supMinX) supMinX = x
        if (x > supMaxX) supMaxX = x
        if (y < supMinY) supMinY = y
        if (y > supMaxY) supMaxY = y
      }
    }
  }

  if (rawMaxX < rawMinX || rawMaxY < rawMinY) {
    return null
  }

  const useSupported = supMaxX >= supMinX && supMaxY >= supMinY
  const minX = useSupported ? supMinX : rawMinX
  const maxX = useSupported ? supMaxX : rawMaxX
  const minY = useSupported ? supMinY : rawMinY
  const maxY = useSupported ? supMaxY : rawMaxY

  const contentW = maxX - minX + 1
  const contentH = maxY - minY + 1
  const margin = Math.max(
    minMarginPx,
    Math.round(Math.max(contentW, contentH) * marginRatio),
  )

  const x = Math.max(0, minX - margin)
  const y = Math.max(0, minY - margin)
  const right = Math.min(width, maxX + 1 + margin)
  const bottom = Math.min(height, maxY + 1 + margin)

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  }
}

export type StudioSource = {
  name: string
  width: number
  height: number
  originalData: ImageData
  originalAlpha: Uint8ClampedArray
  previewUrl: string
  workingBlob: Blob
  hasAlpha: boolean
}

export function isCutoutImage(src?: string): boolean {
  if (!src) return false
  return (
    src.includes("/cutouts/") ||
    src.startsWith("data:image/png;base64,") ||
    src.startsWith("data:image/webp;base64,")
  )
}

const KNOWN_IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|svg|ico|tiff?)$/i

export function validateAssetPhotoFile(file: File): void {
  if (file.size === 0) {
    throw new Error("The selected image file is empty.")
  }
  if (file.size > MAX_ASSET_PHOTO_BYTES) {
    throw new Error("The maximum file size is 5 MB.")
  }
  const hasImageMime = file.type.startsWith("image/")
  const hasImageExt = file.type === "" && KNOWN_IMAGE_EXT.test(file.name)
  if (!hasImageMime && !hasImageExt) {
    throw new Error(
      "Unsupported file format. Please choose a valid image file.",
    )
  }
}

async function decodeViaImageElement(
  source: Blob,
  maxDimension: number,
): Promise<HTMLCanvasElement> {
  const objectUrl = URL.createObjectURL(source)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () =>
        reject(
          new Error(
            "Unsupported or corrupted image format. Please choose a different image.",
          ),
        )
      el.src = objectUrl
    })
    const naturalW = img.naturalWidth || img.width
    const naturalH = img.naturalHeight || img.height
    if (naturalW <= 0 || naturalH <= 0) {
      throw new Error(
        "This image could not be decoded. Please choose a different image.",
      )
    }
    const scale = Math.min(1, maxDimension / Math.max(naturalW, naturalH))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(naturalW * scale))
    canvas.height = Math.max(1, Math.round(naturalH * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas 2D context is unavailable.")
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function decodeToCanvas(
  source: Blob,
  maxDimension: number,
): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source)
      try {
        if (bitmap.width > 0 && bitmap.height > 0) {
          const scale = Math.min(
            1,
            maxDimension / Math.max(1, bitmap.width, bitmap.height),
          )
          const canvas = document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(bitmap.width * scale))
          canvas.height = Math.max(1, Math.round(bitmap.height * scale))
          const ctx = canvas.getContext("2d")
          if (!ctx) throw new Error("Canvas 2D context is unavailable.")
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          return canvas
        }
      } finally {
        bitmap.close()
      }
    } catch {
      // Fall back to HTMLImageElement decoding (e.g. SVG or codecs unsupported by createImageBitmap).
    }
  }

  return decodeViaImageElement(source, maxDimension)
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Could not prepare the image buffer."))
    }, type)
  })
}

async function buildStudioSourceFromCanvas(
  name: string,
  canvas: HTMLCanvasElement,
): Promise<StudioSource> {
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context is unavailable.")

  const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixelCount = canvas.width * canvas.height
  const originalAlpha = new Uint8ClampedArray(pixelCount)
  let hasAlpha = false
  for (let i = 0; i < pixelCount; i++) {
    const alpha = originalData.data[i * 4 + 3]
    originalAlpha[i] = alpha
    if (alpha < 250) {
      hasAlpha = true
    }
  }

  const workingBlob = await canvasToBlob(canvas, "image/png")
  // Reuse the PNG already encoded for inference instead of encoding the canvas
  // a second time synchronously. Keep a data URL so retained studio snapshots
  // remain valid after closing and reopening the modal.
  const previewUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("Could not prepare the image preview."))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the image preview."))
    reader.onabort = () => reject(new Error("Image preview preparation was aborted."))
    reader.readAsDataURL(workingBlob)
  })

  return {
    name,
    width: canvas.width,
    height: canvas.height,
    originalData,
    originalAlpha,
    previewUrl,
    workingBlob,
    hasAlpha,
  }
}

const sourceLoads = new WeakMap<File, Promise<StudioSource>>()
const urlSourceLoads = new Map<string, Promise<StudioSource>>()
const MAX_URL_SOURCE_CACHE = 4

export function loadStudioSource(file: File): Promise<StudioSource> {
  const existing = sourceLoads.get(file)
  if (existing) return existing
  const pending = (async () => {
    validateAssetPhotoFile(file)
    const canvas = await decodeToCanvas(file, MAX_WORKING_DIMENSION)
    return buildStudioSourceFromCanvas(file.name, canvas)
  })().catch((error) => {
    sourceLoads.delete(file)
    throw error
  })
  sourceLoads.set(file, pending)
  return pending
}

export function loadStudioSourceFromUrl(imageSrc: string): Promise<StudioSource> {
  const existing = urlSourceLoads.get(imageSrc)
  if (existing) return existing
  if (urlSourceLoads.size >= MAX_URL_SOURCE_CACHE) {
    const oldestKey = urlSourceLoads.keys().next().value
    if (oldestKey !== undefined) {
      urlSourceLoads.delete(oldestKey)
    }
  }
  const pending = (async () => {
    const res = await fetch(imageSrc)
    const blob = await res.blob()
    const ext = blob.type.includes("png") ? "png" : "jpg"
    const file = new File([blob], `asset-photo.${ext}`, {
      type: blob.type || "image/png",
    })
    validateAssetPhotoFile(file)
    const canvas = await decodeToCanvas(file, MAX_WORKING_DIMENSION)
    return buildStudioSourceFromCanvas(file.name, canvas)
  })().catch((error) => {
    urlSourceLoads.delete(imageSrc)
    throw error
  })
  urlSourceLoads.set(imageSrc, pending)
  return pending
}

export function clampCropRect(
  rect: CropRect,
  sourceWidth: number,
  sourceHeight: number,
): CropRect {
  const safeW = Math.max(1, sourceWidth)
  const safeH = Math.max(1, sourceHeight)
  const x = Math.max(0, Math.min(safeW - 1, Math.round(rect.x)))
  const y = Math.max(0, Math.min(safeH - 1, Math.round(rect.y)))
  const width = Math.max(1, Math.min(safeW - x, Math.round(rect.width)))
  const height = Math.max(1, Math.min(safeH - y, Math.round(rect.height)))
  return { x, y, width, height }
}

export function cropAlphaMask(
  mask: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  rect: CropRect,
): Uint8ClampedArray {
  const clamped = clampCropRect(rect, sourceWidth, sourceHeight)
  const out = new Uint8ClampedArray(clamped.width * clamped.height)
  for (let row = 0; row < clamped.height; row++) {
    const srcStart = (clamped.y + row) * sourceWidth + clamped.x
    out.set(
      mask.subarray(srcStart, srcStart + clamped.width),
      row * clamped.width,
    )
  }
  return out
}

export function cropStudioResultMasks(params: {
  sourceWidth: number
  sourceHeight: number
  rect: CropRect
  autoMask: Uint8ClampedArray
  history: Uint8ClampedArray[]
}): {
  rect: CropRect
  autoMask: Uint8ClampedArray
  history: Uint8ClampedArray[]
} {
  const rect = clampCropRect(
    params.rect,
    params.sourceWidth,
    params.sourceHeight,
  )
  return {
    rect,
    autoMask: cropAlphaMask(
      params.autoMask,
      params.sourceWidth,
      params.sourceHeight,
      rect,
    ),
    history: params.history.map((entry) =>
      cropAlphaMask(entry, params.sourceWidth, params.sourceHeight, rect),
    ),
  }
}

export async function cropStudioSource(
  base: StudioSource,
  rect: CropRect,
): Promise<StudioSource> {
  const { x, y, width, height } = clampCropRect(rect, base.width, base.height)

  const srcCanvas = document.createElement("canvas")
  srcCanvas.width = base.width
  srcCanvas.height = base.height
  const srcCtx = srcCanvas.getContext("2d")
  if (!srcCtx) throw new Error("Canvas 2D context is unavailable.")
  srcCtx.putImageData(base.originalData, 0, 0)

  const outCanvas = document.createElement("canvas")
  outCanvas.width = width
  outCanvas.height = height
  const outCtx = outCanvas.getContext("2d")
  if (!outCtx) throw new Error("Canvas 2D context is unavailable.")
  outCtx.drawImage(srcCanvas, x, y, width, height, 0, 0, width, height)

  return buildStudioSourceFromCanvas(base.name, outCanvas)
}

export async function extractAlphaMaskFromCutoutBlob(
  blob: Blob,
  expectedWidth: number,
  expectedHeight: number,
): Promise<Uint8ClampedArray> {
  const canvas = await decodeToCanvas(
    blob,
    Math.max(expectedWidth, expectedHeight, MAX_WORKING_DIMENSION),
  )
  const workingCanvas = document.createElement("canvas")
  workingCanvas.width = expectedWidth
  workingCanvas.height = expectedHeight
  const ctx = workingCanvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context is unavailable.")
  ctx.clearRect(0, 0, expectedWidth, expectedHeight)
  ctx.drawImage(canvas, 0, 0, expectedWidth, expectedHeight)
  const { data } = ctx.getImageData(0, 0, expectedWidth, expectedHeight)
  const pixelCount = expectedWidth * expectedHeight
  const alpha = new Uint8ClampedArray(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    alpha[i] = data[i * 4 + 3]
  }
  return alpha
}

export function renderCutoutToCanvas(
  canvas: HTMLCanvasElement,
  originalData: ImageData,
  alphaMask: Uint8ClampedArray,
  scratchImageData?: ImageData,
): ImageData {
  const { width, height } = originalData
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context is unavailable.")

  const output =
    scratchImageData &&
    scratchImageData.width === width &&
    scratchImageData.height === height
      ? scratchImageData
      : ctx.createImageData(width, height)

  output.data.set(originalData.data)
  const pixelCount = width * height
  for (let i = 0; i < pixelCount; i++) {
    output.data[i * 4 + 3] = alphaMask[i]
  }
  ctx.putImageData(output, 0, 0)
  return output
}

export function paintBrushStroke({
  alphaMask,
  originalAlpha,
  width,
  height,
  x0,
  y0,
  x1,
  y1,
  radius,
  mode,
}: {
  alphaMask: Uint8ClampedArray
  originalAlpha: Uint8ClampedArray
  width: number
  height: number
  x0: number
  y0: number
  x1: number
  y1: number
  radius: number
  mode: "erase" | "restore"
}): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const r = Math.max(2, radius)
  const rSq = r * r
  const softStart = r * 0.72
  const softRange = Math.max(1, r - softStart)

  const dx = x1 - x0
  const dy = y1 - y0
  const dist = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(dist / Math.max(1.5, r * 0.25)))

  let dirtyMinX = width
  let dirtyMinY = height
  let dirtyMaxX = -1
  let dirtyMaxY = -1

  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps
    const cx = x0 + dx * t
    const cy = y0 + dy * t

    const minX = Math.max(0, Math.floor(cx - r))
    const maxX = Math.min(width - 1, Math.ceil(cx + r))
    const minY = Math.max(0, Math.floor(cy - r))
    const maxY = Math.min(height - 1, Math.ceil(cy + r))

    for (let y = minY; y <= maxY; y++) {
      const oy = y - cy
      const rowOffset = y * width
      for (let x = minX; x <= maxX; x++) {
        const ox = x - cx
        const dSq = ox * ox + oy * oy
        if (dSq > rSq) continue

        const d = Math.sqrt(dSq)
        const strength =
          d <= softStart ? 1 : Math.max(0, 1 - (d - softStart) / softRange)
        if (strength <= 0) continue

        const idx = rowOffset + x
        const current = alphaMask[idx]
        const target = mode === "erase" ? 0 : originalAlpha[idx]
        const next =
          mode === "erase"
            ? Math.min(current, Math.round(current * (1 - strength)))
            : Math.max(
                current,
                Math.round(current + (target - current) * strength),
              )

        if (next !== current) {
          alphaMask[idx] = next
          if (x < dirtyMinX) dirtyMinX = x
          if (y < dirtyMinY) dirtyMinY = y
          if (x > dirtyMaxX) dirtyMaxX = x
          if (y > dirtyMaxY) dirtyMaxY = y
        }
      }
    }
  }

  if (dirtyMaxX < dirtyMinX || dirtyMaxY < dirtyMinY) return null
  return {
    minX: dirtyMinX,
    minY: dirtyMinY,
    maxX: dirtyMaxX,
    maxY: dirtyMaxY,
  }
}

function drawScaledCanvas(
  sourceCanvas: HTMLCanvasElement,
  maxDimension: number,
): HTMLCanvasElement {
  const scale = Math.min(
    1,
    maxDimension / Math.max(1, sourceCanvas.width, sourceCanvas.height),
  )
  const target = document.createElement("canvas")
  target.width = Math.max(1, Math.round(sourceCanvas.width * scale))
  target.height = Math.max(1, Math.round(sourceCanvas.height * scale))
  const ctx = target.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context is unavailable.")
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(sourceCanvas, 0, 0, target.width, target.height)
  return target
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function canvasToDataUrlAsync(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode the image."))
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result)
          else reject(new Error("Could not read encoded image data."))
        }
        reader.onerror = () =>
          reject(new Error("Could not read encoded image data."))
        reader.readAsDataURL(blob)
      },
      type,
      quality,
    )
  })
}

let sharedEncodeWorker: Worker | null = null
let workerInitFailed = false
let nextWorkerJobId = 1

function getEncodeWorker(): Worker | null {
  if (
    workerInitFailed ||
    typeof Worker === "undefined" ||
    typeof OffscreenCanvas === "undefined"
  ) {
    return null
  }
  if (!sharedEncodeWorker) {
    try {
      sharedEncodeWorker = new Worker(
        new URL("./encode-worker.ts", import.meta.url),
        { type: "module" },
      )
    } catch {
      workerInitFailed = true
      return null
    }
  }
  return sharedEncodeWorker
}

function runWorkerEncode({
  width,
  height,
  rgba,
  preserveAlpha,
  signal,
}: {
  width: number
  height: number
  rgba: Uint8ClampedArray
  preserveAlpha: boolean
  signal?: AbortSignal
}): Promise<string> | null {
  const worker = getEncodeWorker()
  if (!worker) return null

  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Encoding cancelled.", "AbortError"))
      return
    }
    const id = nextWorkerJobId++
    const cleanup = () => {
      worker.removeEventListener("message", onMessage)
      worker.removeEventListener("error", onError)
      signal?.removeEventListener("abort", onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException("Encoding cancelled.", "AbortError"))
    }
    const onMessage = (
      event: MessageEvent<
        | { id: number; ok: true; dataUrl: string }
        | { id: number; ok: false; error: string }
      >,
    ) => {
      if (!event.data || event.data.id !== id) return
      cleanup()
      if (event.data.ok) resolve(event.data.dataUrl)
      else reject(new Error(event.data.error))
    }
    const onError = () => {
      cleanup()
      workerInitFailed = true
      sharedEncodeWorker?.terminate()
      sharedEncodeWorker = null
      reject(new Error("Worker encoding failed."))
    }

    worker.addEventListener("message", onMessage)
    worker.addEventListener("error", onError)
    signal?.addEventListener("abort", onAbort, { once: true })

    const buffer = rgba.buffer.slice(0)
    worker.postMessage(
      { id, width, height, rgbaBuffer: buffer, preserveAlpha },
      [buffer],
    )
  })
}

async function encodeFallbackAsync({
  width,
  height,
  rgba,
  preserveAlpha,
  signal,
}: {
  width: number
  height: number
  rgba: Uint8ClampedArray
  preserveAlpha: boolean
  signal?: AbortSignal
}): Promise<string> {
  const checkAbort = () => {
    if (signal?.aborted) {
      throw new DOMException("Encoding cancelled.", "AbortError")
    }
  }

  checkAbort()
  const fullCanvas = document.createElement("canvas")
  fullCanvas.width = width
  fullCanvas.height = height
  const fullCtx = fullCanvas.getContext("2d")
  if (!fullCtx) throw new Error("Canvas 2D context is unavailable.")
  fullCtx.putImageData(
    new ImageData(new Uint8ClampedArray(rgba), width, height),
    0,
    0,
  )
  const maxSrcDim = Math.max(width, height)

  if (!preserveAlpha) {
    const scales = [...new Set([1024, 800, 640].map((dim) => Math.min(dim, maxSrcDim)))]
    const qualities = [0.85, 0.72, 0.58]
    for (const dim of scales) {
      const scaled =
        dim >= maxSrcDim ? fullCanvas : drawScaledCanvas(fullCanvas, dim)
      for (const quality of qualities) {
        checkAbort()
        await yieldToMain()
        checkAbort()
        const encoded = await canvasToDataUrlAsync(scaled, "image/jpeg", quality)
        if (encoded.length <= MAX_STORAGE_DATA_URL_LENGTH) {
          return encoded
        }
      }
    }
    checkAbort()
    const fallback = await canvasToDataUrlAsync(
      drawScaledCanvas(fullCanvas, 512),
      "image/jpeg",
      0.55,
    )
    if (fallback.length > HARD_MAX_DATA_URL_LENGTH) {
      throw new Error("This image is too large to store; try a smaller copy.")
    }
    return fallback
  }

  checkAbort()
  const fullPng = await canvasToDataUrlAsync(fullCanvas, "image/png")
  if (fullPng.length <= 220_000) {
    return fullPng
  }

  checkAbort()
  await yieldToMain()
  checkAbort()

  const probeUrl = await canvasToDataUrlAsync(fullCanvas, "image/webp", 0.86)
  const supportsWebp = probeUrl.startsWith("data:image/webp;base64,")
  if (supportsWebp && probeUrl.length <= MAX_STORAGE_DATA_URL_LENGTH) {
    return probeUrl
  }

  if (supportsWebp) {
    const webpScales = [...new Set([1024, 820, 640, 480].map((dim) => Math.min(dim, maxSrcDim)))]
    const webpQualities = [0.86, 0.75, 0.64, 0.52]
    for (const dim of webpScales) {
      const scaled =
        dim >= maxSrcDim ? fullCanvas : drawScaledCanvas(fullCanvas, dim)
      for (const quality of webpQualities) {
        if (dim === maxSrcDim && quality === 0.86) continue
        checkAbort()
        await yieldToMain()
        checkAbort()
        const encoded = await canvasToDataUrlAsync(scaled, "image/webp", quality)
        if (
          encoded.startsWith("data:image/webp;base64,") &&
          encoded.length <= MAX_STORAGE_DATA_URL_LENGTH
        ) {
          return encoded
        }
      }
    }
  }

  for (const dim of new Set([720, 560, 440, 320].map((size) => Math.min(size, maxSrcDim)))) {
    checkAbort()
    await yieldToMain()
    checkAbort()
    const png = await canvasToDataUrlAsync(
      drawScaledCanvas(fullCanvas, dim),
      "image/png",
    )
    if (png.length <= MAX_STORAGE_DATA_URL_LENGTH) {
      return png
    }
  }

  checkAbort()
  const smallest = supportsWebp
    ? await canvasToDataUrlAsync(
        drawScaledCanvas(fullCanvas, 384),
        "image/webp",
        0.5,
      )
    : await canvasToDataUrlAsync(
        drawScaledCanvas(fullCanvas, 280),
        "image/png",
      )

  if (smallest.length > HARD_MAX_DATA_URL_LENGTH) {
    throw new Error("This cutout is too large to store; try a smaller image.")
  }
  return smallest
}

function extractRgbaBuffer({
  originalData,
  alphaMask,
  bounds,
}: {
  originalData: ImageData
  alphaMask: Uint8ClampedArray
  bounds: AlphaTrimBounds
}): Uint8ClampedArray<ArrayBuffer> {
  const srcWidth = originalData.width
  const srcRgba = originalData.data
  const out = new Uint8ClampedArray(bounds.width * bounds.height * 4)

  for (let row = 0; row < bounds.height; row++) {
    const srcY = bounds.y + row
    const srcRowPx = srcY * srcWidth + bounds.x
    const dstRowPx = row * bounds.width
    for (let col = 0; col < bounds.width; col++) {
      const srcPx = srcRowPx + col
      const srcByte = srcPx * 4
      const dstByte = (dstRowPx + col) * 4
      out[dstByte] = srcRgba[srcByte]
      out[dstByte + 1] = srcRgba[srcByte + 1]
      out[dstByte + 2] = srcRgba[srcByte + 2]
      out[dstByte + 3] = alphaMask[srcPx]
    }
  }
  return out
}

export function createTrimmedPreviewUrl(
  originalData: ImageData,
  alphaMask: Uint8ClampedArray,
): string {
  const bounds = computeAlphaTrimBounds(
    alphaMask,
    originalData.width,
    originalData.height,
  )
  if (!bounds) {
    throw new Error(
      "The cutout is completely transparent. Use Restore or Undo before continuing.",
    )
  }
  const rgba = extractRgbaBuffer({ originalData, alphaMask, bounds })
  const canvas = document.createElement("canvas")
  canvas.width = bounds.width
  canvas.height = bounds.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context is unavailable.")
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(rgba), bounds.width, bounds.height),
    0,
    0,
  )
  return canvas.toDataURL("image/png")
}

const trimmedPreviews = new WeakMap<ImageData, WeakMap<Uint8ClampedArray, Promise<string>>>()

export function createTrimmedPreviewUrlAsync(
  originalData: ImageData,
  alphaMask: Uint8ClampedArray,
): Promise<string> {
  let byMask = trimmedPreviews.get(originalData)
  if (!byMask) {
    byMask = new WeakMap()
    trimmedPreviews.set(originalData, byMask)
  }
  const cached = byMask.get(alphaMask)
  if (cached) return cached
  const preview = (async () => {
    await yieldToMain()
    const bounds = computeAlphaTrimBounds(alphaMask, originalData.width, originalData.height)
    if (!bounds) throw new Error("The cutout is completely transparent. Use Restore or Undo before continuing.")
    const rgba = extractRgbaBuffer({ originalData, alphaMask, bounds })
    const canvas = document.createElement("canvas")
    canvas.width = bounds.width
    canvas.height = bounds.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas 2D context is unavailable.")
    ctx.putImageData(new ImageData(rgba, bounds.width, bounds.height), 0, 0)
    return canvasToDataUrlAsync(canvas, "image/png")
  })().catch((error) => {
    byMask!.delete(alphaMask)
    throw error
  })
  byMask.set(alphaMask, preview)
  return preview
}

/**
 * Asynchronously trims excess transparent margins (for cutouts) and compresses
 * the image into a compact data URL suitable for localStorage persistence
 * without flattening transparency.
 */
export async function encodeStudioOutputDataUrlAsync({
  originalData,
  alphaMask,
  preserveAlpha,
  signal,
}: {
  originalData: ImageData
  alphaMask: Uint8ClampedArray
  preserveAlpha: boolean
  signal?: AbortSignal
}): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException("Encoding cancelled.", "AbortError")
  }

  const bounds: AlphaTrimBounds = preserveAlpha
    ? (() => {
        const computed = computeAlphaTrimBounds(
          alphaMask,
          originalData.width,
          originalData.height,
        )
        if (!computed) {
          throw new Error(
            "The cutout is completely transparent. Use Restore or Undo before saving.",
          )
        }
        return computed
      })()
    : {
        x: 0,
        y: 0,
        width: originalData.width,
        height: originalData.height,
      }

  const rgba = extractRgbaBuffer({ originalData, alphaMask, bounds })

  const workerPromise = runWorkerEncode({
    width: bounds.width,
    height: bounds.height,
    rgba,
    preserveAlpha,
    signal,
  })
  if (workerPromise) {
    try {
      return await workerPromise
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err
      }
      // Fall back to main-thread async encoding if worker fails.
    }
  }

  return encodeFallbackAsync({
    width: bounds.width,
    height: bounds.height,
    rgba,
    preserveAlpha,
    signal,
  })
}
