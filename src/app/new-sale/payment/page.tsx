import { redirect } from "next/navigation"

import { employeeSaleStepHref } from "@/lib/sale-journey"

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string }>
}) {
  const params = await searchParams
  redirect(employeeSaleStepHref("review", params.sale))
}
