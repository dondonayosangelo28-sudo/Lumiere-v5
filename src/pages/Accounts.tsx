import { useNotify } from '../components/Notifications'
import StatCards from '../components/StatCards'
import { currentSession as summarySession } from '../auth/session'
import Dropdown from '../components/Dropdown'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Ban, CalendarClock, ChevronDown, CircleAlert, CircleCheck, Eye, KeyRound, Loader2, LockOpen, Plus, RefreshCw, RotateCcw, Search, Send, SquarePen, UserCheck, UserX, Users as UsersIcon, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, Card, PageHeader, cx } from '../components/ui'
import Modal from '../components/Modal'
import Drawer from '../components/Drawer'
import RowMenu from '../components/RowMenu'
import { initials } from '../components/Shell'
import { ASSIGNABLE_ROLES, accountsVersion, authService, deactivationBlock, getInvitationExpiry, getResendAvailableAt, subscribeAccounts } from '../auth/mockAuthService'
import { authMessage } from '../auth/messages'
import { isAuthError } from '../auth/types'
import { accountName, getState, invitationCondition, lockInfo, type Account, type LifecycleStatus } from '../auth/store'
import ConfirmAction, { type ConfirmKey } from '../components/AccountConfirm'
import { Trash2 } from 'lucide-react'
import { ROLES } from '../auth/store'

const PER = 10
const STATUSES: LifecycleStatus[] = ['Active', 'Pending Activation', 'Inactive']
const fieldCls = 'h-10 w-full rounded-md border border-fg/[0.06] bg-fg/[0.05] px-3 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-fg/25 focus:ring-2 focus:ring-fg/10 disabled:cursor-default disabled:text-muted-foreground aria-[invalid=true]:border-red-400'
const fmtDate = (t: number) => new Date(t).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
const fmtDateTime = (t: number) => new Date(t).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

type ActionKey = 'view' | 'edit' | 'resend' | ConfirmKey
interface ActionDef { key: ActionKey; label: string; icon: LucideIcon; danger?: boolean; disabled?: string }

function actionsFor(a: Account, actorId: number, locked: boolean): ActionDef[] {
  const base: ActionDef[] = [{ key: 'view', label: 'View', icon: Eye }, { key: 'edit', label: 'Edit Details', icon: SquarePen }]
  if (a.deletedAt) return [...base, { key: 'restore', label: 'Restore Account', icon: RotateCcw }]
  if (a.status === 'Pending Activation') {
    return [...base, { key: 'resend', label: 'Resend Invitation', icon: Send }, { key: 'deactivate', label: 'Deactivate', icon: UserX, danger: true, disabled: deactivationBlock(a, actorId) ?? undefined }]
  }
  if (a.status === 'Active') {
    return [
      ...base,
      { key: 'reset', label: 'Send Password Reset', icon: KeyRound },
      ...(locked ? [{ key: 'unlock' as const, label: 'Unlock Account', icon: LockOpen }] : []),
      { key: 'deactivate', label: 'Deactivate', icon: UserX, danger: true, disabled: deactivationBlock(a, actorId) ?? undefined },
    ]
  }
  return [...base, { key: 'reactivate', label: 'Reactivate', icon: UserCheck }, ...(!a.deletedAt ? [{ key: 'delete' as const, label: 'Delete Account', icon: Trash2, danger: true, disabled: deactivationBlock(a, actorId) ?? undefined }] : [])]
}

function StatusBadges({ a, now }: { a: Account; now: number }) {
  const expired = invitationCondition(a.id, now) === 'Expired Invitation'
  const locked = lockInfo(a.id, now).locked
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={a.status === 'Active' ? 'success' : a.status === 'Pending Activation' ? 'warning' : 'neutral'}>{a.status}</Badge>
      {expired && <Badge tone="danger">Invitation expired</Badge>}
      {locked && <Badge tone="danger">Locked</Badge>}
    </span>
  )
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-4 py-[18px]"><span className={cx('inline-block h-3.5 animate-pulse rounded-full bg-fg/[0.12]', c === 0 ? 'w-[130px]' : 'w-[80px]')} /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

