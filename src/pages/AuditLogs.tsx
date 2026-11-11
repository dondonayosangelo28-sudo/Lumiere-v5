import DatePicker from '../components/DatePicker'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Eye, Search } from 'lucide-react'
import { Badge, Button, Card, Field, Input, PageHeader, cx } from '../components/ui'
import Drawer from '../components/Drawer'
import { AccessDenied } from './RoleViews'
import type { Route } from '../components/Shell'
import { EmptyRow, Pager, ResetFiltersButton, SkeletonRows, TIMEZONE, fmtFull, ghostBtn, resultTone } from '../components/AdminKit'
import { accountsVersion, subscribeAccounts } from '../auth/mockAuthService'
import { getState, type Account, type AuditEvent } from '../auth/store'
import { auditDateError, emptyAuditFilters, filterAuditEvents } from '../auth/auditFilters'

const PER = 10
// Display normalization only; stored events keep their original action strings.
const actionLabel = (a: string) => a.replace(/\b[a-z]/g, (c) => c.toUpperCase())
const typeLabel = { account: 'Account', session: 'Session', system: 'System' } as const

function performedBy(e: AuditEvent) {
  const isRole = e.actorRole === 'Unauthenticated' || e.actorRole === 'System'
  return { name: isRole ? e.actorRole : e.actor.name, email: e.actor.email }
}
function affected(e: AuditEvent) {
  if (e.target.id === 'unknown') return { main: `Unknown account: ${e.target.label}`, sub: 'No matching account existed' }
  return { main: e.target.label, sub: typeLabel[e.target.type] }
}

export default function AuditLogsPage({ account, go }: { account: Account; go: (r: Route) => void }) {
  if (account.role !== 'System Admin') return <AccessDenied go={go} />
  return <AuditBody go={go} />
}

