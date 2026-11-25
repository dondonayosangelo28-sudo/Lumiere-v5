import { useMemo, useState, type FormEvent } from "react"
import { Ban, Check, CheckCircle2, ChevronDown, Pencil, Plus, Search, Store, Trash2 } from "lucide-react"
import { fieldCls } from "../../../components/admin/AdminKit"
import Modal from "../../../components/overlay/Modal"
import Dropdown from "../../../components/ui/Dropdown"
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
import { FieldError } from "../../event-manager/shared"
import {
  notifyMutationResult,
  useNotify,
} from "../../ground-crew/ground-crew-shared"
import {
  createVendor,
  deleteOrArchiveVendor,
  RENTAL_CATEGORIES,
  updateVendor,
  useOperationsStore,
  type OpsActor,
  type VendorInput,
  type VendorRecord,
  type VendorStatus,
  type VendorType,
  type VendorValidationErrors,
} from "../../../operations/store"

type VendorFilter = "All" | VendorStatus

const FILTER_OPTIONS: VendorFilter[] = ["All", "Active", "On Hold", "Inactive"]

const EMPTY_DRAFT: VendorInput = {
  name: "",
  contactPerson: "",
  vendorType: "Event Asset",
  category: "",
  specialty: "",
  email: "",
  phone: "",
  location: "",
  status: "Active",
}

function statusTone(status: VendorStatus): "success" | "warning" | "neutral" {
  if (status === "Active") return "success"
  if (status === "On Hold") return "warning"
  return "neutral"
}

