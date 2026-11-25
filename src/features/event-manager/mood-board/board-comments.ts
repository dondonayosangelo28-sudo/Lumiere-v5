import { useSyncExternalStore } from "react"
import { currentAccount } from "../../../auth/session"
import { accountName, type Account } from "../../../auth/store"
import type { Pin } from "../model"
import { PAGE_H, pinHeight, pinWidthPct } from "./Board"

export type BoardMode = "editing" | "notes" | "viewing"

export interface BoardPermissions {
  account: Account | null
  canEdit: boolean
  canAddNotes: boolean
  canDeleteNotes: boolean
  canReadNotes: boolean
  canView: boolean
}

export interface BoardNote {
  id: string
  boardId: string
  page: number
  x: number
  y: number
  pinId?: string
  offsetX?: number
  offsetY?: number
  authorName: string
  authorEmail: string
  body: string
  createdAt: string
}

const STORAGE_KEY = "lumiere-mood-board-comments-v1"
const listeners = new Set<() => void>()
let cachedRaw: string | null = null
let cachedNotes: BoardNote[] = []
let revision = 0

function readNotes(): BoardNote[] {
  if (typeof window === "undefined") return cachedNotes
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === cachedRaw) return cachedNotes
    cachedRaw = raw
    if (!raw) {
      cachedNotes = []
      return cachedNotes
    }
    const parsed = JSON.parse(raw)
    cachedNotes = Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is BoardNote =>
            Boolean(entry) &&
            typeof entry.id === "string" &&
            typeof entry.boardId === "string" &&
            typeof entry.page === "number" &&
            typeof entry.x === "number" &&
            typeof entry.y === "number" &&
            typeof entry.body === "string",
        )
      : []
    return cachedNotes
  } catch {
    return cachedNotes
  }
}

function writeNotes(next: BoardNote[]): void {
  cachedNotes = next
  const serialized = JSON.stringify(next)
  cachedRaw = serialized
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serialized)
  }
  revision += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getRevision(): number {
  return revision
}

/**
 * Derives effective mood board permissions from the signed-in account and board lock state.
 * Warehouse Operations Managers and other non-editor roles view in read-only mode.
 */
export function getBoardPermissions(readOnly: boolean): BoardPermissions {
  const account = currentAccount()
  const isActive = Boolean(account && account.status === "Active")
  const canEdit = Boolean(isActive && !readOnly && account?.role === "Event Manager")
  return {
    account,
    canEdit,
    canAddNotes: canEdit,
    canDeleteNotes: canEdit,
    canReadNotes: isActive,
    canView: true,
  }
}

import {
  getDraftBoardId,
  getPitchBoardId,
  resolveOrderMoodBoardId,
} from "../../../operations/store-core"

export { getDraftBoardId, getPitchBoardId, resolveOrderMoodBoardId }

export function useBoardNotes(boardId?: string): BoardNote[] {
  useSyncExternalStore(subscribe, getRevision)
  const all = readNotes()
  if (!boardId) return []
  return all.filter((n) => n.boardId === boardId)
}

export function resolveNoteCoords(
  note: Pick<BoardNote, "x" | "y" | "pinId" | "offsetX" | "offsetY">,
  pagePins: Pin[],
): { x: number; y: number; anchoredPin?: Pin } {
  if (note.pinId) {
    const target = pagePins.find((p) => p.id === note.pinId && !p.hidden)
    if (target) {
      const wPct = pinWidthPct(target)
      const hPct = Math.max(2, (pinHeight(target) / PAGE_H) * 100)
      const ox = note.offsetX ?? 0.5
      const oy = note.offsetY ?? 0.5
      return {
        x: Math.max(2, Math.min(98, target.x + wPct * ox)),
        y: Math.max(3, Math.min(97, target.y + hPct * oy)),
        anchoredPin: target,
      }
    }
  }
  return { x: note.x, y: note.y }
}

export function createBoardNote(input: {
  boardId: string
  page: number
  x: number
  y: number
  pinId?: string
  offsetX?: number
  offsetY?: number
  body: string
}): { ok: true; note: BoardNote } | { ok: false; error: string } {
  const account = currentAccount()
  if (!account || account.status !== "Active" || account.role !== "Event Manager") {
    return { ok: false, error: "Only authorized editors can add notes." }
  }
  const body = input.body.trim()
  if (!body) {
    return { ok: false, error: "Enter a note before saving." }
  }
  const note: BoardNote = {
    id: crypto.randomUUID(),
    boardId: input.boardId,
    page: Math.max(0, Math.floor(input.page)),
    x: Math.max(2, Math.min(98, input.x)),
    y: Math.max(3, Math.min(97, input.y)),
    ...(input.pinId
      ? {
          pinId: input.pinId,
          offsetX: input.offsetX ?? 0.5,
          offsetY: input.offsetY ?? 0.5,
        }
      : {}),
    authorName: accountName(account),
    authorEmail: account.email,
    body,
    createdAt: new Date().toISOString(),
  }
  const current = readNotes()
  writeNotes([...current, note])
  return { ok: true, note }
}

export function deleteBoardNote(input: {
  noteId: string
  readOnly?: boolean
}): { ok: true } | { ok: false; error: string } {
  const account = currentAccount()
  if (
    input.readOnly ||
    !account ||
    account.status !== "Active" ||
    account.role !== "Event Manager"
  ) {
    return { ok: false, error: "Only authorized Event Managers can delete notes." }
  }
  const current = readNotes()
  const next = current.filter((n) => n.id !== input.noteId)
  if (next.length === current.length) {
    return { ok: false, error: "Note could not be found." }
  }
  writeNotes(next)
  return { ok: true }
}

export function getBoardNotesSnapshot(boardId: string): BoardNote[] {
  return readNotes()
    .filter((n) => n.boardId === boardId)
    .map((n) => ({ ...n }))
}

export function replaceBoardNotes(boardId: string, boardNotes: BoardNote[]): void {
  const others = readNotes().filter((n) => n.boardId !== boardId)
  writeNotes([...others, ...boardNotes.map((n) => ({ ...n }))])
}

export function removePageNotes(boardId: string, pageIndex: number): void {
  const current = readNotes()
  const next: BoardNote[] = []
  let changed = false
  for (const note of current) {
    if (note.boardId !== boardId) {
      next.push(note)
      continue
    }
    if (note.page === pageIndex) {
      changed = true
      continue
    }
    if (note.page > pageIndex) {
      changed = true
      next.push({ ...note, page: note.page - 1 })
      continue
    }
    next.push(note)
  }
  if (changed) writeNotes(next)
}

export function migrateBoardComments(fromBoardId: string, toBoardId: string): void {
  if (!fromBoardId || !toBoardId || fromBoardId === toBoardId) return
  const current = readNotes()
  if (!current.some((n) => n.boardId === fromBoardId)) return
  writeNotes(
    current.map((n) => (n.boardId === fromBoardId ? { ...n, boardId: toBoardId } : n)),
  )
}
