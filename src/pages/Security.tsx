import { useNotify } from '../components/Notifications'
import StatCards from '../components/StatCards'
import { DetailsDrawer } from './Accounts'
import { currentSession as summarySession } from '../auth/session'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { Activity, Eye, ListChecks, Loader2, LockOpen, LogOut, MonitorSmartphone, ShieldAlert, TriangleAlert, UserX, CircleAlert, X } from 'lucide-react'
import { Badge, Button, Card, PageHeader, cx } from '../components/ui'
import Modal from '../components/Modal'
import ConfirmAction from '../components/AccountConfirm'
import { AccessDenied } from './RoleViews'
import type { Route } from '../components/Shell'
import {
  DateField, EmptyRow, Pager, ResetFiltersButton, SearchField, SelectField, SkeletonRows, TIMEZONE, dayEnd, dayStart, fmtFull, fmtTime, ghostBtn, resultTone, useDebounced, useNow, type Flash,
} from '../components/AdminKit'
import { accountsVersion, authService, subscribeAccounts } from '../auth/mockAuthService'
import { authMessage } from '../auth/messages'
import { isAuthError } from '../auth/types'
import { currentSession, expireStaleSessions, liveSessions } from '../auth/session'
import { accountName, getState, securityPolicy as P, type Account, type AttemptResult, type LoginAttempt, type Session } from '../auth/store'
import { countRecentFailedSignIns, isWithinFailedSignInWindow, lockedAccountRows } from '../auth/dashboardMetrics'

const PER = 10
const RESULTS: AttemptResult[] = ['Success', 'Failed', 'Blocked']

type TabKey = 'activity' | 'locked' | 'sessions' | 'policy'

function loginReason(a: LoginAttempt) {
  if (a.result === 'Success') return 'Signed in successfully.'
  const r = a.reason ?? ''
  const m = /^Incorrect password \((\d+) of (\d+)\)/.exec(r)
  if (m) return `Incorrect password (attempt ${m[1]} of ${m[2]})${+m[1] >= +m[2] ? '. The account was locked for 15 minutes' : ''}.`
  const known: Record<string, string> = {
    'Unknown email': 'No account uses this email address.',
    'Incorrect password': 'Incorrect password.',
    'Temporarily locked': 'The account is temporarily locked after too many incorrect passwords.',
    'Pending activation': 'The account has not been activated yet.',
    'Account inactive': 'The account is inactive.',
  }
  return known[r] ?? (r ? `${r}.` : 'No reason was recorded.')
}

const scrollWrap = 'overflow-x-auto'
const th = 'px-4 py-3.5 font-semibold whitespace-nowrap'

type SecurityPageProps = { account: Account; go: (r: Route) => void; onLogout: () => void; initialTab?: TabKey; initialFailedLast24h?: boolean }

export default function SecurityPage(props: SecurityPageProps) {
  const { account, go } = props
  if (account.role !== 'System Admin') return <AccessDenied go={go} />
  return <SecurityBody {...props} />
}

