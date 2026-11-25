import { rentalVendors } from "../features/event-manager/rentals/rental-catalog"
import { normalizeThumbnailFraming } from "../features/warehouse/background-removal/thumbnail-framing"
import type {
  AcquisitionOrder,
  DeficitQueueEntry,
  EstimateBasis,
  OperationsStoreState,
  ThumbnailFraming,
  WarehouseInventoryItem,
} from "./types"
import {
  mutateOperationsStore,
  readOperationsStore,
  zoneForInventoryCategory,
  type OpsActor,
} from "./store-core"

export type WarehouseInventoryItemInput = {
  name: string
  category: string
  description?: string
  height?: string | number
  width?: string | number
  weight?: string | number
  material?: string
  color?: string
  stock: string | number
  availableStock?: string | number
  primaryVendorId?: string
  image?: string
  thumbnailFraming?: ThumbnailFraming
  estimatedHoursPerUnitOrSet?: string | number
  estimateBasis?: EstimateBasis
  defaultSharedShiftMinCrew?: string | number
}

export type WarehouseInventoryValidationErrors = Partial<
  Record<
    | "name"
    | "category"
    | "stock"
    | "availableStock"
    | "height"
    | "width"
    | "weight"
    | "primaryVendorId"
    | "image"
    | "estimatedHoursPerUnitOrSet"
    | "defaultSharedShiftMinCrew",
    string
  >
>

function parseOptionalNonNegativeNumber(
  raw: string | number | undefined,
  label: string,
): { value?: number; error?: string } {
  if (raw === undefined || raw === null) return {}
  const trimmed = String(raw).trim()
  if (trimmed === "") return {}
  const num = Number(trimmed)
  if (!Number.isFinite(num) || num < 0) {
    return { error: `${label} must be 0 or greater.` }
  }
  return { value: num }
}