function AuditBody({ go }: { go: (r: Route) => void }) {
  useSyncExternalStore(subscribeAccounts, accountsVersion)
  const events = getState().audit
  const [draft, setDraft] = useState({ ...emptyAuditFilters })
  const [applied, setApplied] = useState({ ...emptyAuditFilters })
  const [dateError, setDateError] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [viewingId, setViewingId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(t)
  }, [])

  const accounts = getState().accounts
  const rows = useMemo(() => filterAuditEvents(events, accounts, applied), [events, accounts, applied])

  const pages = Math.max(1, Math.ceil(rows.length / PER))
  const safePage = Math.min(page, pages)
  const shown = rows.slice((safePage - 1) * PER, safePage * PER)
  const filtered = Object.values(applied).some(Boolean)
  const reset = () => { setDraft({ ...emptyAuditFilters }); setApplied({ ...emptyAuditFilters }); setDateError(''); setPage(1) }
  const apply = () => {
    const error = auditDateError(draft)
    setDateError(error)
    if (error) return
    setApplied({ ...draft })
    setPage(1)
  }
  const viewing = viewingId ? events.find((e) => e.id === viewingId) ?? null : null

  return (
    <>
      <PageHeader onHome={() => go('overview')} crumbs={['Dashboard', 'Audit Logs']} title="Audit Logs" subtitle="A read-only record of account, access, and security activity" />
      <Card className="filter-toolbar rounded-2xl p-4 sm:p-5">
        <form noValidate onSubmit={(e) => { e.preventDefault(); apply() }}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4 [&_label]:text-xs [&_label]:font-bold">
            {([
              ['username', 'Username', 'Filter by username'],
              ['email', 'Email', 'Filter by email'],
              ['firstName', 'First Name', 'Filter by first name'],
              ['lastName', 'Last Name', 'Filter by last name'],
            ] as const).map(([key, label, placeholder]) => (
              <Field key={key} label={label}>
                <Input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={placeholder} className="border-line bg-field" />
              </Field>
            ))}
            <Field label="From Date">
              <DatePicker aria-label="From Date" value={draft.from} max={draft.to || undefined} onChange={(value) => { setDraft({ ...draft, from: value }); setDateError('') }} aria-invalid={!!dateError} aria-describedby={dateError ? 'audit-date-error' : undefined} />
            </Field>
            <Field label="To Date">
              <DatePicker aria-label="To Date" value={draft.to} min={draft.from || undefined} onChange={(value) => { setDraft({ ...draft, to: value }); setDateError('') }} aria-invalid={!!dateError} aria-describedby={dateError ? 'audit-date-error' : undefined} />
            </Field>
            <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2">
              <Button type="submit" className="h-8! rounded-full px-3! text-xs!"><Search size={14} aria-hidden /> Filter</Button>
              <ResetFiltersButton compact onClick={reset} disabled={!Object.values(draft).some(Boolean) && !filtered} />
            </div>
          </div>
          {dateError && <p id="audit-date-error" role="alert" className="mt-3 text-sm text-danger">{dateError}</p>}
        </form>
      </Card>

      <Card className="mt-4 overflow-hidden bg-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-[14px]">
            <caption className="sr-only">Audit log, newest first</caption>
            <thead className="bg-fg/[0.08] text-left">
              <tr>
                {[`Date and Time (${TIMEZONE || 'local'})`, 'Performed By', 'Actor Role', 'Action', 'Affected Record', 'Result'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3.5 font-semibold">{h}</th>)}
                <th scope="col" className="px-4 py-3.5 text-right font-semibold">View Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={7} />
              ) : (
                shown.map((e) => {
                  const by = performedBy(e)
                  const rec = affected(e)
                  return (
                    <tr key={e.id} className="transition-colors duration-150 hover:bg-fg/[0.04]">
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-muted-foreground">{fmtFull(e.at)}</td>
                      <td className="px-4"><p className="font-semibold">{by.name}</p>{by.email && <p className="break-all text-[13px] text-muted-foreground">{by.email}</p>}</td>
                      <td className="px-4">{e.actorRole ?? <span className="text-muted-foreground">Not recorded</span>}</td>
                      <td className="whitespace-nowrap px-4 font-medium">{actionLabel(e.action)}</td>
                      <td className="px-4"><p className="break-words">{rec.main}</p><p className="text-[13px] text-muted-foreground">{rec.sub}</p></td>
                      <td className="px-4"><Badge tone={resultTone(e.result)}>{e.result}</Badge></td>
                      <td className="px-4">
                        <div className="flex justify-end">
                          <button type="button" onClick={() => setViewingId(e.id)} aria-label={`View details: ${actionLabel(e.action)}, ${fmtFull(e.at)}`} className={ghostBtn}><Eye size={16} aria-hidden /> View Details</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
              {!loading && rows.length === 0 && (
                <EmptyRow cols={7}>
                  <p>{filtered ? 'No audit events match your search or filters.' : 'No audit events have been recorded yet.'}</p>
                  {filtered && <button type="button" onClick={reset} className="mt-3 rounded-full border border-edge px-3 py-1.5 text-[13px] font-semibold text-foreground hover:bg-fg/[0.08]">Reset Filters</button>}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
        {!loading && <Pager page={safePage} pages={pages} total={rows.length} per={PER} noun="events" onPage={setPage} />}
      </Card>

      <EventDrawer event={viewing} onClose={() => setViewingId(null)} />
    </>
  )
}

function EventDrawer({ event, onClose }: { event: AuditEvent | null; onClose: () => void }) {
  // Keep the last shown event while the drawer animates out.
  const [last, setLast] = useState<AuditEvent | null>(null)
  if (event && event !== last) setLast(event)
  const e = event ?? last
  const by = e && performedBy(e)
  const rec = e && affected(e)
  const empty = <span className="text-muted-foreground">(empty)</span>
  return (
    <Drawer open={!!event} onClose={onClose} title="Event Details" subtitle={e ? actionLabel(e.action) : undefined}>
      {e && by && rec && (
        <div>
          <dl className="grid grid-cols-1 gap-4 rounded-xl bg-fg/[0.05] p-4 sm:grid-cols-2">
            {([
              ['Event ID', <span key="i" className="break-all font-mono text-[13px]">{e.id}</span>],
              ['Timestamp', fmtFull(e.at)],
              ['Performed by', <>{by.name}{by.email && <span className="block break-all text-[13px] font-normal text-muted-foreground">{by.email}</span>}</>],
              ['Actor role at the time', e.actorRole ?? <span className="font-normal text-muted-foreground">Not recorded</span>],
              ['Action', actionLabel(e.action)],
              ['Result', <Badge key="r" tone={resultTone(e.result)}>{e.result}</Badge>],
              ['Affected record', <>{rec.main}<span className="block text-[13px] font-normal text-muted-foreground">{rec.sub}</span></>],
            ] as [string, React.ReactNode][]).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 break-words font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mb-1.5 mt-6 text-[14px] font-semibold">Description</h3>
          <p className="text-[14px] leading-6">{e.description}</p>
          <h3 className="mb-2 mt-6 text-[14px] font-semibold">Changed fields</h3>
          {e.changes?.length ? (
            <div className="overflow-x-auto rounded-xl border border-edge">
              <table className="w-full text-[13px]">
                <thead className="bg-fg/[0.08] text-left"><tr><th scope="col" className="px-3 py-2 font-semibold">Field</th><th scope="col" className="px-3 py-2 font-semibold">Previous</th><th scope="col" className="px-3 py-2 font-semibold">New</th></tr></thead>
                <tbody>
                  {e.changes.map((c, i) => (
                    <tr key={i} className={cx(i > 0 && 'border-t border-edge')}>
                      <th scope="row" className="px-3 py-2 text-left font-semibold">{c.field}</th>
                      <td className="break-all px-3 py-2">{c.from || empty}</td>
                      <td className="break-all px-3 py-2">{c.to || empty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[14px] text-muted-foreground">No field changes were recorded for this event.</p>
          )}
        </div>
      )}
    </Drawer>
  )
}
