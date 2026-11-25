export type FontCategory =
  | "Sans-serif"
  | "Serif"
  | "Display"
  | "Handwritten"
  | "Monospace"

export interface BoardFontOption {
  value: string
  label: string
  category: FontCategory
  weights: readonly number[]
  googleFamily?: string
  aliases?: readonly string[]
}

export const FONT_WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Heavy",
}

export function fontWeightLabel(weight: number): string {
  return FONT_WEIGHT_LABELS[weight] ?? String(weight)
}

const RAW_BOARD_FONT_OPTIONS: readonly BoardFontOption[] = [
  // Sans-serif (existing + verified Google Fonts)
  {
    value: "'Inter', Arial, sans-serif",
    label: "Inter",
    category: "Sans-serif",
    weights: [100, 300, 400, 500, 600, 700, 800, 900],
    googleFamily: "Inter:wght@100;300;400;500;600;700;800;900",
  },
  {
    value: "'Poppins', Arial, sans-serif",
    label: "Poppins",
    category: "Sans-serif",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    googleFamily: "Poppins:wght@100;200;300;400;500;600;700;800;900",
  },
  {
    value: "'Montserrat', Arial, sans-serif",
    label: "Montserrat",
    category: "Sans-serif",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    googleFamily: "Montserrat:wght@100;200;300;400;500;600;700;800;900",
  },
  {
    value: "'Lato', Arial, sans-serif",
    label: "Lato",
    category: "Sans-serif",
    weights: [100, 300, 400, 700, 900],
    googleFamily: "Lato:wght@100;300;400;700;900",
  },
  {
    value: "'Open Sans', Arial, sans-serif",
    label: "Open Sans",
    category: "Sans-serif",
    weights: [300, 400, 500, 600, 700, 800],
    googleFamily: "Open+Sans:wght@300;400;500;600;700;800",
    aliases: ["opensans"],
  },
  {
    value: "Arial, sans-serif",
    label: "Sans serif",
    category: "Sans-serif",
    weights: [400, 700],
    aliases: ["arial", "sans serif", "sans-serif"],
  },
  {
    value: "'Anton', Impact, sans-serif",
    label: "Anton",
    category: "Sans-serif",
    weights: [400],
    googleFamily: "Anton",
  },
  {
    value: "'Archivo Black', Impact, sans-serif",
    label: "Archivo Black",
    category: "Sans-serif",
    weights: [400],
    googleFamily: "Archivo+Black",
    aliases: ["archivoblack"],
  },
  {
    value: "'Comfortaa', Arial, sans-serif",
    label: "Comfortaa",
    category: "Sans-serif",
    weights: [300, 400, 500, 600, 700],
    googleFamily: "Comfortaa:wght@300;400;500;600;700",
  },
  {
    value: "'DM Sans', Arial, sans-serif",
    label: "DM Sans",
    category: "Sans-serif",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    googleFamily: "DM+Sans:wght@100;200;300;400;500;600;700;800;900",
    aliases: ["dmsans"],
  },
  {
    value: "'Josefin Sans', Arial, sans-serif",
    label: "Josefin Sans",
    category: "Sans-serif",
    weights: [100, 200, 300, 400, 500, 600, 700],
    googleFamily: "Josefin+Sans:wght@100;200;300;400;500;600;700",
    aliases: ["josefinsans"],
  },
  {
    value: "'League Spartan', Arial, sans-serif",
    label: "League Spartan",
    category: "Sans-serif",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    googleFamily: "League+Spartan:wght@100;200;300;400;500;600;700;800;900",
    aliases: ["leaguespartan"],
  },
  {
    value: "'Quicksand', Arial, sans-serif",
    label: "Quicksand",
    category: "Sans-serif",
    weights: [300, 400, 500, 600, 700],
    googleFamily: "Quicksand:wght@300;400;500;600;700",
  },
  {
    value: "'Roboto', Arial, sans-serif",
    label: "Roboto",
    category: "Sans-serif",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    googleFamily: "Roboto:wght@100;200;300;400;500;600;700;800;900",
  },
  {
    value: "'Ubuntu', Arial, sans-serif",
    label: "Ubuntu",
    category: "Sans-serif",
    weights: [300, 400, 500, 700],
    googleFamily: "Ubuntu:wght@300;400;500;700",
  },
  {
    value: "'Work Sans', Arial, sans-serif",
    label: "Work Sans",
    category: "Sans-serif",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    googleFamily: "Work+Sans:wght@100;200;300;400;500;600;700;800;900",
    aliases: ["worksans"],
  },

  // Serif (existing + verified Google Fonts)
  {
    value: "'Playfair Display', Georgia, serif",
    label: "Playfair Display",
    category: "Serif",
    weights: [400, 500, 600, 700, 800, 900],
    googleFamily:
      "Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700",
    aliases: ["playfairdisplay"],
  },
  {
    value: "'Lora', Georgia, serif",
    label: "Lora",
    category: "Serif",
    weights: [400, 500, 600, 700],
    googleFamily: "Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700",
  },
  {
    value: "'Merriweather', Georgia, serif",
    label: "Merriweather",
    category: "Serif",
    weights: [300, 400, 500, 600, 700, 800, 900],
    googleFamily:
      "Merriweather:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700",
  },
  {
    value: "Georgia, serif",
    label: "Serif",
    category: "Serif",
    weights: [400, 700],
    aliases: ["georgia", "serif"],
  },
  {
    value: "'Abril Fatface', Georgia, serif",
    label: "Abril Fatface",
    category: "Serif",
    weights: [400],
    googleFamily: "Abril+Fatface",
    aliases: ["abrilfatface"],
  },
  {
    value: "'Alegreya', Georgia, serif",
    label: "Alegreya",
    category: "Serif",
    weights: [400, 500, 600, 700, 800, 900],
    googleFamily: "Alegreya:wght@400;500;600;700;800;900",
  },
  {
    value: "'Cardo', Georgia, serif",
    label: "Cardo",
    category: "Serif",
    weights: [400, 700],
    googleFamily: "Cardo:wght@400;700",
  },
  {
    value: "'Cormorant Garamond', Georgia, serif",
    label: "Cormorant Garamond",
    category: "Serif",
    weights: [300, 400, 500, 600, 700],
    googleFamily: "Cormorant+Garamond:wght@300;400;500;600;700",
    aliases: ["cormorantgaramond"],
  },
  {
    value: "'Courier Prime', monospace",
    label: "Courier Prime",
    category: "Serif",
    weights: [400, 700],
    googleFamily: "Courier+Prime:wght@400;700",
    aliases: ["courierprime"],
  },
  {
    value: "'EB Garamond', Georgia, serif",
    label: "EB Garamond",
    category: "Serif",
    weights: [400, 500, 600, 700, 800],
    googleFamily: "EB+Garamond:wght@400;500;600;700;800",
    aliases: ["ebgaramond"],
  },
  {
    value: "'Libre Baskerville', Georgia, serif",
    label: "Libre Baskerville",
    category: "Serif",
    weights: [400, 500, 600, 700],
    googleFamily: "Libre+Baskerville:wght@400;500;600;700",
    aliases: ["librebaskerville"],
  },
  {
    value: "'Noticia Text', Georgia, serif",
    label: "Noticia Text",
    category: "Serif",
    weights: [400, 700],
    googleFamily: "Noticia+Text:wght@400;700",
    aliases: ["noticiatext"],
  },
  {
    value: "'Old Standard TT', Georgia, serif",
    label: "Old Standard TT",
    category: "Serif",
    weights: [400, 700],
    googleFamily: "Old+Standard+TT:wght@400;700",
    aliases: ["oldstandardtt"],
  },
  {
    value: "'PT Serif', Georgia, serif",
    label: "PT Serif",
    category: "Serif",
    weights: [400, 700],
    googleFamily: "PT+Serif:wght@400;700",
    aliases: ["ptserif"],
  },
  {
    value: "'Radley', Georgia, serif",
    label: "Radley",
    category: "Serif",
    weights: [400],
    googleFamily: "Radley",
  },

  // Display (existing + verified Google Fonts)
  {
    value: "'Bebas Neue', Impact, sans-serif",
    label: "Bebas Neue",
    category: "Display",
    weights: [400],
    googleFamily: "Bebas+Neue",
    aliases: ["bebasneue"],
  },
  {
    value: "'Oswald', Impact, sans-serif",
    label: "Oswald",
    category: "Display",
    weights: [200, 300, 400, 500, 600, 700],
    googleFamily: "Oswald:wght@200;300;400;500;600;700",
  },
  {
    value: "'Audiowide', sans-serif",
    label: "Audiowide",
    category: "Display",
    weights: [400],
    googleFamily: "Audiowide",
  },
  {
    value: "'Bad Script', cursive",
    label: "Bad Script",
    category: "Display",
    weights: [400],
    googleFamily: "Bad+Script",
    aliases: ["badscript"],
  },
  {
    value: "'Bangers', Impact, sans-serif",
    label: "Bangers",
    category: "Display",
    weights: [400],
    googleFamily: "Bangers",
  },
  {
    value: "'Black Ops One', Impact, sans-serif",
    label: "Black Ops One",
    category: "Display",
    weights: [400],
    googleFamily: "Black+Ops+One",
    aliases: ["blackopsone"],
  },
  {
    value: "'Bungee', Impact, sans-serif",
    label: "Bungee",
    category: "Display",
    weights: [400],
    googleFamily: "Bungee",
  },
  {
    value: "'Cherry Cream Soda', cursive",
    label: "Cherry Cream Soda",
    category: "Display",
    weights: [400],
    googleFamily: "Cherry+Cream+Soda",
    aliases: ["cherrycreamsoda"],
  },
  {
    value: "'Germania One', serif",
    label: "Germania One",
    category: "Display",
    weights: [400],
    googleFamily: "Germania+One",
    aliases: ["germaniaone"],
  },
  {
    value: "'Kavoon', cursive",
    label: "Kavoon",
    category: "Display",
    weights: [400],
    googleFamily: "Kavoon",
  },
  {
    value: "'Lobster', cursive",
    label: "Lobster",
    category: "Display",
    weights: [400],
    googleFamily: "Lobster",
  },
  {
    value: "'Luckiest Guy', Impact, sans-serif",
    label: "Luckiest Guy",
    category: "Display",
    weights: [400],
    googleFamily: "Luckiest+Guy",
    aliases: ["luckiestguy"],
  },
  {
    value: "'Monoton', cursive",
    label: "Monoton",
    category: "Display",
    weights: [400],
    googleFamily: "Monoton",
  },
  {
    value: "'Permanent Marker', cursive",
    label: "Permanent Marker",
    category: "Display",
    weights: [400],
    googleFamily: "Permanent+Marker",
    aliases: ["permanentmarker"],
  },
  {
    value: "'Righteous', sans-serif",
    label: "Righteous",
    category: "Display",
    weights: [400],
    googleFamily: "Righteous",
  },
  {
    value: "'Shojumaru', cursive",
    label: "Shojumaru",
    category: "Display",
    weights: [400],
    googleFamily: "Shojumaru",
  },
  {
    value: "'Stardos Stencil', serif",
    label: "Stardos Stencil",
    category: "Display",
    weights: [400, 700],
    googleFamily: "Stardos+Stencil:wght@400;700",
    aliases: ["stardosstencil"],
  },
  {
    value: "'UnifrakturCook', serif",
    label: "UnifrakturCook",
    category: "Display",
    weights: [700],
    googleFamily: "UnifrakturCook:wght@700",
    aliases: ["unifrakturcook"],
  },

  // Handwritten / Script & Cursive (existing + verified Google Fonts)
  {
    value: "'Dancing Script', cursive",
    label: "Dancing Script",
    category: "Handwritten",
    weights: [400, 500, 600, 700],
    googleFamily: "Dancing+Script:wght@400;500;600;700",
    aliases: ["dancingscript"],
  },
  {
    value: "'Pacifico', cursive",
    label: "Pacifico",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Pacifico",
  },
  {
    value: "'Caveat', cursive",
    label: "Caveat",
    category: "Handwritten",
    weights: [400, 500, 600, 700],
    googleFamily: "Caveat:wght@400;500;600;700",
  },
  {
    value: "cursive",
    label: "Script",
    category: "Handwritten",
    weights: [400, 700],
  },
  {
    value: "'Allura', cursive",
    label: "Allura",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Allura",
  },
  {
    value: "'Alex Brush', cursive",
    label: "Alex Brush",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Alex+Brush",
    aliases: ["alexbrush"],
  },
  {
    value: "'Amatic SC', cursive",
    label: "Amatic SC",
    category: "Handwritten",
    weights: [400, 700],
    googleFamily: "Amatic+SC:wght@400;700",
    aliases: ["amaticsc"],
  },
  {
    value: "'Cedarville Cursive', cursive",
    label: "Cedarville Cursive",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Cedarville+Cursive",
    aliases: ["cedarvillecursive"],
  },
  {
    value: "'Great Vibes', cursive",
    label: "Great Vibes",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Great+Vibes",
    aliases: ["greatvibes"],
  },
  {
    value: "'Handlee', cursive",
    label: "Handlee",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Handlee",
  },
  {
    value: "'Parisienne', cursive",
    label: "Parisienne",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Parisienne",
  },
  {
    value: "'Petit Formal Script', cursive",
    label: "Petit Formal Script",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Petit+Formal+Script",
    aliases: ["petitformalscript"],
  },
  {
    value: "'Sacramento', cursive",
    label: "Sacramento",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Sacramento",
  },
  {
    value: "'Satisfy', cursive",
    label: "Satisfy",
    category: "Handwritten",
    weights: [400],
    googleFamily: "Satisfy",
  },
  {
    value: "'Tangerine', cursive",
    label: "Tangerine",
    category: "Handwritten",
    weights: [400, 700],
    googleFamily: "Tangerine:wght@400;700",
  },

  // Monospace
  {
    value: "'Roboto Mono', monospace",
    label: "Roboto Mono",
    category: "Monospace",
    weights: [100, 300, 400, 500, 600, 700],
    googleFamily: "Roboto+Mono:wght@100;300;400;500;600;700",
    aliases: ["robotomono"],
  },
  {
    value: "monospace",
    label: "Monospace",
    category: "Monospace",
    weights: [400, 700],
  },
] as const

