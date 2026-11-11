import { useId, useState } from "react"
import { FilePenLine, X } from "lucide-react"
import { Badge, Button, Input } from "../../components/ui"
import type { EventRentalRecord } from "../../operations/types"
import { rentalDisplay } from "./event-rentals"
import type { Rental } from "./model"
import { textareaCls } from "./shared"

export default function RentalEntry({
  entry,
  readOnly,
  warehouseRental,
  onChange,
  onRemove,
}: {
  entry: Rental
  readOnly: boolean
  warehouseRental?: EventRentalRecord
  onChange: (patch: Partial<Rental>) => void
  onRemove: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const noteId = useId()
  const details = rentalDisplay(entry)
  const company = details.vendorCompany || details.itemName
  const quantity = warehouseRental?.ApprovedRequestedQty ?? Math.max(1, entry.quantity || 1)
  const confirmationStatus =
    warehouseRental?.confirmationStatus ?? entry.confirmationStatus ?? "Pending Confirmation"
  const bookingReference = warehouseRental?.bookingReference || entry.bookingReference
  const itemDescription =
    warehouseRental?.itemName || entry.itemName || entry.snapshot?.itemName || ""
  const directToVenue = warehouseRental?.directToVenue ?? entry.directToVenue ?? true

  return (
    <li className="border-b border-line py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-words text-sm font-medium">{company}</span>
            <Badge tone={confirmationStatus === "Confirmed" ? "success" : "warning"}>
              {confirmationStatus}
            </Badge>
            {directToVenue && (
              <Badge tone="neutral">Direct-to-venue delivery</Badge>
            )}
          </div>
          <div className="mt-1 break-words text-xs text-muted-foreground">
            {details.supplierType || "Supplier type not recorded"}
            {bookingReference ? ` · Booking ref: ${bookingReference}` : ""}
          </div>
          {readOnly ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-foreground">
              <span>
                Approved rental quantity:{" "}
                <strong className="font-semibold tabular-nums">{quantity}</strong>
              </span>
              {itemDescription && itemDescription !== company && (
                <span>
                  Rental item: <strong className="font-semibold">{itemDescription}</strong>
                </span>
              )}
              {warehouseRental?.supplierAcceptance && (
                <span className="text-muted-foreground">
                  Accepted via {warehouseRental.supplierAcceptance.evidenceType} (
                  {warehouseRental.supplierAcceptance.referenceOrUrl})
                </span>
              )}
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Rental item / package description
                </label>
                <Input
                  value={entry.itemName ?? ""}
                  placeholder={`e.g. ${details.supplierType || "Rental package"} for event`}
                  onChange={(e) => onChange({ itemName: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Requested qty
                </label>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={entry.quantity || 1}
                  onChange={(e) =>
                    onChange({ quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })
                  }
                />
              </div>
            </div>
          )}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              icon={FilePenLine}
              aria-expanded={noteOpen}
              aria-controls={noteId}
              onClick={() => setNoteOpen((value) => !value)}
            >
              {noteOpen ? "Hide note" : entry.note ? "Edit note" : "Add note"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              icon={X}
              aria-label={`Remove ${company}`}
              onClick={onRemove}
            >
              Remove
            </Button>
          </div>
        )}
      </div>
      {(noteOpen || (readOnly && !!entry.note)) && (
        <div id={noteId} className="mt-3">
          <textarea
            aria-label={`Internal note for ${company}`}
            className={textareaCls}
            rows={3}
            value={entry.note ?? ""}
            readOnly={readOnly}
            placeholder="Discussion notes, delivery arrangements, or instructions…"
            onChange={(event) => onChange({ note: event.target.value })}
          />
          {!readOnly && !!entry.note && (
            <div className="mt-1 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange({ note: "" })}
              >
                Clear note
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
