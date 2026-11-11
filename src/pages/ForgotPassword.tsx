import { useEffect, useRef, useState } from 'react'
import { Mail, KeyRound, ShieldCheck, CircleCheck, LockKeyhole } from 'lucide-react'
import AuthShell, { AuthButton, AuthField, AuthHeading, AuthIcon, Notice, PasswordInput, PasswordRequirements, useNow } from '../components/AuthShell'
import { cx } from '../components/ui'
import { authService } from '../auth/mockAuthService'
import { authMessage, formatWait } from '../auth/messages'
import { passwordError } from '../auth/passwordPolicy'
import { isAuthError, type RecoveryAuthorization, type RecoveryChallenge } from '../auth/types'

type Step = 'identify' | 'verify' | 'reset' | 'done'
const GENERIC = 'If an eligible account exists, a verification code has been sent to its registered recovery channel.'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Guard = () => () => boolean

export default function ForgotPassword({ dark, setDark, onLogin }: { dark: boolean; setDark: (v: boolean) => void; onLogin: () => void }) {
  const [step, setStep] = useState<Step>('identify')
  const [identifier, setIdentifier] = useState('')
  const [challenge, setChallenge] = useState<RecoveryChallenge | null>(null)
  const [auth, setAuth] = useState<RecoveryAuthorization | null>(null)
  const [restartNote, setRestartNote] = useState('')
  // Incremented whenever the flow resets so late responses from an older attempt are ignored.
  const generation = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => void (alive.current = false)
  }, [])

  const current: Guard = () => {
    const g = generation.current
    return () => alive.current && g === generation.current
  }
  const restart = (note = '') => {
    generation.current++
    setChallenge(null)
    setAuth(null)
    setRestartNote(note)
    setStep('identify')
  }
  const leave = () => {
    generation.current++
    setChallenge(null)
    setAuth(null)
    onLogin()
  }

  const icon = { identify: KeyRound, verify: ShieldCheck, reset: LockKeyhole, done: CircleCheck }[step]
  return (
    <AuthShell dark={dark} setDark={setDark} icon={<AuthIcon icon={icon} />}>
      <div key={step} className="animate-fade-up">
        {step === 'identify' && (
          <IdentifyStep identifier={identifier} setIdentifier={setIdentifier} note={restartNote} current={current} onIssued={(c) => (setChallenge(c), setRestartNote(''), setStep('verify'))} onBack={leave} />
        )}
        {step === 'verify' && challenge && (
          <VerifyStep identifier={identifier.trim()} challenge={challenge} setChallenge={setChallenge} current={current} onVerified={(a) => (setChallenge(null), setAuth(a), setStep('reset'))} onChange={() => restart()} onRestart={restart} onBack={leave} />
        )}
        {step === 'reset' && auth && <ResetStep auth={auth} current={current} onDone={() => (setAuth(null), setStep('done'))} onRestart={restart} onBack={leave} />}
        {step === 'done' && (
          <>
            <AuthHeading title="Password reset successfully" subtitle="Sign in using your new password." />
            <AuthButton onClick={leave}>Back to Login</AuthButton>
          </>
        )}
      </div>
    </AuthShell>
  )
}

function IdentifyStep({ identifier, setIdentifier, note, current, onIssued, onBack }: { identifier: string; setIdentifier: (v: string) => void; note: string; current: Guard; onIssued: (c: RecoveryChallenge) => void; onBack: () => void }) {
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const now = useNow()
  const limited = retryAt > now

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || limited) return
    const value = identifier.trim()
    if (!value) return setError('Enter your email address.')
    if (!emailPattern.test(value)) return setError('Enter a valid email address.')
    setError('')
    setFormError('')
    setBusy(true)
    const ok = current()
    try {
      const c = await authService.requestPasswordReset({ identifier: value })
      if (ok()) onIssued(c)
    } catch (err) {
      if (!ok()) return
      if (isAuthError(err) && err.code === 'RATE_LIMITED' && err.retryAt) setRetryAt(err.retryAt)
      setFormError(authMessage(err))
    } finally {
      if (ok()) setBusy(false)
    }
  }

  return (
    <>
      <AuthHeading title="Forgot your password?" subtitle="Enter your registered email address to request a verification code." />
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {note && <Notice tone="error">{note}</Notice>}
        <AuthField label="Email Address" icon={Mail} type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" value={identifier} onChange={(e) => (setIdentifier(e.target.value), setError(''))} error={error} disabled={busy} />
        {formError && <Notice tone="error">{formError}{limited && <> Try again in <span className="tabular-nums">{formatWait(retryAt - now)}</span>.</>}</Notice>}
        <AuthButton type="submit" busy={busy} busyLabel="Sending code…" disabled={limited}>Send Verification Code</AuthButton>
        <AuthButton variant="link" onClick={onBack}>Back to Login</AuthButton>
      </form>
    </>
  )
}

