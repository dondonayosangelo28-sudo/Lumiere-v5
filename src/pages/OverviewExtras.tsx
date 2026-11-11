import { useNotify } from '../components/Notifications'
import Dropdown from '../components/Dropdown'
import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Calendar as CalIcon, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, X, ArrowRight, FileSpreadsheet, Image as ImageIcon, Loader2, Code2, Smartphone, Atom, Cloud, Database, LifeBuoy, Wallet, Globe } from 'lucide-react'
import { Card, Badge, Button, Field, Input, cx } from '../components/ui'
import RowMenu from '../components/RowMenu'
import type { Project } from '../data'
import type { Account } from '../auth/store'
import { canAccess } from '../auth/roleConfig'
import Modal from '../components/Modal'
import { Eye, Pencil, Trash2 } from 'lucide-react'

const NOW = new Date(2026, 9, 20)
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const same = (a: Date, b: Date) => a.getTime() === b.getTime()
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

function useOutside<T extends HTMLElement>(fn: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fn()
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [fn])
  return ref
}

const presets: Record<string, () => [Date, Date]> = {
  Custom: () => [NOW, NOW],
  Today: () => [NOW, NOW],
  Yesterday: () => [new Date(2026, 9, 19), new Date(2026, 9, 19)],
  'Last 7 Days': () => [new Date(2026, 9, 14), NOW],
  'Last 28 Days': () => [new Date(2026, 8, 23), NOW],
  'Last 30 Days': () => [new Date(2026, 8, 21), NOW],
  'This Month': () => [new Date(2026, 9, 1), new Date(2026, 9, 31)],
  'Last Month': () => [new Date(2026, 8, 1), new Date(2026, 8, 30)],
}

function Month({ y, m, from, to, pick }: { y: number; m: number; from: Date; to: Date; pick: (d: Date) => void }) {
  const first = new Date(y, m, 1).getDay()
  const n = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => new Date(y, m, i + 1))]
  return (
    <div className="grid grid-cols-7 gap-y-1.5 text-center text-[13px]">
      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
        <span key={d} className="pb-1 text-muted-foreground">{d}</span>
      ))}
      {cells.map((d, i) => {
        if (!d) return <span key={i} />
        const edge = same(d, from) || same(d, to)
        const inR = d > from && d < to
        return (
          <button
            key={i}
            onClick={() => pick(d)}
            className={cx(
              'h-8 font-medium transition-colors',
              edge ? 'rounded-md bg-invert text-invert-fg' : inR ? (same(d, NOW) ? 'bg-fg/20 text-foreground' : 'bg-fg/10 text-foreground') : 'rounded-md text-foreground hover:bg-elev',
            )}
          >
            {d.getDate()}
          </button>
        )
      })}
    </div>
  )
}