export function validateWarehouseInventoryItemInput(
  payload: WarehouseInventoryItemInput,
  options?: { currentVendorId?: string },
): {
  errors: WarehouseInventoryValidationErrors
  parsed?: {
    name: string
    category: string
    description?: string
    height?: number
    width?: number
    weight?: number
    material?: string
    color?: string
    stock: number
    availableStock?: number
    primaryVendorId?: string
    image: string
    thumbnailFraming?: ThumbnailFraming
    estimatedHoursPerUnitOrSet?: number
    estimateBasis?: EstimateBasis
    defaultSharedShiftMinCrew?: number
  }
} {
  const errors: WarehouseInventoryValidationErrors = {}
  const name = String(payload.name ?? "").trim()
  const category = String(payload.category ?? "").trim()
  const description = String(payload.description ?? "").trim()
  const material = String(payload.material ?? "").trim()
  const color = String(payload.color ?? "").trim()
  const primaryVendorId = String(payload.primaryVendorId ?? "").trim()
  const image = String(payload.image ?? "").trim() || "/event-manager-images/planning.jpg"

  if (!name) {
    errors.name = "Enter an item name."
  } else if (name.length > 120) {
    errors.name = "Keep the item name to 120 characters or fewer."
  }

  if (!category) {
    errors.category = "Select a category."
  }

  const rawStock =
    typeof payload.stock === "number"
      ? String(payload.stock)
      : String(payload.stock ?? "").trim()
  let stock = 0
  if (rawStock === "") {
    errors.stock = "Enter a stock quantity."
  } else {
    const parsedStock = Number(rawStock)
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      errors.stock = "Stock must be 0 or greater."
    } else if (!Number.isInteger(parsedStock)) {
      errors.stock = "Stock must be a whole number."
    } else {
      stock = parsedStock
    }
  }

  let availableStock: number | undefined
  if (payload.availableStock !== undefined) {
    const rawAvailable =
      typeof payload.availableStock === "number"
        ? String(payload.availableStock)
        : String(payload.availableStock ?? "").trim()
    if (rawAvailable === "") {
      errors.availableStock = "Enter an available stock quantity."
    } else {
      const parsedAvailable = Number(rawAvailable)
      if (!Number.isFinite(parsedAvailable) || parsedAvailable < 0) {
        errors.availableStock = "Available stock must be 0 or greater."
      } else if (!Number.isInteger(parsedAvailable)) {
        errors.availableStock = "Available stock must be a whole number."
      } else if (!errors.stock && parsedAvailable > stock) {
        errors.availableStock = "Available stock cannot exceed total stock."
      } else {
        availableStock = parsedAvailable
      }
    }
  }

  const heightRes = parseOptionalNonNegativeNumber(payload.height, "Height")
  if (heightRes.error) errors.height = heightRes.error

  const widthRes = parseOptionalNonNegativeNumber(payload.width, "Width")
  if (widthRes.error) errors.width = widthRes.error

  const weightRes = parseOptionalNonNegativeNumber(payload.weight, "Weight")
  if (weightRes.error) errors.weight = weightRes.error

  const estHoursRes = parseOptionalNonNegativeNumber(
    payload.estimatedHoursPerUnitOrSet,
    "Estimated labor hours",
  )
  if (estHoursRes.error) {
    errors.estimatedHoursPerUnitOrSet = estHoursRes.error
  } else if (estHoursRes.value !== undefined && estHoursRes.value <= 0) {
    errors.estimatedHoursPerUnitOrSet = "Estimated labor hours must be greater than 0."
  }

  const minCrewRes = parseOptionalNonNegativeNumber(
    payload.defaultSharedShiftMinCrew,
    "Default minimum simultaneous crew",
  )
  if (minCrewRes.error) {
    errors.defaultSharedShiftMinCrew = minCrewRes.error
  } else if (
    minCrewRes.value !== undefined &&
    (minCrewRes.value < 1 || !Number.isInteger(minCrewRes.value))
  ) {
    errors.defaultSharedShiftMinCrew =
      "Default minimum crew must be a whole number of at least 1."
  }

  const estimateBasis: EstimateBasis | undefined =
    payload.estimateBasis === "complete-set"
      ? "complete-set"
      : payload.estimateBasis === "per-unit"
        ? "per-unit"
        : estHoursRes.value !== undefined
          ? "per-unit"
          : undefined

  if (primaryVendorId) {
    const storeVendors = readOperationsStore().vendors ?? []
    const matchedVendor = storeVendors.find((v) => v.id === primaryVendorId)
    if (matchedVendor) {
      if (
        matchedVendor.status !== "Active" &&
        primaryVendorId !== options?.currentVendorId
      ) {
        errors.primaryVendorId = `Vendor "${matchedVendor.name}" is ${matchedVendor.status} and unavailable for new selections.`
      }
    } else if (!rentalVendors.some((v) => v.id === primaryVendorId)) {
      errors.primaryVendorId = "Choose a valid supplier from the catalog."
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const thumbnailFraming = normalizeThumbnailFraming(payload.thumbnailFraming)

  return {
    errors,
    parsed: {
      name,
      category,
      ...(description ? { description } : {}),
      ...(heightRes.value !== undefined ? { height: heightRes.value } : {}),
      ...(widthRes.value !== undefined ? { width: widthRes.value } : {}),
      ...(weightRes.value !== undefined ? { weight: weightRes.value } : {}),
      ...(material ? { material } : {}),
      ...(color ? { color } : {}),
      stock,
      ...(availableStock !== undefined ? { availableStock } : {}),
      ...(primaryVendorId ? { primaryVendorId } : {}),
      image,
      ...(thumbnailFraming ? { thumbnailFraming } : {}),
      ...(estHoursRes.value !== undefined
        ? { estimatedHoursPerUnitOrSet: estHoursRes.value }
        : {}),
      ...(estimateBasis !== undefined ? { estimateBasis } : {}),
      ...(minCrewRes.value !== undefined
        ? { defaultSharedShiftMinCrew: minCrewRes.value }
        : {}),
    },
  }
}

export function createWarehouseInventoryItem(
  payload: WarehouseInventoryItemInput,
):
  | { ok: true; item: WarehouseInventoryItem }
  | { ok: false; error: string; errors: WarehouseInventoryValidationErrors } {
  const validation = validateWarehouseInventoryItemInput(payload)
  if (!validation.parsed) {
    const firstError =
      Object.values(validation.errors).find(Boolean) ?? "Check the highlighted fields."
    return { ok: false, error: firstError, errors: validation.errors }
  }

  const { parsed } = validation

  try {
    return mutateOperationsStore((draft) => {
      const maxExistingNum = draft.inventory.reduce((max, entry) => {
        const idMatch = entry.assetId.match(/(\d+)$/)
        const codeMatch = entry.assetCode.match(/(\d+)$/)
        const idNum = idMatch ? Number(idMatch[1]) : 0
        const codeNum = codeMatch ? Number(codeMatch[1]) : 0
        return Math.max(max, idNum, codeNum)
      }, 23)
      const nextNum = maxExistingNum + 1
      const assetId = `evtast-${String(nextNum).padStart(4, "0")}`
      const assetCode = `AST-${String(nextNum).padStart(4, "0")}`
      const isSeating = parsed.category === "Furniture"

      const newItem: WarehouseInventoryItem = {
        assetId,
        assetCode,
        name: parsed.name,
        category: parsed.category,
        zone: zoneForInventoryCategory(parsed.category),
        unit: "pieces",
        image: parsed.image,
        ...(parsed.thumbnailFraming
          ? { thumbnailFraming: parsed.thumbnailFraming }
          : {}),
        totalStock: parsed.stock,
        availableStock: parsed.availableStock ?? parsed.stock,
        allocatedStock: 0,
        dispatchedStock: 0,
        damagedCount: 0,
        missingCount: 0,
        reorderThreshold: isSeating ? 30 : 8,
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.height !== undefined ? { height: parsed.height } : {}),
        ...(parsed.width !== undefined ? { width: parsed.width } : {}),
        ...(parsed.weight !== undefined ? { weight: parsed.weight } : {}),
        ...(parsed.material !== undefined ? { material: parsed.material } : {}),
        ...(parsed.color !== undefined ? { color: parsed.color } : {}),
        ...(parsed.primaryVendorId !== undefined
          ? { primaryVendorId: parsed.primaryVendorId }
          : {}),
        ...(parsed.estimatedHoursPerUnitOrSet !== undefined
          ? { estimatedHoursPerUnitOrSet: parsed.estimatedHoursPerUnitOrSet }
          : {}),
        ...(parsed.estimateBasis !== undefined
          ? { estimateBasis: parsed.estimateBasis }
          : {}),
        ...(parsed.defaultSharedShiftMinCrew !== undefined
          ? { defaultSharedShiftMinCrew: parsed.defaultSharedShiftMinCrew }
          : {}),
      }

      draft.inventory.unshift(newItem)
      return { ok: true as const, item: newItem }
    }, { rollbackOnStorageFailure: true })
  } catch (err) {
    const isQuota =
      err instanceof Error &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        /quota/i.test(err.message))
    return {
      ok: false,
      error: isQuota
        ? "Browser storage is full. Remove or use a smaller photo, then try saving again."
        : "Could not save item to browser storage. Please try again.",
      errors: {},
    }
  }
}

