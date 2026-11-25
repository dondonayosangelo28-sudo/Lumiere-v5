export type HSV = {
  h: number
  s: number
  v: number
}
export const clampColour = (n: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, n))
export const validHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

export function hexRGB(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}
export function rgbHex(rgb: number[]): string {
  return `#${rgb
    .map((n) =>
      Math.round(clampColour(n, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}
export function hexHSV(hex: string): HSV {
  const [r, g, b] = hexRGB(hex).map((n) => n / 255)
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min
  const h = !d
    ? 0
    : max === r
      ? ((g - b) / d + 6) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4
  return { h: h * 60, s: max ? (d / max) * 100 : 0, v: max * 100 }
}
export function hsvHex({ h, s, v }: HSV): string {
  const saturation = s / 100,
    value = v / 100
  const part = (n: number) => {
    const k = (n + h / 60) % 6
    return (
      255 * (value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1)))
    )
  }
  return rgbHex([part(5), part(3), part(1)])
}

/** Gradient presets, matching the style tiles shown in the picker. */
export const GRADIENT_STYLES = [
  {
    id: "diagonal",
    label: "Diagonal",
    css: (s: string) => `linear-gradient(135deg, ${s})`,
  },
  {
    id: "horizontal",
    label: "Left to right",
    css: (s: string) => `linear-gradient(90deg, ${s})`,
  },
  {
    id: "vertical",
    label: "Top to bottom",
    css: (s: string) => `linear-gradient(180deg, ${s})`,
  },
  {
    id: "radial",
    label: "Radial",
    css: (s: string) => `radial-gradient(circle, ${s})`,
  },
  {
    id: "reverse",
    label: "Reverse diagonal",
    css: (s: string) => `linear-gradient(45deg, ${s})`,
  },
] as const
export type GradientStyle = typeof GRADIENT_STYLES[number]["id"]
export type Gradient = {
  style: GradientStyle
  stops: string[]
}
export const MAX_GRADIENT_STOPS = 5

export function gradientCss({ style, stops }: Gradient): string {
  const preset =
    GRADIENT_STYLES.find((g) => g.id === style) ?? GRADIENT_STYLES[0]
  return preset.css(stops.join(", "))
}

/** Parses only gradients this picker produces, so stored values stay predictable. */
export function parseGradient(value: string): Gradient | null {
  const m = value
    .trim()
    .match(
      /^(linear-gradient\((\d+)deg|radial-gradient\(circle), ((?:#[0-9a-f]{6}, )+#[0-9a-f]{6})\)$/i,
    )
  if (!m) return null
  const style =
    m[2] === undefined
      ? "radial"
      : GRADIENT_STYLES.find((g) =>
          g.css("x").startsWith(`linear-gradient(${m[2]}deg`),
        )?.id
  if (!style) return null
  const stops = m[3].split(", ").map((c) => c.toLowerCase())
  return stops.length <= MAX_GRADIENT_STOPS ? { style, stops } : null
}

/** A solid HEX or a picker gradient; anything else falls back. */
export const safePaint = (value: string | undefined, fallback: string) =>
  value && (validHex(value) || parseGradient(value)) ? value : fallback
