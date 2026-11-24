import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  PackageCheck,
  ReceiptText,
  Search,
  Smartphone,
  TrendingUp,
} from "lucide-react"

import { DataBadge, EmptyState, MetricCard, PageHeader } from "@/components/manager/manager-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { requirePermissions } from "@/lib/auth/server"
import { inventoryStatusLabel, summarizeInventoryStatuses } from "@/lib/inventory-status"
import { listAuthorizedInventory } from "@/lib/inventory-server"
import {
  confirmedRevenuePesewas,
  periodRange,
  salesInDateWindow,
  seriesForRange,
  storeDateKey,
  summarizeSales,
} from "@/lib/reporting"
import { formatPesewas, matchesSaleSearch, saleStatusLabel, type SaleStatus } from "@/lib/sales"
import {
  countOpenManagerSales,
  getLatestCompletedManagerSale,
  listManagerSalesForWindow,
  listOpenManagerSales,
  listRecentManagerSales,
  type PersistentSale,
} from "@/lib/sales-server"

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value))
}

function shortDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  }).format(new Date(value))
}

function statusTone(status: SaleStatus) {
  if (status === "completed") return "green" as const
  if (status === "awaiting_payment") return "amber" as const
  if (status === "cancelled") return "neutral" as const
  return "blue" as const
}

function saleLabel(sale: PersistentSale) {
  return sale.customer?.fullName ?? "Walk-in customer"
}

