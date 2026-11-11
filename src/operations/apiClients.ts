import { tryApiRequest } from "./apiConfig"
import type {
  AfterShiftPhoto,
  ArrivalConfirmation,
  CustomFabricationSpec,
  EventRentalRecord,
  FieldIncidentReport,
  IssueResolutionType,
  LoadingChecklistSubmission,
  OutboundDepartureConfirmation,
  RentalELetter,
  RentalSupplierAcceptance,
  RentalSupplierReturn,
  RentalVenueReceipt,
  ReturnChecklistSubmission,
  WarehouseOrderRequest,
} from "./types"

/**
 * 1. REUSABLE OLD SYSTEM v1 API CLIENTS
 * Adapted from `OLD SYSTEM v1/src/features/.../api/*.ts`
 */
export const oldSystemApis = {
  // eventsApi.ts + reservationsApi.ts
  events: {
    getEvents: () => tryApiRequest<unknown[]>("/events"),
    getEventById: (id: string) => tryApiRequest<unknown>(`/events/${id}`),
    createBulkReservations: (eventId: string, items: { assetId: string; quantityRequested: number }[]) =>
      tryApiRequest<unknown>("/reservations/bulk", {
        method: "POST",
        body: JSON.stringify({ eventId, items }),
      }),
    getEventReservations: (eventId: string) =>
      tryApiRequest<unknown[]>(`/reservations/event/${eventId}`),
  },

  // assetsApi.ts + deficitApi.ts
  inventory: {
    getAssets: () => tryApiRequest<unknown[]>("/assets"),
    updateAsset: (id: string, payload: unknown) =>
      tryApiRequest<unknown>(`/assets/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    getDeficitQueue: () => tryApiRequest<unknown[]>("/deficit-queue"),
    createDeficitEntry: (payload: {
      assetName: string
      category: string
      shortageQuantity: number
      eventName: string
      urgencyLevel: string
    }) =>
      tryApiRequest<unknown>("/deficit-queue", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    updateDeficitStatus: (id: string, status: string) =>
      tryApiRequest<unknown>(`/deficit-queue/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },

  // productionApi.ts
  production: {
    getEventGantt: (eventId: string) =>
      tryApiRequest<unknown[]>(`/production/event/${eventId}/gantt`),
    verifyMaterials: (taskId: string, verified: boolean) =>
      tryApiRequest<unknown>(`/production/task/${taskId}/verify-materials`, {
        method: "POST",
        body: JSON.stringify(verified),
      }),
    updateProgress: (
      taskId: string,
      payload: { progressPercentage: number; completedQuantity: number; notes?: string },
    ) =>
      tryApiRequest<unknown>(`/production/task/${taskId}/progress`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    approveTask: (taskId: string, notes?: string) =>
      tryApiRequest<unknown>(`/production/task/${taskId}/approve`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      }),
    rejectTask: (taskId: string, reason: string) =>
      tryApiRequest<unknown>(`/production/task/${taskId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    handoffToInventory: (taskId: string, payload: { name: string; category: string; quantity: number }) =>
      tryApiRequest<unknown>(`/production/task/${taskId}/handoff`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },

  // manningApi.ts
  manning: {
    getEventAssignments: (eventId: string) =>
      tryApiRequest<unknown[]>(`/manning/event/${eventId}`),
    getMyAssignments: () => tryApiRequest<unknown[]>("/manning/my-assignments"),
    assignCrew: (payload: {
      eventId: string
      userId: string
      role: string
      shiftStart: string
      shiftEnd: string
      assignedZone?: string
    }) =>
      tryApiRequest<unknown>("/manning/assign", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    updateAssignmentStatus: (
      assignmentId: string,
      payload: { status: string; blockerReason?: string },
    ) =>
      tryApiRequest<unknown>(`/manning/assignments/${assignmentId}/status`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },

  // dispatchApi.ts + partialEgressApi.ts
  dispatch: {
    getPreparation: (eventId: string) =>
      tryApiRequest<unknown>(`/dispatch/event/${eventId}/preparation`),
    prepareDispatch: (eventId: string) =>
      tryApiRequest<unknown>(`/dispatch/event/${eventId}/prepare`, { method: "POST" }),
    verifyItem: (eventId: string, reservationId: string, isVerified: boolean) =>
      tryApiRequest<unknown>(`/dispatch/event/${eventId}/verify-item`, {
        method: "POST",
        body: JSON.stringify({ reservationId, isVerified }),
      }),
    dispatchAssets: (eventId: string, notes?: string) =>
      tryApiRequest<unknown>(`/dispatch/event/${eventId}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      }),
    getPackingList: (eventId: string) =>
      tryApiRequest<unknown>(`/dispatch/event/${eventId}/packing-list`),
    getPartialEgress: (eventId: string) =>
      tryApiRequest<unknown>(`/partial-egress/events/${eventId}`),
    completeEgressItem: (
      eventId: string,
      itemId: string,
      payload: { actualQty: number; condition: string; notes?: string },
    ) =>
      tryApiRequest<unknown>(`/partial-egress/events/${eventId}/items/${itemId}/complete`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },

  // damageApi.ts
  damage: {
    submitDamageReport: (payload: {
      eventId: string
      assetId: string
      damageSeverity: string
      description: string
      quantityAffected: number
      photoEvidenceUrl?: string
    }) =>
      tryApiRequest<unknown>("/damage-reports", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    getEventDamageReports: (eventId: string) =>
      tryApiRequest<unknown[]>(`/damage-reports/event/${eventId}`),
    signOffReport: (reportId: string, payload: { isApproved: boolean; comments?: string }) =>
      tryApiRequest<unknown>(`/damage-reports/${reportId}/sign-off`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    isSettlementBlocked: (eventId: string) =>
      tryApiRequest<{ isBlocked: boolean }>(`/damage-reports/event/${eventId}/settlement-blocked`),
  },
}

/**
 * 2. AGREED BACKEND CONTRACTS FOR NEW V5.1 LIFECYCLE CONNECTIONS (D01–D08)
 * These endpoints extend OLD SYSTEM v1 to support idempotent Order Request
 * publishing, custom fabrication photo verification, rental e-letter &
 * supplier acceptance, direct-to-venue rental verification, Team Lead
 * replacement attribution, 4 field checkpoints, and event closeout gating.
 */
export const v51ContractApis = {
  // D01 & D02: Idempotent Order Request creation on Event Manager Client Approval
  publishOrderRequest: (payload: {
    eventId: string
    eventTitle: string
    venue: string
    startDateTime: string
    endDateTime: string
    stockItems: { assetId: string; quantity: number }[]
    customSpecs: CustomFabricationSpec[]
    rentals: EventRentalRecord[]
  }) =>
    tryApiRequest<WarehouseOrderRequest>(`/warehouse/order-requests/${payload.eventId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // D02: Link Ground Crew After-Shift Work Photo & Verify Custom Fabrication
  submitAfterShiftPhoto: (payload: AfterShiftPhoto) =>
    tryApiRequest<AfterShiftPhoto>(`/events/${payload.eventId}/after-shift-photos`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyCustomFabricationWithPhoto: (
    jobId: string,
    payload: {
      passed: boolean
      photoUrl: string
      notes: string
      verifiedByEmail: string
    },
  ) =>
    tryApiRequest<unknown>(`/production/task/${jobId}/verify-with-photo`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Team Lead designation & replacement with attribution preservation
  setEventTeamLead: (
    eventId: string,
    payload: {
      newLeadEmail: string
      newLeadName: string
      changedByEmail: string
      changedByName: string
      reason: string
    },
  ) =>
    tryApiRequest<unknown>(`/events/${eventId}/team-lead`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // D07 & D08: Rental E-Letter, Supplier Acceptance & Direct-to-Venue Checks
  saveRentalELetter: (
    eventId: string,
    rentalId: string,
    payload: { bookingReference: string; eLetter: RentalELetter },
  ) =>
    tryApiRequest<unknown>(`/events/${eventId}/rentals/${rentalId}/e-letter`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  confirmRentalAcceptance: (
    eventId: string,
    rentalId: string,
    payload: RentalSupplierAcceptance,
  ) =>
    tryApiRequest<unknown>(`/events/${eventId}/rentals/${rentalId}/supplier-acceptance`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  recordRentalVenueReceipt: (
    eventId: string,
    rentalId: string,
    payload: RentalVenueReceipt,
  ) =>
    tryApiRequest<unknown>(`/events/${eventId}/rentals/${rentalId}/venue-receipt`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  recordRentalSupplierReturn: (
    eventId: string,
    rentalId: string,
    payload: RentalSupplierReturn,
  ) =>
    tryApiRequest<unknown>(`/events/${eventId}/rentals/${rentalId}/supplier-return`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // D03 & 4 Checkpoints: Loading Checklist, Venue Arrival, Event Hours, Warehouse Arrival & Return Checklist
  submitLoadingChecklist: (eventId: string, payload: LoadingChecklistSubmission) =>
    tryApiRequest<unknown>(`/dispatch/event/${eventId}/loading-checklist`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  confirmOutboundDeparture: (eventId: string, payload: OutboundDepartureConfirmation) =>
    tryApiRequest<unknown>(`/dispatch/event/${eventId}/outbound-departure`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  submitArrivalConfirmation: (eventId: string, payload: ArrivalConfirmation) =>
    tryApiRequest<unknown>(`/events/${eventId}/checkpoints/arrival`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  submitIncidentReport: (eventId: string, payload: FieldIncidentReport) =>
    tryApiRequest<unknown>(`/events/${eventId}/incident-reports`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  submitReturnChecklist: (eventId: string, payload: ReturnChecklistSubmission) =>
    tryApiRequest<unknown>(`/dispatch/event/${eventId}/return-checklist`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // D05: Resolution & Event Closeout
  resolveIncidentReport: (
    reportId: string,
    payload: {
      resolutionType: IssueResolutionType
      resolutionNotes: string
      resolvedByEmail: string
      resolvedByName: string
    },
  ) =>
    tryApiRequest<unknown>(`/incident-reports/${reportId}/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  closeWarehouseEvent: (
    eventId: string,
    payload: { closedByEmail: string; closedByName: string; notes: string },
  ) =>
    tryApiRequest<unknown>(`/events/${eventId}/warehouse-closeout`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
}

