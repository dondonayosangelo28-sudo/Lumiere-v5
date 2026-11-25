import type { LucideIcon } from 'lucide-react'
import type { SummaryTrend } from '../../../dashboard/summaryTrends'

export type StatCardData = {
  id: string
  title: string
  value: string | number
  icon: LucideIcon
  iconClassName?: string
  description?: string
  trend?: SummaryTrend
  action?: () => void
  actionLabel?: string
}