export function updateWarehouseInventoryItem(
  assetId: string,
  payload: WarehouseInventoryItemInput,
):
  | { ok: true; item: WarehouseInventoryItem }
  | { ok: false; error: string; errors: WarehouseInventoryValidationErrors } {
  const existingAsset = readOperationsStore().inventory.find(
    (entry) => entry.assetId === assetId,
  )
  const validation = validateWarehouseInventoryItemInput(payload, {
    currentVendorId: existingAsset?.primaryVendorId,
  })
  if (!validation.parsed) {
    const firstError =
      Object.values(validation.errors).find(Boolean) ?? "Check the highlighted fields."
    return { ok: false, error: firstError, errors: validation.errors }
  }

  const { parsed } = validation

  try {
    return mutateOperationsStore((draft) => {
      const idx = draft.inventory.findIndex((entry) => entry.assetId === assetId)
      if (idx === -1) {
        return {
          ok: false as const,
          error: "Asset could not be found in inventory.",
          errors: {},
        }
      }
      const existing = draft.inventory[idx]
      const isSeating = parsed.category === "Furniture"
      const committedStock =
        existing.allocatedStock +
        existing.dispatchedStock +
        existing.damagedCount +
        existing.missingCount

      if (parsed.stock < committedStock) {
        return {
          ok: false as const,
          error: `Total stock cannot be less than ${committedStock} (allocated: ${existing.allocatedStock}, dispatched: ${existing.dispatchedStock}, damaged: ${existing.damagedCount}, missing: ${existing.missingCount}).`,
          errors: {
            stock: `Total stock must be at least ${committedStock} to cover allocated (${existing.allocatedStock}), dispatched (${existing.dispatchedStock}), damaged (${existing.damagedCount}), and missing (${existing.missingCount}) units.`,
          },
        }
      }

      const maxAvailable = parsed.stock - committedStock
      const nextAvailable =
        parsed.availableStock !== undefined ? parsed.availableStock : maxAvailable

      if (nextAvailable > maxAvailable) {
        return {
          ok: false as const,
          error:
            committedStock > 0
              ? `Available stock cannot exceed ${maxAvailable} (${committedStock} units are allocated, dispatched, damaged, or missing).`
              : "Available stock cannot exceed total stock.",
          errors: {
            availableStock:
              committedStock > 0
                ? `Available stock cannot exceed ${maxAvailable} (${committedStock} units are allocated, dispatched, damaged, or missing).`
                : "Available stock cannot exceed total stock.",
          },
        }
      }

      const updated: WarehouseInventoryItem = {
        ...existing,
        name: parsed.name,
        category: parsed.category,
        zone: zoneForInventoryCategory(parsed.category),
        image: parsed.image || existing.image,
        thumbnailFraming: parsed.thumbnailFraming ?? existing.thumbnailFraming,
        totalStock: parsed.stock,
        availableStock: nextAvailable,
        reorderThreshold: isSeating ? 30 : existing.reorderThreshold,
        description: parsed.description,
        height: parsed.height,
        width: parsed.width,
        weight: parsed.weight,
        material: parsed.material,
        color: parsed.color,
        primaryVendorId: parsed.primaryVendorId,
        estimatedHoursPerUnitOrSet: parsed.estimatedHoursPerUnitOrSet,
        estimateBasis: parsed.estimateBasis,
        defaultSharedShiftMinCrew: parsed.defaultSharedShiftMinCrew,
      }
      draft.inventory[idx] = updated
      return { ok: true as const, item: updated }
    }, { rollbackOnStorageFailure: true })
  } catch (err) {
    const isQuota =
      err instanceof Error &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        /quota/i.test(err.message))
    return {
      ok: false,
      error: isQuota
        ? "Browser storage is full. Remove or use a smaller photo, then try saving again."
        : "Could not update item in browser storage. Please try again.",
      errors: {},
    }
  }
}