export default async function ManagerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { membership } = await requirePermissions(["access_manager_workspace"], { nextPath: "/manager" })
  const params = await searchParams

  const weekRange = periodRange("weekly")
  const monthRange = periodRange("monthly")

  // One complete, paginated scan covers both the seven-day pulse and the
  // month-to-date footer: the month starts at or before the week, so the union
  // of the two windows is bounded by the earlier start and today.
  const reportingWindow = {
    fromKey: monthRange.fromKey < weekRange.fromKey ? monthRange.fromKey : weekRange.fromKey,
    toKey: storeDateKey(new Date()),
  }

  const [windowSales, recentRecords, openWork, openCount, latestCompleted, inventory] = await Promise.all([
    listManagerSalesForWindow(membership.storeId, reportingWindow),
    listRecentManagerSales(membership.storeId, 5),
    listOpenManagerSales(membership.storeId, 4),
    countOpenManagerSales(membership.storeId),
    getLatestCompletedManagerSale(membership.storeId),
    listAuthorizedInventory(membership.storeId),
  ])

  const weekSales = salesInDateWindow(windowSales, weekRange)
  const weekSummary = summarizeSales(weekSales)
  const monthSummary = summarizeSales(salesInDateWindow(windowSales, monthRange))
  const series = seriesForRange(weekSales, weekRange)
  const peak = Math.max(...series.map((point) => point.revenuePesewas), 0)
  const inventorySummary = summarizeInventoryStatuses(inventory.map((device) => device.status))

  const query = params.q?.trim() ?? ""
  const matchingSales = query
    ? windowSales.filter((sale) =>
        matchesSaleSearch(
          {
            saleNumber: sale.saleNumber,
            customerName: sale.customer?.fullName ?? null,
            employeeName: sale.employeeName,
            itemDescriptions: sale.items.filter((item) => item.status === "active").map((item) => item.description),
            imeis: sale.items.filter((item) => item.status === "active").map((item) => item.imei),
          },
          query
        )
      )
    : []
  const recentSales = query ? matchingSales.slice(0, 5) : recentRecords
  const latestAwaiting = openWork.find((sale) => sale.status === "awaiting_payment") ?? null
  const latestDevice = inventory[0] ?? null

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow={`Live store data · ${membership.storeName}`}
        title="Store overview"
        description="Confirmed revenue, live stock and open sale work read directly from this store's database records."
        action={
          <Button render={<Link href="/manager/reports" />} className="h-10 bg-[#6E0728] px-4 text-white hover:bg-[#57051F]">
            Open reports <ArrowUpRight size={16} />
          </Button>
        }
      />

      <div className="flex gap-3 rounded-xl border border-[#E8E8ED] bg-[#FAFAFB] px-4 py-3 text-xs leading-5 text-[#68686D]">
        <PackageCheck className="mt-0.5 size-4 shrink-0 text-[#6E0728]" aria-hidden="true" />
        <p>
          Every figure below is calculated from persisted records for {membership.storeName}. Only completed sales with a
          confirmed payment count as revenue; drafts, awaiting-payment and cancelled sales are excluded.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Store metrics">
        <MetricCard
          label="Confirmed revenue"
          value={formatPesewas(weekSummary.confirmedRevenuePesewas)}
          note={`Last 7 store days · ${weekSummary.completedSales} completed paid sale${weekSummary.completedSales === 1 ? "" : "s"}`}
          icon={TrendingUp}
          tone="green"
        />
        <MetricCard
          label="Completed sales"
          value={String(weekSummary.completedSales)}
          note={`Last 7 store days · ${weekSummary.completedWithoutVerifiedPayment} without verified payment`}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Awaiting payment"
          value={String(weekSummary.awaitingPaymentSales)}
          note={`${formatPesewas(weekSummary.awaitingPaymentValuePesewas)} on hold · not revenue`}
          icon={Clock3}
          tone="amber"
        />
        <MetricCard
          label="Available devices"
          value={String(inventorySummary.available)}
          note={`${inventorySummary.total} live IMEI record${inventorySummary.total === 1 ? "" : "s"} in this store`}
          icon={Smartphone}
          tone="blue"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Sales pulse</CardTitle>
              <CardDescription className="mt-1">
                Confirmed revenue per store day · {weekRange.fromKey} to {weekRange.toKey}
              </CardDescription>
            </div>
            <DataBadge tone="neutral">Africa/Accra</DataBadge>
          </CardHeader>
          <CardContent>
            {peak > 0 ? (
              <div className="grid grid-cols-7 items-end gap-2 pt-4 sm:gap-3" aria-label="Confirmed revenue for the last seven store days">
                {series.map((point, index) => (
                  <div key={point.key} className="flex min-w-0 flex-col items-center gap-2">
                    <span className="hidden text-[10px] font-medium text-[#86868B] sm:block">
                      {formatPesewas(point.revenuePesewas).replace("GH₵", "₵")}
                    </span>
                    <div className="flex h-44 w-full items-end rounded-lg bg-[#F7F7F8] p-1">
                      <div
                        className={`w-full rounded-md ${index === series.length - 1 ? "bg-[#6E0728]" : "bg-[#D9C1CA]"}`}
                        style={{ height: `${Math.max(peak > 0 && point.revenuePesewas > 0 ? 4 : 0, (point.revenuePesewas / peak) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#86868B]">{point.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No completed sales in the last seven store days"
                description="Confirmed revenue will appear here as soon as an employee completes a sale with a verified payment."
              />
            )}
            <Separator className="my-5" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[#86868B]">Completed sales</p>
                <p className="mt-1 text-xl font-semibold">{weekSummary.completedSales}</p>
              </div>
              <div>
                <p className="text-xs text-[#86868B]">Average sale</p>
                <p className="mt-1 text-xl font-semibold">{formatPesewas(weekSummary.averageCompletedSalePesewas)}</p>
              </div>
              <div>
                <p className="text-xs text-[#86868B]">Awaiting payment</p>
                <p className="mt-1 text-xl font-semibold text-[#8A6517]">{weekSummary.awaitingPaymentSales}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Needs attention</CardTitle>
              <CardDescription className="mt-1">Open drafts and sales awaiting payment</CardDescription>
            </div>
            <DataBadge tone="amber">{openCount} open</DataBadge>
          </CardHeader>
          <CardContent className="space-y-3">
            {openWork.length ? (
              openWork.map((sale) => (
                <Link
                  key={sale.id}
                  href={`/manager/sales?status=${sale.status}&sale=${encodeURIComponent(sale.id)}`}
                  className="group flex items-start gap-3 rounded-xl border border-[#ECECEF] p-3 transition hover:border-[#DCC4CD] hover:bg-[#FCF9FA]"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF7E8] text-[#98701A]">
                    {sale.status === "draft" ? <ReceiptText size={17} /> : <Clock3 size={17} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#1D1D1F]">{sale.saleNumber}</span>
                    <span className="mt-1 block truncate text-xs text-[#86868B]">
                      {saleStatusLabel(sale.status)} · {saleLabel(sale)} · {formatPesewas(sale.totalPesewas)}
                    </span>
                  </span>
                  <ArrowRight className="mt-2 size-4 text-[#A1A1A6] transition group-hover:translate-x-0.5" />
                </Link>
              ))
            ) : (
              <EmptyState
                title="Nothing needs attention"
                description="There are no open drafts or sales awaiting payment for this store right now."
              />
            )}
            <Button render={<Link href="/manager/sales" />} variant="outline" className="mt-2 w-full">
              Open sales register
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
                <CardDescription className="mt-1">
                  {query
                    ? `${matchingSales.length} match${matchingSales.length === 1 ? "" : "es"} for “${query}” · ${reportingWindow.fromKey} to ${reportingWindow.toKey}`
                    : "Latest persisted sale records for this store"}
                </CardDescription>
              </div>
              <Button render={<Link href="/manager/sales" />} variant="ghost" size="sm">
                View all <ArrowRight size={14} />
              </Button>
            </div>
            <form method="get" className="flex max-w-sm gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A1A1A6]" />
                <Input name="q" defaultValue={params.q ?? ""} placeholder="Sale, customer, employee or IMEI" className="pl-9" />
              </div>
              <button type="submit" className="h-10 rounded-full border border-[#D8C4CB] px-4 text-xs font-semibold text-[#6E0728]">Search</button>
            </form>
          </CardHeader>
          <CardContent className="p-0">
            {recentSales.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-y border-[#ECECEF] bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">
                    <tr>
                      <th className="px-5 py-3">Sale</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((sale) => (
                      <tr key={sale.id} className="border-b border-[#F0F0F2] last:border-0">
                        <td className="px-5 py-4">
                          <Link href={`/manager/sales?sale=${encodeURIComponent(sale.id)}`} className="font-mono text-xs font-semibold text-[#6E0728]">
                            {sale.saleNumber}
                          </Link>
                          <p className="mt-1 text-xs text-[#86868B]">{dateTime(sale.createdAt)}</p>
                        </td>
                        <td className="px-4 py-4 text-[#424245]">{saleLabel(sale)}</td>
                        <td className="px-4 py-4 font-medium">{formatPesewas(sale.totalPesewas)}</td>
                        <td className="px-4 py-4 text-[#424245]">{sale.employeeName}</td>
                        <td className="px-5 py-4">
                          <DataBadge tone={statusTone(sale.status)}>{saleStatusLabel(sale.status)}</DataBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={query ? "No matching sales" : "No sales recorded yet"}
                description={
                  query
                    ? "No persisted sale in this store matches the search term."
                    : "Sales created by employees in this store will appear here as soon as the first draft is started."
                }
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Inventory watch</CardTitle>
              <CardDescription className="mt-1">Live RLS-scoped physical stock</CardDescription>
            </div>
            <Button render={<Link href="/manager/inventory" />} variant="ghost" size="icon" aria-label="Open live inventory">
              <ArrowUpRight size={16} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {inventory.filter((device) => device.status !== "sold").slice(0, 4).map((device) => (
              <div key={device.inventoryId} className="flex items-center gap-3 rounded-xl border border-[#ECECEF] p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#F5EDF0] text-[#6E0728]">
                  <Smartphone size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{device.model}</p>
                  <p className="mt-1 truncate text-xs text-[#86868B]">{device.storage} · {device.colour} · {device.imei.slice(-6)}</p>
                </div>
                <DataBadge tone={device.status === "available" ? "green" : "amber"}>{inventoryStatusLabel(device.status)}</DataBadge>
              </div>
            ))}
            {inventory.filter((device) => device.status !== "sold").length === 0 ? (
              <EmptyState
                title="No available or reserved inventory"
                description="Receive stock through opening stock and approved activation to add persisted devices to this store."
              />
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Latest store records">
        <LatestCard
          title="Latest completed sale"
          icon={CheckCircle2}
          detail={latestCompleted ? `${latestCompleted.saleNumber} · ${formatPesewas(confirmedRevenuePesewas(latestCompleted))}` : null}
          meta={latestCompleted ? `${latestCompleted.employeeName} · ${shortDateTime(latestCompleted.completedAt ?? latestCompleted.createdAt)}` : null}
          empty="No sale has been completed in this store yet."
        />
        <LatestCard
          title="Latest waiting payment"
          icon={CreditCard}
          detail={latestAwaiting ? `${latestAwaiting.saleNumber} · ${formatPesewas(latestAwaiting.totalPesewas)}` : null}
          meta={latestAwaiting ? `${latestAwaiting.employeeName} · ${shortDateTime(latestAwaiting.updatedAt)}` : null}
          empty="No sale is currently awaiting payment."
        />
        <LatestCard
          title="Latest device received"
          icon={PackageCheck}
          detail={latestDevice ? `${latestDevice.model} · ${latestDevice.storage}` : null}
          meta={latestDevice ? `${latestDevice.status} · received ${shortDateTime(latestDevice.receivedAt)}` : null}
          empty="No physical device is registered in this store yet."
        />
      </section>

      <p className="text-xs leading-5 text-[#A1A1A6]">
        This month to date: {formatPesewas(monthSummary.confirmedRevenuePesewas)} confirmed revenue from{" "}
        {monthSummary.completedSales} completed paid sale{monthSummary.completedSales === 1 ? "" : "s"} ·{" "}
        {monthSummary.draftSales} open draft{monthSummary.draftSales === 1 ? "" : "s"} ·{" "}
        {monthSummary.cancelledSales} cancelled. Device cost and profit are not shown because acquisition cost is not
        exposed to the application role.
      </p>
    </main>
  )
}

function LatestCard({
  title,
  icon: Icon,
  detail,
  meta,
  empty,
}: {
  title: string
  icon: React.ElementType
  detail: string | null
  meta: string | null
  empty: string
}) {
  return (
    <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#F5EDF0] text-[#6E0728]">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {detail ? (
            <>
              <p className="mt-1 break-words text-xs leading-5 text-[#86868B]">{detail}</p>
              <p className="mt-1 text-[11px] text-[#A1A1A6]">{meta}</p>
            </>
          ) : (
            <p className="mt-1 text-xs leading-5 text-[#86868B]">{empty}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
