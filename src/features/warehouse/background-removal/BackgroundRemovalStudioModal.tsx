import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFrameCallback } from "./useFrameCallback"
import {
  AlertCircle,
  Crop,
  Eraser,
  Frame,
  ImagePlus,
  Loader2,
  Paintbrush,
  Redo2,
  RotateCcw,
  Sparkles,
  Undo2,
  X,
} from "lucide-react"
import OverlayLayer from "@/components/overlay/OverlayLayer"
import { Button, IconButton, cx } from "@/components/ui/ui"
import {
  BackgroundRemovalError,
  type EngineProgressUpdate,
  checkRuntimeSupport,
  prepareBackgroundRemovalEngine,
  runLocalBackgroundRemoval,
} from "./background-removal-engine"
import {
  type BrushTool,
  ComparisonCanvasStage,
  type PreviewBackground,
  type PreviewViewMode,
} from "./ComparisonCanvasStage"
import {
  type CropRect,
  type StudioSource,
  clampCropRect,
  createTrimmedPreviewUrlAsync,
  cropStudioSource,
  encodeStudioOutputDataUrlAsync,
  extractAlphaMaskFromCutoutBlob,
  loadStudioSource,
  loadStudioSourceFromUrl,
  validateAssetPhotoFile,
} from "./studio-image"
import {
  type StudioOpenIntent,
  type StudioResultState,
  type StudioSnapshot,
  applyCroppedResultStateAsync,
  createResultStateFromDecodedSource,
  isStaleRun,
  resetCroppedResultState,
  shouldAutoRemoveOnOpen,
} from "./studio-session"
import { ThumbnailFramingStage } from "./ThumbnailFramingStage"
import {
  DEFAULT_THUMBNAIL_FRAMING,
  type ThumbnailFraming,
  normalizeThumbnailFraming,
} from "./thumbnail-framing"

type Props = {
  initialFile?: File
  reopenData?: {
    imageSrc: string
    framing?: ThumbnailFraming
    snapshot?: StudioSnapshot | null
  }
  assetName?: string
  onApply: (result: {
    dataUrl: string
    framing?: ThumbnailFraming
    snapshot: StudioSnapshot
  }) => void
  onCancel: () => void
}

const MAX_HISTORY_ENTRIES = 25

function masksEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function fullCropRect(source: StudioSource): CropRect {
  return { x: 0, y: 0, width: source.width, height: source.height }
}

function cropRectsEqual(a: CropRect, b: CropRect): boolean {
  return (
    Math.round(a.x) === Math.round(b.x) &&
    Math.round(a.y) === Math.round(b.y) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  )
}

