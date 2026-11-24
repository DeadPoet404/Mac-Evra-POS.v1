import { NextResponse } from "next/server"

import { requirePermissions } from "@/lib/auth/server"
import {
  breakdownByEmployee,
  breakdownByModel,
  breakdownByPaymentMethod,
  buildReportCsv,
  isReportPeriod,
  periodRange,
  salesInRange,
  summarizeSales,
  type ReportPeriod,
} from "@/lib/reporting"
import { listManagerSalesForWindow } from "@/lib/sales-server"

/**
 * CSV export for the manager reports page.
 *
 * The file is produced on the server from the same RLS-scoped sale records the
 * reports page renders, so the download can never contain a sample row or a
 * figure that was not persisted for the caller's store.
 */
export async function GET(request: Request) {
  const { membership } = await requirePermissions(["access_manager_workspace", "view_reports"], {
    nextPath: "/manager/reports",
  })

  const requested = new URL(request.url).searchParams.get("period")
  const period: ReportPeriod = isReportPeriod(requested) ? requested : "monthly"

  const range = periodRange(period)
  const periodSales = salesInRange(
    await listManagerSalesForWindow(membership.storeId, range),
    range
  )
  const summary = summarizeSales(periodSales)

  const csv = buildReportCsv({
    storeName: membership.storeName,
    period,
    range,
    summary,
    employees: breakdownByEmployee(periodSales),
    models: breakdownByModel(periodSales),
    paymentMethods: breakdownByPaymentMethod(periodSales),
    generatedAt: new Date().toISOString(),
  })

  const fileName = `mac-evra-${membership.storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${period}-report-${range.toKey}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  })
}
