/*
 * DEMO ENVIRONMENT ONLY — shared synthetic data layer for the Lumiere authentication prototype.
 *
 * Everything here (accounts, mock credentials, sessions, invitations, recovery state, audit events)
 * is synthetic demonstration data kept in browser storage. Browser storage is NOT secure credential
 * storage and this module is NOT production authentication. A real backend must own all of this.
 */

import { passwordPolicy } from './passwordPolicy'
import { prototypeStorageLimits } from './prototypeStorageLimits'
import { removeSampleUsers } from './removeSampleUsers'
import type { SummarySnapshot } from './summarySnapshots'

export const STORE_VERSION = 1
const STORAGE_KEY = 'lumiere.demo.store'

/* ---------- Roles ---------- */

export const ROLES = ['System Admin', 'Executive', 'Event Manager', 'Warehouse Operations Manager', 'Ground Crew'] as const
export type Role = (typeof ROLES)[number]
export const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value)

/* ---------- Policy (read-only prototype defaults) ---------- */

const MIN = 60_000
export const securityPolicy = {
  passwordMinLength: passwordPolicy.minLength,
  passwordMaxLength: passwordPolicy.maxLength,
  loginAttemptLimit: 5,
  lockDurationMs: 15 * MIN,
  inviteTtlMs: 24 * 60 * MIN,
  inviteResendCooldownMs: 30_000,
  otpTtlMs: 5 * MIN,
  otpMaxAttempts: 5,
  otpResendCooldownMs: MIN,
  otpMaxResends: 3,
  recoveryRequestWindowMs: 10 * MIN,
  recoveryRequestLimit: 5,
  recoveryAuthTtlMs: 10 * MIN,
  sessionIdleTimeoutMs: 30 * MIN,
} as const

/* ---------- Data structures ---------- */

/** Account lifecycle only. Invitation expiry and temporary locks are separate conditions. */
export type LifecycleStatus = 'Pending Activation' | 'Active' | 'Inactive'

export interface Account {
  id: number
  firstName: string
  lastName: string
  /** Stored normalized (trimmed, lowercase). */
  email: string
  /** Assigned at creation; never changed afterwards. */
  role: Role
  status: LifecycleStatus
  deletedAt?: number
  createdAt: number
  lastLoginAt: number | null
  /** Set once the initial activation completes; null means the account never activated. */
  activatedAt: number | null
  /** Seeded demo accounts display a fixed name. */
  displayName?: string
}

/** Synthetic mock credential. The digest is a non-cryptographic demo checksum, not real hashing. */
export interface Credential {
  accountId: number
  digest: string
  salt: string
  /** True while a seeded account still uses its demo123 exception. */
  seededDefault: boolean
  updatedAt: number
}

export interface LoginLock {
  accountId: number
  consecutiveFailures: number
  lockedUntil: number | null
  lockedAt: number | null
}

export type SessionEndReason = 'logout' | 'expired' | 'ended_by_admin' | 'deactivated' | 'password_reset' | 'password_changed' | 'demo_reset'

export interface Session {
  id: string
  accountId: number
  role: Role
  /** Browser label derived from the user agent, or "Unknown". Never IP or location data. */
  device: string
  startedAt: number
  lastActivityAt: number
  persistence: 'session' | 'local'
  status: 'active' | 'ended'
  endedAt: number | null
  endReason: SessionEndReason | null
}

export type AttemptResult = 'Success' | 'Failed' | 'Blocked'

export interface LoginAttempt {
  id: string
  correlationId?: string
  at: number
  email: string
  accountId: number | null
  role: Role | null
  result: AttemptResult
  reason?: string
}

export interface Invitation {
  token: string
  accountId: number
  email: string
  issuedAt: number
  expiresAt: number
  usedAt: number | null
  revokedAt: number | null
}

export interface RecoveryChallengeRecord {
  id: string
  identifier: string
  accountId: number | null
  /** Null for unknown/ineligible identifiers, so the challenge can never verify. */
  code: string | null
  issuedAt: number
  expiresAt: number
  resendAvailableAt: number
  attempts: number
  resends: number
  windowStart: number
  initiatedBy: 'self' | 'admin'
}

export interface RecoveryAuthorizationRecord {
  token: string
  accountId: number
  expiresAt: number
  usedAt: number | null
}

export type ActorRole = Role | 'Unauthenticated' | 'System'

