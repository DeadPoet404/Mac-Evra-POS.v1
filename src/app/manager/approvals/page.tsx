import Link from "next/link"
import { ArrowRight, ClipboardCheck, ShieldAlert } from "lucide-react"

import { PageHeader } from "@/components/manager/manager-ui"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissions } from "@/lib/auth/server"

/**
 * The approvals screen is intentionally not interactive.
 *
 * `main` has no approval-request table, no approval state machine and no
 * decision RPC: refunds, sale cancellations, discounts, trade-ins and inventory
 * adjustments are not recorded as requests anywhere in the database. Showing a
 * queue or an approve/decline control would invent a workflow that does not
 * exist and would let a manager believe a decision had been recorded when
 * nothing was written. This page therefore states that plainly and points at
 * the screens that *are* backed by persisted records.
 */
export default async function ApprovalsPage() {
  const { membership } = await requirePermissions(["access_manager_workspace", "review_approvals"], {
    nextPath: "/manager/approvals",
  })

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow={`Manager control · ${membership.storeName}`}
        title="Approvals"
        description="Sensitive actions such as refunds, discounts, cancellations and trade-ins will be reviewed here once the approval workflow exists."
      />

      <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
        <CardContent className="p-6 sm:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#F5EDF0] text-[#6E0728]">
              <ShieldAlert size={22} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">Approvals are not available yet</h2>
            <p className="mt-3 text-sm leading-6 text-[#68686D]">
              This release has no approval workflow. Nothing is queued here, no decision can be recorded, and no
              notification is sent — so the page shows no requests rather than sample ones.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-[#E8E8ED] bg-[#FAFAFB] p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck size={16} className="text-[#6E0728]" aria-hidden="true" />
              What the feature needs before it can be enabled
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#68686D]">
              <li>• A store-scoped approval request table with an immutable decision history.</li>
              <li>• A database function that records the decision and applies it to the sale, payment or inventory record.</li>
              <li>• Manager permissions enforced inside that function, plus an audit trail an employee cannot edit.</li>
            </ul>
            <p className="mt-3 text-xs leading-5 text-[#A1A1A6]">
              Simulating decisions in the browser was removed deliberately. An approval screen must never imply that money
              was refunded, a sale cancelled or stock adjusted when no database write happened.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
            <Link
              href="/manager/sales"
              className="flex items-center justify-between gap-3 rounded-xl border border-[#E8E8ED] p-4 text-sm font-medium transition hover:border-[#DCC4CD] hover:bg-[#FCF9FA]"
            >
              Review persisted sales and payments
              <ArrowRight size={16} className="text-[#A1A1A6]" aria-hidden="true" />
            </Link>
            <Link
              href="/manager/opening-stock"
              className="flex items-center justify-between gap-3 rounded-xl border border-[#E8E8ED] p-4 text-sm font-medium transition hover:border-[#DCC4CD] hover:bg-[#FCF9FA]"
            >
              Review opening-stock corrections
              <ArrowRight size={16} className="text-[#A1A1A6]" aria-hidden="true" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
