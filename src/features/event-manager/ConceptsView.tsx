import {
  ArrowUpRight,
  FileText,
  LayoutGrid,
  Plus,
  Trash2,
} from "lucide-react"
import RowMenu from "../../components/ui/RowMenu"
import { StateCard } from "./PageHead"
import { PitchCard, type OpenPitch } from "./PitchesView"
import { safeImage, type Project } from "./model"
import type { ThemeBoard } from "./mood-board/theme-boards"
import { FALLBACK_COVER, Visual } from "./shared"

export function ThemeSwatches({ palette }: { palette: readonly string[] }) {
  return (
    <span className="em-swatches" aria-hidden>
      {palette.map((c) => (
        <span key={c} style={{ background: c }} />
      ))}
    </span>
  )
}

export type CardTheme = {
  name: string
  description: string
  category: string
  image?: string
  alt: string
  palette: readonly string[]
}

export function ThemeCard({
  theme,
  onSelect,
  action,
  onEdit,
  onDelete,
}: {
  theme: CardTheme
  onSelect: () => void
  action: string
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <li className="min-w-0 relative">
      <button
        type="button"
        className="em-theme-card"
        onClick={onSelect}
        aria-label={`${action}: ${theme.name}${theme.category ? `, ${theme.category}` : ""}. ${theme.description}`}
      >
        <span className="em-theme-card-media">
          <Visual
            src={theme.image}
            fallbackSrc={FALLBACK_COVER}
            label={theme.alt}
            palette={theme.palette}
            className="size-full"
          />
          {theme.category && (
            <span className="em-overlay-pill">{theme.category}</span>
          )}
          {!onEdit && !onDelete && (
            <span className="em-card-arrow" aria-hidden>
              <ArrowUpRight size={15} strokeWidth={1.5} />
            </span>
          )}
        </span>
        <span className="em-theme-card-body">
          <span className="flex items-start justify-between gap-3">
            <span className="em-card-title">{theme.name}</span>
            <ThemeSwatches palette={theme.palette} />
          </span>
          <span className="em-card-copy">{theme.description}</span>
        </span>
      </button>
      {(onEdit || onDelete) && (
        <div
          className="absolute right-3 top-3 rounded-full border border-line bg-card text-foreground shadow-sm"
          role="group"
          aria-label={`Manage ${theme.name}`}
        >
          <RowMenu
            menuClassName="em-board-actions-menu"
            items={[
              ...(onEdit ? [{ label: "Edit board", icon: FileText, onClick: onEdit }] : []),
              ...(onDelete ? [{ label: "Delete board", icon: Trash2, danger: true, onClick: onDelete }] : []),
            ]}
          />
        </div>
      )}
    </li>
  )
}

export function ConceptsView({
  projects,
  themeBoards,
  startRegisteredTheme,
  editTheme,
  removeTheme,
  open,
  startNew,
}: {
  projects: Project[]
  themeBoards: ThemeBoard[]
  startRegisteredTheme: (board: ThemeBoard) => void
  editTheme: (board: ThemeBoard) => void
  removeTheme: (board: ThemeBoard) => void
  open: OpenPitch
  startNew: () => void
}) {
  const boards = projects.filter((p) => p.brief.pins.length > 0)
  return (
    <div className="space-y-12">
      <section aria-label="Theme collection">
        <ul className="em-card-grid" aria-label="Theme collection">
          {themeBoards.map((b) => (
            <ThemeCard
              key={b.id}
              theme={{
                name: b.details.name,
                category: b.details.category,
                description: b.details.description,
                image: b.details.cover ?? b.pins.find((p) => p.image && safeImage(p.image))?.image,
                alt: `${b.details.name} cover`,
                palette: b.details.palette,
              }}
              action="Start a pitch from this mood board"
              onSelect={() => startRegisteredTheme(b)}
              onEdit={() => editTheme(b)}
              onDelete={() => removeTheme(b)}
            />
          ))}
        </ul>
      </section>
      <section aria-labelledby="em-your-boards">
        <div className="em-section-head">
          <div>
            <p className="em-eyebrow">Saved with your pitches</p>
            <h2 id="em-your-boards" className="em-section-title">
              Your mood boards
            </h2>
          </div>
        </div>
        {boards.length === 0 ? (
          <StateCard
            icon={LayoutGrid}
            title="No boards pinned yet."
            copy="Choose a theme above, or start a blank board and pin the references that capture the feeling."
            action={
              <button
                type="button"
                className="em-btn em-btn--outline"
                onClick={startNew}
              >
                <Plus size={15} strokeWidth={1.75} aria-hidden /> Start a blank
                board
              </button>
            }
          />
        ) : (
          <ul className="em-card-grid" aria-label="Your mood boards">
            {boards.map((p) => (
              <PitchCard
                key={p.id}
                project={p}
                onOpen={() => open(p, undefined, 1)}
                meta={
                  <>
                    <span>
                      <LayoutGrid size={13} strokeWidth={1.5} aria-hidden />
                      {p.brief.pins.length}{" "}
                      {p.brief.pins.length === 1 ? "pin" : "pins"}
                    </span>
                    <span>{p.brief.theme}</span>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default ConceptsView

