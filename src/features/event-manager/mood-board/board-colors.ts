import { parseGradient, rgbHex, validHex } from "../../../components/ui/colourValues"
import { safeImage, type Brief } from "../model"

export interface NamedColor {
  value: string
  name: string
}

export interface GradientSection {
  title: string
  items: readonly NamedColor[]
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const light = l / 100
  const a = sat * Math.min(light, 1 - light)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    const val = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(val * 255)
      .toString(16)
      .padStart(2, "0")
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

const SHADE_LABELS = [
  "Deepest",
  "Dark",
  "Rich",
  "Base",
  "Soft",
  "Light",
  "Pale",
] as const

const HUE_ROWS: ReadonlyArray<{ name: string; h: number; s: number }> = [
  { name: "Cobalt", h: 226, s: 82 },
  { name: "Indigo", h: 256, s: 76 },
  { name: "Violet", h: 274, s: 72 },
  { name: "Orchid", h: 292, s: 68 },
  { name: "Magenta", h: 326, s: 78 },
  { name: "Crimson", h: 356, s: 80 },
  { name: "Terracotta", h: 16, s: 82 },
  { name: "Amber", h: 34, s: 88 },
  { name: "Gold", h: 48, s: 90 },
  { name: "Lime", h: 86, s: 74 },
  { name: "Forest", h: 128, s: 62 },
  { name: "Emerald", h: 156, s: 68 },
  { name: "Teal", h: 176, s: 72 },
  { name: "Cerulean", h: 196, s: 80 },
  { name: "Sky", h: 212, s: 82 },
]

const SHADE_LIGHTNESS = [14, 24, 36, 48, 62, 76, 88] as const

export const FULL_SOLID_PALETTE: readonly NamedColor[] = [
  // Neutrals row (darkest left -> lightest right)
  { value: "#000000", name: "Black" },
  { value: "#292524", name: "Charcoal" },
  { value: "#57534e", name: "Stone" },
  { value: "#78716c", name: "Warm Gray" },
  { value: "#a8a29e", name: "Silver" },
  { value: "#e7e5e4", name: "Light Gray" },
  { value: "#ffffff", name: "White" },
  ...HUE_ROWS.flatMap(({ name, h, s }) =>
    SHADE_LIGHTNESS.map((l, idx) => ({
      value: hslToHex(h, s, l),
      name: `${SHADE_LABELS[idx]} ${name}`,
    })),
  ),
]

export const DEFAULT_SOLID_COLORS: readonly NamedColor[] = [
  // Row 1 - Neutrals
  { value: "#000000", name: "Black" },
  { value: "#292524", name: "Charcoal" },
  { value: "#57534e", name: "Stone" },
  { value: "#78716c", name: "Warm Gray" },
  { value: "#a8a29e", name: "Silver" },
  { value: "#e7e5e4", name: "Light Gray" },
  { value: "#ffffff", name: "White" },

  // Row 2 - Warm & Earth
  { value: "#dc2626", name: "Crimson" },
  { value: "#e11d48", name: "Rose" },
  { value: "#ea580c", name: "Terracotta" },
  { value: "#f59e0b", name: "Amber" },
  { value: "#eab308", name: "Gold" },
  { value: "#d6c7b3", name: "Sand" },
  { value: "#f0e7db", name: "Cream" },

  // Row 3 - Cool & Botanical
  { value: "#7a8069", name: "Sage" },
  { value: "#16a34a", name: "Emerald" },
  { value: "#0d9488", name: "Teal" },
  { value: "#0284c7", name: "Sky Blue" },
  { value: "#2563eb", name: "Cobalt" },
  { value: "#7c3aed", name: "Violet" },
  { value: "#db2777", name: "Magenta" },
]

export const GRADIENT_SECTIONS: readonly GradientSection[] = [
  {
    title: "Cool tones",
    items: [
      { value: "linear-gradient(135deg, #2563eb, #2dd4bf)", name: "Lagoon" },
      { value: "linear-gradient(135deg, #1e1b4b, #2563eb)", name: "Deep Sapphire" },
      { value: "linear-gradient(135deg, #134e4a, #2dd4bf)", name: "Deep Teal" },
      { value: "linear-gradient(135deg, #20c997, #74c0fc)", name: "Ocean Mint" },
      { value: "linear-gradient(135deg, #94a3b8, #dbeafe)", name: "Misty Ice" },
      { value: "linear-gradient(135deg, #60a5fa, #bae6fd)", name: "Clear Sky" },
      { value: "linear-gradient(135deg, #6366f1, #38bdf8)", name: "Periwinkle" },
    ],
  },
  {
    title: "Warm tones",
    items: [
      { value: "linear-gradient(135deg, #fb7185, #fdba74)", name: "Coral Peach" },
      { value: "linear-gradient(135deg, #701a75, #be185d)", name: "Plum Wine" },
      { value: "linear-gradient(135deg, #451a03, #9a3412)", name: "Warm Mahogany" },
      { value: "linear-gradient(135deg, #f97316, #fdba74)", name: "Apricot Glow" },
      { value: "linear-gradient(135deg, #7c2d12, #d97706)", name: "Spiced Copper" },
      { value: "linear-gradient(135deg, #ec4899, #fda4af)", name: "Flamingo" },
      { value: "linear-gradient(135deg, #db2777, #f59e0b)", name: "Sunset Rose" },
    ],
  },
  {
    title: "Monochromatic",
    items: [
      { value: "linear-gradient(135deg, #292524, #57534e)", name: "Warm Charcoal" },
      { value: "linear-gradient(135deg, #78716c, #d6d3d1)", name: "Stone Mist" },
      { value: "linear-gradient(135deg, #e7e5e4, #ffffff)", name: "Soft Ivory" },
      { value: "linear-gradient(135deg, #f1f5f9, #cbd5e1)", name: "Pearl" },
      { value: "linear-gradient(135deg, #cbd5e1, #94a3b8)", name: "Silver Fog" },
      { value: "linear-gradient(135deg, #64748b, #334155)", name: "Slate" },
      { value: "linear-gradient(135deg, #1e293b, #0f172a)", name: "Midnight" },

      { value: "linear-gradient(135deg, #991b1b, #ef4444)", name: "Crimson Mono" },
      { value: "linear-gradient(135deg, #9a3412, #fb923c)", name: "Rust Mono" },
      { value: "linear-gradient(135deg, #a16207, #facc15)", name: "Gold Mono" },
      { value: "linear-gradient(135deg, #166534, #4ade80)", name: "Forest Mono" },
      { value: "linear-gradient(135deg, #0f766e, #2dd4bf)", name: "Teal Mono" },
      { value: "linear-gradient(135deg, #1e40af, #60a5fa)", name: "Cobalt Mono" },
      { value: "linear-gradient(135deg, #6b21a8, #c084fc)", name: "Violet Mono" },

      { value: "linear-gradient(135deg, #fda4af, #ffe4e6)", name: "Rose Tint" },
      { value: "linear-gradient(135deg, #fdba74, #ffedd5)", name: "Peach Tint" },
      { value: "linear-gradient(135deg, #fde047, #fef9c3)", name: "Butter Tint" },
      { value: "linear-gradient(135deg, #86efac, #dcfce7)", name: "Mint Tint" },
      { value: "linear-gradient(135deg, #67e8f9, #cffafe)", name: "Aqua Tint" },
      { value: "linear-gradient(135deg, #93c5fd, #dbeafe)", name: "Sky Tint" },
      { value: "linear-gradient(135deg, #f0abfc, #fae8ff)", name: "Orchid Tint" },
    ],
  },
  {
    title: "All gradients",
    items: [
      { value: "linear-gradient(135deg, #e2e8f0, #94a3b8)", name: "Brushed Silver" },
      { value: "linear-gradient(135deg, #cbd5e1, #1e293b)", name: "GraphiteFade" },
      { value: "linear-gradient(135deg, #404040, #171717)", name: "Obsidian" },
      { value: "linear-gradient(135deg, #1e1b4b, #312e81)", name: "Indigo Night" },
      { value: "linear-gradient(135deg, #713f12, #1c1917)", name: "Dark Bronze" },
      { value: "linear-gradient(135deg, #4f46e5, #818cf8)", name: "Iris" },
      { value: "linear-gradient(135deg, #7c3aed, #c084fc)", name: "Amethyst" },

      { value: "linear-gradient(135deg, #fce7f3, #fef3c7)", name: "Blush Cream" },
      { value: "linear-gradient(135deg, #fda4af, #fecdd3)", name: "Rosewater" },
      { value: "linear-gradient(135deg, #fdba74, #fde68a)", name: "Golden Hour" },
      { value: "linear-gradient(135deg, #86efac, #93c5fd)", name: "Seafoam" },
      { value: "linear-gradient(135deg, #bbf7d0, #bae6fd)", name: "Morning Dew" },
      { value: "linear-gradient(135deg, #c4b5fd, #fbcfe8)", name: "Lavender Pink" },
      { value: "linear-gradient(135deg, #f472b6, #f9a8d4)", name: "Peony" },

      { value: "linear-gradient(135deg, #8b5cf6, #ec4899)", name: "Electric Orchid" },
      { value: "linear-gradient(135deg, #f472b6, #fde047)", name: "Sherbet" },
      { value: "linear-gradient(135deg, #ef4444, #f97316)", name: "Ember" },
      { value: "linear-gradient(135deg, #14b8a6, #84cc16)", name: "Botanical" },
      { value: "linear-gradient(135deg, #3b82f6, #2dd4bf)", name: "Ocean Breeze" },
      { value: "linear-gradient(135deg, #6366f1, #38bdf8)", name: "Skyline" },
      { value: "linear-gradient(135deg, #a855f7, #ec4899)", name: "Berry Dusk" },

      { value: "linear-gradient(135deg, #ec4899, #f59e0b, #eab308)", name: "Solar Flare" },
      { value: "linear-gradient(135deg, #ef4444, #6366f1)", name: "Neon Pulse" },
      { value: "linear-gradient(135deg, #f59e0b, #10b981)", name: "Citrus Moss" },
      { value: "linear-gradient(135deg, #7f1d1d, #16a34a)", name: "Garnet Pine" },
      { value: "linear-gradient(135deg, #ea580c, #451a03)", name: "Burnt Sienna" },
      { value: "linear-gradient(135deg, #8b5cf6, #2dd4bf)", name: "Aurora" },
      { value: "linear-gradient(135deg, #a855f7, #84cc16)", name: "Prism" },

      { value: "linear-gradient(135deg, #e11d48, #f59e0b)", name: "Coral Horizon" },
      { value: "linear-gradient(135deg, #d97706, #fde047)", name: "Honeycomb" },
      { value: "linear-gradient(135deg, #c6a977, #f0e7db)", name: "Champagne Silk" },
      { value: "linear-gradient(135deg, #059669, #34d399)", name: "Jade" },
      { value: "linear-gradient(135deg, #0284c7, #38bdf8)", name: "Azure" },
      { value: "linear-gradient(135deg, #4338ca, #6366f1)", name: "Royal Blue" },
      { value: "linear-gradient(135deg, #7c3aed, #d946ef)", name: "Fuchsia" },
    ],
  },
]

export const DEFAULT_GRADIENT_COLORS: readonly NamedColor[] = [
  ...GRADIENT_SECTIONS[0].items,
]

export function normalizeHexInput(raw: string): string | null {
  const trimmed = raw.trim()
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    const [, r, g, b] = withHash
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return validHex(withHash) ? withHash.toLowerCase() : null
}

export function findColorName(value: string): string {
  const normalized = value.trim().toLowerCase()
  const match =
    DEFAULT_SOLID_COLORS.find((c) => c.value.toLowerCase() === normalized) ??
    FULL_SOLID_PALETTE.find((c) => c.value.toLowerCase() === normalized) ??
    GRADIENT_SECTIONS.flatMap((s) => s.items).find(
      (c) => c.value.toLowerCase() === normalized,
    )
  if (match) return match.name
  if (parseGradient(value)) return "Gradient"
  return value.toUpperCase()
}

export function collectDesignColors(brief: Pick<Brief, "pins" | "boardPages">): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  const push = (raw?: string) => {
    if (!raw) return
    const trimmed = raw.trim()
    if (!validHex(trimmed) && !parseGradient(trimmed)) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(validHex(trimmed) ? key : trimmed)
  }

