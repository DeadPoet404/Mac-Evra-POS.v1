import assert from "node:assert/strict"
import test from "node:test"

import * as reporting from "../src/lib/reporting.ts"
import {
  breakdownByEmployee,
  breakdownByModel,
  breakdownByPaymentMethod,
  buildReportCsv,
  confirmedRevenuePesewas,
  deviceModelLabel,
  hasVerifiedPayment,
  isReportPeriod,
  periodRange,
  saleReportDateKey,
  salesInRange,
  seriesForRange,
  escapeCsvCell,
  escapeCsvText,
  saleWindowOrFilter,
  salesInDateWindow,
  sharePercent,
  storeDateKey,
  storeTimeZone,
  summarizeSales,
  windowTimestamps,
} from "../src/lib/reporting.ts"

/**
 * Isolated fixtures for the reporting rules. These are test-only records and
 * are never written to a database.
 */
function sale({
  id,
  status,
  totalPesewas,
  payment = null,
  createdAt = "2026-11-24T09:00:00Z",
  completedAt = null,
  employeeName = "Ama Mensah",
  items = [],
}) {
  return {
    id,
    saleNumber: `ME-20261124-${id.toUpperCase()}`,
    status,
    employeeName,
    totalPesewas,
    createdAt,
    completedAt,
    items,
    payment,
  }
}

const deviceItem = (description, lineTotalPesewas, itemStatus = "active") => ({
  description,
  lineTotalPesewas,
  status: itemStatus,
})

const completedSale = sale({
  id: "a",
  status: "completed",
  totalPesewas: 850_037,
  completedAt: "2026-11-24T10:15:00Z",
  employeeName: "Ama Mensah",
  items: [deviceItem("iPhone 15 Pro · 256GB · Natural Titanium", 850_037)],
  payment: { amountPesewas: 850_037, currency: "GHS", method: "mobile_money", status: "confirmed" },
})

const cashSale = sale({
  id: "b",
  status: "completed",
  totalPesewas: 320_000,
  completedAt: "2026-11-22T15:40:00Z",
  employeeName: "Kofi Boateng",
  items: [deviceItem("iPhone 13 · 128GB · Midnight", 320_000)],
  payment: { amountPesewas: 320_000, currency: "GHS", method: "cash", status: "confirmed" },
})

const awaitingSale = sale({
  id: "c",
  status: "awaiting_payment",
  totalPesewas: 680_000,
  employeeName: "Ama Mensah",
})

const draftSale = sale({
  id: "d",
  status: "draft",
  totalPesewas: 120_000,
  createdAt: "2026-11-24T08:00:00Z",
})

const cancelledSale = sale({
  id: "e",
  status: "cancelled",
  totalPesewas: 990_000,
  createdAt: "2026-11-23T08:00:00Z",
})

const unverifiedCompleted = sale({
  id: "f",
  status: "completed",
  totalPesewas: 410_000,
  completedAt: "2026-11-23T11:00:00Z",
  employeeName: "Yaa Asantewaa",
  payment: { amountPesewas: 410_000, currency: "GHS", method: "bank_transfer", status: "pending" },
})

const fixtures = [completedSale, cashSale, awaitingSale, draftSale, cancelledSale, unverifiedCompleted]

test("revenue counts only completed sales with a confirmed GHS payment", () => {
  assert.equal(hasVerifiedPayment(completedSale), true)
  assert.equal(hasVerifiedPayment(awaitingSale), false)
  assert.equal(hasVerifiedPayment(draftSale), false)
  assert.equal(hasVerifiedPayment(cancelledSale), false)
  assert.equal(hasVerifiedPayment(unverifiedCompleted), false, "a completed sale without a confirmed payment is not money")

  assert.equal(confirmedRevenuePesewas(completedSale), 850_037)
  assert.equal(confirmedRevenuePesewas(awaitingSale), 0)
  assert.equal(confirmedRevenuePesewas(draftSale), 0)
  assert.equal(confirmedRevenuePesewas(cancelledSale), 0)
  assert.equal(confirmedRevenuePesewas(unverifiedCompleted), 0)
})

