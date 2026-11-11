import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Minimize2 } from "lucide-react"
import OverlayLayer from "../../components/OverlayLayer"
import Board from "./Board"
import type { Brief } from "./model"

export default function BoardSlideshow({ brief, pages, initialPage, onClose }: {
  brief: Brief
  pages: { title: string; background: string }[]
  initialPage: number
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [slide, setSlide] = useState(initialPage)
  const move = (delta: number) => setSlide((i) => Math.max(0, Math.min(pages.length - 1, i + delta)))
  const close = () => {
    if (document.fullscreenElement === panel.current) void document.exitFullscreen().catch(() => {})
    onClose()
  }
  return (
    <OverlayLayer panelRef={panel} onClose={close} className="fixed inset-0 bg-black">
      <div
        ref={panel}
        className="mb-slideshow"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Board presentation"
        onKeyDown={(e) => {
          if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); move(1) }
          if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); move(-1) }
          if (e.key === "Home") setSlide(0)
          if (e.key === "End") setSlide(pages.length - 1)
        }}
      >
        <div className="mb-slide-canvas">
          <Board compact pins={brief.pins} page={slide} theme={brief.theme} background={pages[slide].background} label={pages[slide].title} />
        </div>
        <footer className="mb-slide-controls">
          <span className="mb-slide-progress" style={{ width: `${((slide + 1) / pages.length) * 100}%` }} />
          <button type="button" aria-label="Previous slide" disabled={slide === 0} onClick={() => move(-1)}><ChevronLeft size={20} /></button>
          <span aria-live="polite">{slide + 1} / {pages.length}</span>
          <button type="button" aria-label="Next slide" disabled={slide === pages.length - 1} onClick={() => move(1)}><ChevronRight size={20} /></button>
          <span className="mb-slide-title">{pages[slide].title}</span>
          <div className="mb-slide-window-controls">
            <button type="button" title="Exit fullscreen" aria-label="Exit fullscreen" onClick={close}>
              <Minimize2 size={26} strokeWidth={2} />
            </button>
          </div>
        </footer>
      </div>
    </OverlayLayer>
  )
}
