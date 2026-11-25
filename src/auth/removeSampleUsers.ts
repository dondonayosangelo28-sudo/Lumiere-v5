import type { DemoState } from './store'

/** Remove only the synthetic chart-preview fixtures, never real user-created accounts. */
export function removeSampleUsers(state: DemoState): DemoState {
  const sampleEmails = new Set<string>()
  for (const [slug, counts] of [
    ['executive', [2, 1, 1]],
    ['events', [1, 2, 1]],
    ['warehouse', [2, 1, 2]],
    ['crew', [3, 2, 1]],
  ] as const) {
    counts.forEach((count, status) => {
      for (let i = 1; i <= count; i++) sampleEmails.add(`sample.${slug}.${status}.${i}@example.test`)
    })
  }
  const roleDemoEmails = new Set<string>()
  for (let role = 1; role <= 4; role++) {
    for (let i = 1; i <= role; i++) roleDemoEmails.add(`role-demo.${role}.${i}@example.test`)
  }
  const teamDemoEmails = new Set<string>()
  ;[
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 3],
  ].forEach(([group, count]) => {
    for (let i = 1; i <= count; i++) teamDemoEmails.add(`team-demo.${group}.${i}@example.test`)
  })
  const summaryDemoEmails = new Set<string>([
    'summary-demo.1@example.test',
    'summary-demo.2@example.test',
    'summary-demo.3@example.test',
  ])

  const removed = state.accounts.filter((account) =>
    (sampleEmails.has(account.email) && account.firstName === 'Sample')
    || (roleDemoEmails.has(account.email) && account.firstName === 'Demo')
    || (teamDemoEmails.has(account.email) && account.firstName === 'Demo')
    || (summaryDemoEmails.has(account.email) && account.firstName === 'Demo')
    || (/^role-share-demo\.\d+@example\.test$/.test(account.email) && account.firstName === 'Demo')
    || account.email.trim().toLowerCase() === 'archived-crew-demo@example.test',
  )
  const ids = new Set(removed.map((account) => account.id))
  const removedEmails = new Set(removed.map((account) => account.email))
  const removedInviteTokens = new Set(
    state.invitations.filter((record) => ids.has(record.accountId)).map((record) => record.token),
  )
  const removedChallengeIds = new Set(
    state.challenges.filter((record) => record.accountId !== null && ids.has(record.accountId)).map((record) => record.id),
  )
  const removedRecoveryTokens = new Set(
    state.recoveryAuthorizations.filter((record) => ids.has(record.accountId)).map((record) => record.token),
  )

  state.accounts = state.accounts.filter((account) => !ids.has(account.id))
  state.credentials = state.credentials.filter((record) => !ids.has(record.accountId))
  state.locks = state.locks.filter((record) => !ids.has(record.accountId))
  state.sessions = state.sessions.filter((record) => !ids.has(record.accountId))
  state.invitations = state.invitations.filter((record) => !ids.has(record.accountId))
  state.challenges = state.challenges.filter((record) => record.accountId === null || !ids.has(record.accountId))
  state.recoveryAuthorizations = state.recoveryAuthorizations.filter((record) => !ids.has(record.accountId))
  for (const id of ids) delete state.inviteCooldowns[id]
  for (const email of removedEmails) delete state.recoveryRequests[email]

  if (state.latest) {
    if (state.latest.invitation && removedInviteTokens.has(state.latest.invitation)) {
      state.latest.invitation = null
    }
    if (state.latest.challenge && removedChallengeIds.has(state.latest.challenge)) {
      state.latest.challenge = null
    }
    if (state.latest.recovery && removedRecoveryTokens.has(state.latest.recovery)) {
      state.latest.recovery = null
    }
  }

  delete (state as DemoState & { sampleUserDistributionVersion?: number }).sampleUserDistributionVersion
  delete (state as DemoState & { roleChartDemoSeeded?: boolean }).roleChartDemoSeeded
  delete state.summaryDemoSeededAt
  delete state.additionalDemoUsersSeededAt
  delete state.roleRankingDemoSeededAt
  // Keep historical audit/sign-in records and the ID sequence unchanged.
  return state
}
