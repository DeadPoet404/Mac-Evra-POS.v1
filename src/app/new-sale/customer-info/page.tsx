import Link from "next/link"
import { Search, UserPlus, UserRound, UsersRound } from "lucide-react"

import { createSaleCustomerAction, selectSaleCustomerAction } from "@/app/new-sale/actions"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { formatPesewas } from "@/lib/sales"
import { getPersistentSale, listStoreCustomers } from "@/lib/sales-server"

const notices: Record<string, string> = {
  "customer-selected": "Customer selection saved.",
  "customer-created": "Customer created and associated with this sale.",
  "customer-existing": "An existing customer with that phone number was selected instead of creating a duplicate.",
}
const errors: Record<string, string> = {
  "customer-select-failed": "That customer could not be associated with this sale.",
  "invalid-customer": "Check the customer name, phone number, email, and note length.",
  "customer-create-failed": "The customer could not be created safely.",
}

export default async function CustomerInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; q?: string; notice?: string; error?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale/customer-info" })
  const params = await searchParams
  const sale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null
  const customers = sale ? await listStoreCustomers(membership.storeId, params.q ?? "") : []

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Customer" backHref={sale ? `/new-sale?sale=${sale.id}` : "/new-sale"} />
      <div className="mx-auto w-full max-w-5xl px-5 pt-9 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Sale customer</p>
        <h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728]">Who is buying?</h1>
        <p className="mt-2 text-lg font-semibold text-[#86868B]">Select a store customer, create the smallest useful record, or keep the sale as walk-in.</p>

        {params.notice && notices[params.notice] ? <p role="status" className="mt-6 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm text-[#267343]">{notices[params.notice]}</p> : null}
        {params.error && errors[params.error] ? <p role="alert" className="mt-6 rounded-xl border border-[#E8C9D2] bg-[#FCF4F6] px-4 py-3 text-sm text-[#6E0728]">{errors[params.error]}</p> : null}

        {!sale ? (
          <section className="mt-8 rounded-3xl border border-dashed border-[#D8D8DC] bg-white p-12 text-center">
            <UserRound className="mx-auto size-8 text-[#A1A1A6]" />
            <h2 className="mt-4 font-semibold">Choose a sale first</h2>
            <Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Return to sale drafts</Link>
          </section>
        ) : sale.status !== "draft" ? (
          <section className="mt-8 rounded-3xl border border-[#F2E2BD] bg-[#FFF9EB] p-8">
            <h2 className="font-semibold text-[#765613]">Customer details are locked</h2>
            <p className="mt-2 text-sm text-[#765613]">Only a draft sale can change its customer association.</p>
            <Link href={`/new-sale/checkout?sale=${sale.id}`} className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">View checkout</Link>
          </section>
        ) : (
          <>
            <section className="mt-7 rounded-2xl border border-[#E8E8ED] bg-white p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-mono text-xs font-semibold text-[#6E0728]">{sale.saleNumber}</p>
                  <p className="mt-1 text-sm text-[#86868B]">{sale.items.filter((item) => item.status === "active").length} item(s) · {formatPesewas(sale.totalPesewas)}</p>
                </div>
                <div className="rounded-xl bg-[#F7F7F8] px-4 py-3">
                  <p className="text-xs text-[#86868B]">Current customer</p>
                  <p className="mt-1 font-semibold">{sale.customer?.fullName ?? "Walk-in customer"}</p>
                </div>
              </div>
            </section>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><UsersRound size={18} /></span>
                  <div><h2 className="font-semibold">Existing customers</h2><p className="mt-1 text-xs text-[#86868B]">Only customers from {membership.storeName} are visible.</p></div>
                </div>

                <form method="get" className="relative mt-5">
                  <input type="hidden" name="sale" value={sale.id} />
                  <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#86868B]" />
                  <input name="q" defaultValue={params.q ?? ""} placeholder="Search name, phone or email" className="h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] pl-11 pr-24 text-sm outline-none focus:border-[#6E0728]" />
                  <button type="submit" className="absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-full bg-[#6E0728] px-4 text-xs font-semibold text-white">Search</button>
                </form>

                <form action={selectSaleCustomerAction} className="mt-3">
                  <input type="hidden" name="saleId" value={sale.id} />
                  <input type="hidden" name="customerId" value="" />
                  <button type="submit" className={`w-full rounded-xl border p-4 text-left ${!sale.customer ? "border-[#6E0728] bg-[#FCF7F9]" : "border-[#ECECEF]"}`}>
                    <p className="font-semibold">Walk-in customer</p>
                    <p className="mt-1 text-xs text-[#86868B]">No customer record is required for this sale.</p>
                  </button>
                </form>

                <div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                  {customers.length ? customers.map((customer) => (
                    <form key={customer.id} action={selectSaleCustomerAction}>
                      <input type="hidden" name="saleId" value={sale.id} />
                      <input type="hidden" name="customerId" value={customer.id} />
                      <button type="submit" className={`w-full rounded-xl border p-4 text-left transition hover:border-[#D8C4CB] ${sale.customerId === customer.id ? "border-[#6E0728] bg-[#FCF7F9]" : "border-[#ECECEF]"}`}>
                        <div className="flex items-center justify-between gap-3"><p className="font-semibold">{customer.fullName}</p>{sale.customerId === customer.id ? <span className="text-[10px] font-semibold text-[#6E0728]">SELECTED</span> : null}</div>
                        <p className="mt-1 text-sm text-[#68686D]">{customer.phone}</p>
                        {customer.email ? <p className="mt-1 text-xs text-[#86868B]">{customer.email}</p> : null}
                      </button>
                    </form>
                  )) : <p className="rounded-xl border border-dashed border-[#D8D8DC] p-8 text-center text-sm text-[#86868B]">No matching customers.</p>}
                </div>
              </section>

              <section className="h-fit rounded-3xl border border-[#E8E8ED] bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><UserPlus size={18} /></span>
                  <div><h2 className="font-semibold">Create customer</h2><p className="mt-1 text-xs text-[#86868B]">Phone matching prevents practical duplicates.</p></div>
                </div>
                <form action={createSaleCustomerAction} className="mt-5 space-y-4">
                  <input type="hidden" name="saleId" value={sale.id} />
                  <Field label="Full name" name="fullName" autoComplete="name" required maxLength={160} placeholder="Customer's full name" />
                  <Field label="Phone number" name="phone" type="tel" autoComplete="tel" required maxLength={32} placeholder="024 000 0000 or +233…" />
                  <Field label="Email (optional)" name="email" type="email" autoComplete="email" maxLength={320} placeholder="customer@example.com" />
                  <label className="block text-sm font-medium">Notes <span className="font-normal text-[#86868B]">(optional)</span>
                    <textarea name="notes" maxLength={2000} rows={3} placeholder="Only information useful for this customer relationship" className="mt-2 w-full resize-y rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-3 text-sm outline-none focus:border-[#6E0728]" />
                  </label>
                  <button type="submit" className="w-full rounded-full bg-[#6E0728] px-5 py-3.5 text-sm font-semibold text-white">Create and select customer</button>
                </form>
              </section>
            </div>

            <div className="mt-6 flex justify-end">
              <Link href={`/new-sale/checkout?sale=${sale.id}`} className="inline-flex h-11 items-center rounded-full bg-[#6E0728] px-6 text-sm font-semibold text-white">Continue to checkout</Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function Field({ label, name, type = "text", ...props }: { label: string; name: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="block text-sm font-medium">{label}<input name={name} type={type} {...props} className="mt-2 h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 text-sm outline-none focus:border-[#6E0728]" /></label>
}
