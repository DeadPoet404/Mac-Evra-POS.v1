import "server-only"

import { createClient } from "@/lib/supabase/server"
import { matchesCustomerSearch, type SaleStatus } from "@/lib/sales"

export type SaleCustomer = {
  id: string
  fullName: string
  phone: string
  email: string | null
  notes: string | null
}

export type SaleItem = {
  id: string
  saleId: string
  deviceId: string
  reservationId: string
  description: string
  imei: string
  unitPricePesewas: number
  discountPesewas: number
  lineTotalPesewas: number
  status: "active" | "removed"
  reservationStatus: string | null
  reservationExpiresAt: string | null
}

export type PersistentSale = {
  id: string
  saleNumber: string
  storeId: string
  employeeUserId: string
  employeeName: string
  customerId: string | null
  customer: SaleCustomer | null
  status: SaleStatus
  subtotalPesewas: number
  discountPesewas: number
  totalPesewas: number
  currency: "GHS"
  expiresAt: string
  submittedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  createdAt: string
  updatedAt: string
  items: SaleItem[]
}

type RawSale = {
  id: unknown
  sale_number: unknown
  store_id: unknown
  created_by_user_id: unknown
  created_by_display_name: unknown
  customer_id: unknown
  status: unknown
  subtotal_pesewas: unknown
  discount_pesewas: unknown
  total_pesewas: unknown
  currency: unknown
  expires_at: unknown
  submitted_at: unknown
  cancelled_at: unknown
  cancellation_reason: unknown
  created_at: unknown
  updated_at: unknown
}

type RawCustomer = {
  id: unknown
  full_name: unknown
  phone: unknown
  email: unknown
  notes: unknown
}

type RawItem = {
  id: unknown
  sale_id: unknown
  device_id: unknown
  reservation_id: unknown
  product_description: unknown
  imei: unknown
  unit_price_pesewas: unknown
  discount_pesewas: unknown
  line_total_pesewas: unknown
  status: unknown
}

const saleSelection = [
  "id",
  "sale_number",
  "store_id",
  "created_by_user_id",
  "created_by_display_name",
  "customer_id",
  "status",
  "subtotal_pesewas",
  "discount_pesewas",
  "total_pesewas",
  "currency",
  "expires_at",
  "submitted_at",
  "cancelled_at",
  "cancellation_reason",
  "created_at",
  "updated_at",
].join(",")

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`Sale response has an invalid ${label}.`)
  return value
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function requiredInteger(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`Sale response has an invalid ${label}.`)
  return parsed
}

function mapCustomer(value: RawCustomer): SaleCustomer {
  return {
    id: requiredString(value.id, "customer ID"),
    fullName: requiredString(value.full_name, "customer name"),
    phone: requiredString(value.phone, "customer phone"),
    email: optionalString(value.email),
    notes: optionalString(value.notes),
  }
}

function mapItem(
  value: RawItem,
  reservations: Map<string, { status: string; expiresAt: string }>
): SaleItem {
  const reservationId = requiredString(value.reservation_id, "reservation ID")
  const reservation = reservations.get(reservationId)
  const status = requiredString(value.status, "item status")
  if (status !== "active" && status !== "removed") throw new Error("Sale response has an invalid item status.")

  return {
    id: requiredString(value.id, "item ID"),
    saleId: requiredString(value.sale_id, "sale ID"),
    deviceId: requiredString(value.device_id, "device ID"),
    reservationId,
    description: requiredString(value.product_description, "item description"),
    imei: requiredString(value.imei, "item IMEI"),
    unitPricePesewas: requiredInteger(value.unit_price_pesewas, "unit price"),
    discountPesewas: requiredInteger(value.discount_pesewas, "item discount"),
    lineTotalPesewas: requiredInteger(value.line_total_pesewas, "line total"),
    status,
    reservationStatus: reservation?.status ?? null,
    reservationExpiresAt: reservation?.expiresAt ?? null,
  }
}

