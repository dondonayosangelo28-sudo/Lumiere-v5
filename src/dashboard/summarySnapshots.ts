export const SUMMARY_SAMPLE_MS = 60_000
const DAY = 86_400_000
const RETENTION_MS = 2 * DAY

export type SummaryCounts = { totalUsers: number; activeSessions: number; lockedAccounts: number }
export type SummarySnapshot = SummaryCounts & { at: number }

const valid = (sample: SummarySnapshot) => Number.isFinite(sample.at)
  && [sample.totalUsers, sample.activeSessions, sample.lockedAccounts].every((value) => Number.isInteger(value) && value >= 0)

/** Actual observations only: never synthesize samples for closed/backgrounded browser time. */
export function sampleSummaryHistory(history: readonly SummarySnapshot[], counts: SummaryCounts, now: number): readonly SummarySnapshot[] {
  const latest = history.filter(valid).reduce((at, sample) => sample.at <= now ? Math.max(at, sample.at) : at, -Infinity)
  if (now - latest < SUMMARY_SAMPLE_MS) return history
  return [...history.filter((sample) => valid(sample) && sample.at >= now - RETENTION_MS && sample.at <= now), {
    at: now, totalUsers: counts.totalUsers, activeSessions: counts.activeSessions, lockedAccounts: counts.lockedAccounts,
  }].sort((a, b) => a.at - b.at).slice(-2882)
}

/** Last observation at/before yesterday, no more than one sampling interval older. */
export function summarySnapshot24hAgo(history: readonly SummarySnapshot[], now: number): SummarySnapshot | null {
  const target = now - DAY
  return history.reduce<SummarySnapshot | null>((previous, sample) =>
    valid(sample) && sample.at <= target && sample.at >= target - SUMMARY_SAMPLE_MS
      && (!previous || sample.at > previous.at) ? sample : previous, null)
}
