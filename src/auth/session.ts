/*
 * DEMO ENVIRONMENT ONLY — mock sign-in and sessions over the synthetic shared store.
 * The browser keeps only a session identifier; it is not a secure session token and this is
 * not production authentication. A real backend must issue and validate sessions.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { prototypeStorageLimits } from './prototypeStorageLimits'
import {
  SYSTEM_ACTOR,
  UNAUTHENTICATED_ACTOR,
  accountName,
  accountTarget,
  browserLabel,
  endSessions,
  findAccount,
  findAccountByEmail,
  getState,
  lockInfo,
  normalizeEmail,
  randomId,
  recordAudit,
  recordLoginAttempt,
  sessionRef,
  securityPolicy as P,
  storeRevision,
  subscribe,
  update,
  verifyPassword,
  type Account,
  type Session,
  type SessionEndReason,
} from './store'

const POINTER_KEY = 'lumiere.demo.currentSession'
const NOTICE_KEY = 'lumiere.demo.signOutNotice'

export const loginMessages = {
  required: 'Enter your email and password.',
  incorrect: 'Email or password is incorrect.',
  pending: 'Activate your account using your invitation before signing in.',
  inactive: 'Your account is inactive. Contact your System Admin.',
  locked: (until: number) => {
    const mins = Math.max(1, Math.ceil((until - Date.now()) / 60_000))
    const at = new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return `This account is temporarily locked after too many incorrect attempts. Try again at ${at} (about ${mins} min), or ask your System Admin to unlock it.`
  },
}

const endNotices: Record<SessionEndReason, string> = {
  logout: '',
  expired: 'Your session expired after 30 minutes of inactivity. Sign in again to continue.',
  ended_by_admin: 'Your session was ended by a System Admin. Sign in again to continue.',
  deactivated: 'Your account is inactive. Contact your System Admin.',
  password_reset: 'Your password was reset. Sign in with your new password.',
  password_changed: 'Your password was changed on another session. Sign in with your new password.',
  demo_reset: 'Demo data was reset. Sign in again with a demo account.',
}

/* ---------- Browser session pointer ---------- */

function readPointer(): string | null {
  try {
    return sessionStorage.getItem(POINTER_KEY) ?? localStorage.getItem(POINTER_KEY)
  } catch {
    return null
  }
}
function writePointer(id: string, persistence: Session['persistence']) {
  if (memoryPointer) clearPointer(memoryPointer)
  try {
    ;(persistence === 'local' ? localStorage : sessionStorage).setItem(POINTER_KEY, id)
  } catch {
    /* storage unavailable: session lasts for this page only */
  }
  memoryPointer = id
}
/** Clears this browser's session reference. With `onlyId`, a reference to a different (possibly valid) session is left alone. */
function clearPointer(onlyId?: string) {
  if (!onlyId || memoryPointer === onlyId) memoryPointer = null
  try {
    for (const store of [sessionStorage, localStorage]) {
      if (!onlyId || store.getItem(POINTER_KEY) === onlyId) store.removeItem(POINTER_KEY)
    }
  } catch {
    /* ignore */
  }
}
let memoryPointer: string | null = readPointer()
const pointer = () => memoryPointer ?? readPointer()

/** One-time message shown on the login screen after a forced sign-out. */
export function takeSignOutNotice(): string {
  try {
    const n = sessionStorage.getItem(NOTICE_KEY) ?? ''
    sessionStorage.removeItem(NOTICE_KEY)
    return n
  } catch {
    return ''
  }
}
function setNotice(message: string) {
  try {
    if (message) sessionStorage.setItem(NOTICE_KEY, message)
  } catch {
    /* ignore */
  }
}

/* ---------- Sign in ---------- */

export type SignInResult = { ok: true; account: Account } | { ok: false; message: string; field?: 'email' | 'password' }
let signingIn = false

