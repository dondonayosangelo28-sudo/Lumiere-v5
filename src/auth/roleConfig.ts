// Role-based navigation and frontend route access. Prototype access control only: the real
// backend must authorize every request regardless of what the UI shows.
import {
  Bell,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Hammer,
  LayoutGrid,
  Package,
  Presentation,
  ScrollText,
  Shield,
  ShoppingCart,
  Store,
  TriangleAlert,
  Truck,
  UsersRound,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from './store'
import { resolveOperationsRoute } from '../operations/navigation-context'

export interface RoleModule {
  key: string
  label: string
  icon: LucideIcon
  description: string
}

export const roleModules: Record<Role, RoleModule[]> = {
  'System Admin': [],
  Executive: [
    { key: 'event-details', label: 'Event Details', icon: CalendarDays, description: 'Review confirmed events, clients, and key event information.' },
    { key: 'event-schedules', label: 'Event Schedules', icon: CalendarClock, description: 'See upcoming event dates, milestones, and timelines.' },
    { key: 'event-assets', label: 'Event Asset Details', icon: Package, description: 'Review assets allocated to each event.' },
  ],
  'Event Manager': [
    // Dashboard is added ahead of these by the Shell; existing route keys are kept.
    { key: 'client-pitching', label: 'Event Pitches', icon: Presentation, description: 'Prepare, present and track pitches through client approval.' },
    { key: 'event-concepts', label: 'Mood Boards', icon: LayoutGrid, description: 'Start from a theme preset or reopen a saved mood board.' },
    { key: 'event-creation', label: 'Calendar', icon: CalendarDays, description: 'See approved events by date.' },
    { key: 'asset-requests', label: 'Asset Library', icon: Package, description: 'Browse the sample stock catalog and pitch asset plans.' },
  ],
  'Warehouse Operations Manager': [
    { key: 'events', label: 'Events', icon: ClipboardList, description: 'Manage event order requests, allocations, rentals, and stock deficits.' },
    { key: 'asset-inventory', label: 'Asset Inventory', icon: Boxes, description: 'Track warehouse stock catalog, availability, and acquisitions.' },
    { key: 'replenishment-deficits', label: 'Replenishment', icon: ShoppingCart, description: 'Manage event deficits, stockroom replenishment requests, acquisitions, and receipts.' },
    { key: 'vendors', label: 'Vendors', icon: Store, description: 'Manage suppliers, lead times, contact details, and preferred-vendor status.' },
    { key: 'crew-scheduling', label: 'Crew & Scheduling', icon: UsersRound, description: 'Manage event crew rosters, leads, schedules, and blockers.' },
    { key: 'production', label: 'Production', icon: Hammer, description: 'Coordinate custom fabrication jobs, windows, estimates, and progress.' },
    { key: 'verification', label: 'Verification', icon: ClipboardCheck, description: 'Inspect submitted custom builds against specs and release for loading.' },
    { key: 'damage-missing-reports', label: 'Damage & Missing', icon: TriangleAlert, description: 'Review field damage and missing-item reports, evidence photos, and inventory resolutions.' },
    { key: 'dispatch-returns', label: 'Dispatch & Returns', icon: Truck, description: 'Track outbound manifests, returns, reconciliation, and incident reports.' },
  ],
  'Ground Crew': [
    { key: 'my-work', label: 'My Work', icon: ClipboardCheck, description: 'View your production and event assignments and open event operations.' },
  ],
}

export const adminModules: RoleModule[] = [
  { key: 'security', label: 'Security', icon: Shield, description: 'Locked accounts, login activity, and active sessions.' },
  { key: 'audit-logs', label: 'Audit Logs', icon: ScrollText, description: 'Read-only record of account and security events.' },
]
export const notificationsModule: RoleModule = { key: 'notifications', label: 'Notifications', icon: Bell, description: 'Updates relevant to your role.' }

// Screens only the System Admin may open.
const ADMIN_ROUTES = new Set(['accounts', 'accounts-deleted', 'security', 'audit-logs'])
// The sample Projects screens are retired; Event Manager work lives in saved pitches.
const PROJECT_ROUTES = new Set(['projects', 'projects-deleted'])
const SHARED_ROUTES = new Set(['overview', 'notifications', 'settings-profile', 'settings-security', 'settings-app'])

export const isAdminRoute = (route: string) => ADMIN_ROUTES.has(route)

export function canAccess(role: Role, route: string) {
  if (route === 'settings-security') return role !== 'System Admin'
  if (PROJECT_ROUTES.has(route)) return false
  if (SHARED_ROUTES.has(route)) return true
  if (role === 'System Admin') return ADMIN_ROUTES.has(route)
  const resolved = resolveOperationsRoute(route)
  return roleModules[role].some(
    (m) => `module-${m.key}` === route || `module-${m.key}` === resolved.canonicalRoute,
  )
}

export const moduleForRoute = (role: Role, route: string) => {
  const resolved = resolveOperationsRoute(route)
  return roleModules[role].find(
    (m) => `module-${m.key}` === route || `module-${m.key}` === resolved.canonicalRoute,
  )
}
