export type RentalConfirmationStatus = "Pending Confirmation" | "Confirmed"

export type CustomFabricationStatus =
  | "Pending"
  | "In Production"
  | "Awaiting Verification"
  | "Needs Correction"
  | "Ready to Load"

export type CrewTaskStatus = "Assigned" | "InProgress" | "Blocked" | "Completed"

export type CheckpointName =
  | "Dispatch Loading"
  | "Venue Arrival"
  | "Event Hours"
  | "Warehouse Arrival"

export type IssueResolutionType =
  | "Recovered"
  | "Repair Scheduled"
  | "Approved Write-off"
  | "Supplier Settled"
  | "Charged to Client"

export type StockAllocationLine = {
  assetId: string
  assetCode: string
  name: string
  category: string
  image: string
  unit: string
  /** Approved requested quantity from Event Manager Asset Plan */
  approvedRequestedQty: number
  /** Quantity allocated from Warehouse inventory */
  allocatedQty: number
  /** Shortage quantity tracked in Deficit Queue */
  deficitQty: number
  /** Quantity released onto Dispatch Manifest */
  releasedForLoadQty: number
  /** Quantity physically counted by Ground Crew during Dispatch Loading */
  loadedQty: number
  /** Whether Ground Crew verified this line on the Loading Checklist */
  loadingVerified: boolean
  /** Quantity physically counted on return at Warehouse Arrival */
  returnedQty: number
  /** Notes on allocation or condition */
  notes?: string
}

export type CustomFabricationSpec = {
  id: string
  name: string
  requestedQty: number
  dimensions: string
  materials: string
  colors: string
  finish: string
  buildInstructions: string
  referenceImages: string[]
}

export type FabricationJob = {
  id: string
  eventId: string
  eventTitle: string
  customItemId: string
  spec: CustomFabricationSpec
  status: CustomFabricationStatus
  assignedCrewEmails: string[]
  progressPercent: number
  completedQty: number
  materialsVerified: boolean
  /** IDs of AfterShiftPhoto records linked to this fabrication job */
  linkedShiftPhotoIds: string[]
  /** Photo URL used by Warehouse to verify finished work against spec */
  verifiedPhotoUrl?: string
  verificationNotes?: string
  correctionNotes?: string
  verifiedByEmail?: string
  verifiedByName?: string
  verifiedAt?: string
  releasedForLoading: boolean
  updatedAt: string
}

export type RentalELetter = {
  supplierName: string
  supplierContact: string
  eventTitle: string
  eventDates: string
  venue: string
  itemsSummary: string
  quantity: number
  deliveryLocation: string
  deliveryArrangements: string
  returnArrangements: string
  preparedByEmail: string
  preparedByName: string
  preparedAt: string
}

export type RentalSupplierAcceptance = {
  evidenceType: "Accepted E-Letter" | "Written Confirmation" | "Signed Agreement"
  referenceOrUrl: string
  notes: string
  recordedByEmail: string
  recordedByName: string
  recordedAt: string
}

export type RentalVenueReceipt = {
  deliveredQty: number
  hasDiscrepancy: boolean
  discrepancyNotes: string
  photoUrl?: string
  verifiedByEmail: string
  verifiedByName: string
  verifiedAt: string
  resolutionStatus?: "Pending" | "Resolved"
  resolutionType?: IssueResolutionType
  resolutionNotes?: string
  resolvedByName?: string
  resolvedAt?: string
}

export type RentalSupplierReturn = {
  handedBackQty: number
  missingQty: number
  damagedQty: number
  hasDiscrepancy: boolean
  discrepancyNotes: string
  photoUrl?: string
  verifiedByEmail: string
  verifiedByName: string
  verifiedAt: string
  resolutionStatus: "Not Applicable" | "Pending" | "Resolved"
  resolutionType?: IssueResolutionType
  resolutionNotes?: string
  resolvedByName?: string
  resolvedAt?: string
}

export type EventRentalRecord = {
  id: string
  eventId: string
  vendorId: string
  vendorName: string
  category: string
  itemName: string
  contact: string
  ApprovedRequestedQty: number
  directToVenue: boolean
  notes: string
  bookingReference: string
  confirmationStatus: RentalConfirmationStatus
  eLetter?: RentalELetter
  supplierAcceptance?: RentalSupplierAcceptance
  venueReceipt?: RentalVenueReceipt
  supplierReturn?: RentalSupplierReturn
}

export type CrewMemberAssignment = {
  id: string
  eventId: string
  crewEmail: string
  crewName: string
  schedule: string
  duties: string
  shiftLabel: string
  taskStatus: CrewTaskStatus
  blockerReason?: string
  startedAt?: string
  completedAt?: string
  updatedAt: string
}

export type TeamLeadChangeRecord = {
  id: string
  previousLeadEmail?: string
  previousLeadName?: string
  newLeadEmail: string
  newLeadName: string
  changedByEmail: string
  changedByName: string
  changedAt: string
  reason: string
}

