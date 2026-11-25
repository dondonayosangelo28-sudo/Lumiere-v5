import { Component, Fragment, lazy, Suspense, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  Pencil,
  Search,
  Trash2,
  Truck,
} from "lucide-react"
import Modal from "../../../components/overlay/Modal"
import Dropdown from "../../../components/ui/Dropdown"
import RowMenu from "../../../components/ui/RowMenu"
import { Badge, Button, Field, Input } from "../../../components/ui/ui"
import { fmtStamp, textareaCls } from "../../event-manager/shared"
import { findSavedProjectVenueLocation } from "../../event-manager/preview-data"
import type {
  DispatchBatchDirection,
  DispatchBatchRecord,
  DispatchBatchStage,
  ManifestLineItem,
  WarehouseOrderRequest,
} from "../../../operations/types"
import { hasFernbrookSampleRoute } from "./fernbrook-sample-route"
import { isVenueLocation, type VenueLocation } from "../../../operations/venue-location"
import {
  isBatchOutboundInTransit,
  isBatchReturnInTransit,
  isBatchReturnPhase,
} from "../../../operations/store-dispatch"
import "./dispatch-workspace.css"

export type DispatchSelection = {
  order: WarehouseOrderRequest
  batch?: DispatchBatchRecord
  needsAttention?: boolean
  loadingPercent?: number
}

type Filter = { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }

type DirectoryProps = {
  query: string
  onQueryChange: (query: string) => void
  filters: Filter[]
  entries: DispatchSelection[]
  onSelect: (entry: DispatchSelection) => void
}

export type BatchUpdateResult = { status: "saved" } | { status: "pending" | "error"; error: string }

type Props = {
  order: WarehouseOrderRequest
  batches: DispatchBatchRecord[]
  batch?: DispatchBatchRecord
  onSelectBatch: (id: string | null) => void
  manifest: ManifestLineItem[]
  onOpenEvent?: (tab: "overview" | "items" | "requests") => void
  onMarkLoaded: (batch: DispatchBatchRecord) => void
  onMarkInTransit: (batch: DispatchBatchRecord) => void
  onMarkDelivered: (batch: DispatchBatchRecord) => void
  onStartReturn: (batch: DispatchBatchRecord) => void
  onMarkReturnInTransit: (batch: DispatchBatchRecord) => void
  onMarkReturned: (batch: DispatchBatchRecord) => void
  onUpdateBatch: (
    batch: DispatchBatchRecord,
    patch: { vehicleType: string; plateNumber: string; driverName: string; handoffNotes: string },
  ) => BatchUpdateResult
  onRetryPersistBatch: (batch: DispatchBatchRecord) => BatchUpdateResult
  onDeleteBatch: (batch: DispatchBatchRecord) => void
  onExport: () => void
}

const outboundStages: DispatchBatchStage[] = [
  "Planned",
  "Loaded",
  "Outbound in transit",
  "Delivered",
  "Return loading",
  "Return in transit",
  "Returned",
]
const returnStages: DispatchBatchStage[] = ["Planned", "Loaded", "Return in transit", "Returned"]

function getEventDepartureState(order: WarehouseOrderRequest) {
  const departedOutbound = (order.dispatchBatches ?? []).filter(
    (item) =>
      !item.deletedAt &&
      item.stage !== "Cancelled" &&
      item.direction === "outbound" &&
      (item.stage === "Outbound in transit" ||
        item.stage === "In Transit" ||
        item.stage === "Delivered" ||
        item.stage === "Return loading" ||
        item.stage === "Return in transit" ||
        item.stage === "Returned" ||
        Boolean(item.departedAt)),
  )
  const departedTimes = departedOutbound
    .map((item) => item.departedAt ?? item.updatedAt)
    .filter((time): time is string => Boolean(time))
    .sort()
  return {
    departed: Boolean(order.outboundDeparture) || departedOutbound.length > 0,
    departedAt: order.outboundDeparture?.confirmedAt ?? departedTimes[0],
  }
}

