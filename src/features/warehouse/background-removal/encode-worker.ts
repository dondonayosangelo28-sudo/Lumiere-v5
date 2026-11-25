const MAX_STORAGE_DATA_URL_LENGTH = 320_000
const HARD_MAX_DATA_URL_LENGTH = 440_000

type EncodeRequest = {
  id: number
  width: number
  height: number
  rgbaBuffer: ArrayBuffer
  preserveAlpha: boolean
}

type EncodeResponse =
  | { id: number; ok: true; dataUrl: string }
  | { id: number; ok: false; error: string }

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("Could not read encoded image buffer."))
    }
    reader.onerror = () => reject(new Error("Could not read encoded image buffer."))
    reader.readAsDataURL(blob)
  })
}

function drawScaledOffscreen(
  source: OffscreenCanvas,
  maxDimension: number,
): OffscreenCanvas {
  const scale = Math.min(
    1,
    maxDimension / Math.max(1, source.width, source.height),
  )
  const target = new OffscreenCanvas(
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
  )
  const ctx = target.getContext("2d")
  if (!ctx) throw new Error("OffscreenCanvas 2D context is unavailable.")
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(source, 0, 0, target.width, target.height)
  return target
}

async function encodeInWorker(req: EncodeRequest): Promise<string> {
  const fullCanvas = new OffscreenCanvas(req.width, req.height)
  const ctx = fullCanvas.getContext("2d")
  if (!ctx) throw new Error("OffscreenCanvas 2D context is unavailable.")
  const imageData = new ImageData(
    new Uint8ClampedArray(req.rgbaBuffer),
    req.width,
    req.height,
  )
  ctx.putImageData(imageData, 0, 0)

  const maxSrcDim = Math.max(req.width, req.height)

  if (!req.preserveAlpha) {
    const scales = [...new Set([1024, 800, 640].map((dim) => Math.min(dim, maxSrcDim)))]
    const qualities = [0.85, 0.72, 0.58]
    for (const dim of scales) {
      const scaled = dim >= Math.max(req.width, req.height)
        ? fullCanvas
        : drawScaledOffscreen(fullCanvas, dim)
      for (const quality of qualities) {
        const blob = await scaled.convertToBlob({ type: "image/jpeg", quality })
        const encoded = await blobToDataUrl(blob)
        if (encoded.length <= MAX_STORAGE_DATA_URL_LENGTH) {
          return encoded
        }
      }
    }
    const fallbackBlob = await drawScaledOffscreen(fullCanvas, 512).convertToBlob({
      type: "image/jpeg",
      quality: 0.55,
    })
    const fallback = await blobToDataUrl(fallbackBlob)
    if (fallback.length > HARD_MAX_DATA_URL_LENGTH) {
      throw new Error("This image is too large to store; try a smaller copy.")
    }
    return fallback
  }

  const fullPng = await blobToDataUrl(
    await fullCanvas.convertToBlob({ type: "image/png" }),
  )
  if (fullPng.length <= 220_000) {
    return fullPng
  }

  let supportsWebp = false
  try {
    const probeBlob = await fullCanvas.convertToBlob({
      type: "image/webp",
      quality: 0.86,
    })
    const probeUrl = await blobToDataUrl(probeBlob)
    supportsWebp = probeUrl.startsWith("data:image/webp;base64,")
    if (supportsWebp && probeUrl.length <= MAX_STORAGE_DATA_URL_LENGTH) {
      return probeUrl
    }
  } catch {
    supportsWebp = false
  }

  if (supportsWebp) {
    const webpScales = [...new Set([1024, 820, 640, 480].map((dim) => Math.min(dim, maxSrcDim)))]
    const webpQualities = [0.86, 0.75, 0.64, 0.52]
    for (const dim of webpScales) {
      const scaled = dim >= Math.max(req.width, req.height)
        ? fullCanvas
        : drawScaledOffscreen(fullCanvas, dim)
      for (const quality of webpQualities) {
        if (dim === maxSrcDim && quality === 0.86) continue
        const encoded = await blobToDataUrl(
          await scaled.convertToBlob({ type: "image/webp", quality }),
        )
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
    const scaled = drawScaledOffscreen(fullCanvas, dim)
    const png = await blobToDataUrl(
      await scaled.convertToBlob({ type: "image/png" }),
    )
    if (png.length <= MAX_STORAGE_DATA_URL_LENGTH) {
      return png
    }
  }

  const smallest = supportsWebp
    ? await blobToDataUrl(
        await drawScaledOffscreen(fullCanvas, 384).convertToBlob({
          type: "image/webp",
          quality: 0.5,
        }),
      )
    : await blobToDataUrl(
        await drawScaledOffscreen(fullCanvas, 280).convertToBlob({
          type: "image/png",
        }),
      )

  if (smallest.length > HARD_MAX_DATA_URL_LENGTH) {
    throw new Error("This cutout is too large to store; try a smaller image.")
  }
  return smallest
}

self.addEventListener("message", (event: MessageEvent<EncodeRequest>) => {
  const req = event.data
  void encodeInWorker(req)
    .then((dataUrl) => {
      const response: EncodeResponse = { id: req.id, ok: true, dataUrl }
      self.postMessage(response)
    })
    .catch((err: unknown) => {
      const response: EncodeResponse = {
        id: req.id,
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Could not encode the studio image.",
      }
      self.postMessage(response)
    })
})