function mapSale(
  value: RawSale,
  customers: Map<string, SaleCustomer>,
  items: Map<string, SaleItem[]>
): PersistentSale {
  const status = requiredString(value.status, "status")
  if (!(["draft", "awaiting_payment", "cancelled"] as string[]).includes(status)) {
    throw new Error("Sale response has an unsupported status.")
  }
  const currency = requiredString(value.currency, "currency")
  if (currency !== "GHS") throw new Error("Sale response has an unsupported currency.")
  const id = requiredString(value.id, "ID")
  const customerId = optionalString(value.customer_id)

  return {
    id,
    saleNumber: requiredString(value.sale_number, "number"),
    storeId: requiredString(value.store_id, "store ID"),
    employeeUserId: requiredString(value.created_by_user_id, "employee ID"),
    employeeName: requiredString(value.created_by_display_name, "employee name"),
    customerId,
    customer: customerId ? customers.get(customerId) ?? null : null,
    status: status as SaleStatus,
    subtotalPesewas: requiredInteger(value.subtotal_pesewas, "subtotal"),
    discountPesewas: requiredInteger(value.discount_pesewas, "discount"),
    totalPesewas: requiredInteger(value.total_pesewas, "total"),
    currency: "GHS",
    expiresAt: requiredString(value.expires_at, "expiry"),
    submittedAt: optionalString(value.submitted_at),
    cancelledAt: optionalString(value.cancelled_at),
    cancellationReason: optionalString(value.cancellation_reason),
    createdAt: requiredString(value.created_at, "created timestamp"),
    updatedAt: requiredString(value.updated_at, "updated timestamp"),
    items: items.get(id) ?? [],
  }
}

async function hydrateSales(rawSales: RawSale[]) {
  if (rawSales.length === 0) return []
  const supabase = await createClient()
  const saleIds = rawSales.map((sale) => requiredString(sale.id, "ID"))
  const customerIds = [...new Set(rawSales.map((sale) => optionalString(sale.customer_id)).filter((id): id is string => Boolean(id)))]

  const [customerResult, itemResult] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id,full_name,phone,email,notes").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("sale_items")
      .select("id,sale_id,device_id,reservation_id,product_description,imei,unit_price_pesewas,discount_pesewas,line_total_pesewas,status")
      .in("sale_id", saleIds)
      .order("created_at", { ascending: true }),
  ])

  if (customerResult.error || itemResult.error) throw new Error("Sale details could not be loaded.")

  const rawItems = (itemResult.data ?? []) as unknown as RawItem[]
  const reservationIds = [...new Set(rawItems.map((item) => requiredString(item.reservation_id, "reservation ID")))]
  const reservationResult = reservationIds.length
    ? await supabase.from("inventory_reservations").select("id,status,expires_at").in("id", reservationIds)
    : { data: [], error: null }
  if (reservationResult.error) throw new Error("Sale reservation state could not be loaded.")

  const customers = new Map(
    ((customerResult.data ?? []) as unknown as RawCustomer[]).map((row) => {
      const customer = mapCustomer(row)
      return [customer.id, customer]
    })
  )
  const reservations = new Map(
    ((reservationResult.data ?? []) as unknown as Array<{ id: unknown; status: unknown; expires_at: unknown }>).map((row) => [
      requiredString(row.id, "reservation ID"),
      {
        status: requiredString(row.status, "reservation status"),
        expiresAt: requiredString(row.expires_at, "reservation expiry"),
      },
    ])
  )
  const items = new Map<string, SaleItem[]>()
  for (const rawItem of rawItems) {
    const item = mapItem(rawItem, reservations)
    const saleItems = items.get(item.saleId) ?? []
    saleItems.push(item)
    items.set(item.saleId, saleItems)
  }

  return rawSales.map((sale) => mapSale(sale, customers, items))
}

export async function listEmployeeSales(storeId: string, userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sales")
    .select(saleSelection)
    .eq("store_id", storeId)
    .eq("created_by_user_id", userId)
    .in("status", ["draft", "awaiting_payment"])
    .order("updated_at", { ascending: false })
    .limit(50)
  if (error) throw new Error("Sale drafts could not be loaded.")
  return hydrateSales((data ?? []) as unknown as RawSale[])
}

export async function getPersistentSale(storeId: string, saleId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sales")
    .select(saleSelection)
    .eq("store_id", storeId)
    .eq("id", saleId)
    .maybeSingle()
  if (error) throw new Error("Sale could not be loaded.")
  if (!data) return null
  return (await hydrateSales([data as unknown as RawSale]))[0] ?? null
}

export async function listManagerSales(storeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sales")
    .select(saleSelection)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error("Store sales could not be loaded.")
  return hydrateSales((data ?? []) as unknown as RawSale[])
}

export async function listStoreCustomers(storeId: string, query = "") {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("id,full_name,phone,email,notes")
    .eq("store_id", storeId)
    .order("updated_at", { ascending: false })
    .limit(200)
  if (error) throw new Error("Customers could not be loaded.")
  return ((data ?? []) as unknown as RawCustomer[])
    .map(mapCustomer)
    .filter((customer) => matchesCustomerSearch(customer, query))
    .slice(0, 50)
}
