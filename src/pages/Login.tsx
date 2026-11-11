import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, LogIn, Check } from 'lucide-react'
import AuthShell, { AuthButton, Notice } from '../components/AuthShell'
import { signIn } from '../auth/session'
import { emailPattern, type Account } from '../auth/store'
import { cx } from '../components/ui'
import { showSignInBanner } from '../components/SignInBanner'

function DoorIcon() {
  return (
    <svg viewBox="0 0 64 64" className="size-[60px]" aria-hidden>
      <defs>
        <linearGradient id="door" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#656565" />
          <stop offset="1" stopColor="#383838" />
        </linearGradient>
        <linearGradient id="door-frame" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#777777" />
          <stop offset="0.15" stopColor="#303030" />
          <stop offset="1" stopColor="#252525" />
        </linearGradient>
      </defs>
      <rect x="13" y="7" width="28" height="48" rx="5" fill="#1b1b1b" stroke="url(#door-frame)" strokeWidth="3" />
      <path d="M15 9 36 10" fill="none" stroke="#989898" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 13c0-2.6 1.8-4.1 4.1-3.2l10.2 4.4c1.6.7 2.7 2.3 2.7 4.1v38.3c0 2.5-1.7 3.8-3.8 2.8l-10-4.8C10.2 53.7 9 52 9 50Z" fill="url(#door)" />
      <path d="M12 11 22 15" stroke="#909090" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M60 31c0-1.6-1-2.6-2.6-2.6H46v-4.3c0-2.6-1.7-3.6-3.9-2.4-4.1 2.2-8.1 5.7-11.6 9.3-1.5 1.6-1.5 3.4 0 5 3.5 3.6 7.5 7.1 11.6 9.3 2.2 1.2 3.9.2 3.9-2.4v-4.3h11.4c1.6 0 2.6-1 2.6-2.6Z" fill="#eeeeee" />
    </svg>
  )
}

// Demo environment: checks synthetic credentials from the shared browser store (not production auth).
export default function Login({ onLogin, onForgot, dark, setDark, notice }: { onLogin: (account: Account) => void; onForgot: () => void; dark: boolean; setDark: (v: boolean) => void; notice?: string }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [error, setError] = useState('')
  const [info, setInfo] = useState(notice ?? '')
  const submit = async () => {
    if (busy) return
    const e: typeof errors = {}
    if (!email.trim()) e.email = 'Enter your email address.'
    else if (!emailPattern.test(email.trim())) e.email = 'Enter a valid email address.'
    if (!pw) e.password = 'Enter your password.'
    setErrors(e)
    setError('')
    if (e.email || e.password) return
    setBusy(true)
    setInfo('')
    const result = await signIn({ email, password: pw, remember })
    if (result.ok) {
      showSignInBanner()
      return onLogin(result.account)
    }
    setBusy(false)
    setPw('')
    setError(result.message)
  }
  const field = 'h-10 w-full rounded-md border border-transparent bg-field text-[14px] dark:border-line text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-muted focus-visible:ring-2 focus-visible:ring-fg/20 aria-[invalid=true]:border-red-400 disabled:opacity-70'
  return (
    <AuthShell dark={dark} setDark={setDark} icon={<DoorIcon />} loginSurfaces>
      <h2 className="text-center text-2xl font-bold text-foreground">Welcome Back</h2>
      <p className="auth-subtitle mb-6 mt-2 text-center text-[14px] text-muted-foreground">Please sign in to continue</p>
      <form
        noValidate
        aria-busy={busy}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {info && <Notice>{info}</Notice>}
        <div>
          <label htmlFor="login-email" className="mb-2 block text-[14px] font-medium text-foreground">Email Address</label>
          <span className="relative block">
            <Mail size={20} strokeWidth={1.6} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input id="login-email" type="email" autoComplete="username" value={email} disabled={busy} onChange={(e) => (setEmail(e.target.value), setErrors((x) => ({ ...x, email: undefined })))} placeholder="Enter your email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'login-email-error' : undefined} className={cx(field, 'pl-10 pr-3')} />
          </span>
          {errors.email && <p id="login-email-error" className="mt-1.5 text-[12px] text-red-400">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="login-password" className="mb-2 block text-[14px] font-medium text-foreground">Password</label>
          <span className="relative block">
            <Lock size={20} strokeWidth={1.6} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" spellCheck={false} value={pw} disabled={busy} onChange={(e) => (setPw(e.target.value), setErrors((x) => ({ ...x, password: undefined })))} placeholder="Enter your password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'login-password-error' : undefined} className={cx(field, 'pl-10 pr-11')} />
            <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-fg">
              {show ? <EyeOff size={20} strokeWidth={1.6} /> : <Eye size={20} strokeWidth={1.6} />}
            </button>
          </span>
          {errors.password && <p id="login-password-error" className="mt-1.5 text-[12px] text-red-400">{errors.password}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="auth-secondary-text flex cursor-pointer items-center gap-2 text-[14px] text-muted-foreground">
            <input type="checkbox" checked={remember} disabled={busy} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
            <span aria-hidden className={cx('grid size-4 place-items-center rounded-sm border border-line transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg', remember ? 'bg-invert text-invert-fg' : 'bg-chip')}>
              {remember && <Check size={11} strokeWidth={3} />}
            </span>
            Remember me
          </label>
          <button type="button" onClick={onForgot} className="cursor-pointer rounded text-[14px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">Forgot your password?</button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <AuthButton type="submit" busy={busy} busyLabel="Signing in…" disabled={!emailPattern.test(email.trim()) || !pw} className="auth-submit font-medium disabled:cursor-default! disabled:bg-fg/50 disabled:hover:opacity-100">
          <LogIn size={20} strokeWidth={1.6} aria-hidden /> Sign In
        </AuthButton>
      </form>
      <div className="relative my-6 flex items-center justify-center text-xs text-muted-foreground">
        <span aria-hidden className="auth-divider absolute inset-x-0 border-t border-fg/30" />
        <span className="auth-divider-label auth-secondary-text relative rounded-full bg-card px-3 dark:bg-elev">Or continue with</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
      <AuthButton
        className="auth-social"
        variant="secondary"
        disabled={busy}
        onClick={() => setInfo('Google sign-in is not connected in this prototype. Please use your demo email and password.')}
      >
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden>
          <path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22ZM6.41 13.93a6 6 0 0 1 0-3.86V7.48H3.07a10 10 0 0 0 0 9.04l3.34-2.59ZM12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.59C7.2 7.71 9.4 5.95 12 5.95Z" />
        </svg>
        Google
      </AuthButton>
      <AuthButton
        className="auth-social"
        variant="secondary"
        disabled={busy}
        onClick={() => setInfo('Microsoft sign-in is not connected in this prototype. Please use your demo email and password.')}
      >
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden>
          <path d="M2 2h9v9H2zm11 0h9v9h-9zM2 13h9v9H2zm11 0h9v9h-9z" />
        </svg>
        Microsoft
      </AuthButton>
      </div>
    </AuthShell>
  )
}
