import {
  assets,
  type Availability,
  type Brief,
  type ReplenishmentRequirement,
} from "./model"

export const LOW_STOCK_THRESHOLD_RATIO = 0.2
export const stockThreshold = (total: number) =>
  Math.ceil(total * LOW_STOCK_THRESHOLD_RATIO)

export function stockWarning(
  assetId: string,
  requested: number,
  available: number,
) {
  const asset = assets.find((entry) => entry.id === assetId)
  if (!asset || requested <= 0) return null
  const threshold = stockThreshold(asset.stock)
  const shortage = Math.max(0, requested - available)
  if (shortage) return { reason: "shortage" as const, shortage, threshold }
  if (available - requested <= threshold)
    return { reason: "low_stock" as const, shortage: 0, threshold }
  return null
}

export const stockConfirmationKey = (
  brief: Brief,
  assetId: string,
  requested: number,
  available: number,
) => JSON.stringify([assetId, brief.start, brief.end, requested, available])

export function unconfirmedStockWarnings(
  brief: Brief,
  availability: Availability[],
) {
  return brief.requirements.filter((row) => {
    const available = availability.find(
      (entry) => entry.assetId === row.assetId,
    )?.available
    if (available === undefined) return false
    if (!stockWarning(row.assetId, row.quantity, available)) return false
    return (
      row.stockConfirmation !==
      stockConfirmationKey(brief, row.assetId, row.quantity, available)
    )
  })
}

/** Rebuild, rather than append: one pending record per event/asset; resolved rows disappear. */
export function withStockState(
  brief: Brief,
  availability: Availability[],
  eventId: string,
): Brief {
  const replenishments: ReplenishmentRequirement[] = []
  const seen = new Set<string>()
  const requirements = brief.requirements.map((row) => {
    const available = availability.find(
      (entry) => entry.assetId === row.assetId,
    )?.available
    if (available === undefined) return row
    const warning = stockWarning(row.assetId, row.quantity, available)
    if (warning && !seen.has(row.assetId)) {
      seen.add(row.assetId)
      replenishments.push({
        id: `${eventId}:${row.assetId}`,
        eventId,
        assetId: row.assetId,
        start: brief.start,
        end: brief.end,
        requested: row.quantity,
        available,
        shortage: warning.shortage,
        threshold: warning.threshold,
        reason: warning.reason,
        status: "pending",
      })
    }
    const key = stockConfirmationKey(
      brief,
      row.assetId,
      row.quantity,
      available,
    )
    if (warning && row.stockConfirmation === key) return row
    const { stockConfirmation: _old, ...rest } = row
    return rest
  })
  return {
    ...brief,
    requirements,
    ...(replenishments.length || brief.replenishments
      ? { replenishments }
      : {}),
  }
}
