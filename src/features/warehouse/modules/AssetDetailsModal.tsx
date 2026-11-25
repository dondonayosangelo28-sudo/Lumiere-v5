import { useEffect, useMemo, useRef, useState } from "react"
import { Calendar, Loader2, MapPin, PackageOpen, Pencil, X } from "lucide-react"
import OverlayLayer from "../../../components/overlay/OverlayLayer"
import { Badge, Button, IconButton, cx } from "../../../components/ui/ui"
import { rentalCatalogOptions } from "../../event-manager/rentals/rental-catalog"
import { isCutoutImage } from "../background-removal/studio-image"
import { FALLBACK_COVER, Visual } from "../../event-manager/shared"
import type {
  OperationsStoreState,
  WarehouseInventoryItem,
} from "../../../operations/types"
import { type AssetUsageRecord, loadAssetUsageHistory } from "./asset-history"

type DetailTab = "overview" | "details" | "history"

function formatEventDate(value: string): string {
  if (!value) return "Date TBD"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function AssetDetailsModal({
  item,
  storeState,
  onEdit,
  onClose,
}: {
  item: WarehouseInventoryItem
  storeState: OperationsStoreState
  onEdit: (item: WarehouseInventoryItem) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>("overview")
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState("")
  const [historyRecords, setHistoryRecords] = useState<AssetUsageRecord[]>([])

  const vendorName = useMemo(() => {
    if (!item.primaryVendorId) return "Not provided"
    const match = rentalCatalogOptions().find(
      (opt) => opt.value === item.primaryVendorId,
    )
    return match?.label ?? item.primaryVendorId
  }, [item.primaryVendorId])

  useEffect(() => {
    setActiveTab("overview")
  }, [item.assetId])

  useEffect(() => {
    if (activeTab !== "history") return
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError("")

    void loadAssetUsageHistory(item, storeState)
      .then((res) => {
        if (cancelled) return
        setHistoryRecords(res.records)
        if (res.error) setHistoryError(res.error)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setHistoryError(
          err instanceof Error
            ? err.message
            : "Could not load event usage history.",
        )
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, item, storeState])

  const isOut = item.availableStock <= 0
  const isLow = !isOut && item.availableStock <= item.reorderThreshold
  const isCutout = isCutoutImage(item.image)
  const stockPercent =
    item.totalStock > 0
      ? Math.min(
          100,
          Math.max(0, (item.availableStock / item.totalStock) * 100),
        )
      : 0

  const dimensionsLabel =
    item.height !== undefined && item.width !== undefined
      ? `${item.height} cm H × ${item.width} cm W`
      : item.height !== undefined
        ? `${item.height} cm H`
        : item.width !== undefined
          ? `${item.width} cm W`
          : "Not provided"

  return (
    <OverlayLayer
      panelRef={panelRef}
      onClose={onClose}
      className="fixed inset-0 grid place-items-center bg-black/55 p-4 backdrop-blur-sm lg:p-6"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-details-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[min(86dvh,calc(100dvh-32px))] w-full max-w-[570px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl outline-none sm:max-h-[min(86dvh,calc(100dvh-48px))]"
      >
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line px-5 pt-3.5 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                {item.category}
              </span>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {item.assetCode}
              </span>
            </div>
            <h3
              id="asset-details-title"
              className="mt-1 truncate text-lg font-semibold tracking-tight text-foreground"
            >
              {item.name}
            </h3>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              icon={Pencil}
              onClick={() => onEdit(item)}
              className="px-3.5"
            >
              Edit Asset
            </Button>
            <IconButton
              icon={X}
              label="Close asset details"
              onClick={onClose}
            />
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Asset detail sections"
          className="flex shrink-0 items-center gap-5 border-b border-line px-5"
        >
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "details", label: "Details" },
              { id: "history", label: "History" },
            ] as const
          ).map((tab) => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={cx(
                  "relative py-2.5 text-[13px] font-semibold transition-colors",
                  selected
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {selected && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-foreground"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3.5">
          {activeTab === "overview" && (
            <div role="tabpanel" aria-label="Overview" className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-line bg-elev">
                <Visual
                  src={item.image}
                  fallbackSrc={FALLBACK_COVER}
                  label={item.name}
                  icon={PackageOpen}
                  iconSize={36}
                  framing={item.thumbnailFraming}
                  className={cx(
                    "h-56 w-full sm:h-72",
                    isCutout && "em-product em-product--cutout",
                  )}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {isOut ? (
                  <span className="inline-flex items-center rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold leading-4 text-danger">
                    Out of Stock
                  </span>
                ) : isLow ? (
                  <span className="inline-flex items-center rounded-full bg-[#ca8a04]/15 px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#facc15] ring-1 ring-inset ring-[#facc15]/20">
                    Low Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[#16a34a]/15 px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#4ade80] ring-1 ring-inset ring-[#4ade80]/20">
                    In Stock
                  </span>
                )}
                <span className="inline-flex items-center rounded-full border border-line bg-elev px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
                  Event Asset
                </span>
                <span className="inline-flex items-center rounded-full border border-line bg-card px-2 py-0.5 text-[11px] font-medium leading-4 text-foreground">
                  {item.category}
                </span>
              </div>

              <div className="rounded-xl border border-line bg-card/65 p-3.5">
                <div className="text-xs font-semibold text-muted-foreground">
                  Stock Availability
                </div>
                <div className="mt-1 text-[14px] font-semibold tabular-nums text-foreground">
                  {item.availableStock} / {item.totalStock} {item.unit}
                </div>
                <div
                  role="progressbar"
                  aria-label="Stock availability"
                  aria-valuemin={0}
                  aria-valuemax={item.totalStock}
                  aria-valuenow={item.availableStock}
                  className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-elev"
                >
                  <div
                    className={cx(
                      "h-full rounded-full transition-[width] duration-300",
                      isOut
                        ? "bg-rose-500"
                        : isLow
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    )}
                    style={{ width: `${stockPercent}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line bg-card/65 p-3.5">
                <div className="text-xs font-semibold text-foreground">
                  Asset Description
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {item.description?.trim() ||
                    "No description recorded for this asset yet."}
                </p>
              </div>
            </div>
          )}

          {activeTab === "details" && (
            <div role="tabpanel" aria-label="Details" className="space-y-4">
              <div className="rounded-xl border border-line bg-card/65 p-4">
                <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Stock Breakdown
                </div>
                <dl className="mt-3 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Total Stock</dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {item.totalStock} {item.unit}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Available</dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {item.availableStock} {item.unit}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Allocated</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {item.allocatedStock} {item.unit}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Dispatched</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {item.dispatchedStock} {item.unit}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Reorder Threshold</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {item.reorderThreshold} {item.unit}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Damaged / Missing</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {item.damagedCount} dmg · {item.missingCount} mis
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-line bg-card/65 p-4">
                <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Specifications &amp; Sourcing
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 sm:block">
                      <dt className="text-xs text-muted-foreground">Dimensions</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {dimensionsLabel}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:block">
                      <dt className="text-xs text-muted-foreground">Color</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {item.color || "Not provided"}
                      </dd>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 sm:block">
                      <dt className="text-xs text-muted-foreground">Material</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {item.material || "Not provided"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:block">
                      <dt className="text-xs text-muted-foreground">Primary Vendor</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {vendorName}
                      </dd>
                    </div>
                  </div>
                  {item.weight !== undefined ? (
                    <div className="flex items-center justify-between gap-3 sm:col-span-2 sm:block">
                      <dt className="text-xs text-muted-foreground">Weight</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {`${item.weight} kg`}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div role="tabpanel" aria-label="History" className="space-y-3">
              {historyError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-300"
                >
                  {historyError}
                </div>
              )}

              {historyLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-card/50 py-12 text-xs text-muted-foreground">
                  <Loader2 className="size-5 animate-spin text-foreground/80" />
                  <span>Loading event usage &amp; dispatch records...</span>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted-foreground">
                  No event usage or reservation records for this asset yet.
                </div>
              ) : (
                <ul className="space-y-3" aria-label="Asset event history">
                  {historyRecords.map((record) => (
                    <li
                      key={`${record.eventId}-${record.usageKind}`}
                      className="rounded-xl border border-line bg-card/65 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-foreground">
                            {record.eventTitle}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="size-3.5" aria-hidden />
                              {formatEventDate(record.date)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" aria-hidden />
                              {record.venue}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            tone={
                              record.usageKind === "confirmed"
                                ? "success"
                                : "neutral"
                            }
                          >
                            {record.usageKind === "confirmed"
                              ? "Confirmed Usage"
                              : "Reservation"}
                          </Badge>
                          <Badge tone={record.statusTone}>
                            {record.statusLabel}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-xs">
                        <span className="text-muted-foreground">
                          {record.usageKind === "confirmed"
                            ? "Quantity dispatched"
                            : "Quantity reserved"}
                          :{" "}
                          <strong className="font-semibold tabular-nums text-foreground">
                            {record.quantity !== null
                              ? `${record.quantity} ${record.unit}`
                              : "Unknown"}
                          </strong>
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          Requested: <strong className="text-foreground">{record.requestedQty}</strong> · Allocated:{" "}
                          <strong className="text-foreground">{record.allocatedQty}</strong> · Loaded:{" "}
                          <strong className="text-foreground">
                            {record.loadedQty !== null ? record.loadedQty : "Unknown"}
                          </strong>{" "}
                          · Returned:{" "}
                          <strong className="text-foreground">
                            {record.returnedQty !== null ? record.returnedQty : "Unknown"}
                          </strong>
                        </span>
                      </div>

                      {record.incidents && record.incidents.length > 0 && (
                        <div className="mt-2.5 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs space-y-1">
                          <div className="font-semibold text-danger">
                            Linked Field Incidents ({record.incidents.length})
                          </div>
                          {record.incidents.map((inc) => (
                            <div key={inc.id} className="text-muted-foreground">
                              • <strong className="text-foreground">{inc.reportType}</strong> ({inc.quantity} {record.unit}) at{" "}
                              {inc.checkpoint}: “{inc.description}” ·{" "}
                              <span className="font-medium text-foreground">
                                {inc.resolutionStatus}
                                {inc.resolutionType ? ` (${inc.resolutionType})` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </OverlayLayer>
  )
}
