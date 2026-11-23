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
  throw new Error("Payment concurrency tests are restricted to a local Supabase URL.")
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const storeId = "00000000-0000-4000-8000-000000000001"
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const email = `payment-race-${suffix}@local.test`
const password = `Local-only-${randomUUID()}-A9!`

function noError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

function luhnImei(base) {
  assert.match(base, /^\d{14}$/)
  let checksum = 0
  for (let index = 0; index < base.length; index += 1) {
    let digit = Number(base[index])
    if ((index + 1) % 2 === 0) {
      digit *= 2
      digit = Math.floor(digit / 10) + (digit % 10)
    }
    checksum += digit
  }
  return `${base}${(10 - (checksum % 10)) % 10}`
}

const { data: role, error: roleError } = await admin.from("roles").select("id").eq("code", "employee").single()
noError(roleError, "Read employee role")
const { data: userResult, error: userError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Payment Race Employee" },
})
noError(userError, "Create payment race user")
const user = userResult.user
assert.ok(user)
const membershipId = randomUUID()
noError((await admin.from("store_memberships").insert({
  id: membershipId,
  store_id: storeId,
  user_id: user.id,
  role_id: role.id,
  status: "active",
  joined_at: new Date().toISOString(),
})).error, "Create payment race membership")

const modelId = randomUUID()
const deviceId = randomUUID()
const inventoryId = randomUUID()
const imei = luhnImei(`35${Date.now().toString().slice(-12)}`)
noError((await admin.from("device_models").insert({
  id: modelId,
  model_name: `Payment Race iPhone ${suffix}`,
  storage_gb: 256,
})).error, "Create payment race model")
noError((await admin.from("inventory_devices").insert({
  id: deviceId,
  device_model_id: modelId,
  imei,
  colour: "Race Titanium",
  condition: "excellent",
  battery_health: 100,
})).error, "Create payment race device")
noError((await admin.from("store_inventory").insert({
  id: inventoryId,
  store_id: storeId,
  device_id: deviceId,
  cost_pesewas: 700000,
  price_pesewas: 850000,
})).error, "Create payment race inventory")

const clients = []
for (let session = 0; session < 2; session += 1) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  noError((await client.auth.signInWithPassword({ email, password })).error, `Sign in payment race session ${session + 1}`)
  clients.push(client)
}

const draft = await clients[0].rpc("create_sale_draft", { p_store_id: storeId })
noError(draft.error, "Create payment race sale")
assert.equal(draft.data.length, 1)
const saleId = draft.data[0].sale_id
const added = await clients[0].rpc("add_sale_item", { p_sale_id: saleId, p_device_id: deviceId })
noError(added.error, "Reserve payment race device")
assert.equal(added.data[0].result, "added")
const { data: item, error: itemError } = await clients[0]
  .from("sale_items")
  .select("reservation_id")
  .eq("sale_id", saleId)
  .eq("status", "active")
  .single()
noError(itemError, "Read payment race item")

const attempts = await Promise.all([
  clients[0].rpc("confirm_sale_payment", {
    p_sale_id: saleId,
    p_payment_method: "cash",
    p_amount_pesewas: 850000,
    p_transaction_reference: "RACE-CASH",
    p_received_confirmed: true,
  }),
  clients[1].rpc("confirm_sale_payment", {
    p_sale_id: saleId,
    p_payment_method: "mobile_money",
    p_amount_pesewas: 850000,
    p_transaction_reference: "RACE-MOMO",
    p_received_confirmed: true,
  }),
])

const successes = attempts.filter((attempt) => !attempt.error)
const failures = attempts.filter((attempt) => attempt.error)
assert.equal(successes.length, 1, "Exactly one concurrent payment confirmation must succeed")
assert.equal(failures.length, 1, "Exactly one concurrent payment confirmation must be rejected")
assert.equal(failures[0].error.code, "23505")
assert.equal(successes[0].data.length, 1)
assert.equal(successes[0].data[0].sale_status, "completed")

const { data: payments, error: paymentError } = await admin
  .from("sale_payments")
  .select("id,amount_pesewas,payment_method,status,confirmed_by_user_id,confirmed_by_membership_id")
  .eq("sale_id", saleId)
noError(paymentError, "Read payment race ledger")
assert.equal(payments.length, 1)
assert.equal(payments[0].amount_pesewas, 850000)
assert.ok(["cash", "mobile_money"].includes(payments[0].payment_method))
assert.equal(payments[0].status, "confirmed")
assert.equal(payments[0].confirmed_by_user_id, user.id)
assert.equal(payments[0].confirmed_by_membership_id, membershipId)

const { data: sale, error: saleError } = await clients[0]
  .from("sales")
  .select("status,completed_at")
  .eq("id", saleId)
  .single()
noError(saleError, "Read completed payment race sale")
assert.equal(sale.status, "completed")
assert.ok(sale.completed_at)

const { data: reservation, error: reservationError } = await admin
  .from("inventory_reservations")
  .select("status")
  .eq("id", item.reservation_id)
  .single()
noError(reservationError, "Read fulfilled payment race reservation")
assert.equal(reservation.status, "fulfilled")
const { data: inventory, error: inventoryError } = await admin
  .from("store_inventory")
  .select("status")
  .eq("id", inventoryId)
  .single()
noError(inventoryError, "Read sold payment race inventory")
assert.equal(inventory.status, "sold")

const { count: movementCount, error: movementError } = await admin
  .from("inventory_movements")
  .select("id", { count: "exact", head: true })
  .eq("reservation_id", item.reservation_id)
  .eq("movement_type", "sold")
noError(movementError, "Count payment race sold movements")
assert.equal(movementCount, 1)
const { count: paymentAuditCount, error: auditError } = await admin
  .from("audit_events")
  .select("id", { count: "exact", head: true })
  .eq("entity_id", payments[0].id)
  .eq("action", "payment.manually_confirmed")
noError(auditError, "Count payment race audit events")
assert.equal(paymentAuditCount, 1)

console.log("Phase 6 payment concurrency test passed: one confirmation completed the sale and one replay was rejected.")
