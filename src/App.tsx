import { Suspense, lazy, useCallback, useState } from 'react'
import Shell from './components/layout/Shell'
import { useAppNavigation } from './navigation'
import { useTheme } from './theme'
import { accountName } from './auth/store'
import EventManager from './features/event-manager/EventManager'
import { isEventManagerRoute } from './features/event-manager/routes'
import Overview from './pages/dashboard/Overview'
import AccountsPage from './pages/admin/Accounts'
import SecurityPage from './pages/admin/Security'
import AuditLogsPage from './pages/admin/AuditLogs'
import ProjectsPage from './pages/projects/Projects'
import SettingsPage from './pages/settings/Settings'
import { AccessDenied, NotificationsPage, RoleDashboard, RoleModulePage } from './pages/dashboard/RoleViews'
import { canAccess } from './auth/roleConfig'
import Login from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import SetPassword from './pages/auth/SetPassword'
import { signOut, signOutForDemoReset, takeSignOutNotice, useSession } from './auth/session'
import { projects as seedProjects, deletedProjects as seedDeletedProjects } from './data'

// Excluded from production builds: the import is only reachable when DEV is true.
const PrototypeTools = import.meta.env.DEV ? lazy(() => import('./components/prototype/PrototypeTools')) : null

export default function App() {
  const [dark, setDark] = useTheme()
  const [notice, setNotice] = useState(takeSignOutNotice)
  const {
    route,
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
  } = useAppNavigation()

  const [openAccountId, setOpenAccountId] = useState<number | null>(null)
  const [projects, setProjects] = useState(seedProjects)
  const [deletedProjects, setDeletedProjects] = useState(seedDeletedProjects)

  // The signed-in account comes from the session; it is null whenever no valid session is held.
  const onForcedSignOut = useCallback((message: string) => {
    takeSignOutNotice()
    setNotice(message)
    resetRoute()
  }, [resetRoute])
  const account = useSession(onForcedSignOut)

  const logout = () => {
    signOut()
    resetRoute()
    window.scrollTo({ top: 0 })
  }
  const projectProps = { all: projects, setAll: setProjects, trash: deletedProjects, setTrash: setDeletedProjects, onHome: home }

  const tools = PrototypeTools && (
    <Suspense fallback={null}>
      <PrototypeTools
        // Opening an invite simulates the invited person, so the admin preview signs out.
        openInvitation={(token) => (signOut(), navigate('/set-password', token))}
        openRecovery={() => (signOut(), navigate('/forgot-password'))}
        onReset={() => (setNotice(signOutForDemoReset()), setProjects(seedProjects), setDeletedProjects(seedDeletedProjects), resetRoute())}
      />
    </Suspense>
  )

  if (path === '/set-password') return <>{<SetPassword key={inviteToken ?? 'none'} token={inviteToken} dark={dark} setDark={setDark} onLogin={toLogin} />}{tools}</>
  if (path === '/forgot-password') return <><ForgotPassword dark={dark} setDark={setDark} onLogin={toLogin} />{tools}</>
  if (!account) return <><Login key={notice} notice={notice} dark={dark} setDark={setDark} onForgot={() => navigate('/forgot-password')} onLogin={() => (setNotice(''), resetRoute())} />{tools}</>

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
