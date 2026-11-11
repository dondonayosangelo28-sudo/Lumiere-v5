import type { Rental } from "./model"
import { rentalVendors, type RentalCatalogVendor } from "./rental-catalog"

const normalized = (name: string) => name.trim().toLocaleLowerCase()

/** Recognize old IDs and company names without rewriting or merging saved records. */
export function isSupplierAdded(
  rentals: Rental[],
  vendorId: string,
  vendors = rentalVendors,
) {
  const vendor = vendors.find((entry) => entry.id === vendorId)
  if (!vendor) return false
  const names = [vendor.company, ...(vendor.legacyCompanies ?? [])].map(
    normalized,
  )
  return rentals.some((entry) => {
    if (entry.vendorId) return entry.vendorId === vendorId
    const company =
      entry.snapshot?.vendorCompany ??
      entry.vendorName ??
      (entry.entryType === "supplier" ? entry.name : "")
    return !!company && names.includes(normalized(company))
  })
}

/** Supplier discussion entries have no equipment selection or quote inclusion. */
export function addEventSupplier(
  rentals: Rental[],
  vendorId: string,
  vendors: RentalCatalogVendor[] = rentalVendors,
): Rental[] {
  const vendor = vendors.find((entry) => entry.id === vendorId)
  if (!vendor) throw new Error("Choose an available rental supplier.")
  if (isSupplierAdded(rentals, vendorId, vendors)) return rentals
  return [
    ...rentals,
    {
      id: crypto.randomUUID(),
      entryType: "supplier",
      vendorId: vendor.id,
      name: vendor.company,
      vendorName: vendor.company,
      supplierType: vendor.supplierType,
      snapshot: {
        itemName: vendor.company,
        vendorCompany: vendor.company,
        supplierType: vendor.supplierType,
      },
      note: "",
      // Keep the legacy storage shape; new discussion entries never enter quote calculations.
      quantity: 1,
      optional: true,
      selected: false,
    },
  ]
}

export function rentalDisplay(entry: Rental) {
  return {
    itemName: entry.snapshot?.itemName ?? entry.name,
    vendorCompany: entry.snapshot?.vendorCompany ?? entry.vendorName,
    supplierType: entry.snapshot?.supplierType ?? entry.supplierType,
  }
}