function StageBadge({ order, batch }: DispatchSelection) {
  if (batch) {
    const tone =
      batch.stage === "Cancelled"
        ? "danger"
        : batch.stage === "Delivered" || batch.stage === "Returned"
          ? "success"
          : batch.stage === "Planned" ||
            batch.stage === "Loaded" ||
            batch.stage === "Return loading" ||
            batch.stage === "Outbound in transit" ||
            batch.stage === "Return in transit" ||
            batch.stage === "In Transit"
            ? "warning"
            : "neutral"
    const stageAttr =
      batch.stage === "In Transit"
        ? batch.direction === "return"
          ? "Return in transit"
          : "Outbound in transit"
        : batch.stage
    return (
      <span className="dispatch-stage-badge" data-stage={stageAttr}>
        <Badge tone={tone}>{batch.stage}</Badge>
      </span>
    )
  }
  if (order.warehouseClosed) return <Badge tone="success">Closed</Badge>
  if (order.warehouseArrival) return <Badge tone="warning">Return review</Badge>
  if (order.venueArrival) return <Badge tone="success">At venue</Badge>
  if (getEventDepartureState(order).departed) {
    return (
      <span className="dispatch-stage-badge" data-stage="Outbound in transit">
        <Badge tone="info">In transit</Badge>
      </span>
    )
  }
  return <Badge tone="neutral">Preparing</Badge>
}

const DispatchRouteMap = lazy(() => import("./DispatchRouteMap"))

class RouteMapBoundary extends Component<{ children: ReactNode }, { unavailable: boolean }> {
  state = { unavailable: false }

  static getDerivedStateFromError() {
    return { unavailable: true }
  }

  render() {
    return this.state.unavailable
      ? <p className="dispatch-route-message">Interactive map unavailable on this device.</p>
      : this.props.children
  }
}

function getCheckpoints({ order, batch }: DispatchSelection) {
  const stages = batch?.direction === "return" ? returnStages : outboundStages
  const normalizedStage: DispatchBatchStage | undefined =
    batch?.stage === "In Transit"
      ? batch.direction === "return"
        ? "Return in transit"
        : "Outbound in transit"
      : batch?.stage
  const current = normalizedStage ? stages.indexOf(normalizedStage) : -1
  const departureState = batch ? undefined : getEventDepartureState(order)
  const checkpoints = batch
    ? stages.map((name, index) => ({
      name,
      done:
        index === 0 ||
        index <= current ||
        (name === "Outbound in transit" && Boolean(batch.departedAt)) ||
        (name === "Return in transit" && Boolean(batch.returnDepartedAt)),
      time:
        name === "Planned"
          ? batch.createdAt
          : name === "Outbound in transit"
            ? batch.departedAt
            : name === "Delivered"
              ? batch.deliveredAt
              : name === "Return loading"
                ? batch.returnStartedAt
                : name === "Return in transit"
                  ? (batch.returnDepartedAt ?? (batch.direction === "return" ? batch.departedAt : undefined))
                  : name === "Returned"
                    ? batch.returnedAt
                    : undefined,
    }))
    : [
      { name: "Loading checklist", done: Boolean(order.loadingChecklist), time: order.loadingChecklist?.submittedAt },
      { name: "Warehouse departure", done: Boolean(departureState?.departed), time: departureState?.departedAt },
      { name: "Venue arrival", done: Boolean(order.venueArrival), time: order.venueArrival?.submittedAt },
      { name: "Warehouse return", done: Boolean(order.warehouseArrival), time: order.warehouseArrival?.submittedAt },
      { name: "Accountability closeout", done: order.warehouseClosed, time: order.closedAt },
    ]
  const next = batch?.stage === "Cancelled" ? -1 : checkpoints.findIndex((point) => !point.done)
  return checkpoints.map((point, index) => ({ ...point, status: point.done ? "done" : index === next ? "next" : "pending" }))
}

type Checkpoint = ReturnType<typeof getCheckpoints>[number]

function RecordedCheckpoints({ checkpoints }: { checkpoints: Checkpoint[] }) {

  return (
    <ol className="dispatch-track" aria-label="Recorded checkpoints">
      {checkpoints.map((point) => (
        <li key={point.name} aria-current={point.status === "next" ? "step" : undefined} data-point={point.status}>
          <span className="dispatch-track-dot" aria-hidden="true">{point.done && <Check size={10} />}</span>
          <span>{point.name}<span className="sr-only">, {point.done ? "recorded" : "pending"}</span></span>
          {point.time && <time dateTime={point.time}>{fmtStamp(point.time)}</time>}
        </li>
      ))}
    </ol>
  )
}

function resolveOrderVenuePin(order: WarehouseOrderRequest): VenueLocation | undefined {
  if (isVenueLocation(order.venueLocation)) return order.venueLocation
  return findSavedProjectVenueLocation({
    projectId: order.projectId,
    eventId: order.eventId,
  })
}

