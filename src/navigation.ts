import { useCallback, useEffect, useState } from 'react'
import type { AdminNavigation } from './components/admin/adminNavigation'
import {
  resolveOperationsRoute,
  setOperationsNavigationContext,
} from './operations/navigation-context'

export type Route =
  | 'overview'
  | 'accounts'
  | 'accounts-deleted'
  | 'projects'
  | 'projects-deleted'
  | 'settings-profile'
  | 'settings-security'
  | 'settings-app'
  | 'security'
  | 'audit-logs'
  | 'notifications'
  | `module-${string}`

// Public auth screens use a tiny path switch instead of a router dependency.
// Invitation links look like /set-password#token=<token>; the hash keeps tokens out of server logs.
export const readInviteToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.hash.slice(1)).get('token')
}

export function useAppNavigation(initialRoute: Route = 'overview') {
  const [route, setRoute] = useState<Route>(initialRoute)
  const [path, setPath] = useState(() => (typeof window !== 'undefined' ? window.location.pathname : '/'))
  const [inviteToken, setInviteToken] = useState<string | null>(readInviteToken)
  // Filters or tab requested by a dashboard shortcut; ordinary navigation clears it.
  const [intent, setIntent] = useState<{ id: number; nav: AdminNavigation } | null>(null)

  useEffect(() => {
    const sync = () => {
      setPath(window.location.pathname)
      setInviteToken(readInviteToken())
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Remove the token from the address bar once it is held in memory.
  useEffect(() => {
    if (readInviteToken()) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [inviteToken])

  const navigate = useCallback((to: string, token: string | null = null) => {
    window.history.pushState(null, '', to)
    setPath(to)
    setInviteToken(token)
    window.scrollTo({ top: 0 })
  }, [])

  const toLogin = useCallback(() => navigate('/'), [navigate])

  const go = useCallback((r: Route) => {
    setIntent(null)
    if (r.startsWith('module-')) {
      const resolved = resolveOperationsRoute(r)
      if (r === 'module-events') {
        setOperationsNavigationContext({ eventId: undefined, jobId: undefined, subView: 'orders' }, { merge: true })
      } else if (r === 'module-crew-scheduling') {
        setOperationsNavigationContext({ eventId: undefined, jobId: undefined, subView: 'crew' }, { merge: true })
      } else if (r === 'module-production') {
        setOperationsNavigationContext({ eventId: undefined, jobId: undefined, subView: 'production' }, { merge: true })
      } else if (Object.keys(resolved.impliedContext).length > 0) {
        setOperationsNavigationContext(resolved.impliedContext, { merge: true })
      }
      setRoute(resolved.canonicalRoute as Route)
    } else {
      setRoute(r)
    }
    window.scrollTo({ top: 0 })
  }, [])

  const open = useCallback((nav: AdminNavigation) => {
    setIntent({ id: Date.now(), nav })
    setRoute(nav.route)
    window.scrollTo({ top: 0 })
  }, [])

  const home = useCallback(() => go('overview'), [go])

  const resetRoute = useCallback(() => {
    setIntent(null)
    setRoute('overview')
  }, [])

  const accountsIntent = intent?.nav.route === 'accounts' ? intent.nav : null
  const securityIntent = intent?.nav.route === 'security' ? intent.nav : null

  return {
    route,
    setRoute,
    path,
    inviteToken,
    intent,
    accountsIntent,
    securityIntent,
    navigate,
    toLogin,
    go,
    open,
    home,
    resetRoute,
  }
}
