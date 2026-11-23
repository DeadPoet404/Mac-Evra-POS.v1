import { CircleAlert, FilePlus2, Smartphone } from "lucide-react"
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
import { employeeSaleResumeStep, employeeSaleStepHref } from "@/lib/sale-journey"
import { formatPesewas } from "@/lib/sales"
import { getPersistentSale, listEmployeeSales } from "@/lib/sales-server"

const errors: Record<string, string> = {
  "draft-create-failed": "The sale could not be started. Try again.",
  "item-add-failed": "The device could not be verified. Try again.",
  "item-remove-failed": "The device could not be changed safely.",
  "device-unavailable": "That device is no longer available. Scan another IMEI.",
  "reserved-in-another-draft": "That device is already attached to another saved sale.",
  "cancel-failed": "The sale could not be cancelled.",
}

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; notice?: string; error?: string }>
}) {
  const { access, membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale" })
  const params = await searchParams
  const selectedSale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null

  if (!params.sale) {
    const savedSales = await listEmployeeSales(membership.storeId, access.userId!)
    const currentSale = savedSales[0]
    if (currentSale) {
      const activeItemCount = currentSale.items.filter((item) => item.status === "active").length
      redirect(employeeSaleStepHref(
        employeeSaleResumeStep(
          activeItemCount,
          currentSale.payment?.status === "confirmed",
          Boolean(currentSale.customer)
        ),
        currentSale.id
      ))
    }
  }

  const inventory = selectedSale ? await listAuthorizedInventory(membership.storeId) : []

  if (selectedSale && params.notice === "item-added") {
    redirect(employeeSaleStepHref("payment", selectedSale.id))
  }
  if (selectedSale?.status === "awaiting_payment") {
    redirect(employeeSaleStepHref("payment", selectedSale.id))
  }
  if (selectedSale?.status === "completed") {
    redirect(employeeSaleStepHref(selectedSale.customer ? "complete" : "customer", selectedSale.id))
  }
  if (selectedSale?.status === "cancelled") {
    redirect(employeeSaleStepHref("complete", selectedSale.id))
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
          </div>
        ) : !selectedSale ? (
          <section className="mt-8 rounded-3xl border border-dashed border-[#D8D8DC] bg-white p-10 text-center">
            <CircleAlert className="mx-auto size-8 text-[#A1A1A6]" />
            <h2 className="mt-4 font-semibold">Sale unavailable</h2>
            <Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Start another sale</Link>
          </section>
        ) : activeItems.length > 1 ? (
          <section className="mt-8 rounded-3xl border border-[#E8C9D2] bg-white p-8 text-center">
            <CircleAlert className="mx-auto size-8 text-[#6E0728]" />
            <h2 className="mt-4 text-xl font-semibold">Start this sale again</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#68686D]">This older sale cannot continue in the one-device sale flow.</p>
            <form action={cancelSaleAction} className="mt-6">
              <input type="hidden" name="saleId" value={selectedSale.id} />
              <input type="hidden" name="reason" value="restarted from one-device employee sale flow" />
              <button type="submit" className="h-14 w-full rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white sm:w-auto">Start again</button>
            </form>
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
                {selectedItemReady ? <Link href={employeeSaleStepHref("payment", selectedSale.id)} className="inline-flex h-14 items-center justify-center rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white">Continue to payment</Link> : null}
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