function OtpInput({ value, onChange, error, disabled }: { value: string; onChange: (v: string) => void; error?: string; disabled?: boolean }) {
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const track = () => setCaret(Math.min(5, ref.current?.selectionStart ?? value.length))
  return (
    <div>
      <label htmlFor="otp" className="mb-2 block text-[14px] font-medium text-foreground">Verification code</label>
      <div className="relative">
        <div aria-hidden className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={cx(
                'grid h-12 place-items-center rounded-lg border bg-field text-xl font-semibold tabular-nums text-foreground transition-[border-color,box-shadow]',
                error ? 'border-red-400' : 'border-transparent dark:border-line',
                focused && i === caret && 'border-foreground ring-2 ring-fg/20',
              )}
            >
              {value[i] ?? ''}
            </span>
          ))}
        </div>
        {/* One real input drives all six slots, so paste, autofill, arrow keys, and screen readers work natively. */}
        <input
          ref={ref}
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={value}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? 'otp-hint otp-error' : 'otp-hint'}
          onChange={(e) => (onChange(e.target.value.replace(/\D/g, '').slice(0, 6)), requestAnimationFrame(track))}
          onPaste={(e) => {
            const digits = e.clipboardData.getData('text').replace(/\D/g, '')
            if (digits.length >= 6) (e.preventDefault(), onChange(digits.slice(0, 6)), requestAnimationFrame(track))
          }}
          onSelect={track}
          onKeyUp={track}
          onFocus={() => (setFocused(true), track())}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-default"
        />
      </div>
      <p id="otp-hint" className="sr-only">Enter 6 digits. You can paste the full code.</p>
      {error && <p id="otp-error" className="mt-1.5 text-[12px] text-red-400">{error}</p>}
    </div>
  )
}

