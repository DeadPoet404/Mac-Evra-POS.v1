import { paymentMethodLabel, pesewasToGhsInput, type PaymentMethod, type SaleStatus } from "./sales.ts"

/**
 * Pure, client-safe reporting helpers.
 *
 * Everything here works on records the caller has already read through the
 * RLS-scoped Supabase client. Nothing is estimated, interpolated or invented:
 * when there are no records the helpers return zero or an empty list and the
 * pages render a deliberate empty state.
 *
 * Financial rules encoded here:
 * - Only a completed sale with a confirmed GHS payment counts as revenue.
 * - Awaiting-payment, draft and cancelled sales are never revenue.
 * - A completed sale whose payment is not confirmed is reported separately as
 *   "completed without verified payment" instead of being counted as money.
 * - Money stays in integer pesewas; formatting happens at the edge only.
 * - Acquisition cost is not available to the authenticated role in the
 *   database, so no profit or margin is calculated anywhere in this module.
 */

export const reportPeriods = ["daily", "weekly", "monthly"] as const
export type ReportPeriod = (typeof reportPeriods)[number]

/** The store timezone used by Mac Evra. Accra is UTC+00:00 all year, so a
 * calendar date key maps directly onto a UTC midnight boundary. */
export const storeTimeZone = "Africa/Accra"

export type ReportPayment = {
  amountPesewas: number
  currency: string
  method: PaymentMethod
  status: string
}

export type ReportItem = {
  description: string
  lineTotalPesewas: number
  status: "active" | "removed"
}

/** The smallest shape the reporting helpers need from a persisted sale. */
export type ReportSale = {
  id: string
  saleNumber: string
  status: SaleStatus
  employeeName: string
  totalPesewas: number
  createdAt: string
  completedAt: string | null
  items: readonly ReportItem[]
  payment: ReportPayment | null
}

export type SaleSummary = {
  totalSales: number
  completedSales: number
  confirmedRevenuePesewas: number
  averageCompletedSalePesewas: number
  completedWithoutVerifiedPayment: number
  awaitingPaymentSales: number
  awaitingPaymentValuePesewas: number
  draftSales: number
  draftValuePesewas: number
  cancelledSales: number
}

export type BreakdownRow = {
  key: string
  label: string
  count: number
  revenuePesewas: number
}

export type PeriodRange = {
  period: ReportPeriod
  fromKey: string
  toKey: string
  label: string
  days: readonly string[]
}

export type SeriesPoint = {
  key: string
  label: string
  revenuePesewas: number
}

const millisecondsPerDay = 86_400_000
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: storeTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function assertTimestamp(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("A reporting timestamp is invalid.")
  }
  return parsed
}

