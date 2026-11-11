import assert from 'node:assert/strict'
import { comparisonTrend, precedingFailedSignIns } from '../src/auth/summaryTrends.ts'

assert.equal(comparisonTrend(5, null).label, '—')
assert.equal(comparisonTrend(5, 0).label, 'New')
assert.equal(comparisonTrend(0, 0).label, '0%')
assert.equal(comparisonTrend(3, 2, true).label, '+50%')
assert.equal(comparisonTrend(3, 2, true).tone, 'negative')
assert.equal(comparisonTrend(1, 2, true).tone, 'positive')
assert.equal(comparisonTrend(3, 2).tone, 'positive')
assert.equal(comparisonTrend(1, 2).tone, 'negative')
for (const adverse of [false, true]) {
  assert.equal(comparisonTrend(2, 2, adverse).tone, 'neutral')
  assert.equal(comparisonTrend(0, 0, adverse).direction, 'flat')
  assert.equal(comparisonTrend(3, 2, adverse).direction, 'up')
  assert.equal(comparisonTrend(1, 2, adverse).direction, 'down')
  assert.equal(comparisonTrend(3, null, adverse).tone, 'neutral')
  assert.equal(comparisonTrend(100001, 100000, adverse).label, '0%')
  assert.equal(comparisonTrend(100001, 100000, adverse).tone, 'neutral')
}
const now = 1_800_000_000_000, day = 86_400_000
const attempts = [now - 2 * day - 1, now - 2 * day, now - day - 1, now - day, now, now + 1].map(at => ({ at, result: 'Failed' }))
assert.equal(precedingFailedSignIns(attempts, now), 2)
assert.equal(precedingFailedSignIns([{ at: now - day - 1, result: 'Blocked' }], now), 0)
console.log('PASS: genuine comparison boundaries, zero baselines, missing snapshots, and metric-aware trend colors')