function RouteMapCard({ direction, order }: { direction: DispatchBatchDirection; order: WarehouseOrderRequest }) {
  const pin = resolveOrderVenuePin(order)
  const hasSampleRoute = !pin && hasFernbrookSampleRoute(order.venue)
  const label = pin
    ? "Pinned venue map for " + order.venue
    : hasSampleRoute ? "Sample " + direction + " route map between PUP Sta. Mesa and The Glasshouse at Fernbrook" : "Route map"

  return (
    <section id="dispatch-route-map" className="dispatch-panel dispatch-route-map" aria-label={label}>
      <div className="dispatch-route-frame">
        {pin || hasSampleRoute ? (
          <RouteMapBoundary>
            <Suspense fallback={<p className="dispatch-route-message" role="status">Loading map…</p>}>
              <DispatchRouteMap direction={direction} venuePin={pin ? { ...pin, label: order.venue } : undefined} />
            </Suspense>
          </RouteMapBoundary>
        ) : <p className="dispatch-route-message">No venue pin has been saved for this event.</p>}
      </div>
    </section>
  )
}

type CargoRow = {
  id: string
  code: string
  name: string
  kind: string
  expected: number
  actual: number
  returned?: number | null
  note?: string
  onHold?: boolean
}

function CargoBalance({ checkpoints, rows, actualLabel, returnCounted }: { checkpoints: Checkpoint[]; rows: CargoRow[]; actualLabel: string; returnCounted?: string }) {
  const planned = rows.reduce((sum, row) => sum + row.expected, 0)
  const actual = rows.reduce((sum, row) => sum + row.actual, 0)
  return (
    <section id="dispatch-cargo" className="dispatch-panel dispatch-cargo-balance" aria-label="Cargo load">
      <header className="dispatch-visual-heading dispatch-cargo-heading">
        <div className="dispatch-visual-icon"><Boxes size={17} aria-hidden="true" /></div>
        <div><h2>Cargo load</h2><p>{rows.length} {rows.length === 1 ? "line item" : "line items"}</p></div>
      </header>
      <RecordedCheckpoints checkpoints={checkpoints} />
      <div className="dispatch-cargo-scores" data-fulfilled={planned > 0 && rows.every((row) => row.actual >= row.expected && !row.onHold)}>
        <div className="dispatch-cargo-copy">
          <div><strong>{actual.toLocaleString()}</strong><span> / {planned.toLocaleString()} {planned === 1 ? "unit" : "units"}</span><p>{actualLabel}</p></div>
          {returnCounted && <div className="dispatch-return-count"><strong>{returnCounted}</strong><p>Return lines counted</p></div>}
        </div>
        {planned > 0 && <progress className="dispatch-progress" aria-label={`${actualLabel} quantity`} value={Math.min(actual, planned)} max={planned} />}
      </div>
    </section>
  )
}

function DispatchVehicleImage() {
  return <img className="dispatch-vehicle-image" src="/dispatch-vehicle-cutout.png" alt="" width={1130} height={631} decoding="async" />
}

function RosterCard({ entry, selected, showChevron = true, onClick }: { entry: DispatchSelection; selected?: boolean; showChevron?: boolean; onClick: () => void }) {
  const { order, batch } = entry
  const activeBatches = (order.dispatchBatches ?? []).filter((item) => item.stage !== "Cancelled")
  const inReturn = batch ? isBatchReturnPhase(batch) : false
  const plate = batch ? (inReturn ? (batch.returnPlateNumber ?? batch.plateNumber) : batch.plateNumber) : undefined
  const driver = batch ? (inReturn ? (batch.returnDriverName ?? batch.driverName) : batch.driverName) : undefined
  const vehicle = batch ? (inReturn ? (batch.returnVehicleType ?? batch.vehicleType) : batch.vehicleType) : undefined
  const batchMeta = batch ? [plate, driver].filter((value): value is string => Boolean(value)) : []
  const secondary = batch ? "" : fmtStamp(order.startDateTime)
  return (
    <button type="button" className="dispatch-roster-card" aria-pressed={selected} onClick={onClick}>
      <span className="dispatch-roster-preview">
        <span className="dispatch-roster-copy">
          <span className="dispatch-roster-top">
            <span className="dispatch-id">{batch?.id ?? order.id}</span>
            {!batch && <StageBadge {...entry} />}
          </span>
          <span className="dispatch-roster-title">
            <span className="dispatch-roster-icon" data-kind={batch ? "batch" : "event"}>{batch ? <Truck size={18} aria-hidden="true" /> : <CalendarDays size={17} aria-hidden="true" />}</span>
            <strong>{batch ? vehicle || "Vehicle pending" : order.eventTitle}</strong>
          </span>
        </span>
        <DispatchVehicleImage />
        {showChevron && <ChevronRight className="dispatch-roster-chevron" size={15} aria-hidden="true" />}
      </span>
      <span className="dispatch-roster-venue"><MapPin size={13} aria-hidden="true" />{order.venue || "Venue pending"}</span>
      <span className="dispatch-roster-foot" data-kind={batch ? "batch" : "event"}>
        {batch ? (
          <>
            {batchMeta.map((item, index) => (
              <Fragment key={index}>
                <span className="dispatch-roster-meta">{item}</span>
                <span className="dispatch-roster-sep" aria-hidden="true">·</span>
              </Fragment>
            ))}
            <StageBadge {...entry} />
          </>
        ) : (
          <>
            <span>{secondary}</span>
            <span>{activeBatches.length} {activeBatches.length === 1 ? "batch" : "batches"}{entry.needsAttention && <span className="dispatch-attention"> · Review</span>}</span>
          </>
        )}
      </span>
    </button>
  )
}

