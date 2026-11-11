import { newBrief, themes, type Brief, type Pin } from './model';

/** Standalone, reusable theme mood boards. Stored apart from client event pitches. */
export interface ThemeDetails { name: string; category: string; description: string; cover?: string; palette: string[] }
export interface ThemePage { title: string; background: string }
export interface ThemeBoard { id: string; details: ThemeDetails; pins: Pin[]; boardPages: ThemePage[]; createdAt: string; updatedAt: string; /** Version of sample content applied to a starter board. */ samples?: number }

type StudioUser = { email: string };
const namespace = 'lumiere-event-manager-themes-v1';
const key = (user: StudioUser) => `${namespace}:${user.email.trim().toLowerCase()}`;

export const DEFAULT_PALETTE = ['#d6c7b3', '#f0e7db', '#7a8069'];
export const MAX_COLOURS = 6;
export const QUOTE_PAPER = '#efe9df';
export const HEX = /^#[0-9a-f]{6}$/i;
export const titleText = (d: ThemeDetails) => (d.name.trim() && d.name.trim() !== 'Untitled theme' ? d.name.trim() : 'Your theme title');
export const descriptionText = (d: ThemeDetails) => d.description.trim() || 'Theme inspiration: a few words about the mood, the textures and the feeling.';


/** Bundled photography and copy for the five sample themes (Inspiration x4, Collage x3). */
const img = (theme: string, i: number) => `/event-manager-images/samples/${theme}-${i}.webp`;
const SAMPLE_VERSION = 2;
const GENERIC_QUOTE = '\u201cA feeling, not a floor plan.\u201d';
const GENERIC_CAPTION = 'Theme inspiration';
const GENERIC_NOTE = 'What should guests feel when they arrive?';
export const SAMPLE_CONTENT: Record<string, { file: string; images: string[]; quote: string; caption: string; note: string; paper: string; quotePaper: string }> = {
  garden: {
    file: 'garden',
    paper: '#ebeadf',
    quotePaper: '#dfe0d1',
    images: ['Linen place setting', 'Garden roses in a vase', 'Crystal glassware', 'Florals and candlelight', 'Candlelit long table', 'Centrepiece styling', 'Reception table detail'],
    quote: '\u201cLove grows best in little gardens.\u201d',
    caption: 'Garden romance',
    note: 'Loose garden roses, ivory linen and low candlelight on every table.',
  },
  christmas: {
    file: 'christmas',
    paper: '#ece4d4',
    quotePaper: '#ded0b4',
    images: ['Candlelit Christmas table', 'Gold and red baubles', 'Evergreen wreath with candles', 'Gold candle holders', 'Long table by candlelight', 'Ribbon-tied candle', 'Miniature tree vignette'],
    quote: '\u201cThe best of all gifts around any tree is the presence of a happy family.\u201d',
    caption: 'A golden Christmas',
    note: 'Evergreen garlands, warm brass and a glow of candles at every place.',
  },
  birthday: {
    file: 'birthday',
    paper: '#f6edf1',
    quotePaper: '#ebdee5',
    images: ['Balloon celebration', 'Dessert table', 'Balloons on the table', 'Birthday banner', 'Illuminated number', 'Balloon bouquet', 'Cake balloon detail'],
    quote: '\u201cCount your life by smiles, not tears.\u201d',
    caption: 'A reason to celebrate',
    note: 'Bold balloon clusters, a statement cake and a personal welcome sign.',
  },
  newyear: {
    file: 'newyear',
    paper: '#e9e5de',
    quotePaper: '#d9d0c1',
    images: ['Champagne and confetti', 'Gold glitter texture', 'Glasses ready for a toast', 'Gold bells and confetti', 'Metallic foil backdrop', 'Balloons and streamers', 'Midnight confetti'],
    quote: '\u201cCheers to a new year and another chance to get it right.\u201d',
    caption: 'After the last midnight',
    note: 'Metallic foil backdrop, champagne tower and a countdown moment at 11:59.',
  },
  corporate: {
    file: 'corporate',
    paper: '#eeece8',
    quotePaper: '#e0dbd3',
    images: ['Keynote audience', 'Networking dinner table', 'Speaker on stage', 'Stage lighting', 'Glassware for the reception', 'Banquet room layout', 'Awards display'],
    quote: '\u201cGreat things in business are never done by one person.\u201d',
    caption: 'Beautifully on brand',
    note: 'Brand colours in the lighting, a clear stage sightline and an easy welcome desk.',
  },
};