export type InventoryDeletionEvaluation = {
  canDelete: boolean
  reason?: string
}

/**
 * Evaluates whether an inventory asset can be safely deleted.
 * Blocks deletion when active allocations, dispatch/loading activity,
 * unresolved damaged/missing counts, open deficits, pending acquisitions,
 * or active event orders reference the asset. Historical records are preserved.
 */
export function evaluateWarehouseInventoryDeletion(
  state: OperationsStoreState,
  assetId: string,
): InventoryDeletionEvaluation {
  const existing = state.inventory.find((entry) => entry.assetId === assetId)
  if (!existing) {
    return { canDelete: false, reason: "Asset could not be found in inventory." }
  }

  const activeOrders = state.orderRequests.filter((o) => !o.warehouseClosed)
  const hasOrderAlloc = activeOrders.some((o) =>
    o.stockLines.some((s) => s.assetId === assetId && s.allocatedQty > 0),
  )
  if (existing.allocatedStock > 0 || hasOrderAlloc) {
    return {
      canDelete: false,
      reason: `Cannot delete ${existing.name}: active stock allocations exist (${existing.allocatedStock} allocated unit(s)).`,
    }
  }

  const hasOrderDispatch = activeOrders.some((o) =>
    o.stockLines.some(
      (s) =>
        s.assetId === assetId &&
        (s.loadedQty > 0 || s.releasedForLoadQty > 0),
    ),
  )
  const hasBatchDispatch = activeOrders.some((o) =>
    (o.dispatchBatches ?? []).some(
      (b) =>
        (b.stage === "Loaded" ||
          b.stage === "In Transit" ||
          b.stage === "Delivered" ||
          Boolean(b.departedAt)) &&
        b.items.some(
          (it) => it.assetId === assetId && (it.plannedQty > 0 || it.actualQty > 0),
        ),
    ),
  )
  if (existing.dispatchedStock > 0 || hasOrderDispatch || hasBatchDispatch) {
    return {
      canDelete: false,
      reason: `Cannot delete ${existing.name}: active loading or dispatch activity exists (${existing.dispatchedStock} dispatched unit(s)).`,
    }
  }

  if (existing.damagedCount > 0 || existing.missingCount > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete ${existing.name}: unresolved damaged (${existing.damagedCount}) or missing (${existing.missingCount}) units remain.`,
    }
  }

  const openDeficits = state.deficitQueue.filter(
    (d) => d.assetId === assetId && d.status !== "Fulfilled",
  )
  if (openDeficits.length > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete ${existing.name}: ${openDeficits.length} open replenishment deficit(s) reference this asset.`,
    }
  }

  const pendingAcqs = state.acquisitions.filter(
    (a) => a.assetId === assetId && a.status !== "Received & Stocked",
  )
  if (pendingAcqs.length > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete ${existing.name}: ${pendingAcqs.length} pending acquisition order(s) reference this asset.`,
    }
  }

  const referencingOrders = activeOrders.filter((o) =>
    o.stockLines.some(
      (s) => s.assetId === assetId && s.approvedRequestedQty > 0,
    ),
  )
  if (referencingOrders.length > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete ${existing.name}: ${referencingOrders.length} active event order(s) reference this asset.`,
    }
  }

  return { canDelete: true }
}

/**
 * Deletes an inventory asset after rechecking active allocations, dispatch
 * activity, open deficits, pending acquisitions, and active event references.
 * Preserves historical records and returns an error if storage fails.
 */
export function deleteWarehouseInventoryItem(
  assetId: string,
): { ok: true; item: WarehouseInventoryItem } | { ok: false; error: string } {
  try {
    return mutateOperationsStore((draft) => {
      const idx = draft.inventory.findIndex((entry) => entry.assetId === assetId)
      if (idx === -1) {
        return {
          ok: false as const,
          error: "Asset could not be found in inventory.",
        }
      }

      const check = evaluateWarehouseInventoryDeletion(draft, assetId)
      if (!check.canDelete) {
        return {
          ok: false as const,
          error: check.reason || "Asset cannot be deleted while active references exist.",
        }
      }

      const [removed] = draft.inventory.splice(idx, 1)
      return { ok: true as const, item: removed }
    })
  } catch (err) {
    const isQuota =
      err instanceof Error &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        /quota/i.test(err.message))
    return {
      ok: false,
      error: isQuota
        ? "Browser storage is full. Could not save deletion."
        : "Could not delete asset in browser storage. Please try again.",
    }
  }
}

export const GENERAL_STOCKROOM_EVENT_ID = "general-stockroom"
export const GENERAL_STOCKROOM_EVENT_TITLE = "General Stockroom"

