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
const memoryStorage = () => {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }
}
globalThis.localStorage = memoryStorage()
globalThis.sessionStorage = memoryStorage()
const realTimeout = globalThis.setTimeout
globalThis.setTimeout = (callback) => realTimeout(callback, 0)
const realNow = Date.now
Date.now = () => 1_800_000_000_000

try {
  const store = await import('../src/auth/store.ts')
  const { signIn, liveSessions } = await import('../src/auth/session.ts')
  const { authService, updateOwnProfile } = await import('../src/auth/mockAuthService.ts')
  const { filterAuditEvents, emptyAuditFilters } = await import('../src/auth/auditFilters.ts')
  const { prototypeStorageLimits } = await import('../src/auth/prototypeStorageLimits.ts')
  const { getState, update, recordAudit, recordLoginAttempt, accountTarget, DEMO_PASSWORD } = store
  for (let i = 0; i < 3; i++) await signIn({ email: 'missing@example.com', password: 'wrong', remember: false })
  assert.equal(getState().loginAttempts.length, 3)
  assert.equal(getState().audit.filter((e) => e.action === 'Login failed').length, 3)
  for (let i = 0; i < 2; i++) assert.equal((await signIn({ email: 'admin@demo.com', password: DEMO_PASSWORD, remember: false })).ok, true)
  assert.equal(getState().audit.filter((e) => e.action === 'Login succeeded').length, 2)
  for (const attempt of getState().loginAttempts) {
    assert.ok(attempt.correlationId)
    assert.equal(getState().audit.filter((e) => e.correlationId === attempt.correlationId && e.action.startsWith('Login ')).length, 1)
  }
  const admin = getState().accounts.find((a) => a.role === 'System Admin')
  const original = getState().audit.find((e) => e.action === 'Login succeeded')
  await updateOwnProfile({ firstName: 'Changed', lastName: 'Profile' })
  const filters = { ...emptyAuditFilters, firstName: admin.firstName, lastName: admin.lastName }
  assert.equal(filterAuditEvents([original], getState().accounts, filters).length, 1)
  assert.equal(filterAuditEvents([original], getState().accounts, { ...emptyAuditFilters, firstName: 'Changed' }).length, 0)
  const legacy = structuredClone(original)
  delete legacy.actor.firstName
  delete legacy.actor.lastName
  assert.equal(filterAuditEvents([legacy], getState().accounts, { ...emptyAuditFilters, firstName: 'Demo', lastName: 'System Admin' }).length, 1)

  update((draft) => {
    const input = { operationId: 'replay-test', actor: { account: admin }, action: 'Account edited', target: accountTarget(admin), description: 'Repeated operation', changes: [{ field: 'password', from: 'hidden', to: 'hidden' }, { field: 'Name', from: '', to: 'a'.repeat(40) }] }
    const first = recordAudit(draft, input)
    const replay = recordAudit(draft, input)
    assert.equal(first.id, replay.id)
    assert.equal(first.changes.length, 1)
    assert.equal(first.changes[0].to, '[redacted]')
    const next = recordAudit(draft, { ...input, operationId: 'independent-test' })
    assert.notEqual(first.id, next.id)
    const attempt = { correlationId: 'attempt-replay', email: 'replay@example.com', accountId: null, role: null, result: 'Failed' }
    assert.equal(recordLoginAttempt(draft, attempt).id, recordLoginAttempt(draft, attempt).id)
  })
  const target = getState().accounts.find((a) => a.role === 'Executive')
  for (let i = 0; i < 5; i++) await signIn({ email: target.email, password: 'wrong', remember: false })
  const locking = getState().audit.find((e) => e.action === 'Account locked')
  assert.ok(getState().loginAttempts.some((a) => a.correlationId === locking.correlationId))
  await authService.unlockAccount(target.id)
  assert.equal(getState().locks.some((l) => l.accountId === target.id), false)
  assert.ok(getState().audit.some((e) => e.action === 'Account unlocked'))
  await authService.deactivateAccount(target.id)
  assert.equal(getState().accounts.find((a) => a.id === target.id).status, 'Inactive')
  assert.ok(getState().audit.some((e) => e.action === 'Account deactivated' && e.target.id === String(target.id)))
  await authService.deleteAccount(target.id)
  await authService.restoreAccount(target.id)
  assert.equal(getState().accounts.find((a) => a.id === target.id).status, 'Inactive')
  assert.ok(getState().audit.some((e) => e.action === 'Account restored'))
  assert.equal(liveSessions().length, 2)
  assert.ok(getState().loginAttempts.length <= prototypeStorageLimits.loginAttempts)
  assert.ok(getState().audit.length <= prototypeStorageLimits.auditEvents)
  assert.ok(getState().sessions.length <= prototypeStorageLimits.sessions)
  console.log('PASS: independent attempts, operation replay, correlation, historical snapshots/legacy filters, redaction, security/account actions, session preservation, and record bounds')
} finally {
  Date.now = realNow
  globalThis.setTimeout = realTimeout
}
