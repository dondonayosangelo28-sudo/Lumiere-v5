import { assets, type Brief, type Requirement } from "./model"

/** Catalog images identify assets even in older saved pins and filled frames. */
export function syncBoardAssets(brief: Brief): Brief {
  const byImage = new Map(assets.map((asset) => [asset.image, asset.id]))
  const counts = new Map<string, number>()
  for (const pin of brief.pins) {
    const id = pin.image && byImage.get(pin.image)
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const requirements: Requirement[] = []
  const seen = new Set<string>()
  for (const row of brief.requirements) {
    seen.add(row.assetId)
    const boardQuantity = counts.get(row.assetId) ?? 0
    if (
      !boardQuantity &&
      row.boardQuantity == null &&
      row.manualQuantity == null
    ) {
      requirements.push(row)
      continue
    }
    const manualQuantity = row.manualQuantity ?? row.quantity
    const quantity = Math.max(manualQuantity, boardQuantity)
    if (quantity > 0)
      requirements.push({ ...row, quantity, manualQuantity, boardQuantity })
  }
  for (const [assetId, boardQuantity] of counts) {
    if (!seen.has(assetId))
      requirements.push({
        assetId,
        quantity: boardQuantity,
        manualQuantity: 0,
        boardQuantity,
      })
  }
  return { ...brief, requirements }
}