export async function signIn(input: { email: string; password: string; remember: boolean }): Promise<SignInResult> {
  const email = normalizeEmail(input.email)
  if (!email || !input.password) return { ok: false, message: loginMessages.required }
  // Duplicate-submission guard in addition to the disabled button.
  if (signingIn) return { ok: false, message: 'Sign-in is already in progress.' }
  signingIn = true
  const operationId = randomId('op')
  try {
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 300))
    if (getState().failNextRequest) {
      update((d) => void (d.failNextRequest = false))
      return { ok: false, message: 'We could not reach the sign-in service. Check your connection and try again.' }
    }
    return update((d): SignInResult => {
      const account = findAccountByEmail(email)
      const fail = (result: 'Failed' | 'Blocked', reason: string, message: string): SignInResult => {
        recordLoginAttempt(d, { correlationId: operationId, email, accountId: account?.id ?? null, role: account?.role ?? null, result, reason })
        recordAudit(d, {
          operationId,
          correlationId: operationId,
          actor: UNAUTHENTICATED_ACTOR,
          action: result === 'Blocked' ? 'Login blocked' : 'Login failed',
          target: account ? accountTarget(account) : { type: 'account', id: 'unknown', label: email },
          result,
          description: `Sign-in ${result === 'Blocked' ? 'blocked' : 'failed'} for ${email}: ${reason}.`,
        })
        return { ok: false, message }
      }

      if (!account) return fail('Failed', 'Unknown email', loginMessages.incorrect)
      // Demo recovery: valid credentials can clear a temporary lock on sign-in.
      // Incorrect credentials remain blocked for the full lock duration.
      const passwordValid = verifyPassword(account.id, input.password)
      const lock = lockInfo(account.id)
      if (lock.locked && !passwordValid) return fail('Blocked', 'Temporarily locked', loginMessages.locked(lock.lockedUntil!))

      if (!passwordValid) {
        if (account.status !== 'Active') return fail('Failed', 'Incorrect password', loginMessages.incorrect)
        const prev = d.locks.find((l) => l.accountId === account.id)
        // An expired lock starts a fresh count.
        const base = prev?.lockedUntil && Date.now() >= prev.lockedUntil ? 0 : (prev?.consecutiveFailures ?? 0)
        const failures = base + 1
        const lockNow = failures >= P.loginAttemptLimit
        const now = Date.now()
        d.locks = [...d.locks.filter((l) => l.accountId !== account.id), { accountId: account.id, consecutiveFailures: failures, lockedUntil: lockNow ? now + P.lockDurationMs : null, lockedAt: lockNow ? now : null }]
        const result = fail('Failed', `Incorrect password (${failures} of ${P.loginAttemptLimit})`, lockNow ? loginMessages.locked(now + P.lockDurationMs) : loginMessages.incorrect)
        if (lockNow) recordAudit(d, { operationId, correlationId: operationId, actor: SYSTEM_ACTOR, action: 'Account locked', target: accountTarget(account), result: 'Blocked', description: `${accountName(account)} was locked for 15 minutes after ${P.loginAttemptLimit} consecutive incorrect passwords.` })
        return result
      }

      if (account.status === 'Pending Activation') return fail('Blocked', 'Pending activation', loginMessages.pending)
      if (account.status === 'Inactive') return fail('Blocked', 'Account inactive', loginMessages.inactive)

      const now = Date.now()
      const session: Session = { id: randomId('ses'), accountId: account.id, role: account.role, device: browserLabel(), startedAt: now, lastActivityAt: now, persistence: input.remember ? 'local' : 'session', status: 'active', endedAt: null, endReason: null }
      d.sessions = [session, ...d.sessions].slice(0, prototypeStorageLimits.sessions)
      d.locks = d.locks.filter((l) => l.accountId !== account.id)
      d.accounts = d.accounts.map((a) => (a.id === account.id ? { ...a, lastLoginAt: now } : a))
      recordLoginAttempt(d, { correlationId: operationId, email, accountId: account.id, role: account.role, result: 'Success' })
      recordAudit(d, { operationId, correlationId: operationId, actor: { account, role: account.role }, action: 'Login succeeded', target: accountTarget(account), description: `${accountName(account)} signed in${input.remember ? ' with Remember me' : ''}.` })
      writePointer(session.id, session.persistence)
      return { ok: true, account: { ...account, lastLoginAt: now } }
    })
  } finally {
    signingIn = false
  }
}

/* ---------- Session validity (shared by validation, sweeps, and the Security page) ---------- */

/** A session is live only while it is active, within the idle timeout, and its account is Active. */
export const isSessionLive = (s: Session, now = Date.now()) => s.status === 'active' && now - s.lastActivityAt <= P.sessionIdleTimeoutMs && findAccount(s.accountId)?.status === 'Active'

export const liveSessions = (now = Date.now()) => getState().sessions.filter((s) => isSessionLive(s, now))