function OperationDetails({ entry, onMarkLoaded, onMarkInTransit, onMarkDelivered, onStartReturn, onMarkReturnInTransit, onMarkReturned, onEditBatch, onDeleteBatch }: Pick<Props, "onMarkLoaded" | "onMarkInTransit" | "onMarkDelivered" | "onStartReturn" | "onMarkReturnInTransit" | "onMarkReturned" | "onDeleteBatch"> & { entry: DispatchSelection; onEditBatch: (batch: DispatchBatchRecord) => void }) {
  const { batch, order } = entry
  const inReturnPhase = batch ? isBatchReturnPhase(batch) : false
  const fromWarehouse = !inReturnPhase
  const venue = order.venue || "Venue pending"
  const scheduledAt = batch ? (inReturnPhase ? (batch.returnStartedAt ?? batch.createdAt) : batch.createdAt) : order.startDateTime
  const batchLocked = Boolean(
    order.warehouseClosed ||
    batch?.departedAt ||
    (batch && batch.stage !== "Planned" && batch.stage !== "Loaded"),
  )
  const displayVehicle = batch ? (inReturnPhase ? (batch.returnVehicleType ?? batch.vehicleType) : batch.vehicleType) : undefined
  const displayPlate = batch ? (inReturnPhase ? (batch.returnPlateNumber ?? batch.plateNumber) : batch.plateNumber) : undefined
  const displayDriver = batch ? (inReturnPhase ? (batch.returnDriverName ?? batch.driverName) : batch.driverName) : undefined
  const checkpoints = batch ? [] : getCheckpoints({ order })
  const currentCheckpoint = checkpoints.find((point) => point.status === "next") ?? checkpoints[checkpoints.length - 1]
  return (
    <section id="dispatch-operation" className="dispatch-panel dispatch-operation">
      <header className="dispatch-section-heading">
        <div><h2>{batch ? "Operation details" : "Event details"}</h2>{batch && <p>{order.eventTitle}</p>}</div>
        {batch && (
          <RowMenu label="Batch actions" items={[
            ...(batch.stage === "Planned"
              ? [{
                label: "Mark as loaded",
                icon: Check,
                disabled: batchLocked ? "Available before departure." : undefined,
                onClick: () => onMarkLoaded(batch),
              }]
              : []),
            ...(batch.stage === "Loaded"
              ? [{
                label: batch.direction === "return" ? "Mark as return in transit" : "Mark as outbound in transit",
                icon: Truck,
                disabled: order.warehouseClosed ? "Event accountability is closed." : undefined,
                onClick: () => (batch.direction === "return" ? onMarkReturnInTransit(batch) : onMarkInTransit(batch)),
              }]
              : []),
            ...(isBatchOutboundInTransit(batch)
              ? [{
                label: "Mark as delivered",
                icon: Check,
                disabled: order.warehouseClosed ? "Event accountability is closed." : undefined,
                onClick: () => onMarkDelivered(batch),
              }]
              : []),
            ...(batch.direction === "outbound" && batch.stage === "Delivered"
              ? [{
                label: "Start return",
                icon: Truck,
                disabled: order.warehouseClosed ? "Event accountability is closed." : undefined,
                onClick: () => onStartReturn(batch),
              }]
              : []),
            ...(batch.stage === "Return loading"
              ? [{
                label: "Mark as return in transit",
                icon: Truck,
                disabled: order.warehouseClosed ? "Event accountability is closed." : undefined,
                onClick: () => onMarkReturnInTransit(batch),
              }]
              : []),
            ...(isBatchReturnInTransit(batch)
              ? [{
                label: "Mark as returned",
                icon: Check,
                disabled: order.warehouseClosed ? "Event accountability is closed." : undefined,
                onClick: () => onMarkReturned(batch),
              }]
              : []),
            {
              label: inReturnPhase ? "Edit return details" : "Edit details",
              icon: Pencil,
              disabled: order.warehouseClosed
                ? "Event accountability is closed."
                : batch.stage === "Cancelled"
                  ? "Cancelled batches are read-only."
                  : undefined,
              onClick: () => onEditBatch(batch),
            },
            {
              label: "Delete batch",
              icon: Trash2,
              danger: true,
              disabled: batchLocked || (batch.stage !== "Planned" && batch.stage !== "Loaded" && batch.stage !== "Cancelled") ? "Available before departure." : undefined,
              onClick: () => onDeleteBatch(batch),
            },
          ]} />
        )}
      </header>
      <div className="dispatch-operation-body">
        <dl className="dispatch-operation-grid" data-mode={batch ? "batch" : "event"}>
          <div className="dispatch-operation-driver">
            <dt>{batch ? (inReturnPhase ? "Return driver" : "Driver name") : "Event name"}</dt>
            <dd>{batch ? (displayDriver || "Driver pending") : order.eventTitle}</dd>
          </div>
          <div className="dispatch-operation-vehicle">
            <dt className="sr-only">{batch ? "Vehicle" : "Order and checkpoint"}</dt>
            <dd>
              <span className="dispatch-id">{batch?.id ?? order.id}</span>
              {batch ? (
                <span className="dispatch-operation-vehicle-name">
                  <Truck size={14} aria-hidden="true" />
                  {displayVehicle || "Vehicle pending"}
                  {displayPlate && <small>{displayPlate}</small>}
                </span>
              ) : currentCheckpoint && (
                <span className="dispatch-operation-vehicle-name" data-point={currentCheckpoint.status}>
                  <Truck size={14} aria-hidden="true" />
                  {currentCheckpoint.name}
                </span>
              )}
            </dd>
          </div>
          <div className="dispatch-operation-route">
            <dt className="sr-only">{batch ? "Route" : "Venue"}</dt>
            <dd>
              <ol className="dispatch-operation-stops">
                <li><span className="sr-only">From </span>{fromWarehouse ? "Warehouse" : venue}</li>
                <li><MapPin size={13} aria-hidden="true" /><span className="sr-only">To </span>{fromWarehouse ? venue : "Warehouse"}</li>
              </ol>
            </dd>
          </div>
          <div className="dispatch-operation-date">
            <dt>{batch ? (inReturnPhase ? "Return trip" : "Dispatch batch") : "Event schedule"}</dt>
            <dd>
              <CalendarDays size={14} aria-hidden="true" />
              <time dateTime={scheduledAt}>{fmtStamp(scheduledAt)}</time>
            </dd>
          </div>
          {batch && (
            <div className="dispatch-operation-status">
              <dt className="sr-only">Status</dt>
              <dd><StageBadge {...entry} /></dd>
            </div>
          )}
        </dl>
        <DispatchVehicleImage />
      </div>
    </section>
  )
}

