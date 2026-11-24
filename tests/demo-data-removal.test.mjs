import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { routeRequirement } from "../src/lib/auth/policy.ts"

/**
 * Guards against demo data and simulated interactions returning to Mac Evra POS.
 *
 * These assertions are deliberately source-level: a page could look empty while
 * still carrying a fabricated fallback array, and only the source proves that no
 * sample figure is reachable any more.
 */

function read(relativePath) {
  return readFileSync(path.resolve(relativePath), "utf8")
}

function sourceFiles(directory = "src") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [entryPath] : []
  })
}

const allSource = sourceFiles().map((file) => ({ file, source: read(file) }))

function findLiteral(literal) {
  return allSource
    .filter(({ source }) => source.includes(literal))
    .map(({ file }) => `${file} contains ${JSON.stringify(literal)}`)
}

test("the demo data modules have been removed", () => {
  for (const removed of [
    "src/lib/manager-data.ts",
    "src/lib/inventory.ts",
    "src/lib/trade-in.ts",
    "src/components/employee/device-card.tsx",
    "src/app/home/action-cards.tsx",
  ]) {
    assert.equal(existsSync(path.resolve(removed)), false, `${removed} must not exist`)
  }
  assert.deepEqual(findLiteral("@/lib/manager-data"), [])
  assert.deepEqual(findLiteral("initialApprovals"), [])
  assert.deepEqual(findLiteral("inventoryPhones"), [])
  assert.deepEqual(findLiteral("calculateDemoValuation"), [])
})

test("no fabricated people, sale numbers or preview figures survive in the application source", () => {
  const fabricated = [
    "Alex Morgan",
    "Sarah Owusu",
    "Michael Addo",
    "Kwesi Mensah",
    "Adwoa Boateng",
    "Daniel Mensah",
    "Ama Boateng",
    "Kojo Frimpong",
    "Akosua Tetteh",
    "Yaw Ofori",
    "Esi Agyeman",
    "Nana Yeboah",
    "ME-2026-1",
    "352099104567810",
    "Preview data",
    "interface-preview",
    "preview paid sales",
    "DemoNotice",
    "Demo value",
    "Demo only",
    "sample data",
    "+12.8%",
    "Partially verified",
    "MTN MoMo",
    "Other Mobile Money",
    '"Split"',
    "734600",
    "119850",
    "employeeReport",
    "paymentReport",
    "modelReport",
    "reportPeriods.daily.revenue",
  ]

  const found = fabricated.flatMap(findLiteral)
  assert.deepEqual(found, [], `fabricated demo content must not appear in src:\n${found.join("\n")}`)
})

