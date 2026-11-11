import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyRound, Mail, CircleCheck, CircleAlert, Loader2, RotateCw } from 'lucide-react'
import AuthShell, { AuthButton, AuthField, AuthHeading, AuthIcon, Notice, PasswordInput, PasswordRequirements } from '../components/AuthShell'
import { authService } from '../auth/mockAuthService'
import { authMessage } from '../auth/messages'
import { passwordError } from '../auth/passwordPolicy'
import { isAuthError, type InvitationValidationResult } from '../auth/types'

type Phase = 'loading' | 'ready' | 'success' | 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'INVITE_USED' | 'NETWORK_ERROR'

export default function SetPassword({ token, dark, setDark, onLogin }: { token: string | null; dark: boolean; setDark: (v: boolean) => void; onLogin: () => void }) {
  const [phase, setPhase] = useState<Phase>(token ? 'loading' : 'INVITE_INVALID')
  const [invite, setInvite] = useState<InvitationValidationResult | null>(null)
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ pw?: string; confirm?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => void (alive.current = false)
  }, [])

  const validate = useCallback(async () => {
    if (!token) return setPhase('INVITE_INVALID')
    setPhase('loading')
    try {
      const result = await authService.validateInvitation(token)
      if (!alive.current) return
      setInvite(result)
      setPhase('ready')
    } catch (e) {
      if (!alive.current) return
      const code = isAuthError(e) ? e.code : 'NETWORK_ERROR'
      setPhase(code === 'INVITE_EXPIRED' || code === 'INVITE_USED' || code === 'NETWORK_ERROR' ? code : 'INVITE_INVALID')
    }
  }, [token])
  useEffect(() => void validate(), [validate])

  const clear = () => (setPw(''), setConfirm(''))
  const goLogin = () => (clear(), onLogin())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !token) return
    const next = { pw: passwordError(pw) || undefined, confirm: !confirm ? 'Confirm your password.' : confirm !== pw ? 'Passwords do not match.' : undefined }
    setErrors(next)
    if (next.pw || next.confirm) return
    setBusy(true)
    try {
      await authService.completeInvitation({ token, password: pw })
      if (!alive.current) return
      clear()
      setPhase('success')
    } catch (err) {
      if (!alive.current) return
      if (isAuthError(err) && (err.code === 'INVITE_EXPIRED' || err.code === 'INVITE_USED' || err.code === 'INVITE_INVALID')) return (clear(), setPhase(err.code))
      setErrors({ pw: isAuthError(err) ? err.fieldErrors?.password : undefined, form: authMessage(err) })
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const shell = (icon: typeof KeyRound, body: React.ReactNode) => <AuthShell dark={dark} setDark={setDark} icon={<AuthIcon icon={icon} />}>{body}</AuthShell>

  if (phase === 'loading')
    return shell(KeyRound, (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-[14px] text-muted-foreground">
        <Loader2 size={22} className="animate-spin" aria-hidden />
        Checking your invitation…
      </div>
    ))

  if (phase === 'success')
    return shell(CircleCheck, (
      <>
        <AuthHeading title="Account activated" subtitle="Your account is ready. Sign in with your email and new password." />
        <AuthButton onClick={goLogin}>Go to Login</AuthButton>
      </>
    ))

  if (phase !== 'ready') {
    const copy = {
      INVITE_INVALID: { title: 'Invitation not valid', body: 'This link is invalid or was replaced by a newer invitation. Contact your System Admin to request a new invitation.' },
      INVITE_EXPIRED: { title: 'Invitation expired', body: 'Invitations are valid for 24 hours. Contact your System Admin to request a new invitation.' },
      INVITE_USED: { title: 'Account already activated', body: 'This invitation has already been used. Sign in with your email and password.' },
      NETWORK_ERROR: { title: "We couldn't check your invitation", body: 'This is usually temporary. Try again in a moment.' },
    }[phase]
    return shell(CircleAlert, (
      <>
        <AuthHeading title={copy.title} subtitle={copy.body} />
        <div className="flex flex-col gap-3">
          {phase === 'NETWORK_ERROR' && <AuthButton onClick={validate}><RotateCw size={16} aria-hidden /> Try Again</AuthButton>}
          <AuthButton variant={phase === 'NETWORK_ERROR' ? 'secondary' : 'primary'} onClick={goLogin}>{phase === 'INVITE_USED' ? 'Go to Login' : 'Back to Login'}</AuthButton>
        </div>
      </>
    ))
  }

  return shell(KeyRound, (
    <>
      <AuthHeading title="Set up your password" subtitle="Create a password to activate your account." />
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {invite && (
          <>
            <p className="-mt-2 text-center text-[14px] text-foreground">Welcome, <span className="font-semibold">{invite.firstName} {invite.lastName}</span></p>
            <AuthField label="Email Address" icon={Mail} type="email" value={invite.email} readOnly autoComplete="username" hint={`Role: ${invite.role}, assigned by your System Admin`} />
          </>
        )}
        <PasswordInput label="New Password" value={pw} onChange={setPw} error={errors.pw} describedBy="setup-requirements" disabled={busy} />
        <PasswordInput label="Confirm Password" value={confirm} onChange={setConfirm} error={errors.confirm} disabled={busy} />
        <PasswordRequirements id="setup-requirements" password={pw} confirm={confirm} />
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <AuthButton type="submit" busy={busy} busyLabel="Activating account…">Set Password & Activate Account</AuthButton>
        <AuthButton variant="link" onClick={goLogin}>Back to Login</AuthButton>
      </form>
    </>
  ))
}
