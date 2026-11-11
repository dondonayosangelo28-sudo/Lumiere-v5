import type { DemoState } from './store'

/** Remove only the synthetic chart-preview fixtures, never all browser data. */
export function removeSampleUsers(state: DemoState): DemoState {
  const emails = new Set<string>()
  for (const [slug, counts] of [
    ['executive', [2, 1, 1]],
    ['events', [1, 2, 1]],
    ['warehouse', [2, 1, 2]],
    ['crew', [3, 2, 1]],
  ] as const) {
    counts.forEach((count, status) => {
      for (let i = 1; i <= count; i++) emails.add(`sample.${slug}.${status}.${i}@example.test`)
    })
  }
  const roleDemoEmails = new Set<string>()
  for (let role = 1; role <= 4; role++) {
    for (let i = 1; i <= role; i++) roleDemoEmails.add(`role-demo.${role}.${i}@example.test`)
  }
  const removed = state.accounts.filter((account) =>
    (emails.has(account.email) && account.firstName === 'Sample')
    || (roleDemoEmails.has(account.email) && account.firstName === 'Demo'),
  )
  const ids = new Set(removed.map((account) => account.id))
  const removedEmails = new Set(removed.map((account) => account.email))
  state.accounts = state.accounts.filter((account) => !ids.has(account.id))
  state.credentials = state.credentials.filter((record) => !ids.has(record.accountId))
  state.locks = state.locks.filter((record) => !ids.has(record.accountId))
  state.sessions = state.sessions.filter((record) => !ids.has(record.accountId))
  state.invitations = state.invitations.filter((record) => !ids.has(record.accountId))
  state.challenges = state.challenges.filter((record) => record.accountId === null || !ids.has(record.accountId))
  state.recoveryAuthorizations = state.recoveryAuthorizations.filter((record) => !ids.has(record.accountId))
  for (const id of ids) delete state.inviteCooldowns[id]
  for (const email of removedEmails) delete state.recoveryRequests[email]
  delete (state as DemoState & { sampleUserDistributionVersion?: number }).sampleUserDistributionVersion
  delete (state as DemoState & { roleChartDemoSeeded?: boolean }).roleChartDemoSeeded
  // Keep historical audit/sign-in records and the ID sequence unchanged.
  return state
}