export function createReplenishmentRequest(
  actor: OpsActor,
  payload: {
    eventId?: string
    assetId: string
    quantity: number
    unitCost?: number
    urgency?: "Standard" | "High" | "Critical"
    triggerSource?: "Manual Request" | "Auto-Threshold"
    notes?: string
  },
): { ok: true; deficit: DeficitQueueEntry } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only Warehouse Operations Managers can add replenishment requests.",
    }
  }
  const qty = Math.floor(Number(payload.quantity))
  if (!Number.isFinite(qty) || qty < 1) {
    return { ok: false, error: "Request quantity must be at least 1." }
  }

  return mutateOperationsStore((draft) => {
    const inv = draft.inventory.find((i) => i.assetId === payload.assetId)
    if (!inv) return { ok: false, error: "Inventory asset not found." }

    const isGeneral =
      !payload.eventId || payload.eventId === GENERAL_STOCKROOM_EVENT_ID
    const order = !isGeneral
      ? draft.orderRequests.find((o) => o.eventId === payload.eventId)
      : undefined
    if (!isGeneral && !order) {
      return { ok: false, error: "Selected event could not be found." }
    }

    const targetEventId = order ? order.eventId : GENERAL_STOCKROOM_EVENT_ID
    const targetEventTitle = order ? order.eventTitle : GENERAL_STOCKROOM_EVENT_TITLE

    // Prevent duplicate open/in-acquisition request for the same (eventId, assetId)
    const existingOpen = draft.deficitQueue.find(
      (d) =>
        d.eventId === targetEventId &&
        d.assetId === inv.assetId &&
        d.status !== "Fulfilled",
    )
    if (existingOpen) {
      return {
        ok: false,
        error: `An active replenishment/deficit entry already exists for ${inv.name} under ${targetEventTitle}.`,
      }
    }

    const now = new Date().toISOString()
    const cleanCost =
      payload.unitCost !== undefined &&
        Number.isFinite(Number(payload.unitCost)) &&
        Number(payload.unitCost) > 0
        ? Number(payload.unitCost)
        : undefined

    const deficit: DeficitQueueEntry = {
      id: `DEF-REP-${Date.now().toString().slice(-5)}-${draft.deficitQueue.length + 1}`,
      eventId: targetEventId,
      eventTitle: targetEventTitle,
      ...(isGeneral ? { isGeneralStockroom: true } : {}),
      assetId: inv.assetId,
      assetCode: inv.assetCode,
      assetName: inv.name,
      category: inv.category,
      shortageQty: qty,
      requiredQty: inv.availableStock + qty,
      triggerSource: payload.triggerSource ?? "Manual Request",
      ...(cleanCost !== undefined ? { unitCost: cleanCost } : {}),
      ...(payload.notes?.trim() ? { notes: payload.notes.trim() } : {}),
      createdByName: actor.name,
      urgency: payload.urgency ?? "Standard",
      status: "Open",
      createdAt: now,
    }

    draft.deficitQueue.unshift(deficit)
    return { ok: true, deficit }
  })
}

export function updateDeficitUrgency(
  actor: OpsActor,
  deficitId: string,
  urgency: "Standard" | "High" | "Critical",
): { ok: true; deficit: DeficitQueueEntry } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only Warehouse Operations Managers can update deficit priority.",
    }
  }
  return mutateOperationsStore((draft) => {
    const def = draft.deficitQueue.find((d) => d.id === deficitId)
    if (!def) return { ok: false, error: "Deficit entry not found." }
    def.urgency = urgency
    return { ok: true, deficit: { ...def } }
  })
}

/**
 * Deficit Queue & Asset Acquisition:
 * Creates an acquisition order from deficit entries or directly for inventory replenishment,
 * and when confirmed received, adds the received quantity to Warehouse Inventory and updates deficits/allocations.
 */
