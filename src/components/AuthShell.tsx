import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Sun, Moon, Eye, EyeOff, Lock, Loader2, CircleCheck, Circle, CircleAlert, Info, type LucideIcon } from 'lucide-react'
import { Logo } from './Shell'
import { cx } from './ui'
import { passwordChecks, passwordStrength } from '../auth/passwordPolicy'

// Shared frame for Login and every public authentication step.
export default function AuthShell({ dark, setDark, icon, children, loginSurfaces = false }: { dark: boolean; setDark: (v: boolean) => void; icon: ReactNode; children: ReactNode; loginSurfaces?: boolean }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-bg text-foreground transition-colors">
      <div className="pointer-events-none fixed inset-0 bg-[length:40px_40px] bg-[linear-gradient(to_right,var(--line)_1px,transparent_1px),linear-gradient(var(--line)_1px,transparent_1px)] opacity-80" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(transparent_0%,var(--bg)_80%)]" />

      <header className="fixed inset-x-0 top-0 z-50 flex justify-center">
        <div className={cx('flex w-full max-w-[1400px] items-center justify-between rounded-b-xl border-b border-edge px-4 py-2 sm:px-8', loginSurfaces ? 'auth-topbar not-dark:bg-card' : 'bg-card dark:border-transparent dark:bg-chrome')}>
          <div className="flex h-12 items-center"><Logo /></div>
          <button type="button" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark(!dark)} className="grid size-7 place-items-center rounded-full bg-chip text-foreground transition-colors hover:bg-elev dark:bg-fg/15 dark:hover:bg-fg/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-8 pt-28">
        <div className={cx('relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-card shadow-xl animate-fade-up', loginSurfaces ? 'auth-card' : 'dark:border-white/30 dark:bg-elev')}>
          {!loginSurfaces && <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-1/3 bg-[linear-gradient(rgba(255,255,255,0.3),transparent)] opacity-20 dark:block" />}
          <div className="relative">
            <div className="flex justify-center px-6 pb-4 pt-8">{icon}</div>
            <div className="px-6 pb-6">{children}</div>
          </div>
        </div>
      </main>

      <footer className={cx('relative z-10 mx-auto w-full max-w-[1400px] rounded-t-xl border-t border-edge py-[7px] text-center text-[12px] text-muted-foreground', loginSurfaces ? 'auth-footer not-dark:bg-card' : 'bg-card')}>
        © 2026 <span className="underline">Lumière</span>. All rights reserved.
      </footer>
    </div>
  )
}

export function AuthIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-[60px] place-items-center rounded-2xl border border-line bg-fg/[0.08] text-foreground shadow-inner">
      <Icon size={28} strokeWidth={1.6} aria-hidden />
    </span>
  )
}

