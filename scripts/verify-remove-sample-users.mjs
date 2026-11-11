import assert from 'node:assert/strict'
import { removeSampleUsers } from '../src/auth/removeSampleUsers.ts'

const state = {
  accounts: [
    { id: 1, firstName: 'Demo', email: 'admin@demo.com' },
    { id: 2, firstName: 'Sample', email: 'sample.executive.0.1@example.test' },
    { id: 3, firstName: 'Custom', email: 'custom@example.com' },
    { id: 4, firstName: 'Sample', email: 'sample.unrelated@example.test' },
    { id: 5, firstName: 'Demo', email: 'role-demo.4.4@example.test' },
    { id: 6, firstName: 'Demo', email: 'role-demo.4.5@example.test' },
  ],
  credentials: [{ accountId: 1 }, { accountId: 2 }, { accountId: 5 }],
  locks: [{ accountId: 2 }], sessions: [{ accountId: 1 }, { accountId: 2 }],
  invitations: [{ accountId: 2 }], challenges: [{ accountId: 2 }, { accountId: null }],
  recoveryAuthorizations: [{ accountId: 2 }], inviteCooldowns: { 2: 123 },
  recoveryRequests: { 'sample.executive.0.1@example.test': [123] },
  sampleUserDistributionVersion: 1, roleChartDemoSeeded: true, nextAccountId: 99,
  audit: [{ accountId: 2 }], loginAttempts: [{ accountId: 2 }],
}
removeSampleUsers(state)
assert.deepEqual(state.accounts.map(account => account.id), [1, 3, 4, 6])
assert.deepEqual(state.sessions, [{ accountId: 1 }])
assert.deepEqual(state.credentials, [{ accountId: 1 }])
assert.deepEqual(state.challenges, [{ accountId: null }])
assert.equal(state.nextAccountId, 99)
assert.equal(state.audit.length, 1)
assert.equal(state.loginAttempts.length, 1)
assert.equal(state.sampleUserDistributionVersion, undefined)
assert.equal(state.roleChartDemoSeeded, undefined)
const cleaned = JSON.stringify(state)
removeSampleUsers(state)
assert.equal(JSON.stringify(state), cleaned)
console.log('PASS: targeted sample cleanup, original/custom account and session preservation, historical records, and idempotence')