export function createAcquisitionOrder(payload: {
  operationId?: string
  deficitId?: string
  deficitIds?: string[]
  eventId?: string
  vendorId?: string
  assetId: string
  supplierName: string
  quantity: number
  unitCost: number
  actorName: string
  receiveImmediately?: boolean
}): { ok: true; order: AcquisitionOrder; alreadyProcessed?: boolean } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const qty = Math.floor(Number(payload.quantity))
    if (!Number.isFinite(qty) || qty < 1) {
      return { ok: false, error: "Quantity must be at least 1." }
    }

    const opId = payload.operationId?.trim()
    if (opId) {
      const existingByOp = draft.acquisitions.find((a) => a.operationId === opId)
      if (existingByOp) {
        if (existingByOp.assetId === payload.assetId && existingByOp.quantity === qty) {
          return { ok: true, order: existingByOp, alreadyProcessed: true }
        }
        return {
          ok: false,
          error: `Acquisition operation ${opId} was already submitted with different asset or quantity (${existingByOp.assetName} × ${existingByOp.quantity}).`,
        }
      }
    }

    const inv = draft.inventory.find((i) => i.assetId === payload.assetId)
    if (!inv) return { ok: false, error: "Inventory asset not found." }

    let resolvedSupplierName = payload.supplierName.trim()
    let resolvedVendorId = payload.vendorId?.trim() || undefined
    if (resolvedVendorId) {
      const vendor = (draft.vendors ?? []).find((v) => v.id === resolvedVendorId)
      if (!vendor) {
        return { ok: false, error: "Selected vendor could not be found." }
      }
      if (vendor.status !== "Active") {
        return {
          ok: false,
          error: `Vendor "${vendor.name}" is ${vendor.status} and cannot be used for new orders.`,
        }
      }
      resolvedSupplierName = vendor.name
    }

    const requestedDeficitIds = Array.from(
      new Set([
        ...(payload.deficitId ? [payload.deficitId] : []),
        ...(payload.deficitIds ?? []),
      ]),
    )
    const linkedDeficits = requestedDeficitIds
      .map((id) => draft.deficitQueue.find((d) => d.id === id))
      .filter((d): d is DeficitQueueEntry => Boolean(d))

    // Prevent duplicate purchasing for already-fulfilled or already-covered deficits
    for (const def of linkedDeficits) {
      if (def.status === "Fulfilled") {
        return {
          ok: false,
          error: `Deficit ${def.id} (${def.assetName}) is already fulfilled.`,
        }
      }
      const pendingOrderForDeficit = draft.acquisitions.find(
        (a) =>
          a.status !== "Received & Stocked" &&
          (a.deficitId === def.id || a.deficitIds?.includes(def.id)),
      )
      if (pendingOrderForDeficit) {
        return {
          ok: false,
          error: `An open acquisition order (${pendingOrderForDeficit.id}) already covers ${def.assetName} for ${def.eventTitle}.`,
        }
      }
    }

    const primaryDeficit = linkedDeficits[0]
    const now = new Date().toISOString()
    const recQty = payload.receiveImmediately ? qty : 0
    const acq: AcquisitionOrder = {
      id: `ACQ-${Date.now().toString().slice(-5)}-${draft.acquisitions.length + 1}`,
      ...(opId ? { operationId: opId } : {}),
      ...(primaryDeficit ? { deficitId: primaryDeficit.id } : {}),
      ...(linkedDeficits.length > 0
        ? { deficitIds: linkedDeficits.map((d) => d.id) }
        : {}),
      ...(resolvedVendorId ? { vendorId: resolvedVendorId } : {}),
      eventId: primaryDeficit?.eventId ?? payload.eventId,
      eventTitle:
        linkedDeficits.length > 1
          ? `Consolidated (${linkedDeficits.length} requests)`
          : primaryDeficit?.eventTitle,
      assetId: inv.assetId,
      assetCode: inv.assetCode,
      assetName: inv.name,
      supplierName:
        resolvedSupplierName || "Lumière Preferred Supply Partner",
      quantity: qty,
      receivedQty: recQty,
      ...(payload.receiveImmediately ? { postedToInventoryQty: qty } : { postedToInventoryQty: 0 }),
      unitCost: Math.max(0, Number(payload.unitCost) || 0),
      status: payload.receiveImmediately ? "Received & Stocked" : "Ordered",
      orderedByName: payload.actorName,
      createdAt: now,
      receivedAt: payload.receiveImmediately ? now : undefined,
      ...(payload.receiveImmediately
        ? {
          receiptHistory: [
            {
              id: opId ? `RCP-${opId}` : `RCP-${Date.now().toString().slice(-5)}`,
              qty,
              receivedAt: now,
              receivedByName: payload.actorName,
              notes: "Immediate receipt on order placement",
              postedToInventory: true,
              postedAt: now,
            },
          ],
        }
        : {}),
    }

    draft.acquisitions.unshift(acq)

    for (const def of linkedDeficits) {
      def.status = payload.receiveImmediately ? "Fulfilled" : "In Acquisition"
      if (payload.receiveImmediately) {
        def.resolvedAt = now
      }
    }

    if (payload.receiveImmediately) {
      inv.totalStock += qty
      inv.availableStock += qty

      const affectedEventIds = new Set(
        [
          acq.eventId,
          ...linkedDeficits.map((d) => d.eventId),
        ].filter((id): id is string => Boolean(id && id !== GENERAL_STOCKROOM_EVENT_ID)),
      )
      for (const evtId of affectedEventIds) {
        const order = draft.orderRequests.find((o) => o.eventId === evtId)
        const line = order?.stockLines.find((s) => s.assetId === acq.assetId)
        if (line && line.deficitQty > 0) {
          const addAlloc = Math.min(line.deficitQty, inv.availableStock)
          line.allocatedQty += addAlloc
          line.releasedForLoadQty = line.allocatedQty
          line.deficitQty = Math.max(
            0,
            line.approvedRequestedQty - line.allocatedQty,
          )
          inv.allocatedStock += addAlloc
          inv.availableStock = Math.max(0, inv.availableStock - addAlloc)
        }
      }
    }

    return { ok: true, order: acq }
  })
}