test("summary separates paid revenue from drafts, awaiting payment, cancellations and unverified completions", () => {
  const summary = summarizeSales(fixtures)
  assert.equal(summary.totalSales, 6)
  assert.equal(summary.completedSales, 2)
  assert.equal(summary.confirmedRevenuePesewas, 850_037 + 320_000)
  assert.equal(summary.completedWithoutVerifiedPayment, 1)
  assert.equal(summary.awaitingPaymentSales, 1)
  assert.equal(summary.awaitingPaymentValuePesewas, 680_000)
  assert.equal(summary.draftSales, 1)
  assert.equal(summary.draftValuePesewas, 120_000)
  assert.equal(summary.cancelledSales, 1)
  assert.equal(summary.averageCompletedSalePesewas, Math.round(1_170_037 / 2))
  assert.ok(Number.isInteger(summary.averageCompletedSalePesewas), "averages stay in integer pesewas")
})

test("an empty register produces honest zeroes rather than sample figures", () => {
  const summary = summarizeSales([])
  assert.deepEqual(summary, {
    totalSales: 0,
    completedSales: 0,
    confirmedRevenuePesewas: 0,
    averageCompletedSalePesewas: 0,
    completedWithoutVerifiedPayment: 0,
    awaitingPaymentSales: 0,
    awaitingPaymentValuePesewas: 0,
    draftSales: 0,
    draftValuePesewas: 0,
    cancelledSales: 0,
  })
  assert.deepEqual(breakdownByEmployee([]), [])
  assert.deepEqual(breakdownByModel([]), [])
  assert.deepEqual(breakdownByPaymentMethod([]), [])
  assert.equal(sharePercent(0, 0), 0, "a zero total never yields NaN or a fabricated share")
})

test("store date keys and period windows resolve in Africa/Accra", () => {
  assert.equal(storeTimeZone, "Africa/Accra")

  const lateEvening = new Date("2026-11-24T23:45:00Z")
  assert.equal(storeDateKey(lateEvening), "2026-11-24")

  const daily = periodRange("daily", lateEvening)
  assert.equal(daily.fromKey, "2026-11-24")
  assert.equal(daily.toKey, "2026-11-24")
  assert.equal(daily.days.length, 1)

  const weekly = periodRange("weekly", lateEvening)
  assert.equal(weekly.fromKey, "2026-11-18")
  assert.equal(weekly.toKey, "2026-11-24")
  assert.equal(weekly.days.length, 7)
  assert.equal(weekly.days.at(-1), "2026-11-24")

  const monthly = periodRange("monthly", lateEvening)
  assert.equal(monthly.fromKey, "2026-11-01")
  assert.equal(monthly.toKey, "2026-11-30", "month end comes from the calendar, not a hardcoded day count")
  assert.equal(monthly.days.length, 30)
})

test("period windows handle month, year and leap-day boundaries", () => {
  const december = periodRange("monthly", new Date("2026-12-31T12:00:00Z"))
  assert.equal(december.fromKey, "2026-12-01")
  assert.equal(december.toKey, "2026-12-31")

  const january = periodRange("weekly", new Date("2027-01-02T12:00:00Z"))
  assert.equal(january.fromKey, "2026-12-27")
  assert.equal(january.toKey, "2027-01-02")
  assert.equal(january.days.length, 7)

  const leap = periodRange("monthly", new Date("2028-02-10T12:00:00Z"))
  assert.equal(leap.toKey, "2028-02-29")

  const nonLeap = periodRange("monthly", new Date("2027-02-10T12:00:00Z"))
  assert.equal(nonLeap.toKey, "2027-02-28")
})

test("period filtering uses the completion date of a completed sale", () => {
  assert.equal(saleReportDateKey(completedSale), "2026-11-24")
  assert.equal(saleReportDateKey(draftSale), "2026-11-24")

  const week = periodRange("weekly", new Date("2026-11-24T12:00:00Z"))
  const inWeek = salesInRange(fixtures, week)
  assert.deepEqual(inWeek.map((item) => item.id).sort(), ["a", "b", "c", "d", "e", "f"])

  const today = periodRange("daily", new Date("2026-11-24T12:00:00Z"))
  assert.deepEqual(salesInRange(fixtures, today).map((item) => item.id).sort(), ["a", "c", "d"])
})

