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
  throw new Error("Trade-in concurrency tests are restricted to a local Supabase URL.")
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const storeId = "00000000-0000-4000-8000-000000000001"
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`

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

async function createMember(label, roleId) {
  const emailLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const email = `trade-race-${emailLabel}-${suffix}@local.test`
  const password = `Local-only-${randomUUID()}-A9!`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Trade Race ${label}` },
  })
  noError(error, `Create ${label} user`)
  assert.ok(data.user)
  const membershipId = randomUUID()
  noError((await admin.from("store_memberships").insert({
    id: membershipId,
    store_id: storeId,
    user_id: data.user.id,
    role_id: roleId,
    status: "active",
    joined_at: new Date().toISOString(),
  })).error, `Create ${label} membership`)
  return { email, password, userId: data.user.id, membershipId }
}

async function authenticatedClient(member) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  noError((await client.auth.signInWithPassword({ email: member.email, password: member.password })).error, `Sign in ${member.email}`)
  return client
}

const { data: roles, error: roleError } = await admin.from("roles").select("id,code").in("code", ["employee", "manager"])
noError(roleError, "Read trade-in roles")
const employeeRole = roles.find((role) => role.code === "employee")
const managerRole = roles.find((role) => role.code === "manager")
assert.ok(employeeRole && managerRole)

const employee = await createMember("Employee", employeeRole.id)
const managerOne = await createMember("Manager One", managerRole.id)
const managerTwo = await createMember("Manager Two", managerRole.id)
const employeeClient = await authenticatedClient(employee)
const managerClients = await Promise.all([authenticatedClient(managerOne), authenticatedClient(managerTwo)])

const draft = await employeeClient.rpc("create_trade_in_draft", { p_store_id: storeId })
noError(draft.error, "Create concurrent-decision trade-in")
assert.equal(draft.data.length, 1)
const requestId = draft.data[0].request_id
noError((await employeeClient.rpc("save_trade_in_customer", {
  p_request_id: requestId,
  p_full_name: "Trade Race Customer",
  p_phone: "024 123 4567",
  p_email: null,
})).error, "Save trade-in customer")
const imei = luhnImei(`86${Date.now().toString().slice(-12)}`)
noError((await employeeClient.rpc("save_trade_in_device", {
  p_request_id: requestId,
  p_brand: "Apple",
  p_model: `Race Device ${suffix}`,
  p_storage_gb: 128,
  p_colour: "Blue",
  p_identifier_type: "imei",
  p_identifier: imei,
})).error, "Save trade-in device")
noError((await employeeClient.rpc("save_trade_in_inspection", {
  p_request_id: requestId,
  p_cosmetic_condition: "good",
  p_display_check: "pass",
  p_battery_check: "pass",
  p_battery_health: 90,
  p_cameras_check: "pass",
  p_buttons_check: "pass",
  p_connectivity_check: "pass",
  p_biometric_check: "pass",
  p_activation_lock_check: "pass",
  p_other_functional_check: "pass",
  p_notes: "Prepared for a concurrent manager decision",
})).error, "Save trade-in inspection")
noError((await employeeClient.rpc("submit_trade_in_request", {
  p_request_id: requestId,
  p_proposed_offer_pesewas: 200000,
  p_supporting_notes: "Concurrency decision fixture",
})).error, "Submit trade-in")

const attempts = await Promise.all([
  managerClients[0].rpc("decide_trade_in_request", {
    p_request_id: requestId,
    p_decision: "approved",
    p_decision_note: "Manager one approves after complete inspection review",
  }),
  managerClients[1].rpc("decide_trade_in_request", {
    p_request_id: requestId,
    p_decision: "declined",
    p_decision_note: "Manager two declines after complete inspection review",
  }),
])

const successes = attempts.filter((attempt) => !attempt.error)
const failures = attempts.filter((attempt) => attempt.error)
assert.equal(successes.length, 1, "Exactly one concurrent trade-in decision must succeed")
assert.equal(failures.length, 1, "Exactly one concurrent trade-in decision must be rejected")
assert.equal(failures[0].error.code, "23514")
assert.ok(["approved", "declined"].includes(successes[0].data))

const { data: request, error: requestError } = await admin
  .from("trade_in_requests")
  .select("status,decision,decision_note,decided_by_user_id,decided_by_membership_id,decided_at")
  .eq("id", requestId)
  .single()
noError(requestError, "Read decided trade-in")
assert.equal(request.status, successes[0].data)
assert.equal(request.decision, successes[0].data)
assert.ok(request.decision_note.length >= 10)
assert.ok(request.decided_at)
assert.ok([managerOne.userId, managerTwo.userId].includes(request.decided_by_user_id))
assert.ok([managerOne.membershipId, managerTwo.membershipId].includes(request.decided_by_membership_id))

const { count: decisionAudits, error: auditError } = await admin
  .from("audit_events")
  .select("id", { count: "exact", head: true })
  .eq("entity_id", requestId)
  .in("action", ["trade_in.approved", "trade_in.declined"])
noError(auditError, "Count trade-in decision audit events")
assert.equal(decisionAudits, 1)
const { count: inventoryCount, error: inventoryError } = await admin
  .from("store_inventory")
  .select("id", { count: "exact", head: true })
  .eq("trade_in_request_id", requestId)
noError(inventoryError, "Count trade-in inventory rows after decision")
assert.equal(inventoryCount, 0, "A concurrent approval decision must not create inventory")

console.log("Phase 7 trade-in concurrency test passed: one locked decision won, one lost, one audit event persisted, and inventory remained untouched.")
