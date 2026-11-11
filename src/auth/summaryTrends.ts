export type SummaryTrend = {
  label: string
  direction: 'up' | 'down' | 'flat'
  tone: 'positive' | 'negative' | 'neutral'
  description: string
}

export function comparisonTrend(current: number, previous: number | null, adverse = false): SummaryTrend {
  if (previous === null) return { label: '—', direction: 'flat', tone: 'neutral', description: 'Historical comparison unavailable' }
  const direction = current > previous ? 'up' : current < previous ? 'down' : 'flat'
  const label = previous === 0 ? current > 0 ? 'New' : '0%' : `${current > previous ? '+' : ''}${Number(((current - previous) / previous * 100).toFixed(1))}%`
  const unchanged = direction === 'flat' || ['0%', '+0%', '-0%'].includes(label)
  return {
    label: unchanged ? '0%' : label,
    direction: unchanged ? 'flat' : direction,
    tone: unchanged ? 'neutral' : (direction === 'up') !== adverse ? 'positive' : 'negative',
    description: 'Compared with the preceding 24 hours',
  }
}

/** Adjacent windows share no attempts: previous [now−48h, now−24h), current [now−24h, now]. */
export function precedingFailedSignIns(attempts: readonly { at: number; result: string }[], now: number) {
  const day = 86_400_000
  return attempts.filter((attempt) => attempt.result === 'Failed' && attempt.at >= now - 2 * day && attempt.at < now - day).length
}
