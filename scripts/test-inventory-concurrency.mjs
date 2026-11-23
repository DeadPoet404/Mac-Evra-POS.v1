import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error(
    "Set the local NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY before running this test."
  )
}

const parsedUrl = new URL(supabaseUrl)
if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
  throw new Error("Concurrency integration tests are restricted to a local Supabase URL.")
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const storeId = "00000000-0000-4000-8000-000000000001"
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `Local-only-${randomUUID()}-A9!`

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

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

const { data: store, error: storeError } = await admin
  .from("stores")
  .select("id")
  .eq("id", storeId)
  .single()
requireNoError(storeError, "Read local development store")
assert.equal(store.id, storeId)

const { data: employeeRole, error: roleError } = await admin
  .from("roles")
  .select("id")
  .eq("code", "employee")
  .single()
requireNoError(roleError, "Read employee role")

const userEmails = [
  `inventory-concurrency-a-${suffix}@local.test`,
  `inventory-concurrency-b-${suffix}@local.test`,
]

const users = []
for (const [index, email] of userEmails.entries()) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Concurrency Employee ${index + 1}` },
  })
  requireNoError(error, `Create local concurrency user ${index + 1}`)
  assert.ok(data.user)
  users.push(data.user)
}

const memberships = users.map((user) => ({
  id: randomUUID(),
  store_id: storeId,
  user_id: user.id,
  role_id: employeeRole.id,
  status: "active",
  joined_at: new Date().toISOString(),
}))
const { error: membershipError } = await admin.from("store_memberships").insert(memberships)
requireNoError(membershipError, "Create local concurrency memberships")

const modelId = randomUUID()
const deviceId = randomUUID()
const inventoryId = randomUUID()
const imei = luhnImei(`35${Date.now().toString().slice(-12)}`)

const { error: modelError } = await admin.from("device_models").insert({
  id: modelId,
  model_name: `Concurrency Test iPhone ${suffix}`,
  storage_gb: 256,
})
requireNoError(modelError, "Create local concurrency device model")

const { error: deviceError } = await admin.from("inventory_devices").insert({
  id: deviceId,
  device_model_id: modelId,
  imei,
  colour: "Test Titanium",
  condition: "excellent",
  battery_health: 100,
})
requireNoError(deviceError, "Create local concurrency physical device")

const { error: inventoryError } = await admin.from("store_inventory").insert({
  id: inventoryId,
  store_id: storeId,
  device_id: deviceId,
  cost_pesewas: 1,
  price_pesewas: 2,
})
requireNoError(inventoryError, "Create local concurrency store inventory")

const employeeClients = []
for (const email of userEmails) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  requireNoError(error, `Sign in ${email}`)
  employeeClients.push(client)
}

const attempts = await Promise.all(
  employeeClients.map((client) =>
    client.rpc("reserve_inventory_device", {
      p_store_id: storeId,
      p_device_id: deviceId,
      p_ttl_minutes: 15,
    })
  )
)

for (const [index, attempt] of attempts.entries()) {
  requireNoError(attempt.error, `Concurrent reservation attempt ${index + 1}`)
  assert.equal(attempt.data.length, 1)
}

const results = attempts.map((attempt) => attempt.data[0].result).sort()
assert.deepEqual(results, ["already_reserved", "reserved"])

const { data: activeReservations, error: reservationError } = await admin
  .from("inventory_reservations")
  .select("id, employee_user_id")
  .eq("store_inventory_id", inventoryId)
  .eq("status", "active")
requireNoError(reservationError, "Read active reservation after contention")
assert.equal(activeReservations.length, 1)
assert.ok(users.some((user) => user.id === activeReservations[0].employee_user_id))

const winnerIndex = attempts.findIndex((attempt) => attempt.data[0].result === "reserved")
const challengerIndex = winnerIndex === 0 ? 1 : 0
assert.notEqual(winnerIndex, -1)
assert.equal(activeReservations[0].employee_user_id, users[winnerIndex].id)

const [releaseAttempt, reserveDuringReleaseAttempt] = await Promise.all([
  employeeClients[winnerIndex].rpc("release_inventory_reservation", {
    p_reservation_id: activeReservations[0].id,
    p_reason: "concurrent release and reserve test",
  }),
  employeeClients[challengerIndex].rpc("reserve_inventory_device", {
    p_store_id: storeId,
    p_device_id: deviceId,
    p_ttl_minutes: 15,
  }),
])
requireNoError(releaseAttempt.error, "Release during reserve/release contention")
requireNoError(reserveDuringReleaseAttempt.error, "Reserve during reserve/release contention")
assert.equal(releaseAttempt.data[0].result, "released")
assert.ok(
  ["already_reserved", "reserved"].includes(reserveDuringReleaseAttempt.data[0].result),
  `Unexpected reserve/release contention result: ${reserveDuringReleaseAttempt.data[0].result}`
)

let { data: activeAfterRace, error: activeAfterRaceError } = await admin
  .from("inventory_reservations")
  .select("id, employee_user_id")
  .eq("store_inventory_id", inventoryId)
  .eq("status", "active")
requireNoError(activeAfterRaceError, "Read active reservation after reserve/release race")
assert.ok(activeAfterRace.length <= 1)

let { data: inventory, error: finalInventoryError } = await admin
  .from("store_inventory")
  .select("status")
  .eq("id", inventoryId)
  .single()
requireNoError(finalInventoryError, "Read inventory after reserve/release race")

if (reserveDuringReleaseAttempt.data[0].result === "reserved") {
  assert.equal(activeAfterRace.length, 1)
  assert.equal(activeAfterRace[0].employee_user_id, users[challengerIndex].id)
  assert.equal(inventory.status, "reserved")
} else {
  assert.equal(activeAfterRace.length, 0)
  assert.equal(inventory.status, "available")

  const replacement = await employeeClients[challengerIndex].rpc("reserve_inventory_device", {
    p_store_id: storeId,
    p_device_id: deviceId,
    p_ttl_minutes: 15,
  })
  requireNoError(replacement.error, "Create reservation for concurrent release test")
  assert.equal(replacement.data[0].result, "reserved")

  activeAfterRace = [
    {
      id: replacement.data[0].reservation_id,
      employee_user_id: users[challengerIndex].id,
    },
  ]
}

const releaseReservationId = activeAfterRace[0].id
const simultaneousReleases = await Promise.all([
  employeeClients[challengerIndex].rpc("release_inventory_reservation", {
    p_reservation_id: releaseReservationId,
    p_reason: "first simultaneous release",
  }),
  employeeClients[challengerIndex].rpc("release_inventory_reservation", {
    p_reservation_id: releaseReservationId,
    p_reason: "second simultaneous release",
  }),
])
for (const [index, release] of simultaneousReleases.entries()) {
  requireNoError(release.error, `Simultaneous release attempt ${index + 1}`)
  assert.equal(release.data[0].result, "released")
}

const { data: releaseMovements, error: releaseMovementError } = await admin
  .from("inventory_movements")
  .select("id")
  .eq("reservation_id", releaseReservationId)
  .eq("movement_type", "reservation_released")
requireNoError(releaseMovementError, "Read release movements after simultaneous release")
assert.equal(releaseMovements.length, 1)

const expiryAttempts = await Promise.all(
  employeeClients.map((client) =>
    client.rpc("expire_inventory_reservations", {
      p_store_id: storeId,
      p_limit: 100,
    })
  )
)
for (const [index, expiry] of expiryAttempts.entries()) {
  requireNoError(expiry.error, `Concurrent expiry sweep ${index + 1}`)
  assert.equal(expiry.data, 0)
}

const { data: finalActiveReservations, error: finalReservationError } = await admin
  .from("inventory_reservations")
  .select("id")
  .eq("store_inventory_id", inventoryId)
  .eq("status", "active")
requireNoError(finalReservationError, "Read final active reservation state")
assert.equal(finalActiveReservations.length, 0)

;({ data: inventory, error: finalInventoryError } = await admin
  .from("store_inventory")
  .select("status")
  .eq("id", inventoryId)
  .single())
requireNoError(finalInventoryError, "Read final inventory state")
assert.equal(inventory.status, "available")

console.log("PASS: concurrent authenticated reserve attempts produced exactly one active reservation.")
console.log("PASS: competing reserve/release and simultaneous release operations remained consistent.")
console.log("PASS: concurrent expiry sweeps were safe and idempotent with no elapsed reservations.")
console.log("Run a local database reset after this test to remove its disposable Auth and inventory fixtures.")
