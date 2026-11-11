import { useCloseOnOverlay } from './OverlayLayer'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Menu,
  Search,
  Sun,
  Moon,
  Bell,
  ChevronDown,
  ChevronRight,
  Home,
  Users,
  Settings,
  LogOut,
  Trash2,
  Check,
  X,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cx } from './ui'
import CommandPalette from './CommandPalette'
import { NavigationContext } from './NavigationContext'
import { adminModules, roleModules } from '../auth/roleConfig'
import { accountName, type Account, type Role } from '../auth/store'

export type Route =
  | 'overview'
  | 'accounts'
  | 'accounts-deleted'
  | 'projects'
  | 'projects-deleted'
  | 'settings-profile'
  | 'settings-security'
  | 'settings-app'
  | 'security'
  | 'audit-logs'
  | 'notifications'
  | `module-${string}`

type NavItem = { label: string; icon: LucideIcon; route?: Route; children?: { label: string; icon: LucideIcon; route: Route }[] }

type NavGroup = { section: string; items: NavItem[] }

// Sidebar contents come from the signed-in account's role.
function navFor(role: Role): NavGroup[] {
  const account: NavGroup = { section: 'Account', items: [{ label: 'Settings', icon: Settings, route: 'settings-profile' }] }
  if (role !== 'System Admin') {
    return [
      { section: role, items: [{ label: 'Dashboard', icon: Home, route: 'overview' }, ...roleModules[role].map((m) => ({ label: m.label, icon: m.icon, route: `module-${m.key}` as Route }))] },
      account,
    ]
  }
  return [
    {
      section: 'Administration',
      items: [
        { label: 'Dashboard', icon: Home, route: 'overview' },
        { label: 'Users', icon: Users, children: [{ label: 'All', icon: Users, route: 'accounts' }, { label: 'Deleted', icon: Trash2, route: 'accounts-deleted' }] },
        ...adminModules.map((m) => ({ label: m.label, icon: m.icon, route: m.key as Route })),
      ],
    },
    account,
  ]
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

export function Logo() {
  return (
    <span className="flex items-center">
      <img src="/lumiere-logo.png" alt="Lumière" className="h-6 w-auto object-contain dark:invert" />
    </span>
  )
}

function Sidebar({ role, route, go, open, onClose, collapsed, onExpand, onLogout }: { role: Role; route: Route; go: (r: Route) => void; open: boolean; onClose: () => void; collapsed: boolean; onExpand: () => void; onLogout: () => void }) {
  // Rail mode applies on desktop only; the mobile drawer always shows labels.
  const rail = collapsed && !open
  const hide = rail ? 'lg:hidden' : 'opacity-100'
  const nav = navFor(role)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Users: route.startsWith('accounts'),
  })
  useEffect(() => {
    if (route.startsWith('accounts')) setExpanded((e) => ({ ...e, Users: true }))
  }, [route])

  const isActive = (item: NavItem) =>
    item.route === route || (item.route?.startsWith('settings') && route.startsWith('settings')) || item.children?.some((c) => c.route === route)

  const row = 'flex w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-[11px] py-[10px] text-[14px] leading-5 transition-colors duration-150'

  return (
    <>
      <div className={cx('fixed inset-0 z-30 bg-black/50 transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={onClose} />
      <aside
        className={cx(
          'app-sidebar fixed bottom-[15px] left-[14px] top-[85px] z-40 flex w-[220px] flex-col overflow-hidden rounded-[14px] border border-edge not-dark:bg-nav pb-5 transition-[transform,width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:sticky lg:top-[85px] lg:z-0 lg:h-[calc(100vh-100px)] lg:translate-x-0',
          collapsed ? 'lg:w-[60px]' : 'lg:w-[220px]',
          open ? 'translate-x-0' : '-translate-x-[110%]',
        )}
      >
        <div className="pointer-events-none absolute inset-0 dark:hidden" style={{ backgroundImage: 'radial-gradient(800px 2900px at 0% 0%, rgba(205,205,205,0.04) 0%, rgba(205,205,205,0) 30%, rgba(0,0,0,0) 70%)' }} />
        <nav className={cx("relative flex flex-1", rail ? "w-[220px] lg:w-[60px] lg:items-center lg:px-0 lg:pt-4" : "w-[220px]", " flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-2")}>
          {nav.map((group) => (
            <div key={group.section} className={cx("flex flex-col gap-1", rail && "lg:w-full lg:items-center lg:gap-1")}>
              <div className={cx("relative flex min-h-[30px] items-end", rail && "lg:w-full lg:min-h-[28px] lg:justify-center")}>
                <span className={cx('px-[6px] pb-1 text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground transition-opacity duration-200', hide)}>{group.section}</span>
                <span className={cx('absolute left-1/2 top-1/2 hidden h-px w-[20px] -translate-x-1/2 rounded bg-fg/20 transition-opacity duration-200 lg:block', rail ? 'opacity-100' : 'opacity-0')} />
              </div>
              {group.items.map((item) => {
                const active = isActive(item)
                const isOpen = !!expanded[item.label] && !rail
                return (
                  <div key={item.label}>
                    <button
                      onClick={() => {
                        if (item.children && rail) {
                          setExpanded((e) => ({ ...e, [item.label]: true }))
                          onExpand()
                        }
                        else if (item.children) setExpanded((e) => ({ ...e, [item.label]: !e[item.label] }))
                        else if (item.route) go(item.route)
                      }}
                      title={rail ? item.label : undefined}
                      aria-expanded={item.children ? isOpen : undefined}
                      className={cx(
                        row,
                        rail && 'lg:mx-auto lg:size-11 lg:justify-center lg:rounded-[10px] lg:p-0',
                        active ? 'bg-fg/[0.18] text-foreground' : 'text-muted-foreground hover:bg-fg/[0.06] hover:text-foreground',
                      )}
                    >
                      <item.icon size={rail ? 18 : 20} strokeWidth={1.6} className="shrink-0" />
                      <span className={cx('flex-1 text-left transition-opacity duration-200', hide)}>{item.label}</span>
                      {item.children && (
                        <ChevronRight size={16} className={cx('shrink-0 transition-[transform,opacity] duration-200', isOpen && 'rotate-90', hide)} />
                      )}
                    </button>
                    {item.children && (
                      <div className={cx('grid transition-[grid-template-rows,opacity] duration-300 ease-out', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                        <div className="overflow-hidden">
                          <div className={cx('relative ml-[26px] mt-1 flex flex-col gap-0.5 pl-[10px]', item.label === 'Users' && 'before:absolute before:inset-y-0 before:left-[10px] before:w-px before:bg-fg/10')}>
                            {item.children.map((c) => (
                              <button
                                key={c.route}
                                tabIndex={isOpen ? 0 : -1}
                                aria-current={route === c.route ? 'page' : undefined}
                                onClick={() => go(c.route)}
                                className={cx(
                                  'relative flex w-full items-center gap-2 rounded-md px-2.5 py-[6px] text-[14px] leading-5 transition-colors duration-150',
                                  route === c.route ? 'font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-6 before:w-px before:-translate-y-1/2 before:rounded-full before:bg-foreground' : 'text-muted-foreground hover:bg-fg/[0.06] hover:text-foreground',
                                )}
                              >
                                <c.icon size={16} strokeWidth={1.6} />
                                {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>
        <div className={cx("relative border-t border-edge px-2 pt-3", rail ? "w-[220px] lg:flex lg:w-[60px] lg:justify-center lg:px-0" : "w-[220px]")}>
          <button onClick={onLogout} title={rail ? 'Logout' : undefined} className={cx(row, rail && 'lg:mx-auto lg:size-11 lg:justify-center lg:rounded-[10px] lg:p-0', 'text-muted-foreground hover:bg-fg/20 hover:text-destructive focus-visible:bg-fg/20 focus-visible:text-destructive active:bg-fg/20 active:text-destructive')}>
            <span className="grid size-5 shrink-0 place-items-center"><LogOut size={18} strokeWidth={1.6} /></span>
            <span className={cx('transition-opacity duration-200', hide)}>Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}

function useClickOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut()
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onOut])
  return ref
}

const seedNotes = [
  { id: 1, title: 'New user registered', body: 'A new user signed up and is waiting for email verification', time: '2 min ago', unread: true, dot: 'bg-neutral-500' },
  { id: 2, title: 'Project ready', body: 'A project moved from In Progress to Ready', time: '1 hour ago', unread: false, dot: 'bg-white' },
  { id: 3, title: 'Role permissions changed', body: "An admin role's permissions were updated", time: '3 hours ago', unread: false, dot: 'bg-neutral-500' },
  { id: 4, title: 'Security alert', body: 'Multiple failed login attempts detected on an admin account', time: '5 hours ago', unread: false, dot: 'bg-red-500' },
  { id: 5, title: 'Weekly report available', body: 'Your weekly performance summary is ready to view', time: '1 day ago', unread: false, dot: 'bg-neutral-500' },
]

function TopBar({ account, dark, setDark, onMenu, go, onLogout }: { account: Account; dark: boolean; setDark: (v: boolean) => void; onMenu: () => void; go: (r: Route) => void; onLogout: () => void }) {
  const [menu, setMenu] = useState<null | 'bell' | 'user'>(null)
  const [notes, setNotes] = useState(seedNotes)
  const unread = notes.filter((n) => n.unread).length
  const ref = useClickOutside(() => setMenu(null))
  const [palette, setPalette] = useState(false)
  useCloseOnOverlay((root) => { setMenu(null); if (!root?.querySelector('[data-command-palette]')) setPalette(false) })
  const name = accountName(account)
  const ini = initials(name)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (document.querySelector('[aria-modal="true"]')) return
        e.preventDefault()
        setPalette((p) => !p)
      }
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const toggle = (m: typeof menu) => setMenu((cur) => (cur === m ? null : m))
  const chip = 'border border-edge bg-chip text-foreground transition-colors duration-150 hover:brightness-110'
  const pop = 'fixed right-4 top-20 z-[100] max-h-[calc(100dvh-112px)] max-w-[calc(100vw-64px)] overflow-y-auto overscroll-contain rounded-lg border border-line bg-card text-foreground shadow-xl animate-pop [&_button]:outline-none [&_button:focus-visible]:bg-fg/10 [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-inset [&_button:focus-visible]:ring-fg/30 [&_button:disabled]:cursor-default [&_button:disabled]:opacity-60'
  const menuKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([aria-disabled="true"])'))
    if (!buttons.length) return
    e.preventDefault()
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next].focus()
  }

  return (
    <>
      {/* Open menus dim the page behind the header */}
      <div className={cx('fixed inset-0 z-30 bg-black/55 transition-opacity duration-200', menu ? 'opacity-100' : 'pointer-events-none opacity-0')} />
      <div className="sticky top-0 z-40 px-[15px] pt-[10px]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2.5 bg-bg dark:bg-black" />
      <header className="app-topbar relative flex h-16 items-center rounded-[14px] border border-edge not-dark:bg-chrome/80 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 rounded-[14px] dark:hidden" style={{ backgroundImage: 'radial-gradient(2800px 900px at 0% 0%, rgba(205,205,205,0.04) 0%, rgba(205,205,205,0) 30%, rgba(0,0,0,0) 70%)' }} />
        <div className="relative flex w-60 items-center px-3">
          <button onClick={onMenu} aria-label="Toggle sidebar" className={cx('mr-2 grid size-8 place-items-center rounded-full text-muted-foreground', chip)}>
            <Menu size={16} />
          </button>
          <Logo />
        </div>
        <div className="flex-1" />
        <div ref={ref} className="relative flex items-center gap-4 pr-6">
          <button onClick={() => setPalette(true)} className={cx('search-control hidden h-8 w-52 items-center justify-between rounded-full px-3 text-[14px] text-muted-foreground md:flex', chip)}>
            <span className="flex items-center gap-2"><Search size={16} /> Search...</span>
            <kbd className="rounded-md border border-edge bg-nav px-1.5 py-0.5 font-mono text-[10px] leading-[14px]">Ctrl+K</kbd>
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme" className={cx('grid size-8 place-items-center rounded-full', chip)}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="relative">
              <button onClick={() => toggle('bell')} aria-label="Notifications" className={cx('relative grid size-8 place-items-center rounded-full', chip)}>
                <Bell size={16} />
                {unread > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-[#f87171] text-[12px] leading-4 text-white">{unread}</span>}
              </button>
              {menu === 'bell' && (
                <div onKeyDown={menuKeys} className={cx(pop, 'w-[320px]')}>
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-[16px] font-semibold">Notifications</span>
                    <button onClick={() => setNotes((ns) => ns.map((n) => ({ ...n, unread: false })))} className="text-[14px] font-medium transition-colors hover:text-muted-foreground">Mark all read</button>
                  </div>
                  <ul className="max-h-[300px] overflow-y-auto">
                    {notes.map((n) => (
                      <li key={n.id} className={cx('group relative flex gap-3 px-4 py-3 transition-colors', n.unread ? 'bg-chip' : 'hover:bg-chip/60')}>
                        <span className={cx('mt-2 size-1.5 shrink-0 rounded-full', n.dot)} />
                        <div className="min-w-0 flex-1 pr-14">
                          <p className="text-[14px] font-semibold">{n.title}</p>
                          <p className="text-[14px] leading-[22px] text-muted-foreground">{n.body}</p>
                          <p className="mt-2 text-[12px] text-muted-foreground">{n.time}</p>
                        </div>
                        <div className="absolute right-4 top-3 flex gap-1">
                          {n.unread && (
                            <button aria-label="Mark as read" onClick={() => setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, unread: false } : x)))} className="grid size-6 place-items-center rounded-full bg-black/20 text-muted-foreground hover:text-foreground">
                              <Check size={12} />
                            </button>
                          )}
                          <button aria-label="Dismiss" onClick={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))} className="grid size-6 place-items-center rounded-full bg-black/20 text-muted-foreground hover:text-foreground">
                            <X size={12} />
                          </button>
                        </div>
                      </li>
                    ))}
                    {notes.length === 0 && <li className="px-4 py-10 text-center text-[13px] text-muted-foreground">You're all caught up</li>}
                  </ul>
                  <button onClick={() => (setMenu(null), go('settings-app'))} className="flex w-full items-center justify-center gap-2 border-t border-edge bg-black/10 py-3.5 text-[14px] font-semibold transition-colors hover:bg-chip">
                    <Settings size={16} /> Notification Settings
                  </button>
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => toggle('user')} aria-expanded={menu === 'user'} aria-haspopup="menu" className={cx('flex h-8 items-center gap-2 rounded-full pl-1 pr-2', chip)}>
                <span className="grid size-6 place-items-center rounded-full border-2 border-edge bg-[#3c3d41] text-[10px] text-white" aria-hidden>{ini}</span>
                <span className="hidden max-w-[160px] truncate text-[14px] font-semibold sm:inline">{account.firstName}</span>
                <span className="sr-only">Account menu for {name}</span>
                <ChevronDown size={16} className={cx('text-muted-foreground transition-transform duration-200', menu === 'user' && 'rotate-180')} />
              </button>
              {menu === 'user' && (
                <div onKeyDown={menuKeys} className={cx(pop, 'w-64')}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#3c3d41] text-[13px] font-semibold text-white" aria-hidden>{ini}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold">{name}</p>
                      <p className="truncate text-[14px] text-muted-foreground">{account.email}</p>
                      <p className="mt-1 inline-flex rounded-full border border-edge px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{account.role}</p>
                    </div>
                  </div>
                  <div className="py-1">
                    {(
                      [
                        ['Profile', UserRound, 'settings-profile'],
                        ['Settings', Settings, 'settings-app'],
                      ] as const
                    ).map(([l, Icon, r]) => (
                      <button key={l} onClick={() => (go(r), setMenu(null))} className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] transition-colors hover:bg-chip">
                        <Icon size={14} /> {l}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-edge py-1">
                    <button onClick={() => (setMenu(null), onLogout())} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] text-[#f87171] transition-colors hover:bg-chip">
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-full h-3 bg-linear-to-b from-bg via-bg/80 to-transparent" />
      </div>
      <CommandPalette role={account.role} open={palette} onClose={() => setPalette(false)} go={go} />
    </>
  )
}

// Lets pages (e.g. the Create User drawer) temporarily collapse the sidebar to its icon rail.
export const ShellContext = createContext<{ setCollapsed: (v: boolean) => void; collapsed: boolean }>({ setCollapsed: () => {}, collapsed: false })
export const useShell = () => useContext(ShellContext)

export default function Shell({ account, route, go, dark, setDark, onLogout, children }: { account: Account; route: Route; go: (r: Route) => void; dark: boolean; setDark: (v: boolean) => void; onLogout: () => void; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  // Event Manager modules map their own class vocabulary onto the shared admin tokens;
  // the class sits on the document so their dialogs and menus pick it up too.
  const studio = account.role === 'Event Manager'
  useEffect(() => {
    if (!studio) return
    document.documentElement.classList.add('em-theme')
    return () => document.documentElement.classList.remove('em-theme')
  }, [studio])
  return (
    <ShellContext.Provider value={{ collapsed, setCollapsed }}>
    <NavigationContext.Provider value={{ route, go }}>
    <div className="min-h-screen bg-bg text-foreground">
      <TopBar
        account={account}
        dark={dark}
        setDark={setDark}
        go={go}
        onLogout={onLogout}
        onMenu={() => (window.innerWidth >= 1024 ? setCollapsed((c) => !c) : setMobileOpen((o) => !o))}
      />
      <div className="flex pb-[15px] pl-[14px] pr-4 pt-[11px]">
        <div className="lg:mr-[16px]">
          <Sidebar
            role={account.role}
            collapsed={collapsed}
            onExpand={() => setCollapsed(false)}
            route={route}
            onLogout={onLogout}
            go={(r) => {
              go(r)
              setMobileOpen(false)
            }}
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
          />
        </div>
        <div className="flex min-h-[calc(100vh-100px)] min-w-0 flex-1 flex-col">
          <main key={route} className="w-full flex-1 animate-fade-up pt-[14px]">
            {children}
          </main>
          <footer className="mt-4 flex items-center justify-between rounded-xl border border-edge bg-nav px-5 py-3 text-[12px] text-muted-foreground">
            <span>
              © 2026 <span className="mx-3">Lumière Dashboard</span>•<span className="ml-3">v1.0.0</span>
            </span>
            <span>
              by <span className="font-bold text-foreground">Lumière</span>
            </span>
          </footer>
        </div>
      </div>
    </div>
    </NavigationContext.Provider>
    </ShellContext.Provider>
  )
}
