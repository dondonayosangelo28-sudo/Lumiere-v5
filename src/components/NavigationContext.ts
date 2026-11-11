import { createContext } from 'react'
import type { Route } from './Shell'

export const NavigationContext = createContext<{ route: Route; go: (route: Route) => void } | null>(null)

export const breadcrumbRoutes: Record<string, Route> = {
  Dashboard: 'overview',
  'Account Management': 'accounts',
  Users: 'accounts',
  'All Users': 'accounts',
  'Deleted Users': 'accounts-deleted',
  Settings: 'settings-profile',
  Profile: 'settings-profile',
  Security: 'settings-security',
  'App Settings': 'settings-app',
}
