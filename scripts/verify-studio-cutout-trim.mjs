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

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
}
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
}
globalThis.window = {
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
}
globalThis.CustomEvent = class CustomEvent {
  constructor(t) {
    this.type = t
  }
}

const { computeAlphaTrimBounds, isCutoutImage } = await import(
  "../src/features/warehouse/background-removal/studio-image.ts"
)
const {
  clampThumbnailFraming,
  normalizeThumbnailFraming,
  maxThumbnailOffsetForZoom,
} = await import("../src/features/warehouse/background-removal/thumbnail-framing.ts")
const { syncCatalogAssetsFromInventory, assets: catalogAssets } = await import(
  "../src/features/event-manager/model.ts"
)
const { createWarehouseInventoryItem, readOperationsStore } = await import(
  "../src/operations/store.ts"
)
const { rentalVendors } = await import(
  "../src/features/event-manager/rentals/rental-catalog.ts"
)

console.log("Testing transparent-margin trimming & cutout recognition...")

// 1. Trims excess transparent margins and retains safety margin
{
  const width = 400
  const height = 400
  const mask = new Uint8ClampedArray(width * height)
  // Subject box from (120, 80) to (220, 280), width=101, height=201
  for (let y = 80; y <= 280; y++) {
    for (let x = 120; x <= 220; x++) {
      mask[y * width + x] = 255
    }
  }
  const bounds = computeAlphaTrimBounds(mask, width, height)
  assert.ok(bounds, "Expected non-null bounds for visible subject")
  // 2.5% of 201 = ~5 px margin
  assert.equal(bounds.x, 115)
  assert.equal(bounds.y, 75)
  assert.equal(bounds.width, 111)
  assert.equal(bounds.height, 211)
}

// 2. Ignores isolated residual specks (1-2 px) while retaining connected thin stems
{
  const width = 200
  const height = 200
  const mask = new Uint8ClampedArray(width * height)
  mask[5 * width + 5] = 180 // isolated stray speck in top-left corner
  mask[5 * width + 6] = 120 // 2-px stray speck
  for (let y = 50; y <= 140; y++) {
    mask[y * width + 100] = y > 120 ? 12 : 255 // thin faint stem at bottom
  }
  const bounds = computeAlphaTrimBounds(mask, width, height)
  assert.ok(bounds)
  assert.ok(bounds.x >= 90, "Isolated stray speck at x=5..6 should be ignored")
  assert.ok(bounds.y + bounds.height >= 141, "Faint stem at y=140 must be retained")
}

// 3. Fully transparent mask returns null
{
  const mask = new Uint8ClampedArray(100 * 100)
  assert.equal(computeAlphaTrimBounds(mask, 100, 100), null)
}

// 4. Clamps safely when subject touches image edges
{
  const width = 120
  const height = 80
  const mask = new Uint8ClampedArray(width * height)
  mask[0] = 255
  mask[height * width - 1] = 255
  const bounds = computeAlphaTrimBounds(mask, width, height)
  assert.deepEqual(bounds, { x: 0, y: 0, width: 120, height: 80 })
}

// 5. Cutout recognition across Warehouse & Event Manager catalog sync
{
  const pngCutout = "data:image/png;base64,iVBORw0KGgo="
  const webpCutout = "data:image/webp;base64,UklGRh4="
  const jpgPhoto = "data:image/jpeg;base64,/9j/4AAQ"

  assert.equal(isCutoutImage(pngCutout), true)
  assert.equal(isCutoutImage(webpCutout), true)
  assert.equal(isCutoutImage(jpgPhoto), false)

  syncCatalogAssetsFromInventory([
    {
      assetId: "cust-png-1",
      name: "Studio Cutout PNG",
      category: "Florals",
      unit: "pieces",
      image: pngCutout,
      totalStock: 10,
    },
    {
      assetId: "cust-webp-1",
      name: "Studio Cutout WebP",
      category: "Vessels",
      unit: "pieces",
      image: webpCutout,
      totalStock: 5,
    },
    {
      assetId: "cust-jpg-1",
      name: "Opaque Photo",
      category: "Decor",
      unit: "pieces",
      image: jpgPhoto,
      totalStock: 3,
    },
  ])

  const pngEntry = catalogAssets.find((a) => a.id === "cust-png-1")
  const webpEntry = catalogAssets.find((a) => a.id === "cust-webp-1")
  const jpgEntry = catalogAssets.find((a) => a.id === "cust-jpg-1")

  assert.equal(pngEntry?.cutout, true)
  assert.equal(webpEntry?.cutout, true)
  assert.equal(jpgEntry?.cutout, undefined)
}

// 6. Thumbnail framing bounds clamping, legacy defaults, persistence, and catalog sync
{
  assert.equal(normalizeThumbnailFraming(undefined), undefined)
  assert.equal(normalizeThumbnailFraming({ zoom: 1, offsetX: 0, offsetY: 0 }), undefined)

  const maxAt1 = maxThumbnailOffsetForZoom(1)
  const clamped = clampThumbnailFraming({ zoom: 0.5, offsetX: 999, offsetY: -999 })
  assert.equal(clamped.zoom, 1)
  assert.equal(clamped.offsetX, maxAt1)
  assert.equal(clamped.offsetY, -maxAt1)

  const framedRes = createWarehouseInventoryItem({
    name: "Tall Brass Arch",
    category: "Structures",
    stock: 2,
    primaryVendorId: rentalVendors[0].id,
    image: "data:image/png;base64,iVBORw0KGgo=",
    thumbnailFraming: { zoom: 1.85, offsetX: -10, offsetY: 18 },
  })
  assert.equal(framedRes.ok, true)
  assert.deepEqual(framedRes.item.thumbnailFraming, {
    zoom: 1.85,
    offsetX: -10,
    offsetY: 18,
  })

  const reloaded = readOperationsStore()
  const persisted = reloaded.inventory.find(
    (entry) => entry.assetId === framedRes.item.assetId,
  )
  assert.deepEqual(persisted?.thumbnailFraming, {
    zoom: 1.85,
    offsetX: -10,
    offsetY: 18,
  })

  const catalogFramed = catalogAssets.find(
    (entry) => entry.id === framedRes.item.assetId,
  )
  assert.deepEqual(catalogFramed?.thumbnailFraming, {
    zoom: 1.85,
    offsetX: -10,
    offsetY: 18,
  })

  const legacyRose = catalogAssets.find((entry) => entry.id === "evtast-0001")
  assert.equal(legacyRose?.thumbnailFraming, undefined)
}

console.log("All transparent-margin trimming & cutout presentation checks passed!")
