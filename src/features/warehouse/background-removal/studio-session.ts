import {
  type CropRect,
  type StudioSource,
  cropStudioResultMasks,
  cropAlphaMask,
  clampCropRect,
} from "./studio-image"

export type ResultCropSnapshot = {
  workingSource: StudioSource
  autoMask: Uint8ClampedArray
  history: Uint8ClampedArray[]
  historyIndex: number
}

export type StudioResultState = {
  sourceId: number
  baseSource: StudioSource
  workingSource: StudioSource
  appliedCropRect: CropRect | null
  autoMask: Uint8ClampedArray
  history: Uint8ClampedArray[]
  historyIndex: number
  preCropSnapshot: ResultCropSnapshot | null
}

export type StudioOpenIntent = "initial" | "replacement" | "reopen"

export type StudioSnapshot = {
  resultState: StudioResultState
  framing: {
    zoom: number
    offsetX: number
    offsetY: number
  }
  encoded?: {
    source: StudioSource
    mask: Uint8ClampedArray
    dataUrl: string
  }
}

export function createResultStateFromDecodedSource(
  source: StudioSource,
  sourceId: number,
): StudioResultState {
  const mask = new Uint8ClampedArray(source.originalAlpha)
  return {
    sourceId,
    baseSource: source,
    workingSource: source,
    appliedCropRect: null,
    autoMask: mask,
    history: [new Uint8ClampedArray(mask)],
    historyIndex: 0,
    preCropSnapshot: null,
  }
}

export function shouldAutoRemoveOnOpen(
  intent: StudioOpenIntent,
  runtimeSupported: boolean,
): boolean {
  return intent === "initial" && runtimeSupported
}

export function isStaleRun(
  mounted: boolean,
  currentRunId: number,
  expectedRunId: number,
): boolean {
  return !mounted || currentRunId !== expectedRunId
}

export function hasPendingReplacementSource(
  resultState: Pick<StudioResultState, "sourceId"> | null,
  pendingSourceId: number,
): boolean {
  return Boolean(resultState && pendingSourceId !== resultState.sourceId)
}

export function applyCroppedResultState(
  prev: StudioResultState,
  croppedSource: StudioSource,
  cropRect: CropRect,
  preparedMasks?: ReturnType<typeof cropStudioResultMasks>,
): StudioResultState {
  const { rect, autoMask, history } = preparedMasks ?? cropStudioResultMasks({
    sourceWidth: prev.workingSource.width,
    sourceHeight: prev.workingSource.height,
    rect: cropRect,
    autoMask: prev.autoMask,
    history: prev.history,
  })

  const preCropSnapshot: ResultCropSnapshot = prev.preCropSnapshot ?? {
    workingSource: prev.workingSource,
    autoMask: prev.autoMask,
    history: prev.history,
    historyIndex: prev.historyIndex,
  }

  return {
    ...prev,
    workingSource: croppedSource,
    appliedCropRect: rect,
    autoMask,
    history,
    preCropSnapshot,
  }
}

/** Prepare large histories outside React's state updater and yield between batches. */
export async function applyCroppedResultStateAsync(
  prev: StudioResultState,
  croppedSource: StudioSource,
  cropRect: CropRect,
  options: { signal?: AbortSignal; yieldControl?: () => Promise<void> } = {},
): Promise<StudioResultState> {
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
  const checkAbort = () => {
    if (options.signal?.aborted) throw new DOMException("Crop cancelled.", "AbortError")
  }
  const { width, height } = prev.workingSource
  const rect = clampCropRect(cropRect, width, height)
  const masks = new Map<Uint8ClampedArray, Uint8ClampedArray>()
  const crop = (mask: Uint8ClampedArray) => {
    let result = masks.get(mask)
    if (!result) {
      result = cropAlphaMask(mask, width, height, rect)
      masks.set(mask, result)
    }
    return result
  }
  checkAbort()
  await yieldControl()
  checkAbort()
  const autoMask = crop(prev.autoMask)
  const history: Uint8ClampedArray[] = []
  for (let i = 0; i < prev.history.length; i++) {
    checkAbort()
    history.push(crop(prev.history[i]))
    if ((i + 1) % 4 === 0) await yieldControl()
  }
  checkAbort()
  return applyCroppedResultState(prev, croppedSource, rect, { rect, autoMask, history })
}

export function resetCroppedResultState(
  prev: StudioResultState,
): StudioResultState {
  if (!prev.preCropSnapshot) return prev
  return {
    ...prev,
    workingSource: prev.preCropSnapshot.workingSource,
    appliedCropRect: null,
    autoMask: prev.preCropSnapshot.autoMask,
    history: prev.preCropSnapshot.history,
    historyIndex: prev.preCropSnapshot.historyIndex,
    preCropSnapshot: null,
  }
}
