// Frontend contracts for the future authentication backend.
// The mock service implements these; a real API client should keep the same shapes.

export type AuthErrorCode =
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'EMAIL_ALREADY_EXISTS'
  | 'ACCOUNT_INELIGIBLE'
  | 'INVITE_INVALID'
  | 'INVITE_EXPIRED'
  | 'INVITE_USED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'TOO_MANY_ATTEMPTS'
  | 'RATE_LIMITED'
  | 'RECOVERY_EXPIRED'
  | 'NETWORK_ERROR'
  | 'ACCOUNT_NOT_FOUND'
  | 'SELF_DEACTIVATION'
  | 'LAST_SYSTEM_ADMIN'
  | 'NOT_LOCKED'
  | 'SESSION_NOT_ACTIVE'
  | 'CURRENT_SESSION'

export class AuthFlowError extends Error {
  code: AuthErrorCode
  fieldErrors?: Record<string, string>
  retryAt?: number
  constructor(code: AuthErrorCode, options: { fieldErrors?: Record<string, string>; retryAt?: number } = {}) {
    super(code)
    this.name = 'AuthFlowError'
    this.code = code
    this.fieldErrors = options.fieldErrors
    this.retryAt = options.retryAt
  }
}

export const isAuthError = (e: unknown): e is AuthFlowError => e instanceof AuthFlowError

/** Role names come from the existing role model in src/data.ts. */
export interface CreateUserInput {
  firstName: string
  lastName: string
  email: string
  role: string
}

export interface CreatedAccount {
  userId: number
  firstName: string
  lastName: string
  email: string
  role: string
  status: 'Pending Activation'
  invitationExpiresAt: number
}

export interface InvitationReceipt {
  invitationExpiresAt: number
  resendAvailableAt: number
}

export interface InvitationValidationResult {
  email: string
  firstName: string
  lastName: string
  role: string
  expiresAt: number
}

/** Public recovery response. It intentionally never includes the OTP or whether the account exists. */
export interface RecoveryChallenge {
  challengeId: string
  expiresAt: number
  resendAvailableAt: number
  maxAttempts: number
}

export interface RecoveryAuthorization {
  token: string
  expiresAt: number
}

export interface UpdateAccountInput {
  firstName: string
  lastName: string
  email: string
}

export interface UpdateAccountResult {
  changed: boolean
  emailChanged: boolean
  /** True when a pending account's email changed and its invitation was replaced. */
  invitationReplaced: boolean
  invitationExpiresAt?: number
}

export interface AuthService {
  createUser(input: CreateUserInput): Promise<CreatedAccount>
  resendInvitation(userId: number): Promise<InvitationReceipt>
  updateAccount(userId: number, input: UpdateAccountInput): Promise<UpdateAccountResult>
  deactivateAccount(userId: number): Promise<void>
  deleteAccount(userId: number): Promise<void>
  restoreAccount(userId: number): Promise<void>
  reactivateAccount(userId: number): Promise<{ status: 'Active' | 'Pending Activation'; invitationExpiresAt?: number }>
  unlockAccount(userId: number): Promise<void>
  endSession(sessionId: string): Promise<void>
  initiatePasswordReset(userId: number): Promise<{ expiresAt: number }>
  changePassword(input: { currentPassword: string; password: string }): Promise<void>
  validateInvitation(token: string): Promise<InvitationValidationResult>
  completeInvitation(input: { token: string; password: string }): Promise<void>
  requestPasswordReset(input: { identifier: string }): Promise<RecoveryChallenge>
  verifyResetOtp(input: { challengeId: string; otp: string }): Promise<RecoveryAuthorization>
  resendResetOtp(input: { challengeId: string }): Promise<RecoveryChallenge>
  resetPassword(input: { recoveryAuthorization: string; password: string }): Promise<void>
}
