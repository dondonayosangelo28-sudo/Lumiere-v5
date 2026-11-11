import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const PortalContext = createContext<RefObject<HTMLDivElement | null> | undefined>(undefined)
export const useOverlayContainer = () => useContext(PortalContext)
const layers: { root: HTMLElement; panel: HTMLElement; close: () => void }[] = []
const originalInert = new Map<HTMLElement, boolean>()
let unlock: (() => void) | undefined
let observer: MutationObserver | undefined
const focusable = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'

function syncBackground() {
  originalInert.forEach((value, element) => { element.inert = value })
  const top = layers.at(-1)
  if (!top) { originalInert.clear(); return }
  for (const element of Array.from(document.body.children)) {
    if (!(element instanceof HTMLElement) || element === top.root) continue
    if (!originalInert.has(element)) originalInert.set(element, element.inert)
    element.inert = true
  }
}

export function useCloseOnOverlay(close: (root?: HTMLElement) => void) {
  const latest = useRef(close)
  latest.current = close
  useEffect(() => {
    const dismiss = (event: Event) => latest.current((event as CustomEvent<HTMLElement>).detail)
    window.addEventListener('app:overlay-open', dismiss)
    return () => window.removeEventListener('app:overlay-open', dismiss)
  }, [])
}

export default function OverlayLayer({ children, panelRef, onClose, className }: { children: ReactNode; panelRef: RefObject<HTMLElement | null>; onClose: () => void; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!root.current || !panelRef.current) return
    const opener = document.activeElement as HTMLElement | null
    const layer = { root: root.current, panel: panelRef.current, close: () => close.current() }
    if (!layers.length) {
      const bodyOverflow = document.body.style.overflow
      const htmlOverflow = document.documentElement.style.overflow
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      unlock = () => { document.body.style.overflow = bodyOverflow; document.documentElement.style.overflow = htmlOverflow }
      observer = new MutationObserver(syncBackground)
      observer.observe(document.body, { childList: true })
    }
    layers.push(layer)
    layer.root.style.zIndex = String(1000 + layers.length)
    window.dispatchEvent(new CustomEvent('app:overlay-open', { detail: layer.root }))
    syncBackground()
    layer.panel.focus({ preventScroll: true })
    const key = (event: KeyboardEvent) => {
      if (layers.at(-1) !== layer || event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); layer.close(); return }
      if (event.key !== 'Tab') return
      const items = Array.from(layer.root.querySelectorAll<HTMLElement>(focusable)).filter((el) => !el.closest('[inert]') && el.getClientRects().length)
      const index = items.indexOf(document.activeElement as HTMLElement)
      if (!items.length) { event.preventDefault(); layer.panel.focus(); return }
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && (index === items.length - 1 || index < 0)) { event.preventDefault(); items[0].focus() }
    }
    const focus = (event: FocusEvent) => {
      if (layers.at(-1) === layer && !layer.root.contains(event.target as Node)) layer.panel.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', key)
    document.addEventListener('focusin', focus)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('focusin', focus)
      const wasTop = layers.at(-1) === layer
      layers.splice(layers.indexOf(layer), 1)
      syncBackground()
      if (!layers.length) { observer?.disconnect(); unlock?.(); unlock = undefined }
      if (wasTop) queueMicrotask(() => {
        const top = layers.at(-1)
        if (opener?.isConnected && !opener.closest('[inert]') && (!top || top.root.contains(opener))) opener.focus({ preventScroll: true })
        else top?.panel.focus({ preventScroll: true })
      })
    }
  }, [panelRef])
  return createPortal(
    <PortalContext.Provider value={root}>
      <div ref={root} className={className} style={{ zIndex: 1000 }}>{children}</div>
    </PortalContext.Provider>,
    document.body,
  )
}
