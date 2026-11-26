import Link from "next/link"
import { redirect } from "next/navigation"

import { ConfirmationScreen } from "@/app/new-sale/complete/confirmation-screen"
import { requirePermissions } from "@/lib/auth/server"
import { employeeSaleStepHref } from "@/lib/sale-journey"
import { formatPesewas, resolveSaleCompletion } from "@/lib/sales"
import { getPersistentSale } from "@/lib/sales-server"
import { readAuthorizedInventoryDeviceByImei } from "@/lib/inventory-server"

export default async function SaleCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string }>
}) {
  const { membership } = await requirePermissions(
    ["create_sales"],
    { nextPath: "/new-sale/complete" }
  )

  const params = await searchParams
  const completion = await resolveSaleCompletion(
    params.sale,
    (saleId) => getPersistentSale(membership.storeId, saleId)
  )

  const sale = completion?.sale ?? null
  const presentation = completion?.presentation ?? null

  if (
    sale?.status === "completed" &&
    sale.payment?.status === "confirmed" &&
    !sale.customer
  ) {
    redirect(employeeSaleStepHref("customer", sale.id))
  }

  if (sale && presentation?.isSuccess && sale.customer) {
    const activeItems = sale.items.filter((item) => item.status === "active")

    const devices = await Promise.all(
      activeItems.map(async (item) => {
        try {
          const device = await readAuthorizedInventoryDeviceByImei(
            membership.storeId,
            item.imei
          )
          return {
            description: item.description,
            imei: item.imei,
            colour: device?.colour ?? null,
            condition: device?.condition ?? null,
            batteryHealth: device?.batteryHealth ?? null,
            storage: device?.storage ?? null,
          }
        } catch {
          return {
            description: item.description,
            imei: item.imei,
            colour: null,
            condition: null,
            batteryHealth: null,
            storage: null,
          }
        }
      })
    )

    return (
      <ConfirmationScreen
        customerName={sale.customer.fullName}
        saleNumber={sale.saleNumber}
        productName={activeItems[0]?.description ?? "Completed order"}
        total={formatPesewas(sale.totalPesewas)}
        devices={devices}
      />
    )
  }

  return (
    <main className="min-h-dvh bg-white px-5 py-12 text-[#171717]">
      <section className="mx-auto w-full max-w-[430px] rounded-3xl border border-[#E8E8ED] bg-white p-6 text-center">
        <h1 className="text-2xl font-semibold">
          {sale?.status === "cancelled" ? "Sale cancelled" : "Sale status"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#686868]">
          {presentation?.description ?? "The sale confirmation could not be loaded."}
        </p>
        {sale ? (
          <p className="mt-4 text-sm text-[#686868]">
            Order {sale.saleNumber}
          </p>
        ) : null}
        <Link
          href={presentation?.actionHref ?? "/new-sale"}
          className="mt-6 flex h-14 items-center justify-center rounded-full bg-black px-5 text-base font-semibold text-white"
        >
          {presentation?.actionLabel ?? "Return to sales"}
        </Link>
      </section>
    </main>
  )
}
