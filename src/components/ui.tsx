import type React from 'react'
import { useContext } from 'react'
import { breadcrumbRoutes, NavigationContext } from './NavigationContext'
import type { ReactNode, InputHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { ChevronRight, Home, GripHorizontal, TrendingUp, ArrowRight, type LucideIcon } from 'lucide-react'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('dashboard-card rounded-xl border border-edge bg-card text-foreground bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_60%)]', className)}>{children}</div>
}

export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  onHome,
  large,
}: {
  large?: boolean
  crumbs: string[]
  title: string
  subtitle: string
  actions?: ReactNode
  onHome?: () => void
}) {
  const navigation = useContext(NavigationContext)
  const home = onHome ?? (() => navigation?.go('overview'))
  return (
    <div className="mb-7">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
        <button type="button" onClick={home} className="transition-colors hover:text-foreground" aria-label="Home">
          <Home size={16} />
        </button>
        {crumbs.map((c, i) => (
          <span key={c + i} className="flex items-center gap-2">
            <ChevronRight size={16} aria-hidden="true" />
            <button
              type="button"
              aria-current={i === crumbs.length - 1 ? 'page' : undefined}
              onClick={() => {
                if (i === crumbs.length - 1 && c !== 'Dashboard') return
                if (c === 'Dashboard') home()
                else {
                  const target = breadcrumbRoutes[c]
                  if (target) navigation?.go(target)
                }
              }}
              className={cx('rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground', i === crumbs.length - 1 && 'font-semibold text-foreground')}
            >{c}</button>
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={cx('font-bold tracking-tight text-foreground', large ? 'text-[30px] leading-9' : 'text-2xl')}>{title}</h1>
          <p className="mt-2 text-[16px] text-muted-foreground">{subtitle}</p>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  )
}

export function Button({
  variant = 'solid',
  icon: Icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'ghost' | 'outline'; icon?: LucideIcon }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors disabled:opacity-50',
        variant === 'solid' && 'bg-invert text-invert-fg hover:opacity-90',
        variant === 'ghost' && 'text-foreground hover:bg-elev',
        variant === 'outline' && 'border border-line bg-card text-foreground hover:bg-elev',
        className,
      )}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cx('grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-elev hover:text-foreground', className)}
    >
      <Icon size={16} />
    </button>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[14px] font-semibold text-foreground">{label}</span>
      {children}
    </label>
  )
}

