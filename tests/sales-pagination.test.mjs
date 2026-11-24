import assert from "node:assert/strict"
import test from "node:test"

import { collectAllPages, defaultPageSize, defaultMaxPages } from "../src/lib/sales-pagination.ts"
import {
  buildReportCsv,
  periodRange,
  salesInRange,
  summarizeSales,
} from "../src/lib/reporting.ts"

/**
 * Builds an isolated in-memory page source that mimics a PostgREST range query
 * over a deterministic `(created_at desc, id desc)` order.
 */
function fakeSalesTable(total, { tiedTimestamps = false } = {}) {
  const rows = Array.from({ length: total }, (_, index) => ({
    id: `sale-${String(index).padStart(5, "0")}`,
    // Every 25th row shares a timestamp with its neighbour to force ties at
    // page boundaries, which is where naive offset pagination loses rows.
    createdAt: tiedTimestamps
      ? new Date(Date.UTC(2026, 10, 24, 23, 0, Math.floor(index / 25))).toISOString()
      : new Date(Date.UTC(2026, 10, 24, 23, 59, 59) - index * 1000).toISOString(),
    status: index % 10 === 0 ? "awaiting_payment" : "completed",
    totalPesewas: 100_000 + index,
  }))

  const requests = []
  return {
    rows,
    requests,
    async fetchPage({ offset, limit }) {
      requests.push({ offset, limit })
      return rows.slice(offset, offset + limit).map((row) => ({ ...row }))
    },
  }
}

test("a store with more than 500 sales is collected completely", async () => {
  const table = fakeSalesTable(1203)
  const { rows, pages, duplicatesSkipped } = await collectAllPages(table.fetchPage, {
    pageSize: 200,
    key: (row) => row.id,
  })

  assert.equal(rows.length, 1203, "every sale must be reported, not just the first 500")
  assert.equal(new Set(rows.map((row) => row.id)).size, 1203, "no duplicate rows")
  assert.equal(duplicatesSkipped, 0)
  assert.equal(pages, 7, "1203 rows over a 200-row page size needs seven round trips")

  const expectedIds = table.rows.map((row) => row.id)
  assert.deepEqual(rows.map((row) => row.id), expectedIds, "no row is skipped or reordered")
  assert.deepEqual(
    table.requests,
    [
      { offset: 0, limit: 200 },
      { offset: 200, limit: 200 },
      { offset: 400, limit: 200 },
      { offset: 600, limit: 200 },
      { offset: 800, limit: 200 },
      { offset: 1000, limit: 200 },
      { offset: 1200, limit: 200 },
    ],
    "offsets advance by exactly one page"
  )
})

test("ties on the ordering column cannot duplicate or drop a row at a page boundary", async () => {
  const table = fakeSalesTable(640, { tiedTimestamps: true })
  const { rows } = await collectAllPages(table.fetchPage, { pageSize: 80, key: (row) => row.id })

  assert.equal(rows.length, 640)
  assert.deepEqual(rows.map((row) => row.id), table.rows.map((row) => row.id))
  assert.equal(new Set(rows.map((row) => row.id)).size, 640)
})

test("a page that repeats rows is de-duplicated rather than double counted", async () => {
  const all = fakeSalesTable(450)
  const seen = []
  const { rows, duplicatesSkipped } = await collectAllPages(
    async ({ offset, limit }) => {
      // Simulate a row shifting into the next page because it was inserted
      // while the scan was running.
      const batch = await all.fetchPage({ offset: Math.max(0, offset - 1), limit })
      seen.push(...batch)
      return batch
    },
    { pageSize: 200, key: (row) => row.id }
  )

  assert.ok(duplicatesSkipped > 0, "the overlapping rows were detected")
  assert.equal(rows.length, 450, "the unique set is still complete")
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length)
  assert.ok(seen.length > rows.length)
})

test("an exact multiple of the page size terminates without an extra empty page", async () => {
  const table = fakeSalesTable(600)
  const { rows, pages } = await collectAllPages(table.fetchPage, { pageSize: 200, key: (row) => row.id })

  assert.equal(rows.length, 600)
  assert.equal(pages, 4, "the final short (empty) page ends the scan")
  assert.equal(table.requests.at(-1).offset, 600)
})

test("an empty range costs a single request and returns nothing", async () => {
  const table = fakeSalesTable(0)
  const { rows, pages } = await collectAllPages(table.fetchPage, { pageSize: 200, key: (row) => row.id })

  assert.deepEqual(rows, [])
  assert.equal(pages, 1)
})

test("the page budget fails loudly instead of silently truncating", async () => {
  const table = fakeSalesTable(5000)
  await assert.rejects(
    () => collectAllPages(table.fetchPage, { pageSize: 100, key: (row) => row.id, maxPages: 3 }),
    /refusing to return a partial report/
  )
})

test("invalid paging options are rejected", async () => {
  const table = fakeSalesTable(10)
  await assert.rejects(() => collectAllPages(table.fetchPage, { pageSize: 0, key: (row) => row.id }), /Page size/)
  await assert.rejects(() => collectAllPages(table.fetchPage, { pageSize: 2000, key: (row) => row.id }), /Page size/)
  await assert.rejects(() => collectAllPages(table.fetchPage, { maxPages: 0, key: (row) => row.id }), /page budget/i)
  assert.equal(defaultPageSize, 200)
  assert.equal(defaultMaxPages, 500)
})

test("report totals over a paginated scan of more than 500 sales include every recorded cedi", async () => {
  const table = fakeSalesTable(1203)
  const { rows } = await collectAllPages(table.fetchPage, { pageSize: 200, key: (row) => row.id })

  const sales = rows.map((row) => ({
    id: row.id,
    saleNumber: `ME-20261124-${row.id.slice(-5).toUpperCase()}`,
    status: row.status,
    employeeName: "Ama Mensah",
    totalPesewas: row.totalPesewas,
    createdAt: row.createdAt,
    completedAt: row.status === "completed" ? row.createdAt : null,
    items: [],
    payment:
      row.status === "completed"
        ? { amountPesewas: row.totalPesewas, currency: "GHS", method: "cash", status: "confirmed" }
        : null,
  }))

  const summary = summarizeSales(sales)
  const completed = sales.filter((sale) => sale.status === "completed")
  const expectedRevenue = completed.reduce((total, sale) => total + sale.totalPesewas, 0)

  assert.equal(summary.totalSales, 1203)
  assert.equal(summary.completedSales, 1082)
  assert.equal(summary.awaitingPaymentSales, 121)
  assert.equal(summary.confirmedRevenuePesewas, expectedRevenue)
  assert.ok(
    summary.confirmedRevenuePesewas > 500 * 100_000,
    "the total must exceed what a 500-row cap could have produced"
  )

  const range = periodRange("daily", new Date("2026-11-24T12:00:00Z"))
  const periodSales = salesInRange(sales, range)
  assert.equal(periodSales.length, 1203, "the whole fixture is inside the chosen store day")

  const csv = buildReportCsv({
    storeName: "Mac Evra",
    period: "daily",
    range,
    summary: summarizeSales(periodSales),
    employees: [],
    models: [],
    paymentMethods: [],
    generatedAt: "2026-11-24T12:00:00Z",
  })
  assert.match(csv, /"Completed paid sales","1082"/)
  assert.match(csv, new RegExp(`"Confirmed revenue \\(GHS\\)","${(expectedRevenue / 100).toFixed(2).replace(".", "\\.")}"`))
})
