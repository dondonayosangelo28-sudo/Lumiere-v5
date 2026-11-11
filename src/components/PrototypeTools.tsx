import { useCloseOnOverlay } from './OverlayLayer'
import { useState, useSyncExternalStore } from 'react'
import { FlaskConical, LifeBuoy, X, Link2, Clock, Ban, Repeat, WifiOff, RotateCcw, KeyRound, ShieldAlert } from 'lucide-react'
import { accountsVersion, demoAccounts, prototypeAuth, subscribeAccounts } from '../auth/mockAuthService'
import { formatWait } from '../auth/messages'
import { useNow } from './AuthShell'
import { cx } from './ui'

// Development-only reviewer panel. App lazy-loads it only when import.meta.env.DEV is true.
export default function PrototypeTools({
  openInvitation,
  openRecovery,
  onReset,
}: {
  openInvitation: (token: string) => void
  openRecovery: () => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  useCloseOnOverlay(() => setOpen(false))
  const [note, setNote] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  useSyncExternalStore(subscribeAccounts, accountsVersion)
  const now = useNow()
  const otp = prototypeAuth.currentOtp()
  const invite = prototypeAuth.latestInvitationToken()
  const act = (fn: () => boolean, done: string, missing: string) => setNote(fn() ? done : missing)

  const actions = [
    { icon: Link2, label: 'Open latest invitation', disabled: !invite, run: () => invite && (openInvitation(invite), setOpen(false)) },
    { icon: LifeBuoy, label: 'Open recovery demonstration', disabled: false, run: () => (openRecovery(), setOpen(false)) },
    { icon: Clock, label: 'Expire latest invitation', disabled: !invite, run: () => act(prototypeAuth.expireInvitation, 'Latest invitation expired.', 'No invitation yet.') },
    { icon: Repeat, label: 'Mark invitation as used', disabled: !invite, run: () => act(prototypeAuth.markInvitationUsed, 'Latest invitation marked as used (reuse scenario).', 'No invitation yet.') },
    { icon: Clock, label: 'Expire current OTP', disabled: false, run: () => act(prototypeAuth.expireOtp, 'Current code expired.', 'No active recovery code.') },
    { icon: Ban, label: 'Use up OTP attempts', disabled: false, run: () => act(prototypeAuth.exhaustOtpAttempts, 'Attempt limit reached for the current code.', 'No active recovery code.') },
    { icon: ShieldAlert, label: 'Expire reset authorization', disabled: false, run: () => act(prototypeAuth.expireRecoveryAuthorization, 'Recovery authorization expired.', 'No verified recovery yet.') },
    { icon: WifiOff, label: 'Fail next request', disabled: false, run: () => act(prototypeAuth.failNextRequest, 'The next mock request will fail with a network error.', '') },
    { icon: RotateCcw, label: 'Restore default demo state', disabled: false, run: () => setConfirmReset(true) },
  ]

  return (
    <div className="fixed bottom-4 left-4 z-[80] print:hidden">
      {open ? (
        <section role="dialog" aria-label="Prototype tools" className="w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card p-4 text-foreground shadow-2xl animate-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground"><FlaskConical size={16} aria-hidden /> Prototype tools</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Prototype only — no email is sent.</p>
            </div>
            <button type="button" aria-label="Close prototype tools" onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-fg/[0.08] hover:text-foreground"><X size={16} /></button>
          </div>

          <div className="mt-4 rounded-xl bg-fg/[0.05] p-3 text-[12px]">
            <p className="flex items-center gap-1.5 font-semibold text-foreground"><KeyRound size={14} aria-hidden /> Current demo OTP</p>
            {otp ? (
              <p className="mt-1 text-muted-foreground">
                <span className="font-mono text-[15px] font-semibold tracking-[0.2em] text-foreground">{otp.code}</span>
                <span className="block break-all">{otp.identifier} · {now < otp.expiresAt ? `expires in ${formatWait(otp.expiresAt - now)}` : 'expired'} · {otp.attempts}/5 attempts</span>
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">No code for an eligible account. Request one for <span className="text-foreground">{demoAccounts.eligible}</span>.</p>
            )}
            <p className="mt-2 text-muted-foreground">Ineligible: {demoAccounts.ineligible}. Unknown emails get the same public response but can never verify.</p>
          </div>

          <ul className="mt-3 flex flex-col gap-0.5">
            {actions.map((a) => (
              <li key={a.label}>
                <button type="button" disabled={a.disabled} onClick={a.run} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-fg/[0.08] disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent">
                  <a.icon size={15} aria-hidden className="shrink-0 text-muted-foreground" /> {a.label}
                  {a.label === 'Fail next request' && prototypeAuth.isFailureArmed() && <span className="ml-auto text-[11px] text-red-400">armed</span>}
                </button>
              </li>
            ))}
          </ul>
 
          {confirmReset && (
            <div role="alertdialog" aria-labelledby="proto-reset-title" aria-describedby="proto-reset-desc" className="mt-3 rounded-xl border border-line bg-fg/[0.05] p-3 text-[12px]">
              <p id="proto-reset-title" className="font-semibold text-foreground">Restore the default demo state?</p>
              <p id="proto-reset-desc" className="mt-1 text-muted-foreground">This removes created accounts, invitations, recovery codes, sessions, and audit events, restores the five demo accounts with password demo123, and returns to Login.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" autoFocus onClick={() => (setConfirmReset(false), onReset(), prototypeAuth.reset(), setNote('Demo state restored.'))} className="h-8 rounded-full bg-invert px-3 text-[12px] font-semibold text-invert-fg">Restore</button>
                <button type="button" onClick={() => setConfirmReset(false)} className="h-8 rounded-full border border-edge px-3 text-[12px] font-semibold">Cancel</button>
              </div>
            </div>
          )}
          <p role="status" aria-live="polite" className={cx('text-[12px] text-muted-foreground', note && 'mt-2')}>{note}</p>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex h-9 items-center gap-2 rounded-full border border-line bg-card px-3 text-[12px] font-semibold text-foreground shadow-lg transition-colors hover:bg-elev">
          <FlaskConical size={15} aria-hidden /> Prototype tools
        </button>
      )}
    </div>
  )
}
