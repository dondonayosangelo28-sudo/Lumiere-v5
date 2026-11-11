import { useNotify } from '../../components/Notifications'
import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ChevronDown,
  ImagePlus,
  Loader2,
  Palette,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { Input, cx } from "../../components/ui"
import MoodBoardCanvas from "./MoodBoardCanvas"
import ColourPicker from "../../components/ColourPicker"
import { shelf } from "./Editor"
import { newBrief, type Brief, type Pin } from "./model"
import { EmField, FieldError, Visual, textareaCls } from "./shared"
import {
  DEFAULT_PALETTE,
  HEX,
  MAX_COLOURS,
  applyDetails,
  coverFromFile,
  saveThemeBoard,
  starterBoard,
  unlinkEdited,
  type ThemeBoard,
  type ThemeDetails,
  type ThemePage,
} from "./theme-boards"

type StudioUser = { name: string; email: string }
type Content = { details: ThemeDetails; pins: Pin[]; boardPages: ThemePage[] }

const blankDetails = (): ThemeDetails => ({
  name: "Untitled theme",
  category: "",
  description: "",
  palette: [...DEFAULT_PALETTE],
})
const initial = (board: ThemeBoard | null): Content => {
  if (board)
    return { details: board.details, pins: board.pins, boardPages: board.boardPages }
  const details = blankDetails()
  return { details, ...starterBoard(details) }
}
const snapshot = (c: Content) => JSON.stringify(c)

