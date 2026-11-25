import {
  rentalVendors,
  type RentalCatalogVendor,
} from "../features/event-manager/rentals/rental-catalog"
import { mutateOperationsStore, type OpsActor } from "./store-core"
import type {
  OperationsStoreState,
  VendorRecord,
  VendorStatus,
  VendorType,
} from "./types"

export const RENTAL_CATEGORIES = [
  "Audio & Sound",
  "Audiovisual",
  "Lighting & SFX",
  "Equipment Rental",
  "Furniture & Decor",
  "Production Support",
] as const

const SEED_VENDOR_DETAILS: Record<
  string,
  {
    contactPerson: string
    category: string
    specialty: string
    email: string
    phone: string
    location: string
    leadTime: string
  }
> = {
  "sample-audio": {
    contactPerson: "Marco Santos",
    category: "Audio & Sound",
    specialty: "Audio supplier — live sound systems, mics, and mixers",
    email: "dispatch@dalisaysound.ph",
    phone: "+63 917 555 0101",
    location: "Makati",
    leadTime: "24h",
  },
  "sample-av": {
    contactPerson: "Elena Reyes",
    category: "Audiovisual",
    specialty: "AV supplier — LED walls, projection, and media playback",
    email: "bookings@hirayaav.ph",
    phone: "+63 917 555 0102",
    location: "Taguig",
    leadTime: "48h",
  },
  "sample-lighting": {
    contactPerson: "Carlos Mendoza",
    category: "Lighting & SFX",
    specialty: "Lighting supplier — stage wash, beams, and atmosphere",
    email: "ops@sinaglighting.ph",
    phone: "+63 917 555 0103",
    location: "Quezon City",
    leadTime: "24h",
  },
  "sample-equipment": {
    contactPerson: "Roberto Lim",
    category: "Equipment Rental",
    specialty: "Equipment rental supplier — staging, power, and rigging",
    email: "rentals@bayanihanequip.ph",
    phone: "+63 917 555 0104",
    location: "Pasig",
    leadTime: "48h",
  },
  "sample-furniture": {
    contactPerson: "Sofia Castillo",
    category: "Furniture & Decor",
    specialty: "Furniture rental supplier — banquet seating and tables",
    email: "orders@narratables.ph",
    phone: "+63 917 555 0105",
    location: "Mandaluyong",
    leadTime: "24h",
  },
  "sample-production": {
    contactPerson: "Andrea Tan",
    category: "Production Support",
    specialty: "Production supplier — custom scenic builds and fabrication",
    email: "prod@tanghalan.ph",
    phone: "+63 917 555 0106",
    location: "Manila",
    leadTime: "72h",
  },
}

export function buildSeedVendors(): VendorRecord[] {
  const now = "2026-04-13T18:00:00.000Z"
  return rentalVendors.map((rv) => {
    const details = SEED_VENDOR_DETAILS[rv.id]
    return {
      id: rv.id,
      name: rv.company,
      contactPerson: details?.contactPerson ?? "Operations Desk",
      category: details?.category ?? rv.supplierType,
      specialty: details?.specialty ?? rv.supplierType,
      email: details?.email ?? "",
      phone: details?.phone ?? "",
      location: details?.location ?? "Metro Manila",
      leadTime: details?.leadTime ?? "24h",
      status: "Active",
      ...(rv.legacyCompanies ? { legacyCompanies: [...rv.legacyCompanies] } : {}),
      createdAt: now,
      updatedAt: now,
    }
  })
}

export type VendorInput = {
  name: string
  contactPerson: string
  vendorType?: VendorType
  category: string
  specialty: string
  email: string
  phone: string
  location: string
  leadTime?: string
  status: VendorStatus
}

export type VendorValidationErrors = Partial<
  Record<keyof VendorInput, string>
>

const VALID_STATUSES: VendorStatus[] = ["Active", "On Hold", "Inactive"]
const VALID_VENDOR_TYPES: VendorType[] = ["Event Asset", "Rental Asset"]

