import Link from "next/link"
import { ArrowLeft, CircleAlert, Repeat2, ShieldCheck } from "lucide-react"

import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"

/**
 * Trade-in is not implemented on `main`.
 *
 * There is no trade-in table, no valuation rule set and no approval RPC, so the
 * previous six-step wizard — invented valuations, sample inventory and a button
 * that claimed to prepare a manager approval but wrote nothing — has been
 * removed. The route and navigation are kept so employees are told the truth
 * rather than being dropped on a 404 or shown fabricated figures.
 */
export default async function TradeInPage() {
  await requirePermissions(["access_employee_workspace"], { nextPath: "/trade-in" })

  return (
    <main className="min-h-screen bg-white pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Process a Swap" backHref="/home" backLabel="Home" />

      <div className="mx-auto w-full max-w-3xl px-5 sm:px-6">
        <section className="pb-6 pt-8 sm:pt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Employee-assisted trade-in</p>
          <h1 className="mt-2 text-[36px] font-semibold leading-tight tracking-[-1.2px] text-[#6E0728] sm:text-[42px]">
            Process a Swap.
          </h1>
          <p className="mt-2 max-w-xl text-[18px] font-semibold leading-snug tracking-[-0.35px] text-[#86868B] sm:text-[20px]">
            Trade-in is not available in Mac Evra POS yet.
          </p>
        </section>

        <section className="rounded-2xl border border-[#E5E5E7] bg-white p-6 sm:p-8">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#F5EDF0] text-[#6E0728]">
            <Repeat2 size={22} aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">No trade-in is recorded or valued here</h2>
          <p className="mt-3 text-sm leading-6 text-[#68686D]">
            The store database has no trade-in records, no inspection history and no valuation rules. Nothing you enter
            would be saved, and any offer shown would be invented — so this screen does not offer a valuation, a
            replacement picker or an approval request.
          </p>

          <div className="mt-6 rounded-2xl border border-[#F2E2BD] bg-[#FFF9EB] p-5 text-sm leading-6 text-[#765613]">
            <p className="flex items-center gap-2 font-semibold">
              <CircleAlert size={16} aria-hidden="true" /> Do not quote a trade-in value
            </p>
            <p className="mt-2">
              If a customer asks for a swap, record the sale of the replacement device normally and refer the trade-in
              to the manager. No trade-in value has been approved for this store.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-[#E5E5E7] p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={16} className="text-[#6E0728]" aria-hidden="true" /> What is needed before this ships
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#68686D]">
              <li>• A store-scoped trade-in record with the customer, device identifier and inspection results.</li>
              <li>• Manager-owned valuation rules, so no employee can invent an allowance.</li>
              <li>• An approval step that can only be executed by an authorised manager, with an audit trail.</li>
            </ul>
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            <Link
              href="/home"
              className="inline-flex items-center gap-2 rounded-full border border-[#D8D8DC] px-5 py-3 text-sm font-semibold text-[#6E0728]"
            >
              <ArrowLeft size={16} /> Back home
            </Link>
            <Link
              href="/new-sale"
              className="inline-flex items-center gap-2 rounded-full bg-[#6E0728] px-5 py-3 text-sm font-semibold text-white"
            >
              Start a sale
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
