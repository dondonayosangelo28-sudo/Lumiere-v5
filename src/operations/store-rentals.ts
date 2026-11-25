import { v51ContractApis } from "./apiClients"
import type {
  IssueResolutionType,
  RentalELetter,
  RentalSupplierAcceptance,
} from "./types"
import { mutateOperationsStore, type OpsActor } from "./store-core"

/**
 * D07 & Scenario 4 — Rental E-Letter & Booking Reference:
 * Recording a booking reference and preparing an e-letter keeps the rental status as
 * `Pending Confirmation` until explicit supplier acceptance is recorded.
 */
export function saveRentalELetterAndBookingRef(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    bookingReference: string
    deliveryLocation: string
    deliveryArrangements: string
    returnArrangements: string
    directToVenue: boolean
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    const eLetter: RentalELetter = {
      supplierName: rental.vendorName,
      supplierContact: rental.contact,
      eventTitle: order.eventTitle,
      eventDates: `${order.startDateTime} – ${order.endDateTime}`,
      venue: order.venue,
      itemsSummary: rental.itemName,
      quantity: rental.ApprovedRequestedQty,
      deliveryLocation: payload.deliveryLocation.trim() || order.venue,
      deliveryArrangements:
        payload.deliveryArrangements.trim() ||
        "Deliver directly to venue loading bay ahead of ingress schedule.",
      returnArrangements:
        payload.returnArrangements.trim() ||
        "Supplier pickup at venue post-event strike after Team Lead count.",
      preparedByEmail: actor.email,
      preparedByName: actor.name,
      preparedAt: new Date().toISOString(),
    }

    rental.bookingReference = payload.bookingReference.trim()
    rental.directToVenue = payload.directToVenue
    rental.eLetter = eLetter
    // Explicitly enforce D07/Scenario 4: booking reference alone does NOT confirm the rental
    if (!rental.supplierAcceptance) {
      rental.confirmationStatus = "Pending Confirmation"
    }

    void v51ContractApis.saveRentalELetter(payload.eventId, payload.rentalId, {
      bookingReference: rental.bookingReference,
      eLetter,
    })

    return { ok: true }
  })
}

/**
 * D07 & Scenario 4 — Record Explicit Supplier Acceptance:
 * Marks the rental `Confirmed` only after recording supplier acceptance (accepted e-letter,
 * written confirmation, or signed agreement) linked to the event's rental record.
 */
export function recordRentalSupplierAcceptance(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    evidenceType: RentalSupplierAcceptance["evidenceType"]
    referenceOrUrl: string
    notes: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    if (!rental.eLetter) {
      return {
        ok: false,
        error: "Prepare the Rental E-Letter before recording supplier acceptance.",
      }
    }
    if (!payload.referenceOrUrl.trim()) {
      return {
        ok: false,
        error: "Provide the accepted e-letter reference, signed agreement ID, or confirmation document link.",
      }
    }

    const acceptance: RentalSupplierAcceptance = {
      evidenceType: payload.evidenceType,
      referenceOrUrl: payload.referenceOrUrl.trim(),
      notes: payload.notes.trim() || "Supplier explicitly accepted rental e-letter terms and schedule.",
      recordedByEmail: actor.email,
      recordedByName: actor.name,
      recordedAt: new Date().toISOString(),
    }

    rental.supplierAcceptance = acceptance
    rental.confirmationStatus = "Confirmed"

    void v51ContractApis.confirmRentalAcceptance(payload.eventId, payload.rentalId, acceptance)
    return { ok: true }
  })
}

/**
 * D08 & Scenario 5, 7, 8 — Direct-to-Venue Rental Receipt Verification at Venue Arrival:
 * Only the currently designated Team Lead can verify the supplier's delivered items and quantities
 * at the venue and record any discrepancy against the rental record.
 */
export function recordDirectVenueRentalReceipt(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    deliveredQty: number
    discrepancyNotes: string
    photoUrl?: string
  },
): { ok: true } | { ok: false; error: string } {
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }

    if (!order.teamLeadEmail || order.teamLeadEmail.toLowerCase() !== actor.email.toLowerCase()) {
      return {
        ok: false,
        error: `Only the currently designated Team Lead (${order.teamLeadName || "Unassigned"}) can record direct-to-venue rental receipt confirmations.`,
      }
    }

    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    const hasDiscrepancy =
      payload.deliveredQty !== rental.ApprovedRequestedQty ||
      Boolean(payload.discrepancyNotes.trim())

    rental.venueReceipt = {
      deliveredQty: Math.max(0, payload.deliveredQty),
      hasDiscrepancy,
      discrepancyNotes:
        payload.discrepancyNotes.trim() ||
        (hasDiscrepancy
          ? `Delivered ${payload.deliveredQty} of ${rental.ApprovedRequestedQty} requested units.`
          : "Full requested rental quantity delivered directly to venue in good condition."),
      photoUrl: payload.photoUrl?.trim(),
      verifiedByEmail: actor.email.toLowerCase(),
      verifiedByName: actor.name,
      verifiedAt: new Date().toISOString(),
      resolutionStatus: hasDiscrepancy ? "Pending" : "Resolved",
    }

    void v51ContractApis.recordRentalVenueReceipt(payload.eventId, payload.rentalId, rental.venueReceipt)
    return { ok: true }
  })
}

