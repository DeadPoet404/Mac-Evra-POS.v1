import Link from "next/link"
import { CalendarDays, CircleAlert, Clock3, ReceiptText, Search, ShoppingBag, UserRound, XCircle } from "lucide-react"

import { DataBadge, EmptyState, MetricCard, PageHeader } from "@/components/manager/manager-ui"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissions } from "@/lib/auth/server"
import { formatPesewas, matchesSaleSearch, saleStatusLabel, saleStatuses, type SaleStatus } from "@/lib/sales"
import { listManagerSales } from "@/lib/sales-server"

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(value))
}

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""
}

function StatusBadge({ status }: { status: SaleStatus }) {
  const tone = status === "completed" ? "green" : status === "awaiting_payment" ? "amber" : status === "cancelled" ? "neutral" : "blue"
  return <DataBadge tone={tone}>{saleStatusLabel(status)}</DataBadge>
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; sale?: string }>
}) {
  const { membership } = await requirePermissions(["access_manager_workspace"], { nextPath: "/manager/sales" })
  const params = await searchParams
  const sales = await listManagerSales(membership.storeId)
  const query = params.q?.trim() ?? ""
  const status = saleStatuses.includes(params.status as SaleStatus) ? params.status as SaleStatus : ""
  const from = validDate(params.from)
  const to = validDate(params.to)

  const filtered = sales.filter((sale) => {
    if (status && sale.status !== status) return false
    const createdDate = sale.createdAt.slice(0, 10)
    if (from && createdDate < from) return false
    if (to && createdDate > to) return false
    return matchesSaleSearch({
      saleNumber: sale.saleNumber,
      customerName: sale.customer?.fullName ?? null,
      employeeName: sale.employeeName,
      itemDescriptions: sale.items.filter((item) => item.status === "active").map((item) => item.description),
      imeis: sale.items.filter((item) => item.status === "active").map((item) => item.imei),
    }, query)
  })
  const selected = params.sale ? sales.find((sale) => sale.id === params.sale) ?? null : null
  const drafts = sales.filter((sale) => sale.status === "draft")
  const awaiting = sales.filter((sale) => sale.status === "awaiting_payment")
  const cancelled = sales.filter((sale) => sale.status === "cancelled")
  const completed = sales.filter((sale) => sale.status === "completed" && sale.payment?.status === "confirmed")
  const revenue = completed.reduce((sum, sale) => sum + (sale.payment?.amountPesewas ?? 0), 0)

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Persistent sales register"
        title="Sales"
        description={`Review real sale and manual payment records for ${membership.storeName}.`}
      />

      <div className="flex gap-3 rounded-2xl border border-[#CDE9D7] bg-[#F0FAF3] p-4 text-sm leading-6 text-[#267343]">
        <CircleAlert className="mt-0.5 size-5 shrink-0" />
        <p>Only sales with both a completed state and persisted confirmed payment are counted as revenue. Draft and awaiting-payment amounts are excluded.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sale metrics">
        <MetricCard label="Open drafts" value={String(drafts.length)} note="Employee-owned editable drafts" icon={ReceiptText} />
        <MetricCard label="Awaiting payment" value={String(awaiting.length)} note="Not counted as revenue" icon={Clock3} tone="amber" />
        <MetricCard label="Completed" value={String(completed.length)} note={`${cancelled.length} cancelled sale${cancelled.length === 1 ? "" : "s"}`} icon={ShoppingBag} tone="green" />
        <MetricCard label="Revenue" value={formatPesewas(revenue)} note="Completed paid sales only" icon={ShoppingBag} tone="green" />
      </section>

      <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
        <CardContent className="p-5">
          <form method="get" className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_160px_160px_auto] lg:items-end">
            <label className="relative block text-xs font-medium text-[#68686D]">Search
              <Search className="absolute bottom-3 left-3 size-4 text-[#A1A1A6]" />
              <input name="q" defaultValue={query} placeholder="Sale, customer, employee or IMEI" className="mt-1 h-10 w-full rounded-lg border border-[#E5E5E7] pl-9 pr-3 text-sm outline-none focus:border-[#6E0728]" />
            </label>
            <label className="block text-xs font-medium text-[#68686D]">Status
              <select name="status" defaultValue={status} className="mt-1 h-10 w-full rounded-lg border border-[#E5E5E7] bg-white px-3 text-sm outline-none focus:border-[#6E0728]">
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="awaiting_payment">Awaiting payment</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-[#68686D]">From
              <input type="date" name="from" defaultValue={from} className="mt-1 h-10 w-full rounded-lg border border-[#E5E5E7] px-3 text-sm outline-none focus:border-[#6E0728]" />
            </label>
            <label className="block text-xs font-medium text-[#68686D]">To
              <input type="date" name="to" defaultValue={to} className="mt-1 h-10 w-full rounded-lg border border-[#E5E5E7] px-3 text-sm outline-none focus:border-[#6E0728]" />
            </label>
            <button type="submit" className="h-10 rounded-full bg-[#6E0728] px-5 text-sm font-semibold text-white">Apply filters</button>
          </form>
        </CardContent>
      </Card>

      <section className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_390px]" : "grid-cols-1"}`}>
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-[#E8E8ED] p-5"><h2 className="font-semibold">Store sale register</h2><p className="mt-1 text-sm text-[#86868B]">{filtered.length} matching record{filtered.length === 1 ? "" : "s"}</p></div>
            {filtered.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wide text-[#86868B]"><tr><th className="px-5 py-3">Sale</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Total</th><th className="px-5 py-3">Status</th></tr></thead>
                  <tbody>
                    {filtered.map((sale) => {
                      const itemCount = sale.items.filter((item) => item.status === "active").length
                      const href = `/manager/sales?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), sale: sale.id }).toString()}`
                      return (
                        <tr key={sale.id} className={`border-t border-[#F0F0F2] ${selected?.id === sale.id ? "bg-[#FAF3F6]" : "bg-white hover:bg-[#FCF9FA]"}`}>
                          <td className="px-5 py-4"><Link href={href} className="block font-mono text-xs font-semibold text-[#6E0728]">{sale.saleNumber}</Link><p className="mt-1 text-xs text-[#86868B]">{dateTime(sale.createdAt)}</p></td>
                          <td className="px-4 py-4"><p className="font-medium">{sale.customer?.fullName ?? "Walk-in"}</p>{sale.customer ? <p className="mt-1 text-xs text-[#86868B]">{sale.customer.phone}</p> : null}</td>
                          <td className="px-4 py-4"><p>{itemCount} device{itemCount === 1 ? "" : "s"}</p><p className="mt-1 max-w-56 truncate text-xs text-[#86868B]">{sale.items.filter((item) => item.status === "active").map((item) => item.description).join(", ") || "No active items"}</p></td>
                          <td className="px-4 py-4 text-[#424245]">{sale.employeeName}</td>
                          <td className="px-4 py-4"><p className="font-semibold">{formatPesewas(sale.totalPesewas)}</p>{sale.discountPesewas ? <p className="mt-1 text-xs text-[#86868B]">Discount {formatPesewas(sale.discountPesewas)}</p> : null}</td>
                          <td className="px-5 py-4"><StatusBadge status={sale.status} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No sales found" description="No real sale records match the selected store, search, date, and status filters." />}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">Sale details</p><h2 className="mt-2 font-mono text-sm font-semibold text-[#6E0728]">{selected.saleNumber}</h2><p className="mt-1 text-xs text-[#86868B]">{dateTime(selected.createdAt)}</p></div><Link href="/manager/sales" aria-label="Close details" className="text-[#86868B]"><XCircle size={18} /></Link></div>
              <div className="mt-4"><StatusBadge status={selected.status} /></div>
              <div className="mt-5 space-y-4 border-t border-[#E8E8ED] pt-5">
                <Detail icon={UserRound} label="Customer" value={selected.customer?.fullName ?? "Walk-in customer"} />
                <Detail icon={ReceiptText} label="Employee" value={selected.employeeName} />
                <Detail icon={CalendarDays} label="Updated" value={dateTime(selected.updatedAt)} />
              </div>
              <div className="mt-5 space-y-3 border-t border-[#E8E8ED] pt-5">
                {selected.items.filter((item) => item.status === "active").map((item) => <div key={item.id} className="rounded-xl bg-[#F7F7F8] p-3"><p className="text-sm font-medium">{item.description}</p><p className="mt-1 font-mono text-[11px] text-[#86868B]">{item.imei}</p><div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-[#86868B]">Reservation {item.reservationStatus ?? "unknown"}</span><span className="font-semibold">{formatPesewas(item.lineTotalPesewas)}</span></div></div>)}
              </div>
              <div className="mt-5 space-y-3 border-t border-[#E8E8ED] pt-5 text-sm"><Total label="Subtotal" value={formatPesewas(selected.subtotalPesewas)} /><Total label="Discount" value={formatPesewas(selected.discountPesewas)} /><Total label="Total" value={formatPesewas(selected.totalPesewas)} strong /></div>
              {selected.payment ? <div className="mt-5 space-y-2 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] p-3 text-xs text-[#267343]"><p className="font-semibold">Confirmed {selected.payment.method.replaceAll("_", " ")} payment</p><p>{formatPesewas(selected.payment.amountPesewas)} · {dateTime(selected.payment.confirmedAt)}</p><p>Confirmed by {selected.payment.confirmerName}</p>{selected.payment.transactionReference ? <p className="break-words">Reference: {selected.payment.transactionReference}</p> : null}</div> : null}
              {selected.status === "awaiting_payment" ? <p className="mt-5 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-3 text-xs leading-5 text-[#765613]">No payment is recorded. Do not treat this amount as revenue or release inventory.</p> : null}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  )
}

function Detail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div className="flex gap-3"><Icon size={16} className="mt-0.5 shrink-0 text-[#6E0728]" /><div><p className="text-xs text-[#86868B]">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div></div>
}
function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 ${strong ? "text-base font-semibold text-[#6E0728]" : ""}`}><span>{label}</span><span>{value}</span></div>
}