export function DateRangePicker() {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('This Month')
  const [sel, setSel] = useState('This Month')
  const [[from, to], setRange] = useState(presets['This Month']())
  const [view, setView] = useState(new Date(2026, 9, 1))
  const ref = useOutside<HTMLDivElement>(() => setOpen(false))
  const pick = (d: Date) => {
    setSel('Custom')
    if (!same(from, to) || d < from) setRange([d, d])
    else setRange([from, d])
  }
  const next = new Date(view.getFullYear(), view.getMonth() + 1, 1)
  const days = Math.round((day(to).getTime() - day(from).getTime()) / 864e5) + 1
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-elev">
        <CalIcon size={16} className="text-muted-foreground" /> {label} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[718px] overflow-hidden rounded-2xl border border-line bg-card text-foreground shadow-2xl animate-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Select Date</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="flex">
            <div className="w-[208px] border-r border-line p-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Quick Select</p>
              {Object.keys(presets).map((p) => (
                <button
                  key={p}
                  onClick={() => { setSel(p); const r = presets[p](); setRange(r); setView(new Date(r[0].getFullYear(), r[0].getMonth(), 1)) }}
                  className={cx('mb-1.5 flex h-[38px] w-full items-center rounded-md px-3 text-[14px]', sel === p ? 'bg-invert text-invert-fg' : 'text-foreground hover:bg-elev')}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex-1 bg-bg">
              <div className="flex items-end gap-3 border-b border-line bg-card p-4">
                {[['From', from], ['To', to]].map(([l, d], i) => (
                  <div key={l as string} className={cx('flex-1', i === 1 && 'order-3')}>
                    <p className="mb-1.5 text-[12px] font-semibold uppercase text-muted-foreground">{l as string}</p>
                    <div className="flex h-9 items-center rounded-md bg-field px-3 text-[14px] font-semibold text-foreground">{fmt(d as Date)}</div>
                  </div>
                ))}
                <div className="order-2 flex h-9 items-center gap-1 text-muted-foreground"><span className="h-px w-5 bg-line" /><ArrowRight size={14} /><span className="h-px w-5 bg-line" /></div>
              </div>
              <div className="grid grid-cols-2 gap-8 p-4">
                {[view, next].map((v, i) => (
                  <div key={i}>
                    <div className="mb-3 flex items-center justify-between">
                      {i === 0 ? <button aria-label="Previous month" onClick={() => setView(new Date(v.getFullYear(), v.getMonth() - 1, 1))} className="text-muted-foreground hover:text-foreground"><ChevronLeft size={16} /></button> : <span />}
                      <span className="text-[14px] font-semibold">{v.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                      {i === 1 ? <button aria-label="Next month" onClick={() => setView(next)} className="text-muted-foreground hover:text-foreground"><ChevronRight size={16} /></button> : <span />}
                    </div>
                    <Month y={v.getFullYear()} m={v.getMonth()} from={from} to={to} pick={pick} />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-line px-4 py-3">
                <span className="text-[12px] text-muted-foreground">{days} days selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setOpen(false)} className="h-8 rounded-full border border-line px-4 text-[13px] text-foreground hover:bg-elev">Cancel</button>
                  <button onClick={() => { setLabel(sel === 'Custom' ? `${fmt(from)} – ${fmt(to)}` : sel); setOpen(false) }} className="h-8 rounded-full bg-invert px-4 text-[13px] font-semibold text-invert-fg hover:opacity-90">Apply</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ExportMenu({ variant = 'outline', csv }: { variant?: 'outline' | 'ghost'; csv?: () => string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const notify = useNotify()
  const exporting = useRef(false)
  const ref = useOutside<HTMLDivElement>(() => setOpen(false))
  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = Object.assign(document.createElement('a'), { href: url, download: filename })
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  const run = async (kind: 'csv' | 'png') => {
    if (exporting.current) return
    setOpen(false)
    exporting.current = true
    setBusy(true)
    try {
      if (kind === 'csv' && csv) {
        download(new Blob([csv()], { type: 'text/csv;charset=utf-8' }), 'projects.csv')
        return
      }
      const target = document.getElementById('dashboard-image-export')
      if (!target) throw new Error('Dashboard is not available.')
      const { toBlob } = await import('html-to-image')
      await document.fonts.ready
      await Promise.all(Array.from(target.querySelectorAll('img'), (image) => image.decode()))
      const width = target.scrollWidth
      const height = target.scrollHeight
      const blob = await toBlob(target, {
        width,
        height,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        pixelRatio: Math.min(2, 8192 / Math.max(width, height)),
        style: { animation: 'none', transform: 'none' },
      })
      if (!blob) throw new Error('Image could not be generated.')
      download(blob, `dashboard-${new Date().toISOString().slice(0, 10)}.png`)
    } catch {
      notify({ tone: 'error', text: 'Export failed. Please try again once the dashboard has loaded.' })
    } finally {
      exporting.current = false
      setBusy(false)
    }
  }
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => csv ? setOpen((o) => !o) : void run('png')}
        disabled={busy}
        aria-label={csv ? 'Export projects' : 'Export dashboard as PNG'}
        aria-busy={busy}
        className={cx('flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-elev disabled:opacity-60', variant === 'outline' && 'border border-border')}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {busy ? 'Exporting Image...' : 'Export'}
      </button>
      {csv && open && (
        <div className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl animate-pop">
          <button onClick={() => run('csv')} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-elev">
            <FileSpreadsheet size={18} className="text-emerald-400" />
            <span><span className="block text-[14px] font-semibold">Export as CSV</span><span className="block text-[12px] text-muted-foreground">Download spreadsheet</span></span>
          </button>
          <button onClick={() => run('png')} className="flex w-full items-center gap-3 border-t border-border px-4 py-2.5 text-left hover:bg-elev">
            <ImageIcon size={18} className="text-blue-400" />
            <span><span className="block text-[14px] font-semibold">Export as Image</span><span className="block text-[12px] text-muted-foreground">Download PNG</span></span>
          </button>
        </div>
      )}
    </div>
  )
}

const pIcons = [Code2, Smartphone, Atom, Cloud, Database, LifeBuoy, Wallet, Globe]

export type RecentProjectsData = {
  all: Project[]
  setAll: Dispatch<SetStateAction<Project[]>>
  setTrash: Dispatch<SetStateAction<Project[]>>
}

export function RecentProjects({ account, all, setAll, setTrash }: RecentProjectsData & { account: Account }) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Project | null>(null)
  const per = 4
  const authorized = canAccess(account.role, 'projects')
  const sorted = authorized ? [...all].sort((a, b) => {
    const timestamp = (value: string) => {
      const [month, day, year] = value.split('/').map(Number)
      return Number.isFinite(year) ? new Date(year, month - 1, day).getTime() : 0
    }
    return timestamp(b.updated) - timestamp(a.updated) || b.id - a.id
  }) : []
  const total = sorted.length
  const pages = Math.max(1, Math.ceil(total / per))
  const currentPage = Math.min(page, pages)
  const rows = sorted.slice((currentPage - 1) * per, currentPage * per)
  const selected = sorted.find(project => project.id === selectedId)
  if (!authorized) return null
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-[16px] font-semibold text-foreground">Recent Projects</h3>
          <p className="text-[14px] text-muted-foreground">Overview of recent event projects.</p>
        </div>
        <ExportMenu variant="ghost" csv={() => 'name,status,updated\n' + sorted.map((r) => [r.name, r.status, r.updated].map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[600px] text-[14px]">
          <thead className="bg-elev text-left">
            <tr>
              <th className="px-4 py-4 font-semibold">Name</th>
              <th className="px-4 font-semibold">Status</th>
              <th className="px-4 font-semibold">Last Updated</th>
              <th className="px-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const Icon = pIcons[p.id % pIcons.length]
              return (
                <tr key={p.id} className={cx(i > 0 && 'border-t border-line')}>
                  <td className="px-4 py-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-7 place-items-center rounded-md bg-elev"><Icon size={14} /></span>
                      <div className="min-w-0">
                        <p className="font-semibold">{p.name}</p>
                        <p className="max-w-[240px] truncate text-[12px] text-muted-foreground">{p.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4"><Badge tone={p.status === 'Ready' ? 'success' : p.status === 'In Progress' ? 'warning' : 'danger'}>{p.status}</Badge></td>
                  <td className="px-4 text-muted-foreground">{p.updated}</td>
                  <td className="px-4">
                    <div className="flex justify-end">
                      <RowMenu items={[
                        { label: 'View', icon: Eye, onClick: () => { setSelectedId(p.id); setEditing(false) } },
                        { label: 'Edit', icon: Pencil, onClick: () => { setSelectedId(p.id); setDraft({ ...p }); setEditing(true) } },
                        { label: 'Delete', icon: Trash2, danger: true, onClick: () => { setAll(items => items.filter(item => item.id !== p.id)); setTrash(items => [p, ...items]) } },
                      ]} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {total === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">No event projects available.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[13px]">
        <span className="text-muted-foreground">Showing <b className="text-foreground">{total ? (currentPage - 1) * per + 1 : 0}</b> to <b className="text-foreground">{Math.min(currentPage * per, total)}</b> of <b className="text-foreground">{total}</b> results</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="h-9 rounded-full px-3 font-medium hover:bg-elev disabled:text-muted-foreground">Previous</button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)} className={cx('size-9 rounded-full font-semibold', n === currentPage ? 'bg-white text-neutral-900' : 'hover:bg-elev')}>{n}</button>
          ))}
          <button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="h-9 rounded-full px-3 font-semibold hover:bg-elev disabled:text-muted-foreground">Next</button>
        </div>
      </div>
      <Modal open={!!selected} onClose={() => setSelectedId(null)} title={editing ? 'Edit Project' : 'Project Details'}>
        {selected && (editing && draft ? (
          <form className="space-y-4" onSubmit={event => {
            event.preventDefault()
            if (!draft.name.trim()) return
            setAll(items => items.map(item => item.id === selected.id ? { ...item, name: draft.name.trim(), description: draft.description, status: draft.status, updated: new Date().toLocaleDateString('en-US') } : item))
            setSelectedId(null)
          }}>
            <Field label="Project Name"><Input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Description"><Input value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></Field>
            <Field label="Status">
              <Dropdown value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Project['status'] })} className="h-10 w-full rounded-lg border border-line bg-field px-3 text-sm">
                <option>Ready</option><option>In Progress</option><option>Blocked</option>
              </Dropdown>
            </Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>Cancel</Button><Button type="submit">Save Changes</Button></div>
          </form>
        ) : (
          <div className="space-y-4">
            <div><p className="font-semibold">{selected.name}</p><p className="text-sm text-muted-foreground">{selected.description}</p></div>
            <Badge tone={selected.status === 'Ready' ? 'success' : selected.status === 'Blocked' ? 'danger' : 'warning'}>{selected.status}</Badge>
            <dl className="grid grid-cols-2 gap-4 rounded-xl bg-field p-4">
              {[['Environment', selected.environment], ['Version', selected.version], ['Last Updated', selected.updated]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
            </dl>
          </div>
        ))}
      </Modal>
    </Card>
  )
}
