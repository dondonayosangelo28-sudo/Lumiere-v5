import type { Config } from "@imgly/background-removal"

let engineModulePromise: Promise<typeof import("@imgly/background-removal")> | undefined

/** Load runtime JavaScript in parallel with photo decoding; inference stays explicit. */
export function prepareBackgroundRemovalEngine() {
  engineModulePromise ??= import("@imgly/background-removal").catch((error) => {
    engineModulePromise = undefined
    throw error
  })
  return engineModulePromise
}

const IMGLY_DATA_PUBLIC_PATH =
  "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/"

export type BackgroundRemovalErrorKind =
  | "unsupported-runtime"
  | "download"
  | "initialization"
  | "processing"

export class BackgroundRemovalError extends Error {
  readonly kind: BackgroundRemovalErrorKind
  readonly cause?: unknown

  constructor(
    kind: BackgroundRemovalErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message)
    this.name = "BackgroundRemovalError"
    this.kind = kind
    this.cause = options?.cause
  }
}

export type EngineProgressStage =
  | "downloading"
  | "initializing"
  | "preparing"
  | "segmenting"
  | "encoding"
  | "finalizing"

export type EngineProgressUpdate = {
  phase: EngineProgressStage
  downloadLoadedBytes: number
  downloadTotalBytes: number
  downloadPercent: number | null
  hasDownloadActivity: boolean
  stageLabel: string
}

export function checkRuntimeSupport(): {
  supported: boolean
  reason?: string
} {
  if (typeof window === "undefined") {
    return {
      supported: false,
      reason: "Background removal requires a browser environment.",
    }
  }
  if (typeof WebAssembly !== "object" || typeof WebAssembly.instantiate !== "function") {
    return {
      supported: false,
      reason:
        "WebAssembly is unavailable in this browser. Enable WebAssembly or use the original photo.",
    }
  }
  if (typeof createImageBitmap !== "function" || typeof ImageData !== "function") {
    return {
      supported: false,
      reason:
        "This browser lacks required canvas image APIs for local background removal.",
    }
  }
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return {
      supported: false,
      reason:
        "Object URLs are unavailable in this browser for loading the local runtime.",
    }
  }
  return { supported: true }
}

function classifyError(
  err: unknown,
  lastPhase: EngineProgressUpdate["phase"],
): BackgroundRemovalError {
  if (err instanceof BackgroundRemovalError) return err

  const rawMessage =
    err instanceof Error ? err.message : typeof err === "string" ? err : ""
  const lower = rawMessage.toLowerCase()

  if (
    lastPhase === "downloading" ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("resource metadata") ||
    lower.includes("fetch") ||
    lower.includes("cors") ||
    lower.includes("err_")
  ) {
    return new BackgroundRemovalError(
      "download",
      "Could not download the local segmentation model or ONNX runtime. Check your connection and try again.",
      { cause: err },
    )
  }

  if (
    lastPhase === "initializing" ||
    lower.includes("wasm") ||
    lower.includes("onnx") ||
    lower.includes("ort") ||
    lower.includes("webassembly") ||
    lower.includes("session") ||
    lower.includes("backend") ||
    lower.includes("init")
  ) {
    return new BackgroundRemovalError(
      "initialization",
      "The ONNX Runtime could not initialize in this browser. Retry or use the original photo.",
      { cause: err },
    )
  }

  return new BackgroundRemovalError(
    "processing",
    rawMessage ||
      "Background removal could not process this photo. Try again or use the original photo.",
    { cause: err },
  )
}

function describeComputeStage(key: string): {
  phase: EngineProgressStage
  stageLabel: string
} {
  if (key === "compute:decode") {
    return { phase: "preparing", stageLabel: "Preparing image" }
  }
  if (key === "compute:inference") {
    return { phase: "segmenting", stageLabel: "Segmenting subject" }
  }
  if (key === "compute:mask") {
    return { phase: "segmenting", stageLabel: "Refining alpha mask" }
  }
  if (key === "compute:encode") {
    return { phase: "encoding", stageLabel: "Encoding cutout" }
  }
  return { phase: "segmenting", stageLabel: "Processing cutout" }
}

