import { Banknote, Building2, CircleAlert, Clock3, ShieldCheck, Smartphone } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { cancelSaleAction, confirmSalePaymentAction } from "@/app/new-sale/actions"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { employeeSaleStepHref } from "@/lib/sale-journey"
import { formatPesewas } from "@/lib/sales"
import { getPersistentSale } from "@/lib/sales-server"

const errors: Record<string, string> = {
  "invalid-method": "Select one supported payment method.",
  "attestation-required": "Confirm that the full amount was actually received.",
  "invalid-reference": "The optional reference must not exceed 160 characters.",
  "payment-failed": "Payment could not be recorded. Check the reservation and try again only if funds were received.",
}

const methodOptions = [
  { value: "mobile_money", label: "Mobile Money", description: "Manually received Mobile Money", icon: Smartphone },
  { value: "cash", label: "Cash", description: "Cash counted and received", icon: Banknote },
  { value: "bank_transfer", label: "Bank transfer", description: "Transfer manually confirmed received", icon: Building2 },
] as const

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; error?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales", "reserve_inventory"], {
    nextPath: "/new-sale/payment",
  })
  const params = await searchParams
  const sale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null

  if (sale?.status === "cancelled") redirect(employeeSaleStepHref("complete", sale.id))
  if (sale?.status === "completed" && sale.payment) {
    redirect(employeeSaleStepHref(sale.customer ? "complete" : "customer", sale.id))
  }

  const activeItems = sale?.items.filter((item) => item.status === "active") ?? []
  if (sale?.status === "draft" && activeItems.length !== 1) {
    redirect(employeeSaleStepHref("imei", sale.id))
  }
  const item = activeItems.length === 1 ? activeItems[0] : null
  const reservationReady = Boolean(
    item?.reservationStatus === "active" &&
    item.reservationExpiresAt &&
    new Date(item.reservationExpiresAt) > new Date()
  )

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Payment" backHref={sale ? employeeSaleStepHref("imei", sale.id) : "/new-sale"} backLabel="Back" />
      <div className="mx-auto w-full max-w-2xl px-5 pt-9 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Step 2 of 4</p>
        <h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728] sm:text-[44px]">Record full payment.</h1>
        <p className="mt-2 text-base text-[#68686D]">Continue only after the complete amount has actually been received.</p>

        {params.error && errors[params.error] ? (
          <p role="alert" className="mt-6 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] px-5 py-4 text-sm font-medium text-[#6E0728]">{errors[params.error]}</p>
        ) : null}

        {!sale || !item ? (
          <section className="mt-8 rounded-3xl border border-dashed border-[#D8D8DC] bg-white p-10 text-center">
            <CircleAlert className="mx-auto size-8 text-[#A1A1A6]" />
            <h2 className="mt-4 font-semibold">Verify one device first</h2>
            <Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Return to IMEI verification</Link>
          </section>
        ) : (
          <div className="mt-8 space-y-5">
            <section className="rounded-3xl border border-[#E8E8ED] bg-white p-6 text-center shadow-sm sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#86868B]">Authoritative amount due</p>
              <p className="mt-3 text-[42px] font-semibold tracking-[-1.4px] text-[#6E0728]">{formatPesewas(sale.totalPesewas)}</p>
              <p className="mt-3 text-sm font-medium">{item.description}</p>
              <p className="mt-1 font-mono text-xs text-[#86868B]">IMEI {item.imei}</p>
            </section>

            {!reservationReady ? (
              <div className="flex gap-3 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] p-5 text-sm text-[#6E0728]">
                <Clock3 className="size-5 shrink-0" />
                <div><p className="font-semibold">Payment cannot be recorded.</p><p className="mt-1">The device reservation is no longer active and unexpired.</p></div>
              </div>
            ) : (
              <form action={confirmSalePaymentAction} className="rounded-3xl border border-[#E8E8ED] bg-white p-5 shadow-sm sm:p-8">
                <input type="hidden" name="saleId" value={sale.id} />
                <fieldset>
                  <legend className="text-sm font-semibold">Payment method</legend>
                  <div className="mt-3 grid gap-3">
                    {methodOptions.map(({ value, label, description, icon: Icon }) => (
                      <label key={value} className="flex cursor-pointer items-center gap-4 rounded-2xl border border-[#D8D8DC] p-4 has-[:checked]:border-[#6E0728] has-[:checked]:bg-[#FCF6F8]">
                        <input type="radio" name="paymentMethod" value={value} required className="size-4 accent-[#6E0728]" />
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><Icon size={20} /></span>
                        <span><span className="block font-semibold">{label}</span><span className="mt-0.5 block text-xs text-[#86868B]">{description}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="mt-6 block text-sm font-semibold">
                  Transaction reference <span className="font-normal text-[#86868B]">(optional metadata)</span>
                  <input name="transactionReference" maxLength={160} autoComplete="off" className="mt-2 h-14 w-full rounded-2xl border border-[#D8D8DC] bg-[#FAFAFC] px-4 text-base outline-none transition focus:border-[#6E0728] focus:ring-4 focus:ring-[#6E0728]/10" placeholder="Reference, if available" />
                </label>
                <p className="mt-2 text-xs leading-5 text-[#86868B]">A reference is for record-keeping only and is never proof of payment.</p>

                <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] p-4 text-sm leading-6 text-[#4A2632]">
                  <input type="checkbox" name="receivedConfirmed" value="yes" required className="mt-1 size-4 shrink-0 accent-[#6E0728]" />
                  <span><strong>I confirm that the full {formatPesewas(sale.totalPesewas)} was actually received.</strong> This records my identity and confirmation time.</span>
                </label>

                <button type="submit" className="mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white hover:bg-[#57051F]">
                  <ShieldCheck size={19} /> Record payment
                </button>
              </form>
            )}

            <form action={cancelSaleAction} className="text-center">
              <input type="hidden" name="saleId" value={sale.id} />
              <input type="hidden" name="reason" value="cancelled before payment confirmation" />
              <button type="submit" className="text-sm font-semibold text-[#86868B]">Cancel sale</button>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
