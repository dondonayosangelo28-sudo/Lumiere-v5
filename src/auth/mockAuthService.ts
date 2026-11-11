/*
 * DEMO ENVIRONMENT ONLY — mock implementation of the future authentication API.
 *
 * - Backed by the shared synthetic store in ./store (browser storage, synced across tabs).
 *   Browser storage is not secure credential storage; this is not production authentication.
 * - No email is sent. OTPs and invitation links are exposed only via development-only tools.
 * - Role checks here and in the UI are presentational. The real backend must enforce them.
 * - Password-based sign-in and sessions arrive in Phase 2; the store already holds their data.
 */
import { passwordError } from './passwordPolicy'
import { currentAccount, currentSession, isSessionLive } from './session'
import {
  ROLES,
  UNAUTHENTICATED_ACTOR,
  accountName,
  accountTarget,
  currentInvitation,
  emailInUse,
  emailPattern,
  endSessions,
  findAccount,
  getState,
  invitationCondition,
  lockInfo,
  normalizeEmail,
  randomOtp,
  randomId,
  randomToken,
  recordAudit,
  runAuditOperation,
  resetDemoState,
  securityPolicy as P,
  sessionRef,
  setPassword,
  storeRevision,
  subscribe,
  update,
  type Account,
  type AuditActor,
  type DemoState,
  type RecoveryChallengeRecord,
  verifyPassword,
} from './store'
import {
  AuthFlowError,
  type AuthService,
  type CreatedAccount,
  type UpdateAccountResult,
  type InvitationReceipt,
  type RecoveryAuthorization,
  type RecoveryChallenge,
} from './types'

export const ACCOUNT_ADMIN_ROLE = 'System Admin'
export const ASSIGNABLE_ROLES: readonly string[] = Object.freeze(ROLES.filter((role) => role !== ACCOUNT_ADMIN_ROLE))

// The actor is always the account holding the current session; callers cannot name one.
// A real backend must authorize this from its own session, not from client input.
function requireAdmin(): AuditActor {
  const a = currentAccount()
  if (!a || a.role !== ACCOUNT_ADMIN_ROLE) throw new AuthFlowError('FORBIDDEN')
  return { account: a, role: a.role }
}


/** Why this account cannot be deactivated by this actor, or null when it can. Mirrors the service checks. */
export function deactivationBlock(target: Account, actorId: number | undefined): string | null {
  if (target.id === actorId) return 'You cannot deactivate your own account.'
  const activeAdmins = getState().accounts.filter((a) => a.role === ACCOUNT_ADMIN_ROLE && a.status === 'Active')
  if (target.role === ACCOUNT_ADMIN_ROLE && target.status === 'Active' && activeAdmins.length <= 1) return 'The last active System Admin cannot be deactivated.'
  return null
}

// Short simulated latency; also applies the one-shot network failure switch.
async function respond<T>(fn: () => T, ms = 450 + Math.random() * 350): Promise<T> {
  await new Promise((r) => setTimeout(r, ms))
  if (getState().failNextRequest) {
    update((d) => void (d.failNextRequest = false))
    throw new AuthFlowError('NETWORK_ERROR')
  }
  return runAuditOperation(randomId('op'), fn)
}

function issueInvitation(d: DemoState, account: Account): InvitationReceipt {
  const now = Date.now()
  // A new invitation supersedes every earlier one for this account.
  d.invitations = d.invitations.map((i) => (i.accountId === account.id && !i.revokedAt && !i.usedAt ? { ...i, revokedAt: now } : i))
  const token = randomToken()
  d.invitations.push({ token, accountId: account.id, email: account.email, issuedAt: now, expiresAt: now + P.inviteTtlMs, usedAt: null, revokedAt: null })
  d.latest.invitation = token
  d.inviteCooldowns[account.id] = now + P.inviteResendCooldownMs
  return { invitationExpiresAt: now + P.inviteTtlMs, resendAvailableAt: now + P.inviteResendCooldownMs }
}

function checkInvitation(token: string) {
  const inv = getState().invitations.find((i) => i.token === token)
  const account = inv && findAccount(inv.accountId)
  if (!inv || !account || inv.revokedAt || account.status === 'Inactive') throw new AuthFlowError('INVITE_INVALID')
  if (inv.usedAt || account.status === 'Active') throw new AuthFlowError('INVITE_USED')
  if (Date.now() > inv.expiresAt) throw new AuthFlowError('INVITE_EXPIRED')
  return { inv, account }
}

