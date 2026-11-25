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

