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
  throw new Error("Sales concurrency tests are restricted to a local Supabase URL.")
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const storeId = "00000000-0000-4000-8000-000000000001"
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `Local-only-${randomUUID()}-A9!`

function noError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}
function luhnImei(base) {
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
const emails = [`sales-race-a-${suffix}@local.test`, `sales-race-b-${suffix}@local.test`]
const users = []
for (const [index, email] of emails.entries()) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Sales Race Employee ${index + 1}` },
  })
  noError(error, "Create race user")
  users.push(data.user)
}
noError((await admin.from("store_memberships").insert(users.map((user) => ({
  id: randomUUID(), store_id: storeId, user_id: user.id, role_id: role.id,
  status: "active", joined_at: new Date().toISOString(),
})))).error, "Create race memberships")

const modelId = randomUUID()
const deviceId = randomUUID()
const inventoryId = randomUUID()
const imei = luhnImei(`35${Date.now().toString().slice(-12)}`)
noError((await admin.from("device_models").insert({ id: modelId, model_name: `Sales Race iPhone ${suffix}`, storage_gb: 256 })).error, "Create model")
noError((await admin.from("inventory_devices").insert({ id: deviceId, device_model_id: modelId, imei, colour: "Race Titanium", condition: "excellent", battery_health: 100 })).error, "Create device")
noError((await admin.from("store_inventory").insert({ id: inventoryId, store_id: storeId, device_id: deviceId, cost_pesewas: 700000, price_pesewas: 850000 })).error, "Create inventory")

const clients = []
for (const email of emails) {
  const client = createClient(supabaseUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } })
  noError((await client.auth.signInWithPassword({ email, password })).error, "Sign in race employee")
  clients.push(client)
}

const draftResults = await Promise.all(clients.map((client) => client.rpc("create_sale_draft", { p_store_id: storeId })))
draftResults.forEach((result, index) => {
  noError(result.error, `Create draft ${index + 1}`)
  assert.equal(result.data.length, 1)
})
const saleIds = draftResults.map((result) => result.data[0].sale_id)

const addResults = await Promise.all(clients.map((client, index) => client.rpc("add_sale_item", {
  p_sale_id: saleIds[index], p_device_id: deviceId,
})))
addResults.forEach((result, index) => noError(result.error, `Race add item ${index + 1}`))
assert.deepEqual(addResults.map((result) => result.data[0].result).sort(), ["added", "already_reserved"])

const itemCounts = await Promise.all(clients.map((client, index) => client.from("sale_items").select("id", { count: "exact", head: true }).eq("sale_id", saleIds[index]).eq("status", "active")))
itemCounts.forEach((result, index) => noError(result.error, `Read race sale items ${index + 1}`))
assert.equal(itemCounts.reduce((sum, result) => sum + (result.count ?? 0), 0), 1)

const { data: reservations, error: reservationError } = await admin.from("inventory_reservations").select("id").eq("store_inventory_id", inventoryId).eq("status", "active")
noError(reservationError, "Read active race reservations")
assert.equal(reservations.length, 1)
const { data: inventory, error: inventoryError } = await admin.from("store_inventory").select("status").eq("id", inventoryId).single()
noError(inventoryError, "Read race inventory status")
assert.equal(inventory.status, "reserved")

console.log("Phase 5 sales concurrency test passed: one competing draft reserved and added the physical device.")
