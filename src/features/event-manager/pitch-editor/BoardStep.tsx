import { useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Input } from "../../../components/ui/ui"
import {
  catalog,
  onCatalogSync,
  themePins,
  themes,
  type Brief,
  type Pin,
} from "../model"
import MoodBoardCanvas, { type ShelfItem } from "../mood-board/MoodBoardCanvas"
import { registeredPitchTheme, themeByName } from "../shared"
import StepHead from "./StepHead"

export type { ShelfItem }

function buildShelfItems(): ShelfItem[] {
  return [
    ...catalog.map((a) => ({
      key: `asset:${a.id}`,
      title: a.name,
      image: a.image,
      category: a.category,
      cutout: a.cutout,
    })),
    ...themes.map((t) => ({
      key: `theme:${t.id}`,
      title: t.name,
      image: t.image,
      category: "Themes",
    })),
  ]
}

export const shelf: ShelfItem[] = buildShelfItems()

onCatalogSync(() => {
  shelf.splice(0, shelf.length, ...buildShelfItems())
})

export function BoardStep({
  boardId,
  brief,
  update,
  readOnly,
  onPresent,
  fullScreen,
  onExitFullScreen,
}: {
  boardId?: string
  brief: Brief
  update: (p: Partial<Brief>) => void
  readOnly: boolean
  onPresent: () => void
  fullScreen: boolean
  onExitFullScreen: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [text, setText] = useState("")
  const noteRef = useRef<HTMLDivElement>(null)
  const setPins = (pins: Pin[]) => update({ pins })
  const add = (
    p: Omit<Pin, "id" | "x" | "y" | "rotation">,
    at?: { x: number; y: number; page?: number },
  ) => {
    const n = brief.pins.length
    const half = (p.width / 800) * 50
    const next = {
      ...p,
      page: at?.page ?? 0,
      id: crypto.randomUUID(),
      x: at
        ? Math.round(Math.max(0, Math.min(100 - half * 2, at.x - half)))
        : 8 + ((n * 9) % 55),
      y: at ? Math.round(Math.max(0, Math.min(80, at.y - 10))) : 8 + ((n * 13) % 60),
      rotation: p.image ? 0 : n % 2 ? 2 : -2,
    }
    setPins([...brief.pins, next])
    setSelected(next.id)
  }
  const addShelf = (key: string, at?: { x: number; y: number; page?: number }) => {
    const item = shelf.find((s) => s.key === key)
    if (item)
      add({ title: item.title, image: item.image, source: "", width: 220 }, at)
  }
  const addNote = () => {
    if (!text.trim()) return
    add({ title: text.trim(), text: text.trim(), width: 190 })
    setText("")
    setNoteOpen(false)
  }

  useEffect(() => {
    if (noteOpen) noteRef.current?.querySelector("input")?.focus()
  }, [noteOpen])

  const theme = themeByName(brief.theme)

  return (
    <div className="em-board-step">
      <StepHead
        eyebrow="02 / The mood board"
        title="The visual story"
        description="A collection of pegs and possibilities. No floor plans needed."
      />
      {noteOpen && !readOnly && (
        <div className="em-note-bar" ref={noteRef}>
          <Input
            aria-label="Note text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addNote()
              } else if (e.key === "Escape") setNoteOpen(false)
            }}
            placeholder="e.g. Lantern-lit aisle"
            maxLength={80}
          />
          <button
            type="button"
            className="em-btn em-btn--primary em-btn--sm"
            disabled={!text.trim()}
            onClick={addNote}
          >
            <Plus size={15} strokeWidth={1.5} aria-hidden /> Pin note
          </button>
        </div>
      )}

      <div className="em-canvas-wrap">
        <MoodBoardCanvas
          boardId={boardId}
          fullScreen={fullScreen}
          onPresent={onPresent}
          onExitFullScreen={onExitFullScreen}
          brief={brief}
          update={update}
          readOnly={readOnly}
          selected={selected}
          onSelect={setSelected}
          onDropItem={(key, x, y, page) => addShelf(key, { x, y, page })}
          shelf={shelf}
          onAddShelf={(key, page) => addShelf(key, { x: 50, y: 45, page })}
          palette={registeredPitchTheme(brief)?.palette}
          themeName={theme?.name}
          onThemePins={
            theme
              ? (page) =>
                  setPins([
                    ...brief.pins,
                    ...themePins(theme).map((p) => ({ ...p, page })),
                  ])
              : undefined
          }
        />
      </div>
    </div>
  )
}

export default BoardStep

