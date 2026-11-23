import { CircleAlert, Smartphone, UserRound } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { createSaleCustomerAction } from "@/app/new-sale/actions"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { employeeSaleStepHref } from "@/lib/sale-journey"
import { formatPesewas } from "@/lib/sales"
import { getPersistentSale } from "@/lib/sales-server"

const successNotices = new Set(["customer-created", "customer-existing"])
const errors: Record<string, string> = {
  "invalid-customer": "Check the customer name, phone number, and email.",
  "customer-create-failed": "The customer details could not be saved. Try again.",
}

export default async function CustomerInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; notice?: string; error?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale/customer-info" })
  const params = await searchParams
  const sale = params.sale ? await getPersistentSale(membership.storeId, params.sale) : null

  if (sale && params.notice && successNotices.has(params.notice)) {
    redirect(employeeSaleStepHref("review", sale.id))
  }
  if (sale && sale.status !== "draft") {
    redirect(employeeSaleStepHref("status", sale.id))
  }

  const activeItems = sale?.items.filter((item) => item.status === "active") ?? []
  if (sale && activeItems.length !== 1) {
    redirect(employeeSaleStepHref("imei", sale.id))
  }
  const item = activeItems[0]

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Customer" backHref={sale ? employeeSaleStepHref("imei", sale.id) : "/new-sale"} backLabel="Back" />
      <div className="mx-auto w-full max-w-2xl px-5 pt-9 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Step 2 of 4</p>
        <h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728] sm:text-[44px]">Customer details.</h1>
        <p className="mt-2 text-base text-[#68686D]">Add the customer receiving this device.</p>

        {params.error && errors[params.error] ? <p role="alert" className="mt-6 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] px-5 py-4 text-sm font-medium text-[#6E0728]">{errors[params.error]}</p> : null}

        {!sale || !item ? (
          <section className="mt-8 rounded-3xl border border-dashed border-[#D8D8DC] bg-white p-10 text-center">
            <CircleAlert className="mx-auto size-8 text-[#A1A1A6]" />
            <h2 className="mt-4 font-semibold">Verify a device first</h2>
            <Link href="/new-sale" className="mt-4 inline-block text-sm font-semibold text-[#6E0728]">Return to IMEI verification</Link>
          </section>
        ) : (
          <div className="mt-8 space-y-5">
            <section className="flex items-center justify-between gap-4 rounded-2xl border border-[#E8E8ED] bg-white p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><Smartphone size={20} /></span>
                <div className="min-w-0"><p className="truncate font-semibold">{item.description}</p><p className="mt-1 font-mono text-xs text-[#86868B]">{item.imei}</p></div>
              </div>
              <p className="shrink-0 font-semibold text-[#6E0728]">{formatPesewas(item.lineTotalPesewas)}</p>
            </section>

            <form action={createSaleCustomerAction} className="rounded-3xl border border-[#E8E8ED] bg-white p-5 shadow-sm sm:p-8">
              <input type="hidden" name="saleId" value={sale.id} />
              <div className="space-y-5">
                <Field
                  label="Full name"
                  name="fullName"
                  defaultValue={sale.customer?.fullName ?? ""}
                  autoComplete="name"
                  required
                  maxLength={160}
                  placeholder="Customer's full name"
                />
                <Field
                  label="Phone number"
                  name="phone"
                  type="tel"
                  defaultValue={sale.customer?.phone ?? ""}
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  maxLength={32}
                  placeholder="024 000 0000"
                />
                <Field
                  label="Email"
                  optional
                  name="email"
                  type="email"
                  defaultValue={sale.customer?.email ?? ""}
                  autoComplete="email"
                  maxLength={320}
                  placeholder="customer@example.com"
                />
              </div>
              <button type="submit" className="mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white hover:bg-[#57051F]">
                <UserRound size={19} /> Continue
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}

function Field({
  label,
  optional = false,
  ...props
}: {
  label: string
  optional?: boolean
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-semibold">
      {label}{optional ? <span className="ml-1 font-normal text-[#86868B]">(optional)</span> : null}
      <input {...props} className="mt-2 h-14 w-full rounded-2xl border border-[#D8D8DC] bg-[#FAFAFC] px-4 text-base outline-none transition focus:border-[#6E0728] focus:ring-4 focus:ring-[#6E0728]/10" />
    </label>
  )
}
