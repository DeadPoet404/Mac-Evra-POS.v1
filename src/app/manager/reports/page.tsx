"use client"

import { useMemo, useState } from "react"
import {
  ArrowDownRight,
  Banknote,
  ChartNoAxesCombined,
  Download,
  Percent,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { DataBadge, DemoNotice, MetricCard, PageHeader } from "@/components/manager/manager-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  employeeReport,
  modelReport,
  money,
  paymentReport,
  reportPeriods,
} from "@/lib/manager-data"

type Period = keyof typeof reportPeriods

const periodScale: Record<Period, number> = {
  daily: 0.021,
  weekly: 0.073,
  monthly: 1,
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("monthly")
  const report = reportPeriods[period]
  const scale = periodScale[period]
  const maxTrend = Math.max(...report.trend)

  const employeeRows = useMemo(
    () => employeeReport.map((row) => ({ ...row, sales: Math.max(period === "daily" ? 0 : 1, Math.round(row.sales * scale)), revenue: Math.round(row.revenue * scale) })),
    [period, scale]
  )
  const modelRows = useMemo(
    () => modelReport.map((row) => ({ ...row, units: Math.max(period === "daily" ? 0 : 1, Math.round(row.units * scale)), revenue: Math.round(row.revenue * scale) })),
    [period, scale]
  )
  const paymentRows = useMemo(
    () => paymentReport.map((row) => ({ ...row, transactions: Math.max(period === "daily" ? 0 : 1, Math.round(row.transactions * scale)), amount: Math.round(row.amount * scale) })),
    [period, scale]
  )

  function exportCsv() {
    const rows = [
      ["Mac Evra sales report", report.label],
      ["Metric", "Value"],
      ["Revenue", report.revenue],
      ["Collections", report.collected],
      ["Outstanding", report.outstanding],
      ["Gross profit", report.profit],
      ["Gross margin", `${report.margin}%`],
      ["Transactions", report.transactions],
      [],
      ["Employee", "Sales", "Revenue"],
      ...employeeRows.map((row) => [row.name, row.sales, row.revenue]),
      [],
      ["Payment method", "Transactions", "Amount"],
      ...paymentRows.map((row) => [row.name, row.transactions, row.amount]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `mac-evra-${period}-report.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Business intelligence"
        title="Reports"
        description="Compare sales, collections, team performance, device mix, payment methods and gross margin for the selected period."
        action={
          <Button onClick={exportCsv} variant="outline" className="h-10 bg-white px-4">
            <Download size={16} /> Export CSV
          </Button>
        }
      />

      <DemoNotice>
        All report values are illustrative sample data. Profit uses recorded device cost only and excludes tax, payroll, rent, fees and other operating expenses.
      </DemoNotice>

      <div className="flex flex-col gap-3 rounded-2xl border border-[#E8E8ED] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Reporting period</p>
          <p className="mt-1 text-xs text-[#86868B]">{report.label}</p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F1F1F3] p-1">
          {(["daily", "weekly", "monthly"] as Period[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`rounded-lg px-4 py-2 text-xs font-medium capitalize transition ${period === item ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#68686D] hover:text-[#1D1D1F]"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Report metrics">
        <MetricCard label="Sales revenue" value={money(report.revenue)} note={`${report.transactions} completed transactions`} icon={TrendingUp} tone="green" />
        <MetricCard label="Collections" value={money(report.collected)} note={`${Math.round((report.collected / report.revenue) * 100)}% of sales value received`} icon={Wallet} />
        <MetricCard label="Outstanding" value={money(report.outstanding)} note="Open customer balances" icon={ArrowDownRight} tone="amber" />
        <MetricCard label="Gross profit" value={money(report.profit)} note={`${report.margin}% gross margin`} icon={Percent} tone="blue" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Sales over time</CardTitle>
              <CardDescription className="mt-1">Revenue for {report.label.toLowerCase()}</CardDescription>
            </div>
            <DataBadge tone="green">Revenue</DataBadge>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-end gap-2 border-b border-[#E8E8ED] sm:gap-4">
              {report.trend.map((value, index) => (
                <div key={report.trendLabels[index]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="hidden text-[10px] font-medium text-[#68686D] sm:block">{value >= 1000 ? `₵${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : `₵${value}`}</span>
                  <div className="flex h-[80%] w-full items-end rounded-t-lg bg-[#FAF7F8] px-1 pt-1">
                    <div className="w-full rounded-t-md bg-[#6E0728]" style={{ height: `${Math.max(5, (value / maxTrend) * 100)}%` }} />
                  </div>
                  <span className="mb-2 truncate text-[10px] text-[#86868B] sm:text-[11px]">{report.trendLabels[index]}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-[#86868B]">Average sale</p>
                <p className="mt-1 text-lg font-semibold">{money(Math.round(report.revenue / report.transactions))}</p>
              </div>
              <div>
                <p className="text-xs text-[#86868B]">Collection rate</p>
                <p className="mt-1 text-lg font-semibold">{Math.round((report.collected / report.revenue) * 100)}%</p>
              </div>
              <div>
                <p className="text-xs text-[#86868B]">Margin</p>
                <p className="mt-1 text-lg font-semibold text-[#267343]">{report.margin}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Revenue & margin</CardTitle>
            <CardDescription className="mt-1">Gross contribution before overheads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl bg-[#6E0728] p-5 text-white">
              <p className="text-xs text-white/70">Gross profit</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{money(report.profit)}</p>
              <p className="mt-2 text-sm text-white/75">{report.margin}% of sales revenue</p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white" style={{ width: `${report.margin}%` }} />
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <ReportRow icon={ReceiptText} label="Sales revenue" value={money(report.revenue)} />
              <ReportRow icon={Banknote} label="Device cost" value={money(report.revenue - report.profit)} />
              <ReportRow icon={ChartNoAxesCombined} label="Gross margin" value={`${report.margin}%`} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <BreakdownCard title="Sales by employee" description="Revenue contribution and transaction count">
          {employeeRows.map((row) => (
            <BreakdownRow key={row.name} name={row.name} detail={`${row.sales} sales`} value={money(row.revenue)} share={row.share} />
          ))}
        </BreakdownCard>
        <BreakdownCard title="Sales by iPhone model" description="Model mix by revenue and units sold">
          {modelRows.map((row) => (
            <BreakdownRow key={row.name} name={row.name} detail={`${row.units} units`} value={money(row.revenue)} share={row.share} />
          ))}
        </BreakdownCard>
      </section>

      <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Payment method breakdown</CardTitle>
          <CardDescription className="mt-1">Recorded collections by tender type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-5">
            {paymentRows.map((row) => (
              <div key={row.name} className="rounded-xl border border-[#ECECEF] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-[#F5EDF0] text-[#6E0728]"><Wallet size={16} /></span>
                  <DataBadge tone="neutral">{row.share}%</DataBadge>
                </div>
                <p className="mt-4 text-sm font-medium">{row.name}</p>
                <p className="mt-2 text-xl font-semibold tracking-tight">{money(row.amount)}</p>
                <p className="mt-1 text-xs text-[#86868B]">{row.transactions} transactions</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#EFEFF1]"><div className="h-full rounded-full bg-[#6E0728]" style={{ width: `${row.share}%` }} /></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

function ReportRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-[#F5EDF0] text-[#6E0728]"><Icon size={16} /></span>
      <span className="min-w-0 flex-1 text-sm text-[#68686D]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}

function BreakdownCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="mt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function BreakdownRow({ name, detail, value, share }: { name: string; detail: string; value: string; share: number }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="mt-1 text-xs text-[#86868B]">{detail}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{value}</p>
          <p className="mt-1 text-xs text-[#86868B]">{share}%</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EFEFF1]"><div className="h-full rounded-full bg-[#6E0728]" style={{ width: `${share}%` }} /></div>
    </div>
  )
}
