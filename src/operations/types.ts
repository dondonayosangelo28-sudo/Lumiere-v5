export type RentalConfirmationStatus = "Pending Confirmation" | "Confirmed"

export type CustomFabricationStatus =
  | "Unassigned"
  | "Assigned"
  | "Pending"
  | "In Production"
  | "Awaiting Verification"
  | "Needs Correction"
  | "Ready to Load"

export type CrewTaskStatus =
  | "Assigned"
  | "InProgress"
  | "In Progress"
  | "Blocked"
  | "Submitted"
  | "Completed"

export type WorkerAssignmentStatus =
  | "Assigned"
  | "In Progress"
  | "Submitted"
  | "Completed"

export type AssignmentMode = "individual" | "group"

export type EstimateBasis = "per-unit" | "complete-set"

export type ShiftActivityType =
  | "fabrication"
  | "lead-coordination"
  | "loading"
  | "transport"
  | "setup"
  | "event"
  | "dismantling"
  | "returns"

export type MigrationReviewFlagCode =
  | "MISSING_CONFIRMED_SCHEDULE"
  | "UNPARSEABLE_SCHEDULE_TEXT"
  | "UNCONFIRMED_PARTICIPANTS"
  | "DEMO_ACCOUNT_ASSIGNED"
  | "AUTO_DESIGNATED_TEAM_LEAD"
  | "LEGACY_EVIDENCE_NO_EXPLICIT_SUBMISSION"
  | "LEGACY_APPROVAL_MISSING_EVIDENCE"
  | "MIGRATED_CORRECTION_NEEDS_ASSIGNMENT"

export type MigrationReviewFlag = {
  id: string
  code: MigrationReviewFlagCode
  targetType: "event" | "job" | "assignment" | "schedule" | "lead"
  targetId: string
  message: string
  blockingActions: ("schedule" | "submit" | "approve" | "loading-signoff")[]
  createdAt: string
  resolvedAt?: string
  resolvedByEmail?: string
  resolvedByName?: string
  resolutionNotes?: string
}

export type MigrationResolutionAudit = {
  id: string
  eventId: string
  jobId?: string
  flagCode: MigrationReviewFlagCode
  action:
  | "confirmed-data"
  | "corrected-status"
  | "replaced-demo-or-lead"
  | "recorded-historical-exception"
  previousStatus?: CustomFabricationStatus
  newStatus?: CustomFabricationStatus
  reason: string
  resolvedByEmail: string
  resolvedByName: string
  resolvedAt: string
}

export type EventRosterMember = {
  crewEmail: string
  crewName: string
  addedAt: string
  addedByEmail: string
  addedByName?: string
  removedAt?: string
  removedByEmail?: string
  removalReason?: string
  needsWarehouseReview?: boolean
}

export type ProductionWindow = {
  startDate: string // YYYY-MM-DD (Asia/Manila)
  deadlineDate: string // YYYY-MM-DD (Asia/Manila)
  availableProductionDays: number
  confirmed: boolean
  confirmedByEmail?: string
  confirmedByName?: string
  confirmedAt?: string
}

export type ShiftScheduleWindow = {
  id: string
  eventId: string
  jobId?: string
  assignmentId: string
  crewEmail: string
  crewName?: string
  startDateTime: string // Asia/Manila ISO local "YYYY-MM-DDTHH:mm"
  endDateTime: string // Asia/Manila ISO local "YYYY-MM-DDTHH:mm"
  breakMinutes: number
  breakStartDateTime?: string // Required for overnight shifts with breaks & shared shifts with breaks
  breakEndDateTime?: string
  plannedProductiveHours: number
  dailyProductiveHoursByManilaDate: Record<string, number>
  activityType: ShiftActivityType
  isSharedShift?: boolean
  sharedShiftGroupId?: string
  requiredSimultaneousCrew?: number
  status: "scheduled" | "cancelled"
  cancelledAt?: string
  cancelledByEmail?: string
  cancellationReason?: string
  legacyScheduleText?: string
  needsWarehouseReview?: boolean
}

