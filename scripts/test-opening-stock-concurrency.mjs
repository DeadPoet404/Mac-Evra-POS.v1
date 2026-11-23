import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Set local Supabase URL, publishable key, and service-role key before running this test.")
}
const parsedUrl = new URL(supabaseUrl)
if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
  throw new Error("Opening-stock concurrency tests are restricted to a local Supabase URL.")
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const storeId = "00000000-0000-4000-8000-000000000001"
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `Local-only-${randomUUID()}-A9!`

function noError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

function luhnImei(base14) {
  assert.match(base14, /^\d{14}$/)
  let checksum = 0
  for (let index = 0; index < base14.length; index += 1) {
    let digit = Number(base14[index])
    if ((index + 1) % 2 === 0) {
      digit *= 2
      digit = Math.floor(digit / 10) + (digit % 10)
    }
    checksum += digit
  }
  return `${base14}${(10 - (checksum % 10)) % 10}`
}

function imeiFor(offset) {
  return luhnImei(`35${String(Date.now() + offset).slice(-12)}`)
}

const inspection = {
  imei_confirmed_physical: true,
  identity_labels_match: true,
  display_passed: true,
  cameras_passed: true,
  buttons_passed: true,
  connectivity_passed: true,
  charging_port_passed: true,
  activation_lock_cleared: true,
  notes: "Local concurrency inspection passed",
}

function device(imei) {
  return {
    imei,
    colour: "Race Titanium",
    condition: "excellent",
    battery_health: 99,
    inspection,
  }
}

const { data: managerRole, error: roleError } = await admin
  .from("roles")
  .select("id")
  .eq("code", "manager")
  .single()
noError(roleError, "Read manager role")

