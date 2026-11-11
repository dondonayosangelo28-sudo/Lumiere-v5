import { isAuthError, type AuthErrorCode } from './types'

const messages: Record<AuthErrorCode, string> = {
  VALIDATION_ERROR: 'Check the highlighted fields and try again.',
  FORBIDDEN: 'Only a System Admin can perform this action.',
  EMAIL_ALREADY_EXISTS: 'An account with this email address already exists.',
  ACCOUNT_INELIGIBLE: 'This action is not available for the account in its current state.',
  ACCOUNT_NOT_FOUND: 'This account no longer exists.',
  SELF_DEACTIVATION: 'You cannot deactivate your own account.',
  LAST_SYSTEM_ADMIN: 'The last active System Admin cannot be deactivated.',
  NOT_LOCKED: 'This account is not locked.',
  SESSION_NOT_ACTIVE: 'This session has already ended or expired.',
  CURRENT_SESSION: 'This is your current session. Use Log out instead.',
  INVITE_INVALID: 'This invitation link is not valid.',
  INVITE_EXPIRED: 'This invitation has expired.',
  INVITE_USED: 'This invitation has already been used.',
  OTP_INVALID: 'The code is incorrect or no longer valid.',
  OTP_EXPIRED: 'This code has expired. Request a new code.',
  TOO_MANY_ATTEMPTS: 'Too many attempts. Please request a new code when available.',
  RATE_LIMITED: 'Too many requests. Please wait before trying again.',
  RECOVERY_EXPIRED: 'Your verification has expired. Start password recovery again.',
  NETWORK_ERROR: "We couldn't reach the server. Check your connection and try again.",
}

export function authMessage(error: unknown) {
  return isAuthError(error) ? messages[error.code] : messages.NETWORK_ERROR
}

export function formatWait(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
