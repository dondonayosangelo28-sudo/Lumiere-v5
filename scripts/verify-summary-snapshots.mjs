import assert from 'node:assert/strict'
import { sampleSummaryHistory, summarySnapshot24hAgo, SUMMARY_SAMPLE_MS } from '../src/auth/summarySnapshots.ts'
import { comparisonTrend } from '../src/auth/summaryTrends.ts'

const now = 1_800_000_000_000, day = 86_400_000
const counts = { totalUsers: 10, activeSessions: 2, lockedAccounts: 1 }
const initial = sampleSummaryHistory([], counts, now)
assert.equal(summarySnapshot24hAgo(initial, now), null)
assert.equal(sampleSummaryHistory(initial, counts, now + SUMMARY_SAMPLE_MS - 1), initial)
assert.equal(sampleSummaryHistory(initial, counts, now + SUMMARY_SAMPLE_MS).length, 2)
assert.deepEqual(summarySnapshot24hAgo(initial, now + day), initial[0])
assert.equal(summarySnapshot24hAgo(initial, now + day - 1), null)
assert.deepEqual(summarySnapshot24hAgo(initial, now + day + SUMMARY_SAMPLE_MS), initial[0])
assert.equal(summarySnapshot24hAgo(initial, now + day + SUMMARY_SAMPLE_MS + 1), null)
assert.equal(summarySnapshot24hAgo([{ ...counts, at: now + 1 }], now + day), null)
assert.equal(summarySnapshot24hAgo([{ ...counts, totalUsers: -1, at: now }], now + day), null)
const restored = JSON.parse(JSON.stringify(initial))
assert.deepEqual(summarySnapshot24hAgo(restored, now + day), initial[0])
assert.equal(comparisonTrend(15, restored[0].totalUsers).label, '+50%')
assert.equal(comparisonTrend(5, 0).label, 'New')
assert.equal(comparisonTrend(0, 0).label, '0%')
assert.equal(comparisonTrend(2, 1, true).tone, 'negative')
assert.equal(comparisonTrend(0, 1, true).tone, 'positive')
assert.equal(sampleSummaryHistory(initial, counts, now + 2 * day + 1).length, 1)
console.log('PASS: sampling cadence, 24h eligibility, missing/stale/future history, persistence, retention, zero baselines, and trend colors')
