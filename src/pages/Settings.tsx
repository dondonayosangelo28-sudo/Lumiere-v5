import { useNotify } from '../components/Notifications'
import { useRef, useState } from 'react'
import { UserRound, Shield, Settings as Gear, SquarePen, Lock, TriangleAlert, Check } from 'lucide-react'
import { Button, Card, Field, Input, PageHeader, Toggle, cx } from '../components/ui'
import { type Route } from '../components/Shell'
import { PasswordInput, PasswordRequirements, Notice } from '../components/AuthShell'
import { authService, updateOwnProfile } from '../auth/mockAuthService'
import { passwordError } from '../auth/passwordPolicy'
import { authMessage } from '../auth/messages'
import { isAuthError } from '../auth/types'
import { accountName, type Account } from '../auth/store'
import { canAccess } from '../auth/roleConfig'
import { AccessDenied } from './RoleViews'

type Tab = 'settings-profile' | 'settings-security' | 'settings-app'

function Profile({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false)
  const [p, setP] = useState({ first: account.firstName, last: account.lastName })
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const notify = useNotify()
  const reset = () => setP({ first: account.firstName, last: account.lastName })
  const save = async () => {
    setBusy(true)
    try {
      await updateOwnProfile({ firstName: p.first, lastName: p.last })
      setErrors({})
      setEditing(false)
      notify({ tone: 'success', text: 'Profile updated.' })
    } catch (e) {
      setErrors(isAuthError(e) ? (e.fieldErrors ?? {}) : {})
      notify({ tone: 'error', text: authMessage(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-[52px] place-items-center rounded-full bg-[#3c3d41] text-muted-foreground"><UserRound size={22} strokeWidth={1.6} /></span>
          <div>
            <p className="text-[18px] font-semibold">{accountName(account)}</p>
            <p className="text-[13px] text-muted-foreground">{account.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing && <button type="button" disabled={busy} onClick={() => (reset(), setErrors({}), setEditing(false))} className="flex h-8 items-center rounded-full border border-edge px-3 text-[12px] font-semibold hover:bg-fg/[0.08]">Cancel</button>}
          <button type="button" disabled={busy} onClick={() => (editing ? void save() : setEditing(true))} className="flex h-8 items-center gap-2 rounded-full border border-edge px-3 text-[12px] font-semibold transition-colors hover:bg-fg/[0.08] disabled:opacity-60">{editing ? <Check size={14} /> : <SquarePen size={14} />} {editing ? (busy ? 'Saving…' : 'Save Changes') : 'Edit Profile'}</button>
        </div>
      </div>
      <div className="mt-7 grid gap-x-5 gap-y-5 md:grid-cols-2">
        <Field label="First Name"><Input disabled={!editing || busy} value={p.first} aria-invalid={!!errors.firstName} onChange={(e) => setP({ ...p, first: e.target.value })} />{errors.firstName && <span className="mt-1 block text-xs text-danger">{errors.firstName}</span>}</Field>
        <Field label="Last Name"><Input disabled={!editing || busy} value={p.last} aria-invalid={!!errors.lastName} onChange={(e) => setP({ ...p, last: e.target.value })} />{errors.lastName && <span className="mt-1 block text-xs text-danger">{errors.lastName}</span>}</Field>
        <Field label="Email Address"><Input disabled readOnly value={account.email} /></Field>
        <Field label="Role"><Input disabled readOnly value={account.role} /><span className="mt-1 block text-xs text-muted-foreground">Your role is assigned by a System Admin and cannot be changed here.</span></Field>
      </div>
    </>
  )
}

function Security() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [conf, setConf] = useState('')
  const [errors, setErrors] = useState<{ cur?: string; next?: string; conf?: string; form?: string }>({})
  const notify = useNotify()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pending.current) return
    const v = { cur: cur ? undefined : 'Enter your current password.', next: passwordError(next) || undefined, conf: !conf ? 'Confirm your new password.' : conf !== next ? 'Passwords do not match.' : undefined }
    setErrors(v)
    if (v.cur || v.next || v.conf) return
    pending.current = true
    setBusy(true)
    try {
      await authService.changePassword({ currentPassword: cur, password: next })
      setCur(''), setNext(''), setConf('')
      setErrors({})
      notify({ tone: 'success', text: 'Password updated. You stay signed in here; your other sessions were signed out.' })
    } catch (err) {
      const f = isAuthError(err) ? err.fieldErrors : undefined
      setErrors({ cur: f?.currentPassword, next: f?.password, form: f?.currentPassword || f?.password ? undefined : authMessage(err) })
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <form noValidate onSubmit={submit}>
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-elev"><Lock size={18} /></span>
        <div>
          <p className="text-base font-semibold">Change Password</p>
          <p className="text-xs text-muted-foreground">Update your password to keep your account secure</p>
        </div>
      </div>
      <div className="mt-7 flex max-w-md flex-col gap-4">
        <PasswordInput label="Current Password" autoComplete="current-password" value={cur} onChange={setCur} error={errors.cur} disabled={busy} />
        <PasswordInput label="New Password" value={next} onChange={setNext} error={errors.next} describedBy="change-requirements" disabled={busy} />
        <PasswordInput label="Confirm New Password" value={conf} onChange={setConf} error={errors.conf} disabled={busy} />
        <PasswordRequirements id="change-requirements" password={next} confirm={conf} />
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
      </div>
      <div className="mt-5 rounded-xl border border-line bg-field/50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><TriangleAlert size={15} /> Security Notice</p>
        <p className="mt-1 pl-6 text-xs text-muted-foreground">After changing your password, you'll remain signed in on this device. Any other device is signed out and must use the new password.</p>
      </div>
      <div className="mt-5 flex items-center justify-end">
        <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Updating password…' : 'Change Password'}</Button>
      </div>
    </form>
  )
}

function AppSettings() {
  const [s, setS] = useState({ email: true, push: false, weekly: true, compact: false, analytics: true })
  const rows: [keyof typeof s, string, string][] = [
    ['email', 'Email notifications', 'Receive account and activity updates by email'],
    ['push', 'Push notifications', 'Get real-time alerts in the browser'],
    ['weekly', 'Weekly digest', 'A summary of platform metrics every Monday'],
    ['compact', 'Compact tables', 'Reduce row height in data tables'],
    ['analytics', 'Usage analytics', 'Share anonymous usage to improve the product'],
  ]
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-elev"><Gear size={18} /></span>
        <div>
          <p className="text-base font-semibold">App Settings</p>
          <p className="text-xs text-muted-foreground">Notifications and display preferences</p>
        </div>
      </div>
      <ul className="mt-6 divide-y divide-line">
        {rows.map(([k, title, desc]) => (
          <li key={k} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-[13px] font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Toggle label={title} checked={s[k]} onChange={(v) => setS({ ...s, [k]: v })} />
          </li>
        ))}
      </ul>
    </>
  )
}

export default function SettingsPage({ account, tab, go, onHome }: { account: Account; tab: Tab; go: (r: Route) => void; onHome: () => void }) {
  const tabs = [
    { id: 'settings-profile', label: 'Profile', icon: UserRound },
    { id: 'settings-security', label: 'Security', icon: Shield },
    { id: 'settings-app', label: 'App Settings', icon: Gear },
  ] as const
  const visibleTabs = tabs.filter((t) => canAccess(account.role, t.id))
  if (!canAccess(account.role, tab)) return <AccessDenied go={go} />
  const current = visibleTabs.find((t) => t.id === tab)!
  return (
    <>
      <PageHeader large onHome={onHome} crumbs={['Dashboard', 'Settings', current.label]} title="Settings" subtitle="Manage your account settings and preferences" />
      <div className="grid items-start gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="p-3">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={cx(
                'relative mb-1.5 flex w-full items-center gap-2 overflow-hidden rounded-md px-4 py-3 text-[14px] font-semibold transition-colors duration-150',
                tab === t.id ? 'bg-fg/20 text-foreground' : 'text-foreground hover:bg-fg/[0.06]',
              )}
            >
              {tab === t.id && <span className="absolute inset-y-0 left-0 w-[3px] bg-fg" />}
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </Card>
        <Card className="p-5 sm:p-6">
          {tab === 'settings-profile' && <Profile key={account.id} account={account} />}
          {tab === 'settings-security' && <Security />}
          {tab === 'settings-app' && <AppSettings />}
        </Card>
      </div>
    </>
  )
}
