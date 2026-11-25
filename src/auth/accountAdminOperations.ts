import { currentAccount, currentSession, isSessionLive } from './session'
import {
  ROLES,
  accountName,
  accountTarget,
  currentInvitation,
  emailInUse,
  emailPattern,
  endSessions,
  findAccount,
  getState,
  lockInfo,
  normalizeEmail,
  randomOtp,
  randomToken,
  recordAudit,
  securityPolicy as P,
  sessionRef,
  update,
  type Account,
  type AuditActor,
  type DemoState,
  type RecoveryChallengeRecord,
} from './store'
import {
  AuthFlowError,
  type CreatedAccount,
  type CreateUserInput,
  type InvitationReceipt,
  type UpdateAccountInput,
  type UpdateAccountResult,
} from './types'
import { respond } from './mockTransport'

export const ACCOUNT_ADMIN_ROLE = 'System Admin'
export const ASSIGNABLE_ROLES: readonly string[] = Object.freeze(ROLES.filter((role) => role !== ACCOUNT_ADMIN_ROLE))

// The actor is always the account holding the current session; callers cannot name one.
// A real backend must authorize this from its own session, not from client input.
export function requireAdmin(): AuditActor {
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

export function issueInvitation(d: DemoState, account: Account): InvitationReceipt {
  const now = Date.now()
  // A new invitation supersedes every earlier one for this account.
  d.invitations = d.invitations.map((i) => (i.accountId === account.id && !i.revokedAt && !i.usedAt ? { ...i, revokedAt: now } : i))
  const token = randomToken()
  d.invitations.push({ token, accountId: account.id, email: account.email, issuedAt: now, expiresAt: now + P.inviteTtlMs, usedAt: null, revokedAt: null })
  d.latest.invitation = token
  d.inviteCooldowns[account.id] = now + P.inviteResendCooldownMs
  return { invitationExpiresAt: now + P.inviteTtlMs, resendAvailableAt: now + P.inviteResendCooldownMs }
}

export const getInvitationExpiry = (userId: number) => currentInvitation(userId)?.expiresAt
export const getResendAvailableAt = (userId: number) => getState().inviteCooldowns[userId] ?? 0

export const accountAdminOperations = {
  createUser: (input: CreateUserInput): Promise<CreatedAccount> =>
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

  resendInvitation: (userId: number): Promise<InvitationReceipt> =>
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

  updateAccount: (userId: number, input: UpdateAccountInput): Promise<UpdateAccountResult> =>
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

  deactivateAccount: (userId: number): Promise<void> =>
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

  deleteAccount: (userId: number): Promise<void> =>
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

  restoreAccount: (userId: number): Promise<void> =>
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

  reactivateAccount: (userId: number): Promise<{ status: 'Active' | 'Pending Activation'; invitationExpiresAt?: number }> =>
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

  unlockAccount: (userId: number): Promise<void> =>
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

  endSession: (sessionId: string): Promise<void> =>
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

  initiatePasswordReset: (userId: number): Promise<{ expiresAt: number }> =>
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
}