export default function AccountsPage({ actor, onHome, openAccountId, onOpened, deleted = false, initialRole = '', initialStatus = '' }: { actor: Account; onHome: () => void; openAccountId?: number | null; onOpened?: () => void; deleted?: boolean; initialRole?: string; initialStatus?: string }) {
  useSyncExternalStore(subscribeAccounts, accountsVersion)
  const allAccounts = getState().accounts
  const accounts = useMemo(() => allAccounts.filter((a) => deleted ? !!a.deletedAt : !a.deletedAt), [allAccounts, deleted])
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [role, setRole] = useState(initialRole)
  const [status, setStatus] = useState(initialStatus)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const setFlash = useNotify()
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<Account | null>(null)
  const [confirm, setConfirm] = useState<{ key: ConfirmKey; id: number } | null>(null)
  const resending = useRef(new Set<number>())

  useEffect(() => {
    if (deleted) {
      setCreating(false)
      setCreated(null)
    }
  }, [deleted])

  useEffect(() => {
    if (openAccountId == null) return
    setEditing(false)
    setViewingId(openAccountId)
    onOpened?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAccountId])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => (setApplied(query.trim().toLowerCase()), setPage(1)), 250)
    return () => clearTimeout(t)
  }, [query])
  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(t)
  }, [applied, role, status, page])

  const counts = useMemo(() => {
    const users = allAccounts.filter((a) => !a.deletedAt)
    return {
      total: users.length,
      active: users.filter((a) => a.status === 'Active').length,
      pending: users.filter((a) => a.status === 'Pending Activation').length,
      inactive: users.filter((a) => a.status === 'Inactive').length,
      deleted: allAccounts.filter((a) => !!a.deletedAt).length,
    }
  }, [allAccounts])
  const rows = useMemo(
    () =>
      accounts
        .filter((a) => (!role || a.role === role) && (!status || a.status === status) && (!applied || `${accountName(a)} ${a.email} ${a.role}`.toLowerCase().includes(applied)))
        .sort((x, y) => y.createdAt - x.createdAt || x.id - y.id),
    [accounts, applied, role, status, deleted],
  )
  const pages = Math.max(1, Math.ceil(rows.length / PER))
  const safePage = Math.min(page, pages)
  const shown = rows.slice((safePage - 1) * PER, safePage * PER)
  const filtered = !!(query || role || status)
  const resetFilters = () => (setQuery(''), setApplied(''), setRole(''), setStatus(''), setPage(1))
  const viewing = viewingId !== null ? accounts.find((a) => a.id === viewingId) ?? null : null
  const confirmTarget = confirm ? accounts.find((a) => a.id === confirm.id) ?? null : null

  const resend = async (a: Account) => {
    if (resending.current.has(a.id)) return
    resending.current.add(a.id)
    try {
      const r = await authService.resendInvitation(a.id)
      setFlash({ tone: 'success', text: `New invitation sent to ${a.email}. It expires ${fmtDateTime(r.invitationExpiresAt)}; the previous link no longer works.` })
    } catch (e) {
      const wait = isAuthError(e) && e.retryAt ? ` Try again in ${Math.max(1, Math.ceil((e.retryAt - Date.now()) / 1000))}s.` : ''
      setFlash({ tone: 'error', text: authMessage(e) + wait })
    } finally {
      resending.current.delete(a.id)
    }
  }
  const trigger = (key: ActionKey, a: Account) => {
    if (key === 'view') return (setEditing(false), setViewingId(a.id))
    if (key === 'edit') return (setEditing(true), setViewingId(a.id))
    if (key === 'resend') return void resend(a)
    setConfirm({ key, id: a.id })
  }

  return (
    <>
      <PageHeader
        onHome={onHome}
        crumbs={['Dashboard', 'Users', deleted ? 'Deleted Users' : 'All Users']}
        title={deleted ? 'Deleted Users' : 'All Users'}
        subtitle={deleted ? 'View deleted accounts and restore them.' : 'Create accounts, assign roles, and manage access for everyone in Lumière'}
        actions={
          !deleted && <button type="button" onClick={() => setCreating(true)} className="flex h-8 items-center gap-2 rounded-full bg-invert px-3 text-[13px] font-medium text-invert-fg transition-opacity hover:opacity-90">
            <Plus size={16} aria-hidden /> Create Account
          </button>
        }
      />
      <StatCards key={`${summarySession()?.accountId}-${deleted ? 'deleted-users' : 'all-users'}`} userId={summarySession()?.accountId ?? 0} groupId={deleted ? 'deleted-users' : 'all-users'} preserveDesign gridCols="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data={[
        { id: 'total-users', title: 'Total Users', icon: UsersIcon, value: counts.total },
        ...(deleted ? [{ id: 'deleted-users', title: 'Deleted Users', icon: Trash2, value: counts.deleted }] : []),
        { id: 'active-users', title: 'Active Users', icon: UserCheck, value: counts.active },
        ...(!deleted ? [{ id: 'pending-activation', title: 'Pending Activation', icon: CalendarClock, value: counts.pending }] : []),
        { id: 'inactive-users', title: 'Inactive Users', icon: Ban, value: counts.inactive },
      ]} />

      <Card className="filter-toolbar mt-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_220px_200px_auto]">
          <div className="relative">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input aria-label="Search accounts" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, or role" className={cx(fieldCls, 'pl-10')} />
          </div>
          <div className="relative">
            <Dropdown aria-label="Filter by role" value={role} onChange={(e) => (setRole(e.target.value), setPage(1))} className={cx(fieldCls, 'appearance-none pr-9')}>
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Dropdown>
            <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative">
            <Dropdown aria-label="Filter by status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className={cx(fieldCls, 'appearance-none pr-9')}>
              <option value="">All statuses</option>
              {STATUSES.filter((s) => !deleted || s === 'Inactive').map((s) => <option key={s} value={s}>{s}</option>)}
            </Dropdown>
            <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
          <button type="button" onClick={resetFilters} disabled={!filtered} className="flex h-10 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors hover:bg-fg/[0.08] disabled:pointer-events-none disabled:text-muted-foreground">
            <RefreshCw size={16} aria-hidden /> Reset Filters
          </button>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden bg-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[14px]">
            <thead className="bg-fg/[0.08] text-left">
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Created', 'Last Login'].map((h) => <th key={h} className="px-4 py-3.5 font-semibold">{h}</th>)}
                <th className="px-4 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={7} />
              ) : (
                shown.map((a) => {
                  const acts = actionsFor(a, actor.id, lockInfo(a.id, now).locked)
                  return (
                    <tr key={a.id} className="animate-fade-up transition-colors duration-150 hover:bg-fg/[0.04]">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[#3c3d41] text-[12px] font-semibold text-white">{initials(accountName(a))}</span>
                          <span className="font-semibold">{accountName(a)}{a.id === actor.id && <span className="ml-2 rounded-full border border-edge px-2 py-0.5 text-[11px] font-medium text-muted-foreground">You</span>}</span>
                        </div>
                      </td>
                      <td className="px-4">{a.email}</td>
                      <td className="px-4">{a.role}</td>
                      <td className="px-4"><StatusBadges a={a} now={now} /></td>
                      <td className="px-4 tabular-nums text-muted-foreground">{fmtDate(a.createdAt)}</td>
                      <td className="px-4 tabular-nums text-muted-foreground">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'Never'}</td>
                      <td className="px-4">
                        <div className="flex items-center justify-end gap-3">
                          <button type="button" onClick={() => trigger('view', a)} className="flex h-8 items-center gap-2 rounded-full px-2 text-[13px] font-semibold transition-colors hover:bg-fg/[0.08]">
                            <Eye size={16} aria-hidden /> View
                          </button>
                          <RowMenu menuClassName="w-52" items={acts.filter((x) => x.key !== 'view').map((x) => ({ label: x.label, icon: x.icon, danger: x.danger, disabled: x.disabled ?? (x.key === 'resend' && getResendAvailableAt(a.id) > now ? `Available in ${Math.ceil((getResendAvailableAt(a.id) - now) / 1000)}s` : undefined), onClick: () => trigger(x.key, a) }))} />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-muted-foreground">
                    <p>{filtered ? 'No accounts match your search or filters.' : 'No accounts yet.'}</p>
                    {filtered && <button type="button" onClick={resetFilters} className="mt-3 rounded-full border border-edge px-3 py-1.5 text-[13px] font-semibold text-foreground hover:bg-fg/[0.08]">Reset Filters</button>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {!loading && rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-edge px-4 py-4 text-[14px]">
          <span>Showing <b>{(safePage - 1) * PER + 1}</b> to <b>{Math.min(safePage * PER, rows.length)}</b> of <b>{rows.length}</b> accounts</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="h-9 rounded-full border border-edge px-4 text-[13px] font-semibold transition-colors hover:bg-fg/[0.08] disabled:pointer-events-none disabled:text-muted-foreground">Previous</button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button type="button" key={n} aria-current={n === safePage ? 'page' : undefined} onClick={() => setPage(n)} className={cx('size-8 rounded-full text-[13px] font-semibold transition-colors', n === safePage ? 'bg-invert text-invert-fg' : 'hover:bg-fg/[0.08]')}>{n}</button>
            ))}
            <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)} className="h-9 rounded-full border border-edge px-4 text-[13px] font-semibold transition-colors hover:bg-fg/[0.08] disabled:pointer-events-none disabled:text-muted-foreground">Next</button>
          </div>
        </div>
      )}

      {!deleted && <CreateDrawer open={creating} onClose={() => setCreating(false)} onCreated={(a) => (setCreated(a), resetFilters())} />}

      <Modal open={!deleted && !!created} onClose={() => setCreated(null)} title="Account created">
        {created && (
          <div>
            <div role="status" className="flex gap-3 rounded-xl bg-fg/[0.05] p-4">
              <CircleCheck size={20} className="mt-0.5 shrink-0 text-[#4ade80]" aria-hidden />
              <div className="min-w-0">
                <p className="break-words text-[14px]">Account created for <span className="font-semibold">{accountName(created)}</span>. An invitation was sent to <span className="font-semibold">{created.email}</span>.</p>
                <p className="mt-1 text-[12px] text-muted-foreground">Status: Pending Activation · Role: {created.role} · Invitation expires {getInvitationExpiry(created.id) ? fmtDateTime(getInvitationExpiry(created.id)!) : 'in 24 hours'}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setCreated(null)} className="h-10 rounded-full px-4 text-[14px] font-semibold transition-colors hover:bg-fg/[0.08]">Back to Accounts</button>
              <button type="button" onClick={() => (setEditing(false), setViewingId(created.id), setCreated(null))} className="h-10 rounded-full bg-invert px-4 text-[14px] font-medium text-invert-fg transition-opacity hover:opacity-90">View Account</button>
            </div>
          </div>
        )}
      </Modal>

      <DetailsDrawer
        account={viewing}
        editing={editing}
        setEditing={setEditing}
        onClose={() => (setViewingId(null), setEditing(false))}
        onSaved={(text) => setFlash({ tone: 'success', text })}
      />

      <ConfirmAction
        key={confirm ? `${confirm.key}-${confirm.id}` : 'none'}
        confirm={confirm}
        account={confirmTarget}
        onClose={() => setConfirm(null)}
        onDone={(text) => (setConfirm(null), setFlash({ tone: 'success', text }))}
      />
    </>
  )
}

