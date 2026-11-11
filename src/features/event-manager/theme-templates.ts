import { themes, type Brief } from "./model"
import { starterBoard, withSampleContent, withSamplePages } from "./theme-boards"

export function themeTemplate(theme: (typeof themes)[number]) {
  const base = starterBoard({
    name: theme.name, category: theme.category, description: theme.description,
    cover: theme.image, palette: [...theme.palette],
  })
  return {
    ...theme,
    pins: withSampleContent(base.pins, theme.id),
    boardPages: withSamplePages(base.boardPages, theme.id),
  }
}

/** Insert independent, editable copies without replacing existing page content. */
export function insertThemePages(
  brief: Brief,
  activePage: number,
  template: ReturnType<typeof themeTemplate>,
  selectedPages: number[],
) {
  const count = Math.max(brief.boardPages?.length ?? 1, ...brief.pins.map((p) => (p.page ?? 0) + 1))
  const pages = Array.from({ length: count }, (_, i) => brief.boardPages?.[i] ?? {
    title: `Page ${i + 1}`, background: i === 0 ? "#ebe8e1" : "#ffffff",
  })
  const replaceEmpty = !brief.pins.some((p) => (p.page ?? 0) === activePage)
  const at = replaceEmpty ? activePage : activePage + 1
  const removed = replaceEmpty ? 1 : 0
  const chosen = selectedPages.filter((i, index, all) => template.boardPages[i] && all.indexOf(i) === index)
  if (!chosen.length) throw new Error("Choose a template page first.")
  if (count - removed + chosen.length > 12) throw new Error("This board supports up to 12 pages. Remove a page before adding more.")
  const shift = chosen.length - removed
  return {
    firstPage: at,
    boardPages: [
      ...pages.slice(0, at),
      ...chosen.map((i) => ({ ...template.boardPages[i] })),
      ...pages.slice(at + removed),
    ],
    pins: [
      ...brief.pins.map((p) => (p.page ?? 0) >= at + removed ? { ...p, page: (p.page ?? 0) + shift } : p),
      ...chosen.flatMap((source, index) => template.pins
        .filter((p) => (p.page ?? 0) === source)
        .map(({ bind: _bind, ...p }) => ({ ...p, id: crypto.randomUUID(), page: at + index }))),
    ],
  }
}
