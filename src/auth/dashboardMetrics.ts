/*
 * Shared read-only selectors for the System Admin dashboard, Users, and Security.
 * They read the existing browser-storage prototype store and never create records.
 */
import { liveSessions } from './session'
import { ROLES, lockInfo, type Account, type AttemptResult, type DemoState, type LifecycleStatus, type LoginAttempt, type LoginLock, type Role } from './store'

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

/** Security counts a failed sign-in for 24 hours after it happens. */
export const FAILED_SIGN_IN_WINDOW_MS = DAY
export const isWithinFailedSignInWindow = (attempt: Pick<LoginAttempt, 'at'>, now: number) => attempt.at >= now - FAILED_SIGN_IN_WINDOW_MS && attempt.at <= now
export const isRecentFailedSignIn = (attempt: LoginAttempt, now: number) => attempt.result === 'Failed' && isWithinFailedSignInWindow(attempt, now)
export const countRecentFailedSignIns = (attempts: readonly LoginAttempt[], now: number) => attempts.filter((attempt) => isRecentFailedSignIn(attempt, now)).length

export const nonDeletedAccounts = (accounts: readonly Account[]) => accounts.filter((account) => !account.deletedAt)

/** Non-deleted accounts whose temporary login lock has not expired, newest lock expiry first. */
export function lockedAccountRows(state: Readonly<DemoState>, now: number): { lock: LoginLock; acct: Account }[] {
  return state.locks
    .map((lock) => ({ lock, acct: state.accounts.find((account) => account.id === lock.accountId) }))
    .filter((row): row is { lock: LoginLock; acct: Account } => !!row.acct && !row.acct.deletedAt && lockInfo(row.acct.id, now).locked)
    .sort((a, b) => b.lock.lockedUntil! - a.lock.lockedUntil!)
}

export function adminSummary(state: Readonly<DemoState>, now: number) {
  return {
    totalUsers: nonDeletedAccounts(state.accounts).length,
    activeSessions: liveSessions(now).length,
    failedSignIns24h: countRecentFailedSignIns(state.loginAttempts, now),
    lockedAccounts: lockedAccountRows(state, now).length,
  }
}

/* ---------- Role and status breakdown ---------- */

export const CHART_ROLES = ROLES.filter((role): role is Exclude<Role, 'System Admin'> => role !== 'System Admin')
export const CHART_STATUSES: LifecycleStatus[] = ['Active', 'Pending Activation', 'Inactive']

export function usersByRoleAndStatus(accounts: readonly Account[]) {
  const users = nonDeletedAccounts(accounts)
  return CHART_ROLES.map((role) => {
    const counts = Object.fromEntries(CHART_STATUSES.map((status) => [status, users.filter((account) => account.role === role && account.status === status).length])) as Record<LifecycleStatus, number>
    return { role, counts, total: CHART_STATUSES.reduce((sum, status) => sum + counts[status], 0) }
  })
}

/** Current distribution across the four non-admin roles, including every lifecycle status. */
export function usersByRole(accounts: readonly Account[]) {
  const counts = usersByRoleAndStatus(accounts)
  const total = counts.reduce((sum, row) => sum + row.total, 0)
  const peak = Math.max(0, ...counts.map((row) => row.total))
  return counts.map((row) => ({
    role: row.role,
    count: row.total,
    percentage: total ? row.total / total * 100 : 0,
    largest: total > 0 && row.total === peak,
  }))
}

/* ---------- GMT+8 time buckets ---------- */

export const DASHBOARD_TIME_ZONE = 'Asia/Manila'
export const DASHBOARD_TIME_ZONE_LABEL = 'GMT+8'
const GMT8_OFFSET = 8 * HOUR

export interface TimeBucket {
  start: number
  end: number
  label: string
  fullLabel: string
}

const hourLabel = new Intl.DateTimeFormat('en-US', { timeZone: DASHBOARD_TIME_ZONE, hour: 'numeric' })
const dayLabel = new Intl.DateTimeFormat('en-US', { timeZone: DASHBOARD_TIME_ZONE, month: 'short', day: 'numeric' })
const fullHourLabel = new Intl.DateTimeFormat('en-US', { timeZone: DASHBOARD_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fullDayLabel = new Intl.DateTimeFormat('en-US', { timeZone: DASHBOARD_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

/** Consecutive GMT+8 intervals ending with the one containing `now`; every interval is present, including empty ones. */
export function timeBuckets(now: number, unit: 'hour' | 'day', count: number): TimeBucket[] {
  const size = unit === 'hour' ? HOUR : DAY
  const current = Math.floor((now + GMT8_OFFSET) / size) * size - GMT8_OFFSET
  return Array.from({ length: count }, (_, index) => {
    const start = current - (count - 1 - index) * size
    const end = start + size
    return unit === 'hour'
      ? { start, end, label: hourLabel.format(start), fullLabel: `${fullHourLabel.format(start)} – ${hourLabel.format(end)} ${DASHBOARD_TIME_ZONE_LABEL}` }
      : { start, end, label: dayLabel.format(start), fullLabel: `${fullDayLabel.format(start)} ${DASHBOARD_TIME_ZONE_LABEL}` }
  })
}

/** Index of the bucket containing `at`, or -1 outside the range or in the future. */
export function bucketIndex(buckets: readonly TimeBucket[], at: number, now: number) {
  if (at > now) return -1
  return buckets.findIndex((bucket, index) => at >= bucket.start && (at < bucket.end || (index === buckets.length - 1 && at === bucket.end)))
}

/** Exact rolling day, split at Manila hour boundaries with partial end buckets. */
export function rollingSignInBuckets(now: number): TimeBucket[] {
  const start = now - FAILED_SIGN_IN_WINDOW_MS
  return timeBuckets(now, 'hour', 25)
    .filter((bucket) => bucket.end > start && bucket.start <= now)
    .map((bucket) => ({ ...bucket, start: Math.max(start, bucket.start), end: Math.min(now, bucket.end) }))
}

export function countByBucket<T extends { at: number }>(records: readonly T[], buckets: readonly TimeBucket[], now: number) {
  const counts = buckets.map(() => 0)
  for (const record of records) {
    const index = bucketIndex(buckets, record.at, now)
    if (index >= 0) counts[index]++
  }
  return counts
}

export const SIGN_IN_RESULTS: AttemptResult[] = ['Success', 'Failed', 'Blocked']

export function signInSeries(attempts: readonly LoginAttempt[], buckets: readonly TimeBucket[], now: number) {
  return Object.fromEntries(SIGN_IN_RESULTS.map((result) => [result, countByBucket(attempts.filter((attempt) => attempt.result === result), buckets, now)])) as Record<AttemptResult, number[]>
}

/**
 * The prototype keeps a capped number of records. When the cap is reached and the oldest kept
 * record is newer than the requested range, earlier intervals may be missing data.
 */
export function historyCoverage(records: readonly { at: number }[], limit: number, rangeStart: number) {
  const oldest = records.reduce((min, record) => Math.min(min, record.at), Infinity)
  const truncated = records.length >= limit
  return { truncated, oldest: Number.isFinite(oldest) ? oldest : null, incomplete: truncated && oldest > rangeStart }
}
