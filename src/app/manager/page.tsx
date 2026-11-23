"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  PackageCheck,
  ReceiptText,
  Search,
  Smartphone,
  TrendingUp,
} from "lucide-react"

import { DataBadge, DemoNotice, MetricCard, PageHeader } from "@/components/manager/manager-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { initialApprovals, inventoryPhones, money, sales } from "@/lib/manager-data"

export default function ManagerDashboard() {
  const [search, setSearch] = useState("")

  const completedSales = sales.filter((sale) => sale.status === "Completed" && sale.paymentStatus === "Verified")
  const confirmedRevenue = completedSales.reduce((total, sale) => total + sale.total, 0)
  const collected = sales.reduce((total, sale) => total + sale.received, 0)
  const availablePhones = inventoryPhones.filter((phone) => phone.status === "Available").length
  const pendingApprovals = initialApprovals.filter((approval) => approval.status === "Pending")

  const query = search.toLowerCase().trim()
  const filteredSales = query
    ? sales.filter((sale) =>
        [sale.id, sale.customer, sale.phone, sale.employee]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
    : sales.slice(0, 5)

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Monday · 23 November 2026"
        title="Store overview"
        description="A clear view of sales, verified collections, inventory and the work that needs your attention."
        action={
          <Button render={<Link href="/manager/reports" />} className="h-10 bg-[#6E0728] px-4 text-white hover:bg-[#57051F]">
            Open reports <ArrowUpRight size={16} />
          </Button>
        }
      />

      <DemoNotice>
        Dashboard figures are sample data for this interface preview. Confirmed revenue only includes completed sales with a verified payment state.
      </DemoNotice>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Store metrics">
        <MetricCard label="Confirmed revenue" value={money(confirmedRevenue)} note={`${completedSales.length} fully paid sales`} icon={TrendingUp} tone="green" />
        <MetricCard label="Money received" value={money(collected)} note="Across all recorded payments" icon={CreditCard} />
        <MetricCard label="Available devices" value={String(availablePhones)} note={`${inventoryPhones.length} devices tracked by IMEI`} icon={Smartphone} tone="blue" />
        <MetricCard label="Pending approvals" value={String(pendingApprovals.length)} note="Manager review required" icon={ClipboardCheck} tone="amber" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Sales pulse</CardTitle>
              <CardDescription className="mt-1">Confirmed sales value over the last seven days</CardDescription>
            </div>
            <DataBadge tone="green">+12.8%</DataBadge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 items-end gap-2 pt-4 sm:gap-3" aria-label="Seven day sales chart">
              {[3200, 6100, 4900, 7200, 8500, 5300, 15700].map((amount, index) => {
                const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                const heights = [20, 39, 31, 46, 54, 34, 100]
                return (
                  <div key={labels[index]} className="flex min-w-0 flex-col items-center gap-2">
                    <span className="hidden text-[10px] font-medium text-[#86868B] sm:block">{money(amount).replace("GH₵ ", "₵")}</span>
                    <div className="flex h-44 w-full items-end rounded-lg bg-[#F7F7F8] p-1">
                      <div
                        className={`w-full rounded-md ${index === 6 ? "bg-[#6E0728]" : "bg-[#D9C1CA]"}`}
                        style={{ height: `${heights[index]}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#86868B]">{labels[index]}</span>
                  </div>
                )
              })}
            </div>
            <Separator className="my-5" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[#86868B]">Transactions</p>
                <p className="mt-1 text-xl font-semibold">9</p>
              </div>
              <div>
                <p className="text-xs text-[#86868B]">Average sale</p>
                <p className="mt-1 text-xl font-semibold">{money(5956)}</p>
              </div>
              <div>
                <p className="text-xs text-[#86868B]">Gross margin</p>
                <p className="mt-1 text-xl font-semibold text-[#267343]">16.1%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Needs attention</CardTitle>
              <CardDescription className="mt-1">Sensitive actions awaiting review</CardDescription>
            </div>
            <DataBadge tone="amber">{pendingApprovals.length} open</DataBadge>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals.slice(0, 3).map((approval) => (
              <Link
                href="/manager/approvals"
                key={approval.id}
                className="group flex items-start gap-3 rounded-xl border border-[#ECECEF] p-3 transition hover:border-[#DCC4CD] hover:bg-[#FCF9FA]"
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF7E8] text-[#98701A]">
                  <ClipboardCheck size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#1D1D1F]">{approval.title}</span>
                  <span className="mt-1 block text-xs text-[#86868B]">{approval.requestedBy} · {approval.reference}</span>
                </span>
                <ArrowRight className="mt-2 size-4 text-[#A1A1A6] transition group-hover:translate-x-0.5" />
              </Link>
            ))}
            <Button render={<Link href="/manager/approvals" />} variant="outline" className="mt-2 w-full">
              Review all approvals
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Recent sales</CardTitle>
                <CardDescription className="mt-1">Latest transactions and payment state</CardDescription>
              </div>
              <Button render={<Link href="/manager/sales" />} variant="ghost" size="sm">
                View all <ArrowRight size={14} />
              </Button>
            </div>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A1A1A6]" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search recent sales" className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-y border-[#ECECEF] bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">
                  <tr>
                    <th className="px-5 py-3">Sale</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-5 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-[#F0F0F2] last:border-0">
                      <td className="px-5 py-4">
                        <p className="font-medium">{sale.id}</p>
                        <p className="mt-1 text-xs text-[#86868B]">{sale.phone}</p>
                      </td>
                      <td className="px-4 py-4 text-[#424245]">{sale.customer}</td>
                      <td className="px-4 py-4 font-medium">{money(sale.total)}</td>
                      <td className="px-4 py-4 text-[#424245]">{sale.employee}</td>
                      <td className="px-5 py-4">
                        <DataBadge tone={sale.paymentStatus === "Verified" ? "green" : sale.paymentStatus === "Partially verified" ? "blue" : "amber"}>
                          {sale.paymentStatus}
                        </DataBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Inventory watch</CardTitle>
              <CardDescription className="mt-1">Current physical stock</CardDescription>
            </div>
            <Button render={<Link href="/manager/inventory" />} variant="ghost" size="icon" aria-label="Open inventory">
              <ArrowUpRight size={16} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {inventoryPhones.filter((phone) => phone.status !== "Sold").slice(0, 4).map((phone) => (
              <div key={phone.id} className="flex items-center gap-3 rounded-xl border border-[#ECECEF] p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#F5EDF0] text-[#6E0728]">
                  <Smartphone size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{phone.model}</p>
                  <p className="mt-1 truncate text-xs text-[#86868B]">{phone.storage} · {phone.colour}</p>
                </div>
                <DataBadge tone={phone.status === "Available" ? "green" : "amber"}>{phone.status}</DataBadge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { title: "Sale completed", detail: "Alex completed ME-2026-1048", time: "12 min ago", icon: CheckCircle2 },
          { title: "Stock reconciled", detail: "48 physical devices checked", time: "1 hr ago", icon: PackageCheck },
          { title: "Receipt issued", detail: "Receipt for ME-2026-1046", time: "Yesterday", icon: ReceiptText },
        ].map((activity) => (
          <Card key={activity.title} className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#F5EDF0] text-[#6E0728]">
                <activity.icon size={17} />
              </span>
              <div>
                <p className="text-sm font-medium">{activity.title}</p>
                <p className="mt-1 text-xs leading-5 text-[#86868B]">{activity.detail}</p>
                <p className="mt-1 text-[11px] text-[#A1A1A6]">{activity.time}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  )
}
