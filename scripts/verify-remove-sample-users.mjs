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
    { id: 7, firstName: 'Demo', email: 'team-demo.3.2@example.test' },
    { id: 8, firstName: 'Demo', email: 'summary-demo.1@example.test' },
    { id: 9, firstName: 'Demo', email: 'role-share-demo.9@example.test' },
    { id: 10, firstName: 'Real', email: 'team-demo.3.2@company.com' },
    { id: 11, firstName: 'Archived', lastName: 'Field Assistant', email: 'archived-crew-demo@example.test', role: 'Ground Crew', status: 'Inactive', deletedAt: 5000 },
  ],
  credentials: [{ accountId: 1 }, { accountId: 2 }, { accountId: 5 }, { accountId: 7 }, { accountId: 8 }, { accountId: 9 }, { accountId: 10 }, { accountId: 11 }],
  locks: [{ accountId: 2 }, { accountId: 8 }, { accountId: 11 }],
  sessions: [{ accountId: 1 }, { accountId: 2 }, { accountId: 8 }, { accountId: 11 }],
  invitations: [{ accountId: 2, token: 'inv-2' }, { accountId: 10, token: 'inv-10' }, { accountId: 11, token: 'inv-11' }],
  challenges: [{ id: 'ch-2', accountId: 2 }, { id: 'ch-11', accountId: 11 }, { id: 'ch-null', accountId: null }],
  recoveryAuthorizations: [{ token: 'rec-2', accountId: 2 }, { token: 'rec-11', accountId: 11 }],
  inviteCooldowns: { 2: 123, 10: 456, 11: 789 },
  recoveryRequests: { 'sample.executive.0.1@example.test': [123], 'team-demo.3.2@company.com': [789], 'archived-crew-demo@example.test': [999] },
  latest: { invitation: 'inv-2', challenge: 'ch-11', recovery: 'rec-11' },
  sampleUserDistributionVersion: 1,
  roleChartDemoSeeded: true,
  summaryDemoSeededAt: 111,
  additionalDemoUsersSeededAt: 222,
  roleRankingDemoSeededAt: 333,
  nextAccountId: 99,
  audit: [{ accountId: 2 }],
  loginAttempts: [{ accountId: 2 }],
}

removeSampleUsers(state)
assert.deepEqual(state.accounts.map((account) => account.id), [1, 3, 4, 6, 10])
assert.deepEqual(state.sessions, [{ accountId: 1 }])
assert.deepEqual(state.credentials, [{ accountId: 1 }, { accountId: 10 }])
assert.deepEqual(state.locks, [])
assert.deepEqual(state.invitations, [{ accountId: 10, token: 'inv-10' }])
assert.deepEqual(state.challenges, [{ id: 'ch-null', accountId: null }])
assert.deepEqual(state.recoveryAuthorizations, [])
assert.deepEqual(state.inviteCooldowns, { 10: 456 })
assert.deepEqual(state.recoveryRequests, { 'team-demo.3.2@company.com': [789] })
assert.deepEqual(state.latest, { invitation: null, challenge: null, recovery: null })
assert.equal(state.nextAccountId, 99)
assert.equal(state.audit.length, 1)
assert.equal(state.loginAttempts.length, 1)
assert.equal(state.sampleUserDistributionVersion, undefined)
assert.equal(state.roleChartDemoSeeded, undefined)
assert.equal(state.summaryDemoSeededAt, undefined)
assert.equal(state.additionalDemoUsersSeededAt, undefined)
assert.equal(state.roleRankingDemoSeededAt, undefined)

const cleaned = JSON.stringify(state)
removeSampleUsers(state)
assert.equal(JSON.stringify(state), cleaned)
console.log('PASS: targeted sample cleanup across all fixture families, stale pointer cleanup, user preservation, historical records, and idempotence')
