import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("Local Supabase URL, publishable key, and service-role key are required.")
}

const parsedUrl = new URL(url)
if (!(parsedUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsedUrl.hostname))) {
  throw new Error("Refusing to run authenticated session tests against a non-local Supabase project.")
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

const createBrowserSession = () =>
  createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

const storeId = "00000000-0000-4000-8000-000000000001"
const employeeRoleId = "00000000-0000-4000-8000-000000000101"
const managerRoleId = "00000000-0000-4000-8000-000000000102"
const suffix = randomUUID()
const password = `${randomBytes(18).toString("base64url")}Aa1!`

async function createUser(kind) {
  const email = `phase3-${kind}-${suffix}@local.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Phase 3 ${kind}` },
  })
  if (error || !data.user) throw new Error(`Unable to create local ${kind} fixture: ${error?.message ?? "missing user"}`)
  return { id: data.user.id, email }
}

async function signIn(fixture) {
  const client = createBrowserSession()
  const { data, error } = await client.auth.signInWithPassword({ email: fixture.email, password })
  assert.equal(error, null, `${fixture.email} should sign in with email and password`)
  assert.equal(data.user?.id, fixture.id)

  const { data: verified, error: verificationError } = await client.auth.getUser()
  assert.equal(verificationError, null, "session access token should validate with Auth")
  assert.equal(verified.user?.id, fixture.id)
  return client
}

const employee = await createUser("employee")
const manager = await createUser("manager")
const suspended = await createUser("suspended")

const { error: membershipError } = await admin.from("store_memberships").insert([
  {
    id: randomUUID(),
    store_id: storeId,
    user_id: employee.id,
    role_id: employeeRoleId,
    status: "active",
    joined_at: new Date().toISOString(),
  },
  {
    id: randomUUID(),
    store_id: storeId,
    user_id: manager.id,
    role_id: managerRoleId,
    status: "active",
    joined_at: new Date().toISOString(),
  },
  {
    id: randomUUID(),
    store_id: storeId,
    user_id: suspended.id,
    role_id: managerRoleId,
    status: "suspended",
    joined_at: new Date().toISOString(),
  },
])
if (membershipError) throw new Error(`Unable to create local membership fixtures: ${membershipError.message}`)

const invitationId = randomUUID()
const { error: invitationError } = await admin.from("staff_invitations").insert({
  id: invitationId,
  store_id: storeId,
  email: `candidate-${suffix}@local.test`,
  role_id: employeeRoleId,
  status: "pending",
  invited_by: manager.id,
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
})
if (invitationError) throw new Error(`Unable to create local invitation fixture: ${invitationError.message}`)

const employeeSession = await signIn(employee)
const managerSession = await signIn(manager)
const suspendedSession = await signIn(suspended)

const employeeInvitations = await employeeSession.from("staff_invitations").select("id")
assert.equal(employeeInvitations.error, null)
assert.equal(employeeInvitations.data?.length, 0, "employee must not see staff invitations")

const managerInvitations = await managerSession.from("staff_invitations").select("id").eq("id", invitationId)
assert.equal(managerInvitations.error, null)
assert.equal(managerInvitations.data?.length, 1, "manager permission should expose store invitations")

const suspendedStores = await suspendedSession.from("stores").select("id")
assert.equal(suspendedStores.error, null)
assert.equal(suspendedStores.data?.length, 0, "suspended membership must expose no active store")

const anonymous = createBrowserSession()
const anonymousStores = await anonymous.from("stores").select("id")
assert.ok(anonymousStores.error, "anonymous client must not receive store table access")

const { error: signOutError } = await employeeSession.auth.signOut({ scope: "local" })
assert.equal(signOutError, null)
const signedOutUser = await employeeSession.auth.getUser()
assert.equal(signedOutUser.data.user, null, "sign-out must remove the employee session")

console.log("Authenticated session checks passed: email/password, token validation, sign-out, employee/manager isolation, suspension, and anonymous denial.")
