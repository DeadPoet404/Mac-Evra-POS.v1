import Link from "next/link"
import { CircleAlert, Clock3, ShieldCheck, Smartphone, UserRound } from "lucide-react"

import { cancelSaleAction, submitSaleForPaymentAction } from "@/app/new-sale/actions"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { formatPesewas, saleStatusLabel } from "@/lib/sales"
import { getPersistentSale } from "@/lib/sales-server"

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; error?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale/checkout" })
  const params = await searchParams
  const sale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null
  const activeItems = sale?.items.filter((item) => item.status === "active") ?? []
  const reservationsValid = activeItems.length > 0 && activeItems.every((item) =>
    item.reservationStatus === "active" && Boolean(item.reservationExpiresAt && new Date(item.reservationExpiresAt) > new Date())
  )

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Checkout" backHref={sale ? `/new-sale/customer-info?sale=${sale.id}` : "/new-sale"} />
      <div className="mx-auto w-full max-w-3xl px-5 pt-9 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Pre-payment review</p>
        <h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728]">Review the sale.</h1>
        <p className="mt-2 text-lg font-semibold text-[#86868B]">Every amount below comes from trusted inventory snapshots and database calculations.</p>

        {params.error === "submit-failed" ? (
          <p role="alert" className="mt-6 rounded-xl border border-[#E8C9D2] bg-[#FCF4F6] px-4 py-3 text-sm text-[#6E0728]">The sale could not move to awaiting payment. Check that every reservation is still active.</p>
        ) : null}

        {!sale ? (
          <section className="mt-8 rounded-3xl border border-dashed border-[#D8D8DC] bg-white p-12 text-center">
            <CircleAlert className="mx-auto size-8 text-[#A1A1A6]" />
            <h2 className="mt-4 font-semibold">Sale unavailable</h2>
            <Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Return to sale drafts</Link>
          </section>
        ) : (
          <div className="mt-7 space-y-5">
            <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="font-mono text-xs font-semibold text-[#6E0728]">{sale.saleNumber}</p>
                  <h2 className="mt-2 text-xl font-semibold">{saleStatusLabel(sale.status)}</h2>
                  <p className="mt-1 text-sm text-[#86868B]">Employee: {sale.employeeName}</p>
                </div>
                <div className="rounded-xl bg-[#F7F7F8] px-4 py-3 sm:text-right">
                  <p className="text-xs text-[#86868B]">Customer</p>
                  <p className="mt-1 font-semibold">{sale.customer?.fullName ?? "Walk-in customer"}</p>
                  {sale.customer ? <p className="mt-1 text-xs text-[#86868B]">{sale.customer.phone}</p> : null}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3"><Smartphone size={18} className="text-[#6E0728]" /><h2 className="font-semibold">Sale items</h2></div>
              <div className="mt-4 divide-y divide-[#F0F0F2]">
                {activeItems.map((item) => (
                  <div key={item.id} className="flex flex-col justify-between gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-semibold">{item.description}</p>
                      <p className="mt-1 font-mono text-xs text-[#86868B]">IMEI {item.imei}</p>
                      <p className={`mt-2 text-xs font-medium ${item.reservationStatus === "active" ? "text-[#267343]" : "text-[#A13B34]"}`}>Reservation: {item.reservationStatus ?? "unavailable"}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-semibold text-[#6E0728]">{formatPesewas(item.lineTotalPesewas)}</p>
                      {item.discountPesewas ? <p className="mt-1 text-xs text-[#86868B]">Discount {formatPesewas(item.discountPesewas)}</p> : null}
                    </div>
                  </div>
                ))}
                {!activeItems.length ? <p className="py-6 text-center text-sm text-[#86868B]">No active items.</p> : null}
              </div>
            </section>

            <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 sm:p-6">
              <h2 className="font-semibold">Trusted totals</h2>
              <div className="mt-4 space-y-3 text-sm">
                <TotalRow label="Subtotal" value={formatPesewas(sale.subtotalPesewas)} />
                <TotalRow label="Authorised discounts" value={`− ${formatPesewas(sale.discountPesewas)}`} />
                <div className="flex items-center justify-between border-t border-[#E8E8ED] pt-4 text-lg font-semibold"><span>Total due</span><span className="text-2xl text-[#6E0728]">{formatPesewas(sale.totalPesewas)}</span></div>
              </div>
            </section>

            <div className="flex gap-3 rounded-2xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-sm leading-6 text-[#765613]">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" />
              <p><strong>No payment has been recorded or verified.</strong> Continuing only locks this draft as awaiting payment. Inventory remains reserved and must not be handed over or marked sold.</p>
            </div>

            {!reservationsValid && sale.status === "draft" ? (
              <div className="flex gap-3 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] p-4 text-sm text-[#6E0728]">
                <Clock3 className="size-5 shrink-0" />
                <p>One or more reservations ended. Return to the draft, remove the affected item, and reserve available inventory again.</p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Link href={`/new-sale/customer-info?sale=${sale.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8C4CB] px-5 text-sm font-semibold text-[#6E0728]"><UserRound size={16} /> Edit customer</Link>
              <div className="flex flex-col gap-2 sm:flex-row">
                <form action={cancelSaleAction}>
                  <input type="hidden" name="saleId" value={sale.id} />
                  <input type="hidden" name="reason" value="cancelled during checkout" />
                  <button type="submit" className="h-11 w-full rounded-full px-5 text-sm font-semibold text-[#68686D] sm:w-auto">Cancel sale</button>
                </form>
                {sale.status === "draft" ? (
                  <form action={submitSaleForPaymentAction}>
                    <input type="hidden" name="saleId" value={sale.id} />
                    <button type="submit" disabled={!reservationsValid} className="h-11 w-full rounded-full bg-[#6E0728] px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#C7AAB4] sm:w-auto">Set awaiting payment</button>
                  </form>
                ) : (
                  <Link href={`/new-sale/complete?sale=${sale.id}`} className="inline-flex h-11 items-center justify-center rounded-full bg-[#6E0728] px-6 text-sm font-semibold text-white">View current status</Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-[#86868B]">{label}</span><span className="font-semibold">{value}</span></div>
}