test("the manager dashboard reads sales and inventory from the database instead of constants", () => {
  const source = read("src/app/manager/page.tsx")
  assert.match(source, /listManagerSales\(membership\.storeId\)/, "dashboard sales must come from the store register")
  assert.match(source, /listAuthorizedInventory\(membership\.storeId\)/, "inventory metrics must come from live rows")
  assert.match(source, /summarizeSales\(/, "totals must come from the shared financial summary")
  assert.match(source, /seriesForRange\(/, "the chart must be derived from persisted sales")
  assert.match(source, /EmptyState/, "the dashboard needs deliberate empty states")
  assert.ok(!/const sales\s*=\s*\[/.test(source), "no inline sale array may exist")
  assert.ok(!/\[3200, 6100/.test(source), "the old seven-day sample chart must not return")
  assert.ok(!/money\(5956\)/.test(source), "the invented average sale must not return")
})

test("the reports page and CSV export use real records and disclose the profit gap", () => {
  const page = read("src/app/manager/reports/page.tsx")
  assert.match(page, /listManagerSales\(membership\.storeId\)/)
  assert.match(page, /breakdownByEmployee\(periodSales\)/)
  assert.match(page, /breakdownByModel\(periodSales\)/)
  assert.match(page, /breakdownByPaymentMethod\(periodSales\)/)
  assert.match(page, /EmptyState/)
  assert.match(page, /Gross profit and margin are not reported/)
  assert.ok(!/exportCsv/.test(page), "the CSV must come from the server route, not generated demo rows")
  assert.ok(!/URL\.createObjectURL/.test(page), "the browser must not build a report from client state")

  const route = read("src/app/manager/reports/export/route.ts")
  assert.match(route, /listManagerSales\(membership\.storeId\)/)
  assert.match(route, /buildReportCsv\(/)
  assert.match(route, /text\/csv/)
})

test("approvals and trade-in state plainly that the workflow does not exist", () => {
  const approvals = read("src/app/manager/approvals/page.tsx")
  assert.match(approvals, /Approvals are not available yet/)
  assert.match(approvals, /no approval workflow/)
  assert.ok(!approvals.includes('"use client"'), "the approvals screen must not keep local decision state")
  assert.ok(!/onClick/.test(approvals), "there must be no approve or decline control")
  assert.ok(!/initialApprovals|makeDecision|decisionNote/.test(approvals))

  const tradeIn = read("src/app/trade-in/page.tsx")
  assert.match(tradeIn, /Trade-in is not available in Mac Evra POS yet/)
  assert.match(tradeIn, /Do not quote a trade-in value/)
  assert.ok(!tradeIn.includes('"use client"'), "the trade-in screen must not simulate a wizard")
  assert.ok(!/estimatedOffer|baseValue|Prepare Manager Approval/.test(tradeIn))
})

test("navigation, headers and empty states no longer imply demo activity", () => {
  const shell = read("src/components/manager/manager-shell.tsx")
  assert.ok(!/count:\s*\d/.test(shell), "the approvals badge count was fabricated")
  assert.ok(!/Preview data/.test(shell))
  assert.ok(!/Notifications/.test(shell), "no notification backend exists")
  assert.ok(!/Help & support/.test(shell), "a button that does nothing must be removed")

  const home = read("src/app/home/home-client.tsx")
  assert.ok(!/not connected yet/.test(home))
  assert.ok(!/no active sale in this preview/.test(home))
  assert.ok(!/useState/.test(home), "the employee home no longer keeps demo messages")

  const dashboard = read("src/app/manager/page.tsx")
  assert.ok(!/DemoNotice/.test(dashboard))
})

test("every manager and employee surface is still permission gated", () => {
  assert.deepEqual(routeRequirement("/manager/reports").permissions, ["access_manager_workspace", "view_reports"])
  assert.deepEqual(routeRequirement("/manager/approvals").permissions, [
    "access_manager_workspace",
    "review_approvals",
  ])
  assert.deepEqual(routeRequirement("/manager/settings").permissions, [
    "access_manager_workspace",
    "manage_store_settings",
  ])
  assert.deepEqual(routeRequirement("/trade-in").permissions, ["access_employee_workspace", "process_trade_ins"])

  assert.match(read("src/app/manager/approvals/page.tsx"), /requirePermissions\(\["access_manager_workspace", "review_approvals"\]/)
  assert.match(read("src/app/manager/settings/page.tsx"), /requirePermissions\(/)
  assert.match(read("src/app/manager/reports/page.tsx"), /requirePermissions\(\["access_manager_workspace", "view_reports"\]/)
  assert.match(read("src/app/manager/reports/export/route.ts"), /requirePermissions\(\["access_manager_workspace", "view_reports"\]/)
  assert.match(read("src/app/trade-in/page.tsx"), /requirePermissions\(\["access_employee_workspace"\]/)
})

test("reporting stays store-scoped and never selects acquisition cost", () => {
  assert.match(read("src/app/manager/page.tsx"), /requirePermissions\(\["access_manager_workspace"\]/)
  for (const file of [
    "src/lib/inventory-server.ts",
    "src/lib/sales-server.ts",
    "src/lib/reporting.ts",
    "src/app/manager/reports/page.tsx",
    "src/app/manager/reports/export/route.ts",
  ]) {
    const source = read(file)
    assert.ok(!source.includes("cost_pesewas"), `${file} must not select device cost`)
    assert.ok(!source.includes("createAdminClient"), `${file} must not bypass RLS`)
  }
})

test("the employee inventory and sale pages keep using authorised server reads", () => {
  const inventory = read("src/app/inventory/page.tsx")
  assert.match(inventory, /listAuthorizedInventory\(membership\.storeId\)/)
  assert.match(inventory, /requirePermissions\(\["access_employee_workspace"\]/)

  const sale = read("src/app/new-sale/page.tsx")
  assert.match(sale, /getPersistentSale/)
  assert.match(sale, /requirePermissions\(\["create_sales"\]/)
})
