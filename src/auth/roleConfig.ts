// Role-based navigation and frontend route access. Prototype access control only: the real
// backend must authorize every request regardless of what the UI shows.
import {
  Bell,
  Boxes,
  Camera,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Hammer,
  LayoutGrid,
  MapPin,
  Package,
  PackageSearch,
  Presentation,
  ScrollText,
  Shield,
  ShoppingCart,
  TriangleAlert,
  Truck,
  UsersRound,
  CalendarDays,
  SearchCheck,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from './store'

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
    { key: 'asset-inventory', label: 'Asset Inventory', icon: Boxes, description: 'Track warehouse assets and availability.' },
    { key: 'order-requests', label: 'Order Requests', icon: ClipboardList, description: 'Review incoming asset order requests.' },
    { key: 'deficit-queue', label: 'Deficit Queue', icon: TriangleAlert, description: 'Resolve requests that exceed available stock.' },
    { key: 'asset-acquisition', label: 'Asset Acquisition', icon: ShoppingCart, description: 'Plan purchases to cover asset deficits.' },
    { key: 'custom-fabrication', label: 'Custom Fabrication', icon: Hammer, description: 'Coordinate custom-built assets.' },
    { key: 'personnel-deployment', label: 'Personnel Deployment', icon: UsersRound, description: 'Assign crew to dispatches and events.' },
    { key: 'damage-assessment', label: 'Damage Assessment', icon: PackageSearch, description: 'Assess assets returned with damage.' },
  ],
  'Ground Crew': [
    { key: 'assigned-work', label: 'Assigned Work', icon: ClipboardCheck, description: 'See operational tasks assigned to you.' },
    { key: 'dispatch-checks', label: 'Dispatch Loading Checks', icon: Truck, description: 'Confirm assets loaded for dispatch.' },
    { key: 'venue-arrival', label: 'Venue Arrival Checks', icon: MapPin, description: 'Confirm assets on arrival at the venue.' },
    { key: 'evidence-capture', label: 'Evidence Capture', icon: Camera, description: 'Capture photo evidence for checks.' },
    { key: 'post-event-audits', label: 'Post-event Asset Audits', icon: SearchCheck, description: 'Audit assets after an event closes.' },
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
  return roleModules[role].some((m) => `module-${m.key}` === route)
}

export const moduleForRoute = (role: Role, route: string) => roleModules[role].find((m) => `module-${m.key}` === route)