/** Tint untouched starter page backgrounds to complement the sample theme. */
export function withSamplePages(pages: ThemePage[], themeId: string): ThemePage[] {
  const c = SAMPLE_CONTENT[themeId];
  if (!c) return pages;
  return pages.map((pg, i) => {
    const original = i === 4 ? QUOTE_PAPER : '#ffffff';
    if (i > 4 || pg.background.toLowerCase() !== original) return pg;
    return { ...pg, background: i === 4 ? c.quotePaper : c.paper };
  });
}

/** Fill empty starter frames and generic starter copy; anything a user changed is kept. */
export function withSampleContent(pins: Pin[], themeId: string): Pin[] {
  const c = SAMPLE_CONTENT[themeId];
  if (!c) return pins;
  const order = [1, 3];
  const slots = new Map<string, number>();
  let next = 0;
  for (const page of order) for (const p of pins) if (p.page === page && p.kind === 'frame' && !p.bind) slots.set(p.id, next++);
  return pins.map((p) => {
    const i = slots.get(p.id);
    if (i !== undefined && !p.image && i < c.images.length) return { ...p, image: img(c.file, i + 1), title: c.images[i] };
    if (p.page === 4 && p.kind === 'text' && p.text === GENERIC_QUOTE) return { ...p, text: c.quote };
    if (p.page === 4 && p.kind === 'text' && p.text === GENERIC_CAPTION) return { ...p, text: c.caption };
    if (p.kind === 'sticky' && p.text === GENERIC_NOTE) return { ...p, text: c.note };
    return p;
  });
}

const sampleStarter = (t: (typeof themes)[number], now: string): ThemeBoard => {
  const details: ThemeDetails = { name: t.name, category: t.category, description: t.description, cover: t.image, palette: [...t.palette] };
  const base = starterBoard(details);
  return { id: `starter-${t.id}`, details, boardPages: withSamplePages(base.boardPages, t.id), pins: withSampleContent(base.pins, t.id), createdAt: now, updatedAt: now, samples: SAMPLE_VERSION };
};

type ThemeCollection = { version: 2; boards: ThemeBoard[] };
const persistThemes = (user: StudioUser, boards: ThemeBoard[]) =>
  localStorage.setItem(key(user), JSON.stringify({ version: 2, boards } satisfies ThemeCollection));

/** Migrate legacy lists once, including editable starter themes. Deleted starters stay deleted. */
export function listThemeBoards(user: StudioUser): ThemeBoard[] {
  const raw = localStorage.getItem(key(user));
  const value = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(value)) {
    if (value?.version !== 2 || !Array.isArray(value.boards)) throw new Error('The theme collection could not be read.');
    // One-time upgrade of sample boards created before sample content existed.
    let changed = false;
    const boards = (value.boards as ThemeBoard[]).map((b) => {
      const themeId = b.id.startsWith('starter-') ? b.id.slice(8) : '';
      if (!SAMPLE_CONTENT[themeId] || (b.samples ?? 0) >= SAMPLE_VERSION) return b;
      changed = true;
      const v = b.samples ?? 0;
      return {
        ...b,
        // Each step runs once, so later user edits (like emptying a frame) are never undone.
        pins: v < 1 ? withSampleContent(b.pins, themeId) : b.pins,
        boardPages: v < 2 ? withSamplePages(b.boardPages, themeId) : b.boardPages,
        samples: SAMPLE_VERSION,
      };
    });
    if (changed) persistThemes(user, boards);
    return boards;
  }
  const now = new Date().toISOString();
  const starters: ThemeBoard[] = themes.map((t) => sampleStarter(t, now));
  const boards = [...starters, ...value];
  persistThemes(user, boards);
  return boards;
}

export function deleteThemeBoard(user: StudioUser, id: string): void {
  const boards = listThemeBoards(user);
  persistThemes(user, boards.filter((b) => b.id !== id));
}