export function receiveAcquisitionOrder(
  acquisitionId: string,
  options?: { receiveQty?: number; receiptId?: string; actorName?: string; notes?: string },
):
  | { ok: true; addedQty: number; alreadyReceived?: boolean; status: AcquisitionOrder["status"] }
  | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const acq = draft.acquisitions.find((a) => a.id === acquisitionId)
    if (!acq) return { ok: false, error: "Acquisition order not found." }

    const alreadyReceived = acq.receivedQty ?? (acq.status === "Received & Stocked" ? acq.quantity : 0)
    const remaining = Math.max(0, acq.quantity - alreadyReceived)
    const delta =
      options?.receiveQty !== undefined
        ? Math.floor(Number(options.receiveQty))
        : remaining

    const reqReceiptId = options?.receiptId?.trim()
    if (reqReceiptId) {
      const existingReceipt = (acq.receiptHistory ?? []).find((r) => r.id === reqReceiptId)
      if (existingReceipt) {
        if (existingReceipt.qty === delta) {
          return {
            ok: true,
            addedQty: 0,
            alreadyReceived: true,
            status: acq.status,
          }
        }
        return {
          ok: false,
          error: `Receipt ID ${reqReceiptId} was already used for ${existingReceipt.qty} unit(s) and cannot be reused with quantity ${delta}.`,
        }
      }
    }

    if (acq.status === "Received & Stocked" || remaining === 0) {
      return {
        ok: true,
        addedQty: 0,
        alreadyReceived: true,
        status: "Received & Stocked" as const,
      }
    }

    if (!Number.isFinite(delta) || delta < 1) {
      return { ok: false, error: "Received quantity must be at least 1." }
    }
    if (delta > remaining) {
      return {
        ok: false,
        error: `Cannot receive ${delta} units; only ${remaining} remaining on order ${acq.id}.`,
      }
    }

    const inv = draft.inventory.find((i) => i.assetId === acq.assetId)
    if (!inv) {
      return {
        ok: false,
        error: `Cannot post receipt: inventory asset "${acq.assetName}" (${acq.assetId}) could not be matched.`,
      }
    }

    const now = new Date().toISOString()
    const nextReceived = alreadyReceived + delta
    acq.receivedQty = nextReceived
    acq.postedToInventoryQty = (acq.postedToInventoryQty ?? 0) + delta
    acq.status =
      nextReceived >= acq.quantity ? "Received & Stocked" : "Partially Received"
    if (acq.status === "Received & Stocked") {
      acq.receivedAt = now
    }
    acq.receiptHistory = [
      ...(acq.receiptHistory ?? []),
      {
        id: reqReceiptId || `RCP-${Date.now().toString().slice(-5)}-${(acq.receiptHistory?.length ?? 0) + 1}`,
        qty: delta,
        receivedAt: now,
        receivedByName: options?.actorName || "Warehouse Operations",
        ...(options?.notes?.trim() ? { notes: options.notes.trim() } : {}),
        postedToInventory: true,
        postedAt: now,
      },
    ]

    inv.totalStock += delta
    inv.availableStock += delta

    const linkedIds = Array.from(
      new Set([
        ...(acq.deficitId ? [acq.deficitId] : []),
        ...(acq.deficitIds ?? []),
      ]),
    )
    const linkedDefs = linkedIds
      .map((id) => draft.deficitQueue.find((d) => d.id === id))
      .filter((d): d is DeficitQueueEntry => Boolean(d))

    if (acq.status === "Received & Stocked") {
      for (const def of linkedDefs) {
        def.status = "Fulfilled"
        def.resolvedAt = now
      }
    }

    // Top up any linked event stock line allocations using newly available stock
    const affectedEventIds = new Set(
      [
        acq.eventId,
        ...linkedDefs.map((d) => d.eventId),
      ].filter((id): id is string => Boolean(id && id !== GENERAL_STOCKROOM_EVENT_ID)),
    )

    if (inv) {
      for (const evtId of affectedEventIds) {
        const order = draft.orderRequests.find((o) => o.eventId === evtId)
        const line = order?.stockLines.find((s) => s.assetId === acq.assetId)
        if (line && line.deficitQty > 0 && inv.availableStock > 0) {
          const addAlloc = Math.min(line.deficitQty, inv.availableStock)
          line.allocatedQty += addAlloc
          line.releasedForLoadQty = line.allocatedQty
          line.deficitQty = Math.max(
            0,
            line.approvedRequestedQty - line.allocatedQty,
          )
          inv.allocatedStock += addAlloc
          inv.availableStock = Math.max(0, inv.availableStock - addAlloc)
        }
      }
    }

    return { ok: true, addedQty: delta, status: acq.status }
  })
}

export type AcquisitionReconciliationStatus = {
  needsReconciliation: boolean
  receivedQty: number
  verifiedPostedQty: number
  unverifiedQty: number
  assetMatched: boolean
  issue?: string
}

