import Link from "next/link"
import { Clock3, ShieldAlert, Smartphone } from "lucide-react"

import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { formatPesewas, saleStatusLabel } from "@/lib/sales"
import { getPersistentSale } from "@/lib/sales-server"

export default async function SaleCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale/complete" })
  const params = await searchParams
  const sale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null
  const activeItems = sale?.items.filter((item) => item.status === "active") ?? []

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Sale status" backHref="/new-sale" backLabel="Sales" />
      <section className="mx-auto w-full max-w-2xl px-5 pt-12 sm:px-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#FFF4DB] text-[#8A6517]"><Clock3 size={30} /></div>
        <div className="mt-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Not paid · not fulfilled</p>
          <h1 className="mt-3 text-[34px] font-semibold tracking-[-1px] text-[#6E0728]">Awaiting verified payment.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#86868B]">The sale details are saved, but no payment record exists and no inventory has been marked sold.</p>
        </div>

        {sale ? (
          <div className="mt-8 space-y-4">
            <section className="rounded-3xl border border-[#E8E8ED] bg-white p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div><p className="font-mono text-xs font-semibold text-[#6E0728]">{sale.saleNumber}</p><p className="mt-2 font-semibold">{saleStatusLabel(sale.status)}</p><p className="mt-1 text-sm text-[#86868B]">{sale.customer?.fullName ?? "Walk-in customer"}</p></div>
                <div className="sm:text-right"><p className="text-xs text-[#86868B]">Amount awaiting verification</p><p className="mt-1 text-2xl font-semibold text-[#6E0728]">{formatPesewas(sale.totalPesewas)}</p></div>
              </div>
              <div className="mt-5 divide-y divide-[#F0F0F2] border-t border-[#F0F0F2]">
                {activeItems.map((item) => <div key={item.id} className="flex items-start gap-3 py-4"><Smartphone size={18} className="mt-0.5 shrink-0 text-[#6E0728]" /><div className="min-w-0 flex-1"><p className="font-medium">{item.description}</p><p className="mt-1 font-mono text-xs text-[#86868B]">IMEI {item.imei}</p></div><p className="shrink-0 text-sm font-semibold">{formatPesewas(item.lineTotalPesewas)}</p></div>)}
              </div>
            </section>
            <div className="flex gap-3 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] p-4 text-sm leading-6 text-[#6E0728]"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><p><strong>Do not hand over any device.</strong> Phase 6 must create and verify a payment, then atomically fulfil reservations and mark inventory sold.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href={`/new-sale/checkout?sale=${sale.id}`} className="rounded-full border border-[#D8C4CB] px-5 py-3.5 text-center text-sm font-semibold text-[#6E0728]">Review sale</Link>
              <Link href="/new-sale" className="rounded-full bg-[#6E0728] px-5 py-3.5 text-center text-sm font-semibold text-white">Return to sales</Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-[#D8D8DC] bg-white p-8 text-center"><p className="text-sm text-[#86868B]">No authorised sale was selected.</p><Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Return to sales</Link></div>
        )}
      </section>
    </main>
  )
}
