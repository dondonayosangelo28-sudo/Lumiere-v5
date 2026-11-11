import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context) } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(`${specifier}.ts`, context)
      throw error
    }
  },
})
const { CHART_ROLES, CHART_STATUSES, usersByRoleAndStatus } = await import('../src/auth/dashboardMetrics.ts')
const accounts = CHART_ROLES.flatMap(role => CHART_STATUSES.map(status => ({ role, status })))
accounts.push({ role: 'System Admin', status: 'Active' }, { role: CHART_ROLES[0], status: 'Active', deletedAt: 1 })
const rows = usersByRoleAndStatus(accounts)
assert.equal(rows.length, 4)
assert.ok(rows.every(row => row.total === 3))
for (const status of CHART_STATUSES) assert.equal(rows.reduce((sum, row) => sum + row.counts[status], 0), 4)
assert.ok(usersByRoleAndStatus([]).every(row => row.total === 0))
console.log('PASS: four-role distribution, exact status totals, admin/deleted exclusions, and zero intervals')
const { usersByRole } = await import('../src/auth/dashboardMetrics.ts')
const equal = usersByRole(CHART_ROLES.map(role => ({ role, status: 'Active' })))
assert.ok(equal.every(row => row.count === 1 && row.percentage === 25 && row.largest))
const mixed = usersByRole(accounts.concat([{ role: CHART_ROLES[0], status: 'Inactive' }]))
assert.equal(mixed[0].count, 4)
assert.equal(mixed[0].percentage, 4 / 13 * 100)
assert.deepEqual(mixed.filter(row => row.largest).map(row => row.role), [CHART_ROLES[0]])
const empty = usersByRole([])
assert.equal(empty.length, 4)
assert.ok(empty.every(row => row.count === 0 && row.percentage === 0 && !row.largest))
const tied = usersByRole([
  ...CHART_ROLES.map(role => ({ role, status: 'Active' })),
  ...CHART_ROLES.slice(0, 2).map(role => ({ role, status: 'Pending Activation' })),
])
assert.deepEqual(tied.filter(row => row.largest).map(row => row.role), CHART_ROLES.slice(0, 2))
console.log('PASS: 25% four-way ties, all-status denominators, largest-role highlights, and empty shares')
