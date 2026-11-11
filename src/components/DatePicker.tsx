import { useEffect, useId, useRef, useState, type AriaAttributes, type KeyboardEvent } from 'react'
import { Popover } from '@base-ui/react/popover'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from './ui'
import { dropdownSurface } from './Dropdown'
import { useCloseOnOverlay, useOverlayContainer } from './OverlayLayer'
import { allowedDate, calendarDays, dateKey, parseDate, shiftMonth } from './calendarDates'

type Props = AriaAttributes & { value: string; onChange: (value: string) => void; min?: string; max?: string; disabled?: boolean; id?: string; name?: string; className?: string }

export default function DatePicker({ value, onChange, min, max, disabled, id, name, className, ...aria }: Props) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(value || dateKey(new Date()))
  const [month, setMonth] = useState(() => parseDate(value || dateKey(new Date())))
  const popup = useRef<HTMLDivElement>(null)
  const container = useOverlayContainer()
  const heading = useId()
  useCloseOnOverlay(() => setOpen(false))
  const move = (key: string) => {
    const next = min && key < min ? min : max && key > max ? max : key
    setFocused(next)
    setMonth(parseDate(next))
  }
  useEffect(() => {
    if (open) popup.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus()
  }, [focused, open])
  const choose = (key: string) => {
    if (!allowedDate(key, min, max)) return
    onChange(key)
    setOpen(false)
  }
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const date = parseDate(focused)
    let next: Date
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { next = new Date(date); next.setDate(date.getDate() + (event.key === 'ArrowRight' ? 1 : -1)) }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { next = new Date(date); next.setDate(date.getDate() + (event.key === 'ArrowDown' ? 7 : -7)) }
    else if (event.key === 'Home' || event.key === 'End') { next = new Date(date); next.setDate(date.getDate() - date.getDay() + (event.key === 'End' ? 6 : 0)) }
    else if (event.key === 'PageUp' || event.key === 'PageDown') next = shiftMonth(date, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1))
    else return
    event.preventDefault()
    move(dateKey(next))
  }
  const previous = new Date(month.getFullYear(), month.getMonth(), 0, 12)
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1, 12)
  const navClass = 'grid size-7 place-items-center rounded-md outline-none hover:bg-fg/10 focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-default disabled:opacity-30'
  return (
    <Popover.Root open={open} modal={false} onOpenChange={(nextOpen) => { if (nextOpen) move(value || dateKey(new Date())); setOpen(nextOpen) }}>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover.Trigger id={id} disabled={disabled} {...aria} className={cx('flex h-10 w-full min-w-0 items-center gap-3 rounded-md border border-line bg-field px-3 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-default disabled:opacity-60 aria-[invalid=true]:border-red-400', className)}>
        <CalendarDays size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        <span className={cx(!value && 'text-muted-foreground')}>{value || 'YYYY-MM-DD'}</span>
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner align="start" sideOffset={5} collisionPadding={8} className="z-[100] max-w-[calc(100vw-16px)]">
          <Popover.Popup ref={popup} aria-labelledby={heading} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) } }} initialFocus={() => popup.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]:not(:disabled)`) ?? popup.current} className={cx(dropdownSurface, 'max-h-[var(--available-height)] w-64 max-w-[calc(100vw-16px)] overflow-y-auto p-3 outline-none')}>
            <div className="mb-3 flex items-center justify-between">
              <button type="button" aria-label="Previous month" disabled={!!min && dateKey(previous) < min} onClick={() => move(dateKey(shiftMonth(month, -1)))} className={navClass}><ChevronLeft size={16} /></button>
              <h3 id={heading} aria-live="polite" className="text-sm font-semibold">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
              <button type="button" aria-label="Next month" disabled={!!max && dateKey(next) > max} onClick={() => move(dateKey(shiftMonth(month, 1)))} className={navClass}><ChevronRight size={16} /></button>
            </div>
            <div role="grid" aria-labelledby={heading} onKeyDown={keys}>
              <div role="row" className="mb-1 grid grid-cols-7">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} role="columnheader" className="py-1 text-center text-xs text-muted-foreground">{day}</span>)}
              </div>
              {Array.from({ length: 6 }, (_, row) => <div key={row} role="row" className="grid grid-cols-7">
                {calendarDays(month).slice(row * 7, row * 7 + 7).map((date) => {
                  const key = dateKey(date)
                  return <div key={key} role="gridcell" aria-selected={key === value}>
                    <button type="button" data-date={key} aria-label={date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} aria-current={key === dateKey(new Date()) ? 'date' : undefined} tabIndex={key === focused ? 0 : -1} disabled={!allowedDate(key, min, max)} onClick={() => choose(key)} onFocus={() => setFocused(key)} className={cx('my-0.5 grid h-8 w-full place-items-center rounded-md text-sm outline-none hover:bg-fg/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/40 disabled:cursor-default disabled:opacity-25', date.getMonth() !== month.getMonth() ? 'text-muted-foreground' : 'text-foreground font-medium', key === value && 'bg-fg/20 font-bold')}>{date.getDate()}</button>
                  </div>
                })}
              </div>)}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