export function createEngineProgressTracker() {
  const downloads = new Map<string, { loaded: number; total: number }>()

  const summarizeDownloads = () => {
    let loadedSum = 0
    let totalSum = 0
    let allTotalsKnown = downloads.size > 0
    for (const entry of downloads.values()) {
      loadedSum += entry.loaded
      if (entry.total > 0) {
        totalSum += entry.total
      } else {
        allTotalsKnown = false
      }
    }
    const hasDownloadActivity =
      downloads.size > 0 && (loadedSum > 0 || totalSum > 0)
    const downloadTotalBytes = allTotalsKnown ? totalSum : 0
    const downloadPercent =
      allTotalsKnown && totalSum > 0
        ? Math.min(100, Math.round((loadedSum / totalSum) * 100))
        : null
    return {
      downloadLoadedBytes: loadedSum,
      downloadTotalBytes,
      downloadPercent,
      hasDownloadActivity,
    }
  }

  return (
    key: string,
    current: number,
    total: number,
  ): EngineProgressUpdate | null => {
    if (key.startsWith("fetch:")) {
      const prev = downloads.get(key)
      const safeLoaded = Math.max(prev?.loaded ?? 0, current || 0)
      const reportedTotal = total > 0 ? Math.max(total, safeLoaded) : 0
      const safeTotal =
        reportedTotal > 0
          ? Math.max(prev?.total ?? 0, reportedTotal)
          : (prev?.total ?? 0)
      downloads.set(key, { loaded: safeLoaded, total: safeTotal })

      const summary = summarizeDownloads()
      const phase: EngineProgressStage =
        summary.downloadTotalBytes > 0 &&
        summary.downloadLoadedBytes >= summary.downloadTotalBytes
          ? "initializing"
          : "downloading"

      return {
        phase,
        ...summary,
        stageLabel:
          phase === "downloading"
            ? key.includes("onnxruntime")
              ? "Downloading ONNX Runtime WASM"
              : "Downloading IS-Net model weights"
            : "Initializing ONNX Runtime session",
      }
    }

    if (key.startsWith("compute:")) {
      const { phase, stageLabel } = describeComputeStage(key)
      const summary = summarizeDownloads()
      return {
        phase,
        ...summary,
        stageLabel,
      }
    }

    return null
  }
}

export async function runLocalBackgroundRemoval(
  sourceBlob: Blob,
  options?: {
    attempt?: number
    onProgress?: (update: EngineProgressUpdate) => void
  },
): Promise<Blob> {
  const support = checkRuntimeSupport()
  if (!support.supported) {
    throw new BackgroundRemovalError(
      "unsupported-runtime",
      support.reason ?? "This browser does not support local background removal.",
    )
  }

  const attempt = options?.attempt ?? 0
  const publicPath =
    attempt > 0
      ? `${IMGLY_DATA_PUBLIC_PATH}?retry=${attempt}`
      : IMGLY_DATA_PUBLIC_PATH

  let lastPhase: EngineProgressUpdate["phase"] = "initializing"
  const trackProgress = createEngineProgressTracker()

  const emit = (update: EngineProgressUpdate) => {
    lastPhase = update.phase
    options?.onProgress?.(update)
  }

  emit({
    phase: "initializing",
    downloadLoadedBytes: 0,
    downloadTotalBytes: 0,
    downloadPercent: null,
    hasDownloadActivity: false,
    stageLabel: "Loading background-removal engine",
  })

  try {
    const { removeBackground } = await prepareBackgroundRemovalEngine()

    const config: Config = {
      publicPath,
      model: "isnet_quint8",
      device: "cpu",
      output: {
        format: "image/png",
        quality: 1,
      },
      progress: (key, current, total) => {
        const update = trackProgress(key, current, total)
        if (update) {
          emit(update)
        }
      },
    }

    const resultBlob = await removeBackground(sourceBlob, config)
    return resultBlob
  } catch (err) {
    throw classifyError(err, lastPhase)
  }
}
