"use client"

import { useState } from "react"
import {
  ArrowDownRight,
  CheckCircle2,
  CircleAlert,
  Printer,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react"

import {
  DataBadge,
  DemoNotice,
  DetailRow,
  EmptyState,
  MetricCard,
  PageHeader,
} from "@/components/manager/manager-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { money, sales, type Sale, type SaleStatus } from "@/lib/manager-data"

export default function SalesPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"All" | SaleStatus>("All")
  const [methodFilter, setMethodFilter] = useState("All")
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)

  const completed = sales.filter((sale) => sale.status === "Completed" && sale.paymentStatus === "Verified")
  const confirmedRevenue = completed.reduce((total, sale) => total + sale.total, 0)
  const recordedCollections = sales.reduce((total, sale) => total + sale.received, 0)
  const outstanding = sales.reduce((total, sale) => total + Math.max(0, sale.total - sale.received), 0)
  const awaitingVerification = sales.filter((sale) => sale.paymentStatus !== "Verified").length

  const query = search.toLowerCase().trim()
  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      !query ||
      [sale.id, sale.customer, sale.employee, sale.phone, sale.imei]
        .join(" ")
        .toLowerCase()
        .includes(query)
    const matchesStatus = statusFilter === "All" || sale.status === statusFilter
    const matchesMethod = methodFilter === "All" || sale.method === methodFilter
    return matchesSearch && matchesStatus && matchesMethod
  })

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Transaction management"
        title="Sales"
        description="Review customer purchases, payment confirmation, collections and outstanding balances without losing the device-level audit trail."
      />

      <DemoNotice>
        These are sample transactions. A payment reference is not proof of payment; production completion must wait for a trusted provider, bank or authorised cash confirmation.
      </DemoNotice>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sales metrics">
        <MetricCard label="Confirmed revenue" value={money(confirmedRevenue)} note={`${completed.length} completed and verified`} icon={CheckCircle2} tone="green" />
        <MetricCard label="Recorded collections" value={money(recordedCollections)} note="Verified and partially verified entries" icon={Wallet} />
        <MetricCard label="Outstanding" value={money(outstanding)} note="Must be cleared before handover" icon={ArrowDownRight} tone="amber" />
        <MetricCard label="Needs confirmation" value={String(awaitingVerification)} note="Payment checks still open" icon={ShieldCheck} tone="blue" />
      </section>

      <section className={`grid gap-5 ${selectedSale ? "xl:grid-cols-[minmax(0,1fr)_370px]" : "grid-cols-1"}`}>
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-col justify-between gap-4 border-b border-[#E8E8ED] p-5 lg:flex-row lg:items-center">
              <div>
                <h2 className="font-semibold">Transaction register</h2>
                <p className="mt-1 text-sm text-[#86868B]">{filteredSales.length} transactions shown</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A1A1A6]" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Receipt, customer or IMEI" className="w-full pl-9 sm:w-60" />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "All" | SaleStatus)}
                  className="h-8 rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]"
                  aria-label="Filter sale status"
                >
                  <option value="All">All statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Partially paid">Partially paid</option>
                </select>
                <select
                  value={methodFilter}
                  onChange={(event) => setMethodFilter(event.target.value)}
                  className="h-8 rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]"
                  aria-label="Filter payment method"
                >
                  <option value="All">All methods</option>
                  <option value="Cash">Cash</option>
                  <option value="MTN MoMo">MTN MoMo</option>
                  <option value="Other Mobile Money">Other mobile money</option>
                  <option value="Bank Transfer">Bank transfer</option>
                  <option value="Card">Card</option>
                  <option value="Split">Split</option>
                </select>
              </div>
            </div>

            {filteredSales.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">
                    <tr>
                      <th className="px-5 py-3">Receipt</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Device</th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Total / received</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-5 py-3">Payment status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((sale) => (
                      <tr
                        key={sale.id}
                        onClick={() => setSelectedSale(sale)}
                        className={`cursor-pointer border-t border-[#F0F0F2] transition hover:bg-[#FCF9FA] ${selectedSale?.id === sale.id ? "bg-[#FAF3F6]" : "bg-white"}`}
                      >
                        <td className="px-5 py-4">
                          <p className="font-medium">{sale.id}</p>
                          <p className="mt-1 text-xs text-[#86868B]">{sale.date} · {sale.time}</p>
                        </td>
                        <td className="px-4 py-4 text-[#424245]">{sale.customer}</td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-[#424245]">{sale.phone}</p>
                          <p className="mt-1 font-mono text-[11px] text-[#86868B]">{sale.imei}</p>
                        </td>
                        <td className="px-4 py-4 text-[#424245]">{sale.employee}</td>
                        <td className="px-4 py-4">
                          <p className="font-medium">{money(sale.total)}</p>
                          <p className="mt-1 text-xs text-[#86868B]">Received {money(sale.received)}</p>
                        </td>
                        <td className="px-4 py-4 text-[#424245]">{sale.method}</td>
                        <td className="px-5 py-4"><PaymentBadge sale={sale} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No transactions found" description="Try removing a filter or searching by a different receipt, customer or IMEI." />
            )}
          </CardContent>
        </Card>

        {selectedSale ? (
          <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">Transaction details</p>
                  <h2 className="mt-2 text-lg font-semibold">{selectedSale.id}</h2>
                  <p className="mt-1 text-sm text-[#86868B]">{selectedSale.date} · {selectedSale.time}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedSale(null)} aria-label="Close transaction"><X size={17} /></Button>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <SaleBadge status={selectedSale.status} />
                <PaymentBadge sale={selectedSale} />
              </div>

              {selectedSale.paymentStatus !== "Verified" ? (
                <div className="mt-5 flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-3 text-xs leading-5 text-[#765613]">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <p>Do not hand over this device. Full payment has not been independently confirmed.</p>
                </div>
              ) : null}

              <Separator className="my-5" />
              <div className="space-y-4">
                <DetailRow label="Customer" value={selectedSale.customer} />
                <DetailRow label="Employee" value={selectedSale.employee} />
                <DetailRow label="Device" value={selectedSale.phone} />
                <DetailRow label="IMEI" value={selectedSale.imei} mono />
                <DetailRow label="Payment method" value={selectedSale.method} />
              </div>
              <Separator className="my-5" />
              <div className="space-y-4">
                <DetailRow label="Sale total" value={money(selectedSale.total)} />
                <DetailRow label="Amount received" value={money(selectedSale.received)} />
                <DetailRow label="Balance due" value={money(Math.max(0, selectedSale.total - selectedSale.received))} />
              </div>

              <div className="mt-5 rounded-xl bg-[#F7F7F8] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#86868B]">Payment progress</span>
                  <span className="font-medium">{Math.round((selectedSale.received / selectedSale.total) * 100)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E5E5EA]">
                  <div className="h-full rounded-full bg-[#6E0728]" style={{ width: `${Math.min(100, (selectedSale.received / selectedSale.total) * 100)}%` }} />
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium text-[#68686D]">Payment references</p>
                <div className="mt-2 space-y-2">
                  {selectedSale.references.map((reference) => (
                    <div key={reference} className="rounded-lg border border-[#E8E8ED] bg-white px-3 py-2 font-mono text-xs text-[#424245]">{reference}</div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-4 text-[#A1A1A6]">References are identifiers only and do not independently verify a payment.</p>
              </div>

              <Button variant="outline" className="mt-5 w-full" onClick={() => window.print()} disabled={selectedSale.paymentStatus !== "Verified"}>
                <Printer size={16} /> Print receipt
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  )
}

function SaleBadge({ status }: { status: SaleStatus }) {
  return <DataBadge tone={status === "Completed" ? "green" : status === "Pending" ? "amber" : "blue"}>{status}</DataBadge>
}

function PaymentBadge({ sale }: { sale: Sale }) {
  return (
    <DataBadge tone={sale.paymentStatus === "Verified" ? "green" : sale.paymentStatus === "Partially verified" ? "blue" : "amber"}>
      {sale.paymentStatus}
    </DataBadge>
  )
}