export default function BackgroundRemovalStudioModal({
  initialFile,
  reopenData,
  assetName = "",
  onApply,
  onCancel,
}: Props) {
  const initialSnap = reopenData?.snapshot ?? null
  const panelRef = useRef<HTMLDivElement>(null)
  const changeFileInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  const sourceIdRef = useRef(initialSnap ? 1 : 0)
  const runIdRef = useRef(0)
  const applyRunIdRef = useRef(0)
  const applyAbortRef = useRef<AbortController | null>(null)
  const restoredSnapshotRef = useRef<StudioSnapshot | null>(initialSnap)
  const encodedCacheRef = useRef<{
    source: StudioSource
    mask: Uint8ClampedArray
    dataUrl: string
  } | null>(initialSnap?.encoded ?? null)
  const attemptCountRef = useRef(0)
  const activeRunPromiseRef = useRef<Promise<void>>(Promise.resolve())
  const activeSourceUrlRef = useRef<string | null>(null)

  const [pendingSourceId, setPendingSourceId] = useState(initialSnap ? 1 : 0)
  const [pendingBaseSource, setPendingBaseSource] =
    useState<StudioSource | null>(() => initialSnap?.resultState.baseSource ?? null)
  const [pendingWorkingSource, setPendingWorkingSource] =
    useState<StudioSource | null>(
      () => initialSnap?.resultState.workingSource ?? null,
    )
  const [pendingCropRect, setPendingCropRect] = useState<CropRect | null>(
    () => initialSnap?.resultState.appliedCropRect ?? null,
  )

  const [resultState, setResultState] = useState<StudioResultState | null>(() =>
    initialSnap ? { ...initialSnap.resultState, sourceId: 1 } : null,
  )
  const resultStateRef = useRef(resultState)
  resultStateRef.current = resultState
  const [isCropping, setIsCropping] = useState(false)
  const [draftCropRect, setDraftCropRect] = useState<CropRect | null>(null)

  const [sourceLoading, setSourceLoading] = useState(() => !initialSnap)
  const [sourceError, setSourceError] = useState("")

  const [maskRevision, setMaskRevision] = useState(0)

  const [viewMode, setViewMode] = useState<PreviewViewMode>(() =>
    initialSnap ? "result" : "original",
  )
  const [splitPercent, setSplitPercent] = useState(50)
  const [previewBackground, setPreviewBackground] =
    useState<PreviewBackground>("checkerboard")
  const [brushTool, setBrushTool] = useState<BrushTool>("erase")
  const [brushSize, setBrushSize] = useState(28)

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<EngineProgressUpdate | null>(null)
  const [processError, setProcessError] = useState<{
    kind: BackgroundRemovalError["kind"] | "general"
    message: string
  } | null>(null)
  const engineProgressUpdates = useFrameCallback(
    ({ runId, update }: { runId: number; update: EngineProgressUpdate }) => {
      if (!isStaleRun(mountedRef.current, runIdRef.current, runId)) setProgress(update)
    },
  )
  const [applyError, setApplyError] = useState("")
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<"cutout" | "framing">("cutout")
  const [framing, setFraming] = useState<ThumbnailFraming>(() =>
    initialSnap
      ? (normalizeThumbnailFraming(reopenData?.framing ?? initialSnap.framing) ??
        DEFAULT_THUMBNAIL_FRAMING)
      : DEFAULT_THUMBNAIL_FRAMING,
  )
  const [framingPreviewUrl, setFramingPreviewUrl] = useState("")

  const autoMask = resultState?.autoMask ?? null
  const currentMask =
    resultState &&
    resultState.historyIndex >= 0 &&
    resultState.historyIndex < resultState.history.length
      ? resultState.history[resultState.historyIndex]
      : null
  const canFinalizeResult = Boolean(
    resultState &&
      currentMask &&
      !processing &&
      !saving &&
      !isCropping,
  )

  const runtimeSupport = checkRuntimeSupport()

  const revokeCurrentSource = useCallback(() => {
    if (activeSourceUrlRef.current) {
      URL.revokeObjectURL(activeSourceUrlRef.current)
      activeSourceUrlRef.current = null
    }
  }, [])

  const cancelPendingApply = useCallback(() => {
    applyRunIdRef.current += 1
    applyAbortRef.current?.abort()
    applyAbortRef.current = null
    setSaving(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      runIdRef.current += 1
      applyRunIdRef.current += 1
      applyAbortRef.current?.abort()
      applyAbortRef.current = null
      revokeCurrentSource()
    }
  }, [revokeCurrentSource])

  const executeBackgroundRemoval = useCallback(
    async (
      target: {
        sourceId: number
        baseSource: StudioSource
        workingSource: StudioSource
        appliedCropRect: CropRect | null
      },
      expectedRunId: number,
    ) => {
      if (isStaleRun(mountedRef.current, runIdRef.current, expectedRunId)) {
        return
      }

      setProcessing(true)
      setProcessError(null)
      setApplyError("")
      setProgress({
        phase: "initializing",
        downloadLoadedBytes: 0,
        downloadTotalBytes: 0,
        downloadPercent: null,
        hasDownloadActivity: false,
        stageLabel: "Preparing local background removal",
      })

      const previousRun = activeRunPromiseRef.current
      const runTask = async () => {
        await previousRun.catch(() => {})
        if (isStaleRun(mountedRef.current, runIdRef.current, expectedRunId)) {
          return
        }

        const attempt = attemptCountRef.current
        const cutoutBlob = await runLocalBackgroundRemoval(
          target.workingSource.workingBlob,
          {
            attempt,
            onProgress: (update) => {
              if (
                isStaleRun(mountedRef.current, runIdRef.current, expectedRunId)
              ) {
                return
              }
              engineProgressUpdates.schedule({ runId: expectedRunId, update })
            },
          },
        )

        if (isStaleRun(mountedRef.current, runIdRef.current, expectedRunId)) {
          return
        }

        engineProgressUpdates.cancel()
        setProgress((prev) => ({
          phase: "finalizing",
          downloadLoadedBytes: prev?.downloadLoadedBytes ?? 0,
          downloadTotalBytes: prev?.downloadTotalBytes ?? 0,
          downloadPercent: prev?.downloadPercent ?? null,
          hasDownloadActivity: prev?.hasDownloadActivity ?? false,
          stageLabel: "Preparing cutout preview",
        }))

        const nextAutoMask = await extractAlphaMaskFromCutoutBlob(
          cutoutBlob,
          target.workingSource.width,
          target.workingSource.height,
        )

        if (isStaleRun(mountedRef.current, runIdRef.current, expectedRunId)) {
          return
        }

        const initialEditable = new Uint8ClampedArray(nextAutoMask)
        encodedCacheRef.current = null
        setResultState({
          sourceId: target.sourceId,
          baseSource: target.baseSource,
          workingSource: target.workingSource,
          appliedCropRect: target.appliedCropRect,
          autoMask: nextAutoMask,
          history: [initialEditable],
          historyIndex: 0,
          preCropSnapshot: null,
        })
        setFraming(DEFAULT_THUMBNAIL_FRAMING)
        setFramingPreviewUrl("")
        setMaskRevision((rev) => rev + 1)
        setViewMode("original")
        setSplitPercent(50)
        engineProgressUpdates.cancel()
        setProcessing(false)
        setProgress(null)
      }

      const wrapped = runTask().catch((err: unknown) => {
        if (isStaleRun(mountedRef.current, runIdRef.current, expectedRunId)) {
          return
        }

        attemptCountRef.current += 1
        engineProgressUpdates.cancel()
        setProcessing(false)
        setProgress(null)

        if (err instanceof BackgroundRemovalError) {
          setProcessError({
            kind: err.kind,
            message: err.message,
          })
        } else {
          setProcessError({
            kind: "general",
            message:
              err instanceof Error
                ? err.message
                : "Background removal failed. Please retry.",
          })
        }
      })

      activeRunPromiseRef.current = wrapped
      await wrapped
    },
    [engineProgressUpdates],
  )

  const openFileInStudio = useCallback(
    async (file: File, intent: StudioOpenIntent) => {
      const nextRunId = ++runIdRef.current
      const nextSourceId = ++sourceIdRef.current
      cancelPendingApply()
      setPendingSourceId(nextSourceId)
      setPendingBaseSource(null)
      setPendingWorkingSource(null)
      setPendingCropRect(null)
      setSourceLoading(true)
      setSourceError("")
      setProcessError(null)
      setApplyError("")
      setIsCropping(false)
      setDraftCropRect(null)
      setProcessing(false)
      setProgress(null)

      try {
        validateAssetPhotoFile(file)
        if (shouldAutoRemoveOnOpen(intent, checkRuntimeSupport().supported)) {
          void prepareBackgroundRemovalEngine().catch(() => {})
        }
        const loaded = await loadStudioSource(file)
        if (isStaleRun(mountedRef.current, runIdRef.current, nextRunId)) {
          if (loaded.previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(loaded.previewUrl)
          }
          return
        }

        revokeCurrentSource()
        if (loaded.previewUrl.startsWith("blob:")) {
          activeSourceUrlRef.current = loaded.previewUrl
        }
        setPendingBaseSource(loaded)
        setPendingWorkingSource(loaded)
        setSourceLoading(false)

        const support = checkRuntimeSupport()
        if (!support.supported) {
          setProcessError({
            kind: "unsupported-runtime",
            message:
              support.reason ??
              "This browser does not support local background removal.",
          })
          return
        }

        if (shouldAutoRemoveOnOpen(intent, support.supported)) {
          void executeBackgroundRemoval(
            {
              sourceId: nextSourceId,
              baseSource: loaded,
              workingSource: loaded,
              appliedCropRect: null,
            },
            nextRunId,
          )
        }
      } catch (err) {
        if (isStaleRun(mountedRef.current, runIdRef.current, nextRunId)) return
        setSourceLoading(false)
        setSourceError(
          err instanceof Error ? err.message : "This image could not be loaded.",
        )
      }
    },
    [cancelPendingApply, executeBackgroundRemoval, revokeCurrentSource],
  )

  const reopenImageFromSrc = useCallback(
    async (imageSrc: string, initialFraming?: ThumbnailFraming) => {
      const nextRunId = ++runIdRef.current
      const nextSourceId = ++sourceIdRef.current
      cancelPendingApply()
      setPendingSourceId(nextSourceId)
      setPendingBaseSource(null)
      setPendingWorkingSource(null)
      setPendingCropRect(null)
      setSourceLoading(true)
      setSourceError("")
      setProcessError(null)
      setApplyError("")
      setIsCropping(false)
      setDraftCropRect(null)
      setProcessing(false)
      setProgress(null)

      try {
        const loaded = await loadStudioSourceFromUrl(imageSrc)
        if (isStaleRun(mountedRef.current, runIdRef.current, nextRunId)) {
          if (loaded.previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(loaded.previewUrl)
          }
          return
        }

        revokeCurrentSource()
        if (loaded.previewUrl.startsWith("blob:")) {
          activeSourceUrlRef.current = loaded.previewUrl
        }
        setPendingBaseSource(loaded)
        setPendingWorkingSource(loaded)
        setResultState(createResultStateFromDecodedSource(loaded, nextSourceId))
        setFraming(
          normalizeThumbnailFraming(initialFraming) ?? DEFAULT_THUMBNAIL_FRAMING,
        )
        setFramingPreviewUrl("")
        setMaskRevision((rev) => rev + 1)
        setViewMode("result")
        setSourceLoading(false)
      } catch (err) {
        if (isStaleRun(mountedRef.current, runIdRef.current, nextRunId)) return
        setSourceLoading(false)
        setSourceError(
          err instanceof Error ? err.message : "This image could not be loaded.",
        )
      }
    },
    [cancelPendingApply, revokeCurrentSource],
  )

  useEffect(() => {
    if (reopenData) {
      if (reopenData.snapshot) {
        if (restoredSnapshotRef.current === reopenData.snapshot) {
          return
        }
        restoredSnapshotRef.current = reopenData.snapshot
        const snap = reopenData.snapshot
        const snapResult = snap.resultState
        const restoredSourceId = ++sourceIdRef.current
        runIdRef.current += 1
        cancelPendingApply()
        encodedCacheRef.current = snap.encoded ?? null
        setPendingSourceId(restoredSourceId)
        setPendingBaseSource(snapResult.baseSource)
        setPendingWorkingSource(snapResult.workingSource)
        setPendingCropRect(snapResult.appliedCropRect)
        setResultState({
          ...snapResult,
          sourceId: restoredSourceId,
        })
        setFraming(
          normalizeThumbnailFraming(reopenData.framing ?? snap.framing) ??
            DEFAULT_THUMBNAIL_FRAMING,
        )
        setFramingPreviewUrl("")
        setMaskRevision((rev) => rev + 1)
        setViewMode("result")
        setSourceLoading(false)
        setSourceError("")
        setProcessError(null)
        setApplyError("")
        setIsCropping(false)
        setDraftCropRect(null)
        setProcessing(false)
        setProgress(null)
        return
      }
      restoredSnapshotRef.current = null
      void reopenImageFromSrc(reopenData.imageSrc, reopenData.framing)
      return () => {
        runIdRef.current += 1
      }
    }
    restoredSnapshotRef.current = null
    if (initialFile) {
      void openFileInStudio(initialFile, "initial")
      return () => {
        runIdRef.current += 1
      }
    }
    return undefined
  }, [
    cancelPendingApply,
    initialFile,
    openFileInStudio,
    reopenData,
    reopenImageFromSrc,
  ])

  const handleManualRemoveBackground = () => {
    if (
      !pendingBaseSource ||
      !pendingWorkingSource ||
      sourceLoading ||
      processing ||
      isCropping
    ) {
      return
    }
    const nextRunId = ++runIdRef.current
    void executeBackgroundRemoval(
      {
        sourceId: pendingSourceId,
        baseSource: pendingBaseSource,
        workingSource: pendingWorkingSource,
        appliedCropRect: pendingCropRect,
      },
      nextRunId,
    )
  }

  const handleChangeImageInput = (file?: File) => {
    if (!file) return
    void openFileInStudio(file, "replacement")
  }

  const handleStartCrop = () => {
    if (saving || processing) return
    if (resultState) {
      setDraftCropRect(fullCropRect(resultState.workingSource))
      setIsCropping(true)
      setApplyError("")
      return
    }
    if (!pendingBaseSource) return
    setDraftCropRect(pendingCropRect ?? fullCropRect(pendingBaseSource))
    setIsCropping(true)
    setApplyError("")
  }

  const handleCancelCrop = () => {
    setIsCropping(false)
    setDraftCropRect(null)
  }

  const applyCropToResult = useCallback(
    async (rect: CropRect) => {
      if (!resultState) return
      const targetWorking = resultState.workingSource
      const targetResult = resultState
      const cropRunId = ++runIdRef.current
      const clampedRect = clampCropRect(
        rect,
        targetWorking.width,
        targetWorking.height,
      )
      cancelPendingApply()
      const cropController = new AbortController()
      applyAbortRef.current = cropController
      setIsCropping(false)
      setDraftCropRect(null)
      setApplyError("")

      setProcessing(true)
      setProgress({
        phase: "preparing",
        downloadLoadedBytes: 0,
        downloadTotalBytes: 0,
        downloadPercent: null,
        hasDownloadActivity: false,
        stageLabel: "Applying crop",
      })
      try {
        const cropped = await cropStudioSource(targetWorking, clampedRect)
        if (isStaleRun(mountedRef.current, runIdRef.current, cropRunId)) return

        const nextResult = await applyCroppedResultStateAsync(targetResult, cropped, clampedRect, {
          signal: cropController.signal,
        })
        if (
          isStaleRun(mountedRef.current, runIdRef.current, cropRunId) ||
          resultStateRef.current !== targetResult
        ) return
        encodedCacheRef.current = null
        setResultState(nextResult)
        setFraming(DEFAULT_THUMBNAIL_FRAMING)
        setFramingPreviewUrl("")
        setMaskRevision((rev) => rev + 1)
      } catch (err) {
        if (isStaleRun(mountedRef.current, runIdRef.current, cropRunId)) return
        setApplyError(
          err instanceof Error ? err.message : "Could not apply crop.",
        )
      } finally {
        if (applyAbortRef.current === cropController) applyAbortRef.current = null
        if (!isStaleRun(mountedRef.current, runIdRef.current, cropRunId)) {
          setProcessing(false)
          setProgress(null)
        }
      }
    },
    [cancelPendingApply, resultState],
  )

  const applyCropToPendingSource = useCallback(
    async (nextRect: CropRect | null) => {
      if (!pendingBaseSource) return
      const nextRunId = ++runIdRef.current
      setIsCropping(false)
      setDraftCropRect(null)
      setApplyError("")
      setProcessError(null)

      try {
        const isFull =
          !nextRect || cropRectsEqual(nextRect, fullCropRect(pendingBaseSource))
        const nextWorking = isFull
          ? pendingBaseSource
          : await cropStudioSource(pendingBaseSource, nextRect)
        if (isStaleRun(mountedRef.current, runIdRef.current, nextRunId)) return

        setPendingCropRect(isFull ? null : nextRect)
        setPendingWorkingSource(nextWorking)
      } catch (err) {
        if (isStaleRun(mountedRef.current, runIdRef.current, nextRunId)) return
        setApplyError(
          err instanceof Error ? err.message : "Could not apply crop.",
        )
      }
    },
    [pendingBaseSource],
  )

  const handleApplyCrop = () => {
    if (!draftCropRect) return
    if (resultState) {
      if (cropRectsEqual(draftCropRect, fullCropRect(resultState.workingSource))) {
        setIsCropping(false)
        setDraftCropRect(null)
        return
      }
      void applyCropToResult(draftCropRect)
      return
    }
    if (!pendingBaseSource) return
    const currentEffective = pendingCropRect ?? fullCropRect(pendingBaseSource)
    if (cropRectsEqual(draftCropRect, currentEffective)) {
      setIsCropping(false)
      setDraftCropRect(null)
      return
    }
    void applyCropToPendingSource(draftCropRect)
  }

  const handleResetCrop = () => {
    if (resultState) {
      if (resultState.preCropSnapshot) {
        cancelPendingApply()
        encodedCacheRef.current = null
        setResultState((prev) => (prev ? resetCroppedResultState(prev) : prev))
        setFraming(DEFAULT_THUMBNAIL_FRAMING)
        setFramingPreviewUrl("")
        setMaskRevision((rev) => rev + 1)
        setIsCropping(false)
        setDraftCropRect(null)
        return
      }
      setDraftCropRect(fullCropRect(resultState.workingSource))
      return
    }
    if (!pendingBaseSource) return
    if (pendingCropRect) {
      void applyCropToPendingSource(null)
      return
    }
    setDraftCropRect(fullCropRect(pendingBaseSource))
  }

  const canResetCrop = resultState
    ? Boolean(
        resultState.preCropSnapshot !== null ||
          (draftCropRect &&
            !cropRectsEqual(draftCropRect, fullCropRect(resultState.workingSource))),
      )
    : Boolean(
        pendingBaseSource &&
          (pendingCropRect !== null ||
            (draftCropRect &&
              !cropRectsEqual(draftCropRect, fullCropRect(pendingBaseSource)))),
      )

  const handleCommitStroke = useCallback((nextMask: Uint8ClampedArray) => {
    setResultState((prev) => {
      if (!prev) return prev
      const sliced = prev.history.slice(0, prev.historyIndex + 1)
      const next = [...sliced, nextMask]
      if (next.length > MAX_HISTORY_ENTRIES) {
        const trim = next.length - MAX_HISTORY_ENTRIES
        return {
          ...prev,
          history: next.slice(trim),
          historyIndex: next.length - trim - 1,
        }
      }
      return {
        ...prev,
        history: next,
        historyIndex: next.length - 1,
      }
    })
    setMaskRevision((rev) => rev + 1)
    setApplyError("")
  }, [])

  const canUndo =
    Boolean(resultState && resultState.historyIndex > 0) &&
    !processing &&
    !isCropping
  const canRedo =
    Boolean(
      resultState &&
        resultState.historyIndex >= 0 &&
        resultState.historyIndex < resultState.history.length - 1,
    ) &&
    !processing &&
    !isCropping
  const isAtAutoMask = useMemo(
    () => Boolean(autoMask && currentMask && masksEqual(autoMask, currentMask)),
    [autoMask, currentMask],
  )
  const canReset =
    Boolean(autoMask && currentMask) &&
    !processing &&
    !isCropping &&
    !isAtAutoMask

  const handleUndo = useCallback(() => {
    if (!canUndo) return
    setResultState((prev) =>
      prev
        ? { ...prev, historyIndex: Math.max(0, prev.historyIndex - 1) }
        : prev,
    )
    setMaskRevision((rev) => rev + 1)
    setApplyError("")
  }, [canUndo])

  const handleRedo = useCallback(() => {
    if (!canRedo) return
    setResultState((prev) =>
      prev
        ? {
            ...prev,
            historyIndex: Math.min(prev.history.length - 1, prev.historyIndex + 1),
          }
        : prev,
    )
    setMaskRevision((rev) => rev + 1)
    setApplyError("")
  }, [canRedo])

  const handleResetResult = () => {
    if (!autoMask || !canReset) return
    handleCommitStroke(new Uint8ClampedArray(autoMask))
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === "z" && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault()
          handleUndo()
        }
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        if (canRedo) {
          e.preventDefault()
          handleRedo()
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [canRedo, canUndo, handleRedo, handleUndo])

  const handleCancelStudio = useCallback(() => {
    runIdRef.current += 1
    cancelPendingApply()
    onCancel()
  }, [cancelPendingApply, onCancel])

  const handleUseCutout = async () => {
    if (!resultState || !currentMask || !canFinalizeResult) {
      return
    }
    const targetWorkingSource = resultState.workingSource

    const applyId = ++applyRunIdRef.current
    applyAbortRef.current?.abort()
    const controller = new AbortController()
    applyAbortRef.current = controller

    setSaving(true)
    setApplyError("")

    // Let React commit and the browser paint "Applying..." before encoding begins.
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      } else {
        setTimeout(resolve, 0)
      }
    })

    if (!mountedRef.current || applyRunIdRef.current !== applyId) return

    try {
      const cached = encodedCacheRef.current
      const dataUrl =
        cached &&
        cached.source === targetWorkingSource &&
        cached.mask === currentMask
          ? cached.dataUrl
          : await encodeStudioOutputDataUrlAsync({
              originalData: targetWorkingSource.originalData,
              alphaMask: currentMask,
              preserveAlpha: true,
              signal: controller.signal,
            })

      if (!mountedRef.current || applyRunIdRef.current !== applyId) return

      encodedCacheRef.current = {
        source: targetWorkingSource,
        mask: currentMask,
        dataUrl,
      }
      runIdRef.current += 1
      const normalizedFraming =
        normalizeThumbnailFraming(framing) ?? DEFAULT_THUMBNAIL_FRAMING
      onApply({
        dataUrl,
        framing: normalizedFraming,
        snapshot: {
          resultState,
          framing: normalizedFraming,
          encoded: encodedCacheRef.current,
        },
      })
    } catch (err) {
      if (
        !mountedRef.current ||
        applyRunIdRef.current !== applyId ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return
      }
      setApplyError(
        err instanceof Error
          ? err.message
          : "Could not encode the transparent cutout.",
      )
      setSaving(false)
    }
  }

  const handleBrushToolSelect = (tool: BrushTool) => {
    setBrushTool(tool)
    if (currentMask && viewMode !== "result") {
      setViewMode("result")
    }
  }

  const handleGoToFraming = async () => {
    if (!resultState || !currentMask || !canFinalizeResult) {
      return
    }
    setApplyError("")
    const targetResult = resultState
    const framingRunId = ++applyRunIdRef.current
    setSaving(true)
    try {
      const preview = await createTrimmedPreviewUrlAsync(
        targetResult.workingSource.originalData,
        currentMask,
      )
      if (!mountedRef.current || applyRunIdRef.current !== framingRunId ||
          resultStateRef.current !== targetResult) return
      setFramingPreviewUrl(preview)
      setStep("framing")
    } catch (err) {
      if (!mountedRef.current || applyRunIdRef.current !== framingRunId) return
      setApplyError(
        err instanceof Error
          ? err.message
          : "Could not prepare thumbnail framing preview.",
      )
    } finally {
      if (mountedRef.current && applyRunIdRef.current === framingRunId) setSaving(false)
    }
  }

  return (
    <OverlayLayer
      panelRef={panelRef}
      onClose={handleCancelStudio}
      className="fixed inset-0 grid place-items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 lg:p-6"
    >
      <div className="absolute inset-0" onClick={handleCancelStudio} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bg-studio-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex size-full flex-col overflow-hidden bg-panel shadow-2xl outline-none sm:h-[min(75dvh,calc(100dvh-48px))] sm:max-w-[1150px] sm:rounded-2xl sm:border sm:border-line"
      >
        {/* Compact studio header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
          <h3
            id="bg-studio-title"
            className="truncate text-sm font-semibold text-foreground"
          >
            Background removal studio
          </h3>
          <IconButton
            icon={X}
            label="Close background removal studio"
            onClick={handleCancelStudio}
          />
        </div>

        {step === "framing" && framingPreviewUrl ? (
          <ThumbnailFramingStage
            previewUrl={framingPreviewUrl}
            assetName={assetName || resultState?.workingSource.name || "New item"}
            framing={framing}
            onChange={setFraming}
          />
        ) : (
        /* 3-column body separated by subtle borders */
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[228px_minmax(0,1fr)_260px] lg:overflow-hidden">
          {/* Left panel: Source image, Change image, Remove background */}
          <aside className="flex shrink-0 flex-col gap-3 border-b border-line p-4 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
            <div className="text-xs font-semibold text-foreground">
              Source image
            </div>

            <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-elev">
              {pendingWorkingSource ? (
                <img
                  src={pendingWorkingSource.previewUrl}
                  alt={pendingWorkingSource.name || "Uploaded item photo"}
                  className="size-full object-contain"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  {sourceLoading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                </div>
              )}
            </div>

            {pendingWorkingSource && (
              <div
                className="truncate text-[11px] text-muted-foreground"
                title={pendingWorkingSource.name}
              >
                {pendingWorkingSource.name}
              </div>
            )}

            <input
              ref={changeFileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const next = e.target.files?.[0]
                e.target.value = ""
                handleChangeImageInput(next)
              }}
            />

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full justify-center px-3 text-xs"
                disabled={saving}
                onClick={() => changeFileInputRef.current?.click()}
              >
                Change image
              </Button>

              <Button
                type="button"
                variant="solid"
                icon={Sparkles}
                className="h-8 w-full justify-center whitespace-nowrap px-2.5 text-xs"
                disabled={
                  !pendingWorkingSource ||
                  sourceLoading ||
                  processing ||
                  saving ||
                  isCropping ||
                  !runtimeSupport.supported
                }
                onClick={handleManualRemoveBackground}
              >
                {processing
                  ? "Removing..."
                  : processError
                    ? "Retry removal"
                    : "Remove background"}
              </Button>
            </div>

            {sourceError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
              >
                {sourceError}
              </div>
            )}

            {processError && (
              <div
                role="alert"
                className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-rose-400" />
                  <div>
                    <div className="font-medium text-rose-200">
                      {processError.kind === "download"
                        ? "Model download failed"
                        : processError.kind === "initialization"
                          ? "Runtime initialization failed"
                          : processError.kind === "unsupported-runtime"
                            ? "Unsupported browser runtime"
                            : "Processing failed"}
                    </div>
                    <p className="mt-0.5 leading-relaxed text-rose-200/85">
                      {processError.message}
                    </p>
                  </div>
                </div>
                {processError.kind !== "unsupported-runtime" &&
                  pendingWorkingSource && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 w-full justify-center px-3 text-xs"
                      onClick={handleManualRemoveBackground}
                    >
                      Try again
                    </Button>
                  )}
              </div>
            )}

            {!processError && processing && progress && (
              <div className="rounded-xl border border-line bg-elev/60 p-3 text-[11px] text-muted-foreground">
                <div className="font-medium text-foreground">
                  {progress.stageLabel}
                </div>
                {progress.hasDownloadActivity && (
                  <div className="mt-1 tabular-nums">
                    {progress.downloadTotalBytes > 0 &&
                    progress.downloadPercent !== null
                      ? `Download: ${progress.downloadPercent}%`
                      : "Downloading model & runtime…"}
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* Center panel: Large Original/Result preview & Crop stage */}
          <section className="flex min-h-[320px] min-w-0 flex-col overflow-hidden bg-bg/35 lg:min-h-0">
            <ComparisonCanvasStage
              source={resultState?.workingSource ?? null}
              cropSource={
                resultState ? resultState.workingSource : pendingBaseSource
              }
              dimensionSource={pendingWorkingSource}
              sourceLoading={!resultState && sourceLoading}
              sourceError={!resultState ? sourceError : ""}
              emptyMessage="Click Remove background to preview the cutout."
              alphaMask={currentMask}
              maskRevision={maskRevision}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              previewBackground={previewBackground}
              splitPercent={splitPercent}
              onSplitPercentChange={setSplitPercent}
              brushTool={brushTool}
              brushSize={brushSize}
              brushEnabled={Boolean(currentMask)}
              busy={processing}
              progress={progress}
              onCommitStroke={handleCommitStroke}
              isCropping={isCropping}
              draftCropRect={draftCropRect}
              canResetCrop={canResetCrop}
              onDraftCropChange={setDraftCropRect}
              onApplyCrop={handleApplyCrop}
              onCancelCrop={handleCancelCrop}
              onResetCrop={handleResetCrop}
            />
          </section>

          {/* Right panel: Refine cutout & preview background */}
          <aside className="flex shrink-0 flex-col gap-3.5 border-t border-line p-4 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <div>
              <div className="text-xs font-semibold text-foreground">
                Refine cutout
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {currentMask
                  ? viewMode === "result"
                    ? "Paint directly on Result to erase leftovers or restore details."
                    : "Switch to Result or pick a brush to paint directly."
                  : "Run Remove background to enable brush refinement."}
              </p>
              <Button
                type="button"
                variant="outline"
                icon={Crop}
                disabled={
                  !(resultState || pendingBaseSource) ||
                  sourceLoading ||
                  processing ||
                  saving ||
                  isCropping
                }
                onClick={handleStartCrop}
                className="mt-2.5 h-8 w-full justify-center px-2.5 text-xs"
              >
                Adjust crop
              </Button>
              <Button
                type="button"
                variant="outline"
                icon={Frame}
                disabled={!canFinalizeResult}
                onClick={handleGoToFraming}
                className="mt-2 h-8 w-full justify-center px-2.5 text-xs"
              >
                Thumbnail framing
              </Button>
            </div>

            <div className="space-y-1.5 border-t border-line pt-3">
              <span className="block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Brush tool
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  icon={Eraser}
                  variant={brushTool === "erase" ? "solid" : "outline"}
                  disabled={!currentMask || processing || isCropping}
                  onClick={() => handleBrushToolSelect("erase")}
                  className="h-8 justify-center px-2.5 text-xs"
                >
                  Erase
                </Button>
                <Button
                  type="button"
                  icon={Paintbrush}
                  variant={brushTool === "restore" ? "solid" : "outline"}
                  disabled={!currentMask || processing || isCropping}
                  onClick={() => handleBrushToolSelect("restore")}
                  className="h-8 justify-center px-2.5 text-xs"
                >
                  Restore
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-line pt-3">
              <div className="flex items-center justify-between text-[11px]">
                <label
                  htmlFor="studio-brush-size"
                  className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  Brush size
                </label>
                <span className="tabular-nums text-muted-foreground">
                  {brushSize} px
                </span>
              </div>
              <input
                id="studio-brush-size"
                type="range"
                min={6}
                max={96}
                step={2}
                value={brushSize}
                disabled={!currentMask || processing || isCropping}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full accent-foreground disabled:opacity-40"
              />
            </div>

            <div className="space-y-1.5 border-t border-line pt-3">
              <span className="block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                History
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  icon={Undo2}
                  disabled={!canUndo}
                  onClick={handleUndo}
                  className="h-8 justify-center px-2.5 text-xs"
                >
                  Undo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  icon={Redo2}
                  disabled={!canRedo}
                  onClick={handleRedo}
                  className="h-8 justify-center px-2.5 text-xs"
                >
                  Redo
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                icon={RotateCcw}
                disabled={!canReset}
                onClick={handleResetResult}
                className="h-8 w-full justify-center px-2.5 text-xs"
              >
                Reset result
              </Button>
            </div>

            <div className="space-y-1.5 border-t border-line pt-3">
              <span className="block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Preview background
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "checkerboard", label: "Checker" },
                    { id: "white", label: "White" },
                    { id: "dark", label: "Dark" },
                  ] as const
                ).map((bg) => {
                  const selected = previewBackground === bg.id
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPreviewBackground(bg.id)}
                      className={cx(
                        "rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                        selected
                          ? "border-invert bg-invert text-invert-fg"
                          : "border-line bg-elev text-muted-foreground hover:border-line-strong hover:text-foreground",
                      )}
                    >
                      {bg.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Preview background only — saved cutout keeps transparent pixels.
              </p>
            </div>
          </aside>
        </div>
        )}

        {/* Compact footer actions */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:px-5">
          <div className="min-w-0 flex-1">
            {applyError && (
              <p role="alert" className="text-xs text-rose-400">
                {applyError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step === "framing" && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setStep("cutout")}
                className="h-8 px-3 text-xs"
              >
                Back to cutout
              </Button>
            )}
            {step !== "framing" && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancelStudio}
                className="h-8 px-3 text-xs"
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              variant="solid"
              disabled={!canFinalizeResult}
              onClick={() => void handleUseCutout()}
              className="h-8 px-3 text-xs"
            >
              {saving ? "Applying..." : "Use image"}
            </Button>
          </div>
        </div>
      </div>
    </OverlayLayer>
  )
}