export type AuditAction =
  | 'Login succeeded'
  | 'Login failed'
  | 'Login blocked'
  | 'Logout'
  | 'Session expired'
  | 'Session ended by admin'
  | 'Account created'
  | 'Invitation resent'
  | 'Invitation replaced'
  | 'Account activated'
  | 'Account edited'
  | 'Account deactivated'
  | 'Account deleted'
  | 'Account restored'
  | 'Account reactivated'
  | 'Password reset requested'
  | 'OTP verified'
  | 'OTP verification failed'
  | 'Password reset completed'
  | 'Password changed'
  | 'Account locked'
  | 'Account unlocked'

export const AUDIT_ACTIONS: AuditAction[] = [
  'Login succeeded', 'Login failed', 'Login blocked', 'Logout', 'Session expired', 'Session ended by admin',
  'Account created', 'Invitation resent', 'Invitation replaced', 'Account activated', 'Account edited', 'Account deactivated', 'Account deleted', 'Account restored', 'Account reactivated',
  'Account locked', 'Account unlocked', 'Password reset requested', 'OTP verified', 'OTP verification failed', 'Password reset completed', 'Password changed',
]

export interface AuditChange {
  field: string
  from: string
  to: string
}

export interface AuditEvent {
  id: string
  operationId?: string
  correlationId?: string
  at: number
  actor: { accountId: number | null; name: string; email: string | null; firstName?: string; lastName?: string }
  /** Role at the time of the event. */
  actorRole: ActorRole
  action: AuditAction
  target: { type: 'account' | 'session' | 'system'; id: string; label: string }
  result: AttemptResult
  description: string
  changes?: AuditChange[]
}

export interface DemoState {
  version: number
  summaryDemoSeededAt?: number
  additionalDemoUsersSeededAt?: number
  roleRankingDemoSeededAt?: number
  activityHistoryDemoSeededAt?: number
  summaryHistory?: readonly SummarySnapshot[]
  nextAccountId: number
  accounts: Account[]
  credentials: Credential[]
  locks: LoginLock[]
  sessions: Session[]
  loginAttempts: LoginAttempt[]
  invitations: Invitation[]
  inviteCooldowns: Record<number, number>
  challenges: RecoveryChallengeRecord[]
  recoveryRequests: Record<string, number[]>
  recoveryAuthorizations: RecoveryAuthorizationRecord[]
  audit: AuditEvent[]
  latest: { invitation: string | null; challenge: string | null; recovery: string | null }
  failNextRequest: boolean
}

