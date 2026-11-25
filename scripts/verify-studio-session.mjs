import assert from "node:assert/strict"
import { registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith(".")) {
        try {
          return next(`${specifier}.ts`, context)
        } catch {}
        try {
          return next(`${specifier}.tsx`, context)
        } catch {}
      }
      throw error
    }
  },
})

const { cropAlphaMask, cropStudioResultMasks } = await import(
  "../src/features/warehouse/background-removal/studio-image.ts"
)
const {
  applyCroppedResultState,
  createResultStateFromDecodedSource,
  hasPendingReplacementSource,
  isStaleRun,
  resetCroppedResultState,
  shouldAutoRemoveOnOpen,
} = await import("../src/features/warehouse/background-removal/studio-session.ts")
const { createEngineProgressTracker } = await import(
  "../src/features/warehouse/background-removal/background-removal-engine.ts"
)

function makeStubSource(name, width, height) {
  const pixelCount = width * height
  return {
    name,
    width,
    height,
    originalData: { width, height, data: new Uint8ClampedArray(pixelCount * 4) },
    originalAlpha: new Uint8ClampedArray(pixelCount).fill(255),
    previewUrl: `data:image/png;base64,${name}`,
    workingBlob: new Blob([]),
    hasAlpha: false,
  }
}

console.log("Testing Background Removal Studio source/result separation & post-removal crop...")

// 1. Initial upload vs replacement vs reopen intent & pending-source isolation
{
  assert.equal(shouldAutoRemoveOnOpen("initial", true), true)
  assert.equal(shouldAutoRemoveOnOpen("replacement", true), false)
  assert.equal(shouldAutoRemoveOnOpen("reopen", true), false)
  assert.equal(shouldAutoRemoveOnOpen("initial", false), false)

  const reopenedSrc = makeStubSource("reopened.png", 4, 4)
  reopenedSrc.originalAlpha[5] = 128
  const reopenedResult = createResultStateFromDecodedSource(reopenedSrc, 9)
  assert.equal(reopenedResult.sourceId, 9)
  assert.equal(reopenedResult.autoMask[5], 128)
  assert.equal(reopenedResult.history[0][5], 128)

  // First upload: no result yet, so not a replacement
  assert.equal(hasPendingReplacementSource(null, 1), false)

  const src1 = makeStubSource("first.png", 10, 10)
  const mask1 = new Uint8ClampedArray(100).fill(255)
  const result1 = {
    sourceId: 1,
    baseSource: src1,
    workingSource: src1,
    appliedCropRect: null,
    autoMask: mask1,
    history: [mask1],
    historyIndex: 0,
    preCropSnapshot: null,
  }

  // Result matches current source -> apply/framing allowed
  assert.equal(hasPendingReplacementSource(result1, 1), false)

  // Change image bumps pendingSourceId to 2 while result1 stays intact -> apply/framing blocked
  assert.equal(hasPendingReplacementSource(result1, 2), true)
  assert.equal(result1.workingSource.name, "first.png")

  // Simulated processing failure leaves result1 intact and still awaiting removal
  assert.equal(hasPendingReplacementSource(result1, 2), true)
}

// 2. Stale run detection on source change, supersede, or unmount
{
  assert.equal(isStaleRun(true, 3, 3), false)
  assert.equal(isStaleRun(true, 4, 3), true)
  assert.equal(isStaleRun(false, 3, 3), true)
}