/** Ends records that are still marked active but are no longer valid. Only the writer that ends one records its expiration. */
export function expireStaleSessions(now = Date.now()) {
  const stale = getState().sessions.filter((s) => s.status === 'active' && !isSessionLive(s, now))
  if (!stale.length) return 0
  update((d) => {
    for (const s of stale) {
      const a = findAccount(s.accountId)
      const idle = !!a && a.status === 'Active'
      const ended = endSessions(d, (x) => x.id === s.id, idle ? 'expired' : 'deactivated')
      if (ended.length && idle) recordAudit(d, { actor: SYSTEM_ACTOR, action: 'Session expired', target: { type: 'session', id: sessionRef(s.id), label: `${accountName(a!)} (${a!.email})` }, description: `Session for ${accountName(a!)} (${s.device}) expired after 30 minutes of inactivity.` })
    }
  })
  return stale.length
}

/* ---------- Current session ---------- */

export const currentSession = (): Session | null => {
  const id = pointer()
  return (id && getState().sessions.find((s) => s.id === id)) || null
}

/** Signed-in account, only when this browser holds a matching active session for an Active account. */
export function currentAccount(): Account | null {
  const s = currentSession()
  if (!s || s.status !== 'active') return null
  const a = findAccount(s.accountId)
  return a && a.status === 'Active' ? a : null
}

export function signOut() {
  const s = currentSession()
  if (s?.status === 'active') {
    update((d) => {
      const ended = endSessions(d, (x) => x.id === s.id, 'logout')
      const a = findAccount(s.accountId)
      if (ended.length && a) recordAudit(d, { actor: { account: a, role: s.role }, action: 'Logout', target: accountTarget(a), description: `${accountName(a)} signed out.` })
    })
  }
  const held = s?.id ?? pointer()
  if (held) clearPointer(held)
}

/**
 * Validates the held session: idle timeout, ended sessions, and inactive accounts.
 * Returns a sign-out explanation when the session is no longer usable.
 */
export function validateSession(now = Date.now()): string | null {
  const id = pointer()
  if (!id) return null
  const s = getState().sessions.find((x) => x.id === id)
  if (!s) return (clearPointer(id), 'Your session is no longer valid. Sign in again to continue.')
  if (s.status === 'ended') return (clearPointer(id), s.endReason ? endNotices[s.endReason] : '')
  const a = findAccount(s.accountId)
  if (!a || a.status !== 'Active') {
    update((d) => void endSessions(d, (x) => x.id === id, 'deactivated'))
    return (clearPointer(id), endNotices.deactivated)
  }
  if (now - s.lastActivityAt > P.sessionIdleTimeoutMs) {
    update((d) => {
      // Only the tab that actually ends the session records the expiration.
      const ended = endSessions(d, (x) => x.id === id, 'expired')
      if (ended.length) recordAudit(d, { actor: SYSTEM_ACTOR, action: 'Session expired', target: { type: 'session', id: sessionRef(s.id), label: `${accountName(a)} (${a.email})` }, description: `Session for ${accountName(a)} (${s.device}) expired after 30 minutes of inactivity.` })
    })
    return (clearPointer(id), endNotices.expired)
  }
  return null
}

// Activity writes are throttled to at most one per minute.
const ACTIVITY_WRITE_INTERVAL = 60_000
function touch() {
  const s = currentSession()
  if (!s || s.status !== 'active') return
  const now = Date.now()
  if (now - s.lastActivityAt < ACTIVITY_WRITE_INTERVAL) return
  if (validateSession(now)) return
  update((d) => void (d.sessions = d.sessions.map((x) => (x.id === s.id ? { ...x, lastActivityAt: now } : x))))
}

/**
 * React binding: returns the signed-in account (live from the shared store) and keeps the
 * session honest. `onForcedSignOut` receives the explanation when the session ends elsewhere.
 */
export function useSession(onForcedSignOut: (message: string) => void) {
  useSyncExternalStore(subscribe, storeRevision)
  const account = currentAccount()
  const held = !!pointer()

  useEffect(() => {
    if (!held) return
    const check = () => {
      const message = validateSession()
      if (message !== null) {
        setNotice(message)
        onForcedSignOut(message)
      }
    }
    check()
    const unsub = subscribe(check)
    const timer = window.setInterval(check, 15_000)
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const onFocus = () => (check(), touch())
    window.addEventListener('focus', onFocus)
    return () => {
      unsub()
      window.clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, touch))
      window.removeEventListener('focus', onFocus)
    }
  }, [held, onForcedSignOut])

  return account
}

/** Drops the browser's session reference without touching shared account data (used by demo reset). */
export const forgetBrowserSession = clearPointer

/** Ends this browser's session reference for a demo reset and returns the login-screen explanation. */
export function signOutForDemoReset(): string {
  clearPointer()
  return endNotices.demo_reset
}
