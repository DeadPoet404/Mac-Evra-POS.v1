export type EmployeeSaleStep = "imei" | "payment" | "customer" | "complete"

type InventoryImeiRecord = {
  imei: string
}

const saleStepPaths: Record<EmployeeSaleStep, string> = {
  imei: "/new-sale",
  payment: "/new-sale/payment",
  customer: "/new-sale/customer-info",
  complete: "/new-sale/complete",
}

export function employeeSaleStepHref(step: EmployeeSaleStep, saleId?: string) {
  const path = saleStepPaths[step]
  return saleId ? `${path}?sale=${encodeURIComponent(saleId)}` : path
}

export function employeeSaleResumeStep(
  activeItemCount: number,
  hasConfirmedPayment: boolean,
  hasCustomer: boolean
): EmployeeSaleStep {
  if (activeItemCount !== 1) return "imei"
  if (!hasConfirmedPayment) return "payment"
  return hasCustomer ? "complete" : "customer"
}

export function normalizeImeiEntry(value: string) {
  return value.replace(/\D/g, "")
}

export function findInventoryByImei<T extends InventoryImeiRecord>(inventory: readonly T[], value: string) {
  const imei = normalizeImeiEntry(value)
  if (imei.length !== 15) return null
  return inventory.find((device) => device.imei === imei) ?? null
}