export function saveThemeBoard(user: StudioUser, board: Omit<ThemeBoard, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): ThemeBoard {
  const list = listThemeBoards(user);
  const existing = list.find((b) => b.id === board.id);
  const now = new Date().toISOString();
  const saved: ThemeBoard = { ...board, id: existing?.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now, ...(existing?.samples ? { samples: existing.samples } : {}) };
  try {
    persistThemes(user, existing ? list.map((b) => b.id === saved.id ? saved : b) : [...list, saved]);
  } catch {
    throw new Error('This browser is out of storage space. Remove a large upload and try again.');
  }
  return saved;
}

let n = 0;
const pin = (page: number, p: Omit<Pin, 'id' | 'page' | 'rotation'> & { rotation?: number }): Pin => ({ rotation: 0, ...p, id: `${Date.now().toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`, page });
const frame = (page: number, x: number, y: number, width: number, height: number, rotation = 0, bind?: string): Pin => pin(page, { title: 'Photo frame', kind: 'frame', x, y, width, height, rotation, bind });
const text = (page: number, title: string, value: string, x: number, y: number, width: number, height: number, extra: Partial<Pin> = {}): Pin => pin(page, { title, text: value, kind: 'text', x, y, width, height, fontSize: 18, ...extra });

/** Page 1 swatches: up to five dots under the hero text. */
const heroSwatches = (palette: string[]) => palette.slice(0, 5).map((fill, i) => pin(0, { title: 'Swatch', kind: 'circle', fill, x: 60 + i * 8, y: 70, width: 52, height: 52, bind: `hero:${i}` }));

/** Page 3 swatches and hex codes, spread across the page for any palette size. */
const paletteSwatches = (palette: string[]) => {
  const count = Math.max(1, palette.length), gap = 2, w = (88 - gap * (count - 1)) / count;
  return palette.flatMap((fill, i) => [
    pin(2, { title: 'Swatch', kind: 'rect', fill, radius: 12, x: 6 + i * (w + gap), y: 26, width: Math.round(w * 8), height: 250, bind: `pal:${i}` }),
    text(2, 'Colour code', fill.toUpperCase(), 6 + i * (w + gap), 80, Math.round(w * 8), 40, { fontSize: count > 4 ? 13 : 16, letterSpacing: 120, bind: `hex:${i}` }),
  ]);
};

const coverPin = (d: ThemeDetails): Pin => {
  const p = frame(0, 4, 8, 420, 420, 0, 'cover');
  return d.cover ? { ...p, kind: 'image', image: d.cover, title: 'Cover image' } : p;
};

/** The five starter pages every new theme board includes. All content is editable canvas objects. */
export function starterBoard(d: ThemeDetails): { pins: Pin[]; boardPages: ThemePage[] } {
  return {
    boardPages: [
      { title: 'Editorial hero', background: '#ffffff' },
      { title: 'Inspiration', background: '#ffffff' },
      { title: 'Colour palette', background: '#ffffff' },
      { title: 'Collage', background: '#ffffff' },
      { title: 'Quote', background: QUOTE_PAPER },
    ],
    pins: [
      coverPin(d),
      text(0, 'Heading', titleText(d), 60, 14, 300, 90, { fontSize: 40, bold: true, bind: 'title' }),
      text(0, 'Text', descriptionText(d), 60, 38, 290, 100, { bind: 'description' }),
      ...heroSwatches(d.palette),
      text(1, 'Heading', 'Inspiration', 6, 5, 500, 60, { fontSize: 32, bold: true }),
      frame(1, 6, 20, 344, 175), frame(1, 51, 20, 344, 175), frame(1, 6, 58, 344, 175), frame(1, 51, 58, 344, 175),
      text(2, 'Heading', 'Colour palette', 6, 8, 500, 60, { fontSize: 32, bold: true }),
      ...paletteSwatches(d.palette),
      frame(3, 6, 10, 300, 220, -4), frame(3, 40, 16, 300, 220, 3), frame(3, 22, 50, 280, 210, -1),
      pin(3, { title: 'Note', text: 'What should guests feel when they arrive?', kind: 'sticky', fill: '#fff1b8', fontSize: 18, x: 72, y: 58, width: 170, height: 130, rotation: 2 }),
      text(4, 'Quote', '\u201cA feeling, not a floor plan.\u201d', 10, 30, 640, 150, { fontSize: 44, italic: true, fontFamily: 'Georgia, serif', align: 'center' }),
      text(4, 'Caption', 'Theme inspiration', 10, 70, 640, 40, { fontSize: 14, align: 'center', uppercase: true, letterSpacing: 200 }),
    ],
  };
}

