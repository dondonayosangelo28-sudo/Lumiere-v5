/*
 * DEMO ENVIRONMENT ONLY — mock implementation of the future authentication API.
 *
 * - Backed by the shared synthetic store in ./store (browser storage, synced across tabs).
 *   Browser storage is not secure credential storage; this is not production authentication.
 * - No email is sent. OTPs and invitation links are exposed only via development-only tools.
 * - Role checks here and in the UI are presentational. The real backend must enforce them.
 * - Password-based sign-in and sessions arrive in Phase 2; the store already holds their data.
 */
import { storeRevision, subscribe } from './store'
import type { AuthService } from './types'
import {
  ACCOUNT_ADMIN_ROLE,
  ASSIGNABLE_ROLES,
  accountAdminOperations,
  deactivationBlock,
  getInvitationExpiry,
  getResendAvailableAt,
} from './accountAdminOperations'
import {
  passwordRecoveryOperations,
  updateOwnProfile,
} from './passwordRecoveryOperations'
import { demoAccounts, prototypeAuth } from './prototypeAuth'

export const authService: AuthService = {
  ...accountAdminOperations,
  ...passwordRecoveryOperations,
}

/* ---------- Read model for the Account Management screen ---------- */

export const subscribeAccounts = subscribe
export const accountsVersion = storeRevision

export {
  ACCOUNT_ADMIN_ROLE,
  ASSIGNABLE_ROLES,
  deactivationBlock,
  getInvitationExpiry,
  getResendAvailableAt,
  demoAccounts,
  prototypeAuth,
  updateOwnProfile,
}
