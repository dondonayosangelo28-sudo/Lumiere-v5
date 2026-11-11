export type ProjectStatus = 'Ready' | 'In Progress' | 'Blocked'
export interface Project {
  id: number
  name: string
  description: string
  status: ProjectStatus
  environment: 'Production' | 'Development' | 'Staging'
  updated: string
  version: string
}

export const projects: Project[] = [
  { id: 1, name: 'E-Commerce Platform', description: 'Complete online store with payment integration and inventory sync', status: 'Ready', environment: 'Production', updated: '10/19/2026', version: 'v3.2.1' },
  { id: 2, name: 'Mobile App (iOS & Android)', description: 'Cross-platform mobile application with push notifications', status: 'Ready', environment: 'Production', updated: '10/19/2026', version: 'v2.8.0' },
  { id: 3, name: 'Dashboard Analytics', description: 'Real-time business intelligence dashboard with custom reports', status: 'In Progress', environment: 'Development', updated: '10/19/2026', version: 'v0.9.4' },
  { id: 4, name: 'API Gateway Service', description: 'Microservices architecture with GraphQL federation', status: 'Ready', environment: 'Production', updated: '10/19/2026', version: 'v1.6.2' },
  { id: 5, name: 'Database Migration', description: 'PostgreSQL to MongoDB migration with zero downtime', status: 'Blocked', environment: 'Staging', updated: '10/19/2026', version: 'v0.3.0' },
  { id: 6, name: 'Customer Support Portal', description: 'Ticketing system with live chat and knowledge base', status: 'Ready', environment: 'Production', updated: '10/18/2026', version: 'v2.1.0' },
  { id: 7, name: 'Payment Reconciliation', description: 'Automated ledger matching across payment providers', status: 'In Progress', environment: 'Development', updated: '10/18/2026', version: 'v0.7.1' },
  { id: 8, name: 'Marketing Site', description: 'Headless CMS-driven marketing website', status: 'Ready', environment: 'Production', updated: '10/17/2026', version: 'v4.0.3' },
  { id: 9, name: 'Auth Service', description: 'SSO, MFA and session management service', status: 'Ready', environment: 'Production', updated: '10/17/2026', version: 'v1.9.0' },
  { id: 10, name: 'Notification Hub', description: 'Unified email and push delivery pipeline', status: 'In Progress', environment: 'Staging', updated: '10/16/2026', version: 'v0.5.2' },
  { id: 11, name: 'Search Indexer', description: 'Full-text search indexing with incremental updates', status: 'Ready', environment: 'Production', updated: '10/15/2026', version: 'v1.2.4' },
  { id: 12, name: 'Data Warehouse', description: 'Columnar warehouse with nightly ETL jobs', status: 'In Progress', environment: 'Development', updated: '10/14/2026', version: 'v0.4.0' },
  { id: 13, name: 'Inventory Manager', description: 'Multi-warehouse stock tracking and forecasting', status: 'Ready', environment: 'Production', updated: '10/13/2026', version: 'v2.3.1' },
  { id: 14, name: 'Feature Flags', description: 'Progressive rollout and experimentation platform', status: 'Ready', environment: 'Production', updated: '10/12/2026', version: 'v1.1.0' },
  { id: 15, name: 'ML Recommendations', description: 'Personalized product recommendation engine', status: 'In Progress', environment: 'Development', updated: '10/11/2026', version: 'v0.2.6' },
]

export const deletedProjects: Project[] = [
  { id: 101, name: 'Legacy CRM System', description: 'Old customer relationship management system', status: 'Ready', environment: 'Production', updated: '10/19/2026', version: 'v1.0.0' },
  { id: 102, name: 'Old Blog Platform', description: 'Deprecated blogging system replaced by headless CMS', status: 'Ready', environment: 'Production', updated: '10/19/2026', version: 'v2.4.0' },
  { id: 103, name: 'Prototype Testing App', description: 'Initial prototype - testing completed, no longer needed', status: 'In Progress', environment: 'Development', updated: '10/19/2026', version: 'v0.1.0' },
  { id: 104, name: 'Old API v1', description: 'Deprecated API version 1 - migrated to v2', status: 'Ready', environment: 'Production', updated: '10/19/2026', version: 'v1.8.3' },
  { id: 105, name: 'Manual Reporting Tool', description: 'Replaced by automated analytics dashboard', status: 'Ready', environment: 'Production', updated: '10/19/2026', version: 'v1.2.0' },
]

export const roles = [
  { name: 'Super Admin', description: 'Full access to every resource and setting', members: 1, permissions: 42, color: '#8B5CF6' },
  { name: 'Admin', description: 'Manage users, projects and day-to-day operations', members: 4, permissions: 34, color: '#3B82F6' },
  { name: 'Editor', description: 'Create and update projects and content', members: 5, permissions: 18, color: '#10B981' },
  { name: 'Viewer', description: 'Read-only access to dashboards and reports', members: 3, permissions: 6, color: '#F59E0B' },
]

export const initialTasks = [
  { id: 1, title: 'Review and merge pending pull requests', done: false },
  { id: 2, title: 'Update project documentation', done: false },
  { id: 3, title: 'Optimize database queries for better performance', done: false },
  { id: 4, title: 'Implement user authentication improvements', done: false },
  { id: 5, title: 'Review security audit report', done: false },
  { id: 6, title: 'Write unit tests for API endpoints', done: false },
  { id: 7, title: 'Prepare sprint demo for stakeholders', done: false },
  { id: 8, title: 'Schedule team meeting for Q1 planning', done: true },
  { id: 9, title: 'Set up CI/CD pipeline for staging environment', done: true },
  { id: 10, title: 'Update dependencies to latest versions', done: true },
]
