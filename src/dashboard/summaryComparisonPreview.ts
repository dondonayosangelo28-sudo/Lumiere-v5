import type { SummaryCounts, SummarySnapshot } from './summarySnapshots'
import { comparisonTrend, type SummaryTrend } from './summaryTrends.ts'

export type SummaryComparisonConfig = {
  enabled: boolean
  baselines: Readonly<SummaryCounts>
}

/** Developer-only preview controls. These are sample counts, NOT recorded history. */
export const SUMMARY_COMPARISON_PREVIEW: Readonly<SummaryComparisonConfig> = Object.freeze({
  enabled: true,
  baselines: Object.freeze({
    totalUsers: 5,
    activeSessions: 2,
    lockedAccounts: 2,
  }),
})

export function snapshotComparisonTrend(
  metric: keyof SummaryCounts,
  current: number,
  previous: SummarySnapshot | null,
  config: Readonly<SummaryComparisonConfig> = SUMMARY_COMPARISON_PREVIEW,
): SummaryTrend {
  const sample = config.baselines[metric]
  const useSample = previous === null && config.enabled && Number.isInteger(sample) && sample >= 0
  const baseline = previous?.[metric] ?? (useSample ? sample : null)
  return {
    ...comparisonTrend(current, baseline, metric === 'lockedAccounts'),
    description: previous
      ? 'Compared with the recorded count 24 hours ago (one-minute sampling)'
      : useSample
        ? `Sample comparison: developer-configured baseline ${sample}; not historical data. Live count unchanged.`
        : '24-hour snapshot comparison unavailable',
  }
}
