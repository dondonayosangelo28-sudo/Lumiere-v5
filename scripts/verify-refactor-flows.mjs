import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.')) {
        try { return next(`${specifier}.ts`, context) } catch {}
        try { return next(`${specifier}.tsx`, context) } catch {}
      }
      throw error
    }
  },
})

import.meta.env = { DEV: true }

// Mock browser storage for auth store
const memoryStore = new Map()
globalThis.localStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
}
globalThis.sessionStorage = {
  getItem: (key) => memoryStore.get(`session:${key}`) ?? null,
  setItem: (key, val) => memoryStore.set(`session:${key}`, String(val)),
  removeItem: (key) => memoryStore.delete(`session:${key}`),
  clear: () => {},
}

console.log('Testing 1: Public assets and build artifacts...')
assert.ok(existsSync('public/lumiere-logo.png'), 'lumiere-logo.png must exist in public/')
assert.ok(existsSync('dist/index.html'), 'dist/index.html must exist')
const distHtml = readFileSync('dist/index.html', 'utf8')
assert.ok(distHtml.includes('<div id="root"></div>'), 'dist/index.html must have #root')

// Verify prototype tools are excluded from production build
console.log('Testing 2: PrototypeTools tree-shaking in production build...')
const distFiles = readFileSync('dist/index.html', 'utf8')
// Prototype tools has distinct text: "Restore default demo state" or "Current demo OTP"
const distAssets = existsSync('dist/assets')
if (distAssets) {
  const { readdirSync } = await import('node:fs')
  const jsFiles = readdirSync('dist/assets').filter(f => f.endsWith('.js'))
  let foundPrototypeText = false
  for (const js of jsFiles) {
    const content = readFileSync(resolve('dist/assets', js), 'utf8')
    if (content.includes('Restore default demo state') || content.includes('Current demo OTP')) {
      foundPrototypeText = true
      break
    }
  }
  assert.equal(foundPrototypeText, false, 'PrototypeTools must be excluded from production build bundles')
}

console.log('Testing 3: Auth flows, invitations, recovery, admin ops, and demo reset...')
const { authService, deactivationBlock, updateOwnProfile } = await import('../src/auth/mockAuthService.ts')
const { signIn, signOut, signOutForDemoReset, currentAccount } = await import('../src/auth/session.ts')
const { getState, resetDemoState, DEMO_PASSWORD } = await import('../src/auth/store.ts')
const { demoAccounts, prototypeAuth } = await import('../src/auth/prototypeAuth.ts')

// Reset to clean demo state
resetDemoState()

// Sign in as admin
const adminLogin = await signIn({ email: 'admin@demo.com', password: DEMO_PASSWORD, remember: false })
assert.equal(adminLogin.ok, true, 'Admin sign in should succeed')
assert.equal(currentAccount()?.role, 'System Admin')

// Test account administration: create new user
const newUser = await authService.createUser({
  firstName: 'Test',
  lastName: 'User',
  email: 'testuser@demo.com',
  role: 'Event Manager',
})
assert.equal(newUser.email, 'testuser@demo.com')
assert.equal(newUser.status, 'Pending Activation')
assert.ok(newUser.invitationExpiresAt > Date.now())

// Test invitation validation
const latestToken = prototypeAuth.latestInvitationToken()
assert.ok(latestToken, 'Prototype tools should provide latest invitation token in dev')
const inviteVal = await authService.validateInvitation(latestToken)
assert.equal(inviteVal.email, 'testuser@demo.com')

// Test completing invitation (activate account)
await authService.completeInvitation({ token: latestToken, password: 'Password123!' })
const activatedAccount = getState().accounts.find(a => a.email === 'testuser@demo.com')
assert.equal(activatedAccount?.status, 'Active')

// Test profile update
await updateOwnProfile({ firstName: 'Super', lastName: 'Admin' })
const updatedAdmin = getState().accounts.find(a => a.email === 'admin@demo.com')
assert.equal(updatedAdmin?.firstName, 'Super')