test("the seven-day series buckets confirmed revenue per store day and excludes unpaid sales", () => {
  const week = periodRange("weekly", new Date("2026-11-24T12:00:00Z"))
  const series = seriesForRange(fixtures, week)
  assert.equal(series.length, 7)
  assert.equal(series[0].key, "2026-11-18")
  assert.equal(series.at(-1).key, "2026-11-24")
  assert.deepEqual(
    series.map((point) => point.revenuePesewas),
    [0, 0, 0, 0, 320_000, 0, 850_037]
  )
  assert.equal(
    series.reduce((total, point) => total + point.revenuePesewas, 0),
    summarizeSales(salesInRange(fixtures, week)).confirmedRevenuePesewas,
    "the chart total always equals the reported revenue"
  )
})

test("breakdowns group only confirmed revenue and never invent a category", () => {
  const employees = breakdownByEmployee(fixtures)
  assert.deepEqual(employees.map((row) => [row.label, row.count, row.revenuePesewas]), [
    ["Ama Mensah", 1, 850_037],
    ["Kofi Boateng", 1, 320_000],
  ])
  assert.ok(!employees.some((row) => row.label === "Yaa Asantewaa"), "unverified completions are excluded")

  const models = breakdownByModel(fixtures)
  assert.deepEqual(models.map((row) => [row.label, row.count, row.revenuePesewas]), [
    ["iPhone 15 Pro 256GB", 1, 850_037],
    ["iPhone 13 128GB", 1, 320_000],
  ])
  assert.equal(deviceModelLabel("iPhone 15 Pro · 256GB · Natural Titanium"), "iPhone 15 Pro 256GB")
  assert.equal(deviceModelLabel("Screen protector"), "Screen protector")

  const methods = breakdownByPaymentMethod(fixtures)
  assert.deepEqual(methods.map((row) => [row.key, row.label, row.count, row.revenuePesewas]), [
    ["mobile_money", "Mobile Money", 1, 850_037],
    ["cash", "Cash", 1, 320_000],
  ])
  for (const row of methods) {
    assert.ok(
      ["mobile_money", "cash", "bank_transfer"].includes(row.key),
      "only the three supported payment methods can appear"
    )
  }
})

test("removed sale items are ignored by the device mix", () => {
  const withRemoved = sale({
    id: "g",
    status: "completed",
    totalPesewas: 100_000,
    completedAt: "2026-11-24T12:00:00Z",
    items: [
      deviceItem("iPhone 14 · 128GB · Blue", 100_000, "active"),
      deviceItem("iPhone 12 · 64GB · Black", 90_000, "removed"),
    ],
    payment: { amountPesewas: 100_000, currency: "GHS", method: "cash", status: "confirmed" },
  })
  const models = breakdownByModel([withRemoved])
  assert.deepEqual(models.map((row) => row.label), ["iPhone 14 128GB"])
})

test("shares are whole percentages and tolerate zero totals", () => {
  assert.equal(sharePercent(1, 4), 25)
  assert.equal(sharePercent(850_037, 1_170_037), 73)
  assert.equal(sharePercent(0, 0), 0)
  assert.equal(sharePercent(5, 0), 0)
})

test("isReportPeriod accepts exactly the supported periods", () => {
  assert.equal(isReportPeriod("daily"), true)
  assert.equal(isReportPeriod("weekly"), true)
  assert.equal(isReportPeriod("monthly"), true)
  assert.equal(isReportPeriod("yearly"), false)
  assert.equal(isReportPeriod(undefined), false)
  assert.equal(isReportPeriod(null), false)
})

