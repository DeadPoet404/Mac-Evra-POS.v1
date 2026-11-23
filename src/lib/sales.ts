export const saleStatuses = ["draft", "awaiting_payment", "cancelled"] as const
export type SaleStatus = (typeof saleStatuses)[number]

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

export function saleStatusLabel(status: SaleStatus) {
  if (status === "awaiting_payment") return "Awaiting payment"
  return status[0].toUpperCase() + status.slice(1)
}

export type SaleCompletionPresentation = {
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
  saleId: string
): SaleCompletionPresentation {
  const draftHref = `/new-sale?sale=${encodeURIComponent(saleId)}`

  if (status === "draft") {
    return {
      eyebrow: "Draft · work in progress",
      title: "This sale is still a draft.",
      description: "It has not moved to payment review. Return to the draft to review its items, customer, and reservations.",
      amountLabel: "Current draft total",
      noticeTitle: "Not awaiting payment.",
      notice: "This draft must be reviewed and explicitly moved to awaiting payment before any payment workflow can begin.",
      actionLabel: "Return to draft",
      actionHref: draftHref,
    }
  }

  if (status === "cancelled") {
    return {
      eyebrow: "Cancelled · reservations released",
      title: "This sale was cancelled.",
      description: "No payment is pending. Active inventory reservations were released during cancellation where applicable, and no inventory was marked sold.",
      amountLabel: "Total when cancelled",
      noticeTitle: "Sale cancelled.",
      notice: "Its active reservations were released where applicable. The devices were not sold or fulfilled.",
      actionLabel: "Return to sales",
      actionHref: "/new-sale",
    }
  }

  if (status === "awaiting_payment") {
    return {
      eyebrow: "Not paid · not fulfilled",
      title: "Awaiting verified payment.",
      description: "The sale is saved, but no payment has been recorded and the device has not been marked sold.",
      amountLabel: "Amount awaiting verification",
      noticeTitle: "Do not hand over the device.",
      notice: "Payment must be verified before fulfilment.",
      actionLabel: "Return to sales",
      actionHref: "/new-sale",
    }
  }

  throw new Error(`Unsupported sale completion status: ${status satisfies never}`)
}

export async function resolveSaleCompletion<
  T extends { id: string; status: SaleStatus },
>(
  saleId: string | undefined,
  loadSale: (saleId: string) => Promise<T | null>
): Promise<{ sale: T; presentation: SaleCompletionPresentation } | null> {
  if (!saleId) return null
  const sale = await loadSale(saleId)
  if (!sale) return null
  return {
    sale,
    presentation: saleCompletionPresentation(sale.status, sale.id),
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
