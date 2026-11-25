/** Temporary Event Manager suppliers. Replace this source when Vendor Management is available. */
export type RentalCatalogVendor = {
  id: string
  company: string
  supplierType: string
  legacyCompanies?: string[]
}

// Retain IDs from the earlier catalog so saved supplier references stay valid.
export const rentalVendors: RentalCatalogVendor[] = [
  {
    id: "sample-audio",
    company: "Dalisay Soundworks",
    supplierType: "Audio supplier",
    legacyCompanies: ["Sample Audio Co."],
  },
  {
    id: "sample-av",
    company: "Hiraya Audiovisual",
    supplierType: "AV supplier",
    legacyCompanies: ["Sample AV Co."],
  },
  {
    id: "sample-lighting",
    company: "Sinag Stage Lighting",
    supplierType: "Lighting supplier",
    legacyCompanies: ["Sample Lighting Co."],
  },
  {
    id: "sample-equipment",
    company: "Bayanihan Equipment Rentals",
    supplierType: "Equipment rental supplier",
    legacyCompanies: ["Sample Equipment Co."],
  },
  {
    id: "sample-furniture",
    company: "Narra Tables & Chairs",
    supplierType: "Furniture rental supplier",
    legacyCompanies: ["Sample Furniture Co."],
  },
  {
    id: "sample-production",
    company: "Tanghalan Productions",
    supplierType: "Production supplier",
    legacyCompanies: ["Sample Production Co."],
  },
]

export function rentalCatalogOptions(vendors = rentalVendors) {
  return vendors.map((vendor) => ({
    value: vendor.id,
    label: `${vendor.company} — ${vendor.supplierType}`,
  }))
}
