import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(`${specifier}.ts`, context)
      throw error
    }
  },
})

const storage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  }
}

class MockWindow extends EventTarget {}
globalThis.window = new MockWindow()
globalThis.localStorage = storage()
globalThis.sessionStorage = storage()

const EXPECTED_ACCOUNTS = [
  { email: 'admin@demo.com', role: 'System Admin', id: 100_001 },
  { email: 'executive@demo.com', role: 'Executive', id: 100_002 },
  { email: 'eventmanager@demo.com', role: 'Event Manager', id: 100_003 },
  { email: 'warehouseops@demo.com', role: 'Warehouse Operations Manager', id: 100_004 },
  { email: 'crew@demo.com', role: 'Ground Crew', id: 100_005 },
  { email: 'crew1@demo.com', role: 'Ground Crew', id: 100_006 },
  { email: 'crew2@demo.com', role: 'Ground Crew', id: 100_007 },
  { email: 'crew3@demo.com', role: 'Ground Crew', id: 100_008 },
]

// 1. Fresh initialization creates the exact 8 main accounts, all Active, authenticating with demo123
const store = await import('../src/auth/store.ts')
const session = await import('../src/auth/session.ts')

let state = store.getState()
assert.equal(state.accounts.length, 8, 'Fresh init must create exactly 8 main accounts')
assert.equal(state.demoAccountsMigrationVersion, store.CURRENT_DEMO_ACCOUNTS_MIGRATION)
assert.equal(state.nextAccountId, 100_009)

for (const exp of EXPECTED_ACCOUNTS) {
  const acct = state.accounts.find((a) => a.email === exp.email)
  assert.ok(acct, `Missing seeded account: ${exp.email}`)
  assert.equal(acct.id, exp.id, `Account ID mismatch for ${exp.email}`)
  assert.equal(acct.role, exp.role, `Role mismatch for ${exp.email}`)
  assert.equal(acct.status, 'Active', `Account ${exp.email} must be Active`)
  const res = await session.signIn({ email: exp.email, password: store.DEMO_PASSWORD, remember: false })
  assert.equal(res.ok, true, `Account ${exp.email} must sign in with demo123`)
  await session.signOut()
}

// 2. Reset restores the exact 8 main accounts without recreating sample fixtures
store.resetDemoState()
state = store.getState()
assert.equal(state.accounts.length, 8)
assert.equal(state.accounts.some((a) => a.email.includes('@example.test')), false)

// 3. Versioned migration on pre-existing browser data (5 main + fixtures + custom user + audit history)
const preMigrationState = {
  version: store.STORE_VERSION,
  nextAccountId: 100_012,
  accounts: [
    { id: 100_001, firstName: 'Demo', lastName: 'System Admin', displayName: 'Demo System Admin', email: 'admin@demo.com', role: 'System Admin', status: 'Active', createdAt: 1000, lastLoginAt: null, activatedAt: 1000 },
    { id: 100_002, firstName: 'Demo', lastName: 'Executive', displayName: 'Demo Executive', email: 'executive@demo.com', role: 'Executive', status: 'Active', createdAt: 1000, lastLoginAt: null, activatedAt: 1000 },
    { id: 100_003, firstName: 'Demo', lastName: 'Event Manager', displayName: 'Demo Event Manager', email: 'eventmanager@demo.com', role: 'Event Manager', status: 'Active', createdAt: 1000, lastLoginAt: null, activatedAt: 1000 },
    { id: 100_004, firstName: 'Demo', lastName: 'Warehouse Operations Manager', displayName: 'Demo Warehouse Operations Manager', email: 'warehouseops@demo.com', role: 'Warehouse Operations Manager', status: 'Active', createdAt: 1000, lastLoginAt: null, activatedAt: 1000 },
    { id: 100_005, firstName: 'Demo', lastName: 'Ground Crew', displayName: 'Demo Ground Crew', email: 'crew@demo.com', role: 'Ground Crew', status: 'Inactive', createdAt: 1000, lastLoginAt: null, activatedAt: null },
    // Synthetic fixtures to remove
    { id: 100_006, firstName: 'Demo', lastName: 'Summary 1', email: 'summary-demo.1@example.test', role: 'Executive', status: 'Active', createdAt: 2000, lastLoginAt: null, activatedAt: 2000 },
    { id: 100_007, firstName: 'Demo', lastName: 'Ground Crew Team 1', email: 'team-demo.4.1@example.test', role: 'Ground Crew', status: 'Active', createdAt: 2000, lastLoginAt: null, activatedAt: 2000 },
    { id: 100_008, firstName: 'Sample', lastName: 'User', email: 'sample.crew.0.1@example.test', role: 'Ground Crew', status: 'Active', createdAt: 2000, lastLoginAt: null, activatedAt: 2000 },
    { id: 100_010, firstName: 'Archived', lastName: 'Field Assistant', email: 'archived-crew-demo@example.test', role: 'Ground Crew', status: 'Inactive', deletedAt: 2500, createdAt: 1500, lastLoginAt: null, activatedAt: null },
    // Genuine user-created account with custom ID
    { id: 100_009, firstName: 'Maya', lastName: 'Lin', email: 'maya.lin@lumiere-client.com', role: 'Ground Crew', status: 'Active', createdAt: 3000, lastLoginAt: null, activatedAt: 3000 },
  ],
  credentials: [
    { accountId: 100_001, salt: 's1', digest: 'old', seededDefault: true, updatedAt: 1000 },
    { accountId: 100_006, salt: 's6', digest: 'bad', seededDefault: false, updatedAt: 2000 },
    { accountId: 100_009, salt: 's9', digest: 'custom-digest', seededDefault: false, updatedAt: 3000 },
  ],
  locks: [{ accountId: 100_006, consecutiveFailures: 5, lockedAt: 2000, lockedUntil: 999999999 }],
  sessions: [{ id: 'ses-fix', accountId: 100_006, role: 'Ground Crew', device: 'Bot', startedAt: 2000, lastActivityAt: 2000, persistence: 'session', status: 'active', endedAt: null, endReason: null }],
  loginAttempts: [{ id: 'att-1', at: 2000, email: 'summary-demo.1@example.test', accountId: 100_006, role: 'Executive', result: 'Success' }],
  invitations: [{ token: 'inv-fix', accountId: 100_007, email: 'team-demo.4.1@example.test', issuedAt: 2000, expiresAt: 999999999, usedAt: null, revokedAt: null }],
  inviteCooldowns: { 100_007: 2000 },
  challenges: [{ id: 'ch-fix', identifier: 'summary-demo.1@example.test', accountId: 100_006, code: '123456', issuedAt: 2000, expiresAt: 9999999, resendAvailableAt: 2000, attempts: 0, resends: 0, windowStart: 2000, initiatedBy: 'self' }],
  recoveryRequests: { 'summary-demo.1@example.test': [2000] },
  recoveryAuthorizations: [{ token: 'rec-fix', accountId: 100_006, expiresAt: 9999999, usedAt: null }],
  audit: [{ id: 'aud-1', at: 2000, actor: { accountId: 100_001, name: 'Demo System Admin', email: 'admin@demo.com' }, actorRole: 'System Admin', action: 'Account created', target: { type: 'account', id: '100006', label: 'summary-demo.1@example.test' }, result: 'Success', description: 'Historical audit' }],
  latest: { invitation: 'inv-fix', challenge: 'ch-fix', recovery: 'rec-fix' },
  failNextRequest: false,
}

