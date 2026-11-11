import type { LifecycleStatus, Role } from '../auth/store'

/** Dashboard shortcuts that open an admin page with specific filters or a specific tab. */
export type AdminNavigation =
  | { route: 'accounts'; role?: Role; status?: LifecycleStatus }
  | { route: 'security'; tab: 'activity' | 'locked' | 'sessions'; failedLast24h?: boolean }
  | { route: 'audit-logs' }
