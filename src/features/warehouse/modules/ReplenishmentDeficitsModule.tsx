import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Menu } from "@base-ui/react/menu"
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  Flag,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react"
import { fieldCls } from "../../../components/admin/AdminKit"
import Modal from "../../../components/overlay/Modal"
import { useOverlayContainer } from "../../../components/overlay/OverlayLayer"
import RowMenu from "../../../components/ui/RowMenu"
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  cx,
} from "../../../components/ui/ui"
import { fmtStamp } from "../../event-manager/shared"
import {
  notifyMutationResult,
  useNotify,
} from "../../ground-crew/ground-crew-shared"
import {
  createAcquisitionOrder,
  createReplenishmentRequest,
  GENERAL_STOCKROOM_EVENT_ID,
  GENERAL_STOCKROOM_EVENT_TITLE,
  getAcquisitionReconciliationGap,
  getVendorSelectOptions,
  receiveAcquisitionOrder,
  reconcileLegacyAcquisitionPosting,
  updateDeficitUrgency,
  useOperationsStore,
  type AcquisitionOrder,
  type DeficitQueueEntry,
  type OperationsNavigationContext,
  type OpsActor,
  type WarehouseInventoryItem,
} from "../../../operations/store"

type SubView = "deficits" | "consolidated" | "acquisitions"
type Urgency = "Standard" | "High" | "Critical"

type ConsolidatedLine = {
  assetId: string
  assetCode: string
  assetName: string
  category: string
  availableStock: number
  totalShortageQty: number
  totalRequiredQty: number
  pendingOrderedQty: number
  netToOrderQty: number
  highestUrgency: Urgency
  knownCostTotal: number | null
  sources: {
    deficitId: string
    eventId: string
    eventTitle: string
    isGeneralStockroom: boolean
    shortageQty: number
    status: DeficitQueueEntry["status"]
  }[]
  uncoveredDeficitIds: string[]
}

function urgencyRank(u: Urgency): number {
  if (u === "Critical") return 3
  if (u === "High") return 2
  return 1
}

function urgencyTone(u: Urgency): "danger" | "warning" | "neutral" {
  if (u === "Critical") return "danger"
  if (u === "High") return "warning"
  return "neutral"
}

function deficitStatusLabel(d: DeficitQueueEntry): string {
  if (d.status === "Fulfilled") return "Fulfilled"
  if (d.status === "In Acquisition") return "In Acquisition"
  return "Not Purchased"
}

function deficitStatusTone(
  d: DeficitQueueEntry,
): "success" | "info" | "danger" {
  if (d.status === "Fulfilled") return "success"
  if (d.status === "In Acquisition") return "info"
  return "danger"
}

function acqStatusTone(
  status: AcquisitionOrder["status"],
): "success" | "warning" | "info" | "neutral" {
  if (status === "Received & Stocked") return "success"
  if (status === "Partially Received") return "warning"
  if (status === "Ordered") return "info"
  return "neutral"
}

