import assert from 'node:assert/strict'
import { SUMMARY_COMPARISON_PREVIEW, snapshotComparisonTrend } from '../src/auth/summaryComparisonPreview.ts'

const config = SUMMARY_COMPARISON_PREVIEW
assert.equal(snapshotComparisonTrend('totalUsers', 8, null).label, '+60%')
assert.equal(snapshotComparisonTrend('activeSessions', 3, null).label, '+50%')
assert.equal(snapshotComparisonTrend('lockedAccounts', 1, null).label, '-50%')
assert.equal(snapshotComparisonTrend('lockedAccounts', 1, null).tone, 'positive')
assert.match(snapshotComparisonTrend('totalUsers', 8, null).description, /Sample comparison/)
assert.equal(snapshotComparisonTrend('totalUsers', 8, null, { ...config, enabled: false }).label, '—')
const previous = { at: 1, totalUsers: 4, activeSessions: 0, lockedAccounts: 0 }
const before = JSON.stringify(previous)
assert.equal(snapshotComparisonTrend('totalUsers', 8, previous).label, '+100%')
assert.equal(snapshotComparisonTrend('activeSessions', 3, previous).label, 'New')
assert.equal(snapshotComparisonTrend('lockedAccounts', 0, previous).label, '0%')
assert.doesNotMatch(snapshotComparisonTrend('totalUsers', 8, previous).description, /Sample comparison/)
assert.equal(snapshotComparisonTrend('totalUsers', 8, null, { ...config, baselines: { ...config.baselines, totalUsers: -1 } }).label, '—')
assert.equal(JSON.stringify(previous), before)
assert.equal(snapshotComparisonTrend('totalUsers', 8, null).tone, 'positive')
assert.equal(snapshotComparisonTrend('activeSessions', 3, null).tone, 'positive')
assert.equal(snapshotComparisonTrend('totalUsers', 2, null).tone, 'negative')
assert.equal(snapshotComparisonTrend('activeSessions', 1, null).tone, 'negative')
assert.equal(snapshotComparisonTrend('lockedAccounts', 3, null).tone, 'negative')
console.log('PASS: immediate sample indicators, genuine/zero-history precedence, disabled/invalid fallback, labeling, colors, and no history mutation')
