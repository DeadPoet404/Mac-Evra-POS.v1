import "server-only"

import { createClient } from "@/lib/supabase/server"

export type PersistentInventoryStatus = "available" | "reserved" | "sold"
export type PersistentDeviceCondition = "excellent" | "good" | "fair"

export type AuthorizedInventoryDevice = {
  inventoryId: string
  storeId: string
  deviceId: string
  model: string
  storageGb: number
  storage: string
  colour: string
  condition: PersistentDeviceCondition
  batteryHealth: number
  imei: string
  status: PersistentInventoryStatus
  pricePesewas: number
  receivedAt: string
}

export type InventoryReservationResult = {
  result:
    | "reserved"
    | "already_reserved"
    | "already_reserved_by_caller"
    | "sold"
    | "unavailable"
    | "released"
    | "expired"
    | "fulfilled"
    | "not_found"
  reservationId: string | null
  inventoryId: string | null
  deviceId: string | null
  reservationStatus: string | null
  expiresAt: string | null
}

const inventorySelection = `
  id,
  store_id,
  device_id,
  status,
  price_pesewas,
  received_at,
  inventory_devices!inner (
    id,
    imei,
    colour,
    condition,
    battery_health,
    device_models!inner (
      model_name,
      storage_gb
    )
  )
`

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertUuid(value: string, label: string) {
  if (!uuidPattern.test(value)) {
    throw new Error(`${label} must be a valid UUID.`)
  }
}

function assertImei(value: string) {
  if (!/^\d{15}$/.test(value)) {
    throw new Error("IMEI must contain exactly 15 digits.")
  }

  let checksum = 0
  for (let index = 0; index < 14; index += 1) {
    let digit = Number(value[index])
    if ((index + 1) % 2 === 0) {
      digit *= 2
      digit = Math.floor(digit / 10) + (digit % 10)
    }
    checksum += digit
  }
  checksum += Number(value[14])

  if (checksum % 10 !== 0) {
    throw new Error("IMEI check digit is invalid.")
  }
}

async function createAuthenticatedInventoryClient() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new Error("An authenticated employee session is required.")
  }

  return supabase
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Inventory response is missing ${label}.`)
  }
  return value as Record<string, unknown>
}

function requireRelation(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new Error(`Inventory response has an invalid ${label} relationship.`)
    }
    return requireRecord(value[0], label)
  }
  return requireRecord(value, label)
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) {
    throw new Error(`Inventory response has an invalid ${label}.`)
  }
  return value
}

function requireInteger(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Inventory response has an invalid ${label}.`)
  }
  return parsed
}

function mapInventoryDevice(value: unknown): AuthorizedInventoryDevice {
  const inventory = requireRecord(value, "store inventory")
  const device = requireRelation(inventory.inventory_devices, "physical device")
  const model = requireRelation(device.device_models, "device model")
  const status = requireString(inventory.status, "inventory status")
  const condition = requireString(device.condition, "device condition")

  if (!(["available", "reserved", "sold"] as string[]).includes(status)) {
    throw new Error("Inventory response has an unsupported stock status.")
  }
  if (!(["excellent", "good", "fair"] as string[]).includes(condition)) {
    throw new Error("Inventory response has an unsupported device condition.")
  }

  const storageGb = requireInteger(model.storage_gb, "storage capacity")

  return {
    inventoryId: requireString(inventory.id, "inventory ID"),
    storeId: requireString(inventory.store_id, "store ID"),
    deviceId: requireString(inventory.device_id, "device ID"),
    model: requireString(model.model_name, "model name"),
    storageGb,
    storage: `${storageGb}GB`,
    colour: requireString(device.colour, "colour"),
    condition: condition as PersistentDeviceCondition,
    batteryHealth: requireInteger(device.battery_health, "battery health"),
    imei: requireString(device.imei, "IMEI"),
    status: status as PersistentInventoryStatus,
    pricePesewas: requireInteger(inventory.price_pesewas, "price"),
    receivedAt: requireString(inventory.received_at, "received timestamp"),
  }
}

function mapReservationResult(value: unknown): InventoryReservationResult {
  const row = requireRecord(value, "reservation result")
  const result = requireString(row.result, "reservation result code")
  const supportedResults = [
    "reserved",
    "already_reserved",
    "already_reserved_by_caller",
    "sold",
    "unavailable",
    "released",
    "expired",
    "fulfilled",
    "not_found",
  ]

  if (!supportedResults.includes(result)) {
    throw new Error("Inventory reservation returned an unsupported result.")
  }

  return {
    result: result as InventoryReservationResult["result"],
    reservationId: typeof row.reservation_id === "string" ? row.reservation_id : null,
    inventoryId: typeof row.inventory_id === "string" ? row.inventory_id : null,
    deviceId: typeof row.device_id === "string" ? row.device_id : null,
    reservationStatus: typeof row.reservation_status === "string" ? row.reservation_status : null,
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
  }
}