test("the CSV export contains persisted rows only and never a fabricated profit", () => {
  const week = periodRange("weekly", new Date("2026-11-24T12:00:00Z"))
  const periodSales = salesInRange(fixtures, week)
  const csv = buildReportCsv({
    storeName: 'Mac Evra, "Accra"',
    period: "weekly",
    range: week,
    summary: summarizeSales(periodSales),
    employees: breakdownByEmployee(periodSales),
    models: breakdownByModel(periodSales),
    paymentMethods: breakdownByPaymentMethod(periodSales),
    generatedAt: "2026-11-24T12:00:00Z",
  })

  assert.match(csv, /"Confirmed revenue \(GHS\)","11700\.37"/)
  assert.match(csv, /"Completed paid sales","2"/)
  assert.match(csv, /"Awaiting-payment sales \(excluded\)","1"/)
  assert.match(csv, /"Awaiting-payment value \(excluded, GHS\)","6800\.00"/)
  assert.match(csv, /"Store","Mac Evra, ""Accra"""/, "commas and quotes are escaped")
  assert.match(csv, /"Ama Mensah","1","8500\.37"/)
  assert.match(csv, /"Mobile Money","1","8500\.37"/)
  assert.ok(!/profit|margin|cost/i.test(csv), "no profit, margin or cost row is invented")
  assert.ok(!csv.includes("Yaa Asantewaa"), "an unverified completion never reaches the export")
})

test("an empty period exports headers and zeroes, not sample rows", () => {
  const week = periodRange("weekly", new Date("2026-11-24T12:00:00Z"))
  const csv = buildReportCsv({
    storeName: "Mac Evra",
    period: "weekly",
    range: week,
    summary: summarizeSales([]),
    employees: [],
    models: [],
    paymentMethods: [],
    generatedAt: "2026-11-24T12:00:00Z",
  })

  assert.match(csv, /"Confirmed revenue \(GHS\)","0\.00"/)
  assert.match(csv, /"Completed paid sales","0"/)
  assert.match(csv, /"Employee","Completed paid sales","Revenue \(GHS\)"/)
  assert.match(csv, /"Payment method","Transactions","Amount \(GHS\)"/)
  const dataRows = csv
    .split("\n")
    .filter((line) => /"iPhone|"Ama|"Kofi|"Mobile Money","\d/.test(line))
  assert.deepEqual(dataRows, [], "no breakdown rows are emitted when there is no data")
})

test("the reporting module exposes no cost or profit calculation", () => {
  const exported = Object.keys(reporting)
  assert.ok(
    !exported.some((name) => /profit|margin|cost/i.test(name)),
    "gross profit cannot be derived without acquisition cost, so no helper may claim to"
  )
})

test("the database window is a superset of the reporting rule for both date columns", () => {
  const window = { fromKey: "2026-11-18", toKey: "2026-11-24" }
  assert.deepEqual(windowTimestamps(window), {
    from: "2026-11-18T00:00:00.000Z",
    toExclusive: "2026-11-25T00:00:00.000Z",
  })

  const filter = saleWindowOrFilter(window)
  assert.match(filter, /and\(created_at\.gte\.2026-11-18T00:00:00\.000Z,created_at\.lt\.2026-11-25T00:00:00\.000Z\)/)
  assert.match(filter, /and\(completed_at\.gte\.2026-11-18T00:00:00\.000Z,completed_at\.lt\.2026-11-25T00:00:00\.000Z\)/)
  assert.equal(filter.split("and(").length - 1, 2, "exactly the two date clauses are combined")
  assert.ok(!/\d,\d/.test(filter), "timestamps never embed a comma that would break the PostgREST filter")

  // A monthly window ends on the real month end and the exclusive bound rolls over.
  const monthly = periodRange("monthly", new Date("2026-12-15T12:00:00Z"))
  assert.deepEqual(windowTimestamps(monthly), {
    from: "2026-12-01T00:00:00.000Z",
    toExclusive: "2027-01-01T00:00:00.000Z",
  })

  // The JavaScript filter and the SQL superset agree on a sale completed inside the window.
  const completedInWindow = sale({
    id: "h",
    status: "completed",
    totalPesewas: 10_000,
    createdAt: "2026-11-17T22:00:00Z",
    completedAt: "2026-11-19T09:00:00Z",
    payment: { amountPesewas: 10_000, currency: "GHS", method: "cash", status: "confirmed" },
  })
  assert.deepEqual(salesInDateWindow([completedInWindow], window).map((row) => row.id), ["h"])

  // A sale created inside the window but completed after it is returned by the
  // SQL superset (created_at clause) and then correctly excluded by the filter.
  const completedLater = sale({
    id: "j",
    status: "completed",
    totalPesewas: 20_000,
    createdAt: "2026-11-24T10:00:00Z",
    completedAt: "2026-11-26T09:00:00Z",
    payment: { amountPesewas: 20_000, currency: "GHS", method: "cash", status: "confirmed" },
  })
  assert.deepEqual(salesInDateWindow([completedLater], window), [])
  assert.equal(summarizeSales([completedLater]).confirmedRevenuePesewas, 20_000, "it still counts in the period it completes")

  // A draft created inside the window is kept so the period can report open work.
  const draftInWindow = sale({ id: "k", status: "draft", totalPesewas: 90_000, createdAt: "2026-11-20T09:00:00Z" })
  assert.deepEqual(salesInDateWindow([draftInWindow], window).map((row) => row.id), ["k"])
  assert.equal(summarizeSales([draftInWindow]).draftSales, 1)
})

