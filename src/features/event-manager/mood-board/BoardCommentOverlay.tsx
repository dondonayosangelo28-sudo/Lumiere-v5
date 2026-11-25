import { useEffect, useRef, useState, type RefObject } from "react"
import { Menu } from "@base-ui/react/menu"
import { MoreVertical, Send, Trash2, X } from "lucide-react"
import { Button, IconButton, cx } from "../../../components/ui/ui"
import type { Pin } from "../model"
import { PAGE_H, pinHeight, pinWidthPct } from "./Board"
import {
  createBoardNote,
  resolveNoteCoords,
  type BoardNote,
} from "./board-comments"
import { clamp } from "./canvas-constants"

export type DraftNoteAnchor = {
  page: number
  x: number
  y: number
  pinId?: string
  offsetX?: number
  offsetY?: number
}

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

export default function BoardCommentOverlay({
  boardId,
  pageIndex,
  pins,
  notes,
  activeNoteId,
  onSelectNote,
  draftPin,
  onPlaceDraft,
  onCancelDraft,
  canAddNotes,
  canDeleteNotes,
  onDeleteNote,
  portalContainer,
  panning,
  onNoteCreated,
}: {
  boardId: string
  pageIndex: number
  pins: Pin[]
  notes: BoardNote[]
  activeNoteId: string | null
  onSelectNote: (id: string | null) => void
  draftPin: DraftNoteAnchor | null
  onPlaceDraft: (anchor: DraftNoteAnchor) => void
  onCancelDraft: () => void
  canAddNotes: boolean
  canDeleteNotes: boolean
  onDeleteNote: (noteId: string) => void
  portalContainer?: RefObject<HTMLDivElement | null>
  panning: boolean
  onNoteCreated: (note: BoardNote) => void
}) {
  const [draftText, setDraftText] = useState("")
  const [draftError, setDraftError] = useState("")
  const draftInputRef = useRef<HTMLTextAreaElement>(null)
  const composerCardRef = useRef<HTMLDivElement>(null)
  const noteCardRef = useRef<HTMLDivElement>(null)

  const pageNotes = notes.filter((n) => n.page === pageIndex)
  const isDraftOnPage = canAddNotes && draftPin?.page === pageIndex
  const activeNote = pageNotes.find((n) => n.id === activeNoteId) ?? null

  useEffect(() => {
    if (isDraftOnPage) {
      setDraftText("")
      setDraftError("")
      requestAnimationFrame(() => {
        draftInputRef.current?.focus()
        composerCardRef.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        })
      })
    }
  }, [isDraftOnPage, draftPin?.x, draftPin?.y, draftPin?.pinId])

  useEffect(() => {
    if (activeNote) {
      requestAnimationFrame(() => {
        noteCardRef.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        })
      })
    }
  }, [activeNoteId, activeNote])

  const submitDraft = () => {
    if (!draftPin || !canAddNotes) return
    const res = createBoardNote({
      boardId,
      page: pageIndex,
      x: draftPin.x,
      y: draftPin.y,
      pinId: draftPin.pinId,
      offsetX: draftPin.offsetX,
      offsetY: draftPin.offsetY,
      body: draftText,
    })
    if (!res.ok) {
      setDraftError(res.error)
      return
    }
    setDraftText("")
    setDraftError("")
    onNoteCreated(res.note)
  }

  const anchorStyle = (x: number, y: number): React.CSSProperties => {
    const alignRight = x > 58
    const alignBottom = y > 62
    return {
      ...(alignRight ? { right: `${100 - x}%` } : { left: `${x}%` }),
      ...(alignBottom ? { bottom: `${100 - y}%` } : { top: `${y}%` }),
    }
  }

  const resolvedDraft = isDraftOnPage && draftPin ? resolveNoteCoords(draftPin, pins) : null
  const resolvedActive = activeNote ? resolveNoteCoords(activeNote, pins) : null
  const highlightedPin = resolvedDraft?.anchoredPin ?? resolvedActive?.anchoredPin

  return (
    <div
      className={cx(
        "absolute inset-0 z-[6]",
        panning || !canAddNotes ? "pointer-events-none" : "cursor-crosshair",
      )}
      aria-label={`Page ${pageIndex + 1} notes`}
      onPointerDown={(e) => {
        if (panning || !canAddNotes) return
        if ((e.target as HTMLElement).closest("[data-note-interactive]")) {
          return
        }
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        const x = Math.round(clamp(((e.clientX - rect.left) / rect.width) * 100, 2, 98) * 10) / 10
        const y = Math.round(clamp(((e.clientY - rect.top) / rect.height) * 100, 3, 97) * 10) / 10

        const hitPin = [...pins]
          .reverse()
          .find((p) => {
            if (p.hidden) return false
            const wPct = pinWidthPct(p)
            const hPct = Math.max(2, (pinHeight(p) / PAGE_H) * 100)
            return x >= p.x && x <= p.x + wPct && y >= p.y && y <= p.y + hPct
          })

        if (hitPin) {
          const wPct = pinWidthPct(hitPin)
          const hPct = Math.max(2, (pinHeight(hitPin) / PAGE_H) * 100)
          onPlaceDraft({
            page: pageIndex,
            x,
            y,
            pinId: hitPin.id,
            offsetX: clamp((x - hitPin.x) / wPct, 0.05, 0.95),
            offsetY: clamp((y - hitPin.y) / hPct, 0.05, 0.95),
          })
        } else {
          onPlaceDraft({ page: pageIndex, x, y })
        }
      }}
    >
      {highlightedPin && (
        <div
          aria-hidden="true"
          style={{
            left: `${highlightedPin.x}%`,
            top: `${highlightedPin.y}%`,
            width: `${pinWidthPct(highlightedPin)}%`,
            height: `${Math.max(2, (pinHeight(highlightedPin) / PAGE_H) * 100)}%`,
            transform: highlightedPin.rotation ? `rotate(${highlightedPin.rotation}deg)` : undefined,
          }}
          className="pointer-events-none absolute z-[5] rounded-md border-2 border-cyan-500/80 bg-cyan-500/5 shadow-sm"
        />
      )}

      {pageNotes.map((note, index) => {
        const number = index + 1
        const isActive = note.id === activeNoteId
        const coords = resolveNoteCoords(note, pins)
        return (
          <button
            key={note.id}
            type="button"
            data-note-interactive
            aria-label={`Note ${number} by ${note.authorName}`}
            aria-expanded={isActive}
            style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onSelectNote(isActive ? null : note.id)
            }}
            className={cx(
              "pointer-events-auto absolute z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[11px] font-bold shadow-md transition-transform hover:scale-110",
              isActive
                ? "scale-110 border-white bg-cyan-600 text-white ring-2 ring-cyan-400/50"
                : "border-white bg-amber-500 text-white",
            )}
          >
            {number}
          </button>
        )
      })}

      {isDraftOnPage && draftPin && resolvedDraft && (
        <>
          <div
            data-note-interactive
            style={{ left: `${resolvedDraft.x}%`, top: `${resolvedDraft.y}%` }}
            className="pointer-events-none absolute z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-cyan-600 text-[11px] font-bold text-white shadow-lg ring-4 ring-cyan-400/30"
          >
            {pageNotes.length + 1}
          </div>
          <div
            ref={composerCardRef}
            data-note-interactive
            role="dialog"
            aria-label="Add note"
            style={anchorStyle(resolvedDraft.x, resolvedDraft.y)}
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute z-30 m-2 w-72 max-w-[calc(100vw-32px)] cursor-default rounded-2xl border border-line bg-card p-3.5 text-foreground shadow-2xl"
          >
            <textarea
              ref={draftInputRef}
              rows={2}
              value={draftText}
              placeholder="Add a note..."
              aria-label="Add a note"
              onChange={(e) => {
                setDraftText(e.target.value)
                if (draftError) setDraftError("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation()
                  onCancelDraft()
                } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault()
                  submitDraft()
                }
              }}
              className="w-full resize-none rounded-xl border border-line bg-elev px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-fg/20"
            />
            {draftError && (
              <p role="alert" className="mt-1.5 text-xs text-rose-500">
                {draftError}
              </p>
            )}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancelDraft}
                className="h-8 px-2.5 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                icon={Send}
                disabled={!draftText.trim()}
                onClick={submitDraft}
                className="h-8 px-3 text-xs"
              >
                Add note
              </Button>
            </div>
          </div>
        </>
      )}

      {activeNote && resolvedActive && (
        <div
          ref={noteCardRef}
          data-note-interactive
          role="dialog"
          aria-label={`Note ${pageNotes.findIndex((n) => n.id === activeNote.id) + 1}`}
          style={anchorStyle(resolvedActive.x, resolvedActive.y)}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-30 m-2 flex max-h-72 w-72 max-w-[calc(100vw-32px)] cursor-default flex-col rounded-2xl border border-line bg-card text-foreground shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-[11px] font-bold text-cyan-600 dark:text-cyan-300">
                #{pageNotes.findIndex((n) => n.id === activeNote.id) + 1}
              </span>
              <span className="truncate text-xs font-semibold text-foreground">
                {activeNote.authorName}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              {canDeleteNotes && (
                <Menu.Root modal={false}>
                  <Menu.Trigger
                    type="button"
                    aria-label="Note options"
                    title="Note options"
                    onClick={(e) => e.stopPropagation()}
                    className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-elev hover:text-foreground"
                  >
                    <MoreVertical size={15} aria-hidden />
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
                          onClick={() => onDeleteNote(activeNote.id)}
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
              <IconButton
                type="button"
                icon={X}
                label="Close note"
                onClick={() => onSelectNote(null)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
              {activeNote.body}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {formatNoteTime(activeNote.createdAt)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