/* ---------- Helpers ---------- */

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const randomToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
export const randomId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 12)}`
export const randomOtp = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')

// Demo-only checksum (FNV-1a). Deliberately simple: this is synthetic data, not credential security.
function demoDigest(password: string, salt: string) {
  let h = 0x811c9dc5
  const input = `${salt}:${password}`
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Short non-reversible reference for a session, safe to store in audit records. Never the session identifier itself. */
export const sessionRef = (sessionId: string) => `session-${demoDigest(sessionId, 'audit-ref')}`

export const accountName = (a: Pick<Account, 'firstName' | 'lastName' | 'displayName'>) => a.displayName ?? `${a.firstName} ${a.lastName}`.trim()

export function browserLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : null
  return browser ? `${browser}${os ? ` on ${os}` : ''}` : 'Unknown'
}

/* ---------- Seed ---------- */

export const DEMO_PASSWORD = 'demo123'
// Keeps store IDs distinct from the legacy sample rows in src/data.ts.
const ACCOUNT_ID_BASE = 100_000

const SEED: { email: string; role: Role; displayName: string; firstName: string; lastName: string }[] = [
  { email: 'admin@demo.com', role: 'System Admin', displayName: 'Demo System Admin', firstName: 'Demo', lastName: 'System Admin' },
  { email: 'executive@demo.com', role: 'Executive', displayName: 'Demo Executive', firstName: 'Demo', lastName: 'Executive' },
  { email: 'eventmanager@demo.com', role: 'Event Manager', displayName: 'Demo Event Manager', firstName: 'Demo', lastName: 'Event Manager' },
  { email: 'warehouseops@demo.com', role: 'Warehouse Operations Manager', displayName: 'Demo Warehouse Operations Manager', firstName: 'Demo', lastName: 'Warehouse Operations Manager' },
  { email: 'crew@demo.com', role: 'Ground Crew', displayName: 'Demo Ground Crew', firstName: 'Demo', lastName: 'Ground Crew' },
]

function seedState(): DemoState {
  const now = Date.now()
  const accounts: Account[] = SEED.map((s, i) => ({ id: ACCOUNT_ID_BASE + i + 1, ...s, status: 'Active', createdAt: now, lastLoginAt: null, activatedAt: now }))
  const credentials: Credential[] = accounts.map((a) => {
    const salt = randomToken().slice(0, 16)
    return { accountId: a.id, salt, digest: demoDigest(DEMO_PASSWORD, salt), seededDefault: true, updatedAt: now }
  })
  return {
    version: STORE_VERSION,
    nextAccountId: ACCOUNT_ID_BASE + accounts.length + 1,
    accounts,
    credentials,
    locks: [],
    sessions: [],
    loginAttempts: [],
    invitations: [],
    inviteCooldowns: {},
    challenges: [],
    recoveryRequests: {},
    recoveryAuthorizations: [],
    audit: [],
    latest: { invitation: null, challenge: null, recovery: null },
    failNextRequest: false,
  }
}

/* ---------- Persistence and cross-tab sync ---------- */

// Migrate legacy contact fields without resetting accounts, sessions, or email recovery.
function emailOnlyState(value: DemoState): DemoState {
  return JSON.parse(JSON.stringify(value), (key, item) => {
    if (/^(phone|phoneNumber|telephone|mobileNumber)$/i.test(key)) return undefined
    if (Array.isArray(item)) return item.filter((entry) => !entry || typeof entry !== 'object' || !/^phone( number)?$/i.test(entry.field ?? ''))
    return item
  }) as DemoState
}

function load(): DemoState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState
      // Versioned initialization: keep existing demo changes; only reseed on a schema change.
      if (parsed?.version === STORE_VERSION) {
        const migrated = removeSampleUsers(emailOnlyState(parsed))
        save(migrated)
        return migrated
      }
    }
  } catch {
    /* corrupted demo data falls through to a fresh seed */
  }
  const fresh = seedState()
  save(fresh)
  return fresh
}

function save(s: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* storage may be unavailable (private mode); state stays in memory */
  }
}

let state: DemoState = load()
let revision = 0
const listeners = new Set<() => void>()
const notify = () => {
  revision++
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    if (e.newValue === null) {
      state = load()
    } else {
      try {
        const next = JSON.parse(e.newValue) as DemoState
        if (next?.version === STORE_VERSION) {
          state = removeSampleUsers(emailOnlyState(next))
          if (JSON.stringify(state) !== e.newValue) save(state)
        }
      } catch {
        return
      }
    }
    notify()
  })
}

export const getState = (): Readonly<DemoState> => state
export const storeRevision = () => revision
export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The only write path: mutate a draft, then persist and notify (this tab + other tabs via storage). */
export function update<T>(mutator: (draft: DemoState) => T): T {
  const result = mutator(state)
  state = { ...state }
  save(state)
  notify()
  return result
}

export function resetDemoState() {
  state = seedState()
  save(state)
  notify()
}

/* ---------- Queries ---------- */

export const findAccount = (id: number) => state.accounts.find((a) => a.id === id)
export const findAccountByEmail = (email: string) => {
  const e = normalizeEmail(email)
  return state.accounts.find((a) => a.email === e)
}
export const emailInUse = (email: string, exceptId?: number) => {
  const a = findAccountByEmail(email)
  return !!a && a.id !== exceptId
}

export const currentInvitation = (accountId: number) =>
  [...state.invitations].reverse().find((i) => i.accountId === accountId && !i.revokedAt && !i.usedAt)

export type InvitationCondition = 'Valid invitation' | 'Expired Invitation' | null
export function invitationCondition(accountId: number, now = Date.now()): InvitationCondition {
  const a = findAccount(accountId)
  if (!a || a.status !== 'Pending Activation') return null
  const inv = currentInvitation(accountId)
  return inv && now <= inv.expiresAt ? 'Valid invitation' : 'Expired Invitation'
}

export function lockInfo(accountId: number, now = Date.now()) {
  const l = state.locks.find((x) => x.accountId === accountId)
  const locked = !!l?.lockedUntil && now < l.lockedUntil
  return { locked, lockedUntil: locked ? l!.lockedUntil : null, consecutiveFailures: l?.consecutiveFailures ?? 0 }
}

export const activeSessions = (accountId?: number) =>
  state.sessions.filter((s) => s.status === 'active' && (accountId === undefined || s.accountId === accountId))

/* ---------- Mock credentials ---------- */

/** Passwords are only ever compared here and never returned, logged, or displayed. */
export function verifyPassword(accountId: number, password: string) {
  const c = state.credentials.find((x) => x.accountId === accountId)
  return !!c && c.digest === demoDigest(password, c.salt)
}

/** Replaces the account's mock credential. Callers must validate the shared password policy first. */
export function setPassword(draft: DemoState, accountId: number, password: string) {
  const salt = randomToken().slice(0, 16)
  const next: Credential = { accountId, salt, digest: demoDigest(password, salt), seededDefault: false, updatedAt: Date.now() }
  draft.credentials = [...draft.credentials.filter((c) => c.accountId !== accountId), next]
}

/* ---------- Session primitives ---------- */

export function endSessions(draft: DemoState, predicate: (s: Session) => boolean, reason: SessionEndReason) {
  const now = Date.now()
  const ended: Session[] = []
  draft.sessions = draft.sessions.map((s) => {
    if (s.status !== 'active' || !predicate(s)) return s
    const e = { ...s, status: 'ended' as const, endedAt: now, endReason: reason }
    ended.push(e)
    return e
  })
  return ended
}

export function recordLoginAttempt(draft: DemoState, attempt: Omit<LoginAttempt, 'id' | 'at'>) {
  const correlationId = attempt.correlationId ?? randomId('op')
  const existing = draft.loginAttempts.find((entry) => entry.correlationId === correlationId)
  if (existing) return existing
  const entry = { id: randomId('att'), at: Date.now(), ...attempt, correlationId }
  draft.loginAttempts = [entry, ...draft.loginAttempts].slice(0, prototypeStorageLimits.loginAttempts)
  return entry
}

/* ---------- Audit ---------- */

const SECRET_FIELD = /password|token|otp|code|secret|digest|salt|credential/i
const SECRET_VALUE = /\b[a-f0-9]{32,}\b/gi
const scrub = (v: string) => v.replace(SECRET_VALUE, '[redacted]')

export type AuditActor = { account: Account | null; role?: ActorRole }
export const SYSTEM_ACTOR: AuditActor = { account: null, role: 'System' }
export const UNAUTHENTICATED_ACTOR: AuditActor = { account: null, role: 'Unauthenticated' }

let auditOperation: string | undefined

/** Scope a synchronous operation after async work completes; never span an await. */
export function runAuditOperation<T>(operationId: string, operation: () => T): T {
  const previous = auditOperation
  auditOperation = operationId
  try { return operation() } finally { auditOperation = previous }
}

/**
 * Single shared activity recorder. Strips secret-bearing fields, redacts token-shaped values,
 * and deduplicates only the same action/target within an explicitly identified operation.
 * Independent calls get independent IDs, even when their timestamps and descriptions match.
 */
export function recordAudit(
  draft: DemoState,
  input: { actor: AuditActor; action: AuditAction; target: AuditEvent['target']; result?: AttemptResult; description: string; changes?: AuditChange[]; operationId?: string; correlationId?: string },
): AuditEvent | null {
  const now = Date.now()
  const a = input.actor.account
  const operationId = input.operationId ?? auditOperation ?? randomId('op')
  const existing = draft.audit.find((event) => event.operationId === operationId && event.action === input.action && event.target.type === input.target.type && event.target.id === input.target.id)
  if (existing) return existing
  const event: AuditEvent = {
    id: randomId('evt'),
    operationId,
    correlationId: input.correlationId ?? operationId,
    at: now,
    actor: a ? { accountId: a.id, name: accountName(a), email: a.email, firstName: a.firstName, lastName: a.lastName } : { accountId: null, name: input.actor.role ?? 'System', email: null },
    actorRole: a ? (input.actor.role ?? a.role) : (input.actor.role ?? 'System'),
    action: input.action,
    target: { ...input.target, label: scrub(input.target.label) },
    result: input.result ?? 'Success',
    description: scrub(input.description),
    changes: input.changes?.filter((c) => !SECRET_FIELD.test(c.field)).map((c) => ({ field: c.field, from: scrub(c.from), to: scrub(c.to) })),
  }
  draft.audit = [event, ...draft.audit].slice(0, prototypeStorageLimits.auditEvents)
  return event
}

export const accountTarget = (a: Account): AuditEvent['target'] => ({ type: 'account', id: String(a.id), label: `${accountName(a)} (${a.email})` })
