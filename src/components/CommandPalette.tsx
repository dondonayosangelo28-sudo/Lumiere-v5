import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, File } from 'lucide-react'
import { cx } from './ui'
import type { Route } from './Shell'
import { canAccess, roleModules } from '../auth/roleConfig'
import type { Role } from '../auth/store'
import OverlayLayer from './OverlayLayer'

const baseItems: { title: string; desc: string; tag: string; route: Route }[] = [
  { title: 'Notifications', desc: 'Updates relevant to your role', tag: 'Pages', route: 'notifications' },
  { title: 'Security', desc: 'Locked accounts, login activity, and sessions', tag: 'Admin', route: 'security' },
  { title: 'Audit Logs', desc: 'Read-only account and security events', tag: 'Admin', route: 'audit-logs' },
  { title: 'Overview', desc: 'Dashboard overview with key metrics and project status', tag: 'Pages', route: 'overview' },
  { title: 'All Users', desc: 'Create, edit, and deactivate accounts', tag: 'Admin', route: 'accounts' },
  { title: 'Deleted Users', desc: 'View inactive users and reactivate accounts', tag: 'Admin', route: 'accounts-deleted' },
  { title: 'Settings', desc: 'Profile, security and application settings', tag: 'Pages', route: 'settings-profile' },
]

export default function CommandPalette({ role, open, onClose, go }: { role: Role; open: boolean; onClose: () => void; go: (r: Route) => void }) {
  // Only offer screens the signed-in role can open.
  const items = [...baseItems, ...roleModules[role].map((m) => ({ title: m.label, desc: m.description, tag: 'Modules', route: `module-${m.key}` as Route }))].filter((i) => canAccess(role, i.route))
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const list = useMemo(() => items.filter((x) => (x.title + ' ' + x.desc).toLowerCase().includes(q.toLowerCase())), [q, role])
  useEffect(() => {
    if (open) { setQ(''); setI(0); setTimeout(() => input.current?.focus(), 0) }
  }, [open])
  useEffect(() => setI(0), [q, role])
  if (!open) return null
  const choose = (n: number) => { const it = list[n]; if (it) { go(it.route); onClose() } }
  return (
    <OverlayLayer panelRef={panel} onClose={onClose} className="fixed inset-0 flex items-start justify-center bg-black/55 pt-24 backdrop-blur-md">
      <div className="absolute inset-0" onMouseDown={onClose} aria-hidden />
      <div
        ref={panel}
        data-command-palette
        role="dialog"
        aria-modal="true"
        aria-label="Search navigation"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(list.length - 1, v + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(0, v - 1)) }
          else if (e.key === 'Enter') choose(i)
        }}
        className="relative flex h-fit max-h-[calc(100dvh-112px)] w-[560px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-line bg-card text-foreground shadow-[0_24px_60px_rgba(0,0,0,0.75)] outline-none animate-fade-up"
      >
        <div className="search-control flex h-[60px] items-center gap-3 border-b border-[#242424] px-5">
          <Search size={18} className="shrink-0 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for anything..."
            className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-full bg-[#242424] text-muted-foreground transition-colors hover:bg-[#323232] hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[416px] space-y-1 overflow-y-auto p-2">
          {list.length === 0 && <p className="px-4 py-10 text-center text-[14px] text-muted-foreground">No results found.</p>}
          {list.map((it, n) => (
            <button
              key={it.title}
              onMouseEnter={() => setI(n)}
              onClick={() => choose(n)}
              className={cx(
                'flex w-full items-center gap-3.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                n === i ? 'border-[#5c5c60] bg-[#3b3b3e]' : 'border-transparent hover:bg-white/[0.04]',
              )}
            >
              <span
                className={cx(
                  'grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground',
                  n === i ? 'bg-[#4b4b4f]' : 'bg-[#2a2a2d]',
                )}
              >
                <File size={15} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-5 text-foreground">{it.title}</span>
                <span className="block truncate text-[13px] leading-5 text-muted-foreground">{it.desc}</span>
              </span>
              <span className="shrink-0 text-[12px] text-muted-foreground">{it.tag}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-[#323235] bg-[#2a2a2d] px-4 py-2.5 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-4">
            {[['↑↓', 'to navigate'], ['↵', 'to select'], ['esc', 'to close']].map(([k, l]) => (
              <span key={l} className="flex items-center gap-1.5">
                <kbd className="rounded bg-[#141414] px-1.5 py-0.5 font-mono text-[10px] leading-4 text-muted-foreground">{k}</kbd>
                {l}
              </span>
            ))}
          </span>
          <span>Search by Lumiere</span>
        </div>
      </div>
    </OverlayLayer>
  )
}
