import Dropdown from '../components/Dropdown'
import { useEffect, useId, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from 'react'
import { BriefcaseBusiness, CalendarDays, HardHat, Warehouse, ChevronDown, History, MonitorSmartphone, ShieldAlert, TriangleAlert, Users } from 'lucide-react'
import { Card, cx } from '../components/ui'
import StatCards from '../components/StatCards'
import type { StatCardData } from '../components/StatCards/types'
import { comparisonTrend, precedingFailedSignIns } from '../auth/summaryTrends'
import { seedAdditionalDemoUsers, seedRoleRankingDemo, seedSummaryDemo } from '../auth/seedSummaryDemo'
import { seedActivityHistoryDemo } from '../auth/seedActivityHistoryDemo'
import { sampleSummaryHistory, summarySnapshot24hAgo } from '../auth/summarySnapshots'
import { snapshotComparisonTrend } from '../auth/summaryComparisonPreview'
import { useNow } from '../components/AdminKit'
import { currentSession } from '../auth/session'
import type { AdminNavigation } from '../components/adminNavigation'
import { accountsVersion, subscribeAccounts } from '../auth/mockAuthService'
import { prototypeStorageLimits } from '../auth/prototypeStorageLimits'
import { getState, update, type AttemptResult } from '../auth/store'
import {
  DASHBOARD_TIME_ZONE, DASHBOARD_TIME_ZONE_LABEL, SIGN_IN_RESULTS, adminSummary, countByBucket, historyCoverage, signInSeries, timeBuckets, rollingSignInBuckets, usersByRole, type TimeBucket,
} from '../auth/dashboardMetrics'

type Open = (nav: AdminNavigation) => void

/** Re-renders whenever the shared prototype store changes, including from other tabs. */
function useStoreState() {
  useSyncExternalStore(subscribeAccounts, accountsVersion)
  return getState()
}

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`
const coverageDate = new Intl.DateTimeFormat('en-US', { timeZone: DASHBOARD_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/* ---------- Summary cards ---------- */

export function AdminSummaryCards({ onOpen }: { onOpen: Open }) {
  useEffect(() => { seedSummaryDemo(); seedAdditionalDemoUsers(); seedRoleRankingDemo(); seedActivityHistoryDemo() }, [])
  const state = useStoreState()
  // Ticks every second so sessions and locks drop out as soon as they expire.
  const now = useNow(1000)
  const summary = adminSummary(state, now)
  useEffect(() => {
    const current = getState()
    const sampledAt = Date.now()
    const history = current.summaryHistory ?? []
    const next = sampleSummaryHistory(history, adminSummary(current, sampledAt), sampledAt)
    if (next !== history) update((draft) => { draft.summaryHistory = next })
  }, [now])
  const previous = summarySnapshot24hAgo(state.summaryHistory ?? [], now)
  const comparisonCoverage = historyCoverage(state.loginAttempts, prototypeStorageLimits.loginAttempts, now - 2 * 86_400_000)
  const failedTrend = comparisonTrend(summary.failedSignIns24h, comparisonCoverage.incomplete ? null : precedingFailedSignIns(state.loginAttempts, now), true)
  const cards: StatCardData[] = [
    { id: 'total-users', title: 'Total Users', value: summary.totalUsers, icon: Users, trend: snapshotComparisonTrend('totalUsers', summary.totalUsers, previous) },
    { id: 'active-sessions', title: 'Active Sessions', value: summary.activeSessions, icon: MonitorSmartphone, trend: snapshotComparisonTrend('activeSessions', summary.activeSessions, previous) },
    { id: 'failed-sign-ins', title: 'Failed Sign-ins · 24h', value: summary.failedSignIns24h, icon: TriangleAlert, trend: failedTrend },
    { id: 'locked-accounts', title: 'Locked Accounts', value: summary.lockedAccounts, icon: ShieldAlert, trend: snapshotComparisonTrend('lockedAccounts', summary.lockedAccounts, previous) },
  ]
  return (
    <StatCards key={currentSession()?.accountId ?? 'signed-out'} userId={currentSession()?.accountId ?? 0} data={cards} gridCols="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" gap="gap-4" />
  )
}

/* ---------- Shared chart pieces ---------- */

function CardHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold text-foreground">{title}</h3>
        <p className="text-[14px] text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function RangeSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return (
    <span className="relative flex shrink-0 items-center text-xs text-muted-foreground">
      <Dropdown aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)} className="cursor-pointer appearance-none bg-transparent pr-4 outline-none focus-visible:underline">
        {options.map((option) => <option key={option} value={option} className="bg-card">{option}</option>)}
      </Dropdown>
      <ChevronDown size={12} aria-hidden className="pointer-events-none absolute right-0" />
    </span>
  )
}

function CoverageNote({ coverage, limit, noun }: { coverage: ReturnType<typeof historyCoverage>; limit: number; noun: string }) {
  if (!coverage.incomplete || coverage.oldest === null) return null
  return (
    <p className="mt-3 flex gap-1.5 text-[11px] leading-4 text-muted-foreground">
      <History size={12} aria-hidden className="mt-0.5 shrink-0" />
      Only the most recent {limit.toLocaleString()} {noun} are kept in this browser, so intervals before {coverageDate.format(coverage.oldest)} {DASHBOARD_TIME_ZONE_LABEL} may be incomplete.
    </p>
  )
}

type Series = { label: string; values: number[]; color: string }

function smoothPath(points: (readonly [number, number])[]) {
  // Horizontal tangents at each point keep the curve between neighboring values (no dips below zero).
  return points.reduce((path, [x, y], index) => {
    if (index === 0) return `M${x},${y}`
    const [px, py] = points[index - 1]
    const mid = px + (x - px) / 2
    return `${path} C${mid},${py} ${mid},${y} ${x},${y}`
  }, '')
}

function monotonePath(points: (readonly [number, number])[]) {
  if (points.length < 2) return smoothPath(points)
  const slopes = points.slice(1).map(([x, y], i) => (y - points[i][1]) / (x - points[i][0]))
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0]
    if (i === points.length - 1) return slopes[i - 1]
    const a = slopes[i - 1], b = slopes[i]
    return a * b <= 0 ? 0 : 2 * a * b / (a + b)
  })
  return points.reduce((path, [x, y], i) => {
    if (!i) return `M${x},${y}`
    const [px, py] = points[i - 1]
    const dx = (x - px) / 3
    return `${path} C${px + dx},${py + tangents[i - 1] * dx} ${x - dx},${y - tangents[i] * dx} ${x},${y}`
  }, '')
}

function TimeChart({ buckets, series, variant, title, emptyMessage, height = 'h-40', stretch = false }: { buckets: TimeBucket[]; series: Series[]; variant: 'area' | 'stacked-bars' | 'total-area'; title: string; emptyMessage: string; height?: 'h-40' | 'h-56' | 'h-64' | 'h-64 xl:h-84' | 'h-96'; stretch?: boolean }) {
  const totalArea = variant === 'total-area'
  const area = variant === 'area' || totalArea
  const bars = variant === 'stacked-bars'
  const gradient = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = totalArea ? 300 : 320
  const H = totalArea ? 180 : 160
  const count = buckets.length
  const totals = buckets.map((_, index) => series.reduce((sum, s) => sum + s.values[index], 0))
  const plottedSeries = totalArea ? [{ label: 'Total attempts', values: totals, color: 'text-muted-foreground' }] : series
  const max = Math.max(0, ...(bars || totalArea ? totals : series.flatMap((s) => s.values)))
  const band = W / count
  const target = Math.max(1, max * 1.2)
  const magnitude = 10 ** Math.floor(Math.log10(target / 5))
  const niceStep = Math.max(1, Math.ceil(
    ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= target / 5) ?? 10) * magnitude,
  ))
  const step = area ? niceStep : Math.max(1, Math.ceil(max / 4))
  const intervals = area ? Math.ceil(target / step) : 4
  const top = step * intervals
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => (intervals - index) * step)
  const x = (index: number) => (bars ? (index + 0.5) * band : count === 1 ? W / 2 : (index / (count - 1)) * W)
  const y = (value: number) => H - (value / top) * H
  const labelEvery = Math.ceil(count / 6)
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left) / box.width
    setHover(Math.max(0, Math.min(count - 1, bars ? Math.floor(ratio * count) : Math.round(ratio * (count - 1)))))
  }
  const hoverPct = hover === null ? 0 : (x(hover) / W) * 100
  return (
    <div className={cx('mt-4 flex gap-2', totalArea && 'px-2 pt-2', stretch && 'xl:min-h-0 xl:flex-1')}>
      <div aria-hidden className={cx('flex flex-col justify-between text-right text-[10px] leading-none tabular-nums text-muted-foreground', totalArea && 'w-7 shrink-0 text-[11px] font-normal text-[#858585]', height, stretch && 'xl:mb-5 xl:h-auto xl:self-stretch')}>
        {ticks.map((tick) => <span key={tick}>{tick}</span>)}
      </div>
      <div className={cx('relative min-w-0 flex-1', stretch && 'xl:flex xl:min-h-0 xl:flex-col')}>
        <div className={stretch ? cx('relative', height, 'xl:h-auto xl:min-h-0 xl:flex-1') : 'contents'}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cx('w-full touch-pan-y overflow-visible', stretch ? 'absolute inset-0 h-full' : height)} aria-hidden onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)}>
          {!totalArea && (area ? ticks.slice(0, -1).map((tick) => 1 - tick / top) : [0, 0.25, 0.5, 0.75]).map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="stroke-line" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
          {totalArea && <g stroke="#454545" strokeWidth="1" vectorEffect="non-scaling-stroke">
            <path d={`M0,0 V${H} H${W}`} fill="none" vectorEffect="non-scaling-stroke" />
            {ticks.map((tick) => <line key={tick} x1="-4" x2="0" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
            {buckets.map((bucket, i) => i === count - 1 || (i % labelEvery === 0 && count - 1 - i >= labelEvery / 2) ? <line key={bucket.start} x1={x(i)} x2={x(i)} y1={H} y2={H + 3} vectorEffect="non-scaling-stroke" /> : null)}
          </g>}
          {!totalArea && <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" vectorEffect="non-scaling-stroke" />}
          {bars && hover !== null && <rect x={hover * band} width={band} y="0" height={H} className="fill-fg/[0.06]" />}
          {bars && buckets.map((bucket, index) => {
            let base = H
            return (
              <g key={bucket.start}>
                {series.map((s) => {
                  const barHeight = (s.values[index] / top) * H
                  base -= barHeight
                  return barHeight > 0 ? <rect key={s.label} x={x(index) - band * 0.32} width={band * 0.64} y={base} height={barHeight} fill="currentColor" className={s.color} /> : null
                })}
              </g>
            )
          })}
          {area && plottedSeries.map((s, seriesIndex) => {
            const d = (totalArea ? monotonePath : smoothPath)(s.values.map((v, i) => [x(i), y(v)] as const))
            const gradientId = `${gradient}-${seriesIndex}`
            return (
              <g key={s.label} className={s.color}>
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={totalArea ? '#aebbc8' : 'currentColor'} stopOpacity={totalArea ? '0.5' : '0.28'} />
                    <stop offset="100%" stopColor={totalArea ? '#aebbc8' : 'currentColor'} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={`${d} L${x(count - 1)},${H} L${x(0)},${H} Z`} fill={`url(#${gradientId})`} />
                <path d={d} fill="none" stroke={totalArea ? '#b8c5d0' : 'currentColor'} strokeWidth={totalArea ? 1.5 : 2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {totalArea && hover !== null && <circle cx={x(hover)} cy={y(s.values[hover])} r="3" fill="#b8c5d0" />}
              </g>
            )
          })}
          {area && hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} className="stroke-fg/30" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover !== null && (
          <div aria-hidden className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border border-line bg-card px-2 py-1.5 text-[11px] shadow-lg" style={{ left: `${hoverPct}%`, transform: `translateX(-${hoverPct}%)` }}>
            <p className="mb-0.5 font-semibold text-foreground">{buckets[hover].fullLabel}</p>
            {totalArea && <p className="font-semibold text-foreground">{totals[hover].toLocaleString()} {totals[hover] === 1 ? 'attempt' : 'attempts'}</p>}
            {series.map((s) => (
              <p key={s.label} className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cx('size-2 rounded-full bg-current', s.color)} />
                <span className="text-foreground">{s.label}:</span> <span className="font-semibold tabular-nums text-foreground">{s.values[hover]}</span>
              </p>
            ))}
          </div>
        )}
        {max === 0 && (
          <div className={cx('pointer-events-none absolute inset-x-0 top-0 grid place-items-center', stretch ? 'h-full' : height)}>
            <p className="rounded-md bg-card/90 px-3 py-1.5 text-[13px] text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
        </div>
        <div aria-hidden className={cx('relative mt-1 h-4 shrink-0 text-[10px] text-muted-foreground', totalArea && 'mt-2 text-[11px] font-normal text-[#858585]')}>
          {buckets.map((bucket, index) => index === count - 1 || (index % labelEvery === 0 && count - 1 - index >= labelEvery / 2) ? (
            <span key={bucket.start} className="absolute whitespace-nowrap" style={{ left: `${(x(index) / W) * 100}%`, transform: `translateX(-${(x(index) / W) * 100}%)` }}>{bucket.label}</span>
          ) : null)}
        </div>
        <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead><tr><th scope="col">Interval ({DASHBOARD_TIME_ZONE_LABEL})</th>{totalArea && <th scope="col">Total attempts</th>}{series.map((s) => <th key={s.label} scope="col">{s.label}</th>)}</tr></thead>
          <tbody>{buckets.map((bucket, index) => <tr key={bucket.start}><th scope="row">{bucket.fullLabel}</th>{totalArea && <td>{totals[index]}</td>}{series.map((s) => <td key={s.label}>{s.values[index]}</td>)}</tr>)}</tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

/* ---------- Sign-in Activity ---------- */

const SIGN_IN_RANGES = { 'Last 24 Hours': { unit: 'hour', count: 24 }, 'Last 30 Days': { unit: 'day', count: 30 } } as const
type SignInRange = keyof typeof SIGN_IN_RANGES
const RESULT_STYLE: Record<AttemptResult, { label: string; color: string }> = {
  Success: { label: 'Successful', color: 'text-emerald-500' },
  Failed: { label: 'Failed', color: 'text-red-500' },
  Blocked: { label: 'Blocked', color: 'text-amber-500' },
}

export function SignInActivity() {
  const state = useStoreState()
  const now = useNow(30_000)
  const [range, setRange] = useState<SignInRange>('Last 24 Hours')
  const { unit, count } = SIGN_IN_RANGES[range]
  const buckets = range === 'Last 24 Hours' ? rollingSignInBuckets(now) : timeBuckets(now, unit, count)
  const counts = signInSeries(state.loginAttempts, buckets, now)
  const series = SIGN_IN_RESULTS.map((result) => ({ label: RESULT_STYLE[result].label, values: counts[result], color: RESULT_STYLE[result].color }))
  const coverage = historyCoverage(state.loginAttempts, prototypeStorageLimits.loginAttempts, buckets[0].start)
  return (
    <Card className="p-4">
      <CardHeader title="Sign-in Activity" subtitle={`Total attempts per ${unit}`}>
        <RangeSelect label="Sign-in activity range" value={range} options={Object.keys(SIGN_IN_RANGES) as SignInRange[]} onChange={setRange} />
      </CardHeader>
      <TimeChart variant="total-area" height="h-64 xl:h-84" buckets={buckets} series={series} title={`Sign-in attempts, ${range.toLowerCase()}`} emptyMessage={`No sign-in attempts in the ${range.toLowerCase()}`} />
      <dl className="mt-5 grid grid-cols-3 border-t border-line pt-4 text-center">
        {series.map((s) => (
          <div key={s.label}>
            <dd className="font-bold tabular-nums text-foreground">{s.values.reduce((sum, v) => sum + v, 0).toLocaleString()}</dd>
            <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>
      <CoverageNote coverage={coverage} limit={prototypeStorageLimits.loginAttempts} noun="sign-in attempts" />
    </Card>
  )
}

/* ---------- Audit Activity ---------- */

const AUDIT_RANGES = { 'Last 7 Days': 7, 'Last 30 Days': 30 } as const
type AuditRange = keyof typeof AUDIT_RANGES

export function AuditActivity() {
  const state = useStoreState()
  const now = useNow(30_000)
  const [range, setRange] = useState<AuditRange>('Last 7 Days')
  const buckets = timeBuckets(now, 'day', AUDIT_RANGES[range])
  const values = countByBucket(state.audit, buckets, now)
  const total = values.reduce((sum, v) => sum + v, 0)
  const coverage = historyCoverage(state.audit, prototypeStorageLimits.auditEvents, buckets[0].start)
  return (
    <Card className="flex flex-col p-4 xl:min-h-0 xl:flex-1">
      <CardHeader title="Audit Activity" subtitle="Recorded audit events per day">
        <RangeSelect label="Audit activity range" value={range} options={Object.keys(AUDIT_RANGES) as AuditRange[]} onChange={setRange} />
      </CardHeader>
      <TimeChart variant="area" height="h-56" stretch buckets={buckets} series={[{ label: 'Audit events', values, color: 'text-blue-500' }]} title={`Audit events per day, ${range.toLowerCase()}`} emptyMessage={`No audit events in the ${range.toLowerCase()}`} />
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-line pt-4 text-center">
        <p className="text-[13px] text-muted-foreground"><span className="font-bold tabular-nums text-foreground">{total.toLocaleString()}</span> {total === 1 ? 'event' : 'events'} in the {range.toLowerCase()}</p>
      </div>
      <CoverageNote coverage={coverage} limit={prototypeStorageLimits.auditEvents} noun="audit events" />
    </Card>
  )
}

/* ---------- Users by Role ---------- */

const ROLE_PRESENTATION = {
  Executive: { label: 'Executive', icon: BriefcaseBusiness },
  'Event Manager': { label: 'Event Manager', icon: CalendarDays },
  'Warehouse Operations Manager': { label: 'Warehouse Operations Manager', icon: Warehouse },
  'Ground Crew': { label: 'Ground Crew', icon: HardHat },
}
const rolePercentage = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`

export function UsersByRole() {
  const state = useStoreState()
  const rows = usersByRole(state.accounts)
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const leaders = rows.filter((row) => row.largest)
  const peak = Math.max(0, ...rows.map((row) => row.percentage))
  const gridInterval = Math.max(10, peak) / 4
  const gridIntervals = 5
  const scale = gridInterval * gridIntervals
  const [active, setActive] = useState<string | null>(null)
  const tooltipId = useId()
  const selected = rows.find((row) => row.role === active)
  return (
    <Card className="p-4">
      <CardHeader title="Users by Role" subtitle="Current user distribution" />
      <div className="relative mt-5">
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-0 h-64 w-full xl:h-44">
          {Array.from({ length: gridIntervals }, (_, index) => index / gridIntervals * 100).map((position) => <line key={`h-${position}`} x1="0" x2="100" y1={position} y2={position} className="stroke-foreground/15" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
          {[12.5, 37.5, 62.5, 87.5].map((position) => <line key={`v-${position}`} x1={position} x2={position} y1="0" y2="100" className="stroke-foreground/15" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
        </svg>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-64 border-b border-line xl:top-44" />
        <div className="relative mx-auto grid w-full max-w-64 grid-cols-4 gap-6 sm:max-w-72 sm:gap-8">
          {rows.map((row) => {
            const { label, icon: Icon } = ROLE_PRESENTATION[row.role]
            return (
              <div key={row.role} tabIndex={0} role="img"
                className="group flex min-w-0 cursor-default flex-col items-center outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
                aria-label={`${row.role}: ${plural(row.count, 'user')}, ${rolePercentage(row.percentage)}.`}
                aria-describedby={active === row.role ? tooltipId : undefined}
                onPointerEnter={(event) => { if (event.pointerType !== 'touch') setActive(row.role) }}
                onPointerLeave={(event) => { if (event.pointerType !== 'touch') setActive(null) }}
                onFocus={() => setActive(row.role)} onBlur={() => setActive(null)}
                onPointerDown={() => setActive(row.role)}
                onKeyDown={(event) => { if (event.key === 'Escape') setActive(null) }}
              >
                <span aria-hidden className="relative block h-64 w-10 max-w-full sm:w-12 xl:h-44">
                  <span className={cx('absolute inset-x-0 bottom-0 flex items-center justify-center rounded-t-md transition-[height,opacity] duration-300 group-hover:opacity-80 motion-reduce:transition-none', row.largest ? 'bg-[#b8c2d0]' : 'bg-[#6e747d]')} style={{ height: `${row.percentage / scale * 100}%` }}>
                    <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap text-xs font-bold tabular-nums text-foreground sm:text-sm">{rolePercentage(row.percentage)}</span>
                  </span>
                </span>
                <Icon className="mt-3 size-5 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden />
                <span aria-hidden className="mt-2 w-[calc(100%+1.5rem)] whitespace-normal break-normal text-center text-[11px] font-medium leading-4 text-foreground sm:text-xs">{label}</span>
              </div>
            )
          })}
        </div>
        {selected && <div id={tooltipId} role="tooltip" className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto w-fit max-w-full rounded-md border border-line bg-card px-3 py-2 text-center text-xs text-foreground shadow-lg">
          <p className="font-semibold">{selected.role}</p>
          <p>{plural(selected.count, 'user')} · {rolePercentage(selected.percentage)}</p>
        </div>}
      </div>
      <p className="mt-4 border-t border-line pt-3 text-sm leading-5 text-muted-foreground">
        {total === 0 ? 'No users in these roles yet.' : leaders.length === 4
          ? `All four roles share the largest share at ${rolePercentage(leaders[0].percentage)} each.`
          : leaders.length > 1
            ? `${leaders.map((row) => row.role).join(' and ')} tie for the largest share at ${rolePercentage(leaders[0].percentage)} each.`
            : `${leaders[0].role} has the largest share: ${rolePercentage(leaders[0].percentage)} of users across these four roles.`}
      </p>
    </Card>
  )
}
