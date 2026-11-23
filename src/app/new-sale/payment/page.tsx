import Link from "next/link"
import { CircleAlert, LockKeyhole, ShieldCheck } from "lucide-react"

import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { formatPesewas, saleStatusLabel } from "@/lib/sales"
import { getPersistentSale } from "@/lib/sales-server"

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale/payment" })
  const params = await searchParams
  const sale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Payment" backHref={sale ? `/new-sale/checkout?sale=${sale.id}` : "/new-sale"} />
      <div className="mx-auto w-full max-w-2xl px-5 pt-12 sm:px-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#F5EDF0] text-[#6E0728]"><LockKeyhole size={28} /></div>
        <div className="mt-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Phase 6 boundary</p>
          <h1 className="mt-3 text-[34px] font-semibold tracking-[-1px] text-[#6E0728]">Payment is not recorded here.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#86868B]">Mobile Money, cash confirmation, cards, transfers, webhooks, and settlement verification require the separate trusted payment phase.</p>
        </div>

        {sale ? (
          <section className="mt-8 rounded-3xl border border-[#E8E8ED] bg-white p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div><p className="font-mono text-xs font-semibold text-[#6E0728]">{sale.saleNumber}</p><p className="mt-2 font-semibold">{saleStatusLabel(sale.status)}</p></div>
              <div className="sm:text-right"><p className="text-xs text-[#86868B]">Amount due</p><p className="mt-1 text-2xl font-semibold text-[#6E0728]">{formatPesewas(sale.totalPesewas)}</p></div>
            </div>
            <div className="mt-5 flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-sm leading-6 text-[#765613]"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><p>No transaction reference entered in a browser can verify payment. Inventory remains reserved, never sold, in Phase 5.</p></div>
            <Link href={`/new-sale/checkout?sale=${sale.id}`} className="mt-6 block w-full rounded-full bg-[#6E0728] px-5 py-3.5 text-center text-sm font-semibold text-white">Return to sale review</Link>
          </section>
        ) : (
          <div className="mt-8 flex gap-3 rounded-2xl border border-[#E8C9D2] bg-white p-5 text-sm text-[#6E0728]"><CircleAlert className="size-5 shrink-0" /><p>No authorised sale was selected.</p></div>
        )}
      </div>
    </main>
  )
}
