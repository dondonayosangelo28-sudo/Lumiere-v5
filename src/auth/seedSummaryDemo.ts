import { accountTarget, getState, randomId, recordAudit, recordLoginAttempt, securityPolicy, setPassword, update, type Account, type LifecycleStatus } from './store'
import { currentSession } from './session'

/** One-time additions to demonstrate distinct role shares, without reassigning real users. */
export function seedRoleRankingDemo() {
  const actor = getState().accounts.find((account) => account.id === currentSession()?.accountId)
  if (!actor || actor.role !== 'System Admin' || actor.status !== 'Active' || actor.deletedAt || getState().roleRankingDemoSeededAt) return
  update((draft) => {
    if (draft.roleRankingDemoSeededAt) return
    const now = Date.now()
    const count = (role: Account['role']) => draft.accounts.filter((account) => account.role === role && !account.deletedAt).length
    draft.nextAccountId = Math.max(draft.nextAccountId, ...draft.accounts.map((account) => account.id + 1))
    let minimum = count('Executive') + 1
    for (const role of ['Event Manager', 'Warehouse Operations Manager', 'Ground Crew'] as const) {
      const missing = Math.max(0, minimum - count(role))
      for (let i = 0; i < missing; i++) {
        const id = draft.nextAccountId++
        const account: Account = {
          id, role, status: 'Active', firstName: 'Demo', lastName: `${role} Preview ${i + 1}`,
          email: `role-share-demo.${id}@example.test`, createdAt: now, lastLoginAt: null, activatedAt: now,
        }
        draft.accounts.push(account)
        setPassword(draft, id, 'RoleSharePreview2026!')
        recordAudit(draft, { actor: { account: actor }, action: 'Account created', target: accountTarget(account), description: 'Synthetic demo user to illustrate ranked role shares.' })
      }
      minimum = count(role) + 1
    }
    draft.roleRankingDemoSeededAt = now
  })
}

/** Additional labeled demo users; no new sessions, failures, or locks are created. */
export function seedAdditionalDemoUsers() {
  const actor = getState().accounts.find((account) => account.id === currentSession()?.accountId)
  if (!actor || actor.role !== 'System Admin' || actor.status !== 'Active' || actor.deletedAt || getState().additionalDemoUsersSeededAt) return
  update((draft) => {
    if (draft.additionalDemoUsersSeededAt) return
    const now = Date.now()
    const groups = [
      { role: 'Executive', count: 2 },
      { role: 'Event Manager', count: 3 },
      { role: 'Warehouse Operations Manager', count: 4 },
      { role: 'Ground Crew', count: 3 },
    ] as const
    const statuses: LifecycleStatus[] = ['Active', 'Pending Activation', 'Inactive']
    draft.nextAccountId = Math.max(draft.nextAccountId, ...draft.accounts.map((account) => account.id + 1))
    groups.forEach(({ role, count }, group) => {
      for (let i = 1; i <= count; i++) {
        const email = `team-demo.${group + 1}.${i}@example.test`
        if (draft.accounts.some((account) => account.email === email)) continue
        const status = statuses[(i - 1) % statuses.length]
        const account: Account = {
          id: draft.nextAccountId++, firstName: 'Demo', lastName: `${role} Team ${i}`,
          email, role, status, createdAt: now, lastLoginAt: null,
          activatedAt: status === 'Pending Activation' ? null : now,
        }
        draft.accounts.push(account)
        setPassword(draft, account.id, 'TeamPreview2026!')
        recordAudit(draft, { actor: { account: actor }, action: 'Account created', target: accountTarget(account), description: 'Additional synthetic demo user for account and role-distribution preview.' })
      }
    })
    draft.additionalDemoUsersSeededAt = now
  })
}

/** Explicitly synthetic fixtures, seeded once when the admin summary is first opened. */
export function seedSummaryDemo() {
  const session = currentSession()
  const actor = getState().accounts.find((account) => account.id === session?.accountId)
  if (!actor || actor.role !== 'System Admin' || actor.status !== 'Active' || actor.deletedAt || getState().summaryDemoSeededAt) return
  const now = Date.now()
  update((draft) => {
    if (draft.summaryDemoSeededAt) return
    const accounts: Account[] = (['Executive', 'Event Manager', 'Ground Crew'] as const).map((role, i) => {
      const account: Account = {
        id: draft.nextAccountId++, role, status: 'Active',
        firstName: 'Demo', lastName: `Summary ${i + 1}`,
        email: `summary-demo.${i + 1}@example.test`,
        createdAt: now, activatedAt: now, lastLoginAt: null,
      }
      draft.accounts.push(account)
      setPassword(draft, account.id, 'SummaryPreview2026!')
      recordAudit(draft, { actor: { account: actor }, action: 'Account created', target: accountTarget(account), description: 'Synthetic summary-card demo account.' })
      return account
    })
    accounts.slice(0, 2).forEach((account) => {
      const id = randomId('ses')
      draft.sessions.push({
        id, accountId: account.id, role: account.role, device: 'Demo preview browser',
        startedAt: now, lastActivityAt: now, persistence: 'session', status: 'active', endedAt: null, endReason: null,
      })
      account.lastLoginAt = now
      const correlationId = randomId('demo')
      recordLoginAttempt(draft, { correlationId, email: account.email, accountId: account.id, role: account.role, result: 'Success', reason: 'Synthetic demo session' })
      recordAudit(draft, { correlationId, actor: { account }, action: 'Login succeeded', target: accountTarget(account), description: 'Synthetic demo session for summary-card preview.' })
    })
    // Seven recent failures and three in the preceding rolling day give a real comparison
    // over the synthetic records, rather than a hardcoded card or trend value.
    for (const hoursAgo of [1, 2, 3, 4, 5, 6, 7, 28, 32, 36]) {
      const account = accounts[2]
      const correlationId = randomId('demo')
      const at = now - hoursAgo * 3_600_000
      recordLoginAttempt(draft, { correlationId, email: account.email, accountId: account.id, role: account.role, result: 'Failed', reason: 'Synthetic demo: incorrect password' }).at = at
      const event = recordAudit(draft, { correlationId, actor: { account: null }, action: 'Login failed', target: accountTarget(account), result: 'Failed', description: 'Synthetic failed sign-in for summary-card preview.' })
      if (event) event.at = at
    }
    const locked = accounts[2]
    draft.locks.push({ accountId: locked.id, consecutiveFailures: securityPolicy.loginAttemptLimit, lockedAt: now, lockedUntil: now + securityPolicy.lockDurationMs })
    recordAudit(draft, { actor: { account: null, role: 'System' }, action: 'Account locked', target: accountTarget(locked), result: 'Blocked', description: 'Synthetic temporary lock for summary-card preview.' })
    draft.summaryDemoSeededAt = now
  })
}