test("window helpers reject malformed or inverted windows", () => {
  assert.throws(() => windowTimestamps({ fromKey: "18-11-2026", toKey: "2026-11-24" }), /YYYY-MM-DD/)
  assert.throws(() => windowTimestamps({ fromKey: "2026-11-24", toKey: "2026-11-18" }), /cannot end before/)
})

test("CSV cells neutralise spreadsheet formulas from user-controlled text", () => {
  assert.equal(escapeCsvText("=1+1"), "'=1+1")
  assert.equal(escapeCsvText("+233 24 000 0000"), "'+233 24 000 0000")
  assert.equal(escapeCsvText("-cmd|' /C calc'!A0"), "'-cmd|' /C calc'!A0")
  assert.equal(escapeCsvText("@SUM(A1:A2)"), "'@SUM(A1:A2)")
  assert.equal(escapeCsvText("\t=cmd"), "'\t=cmd")
  assert.equal(escapeCsvText("\r=cmd"), "'\r=cmd")
  assert.equal(escapeCsvText("Mac Evra"), "Mac Evra", "ordinary text is untouched")
  assert.equal(escapeCsvText("Ama Mensah"), "Ama Mensah")
  assert.equal(escapeCsvCell('Nana "Kofi"'), '"Nana ""Kofi"""', "quotes are still doubled")

  const week = periodRange("weekly", new Date("2026-11-24T12:00:00Z"))
  const hostileSale = sale({
    id: "i",
    status: "completed",
    totalPesewas: 500_000,
    completedAt: "2026-11-24T10:00:00Z",
    employeeName: "=HYPERLINK(\"http://evil\",\"click\")",
    items: [deviceItem("-iPhone 13 · 128GB · Midnight", 500_000)],
    payment: { amountPesewas: 500_000, currency: "GHS", method: "cash", status: "confirmed" },
  })
  const csv = buildReportCsv({
    storeName: "@Mac Evra",
    period: "weekly",
    range: week,
    summary: summarizeSales([hostileSale]),
    employees: breakdownByEmployee([hostileSale]),
    models: breakdownByModel([hostileSale]),
    paymentMethods: breakdownByPaymentMethod([hostileSale]),
    generatedAt: "2026-11-24T12:00:00Z",
  })

  assert.match(csv, /"Store","'@Mac Evra"/)
  assert.match(csv, /"Employee","Completed paid sales"/)
  assert.ok(
    !/(^|,)("?)=/.test(csv),
    "no exported cell may begin with a bare formula character"
  )
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"",""click"")"`), "the employee cell is neutralised, not dropped")
  assert.ok(csv.includes(`"'-iPhone 13 128GB"`), "the device label is neutralised")
  assert.match(csv, /"Confirmed revenue \(GHS\)","5000\.00"/, "numeric cells stay numeric")
})
