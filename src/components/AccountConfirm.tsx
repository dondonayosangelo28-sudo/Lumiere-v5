import { useRef, useState } from 'react'
import { CircleAlert, Loader2 } from 'lucide-react'
import Modal from './Modal'
import { cx } from './ui'
import { authService } from '../auth/mockAuthService'
import { authMessage } from '../auth/messages'
import { isAuthError } from '../auth/types'
import { accountName, type Account } from '../auth/store'

// Shared confirmation for account actions; used by Account Management and the Security page.
export type ConfirmKey = 'deactivate' | 'reactivate' | 'reset' | 'unlock' | 'delete' | 'restore'

export default function ConfirmAction({ confirm, account, onClose, onDone }: { confirm: { key: ConfirmKey; id: number } | null; account: Account | null; onClose: () => void; onDone: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  if (!confirm || !account) return null
  const name = accountName(account)
  const copy = {
    restore: { title: 'Restore account?', body: `${name} (${account.email}) will return to All Users as inactive. Reactivate the account separately to allow sign-in.`, cta: 'Restore Account', busy: 'Restoring…', danger: false },
    delete: { title: 'Delete Account?', body: `${name} (${account.email}) will be moved to Deleted Users. This is a soft deletion; their account record will be retained.`, cta: 'Delete Account', busy: 'Deleting…', danger: true },
    deactivate: { title: 'Deactivate account?', body: `${name} will no longer be able to sign in and any active sessions will end immediately. You can reactivate the account later.`, cta: 'Deactivate', busy: 'Deactivating…', danger: true },
    reactivate: { title: 'Reactivate account?', body: account.activatedAt ? `${name} will return to Active and can sign in with their existing password.` : `${name} never activated this account, so it returns to Pending Activation and a fresh invitation is sent to ${account.email}.`, cta: 'Reactivate', busy: 'Reactivating…', danger: false },
    reset: { title: 'Send password reset?', body: `A verification code is issued for ${account.email}. They finish the reset from the Forgot password screen. No email is sent in this prototype.`, cta: 'Send Password Reset', busy: 'Sending…', danger: false },
    unlock: { title: 'Unlock account?', body: `${name} is temporarily locked after too many incorrect sign-in attempts. Unlocking clears the failed attempts so they can try again now.`, cta: 'Unlock Account', busy: 'Unlocking…', danger: false },
  }[confirm.key]
  const run = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      if (confirm.key === 'restore') {
        await authService.restoreAccount(account.id)
        onDone(`${name} was restored to All Users and remains inactive.`)
      } else if (confirm.key === 'delete') {
        await authService.deleteAccount(account.id)
        onDone(`${name} was moved to Deleted Users.`)
      } else if (confirm.key === 'deactivate') {
        await authService.deactivateAccount(account.id)
        onDone(`${name} was deactivated. Sign-in is blocked and active sessions were ended.`)
      } else if (confirm.key === 'reactivate') {
        const r = await authService.reactivateAccount(account.id)
        onDone(r.status === 'Active' ? `${name} was reactivated and is Active again.` : `${name} was reactivated as Pending Activation. A fresh invitation was sent to ${account.email}.`)
      } else if (confirm.key === 'reset') {
        await authService.initiatePasswordReset(account.id)
        onDone(`Password reset started for ${account.email}. A verification code was issued and expires in 5 minutes.`)
      } else {
        await authService.unlockAccount(account.id)
        onDone(`${name} was unlocked.`)
      }
    } catch (e) {
      const wait = isAuthError(e) && e.retryAt ? ` Try again in ${Math.max(1, Math.ceil((e.retryAt - Date.now()) / 1000))}s.` : ''
      setError(authMessage(e) + wait)
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={() => !busy && onClose()} title={copy.title}>
      <p className="text-[14px] leading-6 text-muted-foreground">{copy.body}</p>
      {error && <p role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-[13px]"><CircleAlert size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden />{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-full px-4 text-[14px] font-semibold transition-colors hover:bg-fg/[0.08] disabled:opacity-50">Cancel</button>
        <button type="button" disabled={busy} aria-busy={busy} onClick={run} className={cx('flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:opacity-70', copy.danger ? 'bg-danger text-white' : 'bg-invert text-invert-fg')}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {busy ? copy.busy : copy.cta}
        </button>
      </div>
    </Modal>
  )
}