export function Input({ icon: Icon, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon }) {
  return (
    <div className="relative">
      {Icon && <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
      <input
        {...rest}
        className={cx(
          'h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.08] px-3 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-fg/25 focus:ring-2 focus:ring-fg/10 disabled:cursor-default disabled:text-muted-foreground',
          Icon && 'pl-10',
          className,
        )}
      />
    </div>
  )
}

export function Badge({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info'; children: ReactNode }) {
  const tones = {
    success: 'bg-[#16a34a]/15 text-[#4ade80] ring-1 ring-inset ring-[#4ade80]/20',
    warning: 'bg-[#ca8a04]/15 text-[#facc15] ring-1 ring-inset ring-[#facc15]/20',
    danger: 'bg-danger/15 text-danger',
    info: 'bg-primary/15 text-primary',
    neutral: 'bg-elev text-muted-foreground',
  }
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold leading-4', tones[tone])}>{children}</span>
}

export function StatCard({
  icon: Icon,
  title,
  value,
  trend,
  trendTone = 'up',
  watermark = true,
  handle,
  showHandle = true,
  aligned = false,
  description,
  handleContent,
  trendContent,
}: {
  handle?: React.HTMLAttributes<HTMLSpanElement>
  /** Hide the decorative reorder grip, e.g. for cards that are navigation shortcuts. */
  showHandle?: boolean
  /** Stretch navigation summary cards while keeping their values aligned. */
  aligned?: boolean
  description?: string
  handleContent?: ReactNode
  trendContent?: ReactNode
  icon: LucideIcon
  title: string
  value: string | number
  trend?: string
  trendTone?: 'up' | 'flat' | 'down'
  watermark?: boolean
}) {
  return (
    <Card className={cx('stat-card relative overflow-hidden p-4', aligned && 'flex h-full flex-col')}>
      <div className={cx('flex gap-3', aligned ? 'flex-1 items-start' : 'items-center')}>
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-fg/20 text-foreground">
          <Icon size={20} strokeWidth={1.6} aria-hidden />
        </span>
        <span className={cx('flex-1 text-[14px] font-semibold text-muted-foreground', aligned && 'min-w-0 self-center break-words')}>{title}</span>
        {handleContent}
        {showHandle && !handleContent && <span {...handle} className={cx('grid size-6 place-items-center rounded text-muted-foreground', handle && 'cursor-grab touch-none hover:bg-chip hover:text-foreground active:cursor-grabbing')} aria-label="Drag to reorder">
          <GripHorizontal size={14} />
        </span>}
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-[18px] font-bold leading-7 tabular-nums text-foreground">{value}</span>
        {trendContent}
        {trend && (
          <span className={cx('inline-flex items-center gap-1 text-[12px] font-normal leading-4', trendTone === 'up' ? 'text-[#4ade80]' : trendTone === 'down' ? 'text-[#ef4444]' : 'text-[#b3b4b5]')}>
            {trendTone === 'up' ? <TrendingUp size={12} strokeWidth={1.5} /> : <ArrowRight size={12} strokeWidth={1.5} />}
            {trend}
          </span>
        )}
      </div>
      {description !== undefined && <div className="relative mt-2 text-xs font-normal text-muted-foreground">{description || '\u00a0'}</div>}
      {watermark && !trend && <Icon size={44} strokeWidth={1.25} className="pointer-events-none absolute bottom-1 right-3 text-fg/[0.06]" />}
    </Card>
  )
}

// Illustrated portrait avatar (grayscale suit for men, soft pink for women), matching the reference table.
export function Avatar({ name, gender, size = 36 }: { name: string; gender?: 'm' | 'f'; size?: number }) {
  const f = gender === 'f'
  return (
    <span role="img" aria-label={name} style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-full ring-2 ring-white/10">
      <svg viewBox="0 0 40 40" className="size-full">
        <rect width="40" height="40" fill={f ? '#efe1e4' : '#e6e6e6'} />
        {f ? (
          <>
            <path d="M11 22c-1-9 3-14 9-14s10 5 9 14c0 4-2 7-2 7H13s-2-3-2-7Z" fill="#b98f98" />
            <path d="M8 40c1-7 6-10 12-10s11 3 12 10Z" fill="#d7b3bb" />
            <ellipse cx="20" cy="19" rx="6" ry="7" fill="#f6dfd9" />
            <path d="M13 17c1-5 4-7 7-7s6 2 7 7c-3-2-6-3-7-5-1 2-4 4-7 5Z" fill="#a37a84" />
          </>
        ) : (
          <>
            <path d="M7 40c1-7 6-10 13-10s12 3 13 10Z" fill="#3a3a3c" />
            <path d="M17 30h6l-3 6Z" fill="#fff" />
            <path d="M19.2 31.5h1.6l.6 6h-2.8Z" fill="#2a2a2c" />
            <rect x="17.5" y="25" width="5" height="6" rx="2" fill="#d9c7bd" />
            <ellipse cx="20" cy="19" rx="6" ry="7" fill="#efe0d7" />
            <path d="M13.5 18c-.5-6 2.5-9 6.5-9s7 3 6.5 9c-1-3-2-4-3-4.5-2 1.5-6 1.5-8 0-1 .5-1.5 2-2 4.5Z" fill="#2b2b2d" />
          </>
        )}
      </svg>
    </span>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  keyboardNavigation = false,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[]
  value: T
  onChange: (v: T) => void
  keyboardNavigation?: boolean
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="relative flex rounded-xl bg-fg/[0.04] p-2">
      {/* Active pill slides between options */}
      <span
        aria-hidden
        className="absolute bottom-2 top-2 rounded-md bg-fg/20 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: `calc((100% - 16px) / ${options.length})`, left: 8, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o, index) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={keyboardNavigation ? value === o.value : undefined}
          onKeyDown={keyboardNavigation ? (event) => {
            const next = event.key === 'ArrowRight' ? (index + 1) % options.length
              : event.key === 'ArrowLeft' ? (index - 1 + options.length) % options.length
              : event.key === 'Home' ? 0
              : event.key === 'End' ? options.length - 1 : -1
            if (next < 0) return
            event.preventDefault()
            onChange(options[next].value)
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
          } : undefined}
          onClick={() => onChange(o.value)}
          className={cx(
            'relative z-[1] flex flex-1 items-center justify-center gap-2 rounded-md py-1 text-[14px] font-semibold leading-5 transition-colors duration-200',
            value === o.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.icon && <o.icon size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-invert' : 'bg-elev ring-1 ring-line')}
    >
      <span className={cx('absolute top-0.5 size-4 rounded-full transition-all', checked ? 'left-[18px] bg-invert-fg' : 'left-0.5 bg-muted')} />
    </button>
  )
}