function VerifyStep({ identifier, challenge, setChallenge, current, onVerified, onChange, onRestart, onBack }: { identifier: string; challenge: RecoveryChallenge; setChallenge: (c: RecoveryChallenge) => void; current: Guard; onVerified: (a: RecoveryAuthorization) => void; onChange: () => void; onRestart: (note: string) => void; onBack: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const [status, setStatus] = useState<{ tone: 'info' | 'error' | 'success'; text: string }>({ tone: 'info', text: GENERIC })
  const [busy, setBusy] = useState<null | 'verify' | 'resend'>(null)
  const [resendBlockedUntil, setResendBlockedUntil] = useState(0)
  const now = useNow()
  const expired = now >= challenge.expiresAt
  const resendAt = Math.max(challenge.resendAvailableAt, resendBlockedUntil)
  const canResend = now >= resendAt && !busy

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || locked) return
    if (code.length !== 6) return setError('Enter all 6 digits.')
    setError('')
    setBusy('verify')
    const ok = current()
    try {
      const a = await authService.verifyResetOtp({ challengeId: challenge.challengeId, otp: code })
      if (ok()) (setCode(''), onVerified(a))
    } catch (err) {
      if (!ok()) return
      const c = isAuthError(err) ? err.code : 'NETWORK_ERROR'
      if (c === 'TOO_MANY_ATTEMPTS') setLocked(true)
      if (c === 'NETWORK_ERROR') setStatus({ tone: 'error', text: authMessage(err) })
      else setError(authMessage(err))
    } finally {
      if (ok()) setBusy(null)
    }
  }

  const resend = async () => {
    if (!canResend) return
    setBusy('resend')
    const ok = current()
    try {
      const next = await authService.resendResetOtp({ challengeId: challenge.challengeId })
      if (!ok()) return
      setChallenge(next)
      setCode('')
      setError('')
      setLocked(false)
      setStatus({ tone: 'success', text: 'If an eligible account exists, a new verification code has been sent.' })
    } catch (err) {
      if (!ok()) return
      if (isAuthError(err) && err.code === 'RECOVERY_EXPIRED') return onRestart('Your recovery session ended. Request a new code to continue.')
      if (isAuthError(err) && err.code === 'RATE_LIMITED' && err.retryAt) setResendBlockedUntil(err.retryAt)
      setStatus({ tone: 'error', text: authMessage(err) })
    } finally {
      if (ok()) setBusy(null)
    }
  }

  return (
    <>
      <AuthHeading title="Verify your code" subtitle="Enter the 6-digit code sent to your registered recovery channel." />
      <form noValidate onSubmit={verify} className="flex flex-col gap-4">
        <p className="-mt-2 break-all text-center text-[13px] text-muted-foreground">
          Requested for <span className="font-semibold text-foreground">{identifier}</span>
        </p>
        <div aria-live="polite"><Notice tone={status.tone}>{status.text}</Notice></div>
        <OtpInput value={code} onChange={(v) => (setCode(v), setError(''))} error={error || (expired && !locked ? 'This code has expired. Request a new code.' : '')} disabled={busy === 'verify' || locked} />
        <p className="-mt-1 text-[12px] tabular-nums text-muted-foreground">{expired ? 'Code expired' : `Code expires in ${formatWait(challenge.expiresAt - now)}`}</p>
        <AuthButton type="submit" busy={busy === 'verify'} busyLabel="Verifying…" disabled={locked || expired || code.length !== 6}>Verify Code</AuthButton>
        <AuthButton variant="secondary" onClick={resend} busy={busy === 'resend'} busyLabel="Resending…" disabled={!canResend}>
          {now < resendAt ? <>Resend Code in <span className="tabular-nums">{formatWait(resendAt - now)}</span></> : 'Resend Code'}
        </AuthButton>
        <div className="flex items-center justify-center gap-4 text-[14px]">
          <AuthButton variant="link" className="mx-0" onClick={() => (setCode(''), onChange())}>Change email</AuthButton>
          <span aria-hidden className="h-4 w-px bg-fg/20" />
          <AuthButton variant="link" className="mx-0" onClick={onBack}>Back to Login</AuthButton>
        </div>
      </form>
    </>
  )
}

function ResetStep({ auth, current, onDone, onRestart, onBack }: { auth: RecoveryAuthorization; current: Guard; onDone: () => void; onRestart: (note: string) => void; onBack: () => void }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ pw?: string; confirm?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const next = { pw: passwordError(pw) || undefined, confirm: !confirm ? 'Confirm your new password.' : confirm !== pw ? 'Passwords do not match.' : undefined }
    setErrors(next)
    if (next.pw || next.confirm) return
    setBusy(true)
    const ok = current()
    try {
      await authService.resetPassword({ recoveryAuthorization: auth.token, password: pw })
      if (ok()) (setPw(''), setConfirm(''), onDone())
    } catch (err) {
      if (!ok()) return
      if (isAuthError(err) && err.code === 'RECOVERY_EXPIRED') return onRestart(authMessage(err))
      setErrors({ pw: isAuthError(err) ? err.fieldErrors?.password : undefined, form: authMessage(err) })
    } finally {
      if (ok()) setBusy(false)
    }
  }

  return (
    <>
      <AuthHeading title="Create a new password" subtitle="Choose a strong password for your account." />
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <PasswordInput label="New Password" value={pw} onChange={setPw} error={errors.pw} describedBy="reset-requirements" disabled={busy} />
        <PasswordInput label="Confirm New Password" value={confirm} onChange={setConfirm} error={errors.confirm} disabled={busy} />
        <PasswordRequirements id="reset-requirements" password={pw} confirm={confirm} />
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <AuthButton type="submit" busy={busy} busyLabel="Resetting password…">Reset Password</AuthButton>
        <AuthButton variant="link" onClick={onBack}>Back to Login</AuthButton>
      </form>
    </>
  )
}
