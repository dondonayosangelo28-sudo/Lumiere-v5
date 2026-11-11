import StatCards from '../components/StatCards'
import { Bell, Home, LockKeyhole, Wrench } from 'lucide-react'
import { Card, PageHeader, cx } from '../components/ui'
import type { Route } from '../components/Shell'
import { moduleForRoute, notificationsModule, roleModules, type RoleModule } from '../auth/roleConfig'
import { accountName, type Account } from '../auth/store'
import type { RecentProjectsData } from './OverviewExtras'
import { Hero } from './Overview'
import { StudioDashboard } from '../features/event-manager/EventManager'
import WarehouseDashboard from '../features/warehouse/WarehouseDashboard'
import WarehouseModulePage from '../features/warehouse/WarehouseModules'
import GroundCrewModulePage, { GroundCrewDashboardSummary } from '../features/ground-crew/GroundCrewModules'
import { setWarehouseSelectedEventId } from '../operations/store'

const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')

// projectData feeds the sample Projects card, which no longer appears for any role here.
export function RoleDashboard({ account, go }: { account: Account; go: (r: Route) => void; projectData: RecentProjectsData }) {
  const modules = roleModules[account.role]
  // The Event Manager dashboard is the studio's own landing page.
  if (account.role === 'Event Manager') return <StudioDashboard user={{ name: accountName(account), email: account.email }} go={go} />

  // Dedicated Warehouse Operations Manager dashboard branch
  if (account.role === 'Warehouse Operations Manager') {
    return (
      <WarehouseDashboard
        onNavigate={(route, eventId) => {
          if (eventId) {
            setWarehouseSelectedEventId(eventId)
          }
          go(route as Route)
        }}
      />
    )
  }

  const actor = { name: accountName(account), email: account.email, role: account.role }
  return (
    <div className={account.role === 'Executive' ? 'dashboard-surfaces' : undefined}>
      <PageHeader large onHome={() => go('overview')} crumbs={['Dashboard']} title={account.role === 'Executive' ? 'Executive' : `${greeting(new Date().getHours())}, ${account.firstName}`} subtitle={`${account.role} workspace`} />
      {account.role === 'Executive' && (
        <div className="mb-4">
          <Hero name={account.firstName} />
        </div>
      )}
      {account.role === 'Ground Crew' && (
        <GroundCrewDashboardSummary actor={actor} onNavigate={(r) => go(r as Route)} />
      )}
      <StatCards key={`${account.id}-${account.role}`} userId={account.id} groupId={`role-dashboard-${account.role.replace(/ /g, "-")}`} gridCols="grid sm:grid-cols-2 xl:grid-cols-3" data={modules.map((m) => ({ id: m.key, title: m.label, value: '', icon: m.icon }))} renderCard={(card, handle) => {
        const m = modules.find((item) => item.key === card.id)!
        return (
          <div className="relative h-full">
          <button type="button" onClick={() => go(`module-${m.key}`)} className="group h-full w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
            <Card className="h-full p-5 transition-colors group-hover:border-fg/30">
              <span className={cx('grid size-10 place-items-center rounded-lg bg-elev text-foreground', account.role === 'Executive' && 'dark:bg-fg/20')}><m.icon size={20} strokeWidth={1.6} aria-hidden /></span>
              <p className="mt-4 text-[16px] font-semibold">{m.label}</p>
              <p className="mt-1 text-[14px] leading-5 text-muted-foreground">{m.description}</p>
            </Card>
          </button>
            <div className="absolute right-3 top-3">{handle}</div>
          </div>
        )
      }} />
      {account.role === 'Executive' && (
        <p className="mt-6 text-[13px] text-muted-foreground">Signed in as {accountName(account)}. Module screens are placeholders in this prototype.</p>
      )}
    </div>
  )
}

export function ModulePlaceholder({ module, go, crumb }: { module: RoleModule; go: (r: Route) => void; crumb?: string }) {
  return (
    <>
      <PageHeader onHome={() => go('overview')} crumbs={['Dashboard', crumb ?? module.label]} title={module.label} subtitle={module.description} />
      <Card className="grid place-items-center px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-elev"><module.icon size={20} strokeWidth={1.6} aria-hidden /></span>
        <p className="mt-4 flex items-center gap-2 text-[16px] font-semibold"><Wrench size={16} aria-hidden /> Coming soon</p>
        <p className="mt-1 max-w-sm text-[14px] text-muted-foreground">This module is a placeholder. Its workflow is not part of the account and access prototype.</p>
      </Card>
    </>
  )
}

export function NotificationsPage({ go }: { go: (r: Route) => void }) {
  return <ModulePlaceholder module={{ ...notificationsModule, icon: Bell }} go={go} />
}

export function RoleModulePage({ account, route, go }: { account: Account; route: string; go: (r: Route) => void }) {
  const m = moduleForRoute(account.role, route)
  if (!m) return <AccessDenied go={go} />
  const actor = { name: accountName(account), email: account.email, role: account.role }
  if (account.role === 'Warehouse Operations Manager') {
    return <WarehouseModulePage moduleKey={m.key} actor={actor} onNavigate={(r) => go(r as Route)} />
  }
  if (account.role === 'Ground Crew') {
    return <GroundCrewModulePage moduleKey={m.key} actor={actor} onNavigate={(r) => go(r as Route)} />
  }
  return <ModulePlaceholder module={m} go={go} />
}

export function AccessDenied({ go }: { go: (r: Route) => void }) {
  return (
    <Card className="mx-auto mt-10 grid max-w-xl place-items-center px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-elev"><LockKeyhole size={20} strokeWidth={1.6} aria-hidden /></span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Access Denied</h1>
      <p className="mt-2 max-w-sm text-[14px] text-muted-foreground">Your role does not have access to this page.</p>
      <button type="button" onClick={() => go('overview')} className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-invert px-4 text-[14px] font-semibold text-invert-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
        <Home size={16} aria-hidden /> Return to Dashboard
      </button>
    </Card>
  )
}