function formatPhp(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`
}

function csvEscape(val: string | number | undefined): string {
  const str = String(val ?? "")
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | undefined)[][]) {
  if (typeof window === "undefined") return
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ReplenishmentDeficitsModule({
  actor,
  initialEventId,
  initialSubView,
  onNavigate,
}: {
  actor: OpsActor
  initialEventId?: string
  initialSubView?: SubView
  onNavigate?: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const notify = useNotify()
  const menuPortalContainer = useOverlayContainer()

  const [view, setView] = useState<SubView>(initialSubView ?? "deficits")
  const [query, setQuery] = useState("")
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null)
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({})

  // Add Replenishment Item modal
  const [addOpen, setAddOpen] = useState(false)
  const [addEventId, setAddEventId] = useState(GENERAL_STOCKROOM_EVENT_ID)
  const [addAssetId, setAddAssetId] = useState(
    state.inventory[0]?.assetId ?? "",
  )
  const [addQty, setAddQty] = useState("1")
  const [addUnitCost, setAddUnitCost] = useState("")
  const [addUrgency, setAddUrgency] = useState<Urgency>("Standard")
  const [addTrigger, setAddTrigger] = useState<"Manual Request" | "Auto-Threshold">("Manual Request")
  const [addNotes, setAddNotes] = useState("")
  const [addError, setAddError] = useState("")

  // Prepare Order modal
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [orderAssetId, setOrderAssetId] = useState("")
  const [orderDeficitIds, setOrderDeficitIds] = useState<string[]>([])
  const [orderEventId, setOrderEventId] = useState<string | undefined>(undefined)
  const [orderQty, setOrderQty] = useState("1")
  const [orderVendorId, setOrderVendorId] = useState("")
  const [orderUnitCost, setOrderUnitCost] = useState("")
  const [orderError, setOrderError] = useState("")
  const [orderOperationId, setOrderOperationId] = useState("")

  // Record Receipt modal
  const [receiptTarget, setReceiptTarget] = useState<AcquisitionOrder | null>(null)
  const [receiptQty, setReceiptQty] = useState("1")
  const [receiptNotes, setReceiptNotes] = useState("")
  const [receiptError, setReceiptError] = useState("")
  const [receiptId, setReceiptId] = useState("")

  // Reconcile Legacy Receipt modal
  const [reconcileTarget, setReconcileTarget] = useState<AcquisitionOrder | null>(null)
  const [reconcileDecision, setReconcileDecision] = useState<"already-posted" | "post-missing-stock">("already-posted")
  const [reconcileQty, setReconcileQty] = useState("1")
  const [reconcileReason, setReconcileReason] = useState("")
  const [reconcileError, setReconcileError] = useState("")

  useEffect(() => {
    if (initialSubView) {
      setView(initialSubView)
    }
  }, [initialSubView])

  const invById = useMemo(() => {
    const map = new Map<string, WarehouseInventoryItem>()
    for (const item of state.inventory) {
      map.set(item.assetId, item)
    }
    return map
  }, [state.inventory])

  const activeVendorOptions = useMemo(
    () => getVendorSelectOptions(state.vendors ?? []),
    [state.vendors],
  )

  const q = query.trim().toLowerCase()

  const filteredDeficits = useMemo(() => {
    if (!q) return state.deficitQueue
    return state.deficitQueue.filter((d) =>
      `${d.assetName} ${d.assetCode} ${d.category} ${d.eventTitle} ${d.id}`
        .toLowerCase()
        .includes(q),
    )
  }, [state.deficitQueue, q])

  const eventGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        eventId: string
        eventTitle: string
        items: DeficitQueueEntry[]
        criticalCount: number
        highCount: number
        activeCost: number
        hasAnyCost: boolean
      }
    >()

    for (const d of filteredDeficits) {
      if (d.isGeneralStockroom || d.eventId === GENERAL_STOCKROOM_EVENT_ID) {
        continue
      }
      const existing = groups.get(d.eventId) ?? {
        eventId: d.eventId,
        eventTitle: d.eventTitle,
        items: [],
        criticalCount: 0,
        highCount: 0,
        activeCost: 0,
        hasAnyCost: false,
      }
      existing.items.push(d)
      if (d.status !== "Fulfilled") {
        if (d.urgency === "Critical") existing.criticalCount += 1
        if (d.urgency === "High") existing.highCount += 1
        if (d.unitCost !== undefined && d.unitCost > 0) {
          existing.activeCost += d.shortageQty * d.unitCost
          existing.hasAnyCost = true
        }
      }
      groups.set(d.eventId, existing)
    }

    return Array.from(groups.values())
  }, [filteredDeficits])

  const generalStockroomItems = useMemo(
    () =>
      filteredDeficits.filter(
        (d) => d.isGeneralStockroom || d.eventId === GENERAL_STOCKROOM_EVENT_ID,
      ),
    [filteredDeficits],
  )

  // Pending ordered quantities per assetId (not yet received)
  const pendingOrderQtyByAsset = useMemo(() => {
    const map = new Map<string, number>()
    for (const acq of state.acquisitions) {
      if (acq.status === "Received & Stocked") continue
      const alreadyRec = acq.receivedQty ?? 0
      const rem = Math.max(0, acq.quantity - alreadyRec)
      if (rem > 0) {
        map.set(acq.assetId, (map.get(acq.assetId) ?? 0) + rem)
      }
    }
    return map
  }, [state.acquisitions])

  // Consolidated demand by assetId across open / in-acquisition deficits
  const consolidatedLines = useMemo<ConsolidatedLine[]>(() => {
    const map = new Map<string, ConsolidatedLine>()
    for (const d of state.deficitQueue) {
      if (d.status === "Fulfilled") continue
      if (
        q &&
        !`${d.assetName} ${d.assetCode} ${d.category} ${d.eventTitle}`
          .toLowerCase()
          .includes(q)
      ) {
        continue
      }
      const inv = invById.get(d.assetId)
      const existing = map.get(d.assetId) ?? {
        assetId: d.assetId,
        assetCode: d.assetCode,
        assetName: d.assetName,
        category: d.category,
        availableStock: inv?.availableStock ?? 0,
        totalShortageQty: 0,
        totalRequiredQty: 0,
        pendingOrderedQty: pendingOrderQtyByAsset.get(d.assetId) ?? 0,
        netToOrderQty: 0,
        highestUrgency: d.urgency,
        knownCostTotal: null,
        sources: [],
        uncoveredDeficitIds: [],
      }

      existing.totalShortageQty += d.shortageQty
      existing.totalRequiredQty += d.requiredQty ?? d.shortageQty
      if (urgencyRank(d.urgency) > urgencyRank(existing.highestUrgency)) {
        existing.highestUrgency = d.urgency
      }
      if (d.unitCost !== undefined && d.unitCost > 0) {
        existing.knownCostTotal =
          (existing.knownCostTotal ?? 0) + d.shortageQty * d.unitCost
      }
      existing.sources.push({
        deficitId: d.id,
        eventId: d.eventId,
        eventTitle: d.eventTitle,
        isGeneralStockroom: Boolean(
          d.isGeneralStockroom || d.eventId === GENERAL_STOCKROOM_EVENT_ID,
        ),
        shortageQty: d.shortageQty,
        status: d.status,
      })

      const hasPendingAcq = state.acquisitions.some(
        (a) =>
          a.status !== "Received & Stocked" &&
          (a.deficitId === d.id || a.deficitIds?.includes(d.id)),
      )
      if (!hasPendingAcq) {
        existing.uncoveredDeficitIds.push(d.id)
      }

      map.set(d.assetId, existing)
    }

    return Array.from(map.values()).map((line) => ({
      ...line,
      netToOrderQty: Math.max(0, line.totalShortageQty - line.pendingOrderedQty),
    }))
  }, [state.deficitQueue, state.acquisitions, invById, pendingOrderQtyByAsset, q])

  // Summary card metrics (actual store data)
  const summaryMetrics = useMemo(() => {
    const active = state.deficitQueue.filter((d) => d.status !== "Fulfilled")
    const critical = active.filter((d) => d.urgency === "Critical").length
    const high = active.filter((d) => d.urgency === "High").length
    const orderCandidates = consolidatedLines.filter(
      (c) => c.netToOrderQty > 0 && c.uncoveredDeficitIds.length > 0,
    ).length
    return {
      openDeficits: active.length,
      critical,
      high,
      orderCandidates,
    }
  }, [state.deficitQueue, consolidatedLines])

  const filteredAcquisitions = useMemo(() => {
    if (!q) return state.acquisitions
    return state.acquisitions.filter((a) =>
      `${a.id} ${a.assetName} ${a.assetCode} ${a.supplierName} ${a.eventTitle ?? ""}`
        .toLowerCase()
        .includes(q),
    )
  }, [state.acquisitions, q])

  function openAddModal(presetEventId?: string) {
    setAddEventId(presetEventId ?? GENERAL_STOCKROOM_EVENT_ID)
    setAddAssetId(state.inventory[0]?.assetId ?? "")
    setAddQty("1")
    setAddUnitCost("")
    setAddUrgency("Standard")
    setAddTrigger("Manual Request")
    setAddNotes("")
    setAddError("")
    setAddOpen(true)
  }

  function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    setAddError("")
    const res = createReplenishmentRequest(actor, {
      eventId: addEventId,
      assetId: addAssetId,
      quantity: Number(addQty),
      unitCost: addUnitCost.trim() ? Number(addUnitCost) : undefined,
      urgency: addUrgency,
      triggerSource: addTrigger,
      notes: addNotes,
    })
    if (!res.ok) {
      setAddError(res.error)
      notifyMutationResult(notify, res)
      return
    }
    notifyMutationResult(
      notify,
      res,
      `Added replenishment request for ${res.deficit.assetName} (${res.deficit.eventTitle}).`,
    )
    if (res.deficit.eventId !== GENERAL_STOCKROOM_EVENT_ID) {
      setExpandedEvents((prev) => ({ ...prev, [res.deficit.eventId]: true }))
    }
    setAddOpen(false)
  }

  function openPrepareOrderModal(opts?: {
    assetId?: string
    deficitIds?: string[]
    eventId?: string
    qty?: number
    unitCost?: number
  }) {
    const firstCandidate = consolidatedLines.find(
      (c) => c.netToOrderQty > 0 && c.uncoveredDeficitIds.length > 0,
    )
    const targetAssetId =
      opts?.assetId ??
      firstCandidate?.assetId ??
      state.inventory[0]?.assetId ??
      ""
    const matchingLine = consolidatedLines.find(
      (c) => c.assetId === targetAssetId,
    )
    setOrderAssetId(targetAssetId)
    setOrderDeficitIds(
      opts?.deficitIds ?? matchingLine?.uncoveredDeficitIds ?? [],
    )
    setOrderEventId(opts?.eventId)
    setOrderQty(
      String(opts?.qty ?? matchingLine?.netToOrderQty ?? 1),
    )
    setOrderVendorId(activeVendorOptions[0]?.value ?? "")
    setOrderUnitCost(opts?.unitCost !== undefined ? String(opts.unitCost) : "")
    setOrderError("")
    setOrderOperationId(
      `acq-op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )
    setOrderModalOpen(true)
  }

  function handlePlaceOrder(receiveImmediately: boolean) {
    setOrderError("")
    if (!orderVendorId) {
      setOrderError("Select an active vendor before placing an order.")
      return
    }
    const res = createAcquisitionOrder({
      operationId: orderOperationId || undefined,
      assetId: orderAssetId,
      deficitIds: orderDeficitIds,
      eventId: orderEventId,
      vendorId: orderVendorId,
      supplierName: "",
      quantity: Number(orderQty),
      unitCost: orderUnitCost.trim() ? Number(orderUnitCost) : 0,
      actorName: actor.name,
      receiveImmediately,
    })
    if (!res.ok) {
      setOrderError(res.error)
      notifyMutationResult(notify, res)
      return
    }
    notifyMutationResult(
      notify,
      res,
      receiveImmediately
        ? `Order ${res.order.id} received into inventory (+${res.order.quantity}).`
        : `Order ${res.order.id} placed with ${res.order.supplierName}. Inventory updates upon confirmed receipt.`,
    )
    setOrderOperationId("")
    setOrderModalOpen(false)
  }

  function openReceiptModal(acq: AcquisitionOrder) {
    const rem = Math.max(1, acq.quantity - (acq.receivedQty ?? 0))
    setReceiptTarget(acq)
    setReceiptQty(String(rem))
    setReceiptNotes("")
    setReceiptError("")
    setReceiptId(`rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  }

  function handleConfirmReceipt(e: FormEvent) {
    e.preventDefault()
    if (!receiptTarget) return
    setReceiptError("")
    const res = receiveAcquisitionOrder(receiptTarget.id, {
      receiveQty: Number(receiptQty),
      receiptId: receiptId || undefined,
      actorName: actor.name,
      notes: receiptNotes,
    })
    if (!res.ok) {
      setReceiptError(res.error)
      notifyMutationResult(notify, res)
      return
    }
    notifyMutationResult(
      notify,
      res,
      res.alreadyReceived
        ? `Order ${receiptTarget.id} was already fully received.`
        : `Confirmed receipt of +${res.addedQty} × ${receiptTarget.assetName} (${res.status}).`,
    )
    setReceiptId("")
    setReceiptTarget(null)
  }

  function openReconcileModal(acq: AcquisitionOrder) {
    const gap = getAcquisitionReconciliationGap(state, acq)
    setReconcileTarget(acq)
    setReconcileDecision("already-posted")
    setReconcileQty(String(Math.max(1, gap.unverifiedQty)))
    setReconcileReason("")
    setReconcileError("")
  }

  function handleConfirmReconcile(e: FormEvent) {
    e.preventDefault()
    if (!reconcileTarget) return
    setReconcileError("")
    const res = reconcileLegacyAcquisitionPosting(reconcileTarget.id, actor, {
      decision: reconcileDecision,
      qty: Number(reconcileQty),
      reason: reconcileReason,
    })
    if (!res.ok) {
      setReconcileError(res.error)
      notifyMutationResult(notify, res)
      return
    }
    notifyMutationResult(
      notify,
      res,
      reconcileDecision === "already-posted"
        ? `Verified ${res.postedQty} × ${reconcileTarget.assetName} as already stocked.`
        : `Posted ${res.postedQty} missing units of ${reconcileTarget.assetName} to inventory.`,
    )
    setReconcileTarget(null)
  }

  function buildCurrentExportTable(): {
    title: string
    filenameBase: string
    headers: string[]
    rows: (string | number | undefined)[][]
  } {
    if (view === "consolidated") {
      return {
        title: "Consolidated Replenishment Register",
        filenameBase: "consolidated-replenishment-register",
        headers: [
          "Item Code",
          "Item Name",
          "Category",
          "Sources",
          "Available Stock",
          "Total Shortage",
          "Pending On Order",
          "Net To Order",
          "Est. Cost",
          "Priority",
        ],
        rows: consolidatedLines.map((line) => [
          line.assetCode,
          line.assetName,
          line.category,
          line.sources.map((s) => `${s.eventTitle} (${s.shortageQty})`).join("; "),
          line.availableStock,
          line.totalShortageQty,
          line.pendingOrderedQty,
          line.netToOrderQty,
          line.knownCostTotal !== null ? formatPhp(line.knownCostTotal) : "Unavailable",
          line.highestUrgency,
        ]),
      }
    }
    if (view === "acquisitions") {
      return {
        title: "Warehouse Acquisitions & Receipts",
        filenameBase: "replenishment-acquisitions-report",
        headers: [
          "Order ID",
          "Event / Scope",
          "Item Code",
          "Item Name",
          "Vendor",
          "Received",
          "Ordered",
          "Total Cost",
          "Status",
        ],
        rows: filteredAcquisitions.map((acq) => {
          const rec =
            acq.receivedQty ??
            (acq.status === "Received & Stocked" ? acq.quantity : 0)
          return [
            acq.id,
            acq.eventTitle ?? "General / Direct",
            acq.assetCode,
            acq.assetName,
            acq.supplierName,
            rec,
            acq.quantity,
            acq.unitCost > 0 ? formatPhp(acq.unitCost * acq.quantity) : "Unavailable",
            acq.status,
          ]
        }),
      }
    }
    return {
      title: "Event-Bound & Stockroom Deficits",
      filenameBase: "replenishment-deficits-report",
      headers: [
        "Deficit ID",
        "Event",
        "Item Code",
        "Item Name",
        "Category",
        "Trigger Source",
        "Available Stock",
        "Required Qty",
        "Shortage Qty",
        "Est. Cost",
        "Priority",
        "Status",
      ],
      rows: filteredDeficits.map((d) => {
        const inv = invById.get(d.assetId)
        const avail = inv?.availableStock ?? 0
        const req = d.requiredQty ?? d.shortageQty + avail
        const cost =
          d.unitCost !== undefined && d.unitCost > 0
            ? formatPhp(d.shortageQty * d.unitCost)
            : "Unavailable"
        return [
          d.id,
          d.eventTitle,
          d.assetCode,
          d.assetName,
          d.category,
          d.triggerSource ?? "Event Allocation",
          avail,
          req,
          d.shortageQty,
          cost,
          d.urgency,
          deficitStatusLabel(d),
        ]
      }),
    }
  }

  function exportCurrentScopeCsv() {
    setExporting("csv")
    try {
      const table = buildCurrentExportTable()
      downloadCsv(`${table.filenameBase}.csv`, table.headers, table.rows)
    } finally {
      setExporting(null)
      setExportOpen(false)
    }
  }

  async function exportCurrentScopePdf() {
    if (typeof document === "undefined") return
    setExporting("pdf")
    try {
      const { buildPdfFromJpegPages } = await import(
        "../../event-manager/mood-board/board-export"
      )
      const table = buildCurrentExportTable()
      const pageWidth = 1240
      const pageHeight = 1754
      const margin = 56
      const rowsPerPage = 24
      const totalPages = Math.max(1, Math.ceil(table.rows.length / rowsPerPage))
      const pages = []

      for (let p = 0; p < totalPages; p += 1) {
        const canvas = document.createElement("canvas")
        canvas.width = pageWidth
        canvas.height = pageHeight
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Canvas 2D context unavailable for PDF export.")

        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, pageWidth, pageHeight)

        // Header
        ctx.fillStyle = "#18181b"
        ctx.font = "bold 28px sans-serif"
        ctx.fillText(`Lumière Warehouse — ${table.title}`, margin, margin + 28)

        ctx.fillStyle = "#52525b"
        ctx.font = "14px sans-serif"
        const filterLabel = query.trim()
          ? `Filter: "${query.trim()}"`
          : "Filter: All records"
        ctx.fillText(
          `Generated: ${new Date().toLocaleString()}   |   ${filterLabel}   |   Page ${p + 1} of ${totalPages}`,
          margin,
          margin + 56,
        )

        // Summary strip on page 1
        let y = margin + 92
        if (p === 0) {
          ctx.fillStyle = "#f4f4f5"
          ctx.fillRect(margin, y, pageWidth - margin * 2, 48)
          ctx.fillStyle = "#18181b"
          ctx.font = "bold 15px sans-serif"
          ctx.fillText(
            `Open Deficits: ${summaryMetrics.openDeficits}    Critical: ${summaryMetrics.critical}    High Priority: ${summaryMetrics.high}    Order Candidates: ${summaryMetrics.orderCandidates}`,
            margin + 18,
            y + 30,
          )
          y += 72
        }

        // Table headers (compact subset for clean horizontal fit)
        const colCount = Math.min(table.headers.length, 8)
        const usableW = pageWidth - margin * 2
        const colW = usableW / colCount
        ctx.fillStyle = "#27272a"
        ctx.fillRect(margin, y, usableW, 38)
        ctx.fillStyle = "#ffffff"
        ctx.font = "bold 12px sans-serif"
        for (let c = 0; c < colCount; c += 1) {
          ctx.fillText(
            String(table.headers[c]).slice(0, 18),
            margin + c * colW + 8,
            y + 24,
          )
        }
        y += 38

        const slice = table.rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage)
        slice.forEach((row, idx) => {
          if (idx % 2 === 1) {
            ctx.fillStyle = "#fafafa"
            ctx.fillRect(margin, y, usableW, 52)
          }
          ctx.strokeStyle = "#e4e4e7"
          ctx.beginPath()
          ctx.moveTo(margin, y + 52)
          ctx.lineTo(pageWidth - margin, y + 52)
          ctx.stroke()

          ctx.fillStyle = "#18181b"
          ctx.font = "12px sans-serif"
          for (let c = 0; c < colCount; c += 1) {
            const raw = String(row[c] ?? "—")
            const clipped = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw
            ctx.fillText(clipped, margin + c * colW + 8, y + 31)
          }
          y += 52
        })

        const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1)
        const bin = atob(base64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i += 1) {
          bytes[i] = bin.charCodeAt(i)
        }
        pages.push({
          jpegBytes: bytes,
          pixelWidth: pageWidth,
          pixelHeight: pageHeight,
          pageWidthPt: 595.28,
          pageHeightPt: 841.89,
        })
      }

      const pdfBytes = buildPdfFromJpegPages(pages)
      const blob = new Blob([pdfBytes as unknown as BlobPart], {
        type: "application/pdf",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${table.filenameBase}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate PDF export.")
    } finally {
      setExporting(null)
      setExportOpen(false)
    }
  }

  function exportDeficitsCsv(filename: string, items: DeficitQueueEntry[]) {
    downloadCsv(
      filename,
      [
        "Deficit ID",
        "Event",
        "Item Code",
        "Item Name",
        "Category",
        "Trigger Source",
        "Available Stock",
        "Required Qty",
        "Shortage Qty",
        "Est. Cost",
        "Priority",
        "Status",
      ],
      items.map((d) => {
        const inv = invById.get(d.assetId)
        const avail = inv?.availableStock ?? 0
        const req = d.requiredQty ?? d.shortageQty + avail
        const cost =
          d.unitCost !== undefined && d.unitCost > 0
            ? d.shortageQty * d.unitCost
            : "Unavailable"
        return [
          d.id,
          d.eventTitle,
          d.assetCode,
          d.assetName,
          d.category,
          d.triggerSource ?? "Event Allocation",
          avail,
          req,
          d.shortageQty,
          cost,
          d.urgency,
          deficitStatusLabel(d),
        ]
      }),
    )
  }

  function renderDeficitRow(d: DeficitQueueEntry) {
    const inv = invById.get(d.assetId)
    const avail = inv?.availableStock ?? 0
    const req = d.requiredQty ?? avail + d.shortageQty
    const ratio = req > 0 ? Math.min(100, Math.round((avail / req) * 100)) : 0
    const hasCost = d.unitCost !== undefined && d.unitCost > 0
    const rowCost = hasCost ? d.shortageQty * (d.unitCost ?? 0) : null

    return (
      <tr key={d.id} className="hover:bg-fg/[0.02]">
        <td className="px-4 py-3 align-top">
          <div className="font-semibold text-foreground">{d.assetName}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {d.category} · {d.assetCode}
          </div>
        </td>
        <td className="px-4 py-3 align-top">
          <Badge tone="neutral">{d.triggerSource ?? "Event Allocation"}</Badge>
        </td>
        <td className="px-4 py-3 align-top min-w-[190px]">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-fg/[0.1]">
              <div
                className={cx(
                  "h-full rounded-full",
                  avail === 0 ? "bg-red-500" : "bg-accent",
                )}
                style={{ width: `${ratio}%` }}
              />
            </div>
            <span className="font-mono text-xs text-foreground">
              {avail}/{req}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Avail: {avail} · Req: {req} ·{" "}
            <span className="font-semibold text-red-500">
              Shortage: {d.shortageQty}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 align-top font-mono text-xs text-foreground">
          {rowCost !== null ? formatPhp(rowCost) : (
            <span className="text-muted-foreground">Cost unavailable</span>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <Badge tone={urgencyTone(d.urgency)}>{d.urgency}</Badge>
        </td>
        <td className="px-4 py-3 align-top">
          <Badge tone={deficitStatusTone(d)}>{deficitStatusLabel(d)}</Badge>
        </td>
        <td className="px-4 py-3 align-top text-right">
          <div className="inline-flex justify-end">
            <RowMenu
              label={`Actions for ${d.assetName}`}
              menuClassName="w-52 text-left"
              items={[
                ...(d.status === "Open"
                  ? [{
                    label: `Prepare Order (${d.shortageQty})`,
                    icon: ShoppingCart,
                    onClick: () => openPrepareOrderModal({
                      assetId: d.assetId,
                      deficitIds: [d.id],
                      eventId: d.eventId,
                      qty: d.shortageQty,
                      unitCost: d.unitCost,
                    }),
                  }]
                  : []),
                ...(["Critical", "High", "Standard"] as Urgency[]).map((u) => ({
                  label: `Mark Priority: ${u}`,
                  icon: Flag,
                  onClick: () => {
                    const res = updateDeficitUrgency(actor, d.id, u)
                    notifyMutationResult(notify, res, `Updated priority to ${u}.`)
                  },
                })),
                ...(onNavigate && !d.isGeneralStockroom && d.eventId !== GENERAL_STOCKROOM_EVENT_ID
                  ? [{
                    label: "Open Source Event",
                    icon: ArrowUpRight,
                    onClick: () => onNavigate("module-events", {
                      eventId: d.eventId,
                      subView: "orders",
                    }),
                  }]
                  : []),
              ]}
            />
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={["Dashboard", "Replenishment & Deficits"]}
        title="Replenishment / Deficits"
        subtitle="Automated deficit detection, inventory replenishment alerts, and order preparation."
      />

      {/* Top Controls */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-card p-1">
          {(
            [
              {
                key: "deficits" as SubView,
                label: `Event-Bound Deficits (${eventGroups.length} Events)`,
              },
              {
                key: "consolidated" as SubView,
                label: `Consolidated Register (${consolidatedLines.length} Lines)`,
              },
              {
                key: "acquisitions" as SubView,
                label: `Acquisitions (${state.acquisitions.length})`,
              },
            ]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              className={cx(
                "rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                view === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items or events..."
              aria-label="Search deficits and items"
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            icon={Plus}
            onClick={() => openAddModal(GENERAL_STOCKROOM_EVENT_ID)}
          >
            Add Item
          </Button>
          <Menu.Root
            modal={false}
            open={exportOpen}
            onOpenChange={(next) => {
              const hasData =
                view === "deficits"
                  ? filteredDeficits.length > 0
                  : view === "consolidated"
                    ? consolidatedLines.length > 0
                    : filteredAcquisitions.length > 0
              if (!exporting && hasData) setExportOpen(next)
              else if (!next) setExportOpen(false)
            }}
          >
            <Menu.Trigger
              type="button"
              aria-label="Export"
              aria-busy={!!exporting}
              disabled={
                !!exporting ||
                (view === "deficits"
                  ? filteredDeficits.length === 0
                  : view === "consolidated"
                    ? consolidatedLines.length === 0
                    : filteredAcquisitions.length === 0)
              }
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-line bg-card px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-fg/[0.04] disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden />
              ) : (
                <Download size={15} className="shrink-0" aria-hidden />
              )}
              <span>{exporting ? "Exporting…" : "Export"}</span>
            </Menu.Trigger>
            <Menu.Portal container={menuPortalContainer}>
              <Menu.Positioner
                sideOffset={8}
                align="end"
                collisionPadding={8}
                className="pointer-events-auto z-[100] max-w-[calc(100vw-16px)]"
              >
                <Menu.Popup className="w-52 overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl outline-none animate-pop">
                  <Menu.Item
                    onClick={exportCurrentScopeCsv}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-elev data-highlighted:bg-elev focus-visible:bg-elev"
                  >
                    <FileSpreadsheet size={18} className="shrink-0 text-blue-400" aria-hidden />
                    <span>
                      <span className="block text-[14px] font-semibold">Export as CSV</span>
                      <span className="block text-[12px] text-muted-foreground">Download CSV</span>
                    </span>
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => void exportCurrentScopePdf()}
                    className="flex w-full cursor-pointer items-center gap-3 border-t border-border px-4 py-2.5 text-left outline-none transition-colors hover:bg-elev data-highlighted:bg-elev focus-visible:bg-elev"
                  >
                    <FileText size={18} className="shrink-0 text-emerald-400" aria-hidden />
                    <span>
                      <span className="block text-[14px] font-semibold">Export as PDF</span>
                      <span className="block text-[12px] text-muted-foreground">Download PDF</span>
                    </span>
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <Button
            type="button"
            icon={ShoppingCart}
            disabled={activeVendorOptions.length === 0}
            onClick={() => openPrepareOrderModal()}
          >
            Prepare Order ({summaryMetrics.orderCandidates})
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="dashboard-surfaces grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="dashboard-welcome relative overflow-hidden p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Open Deficits
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
            {summaryMetrics.openDeficits}
          </div>
        </Card>
        <Card className="dashboard-welcome relative overflow-hidden p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-red-500">
            Critical
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
            {summaryMetrics.critical}
          </div>
        </Card>
        <Card className="dashboard-welcome relative overflow-hidden p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
            High Priority
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
            {summaryMetrics.high}
          </div>
        </Card>
        <Card className="dashboard-welcome relative overflow-hidden p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Order Candidates
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
            {summaryMetrics.orderCandidates}
          </div>
        </Card>
      </div>

      {/* VIEW 1: Event-Bound Deficits + General Stockroom */}
      {view === "deficits" && (
        <div className="dashboard-surfaces space-y-4">
          {eventGroups.length === 0 && generalStockroomItems.length === 0 ? (
            <Card className="p-8 text-center space-y-2">
              <CheckCircle2
                className="mx-auto size-8 text-emerald-500"
                aria-hidden="true"
              />
              <div className="text-sm font-semibold text-foreground">
                No event deficits or stockroom requests found
              </div>
              <p className="text-xs text-muted-foreground">
                Shortages from approved event allocations and manual replenishment requests appear here automatically.
              </p>
            </Card>
          ) : (
            <>
              {eventGroups.map((group) => {
                const isOpen = Boolean(expandedEvents[group.eventId])
                return (
                  <Card key={group.eventId} className="dashboard-welcome relative overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedEvents((prev) => ({
                          ...prev,
                          [group.eventId]: !isOpen,
                        }))
                      }
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-fg/[0.02]"
                    >
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-foreground truncate">
                          {group.eventTitle}
                        </div>
                        <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                          {group.items.length} deficit item{group.items.length === 1 ? "" : "s"} ·{" "}
                          {group.criticalCount} critical · {group.highCount} high
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <div className="text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Active Deficit
                          </div>
                          <div className="text-sm font-bold tabular-nums text-foreground">
                            {group.hasAnyCost
                              ? formatPhp(group.activeCost)
                              : "Cost unavailable"}
                          </div>
                        </div>
                        <span className="rounded-md border border-line p-1.5 text-muted-foreground">
                          {isOpen ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-line">
                        <div className="flex flex-wrap items-center justify-end gap-2 bg-fg/[0.015] px-4 py-2.5">
                          <Button
                            type="button"
                            variant="outline"
                            icon={Plus}
                            onClick={() => openAddModal(group.eventId)}
                          >
                            Add Item
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            icon={Download}
                            onClick={() =>
                              exportDeficitsCsv(
                                `deficits-${group.eventId}.csv`,
                                group.items,
                              )
                            }
                          >
                            Export
                          </Button>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full border-collapse text-left text-xs">
                            <thead>
                              <tr className="border-y border-line bg-fg/[0.02] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <th className="px-4 py-2.5">Item</th>
                                <th className="px-4 py-2.5">Trigger Source</th>
                                <th className="px-4 py-2.5">Stock</th>
                                <th className="px-4 py-2.5">Cost</th>
                                <th className="px-4 py-2.5">Priority</th>
                                <th className="px-4 py-2.5">Status</th>
                                <th className="px-4 py-2.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {group.items.map(renderDeficitRow)}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="divide-y divide-line md:hidden">
                          {group.items.map((d) => {
                            const inv = invById.get(d.assetId)
                            const avail = inv?.availableStock ?? 0
                            const req = d.requiredQty ?? avail + d.shortageQty
                            return (
                              <div key={d.id} className="p-4 space-y-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-semibold text-foreground">
                                      {d.assetName}
                                    </div>
                                    <div className="text-muted-foreground">
                                      {d.category} · {d.triggerSource ?? "Event Allocation"}
                                    </div>
                                  </div>
                                  <Badge tone={deficitStatusTone(d)}>
                                    {deficitStatusLabel(d)}
                                  </Badge>
                                </div>
                                <div className="text-muted-foreground">
                                  Available: {avail} · Required: {req} ·{" "}
                                  <span className="font-semibold text-red-500">
                                    Shortage: {d.shortageQty}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                  <Badge tone={urgencyTone(d.urgency)}>
                                    {d.urgency}
                                  </Badge>
                                  {d.status === "Open" && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        openPrepareOrderModal({
                                          assetId: d.assetId,
                                          deficitIds: [d.id],
                                          eventId: d.eventId,
                                          qty: d.shortageQty,
                                          unitCost: d.unitCost,
                                        })
                                      }
                                    >
                                      Prepare Order
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}

              {/* General Stockroom Section (Collapsible Accordion) */}
              {(() => {
                const isGeneralOpen = Boolean(expandedEvents[GENERAL_STOCKROOM_EVENT_ID])
                let generalActiveCost = 0
                let generalHasAnyCost = false
                for (const d of generalStockroomItems) {
                  if (d.status !== "Fulfilled" && d.unitCost !== undefined && d.unitCost > 0) {
                    generalActiveCost += d.shortageQty * d.unitCost
                    generalHasAnyCost = true
                  }
                }
                return (
                  <Card className="dashboard-welcome relative overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedEvents((prev) => ({
                          ...prev,
                          [GENERAL_STOCKROOM_EVENT_ID]: !isGeneralOpen,
                        }))
                      }
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-fg/[0.02]"
                    >
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-foreground truncate">
                          General Stockroom
                        </div>
                        <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                          Not tied to a specific event — visible here and in Consolidated Register
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <div className="text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Active Deficit
                          </div>
                          <div className="text-sm font-bold tabular-nums text-foreground">
                            {generalHasAnyCost
                              ? formatPhp(generalActiveCost)
                              : "Cost unavailable"}
                          </div>
                        </div>
                        <span className="rounded-md border border-line p-1.5 text-muted-foreground">
                          {isGeneralOpen ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </span>
                      </div>
                    </button>

                    {isGeneralOpen && (
                      <div className="border-t border-line">
                        <div className="flex flex-wrap items-center justify-end gap-2 bg-fg/[0.015] px-4 py-2.5">
                          <Button
                            type="button"
                            variant="outline"
                            icon={Plus}
                            onClick={() => openAddModal(GENERAL_STOCKROOM_EVENT_ID)}
                          >
                            Add Item
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            icon={Download}
                            disabled={generalStockroomItems.length === 0}
                            onClick={() =>
                              exportDeficitsCsv(
                                "general-stockroom-replenishment.csv",
                                generalStockroomItems,
                              )
                            }
                          >
                            Export
                          </Button>
                        </div>

                        {generalStockroomItems.length === 0 ? (
                          <div className="p-6 text-center text-xs text-muted-foreground">
                            No general stockroom replenishment requests yet. Use Add Item to log stockroom requests unrelated to a specific event.
                          </div>
                        ) : (
                          <>
                            <div className="hidden overflow-x-auto md:block">
                              <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                  <tr className="border-y border-line bg-fg/[0.02] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    <th className="px-4 py-2.5">Item</th>
                                    <th className="px-4 py-2.5">Trigger Source</th>
                                    <th className="px-4 py-2.5">Stock</th>
                                    <th className="px-4 py-2.5">Cost</th>
                                    <th className="px-4 py-2.5">Priority</th>
                                    <th className="px-4 py-2.5">Status</th>
                                    <th className="px-4 py-2.5 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                  {generalStockroomItems.map(renderDeficitRow)}
                                </tbody>
                              </table>
                            </div>

                            <div className="divide-y divide-line md:hidden">
                              {generalStockroomItems.map((d) => {
                                const inv = invById.get(d.assetId)
                                const avail = inv?.availableStock ?? 0
                                const req = d.requiredQty ?? avail + d.shortageQty
                                return (
                                  <div key={d.id} className="p-4 space-y-2 text-xs">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="font-semibold text-foreground">
                                          {d.assetName}
                                        </div>
                                        <div className="text-muted-foreground">
                                          {d.category} · {d.triggerSource ?? "Manual Request"}
                                        </div>
                                      </div>
                                      <Badge tone={deficitStatusTone(d)}>
                                        {deficitStatusLabel(d)}
                                      </Badge>
                                    </div>
                                    <div className="text-muted-foreground">
                                      Available: {avail} · Required: {req} ·{" "}
                                      <span className="font-semibold text-red-500">
                                        Shortage: {d.shortageQty}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between pt-1">
                                      <Badge tone={urgencyTone(d.urgency)}>
                                        {d.urgency}
                                      </Badge>
                                      {d.status === "Open" && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() =>
                                            openPrepareOrderModal({
                                              assetId: d.assetId,
                                              deficitIds: [d.id],
                                              eventId: d.eventId,
                                              qty: d.shortageQty,
                                              unitCost: d.unitCost,
                                            })
                                          }
                                        >
                                          Prepare Order
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* VIEW 2: Consolidated Register */}
      {view === "consolidated" && (
        <Card className="overflow-hidden">
          {consolidatedLines.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No active consolidated shortages or replenishment demand.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-fg/[0.02] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Source Events / Requests</th>
                    <th className="px-4 py-3">Demand &amp; On Order</th>
                    <th className="px-4 py-3">Est. Cost</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {consolidatedLines.map((line) => (
                    <tr key={line.assetId} className="hover:bg-fg/[0.02]">
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-foreground">
                          {line.assetName}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {line.category} · {line.assetCode}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {line.sources.map((src) => (
                            <button
                              key={src.deficitId}
                              type="button"
                              onClick={() => {
                                setView("deficits")
                                if (!src.isGeneralStockroom) {
                                  setExpandedEvents((prev) => ({
                                    ...prev,
                                    [src.eventId]: true,
                                  }))
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-fg/[0.03] px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:border-accent hover:text-accent"
                            >
                              <span>{src.eventTitle}</span>
                              <span className="font-mono text-muted-foreground">
                                ({src.shortageQty})
                              </span>
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top space-y-0.5">
                        <div className="text-foreground">
                          Total Shortage: <span className="font-semibold">{line.totalShortageQty}</span> ·{" "}
                          On Order: <span className="font-semibold">{line.pendingOrderedQty}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Available Stock: {line.availableStock} ·{" "}
                          <span className="font-semibold text-foreground">
                            Net to Order: {line.netToOrderQty}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top font-mono">
                        {line.knownCostTotal !== null ? (
                          formatPhp(line.knownCostTotal)
                        ) : (
                          <span className="text-muted-foreground">Cost unavailable</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge tone={urgencyTone(line.highestUrgency)}>
                          {line.highestUrgency}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        {line.netToOrderQty > 0 && line.uncoveredDeficitIds.length > 0 ? (
                          <Button
                            type="button"
                            onClick={() =>
                              openPrepareOrderModal({
                                assetId: line.assetId,
                                deficitIds: line.uncoveredDeficitIds,
                                qty: line.netToOrderQty,
                              })
                            }
                          >
                            Prepare Order ({line.netToOrderQty})
                          </Button>
                        ) : (
                          <Badge tone="info">Covered by Pending Order</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* VIEW 3: Acquisitions & Receipts */}
      {view === "acquisitions" && (
        <Card className="overflow-hidden">
          {filteredAcquisitions.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No acquisition orders recorded yet. Prepare an order from Event-Bound Deficits or Consolidated Register.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-fg/[0.02] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Asset</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Received / Ordered</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredAcquisitions.map((acq) => {
                    const rec =
                      acq.receivedQty ??
                      (acq.status === "Received & Stocked" ? acq.quantity : 0)
                    const remaining = Math.max(0, acq.quantity - rec)
                    const gap = getAcquisitionReconciliationGap(state, acq)
                    const lastReconcile =
                      acq.reconciliationHistory &&
                      acq.reconciliationHistory.length > 0
                        ? acq.reconciliationHistory[
                            acq.reconciliationHistory.length - 1
                          ]
                        : null
                    return (
                      <tr key={acq.id} className="hover:bg-fg/[0.02]">
                        <td className="px-4 py-3 align-top">
                          <div className="font-mono font-semibold text-foreground">
                            {acq.id}
                          </div>
                          {acq.eventTitle && (
                            <div className="text-[11px] text-muted-foreground">
                              {acq.eventTitle}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-foreground">
                            {acq.assetName}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {acq.assetCode}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-foreground">
                          {acq.supplierName}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-mono font-semibold text-foreground">
                            {rec} / {acq.quantity}
                          </div>
                          {acq.receiptHistory && acq.receiptHistory.length > 0 && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Last receipt: {fmtStamp(acq.receiptHistory[acq.receiptHistory.length - 1].receivedAt)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top font-mono">
                          {acq.unitCost > 0 ? (
                            formatPhp(acq.unitCost * acq.quantity)
                          ) : (
                            <span className="text-muted-foreground">Unavailable</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col items-start gap-1">
                            <Badge tone={acqStatusTone(acq.status)}>
                              {acq.status}
                            </Badge>
                            {gap.needsReconciliation && (
                              <Badge tone="warning">
                                {gap.assetMatched
                                  ? `Needs Reconciliation (${gap.unverifiedQty} unverified)`
                                  : "Unmatched Asset"}
                              </Badge>
                            )}
                            {lastReconcile && (
                              <div className="text-[11px] text-muted-foreground">
                                Reconciled ({lastReconcile.qty} &times;{" "}
                                {lastReconcile.decision === "already-posted"
                                  ? "already stocked"
                                  : "posted missing"}
                                ) by {lastReconcile.actorName}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            {remaining > 0 && acq.status !== "Received & Stocked" ? (
                              <Button
                                type="button"
                                icon={PackageCheck}
                                onClick={() => openReceiptModal(acq)}
                              >
                                Record Receipt ({remaining} left)
                              </Button>
                            ) : !gap.needsReconciliation ? (
                              <span className="text-[11px] text-muted-foreground">
                                Completed
                              </span>
                            ) : null}
                            {gap.needsReconciliation && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => openReconcileModal(acq)}
                              >
                                Reconcile Receipt
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Add Replenishment Item Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Replenishment Item"
      >
        <form onSubmit={handleAddSubmit} className="space-y-3.5">
          {addError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
              {addError}
            </div>
          )}
          <Field label="Event or Stockroom">
            <select
              aria-label="Replenishment target event"
              value={addEventId}
              onChange={(e) => setAddEventId(e.target.value)}
              className={fieldCls}
            >
              <option value={GENERAL_STOCKROOM_EVENT_ID}>
                {GENERAL_STOCKROOM_EVENT_TITLE} (Unrelated to an event)
              </option>
              {state.orderRequests.map((o) => (
                <option key={o.eventId} value={o.eventId}>
                  {o.eventTitle}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Catalog Asset">
            <select
              aria-label="Replenishment catalog asset"
              value={addAssetId}
              onChange={(e) => setAddAssetId(e.target.value)}
              className={fieldCls}
            >
              {state.inventory.map((inv) => (
                <option key={inv.assetId} value={inv.assetId}>
                  {inv.assetCode} — {inv.name} (Avail: {inv.availableStock})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shortage / Request Quantity *">
              <Input
                type="number"
                min={1}
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                aria-label="Replenishment quantity"
              />
            </Field>
            <Field label="Unit Cost (PHP, optional)">
              <Input
                type="number"
                min={0}
                value={addUnitCost}
                onChange={(e) => setAddUnitCost(e.target.value)}
                placeholder="Leave blank if unavailable"
                aria-label="Replenishment unit cost"
              />
            </Field>
            <Field label="Priority">
              <select
                aria-label="Replenishment priority"
                value={addUrgency}
                onChange={(e) => setAddUrgency(e.target.value as Urgency)}
                className={fieldCls}
              >
                <option value="Standard">Standard</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </Field>
            <Field label="Trigger Source">
              <select
                aria-label="Replenishment trigger source"
                value={addTrigger}
                onChange={(e) =>
                  setAddTrigger(
                    e.target.value as "Manual Request" | "Auto-Threshold",
                  )
                }
                className={fieldCls}
              >
                <option value="Manual Request">Manual Request</option>
                <option value="Auto-Threshold">Auto-Threshold</option>
              </select>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <Input
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Reason or stockroom threshold note..."
              aria-label="Replenishment notes"
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Add Replenishment Request</Button>
          </div>
        </form>
      </Modal>

      {/* Prepare Acquisition Order Modal */}
      <Modal
        open={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        title="Prepare Acquisition Order"
      >
        <div className="space-y-3.5">
          {orderError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
              {orderError}
            </div>
          )}

          <Field label="Asset">
            <select
              aria-label="Order asset"
              value={orderAssetId}
              onChange={(e) => {
                const nextId = e.target.value
                setOrderAssetId(nextId)
                const matched = consolidatedLines.find(
                  (c) => c.assetId === nextId,
                )
                setOrderDeficitIds(matched?.uncoveredDeficitIds ?? [])
                if (matched && matched.netToOrderQty > 0) {
                  setOrderQty(String(matched.netToOrderQty))
                }
              }}
              className={fieldCls}
            >
              {state.inventory.map((inv) => (
                <option key={inv.assetId} value={inv.assetId}>
                  {inv.assetCode} — {inv.name} (Avail: {inv.availableStock})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Active Vendor *">
            <select
              aria-label="Order vendor"
              value={orderVendorId}
              onChange={(e) => setOrderVendorId(e.target.value)}
              className={fieldCls}
            >
              {activeVendorOptions.length === 0 ? (
                <option value="">No active vendors available</option>
              ) : (
                activeVendorOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              )}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Order Quantity *">
              <Input
                type="number"
                min={1}
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                aria-label="Order quantity"
              />
            </Field>
            <Field label="Unit Cost (PHP, optional)">
              <Input
                type="number"
                min={0}
                value={orderUnitCost}
                onChange={(e) => setOrderUnitCost(e.target.value)}
                placeholder="0 if unavailable"
                aria-label="Order unit cost"
              />
            </Field>
          </div>

          <p className="text-xs text-muted-foreground">
            Placing an order sets its status to <strong>Ordered</strong> without adding to available inventory until receipt is confirmed.
          </p>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOrderModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePlaceOrder(true)}
            >
              Acquire &amp; Receive Now
            </Button>
            <Button type="button" onClick={() => handlePlaceOrder(false)}>
              Place Order (Receive Later)
            </Button>
          </div>
        </div>
      </Modal>

      {/* Record Receipt Modal (Full or Partial) */}
      <Modal
        open={Boolean(receiptTarget)}
        onClose={() => setReceiptTarget(null)}
        title={`Record Receipt — ${receiptTarget?.id ?? ""}`}
      >
        {receiptTarget && (
          <form onSubmit={handleConfirmReceipt} className="space-y-3.5">
            {receiptError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
                {receiptError}
              </div>
            )}
            <div className="rounded-md border border-line bg-fg/[0.02] p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground">
                {receiptTarget.assetName} ({receiptTarget.assetCode})
              </div>
              <div className="text-muted-foreground">
                Ordered: {receiptTarget.quantity} · Already Received:{" "}
                {receiptTarget.receivedQty ?? 0} · Remaining:{" "}
                {Math.max(
                  0,
                  receiptTarget.quantity - (receiptTarget.receivedQty ?? 0),
                )}
              </div>
            </div>
            <Field label="Quantity Received Now *">
              <Input
                type="number"
                min={1}
                max={Math.max(
                  1,
                  receiptTarget.quantity - (receiptTarget.receivedQty ?? 0),
                )}
                value={receiptQty}
                onChange={(e) => setReceiptQty(e.target.value)}
                aria-label="Quantity received now"
              />
            </Field>
            <Field label="Receipt Notes (optional)">
              <Input
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                placeholder="Delivery note or partial shipment reference..."
                aria-label="Receipt notes"
              />
            </Field>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReceiptTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit">Confirm Receipt</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(reconcileTarget)}
        onClose={() => setReconcileTarget(null)}
        title="Reconcile Acquisition Receipt"
      >
        {reconcileTarget && (
          <form onSubmit={handleConfirmReconcile} className="space-y-4">
            {(() => {
              const gap = getAcquisitionReconciliationGap(state, reconcileTarget)
              return (
                <div className="rounded-lg border border-line bg-fg/[0.02] p-3 text-xs">
                  <div className="font-semibold text-foreground">
                    {reconcileTarget.id} &middot; {reconcileTarget.assetName}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Received: {gap.receivedQty} &middot; Verified posted:{" "}
                    {gap.verifiedPostedQty} &middot; Unverified:{" "}
                    {gap.unverifiedQty}
                  </div>
                  {gap.issue && (
                    <div className="mt-1.5 text-amber-300">{gap.issue}</div>
                  )}
                </div>
              )
            })()}
            {reconcileError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {reconcileError}
              </div>
            )}
            <Field label="Verification Outcome">
              <select
                value={reconcileDecision}
                onChange={(e) =>
                  setReconcileDecision(
                    e.target.value as "already-posted" | "post-missing-stock",
                  )
                }
                className={fieldCls}
                aria-label="Verification outcome"
              >
                <option value="already-posted">
                  Confirm already stocked (leave inventory unchanged)
                </option>
                <option value="post-missing-stock">
                  Post missing units to matching inventory asset
                </option>
              </select>
            </Field>
            <Field label="Verified Quantity">
              <Input
                type="number"
                min={1}
                max={Math.max(
                  1,
                  getAcquisitionReconciliationGap(state, reconcileTarget)
                    .unverifiedQty,
                )}
                value={reconcileQty}
                onChange={(e) => setReconcileQty(e.target.value)}
                aria-label="Verified quantity"
              />
            </Field>
            <Field label="Audit Reason (required)">
              <textarea
                rows={3}
                value={reconcileReason}
                onChange={(e) => setReconcileReason(e.target.value)}
                placeholder="Cite physical bin count, receiving log, or invoice reference..."
                className={fieldCls}
                aria-label="Audit reason"
              />
            </Field>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReconcileTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !reconcileReason.trim() ||
                  Number(reconcileQty) < 1 ||
                  !Number.isFinite(Number(reconcileQty))
                }
              >
                Confirm Reconciliation
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

export { ReplenishmentDeficitsModule }