export type WorkerAssignmentRecord = {
  id: string
  eventId: string
  kind: "production" | "event-ops"
  jobId?: string
  phase?:
  | "loading"
  | "transport"
  | "setup"
  | "event"
  | "dismantling"
  | "returns"
  activityType?: ShiftActivityType
  crewEmail: string
  crewName: string
  role: "working-lead" | "crew"
  instructions: string
  status: WorkerAssignmentStatus
  progressPercent?: number
  isCorrectionAssignment?: boolean
  correctionRequestId?: string
  blockerReason?: string
  startedAt?: string
  submittedAt?: string
  completedAt?: string
  completedByEmail?: string
  completedByName?: string
  completionNotes?: string
  needsWarehouseReview?: boolean
  updatedAt: string
}

export type WorkerContributionLog = {
  id: string
  assignmentId: string
  eventId: string
  jobId?: string
  shiftId?: string
  crewEmail: string
  crewName: string
  manilaDate: string // YYYY-MM-DD in Asia/Manila
  attendance: "Present" | "Partial" | "Absent"
  actualProductiveHours: number
  progressPercent?: number
  contributionSummary: string
  blockerReason?: string
  photoUrls: string[]
  isLegacyImportedEvidence?: boolean
  submittedByEmail: string
  submittedByName: string
  submittedAt: string
  status?: "Saved" | "Submitted"
  updatedAt?: string
}

export type DailyGroupProgressReport = {
  id: string
  jobId: string
  eventId: string
  manilaDate: string
  summary: string
  photoUrls: string[]
  submittedByLeadEmail: string
  submittedByLeadName: string
  submittedAt: string
}

export type VerificationSubmission = {
  id: string
  jobId: string
  eventId: string
  round: number
  submittedByEmail: string
  submittedByName: string
  submittedAt: string
  completedQty: number
  photoUrls: string[]
  summary: string
  isCorrectionResubmission?: boolean
}

export type CorrectionRequestRecord = {
  id: string
  jobId: string
  eventId: string
  round: number
  requestedByEmail: string
  requestedByName: string
  requestedAt: string
  explanation: string
  referencePhotoUrls: string[]
  responsibleCrewEmails: string[]
  createdAssignmentIds: string[]
  scheduledAdditionalShiftIds: string[]
  resolvedBySubmissionId?: string
  resolvedAt?: string
}

export type VerificationApprovalRecord = {
  submissionId?: string
  isHistoricalException?: boolean
  historicalExceptionReason?: string
  verifiedByEmail: string
  verifiedByName: string
  verifiedAt: string
  checklist: {
    fullQuantityFinished: boolean
    matchesClientApprovedSpec: boolean
    correctionsResolved: boolean
  }
  notes: string
}

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
  | "Client Invoiced"
  | "Supplier Credited"

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
  /** Quantity already transferred from allocatedStock to dispatchedStock */
  dispatchedQty?: number
  /** Whether Ground Crew verified this line on the Loading Checklist */
  loadingVerified: boolean
  /** Quantity physically counted on return at Warehouse Arrival */
  returnedQty: number
  /** Explicit flag distinguishing confirmed return counts (including 0) from uncounted lines */
  returnCounted?: boolean
  /** Preserved event-level return total awaiting per-trip reconciliation */
  legacyEventReturnedQty?: number
  /** Migration flag for legacy lines whose 0/empty return state cannot be verified */
  legacyReturnUncertain?: boolean
  /** Notes on allocation or condition */
  notes?: string
}