const emails = [
  `opening-stock-manager-a-${suffix}@local.test`,
  `opening-stock-manager-b-${suffix}@local.test`,
]
const users = []
for (const [index, email] of emails.entries()) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Opening Stock Manager ${index + 1}` },
  })
  noError(error, `Create opening-stock manager ${index + 1}`)
  assert.ok(data.user)
  users.push(data.user)
}

const memberships = users.map((user) => ({
  id: randomUUID(),
  store_id: storeId,
  user_id: user.id,
  role_id: managerRole.id,
  status: "active",
  joined_at: new Date().toISOString(),
}))
noError((await admin.from("store_memberships").insert(memberships)).error, "Create manager memberships")

const clients = []
for (const email of emails) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  noError((await client.auth.signInWithPassword({ email, password })).error, `Sign in ${email}`)
  clients.push(client)
}

const registration = await clients[0].rpc("register_opening_stock_model", {
  p_store_id: storeId,
  p_model_name: `Opening Stock Race ${suffix}`,
  p_storage_gb: 256,
  p_supplier_sku: null,
})
noError(registration.error, "Register race model")
const modelCatalogueId = registration.data[0].model_catalogue_id

const invoice = await clients[0].rpc("create_supplier_invoice", {
  p_store_id: storeId,
  p_supplier_name: "Race Supplier",
  p_supplier_invoice_number: `RACE-${suffix}`.slice(0, 80),
  p_invoice_date: new Date().toISOString().slice(0, 10),
  p_notes: null,
})
noError(invoice.error, "Create race invoice")
const invoiceId = invoice.data[0].invoice_id

const line = await clients[0].rpc("add_supplier_invoice_line", {
  p_invoice_id: invoiceId,
  p_model_catalogue_id: modelCatalogueId,
  p_quantity_invoiced: 3,
  p_unit_cost_pesewas: 700000,
  p_notes: null,
})
noError(line.error, "Add race invoice line")
const lineId = line.data[0].invoice_line_id

const duplicateImei = imeiFor(0)
const receiveAttempts = await Promise.all(
  clients.map((client) =>
    client.rpc("receive_opening_stock_device", {
      p_invoice_line_id: lineId,
      p_imei: duplicateImei,
      p_colour: "Race Titanium",
      p_condition: "excellent",
      p_battery_health: 99,
      p_inspection: inspection,
    })
  )
)
const receiveSuccesses = receiveAttempts.filter((attempt) => !attempt.error)
const receiveFailures = receiveAttempts.filter((attempt) => attempt.error)
assert.equal(receiveSuccesses.length, 1, "Exactly one concurrent duplicate IMEI receipt must succeed")
assert.equal(receiveFailures.length, 1, "Exactly one concurrent duplicate IMEI receipt must fail")
assert.equal(receiveFailures[0].error.code, "23505")
const unitId = receiveSuccesses[0].data[0].unit_id

const batchImeis = [imeiFor(101), imeiFor(202)]
assert.equal(new Set([duplicateImei, ...batchImeis]).size, 3)
const batch = await clients[0].rpc("receive_opening_stock_devices", {
  p_invoice_line_id: lineId,
  p_devices: batchImeis.map(device),
})
noError(batch.error, "Receive remaining race batch")
assert.equal(batch.data.length, 2)
assert.equal(batch.data[0].quantity_received, 3)
assert.equal(batch.data[0].quantity_outstanding, 0)

const { count: stagedCount, error: stagedError } = await admin
  .from("opening_stock_units")
  .select("id", { count: "exact", head: true })
  .eq("invoice_line_id", lineId)
  .eq("status", "staged")
noError(stagedError, "Count staged race units")
assert.equal(stagedCount, 3)

const activationAttempts = await Promise.all(
  clients.map((client) =>
    client.rpc("activate_opening_stock_unit", {
      p_unit_id: unitId,
      p_approved_price_pesewas: 850000,
      p_price_confirmed: true,
    })
  )
)
const activationSuccesses = activationAttempts.filter((attempt) => !attempt.error)
const activationFailures = activationAttempts.filter((attempt) => attempt.error)
assert.equal(activationSuccesses.length, 1, "Exactly one concurrent activation must succeed")
assert.equal(activationFailures.length, 1, "Exactly one concurrent activation must fail")
assert.equal(activationFailures[0].error.code, "23514")
const storeInventoryId = activationSuccesses[0].data[0].store_inventory_id

const { count: physicalDeviceCount, error: physicalDeviceError } = await admin
  .from("inventory_devices")
  .select("id", { count: "exact", head: true })
  .eq("imei", duplicateImei)
noError(physicalDeviceError, "Count activated physical devices")
assert.equal(physicalDeviceCount, 1)

const { data: inventory, error: inventoryError } = await admin
  .from("store_inventory")
  .select("status,price_pesewas,cost_pesewas,device_id")
  .eq("id", storeInventoryId)
  .single()
noError(inventoryError, "Read activated race inventory")
assert.equal(inventory.status, "available")
assert.equal(inventory.price_pesewas, 850000)
assert.equal(inventory.cost_pesewas, 700000)

const { count: intakeCount, error: intakeError } = await admin
  .from("inventory_movements")
  .select("id", { count: "exact", head: true })
  .eq("store_inventory_id", storeInventoryId)
  .eq("movement_type", "intake")
noError(intakeError, "Count activation intake movements")
assert.equal(intakeCount, 1)

const { count: activationAuditCount, error: activationAuditError } = await admin
  .from("audit_events")
  .select("id", { count: "exact", head: true })
  .eq("entity_id", unitId)
  .eq("action", "opening_stock.unit_activated")
noError(activationAuditError, "Count activation audit events")
assert.equal(activationAuditCount, 1)

const repricingAttempts = await Promise.all([
  clients[0].rpc("reprice_opening_stock_unit", {
    p_unit_id: unitId,
    p_expected_price_pesewas: 850000,
    p_new_price_pesewas: 875000,
    p_reason: "Approved competitor market adjustment",
    p_price_confirmed: true,
  }),
  clients[1].rpc("reprice_opening_stock_unit", {
    p_unit_id: unitId,
    p_expected_price_pesewas: 850000,
    p_new_price_pesewas: 900000,
    p_reason: "Approved promotional price adjustment",
    p_price_confirmed: true,
  }),
])
const repricingSuccesses = repricingAttempts.filter((attempt) => !attempt.error)
const repricingFailures = repricingAttempts.filter((attempt) => attempt.error)
assert.equal(repricingSuccesses.length, 1, "Exactly one concurrent repricing must succeed")
assert.equal(repricingFailures.length, 1, "Exactly one stale repricing must fail")
assert.equal(repricingFailures[0].error.code, "23514")
const winningPrice = repricingSuccesses[0].data[0].new_price_pesewas
assert.ok([875000, 900000].includes(winningPrice))

const { data: finalInventory, error: finalInventoryError } = await admin
  .from("store_inventory")
  .select("price_pesewas,cost_pesewas")
  .eq("id", storeInventoryId)
  .single()
noError(finalInventoryError, "Read repriced race inventory")
assert.equal(finalInventory.price_pesewas, winningPrice)
assert.equal(finalInventory.cost_pesewas, 700000)

const { data: finalUnit, error: finalUnitError } = await admin
  .from("opening_stock_units")
  .select("status,approved_price_pesewas,unit_cost_pesewas")
  .eq("id", unitId)
  .single()
noError(finalUnitError, "Read repriced race unit")
assert.equal(finalUnit.status, "activated")
assert.equal(finalUnit.approved_price_pesewas, winningPrice)
assert.equal(finalUnit.unit_cost_pesewas, 700000)

const { count: priceChangeCount, error: priceChangeError } = await admin
  .from("opening_stock_price_changes")
  .select("id", { count: "exact", head: true })
  .eq("unit_id", unitId)
noError(priceChangeError, "Count race price changes")
assert.equal(priceChangeCount, 1)

const { count: adjustmentCount, error: adjustmentError } = await admin
  .from("inventory_movements")
  .select("id", { count: "exact", head: true })
  .eq("store_inventory_id", storeInventoryId)
  .eq("movement_type", "adjustment")
noError(adjustmentError, "Count race adjustment movements")
assert.equal(adjustmentCount, 1)

const { count: repricingAuditCount, error: repricingAuditError } = await admin
  .from("audit_events")
  .select("id", { count: "exact", head: true })
  .eq("entity_id", unitId)
  .eq("action", "opening_stock.unit_repriced")
noError(repricingAuditError, "Count repricing audit events")
assert.equal(repricingAuditCount, 1)

console.log("Opening-stock concurrency test passed: duplicate receipt, activation, and stale repricing are serialized with one winner each.")
