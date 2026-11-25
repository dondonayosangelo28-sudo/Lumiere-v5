import type { RefObject } from "react"
import { Menu } from "@base-ui/react/menu"
import { ChevronDown, MoreVertical, StickyNote, Trash2, X } from "lucide-react"
import Dropdown from "../../../components/ui/Dropdown"
import { Button, IconButton, cx } from "../../../components/ui/ui"
import type { BoardNote } from "./board-comments"

export type NotesFilterScope = "current" | "all"

function formatNoteTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function BoardCommentsPanel({
  currentPage,
  notes,
  scope,
  onScopeChange,
  activeNoteId,
  onSelectNote,
  onAddNote,
  onClose,
  canAddNotes,
  canDeleteNotes,
  onDeleteNote,
  portalContainer,
}: {
  currentPage: number
  notes: BoardNote[]
  scope: NotesFilterScope
  onScopeChange: (scope: NotesFilterScope) => void
  activeNoteId: string | null
  onSelectNote: (note: BoardNote) => void
  onAddNote: () => void
  onClose: () => void
  canAddNotes: boolean
  canDeleteNotes: boolean
  onDeleteNote: (noteId: string) => void
  portalContainer?: RefObject<HTMLDivElement | null>
}) {
  const filtered =
    scope === "current"
      ? notes.filter((n) => n.page === currentPage)
      : notes

  const pagePinNumbers = new Map<string, number>()
  const countsByPage = new Map<number, number>()
  for (const n of notes) {
    const nextNum = (countsByPage.get(n.page) ?? 0) + 1
    countsByPage.set(n.page, nextNum)
    pagePinNumbers.set(n.id, nextNum)
  }

  return (
    <aside
      aria-label="Notes panel"
      className="pointer-events-auto absolute top-3 right-3 z-20 flex max-h-[calc(100%-64px)] w-72 max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl border border-line bg-card/95 text-foreground shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="relative min-w-0 flex-1">
          <Dropdown
            aria-label="Filter notes"
            value={scope}
            onChange={(e) => onScopeChange(e.target.value as NotesFilterScope)}
            className="h-8 w-full appearance-none rounded-lg border border-line bg-elev pr-8 pl-2.5 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
          >
            <option value="current">Current page</option>
            <option value="all">All pages</option>
          </Dropdown>
          <ChevronDown
            size={14}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        <IconButton
          type="button"
          icon={X}
          label="Close notes panel"
          onClick={onClose}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-3 py-8 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {scope === "current"
                ? "No notes on this page."
                : "No notes on this board."}
            </p>
            {canAddNotes && (
              <Button
                type="button"
                variant="outline"
                icon={StickyNote}
                onClick={onAddNote}
                className="h-8 px-3 text-xs"
              >
                Add note
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((note) => {
              const isActive = note.id === activeNoteId
              const pinNumber = pagePinNumbers.get(note.id) ?? 1
              return (
                <li key={note.id} className="relative">
                  <div
                    className={cx(
                      "rounded-xl border p-2.5 transition-colors",
                      isActive
                        ? "border-cyan-500/60 bg-cyan-500/10"
                        : "border-line bg-elev/60 hover:bg-elev",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectNote(note)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                          {pinNumber}
                        </span>
                        <span className="truncate text-xs font-semibold text-foreground">
                          {note.authorName}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatNoteTime(note.createdAt)}
                        </span>
                        {canDeleteNotes && (
                          <Menu.Root modal={false}>
                            <Menu.Trigger
                              type="button"
                              aria-label="Note options"
                              title="Note options"
                              onClick={(e) => e.stopPropagation()}
                              className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-fg/10 hover:text-foreground"
                            >
                              <MoreVertical size={13} aria-hidden />
                            </Menu.Trigger>
                            <Menu.Portal container={portalContainer}>
                              <Menu.Positioner
                                sideOffset={6}
                                align="end"
                                collisionPadding={8}
                                className="pointer-events-auto z-[110] max-w-[calc(100vw-16px)]"
                              >
                                <Menu.Popup
                                  aria-label="Note actions"
                                  className="w-40 overflow-hidden rounded-xl border border-border bg-card p-1 text-foreground shadow-2xl outline-none animate-pop"
                                >
                                  <Menu.Item
                                    onClick={() => onDeleteNote(note.id)}
                                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-600 outline-none transition-colors hover:bg-elev data-highlighted:bg-elev focus-visible:bg-elev dark:text-rose-400"
                                  >
                                    <Trash2 size={14} className="shrink-0" aria-hidden />
                                    <span>Delete note</span>
                                  </Menu.Item>
                                </Menu.Popup>
                              </Menu.Positioner>
                            </Menu.Portal>
                          </Menu.Root>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectNote(note)}
                      className="mt-1.5 block w-full text-left"
                    >
                      <p className="line-clamp-2 text-xs leading-snug text-foreground">
                        {note.body}
                      </p>
                      {scope !== "current" && (
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          Page {note.page + 1}
                        </div>
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
