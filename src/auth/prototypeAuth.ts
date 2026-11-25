/* ---------- Development-only helpers for the Prototype tools panel ---------- */
import { getState, resetDemoState, securityPolicy as P, update } from './store'

export const demoAccounts = { eligible: 'eventmanager@demo.com', ineligible: 'Pending Activation and Inactive accounts' }

const devOnly = <T,>(fn: () => T, fallback: T) =>
  ((typeof import.meta !== 'undefined' && import.meta.env?.DEV) || process.env.NODE_ENV !== 'production') ? fn() : fallback

// Newest challenge issued to an eligible account (the one reviewers can actually complete).
const eligibleChallenge = () => [...getState().challenges].filter((c) => c.code).sort((a, b) => b.issuedAt - a.issuedAt)[0]
const latestChallenge = () => eligibleChallenge() ?? getState().challenges.find((c) => c.id === getState().latest.challenge)

export const prototypeAuth = {
  latestInvitationToken: () => devOnly(() => getState().latest.invitation, null),
  currentOtp: () =>
    devOnly(() => {
      const c = eligibleChallenge()
      return c?.code ? { identifier: c.identifier, code: c.code, expiresAt: c.expiresAt, attempts: c.attempts } : null
    }, null),
  expireInvitation: () =>
    devOnly(() => {
      const t = getState().latest.invitation
      if (!t || !getState().invitations.some((i) => i.token === t)) return false
      update((d) => void (d.invitations = d.invitations.map((i) => (i.token === t ? { ...i, expiresAt: Date.now() - 1 } : i))))
      return true
    }, false),
  markInvitationUsed: () =>
    devOnly(() => {
      const t = getState().latest.invitation
      if (!t || !getState().invitations.some((i) => i.token === t)) return false
      update((d) => void (d.invitations = d.invitations.map((i) => (i.token === t ? { ...i, usedAt: Date.now() } : i))))
      return true
    }, false),
  expireOtp: () =>
    devOnly(() => {
      const c = latestChallenge()
      if (!c) return false
      update((d) => void (d.challenges = d.challenges.map((x) => (x.id === c.id ? { ...x, expiresAt: Date.now() - 1 } : x))))
      return true
    }, false),
  exhaustOtpAttempts: () =>
    devOnly(() => {
      const c = latestChallenge()
      if (!c) return false
      update((d) => void (d.challenges = d.challenges.map((x) => (x.id === c.id ? { ...x, attempts: P.otpMaxAttempts } : x))))
      return true
    }, false),
  expireRecoveryAuthorization: () =>
    devOnly(() => {
      const t = getState().latest.recovery
      if (!t || !getState().recoveryAuthorizations.some((r) => r.token === t)) return false
      update((d) => void (d.recoveryAuthorizations = d.recoveryAuthorizations.map((r) => (r.token === t ? { ...r, expiresAt: Date.now() - 1 } : r))))
      return true
    }, false),
  failNextRequest: () => devOnly(() => (update((d) => void (d.failNextRequest = true)), true), false),
  isFailureArmed: () => getState().failNextRequest,
  reset: () => devOnly(() => (resetDemoState(), true), false),
}