// Moves focus to the step heading whenever a new step mounts.
export function AuthHeading({ title, subtitle, focus = true }: { title: string; subtitle?: ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  return (
    <div className="mb-6 text-center">
      <h2 ref={ref} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">{title}</h2>
      {subtitle && <p className="mt-2 text-[14px] text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

export const authFieldCls =
  'h-10 w-full rounded-md border border-transparent bg-field text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-muted focus-visible:ring-2 focus-visible:ring-fg/20 disabled:cursor-default disabled:opacity-70 dark:border-line aria-[invalid=true]:border-red-400'

export function AuthField({ label, icon: Icon, error, hint, id: givenId, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: LucideIcon; error?: string; hint?: ReactNode }) {
  const auto = useId()
  const id = givenId ?? auto
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] font-medium text-foreground">{label}</label>
      <span className="relative block">
        {Icon && <Icon size={20} strokeWidth={1.6} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
        <input id={id} aria-invalid={!!error} aria-describedby={describedBy} className={cx(authFieldCls, Icon ? 'pl-10 pr-3' : 'px-3', className)} {...rest} />
      </span>
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1.5 text-[12px] text-red-400">{error}</p>}
    </div>
  )
}

export function PasswordInput({ label, value, onChange, error, describedBy, disabled, autoFocus, autoComplete = 'new-password' }: { label: string; value: string; onChange: (v: string) => void; error?: string; describedBy?: string; disabled?: boolean; autoFocus?: boolean; autoComplete?: string }) {
  const id = useId()
  const [show, setShow] = useState(false)
  const ids = [describedBy, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] font-medium text-foreground">{label}</label>
      <span className="relative block">
        <Lock size={20} strokeWidth={1.6} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={ids}
          className={cx(authFieldCls, 'pl-10 pr-11')}
        />
        <button type="button" aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={show} onClick={() => setShow(!show)} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-fg">
          {show ? <EyeOff size={18} strokeWidth={1.6} /> : <Eye size={18} strokeWidth={1.6} />}
        </button>
      </span>
      {error && <p id={`${id}-error`} className="mt-1.5 text-[12px] text-red-400">{error}</p>}
    </div>
  )
}

export function PasswordRequirements({ id, password, confirm }: { id: string; password: string; confirm: string }) {
  const strength = passwordStrength(password)
  return (
    <div id={id} className="rounded-xl border border-edge bg-fg/[0.04] p-3">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold text-foreground">Password requirements</span>
        {strength.label && <span className="text-muted-foreground">Strength: {strength.label}</span>}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1" aria-hidden>
        {[1, 2, 3].map((n) => <span key={n} className={cx('h-1 rounded-full transition-colors', strength.level >= n ? (strength.level === 1 ? 'bg-red-400' : 'bg-foreground') : 'bg-fg/15')} />)}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-[12px]">
        {passwordChecks(password, confirm).map((c) => (
          <li key={c.id} className={cx('flex items-center gap-2', c.met ? 'text-foreground' : 'text-muted-foreground')}>
            {c.met ? <CircleCheck size={14} aria-hidden /> : <Circle size={14} aria-hidden />}
            {c.label}
            <span className="sr-only">{c.met ? '(met)' : '(not met)'}</span>
          </li>
        ))}
        <li className="text-muted-foreground">Spaces, paste, and password managers are welcome.</li>
      </ul>
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : tone === 'success' ? CircleCheck : Info
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-2.5 rounded-xl border p-3 text-[13px] leading-5', tone === 'error' ? 'border-red-400/30 bg-red-400/10 text-foreground' : 'border-edge bg-fg/[0.05] text-foreground')}>
      <Icon size={16} aria-hidden className={cx('mt-0.5 shrink-0', tone === 'error' ? 'text-red-400' : 'text-muted-foreground')} />
      <div>{children}</div>
    </div>
  )
}

export function AuthButton({ busy, busyLabel, children, variant = 'primary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; busyLabel?: string; variant?: 'primary' | 'secondary' | 'link' }) {
  return (
    <button
      type={rest.type ?? 'button'}
      aria-busy={busy || undefined}
      {...rest}
      disabled={busy || rest.disabled}
      className={cx(
        'flex items-center justify-center gap-2 text-[14px] font-semibold transition-[color,background-color,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:cursor-default',
        variant === 'primary' && 'h-10 w-full rounded-full bg-invert px-4 text-invert-fg hover:opacity-90 disabled:bg-fg/40 disabled:opacity-100',
        variant === 'secondary' && 'h-10 w-full rounded-full border border-fg/30 px-4 text-foreground hover:bg-fg/5 disabled:opacity-50',
        variant === 'link' && 'mx-auto rounded text-foreground hover:underline disabled:text-muted-foreground disabled:no-underline',
        className,
      )}
    >
      {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  )
}

// Re-renders on an interval so countdowns derived from absolute timestamps stay accurate.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    const wake = () => setNow(Date.now())
    document.addEventListener('visibilitychange', wake)
    return () => (clearInterval(id), document.removeEventListener('visibilitychange', wake))
  }, [ms])
  return now
}