// 3. Cropping an edited cutout aligns autoMask and history, preserves edits, and resets cleanly
{
  const width = 10
  const height = 8
  const base = makeStubSource("vase.png", width, height)

  const autoMask = new Uint8ClampedArray(width * height)
  const editedMask = new Uint8ClampedArray(width * height)
  // Mark (3, 2) in autoMask as 200, and brush-restore (4, 3) in editedMask to 255
  autoMask[2 * width + 3] = 200
  editedMask.set(autoMask)
  editedMask[3 * width + 4] = 255

  const initialResult = {
    sourceId: 1,
    baseSource: base,
    workingSource: base,
    appliedCropRect: null,
    autoMask,
    history: [autoMask, editedMask],
    historyIndex: 1,
    preCropSnapshot: null,
  }

  // Crop to x=2, y=1, width=5, height=4
  const rect = { x: 2, y: 1, width: 5, height: 4 }
  const croppedSource = makeStubSource("vase-cropped.png", 5, 4)
  const croppedResult = applyCroppedResultState(initialResult, croppedSource, rect)

  assert.equal(croppedResult.workingSource.width, 5)
  assert.equal(croppedResult.workingSource.height, 4)
  assert.equal(croppedResult.autoMask.length, 20)
  assert.equal(croppedResult.history.length, 2)
  assert.equal(croppedResult.historyIndex, 1)

  // (3,2) in original -> (3-2, 2-1) = (1, 1) in cropped
  assert.equal(croppedResult.autoMask[1 * 5 + 1], 200)
  // (4,3) in original -> (4-2, 3-1) = (2, 2) in cropped
  assert.equal(croppedResult.history[1][2 * 5 + 2], 255)
  assert.ok(croppedResult.preCropSnapshot, "Pre-crop snapshot should be saved")

  // Second crop preserves original preCropSnapshot
  const rect2 = { x: 1, y: 1, width: 3, height: 3 }
  const croppedSource2 = makeStubSource("vase-cropped-2.png", 3, 3)
  const croppedResult2 = applyCroppedResultState(croppedResult, croppedSource2, rect2)
  assert.equal(croppedResult2.history[1].length, 9)
  // (1,1) in cropped -> (0,0) in cropped2; (2,2) in cropped -> (1,1) in cropped2
  assert.equal(croppedResult2.autoMask[0], 200)
  assert.equal(croppedResult2.history[1][1 * 3 + 1], 255)
  assert.equal(croppedResult2.preCropSnapshot?.workingSource, base)

  // Reset crop restores saved pre-crop result and manual edits
  const restored = resetCroppedResultState(croppedResult2)
  assert.equal(restored.workingSource, base)
  assert.equal(restored.appliedCropRect, null)
  assert.equal(restored.preCropSnapshot, null)
  assert.equal(restored.historyIndex, 1)
  assert.equal(restored.history[1][3 * width + 4], 255)

  // Direct cropAlphaMask bounds clamping check
  const clamped = cropAlphaMask(editedMask, width, height, {
    x: 8,
    y: 6,
    width: 10,
    height: 10,
  })
  assert.equal(clamped.length, 4) // clamped to 2x2 at bottom-right
  const masksResult = cropStudioResultMasks({
    sourceWidth: width,
    sourceHeight: height,
    rect,
    autoMask,
    history: [autoMask, editedMask],
  })
  assert.deepEqual(masksResult.rect, rect)
}

// 4. Engine progress tracker distinguishes stages and avoids fake download/inference percentages
{
  // Unknown total bytes -> no invented downloadTotalBytes or downloadPercent
  const unknownTotal = createEngineProgressTracker()
  const u1 = unknownTotal("fetch:model.onnx", 512, 0)
  assert.equal(u1.phase, "downloading")
  assert.equal(u1.hasDownloadActivity, true)
  assert.equal(u1.downloadLoadedBytes, 512)
  assert.equal(u1.downloadTotalBytes, 0)
  assert.equal(u1.downloadPercent, null)

  // Known total bytes -> determinate download percentage
  const knownTotal = createEngineProgressTracker()
  const k1 = knownTotal("fetch:model.onnx", 500, 1000)
  assert.equal(k1.phase, "downloading")
  assert.equal(k1.downloadPercent, 50)
  assert.equal(k1.downloadTotalBytes, 1000)

  // Cached run -> no fetch events, distinct compute stages, no invented processingPercent
  const cached = createEngineProgressTracker()
  const cDecode = cached("compute:decode", 0, 1)
  assert.equal(cDecode.phase, "preparing")
  assert.equal(cDecode.hasDownloadActivity, false)
  assert.equal("processingPercent" in cDecode, false)

  const cInfer = cached("compute:inference", 1, 2)
  assert.equal(cInfer.phase, "segmenting")
  assert.equal(cInfer.hasDownloadActivity, false)

  const cEncode = cached("compute:encode", 1, 1)
  assert.equal(cEncode.phase, "encoding")
}

console.log("All studio session & post-removal crop checks passed!")
