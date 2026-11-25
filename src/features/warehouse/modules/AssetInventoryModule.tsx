import { Suspense, lazy, useRef, useState, type FormEvent } from "react"
import {
  ChevronDown,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  Maximize2,
  PackageOpen,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react"
import { fieldCls } from "../../../components/admin/AdminKit"
import Modal from "../../../components/overlay/Modal"
import OverlayLayer from "../../../components/overlay/OverlayLayer"
import Dropdown from "../../../components/ui/Dropdown"
import SearchableDropdown from "../../../components/ui/SearchableDropdown"
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  cx,
} from "../../../components/ui/ui"
import {
  isCutoutImage,
  validateAssetPhotoFile,
} from "../background-removal/studio-image"
import type { StudioSnapshot } from "../background-removal/studio-session"
import type { ThumbnailFraming } from "../background-removal/thumbnail-framing"
import {
  FALLBACK_COVER,
  FieldError,
  Visual,
  textareaCls,
} from "../../event-manager/shared"
import {
  createAcquisitionOrder,
  createWarehouseInventoryItem,
  deleteWarehouseInventoryItem,
  evaluateWarehouseInventoryDeletion,
  getVendorSelectOptions,
  updateWarehouseInventoryItem,
  useOperationsStore,
  validateWarehouseInventoryItemInput,
  type OpsActor,
  type WarehouseInventoryItem,
  type WarehouseInventoryValidationErrors,
} from "../../../operations/store"
import { useNotify } from "../warehouse-shared"
import AssetDetailsModal from "./AssetDetailsModal"

const INVENTORY_CATEGORY_OPTIONS = [
  "Florals",
  "Foliage",
  "Vessels",
  "Candles",
  "Furniture",
  "Lighting",
  "Structure",
  "Decor",
  "Tabletop",
  "Linens",
]

type NewItemDraft = {
  image: string
  thumbnailFraming?: ThumbnailFraming
  name: string
  category: string
  description: string
  height: string
  width: string
  material: string
  color: string
  stock: string
  availableStock: string
  primaryVendorId: string
  estimatedHoursPerUnitOrSet: string
  estimateBasis: "per-unit" | "complete-set"
  defaultSharedShiftMinCrew: string
}

const emptyDraft = (): NewItemDraft => ({
  image: "",
  name: "",
  category: "",
  description: "",
  height: "",
  width: "",
  material: "",
  color: "",
  stock: "",
  availableStock: "",
  primaryVendorId: "",
  estimatedHoursPerUnitOrSet: "",
  estimateBasis: "per-unit",
  defaultSharedShiftMinCrew: "",
})

let studioModulePromise:
  | Promise<typeof import("../background-removal/BackgroundRemovalStudioModal")>
  | undefined

function loadStudioModule() {
  studioModulePromise ??= import(
    "../background-removal/BackgroundRemovalStudioModal"
  ).catch((error) => {
    studioModulePromise = undefined
    throw error
  })
  return studioModulePromise
}

function prefetchStudio() {
  // Fetch the lazy UI while the user opens the file picker. Do not start
  // segmentation or download model weights until an image is selected.
  void loadStudioModule().catch(() => {})
}

const BackgroundRemovalStudioModal = lazy(loadStudioModule)

