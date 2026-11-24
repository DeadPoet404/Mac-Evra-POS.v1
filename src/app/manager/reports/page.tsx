import Link from "next/link"
import { ChartNoAxesCombined, CircleAlert, Download, Percent, ReceiptText, TrendingUp, Wallet } from "lucide-react"

import { DataBadge, EmptyState, MetricCard, PageHeader } from "@/components/manager/manager-ui"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissions } from "@/lib/auth/server"
import {
  breakdownByEmployee,
  breakdownByModel,
  breakdownByPaymentMethod,
  isReportPeriod,
  periodRange,
  reportPeriods,
  salesInRange,
  seriesForRange,
  sharePercent,
  summarizeSales,
  type BreakdownRow,
  type ReportPeriod,
} from "@/lib/reporting"
import { formatPesewas } from "@/lib/sales"
import { listManagerSales } from "@/lib/sales-server"

const periodLabels: Record<ReportPeriod, string> = {
  daily: "Today",
  weekly: "Last 7 days",
  monthly: "This month",
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { membership } = await requirePermissions(["access_manager_workspace", "view_reports"], {
    nextPath: "/manager/reports",
  })
  const params = await searchParams
  const period: ReportPeriod = isReportPeriod(params.period) ? params.period : "monthly"

  const sales = await listManagerSales(membership.storeId)
  const range = periodRange(period)
  const periodSales = salesInRange(sales, range)
  const summary = summarizeSales(periodSales)
  const series = seriesForRange(periodSales, range)
  const peak = Math.max(...series.map((point) => point.revenuePesewas), 0)
  const employees = breakdownByEmployee(periodSales)
  const models = breakdownByModel(periodSales)
  const paymentMethods = breakdownByPaymentMethod(periodSales)
  const hasRevenue = summary.completedSales > 0

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow={`Live store records · ${membership.storeName}`}
        title="Reports"
        description="Confirmed revenue, payment mix and device mix for the selected period, calculated from persisted sales in this store."
        action={
          <Link
            href={`/manager/reports/export?period=${period}`}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#D8C4CB] bg-white px-4 text-sm font-semibold text-[#6E0728]"
          >
            <Download size={16} /> Export CSV
          </Link>
        }
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-[#E8E8ED] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Reporting period</p>
          <p className="mt-1 text-xs text-[#86868B]">{range.label} · Africa/Accra · {range.fromKey} to {range.toKey}</p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F1F1F3] p-1">
          {reportPeriods.map((item) => (
            <Link
              key={item}
              href={`/manager/reports?period=${item}`}
              aria-current={period === item ? "page" : undefined}
              className={`rounded-lg px-4 py-2 text-center text-xs font-medium capitalize transition ${
                period === item ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#68686D] hover:text-[#1D1D1F]"
              }`}
            >
              {periodLabels[item]}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex gap-3 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-xs leading-5 text-[#267343]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Only completed sales with a persisted, confirmed GHS payment are revenue. Draft, awaiting-payment and cancelled
          sales are excluded from every total below and from the CSV export.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Report metrics">
        <MetricCard
          label="Confirmed revenue"
          value={formatPesewas(summary.confirmedRevenuePesewas)}
          note={`${summary.completedSales} completed paid sale${summary.completedSales === 1 ? "" : "s"}`}
          icon={TrendingUp}
          tone="green"
        />
        <MetricCard
          label="Average sale"
          value={formatPesewas(summary.averageCompletedSalePesewas)}
          note="Confirmed revenue ÷ completed paid sales"
          icon={ReceiptText}
        />
        <MetricCard
          label="Awaiting payment"
          value={String(summary.awaitingPaymentSales)}
          note={`${formatPesewas(summary.awaitingPaymentValuePesewas)} excluded from revenue`}
          icon={Wallet}
          tone="amber"
        />
        <MetricCard
          label="Open drafts"
          value={String(summary.draftSales)}
          note={`${formatPesewas(summary.draftValuePesewas)} excluded from revenue`}
          icon={ChartNoAxesCombined}
          tone="blue"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Confirmed revenue over time</CardTitle>
              <CardDescription className="mt-1">Completed paid sales per store day</CardDescription>
            </div>
            <DataBadge tone={hasRevenue ? "green" : "neutral"}>{hasRevenue ? "Recorded" : "No records"}</DataBadge>
          </CardHeader>
          <CardContent>
            {peak > 0 ? (
              <div className="flex h-64 items-end gap-1.5 border-b border-[#E8E8ED] sm:gap-3" aria-label="Confirmed revenue per store day">
                {series.map((point) => (
                  <div key={point.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <span className="hidden text-[10px] font-medium text-[#68686D] sm:block">
                      {point.revenuePesewas > 0 ? formatPesewas(point.revenuePesewas).replace("GH₵", "₵") : ""}
                    </span>
                    <div className="flex h-[80%] w-full items-end rounded-t-lg bg-[#FAF7F8] px-1 pt-1">
                      <div
                        className="w-full rounded-t-md bg-[#6E0728]"
                        style={{ height: `${point.revenuePesewas > 0 ? Math.max(4, (point.revenuePesewas / peak) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="mb-2 truncate text-[10px] text-[#86868B] sm:text-[11px]">{point.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No completed sales in this period"
                description="There is no confirmed revenue to chart for the selected period. Choose a different period or record a completed sale."
              />
            )}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-[#86868B]">Completed paid sales</p>
                <p className="mt-1 text-lg font-semibold">{summary.completedSales}</p>
              </div>
              <div>
                <p className="text-xs text-[#86868B]">Completed, payment unverified</p>
                <p className="mt-1 text-lg font-semibold">{summary.completedWithoutVerifiedPayment}</p>
              </div>
              <div>
                <p className="text-xs text-[#86868B]">Cancelled sales</p>
                <p className="mt-1 text-lg font-semibold">{summary.cancelledSales}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Revenue quality</CardTitle>
            <CardDescription className="mt-1">What is counted, and what is deliberately not</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl bg-[#6E0728] p-5 text-white">
              <p className="text-xs text-white/70">Confirmed revenue</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{formatPesewas(summary.confirmedRevenuePesewas)}</p>
              <p className="mt-2 text-sm text-white/75">
                {summary.completedSales} completed paid sale{summary.completedSales === 1 ? "" : "s"} in {range.label.toLowerCase()}
              </p>
            </div>
            <div className="mt-5 space-y-4">
              <ReportRow label="Awaiting payment (excluded)" value={formatPesewas(summary.awaitingPaymentValuePesewas)} />
              <ReportRow label="Open drafts (excluded)" value={formatPesewas(summary.draftValuePesewas)} />
              <ReportRow label="Cancelled sales (excluded)" value={String(summary.cancelledSales)} />
              <ReportRow label="Total sales in period" value={String(summary.totalSales)} />
            </div>
            <div className="mt-5 flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-xs leading-5 text-[#765613]">
              <Percent className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                Gross profit and margin are not reported: device acquisition cost is not granted to the application role
                by the database, and Mac Evra POS does not estimate it.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <BreakdownCard
          title="Sales by employee"
          description="Completed paid sales grouped by the employee who completed them"
          rows={employees}
          total={summary.confirmedRevenuePesewas}
          unitLabel="sale"
          emptyTitle="No completed sales by employee"
          emptyDescription="No employee has a completed paid sale in this period."
        />
        <BreakdownCard
          title="Sales by device model"
          description="Units and revenue from active sale items on completed paid sales"
          rows={models}
          total={models.reduce((sum, row) => sum + row.revenuePesewas, 0)}
          unitLabel="unit"
          emptyTitle="No device sales in this period"
          emptyDescription="Device mix appears once a completed paid sale contains an active device line."
        />
      </section>

      <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Payment method breakdown</CardTitle>
          <CardDescription className="mt-1">
            Recorded collections by supported tender type · Mobile Money, Cash and Bank Transfer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-3">
            {(["mobile_money", "cash", "bank_transfer"] as const).map((method) => {
              const row = paymentMethods.find((item) => item.key === method)
              return (
                <div key={method} className="rounded-xl border border-[#ECECEF] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-[#F5EDF0] text-[#6E0728]">
                      <Wallet size={16} />
                    </span>
                    <DataBadge tone={row ? "green" : "neutral"}>{row ? `${row.count} recorded` : "No payments"}</DataBadge>
                  </div>
                  <p className="mt-3 text-sm font-medium">
                    {method === "mobile_money" ? "Mobile Money" : method === "cash" ? "Cash" : "Bank Transfer"}
                  </p>
                  <p className="mt-1 text-xl font-semibold">{formatPesewas(row?.revenuePesewas ?? 0)}</p>
                  <p className="mt-1 text-xs text-[#86868B]">
                    {sharePercent(row?.revenuePesewas ?? 0, summary.confirmedRevenuePesewas)}% of confirmed revenue
                  </p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[#86868B]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function BreakdownCard({
  title,
  description,
  rows,
  total,
  unitLabel,
  emptyTitle,
  emptyDescription,
}: {
  title: string
  description: string
  rows: readonly BreakdownRow[]
  total: number
  unitLabel: string
  emptyTitle: string
  emptyDescription: string
}) {
  return (
    <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="mt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.key}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{row.label}</span>
                  <span className="shrink-0 text-[#68686D]">{formatPesewas(row.revenuePesewas)}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F1F1F3]">
                    <div className="h-full rounded-full bg-[#6E0728]" style={{ width: `${sharePercent(row.revenuePesewas, total)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-[#86868B]">
                    {row.count} {unitLabel}
                    {row.count === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        )}
      </CardContent>
    </Card>
  )
}