const publicChallenge = (c: RecoveryChallengeRecord): RecoveryChallenge => ({ challengeId: c.id, expiresAt: c.expiresAt, resendAvailableAt: c.resendAvailableAt, maxAttempts: P.otpMaxAttempts })
const findChallenge = (id: string) => getState().challenges.find((c) => c.id === id)

export const authService: AuthService = {
  createUser: (input) =>
    respond((): CreatedAccount => {
      const actor = requireAdmin()
      const firstName = input.firstName.trim()
      const lastName = input.lastName.trim()
      const email = normalizeEmail(input.email)
      const fieldErrors: Record<string, string> = {}
      if (!firstName) fieldErrors.firstName = 'First name is required.'
      if (!lastName) fieldErrors.lastName = 'Last name is required.'
      if (!emailPattern.test(email)) fieldErrors.email = 'Enter a valid email address.'
      if (!ASSIGNABLE_ROLES.includes(input.role)) fieldErrors.role = 'Select a supported role. System Admin accounts cannot be created here.'
      if (Object.keys(fieldErrors).length) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors })
      if (emailInUse(email)) throw new AuthFlowError('EMAIL_ALREADY_EXISTS', { fieldErrors: { email: 'An account with this email address already exists.' } })
      return update((d) => {
        const account: Account = { id: d.nextAccountId++, firstName, lastName, email, role: input.role as Account['role'], status: 'Pending Activation', createdAt: Date.now(), lastLoginAt: null, activatedAt: null }
        d.accounts = [...d.accounts, account]
        const receipt = issueInvitation(d, account)
        recordAudit(d, { actor, action: 'Account created', target: accountTarget(account), description: `Created ${account.role} account for ${accountName(account)} and sent an invitation.` })
        return { userId: account.id, firstName, lastName, email, role: account.role, status: 'Pending Activation' as const, invitationExpiresAt: receipt.invitationExpiresAt }
      })
    }),

  resendInvitation: (userId) =>
    respond(() => {
      const actor = requireAdmin()
      const account = findAccount(userId)
      if (!account || account.status !== 'Pending Activation') throw new AuthFlowError('ACCOUNT_INELIGIBLE')
      const until = getState().inviteCooldowns[userId] ?? 0
      if (Date.now() < until) throw new AuthFlowError('RATE_LIMITED', { retryAt: until })
      return update((d) => {
        const receipt = issueInvitation(d, account)
        recordAudit(d, { actor, action: 'Invitation resent', target: accountTarget(account), description: `Sent a replacement invitation to ${account.email}. The previous invitation no longer works.` })
        return receipt
      })
    }),

  updateAccount: (userId, input) =>
    respond((): UpdateAccountResult => {
      const actor = requireAdmin()
      const target = findAccount(userId)
      if (!target) throw new AuthFlowError('ACCOUNT_NOT_FOUND')
      if ('role' in input && input.role !== target.role) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors: { role: 'An account’s role cannot be changed.' } })
      const firstName = input.firstName.trim()
      const lastName = input.lastName.trim()
      const email = normalizeEmail(input.email)
      const fieldErrors: Record<string, string> = {}
      if (!firstName) fieldErrors.firstName = 'First name is required.'
      if (!lastName) fieldErrors.lastName = 'Last name is required.'
      if (!emailPattern.test(email)) fieldErrors.email = 'Enter a valid email address.'
      if (Object.keys(fieldErrors).length) throw new AuthFlowError('VALIDATION_ERROR', { fieldErrors })
      if (emailInUse(email, userId)) throw new AuthFlowError('EMAIL_ALREADY_EXISTS', { fieldErrors: { email: 'An account with this email address already exists.' } })
      const nameChanged = target.firstName !== firstName || target.lastName !== lastName
      const emailChanged = target.email !== email
      const changes = [
        ...(target.firstName !== firstName ? [{ field: 'First name', from: target.firstName, to: firstName }] : []),
        ...(target.lastName !== lastName ? [{ field: 'Last name', from: target.lastName, to: lastName }] : []),
        ...(emailChanged ? [{ field: 'Email', from: target.email, to: email }] : []),
      ]
      if (!changes.length) return { changed: false, emailChanged: false, invitationReplaced: false }
      return update((d) => {
        // Role is intentionally never part of this update.
        const next: Account = { ...target, firstName, lastName, email, displayName: nameChanged ? undefined : target.displayName }
        d.accounts = d.accounts.map((a) => (a.id === userId ? next : a))
        recordAudit(d, { actor, action: 'Account edited', target: accountTarget(next), description: `Updated details for ${accountName(next)}.`, changes })
        if (emailChanged && target.status === 'Pending Activation') {
          const receipt = issueInvitation(d, next)
          recordAudit(d, { actor, action: 'Invitation replaced', target: accountTarget(next), description: `Email changed, so the previous invitation was replaced and a new one sent to ${email}.` })
          return { changed: true, emailChanged, invitationReplaced: true, invitationExpiresAt: receipt.invitationExpiresAt }
        }
        return { changed: true, emailChanged, invitationReplaced: false }
      })
    }),

  deactivateAccount: (userId) =>
    respond(() => {
      const actor = requireAdmin()
      const target = findAccount(userId)
      if (!target) throw new AuthFlowError('ACCOUNT_NOT_FOUND')
      if (target.id === actor.account!.id) throw new AuthFlowError('SELF_DEACTIVATION')
      if (target.status === 'Inactive') throw new AuthFlowError('ACCOUNT_INELIGIBLE')
      if (deactivationBlock(target, actor.account!.id)) throw new AuthFlowError('LAST_SYSTEM_ADMIN')
      update((d) => {
        const now = Date.now()
        d.accounts = d.accounts.map((a) => (a.id === userId ? { ...a, status: 'Inactive' as const } : a))
        d.invitations = d.invitations.map((i) => (i.accountId === userId && !i.revokedAt && !i.usedAt ? { ...i, revokedAt: now } : i))
        const ended = endSessions(d, (s) => s.accountId === userId, 'deactivated')
        recordAudit(d, { actor, action: 'Account deactivated', target: accountTarget(target), description: `Deactivated ${accountName(target)}.${ended.length ? ` ${ended.length} active session(s) ended.` : ''}`, changes: [{ field: 'Status', from: target.status, to: 'Inactive' }] })
      })
    }),

  deleteAccount: (userId) =>
    respond(() => {
      const actor = requireAdmin()
      const target = findAccount(userId)
      if (!target) throw new AuthFlowError('ACCOUNT_NOT_FOUND')
      if (target.id === actor.account!.id) throw new AuthFlowError('SELF_DEACTIVATION')
      if (deactivationBlock(target, actor.account!.id)) throw new AuthFlowError('LAST_SYSTEM_ADMIN')
      if (target.status !== 'Inactive' || target.deletedAt) throw new AuthFlowError('ACCOUNT_INELIGIBLE')
      update((d) => {
        const now = Date.now()
        d.accounts = d.accounts.map((a) => a.id === userId ? { ...a, deletedAt: now } : a)
        d.invitations = d.invitations.map((i) => i.accountId === userId && !i.revokedAt && !i.usedAt ? { ...i, revokedAt: now } : i)
        endSessions(d, (s) => s.accountId === userId, 'deactivated')
        recordAudit(d, { actor, action: 'Account deleted', target: accountTarget(target), description: `Soft-deleted ${accountName(target)} (${target.email}). The account is available in Deleted Users.` })
      })
    }),

  restoreAccount: (userId) =>
    respond(() => {
      const actor = requireAdmin()
      const target = findAccount(userId)
      if (!target) throw new AuthFlowError('ACCOUNT_NOT_FOUND')
      if (!target.deletedAt || target.status !== 'Inactive') throw new AuthFlowError('ACCOUNT_INELIGIBLE')
      update((d) => {
        d.accounts = d.accounts.map((a) => a.id === userId ? { ...a, deletedAt: undefined, status: 'Inactive' as const } : a)
        recordAudit(d, { actor, action: 'Account restored', target: accountTarget(target), description: `Restored ${accountName(target)} to All Users. The account remains inactive until explicitly reactivated.` })
      })
    }),

  reactivateAccount: (userId) =>
    respond(() => {
      const actor = requireAdmin()
      const target = findAccount(userId)
      if (!target) throw new AuthFlowError('ACCOUNT_NOT_FOUND')
      if (target.status !== 'Inactive' || target.deletedAt) throw new AuthFlowError('ACCOUNT_INELIGIBLE')
      return update((d) => {
        const status = target.activatedAt ? ('Active' as const) : ('Pending Activation' as const)
        d.accounts = d.accounts.map((a) => (a.id === userId ? { ...a, status, deletedAt: undefined } : a))
        const receipt = status === 'Pending Activation' ? issueInvitation(d, target) : null
        recordAudit(d, { actor, action: 'Account reactivated', target: accountTarget(target), description: `Reactivated ${accountName(target)}; status is now ${status}.${receipt ? ' A fresh invitation was sent.' : ''}`, changes: [{ field: 'Status', from: 'Inactive', to: status }] })
        return { status, invitationExpiresAt: receipt?.invitationExpiresAt }
      })
    }),

  unlockAccount: (userId) =>
    respond(() => {
      const actor = requireAdmin()
      const target = findAccount(userId)
      if (!target) throw new AuthFlowError('ACCOUNT_NOT_FOUND')
      if (!lockInfo(userId).locked) throw new AuthFlowError('NOT_LOCKED')
      update((d) => {
        d.locks = d.locks.filter((l) => l.accountId !== userId)
        recordAudit(d, { actor, action: 'Account unlocked', target: accountTarget(target), description: `Unlocked ${accountName(target)} and cleared failed sign-in attempts.` })
      })
    }),

  endSession: (sessionId) =>
    respond(() => {
      const actor = requireAdmin()
      const session = getState().sessions.find((s) => s.id === sessionId)
      if (!session || !isSessionLive(session)) throw new AuthFlowError('SESSION_NOT_ACTIVE')
      if (session.id === currentSession()?.id) throw new AuthFlowError('CURRENT_SESSION')
      const owner = findAccount(session.accountId)!
      update((d) => {
        const ended = endSessions(d, (s) => s.id === sessionId, 'ended_by_admin')
        if (!ended.length) throw new AuthFlowError('SESSION_NOT_ACTIVE')
        recordAudit(d, { actor, action: 'Session ended by admin', target: { type: 'session', id: sessionRef(sessionId), label: `${accountName(owner)} (${owner.email})` }, description: `Ended the ${session.device} session for ${accountName(owner)}. Their other sessions were not affected.` })
      })
    }),

  initiatePasswordReset: (userId) =>
    respond(() => {
      const actor = requireAdmin()
      const target = findAccount(userId)
      if (!target) throw new AuthFlowError('ACCOUNT_NOT_FOUND')
      if (target.status !== 'Active') throw new AuthFlowError('ACCOUNT_INELIGIBLE')
      const now = Date.now()
      const recent = (getState().recoveryRequests[target.email] ?? []).filter((t) => now - t < P.recoveryRequestWindowMs)
      if (recent.length >= P.recoveryRequestLimit) throw new AuthFlowError('RATE_LIMITED', { retryAt: recent[0] + P.recoveryRequestWindowMs })
      return update((d) => {
        d.recoveryRequests[target.email] = [...recent, now]
        // Same challenge record the self-service flow issues; the code stays in the store and is never audited.
        const c: RecoveryChallengeRecord = { id: randomToken(), identifier: target.email, accountId: target.id, code: randomOtp(), issuedAt: now, expiresAt: now + P.otpTtlMs, resendAvailableAt: now + P.otpResendCooldownMs, attempts: 0, resends: 0, windowStart: now, initiatedBy: 'admin' }
        d.challenges = [...d.challenges, c]
        d.latest.challenge = c.id
        recordAudit(d, { actor, action: 'Password reset requested', target: accountTarget(target), description: `A System Admin initiated a password reset for ${target.email}. A verification code was issued; it expires in 5 minutes.` })
        return { expiresAt: c.expiresAt }
      })
    }),

  changePassword: ({ currentPassword, password }) =>
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

  validateInvitation: (token) =>
    respond(() => {
      const { inv, account } = checkInvitation(token)
      return { email: account.email, firstName: account.firstName, lastName: account.lastName, role: account.role, expiresAt: inv.expiresAt }
    }),

  completeInvitation: ({ token, password }) =>
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

  requestPasswordReset: ({ identifier }) =>
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

  verifyResetOtp: ({ challengeId, otp }) =>
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

  resendResetOtp: ({ challengeId }) =>
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

  resetPassword: ({ recoveryAuthorization, password }) =>
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

/* ---------- Read model for the Account Management screen ---------- */

export const subscribeAccounts = subscribe
export const accountsVersion = storeRevision

export const getInvitationExpiry = (userId: number) => currentInvitation(userId)?.expiresAt
export const getResendAvailableAt = (userId: number) => getState().inviteCooldowns[userId] ?? 0

/* ---------- Development-only helpers for the Prototype tools panel ---------- */

const devOnly = <T,>(fn: () => T, fallback: T) => (import.meta.env.DEV ? fn() : fallback)

// Newest challenge issued to an eligible account (the one reviewers can actually complete).
const eligibleChallenge = () => [...getState().challenges].filter((c) => c.code).sort((a, b) => b.issuedAt - a.issuedAt)[0]
const latestChallenge = () => eligibleChallenge() ?? getState().challenges.find((c) => c.id === getState().latest.challenge)

export const demoAccounts = { eligible: 'eventmanager@demo.com', ineligible: 'Pending Activation and Inactive accounts' }

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

/* ---------- Own profile ---------- */

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
