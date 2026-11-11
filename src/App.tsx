import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import Shell, { type Route } from './components/Shell'
import { accountName } from './auth/store'
import EventManager from './features/event-manager/EventManager'
import { isEventManagerRoute } from './features/event-manager/routes'
import Overview from './pages/Overview'
import AccountsPage from './pages/Accounts'
import SecurityPage from './pages/Security'
import AuditLogsPage from './pages/AuditLogs'
import ProjectsPage from './pages/Projects'
import SettingsPage from './pages/Settings'
import { AccessDenied, NotificationsPage, RoleDashboard, RoleModulePage } from './pages/RoleViews'
import { canAccess } from './auth/roleConfig'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import SetPassword from './pages/SetPassword'
import { signOut, signOutForDemoReset, takeSignOutNotice, useSession } from './auth/session'
import { projects as seedProjects, deletedProjects as seedDeletedProjects } from './data'
import type { AdminNavigation } from './components/adminNavigation'

// Excluded from production builds: the import is only reachable when DEV is true.
const PrototypeTools = import.meta.env.DEV ? lazy(() => import('./components/PrototypeTools')) : null

// Public auth screens use a tiny path switch instead of a router dependency.
// Invitation links look like /set-password#token=<token>; the hash keeps tokens out of server logs.
const readToken = () => new URLSearchParams(window.location.hash.slice(1)).get('token')

export default function App() {
  const [notice, setNotice] = useState(takeSignOutNotice)
  const [route, setRoute] = useState<Route>('overview')
  const [dark, setDark] = useState(true)
  const [path, setPath] = useState(window.location.pathname)
  const [inviteToken, setInviteToken] = useState(readToken)
  const [openAccountId, setOpenAccountId] = useState<number | null>(null)
  // Filters or tab requested by a dashboard shortcut; ordinary navigation clears it.
  const [intent, setIntent] = useState<{ id: number; nav: AdminNavigation } | null>(null)
  const [projects, setProjects] = useState(seedProjects)
  const [deletedProjects, setDeletedProjects] = useState(seedDeletedProjects)

  // The signed-in account comes from the session; it is null whenever no valid session is held.
  const onForcedSignOut = useCallback((message: string) => {
    takeSignOutNotice()
    setNotice(message)
    setRoute('overview')
  }, [])
  const account = useSession(onForcedSignOut)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    const sync = () => (setPath(window.location.pathname), setInviteToken(readToken()))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  // Remove the token from the address bar once it is held in memory.
  useEffect(() => {
    if (readToken()) window.history.replaceState(null, '', window.location.pathname)
  }, [inviteToken])

  const navigate = (to: string, token: string | null = null) => {
    window.history.pushState(null, '', to)
    setPath(to)
    setInviteToken(token)
    window.scrollTo({ top: 0 })
  }
  const toLogin = () => navigate('/')

  const go = (r: Route) => {
    setIntent(null)
    setRoute(r)
    window.scrollTo({ top: 0 })
  }
  const open = (nav: AdminNavigation) => {
    setIntent({ id: Date.now(), nav })
    setRoute(nav.route)
    window.scrollTo({ top: 0 })
  }
  const accountsIntent = intent?.nav.route === 'accounts' ? intent.nav : null
  const securityIntent = intent?.nav.route === 'security' ? intent.nav : null
  const home = () => go('overview')
  const logout = () => (signOut(), setRoute('overview'), window.scrollTo({ top: 0 }))
  const projectProps = { all: projects, setAll: setProjects, trash: deletedProjects, setTrash: setDeletedProjects, onHome: home }

  const tools = PrototypeTools && (
    <Suspense fallback={null}>
      <PrototypeTools
        // Opening an invite simulates the invited person, so the admin preview signs out.
        openInvitation={(token) => (signOut(), navigate('/set-password', token))}
        openRecovery={() => (signOut(), navigate('/forgot-password'))}
        onReset={() => (setNotice(signOutForDemoReset()), setProjects(seedProjects), setDeletedProjects(seedDeletedProjects), setRoute('overview'))}
      />
    </Suspense>
  )

  if (path === '/set-password') return <>{<SetPassword key={inviteToken ?? 'none'} token={inviteToken} dark={dark} setDark={setDark} onLogin={toLogin} />}{tools}</>
  if (path === '/forgot-password') return <><ForgotPassword dark={dark} setDark={setDark} onLogin={toLogin} />{tools}</>
  if (!account) return <><Login key={notice} notice={notice} dark={dark} setDark={setDark} onForgot={() => navigate('/forgot-password')} onLogin={() => (setNotice(''), go('overview'))} />{tools}</>

  const isAdmin = account.role === 'System Admin'
  const page = (
    <>
      {route === 'overview' && (isAdmin ? <Overview onOpen={open} /> : <RoleDashboard account={account} go={go} projectData={projectProps} />)}
      {route === 'notifications' && <NotificationsPage go={go} />}
      {route === 'security' && <SecurityPage key={securityIntent ? intent!.id : 'security'} account={account} go={go} onLogout={logout} initialTab={securityIntent?.tab} initialFailedLast24h={securityIntent?.failedLast24h} />}
      {route === 'audit-logs' && <AuditLogsPage account={account} go={go} />}
      {route.startsWith('module-') && !isEventManagerRoute(route) && <RoleModulePage account={account} route={route} go={go} />}
      {isEventManagerRoute(route) && <EventManager key={`${account.id}:${account.email}:${route}`} route={route} user={{ name: accountName(account), email: account.email }} />}
      {route === 'accounts' && <AccountsPage key={accountsIntent ? intent!.id : 'accounts'} actor={account} onHome={home} openAccountId={openAccountId} onOpened={() => setOpenAccountId(null)} initialRole={accountsIntent?.role} initialStatus={accountsIntent?.status} />}
      {route === 'accounts-deleted' && <AccountsPage key="deleted" deleted actor={account} onHome={home} />}
      {route === 'projects' && <ProjectsPage {...projectProps} />}
      {route === 'projects-deleted' && <ProjectsPage deleted {...projectProps} />}
      {route.startsWith('settings') && <SettingsPage account={account} tab={route as 'settings-profile'} go={go} onHome={home} />}
    </>
  )

  return (
    <>
    <Shell account={account} route={route} go={go} dark={dark} setDark={setDark} onLogout={logout}>
      {!canAccess(account.role, route) ? <AccessDenied go={go} /> : page}
    </Shell>
    {tools}
    </>
  )
}