export type CustomFabricationSpec = {
  id: string
  name: string
  requestedQty: number
  dimensions: string
  heightCm?: number
  widthCm?: number
  depthCm?: number
  materials: string
  colors: string
  finish: string
  buildInstructions: string
  referenceImages: string[]
  estimatedHoursPerUnitOrSet?: number
  estimateBasis?: EstimateBasis
  defaultSharedShiftMinCrew?: number
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
  /** Phase 1 Extended Production Fields */
  assignmentMode?: AssignmentMode
  inheritedLeadEmail?: string
  inheritedLeadName?: string
  productionLeadEmail?: string
  productionLeadName?: string
  estimatedHoursPerUnitOrSet?: number
  estimateBasis?: EstimateBasis
  productionWindow?: ProductionWindow
  participantEmails?: string[]
  assignments?: WorkerAssignmentRecord[]
  schedules?: ShiftScheduleWindow[]
  contributions?: WorkerContributionLog[]
  groupProgressReports?: DailyGroupProgressReport[]
  submissions?: VerificationSubmission[]
  correctionRequests?: CorrectionRequestRecord[]
  approval?: VerificationApprovalRecord
  migrationReviewFlags?: MigrationReviewFlag[]
  migrationResolutionHistory?: MigrationResolutionAudit[]
  needsWarehouseReview?: boolean
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
  evidenceType:
  | "Accepted E-Letter"
  | "Written Confirmation"
  | "Signed Agreement"
  | "Supplier Portal Confirmation"
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
  legacyScheduleText?: string
  needsWarehouseReview?: boolean
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
  isAutoDesignatedLegacy?: boolean
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
  isLegacyImportedEvidence?: boolean
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
  returnCounted?: boolean
  legacyReturnUncertain?: boolean
  shortfallQty: number
  loadingNotes?: string
  returnNotes?: string
  blockedByLegacyReview?: boolean
  legacyReviewReason?: string
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
  status?: "Saved" | "Submitted"
  updatedAt?: string
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
  batchId?: string
  tripAllocations?: {
    batchId: string
    quantity: number
    allocatedAt: string
    allocatedByEmail: string
    allocatedByName: string
  }[]
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
  /** Tracked inventory count delta applied when this report was filed */
  inventoryAdjustedQty?: number
  /** Subset of inventoryAdjustedQty transferred out of dispatchedStock while event was open */
  transferredFromDispatchedQty?: number
  /** True once this report's inventory deduction has been reversed (e.g., Recovered) */
  inventoryRecoveryApplied?: boolean
  /** Marks legacy incidents whose prior inventory adjustment cannot be established */
  legacyInventoryAttribution?: "uncertain" | "verified"
  /** True when recovery of an untracked legacy incident requires explicit Warehouse inventory check */
  needsWarehouseInventoryReconciliation?: boolean
  /** Audited Warehouse reconciliation record for untracked legacy incidents */
  legacyInventoryReconciliation?: LegacyInventoryReconciliationAudit
  /** Explicit provenance distinguishing automatic checklist shortages from manual reports */
  reportSource?: "auto-return-checklist" | "manual-field-report" | "legacy-unknown"
  /** Original reported quantity prior to any automatic checklist adjustment */
  originalQuantity?: number
  /** Audit history of quantity adjustments applied during return checklist reconciliation */
  quantityAdjustmentHistory?: {
    previousQty: number
    newQty: number
    adjustedAt: string
    adjustedByEmail: string
    adjustedByName: string
    reason: string
  }[]
}

export type LegacyReturnReconciliationAudit = {
  eventId: string
  assetId: string
  assetCode: string
  assetName: string
  mode: "trip-totals" | "manual-warehouse"
  previousReturnedQty: number
  reconciledReturnedQty: number
  reason: string
  supportingTripIds?: string[]
  reviewedByEmail: string
  reviewedByName: string
  reviewedAt: string
}

export type LegacyInventoryReconciliationDecision =
  | "no-adjustment-required"
  | "reverse-attributable-loss"
  | "attribution-still-uncertain"

export type LegacyInventorySnapshot = {
  totalStock: number
  availableStock: number
  allocatedStock: number
  dispatchedStock: number
  damagedCount: number
  missingCount: number
}

