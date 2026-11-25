import { passwordError } from './passwordPolicy'
import { currentAccount, currentSession } from './session'
import {
  UNAUTHENTICATED_ACTOR,
  accountName,
  accountTarget,
  emailPattern,
  endSessions,
  findAccount,
  getState,
  normalizeEmail,
  randomOtp,
  randomToken,
  recordAudit,
  securityPolicy as P,
  setPassword,
  update,
  verifyPassword,
  type Account,
  type RecoveryChallengeRecord,
} from './store'
import {
  AuthFlowError,
  type InvitationValidationResult,
  type RecoveryAuthorization,
  type RecoveryChallenge,
} from './types'
import { respond } from './mockTransport'
import { ACCOUNT_ADMIN_ROLE } from './accountAdminOperations'

export function checkInvitation(token: string) {
  const inv = getState().invitations.find((i) => i.token === token)
  const account = inv && findAccount(inv.accountId)
  if (!inv || !account || inv.revokedAt || account.status === 'Inactive') throw new AuthFlowError('INVITE_INVALID')
  if (inv.usedAt || account.status === 'Active') throw new AuthFlowError('INVITE_USED')
  if (Date.now() > inv.expiresAt) throw new AuthFlowError('INVITE_EXPIRED')
  return { inv, account }
}

export const publicChallenge = (c: RecoveryChallengeRecord): RecoveryChallenge => ({
  challengeId: c.id,
  expiresAt: c.expiresAt,
  resendAvailableAt: c.resendAvailableAt,
  maxAttempts: P.otpMaxAttempts,
})

export const findChallenge = (id: string) => getState().challenges.find((c) => c.id === id)

