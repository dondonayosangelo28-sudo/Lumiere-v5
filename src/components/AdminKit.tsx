import DatePicker from './DatePicker'
import Dropdown from './Dropdown'
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, RefreshCw, Search } from 'lucide-react'
import { cx } from './ui'

export const fieldCls = 'h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.05] px-3 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-fg/25 focus:ring-2 focus:ring-fg/10 disabled:cursor-default disabled:text-muted-foreground aria-[invalid=true]:border-red-400'
export const ghostBtn = 'flex h-8 whitespace-nowrap items-center gap-2 rounded-full px-3 text-[13px] font-semibold transition-colors hover:bg-fg/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:pointer-events-none disabled:text-muted-foreground'

/* ---------- Time ---------- */

export { TIMEZONE, fmtDateTime, fmtTime, fmtFull, dayStart, dayEnd } from '../auth/manilaTime'

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/* ---------- Filters ---------- */

export function SearchField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(fieldCls, 'search-control pl-10')} />
    </div>
  )
}

export function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="relative">
      <Dropdown aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cx(fieldCls, 'filter-control appearance-none pr-9')}>
        {children}
      </Dropdown>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{label}</span>
      <DatePicker aria-label={label} value={value} min={min} max={max} onChange={onChange} />
    </label>
  )
}

export function ResetFiltersButton({ onClick, disabled, compact = false }: { onClick: () => void; disabled: boolean; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cx('flex items-center justify-center gap-2 rounded-full px-3 font-medium transition-colors hover:bg-fg/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:pointer-events-none disabled:text-muted-foreground', compact ? 'h-8 text-xs' : 'h-10 text-[13px]')}>
      <RefreshCw size={compact ? 14 : 16} aria-hidden /> Reset Filters
    </button>
  )
}

/* ---------- Table helpers ---------- */

export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} aria-hidden>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-4 py-[18px]"><span className={cx('inline-block h-3.5 animate-pulse rounded-full bg-fg/[0.12]', c === 0 ? 'w-[130px]' : 'w-[80px]')} /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-14 text-center text-muted-foreground">{children}</td>
    </tr>
  )
}

function pageList(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

export function Pager({ page, pages, total, per, noun, onPage }: { page: number; pages: number; total: number; per: number; noun: string; onPage: (n: number) => void }) {
  if (!total) return null
  const btn = 'h-9 rounded-full border border-edge px-4 text-[13px] font-semibold transition-colors hover:bg-fg/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:pointer-events-none disabled:text-muted-foreground'
  return (
    <nav aria-label={`${noun} pagination`} className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-4 py-4 text-[14px]">
      <span aria-live="polite">Showing <b>{(page - 1) * per + 1}</b> to <b>{Math.min(page * per, total)}</b> of <b>{total}</b> {noun}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={btn}>Previous</button>
        {pageList(page, pages).map((n, i) =>
          n === '…' ? (
            <span key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">…</span>
          ) : (
            <button type="button" key={n} aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)} className={cx('size-8 rounded-full text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg', n === page ? 'bg-invert text-invert-fg' : 'hover:bg-fg/[0.08]')}>{n}</button>
          ),
        )}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={btn}>Next</button>
      </div>
    </nav>
  )
}

/* ---------- Feedback ---------- */

export type { Notification as Flash } from './Notifications'

export const resultTone = (r: string) => (r === 'Success' ? 'success' : r === 'Failed' ? 'warning' : 'danger') as 'success' | 'warning' | 'danger'