export type LegacyInventoryReconciliationAudit = {
  reportId: string
  eventId: string
  assetId: string
  assetCode: string
  assetName: string
  decision: "no-adjustment-required" | "reverse-attributable-loss"
  adjustedQty: number
  transferredFromDispatchedQty: number
  reason: string
  reviewedByEmail: string
  reviewedByName: string
  reviewedAt: string
  beforeInventory: LegacyInventorySnapshot
  afterInventory: LegacyInventorySnapshot
}

export type DeficitQueueEntry = {
  id: string
  eventId: string
  eventTitle: string
  isGeneralStockroom?: boolean
  assetId: string
  assetCode: string
  assetName: string
  category: string
  shortageQty: number
  requiredQty?: number
  triggerSource?: "Event Allocation" | "Manual Request" | "Auto-Threshold"
  unitCost?: number
  notes?: string
  createdByName?: string
  urgency: "Standard" | "High" | "Critical"
  status: "Open" | "In Acquisition" | "Fulfilled"
  createdAt: string
  resolvedAt?: string
}

export type AcquisitionReceiptEntry = {
  id: string
  qty: number
  receivedAt: string
  receivedByName: string
  notes?: string
  postedToInventory?: boolean
  postedAt?: string
}

export type AcquisitionReconciliationEntry = {
  id: string
  decision: "already-posted" | "post-missing-stock"
  qty: number
  reason: string
  actorName: string
  actorEmail: string
  reconciledAt: string
}

export type AcquisitionOrder = {
  id: string
  operationId?: string
  deficitId?: string
  deficitIds?: string[]
  eventId?: string
  eventTitle?: string
  vendorId?: string
  assetId: string
  assetCode: string
  assetName: string
  supplierName: string
  quantity: number
  receivedQty?: number
  postedToInventoryQty?: number
  unitCost: number
  status: "Planned" | "Ordered" | "Partially Received" | "Received & Stocked"
  orderedByName: string
  createdAt: string
  receivedAt?: string
  receiptHistory?: AcquisitionReceiptEntry[]
  reconciliationHistory?: AcquisitionReconciliationEntry[]
}

export type ThumbnailFraming = {
  zoom: number
  offsetX: number
  offsetY: number
}

export type WarehouseInventoryItem = {
  assetId: string
  assetCode: string
  name: string
  category: string
  zone: string
  unit: string
  image: string
  thumbnailFraming?: ThumbnailFraming
  totalStock: number
  availableStock: number
  allocatedStock: number
  dispatchedStock: number
  damagedCount: number
  missingCount: number
  reorderThreshold: number
  description?: string
  height?: number
  width?: number
  weight?: number
  material?: string
  color?: string
  primaryVendorId?: string
  estimatedHoursPerUnitOrSet?: number
  estimateBasis?: EstimateBasis
  defaultSharedShiftMinCrew?: number
}