export default function VendorsModule({ actor }: { actor: OpsActor }) {
  const state = useOperationsStore()
  const notify = useNotify()

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<VendorFilter>("All")
  const [modalOpen, setModalOpen] = useState(false)
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null)
  const [draft, setDraft] = useState<VendorInput>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<VendorValidationErrors>({})
  const [submitError, setSubmitError] = useState("")

  const vendors = state.vendors ?? []

  const counts = useMemo(
    () => ({
      All: vendors.length,
      Active: vendors.filter((v) => v.status === "Active").length,
      "On Hold": vendors.filter((v) => v.status === "On Hold").length,
      Inactive: vendors.filter((v) => v.status === "Inactive").length,
    }),
    [vendors],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vendors.filter((v) => {
      if (statusFilter !== "All" && v.status !== statusFilter) return false
      if (!q) return true
      const haystack = [
        v.name,
        v.contactPerson,
        v.category,
        v.specialty,
        v.location,
        v.email,
        v.phone,
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [vendors, statusFilter, query])

  function openAddModal() {
    setEditingVendorId(null)
    setDraft(EMPTY_DRAFT)
    setErrors({})
    setSubmitError("")
    setModalOpen(true)
  }

  function openEditModal(vendor: VendorRecord) {
    const inferredType: VendorType =
      vendor.vendorType ??
      (RENTAL_CATEGORIES.includes(
        vendor.category as (typeof RENTAL_CATEGORIES)[number],
      )
        ? "Rental Asset"
        : "Event Asset")
    setEditingVendorId(vendor.id)
    setDraft({
      name: vendor.name,
      contactPerson: vendor.contactPerson,
      vendorType: inferredType,
      category: vendor.category,
      specialty: vendor.specialty,
      email: vendor.email,
      phone: vendor.phone,
      location: vendor.location,
      leadTime: vendor.leadTime,
      status: vendor.status,
    })
    setErrors({})
    setSubmitError("")
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingVendorId(null)
    setErrors({})
    setSubmitError("")
  }

  function handleSave(e: FormEvent) {
    e.preventDefault()
    setSubmitError("")
    const res = editingVendorId
      ? updateVendor(actor, editingVendorId, draft)
      : createVendor(actor, draft)

    if (!res.ok) {
      if ("errors" in res && res.errors) {
        setErrors(res.errors)
      }
      setSubmitError(res.error)
      notifyMutationResult(notify, res)
      return
    }

    notifyMutationResult(
      notify,
      res,
      editingVendorId
        ? `Updated vendor "${res.vendor.name}".`
        : `Added vendor "${res.vendor.name}".`,
    )
    closeModal()
  }

  function handleDeleteOrArchive(vendor: VendorRecord) {
    const res = deleteOrArchiveVendor(actor, vendor.id)
    if (!res.ok) {
      notifyMutationResult(notify, res)
      return
    }
    notifyMutationResult(
      notify,
      res,
      res.archived
        ? `Archived "${vendor.name}" (Inactive) to preserve linked inventory and rental history.`
        : `Deleted vendor "${vendor.name}".`,
    )
  }

  function handleSetStatus(vendor: VendorRecord, nextStatus: VendorStatus) {
    const res = updateVendor(actor, vendor.id, {
      name: vendor.name,
      contactPerson: vendor.contactPerson,
      category: vendor.category,
      specialty: vendor.specialty,
      email: vendor.email,
      phone: vendor.phone,
      location: vendor.location,
      leadTime: vendor.leadTime,
      status: nextStatus,
    })
    notifyMutationResult(
      notify,
      res,
      res.ok ? `Marked "${vendor.name}" as ${nextStatus}.` : undefined,
    )
  }

  function vendorMenuItems(vendor: VendorRecord) {
    return [
      {
        label: "Edit",
        icon: Pencil,
        onClick: () => openEditModal(vendor),
      },
      vendor.status === "Inactive"
        ? {
            label: "Set Active",
            icon: CheckCircle2,
            onClick: () => handleSetStatus(vendor, "Active"),
          }
        : {
            label: "Set Inactive",
            icon: Ban,
            onClick: () => handleSetStatus(vendor, "Inactive"),
          },
      {
        label: "Delete",
        icon: Trash2,
        danger: true,
        onClick: () => handleDeleteOrArchive(vendor),
      },
    ]
  }

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={["Dashboard", "Vendors"]}
        title="Vendor Management"
        subtitle="Vendor directory and preferred-supplier routing."
        actions={
          <div className="sm:pt-3">
            <Button type="button" icon={Plus} onClick={openAddModal}>
              Add Vendor
            </Button>
          </div>
        }
      />

      {/* Filter Pills (left) + Search (right) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Vendor status filter"
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = statusFilter === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setStatusFilter(opt)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                  active
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-line bg-card text-muted-foreground hover:bg-fg/[0.04] hover:text-foreground",
                )}
              >
                <span>{opt}</span>
                <span className="opacity-75">({counts[opt]})</span>
              </button>
            )
          })}
        </div>

        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendors, category, city, specialty..."
            aria-label="Search vendors"
            className="pl-9"
          />
        </div>
      </div>

      {/* Empty States or Directory */}
      {vendors.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Store className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <div className="text-sm font-semibold text-foreground">
            No vendors registered yet
          </div>
          <p className="text-xs text-muted-foreground">
            Add approved suppliers to track categories, specialties, lead times, and preferred routing.
          </p>
          <div className="pt-1">
            <Button type="button" icon={Plus} onClick={openAddModal}>
              Add Vendor
            </Button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Search className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
          <div className="text-sm font-semibold text-foreground">
            No matching vendors found
          </div>
          <p className="text-xs text-muted-foreground">
            Try adjusting your search keywords or status filter.
          </p>
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQuery("")
                setStatusFilter("All")
              }}
            >
              Clear filters
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-fg/[0.02] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3.5">Vendor</th>
                    <th className="px-5 py-3.5">Category</th>
                    <th className="px-5 py-3.5">Specialty</th>
                    <th className="px-5 py-3.5">Contact</th>
                    <th className="px-5 py-3.5">Location</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((vendor) => (
                    <tr
                      key={vendor.id}
                      className="transition-colors hover:bg-fg/[0.02]"
                    >
                      <td className="px-5 py-4 align-top">
                        <div className="font-semibold text-foreground">
                          {vendor.name}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {vendor.contactPerson}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top text-foreground">
                        {vendor.category}
                      </td>
                      <td className="px-5 py-4 align-top text-muted-foreground max-w-xs">
                        {vendor.specialty}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="text-foreground">
                          {vendor.email || "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {vendor.phone || "—"}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top text-foreground">
                        {vendor.location}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <Badge tone={statusTone(vendor.status)}>
                          {vendor.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 align-top text-right">
                        <div className="inline-flex justify-end">
                          <RowMenu items={vendorMenuItems(vendor)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((vendor) => (
              <Card key={vendor.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-foreground text-sm">
                      {vendor.name}
                    </div>
                    <div className="text-muted-foreground">
                      {vendor.contactPerson} · {vendor.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(vendor.status)}>
                      {vendor.status}
                    </Badge>
                    <RowMenu items={vendorMenuItems(vendor)} />
                  </div>
                </div>
                <div className="text-muted-foreground">{vendor.specialty}</div>
                <div className="grid grid-cols-1 gap-1.5 pt-1 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Location: </span>
                    <span className="text-foreground">{vendor.location}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Contact: </span>
                    <span className="text-foreground">
                      {[vendor.email, vendor.phone].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Add / Edit Vendor Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingVendorId ? "Edit Vendor" : "Add Vendor"}
      >
        <form id="vendor-form" onSubmit={handleSave} className="space-y-3.5">
          <p className="text-xs text-muted-foreground">
            {editingVendorId
              ? "Update supplier contact details or availability status."
              : "Register a supplier in Warehouse Vendor Management."}
          </p>
          {submitError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
              {submitError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Field label={editingVendorId ? "Vendor Name *" : "Vendor Name"}>
                <Input
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value })
                    setErrors((prev) => ({ ...prev, name: undefined }))
                  }}
                  placeholder="e.g. Dalisay Soundworks"
                  aria-label="Vendor Name"
                />
              </Field>
              <FieldError id="vendor-err-name" text={errors.name} />
            </div>

            <div>
              <Field
                label={editingVendorId ? "Contact Person *" : "Contact Person"}
              >
                <Input
                  value={draft.contactPerson}
                  onChange={(e) => {
                    setDraft({ ...draft, contactPerson: e.target.value })
                    setErrors((prev) => ({ ...prev, contactPerson: undefined }))
                  }}
                  placeholder="e.g. Marco Santos"
                  aria-label="Contact Person"
                />
              </Field>
              <FieldError id="vendor-err-contact" text={errors.contactPerson} />
            </div>

            <div className="sm:col-span-2 pt-1">
              {(() => {
                const isRental =
                  (draft.vendorType ?? "Event Asset") === "Rental Asset"
                return (
                  <label className="inline-flex cursor-pointer items-center gap-2.5 text-[14px] font-medium text-foreground">
                    <input
                      type="checkbox"
                      aria-label="Mark as rental"
                      checked={isRental}
                      onChange={(e) => {
                        const nextType: VendorType = e.target.checked
                          ? "Rental Asset"
                          : "Event Asset"
                        const isKnownRental = RENTAL_CATEGORIES.includes(
                          draft.category as (typeof RENTAL_CATEGORIES)[number],
                        )
                        setDraft({
                          ...draft,
                          vendorType: nextType,
                          category:
                            nextType === "Rental Asset" && !isKnownRental
                              ? ""
                              : draft.category,
                        })
                        setErrors((prev) => ({
                          ...prev,
                          vendorType: undefined,
                          category: undefined,
                        }))
                      }}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={cx(
                        "grid size-4 shrink-0 place-items-center rounded-sm border border-line transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg",
                        isRental ? "bg-invert text-invert-fg" : "bg-chip",
                      )}
                    >
                      {isRental && <Check size={11} strokeWidth={3} />}
                    </span>
                    Mark as rental
                  </label>
                )
              })()}
            </div>

            <div className="sm:col-span-2">
              {(draft.vendorType ?? "Event Asset") === "Rental Asset" ? (
                <Field
                  label={
                    editingVendorId ? "Rental Category *" : "Rental Category"
                  }
                >
                  <div className="relative">
                    <Dropdown
                      aria-label="Rental Category"
                      required
                      value={draft.category}
                      onChange={(e) => {
                        setDraft({ ...draft, category: e.target.value })
                        setErrors((prev) => ({ ...prev, category: undefined }))
                      }}
                      className={cx(
                        fieldCls,
                        "appearance-none pr-9 text-left",
                        errors.category && "border-red-400",
                      )}
                    >
                      <option value="">Select a rental category…</option>
                      {RENTAL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      {draft.category &&
                        !RENTAL_CATEGORIES.includes(
                          draft.category as (typeof RENTAL_CATEGORIES)[number],
                        ) && (
                          <option value={draft.category}>{draft.category}</option>
                        )}
                    </Dropdown>
                    <ChevronDown
                      size={16}
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </Field>
              ) : (
                <Field label={editingVendorId ? "Category *" : "Category"}>
                  <Input
                    value={draft.category}
                    onChange={(e) => {
                      setDraft({ ...draft, category: e.target.value })
                      setErrors((prev) => ({ ...prev, category: undefined }))
                    }}
                    placeholder="e.g. Staging & Trussing"
                    aria-label="Category"
                  />
                </Field>
              )}
              <FieldError id="vendor-err-category" text={errors.category} />
            </div>

            <div className="sm:col-span-2">
              <Field label="Specialty">
                <Input
                  value={draft.specialty}
                  onChange={(e) =>
                    setDraft({ ...draft, specialty: e.target.value })
                  }
                  placeholder="e.g. Line array audio, trussing, and velvet staging"
                  aria-label="Specialty"
                />
              </Field>
            </div>

            <div>
              <Field label="Contact Email">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => {
                    setDraft({ ...draft, email: e.target.value })
                    setErrors((prev) => ({ ...prev, email: undefined }))
                  }}
                  placeholder="dispatch@supplier.ph"
                  aria-label="Contact Email"
                />
              </Field>
              <FieldError id="vendor-err-email" text={errors.email} />
            </div>

            <div>
              <Field label="Contact Phone">
                <Input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  placeholder="+63 917 555 0100"
                  aria-label="Contact Phone"
                />
              </Field>
            </div>

            <div>
              <Field label="Location">
                <Input
                  value={draft.location}
                  onChange={(e) =>
                    setDraft({ ...draft, location: e.target.value })
                  }
                  placeholder="e.g. Taguig"
                  aria-label="Location"
                />
              </Field>
            </div>

            <div>
              <Field label="Status">
                {editingVendorId ? (
                  <div className="relative">
                    <Dropdown
                      aria-label="Vendor Status"
                      value={draft.status}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          status: e.target.value as VendorStatus,
                        })
                      }
                      className={cx(fieldCls, "appearance-none pr-9 text-left")}
                    >
                      <option value="Active">Active</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Inactive">Inactive</option>
                    </Dropdown>
                    <ChevronDown
                      size={16}
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                ) : (
                  <Input
                    value="Active"
                    readOnly
                    disabled
                    aria-label="Vendor Status"
                    className="font-semibold text-success! disabled:text-success!"
                  />
                )}
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">
              {editingVendorId ? "Save Changes" : "Create Vendor"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export { VendorsModule }
