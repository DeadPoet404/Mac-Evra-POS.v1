export const saleStatuses = ["draft", "awaiting_payment", "completed", "cancelled"] as const
export type SaleStatus = (typeof saleStatuses)[number]

export const paymentMethods = ["mobile_money", "cash", "bank_transfer"] as const
export type PaymentMethod = (typeof paymentMethods)[number]

export type CustomerInput = {
  fullName: string
  phone: string
  email: string
  notes: string
}

export function formatPesewas(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Money value must be an integer number of pesewas.")
  const amount = BigInt(value)
  const absolute = amount < BigInt(0) ? -amount : amount
  const cedis = absolute / BigInt(100)
  const fraction = absolute % BigInt(100)
  const groupedCedis = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 }).format(Number(cedis))
  return `${amount < BigInt(0) ? "−" : ""}GH₵${groupedCedis}.${fraction.toString().padStart(2, "0")}`
}

export function pesewasToGhsInput(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Money value must be non-negative integer pesewas.")
  const amount = BigInt(value)
  return `${amount / BigInt(100)}.${(amount % BigInt(100)).toString().padStart(2, "0")}`
}

export function parseGhsToPesewas(value: FormDataEntryValue | string | null | undefined) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(input)) {
    throw new Error("Enter a valid Ghana cedi amount with no more than two decimal places.")
  }

  const [cedis, fraction = ""] = input.split(".")
  const pesewas = BigInt(cedis) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))
  if (pesewas > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Money amount is too large.")
  return Number(pesewas)
}

export function normalizeCustomerInput(input: CustomerInput): CustomerInput {
  const fullName = input.fullName.trim().replace(/\s+/g, " ")
  const phone = input.phone.trim().replace(/\s+/g, " ")
  const email = input.email.trim().toLowerCase()
  const notes = input.notes.trim()

  if (fullName.length < 2 || fullName.length > 160) {
    throw new Error("Customer name must contain between 2 and 160 characters.")
  }
  if (phone.length < 7 || phone.length > 32 || !/^[\s()+0-9-]+$/.test(phone)) {
    throw new Error("Enter a valid customer phone number.")
  }
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) {
    throw new Error("Enter a valid customer phone number.")
  }
  if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Enter a valid customer email address.")
  }
  if (notes.length > 2000) throw new Error("Customer notes must not exceed 2,000 characters.")

  return { fullName, phone, email, notes }
}

export function parsePaymentMethod(value: FormDataEntryValue | string | null | undefined): PaymentMethod {
  if (typeof value !== "string" || !paymentMethods.includes(value as PaymentMethod)) {
    throw new Error("Select a supported payment method.")
  }
  return value as PaymentMethod
}

export function paymentMethodLabel(method: PaymentMethod) {
  if (method === "mobile_money") return "Mobile Money"
  if (method === "bank_transfer") return "Bank transfer"
  return "Cash"
}

export function saleStatusLabel(status: SaleStatus) {
  if (status === "awaiting_payment") return "Awaiting payment"
  return status[0].toUpperCase() + status.slice(1)
}

export type SaleCompletionPresentation = {
  isSuccess: boolean
  eyebrow: string
  title: string
  description: string
  amountLabel: string
  noticeTitle: string
  notice: string
  actionLabel: string
  actionHref: string
}

export function saleCompletionPresentation(
  status: SaleStatus,
  saleId: string,
  hasConfirmedPayment: boolean
): SaleCompletionPresentation {
  const draftHref = `/new-sale?sale=${encodeURIComponent(saleId)}`
  const paymentHref = `/new-sale/payment?sale=${encodeURIComponent(saleId)}`

  if (status === "completed" && hasConfirmedPayment) {
    return {
      isSuccess: true,
      eyebrow: "Completed · payment recorded",
      title: "Sale complete.",
      description: "The full payment and completed sale are persisted. The reservation is fulfilled and the device is recorded as sold.",
      amountLabel: "Amount received",
      noticeTitle: "Payment recorded.",
      notice: "This is a manual employee confirmation that the full amount was received; any reference is metadata only.",
      actionLabel: "Start another sale",
      actionHref: "/new-sale",
    }
  }

  if (status === "draft") {
    return {
      isSuccess: false,
      eyebrow: "Draft · not paid",
      title: "This sale is not complete.",
      description: "No completed payment is persisted for this draft.",
      amountLabel: "Current draft total",
      noticeTitle: "Do not hand over the device.",
      notice: "Return to the sale and confirm payment only after the full amount has actually been received.",
      actionLabel: "Return to sale",
      actionHref: draftHref,
    }
  }

  if (status === "awaiting_payment") {
    return {
      isSuccess: false,
      eyebrow: "Awaiting payment · not completed",
      title: "This sale is not complete.",
      description: "No completed payment is persisted for this sale.",
      amountLabel: "Amount due",
      noticeTitle: "Do not hand over the device.",
      notice: "Record payment only after the full amount has actually been received.",
      actionLabel: "Return to payment",
      actionHref: paymentHref,
    }
  }

  if (status === "cancelled") {
    return {
      isSuccess: false,
      eyebrow: "Cancelled · reservations released",
      title: "This sale was cancelled.",
      description: "No successful completion is recorded. Active inventory reservations were released where applicable.",
      amountLabel: "Total when cancelled",
      noticeTitle: "Sale cancelled.",
      notice: "The device was not sold or fulfilled by this sale.",
      actionLabel: "Return to sales",
      actionHref: "/new-sale",
    }
  }

  return {
    isSuccess: false,
    eyebrow: "Completion unavailable",
    title: "This sale is not complete.",
    description: "The sale does not have a matching persisted payment confirmation.",
    amountLabel: "Sale total",
    noticeTitle: "Do not hand over the device.",
    notice: "A completed status without its authorised payment record is not accepted as proof of payment.",
    actionLabel: "Return to sales",
    actionHref: "/new-sale",
  }
}

export async function resolveSaleCompletion<
  T extends {
    id: string
    status: SaleStatus
    totalPesewas: number
    completedAt: string | null
    payment?: { status: string; amountPesewas: number; currency: string } | null
  },
>(
  saleId: string | undefined,
  loadSale: (saleId: string) => Promise<T | null>
): Promise<{ sale: T; presentation: SaleCompletionPresentation } | null> {
  if (!saleId) return null
  const sale = await loadSale(saleId)
  if (!sale) return null
  return {
    sale,
    presentation: saleCompletionPresentation(
      sale.status,
      sale.id,
      Boolean(
        sale.completedAt &&
        sale.payment?.status === "confirmed" &&
        sale.payment.currency === "GHS" &&
        sale.payment.amountPesewas === sale.totalPesewas
      )
    ),
  }
}

export function matchesCustomerSearch(
  customer: { fullName: string; phone: string; email: string | null },
  query: string
) {
  const normalized = query.trim().toLocaleLowerCase("en-GH")
  if (!normalized) return true
  return [customer.fullName, customer.phone, customer.email ?? ""]
    .join(" ")
    .toLocaleLowerCase("en-GH")
    .includes(normalized)
}

export function matchesSaleSearch(
  sale: {
    saleNumber: string
    customerName: string | null
    employeeName: string
    itemDescriptions: readonly string[]
    imeis: readonly string[]
  },
  query: string
) {
  const normalized = query.trim().toLocaleLowerCase("en-GH")
  if (!normalized) return true
  return [
    sale.saleNumber,
    sale.customerName ?? "Walk-in customer",
    sale.employeeName,
    ...sale.itemDescriptions,
    ...sale.imeis,
  ]
    .join(" ")
    .toLocaleLowerCase("en-GH")
    .includes(normalized)
}
