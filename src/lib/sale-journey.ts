export type EmployeeSaleStep = "imei" | "customer" | "review" | "status"

type InventoryImeiRecord = {
  imei: string
}

const saleStepPaths: Record<EmployeeSaleStep, string> = {
  imei: "/new-sale",
  customer: "/new-sale/customer-info",
  review: "/new-sale/checkout",
  status: "/new-sale/complete",
}

export function employeeSaleStepHref(step: EmployeeSaleStep, saleId?: string) {
  const path = saleStepPaths[step]
  return saleId ? `${path}?sale=${encodeURIComponent(saleId)}` : path
}

export function normalizeImeiEntry(value: string) {
  return value.replace(/\D/g, "")
}

export function findInventoryByImei<T extends InventoryImeiRecord>(inventory: readonly T[], value: string) {
  const imei = normalizeImeiEntry(value)
  if (imei.length !== 15) return null
  return inventory.find((device) => device.imei === imei) ?? null
}