export const passwordRecoveryOperations = {
  changePassword: ({ currentPassword, password }: { currentPassword: string; password: string }): Promise<void> =>
    respond(() => {
      const me = currentAccount()
      const sid = currentSession()?.id
      if (!me || !sid || me.status !== 'Active' || me.role === ACCOUNT_ADMIN_ROLE) throw new AuthFlowError('FORBIDDEN')
      if (!verifyPassword(me.id, currentPassword)) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors: { currentPassword: 'Current password is incorrect.' } })
      const error = passwordError(password)
      if (error) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors: { password: error } })
      update((d) => {
        setPassword(d, me.id, password)
        // This session continues; every other session for the account ends.
        endSessions(d, (x) => x.accountId === me.id && x.id !== sid, 'password_changed')
        recordAudit(d, { actor: { account: me, role: me.role }, action: 'Password changed', target: accountTarget(me), description: `${accountName(me)} changed their password. Other sessions were ended.` })
      })
    }),

  validateInvitation: (token: string): Promise<InvitationValidationResult> =>
    respond(() => {
      const { inv, account } = checkInvitation(token)
      return { email: account.email, firstName: account.firstName, lastName: account.lastName, role: account.role, expiresAt: inv.expiresAt }
    }),

  completeInvitation: ({ token, password }: { token: string; password: string }): Promise<void> =>
    respond(() => {
      const { account } = checkInvitation(token)
      const error = passwordError(password)
      if (error) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors: { password: error } })
      update((d) => {
        const now = Date.now()
        d.invitations = d.invitations.map((i) => (i.token === token ? { ...i, usedAt: now } : i))
        d.accounts = d.accounts.map((a) => (a.id === account.id ? { ...a, status: 'Active', activatedAt: a.activatedAt ?? now } : a))
        setPassword(d, account.id, password)
        recordAudit(d, { actor: { account, role: account.role }, action: 'Account activated', target: accountTarget(account), description: `${accountName(account)} activated their account and set an initial password.`, changes: [{ field: 'Status', from: 'Pending Activation', to: 'Active' }] })
      })
    }),

  requestPasswordReset: ({ identifier }: { identifier: string }): Promise<RecoveryChallenge> =>
    respond(() => {
      const email = normalizeEmail(identifier)
      if (!emailPattern.test(email)) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors: { identifier: 'Enter a valid email address.' } })
      const now = Date.now()
      const recent = (getState().recoveryRequests[email] ?? []).filter((t) => now - t < P.recoveryRequestWindowMs)
      if (recent.length >= P.recoveryRequestLimit) throw new AuthFlowError('RATE_LIMITED', { retryAt: recent[0] + P.recoveryRequestWindowMs })
      return update((d) => {
        d.recoveryRequests[email] = [...recent, now]
        const account = d.accounts.find((a) => a.email === email && a.status === 'Active')
        // A code a System Admin already issued for this account continues here instead of being replaced.
        const issued = account && d.challenges.find((c) => c.accountId === account.id && c.initiatedBy === 'admin' && c.code && c.expiresAt > now && c.attempts < P.otpMaxAttempts)
        if (issued) {
          d.latest.challenge = issued.id
          return publicChallenge(issued)
        }
        // Unknown or ineligible accounts get an identical challenge with no code; it can never verify.
        const c: RecoveryChallengeRecord = { id: randomToken(), identifier: email, accountId: account?.id ?? null, code: account ? randomOtp() : null, issuedAt: now, expiresAt: now + P.otpTtlMs, resendAvailableAt: now + P.otpResendCooldownMs, attempts: 0, resends: 0, windowStart: now, initiatedBy: 'self' }
        d.challenges = [...d.challenges, c]
        d.latest.challenge = c.id
        if (account) recordAudit(d, { actor: UNAUTHENTICATED_ACTOR, action: 'Password reset requested', target: accountTarget(account), description: `A password reset code was requested for ${account.email}.` })
        return publicChallenge(c)
      })
    }),

  verifyResetOtp: ({ challengeId, otp }: { challengeId: string; otp: string }): Promise<RecoveryAuthorization> =>
    respond((): RecoveryAuthorization => {
      const c = findChallenge(challengeId)
      if (!c) throw new AuthFlowError('OTP_INVALID')
      if (c.attempts >= P.otpMaxAttempts) throw new AuthFlowError('TOO_MANY_ATTEMPTS', { retryAt: c.resendAvailableAt })
      if (Date.now() > c.expiresAt) throw new AuthFlowError('OTP_EXPIRED')
      if (!/^\d{6}$/.test(otp)) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors: { otp: 'Enter all 6 digits.' } })
      const found = c.accountId !== null ? findAccount(c.accountId) : undefined
      // An account deactivated mid-flow can no longer verify.
      const account = found?.status === 'Active' ? found : undefined
      if (!account || c.code !== otp) {
        const attempts = c.attempts + 1
        update((d) => {
          d.challenges = d.challenges.map((x) => (x.id === challengeId ? { ...x, attempts } : x))
          if (account) recordAudit(d, { actor: UNAUTHENTICATED_ACTOR, action: 'OTP verification failed', target: accountTarget(account), result: attempts >= P.otpMaxAttempts ? 'Blocked' : 'Failed', description: attempts >= P.otpMaxAttempts ? 'Verification code attempt limit reached.' : `Incorrect verification code (attempt ${attempts} of ${P.otpMaxAttempts}).` })
        })
        if (attempts >= P.otpMaxAttempts) throw new AuthFlowError('TOO_MANY_ATTEMPTS', { retryAt: c.resendAvailableAt })
        throw new AuthFlowError('OTP_INVALID')
      }
      return update((d) => {
        d.challenges = d.challenges.filter((x) => x.id !== challengeId)
        const token = randomToken()
        const expiresAt = Date.now() + P.recoveryAuthTtlMs
        d.recoveryAuthorizations = [...d.recoveryAuthorizations, { token, accountId: account.id, expiresAt, usedAt: null }]
        d.latest.recovery = token
        recordAudit(d, { actor: UNAUTHENTICATED_ACTOR, action: 'OTP verified', target: accountTarget(account), description: 'Verification code accepted; password reset authorized for 10 minutes.' })
        return { token, expiresAt }
      })
    }),

  resendResetOtp: ({ challengeId }: { challengeId: string }): Promise<RecoveryChallenge> =>
    respond(() => {
      const c = findChallenge(challengeId)
      if (!c) throw new AuthFlowError('RECOVERY_EXPIRED')
      const now = Date.now()
      if (now < c.resendAvailableAt) throw new AuthFlowError('RATE_LIMITED', { retryAt: c.resendAvailableAt })
      const windowOpen = now - c.windowStart < P.recoveryRequestWindowMs
      if (c.resends >= P.otpMaxResends && windowOpen) throw new AuthFlowError('RATE_LIMITED', { retryAt: c.windowStart + P.recoveryRequestWindowMs })
      return update((d) => {
        // Resending replaces the challenge so the previous code can no longer be used.
        const fresh: RecoveryChallengeRecord = { ...c, id: randomToken(), code: c.accountId === null ? null : randomOtp(), issuedAt: now, expiresAt: now + P.otpTtlMs, resendAvailableAt: now + P.otpResendCooldownMs, attempts: 0, resends: windowOpen ? c.resends + 1 : 1, windowStart: windowOpen ? c.windowStart : now }
        d.challenges = [...d.challenges.filter((x) => x.id !== challengeId), fresh]
        d.latest.challenge = fresh.id
        return publicChallenge(fresh)
      })
    }),

  resetPassword: ({ recoveryAuthorization, password }: { recoveryAuthorization: string; password: string }): Promise<void> =>
    respond(() => {
      const r = getState().recoveryAuthorizations.find((x) => x.token === recoveryAuthorization)
      if (!r || r.usedAt || Date.now() > r.expiresAt) throw new AuthFlowError('RECOVERY_EXPIRED')
      const error = passwordError(password)
      if (error) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors: { password: error } })
      const account = findAccount(r.accountId)
      if (!account || account.status !== 'Active') {
        update((d) => void (d.recoveryAuthorizations = d.recoveryAuthorizations.map((x) => (x.token === recoveryAuthorization ? { ...x, usedAt: Date.now() } : x))))
        throw new AuthFlowError('RECOVERY_EXPIRED')
      }
      update((d) => {
        d.recoveryAuthorizations = d.recoveryAuthorizations.map((x) => (x.token === recoveryAuthorization ? { ...x, usedAt: Date.now() } : x))
        setPassword(d, account.id, password)
        // Revoke sessions; status and login locks are intentionally left unchanged.
        endSessions(d, (s) => s.accountId === account.id, 'password_reset')
        recordAudit(d, { actor: UNAUTHENTICATED_ACTOR, action: 'Password reset completed', target: accountTarget(account), description: `Password reset completed for ${account.email}. Existing sessions were ended.` })
      })
    }),
}

