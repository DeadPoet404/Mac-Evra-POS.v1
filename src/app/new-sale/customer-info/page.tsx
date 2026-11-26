import { CircleAlert } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { createSaleCustomerAction } from "@/app/new-sale/actions"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { employeeSaleStepHref } from "@/lib/sale-journey"
import { getPersistentSale } from "@/lib/sales-server"

const successNotices = new Set(["customer-created", "customer-existing"])

const errors: Record<string, string> = {
  "invalid-customer": "Check the customer name and phone number.",
  "customer-create-failed": "The customer details could not be saved. Try again.",
}

export default async function CustomerInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string; notice?: string; error?: string }>
}) {
  const { membership } = await requirePermissions(["create_sales"], {
    nextPath: "/new-sale/customer-info",
  })

  const params = await searchParams
  const sale = params.sale
    ? await getPersistentSale(membership.storeId, params.sale)
    : null

  if (sale && params.notice && successNotices.has(params.notice)) {
    redirect(employeeSaleStepHref("complete", sale.id))
  }

  if (sale?.status === "cancelled") {
    redirect(employeeSaleStepHref("complete", sale.id))
  }

  if (sale && (sale.status !== "completed" || sale.payment?.status !== "confirmed")) {
    redirect(employeeSaleStepHref("payment", sale.id))
  }

  if (sale?.customer) {
    redirect(employeeSaleStepHref("complete", sale.id))
  }

  const activeItems = sale?.items.filter((item) => item.status === "active") ?? []

  if (sale && activeItems.length === 0) {
    redirect(employeeSaleStepHref("complete", sale.id))
  }

  return (
    <main className="min-h-screen bg-white pb-[calc(100px+env(safe-area-inset-bottom))] text-[#111111]">
      <EmployeeHeader
        title=""
        backHref={sale ? employeeSaleStepHref("payment", sale.id) : "/new-sale"}
        backLabel="Back"
      />

      <div className="mx-auto w-full max-w-[430px] px-5 pt-9">
        <h1 className="max-w-[360px] text-[30px] font-semibold leading-[1.12] tracking-[-0.8px] text-black">
          A Few Details Before
          <br />
          We Continue
        </h1>

        <p className="mt-4 max-w-[370px] text-[15px] leading-[1.55] text-[#686868]">
          Enter the customer's contact information to keep the transaction
          organised and make future purchases easier.
        </p>

        {params.error && errors[params.error] ? (
          <p
            role="alert"
            className="mt-6 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] px-4 py-3 text-sm font-medium text-[#6E0728]"
          >
            {errors[params.error]}
          </p>
        ) : null}

        {!sale || activeItems.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-dashed border-[#D8D8DC] bg-white p-8 text-center">
            <CircleAlert className="mx-auto size-8 text-[#A1A1A6]" />
            <h2 className="mt-4 font-semibold">Verify a device first</h2>
            <Link
              href="/new-sale"
              className="mt-4 inline-block text-sm font-semibold text-[#111111] underline"
            >
              Return to IMEI verification
            </Link>
          </section>
        ) : (
          <form action={createSaleCustomerAction} className="mt-9">
            <input type="hidden" name="saleId" value={sale.id} />

            <div className="space-y-6">
              <label className="block">
                <span className="mb-3 block text-[15px] font-semibold text-[#171717]">
                  Customer name
                </span>
                <input
                  name="fullName"
                  type="text"
                  defaultValue={sale.customer?.fullName ?? ""}
                  autoComplete="name"
                  required
                  maxLength={160}
                  placeholder="Enter full Name"
                  className="h-[86px] w-full rounded-[20px] border border-[#292929] bg-white px-5 text-[17px] text-black outline-none placeholder:text-[#A0A0A0] focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>

              <label className="block">
                <span className="mb-3 block text-[15px] font-semibold text-[#171717]">
                  Phone number
                </span>
                <input
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  defaultValue={sale.customer?.phone ?? ""}
                  autoComplete="tel"
                  required
                  maxLength={15}
                  placeholder="XXXX.XXXXX.XXX"
                  className="h-[102px] w-full rounded-[20px] border border-[#292929] bg-white px-5 text-[17px] text-black outline-none placeholder:text-[#A0A0A0] focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-white/95 px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
              <div className="mx-auto w-full max-w-[390px]">
                <button
                  type="submit"
                  className="h-[50px] w-full rounded-[14px] bg-black px-6 text-[16px] font-semibold text-white transition hover:bg-[#252525] active:scale-[0.99]"
                >
                  Checkout
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
