import { CircleAlert, Clock3, ShieldCheck, Smartphone, UserRound } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { cancelSaleAction, submitSaleForPaymentAction } from "@/app/new-sale/actions"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { employeeSaleStepHref } from "@/lib/sale-journey"
import { formatPesewas } from "@/lib/sales"
import { getPersistentSale } from "@/lib/sales-server"

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; error?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale/checkout" })
  const params = await searchParams
  const sale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null

  if (sale && sale.status !== "draft") {
    redirect(employeeSaleStepHref("status", sale.id))
  }

  const activeItems = sale?.items.filter((item) => item.status === "active") ?? []
  if (sale && activeItems.length !== 1) {
    redirect(employeeSaleStepHref("imei", sale.id))
  }
  if (sale && !sale.customer) {
    redirect(employeeSaleStepHref("customer", sale.id))
  }

  const item = activeItems[0]
  const deviceReady = Boolean(
    item?.reservationStatus === "active" &&
    item.reservationExpiresAt &&
    new Date(item.reservationExpiresAt) > new Date()
  )

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Review" backHref={sale ? employeeSaleStepHref("customer", sale.id) : "/new-sale"} backLabel="Back" />
      <div className="mx-auto w-full max-w-2xl px-5 pt-9 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Step 3 of 4</p>
        <h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728] sm:text-[44px]">Review and submit.</h1>
        <p className="mt-2 text-base text-[#68686D]">Confirm the device and customer.</p>

        {params.error === "submit-failed" ? <p role="alert" className="mt-6 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] px-5 py-4 text-sm font-medium text-[#6E0728]">The sale could not be submitted. Go back and verify the device again.</p> : null}

        {!sale || !item || !sale.customer ? (
          <section className="mt-8 rounded-3xl border border-dashed border-[#D8D8DC] bg-white p-10 text-center">
            <CircleAlert className="mx-auto size-8 text-[#A1A1A6]" />
            <h2 className="mt-4 font-semibold">Sale unavailable</h2>
            <Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Return to IMEI verification</Link>
          </section>
        ) : (
          <div className="mt-8 space-y-5">
            <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 shadow-sm sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#F5EDF0] text-[#6E0728]"><Smartphone size={27} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold">{item.description}</h2>
                  <p className="mt-2 font-mono text-xs text-[#86868B]">IMEI {item.imei}</p>
                  <p className="mt-4 text-3xl font-semibold tracking-[-0.8px] text-[#6E0728]">{formatPesewas(sale.totalPesewas)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#F7F7F8] text-[#6E0728]"><UserRound size={23} /></span>
                <div>
                  <h2 className="text-lg font-semibold">{sale.customer.fullName}</h2>
                  <p className="mt-1 text-sm text-[#68686D]">{sale.customer.phone}</p>
                  {sale.customer.email ? <p className="mt-1 text-sm text-[#86868B]">{sale.customer.email}</p> : null}
                </div>
              </div>
            </section>

            {!deviceReady ? (
              <div className="flex gap-3 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] p-5 text-sm text-[#6E0728]">
                <Clock3 className="size-5 shrink-0" />
                <div><p className="font-semibold">Verify the device again.</p><p className="mt-1">The selected device is no longer available for submission.</p></div>
              </div>
            ) : (
              <div className="flex gap-3 rounded-2xl border border-[#F2E2BD] bg-[#FFF9EB] p-5 text-sm leading-6 text-[#765613]">
                <ShieldCheck className="mt-0.5 size-5 shrink-0" />
                <p>Submitting saves this sale as awaiting payment. It does not record payment or mark the device as sold.</p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <form action={cancelSaleAction}>
                <input type="hidden" name="saleId" value={sale.id} />
                <input type="hidden" name="reason" value="cancelled during review" />
                <button type="submit" className="h-12 w-full rounded-full px-6 text-sm font-semibold text-[#86868B] sm:w-auto">Cancel sale</button>
              </form>
              {deviceReady ? (
                <form action={submitSaleForPaymentAction}>
                  <input type="hidden" name="saleId" value={sale.id} />
                  <button type="submit" className="h-14 w-full rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white hover:bg-[#57051F] sm:w-auto">Submit sale</button>
                </form>
              ) : (
                <Link href={employeeSaleStepHref("imei", sale.id)} className="inline-flex h-14 items-center justify-center rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white">Back to IMEI</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
