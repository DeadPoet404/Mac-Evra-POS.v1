import { requirePermissions } from "@/lib/auth/server"
import { openingStockConditions, summarizeOpeningStockInvoiceReconciliation } from "@/lib/opening-stock"
import { loadOpeningStockDashboard } from "@/lib/opening-stock-server"

import { OpeningStockWorkspace } from "./workspace"

export const dynamic = "force-dynamic"

/**
 * Opening Stock — one workspace, three tabs.
 *
 * Authority stays on the server: this module only checks permissions and loads
 * the RLS-gated views, then hands typed, cost-masked data to the client
 * workspace. Every write from the workspace goes through a server action that
 * re-checks permissions and calls the existing audited RPCs.
 *
 * `summarizeOpeningStockInvoiceReconciliation` is the single definition of
 * "reconciled" shared with the database rules. It is called here so the server
 * — not the browser — decides whether an invoice balances, and so no invoice
 * figure is ever hardcoded.
 */
export default async function OpeningStockPage() {
  const { membership } = await requirePermissions(["access_manager_workspace", "manage_inventory"], {
    nextPath: "/manager/opening-stock",
  })

  // The store id comes from the authorised membership, never from the browser,
  // and the views it reads are RLS-gated to that same store.
  const dashboard = await loadOpeningStockDashboard(membership.storeId)

  const reconciliationByInvoice = new Map<
    string,
    ReturnType<typeof summarizeOpeningStockInvoiceReconciliation> | null
  >()
  for (const invoice of dashboard.invoices) {
    const lines = dashboard.lines.filter((line) => line.invoiceId === invoice.id)
    // An invoice with no lines, or one whose declared total is not visible to
    // this membership, has no reconciliation yet: the helper rejects such input
    // by design, so it only runs when there is something to reconcile.
    const reconcilable = lines.length > 0 && (invoice.declaredTotalPesewas ?? 0) > 0
    reconciliationByInvoice.set(
      invoice.id,
      reconcilable
        ? summarizeOpeningStockInvoiceReconciliation(lines, invoice.declaredTotalPesewas as number)
        : null
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <OpeningStockWorkspace
        dashboard={dashboard}
        reconciliationByInvoice={reconciliationByInvoice}
        permittedConditions={[...openingStockConditions]}
      />
    </div>
  )
}
