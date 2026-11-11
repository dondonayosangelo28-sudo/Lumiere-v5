import OverlayLayer from './OverlayLayer'
import { useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx } from './ui'

export default function Modal({ open, onClose, title, children, lowered = false, compact = false, panelClassName }: { open: boolean; onClose: () => void; title: string; children: ReactNode; lowered?: boolean; compact?: boolean; panelClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  if (!open) return null
  return (
    <OverlayLayer panelRef={ref} onClose={onClose} className={cx('fixed inset-0 grid place-items-center bg-black/60 backdrop-blur-sm', lowered ? 'px-4 pb-4 pt-12' : 'p-4')}>
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cx('relative w-full overflow-y-auto rounded-2xl border border-line bg-card shadow-2xl outline-none animate-fade-up', compact ? 'max-w-md p-5' : 'max-w-lg p-6', lowered ? 'max-h-[calc(100dvh-64px)]' : 'max-h-[calc(100dvh-32px)]', panelClassName)} onClick={(e) => e.stopPropagation()}>
        <div className={cx('flex items-center justify-between', compact ? 'mb-4' : 'mb-5')}>
          <h2 className={cx('font-semibold text-foreground', compact ? 'text-base' : 'text-lg')}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-elev hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </OverlayLayer>
  )
}
