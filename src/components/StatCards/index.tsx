import { useRef, useState, type ReactNode } from 'react'
import { GripHorizontal, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
import { StatCard, cx } from '../ui'
import type { StatCardData } from './types'

export default function StatCards({ data, userId, groupId = 'admin-summary', renderCard, preserveDesign = false, gridCols = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', gap = 'gap-4' }: {
  data: readonly StatCardData[]
  userId: number
  groupId?: string
  renderCard?: (card: StatCardData, handle: ReactNode) => ReactNode
  preserveDesign?: boolean
  gridCols?: string
  gap?: string
}) {
  const storageKey = groupId === 'admin-summary' ? `lumiere.stat-card-order.${userId}` : `lumiere.stat-card-order.${userId}.${groupId}`
  const defaults = data.map((card) => card.id)
  const normalize = (value: unknown) => {
    const saved = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && defaults.includes(id)) : []
    return [...new Set([...saved, ...defaults])]
  }
  const [order, setOrder] = useState(() => {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey) ?? 'null')) } catch { return defaults }
  })
  const [active, setActive] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const original = useRef(order)
  const current = useRef(order)
  const pointer = useRef<number | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const hasDescriptions = data.some((card) => card.description !== undefined)
  const save = (next: string[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setAnnouncement('Card order saved.')
    } catch { setAnnouncement('Card order changed, but browser storage is unavailable.') }
  }
  const begin = (id: string) => {
    original.current = current.current
    setActive(id)
    setAnnouncement('Card picked up. Use arrow keys to move, Space or Enter to drop, Escape to cancel.')
  }
  const move = (id: string, target: string) => {
    const next = [...current.current]
    const from = next.indexOf(id), to = next.indexOf(target)
    if (from < 0 || to < 0 || from === to) return
    const positions = new Map(Array.from(grid.current?.children ?? []).map((element) => [element, element.getBoundingClientRect()]))
    next.splice(from, 1)
    next.splice(to, 0, id)
    current.current = next
    setOrder(next)
    requestAnimationFrame(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      positions.forEach((before, element) => {
        const after = element.getBoundingClientRect()
        const dx = before.left - after.left, dy = before.top - after.top
        if (dx || dy) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' })
      })
    })
    setAnnouncement(`${data.find((card) => card.id === id)?.title}, position ${to + 1} of ${next.length}.`)
  }
  const finish = (cancel = false) => {
    if (cancel) {
      current.current = original.current
      setOrder(original.current)
      setAnnouncement('Reordering cancelled.')
    } else save(current.current)
    pointer.current = null
    setActive(null)
  }
  return (
    <div>
      <p id={`stat-reorder-help-${userId}-${groupId}`} className="sr-only">Use the dotted handles to reorder cards. Press Space or Enter to pick up, arrow keys to move, Space or Enter to drop, or Escape to cancel.</p>
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      <div ref={grid} className={cx(gridCols, gap, 'auto-rows-fr')}
        onPointerMove={(event) => {
          if (pointer.current !== event.pointerId || !active) return
          const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-stat-id]')
          const target = element?.parentElement === grid.current ? element.getAttribute('data-stat-id') : null
          if (target) move(active, target)
        }}
        onPointerUp={(event) => { if (pointer.current === event.pointerId) finish() }}
        onPointerCancel={() => { if (pointer.current !== null) finish(true) }}
        onLostPointerCapture={() => { if (pointer.current !== null) finish(true) }}
      >
        {normalize(order).map((id) => {
          const card = data.find((item) => item.id === id)!
          const handle = (
                  <span
                    role="button" tabIndex={0} aria-label={`Drag to reorder ${card.title}`}
                    aria-describedby={`stat-reorder-help-${userId}-${groupId}`}
                    aria-pressed={active === id}
                    className={cx('grid size-6 shrink-0 place-items-center touch-none border-0 bg-transparent text-muted-foreground outline-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground', active === id ? 'cursor-grabbing' : 'cursor-grab')}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || active !== null) return
                      event.preventDefault()
                      event.currentTarget.focus()
                      grid.current?.setPointerCapture(event.pointerId)
                      pointer.current = event.pointerId
                      begin(id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === ' ' || event.key === 'Enter') {
                        event.preventDefault()
                        if (active === id) finish()
                        else if (!active) begin(id)
                      } else if (active === id && event.key === 'Escape') {
                        event.preventDefault(); finish(true)
                      } else if (active === id && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
                        event.preventDefault()
                        const index = current.current.indexOf(id)
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? current.current.length - 1 : index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1)
                        const target = current.current[next]
                        if (target) move(id, target)
                      }
                    }}
                    onBlur={() => { if (active === id && pointer.current === null) finish() }}
                  ><GripHorizontal size={14} aria-hidden /></span>
          )
          return (
            <div key={id} data-stat-id={id} className={cx('min-w-0 rounded-xl outline-none transition-all duration-200 motion-reduce:transition-none', active === id && 'scale-[0.98] shadow-lg')}>
              {renderCard ? renderCard(card, handle) : <StatCard
                icon={card.icon} title={card.title}
                value={typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                description={hasDescriptions ? card.description ?? '' : undefined}
                aligned showHandle={false} watermark={preserveDesign}
                trendContent={card.trend && (
                  <span title={card.trend.description} aria-label={`${card.trend.label}. ${card.trend.description}`} className={cx('inline-flex shrink-0 items-center gap-1 text-[12px] font-normal leading-4', card.trend.tone === 'negative' ? 'text-[#ef4444]' : card.trend.tone === 'positive' ? 'text-[#4ade80]' : 'text-[#b3b4b5]')}>
                    {card.trend.label !== '—' && (card.trend.direction === 'up' ? <TrendingUp size={12} strokeWidth={1.5} className="size-3 shrink-0" aria-hidden /> : card.trend.direction === 'down' ? <TrendingDown size={12} strokeWidth={1.5} className="size-3 shrink-0" aria-hidden /> : <ArrowRight size={12} strokeWidth={1.5} className="size-3 shrink-0" aria-hidden />)}
                    {card.trend.label}
                  </span>
                )}
                handleContent={handle}
              />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