export function validateVendorInput(payload: VendorInput): {
  errors: VendorValidationErrors
  parsed?: VendorInput & { vendorType: VendorType }
} {
  const errors: VendorValidationErrors = {}
  const name = String(payload.name ?? "").trim()
  const contactPerson = String(payload.contactPerson ?? "").trim()
  const vendorType: VendorType = VALID_VENDOR_TYPES.includes(
    payload.vendorType as VendorType,
  )
    ? (payload.vendorType as VendorType)
    : "Event Asset"
  const category = String(payload.category ?? "").trim()
  const specialty = String(payload.specialty ?? "").trim()
  const email = String(payload.email ?? "").trim()
  const phone = String(payload.phone ?? "").trim()
  const location = String(payload.location ?? "").trim()
  const leadTime = String(payload.leadTime ?? "").trim()
  const status: VendorStatus = VALID_STATUSES.includes(payload.status)
    ? payload.status
    : "Active"

  if (!name) errors.name = "Enter a vendor name."
  if (!category) {
    errors.category =
      vendorType === "Rental Asset"
        ? "Select a rental category."
        : "Enter a category."
  }
  if (!contactPerson) errors.contactPerson = "Enter a contact person."
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid contact email."
  }

  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  return {
    errors,
    parsed: {
      name,
      contactPerson,
      vendorType,
      category,
      specialty: specialty || category,
      email,
      phone,
      location: location || "Not specified",
      leadTime,
      status,
    },
  }
}

export function isVendorReferenced(
  state: OperationsStoreState,
  vendorId: string,
): boolean {
  if (state.inventory.some((item) => item.primaryVendorId === vendorId)) {
    return true
  }
  if (
    state.orderRequests.some((order) =>
      order.rentals.some((rental) => rental.vendorId === vendorId),
    )
  ) {
    return true
  }
  const vendor = (state.vendors ?? []).find((v) => v.id === vendorId)
  if (vendor) {
    const names = new Set(
      [vendor.name, ...(vendor.legacyCompanies ?? [])]
        .map((n) => n.trim().toLowerCase())
        .filter(Boolean),
    )
    if (
      state.acquisitions.some((acq) =>
        names.has(acq.supplierName.trim().toLowerCase()),
      )
    ) {
      return true
    }
  }
  return false
}

function slugifyVendorId(name: string, existingIds: Set<string>): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
  const prefix = `vnd-${baseSlug || "supplier"}`
  if (!existingIds.has(prefix)) return prefix
  let counter = 2
  while (existingIds.has(`${prefix}-${counter}`)) {
    counter += 1
  }
  return `${prefix}-${counter}`
}

export function createVendor(
  actor: OpsActor,
  payload: VendorInput,
):
  | { ok: true; vendor: VendorRecord }
  | { ok: false; error: string; errors?: VendorValidationErrors } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only Warehouse Operations Managers can create vendors.",
    }
  }
  const validation = validateVendorInput(payload)
  if (!validation.parsed) {
    const first =
      Object.values(validation.errors).find(Boolean) ??
      "Check the highlighted fields."
    return { ok: false, error: first, errors: validation.errors }
  }
  const { parsed } = validation

  return mutateOperationsStore((draft) => {
    const vendors = Array.isArray(draft.vendors) ? draft.vendors : []
    const duplicate = vendors.some(
      (v) => v.name.trim().toLowerCase() === parsed.name.toLowerCase(),
    )
    if (duplicate) {
      return {
        ok: false as const,
        error: `A vendor named "${parsed.name}" already exists.`,
        errors: { name: "Vendor name must be unique." },
      }
    }

    const now = new Date().toISOString()
    const id = slugifyVendorId(
      parsed.name,
      new Set(vendors.map((v) => v.id)),
    )
    const vendor: VendorRecord = {
      id,
      ...parsed,
      status: "Active",
      leadTime: parsed.leadTime ?? "",
      createdAt: now,
      updatedAt: now,
    }
    draft.vendors = [vendor, ...vendors]
    return { ok: true as const, vendor }
  })
}