/** Updates the signed-in account's editable profile fields. Email and role are never changed here. */
export async function updateOwnProfile(input: { firstName: string; lastName: string }): Promise<Account> {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const fieldErrors: Record<string, string> = {}
  if (!firstName) fieldErrors.firstName = 'First name is required.'
  if (!lastName) fieldErrors.lastName = 'Last name is required.'
  return respond(() => {
    const me = currentAccount()
    if (!me) throw new AuthFlowError('FORBIDDEN')
    if (Object.keys(fieldErrors).length) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors })
    return update((d) => {
      const before = d.accounts.find((a) => a.id === me.id)!
      const nameChanged = before.firstName !== firstName || before.lastName !== lastName
      const next: Account = { ...before, firstName, lastName, displayName: nameChanged ? undefined : before.displayName }
      d.accounts = d.accounts.map((a) => (a.id === me.id ? next : a))
      const changes = [
        ...(before.firstName !== firstName ? [{ field: 'First name', from: before.firstName, to: firstName }] : []),
        ...(before.lastName !== lastName ? [{ field: 'Last name', from: before.lastName, to: lastName }] : []),
      ]
      if (changes.length) recordAudit(d, { actor: { account: before, role: before.role }, action: 'Account edited', target: accountTarget(before), description: `${accountName(before)} updated their own profile.`, changes })
      return next
    })
  })
}

