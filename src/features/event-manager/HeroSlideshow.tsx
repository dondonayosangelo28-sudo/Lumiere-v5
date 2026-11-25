import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { safeImage, themes } from "./model"

export interface HeroSlide {
  src: string
  alt: string
}

interface PersistedHeroState {
  activeSrc: string | null
  lastKnownIndex: number
  remainingMs: number
}

const SLIDE_INTERVAL_MS = 30_000
const STORAGE_KEY = "lumiere-hero-slideshow-v1"

const DEFAULT_HERO_SLIDE: HeroSlide = {
  src: "/event-manager-images/garden.jpg",
  alt: "Candlelit reception hall with chandeliers, columns and dressed banquet tables",
}

let memoryState: PersistedHeroState | null = null

function readPersistedState(): PersistedHeroState | null {
  if (memoryState) return memoryState
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedHeroState>
    if (
      typeof parsed.remainingMs === "number" &&
      Number.isFinite(parsed.remainingMs)
    ) {
      memoryState = {
        activeSrc: typeof parsed.activeSrc === "string" ? parsed.activeSrc : null,
        lastKnownIndex:
          typeof parsed.lastKnownIndex === "number" &&
          Number.isInteger(parsed.lastKnownIndex) &&
          parsed.lastKnownIndex >= 0
            ? parsed.lastKnownIndex
            : 0,
        remainingMs: Math.min(
          SLIDE_INTERVAL_MS,
          Math.max(1, parsed.remainingMs),
        ),
      }
      return memoryState
    }
  } catch {
    // Ignore storage read errors in restricted environments.
  }
  return null
}

function writePersistedState(state: PersistedHeroState): void {
  memoryState = state
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage write errors in restricted environments.
  }
}

export function extractPresetMoodBoardCovers(): HeroSlide[] {
  const seen = new Set<string>()
  const slides: HeroSlide[] = []

  for (const theme of themes) {
    const src = theme.image?.trim()
    if (
      !src ||
      !safeImage(src) ||
      src.startsWith("data:image/svg+xml") ||
      seen.has(src)
    ) {
      continue
    }
    seen.add(src)
    slides.push({
      src,
      alt: theme.alt?.trim() || `${theme.name} mood board cover`,
    })
  }

  return slides
}

function resolveInitialSlideState(slides: HeroSlide[]) {
  const saved = readPersistedState()
  if (!saved || slides.length === 0) {
    return { index: 0, remainingMs: SLIDE_INTERVAL_MS }
  }
  if (saved.activeSrc) {
    const found = slides.findIndex((s) => s.src === saved.activeSrc)
    if (found >= 0) {
      return { index: found, remainingMs: saved.remainingMs }
    }
  }
  // Saved cover is no longer available: advance to the next valid cover.
  return {
    index: saved.lastKnownIndex % slides.length,
    remainingMs: SLIDE_INTERVAL_MS,
  }
}

export function HeroSlideshow() {
  const presetSlides = useMemo(() => extractPresetMoodBoardCovers(), [])
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(() => new Set())
  const initialRef = useRef<{ index: number; remainingMs: number } | null>(null)
  if (!initialRef.current) {
    initialRef.current = resolveInitialSlideState(presetSlides)
  }

  const [activeIndex, setActiveIndex] = useState(initialRef.current.index)
  const [previousSlide, setPreviousSlide] = useState<HeroSlide | null>(null)
  const [tabVisible, setTabVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  )

  const remainingMsRef = useRef<number>(initialRef.current.remainingMs)
  const startedAtRef = useRef<number | null>(null)

  const markFailed = useCallback((src: string) => {
    setFailedSrcs((prev) => {
      if (prev.has(src)) return prev
      const next = new Set(prev)
      next.add(src)
      return next
    })
  }, [])

  const validSlides = useMemo(() => {
    const filtered = presetSlides.filter((s) => !failedSrcs.has(s.src))
    return filtered.length > 0 ? filtered : [DEFAULT_HERO_SLIDE]
  }, [presetSlides, failedSrcs])

  const safeIndex = activeIndex % validSlides.length
  const currentSlide = validSlides[safeIndex]

  // Keep persisted activeSrc/index synchronized when slides or index change.
  useEffect(() => {
    writePersistedState({
      activeSrc: currentSlide.src,
      lastKnownIndex: safeIndex,
      remainingMs: remainingMsRef.current,
    })
  }, [currentSlide.src, safeIndex])

  // Pause rotation while the browser tab is hidden.
  useEffect(() => {
    if (typeof document === "undefined") return
    const onVisibilityChange = () => setTabVisible(!document.hidden)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  // Preload the next slide image to avoid flashing or blank transitions.
  useEffect(() => {
    if (validSlides.length <= 1 || typeof Image === "undefined") return
    const nextSlide = validSlides[(safeIndex + 1) % validSlides.length]
    const loader = new Image()
    loader.onerror = () => markFailed(nextSlide.src)
    loader.src = nextSlide.src
    return () => {
      loader.onerror = null
    }
  }, [validSlides, safeIndex, markFailed])

  // Run a single-shot timeout for the remaining display time; pause & persist remainingMs on hide/unmount.
  useEffect(() => {
    if (!tabVisible || validSlides.length <= 1) return

    startedAtRef.current = Date.now()
    const delay = Math.min(SLIDE_INTERVAL_MS, Math.max(1, remainingMsRef.current))

    const timer = window.setTimeout(() => {
      startedAtRef.current = null
      remainingMsRef.current = SLIDE_INTERVAL_MS
      const nextIndex = (safeIndex + 1) % validSlides.length
      const nextSlide = validSlides[nextIndex]
      setPreviousSlide(currentSlide)
      setActiveIndex(nextIndex)
      writePersistedState({
        activeSrc: nextSlide.src,
        lastKnownIndex: nextIndex,
        remainingMs: SLIDE_INTERVAL_MS,
      })
    }, delay)

    return () => {
      window.clearTimeout(timer)
      if (startedAtRef.current !== null) {
        const elapsed = Date.now() - startedAtRef.current
        remainingMsRef.current = Math.max(1, remainingMsRef.current - elapsed)
        startedAtRef.current = null
        writePersistedState({
          activeSrc: currentSlide.src,
          lastKnownIndex: safeIndex,
          remainingMs: remainingMsRef.current,
        })
      }
    }
  }, [tabVisible, validSlides, safeIndex, currentSlide])

  const slideNumber = String(safeIndex + 1).padStart(2, "0")

  return (
    <figure className="em-hero-media">
      {previousSlide && previousSlide.src !== currentSlide.src && (
        <img
          src={previousSlide.src}
          alt=""
          aria-hidden="true"
          className="em-hero-img--prev"
        />
      )}
      <img
        key={currentSlide.src}
        src={currentSlide.src}
        alt={currentSlide.alt}
        className={previousSlide ? "em-hero-img--enter" : undefined}
        onError={() => {
          if (currentSlide.src !== DEFAULT_HERO_SLIDE.src) {
            markFailed(currentSlide.src)
          }
        }}
      />
      <span className="em-hero-index">{slideNumber} / The possibilities</span>
      <figcaption>
        <span className="em-eyebrow">The Lumière approach</span>
        <span className="em-hero-caption">Gather beautifully.</span>
      </figcaption>
    </figure>
  )
}

export default HeroSlideshow