/** Calendar date (YYYY-MM-DD) of an instant in the store timezone. */
export function storeDateKey(value: string | Date): string {
  const date = typeof value === "string" ? assertTimestamp(value) : value
  if (Number.isNaN(date.getTime())) throw new Error("A reporting timestamp is invalid.")
  const parts = dateKeyFormatter.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function keyToUtcDate(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function utcDateToKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDaysToKey(key: string, days: number): string {
  return utcDateToKey(new Date(keyToUtcDate(key).getTime() + days * millisecondsPerDay))
}

function formatKey(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GH", { ...options, timeZone: "UTC" }).format(keyToUtcDate(key))
}

function daysBetweenKeys(fromKey: string, toKey: string) {
  const days: string[] = []
  for (let key = fromKey; key <= toKey; key = addDaysToKey(key, 1)) {
    days.push(key)
  }
  return days
}

export function isReportPeriod(value: string | undefined | null): value is ReportPeriod {
  return typeof value === "string" && (reportPeriods as readonly string[]).includes(value)
}

/**
 * Calendar window for a reporting period, resolved in the store timezone.
 * `daily` is the current store day, `weekly` the last seven store days
 * including today, and `monthly` the current store calendar month.
 */
export function periodRange(period: ReportPeriod, now: Date = new Date()): PeriodRange {
  const today = storeDateKey(now)
  if (period === "daily") {
    return {
      period,
      fromKey: today,
      toKey: today,
      label: `Today · ${formatKey(today, { day: "numeric", month: "short", year: "numeric" })}`,
      days: [today],
    }
  }

  if (period === "weekly") {
    const fromKey = addDaysToKey(today, -6)
    return {
      period,
      fromKey,
      toKey: today,
      label: `${formatKey(fromKey, { day: "numeric", month: "short" })} – ${formatKey(today, { day: "numeric", month: "short", year: "numeric" })}`,
      days: daysBetweenKeys(fromKey, today),
    }
  }

  const fromKey = `${today.slice(0, 7)}-01`
  const monthEnd = addDaysToKey(`${addMonthsToMonthKey(today.slice(0, 7), 1)}-01`, -1)
  return {
    period,
    fromKey,
    toKey: monthEnd,
    label: formatKey(fromKey, { month: "long", year: "numeric" }),
    days: daysBetweenKeys(fromKey, monthEnd),
  }
}

function addMonthsToMonthKey(monthKey: string, months: number) {
  const [year, month] = monthKey.split("-").map(Number)
  const total = year * 12 + (month - 1) + months
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** The date a sale is filed under: completion date once completed. */
export function saleReportDateKey(sale: ReportSale): string {
  return storeDateKey(sale.completedAt ?? sale.createdAt)
}

export function salesInRange<T extends ReportSale>(sales: readonly T[], range: PeriodRange): T[] {
  return sales.filter((sale) => {
    const key = saleReportDateKey(sale)
    return key >= range.fromKey && key <= range.toKey
  })
}

/** A completed sale only becomes revenue when its payment is confirmed in GHS. */
export function hasVerifiedPayment(sale: ReportSale): boolean {
  return (
    sale.status === "completed" &&
    sale.payment !== null &&
    sale.payment.status === "confirmed" &&
    sale.payment.currency === "GHS"
  )
}

/** Confirmed money for a sale. Awaiting, draft and cancelled sales return 0. */
export function confirmedRevenuePesewas(sale: ReportSale): number {
  return hasVerifiedPayment(sale) ? (sale.payment?.amountPesewas ?? 0) : 0
}

export function summarizeSales(sales: readonly ReportSale[]): SaleSummary {
  const summary: SaleSummary = {
    totalSales: sales.length,
    completedSales: 0,
    confirmedRevenuePesewas: 0,
    averageCompletedSalePesewas: 0,
    completedWithoutVerifiedPayment: 0,
    awaitingPaymentSales: 0,
    awaitingPaymentValuePesewas: 0,
    draftSales: 0,
    draftValuePesewas: 0,
    cancelledSales: 0,
  }

  for (const sale of sales) {
    if (sale.status === "completed") {
      if (hasVerifiedPayment(sale)) {
        summary.completedSales += 1
        summary.confirmedRevenuePesewas += confirmedRevenuePesewas(sale)
      } else {
        summary.completedWithoutVerifiedPayment += 1
      }
    } else if (sale.status === "awaiting_payment") {
      summary.awaitingPaymentSales += 1
      summary.awaitingPaymentValuePesewas += sale.totalPesewas
    } else if (sale.status === "draft") {
      summary.draftSales += 1
      summary.draftValuePesewas += sale.totalPesewas
    } else if (sale.status === "cancelled") {
      summary.cancelledSales += 1
    }
  }

  summary.averageCompletedSalePesewas =
    summary.completedSales > 0
      ? Math.round(summary.confirmedRevenuePesewas / summary.completedSales)
      : 0

  return summary
}

export function seriesForRange(sales: readonly ReportSale[], range: PeriodRange): SeriesPoint[] {
  const totals = new Map<string, number>(range.days.map((day) => [day, 0]))
  for (const sale of sales) {
    const key = saleReportDateKey(sale)
    if (!totals.has(key)) continue
    totals.set(key, (totals.get(key) ?? 0) + confirmedRevenuePesewas(sale))
  }

  return range.days.map((day) => ({
    key: day,
    label: formatKey(day, { weekday: "short", day: "numeric" }),
    revenuePesewas: totals.get(day) ?? 0,
  }))
}

export function breakdownByEmployee(sales: readonly ReportSale[]): BreakdownRow[] {
  return breakdown(sales, (sale) => ({ key: sale.employeeName, label: sale.employeeName }))
}

export function deviceModelLabel(description: string) {
  const [model, storage] = description.split(" · ")
  return storage ? `${model} ${storage}` : model
}

export function breakdownByModel(sales: readonly ReportSale[]): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>()
  for (const sale of sales) {
    if (!hasVerifiedPayment(sale)) continue
    for (const item of sale.items) {
      if (item.status !== "active") continue
      const label = deviceModelLabel(item.description)
      const row = rows.get(label) ?? { key: label, label, count: 0, revenuePesewas: 0 }
      row.count += 1
      row.revenuePesewas += item.lineTotalPesewas
      rows.set(label, row)
    }
  }
  return sortBreakdown([...rows.values()])
}

export function breakdownByPaymentMethod(sales: readonly ReportSale[]): BreakdownRow[] {
  const rows = new Map<PaymentMethod, BreakdownRow>()
  for (const sale of sales) {
    if (!hasVerifiedPayment(sale) || !sale.payment) continue
    const method = sale.payment.method
    const row = rows.get(method) ?? {
      key: method,
      label: paymentMethodLabel(method),
      count: 0,
      revenuePesewas: 0,
    }
    row.count += 1
    row.revenuePesewas += sale.payment.amountPesewas
    rows.set(method, row)
  }
  return sortBreakdown([...rows.values()])
}

function breakdown(
  sales: readonly ReportSale[],
  key: (sale: ReportSale) => { key: string; label: string }
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>()
  for (const sale of sales) {
    if (!hasVerifiedPayment(sale)) continue
    const { key: rowKey, label } = key(sale)
    const row = rows.get(rowKey) ?? { key: rowKey, label, count: 0, revenuePesewas: 0 }
    row.count += 1
    row.revenuePesewas += confirmedRevenuePesewas(sale)
    rows.set(rowKey, row)
  }
  return sortBreakdown([...rows.values()])
}

function sortBreakdown(rows: BreakdownRow[]) {
  return rows.sort((left, right) =>
    right.revenuePesewas - left.revenuePesewas || left.label.localeCompare(right.label, "en-GH")
  )
}

/** Whole-percentage share of a total, safe when the total is zero. */
export function sharePercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((value / total) * 100)
}

export type ReportCsvInput = {
  storeName: string
  period: ReportPeriod
  range: PeriodRange
  summary: SaleSummary
  employees: readonly BreakdownRow[]
  models: readonly BreakdownRow[]
  paymentMethods: readonly BreakdownRow[]
  generatedAt: string
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function csvRow(cells: readonly (string | number | null | undefined)[]) {
  return cells.map(csvCell).join(",")
}

/**
 * CSV built only from persisted records. No sample rows, no placeholder totals:
 * an empty store produces a report with zero counts and empty breakdowns.
 */
export function buildReportCsv(input: ReportCsvInput): string {
  const { summary } = input
  const rows: string[] = [
    csvRow(["Mac Evra sales report"]),
    csvRow(["Store", input.storeName]),
    csvRow(["Period", input.period]),
    csvRow(["Range", `${input.range.fromKey} to ${input.range.toKey}`]),
    csvRow(["Time zone", storeTimeZone]),
    csvRow(["Generated", input.generatedAt]),
    csvRow(["Basis", "Completed sales with a confirmed GHS payment only"]),
    "",
    csvRow(["Metric", "Value"]),
    csvRow(["Confirmed revenue (GHS)", pesewasToGhsInput(summary.confirmedRevenuePesewas)]),
    csvRow(["Completed paid sales", summary.completedSales]),
    csvRow(["Average completed sale (GHS)", pesewasToGhsInput(summary.averageCompletedSalePesewas)]),
    csvRow(["Completed sales without verified payment (excluded)", summary.completedWithoutVerifiedPayment]),
    csvRow(["Awaiting-payment sales (excluded)", summary.awaitingPaymentSales]),
    csvRow(["Awaiting-payment value (excluded, GHS)", pesewasToGhsInput(summary.awaitingPaymentValuePesewas)]),
    csvRow(["Open drafts (excluded)", summary.draftSales]),
    csvRow(["Open draft value (excluded, GHS)", pesewasToGhsInput(summary.draftValuePesewas)]),
    csvRow(["Cancelled sales (excluded)", summary.cancelledSales]),
    "",
    csvRow(["Employee", "Completed paid sales", "Revenue (GHS)"]),
    ...input.employees.map((row) =>
      csvRow([row.label, row.count, pesewasToGhsInput(row.revenuePesewas)])
    ),
    "",
    csvRow(["Device model", "Units sold", "Revenue (GHS)"]),
    ...input.models.map((row) => csvRow([row.label, row.count, pesewasToGhsInput(row.revenuePesewas)])),
    "",
    csvRow(["Payment method", "Transactions", "Amount (GHS)"]),
    ...input.paymentMethods.map((row) =>
      csvRow([row.label, row.count, pesewasToGhsInput(row.revenuePesewas)])
    ),
  ]

  return `${rows.join("\n")}\n`
}
