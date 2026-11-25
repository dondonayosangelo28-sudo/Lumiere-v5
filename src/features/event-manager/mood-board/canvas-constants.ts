import {
  CloudUpload,
  Compass,
  Images,
  LayoutTemplate,
  PenTool,
  Shapes,
  SlidersHorizontal,
  Type,
  type LucideIcon,
} from "lucide-react"
import { PAGE_H } from "./Board"
import type { Pin } from "../model"

export const LEGACY_PAPER = "#ebe8e1"
export const NEW_PAPER = "#ffffff"
export const PEN_COLORS = [
  "#292524",
  "#7a8069",
  "#e11d48",
  "#f59e0b",
  "#16a34a",
  "#2563eb",
  "#ffffff",
]
import { BOARD_FONT_OPTIONS } from "./board-fonts"

export const FONTS = BOARD_FONT_OPTIONS.map(
  (font) => [font.value, font.label] as const,
)

export type Draft = Omit<Pin, "id" | "rotation" | "page"> & { rotation?: number }

export const frame = (x: number, y: number, width: number, height: number, rotation = 0): Draft => ({
  title: "Photo frame",
  kind: "frame",
  x,
  y,
  width,
  height,
  rotation,
})

export const words = (
  title: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<Pin> = {},
): Draft => ({
  title,
  text,
  kind: "text",
  x,
  y,
  width,
  height,
  fontSize: 18,
  ...extra,
})

/** Starter layouts. Positions are % of the page; sizes use the 800 x 450 logical page. */
export const TEMPLATES: { id: string; name: string; build: (palette: readonly string[]) => Draft[] }[] = [
  {
    id: "hero",
    name: "Editorial hero",
    build: (c) => [
      frame(4, 8, 420, 420),
      words("Heading", "Your event title", 60, 14, 300, 90, { fontSize: 40, bold: true }),
      words("Text", "A few words about the mood, the guests and the moment.", 60, 38, 290, 100),
      ...c.slice(0, 3).map((fill, i): Draft => ({ title: "Swatch", kind: "circle", fill, x: 60 + i * 8, y: 70, width: 52, height: 52 })),
    ],
  },
  {
    id: "grid",
    name: "Grid of four",
    build: () => [
      words("Heading", "Inspiration", 6, 5, 500, 60, { fontSize: 32, bold: true }),
      frame(6, 20, 344, 175),
      frame(51, 20, 344, 175),
      frame(6, 58, 344, 175),
      frame(51, 58, 344, 175),
    ],
  },
  {
    id: "palette",
    name: "Colour palette",
    build: (c) => [
      words("Heading", "Colour palette", 6, 8, 500, 60, { fontSize: 32, bold: true }),
      ...c.flatMap((fill, i): Draft[] => [
        { title: "Swatch", kind: "rect", fill, radius: 12, x: 6 + i * 30, y: 26, width: 216, height: 250 },
        words("Colour code", fill.toUpperCase(), 6 + i * 30, 80, 216, 40, { fontSize: 16, letterSpacing: 120 }),
      ]),
    ],
  },
  {
    id: "collage",
    name: "Collage",
    build: () => [
      frame(6, 10, 300, 220, -4),
      frame(40, 16, 300, 220, 3),
      frame(22, 50, 280, 210, -1),
      { title: "Note", text: "What should guests feel?", kind: "sticky", fill: "#fff1b8", fontSize: 18, x: 72, y: 58, width: 170, height: 130, rotation: 2 },
    ],
  },
  {
    id: "quote",
    name: "Quote",
    build: (c) => [
      { title: "Background", kind: "rect", fill: c[1] ?? "#f0e7db", x: 0, y: 0, width: 800, height: PAGE_H },
      words("Quote", "\u201cA feeling, not a floor plan.\u201d", 10, 30, 640, 150, { fontSize: 44, italic: true, fontFamily: "Georgia, serif", align: "center" }),
      words("Caption", "The client brief", 10, 70, 640, 40, { fontSize: 14, align: "center", uppercase: true, letterSpacing: 200 }),
    ],
  },
]

export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n))

export type Tab =
  | "library"
  | "templates"
  | "elements"
  | "text"
  | "inspiration"
  | "uploads"
  | "draw"
  | "layers"
  | "fonts"
  | "textColor"

export const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "library", label: "Library", icon: Images },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "text", label: "Text", icon: Type },
  { id: "inspiration", label: "Inspiration", icon: Compass },
  { id: "uploads", label: "Uploads", icon: CloudUpload },
  { id: "draw", label: "Draw", icon: PenTool },
  { id: "layers", label: "Edit", icon: SlidersHorizontal },
]

export type ShelfItem = {
  cutout?: boolean
  key: string
  title: string
  image: string
  category: string
}