function normalizeFontKey(name: string): string {
  return name.toLowerCase().replace(/['"\s_-]+/g, "")
}

export const BOARD_FONT_OPTIONS: readonly BoardFontOption[] = (() => {
  const seen = new Set<string>()
  const deduped: BoardFontOption[] = []
  for (const option of RAW_BOARD_FONT_OPTIONS) {
    const key = normalizeFontKey(option.label)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(option)
  }
  return deduped
})()

export interface TextStylePreset {
  id: string
  label: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  lineHeight: number
  previewSize: number
}

export const TEXT_STYLE_PRESETS: readonly TextStylePreset[] = [
  {
    id: "title",
    label: "Title",
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1.1,
    previewSize: 24,
  },
  {
    id: "subtitle",
    label: "Subtitle",
    fontFamily: "'Inter', Arial, sans-serif",
    fontSize: 28,
    fontWeight: 400,
    lineHeight: 1.3,
    previewSize: 18,
  },
  {
    id: "heading",
    label: "Heading",
    fontFamily: "'Montserrat', Arial, sans-serif",
    fontSize: 36,
    fontWeight: 700,
    lineHeight: 1.15,
    previewSize: 20,
  },
  {
    id: "subheading",
    label: "Subheading",
    fontFamily: "'Poppins', Arial, sans-serif",
    fontSize: 24,
    fontWeight: 600,
    lineHeight: 1.25,
    previewSize: 16,
  },
  {
    id: "section-header",
    label: "Section header",
    fontFamily: "'Oswald', Impact, sans-serif",
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.2,
    previewSize: 15,
  },
  {
    id: "body",
    label: "Body",
    fontFamily: "'Open Sans', Arial, sans-serif",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    previewSize: 13,
  },
] as const

export function resolvePinFontWeight(pin?: {
  fontWeight?: number
  bold?: boolean
}): number {
  if (!pin) return 400
  return pin.fontWeight ?? (pin.bold ? 700 : 400)
}

const loadedFamilies = new Set<string>()
let previewsLoaded = false

function primaryFamilyName(fontFamily: string): string {
  return fontFamily.split(",")[0].replace(/['"]/g, "").trim().toLowerCase()
}

export function findFontOption(fontFamily?: string): BoardFontOption {
  if (!fontFamily) return BOARD_FONT_OPTIONS[5] // Arial, sans-serif fallback
  const exact = BOARD_FONT_OPTIONS.find((opt) => opt.value === fontFamily)
  if (exact) return exact
  const target = primaryFamilyName(fontFamily)
  const normalizedTarget = normalizeFontKey(target)
  const byName = BOARD_FONT_OPTIONS.find(
    (opt) =>
      primaryFamilyName(opt.value) === target ||
      opt.label.toLowerCase() === target ||
      normalizeFontKey(opt.label) === normalizedTarget ||
      opt.aliases?.some((alias) => normalizeFontKey(alias) === normalizedTarget),
  )
  return (
    byName ?? {
      value: fontFamily,
      label: fontFamily.split(",")[0].replace(/['"]/g, "").trim() || "Custom",
      category: "Sans-serif",
      weights: [400, 700],
    }
  )
}

const GOOGLE_FONT_BATCH_SIZE = 12

function injectGoogleFontBatch(families: string[]): Promise<void> {
  if (typeof document === "undefined" || families.length === 0) {
    return Promise.resolve()
  }
  const query = families.map((f) => `family=${f}`).join("&")
  const href = `https://fonts.googleapis.com/css2?${query}&display=swap`

  return new Promise<void>((resolve) => {
    const existing = document.head.querySelector(`link[href="${href}"]`)
    if (existing) {
      document.fonts?.ready.then(() => resolve()).catch(() => resolve())
      return
    }
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.dataset.boardFonts = "true"
    link.onload = () => {
      document.fonts?.ready.then(() => resolve()).catch(() => resolve())
    }
    link.onerror = () => resolve()
    document.head.appendChild(link)
  })
}

function injectGoogleFontStylesheet(families: string[]): Promise<void> {
  if (typeof document === "undefined" || families.length === 0) {
    return Promise.resolve()
  }
  const pending = families.filter((fam) => !loadedFamilies.has(fam))
  if (pending.length === 0) {
    return document.fonts?.ready.then(() => undefined).catch(() => undefined)
  }

  for (const fam of pending) {
    loadedFamilies.add(fam)
  }

  const batches: string[][] = []
  for (let i = 0; i < pending.length; i += GOOGLE_FONT_BATCH_SIZE) {
    batches.push(pending.slice(i, i + GOOGLE_FONT_BATCH_SIZE))
  }
  return Promise.all(batches.map(injectGoogleFontBatch)).then(() => undefined)
}

export function ensureBoardFontLoaded(fontFamily?: string): Promise<void> {
  if (!fontFamily) return Promise.resolve()
  const option = findFontOption(fontFamily)
  if (!option.googleFamily) return Promise.resolve()
  return injectGoogleFontStylesheet([option.googleFamily])
}

export function ensureBoardFontsLoaded(
  pins: ReadonlyArray<{ fontFamily?: string }>,
): Promise<void> {
  const families = new Set<string>()
  for (const pin of pins) {
    if (!pin.fontFamily) continue
    const option = findFontOption(pin.fontFamily)
    if (option.googleFamily) families.add(option.googleFamily)
  }
  return injectGoogleFontStylesheet([...families])
}

export function loadAllPreviewFonts(): void {
  if (previewsLoaded) return
  previewsLoaded = true
  const all = BOARD_FONT_OPTIONS.flatMap((opt) =>
    opt.googleFamily ? [opt.googleFamily] : [],
  )
  void injectGoogleFontStylesheet(all)
}