// Simulate cross-tab storage event carrying pre-migration state
const storageEvt = new Event('storage')
Object.assign(storageEvt, { key: 'lumiere.demo.store', newValue: JSON.stringify(preMigrationState) })
globalThis.window.dispatchEvent(storageEvt)

state = store.getState()
assert.equal(state.accounts.length, 9, '8 main accounts + 1 preserved user-created account')
assert.equal(state.accounts.some((a) => a.email === 'archived-crew-demo@example.test'), false, 'archived-crew-demo@example.test must be removed even when soft-deleted')
assert.equal(state.demoAccountsMigrationVersion, store.CURRENT_DEMO_ACCOUNTS_MIGRATION)
assert.ok(state.accounts.some((a) => a.email === 'maya.lin@lumiere-client.com'), 'User-created account must be preserved')
assert.equal(state.credentials.find((c) => c.accountId === 100_009)?.digest, 'custom-digest', 'User-created credential must remain untouched')
assert.equal(state.accounts.find((a) => a.email === 'crew@demo.com')?.status, 'Active', 'One-time migration activates main accounts')
assert.equal(state.audit.length, 1, 'Historical audit records must be preserved')
assert.equal(state.loginAttempts.length, 1, 'Historical loginAttempts must be preserved')
assert.equal(state.locks.length, 0, 'Removed fixture locks must be cleaned')
assert.equal(state.sessions.length, 0, 'Removed fixture sessions must be cleaned')
assert.equal(state.invitations.length, 0, 'Removed fixture invitations must be cleaned')
assert.deepEqual(state.latest, { invitation: null, challenge: null, recovery: null })

// All 8 main accounts authenticate with demo123 after migration (including crew1..3 even when fixture IDs occupied 100_006..100_008)
for (const exp of EXPECTED_ACCOUNTS) {
  const res = await session.signIn({ email: exp.email, password: store.DEMO_PASSWORD, remember: false })
  assert.equal(res.ok, true, `Migrated account ${exp.email} must sign in with demo123`)
  await session.signOut()
}

// 4. Migration marker prevents subsequent resets of legitimate account changes
store.update((draft) => {
  const crew3 = draft.accounts.find((a) => a.email === 'crew3@demo.com')
  crew3.status = 'Inactive'
  store.setPassword(draft, crew3.id, 'CustomAdminPass99!')
})
const modifiedRaw = localStorage.getItem('lumiere.demo.store')
const storageEvt2 = new Event('storage')
Object.assign(storageEvt2, { key: 'lumiere.demo.store', newValue: modifiedRaw })
globalThis.window.dispatchEvent(storageEvt2)

state = store.getState()
assert.equal(state.accounts.find((a) => a.email === 'crew3@demo.com')?.status, 'Inactive', 'Migration marker must NOT reactivate deactivated accounts on subsequent loads/events')
assert.equal(
  (await session.signIn({ email: 'crew3@demo.com', password: store.DEMO_PASSWORD, remember: false })).ok,
  false,
  'Migration marker must NOT overwrite custom password back to demo123',
)

console.log('PASS: 8 main demo accounts, versioned idempotent migration, fixture cleanup, user-created preservation, and migration marker protection')
