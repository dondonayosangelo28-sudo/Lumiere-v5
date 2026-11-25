import { useEffect, useState } from "react"
import {
  ArrowRight,
  LayoutGrid,
  Plus,
  Presentation,
} from "lucide-react"
import PageHead, { StateCard } from "./PageHead"
import { ThemeCard } from "./ConceptsView"
import HeroSlideshow from "./HeroSlideshow"
import type { Route } from "../../navigation"
import {
  displayDate,
  safeImage,
  type Project,
} from "./model"
import { previewStudio } from "./preview-data"
import { requestPitch, type PitchIntent } from "./intent"
import {
  listThemeBoards,
  type ThemeBoard,
} from "./mood-board/theme-boards"
import {
  FALLBACK_COVER,
  StatusBadge,
  Visual,
  coverAlt,
  pitchCover,
  type StudioUser,
} from "./shared"

const byUpdated = (list: Project[]) =>
  [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

/** Event Manager Dashboard: welcome, inspiration, recent pitches and the process. */
export function StudioDashboard({
  user,
  go,
}: {
  user: StudioUser
  go: (r: Route) => void
}) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [dashboardThemes, setDashboardThemes] = useState<ThemeBoard[] | null>(null)
  const [themesFailed, setThemesFailed] = useState(false)
  useEffect(() => {
    try {
      setDashboardThemes(listThemeBoards(user))
      setThemesFailed(false)
    } catch {
      setDashboardThemes([])
      setThemesFailed(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    previewStudio(user)
      .then((list) => live && setProjects(byUpdated(list)))
      .catch(() => live && (setFailed(true), setProjects([])))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email])
  const toPitches = (intent?: PitchIntent) => {
    if (intent) requestPitch(user.email, intent)
    go("module-client-pitching")
  }
  const newPitch = () => toPitches({ kind: "new" })
  const recent = projects?.slice(0, 4) ?? []
  const presenting = projects?.filter((p) => p.status === "ready").slice(0, 4) ?? []

  return (
    <div className="em-page em-dashboard">
      <PageHead
        eyebrow="Your creative command center"
        title="Your studio, at a glance."
        copy="A space for the ideas, people, and details that make an event."
        action={
          <button
            type="button"
            className="em-btn em-btn--primary"
            onClick={newPitch}
          >
            <Plus size={15} strokeWidth={1.75} aria-hidden /> New event pitch
          </button>
        }
      />

      <section className="em-hero" aria-labelledby="em-hero-title">
        <div className="em-hero-copy">
          <p className="em-eyebrow">From the first spark to the final detail</p>
          <h2 id="em-hero-title" className="em-hero-title">
            Every detail,
            <em>beautifully considered.</em>
          </h2>
          <p className="em-hero-text">
            Bring your client's vision into focus. Pitch the idea, shape the
            feeling, and plan what comes next.
          </p>
          <div className="em-hero-actions">
            <button
              type="button"
              className="em-btn em-btn--primary"
              onClick={newPitch}
            >
              Create your next event{" "}
              <ArrowRight size={15} strokeWidth={1.5} aria-hidden />
            </button>
            <span className="em-hero-note">
              <span aria-hidden className="em-dot" />
              One workspace. From pitch to approval.
            </span>
          </div>
        </div>
        <HeroSlideshow />
      </section>

      <section className="em-section" aria-labelledby="em-inspiration">
        <div className="em-section-head">
          <div>
            <p className="em-eyebrow">A little inspiration</p>
            <h2 id="em-inspiration" className="em-section-title">
              Start with a feeling.
            </h2>
          </div>
          <button
            type="button"
            className="em-link"
            onClick={() => go("module-event-concepts")}
          >
            Explore all themes <ArrowRight size={14} aria-hidden />
          </button>
        </div>
        <ul className="em-card-grid" aria-label="Theme inspiration">
          {dashboardThemes?.slice(0, 3).map((b) => (
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
              action="Start a pitch from"
              onSelect={() => toPitches({ kind: "registered-theme", id: b.id })}
            />
          ))}
        </ul>
        {dashboardThemes?.length === 0 && (
          <StateCard
            compact
            icon={LayoutGrid}
            title={themesFailed ? "Themes could not be loaded." : "Your next theme starts here."}
            copy={themesFailed ? "Open Mood Boards to review your collection." : "Create a mood board to use as the starting point for a pitch."}
            action={<button type="button" className="em-btn em-btn--outline" onClick={() => go("module-event-concepts")}>Open mood boards</button>}
          />
        )}
      </section>

      <div className="em-split">
        <section
          className="em-panel em-panel-pad"
          aria-labelledby="em-drawing-board"
        >
          <div className="em-section-head">
            <div>
              <p className="em-eyebrow">Recent work</p>
              <h2 id="em-drawing-board" className="em-section-title">
                On your drawing board
              </h2>
            </div>
            <button
              type="button"
              className="em-link"
              onClick={() => toPitches()}
            >
              View all pitches <ArrowRight size={14} aria-hidden />
            </button>
          </div>
          {failed && (
            <p className="em-error mb-3">
              Saved pitches in this browser could not be read.
            </p>
          )}
          {!projects ? (
            <div role="status" className="space-y-3">
              <span className="sr-only">Loading pitches…</span>
              {[0, 1, 2].map((i) => (
                <span key={i} className="em-skeleton block h-14" aria-hidden />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <StateCard
              compact
              icon={Presentation}
              title="Your next chapter is waiting."
              copy="Capture a client's brief and shape it into a pitch worth presenting."
              action={
                <button
                  type="button"
                  className="em-btn em-btn--primary"
                  onClick={newPitch}
                >
                  <Plus size={15} strokeWidth={1.75} aria-hidden /> Create your
                  first pitch
                </button>
              }
            />
          ) : (
            <ul className="em-rows" aria-labelledby="em-drawing-board">
              {recent.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="em-row"
                    data-pitch-id={p.id}
                    onClick={() => toPitches({ kind: "open", id: p.id })}
                  >
                    <Visual
                      src={pitchCover(p.brief)}
                      fallbackSrc={FALLBACK_COVER}
                      label={coverAlt(p.brief)}
                      className="em-row-thumb"
                    />
                    <span className="min-w-0">
                      <span className="em-row-title">
                        {p.brief.title || "Untitled pitch"}
                      </span>
                      <span className="em-row-meta">
                        {p.brief.client || "No client yet"} ·{" "}
                        {displayDate(p.brief.start)}
                      </span>
                    </span>
                    <StatusBadge status={p.status} />
                    <ArrowRight
                      size={16}
                      strokeWidth={1.5}
                      className="em-row-arrow"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="em-panel em-panel-pad"
          aria-labelledby="em-for-presentation"
        >
          <div className="em-section-head">
            <div>
              <p className="em-eyebrow">Ready to share</p>
              <h2 id="em-for-presentation" className="em-section-title">
                For presentation
              </h2>
            </div>
          </div>
          {!projects ? (
            <span className="em-skeleton block h-14" aria-hidden />
          ) : presenting.length === 0 ? (
            <StateCard
              compact
              icon={Presentation}
              title="Nothing is ready to present."
              copy="Mark a pitch as For presentation once the board and asset plan are set."
            />
          ) : (
            <ul className="em-rows" aria-labelledby="em-for-presentation">
              {presenting.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="em-row"
                    onClick={() => toPitches({ kind: "open", id: p.id })}
                  >
                    <Visual
                      src={pitchCover(p.brief)}
                      fallbackSrc={FALLBACK_COVER}
                      label={coverAlt(p.brief)}
                      className="em-row-thumb"
                    />
                    <span className="min-w-0">
                      <span className="em-row-title">
                        {p.brief.title || "Untitled pitch"}
                      </span>
                      <span className="em-row-meta">
                        {p.brief.client || "No client yet"} ·{" "}
                        {displayDate(p.brief.start)}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      strokeWidth={1.5}
                      className="em-row-arrow"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default StudioDashboard