export function updateVendor(
  actor: OpsActor,
  vendorId: string,
  payload: VendorInput,
):
  | { ok: true; vendor: VendorRecord }
  | { ok: false; error: string; errors?: VendorValidationErrors } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only Warehouse Operations Managers can update vendors.",
    }
  }
  const validation = validateVendorInput(payload)
  if (!validation.parsed) {
    const first =
      Object.values(validation.errors).find(Boolean) ??
      "Check the highlighted fields."
    return { ok: false, error: first, errors: validation.errors }
  }
  const { parsed } = validation

  return mutateOperationsStore((draft) => {
    const vendors = Array.isArray(draft.vendors) ? draft.vendors : []
    const existing = vendors.find((v) => v.id === vendorId)
    if (!existing) {
      return { ok: false as const, error: "Vendor not found." }
    }
    const duplicate = vendors.some(
      (v) =>
        v.id !== vendorId &&
        v.name.trim().toLowerCase() === parsed.name.toLowerCase(),
    )
    if (duplicate) {
      return {
        ok: false as const,
        error: `Another vendor named "${parsed.name}" already exists.`,
        errors: { name: "Vendor name must be unique." },
      }
    }

    const now = new Date().toISOString()
    existing.name = parsed.name
    existing.contactPerson = parsed.contactPerson
    existing.vendorType = parsed.vendorType
    existing.category = parsed.category
    existing.specialty = parsed.specialty
    existing.email = parsed.email
    existing.phone = parsed.phone
    existing.location = parsed.location
    if (parsed.leadTime !== undefined && parsed.leadTime !== "") {
      existing.leadTime = parsed.leadTime
    }
    existing.status = parsed.status
    existing.updatedAt = now
    if (parsed.status !== "Inactive") {
      delete existing.archivedAt
      delete existing.archivedByEmail
      delete existing.archivedByName
    }
    return { ok: true as const, vendor: { ...existing } }
  })
}

export function deleteOrArchiveVendor(
  actor: OpsActor,
  vendorId: string,
):
  | { ok: true; archived: boolean; vendor?: VendorRecord }
  | { ok: false; error: string } {
  if (actor.role !== "Warehouse Operations Manager") {
    return {
      ok: false,
      error: "Only Warehouse Operations Managers can remove or archive vendors.",
    }
  }
  return mutateOperationsStore((draft) => {
    const vendors = Array.isArray(draft.vendors) ? draft.vendors : []
    const existing = vendors.find((v) => v.id === vendorId)
    if (!existing) {
      return { ok: false as const, error: "Vendor not found." }
    }

    if (isVendorReferenced(draft, vendorId)) {
      const now = new Date().toISOString()
      existing.status = "Inactive"
      existing.archivedAt = existing.archivedAt ?? now
      existing.archivedByEmail = actor.email.toLowerCase()
      existing.archivedByName = actor.name
      existing.updatedAt = now
      return { ok: true as const, archived: true, vendor: { ...existing } }
    }

    draft.vendors = vendors.filter((v) => v.id !== vendorId)
    return { ok: true as const, archived: false }
  })
}

export function getVendorSelectOptions(
  vendors: VendorRecord[],
  currentSelectedId?: string,
  options?: { vendorType?: VendorType },
): { value: string; label: string }[] {
  const source: VendorRecord[] =
    vendors.length > 0 ? vendors : buildSeedVendors()
  const targetType = options?.vendorType ?? "Event Asset"
  const active = source.filter(
    (v) =>
      v.status === "Active" &&
      (targetType === "Event Asset"
        ? v.vendorType !== "Rental Asset"
        : v.vendorType !== "Event Asset"),
  )
  const result = active.map((v) => ({
    value: v.id,
    label: `${v.name} — ${v.category}`,
  }))
  if (
    currentSelectedId &&
    !active.some((v) => v.id === currentSelectedId)
  ) {
    const linked = source.find((v) => v.id === currentSelectedId)
    if (linked) {
      result.unshift({
        value: linked.id,
        label: `${linked.name} — ${linked.category} (${linked.status})`,
      })
    }
  }
  return result
}

export function getEventManagerVendorList(
  vendors?: VendorRecord[],
): RentalCatalogVendor[] {
  const source =
    vendors && vendors.length > 0 ? vendors : buildSeedVendors()
  return source
    .filter((v) => v.status === "Active" && v.vendorType !== "Event Asset")
    .map((v) => ({
      id: v.id,
      company: v.name,
      supplierType: v.category,
      ...(v.legacyCompanies ? { legacyCompanies: v.legacyCompanies } : {}),
    }))
}