/**
 * D08 & Scenario 5, 6, 7, 8 — Direct-to-Venue Rental Supplier Return Verification:
 * After the event, the current Team Lead verifies the items handed back to the supplier
 * and records any missing or damaged items. Any discrepancy blocks event closeout until resolved.
 */
export function recordDirectVenueRentalReturn(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    handedBackQty: number
    missingQty: number
    damagedQty: number
    discrepancyNotes: string
    photoUrl?: string
  },
): { ok: true } | { ok: false; error: string } {
  if (
    !Number.isInteger(payload.handedBackQty) ||
    payload.handedBackQty < 0 ||
    !Number.isInteger(payload.missingQty) ||
    payload.missingQty < 0 ||
    !Number.isInteger(payload.damagedQty) ||
    payload.damagedQty < 0
  ) {
    return {
      ok: false,
      error: "Handed-back, missing, and damaged rental quantities must be nonnegative whole numbers.",
    }
  }

  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    if (order.warehouseClosed) {
      return {
        ok: false,
        error: "Cannot modify rental return confirmation after Warehouse event accountability is closed.",
      }
    }

    if (!order.teamLeadEmail || order.teamLeadEmail.toLowerCase() !== actor.email.toLowerCase()) {
      return {
        ok: false,
        error: `Only the currently designated Team Lead (${order.teamLeadName || "Unassigned"}) can submit rental supplier return confirmations.`,
      }
    }

    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }
    if (rental.supplierReturn?.resolutionStatus === "Resolved") {
      return {
        ok: false,
        error: "Supplier return discrepancy has already been resolved by Warehouse and cannot be overwritten.",
      }
    }

    const baselineQty = rental.venueReceipt?.deliveredQty ?? rental.ApprovedRequestedQty
    if (payload.handedBackQty > baselineQty) {
      return {
        ok: false,
        error: `Handed-back quantity (${payload.handedBackQty}) cannot exceed the delivered baseline (${baselineQty}).`,
      }
    }
    if (payload.damagedQty > payload.handedBackQty) {
      return {
        ok: false,
        error: `Damaged quantity (${payload.damagedQty}) cannot exceed handed-back quantity (${payload.handedBackQty}); damaged units returned to the supplier are included in Handed Back Qty.`,
      }
    }
    if (payload.handedBackQty + payload.missingQty !== baselineQty) {
      return {
        ok: false,
        error: `Handed-back quantity (${payload.handedBackQty}) plus missing quantity (${payload.missingQty}) must equal the delivered baseline (${baselineQty}).`,
      }
    }

    const hasDiscrepancy =
      payload.missingQty > 0 ||
      payload.damagedQty > 0 ||
      payload.handedBackQty < baselineQty ||
      Boolean(payload.discrepancyNotes.trim())

    if (hasDiscrepancy && !payload.discrepancyNotes.trim()) {
      return {
        ok: false,
        error: "Describe the missing or damaged rental items handed back to the supplier.",
      }
    }

    rental.supplierReturn = {
      handedBackQty: payload.handedBackQty,
      missingQty: payload.missingQty,
      damagedQty: payload.damagedQty,
      hasDiscrepancy,
      discrepancyNotes:
        payload.discrepancyNotes.trim() ||
        "All supplier rental items handed back complete and undamaged.",
      photoUrl: payload.photoUrl?.trim(),
      verifiedByEmail: actor.email.toLowerCase(),
      verifiedByName: actor.name,
      verifiedAt: new Date().toISOString(),
      resolutionStatus: hasDiscrepancy ? "Pending" : "Not Applicable",
    }

    void v51ContractApis.recordRentalSupplierReturn(payload.eventId, payload.rentalId, rental.supplierReturn)
    return { ok: true }
  })
}

/**
 * D05 & D08 & Scenario 5, 6 — Warehouse resolves a Direct-to-Venue Rental Receipt or Return Discrepancy:
 */
export function resolveRentalDiscrepancy(
  actor: OpsActor,
  payload: {
    eventId: string
    rentalId: string
    stage: "receipt" | "return"
    resolutionType: IssueResolutionType
    resolutionNotes: string
  },
): { ok: true } | { ok: false; error: string } {
  if (!payload.resolutionNotes.trim()) {
    return { ok: false, error: "Record the supplier discrepancy resolution details." }
  }
  return mutateOperationsStore((draft) => {
    const order = draft.orderRequests.find((o) => o.eventId === payload.eventId)
    if (!order) return { ok: false, error: "Event Order Request not found." }
    const rental = order.rentals.find((r) => r.id === payload.rentalId)
    if (!rental) return { ok: false, error: "Rental record not found." }

    const now = new Date().toISOString()
    if (payload.stage === "receipt" && rental.venueReceipt) {
      rental.venueReceipt.resolutionStatus = "Resolved"
      rental.venueReceipt.resolutionType = payload.resolutionType
      rental.venueReceipt.resolutionNotes = payload.resolutionNotes.trim()
      rental.venueReceipt.resolvedByName = actor.name
      rental.venueReceipt.resolvedAt = now
    } else if (payload.stage === "return" && rental.supplierReturn) {
      rental.supplierReturn.resolutionStatus = "Resolved"
      rental.supplierReturn.resolutionType = payload.resolutionType
      rental.supplierReturn.resolutionNotes = payload.resolutionNotes.trim()
      rental.supplierReturn.resolvedByName = actor.name
      rental.supplierReturn.resolvedAt = now
    }

    return { ok: true }
  })
}