/**
 * Evaluates whether a received acquisition has verified inventory posting.
 * Missing `postedToInventoryQty` is treated as unknown unless every receiptHistory
 * entry carries explicit `postedToInventory: true` evidence summing to receivedQty.
 * Never infers posting from current inventory stock totals alone.
 */
export function getAcquisitionReconciliationGap(
  state: OperationsStoreState,
  acq: AcquisitionOrder,
): AcquisitionReconciliationStatus {
  const receivedQty =
    acq.receivedQty ?? (acq.status === "Received & Stocked" ? acq.quantity : 0)
  if (receivedQty <= 0 && acq.status !== "Partially Received" && acq.status !== "Received & Stocked") {
    return {
      needsReconciliation: false,
      receivedQty: 0,
      verifiedPostedQty: 0,
      unverifiedQty: 0,
      assetMatched: true,
    }
  }

  const inv = state.inventory.find((i) => i.assetId === acq.assetId)
  if (!inv) {
    return {
      needsReconciliation: true,
      receivedQty,
      verifiedPostedQty: 0,
      unverifiedQty: receivedQty,
      assetMatched: false,
      issue: `Acquisition ${acq.id} (${acq.assetName}) cannot be matched to inventory asset ${acq.assetId}.`,
    }
  }

  let verifiedPostedQty = 0
  if (acq.postedToInventoryQty !== undefined) {
    verifiedPostedQty = Math.max(0, acq.postedToInventoryQty)
  } else if (
    acq.receiptHistory &&
    acq.receiptHistory.length > 0 &&
    acq.receiptHistory.every((r) => r.postedToInventory === true)
  ) {
    const sumPosted = acq.receiptHistory.reduce((s, r) => s + r.qty, 0)
    if (sumPosted >= receivedQty) {
      verifiedPostedQty = receivedQty
    }
  }

  const unverifiedQty = Math.max(0, receivedQty - verifiedPostedQty)
  if (unverifiedQty > 0) {
    return {
      needsReconciliation: true,
      receivedQty,
      verifiedPostedQty,
      unverifiedQty,
      assetMatched: true,
      issue: `Acquisition ${acq.id} (${acq.assetName}) has ${unverifiedQty} received unit(s) with unverified inventory posting and needs Warehouse reconciliation.`,
    }
  }

  return {
    needsReconciliation: false,
    receivedQty,
    verifiedPostedQty,
    unverifiedQty: 0,
    assetMatched: true,
  }
}

/**
 * Allows authorized Warehouse Operations Managers to reconcile an ambiguous
 * legacy acquisition receipt by either confirming stock was already posted
 * (no inventory change) or posting the verified missing quantity to inventory.
 */
export function reconcileLegacyAcquisitionPosting(
  acquisitionId: string,
  actor: OpsActor,
  payload: {
    decision: "already-posted" | "post-missing-stock"
    qty: number
    reason: string
  },
): { ok: true; postedQty: number } | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only authorized Warehouse Operations Managers can reconcile acquisition receipts.",
    }
  }
  const cleanReason = payload.reason.trim()
  if (!cleanReason) {
    return { ok: false, error: "Reconciliation reason is required." }
  }
  const qty = Math.floor(Number(payload.qty))
  if (!Number.isFinite(qty) || qty < 1) {
    return { ok: false, error: "Verified quantity must be at least 1." }
  }

  return mutateOperationsStore((draft) => {
    const acq = draft.acquisitions.find((a) => a.id === acquisitionId)
    if (!acq) return { ok: false, error: "Acquisition order not found." }

    const gap = getAcquisitionReconciliationGap(draft, acq)
    if (!gap.assetMatched) {
      return {
        ok: false,
        error: gap.issue || `Inventory asset ${acq.assetId} could not be matched.`,
      }
    }
    if (!gap.needsReconciliation || gap.unverifiedQty <= 0) {
      return {
        ok: false,
        error: `Acquisition ${acq.id} has no unverified received units remaining.`,
      }
    }
    if (qty > gap.unverifiedQty) {
      return {
        ok: false,
        error: `Verified quantity (${qty}) exceeds unverified received units (${gap.unverifiedQty}).`,
      }
    }

    const inv = draft.inventory.find((i) => i.assetId === acq.assetId)
    if (!inv) {
      return {
        ok: false,
        error: `Cannot reconcile: inventory asset "${acq.assetName}" (${acq.assetId}) was not found.`,
      }
    }

    const now = new Date().toISOString()
    if (payload.decision === "post-missing-stock") {
      inv.totalStock += qty
      inv.availableStock += qty
    }

    acq.postedToInventoryQty = gap.verifiedPostedQty + qty
    acq.reconciliationHistory = [
      ...(acq.reconciliationHistory ?? []),
      {
        id: `REC-${Date.now().toString().slice(-5)}-${(acq.reconciliationHistory?.length ?? 0) + 1}`,
        decision: payload.decision,
        qty,
        reason: cleanReason,
        actorName: actor.name,
        actorEmail: actor.email.toLowerCase(),
        reconciledAt: now,
      },
    ]

    return { ok: true, postedQty: qty }
  })
}