function StudioLoadingDialog({ onCancel }: { onCancel: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  return (
    <OverlayLayer
      panelRef={panelRef}
      onClose={onCancel}
      className="fixed inset-0 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="absolute inset-0" onClick={onCancel} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Opening Background Removal Studio"
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 text-xs font-medium text-ink shadow-2xl outline-none"
      >
        <div className="flex items-center gap-2.5">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          <span>Opening Background Removal Studio…</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="h-7 px-2.5 text-xs"
        >
          Cancel
        </Button>
      </div>
    </OverlayLayer>
  )
}

export default function AssetInventoryModule({
  actor,
}: {
  actor: OpsActor
  onNavigate: (route: string) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState("All")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [draft, setDraft] = useState<NewItemDraft>(emptyDraft)
  const [errors, setErrors] = useState<WarehouseInventoryValidationErrors>({})
  const [submitError, setSubmitError] = useState("")
  const [studioSession, setStudioSession] = useState<
    | { kind: "file"; file: File }
    | {
        kind: "reopen"
        imageSrc: string
        framing?: ThumbnailFraming
        snapshot?: StudioSnapshot | null
      }
    | null
  >(null)
  const [savedStudioSnapshot, setSavedStudioSnapshot] =
    useState<StudioSnapshot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supplierOptions = getVendorSelectOptions(
    state.vendors ?? [],
    editingAssetId ? draft.primaryVendorId : undefined,
  )
  const categories = [
    "All",
    ...Array.from(new Set(state.inventory.map((i) => i.category))),
  ]
  const modalCategories = Array.from(
    new Set([
      ...INVENTORY_CATEGORY_OPTIONS,
      ...state.inventory.map((i) => i.category),
    ]),
  )

  const filtered = state.inventory.filter((item) => {
    if (catFilter !== "All" && item.category !== catFilter) return false
    if (
      query.trim() &&
      !`${item.name} ${item.assetCode} ${item.category} ${item.zone} ${item.material ?? ""} ${item.color ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
      return false
    return true
  })

  const handleQuickReplenish = (item: WarehouseInventoryItem) => {
    const res = createAcquisitionOrder({
      assetId: item.assetId,
      supplierName: "Lumière Preferred Supply Partner",
      quantity: 20,
      unitCost: 1200,
      actorName: actor.name,
      receiveImmediately: true,
    })
    if (res.ok) {
      notify(`Received +20 ${item.name} into available stock.`)
    }
  }

  const selectedAsset = selectedAssetId
    ? state.inventory.find((i) => i.assetId === selectedAssetId) ?? null
    : null
  const editingAsset = editingAssetId
    ? state.inventory.find((i) => i.assetId === editingAssetId) ?? null
    : null
  const deleteEvaluation =
    deleteConfirmOpen && editingAsset
      ? evaluateWarehouseInventoryDeletion(state, editingAsset.assetId)
      : null

  const openDeleteConfirm = () => {
    if (!editingAsset) return
    setDeleteError("")
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (!editingAsset || deleting) return
    setDeleteError("")
    setDeleting(true)
    const res = deleteWarehouseInventoryItem(editingAsset.assetId)
    setDeleting(false)
    if (!res.ok) {
      setDeleteError(res.error)
      return
    }
    setDeleteConfirmOpen(false)
    setAddModalOpen(false)
    setEditingAssetId(null)
    if (selectedAssetId === res.item.assetId) {
      setSelectedAssetId(null)
    }
    notify(`Deleted "${res.item.name}" from inventory.`)
  }

  const openAddModal = () => {
    setEditingAssetId(null)
    setDraft(emptyDraft())
    setSavedStudioSnapshot(null)
    setErrors({})
    setSubmitError("")
    setAddModalOpen(true)
  }

  const openEditModal = (item: WarehouseInventoryItem) => {
    setEditingAssetId(item.assetId)
    setDraft({
      name: item.name,
      category: item.category,
      description: item.description ?? "",
      height: item.height !== undefined ? String(item.height) : "",
      width: item.width !== undefined ? String(item.width) : "",
      material: item.material ?? "",
      color: item.color ?? "",
      stock: String(item.totalStock),
      availableStock: String(item.availableStock),
      primaryVendorId: item.primaryVendorId ?? "",
      image: item.image,
      thumbnailFraming: item.thumbnailFraming,
      estimatedHoursPerUnitOrSet:
        item.estimatedHoursPerUnitOrSet !== undefined
          ? String(item.estimatedHoursPerUnitOrSet)
          : "",
      estimateBasis: item.estimateBasis ?? "per-unit",
      defaultSharedShiftMinCrew:
        item.defaultSharedShiftMinCrew !== undefined
          ? String(item.defaultSharedShiftMinCrew)
          : "",
    })
    setSavedStudioSnapshot(null)
    setErrors({})
    setSubmitError("")
    setAddModalOpen(true)
  }

  const closeAddModal = () => {
    if (submittingRef.current || studioSession) return
    setAddModalOpen(false)
    setEditingAssetId(null)
  }

  const updateField = <K extends keyof NewItemDraft>(
    key: K,
    value: NewItemDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSubmitError("")
    if (key in errors || key === "stock" || key === "availableStock") {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key as keyof WarehouseInventoryValidationErrors]
        if (key === "stock") delete next.availableStock
        if (key === "availableStock") delete next.stock
        return next
      })
    }
  }

  const handlePhotoUpload = (file?: File) => {
    if (!file) return
    setSubmitError("")
    setErrors((prev) => ({ ...prev, image: undefined }))
    try {
      validateAssetPhotoFile(file)
      setStudioSession({ kind: "file", file })
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        image:
          err instanceof Error ? err.message : "This image could not be read.",
      }))
    }
  }

  const handleCreateItem = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submittingRef.current || studioSession) return
    setSubmitError("")

    const payload = {
      name: draft.name,
      category: draft.category,
      description: draft.description,
      height: draft.height,
      width: draft.width,
      material: draft.material,
      color: draft.color,
      stock: draft.stock,
      ...(editingAssetId ? { availableStock: draft.availableStock } : {}),
      primaryVendorId: draft.primaryVendorId,
      image: draft.image || undefined,
      thumbnailFraming: draft.thumbnailFraming,
      estimatedHoursPerUnitOrSet: draft.estimatedHoursPerUnitOrSet,
      estimateBasis: draft.estimateBasis,
      defaultSharedShiftMinCrew: draft.defaultSharedShiftMinCrew,
    }

    const check = validateWarehouseInventoryItemInput(payload)

    if (!check.parsed) {
      setErrors(check.errors)
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      const res = editingAssetId
        ? updateWarehouseInventoryItem(editingAssetId, payload)
        : createWarehouseInventoryItem(payload)

      if (!res.ok) {
        setErrors(res.errors)
        if (Object.keys(res.errors).length === 0 && res.error) {
          setSubmitError(res.error)
        }
        return
      }

      setDraft(emptyDraft())
      setSavedStudioSnapshot(null)
      setEditingAssetId(null)
      setErrors({})
      setSubmitError("")
      setAddModalOpen(false)
      notify(
        editingAssetId
          ? `Updated ${res.item.name} (${res.item.assetCode}).`
          : `Added ${res.item.name} (${res.item.assetCode}) to inventory.`,
      )
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Warehouse Operations Manager", "Asset Inventory"]}
        title="Asset Inventory"
        subtitle="Review available, allocated, and dispatched stock."
        actions={
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
            <div
              role="group"
              aria-label="Inventory view"
              className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-card p-1"
            >
              <button
                type="button"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={cx(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                  viewMode === "grid"
                    ? "bg-invert text-invert-fg"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid size={14} aria-hidden />
                Grid
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={cx(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                  viewMode === "list"
                    ? "bg-invert text-invert-fg"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List size={14} aria-hidden />
                List
              </button>
            </div>
            <Button type="button" icon={Plus} onClick={openAddModal}>
              Add item
            </Button>
          </div>
        }
      />

      <div className="em-toolbar">
        <div role="group" aria-label="Category" className="em-chips">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={catFilter === cat}
              className="em-chip"
              onClick={() => setCatFilter(cat)}
            >
              {cat === "All" ? "All categories" : cat}
            </button>
          ))}
        </div>
        <label className="em-search">
          <Search size={15} strokeWidth={1.5} aria-hidden />
          <span className="sr-only">Search assets</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted-foreground">
          No matching inventory items.
        </div>
      ) : viewMode === "grid" ? (
        <ul
          className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          aria-label="Warehouse asset inventory"
        >
          {filtered.map((item) => {
            const isLow = item.availableStock <= item.reorderThreshold
            const isCutout = isCutoutImage(item.image)
            const freeRatio =
              item.totalStock > 0
                ? Math.min(
                  100,
                  Math.max(0, (item.availableStock / item.totalStock) * 100),
                )
                : 0
            return (
              <li key={item.assetId} className="em-asset-card">
                <button
                  type="button"
                  onClick={() => setSelectedAssetId(item.assetId)}
                  className="flex h-full w-full cursor-pointer flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
                >
                  <div className="relative w-full">
                    <Visual
                      src={item.image}
                      fallbackSrc={FALLBACK_COVER}
                      label={item.name}
                      icon={PackageOpen}
                      framing={item.thumbnailFraming}
                      className={cx(
                        "em-asset-card-media em-product",
                        isCutout && "em-product--cutout",
                      )}
                    />
                    {isLow && (
                      <div className="absolute right-3 top-3">
                        <Badge tone="warning">Low Stock</Badge>
                      </div>
                    )}
                  </div>
                  <div className="em-pitch-card-body flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="em-eyebrow">{item.category}</p>
                      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {item.assetCode}
                      </span>
                    </div>
                    <p className="em-card-title mt-1.5">{item.name}</p>
                    <dl className="em-asset-stats">
                      <div>
                        <dt>Available / Total</dt>
                        <dd>
                          {item.availableStock} / {item.totalStock} {item.unit}
                        </dd>
                      </div>
                      <div>
                        <dt>Allocated · Dispatched</dt>
                        <dd>
                          {item.allocatedStock} · {item.dispatchedStock}
                        </dd>
                      </div>
                    </dl>
                    <div
                      className="em-meter"
                      role="img"
                      aria-label={`${item.availableStock} of ${item.totalStock} available`}
                    >
                      <span style={{ width: `${freeRatio}%` }} />
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <Card className="mt-5 p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4">Asset</th>
                  <th className="py-3 pr-4">Warehouse Zone</th>
                  <th className="py-3 pr-4">Total Stock</th>
                  <th className="py-3 pr-4">Available</th>
                  <th className="py-3 pr-4">Allocated</th>
                  <th className="py-3 pr-4">Dispatched</th>
                  <th className="py-3 pr-4">Damaged / Missing</th>
                  <th className="py-3 text-right">Quick Replenish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((item) => {
                  const isLow = item.availableStock <= item.reorderThreshold
                  return (
                    <tr
                      key={item.assetId}
                      onClick={() => setSelectedAssetId(item.assetId)}
                      className="cursor-pointer hover:bg-fg/[0.03]"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <Visual
                            src={item.image}
                            label={item.name}
                            framing={item.thumbnailFraming}
                            className={cx(
                              "size-10 shrink-0 rounded-md",
                              isCutoutImage(item.image) &&
                                "em-product em-product--cutout",
                            )}
                          />
                          <div>
                            <div className="font-semibold text-foreground">
                              {item.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.assetCode} · {item.category}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {item.zone}
                      </td>
                      <td className="py-3 pr-4 font-semibold tabular-nums">
                        {item.totalStock}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        <span className="mr-2 font-semibold">
                          {item.availableStock}
                        </span>
                        {isLow && <Badge tone="warning">Low Stock</Badge>}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {item.allocatedStock}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {item.dispatchedStock}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-xs">
                        {item.damagedCount > 0 || item.missingCount > 0 ? (
                          <Badge tone="danger">
                            {item.damagedCount} dmg · {item.missingCount} mis
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleQuickReplenish(item)
                          }}
                        >
                          +20 Stock
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        title={editingAssetId ? "Edit Asset" : "Add New Item"}
        panelClassName="w-full max-w-[460px] !p-0 flex flex-col !overflow-hidden [&>div:first-child]:px-5 [&>div:first-child]:pt-3.5 [&>div:first-child]:pb-3 [&>div:first-child]:!mb-0 [&>div:first-child]:border-b [&>div:first-child]:border-line [&>div:first-child]:shrink-0"
      >
        <form
          onSubmit={handleCreateItem}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-3.5 [&_label>span:first-child]:mb-1.5">
            <div className="relative flex items-center gap-4">
              <div className="shrink-0">
                <Visual
                  src={draft.image || undefined}
                  label={
                    draft.image
                      ? `${draft.name || "New item"} preview`
                      : "Item photo preview"
                  }
                  icon={ImagePlus}
                  iconSize={26}
                  framing={draft.thumbnailFraming}
                  className={cx(
                    "size-28 rounded-2xl border border-dashed border-line bg-elev",
                    isCutoutImage(draft.image) && "em-product em-product--cutout",
                  )}
                />
              </div>
                {draft.image && (
                  <button
                    type="button"
                    disabled={submitting}
                    title="Open background removal studio"
                    aria-label="Open background removal studio"
                    onClick={() =>
                      setStudioSession({
                        kind: "reopen",
                        imageSrc: draft.image,
                        framing: draft.thumbnailFraming,
                        snapshot: savedStudioSnapshot,
                      })
                    }
                    onPointerEnter={prefetchStudio}
                    onFocus={prefetchStudio}
                    className="absolute top-0 right-0 z-10 flex size-6 items-center justify-center rounded-md border border-line bg-panel/90 text-foreground shadow-sm backdrop-blur-xs transition-colors hover:bg-elev disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Maximize2 className="size-3.5" aria-hidden />
                  </button>
                )}
              <div className="min-w-0 flex-1 space-y-2 pr-8">
                <div>
                  <p className="text-[14px] font-semibold text-foreground">
                    Add event asset photo
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Use a clear, well-lit image, up to 5MB.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    icon={Upload}
                    disabled={submitting}
                    onPointerEnter={prefetchStudio}
                    onFocus={prefetchStudio}
                    onClick={() => {
                      prefetchStudio()
                      fileInputRef.current?.click()
                    }}
                    className="h-8 px-3 text-xs"
                  >
                    {draft.image ? "Change photo" : "Upload photo"}
                  </Button>
                  {draft.image && (
                    <Button
                      type="button"
                      variant="ghost"
                      icon={Trash2}
                      disabled={submitting}
                      onClick={() => {
                        updateField("image", "")
                        updateField("thumbnailFraming", undefined)
                        setSavedStudioSnapshot(null)
                      }}
                      className="h-8 px-2.5 text-xs"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  hidden
                  type="file"
                  accept="image/*"
                  aria-label="Upload item photo"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    void handlePhotoUpload(file)
                  }}
                />
                <FieldError id="inv-err-image" text={errors.image} />
              </div>
            </div>

            <div className="border-t border-line" />

            <div className="space-y-3">
              <div>
                <Field label="Item name">
                  <Input
                    id="inv-item-name"
                    value={draft.name}
                    maxLength={120}
                    placeholder="e.g. Fluted Glass Hurricane Vase"
                    aria-invalid={!!errors.name || undefined}
                    aria-describedby={errors.name ? "inv-err-name" : undefined}
                    className={cx(errors.name && "border-red-400")}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                </Field>
                <FieldError id="inv-err-name" text={errors.name} />
              </div>

              <div>
                <Field label="Category">
                  <div className="relative">
                    <Dropdown
                      id="inv-item-category"
                      aria-label="Category"
                      value={draft.category}
                      aria-invalid={!!errors.category || undefined}
                      aria-describedby={
                        errors.category ? "inv-err-category" : undefined
                      }
                      onChange={(e) => updateField("category", e.target.value)}
                      className={cx(
                        fieldCls,
                        "appearance-none pr-9",
                        errors.category && "border-red-400",
                      )}
                    >
                      <option value="">Select category</option>
                      {modalCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </Dropdown>
                    <ChevronDown
                      size={16}
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </Field>
                <FieldError id="inv-err-category" text={errors.category} />
              </div>

              <div>
                <Field label="Description">
                  <textarea
                    id="inv-item-description"
                    rows={2}
                    value={draft.description}
                    placeholder="Describe styling notes, condition details, or handling guidance…"
                    className={cx(textareaCls, "!min-h-16 h-16 resize-y")}
                    onChange={(e) => updateField("description", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="border-t border-line" />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Field label="Height">
                  <div className="relative">
                    <Input
                      id="inv-item-height"
                      type="number"
                      min={0}
                      step="any"
                      value={draft.height}
                      placeholder="0"
                      aria-invalid={!!errors.height || undefined}
                      aria-describedby={
                        errors.height ? "inv-err-height" : undefined
                      }
                      className={cx("pr-10", errors.height && "border-red-400")}
                      onChange={(e) => updateField("height", e.target.value)}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                    >
                      cm
                    </span>
                  </div>
                </Field>
                <FieldError id="inv-err-height" text={errors.height} />
              </div>

              <div>
                <Field label="Width">
                  <div className="relative">
                    <Input
                      id="inv-item-width"
                      type="number"
                      min={0}
                      step="any"
                      value={draft.width}
                      placeholder="0"
                      aria-invalid={!!errors.width || undefined}
                      aria-describedby={
                        errors.width ? "inv-err-width" : undefined
                      }
                      className={cx("pr-10", errors.width && "border-red-400")}
                      onChange={(e) => updateField("width", e.target.value)}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                    >
                      cm
                    </span>
                  </div>
                </Field>
                <FieldError id="inv-err-width" text={errors.width} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Field label="Material">
                  <Input
                    id="inv-item-material"
                    value={draft.material}
                    placeholder="e.g. Hand-blown glass, brushed brass"
                    className="placeholder:truncate"
                    onChange={(e) => updateField("material", e.target.value)}
                  />
                </Field>
              </div>

              <div>
                <Field label="Color">
                  <Input
                    id="inv-item-color"
                    value={draft.color}
                    placeholder="e.g. Warm champagne gold"
                    className="placeholder:truncate"
                    onChange={(e) => updateField("color", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="border-t border-line" />

            <div className="grid gap-3 sm:grid-cols-2">
              {editingAssetId && (
                <div>
                  <Field label="Available Stock">
                    <Input
                      id="inv-item-available-stock"
                      type="number"
                      min={0}
                      step={1}
                      value={draft.availableStock}
                      placeholder="0"
                      aria-invalid={!!errors.availableStock || undefined}
                      aria-describedby={
                        errors.availableStock
                          ? "inv-err-available-stock"
                          : undefined
                      }
                      className={cx(errors.availableStock && "border-red-400")}
                      onChange={(e) =>
                        updateField("availableStock", e.target.value)
                      }
                    />
                  </Field>
                  <FieldError
                    id="inv-err-available-stock"
                    text={errors.availableStock}
                  />
                </div>
              )}

              <div>
                <Field label={editingAssetId ? "Total Stock" : "Stock"}>
                  <Input
                    id="inv-item-stock"
                    type="number"
                    min={0}
                    step={1}
                    value={draft.stock}
                    placeholder="0"
                    aria-invalid={!!errors.stock || undefined}
                    aria-describedby={errors.stock ? "inv-err-stock" : undefined}
                    className={cx(errors.stock && "border-red-400")}
                    onChange={(e) => updateField("stock", e.target.value)}
                  />
                </Field>
                <FieldError id="inv-err-stock" text={errors.stock} />
              </div>

              <div className={editingAssetId ? "sm:col-span-2" : undefined}>
                <span className="mb-1.5 block text-[14px] font-semibold text-foreground">
                  Primary vendor
                </span>
                <div className="relative">
                  <SearchableDropdown
                    aria-label="Primary vendor"
                    value={draft.primaryVendorId}
                    onChange={(value) => updateField("primaryVendorId", value)}
                    options={supplierOptions}
                    placeholder="Select primary vendor"
                    searchPlaceholder="Search supplier name or type..."
                    emptyMessage="No matching suppliers."
                    className={cx(
                      fieldCls,
                      "appearance-none pr-9 text-left",
                      errors.primaryVendorId && "border-red-400",
                    )}
                  />
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
                <FieldError id="inv-err-vendor" text={errors.primaryVendorId} />
              </div>
            </div>

            {submitError && (
              <div
                role="alert"
                className="rounded-lg border border-red-400/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400"
              >
                {submitError}
              </div>
            )}
          </div>

          <div
            className={cx(
              "flex shrink-0 items-center gap-2.5 border-t border-line bg-card px-5 py-3",
              editingAssetId ? "justify-between" : "justify-end",
            )}
          >
            {editingAssetId && (
              <Button
                type="button"
                variant="ghost"
                icon={Trash2}
                disabled={submitting || deleting || Boolean(studioSession)}
                onClick={openDeleteConfirm}
                className="bg-transparent! text-danger! hover:bg-danger/10! hover:text-danger!"
              >
                Delete asset
              </Button>
            )}
            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                disabled={submitting || deleting}
                onClick={closeAddModal}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || deleting || Boolean(studioSession)}
              >
                {submitting
                  ? "Saving…"
                  : editingAssetId
                    ? "Save changes"
                    : "Save item"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteConfirmOpen && Boolean(editingAsset)}
        onClose={() => {
          if (!deleting) setDeleteConfirmOpen(false)
        }}
        title="Delete asset"
      >
        {editingAsset && (
          <div className="space-y-4 text-xs">
            <p className="text-muted-foreground">
              Permanently remove{" "}
              <strong className="text-foreground">{editingAsset.name}</strong>{" "}
              from active warehouse inventory? Historical acquisition, incident,
              and closed event records will be preserved.
            </p>

            <div className="space-y-1.5 rounded-lg border border-line bg-fg/[0.02] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Asset Name</span>
                <strong className="text-foreground">{editingAsset.name}</strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Asset ID</span>
                <span className="font-mono text-foreground">
                  {editingAsset.assetId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Current Stock</span>
                <span className="font-mono text-foreground">
                  {editingAsset.totalStock} total ({editingAsset.availableStock}{" "}
                  available)
                </span>
              </div>
            </div>

            {((deleteEvaluation && !deleteEvaluation.canDelete) || deleteError) && (
              <div
                role="alert"
                className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-red-400"
              >
                {deleteError || deleteEvaluation?.reason}
              </div>
            )}

            <div className="flex justify-end gap-2.5 border-t border-line pt-3">
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                icon={Trash2}
                disabled={
                  deleting ||
                  Boolean(deleteEvaluation && !deleteEvaluation.canDelete)
                }
                onClick={handleConfirmDelete}
                className="border-transparent bg-danger! text-white! hover:bg-danger/90!"
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {selectedAsset && (
        <AssetDetailsModal
          item={selectedAsset}
          storeState={state}
          onEdit={openEditModal}
          onClose={() => setSelectedAssetId(null)}
        />
      )}

      {studioSession && (
        <Suspense
          fallback={
            <StudioLoadingDialog onCancel={() => setStudioSession(null)} />
          }
        >
          <BackgroundRemovalStudioModal
            initialFile={
              studioSession.kind === "file" ? studioSession.file : undefined
            }
            reopenData={
              studioSession.kind === "reopen" ? studioSession : undefined
            }
            assetName={draft.name}
            onApply={({ dataUrl, framing, snapshot }) => {
              updateField("image", dataUrl)
              updateField("thumbnailFraming", framing)
              setSavedStudioSnapshot(snapshot)
              setStudioSession(null)
            }}
            onCancel={() => {
              setStudioSession(null)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
