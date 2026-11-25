import assert from "node:assert/strict"
import { registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context) }
    catch (error) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context)
      throw error
    }
  },
})

const { createFrameScheduler } = await import("../src/features/warehouse/background-removal/useFrameCallback.ts")
const { applyCroppedResultState, applyCroppedResultStateAsync } = await import("../src/features/warehouse/background-removal/studio-session.ts")
const { createTrimmedPreviewUrlAsync, loadStudioSource } = await import("../src/features/warehouse/background-removal/studio-image.ts")

// High-frequency input coalesces without dropping the final pointer position.
{
  const frames = new Map()
  let id = 0
  const output = []
  const scheduler = createFrameScheduler(
    (value) => output.push(value),
    (callback) => { frames.set(++id, callback); return id },
    (frame) => frames.delete(frame),
  )
  for (let i = 0; i < 1000; i++) scheduler.schedule(i)
  assert.equal(frames.size, 1)
  assert.equal(output.length, 0)
  scheduler.flush()
  assert.deepEqual(output, [999])
  assert.equal(frames.size, 0)
  scheduler.schedule(1000)
  scheduler.cancel()
  assert.equal(frames.size, 0)
  assert.deepEqual(output, [999])
  scheduler.schedule(1001)
  frames.values().next().value()
  assert.deepEqual(output, [999, 1001])
}

// Async crop preserves every mask/history byte, yields to UI tasks, and cancels
// without changing the original result or its saved reset snapshot.
{
  const width = 1024, height = 1024
  const source = { width, height }
  const autoMask = new Uint8ClampedArray(width * height).fill(160)
  const history = Array.from({ length: 25 }, (_, i) => {
    const mask = new Uint8ClampedArray(autoMask)
    mask[(i + 1) * width + i] = i
    return mask
  })
  const original = {
    sourceId: 1, baseSource: source, workingSource: source,
    appliedCropRect: null, autoMask, history, historyIndex: 24, preCropSnapshot: null,
  }
  const rect = { x: 2, y: 3, width: 900, height: 850 }
  const cropped = { width: 900, height: 850 }
  let yields = 0
  let timerRan = false
  setTimeout(() => { timerRan = true }, 0)
  const started = performance.now()
  const result = await applyCroppedResultStateAsync(original, cropped, rect, {
    yieldControl: () => new Promise((resolve) => setTimeout(() => { yields++; resolve() }, 0)),
  })
  const elapsed = performance.now() - started
  assert.ok(timerRan)
  assert.ok(yields >= 7)
  const expected = applyCroppedResultState(original, cropped, rect)
  assert.deepEqual(result, expected)
  assert.equal(original.history, history)
  assert.equal(result.preCropSnapshot.history, history)
  const controller = new AbortController()
  await assert.rejects(
    applyCroppedResultStateAsync(original, cropped, rect, {
      signal: controller.signal,
      yieldControl: async () => { controller.abort() },
    }),
    { name: "AbortError" },
  )
  assert.equal(original.autoMask.length, width * height)
  console.log(`25-mask 1024px crop: ${elapsed.toFixed(1)} ms total, ${yields} event-loop yields (synthetic check, not a browser benchmark).`)
}

// Browser API doubles check preview caching, alpha pixels, and duplicate source
// decoding. These are pipeline checks; actual image codecs require a browser.
{
  let encodes = 0, decodes = 0
  class FakeImageData {
    constructor(data, width, height) { this.data = data; this.width = width; this.height = height }
  }
  class FakeCanvas {
    getContext() {
      return {
        drawImage: () => {},
        getImageData: () => new FakeImageData(new Uint8ClampedArray(this.width * this.height * 4).fill(255), this.width, this.height),
        putImageData: (image) => { this.image = image },
      }
    }
    toBlob(callback, type = "image/png") {
      encodes++
      const data = this.image ? Array.from(this.image.data) : []
      queueMicrotask(() => callback(new Blob([JSON.stringify({ width: this.width, height: this.height, data })], { type })))
    }
  }
  globalThis.ImageData = FakeImageData
  globalThis.document = { createElement: () => new FakeCanvas() }
  globalThis.createImageBitmap = async () => { decodes++; return { width: 4, height: 3, close() {} } }
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      void blob.arrayBuffer().then((data) => {
        this.result = `data:${blob.type};base64,${Buffer.from(data).toString("base64")}`
        this.onload?.()
      })
    }
  }
  const file = new File(["photo"], "photo.png", { type: "image/png" })
  const [first, second] = await Promise.all([loadStudioSource(file), loadStudioSource(file)])
  assert.equal(first, second)
  assert.equal(decodes, 1)
  assert.equal(encodes, 1, "source preview should reuse its existing PNG blob")
  const rgba = new Uint8ClampedArray(4 * 3 * 4).fill(240)
  const image = new FakeImageData(rgba, 4, 3)
  const alpha = new Uint8ClampedArray(12).fill(128)
  const before = encodes
  const [a, b] = await Promise.all([
    createTrimmedPreviewUrlAsync(image, alpha),
    createTrimmedPreviewUrlAsync(image, alpha),
  ])
  assert.equal(a, b)
  assert.equal(encodes - before, 1)
  const decoded = JSON.parse(Buffer.from(a.split(",")[1], "base64").toString())
  assert.equal(decoded.data[3], 128, "preview must preserve partial transparency")
  await createTrimmedPreviewUrlAsync(image, new Uint8ClampedArray(alpha).fill(200))
  assert.equal(encodes - before, 2, "changed mask needs a new preview")
  await assert.rejects(createTrimmedPreviewUrlAsync(image, new Uint8ClampedArray(12)), /completely transparent/)
}
console.log("Studio performance pipeline regression checks passed.")
