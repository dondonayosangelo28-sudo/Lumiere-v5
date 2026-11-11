import OverlayLayer from './OverlayLayer'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx } from './ui'
import { useShell } from './Shell'

// Right-side sheet. Stays mounted through the exit transition, and collapses the sidebar while open.
export default function Drawer({ open, onClose, title, subtitle, children, footer, compact = false }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; compact?: boolean }) {
  const { setCollapsed } = useShell()
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (open) {
      setMounted(true)
      setCollapsed(true)
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!mounted) return null
  return (
    <OverlayLayer panelRef={asideRef} onClose={onClose} className="fixed inset-0">
      <div onClick={onClose} className={cx('absolute inset-0 bg-black/70 transition-opacity duration-300', shown ? 'opacity-100' : 'opacity-0')} />
      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'absolute right-0 flex w-[448px] outline-none max-w-full flex-col bg-[#191919] shadow-[-20px_0_60px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] dark:bg-[#191919] [:root:not(.dark)_&]:bg-white',
          compact ? 'top-6 max-h-[calc(100dvh-48px)] overflow-hidden' : 'inset-y-0',
          shown ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className={cx('flex items-center justify-between px-6 pb-2 pt-5', compact && 'shrink-0')}>
          <div>
            <h2 className="text-[18px] font-semibold leading-7 text-foreground">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground">
            <X size={18} />
          </button>
        </header>
        <div className={cx('overflow-y-auto px-6', compact ? 'min-h-0 pt-5 pb-3' : 'flex-1 py-5')}>{children}</div>
        {footer && <footer className={cx('flex gap-2 px-6 pb-5 pt-3', compact ? 'shrink-0 flex-col items-stretch sm:flex-row sm:items-center sm:justify-end [&>button]:justify-center' : 'items-center justify-end')}>{footer}</footer>}
      </aside>
    </OverlayLayer>
  )
}
