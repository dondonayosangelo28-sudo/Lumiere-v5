import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context) } catch (error) {
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(`${specifier}.ts`, context)
    throw error
  }
} })
const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }
}
globalThis.localStorage = storage()
globalThis.sessionStorage = storage()

const { seedAdditionalDemoUsers, seedRoleRankingDemo, seedSummaryDemo } = await import('../src/dashboard/seedSummaryDemo.ts')
const { seedActivityHistoryDemo } = await import('../src/dashboard/seedActivityHistoryDemo.ts')
const { getState, DEMO_PASSWORD } = await import('../src/auth/store.ts')
const { signIn, currentSession } = await import('../src/auth/session.ts')
const { adminSummary, usersByRole, timeBuckets, countByBucket, signInSeries } = await import('../src/dashboard/dashboardMetrics.ts')

const initialCount = getState().accounts.length
assert.equal(initialCount, 8)
assert.equal((await signIn({ email: 'admin@demo.com', password: DEMO_PASSWORD, remember: false })).ok, true)
const sessionId = currentSession().id

// Disabled synthetic-account seeders must NOT recreate any synthetic accounts
seedSummaryDemo()
seedAdditionalDemoUsers()
seedRoleRankingDemo()
assert.equal(getState().accounts.length, 8)
assert.equal(currentSession().id, sessionId)

// Charts operate over actual 8 accounts (4 Ground Crew, 1 Event Manager, 1 Warehouse, 1 Executive; Admin excluded from chart roles)
const summary = adminSummary(getState(), Date.now())
assert.equal(summary.totalUsers, 8)
const ranked = usersByRole(getState().accounts).sort((a, b) => b.count - a.count)
assert.equal(ranked[0].role, 'Ground Crew')
assert.equal(ranked[0].count, 4)

// Activity history chart seeding still populates 30-day history without adding accounts
const attemptsBefore = getState().loginAttempts.length
seedActivityHistoryDemo()
assert.equal(getState().accounts.length, 8)
assert.ok(getState().loginAttempts.length > attemptsBefore)
const fixtures = getState().loginAttempts.filter(attempt => attempt.email === 'activity-history-demo@example.test')
assert.equal(new Set(fixtures.map(attempt => attempt.result)).size, 3)
assert.ok(fixtures.every(attempt => attempt.at < Date.now() - 48 * 3_600_000))
const historyLength = getState().loginAttempts.length
seedActivityHistoryDemo()
assert.equal(getState().loginAttempts.length, historyLength)
const monthBuckets = timeBuckets(Date.now(), 'day', 30)
const monthAudit = countByBucket(getState().audit, monthBuckets, Date.now())
const monthSignIns = signInSeries(getState().loginAttempts, monthBuckets, Date.now())
assert.ok(monthAudit.filter(count => count > 0).length > 20)
assert.ok(monthAudit.some(count => count === 0))
for (const result of ['Success', 'Failed', 'Blocked']) assert.ok(monthSignIns[result].reduce((sum, count) => sum + count, 0) > 0)
console.log('PASS: synthetic account seeders disabled, charts reflect actual 8 accounts, and activity history preserved')