// Test deactivation block on self and last admin
assert.ok(deactivationBlock(updatedAdmin, updatedAdmin.id) !== null, 'Should block self-deactivation')

// Test password recovery flow
const challenge = await authService.requestPasswordReset({ identifier: demoAccounts.eligible })
assert.ok(challenge.challengeId)
const otpObj = prototypeAuth.currentOtp()
assert.ok(otpObj?.code, 'Prototype tools should provide active recovery code')
const recoveryAuth = await authService.verifyResetOtp({ challengeId: challenge.challengeId, otp: otpObj.code })
assert.ok(recoveryAuth.token)
await authService.resetPassword({ recoveryAuthorization: recoveryAuth.token, password: 'NewPassword123!' })

// Test demo reset
const resetNotice = signOutForDemoReset()
assert.ok(resetNotice.includes('Demo data was reset'))
assert.equal(currentAccount(), null, 'Sign out for demo reset should clear session')

console.log('Testing 4: Role-based navigation and canAccess boundaries...')
const { canAccess, roleModules } = await import('../src/auth/roleConfig.ts')
// System Admin permissions
assert.equal(canAccess('System Admin', 'overview'), true)
assert.equal(canAccess('System Admin', 'accounts'), true)
assert.equal(canAccess('System Admin', 'security'), true)
assert.equal(canAccess('System Admin', 'audit-logs'), true)
assert.equal(canAccess('System Admin', 'projects'), false) // Retired sample projects return false -> AccessDenied
assert.equal(canAccess('System Admin', 'settings-security'), false) // Admin uses security page, not settings-security
assert.equal(canAccess('System Admin', 'module-event-creation'), false)

// Event Manager permissions
assert.equal(canAccess('Event Manager', 'overview'), true)
assert.equal(canAccess('Event Manager', 'projects'), false) // Retired -> AccessDenied
assert.equal(canAccess('Event Manager', 'module-event-creation'), true)
assert.equal(canAccess('Event Manager', 'module-client-pitching'), true)
assert.equal(canAccess('Event Manager', 'accounts'), false) // Cannot access admin accounts -> AccessDenied
assert.equal(canAccess('Event Manager', 'security'), false) // Cannot access admin security -> AccessDenied
assert.equal(canAccess('Event Manager', 'audit-logs'), false) // Cannot access audit logs -> AccessDenied

// Warehouse Operations Manager permissions
assert.equal(canAccess('Warehouse Operations Manager', 'overview'), true)
assert.equal(canAccess('Warehouse Operations Manager', 'module-asset-inventory'), true)
assert.equal(canAccess('Warehouse Operations Manager', 'module-order-requests'), true)
assert.equal(canAccess('Warehouse Operations Manager', 'module-deficit-queue'), true)
assert.equal(canAccess('Warehouse Operations Manager', 'accounts'), false)

console.log('Testing 5: Calendar dates and time utilities...')
const { dateKey, parseDate } = await import('../src/components/ui/calendarDates.ts')
const testDate = new Date(2026, 9, 20)
assert.equal(typeof dateKey(testDate), 'string')
assert.ok(parseDate(dateKey(testDate)) instanceof Date)

console.log('Testing 6: Operations types and status boundaries...')
const { readOperationsStore, OPERATIONS_STORAGE_KEY } = await import('../src/operations/store.ts')
assert.equal(typeof readOperationsStore, 'function')
assert.ok(OPERATIONS_STORAGE_KEY.includes('operations'))
const opsStore = readOperationsStore()
assert.ok(Array.isArray(opsStore.inventory))
assert.ok(Array.isArray(opsStore.orderRequests))

console.log('Testing 7: Domain types and fixtures...')
const { projects, deletedProjects } = await import('../src/data.ts')
assert.ok(Array.isArray(projects) && projects.length > 0)
assert.ok(Array.isArray(deletedProjects) && deletedProjects.length > 0)

console.log('All automated integration and domain checks passed successfully!')
