import { CircleAlert, FilePlus2, Smartphone, Trash2 } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import {
  cancelSaleAction,
  createSaleDraftAction,
  removeSaleItemAction,
} from "@/app/new-sale/actions"
import { ImeiVerification } from "@/app/new-sale/imei-verification"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { listAuthorizedInventory } from "@/lib/inventory-server"
import { employeeSaleStepHref } from "@/lib/sale-journey"
import { formatPesewas } from "@/lib/sales"
import { getPersistentSale, listEmployeeSales, type PersistentSale } from "@/lib/sales-server"

const errors: Record<string, string> = {
  "draft-create-failed": "The sale could not be started. Try again.",
  "item-add-failed": "The device could not be verified. Try again.",
  "item-remove-failed": "The device could not be changed safely.",
  "device-unavailable": "That device is no longer available. Scan another IMEI.",
  "reserved-in-another-draft": "That device is already attached to another saved sale.",
  "cancel-failed": "The sale could not be cancelled.",
}

function resumeHref(sale: PersistentSale) {
  if (sale.status !== "draft") return employeeSaleStepHref("status", sale.id)
  const itemCount = sale.items.filter((item) => item.status === "active").length
  if (itemCount !== 1) return employeeSaleStepHref("imei", sale.id)
  if (!sale.customer) return employeeSaleStepHref("customer", sale.id)
  return employeeSaleStepHref("review", sale.id)
}

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; notice?: string; error?: string }>
}) {
  const { access, membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale" })
  const params = await searchParams
  const [savedSales, inventory, selectedSale] = await Promise.all([
    listEmployeeSales(membership.storeId, access.userId!),
    listAuthorizedInventory(membership.storeId),
    params.sale ? getPersistentSale(membership.storeId, params.sale) : Promise.resolve(null),
  ])

  if (selectedSale && params.notice === "item-added") {
    redirect(employeeSaleStepHref("customer", selectedSale.id))
  }
  if (selectedSale && selectedSale.status !== "draft") {
    redirect(employeeSaleStepHref("status", selectedSale.id))
  }

  const activeItems = selectedSale?.items.filter((item) => item.status === "active") ?? []
  const selectedItem = activeItems.length === 1 ? activeItems[0] : null
  const selectedItemReady = Boolean(
    selectedItem?.reservationStatus === "active" &&
    selectedItem.reservationExpiresAt &&
    new Date(selectedItem.reservationExpiresAt) > new Date()
  )
  const canReserve = membership.permissions.includes("reserve_inventory")

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="New sale" backHref="/home" backLabel="Home" />
      <div className="mx-auto w-full max-w-2xl px-5 pt-9 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Step 1 of 4</p>
        <h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728] sm:text-[44px]">Verify the IMEI.</h1>
        <p className="mt-2 text-base text-[#68686D]">Scan or enter one device IMEI.</p>

        {params.error && errors[params.error] ? <p role="alert" className="mt-6 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] px-5 py-4 text-sm font-medium text-[#6E0728]">{errors[params.error]}</p> : null}
        {params.notice === "sale-cancelled" ? <p role="status" className="mt-6 rounded-2xl border border-[#CDE9D7] bg-[#F0FAF3] px-5 py-4 text-sm font-medium text-[#267343]">Sale cancelled.</p> : null}

        {!params.sale ? (
          <div className="mt-8 space-y-6">
            <section className="rounded-3xl border border-[#E8E8ED] bg-white p-6 text-center shadow-sm sm:p-10">
              <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#F5EDF0] text-[#6E0728]"><Smartphone size={30} /></span>
              <h2 className="mt-5 text-xl font-semibold">Start a sale</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-[#86868B]">Start when the device is ready to scan.</p>
              <form action={createSaleDraftAction} className="mt-6">
                <button type="submit" className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white hover:bg-[#57051F] sm:w-auto">
                  <FilePlus2 size={19} /> Start sale
                </button>
              </form>
            </section>

            {savedSales.length ? (
              <section>
                <h2 className="text-sm font-semibold">Continue a saved sale</h2>
                <div className="mt-3 space-y-2">
                  {savedSales.map((sale) => {
                    const item = sale.items.find((candidate) => candidate.status === "active")
                    return (
                      <Link key={sale.id} href={resumeHref(sale)} className="flex items-center justify-between gap-4 rounded-2xl border border-[#E8E8ED] bg-white p-4 transition hover:border-[#D8C4CB]">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item?.description ?? "Device not selected"}</p>
                          <p className="mt-1 font-mono text-xs text-[#86868B]">{sale.saleNumber}</p>
                        </div>
                        <p className="shrink-0 font-semibold text-[#6E0728]">{formatPesewas(sale.totalPesewas)}</p>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </div>
        ) : !selectedSale ? (
          <section className="mt-8 rounded-3xl border border-dashed border-[#D8D8DC] bg-white p-10 text-center">
            <CircleAlert className="mx-auto size-8 text-[#A1A1A6]" />
            <h2 className="mt-4 font-semibold">Sale unavailable</h2>
            <Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Start another sale</Link>
          </section>
        ) : activeItems.length > 1 ? (
          <section className="mt-8 rounded-3xl border border-[#E8C9D2] bg-white p-6">
            <h2 className="font-semibold text-[#6E0728]">Choose one device</h2>
            <p className="mt-2 text-sm text-[#68686D]">This saved sale contains multiple devices from the previous interface. Remove devices until one remains.</p>
            <div className="mt-5 divide-y divide-[#EFEFF1]">
              {activeItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0"><p className="truncate font-medium">{item.description}</p><p className="mt-1 font-mono text-xs text-[#86868B]">{item.imei}</p></div>
                  <form action={removeSaleItemAction}>
                    <input type="hidden" name="saleId" value={selectedSale.id} />
                    <input type="hidden" name="saleItemId" value={item.id} />
                    <button type="submit" aria-label={`Remove ${item.description}`} className="flex size-10 items-center justify-center rounded-full bg-[#F7F7F8] text-[#6E0728]"><Trash2 size={17} /></button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        ) : selectedItem ? (
          <div className="mt-8 space-y-5">
            <section className={`rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${selectedItemReady ? "border-[#CDE9D7]" : "border-[#E8C9D2]"}`}>
              <div className="flex items-start gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#F5EDF0] text-[#6E0728]"><Smartphone size={27} /></span>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${selectedItemReady ? "text-[#267343]" : "text-[#A13B34]"}`}>{selectedItemReady ? "Device verified" : "Verify another device"}</p>
                  <h2 className="mt-2 text-xl font-semibold">{selectedItem.description}</h2>
                  <p className="mt-2 font-mono text-xs text-[#86868B]">IMEI {selectedItem.imei}</p>
                  <p className="mt-4 text-3xl font-semibold tracking-[-0.8px] text-[#6E0728]">{formatPesewas(selectedItem.lineTotalPesewas)}</p>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3 border-t border-[#EFEFF1] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <form action={removeSaleItemAction}>
                  <input type="hidden" name="saleId" value={selectedSale.id} />
                  <input type="hidden" name="saleItemId" value={selectedItem.id} />
                  <button type="submit" className="h-12 w-full rounded-full border border-[#D8C4CB] px-6 text-sm font-semibold text-[#6E0728] sm:w-auto">Change device</button>
                </form>
                {selectedItemReady ? <Link href={employeeSaleStepHref("customer", selectedSale.id)} className="inline-flex h-14 items-center justify-center rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white">Continue</Link> : null}
              </div>
            </section>
            <form action={cancelSaleAction} className="text-center">
              <input type="hidden" name="saleId" value={selectedSale.id} />
              <input type="hidden" name="reason" value="cancelled by employee" />
              <button type="submit" className="text-sm font-semibold text-[#86868B]">Cancel sale</button>
            </form>
          </div>
        ) : canReserve ? (
          <div className="mt-8">
            <ImeiVerification saleId={selectedSale.id} inventory={inventory} canReserve={canReserve} />
            <form action={cancelSaleAction} className="mt-8 text-center">
              <input type="hidden" name="saleId" value={selectedSale.id} />
              <input type="hidden" name="reason" value="cancelled by employee" />
              <button type="submit" className="text-sm font-semibold text-[#86868B]">Cancel sale</button>
            </form>
          </div>
        ) : (
          <p className="mt-8 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] p-5 text-sm font-medium text-[#6E0728]">Your account cannot verify sale inventory.</p>
        )}
      </div>
    </main>
  )
}