export type WarehouseOrderRequest = {
  id: string
  eventId: string
  /** Canonical Event Manager Project ID (used for `pitch:<projectId>` mood board lookup) */
  projectId?: string
  /** Canonical Mood Board identifier (`pitch:<projectId>`) */
  moodBoardId?: string
  eventTitle: string
  clientName: string
  clientEmail?: string
  venue: string
  venueLocation?: {
    latitude: number
    longitude: number
    name?: string
    address?: string
  }
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
  /** Event Crew Group (Roster) */
  eventRoster?: EventRosterMember[]
  /** Assigned Ground Crew members (legacy + event-ops compatibility) */
  crewAssignments: CrewMemberAssignment[]
  /** Structured worker assignments across event operations */
  eventAssignments?: WorkerAssignmentRecord[]
  /** Structured shift schedule windows across event operations */
  eventSchedules?: ShiftScheduleWindow[]
  /** Worker attendance, actual hours, and contribution logs for event-operation duties */
  eventContributions?: WorkerContributionLog[]
  /** Current designated Team Lead email (must be a roster/assigned Ground Crew member) */
  teamLeadEmail?: string
  teamLeadName?: string
  teamLeadExplicitlySelected?: boolean
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
  /** Prior return checklist submissions invalidated by later physical return count edits */
  returnChecklistHistory?: ReturnChecklistSubmission[]
  /** Event closeout state */
  warehouseClosed: boolean
  closedByEmail?: string
  closedByName?: string
  closedAt?: string
  closeoutNotes?: string
  isPreviewSeed?: boolean
  moodBoardNotes?: string
  moodBoardPages?: { title: string; background: string }[]
  moodBoardPins?: {
    id: string
    title: string
    image?: string
    text?: string
    page?: number
    x: number
    y: number
    width: number
    rotation: number
  }[]
  migrationReviewFlags?: MigrationReviewFlag[]
  migrationResolutionHistory?: MigrationResolutionAudit[]
  legacyReturnReconciliations?: LegacyReturnReconciliationAudit[]
  dispatchBatches?: DispatchBatchRecord[]
}

export type DispatchBatchDirection = "outbound" | "return"
export type DispatchBatchStage =
  | "Planned"
  | "Loaded"
  | "Outbound in transit"
  | "In Transit"
  | "Delivered"
  | "Return loading"
  | "Return in transit"
  | "Returned"
  | "Cancelled"

export type DispatchBatchItem = {
  manifestLineId: string
  assetId?: string
  itemCode: string
  name: string
  kind: "Stock" | "Custom Fabrication"
  plannedQty: number
  actualQty: number
  returnPlannedQty?: number
  returnActualQty?: number
  returnCounted?: boolean
  returnShortageQty?: number
  returnDamagedQty?: number
}

export type DispatchBatchRecord = {
  id: string
  eventId: string
  direction: DispatchBatchDirection
  stage: DispatchBatchStage
  vehicleType: string
  plateNumber: string
  driverName: string
  handoffNotes?: string
  assignedCrewEmails: string[]
  items: DispatchBatchItem[]
  createdAt: string
  createdByName: string
  createdByEmail: string
  updatedAt: string
  departedAt?: string
  stockTransferredAt?: string
  deliveredAt?: string
  returnStartedAt?: string
  returnDepartedAt?: string
  returnedAt?: string
  returnVehicleType?: string
  returnPlateNumber?: string
  returnDriverName?: string
  returnHandoffNotes?: string
  cancelledAt?: string
  cancelReason?: string
  deletedAt?: string
}

export type VendorStatus = "Active" | "On Hold" | "Inactive"

export type VendorType = "Event Asset" | "Rental Asset"

export type VendorRecord = {
  id: string
  name: string
  contactPerson: string
  vendorType?: VendorType
  category: string
  specialty: string
  email: string
  phone: string
  location: string
  leadTime: string
  status: VendorStatus
  legacyCompanies?: string[]
  archivedAt?: string
  archivedByEmail?: string
  archivedByName?: string
  createdAt: string
  updatedAt: string
}

export type CancelledEventAuditRecord = {
  eventId: string
  orderId?: string
  eventTitle: string
  cancelledAt: string
  cancelledByName: string
  cancelledByEmail: string
  reason: string
  releasedReservations: { assetId: string; name: string; allocatedQty: number }[]
}

export type OperationsStoreState = {
  version: number
  migratedAt?: string
  vendors?: VendorRecord[]
  cancelledEvents?: CancelledEventAuditRecord[]
  inventory: WarehouseInventoryItem[]
  orderRequests: WarehouseOrderRequest[]
  fabricationJobs: FabricationJob[]
  afterShiftPhotos: AfterShiftPhoto[]
  incidentReports: FieldIncidentReport[]
  deficitQueue: DeficitQueueEntry[]
  acquisitions: AcquisitionOrder[]
}