/* ---------- Create ---------- */

function CreateDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (a: Account) => void }) {
  const blank = { first: '', last: '', email: '', role: '' }
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const reset = () => (setForm(blank), setErrors({}), setFormError(''))
  const close = () => {
    if (pending.current) return
    onClose()
    setTimeout(reset, 300)
  }
  const set = (k: keyof typeof blank, v: string) => (setForm((f) => ({ ...f, [k]: v })), setErrors((e) => ({ ...e, [k]: '' })))
  const submit = async () => {
    if (pending.current) return
    const e: Record<string, string> = {}
    const email = form.email.trim()
    if (!form.first.trim()) e.first = 'First name is required.'
    if (!form.last.trim()) e.last = 'Last name is required.'
    if (!email) e.email = 'Email address is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.'
    if (!ASSIGNABLE_ROLES.includes(form.role)) e.role = 'Select a role.'
    setErrors(e)
    setFormError('')
    if (Object.keys(e).length) return
    pending.current = true
    setBusy(true)
    try {
      const r = await authService.createUser({ firstName: form.first, lastName: form.last, email, role: form.role })
      const account = getState().accounts.find((a) => a.id === r.userId)!
      pending.current = false
      onCreated(account)
      onClose()
      setTimeout(reset, 300)
    } catch (err) {
      if (isAuthError(err) && err.fieldErrors) setErrors({ first: err.fieldErrors.firstName ?? '', last: err.fieldErrors.lastName ?? '', email: err.fieldErrors.email ?? '', role: err.fieldErrors.role ?? '' })
      setFormError(isAuthError(err) && err.code === 'NETWORK_ERROR' ? "We couldn't create the account because the server didn't respond. Your details are still here — try again." : authMessage(err))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const Err = ({ id }: { id: string }) => (errors[id] ? <p id={`ca-${id}-error`} className="mt-1.5 text-[12px] text-[#f87171]">{errors[id]}</p> : null)
  const Lbl = ({ htmlFor, children, required }: { htmlFor: string; children: string; required?: boolean }) => <label htmlFor={htmlFor} className="mb-2 block text-[14px] font-semibold">{children}{required && <span className="text-[#f87171]"> *</span>}</label>
  const inv = (id: string) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `ca-${id}-error` : undefined, disabled: busy })
  return (
    <Drawer
      open={open}
      onClose={close}
      title="Create Account"
      compact
      subtitle="The person sets their own password from the invitation."
      footer={
        <>
          <button type="button" onClick={close} disabled={busy} className="h-10 rounded-full px-4 text-[14px] font-semibold transition-colors hover:bg-fg/[0.08] disabled:opacity-50">Cancel</button>
          <button type="submit" form="create-account-form" disabled={busy} aria-busy={busy} className="flex h-10 items-center gap-2 rounded-full bg-invert px-4 text-[14px] font-medium text-invert-fg transition-opacity hover:opacity-90 disabled:opacity-70">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {busy ? 'Creating account…' : 'Create Account & Send Invite'}
          </button>
        </>
      }
    >
      <form id="create-account-form" noValidate onSubmit={(e) => (e.preventDefault(), void submit())} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><Lbl htmlFor="ca-first" required>First Name</Lbl><input id="ca-first" autoComplete="off" value={form.first} onChange={(e) => set('first', e.target.value)} placeholder="Enter first name" className={fieldCls} {...inv('first')} /><Err id="first" /></div>
          <div><Lbl htmlFor="ca-last" required>Last Name</Lbl><input id="ca-last" autoComplete="off" value={form.last} onChange={(e) => set('last', e.target.value)} placeholder="Enter last name" className={fieldCls} {...inv('last')} /><Err id="last" /></div>
        </div>
        <div><Lbl htmlFor="ca-email" required>Email Address</Lbl><input id="ca-email" type="email" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Enter email address" className={fieldCls} {...inv('email')} /><Err id="email" /></div>
        <div>
          <Lbl htmlFor="ca-role" required>Role</Lbl>
          <Dropdown id="ca-role" value={form.role} onChange={(e) => set('role', e.target.value)} className={cx(fieldCls, 'pr-9')} {...inv('role')}>
            <option value="">Select role</option>
            {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </Dropdown>
          <p className="mt-1.5 text-[12px] text-muted-foreground">The role is chosen now and cannot be changed after the account is created.</p>
          <Err id="role" />
        </div>
        {formError && (
          <div role="alert" className="flex gap-2.5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-[13px]">
            <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
            {formError}
          </div>
        )}
      </form>
    </Drawer>
  )
}

/* ---------- Details and editing ---------- */

export function DetailsDrawer({ account, editing, setEditing, onClose, onSaved }: { account: Account | null; editing: boolean; setEditing: (v: boolean) => void; onClose: () => void; onSaved: (text: string) => void }) {
  if (editing) return (
    <Drawer open={!!account} onClose={onClose} title="Edit Account" subtitle={account ? `${accountName(account)} · ${account.email}` : undefined}>
      {account && <EditForm key={account.id} account={account} onCancel={() => setEditing(false)} onSaved={(text) => { setEditing(false); onSaved(text) }} />}
    </Drawer>
  )
  return (
    <Modal open={!!account} onClose={onClose} title="User Details" lowered compact>
      {account && <DetailsBody account={account} />}
    </Modal>
  )
}

function DetailsBody({ account }: { account: Account }) {
  const name = accountName(account)
  const lock = lockInfo(account.id)
  const details: [string, React.ReactNode][] = [
    ['Name', name],
    ['Email', account.email || '—'],
    ['Username', account.email.split('@')[0] || '—'],
    ['Role', account.role],
    ['Status', <Badge key="status" tone={account.deletedAt ? 'danger' : account.status === 'Active' ? 'success' : account.status === 'Pending Activation' ? 'warning' : 'neutral'}>{account.deletedAt ? 'Deleted' : account.status}</Badge>],
    ['Security', lock.locked ? `Locked until ${fmtDateTime(lock.lockedUntil!)}` : 'Not locked'],
    ['Created', account.createdAt ? fmtDateTime(account.createdAt) : '—'],
    ['Activated', account.activatedAt ? fmtDateTime(account.activatedAt) : '—'],
    ['Last Login', account.lastLoginAt ? fmtDateTime(account.lastLoginAt) : 'Never'],
  ]
  return (
    <div>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-elev text-base font-semibold text-foreground">{initials(name)}</span>
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-foreground">{name}</p>
          <p className="mt-0.5 break-all text-xs text-muted-foreground">{account.email}</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-elev p-3">
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-sm font-bold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function EditForm({ account: a, onCancel, onSaved }: { account: Account; onCancel: () => void; onSaved: (text: string) => void }) {
  const [f, setF] = useState({ first: a.firstName, last: a.lastName, email: a.email })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const set = (k: keyof typeof f, v: string) => (setF((x) => ({ ...x, [k]: v })), setErrors((e) => ({ ...e, [k]: '' })))
  const pendingAccount = a.status === 'Pending Activation'
  const save = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const r = await authService.updateAccount(a.id, { firstName: f.first, lastName: f.last, email: f.email })
      const email = f.email.trim().toLowerCase()
      onSaved(
        !r.changed ? 'No changes to save.' : r.invitationReplaced ? `Details saved. Because the email changed, the previous invitation was replaced and a new one was sent to ${email}.` : r.emailChanged && a.status === 'Active' ? `Details saved. ${email} is now the sign-in email for this account.` : 'Account details saved.',
      )
    } catch (e) {
      if (isAuthError(e) && e.fieldErrors) setErrors({ first: e.fieldErrors.firstName ?? '', last: e.fieldErrors.lastName ?? '', email: e.fieldErrors.email ?? '' })
      setError(authMessage(e))
      pending.current = false
      setBusy(false)
    }
  }
  const Err = ({ id }: { id: string }) => (errors[id] ? <p id={`ea-${id}-error`} className="mt-1.5 text-[12px] text-[#f87171]">{errors[id]}</p> : null)
  const inv = (id: string) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `ea-${id}-error` : undefined, disabled: busy })
  const Lbl = ({ htmlFor, children }: { htmlFor: string; children: string }) => <label htmlFor={htmlFor} className="mb-2 block text-[14px] font-semibold">{children}</label>
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void save())} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><Lbl htmlFor="ea-first">First Name</Lbl><input id="ea-first" value={f.first} onChange={(e) => set('first', e.target.value)} className={fieldCls} {...inv('first')} /><Err id="first" /></div>
        <div><Lbl htmlFor="ea-last">Last Name</Lbl><input id="ea-last" value={f.last} onChange={(e) => set('last', e.target.value)} className={fieldCls} {...inv('last')} /><Err id="last" /></div>
      </div>
      <div>
        <Lbl htmlFor="ea-email">Email Address</Lbl>
        <input id="ea-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className={fieldCls} {...inv('email')} />
        {pendingAccount && <p className="mt-1.5 text-[12px] text-muted-foreground">Changing the email replaces the current invitation and sends a new one to the new address.</p>}
        <Err id="email" />
      </div>
      <div>
        <Lbl htmlFor="ea-role">Role</Lbl>
        <input id="ea-role" value={a.role} readOnly disabled aria-describedby="ea-role-hint" className={fieldCls} />
        <p id="ea-role-hint" className="mt-1.5 text-[12px] text-muted-foreground">Role cannot be changed after account creation.</p>
      </div>
      {error && (
        <div role="alert" className="flex gap-2.5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-[13px]">
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-full px-4 text-[14px] font-semibold transition-colors hover:bg-fg/[0.08] disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={busy} aria-busy={busy} className="flex h-10 items-center gap-2 rounded-full bg-invert px-4 text-[14px] font-medium text-invert-fg transition-opacity hover:opacity-90 disabled:opacity-70">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
