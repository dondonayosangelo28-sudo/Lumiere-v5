import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context) } catch (error) { if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(`${specifier}.ts`, context); throw error } } })
const { rollingSignInBuckets, signInSeries, countRecentFailedSignIns, isWithinFailedSignInWindow } = await import('../src/auth/dashboardMetrics.ts')
const { dayStart, dayEnd, fmtFull } = await import('../src/auth/manilaTime.ts')
const { filterAuditEvents, emptyAuditFilters } = await import('../src/auth/auditFilters.ts')
for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
  process.env.TZ = zone
  assert.equal(dayStart('2027-01-02'), Date.parse('2027-01-01T16:00:00Z'))
  assert.equal(dayEnd('2027-01-02'), Date.parse('2027-01-02T15:59:59.999Z'))
  assert.match(fmtFull(Date.parse('2027-01-01T16:00:00Z')), /Jan 2, 2027.*12:00:00 AM GMT\+8/)
  const start = dayStart('2027-01-02'), end = dayEnd('2027-01-02')
  const events = [start - 1, start, end, end + 1].map(at => ({ at, actor: { name: 'Test' } }))
  assert.deepEqual(filterAuditEvents(events, [], { ...emptyAuditFilters, from: '2027-01-02', to: '2027-01-02' }).map(e => e.at), [end, start])
  for (const now of [Date.parse('2027-01-02T10:32:00Z'), Date.parse('2027-01-02T10:00:00Z')]) {
    const lower = now - 86400000
    const attempts = [lower - 1, lower, lower + 1, now - 1, now, now + 1].map(at => ({ at, result: 'Failed' }))
    assert.deepEqual(attempts.map(a => isWithinFailedSignInWindow(a, now)), [false, true, true, true, true, false])
    const buckets = rollingSignInBuckets(now)
    assert.equal(buckets[0].start, lower)
    assert.equal(buckets.at(-1).end, now)
    assert.equal(signInSeries(attempts, buckets, now).Failed.reduce((a,b) => a+b, 0), 4)
    assert.equal(countRecentFailedSignIns(attempts, now), 4)
  }
}
console.log('PASS: rolling-window boundaries, chart/card parity, Manila date bounds and formatting across browser timezones')