/** Standalone theme mood board editor: Theme details plus the shared canvas, no pitch steps. */
export default function ThemeBoardEditor({
  user,
  board,
  onClose,
  onSaved,
  onDirty,
}: {
  user: StudioUser
  board: ThemeBoard | null
  onClose: () => void
  onSaved: (board: ThemeBoard) => void
  onDirty: (dirty: boolean) => void
}) {
  const [saved, setSaved] = useState(board)
  const [content, setContent] = useState(() => initial(board))
  const [baseline, setBaseline] = useState(() => snapshot(initial(board)))
  const [selected, setSelected] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [nameError, setNameError] = useState("")
  const setStatus = useNotify()
  const [saving, setSaving] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverError, setCoverError] = useState("")
  const latest = useRef(content)
  latest.current = content
  const file = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const { details } = content
  const dirty = snapshot(content) !== baseline

  useEffect(() => onDirty(dirty), [dirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])
  useEffect(() => heading.current?.focus({ preventScroll: true }), [])

  const setDetails = (patch: Partial<ThemeDetails>) =>
    setContent((c) => {
      const next = { ...c.details, ...patch }
      return { ...c, details: next, pins: applyDetails(c.pins, next) }
    })

  // The canvas edits pins and pages; editing linked content by hand ends its link to Theme details.
  const update = (patch: Partial<Brief>) =>
    setContent((c) => ({
      ...c,
      ...(patch.pins ? { pins: unlinkEdited(c.pins, patch.pins) } : {}),
      ...(patch.boardPages ? { boardPages: patch.boardPages } : {}),
    }))

  const brief: Brief = {
    ...newBrief(""),
    title: details.name,
    theme: "",
    pins: content.pins,
    boardPages: content.boardPages,
  }

  const add = (key: string, at: { x: number; y: number; page: number }) => {
    const item = shelf.find((s) => s.key === key)
    if (!item) return
    const half = (220 / 800) * 50
    const pin: Pin = {
      id: crypto.randomUUID(),
      title: item.title,
      image: item.image,
      source: "",
      width: 220,
      page: at.page,
      x: Math.round(Math.max(0, Math.min(100 - half * 2, at.x - half))),
      y: Math.round(Math.max(0, Math.min(80, at.y - 10))),
      rotation: 0,
    }
    setContent((c) => ({ ...c, pins: [...c.pins, pin] }))
    setSelected(pin.id)
  }

  const save = () => {
    const name = details.name.trim()
    if (!name) {
      setNameError("Give this theme a name.")
      setDetailsOpen(true)
      requestAnimationFrame(() => document.getElementById("tb-name")?.focus())
      return
    }
    setNameError("")
    setSaving(true)
    try {
      const c = latest.current
      const next = saveThemeBoard(user, {
        id: saved?.id,
        details: { ...c.details, name, category: c.details.category.trim(), description: c.details.description.trim() },
        pins: c.pins,
        boardPages: c.boardPages,
      })
      const restored = { details: next.details, pins: next.pins, boardPages: next.boardPages }
      setSaved(next)
      setContent(restored)
      setBaseline(snapshot(restored))
      setStatus({ tone: "success", text: saved ? "Mood board updated." : "Mood board created and saved." })
      onSaved(next)
    } catch (e) {
      setStatus({ tone: "error", text: "Changes could not be saved. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  const uploadCover = async (f?: File) => {
    if (!f) return
    setCoverBusy(true)
    setCoverError("")
    try {
      setDetails({ cover: await coverFromFile(f) })
      setStatus({ tone: "success", text: "Image uploaded." })
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "This image could not be read.")
    } finally {
      setCoverBusy(false)
    }
  }


  return (
    <div className="em-editor tb-editor">
      <div className="em-editor-head">
        <button type="button" className="em-back" onClick={onClose}>
          <ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> Back to mood boards
        </button>
        <div className="em-editor-title-row">
          <div className="min-w-0">
            {details.category.trim() && <span className="em-meta">{details.category.trim()}</span>}
            <h2 ref={heading} tabIndex={-1} className="em-editor-title">
              {details.name.trim() || "Untitled theme"}
            </h2>
            <p className="em-lede">
              {content.boardPages.length} {content.boardPages.length === 1 ? "page" : "pages"} · A reusable theme for future pitches
            </p>
          </div>
          <div className="em-editor-actions">
            <button
              type="button"
              className="em-btn em-btn--outline"
              aria-expanded={detailsOpen}
              aria-controls="tb-details"
              onClick={() => setDetailsOpen((o) => !o)}
            >
              <Palette size={15} strokeWidth={1.5} aria-hidden /> Theme details
              <ChevronDown size={14} aria-hidden className={cx("transition-transform", detailsOpen && "rotate-180")} />
            </button>
            <button
              type="button"
              className="em-btn em-btn--primary"
              onClick={save}
              disabled={saving || (!dirty && !!saved)}
              aria-busy={saving}
            >
              {saving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Save size={15} strokeWidth={1.5} aria-hidden />}
              {saving ? "Saving…" : "Save mood board"}
            </button>
          </div>
        </div>
      </div>

      {detailsOpen && (
        <section id="tb-details" className="em-panel em-panel-pad tb-details" aria-labelledby="tb-details-title">
          <div className="tb-details-head">
            <div>
              <p className="em-eyebrow">Belongs to the theme</p>
              <h3 id="tb-details-title" className="em-section-title">Theme details</h3>
            </div>
          </div>
          <div className="tb-grid">
            <div className="tb-col">
              <EmField label="Theme name" required>
                <Input
                  id="tb-name"
                  value={details.name}
                  maxLength={80}
                  aria-invalid={!!nameError || undefined}
                  aria-describedby={nameError ? "tb-name-error" : undefined}
                  onChange={(e) => {
                    setDetails({ name: e.target.value })
                    if (nameError && e.target.value.trim()) setNameError("")
                  }}
                />
              </EmField>
              <FieldError id="tb-name-error" text={nameError} />
              <EmField label="Category">
                <Input
                  value={details.category}
                  maxLength={40}
                  placeholder="e.g. Garden wedding"
                  onChange={(e) => setDetails({ category: e.target.value })}
                />
              </EmField>
              <EmField label="Short description">
                <textarea
                  className={textareaCls}
                  rows={3}
                  maxLength={200}
                  value={details.description}
                  placeholder="Soft florals. Natural textures. A little magic."
                  onChange={(e) => setDetails({ description: e.target.value })}
                />
              </EmField>
            </div>

            <div className="tb-col">
              <span className="em-label" id="tb-cover-label">Cover image</span>
              <div className="tb-cover">
                <Visual
                  src={details.cover}
                  label={details.cover ? `${details.name || "Theme"} cover` : "No cover image yet"}
                  icon={ImagePlus}
                  palette={details.palette}
                  className="tb-cover-preview"
                />
                <div className="tb-cover-actions">
                  <button
                    type="button"
                    className="em-btn em-btn--outline em-btn--sm"
                    disabled={coverBusy}
                    onClick={() => file.current?.click()}
                  >
                    {coverBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} strokeWidth={1.5} aria-hidden />}
                    {coverBusy ? "Uploading…" : "Upload image"}
                  </button>
                  {details.cover && (
                    <button type="button" className="em-btn em-btn--quiet em-btn--sm" onClick={() => setDetails({ cover: undefined })}>
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden /> Remove cover
                    </button>
                  )}
                </div>
                <input
                  ref={file}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ""
                    void uploadCover(f)
                  }}
                />
              </div>
              <FieldError id="tb-cover-error" text={coverError} />
            </div>

            <div className="tb-col">
              <span className="em-label">Colour palette</span>
              <ul className="tb-palette" aria-label="Theme colours">
                {details.palette.map((c, i) => (
                  <ColourRow
                    key={i}
                    index={i}
                    value={c}
                    canRemove={details.palette.length > 1}
                    onChange={(v) => setDetails({ palette: details.palette.map((x, k) => (k === i ? v : x)) })}
                    onRemove={() => setDetails({ palette: details.palette.filter((_, k) => k !== i) })}
                  />
                ))}
              </ul>
              {details.palette.length < MAX_COLOURS && (
                <button
                  type="button"
                  className="em-btn em-btn--outline em-btn--sm self-start"
                  onClick={() => setDetails({ palette: [...details.palette, "#c9b79c"] })}
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden /> Add colour
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="em-canvas-wrap">
        <MoodBoardCanvas
          brief={brief}
          update={update}
          readOnly={false}
          selected={selected}
          onSelect={setSelected}
          onDropItem={(key, x, y, page) => add(key, { x, y, page })}
          shelf={shelf}
          onAddShelf={(key, page) => add(key, { x: 50, y: 45, page })}
          palette={details.palette}
        />
      </div>
    </div>
  )
}

function ColourRow({
  index,
  value,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number
  value: string
  canRemove: boolean
  onChange: (v: string) => void
  onRemove: () => void
}) {
  const [hex, setHex] = useState(value.toUpperCase())
  useEffect(() => setHex(value.toUpperCase()), [value])
  const valid = HEX.test(hex)
  return (
    <li className="tb-colour">
      <ColourPicker
        value={value}
        label={`Colour ${index + 1} picker`}
        onChange={onChange}
        className="colour-picker-trigger--field"
      />
      <Input
        value={hex}
        maxLength={7}
        aria-label={`Colour ${index + 1} hex value`}
        aria-invalid={!valid || undefined}
        className="tb-hex"
        onChange={(e) => {
          const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`
          setHex(v.toUpperCase())
          if (HEX.test(v)) onChange(v.toLowerCase())
        }}
        onBlur={() => !valid && setHex(value.toUpperCase())}
      />
      <button
        type="button"
        className="em-icon-btn"
        aria-label={`Remove colour ${index + 1}`}
        title="Remove colour"
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2 size={15} strokeWidth={1.5} aria-hidden />
      </button>
    </li>
  )
}