  for (const pin of brief.pins) {
    push(pin.color)
    push(pin.fill)
    push(pin.stroke)
  }
  for (const page of brief.boardPages ?? []) {
    push(page.background)
  }

  return result
}

export interface BoardPhotoEntry {
  id: string
  src: string
  title: string
}

export function collectBoardPhotos(brief: Pick<Brief, "pins">): BoardPhotoEntry[] {
  const seen = new Set<string>()
  const photos: BoardPhotoEntry[] = []

  for (const pin of brief.pins) {
    if (pin.hidden || !pin.image) continue
    const src = pin.image.trim()
    if (!safeImage(src) || seen.has(src)) continue
    seen.add(src)
    photos.push({
      id: pin.id,
      src,
      title: pin.title?.trim() || "Board image",
    })
  }

  return photos
}

const photoPaletteCache = new Map<string, string[]>()

function colorDistanceSq(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

export function extractPhotoPalette(src: string): Promise<string[]> {
  if (photoPaletteCache.has(src)) {
    return Promise.resolve(photoPaletteCache.get(src) ?? [])
  }
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Promise.resolve([])
  }

  return new Promise<string[]>((resolve) => {
    const img = new Image()
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous"
    }

    img.onload = () => {
      try {
        const size = 40
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) {
          photoPaletteCache.set(src, [])
          resolve([])
          return
        }
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        const buckets = new Map<
          string,
          { count: number; r: number; g: number; b: number }
        >()
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 140) continue
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          // Quantize to 24-step buckets to group similar tones.
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`
          const entry = buckets.get(key)
          if (entry) {
            entry.count += 1
            entry.r += r
            entry.g += g
            entry.b += b
          } else {
            buckets.set(key, { count: 1, r, g, b })
          }
        }

        const sorted = [...buckets.values()].sort((a, b) => b.count - a.count)
        const pickedRgb: [number, number, number][] = []
        const pickedHex: string[] = []

        for (const bucket of sorted) {
          const avg: [number, number, number] = [
            Math.round(bucket.r / bucket.count),
            Math.round(bucket.g / bucket.count),
            Math.round(bucket.b / bucket.count),
          ]
          // Keep colors perceptually distinct.
          if (pickedRgb.some((p) => colorDistanceSq(p, avg) < 2600)) continue
          pickedRgb.push(avg)
          pickedHex.push(rgbHex(avg).toLowerCase())
          if (pickedHex.length >= 5) break
        }

        photoPaletteCache.set(src, pickedHex)
        resolve(pickedHex)
      } catch {
        // SecurityError (tainted canvas) or decoding failure.
        photoPaletteCache.set(src, [])
        resolve([])
      }
    }

    img.onerror = () => {
      photoPaletteCache.set(src, [])
      resolve([])
    }

    img.src = src
  })
}