function CargoManifest({ rows, actualLabel, eventManifest, onExport }: {
  rows: CargoRow[]
  actualLabel: string
  eventManifest: boolean
  onExport: () => void
}) {
  return (
    <section className="dispatch-panel dispatch-manifest">
      <header className="dispatch-section-heading">
        <div><h2>Cargo manifest</h2><p>{rows.length} {rows.length === 1 ? "item" : "items"} in this manifest</p></div>
        <Button type="button" icon={ArrowDownToLine} variant="outline" disabled={!rows.length} onClick={onExport}>Export PDF</Button>
      </header>
      {rows.length ? (
        <div className="dispatch-table-wrap" tabIndex={0} role="region" aria-label="Cargo manifest items">
          <table>
            <thead><tr><th scope="col">Asset</th><th scope="col">Type</th><th scope="col">Planned</th><th scope="col">{actualLabel}</th>{eventManifest && <th scope="col">Returned</th>}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row"><span>{row.name}</span><small>{row.code}{row.onHold && " · Review hold"}{row.note ? ` · ${row.note}` : ""}</small></th>
                  <td>{row.kind}</td><td>{row.expected}</td><td>{row.actual}</td>
                  {eventManifest && <td>{row.returned ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="dispatch-empty">No items have been added to this manifest yet.</p>}
    </section>
  )
}

function EventSummaryCard({ entry, onClick }: { entry: DispatchSelection; onClick: () => void }) {
  const { order, needsAttention, loadingPercent = 0 } = entry
  const batches = (order.dispatchBatches ?? []).filter((batch) => batch.stage !== "Cancelled")
  const outbound = batches.filter((batch) => batch.direction === "outbound").length
  return (
    <button type="button" className="dispatch-panel dispatch-summary" onClick={onClick}>
      <span className="dispatch-summary-header">
        <span>
          <strong>{order.eventTitle}</strong>
          <small>{order.venue || "Venue pending"} · {order.id}</small>
        </span>
        <span className="dispatch-summary-badges">
          {needsAttention && <Badge tone="danger"><AlertTriangle size={13} aria-hidden="true" /> Attention</Badge>}
          <Badge tone={order.warehouseClosed ? "success" : "neutral"}>{order.warehouseClosed ? "Completed" : "Active"}</Badge>
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </span>
      <span className="dispatch-summary-footer">
        <span className="dispatch-summary-counts">
          <strong><Truck size={14} aria-hidden="true" /> {batches.length} {batches.length === 1 ? "batch" : "batches"}</strong>
          <span>{outbound} outbound</span>
          <span>{batches.length - outbound} return</span>
        </span>
        <span className="dispatch-summary-progress">
          <progress className="dispatch-progress" aria-label="Cargo loaded" value={loadingPercent} max={100} />
          <strong>{loadingPercent}%</strong>
        </span>
      </span>
    </button>
  )
}

export function DispatchDirectory({ query, onQueryChange, filters, entries, onSelect }: DirectoryProps) {
  return (
    <section className="dispatch-workspace dispatch-directory" aria-label="Dispatch directory">
      <div className="dispatch-directory-filters">
        <label className="dispatch-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search events, vehicles, batch IDs…" aria-label="Search dispatch events, vehicles, or batch IDs" />
        </label>
        {filters.map((filter) => (
          <div key={filter.label} className="dispatch-select-wrap">
            <Dropdown aria-label={filter.label} value={filter.value} onChange={(event) => filter.onChange(event.target.value)} className="dispatch-select">
              {filter.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Dropdown>
            <ChevronDown size={15} aria-hidden="true" className="dispatch-select-chevron" />
          </div>
        ))}
      </div>
      {entries.length ? (
        <ul className="dispatch-directory-list">
          {entries.map((entry) => (
            <li key={entry.order.eventId + ":" + (entry.batch?.id ?? "")}>
              {entry.batch
                ? <RosterCard entry={entry} onClick={() => onSelect(entry)} />
                : <EventSummaryCard entry={entry} onClick={() => onSelect(entry)} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dispatch-panel dispatch-empty" role="status">
          No active events match your search or filters.
        </p>
      )}
    </section>
  )
}

type BatchStageFilter = "all" | "in-transit" | "delivered" | "returned"

const BATCH_STAGE_FILTERS: readonly { id: BatchStageFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in-transit", label: "In Transit" },
  { id: "delivered", label: "Delivered" },
  { id: "returned", label: "Returned" },
]

function matchesBatchStageFilter(batch: DispatchBatchRecord, filter: BatchStageFilter): boolean {
  if (filter === "all") return true
  if (filter === "in-transit") {
    return isBatchOutboundInTransit(batch) || isBatchReturnInTransit(batch) || batch.stage === "In Transit"
  }
  if (filter === "delivered") return batch.stage === "Delivered"
  return batch.stage === "Returned"
}

export default function DispatchWorkspace({
  order, batches, batch, onSelectBatch, manifest, onMarkLoaded, onMarkInTransit, onMarkDelivered, onStartReturn, onMarkReturnInTransit, onMarkReturned, onUpdateBatch, onRetryPersistBatch, onDeleteBatch, onExport,
}: Props) {
  const [batchQuery, setBatchQuery] = useState("")
  const [batchStageFilter, setBatchStageFilter] = useState<BatchStageFilter>("all")
  const stageTabRefs = useRef<Partial<Record<BatchStageFilter, HTMLButtonElement | null>>>({})
  const [editingBatch, setEditingBatch] = useState<DispatchBatchRecord | null>(null)
  const [editVehicle, setEditVehicle] = useState("")
  const [editPlate, setEditPlate] = useState("")
  const [editDriver, setEditDriver] = useState("")
  const [editHandoff, setEditHandoff] = useState("")
  const [editPendingSave, setEditPendingSave] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const openEditModal = (target: DispatchBatchRecord) => {
    const inReturn = isBatchReturnPhase(target) && target.direction === "outbound"
    setEditingBatch(target)
    setEditVehicle(inReturn ? (target.returnVehicleType ?? target.vehicleType) : target.vehicleType)
    setEditPlate(inReturn ? (target.returnPlateNumber ?? target.plateNumber) : target.plateNumber)
    setEditDriver(inReturn ? (target.returnDriverName ?? target.driverName) : target.driverName)
    setEditHandoff(inReturn ? (target.returnHandoffNotes ?? target.handoffNotes ?? "") : (target.handoffNotes ?? ""))
    setEditPendingSave(false)
    setEditError(null)
  }

  const closeEditModal = () => {
    setEditingBatch(null)
    setEditPendingSave(false)
    setEditError(null)
  }

  const submitBatchEdit = () => {
    if (!editingBatch) return
    const latestBatch = batches.find((item) => item.id === editingBatch.id) ?? editingBatch
    const inReturn = isBatchReturnPhase(latestBatch) && latestBatch.direction === "outbound"
    const currentVehicle = inReturn ? (latestBatch.returnVehicleType ?? latestBatch.vehicleType) : latestBatch.vehicleType
    const currentPlate = inReturn ? (latestBatch.returnPlateNumber ?? latestBatch.plateNumber) : latestBatch.plateNumber
    const currentDriver = inReturn ? (latestBatch.returnDriverName ?? latestBatch.driverName) : latestBatch.driverName
    const currentHandoff = inReturn ? (latestBatch.returnHandoffNotes ?? latestBatch.handoffNotes ?? "") : (latestBatch.handoffNotes ?? "")
    const isUnchangedInMemory =
      editPendingSave &&
      currentVehicle === editVehicle.trim() &&
      currentPlate === editPlate.trim() &&
      currentDriver === (editDriver.trim() || "Unassigned") &&
      currentHandoff === editHandoff.trim()
    const outcome = isUnchangedInMemory
      ? onRetryPersistBatch(latestBatch)
      : onUpdateBatch(latestBatch, {
        vehicleType: editVehicle,
        plateNumber: editPlate,
        driverName: editDriver,
        handoffNotes: editHandoff,
      })
    if (outcome.status === "saved") {
      closeEditModal()
      return
    }
    setEditPendingSave(outcome.status === "pending")
    setEditError(outcome.error)
  }
  const normalizedBatchQuery = batchQuery.trim().toLowerCase()
  const filteredBatches = batches.filter((item) => {
    if (!matchesBatchStageFilter(item, batchStageFilter)) return false
    if (!normalizedBatchQuery) return true
    const searchable = [
      item.id,
      item.vehicleType,
      item.plateNumber,
      item.driverName,
      item.returnVehicleType,
      item.returnPlateNumber,
      item.returnDriverName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
    return searchable.includes(normalizedBatchQuery)
  })
  const activeStageLabel = BATCH_STAGE_FILTERS.find((item) => item.id === batchStageFilter)?.label ?? "All"
  const handleStageTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = BATCH_STAGE_FILTERS.findIndex((item) => item.id === batchStageFilter)
    if (currentIndex < 0) return
    let nextIndex = currentIndex
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % BATCH_STAGE_FILTERS.length
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + BATCH_STAGE_FILTERS.length) % BATCH_STAGE_FILTERS.length
    else if (event.key === "Home") nextIndex = 0
    else if (event.key === "End") nextIndex = BATCH_STAGE_FILTERS.length - 1
    else return
    event.preventDefault()
    const nextFilter = BATCH_STAGE_FILTERS[nextIndex].id
    setBatchStageFilter(nextFilter)
    stageTabRefs.current[nextFilter]?.focus()
  }
  const entry = { order, batch }
  const checkpoints = getCheckpoints(entry)
  const hasRoute = isVenueLocation(order.venueLocation) || hasFernbrookSampleRoute(order.venue)
  const batchInReturn = batch ? isBatchReturnPhase(batch) : false
  const rows: CargoRow[] = batch
    ? batch.items.map((item) => {
      const expected = batchInReturn && batch.direction === "outbound"
        ? (item.returnPlannedQty ?? item.actualQty ?? item.plannedQty)
        : item.plannedQty
      const actual = batchInReturn && batch.direction === "outbound"
        ? (item.returnActualQty ?? 0)
        : item.actualQty
      const notes: string[] = []
      if (batchInReturn && !item.returnCounted && batch.direction === "outbound") notes.push("Uncounted")
      if (batchInReturn && (item.returnShortageQty ?? 0) > 0) notes.push(`${item.returnShortageQty} short`)
      if (batchInReturn && (item.returnDamagedQty ?? 0) > 0) notes.push(`${item.returnDamagedQty} damaged`)
      return {
        id: item.manifestLineId,
        name: item.name,
        code: item.itemCode,
        kind: item.kind,
        expected,
        actual,
        note: notes.length ? notes.join(" · ") : undefined,
      }
    })
    : manifest.map((item) => ({
      id: item.lineId, name: item.name, code: item.code, kind: item.sourceType === "stock" ? "Stock" : "Custom",
      expected: item.plannedQty, actual: item.loadedQty,
      returned: item.returnCounted && !item.legacyReturnUncertain ? item.returnedQty : null,
      onHold: item.blockedByLegacyReview,
    }))
  const actualLabel = batchInReturn ? "Returned" : "Loaded"
  const returnLines = batch ? [] : manifest.filter((line) => line.loadedQty > 0)
  const counted = returnLines.filter((line) => line.returnCounted && !line.legacyReturnUncertain).length

  return (
    <div className="dispatch-workspace dispatch-event-workspace">
      <aside className="dispatch-panel dispatch-roster" aria-label="This event’s dispatch batches">
        <label className="dispatch-search dispatch-roster-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={batchQuery}
            onChange={(event) => setBatchQuery(event.target.value)}
            placeholder="Search batches"
            aria-label="Search batches"
          />
        </label>
        <div
          className="dispatch-roster-filters"
          role="tablist"
          aria-label="Filter batches by stage"
          onKeyDown={handleStageTabKeyDown}
        >
          {BATCH_STAGE_FILTERS.map((item) => {
            const active = batchStageFilter === item.id
            return (
              <button
                key={item.id}
                ref={(el) => {
                  stageTabRefs.current[item.id] = el
                }}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className="dispatch-roster-filter"
                onClick={() => setBatchStageFilter(item.id)}
              >
                {item.label}
              </button>
            )
          })}
        </div>
        <ul className="dispatch-roster-list">
          {filteredBatches.map((item) => (
            <li key={item.id}>
              <RosterCard
                entry={{ order, batch: item }}
                selected={item.id === batch?.id}
                showChevron={false}
                onClick={() => onSelectBatch(item.id === batch?.id ? null : item.id)}
              />
            </li>
          ))}
          {filteredBatches.length === 0 && (
            <li className="dispatch-roster-empty" role="status">
              {batches.length === 0
                ? "No dispatch batches yet."
                : normalizedBatchQuery && batchStageFilter !== "all"
                  ? `No ${activeStageLabel.toLowerCase()} batches match “${batchQuery.trim()}”.`
                  : normalizedBatchQuery
                    ? `No batches match “${batchQuery.trim()}”.`
                    : `No ${activeStageLabel.toLowerCase()} batches.`}
            </li>
          )}
        </ul>
        <a className="dispatch-jump" href={hasRoute ? "#dispatch-route-map" : "#dispatch-cargo"}>View selection <ArrowRight size={14} aria-hidden="true" /></a>
      </aside>
      <div className="dispatch-detail">
        <div className="dispatch-visuals">
          <RouteMapCard direction={batchInReturn ? "return" : "outbound"} order={order} />
          <CargoBalance checkpoints={checkpoints} rows={rows} actualLabel={actualLabel} returnCounted={returnLines.length ? String(counted) + " / " + String(returnLines.length) : undefined} />
        </div>
        <OperationDetails entry={entry} onMarkLoaded={onMarkLoaded} onMarkInTransit={onMarkInTransit} onMarkDelivered={onMarkDelivered} onStartReturn={onStartReturn} onMarkReturnInTransit={onMarkReturnInTransit} onMarkReturned={onMarkReturned} onEditBatch={openEditModal} onDeleteBatch={onDeleteBatch} />
        <CargoManifest rows={rows} actualLabel={actualLabel} eventManifest={!batch} onExport={onExport} />
      </div>
      <Modal
        open={Boolean(editingBatch)}
        onClose={closeEditModal}
        title={editingBatch ? `Edit batch ${editingBatch.id}` : "Edit batch"}
        compact
      >
        {editingBatch && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              submitBatchEdit()
            }}
          >
            {editError && (
              <div
                role="alert"
                className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
              >
                {editPendingSave
                  ? `Changes are kept in memory, but saving to browser storage is pending: ${editError}`
                  : editError}
              </div>
            )}
            <Field label="Vehicle Type">
              <Input value={editVehicle} onChange={(e) => setEditVehicle(e.target.value)} required />
            </Field>
            <Field label="Plate Number">
              <Input value={editPlate} onChange={(e) => setEditPlate(e.target.value)} required />
            </Field>
            <Field label="Driver Name">
              <Input value={editDriver} onChange={(e) => setEditDriver(e.target.value)} placeholder="Unassigned" />
            </Field>
            <Field label="Field Lead Handoff Notes">
              <textarea
                className={textareaCls}
                rows={3}
                value={editHandoff}
                onChange={(e) => setEditHandoff(e.target.value)}
                placeholder="Document handoff remarks, packing order, or fragile handling notes…"
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeEditModal}>Cancel</Button>
              {editPendingSave && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={submitBatchEdit}
                >
                  Retry save
                </Button>
              )}
              <Button type="submit">{editPendingSave ? "Save & retry" : "Save changes"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