/**
 * Lists only the inventory rows visible to the authenticated employee through
 * store-scoped RLS. Acquisition cost is deliberately not selected or granted.
 */
export async function listAuthorizedInventory(storeId: string): Promise<AuthorizedInventoryDevice[]> {
  assertUuid(storeId, "Store ID")
  const supabase = await createAuthenticatedInventoryClient()
  const { data, error } = await supabase
    .from("store_inventory")
    .select(inventorySelection)
    .eq("store_id", storeId)
    .order("received_at", { ascending: false })

  if (error) {
    throw new Error(`Unable to list authorized inventory: ${error.message}`)
  }

  return (data ?? []).map((row) => mapInventoryDevice(row as unknown))
}

/** Reads one physical device only when the caller's store membership passes RLS. */
export async function readAuthorizedInventoryDevice(
  storeId: string,
  deviceId: string
): Promise<AuthorizedInventoryDevice | null> {
  assertUuid(storeId, "Store ID")
  assertUuid(deviceId, "Device ID")
  const supabase = await createAuthenticatedInventoryClient()
  const { data, error } = await supabase
    .from("store_inventory")
    .select(inventorySelection)
    .eq("store_id", storeId)
    .eq("device_id", deviceId)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to read authorized inventory: ${error.message}`)
  }

  return data ? mapInventoryDevice(data as unknown) : null
}

/** Resolves an IMEI scan only inside the caller's authorized store. */
export async function readAuthorizedInventoryDeviceByImei(
  storeId: string,
  imei: string
): Promise<AuthorizedInventoryDevice | null> {
  assertUuid(storeId, "Store ID")
  assertImei(imei)
  const supabase = await createAuthenticatedInventoryClient()
  const { data, error } = await supabase
    .from("store_inventory")
    .select(inventorySelection)
    .eq("store_id", storeId)
    .eq("inventory_devices.imei", imei)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to resolve authorized inventory IMEI: ${error.message}`)
  }

  return data ? mapInventoryDevice(data as unknown) : null
}

/**
 * Calls the atomic database reservation RPC with the caller's own access token.
 * The RPC rechecks active membership and reserve_inventory permission, then
 * serializes competing requests by locking the store inventory row.
 */
export async function reserveAvailableDevice(
  storeId: string,
  deviceId: string,
  ttlMinutes = 15
): Promise<InventoryReservationResult> {
  assertUuid(storeId, "Store ID")
  assertUuid(deviceId, "Device ID")
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
    throw new Error("Reservation duration must be between 1 and 60 minutes.")
  }

  const supabase = await createAuthenticatedInventoryClient()
  const { data, error } = await supabase.rpc("reserve_inventory_device", {
    p_store_id: storeId,
    p_device_id: deviceId,
    p_ttl_minutes: ttlMinutes,
  })

  if (error) {
    throw new Error(`Unable to reserve inventory: ${error.message}`)
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("Inventory reservation returned an invalid response.")
  }

  return mapReservationResult(data[0] as unknown)
}

/** Releases an owned reservation, or any store reservation for an inventory manager. */
export async function releaseAuthorizedReservation(
  reservationId: string,
  reason: string
): Promise<InventoryReservationResult> {
  assertUuid(reservationId, "Reservation ID")
  const normalizedReason = reason.trim()
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new Error("Release reason must contain between 3 and 500 characters.")
  }

  const supabase = await createAuthenticatedInventoryClient()
  const { data, error } = await supabase.rpc("release_inventory_reservation", {
    p_reservation_id: reservationId,
    p_reason: normalizedReason,
  })

  if (error) {
    throw new Error(`Unable to release inventory reservation: ${error.message}`)
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("Inventory release returned an invalid response.")
  }

  return mapReservationResult(data[0] as unknown)
}

/** Expires elapsed reservations in a bounded, authorized store batch. */
export async function expireAuthorizedReservations(storeId: string, limit = 100): Promise<number> {
  assertUuid(storeId, "Store ID")
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Expiry batch limit must be between 1 and 500.")
  }

  const supabase = await createAuthenticatedInventoryClient()
  const { data, error } = await supabase.rpc("expire_inventory_reservations", {
    p_store_id: storeId,
    p_limit: limit,
  })

  if (error) {
    throw new Error(`Unable to expire inventory reservations: ${error.message}`)
  }

  return requireInteger(data, "expired reservation count")
}
