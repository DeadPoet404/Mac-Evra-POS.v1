import Link from "next/link"
import { CircleAlert, Clock3, FilePlus2, ShieldCheck, ShoppingBag, Trash2, UserRound } from "lucide-react"

import {
  cancelSaleAction,
  createSaleDraftAction,
  expireSaleDraftsAction,
  removeSaleItemAction,
  updateSaleItemDiscountAction,
} from "@/app/new-sale/actions"
import { InventoryPicker } from "@/app/new-sale/inventory-picker"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { listAuthorizedInventory } from "@/lib/inventory-server"
import { formatPesewas, pesewasToGhsInput, saleStatusLabel } from "@/lib/sales"
import { getPersistentSale, listEmployeeSales } from "@/lib/sales-server"

const notices: Record<string, string> = {
  "draft-created": "Sale draft created.",
  "item-added": "Device reserved and added using its trusted database price.",
  "item-removed": "Device removed and its active reservation released.",
  "discount-updated": "Authorised discount recorded.",
  "sale-cancelled": "Sale cancelled and active reservations released.",
  "expired-drafts-cleared": "Expired drafts were cancelled and their active reservations released.",
}

const errors: Record<string, string> = {
  "draft-create-failed": "A sale draft could not be created.",
  "item-add-failed": "The device could not be added safely.",
  "item-remove-failed": "The item could not be removed safely.",
  "device-unavailable": "That device is no longer available for this sale.",
  "reserved-in-another-draft": "That reservation belongs to another active draft. Resume that draft instead.",
  "invalid-discount": "Enter a valid discount amount in Ghana cedis.",
  "discount-failed": "The discount was not authorised or exceeded the item price.",
  "cancel-failed": "The sale could not be cancelled safely.",
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(value))
}

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; notice?: string; error?: string }>
}) {
  const { access, membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale" })
  const params = await searchParams
  const [drafts, inventory] = await Promise.all([
    listEmployeeSales(membership.storeId, access.userId!),
    listAuthorizedInventory(membership.storeId),
  ])
  const selectedSale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null
  const activeItems = selectedSale?.items.filter((item) => item.status === "active") ?? []
  const canReserve = membership.permissions.includes("reserve_inventory")
  const canDiscount = membership.permissions.includes("approve_discounts")

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Sales" backHref="/home" backLabel="Home" />
      <div className="mx-auto w-full max-w-6xl px-5 pt-9 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Persistent sales</p>
            <h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728] sm:text-[44px]">Build a sale.</h1>
            <p className="mt-2 max-w-2xl text-lg font-semibold text-[#86868B]">Reserve real inventory, save a draft, and prepare it for independently verified payment.</p>
          </div>
          <form action={createSaleDraftAction}>
            <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#6E0728] px-5 text-sm font-semibold text-white hover:bg-[#57051F]">
              <FilePlus2 size={17} /> New sale draft
            </button>
          </form>
        </header>

        {params.notice && notices[params.notice] ? <p role="status" className="mt-6 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm text-[#267343]">{notices[params.notice]}</p> : null}
        {params.error && errors[params.error] ? <p role="alert" className="mt-6 rounded-xl border border-[#E8C9D2] bg-[#FCF4F6] px-4 py-3 text-sm text-[#6E0728]">{errors[params.error]}</p> : null}

        <div className="mt-7 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-[#E8E8ED] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Unfinished sales</h2>
                  <p className="mt-1 text-xs text-[#86868B]">{drafts.length} saved</p>
                </div>
                <Clock3 size={18} className="text-[#6E0728]" />
              </div>
              <div className="mt-4 space-y-2">
                {drafts.length ? drafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/new-sale?sale=${draft.id}`}
                    className={`block rounded-xl border p-3 transition ${selectedSale?.id === draft.id ? "border-[#6E0728] bg-[#FCF7F9]" : "border-[#ECECEF] hover:border-[#D8C4CB]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs font-semibold">{draft.saleNumber}</p>
                      <span className="rounded-full bg-[#F5EDF0] px-2 py-0.5 text-[10px] font-semibold text-[#6E0728]">{saleStatusLabel(draft.status)}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold">{formatPesewas(draft.totalPesewas)}</p>
                    <p className="mt-1 text-[11px] text-[#86868B]">{draft.items.filter((item) => item.status === "active").length} item(s) · Updated {dateTime(draft.updatedAt)}</p>
                  </Link>
                )) : <p className="rounded-xl bg-[#F7F7F8] p-4 text-sm text-[#86868B]">No unfinished drafts. Start a new sale when a customer is ready.</p>}
              </div>
              {drafts.some((draft) => draft.status === "draft" && new Date(draft.expiresAt) <= new Date()) ? (
                <form action={expireSaleDraftsAction} className="mt-3">
                  <button type="submit" className="text-xs font-semibold text-[#6E0728]">Clear expired drafts</button>
                </form>
              ) : null}
            </section>
            <div className="flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-xs leading-5 text-[#765613]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>Phase 5 never records payment and never marks inventory sold. Awaiting payment is not a completed sale.</p>
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {!params.sale ? (
              <section className="rounded-3xl border border-dashed border-[#D8D8DC] bg-white px-6 py-20 text-center">
                <ShoppingBag className="mx-auto size-9 text-[#A1A1A6]" />
                <h2 className="mt-5 text-xl font-semibold">Select a draft or start a new sale</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#86868B]">Each draft is store-scoped, belongs to the signed-in employee, and uses atomic inventory reservations.</p>
              </section>
            ) : !selectedSale ? (
              <section className="rounded-3xl border border-[#E8C9D2] bg-white p-8 text-center">
                <CircleAlert className="mx-auto size-7 text-[#6E0728]" />
                <h2 className="mt-4 font-semibold">Sale unavailable</h2>
                <p className="mt-2 text-sm text-[#86868B]">This sale does not exist in your authorised store or is not visible to your account.</p>
              </section>
            ) : (
              <>
                <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-mono text-xs font-semibold text-[#6E0728]">{selectedSale.saleNumber}</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.6px]">{saleStatusLabel(selectedSale.status)}</h2>
                      <p className="mt-1 text-sm text-[#86868B]">Created {dateTime(selectedSale.createdAt)} · Draft expiry {dateTime(selectedSale.expiresAt)}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-[#86868B]">Server-validated total</p>
                      <p className="mt-1 text-3xl font-semibold tracking-[-0.8px] text-[#6E0728]">{formatPesewas(selectedSale.totalPesewas)}</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <Summary label="Subtotal" value={formatPesewas(selectedSale.subtotalPesewas)} />
                    <Summary label="Discount" value={formatPesewas(selectedSale.discountPesewas)} />
                    <Summary label="Customer" value={selectedSale.customer?.fullName ?? "Walk-in"} />
                  </div>

                  {activeItems.length ? (
                    <div className="mt-6 space-y-3">
                      {activeItems.map((item) => {
                        const reservationActive = item.reservationStatus === "active" && Boolean(item.reservationExpiresAt && new Date(item.reservationExpiresAt) > new Date())
                        return (
                          <article key={item.id} className="rounded-2xl border border-[#ECECEF] p-4">
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-semibold">{item.description}</h3>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${reservationActive ? "bg-[#F0FAF3] text-[#267343]" : "bg-[#FFF3F2] text-[#A13B34]"}`}>{reservationActive ? "Reserved" : "Reservation ended"}</span>
                                </div>
                                <p className="mt-2 font-mono text-xs text-[#86868B]">IMEI {item.imei}</p>
                                <p className="mt-2 text-sm text-[#68686D]">List {formatPesewas(item.unitPricePesewas)}{item.discountPesewas ? ` · Discount ${formatPesewas(item.discountPesewas)}` : ""}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <p className="font-semibold text-[#6E0728]">{formatPesewas(item.lineTotalPesewas)}</p>
                                {selectedSale.status === "draft" ? (
                                  <form action={removeSaleItemAction}>
                                    <input type="hidden" name="saleId" value={selectedSale.id} />
                                    <input type="hidden" name="saleItemId" value={item.id} />
                                    <button type="submit" aria-label={`Remove ${item.description}`} className="flex size-9 items-center justify-center rounded-full bg-[#F7F7F8] text-[#68686D] hover:text-[#6E0728]"><Trash2 size={15} /></button>
                                  </form>
                                ) : null}
                              </div>
                            </div>
                            {canDiscount && selectedSale.status === "draft" ? (
                              <form action={updateSaleItemDiscountAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[#F0F0F2] pt-4">
                                <input type="hidden" name="saleId" value={selectedSale.id} />
                                <input type="hidden" name="saleItemId" value={item.id} />
                                <label className="min-w-[180px] flex-1 text-xs font-medium text-[#68686D]">Discount (GH₵)
                                  <input name="discountGhs" defaultValue={pesewasToGhsInput(item.discountPesewas)} inputMode="decimal" className="mt-1 h-9 w-full rounded-lg border border-[#E5E5E7] px-3 text-sm" />
                                </label>
                                <button type="submit" className="h-9 rounded-full border border-[#D8C4CB] px-4 text-xs font-semibold text-[#6E0728]">Apply authorised discount</button>
                              </form>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  ) : <p className="mt-6 rounded-2xl bg-[#F7F7F8] p-5 text-sm text-[#86868B]">No devices have been added to this draft.</p>}

                  <div className="mt-6 flex flex-col gap-3 border-t border-[#E8E8ED] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/new-sale/customer-info?sale=${selectedSale.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8C4CB] px-5 text-sm font-semibold text-[#6E0728]"><UserRound size={16} /> {selectedSale.customer ? "Change customer" : "Choose customer"}</Link>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <form action={cancelSaleAction}>
                        <input type="hidden" name="saleId" value={selectedSale.id} />
                        <input type="hidden" name="reason" value="cancelled by employee" />
                        <button type="submit" className="h-11 w-full rounded-full px-5 text-sm font-semibold text-[#68686D] sm:w-auto">Cancel sale</button>
                      </form>
                      <Link href={`/new-sale/checkout?sale=${selectedSale.id}`} className={`inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold ${activeItems.length ? "bg-[#6E0728] text-white" : "pointer-events-none bg-[#C7AAB4] text-white"}`}>Review checkout</Link>
                    </div>
                  </div>
                </section>

                {selectedSale.status === "draft" && canReserve ? (
                  <InventoryPicker saleId={selectedSale.id} inventory={inventory} addedDeviceIds={activeItems.map((item) => item.deviceId)} />
                ) : selectedSale.status === "awaiting_payment" ? (
                  <section className="rounded-3xl border border-[#F2E2BD] bg-[#FFF9EB] p-6">
                    <h2 className="font-semibold text-[#765613]">This sale is awaiting verified payment</h2>
                    <p className="mt-2 text-sm leading-6 text-[#765613]">Items and totals are locked. Inventory remains reserved, not sold. Phase 6 must verify payment before fulfilment.</p>
                    <Link href={`/new-sale/complete?sale=${selectedSale.id}`} className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">View current status</Link>
                  </section>
                ) : !canReserve ? (
                  <p className="rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] p-4 text-sm text-[#6E0728]">Your membership can create sales but cannot reserve inventory.</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#F7F7F8] p-4"><p className="text-xs text-[#86868B]">{label}</p><p className="mt-1 truncate font-semibold">{value}</p></div>
}
