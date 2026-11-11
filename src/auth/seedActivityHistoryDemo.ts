import { currentSession } from './session'
import { getState, randomId, recordAudit, recordLoginAttempt, update, type AttemptResult } from './store'
import { prototypeStorageLimits } from './prototypeStorageLimits'

/** Synthetic chart history only; never backfills summary snapshots or creates sessions/accounts. */
export function seedActivityHistoryDemo() {
  const actor = getState().accounts.find((account) => account.id === currentSession()?.accountId)
  if (!actor || actor.role !== 'System Admin' || actor.status !== 'Active' || actor.deletedAt || getState().activityHistoryDemoSeededAt) return
  update((draft) => {
    if (draft.activityHistoryDemoSeededAt) return
    const now = Date.now()
    const day = 86_400_000, offset = 8 * 3_600_000
    const today = Math.floor((now + offset) / day) * day - offset
    // Days 3–29 ago in Manila: varied daily volume, including deliberately empty days.
    // Leave the latest 48 hours untouched so the current summary demo remains unchanged.
    const volumes = [4, 7, 3, 0, 9, 5, 12, 6, 2, 8, 0, 11, 5, 7, 3, 10, 4, 0, 8, 6, 13, 5, 9, 2, 7, 11, 4]
    const capacity = Math.max(0, Math.min(
      prototypeStorageLimits.loginAttempts - draft.loginAttempts.length,
      prototypeStorageLimits.auditEvents - draft.audit.length,
    ))
    const fixtures = { ...draft, loginAttempts: [], audit: [] }
    let added = 0
    volumes.forEach((volume, index) => {
      for (let i = 0; i < volume && added < capacity; i++) {
        const at = today - (index + 3) * day + 12 * 3_600_000 + i * 60_000
        const result: AttemptResult = i % 7 === 0 ? 'Blocked' : i % 4 === 0 ? 'Failed' : 'Success'
        const correlationId = randomId('history-demo')
        recordLoginAttempt(fixtures, {
          correlationId, email: 'activity-history-demo@example.test', accountId: null, role: null,
          result, reason: 'Synthetic historical chart-preview record; not an actual sign-in.',
        }).at = at
        const event = recordAudit(fixtures, {
          correlationId, actor: { account: null, role: 'System' },
          action: result === 'Success' ? 'Login succeeded' : result === 'Failed' ? 'Login failed' : 'Login blocked',
          target: { type: 'system', id: 'activity-history-demo', label: 'Synthetic activity history' },
          result, description: `Synthetic historical ${result.toLowerCase()} sign-in for the 30-day chart preview; not an actual user action.`,
        })
        if (event) event.at = at
        added++
      }
    })
    // Existing records take priority over samples when storage is near its cap.
    draft.loginAttempts = [...draft.loginAttempts, ...fixtures.loginAttempts].sort((a, b) => b.at - a.at)
    draft.audit = [...draft.audit, ...fixtures.audit].sort((a, b) => b.at - a.at)
    draft.activityHistoryDemoSeededAt = now
  })
}
