import { Plus } from "lucide-react"
import Dropdown from "../../../components/ui/Dropdown"
import { cx } from "../../../components/ui/ui"
import Board from "./Board"
import type { Brief } from "../model"

export function CanvasPageFilmstrip({
  pages,
  page,
  brief,
  readOnly,
  pageGrid,
  setPageGrid,
  goTo,
  addPage,
  duplicatePage,
}: {
  pages: { title: string; background?: string }[]
  page: number
  brief: Brief
  readOnly: boolean
  pageGrid: boolean
  setPageGrid: (g: boolean) => void
  goTo: (i: number) => void
  addPage: (after?: number) => void
  duplicatePage: (i: number) => void
}) {
  return (
    <div
      className={cx("mb-filmstrip", pageGrid && "mb-page-overview")}
      role="group"
      aria-label="Pages"
    >
      {pages.map((p, i) => (
        <button
          key={i}
          type="button"
          className="mb-thumb"
          aria-current={page === i ? "page" : undefined}
          aria-label={`Go to page ${i + 1}: ${p.title}`}
          onClick={() => {
            setPageGrid(false)
            requestAnimationFrame(() => goTo(i))
          }}
        >
          <Board
            pins={brief.pins}
            page={i}
            theme={brief.theme}
            background={p.background}
            compact
            label={p.title}
            className="mb-thumb-board"
          />
          <span className="mb-thumb-num">{i + 1}</span>
        </button>
      ))}
      {!readOnly && pages.length < 12 && (
        <div className="mb-page-add-controls">
          <button
            type="button"
            className="mb-page-add-main"
            aria-label="Add page"
            title="Add page"
            onClick={() => addPage()}
          >
            <Plus size={18} aria-hidden />
          </button>
          <Dropdown
            className="mb-page-add-dropdown"
            aria-label="Page creation options"
            value=""
            onChange={(e) =>
              e.target.value === "duplicate" ? duplicatePage(page) : addPage()
            }
          >
            <option value="" disabled>
              Page options
            </option>
            <option value="blank">Add blank page</option>
            <option value="duplicate">Duplicate current page</option>
          </Dropdown>
        </div>
      )}
    </div>
  )
}

export default CanvasPageFilmstrip