/** Linked content property for each binding; editing it on the canvas ends the link. */
const boundValue = (p: Pin) => (p.bind === 'cover' ? `${p.kind}|${p.image ?? ''}` : p.bind?.startsWith('hex:') || p.bind === 'title' || p.bind === 'description' ? p.text : p.fill);

/** Drop the link on any bound object whose linked content was changed by hand. */
export function unlinkEdited(prev: Pin[], next: Pin[]): Pin[] {
  const before = new Map(prev.map((p) => [p.id, p]));
  return next.map((p) => {
    if (!p.bind) return p;
    const old = before.get(p.id);
    // Objects new to the canvas (such as duplicates) are never linked.
    if (old?.bind === p.bind && boundValue(old) === boundValue(p)) return p;
    const { bind: _bind, ...rest } = p;
    return rest;
  });
}

/** Push Theme details into objects that are still linked. Customised objects are left alone. */
export function applyDetails(pins: Pin[], d: ThemeDetails): Pin[] {
  let out = pins.map((p) => {
    if (p.bind === 'title') return { ...p, text: titleText(d) };
    if (p.bind === 'description') return { ...p, text: descriptionText(d) };
    if (p.bind === 'cover') return d.cover ? { ...p, kind: 'image' as const, image: d.cover, title: 'Cover image' } : { ...p, kind: 'frame' as const, image: undefined, title: 'Photo frame' };
    return p;
  });
  // Rebuild a swatch group while it is fully linked, so colours can be added or removed.
  const regroup = (prefixes: string[], page: number, build: () => Pin[]) => {
    const group = out.filter((p) => prefixes.some((x) => p.bind?.startsWith(x)));
    if (!group.length) return;
    const sizes = prefixes.map((x) => group.filter((p) => p.bind!.startsWith(x)).map((p) => Number(p.bind!.split(':')[1])).sort((m, k) => m - k));
    const intact = sizes.every((list) => list.length === sizes[0].length && list.every((v, i) => v === i));
    if (intact) {
      const keep = new Map(group.map((p) => [p.bind, p]));
      const at = out.indexOf(group[0]);
      const fresh = build().map((p) => { const old = keep.get(p.bind); return old ? { ...p, id: old.id, rotation: old.rotation } : p; });
      const rest = out.filter((p) => !group.includes(p));
      const before = out.slice(0, at).filter((p) => !group.includes(p)).length;
      out = [...rest.slice(0, before), ...fresh, ...rest.slice(before)];
      return;
    }
    out = out.map((p) => {
      const m = p.bind?.match(/^(hero|pal|hex):(\d+)$/);
      const c = m && d.palette[Number(m[2])];
      if (!m || !c || p.page !== page) return p;
      return m[1] === 'hex' ? { ...p, text: c.toUpperCase() } : { ...p, fill: c };
    });
  };
  regroup(['hero:'], 0, () => heroSwatches(d.palette));
  regroup(['pal:', 'hex:'], 2, () => paletteSwatches(d.palette));
  return out;
}

/** Downscale an uploaded cover image into a compact WebP data URL. */
export async function coverFromFile(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use a PNG, JPEG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('The maximum original size is 15 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let image = canvas.toDataURL('image/webp', 0.8);
  if (image.length > 300_000) image = canvas.toDataURL('image/webp', 0.6);
  if (!image.startsWith('data:image/webp')) image = canvas.toDataURL('image/jpeg', 0.75);
  if (image.length > 400_000) throw new Error('This image is too large; try a smaller copy.');
  return image;
}

/** Copy a registered board into a pitch, never sharing editable data or detail bindings. */
export function themePitchBrief(board: ThemeBoard): Brief {
  const copy = structuredClone(board);
  return {
    ...newBrief(copy.details.name),
    registeredTheme: { id: copy.id, ...copy.details },
    boardPages: copy.boardPages,
    pins: copy.pins.map(({ bind: _bind, ...p }) => ({ ...p, id: crypto.randomUUID() })),
  };
}