export type AfterShiftPhoto = {
  id: string
  eventId: string
  eventTitle: string
  shiftLabel: string
  photoUrl: string
  caption: string
  isFabricationWork: boolean
  fabricationJobId?: string
  submittedByEmail: string
  submittedByName: string
  submittedAt: string
}

export type ManifestLineItem = {
  lineId: string
  sourceType: "stock" | "custom"
  sourceId: string
  code: string
  name: string
  category: string
  unit: string
  plannedQty: number
  loadedQty: number
  returnedQty: number
  shortfallQty: number
  loadingNotes?: string
  returnNotes?: string
}

export type LoadingChecklistSubmission = {
  submittedByEmail: string
  submittedByName: string
  submittedAt: string
  notes: string
}

export type OutboundDepartureConfirmation = {
  confirmedByEmail: string
  confirmedByName: string
  confirmedAt: string
  vehiclePlate: string
  driverName: string
  notes: string
}

export type ArrivalConfirmation = {
  checkpoint: "Venue Arrival" | "Warehouse Arrival"
  photoUrl: string
  notes: string
  submittedByEmail: string
  submittedByName: string
  submittedAt: string
}

export type ReturnChecklistSubmission = {
  submittedByEmail: string
  submittedByName: string
  submittedAt: string
  notes: string
}

export type FieldIncidentReport = {
  id: string
  eventId: string
  eventTitle: string
  reportType: "Damage" | "Missing"
  checkpoint: CheckpointName
  lineId?: string
  itemCode: string
  itemName: string
  quantity: number
  description: string
  photoUrl: string
  submittedByEmail: string
  submittedByName: string
  submittedAt: string
  resolutionStatus: "Pending" | "Resolved"
  resolutionType?: IssueResolutionType
  resolutionNotes?: string
  resolvedByEmail?: string
  resolvedByName?: string
  resolvedAt?: string
}

export type DeficitQueueEntry = {
  id: string
  eventId: string
  eventTitle: string
  assetId: string
  assetCode: string
  assetName: string
  category: string
  shortageQty: number
  urgency: "Standard" | "High" | "Critical"
  status: "Open" | "In Acquisition" | "Fulfilled"
  createdAt: string
  resolvedAt?: string
}

export type AcquisitionOrder = {
  id: string
  deficitId?: string
  eventId?: string
  eventTitle?: string
  assetId: string
  assetCode: string
  assetName: string
  supplierName: string
  quantity: number
  unitCost: number
  status: "Planned" | "Ordered" | "Received & Stocked"
  orderedByName: string
  createdAt: string
  receivedAt?: string
}

export type WarehouseInventoryItem = {
  assetId: string
  assetCode: string
  name: string
  category: string
  zone: string
  unit: string
  image: string
  totalStock: number
  availableStock: number
  allocatedStock: number
  dispatchedStock: number
  damagedCount: number
  missingCount: number
  reorderThreshold: number
}

export type WarehouseOrderRequest = {
  id: string
  eventId: string
  eventTitle: string
  clientName: string
  clientEmail?: string
  venue: string
  startDateTime: string
  endDateTime: string
  theme: string
  pax: number
  approvalNote: string
  approvedByName: string
  approvedByEmail: string
  approvedAt: string
  revisionAtApproval: number
  /** Stock allocations managed by Warehouse */
  stockLines: StockAllocationLine[]
  /** Custom fabrication specifications registered under the same event */
  customSpecs: CustomFabricationSpec[]
  /** Rentals linked to this event */
  rentals: EventRentalRecord[]
  /** Assigned Ground Crew members */
  crewAssignments: CrewMemberAssignment[]
  /** Current designated Team Lead email (must be an assigned Ground Crew member) */
  teamLeadEmail?: string
  teamLeadName?: string
  teamLeadHistory: TeamLeadChangeRecord[]
  /** Dispatch manifest & checkpoints */
  manifestPrepared: boolean
  manifestPreparedAt?: string
  manifestPreparedBy?: string
  loadingChecklist?: LoadingChecklistSubmission
  outboundDeparture?: OutboundDepartureConfirmation
  venueArrival?: ArrivalConfirmation
  warehouseArrival?: ArrivalConfirmation
  returnChecklist?: ReturnChecklistSubmission
  /** Event closeout state */
  warehouseClosed: boolean
  closedByEmail?: string
  closedByName?: string
  closedAt?: string
  closeoutNotes?: string
  isPreviewSeed?: boolean
}

export type OperationsStoreState = {
  version: number
  inventory: WarehouseInventoryItem[]
  orderRequests: WarehouseOrderRequest[]
  fabricationJobs: FabricationJob[]
  afterShiftPhotos: AfterShiftPhoto[]
  incidentReports: FieldIncidentReport[]
  deficitQueue: DeficitQueueEntry[]
  acquisitions: AcquisitionOrder[]
}

