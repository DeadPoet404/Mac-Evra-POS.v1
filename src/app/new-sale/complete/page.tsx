import Link from "next/link"
import { Ban, CheckCircle2, Clock3, FilePenLine, ShieldAlert, Smartphone } from "lucide-react"
import { redirect } from "next/navigation"

import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { employeeSaleStepHref } from "@/lib/sale-journey"
import { formatPesewas, paymentMethodLabel, resolveSaleCompletion, saleStatusLabel } from "@/lib/sales"
import { getPersistentSale } from "@/lib/sales-server"

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value))
}

export default async function SaleCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale/complete" })
  const params = await searchParams
  const completion = await resolveSaleCompletion(
    params.sale,
    (saleId) => getPersistentSale(membership.storeId, saleId)
  )
  const sale = completion?.sale ?? null
  const presentation = completion?.presentation ?? null

  if (sale?.status === "completed" && sale.payment?.status === "confirmed" && !sale.customer) {
    redirect(employeeSaleStepHref("customer", sale.id))
  }

  const activeItems = sale?.items.filter((item) => item.status === "active") ?? []
  const StatusIcon = presentation?.isSuccess
    ? CheckCircle2
    : sale?.status === "draft"
      ? FilePenLine
      : sale?.status === "cancelled"
        ? Ban
        : Clock3
  const iconStyle = presentation?.isSuccess
    ? "bg-[#EAF8EF] text-[#267343]"
    : sale?.status === "cancelled"
      ? "bg-[#F4F4F5] text-[#68686D]"
      : sale?.status === "draft"
        ? "bg-[#F5EDF0] text-[#6E0728]"
        : "bg-[#FFF4DB] text-[#8A6517]"

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader
        title={presentation?.isSuccess ? "Sale complete" : "Sale status"}
        backHref={presentation?.isSuccess ? "/new-sale" : sale?.status === "draft" ? employeeSaleStepHref("imei", sale.id) : "/new-sale"}
        backLabel={presentation?.isSuccess ? "Sales" : "Back"}
      />
      <section className="mx-auto w-full max-w-2xl px-5 pt-12 sm:px-6">
        {sale && presentation ? (
          <>
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Step 4 of 4</p>
            <div className={`mx-auto mt-4 flex size-16 items-center justify-center rounded-full ${iconStyle}`}><StatusIcon size={30} /></div>
            <div className="mt-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86868B]">{presentation.eyebrow}</p>
              <h1 className="mt-2 text-[34px] font-semibold tracking-[-1px] text-[#6E0728]">{presentation.title}</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#86868B]">{presentation.description}</p>
            </div>

            <div className="mt-8 space-y-4">
              <section className="rounded-3xl border border-[#E8E8ED] bg-white p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#6E0728]">{sale.saleNumber}</p>
                    <p className="mt-2 font-semibold">{saleStatusLabel(sale.status)}</p>
                    <p className="mt-1 text-sm text-[#86868B]">{sale.customer?.fullName ?? "Customer not recorded"}</p>
                    {sale.status === "cancelled" && sale.cancellationReason ? <p className="mt-2 text-xs text-[#86868B]">Reason: {sale.cancellationReason}</p> : null}
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-[#86868B]">{presentation.amountLabel}</p>
                    <p className="mt-1 text-2xl font-semibold text-[#6E0728]">{formatPesewas(sale.totalPesewas)}</p>
                  </div>
                </div>
                <div className="mt-5 divide-y divide-[#F0F0F2] border-t border-[#F0F0F2]">
                  {activeItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 py-4">
                      <Smartphone size={18} className="mt-0.5 shrink-0 text-[#6E0728]" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.description}</p>
                        <p className="mt-1 font-mono text-xs text-[#86868B]">IMEI {item.imei}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold">{formatPesewas(item.lineTotalPesewas)}</p>
                    </div>
                  ))}
                </div>
                {presentation.isSuccess && sale.payment ? (
                  <div className="grid gap-3 border-t border-[#F0F0F2] pt-5 text-sm sm:grid-cols-2">
                    <div><p className="text-xs text-[#86868B]">Payment method</p><p className="mt-1 font-semibold">{paymentMethodLabel(sale.payment.method)}</p></div>
                    <div><p className="text-xs text-[#86868B]">Confirmed</p><p className="mt-1 font-semibold">{dateTime(sale.payment.confirmedAt)}</p></div>
                    <div><p className="text-xs text-[#86868B]">Confirmed by</p><p className="mt-1 font-semibold">{sale.payment.confirmerName}</p></div>
                    <div><p className="text-xs text-[#86868B]">Reference</p><p className="mt-1 break-words font-semibold">{sale.payment.transactionReference ?? "Not provided"}</p></div>
                  </div>
                ) : null}
              </section>

              <div className={`flex gap-3 rounded-2xl border p-4 text-sm leading-6 ${presentation.isSuccess ? "border-[#CDE9D7] bg-[#F0FAF3] text-[#267343]" : "border-[#E8C9D2] bg-[#FCF4F6] text-[#6E0728]"}`}>
                {presentation.isSuccess ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <ShieldAlert className="mt-0.5 size-5 shrink-0" />}
                <p><strong>{presentation.noticeTitle}</strong> {presentation.notice}</p>
              </div>

              <Link href={presentation.actionHref} className={`block rounded-full px-5 py-3.5 text-center text-sm font-semibold ${presentation.isSuccess ? "bg-[#6E0728] text-white" : "border border-[#D8C4CB] text-[#6E0728]"}`}>{presentation.actionLabel}</Link>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#D8D8DC] bg-white p-8 text-center">
            <h1 className="font-semibold text-[#1D1D1F]">Sale unavailable</h1>
            <p className="mt-2 text-sm text-[#86868B]">No authorised persisted sale and payment could be loaded.</p>
            <Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Return to sales</Link>
          </div>
        )}
      </section>
    </main>
  )
}