function SecurityBody({ account, go, onLogout, initialTab = 'activity', initialFailedLast24h = false }: SecurityPageProps) {
  useSyncExternalStore(subscribeAccounts, accountsVersion)
  const now = useNow(1000)
  const [tab, setTab] = useState<TabKey>(initialTab)
  const setFlash = useNotify()
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const st = getState()

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(t)
  }, [])
  // Sessions that went idle are ended through the shared session logic, not just hidden.
  useEffect(() => {
    expireStaleSessions()
    const id = setInterval(() => expireStaleSessions(), 15_000)
    return () => clearInterval(id)
  }, [])

  const locked = lockedAccountRows(st, now)
  const failed24 = countRecentFailedSignIns(st.loginAttempts, now)
  const sessions = liveSessions(now).sort((a, b) => b.lastActivityAt - a.lastActivityAt)

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'activity', label: 'Login Activity' },
    { key: 'locked', label: 'Locked Accounts', count: locked.length },
    { key: 'sessions', label: 'Active Sessions', count: sessions.length },
    { key: 'policy', label: 'Security Policy' },
  ]
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.key === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setTab(tabs[next].key)
    document.getElementById(`sec-tab-${tabs[next].key}`)?.focus()
  }

  return (
    <>
      <PageHeader onHome={() => go('overview')} crumbs={['Dashboard', 'Security']} title="Security" subtitle="Monitor sign-ins, locked accounts, and sessions, and review the access policy" />
      <StatCards key={`${summarySession()?.accountId}-${'security'}`} userId={summarySession()?.accountId ?? 0} groupId={'security'} preserveDesign gridCols="grid grid-cols-1 gap-4 sm:grid-cols-3" data={[
        { id: 'temporarily-locked-accounts', title: 'Temporarily Locked Accounts', icon: ShieldAlert, value: locked.length },
        { id: 'failed-logins-last-24-hours', title: 'Failed Logins (Last 24 Hours)', icon: TriangleAlert, value: failed24 },
        { id: 'active-sessions', title: 'Active Sessions', icon: MonitorSmartphone, value: sessions.length },
      ]} />

      <div role="tablist" aria-label="Security sections" onKeyDown={onTabKey} className="security-tabs mt-6 bg-panel">
        {tabs.map((t) => (
          <Button
            variant="ghost"
            key={t.key}
            id={`sec-tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            aria-controls={`sec-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            className={cx('security-tab', tab === t.key ? 'bg-elev text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {t.label}
            {t.count !== undefined && <span className="tab-count shrink-0 bg-fg/[0.12] tabular-nums">{t.count}</span>}
          </Button>
        ))}
      </div>

      <div>
        <section id="sec-panel-activity" role="tabpanel" aria-labelledby="sec-tab-activity" hidden={tab !== 'activity'}>
          <LoginActivity attempts={st.loginAttempts} loading={loading} now={now} initialFailedLast24h={initialFailedLast24h} />
        </section>
        <section id="sec-panel-locked" role="tabpanel" aria-labelledby="sec-tab-locked" hidden={tab !== 'locked'}>
          <LockedAccounts rows={locked} now={now} loading={loading} onView={setViewingId} onDone={(text) => setFlash({ tone: 'success', text })} />
        </section>
        <section id="sec-panel-sessions" role="tabpanel" aria-labelledby="sec-tab-sessions" hidden={tab !== 'sessions'}>
          <ActiveSessions sessions={sessions} loading={loading} onLogout={onLogout} setFlash={setFlash} />
        </section>
        <section id="sec-panel-policy" role="tabpanel" aria-labelledby="sec-tab-policy" hidden={tab !== 'policy'}>
          <PolicyPanel />
        </section>
      </div>
      <DetailsDrawer
        account={st.accounts.find((a) => a.id === viewingId) ?? null}
        editing={false}
        setEditing={() => {}}
        onClose={() => setViewingId(null)}
        onSaved={(text) => setFlash({ tone: 'success', text })}
      />
    </>
  )
}

/* ---------- Login Activity ---------- */

function LoginActivity({ attempts, loading, now, initialFailedLast24h }: { attempts: LoginAttempt[]; loading: boolean; now: number; initialFailedLast24h: boolean }) {
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [result, setResult] = useState(initialFailedLast24h ? 'Failed' : '')
  // Rolling window shared with the Failed Logins count, opened from the dashboard.
  const [last24h, setLast24h] = useState(initialFailedLast24h)
  const [page, setPage] = useState(1)
  const q = useDebounced(query.trim().toLowerCase())
  const accounts = getState().accounts

  const rows = useMemo(() => {
    const lo = dayStart(from)
    const hi = dayEnd(to)
    return attempts.filter((a) => {
      if (result && a.result !== result) return false
      if (last24h && !isWithinFailedSignInWindow(a, now)) return false
      if (lo !== null && a.at < lo) return false
      if (hi !== null && a.at > hi) return false
      if (!q) return true
      const name = a.accountId !== null ? accounts.find((x) => x.id === a.accountId) : undefined
      return `${a.email} ${name ? accountName(name) : ''}`.toLowerCase().includes(q)
    })
  }, [attempts, accounts, q, from, to, result, last24h, now])

  const pages = Math.max(1, Math.ceil(rows.length / PER))
  const safePage = Math.min(page, pages)
  const shown = rows.slice((safePage - 1) * PER, safePage * PER)
  const filtered = !!(query || from || to || result || last24h)
  const reset = () => (setQuery(''), setFrom(''), setTo(''), setResult(''), setLast24h(false), setPage(1))

  return (
    <>
      <Card className="filter-toolbar p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_160px_170px_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Account / Email</span>
            <SearchField label="Search login activity by account or email" value={query} onChange={(v) => (setQuery(v), setPage(1))} placeholder="Search account or email" />
          </label>
          <DateField label="From" value={from} max={to || undefined} onChange={(v) => (setFrom(v), setPage(1))} />
          <DateField label="To" value={to} min={from || undefined} onChange={(v) => (setTo(v), setPage(1))} />
          <SelectField label="Filter by result" value={result} onChange={(v) => (setResult(v), setPage(1))}>
            <option value="">All results</option>
            {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </SelectField>
          <ResetFiltersButton onClick={reset} disabled={!filtered} />
        </div>
        {last24h && (
          <div className="mt-3 flex">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.08] py-1 pl-3 pr-1 text-[12px] font-medium">
              Last 24 hours
              <button type="button" onClick={() => (setLast24h(false), setPage(1))} aria-label="Remove last 24 hours filter" className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-fg/[0.12] hover:text-foreground focus-visible:outline-2 focus-visible:outline-fg">
                <X size={12} aria-hidden />
              </button>
            </span>
          </div>
        )}
      </Card>
      <Card className="mt-4 overflow-hidden bg-none">
        <div className={scrollWrap}>
          <table className="w-full min-w-[820px] text-[14px]">
            <caption className="sr-only">Login activity, newest first</caption>
            <thead className="bg-fg/[0.08] text-left">
              <tr>
                <th scope="col" className={th}>Date and Time ({TIMEZONE || 'local'})</th>
                <th scope="col" className={th}>Account / Email</th>
                <th scope="col" className={th}>Role</th>
                <th scope="col" className={th}>Result</th>
                <th scope="col" className={th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={5} />
              ) : (
                shown.map((a) => {
                  const acct = a.accountId !== null ? accounts.find((x) => x.id === a.accountId) : undefined
                  return (
                    <tr key={a.id} className="transition-colors duration-150 hover:bg-fg/[0.04]">
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-muted-foreground">{fmtFull(a.at)}</td>
                      <td className="px-4 py-3.5">
                        {acct && <p className="font-semibold">{accountName(acct)}</p>}
                        <p className={cx('break-all', acct && 'text-[13px] text-muted-foreground')}>{a.email}</p>
                      </td>
                      <td className="px-4">{a.role ?? <span className="text-muted-foreground">Unknown</span>}</td>
                      <td className="px-4"><Badge tone={resultTone(a.result)}>{a.result}</Badge></td>
                      <td className="px-4 text-muted-foreground">{loginReason(a)}</td>
                    </tr>
                  )
                })
              )}
              {!loading && rows.length === 0 && (
                <EmptyRow cols={5}>
                  <p>{filtered ? 'No login activity matches your search or filters.' : 'No login activity has been recorded yet.'}</p>
                  {filtered && <button type="button" onClick={reset} className="mt-3 rounded-full border border-edge px-3 py-1.5 text-[13px] font-semibold text-foreground hover:bg-fg/[0.08]">Reset Filters</button>}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
        {!loading && <Pager page={safePage} pages={pages} total={rows.length} per={PER} noun="attempts" onPage={setPage} />}
      </Card>
    </>
  )
}

/* ---------- Locked Accounts ---------- */

function LockedAccounts({ rows, now, loading, onView, onDone }: { rows: { lock: { consecutiveFailures: number; lockedUntil: number | null }; acct: Account }[]; now: number; loading: boolean; onView: (id: number) => void; onDone: (text: string) => void }) {
  const [unlockId, setUnlockId] = useState<number | null>(null)
  const target = unlockId !== null ? getState().accounts.find((a) => a.id === unlockId) ?? null : null
  return (
    <>
      <p className="mb-3 text-[13px] text-muted-foreground">An account locks for {P.lockDurationMs / 60_000} minutes after {P.loginAttemptLimit} consecutive incorrect passwords. Locks that expire on their own disappear from this list.</p>
      <Card className="overflow-hidden bg-none">
        <div className={scrollWrap}>
          <table className="w-full min-w-[820px] text-[14px]">
            <caption className="sr-only">Temporarily locked accounts</caption>
            <thead className="bg-fg/[0.08] text-left">
              <tr>
                <th scope="col" className={th}>Account</th>
                <th scope="col" className={th}>Role</th>
                <th scope="col" className={th}>Failed Attempts</th>
                <th scope="col" className={th}>Locked Until ({TIMEZONE || 'local'})</th>
                <th scope="col" className={cx(th, 'text-right')}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={5} />
              ) : (
                rows.map(({ lock, acct }) => {
                  const mins = Math.max(1, Math.ceil((lock.lockedUntil! - now) / 60_000))
                  return (
                    <tr key={acct.id} className="animate-fade-up transition-colors hover:bg-fg/[0.04]">
                      <td className="px-4 py-3.5"><p className="font-semibold">{accountName(acct)}</p><p className="break-all text-[13px] text-muted-foreground">{acct.email}</p></td>
                      <td className="px-4">{acct.role}</td>
                      <td className="px-4 tabular-nums">{lock.consecutiveFailures}</td>
                      <td className="whitespace-nowrap px-4 tabular-nums">{fmtTime(lock.lockedUntil!)} <span className="text-[13px] text-muted-foreground">(about {mins} min left)</span></td>
                      <td className="px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => onView(acct.id)} aria-label={`View account ${accountName(acct)}`} className={ghostBtn}><Eye size={16} aria-hidden /> View Account</button>
                          <button type="button" onClick={() => setUnlockId(acct.id)} aria-label={`Unlock account ${accountName(acct)}`} className={cx(ghostBtn, 'border border-edge')}><LockOpen size={16} aria-hidden /> Unlock Account</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
              {!loading && rows.length === 0 && <EmptyRow cols={5}>No accounts are temporarily locked.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>
      <ConfirmAction
        key={unlockId ?? 'none'}
        confirm={unlockId !== null ? { key: 'unlock', id: unlockId } : null}
        account={target}
        onClose={() => setUnlockId(null)}
        onDone={(text) => (setUnlockId(null), onDone(text))}
      />
    </>
  )
}

/* ---------- Active Sessions ---------- */

function ActiveSessions({ sessions, loading, onLogout, setFlash }: { sessions: Session[]; loading: boolean; onLogout: () => void; setFlash: (f: Flash) => void }) {
  const accounts = getState().accounts
  const currentId = currentSession()?.id
  const [endingId, setEndingId] = useState<string | null>(null)
  const ending = endingId ? sessions.find((s) => s.id === endingId) ?? null : null
  const endingAcct = ending ? accounts.find((a) => a.id === ending.accountId) : undefined

  return (
    <>
      <p className="mb-3 text-[13px] text-muted-foreground">Sessions end after {P.sessionIdleTimeoutMs / 60_000} minutes without activity. Device labels come from the browser's own description; no IP addresses or locations are recorded.</p>
      <Card className="overflow-hidden bg-none">
        <div className={scrollWrap}>
          <table className="w-full min-w-[960px] text-[14px]">
            <caption className="sr-only">Active sessions</caption>
            <thead className="bg-fg/[0.08] text-left">
              <tr>
                <th scope="col" className={th}>Account</th>
                <th scope="col" className={th}>Role</th>
                <th scope="col" className={th}>Device / Browser</th>
                <th scope="col" className={th}>Session Start ({TIMEZONE || 'local'})</th>
                <th scope="col" className={th}>Last Activity</th>
                <th scope="col" className={cx(th, 'text-right')}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={6} />
              ) : (
                sessions.map((s) => {
                  const a = accounts.find((x) => x.id === s.accountId)!
                  const isCurrent = s.id === currentId
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-fg/[0.04]">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold">{accountName(a)}{isCurrent && <span className="ml-2 align-middle"><Badge tone="info">Current session</Badge></span>}</p>
                        <p className="break-all text-[13px] text-muted-foreground">{a.email}</p>
                      </td>
                      <td className="px-4">{s.role}</td>
                      <td className="px-4">{s.device === 'Unknown' ? 'Unknown device' : s.device}</td>
                      <td className="whitespace-nowrap px-4 tabular-nums text-muted-foreground">{fmtFull(s.startedAt)}</td>
                      <td className="whitespace-nowrap px-4 tabular-nums text-muted-foreground">{fmtFull(s.lastActivityAt)}</td>
                      <td className="px-4">
                        <div className="flex justify-end">
                          {isCurrent ? (
                            <button type="button" onClick={onLogout} className={cx(ghostBtn, 'border border-edge')}><LogOut size={16} aria-hidden /> Log out</button>
                          ) : (
                            <button type="button" onClick={() => setEndingId(s.id)} aria-label={`End session for ${accountName(a)} on ${s.device}, started ${fmtFull(s.startedAt)}`} className={cx(ghostBtn, 'border border-edge text-danger')}><UserX size={16} aria-hidden /> End Session</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
              {!loading && sessions.length === 0 && <EmptyRow cols={6}>No active sessions.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>
      <EndSessionDialog
        key={endingId ?? 'none'}
        session={ending}
        account={endingAcct}
        onClose={() => setEndingId(null)}
        onResult={(f) => (setEndingId(null), setFlash(f))}
      />
    </>
  )
}

function EndSessionDialog({ session, account, onClose, onResult }: { session: Session | null; account?: Account; onClose: () => void; onResult: (f: Flash) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  // Keep the details visible if the session disappears while the dialog is open.
  const kept = useRef<{ session: Session; account?: Account } | null>(null)
  if (session) kept.current = { session, account }
  const k = kept.current
  if (!k) return null
  const name = k.account ? accountName(k.account) : 'this account'
  const run = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await authService.endSession(k.session.id)
      onResult({ tone: 'success', text: `Ended the ${k.session.device} session for ${name}. Their other sessions were not affected.` })
    } catch (e) {
      if (isAuthError(e) && e.code === 'SESSION_NOT_ACTIVE') return onResult({ tone: 'error', text: `${authMessage(e)} Nothing was changed.` })
      setError(authMessage(e))
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={() => !busy && onClose()} title="End this session?">
      <p className="text-[14px] leading-6 text-muted-foreground">
        End the <b className="text-foreground">{k.session.device}</b> session for <b className="text-foreground">{name}</b>{k.account && <> ({k.account.email})</>}, started {fmtFull(k.session.startedAt)}. Only this session ends; if it is open, it returns to the login screen with an explanation.
      </p>
      {error && <p role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-[13px]"><CircleAlert size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden />{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-full px-4 text-[14px] font-semibold transition-colors hover:bg-fg/[0.08] disabled:opacity-50">Cancel</button>
        <button type="button" disabled={busy} aria-busy={busy} onClick={run} className="flex h-10 items-center gap-2 rounded-full bg-danger px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-70">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {busy ? 'Ending…' : 'End Session'}
        </button>
      </div>
    </Modal>
  )
}

/* ---------- Security Policy ---------- */

function PolicyPanel() {
  const rules: [string, string][] = [
    ['Passwords', `${P.passwordMinLength}–${P.passwordMaxLength} characters for newly set passwords.`],
    ['Seeded demo credentials', 'The five seeded demo accounts keep their documented demo password until it is changed; any password set afterwards must meet the policy above.'],
    ['Login lock', `${P.loginAttemptLimit} consecutive incorrect passwords lock the account for ${P.lockDurationMs / 60_000} minutes.`],
    ['Session inactivity', `Sessions time out after ${P.sessionIdleTimeoutMs / 60_000} minutes of inactivity.`],
    ['Recovery code (OTP)', `Six digits, expires after ${P.otpTtlMs / 60_000} minutes, and allows ${P.otpMaxAttempts} incorrect attempts.`],
    ['Code resend cooldown', `${P.otpResendCooldownMs / 1000} seconds between resend requests.`],
    ['Code resend limit', `${P.otpMaxResends} resends within ${P.recoveryRequestWindowMs / 60_000} minutes.`],
    ['Recovery requests', `${P.recoveryRequestLimit} initial recovery requests per email within ${P.recoveryRequestWindowMs / 60_000} minutes.`],
    ['Recovery authorization', `${P.recoveryAuthTtlMs / 60_000} minutes to set a new password after the code is verified.`],
  ]
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <ListChecks size={18} aria-hidden />
        <h2 className="text-[16px] font-semibold">Security policy</h2>
        <Badge tone="neutral">Read-only</Badge>
      </div>
      <p className="mt-1 text-[14px] text-muted-foreground">These prototype rules are fixed and cannot be edited here. Sign-in does not use a one-time code.</p>
      <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        {rules.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-fg/[0.05] p-3">
            <dt className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"><Activity size={13} aria-hidden />{k}</dt>
            <dd className="mt-1 text-[14px]">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
